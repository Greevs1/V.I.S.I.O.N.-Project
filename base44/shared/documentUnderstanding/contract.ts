/**
 * VISION 6D.0b — THE CLASSIFICATION RESULT CONTRACT (Phase 1) AND ITS
 * CONFIDENCE CALIBRATION (Phase 7).
 *
 * ONE contract, returned by the ONE understanding service. It is deliberately
 * serializable: the full contract is persisted into
 * `document_analysis.extracted_data.classification` (existing jsonb — NO
 * migration), while its LIFECYCLE half lives in the DocumentClassification
 * entity and its APPLIED half in `documents.document_type` / `system_folder`.
 *
 * CONFIDENCE IS COMPUTED FROM EVIDENCE, NEVER COPIED FROM A MODEL'S OWN
 * PERCENTAGE. The calibration below is the documented, tested rule:
 *
 *   EVIDENCE                                             SCORE   BAND
 *   ---------------------------------------------------  -----   ------
 *   Government form NUMBER + official TITLE              95      HIGH
 *   Government form NUMBER alone, or TITLE alone          85      HIGH
 *   Clear statement structure (>= 2 structural markers
 *     under an explicit statement heading)                85      HIGH
 *   Structural markers without an explicit heading        60      MEDIUM
 *   Topic wording only (one weak indicator)               55      MEDIUM
 *   Provider asserted a type with NO supporting content
 *     evidence of its own                                 60      MEDIUM
 *   Contradictory strong evidence                         60      MEDIUM
 *   Family recognized, no canonical type                  45      LOW
 *   No usable evidence / provider unavailable              0      LOW
 *
 * BANDS: >= 80 HIGH, >= 50 MEDIUM, else LOW. HIGH alone auto-routes.
 */

export const CONFIDENCE_HIGH_MIN = 80;
export const CONFIDENCE_MEDIUM_MIN = 50;

export const CONFIDENCE_CALIBRATION: Record<string, number> = {
  form_number_and_title: 95,
  form_number_or_title: 85,
  structural_statement: 85,
  provider_assertion_unconfirmed: 60,
  structural_markers_only: 60,
  contradictory_evidence: 60,
  topic_only: 55,
  family_only: 45,
  none: 0,
};

export type ConfidenceBand = 'high' | 'medium' | 'low';

export function bandFor(score: number | null | undefined): ConfidenceBand {
  const s = typeof score === 'number' && Number.isFinite(score) ? score : 0;
  if (s >= CONFIDENCE_HIGH_MIN) return 'high';
  if (s >= CONFIDENCE_MEDIUM_MIN) return 'medium';
  return 'low';
}

/**
 * The decision lifecycle, in the DocumentClassification entity's own vocabulary
 * (`classification_status`). No new status vocabulary is invented:
 *
 *   auto_filed      HIGH — applied and routed, no admin review required
 *   awaiting_review MEDIUM — applied provisionally, awaiting confirmation
 *   pending         LOW / unrecognized — stored safely, user asked
 *   approved        explicit trustworthy declaration or confirmed correction
 *   overridden      an existing user/admin correction (written elsewhere)
 */
export type DecisionStatus = 'auto_filed' | 'awaiting_review' | 'pending' | 'approved';

export type ClassificationMethod =
  | 'declared_explicit'
  | 'deterministic_content'
  | 'deterministic_metadata'
  | 'provider_semantic'
  | 'provider_semantic_unconfirmed'
  | 'provider_unavailable'
  | 'unresolved';

export interface ClassificationResult {
  // ── identity of the bytes ───────────────────────────────────────────────
  file_format: string;
  mime_type: string | null;

  // ── what it is ──────────────────────────────────────────────────────────
  document_family: string;
  document_type: string;
  document_subtype: string | null;

  // ── when it covers ──────────────────────────────────────────────────────
  tax_year: number | null;
  reporting_period: string | null;
  period_start: string | null;
  period_end: string | null;
  accounting_basis: string | null;

  // ── whose it is (evidence only — never authorization) ───────────────────
  semantic_scope: 'personal' | 'business' | 'ambiguous';
  detected_entity_name: string | null;
  detected_entity_identifier: string | null;
  suggested_business_id: string | null;

  // ── where it belongs / how it is read ───────────────────────────────────
  suggested_folder: string | null;
  reader_key: string | null;
  reader_supported: boolean;

  // ── the decision ────────────────────────────────────────────────────────
  classification_confidence: number;
  confidence_band: ConfidenceBand;
  classification_method: ClassificationMethod;
  classification_evidence: string[];
  /** ONLY about the CLASSIFICATION's own decisiveness. A scope mismatch never sets it. */
  requires_confirmation: boolean;
  /** CONTEXT, never a gate (6D.0c.3 automatic relevant-evidence policy): the document's
   *  own scope is personal while a business is active, and it has NOT been moved. It
   *  drives EVIDENCE ELIGIBILITY field by field; it never blocks extraction, and it
   *  never asks the owner for a decision. */
  scope_mismatch: boolean;

  // ── operational consequences, decided by the service ────────────────────
  applied_document_type: string;
  applied_folder: string | null;
  decision_status: DecisionStatus;
  route_extraction: boolean;
  unresolved_reason: string | null;
  notes: string[];
}

