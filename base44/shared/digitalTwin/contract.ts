/**
 * digitalTwin/contract.ts — Phase 6D.1A
 *
 * THE DIGITAL TWIN PRE-FLIGHT CONTRACT.
 *
 * This module answers ONE question and no other:
 *
 *     "Is this evidence safe and sufficiently well-defined to even be
 *      CONSIDERED for Digital Twin promotion?"
 *
 * It does NOT answer "should this become a fact?" — that question belongs to a
 * later, separately-authorized phase (6D.1B/C). Nothing here writes, and nothing
 * here imports a writer.
 *
 * VOCABULARY IS DECLARED HERE, ONCE. Every state below is a closed set, and every
 * blocker is a stable machine-readable code — never prose. Consumers (the shadow
 * evaluator, a future promotion engine, the certification harness) match on codes.
 *
 * ── THE FOUR SEPARATIONS THIS CONTRACT ENFORCES ──────────────────────────────
 *
 *   1. SOURCE PROVENANCE ≠ REVIEW STATE. A human accepting a synthetic figure
 *      does not make it a real source. Origin is judged from where the value came
 *      from; review state from what a person did with it. They are independent
 *      axes and a value must satisfy BOTH.
 *
 *   2. ASSOCIATION ≠ SCOPE. `business_id` records which business an observation was
 *      filed under. It is not proof the figure belongs to that business. The
 *      active business is CONTEXT; the document must carry the relationship.
 *
 *   3. CONFIDENCE ≠ VERIFICATION. Confidence is a provider's own number. It can
 *      never produce a verified state. Confirmation (a human accepted it) is not
 *      verification either. Only an explicit attestation verifies.
 *
 *   4. KNOWN FROM A DOCUMENT ≠ KNOWN ABOUT THIS BUSINESS. A figure may be real,
 *      well-dated and exactly extracted and still not be this business's figure.
 */

export const PRE_FLIGHT_VERSION = '6d.1a.1';

// ── Evidence origin (Gate 2) ─────────────────────────────────────────────────
export const EVIDENCE_ORIGINS = {
  REAL_SOURCE: 'REAL_SOURCE',
  SYNTHETIC: 'SYNTHETIC',
  TEST: 'TEST',
  DEMO: 'DEMO',
  UNKNOWN: 'UNKNOWN',
} as const;
export type EvidenceOrigin = (typeof EVIDENCE_ORIGINS)[keyof typeof EVIDENCE_ORIGINS];

/** The ONE origin a production fact may be promoted from. */
export const PROMOTABLE_ORIGIN: EvidenceOrigin = EVIDENCE_ORIGINS.REAL_SOURCE;

// ── Business association (Gate 3) ────────────────────────────────────────────
export const ASSOCIATION_STATES = {
  PROVEN: 'ASSOCIATION_PROVEN',
  AMBIGUOUS: 'ASSOCIATION_AMBIGUOUS',
  REJECTED: 'ASSOCIATION_REJECTED',
} as const;
export type AssociationState = (typeof ASSOCIATION_STATES)[keyof typeof ASSOCIATION_STATES];

// ── Period quality (Gate 5) ──────────────────────────────────────────────────
export const PERIOD_QUALITIES = {
  EXACT: 'EXACT',
  BOUNDED: 'BOUNDED',
  AGGREGATE_MULTI_PERIOD: 'AGGREGATE_MULTI_PERIOD',
  AMBIGUOUS: 'AMBIGUOUS',
  UNKNOWN: 'UNKNOWN',
} as const;
export type PeriodQuality = (typeof PERIOD_QUALITIES)[keyof typeof PERIOD_QUALITIES];

/** Period qualities that may carry a single-period fact. */
export const PROMOTABLE_PERIOD_QUALITIES: PeriodQuality[] = [
  PERIOD_QUALITIES.EXACT,
  PERIOD_QUALITIES.BOUNDED,
];

