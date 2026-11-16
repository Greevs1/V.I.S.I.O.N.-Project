/**
 * profitIqEngine — Phase 2B Engine
 *
 * Calculates the benchmark-normalized Profit IQ Score.
 * Formula: Profit IQ Score = Actual Margin / Industry Benchmark Margin
 *
 * Does NOT aggregate raw margins.
 * Portfolio summary = ownership-weighted Profit IQ scores only.
 *
 * SAFETY: Read-only. Additive only.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireBusinessContext } from '../../shared/businessScope/activeBusiness.ts';

/**
 * Phase 2F Evidence Object™ — Universal Engine Contract
 *
 * Every engine returns this structure for traceability and explainability.
 * AI explains/synthesizes; deterministic calculations produce results.
 */
const METHODOLOGY_VERSION = '2026.06.25';

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

/**
 * Phase 2F Benchmark Library v2026.06.25
 * Industry Net Profit Margin Benchmarks (median %)
 * Source: Structured benchmark data (NOT Knowledge Base)
 */
const BENCHMARK_VERSION = '2026.06.25';
const INDUSTRY_BENCHMARKS = {
  'technology': 0.18, 'software': 0.20, 'saas': 0.22,
  'healthcare': 0.08, 'medical': 0.10, 'dental': 0.15,
  'retail': 0.05, 'ecommerce': 0.07, 'manufacturing': 0.07,
  'construction': 0.05, 'real_estate': 0.12,
  'professional_services': 0.15, 'consulting': 0.20,
  'legal': 0.18, 'accounting': 0.18, 'financial_services': 0.20,
  'restaurant': 0.04, 'food_beverage': 0.06,
  'trucking': 0.05, 'logistics': 0.06,
  'marketing': 0.12, 'advertising': 0.10,
  'staffing': 0.05, 'insurance': 0.10,
  'fitness': 0.10, 'education': 0.10,
  'default': 0.10,
};

