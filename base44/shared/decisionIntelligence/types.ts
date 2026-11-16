/**
 * decisionIntelligence/types.ts — Phase D
 *
 * Decision Intelligence Foundation — Type Definitions.
 *
 * Decision Intelligence is NOT:
 *   - a recommendation engine (BIE/Galileo own that)
 *   - an execution engine (Sprint/Roadmap/Growth Plan own that)
 *   - a truth engine (Shared Intelligence Contract owns that)
 *   - a memory system (Business Memory owns that)
 *   - a timeline (CBSS owns that)
 *
 * Decision Intelligence EXISTS to structure executive decisions:
 *   frame → collect evidence → identify options → identify assumptions
 *   → identify risks → compare tradeoffs → recommend (advisory only)
 *   → human decides → route execution → preserve historical context
 *
 * Constitution Compliance:
 *   Article I — One Truth (consumes Shared Intelligence Contract, never bypasses)
 *   Article II — Single Ownership (owns "decision framing", not facts)
 *   Article III — No Duplicate Intelligence (references certified outputs)
 *   Article V — Advisor Governance (AI proposes, humans decide)
 *   Article VII — Extension First (extends existing systems)
 *   Article XI — Business Isolation (decisions are business-scoped)
 *   Article XII — Immutability (decision-time evidence is preserved)
 */

// ── Decision Types (Taxonomy) ─────────────────────────────────────────────────
export type DecisionType =
  | 'strategic'
  | 'financial'
  | 'operating'
  | 'talent'
  | 'capital_allocation'
  | 'acquisition'
  | 'exit'
  | 'pricing'
  | 'growth'
  | 'risk'
  | 'ownership'
  | 'tax'
  | 'technology'
  | 'other';

export const DECISION_TYPES: DecisionType[] = [
  'strategic', 'financial', 'operating', 'talent', 'capital_allocation',
  'acquisition', 'exit', 'pricing', 'growth', 'risk', 'ownership', 'tax',
  'technology', 'other',
];

export interface DecisionTypeDefinition {
  key: DecisionType;
  label: string;
  description: string;
  typical_execution_route: ExecutionRouteType[];
}

// ── Decision Status (Lifecycle) ────────────────────────────────────────────────
export type DecisionStatus =
  | 'draft'
  | 'analyzing'
  | 'needs_information'
  | 'ready_for_decision'
  | 'decided'
  | 'deferred'
  | 'cancelled'
  | 'superseded';

export const DECISION_STATUSES: DecisionStatus[] = [
  'draft', 'analyzing', 'needs_information', 'ready_for_decision',
  'decided', 'deferred', 'cancelled', 'superseded',
];

// ── Decision Importance ────────────────────────────────────────────────────────
export type DecisionImportance = 'critical' | 'strategic' | 'significant' | 'routine';

// ── Decision Risk Level ───────────────────────────────────────────────────────
export type DecisionRiskLevel = 'low' | 'medium' | 'high' | 'critical';

// ── Decision Readiness ─────────────────────────────────────────────────────────
export type DecisionReadiness =
  | 'insufficient_information'
  | 'partially_informed'
  | 'decision_ready'
  | 'needs_advisor_review'
  | 'blocked';

// ── Decision Visibility ───────────────────────────────────────────────────────
export type DecisionVisibility = 'advisor_internal' | 'client_safe';

// ── Outcome Status ─────────────────────────────────────────────────────────────
export type OutcomeStatus =
  | 'pending'
  | 'ongoing'
  | 'succeeded'
  | 'partially_succeeded'
  | 'failed'
  | 'inconclusive';

// ── Decision Option ────────────────────────────────────────────────────────────
export interface DecisionOption {
  option_id: string;
  label: string;
  summary: string;
  advantages: string[];
  disadvantages: string[];
  financial_implications: string | null;
  operational_implications: string | null;
  risk_level: DecisionRiskLevel | null;
  time_horizon: string | null;
  confidence: number | null;
  required_resources: string[];
  dependencies: string[];
  evidence_refs: string[];
  assumption_refs: string[];
}

// ── Decision Assumption ───────────────────────────────────────────────────────
export interface DecisionAssumption {
  assumption_id: string;
  statement: string;
  source: string;
  confidence: number | null;
  verification_status: 'unverified' | 'pending' | 'verified' | 'challenged';
  impact_if_wrong: string;
}

