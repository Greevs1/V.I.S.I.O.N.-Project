/**
 * worksheetResponses - Handle worksheet response storage and retrieval
 * Supports draft saving, submission, and admin review
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireBusinessContext } from '../../shared/businessScope/activeBusiness.ts';

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

    // Get current user's profile
    const getProfile = async () => {
      const { data: profile } = await sb.from('profiles').select('*').eq('email', user.email).maybeSingle();
      return profile;
    };

    const profile = await getProfile();
    if (!profile) {
      return Response.json({ error: 'Profile not found' }, { status: 404 });
    }

    const profileId = profile.id;
    // Phase 6.9B — canonical business resolution. Was `profile.primary_business_id`,
    // which silently attributed worksheet responses to the wrong business whenever
    // the account owned more than one.
    const { businessId, denial: bizDenial } = await requireBusinessContext(
      sb, profile, data?.active_business_id, 'worksheetResponses'
    );
    if (bizDenial) return bizDenial;

    // ── ACTIONS ──────────────────────────────────────────────────────────────

    if (action === 'getWorksheetTemplate') {
      const { worksheetId } = data || {};
      if (!worksheetId) return Response.json({ error: 'worksheetId required' }, { status: 400 });

      const worksheet = await base44.asServiceRole.entities.Worksheet.get(worksheetId);
      if (!worksheet) {
        return Response.json({ error: 'Worksheet not found' }, { status: 404 });
      }

      return Response.json({ worksheet });
    }

    if (action === 'getUserResponse' || action === 'getWorksheetResponse') {
      const { assignmentId } = data || {};

      let response = null;
      if (assignmentId) {
        // Primary: look up by assignment ID (avoids UUID cast issue on worksheet_id)
        const { data: byAssignment } = await sb.from('worksheet_responses')
          .select('*')
          .eq('worksheet_assignment_id', assignmentId)
          .maybeSingle();
        response = byAssignment || null;
      } else {
        // Fallback: most recent response for this profile
        const { data: byProfile } = await sb.from('worksheet_responses')
          .select('*')
          .eq('profile_id', profileId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        response = byProfile || null;
      }

      return Response.json({ response });
    }

    if (action === 'getAdminWorksheetResponse') {
      // Admin fetches a specific user's response for a completed worksheet
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        return Response.json({ error: 'Admin access required' }, { status: 403 });
      }

      const { targetProfileId, assignmentId } = data || {};
      if (!targetProfileId) return Response.json({ error: 'targetProfileId required' }, { status: 400 });

      let response = null;
      if (assignmentId) {
        // Preferred: look up by assignment ID directly
        const { data: byAssignment } = await sb.from('worksheet_responses')
          .select('*')
          .eq('worksheet_assignment_id', assignmentId)
          .maybeSingle();
        response = byAssignment || null;
      } else {
        // Fallback: most recent for this profile
        const { data: byProfile } = await sb.from('worksheet_responses')
          .select('*')
          .eq('profile_id', targetProfileId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        response = byProfile || null;
      }
      return Response.json({ response });
    }

    if (action === 'saveDraft' || action === 'saveWorksheetDraft') {
      const { worksheetAssignmentId, responseData } = data || {};
      if (!responseData) {
        return Response.json({ error: 'responseData required' }, { status: 400 });
      }

      const now = new Date().toISOString();
      let result;

      if (worksheetAssignmentId) {
        // worksheet_responses.worksheet_id is UUID NOT NULL; use nil UUID as placeholder.
        const worksheetIdForDb = '00000000-0000-0000-0000-000000000000';

        // Check-then-upsert by worksheet_assignment_id
        const { data: existing } = await sb.from('worksheet_responses')
          .select('id')
          .eq('worksheet_assignment_id', worksheetAssignmentId)
          .maybeSingle();

        if (existing) {
          const { data: updated, error } = await sb.from('worksheet_responses')
            .update({ profile_id: profileId, business_id: businessId || null, response_data: responseData, status: 'draft', updated_at: now })
            .eq('id', existing.id)
            .select().single();
          if (error) throw new Error(error.message);
          result = updated;
        } else {
          const { data: created, error } = await sb.from('worksheet_responses')
            .insert({ worksheet_assignment_id: worksheetAssignmentId, worksheet_id: worksheetIdForDb, profile_id: profileId, business_id: businessId || null, response_data: responseData, status: 'draft', created_at: now, updated_at: now })
            .select().single();
          if (error) throw new Error(error.message);
          result = created;
        }

        // Update assignment to in_progress
        const { error: assignErr } = await sb.from('worksheet_assignments')
          .update({ status: 'in_progress', updated_at: now })
          .eq('id', worksheetAssignmentId);
        if (assignErr) console.warn('[saveDraft] assignment update failed:', assignErr.message);
      } else {
        // No assignment — insert by profile_id only
        const { data: existing } = await sb.from('worksheet_responses')
          .select('id').eq('profile_id', profileId).is('worksheet_assignment_id', null).maybeSingle();
        if (existing) {
          const { data: updated, error } = await sb.from('worksheet_responses')
            .update({ response_data: responseData, status: 'draft', updated_at: now })
            .eq('id', existing.id).select().single();
          if (error) throw new Error(error.message);
          result = updated;
        } else {
          const { data: created, error } = await sb.from('worksheet_responses')
            .insert({ profile_id: profileId, business_id: businessId || null, response_data: responseData, status: 'draft', created_at: now, updated_at: now })
            .select().single();
          if (error) throw new Error(error.message);
          result = created;
        }
      }

      console.log('[saveDraft] success - response_id:', result?.id, 'assignment_id:', worksheetAssignmentId);
      return Response.json({ success: true, response: result, response_status: 'draft', assignment_status: worksheetAssignmentId ? 'in_progress' : null });
    }

    if (action === 'submit' || action === 'submitWorksheetResponse') {
      const { worksheetAssignmentId, responseData } = data || {};
      if (!responseData) {
        return Response.json({ error: 'responseData required' }, { status: 400 });
      }

      const now = new Date().toISOString();
      let result;

      if (worksheetAssignmentId) {
        // worksheet_responses.worksheet_id is UUID NOT NULL, but Base44 worksheet IDs are text.
        // Use nil UUID as placeholder — real linkage is via worksheet_assignment_id.
        const worksheetIdForDb = '00000000-0000-0000-0000-000000000000';

        // Check-then-upsert by worksheet_assignment_id
        const { data: existing } = await sb.from('worksheet_responses')
          .select('id')
          .eq('worksheet_assignment_id', worksheetAssignmentId)
          .maybeSingle();

        if (existing) {
          const { data: updated, error } = await sb.from('worksheet_responses')
            .update({ profile_id: profileId, business_id: businessId || null, response_data: responseData, status: 'completed', submitted_at: now, updated_at: now })
            .eq('id', existing.id)
            .select().single();
          if (error) throw new Error(error.message);
          result = updated;
        } else {
          const { data: created, error } = await sb.from('worksheet_responses')
            .insert({ worksheet_assignment_id: worksheetAssignmentId, worksheet_id: worksheetIdForDb, profile_id: profileId, business_id: businessId || null, response_data: responseData, status: 'completed', submitted_at: now, created_at: now, updated_at: now })
            .select().single();
          if (error) throw new Error(error.message);
          result = created;
        }

        // Update worksheet_assignments to completed
        const { error: assignmentErr } = await sb.from('worksheet_assignments')
          .update({ status: 'completed', completed_at: now, updated_at: now })
          .eq('id', worksheetAssignmentId);

        console.log('[submit] assignment update:', worksheetAssignmentId, assignmentErr ? 'FAILED: ' + assignmentErr.message : 'success');

        if (assignmentErr) {
          return Response.json({
            error: 'Response saved but assignment status update failed: ' + assignmentErr.message,
            response_status: 'completed',
            assignment_status: 'update_failed',
          }, { status: 500 });
        }
      } else {
        // No assignment — insert by profile_id
        const { data: existing } = await sb.from('worksheet_responses')
          .select('id').eq('profile_id', profileId).is('worksheet_assignment_id', null).maybeSingle();
        if (existing) {
          const { data: updated, error } = await sb.from('worksheet_responses').update({ response_data: responseData, status: 'completed', submitted_at: now, updated_at: now }).eq('id', existing.id).select().single();
          if (error) throw new Error(error.message);
          result = updated;
        } else {
          const { data: created, error } = await sb.from('worksheet_responses').insert({ profile_id: profileId, business_id: businessId || null, response_data: responseData, status: 'completed', submitted_at: now, created_at: now, updated_at: now }).select().single();
          if (error) throw new Error(error.message);
          result = created;
        }
      }

      console.log('[submit] success - response_id:', result?.id, 'assignment_id:', worksheetAssignmentId);

      // Fire notification (non-fatal)
      try {
        if (worksheetAssignmentId) {
          const { data: assignment } = await sb.from('worksheet_assignments').select('assigned_by_profile_id').eq('id', worksheetAssignmentId).maybeSingle();
          if (assignment?.assigned_by_profile_id) {
            const { data: assignerProfile } = await sb.from('profiles').select('email').eq('id', assignment.assigned_by_profile_id).maybeSingle();
            if (assignerProfile?.email) {
              const adminUsers = await base44.asServiceRole.entities.User.filter({ email: assignerProfile.email });
              const adminUser = adminUsers?.[0];
              if (adminUser) {
                const worksheet = await base44.asServiceRole.entities.Worksheet.get(worksheetId).catch(() => null);
                await base44.asServiceRole.entities.Notification.create({
                  recipient_id: adminUser.id,
                  recipient_profile_id: assignment.assigned_by_profile_id,
                  notification_type: 'sprint_task_completed',
                  notification_category: 'success',
                  title: 'Worksheet Completed',
                  message: `${profile.full_name || profile.email} completed "${worksheet?.title || 'a worksheet'}"`,
                  related_entity_type: 'worksheet',
                  related_entity_id: worksheetId,
                  priority: 'medium',
                });
              }
            }
          }
        }
      } catch (notifErr) {
        console.error('[submit] Notification failed (non-fatal):', notifErr.message);
      }

      return Response.json({
        success: true,
        response: result,
        response_status: 'completed',
        assignment_status: 'completed',
      });
    }

    if (action === 'getAdminWorksheetResponses') {
      // Admin action to view user responses
      const { worksheetId, userId } = data || {};
      
      // Check admin role
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        return Response.json({ error: 'Admin access required' }, { status: 403 });
      }

      // Get target user's profile
      const { data: targetProfile } = await sb.from('profiles')
        .select('*')
        .eq('email', userId)
        .maybeSingle();

      if (!targetProfile) {
        return Response.json({ error: 'User profile not found' }, { status: 404 });
      }

      const { data: responses } = await sb.from('worksheet_responses')
        .select('*')
        .eq('profile_id', targetProfile.id)
        .eq('worksheet_id', worksheetId || null)
        .order('submitted_at', { ascending: false });

      return Response.json({ responses: responses || [] });
    }

    if (action === 'getResourceSignedUrl') {
      // Handle resource download with proper bucket lookup + access verification
      const { resourceId } = data || {};
      if (!resourceId) return Response.json({ error: 'resourceId required' }, { status: 400 });

      // Get resource document
      const { data: doc } = await sb.from('documents')
        .select('id, file_path, storage_bucket, file_scope, profile_id, business_id')
        .eq('id', resourceId)
        .maybeSingle();

      if (!doc) {
        return Response.json({ error: 'Resource not found' }, { status: 404 });
      }

      // ── Access control ────────────────────────────────────────────────────
      const profileRole = profile.app_role || user.role || 'owner';
      const isAdmin = ['admin', 'super_admin'].includes(profileRole);

      if (!isAdmin) {
        // Check ownership (client document on their profile/business)
        const ownsDoc = doc.profile_id === profileId || (doc.business_id && doc.business_id === businessId);

        // Check assignment: is this resource explicitly assigned to this user?
        let isAssigned = false;
        if (!ownsDoc) {
          const { data: assignment } = await sb.from('resource_assignments')
            .select('id')
            .eq('profile_id', profileId)
            .eq('resource_document_id', resourceId)
            .or('status.is.null,status.neq.cancelled')
            .maybeSingle();
          isAssigned = !!assignment;
        }

        // Check advisor assignment
        let isAdvisorAssigned = false;
        if (!ownsDoc && !isAssigned && profileRole === 'advisor' && doc.business_id) {
          const { data: advisorAssignment } = await sb.from('advisor_assignments')
            .select('id')
            .eq('advisor_profile_id', profileId)
            .eq('business_id', doc.business_id)
            .maybeSingle();
          isAdvisorAssigned = !!advisorAssignment;
        }

        if (!ownsDoc && !isAssigned && !isAdvisorAssigned) {
          console.warn(`[getResourceSignedUrl] FORBIDDEN: profile ${profileId} attempted access to resource ${resourceId}`);
          return Response.json({ error: 'Forbidden: you do not have access to this resource' }, { status: 403 });
        }
      }

      if (!doc.file_path) {
        return Response.json({ error: 'Resource has no file path' }, { status: 400 });
      }

      // Generate signed URL using actual bucket
      const bucket = doc.storage_bucket || 'consulting_library_files';
      const { data: signedData, error } = await sb.storage
        .from(bucket)
        .createSignedUrl(doc.file_path, 900); // 15 minutes

      if (error) {
        console.error('[getResourceSignedUrl] Signed URL error:', error);
        return Response.json({ error: 'Failed to generate download link' }, { status: 500 });
      }

      return Response.json({ signedUrl: signedData.signedUrl });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });

  } catch (err) {
    console.error('[worksheetResponses] Error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});