/**
 * VISION document storage policy — Phase S3.1
 *
 * ONE authoritative answer to:
 *
 *   "Is this persisted storage bucket an approved VISION document bucket?"
 *
 * THE APPROVED SET is the reviewed S2 production Storage inventory — the three
 * private buckets the containment migration asserts exist and remain private
 * (see src/supabase/migrations/phase_s2_storage_containment.sql):
 *
 *   documents                 — client / Data Room documents
 *   client-documents          — client document storage
 *   consulting_library_files  — the consulting library
 *
 * The legacy two-bucket list that lived inside getDocumentsAdmin omitted
 * `client-documents`; it is retired in favour of this module so the document
 * path has exactly ONE bucket vocabulary. That function now imports this policy
 * rather than declaring its own list.
 *
 * ONE RESPONSIBILITY ONLY. This module holds the vocabulary and answers the
 * question above. It contains NO authorization logic, performs NO I/O, never
 * touches Supabase or Storage, never mints a URL and never looks a document up.
 * A caller authorizes the document FIRST, and only then asks whether the
 * document's persisted bucket is approved.
 *
 * FAIL CLOSED: an absent, empty, whitespace, non-string or unrecognized bucket
 * is NOT approved. There is no default bucket and no implicit fallback — a
 * caller must never guess where an object lives or search other buckets for it.
 */

/** The approved private document buckets. The SINGLE source of this vocabulary. */
export const APPROVED_DOCUMENT_BUCKETS: string[] = [
  'documents',
  'client-documents',
  'consulting_library_files',
];

/**
 * isApprovedDocumentBucket — true only for an EXACT approved bucket id.
 *
 * Anything else (missing, null, undefined, '', whitespace, unknown name) is
 * false, so every caller fails closed rather than defaulting to a bucket.
 */
export function isApprovedDocumentBucket(bucket: any): boolean {
  return typeof bucket === 'string' && APPROVED_DOCUMENT_BUCKETS.includes(bucket);
}