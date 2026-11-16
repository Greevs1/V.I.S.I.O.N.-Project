import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { authenticateActor, resolveActingProfile, authorizeBusinessAccess, errorResponse } from '../../shared/authz/actor.ts';
import {
  buildPostMeetingCloseout,
  updateCloseoutAfterAction,
  validateDestination,
  buildClientSafeFollowup,
  createApprovalAuditEntry,
  createDismissalAuditEntry,
  createDeferAuditEntry,
  createExecutionAuditEntry,
} from '../../shared/meetingIntelligence/index.ts';

/**
 * postMeetingIntelligence — Phase 15.4
 *
 * The Post-Meeting Intelligence API — governed bridge between
 * Meeting → Advisor Review → Existing Certified Systems.
 *
 * Actions:
 *   - synthesizeOutcomes: Propose outcomes from meeting context + advisor notes
 *   - approveOutcome: Approve an outcome (routes to existing write service)
 *   - dismissOutcome: Dismiss a proposed outcome
 *   - deferOutcome: Defer a proposed outcome
 *   - getCloseoutState: Get the full closeout state for a meeting
 *
 * Post-Meeting Intelligence NEVER owns business truth.
 * Post-Meeting Intelligence NEVER creates a new table.
 * Post-Meeting Intelligence ONLY proposes outcomes that route to existing owners.
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

    const body = await req.json();
    const { action, data } = body;

    const businessId = data?.business_id;
    const intent = data?.intent || 'quarterly_review';
    const userRole = actor.user.role || 'user';

    if (!businessId) {
      return Response.json({ error: 'business_id is required' }, { status: 400 });
    }

    // The actor must be authorized for the business this meeting concerns.
    await authorizeBusinessAccess(sb, actor, businessId);

    const wantsTarget = Boolean(data?.profile_id || data?.user_email);
    const acting = wantsTarget
      ? await resolveActingProfile(sb, actor, {
          targetProfileId: data?.profile_id || null,
          targetEmail: data?.user_email || null,
        })
      : null;

    const profileId = acting?.profile?.id || actor.profile?.id || actor.user.id;
    const userEmail = acting?.profile?.email || actor.profile?.email || null; // authorized target only

    switch (action) {
      // ── synthesizeOutcomes ──────────────────────────────────────────────────
      case 'synthesizeOutcomes': {
        // Fetch meeting brief if not provided
        let meetingBrief = data?.meeting_brief || null;
        if (!meetingBrief) {
          try {
            const briefRes = await base44.functions.invoke('meetingIntelligence', {
              action: 'getMeetingBrief',
              data: {
                business_id: businessId,
                profile_id: profileId,
                // Phase 6B.5 — the AUTHORIZED identity, not a raw body value.
                user_email: userEmail,
                intent,
              },
            });
            meetingBrief = briefRes.data;
          } catch { /* non-fatal — closeout works without brief */ }
        }

        // Fetch existing items for duplicate detection
        const [growthRes, sprintRes, verificationRes, notesRes] = await Promise.allSettled([
          // ── Phase 6B.5 — forward the AUTHORIZED identity, never the body's ──
          // `userEmail` is the authenticated actor's address (or a target the
          // actor is proven authorized for). `data.user_email` was a raw body
          // value being forwarded as an identity claim.
          base44.functions.invoke('supabaseUserData', {
            action: 'getRoadmapItems',
            _router_user_email: userEmail,
          }),
          base44.functions.invoke('supabaseUserData', {
            action: 'getRoadmapItems',
            _router_user_email: userEmail,
          }),
          userEmail
            ? base44.functions.invoke('supabaseVerificationData', {
                action: 'getVerificationQueue',
                _router_user_email: userEmail,
              })
            : Promise.resolve(null),
          base44.entities.ClientNote.filter({ business_id: businessId, status: 'active' }, '-created_date', 20),
        ]);

        const existingGrowth = growthRes.status === 'fulfilled' ? growthRes.value?.data?.items || [] : [];
        const existingSprint = sprintRes.status === 'fulfilled' ? sprintRes.value?.data?.items || [] : [];
        const verificationData = verificationRes.status === 'fulfilled' ? verificationRes.value?.data : null;
        const existingNotes = notesRes.status === 'fulfilled' ? notesRes.value : [];

        const existingVerification = verificationData?.items || verificationData?.queue || [];
        const existingDocRequests = existingVerification.filter(
          (r: any) => r.item_type === 'missing_document' || r.requires_client_input
        );

        // Assemble synthesis input
        const synthesisInput = {
          business_id: businessId,
          profile_id: profileId,
          meeting_id: data?.meeting_id || `meeting-${businessId}-${Date.now()}`,
          intent,
          meeting_date: data?.meeting_date || null,
          meeting_brief: meetingBrief,
          advisor_notes: data?.advisor_notes || '',
          explicit_decisions: data?.explicit_decisions || [],
          galileo_context: data?.galileo_context || null,
          booking_metadata: data?.booking_metadata || null,
          existing_growth_initiatives: existingGrowth,
          existing_sprint_tasks: existingSprint,
          existing_verification_items: existingVerification,
          existing_document_requests: existingDocRequests,
          existing_roadmap_items: existingSprint, // roadmap uses same source
          existing_advisor_notes: existingNotes,
        };

        const closeout = buildPostMeetingCloseout(synthesisInput, userRole);

        return Response.json({ data: closeout });
      }

      // ── approveOutcome ──────────────────────────────────────────────────────
      case 'approveOutcome': {
        const outcome = data?.outcome;
        if (!outcome) return Response.json({ error: 'outcome is required' }, { status: 400 });

        // Validate destination
        const validation = validateDestination(outcome, userRole, businessId);
        if (!validation.is_valid) {
          return Response.json({
            error: 'Destination validation failed',
            issues: validation.issues,
          }, { status: 400 });
        }

        // Route to existing write service
        // Phase 6B.5 — forward the AUTHORIZED identity. This email becomes
        // `_router_user_email` downstream, so it must never be a body value.
        const executionResult = await routeToDestination(base44, outcome, userEmail);

        // Create audit entry
        const auditEntry = createApprovalAuditEntry(outcome, user.id, !!outcome.approved_version);
        const executionAudit = createExecutionAuditEntry(outcome, user.id, executionResult);

        return Response.json({
          data: {
            approved: true,
            outcome_id: outcome.outcome_id,
            destination: outcome.destination_system,
            execution_result: executionResult,
            audit: [auditEntry, executionAudit],
          },
        });
      }

      // ── dismissOutcome ───────────────────────────────────────────────────────
      case 'dismissOutcome': {
        const outcome = data?.outcome;
        if (!outcome) return Response.json({ error: 'outcome is required' }, { status: 400 });

        const auditEntry = createDismissalAuditEntry(outcome, user.id);

        return Response.json({
          data: {
            dismissed: true,
            outcome_id: outcome.outcome_id,
            audit: [auditEntry],
          },
        });
      }

      // ── deferOutcome ────────────────────────────────────────────────────────
      case 'deferOutcome': {
        const outcome = data?.outcome;
        if (!outcome) return Response.json({ error: 'outcome is required' }, { status: 400 });

        const auditEntry = createDeferAuditEntry(outcome, user.id);

        return Response.json({
          data: {
            deferred: true,
            outcome_id: outcome.outcome_id,
            audit: [auditEntry],
          },
        });
      }

      // ── getClientSafeFollowup ──────────────────────────────────────────────
      case 'getClientSafeFollowup': {
        const approvedOutcomes = data?.approved_outcomes || [];
        const closeout = {
          closeout_id: `closeout-followup-${Date.now()}`,
          meeting_context: {
            meeting_id: data?.meeting_id || `meeting-${businessId}`,
            business_id: businessId,
            profile_id: profileId,
            intent,
            meeting_date: data?.meeting_date || null,
          },
          proposed_outcomes: [],
          approved_outcomes: approvedOutcomes,
          dismissed_outcomes: [],
          deferred_outcomes: [],
          summary: {
            total_proposed: 0,
            total_approved: approvedOutcomes.length,
            total_dismissed: 0,
            total_deferred: 0,
            by_risk: { LOW: 0, MEDIUM: 0, HIGH: 0 },
            by_destination: {},
            is_quiet: approvedOutcomes.length === 0,
            quiet_message: null,
          },
          client_safe_followup: null,
          audit_trail: [],
          _meta: {
            sources_used: ['approved_outcomes'],
            constitution_compliant: true,
            no_calculations_performed: true,
            no_new_tables_created: true,
            no_transcript_ingestion: true,
            no_business_memory_persisted: true,
            advisor_remains_authoritative: true,
          },
        };

        const followup = buildClientSafeFollowup(closeout);

        return Response.json({ data: followup });
      }

      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    return errorResponse(error);
  }
}

