/**
 * aiLearningGovernance — AI Learning Governance Engine (Phase 12C Refinement)
 *
 * Manages auditable learning patterns from verified strategy outcomes.
 * Only verified or advisor-approved outcomes influence learning.
 * Every learned pattern is auditable with full provenance.
 *
 * Actions:
 *   record    — Record a learning pattern from a verified outcome
 *   list      — List learning patterns with audit info
 *   validate  — Advisor validates/corrects/rejects a pattern
 *   summary   — Get learning summary for a recommendation
 *
 * Architecture:
 *   Outcome Recorded → Actual vs Projected Compared → Pattern Identified →
 *   AI Learns → Advisor Validates → Pattern Approved → Future Ranking Improves
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  recordLearningPattern,
  fetchLearningPatterns,
} from '../../shared/galileoBieConsumer/entry.ts';
import {
  resolveActorBusinessContext,
  businessContextError,
} from '../../shared/businessScope/activeBusiness.ts';

Deno.serve(async (req) => {
  const b44 = createClientFromRequest(req);
  const { action, data } = await req.json().catch(() => ({ action: null, data: {} }));

  // Normalized exactly like every other Supabase-backed function. VITE_SUPABASE_URL
  // carries a /rest/v1/ suffix; passing it through raw makes every request
  // malformed, so ALL queries resolved to { data: null } and actor/business
  // resolution could never find a profile.
  const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
  const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
  const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  try {
    const user = await b44.auth.me();

    // ── PHASE 6.9 — BUSINESS SCOPE CONTRACT ───────────────────────────────────
    // ACTION CLASSIFICATION:
    //   record           BUSINESS_SCOPED — the resolved business becomes the
    //                    provenance stamped on the pattern (businesses_included),
    //                    so it must come from an explicit selection.
    //   list / summary   ACCOUNT_GLOBAL  — the learning layer aggregates patterns
    //                    across businesses by design: strategy_learning_summary
    //                    carries no business_id, only businesses_included, and
    //                    fetchLearningPatterns resolves by recommendation_key.
    //   validate         ACCOUNT_GLOBAL  — advisor governance over that same
    //                    platform-level layer.
    // Only `record` resolves a business, through the canonical contract: explicit
    // selection required, never a silent primary_business_id substitution.
    if (action === 'record') {
      let businessId: string | null = null;
      try {
        ({ businessId } = await resolveActorBusinessContext(sb, user, data, { action: 'aiLearningGovernance.record' }));
      } catch (bizErr) {
        return businessContextError(bizErr);
      }
      if (!businessId) return json({ status: 'error', message: 'business_id required' }, 400);

      const { recommendation_key, strategy_id, strategy_name, outcome_data } = data;
      if (!recommendation_key || !outcome_data) throw new Error('recommendation_key and outcome_data required');

      // Only record from verified or advisor-approved outcomes
      if (!outcome_data.verified && !outcome_data.advisor_approved) {
        return json({
          status: 'error',
          message: 'Only verified or advisor-approved outcomes can generate learning patterns',
        }, 400);
      }

      // Calculate pattern confidence from outcome accuracy
      const projected = outcome_data.projected_value || 0;
      const actual = outcome_data.actual_value || 0;
      const accuracy = projected > 0 ? Math.max(0, 100 - Math.abs((actual - projected) / projected * 100)) : 50;
      const outcomeQuality = accuracy > 80 ? 'high' : accuracy > 50 ? 'medium' : 'low';

      const pattern = {
        pattern_source: 'strategy_outcomes',
        recommendation_key,
        strategy_id,
        strategy_name,
        businesses_included: [businessId],
        sample_size: 1,
        confidence: Math.round(accuracy),
        outcome_quality: outcomeQuality,
        learning_summary: `Strategy "${strategy_name}" for ${recommendation_key}: projected ${projected}, actual ${actual}, accuracy ${Math.round(accuracy)}%`,
        matching_criteria: {
          industry: outcome_data.industry,
          revenue_range: outcome_data.revenue_range,
          business_maturity: outcome_data.business_maturity,
        },
        ranking_adjustment: accuracy > 80 ? 10 : accuracy < 50 ? -10 : 0,
        model_version: 'ai_learning_governance_v1',
      };

      const result = await recordLearningPattern(sb, pattern);

      return json({
        status: result.recorded ? 'success' : 'error',
        pattern_id: result.pattern_id,
        recorded: result.recorded,
        error: result.error,
        note: 'Pattern recorded as experimental. Requires advisor validation before influencing production rankings.',
      });
    }

    // ── LIST: List learning patterns with audit info ──────────────────────────
    if (action === 'list') {
      const { recommendation_key, include_experimental } = data;
      // ACCOUNT_GLOBAL — platform learning layer, not business-scoped.
      const patterns = await fetchLearningPatterns(sb, recommendation_key);

      const filtered = include_experimental
        ? patterns
        : patterns.filter(p => !p.is_experimental || p.advisor_validation_status === 'validated');

      return json({
        status: 'success',
        patterns: filtered,
        count: filtered.length,
        audit_summary: {
          total_patterns: patterns.length,
          validated: patterns.filter(p => p.advisor_validation_status === 'validated').length,
          experimental: patterns.filter(p => p.is_experimental).length,
          production_ready: patterns.filter(p => !p.is_experimental || p.advisor_validation_status === 'validated').length,
        },
      });
    }

    // ── VALIDATE: Advisor validates/corrects/rejects a pattern ─────────────────
    if (action === 'validate') {
      const { pattern_id, decision, correction_notes, adjusted_ranking } = data;
      if (!pattern_id || !decision) throw new Error('pattern_id and decision required');

      const role = user.role;
      if (!['super_admin', 'advisor', 'admin'].includes(role)) {
        return json({ status: 'error', message: 'Only advisors can validate learning patterns' }, 403);
      }

      const updateData: any = {
        advisor_validation_status: decision,
        validated_by: user.email,
        validated_at: new Date().toISOString(),
        last_updated: new Date().toISOString(),
      };

      // If validated, mark as production-ready (not experimental)
      if (decision === 'validated') {
        updateData.is_experimental = false;
      }
      // If corrected, apply adjusted ranking
      if (decision === 'corrected' && adjusted_ranking != null) {
        updateData.ranking_adjustment = adjusted_ranking;
        updateData.is_experimental = false;
      }
      if (correction_notes) {
        updateData.learning_summary = `${correction_notes}`;
      }

      const { data: updated, error } = await sb.from('strategy_learning_summary')
        .update(updateData)
        .eq('pattern_id', pattern_id)
        .select()
        .single();

      if (error) return json({ status: 'error', message: error.message }, 500);

      return json({
        status: 'success',
        pattern: updated,
        advisor_decision: decision,
        note: decision === 'validated'
          ? 'Pattern approved for production ranking influence'
          : decision === 'corrected'
          ? 'Pattern corrected with advisor adjustments'
          : 'Pattern rejected — will not influence future rankings',
      });
    }

    // ── SUMMARY: Get learning summary for a recommendation ────────────────────
    if (action === 'summary') {
      const { recommendation_key } = data;
      // ACCOUNT_GLOBAL — platform learning layer, not business-scoped.
      const patterns = await fetchLearningPatterns(sb, recommendation_key);

      const validated = patterns.filter(p => p.advisor_validation_status === 'validated');
      const experimental = patterns.filter(p => p.is_experimental);
      const avgConfidence = patterns.length > 0
        ? Math.round(patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length)
        : 0;

      return json({
        status: 'success',
        recommendation_key,
        total_patterns: patterns.length,
        validated_patterns: validated.length,
        experimental_patterns: experimental.length,
        average_confidence: avgConfidence,
        top_strategies: patterns.slice(0, 5).map(p => ({
          strategy_name: p.strategy_name,
          confidence: p.confidence,
          outcome_quality: p.outcome_quality,
          validation_status: p.advisor_validation_status,
          sample_size: p.sample_size,
        })),
        governance_note: 'Only validated patterns influence production strategy rankings. Experimental patterns are tracked but do not alter recommendations.',
      });
    }

    return json({ status: 'error', message: `Unknown action: ${action}` }, 400);
  } catch (e: any) {
    return json({ status: 'error', message: e.message, stack: e.stack }, 500);
  }
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}