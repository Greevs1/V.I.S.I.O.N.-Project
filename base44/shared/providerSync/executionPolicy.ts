/**
 * VISION — CONNECTED BUSINESS
 * CB-005B — EXECUTION POLICY
 *
 * The ONE place where the numeric bounds, the state vocabulary and the structured
 * failure vocabulary live. Every value here is mirrored by a CHECK constraint, a
 * function bound or a claim predicate in
 * src/supabase/migrations/phase_cb_005b_provider_execution_foundation.sql, and the
 * harness asserts that the two agree — so a bound can never be tightened in code
 * while the database still permits the looser value.
 *
 * WHY BOUNDS ARE SECURITY, NOT TUNING (§6)
 *   "Protect against unbounded loops, excessive provider calls and retry storms."
 *   Each of those is a resource-exhaustion attack surface:
 *     · CLAIM_BATCH_MAX            caps how much work one wake can take on
 *     · MAX_ATTEMPTS_*             caps total work per job, ever
 *     · MAX_ATTEMPT_SECONDS_*      caps how long ONE attempt may hold a job open
 *     · ATTEMPT_MS_BUDGET          stays BELOW the database-enforced attempt budget,
 *                                  so the worker always stops itself before the
 *                                  database would have to refuse its renewal
 *     · MAX_PAGES/MAX_OBSERVATIONS caps provider calls and writes per execution
 *     · BACKOFF_MAX_SECONDS        caps how fast a failing job can come back
 *   A worker that ignores any of them is the failure mode these constants exist to
 *   make impossible, which is why they are data rather than scattered literals.
 */

/** The five job states. Every one is reachable and exited (see jobStateMachine.ts). */
export const JOB_STATUSES = ['queued', 'claimed', 'retry_wait', 'completed', 'failed'] as const;

/** States a job can be claimed FROM (immediately, or once its retry time arrives). */
export const CLAIMABLE_JOB_STATUSES = ['queued', 'retry_wait'] as const;

/** States that count as "this scope already has live work" (the partial unique index). */
export const LIVE_JOB_STATUSES = ['queued', 'claimed', 'retry_wait'] as const;

/** Terminal states cannot be left. */
export const TERMINAL_JOB_STATUSES = ['completed', 'failed'] as const;

/**
 * The provider operations a JOB may execute. Note what is NOT here: 'sync.execute'
 * is the AUTHORIZATION operation (CB-004.2) and can never be a job's payload — a
 * job that executed itself would be circular and unaccountable.
 */
export const JOB_OPERATIONS = ['sync.start', 'accounts.read', 'balances.read', 'transactions.read'] as const;

/** The structured failure classification (§6). Mirrors the SQL error-class CHECK. */
export const EXECUTION_ERROR_CLASSES = [
  'transient',
  'rate_limited',
  'timeout',
  'provider_error',
  'provider_protocol_error',
  'configuration_error',
  'permanent',
  'lease_lost',
  'transient_exhausted',
] as const;

/** Classes worth trying again. */
export const RETRYABLE_ERROR_CLASSES = ['transient', 'rate_limited', 'timeout'] as const;

/** Classes where retrying cannot help — the job ends, visibly. */
export const TERMINAL_ERROR_CLASSES = ['permanent', 'configuration_error', 'provider_protocol_error'] as const;

export const EXECUTION_LIMITS = {
  CLAIM_BATCH_MIN: 1,
  CLAIM_BATCH_MAX: 5,
  CLAIM_BATCH_DEFAULT: 2,

  LEASE_SECONDS_MIN: 30,
  LEASE_SECONDS_MAX: 900,
  LEASE_SECONDS_DEFAULT: 180,

  MAX_ATTEMPTS_MIN: 1,
  MAX_ATTEMPTS_MAX: 10,
  MAX_ATTEMPTS_DEFAULT: 5,

  MAX_ATTEMPT_SECONDS_MIN: 30,
  MAX_ATTEMPT_SECONDS_MAX: 3600,
  MAX_ATTEMPT_SECONDS_DEFAULT: 600,

  BACKOFF_MIN_SECONDS: 1,
  BACKOFF_MAX_SECONDS: 900,
  BACKOFF_BASE_SECONDS: 30,

  MAX_BATCH_OBSERVATIONS: 500,
  MAX_OBSERVATION_PAYLOAD_BYTES: 16384,
  MAX_BATCH_BYTES: 2097152,

  MAX_PAGES_PER_EXECUTION: 20,
  MAX_OBSERVATIONS_PER_EXECUTION: 2000,
  MAX_LEASE_RENEWALS_PER_ATTEMPT: 20,

  /** Must stay strictly below MAX_ATTEMPT_SECONDS_MAX (the database's own budget). */
  ATTEMPT_MS_BUDGET: 600000,
  LEASE_RENEW_AFTER_MS: 60000,
  PAGE_REQUEST_TIMEOUT_MS: 15000,

  MAX_EXECUTIONS_PER_WAKE: 5,
  WAKE_MS_BUDGET: 240000,

  RATE_LIMIT_MAX_RETRIES: 3,
  RATE_LIMIT_MAX_WAIT_SECONDS: 300,

  SWEEP_LIMIT_MAX: 500,
} as const;

