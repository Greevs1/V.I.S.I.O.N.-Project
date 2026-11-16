/**
 * VISION 6D.0b — THE INGESTION ORCHESTRATOR.
 *
 *   AUTHORIZED DOCUMENT → UNDERSTANDING → DECISION → APPLIED TYPE →
 *   READER ROUTING → EXTRACTION → REVIEW → (6D.0a semantic bridge)
 *
 * ONE orchestration for the canonical upload path. It does not authorize, does
 * not store objects, does not extract, and does not write facts — it decides
 * what the document IS and whether its reader may run, then hands control back
 * to the caller's existing extraction step.
 *
 * FAILURE POSTURE (Phase 18/19 — D42):
 *   classification failure  → upload SUCCEEDS, document awaits classification
 *   unsupported reader      → upload SUCCEEDS, document recognized, not analyzed
 *   scope mismatch          → upload SUCCEEDS, recognized, awaiting destination
 *   anything unexpected     → the caller's legacy behavior is preserved exactly
 *                             (`route_extraction: true`), because a defect in the
 *                             new layer must never block a document from being
 *                             analyzed the way it was before this phase.
 */

import { understandDocument, type UnderstandInput } from './understandDocument.ts';
import { persistUnderstanding } from './persist.ts';

export interface IngestionArgs extends UnderstandInput {
  sb: any;
  documentName?: string;
  profileId: string;
  currentDocument?: any;
}

export interface IngestionOutcome {
  ok: boolean;
  result: any | null;
  persisted: any | null;
  route_extraction: boolean;
  error?: string;
}

/** The one existing decision for this document, if any (never a new store). */
async function loadExistingDecision(base44: any, documentId: string): Promise<any | null> {
  const entities = base44?.asServiceRole?.entities?.DocumentClassification;
  if (!entities || typeof entities.filter !== 'function') return null;
  try {
    const rows = await entities.filter({ document_id: documentId });
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch {
    return null;
  }
}

export async function runIngestionUnderstanding(args: IngestionArgs): Promise<IngestionOutcome> {
  try {
    const existing = await loadExistingDecision(args.base44, args.documentId);

    const result = await understandDocument({
      base44: args.base44,
      documentId: args.documentId,
      documentName: args.documentName,
      fileName: args.fileName,
      mimeType: args.mimeType ?? null,
      declaredType: args.declaredType ?? null,
      signedUrl: args.signedUrl ?? null,
      base64: args.base64 ?? null,
      businessId: args.businessId ?? null,
      candidateBusinesses: args.candidateBusinesses,
    });

    let persisted: any = null;
    try {
      persisted = await persistUnderstanding({
        sb: args.sb,
        base44: args.base44,
        result,
        documentId: args.documentId,
        documentName: args.documentName || args.fileName,
        profileId: args.profileId,
        businessId: args.businessId ?? null,
        currentDocument: args.currentDocument,
        existingDecision: existing,
      });
    } catch (persistErr: any) {
      // The decision was made but not recorded. It is NOT applied as if it had
      // been: without a persisted decision the caller keeps its legacy behavior.
      return {
        ok: true,
        result,
        persisted: null,
        route_extraction: true, // legacy path — extraction still runs as before
        error: `persistence_failed: ${String(persistErr?.message || persistErr)}`,
      };
    }

    // A human correction is never re-routed over by the machine.
    const routeExtraction = result.route_extraction && persisted?.skipped !== 'human_override';

    return { ok: true, result, persisted, route_extraction: !!routeExtraction };
  } catch (err: any) {
    // A DEFECT IN THIS LAYER MUST NEVER BLOCK AN UPLOAD. The caller's legacy
    // path is preserved exactly (D25/D26/D42).
    return {
      ok: false,
      result: null,
      persisted: null,
      route_extraction: true,
      error: String(err?.message || err),
    };
  }
}