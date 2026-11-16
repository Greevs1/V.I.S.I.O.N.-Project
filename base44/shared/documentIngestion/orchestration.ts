/**
 * VISION 6D.0b.2 — DURABLE DOCUMENT INGESTION ORCHESTRATION.
 *
 * THE ONE CANONICAL WORKER. Both entry paths — the entity-triggered workflow
 * (normal ingestion) and the scheduled recovery workflow — call processJob()
 * from this module. There is no second processor and no second state machine.
 *
 * WHAT THIS MODULE OWNS
 *   durability, claiming, leasing, bounded retry, idempotency, recovery.
 *
 * WHAT IT DOES NOT OWN
 *   classification, taxonomy, reader selection, extraction, review state and
 *   state vocabulary — all of that remains 6D.0b / 6D.0b.1, invoked unchanged.
 *
 * TRUTH CONTRACT: the job row is a ledger, never a source of truth. Business,
 * scope and profile are re-derived from the canonical documents row on every
 * run; a caller cannot supply them and a copied value is never trusted.
 */
import { runIngestionUnderstanding } from '../documentUnderstanding/orchestrator.ts';
import { runExtraction, classifyExtractionOutcome } from '../documentExtraction/extractEngine.ts';

export const JOB_ENTITY = 'DocumentIngestionJob';

