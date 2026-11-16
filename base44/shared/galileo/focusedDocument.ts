/**
 * Phase 6D.0c — FOCUSED DOCUMENT KNOWLEDGE (shared).
 *
 * ONE server-side contract for "the owner is standing in ONE document and is
 * asking about THAT document". It exists because a focused document id used to
 * reach the model as advisory PROSE — a name inside a prompt — which meant the
 * answer was never actually grounded in the document, and any other document
 * could have stood in for it without a single check failing.
 *
 * THE GOVERNING RULE, identical to the document authorization spine:
 *   THE DOCUMENT ROW OWNS THE TENANT.
 * A client-supplied business_id never establishes authority and never pivots a
 * question into another business. If the caller's business and the document's
 * business disagree, the focus FAILS CLOSED — it does not silently adopt the
 * row's tenant to answer a question that was asked about another one.
 *
 * WHAT IT DOES NOT DO
 *   · it invents no permission model — access is decided by the canonical
 *     authorizeDocumentAccess() from ../authz/documentAccess.ts, whose business
 *     check the caller injects;
 *   · it holds no knowledge of its own — observations come from the canonical
 *     semantic-observation layer, built from THIS document's own rows;
 *   · it never sends raw document content, raw extracted_data or identifiers to
 *     a model. Only an allowlisted, PII-minimized projection leaves this module.
 *
 * NOTE — keep each type declaration and each destructured signature on ONE LINE:
 * the offline harness (src/scripts/documentKnowledgeCompletion.test.cjs) executes
 * this file's REAL source in a sandbox by stripping TS-only declaration lines, so
 * a multi-line declaration would break that strip.
 */

import { authorizeDocumentAccess } from '../authz/documentAccess.ts';
import { buildObservationLayer, observationPeriod } from '../documentObservation/semantics.ts';
// The provisional lane (§11/§14) — the extraction/review COUNTS are derived by the
// one module that derives them, so the focused surface cannot disagree with the
// general one about how much was extracted from a document.
import { deriveExtractionReviewCounts, buildReviewAction } from './provisionalEvidence.ts';
// §16 — the sensitive-field predicate is the ONE shared one (./sensitiveFields.ts):
// this module imports it rather than keeping a copy, so the focused view and the
// general evidence-first lane agree by construction.
import { isSensitiveFieldName } from './sensitiveFields.ts';

export const FOCUSED_DOCUMENT_CONTEXT_VERSION = '6d.0c.1';

/**
 * §6 — the truthful states a focused-document answer may be produced from. An
 * answer is never manufactured from another document to avoid one of these.
 */
export const FOCUSED_KNOWLEDGE_STATES = ['processing', 'needs_confirmation', 'failed', 'no_supported_fields', 'unsupported', 'available', 'unavailable'];

/** The ONLY extracted_data keys that may leave this module (§16). */
export const EXTRACTED_DATA_ALLOWLIST = ['completed_at', 'reconcile', 'field_count', 'extraction_summary', 'period_label', 'document_form', 'reader', 'unsupported_reason'];

/**
 * §16 — PII. A field whose name is recognizably an identifier is never carried
 * into model context, whatever its value. The predicate is the ONE shared one
 * (./sensitiveFields.ts), imported above; this module keeps no second copy.
 */

