/**
 * recordStrategyOutcome — Phase 2: Outcome Capture Service
 *
 * Creates or updates a strategy_outcomes record when a strategy, expansion,
 * roadmap item, or sprint moves toward completion.
 *
 * ADDITIVE ONLY — does not modify any existing tables or functions.
 *
 * Actions:
 *   'record'   — create or update an outcome (default)
 *   'update'   — add actual impact values and recalculate variance
 *   'verify'   — mark as verified with evidence
 *   'reject'   — mark as rejected
 *   'list'     — list outcomes for a business (admin/advisor)
 *   'get'      — get single outcome by id
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireBusinessContext } from '../../shared/businessScope/activeBusiness.ts';
import { validateBusinessScope } from '../../shared/businessScope/writeGuard.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return Response.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body = await req.json().catch(() => ({}));
    const {
      action = 'record',
      outcome_id,
      profile_id: bodyProfileId,
      business_id: bodyBizId,
      source_type,
      source_id,
      // Actual impact inputs
      actual_profit_impact,
      actual_tax_impact,
      actual_value_impact,
      actual_cash_flow_impact,
      actual_wealth_impact,
      actual_protection_impact,
      actual_freedom_acceleration_months,
      // Evidence
      evidence_notes,
      supporting_documents,
      confidence_score: inputConfidence,
      // Filters for list action
      filter_status,
      filter_category,
      filter_source_type,
      target_profile_id,
      // Outcome quality
      should_include_in_learning,
      implementation_start_date,
      implementation_completed_date,
    } = body;

    // Resolve profile/business
    const { data: callerProfile } = await sb.from('profiles')
      .select('id, primary_business_id, app_role')
      .eq('email', user.email)
      .maybeSingle();

    const callerRole = callerProfile?.app_role || user.role || 'owner';
    const isAdminOrAdvisor = ['super_admin', 'advisor', 'admin'].includes(callerRole);

    // ── Phase 6B.5 — a body value may name a TARGET, never the ACTOR ──────────
    // Previously `bodyProfileId` was accepted as the acting profile for EVERY
    // caller, and the guard below then validated that body-chosen profile's
    // ownership of the business — so naming the legitimate owner authorized the
    // write under the owner's identity. The acting profile is now the caller's
    // own. An admin/advisor may still address another profile as a target, which
    // preserves their existing cross-business reach unchanged.
    const requestedProfileId = isAdminOrAdvisor ? (bodyProfileId || null) : null;
    let profile_id = requestedProfileId || callerProfile?.id;
    // Phase 6.9B — canonical resolution. Was `bodyBizId || callerProfile?.primary_business_id`.
    const { businessId: business_id, denial: bizDenial } = await requireBusinessContext(
      sb, callerProfile, bodyBizId, 'recordStrategyOutcome'
    );
    if (bizDenial) return bizDenial;

    const now = new Date().toISOString();

    // ── LIST action ────────────────────────────────────────────────────────────
    if (action === 'list') {
      if (!isAdminOrAdvisor) {
        return Response.json({ error: 'Forbidden — admin/advisor only' }, { status: 403 });
      }
      const filterBizId = bodyBizId || business_id;
      const filterProfileId = target_profile_id || bodyProfileId;

      let query = sb.from('strategy_outcomes').select('*').order('created_at', { ascending: false }).limit(100);
      if (filterBizId) query = query.eq('business_id', filterBizId);
      else if (filterProfileId) query = query.eq('profile_id', filterProfileId);
      if (filter_status) query = query.eq('status', filter_status);
      if (filter_category) query = query.eq('category', filter_category);
      if (filter_source_type) query = query.eq('source_type', filter_source_type);

      const { data: outcomes, error: listErr } = await query;
      if (listErr) return Response.json({ error: listErr.message }, { status: 500 });
      return Response.json({ outcomes: outcomes || [], total: (outcomes || []).length });
    }

    // ── GET action ─────────────────────────────────────────────────────────────
    if (action === 'get') {
      if (!outcome_id) return Response.json({ error: 'outcome_id required' }, { status: 400 });
      const { data: outcome, error: getErr } = await sb
        .from('strategy_outcomes').select('*').eq('id', outcome_id).maybeSingle();
      if (getErr) return Response.json({ error: getErr.message }, { status: 500 });
      if (!outcome) return Response.json({ error: 'Outcome not found' }, { status: 404 });
      // Access control
      if (!isAdminOrAdvisor && outcome.profile_id !== profile_id) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
      return Response.json({ outcome });
    }

    // ── VERIFY action ──────────────────────────────────────────────────────────
    if (action === 'verify') {
      if (!isAdminOrAdvisor) return Response.json({ error: 'Forbidden' }, { status: 403 });
      if (!outcome_id) return Response.json({ error: 'outcome_id required' }, { status: 400 });

      const { data: existing } = await sb.from('strategy_outcomes').select('*').eq('id', outcome_id).maybeSingle();
      if (!existing) return Response.json({ error: 'Outcome not found' }, { status: 404 });

      const updatePayload = {
        status: 'verified',
        verified_by: user.email,
        verified_at: now,
        updated_at: now,
      };
      if (evidence_notes) updatePayload.evidence_notes = evidence_notes;
      if (supporting_documents) updatePayload.supporting_documents = supporting_documents;
      if (typeof should_include_in_learning === 'boolean') {
        updatePayload.should_include_in_learning = should_include_in_learning;
      }

      const { data: updated, error: verErr } = await sb
        .from('strategy_outcomes').update(updatePayload).eq('id', outcome_id).select('*').single();
      if (verErr) return Response.json({ error: verErr.message }, { status: 500 });

      return Response.json({ outcome: updated, action: 'verified' });
    }

    // ── REJECT action ──────────────────────────────────────────────────────────
    if (action === 'reject') {
      if (!isAdminOrAdvisor) return Response.json({ error: 'Forbidden' }, { status: 403 });
      if (!outcome_id) return Response.json({ error: 'outcome_id required' }, { status: 400 });

      const { data: updated, error: rejErr } = await sb
        .from('strategy_outcomes')
        .update({ status: 'rejected', evidence_notes: evidence_notes || null, updated_at: now })
        .eq('id', outcome_id)
        .select('*').single();
      if (rejErr) return Response.json({ error: rejErr.message }, { status: 500 });

      return Response.json({ outcome: updated, action: 'rejected' });
    }

    // ── UPDATE action (add actuals) ────────────────────────────────────────────
    if (action === 'update') {
      if (!isAdminOrAdvisor) return Response.json({ error: 'Forbidden — admin/advisor only' }, { status: 403 });
      if (!outcome_id) return Response.json({ error: 'outcome_id required' }, { status: 400 });

      const { data: existing } = await sb.from('strategy_outcomes').select('*').eq('id', outcome_id).maybeSingle();
      if (!existing) return Response.json({ error: 'Outcome not found' }, { status: 404 });

      // Build actual values (use existing if not provided)
      const actuals = {
        actual_profit_impact: actual_profit_impact ?? existing.actual_profit_impact,
        actual_tax_impact: actual_tax_impact ?? existing.actual_tax_impact,
        actual_value_impact: actual_value_impact ?? existing.actual_value_impact,
        actual_cash_flow_impact: actual_cash_flow_impact ?? existing.actual_cash_flow_impact,
        actual_wealth_impact: actual_wealth_impact ?? existing.actual_wealth_impact,
        actual_protection_impact: actual_protection_impact ?? existing.actual_protection_impact,
        actual_freedom_acceleration_months: actual_freedom_acceleration_months ?? existing.actual_freedom_acceleration_months,
      };

      // Calculate total actual
      const totalActual = (actuals.actual_profit_impact || 0) +
        (actuals.actual_tax_impact || 0) +
        (actuals.actual_value_impact || 0) +
        (actuals.actual_cash_flow_impact || 0) +
        (actuals.actual_wealth_impact || 0) +
        (actuals.actual_protection_impact || 0);

      // Calculate variances
      const profitVariance = actuals.actual_profit_impact != null && existing.projected_profit_impact != null
        ? actuals.actual_profit_impact - existing.projected_profit_impact : null;
      const taxVariance = actuals.actual_tax_impact != null && existing.projected_tax_impact != null
        ? actuals.actual_tax_impact - existing.projected_tax_impact : null;
      const valueVariance = actuals.actual_value_impact != null && existing.projected_value_impact != null
        ? actuals.actual_value_impact - existing.projected_value_impact : null;
      const cashFlowVariance = actuals.actual_cash_flow_impact != null && existing.projected_cash_flow_impact != null
        ? actuals.actual_cash_flow_impact - existing.projected_cash_flow_impact : null;
      const freedomVariance = actuals.actual_freedom_acceleration_months != null && existing.projected_freedom_acceleration_months != null
        ? actuals.actual_freedom_acceleration_months - existing.projected_freedom_acceleration_months : null;

      const totalVariance = existing.total_projected_impact > 0
        ? totalActual - existing.total_projected_impact : null;

      const accuracyPct = existing.total_projected_impact > 0 && totalActual > 0
        ? Math.round((totalActual / existing.total_projected_impact) * 100) : null;

      // Implementation days
      let implDays = existing.implementation_days;
      let timeVarianceDays = existing.time_variance_days;
      const startDate = implementation_start_date || existing.implementation_start_date;
      const completedDate = implementation_completed_date || existing.implementation_completed_date;
      if (startDate && completedDate) {
        const diffMs = new Date(completedDate) - new Date(startDate);
        implDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
        if (existing.expected_implementation_days) {
          timeVarianceDays = implDays - existing.expected_implementation_days;
        }
      }

      const updatePayload = {
        ...actuals,
        profit_variance: profitVariance,
        tax_variance: taxVariance,
        value_variance: valueVariance,
        cash_flow_variance: cashFlowVariance,
        freedom_variance: freedomVariance,
        total_actual_impact: totalActual || null,
        total_variance: totalVariance,
        accuracy_percentage: accuracyPct,
        implementation_days: implDays,
        time_variance_days: timeVarianceDays,
        evidence_notes: evidence_notes || existing.evidence_notes,
        confidence_score: inputConfidence || existing.confidence_score,
        updated_at: now,
      };
      if (implementation_start_date) updatePayload.implementation_start_date = implementation_start_date;
      if (implementation_completed_date) updatePayload.implementation_completed_date = implementation_completed_date;
      if (typeof should_include_in_learning === 'boolean') {
        updatePayload.should_include_in_learning = should_include_in_learning;
      }

      // Advance status if actuals were provided
      const hasActuals = Object.values(actuals).some(v => v != null);
      if (hasActuals && existing.status === 'completed_pending_actuals') {
        updatePayload.status = 'completed';
      }

      const { data: updated, error: updErr } = await sb
        .from('strategy_outcomes').update(updatePayload).eq('id', outcome_id).select('*').single();
      if (updErr) return Response.json({ error: updErr.message }, { status: 500 });

      return Response.json({
        outcome: updated,
        action: 'updated',
        actuals_entered: hasActuals,
        variance: totalVariance,
        accuracy_percentage: accuracyPct,
      });
    }

    // ── RECORD action (create/upsert) ──────────────────────────────────────────
    if (!source_type || !source_id) {
      return Response.json({ error: 'source_type and source_id required' }, { status: 400 });
    }

    // ── Tenant enforcement (Phase 6B.1) ──────────────────────────────────────
    // business_id here comes from the request body. Verify the caller is
    // authorized for that business before creating a business-owned row.
    // Admins/advisors keep their cross-business reach (mirrors the RLS model,
    // where super_admin bypasses business scoping).
    if (business_id && profile_id && !isAdminOrAdvisor) {
      try {
        await validateBusinessScope(sb, business_id, profile_id);
      } catch (scopeErr) {
        console.error('[recordStrategyOutcome] business scope denied:', scopeErr.message);
        return Response.json({ error: scopeErr.message, reason: 'business_scope_denied' }, { status: 403 });
      }
    }

    // Check for duplicate
    const { data: existingOutcome } = await sb
      .from('strategy_outcomes')
      .select('id, status')
      .eq('source_type', source_type)
      .eq('source_id', source_id)
      .eq('profile_id', profile_id)
      .eq('business_id', business_id)
      .neq('status', 'archived')
      .maybeSingle();

    if (existingOutcome) {
      // Already exists — don't duplicate; return existing
      return Response.json({
        outcome_id: existingOutcome.id,
        action: 'already_exists',
        status: existingOutcome.status,
        message: 'Outcome record already exists for this source. Use action=update to add actuals.',
      });
    }

    // ── Step 1: Resolve projected values from source ────────────────────────
    let projectedValues = {};
    let sourceName = body.source_name || '';
    let category = body.category || null;
    let strategyFamily = null;
    let expectedImplementationDays = null;

    if (source_type === 'roadmap_item') {
      const { data: item } = await sb
        .from('roadmap_items')
        .select('title, category, source_assessment_type, estimated_value_created, estimated_tax_savings, estimated_profit_improvement, estimated_cash_flow_improvement, impact_score')
        .eq('id', source_id)
        .maybeSingle();
      if (item) {
        sourceName = sourceName || item.title;
        category = category || item.source_assessment_type || item.category;
        projectedValues = {
          projected_profit_impact: item.estimated_profit_improvement || null,
          projected_tax_impact: item.estimated_tax_savings || null,
          projected_cash_flow_impact: item.estimated_cash_flow_improvement || null,
          projected_value_impact: null,
          projected_wealth_impact: null,
          projected_protection_impact: null,
          projected_freedom_acceleration_months: null,
        };
      }
    } else if (source_type === 'strategy_expansion') {
      const { data: exp } = await sb
        .from('client_strategy_expansions')
        .select('expansion_name, projected_profit_impact, projected_tax_impact, projected_value_impact, projected_cash_flow_impact, projected_freedom_acceleration_months, affected_gaps, confidence_score')
        .eq('id', source_id)
        .maybeSingle();
      if (exp) {
        sourceName = sourceName || exp.expansion_name;
        category = category || (exp.affected_gaps || [])[0] || null;
        projectedValues = {
          projected_profit_impact: exp.projected_profit_impact || null,
          projected_tax_impact: exp.projected_tax_impact || null,
          projected_value_impact: exp.projected_value_impact || null,
          projected_cash_flow_impact: exp.projected_cash_flow_impact || null,
          projected_wealth_impact: null,
          projected_protection_impact: null,
          projected_freedom_acceleration_months: exp.projected_freedom_acceleration_months || null,
        };
      }
    } else if (source_type === 'strategy') {
      // Look up from client_strategy_scores joined with strategy_library
      const { data: score } = await sb
        .from('client_strategy_scores')
        .select('strategy_id, projected_profit_impact, projected_tax_impact, projected_value_impact, projected_cash_flow_impact, projected_freedom_acceleration_months, confidence_score')
        .eq('id', source_id)
        .maybeSingle();
      if (score) {
        const { data: strat } = await sb
          .from('strategy_library')
          .select('strategy_name, category, strategy_family, implementation_days')
          .eq('id', score.strategy_id)
          .maybeSingle();
        sourceName = sourceName || strat?.strategy_name || '';
        category = category || strat?.category || null;
        strategyFamily = strat?.strategy_family || null;
        expectedImplementationDays = strat?.implementation_days || null;
        projectedValues = {
          projected_profit_impact: score.projected_profit_impact || null,
          projected_tax_impact: score.projected_tax_impact || null,
          projected_value_impact: score.projected_value_impact || null,
          projected_cash_flow_impact: score.projected_cash_flow_impact || null,
          projected_wealth_impact: null,
          projected_protection_impact: null,
          projected_freedom_acceleration_months: score.projected_freedom_acceleration_months || null,
        };
      }
    } else if (source_type === 'sprint_item') {
      // Sprint item source — look up projected values from linked expansion/strategy
      sourceName = sourceName || body.source_name || `Sprint Item`;
      category = category || body.category || null;

      // Try strategy_expansion link
      if (!body.projected_profit_impact) {
        const { data: exp } = await sb
          .from('client_strategy_expansions')
          .select('expansion_name, projected_profit_impact, projected_tax_impact, projected_value_impact, projected_cash_flow_impact, projected_freedom_acceleration_months, affected_gaps')
          .eq('business_id', business_id)
          .eq('status', 'recommended')
          .order('priority_rank', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (exp) {
          sourceName = sourceName || exp.expansion_name;
          if (!category) category = (exp.affected_gaps || [])[0] || null;
          projectedValues = {
            projected_profit_impact: exp.projected_profit_impact || null,
            projected_tax_impact: exp.projected_tax_impact || null,
            projected_value_impact: exp.projected_value_impact || null,
            projected_cash_flow_impact: exp.projected_cash_flow_impact || null,
            projected_wealth_impact: null,
            projected_protection_impact: null,
            projected_freedom_acceleration_months: exp.projected_freedom_acceleration_months || null,
          };
        }
      } else {
        projectedValues = {
          projected_profit_impact: body.projected_profit_impact || null,
          projected_tax_impact: body.projected_tax_impact || null,
          projected_value_impact: body.projected_value_impact || null,
          projected_cash_flow_impact: body.projected_cash_flow_impact || null,
          projected_wealth_impact: body.projected_wealth_impact || null,
          projected_protection_impact: body.projected_protection_impact || null,
          projected_freedom_acceleration_months: body.projected_freedom_acceleration_months || null,
        };
      }
    } else if (source_type === 'sprint') {
      // Sprint rollup source — use what's passed in or summed from items
      sourceName = sourceName || body.source_name || `90-Day Sprint`;
      projectedValues = {
        projected_profit_impact: body.projected_profit_impact || null,
        projected_tax_impact: body.projected_tax_impact || null,
        projected_value_impact: body.projected_value_impact || null,
        projected_cash_flow_impact: body.projected_cash_flow_impact || null,
        projected_wealth_impact: body.projected_wealth_impact || null,
        projected_protection_impact: body.projected_protection_impact || null,
        projected_freedom_acceleration_months: body.projected_freedom_acceleration_months || null,
      };
    } else if (source_type === 'manual_outcome') {
      // Manual outcome — use what's passed in directly
      sourceName = sourceName || body.source_name || 'Manual Outcome';
      projectedValues = {
        projected_profit_impact: body.projected_profit_impact || null,
        projected_tax_impact: body.projected_tax_impact || null,
        projected_value_impact: body.projected_value_impact || null,
        projected_cash_flow_impact: body.projected_cash_flow_impact || null,
        projected_wealth_impact: body.projected_wealth_impact || null,
        projected_protection_impact: body.projected_protection_impact || null,
        projected_freedom_acceleration_months: body.projected_freedom_acceleration_months || null,
      };
    }

    // ── Step 2: Fetch client context for learning fields ───────────────────
    const { data: biz } = await sb
      .from('business_entities')
      .select('industry, annual_revenue_range, employee_count')
      .eq('id', business_id)
      .maybeSingle();

    const { data: dash } = await sb
      .from('dashboard_metrics')
      .select('revenue, net_profit')
      .eq('profile_id', profile_id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const clientIndustry = biz?.industry || null;
    const clientRevenueRange = biz?.annual_revenue_range || (dash?.revenue ? revenueToRange(dash.revenue) : null);
    const clientEmployeeRange = biz?.employee_count ? employeeToRange(biz.employee_count) : null;
    const profitMarginRange = dash?.revenue && dash?.net_profit
      ? marginToRange((dash.net_profit / dash.revenue) * 100) : null;

    // ── Step 3: Calculate total projected impact ───────────────────────────
    const totalProjected = (projectedValues.projected_profit_impact || 0) +
      (projectedValues.projected_tax_impact || 0) +
      (projectedValues.projected_value_impact || 0) +
      (projectedValues.projected_cash_flow_impact || 0) +
      (projectedValues.projected_wealth_impact || 0) +
      (projectedValues.projected_protection_impact || 0);

    // ── Step 4: Build outcome row ──────────────────────────────────────────
    const outcomeRow = {
      profile_id,
      business_id,
      source_type,
      source_id,
      source_name: sourceName,
      strategy_id: body.strategy_id || null,
      strategy_score_id: source_type === 'strategy' ? source_id : null,
      strategy_expansion_id: source_type === 'strategy_expansion' ? source_id : null,
      roadmap_item_id: source_type === 'roadmap_item' ? source_id : (body.roadmap_item_id || null),
      sprint_id: (source_type === 'sprint' || source_type === 'sprint_item') ? (source_type === 'sprint' ? source_id : (body.sprint_id || null)) : (body.sprint_id || null),
      ...projectedValues,
      total_projected_impact: totalProjected || null,
      status: body.status || 'completed_pending_actuals',
      completion_status: body.completion_status || 'completed',
      expected_implementation_days: expectedImplementationDays,
      evidence_notes: evidence_notes || null,
      supporting_documents: supporting_documents || null,
      confidence_score: inputConfidence || 70,
      advisor_review_required: body.advisor_review_required || false,
      client_industry: clientIndustry,
      client_revenue_range: clientRevenueRange,
      client_employee_range: clientEmployeeRange,
      client_profit_margin_range: profitMarginRange,
      strategy_family: strategyFamily,
      category,
      should_include_in_learning: body.should_include_in_learning !== false,
      created_at: now,
      updated_at: now,
    };

    const { data: created, error: insertErr } = await sb
      .from('strategy_outcomes')
      .insert(outcomeRow)
      .select('*')
      .single();

    if (insertErr) {
      // Handle unique constraint violation gracefully
      if (insertErr.code === '23505') {
        const { data: dup } = await sb
          .from('strategy_outcomes')
          .select('id, status')
          .eq('source_type', source_type)
          .eq('source_id', source_id)
          .eq('profile_id', profile_id)
          .eq('business_id', business_id)
          .maybeSingle();
        return Response.json({
          outcome_id: dup?.id,
          action: 'already_exists',
          status: dup?.status,
          message: 'Duplicate prevented. Use action=update to add actuals.',
        });
      }
      return Response.json({ error: insertErr.message }, { status: 500 });
    }

    return Response.json({
      outcome_id: created.id,
      outcome: created,
      action: 'created',
      projected_impact: totalProjected || null,
      status: created.status,
      warnings: [],
    });

  } catch (error) {
    console.error('[recordStrategyOutcome] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function revenueToRange(revenue) {
  if (revenue < 250000) return 'under_250k';
  if (revenue < 500000) return '250k_500k';
  if (revenue < 1000000) return '500k_1m';
  if (revenue < 2500000) return '1m_2_5m';
  if (revenue < 5000000) return '2_5m_5m';
  if (revenue < 10000000) return '5m_10m';
  return 'over_10m';
}

function employeeToRange(count) {
  if (count <= 1) return 'solo';
  if (count <= 5) return '2_5';
  if (count <= 10) return '6_10';
  if (count <= 25) return '11_25';
  if (count <= 50) return '26_50';
  return 'over_50';
}

function marginToRange(margin) {
  if (margin < 5) return 'under_5pct';
  if (margin < 10) return '5_10pct';
  if (margin < 20) return '10_20pct';
  if (margin < 30) return '20_30pct';
  return 'over_30pct';
}