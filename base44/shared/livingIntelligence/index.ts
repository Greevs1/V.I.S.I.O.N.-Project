/**
 * livingIntelligence/index.ts — Phase 15.0
 *
 * Public API for the Living Intelligence Foundation.
 *
 * Living Intelligence NEVER owns business truth.
 * Living Intelligence NEVER performs calculations.
 * Living Intelligence ONLY observes, synthesizes, explains, prioritizes,
 * predicts, and coordinates executive understanding.
 */

// Types
export type {
  ExecutiveContext,
  CurrentBusinessState,
  BusinessMomentum,
  MomentumDirection,
  MomentumConsistency,
  MomentumAcceleration,
  MomentumExecution,
  MomentumConfidence,
  MomentumObservation,
  ExecutiveItem,
  EvidenceReference,
  AttentionItem,
  BusinessConfidence,
  WhatChangedItem,
  WhatMattersNowItem,
  WhatMattersCategory,
  ExecutivePresence,
  ExecutivePresenceItem,
  PendingReview,
  UpcomingDeadline,
  BusinessNarrative,
  ExecutiveContextMeta,
  LivingIntelligenceInput,
  BusinessMemoryContract,
  MemoryCategory,
  RetentionPhilosophy,
  LivingIntelligenceExtensionPoints,
  ConfidenceSource,
} from './types.ts';

// Coordinator (the synthesis layer)
export { buildExecutiveContext } from './coordinator.ts';

// Executive Presence (the single reusable API)
export { buildExecutivePresence } from './executivePresence.ts';

// What Changed
export { buildWhatChanged } from './whatChanged.ts';

// What Matters Now
export { buildWhatMattersNow } from './whatMattersNow.ts';

// Business Momentum
export { buildBusinessMomentum } from './businessMomentum.ts';

// Business Memory Contract (framework only)
export { BUSINESS_MEMORY_CONTRACT } from './businessMemoryContract.ts';

// Validate Intelligence (Phase 15.2)
export { buildValidateIntelligence, filterValidateIntelligenceForClient } from './validateIntelligence.ts';
export type { ValidateIntelligence, ValidateAttentionItem, ValidateIntelligenceInput } from './validateIntelligence.ts';

// Confidence Source enum
export { ConfidenceSource } from './types.ts';