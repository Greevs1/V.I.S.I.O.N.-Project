/**
 * supabaseVerificationData — advisor/admin verification queue and verify actions.
 *
 * Actions:
 *   getVerificationQueue, verifyRoadmapItem, verifyValueCreationEvent
 *
 * Can be called directly (user token) or via supabaseUserData router (service role).
 * Phase 6B.4 — authentication is MANDATORY and unconditional. `_router_user_email`
 * is a TARGET identifier only, honoured solely after the authenticated actor is
 * proven authorized for it. Identity never comes from the request body.
 * Role checks use profile.app_role (Supabase column) — admin is also accepted.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { authenticateActor, resolveActingProfile, errorResponse } from '../../shared/authz/actor.ts';

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

    if (action === 'getVerificationQueue') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });

      const role = profile.app_role;
      if (role !== 'super_admin' && role !== 'advisor' && role !== 'admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }

      let riQuery = sb.from('roadmap_items')
        .select('id, title, category, status, priority, profile_id, business_id, value_creation_event_id, estimated_value_created, estimated_tax_savings, estimated_profit_improvement, estimated_cash_flow_improvement, source_assessment_type, completed_at, verified_at, updated_at')
        .eq('status', 'Implemented')
        .order('updated_at', { ascending: false })
        .limit(50);

      if (role === 'advisor') {
        const { data: assignments } = await sb.from('advisor_assignments').select('business_id').eq('advisor_profile_id', profile.id);
        const bizIds = (assignments || []).map(a => a.business_id).filter(Boolean);
        if (bizIds.length > 0) { riQuery = riQuery.in('business_id', bizIds); }
        else { return Response.json({ roadmap_items: [], value_creation_events: [] }); }
      }

      const { data: roadmapItems } = await riQuery;

      let vceQuery = sb.from('value_creation_events')
        .select('id, title, category, status, confidence_level, business_id, roadmap_item_id, estimated_impact, estimated_tax_savings, estimated_profit_improvement, estimated_cash_flow_improvement, reviewed_by, reviewed_at, updated_at')
        .in('status', ['pending_verification', 'implemented'])
        .order('updated_at', { ascending: false })
        .limit(50);

      if (role === 'advisor') {
        const { data: assignments } = await sb.from('advisor_assignments').select('business_id').eq('advisor_profile_id', profile.id);
        const bizIds = (assignments || []).map(a => a.business_id).filter(Boolean);
        if (bizIds.length > 0) { vceQuery = vceQuery.in('business_id', bizIds); }
        else { return Response.json({ roadmap_items: roadmapItems || [], value_creation_events: [] }); }
      }

      const { data: vceItems } = await vceQuery;

      return Response.json({
        roadmap_items: roadmapItems || [],
        value_creation_events: vceItems || [],
      });
    }

    if (action === 'verifyRoadmapItem') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });

      const role = profile.app_role;
      if (role !== 'super_admin' && role !== 'advisor' && role !== 'admin') {
        return Response.json({ error: 'Forbidden: only advisors and admins can verify items' }, { status: 403 });
      }

      const {
        roadmap_item_id, verification_notes,
        verified_value_created, verified_tax_savings,
        verified_profit_improvement, verified_cash_flow_improvement, verified_debt_reduction,
      } = data || {};

      if (!roadmap_item_id) return Response.json({ error: 'roadmap_item_id required' }, { status: 400 });

      const { data: item, error: fetchErr } = await sb
        .from('roadmap_items')
        .select('id, profile_id, business_id, value_creation_event_id, verified_at, estimated_value_created, estimated_tax_savings, estimated_profit_improvement, estimated_cash_flow_improvement')
        .eq('id', roadmap_item_id).maybeSingle();
      if (fetchErr) throw new Error(fetchErr.message);
      if (!item) return Response.json({ error: 'Roadmap item not found' }, { status: 404 });

      if (role === 'advisor' && item.business_id) {
        const { data: assignment } = await sb.from('advisor_assignments').select('id')
          .eq('advisor_profile_id', profile.id).eq('business_id', item.business_id).maybeSingle();
        if (!assignment) return Response.json({ error: 'Forbidden: not assigned to this business' }, { status: 403 });
      }

      const now = new Date().toISOString();

      const patch = {
        status: 'Verified',
        updated_at: now,
        ...(item.verified_at ? {} : { verified_at: now }),
        ...(verification_notes != null ? { verification_notes } : {}),
        verified_value_created:         verified_value_created         ?? item.estimated_value_created         ?? null,
        verified_tax_savings:           verified_tax_savings           ?? item.estimated_tax_savings           ?? null,
        verified_profit_improvement:    verified_profit_improvement    ?? item.estimated_profit_improvement    ?? null,
        verified_cash_flow_improvement: verified_cash_flow_improvement ?? item.estimated_cash_flow_improvement ?? null,
        ...(verified_debt_reduction != null ? { verified_debt_reduction } : {}),
      };

      const { error: updateErr } = await sb.from('roadmap_items').update(patch).eq('id', roadmap_item_id);
      if (updateErr) throw new Error(updateErr.message);

      if (item.value_creation_event_id) {
        try {
          const { data: vce } = await sb.from('value_creation_events')
            .select('verified_value, verified_tax_savings, verified_profit_improvement, verified_cash_flow_improvement, reviewed_by')
            .eq('id', item.value_creation_event_id).maybeSingle();

          const vcePatch = {
            status: 'verified', confidence_level: 'verified',
            reviewed_by: vce?.reviewed_by || profile.id, reviewed_at: now, updated_at: now,
            verified_value:                 verified_value_created         ?? vce?.verified_value                ?? item.estimated_value_created         ?? null,
            verified_tax_savings:           verified_tax_savings           ?? vce?.verified_tax_savings          ?? item.estimated_tax_savings           ?? null,
            verified_profit_improvement:    verified_profit_improvement    ?? vce?.verified_profit_improvement   ?? item.estimated_profit_improvement    ?? null,
            verified_cash_flow_improvement: verified_cash_flow_improvement ?? vce?.verified_cash_flow_improvement ?? item.estimated_cash_flow_improvement ?? null,
          };

          await sb.from('value_creation_events').update(vcePatch).eq('id', item.value_creation_event_id);
        } catch (vceErr) {
          console.error('[verifyRoadmapItem] VCE cascade failed (non-fatal):', vceErr?.message || vceErr);
        }
      }

      return Response.json({ success: true, roadmap_item_id, status: 'Verified' });
    }

    if (action === 'verifyValueCreationEvent') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });

      const role = profile.app_role;
      if (role !== 'super_admin' && role !== 'advisor' && role !== 'admin') {
        return Response.json({ error: 'Forbidden: only advisors and admins can verify events' }, { status: 403 });
      }

      const {
        event_id, verification_notes, verified_value,
        verified_tax_savings, verified_profit_improvement, verified_cash_flow_improvement,
      } = data || {};

      if (!event_id) return Response.json({ error: 'event_id required' }, { status: 400 });

      const { data: vce, error: fetchErr } = await sb
        .from('value_creation_events')
        .select('id, business_id, roadmap_item_id, reviewed_by, reviewed_at, estimated_impact, verified_value, verified_tax_savings, verified_profit_improvement, verified_cash_flow_improvement')
        .eq('id', event_id).maybeSingle();
      if (fetchErr) throw new Error(fetchErr.message);
      if (!vce) return Response.json({ error: 'Event not found' }, { status: 404 });

      if (role === 'advisor' && vce.business_id) {
        const { data: assignment } = await sb.from('advisor_assignments').select('id')
          .eq('advisor_profile_id', profile.id).eq('business_id', vce.business_id).maybeSingle();
        if (!assignment) return Response.json({ error: 'Forbidden: not assigned to this business' }, { status: 403 });
      }

      const now = new Date().toISOString();

      const vcePatch = {
        status: 'verified', confidence_level: 'verified',
        reviewed_by: vce.reviewed_by || profile.id,
        reviewed_at: vce.reviewed_at || now,
        updated_at: now,
        verified_value:                 verified_value                ?? vce.verified_value                ?? vce.estimated_impact ?? null,
        verified_tax_savings:           verified_tax_savings          ?? vce.verified_tax_savings          ?? null,
        verified_profit_improvement:    verified_profit_improvement   ?? vce.verified_profit_improvement   ?? null,
        verified_cash_flow_improvement: verified_cash_flow_improvement ?? vce.verified_cash_flow_improvement ?? null,
        ...(verification_notes != null ? { notes: verification_notes } : {}),
      };

      const { error: updateErr } = await sb.from('value_creation_events').update(vcePatch).eq('id', event_id);
      if (updateErr) throw new Error(updateErr.message);

      if (vce.roadmap_item_id) {
        try {
          const { data: ri } = await sb.from('roadmap_items').select('id, verified_at').eq('id', vce.roadmap_item_id).maybeSingle();
          if (ri) {
            await sb.from('roadmap_items').update({
              status: 'Verified',
              ...(ri.verified_at ? {} : { verified_at: now }),
              updated_at: now,
            }).eq('id', ri.id);
          }
        } catch (riErr) {
          console.error('[verifyValueCreationEvent] roadmap_item cascade failed (non-fatal):', riErr?.message || riErr);
        }
      }

      return Response.json({ success: true, event_id, status: 'verified' });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
});