export interface ClassificationInputs {
  fileName: string;
  mimeType: string | null;
  declaredType: string | null;
  businessId: string | null;
  fileFormat: string;
}

/**
 * finalize — fills every contract field so no consumer ever reads `undefined`,
 * and derives the operational consequences from the evidence ONE way:
 *
 *   apply the type   when evidence genuinely named one (HIGH or MEDIUM)
 *   route extraction only on HIGH with a supported reader — SCOPE IS NEVER PART OF
 *                    THIS DECISION. A personal document uploaded while a business is
 *                    active is extracted like any other; what may be used FOR that
 *                    business is an ELIGIBILITY question, answered field by field
 *                    (evidenceEligibility.ts).
 *   confirm          only when the CLASSIFICATION itself is not decisive. A scope
 *                    mismatch asks nobody for anything.
 */
export function finalizeResult(
  partial: Partial<ClassificationResult>,
  inputs: ClassificationInputs
): ClassificationResult {
  const score = typeof partial.classification_confidence === 'number' ? partial.classification_confidence : 0;
  const band = partial.confidence_band || bandFor(score);
  const type = partial.document_type || 'other';
  const named = type !== 'other';
  const readerSupported = !!partial.reader_supported;
  const scopeMismatch = !!partial.scope_mismatch;
  const requiresConfirmation = partial.requires_confirmation !== undefined
    ? partial.requires_confirmation
    : (band !== 'high' || !readerSupported);

  // A recognized type is applied operationally even with no reader: the folder
  // and the identity are truths, only the analysis is unavailable (Phase 12).
  const applyType = named && (band === 'high' || band === 'medium');

  const decisionStatus: DecisionStatus =
    partial.decision_status ||
    (band === 'high' && !requiresConfirmation ? 'auto_filed'
      : band === 'high' ? 'approved'
        : band === 'medium' ? 'awaiting_review'
          : 'pending');

  return {
    file_format: partial.file_format || inputs.fileFormat || 'unknown',
    mime_type: partial.mime_type ?? inputs.mimeType ?? null,
    document_family: partial.document_family || 'other',
    document_type: type,
    document_subtype: partial.document_subtype ?? null,
    tax_year: partial.tax_year ?? null,
    reporting_period: partial.reporting_period ?? null,
    period_start: partial.period_start ?? null,
    period_end: partial.period_end ?? null,
    accounting_basis: partial.accounting_basis ?? null,
    semantic_scope: partial.semantic_scope || 'ambiguous',
    detected_entity_name: partial.detected_entity_name ?? null,
    detected_entity_identifier: partial.detected_entity_identifier ?? null,
    suggested_business_id: partial.suggested_business_id ?? null,
    suggested_folder: partial.suggested_folder ?? null,
    reader_key: partial.reader_key ?? null,
    reader_supported: readerSupported,
    classification_confidence: score,
    confidence_band: band,
    classification_method: partial.classification_method || 'unresolved',
    classification_evidence: partial.classification_evidence || [],
    requires_confirmation: requiresConfirmation,
    scope_mismatch: scopeMismatch,
    applied_document_type: applyType ? type : 'other',
    applied_folder: applyType ? (partial.suggested_folder ?? null) : null,
    decision_status: decisionStatus,
    route_extraction: false, // set explicitly by the service, never inferred here
    unresolved_reason: partial.unresolved_reason ?? null,
    notes: partial.notes || [],
  };
}

/**
 * The compact, serializable half of the contract that is persisted into
 * `document_analysis.extracted_data.classification`. Deliberately explicit:
 * a reader of the row can reconstruct WHY the document was filed where it was.
 */
export function toPersistedContract(result: ClassificationResult): Record<string, any> {
  return {
    file_format: result.file_format,
    mime_type: result.mime_type,
    document_family: result.document_family,
    document_type: result.document_type,
    document_subtype: result.document_subtype,
    tax_year: result.tax_year,
    reporting_period: result.reporting_period,
    period_start: result.period_start,
    period_end: result.period_end,
    accounting_basis: result.accounting_basis,
    semantic_scope: result.semantic_scope,
    // PII MINIMIZATION (6D.0c §11). The two IDENTITY fields are deliberately NOT
    // persisted. On a personal return the provider's "entity identifier" is the
    // taxpayer's SSN/TIN, and a classification never needs it: the type, subtype,
    // year and structural evidence are what identify a Form 1040. The fields stay
    // on the in-memory result contract (nothing downstream reads them from
    // storage), and this function IS the allowlist — what is not named here is
    // never written to `document_analysis.extracted_data.classification`.
    suggested_business_id: result.suggested_business_id,
    suggested_folder: result.suggested_folder,
    reader_key: result.reader_key,
    reader_supported: result.reader_supported,
    classification_confidence: result.classification_confidence,
    confidence_band: result.confidence_band,
    classification_method: result.classification_method,
    classification_evidence: result.classification_evidence,
    requires_confirmation: result.requires_confirmation,
    scope_mismatch: result.scope_mismatch,
    applied_document_type: result.applied_document_type,
    decision_status: result.decision_status,
    route_extraction: result.route_extraction,
    unresolved_reason: result.unresolved_reason,
    decided_at: new Date().toISOString(),
  };
}