import { isApprovedDocumentBucket } from '../documents/buckets.ts';
// 6D.1B.2 — THE STRUCTURED SPREADSHEET BRIDGE. A workbook VISION can read
// deterministically is never sent to an opaque provider: the ONE certified reader
// (the backend's byte-identical copy of the viewer's) parses it, and its
// structured reading is normalized through the SAME normalizeExtraction below, so
// nothing downstream of this file learns that a second reading path exists.
import { tryStructuredSpreadsheetExtraction } from './spreadsheetBridge.ts';
import {
  resolveReportingPeriod,
  periodMetadata,
  type ResolvedPeriod,
} from './periodIntegrity.ts';
import {
  resolveFieldConfidence,
  REVIEWED_REVIEW_STATUSES,
  PERIOD_REQUIRED_TYPES,
  MODEL_CONFIDENCE_REVIEW_THRESHOLD,
  type ExtractionFailureClass,
} from './extractionConfidence.ts';
import {
  countExtractedFields,
  setDocumentUploadStatus,
  markAnalysis,
} from './analysisState.ts';
// Phase 6D.0c.3 — the TAX DOCUMENT FAMILY: form sections, real page provenance
// (never an invented page 1), subtype-aware reader contracts, and the field
// disposition table that keeps every extracted concept accountable and decides
// which concepts may become business evidence.
import {
  FORM_TYPES,
  resolveFieldSourcePage,
  pageProvenanceFor,
  normalizeFormSections,
  type FormSection,
} from '../documentUnderstanding/taxForms.ts';
import {
  FORM_1040_FIELDS,
  FORM_1120_FIELDS,
  W2_FIELDS,
  K1_FIELDS,
  FORM_1099_FIELDS,
  SCHEDULE_C_FIELDS,
  SCHEDULE_E_FIELDS,
  SUBTYPE_READERS,
  fieldsForForm,
  buildTaxDocumentSchema,
  flattenTaxDocumentOutput,
  readerKeyForFormField,
} from './taxSchemas.ts';
import { dispositionFor } from './fieldDisposition.ts';
// 6D.0c.3 — AUTOMATIC RELEVANT-EVIDENCE POLICY. Extraction is never gated by scope;
// what the document may contribute to the ACTIVE BUSINESS is decided per field by
// this module, from evidence the document itself carries.
import {
  resolveAssociation,
  resolveEvidenceEligibility,
  isBusinessEligible,
  isAssociationEvidenceField,
  summarizeEligibility,
} from './evidenceEligibility.ts';

/** Document types that belong to the tax family (they may hold several forms). */
const TAX_FAMILY_TYPES = new Set([
  'personal_tax_return', 'business_tax_return', 'w2', 'k1', 'form_1099', 'schedule_c', 'schedule_e',
]);

/**
 * The form inventory schema. ONE provider call answers "which forms are in this
 * PDF, and on which pages" — recognition, which is a different fact from
 * extraction. A form may be recognized here while no reader exists for it.
 */
function buildFormInventorySchema(): object {
  return {
    type: 'object',
    properties: {
      forms: {
        type: 'array',
        description: 'Every tax form or schedule that appears in this document, in page order. Empty if the document contains no tax form.',
        items: {
          type: 'object',
          properties: {
            form_type: { type: 'string', enum: Object.keys(FORM_TYPES), description: 'The form this section IS.' },
            tax_year: { type: ['string', 'null'], description: 'The tax year printed on this form, e.g. "2023".' },
            page_start: { type: ['integer', 'null'], description: 'The first page of this form in the PDF, 1-based. Null if unknown.' },
            page_end: { type: ['integer', 'null'], description: 'The last page of this form, 1-based. Null if unknown.' },
            confidence: { type: ['number', 'null'], description: '0-100 confidence that this form is present.' },
          },
          required: ['form_type'],
        },
      },
      tax_year: { type: ['string', 'null'], description: 'The filing year the document states, if any.' },
    },
  };
}

/**
 * Shared Document Extraction Engine
 *
 * The single certified extraction logic used by:
 *   - uploadDocumentToSupabase (automatic trigger after upload)
 *   - runDocumentExtraction (manual/admin trigger)
 *
 * No second queue, no second service — one engine, two entry points.
 *
 * Status State Contract:
 *   queued        → accepted, worker has not begun
 *   analyzing     → worker actively running
 *   completed     → extraction finished, every value normalized, period resolved
 *   needs_review  → extraction finished but a LEGITIMATE review reason applies
 *   failed        → processing ended unsuccessfully (failure class recorded)
 *   unsupported   → stored, but no reader exists for the type. Nothing was
 *                   attempted and nothing is claimed. This is NOT an upload
 *                   failure: the document is stored and stays stored.
 *
 * Phase 6D.0 — EXTRACTION INTEGRITY. Five invariants this engine now holds:
 *
 *   TRUTHFUL CONFIDENCE
 *     Confidence is NEVER fabricated. If the extraction provider reports a
 *     per-field confidence it is preserved; if it does not, the score is null and
 *     the state is recorded as `unavailable`. `needs_review` is therefore
 *     reachable only through real rules (unresolved period, unnormalized value,
 *     reprocess discrepancy, genuinely low reported confidence) — never through a
 *     constant. Model confidence is NOT verification: nothing here asserts that a
 *     value is true.
 *
 *   PERIOD INTEGRITY
 *     The reporting period the document actually states is preserved verbatim and
 *     parsed only where parsing is deterministic. A period that cannot be read is
 *     recorded as AMBIGUOUS (and, for period-bearing types, requires review); it is
 *     never replaced by a guessed calendar year. A year the uploader declared is
 *     labelled as declared, never presented as extracted.
 *
 *   RETRY SAFETY
 *     A transient retry preserves the base44 client, the mock flag and the exact
 *     analysis/document scope, so a retry can never act outside the original
 *     authorization. Retry metadata: document_analysis.extracted_data._retry_info.
 *
 *   REVIEW SAFETY
 *     extract_fields rows a human has decided (accepted / corrected / rejected /
 *     needs_clarification) are NEVER deleted or overwritten by reprocessing. New
 *     extraction that disagrees is recorded as a discrepancy for review, and both
 *     lineages survive.
 *
 *   SOURCE AWARENESS
 *     Source availability is decided before any extraction state changes. A
 *     vanished source does not delete surviving extraction and is reported as a
 *     distinct state (`source_missing`), never as a raw storage error.
 */

// ── Currency / Number Normalization ──────────────────────────────────────

/**
 * parseCurrency — certified metric adapter boundary.
 * Handles: $1,250,000 | 1,250,000 | (125,000) | -$125,000 | 1.25M
 * Returns null for unparseable values.
 */
export function parseCurrency(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return isNaN(raw) ? null : raw;

  let s = raw.trim();
  if (!s) return null;

  // Handle parentheses notation (negative): (125,000) → -125000
  const isNegative = /^\(.*\)$/.test(s);
  if (isNegative) s = s.slice(1, -1);

  // Handle leading minus
  if (s.startsWith('-')) {
    s = s.slice(1);
  }

  // Strip currency symbols, commas, spaces
  s = s.replace(/[$,€£\s]/g, '');

  // Handle M/K suffixes: 1.25M → 1250000, 500K → 500000
  const suffixMatch = s.match(/^([\d.]+)([MmKk])$/);
  if (suffixMatch) {
    const num = parseFloat(suffixMatch[1]);
    if (isNaN(num)) return null;
    const multiplier = suffixMatch[2].toLowerCase() === 'm' ? 1_000_000 : 1_000;
    return (isNegative ? -1 : 1) * Math.round(num * multiplier);
  }

  const parsed = parseFloat(s);
  if (isNaN(parsed)) return null;
  return (isNegative ? -1 : 1) * parsed;
}

/**
 * parsePercentage — handles 18.5% → 18.5
 */
export function parsePercentage(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return raw;
  const s = raw.trim().replace(/%/g, '').trim();
  const parsed = parseFloat(s);
  return isNaN(parsed) ? null : parsed;
}

