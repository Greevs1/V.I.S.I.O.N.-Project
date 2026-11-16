/**
 * VISION — CONNECTED BUSINESS
 * CB-005B — WORKER EXECUTOR
 *
 * THE INVARIANT, IN CODE ORDER
 *
 *   claim (database)  →  verify the claim (database, database time)  →  authorize
 *   (certified CB-004.2 kernel, audited by the certified writer)  →  execute within
 *   bounds  →  ingest each page under the same fence  →  complete or defer, fenced.
 *
 * The ORDER is the security property. A wake signal reaches this module with no
 * authority at all: everything it acts on was read from the job row after the row
 * proved that this worker holds a live lease.
 *
 * WHAT A REFUSAL DOES: NOTHING BUT AUDIT.
 *   When the claim cannot be verified, or the kernel will not authorize execution,
 *   the worker mutates NO job state. It has no authority to write "failed" or
 *   "retry_wait" on work that was never its own; the attempt is recorded in the audit
 *   trail and the lease lapses by itself, after which the job is recovered and
 *   re-evaluated. A refusal that consumed the job would be a denial-of-service that
 *   anyone able to send a wake could trigger by asking.
 *
 * WHAT THE EXECUTION LOOP CANNOT DO
 *   · exceed MAX_PAGES_PER_EXECUTION or MAX_OBSERVATIONS_PER_EXECUTION
 *   · outlive the attempt's wall-clock budget (checked every page and at every renewal)
 *   · write an observation without the live lease (the database refuses)
 *   · advance a checkpoint past what it just committed (same transaction, last chunk)
 *   · touch a business fact, a dashboard metric or Galileo behaviour (the freeze)
 *   · log a payload, a credential or a token (safeLogFields whitelist)
 *
 * NO PROVIDER CALL HAPPENS IN THIS PHASE: the only wired adapter is DISABLED, so the
 * pipeline is complete, bounded and testable while performing no external I/O, and
 * the credential boundary is never even reached.
 */

import { authorizeProviderOperation } from '../providers/authorization.ts';
import {
  EXECUTION_LIMITS,
  attemptBudgetExhausted,
  backoffSecondsForAttempt,
  classifyFailure,
  completionOutcomeFor,
  decideLeaseRenewal,
  observationBudgetExhausted,
  pageBudgetExhausted,
  safeLogFields,
} from './executionPolicy.ts';
import { buildIngestBatch, chunkObservations } from './observationIdentity.ts';
import { defaultScopeForOperation, isValidCheckpointScope, makeAdvance, nextCursorFromPage } from './checkpointPolicy.ts';
import { buildUnverifiedContext, buildVerifiedContext } from './systemContext.ts';
import {
  RepositoryError,
  authorizeClaim,
  claimJobs,
  completeJob,
  ingestBatch,
  isLeaseFence,
  ATTEMPT_EXPIRED,
  readActiveCredential,
  readCheckpoint,
  readConnection,
  renewLease,
} from './jobRepository.ts';

export type ProviderAdapter = {
  name: string;
  requiresCredential?: boolean;
  /** An adapter that already knows its single checkpoint scope may declare it here. */
  defaultScope?: string;
  fetchPage(input: {
    job: any;
    attempt: any;
    checkpoint: any;
    limits: typeof EXECUTION_LIMITS;
    resolveCredential: () => Promise<string>;
  }): Promise<
    | { ok: true; drafts: any[]; scope?: string; next?: any; done?: boolean }
    | {
        ok: false; error_class?: string; http_status?: number | null; rate_limited?: boolean;
        retry_after_seconds?: number | null; timed_out?: boolean; protocol_violation?: boolean;
        configuration?: boolean; message?: string;
      }
  >;
};

/**
 * The ONLY adapter wired in CB-005B. It performs no provider call, so the phase's
 * "no real provider API calls" rule is enforced by there being nothing that could
 * make one — not by a flag a later edit might flip without noticing.
 */
