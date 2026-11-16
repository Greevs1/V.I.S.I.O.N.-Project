/**
 * decisionIntelligence/outcomeCoordinator.ts — Phase D.1
 *
 * Decision Outcome Intelligence Coordinator.
 *
 * It is NOT a new truth engine.
 * It composes existing certified outputs into a Decision Outcome Context.
 *
 * It performs:
 *   - deterministic review-state derivation (from existing fields)
 *   - expected vs actual comparison (analytical, not final)
 *   - outcome readiness assessment
 *   - too-early / inconclusive detection
 *
 * It performs NO authoritative financial calculation.
 * It does NOT set the final outcome_status (humans own that).
 */

import type {
  BusinessDecision,
  ExpectedOutcome,
  RelevantMemoryRef,
  TimelineEventRef,
  GrowthPlanSummaryRef,
  DecisionEvidence,
  DecisionAssumption,
  DecisionOption,
} from './types.ts';
import type {
  OutcomeReviewState,
  OutcomeComparisonStatus,
  OutcomeComparison,
  DecisionOutcomeContext,
  DecisionOutcomeContextMeta,
  SprintSummaryRef,
} from './outcomeTypes.ts';

// ── Review State Derivation ───────────────────────────────────────────────────
/**
 * Deterministic review state derived from existing fields.
 * NOT_SCHEDULED, SCHEDULED, DUE, OVERDUE, REVIEWED.
 * IN_REVIEW is a frontend state — not returned here.
 */
export function getOutcomeReviewState(
  decision: BusinessDecision,
  now: Date = new Date(),
): OutcomeReviewState {
  // REVIEWED — human has confirmed the outcome
  if (decision.outcome_reviewed_at) return 'REVIEWED';

  // Not yet reviewed — derive from review date
  if (!decision.outcome_review_date) return 'NOT_SCHEDULED';

  const reviewDate = new Date(decision.outcome_review_date + 'T00:00:00Z');
  const nowDate = new Date(now.toISOString().split('T')[0] + 'T00:00:00Z');
  const diffMs = reviewDate.getTime() - nowDate.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'OVERDUE';
  if (diffDays <= 7) return 'DUE';
  return 'SCHEDULED';
}

// ── Outcome Context Builder ─────────────────────────────────────────────────
/**
 * Build a Decision Outcome Context from certified outputs.
 *
 * This is a PURE function — it takes all inputs and composes them.
 * The backend function fetches inputs from Supabase and passes them here.
 *
 * The original decision is preserved immutably — current state is displayed
 * separately, never overwriting decision-time context.
 */
