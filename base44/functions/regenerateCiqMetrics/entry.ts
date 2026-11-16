/**
 * regenerateCiqMetrics
 * 
 * Aggregation layer that recalculates CIQ score and populates dashboard_metrics + business_metric_snapshots
 * by reading from business_assessments, assessment_calculations, and profile_financials.
 * 
 * This function is the source of truth for CIQ calculation — it:
 * 1. Reads all completed business_assessments for the profile
 * 2. Extracts gap scores (0–100) and opportunity values ($)
 * 3. Applies weighted average to calculate CIQ
 * 4. Upserts dashboard_metrics with JSONB gap objects
 * 5. Inserts business_metric_snapshots for historical tracking
 * 
 * Called on-demand (button in admin) or via scheduled automation.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireBusinessContext } from '../../shared/businessScope/activeBusiness.ts';

// ─── Constants ────────────────────────────────────────────────────────────────

const GAP_WEIGHTS = {
  profit_gap: 1.0,      // Core financial metric
  value_gap: 1.0,       // Exit readiness
  tax_gap: 0.8,         // Compliance + savings
  operations_gap: 0.8,  // Efficiency
  cash_flow_gap: 0.6,   // Liquidity
  protections_gap: 0.4, // Risk mitigation
  wealth_gap: 0.6,      // Personal finance
};

function fmt(n) {
  if (n == null || isNaN(n)) return null;
  return Math.round(n);
}

function severity(dollarGap) {
  if (!dollarGap) return 'small';
  if (dollarGap > 500_000) return 'significant';
  if (dollarGap > 100_000) return 'moderate';
  return 'small';
}

// ─── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin' && user.role !== 'super_admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    // Accept optional businessId from caller (saveAssessmentToSupabase sends it).
    const requestedBusinessId = body?.businessId || null;

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SERVICE_KEY) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    console.log('[regenerateCiqMetrics] called for user:', user.email);

    // ── 1. Resolve profile ────────────────────────────────────────────────────
    const { data: profile, error: profileErr } = await sb
      .from('profiles')
      .select('id, primary_business_id, email')
      .eq('email', user.email)
      .maybeSingle();

    if (profileErr) {
      console.error('[regenerateCiqMetrics] profile fetch error:', profileErr.message);
      return Response.json({ error: 'Profile not found' }, { status: 404 });
    }
    if (!profile) {
      console.error('[regenerateCiqMetrics] profile not found for email:', user.email);
      return Response.json({ error: 'Profile not found' }, { status: 404 });
    }

    const profileId = profile.id;
    // Phase 6.9B — canonical resolution. Was `requestedBusinessId || profile.primary_business_id`.
    const { businessId: resolvedBusinessId, denial: bizDenial } = await requireBusinessContext(
      sb, profile, requestedBusinessId, 'regenerateCiqMetrics'
    );
    if (bizDenial) return bizDenial;
    let businessId = resolvedBusinessId;

    console.log('[regenerateCiqMetrics] profile resolved:', profileId, '| businessId:', businessId, '| requested:', requestedBusinessId);

    // ── 2. Resolve business_id if missing ─────────────────────────────────────
    if (!businessId) {
      const { data: bizEntities } = await sb
        .from('business_entities')
        .select('id')
        .eq('profile_id', profileId)
        .limit(1);

      if (bizEntities && bizEntities.length > 0) {
        businessId = bizEntities[0].id;
        await sb.from('profiles').update({ primary_business_id: businessId }).eq('id', profileId);
        console.log('[regenerateCiqMetrics] business resolved from business_entities:', businessId);
      } else {
        const { data: newBiz } = await sb
          .from('business_entities')
          .insert({
            profile_id: profileId,
            business_name: 'My Business',
            current_stage: 'onboarding',
          })
          .select('id')
          .single();

        businessId = newBiz?.id || null;
        if (businessId) {
          await sb.from('profiles').update({ primary_business_id: businessId }).eq('id', profileId);
        }
        console.log('[regenerateCiqMetrics] business created:', businessId);
      }
    }

    // ── 3. Fetch all completed business_assessments ───────────────────────────
    // Business-scoped when businessId is available; fallback to profile_id.
    let assessmentsQuery = sb
      .from('business_assessments')
      .select('*')
      .eq('status', 'completed');
    if (businessId) {
      assessmentsQuery = assessmentsQuery.eq('business_id', businessId);
    } else {
      assessmentsQuery = assessmentsQuery.eq('profile_id', profileId);
    }
    const { data: assessments, error: assessmentsErr } = await assessmentsQuery
      .order('completed_at', { ascending: false });

    if (assessmentsErr) {
      console.error('[regenerateCiqMetrics] business_assessments fetch error:', assessmentsErr.message);
      return Response.json({ error: 'Failed to fetch assessments' }, { status: 500 });
    }

    console.log('[regenerateCiqMetrics] assessments found:', assessments?.length || 0);

    // ── 4. Build score map from assessments ───────────────────────────────────
    const scoreMap = {};
    const opportunityMap = {};
    const assessmentDetails = {};

    (assessments || []).forEach(assessment => {
      const type = assessment.assessment_type;
      assessmentDetails[type] = {
        score: assessment.score,
        opportunity_value: assessment.estimated_opportunity_value,
        risk_level: assessment.risk_level,
        opportunity_level: assessment.opportunity_level,
        key_findings: assessment.key_findings,
        recommendations: assessment.recommendations,
      };

      if (assessment.score != null) {
        scoreMap[type] = assessment.score;
      }
      if (assessment.estimated_opportunity_value != null) {
        opportunityMap[type] = assessment.estimated_opportunity_value;
      }
    });

    console.log('[regenerateCiqMetrics] scores found:', scoreMap);
    console.log('[regenerateCiqMetrics] opportunities found:', opportunityMap);

    // ── 5. Read latest assessment_calculations for tax score fallback ─────────
    // Deterministic ordering: created_at DESC with id DESC tiebreaker.
    const { data: calculations } = await sb
      .from('assessment_calculations')
      .select('id, result_json, input_json')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(10);

    let taxScoreFallback = null;
    let profitScoreFallback = null;

    (calculations || []).forEach(calc => {
      const results = calc.result_json || {};
      const inputs = calc.input_json || {};
      
      // Tax score from calculations — use != null check, not truthy.
      // A zero tax gap is valid and should produce a high tax score.
      if (!taxScoreFallback && results?.t3_annual_gap != null && inputs?.t3_agi > 0) {
        const taxMaxRef = inputs.t3_agi * 0.1;
        taxScoreFallback = Math.max(0, Math.round((1 - results.t3_annual_gap / taxMaxRef) * 100));
      }
      
      // Profit score from calculations
      if (!profitScoreFallback && results?.profit_score != null) {
        profitScoreFallback = Math.round(results.profit_score);
      }
    });

    console.log('[regenerateCiqMetrics] taxScoreFallback:', taxScoreFallback);
    console.log('[regenerateCiqMetrics] profitScoreFallback:', profitScoreFallback);

    // ── 6. Build complete score map with fallbacks ───────────────────────────
    const finalScores = {};

    // Map assessment types to gap types
    const typeToGap = {
      profit_gap: 'profit_gap',
      value_gap: 'value_gap',
      tax_gap: 'tax_gap',
      operations_gap: 'operations_gap',
      cash_flow_gap: 'cash_flow_gap',
      protections_gap: 'protections_gap',
      wealth_gap: 'wealth_gap',
      freedom_assessment: null, // Not included in CIQ
      recast_ebitda: null, // Not a gap score
    };

    Object.entries(typeToGap).forEach(([assessmentType, gapType]) => {
      if (!gapType) return;
      
      // Primary: use business_assessments.score
      if (scoreMap[assessmentType] != null) {
        finalScores[gapType] = scoreMap[assessmentType];
      }
      // Fallback: tax_gap from taxScore in calculations
      else if (gapType === 'tax_gap' && taxScoreFallback != null) {
        finalScores[gapType] = taxScoreFallback;
      }
      // Fallback: profit_gap from results.profit_score
      else if (gapType === 'profit_gap' && profitScoreFallback != null) {
        finalScores[gapType] = profitScoreFallback;
      }
    });

    console.log('[regenerateCiqMetrics] finalScores:', finalScores);

    // ── 7. Calculate CIQ score with weighted average ─────────────────────────
    const availableGaps = Object.keys(finalScores);
    const totalWeight = availableGaps.reduce((sum, gap) => sum + (GAP_WEIGHTS[gap] || 0), 0);
    
    let ciqScore = null;
    if (availableGaps.length > 0 && totalWeight > 0) {
      const weightedSum = availableGaps.reduce((sum, gap) => {
        return sum + (finalScores[gap] * (GAP_WEIGHTS[gap] || 0));
      }, 0);
      ciqScore = Math.round(weightedSum / totalWeight);
    }

    console.log('[regenerateCiqMetrics] CIQ calculation inputs:', {
      availableGaps,
      totalWeight,
      weightedSum: availableGaps.reduce((sum, gap) => sum + (finalScores[gap] * (GAP_WEIGHTS[gap] || 0)), 0),
      ciqScore
    });

    // ── 8. Read existing dashboard_metrics ────────────────────────────────────
    // Business-scoped lookup (matches saveAssessmentToSupabase write path).
    // Falls back to profile_id for legacy rows without business_id.
    let existingDM = null;
    let dmFetchErr = null;
    if (businessId) {
      const { data: dmByBiz, error: e1 } = await sb.from('dashboard_metrics').select('*').eq('business_id', businessId).maybeSingle();
      existingDM = dmByBiz;
      dmFetchErr = e1;
    }
    if (!existingDM) {
      const { data: dmByProfile, error: e2 } = await sb.from('dashboard_metrics').select('*').eq('profile_id', profileId).maybeSingle();
      existingDM = dmByProfile;
      dmFetchErr = dmFetchErr || e2;
    }

    if (dmFetchErr) {
      console.error('[regenerateCiqMetrics] dashboard_metrics fetch error:', dmFetchErr.message);
    }
    console.log('[regenerateCiqMetrics] existing dashboard_metrics:', existingDM ? 'found (id: ' + existingDM.id + ')' : 'not found');
    if (existingDM) {
      console.log('[regenerateCiqMetrics] existing dashboard_metrics keys:', Object.keys(existingDM));
    }

    // ── 8b. Read latest assessment_calculations for rich result data ─────────
    // Used to populate JSONB gap fields that need raw result values (margins, dates, etc.)
    // Deterministic ordering: created_at DESC with id DESC tiebreaker.
    const { data: allCalcs } = await sb
      .from('assessment_calculations')
      .select('id, assessment_type, result_json, input_json')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(20);

    // Build a map of the latest result_json per assessment type
    const resultsByType = {};
    const inputsByType = {};
    (allCalcs || []).forEach(c => {
      if (!resultsByType[c.assessment_type]) {
        resultsByType[c.assessment_type] = c.result_json || {};
        inputsByType[c.assessment_type] = c.input_json || {};
      }
    });

    function sev(dollarGap) {
      if (!dollarGap) return 'small';
      if (dollarGap > 500_000) return 'significant';
      if (dollarGap > 100_000) return 'moderate';
      return 'small';
    }

    // ── 9. Build dashboard_metrics upsert payload with JSONB gap fields ───────
    const dmPatch = {
      profile_id: profileId,
      updated_at: new Date().toISOString(),
    };

    // CIQ score
    if (ciqScore != null) dmPatch.ciq_score = ciqScore;

    // profit_gap: numeric column for amount, *_details for object
    const pgOpp = opportunityMap.profit_gap;
    const pgScore = finalScores.profit_gap ?? null;
    const pgResults = resultsByType.profit_gap || {};
    const pgInputs  = inputsByType.profit_gap  || {};
    if (assessmentDetails.profit_gap || pgOpp != null) {
      // Phase 6B.1 — the benchmark is a NET PROFIT margin. Only a verified
      // net-profit margin may be compared against it. An EBITDA-derived or
      // semantically ambiguous historical margin produces NO gap rather than a
      // flattering wrong one.
      const pgMarginType = pgInputs.p1_mymargin_type || (pgInputs.margin_semantics === 'ebitda_margin' ? 'ebitda_margin' : 'net_profit_margin');
      const pgProvenance = pgInputs.p1_mymargin_provenance
        || (pgInputs.margin_semantics === 'ebitda_margin' ? 'derived_from_ebitda' : 'verified');
      const pgComparable =
        pgMarginType === 'net_profit_margin' &&
        pgProvenance !== 'ambiguous_legacy' &&
        pgProvenance !== 'derived_from_ebitda' &&
        pgProvenance !== 'estimated_from_net_profit';

      const gapToAvg = pgComparable && pgInputs.p1_rev && pgInputs.p1_mymargin != null && pgInputs.benchmark?.average_net_profit_margin != null
        ? fmt(Math.max(0, pgInputs.p1_rev * ((pgInputs.benchmark.average_net_profit_margin - pgInputs.p1_mymargin) / 100)))
        : null;
      dmPatch.profit_gap = fmt(pgOpp); // Numeric column: dollar amount only
      dmPatch.profit_gap_details = { // JSONB detail column
        score:          pgScore,
        gap_to_average: gapToAvg,
        gap_to_best:    fmt(pgOpp),
        severity:       sev(pgOpp),
        summary:        assessmentDetails.profit_gap?.key_findings?.[0] || null,
      };
    }

    // value_gap: numeric column for amount, *_details for object
    const vgOpp     = opportunityMap.value_gap;
    const vgResults = resultsByType.value_gap || {};
    if (assessmentDetails.value_gap || vgOpp != null) {
      const gapAmount = fmt(vgResults.value_gap ?? vgResults.valueGap ?? vgOpp);
      dmPatch.value_gap = gapAmount; // Numeric column: dollar amount only
      dmPatch.value_gap_details = { // JSONB detail column
        current_value:   fmt(vgResults.current_value)   ?? null,
        potential_value: fmt(vgResults.potential_value) ?? null,
        gap_amount:      gapAmount,
        severity:        sev(gapAmount),
        summary:         assessmentDetails.value_gap?.key_findings?.[0] || null,
      };
    }

    // tax_gap: numeric column for amount, *_details for object
    const tgOpp     = opportunityMap.tax_gap;
    const tgResults = resultsByType.tax_gap || {};
    if (assessmentDetails.tax_gap || tgOpp != null) {
      const annual = tgResults.t3_annual_gap ?? tgOpp ?? null;
      dmPatch.tax_gap = fmt(annual); // Numeric column: dollar amount only
      dmPatch.tax_gap_details = { // JSONB detail column
        score:              finalScores.tax_gap ?? null,
        annual_overpayment: fmt(annual),
        ten_year_cost:      annual != null ? fmt(annual * 10) : null,
        opportunities:      tgResults.t3_strategies || [],
        severity:           sev(annual),
        summary:            assessmentDetails.tax_gap?.key_findings?.[0] || null,
      };
    }

    // operations_gap: numeric column for score, *_details for object
    const ogScore   = finalScores.operations_gap ?? null;
    const ogInputs  = inputsByType.operations_gap || {};
    if (assessmentDetails.operations_gap || ogScore != null) {
      const monthlyValueFreed = ogInputs.o4_takehome ? fmt(ogInputs.o4_takehome * 0.2) : null;
      dmPatch.operations_gap = ogScore; // Numeric column: score only
      dmPatch.operations_gap_details = { // JSONB detail column
        score:               ogScore,
        monthly_value_freed: monthlyValueFreed,
        severity:            ogScore != null ? (ogScore < 45 ? 'significant' : ogScore < 75 ? 'moderate' : 'small') : 'small',
        summary:             assessmentDetails.operations_gap?.key_findings?.[0] || null,
      };
    }

    // freedom_gap: numeric score + JSONB details
    const faResults = resultsByType.freedom_assessment || {};
    const faScore   = assessmentDetails.freedom_assessment?.score ?? null;
    if (assessmentDetails.freedom_assessment) {
      if (faScore != null) dmPatch.freedom_score = faScore;
      dmPatch.freedom_gap_details = {
        score:            faScore,
        freedom_date:     faResults.freedom_date || null,
        time_recoverable: faResults.time_recoverable || null,
      };
    }

    // recast_ebitda: numeric column + JSONB details
    const rcResults = resultsByType.recast_ebitda || {};
    if (assessmentDetails.recast_ebitda) {
      // Use != null check — zero recast EBITDA is valid and must be written.
      if (rcResults.recast_ebitda != null) dmPatch.recast_ebitda = fmt(rcResults.recast_ebitda);
      dmPatch.recast_ebitda_gap_details = {
        add_backs:          fmt(rcResults.total_addbacks) ?? null,
        valuation_increase: fmt(rcResults.recast_value_impact) ?? null,
      };
    }

    // cash_flow_gap: numeric amount + JSONB details
    const cfOpp = opportunityMap.cash_flow_gap;
    if (assessmentDetails.cash_flow_gap || cfOpp != null) {
      dmPatch.cash_flow_gap = fmt(cfOpp); // Numeric column: dollar opportunity
      dmPatch.cash_flow_gap_details = {
        score:                 finalScores.cash_flow_gap ?? null,
        cash_flow_opportunity: fmt(cfOpp),
        severity:              sev(cfOpp),
        summary:               assessmentDetails.cash_flow_gap?.key_findings?.[0] || null,
      };
    }

    // protections_gap: numeric score + JSONB details
    const ptScore = finalScores.protections_gap ?? null;
    if (assessmentDetails.protections_gap || ptScore != null) {
      dmPatch.protections_gap = ptScore; // Numeric column: score
      dmPatch.protections_gap_details = {
        score:                 ptScore,
        protection_risk_score: ptScore != null ? Math.round(100 - ptScore) : null,
        severity:              ptScore != null ? (ptScore < 45 ? 'significant' : ptScore < 75 ? 'moderate' : 'small') : 'small',
        summary:               assessmentDetails.protections_gap?.key_findings?.[0] || null,
      };
    }

    // wealth_gap: numeric amount + JSONB details
    const wgOpp   = opportunityMap.wealth_gap;
    const wgScore = finalScores.wealth_gap ?? null;
    if (assessmentDetails.wealth_gap || wgOpp != null) {
      dmPatch.wealth_gap = fmt(wgOpp); // Numeric column: dollar gap
      dmPatch.wealth_gap_details = {
        score:                  wgScore,
        wealth_readiness_score: wgScore,
        severity:               sev(wgOpp),
        summary:                assessmentDetails.wealth_gap?.key_findings?.[0] || null,
      };
    }

    console.log('[regenerateCiqMetrics] dmPatch keys:', Object.keys(dmPatch));
    console.log('[regenerateCiqMetrics] dmPatch:', JSON.stringify(dmPatch));

    // ── 10. Upsert dashboard_metrics — merge to preserve unrelated fields ──────
    // Merge dmPatch on top of the existing row so we never wipe fields from other assessments
    const mergedDmPatch = { ...(existingDM || {}), ...dmPatch };

    let dmUpsertResult = null;
    if (existingDM) {
      console.log('[regenerateCiqMetrics] Updating existing dashboard_metrics id:', existingDM.id);
      console.log('[regenerateCiqMetrics] mergedDmPatch profit_gap:', JSON.stringify(mergedDmPatch.profit_gap));
      console.log('[regenerateCiqMetrics] mergedDmPatch value_gap:', JSON.stringify(mergedDmPatch.value_gap));
      
      const { data, error, status, statusText } = await sb
        .from('dashboard_metrics')
        .update(mergedDmPatch)
        .eq('id', existingDM.id)
        .select();
      
      console.log('[regenerateCiqMetrics] UPDATE RESPONSE:', {
        data: data ? 'row returned' : null,
        error: error?.message || null,
        status,
        statusText,
        rowCount: data?.length || 0
      });
      
      if (error) {
        console.error('[regenerateCiqMetrics] dashboard_metrics update error:', error.message, '| details:', error.details || 'none', '| status:', status, '| statusText:', statusText);
      } else if (!data || data.length === 0) {
        console.error('[regenerateCiqMetrics] dashboard_metrics update returned NO ROWS - possible RLS block or no changes detected');
      } else {
        dmUpsertResult = data[0];
        console.log('[regenerateCiqMetrics] dashboard_metrics updated successfully, ciq_score:', ciqScore);
        console.log('[regenerateCiqMetrics] Updated profit_gap:', JSON.stringify(dmUpsertResult.profit_gap));
        console.log('[regenerateCiqMetrics] Updated value_gap:', JSON.stringify(dmUpsertResult.value_gap));
      }
    } else {
      console.log('[regenerateCiqMetrics] Inserting new dashboard_metrics row');
      const { data, error, status, statusText } = await sb
        .from('dashboard_metrics')
        .insert({ ...mergedDmPatch, created_at: new Date().toISOString() })
        .select();
      
      console.log('[regenerateCiqMetrics] INSERT RESPONSE:', {
        data: data ? 'row returned' : null,
        error: error?.message || null,
        status,
        statusText,
        rowCount: data?.length || 0
      });
      
      if (error) {
        console.error('[regenerateCiqMetrics] dashboard_metrics insert error:', error.message, '| details:', error.details || 'none', '| hint:', error.hint || 'none', '| status:', status, '| statusText:', statusText);
      } else if (!data || data.length === 0) {
        console.error('[regenerateCiqMetrics] dashboard_metrics insert returned NO ROWS');
      } else {
        dmUpsertResult = data[0];
        console.log('[regenerateCiqMetrics] dashboard_metrics inserted successfully, ciq_score:', ciqScore);
        console.log('[regenerateCiqMetrics] Inserted profit_gap:', JSON.stringify(dmUpsertResult.profit_gap));
        console.log('[regenerateCiqMetrics] Inserted value_gap:', JSON.stringify(dmUpsertResult.value_gap));
      }
    }

    // ── 11. Insert business_metric_snapshots ─────────────────────────────────
    let snapshotResult = null;
    try {
      // Mark previous snapshots as not latest
      await sb
        .from('business_metric_snapshots')
        .update({ is_latest: false })
        .eq('business_id', businessId);

      // Build snapshot row
      const snapshotRow = {
        profile_id: profileId,
        business_id: businessId,
        snapshot_date: new Date().toISOString().split('T')[0],
        snapshot_type: 'current',
        is_latest: true,
        data_source: 'calculation_engine',
        overall_impact_score: ciqScore,
        data_confidence_score: assessments?.length > 0 ? Math.min(95, 50 + assessments.length * 10) : 50,
      };

      // Add financial metrics if available
      if (dmPatch.revenue) snapshotRow.annual_revenue = dmPatch.revenue;
      if (dmPatch.net_profit) snapshotRow.net_profit = dmPatch.net_profit;
      if (dmPatch.recast_ebitda) snapshotRow.ebitda = dmPatch.recast_ebitda;
      if (dmPatch.enterprise_value) snapshotRow.current_business_value = dmPatch.enterprise_value;
      // Use != null checks — zero is a valid value and must be persisted.
      if (opportunityMap.value_gap != null) snapshotRow.value_gap = fmt(opportunityMap.value_gap);
      if (opportunityMap.profit_gap != null) snapshotRow.profit_opportunity = fmt(opportunityMap.profit_gap);
      if (opportunityMap.tax_gap != null) snapshotRow.tax_opportunity = fmt(opportunityMap.tax_gap);
      if (opportunityMap.cash_flow_gap != null) snapshotRow.cash_flow_opportunity = fmt(opportunityMap.cash_flow_gap);

      const { data, error } = await sb
        .from('business_metric_snapshots')
        .insert(snapshotRow)
        .select()
        .single();

      if (error) {
        console.error('[regenerateCiqMetrics] snapshot insert error:', error.message);
      } else {
        snapshotResult = data;
        console.log('[regenerateCiqMetrics] snapshot inserted, overall_impact_score:', ciqScore);
      }
    } catch (snapErr) {
      console.error('[regenerateCiqMetrics] snapshot write failed:', snapErr?.message || snapErr);
    }

    console.log('[regenerateCiqMetrics] COMPLETE');

    return Response.json({
      success: true,
      ciq_score: ciqScore,
      scores_used: finalScores,
      available_gaps: availableGaps,
      total_weight: totalWeight,
      dashboard_metrics_updated: !!dmUpsertResult,
      snapshot_created: !!snapshotResult,
      assessment_count: assessments?.length || 0,
    });

  } catch (error) {
    console.error('[regenerateCiqMetrics] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});