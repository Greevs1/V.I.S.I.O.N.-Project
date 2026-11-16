/**
 * VISION 6D.0b — CLASSIFICATION PERSISTENCE.
 *
 * THE OWNERSHIP CONTRACT (Phase 2), implemented here and nowhere else:
 *
 *   DocumentClassification           canonical DECISION + provenance + lifecycle
 *   documents.document_type          ACTIVE APPLIED operational type
 *   documents.system_folder          ACTIVE organization metadata
 *   EXTRACTION_SCHEMAS               reader capability (never restated)
 *
 * Every applied type is traceable to the decision that produced it: the decision
 * row is written FIRST, then the operational field is applied, and the full
 * contract is recorded on the analysis row
 * (`document_analysis.extracted_data.classification` — existing jsonb, so NO
 * migration is needed for the contract).
 *
 * WHAT THIS MODULE MAY NEVER DO:
 *   · change business_id, document_scope, ownership, tenant or access grants
 *     (Decision 3 — classification is not an authorization mechanism);
 *   · create or move a storage object (no duplicate object, ever);
 *   · write business_facts / business_fact_evidence (6D.1 owns fact promotion);
 *   · overwrite a human correction (an override stays authoritative).
 */

import { folderFor, familyOf, labelFor, labelForSubtype } from './taxonomy.ts';
import { toPersistedContract, type ClassificationResult } from './contract.ts';

/** The document patch keys this module is allowed to write. Asserted by tests. */
export const ALLOWED_DOCUMENT_PATCH_KEYS = ['document_type', 'system_folder', 'year', 'upload_status', 'updated_at'];

export function buildDocumentPatch(result: ClassificationResult, currentDocument: any): Record<string, any> {
  const now = new Date().toISOString();
  const patch: Record<string, any> = { updated_at: now };

  // The applied operational type. The decision row has already recorded it.
  // An UNRESOLVED classification never overwrites a type the row already names:
  // 'other' is written only where there was no type at all.
  const hasExistingType = !!(currentDocument && currentDocument.document_type
    && currentDocument.document_type !== 'other');
  if (result.applied_document_type !== 'other' || !hasExistingType) {
    patch.document_type = result.applied_document_type;
  }

  if (result.applied_folder) patch.system_folder = result.applied_folder;

  // A year the document stated is recorded only when the row has none — an
  // existing value is never overwritten by classification (M10 guards the loss).
  if (result.tax_year && !(currentDocument && currentDocument.year)) patch.year = result.tax_year;

  // Truthful, INDEPENDENT states (Phase 18). A stored document whose
  // classification is unresolved or whose reader is absent is UPLOADED — only a
  // document that genuinely awaits a human decision reads as needing review.
  // A generic upload failure is never one of these states.
  if (result.route_extraction) {
    // Extraction runs next and owns the upload status; classification does not
    // claim a state it did not reach.
  } else if (result.confidence_band === 'medium') {
    // A SCOPE MISMATCH IS NOT A REVIEW STATE (6D.0c.3 automatic relevant-evidence
    // policy). A personal document uploaded in business context is stored, read, and
    // assessed field by field — it never waits in "needs review" merely because the
    // business was active. Only a genuinely undecided CLASSIFICATION asks a human.
    patch.upload_status = 'needs_review';
  } else {
    patch.upload_status = 'uploaded';
  }

  return patch;
}

function humanSummary(result: ClassificationResult): string {
  const label = labelFor(result.document_type);
  const sub = labelForSubtype(result.document_subtype);
  const what = sub ? `${label} (${sub})` : label;
  if (result.scope_mismatch) {
    return `Recognized as ${what}. It is stored as its own kind of document and has not been moved; information genuinely about the business in view is used as document evidence.`;
  }
  if (result.document_type === 'other') {
    return 'VISION could not determine what this document is yet.';
  }
  if (!result.reader_supported) {
    return `Recognized as ${what}. Analysis is not yet supported for this document type.`;
  }
  if (result.confidence_band === 'high') return `Recognized as ${what} and analyzed automatically.`;
  return `This looks like ${what}. Please confirm.`;
}

/**
 * The lifecycle half: ONE DocumentClassification row per document, updated in
 * place with the previous decision PRESERVED inside `reasoning` (history is
 * never destroyed — Decision 1 / Phase 16).
 */