/** Orchestration states only: "does durable work still need to happen?" */
export const JOB_STATES = {
  QUEUED: 'queued',
  PROCESSING: 'processing',
  WAITING_RETRY: 'waiting_retry',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

export const MAX_ATTEMPTS = 3;
export const LEASE_MS = 5 * 60 * 1000;
/** Durable backoff between attempts: 2 min, then 10 min. */
export const RETRY_BACKOFF_MS = [2 * 60 * 1000, 10 * 60 * 1000];

/**
 * Canonical analysis states a claim may take over. This is the claim's atomic
 * witness: the canonical row's own status, so two workers cannot both win.
 */
export const CLAIMABLE_ANALYSIS_STATES = [
  'queued',
  'pending_analysis',
  'waiting_retry',
  'needs_classification',
  'unsupported',
];

/** Canonical analysis states that mean the canonical work is already done. */
export const SETTLED_ANALYSIS_STATES = ['completed', 'needs_review'];

/**
 * THE CANONICAL ANALYSIS STATE MACHINE (6D.0c §4) — one documented vocabulary,
 * with every writer named. A state that is not here does not exist, and no module
 * invents one locally.
 *
 *   queued              the upload created the analysis and accepted the work
 *                       (uploadDocumentToSupabase · adminUploadDocument ·
 *                        guestSessionService · a retry re-arm)
 *   processing          THE CLAIM'S LEASE WITNESS — claimJob() writing it is what
 *                       makes two workers unable to both win. LEGITIMATE, and the
 *                       reason the extraction gate must not be widened casually.
 *   needs_classification nothing has determined what this document is yet; also
 *                       the canonical surface of a run that could not finish
 *                       (markCanonicalUnresolved · pre-claim exhaustion)
 *   needs_review        a human decision is owed (confirmation required, or a
 *                       genuine extraction review reason). SETTLED: no further
 *                       machine work is owed UNTIL a human answers.
 *   pending_analysis    accepted, reader not yet run. THE HANDOFF STATE: the ONE
 *                       transition by which this worker hands the row to the
 *                       canonical extraction path (handOffToExtraction).
 *   analyzing           the reader is running (extractEngine's own claim)
 *   completed           extraction finished and reached a reviewable terminal state
 *   failed              processing ended unsuccessfully; the failure class is
 *                       recorded. Never a claim that nothing was attempted.
 *   unsupported         stored, type has no reader; nothing was attempted.
 *   waiting_retry       a bounded retry is owed and the row is claimable again.
 *                       This is what makes a RETRYABLE extraction failure able to
 *                       resume without erasing the attempt that failed.
 *
 * THE INVARIANT THIS PHASE REPAIRS: a routed document must never stop because the
 * worker itself placed the row in `processing`. The claim still writes it (it must),
 * and the handoff below is the single transition out of it into the reader's state.
 */
export const EXTRACTION_HANDOFF_STATE = 'pending_analysis';
export const RETRY_REARM_STATE = 'waiting_retry';

/**
 * The understanding layer's OWN persisted words for "the document's content could
 * not be read". They are decisions, not exceptions, so the worker has to read them:
 * content that was never reached is an infrastructure failure (bounded, durable
 * retry) — never evidence about what the document is.
 */
export const UNRESOLVED_INFRASTRUCTURE_REASONS = ['no_content_access', 'classification_unavailable'];

const DOCUMENT_COLUMNS =
  'id, profile_id, business_id, document_scope, storage_bucket, file_path, file_url, name, document_type, year, upload_status, status';
const ANALYSIS_COLUMNS = 'id, document_id, status, analysis_status';

/**
 * CANONICAL READ OUTCOMES.
 *
 * A query that FAILED and a query that SUCCEEDED and found nothing are different
 * facts. Collapsing them is what 6D.0b.2 production proved the cost of: a rejected
 * request (PGRST125, from a malformed project URL) was read as "the canonical
 * document row does not exist", the job was recorded terminal with zero attempts,
 * and the document sat unresolved forever behind a truthful-looking UI.
 */
export const READ_OUTCOMES = {
  FOUND: 'found',
  NOT_FOUND: 'not_found',
  QUERY_ERROR: 'query_error',
};

/**
 * THE canonical row read — three distinguishable outcomes, never two.
 *
 *   FOUND       the query succeeded and returned the canonical row
 *   NOT_FOUND   the query succeeded and the row genuinely does not exist
 *   QUERY_ERROR the query did NOT succeed (transport, path, auth, 5xx, shape)
 *
 * A QUERY_ERROR is never evidence about the row's existence: the error is
 * preserved (message + code) so the canonical failure classifier decides what it
 * is, instead of the caller deciding for it.
 */
export async function readCanonicalRow(sb: any, table: string, columns: string, id: string) {
  const failed = (err: any) => ({
    ok: false,
    outcome: READ_OUTCOMES.QUERY_ERROR,
    row: null,
    error: { message: String(err?.message || err || 'canonical read failed'), code: err?.code ?? null },
  });

  if (!sb || typeof sb.from !== 'function' || !id) return failed('supabase client unavailable');

  let res: any = null;
  try {
    res = await sb.from(table).select(columns).eq('id', id).maybeSingle();
  } catch (err: any) {
    return failed(err);
  }
  if (res?.error) return failed(res.error);
  if (!res?.data) return { ok: true, outcome: READ_OUTCOMES.NOT_FOUND, row: null, error: null };
  return { ok: true, outcome: READ_OUTCOMES.FOUND, row: res.data, error: null };
}

/** The durable gate. A job is claimable only when real work is still owed. */
export function isJobClaimable(job: any, now: string = new Date().toISOString()) {
  if (!job) return { claimable: false, reason: 'no_job' };
  const t = Date.parse(now);
  if (job.status === JOB_STATES.COMPLETED) return { claimable: false, reason: 'completed' };
  if (job.status === JOB_STATES.FAILED) return { claimable: false, reason: 'failed_terminal' };
  if ((job.attempt_count || 0) >= MAX_ATTEMPTS) return { claimable: false, reason: 'attempts_exhausted' };
  if (job.status === JOB_STATES.PROCESSING) {
    const lease = job.lease_expires_at ? Date.parse(job.lease_expires_at) : 0;
    return lease > t
      ? { claimable: false, reason: 'leased' }
      : { claimable: true, reason: 'lease_expired' };
  }
  if (job.status === JOB_STATES.WAITING_RETRY) {
    const due = job.next_retry_at ? Date.parse(job.next_retry_at) : 0;
    return due > t
      ? { claimable: false, reason: 'not_due' }
      : { claimable: true, reason: 'retry_due' };
  }
  return { claimable: true, reason: 'queued' };
}

/**
 * Failure classes. Only transient work is retried, and always a bounded number
 * of times; a permanent failure is terminal on the first attempt.
 */
export function classifyFailure(err: any) {
  const message = String((err && err.message) || err || 'unknown failure');
  const code = err && err.code ? String(err.code) : '';
  const text = `${(err && err.name) || ''} ${code} ${message}`;

  // An authorized content read that could NOT happen is transient by construction:
  // the source is present and unreachable — not absent, and not a verdict about the
  // document. Named FIRST so a reason token ("no_content_access") can never be
  // mistaken for a permanent conclusion.
  if (/content_read_unavailable/.test(text)) {
    return { error_class: 'transient', error_code: 'transient_infrastructure', message };
  }

  // A worker that cannot reach the canonical source for a CONFIGURATION reason — a
  // rejected request path, an invalid credential, a malformed project URL — cannot
  // be helped by retrying: it is terminal, and it must NEVER be recorded as a
  // missing document. ONE deliberately added class, not a taxonomy.
  if (/PGRST125|invalid path|invalid api key|invalid credential|unauthorized|forbidden|malformed url|invalid url|configuration_error/i.test(text)) {
    return { error_class: 'permanent', error_code: 'configuration_error', message };
  }
  if (/source_missing|no_content_access|relationship_mismatch|malformed|unsupported content|invalid contract/i.test(text)) {
    return { error_class: 'permanent', error_code: 'permanent', message };
  }
  if (/timeout|timed out|abort|deadline|classification_read_timeout|ECONN|ETIMEDOUT|EAI_AGAIN|network|fetch failed|\b429\b|\b5\d\d\b|signed url|storage|content_read_unavailable/i.test(text)) {
    return { error_class: 'transient', error_code: 'transient_infrastructure', message };
  }
  return { error_class: 'transient', error_code: 'transient', message };
}

export function backoffFor(attempt: number) {
  const i = Math.min(Math.max(attempt, 1), RETRY_BACKOFF_MS.length) - 1;
  return RETRY_BACKOFF_MS[i];
}

/**
 * A fresh, bounded content reference minted from the persisted storage path.
 * A stale 24-hour URL on the row is never assumed to be valid.
 */
export async function resolveContentAccess(sb: any, document: any) {
  const path = document?.file_path || null;
  const persisted = document?.file_url || null;

  // The canonical row — which this worker read SUCCESSFULLY — carries no storage
  // coordinates at all: the source is genuinely absent.
  if (!path && !persisted) return { signedUrl: null, base64: null, source_state: 'absent' };

  let signError: any = null;
  if (sb?.storage && path) {
    try {
      const bucket = document.storage_bucket || 'documents';
      const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 3600);
      if (data?.signedUrl) return { signedUrl: data.signedUrl, base64: null, source_state: 'available' };
      signError = { message: String(error?.message || 'signed url unavailable'), code: error?.statusCode ?? null };
    } catch (err: any) {
      signError = { message: String(err?.message || err), code: err?.code ?? null };
    }
  }

  // A persisted URL is still a usable content reference.
  if (persisted) return { signedUrl: persisted, base64: null, source_state: 'available' };

  // Signing failed and there was nothing to fall back to. That is a TRANSIENT
  // storage/signed-URL failure — the durable retry system's business — and never a
  // statement that the document has no source.
  return {
    signedUrl: null,
    base64: null,
    source_state: 'access_unavailable',
    error: signError || { message: 'storage unavailable', code: null },
  };
}

