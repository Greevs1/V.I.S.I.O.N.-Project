/**
 * onRoadmapItemCompleted — triggered by automation when roadmap_items.status = 'Completed'
 * Creates or updates a value_creation_event linked to the completed roadmap item.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';

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

    // Accept both direct invocation with roadmap_item_id and automation payload
    const body = await req.json().catch(() => ({}));
    const roadmapItemId = body.roadmap_item_id || body.data?.id || body.event?.entity_id;

    if (!roadmapItemId) {
      return Response.json({ error: 'roadmap_item_id required' }, { status: 400 });
    }

    // Fetch the roadmap item — safe-fail if table doesn't exist (legacy system)
    const { data: item, error: fetchErr } = await sb
      .from('roadmap_items')
      .select('id, title, description, status, business_id, profile_id, category, source_assessment_type, estimated_value_created, estimated_tax_savings, estimated_profit_improvement, estimated_cash_flow_improvement, impact_score, value_creation_event_id')
      .eq('id', roadmapItemId)
      .maybeSingle();

    if (fetchErr) {
      // If table doesn't exist, return graceful skip instead of error
      if (fetchErr.message?.includes('does not exist') || fetchErr.code === '42P01') {
        return Response.json({ skipped: true, reason: 'roadmap_items table not available (legacy system removed)' });
      }
      throw new Error(fetchErr.message);
    }
    if (!item) return Response.json({ error: 'Roadmap item not found' }, { status: 404 });

    // Only process completed/implemented/verified items
    const triggerStatuses = ['Completed', 'Implemented', 'Verified'];
    if (!triggerStatuses.includes(item.status)) {
      return Response.json({ skipped: true, reason: `status is ${item.status}, not in ${triggerStatuses.join('/')}` });
    }

    const now = new Date().toISOString();

    // Resolve business_id: prefer roadmap_item.business_id, fallback to profile.primary_business_id
    let businessId = item.business_id || null;
    let profileId = item.profile_id || null;

    if (!businessId && profileId) {
      const { data: prof } = await sb
        .from('profiles')
        .select('primary_business_id')
        .eq('id', profileId)
        .maybeSingle();
      businessId = prof?.primary_business_id || null;
    }

    // Check if a value_creation_event already exists for this roadmap item
    const { data: existing } = await sb
      .from('value_creation_events')
      .select('id, status')
      .eq('roadmap_item_id', roadmapItemId)
      .maybeSingle();

    if (existing) {
      // Update status to pending_verification if not already verified
      if (existing.status !== 'verified') {
        await sb.from('value_creation_events')
          .update({ status: 'pending_verification', updated_at: now })
          .eq('id', existing.id);
      }
      return Response.json({ vce_id: existing.id, action: 'updated', skipped: existing.status === 'verified' });
    }

    // Build category from source_assessment_type
    const categoryMap = {
      profit_gap: 'profit',
      value_gap: 'valuation',
      tax_gap: 'tax',
      operations_gap: 'operations',
      recast_ebitda: 'valuation',
      freedom_assessment: 'operations',
    };

    // Build payload — try including profile_id, handle gracefully if column doesn't exist
    const vcePayload = {
      business_id: businessId,
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
      confidence_level: 'advisor_reviewed',
      created_at: now,
      updated_at: now,
    };

    // Attempt insert with profile_id; if that column doesn't exist, retry without it
    let vce = null;
    const payloadWithProfile = profileId ? { ...vcePayload, profile_id: profileId } : vcePayload;
    const { data: vce1, error: insertErr1 } = await sb
      .from('value_creation_events')
      .insert(payloadWithProfile)
      .select('id')
      .single();

    if (insertErr1) {
      // If error is about profile_id column not existing, retry without it
      if (insertErr1.message && insertErr1.message.includes('profile_id')) {
        const { data: vce2, error: insertErr2 } = await sb
          .from('value_creation_events')
          .insert(vcePayload)
          .select('id')
          .single();
        if (insertErr2) throw new Error(insertErr2.message);
        vce = vce2;
      } else {
        throw new Error(insertErr1.message);
      }
    } else {
      vce = vce1;
    }

    // Link back to roadmap item
    await sb.from('roadmap_items')
      .update({ value_creation_event_id: vce.id, updated_at: now })
      .eq('id', roadmapItemId);

    // ── Phase 3: Outcome Tracking Hook (additive, non-blocking) ──────────────
    try {
      // Check if outcome already exists for this roadmap item
      const { data: existingOutcome } = await sb
        .from('strategy_outcomes')
        .select('id')
        .eq('source_type', 'roadmap_item')
        .eq('source_id', roadmapItemId)
        .neq('status', 'archived')
        .maybeSingle();

      if (!existingOutcome && profileId && businessId) {
        const outcomeRow = {
          profile_id: profileId,
          business_id: businessId,
          source_type: 'roadmap_item',
          source_id: roadmapItemId,
          source_name: item.title,
          roadmap_item_id: roadmapItemId,
          category: item.source_assessment_type || item.category || null,
          projected_profit_impact: item.estimated_profit_improvement || null,
          projected_tax_impact: item.estimated_tax_savings || null,
          projected_cash_flow_impact: item.estimated_cash_flow_improvement || null,
          total_projected_impact: (item.estimated_profit_improvement || 0) +
            (item.estimated_tax_savings || 0) +
            (item.estimated_cash_flow_improvement || 0) || null,
          status: 'completed_pending_actuals',
          completion_status: 'completed',
          confidence_score: 70,
          should_include_in_learning: true,
          created_at: now,
          updated_at: now,
        };
        await sb.from('strategy_outcomes').insert(outcomeRow);
        console.log('[onRoadmapItemCompleted] Strategy outcome record created for roadmap item:', roadmapItemId);
      }
    } catch (outcomeErr) {
      // Non-fatal — outcome tracking is additive
      console.warn('[onRoadmapItemCompleted] Outcome tracking failed (non-fatal):', outcomeErr.message);
    }

    return Response.json({ vce_id: vce.id, action: 'created', roadmap_item_id: roadmapItemId, business_id: businessId });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});