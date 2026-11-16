/**
 * VISION — CONNECTED BUSINESS
 * CB-005B — JOB STATE MACHINE
 *
 * The five legal states, every legal transition, and — most importantly — the
 * FENCING PREDICATE, expressed once as pure functions so the harness can test the
 * exact rule the SQL enforces instead of a paraphrase of it.
 *
 * ── THE TRANSITIONS (documented here because §2 requires it in one place) ────
 *
 *   queued     → claimed        claim            (atomic, SKIP LOCKED, DB time)
 *   queued     → failed         sweep            (attempt budget already spent)
 *   retry_wait → claimed        claim            (once next_attempt_at <= now())
 *   retry_wait → failed         sweep            (attempt budget spent)
 *   claimed    → completed      complete('completed')      — fenced, live lease
 *   claimed    → retry_wait     complete('retryable')      — fenced, attempts remain
 *   claimed    → failed         complete('failed')         — fenced, terminal class
 *   claimed    → failed         complete('retryable')      — fenced, budget exhausted
 *                                                          → transient_exhausted
 *   claimed    → claimed        claim            (LEASE-EXPIRED RECOVERY: new
 *                                                 attempt_id, new lease_id,
 *                                                 attempt_count incremented)
 *   completed  → (terminal)     no transition exists
 *   failed     → (terminal)     no transition exists
 *
 * Note what the table deliberately does NOT contain: there is no path out of a
 * terminal state, no path from a state to itself other than lease-expiry recovery,
 * and no path that a worker can take without matching the lease. "Cancelled" and
 * "blocked" are absent on purpose — CB-005B ships no operator control surface, and a
 * state nothing can enter would be untested vocabulary rather than a guarantee.
 */

import {
  JOB_STATUSES,
  CLAIMABLE_JOB_STATUSES,
  TERMINAL_JOB_STATUSES,
  EXECUTION_ERROR_CLASSES,
  type JobStatus,
} from './executionPolicy.ts';

export const JOB_TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  queued: ['claimed', 'failed'],
  retry_wait: ['claimed', 'failed'],
  claimed: ['completed', 'retry_wait', 'failed', 'claimed'],
  completed: [],
  failed: [],
};

export function isKnownStatus(value: unknown): boolean {
  return (JOB_STATUSES as readonly string[]).includes(String(value));
}

export function isTerminalStatus(value: unknown): boolean {
  return (TERMINAL_JOB_STATUSES as readonly string[]).includes(String(value));
}

export function isClaimableStatus(value: unknown): boolean {
  return (CLAIMABLE_JOB_STATUSES as readonly string[]).includes(String(value));
}

export function isLegalTransition(from: unknown, to: unknown): boolean {
  if (!isKnownStatus(from) || !isKnownStatus(to)) return false;
  return (JOB_TRANSITIONS[from as JobStatus] as readonly string[]).indexOf(String(to)) > -1;
}

const toMs = (value: string | number | null | undefined): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

/**
 * The four facts a live claim consists of. Everything else in the row is history.
 * This is the shape the harness uses for its fixtures, so a test that forgets the
 * lease identity cannot accidentally pass.
 */
export type ClaimIdentity = { attempt_id: string | null; lease_id: string | null; claimed_by: string | null; lease_expires_at: string | null };

/** Is this worker, at this instant, the live claim holder of this job row? */
export function isLeaseLive(row: any, identity: ClaimIdentity, nowMs: number): boolean {
  if (!row || row.status !== 'claimed') return false;
  if (row.attempt_id !== identity.attempt_id) return false;
  if (row.lease_id !== identity.lease_id) return false;
  if (row.claimed_by !== identity.claimed_by) return false;
  const expires = toMs(row.lease_expires_at);
  if (expires === null) return false;
  return expires > nowMs;
}

/** A worker is fenced OUT whenever its own lease no longer matches — including when it never had one. */
export function isFencedOut(row: any, identity: ClaimIdentity, nowMs: number): boolean {
  return !isLeaseLive(row, identity, nowMs);
}

/**
 * The attempt's ABSOLUTE DEADLINE in epoch milliseconds: attempt_started_at +
 * max_attempt_seconds. This is the instant the lease is capped at and the instant
 * authorize, ingest and complete each refuse at or after, so it is the one deadline
 * value every reader in the phase has to agree on.
 */
export function attemptDeadlineMs(row: any): number | null {
  const started = toMs(row?.attempt_started_at);
  const seconds = typeof row?.max_attempt_seconds === 'number' ? row.max_attempt_seconds : null;
  if (started === null || seconds === null) return null;
  return started + seconds * 1000;
}

