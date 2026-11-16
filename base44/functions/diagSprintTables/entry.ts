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

    const tables = [
      'business_strategy_workspaces',
      'ninety_day_sprint_paths',
      'ninety_day_sprint_tasks',
      'notes',
      'reminders',
    ];

    const results = {};

    for (const table of tables) {
      try {
        const { data, error, count } = await sb.from(table).select('*', { count: 'exact', head: false }).limit(2);
        if (error) {
          results[table] = { exists: false, error: error.message, code: error.code };
        } else {
          const row = data?.[0];
          results[table] = {
            exists: true,
            rowCount: data?.length,
            count,
            columns: row ? Object.keys(row) : [],
            sampleValues: row ? Object.fromEntries(
              Object.entries(row).slice(0, 12).map(([k, v]) => [k, typeof v === 'string' && v.length > 60 ? v.slice(0, 60) + '...' : v])
            ) : null,
          };
        }
      } catch (e) {
        results[table] = { exists: false, error: e.message };
      }
    }

    return Response.json(results);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});