import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildMeetingIntelligence, filterMeetingBriefForClient } from '../../shared/meetingIntelligence/index.ts';
import { authenticateActor, resolveActingProfile, authorizeBusinessAccess, errorResponse } from '../../shared/authz/actor.ts';

/**
 * meetingIntelligence — Phase 15.3A
 *
 * The Meeting Intelligence API — synthesis only, no calculations.
 *
 * Action:
 *   - getMeetingBrief: Synthesize a Two-Minute Meeting Brief from certified outputs
 *
 * Meeting Intelligence NEVER owns business truth.
 * Meeting Intelligence NEVER performs calculations.
 * Meeting Intelligence ONLY synthesizes existing certified engine outputs.
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
    // The actor is derived from the authenticated session ONLY. `profile_id` and
    // `user_email` in the body are TARGET identifiers: they are honoured only
    // once the actor is proven authorized for them. Previously the body's
    // profile_id BECAME the acting profile with no verification at all.
    const actor = await authenticateActor(base44, sb);
    const user = actor.user;

    const body = await req.json();
    const { action, data } = body;

    const businessId = data?.business_id || data?.businessId;
    const intent = data?.intent || 'quarterly_review';

    if (!businessId) {
      return Response.json({ error: 'business_id is required' }, { status: 400 });
    }

    // The actor must be authorized for the business this meeting concerns.
    await authorizeBusinessAccess(sb, actor, businessId);

    const wantsTarget = Boolean(data?.profile_id || data?.profileId || data?.user_email);
    const acting = wantsTarget
      ? await resolveActingProfile(sb, actor, {
          targetProfileId: data?.profile_id || data?.profileId || null,
          targetEmail: data?.user_email || null,
        })
      : null;

    const profileId = acting?.profile?.id || actor.profile?.id || user.id;
    const userEmail = acting?.profile?.email || actor.profile?.email || null; // authorized target only

    switch (action) {
      case 'getMeetingBrief': {
        // ── Batch fetch all certified data ────────────────────────────────────
        const [execCtxRes, verificationRes, lastMeetingRes] = await Promise.allSettled([
          base44.functions.invoke('livingIntelligence', {
            action: 'getExecutiveContext',
            data: { business_id: businessId, profile_id: profileId, bis: data?.bis },
          }),
          userEmail
            ? base44.functions.invoke('supabaseVerificationData', {
                action: 'getVerificationQueue',
                _router_user_email: userEmail,
              })
            : Promise.resolve(null),
          base44.asServiceRole.entities.UserBooking.filter(
            { business_id: businessId, status: 'completed' },
            '-booking_date',
            1
          ),
        ]);

        const executiveContext = execCtxRes.status === 'fulfilled' ? execCtxRes.value?.data : null;
        const verificationData = verificationRes.status === 'fulfilled' ? verificationRes.value?.data : null;
        const lastBookings = lastMeetingRes.status === 'fulfilled' ? lastMeetingRes.value : [];
        const previousMeetingDate =
          lastBookings?.[0]?.booking_date || data?.previous_meeting_date || null;

        // Extract pending reviews and client requests from verification data
        const allReviews = verificationData?.items || verificationData?.queue || [];
        const pendingReviews = allReviews.filter(
          (r: any) => r.status === 'open' || r.status === 'pending' || !r.status
        );
        const clientRequests = allReviews.filter(
          (r: any) => r.requires_client_input || r.item_type === 'missing_document'
        );

        // ── Assemble Meeting Intelligence Input ──────────────────────────────
        const meetingInput = {
          business_id: businessId,
          profile_id: profileId,
          meeting_id: `meeting-${businessId}-${Date.now()}`,
          intent,
          executive_context: executiveContext,
          timeline: executiveContext?.recently_changed_facts || [],
          canonical_facts: null,
          growth_initiatives: data?.growth_initiatives || [],
          valuation_metadata: data?.valuation_metadata || null,
          assessment_results: data?.assessment_results || [],
          executive_brief: data?.executive_brief || null,
          documents: data?.documents || [],
          pending_reviews: pendingReviews,
          advisor_assignments: data?.advisor_assignments || [],
          client_requests: clientRequests,
          sprint_data: data?.sprint_data || null,
          business_memory_contract: null,
          scheduled_at: data?.scheduled_at || null,
          previous_meeting_date: previousMeetingDate,
          advisor: data?.advisor || null,
          participants: data?.participants || [],
        };

        const brief = buildMeetingIntelligence(meetingInput);

        // Filter for client-safe if requested
        if (data?.client_safe) {
          return Response.json({ data: filterMeetingBriefForClient(brief) });
        }

        return Response.json({ data: brief });
      }
      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    return errorResponse(error);
  }
}