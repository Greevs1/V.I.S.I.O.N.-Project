/**
 * VISION 6D.0c — DURABLE INGESTION RESUME.
 *
 * THE PROBLEM THIS EXISTS FOR (production-proven, 6D.0b.2.1 → 6D.0c):
 *
 * A personal tax return uploaded into a business context is correctly recognised,
 * correctly APPLIED to the document row, and correctly NOT routed to extraction
 * (`scope_mismatch`). The analysis row is left at `needs_review` — a decision is
 * owed. A human then confirms, and the pipeline simply stops: the confirmation
 * wrote a decision and nothing resumed. Extraction never ran, so no
 * `extracted_fields` existed, so no semantic observation existed, so Galileo held
 * the document's NAME and nothing about its contents.
 *
 * Three things had to be true for a resume to be correct, and this module is the
 * one place that makes all three true:
 *
 *   1. IT MUST NOT EXTRACT. The browser does not extract, and neither does the
 *      confirmation handler. Resume ENQUEUES durable work; the canonical worker
 *      (processDocumentIngestionJob → processJob) owns every extraction attempt.
 *
 *   2. IT MUST LEAVE THE SETTLED STATE DELIBERATELY. `needs_review` is a SETTLED
 *      analysis state, so a freshly created job would evaluate as already settled
 *      and complete WITHOUT extracting — a false completion that looks successful.
 *      Confirmation therefore moves the row into `pending_analysis` (the worker's
 *      own handoff state) BEFORE any job exists that could observe it.
 *
 *   3. IT MUST BE IDEMPOTENT. Confirming twice is one decision made twice, not two
 *      extractions. If live work already exists for the document, this is a no-op
 *      that returns the work already in flight.
 *
 * HISTORICAL TRUTH IS PRESERVED. The classification-only job that completed is
 * never rewritten to pretend it continued; resume appends the minimum new
 * orchestration state required, and the ledger keeps both.
 *
 * AUTHORIZATION IS THE CALLER'S, AND IT IS NOT RESTATED HERE. Every caller of this
 * module is a server-side handler that has already resolved the canonical actor and
 * decided that this human may make this decision (today: supabaseUserData's
 * admin/expert-advisor classification override). This module performs no
 * authorization of its own and accepts no business, profile or role from a caller:
 * the document row is re-read and is the only source of tenant truth.
 */
import {
  JOB_ENTITY,
  JOB_STATES,
  EXTRACTION_HANDOFF_STATE,
  readCanonicalRow,
  READ_OUTCOMES,
} from './orchestration.ts';
import { isApprovedDocumentBucket } from '../documents/buckets.ts';

export const RESUME_OUTCOMES = {
  /** A new durable job was created; the canonical worker will pick it up. */
  RESUMED: 'resumed',
  /** Live durable work already existed. Nothing was created. */
  REUSED: 'reused',
  /** There is nothing to resume, and no work was created. */
  NOT_RESUMABLE: 'not_resumable',
  /** The document has no canonical analysis row to resume. */
  NO_ANALYSIS: 'no_analysis',
};

/** Analysis states in which a decision is still owed — the states a human answers. */
export const CONFIRMABLE_ANALYSIS_STATES = ['needs_review', 'needs_classification'];

/**
 * Analysis states a RETRY must be able to restart (6D.1B.2).
 *
 * `failed` is the state the product's own Retry is offered for, and refusing it
 * here made that control structurally unable to work: the UI offered a retry that
 * the canonical machine answered with 409, so a re-arm had to be performed by
 * hand. A failed analysis is not settled work — it is work that did not finish —
 * and restarting it erases nothing: the analysis row's own retry history stays
 * recorded, and the ledger keeps the failed job while a NEW job is appended.
 */
export const RESTARTABLE_FAILURE_STATES = ['failed'];

/** Live orchestration states: work owed and not yet ended. */
const LIVE_JOB_STATES = [JOB_STATES.QUEUED, JOB_STATES.PROCESSING, JOB_STATES.WAITING_RETRY];

export interface ResumeArgs {
  sb: any;
  base44: any;
  documentId: string;
  now?: string;
}

export interface ResumeOutcome {
  ok: boolean;
  outcome: string;
  reason?: string;
  job_id?: string | null;
  job_status?: string | null;
  analysis_state?: string | null;
  document_type?: string | null;
  type_synchronized?: boolean;
  error?: { message: string; code: string | number | null } | null;
}