// ── Accounting basis (Gate 4) ────────────────────────────────────────────────
export const BASIS_STATES = {
  CASH: 'cash',
  ACCRUAL: 'accrual',
  TAX: 'tax',
  UNKNOWN: 'unknown',
  NOT_APPLICABLE: 'not_applicable',
} as const;
export type BasisState = (typeof BASIS_STATES)[keyof typeof BASIS_STATES];

/** Bases that are DEFENSIBLE for a flow measure. `unknown` is legitimate but not promotable. */
export const PROMOTABLE_BASES: BasisState[] = [BASIS_STATES.CASH, BASIS_STATES.ACCRUAL, BASIS_STATES.TAX];

// ── Review and trust (Gate 7) ────────────────────────────────────────────────
export const REVIEW_STATES = { PROPOSED: 'proposed', CONFIRMED: 'confirmed', REJECTED: 'rejected' } as const;
export type ContractReviewState = (typeof REVIEW_STATES)[keyof typeof REVIEW_STATES];

export const VERIFICATION_STATES = {
  UNVERIFIED: 'unverified',
  CONFIRMED: 'confirmed',
  VERIFIED: 'verified',
} as const;
export type VerificationState = (typeof VERIFICATION_STATES)[keyof typeof VERIFICATION_STATES];

// ── Blocker codes ────────────────────────────────────────────────────────────
/**
 * STABLE CODES. The required set, plus two declared extensions:
 *   EVIDENCE_ONLY_CONCEPT  a real, useful concept that is deliberately NOT a
 *                          business fact (taxable income, an association name).
 *   REVIEW_REJECTED        a person actively rejected the value.
 * Extensions are declared here rather than invented at a call site, so a consumer
 * can enumerate the whole vocabulary from one place.
 */
export const PROMOTION_BLOCKERS = {
  SYNTHETIC_SOURCE: 'SYNTHETIC_SOURCE',
  UNKNOWN_SOURCE_ORIGIN: 'UNKNOWN_SOURCE_ORIGIN',
  BUSINESS_ASSOCIATION_AMBIGUOUS: 'BUSINESS_ASSOCIATION_AMBIGUOUS',
  BUSINESS_ASSOCIATION_REJECTED: 'BUSINESS_ASSOCIATION_REJECTED',
  PERIOD_UNKNOWN: 'PERIOD_UNKNOWN',
  PERIOD_AMBIGUOUS: 'PERIOD_AMBIGUOUS',
  MULTI_PERIOD_AGGREGATE: 'MULTI_PERIOD_AGGREGATE',
  BASIS_UNKNOWN: 'BASIS_UNKNOWN',
  REVIEW_PENDING: 'REVIEW_PENDING',
  REVIEW_REJECTED: 'REVIEW_REJECTED',
  SEMANTIC_MAPPING_INVALID: 'SEMANTIC_MAPPING_INVALID',
  PERSONAL_ONLY: 'PERSONAL_ONLY',
  EVIDENCE_ONLY_CONCEPT: 'EVIDENCE_ONLY_CONCEPT',
  SENSITIVE: 'SENSITIVE',
  PROJECTED_VALUE: 'PROJECTED_VALUE',
  MISSING_PROVENANCE: 'MISSING_PROVENANCE',
} as const;
export type PromotionBlocker = (typeof PROMOTION_BLOCKERS)[keyof typeof PROMOTION_BLOCKERS];

