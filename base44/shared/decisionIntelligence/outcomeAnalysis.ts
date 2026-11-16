/**
 * decisionIntelligence/outcomeAnalysis.ts — Phase D.1
 *
 * AI Outcome Analysis — advisory only.
 *
 * AI may:
 *   - analyze evidence
 *   - compare expected vs actual
 *   - identify lessons
 *   - recommend a follow-up action
 *   - SUGGEST an outcome status
 *
 * AI may NOT:
 *   - set the final outcome_status
 *   - create Verified Business Value Created
 *   - auto-promote lessons to durable memory
 *
 * Only an authorized human may confirm the final outcome.
 */

import type {
  BusinessDecision,
  OutcomeStatus,
} from './types.ts';
import type {
  DecisionOutcomeContext,
  OutcomeAnalysis,
  OutcomeComparison,
} from './outcomeTypes.ts';
import { compareExpectedVsActual } from './outcomeCoordinator.ts';

/**
 * Build the LLM prompt for AI outcome analysis.
 * The prompt includes:
 *   - original decision (immutable)
 *   - expected outcomes
 *   - current evidence from the Shared Contract
 *   - timeline events
 *   - execution state
 *
 * The AI is instructed to SUGGEST an outcome status, not set it.
 */
export function buildOutcomeAnalysisPrompt(
  decision: BusinessDecision,
  context: DecisionOutcomeContext,
): string {
  const selectedOption = context.selected_option;
  const expectedOutcomes = decision.expected_outcomes || [];

  const comparisons = compareExpectedVsActual(
    expectedOutcomes,
    context.current_intelligence_contract,
    context.elapsed_days,
    context.timeline_events_since_decision,
    context.growth_plan_summary,
  );

  const prompt = `You are an advisory intelligence analyzing the outcome of a business decision.

DECISION (immutable — do not rewrite history):
  Title: ${decision.title}
  Type: ${decision.decision_type}
  Question: ${decision.question}
  Selected Option: ${selectedOption?.label || 'Unknown'}
  Decision Reason: ${decision.decision_reason}
  Decided At: ${decision.decided_at?.split('T')[0] || 'Unknown'}
  Days Elapsed: ${context.elapsed_days}

EXPECTED OUTCOMES:
${expectedOutcomes.map((e, i) => `  ${i + 1}. ${e.description}
     Success Indicator: ${e.success_indicator}
     Time Horizon: ${e.time_horizon}
     ${e.metric_key ? `Metric: ${e.metric_key}, Baseline: ${e.baseline_value}, Target: ${e.target_value}, Direction: ${e.target_direction}` : 'Non-numeric outcome'}`).join('\n')}

CURRENT EVIDENCE (from Shared Business Intelligence Contract — read-only):
${context.current_intelligence_contract ? JSON.stringify({
    profitability: context.current_intelligence_contract.profitability,
    valuation: context.current_intelligence_contract.valuation,
    tax: context.current_intelligence_contract.tax,
    operations: context.current_intelligence_contract.operations,
  }, null, 2) : 'No contract available'}

EXECUTION STATE:
  Growth Plan: ${context.growth_plan_summary ? `${context.growth_plan_summary.active_initiatives} active initiatives` : 'No data'}
  Sprint: ${context.sprint_summary ? `${context.sprint_summary.status}, ${context.sprint_summary.progress_percent}% progress` : 'No data'}

TIMELINE EVENTS SINCE DECISION:
${context.timeline_events_since_decision.length > 0
    ? context.timeline_events_since_decision.map((e) => `  - ${e.timestamp?.split('T')[0]}: ${e.title}`).join('\n')
    : '  No timeline events recorded'}

PRELIMINARY COMPARISON (analytical — not final):
${comparisons.map((c) => `  - ${c.description}: ${c.status} (expected: ${c.expected_value}, current: ${c.current_evidence})`).join('\n')}

DECISION-TIME ASSUMPTIONS:
${decision.assumptions.map((a) => `  - ${a.statement} (confidence: ${a.confidence || 'unknown'})`).join('\n')}

Analyze this decision's outcome. You are ADVISORY ONLY — you cannot set the final outcome status.

Provide:
1. summary: A concise executive summary of what happened
2. what_improved: List of things that went better than expected
3. what_did_not: List of things that did not meet expectations
4. expected_vs_actual: For each expected outcome, compare expected to current evidence
5. assumptions_that_held: Which decision-time assumptions were validated
6. assumptions_that_failed: Which decision-time assumptions were invalidated
7. unexpected_developments: Things that happened that weren't anticipated
8. confidence: 0-100 confidence in your analysis (reflects evidence quality, not outcome prediction)
9. missing_information: What evidence is still needed
10. possible_lessons: Durable lessons this decision's outcome teaches (for Business Memory candidates)
11. recommended_follow_up: What should happen next
12. suggested_outcome_status: SUGGEST one of: pending, ongoing, succeeded, partially_succeeded, failed, inconclusive

IMPORTANT: If it is too early to assess (less than 50% of the time horizon has elapsed), suggest "ongoing" or "pending".
If evidence is insufficient, suggest "inconclusive".
Do not force a success or failure judgment.`;

  return prompt;
}

