/**
 * VISION — CONNECTED BUSINESS
 * CB-005B — JOB REPOSITORY
 *
 * The ONLY database boundary for provider execution. Every function here calls one
 * of the seven CB-005B functions or reads a row; none of them constructs a state
 * transition in JavaScript, because the state machine lives in the database where a
 * concurrent worker cannot step over it.
 *
 * TWO RULES THIS FILE ENFORCES BY SHAPE
 *   1. Reads use the service client's SELECT privilege (the only privilege it has on
 *      these tables); every mutation goes through an RPC that re-derives the
 *      authority from the row and fences on the lease.
 *   2. Errors are translated into a CLOSED set of codes. A worker must be able to
 *      branch on "my lease is gone" versus "the database is unhappy" without ever
 *      parsing a database message.
 */

import { clampClaimBatch, clampLeaseSeconds, EXECUTION_LIMITS } from './executionPolicy.ts';

export const LEASE_FENCED = 'LEASE_FENCED';
export const CHECKPOINT_STALE = 'CHECKPOINT_STALE';
export const CHECKPOINT_NOT_MONOTONIC = 'CHECKPOINT_NOT_MONOTONIC';
export const CHECKPOINT_KIND_MISMATCH = 'CHECKPOINT_KIND_MISMATCH';
export const DEDUP_KEY_MISMATCH = 'DEDUP_KEY_MISMATCH';
// A delivered observation carried a different payload for a dedup_key that is
// already stored. The database refuses the whole unit — nothing stored, no cursor
// movement — so this reaches the worker as a refusal, never as an absorbed page.
export const OBSERVATION_CONFLICT = 'OBSERVATION_CONFLICT';
// Two writers reached one dedup_key without the per-key serialization (or a receipt
// failed to reconcile). The unit was rolled back whole; a retry in a fresh
// transaction classifies against the committed row, so this is RETRYABLE.
export const OBSERVATION_RACE = 'OBSERVATION_RACE';
// The attempt passed its ABSOLUTE deadline (attempt_started_at + max_attempt_seconds).
// Deliberately distinct from a lost lease: the budget bounds the ATTEMPT itself, and
// the database refuses it independently of whether a lease still reads live — in
// authorize, in ingest and in complete. The worker's answer is the same as for a fence
// (stop, commit nothing), but the reason stays legible, which is what tells an operator
// "this attempt ran out of time" apart from "someone else took my claim".
export const ATTEMPT_EXPIRED = 'ATTEMPT_EXPIRED';
export const REJECTED_INPUT = 'REJECTED_INPUT';
export const DATABASE_ERROR = 'DATABASE_ERROR';

export class RepositoryError extends Error {
  code: string;
  detail: string | null;

  constructor(code: string, message: string, detail?: string | null) {
    super(message);
    this.name = 'RepositoryError';
    this.code = code;
    this.detail = detail || null;
  }
}

/** Database message → closed code. Order matters: the most specific token wins. */
export function classifyDatabaseError(message: unknown): string {
  const m = String(message || '');
  if (m.includes(ATTEMPT_EXPIRED)) return ATTEMPT_EXPIRED;
  if (m.includes(LEASE_FENCED)) return LEASE_FENCED;
  if (m.includes(CHECKPOINT_NOT_MONOTONIC)) return CHECKPOINT_NOT_MONOTONIC;
  if (m.includes(CHECKPOINT_KIND_MISMATCH)) return CHECKPOINT_KIND_MISMATCH;
  if (m.includes(CHECKPOINT_STALE)) return CHECKPOINT_STALE;
  if (m.includes(DEDUP_KEY_MISMATCH)) return DEDUP_KEY_MISMATCH;
  if (m.includes(OBSERVATION_CONFLICT)) return OBSERVATION_CONFLICT;
  if (m.includes(OBSERVATION_RACE) || m.includes('provider_observations_dedup_unique')) return OBSERVATION_RACE;
  if (
    m.includes('out of bounds') || m.includes('must be') || m.includes('unsupported') ||
    m.includes('exceeds the') || m.includes('is required') || m.includes('not found in this business') ||
    m.includes('does not belong') || m.includes('does not match') || m.includes('not active') ||
    m.includes('is not usable') || m.includes('requires')
  ) {
    return REJECTED_INPUT;
  }
  return DATABASE_ERROR;
}

export function isLeaseFence(code: unknown): boolean {
  return code === LEASE_FENCED;
}

