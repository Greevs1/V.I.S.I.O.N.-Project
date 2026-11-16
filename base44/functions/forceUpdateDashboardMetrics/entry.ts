/**
 * forceUpdateDashboardMetrics
 * 
 * Direct test to force-update dashboard_metrics JSONB columns with explicit objects.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireBusinessContext } from '../../shared/businessScope/activeBusiness.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin' && user.role !== 'super_admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const SUPABASE_URL = (Deno.env.get('VITE_SUPABASE_URL') || '').replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SERVICE_KEY) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: profile } = await sb.from('profiles').select('id, primary_business_id').eq('email', user.email).maybeSingle();
    if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });

    const profileId = profile.id;
    // Phase 6.9B — canonical resolution. Was `profile.primary_business_id`.
    const { businessId, denial: bizDenial } = await requireBusinessContext(
      sb, profile, null, 'forceUpdateDashboardMetrics'
    );
    if (bizDenial) return bizDenial;

    // Define explicit JSONB objects
    const testProfitGap = {
      completed: true,
      gap_to_best: 0,
      amount: 0,
      source: "assessment"
    };
    
    const testValueGap = {
      completed: true,
      gap_amount: 0,
      amount: 0,
      source: "assessment"
    };

    const updatePayload = {
      profit_gap: testProfitGap,
      value_gap: testValueGap,
      updated_at: new Date().toISOString()
    };

    // Query existing row
    let query = sb.from('dashboard_metrics').select('*');
    if (businessId) {
      query = query.eq('business_id', businessId);
    } else {
      query = query.eq('profile_id', profileId);
    }
    const { data: existingDM } = await query.maybeSingle();

    if (existingDM) {
      // UPDATE existing row
      const { data, error, status, statusText } = await sb
        .from('dashboard_metrics')
        .update(updatePayload)
        .eq('id', existingDM.id)
        .select();

      return Response.json({
        mode: 'update',
        existing_dm_id: existingDM.id,
        existing_dm_business_id: existingDM.business_id,
        update_payload: updatePayload,
        response_data: data,
        response_error: error,
        response_status: status,
        response_status_text: statusText,
        row_count: data?.length || 0,
        profit_gap_after: data?.[0]?.profit_gap,
        value_gap_after: data?.[0]?.value_gap,
      });
    } else {
      // INSERT new row
      const insertPayload = {
        profile_id: profileId,
        business_id: businessId,
        profit_gap: testProfitGap,
        value_gap: testValueGap,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data, error, status, statusText } = await sb
        .from('dashboard_metrics')
        .insert(insertPayload)
        .select();

      return Response.json({
        mode: 'insert',
        insert_payload: insertPayload,
        response_data: data,
        response_error: error,
        response_status: status,
        response_status_text: statusText,
        row_count: data?.length || 0,
        profit_gap_after: data?.[0]?.profit_gap,
        value_gap_after: data?.[0]?.value_gap,
      });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});