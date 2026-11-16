/**
 * debugDashboardMetricsSchema
 * 
 * Inspects the dashboard_metrics table schema and tests JSONB updates.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';

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

    const businessId = profile.primary_business_id;

    // Step 1: Get table schema
    const { data: schema, error: schemaErr } = await sb.rpc('get_table_schema', { table_name: 'dashboard_metrics' });
    
    // Step 2: Query existing dashboard_metrics row
    let query = sb.from('dashboard_metrics').select('*');
    if (businessId) {
      query = query.eq('business_id', businessId);
    } else {
      query = query.eq('profile_id', profile.id);
    }
    const { data: existingRow, error: fetchErr } = await query.maybeSingle();

    // Step 3: Test JSONB upsert with explicit structure
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

    const insertPayload = {
      profile_id: profile.id,
      business_id: businessId,
      profit_gap: testProfitGap,
      value_gap: testValueGap,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Try INSERT
    const { data: insertResult, error: insertErr, status, statusText } = await sb
      .from('dashboard_metrics')
      .insert(insertPayload)
      .select();

    // Step 4: Verify the insert
    let verifyQuery = sb.from('dashboard_metrics').select('*');
    if (businessId) {
      verifyQuery = verifyQuery.eq('business_id', businessId);
    } else {
      verifyQuery = verifyQuery.eq('profile_id', profile.id);
    }
    const { data: verifiedRow, error: verifyErr } = await verifyQuery.maybeSingle();

    return Response.json({
      schema_error: schemaErr,
      schema: schema || null,
      fetch_error: fetchErr,
      existing_row: existingRow,
      insert_payload: insertPayload,
      insert_result: insertResult,
      insert_error: insertErr,
      insert_status: status,
      insert_status_text: statusText,
      verify_error: verifyErr,
      verified_row: verifiedRow,
      business_id: businessId,
      profile_id: profile.id
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});