/** The per-attempt database budget: attempt_started_at + max_attempt_seconds. */
export function attemptBudgetOpen(row: any, nowMs: number): boolean {
  const started = toMs(row?.attempt_started_at);
  const seconds = typeof row?.max_attempt_seconds === 'number' ? row.max_attempt_seconds : null;
  if (started === null || seconds === null) return false;
  return nowMs < started + seconds * 1000;
}

/** Does this row still have attempt budget to be claimed at all? */
export function hasAttemptBudget(row: any): boolean {
  const used = typeof row?.attempt_count === 'number' ? row.attempt_count : 0;
  const max = typeof row?.max_attempts === 'number' ? row.max_attempts : 0;
  return used < max;
}

/**
 * The claim predicate, mirrored from provider_sync_job_claim(). Two independent
 * sources of eligibility — a fresh job, and an expired lease whose worker is gone.
 */
export function isClaimEligible(row: any, nowMs: number): boolean {
  if (!row || !isKnownStatus(row.status)) return false;
  if (!hasAttemptBudget(row)) return false;
  if (isClaimableStatus(row.status)) {
    // FAIL CLOSED, exactly as the SQL does. `next_attempt_at <= now()` is NULL —
    // never TRUE — when the schedule is absent, so a claimable row without one is
    // unclaimable in the database. Reporting it as eligible here would model a
    // different database than the one that actually runs the claim.
    const next = toMs(row.next_attempt_at);
    return next !== null && next <= nowMs;
  }
  if (row.status === 'claimed') {
    const expires = toMs(row.lease_expires_at);
    return expires !== null && expires <= nowMs;
  }
  return false;
}

/**
 * The row-shape invariants the database enforces (lease_shape, attempt_bounds,
 * terminal_shape, failure_shape, retry_shape). Reproduced here so the in-process
 * model cannot drift into a state the real table would reject — a fixture the
 * database would refuse is a fixture that proves nothing.
 */
export function rowShapeViolations(row: any): string[] {
  const out: string[] = [];
  if (!row || !isKnownStatus(row.status)) out.push('unknown_status');
  const hasLease = row?.lease_id !== null && row?.lease_id !== undefined
    && row?.lease_expires_at !== null && row?.lease_expires_at !== undefined;
  if (row?.status === 'claimed') {
    if (!hasLease) out.push('claimed_without_lease');
    if (!row?.attempt_id) out.push('claimed_without_attempt_id');
    if (!row?.attempt_started_at) out.push('claimed_without_attempt_started_at');
    if (!row?.claimed_by) out.push('claimed_without_claimed_by');
  } else if (hasLease) {
    out.push('non_claimed_with_live_lease_columns');
  }
  const used = row?.attempt_count;
  const max = row?.max_attempts;
  if (typeof used === 'number' && typeof max === 'number' && (used < 0 || used > max)) out.push('attempt_bounds');
  if (row?.status === 'completed') {
    if (!row?.completed_at) out.push('completed_without_completed_at');
    if (row?.last_error_class !== null && row?.last_error_class !== undefined) out.push('completed_with_error_class');
  }
  if (row?.status === 'failed' && (row?.last_error_class === null || row?.last_error_class === undefined)) {
    out.push('failed_without_error_class');
  }
  if (row?.last_error_class !== null && row?.last_error_class !== undefined
    && (EXECUTION_ERROR_CLASSES as readonly string[]).indexOf(String(row.last_error_class)) === -1) {
    out.push('unknown_error_class');
  }
  if (row?.status === 'retry_wait' && row?.last_error_class === null) out.push('retry_wait_without_error_class');
  // schedule_shape. next_attempt_at is NULLABLE BY DESIGN and its presence IS the
  // schedule. A queued or retry_wait row must carry it: the claim predicate is
  // `next_attempt_at <= now()`, which is NULL rather than TRUE when the schedule is
  // missing, so such a row could never be claimed and nothing would report it. A
  // claimed or terminal row must not carry one — the lease governs recovery while
  // claimed, and a terminal job has no next attempt.
  const scheduled = row?.next_attempt_at !== null && row?.next_attempt_at !== undefined;
  const claimable = row?.status === 'queued' || row?.status === 'retry_wait';
  if (claimable && !scheduled) out.push('claimable_without_schedule');
  if (!claimable && scheduled) out.push('unscheduled_state_carrying_schedule');
  // lease_within_attempt. A lease may never outlive the attempt's OWN deadline: the
  // budget is the authority, and a lease that reached beyond it would let "the lease
  // reads live" outvote the deadline in every reader — including the recovery predicate,
  // which depends on "deadline passed" always implying "lease expired".
  const deadline = attemptDeadlineMs(row);
  const expires = toMs(row?.lease_expires_at);
  if (row?.status === 'claimed' && deadline !== null && expires !== null && expires > deadline) {
    out.push('lease_beyond_attempt_deadline');
  }
  return out;
}