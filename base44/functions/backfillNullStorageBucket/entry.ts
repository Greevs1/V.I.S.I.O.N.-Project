/**
 * backfillNullStorageBucket — One-shot migration
 * Updates all documents rows with NULL storage_bucket to storage_bucket = 'documents'.
 * Run once, then remove the storage_bucket.is.null fallback from Data Room queries.
 *
 * Admin-only invocation. Call with: {} (no payload needed)
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

    // Count affected rows first
    const { count, error: countErr } = await sb
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .is('storage_bucket', null);

    if (countErr) {
      return Response.json({ error: countErr.message, step: 'count' }, { status: 500 });
    }

    if (count === 0) {
      return Response.json({
        success: true,
        message: 'No NULL storage_bucket rows found. Nothing to backfill.',
        rows_updated: 0,
      });
    }

    // Update all NULL storage_bucket → 'documents'
    const { error: updateErr } = await sb
      .from('documents')
      .update({ storage_bucket: 'documents', updated_at: new Date().toISOString() })
      .is('storage_bucket', null);

    if (updateErr) {
      return Response.json({ error: updateErr.message, step: 'update' }, { status: 500 });
    }

    console.log(`[backfillNullStorageBucket] Updated ${count} rows: storage_bucket → 'documents'`);

    return Response.json({
      success: true,
      message: `Backfilled ${count} documents rows with storage_bucket = 'documents'`,
      rows_updated: count,
    });

  } catch (err) {
    console.error('[backfillNullStorageBucket] error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});