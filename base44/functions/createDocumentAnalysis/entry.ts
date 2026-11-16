/**
 * createDocumentAnalysis
 * 
 * Phase 2.2: Creates document_analysis row when document uploads.
 * Called automatically by uploadDocumentToSupabase.
 * 
 * Creates analysis queue entry with:
 * - document_id (FK)
 * - profile_id
 * - business_id  
 * - document_type
 * - analysis_status = 'queued'
 * - All other fields null/empty
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return Response.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body = await req.json().catch(() => ({}));
    const { document_id, profile_id, business_id, document_type } = body;

    if (!document_id) {
      return Response.json({ error: 'document_id is required' }, { status: 400 });
    }

    // Verify document exists and belongs to this profile
    const { data: doc } = await sb
      .from('documents')
      .select('id, profile_id, business_id')
      .eq('id', document_id)
      .maybeSingle();

    if (!doc) {
      return Response.json({ error: 'Document not found' }, { status: 404 });
    }

    if (doc.profile_id !== profile_id) {
      return Response.json({ error: 'Document does not belong to this profile' }, { status: 403 });
    }

    // Create document_analysis row - use actual Supabase schema columns
    // Actual columns: id, profile_id, document_id, document_type, confidence_score, extracted_data, summary, ai_findings, status, created_at, updated_at, business_id
    const analysisData = {
      document_id,
      profile_id,
      business_id: business_id || doc.business_id || null,
      document_type: document_type || 'other',
      status: 'queued',  // Actual column name is 'status' not 'analysis_status'
      confidence_score: null,
      summary: null,  // Actual column name is 'summary' not 'extracted_summary'
      extracted_data: {},
      ai_findings: [],  // Using ai_findings instead of missing_fields
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Remove business_id if null
    if (!analysisData.business_id) {
      delete analysisData.business_id;
    }

    const { data: analysis, error: analysisError } = await sb
      .from('document_analysis')
      .insert(analysisData)
      .select('id')
      .single();

    if (analysisError) {
      throw new Error(analysisError.message);
    }

    // Update documents.upload_status to 'pending_analysis'
    const { error: updateErr } = await sb
      .from('documents')
      .update({ upload_status: 'pending_analysis', updated_at: new Date().toISOString() })
      .eq('id', document_id);

    if (updateErr) {
      console.warn('[createDocumentAnalysis] Failed to update document upload_status:', updateErr.message);
    }

    return Response.json({
      success: true,
      document_analysis_id: analysis?.id,
      status: 'queued',
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});