// ── Extraction Schemas ────────────────────────────────────────────────────

export interface ExtractionField {
  name: string;
  label: string;
  type: 'currency' | 'text' | 'percentage' | 'number' | 'date';
}

export interface ExtractionSchema {
  fields: ExtractionField[];
}

export const EXTRACTION_SCHEMAS: Record<string, ExtractionSchema> = {
  profit_and_loss: {
    fields: [
      { name: 'annual_revenue', label: 'Annual Revenue', type: 'currency' },
      { name: 'cogs', label: 'Cost of Goods Sold', type: 'currency' },
      { name: 'gross_profit', label: 'Gross Profit', type: 'currency' },
      { name: 'operating_expenses', label: 'Operating Expenses', type: 'currency' },
      { name: 'operating_income', label: 'Operating Income (EBIT)', type: 'currency' },
      { name: 'reported_ebitda', label: 'Reported EBITDA', type: 'currency' },
      { name: 'interest_expense', label: 'Interest Expense', type: 'currency' },
      { name: 'taxes', label: 'Taxes', type: 'currency' },
      { name: 'depreciation', label: 'Depreciation', type: 'currency' },
      { name: 'amortization', label: 'Amortization', type: 'currency' },
      { name: 'net_profit', label: 'Net Profit', type: 'currency' },
      { name: 'total_expenses', label: 'Total Expenses', type: 'currency' },
      { name: 'owner_compensation', label: 'Owner Compensation', type: 'currency' },
    ],
  },
  balance_sheet: {
    fields: [
      { name: 'total_assets', label: 'Total Assets', type: 'currency' },
      { name: 'current_assets', label: 'Current Assets', type: 'currency' },
      { name: 'total_liabilities', label: 'Total Liabilities', type: 'currency' },
      { name: 'total_equity', label: 'Total Equity', type: 'currency' },
      { name: 'cash_on_hand', label: 'Cash on Hand', type: 'currency' },
      { name: 'total_debt', label: 'Total Debt', type: 'currency' },
    ],
  },
  // A business return whose subtype the classifier could not determine: the honest
  // union of what 1120, 1120-S and 1065 forms actually report. Subtype-aware
  // contracts (taxSchemas.SUBTYPE_READERS) refine this per form.
  business_tax_return: {
    fields: [
      { name: 'gross_receipts', label: 'Gross Receipts', type: 'currency' },
      { name: 'ordinary_business_income', label: 'Ordinary Business Income', type: 'currency' },
      { name: 'officer_compensation', label: 'Officer Compensation', type: 'currency' },
      { name: 'wages', label: 'Salaries and Wages', type: 'currency' },
      { name: 'guaranteed_payments', label: 'Guaranteed Payments', type: 'currency' },
      { name: 'distributions', label: 'Distributions', type: 'currency' },
      { name: 'self_employment_earnings', label: 'Self-Employment Earnings', type: 'currency' },
      { name: 'deductions', label: 'Total Deductions', type: 'currency' },
      { name: 'taxable_income', label: 'Taxable Income', type: 'currency' },
    ],
  },
  // FORM 1040 — the safe concepts the return itself reports. total_tax (a
  // liability), federal_income_tax_withheld (what an employer withheld),
  // estimated_tax_payments (what the owner sent in), amount_owed and refund (the
  // settlement) are five DIFFERENT concepts and are never conflated.
  personal_tax_return: { fields: FORM_1040_FIELDS },
  // W-2 — safe figures only; employee/employer identifiers are never requested.
  w2: { fields: W2_FIELDS },
  k1: { fields: K1_FIELDS },
  form_1099: { fields: FORM_1099_FIELDS },
  schedule_c: { fields: SCHEDULE_C_FIELDS },
  schedule_e: { fields: SCHEDULE_E_FIELDS },
  debt_schedule: {
    fields: [
      { name: 'lender_name', label: 'Lender Name', type: 'text' },
      { name: 'loan_balance', label: 'Loan Balance', type: 'currency' },
      { name: 'interest_rate', label: 'Interest Rate', type: 'percentage' },
      { name: 'monthly_payment', label: 'Monthly Payment', type: 'currency' },
      { name: 'maturity_date', label: 'Maturity Date', type: 'date' },
    ],
  },
  payroll_report: {
    fields: [
      { name: 'total_payroll', label: 'Total Payroll', type: 'currency' },
      { name: 'owner_payroll', label: 'Owner Payroll', type: 'currency' },
      { name: 'employee_count', label: 'Employee Count', type: 'number' },
      { name: 'payroll_tax', label: 'Payroll Tax', type: 'currency' },
    ],
  },
};

// ── Mock Extraction Data (TEST FIXTURES ONLY) ─────────────────────────────
// ⚠️  MOCK_EXTRACTIONS is NEVER used in production extraction. It exists
// solely for explicit test/development fixtures (useMock: true). Production
// extraction always uses real AI via ExtractDataFromUploadedFile. Mock data
// must never be reachable as a fallback for real production analysis.

export const MOCK_EXTRACTIONS: Record<string, Record<string, { value: string; normalized: number | string; confidence: number }>> = {
  profit_and_loss: {
    annual_revenue: { value: '$1,250,000', normalized: 1250000, confidence: 95 },
    cogs: { value: '$625,000', normalized: 625000, confidence: 90 },
    gross_profit: { value: '$625,000', normalized: 625000, confidence: 92 },
    operating_expenses: { value: '$437,500', normalized: 437500, confidence: 88 },
    operating_income: { value: '$187,500', normalized: 187500, confidence: 85 },
    reported_ebitda: { value: '$245,000', normalized: 245000, confidence: 82 },
    interest_expense: { value: '$32,000', normalized: 32000, confidence: 80 },
    taxes: { value: '$31,000', normalized: 31000, confidence: 78 },
    depreciation: { value: '$45,000', normalized: 45000, confidence: 84 },
    amortization: { value: '$12,500', normalized: 12500, confidence: 76 },
    net_profit: { value: '$187,500', normalized: 187500, confidence: 88 },
    total_expenses: { value: '$1,062,500', normalized: 1062500, confidence: 90 },
    owner_compensation: { value: '$150,000', normalized: 150000, confidence: 85 },
  },
  balance_sheet: {
    total_assets: { value: '$2,500,000', normalized: 2500000, confidence: 93 },
    current_assets: { value: '$850,000', normalized: 850000, confidence: 89 },
    total_liabilities: { value: '$1,200,000', normalized: 1200000, confidence: 91 },
    total_equity: { value: '$1,300,000', normalized: 1300000, confidence: 89 },
    cash_on_hand: { value: '$350,000', normalized: 350000, confidence: 96 },
    total_debt: { value: '$800,000', normalized: 800000, confidence: 87 },
  },
  business_tax_return: {
    gross_receipts: { value: '$1,250,000', normalized: 1250000, confidence: 94 },
    ordinary_business_income: { value: '$187,500', normalized: 187500, confidence: 90 },
    officer_compensation: { value: '$150,000', normalized: 150000, confidence: 88 },
    wages: { value: '$425,000', normalized: 425000, confidence: 92 },
    deductions: { value: '$1,062,500', normalized: 1062500, confidence: 89 },
    taxable_income: { value: '$187,500', normalized: 187500, confidence: 91 },
  },
  personal_tax_return: {
    adjusted_gross_income: { value: '$185,000', normalized: 185000, confidence: 93 },
    taxable_income: { value: '$165,000', normalized: 165000, confidence: 91 },
    total_tax: { value: '$38,500', normalized: 38500, confidence: 89 },
    itemized_deductions: { value: '$20,000', normalized: 20000, confidence: 86 },
    qualified_business_income: { value: '$150,000', normalized: 150000, confidence: 87 },
  },
  debt_schedule: {
    lender_name: { value: 'First National Bank', normalized: 'First National Bank', confidence: 98 },
    loan_balance: { value: '$450,000', normalized: 450000, confidence: 95 },
    interest_rate: { value: '6.5%', normalized: 6.5, confidence: 97 },
    monthly_payment: { value: '$5,200', normalized: 5200, confidence: 94 },
    maturity_date: { value: '2028-12-31', normalized: '2028-12-31', confidence: 92 },
  },
  payroll_report: {
    total_payroll: { value: '$425,000', normalized: 425000, confidence: 94 },
    owner_payroll: { value: '$150,000', normalized: 150000, confidence: 91 },
    employee_count: { value: '8', normalized: 8, confidence: 96 },
    payroll_tax: { value: '$32,300', normalized: 32300, confidence: 90 },
  },
};

