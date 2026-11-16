/**
 * notificationService — Full notification lifecycle for V.I.S.I.O.N. Platform™
 *
 * Actions:
 *   getNotifications           — fetch notifications for current user
 *   markNotificationRead       — mark single notification as read
 *   markAllNotificationsRead   — mark all as read
 *   createNotification         — create a notification (admin/service use)
 *   getUnreadCount             — fast unread badge count
 *   getNotificationPreferences — fetch user preferences
 *   updateNotificationPreferences — save user preferences
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';

function getSupabase() {
  const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
  const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}

// ── Preference key mapping per notification type ─────────────────────────────
const PREF_KEY = {
  reminder_due: 'reminder_notifications_enabled',
  task_assigned: 'task_assignment_notifications_enabled',
  document_request_assigned: 'document_request_notifications_enabled',
  // A document assigned for review / action / FYI is the same kind of signal as
  // a document request, so it honours the same existing preference — no new
  // preference field or settings UI is invented for it.
  document_assigned: 'document_request_notifications_enabled',
  resource_assigned: 'resource_assignment_notifications_enabled',
  team_invite: 'team_invite_notifications_enabled',
  booking_scheduled: 'booking_notifications_enabled',
  booking_cancelled: 'booking_notifications_enabled',
  booking_rescheduled: 'booking_notifications_enabled',
  sprint_task_completed: 'sprint_completion_notifications_enabled',
  sprint_completed: 'sprint_completion_notifications_enabled',
  galileo_update: 'galileo_update_notifications_enabled',
  role_updated: 'in_app_notifications_enabled',
  permission_updated: 'in_app_notifications_enabled',
  weekly_digest: 'weekly_summary_enabled',
  achievement_sprint_milestone: 'sprint_completion_notifications_enabled',
  achievement_assessment_complete: 'galileo_update_notifications_enabled',
  achievement_opportunity_milestone: 'galileo_update_notifications_enabled',
  achievement_sprint_created: 'sprint_completion_notifications_enabled',
  achievement_document_milestone: 'document_request_notifications_enabled',
  achievement_iq_milestone: 'galileo_update_notifications_enabled',
  sprint_needs_expert_review: 'in_app_notifications_enabled',
  sprint_changes_requested: 'in_app_notifications_enabled',
};

// ── Category mapping per notification type ───────────────────────────────────
const CATEGORY_MAP = {
  task_assigned: 'action_required',
  document_request_assigned: 'action_required',
  document_assigned: 'action_required',
  reminder_due: 'reminder',
  sprint_task_completed: 'success',
  sprint_completed: 'achievement',
  booking_scheduled: 'information',
  booking_cancelled: 'information',
  booking_rescheduled: 'information',
  resource_assigned: 'information',
  team_invite: 'action_required',
  galileo_update: 'information',
  role_updated: 'system',
  permission_updated: 'system',
  weekly_digest: 'information',
  achievement_sprint_milestone: 'achievement',
  achievement_assessment_complete: 'achievement',
  achievement_opportunity_milestone: 'achievement',
  achievement_sprint_created: 'achievement',
  achievement_document_milestone: 'success',
  achievement_iq_milestone: 'achievement',
  sprint_needs_expert_review: 'action_required',
  sprint_changes_requested: 'action_required',
};

// ── Category color mapping ───────────────────────────────────────────────────
const CATEGORY_COLOR = {
  action_required: 'text-red-400',
  reminder: 'text-amber-400',
  information: 'text-blue-400',
  success: 'text-emerald-400',
  achievement: 'text-purple-400',
  system: 'text-muted-foreground',
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { action, data = {} } = body;

    const isAdmin = user.role === 'admin' || user.role === 'super_admin';

    // ── GET NOTIFICATIONS ────────────────────────────────────────────────────
    if (action === 'getNotifications') {
      const { limit = 50, unread_only = false } = data;
      let query = base44.asServiceRole.entities.Notification.filter(
        { recipient_id: user.id }, '-created_date', Math.min(limit, 100)
      );
      const notifications = await query;
      const filtered = unread_only ? (notifications || []).filter(n => !n.is_read) : (notifications || []);
      return Response.json({ notifications: filtered });
    }

    // ── GET UNREAD COUNT ─────────────────────────────────────────────────────
    if (action === 'getUnreadCount') {
      const notifications = await base44.asServiceRole.entities.Notification.filter(
        { recipient_id: user.id, is_read: false }, '-created_date', 200
      );
      return Response.json({ count: (notifications || []).length });
    }

    // ── MARK SINGLE READ ─────────────────────────────────────────────────────
    if (action === 'markNotificationRead') {
      const { notification_id } = data;
      if (!notification_id) return Response.json({ error: 'notification_id required' }, { status: 400 });

      // Verify ownership
      const notifs = await base44.asServiceRole.entities.Notification.filter({ id: notification_id });
      const notif = notifs?.[0];
      if (!notif) return Response.json({ error: 'Not found' }, { status: 404 });
      if (notif.recipient_id !== user.id && !isAdmin) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }

      await base44.asServiceRole.entities.Notification.update(notification_id, {
        is_read: true,
        read_at: new Date().toISOString(),
      });
      return Response.json({ success: true });
    }

    // ── MARK ALL READ ────────────────────────────────────────────────────────
    if (action === 'markAllNotificationsRead') {
      const unread = await base44.asServiceRole.entities.Notification.filter(
        { recipient_id: user.id, is_read: false }, '-created_date', 200
      );
      const now = new Date().toISOString();
      await Promise.all((unread || []).map(n =>
        base44.asServiceRole.entities.Notification.update(n.id, { is_read: true, read_at: now })
      ));
      return Response.json({ success: true, count: (unread || []).length });
    }

    // ── CREATE NOTIFICATION ──────────────────────────────────────────────────
    if (action === 'createNotification') {
      // Check recipient preferences before creating
      const { recipient_id, notification_type } = data;
      if (!recipient_id || !notification_type) {
        return Response.json({ error: 'recipient_id and notification_type required' }, { status: 400 });
      }

      // Load recipient preferences
      const prefKey = PREF_KEY[notification_type] || 'in_app_notifications_enabled';
      const prefs = await base44.asServiceRole.entities.NotificationPreferences.filter({ user_id: recipient_id });
      const pref = prefs?.[0];

      // Default: enabled if no preferences exist
      const inAppEnabled = !pref || pref.in_app_notifications_enabled !== false;
      const typeEnabled = !pref || pref[prefKey] !== false;

      if (!inAppEnabled || !typeEnabled) {
        console.log(`[notificationService] Notification suppressed by preferences for user ${recipient_id}, type=${notification_type}`);
        return Response.json({ success: true, suppressed: true });
      }

      // Get category and color
      const category = CATEGORY_MAP[notification_type] || 'information';
      const categoryColor = CATEGORY_COLOR[category] || 'text-muted-foreground';

      const notification = await base44.asServiceRole.entities.Notification.create({
        recipient_id: data.recipient_id,
        recipient_profile_id: data.recipient_profile_id || null,
        sender_id: data.sender_id || null,
        business_id: data.business_id || null,
        notification_type: data.notification_type,
        notification_category: category,
        title: data.title,
        message: data.message || '',
        related_entity_type: data.related_entity_type || null,
        related_entity_id: data.related_entity_id || null,
        action_url: data.action_url || null,
        // Presentation stays in title/message; navigation uses ids. A caller may
        // persist the authoritative ids a destination resolver needs (see
        // src/lib/notifications/notificationDestination.js). Additive — notice
        // types that pass nothing keep landing on their action_url.
        metadata: data.metadata || null,
        is_read: false,
        priority: data.priority || 'medium',
      });

      // Send email if email_notifications_enabled and type enabled
      const emailEnabled = pref?.email_notifications_enabled !== false && typeEnabled;
      if (emailEnabled && data.recipient_email) {
        try {
          await base44.integrations.Core.SendEmail({
            to: data.recipient_email,
            subject: `V.I.S.I.O.N. Platform™ — ${data.title}`,
            body: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#0a0a0a;color:#e5e5e5;border-radius:12px;">
              <h2 style="color:#D4A72C;margin-bottom:8px;">${data.title}</h2>
              <p style="color:#aaa;font-size:14px;">${data.message || ''}</p>
              ${data.action_url ? `<a href="${data.action_url}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#D4A72C;color:#08090B;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;">View Details →</a>` : ''}
              <p style="color:#555;font-size:11px;margin-top:24px;border-top:1px solid #222;padding-top:16px;">V.I.S.I.O.N. Platform™ | You can manage notification preferences in Settings.</p>
            </div>`,
          });
        } catch (emailErr) {
          console.warn('[notificationService] Email send failed (non-fatal):', emailErr.message);
        }
      }

      return Response.json({ success: true, notification });
    }

    // ── GET PREFERENCES ──────────────────────────────────────────────────────
    if (action === 'getNotificationPreferences') {
      const prefs = await base44.asServiceRole.entities.NotificationPreferences.filter({ user_id: user.id });
      const pref = prefs?.[0] || null;
      return Response.json({ preferences: pref });
    }

    // ── UPDATE PREFERENCES ───────────────────────────────────────────────────
    if (action === 'updateNotificationPreferences') {
      const existing = await base44.asServiceRole.entities.NotificationPreferences.filter({ user_id: user.id });
      const updates = { ...data.preferences, user_id: user.id };

      let saved;
      if (existing?.[0]) {
        saved = await base44.asServiceRole.entities.NotificationPreferences.update(existing[0].id, updates);
      } else {
        saved = await base44.asServiceRole.entities.NotificationPreferences.create(updates);
      }
      return Response.json({ success: true, preferences: saved });
    }

    // ── TRACK NOTIFICATION ANALYTICS ─────────────────────────────────────────
    if (action === 'trackNotificationEvent') {
      const { notification_id, event_type } = data;
      if (!notification_id || !event_type) {
        return Response.json({ error: 'notification_id and event_type required' }, { status: 400 });
      }

      // Verify ownership
      const notifs = await base44.asServiceRole.entities.Notification.filter({ id: notification_id });
      const notif = notifs?.[0];
      if (!notif) return Response.json({ error: 'Not found' }, { status: 404 });
      if (notif.recipient_id !== user.id && !isAdmin) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }

      const updates = {};
      const now = new Date().toISOString();

      if (event_type === 'opened') {
        updates.opened_at = now;
      } else if (event_type === 'clicked') {
        updates.clicked_at = now;
      } else if (event_type === 'dismissed') {
        updates.dismissed_at = now;
      } else if (event_type === 'completed_action') {
        updates.completed_action_at = now;
      } else {
        return Response.json({ error: 'Invalid event_type' }, { status: 400 });
      }

      await base44.asServiceRole.entities.Notification.update(notification_id, updates);
      return Response.json({ success: true, tracked_at: now });
    }

    // ── GET NOTIFICATION ANALYTICS ───────────────────────────────────────────
    if (action === 'getNotificationAnalytics') {
      const { notification_id } = data;
      if (!notification_id) {
        return Response.json({ error: 'notification_id required' }, { status: 400 });
      }

      const notifs = await base44.asServiceRole.entities.Notification.filter({ id: notification_id });
      const notif = notifs?.[0];
      if (!notif) return Response.json({ error: 'Not found' }, { status: 404 });
      if (notif.recipient_id !== user.id && !isAdmin) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }

      return Response.json({
        analytics: {
          opened_at: notif.opened_at,
          clicked_at: notif.clicked_at,
          dismissed_at: notif.dismissed_at,
          completed_action_at: notif.completed_action_at,
        },
      });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error('[notificationService] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});