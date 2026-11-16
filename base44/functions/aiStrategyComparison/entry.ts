/**
 * aiStrategyComparison — AI Strategy Comparison Engine (Phase 12C Refinement)
 *
 * AI compares multiple approved Strategy Library options for a canonical recommendation.
 * AI may evaluate fit, tradeoffs, second-order effects — but only among approved strategies.
 * AI must NOT invent strategies outside the approved Strategy Library.
 *
 * Action: compare
 *   Input:  { recommendation_key, business_id, profile_id }
 *   Output: comparative_analysis, recommended_order, overall_reasoning, key_assumptions
 *
 * Architecture:
 *   BIE Recommendation → Deterministic mapping → Approved candidates → AI comparative reasoning
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  fetchCanonicalRecommendations,
  resolveStrategyContext,
  compareApprovedStrategies,
  fetchLearningPatterns,
  applyLearningAdjustments,
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
    // The single `compare` action is BUSINESS_SCOPED: it reads canonical BIE
    // recommendations, strategy mappings and learning patterns for ONE business.
    // Actor identity and the business come from the canonical contract, which
    // REFUSES an ambiguous request (400 BUSINESS_CONTEXT_REQUIRED) rather than
    // substituting profile.primary_business_id.
    let profileId: string | null = null;
    let businessId: string | null = null;
    let membershipStatus = 'free';
    try {
      ({ profileId, businessId, membershipStatus } = await resolveActorBusinessContext(sb, user, data, { action: 'aiStrategyComparison' }));
    } catch (bizErr) {
      return businessContextError(bizErr);
    }
    if (!businessId) return json({ status: 'error', message: 'business_id required' }, 400);

    if (action === 'compare') {
      const { recommendation_key } = data;
      if (!recommendation_key) throw new Error('recommendation_key required');

      // 1. Fetch canonical BIE recommendation
      const bieResult = await fetchCanonicalRecommendations(sb, profileId, businessId);
      const recommendation = bieResult.recommendations.find(r => r.recommendation_key === recommendation_key);
      if (!recommendation) {
        return json({ status: 'error', message: 'Canonical recommendation not found' }, 404);
      }

      // 2. Resolve approved strategy options (deterministic eligibility)
      const strategyContext = await resolveStrategyContext(
        sb, recommendation_key, businessId, profileId, user.role, membershipStatus,
      );

      if (!strategyContext.strategy_options || strategyContext.strategy_options.length === 0) {
        return json({
          status: 'success',
          comparison: { comparison_available: false, reason: 'No approved strategies mapped to this recommendation' },
          recommendation_key,
        });
      }

      // 3. Fetch learning patterns for this recommendation
      const learningPatterns = await fetchLearningPatterns(sb, recommendation_key, businessId);

      // 4. Apply learning adjustments (only advisor-validated patterns)
      const adjustedOptions = applyLearningAdjustments(strategyContext.strategy_options, learningPatterns);

      // 5. AI comparative reasoning among approved strategies only
      const comparison = await compareApprovedStrategies(
        sb, b44, recommendation, adjustedOptions, bieResult.raw, user.role,
      );

      return json({
        status: 'success',
        recommendation_key,
        comparison,
        learning_patterns_applied: learningPatterns.length,
        access_level: strategyContext.user_access_level,
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