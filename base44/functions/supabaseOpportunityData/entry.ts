/**
 * supabaseOpportunityData — business opportunities and next best actions.
 *
 * Actions:
 *   getBusinessOpportunities, getNextBestAction, getNextBestActions,
 *   getAllNextBestActions, acceptNextBestAction, dismissNextBestAction,
 *   resetNextBestAction, updateNextBestAction
 *
 * Can be called directly (user token) or via supabaseUserData router (service role).
 * Phase 6B.4 — authentication is MANDATORY and unconditional. `_router_user_email`
 * is a TARGET identifier only, honoured solely after the authenticated actor is
 * proven authorized for it. Identity never comes from the request body.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { authenticateActor, resolveActingProfile, errorResponse } from '../../shared/authz/actor.ts';
import {
  requireBusinessContext,
  assertBusinessAccess,
  businessContextError,
  businessScopeMismatch,
} from '../../shared/businessScope/activeBusiness.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return Response.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body = await req.json().catch(() => ({}));
    const { action, data, _router_user_email } = body;

    // ── Phase 6B.4 — AUTHENTICATION BOUNDARY ─────────────────────────────────
    // Authentication is mandatory and unconditional. The caller's identity is
    // NEVER taken from the request body. `_router_user_email` is a TARGET
    // identifier only, honoured after the actor is proven authorized for it.
    const actor = await authenticateActor(base44, sb);
    const acting = await resolveActingProfile(sb, actor, { targetEmail: _router_user_email });

    const getProfile = async () => acting.profile;

    if (action === 'getBusinessOpportunities') {
      const profile = await getProfile();
      if (!profile) return Response.json({ opportunities: [] });

      // Phase 6.9B — business-owned read. The business comes from the canonical
      // contract; primary_business_id is never substituted for an explicit
      // selection on a multi-business account.
      const { businessId, denial } = await requireBusinessContext(
        sb, profile, data?.active_business_id || data?.business_id,
        'supabaseOpportunityData.getBusinessOpportunities'
      );
      if (denial) return denial;
      if (!businessId) return Response.json({ opportunities: [] });
      const { data: opportunities, error } = await sb
        .from('business_opportunities')
        .select('*')
        .eq('business_id', businessId)
        .order('priority_score', { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return Response.json({ opportunities: opportunities || [] });
    }

    if (action === 'getNextBestAction') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });

      const { businessId, denial } = await requireBusinessContext(
        sb, profile, data?.active_business_id || data?.business_id,
        'supabaseOpportunityData.getNextBestAction'
      );
      if (denial) return denial;
      if (!businessId) return Response.json({ fallback: 'onboarding_required', primary: null });

      const { data: topAction, error: topErr } = await sb
        .from('next_best_actions')
        .select('*')
        .eq('business_id', businessId)
        .in('status', ['recommended', 'accepted', 'in_progress'])
        .order('priority_score', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (topErr) throw new Error(topErr.message);

      if (topAction) return Response.json({ primary: topAction, secondaries: [], reason: 'from_db' });

      try {
        const genResult = await base44.asServiceRole.functions.invoke('generateNextBestActions', {});
        if (genResult?.primary) {
          return Response.json({
            primary: genResult.primary,
            secondaries: genResult.secondaries || [],
            reason: genResult.reason || 'generated',
          });
        }
      } catch (genErr) {
        console.error('[getNextBestAction] generateNextBestActions invoke failed:', genErr?.message);
      }

      return Response.json({ primary: null, secondaries: [], reason: 'no_actions' });
    }

    if (action === 'getNextBestActions') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });

      const role = profile.app_role;
      const isOwner = role !== 'super_admin' && role !== 'advisor';

      let nbaQuery = sb
        .from('next_best_actions')
        .select('*')
        .in('status', ['recommended', 'accepted', 'in_progress'])
        .order('priority_score', { ascending: false })
        .limit(10);

      if (isOwner) {
        // Owner/admin view — exactly one business, resolved through the canonical
        // contract (explicit selection, or an unambiguous single-business account).
        // A multi-business account with no explicit context is REFUSED.
        const { businessId, denial } = await requireBusinessContext(
          sb, profile, data?.active_business_id || data?.business_id,
          'supabaseOpportunityData.getNextBestActions'
        );
        if (denial) return denial;
        if (!businessId) return Response.json({ actions: [] });
        nbaQuery = nbaQuery.eq('business_id', businessId);
      } else if (role === 'advisor') {
        const { data: assignments } = await sb
          .from('advisor_assignments').select('business_id').eq('advisor_profile_id', profile.id);
        const bizIds = (assignments || []).map(a => a.business_id).filter(Boolean);
        if (bizIds.length === 0) return Response.json({ actions: [] });
        nbaQuery = nbaQuery.in('business_id', bizIds);
      }

      const { data: actions, error } = await nbaQuery;
      if (error) throw new Error(error.message);
      return Response.json({ actions: actions || [] });
    }

    if (action === 'getAllNextBestActions') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });

      const role = profile.app_role;
      if (role !== 'super_admin' && role !== 'advisor' && role !== 'admin') {
        return Response.json({ error: 'Forbidden: advisors only' }, { status: 403 });
      }

      let nbaQuery = sb
        .from('next_best_actions')
        .select('*')
        .order('priority_score', { ascending: false })
        .order('created_at', { ascending: false });

      if (role === 'advisor') {
        const { data: assignments } = await sb
          .from('advisor_assignments').select('business_id').eq('advisor_profile_id', profile.id);
        const bizIds = (assignments || []).map(a => a.business_id).filter(Boolean);
        if (bizIds.length === 0) return Response.json({ actions: [] });
        nbaQuery = nbaQuery.in('business_id', bizIds);
      }

      const { data: actions, error } = await nbaQuery;
      if (error) throw new Error(error.message);
      return Response.json({ actions: actions || [] });
    }

    if (action === 'acceptNextBestAction') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });

      const { action_id } = data || {};
      if (!action_id) return Response.json({ error: 'action_id required' }, { status: 400 });

      const { data: nba, error: fetchErr } = await sb
        .from('next_best_actions').select('*').eq('id', action_id).maybeSingle();

      if (fetchErr) throw new Error(fetchErr.message);
      if (!nba) return Response.json({ error: 'Action not found' }, { status: 404 });

      // Phase 6.9B — the record establishes the business; the actor must be
      // authorized for it, and an explicitly supplied business must match.
      let recordBusinessId: string;
      try {
        recordBusinessId = await assertBusinessAccess(sb, nba.business_id, profile, {
          action: 'supabaseOpportunityData.acceptNextBestAction',
        });
      } catch (authErr) {
        return businessContextError(authErr);
      }
      const requestedBiz = data?.active_business_id || data?.business_id || null;
      if (requestedBiz && requestedBiz !== recordBusinessId) return businessScopeMismatch('Next best action');

      const now = new Date().toISOString();

      let roadmapItemId = nba.metadata?.roadmap_item_id || null;
      let roadmapItem = null;

      if (!roadmapItemId) {
        const { data: existing } = await sb.from('roadmap_items').select('id')
          .eq('business_id', nba.business_id).eq('title', nba.title).maybeSingle();
        roadmapItemId = existing?.id || null;
      }

      if (roadmapItemId) {
        const { data: linked } = await sb.from('roadmap_items').select('id, title, status').eq('id', roadmapItemId).maybeSingle();
        roadmapItem = linked;
      } else {
        const roadmapPayload = {
          business_id: nba.business_id,
          profile_id: profile.id,
          title: nba.title,
          description: nba.description || null,
          category: nba.category || 'general',
          priority: nba.priority_score >= 80 ? 'High' : nba.priority_score >= 60 ? 'Medium' : 'Low',
          impact_score: nba.priority_score || null,
          source_assessment_type: nba.source || null,
          estimated_value_created: nba.estimated_impact || null,
          estimated_tax_savings: nba.metadata?.estimated_tax_savings || null,
          estimated_profit_improvement: nba.metadata?.estimated_profit_improvement || null,
          estimated_cash_flow_improvement: nba.metadata?.estimated_cash_flow_improvement || null,
          status: 'Not Started',
          due_date: nba.due_date || null,
          value_creation_event_id: null,
          created_at: now,
          updated_at: now,
        };

        const { data: created, error: riErr } = await sb.from('roadmap_items').insert(roadmapPayload).select('id, title, status').single();
        if (riErr) {
          console.error('[acceptNextBestAction] roadmap_items insert failed (non-fatal):', riErr.message);
        } else {
          roadmapItem = created;
          roadmapItemId = created.id;
        }
      }

      const updatedMetadata = { ...(nba.metadata || {}), roadmap_item_id: roadmapItemId };
      const { data: updated, error: updateErr } = await sb
        .from('next_best_actions')
        .update({ status: 'accepted', updated_at: now, metadata: updatedMetadata })
        .eq('id', action_id).select().single();

      if (updateErr) throw new Error(updateErr.message);
      return Response.json({ action: updated, roadmap_item: roadmapItem, roadmap_linked: !!roadmapItemId });
    }

    if (action === 'dismissNextBestAction') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });

      const { action_id } = data || {};
      if (!action_id) return Response.json({ error: 'action_id required' }, { status: 400 });

      const { data: nbaAction, error: fetchErr } = await sb
        .from('next_best_actions').select('id, business_id').eq('id', action_id).maybeSingle();

      if (fetchErr) throw new Error(fetchErr.message);
      if (!nbaAction) return Response.json({ error: 'Action not found' }, { status: 404 });

      let recordBusinessId: string;
      try {
        recordBusinessId = await assertBusinessAccess(sb, nbaAction.business_id, profile, {
          action: 'supabaseOpportunityData.dismissNextBestAction',
        });
      } catch (authErr) {
        return businessContextError(authErr);
      }
      const requestedBiz = data?.active_business_id || data?.business_id || null;
      if (requestedBiz && requestedBiz !== recordBusinessId) return businessScopeMismatch('Next best action');

      const { data: updated, error: updateErr } = await sb
        .from('next_best_actions')
        .update({
          status: 'dismissed',
          updated_at: new Date().toISOString(),
          metadata: { dismissed_by: profile.id, dismissed_at: new Date().toISOString() },
        })
        .eq('id', action_id).select().single();

      if (updateErr) throw new Error(updateErr.message);
      return Response.json({ action: updated });
    }

    if (action === 'resetNextBestAction') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });

      const role = profile.app_role;
      if (role !== 'super_admin' && role !== 'advisor' && role !== 'admin') {
        return Response.json({ error: 'Forbidden: advisors only' }, { status: 403 });
      }

      const { action_id } = data || {};
      if (!action_id) return Response.json({ error: 'action_id required' }, { status: 400 });

      // Phase 6.9B — previously this mutated ANY action by id with no business
      // check at all. The record now establishes the business and the actor is
      // authorized against it.
      const { data: nbaReset } = await sb
        .from('next_best_actions').select('id, business_id').eq('id', action_id).maybeSingle();
      if (!nbaReset) return Response.json({ error: 'Action not found' }, { status: 404 });
      try {
        await assertBusinessAccess(sb, nbaReset.business_id, profile, {
          action: 'supabaseOpportunityData.resetNextBestAction',
        });
      } catch (authErr) {
        return businessContextError(authErr);
      }

      const { data: updated, error: updateErr } = await sb
        .from('next_best_actions')
        .update({ status: 'recommended', updated_at: new Date().toISOString(), metadata: {} })
        .eq('id', action_id).select().single();

      if (updateErr) throw new Error(updateErr.message);
      return Response.json({ action: updated });
    }

    if (action === 'updateNextBestAction') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });

      const { action_id, status } = data || {};
      if (!action_id) return Response.json({ error: 'action_id required' }, { status: 400 });

      // Phase 6.9B — previously this mutated ANY action by id with no business
      // check at all. The record establishes the business; the actor is
      // authorized against it, and an explicit business must match.
      const { data: nbaUpdate } = await sb
        .from('next_best_actions').select('id, business_id').eq('id', action_id).maybeSingle();
      if (!nbaUpdate) return Response.json({ error: 'Action not found' }, { status: 404 });
      let updateBusinessId: string;
      try {
        updateBusinessId = await assertBusinessAccess(sb, nbaUpdate.business_id, profile, {
          action: 'supabaseOpportunityData.updateNextBestAction',
        });
      } catch (authErr) {
        return businessContextError(authErr);
      }
      const requestedUpdateBiz = data?.active_business_id || data?.business_id || null;
      if (requestedUpdateBiz && requestedUpdateBiz !== updateBusinessId) return businessScopeMismatch('Next best action');

      const now = new Date().toISOString();
      const updateData = { status, updated_at: now };

      if (status === 'dismissed' || status === 'accepted' || status === 'completed') {
        updateData.metadata = { [`${status}_by`]: profile.id, [`${status}_at`]: now };
      }

      const { data: updated, error: updateErr } = await sb
        .from('next_best_actions').update(updateData).eq('id', action_id).select().single();

      if (updateErr) throw new Error(updateErr.message);
      return Response.json({ action: updated });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
});