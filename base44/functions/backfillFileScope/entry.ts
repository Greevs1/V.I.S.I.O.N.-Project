/**
 * backfillFileScope — One-time data fix for missing file_scope values.
 *
 * Sets:
 *   storage_bucket='documents'              + file_scope IS NULL → file_scope='client_document'
 *   storage_bucket='consulting_library_files' + file_scope IS NULL → file_scope='consulting_library'
 *
 * Returns counts of rows updated in each bucket.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin' && user.role !== 'super_admin') {
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

    const results = {};

    // 1. Count null file_scope rows (all buckets)
    const { count: docsNull } = await sb.from('documents')
      .select('id', { count: 'exact', head: true })
      .in('storage_bucket', ['documents', 'client-documents'])
      .is('file_scope', null);
    results.docs_null_count = docsNull;

    const { count: libNull } = await sb.from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('storage_bucket', 'consulting_library_files')
      .is('file_scope', null);
    results.lib_null_count = libNull;

    // 2. Rename client-documents → documents and backfill file_scope
    if (docsNull > 0) {
      // Fix bucket name AND file_scope in one go
      const { error: renameErr } = await sb.from('documents')
        .update({ storage_bucket: 'documents', file_scope: 'client_document', updated_at: new Date().toISOString() })
        .in('storage_bucket', ['documents', 'client-documents'])
        .is('file_scope', null);
      results.docs_backfilled = renameErr ? 0 : docsNull;
      results.docs_error = renameErr?.message || null;
    } else {
      results.docs_backfilled = 0;
    }

    // 3. Backfill consulting_library_files bucket → consulting_library
    if (libNull > 0) {
      const { error: libErr } = await sb.from('documents')
        .update({ file_scope: 'consulting_library', updated_at: new Date().toISOString() })
        .eq('storage_bucket', 'consulting_library_files')
        .is('file_scope', null);
      results.lib_backfilled = libErr ? 0 : libNull;
      results.lib_error = libErr?.message || null;
    } else {
      results.lib_backfilled = 0;
    }

    // 4. Verify
    const { count: docsNullAfter } = await sb.from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('storage_bucket', 'documents')
      .is('file_scope', null);
    results.docs_null_remaining = docsNullAfter;

    const { count: libNullAfter } = await sb.from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('storage_bucket', 'consulting_library_files')
      .is('file_scope', null);
    results.lib_null_remaining = libNullAfter;

    // 5. Show what rows now look like
    const { data: sample, error: sampleErr } = await sb.from('documents')
      .select('id, name, storage_bucket, file_scope, profile_id, business_id, file_path')
      .order('created_at', { ascending: false })
      .limit(20);

    return Response.json({
      success: true,
      results,
      sample: sample || [],
      sampleError: sampleErr?.message || null,
    });

  } catch (error) {
    console.error('[backfillFileScope] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});