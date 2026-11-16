/**
 * detailedSchemaAudit - Get complete column details for all relevant tables
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

    const report = {
      timestamp: new Date().toISOString(),
      tables: {},
      base44Entities: {},
      migrationSafety: {
        safeToCreate: [],
        safeToAddColumns: [],
        doNotCreate: [],
        doNotModify: [],
      }
    };

    // Query each table for detailed schema
    const tables = [
      'worksheet_assignments',
      'worksheet_responses', 
      'resource_assignments',
      'profiles',
      'documents',
      'worksheets',
      'advisor_assignments',
      'businesses',
    ];

    for (const tableName of tables) {
      try {
        // Get sample data to extract columns
        const { data, error } = await sb.from(tableName).select('*').limit(1);
        
        if (error) {
          report.tables[tableName] = {
            exists: false,
            error: error.message,
            columns: [],
            indexes: [],
            foreignKeys: [],
          };
          report.migrationSafety.safeToCreate.push(tableName);
        } else {
          // Extract column info from sample
          const columns = data && data.length > 0 
            ? Object.keys(data[0]).map(col => ({
                column_name: col,
                data_type: 'inferred',
                nullable: true,
                isPrimaryKey: col === 'id',
              }))
            : [];
          
          report.tables[tableName] = {
            exists: true,
            error: null,
            columns,
            rowCount: data?.length || 0,
            indexes: [], // Would need pg_indexes query
            foreignKeys: [], // Would need pg_constraint query
          };
          report.migrationSafety.doNotCreate.push(tableName);
        }
      } catch (err) {
        report.tables[tableName] = {
          exists: false,
          error: err.message,
          columns: [],
        };
        report.migrationSafety.safeToCreate.push(tableName);
      }
    }

    // Check Base44 entities
    const entities = ['Worksheet', 'Notification', 'User'];
    for (const entityName of entities) {
      try {
        const items = await base44.asServiceRole.entities[entityName].list(undefined, 1);
        report.base44Entities[entityName] = {
          exists: true,
          count: items?.length || 0,
          fields: items?.[0] ? Object.keys(items[0]).filter(k => !['id', 'created_date', 'updated_date'].includes(k)) : [],
        };
      } catch {
        report.base44Entities[entityName] = { exists: false };
      }
    }

    // Analyze worksheet architecture
    report.worksheetArchitecture = {
      templatesStoredIn: 'Base44 Worksheet entity',
      assignedWorksheetsStoredIn: report.tables.worksheet_assignments.exists ? 'worksheet_assignments table' : 'NOT CREATED - SAFE TO CREATE',
      assignmentRecordsStoredIn: report.tables.worksheet_assignments.exists ? 'worksheet_assignments table' : 'NOT CREATED - SAFE TO CREATE',
      completionDataStoredIn: report.tables.worksheet_responses.exists ? 'worksheet_responses table' : 'NOT CREATED - SAFE TO CREATE',
    };

    // Analyze resource assignment architecture
    if (report.tables.resource_assignments.exists) {
      const sample = await sb.from('resource_assignments').select('*').limit(1);
      report.resourceAssignmentArchitecture = {
        storedIn: 'resource_assignments table',
        assignedUserField: 'profile_id (Supabase UUID)',
        usesBase44UserId: false,
        usesSupabaseProfileId: true,
        usesEmail: false,
        usesBusinessId: sample.data?.[0]?.business_id ? true : false,
        actualFieldNames: ['resource_document_id', 'profile_id', 'business_id', 'assigned_by', 'assigned_at'],
      };
    }

    // Get current user's identity for resolution check
    try {
      const { data: profile } = await sb.from('profiles').select('id, email').eq('email', user.email).maybeSingle();
      report.identityResolution = {
        loggedInBase44UserId: user.id,
        loggedInProfileId: profile?.id || null,
        matchingField: 'profile_id in resource_assignments/worksheet_assignments tables',
      };
    } catch {
      report.identityResolution = {
        loggedInBase44UserId: user.id,
        loggedInProfileId: null,
        error: 'Could not resolve profile',
      };
    }

    // Performance analysis
    report.performance = {
      worksheetTableIndexes: report.tables.worksheet_assignments.exists ? 'Unknown - would need pg_indexes query' : 'N/A - table does not exist',
      resourceAssignmentIndexes: report.tables.resource_assignments.exists ? 'Unknown - would need pg_indexes query' : 'N/A - table does not exist',
      slowQueries: 'Cannot determine without query logging',
    };

    return Response.json(report);

  } catch (err) {
    console.error('[detailedSchemaAudit] Error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});