export function buildDecisionPayload(args: {
  result: ClassificationResult;
  documentId: string;
  documentName: string;
  profileId: string;
  businessId: string | null;
  existing: any | null;
}): Record<string, any> {
  const { result, existing } = args;
  const now = new Date().toISOString();
  const source = result.classification_method === 'declared_explicit' ? 'user_manual' : 'galileo_auto';

  const evidenceText = result.classification_evidence.length
    ? `evidence: ${result.classification_evidence.join('; ')}`
    : 'evidence: none';

  let lineage = '';
  if (existing && (existing.document_type !== result.document_type
    || existing.classification_source !== source
    || existing.classification_status !== result.decision_status)) {
    lineage = ` | prior: ${JSON.stringify({
      document_type: existing.document_type || null,
      document_subtype: existing.document_subtype || null,
      classification_status: existing.classification_status || null,
      classification_source: existing.classification_source || null,
      confidence_score: existing.confidence_score ?? null,
      at: existing.updated_date || existing.created_date || null,
    })}`;
  }

  return {
    document_id: args.documentId,
    document_name: args.documentName,
    profile_id: args.profileId,
    business_id: args.businessId,
    suggested_folder: result.suggested_folder,
    applied_folder: result.applied_folder,
    confidence_score: result.classification_confidence,
    classification_status: result.decision_status,
    classification_source: source,
    reasoning: `${humanSummary(result)} | ${evidenceText} | method: ${result.classification_method}${lineage}`,
    document_type: result.document_type,
    extracted_keywords: result.classification_evidence.slice(0, 20),
    tax_year: result.tax_year ? String(result.tax_year) : null,
    original_folder: (existing && existing.original_folder) || 'inbox',
    filed_at: result.applied_folder ? now : null,
  };
}

export interface PersistArgs {
  sb: any;
  base44: any;
  result: ClassificationResult;
  documentId: string;
  documentName: string;
  profileId: string;
  businessId: string | null;
  currentDocument?: any;
  existingDecision?: any;
}

export interface PersistOutcome {
  skipped: string | null;
  applied_type: string | null;
  folder: string | null;
  analysis_status: string | null;
  classification_status: string | null;
  document_patch_keys: string[];
  /** A rejected applied-type write is reported, never swallowed. */
  documents_write_error: string | null;
}

/**
 * THE DOCUMENTS TABLE IS THE AUTHORITY ON ITS OWN COLUMNS.
 *
 * A real production upload proved the cost of assuming otherwise: the patch
 * named `system_folder`, the live table does not hold that column, the database
 * rejected the WHOLE patch, and supabase-js reported that rejection in `error`
 * instead of throwing — so a correctly classified document silently kept
 * `other`, reader routing read the stale type and extraction declined.
 *
 * The optional columns are therefore probed, and only what the table can hold is
 * written. The operational half of the contract (`document_type`) is never
 * optional: that is what reader routing reads.
 */
export function optionalDocumentColumns(): string[] {
  return ['system_folder'];
}

export async function writableDocumentColumns(sb: any, keys: string[]): Promise<string[]> {
  const required = keys.filter((k) => !optionalDocumentColumns().includes(k));
  const optional = keys.filter((k) => optionalDocumentColumns().includes(k));
  const writable = [...required];
  for (const name of optional) {
    try {
      const probe = await sb.from('documents').select(name).limit(0);
      // Anything other than a clean probe means the column is not provably
      // there, and an unprovable optional column must never cost the patch.
      if (probe && !probe.error) writable.push(name);
    } catch {
      // A client that cannot express the probe cannot prove the column either.
    }
  }
  return writable;
}

