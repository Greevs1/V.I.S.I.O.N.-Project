/**
 * weeklyDigestScheduled — the SCHEDULED entry point for the weekly V.I.S.I.O.N. digest.
 *
 * WHY A NEW FUNCTION (P0 repair, 2026-11-02)
 *   `weeklyDigest` is a legacy-payload function: its input shape is fixed, so the
 *   scheduled step cannot be given a new argument. It also resolved the business with
 *   profile-scoped reads, which mixed 3 businesses' data. This function replaces it as
 *   the workflow's step only; `weeklyDigest` is left untouched.
 *
 * CONTRACT
 *   · business_id is REQUIRED and explicit — there is no primary_business_id fallback
 *     and no single-business shortcut. Authorization uses the existing canonical guard.
 *   · Every number comes from `assembleWeeklyDigest`, which filters every read by that
 *     business and proofs its own output (see the module header).
 *   · dry_run: true executes the FULL query pipeline and writes nothing — no
 *     notification, no email, no external side effect.
 *   · Delivery stays in-app only (notificationService is called without recipient_email).
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createServiceRoleClient } from '../../shared/supabase/serviceClient.ts';
import { requireBusinessContext } from '../../shared/businessScope/activeBusiness.ts';
import { assembleWeeklyDigest, IQ_NOT_YET_AVAILABLE } from '../../shared/digest/weeklyDigestAssembly.ts';

const ADMIN_ROLES = ['admin', 'super_admin'];

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e: any) => (e?.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Scheduled/automation-called function: admin only, so it cannot be invoked by
    // a non-admin hitting the endpoint directly.
    if (!ADMIN_ROLES.includes(user.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { business_id: requestedBusinessId, dry_run } = body || {};
    const dryRun = dry_run === true;

    if (typeof requestedBusinessId !== 'string' || !requestedBusinessId.trim() || requestedBusinessId.trim() === 'null') {
      return Response.json(
        {
          error: 'business_id is required for weeklyDigestScheduled.generateWeeklyDigest: an explicit business must be supplied; it is never inferred',
          code: 'BUSINESS_CONTEXT_REQUIRED',
        },
        { status: 400 }
      );
    }

    const { client: sb } = createServiceRoleClient();

    const { data: profile } = await sb
      .from('profiles')
      .select('id, primary_business_id')
      .eq('email', user.email)
      .maybeSingle();

    const profileId = profile?.id;
    if (!profileId) return Response.json({ error: 'Profile not found' }, { status: 404 });

    // Canonical authorization — the same guard weeklyDigest uses. A business the actor
    // cannot access is refused (403); no fallback selection exists here.
    const { businessId, denial } = await requireBusinessContext(
      sb,
      profile,
      requestedBusinessId,
      'weeklyDigestScheduled.generateWeeklyDigest'
    );
    if (denial) return denial;

    const assembled = await assembleWeeklyDigest({ sb, base44, profileId: profileId, businessId: businessId as string, now: new Date() });
    const { digest, message, scope } = assembled;

    // ── DRY RUN: full pipeline, zero writes ────────────────────────────────────
    if (dryRun) {
      return Response.json({
        dry_run: true,
        writes_performed: false,
        business_id: assembled.business_id,
        active_sprint: assembled.active_sprint,
        digest: {
          ...digest,
          iq_score_display: digest.iq_score_available ? digest.iq_score_display : IQ_NOT_YET_AVAILABLE,
        },
        message_preview: message,
        scope,
        notification_target: {
          recipient_id: user.id,
          recipient_profile_id: profileId,
          business_id: assembled.business_id,
          notification_type: 'weekly_digest',
          delivery: 'in_app_only',
          would_be_created: scope.scope_verified,
        },
      });
    }

    // A digest built from foreign rows must never be delivered.
    if (!scope.scope_verified) {
      return Response.json(
        {
          error: 'Digest scope verification failed — refusing to create a notification',
          code: 'DIGEST_SCOPE_MISMATCH',
          violations: scope.violations,
        },
        { status: 409 }
      );
    }

    await base44.functions.invoke('notificationService', {
      action: 'createNotification',
      data: {
        recipient_id: user.id,
        recipient_profile_id: profileId,
        business_id: assembled.business_id,
        notification_type: 'weekly_digest',
        title: '📊 Your Weekly V.I.S.I.O.N. Digest',
        message,
        action_url: '/dashboard',
        priority: 'low',
        metadata: {
          sprint_progress_percent: digest.sprint_progress,
          tasks_completed: digest.tasks_completed,
          tasks_overdue: digest.tasks_overdue,
          new_opportunities: digest.new_opportunities,
          completed_opportunities: digest.completed_opportunities,
          documents_uploaded: digest.documents_uploaded,
          documents_analyzed: digest.documents_analyzed,
          iq_score_available: digest.iq_score_available,
          iq_score_change: digest.iq_score_change,
        },
      },
    });

    return Response.json({
      success: true,
      writes_performed: true,
      business_id: assembled.business_id,
      digest,
      scope,
    });
  } catch (error: any) {
    console.error('[weeklyDigestScheduled] error:', error?.message);
    return Response.json({ error: error?.message || 'Unexpected error' }, { status: 500 });
  }
}