function numericOrNull(row: any) {
  const pick = row?.accepted_normalized_value ?? row?.accepted_value ?? row?.normalized_value ?? row?.field_value;
  if (pick == null || pick === '') return null;
  if (typeof pick === 'number') return Number.isFinite(pick) ? pick : null;
  const cleaned = String(pick).replace(/[^0-9.\-]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * minimizeExtractedData — the allowlist projection of a document's extraction
 * record. A raw extracted_data object is NEVER forwarded: only the keys named
 * above survive, and any sensitive-named key is dropped even if it appears.
 */
export function minimizeExtractedData(extractedData: any) {
  if (!extractedData || typeof extractedData !== 'object') return null;
  const out: any = {};
  for (const key of EXTRACTED_DATA_ALLOWLIST) {
    if (!Object.prototype.hasOwnProperty.call(extractedData, key)) continue;
    if (isSensitiveFieldName(key)) continue;
    const v = extractedData[key];
    if (v == null) continue;
    out[key] = typeof v === 'object' ? JSON.stringify(v).slice(0, 400) : v;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * resolveFocusedKnowledgeState — §6, in words the surface can state truthfully.
 * Confirmation outranks availability: a document that still needs a human
 * decision is REPORTED as needing one, even if earlier fields were accepted.
 */
export function resolveFocusedKnowledgeState(input: any) {
  const doc = input?.doc || null;
  const analysis = input?.analysis || null;
  const confirmedCount = Number(input?.confirmedCount || 0);
  const pendingCount = Number(input?.pendingCount || 0);

  const analysisStatus = String(analysis?.analysis_status || analysis?.status || '').toLowerCase();
  const uploadStatus = String(doc?.upload_status || '').toLowerCase();

  if (['processing', 'queued', 'pending_analysis', 'analyzing', 'waiting_retry'].includes(analysisStatus)) return 'processing';
  if (['processing', 'uploading', 'queued'].includes(uploadStatus) && !analysisStatus) return 'processing';
  if (['needs_review', 'needs_classification'].includes(analysisStatus)) return 'needs_confirmation';
  if (analysisStatus === 'failed' || uploadStatus === 'failed') return 'failed';
  if (analysisStatus === 'unsupported') return 'unsupported';
  if (confirmedCount > 0 || pendingCount > 0) return 'available';
  if (analysisStatus === 'completed') return 'no_supported_fields';
  if (uploadStatus === 'completed') return 'no_supported_fields';
  return 'processing';
}

/**
 * resolveFocusedDocument — the whole server flow, in order:
 *   canonical row read → row-derived tenant → canonical authorization →
 *   per-document state → knowledge belonging ONLY to this document.
 *
 * Returns { available: false, reason } for every failure. It never returns
 * another document's knowledge as a substitute, and it never throws for an
 * expected denial.
 */
export async function resolveFocusedDocument(input: any) {
  const sb = input?.sb;
  const focusedDocumentId = input?.focusedDocumentId || null;
  const actor = input?.actor || null;
  const callerBusinessId = input?.businessId || null;

  if (!sb || typeof sb.from !== 'function') return { available: false, reason: 'context_error' };
  if (!focusedDocumentId) return { available: false, reason: 'no_focus' };

  // ── 1. The canonical row. Identity is the ONLY thing that establishes scope.
  const { data: doc, error } = await sb
    .from('documents')
    .select('id, name, document_type, year, upload_status, business_id, profile_id, created_at')
    .eq('id', focusedDocumentId)
    .maybeSingle();
  if (error) return { available: false, reason: 'read_failed' };
  if (!doc) return { available: false, reason: 'not_found' };

  // ── 2. The canonical document authorization decides access. The tenant it is
  //       checked against is the DOCUMENT's, never the caller's.
  const auth = await authorizeDocumentAccess({
    doc,
    actor,
    operation: 'view',
    checkBusinessAccess: input?.checkBusinessAccess,
  });
  if (!auth?.authorized) return { available: false, reason: auth?.reason || 'not_authorized' };

  // ── 3. THE ROW OWNS THE TENANT. A caller whose active business disagrees with
  //       the document's does not pivot into the document's business to answer a
  //       question about another one — the focus fails closed.
  const rowBusinessId = doc.business_id || null;
  if (callerBusinessId && rowBusinessId && callerBusinessId !== rowBusinessId) {
    return { available: false, reason: 'business_mismatch' };
  }
  const effectiveBusinessId = rowBusinessId || callerBusinessId || null;

  // ── 4. State of THIS document (analysis is the canonical processing record).
  let analysis: any = null;
  try {
    const { data: analysisRows } = await sb
      .from('document_analysis')
      .select('document_id, status, analysis_status, upload_status, extracted_data, created_at, updated_at')
      .eq('document_id', focusedDocumentId)
      .order('created_at', { ascending: false })
      .limit(1);
    analysis = (analysisRows || [])[0] || null;
  } catch (_) {
    analysis = null;
  }

  // ── 5. Knowledge belonging SPECIFICALLY to this document. The document_id
  //       filter is the exactness guarantee; the business filter is defence in
  //       depth and is only applied when the row actually names a business.
  let fieldRows: any[] = [];
  try {
    let q = sb
      .from('extracted_fields')
      .select('id, field_name, field_category, accepted_value, accepted_normalized_value, normalized_value, field_value, review_status, source_document_type, reviewed_at, metadata, document_id, business_id')
      .eq('document_id', focusedDocumentId);
    if (effectiveBusinessId) q = q.eq('business_id', effectiveBusinessId);
    const { data } = await q.limit(200);
    fieldRows = data || [];
  } catch (_) {
    fieldRows = [];
  }

  // Accepted/corrected rows pass through the ONE canonical observation layer,
  // which keeps its own eligibility rule (CONFIRMED, never VERIFIED).
  const eligibleRows = fieldRows.filter((r) => ['accepted', 'corrected'].includes(String(r?.review_status || '')));
  const observationLayer = buildObservationLayer(eligibleRows, effectiveBusinessId || '', undefined);
  const observationList = Object.values(observationLayer?.by_key || {});

  // Pending rows are NOT business truth (§8). They are surfaced only as clearly
  // UNCONFIRMED document findings, under their own key, and never enter the
  // canonical observation set — so they cannot be mistaken for verified figures.
  const unconfirmedFindings = fieldRows
    .filter((r) => String(r?.review_status || '') === 'pending_review')
    .filter((r) => !isSensitiveFieldName(r?.field_name))
    .map((r) => {
      const period = observationPeriod(r);
      return {
        field: r.field_name,
        value: numericOrNull(r),
        period: period?.label || 'period unknown',
        review_state: 'pending_review',
        state: 'unconfirmed',
        source_document_id: r.document_id,
      };
    })
    .filter((f) => f.value != null)
    .slice(0, 40);

  const processingState = resolveFocusedKnowledgeState({
    doc,
    analysis,
    confirmedCount: observationList.length,
    pendingCount: unconfirmedFindings.length,
  });

  // §11 — extraction awareness for THIS document, straight from its own rows.
  const extractionReview = deriveExtractionReviewCounts(fieldRows, { businessId: effectiveBusinessId });

  const docType = doc.document_type || null;

  return {
    available: true,
    reason: 'ok',
    focused_document: {
      id: doc.id,
      name: doc.name || null,
      document_type: docType,
      year: doc.year ?? null,
      // The tenant the caller must act on — derived from the row, echoed so the
      // answer and its provenance carry the SAME id the caller focused.
      business_id: effectiveBusinessId,
      processing_state: processingState,
      classification_state: docType && docType !== 'other' ? 'classified' : (docType === 'other' ? 'unclassified' : 'unknown'),
      extraction_state: String(analysis?.analysis_status || analysis?.status || 'not_started'),
      evidence_state: observationList.length > 0 ? 'confirmed' : (unconfirmedFindings.length > 0 ? 'pending_review' : 'none'),
      semantic_observations: observationList,
      unconfirmed_findings: unconfirmedFindings,
      // §11/§21 — how much was read out of THIS document and how much of it is
      // still unreviewed. Derived from its own persisted rows, never from a count
      // the browser supplied.
      extraction_review: extractionReview,
      // §14 — the review CTA for THIS document, carrying this document's id.
      review_action: buildReviewAction(doc.id),
      extraction_summary: minimizeExtractedData(analysis?.extracted_data),
      context_version: FOCUSED_DOCUMENT_CONTEXT_VERSION,
    },
    // SERVER-SIDE ONLY — deliberately OUTSIDE focused_document so it is never
    // serialized into model context. The canonical set above keeps ONE best
    // observation per key; without the full eligible set, a question about FY2023
    // could not be answered from FY2023 evidence that genuinely exists.
    period_observations: observationLayer.observations,
  };
}

/**
 * deriveAnswerVerification — §13/§14. VERIFICATION IS SERVER-DERIVED AND IS
 * NEVER THE MODEL'S TO AWARD. The model may describe what it used; the state
 * below is computed from the evidence actually behind the answer.
 *
 * Canonical meaning preserved:
 *   CONFIRMED — an authorized human owns/accepted/corrected/stated the value.
 *   VERIFIED  — validated beyond ordinary human confirmation. The observation
 *               layer records every observation as 'unverified', so an answer
 *               built only from document observations is CONFIRMED at most —
 *               and an answer built from nothing is not evidence at all.
 */
export function deriveAnswerVerification(input: any) {
  const usedObservations = (Array.isArray(input?.usedObservations) ? input.usedObservations : [])
    .filter((o) => o && typeof o === 'object');

  // ── CONSERVATIVE AGGREGATION (6D.0c §11) ──────────────────────────────────
  // An answer is only as verified as its WEAKEST supporting source. ONE verified
  // item must never promote a MIXED answer: that is exactly how a single
  // confident figure launders an unconfirmed one into "Verified". So VERIFIED is
  // returned only when EVERY observation used is canonically verified — and since
  // the observation layer records every observation as 'unverified', a
  // document-only answer can reach CONFIRMED and no further. If 6D.1 later
  // carries genuinely verified evidence, this rule already handles it.
  if (usedObservations.length > 0) {
    if (usedObservations.every((o) => o.verification_status === 'verified')) return 'verified';
    if (usedObservations.some((o) => o.lifecycle_state === 'confirmed')) return 'confirmed';
    return input?.documentGrounded ? 'document_evidence' : 'unavailable';
  }
  return input?.documentGrounded ? 'document_evidence' : 'unavailable';
}

/**
 * applyAnswerLabels — §13, extracted so the rule is EXECUTABLE rather than a
 * source shape. The model's own "verified" label survives ONLY when the evidence
 * behind the answer canonically earns VERIFIED; otherwise it is cleared. The
 * server-derived state is then stamped onto the response, so the answer surface
 * reads the state we computed and never the one the model claimed.
 */
export function applyAnswerLabels(response: any, evidenceState: any) {
  if (!response || typeof response !== 'object') return response;
  if (evidenceState !== 'verified') {
    if (response.intelligence_labels && Array.isArray(response.intelligence_labels.verified)) {
      response.intelligence_labels.verified = [];
    }
  }
  response.evidence_state = evidenceState;
  return response;
}

/** The reasons a period-scoped resolution can return. `period_unknown` is never coerced. */
export const PERIOD_RESOLUTION_REASONS = ['resolved', 'no_observation', 'period_unknown', 'no_observation_for_period'];

/**
 * resolveObservationForPeriod — §20/§21. A question that names a reporting year
 * is answered from THAT year or not at all. There is deliberately NO fallback to
 * the newest, the nearest or any other year: when the asked year has no evidence
 * the result says so and lists what IS available, so the surface can be honest
 * instead of substituting a figure the owner did not ask about. An unstated year
 * is `period_unknown` — never the current year, never the requested one.
 */
export function resolveObservationForPeriod(observations: any, canonicalKey: any, opts: any) {
  const list = (Array.isArray(observations) ? observations : []).filter(
    (o) => o && o.canonical_key === canonicalKey && (!opts?.businessId || o.business_id === opts.businessId),
  );
  const available_fiscal_years = [...new Set(list.map((o: any) => o?.period?.fiscal_year).filter((y: any) => y != null))].sort((a: any, b: any) => a - b);

  if (list.length === 0) {
    return { observation: null, reason: 'no_observation', canonical_key: canonicalKey, available_fiscal_years };
  }

  const asked = opts?.fiscalYear;
  if (asked == null || asked === '') {
    return { observation: null, reason: 'period_unknown', canonical_key: canonicalKey, available_fiscal_years };
  }
  const askedNum = Number(asked);
  const exact = list.filter((o: any) => Number(o?.period?.fiscal_year) === askedNum);

  if (exact.length === 0) {
    return {
      observation: null,
      reason: 'no_observation_for_period',
      canonical_key: canonicalKey,
      requested_fiscal_year: askedNum,
      available_fiscal_years,
      alternates: [],
    };
  }

  const sorted = [...exact].sort((a: any, b: any) => {
    const corr = (b.review_state === 'corrected' ? 1 : 0) - (a.review_state === 'corrected' ? 1 : 0);
    if (corr !== 0) return corr;
    const rv = new Date(b.reviewed_at || 0).getTime() - new Date(a.reviewed_at || 0).getTime();
    if (rv !== 0) return rv;
    return (b.confidence ?? 0) - (a.confidence ?? 0);
  });

  return {
    observation: sorted[0],
    reason: 'resolved',
    canonical_key: canonicalKey,
    requested_fiscal_year: askedNum,
    available_fiscal_years,
    alternates: sorted.slice(1),
  };
}

/** The canonical keys a take-home question must never be silently answered with. */
export const TAKE_HOME_FORBIDDEN_SUBSTITUTIONS = ['revenue', 'agi', 'adjusted_gross_income', 'taxable_income', 'net_income', 'profit', 'refund', 'total_tax'];

/** The ONLY canonical metric a disambiguated take-home question may resolve to. */
export const TAKE_HOME_CANDIDATE_KEYS = ['monthly_take_home'];

/**
 * takeHomeSemantics — §9. "Take home" is AMBIGUOUS and stays ambiguous. It is not
 * a canonical metric, and it is not an alias for one: the canonical vocabulary
 * has `monthly_take_home` (owner take-home PAY, a Freedom input) and nothing else
 * that answers the phrase. So this declares the ambiguity in STRUCTURED context
 * and names the forbidden substitutions, rather than letting prose decide.
 *
 * `canonical_key` is null BY CONSTRUCTION: this module never chooses. No new
 * canonical take_home fact is invented, and existing ones are not redefined.
 */
export function takeHomeSemantics(question: any) {
  const asked = /\btake[\s-]?home\b/i.test(String(question || ''));
  if (!asked) {
    return { applies: false, ambiguous: false, canonical_key: null, candidates: [], forbidden_substitutions: TAKE_HOME_FORBIDDEN_SUBSTITUTIONS };
  }
  return {
    applies: true,
    ambiguous: true,
    canonical_key: null,
    candidates: [...TAKE_HOME_CANDIDATE_KEYS],
    forbidden_substitutions: TAKE_HOME_FORBIDDEN_SUBSTITUTIONS,
    instruction: 'TAKE-HOME IS AMBIGUOUS AND MUST STAY THAT WAY. Do NOT choose a metric for it. Ask which the owner means, and offer only these two readings: owner take-home PAY (the canonical metric monthly_take_home), or income after tax as shown on a tax return. Never answer take-home with revenue, AGI, taxable income, net income/profit, total tax or a tax refund — none of those is take-home.',
  };
}

/** The reporting year an owner's own question names, or null. Never guessed. */
export function parseRequestedFiscalYear(question: any) {
  const m = String(question || '').match(/\b(19|20)\d{2}\b/);
  return m ? Number(m[0]) : null;
}