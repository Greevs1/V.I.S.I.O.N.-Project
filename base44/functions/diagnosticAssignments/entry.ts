/**
 * diagnosticAssignments — Full diagnostic for assigned resources and worksheets.
 * Returns complete identity and assignment audit for debugging.
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
    const { target_user_email } = body;

    // Resolve target user (admin can specify, otherwise use current user)
    let resolvedEmail = user.email;
    if (target_user_email) {
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        return Response.json({ error: 'Admin access required for target user lookup' }, { status: 403 });
      }
      resolvedEmail = target_user_email;
    }

    // Get Supabase profile
    const { data: profile } = await sb.from('profiles').select('*').eq('email', resolvedEmail).maybeSingle();
    if (!profile) {
      return Response.json({
        error: 'Profile not found',
        resolvedEmail,
        searched: resolvedEmail,
      }, { status: 404 });
    }

    const profileId = profile.id;
    const businessId = profile.primary_business_id;

    // Get Base44 user ID for comparison
    const base44Users = await base44.asServiceRole.entities.User.filter({ email: resolvedEmail });
    const base44UserId = base44Users?.[0]?.id || null;

    // ── RESOURCE ASSIGNMENTS DIAGNOSTIC ─────────────────────────────────────
    let resourceAssignments = [];
    try {
      // Try resource_assignments table first
      const { data: ra } = await sb.from('resource_assignments')
        .select('*')
        .eq('assigned_to_profile_id', profileId)
        .order('created_at', { ascending: false })
        .limit(50);
      resourceAssignments = ra || [];
    } catch (e) {
      console.log('[diagnostic] resource_assignments table may not exist:', e.message);
    }

    // Also check for legacy pointer documents
    let pointerDocs = [];
    try {
      const { data: pd } = await sb.from('documents')
        .select('id, name, file_path, profile_id, business_id, related_entity_type, created_at')
        .eq('storage_bucket', 'consulting_library_files')
        .eq('file_scope', 'consulting_library')
        .eq('related_entity_type', 'assigned_resource')
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false })
        .limit(50);
      pointerDocs = pd || [];
    } catch (e) {
      console.log('[diagnostic] pointer docs query failed:', e.message);
    }

    // ── WORKSHEET ASSIGNMENTS DIAGNOSTIC ─────────────────────────────────────
    let worksheetAssignments = [];
    try {
      // Try worksheet_assignments table first
      const { data: wa } = await sb.from('worksheet_assignments')
        .select('*')
        .eq('assigned_to_profile_id', profileId)
        .order('created_at', { ascending: false })
        .limit(50);
      worksheetAssignments = wa || [];
    } catch (e) {
      console.log('[diagnostic] worksheet_assignments table may not exist:', e.message);
    }

    // Also check Base44 Worksheet entity for assigned_to array
    const allWorksheets = await base44.asServiceRole.entities.Worksheet.list('-created_date', 200);
    const worksheetsWithAssignment = (allWorksheets || []).filter(w => {
      const assignedTo = w.assigned_to || [];
      return assignedTo.includes(profileId) || assignedTo.includes(base44UserId);
    });

    // ── DIAGNOSTIC REPORT ────────────────────────────────────────────────────
    return Response.json({
      identity: {
        resolvedEmail,
        base44UserId,
        supabaseProfileId: profileId,
        businessId,
        isTargetUser: !!target_user_email,
      },
      resource_assignments: {
        count: resourceAssignments.length,
        items: resourceAssignments.map(ra => ({
          assignment_id: ra.id,
          resource_document_id: ra.resource_document_id,
          assigned_to_profile_id: ra.assigned_to_profile_id,
          assigned_to_business_id: ra.assigned_to_business_id,
          assigned_by_profile_id: ra.assigned_by_profile_id,
          created_at: ra.created_at,
          matches_current_user: ra.assigned_to_profile_id === profileId,
        })),
      },
      pointer_documents: {
        count: pointerDocs.length,
        items: pointerDocs.map(pd => ({
          document_id: pd.id,
          name: pd.name,
          profile_id: pd.profile_id,
          business_id: pd.business_id,
          related_entity_type: pd.related_entity_type,
          created_at: pd.created_at,
          matches_current_user: pd.profile_id === profileId,
        })),
      },
      worksheet_assignments_table: {
        count: worksheetAssignments.length,
        items: worksheetAssignments.map(wa => ({
          assignment_id: wa.id,
          worksheet_id: wa.worksheet_id,
          assigned_to_profile_id: wa.assigned_to_profile_id,
          assigned_to_business_id: wa.assigned_to_business_id,
          assigned_by_profile_id: wa.assigned_by_profile_id,
          status: wa.status,
          created_at: wa.created_at,
          matches_current_user: wa.assigned_to_profile_id === profileId,
        })),
      },
      worksheet_entity: {
        total_worksheets: allWorksheets?.length || 0,
        matching_count: worksheetsWithAssignment.length,
        items: worksheetsWithAssignment.map(w => ({
          worksheet_id: w.id,
          title: w.title,
          assigned_to: w.assigned_to || [],
          assigned_to_profile_id: w.assigned_to_profile_id || null,
          assigned_to_business_id: w.assigned_to_business_id || null,
          status: w.status,
          matches_supabase_id: (w.assigned_to || []).includes(profileId),
          matches_base44_id: (w.assigned_to || []).includes(base44UserId),
        })),
      },
      diagnosis: {
        resource_assignment_method: resourceAssignments.length > 0 ? 'resource_assignments_table' : pointerDocs.length > 0 ? 'pointer_documents' : 'none',
        worksheet_assignment_method: worksheetAssignments.length > 0 ? 'worksheet_assignments_table' : worksheetsWithAssignment.length > 0 ? 'worksheet_entity_assigned_to_array' : 'none',
        identity_match: profileId === base44UserId ? 'Base44 and Supabase IDs match (unlikely)' : 'Base44 and Supabase IDs differ (expected)',
        recommendation: [
          resourceAssignments.length === 0 && pointerDocs.length === 0 ? 'No assigned resources found - check assignDocumentToUser function' : 'Resource assignments exist',
          worksheetAssignments.length === 0 && worksheetsWithAssignment.length === 0 ? 'No worksheet assignments found - check AssignWorksheetModal' : 'Worksheet assignments exist',
          profileId ? `Using Supabase profile ID ${profileId} for queries` : 'WARNING: No Supabase profile ID found',
        ],
      },
    });

  } catch (err) {
    console.error('[diagnosticAssignments] error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});