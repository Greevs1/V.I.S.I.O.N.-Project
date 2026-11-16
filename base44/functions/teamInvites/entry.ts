/**
 * teamInvites — Full invite lifecycle management in Supabase
 *
 * Actions:
 *   createInvite  — Create invite record + send email via Base44
 *   resendInvite  — Re-send the invite email
 *   cancelInvite  — Mark invite as cancelled
 *   listInvites    — List pending/accepted/expired invites
 *   acceptInvite  — Accept an invite (sets accepted_at, updates status)
 *
 * Table: team_invites
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

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
    const { action, data } = body;

    // ── Ensure table exists ──────────────────────────────────────────────────
    try { await sb.from('team_invites').select('id').limit(1); } catch {
      // Create table if missing
      try {
        await sb.sql`
          CREATE TABLE IF NOT EXISTS team_invites (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            invited_email TEXT NOT NULL,
            invited_role TEXT NOT NULL DEFAULT 'user',
            invited_by TEXT,
            company_id TEXT,
            profile_id TEXT,
            business_id TEXT,
            invite_token TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TIMESTAMPTZ DEFAULT now(),
            expires_at TIMESTAMPTZ,
            accepted_at TIMESTAMPTZ,
            updated_at TIMESTAMPTZ DEFAULT now()
          )`;
      } catch { /* table likely exists */ }
    }

    // ── CREATE INVITE ───────────────────────────────────────────────────────
    if (action === 'createInvite') {
      if (user.role !== 'admin' && user.role !== 'super_admin' && user.role !== 'owner') {
        return Response.json({ error: 'Forbidden: insufficient permissions' }, { status: 403 });
      }
      const { email, role, company_id, profile_id, business_id } = data || {};
      if (!email) return Response.json({ error: 'email is required' }, { status: 400 });

      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

      // Check for existing pending invite
      const { data: existing } = await sb.from('team_invites')
        .select('id, status')
        .eq('invited_email', email.toLowerCase())
        .eq('status', 'pending')
        .maybeSingle();

      if (existing) {
        return Response.json({ error: 'An active invite already exists for this email', existing_id: existing.id }, { status: 409 });
      }

      const { data: invite, error: insertErr } = await sb.from('team_invites')
        .insert({
          invited_email: email.toLowerCase(),
          invited_role: role || 'user',
          invited_by: user.email,
          company_id: company_id || null,
          profile_id: profile_id || null,
          business_id: business_id || null,
          invite_token: crypto.randomUUID(),
          status: 'pending',
          created_at: now,
          expires_at: expiresAt,
          updated_at: now,
        })
        .select()
        .single();

      if (insertErr) {
        return Response.json({ error: insertErr.message }, { status: 500 });
      }

      // Send invite via Base44
      try {
        await base44.users.inviteUser(email.toLowerCase(), role || 'user');
      } catch (inviteErr) {
        console.warn('[teamInvites] Base44 inviteUser failed (non-fatal):', inviteErr?.message);
      }

      // ── Notify if invited user already has a profile ──────────────────────
      try {
        const invitedUsers = await base44.asServiceRole.entities.User.filter({ email: email.toLowerCase() });
        const invitedUser = invitedUsers?.[0];
        if (invitedUser) {
          await base44.functions.invoke('notificationService', {
            action: 'createNotification',
            data: {
              recipient_id: invitedUser.id,
              sender_id: user.id,
              notification_type: 'team_invite',
              title: 'You Have Been Invited',
              message: `${user.full_name || user.email} has invited you to join the platform as ${role || 'user'}.`,
              action_url: '/dashboard',
              priority: 'high',
              recipient_email: email.toLowerCase(),
            },
          });
        }
      } catch (notifErr) {
        console.warn('[teamInvites] Notification failed (non-fatal):', notifErr.message);
      }

      return Response.json({ success: true, invite });
    }

    // ── RESEND INVITE ───────────────────────────────────────────────────────
    if (action === 'resendInvite') {
      if (user.role !== 'admin' && user.role !== 'super_admin' && user.role !== 'owner') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
      const { invite_id } = data || {};
      if (!invite_id) return Response.json({ error: 'invite_id is required' }, { status: 400 });

      const { data: invite, error: fetchErr } = await sb.from('team_invites')
        .select('*').eq('id', invite_id).maybeSingle();
      if (fetchErr || !invite) return Response.json({ error: 'Invite not found' }, { status: 404 });

      const now = new Date().toISOString();
      const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      await sb.from('team_invites')
        .update({ status: 'pending', expires_at: newExpiresAt, updated_at: now })
        .eq('id', invite_id);

      // Re-send via Base44
      try {
        await base44.users.inviteUser(invite.invited_email, invite.invited_role || 'user');
      } catch (inviteErr) {
        console.warn('[teamInvites] Base44 resend failed (non-fatal):', inviteErr?.message);
      }

      return Response.json({ success: true, invite_id, expires_at: newExpiresAt });
    }

    // ── CANCEL INVITE ───────────────────────────────────────────────────────
    if (action === 'cancelInvite') {
      if (user.role !== 'admin' && user.role !== 'super_admin' && user.role !== 'owner') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
      const { invite_id } = data || {};
      if (!invite_id) return Response.json({ error: 'invite_id is required' }, { status: 400 });

      const { error: updateErr } = await sb.from('team_invites')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', invite_id);

      if (updateErr) return Response.json({ error: updateErr.message }, { status: 500 });
      return Response.json({ success: true, invite_id, status: 'cancelled' });
    }

    // ── LIST INVITES ────────────────────────────────────────────────────────
    if (action === 'listInvites') {
      let query = sb.from('team_invites')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      // Owner sees invites they sent; admin/super_admin see all
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        query = query.eq('invited_by', user.email);
      }

      const { data: invites, error } = await query;
      if (error) return Response.json({ error: error.message }, { status: 500 });

      // Mark expired
      const now = new Date();
      const updated = (invites || []).map(i => {
        if (i.status === 'pending' && i.expires_at && new Date(i.expires_at) < now) {
          return { ...i, status: 'expired' };
        }
        return i;
      });

      return Response.json({ invites: updated });
    }

    // ── ACCEPT INVITE ───────────────────────────────────────────────────────
    if (action === 'acceptInvite') {
      const { invite_id } = data || {};
      if (!invite_id) return Response.json({ error: 'invite_id is required' }, { status: 400 });

      const { data: invite, error: fetchErr } = await sb.from('team_invites')
        .select('*').eq('id', invite_id).maybeSingle();
      if (fetchErr || !invite) return Response.json({ error: 'Invite not found' }, { status: 404 });

      if (invite.status === 'accepted') {
        return Response.json({ success: true, invite_id, already_accepted: true });
      }
      if (invite.status === 'cancelled') {
        return Response.json({ error: 'This invite has been cancelled' }, { status: 400 });
      }
      if (invite.status === 'expired' || (invite.expires_at && new Date(invite.expires_at) < new Date())) {
        return Response.json({ error: 'This invite has expired' }, { status: 400 });
      }

      // Only the invited user can accept
      if (user.email.toLowerCase() !== invite.invited_email.toLowerCase()) {
        return Response.json({ error: 'This invite is not for your email' }, { status: 403 });
      }

      const now = new Date().toISOString();
      await sb.from('team_invites')
        .update({ status: 'accepted', accepted_at: now, updated_at: now })
        .eq('id', invite_id);

      return Response.json({ success: true, invite_id, status: 'accepted' });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error('[teamInvites] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});