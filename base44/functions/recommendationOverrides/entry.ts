/**
 * recommendationOverrides — Advisor Override Management
 *
 * Manages recommendation_overrides records. Overrides allow assigned advisors
 * and admins to confirm, replace, suppress, defer, or add context to a BIE
 * recommendation for a specific business.
 *
 * Rules:
 *   - Never modify an override record in place (except to revoke)
 *   - Every new decision creates a new audit record
 *   - Only one active override of the same type per recommendation/business
 *   - Authorization: assigned advisor for that business, or admin/super_admin
 *
 * Actions:
 *   - create:  create a new override (audits the previous state)
 *   - revoke:  revoke an override by id (sets revoked_at + active=false)
 *   - list:    list overrides for a business (optionally filtered by recommendation_key)
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
    if (!SUPABASE_URL || !SERVICE_KEY) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    // ── Resolve profile ───────────────────────────────────────────────────────
    const { data: prof } = await sb.from('profiles').select('id, app_role').eq('email', user.email).maybeSingle();
    const isAdmin = user.role === 'admin' || user.role === 'super_admin' || prof?.app_role === 'admin' || prof?.app_role === 'super_admin';

    // ── Verify advisor authorization for a business ────────────────────────────
    async function verifyAdvisorAccess(businessId: string): Promise<boolean> {
      if (isAdmin) return true;
      if (!prof?.id || !businessId) return false;
      // Check business ownership
      const { data: owner } = await sb.from('business_owners')
        .select('business_id').eq('business_id', businessId).eq('profile_id', prof.id).maybeSingle();
      if (owner) return true;
      // Check advisor assignment
      const { data: access } = await sb.from('expert_advisor_access')
        .select('client_profile_id').eq('business_id', businessId)
        .eq('expert_profile_id', String(prof.id)).eq('access_status', 'active').maybeSingle();
      return !!access;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ACTION: create
    // ══════════════════════════════════════════════════════════════════════════
    if (action === 'create') {
      const { recommendation_key, business_id, profile_id, override_type, strategy_id, new_value, reason } = body;
      if (!recommendation_key || !business_id || !override_type) {
        return Response.json({ error: 'recommendation_key, business_id, override_type required' }, { status: 400 });
      }

      const hasAccess = await verifyAdvisorAccess(business_id);
      if (!hasAccess) return Response.json({ error: 'Not authorized for this business' }, { status: 403 });

      // ── Fetch previous active override of the same type (for audit trail) ───
      const { data: previous } = await sb.from('recommendation_overrides')
        .select('*')
        .eq('recommendation_key', recommendation_key)
        .eq('business_id', business_id)
        .eq('override_type', override_type)
        .eq('active', true)
        .is('revoked_at', null)
        .maybeSingle();

      // ── Revoke previous override of the same type (never modify in place) ───
      if (previous) {
        await sb.from('recommendation_overrides')
          .update({ revoked_at: new Date().toISOString(), active: false })
          .eq('id', previous.id);
      }

      // ── Create new override record ──────────────────────────────────────────
      const { data, error } = await sb.from('recommendation_overrides').insert({
        recommendation_key,
        business_id,
        profile_id: profile_id || null,
        override_type,
        previous_value: previous ? { strategy_id: previous.strategy_id, new_value: previous.new_value } : null,
        new_value: new_value || null,
        strategy_id: strategy_id || null,
        advisor_id: String(prof?.id) || user.email,
        reason: reason || null,
        active: true,
      }).select().single();

      if (error) return Response.json({ error: error.message }, { status: 400 });
      return Response.json({ override: data, previous_override_revoked: previous?.id || null });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ACTION: revoke
    // ══════════════════════════════════════════════════════════════════════════
    if (action === 'revoke') {
      const { override_id } = body;
      if (!override_id) return Response.json({ error: 'override_id required' }, { status: 400 });

      // Fetch the override to verify authorization
      const { data: override } = await sb.from('recommendation_overrides')
        .select('*').eq('id', override_id).maybeSingle();
      if (!override) return Response.json({ error: 'Override not found' }, { status: 404 });

      // Same advisor or admin may revoke
      const isOwner = override.advisor_id === String(prof?.id) || override.advisor_id === user.email;
      if (!isAdmin && !isOwner) {
        const hasAccess = await verifyAdvisorAccess(override.business_id);
        if (!hasAccess) return Response.json({ error: 'Not authorized to revoke this override' }, { status: 403 });
      }

      const { error } = await sb.from('recommendation_overrides')
        .update({ revoked_at: new Date().toISOString(), active: false })
        .eq('id', override_id);

      if (error) return Response.json({ error: error.message }, { status: 400 });
      return Response.json({ success: true, revoked_override: override_id });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ACTION: list
    // ══════════════════════════════════════════════════════════════════════════
    if (action === 'list') {
      const { business_id, recommendation_key, active_only = true } = body;
      if (!business_id) return Response.json({ error: 'business_id required' }, { status: 400 });

      const hasAccess = await verifyAdvisorAccess(business_id);
      if (!hasAccess) return Response.json({ error: 'Not authorized for this business' }, { status: 403 });

      let query = sb.from('recommendation_overrides')
        .select('*').eq('business_id', business_id).order('created_at', { ascending: false });
      if (recommendation_key) query = query.eq('recommendation_key', recommendation_key);
      if (active_only) query = query.eq('active', true).is('revoked_at', null);

      const { data, error } = await query;
      if (error) return Response.json({ error: error.message }, { status: 400 });
      return Response.json({ overrides: data || [] });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error('[recommendationOverrides] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});