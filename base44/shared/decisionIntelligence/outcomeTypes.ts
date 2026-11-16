/**
 * decisionIntelligence/outcomeTypes.ts — Phase D.1
 *
 * Decision Outcome Intelligence — Type Definitions.
 *
 * This module closes the decision-learning loop:
 *   DECISION → EXPECTED OUTCOMES → EXECUTION → REVIEW DATE →
 *   CURRENT EVIDENCE → OUTCOME ANALYSIS → HUMAN CONFIRMATION →
 *   ACTUAL OUTCOME → BUSINESS MEMORY / TIMELINE / NEXT ACTION
 *
 * Constitution Compliance:
 *   Article I — One Truth (current evidence from Shared Contract, never recalculated)
 *   Article V — Advisor Governance (AI analyzes, humans confirm outcome)
 *   Article VII — Extension First (reuses existing fields, no new table)
 *   Article XII — Immutability (decision-time + review-time state preserved)
 *
 * OUTCOME AUTHORITY:
 *   V.I.S.I.O.N. may analyze evidence and recommend an outcome classification,
 *   but only an authorized human may confirm whether a business decision
 *   succeeded, partially succeeded, failed, remains ongoing, or is inconclusive.
 */

import type {
  BusinessDecision,
  DecisionOption,
  DecisionEvidence,
  DecisionAssumption,
  ExpectedOutcome,
  ActualOutcome,
  OutcomeStatus,
  RelevantMemoryRef,
  TimelineEventRef,
  GrowthPlanSummaryRef,
} from './types.ts';

// ── Outcome Review State (deterministic, DERIVED — not persisted) ────────────
export type OutcomeReviewState =
  | 'NOT_SCHEDULED'
  | 'SCHEDULED'
  | 'DUE'
  | 'OVERDUE'
  | 'IN_REVIEW'
  | 'REVIEWED';

// ── Outcome Comparison Status (ANALYTICAL — not human-confirmed) ─────────────
export type OutcomeComparisonStatus =
  | 'ACHIEVED'
  | 'PARTIALLY_ACHIEVED'
  | 'NOT_ACHIEVED'
  | 'TOO_EARLY'
  | 'UNKNOWN'
  | 'NOT_MEASURABLE';

// ── Sprint Summary Reference ──────────────────────────────────────────────────
export interface SprintSummaryRef {
  sprint_id: string;
  status: string;
  progress_percent: number;
  path_title: string | null;
}

// ── Decision Outcome Context ──────────────────────────────────────────────────
export interface DecisionOutcomeContext {
  decision_id: string;
  business_id: string;

  // Original decision (immutable — from decision record + source_context_snapshot)
  original_decision: BusinessDecision;
  selected_option: DecisionOption | null;
  decision_reason: string;
  decided_at: string | null;

  // Expected outcomes (decision-time)
  expected_outcomes: ExpectedOutcome[];
  decision_time_evidence: DecisionEvidence[];
  decision_time_assumptions: DecisionAssumption[];

  // Current state (from Shared Contract — read-only, never recalculated)
  current_intelligence_contract: Record<string, unknown> | null;
  contract_version: string | null;

  // Execution evidence (from existing systems — read-only)
  growth_plan_summary: GrowthPlanSummaryRef | null;
  sprint_summary: SprintSummaryRef | null;

  // Timeline events since decision
  timeline_events_since_decision: TimelineEventRef[];

  // Relevant memories
  relevant_memories: RelevantMemoryRef[];

  // Elapsed time
  elapsed_days: number;

  // Analysis inputs
  missing_evidence: string[];
  conflicts: string[];
  confidence: number | null;

  // Provenance
  _meta: DecisionOutcomeContextMeta;
}

export interface DecisionOutcomeContextMeta {
  sources_used: string[];
  contract_consumed: boolean;
  no_calculations_performed: true;
  no_duplicate_intelligence: true;
  original_decision_preserved: true;
  generated_at: string;
}

// ── Outcome Comparison (per expected outcome) ─────────────────────────────────
export interface OutcomeComparison {
  expected_outcome_id: string;
  description: string;
  expected_value: string;
  current_evidence: string;
  delta: string | null;
  status: OutcomeComparisonStatus;
  confidence: number | null;
  metric_key: string | null;
  numeric_delta: number | null;
}

// ── AI Outcome Analysis (advisory only — human must confirm) ────────────────
export interface OutcomeAnalysis {
  analysis_id: string;
  decision_id: string;
  summary: string;
  what_improved: string[];
  what_did_not: string[];
  expected_vs_actual: OutcomeComparison[];
  assumptions_that_held: string[];
  assumptions_that_failed: string[];
  unexpected_developments: string[];
  confidence: number;
  missing_information: string[];
  possible_lessons: string[];
  recommended_follow_up: string;
  suggested_outcome_status: OutcomeStatus | null;
  generated_at: string;
}

// ── Outcome Memory Candidate (lessons → Business Memory) ─────────────────────
export interface OutcomeMemoryCandidate {
  decision_id: string;
  business_id: string;
  category: string;
  title: string;
  summary: string;
  effective_date: string;
  importance: string;
  source_reference: {
    record_type: 'business_decision_outcome';
    record_id: string;
    record_summary: string;
  };
  client_visible: boolean;
  relevance_tags: string[];
}

// ── Client-Safe Outcome Review ────────────────────────────────────────────────
export interface ClientSafeOutcomeAnalysis {
  summary: string;
  what_improved: string[];
  what_did_not: string[];
  expected_vs_actual: OutcomeComparison[];
  confidence: number;
  suggested_outcome_status: OutcomeStatus | null;
}

export interface ClientSafeOutcomeReview {
  decision_id: string;
  title: string;
  decided_at: string | null;
  selected_option_label: string | null;
  decision_reason: string;
  expected_outcomes: ExpectedOutcome[];
  actual_outcomes: ActualOutcome[];
  outcome_status: OutcomeStatus | null;
  outcome_review_state: OutcomeReviewState;
  outcome_review_date: string | null;
  outcome_notes: string;
  analysis: ClientSafeOutcomeAnalysis | null;
  _meta: {
    client_safe: true;
    excluded_internal_items: string[];
  };
}

// ── Reviews Due (for Meeting/Living Intelligence surfacing) ──────────────────
export interface ReviewDueEntry {
  decision_id: string;
  business_id: string;
  title: string;
  decision_type: string;
  decided_at: string | null;
  outcome_review_date: string | null;
  outcome_review_state: OutcomeReviewState;
  importance: string;
  days_overdue: number;
}