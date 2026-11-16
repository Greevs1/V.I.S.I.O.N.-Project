/**
 * businessStateSync/orchestrator.ts — Phase 14.3
 *
 * Change Orchestration — orchestration ONLY. Not automatic mutation.
 *
 * Flow:
 *   Canonical Fact Updated
 *     ↓
 *   Business State Event
 *     ↓
 *   Subscription Registry
 *     ↓
 *   Refresh Decision
 *     ↓
 *   Consumer Refresh (shadow only — no production mutation)
 *
 * Consumers continue using their certified engines. This orchestrator
 * only decides WHAT should refresh and HOW (classification), then
 * produces explainable reports and timeline entries.
 *
 * SHADOW MODE: is_shadow_mode = true. No production propagation.
 */

import type {
  BusinessStateEvent,
  ConsumerId,
  OrchestrationResult,
  PropagationDecision,
} from './types.ts';
import { getConsumersForFact } from './subscriptionRegistry.ts';
import { classifyPropagationBatch } from './governance.ts';
import { generateExplanation } from './explainableSync.ts';
import { createTimelineEntry } from './timeline.ts';
import { runShadowComparison } from './shadowSync.ts';
import { getObservabilityTracker } from './observability.ts';
import { deduplicateEvents, deduplicateConsumerRefreshes } from './deduplication.ts';
import { orderEventsByDependency } from './eventOrdering.ts';

// ── Shadow mode flag ─────────────────────────────────────────────────────────
const IS_SHADOW_MODE = true;

// ── Orchestrate a single Business State Event ───────────────────────────────
export function orchestrateBusinessStateEvent(
  event: BusinessStateEvent,
  actualRefreshes: ConsumerId[] = [],
  propagationTimingMs: number = 0,
): OrchestrationResult {
  // 1. Subscription Registry — find consumers subscribed to this fact
  const subscriptions = getConsumersForFact(event.fact_key);
  const consumerIds: ConsumerId[] = subscriptions.map(s => s.consumer_id);

  // 2. Classify propagation for each consumer
  const decisions: PropagationDecision[] = classifyPropagationBatch(event, consumerIds);

  // 3. Generate explainable synchronization report
  const explainableReport = generateExplanation(event, decisions);

  // 4. Create timeline entry
  const timelineEntry = createTimelineEntry(event, decisions, IS_SHADOW_MODE);

  // 5. Run shadow comparison
  const shadowResult = runShadowComparison(
    event,
    decisions,
    actualRefreshes,
    propagationTimingMs,
  );

  // 6. Build orchestration result
  const result: OrchestrationResult = {
    event,
    decisions,
    explainable_report: explainableReport,
    timeline_entry: timelineEntry,
    shadow_result: shadowResult,
    is_shadow_mode: IS_SHADOW_MODE,
  };

  // 7. Record observability metrics
  const tracker = getObservabilityTracker();
  tracker.recordEvent(result);

  return result;
}

// ── Batch orchestrate multiple events (with dedup + ordering) ───────────────
export function orchestrateBusinessStateEvents(
  events: BusinessStateEvent[],
  actualRefreshesByEvent: Record<string, ConsumerId[]> = {},
): OrchestrationResult[] {
  // 1. Deduplicate events (collapse identical events within 5s window)
  const { deduplicated, duplicates_removed } = deduplicateEvents(events);

  // 2. Order by dependency (independent facts first, derived facts later)
  const { ordered } = orderEventsByDependency(deduplicated);

  // 3. Orchestrate each event in dependency order
  const results = ordered.map(event =>
    orchestrateBusinessStateEvent(
      event,
      actualRefreshesByEvent[event.event_id] || [],
    ),
  );

  // 4. Compute deduplicated consumer refresh set
  const refreshDedup = deduplicateConsumerRefreshes(results);

  // Attach dedup metadata to the first result for observability
  if (results.length > 0) {
    (results[0] as any)._batch_meta = {
      original_event_count: events.length,
      deduplicated_event_count: deduplicated.length,
      duplicates_removed,
      unique_consumers_to_refresh: refreshDedup.unique_consumers,
      deduplicated_refresh_count: refreshDedup.deduplicated_count,
    };
  }

  return results;
}

// ── Get the shadow mode status ──────────────────────────────────────────────
export function isShadowMode(): boolean {
  return IS_SHADOW_MODE;
}

// ── Get orchestration summary for a business ────────────────────────────────
export function getOrchestrationSummary(
  results: OrchestrationResult[],
): {
  total_events: number;
  automatic: number;
  advisor_review: number;
  verification_required: number;
  blocked: number;
  shadow_only: number;
} {
  let automatic = 0;
  let advisorReview = 0;
  let verificationRequired = 0;
  let blocked = 0;
  let shadowOnly = 0;

  for (const result of results) {
    for (const decision of result.decisions) {
      switch (decision.classification) {
        case 'automatic': automatic++; break;
        case 'advisor_review': advisorReview++; break;
        case 'verification_required': verificationRequired++; break;
        case 'blocked': blocked++; break;
      }
    }
    if (result.timeline_entry.propagation_status === 'shadow_only') shadowOnly++;
  }

  return {
    total_events: results.length,
    automatic,
    advisor_review: advisorReview,
    verification_required: verificationRequired,
    blocked,
    shadow_only: shadowOnly,
  };
}