// ── Period Extraction ─────────────────────────────────────────────────────

export interface PeriodInfo {
  period_start: string | null;
  period_end: string | null;
  fiscal_year: number | null;
  period_type: string | null; // 'TTM' | 'YTD' | 'annual' | 'quarterly' | 'monthly'
}

function derivePeriodFromType(documentType: string, year?: number | null): PeriodInfo {
  const y = year || new Date().getFullYear() - 1; // Default to last completed fiscal year
  return {
    period_start: `${y}-01-01`,
    period_end: `${y}-12-31`,
    fiscal_year: y,
    period_type: 'annual',
  };
}

// ── Core Extraction Engine ────────────────────────────────────────────────

export interface ExtractionContext {
  documentAnalysisId: string;
  documentId: string;
  documentType: string;
  profileId: string;
  businessId: string | null;
  year?: number | null;
}

export interface ExtractionResult {
  success: boolean;
  documentAnalysisId: string;
  documentId: string;
  documentType: string;
  extractedFieldsCount: number;
  /**
   * Average of the confidences the PROVIDER actually reported — null when the
   * provider reports none. It is never a constant, and a null average is not a
   * failure: it means confidence is unavailable, and the review reasons carry
   * whatever genuinely needs a human.
   */
  averageConfidence: number | null;
  finalStatus: 'completed' | 'needs_review' | 'failed' | 'unsupported';
  /**
   * The `documents.upload_status` this run ACTUALLY persisted. Present so a caller
   * reports the stored truth instead of re-deriving it: a type with no reader
   * leaves the document UPLOADED, because the upload itself succeeded.
   */
  documentUploadStatus?: string;
  error?: string;
  /** 6D.0 additive reporting — never used for authorization. */
  errorClass?: ExtractionFailureClass | null;
  confidenceState?: 'model_reported' | 'mixed' | 'unavailable';
  period?: ResolvedPeriod | null;
  sourceStatus?: 'available' | 'missing' | 'unresolvable';
  reviewReasons?: string[];
  reviewPreserved?: number;
  fieldsRetained?: number;
  discrepancyCount?: number;
}

/**
 * runExtraction — the single certified extraction function.
 *
 * Caller provides a Supabase service-role client and the analysis context.
 * The function:
 *   1. Validates preconditions (status, document type)
 *   2. Claims the job (queued → analyzing)
 *   3. Runs extraction (mock data for now, structured for future AI)
 *   4. Inserts extracted_fields with normalized values + period info
 *   5. Updates document_analysis to completed/needs_review/failed
 *   6. Updates documents.upload_status
 *   7. Returns structured result
 *
 * Retry metadata is stored in document_analysis.extracted_data._retry_info.
 */
