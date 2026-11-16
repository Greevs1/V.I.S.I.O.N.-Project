/**
 * assignWorksheetToUser
 *
 * Creates a worksheet_assignments record in Supabase.
 * Resolves the target user's Supabase profile via syncBase44UserToSupabaseProfile.
 * If no profile exists, one is created automatically — never returns 404 for known Base44 users.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';

// Inline profile resolver — mirrors syncBase44UserToSupabaseProfile logic
async function resolveProfile(sb, base44, targetEmail) {
  const email = targetEmail.toLowerCase();

  // 1. Find by email (case-insensitive)
  const { data: byEmail } = await sb.from('profiles')
    .select('id, primary_business_id, app_role, base44_user_id')
    .ilike('email', email)
    .maybeSingle();

  if (byEmail) return byEmail;

  // 2. Not found — look up Base44 user and create profile
  const b44Users = await base44.asServiceRole.entities.User.filter({ email });
  const b44User = b44Users?.[0];
  if (!b44User) return null;

  const fullName = b44User.full_name || '';
  const [firstName, ...rest] = fullName.trim().split(' ');
  const lastName = rest.join(' ') || null;
  const roleMap = { super_admin: 'super_admin', admin: 'admin', advisor: 'advisor' };
  const appRole = email === 'garrickreevs@gmail.com' ? 'super_admin' : (roleMap[b44User.role] || 'owner');
  const now = new Date().toISOString();

  const { data: newProfile, error: createErr } = await sb.from('profiles').insert({
    email,
    base44_user_id: b44User.id,
    first_name: firstName || null,
    last_name: lastName || null,
    app_role: appRole,
    onboarding_completed: false,
    created_at: now,
    updated_at: now,
  }).select('id, primary_business_id, app_role, base44_user_id').single();

  if (createErr) {
    // Race condition — try fetching again
    const { data: retry } = await sb.from('profiles')
      .select('id, primary_business_id, app_role, base44_user_id')
      .ilike('email', email)
      .maybeSingle();
    return retry || null;
  }

  console.log('[resolveProfile] Created profile', newProfile.id, 'for', email);
  return newProfile;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return Response.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const {
      worksheet_id,
      target_email,
      due_date,
      due_time,
      assign_timing = 'immediately',
      scheduled_for,
      reminder_type = 'none',
      reminder_method = 'in_app',
      action = 'assign',
    } = body;

    // ── CANCEL — no worksheet_id needed, just assignment_id ──────────────────
    if (action === 'cancel') {
      const { assignment_id } = body;
      if (!assignment_id) return Response.json({ error: 'assignment_id required' }, { status: 400 });

      const { data: asgn } = await sb.from('worksheet_assignments')
        .select('id, status').eq('id', assignment_id).maybeSingle();

      if (!asgn) return Response.json({ error: 'Assignment not found' }, { status: 404 });
      // If already cancelled, treat as success (idempotent)
      if (asgn.status === 'cancelled') {
        return Response.json({ success: true, assignment_id, table: 'worksheet_assignments', affected_rows: 0, status: 'cancelled' });
      }

      const now = new Date().toISOString();
      const { data: cancelled, error: cancelErr } = await sb.from('worksheet_assignments').update({
        status: 'cancelled',
        cancelled_at: now,
        updated_at: now,
      }).eq('id', assignment_id).select('id');

      if (cancelErr) {
        console.error('[assignWorksheetToUser] cancel failed:', cancelErr.message);
        return Response.json({ error: cancelErr.message }, { status: 500 });
      }

      const affected_rows = cancelled?.length ?? 0;
      console.log('[assignWorksheetToUser] Cancelled assignment', assignment_id, 'affected_rows:', affected_rows);
      return Response.json({ success: true, assignment_id, table: 'worksheet_assignments', affected_rows, status: 'cancelled' });
    }

    // ── ASSIGN — requires worksheet_id ───────────────────────────────────────
    if (!worksheet_id) return Response.json({ error: 'worksheet_id required' }, { status: 400 });

    // Resolve admin profile
    const adminProfile = await resolveProfile(sb, base44, user.email);
    if (!adminProfile) return Response.json({ error: 'Admin profile not found' }, { status: 404 });
    const adminProfileId = adminProfile.id;

    if (action === 'assign') {
      if (!target_email) return Response.json({ error: 'target_email required' }, { status: 400 });

      const targetProfile = await resolveProfile(sb, base44, target_email);
      if (!targetProfile) {
        return Response.json({ error: `User not found in Base44 or Supabase: ${target_email}` }, { status: 400 });
      }

      const targetProfileId = targetProfile.id;
      const targetBusinessId = targetProfile.primary_business_id || null;

      // Check for duplicate active assignment
      const { data: existing } = await sb.from('worksheet_assignments')
        .select('id, status')
        .eq('worksheet_id', worksheet_id)
        .eq('assigned_to_profile_id', targetProfileId)
        .in('status', ['assigned', 'scheduled', 'in_progress'])
        .maybeSingle();

      if (existing) {
        return Response.json({ error: 'Already assigned', already_assigned: true, assignment_id: existing.id }, { status: 400 });
      }

      const now = new Date().toISOString();
      const dueDateTime = due_date ? (due_time ? `${due_date}T${due_time}:00` : `${due_date}T23:59:59`) : null;
      const scheduledForVal = assign_timing === 'scheduled' && scheduled_for ? scheduled_for : null;
      const status = scheduledForVal ? 'scheduled' : 'assigned';
      const reminderSettings = { type: reminder_type, method: reminder_method, enabled: reminder_type !== 'none' };

      const { data: assignment, error: insertErr } = await sb.from('worksheet_assignments')
        .insert({
          worksheet_id,
          assigned_to_profile_id: targetProfileId,
          assigned_to_business_id: targetBusinessId,
          assigned_by_profile_id: adminProfileId,
          status,
          due_date: dueDateTime,
          scheduled_for: scheduledForVal,
          reminder_settings: reminderSettings,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();

      if (insertErr) {
        console.error('[assignWorksheetToUser] Insert failed:', insertErr.message);
        return Response.json({ error: insertErr.message }, { status: 500 });
      }

      console.log('[assignWorksheetToUser] Assigned worksheet', worksheet_id, 'to profile', targetProfileId);

      // Update Base44 Worksheet.assigned_to (backwards compat)
      try {
        const ws = await base44.asServiceRole.entities.Worksheet.get(worksheet_id);
        const currentAssigned = ws.assigned_to || [];
        if (!currentAssigned.includes(targetProfileId)) {
          await base44.asServiceRole.entities.Worksheet.update(worksheet_id, {
            assigned_to: [...currentAssigned, targetProfileId],
            updated_at: now,
          });
        }
      } catch (e) { /* non-fatal */ }

      // Notification
      try {
        const b44Users = await base44.asServiceRole.entities.User.filter({ email: target_email.toLowerCase() });
        const recipientUser = b44Users?.[0];
        if (recipientUser) {
          const ws = await base44.asServiceRole.entities.Worksheet.get(worksheet_id);
          await base44.asServiceRole.entities.Notification.create({
            recipient_id: recipientUser.id,
            recipient_profile_id: targetProfileId,
            sender_id: user.id,
            business_id: targetBusinessId,
            notification_type: 'worksheet_assigned',
            notification_category: 'action_required',
            title: 'New Worksheet Assigned',
            message: `Your advisory team has assigned "${ws.title}" for you to complete.`,
            related_entity_type: 'Worksheet',
            related_entity_id: worksheet_id,
            action_url: '/advisory/resources',
            priority: 'medium',
          });
        }
      } catch (e) { /* non-fatal */ }

      return Response.json({
        success: true,
        assignment_id: assignment.id,
        worksheet_id,
        assigned_to_profile_id: targetProfileId,
        assigned_to_business_id: targetBusinessId,
        assigned_to_email: target_email,
        status,
        due_date: dueDateTime,
      });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });

  } catch (err) {
    console.error('[assignWorksheetToUser] Error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});