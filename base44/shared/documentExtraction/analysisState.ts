/**
 * Phase 6D.0 — ANALYSIS STATE PERSISTENCE
 *
 * The ONE writer of document_analysis status/error state and of
 * documents.upload_status, so retry history, source availability and failure
 * classes are recorded consistently instead of being spelled out at each site.
 *
 * Two rules are enforced here:
 *
 *   1. `extracted_data` is MERGED, never replaced — a later write cannot erase the
 *      retry history or the source-availability evidence an earlier write recorded.
 *   2. The internal error detail is kept SERVER-SIDE, truncated. An owner-facing
 *      summary is a separate, human string; a storage or database error is never
 *      returned raw.
 *
 * Uses the injected service-role client only. Contains no authorization logic.
 */

import type { ExtractionFailureClass } from './extractionConfidence.ts';

/** How many extracted observations currently exist for an analysis. */
export async function countExtractedFields(sb: any, documentAnalysisId: string): Promise<number> {
  const { count } = await sb
    .from('extracted_fields')
    .select('id', { count: 'exact', head: true })
    .eq('document_analysis_id', documentAnalysisId);
  return count || 0;
}

/** Where the document stands, as its owner sees it. */
export async function setDocumentUploadStatus(sb: any, documentId: string, status: string, now: string) {
  await sb.from('documents').update({ upload_status: status, updated_at: now }).eq('id', documentId);
}

export async function markAnalysis(
  sb: any,
  documentAnalysisId: string,
  opts: {
    status: string;
    summary?: string;
    errorClass?: ExtractionFailureClass | null;
    error?: string | null;
    extra?: Record<string, any>;
    prior?: any;
  }
) {
  const { status, summary, errorClass = null, error = null, extra = {}, prior = {} } = opts;
  const now = new Date().toISOString();
  const priorRetry = (prior && typeof prior === 'object' && prior._retry_info) || {};
  // The attempt number travels inside `extra` on every call site, so the retry
  // history in _retry_info stays complete without a second parameter.
  const attempt = extra && typeof extra === 'object' && extra.attempt != null
    ? extra.attempt
    : (priorRetry.attempt ?? null);

  return sb.from('document_analysis').update({
    analysis_status: status,
    status,
    ...(summary !== undefined ? { extracted_summary: summary } : {}),
    extracted_data: {
      ...(prior && typeof prior === 'object' ? prior : {}),
      ...extra,
      _retry_info: {
        ...priorRetry,
        attempt,
        last_error_class: errorClass,
        last_attempt_at: now,
        // Only a FINISHED analysis counts as a success. An 'unsupported' type was
        // never attempted, so it is neither a success nor a failure of the
        // document — recording it as a success would claim an analysis that did
        // not happen.
        succeeded: status === 'completed' || status === 'needs_review',
        ...(error ? { error: String(error).slice(0, 300) } : {}),
      },
    },
    updated_at: now,
  }).eq('id', documentAnalysisId);
}