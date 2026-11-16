/**
 * valuationRequestService — Phase 13.3G.4
 *
 * Owner-submitted valuation requests + admin review/conversion workflow.
 *
 * Actions:
 *   createRequest              — owner submits a valuation request
 *   getMyRequests              — owner fetches their own requests
 *   getRequest                 — fetch a single request (owner or admin)
 *   getAdminRequests           — admin fetches all requests (super_admin)
 *   getAdminSummary            — admin dashboard counts
 *   assignAdminToRequest       — admin self-assigns for review
 *   markRequestViewed          — admin views request (audit + viewed_at)
 *   requestMoreInformation     — admin asks owner for info (waiting_on_owner)
 *   ownerRespond               — owner adds information / responds
 *   withdrawRequest            — owner withdraws before conversion
 *   approveRequest             — admin approves (approved)
 *   declineRequest             — admin declines (requires reason)
 *   closeAsDuplicate           — admin closes as duplicate (requires reason)
 *   convertToValuation         — admin converts approved request → valuation + team
 *   getAdminBusinesses         — admin list of all businesses + valuation availability
 *   getRequestEvents           — audit event log for a request
 *
 * Does NOT modify the certified Valuation Engine. Conversion reuses the same
 * valuation/business_valuations + valuation/valuation_assignments tables and
 * the same assignment permission flags as valuationService.createValuation.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { createClient } from 'npm:@supabase/supabase-js@2';

const VALID_STATUSES = [
  'draft', 'submitted', 'received', 'under_review', 'waiting_on_owner',
  'approved', 'declined', 'converted_to_valuation', 'withdrawn', 'closed',
];

const URGENCY_LABELS = {
  no_immediate: 'No immediate deadline',
  within_90_days: 'Within 90 days',
  within_30_days: 'Within 30 days',
  urgent: 'Urgent',
  target_date: 'Target event date',
};

function getSupabase() {
  const rawUrl = Deno.env.get('VITE_SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!rawUrl || !SERVICE_KEY) throw new Error('Supabase not configured');
  const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const sb = getSupabase();
    const vsb = sb.schema('valuation');
    const body = await req.json().catch(() => ({}));
    const { action, data = {} } = body;

    // ── Identity resolver (same pattern as valuationService) ──────────────
    const resolveCurrentProfile = async () => {
      let profileRow = null;
      if (user.id) {
        const { data: byB44 } = await sb
          .from('profiles')
          .select('id, app_role, email, primary_business_id, base44_user_id, first_name, last_name')
          .eq('base44_user_id', user.id).maybeSingle();
        if (byB44) profileRow = byB44;
      }
      if (!profileRow && user.email) {
        const { data: byEmail } = await sb
          .from('profiles')
          .select('id, app_role, email, primary_business_id, base44_user_id, first_name, last_name')
          .ilike('email', user.email.toLowerCase().trim());
        if (byEmail.length === 1) profileRow = byEmail[0];
        else if (byEmail.length > 1) throw Object.assign(new Error('AMBIGUOUS_PROFILE_MATCH'), { status: 403 });
      }
      if (!profileRow) throw Object.assign(new Error('PROFILE_NOT_FOUND'), { status: 403 });
      return profileRow;
    };

    const profile = await resolveCurrentProfile();
    const profileId = profile.id;
    const isSuperAdmin = profile.app_role === 'super_admin';

    const requireSuperAdmin = () => {
      if (!isSuperAdmin) throw Object.assign(new Error('PERMISSION_DENIED'), { status: 403 });
    };

    // Business ownership check
    const isBusinessOwner = async (businessId) => {
      if (isSuperAdmin) return true;
      const { data: bo } = await sb.from('business_owners')
        .select('business_id').eq('business_id', businessId).eq('profile_id', profileId).maybeSingle();
      if (bo) return true;
      if (profile.primary_business_id === businessId) return true;
      return false;
    };

    // Audit event writer
    const appendRequestEvent = async (requestId, eventType, prevStatus, newStatus, reason, details) => {
      await vsb.from('valuation_request_events').insert({
        request_id: requestId,
        actor_profile_id: profileId,
        event_type: eventType,
        previous_status: prevStatus || null,
        new_status: newStatus || null,
        reason: reason || null,
        event_details: details || {},
      });
    };

    // Notification helper — creates a Notification record (service role bypasses RLS).
    // Never blocks on failure; notifications are best-effort.
    const notify = async (recipientId, type, title, message, meta = {}) => {
      if (!recipientId) return;
      try {
        const category = type.includes('request') || type.includes('information') ? 'action_required' : 'information';
        await base44.asServiceRole.entities.Notification.create({
          recipient_id: recipientId,
          recipient_profile_id: recipientId,
          sender_id: user.id,
          business_id: meta.business_id || null,
          notification_type: type,
          notification_category: category,
          title,
          message,
          related_entity_type: meta.related_entity_type || 'valuation_request',
          related_entity_id: meta.related_entity_id || null,
          action_url: meta.action_url || null,
          priority: meta.priority || 'medium',
        });
      } catch (e) {
        console.log('[valuationRequestService] notification failed (non-fatal):', e.message);
      }
    };

    // Resolve a base44 user id from a profile (for notifications)
    const resolveBase44UserId = async (profId) => {
      if (!profId) return null;
      const { data: p } = await sb.from('profiles')
        .select('base44_user_id, email').eq('id', profId).maybeSingle();
      return p?.base44_user_id || null;
    };

    // ════════════════════════════════════════════════════════════════════════
    // CREATE REQUEST (owner)
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'createRequest') {
      const {
        business_id, request_type, request_reason, desired_timeline,
        target_event_date, transaction_context, valuation_purpose,
        urgency, notes, supporting_document_ids,
      } = data;

      if (!business_id) return Response.json({ error: 'business_id required' }, { status: 400 });

      // Must be a business owner
      const owns = await isBusinessOwner(business_id);
      if (!owns) return Response.json({ error: 'BUSINESS_ACCESS_DENIED' }, { status: 403 });

      // Verify business exists
      const { data: biz } = await sb.from('business_entities')
        .select('id, business_name').eq('id', business_id).maybeSingle();
      if (!biz) return Response.json({ error: 'BUSINESS_NOT_FOUND' }, { status: 404 });

      // Duplicate prevention: no open/approved request for same business + type
      const { data: dup } = await vsb.from('valuation_requests')
        .select('id, status, request_number')
        .eq('business_id', business_id)
        .eq('request_type', request_type || 'new_valuation')
        .in('status', ['submitted', 'received', 'under_review', 'waiting_on_owner', 'approved'])
        .limit(1).maybeSingle();
      if (dup) {
        return Response.json({
          error: 'DUPLICATE_REQUEST',
          existing_request: dup,
        }, { status: 409 });
      }

      // Also check for an active (non-archived) valuation.
      // A new_valuation request cannot be created when an active valuation
      // already exists for the business — prevents duplicate valuations.
      const { data: activeVal } = await vsb.from('business_valuations')
        .select('id, status').eq('business_id', business_id)
        .neq('status', 'archived').limit(1).maybeSingle();
      if (activeVal && (request_type || 'new_valuation') === 'new_valuation') {
        return Response.json({
          error: 'ACTIVE_VALUATION_EXISTS',
          existing_valuation: { id: activeVal.id, status: activeVal.status },
        }, { status: 409 });
      }

      const now = new Date().toISOString();
      const { data: req, error } = await vsb.from('valuation_requests').insert({
        business_id,
        requested_by_profile_id: profileId,
        request_type: request_type || 'new_valuation',
        request_reason: request_reason || null,
        desired_timeline: desired_timeline || null,
        target_event_date: target_event_date || null,
        transaction_context: transaction_context || null,
        valuation_purpose: valuation_purpose || null,
        urgency: urgency || 'no_immediate',
        notes: notes || null,
        supporting_document_ids: supporting_document_ids || [],
        status: 'submitted',
        submitted_at: now,
      }).select().single();
      if (error) throw new Error(error.message);

      await appendRequestEvent(req.id, 'request_submitted', null, 'submitted', null, {
        business_id, request_type: req.request_type, urgency: req.urgency,
      });

      // Notify all super admins
      const { data: admins } = await sb.from('profiles')
        .select('id, base44_user_id, first_name, last_name')
        .eq('app_role', 'super_admin');
      const adminMsg = `New valuation request from ${profile.first_name || ''} ${profile.last_name || ''}`.trim() +
        ` for ${biz.business_name} — ${URGENCY_LABELS[req.urgency] || req.urgency}`;
      for (const a of (admins || [])) {
        const uid = await resolveBase44UserId(a.id);
        await notify(uid, 'valuation_request_received',
          'New Valuation Request',
          adminMsg,
          { business_id, related_entity_id: req.id, action_url: `/admin/business-valuations?request=${req.id}`, priority: req.urgency === 'urgent' ? 'high' : 'medium' }
        );
      }

      return Response.json({ request: req, has_active_valuation: !!activeVal });
    }

    // ════════════════════════════════════════════════════════════════════════
    // GET MY REQUESTS (owner)
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'getMyRequests') {
      const { business_id } = data;
      let q = vsb.from('valuation_requests')
        .select('*').eq('requested_by_profile_id', profileId).order('created_at', { ascending: false });
      if (business_id) q = q.eq('business_id', business_id);
      const { data: reqs, error } = await q.limit(50);
      if (error) throw new Error(error.message);

      // Enrich with business names
      const bizIds = [...new Set((reqs || []).map(r => r.business_id))];
      const { data: bizs } = await sb.from('business_entities')
        .select('id, business_name').in('id', bizIds.length ? bizIds : ['00000000-0000-0000-0000-000000000000']);
      const bizMap = {};
      for (const b of (bizs || [])) bizMap[b.id] = b.business_name;

      const enriched = (reqs || []).map(r => ({ ...r, business_name: bizMap[r.business_id] || 'Unknown' }));
      return Response.json({ requests: enriched });
    }

    // ════════════════════════════════════════════════════════════════════════
    // GET REQUEST (owner or admin)
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'getRequest') {
      const { request_id } = data;
      if (!request_id) return Response.json({ error: 'request_id required' }, { status: 400 });
      const { data: req, error } = await vsb.from('valuation_requests')
        .select('*').eq('id', request_id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!req) return Response.json({ error: 'REQUEST_NOT_FOUND' }, { status: 404 });

      // Authorization: owner of the request or super_admin
      if (!isSuperAdmin && req.requested_by_profile_id !== profileId) {
        const owns = await isBusinessOwner(req.business_id);
        if (!owns) return Response.json({ error: 'PERMISSION_DENIED' }, { status: 403 });
      }

      // Enrich
      const { data: biz } = await sb.from('business_entities')
        .select('id, business_name').eq('id', req.business_id).maybeSingle();
      const { data: requester } = await sb.from('profiles')
        .select('id, first_name, last_name, email').eq('id', req.requested_by_profile_id).maybeSingle();
      const adminRes = req.assigned_admin_profile_id
        ? await sb.from('profiles').select('id, first_name, last_name').eq('id', req.assigned_admin_profile_id).maybeSingle()
        : null;
      const admin = adminRes?.data || null;
      const leadRes = req.assigned_lead_advisor_id
        ? await sb.from('profiles').select('id, first_name, last_name').eq('id', req.assigned_lead_advisor_id).maybeSingle()
        : null;
      const lead = leadRes?.data || null;

      return Response.json({
        request: { ...req, business_name: biz?.business_name, requester, assigned_admin: admin, assigned_lead: lead },
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // GET ADMIN REQUESTS (super_admin)
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'getAdminRequests') {
      requireSuperAdmin();
      const { status_filter, urgency_filter } = data;
      let q = vsb.from('valuation_requests')
        .select('*').order('created_at', { ascending: false });
      if (status_filter && Array.isArray(status_filter) && status_filter.length) {
        q = q.in('status', status_filter);
      }
      if (urgency_filter) q = q.eq('urgency', urgency_filter);
      const { data: reqs, error } = await q.limit(200);
      if (error) throw new Error(error.message);

      const bizIds = [...new Set((reqs || []).map(r => r.business_id))];
      const profIds = [...new Set((reqs || []).flatMap(r => [r.requested_by_profile_id, r.assigned_admin_profile_id, r.assigned_lead_advisor_id].filter(Boolean)))];
      const { data: bizs } = await sb.from('business_entities')
        .select('id, business_name').in('id', bizIds.length ? bizIds : ['00000000-0000-0000-0000-000000000000']);
      const { data: profs } = await sb.from('profiles')
        .select('id, first_name, last_name, email').in('id', profIds.length ? profIds : ['00000000-0000-0000-0000-000000000000']);
      const bizMap = {}; for (const b of (bizs || [])) bizMap[b.id] = b.business_name;
      const profMap = {}; for (const p of (profs || [])) profMap[p.id] = p;

      const enriched = (reqs || []).map(r => ({
        ...r,
        business_name: bizMap[r.business_id] || 'Unknown',
        requester_name: profMap[r.requested_by_profile_id] ? `${profMap[r.requested_by_profile_id].first_name || ''} ${profMap[r.requested_by_profile_id].last_name || ''}`.trim() : 'Unknown',
        assigned_admin_name: profMap[r.assigned_admin_profile_id] ? `${profMap[r.assigned_admin_profile_id].first_name || ''} ${profMap[r.assigned_admin_profile_id].last_name || ''}`.trim() : null,
        assigned_lead_name: profMap[r.assigned_lead_advisor_id] ? `${profMap[r.assigned_lead_advisor_id].first_name || ''} ${profMap[r.assigned_lead_advisor_id].last_name || ''}`.trim() : null,
      }));
      return Response.json({ requests: enriched });
    }

    // ════════════════════════════════════════════════════════════════════════
    // GET ADMIN SUMMARY (super_admin)
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'getAdminSummary') {
      requireSuperAdmin();
      const { count: openReqs } = await vsb.from('valuation_requests')
        .select('*', { count: 'exact', head: true })
        .in('status', ['submitted', 'received', 'under_review']);
      const { count: waitingInfo } = await vsb.from('valuation_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'waiting_on_owner');
      const { count: approved } = await vsb.from('valuation_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'approved');
      const { count: activeVals } = await vsb.from('business_valuations')
        .select('*', { count: 'exact', head: true })
        .in('status', ['not_started', 'in_progress', 'needs_review']);
      const { count: reviewVals } = await vsb.from('business_valuations')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'needs_review');
      const { count: readyPublish } = await vsb.from('business_valuations')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'advisor_approved');
      const { count: published } = await vsb.from('business_valuations')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'published');
      const { count: archived } = await vsb.from('business_valuations')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'archived');

      // Businesses without valuations
      const { data: allBiz } = await sb.from('business_entities')
        .select('id, business_name, assigned_advisor_id').order('business_name');
      const { data: valBiz } = await vsb.from('business_valuations')
        .select('business_id').neq('status', 'archived');
      const valBizSet = new Set((valBiz || []).map(v => v.business_id));
      const bizWithoutVal = (allBiz || []).filter(b => !valBizSet.has(b.id));

      // Valuations needing an advisor (no assignments)
      const { data: activeValRows } = await vsb.from('business_valuations')
        .select('id, business_id, valuation_name, status')
        .in('status', ['not_started', 'in_progress']);
      const activeValIds = (activeValRows || []).map(v => v.id);
      let valsNeedingAdvisor = [];
      if (activeValIds.length) {
        const { data: asgs } = await vsb.from('valuation_assignments')
          .select('valuation_id').in('valuation_id', activeValIds).is('removed_at', null);
        const asgSet = new Set((asgs || []).map(a => a.valuation_id));
        valsNeedingAdvisor = (activeValRows || []).filter(v => !asgSet.has(v.id));
      }

      return Response.json({
        summary: {
          open_requests: openReqs || 0,
          waiting_on_owner: waitingInfo || 0,
          approved_requests: approved || 0,
          businesses_without_valuations: bizWithoutVal.length,
          active_valuations: activeVals || 0,
          valuations_needing_advisor: valsNeedingAdvisor.length,
          valuations_needing_review: reviewVals || 0,
          ready_to_publish: readyPublish || 0,
          recently_published: published || 0,
          archived: archived || 0,
        },
        businesses_without_valuations: bizWithoutVal,
        valuations_needing_advisor: valsNeedingAdvisor,
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // GET ADMIN BUSINESSES (super_admin)
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'getAdminBusinesses') {
      requireSuperAdmin();
      const { data: biz } = await sb.from('business_entities')
        .select('id, business_name, assigned_advisor_id, created_at').order('business_name');
      const { data: vals } = await vsb.from('business_valuations')
        .select('id, business_id, status, valuation_name, created_at');
      const { data: owners } = await sb.from('business_owners')
        .select('business_id, profile_id');
      const { data: profs } = await sb.from('profiles')
        .select('id, first_name, last_name, email');

      const profMap = {}; for (const p of (profs || [])) profMap[p.id] = p;
      const ownersByBiz = {}; for (const o of (owners || [])) {
        if (!ownersByBiz[o.business_id]) ownersByBiz[o.business_id] = [];
        ownersByBiz[o.business_id].push(profMap[o.profile_id]);
      }
      const valsByBiz = {}; for (const v of (vals || [])) {
        if (!valsByBiz[v.business_id]) valsByBiz[v.business_id] = [];
        valsByBiz[v.business_id].push(v);
      }

      const enriched = (biz || []).map(b => ({
        ...b,
        advisor: profMap[b.assigned_advisor_id] || null,
        owners: ownersByBiz[b.id] || [],
        valuations: valsByBiz[b.id] || [],
        has_active_valuation: (valsByBiz[b.id] || []).some(v => v.status !== 'archived'),
      }));
      return Response.json({ businesses: enriched });
    }

    // ════════════════════════════════════════════════════════════════════════
    // ASSIGN ADMIN TO REQUEST (super_admin)
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'assignAdminToRequest') {
      requireSuperAdmin();
      const { request_id } = data;
      if (!request_id) return Response.json({ error: 'request_id required' }, { status: 400 });
      const { data: req } = await vsb.from('valuation_requests')
        .select('id, status, business_id, requested_by_profile_id').eq('id', request_id).maybeSingle();
      if (!req) return Response.json({ error: 'REQUEST_NOT_FOUND' }, { status: 404 });

      const prevStatus = req.status;
      const newStatus = req.status === 'submitted' ? 'under_review' : req.status;
      const { data: updated, error } = await vsb.from('valuation_requests')
        .update({
          assigned_admin_profile_id: profileId,
          status: newStatus,
          viewed_at: newStatus !== req.status ? req.viewed_at : new Date().toISOString(),
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', request_id).select().single();
      if (error) throw new Error(error.message);

      await appendRequestEvent(request_id, 'admin_assigned', prevStatus, newStatus, null, { admin_profile_id: profileId });

      // Notify owner
      const ownerUid = await resolveBase44UserId(req.requested_by_profile_id);
      await notify(ownerUid, 'valuation_request_update',
        'Valuation Request Under Review',
        'An administrator has picked up your valuation request and is reviewing it.',
        { business_id: req.business_id, related_entity_id: request_id, action_url: `/advisory/business-valuation` }
      );

      return Response.json({ request: updated });
    }

    // ════════════════════════════════════════════════════════════════════════
    // MARK REQUEST VIEWED (admin)
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'markRequestViewed') {
      requireSuperAdmin();
      const { request_id } = data;
      if (!request_id) return Response.json({ error: 'request_id required' }, { status: 400 });
      const { data: req } = await vsb.from('valuation_requests')
        .select('id, status, viewed_at').eq('id', request_id).maybeSingle();
      if (!req) return Response.json({ error: 'REQUEST_NOT_FOUND' }, { status: 404 });
      if (req.viewed_at) return Response.json({ request: req });
      const { data: updated } = await vsb.from('valuation_requests')
        .update({ viewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', request_id).select().single();
      await appendRequestEvent(request_id, 'request_viewed', req.status, req.status, null, {});
      return Response.json({ request: updated });
    }

    // ════════════════════════════════════════════════════════════════════════
    // REQUEST MORE INFORMATION (admin → owner)
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'requestMoreInformation') {
      requireSuperAdmin();
      const { request_id, information_requests, admin_notes } = data;
      if (!request_id) return Response.json({ error: 'request_id required' }, { status: 400 });
      if (!Array.isArray(information_requests) || !information_requests.length) {
        return Response.json({ error: 'information_requests required' }, { status: 400 });
      }
      const { data: req } = await vsb.from('valuation_requests')
        .select('id, status, business_id, requested_by_profile_id, additional_information_requested').eq('id', request_id).maybeSingle();
      if (!req) return Response.json({ error: 'REQUEST_NOT_FOUND' }, { status: 404 });

      const prevStatus = req.status;
      const existing = Array.isArray(req.additional_information_requested) ? req.additional_information_requested : [];
      const newItems = information_requests.map(item => ({
        id: crypto.randomUUID(),
        label: item.label,
        detail: item.detail || null,
        requested_at: new Date().toISOString(),
        responded: false,
      }));
      const merged = [...existing, ...newItems];

      const { data: updated, error } = await vsb.from('valuation_requests')
        .update({
          additional_information_requested: merged,
          status: 'waiting_on_owner',
          admin_notes: admin_notes || req.admin_notes,
          updated_at: new Date().toISOString(),
        }).eq('id', request_id).select().single();
      if (error) throw new Error(error.message);

      await appendRequestEvent(request_id, 'information_requested', prevStatus, 'waiting_on_owner', null, { items: newItems });

      const ownerUid = await resolveBase44UserId(req.requested_by_profile_id);
      await notify(ownerUid, 'valuation_information_requested',
        'Information Needed for Your Valuation',
        'The valuation team has requested additional information for your valuation request. Please review and respond.',
        { business_id: req.business_id, related_entity_id: request_id, action_url: `/advisory/business-valuation`, priority: 'high' }
      );

      return Response.json({ request: updated });
    }

    // ════════════════════════════════════════════════════════════════════════
    // OWNER RESPOND (owner → admin)
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'ownerRespond') {
      const { request_id, responses, notes } = data;
      if (!request_id) return Response.json({ error: 'request_id required' }, { status: 400 });
      const { data: req } = await vsb.from('valuation_requests')
        .select('id, status, business_id, requested_by_profile_id, additional_information_requested, owner_responses').eq('id', request_id).maybeSingle();
      if (!req) return Response.json({ error: 'REQUEST_NOT_FOUND' }, { status: 404 });
      if (!isSuperAdmin && req.requested_by_profile_id !== profileId) {
        return Response.json({ error: 'PERMISSION_DENIED' }, { status: 403 });
      }

      const prevStatus = req.status;
      // Mark info items as responded
      const infoItems = Array.isArray(req.additional_information_requested) ? req.additional_information_requested : [];
      const updatedItems = infoItems.map(item => {
        const resp = (responses || []).find(r => r.id === item.id);
        return resp ? { ...item, responded: true, response: resp.response, responded_at: new Date().toISOString() } : item;
      });
      const existingResponses = Array.isArray(req.owner_responses) ? req.owner_responses : [];
      const newResponses = (responses || []).map(r => ({
        id: r.id,
        response: r.response,
        document_ids: r.document_ids || [],
        responded_at: new Date().toISOString(),
      }));

      const { data: updated, error } = await vsb.from('valuation_requests')
        .update({
          additional_information_requested: updatedItems,
          owner_responses: [...existingResponses, ...newResponses],
          status: 'under_review',
          notes: notes || req.notes,
          updated_at: new Date().toISOString(),
        }).eq('id', request_id).select().single();
      if (error) throw new Error(error.message);

      await appendRequestEvent(request_id, 'owner_responded', prevStatus, 'under_review', null, { response_count: newResponses.length });

      // Notify assigned admin (or all super admins)
      const adminUid = req.assigned_admin_profile_id ? await resolveBase44UserId(req.assigned_admin_profile_id) : null;
      if (adminUid) {
        await notify(adminUid, 'valuation_owner_responded',
          'Owner Responded to Information Request',
          'The business owner has responded to your information request.',
          { business_id: req.business_id, related_entity_id: request_id, action_url: `/admin/business-valuations?request=${request_id}` }
        );
      } else {
        const { data: admins } = await sb.from('profiles').select('id, base44_user_id').eq('app_role', 'super_admin');
        for (const a of (admins || [])) {
          const uid = await resolveBase44UserId(a.id);
          await notify(uid, 'valuation_owner_responded',
            'Owner Responded to Information Request',
            'The business owner has responded to an information request.',
            { business_id: req.business_id, related_entity_id: request_id, action_url: `/admin/business-valuations?request=${request_id}` }
          );
        }
      }

      return Response.json({ request: updated });
    }

    // ════════════════════════════════════════════════════════════════════════
    // WITHDRAW REQUEST (owner)
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'withdrawRequest') {
      const { request_id, reason } = data;
      if (!request_id) return Response.json({ error: 'request_id required' }, { status: 400 });
      const { data: req } = await vsb.from('valuation_requests')
        .select('id, status, business_id, requested_by_profile_id').eq('id', request_id).maybeSingle();
      if (!req) return Response.json({ error: 'REQUEST_NOT_FOUND' }, { status: 404 });
      if (!isSuperAdmin && req.requested_by_profile_id !== profileId) {
        return Response.json({ error: 'PERMISSION_DENIED' }, { status: 403 });
      }
      if (['converted_to_valuation', 'declined', 'closed'].includes(req.status)) {
        return Response.json({ error: 'CANNOT_WITHDRAW' }, { status: 400 });
      }
      const prevStatus = req.status;
      const { data: updated, error } = await vsb.from('valuation_requests')
        .update({ status: 'withdrawn', withdrawn_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', request_id).select().single();
      if (error) throw new Error(error.message);
      await appendRequestEvent(request_id, 'request_withdrawn', prevStatus, 'withdrawn', reason, {});
      return Response.json({ request: updated });
    }

    // ════════════════════════════════════════════════════════════════════════
    // APPROVE REQUEST (admin)
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'approveRequest') {
      requireSuperAdmin();
      const { request_id, admin_notes, assigned_lead_advisor_id } = data;
      if (!request_id) return Response.json({ error: 'request_id required' }, { status: 400 });
      const { data: req } = await vsb.from('valuation_requests')
        .select('id, status, business_id, requested_by_profile_id').eq('id', request_id).maybeSingle();
      if (!req) return Response.json({ error: 'REQUEST_NOT_FOUND' }, { status: 404 });
      if (!['submitted', 'received', 'under_review', 'waiting_on_owner'].includes(req.status)) {
        return Response.json({ error: 'INVALID_STATUS_FOR_APPROVAL' }, { status: 400 });
      }
      const prevStatus = req.status;
      const { data: updated, error } = await vsb.from('valuation_requests')
        .update({
          status: 'approved',
          admin_decision: 'approved',
          admin_notes: admin_notes || req.admin_notes,
          assigned_lead_advisor_id: assigned_lead_advisor_id || req.assigned_lead_advisor_id,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', request_id).select().single();
      if (error) throw new Error(error.message);
      await appendRequestEvent(request_id, 'request_approved', prevStatus, 'approved', admin_notes, { assigned_lead_advisor_id });

      const ownerUid = await resolveBase44UserId(req.requested_by_profile_id);
      await notify(ownerUid, 'valuation_request_approved',
        'Valuation Request Approved',
        'Your valuation request has been approved. The valuation team will create your valuation and assign an advisor.',
        { business_id: req.business_id, related_entity_id: request_id, action_url: `/advisory/business-valuation` }
      );
      return Response.json({ request: updated });
    }

    // ════════════════════════════════════════════════════════════════════════
    // DECLINE REQUEST (admin, requires reason)
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'declineRequest') {
      requireSuperAdmin();
      const { request_id, reason, admin_notes } = data;
      if (!request_id) return Response.json({ error: 'request_id required' }, { status: 400 });
      if (!reason) return Response.json({ error: 'reason required to decline' }, { status: 400 });
      const { data: req } = await vsb.from('valuation_requests')
        .select('id, status, business_id, requested_by_profile_id').eq('id', request_id).maybeSingle();
      if (!req) return Response.json({ error: 'REQUEST_NOT_FOUND' }, { status: 404 });
      const prevStatus = req.status;
      const { data: updated, error } = await vsb.from('valuation_requests')
        .update({
          status: 'declined',
          admin_decision: 'declined',
          admin_notes: admin_notes || req.admin_notes,
          declined_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', request_id).select().single();
      if (error) throw new Error(error.message);
      await appendRequestEvent(request_id, 'request_declined', prevStatus, 'declined', reason, {});
      const ownerUid = await resolveBase44UserId(req.requested_by_profile_id);
      await notify(ownerUid, 'valuation_request_declined',
        'Valuation Request Declined',
        `Your valuation request was declined. Reason: ${reason}`,
        { business_id: req.business_id, related_entity_id: request_id, action_url: `/advisory/business-valuation` }
      );
      return Response.json({ request: updated });
    }

    // ════════════════════════════════════════════════════════════════════════
    // CLOSE AS DUPLICATE (admin, requires reason)
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'closeAsDuplicate') {
      requireSuperAdmin();
      const { request_id, reason, duplicate_of_request_id } = data;
      if (!request_id) return Response.json({ error: 'request_id required' }, { status: 400 });
      if (!reason) return Response.json({ error: 'reason required to close as duplicate' }, { status: 400 });
      const { data: req } = await vsb.from('valuation_requests')
        .select('id, status, business_id, requested_by_profile_id').eq('id', request_id).maybeSingle();
      if (!req) return Response.json({ error: 'REQUEST_NOT_FOUND' }, { status: 404 });
      const prevStatus = req.status;
      const { data: updated, error } = await vsb.from('valuation_requests')
        .update({
          status: 'closed',
          admin_decision: 'duplicate',
          admin_notes: reason,
          closed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', request_id).select().single();
      if (error) throw new Error(error.message);
      await appendRequestEvent(request_id, 'request_closed_duplicate', prevStatus, 'closed', reason, { duplicate_of_request_id });
      return Response.json({ request: updated });
    }

    // ════════════════════════════════════════════════════════════════════════
    // CONVERT TO VALUATION (admin)
    // Creates the valuation + team assignments in a rollback-safe sequence.
    // Reuses the same tables and permission flags as valuationService.
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'convertToValuation') {
      requireSuperAdmin();
      const {
        request_id,
        valuation_name, valuation_type, valuation_purpose,
        standard_of_value, valuation_premise, valuation_date, engagement_date,
        lead_advisor_profile_id, additional_advisors, reviewer_profile_id, publisher_profile_id,
      } = data;
      if (!request_id) return Response.json({ error: 'request_id required' }, { status: 400 });

      const { data: req } = await vsb.from('valuation_requests')
        .select('*').eq('id', request_id).maybeSingle();
      if (!req) return Response.json({ error: 'REQUEST_NOT_FOUND' }, { status: 404 });
      if (req.status !== 'approved') {
        return Response.json({ error: 'REQUEST_NOT_APPROVED' }, { status: 400 });
      }

      // Verify business exists
      const { data: biz } = await sb.from('business_entities')
        .select('id, business_name').eq('id', req.business_id).maybeSingle();
      if (!biz) return Response.json({ error: 'BUSINESS_NOT_FOUND' }, { status: 404 });

      // Validate lead advisor identity
      const leadId = lead_advisor_profile_id || req.assigned_lead_advisor_id;
      if (leadId) {
        const { data: leadProf } = await sb.from('profiles')
          .select('id, app_role').eq('id', leadId).maybeSingle();
        if (!leadProf) return Response.json({ error: 'LEAD_ADVISOR_NOT_FOUND' }, { status: 404 });
      }

      // Validate additional advisors
      const extraAdvisors = Array.isArray(additional_advisors) ? additional_advisors : [];
      for (const a of extraAdvisors) {
        const { data: p } = await sb.from('profiles').select('id').eq('id', a.profile_id).maybeSingle();
        if (!p) return Response.json({ error: 'ADVISOR_NOT_FOUND', detail: a.profile_id }, { status: 404 });
      }
      if (reviewer_profile_id) {
        const { data: p } = await sb.from('profiles').select('id').eq('id', reviewer_profile_id).maybeSingle();
        if (!p) return Response.json({ error: 'REVIEWER_NOT_FOUND' }, { status: 404 });
      }
      if (publisher_profile_id) {
        const { data: p } = await sb.from('profiles').select('id').eq('id', publisher_profile_id).maybeSingle();
        if (!p) return Response.json({ error: 'PUBLISHER_NOT_FOUND' }, { status: 404 });
      }

      // ── Step 1: Create the valuation ───────────────────────────────────
      const { data: val, error: valErr } = await vsb.from('business_valuations').insert({
        business_id: req.business_id,
        lead_advisor_profile_id: leadId || null,
        valuation_name: valuation_name || 'Enterprise Value Analysis',
        valuation_type: valuation_type || 'initial',
        is_primary: true,
        engagement_date: engagement_date || new Date().toISOString().split('T')[0],
        valuation_purpose: valuation_purpose || req.valuation_purpose || null,
        standard_of_value: standard_of_value || null,
        valuation_premise: valuation_premise || null,
        valuation_date: valuation_date || null,
        status: 'not_started',
        client_sharing_status: 'not_shared',
        created_by_profile_id: profileId,
        updated_by_profile_id: profileId,
      }).select().single();
      if (valErr) throw new Error(valErr.message);

      // ── Step 2: Create assignments (rollback-safe) ─────────────────────
      const createdAssignments = [];
      try {
        // Lead advisor
        if (leadId) {
          const { data: leadAsg, error: leadErr } = await vsb.from('valuation_assignments').insert({
            valuation_id: val.id,
            assigned_profile_id: leadId,
            assignment_role: 'lead',
            can_view: true, can_edit: true, can_review: true, can_publish: true,
            can_create_valuation: true, can_restore_valuation: true,
            can_archive_valuation: true, can_manage_assignments: true,
            assigned_by_profile_id: profileId,
          }).select().single();
          if (leadErr) throw new Error(leadErr.message);
          createdAssignments.push(leadAsg);
        }

        // Additional advisors
        for (const a of extraAdvisors) {
          const { data: asg, error: asgErr } = await vsb.from('valuation_assignments').insert({
            valuation_id: val.id,
            assigned_profile_id: a.profile_id,
            assignment_role: a.assignment_role || 'contributor',
            can_view: a.can_view !== false,
            can_edit: !!a.can_edit,
            can_review: !!a.can_review,
            can_publish: !!a.can_publish,
            can_create_valuation: !!a.can_create_valuation,
            can_restore_valuation: !!a.can_restore_valuation,
            can_archive_valuation: !!a.can_archive_valuation,
            can_manage_assignments: !!a.can_manage_assignments,
            assigned_by_profile_id: profileId,
          }).select().single();
          if (asgErr) throw new Error(asgErr.message);
          createdAssignments.push(asg);
        }

        // Reviewer
        if (reviewer_profile_id) {
          const { data: asg, error: asgErr } = await vsb.from('valuation_assignments').insert({
            valuation_id: val.id,
            assigned_profile_id: reviewer_profile_id,
            assignment_role: 'reviewer',
            can_view: true, can_edit: false, can_review: true, can_publish: false,
            can_create_valuation: false, can_restore_valuation: false,
            can_archive_valuation: false, can_manage_assignments: false,
            assigned_by_profile_id: profileId,
          }).select().single();
          if (asgErr) throw new Error(asgErr.message);
          createdAssignments.push(asg);
        }

        // Publisher (can_publish flag conveys authority; role label uses an allowed value)
        if (publisher_profile_id) {
          const { data: asg, error: asgErr } = await vsb.from('valuation_assignments').insert({
            valuation_id: val.id,
            assigned_profile_id: publisher_profile_id,
            assignment_role: 'contributor',
            can_view: true, can_edit: false, can_review: false, can_publish: true,
            can_create_valuation: false, can_restore_valuation: false,
            can_archive_valuation: false, can_manage_assignments: false,
            assigned_by_profile_id: profileId,
          }).select().single();
          if (asgErr) throw new Error(asgErr.message);
          createdAssignments.push(asg);
        }
      } catch (assignmentErr) {
        // Rollback: delete the orphan valuation + any partial assignments
        await vsb.from('valuation_assignments').delete().eq('valuation_id', val.id);
        await vsb.from('business_valuations').delete().eq('id', val.id);
        return Response.json({ error: 'ASSIGNMENT_CREATION_FAILED', detail: assignmentErr.message }, { status: 500 });
      }

      // ── Step 3: Audit event on valuation ──────────────────────────────
      await vsb.from('valuation_audit_log').insert({
        valuation_id: val.id,
        actor_profile_id: profileId,
        action: 'created',
        action_details: { source: 'valuation_request', request_id: req.id, business_id: req.business_id, assignments: createdAssignments.length },
      });

      // ── Step 4: Update request ─────────────────────────────────────────
      const { data: updatedReq, error: reqErr } = await vsb.from('valuation_requests')
        .update({
          status: 'converted_to_valuation',
          converted_valuation_id: val.id,
          converted_at: new Date().toISOString(),
          assigned_lead_advisor_id: leadId || null,
          updated_at: new Date().toISOString(),
        }).eq('id', request_id).select().single();
      if (reqErr) throw new Error(reqErr.message);

      await appendRequestEvent(request_id, 'converted_to_valuation', 'approved', 'converted_to_valuation', null, {
        valuation_id: val.id, assignments: createdAssignments.length,
      });

      // ── Step 5: Notifications ──────────────────────────────────────────
      const ownerUid = await resolveBase44UserId(req.requested_by_profile_id);
      await notify(ownerUid, 'valuation_created',
        'Your Valuation Has Been Created',
        `A business valuation has been created for ${biz.business_name}. Your assigned advisor will be in touch.`,
        { business_id: req.business_id, related_entity_id: val.id, related_entity_type: 'valuation', action_url: `/advisory/valuation/${val.id}` }
      );
      if (leadId) {
        const leadUid = await resolveBase44UserId(leadId);
        await notify(leadUid, 'valuation_assigned',
          'New Valuation Assigned to You',
          `You have been assigned as lead advisor for ${biz.business_name}.`,
          { business_id: req.business_id, related_entity_id: val.id, related_entity_type: 'valuation', action_url: `/advisory/valuation/${val.id}`, priority: 'high' }
        );
      }

      return Response.json({ valuation: val, request: updatedReq, assignments: createdAssignments });
    }

    // ════════════════════════════════════════════════════════════════════════
    // GET REQUEST EVENTS (audit log)
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'getRequestEvents') {
      const { request_id } = data;
      if (!request_id) return Response.json({ error: 'request_id required' }, { status: 400 });
      const { data: req } = await vsb.from('valuation_requests')
        .select('id, requested_by_profile_id, business_id').eq('id', request_id).maybeSingle();
      if (!req) return Response.json({ error: 'REQUEST_NOT_FOUND' }, { status: 404 });
      if (!isSuperAdmin && req.requested_by_profile_id !== profileId) {
        const owns = await isBusinessOwner(req.business_id);
        if (!owns) return Response.json({ error: 'PERMISSION_DENIED' }, { status: 403 });
      }
      const { data: events, error } = await vsb.from('valuation_request_events')
        .select('*').eq('request_id', request_id).order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      const actorIds = [...new Set((events || []).map(e => e.actor_profile_id).filter(Boolean))];
      const { data: profs } = await sb.from('profiles')
        .select('id, first_name, last_name').in('id', actorIds.length ? actorIds : ['00000000-0000-0000-0000-000000000000']);
      const profMap = {}; for (const p of (profs || [])) profMap[p.id] = `${p.first_name || ''} ${p.last_name || ''}`.trim();
      const enriched = (events || []).map(e => ({ ...e, actor_name: profMap[e.actor_profile_id] || 'System' }));
      return Response.json({ events: enriched });
    }

    return Response.json({ error: 'Unknown action: ' + action }, { status: 400 });
  } catch (err) {
    console.error('[valuationRequestService] error:', err);
    return Response.json({ error: err.message || 'Internal error' }, { status: err.status || 500 });
  }
}