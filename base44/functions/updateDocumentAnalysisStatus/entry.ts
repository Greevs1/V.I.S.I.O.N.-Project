/**
 * updateDocumentAnalysisStatus
 * 
 * Phase 2.2: Update document analysis status (admin/advisor only).
 * Updates both document_analysis.status and documents.upload_status.
 * 
 * Supported statuses:
 * - queued
 * - analyzing
 * - completed
 * - failed
 * - needs_review
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

    const body = await req.json().catch(() => ({}));
    const { document_id, status } = body;

    if (!document_id) {
      return Response.json({ error: 'document_id is required' }, { status: 400 });
    }

    if (!status) {
      return Response.json({ error: 'status is required' }, { status: 400 });
    }

    const VALID_STATUSES = ['queued', 'analyzing', 'completed', 'failed', 'needs_review'];
    if (!VALID_STATUSES.includes(status)) {
      return Response.json({ 
        error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` 
      }, { status: 400 });
    }

    // Verify document exists
    const { data: doc } = await sb
      .from('documents')
      .select('id, profile_id, business_id')
      .eq('id', document_id)
      .maybeSingle();

    if (!doc) {
      return Response.json({ error: 'Document not found' }, { status: 404 });
    }

    // Update document_analysis.status
    const { error: analysisErr } = await sb
      .from('document_analysis')
      .update({ 
        status,
        updated_at: new Date().toISOString()
      })
      .eq('document_id', document_id);

    if (analysisErr) {
      console.warn('[updateDocumentAnalysisStatus] Failed to update document_analysis:', analysisErr.message);
    }

    // Update documents.upload_status
    const { error: docErr } = await sb
      .from('documents')
      .update({ 
        upload_status: status === 'completed' ? 'completed' : status,
        updated_at: new Date().toISOString()
      })
      .eq('id', document_id);

    if (docErr) {
      console.warn('[updateDocumentAnalysisStatus] Failed to update documents.upload_status:', docErr.message);
    }

    return Response.json({
      success: true,
      document_id,
      status,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});