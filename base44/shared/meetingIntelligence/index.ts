/**
 * meetingIntelligence/index.ts — Phase 15.3
 *
 * Public API for the Meeting Intelligence Foundation.
 *
 * Meeting Intelligence NEVER owns business truth.
 * Meeting Intelligence NEVER performs calculations.
 * Meeting Intelligence NEVER creates another recommendation engine.
 * Meeting Intelligence ONLY synthesizes existing certified outputs into a
 * meeting-specific preparation layer.
 *
 * The Two-Minute Rule: an advisor walks into any meeting feeling fully prepared
 * in approximately two minutes.
 */

// Types
export type {
  MeetingIntentType,
  MeetingIntentConfig,
  MeetingPriorityFocus,
  MeetingContextEmphasis,
  MeetingContext,
  MeetingParticipant,
  MeetingChangeReference,
  MeetingInitiativeReference,
  MeetingRequestReference,
  MeetingReviewReference,
  MeetingApprovalReference,
  MeetingPublicationStatus,
  MeetingPriorityReference,
  MeetingRiskReference,
  MeetingOpportunityReference,
  MeetingConfidenceSummary,
  MeetingMomentumSummary,
  MeetingMilestoneReference,
  MeetingContextMeta,
  MeetingBrief,
  MeetingSummary,
  SinceLastMeeting,
  CelebrateSection,
  CelebrateItem,
  DiscussSection,
  DiscussTopic,
  DecisionSection,
  DecisionItem,
  OpenRiskSection,
  OpenRiskItem,
  OwnerWinsSection,
  AdvisorNotesSection,
  AdvisorNote,
  ClientSafeBrief,
  SuggestedQuestion,
  QuestionEvidence,
  DecisionMoment,
  DecisionMomentType,
  MeetingTimelineSection,
  TimelineEntryRef,
  AdvisorModeConfig,
  AdvisorModeEmphasis,
  PostMeetingContract,
  PostMeetingMemoryCategory,
  MeetingIntelligenceInput,
  MeetingIntelligenceExtensionPoints,
  MeetingBriefMeta,
} from './types.ts';

// Confidence Source enum
export { MeetingConfidenceSource } from './types.ts';

// Coordinator (the synthesis layer — single entry point)
export { buildMeetingIntelligence } from './coordinator.ts';

// Sub-modules (for direct access if needed)
export { buildMeetingContext } from './meetingContext.ts';
export { buildMeetingBrief } from './meetingBrief.ts';
export { buildSuggestedQuestions } from './suggestedQuestions.ts';
export { identifyDecisionMoments } from './decisionMoments.ts';
export { applyAdvisorMode, DEFAULT_ADVISOR_MODE, getAdvisorModeEmphasisOrder, hasEmphasis } from './advisorMode.ts';
export { filterMeetingBriefForClient, isSectionClientSafe, getAdvisorOnlyNotes, hasInternalContent } from './clientSafe.ts';
export { POST_MEETING_CONTRACT } from './postMeetingContract.ts';
export { MEETING_INTENTS, getMeetingIntentConfig, isInternalIntent, getIntentDisplayName } from './meetingIntent.ts';

// Phase 15.4 — Post-Meeting Intelligence
export type {
  OutcomeType,
  OutcomeRiskLevel,
  OutcomeApprovalStatus,
  DestinationSystem,
  PostMeetingOutcome,
  OutcomeEvidence,
  MeetingContextRef,
  ProposedAction,
  DestinationValidationResult,
  DuplicateCheckResult,
  PostMeetingCloseout,
  CloseoutSummary,
  CloseoutMeta,
  ClientSafeFollowup,
  AuditEntry,
  PostMeetingSynthesisInput,
  ExplicitDecision,
  MemoryCandidateClassification,
} from './postMeetingTypes.ts';

export {
  OUTCOME_OWNERSHIP,
  classifyRisk,
  canBatchApprove,
  requiresIndividualConfirmation,
  validateDestination,
} from './outcomeOwnership.ts';

export { synthesizeOutcomes } from './outcomeSynthesis.ts';
export { checkDuplicate } from './duplicateDetection.ts';
export {
  buildClientSafeFollowup,
  filterOutcomesForClient,
  isOutcomeClientSafe,
  getExcludedInternalTypes,
} from './clientSafeCloseout.ts';
export {
  createProposalAuditEntry,
  createApprovalAuditEntry,
  createDismissalAuditEntry,
  createDeferAuditEntry,
  createExecutionAuditEntry,
  initializeAuditTrail,
} from './auditTrail.ts';
export { buildPostMeetingCloseout, updateCloseoutAfterAction } from './closeoutBuilder.ts';