async function runExtractionCore(
  sb: any,
  ctx: ExtractionContext,
  options?: { attempt?: number; base44?: any; useMock?: boolean }
): Promise<ExtractionResult> {
  const attempt = options?.attempt || 1;
  const MAX_RETRIES = 3;
  const now = new Date().toISOString();

  // ── 1. Fetch analysis row ──────────────────────────────────────────────
  const { data: analysis, error: analysisErr } = await sb
    .from('document_analysis')
    .select('*')
    .eq('id', ctx.documentAnalysisId)
    .maybeSingle();

  if (analysisErr || !analysis) {
    return {
      success: false,
      documentAnalysisId: ctx.documentAnalysisId,
      documentId: ctx.documentId,
      documentType: ctx.documentType,
      extractedFieldsCount: 0,
      averageConfidence: 0,
      finalStatus: 'failed',
      error: 'Document analysis not found',
    };
  }

  // ── 1b. Fetch the persisted document row (6D.0) ────────────────────────
  // The ROW — not the caller and not this request — names the document type and
  // the storage location. `ctx.documentType` is only a fallback for a row that
  // does not carry one.
  const { data: docRow } = await sb
    .from('documents')
    .select('id, file_path, storage_bucket, document_type, profile_id, business_id, year, name')
    .eq('id', ctx.documentId)
    .maybeSingle();

  // ── 2. Validate status (claim the job) ─────────────────────────────────
  const validStartStatuses = ['queued', 'pending_analysis', 'analyzing', 'failed'];
  if (!validStartStatuses.includes(analysis.analysis_status)) {
    // Already completed or in a terminal state — don't reprocess
    return {
      success: false,
      documentAnalysisId: ctx.documentAnalysisId,
      documentId: ctx.documentId,
      documentType: ctx.documentType,
      extractedFieldsCount: 0,
      averageConfidence: 0,
      finalStatus: analysis.analysis_status as any,
      error: `Document not ready for extraction. Current status: ${analysis.analysis_status}`,
    };
  }

  // ── 3. Validate document type ──────────────────────────────────────────
  // UNSUPPORTED HONESTY (6D.0-I). Two different facts are distinguished:
  //   classification_unsupported — the document was never classified into a type
  //                                VISION can read (storage default: 'other')
  //   extraction_unsupported     — the type is named but has no reader yet
  // Either way the document is NOT presented as analyzed.
  const documentType = docRow?.document_type || ctx.documentType;

  if (!EXTRACTION_SCHEMAS[documentType]) {
    const unsupportedKind = ['other', 'unknown', ''].includes(String(documentType || '').trim())
      ? 'classification_unsupported'
      : 'extraction_unsupported';
    const errorMsg = unsupportedKind === 'classification_unsupported'
      ? 'This document has not been classified into a type VISION can read yet, so it cannot be analyzed.'
      : `VISION cannot analyze ${documentType} yet — no reader exists for this document type.`;

    // ANALYSIS-UNSUPPORTED, NOT UPLOAD-FAILED (6D.0 classification hotfix).
    // The document is stored; only analysis is unavailable. The analysis row
    // carries the honest `unsupported` state, and the document's own upload state
    // stays a storage truth. Nothing is attempted, invented or erased.
    await markAnalysis(sb, ctx.documentAnalysisId, {
      status: 'unsupported',
      summary: errorMsg,
      errorClass: 'unsupported_type',
      prior: analysis.extracted_data,
      extra: {
        failure_class: 'unsupported_type',
        unsupported_kind: unsupportedKind,
        unsupported_document_type: documentType || null,
        attempt,
      },
    });
    await setDocumentUploadStatus(sb, ctx.documentId, 'uploaded', now);

    return {
      success: false,
      documentAnalysisId: ctx.documentAnalysisId,
      documentId: ctx.documentId,
      documentType,
      extractedFieldsCount: 0,
      averageConfidence: null,
      finalStatus: 'unsupported',
      documentUploadStatus: 'uploaded',
      errorClass: 'unsupported_type',
      error: errorMsg,
    };
  }

  // ── 4. Claim: queued → analyzing ───────────────────────────────────────
  await sb.from('document_analysis').update({
    analysis_status: 'analyzing',
    status: 'analyzing',
    updated_at: now,
  }).eq('id', ctx.documentAnalysisId);

  try {
    // ── 5. Run extraction ───────────────────────────────────────────────
    // Production: real AI via ExtractDataFromUploadedFile.
    // Test fixtures only: useMock: true (never a production fallback).
    const schema = EXTRACTION_SCHEMAS[documentType];

    // ── 5a. FORM SECTIONS (6D.0c.3) ─────────────────────────────────────
    // A tax PDF is ONE document that may CONTAIN several forms. The sections are
    // detected once the source is readable (5c below) so a multi-form filing is
    // read as its FORMS and every figure can carry the page it actually came from.
    // Until then, the honest default is the type-level reader with no sections and
    // no claimed page.
    let formSections: FormSection[] = [];
    let extractionFields: Array<{ name: string; label: string; type: string; form_type?: string | null }> = schema.fields;

    // ── 5b. SOURCE AUTHORITY (6D.0-E) ───────────────────────────────────
    // The persisted row names the bucket. No bucket is hardcoded, and a
    // client-supplied bucket is not read here at all — it cannot influence this.
    if (!isApprovedDocumentBucket(docRow?.storage_bucket) || !docRow?.file_path) {
      const msg = !docRow?.file_path
        ? 'Document row has no stored file path'
        : `Document storage bucket is missing or not approved: ${docRow?.storage_bucket}`;
      await markAnalysis(sb, ctx.documentAnalysisId, {
        status: 'failed',
        summary: 'Extraction could not read this document because its storage location is unrecognized.',
        errorClass: 'source_unresolvable',
        error: msg,
        prior: analysis.extracted_data,
        extra: { failure_class: 'source_unresolvable', attempt },
      });
      await setDocumentUploadStatus(sb, ctx.documentId, 'failed', now);
      return {
        success: false,
        documentAnalysisId: ctx.documentAnalysisId,
        documentId: ctx.documentId,
        documentType,
        extractedFieldsCount: 0,
        averageConfidence: null,
        finalStatus: 'failed',
        errorClass: 'source_unresolvable',
        sourceStatus: 'unresolvable',
        error: 'source_unresolvable',
      };
    }

    // ── 5c. SOURCE EXISTENCE (6D.0-F) ──────────────────────────────────
    // Decided BEFORE any extraction state changes, from the row's own approved
    // bucket.
    const { data: signedUrlData, error: signedUrlErr } = await sb.storage
      .from(docRow.storage_bucket)
      .createSignedUrl(docRow.file_path, 300);

    if (signedUrlErr || !signedUrlData?.signedUrl) {
      // The bytes are gone. Extraction that already exists is PRESERVED — nothing
      // is deleted and nothing is reconciled — so VISION keeps what it learned
      // while being explicit that the source is unavailable. The storage error is
      // recorded server-side as a failure CLASS, never returned raw to an owner.
      const surviving = await countExtractedFields(sb, ctx.documentAnalysisId);
      const status = surviving > 0 ? 'needs_review' : 'failed';
      await markAnalysis(sb, ctx.documentAnalysisId, {
        status,
        summary: surviving > 0
          ? 'The original file is no longer available. Previously extracted information is retained.'
          : 'The original file is no longer available.',
        errorClass: surviving > 0 ? null : 'source_missing',
        error: signedUrlErr?.message || 'source object missing',
        prior: analysis.extracted_data,
        extra: {
          failure_class: 'source_missing',
          source_status: 'missing',
          source_checked_at: now,
          source_bucket: docRow.storage_bucket,
          source_path: docRow.file_path,
          retained_extracted_fields: surviving,
          attempt,
        },
      });
      await setDocumentUploadStatus(sb, ctx.documentId, status, now);
      return {
        success: false,
        documentAnalysisId: ctx.documentAnalysisId,
        documentId: ctx.documentId,
        documentType,
        extractedFieldsCount: surviving,
        averageConfidence: null,
        finalStatus: status as 'needs_review' | 'failed',
        errorClass: surviving > 0 ? null : 'source_missing',
        sourceStatus: 'missing',
        error: surviving > 0 ? 'source_missing_extraction_retained' : 'source_missing',
      };
    }

    const signedUrl = signedUrlData.signedUrl;

    // ── 5c-bis. FORM INVENTORY (6D.0c.3) ───────────────────────────────
    // WHICH FORMS does this document actually contain, and where? Recognition is a
    // different fact from extraction: a form may be recognized here while no reader
    // exists for it. Detection failing is never a reason to fail extraction — the
    // type-level reader still runs and page provenance is then honestly "unknown"
    // rather than invented.
    if (TAX_FAMILY_TYPES.has(documentType) && options?.base44) {
      try {
        const inventory = await options.base44.asServiceRole.integrations.Core.ExtractDataFromUploadedFile({
          file_url: signedUrl,
          json_schema: buildFormInventorySchema(),
        });
        const rawForms = (inventory?.output as any)?.forms ?? inventory?.output ?? null;
        const declaredYear = Number(String((inventory?.output as any)?.tax_year || '').match(/(20\d{2})/)?.[1]);
        formSections = normalizeFormSections(rawForms, Number.isFinite(declaredYear) ? declaredYear : (docRow?.year ?? null));
      } catch (inventoryErr: any) {
        console.error('[runExtraction] form inventory unavailable:', inventoryErr?.message || inventoryErr);
      }
      if (formSections.length) {
        // Persisted where every reader can see it without a second call: the
        // document's own jsonb. It answers "which forms does this document hold, and
        // where" — recognition, exactly as it happened.
        const priorDocData = (docRow?.extracted_data && typeof docRow.extracted_data === 'object') ? docRow.extracted_data : {};
        await sb.from('documents').update({
          extracted_data: { ...priorDocData, form_sections: formSections, form_sections_detected_at: now },
        }).eq('id', ctx.documentId);
        extractionFields = formSections.flatMap((s) =>
          fieldsForForm(s.form_type).map((f) => ({ ...f, form_type: s.form_type })),
        );
      }
    }

    // ── 5d. REVIEW-SAFE RECONCILE SET (6D.0-D) ─────────────────────────
    // Existing rows are LOADED, never deleted: a human decision is an INPUT.
    const { data: existingFields } = await sb.from('extracted_fields')
      .select('id, field_name, review_status, field_value, normalized_value, accepted_value, accepted_normalized_value, reviewed_at, reviewed_by, metadata')
      .eq('document_analysis_id', ctx.documentAnalysisId);
    const existingByName = new Map<string, any>((existingFields || []).map((f: any) => [f.field_name, f]));

    // Normalize facts from either real AI extraction or explicit test mock
    let normalizedFacts: Record<string, { value: string; normalized: number | string | null; field_type: string }> = {};
    let extractionMethod = 'ai_extraction';
    // 6D.0: the period the document stated, and any confidence the provider reported.
    let extractedPeriodRaw: string | null = null;
    let reportedFieldConfidence: Record<string, any> = {};
    // ── THE EXTRACTION SECTIONS (6D.1B.2) ────────────────────────────────
    // A document is read as ONE OR MORE SECTIONS, each carrying its OWN period and
    // its OWN source provenance. The provider path is exactly ONE section with
    // neither, so its behaviour is unchanged; a workbook VISION can read
    // deterministically becomes one section PER SHEET, so 2018, 2019 and a
    // trailing-twelve-month statement are three periods — never one flattened
    // "All Dates" figure, and never a month labelled with its fiscal year.
    let structuredBasis: string | null = null;
    const structuredSections: Array<{
      suffix: string | null;
      sheet: string | null;
      sheet_index: number | null;
      fields: Array<{ name: string; label: string; type: string; form_type?: string | null }>;
      facts: Record<string, { value: string; normalized: number | string | null; field_type: string }>;
      period: ResolvedPeriod;
      provenance: Record<string, any> | null;
    }> = [];

    if (options?.useMock) {
      // TEST FIXTURES ONLY — explicitly opt-in, never a production fallback
      extractionMethod = 'mock_extraction';
      const mockData = MOCK_EXTRACTIONS[ctx.documentType] || {};
      for (const field of schema.fields) {
        const extraction = mockData[field.name];
        if (!extraction) continue;
        let normalizedValue: any = extraction.normalized;
        if (field.type === 'currency') {
          const parsed = parseCurrency(extraction.value);
          if (parsed != null) normalizedValue = parsed;
        } else if (field.type === 'percentage') {
          const parsed = parsePercentage(extraction.value);
          if (parsed != null) normalizedValue = parsed;
        }
        normalizedFacts[field.name] = { value: extraction.value, normalized: normalizedValue, field_type: field.type };
      }
    } else {
      // PRODUCTION: Real AI extraction via ExtractDataFromUploadedFile
      if (!options?.base44) {
        throw new Error('runExtraction requires base44 client for real AI extraction. Pass useMock: true only in test fixtures.');
      }

      // ── A. STRUCTURED FIRST: A WORKBOOK VISION CAN READ IS NEVER SENT AWAY ──
      // The bytes arrive over the SHORT-LIVED signed URL minted above from the
      // ROW's own approved bucket. A document the reader refuses, a spreadsheet
      // whose structure carries no recognizable financial line, or a document type
      // this bridge has no concept map for, all fall through to B unchanged.
      const structuredWorkbook = await tryStructuredSpreadsheetExtraction({
        documentName: docRow?.name ?? null,
        documentType,
        fields: schema.fields.map((f: any) => ({ name: f.name, label: f.label, type: f.type })),
        sourceUrl: signedUrl,
      });
      if (structuredWorkbook?.ok) {
        extractionMethod = 'structured_spreadsheet_extraction';
        structuredBasis = structuredWorkbook.basis;
        for (const sheet of structuredWorkbook.sheets) {
          const sheetRead = normalizeExtraction(documentType, sheet.raw);
          if (!sheetRead.success || !Object.keys(sheetRead.facts).length) continue;
          structuredSections.push({
            suffix: sheet.suffix,
            sheet: sheet.sheet,
            sheet_index: sheet.sheet_index,
            fields: schema.fields,
            facts: sheetRead.facts,
            // THE PERIOD THE SHEET ITSELF STATES. A sheet that states none is NOT
            // given the year declared at upload: silence stays silence, and the
            // observation is reported as period-ambiguous rather than dated.
            period: resolveReportingPeriod(sheetRead.periodRaw ?? null, null),
            provenance: sheet.provenance || null,
          });
        }
      }

      // ── B. THE PROVIDER IS A FALLBACK, NEVER A GATE (6D.1B.2a) ─────────
      // A workbook the certified reader has ALREADY read is not sent to an opaque
      // provider at all, and — critically — a provider that recognizes nothing can
      // no longer sink a reading that succeeded. Production proved the cost of the
      // opposite: the structured read of the P&L specimen produced seven periods,
      // the provider returned nothing for the same .xlsx, and the thrown
      // "No data extracted from document" discarded all seven.
      if (formSections.length) {
        // ── COMPOSITE READER — one call, one group per recognized form ────
        // Each figure is attributed to the form it came from, so a value can never
        // be credited to the wrong form inside the same filing.
        const composite = buildTaxDocumentSchema(formSections.map((s) => s.form_type));
        const compositeResult = await options.base44.asServiceRole.integrations.Core.ExtractDataFromUploadedFile({
          file_url: signedUrl,
          json_schema: composite,
        });
        const { facts: flatFacts } = flattenTaxDocumentOutput(compositeResult?.output);
        extractedPeriodRaw = (compositeResult?.output as any)?.reporting_period ?? null;
        normalizedFacts = {};
        for (const field of extractionFields) {
          const raw = flatFacts[field.name];
          if (raw === undefined || raw === null || raw === '') continue;
          let normalizedValue: number | string | null = String(raw);
          if (field.type === 'currency') {
            normalizedValue = parseCurrency(raw);
          } else if (field.type === 'percentage') {
            normalizedValue = parsePercentage(raw);
          } else if (field.type === 'number') {
            const n = Number(String(raw).replace(/[^0-9.\-]/g, ''));
            normalizedValue = Number.isFinite(n) ? n : null;
          }
          normalizedFacts[field.name] = { value: String(raw), normalized: normalizedValue, field_type: field.type };
        }
        if (!Object.keys(normalizedFacts).length) {
          throw new Error('AI extraction returned no usable fields');
        }
        // The composite call reports no per-field confidence, so the score stays
        // null and the state records that — confidence is never fabricated.
        reportedFieldConfidence = {};
      } else if (!structuredSections.length) {
        // No structured reading exists, so the provider IS the reader for this
        // document — exactly as it always was.
        const extractionSchema = buildExtractionSchema(documentType);
        const extractResult = await options.base44.asServiceRole.integrations.Core.ExtractDataFromUploadedFile({
          file_url: signedUrl,
          json_schema: extractionSchema,
        });

        // Normalize through the ONE shared normalizer (also used by the guest path).
        // It carries the period the document stated and any provider-reported
        // confidence — neither is invented downstream.
        const normalized = normalizeExtraction(documentType, extractResult?.output);
        if (!normalized.success) {
          throw new Error(normalized.error || 'AI extraction returned no usable fields');
        }
        normalizedFacts = normalized.facts;
        extractedPeriodRaw = normalized.periodRaw ?? normalized.period ?? null;
        reportedFieldConfidence = normalized.fieldConfidence || {};
      }
    }

    // ── 5e. THE SECTIONS THE RECONCILE RUNS OVER ────────────────────────
    // A structured workbook contributes one section PER SHEET, each with its own
    // sheet, period and cell provenance. The mock and provider paths contribute
    // exactly ONE unnamed, unprovenanced section, so a provider read of a PDF runs
    // exactly as it always has.
    const sections = structuredSections.length
      ? structuredSections
      : [{
        suffix: null,
        sheet: null,
        sheet_index: null,
        fields: extractionFields,
        facts: normalizedFacts,
        period: resolveReportingPeriod(extractedPeriodRaw, ctx.year ?? docRow?.year ?? null),
        provenance: null,
      }];

    // ── 6. RECONCILE into extracted_fields (review-safe) ────────────────
    // ONE section is the document's own period; several sections mean several
    // periods, and EVERY row keeps the period it actually came from.
    const period = sections[0]?.period ?? resolveReportingPeriod(extractedPeriodRaw, ctx.year ?? docRow?.year ?? null);
    const producedNames: string[] = [];
    for (const s of sections) {
      for (const name of Object.keys(s.facts)) producedNames.push(s.suffix ? `${name}__${s.suffix}` : name);
    }
    const producedSet = new Set(producedNames);
    const discrepancies: any[] = [];
    let inserted = 0;
    let reconciled = 0;
    let preserved = 0;
    let unnormalized = 0;

    // ── 6a. ASSOCIATION + ELIGIBILITY (6D.0c.3 automatic relevant-evidence policy) ──
    // Extraction has already happened — nothing above this line was gated by scope,
    // and nothing below it asks the owner anything. What remains is the SEPARATE
    // question: what may VISION use for THIS business?
    //
    // The relationship must be supported by the DOCUMENT. The active business is
    // context, never proof: it is accepted only when a name the form states matches
    // the business, or when the classifier's own document-derived reading identified
    // this business. Otherwise the field is retained as document evidence and stays
    // out of business intelligence — AMBIGUOUS, not assumed.
    const readBusinessName = async (): Promise<string | null> => {
      if (!sb || typeof sb.from !== 'function' || !ctx.businessId) return null;
      try {
        const { data, error } = await sb.from('businesses').select('*').eq('id', ctx.businessId).maybeSingle();
        if (error) return null;
        return (data && (data.name || data.business_name)) || null;
      } catch {
        return null;
      }
    };
    const activeBusinessName = await readBusinessName();
    const classificationSuggestion = (analysis?.extracted_data && typeof analysis.extracted_data === 'object')
      ? ((analysis.extracted_data as any).classification?.suggested_business_id || null)
      : null;
    const association = resolveAssociation({
      businessId: ctx.businessId,
      businessName: activeBusinessName,
      identityNames: (extractionFields || [])
        .filter((f: any) => isAssociationEvidenceField(f.form_type, f.name))
        .map((f: any) => normalizedFacts[f.name]?.value ?? null),
      classificationSuggestedBusinessId: classificationSuggestion,
      // The suggestion is read from the PERSISTED classification contract — the
      // document's own reading, constrained to the actor's authorized candidates.
      // Never from the request, the active context or the UI selection.
      classificationSuggestionSource: 'document_content',
    });
    const eligibilityVerdicts: Array<{ field_name: string; eligibility: any }> = [];

    for (const section of sections) {
      const sectionPeriod = section.period;
      // A sheet is a LOCATION, not a meaning: the persisted name namespaces the
      // concept by the section it came from (`annual_revenue__2023`), and the
      // period travels in that row's own metadata. The semantic bridge resolves
      // the base name, so the concept keeps ONE meaning across every period.
      const persistedName = (name: string) => (section.suffix ? `${name}__${section.suffix}` : name);
    for (const field of section.fields) {
      const fact = section.facts[field.name];
      if (!fact) continue;

      // ── PAGE + FORM PROVENANCE (6D.0c.3) ──────────────────────────────
      // The page is the one the document's own form section states. When it cannot
      // be determined it is null — rendered as "unknown" — because page 1 must
      // never be invented for a figure whose page is not known.
      const fieldFormType = (field as any).form_type || null;
      const sourcePage = fieldFormType ? resolveFieldSourcePage(fieldFormType, formSections) : null;
      const dispositionReaderKey = fieldFormType ? readerKeyForFormField(fieldFormType) : documentType;

      // A value the source stated but that could not be normalized is a REAL
      // review reason. It is not a failed extraction and it is not hidden.
      if (fact.normalized == null && field.type !== 'text' && field.type !== 'date') unnormalized++;

      const confidence = resolveFieldConfidence(reportedFieldConfidence[field.name]);
      // ELIGIBILITY (6D.0c.3) — the four-state verdict for THIS business. It is
      // derived here, on every run, from the field's declared disposition and the
      // relationship evidence; it is never inherited from a previous decision and
      // never from the fact that a business was selected.
      const eligibility = resolveEvidenceEligibility({
        readerKey: dispositionReaderKey,
        formType: fieldFormType,
        fieldName: field.name,
        association,
      });
      eligibilityVerdicts.push({ field_name: String(field.name), eligibility });
      const metadata = {
        ...periodMetadata(sectionPeriod),
        extracted_by: 'extraction_engine_v3',
        extraction_method: extractionMethod,
        extracted_at: now,
        // ── STRUCTURED PROVENANCE (6D.1B.2) ──
        // WHERE IN THE SOURCE this figure sits. Present only when VISION read the
        // structure itself: a provider read has no cell to point at, and carrying
        // nothing is how it says so. The sheet is the location; the cell is the
        // figure's own coordinate; the label is the words the source used.
        ...(section.sheet ? { source_sheet: section.sheet, sheet_index: section.sheet_index } : {}),
        ...(section.provenance?.[field.name] ? { cell_provenance: section.provenance[field.name] } : {}),
        // The basis the SOURCE stated, or nothing at all. It is never inferred from
        // the workbook's shape: an unknown basis stays unknown, and stays subject to
        // the existing promotion policy.
        ...(structuredBasis ? { accounting_basis: structuredBasis, accounting_basis_source: 'document_stated' } : {}),
        // Which form inside the filing this figure came from, where it was, whether
        // the page is actually known, and whether the concept may become business
        // evidence for THIS business (business-relevant concepts of a personal
        // return are eligible only when the document supports the relationship).
        form_type: fieldFormType,
        page_provenance: pageProvenanceFor(sourcePage),
        disposition: dispositionFor(dispositionReaderKey, field.name)?.disposition || null,
        evidence_eligibility: {
          state: eligibility.state,
          reason: eligibility.reason,
          association_supported: eligibility.association_supported,
          basis: association.reason,
          version: '6d.0c.3',
        },
        // Kept as the single boolean the rest of the product reads.
        business_eligible: isBusinessEligible(eligibility),
        confidence_state: confidence.state,
        confidence_basis: confidence.state === 'model_reported'
          ? 'reported_by_extraction_provider'
          : (extractionMethod === 'structured_spreadsheet_extraction'
            ? 'deterministic_structured_read'
            : 'extraction_provider_reports_no_field_confidence'),
      };
      const baseUpdate = {
        field_label: field.label,
        field_value: fact.value,
        normalized_value: fact.normalized,
        field_type: field.type,
        source_document_type: documentType,
        source_page: sourcePage,
        confidence_score: confidence.score,
        metadata,
        updated_at: now,
      };

      const existing = existingByName.get(persistedName(field.name));

      if (existing && REVIEWED_REVIEW_STATUSES.includes(existing.review_status)) {
        // A HUMAN DECISION. Preserved verbatim — the reviewed value, the reviewer
        // and the timestamp are never overwritten. A changed value is recorded as
        // a discrepancy for review so both lineages survive.
        preserved++;
        const priorValue = existing.accepted_normalized_value ?? existing.normalized_value ?? null;
        if (String(priorValue) !== String(fact.normalized)) {
          discrepancies.push({
            field_name: persistedName(field.name),
            review_status: existing.review_status,
            prior_normalized_value: priorValue,
            new_normalized_value: fact.normalized,
            detected_at: now,
          });
          await sb.from('extracted_fields').update({
            metadata: {
              ...(existing.metadata || {}),
              reprocess_discrepancy: {
                new_value: fact.value,
                new_normalized_value: fact.normalized,
                detected_at: now,
                prior_review_status: existing.review_status,
                prior_reviewed_at: existing.reviewed_at || null,
              },
            },
            updated_at: now,
          }).eq('id', existing.id);
        }
        continue;
      }

      if (existing) {
        // PENDING observation — safe to reconcile in place.
        await sb.from('extracted_fields').update(baseUpdate).eq('id', existing.id);
        reconciled++;
      } else {
        const { error: fieldError } = await sb.from('extracted_fields').insert({
          ...baseUpdate,
          profile_id: ctx.profileId,
          business_id: ctx.businessId,
          document_id: ctx.documentId,
          document_analysis_id: ctx.documentAnalysisId,
          field_name: persistedName(field.name),
          review_status: 'pending_review',
          created_at: now,
        });
        if (fieldError) console.error(`[extractEngine] Failed to insert field ${persistedName(field.name)}:`, fieldError.message);
        else inserted++;
      }
    }
    }

    // Fields that existed before and were not produced this run are RETAINED, not
    // deleted: reprocessing must not silently remove observations.
    const retained = (existingFields || []).filter((f: any) => !producedSet.has(f.field_name)).length;

    if (producedNames.length === 0) {
      const errorMsg = 'No fields could be extracted from the document';
      await markAnalysis(sb, ctx.documentAnalysisId, {
        status: 'failed',
        summary: errorMsg,
        errorClass: 'no_fields_extracted',
        prior: analysis.extracted_data,
        extra: { failure_class: 'no_fields_extracted', attempt },
      });
      await setDocumentUploadStatus(sb, ctx.documentId, 'failed', now);
      return {
        success: false,
        documentAnalysisId: ctx.documentAnalysisId,
        documentId: ctx.documentId,
        documentType,
        extractedFieldsCount: 0,
        averageConfidence: null,
        finalStatus: 'failed',
        errorClass: 'no_fields_extracted',
        error: errorMsg,
      };
    }

    // ── 7. HONEST CONFIDENCE + LEGITIMATE REVIEW REASONS ───────────────
    const reportedScores: number[] = producedNames
      .map((name) => resolveFieldConfidence(reportedFieldConfidence[name]).score)
      .filter((s): s is number => typeof s === 'number');

    const confidenceState: 'model_reported' | 'mixed' | 'unavailable' =
      reportedScores.length === 0 ? 'unavailable'
        : reportedScores.length === producedNames.length ? 'model_reported'
          : 'mixed';

    // An average ONLY over confidences the provider actually reported. Null means
    // "confidence is unavailable", which is a fact about the provider — not a
    // reason to send the document to review, and never a reason to invent a number.
    const avgConfidence = reportedScores.length
      ? Math.round(reportedScores.reduce((a, b) => a + b, 0) / reportedScores.length)
      : null;

    const reviewReasons: string[] = [];
    if (discrepancies.length > 0) reviewReasons.push('reprocess_discrepancy');
    if (unnormalized > 0) reviewReasons.push('value_not_normalized');
    // A document is only as dated as its SECTIONS are. One ambiguous sheet among
    // dated ones is still a figure whose period a human must settle.
    if (sections.some((s) => s.period.period_ambiguous) && PERIOD_REQUIRED_TYPES.has(documentType)) reviewReasons.push('reporting_period_unresolved');
    if (avgConfidence != null && avgConfidence < MODEL_CONFIDENCE_REVIEW_THRESHOLD) reviewReasons.push('low_model_confidence');

    const finalStatus: 'completed' | 'needs_review' = reviewReasons.length > 0 ? 'needs_review' : 'completed';

    await sb.from('document_analysis').update({
      analysis_status: finalStatus,
      status: finalStatus,
      extracted_summary: finalStatus === 'completed'
        ? `Extracted ${producedNames.length} fields from ${documentType}`
        : `Extracted ${producedNames.length} fields from ${documentType} — needs review: ${reviewReasons.join(', ')}`,
      // Never a fabricated number: null when the provider reports no confidence.
      confidence_score: avgConfidence,
      extracted_data: {
        ...(analysis.extracted_data || {}),
        extracted_fields_count: producedNames.length,
        extraction_method: extractionMethod,
        completed_at: now,
        failure_class: null,
        confidence_state: confidenceState,
        confidence_basis: confidenceState === 'unavailable'
          ? (extractionMethod === 'structured_spreadsheet_extraction'
            ? 'deterministic_structured_read'
            : 'extraction_provider_reports_no_field_confidence')
          : 'reported_by_extraction_provider',
        period_info: period,
        period_source: period.period_source,
        period_ambiguous: period.period_ambiguous,
        // A MULTI-PERIOD DOCUMENT IS RECORDED AS MULTI-PERIOD. Every row carries
        // the period it came from; this is the map of the sections it was read as,
        // so no consumer has to infer periods from a field name.
        ...(sections.length > 1 ? {
          period_sections: sections.map((s) => ({
            sheet: s.sheet,
            period_type: s.period.period_type,
            period_raw: s.period.period_raw,
            fiscal_year: s.period.fiscal_year,
            period_ambiguous: s.period.period_ambiguous,
          })),
        } : {}),
        source_status: 'available',
        review_reason: reviewReasons[0] || null,
        review_reasons: reviewReasons,
        reconcile: { inserted, reconciled, preserved, retained, discrepancies: discrepancies.length },
        // ELIGIBILITY SUMMARY (6D.0c.3) — counts and the association basis only.
        // No value is duplicated here: the rows themselves carry the verdict, and
        // this is what lets a surface say how much of the document could be tied to
        // the business without inventing anything.
        eligibility: {
          ...summarizeEligibility(eligibilityVerdicts),
          association_reason: association.reason,
          association_evidence: association.evidence,
          active_business_name: association.active_business_name,
          version: '6d.0c.3',
        },
        _retry_info: {
          attempt,
          last_error_class: null,
          last_attempt_at: now,
          succeeded: true,
        },
      },
      updated_at: now,
    }).eq('id', ctx.documentAnalysisId);

    // ── 8. Update documents.upload_status ──────────────────────────────
    await setDocumentUploadStatus(sb, ctx.documentId, finalStatus, now);

    return {
      success: true,
      documentAnalysisId: ctx.documentAnalysisId,
      documentId: ctx.documentId,
      documentType,
      extractedFieldsCount: producedNames.length,
      averageConfidence: avgConfidence,
      finalStatus,
      errorClass: null,
      confidenceState,
      period,
      sourceStatus: 'available',
      reviewReasons,
      reviewPreserved: preserved,
      fieldsRetained: retained,
      discrepancyCount: discrepancies.length,
    };

  } catch (error) {
    // ── Retry logic for transient failures ──────────────────────────────
    const message = String(error?.message || error || '');
    const isConfiguration = /requires base44 client|Supabase not configured/.test(message);
    const isTransient = /timeout|network|rate ?limit|429|50[234]|temporarily/i.test(message);
    const errorClass: ExtractionFailureClass = isConfiguration ? 'configuration' : isTransient ? 'transient' : 'permanent';

    if (errorClass === 'transient' && attempt < MAX_RETRIES) {
      console.log(`[extractEngine] Transient failure, retrying (attempt ${attempt + 1}/${MAX_RETRIES})...`);
      // Recursive retry — the base44 client, the mock flag and the exact
      // analysis/document scope are carried through, so a retry can never act
      // outside the authorization the first attempt ran under.
      return runExtractionCore(sb, ctx, {
        attempt: attempt + 1,
        base44: options?.base44,
        useMock: options?.useMock,
      });
    }

    // Permanent failure or max retries exceeded. The internal message is recorded
    // as a failure CLASS with the detail kept server-side; the owner-facing
    // summary stays human and never carries a storage/database error string.
    const survivingFields = await countExtractedFields(sb, ctx.documentAnalysisId);

    await markAnalysis(sb, ctx.documentAnalysisId, {
      status: 'failed',
      summary: survivingFields > 0
        ? 'Extraction could not be completed. Previously extracted information is retained.'
        : 'Extraction could not be completed for this document.',
      errorClass,
      error: message,
      prior: analysis.extracted_data,
      extra: { failure_class: errorClass, retained_extracted_fields: survivingFields, attempt },
    });
    await setDocumentUploadStatus(sb, ctx.documentId, 'failed', now);

    return {
      success: false,
      documentAnalysisId: ctx.documentAnalysisId,
      documentId: ctx.documentId,
      documentType,
      extractedFieldsCount: survivingFields,
      averageConfidence: null,
      finalStatus: 'failed',
      errorClass,
      error: errorClass,
    };
  }
}

