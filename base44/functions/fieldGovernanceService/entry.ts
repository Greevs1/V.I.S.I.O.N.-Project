/**
 * fieldGovernanceService — Field-Level Governance & Advisor Ownership
 *
 * Additive layer over the certified Valuation Engine. Manages per-field
 * ownership metadata (owner, lock status, last modified, reason, source of
 * truth, confidence) and change requests from read-only users.
 *
 * AI never writes directly to valuation data. AI recommendations are stored
 * as governance records with ai_recommendation_status = 'pending' and must
 * be explicitly approved, rejected, or modified by an authorized advisor.
 *
 * Permissions (enforced via shared valuationAuth module):
 *   - Business Owners: read-only (view governance, request changes)
 *   - Assigned Advisors: edit (upsert, lock, unlock, review change requests)
 *   - Lead Advisors: inherit Assigned Advisor permissions
 *   - Super Admins: unrestricted
 *
 * All entity CRUD uses base44.asServiceRole (bypasses entity RLS); the
 * backend function is the sole enforcement point. No calculation,
 * publication, versioning, or audit logic from valuationService is altered.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveAuthCtx, loadValuationContext } from '../../shared/valuationEngine/valuationAuth.ts';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const ctx = await resolveAuthCtx(base44);
    const { sb, profile, profileId, isSuperAdmin } = ctx;

    const body = await req.json().catch(() => ({}));
    const { action, data = {} } = body;

    const ownerName =
      `${profile.first_name || ''} ${profile.last_name || ''}`.trim() ||
      profile.email ||
      'Advisor';

    // ── Permission helpers ────────────────────────────────────────────────
    // View: super_admin, business owner, or assigned advisor with can_view.
    const requireView = async (valuationId) => {
      const ctxVal = await loadValuationContext(ctx, valuationId);
      if (isSuperAdmin) return ctxVal;
      // Business owner — read-only access
      const { data: bo } = await sb
        .from('business_owners')
        .select('business_id')
        .eq('business_id', ctxVal.valuation.business_id)
        .eq('profile_id', profileId)
        .maybeSingle();
      if (bo) return { ...ctxVal, isOwner: true };
      if (!ctxVal.assignment || !ctxVal.assignment.can_view) {
        throw Object.assign(new Error('PERMISSION_DENIED'), { status: 403 });
      }
      return ctxVal;
    };

    // Edit: super_admin or assigned advisor with can_edit. Owners cannot edit.
    const requireEdit = async (valuationId) => {
      const ctxVal = await loadValuationContext(ctx, valuationId);
      if (isSuperAdmin) return ctxVal;
      if (ctxVal.valuation.status === 'archived') {
        throw Object.assign(new Error('VALUATION_ARCHIVED'), { status: 400 });
      }
      if (!ctxVal.assignment || !ctxVal.assignment.can_edit) {
        throw Object.assign(new Error('PERMISSION_DENIED'), { status: 403 });
      }
      return ctxVal;
    };

    const svc = base44.asServiceRole.entities;
    const now = () => new Date().toISOString();

    // ── GET FIELD GOVERNANCE ──────────────────────────────────────────────
    if (action === 'getFieldGovernance') {
      const { valuation_id } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireView(valuation_id);
      const records = await svc.ValuationFieldGovernance.filter({ valuation_id });
      return Response.json({ records: records || [] });
    }

    // ── UPSERT FIELD GOVERNANCE ───────────────────────────────────────────
    // Creates or updates a field governance record. Only authorized advisors
    // may call this. AI recommendations are stored with ai_recommendation_status
    // = 'pending' and must be approved before the field is considered verified.
    if (action === 'upsertFieldGovernance') {
      const { valuation_id, field_key, ...fields } = data;
      if (!valuation_id || !field_key) {
        return Response.json({ error: 'valuation_id and field_key required' }, { status: 400 });
      }
      await requireEdit(valuation_id);
      const existing = await svc.ValuationFieldGovernance.filter({ valuation_id, field_key });
      const base = {
        ...fields,
        valuation_id,
        field_key,
        last_modified_by_id: profileId,
        last_modified_by_name: ownerName,
        last_modified_at: now(),
      };
      if (existing && existing.length > 0) {
        const updated = await svc.ValuationFieldGovernance.update(existing[0].id, base);
        return Response.json({ record: updated });
      }
      // Create — default owner and lock state
      base.current_owner_id = base.current_owner_id || profileId;
      base.current_owner_name = base.current_owner_name || ownerName;
      base.is_locked = base.is_locked !== undefined ? base.is_locked : true;
      if (base.is_locked) {
        base.locked_by_id = profileId;
        base.locked_by_name = ownerName;
        base.locked_at = now();
      }
      const created = await svc.ValuationFieldGovernance.create(base);
      return Response.json({ record: created });
    }

    // ── LOCK FIELD ────────────────────────────────────────────────────────
    if (action === 'lockField') {
      const { valuation_id, field_key, reason } = data;
      if (!valuation_id || !field_key) {
        return Response.json({ error: 'valuation_id and field_key required' }, { status: 400 });
      }
      await requireEdit(valuation_id);
      const existing = await svc.ValuationFieldGovernance.filter({ valuation_id, field_key });
      if (!existing || existing.length === 0) {
        return Response.json({ error: 'FIELD_NOT_FOUND' }, { status: 404 });
      }
      const updated = await svc.ValuationFieldGovernance.update(existing[0].id, {
        is_locked: true,
        locked_by_id: profileId,
        locked_by_name: ownerName,
        locked_at: now(),
        last_modified_by_id: profileId,
        last_modified_by_name: ownerName,
        last_modified_at: now(),
        change_reason: reason || 'Field locked',
      });
      return Response.json({ record: updated });
    }

    // ── UNLOCK FIELD ──────────────────────────────────────────────────────
    if (action === 'unlockField') {
      const { valuation_id, field_key, reason } = data;
      if (!valuation_id || !field_key) {
        return Response.json({ error: 'valuation_id and field_key required' }, { status: 400 });
      }
      await requireEdit(valuation_id);
      const existing = await svc.ValuationFieldGovernance.filter({ valuation_id, field_key });
      if (!existing || existing.length === 0) {
        return Response.json({ error: 'FIELD_NOT_FOUND' }, { status: 404 });
      }
      const updated = await svc.ValuationFieldGovernance.update(existing[0].id, {
        is_locked: false,
        last_modified_by_id: profileId,
        last_modified_by_name: ownerName,
        last_modified_at: now(),
        change_reason: reason || 'Field unlocked',
      });
      return Response.json({ record: updated });
    }

    // ── REQUEST CHANGE (read-only users) ─────────────────────────────────
    // Business owners and viewers may request changes to locked fields.
    // Requests are reviewed by an authorized advisor.
    if (action === 'requestChange') {
      const {
        valuation_id, field_key, field_display_name,
        current_value_summary, proposed_value_summary, reason,
      } = data;
      if (!valuation_id || !field_key || !reason) {
        return Response.json({ error: 'valuation_id, field_key, and reason required' }, { status: 400 });
      }
      const ctxVal = await requireView(valuation_id);
      const reqRole =
        profile.app_role === 'owner' ? 'owner'
        : profile.app_role === 'team_member' ? 'team_member'
        : 'viewer';
      const created = await svc.ValuationChangeRequest.create({
        valuation_id,
        business_id: ctxVal.valuation.business_id,
        field_key,
        field_display_name: field_display_name || field_key,
        requestor_id: profileId,
        requestor_name: ownerName,
        requestor_role: reqRole,
        current_value_summary: current_value_summary || null,
        proposed_value_summary: proposed_value_summary || null,
        reason,
        status: 'pending',
      });
      return Response.json({ record: created });
    }

    // ── GET CHANGE REQUESTS ───────────────────────────────────────────────
    if (action === 'getChangeRequests') {
      const { valuation_id } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireView(valuation_id);
      const records = await svc.ValuationChangeRequest.filter({ valuation_id });
      return Response.json({ records: records || [] });
    }

    // ── REVIEW CHANGE REQUEST ─────────────────────────────────────────────
    // Authorized advisors approve or reject change requests from read-only users.
    if (action === 'reviewChangeRequest') {
      const { request_id, decision, review_notes } = data;
      if (!request_id || !['approved', 'rejected'].includes(decision)) {
        return Response.json({ error: 'request_id and decision (approved|rejected) required' }, { status: 400 });
      }
      const reqs = await svc.ValuationChangeRequest.filter({ id: request_id });
      if (!reqs || reqs.length === 0) {
        return Response.json({ error: 'NOT_FOUND' }, { status: 404 });
      }
      const cr = reqs[0];
      await requireEdit(cr.valuation_id);
      const updated = await svc.ValuationChangeRequest.update(request_id, {
        status: decision,
        reviewer_id: profileId,
        reviewer_name: ownerName,
        reviewed_at: now(),
        review_notes: review_notes || null,
      });
      return Response.json({ record: updated });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    const status = error.status || 500;
    return Response.json({ error: error.message }, { status });
  }
}