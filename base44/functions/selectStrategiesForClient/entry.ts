/**
 * selectStrategiesForClient — Compatibility Adapter (Phase 12B.2)
 *
 * Previously an independent strategy scoring engine. Now a thin adapter that:
 *   1. Receives canonical BIE recommendations from the frontend
 *   2. Delegates to resolveStrategyMappings for each recommendation_key
 *   3. Flattens resolved strategies into the legacy client_strategy_scores format
 *   4. Persists to client_strategy_scores (score fields = NULL, not fabricated)
 *   5. Runs the existing pipeline (expandStrategyOpportunities, freedom projections)
 *   6. Returns the same response shape consumers expect
 *
 * REMOVED:
 *   - scoreStrategy() — independent 6-factor scoring formula
 *   - buildRecommendationReason() — independent reason generation
 *   - projectImpact() — independent impact projection
 *   - Direct strategy_library query + independent scoring
 *
 * The single strategy-resolution source is resolveStrategyMappings.
 * The single recommendation-generation source is the BIE engine (frontend).
 *
 * Legacy score fields are set to NULL (not invented):
 *   opportunity_score, impact_score, confidence_score, ease_score,
 *   urgency_score, time_to_value_score, freedom_score, projected_*_impact
 *
 * Preserved:
 *   strategy_id, profile_id, business_id, recommendation_reason (from mapping
 *   applicability_notes), priority_rank (from mapping resolution order), status
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireBusinessContext } from '../../shared/businessScope/activeBusiness.ts';

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
    const { business_id, profile_id, recommendations, canonical_version, persist = true } = body;

    // ── Require canonical BIE recommendations ──────────────────────────────────
    if (!recommendations || !Array.isArray(recommendations) || recommendations.length === 0) {
      return Response.json({
        error: 'Canonical BIE recommendations required. Pass { recommendations: [...] } from the frontend BIE engine.',
        strategies: [],
        strategy_context: null,
        pipeline_status: { error: 'no_canonical_recommendations' },
      }, { status: 400 });
    }

    // ── Resolve profile and business scope ────────────────────────────────────
    let resolvedProfileId = profile_id;
    let resolvedBusinessId = business_id;
    if (!resolvedProfileId || !resolvedBusinessId) {
      const { data: prof } = await sb.from('profiles').select('id, primary_business_id').eq('email', user.email).maybeSingle();
      if (prof) {
        if (!resolvedProfileId) resolvedProfileId = prof.id;
        if (!resolvedBusinessId) {
          // Phase 6.9B — canonical resolution. Was `prof.primary_business_id`.
          const { businessId: canonBizId, denial: bizDenial } = await requireBusinessContext(
            sb, prof, null, 'selectStrategiesForClient.resolve'
          );
          if (bizDenial) return bizDenial;
          resolvedBusinessId = canonBizId;
        }
      }
    }
    if (!resolvedBusinessId) return Response.json({ error: 'business_id required' }, { status: 400 });

    // ── Verify business ownership or advisor access ────────────────────────────
    const isAdmin = user.role === 'admin' || user.role === 'super_admin';
    if (!isAdmin) {
      const { data: prof } = await sb.from('profiles').select('id').eq('email', user.email).maybeSingle();
      if (prof) {
        const { data: ownership } = await sb.from('business_owners')
          .select('business_id').eq('business_id', resolvedBusinessId).eq('profile_id', prof.id).maybeSingle();
        if (!ownership) {
          const { data: advisorAccess } = await sb.from('expert_advisor_access')
            .select('client_profile_id').eq('business_id', resolvedBusinessId)
            .eq('expert_profile_id', prof.id).eq('access_status', 'active').maybeSingle();
          if (!advisorAccess) return Response.json({ error: 'Not authorized for this business' }, { status: 403 });
        }
      }
    }

    // ── Step 1: Resolve strategies for each canonical recommendation ───────────
    const allResolvedStrategies: any[] = [];
    const resolutionErrors: string[] = [];

    for (const rec of recommendations) {
      if (rec.status !== 'active') continue;

      try {
        const resolveRes = await base44.functions.invoke('resolveStrategyMappings', {
          action: 'resolve',
          recommendation_key: rec.id || rec.metricId,
          business_id: resolvedBusinessId,
          profile_id: resolvedProfileId,
        });
        const resolved = resolveRes?.data?.strategies || [];
        for (const strategy of resolved) {
          allResolvedStrategies.push({
            ...strategy,
            // Attach BIE recommendation metadata for the legacy format
            _recommendation: rec,
          });
        }
      } catch (resolveErr) {
        resolutionErrors.push(`${rec.id}: ${resolveErr.message}`);
        console.warn('[selectStrategiesForClient] resolveStrategyMappings failed for', rec.id, resolveErr.message);
      }
    }

    // ── Step 2: Flatten into legacy client_strategy_scores format ─────────────
    // Score fields are NULL (not fabricated). Priority rank from mapping resolution order.
    const legacyRows = allResolvedStrategies.map((s, index) => {
      const rec = s._recommendation || {};
      return {
        strategy_id: s.strategy_id,
        strategy_name: s.title,
        category: s.category,
        strategy_family: s.strategy_family || null,
        // ── Score fields: NULL (no longer independently calculated) ──────────
        opportunity_score: null,
        impact_score: null,
        confidence_score: null,
        ease_score: null,
        urgency_score: null,
        time_to_value_score: null,
        freedom_score: null,
        // ── Projected impacts: NULL (not manufactured) ────────────────────────
        projected_profit_impact: null,
        projected_tax_impact: null,
        projected_value_impact: null,
        projected_cash_flow_impact: null,
        projected_freedom_acceleration_months: null,
        // ── Preserved fields ──────────────────────────────────────────────────
        recommendation_reason: s.applicability_notes || `Recommended via ${s.recommendation_key} mapping (${s.mapping_scope}, ${s.match_status})`,
        evidence_used: {
          source: 'bie_canonical',
          recommendation_key: s.recommendation_key,
          recommendation_title: rec.title || null,
          bie_estimated_impact: rec.estimatedImpact || null,
          bie_estimated_impact_formatted: rec.estimatedImpactFormatted || null,
          bie_confidence: rec.confidence || null,
          bie_priority: rec.priority || null,
          mapping_scope: s.mapping_scope,
          match_status: s.match_status,
        },
        missing_data: null,
        priority_rank: index + 1,
        status: 'recommended',
        // ── Explainability (from mapping, not fabricated) ────────────────────
        why_this_matters: s.desired_business_outcome || null,
        why_galileo_selected: s.applicability_notes || `Mapped via ${s.mapping_scope} scope`,
        suggested_next_sprint: s.implementation_days ? `Implement ${s.title} over ${s.implementation_days} days` : null,
      };
    });

    // ── Step 3: Persist to client_strategy_scores ──────────────────────────────
    if (persist && legacyRows.length > 0) {
      const now = new Date().toISOString();
      const upsertRows = legacyRows.slice(0, 20).map(s => ({
        profile_id: resolvedProfileId,
        business_id: resolvedBusinessId,
        strategy_id: s.strategy_id,
        opportunity_score: null,
        impact_score: null,
        confidence_score: null,
        ease_score: null,
        urgency_score: null,
        time_to_value_score: null,
        freedom_score: null,
        projected_profit_impact: null,
        projected_tax_impact: null,
        projected_value_impact: null,
        projected_cash_flow_impact: null,
        projected_freedom_acceleration_months: null,
        recommendation_reason: s.recommendation_reason,
        evidence_used: s.evidence_used,
        missing_data: null,
        priority_rank: s.priority_rank,
        status: s.status,
        updated_at: now,
      }));

      // Delete old scores for this business before inserting fresh ones
      await sb.from('client_strategy_scores').delete().eq('business_id', resolvedBusinessId);
      await sb.from('client_strategy_scores').insert(upsertRows);
    }

    // ── Step 4: Build legacy response shape ────────────────────────────────────
    const top10 = legacyRows.slice(0, 10);
    const strategyContextSummary = {
      total_strategies_evaluated: legacyRows.length,
      top_strategies: top10.map(s => ({
        rank: s.priority_rank,
        name: s.strategy_name,
        category: s.category,
        opportunity_score: null, // NULL — no longer calculated
        why_galileo_selected: s.why_galileo_selected,
        projected_profit_impact: null,
        projected_tax_impact: null,
        projected_value_impact: null,
        projected_freedom_acceleration_months: null,
        evidence_used: s.evidence_used,
        missing_data: s.missing_data,
        suggested_next_sprint: s.suggested_next_sprint,
      })),
      by_category: top10.reduce((acc: any, s) => {
        if (!acc[s.category]) acc[s.category] = [];
        acc[s.category].push(s.strategy_name);
        return acc;
      }, {}),
    };

    // ── Step 5: Pipeline orchestration — expand → project (all non-blocking) ──
    const pipelineStatus: any = {
      strategy_scores: 'success',
      expansions: 'skipped',
      freedom_projections: 'skipped',
      scores_created: Math.min(legacyRows.length, 20),
      expansions_created: 0,
      projections_created: 0,
      warnings: [],
      errors: resolutionErrors,
    };

    // Stage 1: expandStrategyOpportunities
    let expansionData = null;
    try {
      const expRes = await base44.functions.invoke('expandStrategyOpportunities', {
        business_id: resolvedBusinessId,
        profile_id: resolvedProfileId,
        persist: true,
      });
      expansionData = expRes?.data || null;
      pipelineStatus.expansions = 'success';
      pipelineStatus.expansions_created = expansionData?.persisted_count || expansionData?.total_expansions || 0;
    } catch (expErr) {
      pipelineStatus.expansions = 'failed';
      pipelineStatus.errors.push(`Expansion engine: ${expErr.message}`);
      console.warn('[selectStrategiesForClient] expandStrategyOpportunities failed (non-fatal):', expErr.message);
    }

    // Stage 2: bulkProjectFromExpansions (only if expansions succeeded)
    if (pipelineStatus.expansions === 'success') {
      try {
        const projRes = await base44.functions.invoke('calculateFreedomAcceleration', {
          action: 'bulkProjectFromExpansions',
          data: { business_id: resolvedBusinessId, profile_id: resolvedProfileId },
        });
        const projData = projRes?.data || null;
        if (projData?.message && projData.message.includes('No expansions found')) {
          pipelineStatus.freedom_projections = 'skipped';
          pipelineStatus.warnings.push('No eligible expansions found for freedom projection');
        } else {
          pipelineStatus.freedom_projections = 'success';
          pipelineStatus.projections_created = (projData?.projections || []).length;
        }
      } catch (projErr) {
        pipelineStatus.freedom_projections = 'failed';
        pipelineStatus.errors.push(`Freedom projections: ${projErr.message}`);
        console.warn('[selectStrategiesForClient] bulkProjectFromExpansions failed (non-fatal):', projErr.message);
      }
    } else {
      pipelineStatus.freedom_projections = 'skipped';
      pipelineStatus.warnings.push('Freedom projections skipped — expansion stage did not complete');
    }

    return Response.json({
      strategies: legacyRows,
      strategy_context: strategyContextSummary,
      client_data_used: {
        canonical_version: canonical_version || 1,
        recommendation_count: recommendations.length,
        resolved_strategy_count: legacyRows.length,
      },
      pipeline_status: pipelineStatus,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[selectStrategiesForClient] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});