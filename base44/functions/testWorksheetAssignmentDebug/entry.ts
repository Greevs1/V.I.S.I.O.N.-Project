/**
 * WORKSHEET ASSIGNMENT DEBUG FUNCTION
 * Call this to test if worksheet_assignments table is working
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

    // Get table schema
    const { data: columns } = await sb.rpc('information_schema.columns', { 
      table_schema: 'public', 
      table_name: 'worksheet_assignments' 
    }, { head: true });

    // Get existing rows
    const { data: existingRows } = await sb.from('worksheet_assignments')
      .select('id, worksheet_id, assigned_to_profile_id, assigned_by_profile_id, status, created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    // Test insert
    let insertResult;
    try {
      const testPayload = {
        worksheet_id: 'test-worksheet-' + Date.now(),
        assigned_to_profile_id: user.id,
        assigned_to_business_id: null,
        assigned_by_profile_id: user.id,
        status: 'assigned',
        due_date: null,
        scheduled_for: null,
        reminder_settings: { type: 'none', method: 'in_app', enabled: false },
      };

      const { data: inserted, error: insertErr } = await sb.from('worksheet_assignments')
        .insert(testPayload)
        .select()
        .single();

      if (insertErr) {
        insertResult = { success: false, error: insertErr.message, details: insertErr };
      } else {
        insertResult = { success: true, row: inserted };
        // Clean up test row
        await sb.from('worksheet_assignments').delete().eq('id', inserted.id);
      }
    } catch (e) {
      insertResult = { success: false, error: e.message };
    }

    return Response.json({
      test_timestamp: new Date().toISOString(),
      table_schema: {
        column_count: columns?.length || 0,
        columns: columns || [],
      },
      existing_rows: {
        count: existingRows?.length || 0,
        rows: existingRows || [],
      },
      insert_test: insertResult,
    });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});