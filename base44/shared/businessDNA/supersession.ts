/**
 * businessDNA/supersession.ts — Phase E
 *
 * Pattern Supersession — Preserve history, never mutate it.
 *
 * When a new pattern better describes current behavior:
 *   Pattern A → SUPERSEDED by Pattern B
 *   Pattern A is preserved historically (not deleted)
 *   Pattern B references Pattern A via supersedes_pattern_id
 *
 * Constitution Compliance:
 *   Article XII — Immutable Published Truth (historical patterns preserved)
 *   Article XVII — Business DNA Authority (supersession is governed)
 */

import type { BusinessDNAPattern } from './types.ts';

/**
 * Create a supersession relationship between two patterns.
 * The old pattern is marked SUPERSEDED; the new pattern references it.
 */
export function supersedePattern(
  oldPattern: BusinessDNAPattern,
  newPatternId: string,
): Partial<BusinessDNAPattern> {
  return {
    status: 'superseded',
    superseded_by_pattern_id: newPatternId,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Link a new pattern to the pattern it supersedes.
 */
export function linkSupersession(
  newPattern: BusinessDNAPattern,
  oldPatternId: string,
): Partial<BusinessDNAPattern> {
  return {
    supersedes_pattern_id: oldPatternId,
  };
}

/**
 * Get the full supersession chain for a pattern (oldest → newest).
 */
export function getSupersessionChain(
  patterns: BusinessDNAPattern[],
  patternId: string,
): BusinessDNAPattern[] {
  const chain: BusinessDNAPattern[] = [];
  const byId = new Map(patterns.map((p) => [p.pattern_id, p]));

  // Walk backward (find what this pattern supersedes)
  let current = byId.get(patternId);
  const backward: BusinessDNAPattern[] = [];
  while (current?.supersedes_pattern_id) {
    const prev = byId.get(current.supersedes_pattern_id);
    if (!prev) break;
    backward.unshift(prev);
    current = prev;
  }

  // Walk forward (find what supersedes this pattern)
  current = byId.get(patternId);
  const forward: BusinessDNAPattern[] = [];
  while (current?.superseded_by_pattern_id) {
    const next = byId.get(current.superseded_by_pattern_id);
    if (!next) break;
    forward.push(next);
    current = next;
  }

  return [...backward, byId.get(patternId)!, ...forward].filter(Boolean);
}

/**
 * Check if a pattern is superseded (no longer the current description).
 */
export function isSuperseded(pattern: BusinessDNAPattern): boolean {
  return pattern.status === 'superseded' || pattern.superseded_by_pattern_id !== null;
}

/**
 * Check if a pattern is the current (latest) in its supersession chain.
 */
export function isCurrentPattern(pattern: BusinessDNAPattern): boolean {
  return pattern.superseded_by_pattern_id === null && pattern.status !== 'retired';
}