export function buildDecisionOutcomeContext(params: {
  decision: BusinessDecision;
  current_intelligence_contract: Record<string, unknown> | null;
  contract_version: string | null;
  growth_plan_summary: GrowthPlanSummaryRef | null;
  sprint_summary: SprintSummaryRef | null;
  timeline_events_since_decision: TimelineEventRef[];
  relevant_memories: RelevantMemoryRef[];
}): DecisionOutcomeContext {
  const {
    decision,
    current_intelligence_contract,
    contract_version,
    growth_plan_summary,
    sprint_summary,
    timeline_events_since_decision,
    relevant_memories,
  } = params;

  const sourcesUsed: string[] = ['business_decisions'];
  if (current_intelligence_contract) sourcesUsed.push('shared_intelligence_contract');
  if (growth_plan_summary) sourcesUsed.push('growth_plan');
  if (sprint_summary) sourcesUsed.push('sprint');
  if (timeline_events_since_decision.length > 0) sourcesUsed.push('business_timeline');
  if (relevant_memories.length > 0) sourcesUsed.push('business_memory');

  // Extract decision-time evidence from source_context_snapshot (immutable)
  const snapshot = decision.source_context_snapshot as Record<string, unknown> | null;
  const decisionTimeEvidence: DecisionEvidence[] =
    (snapshot?.evidence as DecisionEvidence[]) || decision.evidence || [];
  const decisionTimeAssumptions: DecisionAssumption[] =
    (snapshot?.assumptions as DecisionAssumption[]) || decision.assumptions || [];

  // Selected option
  const selectedOption: DecisionOption | null =
    decision.options.find((o) => o.option_id === decision.selected_option_id) || null;

  // Elapsed days since decision
  const elapsedDays = decision.decided_at
    ? Math.max(0, Math.floor((Date.now() - new Date(decision.decided_at).getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  // Missing evidence
  const missingEvidence = identifyMissingEvidence(decision, current_intelligence_contract);

  // Conflicts
  const conflicts = identifyConflicts(decision, current_intelligence_contract);

  // Confidence (reflects evidence quality, not outcome prediction)
  const confidence = assessOutcomeConfidence(
    decision,
    current_intelligence_contract,
    timeline_events_since_decision,
    missingEvidence,
    conflicts,
  );

  const meta: DecisionOutcomeContextMeta = {
    sources_used: sourcesUsed,
    contract_consumed: !!current_intelligence_contract,
    no_calculations_performed: true,
    no_duplicate_intelligence: true,
    original_decision_preserved: true,
    generated_at: new Date().toISOString(),
  };

  return {
    decision_id: decision.decision_id,
    business_id: decision.business_id,
    original_decision: decision,
    selected_option: selectedOption,
    decision_reason: decision.decision_reason,
    decided_at: decision.decided_at,
    expected_outcomes: decision.expected_outcomes || [],
    decision_time_evidence: decisionTimeEvidence,
    decision_time_assumptions: decisionTimeAssumptions,
    current_intelligence_contract,
    contract_version,
    growth_plan_summary,
    sprint_summary,
    timeline_events_since_decision,
    relevant_memories,
    elapsed_days: elapsedDays,
    missing_evidence: missingEvidence,
    conflicts,
    confidence,
    _meta: meta,
  };
}

// ── Expected vs Actual Comparison ────────────────────────────────────────────
/**
 * Compare expected outcomes to current evidence from the Shared Contract.
 *
 * Returns ANALYTICAL statuses — NOT the final human-confirmed outcome.
 *
 * For numeric outcomes (metric_key defined):
 *   Looks up current value in the contract.
 *   ACHIEVED / PARTIALLY_ACHIEVED / NOT_ACHIEVED / TOO_EARLY / UNKNOWN
 *
 * For non-numeric outcomes (no metric_key):
 *   Uses evidence from timeline, growth plan, sprint.
 *   NOT_MEASURABLE / UNKNOWN / ACHIEVED (if evidence supports)
 */
export function compareExpectedVsActual(
  expectedOutcomes: ExpectedOutcome[],
  contract: Record<string, unknown> | null,
  elapsedDays: number,
  timelineEvents: TimelineEventRef[],
  growthPlan: GrowthPlanSummaryRef | null,
): OutcomeComparison[] {
  return expectedOutcomes.map((expected) => {
    const comparison: OutcomeComparison = {
      expected_outcome_id: expected.outcome_id,
      description: expected.description,
      expected_value: formatExpectedValue(expected),
      current_evidence: '',
      delta: null,
      status: 'UNKNOWN',
      confidence: null,
      metric_key: expected.metric_key || null,
      numeric_delta: null,
    };

    // Numeric outcome — look up in contract
    if (expected.metric_key) {
      const currentValue = lookupMetricFromContract(expected.metric_key, contract);
      if (currentValue == null) {
        comparison.status = isTooEarly(expected, elapsedDays) ? 'TOO_EARLY' : 'UNKNOWN';
        comparison.current_evidence = 'Metric not available in current contract';
        return comparison;
      }

      comparison.current_evidence = formatMetricValue(currentValue);
      comparison.numeric_delta = computeNumericDelta(expected, currentValue);
      comparison.delta = comparison.numeric_delta != null
        ? `${comparison.numeric_delta > 0 ? '+' : ''}${comparison.numeric_delta}`
        : null;
      comparison.status = compareNumericOutcome(expected, currentValue, elapsedDays);
      comparison.confidence = 70;
      return comparison;
    }

    // Non-numeric outcome — use evidence
    const evidence = findEvidenceForOutcome(expected, timelineEvents, growthPlan);
    if (!evidence) {
      comparison.status = isTooEarly(expected, elapsedDays) ? 'TOO_EARLY' : 'UNKNOWN';
      comparison.current_evidence = 'No supporting evidence found yet';
      return comparison;
    }

    comparison.current_evidence = evidence;
    comparison.status = 'ACHIEVED'; // If evidence supports completion
    comparison.confidence = 60;
    return comparison;
  });
}

// ── Outcome Readiness Assessment ─────────────────────────────────────────────
/**
 * Assess whether there is enough evidence to review the outcome.
 */
export function assessOutcomeReadiness(context: DecisionOutcomeContext): {
  ready: boolean;
  reason: string;
  too_early: boolean;
} {
  // No expected outcomes — can't compare
  if (context.expected_outcomes.length === 0) {
    return { ready: false, reason: 'No expected outcomes defined', too_early: false };
  }

  // Check if all outcomes are TOO_EARLY
  const allTooEarly = context.expected_outcomes.every(
    (e) => isTooEarly(e, context.elapsed_days),
  );
  if (allTooEarly) {
    return {
      ready: false,
      reason: 'Too early to assess — all outcomes have future horizons',
      too_early: true,
    };
  }

  // No current contract — can't compare numeric outcomes
  if (!context.current_intelligence_contract && context.expected_outcomes.some((e) => e.metric_key)) {
    return {
      ready: false,
      reason: 'Current business intelligence not available',
      too_early: false,
    };
  }

  // Missing evidence
  if (context.missing_evidence.length > 0) {
    return {
      ready: false,
      reason: `Missing evidence: ${context.missing_evidence.join(', ')}`,
      too_early: false,
    };
  }

  return { ready: true, reason: 'Sufficient evidence for outcome review', too_early: false };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isTooEarly(expected: ExpectedOutcome, elapsedDays: number): boolean {
  // Parse time_horizon — supports "90 days", "6 months", "1 year", "120 days"
  const horizonDays = parseTimeHorizon(expected.time_horizon);
  if (horizonDays == null) return false;
  // Too early if less than 50% of the horizon has elapsed
  return elapsedDays < horizonDays * 0.5;
}

function parseTimeHorizon(horizon: string): number | null {
  if (!horizon) return null;
  const match = horizon.match(/(\d+)\s*(day|week|month|year)/i);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  switch (unit) {
    case 'day': return value;
    case 'week': return value * 7;
    case 'month': return value * 30;
    case 'year': return value * 365;
    default: return null;
  }
}

function lookupMetricFromContract(
  metricKey: string,
  contract: Record<string, unknown> | null,
): number | string | null {
  if (!contract) return null;
  // Check profitability section
  const profitability = contract.profitability as Record<string, unknown> | undefined;
  if (profitability && profitability[metricKey] != null) {
    return profitability[metricKey] as number;
  }
  // Check valuation section
  const valuation = contract.valuation as Record<string, unknown> | undefined;
  if (valuation && valuation[metricKey] != null) {
    return valuation[metricKey] as number;
  }
  // Check tax section
  const tax = contract.tax as Record<string, unknown> | undefined;
  if (tax && tax[metricKey] != null) {
    return tax[metricKey] as number;
  }
  // Check operations section
  const operations = contract.operations as Record<string, unknown> | undefined;
  if (operations && operations[metricKey] != null) {
    return operations[metricKey] as number;
  }
  return null;
}

function compareNumericOutcome(
  expected: ExpectedOutcome,
  currentValue: number,
  elapsedDays: number,
): OutcomeComparisonStatus {
  if (isTooEarly(expected, elapsedDays)) return 'TOO_EARLY';

  const target = typeof expected.target_value === 'number' ? expected.target_value : null;
  const baseline = typeof expected.baseline_value === 'number' ? expected.baseline_value : null;

  if (target == null) return 'UNKNOWN';

  const direction = expected.target_direction || 'increase';

  if (direction === 'increase' || direction === 'achieve') {
    if (currentValue >= target) return 'ACHIEVED';
    if (baseline != null && currentValue > baseline) return 'PARTIALLY_ACHIEVED';
    return 'NOT_ACHIEVED';
  }

  if (direction === 'decrease') {
    if (currentValue <= target) return 'ACHIEVED';
    if (baseline != null && currentValue < baseline) return 'PARTIALLY_ACHIEVED';
    return 'NOT_ACHIEVED';
  }

  if (direction === 'maintain') {
    if (baseline != null) {
      const tolerance = Math.abs(baseline * 0.05); // 5% tolerance
      if (Math.abs(currentValue - baseline) <= tolerance) return 'ACHIEVED';
    }
    return 'PARTIALLY_ACHIEVED';
  }

  return 'UNKNOWN';
}

function computeNumericDelta(
  expected: ExpectedOutcome,
  currentValue: number,
): number | null {
  const baseline = typeof expected.baseline_value === 'number' ? expected.baseline_value : null;
  if (baseline == null) return null;
  return Math.round((currentValue - baseline) * 100) / 100;
}

function formatExpectedValue(expected: ExpectedOutcome): string {
  if (expected.target_value != null && expected.baseline_value != null) {
    return `${expected.baseline_value} → ${expected.target_value}`;
  }
  if (expected.target_value != null) {
    return `Target: ${expected.target_value}`;
  }
  return expected.success_indicator || expected.description;
}

function formatMetricValue(value: number | string): string {
  if (typeof value === 'number') {
    return `${value}`;
  }
  return String(value);
}

function findEvidenceForOutcome(
  expected: ExpectedOutcome,
  timelineEvents: TimelineEventRef[],
  growthPlan: GrowthPlanSummaryRef | null,
): string | null {
  // Check timeline events for relevant evidence
  const relevantEvents = timelineEvents.filter((e) =>
    e.title.toLowerCase().includes(expected.description.toLowerCase().split(' ')[0].toLowerCase()) ||
    e.title.toLowerCase().includes('hired') ||
    e.title.toLowerCase().includes('completed') ||
    e.title.toLowerCase().includes('launched'),
  );
  if (relevantEvents.length > 0) {
    return relevantEvents.map((e) => e.title).join('; ');
  }

  // Check growth plan
  if (growthPlan && growthPlan.active_initiatives > 0) {
    return `${growthPlan.active_initiatives} active growth initiatives in progress`;
  }

  return null;
}

function identifyMissingEvidence(
  decision: BusinessDecision,
  contract: Record<string, unknown> | null,
): string[] {
  const missing: string[] = [];
  if (!contract) missing.push('Current business intelligence contract');
  if (decision.expected_outcomes.length === 0) missing.push('Expected outcomes not yet defined');
  return missing;
}

function identifyConflicts(
  decision: BusinessDecision,
  contract: Record<string, unknown> | null,
): string[] {
  // Placeholder — future conflict detection between expected and actual
  return [];
}

function assessOutcomeConfidence(
  decision: BusinessDecision,
  contract: Record<string, unknown> | null,
  timelineEvents: TimelineEventRef[],
  missingEvidence: string[],
  conflicts: string[],
): number | null {
  if (!contract) return null;
  let confidence = 70;
  if (missingEvidence.length > 0) confidence -= 15 * missingEvidence.length;
  if (conflicts.length > 0) confidence -= 10 * conflicts.length;
  if (timelineEvents.length > 0) confidence += 5;
  return Math.max(0, Math.min(100, confidence));
}