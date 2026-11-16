/**
 * onSprintItemCompleted — triggered when a SprintTask is marked completed.
 * Creates a strategy_outcomes record with source_type = sprint_item.
 * Also handles sprint-level rollup (source_type = sprint) when sprint is completed.
 *
 * ADDITIVE ONLY — does not break roadmap hook or existing strategy_outcomes.
 *
 * Invocation payload (direct or from entity automation):
 *   { sprint_task_id, sprint_id, action }
 *   OR automation entity payload: { data: {...SprintTask}, event: { type, entity_id } }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

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

    // Support direct call with sprint_task_id, OR entity automation payload
    const sprintTaskId = body.sprint_task_id || body.data?.id || body.event?.entity_id;
    const action = body.action || 'sprint_item_completed';

    if (!sprintTaskId && action !== 'sprint_completed') {
      return Response.json({ error: 'sprint_task_id required' }, { status: 400 });
    }

    const now = new Date().toISOString();

    // ── Handle sprint_item_completed ─────────────────────────────────────────
    if (action === 'sprint_completed' && body.sprint_id) {
      return await handleSprintRollup(sb, body.sprint_id, now);
    }

    // ── Fetch the sprint task from Base44 ────────────────────────────────────
    // Phase 6B.2 — NEVER trust body.data for business scope.
    // CROSS-TENANT HOLE (fixed here): body.data was used directly as the sprint
    // task, so any caller could supply { data: { id, status: 'completed',
    // sprint_id, business_id } } and have a business-owned strategy_outcomes row
    // written against an arbitrary business — including a business they have no
    // relationship with. The entity-automation payload only identifies WHICH
    // record (body.data.id / body.event.entity_id); the authoritative record is
    // always re-read server-side and its persisted business_id is what scopes the
    // write. This is the automation analogue of "inherit business_id from a
    // verified parent".
    const { data: authoritativeTask } = await base44.asServiceRole.entities.SprintTask.filter({ id: sprintTaskId });
    const sprintTask = authoritativeTask?.[0] || null;

    if (!sprintTask) {
      return Response.json({ error: 'SprintTask not found', sprint_task_id: sprintTaskId }, { status: 404 });
    }

    // Only proceed if the task is actually completed
    if (sprintTask.status !== 'completed') {
      return Response.json({ skipped: true, reason: `status is ${sprintTask.status}, not completed` });
    }

    const sprintId = sprintTask.sprint_id;
    const businessId = sprintTask.business_id || null;

    // Resolve profile/business from Base44 sprint entity
    let profileId = null;
    let resolvedBusinessId = businessId;

    if (sprintId) {
      const sprints = await base44.asServiceRole.entities.NinetyDaySprint.filter({ id: sprintId });
      const sprint = sprints?.[0] || null;
      if (sprint?.business_id) resolvedBusinessId = sprint.business_id;
    }

    // If still no business_id, try to resolve via Supabase profiles
    if (!resolvedBusinessId) {
      return Response.json({ skipped: true, reason: 'Cannot resolve business_id for outcome record' });
    }

    // Resolve profile from business
    const { data: bizProfile } = await sb
      .from('profiles')
      .select('id')
      .eq('primary_business_id', resolvedBusinessId)
      .limit(1)
      .maybeSingle();
    profileId = bizProfile?.id || null;

    if (!profileId) {
      return Response.json({ skipped: true, reason: 'Cannot resolve profile_id for business' });
    }

    // ── Check if outcome already exists for this sprint task ─────────────────
    const { data: existing } = await sb
      .from('strategy_outcomes')
      .select('id, status')
      .eq('source_type', 'sprint_item')
      .eq('source_id', sprintTaskId)
      .neq('status', 'archived')
      .maybeSingle();

    if (existing) {
      return Response.json({
        outcome_id: existing.id,
        action: 'already_exists',
        status: existing.status,
        message: 'Outcome record already exists for this sprint item.',
      });
    }

    // ── Resolve projected impact from linked expansion/strategy ──────────────
    let projectedValues = {
      projected_profit_impact: null,
      projected_tax_impact: null,
      projected_value_impact: null,
      projected_cash_flow_impact: null,
      projected_wealth_impact: null,
      projected_protection_impact: null,
      projected_freedom_acceleration_months: null,
    };
    let category = sprintTask.impact || null;
    let sourceName = sprintTask.title || `Sprint Task ${sprintTaskId}`;

    // Look for a linked strategy expansion matching the sprint/task context
    try {
      const { data: expansions } = await sb
        .from('client_strategy_expansions')
        .select('id, expansion_name, projected_profit_impact, projected_tax_impact, projected_value_impact, projected_cash_flow_impact, projected_freedom_acceleration_months, affected_gaps')
        .eq('business_id', resolvedBusinessId)
        .eq('status', 'recommended')
        .order('priority_rank', { ascending: true })
        .limit(1);

      if (expansions && expansions.length > 0) {
        const exp = expansions[0];
        projectedValues = {
          projected_profit_impact: exp.projected_profit_impact || null,
          projected_tax_impact: exp.projected_tax_impact || null,
          projected_value_impact: exp.projected_value_impact || null,
          projected_cash_flow_impact: exp.projected_cash_flow_impact || null,
          projected_wealth_impact: null,
          projected_protection_impact: null,
          projected_freedom_acceleration_months: exp.projected_freedom_acceleration_months || null,
        };
        if (!category) category = (exp.affected_gaps || [])[0] || null;
      }
    } catch (_) { /* Non-fatal */ }

    // Also check client_strategy_scores for projected impact
    if (!projectedValues.projected_profit_impact) {
      try {
        const { data: scores } = await sb
          .from('client_strategy_scores')
          .select('projected_profit_impact, projected_tax_impact, projected_value_impact, projected_cash_flow_impact, projected_freedom_acceleration_months')
          .eq('business_id', resolvedBusinessId)
          .order('priority_rank', { ascending: true })
          .limit(1);
        if (scores && scores[0]) {
          const s = scores[0];
          projectedValues = {
            projected_profit_impact: s.projected_profit_impact || null,
            projected_tax_impact: s.projected_tax_impact || null,
            projected_value_impact: s.projected_value_impact || null,
            projected_cash_flow_impact: s.projected_cash_flow_impact || null,
            projected_wealth_impact: null,
            projected_protection_impact: null,
            projected_freedom_acceleration_months: s.projected_freedom_acceleration_months || null,
          };
        }
      } catch (_) { /* Non-fatal */ }
    }

    const totalProjected = Object.values(projectedValues)
      .filter(v => typeof v === 'number')
      .reduce((s, v) => s + v, 0) || null;

    // ── Build and insert outcome row ─────────────────────────────────────────
    const outcomeRow = {
      profile_id: profileId,
      business_id: resolvedBusinessId,
      source_type: 'sprint_item',
      source_id: sprintTaskId,
      source_name: sourceName,
      sprint_id: sprintId || null,
      category,
      ...projectedValues,
      total_projected_impact: totalProjected,
      status: 'completed_pending_actuals',
      completion_status: 'completed',
      confidence_score: 65,
      should_include_in_learning: true,
      created_at: now,
      updated_at: now,
    };

    const { data: created, error: insertErr } = await sb
      .from('strategy_outcomes')
      .insert(outcomeRow)
      .select('id, status')
      .single();

    if (insertErr) {
      if (insertErr.code === '23505') {
        return Response.json({ action: 'already_exists', message: 'Duplicate prevented.' });
      }
      console.error('[onSprintItemCompleted] Insert error:', insertErr.message);
      return Response.json({ error: insertErr.message }, { status: 500 });
    }

    console.log('[onSprintItemCompleted] Outcome created:', created.id, 'for sprint task:', sprintTaskId);

    return Response.json({
      outcome_id: created.id,
      action: 'created',
      source_type: 'sprint_item',
      sprint_task_id: sprintTaskId,
      sprint_id: sprintId,
      status: 'completed_pending_actuals',
      projected_impact: totalProjected,
    });

  } catch (error) {
    console.error('[onSprintItemCompleted] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ── Sprint Rollup Handler ────────────────────────────────────────────────────
async function handleSprintRollup(sb, sprintId, now) {
  try {
    // Check for existing sprint-level outcome
    const { data: existing } = await sb
      .from('strategy_outcomes')
      .select('id, status')
      .eq('source_type', 'sprint')
      .eq('source_id', sprintId)
      .neq('status', 'archived')
      .maybeSingle();

    if (existing) {
      return Response.json({ outcome_id: existing.id, action: 'already_exists', source_type: 'sprint' });
    }

    // Sum projected values from all sprint_item outcomes for this sprint
    const { data: itemOutcomes } = await sb
      .from('strategy_outcomes')
      .select('profile_id, business_id, total_projected_impact, projected_profit_impact, projected_tax_impact, projected_value_impact, projected_cash_flow_impact, projected_freedom_acceleration_months')
      .eq('sprint_id', sprintId)
      .eq('source_type', 'sprint_item');

    if (!itemOutcomes || itemOutcomes.length === 0) {
      return Response.json({ skipped: true, reason: 'No sprint item outcomes found to roll up' });
    }

    const profileId = itemOutcomes[0]?.profile_id;
    const businessId = itemOutcomes[0]?.business_id;
    const sumField = (f) => itemOutcomes.reduce((s, o) => s + (o[f] || 0), 0) || null;

    const rollupRow = {
      profile_id: profileId,
      business_id: businessId,
      source_type: 'sprint',
      source_id: sprintId,
      source_name: `90-Day Sprint Rollup`,
      sprint_id: sprintId,
      projected_profit_impact: sumField('projected_profit_impact'),
      projected_tax_impact: sumField('projected_tax_impact'),
      projected_value_impact: sumField('projected_value_impact'),
      projected_cash_flow_impact: sumField('projected_cash_flow_impact'),
      projected_freedom_acceleration_months: sumField('projected_freedom_acceleration_months'),
      total_projected_impact: sumField('total_projected_impact'),
      status: 'completed_pending_actuals',
      completion_status: 'completed',
      confidence_score: 60,
      should_include_in_learning: true,
      created_at: now,
      updated_at: now,
    };

    const { data: rollup, error: rollupErr } = await sb
      .from('strategy_outcomes')
      .insert(rollupRow)
      .select('id, status')
      .single();

    if (rollupErr) {
      if (rollupErr.code === '23505') return Response.json({ action: 'already_exists' });
      return Response.json({ error: rollupErr.message }, { status: 500 });
    }

    return Response.json({
      outcome_id: rollup.id,
      action: 'sprint_rollup_created',
      source_type: 'sprint',
      sprint_id: sprintId,
      item_count: itemOutcomes.length,
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}