export type JobStatus = (typeof JOB_STATUSES)[number];
export type ExecutionErrorClass = (typeof EXECUTION_ERROR_CLASSES)[number];

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback;
  return Math.min(Math.max(n, min), max);
}

/** A requested claim batch, clamped to the legal range — never rejected, never expanded. */
export function clampClaimBatch(limit: unknown): number {
  return clampInt(limit, EXECUTION_LIMITS.CLAIM_BATCH_MIN, EXECUTION_LIMITS.CLAIM_BATCH_MAX, EXECUTION_LIMITS.CLAIM_BATCH_DEFAULT);
}

/** A requested lease, clamped. The database clamps again; both must agree. */
export function clampLeaseSeconds(seconds: unknown): number {
  return clampInt(seconds, EXECUTION_LIMITS.LEASE_SECONDS_MIN, EXECUTION_LIMITS.LEASE_SECONDS_MAX, EXECUTION_LIMITS.LEASE_SECONDS_DEFAULT);
}

/**
 * Bounded exponential backoff. Deterministic on purpose: a random jitter would make
 * retry behaviour untestable, and the anti-storm guarantee comes from the partial
 * unique index and the attempt budget rather than from jitter.
 */
export function backoffSecondsForAttempt(attempt: number): number {
  const n = Number.isFinite(attempt) && attempt > 0 ? Math.trunc(attempt) : 1;
  const raw = EXECUTION_LIMITS.BACKOFF_BASE_SECONDS * Math.pow(3, n - 1);
  const capped = Math.min(raw, EXECUTION_LIMITS.BACKOFF_MAX_SECONDS);
  return Math.max(capped, EXECUTION_LIMITS.BACKOFF_MIN_SECONDS);
}

export function isKnownErrorClass(value: unknown): boolean {
  return (EXECUTION_ERROR_CLASSES as readonly string[]).includes(String(value));
}

export function isRetryableErrorClass(value: unknown): boolean {
  return (RETRYABLE_ERROR_CLASSES as readonly string[]).includes(String(value));
}

export function isTerminalErrorClass(value: unknown): boolean {
  return (TERMINAL_ERROR_CLASSES as readonly string[]).includes(String(value));
}

/**
 * classifyFailure — one provider/transport failure → one structured class.
 *
 * Fail CLOSED: an unclassifiable failure is 'provider_error', which the executor
 * treats as retryable only because the attempt budget bounds it. Nothing here can
 * return 'lease_lost' unless the database actually refused a fenced write, because
 * mislabelling a lease loss as retryable would let a stopped worker keep going.
 */
export function classifyFailure(input: {
  leaseFenced?: boolean;
  timedOut?: boolean;
  rateLimited?: boolean;
  httpStatus?: number | null;
  protocolViolation?: boolean;
  configuration?: boolean;
  providerError?: boolean;
}): ExecutionErrorClass {
  const f = input || {};
  if (f.leaseFenced) return 'lease_lost';
  if (f.rateLimited) return 'rate_limited';
  if (f.timedOut) return 'timeout';
  if (f.configuration) return 'configuration_error';
  if (f.protocolViolation) return 'provider_protocol_error';
  const status = typeof f.httpStatus === 'number' ? f.httpStatus : null;
  if (status === 429) return 'rate_limited';
  if (status === 401 || status === 403) return 'permanent';
  if (status !== null && status >= 500) return 'transient';
  if (status !== null && status >= 400) return 'permanent';
  return 'provider_error';
}

