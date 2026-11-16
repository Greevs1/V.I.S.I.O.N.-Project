/**
 * VISION 6D.0b — THE ONE DOCUMENT UNDERSTANDING SERVICE.
 *
 *   understandDocument(authorized document) → ClassificationResult
 *
 * It runs ONLY after the caller has resolved the canonical actor, authorized the
 * document, and authorized the business/scope: this module contains NO
 * authorization logic of its own and accepts NO client assertion as authority
 * for business access, ownership, role or tenant (Phase 4 / Decision 3).
 *
 * THE TWO-STAGE CLASSIFIER (Phase 8), in order of evidential force:
 *
 *   1. DECLARED      an explicit, trustworthy type the uploader stated: routed
 *                    with NO model call (D40).
 *   2. CONTENT       the document's own text, decoded deterministically for text
 *                    formats; government form number/title or statement
 *                    structure decides alone (D2/D30 — filename never decides).
 *   3. SEMANTIC      for binary formats no deterministic reader can decode
 *                    (PDF/scan/image/spreadsheet), ONE schema-constrained
 *                    provider call reads the document's own printed evidence.
 *   4. EVIDENCE      the confidence BAND is computed here from that evidence —
 *                    never copied from a model's self-reported percentage
 *                    (Phase 7). A provider assertion with no content evidence of
 *                    its own is MEDIUM and needs confirmation.
 *
 * SCOPE IS EVIDENCE, NEVER AUTHORIZATION (Decision 3). A personal document under
 * a business scope raises `scope_mismatch`; it never moves the document, never
 * changes business_id/document_scope, and never routes extraction until an
 * authorized user chooses a destination.
 */

import {
  STORABLE_TYPES,
  SUBTYPE_PARENT,
  TYPE_FAMILY,
  UNCLASSIFIED_TYPE,
  isKnownType,
  isKnownSubtype,
  subtypeBelongsTo,
  resolveReaderKey,
  isReaderSupported,
  folderFor,
  familyOf,
  labelFor,
  labelForSubtype,
} from './taxonomy.ts';
import {
  finalizeResult,
  bandFor,
  CONFIDENCE_CALIBRATION,
  type ClassificationResult,
} from './contract.ts';
import {
  fileFormatFromMime,
  isTextReadableFormat,
  evaluateContent,
  structuralSignals,
  detectReportingPeriod,
  detectAccountingBasis,
  weakFilenameHints,
  CONTENT_STRENGTH,
} from './signals.ts';
import { classifyWithProvider } from './semanticClassifier.ts';

export interface UnderstandInput {
  base44?: any;
  documentId: string;
  documentName?: string;
  fileName: string;
  mimeType?: string | null;
  declaredType?: string | null;
  signedUrl?: string | null;
  base64?: string | null;
  businessId?: string | null;
  candidateBusinesses?: { id: string; name?: string }[];
}

/**
 * SCOPE BY TYPE — the scope a type implies when the document does not state one.
 * Used ONLY to fall back, never to overrule the document's own wording.
 */
export const SCOPE_BY_TYPE: Record<string, 'personal' | 'business' | 'ambiguous'> = {
  personal_tax_return: 'personal',
  business_tax_return: 'business',
  schedule_c: 'business',
  schedule_e: 'business',
  k1: 'business',
  w2: 'personal',
  form_1099: 'ambiguous',
  profit_and_loss: 'business',
  balance_sheet: 'business',
  payroll_report: 'business',
  debt_schedule: 'business',
};

export function inferScopeFromType(type: unknown): 'personal' | 'business' | 'ambiguous' {
  return SCOPE_BY_TYPE[String(type || '').trim()] || 'ambiguous';
}

/** UTF-8 text from a base64 payload. Globals only — portable to the Deno runtime. */
export function decodeBase64Text(b64: unknown): string {
  const clean = String(b64 || '');
  const payload = clean.includes(',') ? clean.slice(clean.indexOf(',') + 1) : clean;
  if (!payload) return '';
  try {
    const bin = atob(payload);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return '';
  }
}

/** The declared type, when it is an explicit, trustworthy, known type. */
function explicitDeclaredType(declaredType: unknown): string | null {
  const d = typeof declaredType === 'string' ? declaredType.trim() : '';
  if (!d || ['other', 'unknown'].includes(d)) return null;
  return isKnownType(d) ? d : null;
}

