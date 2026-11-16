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

    // Query information_schema for columns
    const tables = [
      'ninety_day_sprint_paths',
      'ninety_day_sprint_tasks',
      'business_strategy_workspaces',
      'ninety_day_sprint_notes',
      'sprint_notes',
      'task_notes',
    ];
    const results = {};

    for (const table of tables) {
      try {
        const { data, error } = await sb
          .from('information_schema.columns')
          .select('column_name, data_type, is_nullable')
          .eq('table_schema', 'public')
          .eq('table_name', table);

        if (error) {
          results[table] = { error: error.message };
        } else if (data && data.length > 0) {
          results[table] = { columns: data.map(c => `${c.column_name} (${c.data_type}${c.is_nullable === 'YES' ? '?' : ''})`) };
        } else {
          results[table] = null; // table doesn't exist or no access
        }
      } catch (e) {
        results[table] = { error: e.message };
      }
    }

    return Response.json(results);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});