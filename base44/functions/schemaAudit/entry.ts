/**
 * schemaAudit - Complete database schema audit for worksheet/resource migrations
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

    const audit = {};

    // 1. Check which tables exist
    const { data: tables } = await sb.from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .in('table_name', [
        'worksheet_assignments', 
        'worksheet_responses', 
        'resource_assignments', 
        'notifications', 
        'profiles', 
        'documents',
        'worksheets'
      ]);

    audit.existingTables = (tables || []).map(t => t.table_name);

    // 2. Get columns for each table
    const tablesToAudit = ['worksheet_assignments', 'worksheet_responses', 'resource_assignments', 'notifications', 'profiles', 'documents', 'worksheets'];
    
    for (const tableName of tablesToAudit) {
      const { data: columns } = await sb.rpc('exec_sql', { 
        sql: `SELECT column_name, data_type, is_nullable, column_default, udt_name
              FROM information_schema.columns 
              WHERE table_schema = 'public' AND table_name = '${tableName}' 
              ORDER BY ordinal_position` 
      });

      audit[tableName] = {
        exists: audit.existingTables.includes(tableName),
        columns: columns || [],
      };
    }

    // 3. Get indexes
    const { data: indexes } = await sb.rpc('exec_sql', { 
      sql: `SELECT tablename, indexname, indexdef 
            FROM pg_indexes 
            WHERE schemaname = 'public' 
            AND tablename IN ('worksheet_assignments', 'worksheet_responses', 'resource_assignments', 'notifications', 'profiles', 'documents')
            ORDER BY tablename, indexname` 
    });
    audit.indexes = indexes || [];

    // 4. Get foreign keys
    const { data: foreignKeys } = await sb.rpc('exec_sql', { 
      sql: `SELECT 
              conrelid::regclass AS table_name,
              conname AS constraint_name,
              pg_get_constraintdef(oid) AS constraint_def
            FROM pg_constraint
            WHERE contype = 'f'
            AND conrelid::regclass::text IN ('worksheet_assignments', 'worksheet_responses', 'resource_assignments', 'notifications', 'profiles', 'documents')` 
    });
    audit.foreignKeys = foreignKeys || [];

    // 5. Get primary keys
    const { data: primaryKeys } = await sb.rpc('exec_sql', { 
      sql: `SELECT 
              tc.table_name, 
              kc.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kc 
              ON tc.constraint_name = kc.constraint_name 
              AND tc.table_schema = kc.table_schema
            WHERE tc.constraint_type = 'PRIMARY KEY'
            AND tc.table_schema = 'public'
            AND tc.table_name IN ('worksheet_assignments', 'worksheet_responses', 'resource_assignments', 'notifications', 'profiles', 'documents')` 
    });
    audit.primaryKeys = primaryKeys || [];

    // 6. Check Base44 entities
    try {
      const worksheets = await base44.asServiceRole.entities.Worksheet.list(undefined, 5);
      audit.base44Entities = {
        Worksheet: {
          exists: true,
          sampleCount: worksheets?.length || 0,
          fields: worksheets?.[0] ? Object.keys(worksheets[0]).filter(k => !['id', 'created_date', 'updated_date'].includes(k)) : [],
        },
      };
      
      try {
        const notifications = await base44.asServiceRole.entities.Notification.list(undefined, 1);
        audit.base44Entities.Notification = {
          exists: true,
          sampleCount: notifications?.length || 0,
        };
      } catch {
        audit.base44Entities.Notification = { exists: false };
      }
    } catch {
      audit.base44Entities = { Worksheet: { exists: false } };
    }

    // 7. Check for worksheet-related tables that might exist with different names
    const { data: allTables } = await sb.from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public');
    
    audit.allRelatedTables = (allTables || [])
      .filter(t => t.table_name.includes('worksheet') || t.table_name.includes('resource') || t.table_name.includes('assignment'))
      .map(t => t.table_name);

    return Response.json({ audit, timestamp: new Date().toISOString() });

  } catch (err) {
    console.error('[schemaAudit] Error:', err.message);
    return Response.json({ error: err.message, stack: err.stack }, { status: 500 });
  }
});