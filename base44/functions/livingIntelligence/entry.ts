import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildExecutiveContext, buildExecutivePresence, buildWhatChanged, buildWhatMattersNow, buildValidateIntelligence, filterValidateIntelligenceForClient } from '../../shared/livingIntelligence/index.ts';
import { authenticateActor, resolveActingProfile, authorizeBusinessAccess, errorResponse } from '../../shared/authz/actor.ts';

/**
 * livingIntelligence — Phase 15.0
 *
 * The Executive Presence API — one reusable interface.
 *
 * Any experience may ask: "What should this user know right now?"
 *
 * Actions:
 *   - getExecutivePresence: Max 3 items — "If I only had five minutes..."
 *   - getExecutiveContext: Full executive context (all dimensions)
 *   - getWhatChanged: Recent business changes
 *   - getWhatMattersNow: Prioritized items
 *
 * Living Intelligence NEVER owns business truth.
 * Living Intelligence NEVER performs calculations.
 * Living Intelligence ONLY synthesizes existing certified engine outputs.
 *
 * Constitution Compliance: Articles I-XIII
 */

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return Response.json({ error: 'Supabase not configured' }, { status: 500 });
    }
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // ── Phase 6B.4 — AUTHENTICATION BOUNDARY ─────────────────────────────────
    // The actor comes from the session ONLY. `profile_id` is a TARGET identifier
    // honoured only once authorized, and the business must be one the actor can
    // actually reach. Previously either value was accepted from the body and the
    // service assembled another business's intelligence with no check at all.
    const actor = await authenticateActor(base44, sb);
    const user = actor.user;

    const body = await req.json();
    const { action, data } = body;

    // ── Gather input from certified engines ────────────────────────────────
    // Client passes BIS (already built client-side — no duplicate calculation).
    // Backend supplements with server-side data (canonical facts, events, reviews).
    const businessId = data?.business_id || data?.businessId;

    if (!businessId) {
      return Response.json({ error: 'business_id is required' }, { status: 400 });
    }

    await authorizeBusinessAccess(sb, actor, businessId);

    const wantsTarget = Boolean(data?.profile_id || data?.profileId);
    const acting = wantsTarget
      ? await resolveActingProfile(sb, actor, { targetProfileId: data?.profile_id || data?.profileId || null })
      : null;
    const profileId = acting?.profile?.id || actor.profile?.id || user.id;

    // ── Supplement with server-side data ────────────────────────────────────
    const [canonicalFactsRes, recentEventsRes, pendingReviewsRes, deadlinesRes] = await Promise.allSettled([
      base44.functions.invoke('canonicalFactService', { action: 'resolveFacts', data: { business_id: businessId } }),
      base44.functions.invoke('liveSyncOrchestrator', { action: 'getRecentEvents', data: { business_id: businessId } }),
      base44.asServiceRole.entities.LiveSyncAction.filter({ business_id: businessId, status: 'pending' }, '-created_date', 10),
      base44.asServiceRole.entities.UserBooking.filter({ business_id: businessId, status: 'scheduled' }, 'booking_date', 10),
    ]);

    const canonicalFacts = canonicalFactsRes.status === 'fulfilled' ? canonicalFactsRes.value?.data : null;
    const recentEvents = recentEventsRes.status === 'fulfilled' ? recentEventsRes.value?.data?.events || [] : [];
    const pendingReviews = pendingReviewsRes.status === 'fulfilled' ? pendingReviewsRes.value || [] : [];
    const upcomingDeadlines = deadlinesRes.status === 'fulfilled' ? deadlinesRes.value || [] : [];

    // ── Assemble Living Intelligence Input ──────────────────────────────────
    const liInput = {
      business_id: businessId,
      profile_id: profileId,
      // From client (already built — no duplicate calculation)
      bis: data?.bis || null,
      // From server (canonical fact service)
      canonical_facts: canonicalFacts,
      // From server (CBSS / live sync orchestrator)
      recent_events: recentEvents,
      timeline: data?.timeline || recentEvents,
      // From client or server
      growth_initiatives: data?.growth_initiatives || [],
      valuation_metadata: data?.valuation_metadata || null,
      pending_reviews: pendingReviews,
      sprint_data: data?.sprint_data || null,
      upcoming_deadlines: upcomingDeadlines,
      confidence_scores: data?.confidence_scores || null,
      executive_brief: data?.executive_brief || null,
      assessment_results: data?.assessment_results || [],
      advisor_review_state: data?.advisor_review_state || null,
    };

    // ── Route to the requested action ───────────────────────────────────────
    let result;
    switch (action) {
      case 'getDashboardIntelligence':
        // Single call returning both Executive Presence and Executive Context
        // for efficient Dashboard integration (avoids two round trips)
        result = {
          executive_presence: buildExecutivePresence(liInput),
          executive_context: buildExecutiveContext(liInput),
        };
        break;
      case 'getExecutivePresence':
        result = buildExecutivePresence(liInput);
        break;
      case 'getExecutiveContext':
        result = buildExecutiveContext(liInput);
        break;
      case 'getWhatChanged':
        result = buildWhatChanged(liInput);
        break;
      case 'getWhatMattersNow':
        result = buildWhatMattersNow(liInput);
        break;
      case 'getValidateIntelligence': {
        // Phase 15.2 — Validate workspace enrichment
        // Client passes verification items + recommended action (already fetched).
        // Backend synthesizes only — no writes, no queue creation.
        const validateInput = {
          business_id: businessId,
          valuation_id: data?.valuation_id || data?.valuationId,
          profile_id: profileId,
          verification_items: data?.verification_items || [],
          recommended_action: data?.recommended_action || null,
          queue_summary: data?.queue_summary || null,
          valuation_metadata: data?.valuation_metadata || null,
          user_role: user.role || 'user',
        };
        const raw = buildValidateIntelligence(validateInput);
        result = filterValidateIntelligenceForClient(raw, user.role || 'user');
        break;
      }
      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    return Response.json({ data: result });
  } catch (error) {
    return errorResponse(error);
  }
}