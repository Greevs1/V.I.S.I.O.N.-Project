/**
 * ownershipConcentrationEngine — Phase 2B Engine
 *
 * Detects portfolio concentration risk when value/EBITDA/cash flow
 * is concentrated in a single business entity.
 *
 * Uses HHI (Herfindahl-Hirschman Index) methodology:
 * Concentration Index = Σ(Value Contribution %²)
 *
 * Risk Bands:
 *   Low:      < 0.20  (well-diversified)
 *   Moderate: 0.20 – 0.40
 *   High:     0.40 – 0.60
 *   Critical: > 0.60  (extreme single-entity dependence)
 *
 * SAFETY: Read-only. Portfolio-scoped. Additive only.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';

function engineOutput(value, scope, confidence_score, confidence_source, data_sources, calculation_method, warnings = [], requires_verification = false) {
  return { value, scope, confidence_score, confidence_source, data_sources, calculation_method, warnings, requires_verification };
}

function getRiskBand(hhiIndex) {
  if (hhiIndex < 0.20) return { band: 'low', label: 'Low', color: 'green', description: 'Portfolio is well-diversified across entities' };
  if (hhiIndex < 0.40) return { band: 'moderate', label: 'Moderate', color: 'yellow', description: 'Moderate concentration — monitor key entity performance' };
  if (hhiIndex < 0.60) return { band: 'high', label: 'High', color: 'orange', description: 'High concentration — one entity failure materially impacts portfolio' };
  return { band: 'critical', label: 'Critical', color: 'red', description: 'Critical concentration — portfolio almost entirely dependent on one entity' };
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
    const { entity_metrics } = body; // Optional: pre-computed per-business metrics

    const { data: profile } = await sb.from('profiles').select('id, primary_business_id').eq('email', user.email).maybeSingle();
    if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });
    const profileId = profile.id;

    const warnings = [];

    // Fetch ownership records
    const { data: ownershipRows, error: ownerErr } = await sb
      .from('business_owners')
      .select('business_id, ownership_percentage')
      .eq('profile_id', profileId);

    if (ownerErr || !ownershipRows || ownershipRows.length === 0) {
      // Single-business user — concentration is always Critical by definition (100% in one entity)
      const singleBizRisk = getRiskBand(1.0);
      return Response.json({
        concentration_index: engineOutput(1.0, 'portfolio', 50, 'assessment_only', ['business_owners'], 'HHI = Σ(contribution_pct²)', ['Single business — 100% concentration by definition'], false),
        risk_rating: singleBizRisk,
        entity_contributions: [],
        impacts: {
          freedom_analysis: 'High: single business is sole source of business equity contribution',
          roll_up_readiness: 'N/A: single entity — no portfolio diversification to assess',
          portfolio_iq: 'No portfolio IQ penalty for single-business users',
          exit_planning: 'Single exit event — no bundling opportunity',
        },
        engine_meta: {
          profile_id: profileId,
          note: 'Single-business user — concentration defaults to 100%. This is expected and does not trigger a penalty.',
          generated_at: new Date().toISOString(),
        }
      });
    }

    // Fetch entity metrics — use provided or pull from dashboard_metrics
    let metrics = entity_metrics;
    if (!metrics) {
      const bizIds = ownershipRows.map(r => r.business_id).filter(Boolean);
      const { data: dmRow } = await sb.from('dashboard_metrics').select('enterprise_value, net_profit, revenue, business_id').eq('profile_id', profileId).order('updated_at', { ascending: false }).limit(1).maybeSingle();
      const { data: bizRows } = await sb.from('business_entities').select('id, business_name').in('id', bizIds);

      // Phase 6.9B — this engine is PORTFOLIO-scoped (it reads every business the
      // actor owns) and read-only, so it never substitutes a business for a
      // business-scoped operation. The single profile-wide metrics row now
      // declares its own business; the profile's primary is only a last resort.
      const primaryId = dmRow?.business_id || profile.primary_business_id;
      metrics = bizIds.map(bizId => {
        const biz = (bizRows || []).find(b => b.id === bizId);
        const ownership = (ownershipRows.find(r => r.business_id === bizId)?.ownership_percentage ?? 100) / 100;
        const isPrimary = bizId === primaryId;
        return {
          business_id: bizId,
          business_name: biz?.business_name || bizId,
          enterprise_value: isPrimary ? (dmRow?.enterprise_value || null) : null,
          ebitda: isPrimary ? (dmRow?.net_profit || null) : null,
          cash_flow: isPrimary ? (dmRow?.net_profit || null) : null,
          ownership_pct: ownership,
        };
      });
    }

    // Apply ownership adjustments
    const adjustedMetrics = metrics.map(m => ({
      ...m,
      adj_ev: m.enterprise_value != null ? m.enterprise_value * m.ownership_pct : null,
      adj_ebitda: m.ebitda != null ? m.ebitda * m.ownership_pct : null,
      adj_cash_flow: m.cash_flow != null ? m.cash_flow * m.ownership_pct : null,
    }));

    // Calculate HHI for Enterprise Value (primary concentration metric)
    const totalAdjEV = adjustedMetrics.reduce((s, m) => s + (m.adj_ev || 0), 0);
    const totalAdjEBITDA = adjustedMetrics.reduce((s, m) => s + (m.adj_ebitda || 0), 0);
    const totalAdjCashFlow = adjustedMetrics.reduce((s, m) => s + (m.adj_cash_flow || 0), 0);

    const entity_contributions = adjustedMetrics.map(m => {
      const evContrib = totalAdjEV > 0 ? (m.adj_ev || 0) / totalAdjEV : (adjustedMetrics.length === 1 ? 1 : 0);
      const ebitdaContrib = totalAdjEBITDA > 0 ? (m.adj_ebitda || 0) / totalAdjEBITDA : (adjustedMetrics.length === 1 ? 1 : 0);
      const cashFlowContrib = totalAdjCashFlow > 0 ? (m.adj_cash_flow || 0) / totalAdjCashFlow : (adjustedMetrics.length === 1 ? 1 : 0);
      return {
        business_id: m.business_id,
        business_name: m.business_name,
        ownership_pct: Math.round(m.ownership_pct * 100),
        ev_contribution_pct: Math.round(evContrib * 100),
        ebitda_contribution_pct: Math.round(ebitdaContrib * 100),
        cash_flow_contribution_pct: Math.round(cashFlowContrib * 100),
        ev_contribution_sq: evContrib * evContrib, // for HHI
      };
    });

    // HHI = sum of squared contribution percentages
    const hhiIndex = entity_contributions.reduce((s, e) => s + e.ev_contribution_sq, 0);
    const riskBand = getRiskBand(hhiIndex);

    if (hhiIndex > 0.60) warnings.push('Critical concentration: single business failure could severely impact portfolio and freedom calculations');
    if (hhiIndex > 0.40) warnings.push('Consider diversification or structural protection (HoldCo, asset separation)');

    const hasMultipleBusinesses = adjustedMetrics.length > 1;
    const confScore = hasMultipleBusinesses ? 55 : 30;

    const concentration_index = engineOutput(
      Math.round(hhiIndex * 100) / 100,
      'portfolio',
      confScore,
      hasMultipleBusinesses ? 'assessment_plus_documents' : 'assessment_only',
      ['business_owners', 'dashboard_metrics', 'business_entities'],
      'HHI = Σ(adjusted_entity_ev_contribution_pct²)',
      warnings,
      riskBand.band !== 'low'
    );

    return Response.json({
      concentration_index,
      risk_rating: riskBand,
      hhi_index: Math.round(hhiIndex * 10000) / 10000,
      entity_contributions,
      impacts: {
        freedom_analysis: riskBand.band === 'critical' || riskBand.band === 'high'
          ? 'High impact: portfolio value is concentrated — single-entity risk directly threatens Freedom calculations'
          : 'Low impact: diversification provides buffer against single-entity failure',
        roll_up_readiness: riskBand.band === 'low' || riskBand.band === 'moderate'
          ? 'Positive: diversification supports roll-up strategy'
          : 'Caution: concentration must be addressed before roll-up positioning',
        portfolio_iq: riskBand.band === 'critical' ? 'Triggers Weakest-Link penalty in Portfolio IQ'
          : riskBand.band === 'high' ? 'Mild Portfolio IQ reduction'
          : 'No penalty',
        exit_planning: riskBand.band === 'low' ? 'Exit bundling opportunity — multiple assets'
          : 'Single exit event dominates — consider diversification',
      },
      dashboard_placement: 'Portfolio View — Portfolio Intelligence section',
      engine_meta: {
        profile_id: profileId,
        businesses_evaluated: adjustedMetrics.length,
        total_adj_ev: totalAdjEV || null,
        methodology: 'herfindahl_hirschman_index',
        generated_at: new Date().toISOString(),
        warnings,
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});