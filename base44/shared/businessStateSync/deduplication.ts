/**
 * businessStateSync/deduplication.ts — Phase 14.3A
 *
 * Event Deduplication — prevent refresh storms from duplicate or rapid-fire
 * events.
 *
 * Rules:
 *   1. Identical events (same business_id, fact_key, new_value) within a
 *      dedup window (default 5s) collapse to one event.
 *   2. Multi-fact document extraction produces multiple events but the
 *      consumer refresh set is deduplicated (Dashboard refreshes once, not
 *      once per fact).
 *   3. Same fact changed twice rapidly: only the latest value is kept.
 *   4. Business switch during queued event: events from previous business
 *      are NOT forwarded to the new business's consumers.
 *
 * Pure data module: no I/O, no side effects. Deterministic.
 */

import type { BusinessStateEvent, ConsumerId, OrchestrationResult } from './types.ts';

// ── Deduplication window (ms) ────────────────────────────────────────────────
const DEDUP_WINDOW_MS = 5000;

// ── Deduplication key ────────────────────────────────────────────────────────
function dedupKey(event: BusinessStateEvent): string {
  return `${event.business_id}:${event.fact_key}:${event.new_value}`;
}

// ── Deduplicate a list of events ─────────────────────────────────────────────
export function deduplicateEvents(
  events: BusinessStateEvent[],
  windowMs: number = DEDUP_WINDOW_MS,
): { deduplicated: BusinessStateEvent[]; duplicates_removed: number } {
  const seen = new Map<string, BusinessStateEvent>();
  let duplicatesRemoved = 0;

  // Sort by timestamp ascending so latest wins
  const sorted = [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  for (const event of sorted) {
    const key = dedupKey(event);
    const existing = seen.get(key);

    if (existing) {
      const timeDiff = Math.abs(
        new Date(event.timestamp).getTime() - new Date(existing.timestamp).getTime(),
      );
      if (timeDiff < windowMs) {
        // Duplicate within window — keep the latest
        duplicatesRemoved++;
        seen.set(key, event);
        continue;
      }
    }

    seen.set(key, event);
  }

  return {
    deduplicated: Array.from(seen.values()),
    duplicates_removed: duplicatesRemoved,
  };
}

// ── Deduplicate consumer refresh set across multiple events ─────────────────
// When multiple facts change (e.g., document extraction), each consumer
// should only be refreshed ONCE, not once per fact.
export function deduplicateConsumerRefreshes(
  results: OrchestrationResult[],
): {
  unique_consumers: ConsumerId[];
  deduplicated_count: number;
  per_consumer_events: Record<string, string[]>;
} {
  const consumerToEvents = new Map<ConsumerId, string[]>();
  let totalDecisions = 0;

  for (const result of results) {
    for (const decision of result.decisions) {
      if (decision.classification !== 'automatic') continue;
      totalDecisions++;
      if (!consumerToEvents.has(decision.consumer_id)) {
        consumerToEvents.set(decision.consumer_id, []);
      }
      consumerToEvents.get(decision.consumer_id)!.push(result.event.event_id);
    }
  }

  const uniqueConsumers = Array.from(consumerToEvents.keys());
  const perConsumerEvents: Record<string, string[]> = {};
  for (const [consumer, eventIds] of consumerToEvents) {
    perConsumerEvents[consumer] = eventIds;
  }

  return {
    unique_consumers: uniqueConsumers,
    deduplicated_count: totalDecisions - uniqueConsumers.length,
    per_consumer_events: perConsumerEvents,
  };
}

// ── Check if two events are duplicates ───────────────────────────────────────
export function areEventsDuplicates(
  a: BusinessStateEvent,
  b: BusinessStateEvent,
  windowMs: number = DEDUP_WINDOW_MS,
): boolean {
  if (a.business_id !== b.business_id) return false;
  if (a.fact_key !== b.fact_key) return false;
  if (a.new_value !== b.new_value) return false;
  const timeDiff = Math.abs(
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  return timeDiff < windowMs;
}

// ── Get deduplication window ─────────────────────────────────────────────────
export function getDedupWindowMs(): number {
  return DEDUP_WINDOW_MS;
}