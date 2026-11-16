/**
 * businessStateSync/observability.ts — Phase 14.3
 *
 * Observability — track synchronization metrics.
 *
 * Tracks:
 *   - Events generated
 *   - Consumers notified
 *   - Consumers refreshed
 *   - Consumers blocked
 *   - Consumers deferred
 *   - Review-required events
 *   - Propagation duration
 *
 * No user-visible diagnostics. Internal metrics only.
 */

import type {
  OrchestrationResult,
  ObservabilityMetrics,
  ConsumerMetrics,
} from './types.ts';

// ── Observability Tracker ────────────────────────────────────────────────────
export class ObservabilityTracker {
  private metrics: ObservabilityMetrics;

  constructor() {
    this.metrics = this.emptyMetrics();
  }

  private emptyMetrics(): ObservabilityMetrics {
    return {
      events_generated: 0,
      consumers_notified: 0,
      consumers_refreshed: 0,
      consumers_blocked: 0,
      consumers_deferred: 0,
      review_required_events: 0,
      propagation_duration_ms: 0,
      by_consumer: {},
      by_event_type: {},
    };
  }

  private ensureConsumer(consumerId: string): ConsumerMetrics {
    if (!this.metrics.by_consumer[consumerId]) {
      this.metrics.by_consumer[consumerId] = {
        notified: 0,
        refreshed: 0,
        blocked: 0,
        deferred: 0,
        avg_refresh_ms: 0,
      };
    }
    return this.metrics.by_consumer[consumerId];
  }

  // ── Record an orchestration result ─────────────────────────────────────────
  recordEvent(result: OrchestrationResult): void {
    this.metrics.events_generated++;
    this.metrics.propagation_duration_ms += result.shadow_result.propagation_timing_ms;

    // Count by event type
    const eventType = result.event.event_type;
    this.metrics.by_event_type[eventType] = (this.metrics.by_event_type[eventType] || 0) + 1;

    // Check if review required
    const hasReview = result.decisions.some(
      d => d.classification === 'advisor_review' || d.classification === 'verification_required',
    );
    if (hasReview) this.metrics.review_required_events++;

    // Per-consumer metrics
    for (const decision of result.decisions) {
      const consumer = this.ensureConsumer(decision.consumer_id);
      consumer.notified++;

      switch (decision.classification) {
        case 'automatic':
          consumer.refreshed++;
          this.metrics.consumers_refreshed++;
          break;
        case 'advisor_review':
        case 'verification_required':
          consumer.deferred++;
          this.metrics.consumers_deferred++;
          break;
        case 'blocked':
          consumer.blocked++;
          this.metrics.consumers_blocked++;
          break;
      }

      this.metrics.consumers_notified++;
    }
  }

  // ── Get current metrics ────────────────────────────────────────────────────
  getMetrics(): ObservabilityMetrics {
    return { ...this.metrics };
  }

  // ── Reset metrics ──────────────────────────────────────────────────────────
  reset(): void {
    this.metrics = this.emptyMetrics();
  }

  // ── Get metrics for a specific consumer ───────────────────────────────────
  getConsumerMetrics(consumerId: string): ConsumerMetrics | null {
    return this.metrics.by_consumer[consumerId] || null;
  }

  // ── Get event type counts ──────────────────────────────────────────────────
  getEventTypeCounts(): Record<string, number> {
    return { ...this.metrics.by_event_type };
  }
}

// ── Singleton instance ──────────────────────────────────────────────────────
let globalTracker: ObservabilityTracker | null = null;

export function getObservabilityTracker(): ObservabilityTracker {
  if (!globalTracker) {
    globalTracker = new ObservabilityTracker();
  }
  return globalTracker;
}