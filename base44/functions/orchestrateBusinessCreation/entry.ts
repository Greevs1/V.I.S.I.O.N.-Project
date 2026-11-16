/**
 * orchestrateBusinessCreation
 *
 * Canonical single-call business creation pipeline.
 * Stage-level error logging: each critical step logs its stage before execution.
 *
 * Steps:
 *   1. Auth + profile resolution  [CRITICAL]
 *   2. Idempotency check
 *   3. Create or reuse business_entities  [CRITICAL]
 *   4. Create or reuse business_owners   [CRITICAL]
 *   5. Initialize dashboard_metrics      [NON-CRITICAL]
 *   6. Initialize business_metric_snapshots [NON-CRITICAL]
 *   7. Initialize Freedom baseline        [NON-CRITICAL]
 *   8. Return complete business object
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';

function debugId() {
  return `obc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

Deno.serve(async (req) => {
  const debug_id = debugId();
  let stage = 'init';

  try {
    // ── Stage: Auth ──────────────────────────────────────────────────────────
    stage = 'auth';
    console.log(`[${debug_id}] Stage: auth`);
    const base44 = createClientFromRequest(req);
    let user;
    try {
      user = await base44.auth.me();
    } catch (authErr) {
      console.error(`[${debug_id}] Auth failed:`, authErr?.message);
      return Response.json({ success: false, stage, message: "I couldn't create that business yet. Please try once more.", debug_id }, { status: 401 });
    }
    if (!user) {
      return Response.json({ success: false, stage, message: "I couldn't create that business yet. Please try once more.", debug_id }, { status: 401 });
    }
    console.log(`[${debug_id}] Auth OK: ${user.email}`);

    // ── Supabase client ────────────────────────────────────────────────────────
    stage = 'supabase_init';
    console.log(`[${debug_id}] Stage: supabase_init`);
    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SERVICE_KEY) {
      console.error(`[${debug_id}] Supabase env vars missing`);
      return Response.json({ success: false, stage, message: "I couldn't create that business yet. Please try once more.", debug_id }, { status: 500 });
    }
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    console.log(`[${debug_id}] Supabase client ready`);

    // ── Normalize payload ──────────────────────────────────────────────────────
    stage = 'parse_payload';
    const body = await req.json().catch(() => ({}));
    let input = {};
    if (body.action === 'orchestrateBusinessCreation' && body.data) {
      input = body.data;
    } else if (body.name || body.business_name) {
      input = body;
    } else if (body.data) {
      input = body.data;
    }

    const {
      name,
      business_name,
      industry,
      ownership_percentage = 100,
      entity_type = 'Operating Company',
    } = input;

    const resolvedName = (name || business_name || '').trim();
    if (!resolvedName) {
      return Response.json({ success: false, stage: 'validation', message: 'Business name is required.', debug_id }, { status: 400 });
    }
    console.log(`[${debug_id}] Business name: "${resolvedName}"`);

    // ── Stage 1: Resolve profile ────────────────────────────────────────────
    stage = 'profile_lookup';
    console.log(`[${debug_id}] Stage: profile_lookup for ${user.email}`);
    const { data: profile, error: profileErr } = await sb
      .from('profiles')
      .select('id, primary_business_id, email')
      .eq('email', user.email)
      .maybeSingle();

    if (profileErr) {
      console.error(`[${debug_id}] Profile lookup error:`, profileErr.message, profileErr.code);
      return Response.json({ success: false, stage, message: "I couldn't create that business yet. Please try once more.", debug_id }, { status: 500 });
    }
    if (!profile) {
      console.error(`[${debug_id}] Profile not found for ${user.email}`);
      return Response.json({ success: false, stage, message: 'Profile not found. Please ensure your account is fully set up.', debug_id }, { status: 404 });
    }
    const profileId = profile.id;
    console.log(`[${debug_id}] Profile resolved: ${profileId}`);

    const warnings = [];
    const normalizedName = resolvedName.toLowerCase().trim();

    // ── Stage 2: Idempotency check ──────────────────────────────────────────
    stage = 'idempotency_check';
    console.log(`[${debug_id}] Stage: idempotency_check`);
    let existingBusiness = null;
    try {
      const { data: ownerRows } = await sb
        .from('business_owners')
        .select('business_id')
        .eq('profile_id', profileId);

      const ownedIds = (ownerRows || []).map(r => r.business_id).filter(Boolean);

      if (ownedIds.length > 0) {
        const { data: ownedBizRows } = await sb
          .from('business_entities')
          .select('id, business_name, entity_type')
          .in('id', ownedIds);

        for (const biz of (ownedBizRows || [])) {
          if (biz.business_name && biz.business_name.toLowerCase().trim() === normalizedName) {
            existingBusiness = biz;
            console.log(`[${debug_id}] Idempotency: found existing business ${biz.id}`);
            break;
          }
        }
      }
    } catch (idErr) {
      console.warn(`[${debug_id}] Idempotency check failed (non-fatal, will try to create):`, idErr?.message);
    }

    // ── Stage 3: Create or reuse business_entities ──────────────────────────
    stage = 'business_entities_create';
    let business = existingBusiness;
    const isExisting = !!existingBusiness;

    if (!business) {
      console.log(`[${debug_id}] Stage: business_entities INSERT`);
      const insertPayload = {
        business_name: resolvedName,
        entity_type: entity_type,
        industry: industry || null,
      };
      console.log(`[${debug_id}] business_entities payload:`, JSON.stringify(insertPayload));

      const { data: newBiz, error: bizErr } = await sb
        .from('business_entities')
        .insert(insertPayload)
        .select()
        .single();

      if (bizErr) {
        console.error(`[${debug_id}] business_entities INSERT failed: code=${bizErr.code} msg=${bizErr.message} detail=${bizErr.details} hint=${bizErr.hint}`);
        return Response.json({
          success: false,
          stage,
          message: "I couldn't create that business yet. Please try once more.",
          debug_id,
          _debug: { code: bizErr.code, hint: bizErr.hint, detail: bizErr.details }
        }, { status: 500 });
      }
      if (!newBiz) {
        console.error(`[${debug_id}] business_entities INSERT returned no row`);
        return Response.json({ success: false, stage, message: "I couldn't create that business yet. Please try once more.", debug_id }, { status: 500 });
      }
      business = newBiz;
      console.log(`[${debug_id}] business_entities created: ${business.id}`);
    }

    const businessId = business.id;

    // ── Stage 4: Create or reuse business_owners ────────────────────────────
    stage = 'business_owners_create';
    console.log(`[${debug_id}] Stage: business_owners`);
    try {
      const { data: existingOwner } = await sb
        .from('business_owners')
        .select('id')
        .eq('profile_id', profileId)
        .eq('business_id', businessId)
        .maybeSingle();

      if (!existingOwner) {
        const isPrimary = !profile.primary_business_id;
        const { error: ownerErr } = await sb
          .from('business_owners')
          .insert({
            profile_id: profileId,
            business_id: businessId,
            ownership_percentage: ownership_percentage,
            ownership_type: 'direct_individual',
            is_primary_owner: isPrimary,
          });

        if (ownerErr) {
          console.error(`[${debug_id}] business_owners INSERT failed: code=${ownerErr.code} msg=${ownerErr.message}`);
          // This is still critical — fail if ownership can't be created
          return Response.json({ success: false, stage, message: "I couldn't create that business yet. Please try once more.", debug_id }, { status: 500 });
        }
        console.log(`[${debug_id}] business_owners created`);
      } else {
        console.log(`[${debug_id}] business_owners already exists`);
      }
    } catch (ownErr) {
      console.error(`[${debug_id}] business_owners exception:`, ownErr?.message);
      return Response.json({ success: false, stage, message: "I couldn't create that business yet. Please try once more.", debug_id }, { status: 500 });
    }

    // Update primary_business_id if first business
    if (!profile.primary_business_id) {
      try {
        await sb.from('profiles').update({ primary_business_id: businessId }).eq('id', profileId);
        console.log(`[${debug_id}] primary_business_id set on profile`);
      } catch (e) {
        warnings.push(`Could not set primary_business_id: ${e.message}`);
      }
    }

    // ── Stage 5: Initialize dashboard_metrics [NON-CRITICAL] ─────────────────
    stage = 'dashboard_metrics_init';
    console.log(`[${debug_id}] Stage: dashboard_metrics_init`);
    let dashboardMetricsInitialized = false;
    try {
      const { data: existingMetrics } = await sb
        .from('dashboard_metrics')
        .select('id')
        .eq('business_id', businessId)
        .eq('profile_id', profileId)
        .maybeSingle();

      if (!existingMetrics) {
        const { error: metricsErr } = await sb
          .from('dashboard_metrics')
          .insert({
            profile_id: profileId,
            business_id: businessId,
          });

        if (metricsErr) {
          console.warn(`[${debug_id}] dashboard_metrics init failed (non-fatal): code=${metricsErr.code} msg=${metricsErr.message}`);
          warnings.push(`Dashboard metrics: ${metricsErr.message}`);
        } else {
          dashboardMetricsInitialized = true;
        }
      } else {
        dashboardMetricsInitialized = true;
      }
    } catch (e) {
      console.warn(`[${debug_id}] dashboard_metrics exception (non-fatal):`, e?.message);
      warnings.push(`Dashboard metrics exception: ${e.message}`);
    }

    // ── Stage 6: Initialize business_metric_snapshots [NON-CRITICAL] ─────────
    stage = 'metric_snapshot_init';
    console.log(`[${debug_id}] Stage: metric_snapshot_init`);
    let metricSnapshotInitialized = false;
    try {
      const { data: existingSnap } = await sb
        .from('business_metric_snapshots')
        .select('id')
        .eq('business_id', businessId)
        .eq('profile_id', profileId)
        .maybeSingle();

      if (!existingSnap) {
        const { error: snapErr } = await sb
          .from('business_metric_snapshots')
          .insert({
            profile_id: profileId,
            business_id: businessId,
            is_latest: true,
            overall_impact_score: 0,
          });

        if (snapErr) {
          console.warn(`[${debug_id}] metric_snapshots init failed (non-fatal): code=${snapErr.code} msg=${snapErr.message}`);
          warnings.push(`Metric snapshot: ${snapErr.message}`);
        } else {
          metricSnapshotInitialized = true;
        }
      } else {
        metricSnapshotInitialized = true;
      }
    } catch (e) {
      console.warn(`[${debug_id}] metric_snapshot exception (non-fatal):`, e?.message);
      warnings.push(`Metric snapshot exception: ${e.message}`);
    }

    // ── Stage 7: Freedom baseline [NON-CRITICAL] ─────────────────────────────
    stage = 'freedom_baseline';
    console.log(`[${debug_id}] Stage: freedom_baseline`);
    let freedomBaselineInitialized = false;
    try {
      await base44.functions.invoke('calculateFreedomPaths', {
        businessId: businessId,
        profileId: profileId,
        initOnly: true,
      });
      freedomBaselineInitialized = true;
      console.log(`[${debug_id}] Freedom baseline initialized`);
    } catch (e) {
      console.warn(`[${debug_id}] Freedom baseline failed (non-fatal):`, e?.message);
      warnings.push(`Freedom baseline: ${e.message}`);
    }

    // ── Stage 8: Return success ───────────────────────────────────────────────
    stage = 'done';
    console.log(`[${debug_id}] SUCCESS: business ${businessId} created for profile ${profileId}. Warnings: ${warnings.length}`);
    if (warnings.length > 0) console.log(`[${debug_id}] Warnings:`, warnings.join(' | '));

    return Response.json({
      success: true,
      business: {
        id: businessId,
        name: business.business_name,
        industry: industry || business.industry || null,
        entity_type: business.entity_type || entity_type,
      },
      ownership: {
        profile_id: profileId,
        business_id: businessId,
        ownership_percentage: ownership_percentage,
      },
      initialized: {
        dashboard_metrics: dashboardMetricsInitialized,
        metric_snapshot: metricSnapshotInitialized,
        freedom_baseline: freedomBaselineInitialized,
      },
      existing: isExisting,
      warnings: warnings,
      debug_id,
    });

  } catch (error) {
    console.error(`[${debugId()}] UNHANDLED at stage="${stage}": ${error?.message}`, error?.stack);
    return Response.json({
      success: false,
      stage,
      message: "I couldn't create that business yet. Please try once more.",
      debug_id,
    }, { status: 500 });
  }
});