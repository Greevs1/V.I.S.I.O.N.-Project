/**
 * Priority Engine — Phase 13.4C.1
 *
 * Determines priority levels: Critical, High, Medium, Low.
 * Every priority is explainable.
 *
 * Pure reasoning. No LLM.
 */
import type { ExecutiveState, SituationAssessment, Priority, PriorityLevel } from './types.ts';

export function determinePriorities(
  state: ExecutiveState,
  assessment: SituationAssessment
): Priority[] {
  const priorities: Priority[] = [];

  // Critical: Publication blocked
  if (state.publicationState && state.publicationState.blockers.length > 0) {
    priorities.push({
      level: 'critical',
      title: 'Publication Blocked',
      description: `${state.publicationState.blockers.length} blocker(s) preventing publication`,
      category: 'publication',
      explainable: 'Publication cannot proceed until blockers are resolved.',
      relatedCapabilityId: 'review.publication_readiness',
    });
  }

  // Critical: Unresolved conflicts
  if (state.verificationState && state.verificationState.unresolvedConflicts > 0) {
    priorities.push({
      level: 'critical',
      title: 'Unresolved Conflicts',
      description: `${state.verificationState.unresolvedConflicts} conflict(s) need resolution`,
      category: 'verification',
      explainable: 'Data conflicts undermine valuation confidence and must be resolved.',
      relatedCapabilityId: 'investigate.conflict',
    });
  }

  // High: Meeting soon
  if (state.meetingContext && state.meetingContext.upcomingMeeting) {
    const days = state.meetingContext.daysUntilMeeting;
    if (days !== null && days <= 7) {
      priorities.push({
        level: 'high',
        title: 'Meeting Preparation',
        description: `${state.meetingContext.meetingType || 'Meeting'} in ${days} day(s)`,
        category: 'meeting',
        explainable: 'Meeting preparation should be completed before the meeting.',
        relatedCapabilityId: 'prepare.client_meeting',
      });
    }
  }

  // High: Pending verifications
  if (state.verificationState && state.verificationState.pendingVerifications > 0) {
    priorities.push({
      level: 'high',
      title: 'Pending Verifications',
      description: `${state.verificationState.pendingVerifications} item(s) awaiting verification`,
      category: 'verification',
      explainable: 'Verifications are required before valuation can be finalized.',
      relatedCapabilityId: 'review.evidence',
    });
  }

  // Medium: Recent document upload
  const docChanges = state.recentChanges.filter((c) => c.type === 'document');
  if (docChanges.length > 0) {
    priorities.push({
      level: 'medium',
      title: 'Review Uploaded Documents',
      description: `${docChanges.length} document(s) recently uploaded`,
      category: 'document',
      explainable: 'New documents may contain data relevant to the valuation.',
      relatedCapabilityId: 'review.uploaded_documents',
    });
  }

  // Medium: Growth plan incomplete
  if (state.growthPlanState && state.growthPlanState.totalInitiatives > 0
      && state.growthPlanState.approvedInitiatives < state.growthPlanState.totalInitiatives) {
    priorities.push({
      level: 'medium',
      title: 'Complete Growth Plan',
      description: `${state.growthPlanState.approvedInitiatives}/${state.growthPlanState.totalInitiatives} initiatives approved`,
      category: 'growth',
      explainable: 'Growth plan initiatives should be reviewed and approved.',
      relatedCapabilityId: 'build.90_day_plan',
    });
  }

  // Low: Growth plan complete
  if (state.growthPlanState && state.growthPlanState.readyInitiatives > 0
      && state.growthPlanState.readyInitiatives === state.growthPlanState.totalInitiatives) {
    priorities.push({
      level: 'low',
      title: 'Growth Plan Complete',
      description: 'All initiatives are ready',
      category: 'growth',
      explainable: 'Growth plan is complete; consider next strategic steps.',
      relatedCapabilityId: 'increase.enterprise_value',
    });
  }

  // Sort by priority weight
  return sortPriorities(priorities);
}

export function sortPriorities(priorities: Priority[]): Priority[] {
  const weight: Record<PriorityLevel, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return [...priorities].sort((a, b) => weight[a.level] - weight[b.level]);
}

export function getTopPriority(priorities: Priority[]): Priority | null {
  return priorities.length > 0 ? priorities[0] : null;
}