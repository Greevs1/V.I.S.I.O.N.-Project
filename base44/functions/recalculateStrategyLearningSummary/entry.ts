/**
 * recalculateStrategyLearningSummary — Phase 7: Learning Analytics
 *
 * Aggregates verified, learning-approved strategy_outcomes into
 * strategy_learning_summary for future Galileo context enrichment.
 *
 * ANALYTICS ONLY — does not change Galileo recommendation logic.
 * Only uses outcomes where status='verified' AND should_include_in_learning=true.
 *
 * Actions:
 *   'recalculate'   — full recalculation (default, admin only)
 *   'getSummary'    — read learning data for a strategy or category
 *   'getForContext' — get learning context for Galileo injection (minimal, fast)
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';

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
    const { action = 'recalculate', strategy_id, category, industry } = body;

    const { data: callerProfile } = await sb.from('profiles')
      .select('app_role').eq('email', user.email).maybeSingle();
    const callerRole = callerProfile?.app_role || user.role || 'owner';
    const isAdminOrAdvisor = ['super_admin', 'advisor', 'admin'].includes(callerRole);

    // ── GET SUMMARY action ─────────────────────────────────────────────────────
    if (action === 'getSummary') {
      let query = sb.from('strategy_learning_summary').select('*').order('sample_size', { ascending: false });
      if (strategy_id) query = query.eq('strategy_id', strategy_id);
      if (category) query = query.eq('category', category);
      if (industry) query = query.eq('industry', industry);
      const { data: summaries } = await query.limit(50);
      return Response.json({ summaries: summaries || [] });
    }

    // ── GET FOR GALILEO CONTEXT action ─────────────────────────────────────────
    if (action === 'getForContext') {
      // Lightweight — returns top performing categories with sample sizes
      const { data: summaries } = await sb
        .from('strategy_learning_summary')
        .select('category, strategy_family, average_actual_impact, average_accuracy_percentage, sample_size, success_rate, average_freedom_acceleration')
        .gte('sample_size', 2)  // Only include meaningful samples
        .order('average_accuracy_percentage', { ascending: false })
        .limit(20);

      const { data: allOutcomes } = await sb
        .from('strategy_outcomes')
        .select('status, source_type, category, total_actual_impact, total_projected_impact, accuracy_percentage')
        .in('status', ['verified', 'completed', 'completed_pending_actuals']);

      const outcomes = allOutcomes || [];
      const verifiedOuts = outcomes.filter(o => o.status === 'verified');
      const pendingActuals = outcomes.filter(o => o.status === 'completed_pending_actuals');

      const totalProjected = outcomes.reduce((s, o) => s + (o.total_projected_impact || 0), 0);
      const totalActual = verifiedOuts.reduce((s, o) => s + (o.total_actual_impact || 0), 0);
      const avgAccuracy = verifiedOuts.length > 0
        ? Math.round(verifiedOuts.filter(o => o.accuracy_percentage).reduce((s, o) => s + o.accuracy_percentage, 0) / verifiedOuts.filter(o => o.accuracy_percentage).length)
        : null;

      return Response.json({
        outcome_summary: {
          total_outcomes: outcomes.length,
          verified_count: verifiedOuts.length,
          pending_actuals_count: pendingActuals.length,
          total_projected_impact: totalProjected || null,
          total_actual_impact: totalActual || null,
          total_variance: totalActual - totalProjected || null,
          average_accuracy_percentage: avgAccuracy,
        },
        learning_data: summaries || [],
        has_meaningful_data: verifiedOuts.length >= 1,
      });
    }

    // ── RECALCULATE action (admin only) ────────────────────────────────────────
    if (!isAdminOrAdvisor) {
      return Response.json({ error: 'Forbidden — admin/advisor only' }, { status: 403 });
    }

    // Fetch all verified, learning-eligible outcomes
    const { data: eligibleOutcomes, error: fetchErr } = await sb
      .from('strategy_outcomes')
      .select('*')
      .eq('status', 'verified')
      .eq('should_include_in_learning', true);

    if (fetchErr) return Response.json({ error: fetchErr.message }, { status: 500 });
    const outcomes = eligibleOutcomes || [];

    if (outcomes.length === 0) {
      return Response.json({ message: 'No verified, learning-eligible outcomes found', summaries_created: 0 });
    }

    // Group by strategy_id + industry + revenue_range
    const groups = {};
    for (const o of outcomes) {
      const key = `${o.strategy_id || 'no_strategy'}|${o.category || 'general'}|${o.client_industry || 'unknown'}|${o.client_revenue_range || 'unknown'}`;
      if (!groups[key]) {
        groups[key] = {
          strategy_id: o.strategy_id,
          strategy_family: o.strategy_family,
          category: o.category,
          industry: o.client_industry,
          revenue_range: o.client_revenue_range,
          employee_range: o.client_employee_range,
          outcomes: [],
        };
      }
      groups[key].outcomes.push(o);
    }

    const now = new Date().toISOString();
    const summariesToUpsert = [];

    for (const [, group] of Object.entries(groups)) {
      const outs = group.outcomes;
      const n = outs.length;

      const avg = (field) => {
        const vals = outs.map(o => o[field]).filter(v => v != null);
        return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
      };

      const totalProjected = outs.reduce((s, o) => s + (o.total_projected_impact || 0), 0);
      const totalActual = outs.reduce((s, o) => s + (o.total_actual_impact || 0), 0);
      const avgVariance = n > 0 ? Math.round((totalActual - totalProjected) / n) : null;

      // Success rate: outcomes where actual >= 80% of projected
      const successCount = outs.filter(o =>
        o.total_projected_impact > 0 && o.total_actual_impact != null &&
        (o.total_actual_impact / o.total_projected_impact) >= 0.8
      ).length;

      const avgAccuracy = avg('accuracy_percentage');
      const avgFreedom = avg('actual_freedom_acceleration_months');
      const avgImplDays = avg('implementation_days');

      // Confidence score: based on sample size
      const confidence = Math.min(95, 30 + (n * 10));

      summariesToUpsert.push({
        strategy_id: group.strategy_id,
        strategy_family: group.strategy_family,
        category: group.category,
        industry: group.industry,
        revenue_range: group.revenue_range,
        employee_range: group.employee_range,
        sample_size: n,
        average_projected_impact: n > 0 ? Math.round(totalProjected / n) : null,
        average_actual_impact: n > 0 ? Math.round(totalActual / n) : null,
        average_variance: avgVariance,
        average_accuracy_percentage: avgAccuracy,
        average_implementation_days: avgImplDays,
        success_rate: n > 0 ? Math.round((successCount / n) * 100) : null,
        average_freedom_acceleration: avgFreedom,
        confidence_score: confidence,
        last_calculated_at: now,
        updated_at: now,
      });
    }

    // Upsert all summaries
    let upsertedCount = 0;
    for (const summary of summariesToUpsert) {
      const { error: upsErr } = await sb
        .from('strategy_learning_summary')
        .upsert(summary, { onConflict: 'strategy_id,industry,revenue_range', ignoreDuplicates: false });
      if (!upsErr) upsertedCount++;
      else console.warn('[recalculateStrategyLearningSummary] upsert failed (non-fatal):', upsErr.message);
    }

    return Response.json({
      success: true,
      eligible_outcomes: outcomes.length,
      groups_processed: Object.keys(groups).length,
      summaries_upserted: upsertedCount,
      generated_at: now,
    });

  } catch (error) {
    console.error('[recalculateStrategyLearningSummary] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});