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

    const profile = await sb.from('profiles').select('id').eq('email', user.email).maybeSingle();
    const profileId = profile?.data?.id;
    const businessId = profile?.data?.primary_business_id;

    const results = {};

    // Insert path with known columns
    const { data: path, error: pathErr } = await sb.from('ninety_day_sprint_paths').insert({
      path_title: 'Test Path',
      path_goal: 'Test goal',
      path_summary: 'Test summary',
      galileo_confidence: 85,
      progress_percent: 0,
      profile_id: profileId,
      business_id: businessId,
      status: 'draft',
    }).select();

    if (pathErr) {
      results.path_error = pathErr.message;
    } else if (path?.[0]) {
      results.path_columns = Object.keys(path[0]);
      results.path_row = path[0];
    }

    // Insert task with known columns  
    if (path?.[0]) {
      const { data: task, error: taskErr } = await sb.from('ninety_day_sprint_tasks').insert({
        title: 'Test Task',
        path_id: path[0].id,
        status: 'not_started',
        profile_id: profileId,
        business_id: businessId,
      }).select();

      if (taskErr) {
        results.task_error = taskErr.message;
      } else if (task?.[0]) {
        results.task_columns = Object.keys(task[0]);
        results.task_row = task[0];
      }

      // Cleanup
      await sb.from('ninety_day_sprint_tasks').delete().eq('path_id', path[0].id);
    }
    // Cleanup path
    if (path?.[0]) await sb.from('ninety_day_sprint_paths').delete().eq('id', path[0].id);

    return Response.json(results);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});