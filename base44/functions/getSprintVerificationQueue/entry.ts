/**
 * getSprintVerificationQueue
 * Returns sprints from Supabase ninety_day_sprint_paths for admin/expert verification queues.
 * Modes:
 *   - admin: all sprints needing review or recently verified
 *   - expert: only sprints assigned to the calling user's profile_id
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { mode = 'admin' } = body; // 'admin' | 'expert'

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const supabase = createClient(
      SUPABASE_URL,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Get calling user's profile_id
    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('id, app_role')
      .eq('email', user.email)
      .maybeSingle();

    const callerProfileId = callerProfile?.id;
    const isAdmin = user.role === 'admin' || user.role === 'super_admin' || callerProfile?.app_role === 'super_admin' || callerProfile?.app_role === 'admin';

    // Detect available columns first
    const { data: sampleRow } = await supabase
      .from('ninety_day_sprint_paths')
      .select('*')
      .limit(1)
      .maybeSingle();

    const hasVerificationCols = sampleRow && 'verification_status' in sampleRow;
    const hasAssignedVerifierCols = sampleRow && 'assigned_verifier_profile_id' in sampleRow;

    const selectCols = hasVerificationCols
      ? '*'
      : 'id, profile_id, business_id, path_title, path_goal, galileo_confidence, status, is_active, progress_percent, created_at, updated_at, industry_context, generated_context, path_key';

    let query = supabase
      .from('ninety_day_sprint_paths')
      .select(selectCols)
      .order('created_at', { ascending: false })
      .limit(200);

    if (mode === 'expert') {
      // Only sprints assigned to this advisor
      if (!callerProfileId) return Response.json({ sprints: [] });
      if (hasAssignedVerifierCols) {
        query = query.eq('assigned_verifier_profile_id', callerProfileId);
      } else {
        // Fallback: filter from generated_context JSON
        query = query.not('generated_context', 'is', null);
      }
    } else {
      // Admin: all sprints (pending + recent verified)
      if (!isAdmin) return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { data: rows, error } = await query;
    if (error) {
      console.error('[getSprintVerificationQueue] query error:', error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }

    // Enrich with business/client name from profiles + businesses if missing
    const profileIds = [...new Set((rows || []).map(r => r.profile_id).filter(Boolean))];
    let profileMap = {};
    if (profileIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', profileIds);
      (profiles || []).forEach(p => { profileMap[p.id] = p; });
    }

    const businessIds = [...new Set((rows || []).map(r => r.business_id).filter(Boolean))];
    let businessMap = {};
    if (businessIds.length > 0) {
      const { data: businesses } = await supabase
        .from('businesses')
        .select('id, name')
        .in('id', businessIds);
      (businesses || []).forEach(b => { businessMap[b.id] = b; });
    }

    const sprints = (rows || []).map(r => {
      // Parse fallback verifier data from generated_context if native columns missing
      let contextData = {};
      if (!('verification_status' in r) && r.generated_context) {
        try { contextData = JSON.parse(r.generated_context); } catch {}
      }

      return {
        ...r,
        client_name: r.client_name || profileMap[r.profile_id]?.full_name || '—',
        client_email: profileMap[r.profile_id]?.email || null,
        business_name: r.business_name || businessMap[r.business_id]?.name || '—',
        // Merge fallback context data
        verification_status: r.verification_status || contextData.verification_status || 'galileo_verified_pending_expert',
        needs_expert_review: r.needs_expert_review ?? contextData.needs_expert_review ?? true,
        assigned_verifier_profile_id: r.assigned_verifier_profile_id || contextData.assigned_verifier_profile_id || null,
        assigned_verifier_name: r.assigned_verifier_name || contextData.assigned_verifier_name || null,
        assigned_verifier_email: r.assigned_verifier_email || contextData.assigned_verifier_email || null,
        assigned_verifier_role: r.assigned_verifier_role || contextData.assigned_verifier_role || null,
        verification_assignment_status: r.verification_assignment_status || contextData.verification_assignment_status || 'unassigned',
        review_requested_at: r.review_requested_at || r.created_at || null,
        _columns_migrated: 'verification_status' in r,
      };
    });

    return Response.json({ sprints });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});