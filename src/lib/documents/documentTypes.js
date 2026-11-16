/**
 * VISION document-type vocabulary — the ONE frontend list.
 *
 * The backend owns the truth: `base44/shared/documents/documentTypes.ts`, whose
 * readable set is DERIVED from the extraction engine's schema map. This mirror
 * exists only because the browser cannot import a backend module, and
 * `scripts/documentUploadClassification.test.cjs` fails the moment the two drift
 * — so the interface can never offer a type as analyzable that has no reader, and
 * can never deny one that does.
 *
 * `readable` is what the ENGINE can read today. A type without it is not
 * rejected: it is stored, and analysis follows when a reader exists.
 */

/**
 * The neutral bucket — "no type determined yet". This is the value automatic
 * classification (6D.0b) will replace with the type it determines; until then it
 * is the honest record of an upload whose type was never stated.
 */
export const AUTO_DETECT_DOCUMENT_TYPE = 'other';

export const DOCUMENT_TYPES = [
  { value: 'profit_and_loss',     label: 'Profit & Loss Statement', readable: true },
  { value: 'balance_sheet',       label: 'Balance Sheet',           readable: true },
  { value: 'business_tax_return', label: 'Business Tax Return',     readable: true },
  { value: 'personal_tax_return', label: 'Personal Tax Return',     readable: true },
  { value: 'debt_schedule',       label: 'Debt Schedule',           readable: true },
  { value: 'payroll_report',      label: 'Payroll Report',          readable: true },
  { value: 'insurance_document',  label: 'Insurance Document',      readable: false },
  { value: 'entity_document',     label: 'Entity Document',         readable: false },
  { value: 'buy_sell_agreement',  label: 'Buy-Sell Agreement',      readable: false },
  { value: 'estate_document',     label: 'Estate Document',         readable: false },
  { value: 'other',               label: 'Not sure / other',        readable: false },
];

/** Types VISION can analyze today. */
export const READABLE_DOCUMENT_TYPES = DOCUMENT_TYPES.filter((t) => t.readable).map((t) => t.value);

/** Types the Data Room can store, whether or not a reader exists. */
export const STORABLE_DOCUMENT_TYPES = DOCUMENT_TYPES.map((t) => t.value);

export function isReadableDocumentType(value) {
  return READABLE_DOCUMENT_TYPES.includes(value);
}

export function documentTypeLabel(value) {
  return DOCUMENT_TYPES.find((t) => t.value === value)?.label || value || '—';
}

/** The analysis states a stored document can be in. */
export const ANALYSIS_STATE = {
  ANALYZED: 'analyzed',
  NEEDS_REVIEW: 'needs_review',
  PROCESSING: 'processing',
  PENDING: 'pending',
  // NOTHING has determined what this document is yet. It is a different fact from
  // a recognized type that has no reader, and the two must never be collapsed —
  // that collapse is how a document still being understood came to read
  // "VISION can't analyze this document type yet."
  NEEDS_CLASSIFICATION: 'needs_classification',
  UNSUPPORTED: 'unsupported',
  FAILED: 'failed',
};

/** The words each analysis state is shown with. One vocabulary, one place. */
export const ANALYSIS_LABEL = {
  analyzed: 'Analyzed',
  needs_review: 'Needs confirmation',
  processing: 'Understanding…',
  needs_classification: 'Needs classification',
  unsupported: 'Not supported yet',
  failed: 'Analysis failed',
  pending: 'Not analyzed yet',
};

export function analysisLabel(state) {
  return ANALYSIS_LABEL[state] || ANALYSIS_LABEL.pending;
}

/**
 * A run that has not reached ANY state after this long is not still working: the
 * pipeline that was reading it is gone. Reporting "still understanding" forever
 * would be a false statement about the system, so the row stops claiming it.
 */
export const UNDERSTANDING_STALE_MS = 10 * 60 * 1000;

/**
 * PROCESSING THAT DID NOT FINISH — the ONE honest sentence for it.
 *
 * A run that stopped without a verdict (the worker could not reach the canonical
 * source, or the document's own content could not be read) has said NOTHING about
 * what the document is. It must never be reported as document ambiguity — "VISION
 * could not determine what this document is" describes a classification that RAN
 * and came back unsure, which is a different fact with a different remedy. The
 * 6D.0b.2 production failure is exactly that conflation: an infrastructure read
 * failure was shown to the owner as a judgement about their document.
 *
 * No internal detail (PostgREST, PGRST codes, Supabase, service credentials) ever
 * reaches this string, or any owner-facing surface.
 */
export const PROCESSING_FAILED_NOTE =
  "VISION couldn't finish processing this document. Upload it again to retry.";

/**
 * resolveDocumentStates — separate what happened to the UPLOAD from what happened
 * to the ANALYSIS. They are different facts and must never be conflated:
 *
 *   · a document row exists          → the upload succeeded (a genuine storage
 *     failure never reaches the row insert, so nothing is rendered)
 *   · its type has no reader         → analysis is "not yet supported", which is
 *     not an upload failure and not an analysis failure
 *   · a reader exists but the run
 *     broke                          → analysis failed
 *
 * Returns { upload, analysis, note } — `note` is the one quiet line the row shows.
 * Presentation only: nothing here writes, authorizes or decides anything.
 */
