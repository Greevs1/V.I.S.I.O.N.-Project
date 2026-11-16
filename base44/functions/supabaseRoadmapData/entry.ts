/**
 * supabaseRoadmapData — roadmap items reads/writes and completion handling.
 *
 * Actions:
 *   getRoadmapItems, updateRoadmapItemStatus, onRoadmapItemCompleted
 *
 * Can be called directly (user token) or via supabaseUserData router (service role).
 * Phase 6B.4 — authentication is MANDATORY and unconditional. `_router_user_email`
 * is a TARGET identifier only, honoured solely after the authenticated actor is
 * proven authorized for it. Identity never comes from the request body.
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

    if (action === 'getRoadmapItems') {
      const profile = await getProfile();
      if (!profile) return Response.json({ items: [] });
      const { data: items, error } = await sb
        .from('roadmap_items')
        .select('*')
        .eq('profile_id', profile.id)
        .order('updated_at', { ascending: false });
      if (error) throw new Error(error.message);
      return Response.json({ items: items || [] });
    }

    if (action === 'updateRoadmapItemStatus') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });

      const { roadmap_item_id, status } = data || {};
      if (!roadmap_item_id) return Response.json({ error: 'roadmap_item_id required' }, { status: 400 });
      if (!status) return Response.json({ error: 'status required' }, { status: 400 });

      const VALID_STATUSES = [
        'Not Started', 'Gathering Information', 'Scheduled', 'In Progress',
        'Waiting On Owner', 'Waiting On Advisor', 'Implemented', 'Verified',
        'Deferred', 'Dismissed',
      ];
      if (!VALID_STATUSES.includes(status)) {
        return Response.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
      }

      const { data: item, error: fetchErr } = await sb
        .from('roadmap_items')
        .select('id, profile_id, business_id, value_creation_event_id, completed_at, verified_at, estimated_value_created, estimated_tax_savings, estimated_profit_improvement, estimated_cash_flow_improvement')
        .eq('id', roadmap_item_id)
        .maybeSingle();
      if (fetchErr) throw new Error(fetchErr.message);
      if (!item) return Response.json({ error: 'Roadmap item not found' }, { status: 404 });
      if (item.profile_id !== profile.id) return Response.json({ error: 'Forbidden' }, { status: 403 });

      const now = new Date().toISOString();
      const patch = { status, updated_at: now };

      if (status === 'Implemented' && !item.completed_at) patch.completed_at = now;
      if (status === 'Verified' && !item.verified_at) patch.verified_at = now;

      const { error: updateErr } = await sb.from('roadmap_items').update(patch).eq('id', roadmap_item_id);
      if (updateErr) throw new Error(updateErr.message);

      // Auto-create VCE when status → Implemented/Completed
      if ((status === 'Implemented' || status === 'Completed') && !item.value_creation_event_id) {
        try {
          const categoryMap = {
            profit_gap: 'profit', value_gap: 'valuation', tax_gap: 'tax',
            operations_gap: 'operations', recast_ebitda: 'valuation', freedom_assessment: 'operations',
          };
          const { data: existingVce } = await sb
            .from('value_creation_events').select('id').eq('roadmap_item_id', roadmap_item_id).maybeSingle();

          if (!existingVce) {
            const vcePayload = {
              business_id: item.business_id || null,
              roadmap_item_id: item.id,
              title: item.title,
              description: item.description || null,
              category: categoryMap[item.source_assessment_type] || item.category || 'general',
              source_assessment_type: item.source_assessment_type || null,
              status: 'pending_verification',
              estimated_impact: item.estimated_value_created || null,
              estimated_tax_savings: item.estimated_tax_savings || null,
              estimated_profit_improvement: item.estimated_profit_improvement || null,
              estimated_cash_flow_improvement: item.estimated_cash_flow_improvement || null,
              priority_rank: item.impact_score ? Math.round((100 - item.impact_score) / 10) : 5,
              confidence_level: 'estimated',
              created_at: now,
              updated_at: now,
            };
            const { data: newVce } = await sb.from('value_creation_events').insert(vcePayload).select('id').single();
            if (newVce) {
              await sb.from('roadmap_items').update({ value_creation_event_id: newVce.id, updated_at: now }).eq('id', roadmap_item_id);
            }
          }
        } catch (vceCreateErr) {
          console.error('[updateRoadmapItemStatus] VCE auto-create failed (non-fatal):', vceCreateErr?.message);
        }
      }

      // Cascade to linked VCE — non-fatal
      if (item.value_creation_event_id) {
        try {
          if (status === 'Implemented') {
            await sb.from('value_creation_events').update({ status: 'implemented', updated_at: now }).eq('id', item.value_creation_event_id);
          }
          if (status === 'Verified') {
            const { data: vce } = await sb.from('value_creation_events')
              .select('verified_value, verified_tax_savings, verified_profit_improvement, verified_cash_flow_improvement')
              .eq('id', item.value_creation_event_id).maybeSingle();

            const vcePatch = { status: 'verified', confidence_level: 'verified', updated_at: now };
            if (vce && !vce.verified_value && item.estimated_value_created) vcePatch.verified_value = item.estimated_value_created;
            if (vce && !vce.verified_tax_savings && item.estimated_tax_savings) vcePatch.verified_tax_savings = item.estimated_tax_savings;
            if (vce && !vce.verified_profit_improvement && item.estimated_profit_improvement) vcePatch.verified_profit_improvement = item.estimated_profit_improvement;
            if (vce && !vce.verified_cash_flow_improvement && item.estimated_cash_flow_improvement) vcePatch.verified_cash_flow_improvement = item.estimated_cash_flow_improvement;

            await sb.from('value_creation_events').update(vcePatch).eq('id', item.value_creation_event_id);
          }
        } catch (vceErr) {
          console.error('[updateRoadmapItemStatus] VCE cascade failed (non-fatal):', vceErr?.message || vceErr);
        }
      }

      return Response.json({ success: true, roadmap_item_id, status });
    }

    if (action === 'onRoadmapItemCompleted') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });

      const { roadmap_item_id } = data || {};
      if (!roadmap_item_id) return Response.json({ error: 'roadmap_item_id required' }, { status: 400 });

      const { data: item, error: fetchErr } = await sb
        .from('roadmap_items').select('*').eq('id', roadmap_item_id).maybeSingle();
      if (fetchErr) throw new Error(fetchErr.message);
      if (!item) return Response.json({ error: 'Roadmap item not found' }, { status: 404 });
      if (item.profile_id !== profile.id) return Response.json({ error: 'Forbidden' }, { status: 403 });

      const now = new Date().toISOString();

      const { data: existing } = await sb
        .from('value_creation_events').select('id, status').eq('roadmap_item_id', roadmap_item_id).maybeSingle();

      if (existing) {
        if (existing.status !== 'verified') {
          await sb.from('value_creation_events').update({ status: 'pending_verification', updated_at: now }).eq('id', existing.id);
        }
        return Response.json({ vce_id: existing.id, action: 'updated' });
      }

      const categoryMap = {
        profit_gap: 'profit', value_gap: 'valuation', tax_gap: 'tax',
        operations_gap: 'operations', recast_ebitda: 'valuation', freedom_assessment: 'operations',
      };

      const vcePayload = {
        business_id: item.business_id || null,
        roadmap_item_id: item.id,
        title: item.title,
        description: item.description || null,
        category: categoryMap[item.source_assessment_type] || item.category || 'general',
        source_assessment_type: item.source_assessment_type || null,
        status: 'pending_verification',
        estimated_impact: item.estimated_value_created || null,
        estimated_tax_savings: item.estimated_tax_savings || null,
        estimated_profit_improvement: item.estimated_profit_improvement || null,
        estimated_cash_flow_improvement: item.estimated_cash_flow_improvement || null,
        priority_rank: item.impact_score ? Math.round((100 - item.impact_score) / 10) : 5,
        confidence_level: 'estimated',
        created_at: now,
        updated_at: now,
      };

      const { data: vce, error: insertErr } = await sb.from('value_creation_events').insert(vcePayload).select('id').single();
      if (insertErr) throw new Error(insertErr.message);

      await sb.from('roadmap_items').update({ value_creation_event_id: vce.id, updated_at: now }).eq('id', roadmap_item_id);

      return Response.json({ vce_id: vce.id, action: 'created' });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
});