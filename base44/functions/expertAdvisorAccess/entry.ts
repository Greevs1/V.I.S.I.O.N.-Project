import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireBusinessContext } from '../../shared/businessScope/activeBusiness.ts';

const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const DEFAULT_PERMISSIONS = {
  overview: true,
  activity_feed: true,
  outcome_tracking: false,
  assessments: true,
  documents: false,
  resources: true,
  sprints: true,
  opportunities: true,
  strategy_expansions: false,
  freedom_projections: true,
  galileo_summary: true,
  notes: false,
};

// Always-on baseline permissions — cannot be removed by permission updates
const BASELINE_PERMISSIONS = { iq_dashboard: true, activity_feed: true };

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const body = await req.json();
    const { action } = body;

    // Resolve caller profile — try base44_user_id first, fallback to email
    let callerProfile = null;
    const { data: profileByUid } = await sb
      .from('profiles')
      .select('id, app_role, email, first_name, last_name')
      .eq('base44_user_id', user.id)
      .maybeSingle();
    callerProfile = profileByUid;

    if (!callerProfile && user.email) {
      const { data: profileByEmail } = await sb
        .from('profiles')
        .select('id, app_role, email, first_name, last_name')
        .eq('email', user.email)
        .maybeSingle();
      callerProfile = profileByEmail;
    }

    const callerRole = callerProfile?.app_role || user.role || 'user';
    const isSuperAdmin = callerRole === 'super_admin';
    const isAdmin = callerRole === 'admin' || isSuperAdmin;
    const isExpertAdvisor = callerRole === 'expert_advisor';
    const isAdvisor = callerRole === 'advisor';
    const canAccessPortal = isAdmin || isExpertAdvisor || isAdvisor;

    console.log(`[expertAdvisorAccess] action=${action} callerRole=${callerRole} callerProfileId=${callerProfile?.id} base44UserId=${user.id}`);

    // Helper: enrich profiles with name from first_name + last_name
    const enrichProfiles = async (ids) => {
      if (!ids.length) return [];
      const { data } = await sb
        .from('profiles')
        .select('id, first_name, last_name, email, app_role, company_name, primary_business_id')
        .in('id', ids);
      return (data || []).map(p => ({
        ...p,
        full_name: [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || '',
      }));
    };

    // Helper: enrich businesses
    const enrichBusinesses = async (businessIds) => {
      const ids = businessIds.filter(Boolean);
      if (!ids.length) return [];
      const { data } = await sb
        .from('businesses')
        .select('id, name')
        .in('id', ids);
      return data || [];
    };

    // ── GET MY PROFILE ID ─────────────────────────────────────────────────────
    if (action === 'getMyProfileId') {
      return Response.json({ profile_id: callerProfile?.id, role: callerRole });
    }

    // ── LIST ASSIGNED CLIENTS (for expert advisor — their own assignments) ────
    // ── MY ADVISOR (owner-side) ──────────────────────────────────────────────
    // The counterpart to listMyClients: an OWNER asking who is already helping
    // them. This exists so the team path can NAME the real relationship instead
    // of offering every owner a generic "work with our team" sales door.
    //
    // The subject is the AUTHENTICATED caller's own profile, never a value from
    // the body, so this cannot read anyone else's relationship.
    //
    // It reads only the two relationships that already exist:
    //   1. business_entities.assigned_advisor_id — the assignment on the business
    //      itself (the same column writeGuard, valuationAuth and the canonical
    //      owner resolver already treat as authority). Read ONLY after confirming
    //      the caller owns that business, so a caller cannot probe someone
    //      else's advisor by guessing a business id.
    //   2. expert_advisor_access rows where this caller IS the client.
    // A name and a role only. No email or contact detail is exposed.
    if (action === 'getMyAdvisor') {
      const callerProfileId = callerProfile?.id;
      if (!callerProfileId) return Response.json({ advisor: null, source: null });

      const readAdvisorProfile = async (profileId: string) => {
        const { data: p } = await sb
          .from('profiles')
          .select('id, full_name, first_name, last_name, app_role')
          .eq('id', profileId)
          .maybeSingle();
        if (!p) return null;
        const name =
          p.full_name ||
          [p.first_name, p.last_name].filter(Boolean).join(' ').trim() ||
          null;
        if (!name) return null;
        return { profile_id: p.id, name, role: p.app_role || null };
      };

      const { business_id } = body;
      if (business_id) {
        const { data: owns } = await sb
          .from('business_owners')
          .select('profile_id')
          .eq('business_id', business_id)
          .eq('profile_id', callerProfileId)
          .maybeSingle();

        if (owns) {
          const { data: biz, error: bizError } = await sb
            .from('business_entities')
            .select('assigned_advisor_id')
            .eq('id', business_id)
            .maybeSingle();
          if (bizError) console.warn('[getMyAdvisor] business lookup:', bizError.message);

          if (biz?.assigned_advisor_id) {
            const advisor = await readAdvisorProfile(biz.assigned_advisor_id);
            if (advisor) {
              return Response.json({ advisor, source: 'assigned_advisor' });
            }
          }
        }
      }

      const { data: rows, error: rowError } = await sb
        .from('expert_advisor_access')
        .select('id, expert_profile_id, access_role')
        .eq('client_profile_id', callerProfileId)
        .neq('access_status', 'revoked')
        .limit(1);
      if (rowError) console.warn('[getMyAdvisor] access lookup:', rowError.message);

      const row = rows?.[0];
      if (row?.expert_profile_id) {
        const advisor = await readAdvisorProfile(row.expert_profile_id);
        if (advisor) {
          return Response.json({
            advisor: { ...advisor, role: advisor.role || row.access_role || null, access_id: row.id },
            source: 'expert_access',
          });
        }
      }

      return Response.json({ advisor: null, source: null });
    }

    if (action === 'listMyClients') {
      if (!canAccessPortal) return Response.json({ error: 'Forbidden', access_records: [] }, { status: 403 });

      // ── Phase 6.6 — the expert identity is the AUTHENTICATED caller's own ────
      // `body.expert_profile_id` previously WON over the session, so any caller
      // passing canAccessPortal could name another advisor and read that
      // advisor's client roster (client names, emails, businesses, permissions).
      // Admins have `listAllAssignments` for cross-advisor review; this action is
      // the "my own clients" view and derives its subject from the session only.
      const expertProfileId = callerProfile?.id;
      if (!expertProfileId) return Response.json({ error: 'No profile found for current user', access_records: [], table_missing: false }, { status: 400 });

      console.log(`[listMyClients] expertProfileId=${expertProfileId}`);

      const { data: rows, error } = await sb
        .from('expert_advisor_access')
        .select('*')
        .eq('expert_profile_id', expertProfileId)
        .eq('access_status', 'active');

      if (error) {
        console.error('[listMyClients] Supabase error:', error.message);
        return Response.json({ access_records: [], table_missing: error.message.includes('does not exist'), table_error: error.message });
      }

      console.log(`[listMyClients] found ${rows?.length || 0} assignments`);

      const clientIds = (rows || []).map(r => r.client_profile_id).filter(Boolean);
      const businessIds = (rows || []).map(r => r.business_id).filter(Boolean);
      const [profiles, businesses] = await Promise.all([enrichProfiles(clientIds), enrichBusinesses(businessIds)]);

      const enriched = (rows || []).map(r => {
        const p = profiles.find(p => p.id === r.client_profile_id) || {};
        const b = businesses.find(b => b.id === r.business_id) || {};
        return {
          ...r,
          permissions: { ...BASELINE_PERMISSIONS, ...(r.permissions || {}) },
          client_name: p.full_name || null,
          client_email: p.email || null,
          business_name: b.name || p.company_name || null,
        };
      });

      return Response.json({ access_records: enriched, caller_profile_id: callerProfile?.id });
    }

    // ── LIST ALL ASSIGNMENTS (admin/super_admin overview) ─────────────────────
    if (action === 'listAllAssignments') {
      if (!isAdmin) return Response.json({ error: 'Forbidden', access_records: [] }, { status: 403 });

      const { data: rows, error } = await sb
        .from('expert_advisor_access')
        .select('*')
        .neq('access_status', 'revoked')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[listAllAssignments] Supabase error:', error.message);
        return Response.json({ access_records: [], table_missing: error.message.includes('does not exist'), table_error: error.message });
      }

      const allProfileIds = [...new Set([
        ...(rows || []).map(r => r.expert_profile_id),
        ...(rows || []).map(r => r.client_profile_id),
      ].filter(Boolean))];
      const businessIds = [...new Set((rows || []).map(r => r.business_id).filter(Boolean))];
      const [profiles, businesses] = await Promise.all([enrichProfiles(allProfileIds), enrichBusinesses(businessIds)]);

      const enriched = (rows || []).map(r => {
        const expert = profiles.find(p => p.id === r.expert_profile_id) || {};
        const client = profiles.find(p => p.id === r.client_profile_id) || {};
        const b = businesses.find(b => b.id === r.business_id) || {};
        return {
          ...r,
          permissions: { ...BASELINE_PERMISSIONS, ...(r.permissions || {}) },
          expert_name: expert.full_name || null,
          expert_email: expert.email || null,
          client_name: client.full_name || null,
          client_email: client.email || null,
          business_name: b.name || client.company_name || null,
        };
      });

      return Response.json({ access_records: enriched });
    }

    // ── LIST ACCESS GRANTS FOR A CLIENT (admin view) ──────────────────────────
    if (action === 'listForClient') {
      if (!isAdmin) return Response.json({ error: 'Forbidden', access_records: [] }, { status: 403 });

      const { client_profile_id } = body;
      if (!client_profile_id) return Response.json({ error: 'client_profile_id required' }, { status: 400 });

      const { data: rows, error } = await sb
        .from('expert_advisor_access')
        .select('*')
        .eq('client_profile_id', client_profile_id)
        .neq('access_status', 'revoked');

      if (error) {
        console.error('[listForClient] Supabase error:', error.message);
        return Response.json({ access_records: [], table_missing: error.message.includes('does not exist'), table_error: error.message });
      }

      const expertIds = (rows || []).map(r => r.expert_profile_id).filter(Boolean);
      const profiles = await enrichProfiles(expertIds);

      const enriched = (rows || []).map(r => {
        const p = profiles.find(p => p.id === r.expert_profile_id) || {};
        return {
          ...r,
          permissions: { ...BASELINE_PERMISSIONS, ...(r.permissions || {}) },
          expert_name: p.full_name || null,
          expert_email: p.email || null,
        };
      });

      return Response.json({ access_records: enriched });
    }

    // ── GRANT ACCESS ──────────────────────────────────────────────────────────
    if (action === 'grant') {
      if (!isAdmin) {
        console.error(`[grant] Forbidden: callerRole=${callerRole} callerProfileId=${callerProfile?.id}`);
        return Response.json({ error: `Forbidden — only admins can grant access. Your role: ${callerRole}` }, { status: 403 });
      }

      const { expert_profile_id, client_profile_id, business_id, permissions } = body;

      console.log('[grant] Incoming:', {
        expert_profile_id,
        client_profile_id,
        business_id,
        granted_by_profile_id: callerProfile?.id,
        granted_by_role: callerRole,
      });

      if (!expert_profile_id || !client_profile_id) {
        return Response.json({ error: 'expert_profile_id and client_profile_id are required' }, { status: 400 });
      }

      // Validate expert profile exists
      const { data: expertProfile } = await sb
        .from('profiles')
        .select('id, email, app_role, first_name, last_name')
        .eq('id', expert_profile_id)
        .maybeSingle();

      if (!expertProfile) {
        console.error(`[grant] Expert profile not found: ${expert_profile_id}`);
        return Response.json({ error: `Expert profile not found: ${expert_profile_id}` }, { status: 400 });
      }

      // Validate client profile exists
      const { data: clientProfile } = await sb
        .from('profiles')
        .select('id, email, first_name, last_name, primary_business_id')
        .eq('id', client_profile_id)
        .maybeSingle();

      if (!clientProfile) {
        console.error(`[grant] Client profile not found: ${client_profile_id}`);
        return Response.json({ error: `Client profile not found: ${client_profile_id}` }, { status: 400 });
      }

      // Enforce baseline permissions always on
      const mergedPerms = { ...DEFAULT_PERMISSIONS, ...(permissions || {}), ...BASELINE_PERMISSIONS };
      // Phase 6.9B — canonical resolution of the CLIENT's business. Was
      // `business_id || clientProfile.primary_business_id || null`.
      const { businessId: resolvedBusinessId, denial: bizDenial } = await requireBusinessContext(
        sb, clientProfile, business_id, 'expertAdvisorAccess.grant'
      );
      if (bizDenial) return bizDenial;

      // Check for existing record (upsert pattern)
      const { data: existing } = await sb
        .from('expert_advisor_access')
        .select('id')
        .eq('expert_profile_id', expert_profile_id)
        .eq('client_profile_id', client_profile_id)
        .maybeSingle();

      let resultData, resultError;

      if (existing) {
        console.log(`[grant] Updating existing record id=${existing.id}`);
        const { data, error } = await sb
          .from('expert_advisor_access')
          .update({
            access_status: 'active',
            permissions: mergedPerms,
            business_id: resolvedBusinessId,
            granted_by_profile_id: callerProfile?.id || null,
            granted_by_role: callerRole,
            updated_at: new Date().toISOString(),
            revoked_at: null,
          })
          .eq('id', existing.id)
          .select()
          .single();
        resultData = data;
        resultError = error;
      } else {
        console.log('[grant] Inserting new record');
        const { data, error } = await sb
          .from('expert_advisor_access')
          .insert({
            expert_profile_id,
            client_profile_id,
            business_id: resolvedBusinessId,
            granted_by_profile_id: callerProfile?.id || null,
            granted_by_role: callerRole,
            access_status: 'active',
            permissions: mergedPerms,
          })
          .select()
          .single();
        resultData = data;
        resultError = error;
      }

      // Hard debug log
      const expertName = [expertProfile.first_name, expertProfile.last_name].filter(Boolean).join(' ') || expertProfile.email;
      const clientName = [clientProfile.first_name, clientProfile.last_name].filter(Boolean).join(' ') || clientProfile.email;
      console.log('[grant] DEBUG RESULT:', {
        expert_profile_id,
        expert_email: expertProfile.email,
        expert_app_role: expertProfile.app_role,
        expert_name: expertName,
        client_profile_id,
        client_email: clientProfile.email,
        client_name: clientName,
        business_id: resolvedBusinessId,
        granted_by_profile_id: callerProfile?.id,
        operation: existing ? 'update' : 'insert',
        returned_id: resultData?.id,
        supabase_error: resultError?.message || null,
      });

      if (resultError) {
        return Response.json({ error: resultError.message, debug: { expert_email: expertProfile.email, client_email: clientProfile.email } }, { status: 500 });
      }

      return Response.json({ success: true, record: resultData, debug: { expert_name: expertName, client_name: clientName } });
    }

    // ── UPDATE PERMISSIONS ────────────────────────────────────────────────────
    if (action === 'updatePermissions') {
      if (!isAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 });

      const { access_id, permissions } = body;
      if (!access_id) return Response.json({ error: 'access_id required' }, { status: 400 });

      // Enforce baseline always on
      const safePerms = { ...(permissions || {}), ...BASELINE_PERMISSIONS };

      const { data, error } = await sb
        .from('expert_advisor_access')
        .update({ permissions: safePerms, updated_at: new Date().toISOString() })
        .eq('id', access_id)
        .select()
        .single();

      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ success: true, record: data });
    }

    // ── REVOKE ACCESS ─────────────────────────────────────────────────────────
    if (action === 'revoke') {
      if (!isAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 });

      const { access_id } = body;
      if (!access_id) return Response.json({ error: 'access_id required' }, { status: 400 });

      const { error } = await sb
        .from('expert_advisor_access')
        .update({ access_status: 'revoked', revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', access_id);

      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ success: true });
    }

    // ── CHECK PERMISSION ──────────────────────────────────────────────────────
    if (action === 'checkPermission') {
      const { client_profile_id, permission_key } = body;
      // ── Phase 6.6 — body identity is not authority, and this action had NO
      // caller gate at all: any authenticated user could probe the permission
      // matrix for an arbitrary (expert, client) pair. The expert side is now the
      // authenticated caller unless an admin is asking about someone else.
      const expert_profile_id = isAdmin ? (body.expert_profile_id || callerProfile?.id) : callerProfile?.id;
      if (!expert_profile_id || !client_profile_id || !permission_key) {
        return Response.json({ allowed: false, error: 'Missing parameters' }, { status: 400 });
      }
      // Baseline permissions are always allowed
      if (BASELINE_PERMISSIONS[permission_key] === true) {
        return Response.json({ allowed: true, baseline: true });
      }
      const { data: row } = await sb
        .from('expert_advisor_access')
        .select('permissions, access_status')
        .eq('expert_profile_id', expert_profile_id)
        .eq('client_profile_id', client_profile_id)
        .eq('access_status', 'active')
        .maybeSingle();
      if (!row) return Response.json({ allowed: false });
      const allowed = row.permissions?.[permission_key] === true;
      return Response.json({ allowed, access_status: row.access_status });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error('[expertAdvisorAccess] Unhandled error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});