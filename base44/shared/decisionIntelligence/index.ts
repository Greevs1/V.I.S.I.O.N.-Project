/**
 * decisionIntelligence/index.ts — Phase D
 *
 * Public API for the Decision Intelligence Foundation.
 *
 * Decision Intelligence is NOT:
 *   - a recommendation engine (BIE/Galileo own that)
 *   - an execution engine (Sprint/Roadmap/Growth Plan own that)
 *   - a truth engine (Shared Intelligence Contract owns that)
 *   - a memory system (Business Memory owns that)
 *
 * Decision Intelligence EXISTS to structure executive decisions.
 * AI proposes reasoning. Humans decide. Existing certified systems execute.
 *
 * Constitution Compliance:
 *   Article I — One Truth (consumes Shared Intelligence Contract)
 *   Article II — Single Ownership (owns "decision framing")
 *   Article III — No Duplicate Intelligence (references certified outputs)
 *   Article V — Advisor Governance (AI proposes, humans decide)
 *   Article VII — Extension First (extends existing systems)
 *   Article XI — Business Isolation (decisions are business-scoped)
 *   Article XII — Immutability (decision-time evidence is preserved)
 */

// Types
export type {
  DecisionType,
  DecisionStatus,
  DecisionImportance,
  DecisionRiskLevel,
  DecisionReadiness,
  DecisionVisibility,
  OutcomeStatus,
  DecisionOption,
  DecisionAssumption,
  DecisionEvidence,
  DecisionRisk,
  DecisionUnknown,
  DecisionRecommendation,
  ExpectedOutcome,
  ActualOutcome,
  ExecutionRoute,
  ExecutionRouteType,
  BusinessDecision,
  DecisionContext,
  DecisionChallenge,
  ChallengedAssumption,
  FailureMode,
  DecisionMemoryCandidate,
  DecisionLedgerEntry,
  ClientSafeDecision,
  RelevantMemoryRef,
  TimelineEventRef,
  ValuationSummaryRef,
  GrowthPlanSummaryRef,
  MeetingContextRef,
  RelevantMetric,
  RelevantRiskRef,
  RelevantCommitmentRef,
  DecisionContextMeta,
} from './types.ts';

export { DECISION_TYPES, DECISION_STATUSES } from './types.ts';

// Coordinator
export { buildDecisionContext, assessDecisionReadiness } from './coordinator.ts';

// Challenge Engine
export {
  buildChallengePrompt,
  processChallengeResponse,
  shouldChallengeBlockDecision,
} from './challengeEngine.ts';

// Client Safety
export {
  isDecisionClientVisible,
  filterEvidenceForClient,
  filterRisksForClient,
  filterRecommendationForClient,
  toClientSafeDecision,
  getExcludedInternalFields,
} from './clientSafe.ts';

// Memory Integration
export {
  shouldGenerateMemoryCandidate,
  generateMemoryCandidateFromDecision,
} from './memoryIntegration.ts';

// Execution Routing
export {
  determineExecutionRoutes,
  markRoutesRouted,
  getPrimaryRoute,
  getRouteLabel,
} from './executionRouting.ts';

// Outcome Intelligence (Phase D.1)
export type {
  OutcomeReviewState,
  OutcomeComparisonStatus,
  SprintSummaryRef,
  DecisionOutcomeContext,
  DecisionOutcomeContextMeta,
  OutcomeComparison,
  OutcomeAnalysis,
  OutcomeMemoryCandidate,
  ClientSafeOutcomeAnalysis,
  ClientSafeOutcomeReview,
  ReviewDueEntry,
} from './outcomeTypes.ts';

export {
  getOutcomeReviewState,
  buildDecisionOutcomeContext,
  compareExpectedVsActual,
  assessOutcomeReadiness,
} from './outcomeCoordinator.ts';

export {
  buildOutcomeAnalysisPrompt,
  processOutcomeAnalysisResponse,
  getOutcomeAnalysisSchema,
} from './outcomeAnalysis.ts';

export {
  shouldGenerateOutcomeMemoryCandidate,
  generateOutcomeMemoryCandidates,
} from './outcomeMemory.ts';

export {
  toClientSafeOutcomeReview,
  isOutcomeReviewClientVisible,
  getExcludedOutcomeInternalFields,
} from './outcomeClientSafe.ts';