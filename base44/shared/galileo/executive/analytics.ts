/**
 * EIE Analytics — Phase 13.4C.1
 *
 * Tracks: recommendations generated, accepted, dismissed,
 * intent detection accuracy, capability selection, priority distribution.
 *
 * No conversation storage. Only metadata.
 * In-memory only.
 */
import type { EIEAnalytics, PriorityLevel, IntentType } from './types.ts';

let analytics: EIEAnalytics = {
  recommendationsGenerated: 0,
  recommendationsAccepted: 0,
  recommendationsDismissed: 0,
  intentDetectionAccuracy: 0,
  capabilitySelections: {},
  priorityDistribution: { critical: 0, high: 0, medium: 0, low: 0 },
  totalDecisions: 0,
};

let intentCorrectCount = 0;
let intentTotalCount = 0;

export function trackRecommendationGenerated(): void {
  analytics.recommendationsGenerated++;
}

export function trackRecommendationAccepted(): void {
  analytics.recommendationsAccepted++;
}

export function trackRecommendationDismissed(): void {
  analytics.recommendationsDismissed++;
}

export function trackIntentDetection(wasCorrect: boolean): void {
  intentTotalCount++;
  if (wasCorrect) intentCorrectCount++;
  analytics.intentDetectionAccuracy = intentTotalCount > 0
    ? Math.round((intentCorrectCount / intentTotalCount) * 100)
    : 0;
}

export function trackCapabilitySelection(capabilityId: string): void {
  analytics.capabilitySelections[capabilityId] = (analytics.capabilitySelections[capabilityId] || 0) + 1;
}

export function trackPriority(level: PriorityLevel): void {
  analytics.priorityDistribution[level]++;
}

export function trackDecision(): void {
  analytics.totalDecisions++;
}

export function getAnalytics(): EIEAnalytics {
  return { ...analytics };
}

export function resetAnalytics(): void {
  analytics = {
    recommendationsGenerated: 0,
    recommendationsAccepted: 0,
    recommendationsDismissed: 0,
    intentDetectionAccuracy: 0,
    capabilitySelections: {},
    priorityDistribution: { critical: 0, high: 0, medium: 0, low: 0 },
    totalDecisions: 0,
  };
  intentCorrectCount = 0;
  intentTotalCount = 0;
}

export function getMostSelectedCapability(): string | null {
  const entries = Object.entries(analytics.capabilitySelections);
  if (entries.length === 0) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

export function getPriorityDistribution(): Record<PriorityLevel, number> {
  return { ...analytics.priorityDistribution };
}