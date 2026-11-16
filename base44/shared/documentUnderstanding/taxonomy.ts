/**
 * VISION 6D.0b — DOCUMENT UNDERSTANDING TAXONOMY.
 *
 * FOUR SEPARATE CONCEPTS, NEVER OVERLOADED:
 *
 *   FILE FORMAT   pdf / xlsx / csv / docx / jpg / png ...   (how it is stored)
 *   FAMILY        tax / financial_statement / payroll / ... (what domain it is)
 *   TYPE          personal_tax_return / profit_and_loss ... (operational type)
 *   SUBTYPE       form_1040 / form_1120s / w2 ...           (the exact form)
 *
 * `document_type` is NOT a file format and NOT a subtype.
 *
 * READER CAPABILITY IS NOT RESTATED HERE. A type is readable if and only if the
 * ONE extraction engine (EXTRACTION_SCHEMAS) has a reader for it. Two reader
 * maps would be two truths — the defect this phase exists to end.
 *
 * NO MIGRATION. Every base type already exists in the live
 * `documents.document_type` column. The five recognized-but-unreadable types
 * below (w2, form_1099, schedule_c, schedule_e, k1) are a VOCABULARY EXTENSION
 * approved in Phase 3, so a recognized W-2 keeps its identity instead of
 * collapsing into 'other'. A subtype never implies a reader.
 */

import { EXTRACTION_SCHEMAS } from '../documentExtraction/extractEngine.ts';

/** How the bytes are stored. Never a document type. */
export const FILE_FORMATS: string[] = [
  'pdf', 'xlsx', 'xls', 'csv', 'docx', 'doc', 'txt', 'json', 'xml', 'png', 'jpg', 'jpeg', 'webp', 'unknown',
];

/** The document domains VISION reasons about. */
export const DOCUMENT_FAMILIES: string[] = [
  'tax', 'financial_statement', 'payroll', 'banking', 'legal', 'insurance', 'operations', 'other',
];

/**
 * STORABLE TYPES — the operational vocabulary of `documents.document_type`.
 * The first eleven are the pre-existing vocabulary; the last five are the
 * Phase-3 approved extension for recognized forms with no reader yet.
 */
export const STORABLE_TYPES: string[] = [
  'profit_and_loss',
  'balance_sheet',
  'business_tax_return',
  'personal_tax_return',
  'debt_schedule',
  'payroll_report',
  'insurance_document',
  'entity_document',
  'buy_sell_agreement',
  'estate_document',
  'other',
  // Phase 3 recognized-but-unreadable extension — identity preserved.
  'w2',
  'form_1099',
  'schedule_c',
  'schedule_e',
  'k1',
];

export const UNCLASSIFIED_TYPE = 'other';

export const TYPE_LABELS: Record<string, string> = {
  profit_and_loss: 'Profit & Loss',
  balance_sheet: 'Balance Sheet',
  business_tax_return: 'Business Tax Return',
  personal_tax_return: 'Personal Tax Return',
  debt_schedule: 'Debt Schedule',
  payroll_report: 'Payroll Report',
  insurance_document: 'Insurance Document',
  entity_document: 'Entity Document',
  buy_sell_agreement: 'Buy-Sell Agreement',
  estate_document: 'Estate Document',
  w2: 'W-2',
  form_1099: '1099',
  schedule_c: 'Schedule C',
  schedule_e: 'Schedule E',
  k1: 'Schedule K-1',
  other: 'Unclassified',
};

/** TYPE → FAMILY. One statement, used by classification and by filing. */
export const TYPE_FAMILY: Record<string, string> = {
  personal_tax_return: 'tax',
  business_tax_return: 'tax',
  schedule_c: 'tax',
  schedule_e: 'tax',
  k1: 'tax',
  w2: 'tax',
  form_1099: 'tax',
  profit_and_loss: 'financial_statement',
  balance_sheet: 'financial_statement',
  payroll_report: 'payroll',
  debt_schedule: 'banking',
  insurance_document: 'insurance',
  entity_document: 'legal',
  buy_sell_agreement: 'legal',
  estate_document: 'legal',
  other: 'other',
};

/**
 * SUBTYPES — the exact form. A subtype is recognition, not capability: a
 * subtype with no reader is still reported truthfully (Phase 12).
 */
export const SUBTYPE_LABELS: Record<string, string> = {
  form_1040: 'Form 1040',
  form_1040_sr: 'Form 1040-SR',
  form_1120: 'Form 1120',
  form_1120s: 'Form 1120-S',
  form_1065: 'Form 1065',
  schedule_c: 'Schedule C',
  schedule_e: 'Schedule E',
  k1: 'Schedule K-1',
  w2: 'Form W-2',
  form_1099: 'Form 1099',
  form_1099_nec: 'Form 1099-NEC',
  form_1099_int: 'Form 1099-INT',
  form_1099_misc: 'Form 1099-MISC',
  form_1099_div: 'Form 1099-DIV',
  form_1099_r: 'Form 1099-R',
  form_1099_b: 'Form 1099-B',
  form_1099_k: 'Form 1099-K',
  form_1099_ssa: 'Form 1099-SSA',
};

