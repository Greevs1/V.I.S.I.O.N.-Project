/**
 * notifyAdminsNewUser
 * Scheduled every 15 minutes. Checks for users registered in the last 15 minutes
 * and sends in-app notifications to all admins/super_admins.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Only allow scheduled automation invocations or admin users
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin' && user.role !== 'super_admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Look back 15 minutes + small buffer
    const since = new Date(Date.now() - 16 * 60 * 1000).toISOString();

    const allUsers = await base44.asServiceRole.entities.User.list('-created_date', 200);
    const newUsers = (allUsers || []).filter(u => u.created_date >= since);

    if (newUsers.length === 0) {
      return Response.json({ success: true, message: 'No new users in last 15 minutes' });
    }

    const admins = (allUsers || []).filter(u =>
      u.role === 'admin' || u.role === 'super_admin'
    );

    if (admins.length === 0) {
      return Response.json({ success: true, message: 'No admins to notify' });
    }

    let notified = 0;
    for (const newUser of newUsers) {
      const displayName = newUser.full_name || newUser.email || 'A new user';

      // Check if we already sent a notification for this user to avoid duplicates
      const existing = await base44.asServiceRole.entities.Notification.filter({
        related_entity_id: newUser.id,
        notification_type: 'team_invite',
        title: 'New User Registered',
      });
      if (existing?.length > 0) continue;

      await Promise.all(admins.map(admin =>
        base44.asServiceRole.entities.Notification.create({
          recipient_id: admin.id,
          notification_type: 'team_invite',
          notification_category: 'information',
          title: 'New User Registered',
          message: `${displayName} (${newUser.email}) just created an account on the V.I.S.I.O.N. Platform™.`,
          related_entity_type: 'User',
          related_entity_id: newUser.id,
          action_url: '/admin',
          is_read: false,
          priority: 'medium',
        })
      ));
      notified++;
    }

    console.log(`[notifyAdminsNewUser] Processed ${newUsers.length} new user(s), notified admins for ${notified}`);
    return Response.json({ success: true, new_users: newUsers.length, notified });
  } catch (error) {
    console.error('[notifyAdminsNewUser] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});