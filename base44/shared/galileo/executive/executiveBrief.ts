/**
 * Executive Brief Model — Phase 13.4C.1
 *
 * Structured object for Galileo Home. No UI.
 * Sections: Today, What's Changed, Priorities, Risks, Opportunities,
 * Meetings, Recommendations, Progress, Executive Sessions.
 *
 * Pure reasoning. No LLM.
 */
import type {
  ExecutiveState, SituationAssessment, Priority, Recommendation, ExecutiveBrief
} from './types.ts';

export function buildExecutiveBrief(
  state: ExecutiveState,
  assessment: SituationAssessment,
  priorities: Priority[],
  recommendations: Recommendation[]
): ExecutiveBrief {
  return {
    generatedAt: new Date().toISOString(),
    today: assessment.whereIsUser,
    whatsChanged: extractWhatsChanged(state),
    priorities: priorities.slice(0, 5),
    risks: extractRisks(state, assessment),
    opportunities: extractOpportunities(state, recommendations),
    meetings: extractMeetings(state),
    recommendations: recommendations.slice(0, 5),
    progress: extractProgress(state),
    executiveSessions: {
      remaining: state.sessionsRemaining,
      used: state.sessionsUsed,
      unlimited: state.sessionsRemaining === -1 || state.isAssignedAdvisor,
    },
  };
}

function extractWhatsChanged(state: ExecutiveState): string[] {
  return state.recentChanges.slice(0, 5).map((c) => `${c.description} (${c.impact} impact)`);
}

function extractRisks(state: ExecutiveState, assessment: SituationAssessment): string[] {
  const risks: string[] = [];
  if (assessment.whatIsBlocked.length > 0) {
    risks.push(...assessment.whatIsBlocked);
  }
  if (state.verificationState && state.verificationState.unresolvedConflicts > 0) {
    risks.push(`${state.verificationState.unresolvedConflicts} unresolved conflict(s)`);
  }
  if (state.publicationState && !state.publicationState.readyForPublication) {
    risks.push('Not ready for publication');
  }
  return risks;
}

function extractOpportunities(state: ExecutiveState, recommendations: Recommendation[]): string[] {
  const opps: string[] = [];
  if (state.growthPlanState && state.growthPlanState.readyInitiatives > 0) {
    opps.push(`${state.growthPlanState.readyInitiatives} initiative(s) ready for execution`);
  }
  const execRecs = recommendations.filter((r) => r.intent === 'execute' || r.intent === 'plan');
  execRecs.slice(0, 2).forEach((r) => opps.push(r.title));
  return opps;
}

function extractMeetings(state: ExecutiveState): string[] {
  if (!state.meetingContext || !state.meetingContext.upcomingMeeting) return [];
  const days = state.meetingContext.daysUntilMeeting;
  return [`${state.meetingContext.meetingType || 'Meeting'} in ${days !== null ? days : '?'} day(s)`];
}

function extractProgress(state: ExecutiveState): { label: string; value: number }[] {
  const progress: { label: string; value: number }[] = [];
  if (state.growthPlanState) {
    progress.push({ label: 'Growth Plan', value: state.growthPlanState.progress });
  }
  if (state.verificationState) {
    const total = state.verificationState.pendingVerifications + state.verificationState.completedVerifications;
    if (total > 0) {
      progress.push({ label: 'Verifications', value: Math.round((state.verificationState.completedVerifications / total) * 100) });
    }
  }
  if (state.publicationState) {
    progress.push({ label: 'Publication', value: state.publicationState.readyForPublication ? 100 : 0 });
  }
  return progress;
}