/** SUBTYPE → its parent TYPE. A subtype can never be invented for a type. */
export const SUBTYPE_PARENT: Record<string, string> = {
  form_1040: 'personal_tax_return',
  form_1040_sr: 'personal_tax_return',
  form_1120: 'business_tax_return',
  form_1120s: 'business_tax_return',
  form_1065: 'business_tax_return',
  schedule_c: 'schedule_c',
  schedule_e: 'schedule_e',
  k1: 'k1',
  w2: 'w2',
  form_1099: 'form_1099',
  form_1099_nec: 'form_1099',
  form_1099_int: 'form_1099',
  form_1099_misc: 'form_1099',
  form_1099_div: 'form_1099',
  form_1099_r: 'form_1099',
  form_1099_b: 'form_1099',
  form_1099_k: 'form_1099',
  form_1099_ssa: 'form_1099',
};

/**
 * READABLE TYPES — derived from the ONE extraction engine, never restated.
 */
export const READABLE_TYPES: string[] = Object.keys(EXTRACTION_SCHEMAS);

/**
 * CANONICAL FOLDERS — existing SYSTEM_FOLDERS ids only (Phase 15). No new
 * folder vocabulary is introduced. `debt_schedule` has no dedicated folder, so
 * it uses the closest existing canonical folder and the debt is documented
 * rather than a new folder invented.
 */
export const CANONICAL_FOLDER_BY_TYPE: Record<string, string> = {
  personal_tax_return: 'tax_returns',
  business_tax_return: 'tax_returns',
  schedule_c: 'tax_returns',
  schedule_e: 'tax_returns',
  k1: 'tax_returns',
  w2: 'tax_returns',
  form_1099: 'tax_returns',
  profit_and_loss: 'profit_loss',
  balance_sheet: 'balance_sheets',
  payroll_report: 'payroll',
  debt_schedule: 'financial_statements',
  insurance_document: 'insurance',
  entity_document: 'legal',
  buy_sell_agreement: 'legal',
  estate_document: 'estate_planning',
  other: 'other',
};

/** Families that have an existing canonical folder even without a canonical type. */
export const CANONICAL_FOLDER_BY_FAMILY: Record<string, string> = {
  banking: 'banking',
  tax: 'tax_returns',
  financial_statement: 'financial_statements',
  payroll: 'payroll',
  legal: 'legal',
  insurance: 'insurance',
  operations: 'operations',
};

export function isKnownType(raw: unknown): boolean {
  return typeof raw === 'string' && STORABLE_TYPES.includes(raw.trim());
}

export function isKnownSubtype(raw: unknown): boolean {
  return typeof raw === 'string' && Object.prototype.hasOwnProperty.call(SUBTYPE_PARENT, raw.trim());
}

/** A subtype is only valid for its parent type — an invented pair is refused. */
export function subtypeBelongsTo(type: unknown, subtype: unknown): boolean {
  if (!isKnownSubtype(subtype)) return false;
  return SUBTYPE_PARENT[String(subtype).trim()] === String(type || '').trim();
}

export function familyOf(type: unknown): string {
  return TYPE_FAMILY[String(type || '').trim()] || 'other';
}

/** reader_key — the ONE router (Phase 13). The type IS the reader key. */
export function resolveReaderKey(type: unknown): string | null {
  const t = typeof type === 'string' ? type.trim() : '';
  return EXTRACTION_SCHEMAS[t] ? t : null;
}

/** reader_supported — from the extraction engine's own schema map, not a copy. */
export function isReaderSupported(type: unknown): boolean {
  return resolveReaderKey(type) !== null;
}

/** Filing metadata for a classification (Phase 15). Existing folder ids only. */
export function folderFor(type: unknown, family?: unknown): string | null {
  const t = String(type || '').trim();
  if (CANONICAL_FOLDER_BY_TYPE[t]) return CANONICAL_FOLDER_BY_TYPE[t];
  const f = String(family || TYPE_FAMILY[t] || '').trim();
  return CANONICAL_FOLDER_BY_FAMILY[f] || null;
}

export function labelFor(type: unknown): string {
  return TYPE_LABELS[String(type || '').trim()] || String(type || '').trim() || 'Unclassified';
}

export function labelForSubtype(subtype: unknown): string | null {
  const s = typeof subtype === 'string' ? subtype.trim() : '';
  return SUBTYPE_LABELS[s] || null;
}