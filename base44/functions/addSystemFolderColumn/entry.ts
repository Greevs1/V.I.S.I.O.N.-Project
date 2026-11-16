/**
 * addSystemFolderColumn
 * One-time migration: adds system_folder TEXT column to documents table.
 * Uses the Supabase Management API (read-only connector) to verify,
 * and the service role PostgREST to attempt the column add via a stored procedure.
 * If that fails, returns the manual SQL for the user to run.
 * Admin-only.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const SUPABASE_URL = (Deno.env.get('VITE_SUPABASE_URL') || '').replace(/\/(rest\/v1\/?|auth\/v1\/?).*$/, '').replace(/\/$/, '');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return Response.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Step 1: Check if column already exists
    const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
    if (!projectRef) {
      return Response.json({ error: 'Could not extract project ref from SUPABASE_URL' }, { status: 500 });
    }

    // Check column via PostgREST query on information_schema
    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/check_column_exists`,
      {
        method: 'POST',
        headers: {
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_table: 'documents', p_column: 'system_folder' })
      }
    );

    // If the RPC doesn't exist, try a direct documents query and check for the column
    let columnExists = false;
    if (checkRes.ok) {
      const checkData = await checkRes.json();
      columnExists = !!checkData;
    } else {
      // Fallback: try to SELECT the column — if it errors, it doesn't exist
      const testRes = await fetch(
        `${SUPABASE_URL}/rest/v1/documents?select=system_folder&limit=1`,
        {
          headers: {
            'apikey': SERVICE_KEY,
            'Authorization': `Bearer ${SERVICE_KEY}`,
          }
        }
      );
      columnExists = testRes.ok;
    }

    if (columnExists) {
      return Response.json({
        success: true,
        message: 'Column system_folder already exists in documents table.',
        action_needed: false,
      });
    }

    // Column does not exist — provide the SQL to run manually
    const sql = `-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/${projectRef}/sql
ALTER TABLE documents ADD COLUMN IF NOT EXISTS system_folder TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_system_folder ON documents (system_folder) WHERE system_folder IS NOT NULL;`;

    return Response.json({
      success: false,
      column_exists: false,
      action_needed: true,
      message: 'The system_folder column does not exist. Run the SQL below in Supabase SQL Editor.',
      sql_to_run: sql,
      supabase_sql_editor_url: `https://supabase.com/dashboard/project/${projectRef}/sql/new`,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});