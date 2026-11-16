/**
 * digitalTwin/shadowContract.ts — Phase 6D.1B
 *
 * THE SHADOW PROMOTION CONTRACT.
 *
 * It answers ONE question and no other:
 *
 *     "What canonical Digital Twin fact WOULD this evidence create?"
 *
 * It does NOT create anything. The vocabulary below is declared ONCE, the same way the
 * 6D.1A pre-flight contract declares its blockers, so a consumer matches on stable
 * machine-readable codes and never on prose.
 *
 * ── DECISION VOCABULARY (closed set; EXACTLY ONE per result) ─────────────────
 *
 *   WOULD_PROMOTE  every hard gate passed; a real promotion would write this fact
 *   BLOCKED        a hard gate failed (the blockers say which)
 *   CONFLICTED     two or more same-authority candidates materially disagree, so no
 *                  deterministic winner exists
 *   NOT_IN_PILOT   a canonical concept, but outside the 6D.1B activation pilot
 *   NO_CANDIDATE   no canonical concept resolves — there is nothing to promote
 *   SUPERSEDED     the observation is subsumed by another candidate (a lower-authority
 *                  or duplicate observation of the same identity). The word is REUSED
 *                  from the 6C fact lifecycle (`verification_status = 'superseded'`);
 *                  no second vocabulary was invented for it.
 *
 * ── WHAT THE ENGINE NEVER DOES ──────────────────────────────────────────────
 *
 * `would_write_fact` / `would_write_evidence` are SIMULATION FLAGS describing what a
 * real promotion WOULD do. They are not instructions, and this phase contains no
 * writer. The freeze is measured, not assumed.
 */

export const SHADOW_VERSION = '6d.1b.1';

export const SHADOW_DECISIONS = {
  WOULD_PROMOTE: 'WOULD_PROMOTE',
  BLOCKED: 'BLOCKED',
  CONFLICTED: 'CONFLICTED',
  NOT_IN_PILOT: 'NOT_IN_PILOT',
  NO_CANDIDATE: 'NO_CANDIDATE',
  SUPERSEDED: 'SUPERSEDED',
} as const;
export type ShadowDecision = (typeof SHADOW_DECISIONS)[keyof typeof SHADOW_DECISIONS];

/** Declaration order is the report order — deterministic, never incidental. */
export const DECISION_ORDER: ShadowDecision[] = [
  SHADOW_DECISIONS.WOULD_PROMOTE,
  SHADOW_DECISIONS.CONFLICTED,
  SHADOW_DECISIONS.SUPERSEDED,
  SHADOW_DECISIONS.BLOCKED,
  SHADOW_DECISIONS.NOT_IN_PILOT,
  SHADOW_DECISIONS.NO_CANDIDATE,
];

/**
 * WARNINGS NEVER BLOCK. They are findings a reviewer must see that the 6D.1A gate set
 * deliberately does not treat as promotion gates — see the phase report, §7.
 */
export const SHADOW_WARNINGS = {
  MINOR_VARIANCE: 'MINOR_VARIANCE',
  DUPLICATE_OBSERVATION: 'DUPLICATE_OBSERVATION',
  LOWER_AUTHORITY_DISAGREEMENT: 'LOWER_AUTHORITY_DISAGREEMENT',
  NOT_SELECTED_SUBSUMED: 'NOT_SELECTED_SUBSUMED',
  DUPLICATE_FINGERPRINT: 'DUPLICATE_FINGERPRINT',
  CORRECTION_OF_EXISTING_FACT: 'CORRECTION_OF_EXISTING_FACT',
  EXISTING_FACT_SUPERSEDED: 'EXISTING_FACT_SUPERSEDED',
  ZERO_VALUE: 'ZERO_VALUE',
  NEGATIVE_VALUE: 'NEGATIVE_VALUE',
  GROSS_PROFIT_EXCEEDS_REVENUE: 'GROSS_PROFIT_EXCEEDS_REVENUE',
} as const;
export type ShadowWarning = (typeof SHADOW_WARNINGS)[keyof typeof SHADOW_WARNINGS];