export const DISABLED_PROVIDER_ADAPTER: ProviderAdapter = {
  name: 'disabled',
  requiresCredential: false,
  async fetchPage() {
    return {
      ok: false,
      configuration: true,
      message: 'provider adapter is not activated: CB-005B performs no provider API call',
    };
  },
};

type Outcome = {
  job_id: string;
  outcome: string;
  claim_state?: string;
  client_code?: string;
  error_class?: string | null;
  pages?: number;
  observations?: number;
  inserted?: number;
  duplicates?: number;
  conflicts?: number;
  job_status_after?: string | null;
};

const withTimeout = async <T>(promise: Promise<T>, ms: number): Promise<{ ok: true; value: T } | { ok: false; timedOut: true }> => {
  let timer: any = null;
  const timeout = new Promise<{ ok: false; timedOut: true }>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, timedOut: true }), ms);
  });
  const result = await Promise.race([promise.then((value) => ({ ok: true as const, value })), timeout]);
  if (timer !== null) clearTimeout(timer);
  return result as any;
};

/**
 * executeClaimedJob — one claimed job, from verification to a fenced conclusion.
 * `job` is the row the CLAIM returned: its attempt_id, lease_id and claimed_by are the
 * worker's proof of identity, and they exist nowhere else.
 */
export async function executeClaimedJob(deps: {
  sb: any;
  workerId: string;
  job: any;
  adapter?: ProviderAdapter;
  limits?: typeof EXECUTION_LIMITS;
  now?: () => number;
  logger?: (event: string, fields?: Record<string, unknown>) => void;
  resolveCredential?: (unit: { businessId: string; connectionId: string; credentialType: string }) => Promise<string>;
  signal?: { aborted?: boolean };
}): Promise<Outcome> {
  const sb = deps.sb;
  const limits = deps.limits || EXECUTION_LIMITS;
  const adapter = deps.adapter || DISABLED_PROVIDER_ADAPTER;
  const nowFn = typeof deps.now === 'function' ? deps.now : () => Date.now();
  const log = (event: string, fields?: Record<string, unknown>) => {
    if (typeof deps.logger === 'function') deps.logger(event, safeLogFields({ event, ...(fields || {}) }));
  };

  const job = deps.job;
  const jobId = job?.id;
  const identity = {
    attemptId: typeof job?.attempt_id === 'string' ? job.attempt_id : null,
    leaseId: typeof job?.lease_id === 'string' ? job.lease_id : null,
  };

  if (!jobId || !identity.attemptId || !identity.leaseId) {
    log('execution_refused', { code: 'claim_identity_incomplete' });
    return { job_id: String(jobId || 'unknown'), outcome: 'claim_not_verified', claim_state: 'context_incomplete' };
  }

  // ── 1 · the independent, database-time verification of THIS claim ─────────
  const verification = await authorizeClaim(sb, {
    jobId,
    attemptId: identity.attemptId,
    leaseId: identity.leaseId,
    workerId: deps.workerId,
  });
  const rowFacts = verification.job || {};
  const connectionId = rowFacts.business_connection_id || job.business_connection_id || null;
  const businessId = rowFacts.business_id || job.business_id || null;
  const credentialType = rowFacts.credential_type || job.credential_type || null;

  // ── 2 · rows + context: ALL authority derives from the verified row ───────
  const connection = connectionId ? await readConnection(sb, connectionId) : null;
  const activeCredential = (businessId && connectionId && credentialType)
    ? await readActiveCredential(sb, { businessId, connectionId, credentialType })
    : null;

  const systemContext = verification.verified
    ? buildVerifiedContext(verification)
    : buildUnverifiedContext({ claimState: verification.claim_state, jobId });

  // ── 3 · THE authorization gate. Always called, so every attempt is audited. ─
  const decision = await authorizeProviderOperation({
    sb,
    actorKind: 'system',
    operation: 'sync.execute',
    connectionId,
    credentialId: activeCredential ? activeCredential.id : null,
    resourceType: 'sync_job',
    resourceId: jobId,
    systemContext,
    requestCorrelationId: identity.attemptId,
    metadata: { claim_state: verification.claim_state },
  });

  if (!decision || decision.executable !== true) {
    log('execution_not_executable', {
      job_id: jobId, claim_state: verification.claim_state,
      code: decision?.client_code, http_status: decision?.http_status,
    });
    return {
      job_id: jobId,
      outcome: verification.verified ? 'not_executable' : 'claim_not_verified',
      claim_state: verification.claim_state,
      client_code: decision?.client_code,
      // A refusal writes no job state — see the module header.
      job_status_after: 'unchanged',
    };
  }

  log('execution_authorized', {
    job_id: jobId, business_id: businessId, connection_id: connectionId,
    provider: rowFacts.provider, operation: rowFacts.provider_operation,
    attempt_id: identity.attemptId, attempt_count: rowFacts.attempt_count,
  });

  // ── 4 · execution, strictly bounded ──────────────────────────────────────
  const execution = { pages: 0, observations: 0, inserted: 0, duplicates: 0, conflicts: 0, renewals: 0, retries: 0 };
  const startedAtMs = nowFn();
  const attemptBudgetMs = (typeof rowFacts.max_attempt_seconds === 'number'
    ? rowFacts.max_attempt_seconds
    : limits.MAX_ATTEMPT_SECONDS_DEFAULT) * 1000;

  // The scope is fixed for this execution and known BEFORE the first fetch, so a
  // resumed attempt can tell the provider where to continue from.
  const scope = isValidCheckpointScope(adapter.defaultScope)
    ? String(adapter.defaultScope)
    : defaultScopeForOperation(rowFacts.provider_operation);
  let committed: any = await readCheckpoint(sb, jobId, scope);

  let leaseLost = false;
  let deferred: { errorClass: string; code: string; backoff?: number } | null = null;

  // The credential boundary: resolved LAZILY, only if an ACTIVE adapter asks, and
  // only after an ALLOW — so a refusal can never cause a plaintext to exist.
  const resolveCredential = async (): Promise<string> => {
    if (typeof deps.resolveCredential !== 'function') {
      throw new RepositoryError('configuration_error', 'credential resolution is not wired in this phase');
    }
    return deps.resolveCredential({
      businessId: String(businessId),
      connectionId: String(connectionId),
      credentialType: String(credentialType),
    });
  };

  while (true) {
    if (deps.signal?.aborted) {
      deferred = { errorClass: 'transient', code: 'cancelled' };
      break;
    }
    if (pageBudgetExhausted(execution.pages) || observationBudgetExhausted(execution.observations)) {
      deferred = { errorClass: 'transient', code: 'execution_budget_exhausted' };
      break;
    }
    if (attemptBudgetExhausted({ attemptStartedAtMs: startedAtMs, nowMs: nowFn(), budgetMs: attemptBudgetMs })) {
      deferred = { errorClass: 'transient', code: 'attempt_budget_exhausted' };
      break;
    }

    // Lease maintenance BEFORE more work, so a long page cannot silently overrun.
    const renewal = decideLeaseRenewal({
      leaseExpiresAtMs: typeof rowFacts.lease_expires_at === 'string' ? Date.parse(rowFacts.lease_expires_at) : null,
      nowMs: nowFn(),
      renewalsUsed: execution.renewals,
      attemptStartedAtMs: typeof rowFacts.attempt_started_at === 'string' ? Date.parse(rowFacts.attempt_started_at) : null,
      maxAttemptSeconds: typeof rowFacts.max_attempt_seconds === 'number' ? rowFacts.max_attempt_seconds : null,
    });
    if (renewal.renew) {
      const renewed = await renewLease(sb, {
        jobId,
        attemptId: identity.attemptId,
        leaseId: identity.leaseId,
        workerId: deps.workerId,
        leaseSeconds: limits.LEASE_SECONDS_DEFAULT,
      });
      if (!renewed) {
        leaseLost = true;
        break;
      }
      execution.renewals += 1;
    }

    // ── fetch, with a bounded in-execution retry for transient page failures ──
    let page: any = null;
    let failure: { errorClass: string; code: string; backoff?: number } | null = null;
    for (let attemptIndex = 0; attemptIndex <= limits.RATE_LIMIT_MAX_RETRIES; attemptIndex += 1) {
      const raced = await withTimeout(adapter.fetchPage({
        job: {
          id: jobId,
          business_id: businessId,
          business_connection_id: connectionId,
          credential_type: credentialType,
          provider: rowFacts.provider,
          provider_operation: rowFacts.provider_operation,
        },
        attempt: { id: identity.attemptId, count: rowFacts.attempt_count, lease_id: identity.leaseId },
        checkpoint: committed,
        limits,
        resolveCredential,
      }), limits.PAGE_REQUEST_TIMEOUT_MS);

      if (!raced.ok) {
        failure = { errorClass: classifyFailure({ timedOut: true }), code: 'page_timeout' };
      } else if (raced.value?.ok === true) {
        page = raced.value;
        failure = null;
        break;
      } else {
        const errorClass = classifyFailure({
          rateLimited: raced.value?.rate_limited === true,
          timedOut: raced.value?.timed_out === true,
          httpStatus: typeof raced.value?.http_status === 'number' ? raced.value.http_status : null,
          protocolViolation: raced.value?.protocol_violation === true,
          configuration: raced.value?.configuration === true,
        });
        failure = {
          errorClass,
          code: raced.value?.error_class || errorClass,
          backoff: errorClass === 'rate_limited' && typeof raced.value?.retry_after_seconds === 'number'
            ? raced.value.retry_after_seconds
            : undefined,
        };
      }

      // A rate limit is NEVER retried in place: hammering a provider that just said
      // "slow down" is exactly the retry storm §6 forbids. It defers to the job's
      // bounded backoff instead.
      if (failure.errorClass === 'rate_limited' || failure.errorClass === 'configuration_error'
        || failure.errorClass === 'permanent' || failure.errorClass === 'provider_protocol_error') {
        break;
      }
      if (attemptIndex < limits.RATE_LIMIT_MAX_RETRIES) execution.retries += 1;
    }

    if (!page) {
      deferred = failure || { errorClass: 'provider_error', code: 'page_failed' };
      break;
    }

    // A page may not silently re-scope the checkpoint: that would move the cursor's
    // meaning mid-flight, which is the one thing a checkpoint must never do.
    if (page.scope !== undefined && page.scope !== null && page.scope !== scope) {
      deferred = { errorClass: 'provider_protocol_error', code: 'page_scope_changed' };
      break;
    }

    // ── validate + chunk, so one oversized page cannot break the unit bound ──
    const built = await buildIngestBatch({
      businessId: String(businessId),
      provider: String(rowFacts.provider),
      connectionId: String(connectionId),
      drafts: Array.isArray(page.drafts) ? page.drafts : [],
    });
    if (!built.ok) {
      deferred = { errorClass: 'provider_protocol_error', code: built.code || 'invalid_batch' };
      break;
    }

    const cursor = nextCursorFromPage(page);
    const done = page.done === true || cursor === null;
    const chunks = chunkObservations(built.observations, {
      maxCount: limits.MAX_BATCH_OBSERVATIONS,
      maxBytes: limits.MAX_BATCH_BYTES,
    });

    let pageCommitted = 0;
    for (let index = 0; index < chunks.length; index += 1) {
      const isLast = index === chunks.length - 1;
      // The advance accompanies the LAST chunk only, so the cursor can never move
      // ahead of an observation this page produced.
      const advance = (isLast && cursor) ? makeAdvance({ scope, committed, next: cursor }) : null;

      let receipt: any = null;
      try {
        receipt = await ingestBatch(sb, {
          jobId,
          attemptId: identity.attemptId,
          leaseId: identity.leaseId,
          workerId: deps.workerId,
          observations: chunks[index],
          checkpoint: advance,
        });
      } catch (error: any) {
        const code = error instanceof RepositoryError ? error.code : 'DATABASE_ERROR';
        // ATTEMPT_EXPIRED is a STOP, exactly like a lost lease: the attempt's absolute
        // deadline passed, so the database refused the unit whole and wrote nothing. It
        // is deliberately NOT a retryable deferral — deferring would ask the database to
        // schedule another attempt on a claim that is already over, and recovery belongs
        // to claim() and sweep(), where it is bounded and visible.
        if (isLeaseFence(code) || code === ATTEMPT_EXPIRED) {
          leaseLost = true;
        } else if (code === 'CHECKPOINT_STALE' || code === 'OBSERVATION_RACE') {
          // Another writer advanced this cursor: our view is stale, not wrong.
          // Deferring re-reads the committed cursor on the next attempt.
          deferred = { errorClass: 'transient', code };
        } else {
          deferred = { errorClass: 'provider_protocol_error', code };
        }
        break;
      }

      execution.inserted += receipt.inserted;
      execution.duplicates += receipt.duplicates;
      execution.conflicts += receipt.conflicts;
      pageCommitted += chunks[index].length;

      if (receipt.checkpoint && typeof receipt.checkpoint.cursor_version === 'number') {
        committed = {
          checkpoint_scope: scope,
          cursor_kind: receipt.checkpoint.cursor_kind,
          cursor_ordinal: cursor && cursor.cursor_kind === 'ordered' ? cursor.cursor_ordinal : (committed?.cursor_ordinal ?? null),
          cursor_token: cursor && cursor.cursor_kind === 'opaque' ? cursor.cursor_token : null,
          cursor_version: receipt.checkpoint.cursor_version,
        };
      }
    }

    if (leaseLost || deferred) break;

    execution.pages += 1;
    execution.observations += pageCommitted;
    log('page_committed', {
      job_id: jobId, pages: execution.pages, observations: pageCommitted,
      inserted: execution.inserted, duplicates: execution.duplicates, conflicts: execution.conflicts,
    });

    if (!done) continue;

    // ── 5 · completion, fenced ──────────────────────────────────────────────
    const verdict = await completeJob(sb, {
      jobId,
      attemptId: identity.attemptId,
      leaseId: identity.leaseId,
      workerId: deps.workerId,
      outcome: 'completed',
    });
    if (verdict === 'LEASE_FENCED' || verdict === 'ATTEMPT_EXPIRED' || verdict === 'NOT_FOUND') {
      leaseLost = true;
      break;
    }
    log('execution_completed', { job_id: jobId, pages: execution.pages, observations: execution.observations });
    return {
      job_id: jobId,
      outcome: 'completed',
      pages: execution.pages,
      observations: execution.observations,
      inserted: execution.inserted,
      duplicates: execution.duplicates,
      conflicts: execution.conflicts,
      job_status_after: verdict,
    };
  }

  // ── 6 · a lease lost mid-flight: STOP, and write nothing. ────────────────
  if (leaseLost) {
    log('execution_lease_lost', { job_id: jobId, attempt_id: identity.attemptId, outcome: 'lease_lost' });
    return {
      job_id: jobId,
      outcome: 'lease_lost',
      error_class: 'lease_lost',
      pages: execution.pages,
      observations: execution.observations,
      inserted: execution.inserted,
      job_status_after: 'unchanged',
    };
  }

  // ── 7 · defer, fenced: retryable (or terminal, on a terminal class) ───────
  const finalError = deferred || { errorClass: 'provider_error', code: 'execution_stopped' };
  const completion = completionOutcomeFor(finalError.errorClass);
  if (completion === null) {
    return { job_id: jobId, outcome: 'lease_lost', error_class: 'lease_lost', job_status_after: 'unchanged' };
  }

  const computed = backoffSecondsForAttempt(rowFacts.attempt_count || 1);
  const backoff = finalError.errorClass === 'rate_limited' && typeof finalError.backoff === 'number'
    ? Math.max(finalError.backoff, computed)
    : computed;

  const verdict = await completeJob(sb, {
    jobId,
    attemptId: identity.attemptId,
    leaseId: identity.leaseId,
    workerId: deps.workerId,
    outcome: completion,
    errorClass: finalError.errorClass,
    errorCode: finalError.code,
    errorMessage: finalError.errorClass === 'configuration_error'
      ? 'no provider adapter is activated in this phase'
      : null,
    backoffSeconds: backoff,
  });
  if (verdict === 'LEASE_FENCED' || verdict === 'ATTEMPT_EXPIRED' || verdict === 'NOT_FOUND') {
    return { job_id: jobId, outcome: 'lease_lost', error_class: 'lease_lost', job_status_after: 'unchanged' };
  }

  log('execution_deferred', {
    job_id: jobId, outcome: verdict, error_class: finalError.errorClass, error_code: finalError.code,
  });
  return {
    job_id: jobId,
    outcome: verdict,
    error_class: finalError.errorClass,
    pages: execution.pages,
    observations: execution.observations,
    inserted: execution.inserted,
    duplicates: execution.duplicates,
    conflicts: execution.conflicts,
    job_status_after: verdict,
  };
}

