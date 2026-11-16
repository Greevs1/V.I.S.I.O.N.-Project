/**
 * calculateFreedomAcceleration — Freedom Acceleration Engine™
 *
 * ADDITIVE LAYER ONLY. Does not modify any existing freedom calculations.
 *
 * Uses the existing calcFreedomScore / calculateFreedomPaths methodology
 * as the source of truth. Applies projected strategy outcomes on top of
 * existing baseline data to estimate acceleration.
 *
 * Actions:
 *   projectSingle   — project freedom acceleration for one source (strategy, expansion, roadmap_item)
 *   projectScenario — project combined acceleration for a stack of sources
 *   getProjections  — read stored projections for a business
 *   getSummary      — top accelerator + best stack summary
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireBusinessContext } from '../../shared/businessScope/activeBusiness.ts';
import { validateBusinessScope } from '../../shared/businessScope/writeGuard.ts';

// ── Core formula — mirrors calculateFreedomPaths/calcFreedomScore logic ──────
// Inputs: financial baseline + incremental annual improvements
// Returns: { yearsToFreedom, freedomDate, accelerationMonths }
function computeYearsToFreedom({
  investableAssets = 0,
  currentBusinessValue = 0,
  annualSavingsRate = 0,
  targetWealth = 5000000,
  additionalAnnualCashFlow = 0,  // tax savings + profit improvement (annual)
  additionalBusinessValue = 0,   // value increase (lump sum at business exit ~yr 10)
  investmentReturnRate = 0.07,
}) {
  const PMT = annualSavingsRate + additionalAnnualCashFlow;
  const PV  = investableAssets;
  const r   = investmentReturnRate;
  const exitValue = currentBusinessValue + additionalBusinessValue;

  let accumulated = PV;
  let year = 0;
  while (accumulated < targetWealth && year < 50) {
    accumulated = accumulated * (1 + r) + PMT;
    if (year === 10) accumulated += exitValue;
    year++;
  }
  return Math.min(50, year);
}

function freedomDateFromYears(years) {
  const d = new Date();
  d.setFullYear(d.getFullYear() + Math.round(Math.max(0, years)));
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// ── Derive baseline from existing Supabase data ──────────────────────────────
async function loadBaseline(sb, profileId, businessId) {
  const [dashR, snapR, assessR, finR] = await Promise.allSettled([
    sb.from('dashboard_metrics').select('*').eq('profile_id', profileId).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    sb.from('business_metric_snapshots').select('*').eq('profile_id', profileId).order('snapshot_date', { ascending: false }).limit(1).maybeSingle(),
    sb.from('business_assessments').select('assessment_type, score, estimated_opportunity_value, data').eq('profile_id', profileId),
    sb.from('profile_financials').select('*').eq('profile_id', profileId).maybeSingle(),
  ]);

  const sv = (s, fb = null) => s.status === 'fulfilled' ? (s.value?.data ?? fb) : fb;
  const dash   = sv(dashR);
  const snap   = sv(snapR);
  const assmts = sv(assessR, []);
  const fin    = sv(finR);

  const byType = (assmts || []).reduce((a, r) => { a[r.assessment_type] = r; return a; }, {});

  const revenue = snap?.annual_revenue || dash?.revenue || 0;
  const netProfit = snap?.net_profit || dash?.net_profit || revenue * 0.15;
  const ebitda = snap?.ebitda || dash?.recast_ebitda || dash?.ebitda || netProfit;

  // Freedom number — from freedom assessment or 25x annual expenses (4% rule)
  const fromFreedomAssmt = byType['freedom_assessment']?.data?.target_freedom_number;
  const desiredRetirementIncome = byType['freedom_assessment']?.data?.f_desired_retirement_income || 10000;
  const targetWealth = fromFreedomAssmt || (desiredRetirementIncome * 12 * 25) || 3000000;

  // Current investable assets — from profile_financials or snapshot
  const investableAssets = fin?.investable_assets || snap?.investable_assets || snap?.cash_on_hand || revenue * 0.1;

  // Current net worth excl. business — from assessment inputs or profile_financials
  const personalNetWorth = byType['freedom_assessment']?.data?.f_net_worth || fin?.net_worth || investableAssets;

  // Current business value
  const mult = dash?.value_gap?.current_value ? (dash.value_gap.current_value / (ebitda || 1)) : 4;
  const currentBusinessValue = snap?.current_business_value || dash?.enterprise_value || ebitda * mult;

  // Annual savings rate — from profit or explicit
  const annualSavingsRate = fin?.annual_savings_rate ? (fin.annual_savings_rate * revenue) : Math.max(0, netProfit * 0.3);

  // Existing freedom score (from assessment)
  const existingFreedomScore = byType['freedom_assessment']?.score || dash?.freedom_score || null;

  // Existing freedom date (from assessment)
  const existingFreedomDate = byType['freedom_assessment']?.data?.freedom_date || null;

  // Existing years to freedom
  const baseYears = computeYearsToFreedom({
    investableAssets,
    currentBusinessValue,
    annualSavingsRate,
    targetWealth,
  });

  return {
    revenue,
    netProfit,
    ebitda,
    targetWealth,
    investableAssets,
    personalNetWorth,
    currentBusinessValue,
    annualSavingsRate,
    baseYears,
    existingFreedomScore,
    existingFreedomDate,
    taxGapAmount: byType['tax_gap']?.estimated_opportunity_value || 0,
    profitGapAmount: byType['profit_gap']?.estimated_opportunity_value || 0,
    valueGapAmount: byType['value_gap']?.estimated_opportunity_value || 0,
    cashFlowGapAmount: byType['operations_gap']?.estimated_opportunity_value || 0,
    dataConfidence: snap ? 'high' : (Object.keys(byType).length >= 3 ? 'medium' : 'low'),
  };
}

// ── Project a single source's freedom acceleration ───────────────────────────
function projectAcceleration(baseline, projectedImpacts) {
  const {
    projected_tax_impact = 0,
    projected_profit_impact = 0,
    projected_value_impact = 0,
    projected_cash_flow_impact = 0,   // monthly → convert to annual
    projected_wealth_impact = 0,
    freedom_acceleration_months = null, // override if expansion engine already estimated
  } = projectedImpacts;

  // Annual cash flow improvement = tax savings + profit + annualized cash_flow
  const annualCashFlowImprovement =
    (projected_tax_impact || 0) +
    (projected_profit_impact || 0) +
    ((projected_cash_flow_impact || 0) * 12);

  // Value/wealth impact applies at business exit
  const businessValueImprovement = (projected_value_impact || 0) + (projected_wealth_impact || 0);

  // If the expansion engine already estimated freedom acceleration months, use it as a floor
  const engineEstimate = freedom_acceleration_months || 0;

  // Compute new years to freedom with improvements applied
  const newYears = computeYearsToFreedom({
    investableAssets: baseline.investableAssets,
    currentBusinessValue: baseline.currentBusinessValue,
    annualSavingsRate: baseline.annualSavingsRate,
    targetWealth: baseline.targetWealth,
    additionalAnnualCashFlow: annualCashFlowImprovement,
    additionalBusinessValue: businessValueImprovement,
  });

  const rawAccelerationYears = Math.max(0, baseline.baseYears - newYears);
  const rawAccelerationMonths = Math.round(rawAccelerationYears * 12);

  // Use max of computed vs. expansion-engine estimate (trust client data but floor at engine estimate)
  const freedomAccelerationMonths = Math.max(engineEstimate, rawAccelerationMonths);

  const projectedYears = Math.max(1, baseline.baseYears - freedomAccelerationMonths / 12);
  const projectedFreedomDate = freedomDateFromYears(projectedYears);
  const currentFreedomDate = baseline.existingFreedomDate || freedomDateFromYears(baseline.baseYears);

  // Freedom score delta: 1 pt per 3 months of acceleration (soft estimate, capped at +20)
  const freedomScoreDelta = Math.min(20, Math.round(freedomAccelerationMonths / 3));
  const currentFreedomScore = baseline.existingFreedomScore || 50;
  const projectedFreedomScore = Math.min(100, currentFreedomScore + freedomScoreDelta);

  // Confidence: based on data quality + how much impact is assumed vs. confirmed
  const hasDirectImpact = (projected_tax_impact || projected_profit_impact || projected_value_impact) > 0;
  const baseConfidence = baseline.dataConfidence === 'high' ? 70 : baseline.dataConfidence === 'medium' ? 55 : 40;
  const impactBonus = hasDirectImpact ? 15 : 0;
  const confidence = Math.min(90, baseConfidence + impactBonus);

  return {
    current_freedom_score: currentFreedomScore,
    projected_freedom_score: projectedFreedomScore,
    freedom_score_change: freedomScoreDelta,
    current_freedom_date: currentFreedomDate,
    projected_freedom_date: projectedFreedomDate,
    freedom_acceleration_months: freedomAccelerationMonths,
    projected_profit_impact: projected_profit_impact || null,
    projected_tax_impact: projected_tax_impact || null,
    projected_value_impact: projected_value_impact || null,
    projected_cash_flow_impact: projected_cash_flow_impact || null,
    projected_wealth_impact: projected_wealth_impact || null,
    confidence_score: confidence,
    assumptions: buildAssumptions(baseline, projectedImpacts),
    why_this_moves_freedom: buildNarrative(baseline, projectedImpacts, freedomAccelerationMonths),
  };
}

function buildAssumptions(baseline, impacts) {
  const assumptions = [];
  if (baseline.dataConfidence !== 'high') assumptions.push('Financial baseline estimated from assessment data (not verified documents)');
  if (!baseline.existingFreedomScore) assumptions.push('Freedom score not yet assessed — using platform average');
  if (impacts.projected_tax_impact) assumptions.push(`Tax savings of $${impacts.projected_tax_impact.toLocaleString()}/yr assumed to be retained and invested`);
  if (impacts.projected_profit_impact) assumptions.push(`Profit improvement of $${impacts.projected_profit_impact.toLocaleString()}/yr assumed to be redirected to wealth building`);
  if (impacts.projected_value_impact) assumptions.push(`Business value increase of $${(impacts.projected_value_impact / 1000).toFixed(0)}K assumed to be realized at business exit (modeled at year 10)`);
  if (impacts.projected_cash_flow_impact) assumptions.push(`Monthly cash flow improvement of $${impacts.projected_cash_flow_impact.toLocaleString()} assumed to be deployed to wealth vehicles`);
  assumptions.push('Investment return rate: 7% annually (standard conservative projection)');
  return assumptions;
}

function buildNarrative(baseline, impacts, accelerationMonths) {
  const parts = [];
  if (impacts.projected_profit_impact > 0) parts.push(`approximately $${Math.round(impacts.projected_profit_impact / 1000)}K in annual profit improvement`);
  if (impacts.projected_tax_impact > 0) parts.push(`$${Math.round(impacts.projected_tax_impact / 1000)}K in annual tax savings`);
  if (impacts.projected_value_impact > 0) parts.push(`$${Math.round(impacts.projected_value_impact / 1000)}K in business value creation`);
  if (impacts.projected_cash_flow_impact > 0) parts.push(`$${Math.round(impacts.projected_cash_flow_impact * 12 / 1000)}K/yr in additional cash flow`);

  if (parts.length === 0) return 'This recommendation creates operational and financial improvements that compound over time toward your freedom goal.';

  const impactStr = parts.join(', ');
  return `This recommendation generates ${impactStr}. Assuming those dollars are retained and allocated toward wealth-building assets, the projected freedom timeline improves by approximately ${accelerationMonths} months — moving your freedom date from ${freedomDateFromYears(baseline.baseYears)} to ${freedomDateFromYears(Math.max(1, baseline.baseYears - accelerationMonths / 12))}.`;
}

// ── Main Handler ──────────────────────────────────────────────────────────────
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
    const { action = 'projectSingle', data = {} } = body;

    // ── Resolve profile & business — Phase 6B.2 ───────────────────────────────
    // CROSS-TENANT HOLE (fixed here): `profile_id` and `business_id` both arrived
    // from the request body, and the client-supplied business_id then scoped the
    // freedom_projections WRITES below *and* the business-scoped READS in
    // getProjections, getSummary and bulkProjectFromExpansions — so a caller
    // could write into, and read back, another business's freedom projections.
    // Identity now comes from the authenticated session, and the business is
    // verified against the same ownership rule RLS enforces.
    const { data: ownProfile } = await sb
      .from('profiles')
      .select('id, primary_business_id')
      .eq('email', user.email)
      .maybeSingle();

    if (!ownProfile) return Response.json({ error: 'Profile not found' }, { status: 404 });

    const profile_id = ownProfile.id;
    // Phase 6.9B — canonical resolution. Was `data.business_id || ownProfile.primary_business_id`.
    const { businessId: business_id, denial: bizDenial } = await requireBusinessContext(
      sb, ownProfile, data.business_id, 'calculateFreedomAcceleration'
    );
    if (bizDenial) return bizDenial;
    if (!business_id) return Response.json({ error: 'business_id required' }, { status: 400 });

    try {
      await validateBusinessScope(sb, business_id, profile_id);
    } catch (scopeErr) {
      console.error('[calculateFreedomAcceleration] business scope denied:', scopeErr.message);
      return Response.json({ error: scopeErr.message, reason: 'business_scope_denied' }, { status: 403 });
    }

    // Load baseline (shared across all actions)
    const baseline = await loadBaseline(sb, profile_id, business_id);

    // ── PROJECT SINGLE ────────────────────────────────────────────────────────
    if (action === 'projectSingle') {
      const {
        source_type,          // 'strategy' | 'strategy_expansion' | 'roadmap_item' | 'sprint'
        source_id,
        source_name,
        projected_tax_impact = 0,
        projected_profit_impact = 0,
        projected_value_impact = 0,
        projected_cash_flow_impact = 0,
        projected_wealth_impact = 0,
        freedom_acceleration_months = null,
        persist = true,
      } = data;

      if (!source_type || !source_name) return Response.json({ error: 'source_type and source_name required' }, { status: 400 });

      const projection = projectAcceleration(baseline, {
        projected_tax_impact,
        projected_profit_impact,
        projected_value_impact,
        projected_cash_flow_impact,
        projected_wealth_impact,
        freedom_acceleration_months,
      });

      // Persist to freedom_projections table
      let savedId = null;
      if (persist) {
        const now = new Date().toISOString();
        try {
          const { data: inserted } = await sb.from('freedom_projections').insert({
            profile_id,
            business_id,
            source_type,
            source_id: source_id || null,
            source_name,
            ...projection,
            supporting_evidence: data.supporting_evidence || [],
            created_at: now,
            updated_at: now,
          }).select('id').single();
          savedId = inserted?.id;
        } catch (e) {
          console.warn('[calculateFreedomAcceleration] persist failed (table may not exist yet):', e.message);
        }
      }

      return Response.json({
        projection,
        source: { type: source_type, id: source_id, name: source_name },
        baseline: {
          base_years_to_freedom: baseline.baseYears,
          current_freedom_date: baseline.existingFreedomDate || freedomDateFromYears(baseline.baseYears),
          current_freedom_score: baseline.existingFreedomScore,
          data_confidence: baseline.dataConfidence,
        },
        saved_id: savedId,
      });
    }

    // ── PROJECT SCENARIO (multi-opportunity stack) ────────────────────────────
    if (action === 'projectScenario') {
      const { sources = [], scenario_name, persist = true } = data;
      if (sources.length === 0) return Response.json({ error: 'sources array required' }, { status: 400 });

      // Aggregate all impacts
      const combined = sources.reduce((acc, s) => ({
        projected_tax_impact: (acc.projected_tax_impact || 0) + (s.projected_tax_impact || 0),
        projected_profit_impact: (acc.projected_profit_impact || 0) + (s.projected_profit_impact || 0),
        projected_value_impact: (acc.projected_value_impact || 0) + (s.projected_value_impact || 0),
        projected_cash_flow_impact: (acc.projected_cash_flow_impact || 0) + (s.projected_cash_flow_impact || 0),
        projected_wealth_impact: (acc.projected_wealth_impact || 0) + (s.projected_wealth_impact || 0),
        freedom_acceleration_months: Math.max(acc.freedom_acceleration_months || 0, s.freedom_acceleration_months || 0),
      }), {});

      const individualProjections = sources.map(s => ({
        source_name: s.source_name,
        projection: projectAcceleration(baseline, s),
      }));

      const combinedProjection = projectAcceleration(baseline, combined);

      // Persist scenario separately
      let savedId = null;
      if (persist) {
        const now = new Date().toISOString();
        try {
          const { data: inserted } = await sb.from('freedom_projections').insert({
            profile_id,
            business_id,
            source_type: 'scenario',
            source_id: null,
            source_name: scenario_name || `Combined Stack (${sources.map(s => s.source_name).join(', ')})`,
            ...combinedProjection,
            supporting_evidence: sources.map(s => ({ source: s.source_name, type: s.source_type })),
            created_at: now,
            updated_at: now,
          }).select('id').single();
          savedId = inserted?.id;
        } catch (e) {
          console.warn('[calculateFreedomAcceleration] scenario persist failed:', e.message);
        }
      }

      return Response.json({
        scenario_name: scenario_name || 'Combined Opportunity Stack',
        combined_projection: combinedProjection,
        individual_projections: individualProjections,
        source_count: sources.length,
        source_names: sources.map(s => s.source_name),
        baseline: {
          base_years_to_freedom: baseline.baseYears,
          current_freedom_date: baseline.existingFreedomDate || freedomDateFromYears(baseline.baseYears),
          current_freedom_score: baseline.existingFreedomScore,
          data_confidence: baseline.dataConfidence,
        },
        saved_id: savedId,
      });
    }

    // ── GET PROJECTIONS ───────────────────────────────────────────────────────
    if (action === 'getProjections') {
      const { source_type, limit = 20 } = data;
      let query = sb.from('freedom_projections').select('*').eq('business_id', business_id).order('freedom_acceleration_months', { ascending: false }).limit(limit);
      if (source_type) query = query.eq('source_type', source_type);
      const { data: rows, error } = await query;
      if (error) return Response.json({ projections: [], error: error.message });
      return Response.json({ projections: rows || [], total: (rows || []).length });
    }

    // ── GET SUMMARY — top accelerator + best stack ────────────────────────────
    if (action === 'getSummary') {
      const { data: rows } = await sb
        .from('freedom_projections')
        .select('source_name, source_type, freedom_acceleration_months, projected_freedom_date, current_freedom_date, confidence_score, why_this_moves_freedom')
        .eq('business_id', business_id)
        .order('freedom_acceleration_months', { ascending: false })
        .limit(10);

      const singles = (rows || []).filter(r => r.source_type !== 'scenario');
      const scenarios = (rows || []).filter(r => r.source_type === 'scenario');

      return Response.json({
        top_accelerator: singles[0] || null,
        best_scenario: scenarios[0] || null,
        all_singles: singles,
        baseline: {
          current_freedom_date: baseline.existingFreedomDate || freedomDateFromYears(baseline.baseYears),
          current_freedom_score: baseline.existingFreedomScore,
        },
      });
    }

    // ── BULK PROJECT from strategy_expansions ────────────────────────────────
    if (action === 'bulkProjectFromExpansions') {
      const { data: expansions } = await sb
        .from('client_strategy_expansions')
        .select('id, expansion_name, projected_tax_impact, projected_profit_impact, projected_value_impact, projected_cash_flow_impact, projected_freedom_acceleration_months, confidence_score')
        .eq('business_id', business_id)
        .in('status', ['recommended', 'potential'])
        .order('priority_rank', { ascending: true })
        .limit(10);

      if (!expansions || expansions.length === 0) return Response.json({ projections: [], message: 'No expansions found — run expandStrategyOpportunities first' });

      const now = new Date().toISOString();
      const results = [];

      for (const exp of expansions) {
        const projection = projectAcceleration(baseline, {
          projected_tax_impact: exp.projected_tax_impact || 0,
          projected_profit_impact: exp.projected_profit_impact || 0,
          projected_value_impact: exp.projected_value_impact || 0,
          projected_cash_flow_impact: exp.projected_cash_flow_impact || 0,
          freedom_acceleration_months: exp.projected_freedom_acceleration_months || null,
        });

        try {
          const { data: ins } = await sb.from('freedom_projections').insert({
            profile_id,
            business_id,
            source_type: 'strategy_expansion',
            source_id: exp.id,
            source_name: exp.expansion_name,
            ...projection,
            supporting_evidence: [{ source: 'client_strategy_expansions', id: exp.id }],
            created_at: now,
            updated_at: now,
          }).select('id, source_name, freedom_acceleration_months, projected_freedom_date, confidence_score').single();
          if (ins) results.push(ins);
        } catch (e) {
          console.warn('[bulkProjectFromExpansions] persist failed for', exp.expansion_name, ':', e.message);
          results.push({ source_name: exp.expansion_name, error: e.message, ...projection });
        }
      }

      // Also create a combined scenario for the top 3
      const top3 = expansions.slice(0, 3);
      const combined = top3.reduce((acc, e) => ({
        projected_tax_impact: (acc.projected_tax_impact || 0) + (e.projected_tax_impact || 0),
        projected_profit_impact: (acc.projected_profit_impact || 0) + (e.projected_profit_impact || 0),
        projected_value_impact: (acc.projected_value_impact || 0) + (e.projected_value_impact || 0),
        projected_cash_flow_impact: (acc.projected_cash_flow_impact || 0) + (e.projected_cash_flow_impact || 0),
        freedom_acceleration_months: Math.max(acc.freedom_acceleration_months || 0, e.projected_freedom_acceleration_months || 0),
      }), {});

      const scenarioProjection = projectAcceleration(baseline, combined);
      try {
        await sb.from('freedom_projections').insert({
          profile_id,
          business_id,
          source_type: 'scenario',
          source_id: null,
          source_name: `Top 3 Stack: ${top3.map(e => e.expansion_name).join(' + ')}`,
          ...scenarioProjection,
          supporting_evidence: top3.map(e => ({ source: e.expansion_name })),
          created_at: now,
          updated_at: now,
        });
      } catch (e) {
        console.warn('[bulkProjectFromExpansions] scenario persist failed:', e.message);
      }

      return Response.json({
        projections: results,
        scenario: scenarioProjection,
        baseline: {
          base_years: baseline.baseYears,
          current_freedom_date: baseline.existingFreedomDate || freedomDateFromYears(baseline.baseYears),
          data_confidence: baseline.dataConfidence,
        },
      });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });

  } catch (error) {
    console.error('[calculateFreedomAcceleration] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});