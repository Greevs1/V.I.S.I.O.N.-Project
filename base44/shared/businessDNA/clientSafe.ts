/**
 * businessDNA/clientSafe.ts — Phase E
 *
 * Client-Safe Filtering for Business DNA Patterns.
 *
 * Internal patterns containing advisor-only evidence, private assumptions,
 * or internal critique must be filtered BEFORE reaching the client.
 *
 * A client-safe pattern either:
 *   - uses only safe evidence, OR
 *   - is withheld entirely
 *
 * Constitution Compliance:
 *   Article VI — Client Safety (nothing internal leaks externally)
 *   Article XVII — Business DNA Authority (client visibility enforced)
 */

import type {
  BusinessDNAPattern, ClientSafePattern, DNAEvidenceRef, PatternImplication, DNAQuestion,
} from './types.ts';

/**
 * Determine if a pattern is client-visible.
 * A pattern is client-visible if:
 *   - its client_visibility is 'client_safe', AND
 *   - all its evidence refs are client_visible
 */
export function isPatternClientVisible(pattern: BusinessDNAPattern): boolean {
  if (pattern.client_visibility !== 'client_safe') return false;
  // All evidence must be client-visible
  return pattern.evidence_refs.every((ref) => ref.client_visible);
}

/**
 * Filter evidence refs for client safety.
 * Removes any evidence ref that is not client_visible.
 */
export function filterEvidenceForClient(refs: DNAEvidenceRef[]): DNAEvidenceRef[] {
  return refs.filter((ref) => ref.client_visible);
}

/**
 * Filter implications for client safety.
 * Removes implications that reference internal-only concepts.
 */
export function filterImplicationsForClient(implications: PatternImplication[]): PatternImplication[] {
  return implications.filter((imp) => {
    const lower = imp.description.toLowerCase();
    // Filter out internal critique
    const internalTerms = ['advisor note', 'internal concern', 'private', 'credibility uncertain'];
    return !internalTerms.some((t) => lower.includes(t));
  });
}

/**
 * Filter DNA questions for client safety.
 */
export function filterQuestionsForClient(questions: DNAQuestion[]): DNAQuestion[] {
  return questions.filter((q) => {
    const lower = q.why_it_matters.toLowerCase();
    const internalTerms = ['advisor', 'internal', 'private'];
    return !internalTerms.some((t) => lower.includes(t));
  });
}

/**
 * Convert a BusinessDNAPattern to a ClientSafePattern.
 * Returns null if the pattern is not client-visible.
 */
export function toClientSafePattern(pattern: BusinessDNAPattern): ClientSafePattern | null {
  if (!isPatternClientVisible(pattern)) return null;

  const safeEvidence = filterEvidenceForClient(pattern.evidence_refs);
  const safeImplications = filterImplicationsForClient(pattern.implications);
  const safeQuestions = filterQuestionsForClient(pattern.dna_questions);

  const excluded: string[] = [];
  if (safeEvidence.length < pattern.evidence_refs.length) {
    excluded.push(`${pattern.evidence_refs.length - safeEvidence.length} internal evidence refs`);
  }
  if (safeImplications.length < pattern.implications.length) {
    excluded.push(`${pattern.implications.length - safeImplications.length} internal implications`);
  }
  if (safeQuestions.length < pattern.dna_questions.length) {
    excluded.push(`${pattern.dna_questions.length - safeQuestions.length} internal questions`);
  }

  return {
    pattern_id: pattern.pattern_id,
    family: pattern.family,
    title: pattern.title,
    statement: pattern.statement,
    pattern_type: pattern.pattern_type,
    status: pattern.status,
    strength: pattern.strength,
    confidence: pattern.confidence,
    direction: pattern.direction,
    implications: safeImplications,
    dna_questions: safeQuestions,
    first_observed_at: pattern.first_observed_at,
    last_observed_at: pattern.last_observed_at,
    evidence_count: safeEvidence.length,
    independent_source_count: pattern.independent_source_count,
    _meta: {
      client_safe: true,
      excluded_internal_items: excluded,
    },
  };
}

/**
 * Filter an array of patterns for client safety.
 * Non-visible patterns are excluded entirely.
 */
export function filterPatternsForClient(patterns: BusinessDNAPattern[]): ClientSafePattern[] {
  return patterns
    .map(toClientSafePattern)
    .filter((p): p is ClientSafePattern => p !== null);
}

/**
 * Get the list of excluded internal fields for auditability.
 */
export function getExcludedInternalFields(pattern: BusinessDNAPattern): string[] {
  const excluded: string[] = [];
  if (pattern.client_visibility !== 'client_safe') {
    excluded.push('entire pattern (advisor_internal)');
  }
  const internalEvidence = pattern.evidence_refs.filter((r) => !r.client_visible);
  if (internalEvidence.length > 0) {
    excluded.push(`${internalEvidence.length} internal evidence refs`);
  }
  return excluded;
}