/**
 * assignDocumentToUser — Creates a resource assignment record.
 * Resolves target user's Supabase profile; auto-creates if missing.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';

// Inline profile resolver
async function resolveProfile(sb, base44, targetEmail) {
  const email = targetEmail.toLowerCase();
  const { data: byEmail } = await sb.from('profiles')
    .select('id, primary_business_id, app_role, base44_user_id')
    .ilike('email', email)
    .maybeSingle();
  if (byEmail) return byEmail;

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
    const { data: retry } = await sb.from('profiles')
      .select('id, primary_business_id, app_role, base44_user_id')
      .ilike('email', email)
      .maybeSingle();
    return retry || null;
  }
  return newProfile;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin' && user.role !== 'super_admin') {
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
    const { document_id, target_email, action, assignment_id } = body;

    // ── CANCEL ASSIGNMENT (soft delete) ──────────────────────────────────────
    if (action === 'deleteAssignment') {
      if (!assignment_id) return Response.json({ error: 'assignment_id required' }, { status: 400 });

      const { data: existing } = await sb.from('resource_assignments')
        .select('id, status').eq('id', assignment_id).maybeSingle();
      if (!existing) return Response.json({ error: 'Assignment not found', affected_rows: 0 }, { status: 404 });

      const now = new Date().toISOString();
      const { data: updated, error: updateErr } = await sb.from('resource_assignments')
        .update({ status: 'cancelled', cancelled_at: now, updated_at: now })
        .eq('id', assignment_id)
        .select('id');

      if (updateErr) {
        console.error('[assignDocumentToUser] cancel failed:', updateErr.message);
        return Response.json({ error: updateErr.message }, { status: 500 });
      }

      const affected_rows = updated?.length ?? 0;
      console.log('[assignDocumentToUser] Cancelled assignment', assignment_id, 'affected_rows:', affected_rows);
      return Response.json({ success: true, assignment_id, table: 'resource_assignments', affected_rows, status: 'cancelled' });
    }

    if (!document_id) return Response.json({ error: 'document_id is required' }, { status: 400 });
    if (!target_email) return Response.json({ error: 'target_email is required' }, { status: 400 });

    // Fetch source document
    const { data: sourceDoc, error: docErr } = await sb
      .from('documents')
      .select('id, name, storage_bucket, file_path, file_url, file_size, document_type')
      .eq('id', document_id)
      .maybeSingle();
    if (docErr || !sourceDoc) {
      return Response.json({ error: 'Source document not found' }, { status: 404 });
    }

    // Resolve target profile (auto-create if needed)
    const targetProfile = await resolveProfile(sb, base44, target_email);
    if (!targetProfile) {
      return Response.json({ error: `User not found: ${target_email}` }, { status: 400 });
    }
    const targetProfileId = targetProfile.id;
    let targetBusinessId = targetProfile.primary_business_id || null;

    // Resolve admin profile
    const adminProfile = await resolveProfile(sb, base44, user.email);
    const adminId = adminProfile?.id || null;

    // Check for duplicate
    const { data: existing } = await sb
      .from('resource_assignments')
      .select('id')
      .eq('resource_document_id', document_id)
      .eq('profile_id', targetProfileId)
      .maybeSingle();
    if (existing) {
      return Response.json({ success: true, assignment_id: existing.id, already_assigned: true });
    }

    const now = new Date().toISOString();

    // Create resource_assignments record
    const { data: assignment, error: insertErr } = await sb
      .from('resource_assignments')
      .insert({
        resource_document_id: document_id,
        profile_id: targetProfileId,
        business_id: targetBusinessId,
        assigned_by: adminId,
        assigned_at: now,
        created_at: now,
        updated_at: now,
      })
      .select('id')
      .single();

    if (insertErr) {
      console.error('[assignDocumentToUser] Insert failed:', insertErr.message);
      return Response.json({ error: insertErr.message }, { status: 500 });
    }

    console.log('[assignDocumentToUser] Assigned doc', document_id, 'to profile', targetProfileId);

    // Notify user (non-blocking)
    (async () => {
      try {
        const b44Users = await base44.asServiceRole.entities.User.filter({ email: target_email.toLowerCase() });
        const recipientUser = b44Users?.[0];
        if (recipientUser) {
          await base44.asServiceRole.entities.Notification.create({
            recipient_id: recipientUser.id,
            recipient_profile_id: targetProfileId,
            sender_id: user.id,
            business_id: targetBusinessId,
            notification_type: 'resource_assigned',
            notification_category: 'information',
            title: 'New Resource Assigned',
            message: `"${sourceDoc.name}" has been shared with you by your advisory team.`,
            related_entity_type: 'Document',
            related_entity_id: document_id,
            action_url: '/advisory/resources',
            priority: 'medium',
          });
        }
      } catch (e) { /* non-fatal */ }
    })();

    return Response.json({
      success: true,
      assignment_id: assignment.id,
      target_email,
      target_profile_id: targetProfileId,
      resource_document_id: document_id,
    });

  } catch (err) {
    console.error('[assignDocumentToUser] error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});