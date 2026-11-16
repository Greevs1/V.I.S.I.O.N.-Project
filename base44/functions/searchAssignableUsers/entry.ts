/**
 * searchAssignableUsers — shared user search for admin assignment flows
 *
 * Returns a list of assignable users from Supabase profiles.
 * Admin-only. Does NOT touch worksheet assignment logic.
 *
 * Supports action: 'searchAdvisoryAssignableUsers' for expert advisor search
 * which queries profiles directly with ilike and role filter.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Admin-only guard
    if (!['admin', 'super_admin', 'advisor'].includes(user.role)) {
      return Response.json({ error: 'Forbidden — admin access required' }, { status: 403 });
    }

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SERVICE_KEY) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    const body = await req.json().catch(() => ({}));
    const { query = '', limit = 50, role_filter, action, searchTerm } = body;

    // ── Advisory search: live DB query with ilike ──────────────────────────
    if (action === 'searchAdvisoryAssignableUsers') {
      const term = (searchTerm || query || '').trim();
      const advisorRoles = ['expert_advisor', 'admin', 'super_admin'];

      let dbQuery = sb
        .from('profiles')
        .select('id, first_name, last_name, email, app_role, primary_business_id')
        .in('app_role', advisorRoles)
        .order('last_name', { ascending: true })
        .limit(100);

      if (term) {
        dbQuery = dbQuery.or(
          `first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%`
        );
      }

      const { data: profiles, error } = await dbQuery;

      if (error) {
        console.error('[searchAdvisoryAssignableUsers] Supabase error:', error.message);
        return Response.json({ error: error.message, debug: { supabase_url: SUPABASE_URL, term, roles: advisorRoles } }, { status: 500 });
      }

      const ROLE_LABELS = { super_admin: 'Super Admin', admin: 'Admin', expert_advisor: 'Expert Advisor' };

      const users = (profiles || []).slice(0, limit).map(p => ({
        profile_id: p.id,
        first_name: p.first_name || '',
        last_name: p.last_name || '',
        full_name: [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || 'Unknown',
        email: p.email || '',
        app_role: p.app_role || '',
        role_label: ROLE_LABELS[p.app_role] || p.app_role || '',
        primary_business_id: p.primary_business_id || null,
        avatar_url: null,
      }));

      console.log(`[searchAdvisoryAssignableUsers] term="${term}" found=${users.length}`);

      return Response.json({
        users,
        total: users.length,
        debug: {
          term,
          roles_searched: advisorRoles,
          result_count: users.length,
          first_5_roles: (profiles || []).slice(0, 5).map(p => p.app_role),
        }
      });
    }

    // ── Default search: preload all then filter client-side ────────────────
    let dbQuery = sb
      .from('profiles')
      .select('id, first_name, last_name, email, app_role, primary_business_id, base44_user_id')
      .order('last_name', { ascending: true })
      .limit(200);

    if (role_filter) {
      const roles = Array.isArray(role_filter) ? role_filter : [role_filter];
      dbQuery = dbQuery.in('app_role', roles);
    }

    const { data: profiles, error } = await dbQuery;

    if (error) return Response.json({ error: error.message }, { status: 500 });

    const q = (query || '').toLowerCase().trim();

    const filtered = (profiles || []).filter(p => {
      if (!q) return true;
      const fullName = `${p.first_name || ''} ${p.last_name || ''}`.toLowerCase();
      const email = (p.email || '').toLowerCase();
      return fullName.includes(q) || email.includes(q);
    });

    const users = filtered.slice(0, limit).map(p => ({
      profile_id: p.id,
      user_id: p.base44_user_id || null,
      first_name: p.first_name || '',
      last_name: p.last_name || '',
      full_name: [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || 'Unknown',
      email: p.email || '',
      app_role: p.app_role || 'owner',
      primary_business_id: p.primary_business_id || null,
      avatar_url: null,
    }));

    return Response.json({ users, total: users.length });
  } catch (error) {
    console.error('[searchAssignableUsers] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});