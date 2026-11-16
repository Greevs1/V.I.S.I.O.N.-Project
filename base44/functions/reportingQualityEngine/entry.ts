/**
 * reportingQualityEngine — Phase 2B Engine
 *
 * Calculates the Reporting Quality Score™ (0-100) based on financial data quality signals.
 * This score feeds: Confidence Engine, Value IQ, Roll-Up Readiness, Portfolio IQ.
 *
 * Input:  { business_id } (optional; defaults to profile's primary business)
 * Output: { reporting_quality_score, sub_scores, confidence_impact, engine_meta }
 *
 * SAFETY: Read-only. Additive only.
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
    const { business_id } = body;

    const { data: profile } = await sb.from('profiles').select('id, primary_business_id').eq('email', user.email).maybeSingle();
    if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });
    const profileId = profile.id;
    // Phase 6.9B — canonical business resolution. Was `business_id || profile.primary_business_id`.
    const { businessId: bizId, denial: bizDenial } = await requireBusinessContext(
      sb, profile, business_id, 'reportingQualityEngine'
    );
    if (bizDenial) return bizDenial;

    const [docResult, extractedResult, assessResult, snapshotResult] = await Promise.allSettled([
      sb.from('documents').select('document_type, upload_status, year, created_at').eq('profile_id', profileId).order('created_at', { ascending: false }),
      sb.from('extracted_fields').select('field_name, review_status, field_category').eq('profile_id', profileId),
      sb.from('business_assessments').select('assessment_type, score, updated_at').eq('profile_id', profileId),
      sb.from('business_metric_snapshots').select('snapshot_date, annual_revenue, net_profit, ebitda').eq('profile_id', profileId).order('snapshot_date', { ascending: false }).limit(12),
    ]);

    const docs = docResult.status === 'fulfilled' ? (docResult.value?.data || []) : [];
    const extracted = extractedResult.status === 'fulfilled' ? (extractedResult.value?.data || []) : [];
    const assessments = assessResult.status === 'fulfilled' ? (assessResult.value?.data || []) : [];
    const snapshots = snapshotResult.status === 'fulfilled' ? (snapshotResult.value?.data || []) : [];

    const warnings = [];

    // ── Sub-score 1: Financial Timeliness (0-20) ──────────────────────────────
    // Checks if documents uploaded within last 18 months
    const eighteenMonthsAgo = new Date();
    eighteenMonthsAgo.setMonth(eighteenMonthsAgo.getMonth() - 18);
    const recentDocs = docs.filter(d => d.upload_status === 'completed' && new Date(d.created_at) > eighteenMonthsAgo);
    const timeliness_score = Math.min(20, recentDocs.length * 4);
    if (timeliness_score < 10) warnings.push('Financial documents are outdated or missing');

    // ── Sub-score 2: Reconciliation Quality (0-20) ────────────────────────────
    // Accepted vs pending extracted fields ratio
    const acceptedFields = extracted.filter(f => ['accepted', 'corrected'].includes(f.review_status));
    const totalExtracted = extracted.length;
    const reconciliationRatio = totalExtracted > 0 ? acceptedFields.length / totalExtracted : 0;
    const reconciliation_score = Math.round(reconciliationRatio * 20);
    if (reconciliationRatio < 0.5 && totalExtracted > 0) warnings.push('High proportion of unreviewed extracted fields');

    // ── Sub-score 3: Tax Return Consistency (0-15) ────────────────────────────
    const taxDocs = docs.filter(d => ['business_tax_return', 'personal_tax_return'].includes(d.document_type) && d.upload_status === 'completed');
    const taxYears = [...new Set(taxDocs.map(d => d.year).filter(Boolean))];
    const tax_score = Math.min(15, taxYears.length * 5);
    if (tax_score < 10) warnings.push('Missing tax returns reduce confidence in tax gap calculations');

    // ── Sub-score 4: Balance Sheet Accuracy (0-15) ────────────────────────────
    const balanceDocs = docs.filter(d => d.document_type === 'balance_sheet' && d.upload_status === 'completed');
    const balance_score = Math.min(15, balanceDocs.length * 7);
    if (balance_score === 0) warnings.push('No balance sheet documents found');

    // ── Sub-score 5: Recast Confidence (0-15) ────────────────────────────────
    const recastAssessment = assessments.find(a => a.assessment_type === 'recast_ebitda');
    const payrollDocs = docs.filter(d => d.document_type === 'payroll_report' && d.upload_status === 'completed');
    const recast_score = Math.min(15, (recastAssessment ? 8 : 0) + (payrollDocs.length > 0 ? 7 : 0));
    if (recast_score < 8) warnings.push('Recast EBITDA confidence is low without payroll or completed assessment');

    // ── Sub-score 6: Financial Statement Completeness (0-15) ──────────────────
    const REQUIRED_DOC_TYPES = ['profit_and_loss', 'balance_sheet', 'business_tax_return'];
    const presentTypes = new Set(docs.filter(d => d.upload_status === 'completed').map(d => d.document_type));
    const completedRequired = REQUIRED_DOC_TYPES.filter(t => presentTypes.has(t)).length;
    const completeness_score = Math.round((completedRequired / REQUIRED_DOC_TYPES.length) * 15);
    if (completeness_score < 10) warnings.push('Missing core financial documents (P&L, Balance Sheet, Tax Return)');

    const total = timeliness_score + reconciliation_score + tax_score + balance_score + recast_score + completeness_score;

    // Confidence impact: if total < 50, cap dependent metric confidence
    const confidence_cap = total >= 75 ? 95 : total >= 50 ? 70 : total >= 25 ? 50 : 30;
    const confidence_source = total >= 75 ? 'verified_financial_analysis'
      : total >= 50 ? 'assessment_plus_documents_plus_verification'
      : total >= 25 ? 'assessment_plus_documents'
      : 'assessment_only';

    // Phase 2F Evidence Object
    const evidence = [];
    const missingEvidence = [];
    let confidenceReason = 'insufficient_evidence';

    if (timeliness_score >= 10) {
      evidence.push({ type: 'documents', source: 'uploaded', count: recentDocs.length, verified: true, note: 'within 18 months' });
    } else {
      missingEvidence.push({ type: 'document', name: 'Recent financial documents (within 18 months)', priority: 'high' });
    }

    if (reconciliationRatio >= 0.5) {
      evidence.push({ type: 'extracted_fields', source: 'reviewed', accepted: acceptedFields.length, total: totalExtracted, verified: true });
    } else if (totalExtracted > 0) {
      missingEvidence.push({ type: 'extracted_fields', name: 'Reviewed extracted fields', priority: 'medium' });
    }

    if (tax_score >= 10) {
      evidence.push({ type: 'documents', source: 'tax_returns', years: taxYears.length, verified: true });
    } else {
      missingEvidence.push({ type: 'document', name: 'Business/Personal tax returns', priority: 'high' });
    }

    if (balance_score > 0) {
      evidence.push({ type: 'documents', source: 'balance_sheet', count: balanceDocs.length, verified: true });
    } else {
      missingEvidence.push({ type: 'document', name: 'Balance sheet documents', priority: 'high' });
    }

    if (recast_score >= 8) {
      evidence.push({ type: 'assessment', source: 'recast_ebitda', verified: !!recastAssessment });
      if (payrollDocs.length > 0) evidence.push({ type: 'documents', source: 'payroll_report', verified: true });
    } else {
      confidenceReason = 'recast_confidence_low';
    }

    if (completeness_score >= 10) {
      evidence.push({ type: 'documents', source: 'core_financials', complete: completedRequired, total: REQUIRED_DOC_TYPES.length, verified: true });
    }

    if (total >= 75) {
      confidenceReason = 'verified_financial_analysis';
    } else if (total >= 50) {
      confidenceReason = 'documents_reviewed';
    } else if (total >= 25) {
      confidenceReason = 'documents_uploaded';
    } else {
      confidenceReason = 'assessment_only';
    }

    const reporting_quality_score = engineOutput(
      total,
      'business',
      METHODOLOGY_VERSION,
      BENCHMARK_VERSION,
      evidence,
      confidence_cap,
      confidenceReason,
      missingEvidence,
      missingEvidence.length > 0 ? missingEvidence[0] : null,
      warnings,
      total >= 75
    );

    return Response.json({
      reporting_quality_score,
      sub_scores: {
        financial_timeliness: { score: timeliness_score, max: 20, label: 'Financial Timeliness' },
        reconciliation_quality: { score: reconciliation_score, max: 20, label: 'Reconciliation Quality' },
        tax_return_consistency: { score: tax_score, max: 15, label: 'Tax Return Consistency' },
        balance_sheet_accuracy: { score: balance_score, max: 15, label: 'Balance Sheet Accuracy' },
        recast_confidence: { score: recast_score, max: 15, label: 'Recast Confidence' },
        financial_completeness: { score: completeness_score, max: 15, label: 'Statement Completeness' },
      },
      confidence_impact: {
        confidence_cap,
        confidence_source,
        affects: ['value_iq', 'portfolio_iq', 'roll_up_readiness'],
        description: total < 50 ? 'Low reporting quality caps all dependent metric confidence scores' : 'Reporting quality allows full confidence calculation',
      },
      engine_meta: {
        profile_id: profileId,
        business_id: bizId,
        generated_at: new Date().toISOString(),
        warnings,
        methodology_version: METHODOLOGY_VERSION,
        benchmark_version: BENCHMARK_VERSION,
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});