/**
 * ATOMIC CLAIM. The canonical analysis row is the witness, so a duplicate
 * delivery cannot win twice: the conditional update returns the row only for the
 * worker that actually moved it. The job then records a LEASE — never a
 * permanent boolean lock — so a dead worker's job is recoverable.
 */
export async function claimJob({ sb, jobs, job, now = new Date().toISOString() }: any) {
  let claimRes: any = null;
  try {
    claimRes = await sb
      .from('document_analysis')
      .update({ status: 'processing', analysis_status: 'processing', updated_at: now })
      .eq('id', job.analysis_id)
      .in('status', CLAIMABLE_ANALYSIS_STATES)
      .select('id');
  } catch (err: any) {
    claimRes = { data: null, error: { message: String(err?.message || err), code: err?.code ?? null } };
  }

  // A claim that FAILED TO RUN is not a claim that was LOST. Collapsing the two
  // would let a broken client look like healthy competition and strand the job on
  // a truthful-looking 'already_claimed' forever.
  // The claim's own outcome, named exactly as the reviewed contract names it: the
  // error, and the rows the conditional update returned. A claim that FAILED TO RUN
  // is not a claim that was LOST — collapsing the two would let a broken client look
  // like healthy competition and strand the job on a truthful-looking
  // 'already_claimed' forever.
  const claimError = claimRes?.error || null;
  const data = claimRes?.data ?? null;

  if (claimError) {
    return {
      ok: false,
      reason: 'claim_query_error',
      attempt_count: job.attempt_count || 0,
      error: { message: String(claimError.message || claimError), code: claimError.code ?? null },
    };
  }

  const won = Array.isArray(data) && data.length === 1;
  if (!won) return { ok: false, reason: 'analysis_already_claimed', attempt_count: job.attempt_count || 0 };

  const attempt = (job.attempt_count || 0) + 1;
  const lease_expires_at = new Date(Date.parse(now) + LEASE_MS).toISOString();
  await jobs.update(job.id, {
    status: JOB_STATES.PROCESSING,
    attempt_count: attempt,
    claimed_at: now,
    last_attempt_at: now,
    lease_expires_at,
    next_retry_at: null,
  });
  return { ok: true, attempt_count: attempt, claimed_at: now, lease_expires_at };
}

