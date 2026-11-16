/**
 * checkDocumentAnalysisSchema
 * 
 * Checks if document_analysis table exists and reports its schema.
 * Used for Phase 2.2 implementation.
 */

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

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return Response.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Check if document_analysis table exists
    const { data: tableInfo, error: tableErr } = await sb
      .from('document_analysis')
      .select('*')
      .limit(1);

    if (tableErr) {
      return Response.json({
        exists: false,
        error: tableErr.message,
        details: tableErr.details,
        hint: tableErr.hint,
        required_schema: {
          document_id: 'UUID (required, FK to documents)',
          profile_id: 'UUID (required, FK to profiles)',
          business_id: 'UUID (required, FK to business_entities)',
          document_type: 'TEXT',
          analysis_status: "TEXT (queued, analyzing, completed, failed, needs_review)",
          confidence_score: 'NUMERIC (0-100)',
          extracted_summary: 'TEXT',
          extracted_data: 'JSONB',
          missing_fields: 'TEXT[]',
          created_at: 'TIMESTAMPTZ',
          updated_at: 'TIMESTAMPTZ'
        }
      });
    }

    // Get column names from first row
    const columns = tableInfo && tableInfo.length > 0 ? Object.keys(tableInfo[0]) : [];

    return Response.json({
      exists: true,
      columns,
      sample_row: tableInfo?.[0] || null,
      required_schema: {
        document_id: 'UUID (required, FK to documents)',
        profile_id: 'UUID (required, FK to profiles)',
        business_id: 'UUID (required, FK to business_entities)',
        document_type: 'TEXT',
        analysis_status: "TEXT (queued, analyzing, completed, failed, needs_review)",
        confidence_score: 'NUMERIC (0-100)',
        extracted_summary: 'TEXT',
        extracted_data: 'JSONB',
        missing_fields: 'TEXT[]',
        created_at: 'TIMESTAMPTZ',
        updated_at: 'TIMESTAMPTZ'
      }
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});