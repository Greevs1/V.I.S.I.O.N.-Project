/**
 * Galileo Executive Intelligence Engine — Public API
 * Phase 13.4C.1
 *
 * The decision-making brain of Galileo.
 * One EIE. One Capability Framework. One Context Builder. One Conversation System.
 */

// Types
export type {
  ExecutiveState, ConversationScope, PendingTask, PublicationState,
  GrowthPlanState, VerificationState, MeetingContext, RecentChange,
  Priority, PriorityLevel,
  Intent, IntentType,
  CapabilitySelection,
  ExecutionStrategy, ExecutionStrategyType,
  ExecutiveMemory, MemoryFact,
  Recommendation,
  FollowUpPlan, FollowUpStep,
  InterruptionDecision, InterruptionLevel,
  ExecutiveBrief,
  ConfidenceAssessment,
  SituationAssessment,
  SafetyCheck,
  EIEDecision, EIEInput, EIEContext,
  EIEAnalytics,
} from './types.ts';

// Engine
export { process, processWithoutMessage } from './engine.ts';

// State Model
export { buildExecutiveState, isEmptyState, getStateSummary } from './stateModel.ts';

// Situation Assessment
export { assessSituation } from './situationAssessment.ts';

// Priority Engine
export { determinePriorities, sortPriorities, getTopPriority } from './priorityEngine.ts';

// Intent Resolution
export { resolveIntent } from './intentResolution.ts';

// Capability Selection
export { selectCapability } from './capabilitySelection.ts';

// Execution Strategy
export { determineStrategy, isFreeStrategy } from './executionStrategy.ts';

// Working Memory
export {
  createMemory, getMemory, recordFact, getFact, getFactsByCategory,
  clearMemory, clearExpiredMemories, getAllMemoryIds, getMemorySummary,
} from './workingMemory.ts';

// Recommendation Engine
export { generateRecommendations } from './recommendationEngine.ts';

// Follow-up Planner
export { planFollowUp, getFollowUpCapabilities, hasFollowUp } from './followUpPlanner.ts';

// Interruption Policy
export {
  determineInterruption, shouldShowInGalileoHome, shouldSurfaceInPanel,
} from './interruptionPolicy.ts';

// Executive Brief
export { buildExecutiveBrief } from './executiveBrief.ts';

// Confidence Model
export { assessConfidence, getConfidenceLabel } from './confidenceModel.ts';

// Safety
export { validateSafety, assertReadOnly, getSafetyPolicy } from './safety.ts';

// Analytics
export {
  getAnalytics, resetAnalytics, trackRecommendationGenerated,
  trackRecommendationAccepted, trackRecommendationDismissed, trackIntentDetection,
  trackCapabilitySelection, trackPriority, trackDecision,
  getMostSelectedCapability, getPriorityDistribution,
} from './analytics.ts';