function getBenchmarkMargin(industry) {
  if (!industry) return { margin: INDUSTRY_BENCHMARKS.default, matched: false, key: 'default' };
  const lower = industry.toLowerCase().replace(/[^a-z_]/g, '_');
  for (const [key, margin] of Object.entries(INDUSTRY_BENCHMARKS)) {
    if (lower.includes(key) || key.includes(lower.split('_')[0])) {
      return { margin, matched: true, key };
    }
  }
  return { margin: INDUSTRY_BENCHMARKS.default, matched: false, key: 'default' };
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
      sb, profile, business_id, 'profitIqEngine'
    );
    if (bizDenial) return bizDenial;

    // Fetch business entity for industry
    const { data: bizEntity } = bizId
      ? await sb.from('business_entities').select('id, business_name, industry').eq('id', bizId).maybeSingle()
      : { data: null };

    // Fetch financial data — prefer verified/extracted fields over assessment
    const { data: dmRow } = await sb.from('dashboard_metrics').select('revenue, net_profit, industry').eq('profile_id', profileId).order('updated_at', { ascending: false }).limit(1).maybeSingle();
    const { data: latestSnap } = await sb.from('business_metric_snapshots').select('annual_revenue, net_profit, ebitda').eq('profile_id', profileId).order('snapshot_date', { ascending: false }).limit(1).maybeSingle();
    const { data: assessments } = await sb.from('business_assessments').select('assessment_type, score, estimated_opportunity_value').eq('profile_id', profileId).eq('assessment_type', 'profit_gap').maybeSingle();

    const warnings = [];

    // Resolve industry
    const industry = bizEntity?.industry || dmRow?.industry || null;
    if (!industry) warnings.push('No industry set — using default benchmark margin of 10%');

    const { margin: benchmarkMargin, matched: benchmarkMatched, key: benchmarkKey } = getBenchmarkMargin(industry);
    if (!benchmarkMatched && industry) warnings.push(`Industry "${industry}" not in benchmark table — using default 10%`);

    // Resolve actual margin
    const revenue = latestSnap?.annual_revenue || dmRow?.revenue || null;
    const netProfit = latestSnap?.net_profit || dmRow?.net_profit || null;

    let actualMargin = null;
    let marginSource = null;

    if (revenue && netProfit && revenue > 0) {
      actualMargin = netProfit / revenue;
      marginSource = latestSnap?.annual_revenue ? 'metric_snapshot' : 'dashboard_metrics';
    } else if (assessments?.score) {
      // Fallback: derive approximate margin from assessment score
      actualMargin = (assessments.score / 100) * benchmarkMargin * 1.5;
      marginSource = 'assessment_derived';
      warnings.push('Actual margin derived from assessment score — upload P&L for accuracy');
    }

    if (actualMargin === null) {
      warnings.push('No financial data available — Profit IQ cannot be calculated');
    }

    // Profit IQ Score = actual / benchmark (capped at 1.5 = 150% = exceptional)
    const rawIqScore = actualMargin !== null ? actualMargin / benchmarkMargin : null;
    const profitIqScore = rawIqScore !== null ? Math.min(1.5, Math.max(0, rawIqScore)) : null;
    // Normalize to 0-100 display scale (1.0 = 67, 1.5 = 100)
    const displayScore = profitIqScore !== null ? Math.round((profitIqScore / 1.5) * 100) : null;

    // Phase 2F Evidence Object
    const evidence = [];
    const missingEvidence = [];
    let confidenceReason = 'insufficient_evidence';

    if (hasFinancials) {
      evidence.push({ type: 'financial_statement', source: marginSource, fields: ['revenue', 'net_profit'], verified: true });
      confidenceReason = 'financial_data_verified';
    } else if (marginSource === 'assessment_derived') {
      evidence.push({ type: 'assessment', source: 'profit_gap', field: 'score', verified: false });
      missingEvidence.push({ type: 'financial_statement', name: 'P&L statement', priority: 'high' });
      confidenceReason = 'assessment_derived_no_financials';
    } else {
      missingEvidence.push({ type: 'financial_statement', name: 'revenue data', priority: 'critical' });
      missingEvidence.push({ type: 'financial_statement', name: 'net_profit data', priority: 'critical' });
      confidenceReason = 'no_financial_data';
    }

    if (!industry) {
      evidence.push({ type: 'benchmark', source: 'default', value: '10% margin', verified: true, note: 'Industry not set' });
    } else if (!benchmarkMatched) {
      evidence.push({ type: 'benchmark', source: 'default', value: '10% margin', verified: true, note: `Industry "${industry}" not matched` });
    } else {
      evidence.push({ type: 'benchmark', source: 'industry_benchmark_table', key: benchmarkKey, value: benchmarkMargin, verified: true });
    }

    const profit_iq = engineOutput(
      displayScore,
      'business',
      '2026.06.25',
      BENCHMARK_VERSION,
      evidence,
      confScore,
      confidenceReason,
      missingEvidence,
      missingEvidence.length > 0 ? missingEvidence[0] : null,
      warnings,
      confScore >= 85
    );

    return Response.json({
      profit_iq,
      calculation_detail: {
        actual_margin: actualMargin !== null ? Math.round(actualMargin * 10000) / 100 : null,
        benchmark_margin: Math.round(benchmarkMargin * 10000) / 100,
        raw_ratio: rawIqScore !== null ? Math.round(rawIqScore * 100) / 100 : null,
        display_score: displayScore,
        industry,
        benchmark_key: benchmarkKey,
        benchmark_matched: benchmarkMatched,
        margin_source: marginSource,
      },
      aggregation_rule: {
        business_view: 'Use Profit IQ Score per entity — never aggregate raw margins',
        portfolio_view: 'Portfolio Profit IQ = Σ(Entity Profit IQ × ownership_pct)',
        prohibited: 'Raw margin aggregation across different industries is forbidden',
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