/** Period: what the document said, else what the provider reported. */
function resolvePeriod(text: string, raw: any): {
  reporting_period: string | null; period_start: string | null; period_end: string | null; tax_year: number | null;
} {
  const fromText = detectReportingPeriod(text);
  const rawYear = String(raw?.tax_year || '').match(/(20\d{2})/);
  const rawPeriod = typeof raw?.reporting_period === 'string' ? raw.reporting_period.trim() : '';
  const year = fromText.tax_year || (rawYear ? Number(rawYear[1]) : null)
    || (rawPeriod.match(/(20\d{2})/) ? Number(rawPeriod.match(/(20\d{2})/)[1]) : null);
  const period = fromText.reporting_period || rawPeriod || (year ? String(year) : null);
  return {
    reporting_period: period,
    period_start: fromText.period_start || (year ? `${year}-01-01` : null),
    period_end: fromText.period_end || (year ? `${year}-12-31` : null),
    tax_year: year,
  };
}

function cleanText(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  return s && s !== 'none' ? s : null;
}

export async function understandDocument(input: UnderstandInput): Promise<ClassificationResult> {
  const fileFormat = fileFormatFromMime(input.mimeType, input.fileName);
  const businessId = input.businessId || null;
  const candidates = Array.isArray(input.candidateBusinesses) ? input.candidateBusinesses.filter((b) => b && b.id) : [];
  const weak = weakFilenameHints(input.fileName);

  const finish = (partial: Partial<ClassificationResult>): ClassificationResult => {
    const result = finalizeResult({
      ...partial,
    }, {
      fileName: input.fileName,
      mimeType: input.mimeType ?? null,
      declaredType: input.declaredType ?? null,
      businessId,
      fileFormat,
    });
    // Routing is decided HERE, explicitly, from the final result — never inferred
    // from a partial: HIGH evidence, a real reader, applied. SCOPE IS DELIBERATELY
    // NOT PART OF THIS DECISION: extraction answers "what is in the document?", and
    // a personal document uploaded while a business is active must be read like any
    // other. Eligibility, not extraction, decides what may be used for the business.
    const applied = result.applied_document_type !== 'other';
    result.route_extraction = result.confidence_band === 'high'
      && applied
      && result.reader_supported;
    return result;
  };

  // A HUMAN DECISION IS NO LONGER AN INPUT (6D.0c.3 automatic relevant-evidence
  // policy). There is no scope-confirmation gate: a personal document uploaded in
  // business context is extracted like any other. What may be used FOR the business
  // is decided afterwards, field by field, by evidence eligibility — never here.

  const scopeFlags = (type: string, semanticScope: 'personal' | 'business' | 'ambiguous') => {
    // SCOPE MISMATCH, REVISED MEANING (6D.0c.3 automatic relevant-evidence policy).
    // It is CONTEXT, never a gate: it records that the document's own scope is
    // personal while a business is active, and that the document has NOT been moved.
    // It no longer requires a confirmation and no longer blocks extraction. What it
    // drives is EVIDENCE ELIGIBILITY (evidenceEligibility.ts), which decides field by
    // field what may be used for this business.
    const scopeMismatch = semanticScope === 'personal' && !!businessId;
    return {
      semantic_scope: semanticScope,
      scope_mismatch: scopeMismatch,
      requires_confirmation: false,
      applied_type: type,
      reader_key: resolveReaderKey(type),
      reader_supported: isReaderSupported(type),
      suggested_folder: folderFor(type, familyOf(type)),
    };
  };

  // ── 1. DECLARED — explicit and trustworthy: no model call (D40) ──────────
  const declared = explicitDeclaredType(input.declaredType);
  if (declared) {
    const flags = scopeFlags(declared, inferScopeFromType(declared));
    const subtype = Object.keys(SUBTYPE_PARENT).find((s) => SUBTYPE_PARENT[s] === declared) || null;
    return finish({
      file_format: fileFormat,
      mime_type: input.mimeType ?? null,
      document_family: familyOf(declared),
      document_type: declared,
      document_subtype: subtype,
      reader_key: flags.reader_key,
      reader_supported: flags.reader_supported,
      suggested_folder: flags.suggested_folder,
      classification_confidence: CONFIDENCE_CALIBRATION.form_number_and_title,
      confidence_band: 'high',
      classification_method: 'declared_explicit',
      classification_evidence: ['uploader declared the type explicitly'],
      semantic_scope: flags.semantic_scope,
      scope_mismatch: flags.scope_mismatch,
      requires_confirmation: flags.requires_confirmation,
      decision_status: 'approved',
      notes: ['Type was stated explicitly by the uploader; no content classification was required.'],
    });
  }

  // ── 2. CONTENT — deterministic text, where the format allows it ──────────
  let contentText = '';
  if (isTextReadableFormat(fileFormat) && input.base64) {
    contentText = decodeBase64Text(input.base64).slice(0, 400000);
  }
  const contentEval = contentText ? evaluateContent(contentText) : { candidates: [], best: null, decisive: false, ambiguous: false, evidence: [] };

  if (contentEval.decisive && contentEval.best && contentEval.best.type) {
    const type = contentEval.best.type;
    const flags = scopeFlags(type, inferScopeFromType(type));
    const period = resolvePeriod(contentText, null);
    return finish({
      file_format: fileFormat,
      mime_type: input.mimeType ?? null,
      document_family: contentEval.best.family || familyOf(type),
      document_type: type,
      document_subtype: contentEval.best.subtype || null,
      tax_year: period.tax_year,
      reporting_period: period.reporting_period,
      period_start: period.period_start,
      period_end: period.period_end,
      accounting_basis: detectAccountingBasis(contentText),
      reader_key: flags.reader_key,
      reader_supported: flags.reader_supported,
      suggested_folder: flags.suggested_folder,
      classification_confidence: contentEval.best.strength,
      confidence_band: bandFor(contentEval.best.strength),
      classification_method: 'deterministic_content',
      classification_evidence: contentEval.best.evidence.concat(weak.tokens),
      semantic_scope: flags.semantic_scope,
      scope_mismatch: flags.scope_mismatch,
      requires_confirmation: flags.requires_confirmation,
      decision_status: 'auto_filed',
      notes: ['Decided from the document content itself; the file name was not consulted.'],
    });
  }

  // ── 3. SEMANTIC — provider-mediated content read for binary formats ──────
  if (!input.signedUrl) {
    // No authorized content access: report honestly, decide nothing.
    return finish({
      file_format: fileFormat,
      mime_type: input.mimeType ?? null,
      document_family: weak.hint_family || 'other',
      document_type: UNCLASSIFIED_TYPE,
      classification_confidence: CONFIDENCE_CALIBRATION.none,
      confidence_band: 'low',
      classification_method: 'unresolved',
      classification_evidence: ['no authorized content access was available'],
      requires_confirmation: true,
      decision_status: 'pending',
      unresolved_reason: 'no_content_access',
      notes: ['The document is stored safely. VISION could not read its content to classify it (D24).'],
    });
  }

  const provider = await classifyWithProvider({
    base44: input.base44,
    signedUrl: input.signedUrl,
    fileName: input.fileName,
    mimeType: input.mimeType ?? null,
    declaredType: input.declaredType ?? null,
    types: STORABLE_TYPES,
    subtypes: Object.keys(SUBTYPE_PARENT),
    families: Object.keys(TYPE_FAMILY).map((t) => TYPE_FAMILY[t]).filter((f, i, a) => a.indexOf(f) === i),
    candidateBusinesses: candidates, // ONLY authorized candidates ever reach the model (D38)
  });

  if (!provider.ok) {
    // PROVIDER FAILURE IS NOT UPLOAD FAILURE (D42). Nothing is applied, nothing
    // is invented: the document stays stored and clearly awaits classification.
    return finish({
      file_format: fileFormat,
      mime_type: input.mimeType ?? null,
      document_family: weak.hint_family || 'other',
      document_type: UNCLASSIFIED_TYPE,
      classification_confidence: CONFIDENCE_CALIBRATION.none,
      confidence_band: 'low',
      classification_method: 'provider_unavailable',
      classification_evidence: ['content classification was unavailable'],
      requires_confirmation: true,
      decision_status: 'pending',
      unresolved_reason: 'classification_unavailable',
      notes: ['VISION stored the document but could not classify it yet. It can be retried.'],
    });
  }

  const raw = provider.raw || {};
  const providerText = [
    cleanText(raw.form_number) || '',
    cleanText(raw.form_title) || '',
    cleanText(raw.statement_heading) || '',
    Array.isArray(raw.structural_markers) ? raw.structural_markers.join(' \n ') : '',
  ].join(' \n ');
  const providerEval = evaluateContent(providerText);
  // A provider answering "other" has made NO assertion. An unconfirmed 'other'
  // is not a classification: it must never be applied, and it must never be
  // mistaken for a low-confidence name.
  const providerTypeRaw = isKnownType(raw.document_type) ? String(raw.document_type).trim() : null;
  const providerType = providerTypeRaw && providerTypeRaw !== UNCLASSIFIED_TYPE ? providerTypeRaw : null;
  const providerSubtype = providerType && subtypeBelongsTo(providerType, raw.document_subtype)
    ? String(raw.document_subtype).trim() : null;
  const providerScope = ['personal', 'business', 'ambiguous'].includes(raw.semantic_scope)
    ? raw.semantic_scope : 'ambiguous';

  // ── 4. EVIDENCE — confidence computed here, from what was actually found ──
  const evidenceCandidate = providerEval.best;
  const strongEvidence = !!evidenceCandidate && evidenceCandidate.strength >= CONTENT_STRENGTH.form_number_or_title;
  const contradiction = strongEvidence && !!providerType && evidenceCandidate.type && evidenceCandidate.type !== providerType;

  let type: string;
  let subtype: string | null = providerSubtype;
  let family: string;
  let score: number;
  let method: ClassificationResult['classification_method'];
  let requiresConfirmation = false;
  let unresolvedReason: string | null = null;
  const evidence: string[] = [];
  const notes: string[] = [];

  if (strongEvidence) {
    // The document's own printed evidence is decisive. It outranks a provider
    // assertion that contradicts it — content-first (Phase 5).
    type = evidenceCandidate.type;
    subtype = evidenceCandidate.subtype || providerSubtype;
    family = evidenceCandidate.family;
    score = contradiction ? CONFIDENCE_CALIBRATION.contradictory_evidence : evidenceCandidate.strength;
    method = 'provider_semantic';
    evidence.push(...evidenceCandidate.evidence);
    requiresConfirmation = contradiction;
    if (contradiction) {
      notes.push('The document states one form and the model proposed another; the document was believed.');
      evidence.push('conflicting model assertion: ' + String(providerType));
    }
  } else if (providerType) {
    // A model assertion with no decisive content evidence of its own is NOT
    // trusted silently: it is applied provisionally and confirmed (Phase 7).
    type = providerType;
    family = isKnownType(raw.document_family) && raw.document_family === familyOf(providerType)
      ? raw.document_family : familyOf(providerType);
    score = CONFIDENCE_CALIBRATION.provider_assertion_unconfirmed;
    method = 'provider_semantic_unconfirmed';
    requiresConfirmation = true;
    evidence.push('model identified this as ' + labelFor(providerType) + ' without decisive printed evidence');
    if (providerEval.candidates.length) evidence.push(...providerEval.candidates[0].evidence);
  } else if (evidenceCandidate && evidenceCandidate.family && !evidenceCandidate.type) {
    // A recognized family with no canonical type: honest, never 'other' silently.
    type = UNCLASSIFIED_TYPE;
    family = evidenceCandidate.family;
    score = CONFIDENCE_CALIBRATION.family_only;
    method = 'provider_semantic_unconfirmed';
    requiresConfirmation = true;
    unresolvedReason = 'family_recognized_no_type';
    evidence.push(...evidenceCandidate.evidence);
  } else {
    type = UNCLASSIFIED_TYPE;
    family = cleanText(raw.document_family) || 'other';
    score = CONFIDENCE_CALIBRATION.none;
    method = 'unresolved';
    requiresConfirmation = true;
    unresolvedReason = 'no_content_evidence';
    notes.push('Nothing on the document identified it. The owner is asked rather than guessed at.');
  }

  const period = resolvePeriod(providerText, raw);
  const semanticScope: 'personal' | 'business' | 'ambiguous' = providerScope;
  const scopeMismatch = semanticScope === 'personal' && !!businessId;
  const readerKey = resolveReaderKey(type);
  const readerSupported = !!readerKey;
  const suggestedFolder = folderFor(type, family);
  const suggestedBusiness = cleanText(raw.suggested_business_id)
    && candidates.some((c) => c.id === cleanText(raw.suggested_business_id))
    ? cleanText(raw.suggested_business_id) : null; // an id outside the authorized candidates is discarded (D39)

  if (weak.tokens.length) evidence.push(...weak.tokens);
  if (scopeMismatch) {
    notes.push('This is a personal document uploaded while a business was selected. It has not been moved; whatever is genuinely about that business is used as document evidence.');
  }

  return finish({
    file_format: fileFormat,
    mime_type: input.mimeType ?? null,
    document_family: family,
    document_type: type,
    document_subtype: subtype,
    tax_year: period.tax_year,
    reporting_period: period.reporting_period,
    period_start: period.period_start,
    period_end: period.period_end,
    accounting_basis: detectAccountingBasis(providerText) || cleanText(raw.accounting_basis),
    semantic_scope: semanticScope,
    detected_entity_name: cleanText(raw.entity_name),
    detected_entity_identifier: cleanText(raw.entity_identifier),
    suggested_business_id: suggestedBusiness,
    suggested_folder: suggestedFolder,
    reader_key: readerKey,
    reader_supported: readerSupported,
    classification_confidence: score,
    confidence_band: bandFor(score),
    classification_method: method,
    classification_evidence: evidence,
    requires_confirmation: requiresConfirmation,
    scope_mismatch: scopeMismatch,
    decision_status: type === UNCLASSIFIED_TYPE ? 'pending'
      : bandFor(score) === 'high' ? 'auto_filed'
        : bandFor(score) === 'medium' ? 'awaiting_review' : 'pending',
    unresolved_reason: unresolvedReason,
    notes,
  });
}

export { labelFor, labelForSubtype, isReaderSupported };