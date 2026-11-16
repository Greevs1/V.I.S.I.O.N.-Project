/**
 * getBusinessIntelligenceContract — exposes the Shared Supabase Intelligence Contract.
 *
 * This is the SINGLE certified current-business intelligence state.
 * Consumed by Dashboard, Executive Brief, Galileo, and Living Intelligence.
 *
 * Inputs: { business_id | active_business_id }
 *   Business is resolved through the canonical business contract. It is NEVER
 *   inferred from the actor, and primary_business_id is never substituted for an
 *   explicit selection on a multi-business account.
 * Returns: { contract: BusinessIntelligenceContract }
 *
 * Contract versioning:
 *   contract_version — schema version
 *   generated_at — when this instance was built
 *   Consumers compare generated_at to verify they are using the same state.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildBusinessIntelligenceContract } from '../../shared/intelligenceContract/businessIntelligenceContract.ts';
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
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body = await req.json().catch(() => ({}));

    // ── Phase 6.9B — ACTOR IDENTITY ───────────────────────────────────────────
    // The profile is resolved from the AUTHENTICATED SESSION only. `body.profile_id`
    // previously short-circuited this lookup entirely, so a caller could assert any
    // profile id — and therefore any role — as their own.
    const { data: profile } = await sb
      .from('profiles')
      .select('id, primary_business_id, app_role')
      .eq('email', user.email)
      .maybeSingle();

    // ── Phase 6.9B — BUSINESS IDENTITY ────────────────────────────────────────
    // Authoritative business read layer: never silently choose primary_business_id
    // for a multi-business account.
    //   explicit authorized business → that business
    //   single-business account       → unambiguous default
    //   multi-business, no explicit   → 400 BUSINESS_CONTEXT_REQUIRED
    //   foreign / unauthorized        → 403 BUSINESS_CONTEXT_DENIED
    const { businessId, denial } = await requireBusinessContext(
      sb,
      profile,
      body?.active_business_id || body?.business_id,
      'getBusinessIntelligenceContract'
    );
    if (denial) return denial;
    if (!businessId) {
      return Response.json(
        { error: 'business_id required', code: 'BUSINESS_CONTEXT_REQUIRED' },
        { status: 400 }
      );
    }

    const contract = await buildBusinessIntelligenceContract(sb, businessId, profile?.id);
    return Response.json({ contract });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});