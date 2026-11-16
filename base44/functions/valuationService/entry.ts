/**
 * valuationService — Phase 13 Business Valuation backend service.
 * Redeploy trigger v2.
 *
 * All 17 approved actions. Server-mediated sensitive transitions.
 * Snapshot construction is server-side (publishValuation).
 *
 * Actions:
 *   createValuation, updateValuationStatus, assignValuationAdvisor,
 *   updateValuationAssignment, removeValuationAdvisor, saveValuationAnswer,
 *   saveValuationFinancial, saveValuationAdjustment, saveValuationMultipleFactor,
 *   saveValuationScenario, publishValuation, shareValuation, revokeClientAccess,
 *   getSharedClientSummary, archiveValuation, restoreArchivedValuation,
 *   appendValuationAuditEvent, getValuation, getValuationSummary, getDataReadiness,
 *   getValuationVersions, getValuationAuditLog, getValuationAssignments
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { computeVersionDelta } from '../../shared/valuationEngine/deltaEngine.ts';
import { buildIntelligence, decidePrefill } from '../../shared/valuationEngine/intelligenceEngine.ts';
import { loadAssessmentResults, loadBusinessAssessmentSummaries } from '../../shared/intelligenceContract/assessmentLoader.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!rawUrl || !SERVICE_KEY) {
      return Response.json({ error: 'Supabase not configured' }, { status: 500 });
    }
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    // Valuation tables live in the dedicated `valuation` schema, not `public`.
    // All valuation queries must use the schema-scoped client.
    const vsb = sb.schema('valuation');

    const body = await req.json().catch(() => ({}));
    const { action, data = {} } = body;

    // ════════════════════════════════════════════════════════════════════════
    // CENTRALIZED IDENTITY RESOLVER
    // Base44 Auth is authoritative. Supabase Auth is not used for app users.
    // profiles.auth_user_id is null for all current profiles.
    // Identity: base44.auth.me() → base44_user_id (preferred) or normalized
    // email → profiles.id. Never accept a profile ID from the frontend.
    // ════════════════════════════════════════════════════════════════════════
    const resolveCurrentProfile = async () => {
      let profileRow = null;

      // 1. Prefer base44_user_id when populated
      if (user.id) {
        const { data: byB44, error: b44Err } = await sb
          .from('profiles')
          .select('id, app_role, email, primary_business_id, base44_user_id, first_name, last_name')
          .eq('base44_user_id', user.id)
          .maybeSingle();
        if (b44Err) throw new Error(b44Err.message);
        if (byB44) profileRow = byB44;
      }

      // 2. Fall back to normalized case-insensitive email
      if (!profileRow && user.email) {
        const normalizedEmail = user.email.toLowerCase().trim();
        const { data: byEmail, error: emailErr } = await sb
          .from('profiles')
          .select('id, app_role, email, primary_business_id, base44_user_id, first_name, last_name')
          .ilike('email', normalizedEmail);
        if (emailErr) throw new Error(emailErr.message);
        if (byEmail.length > 1) {
          throw Object.assign(new Error('AMBIGUOUS_PROFILE_MATCH'), { status: 403 });
        }
        if (byEmail.length === 1) profileRow = byEmail[0];
      }

      // 3. Reject missing profile
      if (!profileRow) {
        throw Object.assign(new Error('PROFILE_NOT_FOUND'), { status: 403 });
      }

      return profileRow;
    };

    const profile = await resolveCurrentProfile();
    const profileId = profile.id;
    const isSuperAdmin = profile.app_role === 'super_admin';

    // ════════════════════════════════════════════════════════════════════════
    // AUTHORIZATION HELPERS
    // Service-role bypasses RLS; every action must explicitly authorize.
    // Business ownership grants discovery + shared-summary access only.
    // Internal valuation access requires explicit valuation_assignments.
    // ════════════════════════════════════════════════════════════════════════
    const requireSuperAdmin = (p) => {
      if (p.app_role !== 'super_admin') {
        throw Object.assign(new Error('PERMISSION_DENIED'), { status: 403 });
      }
      return true;
    };

    // Business-level access: owner, assigned advisor, or super_admin
    const requireBusinessAccess = async (p, businessId) => {
      if (p.app_role === 'super_admin') return true;
      const { data: bo } = await sb
        .from('business_owners')
        .select('business_id')
        .eq('business_id', businessId)
        .eq('profile_id', p.id)
        .maybeSingle();
      if (bo) return true;
      const { data: be } = await sb
        .from('business_entities')
        .select('id')
        .eq('id', businessId)
        .eq('assigned_advisor_id', p.id)
        .maybeSingle();
      if (be) return true;
      if (p.primary_business_id === businessId) return true;
      return false;
    };

    // Load valuation + assignment, confirm business scope exists
    const loadValuationContext = async (valuationId) => {
      const { data: val, error: valErr } = await vsb.from('business_valuations')
        .select('id, business_id, status, client_sharing_status')
        .eq('id', valuationId)
        .maybeSingle();
      if (valErr) throw new Error(valErr.message);
      if (!val) {
        throw Object.assign(new Error('VALUATION_NOT_FOUND'), { status: 404 });
      }
      const { data: asg, error: asgErr } = await vsb
        .from('valuation_assignments')
        .select('can_view, can_edit, can_review, can_publish, can_create_valuation, can_restore_valuation, can_archive_valuation, can_manage_assignments, assignment_role')
        .eq('valuation_id', valuationId)
        .eq('assigned_profile_id', profileId)
        .is('removed_at', null)
        .maybeSingle();
      if (asgErr) throw new Error(asgErr.message);
      return { valuation: val, assignment: asg || null };
    };

    // Valuation-level: explicit assignment required; business ownership alone
    // does NOT grant internal valuation access.
    const requireValuationView = async (p, valuationId) => {
      const ctx = await loadValuationContext(valuationId);
      if (p.app_role === 'super_admin') return ctx;
      if (!ctx.assignment || !ctx.assignment.can_view) {
        throw Object.assign(new Error('PERMISSION_DENIED'), { status: 403 });
      }
      return ctx;
    };

    const requireValuationEdit = async (p, valuationId) => {
      const ctx = await loadValuationContext(valuationId);
      if (p.app_role === 'super_admin') return ctx;
      if (ctx.valuation.status === 'archived') {
        throw Object.assign(new Error('VALUATION_ARCHIVED'), { status: 400 });
      }
      if (!ctx.assignment || !ctx.assignment.can_edit) {
        throw Object.assign(new Error('PERMISSION_DENIED'), { status: 403 });
      }
      return ctx;
    };

    const requireValuationReview = async (p, valuationId) => {
      const ctx = await loadValuationContext(valuationId);
      if (p.app_role === 'super_admin') return ctx;
      if (!ctx.assignment || !ctx.assignment.can_review) {
        throw Object.assign(new Error('PERMISSION_DENIED'), { status: 403 });
      }
      return ctx;
    };

    const requireValuationPublish = async (p, valuationId) => {
      const ctx = await loadValuationContext(valuationId);
      if (p.app_role === 'super_admin') return ctx;
      if (!ctx.assignment || !ctx.assignment.can_publish) {
        throw Object.assign(new Error('PERMISSION_DENIED'), { status: 403 });
      }
      return ctx;
    };

    // ── Phase 13.3G.2: Lifecycle + assignment management helpers ──────────
    // These extend the existing assignment model. Super admins always pass.
    // Otherwise the specific permission flag on the active assignment is required.
    const requireValuationCreate = async (p, businessId) => {
      if (p.app_role === 'super_admin') return true;
      const hasBusiness = await requireBusinessAccess(p, businessId);
      if (!hasBusiness) throw Object.assign(new Error('BUSINESS_ACCESS_DENIED'), { status: 403 });
      // First valuation for this business — any advisor with business access may create
      const { data: existing } = await vsb.from('business_valuations')
        .select('id').eq('business_id', businessId)
        .neq('status', 'archived').limit(1).maybeSingle();
      if (!existing) return true;
      // Existing valuation — require can_create_valuation on active assignment
      const { data: asg } = await vsb.from('valuation_assignments')
        .select('can_create_valuation')
        .eq('valuation_id', existing.id)
        .eq('assigned_profile_id', p.id)
        .is('removed_at', null).maybeSingle();
      if (!asg || !asg.can_create_valuation) {
        throw Object.assign(new Error('PERMISSION_DENIED'), { status: 403 });
      }
      return true;
    };

    const requireValuationRestore = async (p, valuationId) => {
      const ctx = await loadValuationContext(valuationId);
      if (p.app_role === 'super_admin') return ctx;
      if (!ctx.assignment || !ctx.assignment.can_restore_valuation) {
        throw Object.assign(new Error('PERMISSION_DENIED'), { status: 403 });
      }
      return ctx;
    };

    const requireValuationArchive = async (p, valuationId) => {
      const ctx = await loadValuationContext(valuationId);
      if (p.app_role === 'super_admin') return ctx;
      if (!ctx.assignment || !ctx.assignment.can_archive_valuation) {
        throw Object.assign(new Error('PERMISSION_DENIED'), { status: 403 });
      }
      return ctx;
    };

    const requireAssignmentManagement = async (p, valuationId) => {
      const ctx = await loadValuationContext(valuationId);
      if (p.app_role === 'super_admin') return ctx;
      if (!ctx.assignment || !ctx.assignment.can_manage_assignments) {
        throw Object.assign(new Error('PERMISSION_DENIED'), { status: 403 });
      }
      return ctx;
    };

    // Simple assignment lookup (for response payloads, not authorization)
    const getAssignment = async (valuationId) => {
      const { data: asg, error: asgErr } = await vsb
        .from('valuation_assignments')
        .select('can_view, can_edit, can_review, can_publish, can_create_valuation, can_restore_valuation, can_archive_valuation, can_manage_assignments, assignment_role')
        .eq('valuation_id', valuationId)
        .eq('assigned_profile_id', profileId)
        .is('removed_at', null)
        .maybeSingle();
      if (asgErr) throw new Error(asgErr.message);
      return asg || null;
    };

    // ── Helper: append audit (actor always derived from profileId) ─────────
    const appendAudit = async (valuationId, actionType, oldVal, newVal, meta) => {
      await vsb.from('valuation_audit_log').insert({
        valuation_id: valuationId,
        actor_profile_id: profileId,
        action: actionType,
        action_details: { old: oldVal || null, new: newVal || null, meta: meta || null },
      });
    };

    // ── Status transition validation ───────────────────────────────────────
    const VALID_STATUSES = ['not_started', 'in_progress', 'needs_review', 'advisor_approved', 'published', 'archived'];
    const VALID_TRANSITIONS = {
      not_started: ['in_progress'],
      in_progress: ['needs_review'],
      needs_review: ['advisor_approved', 'in_progress'],
      advisor_approved: ['needs_review'], // published via publishValuation only
      published: [], // archived via archiveValuation only
      archived: [], // restore via restoreArchivedValuation only
    };

    const validateStatusTransition = (currentStatus, newStatus) => {
      if (!VALID_STATUSES.includes(newStatus)) {
        throw Object.assign(new Error(`INVALID_STATUS: ${newStatus}`), { status: 400 });
      }
      if (currentStatus === newStatus) return true;
      const allowed = VALID_TRANSITIONS[currentStatus] || [];
      if (!allowed.includes(newStatus)) {
        throw Object.assign(new Error(`INVALID_TRANSITION: ${currentStatus} → ${newStatus}`), { status: 400 });
      }
      return true;
    };

    // ════════════════════════════════════════════════════════════════════════
    // CREATE VALUATION
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'createValuation') {
      const { business_id, lead_advisor_profile_id,
              valuation_name, valuation_type, is_primary, engagement_date,
              valuation_purpose, standard_of_value, valuation_premise, valuation_date,
              reuse_verified_data } = data;
      if (!business_id) return Response.json({ error: 'business_id required' }, { status: 400 });

      // Phase 13.3G.2: Use lifecycle-aware create permission
      try { await requireValuationCreate(profile, business_id); }
      catch (e) { return Response.json({ error: e.message }, { status: e.status || 403 }); }

      // Verify business exists
      const { data: biz } = await sb
        .from('business_entities').select('id, business_name')
        .eq('id', business_id).maybeSingle();
      if (!biz) return Response.json({ error: 'BUSINESS_NOT_FOUND' }, { status: 404 });

      const { data: val, error } = await vsb.from('business_valuations').insert({
        business_id,
        lead_advisor_profile_id: lead_advisor_profile_id || null,
        valuation_name: valuation_name || 'Enterprise Value Analysis',
        valuation_type: valuation_type || 'initial',
        is_primary: is_primary !== undefined ? is_primary : true,
        engagement_date: engagement_date || new Date().toISOString().split('T')[0],
        valuation_purpose: valuation_purpose || null,
        standard_of_value: standard_of_value || null,
        valuation_premise: valuation_premise || null,
        valuation_date: valuation_date || null,
        status: 'not_started',
        client_sharing_status: 'not_shared',
        created_by_profile_id: profileId,
        updated_by_profile_id: profileId,
      }).select().single();
      if (error) throw new Error(error.message);

      // Phase 13.3G.2: Create lead assignment with full lifecycle permissions
      // If lead_advisor_profile_id is specified, assign that advisor as lead.
      // Otherwise, if the creator is an advisor, auto-assign creator as lead.
      const leadId = lead_advisor_profile_id || (!isSuperAdmin && profile.app_role === 'advisor' ? profileId : null);
      if (leadId) {
        await vsb.from('valuation_assignments').insert({
          valuation_id: val.id,
          assigned_profile_id: leadId,
          assignment_role: 'lead',
          can_view: true, can_edit: true, can_review: true, can_publish: true,
          can_create_valuation: true, can_restore_valuation: true,
          can_archive_valuation: true, can_manage_assignments: true,
          assigned_by_profile_id: profileId,
        });
        // Update valuation with lead advisor if not already set
        if (!lead_advisor_profile_id) {
          await vsb.from('business_valuations')
            .update({ lead_advisor_profile_id: leadId }).eq('id', val.id);
        }
      }

      await appendAudit(val.id, 'created', null, { business_id, status: 'not_started', reuse_verified_data: !!reuse_verified_data }, null);
      return Response.json({ valuation: val });
    }

    // ════════════════════════════════════════════════════════════════════════
    // UPDATE VALUATION (engagement config, purpose, standard, etc.)
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'updateValuation') {
      const { valuation_id, ...updates } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationEdit(profile, valuation_id);

      // Whitelist allowed fields
      const allowed = [
        'valuation_name', 'valuation_type', 'is_primary', 'engagement_date',
        'valuation_purpose', 'standard_of_value', 'valuation_premise', 'valuation_date',
        'description', 'lead_advisor_profile_id', 'status',
      ];
      const cleanUpdates = {};
      for (const key of allowed) {
        if (key in updates) cleanUpdates[key] = updates[key];
      }
      cleanUpdates.updated_by_profile_id = profileId;

      const { data: updated, error } = await vsb.from('business_valuations')
        .update(cleanUpdates).eq('id', valuation_id).select().single();
      if (error) throw new Error(error.message);

      await appendAudit(valuation_id, 'updated', null, cleanUpdates, null);
      return Response.json({ valuation: updated });
    }

    // ════════════════════════════════════════════════════════════════════════
    // UPDATE VALUATION STATUS
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'updateValuationStatus') {
      const { valuation_id, new_status } = data;
      if (!valuation_id || !new_status) {
        return Response.json({ error: 'valuation_id and new_status required' }, { status: 400 });
      }
      const ctx = await requireValuationEdit(profile, valuation_id);

      if (ctx.valuation.status === 'archived') {
        return Response.json({ error: 'VALUATION_ARCHIVED' }, { status: 400 });
      }
      validateStatusTransition(ctx.valuation.status, new_status);

      const { data: updated, error } = await vsb.from('business_valuations')
        .update({ status: new_status, updated_by_profile_id: profileId })
        .eq('id', valuation_id).select().single();
      if (error) throw new Error(error.message);

      await appendAudit(valuation_id, 'status_changed', { status: ctx.valuation.status }, { status: new_status }, null);
      return Response.json({ valuation: updated });
    }

    // ════════════════════════════════════════════════════════════════════════
    // ASSIGN VALUATION ADVISOR
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'assignValuationAdvisor') {
      try { await requireAssignmentManagement(profile, data.valuation_id); }
      catch (e) { return Response.json({ error: e.message }, { status: e.status || 403 }); }
      const { valuation_id, advisor_profile_id: assigned_profile_id, assignment_role,
              can_view, can_edit, can_review, can_publish,
              can_create_valuation, can_restore_valuation, can_archive_valuation, can_manage_assignments } = data;
      if (!valuation_id || !assigned_profile_id) {
        return Response.json({ error: 'valuation_id and advisor_profile_id required' }, { status: 400 });
      }

      // Verify advisor exists in profiles
      const { data: advisor } = await sb.from('profiles')
        .select('id, app_role').eq('id', assigned_profile_id).maybeSingle();
      if (!advisor) return Response.json({ error: 'ADVISOR_PROFILE_NOT_FOUND' }, { status: 404 });

      // Check for existing active assignment
      const { data: existing } = await vsb.from('valuation_assignments')
        .select('id').eq('valuation_id', valuation_id)
        .eq('assigned_profile_id', assigned_profile_id)
        .is('removed_at', null).maybeSingle();
      if (existing) return Response.json({ error: 'DUPLICATE_ACTIVE_ASSIGNMENT' }, { status: 409 });

      const { data: asg, error } = await vsb.from('valuation_assignments').insert({
        valuation_id,
        assigned_profile_id,
        assignment_role: assignment_role || 'contributor',
        can_view: can_view !== false,
        can_edit: !!can_edit,
        can_review: !!can_review,
        can_publish: !!can_publish,
        can_create_valuation: !!can_create_valuation,
        can_restore_valuation: !!can_restore_valuation,
        can_archive_valuation: !!can_archive_valuation,
        can_manage_assignments: !!can_manage_assignments,
        assigned_by_profile_id: profileId,
      }).select().single();
      if (error) throw new Error(error.message);

      await appendAudit(valuation_id, 'assigned', null, { assigned_profile_id, assignment_role }, null);
      return Response.json({ assignment: asg });
    }

    // ════════════════════════════════════════════════════════════════════════
    // UPDATE VALUATION ASSIGNMENT
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'updateValuationAssignment') {
      const { assignment_id } = data;
      if (!assignment_id) return Response.json({ error: 'assignment_id required' }, { status: 400 });
      try {
        const { data: asg0 } = await vsb.from('valuation_assignments')
          .select('valuation_id').eq('id', assignment_id).maybeSingle();
        if (!asg0) return Response.json({ error: 'ASSIGNMENT_NOT_FOUND' }, { status: 404 });
        await requireAssignmentManagement(profile, asg0.valuation_id);
      } catch (e) { return Response.json({ error: e.message }, { status: e.status || 403 }); }
      const { can_view, can_edit, can_review, can_publish,
              can_create_valuation, can_restore_valuation, can_archive_valuation, can_manage_assignments,
              assignment_role } = data;

      const { data: asg } = await vsb.from('valuation_assignments')
        .select('id, removed_at, valuation_id').eq('id', assignment_id).maybeSingle();
      if (!asg) return Response.json({ error: 'ASSIGNMENT_NOT_FOUND' }, { status: 404 });
      if (asg.removed_at) return Response.json({ error: 'ASSIGNMENT_INACTIVE' }, { status: 400 });

      const updates = { updated_at: new Date().toISOString() };
      if (can_view !== undefined) updates.can_view = can_view;
      if (can_edit !== undefined) updates.can_edit = can_edit;
      if (can_review !== undefined) updates.can_review = can_review;
      if (can_publish !== undefined) updates.can_publish = can_publish;
      if (can_create_valuation !== undefined) updates.can_create_valuation = can_create_valuation;
      if (can_restore_valuation !== undefined) updates.can_restore_valuation = can_restore_valuation;
      if (can_archive_valuation !== undefined) updates.can_archive_valuation = can_archive_valuation;
      if (can_manage_assignments !== undefined) updates.can_manage_assignments = can_manage_assignments;
      if (assignment_role) updates.assignment_role = assignment_role;

      const { data: updated, error } = await vsb.from('valuation_assignments')
        .update(updates).eq('id', assignment_id).select().single();
      if (error) throw new Error(error.message);

      await appendAudit(asg.valuation_id, 'updated', null, updates, { assignment_id });
      return Response.json({ assignment: updated });
    }

    // ════════════════════════════════════════════════════════════════════════
    // REMOVE VALUATION ADVISOR
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'removeValuationAdvisor') {
      const { assignment_id } = data;
      if (!assignment_id) return Response.json({ error: 'assignment_id required' }, { status: 400 });
      try {
        const { data: asg0 } = await vsb.from('valuation_assignments')
          .select('valuation_id').eq('id', assignment_id).maybeSingle();
        if (!asg0) return Response.json({ error: 'ASSIGNMENT_NOT_FOUND' }, { status: 404 });
        await requireAssignmentManagement(profile, asg0.valuation_id);
      } catch (e) { return Response.json({ error: e.message }, { status: e.status || 403 }); }

      const { data: asg } = await vsb.from('valuation_assignments')
        .select('id, removed_at, valuation_id, assigned_profile_id').eq('id', assignment_id).maybeSingle();
      if (!asg) return Response.json({ error: 'ASSIGNMENT_NOT_FOUND' }, { status: 404 });
      if (asg.removed_at) return Response.json({ error: 'ALREADY_REMOVED' }, { status: 400 });

      const { data: updated, error } = await vsb.from('valuation_assignments')
        .update({
          removed_at: new Date().toISOString(),
          can_view: false, can_edit: false, can_review: false, can_publish: false,
          can_create_valuation: false, can_restore_valuation: false, can_archive_valuation: false, can_manage_assignments: false,
          updated_at: new Date().toISOString(),
        }).eq('id', assignment_id).select().single();
      if (error) throw new Error(error.message);

      await appendAudit(asg.valuation_id, 'unassigned', { assigned_profile_id: asg.assigned_profile_id }, null, { assignment_id });
      return Response.json({ assignment: updated });
    }

    // ════════════════════════════════════════════════════════════════════════
    // SAVE VALUATION ANSWER
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'saveValuationAnswer') {
      const { valuation_id, question_id, answer_value, document_ref_id, section_key, answer_source } = data;
      if (!valuation_id || !question_id) {
        return Response.json({ error: 'valuation_id and question_id required' }, { status: 400 });
      }
      await requireValuationEdit(profile, valuation_id);

      // Validate answer type
      const { data: q } = await vsb.from('valuation_questions')
        .select('answer_type, options').eq('id', question_id).maybeSingle();
      if (!q) return Response.json({ error: 'QUESTION_NOT_FOUND' }, { status: 404 });

      // Document reference validation
      if (q.answer_type === 'document_ref' && document_ref_id) {
        const { data: val } = await vsb.from('business_valuations')
          .select('business_id').eq('id', valuation_id).maybeSingle();
        if (val) {
          const { data: doc } = await sb.from('documents')
            .select('id, business_id').eq('id', document_ref_id).maybeSingle();
          if (!doc || doc.business_id !== val.business_id) {
            return Response.json({ error: 'DOCUMENT_NOT_AUTHORIZED' }, { status: 400 });
          }
        }
      }

      // Upsert answer (unique valuation_id + question_id)
      const { data: existing } = await vsb.from('valuation_answers')
        .select('id').eq('valuation_id', valuation_id).eq('question_id', question_id).maybeSingle();

      const answerSourceType = answer_source || 'advisor_entry';
      let answerRow;
      if (existing) {
        const { data: updated, error } = await vsb.from('valuation_answers')
          .update({
            answer_value,
            source_type: answerSourceType,
            answered_by_profile_id: profileId,
            answered_at: new Date().toISOString(),
          }).eq('id', existing.id).select().single();
        if (error) throw new Error(error.message);
        answerRow = updated;
      } else {
        const { data: created, error } = await vsb.from('valuation_answers').insert({
          valuation_id, question_id, answer_value,
          answer_type: q.answer_type,
          source_type: answerSourceType,
          answered_by_profile_id: profileId,
        }).select().single();
        if (error) throw new Error(error.message);
        answerRow = created;
      }

      await appendAudit(valuation_id, 'answer_saved', null, { question_id }, { answer_id: answerRow.id });

      // ── Phase 13.3D: Trigger staleness for questionnaire answer change ────
      // Answer changes affect confidence, scenarios, conclusions (relevance-dependent)
      const ANSWER_STALENESS_TYPES = ['confidence', 'scenario'];
      for (const dbType of ANSWER_STALENESS_TYPES) {
        await vsb.from('valuation_calculations')
          .update({ is_stale: true, stale_reason: 'answer_changed', stale_source_type: 'valuation_answers', stale_source_id: answerRow.id, stale_marked_at: new Date().toISOString(), stale_marked_by_profile_id: profileId })
          .eq('valuation_id', valuation_id).eq('calculation_type', dbType);
      }
      await vsb.from('valuation_conclusions')
        .update({ advisor_approved: false, override_rationale: 'answer_changed' })
        .eq('valuation_id', valuation_id);

      return Response.json({ answer: answerRow });
    }

    // ════════════════════════════════════════════════════════════════════════
    // SAVE VALUATION FINANCIAL
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'saveValuationFinancial') {
      const { valuation_id, period_type, period_start_date, period_end_date, period_label, fiscal_year, ...financials } = data;
      if (!valuation_id || !period_type || !period_start_date || !period_end_date) {
        return Response.json({ error: 'valuation_id, period_type, period_start_date, period_end_date required' }, { status: 400 });
      }
      await requireValuationEdit(profile, valuation_id);

      const { data: existing } = await vsb.from('valuation_financials')
        .select('id').eq('valuation_id', valuation_id)
        .eq('period_start_date', period_start_date).eq('period_end_date', period_end_date)
        .eq('period_type', period_type).maybeSingle();

      let finRow;
      const payload = {
        valuation_id, period_type, period_start_date, period_end_date,
        period_label: period_label || `${period_type} ${period_start_date} to ${period_end_date}`,
        fiscal_year,
        ...financials,
      };
      if (existing) {
        const { data: updated, error } = await vsb.from('valuation_financials')
          .update(payload).eq('id', existing.id).select().single();
        if (error) throw new Error(error.message);
        finRow = updated;
      } else {
        const { data: created, error } = await vsb.from('valuation_financials').insert(payload).select().single();
        if (error) throw new Error(error.message);
        finRow = created;
      }

      await appendAudit(valuation_id, 'financial_saved', null, { period_type, period_start_date, period_end_date }, { financial_id: finRow.id });

      // ── Phase 13.3D: Trigger staleness for financial period change ──────
      // Equity bridge uses calculation_type='reconciliation', methodology='equity_bridge'
      // so it must be handled separately from the loop.
      const STALENESS_CALC_TYPES = ['normalized_earnings', 'ebitda_multiple', 'sde_multiple', 'revenue_multiple', 'capitalization_of_earnings', 'dcf', 'reconciliation'];
      for (const dbType of STALENESS_CALC_TYPES) {
        await vsb.from('valuation_calculations')
          .update({ is_stale: true, stale_reason: 'financial_period_changed', stale_source_type: 'valuation_financials', stale_source_id: finRow.id, stale_marked_at: new Date().toISOString(), stale_marked_by_profile_id: profileId })
          .eq('valuation_id', valuation_id).eq('calculation_type', dbType);
      }
      // Equity bridge: cascade from reconciliation staleness
      await vsb.from('valuation_calculations')
        .update({ is_stale: true, stale_reason: 'financial_period_changed', stale_source_type: 'valuation_financials', stale_source_id: finRow.id, stale_marked_at: new Date().toISOString(), stale_marked_by_profile_id: profileId })
        .eq('valuation_id', valuation_id)
        .eq('calculation_type', 'reconciliation')
        .eq('methodology', 'equity_bridge');
      await vsb.from('valuation_dcf_projections').update({ is_stale: true, stale_reason: 'financial_period_changed' }).eq('valuation_id', valuation_id);
      await vsb.from('valuation_cap_earnings').update({ is_stale: true, stale_reason: 'financial_period_changed' }).eq('valuation_id', valuation_id);

      return Response.json({ financial: finRow });
    }

    // ════════════════════════════════════════════════════════════════════════
    // SAVE VALUATION ADJUSTMENT
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'saveValuationAdjustment') {
      const { valuation_id, adjustment_category, amount, adjustment_direction, financial_id,
              description, evidence_doc_id, is_recurring, approved_amount,
              evidence_source, override_reason, period_label, fiscal_year } = data;
      if (!valuation_id || !adjustment_category) {
        return Response.json({ error: 'valuation_id and adjustment_category required' }, { status: 400 });
      }
      await requireValuationEdit(profile, valuation_id);

      const approvalStatus = data.advisor_approval_status || 'pending';
      const isApproved = approvalStatus === 'approved';
      const { data: adj, error } = await vsb.from('valuation_adjustments').insert({
        valuation_id, financial_id,
        period_label: period_label || null,
        fiscal_year: fiscal_year || null,
        adjustment_type: adjustment_category,
        adjustment_direction: adjustment_direction || 'add_back',
        is_recurring: is_recurring !== undefined ? !!is_recurring : false,
        proposed_amount: amount || 0,
        approved_amount: isApproved ? (approved_amount || amount || 0) : 0,
        advisor_approval_status: approvalStatus,
        explanation: description,
        evidence_source: evidence_source || null,
        evidence_document_id: evidence_doc_id,
        reviewer_profile_id: isApproved ? profileId : null,
        review_date: isApproved ? new Date().toISOString() : null,
        override_reason: override_reason || null,
        created_by_profile_id: profileId,
      }).select().single();
      if (error) throw new Error(error.message);

      await appendAudit(valuation_id, 'adjustment_saved', null, { adjustment_category, amount }, { adjustment_id: adj.id });

      // ── Phase 13.3D: Trigger staleness for adjustment change ────────────
      // Cascade: reconciliation stale → equity bridge stale
      const ADJ_STALENESS_TYPES = ['normalized_earnings', 'ebitda_multiple', 'sde_multiple', 'capitalization_of_earnings', 'reconciliation'];
      for (const dbType of ADJ_STALENESS_TYPES) {
        await vsb.from('valuation_calculations')
          .update({ is_stale: true, stale_reason: 'adjustment_changed', stale_source_type: 'valuation_adjustments', stale_source_id: adj.id, stale_marked_at: new Date().toISOString(), stale_marked_by_profile_id: profileId })
          .eq('valuation_id', valuation_id).eq('calculation_type', dbType);
      }
      // Equity bridge: cascade from reconciliation staleness
      await vsb.from('valuation_calculations')
        .update({ is_stale: true, stale_reason: 'adjustment_changed', stale_source_type: 'valuation_adjustments', stale_source_id: adj.id, stale_marked_at: new Date().toISOString(), stale_marked_by_profile_id: profileId })
        .eq('valuation_id', valuation_id)
        .eq('calculation_type', 'reconciliation')
        .eq('methodology', 'equity_bridge');

      return Response.json({ adjustment: adj });
    }

    // ════════════════════════════════════════════════════════════════════════
    // SAVE VALUATION MULTIPLE FACTOR
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'saveValuationMultipleFactor') {
      const { valuation_id, factor_key, factor_label, multiple_adjustment, rationale } = data;
      if (!valuation_id || !factor_key) {
        return Response.json({ error: 'valuation_id and factor_key required' }, { status: 400 });
      }
      await requireValuationEdit(profile, valuation_id);

      const { data: mf, error } = await vsb.from('valuation_multiples').insert({
        valuation_id,
        method: 'ebitda_multiple',
        selection_reason: rationale,
      }).select().single();
      if (error) throw new Error(error.message);

      await appendAudit(valuation_id, 'calculation_saved', null, { factor_key, multiple_adjustment }, { factor_id: mf.id });
      return Response.json({ factor: mf });
    }

    // ════════════════════════════════════════════════════════════════════════
    // SAVE VALUATION SCENARIO
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'saveValuationScenario') {
      const { valuation_id, scenario_type, enterprise_value_low, enterprise_value_high, equity_value_low, equity_value_high, methodology } = data;
      if (!valuation_id || !scenario_type) {
        return Response.json({ error: 'valuation_id and scenario_type required' }, { status: 400 });
      }
      await requireValuationEdit(profile, valuation_id);

      const { data: sc, error } = await vsb.from('valuation_scenarios').insert({
        valuation_id, scenario_type,
        scenario_name: data.scenario_name || scenario_type,
        description: data.description,
        enterprise_value: data.enterprise_value,
        equity_value: data.equity_value,
      }).select().single();
      if (error) throw new Error(error.message);

      await appendAudit(valuation_id, 'calculation_saved', null, { scenario_type }, { scenario_id: sc.id });
      return Response.json({ scenario: sc });
    }

    // ════════════════════════════════════════════════════════════════════════
    // PUBLISH VALUATION (server-constructed snapshot)
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'publishValuation') {
      const { valuation_id, publication_options = {} } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationPublish(profile, valuation_id);

      const { data: val } = await vsb.from('business_valuations')
        .select('*').eq('id', valuation_id).maybeSingle();
      if (!val) return Response.json({ error: 'VALUATION_NOT_FOUND' }, { status: 404 });
      if (val.status !== 'advisor_approved' && val.status !== 'published') {
        return Response.json({ error: 'INVALID_LIFECYCLE_STATE', current: val.status }, { status: 400 });
      }

      // ── Phase 13.3D: Publication readiness gate ────────────────────────
      // Block publication if any critical dependency is stale or unapproved.
      const { data: staleCalcs } = await vsb.from('valuation_calculations')
        .select('id, calculation_type, methodology, stale_reason')
        .eq('valuation_id', valuation_id)
        .eq('is_stale', true);
      if (staleCalcs && staleCalcs.length > 0) {
        return Response.json({
          error: 'PUBLICATION_BLOCKED_STALE',
          stale_calculations: staleCalcs.map(c => ({ id: c.id, type: c.calculation_type, methodology: c.methodology, reason: c.stale_reason })),
        }, { status: 400 });
      }

      // Verify approved blended reconciliation exists
      const { data: pubRecon } = await vsb.from('valuation_calculations')
        .select('id').eq('valuation_id', valuation_id)
        .eq('calculation_type', 'reconciliation')
        .eq('methodology', 'blended')
        .eq('is_approved', true)
        .is('superseded_by_calculation_id', null)
        .maybeSingle();
      if (!pubRecon) {
        return Response.json({ error: 'PUBLICATION_BLOCKED', blocker: 'Approved blended reconciliation required' }, { status: 400 });
      }

      // Verify approved advisor conclusion exists
      const { data: pubConclusion } = await vsb.from('valuation_conclusions')
        .select('id').eq('valuation_id', valuation_id)
        .eq('advisor_approved', true).maybeSingle();
      if (!pubConclusion) {
        return Response.json({ error: 'PUBLICATION_BLOCKED', blocker: 'Approved advisor conclusion required' }, { status: 400 });
      }

      // Load approved data
      const { data: financials } = await vsb.from('valuation_financials')
        .select('*').eq('valuation_id', valuation_id).eq('advisor_approval_status', 'approved');
      const { data: adjustments } = await vsb.from('valuation_adjustments')
        .select('*').eq('valuation_id', valuation_id).eq('advisor_approval_status', 'approved');
      const { data: multiples } = await vsb.from('valuation_multiples')
        .select('*').eq('valuation_id', valuation_id);
      const { data: scenarios } = await vsb.from('valuation_scenarios')
        .select('*').eq('valuation_id', valuation_id);
      const { data: evidence } = await vsb.from('valuation_evidence')
        .select('*').eq('valuation_id', valuation_id);

      if (!financials?.length) {
        return Response.json({ error: 'NO_APPROVED_DATA' }, { status: 400 });
      }

      // ── Phase 13.3D: Load authoritative calculations by methodology ─────
      // Blended reconciliation = source of truth for enterprise value
      const { data: blendedRecon } = await vsb.from('valuation_calculations')
        .select('*').eq('valuation_id', valuation_id)
        .eq('calculation_type', 'reconciliation')
        .eq('methodology', 'blended')
        .eq('is_approved', true)
        .is('superseded_by_calculation_id', null)
        .order('calculated_at', { ascending: false })
        .limit(1).maybeSingle();

      // Equity bridge = source of truth for equity value
      const { data: equityBridge } = await vsb.from('valuation_calculations')
        .select('*').eq('valuation_id', valuation_id)
        .eq('calculation_type', 'reconciliation')
        .eq('methodology', 'equity_bridge')
        .eq('is_approved', true)
        .is('superseded_by_calculation_id', null)
        .order('calculated_at', { ascending: false })
        .limit(1).maybeSingle();

      // Overall confidence
      const { data: overallConfidence } = await vsb.from('valuation_confidence_scores')
        .select('*').eq('valuation_id', valuation_id)
        .eq('is_overall', true).maybeSingle();

      // Approved advisor conclusion
      const { data: conclusion } = await vsb.from('valuation_conclusions')
        .select('*').eq('valuation_id', valuation_id)
        .eq('advisor_approved', true)
        .order('updated_at', { ascending: false })
        .limit(1).maybeSingle();

      // Method selections
      const { data: methodSels } = await vsb.from('valuation_method_selections')
        .select('*').eq('valuation_id', valuation_id)
        .neq('selection_role', 'excluded');

      // Construct internal snapshot — server-side from approved calculations
      const internalSnapshot = {
        publication_metadata: {
          valuation_id,
          published_at: new Date().toISOString(),
          published_by: profileId,
          valuation_date: val.valuation_date,
        },
        financial_history: financials,
        adjustments,
        multiple_factors: multiples,
        method_selections: methodSels || [],
        scenarios,
        evidence_references: evidence,
        blended_reconciliation: blendedRecon || null,
        equity_bridge: equityBridge || null,
        confidence: overallConfidence || null,
        advisor_conclusion: conclusion || null,
      };

      // Construct client-safe snapshot — from approved calculations, not frontend
      const clientSnapshot = {
        valuation_date: val.valuation_date,
        publication_date: new Date().toISOString(),
        enterprise_value: blendedRecon ? {
          low: blendedRecon.enterprise_value_low,
          mid: blendedRecon.enterprise_value_mid,
          high: blendedRecon.enterprise_value_high,
        } : null,
        equity_value: equityBridge ? {
          low: equityBridge.equity_value_low,
          mid: equityBridge.equity_value_mid,
          high: equityBridge.equity_value_high,
        } : null,
        confidence: overallConfidence ? overallConfidence.score : null,
        methodology_summary: conclusion ? {
          primary_method: conclusion.primary_method,
          secondary_method: conclusion.secondary_method,
          method_weights: conclusion.method_weights,
        } : null,
        key_assumptions: conclusion?.key_assumptions || [],
        key_limitations: conclusion?.key_limitations || [],
        value_drivers: conclusion?.client_visible_drivers || [],
        risks: conclusion?.client_visible_risks || [],
        opportunities: conclusion?.client_visible_opportunities || [],
        advisor_commentary: conclusion?.disclosures || null,
        disclosures: conclusion?.disclosures || null,
      };

      // Atomic version number calculation
      const { data: maxVer } = await vsb.from('valuation_versions')
        .select('version_number').eq('valuation_id', valuation_id)
        .order('version_number', { ascending: false }).limit(1).maybeSingle();
      const nextVersion = (maxVer?.version_number || 0) + 1;

      const { data: version, error: verErr } = await vsb.from('valuation_versions').insert({
        valuation_id,
        version_number: nextVersion,
        version_label: publication_options.version_label || null,
        internal_snapshot: internalSnapshot,
        client_safe_snapshot: clientSnapshot,
        published_by_profile_id: profileId,
      }).select().single();
      if (verErr) {
        if (verErr.code === '23505') return Response.json({ error: 'VERSION_CONFLICT' }, { status: 409 });
        throw new Error(verErr.message);
      }

      // Update valuation
      await vsb.from('business_valuations').update({
        status: 'published',
        latest_published_version_id: version.id,
        updated_by_profile_id: profileId,
        updated_at: new Date().toISOString(),
      }).eq('id', valuation_id);

      await appendAudit(valuation_id, 'published', null, { version_number: nextVersion, version_id: version.id }, null);

      // ── Phase 13.3D: Automatic Delta Intelligence ────────────────────────
      // If a previous published version exists, compute and store an
      // immutable delta artifact comparing the two published versions.
      // Never compares against drafts or stale calculations.
      if (nextVersion > 1) {
        try {
          const { data: prevVersion } = await vsb.from('valuation_versions')
            .select('*').eq('valuation_id', valuation_id)
            .eq('version_number', nextVersion - 1)
            .maybeSingle();

          if (prevVersion) {
            const delta = computeVersionDelta(
              {
                version_number: prevVersion.version_number,
                published_at: prevVersion.published_at,
                internal_snapshot: prevVersion.internal_snapshot,
                client_safe_snapshot: prevVersion.client_safe_snapshot,
              },
              {
                version_number: version.version_number,
                published_at: version.published_at,
                internal_snapshot: version.internal_snapshot,
                client_safe_snapshot: version.client_safe_snapshot,
              }
            );

            await vsb.from('valuation_version_deltas').insert({
              valuation_id,
              previous_version_id: prevVersion.id,
              current_version_id: version.id,
              previous_version_number: prevVersion.version_number,
              current_version_number: version.version_number,
              engine_version: '13.3.0',
              delta_engine_version: '13.3.0',
              calculated_by_profile_id: profileId,
              delta_summary: delta.deltaSummary,
              value_attribution: delta.valueAttribution,
              waterfall: delta.waterfall,
              advisor_summary: delta.advisorSummary,
              client_summary: delta.clientSummary,
            });
          }
        } catch (deltaErr) {
          // Non-fatal: delta generation should not block publication
          console.warn('Delta generation failed:', deltaErr.message);
        }
      }

      return Response.json({ version, version_number: nextVersion });
    }

    // ════════════════════════════════════════════════════════════════════════
    // GET VERSION DELTA (Phase 13.3D)
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'getVersionDelta') {
      const { valuation_id, current_version_id } = data;
      if (!valuation_id || !current_version_id) {
        return Response.json({ error: 'valuation_id and current_version_id required' }, { status: 400 });
      }
      await requireValuationView(profile, valuation_id);

      const { data: delta, error } = await vsb.from('valuation_version_deltas')
        .select('*').eq('valuation_id', valuation_id)
        .eq('current_version_id', current_version_id).maybeSingle();
      if (error) throw new Error(error.message);
      return Response.json({ delta: delta || null });
    }

    if (action === 'getVersionDeltas') {
      const { valuation_id } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationView(profile, valuation_id);

      const { data: deltas, error } = await vsb.from('valuation_version_deltas')
        .select('*').eq('valuation_id', valuation_id)
        .order('current_version_number', { ascending: false });
      if (error) throw new Error(error.message);
      return Response.json({ deltas: deltas || [] });
    }

    // ════════════════════════════════════════════════════════════════════════
    // SHARE VALUATION
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'shareValuation') {
      const { valuation_id, version_id } = data;
      if (!valuation_id || !version_id) {
        return Response.json({ error: 'valuation_id and version_id required' }, { status: 400 });
      }
      await requireValuationPublish(profile, valuation_id);

      const { data: val } = await vsb.from('business_valuations')
        .select('id, status').eq('id', valuation_id).maybeSingle();
      if (!val) return Response.json({ error: 'VALUATION_NOT_FOUND' }, { status: 404 });
      if (val.status === 'archived') return Response.json({ error: 'VALUATION_ARCHIVED' }, { status: 400 });

      const { data: ver } = await vsb.from('valuation_versions')
        .select('id, valuation_id').eq('id', version_id).maybeSingle();
      if (!ver) return Response.json({ error: 'VERSION_NOT_FOUND' }, { status: 404 });
      if (ver.valuation_id !== valuation_id) return Response.json({ error: 'VERSION_MISMATCH' }, { status: 400 });

      const { data: updated, error } = await vsb.from('business_valuations').update({
        client_sharing_status: 'shared',
        shared_version_id: version_id,
        last_shared_version_id: version_id,
        shared_at: new Date().toISOString(),
        revoked_at: null,
        updated_by_profile_id: profileId,
        updated_at: new Date().toISOString(),
      }).eq('id', valuation_id).select().single();
      if (error) throw new Error(error.message);

      await appendAudit(valuation_id, 'shared', null, { version_id }, null);
      return Response.json({ valuation: updated });
    }

    // ════════════════════════════════════════════════════════════════════════
    // REVOKE CLIENT ACCESS
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'revokeClientAccess') {
      const { valuation_id } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationPublish(profile, valuation_id);

      const { data: val } = await vsb.from('business_valuations')
        .select('id, client_sharing_status, shared_version_id, last_shared_version_id')
        .eq('id', valuation_id).maybeSingle();
      if (!val) return Response.json({ error: 'VALUATION_NOT_FOUND' }, { status: 404 });
      if (val.client_sharing_status !== 'shared') {
        return Response.json({ error: 'NOT_CURRENTLY_SHARED' }, { status: 400 });
      }

      const { data: updated, error } = await vsb.from('business_valuations').update({
        client_sharing_status: 'revoked',
        revoked_at: new Date().toISOString(),
        shared_version_id: null,
        updated_by_profile_id: profileId,
        updated_at: new Date().toISOString(),
      }).eq('id', valuation_id).select().single();
      if (error) throw new Error(error.message);

      await appendAudit(valuation_id, 'revoked',
        { shared_version_id: val.shared_version_id },
        { last_shared_version_id: val.last_shared_version_id }, null);
      return Response.json({ valuation: updated });
    }

    // ════════════════════════════════════════════════════════════════════════
    // GET SHARED CLIENT SUMMARY
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'getSharedClientSummary') {
      const { business_id } = data;
      if (!business_id) return Response.json({ error: 'business_id required' }, { status: 400 });

      const hasAccess = await requireBusinessAccess(profile, business_id);
      if (!hasAccess) return Response.json({ error: 'BUSINESS_ACCESS_DENIED' }, { status: 403 });

      const { data: val } = await vsb.from('business_valuations')
        .select('*').eq('business_id', business_id).maybeSingle();
      if (!val) return Response.json({ error: 'VALUATION_NOT_FOUND' }, { status: 404 });
      if (val.client_sharing_status !== 'shared') return Response.json({ error: 'NOT_SHARED' }, { status: 400 });
      if (val.status === 'archived') return Response.json({ error: 'VALUATION_ARCHIVED' }, { status: 400 });
      if (!val.shared_version_id) return Response.json({ error: 'NO_SHARED_VERSION' }, { status: 400 });

      const { data: ver } = await vsb.from('valuation_versions')
        .select('*').eq('id', val.shared_version_id).maybeSingle();
      if (!ver) return Response.json({ error: 'VERSION_NOT_FOUND' }, { status: 404 });
      if (ver.valuation_id !== val.id) return Response.json({ error: 'VERSION_MISMATCH' }, { status: 400 });

      return Response.json({
        valuation_id: val.id,
        business_id,
        version_id: ver.id,
        version_number: ver.version_number,
        valuation_date: val.valuation_date,
        published_at: ver.published_at,
        client_summary_snapshot: ver.client_safe_snapshot,
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // ARCHIVE VALUATION
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'archiveValuation') {
      const { valuation_id } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      try { await requireValuationArchive(profile, valuation_id); }
      catch (e) { return Response.json({ error: e.message }, { status: e.status || 403 }); }

      const { data: val } = await vsb.from('business_valuations')
        .select('id, status, client_sharing_status').eq('id', valuation_id).maybeSingle();
      if (!val) return Response.json({ error: 'VALUATION_NOT_FOUND' }, { status: 404 });
      if (val.status === 'archived') return Response.json({ error: 'ALREADY_ARCHIVED' }, { status: 400 });

      const updates = {
        status: 'archived',
        updated_by_profile_id: profileId,
        updated_at: new Date().toISOString(),
      };
      if (val.client_sharing_status === 'shared') {
        updates.client_sharing_status = 'revoked';
        updates.sharing_revoked_at = new Date().toISOString();
        updates.shared_version_id = null;
      }

      const { data: updated, error } = await vsb.from('business_valuations')
        .update(updates).eq('id', valuation_id).select().single();
      if (error) throw new Error(error.message);

      await appendAudit(valuation_id, 'archived', { status: val.status }, { status: 'archived' }, null);
      return Response.json({ valuation: updated });
    }

    // ════════════════════════════════════════════════════════════════════════
    // RESTORE ARCHIVED VALUATION
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'restoreArchivedValuation') {
      const { valuation_id } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      try { await requireValuationRestore(profile, valuation_id); }
      catch (e) { return Response.json({ error: e.message }, { status: e.status || 403 }); }

      const { data: val } = await vsb.from('business_valuations')
        .select('id, status').eq('id', valuation_id).maybeSingle();
      if (!val) return Response.json({ error: 'VALUATION_NOT_FOUND' }, { status: 404 });
      if (val.status !== 'archived') return Response.json({ error: 'NOT_ARCHIVED' }, { status: 400 });

      const { data: updated, error } = await vsb.from('business_valuations').update({
        status: 'in_progress',
        updated_by_profile_id: profileId,
        updated_at: new Date().toISOString(),
      }).eq('id', valuation_id).select().single();
      if (error) throw new Error(error.message);

      await appendAudit(valuation_id, 'restored', { status: 'archived' }, { status: 'in_progress' }, null);
      return Response.json({ valuation: updated });
    }

    // ════════════════════════════════════════════════════════════════════════
    // APPEND VALUATION AUDIT EVENT
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'appendValuationAuditEvent') {
      if (!isSuperAdmin) return Response.json({ error: 'PERMISSION_DENIED' }, { status: 403 });
      const { valuation_id, action_type, old_value, new_value, metadata } = data;
      if (!valuation_id || !action_type) {
        return Response.json({ error: 'valuation_id and action_type required' }, { status: 400 });
      }
      // Validate action_type against CHECK constraint
      const ALLOWED_AUDIT_ACTIONS = ['created', 'updated', 'status_changed', 'assigned', 'unassigned', 'published', 'shared', 'revoked', 'archived', 'restored', 'answer_saved', 'financial_saved', 'adjustment_saved', 'calculation_saved', 'value_driver_saved', 'reviewed'];
      if (!ALLOWED_AUDIT_ACTIONS.includes(action_type)) {
        return Response.json({ error: `INVALID_AUDIT_ACTION: ${action_type}` }, { status: 400 });
      }
      const { data: audit, error } = await vsb.from('valuation_audit_log').insert({
        valuation_id,
        actor_profile_id: profileId,
        action: action_type,
        action_details: { old: old_value || null, new: new_value || null, meta: metadata || null },
      }).select().single();
      if (error) throw new Error(error.message);
      return Response.json({ audit });
    }

    // ════════════════════════════════════════════════════════════════════════
    // READ ACTIONS
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'getValuationByBusiness') {
      const { business_id } = data;
      if (!business_id) return Response.json({ error: 'business_id required' }, { status: 400 });
      const hasAccess = await requireBusinessAccess(profile, business_id);
      if (!hasAccess) return Response.json({ error: 'BUSINESS_ACCESS_DENIED' }, { status: 403 });

      const { data: val, error: valErr } = await vsb.from('business_valuations')
        .select('*').eq('business_id', business_id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (valErr) throw new Error(valErr.message);
      if (!val) return Response.json({ valuation: null });

      const asg = await getAssignment(val.id);
      const { data: business } = await sb.from('business_entities')
        .select('id, business_name, industry').eq('id', business_id).maybeSingle();
      const { data: leadAdvisor } = val.lead_advisor_profile_id
        ? await sb.from('profiles').select('id, first_name, last_name, email').eq('id', val.lead_advisor_profile_id).maybeSingle()
        : { data: null };
      const { count: versionCount } = await vsb.from('valuation_versions')
        .select('id', { count: 'exact', head: true }).eq('valuation_id', val.id);

      // Phase 13.3G.2: Fetch assignments for the Valuation Team card
      const { data: rawAssignments } = await vsb.from('valuation_assignments')
        .select('*').eq('valuation_id', val.id).is('removed_at', null);
      const assignments = await Promise.all((rawAssignments || []).map(async (a) => {
        const { data: advisor } = await sb.from('profiles')
          .select('id, first_name, last_name, email, app_role')
          .eq('id', a.assigned_profile_id).maybeSingle();
        return { ...a, advisor };
      }));

      return Response.json({
        valuation: val, business, leadAdvisor,
        versionCount: versionCount || 0, assignment: asg,
        assignments,
      });
    }

    if (action === 'getValuation') {
      const { valuation_id } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      const ctx = await requireValuationView(profile, valuation_id);

      const { data: val } = await vsb.from('business_valuations')
        .select('*').eq('id', valuation_id).maybeSingle();
      if (!val) return Response.json({ error: 'VALUATION_NOT_FOUND' }, { status: 404 });

      const { data: business } = await sb.from('business_entities')
        .select('id, business_name, industry').eq('id', val.business_id).maybeSingle();

      return Response.json({ valuation: val, business, assignment: ctx.assignment });
    }

    if (action === 'getValuationSummary') {
      const { valuation_id } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      const ctx = await requireValuationView(profile, valuation_id);

      const { data: val } = await vsb.from('business_valuations')
        .select('*').eq('id', valuation_id).maybeSingle();
      if (!val) return Response.json({ error: 'VALUATION_NOT_FOUND' }, { status: 404 });

      const { data: business } = await sb.from('business_entities')
        .select('id, business_name, industry').eq('id', val.business_id).maybeSingle();
      const { data: leadAdvisor } = val.lead_advisor_profile_id
        ? await sb.from('profiles').select('id, first_name, last_name, email').eq('id', val.lead_advisor_profile_id).maybeSingle()
        : { data: null };
      const { data: latestVersion } = val.latest_published_version_id
        ? await vsb.from('valuation_versions').select('*').eq('id', val.latest_published_version_id).maybeSingle()
        : { data: null };
      const { count: versionCount } = await vsb.from('valuation_versions')
        .select('id', { count: 'exact', head: true }).eq('valuation_id', valuation_id);
      const { data: sections } = await vsb.from('valuation_sections')
        .select('*').eq('valuation_id', valuation_id);
      // Cross-schema FK joins don't work with schema-scoped client; fetch separately
      const { data: rawAssignments } = await vsb.from('valuation_assignments')
        .select('*')
        .eq('valuation_id', valuation_id).is('removed_at', null);
      const assignments = await Promise.all((rawAssignments || []).map(async (a) => {
        const { data: advisor } = await sb.from('profiles')
          .select('id, first_name, last_name, email, app_role')
          .eq('id', a.assigned_profile_id).maybeSingle();
        return { ...a, advisor };
      }));

      return Response.json({
        valuation: val, business, leadAdvisor, latestVersion,
        versionCount, sections: sections || [], assignments,
        assignment: ctx.assignment,
      });
    }

    if (action === 'getValuationVersions') {
      const { valuation_id } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationView(profile, valuation_id);

      const { data: versions } = await vsb.from('valuation_versions')
        .select('id, version_number, version_label, published_at, published_by_profile_id')
        .eq('valuation_id', valuation_id)
        .order('version_number', { ascending: false });
      return Response.json({ versions: versions || [] });
    }

    if (action === 'getValuationAuditLog') {
      const { valuation_id } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationView(profile, valuation_id);

      const { data: logs } = await vsb.from('valuation_audit_log')
        .select('id, action, action_details, actor_profile_id, acted_at')
        .eq('valuation_id', valuation_id)
        .order('acted_at', { ascending: false })
        .limit(100);
      return Response.json({ logs: logs || [] });
    }

    if (action === 'getValuationAssignments') {
      const { valuation_id } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      try { await requireAssignmentManagement(profile, valuation_id); }
      catch (e) { return Response.json({ error: e.message }, { status: e.status || 403 }); }

      // Cross-schema FK joins don't work with schema-scoped client; fetch separately
      const { data: rawAssignments, error: asgErr } = await vsb.from('valuation_assignments')
        .select('*')
        .eq('valuation_id', valuation_id)
        .order('assigned_at', { ascending: false });
      if (asgErr) throw new Error(asgErr.message);

      const assignments = await Promise.all((rawAssignments || []).map(async (a) => {
        const { data: advisor } = await sb.from('profiles')
          .select('id, first_name, last_name, email, app_role')
          .eq('id', a.assigned_profile_id).maybeSingle();
        return { ...a, advisor };
      }));
      return Response.json({ assignments });
    }

    // ════════════════════════════════════════════════════════════════════════
    // DATA READINESS — inspect existing platform data (read-only)
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'getDataReadiness') {
      const { business_id } = data;
      if (!business_id) return Response.json({ error: 'business_id required' }, { status: 400 });

      const hasAccess = await requireBusinessAccess(profile, business_id);
      if (!hasAccess) return Response.json({ error: 'BUSINESS_ACCESS_DENIED' }, { status: 403 });

      const categories = [];

      // Business information
      const { data: biz } = await sb.from('business_entities')
        .select('id, business_name, industry, business_family_type').eq('id', business_id).maybeSingle();
      categories.push({
        key: 'business_info', label: 'Business Information',
        status: biz?.business_name ? 'available' : 'missing',
        confidence: biz?.business_name ? 100 : 0,
        source: 'business_entities',
        details: biz || null,
        missing_requirements: biz?.business_name ? [] : ['Business name', 'Industry'],
      });

      // Uploaded documents
      const { count: docCount } = await sb.from('documents')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', business_id);
      categories.push({
        key: 'documents', label: 'Uploaded Documents',
        status: docCount > 0 ? 'available' : 'missing',
        confidence: docCount > 0 ? Math.min(100, docCount * 20) : 0,
        source: 'documents',
        details: { count: docCount || 0 },
        missing_requirements: docCount > 0 ? [] : ['At least one financial document'],
      });

      // Document extraction
      const { data: extractedDocs } = await sb.from('documents')
        .select('id, status, confidence_score, extracted_data')
        .eq('business_id', business_id).not('extracted_data', 'is', null).limit(20);
      const extractedCount = extractedDocs?.length || 0;
      categories.push({
        key: 'document_extraction', label: 'Document Extraction',
        status: extractedCount > 0 ? 'available' : 'needs_review',
        confidence: extractedCount > 0 ? 70 : 0,
        source: 'documents.extracted_data',
        details: { count: extractedCount },
        missing_requirements: extractedCount > 0 ? [] : ['Extracted financial data from documents'],
      });

      // Phase C.1: Base44 Assessment retired — read from Supabase business_assessments
      const assessmentList = await loadBusinessAssessmentSummaries(sb, business_id);
      const completedAssessments = assessmentList.filter(a => a.score != null);
      categories.push({
        key: 'assessments', label: 'Existing Assessments',
        status: completedAssessments.length > 0 ? 'available' : 'missing',
        confidence: completedAssessments.length > 0 ? 80 : 0,
        source: 'supabase.business_assessments',
        details: { total: assessmentList.length, completed: completedAssessments.length },
        missing_requirements: completedAssessments.length > 0 ? [] : ['Complete at least one assessment'],
      });

      // Dashboard metrics (corrected column names: annual_revenue, current_ebitda)
      const { data: metrics } = await sb.from('dashboard_metrics')
        .select('annual_revenue, current_ebitda, recast_ebitda, profit_gap, tax_gap, value_gap, operations_score')
        .eq('business_id', business_id).maybeSingle();
      categories.push({
        key: 'dashboard_metrics', label: 'Dashboard Metrics',
        status: metrics?.annual_revenue ? 'available' : 'partial',
        confidence: metrics?.annual_revenue ? 75 : 30,
        source: 'dashboard_metrics',
        details: { has_revenue: !!metrics?.annual_revenue, has_ebitda: !!metrics?.current_ebitda },
        missing_requirements: metrics?.annual_revenue ? [] : ['Revenue data'],
      });

      // Recast EBITDA
      categories.push({
        key: 'recast_ebitda', label: 'Recast EBITDA',
        status: metrics?.recast_ebitda ? 'available' : 'missing',
        confidence: metrics?.recast_ebitda ? 70 : 0,
        source: 'dashboard_metrics.recast_ebitda',
        details: { value: metrics?.recast_ebitda || null },
        missing_requirements: metrics?.recast_ebitda ? [] : ['Recast EBITDA calculation'],
      });

      // Gap analyses
      const { count: gapCount } = await sb.from('gap_analyses')
        .select('id', { count: 'exact', head: true }).eq('business_id', business_id);
      categories.push({
        key: 'gap_analyses', label: 'Gap Analyses',
        status: gapCount > 0 ? 'available' : 'missing',
        confidence: gapCount > 0 ? 65 : 0,
        source: 'gap_analyses',
        details: { count: gapCount || 0 },
        missing_requirements: gapCount > 0 ? [] : ['At least one gap analysis'],
      });

      // Profile financials — profiles table has no financial columns;
      // use dashboard_metrics as the financial proxy
      categories.push({
        key: 'profile_financials', label: 'Profile Financials',
        status: metrics?.annual_revenue ? 'available' : 'partial',
        confidence: metrics?.annual_revenue ? 60 : 20,
        source: 'dashboard_metrics (proxy)',
        details: { has_revenue: !!metrics?.annual_revenue, has_profit: !!metrics?.net_profit },
        missing_requirements: metrics?.annual_revenue ? [] : ['Annual revenue data'],
      });

      // Overall readiness
      const available = categories.filter(c => c.status === 'available').length;
      const overallConfidence = Math.round(categories.reduce((s, c) => s + c.confidence, 0) / categories.length);

      return Response.json({
        categories,
        overall: {
          available_count: available,
          total_count: categories.length,
          confidence: overallConfidence,
          readiness_score: Math.round((available / categories.length) * 100),
        },
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // GET SHARED VALUATION AVAILABILITY (Advisory Hub conditional visibility)
    // Returns only: available, valuation_name, version_id, published_date
    // Does NOT fetch the complete snapshot.
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'getSharedValuationAvailability') {
      const { business_id } = data;
      if (!business_id) return Response.json({ error: 'business_id required' }, { status: 400 });

      const hasAccess = await requireBusinessAccess(profile, business_id);
      if (!hasAccess) return Response.json({ error: 'BUSINESS_ACCESS_DENIED' }, { status: 403 });

      const { data: val, error: valErr } = await vsb.from('business_valuations')
        .select('id, valuation_name, client_sharing_status, shared_version_id, status')
        .eq('business_id', business_id)
        .eq('client_sharing_status', 'shared')
        .neq('status', 'archived')
        .not('shared_version_id', 'is', null)
        .maybeSingle();
      if (valErr) throw new Error(valErr.message);

      if (!val) {
        return Response.json({ available: false });
      }

      const { data: ver } = await vsb.from('valuation_versions')
        .select('id, version_number, published_at')
        .eq('id', val.shared_version_id)
        .maybeSingle();

      return Response.json({
        available: true,
        valuation_id: val.id,
        valuation_name: val.valuation_name,
        version_id: val.shared_version_id,
        version_number: ver?.version_number || null,
        published_date: ver?.published_at || null,
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // GET VALUATION QUESTIONS (Phase 13.3)
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'getValuationQuestions') {
      const { section_key } = data;
      let query = vsb.from('valuation_questions')
        .select('id, question_key, section, section_id, question_text, explanation, answer_type, options, required, conditional_logic, valuation_relevance, multiple_relevance, profitability_relevance, suggested_evidence, client_answerable, advisor_only, confidence_impact, display_order, version, is_active')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      if (section_key) {
        query = query.eq('section', section_key);
      }
      const { data: questions, error: qErr } = await query;
      if (qErr) throw new Error(qErr.message);

      const { data: sections, error: sErr } = await vsb.from('valuation_sections')
        .select('id, section_key, section_name, display_order, is_active')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      if (sErr) throw new Error(sErr.message);

      return Response.json({ questions: questions || [], sections: sections || [] });
    }

    // ════════════════════════════════════════════════════════════════════════
    // GET VALUATION ANSWERS (Phase 13.3)
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'getValuationAnswers') {
      const { valuation_id } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationView(profile, valuation_id);

      const { data: answers, error: aErr } = await vsb.from('valuation_answers')
        .select('id, valuation_id, question_id, answer_value, answer_type, source_type, source_id, source_confidence, is_confirmed, advisor_verification_status, answered_by_profile_id, answered_at')
        .eq('valuation_id', valuation_id)
        .order('answered_at', { ascending: true });
      if (aErr) throw new Error(aErr.message);

      return Response.json({ answers: answers || [] });
    }

    // ════════════════════════════════════════════════════════════════════════
    // GET VALUATION INTELLIGENCE (Phase 13.3E.2)
    // Read-only unified prefill intelligence. Loads all backend sources,
    // normalizes into candidates, detects conflicts, scores confidence,
    // maps to valuation questions, and returns the intelligence record.
    // No mutation. All access backend-mediated.
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'getValuationIntelligence') {
      const { valuation_id } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      const ctx = await loadValuationContext(valuation_id);
      if (!ctx) return Response.json({ error: 'VALUATION_NOT_FOUND' }, { status: 404 });
      // Reuse view-level authorization (assignment or super_admin)
      await requireValuationView(profile, valuation_id);

      const { data: val } = await vsb.from('business_valuations')
        .select('business_id').eq('id', valuation_id).maybeSingle();
      if (!val) return Response.json({ error: 'VALUATION_NOT_FOUND' }, { status: 404 });
      const businessId = val.business_id;

      // Load all sources (business-scoped)
      const { data: business } = await sb.from('business_entities')
        .select('*').eq('id', businessId).maybeSingle();
      const { data: owners } = await sb.from('business_owners')
        .select('*').eq('business_id', businessId);
      const { data: documents } = await sb.from('documents')
        .select('*').eq('business_id', businessId).order('created_date', { ascending: false }).limit(200);
      const { data: extractedFields } = await sb.from('extracted_fields')
        .select('*').eq('business_id', businessId).order('created_at', { ascending: false }).limit(500);
      const { data: documentAnalyses } = await sb.from('document_analysis')
        .select('*').in('document_id', (documents || []).map((d) => d.id));
      const { data: dashboardMetrics } = await sb.from('dashboard_metrics')
        .select('*').eq('business_id', businessId).order('updated_at', { ascending: false }).limit(1).maybeSingle();
      const { data: gapAnalyses } = await sb.from('gap_analyses')
        .select('*').eq('business_id', businessId).limit(50);
      const { data: profileFinancials } = await sb.from('profile_financials')
        .select('*').eq('business_id', businessId).maybeSingle();
      const { data: businessAssessments } = await sb.from('business_assessments')
        .select('*').eq('business_id', businessId).order('updated_at', { ascending: false }).limit(50);

      // Phase C.1: Base44 Assessment retired — read computed results from Supabase.
      // Map to the legacy shape ({ id, assessment_type, results, status }) so
      // buildIntelligence consumes it without modification.
      const { list: calcList } = await loadAssessmentResults(sb, businessId);
      const assessments = calcList.map(c => ({
        id: c.session_id,
        assessment_type: c.assessment_type,
        results: c.result_json || {},
        status: c.result_json ? 'completed' : 'not_started',
      }));

      // Valuation schema data
      const { data: valuationQuestions } = await vsb.from('valuation_questions')
        .select('*').eq('is_active', true);
      const { data: valuationAnswers } = await vsb.from('valuation_answers')
        .select('*').eq('valuation_id', valuation_id);
      const { data: valuationFinancials } = await vsb.from('valuation_financials')
        .select('*').eq('valuation_id', valuation_id);
      const { data: valuationAdjustments } = await vsb.from('valuation_adjustments')
        .select('*').eq('valuation_id', valuation_id);
      const { data: valuationVersions } = await vsb.from('valuation_versions')
        .select('id, version_number, published_at').eq('valuation_id', valuation_id).order('version_number', { ascending: false });

      // Resolve profile for the intelligence context
      const { data: profileRow } = await sb.from('profiles')
        .select('*').eq('id', profileId).maybeSingle();

      const intelligenceCtx = {
        business,
        owners: owners || [],
        profile: profileRow,
        documents: documents || [],
        extractedFields: extractedFields || [],
        documentAnalyses: documentAnalyses || [],
        assessments,
        businessAssessments: businessAssessments || [],
        dashboardMetrics,
        gapAnalyses: gapAnalyses || [],
        valuationAnswers: valuationAnswers || [],
        valuationFinancials: valuationFinancials || [],
        valuationAdjustments: valuationAdjustments || [],
        valuationVersions: valuationVersions || [],
        valuationQuestions: valuationQuestions || [],
        profileFinancials,
      };

      const result = buildIntelligence(intelligenceCtx);
      return Response.json({ intelligence: result });
    }

    // ════════════════════════════════════════════════════════════════════════
    // RUN INTELLIGENCE SCAN (Phase 13.3E.2)
    // Performs prefill: writes valuation_answers for high-confidence
    // candidates ONLY when no advisor-approved value exists and the
    // destination is not a published version. Returns counts.
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'runIntelligenceScan') {
      const { valuation_id, scope } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationEdit(profile, valuation_id);

      const { data: val } = await vsb.from('business_valuations')
        .select('business_id, status').eq('id', valuation_id).maybeSingle();
      if (!val) return Response.json({ error: 'VALUATION_NOT_FOUND' }, { status: 404 });
      if (val.status === 'archived') return Response.json({ error: 'VALUATION_ARCHIVED' }, { status: 400 });
      const businessId = val.business_id;

      // Load sources (same as getValuationIntelligence, scoped by business)
      const { data: business } = await sb.from('business_entities').select('*').eq('id', businessId).maybeSingle();
      const { data: owners } = await sb.from('business_owners').select('*').eq('business_id', businessId);
      const { data: documents } = await sb.from('documents').select('*').eq('business_id', businessId).limit(200);
      const { data: extractedFields } = await sb.from('extracted_fields').select('*').eq('business_id', businessId).limit(500);
      const { data: documentAnalyses } = await sb.from('document_analysis').select('*').in('document_id', (documents || []).map((d) => d.id));
      const { data: dashboardMetrics } = await sb.from('dashboard_metrics').select('*').eq('business_id', businessId).limit(1).maybeSingle();
      const { data: gapAnalyses } = await sb.from('gap_analyses').select('*').eq('business_id', businessId).limit(50);
      const { data: profileFinancials } = await sb.from('profile_financials').select('*').eq('business_id', businessId).maybeSingle();
      const { data: businessAssessments } = await sb.from('business_assessments').select('*').eq('business_id', businessId).limit(50);
      // Phase C.1: Base44 Assessment retired — read computed results from Supabase.
      const { list: calcList2 } = await loadAssessmentResults(sb, businessId);
      const assessments = calcList2.map(c => ({
        id: c.session_id,
        assessment_type: c.assessment_type,
        results: c.result_json || {},
        status: c.result_json ? 'completed' : 'not_started',
      }));
      const { data: valuationQuestions } = await vsb.from('valuation_questions').select('*').eq('is_active', true);
      const { data: valuationAnswers } = await vsb.from('valuation_answers').select('*').eq('valuation_id', valuation_id);
      const { data: valuationFinancials } = await vsb.from('valuation_financials').select('*').eq('valuation_id', valuation_id);
      const { data: valuationAdjustments } = await vsb.from('valuation_adjustments').select('*').eq('valuation_id', valuation_id);
      const { data: valuationVersions } = await vsb.from('valuation_versions').select('id, version_number, published_at').eq('valuation_id', valuation_id);
      const { data: profileRow } = await sb.from('profiles').select('*').eq('id', profileId).maybeSingle();

      const intelligenceCtx = {
        business, owners: owners || [], profile: profileRow,
        documents: documents || [], extractedFields: extractedFields || [],
        documentAnalyses: documentAnalyses || [], assessments, businessAssessments: businessAssessments || [],
        dashboardMetrics, gapAnalyses: gapAnalyses || [],
        valuationAnswers: valuationAnswers || [], valuationFinancials: valuationFinancials || [],
        valuationAdjustments: valuationAdjustments || [], valuationVersions: valuationVersions || [],
        valuationQuestions: valuationQuestions || [], profileFinancials,
      };

      const result = buildIntelligence(intelligenceCtx);

      // Prefill: only high-confidence candidates with a question mapping,
      // no existing advisor-approved answer, and not conflicting.
      let recordsReviewed = 0;
      let candidatesAdded = 0;
      let conflictsFound = result.conflicts.length;
      let questionsAnswered = 0;
      let fieldsPreserved = 0;

      const answerByQuestionId = {};
      for (const a of (valuationAnswers || [])) answerByQuestionId[a.question_id] = a;

      for (const candidate of result.candidates) {
        recordsReviewed++;
        if (!candidate.questionnaire_key) continue;
        const q = (valuationQuestions || []).find((x) => x.question_key === candidate.questionnaire_key);
        if (!q) continue;
        const existing = answerByQuestionId[q.id];
        const decision = decidePrefill(candidate, existing);
        if (!decision.should_prefill) {
          if (existing?.source_type === 'advisor_entry' && (existing.advisor_verification_status === 'verified' || existing.is_confirmed)) fieldsPreserved++;
          continue;
        }
        // Validate answer type
        if (q.answer_type !== candidate.answer_type && q.answer_type !== 'text' && q.answer_type !== 'textarea') continue;

        if (existing) {
          // Update only if not advisor-approved
          if (existing.source_type === 'advisor_entry') { fieldsPreserved++; continue; }
          await vsb.from('valuation_answers').update({
            answer_value: candidate.suggested_value,
            source_type: candidate.source_type,
            source_id: candidate.source_id,
            source_confidence: candidate.confidence_score,
            advisor_verification_status: 'pending',
            answered_by_profile_id: profileId,
            answered_at: new Date().toISOString(),
          }).eq('id', existing.id);
          questionsAnswered++;
        } else {
          await vsb.from('valuation_answers').insert({
            valuation_id, question_id: q.id,
            answer_value: candidate.suggested_value,
            answer_type: q.answer_type,
            source_type: candidate.source_type,
            source_id: candidate.source_id,
            source_confidence: candidate.confidence_score,
            advisor_verification_status: 'pending',
            answered_by_profile_id: profileId,
          });
          candidatesAdded++;
          questionsAnswered++;
        }
      }

      await appendAudit(valuation_id, 'calculation_saved', null, { scope: scope || 'full', records_reviewed: recordsReviewed, questions_answered: questionsAnswered }, { intelligence_scan: true });

      return Response.json({
        scan: {
          records_reviewed: recordsReviewed,
          candidates_added: candidatesAdded,
          conflicts_found: conflictsFound,
          questions_answered: questionsAnswered,
          fields_preserved: fieldsPreserved,
          completion_percentage: result.summary.completion_percentage,
        },
        intelligence: result,
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // PHASE 13.3G.3 — VISIBLE VALUATION ACCESS MANAGEMENT
    // ════════════════════════════════════════════════════════════════════════

    const buildAccessSummary = async (valuationId) => {
      const { data: val } = await vsb.from('business_valuations')
        .select('*').eq('id', valuationId).maybeSingle();
      if (!val) throw Object.assign(new Error('VALUATION_NOT_FOUND'), { status: 404 });

      const businessId = val.business_id;

      const { data: business } = await sb.from('business_entities')
        .select('id, business_name, industry, status, assigned_advisor_id')
        .eq('id', businessId).maybeSingle();

      const { data: rawOwners } = await sb.from('business_owners')
        .select('*').eq('business_id', businessId);
      const owners = await Promise.all((rawOwners || []).map(async (o) => {
        const { data: prof } = await sb.from('profiles')
          .select('id, first_name, last_name, email, app_role, base44_user_id')
          .eq('id', o.profile_id).maybeSingle();
        const name = prof ? `${prof.first_name || ''} ${prof.last_name || ''}`.trim() || prof.email : 'Unknown';
        return {
          profile_id: o.profile_id, name,
          email: prof?.email || '',
          ownership_percentage: o.ownership_percentage,
          role: o.owner_role || o.role || 'owner',
          is_primary_owner: !!o.is_primary_owner,
          is_control_person: !!o.is_control_person,
          has_profile: !!prof,
          app_role: prof?.app_role || null,
        };
      }));

      const { data: rawAssignments } = await vsb.from('valuation_assignments')
        .select('*').eq('valuation_id', valuationId).is('removed_at', null);
      const assignments = await Promise.all((rawAssignments || []).map(async (a) => {
        const { data: advisor } = await sb.from('profiles')
          .select('id, first_name, last_name, email, app_role')
          .eq('id', a.assigned_profile_id).maybeSingle();
        return { ...a, advisor };
      }));

      const leadAsg = assignments.find((a) => a.assignment_role === 'lead');
      let leadAdvisorData = null;
      if (val.lead_advisor_profile_id) {
        const { data: la } = await sb.from('profiles')
          .select('id, first_name, last_name, email, app_role')
          .eq('id', val.lead_advisor_profile_id).maybeSingle();
        leadAdvisorData = la;
      }

      let lead_advisor = null;
      if (leadAsg) {
        lead_advisor = leadAsg;
      } else if (leadAdvisorData) {
        lead_advisor = {
          advisor: leadAdvisorData, assignment_role: 'lead',
          can_view: true, can_edit: true, can_review: true, can_publish: true,
          can_manage_assignments: true,
        };
      }

      const others = assignments.filter((a) => a.assignment_role !== 'lead' && a.assignment_role !== 'owner');
      const reviewer = others.find((a) => a.can_review && !a.can_publish) || null;
      const publisher = others.find((a) => a.can_publish) || null;

      const client_access = {
        status: val.client_sharing_status || 'not_shared',
        shared_version_id: val.shared_version_id || null,
        shared_at: val.shared_at || null,
        revoked_at: val.sharing_revoked_at || null,
      };

      const userAsg = assignments.find((a) => a.assigned_profile_id === profileId);
      const isOwner = (rawOwners || []).some((o) => o.profile_id === profileId);
      const current_user_permissions = {
        can_manage_assignments: isSuperAdmin || !!userAsg?.can_manage_assignments,
        can_create_valuation: isSuperAdmin || !!userAsg?.can_create_valuation,
        can_restore_valuation: isSuperAdmin || !!userAsg?.can_restore_valuation,
        can_archive_valuation: isSuperAdmin || !!userAsg?.can_archive_valuation,
        can_edit: isSuperAdmin || !!userAsg?.can_edit,
        can_review: isSuperAdmin || !!userAsg?.can_review,
        can_publish: isSuperAdmin || !!userAsg?.can_publish,
        can_view: isSuperAdmin || !!userAsg?.can_view || isOwner,
        is_super_admin: isSuperAdmin,
        is_business_owner: isOwner,
        assignment_role: userAsg?.assignment_role || null,
      };

      let leadSummary = null;
      if (lead_advisor) {
        const lad = lead_advisor.advisor;
        leadSummary = {
          profile_id: lad?.id || val.lead_advisor_profile_id,
          name: lad ? `${lad.first_name || ''} ${lad.last_name || ''}`.trim() || lad.email : 'Unassigned',
          email: lad?.email || '',
          role: lead_advisor.assignment_role || 'lead',
          permissions: {
            can_view: lead_advisor.can_view, can_edit: lead_advisor.can_edit,
            can_review: lead_advisor.can_review, can_publish: lead_advisor.can_publish,
            can_manage_assignments: lead_advisor.can_manage_assignments,
          },
        };
      }

      const advisorsSummary = others.map((a) => ({
        profile_id: a.assigned_profile_id,
        name: a.advisor ? `${a.advisor.first_name || ''} ${a.advisor.last_name || ''}`.trim() || a.advisor.email : 'Unknown',
        email: a.advisor?.email || '',
        role: a.assignment_role,
        permissions: {
          can_view: a.can_view, can_edit: a.can_edit, can_review: a.can_review,
          can_publish: a.can_publish, can_manage_assignments: a.can_manage_assignments,
        },
      }));

      let reviewerSummary = null;
      if (reviewer) {
        reviewerSummary = {
          profile_id: reviewer.assigned_profile_id,
          name: reviewer.advisor ? `${reviewer.advisor.first_name || ''} ${reviewer.advisor.last_name || ''}`.trim() || reviewer.advisor.email : 'Unknown',
          email: reviewer.advisor?.email || '',
        };
      }

      let publisherSummary = null;
      if (publisher) {
        publisherSummary = {
          profile_id: publisher.assigned_profile_id,
          name: publisher.advisor ? `${publisher.advisor.first_name || ''} ${publisher.advisor.last_name || ''}`.trim() || publisher.advisor.email : 'Unknown',
          email: publisher.advisor?.email || '',
        };
      }

      return {
        business: business ? { id: business.id, name: business.business_name, industry: business.industry, status: business.status || 'active' } : null,
        owners,
        lead_advisor: leadSummary,
        advisors: advisorsSummary,
        reviewer: reviewerSummary,
        publisher: publisherSummary,
        client_access,
        current_user_permissions,
        valuation_status: val.status,
      };
    };

    // ── getValuationAccessSummary ──────────────────────────────────────────
    if (action === 'getValuationAccessSummary') {
      const { valuation_id } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      try {
        await requireValuationView(profile, valuation_id);
        const summary = await buildAccessSummary(valuation_id);
        return Response.json({ access: summary });
      } catch (e) { return Response.json({ error: e.message }, { status: e.status || 403 }); }
    }

    // ── getBusinessOwners ──────────────────────────────────────────────────
    if (action === 'getBusinessOwners') {
      const { business_id } = data;
      if (!business_id) return Response.json({ error: 'business_id required' }, { status: 400 });
      const hasAccess = await requireBusinessAccess(profile, business_id);
      if (!hasAccess) return Response.json({ error: 'BUSINESS_ACCESS_DENIED' }, { status: 403 });

      const { data: rawOwners } = await sb.from('business_owners')
        .select('*').eq('business_id', business_id);
      const owners = await Promise.all((rawOwners || []).map(async (o) => {
        const { data: prof } = await sb.from('profiles')
          .select('id, first_name, last_name, email, app_role, base44_user_id')
          .eq('id', o.profile_id).maybeSingle();
        const name = prof ? `${prof.first_name || ''} ${prof.last_name || ''}`.trim() || prof.email : 'Unknown';
        return {
          profile_id: o.profile_id, name,
          email: prof?.email || '',
          ownership_percentage: o.ownership_percentage,
          role: o.owner_role || o.role || 'owner',
          is_primary_owner: !!o.is_primary_owner,
          is_control_person: !!o.is_control_person,
          has_profile: !!prof,
        };
      }));
      return Response.json({ owners });
    }

    // ── getEligibleBusinessOwners ──────────────────────────────────────────
    if (action === 'getEligibleBusinessOwners') {
      const { business_id, search_term } = data;
      if (!business_id) return Response.json({ error: 'business_id required' }, { status: 400 });
      const hasAccess = await requireBusinessAccess(profile, business_id);
      if (!hasAccess) return Response.json({ error: 'BUSINESS_ACCESS_DENIED' }, { status: 403 });

      const { data: rawOwners } = await sb.from('business_owners')
        .select('profile_id').eq('business_id', business_id);
      const ownerProfileIds = (rawOwners || []).map((o) => o.profile_id);

      let bizQuery = sb.from('profiles')
        .select('id, first_name, last_name, email, app_role, primary_business_id')
        .or(`primary_business_id.eq.${business_id},app_role.eq.owner`)
        .order('last_name', { ascending: true }).limit(50);
      if (search_term) {
        bizQuery = bizQuery.or(`first_name.ilike.%${search_term}%,last_name.ilike.%${search_term}%,email.ilike.%${search_term}%`);
      }
      const { data: profiles } = await bizQuery;

      const eligible = (profiles || []).map((p) => ({
        profile_id: p.id,
        first_name: p.first_name || '',
        last_name: p.last_name || '',
        full_name: [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || 'Unknown',
        email: p.email || '',
        app_role: p.app_role || '',
        is_current_owner: ownerProfileIds.includes(p.id),
        primary_business_id: p.primary_business_id || null,
      }));

      return Response.json({ eligible_owners: eligible });
    }

    // ── assignBusinessOwner ────────────────────────────────────────────────
    if (action === 'assignBusinessOwner') {
      const { valuation_id, profile_id, ownership_percentage, is_primary_owner, is_control_person, owner_role, confirm_client_access } = data;
      if (!valuation_id || !profile_id) {
        return Response.json({ error: 'valuation_id and profile_id required' }, { status: 400 });
      }
      try {
        const ctx = await loadValuationContext(valuation_id);
        if (!isSuperAdmin) {
          if (!ctx.assignment || !ctx.assignment.can_manage_assignments) {
            return Response.json({ error: 'PERMISSION_DENIED' }, { status: 403 });
          }
        }
        const businessId = ctx.valuation.business_id;

        const { data: prof } = await sb.from('profiles')
          .select('id, email, app_role, primary_business_id')
          .eq('id', profile_id).maybeSingle();
        if (!prof) return Response.json({ error: 'PROFILE_NOT_FOUND' }, { status: 404 });

        const { data: existingOwner } = await sb.from('business_owners')
          .select('id').eq('business_id', businessId).eq('profile_id', profile_id).maybeSingle();
        const isLinked = existingOwner || prof.primary_business_id === businessId;
        if (!isLinked && !isSuperAdmin) {
          return Response.json({ error: 'CROSS_BUSINESS_ASSIGNMENT_DENIED' }, { status: 403 });
        }
        if (existingOwner) {
          return Response.json({ error: 'OWNER_ALREADY_EXISTS' }, { status: 409 });
        }

        if (is_primary_owner) {
          await sb.from('business_owners')
            .update({ is_primary_owner: false })
            .eq('business_id', businessId).eq('is_primary_owner', true);
        }

        const { data: owner, error } = await sb.from('business_owners').insert({
          business_id: businessId, profile_id,
          ownership_percentage: ownership_percentage || null,
          is_primary_owner: !!is_primary_owner,
          is_control_person: !!is_control_person,
          owner_role: owner_role || 'owner',
        }).select().single();
        if (error) throw new Error(error.message);

        if (confirm_client_access) {
          const { data: existingAsg } = await vsb.from('valuation_assignments')
            .select('id').eq('valuation_id', valuation_id)
            .eq('assigned_profile_id', profile_id)
            .eq('assignment_role', 'owner').maybeSingle();
          if (!existingAsg) {
            await vsb.from('valuation_assignments').insert({
              valuation_id, assigned_profile_id: profile_id,
              assignment_role: 'owner',
              can_view: true, can_edit: false, can_review: false, can_publish: false,
              can_create_valuation: false, can_restore_valuation: false,
              can_archive_valuation: false, can_manage_assignments: false,
              assigned_by_profile_id: profileId,
            });
          }
        }

        await appendAudit(valuation_id, 'assigned', null, { business_owner_assigned: profile_id, is_primary_owner, is_control_person }, { action: 'business_owner_assigned' });
        const summary = await buildAccessSummary(valuation_id);
        return Response.json({ owner, access: summary });
      } catch (e) { return Response.json({ error: e.message }, { status: e.status || 403 }); }
    }

    // ── updateBusinessOwner ───────────────────────────────────────────────
    if (action === 'updateBusinessOwner') {
      const { valuation_id, profile_id, ownership_percentage, is_primary_owner, is_control_person, owner_role } = data;
      if (!valuation_id || !profile_id) {
        return Response.json({ error: 'valuation_id and profile_id required' }, { status: 400 });
      }
      try {
        const ctx = await loadValuationContext(valuation_id);
        if (!isSuperAdmin) {
          if (!ctx.assignment || !ctx.assignment.can_manage_assignments) {
            return Response.json({ error: 'PERMISSION_DENIED' }, { status: 403 });
          }
        }
        const businessId = ctx.valuation.business_id;

        const updates = {};
        if (ownership_percentage !== undefined) updates.ownership_percentage = ownership_percentage;
        if (is_control_person !== undefined) updates.is_control_person = is_control_person;
        if (owner_role !== undefined) updates.owner_role = owner_role;
        if (is_primary_owner !== undefined) {
          if (is_primary_owner) {
            await sb.from('business_owners')
              .update({ is_primary_owner: false })
              .eq('business_id', businessId).eq('is_primary_owner', true);
          }
          updates.is_primary_owner = is_primary_owner;
        }

        const { data: updated, error } = await sb.from('business_owners')
          .update(updates).eq('business_id', businessId).eq('profile_id', profile_id).select().single();
        if (error) throw new Error(error.message);

        await appendAudit(valuation_id, 'updated', null, { business_owner_updated: profile_id, updates }, { action: 'business_owner_updated' });
        const summary = await buildAccessSummary(valuation_id);
        return Response.json({ owner: updated, access: summary });
      } catch (e) { return Response.json({ error: e.message }, { status: e.status || 403 }); }
    }

    // ── setPrimaryBusinessOwner ────────────────────────────────────────────
    if (action === 'setPrimaryBusinessOwner') {
      const { valuation_id, profile_id } = data;
      if (!valuation_id || !profile_id) {
        return Response.json({ error: 'valuation_id and profile_id required' }, { status: 400 });
      }
      try {
        const ctx = await loadValuationContext(valuation_id);
        if (!isSuperAdmin) {
          if (!ctx.assignment || !ctx.assignment.can_manage_assignments) {
            return Response.json({ error: 'PERMISSION_DENIED' }, { status: 403 });
          }
        }
        const businessId = ctx.valuation.business_id;

        await sb.from('business_owners')
          .update({ is_primary_owner: false })
          .eq('business_id', businessId).eq('is_primary_owner', true);
        const { data: updated, error } = await sb.from('business_owners')
          .update({ is_primary_owner: true })
          .eq('business_id', businessId).eq('profile_id', profile_id).select().single();
        if (error) throw new Error(error.message);

        await appendAudit(valuation_id, 'updated', null, { primary_owner_changed: profile_id }, { action: 'primary_owner_changed' });
        const summary = await buildAccessSummary(valuation_id);
        return Response.json({ owner: updated, access: summary });
      } catch (e) { return Response.json({ error: e.message }, { status: e.status || 403 }); }
    }

    // ── setLeadAdvisor ────────────────────────────────────────────────────
    if (action === 'setLeadAdvisor') {
      const { valuation_id, advisor_profile_id } = data;
      if (!valuation_id || !advisor_profile_id) {
        return Response.json({ error: 'valuation_id and advisor_profile_id required' }, { status: 400 });
      }
      try {
        await requireAssignmentManagement(profile, valuation_id);

        const { data: advisor } = await sb.from('profiles')
          .select('id, app_role').eq('id', advisor_profile_id).maybeSingle();
        if (!advisor) return Response.json({ error: 'ADVISOR_PROFILE_NOT_FOUND' }, { status: 404 });

        const { data: existingAsg } = await vsb.from('valuation_assignments')
          .select('id').eq('valuation_id', valuation_id)
          .eq('assigned_profile_id', advisor_profile_id)
          .is('removed_at', null).maybeSingle();

        let assignment;
        if (existingAsg) {
          const { data: updated, error } = await vsb.from('valuation_assignments')
            .update({
              assignment_role: 'lead',
              can_view: true, can_edit: true, can_review: true, can_publish: true,
              can_create_valuation: true, can_restore_valuation: true,
              can_archive_valuation: true, can_manage_assignments: true,
              updated_at: new Date().toISOString(),
            }).eq('id', existingAsg.id).select().single();
          if (error) throw new Error(error.message);
          assignment = updated;
        } else {
          const { data: created, error } = await vsb.from('valuation_assignments').insert({
            valuation_id, assigned_profile_id: advisor_profile_id,
            assignment_role: 'lead',
            can_view: true, can_edit: true, can_review: true, can_publish: true,
            can_create_valuation: true, can_restore_valuation: true,
            can_archive_valuation: true, can_manage_assignments: true,
            assigned_by_profile_id: profileId,
          }).select().single();
          if (error) throw new Error(error.message);
          assignment = created;
        }

        await vsb.from('valuation_assignments')
          .update({ assignment_role: 'contributor' })
          .eq('valuation_id', valuation_id)
          .eq('assignment_role', 'lead')
          .neq('id', assignment.id)
          .is('removed_at', null);

        await vsb.from('business_valuations')
          .update({ lead_advisor_profile_id: advisor_profile_id, updated_by_profile_id: profileId })
          .eq('id', valuation_id);

        await appendAudit(valuation_id, 'assigned', null, { lead_advisor: advisor_profile_id }, { action: 'lead_advisor_changed' });
        const summary = await buildAccessSummary(valuation_id);
        return Response.json({ assignment, access: summary });
      } catch (e) { return Response.json({ error: e.message }, { status: e.status || 403 }); }
    }

    // ── getEligibleAdvisors ───────────────────────────────────────────────
    if (action === 'getEligibleAdvisors') {
      const { valuation_id, search_term } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      try {
        await requireValuationView(profile, valuation_id);
      } catch (e) { return Response.json({ error: e.message }, { status: e.status || 403 }); }

      const { data: currentAsgs } = await vsb.from('valuation_assignments')
        .select('assigned_profile_id, assignment_role')
        .eq('valuation_id', valuation_id).is('removed_at', null);
      const assignedMap = {};
      (currentAsgs || []).forEach((a) => { assignedMap[a.assigned_profile_id] = a.assignment_role; });

      const advisorRoles = ['expert_advisor', 'admin', 'super_admin', 'advisor'];
      let q = sb.from('profiles')
        .select('id, first_name, last_name, email, app_role, primary_business_id')
        .in('app_role', advisorRoles)
        .order('last_name', { ascending: true }).limit(100);
      if (search_term) {
        q = q.or(`first_name.ilike.%${search_term}%,last_name.ilike.%${search_term}%,email.ilike.%${search_term}%`);
      }
      const { data: profiles } = await q;

      const profileIds = (profiles || []).map((p) => p.id);
      let expertMeta = [];
      let workload = [];
      try {
        const eRes = await sb.from('expert_profiles')
          .select('application_id, name, title, company_name, specialties')
          .in('application_id', profileIds);
        expertMeta = eRes.data || [];
        const wRes = await vsb.from('valuation_assignments')
          .select('assigned_profile_id')
          .in('assigned_profile_id', profileIds)
          .is('removed_at', null);
        workload = wRes.data || [];
      } catch { /* non-fatal */ }

      const workloadMap = {};
      (workload || []).forEach((w) => {
        workloadMap[w.assigned_profile_id] = (workloadMap[w.assigned_profile_id] || 0) + 1;
      });

      const expertMap = {};
      (expertMeta || []).forEach((e) => { expertMap[e.application_id] = e; });

      const eligible = (profiles || []).map((p) => ({
        profile_id: p.id,
        first_name: p.first_name || '',
        last_name: p.last_name || '',
        full_name: [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || 'Unknown',
        email: p.email || '',
        app_role: p.app_role || '',
        primary_business_id: p.primary_business_id || null,
        current_assignment_role: assignedMap[p.id] || null,
        expert_metadata: expertMap[p.id] || null,
        current_workload: workloadMap[p.id] || 0,
      }));

      return Response.json({ eligible_advisors: eligible });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    const status = error.status || 500;
    return Response.json({ error: error.message }, { status });
  }
}