/**
 * digitalTwin/preflight.ts — Phase 6D.1A
 *
 * THE DIGITAL TWIN PRE-FLIGHT. A READ-ONLY EVALUATOR.
 *
 *   Input:  one evidence observation, its document, its analysis, the business it
 *           is being considered for, and the document-derived association material.
 *   Output: the pre-flight contract (see `contract.ts`).
 *
 *   It answers: "Could this observation safely be CONSIDERED by a future promotion
 *                engine?"
 *   It does NOT promote. It performs no write, holds no Supabase client, and there
 *   is no code path from here to `business_facts`.
 *
 * ── GATE ORDER (deterministic, and the reason each gate sits where it does) ──
 *
 *   1  MISSING_PROVENANCE        the observation must carry its own source
 *   2  EVIDENCE_ORIGIN           synthetic/test/demo is refused before anything else
 *   3  SENSITIVE                 an identifier is never evidence, at any level
 *   4  PROJECTED_VALUE           a projection is not a recorded result
 *   5  BUSINESS                 a foreign row is refused; the DOCUMENT must support
 *                                the relationship (the active business is context)
 *   6  SEMANTIC VALIDITY        the field must be a canonical concept for this
 *                                document type, and not one declared evidence-only
 *   7  REVIEW STATE             a person must have settled the value
 *   8  PERIOD QUALITY           a multi-year aggregate is not a single-period fact
 *   9  BASIS                    where the measure's meaning depends on basis
 *
 * Every gate returns a CODE, never prose. `blockers` is ordered by the contract's
 * declaration order, so two runs over the same observation are byte-identical.
 *
 * AUTHORIZATION IS NOT THIS MODULE'S JOB. It runs only after a caller has already
 * established which business the observations belong to; it grants nothing.
 */

import { FACT_REGISTRY } from '../canonicalFact/registry.ts';
import { fieldMapping, docTypeAllowed, observationPeriod } from '../documentObservation/semantics.ts';
import { resolveEvidenceEligibility, resolveAssociation, isAssociationEvidenceField } from '../documentExtraction/evidenceEligibility.ts';
import { isSensitiveFieldName } from '../galileo/sensitiveFields.ts';
import {
  PRE_FLIGHT_VERSION,
  PROMOTION_BLOCKERS as B,
  EVIDENCE_ORIGINS,
  ASSOCIATION_STATES,
  PERIOD_QUALITIES,
  BASIS_STATES,
  REVIEW_STATES,
  VERIFICATION_STATES,
  sortBlockers,
  isPromotionReady,
  type PromotionPreflight,
} from './contract.ts';
import { classifyEvidenceOrigin } from './provenance.ts';
import {
  resolvePeriodQuality,
  resolveAccountingBasis,
  basisRequiresValue,
  promotableBasis,
} from './qualities.ts';
import { deriveTrust } from './trust.ts';

export const PREFLIGHT_ENGINE_VERSION = PRE_FLIGHT_VERSION;

// ── Projected / opportunity values (Gate 6D.0c.2 “Opportunity Firewall”) ─────
const PROJECTED_NATURES = ['projected', 'projection', 'forecast', 'scenario', 'opportunity', 'modeled', 'simulated'];
const PROJECTED_DOC_TYPES = ['projection', 'forecast', 'opportunity', 'scenario', 'opportunity_estimate'];
const PROJECTED_FIELD_PATTERN = /^projected_|^projected|_projection$|^opportunity_|_opportunity$|^estimated_annual_|^potential_/i;

export function isProjectedObservation(row: any): boolean {
  const md = (row && row.metadata) || {};
  if (md.projected === true || String(md.projected) === 'true') return true;
  const nature = String(md.value_nature ?? md.value_type ?? '').toLowerCase();
  if (nature && PROJECTED_NATURES.includes(nature)) return true;
  const dt = String(row?.source_document_type ?? '').toLowerCase();
  if (dt && PROJECTED_DOC_TYPES.includes(dt)) return true;
  return PROJECTED_FIELD_PATTERN.test(String(row?.field_name ?? ''));
}

