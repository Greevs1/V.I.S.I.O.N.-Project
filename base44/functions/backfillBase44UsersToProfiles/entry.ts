/**
 * backfillBase44UsersToProfiles — Admin-only
 *
 * For every Base44 user:
 *   1. Find Supabase profile by base44_user_id
 *   2. Find Supabase profile by email
 *   3. If found, update base44_user_id
 *   4. If not found, create profile
 *
 * Returns counts: created, updated, skipped, errors
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';

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

    // Load all Base44 users
    const allUsers = await base44.asServiceRole.entities.User.list('-created_date', 500);
    if (!allUsers || allUsers.length === 0) {
      return Response.json({ message: 'No Base44 users found', created: 0, updated: 0, skipped: 0, errors: [] });
    }

    const results = [];
    let created = 0, updated = 0, skipped = 0;
    const errors = [];
    const now = new Date().toISOString();

    for (const b44User of allUsers) {
      const email = (b44User.email || '').toLowerCase();
      const base44UserId = b44User.id;
      if (!email) { skipped++; continue; }

      try {
        const fullName = b44User.full_name || '';
        const [firstName, ...rest] = fullName.trim().split(' ');
        const lastName = rest.join(' ') || null;

        const roleMap = { super_admin: 'super_admin', admin: 'admin', advisor: 'advisor' };
        const appRole = roleMap[b44User.role] || 'owner';
        const forceRole = email === 'garrickreevs@gmail.com' ? 'super_admin' : appRole;

        // Check by base44_user_id first
        const { data: byId } = await sb.from('profiles')
          .select('id, base44_user_id, first_name, last_name, app_role')
          .eq('base44_user_id', base44UserId)
          .maybeSingle();

        if (byId) {
          // Already linked — ensure role is correct for Garrick
          if (forceRole !== byId.app_role || !byId.first_name || !byId.last_name) {
            await sb.from('profiles').update({
              app_role: forceRole,
              first_name: byId.first_name || firstName || null,
              last_name: byId.last_name || lastName || null,
              updated_at: now,
            }).eq('id', byId.id);
          }
          skipped++;
          results.push({ email, base44_user_id: base44UserId, profile_id: byId.id, action: 'skipped_already_linked' });
          continue;
        }

        // Check by email
        const { data: byEmail } = await sb.from('profiles')
          .select('id, base44_user_id, first_name, last_name, app_role')
          .ilike('email', email)
          .maybeSingle();

        if (byEmail) {
          const patch = {
            base44_user_id: base44UserId,
            app_role: forceRole,
            updated_at: now,
          };
          if (!byEmail.first_name && firstName) patch.first_name = firstName;
          if (!byEmail.last_name && lastName) patch.last_name = lastName;
          await sb.from('profiles').update(patch).eq('id', byEmail.id);
          updated++;
          results.push({ email, base44_user_id: base44UserId, profile_id: byEmail.id, action: 'updated' });
          continue;
        }

        // Create new profile
        const { data: newProfile, error: insertErr } = await sb.from('profiles').insert({
          email,
          base44_user_id: base44UserId,
          first_name: firstName || null,
          last_name: lastName || null,
          app_role: forceRole,
          onboarding_completed: false,
          created_at: now,
          updated_at: now,
        }).select('id').single();

        if (insertErr) {
          errors.push({ email, error: insertErr.message });
          continue;
        }

        created++;
        results.push({ email, base44_user_id: base44UserId, profile_id: newProfile.id, action: 'created' });

      } catch (err) {
        errors.push({ email, error: err.message });
      }
    }

    console.log(`[backfillBase44UsersToProfiles] Done: created=${created}, updated=${updated}, skipped=${skipped}, errors=${errors.length}`);

    return Response.json({
      success: true,
      summary: { total: allUsers.length, created, updated, skipped, error_count: errors.length },
      errors,
      results,
    });

  } catch (err) {
    console.error('[backfillBase44UsersToProfiles] Error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});