/**
 * businessDNA/qualification.ts — Phase E
 *
 * Deterministic Pattern Qualification — Governed lifecycle transitions.
 *
 * AI may propose candidate patterns. Promotion follows deterministic rules.
 * No candidate may silently become established.
 *
 * Qualification Framework:
 *   CANDIDATE:  1 meaningful signal
 *   EMERGING:   multiple observations OR 1 high-confidence longitudinal signal
 *   ESTABLISHED: multiple independent evidence sources
 *               AND sufficient temporal durability
 *               AND no unresolved material contradiction
 *
 * Constitution Compliance:
 *   Article V — Advisor Governance (AI proposes, deterministic rules qualify)
 *   Article XVII — Business DNA Authority (governed promotion)
 */

import type {
  BusinessDNAPattern, PatternStatus, DNAEvidenceRef, PatternConfidence,
} from './types.ts';
import { countIndependentSources } from './lineage.ts';

// ── Qualification Thresholds (documented, not arbitrary) ────────────────────
export const QUALIFICATION_THRESHOLDS = {
  // CANDIDATE: at least 1 evidence ref
  candidate_min_evidence: 1,
  // EMERGING: 2+ evidence refs OR 1 with temporal durability (30+ days)
  emerging_min_evidence: 2,
  emerging_longitudinal_days: 30,
  // ESTABLISHED: 2+ independent lineages AND 60+ days durability AND no contradictions
  established_min_independent: 2,
  established_min_durability_days: 60,
};

/**
 * Determine the qualified status for a set of evidence.
 *
 * This is deterministic — the same evidence always produces the same status.
 * AI may propose a pattern, but this function decides its qualification level.
 */
export function qualifyPattern(
  evidenceRefs: DNAEvidenceRef[],
  hasMaterialContradiction: boolean,
  firstObservedAt: string,
  lastObservedAt: string,
  advisorConfirmed: boolean,
): PatternStatus {
  const evidenceCount = evidenceRefs.length;
  const independentCount = countIndependentSources(evidenceRefs);

  // Temporal durability (days between first and last observation)
  const first = firstObservedAt ? new Date(firstObservedAt).getTime() : 0;
  const last = lastObservedAt ? new Date(lastObservedAt).getTime() : Date.now();
  const durabilityDays = first > 0
    ? Math.max(0, Math.round((last - first) / (1000 * 60 * 60 * 24)))
    : 0;

  // Material contradiction → CONTESTED (if was established/emerging) or stays CANDIDATE
  if (hasMaterialContradiction) {
    if (independentCount >= QUALIFICATION_THRESHOLDS.established_min_independent) {
      return 'contested';
    }
    return 'candidate';
  }

  // ESTABLISHED: 2+ independent lineages AND 60+ days AND no contradiction
  if (
    independentCount >= QUALIFICATION_THRESHOLDS.established_min_independent &&
    durabilityDays >= QUALIFICATION_THRESHOLDS.established_min_durability_days
  ) {
    return 'established';
  }

  // EMERGING: 2+ evidence refs OR 1 with 30+ days longitudinal durability
  if (
    evidenceCount >= QUALIFICATION_THRESHOLDS.emerging_min_evidence ||
    durabilityDays >= QUALIFICATION_THRESHOLDS.emerging_longitudinal_days
  ) {
    return 'emerging';
  }

  // CANDIDATE: 1 meaningful signal
  if (evidenceCount >= QUALIFICATION_THRESHOLDS.candidate_min_evidence) {
    return 'candidate';
  }

  // No evidence → retired (shouldn't happen, but safe default)
  return 'retired';
}

/**
 * Determine if a pattern should transition to WEAKENING.
 * A previously established/emerging pattern becomes WEAKENING when recent
 * evidence indicates change (contradictory evidence accumulates).
 */
export function shouldWeaken(
  pattern: BusinessDNAPattern,
  newContradictingEvidenceCount: number,
): boolean {
  if (pattern.status === 'established' || pattern.status === 'emerging') {
    return newContradictingEvidenceCount >= 2;
  }
  return false;
}

/**
 * Determine if a pattern should be RETIRED.
 * Retired = no longer applicable or useful.
 */
export function shouldRetire(pattern: BusinessDNAPattern): boolean {
  // Superseded patterns that are also old → retired
  if (pattern.status === 'superseded') {
    const ageDays = pattern.updated_at
      ? Math.round((Date.now() - new Date(pattern.updated_at).getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    if (ageDays > 365) return true;
  }
  // No evidence → retired
  if (pattern.evidence_count === 0) return true;
  return false;
}

/**
 * Validate that a status transition is legal.
 * Prevents illegal promotions (e.g., candidate → established directly).
 */
export function isValidTransition(from: PatternStatus, to: PatternStatus): boolean {
  const legal: Record<PatternStatus, PatternStatus[]> = {
    candidate: ['emerging', 'contested', 'retired', 'superseded'],
    emerging: ['established', 'contested', 'weakening', 'retired', 'superseded', 'candidate'],
    established: ['contested', 'weakening', 'retired', 'superseded'],
    contested: ['established', 'weakening', 'retired', 'superseded', 'candidate'],
    weakening: ['contested', 'retired', 'superseded', 'established'],
    superseded: ['retired'],
    retired: [],
  };
  return (legal[from] || []).includes(to);
}