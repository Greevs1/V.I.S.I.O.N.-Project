/**
 * Interruption Policy — Phase 13.4C.1
 *
 * Galileo should NOT interrupt users.
 * Rules for: silent, surface, recommend, urgent, blocking.
 * Controls future Galileo Home behavior.
 *
 * Pure reasoning. No LLM.
 */
import type { Recommendation, ExecutiveState, InterruptionDecision, InterruptionLevel } from './types.ts';

export function determineInterruption(
  recommendation: Recommendation | null,
  state: ExecutiveState
): InterruptionDecision {
  if (!recommendation) {
    return { level: 'silent', reason: 'No recommendation to surface.', shouldNotify: false };
  }

  // Blocking: publication blocked + user is advisor/owner
  if (recommendation.priority === 'critical' && recommendation.intent === 'publish') {
    if (state.resolvedRole === 'advisor' || state.resolvedRole === 'super_admin' || state.resolvedRole === 'admin') {
      return {
        level: 'blocking',
        reason: 'Critical publication blocker requires immediate attention.',
        shouldNotify: true,
      };
    }
  }

  // Urgent: critical priority
  if (recommendation.priority === 'critical') {
    return {
      level: 'urgent',
      reason: 'Critical priority item needs attention.',
      shouldNotify: true,
    };
  }

  // Urgent: meeting within 1 day
  if (state.meetingContext && state.meetingContext.daysUntilMeeting === 0) {
    return {
      level: 'urgent',
      reason: 'Meeting is today; preparation is urgent.',
      shouldNotify: true,
    };
  }

  // Recommend: high priority
  if (recommendation.priority === 'high') {
    return {
      level: 'recommend',
      reason: 'High priority recommendation available.',
      shouldNotify: false,
    };
  }

  // Surface: medium priority + user is in relevant workspace
  if (recommendation.priority === 'medium' && isRelevantWorkspace(recommendation, state)) {
    return {
      level: 'surface',
      reason: 'Relevant recommendation for current workspace.',
      shouldNotify: false,
    };
  }

  // Silent: low priority or not relevant
  return {
    level: 'silent',
    reason: 'Recommendation is low priority or not immediately relevant.',
    shouldNotify: false,
  };
}

function isRelevantWorkspace(rec: Recommendation, state: ExecutiveState): boolean {
  if (!state.currentWorkspace) return false;
  const ws = state.currentWorkspace.toLowerCase();
  if (rec.intent === 'publish' && ws.includes('deliver')) return true;
  if (rec.intent === 'plan' && ws.includes('growth')) return true;
  if (rec.intent === 'investigate' && ws.includes('verify')) return true;
  if (rec.intent === 'review' && ws.includes('valuation')) return true;
  return false;
}

export function shouldShowInGalileoHome(decision: InterruptionDecision): boolean {
  return decision.level === 'urgent' || decision.level === 'blocking';
}

export function shouldSurfaceInPanel(decision: InterruptionDecision): boolean {
  return decision.level !== 'silent';
}