/**
 * runWorkerWake — the bounded pass a wake signal triggers. A wake grants nothing: it
 * only asks the database for work this worker can then prove belongs to it.
 */
export async function runWorkerWake(deps: {
  sb: any;
  workerId: string;
  adapter?: ProviderAdapter;
  limits?: typeof EXECUTION_LIMITS;
  now?: () => number;
  logger?: (event: string, fields?: Record<string, unknown>) => void;
  resolveCredential?: (unit: { businessId: string; connectionId: string; credentialType: string }) => Promise<string>;
  signal?: { aborted?: boolean };
  maxExecutions?: number;
  wakeBudgetMs?: number;
}): Promise<{ evaluated: number; outcomes: Outcome[]; wake_budget_exhausted: boolean }> {
  const limits = deps.limits || EXECUTION_LIMITS;
  const nowFn = typeof deps.now === 'function' ? deps.now : () => Date.now();
  const maxExecutions = typeof deps.maxExecutions === 'number'
    ? Math.min(Math.max(Math.trunc(deps.maxExecutions), 1), limits.MAX_EXECUTIONS_PER_WAKE)
    : limits.MAX_EXECUTIONS_PER_WAKE;
  const wakeBudgetMs = typeof deps.wakeBudgetMs === 'number' ? deps.wakeBudgetMs : limits.WAKE_MS_BUDGET;
  const startedAt = nowFn();
  const outcomes: Outcome[] = [];
  let wakeBudgetExhausted = false;

  while (outcomes.length < maxExecutions) {
    if (deps.signal?.aborted) break;
    if (nowFn() - startedAt >= wakeBudgetMs) {
      wakeBudgetExhausted = true;
      break;
    }

    const claimed = await claimJobs(deps.sb, {
      workerId: deps.workerId,
      limit: Math.min(limits.CLAIM_BATCH_DEFAULT, maxExecutions - outcomes.length),
      leaseSeconds: limits.LEASE_SECONDS_DEFAULT,
    });
    if (claimed.length === 0) break;

    for (const job of claimed) {
      if (outcomes.length >= maxExecutions) break;
      outcomes.push(await executeClaimedJob({
        sb: deps.sb,
        workerId: deps.workerId,
        job,
        adapter: deps.adapter,
        limits,
        now: deps.now,
        logger: deps.logger,
        resolveCredential: deps.resolveCredential,
        signal: deps.signal,
      }));
    }
  }

  return { evaluated: outcomes.length, outcomes, wake_budget_exhausted: wakeBudgetExhausted };
}