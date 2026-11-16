/**
 * ownershipAdjustmentEngine — Phase 2B Engine
 *
 * Applies ownership percentages from business_owners junction table
 * to produce ownership-adjusted portfolio metrics.
 *
 * Input:  { profile_id, metrics: [{ business_id, enterprise_value, ebitda, cash_flow, value_gap }] }
 * Output: { adjusted_metrics, portfolio_totals, engine_meta }
 *
 * SAFETY: Read-only. Never modifies existing dashboard values.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';

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
    const { profile_id: inputProfileId, metrics: inputMetrics } = body;

    // Resolve profile
    const { data: profile } = await sb.from('profiles').select('id, primary_business_id').eq('email', user.email).maybeSingle();
    if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });
    const profileId = inputProfileId || profile.id;

    // Fetch all ownership records for this profile
    const { data: ownershipRows, error: ownerErr } = await sb
      .from('business_owners')
      .select('business_id, ownership_percentage, ownership_type, is_primary_owner')
      .eq('profile_id', profileId);

    if (ownerErr) {
      // business_owners table may not exist yet — return safe fallback
      console.warn('[ownershipAdjustmentEngine] business_owners query failed (non-fatal):', ownerErr.message);
      return Response.json({
        adjusted_metrics: [],
        portfolio_totals: engineOutput(null, 'portfolio', 0, 'assessment_only', [], 'ownership_adjusted_sum', ['business_owners table unavailable'], false),
        engine_meta: { profile_id: profileId, businesses_found: 0, ownership_records: 0, fallback: true }
      });
    }

    const ownershipMap = (ownershipRows || []).reduce((acc, row) => {
      acc[row.business_id] = {
        ownership_pct: row.ownership_percentage ?? 100,
        ownership_type: row.ownership_type || 'direct_individual',
        is_primary: row.is_primary_owner || false,
      };
      return acc;
    }, {});

    // Use provided metrics or fetch from dashboard_metrics/business_entities
    let businessMetrics = inputMetrics;
    if (!businessMetrics) {
      const bizIds = Object.keys(ownershipMap);
      if (bizIds.length === 0) {
        return Response.json({
          adjusted_metrics: [],
          portfolio_totals: engineOutput(null, 'portfolio', 0, 'assessment_only', [], 'ownership_adjusted_sum', ['no businesses found in ownership table'], false),
          engine_meta: { profile_id: profileId, businesses_found: 0, ownership_records: 0 }
        });
      }

      // Fetch business metric data from dashboard_metrics (profile-scoped) and business_entities
      const { data: dmRow } = await sb.from('dashboard_metrics').select('enterprise_value, recast_ebitda, net_profit, revenue').eq('profile_id', profileId).order('updated_at', { ascending: false }).limit(1).maybeSingle();
      const { data: bizRows } = await sb.from('business_entities').select('id, business_name').in('id', bizIds);

      businessMetrics = bizIds.map(bizId => {
        const biz = (bizRows || []).find(b => b.id === bizId);
        // For single-business users, pull from dashboard_metrics
        const isSingleBiz = bizIds.length === 1;
        return {
          business_id: bizId,
          business_name: biz?.business_name || bizId,
          enterprise_value: isSingleBiz ? (dmRow?.enterprise_value || null) : null,
          ebitda: isSingleBiz ? (dmRow?.recast_ebitda || null) : null,
          cash_flow: isSingleBiz ? (dmRow?.net_profit || null) : null,
          value_gap: null,
          source: isSingleBiz ? 'dashboard_metrics' : 'assessment_only',
        };
      });
    }

    // Apply ownership adjustments
    const warnings = [];
    let totalAdjEV = 0, totalAdjEBITDA = 0, totalAdjCashFlow = 0, totalAdjValueGap = 0;
    let hasAnyValue = false;
    let minConfidence = 100;

    const adjusted_metrics = (businessMetrics || []).map(m => {
      const ownership = ownershipMap[m.business_id];
      const pct = ownership ? ownership.ownership_pct / 100 : 1.0;

      if (!ownership) {
        warnings.push(`business_id ${m.business_id}: no ownership record found, assuming 100%`);
      }

      const adjEV = m.enterprise_value != null ? m.enterprise_value * pct : null;
      const adjEBITDA = m.ebitda != null ? m.ebitda * pct : null;
      const adjCashFlow = m.cash_flow != null ? m.cash_flow * pct : null;
      const adjValueGap = m.value_gap != null ? m.value_gap * pct : null;

      if (adjEV != null) { totalAdjEV += adjEV; hasAnyValue = true; }
      if (adjEBITDA != null) { totalAdjEBITDA += adjEBITDA; }
      if (adjCashFlow != null) { totalAdjCashFlow += adjCashFlow; }
      if (adjValueGap != null) { totalAdjValueGap += adjValueGap; }

      // Confidence: if no document source, cap at assessment_only
      const conf = m.source === 'verified_financial' ? 85 : m.source === 'advisor_review' ? 70 : m.source === 'dashboard_metrics' ? 50 : 30;
      if (conf < minConfidence) minConfidence = conf;

      return {
        business_id: m.business_id,
        business_name: m.business_name || m.business_id,
        ownership_pct: pct * 100,
        raw: {
          enterprise_value: m.enterprise_value,
          ebitda: m.ebitda,
          cash_flow: m.cash_flow,
          value_gap: m.value_gap,
        },
        adjusted: {
          enterprise_value: adjEV,
          ebitda: adjEBITDA,
          cash_flow: adjCashFlow,
          value_gap: adjValueGap,
        },
        source: m.source || 'assessment_only',
      };
    });

    const confSource = minConfidence >= 85 ? 'verified_financial_analysis'
      : minConfidence >= 70 ? 'assessment_plus_documents_plus_verification'
      : minConfidence >= 50 ? 'assessment_plus_documents'
      : 'assessment_only';

    // Phase 2F Evidence Object for portfolio totals
    const evidence = [];
    const missingEvidence = [];
    let confidenceReason = 'insufficient_evidence';

    if (ownershipRows && ownershipRows.length > 0) {
      evidence.push({ type: 'ownership_data', source: 'business_owners', records: ownershipRows.length, verified: true });
    } else {
      missingEvidence.push({ type: 'ownership_data', name: 'business_owners records', priority: 'critical' });
      confidenceReason = 'no_ownership_data';
    }

    if (hasAnyValue) {
      evidence.push({ type: 'valuation_data', source: 'dashboard_metrics', businesses: adjusted_metrics.length, verified: true });
      confidenceReason = confSource;
    } else {
      missingEvidence.push({ type: 'valuation_data', name: 'Enterprise value data', priority: 'critical' });
    }

    const portfolio_totals = {
      enterprise_value: engineOutput(
        hasAnyValue ? totalAdjEV : null,
        'portfolio',
        METHODOLOGY_VERSION,
        BENCHMARK_VERSION,
        evidence,
        minConfidence,
        confidenceReason,
        missingEvidence,
        missingEvidence.length > 0 ? missingEvidence[0] : null,
        warnings,
        minConfidence >= 85
      ),
      ebitda: engineOutput(totalAdjEBITDA || null, 'portfolio', METHODOLOGY_VERSION, BENCHMARK_VERSION, evidence, minConfidence, confidenceReason, missingEvidence, null, warnings, minConfidence >= 85),
      cash_flow: engineOutput(totalAdjCashFlow || null, 'portfolio', METHODOLOGY_VERSION, BENCHMARK_VERSION, evidence, minConfidence, confidenceReason, missingEvidence, null, warnings, minConfidence >= 85),
      value_gap: engineOutput(totalAdjValueGap || null, 'portfolio', METHODOLOGY_VERSION, BENCHMARK_VERSION, evidence, minConfidence, confidenceReason, missingEvidence, null, warnings, minConfidence >= 85),
    };

    return Response.json({
      adjusted_metrics,
      portfolio_totals,
      engine_meta: {
        profile_id: profileId,
        businesses_found: adjusted_metrics.length,
        ownership_records: ownershipRows?.length || 0,
        warnings,
        generated_at: new Date().toISOString(),
        methodology_version: METHODOLOGY_VERSION,
        benchmark_version: BENCHMARK_VERSION,
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});