async function recordFailure({ jobs, sb, job, analysis, now, attempt, stage, err, canonicalOnExhaustion }: any) {
  const failure = classifyFailure(err);
  const exhausted = failure.error_class === 'permanent' || attempt >= MAX_ATTEMPTS;

  if (!exhausted) {
    const next_retry_at = new Date(Date.parse(now) + backoffFor(attempt)).toISOString();
    await jobs.update(job.id, {
      status: JOB_STATES.WAITING_RETRY,
      last_attempt_at: now,
      last_error_class: failure.error_class,
      last_error_message: `${stage}: ${failure.message}`.slice(0, 500),
      next_retry_at,
      lease_expires_at: null,
    });
    return { ok: true, decision: 'retry', stage, attempt_count: attempt, error_class: failure.error_class, next_retry_at };
  }

  // Terminal. The CANONICAL surface states the user-facing truth; the ledger
  // records only why orchestration stopped.
  await sb
    .from('document_analysis')
    .update({ analysis_status: canonicalOnExhaustion, status: canonicalOnExhaustion, updated_at: now })
    .eq('id', analysis.id);

  await jobs.update(job.id, {
    status: JOB_STATES.FAILED,
    last_attempt_at: now,
    last_error_class: failure.error_class === 'permanent'
      ? (failure.error_code && failure.error_code !== 'permanent' ? failure.error_code : 'permanent')
      : 'transient_exhausted',
    last_error_message: `${stage}: ${failure.message}`.slice(0, 500),
    next_retry_at: null,
    lease_expires_at: null,
  });
  return { ok: true, decision: 'failed', stage, attempt_count: attempt, error_class: failure.error_class };
}

async function terminalFailure({ jobs, job, now, error_class, message }: any) {
  await jobs.update(job.id, {
    status: JOB_STATES.FAILED,
    last_attempt_at: now,
    last_error_class: error_class,
    last_error_message: String(message).slice(0, 500),
    next_retry_at: null,
    lease_expires_at: null,
  });
  return { ok: false, decision: 'failed', stage: 'validation', error_class };
}

/**
 * The canonical surface of a run that could not finish. 'needs_classification' is
 * the existing vocabulary's "nothing has determined what this document is yet" —
 * which is exactly true here — and the resolver renders it as processing that did
 * not finish, never as a verdict about the document's type. Best-effort by design:
 * when the canonical row cannot be reached, the ledger is still the truth.
 */
async function markCanonicalUnresolved({ sb, job, now }: any) {
  if (!sb || typeof sb.from !== 'function' || !job?.analysis_id) return false;
  try {
    const { error } = await sb
      .from('document_analysis')
      .update({ analysis_status: 'needs_classification', status: 'needs_classification', updated_at: now })
      .eq('id', job.analysis_id);
    return !error;
  } catch {
    return false;
  }
}

/**
 * PRE-CLAIM FAILURE. The canonical rows could not be resolved, so nothing was
 * claimed on this pass.
 *
 *   transient      → waiting_retry + next_retry_at: the durable retry system owns
 *                    it, and the attempt IS counted because a real attempt was made
 *   configuration  → terminal — and it NEVER masquerades as a missing document
 *
 * ATTEMPT INVARIANT (documented here, asserted by the 6D.0b.2.1 harness):
 *   `status === 'failed' && attempt_count === 0` means ONLY that no processing
 *   attempt was ever claimed. `last_error_class` is then exactly one of
 *   configuration_error | source_missing | relationship_mismatch, and `claimed_at`
 *   is null. Every failure classed TRANSIENT is retried before it can be terminal.
 */