/**
 * How a failure class maps onto the completion call. 'lease_lost' maps to nothing:
 * a worker that lost its lease may not call complete() at all, because the row it
 * would write is not its own.
 */
export function completionOutcomeFor(errorClass: unknown): 'completed' | 'retryable' | 'failed' | null {
  if (errorClass === null || errorClass === undefined) return 'completed';
  if (errorClass === 'lease_lost') return null;
  if (isTerminalErrorClass(errorClass)) return 'failed';
  return 'retryable';
}

/** Has this attempt spent its wall-clock budget? (application side of the DB budget) */
export function attemptBudgetExhausted(input: { attemptStartedAtMs: number | null; nowMs: number; budgetMs?: number }): boolean {
  const started = input?.attemptStartedAtMs;
  if (typeof started !== 'number' || !Number.isFinite(started)) return true;
  const budget = typeof input.budgetMs === 'number' ? input.budgetMs : EXECUTION_LIMITS.ATTEMPT_MS_BUDGET;
  return input.nowMs - started >= budget;
}

/**
 * Is a lease renewal due, and still permitted? Renewal is refused once the attempt's
 * database budget (attempt_started_at + max_attempt_seconds) would be exceeded, so
 * the worker stops itself rather than discovering the refusal later.
 */
export function decideLeaseRenewal(input: {
  leaseExpiresAtMs: number | null;
  nowMs: number;
  renewalsUsed: number;
  attemptStartedAtMs: number | null;
  maxAttemptSeconds: number | null;
}): { renew: boolean; reason: string } {
  const renewalsUsed = Number.isFinite(input?.renewalsUsed) ? Math.trunc(input.renewalsUsed as number) : 0;
  if (renewalsUsed >= EXECUTION_LIMITS.MAX_LEASE_RENEWALS_PER_ATTEMPT) {
    return { renew: false, reason: 'renewal_budget_exhausted' };
  }
  const maxAttemptSeconds = typeof input?.maxAttemptSeconds === 'number'
    ? input.maxAttemptSeconds
    : EXECUTION_LIMITS.MAX_ATTEMPT_SECONDS_MAX;
  const started = input?.attemptStartedAtMs;
  if (typeof started === 'number' && input.nowMs + EXECUTION_LIMITS.LEASE_RENEW_AFTER_MS >= started + maxAttemptSeconds * 1000) {
    return { renew: false, reason: 'attempt_budget_reached' };
  }
  const expires = input?.leaseExpiresAtMs;
  if (typeof expires !== 'number' || !Number.isFinite(expires)) return { renew: false, reason: 'no_lease' };
  if (expires - input.nowMs > EXECUTION_LIMITS.LEASE_RENEW_AFTER_MS) return { renew: false, reason: 'not_due' };
  return { renew: true, reason: 'due' };
}

export function pageBudgetExhausted(pages: number): boolean {
  return !Number.isFinite(pages) || pages >= EXECUTION_LIMITS.MAX_PAGES_PER_EXECUTION;
}

export function observationBudgetExhausted(observations: number): boolean {
  return !Number.isFinite(observations) || observations >= EXECUTION_LIMITS.MAX_OBSERVATIONS_PER_EXECUTION;
}

/** A page's worth of work must fit the ingest bound before it is sent. */
export function batchFitsIngestBound(count: number): boolean {
  return Number.isFinite(count) && count >= 0 && count <= EXECUTION_LIMITS.MAX_BATCH_OBSERVATIONS;
}

/** A bounded, token-free log line. Keys are whitelisted; payloads never qualify. */
const SAFE_LOG_KEYS = [
  'event', 'worker_id', 'job_id', 'attempt_id', 'attempt_count', 'connection_id', 'business_id',
  'provider', 'operation', 'status', 'outcome', 'error_class', 'error_code', 'pages',
  'observations', 'inserted', 'duplicates', 'conflicts', 'claim_state', 'code', 'reason',
  'http_status', 'batch_id', 'checkpoint_scope', 'cursor_version', 'duration_ms',
];

export function safeLogFields(fields: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!fields || typeof fields !== 'object') return out;
  for (const [key, value] of Object.entries(fields)) {
    if (SAFE_LOG_KEYS.indexOf(key) === -1) continue;
    if (value === null || value === undefined) continue;
    if (typeof value === 'object') continue;
    out[key] = typeof value === 'string' ? value.slice(0, 128) : value;
  }
  return out;
}