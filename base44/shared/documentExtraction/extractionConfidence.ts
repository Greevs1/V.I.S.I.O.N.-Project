/**
 * Phase 6D.0 — HONEST CONFIDENCE + LEGITIMATE REVIEW RULES
 *
 * The extraction integration returns VALUES. It does not report a per-field
 * confidence, and VISION will not invent one: a number is produced only when the
 * provider actually supplied one, and the absence of confidence is recorded as an
 * explicit `unavailable` state rather than a plausible-looking default.
 *
 * The separation this module exists to keep:
 *
 *   MODEL CONFIDENCE    what the provider reported about its own reading
 *   PARSER CONFIDENCE   whether a stated value could be normalized (currency → number)
 *   REVIEW STATUS       a human's decision about the extracted field
 *   VERIFICATION STATUS a separate, later question (6C business_facts) — never set here
 *
 * High extraction confidence is NOT verification, and `unavailable` confidence is
 * NOT a defect: neither is, by itself, a reason to send a document to review.
 * `needs_review` is reachable only through the real rules named below.
 *
 * Pure module: no I/O, no database, no authorization.
 */

export type ConfidenceState = 'model_reported' | 'unavailable';

export interface FieldConfidence {
  score: number | null;
  state: ConfidenceState;
}

/**
 * resolveFieldConfidence — the ONLY place field confidence is decided.
 *
 * A numeric score is produced only when the provider reported one (as a 0–1
 * ratio, a 0–100 score, or a numeric string). Anything else — absent, malformed,
 * out of range — resolves to null with the state `unavailable`. Nothing is
 * estimated, and no constant is ever substituted.
 */
export function resolveFieldConfidence(raw: any): FieldConfidence {
  let score: number | null = null;

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    score = raw <= 1 ? Math.round(raw * 100) : Math.round(raw);
  } else if (typeof raw === 'string' && raw.trim() !== '' && !isNaN(Number(raw))) {
    const n = Number(raw);
    score = n <= 1 ? Math.round(n * 100) : Math.round(n);
  }

  if (score == null || score < 0 || score > 100) return { score: null, state: 'unavailable' };
  return { score, state: 'model_reported' };
}

/**
 * A provider-reported confidence at or above this is not itself a review reason.
 * Below it, a genuinely low reading is surfaced — which is the only way model
 * confidence may cause review.
 */
export const MODEL_CONFIDENCE_REVIEW_THRESHOLD = 60;

/** Review statuses representing a HUMAN DECISION. Reprocessing must never overwrite these. */
export const REVIEWED_REVIEW_STATUSES = ['accepted', 'corrected', 'rejected', 'needs_clarification'];

/** Documents whose extracted numbers are meaningless without a period. */
export const PERIOD_REQUIRED_TYPES = new Set([
  'profit_and_loss',
  'balance_sheet',
  'business_tax_return',
  'personal_tax_return',
  'payroll_report',
  'debt_schedule',
]);

/**
 * The failure vocabulary recorded at extracted_data._retry_info.last_error_class.
 * Every terminal failure carries one, so an owner-facing state can be derived
 * without ever exposing a raw storage or database error.
 */
export type ExtractionFailureClass =
  | 'unsupported_type'   // classification_unsupported | extraction_unsupported
  | 'no_fields_extracted'
  | 'source_missing'     // the persisted object is gone
  | 'source_unresolvable' // no file_path, or an unapproved/unknown bucket
  | 'transient'          // retryable: timeout, network, rate limit, 5xx
  | 'permanent'          // will not succeed on retry
  | 'configuration';     // the worker itself is misconfigured