// Temporary probe function — reads profile_financials schema
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin' && user.role !== 'super_admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    // Try to select all columns with a broad select and limit 0 — reveals schema via PostgREST
    const { data, error } = await sb.from('profile_financials').select('*').limit(2);
    
    // Try specific columns we need
    const colChecks = {};
    const targetCols = [
      'annual_personal_expenses', 'investable_assets', 'total_personal_debt',
      'passive_income', 'desired_lifestyle_adjustment', 'safe_withdrawal_rate',
      'lifestyle_adjustment', 'primary_goal'
    ];
    for (const col of targetCols) {
      const { data: cd, error: ce } = await sb.from('profile_financials').select(col).limit(0);
      colChecks[col] = ce ? { exists: false, error: ce.message } : { exists: true };
    }

    return Response.json({
      tableExists: !error,
      tableError: error?.message || null,
      sampleRow: data?.[0] || null,
      allColumns: data?.[0] ? Object.keys(data[0]) : [],
      columnChecks: colChecks,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});