// ── Decision Evidence (references, not copies) ─────────────────────────────────
export interface DecisionEvidence {
  evidence_id: string;
  source_type: 'shared_contract' | 'document' | 'assessment' | 'valuation'
    | 'business_memory' | 'advisor_note' | 'meeting_outcome' | 'timeline_event'
    | 'canonical_fact' | 'benchmark';
  source_name: string;
  source_reference: string;
  summary: string;
  confidence: number | null;
  client_visible: boolean;
}

// ── Decision Risk ──────────────────────────────────────────────────────────────
export interface DecisionRisk {
  risk_id: string;
  description: string;
  severity: DecisionRiskLevel;
  likelihood: 'low' | 'medium' | 'high' | null;
  evidence_refs: string[];
  mitigation: string;
  decision_relevance: string;
}

// ── Decision Unknown / Missing Information ────────────────────────────────────
export interface DecisionUnknown {
  unknown_id: string;
  what_is_missing: string;
  why_it_matters: string;
  how_to_resolve: string;
  destination: 'data_room' | 'assessment' | 'advisor_review' | 'external' | 'none';
  blocks_decision: boolean;
}

// ── Decision Recommendation (advisory only) ────────────────────────────────────
export interface DecisionRecommendation {
  recommended_option_id: string | null;
  recommendation_summary: string;
  why: string;
  evidence_refs: string[];
  assumption_refs: string[];
  tradeoffs: string[];
  confidence: number;
  what_would_change_recommendation: string;
  is_no_recommendation: boolean;
}

// ── Decision Outcome ──────────────────────────────────────────────────────────
export interface ExpectedOutcome {
  outcome_id: string;
  description: string;
  success_indicator: string;
  time_horizon: string;
  // Phase D.1 — Outcome Intelligence extensions (optional, backward-compatible)
  metric_key?: string | null;
  baseline_value?: number | string | null;
  target_value?: number | string | null;
  target_direction?: 'increase' | 'decrease' | 'maintain' | 'achieve' | null;
  target_date?: string | null;
  source?: string | null;
  confidence?: number | null;
  verification_method?: string | null;
  importance?: 'critical' | 'strategic' | 'significant' | 'routine' | null;
}

export interface ActualOutcome {
  outcome_id: string;
  status: OutcomeStatus;
  description: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  notes: string;
  // Phase D.1 — Outcome Intelligence extensions (optional, backward-compatible)
  expected_outcome_id?: string | null;
  actual_result?: string | null;
  metric_key?: string | null;
  actual_value?: number | string | null;
  evidence?: string[] | null;
  confidence?: number | null;
}

// ── Execution Route ────────────────────────────────────────────────────────────
export type ExecutionRouteType =
  | 'growth_plan'
  | 'sprint'
  | 'roadmap'
  | 'document_request'
  | 'verification_queue'
  | 'valuation'
  | 'exit_workflow'
  | 'tax_workflow'
  | 'none';

export interface ExecutionRoute {
  route_type: ExecutionRouteType;
  description: string;
  action_url: string | null;
  routed_at: string | null;
  routed_by: string | null;
}

// ── Business Decision (the full record) ───────────────────────────────────────
export interface BusinessDecision {
  decision_id: string;
  business_id: string;

  title: string;
  decision_type: DecisionType;
  decision_status: DecisionStatus;

  question: string;
  context_summary: string;

  created_by_profile_id: string | null;
  decision_owner_profile_id: string | null;

  created_at: string;
  target_decision_date: string | null;
  decided_at: string | null;

  importance: DecisionImportance;
  risk_level: DecisionRiskLevel;

  meeting_context_id: string | null;

  options: DecisionOption[];
  assumptions: DecisionAssumption[];
  evidence: DecisionEvidence[];
  risks: DecisionRisk[];
  unknowns: DecisionUnknown[];

  recommendation: DecisionRecommendation | null;

  selected_option_id: string | null;
  decision_reason: string;
  decided_by_profile_id: string | null;

  expected_outcomes: ExpectedOutcome[];
  actual_outcomes: ActualOutcome[];
  outcome_status: OutcomeStatus | null;
  outcome_review_date: string | null;
  outcome_reviewed_at: string | null;
  outcome_notes: string;

  source_contract_version: string | null;
  source_context_snapshot: Record<string, unknown> | null;

  visibility: DecisionVisibility;
  client_visible: boolean;

  supersedes_decision_id: string | null;
  superseded_by_decision_id: string | null;

  execution_routes: ExecutionRoute[];

  updated_at: string;
}

// ── Decision Context (composed from certified outputs) ───────────────────────
export interface DecisionContext {
  decision_id: string;
  business_id: string;

