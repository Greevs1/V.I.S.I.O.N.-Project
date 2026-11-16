/**
 * protectionGapEngine — Phase 2B Engine
 *
 * Calculates Protection Gap using Weighted Exposure Deficit methodology.
 * Formula: Protection Gap = Σ(Exposure Score) - Σ(Coverage Score)
 *
 * Replaces the legacy "Max Coverage" approach.
 * Three independent layers: Profile, Business, Portfolio.
 *
 * SAFETY: Read-only. Additive only. Uses assessment data as primary source.
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
  stale_evidence = [],
  conflicting_evidence = [],
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
    stale_evidence,
    conflicting_evidence,
    recommended_next_evidence,
    warnings,
    advisor_verified,
  };
}

// Protection categories with default weights (importance multiplier)
const PROFILE_PROTECTION_CATEGORIES = [
  { key: 'life_insurance',      label: 'Life Insurance',     weight: 0.30 },
  { key: 'disability',          label: 'Disability',         weight: 0.25 },
  { key: 'umbrella',            label: 'Umbrella',           weight: 0.15 },
  { key: 'estate_plan',         label: 'Estate Plan',        weight: 0.20 },
  { key: 'personal_liability',  label: 'Personal Liability', weight: 0.10 },
];

const BUSINESS_PROTECTION_CATEGORIES = [
  { key: 'general_liability',   label: 'General Liability',  weight: 0.20 },
  { key: 'eo_insurance',        label: 'E&O',                weight: 0.20 },
  { key: 'workers_comp',        label: "Workers' Comp",      weight: 0.15 },
  { key: 'key_person',          label: 'Key Person',         weight: 0.20 },
  { key: 'cyber',               label: 'Cyber',              weight: 0.15 },
  { key: 'buy_sell_agreement',  label: 'Buy-Sell Agreement', weight: 0.10 },
];

const PORTFOLIO_PROTECTION_CATEGORIES = [
  { key: 'holdco_structure',     label: 'HoldCo Structure',    weight: 0.25 },
  { key: 'asset_separation',     label: 'Asset Separation',    weight: 0.20 },
  { key: 'real_estate_sep',      label: 'Real Estate Sep.',    weight: 0.20 },
  { key: 'ip_separation',        label: 'IP Separation',       weight: 0.15 },
  { key: 'cross_entity_exposure',label: 'Cross-Entity Exp.',   weight: 0.20 },
];

// Map assessment keys from assessment data to protection categories
function deriveProtectionCoverage(assessmentData, category) {
  // Currently assessments don't granularly score protection subcategories
  // We infer from operations_gap and freedom_assessment scores
  // Phase 2C will provide granular per-category inputs
  const base = assessmentData?.score ?? null;
  if (base === null) return null;
  // Normalize assessment score (0-100) to coverage ratio (0-1)
  return Math.min(1, (base / 100));
}

function calculateLayerGap(categories, assessmentData, warnings) {
  let totalExposure = 0;
  let totalCoverage = 0;
  const breakdown = [];

  for (const cat of categories) {
    const exposure = cat.weight * 100; // Exposure = full weight × 100 points
    const coverageRatio = deriveProtectionCoverage(assessmentData, cat.key);

    let coverage = 0;
    if (coverageRatio !== null) {
      coverage = coverageRatio * exposure;
    } else {
      warnings.push(`${cat.label}: no coverage data — assuming 0% coverage`);
    }

    const deficit = Math.max(0, exposure - coverage);
    totalExposure += exposure;
    totalCoverage += coverage;
    breakdown.push({
      category: cat.key,
      label: cat.label,
      weight: cat.weight,
      exposure_score: Math.round(exposure),
      coverage_score: Math.round(coverage),
      deficit: Math.round(deficit),
      coverage_pct: coverageRatio !== null ? Math.round(coverageRatio * 100) : null,
    });
  }

  const gap = Math.max(0, totalExposure - totalCoverage);
  const gap_pct = totalExposure > 0 ? Math.round((gap / totalExposure) * 100) : 0;

  return { total_exposure: Math.round(totalExposure), total_coverage: Math.round(totalCoverage), gap: Math.round(gap), gap_pct, breakdown };
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

    const { data: assessments } = await sb.from('business_assessments').select('assessment_type, score').eq('profile_id', profileId);
    const assessMap = (assessments || []).reduce((acc, a) => { acc[a.assessment_type] = a; return acc; }, {});

    const warnings = [];

    const profileLayer = calculateLayerGap(PROFILE_PROTECTION_CATEGORIES, assessMap['freedom_assessment'], warnings);
    const businessLayer = calculateLayerGap(BUSINESS_PROTECTION_CATEGORIES, assessMap['operations_gap'], warnings);
    // Portfolio layer — aggregate business deficits, not maximums
    const portfolioLayer = calculateLayerGap(PORTFOLIO_PROTECTION_CATEGORIES, null, warnings);

    // Total portfolio exposure deficit = sum of all layer deficits
    const total_exposure_deficit = profileLayer.gap + businessLayer.gap + portfolioLayer.gap;

    // Phase 2F Evidence Object
    const evidence = [];
    const missingEvidence = [];
    const staleEvidence = [];
    const conflictingEvidence = [];

    if (assessments && assessments.length > 0) {
      evidence.push({ type: 'assessment', source: 'business_assessments', authority_level: 'assessment', count: assessments.length, verified: false });
    } else {
      missingEvidence.push({ type: 'assessment', name: 'Protection gap assessments', priority: 'high' });
    }

    const hasAssessments = assessments && assessments.length > 0;
    const confScore = hasAssessments ? 50 : 30;
    const confSource = hasAssessments ? 'assessment_plus_documents' : 'assessment_only';
    const confidenceReason = hasAssessments ? 'assessment_based' : 'no_assessment_data';

    const profile_protection = engineOutput(
      profileLayer.gap_pct,
      'profile',
      METHODOLOGY_VERSION,
      BENCHMARK_VERSION,
      evidence,
      confScore,
      confidenceReason,
      missingEvidence,
      staleEvidence,
      conflictingEvidence,
      missingEvidence.length > 0 ? missingEvidence[0] : null,
      profileLayer.breakdown.filter(b => b.deficit > 0).map(b => `${b.label}: ${b.deficit}pt deficit`),
      confScore < 60
    );

    const business_protection = engineOutput(
      businessLayer.gap_pct,
      'business',
      METHODOLOGY_VERSION,
      BENCHMARK_VERSION,
      evidence,
      confScore,
      confidenceReason,
      missingEvidence,
      staleEvidence,
      conflictingEvidence,
      missingEvidence.length > 0 ? missingEvidence[0] : null,
      businessLayer.breakdown.filter(b => b.deficit > 0).map(b => `${b.label}: ${b.deficit}pt deficit`),
      confScore < 60
    );

    const portfolio_protection = engineOutput(
      portfolioLayer.gap_pct,
      'portfolio',
      METHODOLOGY_VERSION,
      BENCHMARK_VERSION,
      [],
      30,
      'no_data',
      [{ type: 'protection_data', name: 'Portfolio protection data', priority: 'critical' }],
      staleEvidence,
      conflictingEvidence,
      { type: 'advisor_verification', name: 'Advisor verification required', priority: 'critical' },
      ['Portfolio protection requires advisor verification', ...portfolioLayer.breakdown.filter(b => b.deficit > 0).map(b => `${b.label}: ${b.deficit}pt deficit`)],
      true
    );

    return Response.json({
      profile_protection,
      business_protection,
      portfolio_protection,
      layer_details: {
        profile: profileLayer,
        business: businessLayer,
        portfolio: portfolioLayer,
      },
      total_exposure_deficit,
      engine_meta: {
        profile_id: profileId,
        // Phase 6.9B — report the business actually used, never a primary substitute.
        business_id: business_id || null,
        methodology: 'weighted_exposure_deficit',
        note: 'Portfolio protection aggregates exposure deficits — strong coverage in one entity does NOT offset deficit in another',
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