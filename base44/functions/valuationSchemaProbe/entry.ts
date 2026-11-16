/**
 * valuationSchemaProbe — Diagnostic to inspect live Supabase schema
 * for Phase 13.1A identity-mapping confirmation.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Get a full sample profile to see ALL columns
    const { data: sampleProfile, error: profileErr } = await sb.from('profiles').select('*').limit(1);

    // 2. Try selecting specific identity columns to confirm they exist
    const identityColumns = ['id', 'auth_user_id', 'base44_user_id', 'email', 'app_role', 'role', 'full_name', 'business_id'];
    const columnProbe: Record<string, boolean> = {};
    for (const col of identityColumns) {
      const { error } = await sb.from('profiles').select(col).limit(1);
      columnProbe[col] = !error || !error.message.includes('Could not find');
    }

    // 3. Check business_owners table
    const { data: boSample, error: boErr } = await sb.from('business_owners').select('*').limit(1);
    const businessOwnersExists = !boErr || !boErr.message.includes('Could not find');

    // 4. Check documents table columns
    const { data: docSample, error: docErr } = await sb.from('documents').select('*').limit(1);

    // 5. Check business_entities table
    const { data: beSample, error: beErr } = await sb.from('business_entities').select('*').limit(1);

    // 6. Check assessments table
    const { data: assSample, error: assErr } = await sb.from('assessments').select('*').limit(1);

    // 7. Check gap_analyses table
    const { data: gapSample, error: gapErr } = await sb.from('gap_analyses').select('*').limit(1);

    // 8. Check dashboard_metrics table
    const { data: dmSample, error: dmErr } = await sb.from('dashboard_metrics').select('*').limit(1);

    return Response.json({
      be: beSample?.[0] ? Object.keys(beSample[0]) : null,
      beExists: !beErr || !beErr.message.includes('Could not find'),
      ass: assSample?.[0] ? Object.keys(assSample[0]) : null,
      assExists: !assErr || !assErr.message.includes('Could not find'),
      gap: gapSample?.[0] ? Object.keys(gapSample[0]) : null,
      gapExists: !gapErr || !gapErr.message.includes('Could not find'),
      dm: dmSample?.[0] ? Object.keys(dmSample[0]) : null,
      dmExists: !dmErr || !dmErr.message.includes('Could not find'),
    });
  } catch (err) {
    return Response.json({ error: err.message, stack: err.stack }, { status: 500 });
  }
});