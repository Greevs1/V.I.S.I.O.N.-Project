/**
 * decisionIntelligence/outcomeClientSafe.ts — Phase D.1
 *
 * Client-safe filtering for Decision Outcome Reviews.
 *
 * ADVISOR_INTERNAL outcome analysis may include:
 *   - execution concerns
 *   - advisor critique
 *   - private assumptions
 *   - negotiation observations
 *   - internal confidence assessments
 *
 * CLIENT_SAFE outcome review includes:
 *   - original decision
 *   - expected outcomes
 *   - confirmed actual outcomes
 *   - human-confirmed outcome status
 *   - approved lessons
 *
 * Visibility is enforced BEFORE retrieval/output.
 */

import type {
  BusinessDecision,
  OutcomeStatus,
  ExpectedOutcome,
  ActualOutcome,
} from './types.ts';
import type {
  OutcomeReviewState,
  OutcomeAnalysis,
  ClientSafeOutcomeReview,
  ClientSafeOutcomeAnalysis,
} from './outcomeTypes.ts';
import { getOutcomeReviewState } from './outcomeCoordinator.ts';

/**
 * Convert a BusinessDecision + optional analysis to a ClientSafeOutcomeReview.
 * Strips all internal-only analysis fields.
 */
export function toClientSafeOutcomeReview(
  decision: BusinessDecision,
  analysis: OutcomeAnalysis | null,
): ClientSafeOutcomeReview {
  const excludedInternalItems: string[] = [];

  // Filter expected outcomes — all are client-safe (they were agreed at decision time)
  const clientSafeExpected: ExpectedOutcome[] = decision.expected_outcomes || [];

  // Filter actual outcomes — all confirmed outcomes are client-safe
  const clientSafeActual: ActualOutcome[] = decision.actual_outcomes || [];

  // Filter analysis — strip internal fields
  let clientSafeAnalysis: ClientSafeOutcomeAnalysis | null = null;
  if (analysis) {
    if (!decision.client_visible && decision.visibility !== 'client_safe') {
      excludedInternalItems.push('internal_analysis');
    } else {
      clientSafeAnalysis = {
        summary: analysis.summary,
        what_improved: analysis.what_improved,
        what_did_not: analysis.what_did_not,
        expected_vs_actual: analysis.expected_vs_actual,
        confidence: analysis.confidence,
        suggested_outcome_status: analysis.suggested_outcome_status,
      };
    }
  }

  if (!decision.client_visible && decision.visibility !== 'client_safe') {
    excludedInternalItems.push('internal_outcome_review');
  }

  const selectedOption = decision.options.find(
    (o) => o.option_id === decision.selected_option_id,
  );

  return {
    decision_id: decision.decision_id,
    title: decision.title,
    decided_at: decision.decided_at,
    selected_option_label: selectedOption?.label || null,
    decision_reason: decision.decision_reason,
    expected_outcomes: clientSafeExpected,
    actual_outcomes: clientSafeActual,
    outcome_status: decision.outcome_status,
    outcome_review_state: getOutcomeReviewState(decision),
    outcome_review_date: decision.outcome_review_date,
    outcome_notes: decision.outcome_notes,
    analysis: clientSafeAnalysis,
    _meta: {
      client_safe: true,
      excluded_internal_items: excludedInternalItems,
    },
  };
}

/**
 * Check if an outcome review should be visible to the client.
 */
export function isOutcomeReviewClientVisible(decision: BusinessDecision): boolean {
  return decision.client_visible || decision.visibility === 'client_safe';
}

/**
 * Get a list of internal-only fields that would be excluded from client view.
 */
export function getExcludedOutcomeInternalFields(
  decision: BusinessDecision,
  analysis: OutcomeAnalysis | null,
): string[] {
  const excluded: string[] = [];
  if (!decision.client_visible && decision.visibility !== 'client_safe') {
    excluded.push('entire_outcome_review');
  }
  if (analysis && !decision.client_visible && decision.visibility !== 'client_safe') {
    excluded.push('internal_analysis');
    excluded.push('assumptions_that_failed');
    excluded.push('unexpected_developments');
  }
  return excluded;
}