// ── Stale Queue Classification ─────────────────────────────────────────────

export type StaleClassification = 'RECOVERABLE_CURRENT' | 'HISTORICAL_TEST' | 'DUPLICATE' | 'MISSING_DOCUMENT' | 'UNSUPPORTED' | 'UNKNOWN';

export interface StaleQueueItem {
  analysis_id: string;
  document_id: string;
  document_name: string;
  document_type: string;
  business_id: string | null;
  profile_id: string;
  created_at: string;
  classification: StaleClassification;
  reason: string;
}

/**
 * classifyStaleQueue — classifies historical "queued" analyses for selective recovery.
 * Does NOT process anything. Returns a classification list for advisor review.
 */
export async function classifyStaleQueue(sb: any): Promise<StaleQueueItem[]> {
  // Fetch all queued analyses with their documents
  const { data: queuedAnalyses, error } = await sb
    .from('document_analysis')
    .select(`
      id, document_id, document_type, business_id, profile_id, created_at,
      documents!inner (id, name, document_type, file_path, business_id, profile_id )
    `)
    .in('analysis_status', ['queued', 'pending_analysis'])
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) {
    console.error('[classifyStaleQueue] query error:', error.message);
    return [];
  }

  const items: StaleQueueItem[] = [];
  const seenDocuments = new Map<string, number>();

  for (const analysis of (queuedAnalyses || [])) {
    const doc = analysis.documents;
    if (!doc) {
      items.push({
        analysis_id: analysis.id,
        document_id: analysis.document_id,
        document_name: 'MISSING',
        document_type: analysis.document_type,
        business_id: analysis.business_id,
        profile_id: analysis.profile_id,
        created_at: analysis.created_at,
        classification: 'MISSING_DOCUMENT',
        reason: 'Document row not found — orphaned analysis record',
      });
      continue;
    }

    // Check for duplicates (same document_id appearing multiple times)
    const docCount = (seenDocuments.get(doc.id) || 0) + 1;
    seenDocuments.set(doc.id, docCount);

    // Check if document type is supported
    const isSupported = !!EXTRACTION_SCHEMAS[doc.document_type || analysis.document_type];

    // Classify by age and type
    const ageDays = (Date.now() - new Date(analysis.created_at).getTime()) / (1000 * 60 * 60 * 24);
    const isHistoricalTest = ageDays > 30 && (!doc.business_id || doc.name?.includes('test') || doc.name?.includes('sample'));

    let classification: StaleClassification = 'UNKNOWN';
    let reason = '';

    if (docCount > 1) {
      classification = 'DUPLICATE';
      reason = `Document ${doc.id} has ${docCount} analysis records`;
    } else if (!isSupported) {
      classification = 'UNSUPPORTED';
      reason = `Document type "${doc.document_type || analysis.document_type}" not supported for extraction`;
    } else if (isHistoricalTest) {
      classification = 'HISTORICAL_TEST';
      reason = `Old test document (>30 days, test/sample in name or no business)`;
    } else if (doc.business_id && doc.profile_id) {
      classification = 'RECOVERABLE_CURRENT';
      reason = 'Current client document with business context — safe to reprocess';
    } else {
      classification = 'UNKNOWN';
      reason = 'Does not match any classification criteria — manual review needed';
    }

    items.push({
      analysis_id: analysis.id,
      document_id: doc.id,
      document_name: doc.name,
      document_type: doc.document_type || analysis.document_type,
      business_id: doc.business_id || analysis.business_id,
      profile_id: doc.profile_id || analysis.profile_id,
      created_at: analysis.created_at,
      classification,
      reason,
    });
  }

  return items;
}

