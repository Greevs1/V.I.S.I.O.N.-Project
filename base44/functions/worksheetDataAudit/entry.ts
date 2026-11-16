/**
 * worksheetDataAudit - Get actual counts for worksheet assignment pipeline
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

    const audit = { timestamp: new Date().toISOString() };

    // 1. Base44 Worksheet entity count
    try {
      const worksheets = await base44.asServiceRole.entities.Worksheet.list('-created_date', 200);
      audit.worksheetTemplates = {
        source: 'Base44 Worksheet entity',
        count: worksheets?.length || 0,
        published: (worksheets || []).filter(w => w.status === 'published').length,
        draft: (worksheets || []).filter(w => w.status === 'draft').length,
      };
    } catch (err) {
      audit.worksheetTemplates = { exists: false, error: err.message };
    }

    // 2. worksheet_assignments table count
    try {
      const { count, error } = await sb.from('worksheet_assignments').select('*', { count: 'exact', head: true });
      audit.worksheetAssignments = {
        source: 'Supabase worksheet_assignments table',
        count: count || 0,
        error: error?.message || null,
      };
    } catch (err) {
      audit.worksheetAssignments = { exists: false, error: err.message };
    }

    // 3. worksheet_responses table count
    try {
      const { count, error } = await sb.from('worksheet_responses').select('*', { count: 'exact', head: true });
      audit.worksheetResponses = {
        source: 'Supabase worksheet_responses table',
        count: count || 0,
        error: error?.message || null,
      };
    } catch (err) {
      audit.worksheetResponses = { exists: false, error: err.message };
    }

    // 4. resource_assignments table count
    try {
      const { count, error } = await sb.from('resource_assignments').select('*', { count: 'exact', head: true });
      audit.resourceAssignments = {
        source: 'Supabase resource_assignments table',
        count: count || 0,
        error: error?.message || null,
      };
    } catch (err) {
      audit.resourceAssignments = { exists: false, error: err.message };
    }

    // 5. Sample data for debugging
    try {
      const { data: sampleAssignments } = await sb.from('worksheet_assignments').select('*').limit(5);
      audit.sampleWorksheetAssignments = sampleAssignments || [];
    } catch {}

    try {
      const { data: sampleResponses } = await sb.from('worksheet_responses').select('*').limit(5);
      audit.sampleWorksheetResponses = sampleResponses || [];
    } catch {}

    return Response.json(audit);

  } catch (err) {
    console.error('[worksheetDataAudit] Error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});