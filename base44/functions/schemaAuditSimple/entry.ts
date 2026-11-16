/**
 * schemaAuditSimple - Uses standard Supabase queries (no exec_sql)
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
    
    console.log('[schemaAuditSimple] SUPABASE_URL:', SUPABASE_URL ? 'exists' : 'MISSING');
    console.log('[schemaAuditSimple] SERVICE_KEY:', SERVICE_KEY ? 'exists (' + SERVICE_KEY.length + ' chars)' : 'MISSING');
    
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return Response.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const audit = {
      timestamp: new Date().toISOString(),
      tables: {},
      base44Entities: {},
    };

    // Try to query each table directly
    const tablesToCheck = [
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
    ];

    for (const tableName of tablesToCheck) {
      try {
        // Try to select 1 row to see if table exists
        const { data, error } = await sb.from(tableName).select('*').limit(1);
        
        if (error) {
          audit.tables[tableName] = {
            exists: false,
            error: error.message,
            columns: [],
          };
        } else {
          // Table exists - get column names from the result
          const columns = data && data.length > 0 
            ? Object.keys(data[0]).map(col => ({ column_name: col, data_type: 'unknown', is_nullable: 'YES' }))
            : [];
          
          audit.tables[tableName] = {
            exists: true,
            error: null,
            columns,
            rowCount: data?.length || 0,
          };
        }
      } catch (err) {
        audit.tables[tableName] = {
          exists: false,
          error: err.message,
          columns: [],
        };
      }
    }

    // Check Base44 entities
    try {
      const worksheets = await base44.asServiceRole.entities.Worksheet.list(undefined, 1);
      audit.base44Entities.Worksheet = {
        exists: true,
        sampleCount: worksheets?.length || 0,
        fields: worksheets?.[0] ? Object.keys(worksheets[0]).filter(k => !['id', 'created_date', 'updated_date'].includes(k)) : [],
      };
    } catch (err) {
      audit.base44Entities.Worksheet = { exists: false, error: err.message };
    }

    try {
      const notifications = await base44.asServiceRole.entities.Notification.list(undefined, 1);
      audit.base44Entities.Notification = {
        exists: true,
        sampleCount: notifications?.length || 0,
      };
    } catch (err) {
      audit.base44Entities.Notification = { exists: false, error: err.message };
    }

    // Check profiles specifically
    try {
      const { data: profiles } = await sb.from('profiles').select('id, email, app_role, onboarding_completed').limit(5);
      if (profiles) {
        audit.tables.profiles = {
          exists: true,
          error: null,
          columns: Object.keys(profiles[0]).map(col => ({ column_name: col })),
          sampleData: profiles,
        };
      }
    } catch (err) {
      audit.tables.profiles = { exists: false, error: err.message };
    }

    return Response.json(audit);

  } catch (err) {
    console.error('[schemaAuditSimple] Error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});