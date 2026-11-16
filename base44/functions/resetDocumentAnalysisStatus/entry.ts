/**
 * Reset document_analysis status for testing
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
    const { documentAnalysisId, status } = body;

    if (!documentAnalysisId) {
      return Response.json({ error: 'documentAnalysisId required' }, { status: 400 });
    }

    const { error } = await sb.from('document_analysis')
      .update({
        analysis_status: status || 'queued',
        status: status || 'pending',
        updated_at: new Date().toISOString()
      })
      .eq('id', documentAnalysisId);

    if (error) throw new Error(error.message);

    return Response.json({ success: true, documentAnalysisId, newStatus: status || 'queued' });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});