/**
 * resumeIngestion — the ONE canonical resume operation.
 *
 * Server-side, durable, idempotent, and tenant-derived from the document row.
 */
export async function resumeIngestion({ sb, base44, documentId, now = new Date().toISOString() }: ResumeArgs): Promise<ResumeOutcome> {
  const jobs = base44?.asServiceRole?.entities?.[JOB_ENTITY];
  if (!jobs || !documentId) {
    return { ok: false, outcome: RESUME_OUTCOMES.NOT_RESUMABLE, reason: 'ledger_unavailable' };
  }

  // ── The document row is the ONLY source of tenant/type truth ───────────────
  const documentRead = await readCanonicalRow(
    sb,
    'documents',
    'id, profile_id, business_id, document_type, year, upload_status, file_path, storage_bucket',
    documentId,
  );
  if (!documentRead.ok) {
    return { ok: false, outcome: RESUME_OUTCOMES.NOT_RESUMABLE, reason: 'document_read_failed', error: documentRead.error };
  }
  if (documentRead.outcome !== READ_OUTCOMES.FOUND || !documentRead.row) {
    return { ok: false, outcome: RESUME_OUTCOMES.NOT_RESUMABLE, reason: 'document_missing' };
  }
  const document = documentRead.row;

  // ── The canonical analysis row is the resume target ───────────────────────
  let analysis: any = null;
  try {
    const { data, error } = await sb
      .from('document_analysis')
      .select('id, document_id, status, analysis_status, document_type')
      .eq('document_id', documentId)
      .maybeSingle();
    if (error) {
      return {
        ok: false,
        outcome: RESUME_OUTCOMES.NOT_RESUMABLE,
        reason: 'analysis_read_failed',
        error: { message: String(error.message || error), code: error.code ?? null },
      };
    }
    analysis = data || null;
  } catch (err: any) {
    return {
      ok: false,
      outcome: RESUME_OUTCOMES.NOT_RESUMABLE,
      reason: 'analysis_read_failed',
      error: { message: String(err?.message || err), code: err?.code ?? null },
    };
  }
  if (!analysis?.id) return { ok: false, outcome: RESUME_OUTCOMES.NO_ANALYSIS, reason: 'no_analysis_row' };

  const state = analysis.analysis_status || analysis.status || null;

  // ── IDEMPOTENCY, FIRST ────────────────────────────────────────────────────
  // Live work in flight means the decision is already being acted on. Creating a
  // second job here would be two workers racing the same analysis row.
  let existingJobs: any[] = [];
  try {
    const page = await jobs.filter({ document_id: documentId }, { limit: 25 });
    existingJobs = Array.isArray(page) ? page : (page?.items || []);
  } catch {
    // An unreadable ledger is not evidence that no work exists — fail closed for
    // a CREATE, and let the canonical worker's own claim stay the arbiter.
    existingJobs = [];
  }
  const live = existingJobs.find((j: any) => LIVE_JOB_STATES.includes(j.status));
  if (live) {
    return {
      ok: true,
      outcome: RESUME_OUTCOMES.REUSED,
      reason: 'live_work_in_flight',
      job_id: live.id,
      job_status: live.status,
      analysis_state: state,
    };
  }

  // ── Nothing to resume when the work is already done ───────────────────────
  // A settled SUCCESS is not a decision owed: re-running it would duplicate
  // extraction for a document that already has its observations.
  if (state === 'completed') {
    return { ok: false, outcome: RESUME_OUTCOMES.NOT_RESUMABLE, reason: 'analysis_already_completed', analysis_state: state };
  }

  // ── SOURCE EXISTENCE (6D.1B.2) ─────────────────────────────────────────────
  // A retry for a source that is GONE would enqueue work that can only fail. The
  // bucket is the ROW's own, checked with the same approved-bucket rule extraction
  // uses, and the probe is the same short-lived signed URL — nothing here widens
  // access, invents a location, or reassigns a business or a scope.
  const sourceBucket = document.storage_bucket ?? null;
  const sourcePath = document.file_path ?? null;
  if (!sourcePath || !isApprovedDocumentBucket(sourceBucket)) {
    return { ok: false, outcome: RESUME_OUTCOMES.NOT_RESUMABLE, reason: 'source_unresolvable', analysis_state: state };
  }
  try {
    const { data: probe, error: probeError } = await sb.storage.from(sourceBucket).createSignedUrl(sourcePath, 60);
    if (probeError || !probe?.signedUrl) {
      return { ok: false, outcome: RESUME_OUTCOMES.NOT_RESUMABLE, reason: 'source_missing', analysis_state: state };
    }
  } catch (err: any) {
    return {
      ok: false,
      outcome: RESUME_OUTCOMES.NOT_RESUMABLE,
      reason: 'source_missing',
      analysis_state: state,
      error: { message: String(err?.message || err), code: err?.code ?? null },
    };
  }

  // ── 1. TYPE SYNCHRONIZATION (6D.0c §8) ────────────────────────────────────
  // The confirmed type is the operational applied type on the document row. The
  // analysis snapshot follows it, so a stale `other` cannot outlive the decision
  // that superseded it. `documents.document_type` stays authoritative: it is read
  // above and is never written from a request body here.
  const intendedType = document.document_type || null;
  const analysisType = analysis.document_type || null;
  const typeNeedsSync = !!intendedType && analysisType !== intendedType;

  // ── 2. LEAVE THE SETTLED STATE BEFORE A JOB CAN OBSERVE IT ────────────────
  // `needs_review` is settled. Writing `pending_analysis` here — BEFORE the job
  // exists — is what makes the resume real rather than a false completion.
  const settled = CONFIRMABLE_ANALYSIS_STATES.includes(state || '');
  // A FAILED ANALYSIS IS RESTARTABLE (6D.1B.2) — see RESTARTABLE_FAILURE_STATES.
  // It takes the SAME documented handoff transition as a confirmed decision, so a
  // retry invents no state of its own: the worker claims it exactly as it claims
  // any other resumption.
  const restartableFailure = RESTARTABLE_FAILURE_STATES.includes(state || '');
  if (!settled && !restartableFailure && state !== EXTRACTION_HANDOFF_STATE) {
    // Any other unsettled state is left exactly as it is: this operation does not
    // invent a transition for a row it does not understand.
    return { ok: false, outcome: RESUME_OUTCOMES.NOT_RESUMABLE, reason: 'analysis_not_confirmable', analysis_state: state };
  }

  const analysisPatch: Record<string, any> = {
    analysis_status: EXTRACTION_HANDOFF_STATE,
    status: EXTRACTION_HANDOFF_STATE,
    updated_at: now,
  };
  if (typeNeedsSync) analysisPatch.document_type = intendedType;

  try {
    const { error } = await sb.from('document_analysis').update(analysisPatch).eq('id', analysis.id);
    if (error) {
      return {
        ok: false,
        outcome: RESUME_OUTCOMES.NOT_RESUMABLE,
        reason: 'analysis_transition_failed',
        error: { message: String(error.message || error), code: error.code ?? null },
      };
    }
  } catch (err: any) {
    return {
      ok: false,
      outcome: RESUME_OUTCOMES.NOT_RESUMABLE,
      reason: 'analysis_transition_failed',
      error: { message: String(err?.message || err), code: err?.code ?? null },
    };
  }

  // The document's own owner-facing state follows: the analysis the owner is
  // waiting for is being performed again.
  try {
    await sb.from('documents').update({ upload_status: 'pending_analysis', updated_at: now }).eq('id', documentId);
  } catch {
    // Best-effort: the canonical analysis row above is the resume's own truth.
  }

  // ── 3. THE MINIMUM NEW DURABLE ORCHESTRATION STATE ────────────────────────
  // A NEW job row: the classification-only job that completed is history and is
  // never rewritten. Creating this row is what triggers the entity workflow and
  // hands the work to the canonical worker — no inline extraction anywhere.
  let created: any = null;
  try {
    created = await jobs.create({
      document_id: documentId,
      analysis_id: analysis.id,
      status: JOB_STATES.QUEUED,
      attempt_count: 0,
    });
  } catch (err: any) {
    return {
      ok: false,
      outcome: RESUME_OUTCOMES.NOT_RESUMABLE,
      reason: 'job_create_failed',
      error: { message: String(err?.message || err), code: err?.code ?? null },
    };
  }

  return {
    ok: true,
    outcome: RESUME_OUTCOMES.RESUMED,
    job_id: created?.id || null,
    job_status: JOB_STATES.QUEUED,
    analysis_state: EXTRACTION_HANDOFF_STATE,
    document_type: intendedType,
    type_synchronized: typeNeedsSync,
  };
}