// ── Shared Extraction Helpers ──────────────────────────────────────────────
// Used by both guestSessionService (anonymous) and runExtraction (authenticated)
// for AI extraction. These helpers build the JSON schema for
// ExtractDataFromUploadedFile and normalize the raw output — reusing
// EXTRACTION_SCHEMAS, parseCurrency, and parsePercentage from the same engine.
// One extraction architecture, two authorization/storage mechanisms.

/**
 * buildExtractionSchema — builds the JSON schema for ExtractDataFromUploadedFile.
 * Includes a reporting_period field plus all fields from the document type's schema.
 * Returns null for unsupported document types.
 */
export function buildExtractionSchema(documentType: string): object | null {
  const schema = EXTRACTION_SCHEMAS[documentType];
  if (!schema) return null;

  const properties: Record<string, { type: string; description: string }> = {
    reporting_period: {
      type: 'string',
      description: 'The reporting period or fiscal year covered by this document (e.g. "2025", "Jan 2025 - Dec 2025", "Fiscal Year 2024")',
    },
  };

  for (const field of schema.fields) {
    properties[field.name] = {
      type: 'string',
      description: field.label,
    };
  }

  return { type: 'object', properties };
}

export interface GuestExtractionResult {
  facts: Record<string, { value: string; normalized: number | string | null; field_type: string }>;
  period: string | null;
  /** 6D.0 additive — the provider's own confidence per field, when it reports one. */
  fieldConfidence?: Record<string, any>;
  periodRaw?: string | null;
  fieldsFound: number;
  success: boolean;
  error?: string;
}