/** Declaration order IS the contract's report order — deterministic, never incidental. */
export const BLOCKER_ORDER: PromotionBlocker[] = [
  PROMOTION_BLOCKERS.MISSING_PROVENANCE,
  PROMOTION_BLOCKERS.SYNTHETIC_SOURCE,
  PROMOTION_BLOCKERS.UNKNOWN_SOURCE_ORIGIN,
  PROMOTION_BLOCKERS.SENSITIVE,
  PROMOTION_BLOCKERS.PROJECTED_VALUE,
  PROMOTION_BLOCKERS.BUSINESS_ASSOCIATION_REJECTED,
  PROMOTION_BLOCKERS.BUSINESS_ASSOCIATION_AMBIGUOUS,
  PROMOTION_BLOCKERS.SEMANTIC_MAPPING_INVALID,
  PROMOTION_BLOCKERS.PERSONAL_ONLY,
  PROMOTION_BLOCKERS.EVIDENCE_ONLY_CONCEPT,
  PROMOTION_BLOCKERS.REVIEW_REJECTED,
  PROMOTION_BLOCKERS.REVIEW_PENDING,
  PROMOTION_BLOCKERS.MULTI_PERIOD_AGGREGATE,
  PROMOTION_BLOCKERS.PERIOD_AMBIGUOUS,
  PROMOTION_BLOCKERS.PERIOD_UNKNOWN,
  PROMOTION_BLOCKERS.BASIS_UNKNOWN,
];

/** Plain-language meaning, for a reviewer — never used as the contract itself. */
export const BLOCKER_LABELS: Record<string, string> = {
  SYNTHETIC_SOURCE: 'the value came from a synthetic (mock) source, whatever a person decided about it',
  UNKNOWN_SOURCE_ORIGIN: 'where this value came from is not recorded',
  BUSINESS_ASSOCIATION_AMBIGUOUS: 'nothing in the document ties this figure to this business',
  BUSINESS_ASSOCIATION_REJECTED: 'the document names a different party',
  PERIOD_UNKNOWN: 'the reporting period is unknown',
  PERIOD_AMBIGUOUS: 'the reporting period cannot be determined deterministically',
  MULTI_PERIOD_AGGREGATE: 'the figure covers several years and is not a single-period amount',
  BASIS_UNKNOWN: 'the accounting basis is not recorded, and this measure depends on it',
  REVIEW_PENDING: 'no one has reviewed this value yet',
  REVIEW_REJECTED: 'this value was rejected during review',
  SEMANTIC_MAPPING_INVALID: 'this field is not a canonical concept for this document type',
  PERSONAL_ONLY: 'this is personal evidence, not this business\u2019s figure',
  EVIDENCE_ONLY_CONCEPT: 'this concept is evidence by design and is never promoted',
  SENSITIVE: 'this is an identifier and is never used',
  PROJECTED_VALUE: 'this is a projection, not a recorded result',
  MISSING_PROVENANCE: 'the observation is missing its own source provenance',
};

/** Deterministic ordering: a caller never depends on insertion timing. */
export function sortBlockers(blockers: Array<string | null | undefined>): PromotionBlocker[] {
  const uniq = [...new Set((blockers || []).filter(Boolean).map(String))];
  return uniq.sort((a, b) => {
    const ia = BLOCKER_ORDER.indexOf(a as PromotionBlocker);
    const ib = BLOCKER_ORDER.indexOf(b as PromotionBlocker);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  }) as PromotionBlocker[];
}

// ── The pre-flight result ────────────────────────────────────────────────────
export interface PreflightPeriod {
  quality: PeriodQuality;
  label: string;
  period_type: string | null;
  period_start: string | null;
  period_end: string | null;
  fiscal_year: number | null;
  raw: string | null;
  note: string | null;
}

export interface PromotionPreflight {
  pre_flight_version: string;
  canonical_key: string | null;
  display_name: string | null;
  evidence_origin: EvidenceOrigin;
  origin_signals: string[];
  business_association: AssociationState;
  association_reason: string;
  period_quality: PeriodQuality;
  period: PreflightPeriod;
  basis: BasisState;
  basis_required: boolean;
  basis_source: string | null;
  review_state: ContractReviewState;
  verification_state: VerificationState;
  source_authority: string | null;
  semantic_validity: boolean;
  value: number | null;
  promotion_ready: boolean;
  blockers: PromotionBlocker[];
}

export function isPromotionReady(blockers: Array<string | null | undefined>): boolean {
  return sortBlockers(blockers).length === 0;
}