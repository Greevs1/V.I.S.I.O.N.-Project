/**
 * VISION — CONNECTED BUSINESS
 * CB-005B — PROVIDER SYNC WORKER (the wake surface)
 *
 * THE ONE THING THIS FILE MAY NOT DO
 *
 *   It may not grant execution authority. It can ASK for work; the database decides
 *   which work exists for this worker, and the certified authorization kernel decides
 *   whether that work may proceed. Nothing a caller sends is treated as authority —
 *   and the authority-shaped keys are not merely ignored, they are REFUSED, so an
 *   attempt to smuggle them is visible in the response and in the log rather than
 *   silently dropped.
 *
 * THE THREE ACTIONS, AND WHO MAY ASK
 *
 *   wake    run a bounded worker pass over whatever the database will grant.
 *   sweep   mark jobs whose attempt budget is spent as failed.
 *   status  read-only: recent jobs and the observation count for ONE business.
 *
 *   wake and sweep are OPERATIONAL: they require a canonical platform admin
 *   (profiles.app_role, via the canonical Security Kernel). A job's own business is
 *   never named by the caller, because the worker does not need to name it.
 *   status is business-scoped and holds the caller to the ordinary business gate.
 *
 * NO SCHEDULER PATH EXISTS HERE, ON PURPOSE
 *   A scheduled/system invocation of this endpoint would need an invocation
 *   authenticity mechanism (a signed scheduler call). Inventing one inside a security
 *   phase would be a new trust boundary asserted by the thing it protects. The wake
 *   surface is therefore admin-only, and the scheduler wiring belongs to the
 *   activation phase, where it can be designed and certified as its own boundary.
 *
 * NO PROVIDER CALL HAPPENS IN THIS PHASE
 *   The worker is wired to the DISABLED adapter. The credential resolver below is
 *   wired too, but it is only reachable from inside an adapter's page fetch, and the
 *   disabled adapter never fetches — so no plaintext can exist in CB-005B. When an
 *   adapter is approved, it inherits the boundary that was certified here.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
// The service client comes from base44/shared: a function may not import another
// function's file, and a second copy of the factory is exactly how two Supabase
// clients drift (see shared/supabase/projectUrl.ts for the production incident).
import { createServiceRoleClient } from '../../shared/supabase/serviceClient.ts';
import { authenticateActor, authorizeBusinessAccess, errorResponse } from '../../shared/authz/actor.ts';
import { EXECUTION_LIMITS, safeLogFields } from '../../shared/providerSync/executionPolicy.ts';
import {
  countObservationsForBusiness,
  deriveWorkerId,
  listJobsForBusiness,
  sweepJobs,
} from '../../shared/providerSync/jobRepository.ts';
import { findForbiddenWakeBodyKeys } from '../../shared/providerSync/systemContext.ts';
import { DISABLED_PROVIDER_ADAPTER, runWorkerWake } from '../../shared/providerSync/workerExecutor.ts';

const ACTIONS = ['wake', 'sweep', 'status'];

/** Bounded, token-free operational logging. Keys are whitelisted; payloads never qualify. */
const logEvent = (event: string, fields: Record<string, unknown> = {}) => {
  console.log('[providerSyncWorker]', JSON.stringify(safeLogFields({ event, ...fields })));
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

export default async function (req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ error: 'Request body must be a JSON object' }, 400);
  }

  // A caller-supplied authority claim is REFUSED rather than ignored: an ignored
  // field leaves no trace, while a refusal records that someone tried to name a job,
  // a provider, a credential or a system context as if it were authority.
  const forbidden = findForbiddenWakeBodyKeys(body);
  if (forbidden.length > 0) {
    logEvent('wake_body_rejected', { code: 'authority_shaped_keys', reason: forbidden.join(',') });
    return json({
      error: 'Rejected: this surface accepts no execution authority, job identity, business identity or credential',
      rejected_keys: forbidden,
    }, 400);
  }

  const action = typeof body.action === 'string' ? body.action : '';
  if (ACTIONS.indexOf(action) === -1) return json({ error: 'Unknown or missing action', allowed: ACTIONS }, 400);

  const { client: sb, config } = createServiceRoleClient();
  const base44 = createClientFromRequest(req);
  if (!config.urlExists) logEvent('worker_client_unavailable', { code: 'configuration_error' });

  try {
    const actor = await authenticateActor(base44, sb);
    const actorKind = actor.isAdmin ? 'admin' : 'user';
    // The worker identity is DERIVED — never accepted from the request (§2, §6).
    const workerId = deriveWorkerId(actorKind, actor.profile_id);

    if (action === 'status') {
      const businessId = typeof body.business_id === 'string' ? body.business_id : '';
      if (!businessId) return json({ error: 'business_id is required for status' }, 400);
      // The ordinary business gate: an admin passes, everyone else must be provably
      // authorized for THAT business, exactly as RLS enforces it.
      await authorizeBusinessAccess(sb, actor, businessId);
      const jobs = await listJobsForBusiness(sb, { businessId, limit: body.limit });
      const observationCount = await countObservationsForBusiness(sb, businessId);
      logEvent('status', { business_id: businessId, observations: observationCount, worker_id: workerId });
      return json({ ok: true, action, business_id: businessId, jobs, observation_count: observationCount });
    }

    // wake and sweep are operational actions. Canonical admin standing only.
    if (!actor.isAdmin) {
      logEvent('operational_action_refused', { code: 'not_platform_admin' });
      return json({ error: 'Forbidden: operational worker actions require a canonical platform admin' }, 403);
    }

    if (action === 'sweep') {
      const marked = await sweepJobs(sb, { limit: body.limit });
      logEvent('sweep_complete', { worker_id: workerId, observations: marked });
      return json({ ok: true, action, worker_id: workerId, jobs_marked_failed: marked });
    }

    // ── wake ───────────────────────────────────────────────────────────────
    // The adapter is the DISABLED one: the pipeline runs, is bounded and is
    // authorized, and it performs no provider I/O. An adapter that needs a
    // credential calls resolveCredential() from inside its own page fetch — which
    // is why the resolver can only ever run AFTER an ALLOW.
    const outcome = await runWorkerWake({
      sb,
      workerId,
      adapter: DISABLED_PROVIDER_ADAPTER,
      logger: logEvent,
      resolveCredential: async (unit: { businessId: string; connectionId: string; credentialType: string }) => {
        const { data, error } = await sb.rpc('provider_credential_resolve', {
          p_business_id: unit.businessId,
          p_business_connection_id: unit.connectionId,
          p_credential_type: unit.credentialType,
        });
        if (error) throw new Error('credential resolution failed');
        if (!data) throw new Error('credential resolution returned no active credential');
        return String(data);
      },
    });

    logEvent('wake_complete', { worker_id: workerId, observations: outcome.evaluated, status: 'done' });
    return json({
      ok: true,
      action,
      worker_id: workerId,
      adapter: DISABLED_PROVIDER_ADAPTER.name,
      provider_calls_performed: false,
      claim_batch_limit: EXECUTION_LIMITS.CLAIM_BATCH_MAX,
      evaluated: outcome.evaluated,
      wake_budget_exhausted: outcome.wake_budget_exhausted,
      outcomes: outcome.outcomes,
    });
  } catch (error) {
    logEvent('worker_error', { code: error?.status ? String(error.status) : 'unhandled', reason: error?.message });
    return errorResponse(error);
  }
}