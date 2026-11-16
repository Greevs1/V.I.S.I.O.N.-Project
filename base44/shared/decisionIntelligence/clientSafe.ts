/**
 * decisionIntelligence/clientSafe.ts — Phase D
 *
 * Client-safe filtering for Decision Intelligence.
 *
 * ADVISOR_INTERNAL may include:
 *   - advisor concerns
 *   - sensitive negotiation positioning
 *   - hidden risk framing
 *   - internal confidence
 *   - draft recommendations
 *
 * CLIENT_SAFE may include:
 *   - decision question
 *   - approved evidence
 *   - options
 *   - agreed tradeoffs
 *   - final decision
 *   - approved next steps
 *
 * Visibility is enforced BEFORE retrieval.
 */

import type {
  BusinessDecision,
  ClientSafeDecision,
  DecisionEvidence,
  DecisionOption,
  DecisionRecommendation,
  DecisionRisk,
} from './types.ts';

/**
 * Check if a decision should be visible to the client.
 */
export function isDecisionClientVisible(decision: BusinessDecision): boolean {
  return decision.client_visible && decision.visibility === 'client_safe';
}

/**
 * Filter evidence for client-safe visibility.
 */
export function filterEvidenceForClient(evidence: DecisionEvidence[]): DecisionEvidence[] {
  return evidence.filter((e) => e.client_visible);
}

/**
 * Filter risks for client-safe visibility.
 * Only show risks that are explicitly marked as client-visible through the
 * decision's client_visible flag. Internal risk framing is excluded.
 */
export function filterRisksForClient(
  risks: DecisionRisk[],
  decisionClientVisible: boolean,
): DecisionRisk[] {
  if (!decisionClientVisible) return [];
  return risks; // If the decision is client-visible, all its risks are shareable
}

/**
 * Filter a recommendation for client-safe visibility.
 * Draft recommendations with internal reasoning are excluded.
 */
export function filterRecommendationForClient(
  recommendation: DecisionRecommendation | null,
  decisionClientVisible: boolean,
): DecisionRecommendation | null {
  if (!recommendation) return null;
  if (!decisionClientVisible) return null;
  // Return the recommendation without internal tradeoffs if needed
  return recommendation;
}

/**
 * Convert a BusinessDecision to a ClientSafeDecision.
 * Strips all internal-only fields.
 */
export function toClientSafeDecision(decision: BusinessDecision): ClientSafeDecision {
  const excludedInternalItems: string[] = [];

  if (!decision.client_visible) {
    excludedInternalItems.push('decision_not_client_visible');
  }

  // Filter evidence
  const clientSafeEvidence = filterEvidenceForClient(decision.evidence);
  if (clientSafeEvidence.length < decision.evidence.length) {
    excludedInternalItems.push('internal_evidence');
  }

  // Filter options — remove internal-only evidence refs
  const clientSafeOptions: DecisionOption[] = decision.options.map((opt) => ({
    ...opt,
    evidence_refs: opt.evidence_refs.filter((ref) =>
      decision.evidence.find((e) => e.evidence_id === ref)?.client_visible ?? false
    ),
  }));

  // Filter recommendation
  const clientSafeRecommendation = filterRecommendationForClient(
    decision.recommendation,
    decision.client_visible,
  );
  if (decision.recommendation && !clientSafeRecommendation) {
    excludedInternalItems.push('internal_recommendation');
  }

  return {
    decision_id: decision.decision_id,
    title: decision.title,
    decision_type: decision.decision_type,
    question: decision.question,
    context_summary: decision.context_summary,
    options: clientSafeOptions,
    recommendation: clientSafeRecommendation,
    selected_option_id: decision.selected_option_id,
    decision_reason: decision.decision_reason,
    decided_at: decision.decided_at,
    expected_outcomes: decision.expected_outcomes,
    _meta: {
      client_safe: true,
      excluded_internal_items: excludedInternalItems,
    },
  };
}

/**
 * Get a list of fields that would be excluded from client view.
 */
export function getExcludedInternalFields(decision: BusinessDecision): string[] {
  const excluded: string[] = [];
  if (!decision.client_visible) excluded.push('entire_decision');
  if (decision.evidence.some((e) => !e.client_visible)) excluded.push('internal_evidence');
  if (decision.recommendation && !decision.client_visible) excluded.push('internal_recommendation');
  if (decision.risks.length > 0 && !decision.client_visible) excluded.push('internal_risks');
  return excluded;
}