async function preClaimFailure({ jobs, sb, job, now, stage, err }: any) {
  const failure = classifyFailure(err);
  const attempt = (job.attempt_count || 0) + 1;
  const message = `${stage}: ${failure.message}`.slice(0, 500);

  if (failure.error_class === 'permanent') {
    await jobs.update(job.id, {
      status: JOB_STATES.FAILED,
      last_attempt_at: now,
      last_error_class: failure.error_code || 'permanent',
      last_error_message: message,
      next_retry_at: null,
      lease_expires_at: null,
    });
    return { ok: false, decision: 'failed', stage, attempt_count: job.attempt_count || 0, error_class: failure.error_class, provider_calls: 0 };
  }

  if (attempt >= MAX_ATTEMPTS) {
    // The retry budget is spent and the canonical row could still not be read. The
    // canonical surface states that processing could not be finished, so the owner
    // is never shown a document that looks like it is still being understood.
    await markCanonicalUnresolved({ sb, job, now });
    await jobs.update(job.id, {
      status: JOB_STATES.FAILED,
      last_attempt_at: now,
      attempt_count: attempt,
      last_error_class: 'transient_exhausted',
      last_error_message: message,
      next_retry_at: null,
      lease_expires_at: null,
    });
    return { ok: true, decision: 'failed', stage, attempt_count: attempt, error_class: failure.error_class, provider_calls: 0 };
  }

  const next_retry_at = new Date(Date.parse(now) + backoffFor(attempt)).toISOString();
  await jobs.update(job.id, {
    status: JOB_STATES.WAITING_RETRY,
    last_attempt_at: now,
    attempt_count: attempt,
    last_error_class: failure.error_class,
    last_error_message: message,
    next_retry_at,
    lease_expires_at: null,
  });
  return { ok: true, decision: 'retry', stage, attempt_count: attempt, error_class: failure.error_class, next_retry_at, provider_calls: 0 };
}

/**
 * THE ONE DELIBERATE TRANSITION INTO EXTRACTION (6D.0c §1).
 *
 * The claim wrote `processing` as its lease witness. That state is canonical and
 * stays exactly as it is; it is deliberately NOT added to the extraction gate's
 * allowlist, because widening a gate in several places is how a state machine
 * stops being knowable. Instead this single, named transition places the row in
 * the state the reader accepts — and it exists in ONE place, asserted by Q62.
 */
export async function handOffToExtraction({ sb, analysisId, now }: any) {
  if (!sb || typeof sb.from !== 'function' || !analysisId) {
    return { ok: false, error: { message: 'canonical client or analysis id unavailable', code: null } };
  }
  try {
    const { error } = await sb
      .from('document_analysis')
      .update({ analysis_status: EXTRACTION_HANDOFF_STATE, status: EXTRACTION_HANDOFF_STATE, updated_at: now })
      .eq('id', analysisId);
    if (error) return { ok: false, error: { message: String(error.message || error), code: error.code ?? null } };
    return { ok: true, state: EXTRACTION_HANDOFF_STATE };
  } catch (err: any) {
    return { ok: false, error: { message: String(err?.message || err), code: err?.code ?? null } };
  }
}

/**
 * RE-ARM A RETRYABLE FAILURE (6D.0c §2).
 *
 * A retryable extraction failure leaves the row in a state the claim cannot take
 * over (`failed` is deliberately not claimable). Without this transition the next
 * attempt would find nothing to claim and the job would strand — so the row is
 * placed in the one state that means "a bounded retry is owed", which the claim
 * DOES accept. The attempt that failed is not erased: extraction recorded it in
 * `_retry_info` on the canonical row, and the ledger keeps its own count.
 */
