/**
 * documentAssignments — THE ONE CONTRACT for document ↔ team-member assignments.
 *
 * The Data Room UI and any future Galileo action both call THIS function; there
 * is no second assignment path (§16).
 *
 * AUTHORIZATION — the Phase 6 sequence, in order:
 *
 *   AUTHENTICATE            → authenticateActor()   (session only, never the body)
 *   RESOLVE BUSINESS        → resolveActiveBusiness()(explicit context, or the
 *                             unambiguous single-business default; a
 *                             multi-business account with no context is REFUSED)
 *   AUTHORIZE THE ACTOR     → validateBusinessScope() (the same rule
 *                             can_access_business() enforces, and the reason it
 *                             returns decides who may MANAGE assignments)
 *   VERIFY THE RESOURCE     → the document must belong to that business
 *   VERIFY THE ASSIGNEE     → the assignee must ALREADY be authorized for that
 *                             business (§12 — assignment grants nothing new)
 *   then, and only then,    → service-role read/write
 *
 * Business isolation (§13/§26) has no UI dependency: business_id comes from the
 * resolved context, document_id is checked against the document's own row, the
 * assignee is proved against the business, and every update addresses a row
 * WITH the business filter — so a forged assignment_id from another business is
 * a 404, not a write.
 *
 * ASSIGNMENT vs EXTRACTION REVIEW (§11): completing an assignment writes to
 * document_assignments ONLY. It never accepts an extracted field, verifies a
 * figure, or promotes anything into BIS.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  authenticateActor,
  errorResponse,
  HttpError,
} from '../../shared/authz/actor.ts';
// The canonical resolution + the guard that mirrors can_access_business().
import { resolveActiveBusiness } from '../../shared/businessScope/activeBusiness.ts';
import { validateBusinessScope } from '../../shared/businessScope/writeGuard.ts';

const ASSIGNMENT_TYPES = ['review', 'action_required', 'fyi'];
const OPEN_STATUSES = ['open', 'completed']; // 'removed' is history, never shown as current

/** Authorization reasons that carry the right to MANAGE assignments (§14). */
const MANAGER_REASON = /owner|advisor|super_admin/;

