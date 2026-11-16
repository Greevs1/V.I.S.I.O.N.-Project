/**
 * Executive State Model — Phase 13.4C.1
 *
 * Builds the unified ExecutiveState from EIEContext.
 * Pure transformation. No I/O, no side effects.
 */
import type { ExecutiveState, EIEContext, Priority } from './types.ts';

export function buildExecutiveState(
  context: EIEContext,
  priorities: Priority[] = []
): ExecutiveState {
  return {
    userId: context.userId,
    userEmail: context.userEmail,
    userRole: context.userRole,
    resolvedRole: context.resolvedRole,
    businessId: context.businessId,
    businessName: context.businessName,
    industry: context.industry,
    valuationId: context.valuationId,
    valuationStatus: context.valuationStatus,
    currentWorkspace: context.currentWorkspace,
    currentRoute: context.currentRoute,
    currentPage: context.currentPage,
    focusedRecordType: context.focusedRecordType,
    focusedRecordId: context.focusedRecordId,
    isAssignedAdvisor: context.isAssignedAdvisor,
    assignedBusinessIds: context.assignedBusinessIds || [],
    conversationScope: context.conversationScope,
    membershipTier: context.membershipTier,
    sessionsRemaining: context.sessionsRemaining,
    sessionsUsed: context.sessionsUsed,
    activeWorkflow: context.activeWorkflow,
    pendingTasks: context.pendingTasks || [],
    publicationState: context.publicationState,
    growthPlanState: context.growthPlanState,
    verificationState: context.verificationState,
    meetingContext: context.meetingContext,
    recentChanges: context.recentChanges || [],
    currentPriorities: priorities,
    builtAt: new Date().toISOString(),
  };
}

export function isEmptyState(state: ExecutiveState): boolean {
  return !state.businessId && !state.valuationId && !state.currentWorkspace;
}

export function getStateSummary(state: ExecutiveState): string {
  const parts: string[] = [];
  if (state.businessName) parts.push(`Business: ${state.businessName}`);
  if (state.valuationId) parts.push(`Valuation: ${state.valuationStatus || 'in progress'}`);
  if (state.currentWorkspace) parts.push(`Workspace: ${state.currentWorkspace}`);
  if (state.isAssignedAdvisor) parts.push('Role: Assigned Advisor');
  return parts.join(' · ') || 'No active context';
}