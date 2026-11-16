/**
 * VISION document-type vocabulary — the backend's ONE canonical answer to:
 *
 *   "Is this a document type VISION can store, and does a reader exist for it?"
 *
 * WHY THIS MODULE EXISTS
 *   The uploader used to default every file to 'other' while the backend carried
 *   its own private copy of the same list. Two lists that must agree but are not
 *   derived from each other is exactly how a UI comes to promise an analysis no
 *   reader can deliver. Here the readable set is DERIVED from the extraction
 *   engine's own schema map, so there is no second statement of truth.
 *
 * NO RESPONSIBILITY BEYOND THE VOCABULARY. No authorization, no I/O, no database
 * access, no storage, no status writes. A caller authorizes FIRST and asks this
 * module what a type means afterwards.
 *
 * NO MIGRATION. Every value here already exists in the live
 * `documents.document_type` column and the neutral bucket stays 'other', so no new
 * vocabulary and no schema change is introduced.
 */

import { EXTRACTION_SCHEMAS } from '../documentExtraction/extractEngine.ts';

/**
 * STORABLE — everything the Data Room may accept as a repository document.
 * A type with no reader is still STORED: VISION simply does not claim it can
 * analyze it. Storage and analysis are separate facts.
 */
export const STORABLE_DOCUMENT_TYPES: string[] = [
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
];

/**
 * The neutral bucket — "no type was determined yet". This is the value the future
 * automatic classifier (6D.0b) replaces with the type it determines; until then it
 * is the honest record of an upload whose type was never stated.
 */
export const UNCLASSIFIED_DOCUMENT_TYPE = 'other';

/** Values that mean "not classified" rather than a named document type. */
export const UNCLASSIFIED_DOCUMENT_TYPES: string[] = ['other', 'unknown', ''];

/**
 * READABLE — derived from the engine's schemas, never restated here. A type is
 * readable if and only if EXTRACTION_SCHEMAS has a reader for it.
 */
export const READABLE_DOCUMENT_TYPES: string[] = Object.keys(EXTRACTION_SCHEMAS);

/**
 * normalizeDocumentType — the client's choice is normalized, never trusted.
 *
 * An unknown, empty or non-string value becomes the neutral bucket, which no
 * reader claims to read. It can therefore never reach a parser, and it can never
 * be mistaken for a named type.
 */
export function normalizeDocumentType(raw: unknown): string {
  const v = typeof raw === 'string' ? raw.trim() : '';
  return STORABLE_DOCUMENT_TYPES.includes(v) ? v : UNCLASSIFIED_DOCUMENT_TYPE;
}

/** True only when a reader actually exists for this (normalized) type. */
export function isReadableDocumentType(raw: unknown): boolean {
  return READABLE_DOCUMENT_TYPES.includes(normalizeDocumentType(raw));
}

/** True when the value means "not classified" rather than a named type. */
export function isUnclassifiedDocumentType(raw: unknown): boolean {
  const v = typeof raw === 'string' ? raw.trim() : '';
  return UNCLASSIFIED_DOCUMENT_TYPES.includes(v);
}