export function numericValue(row: any): number | null {
  const pick = row?.accepted_normalized_value ?? row?.normalized_value ?? null;
  if (pick == null || pick === '') return null;
  if (typeof pick === 'number') return Number.isFinite(pick) ? pick : null;
  const cleaned = String(pick).replace(/[^0-9.\-]/g, '');
  // A STRING WITH NO DIGIT IS NOT ZERO. Stripping non-numeric characters from "abc"
  // leaves "", and Number("") is 0 — which would turn malformed text into a
  // silently-plausible zero. The value parse must FAIL instead, so it is checked here,
  // once, for the pre-flight AND the shadow promotion engine (which imports this).
  if (!/[0-9]/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** The disposition reader key for a persisted observation row. */
export function readerKeyOf(row: any): string | null {
  const md = (row && row.metadata) || {};
  return md.form_type || row?.source_document_type || null;
}

export interface PreflightInput {
  observation: any;
  document?: any;
  analysis?: any;
  business: { businessId: string | null; businessName?: string | null };
  association?: {
    identityNames?: Array<string | null | undefined>;
    classificationSuggestedBusinessId?: string | null;
    classificationSuggestionSource?: string | null;
  };
  /** Optional explicit verification attestation. Absent = unverified; never inferred. */
  attestation?: { verified?: boolean; method?: string | null; byProfileId?: string | null; byService?: string | null } | null;
}

/**
 * evaluatePromotionPreflight — THE ONE pre-flight decision.
 * Deterministic: same input, same output, no clock, no randomness, no I/O.
 */
export function evaluatePromotionPreflight(input: PreflightInput): PromotionPreflight {
  const row = input?.observation ?? {};
  const document = input?.document ?? null;
  const analysis = input?.analysis ?? null;
  const businessId = input?.business?.businessId ?? null;
  const businessName = input?.business?.businessName ?? null;

  const blockers: string[] = [];
  const fieldName = row?.field_name ?? null;
  const readerKey = readerKeyOf(row);
  const value = numericValue(row);

  // ── 1. The observation must carry its own provenance ──────────────────────
  if (!observationHasProvenance(row, value)) blockers.push(B.MISSING_PROVENANCE);

  // ── 2. Origin. Synthetic/test/demo is refused FIRST. ──────────────────────
  const origin = classifyEvidenceOrigin({ observation: row, document, analysis });
  if (origin.origin === EVIDENCE_ORIGINS.SYNTHETIC || origin.origin === EVIDENCE_ORIGINS.TEST || origin.origin === EVIDENCE_ORIGINS.DEMO) {
    blockers.push(B.SYNTHETIC_SOURCE);
  } else if (origin.origin !== EVIDENCE_ORIGINS.REAL_SOURCE) {
    blockers.push(B.UNKNOWN_SOURCE_ORIGIN);
  }

  // ── 3. An identifier is never evidence ────────────────────────────────────
  const eligibility = resolveEvidenceEligibility({
    readerKey,
    formType: readerKey,
    fieldName,
    association: null,
  });
  const sensitiveByDisposition = eligibility.state === 'SENSITIVE';
  const sensitiveByName = isSensitiveFieldName(fieldName);
  if (sensitiveByDisposition || sensitiveByName) blockers.push(B.SENSITIVE);

  // ── 4. A projection is not a recorded result ──────────────────────────────
  if (isProjectedObservation(row)) blockers.push(B.PROJECTED_VALUE);

  // ── 5. Business association. Scope is context; the DOCUMENT must prove it. ─
  let associationState: string = ASSOCIATION_STATES.AMBIGUOUS;
  let associationReason = 'not_evaluated';
  if (!row?.business_id || (businessId && String(row.business_id) !== String(businessId))) {
    // A foreign row is not this business's evidence, at any confidence.
    associationState = ASSOCIATION_STATES.REJECTED;
    associationReason = row?.business_id ? 'the observation is filed under another business' : 'the observation has no business scope';
    blockers.push(B.BUSINESS_ASSOCIATION_REJECTED);
  } else {
    const assoc = resolveAssociation({
      businessId,
      businessName,
      identityNames: input?.association?.identityNames ?? [],
      classificationSuggestedBusinessId: input?.association?.classificationSuggestedBusinessId ?? null,
      classificationSuggestionSource: input?.association?.classificationSuggestionSource ?? null,
    });
    associationState = assoc.supported
      ? ASSOCIATION_STATES.PROVEN
      : assoc.reason === 'document_names_a_different_party'
        ? ASSOCIATION_STATES.REJECTED
        : ASSOCIATION_STATES.AMBIGUOUS;
    associationReason = assoc.reason;
    if (associationState === ASSOCIATION_STATES.REJECTED) blockers.push(B.BUSINESS_ASSOCIATION_REJECTED);
    if (associationState === ASSOCIATION_STATES.AMBIGUOUS) blockers.push(B.BUSINESS_ASSOCIATION_AMBIGUOUS);
  }

  // ── 6. Semantic validity: a canonical concept for this document type ──────
  const docType = row?.source_document_type ?? null;
  const candidates = fieldMapping(fieldName).filter((m: any) => docTypeAllowed(m.doc_types, docType));
  const chosen = candidates[0] ?? null;
  const canonicalKey = chosen?.fact_key ?? null;
  const fact = canonicalKey ? FACT_REGISTRY.find((f: any) => f.fact_key === canonicalKey) : null;
  // WHERE THE SCOPE IS DECLARED IS THE REGISTRY, so that is where it is read from.
  // A declaration that lives only in the candidate must still be honoured here: the
  // mapping may not carry it, and a concept declared `evidence_only` (or
  // `personal_only`) must never become promotable merely because the field RESOLVED
  // to a fact. Without this, giving a concept its own home would quietly make it
  // promotable — the exact opposite of what declaring its scope was for.
  const declaredScope = chosen?.evidence_scope
    ?? (fact?.candidate_sources || []).find((c: any) => (c.field_names || []).includes(fieldName))?.evidence_scope;
  const evidenceScope = String(declaredScope ?? 'business');

  let semanticValidity = true;
  if (!canonicalKey) {
    // No canonical FACT admits this field. WHICH blocker applies depends on why, and
    // the difference is the whole point of Gate 6:
    //
    //   · the disposition table declares a BUSINESS-RELEVANT concept that carries no
    //     promotable fact — taxable income, operating income (EBIT). These are real,
    //     useful, retained evidence concepts. They are simply NOT business facts, and
    //     the honest answer is EVIDENCE_ONLY_CONCEPT: kept for document intelligence,
    //     never promoted. Deleting them would be the over-correction this phase
    //     forbids — which is why 6D.1A gives each of them its OWN fact, declared
    //     `evidence_scope: 'evidence_only'`. The branch below fires either way, so a
    //     concept with a home and a concept with none are treated identically here:
    //     readable, answerable, and never promoted.
    //   · NOTHING declares the field at all, so its meaning is not established and
    //     it cannot be evaluated: SEMANTIC_MAPPING_INVALID.
    semanticValidity = false;
    blockers.push(eligibility.business_relevant_concept === true ? B.EVIDENCE_ONLY_CONCEPT : B.SEMANTIC_MAPPING_INVALID);
  } else if (evidenceScope === 'evidence_only') {
    semanticValidity = false;
    blockers.push(B.EVIDENCE_ONLY_CONCEPT);
  } else if (evidenceScope === 'personal_only') {
    blockers.push(B.PERSONAL_ONLY);
  } else if (eligibility.state === 'PERSONAL_ONLY') {
    blockers.push(B.PERSONAL_ONLY);
  } else if (eligibility.state === 'AMBIGUOUS' && String(eligibility.reason) === 'no_declared_disposition') {
    semanticValidity = false;
    blockers.push(B.SEMANTIC_MAPPING_INVALID);
  } else if (
    eligibility.reason === 'association_evidence_only' ||
    isAssociationEvidenceField(readerKey, fieldName)
  ) {
    semanticValidity = false;
    blockers.push(B.EVIDENCE_ONLY_CONCEPT);
  }

  // ── 7. Review state (and the trust contract, which never reads confidence) ─
  const trust = deriveTrust({ reviewStatus: row?.review_status, attestation: input?.attestation ?? null });
  if (trust.review_state === REVIEW_STATES.REJECTED) blockers.push(B.REVIEW_REJECTED);
  else if (trust.review_state !== REVIEW_STATES.CONFIRMED) blockers.push(B.REVIEW_PENDING);

  // ── 8. Period quality ────────────────────────────────────────────────────
  const periodQuality = resolvePeriodQuality(row);
  if (periodQuality.quality === PERIOD_QUALITIES.AGGREGATE_MULTI_PERIOD) blockers.push(B.MULTI_PERIOD_AGGREGATE);
  else if (periodQuality.quality === PERIOD_QUALITIES.AMBIGUOUS) blockers.push(B.PERIOD_AMBIGUOUS);
  else if (periodQuality.quality === PERIOD_QUALITIES.UNKNOWN) blockers.push(B.PERIOD_UNKNOWN);

  // ── 9. Basis, only where the measure's meaning depends on it ─────────────
  const basisRequired = basisRequiresValue(fact);
  const basisVerdict = resolveAccountingBasis(row);
  if (basisRequired && !promotableBasis(basisVerdict.basis)) blockers.push(B.BASIS_UNKNOWN);

  const ordered = sortBlockers(blockers);
  const p = observationPeriod(row);

  return {
    pre_flight_version: PREFLIGHT_ENGINE_VERSION,
    canonical_key: canonicalKey,
    display_name: fact?.display_name ?? null,
    evidence_origin: origin.origin as any,
    origin_signals: origin.signals,
    business_association: associationState as any,
    association_reason: associationReason,
    period_quality: periodQuality.quality as any,
    period: {
      quality: periodQuality.quality as any,
      label: p.label,
      period_type: p.period_type,
      period_start: p.period_start,
      period_end: p.period_end,
      fiscal_year: p.fiscal_year,
      raw: p.period_raw,
      note: periodQuality.note,
    },
    basis: basisVerdict.basis as any,
    basis_required: basisRequired,
    basis_source: basisVerdict.source,
    review_state: trust.review_state as any,
    verification_state: trust.verification_state as any,
    source_authority: chosen?.source_authority ?? null,
    semantic_validity: semanticValidity,
    value: isPromotionReady(ordered) ? value : null,
    promotion_ready: isPromotionReady(ordered),
    blockers: ordered as any,
  };
}

function observationHasProvenance(row: any, value: number | null): boolean {
  return Boolean(row?.id) && Boolean(row?.document_id) && Boolean(row?.field_name) && value != null;
}

// ── Batch evaluation + summary (used by the read-only shadow run) ────────────
export interface PreflightSummary {
  pre_flight_version: string;
  evaluated: number;
  promotion_ready: number;
  by_blocker: Record<string, number>;
  by_canonical_key: Record<string, { evaluated: number; promotion_ready: number }>;
  ready_candidates: PromotionPreflight[];
}

export function summarizePreflight(results: PromotionPreflight[]): PreflightSummary {
  const by_blocker: Record<string, number> = {};
  const by_canonical_key: Record<string, { evaluated: number; promotion_ready: number }> = {};
  const ready: PromotionPreflight[] = [];
  for (const r of results) {
    const key = r.canonical_key || '(unmapped)';
    by_canonical_key[key] = by_canonical_key[key] || { evaluated: 0, promotion_ready: 0 };
    by_canonical_key[key].evaluated += 1;
    if (r.promotion_ready) {
      by_canonical_key[key].promotion_ready += 1;
      ready.push(r);
    }
    for (const b of r.blockers) by_blocker[b] = (by_blocker[b] || 0) + 1;
  }
  return {
    pre_flight_version: PREFLIGHT_ENGINE_VERSION,
    evaluated: results.length,
    promotion_ready: ready.length,
    by_blocker,
    by_canonical_key,
    ready_candidates: ready,
  };
}

/**
 * Association material from the PERSISTED rows — the only inputs `resolveAssociation`
 * may receive. A classifier suggestion is honoured ONLY when the analysis recorded
 * both the suggestion and its declared document-content provenance; anything else is
 * passed as null, so no association can be manufactured from context.
 */
export function associationMaterialForDocument(rows: any[], analysis: any): PreflightInput['association'] {
  const identityNames = (rows || [])
    .filter((r) => isAssociationEvidenceField(readerKeyOf(r), r?.field_name))
    .map((r) => r?.accepted_value ?? r?.field_value ?? r?.normalized_value ?? null)
    .filter((v) => typeof v === 'string' && v.trim().length > 0);

  const data = analysis?.extracted_data || {};
  const suggested = data.suggested_business_id ?? null;
  const source = data.classification_suggestion_source ?? null;
  const suggestionHonoured = suggested && source === 'document_content';

  return {
    identityNames,
    classificationSuggestedBusinessId: suggestionHonoured ? suggested : null,
    classificationSuggestionSource: suggestionHonoured ? 'document_content' : null,
  };
}