  // From Shared Business Intelligence Contract (read-only)
  intelligence_contract: Record<string, unknown> | null;
  contract_version: string | null;

  // From Business Memory (read-only, relevant memories only)
  relevant_memories: RelevantMemoryRef[];

  // From Business Timeline (read-only)
  recent_timeline_events: TimelineEventRef[];

  // From Valuation (read-only, if relevant)
  valuation_summary: ValuationSummaryRef | null;

  // From Growth Plan (read-only)
  growth_plan_summary: GrowthPlanSummaryRef | null;

  // From Meeting Intelligence (read-only, if meeting-scoped)
  meeting_context: MeetingContextRef | null;

  // Decision framing
  decision_question: string;
  decision_type: DecisionType;
  decision_owner: string | null;
  time_horizon: string | null;

  // Relevant metrics from the contract
  relevant_financial_metrics: RelevantMetric[];
  relevant_valuation_metrics: RelevantMetric[];
  relevant_risks: RelevantRiskRef[];
  relevant_commitments: RelevantCommitmentRef[];
  open_dependencies: string[];

  // Missing information
  missing_information: DecisionUnknown[];

  // Provenance
  _meta: DecisionContextMeta;
}

export interface RelevantMemoryRef {
  memory_id: string;
  category: string;
  title: string;
  summary: string;
  effective_date: string | null;
  importance: string;
}

export interface TimelineEventRef {
  event_id: string;
  title: string;
  timestamp: string;
  certified_owner: string;
}

export interface ValuationSummaryRef {
  valuation_id: string;
  current_value: number | null;
  baseline_value: number | null;
  status: string;
}

export interface GrowthPlanSummaryRef {
  total_initiatives: number;
  active_initiatives: number;
  progress_percent: number;
}

export interface MeetingContextRef {
  meeting_id: string;
  intent: string;
  scheduled_at: string | null;
}

export interface RelevantMetric {
  key: string;
  label: string;
  value: number | string | null;
  source: string;
  material: boolean;
}

export interface RelevantRiskRef {
  risk_id: string;
  description: string;
  severity: string;
  certified_owner: string;
}

export interface RelevantCommitmentRef {
  commitment_id: string;
  title: string;
  status: string;
  certified_owner: string;
}

export interface DecisionContextMeta {
  sources_used: string[];
  contract_consumed: boolean;
  no_calculations_performed: true;
  no_duplicate_intelligence: true;
  generated_at: string;
}

// ── Decision Challenge (Devil's Advocate) ─────────────────────────────────────
export interface DecisionChallenge {
  challenge_id: string;
  decision_id: string;
  challenged_assumptions: ChallengedAssumption[];
  confirmation_bias_risks: string[];
  missing_evidence: string[];
  strongest_opposing_case: string;
  failure_modes: FailureMode[];
  challenge_summary: string;
  generated_at: string;
}

export interface ChallengedAssumption {
  assumption_id: string;
  statement: string;
  challenge: string;
  severity: 'low' | 'medium' | 'high';
}

export interface FailureMode {
  mode_id: string;
  description: string;
  trigger: string;
  impact: string;
  mitigation: string;
}

// ── Decision Memory Candidate ──────────────────────────────────────────────────
export interface DecisionMemoryCandidate {
  decision_id: string;
  business_id: string;
  category: string;
  title: string;
  summary: string;
  effective_date: string;
  importance: string;
  source_reference: {
    record_type: 'business_decision';
    record_id: string;
    record_summary: string;
  };
  client_visible: boolean;
  relevance_tags: string[];
}

// ── Decision Ledger Entry ──────────────────────────────────────────────────────
export interface DecisionLedgerEntry {
  decision_id: string;
  title: string;
  decision_type: DecisionType;
  decided_at: string;
  decided_by: string | null;
  selected_option_label: string;
  decision_reason: string;
  recommendation_matched: boolean;
  options_count: number;
  evidence_count: number;
  assumption_count: number;
  importance: DecisionImportance;
  business_id: string;
}

// ── Client-Safe Decision ───────────────────────────────────────────────────────
export interface ClientSafeDecision {
  decision_id: string;
  title: string;
  decision_type: DecisionType;
  question: string;
  context_summary: string;
  options: DecisionOption[];
  recommendation: DecisionRecommendation | null;
  selected_option_id: string | null;
  decision_reason: string;
  decided_at: string | null;
  expected_outcomes: ExpectedOutcome[];
  _meta: {
    client_safe: true;
    excluded_internal_items: string[];
  };
}