export async function persistUnderstanding(args: PersistArgs): Promise<PersistOutcome> {
  const { sb, base44, result } = args;
  const now = new Date().toISOString();
  const existing = args.existingDecision || null;

  // A HUMAN CORRECTION IS AUTHORITATIVE (Phase 16). The machine never overwrites
  // it and never erases its provenance: the observation is recorded on the
  // analysis row only, and the applied type is left exactly as the human set it.
  const humanOwned = !!existing && existing.classification_status === 'overridden';

  const analysisRow = await sb
    .from('document_analysis')
    .select('id, extracted_data, document_type')
    .eq('document_id', args.documentId)
    .maybeSingle()
    .then((r: any) => r?.data || null)
    .catch(() => null);

  if (analysisRow?.id) {
    const prior = (analysisRow.extracted_data && typeof analysisRow.extracted_data === 'object')
      ? analysisRow.extracted_data : {};
    const patch: Record<string, any> = {
      extracted_data: {
        ...prior,
        classification: {
          ...toPersistedContract(result),
          persistence: humanOwned ? 'skipped_human_override' : 'applied',
        },
      },
      updated_at: now,
    };

    // ── TYPE SYNCHRONIZATION (6D.0c §8) ─────────────────────────────────────
    // The analysis snapshot follows the AUTHORITATIVE applied type on every path,
    // not only the routed one. A classification-only path used to leave this row
    // on a stale `other`, and the stale analysis type is precisely what a later
    // reader selection could read instead of the canonical applied type.
    if (!humanOwned && result.applied_document_type !== 'other') {
      patch.document_type = result.applied_document_type;
    }

    if (humanOwned) {
      // Nothing operational changes; the classification observation is still
      // recorded so the history shows what the machine saw.
    } else if (result.route_extraction) {
      // Extraction owns the analysis STATE next — the ingestion worker's own
      // documented handoff writes it. The applied type is already synced above.
    } else if (result.applied_document_type !== 'other' && !result.reader_supported) {
      patch.analysis_status = 'unsupported';
      patch.status = 'unsupported';
      patch.extracted_summary = humanSummary(result);
    } else if (result.requires_confirmation) {
      patch.analysis_status = 'needs_review';
      patch.status = 'needs_review';
      patch.extracted_summary = humanSummary(result);
      // SCOPE CONFIRMATION IS RETIRED (6D.0c.3 automatic relevant-evidence policy).
      // `scope_confirmation_required` is no longer produced anywhere: the only review
      // reason a scope mismatch could create has no product meaning left, because a
      // scope mismatch now influences ELIGIBILITY rather than pausing extraction. The
      // single remaining review reason is the CLASSIFICATION being undecided.
      patch.extracted_data.classification.review_reason = 'classification_confirmation_required';
    } else {
      patch.analysis_status = 'pending_analysis';
      patch.status = 'pending_analysis';
      patch.extracted_summary = humanSummary(result);
    }

    await sb.from('document_analysis').update(patch).eq('id', analysisRow.id);
  }

  if (humanOwned) {
    return {
      skipped: 'human_override',
      applied_type: args.currentDocument?.document_type || null,
      folder: args.currentDocument?.system_folder || null,
      analysis_status: null,
      classification_status: existing?.classification_status || null,
      document_patch_keys: [],
    };
  }

  // ── The canonical DECISION, then the APPLIED operational fields ───────────
  const payload = buildDecisionPayload({
    result,
    documentId: args.documentId,
    documentName: args.documentName,
    profileId: args.profileId,
    businessId: args.businessId,
    existing,
  });

  const entities = base44?.asServiceRole?.entities?.DocumentClassification;
  if (entities) {
    if (existing?.id) {
      await entities.update(existing.id, payload);
    } else {
      await entities.create(payload);
    }
  }

  const docPatch = buildDocumentPatch(result, args.currentDocument || {});
  const writable = await writableDocumentColumns(sb, Object.keys(docPatch));
  const applied: Record<string, any> = {};
  for (const key of Object.keys(docPatch)) {
    if (writable.includes(key)) applied[key] = docPatch[key];
  }

  // The applied operational type must LAND: it is what reader routing and every
  // surface read. A rejected write is reported in the outcome rather than
  // assumed to have succeeded.
  let documentsWriteError: string | null = null;
  if (Object.keys(applied).length) {
    const { error } = await sb.from('documents').update(applied).eq('id', args.documentId);
    documentsWriteError = error ? String(error.message || error) : null;
  }

  return {
    skipped: null,
    applied_type: applied.document_type || null,
    folder: applied.system_folder || null,
    analysis_status: result.route_extraction ? null : (applied.upload_status || null),
    classification_status: payload.classification_status,
    document_patch_keys: Object.keys(applied),
    documents_write_error: documentsWriteError,
  };
}

export { folderFor, familyOf };