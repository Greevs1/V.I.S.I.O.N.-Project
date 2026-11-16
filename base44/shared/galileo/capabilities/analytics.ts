/**
 * Galileo Capability Framework — Analytics
 * Phase 13.4B.1
 *
 * Tracks capability usage metadata only. No conversation content is stored.
 *
 * Captured metadata:
 *   - execution count
 *   - completion outcome
 *   - duration
 *   - accepted recommendations
 *   - dismissed recommendations
 *   - manual vs automatic launches
 *
 * Analytics events are structured for future persistence to an analytics
 * entity or external service. For now, they are tracked in-memory.
 */
import type {
  CapabilityAnalyticsEvent,
  ExecutionMode,
} from './types.ts';

class CapabilityAnalyticsImpl {
  private events: CapabilityAnalyticsEvent[] = [];
  private maxEvents = 10000;

  track(
    capabilityId: string,
    executionMode: ExecutionMode,
    outcome: CapabilityAnalyticsEvent['outcome'],
    duration: number,
    userRole: string,
    triggerType: 'manual' | 'automatic' = 'manual'
  ): void {
    const event: CapabilityAnalyticsEvent = {
      capabilityId,
      executionMode,
      timestamp: new Date().toISOString(),
      triggerType,
      outcome,
      duration,
      userRole,
    };

    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }
  }

  trackExecution(capabilityId: string, executionMode: ExecutionMode, userRole: string = 'unknown'): void {
    this.track(capabilityId, executionMode, 'completed', 0, userRole, 'manual');
  }

  trackCompletion(
    capabilityId: string,
    outcome: CapabilityAnalyticsEvent['outcome'],
    duration: number,
    userRole: string = 'unknown'
  ): void {
    this.track(capabilityId, 'read', outcome, duration, userRole, 'manual');
  }

  trackRecommendationAccepted(capabilityId: string, userRole: string = 'unknown'): void {
    this.track(capabilityId, 'recommend', 'accepted', 0, userRole, 'manual');
  }

  trackRecommendationDismissed(capabilityId: string, userRole: string = 'unknown'): void {
    this.track(capabilityId, 'recommend', 'dismissed', 0, userRole, 'manual');
  }

  trackManualLaunch(capabilityId: string, executionMode: ExecutionMode, userRole: string = 'unknown'): void {
    this.track(capabilityId, executionMode, 'completed', 0, userRole, 'manual');
  }

  trackAutomaticLaunch(capabilityId: string, executionMode: ExecutionMode, userRole: string = 'unknown'): void {
    this.track(capabilityId, executionMode, 'completed', 0, userRole, 'automatic');
  }

  getEvents(capabilityId?: string): CapabilityAnalyticsEvent[] {
    if (capabilityId) {
      return this.events.filter((e) => e.capabilityId === capabilityId);
    }
    return [...this.events];
  }

  getStats(capabilityId?: string): {
    totalExecutions: number;
    completions: number;
    dismissals: number;
    acceptances: number;
    errors: number;
    notImplemented: number;
    manualLaunches: number;
    automaticLaunches: number;
    avgDuration: number;
  } {
    const events = this.getEvents(capabilityId);
    const completed = events.filter((e) => e.outcome === 'completed');
    return {
      totalExecutions: events.length,
      completions: completed.length,
      dismissals: events.filter((e) => e.outcome === 'dismissed').length,
      acceptances: events.filter((e) => e.outcome === 'accepted').length,
      errors: events.filter((e) => e.outcome === 'error').length,
      notImplemented: events.filter((e) => e.outcome === 'not_implemented').length,
      manualLaunches: events.filter((e) => e.triggerType === 'manual').length,
      automaticLaunches: events.filter((e) => e.triggerType === 'automatic').length,
      avgDuration: completed.length > 0
        ? completed.reduce((sum, e) => sum + e.duration, 0) / completed.length
        : 0,
    };
  }

  clear(): void {
    this.events = [];
  }
}

export const capabilityAnalytics = new CapabilityAnalyticsImpl();

// Convenience exports for the pipeline
export function trackExecution(capabilityId: string, executionMode: ExecutionMode): void {
  capabilityAnalytics.trackManualLaunch(capabilityId, executionMode);
}

export function trackCompletion(
  capabilityId: string,
  outcome: CapabilityAnalyticsEvent['outcome'],
  duration: number
): void {
  capabilityAnalytics.trackCompletion(capabilityId, outcome, duration);
}