/**
 * normalizeExtraction — normalizes raw ExtractDataFromUploadedFile output
 * into structured facts using the same parseCurrency/parsePercentage parsers.
 * Returns { facts, period, fieldsFound, success }.
 */
export function normalizeExtraction(documentType: string, rawOutput: any): GuestExtractionResult {
  const schema = EXTRACTION_SCHEMAS[documentType];
  if (!schema) {
    return { facts: {}, period: null, fieldsFound: 0, success: false, error: `Unsupported document type: ${documentType}` };
  }

  // ExtractDataFromUploadedFile returns { output: dict | list[dict] | null }
  const data = Array.isArray(rawOutput) ? rawOutput[0] : rawOutput;
  if (!data || typeof data !== 'object') {
    return { facts: {}, period: null, fieldsFound: 0, success: false, error: 'No data extracted from document' };
  }

  const facts: Record<string, { value: string; normalized: number | string | null; field_type: string }> = {};
  const fieldConfidence: Record<string, any> = {};
  let period: string | null = null;
  let fieldsFound = 0;

  // Extract reporting period
  if (data.reporting_period && typeof data.reporting_period === 'string') {
    period = data.reporting_period.trim();
  }

  // Normalize each field from the schema.
  // 6D.0: a field may arrive as a bare value or as { value, confidence }. The
  // provider's confidence is preserved when present and NEVER invented when absent.
  for (const field of schema.fields) {
    const rawValue = data[field.name];
    if (rawValue == null || rawValue === '') continue;

    const isObject = typeof rawValue === 'object';
    const effective = isObject ? (rawValue.value ?? rawValue.normalized) : rawValue;
    if (effective == null || effective === '') continue;

    const strValue = String(effective).trim();
    if (!strValue) continue;

    let normalized: number | string | null = null;
    if (field.type === 'currency') {
      normalized = parseCurrency(strValue);
    } else if (field.type === 'percentage') {
      normalized = parsePercentage(strValue);
    } else {
      normalized = strValue;
    }

    facts[field.name] = {
      value: strValue,
      normalized,
      field_type: field.type,
    };

    const reported = isObject
      ? (rawValue.confidence ?? rawValue.confidence_score ?? null)
      : (data.field_confidence ? data.field_confidence[field.name] : null);
    if (reported != null) fieldConfidence[field.name] = reported;

    fieldsFound++;
  }

  if (fieldsFound === 0) {
    return { facts: {}, period: null, fieldConfidence, periodRaw: period, fieldsFound: 0, success: false, error: 'No fields could be extracted from the document' };
  }

  return { facts, period, fieldConfidence, periodRaw: period, fieldsFound, success: true };
}