export function resolveDocumentStates(doc = {}) {
  const rawUpload = doc.upload_status || doc.status || 'uploaded';
  const rawAnalysis = doc.analysis_status || null;
  const readable = isReadableDocumentType(doc.document_type);

  // A row can carry upload_status='failed' for two different histories, and only
  // EVIDENCE decides which one it is. Storage evidence is: the row's own
  // storage-state column already says the bytes are in Storage, real storage
  // coordinates, or any analysis record. This is evidence, not an assumption — the
  // uploader writes the document row only AFTER a successful Storage upload
  // (uploadDocumentToSupabase step 8 returns before any insert on a storage error).
  // A row with NONE of that evidence is a genuine upload/pipeline failure and keeps
  // its upload failure meaning — never reinterpreted as a success.
  const storageEvidence = Boolean(
    doc.status === 'uploaded' || doc.status === 'completed'
    || doc.file_path || doc.file_url || doc.storage_bucket
    || doc.analysis_status || doc.analysis_id || doc.document_analysis_id || doc.has_extraction
  );
  // A row with storage evidence is a genuine upload. A row with NO storage
  // evidence at all is a genuine upload failure, and keeps that meaning: the
  // reinterpretation is never blind.
  const upload = rawUpload === 'failed' && storageEvidence ? 'uploaded' : rawUpload;

  // The STATUS column states the STORAGE truth: while the pipeline reads a stored
  // document's content the row IS uploaded, and the analysis column carries the
  // pipeline's own state. One column never stands in for the other.
  const status = storageEvidence && ['pending_analysis', 'queued', 'analyzing'].includes(upload)
    ? 'uploaded'
    : upload;

  const inFlight = ['pending_analysis', 'queued', 'analyzing'].includes(rawUpload)
    || ['pending_analysis', 'queued', 'analyzing'].includes(rawAnalysis);
  const createdMs = doc.created_at ? new Date(doc.created_at).getTime() : null;
  const stale = createdMs !== null && Number.isFinite(createdMs)
    && (Date.now() - createdMs) > UNDERSTANDING_STALE_MS;
  const classified = !!doc.document_type && doc.document_type !== 'other';

  // ── 1. NOTHING HAS DECIDED WHAT THIS IS YET ────────────────────────────────
  // The pipeline reads the document's own content, so "no type yet" is a state
  // IN PROGRESS while it runs — and an honest unresolved state once it has
  // stopped. Neither is a verdict about the document TYPE.
  if (!classified) {
    if (rawAnalysis === ANALYSIS_STATE.FAILED) {
      return { upload: status, analysis: ANALYSIS_STATE.FAILED, note: 'Analysis failed. Retry or review.' };
    }
    if (rawAnalysis === ANALYSIS_STATE.NEEDS_REVIEW) {
      return { upload: status, analysis: ANALYSIS_STATE.NEEDS_REVIEW, note: 'Needs your confirmation before analysis.' };
    }
    if (inFlight) {
      return stale
        ? { upload: status, analysis: ANALYSIS_STATE.NEEDS_CLASSIFICATION, note: PROCESSING_FAILED_NOTE }
        : { upload: status, analysis: ANALYSIS_STATE.PROCESSING, note: 'Understanding document…' };
    }
    // A run that STOPPED without any verdict: the canonical state says nothing has
    // determined what this document is, and the worker recorded that it could not
    // finish. That is processing which FAILED — never a judgement about the
    // document's type — and it keeps its own honest sentence.
    if (rawAnalysis === ANALYSIS_STATE.NEEDS_CLASSIFICATION) {
      return { upload: status, analysis: ANALYSIS_STATE.NEEDS_CLASSIFICATION, note: PROCESSING_FAILED_NOTE };
    }
    // A run that ended without resolving the type: the classification failed.
    if (rawAnalysis === ANALYSIS_STATE.UNSUPPORTED) {
      return {
        upload: status,
        analysis: ANALYSIS_STATE.NEEDS_CLASSIFICATION,
        note: 'VISION could not determine what this document is yet.',
      };
    }
    // Nothing has ever stated an analysis outcome for this row: the stored
    // document simply has no reader for the type it was recorded with.
    return {
      upload: status,
      analysis: ANALYSIS_STATE.UNSUPPORTED,
      note: 'Analysis is not available for this document type yet — it is stored safely.',
    };
  }

  // ── 2. THE TYPE IS KNOWN — the reader decides the rest ─────────────────────
  if (!readable) {
    return {
      upload: status,
      analysis: ANALYSIS_STATE.UNSUPPORTED,
      note: 'Recognized. Analysis is not available for this document type yet — it is stored safely.',
    };
  }

  // The owner decided this document stays personal. That is a DECISION, not a
  // failure and not something still waiting on them.
  if (rawAnalysis === ANALYSIS_STATE.STORED_PERSONAL) {
    return {
      upload: status,
      analysis: ANALYSIS_STATE.STORED_PERSONAL,
      note: 'Kept as a personal document — no figures from it are used as business data.',
    };
  }

  if (rawAnalysis && Object.values(ANALYSIS_STATE).includes(rawAnalysis)) {
    return {
      upload: status,
      analysis: rawAnalysis,
      note: rawAnalysis === ANALYSIS_STATE.FAILED ? 'Analysis failed. Retry or review.' : null,
    };
  }

  if (inFlight) {
    return stale
      ? { upload: status, analysis: ANALYSIS_STATE.NEEDS_CLASSIFICATION, note: PROCESSING_FAILED_NOTE }
      : { upload: status, analysis: ANALYSIS_STATE.PROCESSING, note: 'Analyzing document…' };
  }
  if (rawUpload === 'needs_review') {
    return { upload: status, analysis: ANALYSIS_STATE.NEEDS_REVIEW, note: 'Needs your confirmation before analysis.' };
  }
  if (rawUpload === 'completed') {
    return { upload: status, analysis: ANALYSIS_STATE.ANALYZED, note: null };
  }
  if (rawUpload === 'failed') {
    return { upload: status, analysis: ANALYSIS_STATE.FAILED, note: 'Analysis failed. Retry or review.' };
  }
  return { upload: status, analysis: ANALYSIS_STATE.PENDING, note: 'Not analyzed yet.' };
}