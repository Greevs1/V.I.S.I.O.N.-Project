/**
 * Test worksheet assignment flow end-to-end
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

    const testResults = { timestamp: new Date().toISOString(), tests: [] };

    // Test 1: Check worksheet_assignments table schema
    try {
      const { data: columns } = await sb.from('information_schema.columns')
        .select('column_name, data_type')
        .eq('table_name', 'worksheet_assignments');
      
      const columnNames = (columns || []).map(c => c.column_name);
      const hasRequired = [
        'worksheet_id', 'assigned_to_profile_id', 'assigned_to_business_id',
        'assigned_by_profile_id', 'status', 'due_date', 'scheduled_for',
        'reminder_settings', 'assigned_at', 'completed_at', 'cancelled_at'
      ].every(col => columnNames.includes(col));

      testResults.tests.push({
        name: 'worksheet_assignments schema',
        status: hasRequired ? 'PASS' : 'FAIL',
        details: hasRequired ? 'All required columns exist' : `Missing columns. Has: ${columnNames.join(', ')}`,
      });
    } catch (err) {
      testResults.tests.push({
        name: 'worksheet_assignments schema',
        status: 'FAIL',
        details: err.message,
      });
    }

    // Test 2: Check indexes
    try {
      const { data: indexes } = await sb.from('pg_indexes')
        .select('indexname')
        .eq('tablename', 'worksheet_assignments');
      
      const indexNames = (indexes || []).map(i => i.indexname);
      const hasIndexes = [
        'idx_wa_profile_status',
        'idx_wa_profile_created',
        'idx_wa_scheduled'
      ].some(idx => indexNames.some(n => n.includes(idx.replace('idx_wa_', ''))));

      testResults.tests.push({
        name: 'worksheet_assignments indexes',
        status: hasIndexes ? 'PASS' : 'WARN',
        details: hasIndexes ? 'Performance indexes exist' : `Indexes: ${indexNames.join(', ')}`,
      });
    } catch (err) {
      testResults.tests.push({
        name: 'worksheet_assignments indexes',
        status: 'FAIL',
        details: err.message,
      });
    }

    // Test 3: Count worksheet assignments
    try {
      const { count } = await sb.from('worksheet_assignments').select('*', { count: 'exact', head: true });
      testResults.tests.push({
        name: 'worksheet_assignments count',
        status: 'INFO',
        details: `${count || 0} records in table`,
      });
    } catch (err) {
      testResults.tests.push({
        name: 'worksheet_assignments count',
        status: 'FAIL',
        details: err.message,
      });
    }

    // Test 4: Count worksheet responses
    try {
      const { count } = await sb.from('worksheet_responses').select('*', { count: 'exact', head: true });
      testResults.tests.push({
        name: 'worksheet_responses count',
        status: 'INFO',
        details: `${count || 0} records in table`,
      });
    } catch (err) {
      testResults.tests.push({
        name: 'worksheet_responses count',
        status: 'FAIL',
        details: err.message,
      });
    }

    // Test 5: Check Base44 Worksheet entity
    try {
      const worksheets = await base44.asServiceRole.entities.Worksheet.list('-created_date', 200);
      testResults.tests.push({
        name: 'Base44 Worksheet entity',
        status: worksheets?.length > 0 ? 'PASS' : 'WARN',
        details: `${worksheets?.length || 0} worksheets (${(worksheets || []).filter(w => w.status === 'published').length} published)`,
      });
    } catch (err) {
      testResults.tests.push({
        name: 'Base44 Worksheet entity',
        status: 'FAIL',
        details: err.message,
      });
    }

    // Test 6: Sample assignment with profile ID
    try {
      const { data: sample } = await sb.from('worksheet_assignments')
        .select('id, worksheet_id, assigned_to_profile_id, status, due_date, scheduled_for')
        .limit(1);
      
      if (sample && sample.length > 0) {
        const s = sample[0];
        testResults.tests.push({
          name: 'Sample assignment',
          status: 'PASS',
          details: `ID: ${s.id}, Profile: ${s.assigned_to_profile_id?.slice(0, 8)}..., Status: ${s.status}`,
        });
      } else {
        testResults.tests.push({
          name: 'Sample assignment',
          status: 'INFO',
          details: 'No assignments yet - table is empty',
        });
      }
    } catch (err) {
      testResults.tests.push({
        name: 'Sample assignment',
        status: 'FAIL',
        details: err.message,
      });
    }

    return Response.json(testResults);

  } catch (err) {
    console.error('[testWorksheetAssignmentFlow] Error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});