export const WARNING_LABELS: Record<string, string> = {
  MINOR_VARIANCE: 'two observations of the same identity differ by less than the registry materiality threshold',
  DUPLICATE_OBSERVATION: 'a second observation of the same identity states the same value',
  LOWER_AUTHORITY_DISAGREEMENT: 'a lower-authority source disagrees with the selected higher-authority source',
  NOT_SELECTED_SUBSUMED: 'this observation is subsumed by the selected candidate for the same identity',
  DUPLICATE_FINGERPRINT: 'a fact with this exact fingerprint already exists — a real promotion would be a no-op',
  CORRECTION_OF_EXISTING_FACT: 'a live fact with this identity holds a different value — this would be a correction that supersedes it',
  EXISTING_FACT_SUPERSEDED: 'an existing fact with this identity is already superseded',
  ZERO_VALUE: 'the value is zero (permitted; surfaced because zero is often a mapping error)',
  NEGATIVE_VALUE: 'the value is negative (permitted; surfaced because it is unusual for a revenue measure)',
  GROSS_PROFIT_EXCEEDS_REVENUE: 'gross profit exceeds revenue for the same period — an economic impossibility that suggests a mapping error',
};

export type FingerprintOutcome = 'NEW' | 'DUPLICATE' | 'CORRECTION';

/** One observation inside a conflict group, exactly as the reviewer must see it. */
export interface ShadowCandidateDetail {
  evidence_id: string;
  value: number | null;
  source_type: string | null;
  source_authority: string | null;
  source_authority_rank: number;
  machine_confidence: number | null;
  human_confirmation_state: string;
  verification_state: string;
  selected: boolean;
}

export interface ShadowTraceStep {
  step: string;
  code: string;
  detail: string;
}

export interface ShadowPromotionResult {
  shadow_version: string;
  business_id: string | null;
  business_name: string | null;

  // ── Identity ──
  fact_key: string | null;
  display_name: string | null;
  in_pilot: boolean;

  // ── The one primary decision ──
  decision: ShadowDecision;

  // ── The candidate value a real promotion would write ──
  candidate_value: number | null;
  value_type: string | null;
  currency: string | null;

  // ── Period ──
  period_type: string | null;
  period_label: string | null;
  period_start: string | null;
  period_end: string | null;
  fiscal_year: number | null;
  period_quality: string;

  // ── Basis ──
  accounting_basis: string;
  basis_required: boolean;

  // ── Source ──
  source_type: string | null;
  source_id: string | null;
  source_authority: string | null;
  source_authority_rank: number;
  provenance_class: string;

  // ── Trust ──
  business_association: string;
  machine_confidence: number | null;
  human_confirmation_state: string;
  verification_state: string;
  verification_method: string | null;

  // ── Evidence ──
  evidence_ids: string[];

  // ── Explainability ──
  blockers: string[];
  warnings: string[];
  resolver_trace: ShadowTraceStep[];

  // ── Conflict ──
  conflict_group: string | null;
  conflicting_candidate_ids: string[];
  candidates: ShadowCandidateDetail[];
  supersedes_candidate_id: string | null;

  // ── Fingerprint (what a real promotion would write) ──
  fingerprint: string | null;
  fingerprint_preimage: string | null;
  fingerprint_outcome: FingerprintOutcome | null;

  // ── Simulation flags. NOT instructions. ──
  would_write_fact: boolean;
  would_write_evidence: boolean;
}

export interface ShadowSummary {
  shadow_version: string;
  observations_evaluated: number;
  results: number;
  by_decision: Record<string, number>;
  pilot_candidates: Record<string, number>;
  by_blocker: Record<string, number>;
  by_provenance: Record<string, number>;
  by_period_quality: Record<string, number>;
  by_association: Record<string, number>;
  by_verification_state: Record<string, number>;
  would_write_facts: number;
  would_write_evidence_rows: number;
}