export async function markAnalysisWaitingRetry({ sb, analysisId, now }: any) {
  if (!sb || typeof sb.from !== 'function' || !analysisId) return { ok: false };
  try {
    const { error } = await sb
      .from('document_analysis')
      .update({ analysis_status: RETRY_REARM_STATE, status: RETRY_REARM_STATE, updated_at: now })
      .eq('id', analysisId);
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}

/**
 * THE COMPLETION INVARIANT (6D.0c §3).
 *
 * A job may reach completed/extraction ONLY when persistence is PROVEN from the
 * canonical row — never from the return value alone. The proof is deliberately not
 * "field_count > 0": a reader that legitimately recognizes nothing still ran, and
 * the engine's own class distinguishes that (an attempt record exists) from a run
 * that never executed (no attempt record at all).
 */
export async function proveExtractionPersisted({ sb, analysisId, expectation }: any) {
  const read = await readCanonicalRow(sb, 'document_analysis', 'id, status, analysis_status, extracted_data', analysisId);
  if (!read.ok) return { ok: false, reason: 'proof_read_failed', error: read.error };
  if (read.outcome !== READ_OUTCOMES.FOUND || !read.row) return { ok: false, reason: 'analysis_row_missing' };

  const final = read.row.analysis_status || read.row.status || null;
  const expected = expectation?.finalStatus || null;
  if (!['completed', 'needs_review'].includes(final)) {
    return { ok: false, reason: 'analysis_not_in_post_extraction_state', final };
  }
  if (expected && final !== expected) {
    return { ok: false, reason: 'analysis_final_mismatch', final, expected };
  }

  // The run's own persistence record. `completed_at` and `reconcile` are written
  // together by the success path only — so their absence means the persistence
  // this completion would be claiming did not happen.
  const data = (read.row.extracted_data && typeof read.row.extracted_data === 'object') ? read.row.extracted_data : {};
  if (data.completed_at == null) return { ok: false, reason: 'persistence_marker_absent' };
  if (data.reconcile == null) return { ok: false, reason: 'persistence_reconcile_absent' };

  return { ok: true, final, fields: data.extracted_fields_count ?? null, reconcile: data.reconcile };
}

/**
 * THE WORKER.
 *
 * 1 load job · 2 resolve identifiers · 3 load canonical document + analysis ·
 * 4 derive business/scope server-side · 5 validate the job↔document relationship ·
 * 6 conditionally claim · 7 inspect canonical state · 8 exit if already settled ·
 * 9 existing understanding · 10 existing extraction · 11 persist canonical
 * results · 12 update orchestration state · 13 return a structured outcome.
 */
export async function processJob({ sb, base44, jobId, now = new Date().toISOString() }: any) {
  const jobs = base44?.asServiceRole?.entities?.[JOB_ENTITY];
  if (!jobs || !jobId) return { ok: false, decision: 'no_ledger', provider_calls: 0 };

  const job = await jobs.get(jobId).catch(() => null);
  if (!job) return { ok: false, decision: 'no_job', provider_calls: 0 };

  const gate = isJobClaimable(job, now);
  if (!gate.claimable) {
    const decision =
      gate.reason === 'completed' ? 'already_completed'
        : gate.reason === 'leased' ? 'already_leased'
        : 'terminal';
    return { ok: true, decision, reason: gate.reason, stage: 'gate', attempt_count: job.attempt_count || 0, provider_calls: 0 };
  }

  // CANONICAL records are the only source of document/business/scope truth.
  // A read that FAILED is not a row that is MISSING: the two are separated here, and
  // only a read that SUCCEEDED and found nothing may become source_missing.
  const documentRead = await readCanonicalRow(sb, 'documents', DOCUMENT_COLUMNS, job.document_id);
  if (!documentRead.ok) {
    return preClaimFailure({ jobs, sb, job, now, stage: 'source_read_documents', err: documentRead.error });
  }

  const analysisRead = await readCanonicalRow(sb, 'document_analysis', ANALYSIS_COLUMNS, job.analysis_id);
  if (!analysisRead.ok) {
    return preClaimFailure({ jobs, sb, job, now, stage: 'source_read_analysis', err: analysisRead.error });
  }

  const document = documentRead.row;
  const analysis = analysisRead.row;

  if (documentRead.outcome === READ_OUTCOMES.NOT_FOUND || !document) {
    // The read SUCCEEDED. The canonical document genuinely does not exist.
    return terminalFailure({ jobs, job, now, error_class: 'source_missing', message: 'canonical documents read succeeded; no document row exists for this job' });
  }
  if (!analysis || analysis.document_id !== document.id || job.document_id !== document.id) {
    return terminalFailure({ jobs, job, now, error_class: 'relationship_mismatch', message: 'job does not match a canonical document/analysis pair' });
  }
  if (SETTLED_ANALYSIS_STATES.includes(analysis.status) || SETTLED_ANALYSIS_STATES.includes(analysis.analysis_status)) {
    await jobs.update(job.id, {
      status: JOB_STATES.COMPLETED,
      last_error_class: null,
      last_error_message: 'canonical analysis already settled',
      next_retry_at: null,
      lease_expires_at: null,
    });
    return { ok: true, decision: 'already_completed', stage: 'canonical_state', provider_calls: 0 };
  }

  const claimed = await claimJob({ sb, jobs, job, now });
  if (!claimed.ok && claimed.reason === 'claim_query_error') {
    // The canonical claim itself could not be written. That is an infrastructure
    // failure like any other canonical access failure — classified, not guessed at.
    return recordFailure({
      jobs, sb, job, analysis, now,
      attempt: (job.attempt_count || 0) + 1,
      stage: 'claim',
      err: claimed.error,
      canonicalOnExhaustion: 'needs_classification',
    });
  }
  if (!claimed.ok) {
    return { ok: true, decision: 'already_claimed', reason: claimed.reason, stage: 'claim', attempt_count: claimed.attempt_count, provider_calls: 0 };
  }

  const attempt = claimed.attempt_count;
  // Derived server-side from the canonical row. Never from the caller, never
  // from the job ledger.
  const profileId = document.profile_id || null;
  const businessId = document.business_id || null;

  // CONTENT ACCESS — a source that cannot be READ is not a source that is ABSENT.
  // A storage/signing failure is transient (durable retry); a row that genuinely
  // carries no storage coordinates is the only source_missing this can produce.
  const access = await resolveContentAccess(sb, document);
  if (access.source_state === 'absent') {
    return terminalFailure({ jobs, job, now, error_class: 'source_missing', message: 'canonical document row carries no storage coordinates' });
  }
  if (access.source_state === 'access_unavailable') {
    return recordFailure({ jobs, sb, job, analysis, now, attempt, stage: 'content_access', err: access.error, canonicalOnExhaustion: 'needs_classification' });
  }

  let ingestion = null;
  try {
    ingestion = await runIngestionUnderstanding({
      sb,
      base44,
      document,
      documentId: document.id,
      documentName: document.name,
      fileName: document.name,
      mimeType: null,
      signedUrl: access.signedUrl,
      base64: access.base64,
      declaredType: document.document_type,
      profileId,
      businessId,
      // 6D.0c.3 — there is NO human classification gate on this path. A scope
      // mismatch or an active business never requires a decision before extraction;
      // what the document may contribute to the BUSINESS is decided afterwards, field
      // by field, by evidence eligibility (evidenceEligibility.ts).
      currentDocument: document,
    });
  } catch (understandErr) {
    return recordFailure({ jobs, sb, job, analysis, now, attempt, stage: 'classification', err: understandErr, canonicalOnExhaustion: 'needs_classification' });
  }

  // A READ THAT COULD NOT HAPPEN IS NOT A DECISION. The understanding layer reports
  // it honestly on the canonical row; orchestration answers "is more work owed?"
  // with YES — infrastructure availability is the durable retry system's business,
  // and it must never be mistaken for a classification verdict.
  const unresolvedReason = ingestion?.result?.unresolved_reason || null;
  if (ingestion && UNRESOLVED_INFRASTRUCTURE_REASONS.includes(unresolvedReason)) {
    return recordFailure({
      jobs, sb, job, analysis, now, attempt,
      stage: 'classification',
      err: { name: 'content_read_unavailable', message: `content read unavailable: ${unresolvedReason}` },
      canonicalOnExhaustion: 'needs_classification',
    });
  }

  // Classification that ran and did not resolve is NOT an unsupported type: the
  // canonical resolver already states "Needs classification". Nothing more is
  // owed, so the job is complete rather than failed.
  if (!ingestion || ingestion.route_extraction !== true) {
    await jobs.update(job.id, {
      status: JOB_STATES.COMPLETED,
      last_attempt_at: now,
      last_error_class: null,
      last_error_message: 'classification applied without extraction routing',
      next_retry_at: null,
      lease_expires_at: null,
    });
    return { ok: true, decision: 'completed', stage: 'classification', attempt_count: attempt, route_extraction: false, provider_calls: 1 };
  }

  // ── 11. THE ONE DELIBERATE TRANSITION INTO EXTRACTION ────────────────────
  // The claim wrote `processing` as its lease witness. That state is canonical
  // and stays; it is NOT added to the reader's gate, because widening a gate in
  // several places is how a state machine stops being knowable. This handoff is
  // the single place the row is placed in the state the reader accepts.
  const handoff = await handOffToExtraction({ sb, analysisId: analysis.id, now });
  if (!handoff.ok) {
    return recordFailure({
      jobs, sb, job, analysis, now, attempt,
      stage: 'extraction_handoff',
      err: handoff.error,
      canonicalOnExhaustion: 'needs_classification',
    });
  }

  let extraction: any = null;
  try {
    extraction = await runExtraction(
      sb,
      {
        documentAnalysisId: analysis.id,
        documentId: document.id,
        documentType: document.document_type,
        profileId,
        businessId,
        year: document.year || null,
      },
      { base44 },
    );
  } catch (extractErr) {
    // The reader threw. Nothing about that is a completed extraction.
    await markAnalysisWaitingRetry({ sb, analysisId: analysis.id, now });
    return recordFailure({ jobs, sb, job, analysis, now, attempt, stage: 'extraction', err: extractErr, canonicalOnExhaustion: 'failed' });
  }

  // ── 12. THE COMPLETION INVARIANT ─────────────────────────────────────────
  // A refusal is NEVER completion. The outcome is typed by the extraction engine
  // and honoured here — recording `success:false` as work that succeeded is
  // precisely how the routed P&L specimen was lost.
  const outcome = classifyExtractionOutcome(extraction);

  if (outcome === 'retryable_failure') {
    await markAnalysisWaitingRetry({ sb, analysisId: analysis.id, now });
    return recordFailure({
      jobs, sb, job, analysis, now, attempt,
      stage: 'extraction',
      err: { name: 'extraction_retryable', message: extraction?.error || 'extraction reported a retryable failure' },
      canonicalOnExhaustion: 'failed',
    });
  }

  if (outcome === 'permanent_failure') {
    // Terminal and truthful: the canonical row already states why, and the ledger
    // records the class so no surface has to infer it.
    const errorClass = extraction?.errorClass || 'permanent';
    await sb
      .from('document_analysis')
      .update({ analysis_status: 'failed', status: 'failed', updated_at: now })
      .eq('id', analysis.id);
    await jobs.update(job.id, {
      status: JOB_STATES.FAILED,
      last_attempt_at: now,
      last_error_class: errorClass,
      last_error_message: `extraction: ${String(extraction?.error || 'extraction failed')}`.slice(0, 500),
      next_retry_at: null,
      lease_expires_at: null,
    });
    return { ok: true, decision: 'failed', stage: 'extraction', attempt_count: attempt, outcome, error_class: errorClass, provider_calls: 1 };
  }

  // SUCCESS may only become completion with persistence PROVEN from the canonical
  // row — never from the return value alone.
  const proof = await proveExtractionPersisted({ sb, analysisId: analysis.id, expectation: extraction });
  if (!proof.ok) {
    await markAnalysisWaitingRetry({ sb, analysisId: analysis.id, now });
    return recordFailure({
      jobs, sb, job, analysis, now, attempt,
      stage: 'extraction_persistence_proof',
      err: { name: 'extraction_persistence_unproven', message: `extraction reported success but persistence was not proven: ${proof.reason}` },
      canonicalOnExhaustion: 'failed',
    });
  }

  await jobs.update(job.id, {
    status: JOB_STATES.COMPLETED,
    last_attempt_at: now,
    last_error_class: null,
    last_error_message: null,
    next_retry_at: null,
    lease_expires_at: null,
  });
  return {
    ok: true,
    decision: 'completed',
    stage: 'extraction',
    attempt_count: attempt,
    outcome: 'success',
    final_status: proof.final,
    extracted_fields: proof.fields,
    provider_calls: 1,
  };
}

/**
 * RECOVERY SCOPE. Only genuinely stranded work: a job whose trigger was missed
 * (queued), a worker that died (processing with an expired lease), or a due
 * retry. Completed jobs and terminal failures are never returned, and a live
 * lease is never stolen.
 */
export async function findDueJobs({ base44, now = new Date().toISOString(), limit = 25 }: any) {
  const jobs = base44?.asServiceRole?.entities?.[JOB_ENTITY];
  if (!jobs) return [];
  const page = await jobs.filter(
    { status: { $in: [JOB_STATES.QUEUED, JOB_STATES.PROCESSING, JOB_STATES.WAITING_RETRY] } },
    { limit },
  );
  const rows = Array.isArray(page) ? page : page?.items || [];
  return rows.filter((j: any) => isJobClaimable(j, now).claimable);
}

/** Recovery sweep — the SAME worker, one job at a time, idempotently. */
export async function sweepJobs({ sb, base44, now = new Date().toISOString(), limit = 25 }: any) {
  const due = await findDueJobs({ base44, now, limit });
  const outcomes = [];
  for (const job of due) {
    const outcome = await processJob({ sb, base44, jobId: job.id, now });
    outcomes.push({ job_id: job.id, decision: outcome.decision, stage: outcome.stage });
  }
  return { inspected: due.length, outcomes };
}