/**
 * businessDNA/contradiction.ts — Phase E
 *
 * Deterministic Contradiction Detection.
 *
 * When new evidence contradicts an existing pattern, the old pattern is
 * NOT silently overwritten. Instead:
 *   - mark old pattern WEAKENING or CONTESTED
 *   - attach contradictory evidence
 *   - allow new candidate pattern
 *
 * Patterns evolve through evidence, not by mutation.
 *
 * Constitution Compliance:
 *   Article XVII — Business DNA Authority (contradictions are surfaced, not hidden)
 *   Article XII — Immutable Published Truth (historical patterns preserved)
 */

import type { BusinessDNAPattern, ContradictionResult, DNAFamily } from './types.ts';

/**
 * Detect if a new candidate pattern contradicts an existing pattern.
 *
 * A contradiction exists when:
 *   - Same family + same pattern_key + opposite direction
 *   - OR: new evidence directly contradicts the existing pattern's statement
 *
 * This is deterministic — structural contradictions are detected without AI.
 */
export function detectContradiction(
  newFamily: DNAFamily,
  newPatternKey: string,
  newDirection: string,
  newStatement: string,
  existingPatterns: BusinessDNAPattern[],
): ContradictionResult {
  // Find existing patterns with same family + pattern_key
  const sameKeyPatterns = existingPatterns.filter(
    (p) =>
      p.family === newFamily &&
      p.pattern_key === newPatternKey &&
      p.status !== 'retired' &&
      p.status !== 'superseded',
  );

  for (const existing of sameKeyPatterns) {
    // Opposite direction = structural contradiction
    if (isOppositeDirection(existing.direction, newDirection)) {
      return {
        has_contradiction: true,
        existing_pattern_id: existing.pattern_id,
        new_pattern_key: newPatternKey,
        explanation: `New pattern direction "${newDirection}" contradicts existing pattern direction "${existing.direction}" for ${newFamily}.${newPatternKey}.`,
        recommended_action:
          existing.status === 'established' ? 'mark_weakening' : 'mark_contested',
      };
    }

    // Statement-level contradiction (deterministic heuristic)
    if (statementsContradict(existing.statement, newStatement)) {
      return {
        has_contradiction: true,
        existing_pattern_id: existing.pattern_id,
        new_pattern_key: newPatternKey,
        explanation: `New statement appears to contradict existing pattern for ${newFamily}.${newPatternKey}.`,
        recommended_action:
          existing.status === 'established' ? 'mark_weakening' : 'mark_contested',
      };
    }
  }

  return {
    has_contradiction: false,
    existing_pattern_id: null,
    new_pattern_key: newPatternKey,
    explanation: 'No contradiction detected.',
    recommended_action: 'none',
  };
}

/**
 * Determine if two directions are opposite.
 */
function isOppositeDirection(d1: string, d2: string): boolean {
  const opposites: Record<string, string> = {
    improving: 'declining',
    declining: 'improving',
  };
  return opposites[d1] === d2;
}

/**
 * Heuristic: do two statements appear to contradict?
 * Checks for negation patterns. This is intentionally conservative —
 * it only flags clear structural contradictions, leaving semantic
 * contradiction detection to AI.
 */
function statementsContradict(s1: string, s2: string): boolean {
  const lower1 = s1.toLowerCase();
  const lower2 = s2.toLowerCase();
  // "X is high" vs "X is low" / "X is declining" / "X is not high"
  const negationPairs = [
    ['high', 'low'],
    ['increasing', 'decreasing'],
    ['improving', 'declining'],
    ['strong', 'weak'],
    ['dependent', 'independent'],
    ['concentrated', 'diversified'],
  ];
  for (const [a, b] of negationPairs) {
    if ((lower1.includes(a) && lower2.includes(b)) || (lower1.includes(b) && lower2.includes(a))) {
      return true;
    }
  }
  // "not X" vs "X"
  if (lower1.includes('not ') && lower2.includes(lower1.replace('not ', '').trim().split(' ').slice(0, 3).join(' '))) {
    return true;
  }
  return false;
}

/**
 * Apply contradiction to an existing pattern.
 * Returns the new status for the existing pattern.
 */
export function applyContradiction(
  existing: BusinessDNAPattern,
  action: 'mark_weakening' | 'mark_contested',
): PatternStatus {
  if (action === 'mark_weakening') return 'weakening';
  if (action === 'mark_contested') return 'contested';
  return existing.status;
}

// Re-export type for convenience
import type { PatternStatus } from './types.ts';