/**
 * Process the LLM response into an OutcomeAnalysis.
 * The suggested_outcome_status is advisory — the human must confirm.
 */
export function processOutcomeAnalysisResponse(
  decisionId: string,
  llmResult: unknown,
): OutcomeAnalysis {
  const result = llmResult as Record<string, unknown>;
  const analysisId = `analysis-${decisionId}-${Date.now()}`;
  const now = new Date().toISOString();

  return {
    analysis_id: analysisId,
    decision_id: decisionId,
    summary: String(result.summary || ''),
    what_improved: Array.isArray(result.what_improved) ? result.what_improved as string[] : [],
    what_did_not: Array.isArray(result.what_did_not) ? result.what_did_not as string[] : [],
    expected_vs_actual: Array.isArray(result.expected_vs_actual)
      ? (result.expected_vs_actual as OutcomeComparison[])
      : [],
    assumptions_that_held: Array.isArray(result.assumptions_that_held)
      ? result.assumptions_that_held as string[] : [],
    assumptions_that_failed: Array.isArray(result.assumptions_that_failed)
      ? result.assumptions_that_failed as string[] : [],
    unexpected_developments: Array.isArray(result.unexpected_developments)
      ? result.unexpected_developments as string[] : [],
    confidence: typeof result.confidence === 'number' ? result.confidence : 50,
    missing_information: Array.isArray(result.missing_information)
      ? result.missing_information as string[] : [],
    possible_lessons: Array.isArray(result.possible_lessons)
      ? result.possible_lessons as string[] : [],
    recommended_follow_up: String(result.recommended_follow_up || ''),
    suggested_outcome_status: validateSuggestedStatus(result.suggested_outcome_status),
    generated_at: now,
  };
}

function validateSuggestedStatus(value: unknown): OutcomeStatus | null {
  if (typeof value !== 'string') return null;
  const valid: OutcomeStatus[] = [
    'pending', 'ongoing', 'succeeded', 'partially_succeeded', 'failed', 'inconclusive',
  ];
  return valid.includes(value as OutcomeStatus) ? (value as OutcomeStatus) : null;
}

/**
 * Build the JSON schema for the LLM response.
 */
export function getOutcomeAnalysisSchema() {
  return {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      what_improved: { type: 'array', items: { type: 'string' } },
      what_did_not: { type: 'array', items: { type: 'string' } },
      expected_vs_actual: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            expected_outcome_id: { type: 'string' },
            description: { type: 'string' },
            expected_value: { type: 'string' },
            current_evidence: { type: 'string' },
            delta: { type: 'string' },
            status: {
              type: 'string',
              enum: ['ACHIEVED', 'PARTIALLY_ACHIEVED', 'NOT_ACHIEVED', 'TOO_EARLY', 'UNKNOWN', 'NOT_MEASURABLE'],
            },
            confidence: { type: 'number' },
          },
        },
      },
      assumptions_that_held: { type: 'array', items: { type: 'string' } },
      assumptions_that_failed: { type: 'array', items: { type: 'string' } },
      unexpected_developments: { type: 'array', items: { type: 'string' } },
      confidence: { type: 'number' },
      missing_information: { type: 'array', items: { type: 'string' } },
      possible_lessons: { type: 'array', items: { type: 'string' } },
      recommended_follow_up: { type: 'string' },
      suggested_outcome_status: {
        type: 'string',
        enum: ['pending', 'ongoing', 'succeeded', 'partially_succeeded', 'failed', 'inconclusive'],
      },
    },
    required: ['summary', 'confidence', 'suggested_outcome_status'],
  };
}