/**
 * useDocumentPipelinePolling — follow a document until it reaches a state.
 *
 * WHY THIS EXISTS. Understanding and extraction run as POST-RESPONSE work (the
 * document's content read cannot be awaited inside the upload request), so a
 * document can become classified a few seconds AFTER it appears on screen. The
 * client holds no authority over that: it simply re-reads the canonical rows
 * until the pipeline states an outcome. Nothing is computed or assumed here —
 * the page only stops asking once the truth has landed.
 *
 * It is deliberately bounded: after MAX_POLLS the page stops re-reading and shows
 * whatever state the rows hold (resolveDocumentStates reports a stale run
 * honestly rather than claiming it is still working forever).
 */

import { useEffect, useRef } from 'react';
import { resolveDocumentStates, ANALYSIS_STATE } from '@/lib/documents/documentTypes';

const POLL_INTERVAL_MS = 8000;
const MAX_POLLS = 12; // ≈ 90 seconds of following, then the page stops guessing

/** Any document whose pipeline has not yet reached a state. */
export function documentsInFlight(documents = []) {
  return documents.some((doc) => {
    const states = resolveDocumentStates(doc);
    return states.analysis === ANALYSIS_STATE.PROCESSING;
  });
}

export function useDocumentPipelinePolling(documents = [], refetch) {
  const pollsRef = useRef(0);
  const inFlight = documentsInFlight(documents);

  useEffect(() => {
    if (!inFlight) pollsRef.current = 0;
  }, [inFlight]);

  useEffect(() => {
    if (!inFlight || pollsRef.current >= MAX_POLLS) return undefined;
    const timer = setTimeout(() => {
      pollsRef.current += 1;
      refetch?.();
    }, POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [inFlight, documents, refetch]);

  return inFlight;
}