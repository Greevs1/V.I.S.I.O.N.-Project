/**
 * Confidence Model — Phase 13.4C.1
 *
 * Every executive recommendation returns:
 *   confidence, reasoning completeness, evidence completeness, missing evidence.
 * Never fabricates certainty.
 *
 * Pure reasoning. No LLM.
 */
import type { Recommendation, ExecutiveState, ConfidenceAssessment } from './types.ts';

export function assessConfidence(
  recommendation: Recommendation | null,
  state: ExecutiveState
): ConfidenceAssessment {
  if (!recommendation) {
    return {
      confidence: 0,
      reasoningCompleteness: 0,
      evidenceCompleteness: 0,
      missingEvidence: ['No recommendation to assess'],
      neverFabricate: true,
    };
  }

  const reasoningCompleteness = assessReasoningCompleteness(recommendation, state);
  const evidenceCompleteness = assessEvidenceCompleteness(state);
  const missingEvidence = findMissingEvidence(recommendation, state);
  const confidence = calculateConfidence(reasoningCompleteness, evidenceCompleteness, missingEvidence);

  return {
    confidence,
    reasoningCompleteness,
    evidenceCompleteness,
    missingEvidence,
    neverFabricate: true,
  };
}

function assessReasoningCompleteness(rec: Recommendation, state: ExecutiveState): number {
  let score = 50; // Base score
  if (state.valuationId) score += 20;
  if (state.businessId) score += 10;
  if (state.verificationState && state.verificationState.unresolvedConflicts === 0) score += 10;
  if (state.publicationState && state.publicationState.readyForPublication) score += 10;
  return Math.min(100, score);
}

function assessEvidenceCompleteness(state: ExecutiveState): number {
  if (!state.valuationId) return 20;
  let score = 60;
  if (state.recentChanges.filter((c) => c.type === 'document').length > 0) score += 15;
  if (state.verificationState && state.verificationState.completedVerifications > 0) score += 15;
  if (state.verificationState && state.verificationState.pendingVerifications === 0) score += 10;
  return Math.min(100, score);
}

function findMissingEvidence(rec: Recommendation, state: ExecutiveState): string[] {
  const missing: string[] = [];
  if (!state.valuationId && rec.intent !== 'learn' && rec.intent !== 'navigate') {
    missing.push('Active valuation');
  }
  if (!state.businessId) missing.push('Active business');
  if (state.verificationState && state.verificationState.pendingVerifications > 0) {
    missing.push(`${state.verificationState.pendingVerifications} pending verification(s)`);
  }
  if (state.publicationState && state.publicationState.blockers.length > 0) {
    missing.push('Publication blockers unresolved');
  }
  return [...missing, ...rec.missingEvidence];
}

function calculateConfidence(
  reasoning: number,
  evidence: number,
  missing: string[]
): number {
  const penalty = missing.length * 10;
  return Math.max(0, Math.min(100, Math.round((reasoning + evidence) / 2) - penalty));
}

export function getConfidenceLabel(confidence: number): string {
  if (confidence >= 80) return 'High';
  if (confidence >= 60) return 'Moderate';
  if (confidence >= 40) return 'Low';
  return 'Very Low';
}