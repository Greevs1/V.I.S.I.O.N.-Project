/**
 * processDocumentIngestionJob — THE canonical durable ingestion worker.
 *
 * Two callers, one implementation:
 *   · the entity-triggered workflow (normal ingestion) — { job_id }
 *   · the scheduled recovery workflow — { sweep: true }
 *
 * The job id is the ONLY accepted input. business_id, document_scope, profile_id,
 * role and email are never read from the request: they are re-derived from the
 * canonical documents row inside the worker. No document content is ever returned,
 * so referencing a job id cannot disclose a document or grant access to one.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { secrets } from 'base44:runtime';
import { processJob, sweepJobs } from '../../shared/documentIngestion/orchestration.ts';
import { normalizeSupabaseProjectUrl } from '../../shared/supabase/projectUrl.ts';

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body: any = await req.json().catch(() => ({}));

    // INFRASTRUCTURE WORKER. A workflow invocation carries no user session; an app
    // user (or a suspended/revoked one) must never drive ingestion.
    const user = await base44.auth.me().catch(() => null);
    if (user && !['admin', 'super_admin'].includes(user.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // The project URL is normalized through the ONE shared normalizer. The stored
    // value carries an API path and a trailing slash; a client built from it raw
    // asks for .../rest/v1/rest/v1/... and PostgREST rejects every query with
    // PGRST125. That is how 6D.0b.2 production failed — the upload normalized, this
    // worker did not. Both now build the project URL the same way.
    const projectUrl = normalizeSupabaseProjectUrl(secrets.get('VITE_SUPABASE_URL'));
    const serviceKey = secrets.get('SUPABASE_SERVICE_ROLE_KEY');

    const sb = createClient(projectUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const now = new Date().toISOString();

    // Recovery sweep: the SAME worker, applied only to stranded or due jobs.
    if (body?.sweep === true) {
      const result = await sweepJobs({ sb, base44, now });
      return Response.json({ ok: true, mode: 'recovery', ...result });
    }

    const jobId = typeof body?.job_id === 'string' ? body.job_id : null;
    if (!jobId) return Response.json({ error: 'job_id required' }, { status: 400 });

    const outcome: any = await processJob({ sb, base44, jobId, now });
    return Response.json({ ok: outcome.ok === true, ...outcome });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}