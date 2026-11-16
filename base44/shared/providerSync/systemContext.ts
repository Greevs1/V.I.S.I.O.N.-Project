/**
 * VISION — CONNECTED BUSINESS
 * CB-005B — VERIFIED SYSTEM CONTEXT
 *
 * THE ENTIRE POINT OF THIS FILE
 *
 *   The authorization kernel (CB-004/CB-004.2) treats `systemContext.authenticity
 *   === 'verified'` as the fact that a system actor is genuine. This module is the
 *   ONLY producer of that fact in CB-005B, and it can produce it from exactly one
 *   input: a claim the DATABASE has just verified against the job row and its own
 *   clock (provider_sync_job_authorize()).
 *
 *   A request body cannot reach it. A caller cannot forge it: buildVerifiedContext()
 *   refuses anything that is not a database-verified claim, and the wake endpoint
 *   rejects an incoming system-context claim outright rather than ignoring it —
 *   silence would leave the attempt invisible, while a refusal records it.
 *
 * WHAT "VERIFIED" MEANS HERE, PRECISELY
 *   verified =  the job row exists, is status='claimed', its attempt_id, lease_id and
 *               claimed_by match this worker, its lease_expires_at is in the FUTURE
 *               according to database now(), and its attempt budget is intact.
 *   It does NOT mean "the caller said so", and it does NOT mean "the worker is
 *   trusted". The worker is untrusted; the row is the authority.
 *
 * WHY THIS IS THE WHOLE OF "SYSTEM EXECUTION AUTHENTICITY" IN CODE
 *   No CB-005A module exists in this repository (verified by inspection), so the
 *   trust boundary is exactly the one CB-004 established: a system actor is a kind
 *   that must carry a verified context, and the context is only as good as its
 *   producer. This module makes that producer DB-derived. A stronger invocation
 *   mechanism (a signed scheduler call, for instance) is an ADDITION to this
 *   boundary, not a replacement for it, and is deliberately not invented here.
 */

export const SYSTEM_CONTEXT_KIND_SYNC_WORKER = 'sync_worker';

/** The only claim shape that may become a verified context. */
export function assertDbVerifiedClaim(claim: any): { attemptId: string; jobId: string } {
  if (!claim || typeof claim !== 'object') {
    throw new Error('systemContext: a database-verified claim object is required');
  }
  if (claim.verified !== true || claim.claim_state !== 'live') {
    throw new Error('systemContext: refusing to build a verified context from an unverified claim');
  }
  const job = claim.job || {};
  const attemptId = job.attempt_id;
  const jobId = job.id;
  if (typeof attemptId !== 'string' || attemptId.trim().length === 0) {
    throw new Error('systemContext: a verified claim must carry the attempt identity');
  }
  if (typeof jobId !== 'string' || jobId.trim().length === 0) {
    throw new Error('systemContext: a verified claim must carry the job identity');
  }
  return { attemptId, jobId };
}

/**
 * The verified context handed to the kernel. `evidence_id` is the ATTEMPT identity —
 * not the job, not the business — because the attempt is what the database just
 * proved to be live. The extra fields are carried for the audit's safe metadata and
 * are bound-checked by the audit writer's own recursion.
 */
export function buildVerifiedContext(claim: any): {
  kind: string; authenticity: 'verified'; evidence_id: string; job_id: string; claim_state: string;
} {
  const { attemptId, jobId } = assertDbVerifiedClaim(claim);
  return {
    kind: SYSTEM_CONTEXT_KIND_SYNC_WORKER,
    authenticity: 'verified',
    evidence_id: attemptId,
    job_id: jobId,
    claim_state: 'live',
  };
}

/**
 * The UNVERIFIED context, used when the database refused the claim. It is not a
 * weaker grant — it is the opposite: the kernel's first system-actor rule rejects it
 * with PROVIDER_AUTHENTICITY_FAILED and audits that fact. The precise reason travels
 * in `claim_state`, so an operator reading the audit trail sees WHY the attempt could
 * not be authenticated (lease_expired, claim_mismatch, job_not_claimed, …) without a
 * single caller-supplied value being trusted.
 */
export function buildUnverifiedContext(input: { claimState?: string; jobId?: string | null }): {
  kind: string; authenticity: 'unverified'; evidence_id: string; job_id: string | null; claim_state: string;
} {
  const claimState = typeof input?.claimState === 'string' && input.claimState.length > 0
    ? input.claimState.slice(0, 64)
    : 'unverified';
  const jobId = typeof input?.jobId === 'string' && input.jobId.length > 0 ? input.jobId : null;
  return {
    kind: SYSTEM_CONTEXT_KIND_SYNC_WORKER,
    authenticity: 'unverified',
    // A bounded, non-empty id keeps the shape well-formed even for a refusal; the
    // kernel rejects on authenticity BEFORE it ever inspects this field.
    evidence_id: jobId || 'unavailable',
    job_id: jobId,
    claim_state: claimState,
  };
}

/** Is this a context this module produced, carrying a verified claim? */
export function isVerifiedContext(context: any): boolean {
  return Boolean(context)
    && context.kind === SYSTEM_CONTEXT_KIND_SYNC_WORKER
    && context.authenticity === 'verified'
    && typeof context.evidence_id === 'string'
    && context.evidence_id.length > 0;
}

/** The request-body keys that may never influence a system context — refused outright. */
export const FORBIDDEN_WAKE_BODY_KEYS = [
  'system_context', 'systemContext', 'authenticity', 'actor_kind', 'actorKind',
  'business_id', 'businessId', 'provider', 'connection_id', 'connectionId',
  'credential_id', 'credentialId', 'credential_type', 'credentialType',
  'job_id', 'jobId', 'attempt_id', 'attemptId', 'lease_id', 'leaseId',
  'claim', 'verified', 'credentials', 'access_token', 'refresh_token', 'secret',
  // A caller-supplied worker identity is refused too: worker_id is derived
  // server-side, so accepting one would let a caller choose its own attribution.
  'worker_id', 'workerId',
] as const;

/** Any forbidden key present is a REFUSAL, not a field to ignore. */
export function findForbiddenWakeBodyKeys(body: any): string[] {
  if (!body || typeof body !== 'object') return [];
  return FORBIDDEN_WAKE_BODY_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(body, key));
}