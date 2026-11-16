/**
 * meetingIntelligence/outcomeOwnership.ts — Phase 15.4
 *
 * Outcome Ownership — maps every proposed outcome to an EXISTING owner.
 *
 * Post-Meeting Intelligence NEVER creates a new table.
 * Every outcome routes to an existing certified system with:
 *   - Existing write service
 *   - Existing permission
 *   - Existing audit trail
 *   - Existing client-safe boundary
 *   - Existing navigation destination
 *
 * Constitution Compliance:
 *   Article II — Single Ownership (post-meeting does not own any destination)
 *   Article VII — Extension First (routes to existing, does not create parallel)
 */

import type {
  OutcomeType,
  DestinationSystem,
  OutcomeRiskLevel,
  PostMeetingOutcome,
} from './postMeetingTypes.ts';

// ── Destination Ownership Map ──────────────────────────────────────────────────
// Every outcome type maps to exactly ONE existing destination.
export interface DestinationOwnership {
  destination_system: DestinationSystem;
  write_service: string;
  write_action: string;
  permission_required: string;
  audit_system: string;
  client_safe_boundary: string;
  navigation_url: string;
  risk_level: OutcomeRiskLevel;
  supports_batch: boolean;
}

export const OUTCOME_OWNERSHIP: Record<OutcomeType, DestinationOwnership> = {
  decision: {
    destination_system: 'business_timeline',
    write_service: 'cbss_event_system',
    write_action: 'recordDecision',
    permission_required: 'admin',
    audit_system: 'business_timeline',
    client_safe_boundary: 'client_visible_decisions_only',
    navigation_url: '/dashboard',
    risk_level: 'MEDIUM',
    supports_batch: false,
  },
  commitment: {
    destination_system: 'advisor_notes',
    write_service: 'ClientNote',
    write_action: 'create',
    permission_required: 'admin',
    audit_system: 'client_note_audit',
    client_safe_boundary: 'visibility_field',
    navigation_url: '/admin',
    risk_level: 'LOW',
    supports_batch: true,
  },
  follow_up: {
    destination_system: 'sprint_tasks',
    write_service: 'ninetyDaySprint',
    write_action: 'addTask',
    permission_required: 'admin',
    audit_system: 'sprint_audit',
    client_safe_boundary: 'owner_visible_tasks',
    navigation_url: '/dashboard',
    risk_level: 'MEDIUM',
    supports_batch: false,
  },
  information_request: {
    destination_system: 'document_requests',
    write_service: 'verificationQueueService',
    write_action: 'createClientRequest',
    permission_required: 'admin',
    audit_system: 'verification_queue_audit',
    client_safe_boundary: 'client_visible_requests',
    navigation_url: '/admin',
    risk_level: 'MEDIUM',
    supports_batch: true,
  },
  advisor_note_candidate: {
    destination_system: 'advisor_notes',
    write_service: 'ClientNote',
    write_action: 'create',
    permission_required: 'admin',
    audit_system: 'client_note_audit',
    client_safe_boundary: 'internal_only',
    navigation_url: '/admin',
    risk_level: 'LOW',
    supports_batch: true,
  },
  owner_note_candidate: {
    destination_system: 'advisor_notes',
    write_service: 'ClientNote',
    write_action: 'create',
    permission_required: 'admin',
    audit_system: 'client_note_audit',
    client_safe_boundary: 'client_visible',
    navigation_url: '/admin',
    risk_level: 'LOW',
    supports_batch: true,
  },
  verification_candidate: {
    destination_system: 'verification_queue',
    write_service: 'verificationQueueService',
    write_action: 'flagForReview',
    permission_required: 'admin',
    audit_system: 'verification_queue_audit',
    client_safe_boundary: 'internal_only',
    navigation_url: '/advisory/business-valuation',
    risk_level: 'MEDIUM',
    supports_batch: false,
  },
  growth_plan_candidate: {
    destination_system: 'growth_plan',
    write_service: 'valuationService',
    write_action: 'addGrowthInitiative',
    permission_required: 'admin',
    audit_system: 'growth_plan_audit',
    client_safe_boundary: 'client_visible_initiatives',
    navigation_url: '/advisory/business-valuation',
    risk_level: 'MEDIUM',
    supports_batch: false,
  },
  sprint_task_candidate: {
    destination_system: 'sprint_tasks',
    write_service: 'ninetyDaySprint',
    write_action: 'addTask',
    permission_required: 'admin',
    audit_system: 'sprint_audit',
    client_safe_boundary: 'owner_visible_tasks',
    navigation_url: '/dashboard',
    risk_level: 'MEDIUM',
    supports_batch: false,
  },
  roadmap_candidate: {
    destination_system: 'roadmap',
    write_service: 'sprintRecommendations',
    write_action: 'addRoadmapItem',
    permission_required: 'admin',
    audit_system: 'roadmap_audit',
    client_safe_boundary: 'client_visible_roadmap',
    navigation_url: '/dashboard',
    risk_level: 'MEDIUM',
    supports_batch: false,
  },
  valuation_review_candidate: {
    destination_system: 'valuation_review',
    write_service: 'valuationService',
    write_action: 'flagForReview',
    permission_required: 'admin',
    audit_system: 'valuation_audit',
    client_safe_boundary: 'internal_only',
    navigation_url: '/advisory/business-valuation',
    risk_level: 'HIGH',
    supports_batch: false,
  },
  document_request_candidate: {
    destination_system: 'document_requests',
    write_service: 'verificationQueueService',
    write_action: 'createClientRequest',
    permission_required: 'admin',
    audit_system: 'verification_queue_audit',
    client_safe_boundary: 'client_visible_requests',
    navigation_url: '/admin',
    risk_level: 'MEDIUM',
    supports_batch: true,
  },
  timeline_event_candidate: {
    destination_system: 'business_timeline',
    write_service: 'cbss_event_system',
    write_action: 'recordTimelineEvent',
    permission_required: 'admin',
    audit_system: 'business_timeline',
    client_safe_boundary: 'client_visible_events',
    navigation_url: '/dashboard',
    risk_level: 'LOW',
    supports_batch: true,
  },
};

