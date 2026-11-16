/**
 * Quick diagnostic: Check worksheet_assignments table directly
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
    
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return Response.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Check worksheet_assignments
    const { data: assignments, error: assignErr } = await sb.from('worksheet_assignments')
      .select('id, worksheet_id, assigned_to_profile_id, assigned_to_business_id, assigned_by_profile_id, status, due_date, scheduled_for, created_at')
      .order('created_at', { ascending: false })
      .limit(20);

    // Check profiles
    const { data: profiles, error: profileErr } = await sb.from('profiles')
      .select('id, email, full_name, primary_business_id')
      .order('created_at', { ascending: false })
      .limit(10);

    return Response.json({
      worksheet_assignments: {
        count: assignments?.length || 0,
        error: assignErr?.message,
        rows: assignments || [],
      },
      profiles: {
        count: profiles?.length || 0,
        error: profileErr?.message,
        rows: profiles || [],
      },
    });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});