async function callRpc(sb: any, name: string, args: Record<string, unknown>): Promise<any> {
  const { data, error } = await sb.rpc(name, args);
  if (error) throw new RepositoryError(classifyDatabaseError(error.message), `${name} failed`, error.message);
  return data;
}

/**
 * The worker identity is DERIVED, never accepted. It names the acting principal and
 * carries a per-execution nonce so two wakes by the same administrator are still
 * distinguishable in claimed_by — attribution without a caller-chosen value.
 */
export function deriveWorkerId(actorKind: string, actorRef: string | null): string {
  const kind = actorKind === 'system' ? 'system' : 'user';
  const ref = typeof actorRef === 'string' && actorRef.length > 0 ? actorRef.slice(0, 64) : 'unknown';
  const nonce = globalThis.crypto.randomUUID();
  return `${kind}:${ref}:${nonce}`.slice(0, 128);
}

export async function enqueueJob(sb: any, input: {
  businessId: string; connectionId: string; credentialId: string; provider: string;
  providerOperation: string; priority?: number; maxAttempts?: number; maxAttemptSeconds?: number;
}): Promise<string> {
  return callRpc(sb, 'provider_sync_job_enqueue', {
    p_business_id: input.businessId,
    p_business_connection_id: input.connectionId,
    p_credential_id: input.credentialId,
    p_provider: input.provider,
    p_provider_operation: input.providerOperation,
    p_priority: input.priority ?? 100,
    p_max_attempts: input.maxAttempts ?? EXECUTION_LIMITS.MAX_ATTEMPTS_DEFAULT,
    p_max_attempt_seconds: input.maxAttemptSeconds ?? EXECUTION_LIMITS.MAX_ATTEMPT_SECONDS_DEFAULT,
  });
}

/** Atomic claim, bounded and clamped. Returns whatever the database actually granted. */
export async function claimJobs(sb: any, input: { workerId: string; limit?: number; leaseSeconds?: number }): Promise<any[]> {
  const data = await callRpc(sb, 'provider_sync_job_claim', {
    p_worker_id: input.workerId,
    p_limit: clampClaimBatch(input.limit),
    p_lease_seconds: clampLeaseSeconds(input.leaseSeconds),
  });
  return Array.isArray(data) ? data : [];
}

export async function renewLease(sb: any, input: {
  jobId: string; attemptId: string; leaseId: string; workerId: string; leaseSeconds?: number;
}): Promise<boolean> {
  const data = await callRpc(sb, 'provider_sync_job_renew_lease', {
    p_job_id: input.jobId,
    p_attempt_id: input.attemptId,
    p_lease_id: input.leaseId,
    p_worker_id: input.workerId,
    p_lease_seconds: clampLeaseSeconds(input.leaseSeconds),
  });
  return data === true;
}

/** 'NOT_FOUND' | 'LEASE_FENCED' | 'ATTEMPT_EXPIRED' | 'completed' | 'retry_wait' | 'failed' */
export async function completeJob(sb: any, input: {
  jobId: string; attemptId: string; leaseId: string; workerId: string;
  outcome: 'completed' | 'retryable' | 'failed';
  errorClass?: string | null; errorCode?: string | null; errorMessage?: string | null; backoffSeconds?: number | null;
}): Promise<string> {
  const data = await callRpc(sb, 'provider_sync_job_complete', {
    p_job_id: input.jobId,
    p_attempt_id: input.attemptId,
    p_lease_id: input.leaseId,
    p_worker_id: input.workerId,
    p_outcome: input.outcome,
    p_error_class: input.errorClass ?? null,
    p_error_code: input.errorCode ?? null,
    p_error_message: input.errorMessage ?? null,
    p_backoff_seconds: input.backoffSeconds ?? null,
  });
  return typeof data === 'string' ? data : 'UNKNOWN_VERDICT';
}

export async function sweepJobs(sb: any, input: { limit?: number }): Promise<number> {
  const limit = typeof input?.limit === 'number' ? Math.min(Math.max(Math.trunc(input.limit), 1), EXECUTION_LIMITS.SWEEP_LIMIT_MAX) : 100;
  const data = await callRpc(sb, 'provider_sync_job_sweep', { p_limit: limit });
  return typeof data === 'number' ? data : 0;
}

/**
 * The independent claim verification (§3). Read-only; returns `verified:false` with a
 * claim_state rather than throwing, because a refusal is an expected answer here.
 */
