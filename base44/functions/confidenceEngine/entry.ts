/**
 * confidenceEngine — Phase 2B Engine
 *
 * Calculates a confidence score (0-100) and confidence_source for any given metric.
 * Evaluates data quality across assessments, documents, and advisor verification.
 *
 * Input:  { profile_id, business_id, metrics: ['profit_gap', 'value_gap', ...] }
 * Output: { confidence_scores: { [metric_name]: engineOutput }, overall_confidence, data_completeness }
 *
 * SAFETY: Read-only. Additive only — never modifies existing values.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireBusinessContext } from '../../shared/businessScope/activeBusiness.ts';

// Phase 2F Evidence Object™ — Universal Engine Contract
const METHODOLOGY_VERSION = '2026.06.25';
const BENCHMARK_VERSION = '2026.06.25';

function engineOutput(
  result,
  scope,
  methodology_version = METHODOLOGY_VERSION,
  benchmark_version = BENCHMARK_VERSION,
  evidence = [],
  confidence_score = 50,
  confidence_reason = 'insufficient_evidence',
  missing_evidence = [],
  recommended_next_evidence = null,
  warnings = [],
  advisor_verified = false
) {
  return {
    result,
    scope,
    methodology_version,
    benchmark_version,
    evidence,
    confidence_score,
    confidence_reason,
    missing_evidence,
    recommended_next_evidence,
    warnings,
    advisor_verified,
  };
}

// Phase 2F Confidence Tier Thresholds (deterministic)
const CONFIDENCE_TIERS = {
  ASSESSMENT_ONLY: { score: 30, label: 'assessment_only' },
  ASSESSMENT_PLUS_DOCUMENTS: { score: 60, label: 'assessment_plus_documents' },
  ASSESSMENT_PLUS_DOCUMENTS_PLUS_VERIFICATION: { score: 85, label: 'assessment_plus_documents_plus_verification' },
  VERIFIED_FINANCIAL_ANALYSIS: { score: 95, label: 'verified_financial_analysis' },
  EXPERT_VERIFIED: { score: 100, label: 'expert_verified' },
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SERVICE_KEY) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    const body = await req.json().catch(() => ({}));
    const { business_id, metrics: requestedMetrics } = body;

    // Resolve profile
    const { data: profile } = await sb.from('profiles').select('id, primary_business_id').eq('email', user.email).maybeSingle();
    if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });
    const profileId = profile.id;
    // Phase 6.9B — canonical business resolution. Was `business_id || profile.primary_business_id`.
    const { businessId: bizId, denial: bizDenial } = await requireBusinessContext(
      sb, profile, business_id, 'confidenceEngine'
    );
    if (bizDenial) return bizDenial;

    // Fetch data quality signals in parallel
    const [assessResult, docResult, extractedResult, verifiedResult] = await Promise.allSettled([
      sb.from('business_assessments').select('assessment_type, score, updated_at').eq('profile_id', profileId),
      sb.from('documents').select('document_type, upload_status, year').eq('profile_id', profileId).eq('upload_status', 'completed'),
      sb.from('extracted_fields').select('field_name, review_status, reviewed_at').eq('profile_id', profileId).in('review_status', ['accepted', 'corrected']),
      sb.from('value_creation_events').select('id, status').eq('business_id', bizId).eq('status', 'verified'),
    ]);

    const assessments = assessResult.status === 'fulfilled' ? (assessResult.value?.data || []) : [];
    const documents = docResult.status === 'fulfilled' ? (docResult.value?.data || []) : [];
    const extractedFields = extractedResult.status === 'fulfilled' ? (extractedResult.value?.data || []) : [];
    const verifiedEvents = verifiedResult.status === 'fulfilled' ? (verifiedResult.value?.data || []) : [];

    const assessmentMap = assessments.reduce((acc, a) => { acc[a.assessment_type] = a; return acc; }, {});
    const docTypes = new Set(documents.map(d => d.document_type));
    const hasVerifiedFields = extractedFields.length > 0;
    const hasVerifiedWins = verifiedEvents.length > 0;
    const hasAdvisorVerification = hasVerifiedWins;

    // Confidence calculation per metric
    const METRIC_DOC_REQUIREMENTS = {
      profit_gap: ['profit_and_loss'],
      value_gap: ['profit_and_loss', 'balance_sheet'],
      tax_gap: ['business_tax_return', 'personal_tax_return'],
      operations_gap: [],
      recast_ebitda: ['profit_and_loss', 'payroll_report'],
      enterprise_value: ['profit_and_loss', 'balance_sheet'],
      freedom: ['personal_tax_return'],
      protection_gap: [],
      reporting_quality: ['profit_and_loss', 'balance_sheet', 'business_tax_return'],
    };

    const calculateMetricConfidence = (metricName) => {
      const hasAssessment = !!assessmentMap[metricName];
      const requiredDocs = METRIC_DOC_REQUIREMENTS[metricName] || [];
      const hasDocs = requiredDocs.length === 0 || requiredDocs.some(dt => docTypes.has(dt));
      const hasExtracted = hasVerifiedFields;

      let tier = 'assessment_only';
      let score = 0;
      const warnings = [];

      if (!hasAssessment) {
        warnings.push(`No ${metricName} assessment found`);
        score = 15;
        tier = 'assessment_only';
      } else if (!hasDocs && requiredDocs.length > 0) {
        score = CONFIDENCE_TIERS.assessment_only;
        tier = 'assessment_only';
        warnings.push(`Missing documents: ${requiredDocs.filter(d => !docTypes.has(d)).join(', ')}`);
      } else if (hasDocs && !hasExtracted) {
        score = CONFIDENCE_TIERS.assessment_plus_documents;
        tier = 'assessment_plus_documents';
      } else if (hasDocs && hasExtracted && !hasAdvisorVerification) {
        score = CONFIDENCE_TIERS.assessment_plus_documents_plus_verification - 10;
        tier = 'assessment_plus_documents';
      } else if (hasDocs && hasExtracted && hasAdvisorVerification) {
        score = CONFIDENCE_TIERS.verified_financial_analysis;
        tier = 'verified_financial_analysis';
      } else {
        score = CONFIDENCE_TIERS.assessment_only;
        tier = 'assessment_only';
      }

      // Phase 2F Evidence Object
      const evidence = [];
      const missingEvidence = [];
      let confidenceReason = 'insufficient_evidence';

      if (hasAssessment) {
        evidence.push({ type: 'assessment', source: metricName, field: 'score', verified: false });
      } else {
        missingEvidence.push({ type: 'assessment', name: `${metricName} assessment`, priority: 'critical' });
        confidenceReason = 'no_assessment';
      }

      if (hasDocs) {
        evidence.push({ type: 'documents', source: 'uploaded', count: requiredDocs.filter(d => docTypes.has(d)).length, verified: true });
      } else if (requiredDocs.length > 0) {
        missingEvidence.push(...requiredDocs.filter(d => !docTypes.has(d)).map(d => ({ type: 'document', name: d, priority: 'high' })));
        confidenceReason = 'no_documents';
      }

      if (hasExtractedFields) {
        evidence.push({ type: 'extracted_fields', source: 'reviewed', count: extractedFields.length, verified: true });
        if (hasAdvisorVerification) {
          evidence.push({ type: 'advisor_verification', source: 'value_creation_events', verified: true });
          confidenceReason = 'advisor_verified';
        } else {
          confidenceReason = 'documents_reviewed';
        }
      } else if (hasDocs) {
        confidenceReason = 'documents_uploaded_not_reviewed';
      }

      return engineOutput(
        score,
        metricName === 'freedom' ? 'profile' : 'business',
        METHODOLOGY_VERSION,
        BENCHMARK_VERSION,
        evidence,
        score,
        confidenceReason,
        missingEvidence,
        missingEvidence.length > 0 ? missingEvidence[0] : null,
        warnings,
        score >= 85
      );
    };

    const ALL_METRICS = ['profit_gap', 'value_gap', 'tax_gap', 'operations_gap', 'recast_ebitda', 'enterprise_value', 'freedom', 'protection_gap', 'reporting_quality'];
    const targetMetrics = requestedMetrics || ALL_METRICS;

    const confidence_scores = {};
    for (const m of targetMetrics) {
      confidence_scores[m] = calculateMetricConfidence(m);
    }

    const scoreValues = Object.values(confidence_scores).map(v => v.confidence_score);
    const overall_confidence = scoreValues.length > 0 ? Math.round(scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length) : 0;

    const data_completeness = {
      assessments_completed: assessments.length,
      assessments_possible: 6,
      documents_verified: documents.length,
      fields_extracted: extractedFields.length,
      advisor_verified_events: verifiedEvents.length,
      has_verified_financials: hasVerifiedFields,
    };

    return Response.json({
      confidence_scores,
      overall_confidence,
      data_completeness,
      tiers: CONFIDENCE_TIERS,
      engine_meta: {
        profile_id: profileId,
        business_id: bizId,
        generated_at: new Date().toISOString(),
        methodology_version: METHODOLOGY_VERSION,
        benchmark_version: BENCHMARK_VERSION,
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});