// ── Destination Router ─────────────────────────────────────────────────────────
// Routes approved outcomes to EXISTING write services. No new tables.
async function routeToDestination(base44: any, outcome: any, userEmail?: string): Promise<any> {
  const payload = outcome.proposed_action?.payload || {};

  switch (outcome.destination_system) {
    case 'advisor_notes':
      // → ClientNote entity (existing)
      return await base44.entities.ClientNote.create({
        profile_id: outcome.source_meeting_context.profile_id,
        business_id: outcome.source_meeting_context.business_id,
        title: outcome.title,
        content_html: `<p>${outcome.description}</p>`,
        plain_text: outcome.description,
        note_type: outcome.type === 'commitment' ? 'outcome_note' : 'general_note',
        visibility: outcome.client_visible ? 'client_visible' : 'internal_only',
        status: 'active',
        related_source_type: 'general',
        follow_up_date: outcome.due_date || null,
        follow_up_status: outcome.due_date ? 'open' : 'none',
      });

    case 'sprint_tasks':
      // → ninetyDaySprint function (existing)
      try {
        const res = await base44.functions.invoke('ninetyDaySprint', {
          action: 'addTask',
          data: {
            title: outcome.title,
            description: outcome.description,
            business_id: outcome.source_meeting_context.business_id,
            due_date: outcome.due_date,
          },
          _router_user_email: userEmail,
        });
        return res.data;
      } catch (e) {
        return { error: e.message, destination: 'sprint_tasks' };
      }

    case 'growth_plan':
      // → valuationService (existing)
      try {
        const res = await base44.functions.invoke('valuationService', {
          action: 'addGrowthInitiative',
          data: {
            title: outcome.title,
            description: outcome.description,
            business_id: outcome.source_meeting_context.business_id,
          },
          _router_user_email: userEmail,
        });
        return res.data;
      } catch (e) {
        return { error: e.message, destination: 'growth_plan' };
      }

    case 'document_requests':
    case 'verification_queue':
      // → verificationQueueService (existing)
      try {
        const res = await base44.functions.invoke('verificationQueueService', {
          action: outcome.destination_system === 'document_requests' ? 'createClientRequest' : 'flagForReview',
          data: {
            title: outcome.title,
            description: outcome.description,
            business_id: outcome.source_meeting_context.business_id,
            field_name: outcome.title,
            request_type: outcome.destination_system === 'document_requests' ? 'missing_document' : 'review',
          },
          _router_user_email: userEmail,
        });
        return res.data;
      } catch (e) {
        return { error: e.message, destination: outcome.destination_system };
      }

    case 'valuation_review':
      // → valuationService flagForReview (existing)
      try {
        const res = await base44.functions.invoke('valuationService', {
          action: 'flagForReview',
          data: {
            title: outcome.title,
            description: outcome.description,
            business_id: outcome.source_meeting_context.business_id,
            review_type: 'advisor_flagged',
          },
          _router_user_email: userEmail,
        });
        return res.data;
      } catch (e) {
        return { error: e.message, destination: 'valuation_review' };
      }

    case 'business_timeline':
    case 'roadmap':
      // Timeline events are created by existing CBSS systems when state changes.
      // Post-Meeting Intelligence does NOT directly create timeline events.
      // It returns the proposed event for advisor reference — the existing
      // systems (valuation, verification, sprint) create timeline events
      // through their normal propagation flow when the advisor takes action.
      return {
        note: 'Timeline events are created by existing CBSS systems through normal propagation. No direct write.',
        proposed_event: {
          title: outcome.title,
          description: outcome.description,
          business_id: outcome.source_meeting_context.business_id,
        },
      };

    default:
      return { error: `Unknown destination: ${outcome.destination_system}` };
  }
}