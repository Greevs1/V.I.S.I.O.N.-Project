/**
 * businessStateSync/index.ts — Phase 14.3
 *
 * Canonical Business State Synchronization (CBSS) — Barrel Export.
 *
 * The platform maintains ONE synchronized understanding of the business.
 * Every business fact changes once. Every consumer reacts appropriately.
 * No consumer owns business truth. Consumers subscribe.
 *
 * SHADOW MODE: No production propagation. All orchestration is
 * observational only. Existing certified engines remain authoritative.
 */

// Types
export type {
  BusinessStateEventType,
  BusinessStateEvent,
  ConsumerId,
  RefreshMode,
  ConsumerSubscription,
  RefreshPolicy,
  FactImpact,
  PropagationClassification,
  PropagationDecision,
  ExplainableSyncEntry,
  ExplainableSyncReport,
  PropagationStatus,
  TimelineEntry,
  BusinessChangeTimeline,
  ShadowDifference,
  ShadowSyncResult,
  ConsumerMetrics,
  ObservabilityMetrics,
  OrchestrationResult,
} from './types.ts';

// Events
export {
  generateEventId,
  createBusinessStateEvent,
  eventFromCanonicalFact,
  validateEvent,
  getEventTypeForFact,
  FACT_KEY_TO_EVENT_TYPE,
} from './events.ts';

// Subscription Registry
export {
  CONSUMER_SUBSCRIPTIONS,
  getSubscription,
  getConsumersForFact,
  getAllSubscriptions,
  isConsumerSubscribed,
} from './subscriptionRegistry.ts';

// Refresh Policies
export {
  getRefreshPolicy,
  getPoliciesForEventType,
} from './refreshPolicies.ts';

// Impact Radius
export {
  getImpactRadius,
  getDependentConsumers,
  getRefreshOrder,
  getImpactRadiusBatch,
} from './impactRadius.ts';

// Governance
export {
  classifyPropagation,
  isBlockedByGovernance,
  isAdvisorLocked,
  isFromPublishedVersion,
  isClientConfirmed,
  classifyPropagationBatch,
} from './governance.ts';

// Orchestrator
export {
  orchestrateBusinessStateEvent,
  orchestrateBusinessStateEvents,
  isShadowMode,
  getOrchestrationSummary,
} from './orchestrator.ts';

// Explainable Sync
export {
  formatSyncEntry,
  generateExplanation,
} from './explainableSync.ts';

// Timeline
export {
  createTimelineEntry,
  buildTimeline,
  filterByStatus,
  filterAdvisorReviewRequired,
  getRecentEntries,
} from './timeline.ts';

// Shadow Sync
export {
  runShadowComparison,
  detectMissedConsumers,
  detectUnexpectedConsumers,
  hasDifferences,
  summarizeShadowResults,
} from './shadowSync.ts';

// Observability
export {
  ObservabilityTracker,
  getObservabilityTracker,
} from './observability.ts';

// Deduplication (Phase 14.3A)
export {
  deduplicateEvents,
  deduplicateConsumerRefreshes,
  areEventsDuplicates,
  getDedupWindowMs,
} from './deduplication.ts';

// Event Ordering (Phase 14.3A)
export {
  FACT_DEPENDENCIES,
  getDependencyLevel,
  getBlockingDependencies,
  orderEventsByDependency,
  getConsumerRefreshOrder,
} from './eventOrdering.ts';

// Cycle Detection (Phase 14.3A)
export {
  CONSUMER_PATHS,
  runCycleAudit,
  checkNoFactDependsOnConsumerOutput,
} from './cycleDetection.ts';
export type { CycleAudit } from './cycleDetection.ts';

// Live Sync Policy (Phase 14.3B)
export {
  isLiveSyncEnabled,
  getLiveSyncMode,
  isGlobalLiveSyncEnabled,
  setGlobalLiveSyncEnabled,
  getPilotBusinessIds,
  addPilotBusiness,
  removePilotBusiness,
  isPilotBusiness,
  getConsumerConfidenceRequirement,
  getLiveMatrix,
  getPilotStatus,
} from './liveSyncPolicy.ts';

// Circuit Breaker (Phase 14.3B)
export {
  recordSuccess,
  recordFailure,
  isTripped,
  getBreakerState,
  getAllBreakerStates,
  tripBreaker,
  resetBreaker,
  resetAllBreakers,
} from './circuitBreaker.ts';

// Event Qualification (Phase 14.3B)
export {
  qualifyRevenueEvent,
} from './eventQualification.ts';
export type { QualificationResult } from './eventQualification.ts';

// Live Orchestrator (Phase 14.3B)
export {
  orchestrateLiveSync,
  recordLiveActionResult,
} from './liveOrchestrator.ts';
export type { LiveSyncAction, LiveOrchestrationResult } from './liveOrchestrator.ts';