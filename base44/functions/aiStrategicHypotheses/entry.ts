/**
 * aiStrategicHypotheses — AI Strategic Hypothesis Engine (Phase 12C Refinement)
 *
 * AI generates strategic hypotheses from patterns, outcomes, and context.
 * Hypotheses are clearly labeled and require advisor review before becoming canonical.
 *
 * Actions:
 *   generate  — AI analyzes patterns + context to produce a hypothesis
 *   list      — List hypotheses for a business/recommendation
 *   review    — Advisor reviews a hypothesis (confirm/reject/needs_more_data)
 *   promote   — Promote a confirmed hypothesis toward canonical (requires advisor approval)
 *
 * Architecture:
 *   BIE = verified source of business truth
 *   AI = strategic reasoning and learning layer
 *   Hypotheses = clearly labeled, advisor-gated, never auto-canonical
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  fetchCanonicalRecommendations,
  generateStrategicHypothesis,
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
    // ALL FOUR actions are BUSINESS_SCOPED: strategic_hypotheses is a
    // business-owned table (generateStrategicHypothesis writes business_id), and
    // each action reads or writes it within one business:
    //   generate — reads canonical BIE recommendations, persists a scoped hypothesis
    //   list     — filters strategic_hypotheses by business_id
    //   review   — updates a hypothesis addressed by id → record scope enforced
    //   promote  — updates a hypothesis addressed by id → record scope enforced
    // Actor identity and the business are resolved through the canonical contract,
    // which REFUSES an ambiguous request (400 BUSINESS_CONTEXT_REQUIRED) rather
    // than substituting profile.primary_business_id.
    let profileId: string | null = null;
    let businessId: string | null = null;
    try {
      ({ profileId, businessId } = await resolveActorBusinessContext(sb, user, data, { action: `aiStrategicHypotheses.${action}` }));
    } catch (bizErr) {
      return businessContextError(bizErr);
    }
    if (!businessId) return json({ status: 'error', message: 'business_id required' }, 400);

    // ── GENERATE: AI produces a strategic hypothesis ──────────────────────────
    if (action === 'generate') {
      const { recommendation_key } = data;
      if (!recommendation_key) throw new Error('recommendation_key required');

      // Fetch canonical BIE recommendations
      const bieResult = await fetchCanonicalRecommendations(sb, profileId, businessId);
      const recommendation = bieResult.recommendations.find(r => r.recommendation_key === recommendation_key);
      if (!recommendation) {
        return json({ status: 'error', message: 'Canonical recommendation not found for this key' }, 404);
      }

      // Fetch learning patterns for this recommendation
      const learningPatterns = await fetchLearningPatterns(sb, recommendation_key, businessId);

      // AI generates hypothesis
      const hypothesis = await generateStrategicHypothesis(
        sb, b44, recommendation, profileId, businessId, bieResult.raw, learningPatterns,
      );

      // Persist hypothesis
      const { data: saved, error } = await sb.from('strategic_hypotheses').insert({
        ...hypothesis,
        created_by: user.email,
      }).select().single();

      if (error) {
        // Table may not exist yet — return hypothesis without persisting
        if (error.message?.includes('Does not exist') || error.message?.includes('Invalid path') || error.code === '42P01' || error.code === 'PGRST205') {
          return json({ status: 'success', hypothesis, persisted: false, note: 'Hypothesis generated but not persisted (table pending migration)' });
        }
        return json({ status: 'error', message: error.message }, 500);
      }

      return json({ status: 'success', hypothesis: saved, persisted: true });
    }

    // ── LIST: List hypotheses for a business ──────────────────────────────────
    if (action === 'list') {
      const { recommendation_key, status } = data;
      let query = sb.from('strategic_hypotheses').select('*').eq('business_id', businessId);
      if (recommendation_key) query = query.eq('related_recommendation_key', recommendation_key);
      if (status) query = query.eq('status', status);
      query = query.order('created_date', { ascending: false }).limit(20);

      const { data: hypotheses, error } = await query;
      if (error) {
        // Table may not exist yet — return empty list
        if (error.message?.includes('Does not exist') || error.message?.includes('Invalid path') || error.code === '42P01' || error.code === 'PGRST205') {
          return json({ status: 'success', hypotheses: [], count: 0, note: 'Hypotheses table pending migration' });
        }
        return json({ status: 'error', message: error.message }, 500);
      }

      return json({ status: 'success', hypotheses: hypotheses || [], count: hypotheses?.length || 0 });
    }

    // ── REVIEW: Advisor reviews a hypothesis ──────────────────────────────────
    if (action === 'review') {
      const { hypothesis_id, decision, notes } = data;
      if (!hypothesis_id || !decision) throw new Error('hypothesis_id and decision required');

      // Verify advisor/admin role
      const role = user.role;
      if (!['super_admin', 'advisor', 'admin'].includes(role)) {
        return json({ status: 'error', message: 'Only advisors and admins can review hypotheses' }, 403);
      }

      // Phase 6.9 — the hypothesis is addressed by id, so it must belong to the
      // resolved business before it is read or updated. Without this, an
      // explicitly authorized business would still let an advisor reach another
      // tenant's hypothesis simply by supplying its id.
      const { data: target } = await sb.from('strategic_hypotheses')
        .select('id, business_id')
        .eq('hypothesis_id', hypothesis_id)
        .maybeSingle();
      if (!target) return json({ status: 'error', message: 'Hypothesis not found' }, 404);
      if (target.business_id !== businessId) {
        return json({ status: 'error', message: 'Hypothesis does not belong to the active business', code: 'BUSINESS_SCOPE_MISMATCH' }, 403);
      }

      const statusMap: Record<string, string> = {
        confirmed: 'confirmed',
        rejected: 'rejected',
        needs_more_data: 'under_review',
      };
      const newStatus = statusMap[decision] || 'under_review';

      const { data: updated, error } = await sb.from('strategic_hypotheses').update({
        status: newStatus,
        advisor_decision: decision,
        advisor_reviewed_by: user.email,
        advisor_reviewed_at: new Date().toISOString(),
        advisor_notes: notes || null,
        requires_advisor_review: false,
      }).eq('hypothesis_id', hypothesis_id).select().single();

      if (error) return json({ status: 'error', message: error.message }, 500);

      return json({ status: 'success', hypothesis: updated, advisor_decision: decision });
    }

    // ── PROMOTE: Promote confirmed hypothesis toward canonical ─────────────────
    if (action === 'promote') {
      const { hypothesis_id } = data;
      if (!hypothesis_id) throw new Error('hypothesis_id required');

      const role = user.role;
      if (!['super_admin', 'advisor', 'admin'].includes(role)) {
        return json({ status: 'error', message: 'Only advisors can promote hypotheses' }, 403);
      }

      // Verify hypothesis belongs to the resolved business (Phase 6.9 record scope)
      const { data: hyp } = await sb.from('strategic_hypotheses').select('*').eq('hypothesis_id', hypothesis_id).single();
      if (!hyp) return json({ status: 'error', message: 'Hypothesis not found' }, 404);
      if (hyp.business_id !== businessId) {
        return json({ status: 'error', message: 'Hypothesis does not belong to the active business', code: 'BUSINESS_SCOPE_MISMATCH' }, 403);
      }
      // Verify hypothesis is confirmed
      if (hyp.status !== 'confirmed') {
        return json({ status: 'error', message: 'Hypothesis must be confirmed before promotion' }, 400);
      }

      // Mark as promoted — does NOT auto-change canonical BIE values
      // Advisor must separately update BIE metrics or create a recommendation override
      const { data: updated, error } = await sb.from('strategic_hypotheses').update({
        status: 'promoted_to_canonical',
        advisor_decision: 'confirmed',
      }).eq('hypothesis_id', hypothesis_id).select().single();

      if (error) return json({ status: 'error', message: error.message }, 500);

      return json({
        status: 'success',
        hypothesis: updated,
        note: 'Hypothesis promoted. Advisor must separately update BIE metrics or create a recommendation override to reflect in canonical layer.',
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