// ── THE CANONICAL EXTRACTION OUTCOME CONTRACT (6D.0c §2) ────────────────────
/**
 * THE TYPED OUTCOME.
 *
 * `success:false` must never be readable as a completed extraction. Rather than
 * letting every caller re-interpret the same flags, the engine itself names which
 * of three things happened, and the ingestion worker HONOURS that value.
 *
 *   success            the run executed, persisted, and reached a reviewable
 *                      terminal state. A reader that legitimately recognizes zero
 *                      fields is not a failure of THIS contract — see below.
 *   retryable_failure  another attempt can change the outcome (transport, timeout,
 *                      rate limit, a canonical state the worker must repair).
 *   permanent_failure  a retry cannot help: no reader for the type, an
 *                      unresolvable source, a misconfigured worker, or a provider
 *                      that ran and recognized nothing. `no_fields_extracted` is
 *                      permanent because re-reading the same bytes would recognize
 *                      nothing again — and it is DISTINCT from "never executed",
 *                      which leaves no attempt record at all.
 *
 * A refusal the run reported without classifying — and any unknown state — maps to
 * RETRYABLE, because the bounded retry budget is the safe direction: it can only
 * end in a truthful terminal failure, never in a false completion.
 */
export type ExtractionOutcome = 'success' | 'retryable_failure' | 'permanent_failure';

export function classifyExtractionOutcome(result: any): ExtractionOutcome {
  if (!result) return 'retryable_failure';
  if (result.success === true) return 'success';

  const cls = result.errorClass ?? null;
  if (result.finalStatus === 'unsupported') return 'permanent_failure';
  if (
    cls === 'unsupported_type'
    || cls === 'source_unresolvable'
    || cls === 'source_missing'
    || cls === 'configuration'
    || cls === 'no_fields_extracted'
    || cls === 'permanent'
  ) return 'permanent_failure';

  return 'retryable_failure';
}

export interface ExtractionOutcomeResult extends ExtractionResult {
  outcome: ExtractionOutcome;
}

/**
 * runExtraction — the single certified extraction function.
 *
 * Behaviour is unchanged; the typed outcome is attached by ONE wrapper, so no
 * caller anywhere can read `success:false` as anything but a failure.
 */
export async function runExtraction(
  sb: any,
  ctx: ExtractionContext,
  options?: { attempt?: number; base44?: any; useMock?: boolean },
): Promise<ExtractionOutcomeResult> {
  const result = await runExtractionCore(sb, ctx, options);
  return { ...result, outcome: classifyExtractionOutcome(result) };
}