export async function authorizeClaim(sb: any, input: {
  jobId: string; attemptId: string | null; leaseId: string | null; workerId: string;
}): Promise<{ verified: boolean; claim_state: string; job: any | null }> {
  const data = await callRpc(sb, 'provider_sync_job_authorize', {
    p_job_id: input.jobId,
    p_attempt_id: input.attemptId,
    p_lease_id: input.leaseId,
    p_worker_id: input.workerId,
  });
  if (!data || typeof data !== 'object') return { verified: false, claim_state: 'verification_unavailable', job: null };
  return {
    verified: data.verified === true,
    claim_state: typeof data.claim_state === 'string' ? data.claim_state : 'unknown',
    job: data.job && typeof data.job === 'object' ? data.job : null,
  };
}

/**
 * The fenced write unit: observations and the checkpoint advance commit together or
 * not at all. Throws a RepositoryError whose code the caller branches on.
 */
export async function ingestBatch(sb: any, input: {
  jobId: string; attemptId: string; leaseId: string; workerId: string;
  observations: any[]; checkpoint?: Record<string, unknown> | null;
}): Promise<{ delivered: number; inserted: number; duplicates: number; conflicts: number; batch_id: string | null; checkpoint: any | null }> {
  const data = await callRpc(sb, 'provider_sync_observation_ingest', {
    p_job_id: input.jobId,
    p_attempt_id: input.attemptId,
    p_lease_id: input.leaseId,
    p_worker_id: input.workerId,
    p_observations: input.observations || [],
    p_checkpoint: input.checkpoint ?? null,
  });
  return {
    delivered: typeof data?.delivered === 'number' ? data.delivered : 0,
    inserted: typeof data?.inserted === 'number' ? data.inserted : 0,
    duplicates: typeof data?.duplicates === 'number' ? data.duplicates : 0,
    conflicts: typeof data?.conflicts === 'number' ? data.conflicts : 0,
    batch_id: data?.batch_id || null,
    checkpoint: data?.checkpoint || null,
  };
}

export async function readJob(sb: any, jobId: string): Promise<any | null> {
  const { data } = await sb.from('provider_sync_jobs').select('*').eq('id', jobId).maybeSingle();
  return data || null;
}

export async function readConnection(sb: any, connectionId: string): Promise<any | null> {
  const { data } = await sb.from('business_connections').select('*').eq('id', connectionId).maybeSingle();
  return data || null;
}

/**
 * The ACTIVE credential of a rotation unit — addressed the way CB-002 addresses it
 * (business + connection + credential_type), not by credential id. That is what makes
 * execution rotation-correct: a rotated successor is used automatically, and a
 * revoked unit yields null, which the kernel refuses as CREDENTIAL_UNAVAILABLE.
 */
export async function readActiveCredential(sb: any, input: {
  businessId: string; connectionId: string; credentialType: string;
}): Promise<any | null> {
  if (!input?.businessId || !input?.connectionId || !input?.credentialType) return null;
  const { data } = await sb
    .from('provider_credentials')
    .select('*')
    .eq('business_id', input.businessId)
    .eq('business_connection_id', input.connectionId)
    .eq('credential_type', input.credentialType)
    .eq('status', 'active')
    .maybeSingle();
  return data || null;
}

export async function readCheckpoint(sb: any, jobId: string, scope: string): Promise<any | null> {
  const { data } = await sb
    .from('provider_sync_checkpoints')
    .select('*')
    .eq('job_id', jobId)
    .eq('checkpoint_scope', scope)
    .maybeSingle();
  return data || null;
}

export async function listJobsForBusiness(sb: any, input: { businessId: string; limit?: number }): Promise<any[]> {
  const limit = typeof input?.limit === 'number' ? Math.min(Math.max(Math.trunc(input.limit), 1), 100) : 25;
  const { data } = await sb
    .from('provider_sync_jobs')
    .select('id,status,provider,provider_operation,attempt_count,max_attempts,next_attempt_at,lease_expires_at,last_error_class,last_error_code,created_at,updated_at')
    .eq('business_id', input.businessId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return Array.isArray(data) ? data : [];
}

export async function countObservationsForBusiness(sb: any, businessId: string): Promise<number> {
  const { count } = await sb
    .from('provider_observations')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId);
  return typeof count === 'number' ? count : 0;
}