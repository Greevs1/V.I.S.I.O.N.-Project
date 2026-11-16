/**
 * Situation Assessment — Phase 13.4C.1
 *
 * First reasoning stage. Determines:
 *   Where is the user?
 *   What are they working on?
 *   What changed?
 *   What is incomplete?
 *   What is blocked?
 *   What is urgent?
 *
 * Pure reasoning. No LLM.
 */
import type { ExecutiveState, SituationAssessment } from './types.ts';

export function assessSituation(state: ExecutiveState): SituationAssessment {
  const whereIsUser = determineLocation(state);
  const whatAreTheyWorkingOn = determineWorkflow(state);
  const whatChanged = determineRecentChange(state);
  const whatIsIncomplete = findIncomplete(state);
  const whatIsBlocked = findBlocked(state);
  const whatIsUrgent = findUrgent(state);

  const summary = [
    whereIsUser,
    whatAreTheyWorkingOn ? `Working on: ${whatAreTheyWorkingOn}` : '',
    whatIsUrgent.length > 0 ? `Urgent: ${whatIsUrgent.join(', ')}` : '',
    whatIsBlocked.length > 0 ? `Blocked: ${whatIsBlocked.length} item(s)` : '',
  ].filter(Boolean).join(' · ');

  return {
    whereIsUser,
    whatAreTheyWorkingOn,
    whatChanged,
    whatIsIncomplete,
    whatIsBlocked,
    whatIsUrgent,
    summary,
  };
}

function determineLocation(state: ExecutiveState): string {
  if (state.currentWorkspace) return state.currentWorkspace;
  if (state.currentRoute) return state.currentRoute;
  if (state.businessId) return `Business: ${state.businessName || state.businessId}`;
  return 'Dashboard';
}

function determineWorkflow(state: ExecutiveState): string {
  if (state.activeWorkflow) return state.activeWorkflow;
  if (state.valuationId) return `Valuation (${state.valuationStatus || 'in progress'})`;
  if (state.growthPlanState && state.growthPlanState.totalInitiatives > 0) return 'Growth Plan';
  if (state.focusedRecordType) return state.focusedRecordType;
  return '';
}

function determineRecentChange(state: ExecutiveState): string | null {
  if (state.recentChanges.length === 0) return null;
  const latest = state.recentChanges[0];
  return `${latest.type}: ${latest.description}`;
}

function findIncomplete(state: ExecutiveState): string[] {
  const incomplete: string[] = [];
  if (state.pendingTasks) {
    state.pendingTasks
      .filter((t) => t.status !== 'completed' && t.status !== 'done')
      .forEach((t) => incomplete.push(t.title));
  }
  if (state.publicationState && !state.publicationState.readyForPublication) {
    incomplete.push('Publication readiness');
  }
  if (state.verificationState && state.verificationState.pendingVerifications > 0) {
    incomplete.push(`${state.verificationState.pendingVerifications} verification(s) pending`);
  }
  if (state.growthPlanState && state.growthPlanState.approvedInitiatives === 0) {
    incomplete.push('Growth Plan initiatives need approval');
  }
  return incomplete;
}

function findBlocked(state: ExecutiveState): string[] {
  const blocked: string[] = [];
  if (state.publicationState && state.publicationState.blockers.length > 0) {
    blocked.push(...state.publicationState.blockers);
  }
  if (state.verificationState && state.verificationState.unresolvedConflicts > 0) {
    blocked.push(`${state.verificationState.unresolvedConflicts} unresolved conflict(s)`);
  }
  return blocked;
}

function findUrgent(state: ExecutiveState): string[] {
  const urgent: string[] = [];
  if (state.meetingContext && state.meetingContext.upcomingMeeting) {
    const days = state.meetingContext.daysUntilMeeting;
    if (days !== null && days <= 2) {
      urgent.push(`${state.meetingContext.meetingType || 'Meeting'} in ${days} day(s)`);
    }
  }
  if (state.pendingTasks) {
    state.pendingTasks
      .filter((t) => t.priority === 'critical' || t.priority === 'high')
      .forEach((t) => urgent.push(t.title));
  }
  return urgent;
}