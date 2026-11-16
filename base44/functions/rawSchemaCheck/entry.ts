/**
 * rawSchemaCheck - Direct SQL query to check actual table existence
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
    
    console.log('[rawSchemaCheck] SUPABASE_URL exists:', !!rawUrl);
    console.log('[rawSchemaCheck] SERVICE_KEY exists:', !!SERVICE_KEY);
    
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return Response.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Direct SQL to list all tables
    const { data: allTables, error: tableError } = await sb.rpc('exec_sql', {
      sql: `SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name`
    });

    if (tableError) {
      console.error('[rawSchemaCheck] Table query error:', tableError);
    }

    // Check specific tables
    const targetTables = [
      'worksheet_assignments',
      'worksheet_responses', 
      'resource_assignments',
      'notifications',
      'profiles',
      'documents',
      'worksheets',
      'users',
      'businesses',
      'advisor_assignments',
      'user_achievements',
      'document_analysis',
      'extracted_fields',
      'value_creation_events',
      'roadmap_items',
      'business_opportunities',
      'next_best_actions',
      'business_assessments',
      'gap_analyses',
      'dashboard_metrics',
      'business_metric_snapshots',
      'profile_financials',
      'business_entities'
    ];

    const tableChecks = {};
    for (const tableName of targetTables) {
      const { data, error } = await sb.rpc('exec_sql', {
        sql: `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = '${tableName}'
        ) as exists`
      });
      tableChecks[tableName] = {
        exists: data?.[0]?.exists || false,
        error: error?.message || null
      };
    }

    // Get columns for tables that exist
    const existingTables = targetTables.filter(t => tableChecks[t].exists);
    const columnDetails = {};
    
    for (const tableName of existingTables.slice(0, 5)) { // Limit to first 5 to avoid timeout
      const { data: columns } = await sb.rpc('exec_sql', {
        sql: `SELECT column_name, data_type, is_nullable, column_default
              FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = '${tableName}'
              ORDER BY ordinal_position`
      });
      columnDetails[tableName] = columns || [];
    }

    return Response.json({
      allTables: (allTables || []).map(t => t.table_name),
      tableChecks,
      existingTables,
      columnDetails,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('[rawSchemaCheck] Error:', err.message, err.stack);
    return Response.json({ error: err.message, stack: err.stack }, { status: 500 });
  }
});