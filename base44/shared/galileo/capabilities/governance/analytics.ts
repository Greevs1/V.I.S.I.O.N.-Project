/**
 * Galileo Capability Governance — Analytics
 * Phase 13.4B.1.5
 *
 * Tracks governance analytics:
 *   - Conversion after preview
 *   - Conversion after session exhaustion
 *   - Capabilities most requested
 *   - Sessions earned
 *   - Sessions consumed
 *   - Most valuable capability
 *   - Average reasoning duration
 *
 * No conversation storage. Only metadata.
 */
import type { ExecutionLevel } from '../types.ts';
import type {
  CapabilityUsageRecord,
  GovernanceAnalytics,
  UsageOutcome,
} from './types.ts';

class GovernanceAnalyticsImpl {
  private analytics = new Map<string, GovernanceAnalytics>();

  private getOrCreate(profileId: string): GovernanceAnalytics {
    let a = this.analytics.get(profileId);
    if (!a) {
      a = {
        profileId,
        totalRequests: 0,
        previewConversions: 0,
        exhaustionConversions: 0,
        sessionsEarned: 0,
        sessionsConsumed: 0,
        capabilityRequests: {},
        usageRecords: [],
        averageReasoningDuration: 0,
      };
      this.analytics.set(profileId, a);
    }
    return a;
  }

  trackCapabilityRequest(profileId: string, capabilityId: string): void {
    const a = this.getOrCreate(profileId);
    a.totalRequests += 1;
    a.capabilityRequests[capabilityId] = (a.capabilityRequests[capabilityId] || 0) + 1;
  }

  trackPreviewConversion(profileId: string, capabilityId: string): void {
    const a = this.getOrCreate(profileId);
    a.previewConversions += 1;
    a.capabilityRequests[capabilityId] = (a.capabilityRequests[capabilityId] || 0) + 1;
  }

  trackExhaustionConversion(profileId: string, capabilityId: string): void {
    const a = this.getOrCreate(profileId);
    a.exhaustionConversions += 1;
    a.capabilityRequests[capabilityId] = (a.capabilityRequests[capabilityId] || 0) + 1;
  }

  trackSessionEarned(profileId: string, sessions: number): void {
    const a = this.getOrCreate(profileId);
    a.sessionsEarned += sessions;
  }

  trackSessionConsumed(profileId: string, capabilityId: string): void {
    const a = this.getOrCreate(profileId);
    a.sessionsConsumed += 1;
    a.capabilityRequests[capabilityId] = (a.capabilityRequests[capabilityId] || 0) + 1;
  }

  trackCapabilityUsage(
    profileId: string,
    capabilityId: string,
    executionLevel: ExecutionLevel,
    outcome: UsageOutcome,
    duration: number
  ): void {
    const a = this.getOrCreate(profileId);
    a.usageRecords.push({
      capabilityId,
      executionLevel,
      outcome,
      duration,
      timestamp: new Date().toISOString(),
    });
    this.recomputeAverages(a);
  }

  private recomputeAverages(a: GovernanceAnalytics): void {
    if (a.usageRecords.length === 0) return;
    const total = a.usageRecords.reduce((sum, r) => sum + r.duration, 0);
    a.averageReasoningDuration = total / a.usageRecords.length;

    // Most valuable = most accepted
    const accepted = a.usageRecords.filter((r) => r.outcome === 'accepted');
    if (accepted.length > 0) {
      const counts: Record<string, number> = {};
      for (const r of accepted) {
        counts[r.capabilityId] = (counts[r.capabilityId] || 0) + 1;
      }
      a.mostValuableCapability = Object.entries(counts).sort(
        (x, y) => y[1] - x[1]
      )[0][0];
    }
  }

  getAnalytics(profileId: string): GovernanceAnalytics | undefined {
    return this.analytics.get(profileId);
  }

  getMostValuableCapability(): string | undefined {
    let max = 0;
    let result: string | undefined;
    for (const a of this.analytics.values()) {
      if (a.totalRequests > max) {
        max = a.totalRequests;
        result = a.mostValuableCapability;
      }
    }
    return result;
  }

  getAverageReasoningDuration(): number {
    const all = Array.from(this.analytics.values());
    if (all.length === 0) return 0;
    const total = all.reduce((sum, a) => sum + a.averageReasoningDuration, 0);
    return total / all.length;
  }

  clear(): void {
    this.analytics.clear();
  }
}

export const governanceAnalytics = new GovernanceAnalyticsImpl();