function supabase() {
  const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
  const url = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Supabase not configured');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function displayName(profile: any): string {
  if (!profile) return 'Unknown';
  return (
    [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() ||
    profile.email ||
    'Unknown'
  );
}

/**
 * The business's AUTHORIZED people — the only people who can ever be assigned
 * something here. Derived from the membership model itself (not from a
 * client-supplied list), so a member of another business simply is not in it.
 */
async function loadRoster(sb: any, businessId: string) {
  const [business, owners, team] = await Promise.all([
    sb.from('business_entities').select('id, profile_id, assigned_advisor_id').eq('id', businessId).maybeSingle(),
    sb.from('business_owners').select('profile_id, ownership_role').eq('business_id', businessId),
    sb.from('business_team_members').select('profile_id').eq('business_id', businessId),
  ]);

  const ids = new Set<string>();
  const roles = new Map<string, string>();

  if (business.data?.profile_id) {
    ids.add(business.data.profile_id);
    roles.set(business.data.profile_id, 'Owner');
  }
  if (business.data?.assigned_advisor_id) {
    ids.add(business.data.assigned_advisor_id);
    roles.set(business.data.assigned_advisor_id, 'Advisor');
  }
  for (const row of owners.data || []) {
    if (row.profile_id && !ids.has(row.profile_id)) {
      ids.add(row.profile_id);
      roles.set(row.profile_id, row.ownership_role ? `Owner (${row.ownership_role})` : 'Owner');
    }
  }
  for (const row of team.data || []) {
    if (row.profile_id && !roles.has(row.profile_id)) {
      ids.add(row.profile_id);
      roles.set(row.profile_id, 'Team member');
    }
  }

  if (ids.size === 0) return [];

  const { data: profiles } = await sb
    .from('profiles')
    .select('id, first_name, last_name, email, app_role, base44_user_id')
    .in('id', Array.from(ids));

  return (profiles || [])
    .map((p: any) => ({
      profile_id: p.id,
      full_name: displayName(p),
      email: p.email || '',
      initials: displayName(p).split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase(),
      role_label: roles.get(p.id) || 'Team member',
      has_platform_account: !!p.base44_user_id,
    }))
    .sort((a: any, b: any) => a.full_name.localeCompare(b.full_name));
}

/** Enrich assignment rows with the document + the people involved. */
async function decorate(sb: any, rows: any[]) {
  const list = rows || [];
  if (list.length === 0) return [];

  const profileIds = Array.from(
    new Set(
      list.flatMap((r) => [r.assignee_profile_id, r.assigned_by_profile_id, r.completed_by_profile_id]).filter(Boolean)
    )
  );
  const documentIds = Array.from(new Set(list.map((r) => r.document_id).filter(Boolean)));

  const [profiles, documents] = await Promise.all([
    profileIds.length
      ? sb.from('profiles').select('id, first_name, last_name, email').in('id', profileIds)
      : Promise.resolve({ data: [] }),
    documentIds.length
      ? sb.from('documents').select('id, name, document_type, upload_status').in('id', documentIds)
      : Promise.resolve({ data: [] }),
  ]);

  const pMap = new Map((profiles.data || []).map((p: any) => [p.id, p]));
  const dMap = new Map((documents.data || []).map((d: any) => [d.id, d]));

  return list.map((r) => {
    const assignee = pMap.get(r.assignee_profile_id);
    const assigner = pMap.get(r.assigned_by_profile_id);
    return {
      id: r.id,
      business_id: r.business_id,
      document_id: r.document_id,
      document_name: dMap.get(r.document_id)?.name || null,
      document_type: dMap.get(r.document_id)?.document_type || null,
      assignee_profile_id: r.assignee_profile_id,
      assignee_name: displayName(assignee),
      assignee_email: assignee?.email || null,
      assignment_type: r.assignment_type,
      status: r.status,
      note: r.note || null,
      assigned_by_profile_id: r.assigned_by_profile_id,
      assigned_by_name: displayName(assigner),
      assigned_at: r.assigned_at,
      completed_at: r.completed_at,
      completed_by_name: r.completed_by_profile_id ? displayName(pMap.get(r.completed_by_profile_id)) : null,
      removed_at: r.removed_at,
    };
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const sb = supabase();

    // ── AUTHENTICATE (session only) ─────────────────────────────────────────
    const actor = await authenticateActor(base44, sb);

    const body = await req.json().catch(() => ({}));
    const { action, data = {} } = body;

    // ── RESOLVE + AUTHORIZE THE BUSINESS ────────────────────────────────────
    const { business_id: businessId } = await resolveActiveBusiness(
      sb,
      actor.profile,
      data?.active_business_id || data?.business_id,
      { action: `documentAssignments.${action}` }
    );

    if (!businessId) throw new HttpError(400, 'An active business is required');

    // Access (and the reason, which decides manage rights) — one rule, the same
    // one RLS enforces. Admins are authorized by standing, not by the body.
    let reason = actor.isAdmin ? 'super_admin' : 'unknown';
    if (!actor.isAdmin) {
      if (!actor.profile_id) throw new HttpError(403, 'Forbidden: no access to that business');
      try {
        const scope = await validateBusinessScope(sb, businessId, actor.profile_id);
        reason = scope.authorization_reason;
      } catch {
        throw new HttpError(403, 'Forbidden: no access to that business');
      }
    }
    const canManage = actor.isAdmin || MANAGER_REASON.test(reason);
    const meProfileId = actor.profile_id;

    // ── ROSTER — who MAY be assigned something in this business (§4/§12) ────
    if (action === 'roster') {
      const roster = await loadRoster(sb, businessId);
      return Response.json({
        roster,
        me: { profile_id: meProfileId, can_manage: canManage, authorization: reason },
      });
    }

    // ── READ: every current assignment in this business ─────────────────────
    if (action === 'listForBusiness') {
      const { data: rows, error } = await sb
        .from('document_assignments')
        .select('*')
        .eq('business_id', businessId) // scoped by the RESOLVED business, never the body
        .in('status', OPEN_STATUSES)
        .order('assigned_at', { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);

      return Response.json({
        assignments: await decorate(sb, rows || []),
        me: { profile_id: meProfileId, can_manage: canManage, authorization: reason },
      });
    }

    // ── READ: one document's assignments ────────────────────────────────────
    if (action === 'forDocument') {
      const documentId = data?.document_id;
      if (!documentId) throw new HttpError(400, 'document_id is required');
      await assertDocumentInBusiness(sb, documentId, businessId);

      const { data: rows, error } = await sb
        .from('document_assignments')
        .select('*')
        .eq('business_id', businessId)
        .eq('document_id', documentId)
        .in('status', OPEN_STATUSES)
        .order('assigned_at', { ascending: true });
      if (error) throw new Error(error.message);

      return Response.json({
        assignments: await decorate(sb, rows || []),
        me: { profile_id: meProfileId, can_manage: canManage, authorization: reason },
      });
    }

    // ── READ: what is waiting on ME in this business (§9) ───────────────────
    if (action === 'listMine') {
      if (!meProfileId) throw new HttpError(403, 'No profile for this account');
      const { data: rows, error } = await sb
        .from('document_assignments')
        .select('*')
        .eq('business_id', businessId)
        .eq('assignee_profile_id', meProfileId)
        .in('status', OPEN_STATUSES)
        .order('assigned_at', { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);

      return Response.json({
        assignments: await decorate(sb, rows || []),
        me: { profile_id: meProfileId, can_manage: canManage, authorization: reason },
      });
    }

    // ── ASSIGN (one or many people, independently trackable — §5) ───────────
    if (action === 'assign') {
      if (!canManage) throw new HttpError(403, 'Only an owner or advisor can assign documents');

      const documentId = data?.document_id;
      const assigneeIds: string[] = Array.isArray(data?.assignee_profile_ids)
        ? data.assignee_profile_ids.filter(Boolean)
        : [data?.assignee_profile_id].filter(Boolean);
      const assignmentType = ASSIGNMENT_TYPES.includes(data?.assignment_type)
        ? data.assignment_type
        : 'review';
      const note = typeof data?.note === 'string' ? data.note.trim().slice(0, 500) : null;

      if (!documentId) throw new HttpError(400, 'document_id is required');
      if (assigneeIds.length === 0) throw new HttpError(400, 'At least one assignee is required');

      const document = await assertDocumentInBusiness(sb, documentId, businessId);
      const roster = new Map((await loadRoster(sb, businessId)).map((p: any) => [p.profile_id, p]));

      const now = new Date().toISOString();
      const created: any[] = [];

      for (const assigneeId of assigneeIds) {
        // The assignee must ALREADY be authorized for THIS business. A member of
        // another business is refused here, and the roster only ever contains
        // this business's people (§13/§26).
        if (!roster.has(assigneeId)) {
          throw new HttpError(403, 'That person does not have access to this business');
        }
        try {
          await validateBusinessScope(sb, businessId, assigneeId);
        } catch {
          throw new HttpError(403, 'That person does not have access to this business');
        }

        const { data: row, error } = await sb
          .from('document_assignments')
          .upsert(
            {
              business_id: businessId,
              document_id: documentId,
              assignee_profile_id: assigneeId,
              assignment_type: assignmentType,
              status: 'open',
              note,
              assigned_by_profile_id: meProfileId,
              assigned_at: now,
              completed_at: null,
              completed_by_profile_id: null,
              removed_at: null,
              removed_by_profile_id: null,
              updated_at: now,
            },
            { onConflict: 'document_id,assignee_profile_id' }
          )
          .select('*')
          .single();

        if (error) throw new Error(error.message);
        created.push(row);
      }

      // Notify through the EXISTING notification system (preference-aware).
      // Non-blocking, and honest: if the person has no platform account yet the
      // assignment still appears under "Assigned to Me" when they arrive (§17).
      // The upsert's own rows carry each assignee's assignment id, so the
      // notification can reference the assignment itself (and a re-assignment
      // revives the SAME row, so the id stays true — §28).
      const assignmentIds = new Map(created.map((row: any) => [row.assignee_profile_id, row.id]));

      notifyAssignees(base44, {
        roster,
        assigneeIds,
        actor,
        businessId,
        document,
        assignmentType,
        note,
        assignmentIds,
      }).catch(() => {});

      return Response.json({
        success: true,
        assignments: await decorate(sb, created),
      });
    }

    // ── COMPLETE / REOPEN (the assignee's own action — §10) ─────────────────
    if (action === 'setStatus') {
      const assignmentId = data?.assignment_id;
      const nextStatus = data?.status;
      if (!assignmentId) throw new HttpError(400, 'assignment_id is required');
      if (!['completed', 'open'].includes(nextStatus)) {
        throw new HttpError(400, 'status must be completed or open');
      }

      // The row is addressed WITH the business filter: a forged id belonging to
      // another business is a 404, never a write (§26 M).
      const { data: existing } = await sb
        .from('document_assignments')
        .select('*')
        .eq('id', assignmentId)
        .eq('business_id', businessId)
        .maybeSingle();
      if (!existing) throw new HttpError(404, 'Assignment not found');
      if (existing.status === 'removed') throw new HttpError(409, 'That assignment was removed');

      // FYI carries no completion: there is no reliable "seen" signal in this
      // system, so recording one would be fabricated state (§8). The UI never
      // offers it — the contract enforces it, so the invariant does not depend
      // on which client is calling.
      if (existing.assignment_type === 'fyi') {
        throw new HttpError(409, 'Reference assignments have no completion state');
      }

      const isAssignee = existing.assignee_profile_id === meProfileId;
      if (!isAssignee && !canManage) throw new HttpError(403, 'Only the assignee can complete this');

      const now = new Date().toISOString();
      const { data: row, error } = await sb
        .from('document_assignments')
        .update(
          nextStatus === 'completed'
            ? { status: 'completed', completed_at: now, completed_by_profile_id: meProfileId, updated_at: now }
            : { status: 'open', completed_at: null, completed_by_profile_id: null, updated_at: now }
        )
        .eq('id', assignmentId)
        .eq('business_id', businessId)
        .select('*')
        .single();
      if (error) throw new Error(error.message);

      return Response.json({ success: true, assignments: await decorate(sb, [row]) });
    }

    // ── REMOVE (soft — history is preserved, §20/§28) ───────────────────────
    if (action === 'remove') {
      if (!canManage) throw new HttpError(403, 'Only an owner or advisor can remove an assignment');
      const assignmentId = data?.assignment_id;
      if (!assignmentId) throw new HttpError(400, 'assignment_id is required');

      const { data: existing } = await sb
        .from('document_assignments')
        .select('id')
        .eq('id', assignmentId)
        .eq('business_id', businessId)
        .maybeSingle();
      if (!existing) throw new HttpError(404, 'Assignment not found');

      const now = new Date().toISOString();
      const { error } = await sb
        .from('document_assignments')
        .update({ status: 'removed', removed_at: now, removed_by_profile_id: meProfileId, updated_at: now })
        .eq('id', assignmentId)
        .eq('business_id', businessId);
      if (error) throw new Error(error.message);

      return Response.json({ success: true, assignment_id: assignmentId, status: 'removed' });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
});

/**
 * The document must belong to THIS business. A document that belongs nowhere
 * (a profile/household document with no business_id) is refused rather than
 * guessed at: an assignment is business-scoped by contract (§13), and inventing
 * a scope would be the silent expansion this feature must not do.
 */
async function assertDocumentInBusiness(sb: any, documentId: string, businessId: string) {
  const { data: document, error } = await sb
    .from('documents')
    .select('id, name, document_type, business_id')
    .eq('id', documentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!document) throw new HttpError(404, 'Document not found');
  if (!document.business_id) {
    throw new HttpError(409, 'This document is not held by a business, so it cannot be assigned');
  }
  if (document.business_id !== businessId) {
    throw new HttpError(403, 'That document does not belong to the active business');
  }
  return document;
}

/**
 * In-app notification via the EXISTING notification service (so the recipient's
 * preferences are honoured). Email is whatever that service already does for
 * this type — nothing new is claimed here.
 */
async function notifyAssignees(
  base44: any,
  { roster, assigneeIds, actor, businessId, document, assignmentType, note, assignmentIds }: any
) {
  const TYPE_LABEL: Record<string, string> = {
    review: 'review',
    action_required: 'action required',
    fyi: 'reference',
  };
  const assignerName =
    [actor?.profile?.first_name, actor?.profile?.last_name].filter(Boolean).join(' ') ||
    actor?.profile?.email ||
    actor?.user?.full_name ||
    actor?.user?.email ||
    'Your team';

  for (const assigneeId of assigneeIds) {
    const person = roster.get(assigneeId);
    if (!person?.has_platform_account || !person.email) continue;

    try {
      const assigneeUser = person.profile_id;
      // Resolve the Base44 user for this profile through the profiles table.
      const userRows = await base44.asServiceRole.entities.User.filter({ email: person.email });
      const recipient = userRows?.[0];
      if (!recipient) continue;

      const assignmentId = assignmentIds?.get(assigneeId) || null;

      await base44.functions.invoke('notificationService', {
        action: 'createNotification',
        data: {
          recipient_id: recipient.id,
          recipient_profile_id: assigneeUser,
          sender_id: actor.user?.id || null,
          business_id: businessId,
          notification_type: 'document_assigned',
          title: assignmentType === 'fyi' ? 'A document was shared with you' : 'A document needs you',
          message:
            assignmentType === 'fyi'
              ? `${assignerName} shared "${document.name}" with you for reference.`
              : `${assignerName} assigned you "${document.name}" for ${TYPE_LABEL[assignmentType]}.${
                  note ? ` ${note}` : ''
                }`,
          related_entity_type: 'Document',
          related_entity_id: document.id,
          // A REAL deep link: the existing Galileo Data Room overlay, the exact
          // document inside it, and the library one step behind so Back returns
          // to the Data Room instead of leaving Vision. The business is resolved
          // by this notification's own business_id before anything opens.
          action_url: `/galileo?workspace=data-room&from=data-room&id=${document.id}`,
          // IDs are navigation (the resolver reads these); the title and message
          // above stay presentation.
          metadata: {
            kind: 'document_assignment',
            document_id: document.id,
            assignment_id: assignmentId,
            business_id: businessId,
            assignment_type: assignmentType,
          },
          priority: assignmentType === 'fyi' ? 'low' : 'high',
          recipient_email: person.email,
        },
      });
    } catch (e) {
      console.warn('[documentAssignments] notification skipped:', (e as Error)?.message);
    }
  }
}