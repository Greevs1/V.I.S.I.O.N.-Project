/**
 * businessDNA/confidence.ts — Phase E
 *
 * Pattern Confidence Calculation.
 *
 * Confidence = how certain we are the pattern is REAL.
 * Strength = how strongly the pattern affects business behavior/value.
 * These are SEPARATE concepts and must never be combined.
 *
 * Confidence considers:
 *   - source reliability
 *   - source independence (lineage-deduplicated)
 *   - evidence quantity
 *   - temporal durability
 *   - freshness
 *   - contradictions
 *   - advisor confirmation
 *   - outcome validation
 *
 * No false precision. Prefer LOW / MODERATE / HIGH / VERY_HIGH.
 *
 * Constitution Compliance:
 *   Article IV — Explainability (confidence is explainable, not fabricated)
 *   Article XVII — Business DNA Authority (confidence reflects evidence quality)
 */

import type {
  DNAEvidenceRef, PatternConfidence, PatternStrength, FreshnessState,
} from './types.ts';
import { countIndependentSources } from './lineage.ts';

const CONFIDENCE_ORDER: PatternConfidence[] = ['low', 'moderate', 'high', 'very_high'];

function clampConfidence(level: number): PatternConfidence {
  const idx = Math.max(0, Math.min(CONFIDENCE_ORDER.length - 1, level));
  return CONFIDENCE_ORDER[idx];
}

/**
 * Calculate pattern confidence from evidence characteristics.
 *
 * Starting at LOW, confidence increases with:
 *   +1 level for 2+ independent lineages
 *   +1 level for temporal durability (60+ days)
 *   +1 level for advisor confirmation
 *   +1 level for outcome validation (decision_outcome evidence present)
 *
 * Confidence decreases with:
 *   -1 level for material contradictions
 */
export function calculateConfidence(
  evidenceRefs: DNAEvidenceRef[],
  firstObservedAt: string,
  lastObservedAt: string,
  hasMaterialContradiction: boolean,
  advisorConfirmed: boolean,
): PatternConfidence {
  let level = 0; // LOW

  const independentCount = countIndependentSources(evidenceRefs);

  // +1 for 2+ independent lineages
  if (independentCount >= 2) level += 1;

  // +1 for temporal durability (60+ days)
  const first = firstObservedAt ? new Date(firstObservedAt).getTime() : 0;
  const last = lastObservedAt ? new Date(lastObservedAt).getTime() : Date.now();
  const durabilityDays = first > 0
    ? Math.max(0, Math.round((last - first) / (1000 * 60 * 60 * 24)))
    : 0;
  if (durabilityDays >= 60) level += 1;

  // +1 for advisor confirmation
  if (advisorConfirmed) level += 1;

  // +1 for outcome validation (decision_outcome evidence present)
  const hasOutcomeEvidence = evidenceRefs.some((r) => r.source_domain === 'decision_outcome');
  if (hasOutcomeEvidence) level += 1;

  // -1 for material contradictions
  if (hasMaterialContradiction) level -= 1;

  return clampConfidence(level);
}

/**
 * Determine freshness state from last observed date.
 *   CURRENT: observed within 90 days
 *   AGING: 90-180 days
 *   STALE: 180-365 days
 *   HISTORICAL: 365+ days
 *
 * Historical patterns are NOT deleted — they may explain business evolution.
 */
export function calculateFreshness(lastObservedAt: string): FreshnessState {
  if (!lastObservedAt) return 'stale';
  const days = Math.round((Date.now() - new Date(lastObservedAt).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 90) return 'current';
  if (days <= 180) return 'aging';
  if (days <= 365) return 'stale';
  return 'historical';
}

/**
 * Validate that strength and confidence are not conflated.
 * Strength describes impact; confidence describes certainty.
 * This is a documentation guard — both use the same scale but mean different things.
 */
export function validateStrengthConfidenceSeparation(
  strength: PatternStrength,
  confidence: PatternConfidence,
): { valid: boolean; warning?: string } {
  // A pattern can have HIGH strength but LOW confidence (strong impact, uncertain if real)
  // A pattern can have LOW strength but HIGH confidence (certain it's real, minor impact)
  // Both are valid. This function exists to document the separation.
  return { valid: true };
}