/**
 * syncBase44UserToSupabaseProfile
 *
 * Canonical identity resolver: given a Base44 authenticated user,
 * find or create their Supabase profile and ensure base44_user_id is set.
 *
 * Resolution order:
 *   1. Find profile by base44_user_id
 *   2. Find profile by lowercase email
 *   3. Create new profile
 *
 * Also accepts admin override: { target_email } to resolve another user's profile.
 *
 * Returns: { profile_id, profile, created, updated }
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

    // Admin can resolve a different user by email
    let targetUser = user;
    if (body.target_email && (user.role === 'admin' || user.role === 'super_admin')) {
      const found = await base44.asServiceRole.entities.User.filter({ email: body.target_email.toLowerCase() });
      if (found?.[0]) targetUser = found[0];
    }

    const email = (targetUser.email || '').toLowerCase();
    const base44UserId = targetUser.id;
    const fullName = targetUser.full_name || '';
    const [firstName, ...rest] = fullName.trim().split(' ');
    const lastName = rest.join(' ') || null;

    // Determine role mapping
    const roleMap = { super_admin: 'super_admin', admin: 'admin', advisor: 'advisor' };
    const appRole = roleMap[targetUser.role] || 'owner';

    const now = new Date().toISOString();

    // ── Step 1: Find by base44_user_id ────────────────────────────────────
    let { data: profile } = await sb.from('profiles')
      .select('*')
      .eq('base44_user_id', base44UserId)
      .maybeSingle();

    if (profile) {
      // Update name fields if missing
      const patch = { base44_user_id: base44UserId, updated_at: now };
      if (!profile.first_name && firstName) patch.first_name = firstName;
      if (!profile.last_name && lastName) patch.last_name = lastName;
      // Promote role for super_admin
      if (email === 'garrickreevs@gmail.com' && profile.app_role !== 'super_admin') {
        patch.app_role = 'super_admin';
      }
      const { data: updated } = await sb.from('profiles').update(patch).eq('id', profile.id).select().single();
      return Response.json({ profile_id: profile.id, profile: updated || profile, created: false, updated: true });
    }

    // ── Step 2: Find by email ─────────────────────────────────────────────
    if (email) {
      const { data: byEmail } = await sb.from('profiles')
        .select('*')
        .ilike('email', email)
        .maybeSingle();

      if (byEmail) {
        // Stamp base44_user_id onto existing profile
        const patch = { base44_user_id: base44UserId, updated_at: now };
        if (!byEmail.first_name && firstName) patch.first_name = firstName;
        if (!byEmail.last_name && lastName) patch.last_name = lastName;
        if (email === 'garrickreevs@gmail.com') patch.app_role = 'super_admin';
        const { data: updated } = await sb.from('profiles').update(patch).eq('id', byEmail.id).select().single();
        console.log('[syncBase44UserToSupabaseProfile] Linked existing profile', byEmail.id, 'to base44 user', base44UserId);
        return Response.json({ profile_id: byEmail.id, profile: updated || byEmail, created: false, updated: true });
      }
    }

    // ── Step 3: Create new profile ────────────────────────────────────────
    const insertPayload = {
      email,
      base44_user_id: base44UserId,
      first_name: firstName || null,
      last_name: lastName || null,
      app_role: email === 'garrickreevs@gmail.com' ? 'super_admin' : appRole,
      onboarding_completed: false,
      created_at: now,
      updated_at: now,
    };

    const { data: newProfile, error: insertErr } = await sb.from('profiles')
      .insert(insertPayload)
      .select()
      .single();

    if (insertErr) {
      // Race condition: profile created between check and insert — re-fetch
      const { data: raceProfile } = await sb.from('profiles')
        .select('*')
        .ilike('email', email)
        .maybeSingle();
      if (raceProfile) {
        await sb.from('profiles').update({ base44_user_id: base44UserId, updated_at: now }).eq('id', raceProfile.id);
        return Response.json({ profile_id: raceProfile.id, profile: raceProfile, created: false, updated: true });
      }
      console.error('[syncBase44UserToSupabaseProfile] Insert failed:', insertErr.message);
      return Response.json({ error: insertErr.message }, { status: 500 });
    }

    console.log('[syncBase44UserToSupabaseProfile] Created profile', newProfile.id, 'for', email);
    return Response.json({ profile_id: newProfile.id, profile: newProfile, created: true, updated: false });

  } catch (err) {
    console.error('[syncBase44UserToSupabaseProfile] Error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});