// ── Risk Classification ────────────────────────────────────────────────────────
export function classifyRisk(type: OutcomeType): OutcomeRiskLevel {
  return OUTCOME_OWNERSHIP[type].risk_level;
}

// ── Batch Approval Eligibility ─────────────────────────────────────────────────
export function canBatchApprove(outcome: PostMeetingOutcome): boolean {
  return OUTCOME_OWNERSHIP[outcome.type].supports_batch && outcome.risk_level === 'LOW';
}

// ── High-Risk Individual Confirmation ──────────────────────────────────────────
export function requiresIndividualConfirmation(outcome: PostMeetingOutcome): boolean {
  return outcome.risk_level === 'HIGH' || !OUTCOME_OWNERSHIP[outcome.type].supports_batch;
}

// ── Destination Validation ──────────────────────────────────────────────────────
export function validateDestination(
  outcome: PostMeetingOutcome,
  userRole: string,
  businessId: string
): import('./postMeetingTypes.ts').DestinationValidationResult {
  const ownership = OUTCOME_OWNERSHIP[outcome.type];
  const issues: string[] = [];

  const destinationExists = ownership.destination_system !== 'needs_review';
  const belongsToBusiness = outcome.source_meeting_context.business_id === businessId;
  const hasWritePermission = userRole === 'admin' || userRole === 'super_admin';
  const requiredFieldsKnown = !!(outcome.title && outcome.description);
  const workflowSupportsAction = !!(ownership.write_service && ownership.write_action);

  if (!destinationExists) issues.push('Destination system cannot be resolved');
  if (!belongsToBusiness) issues.push('Outcome does not belong to active business');
  if (!hasWritePermission) issues.push('User lacks write permission for destination');
  if (!requiredFieldsKnown) issues.push('Required fields missing');
  if (!workflowSupportsAction) issues.push('Existing workflow does not support this action');

  return {
    is_valid: issues.length === 0,
    destination_exists: destinationExists,
    belongs_to_business: belongsToBusiness,
    has_write_permission: hasWritePermission,
    required_fields_known: requiredFieldsKnown,
    workflow_supports_action: workflowSupportsAction,
    issues,
  };
}