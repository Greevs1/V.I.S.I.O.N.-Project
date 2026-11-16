/**
 * businessStateSync/eventOrdering.ts — Phase 14.3A
 *
 * Dependency-Aware Event Ordering — CBSS determines the correct refresh
 * order based on fact dependencies. It does NOT perform calculations
 * itself — it only determines the order in which consumers should refresh.
 *
 * Fact Dependency Graph (from canonical fact registry lineage):
 *   revenue           → (independent, level 0)
 *   gross_profit      → (independent, level 0)
 *   gross_margin      → revenue, gross_profit (derived, level 1)
 *   net_income        → (independent, level 0)
 *   reported_ebitda   → (independent, level 0)
 *   normalized_ebitda  → reported_ebitda, owner_compensation (derived, level 1)
 *   owner_compensation → (independent, level 0)
 *   cash              → (independent, level 0)
 *   debt              → (independent, level 0)
 *   customer_concentration → (independent, level 0)
 *
 * Refresh order: independent facts first, then derived facts.
 * This ensures that when a document changes both revenue and gross_margin,
 * revenue is processed first so gross_margin can use the updated value.
 */

import type { BusinessStateEvent, ConsumerId } from './types.ts';

// ── Fact Dependency Graph ───────────────────────────────────────────────────
export const FACT_DEPENDENCIES: Record<string, string[]> = {
  revenue: [],
  gross_profit: [],
  gross_margin: ['revenue', 'gross_profit'],
  net_income: [],
  reported_ebitda: [],
  normalized_ebitda: ['reported_ebitda', 'owner_compensation'],
  owner_compensation: [],
  cash: [],
  debt: [],
  customer_concentration: [],
};

// ── Compute dependency level for a fact ──────────────────────────────────────
export function getDependencyLevel(factKey: string): number {
  const deps = FACT_DEPENDENCIES[factKey] || [];
  if (deps.length === 0) return 0;
  let maxDepLevel = 0;
  for (const dep of deps) {
    const depLevel = getDependencyLevel(dep);
    if (depLevel > maxDepLevel) maxDepLevel = depLevel;
  }
  return maxDepLevel + 1;
}

// ── Get blocking dependencies for a fact ────────────────────────────────────
export function getBlockingDependencies(factKey: string): string[] {
  return FACT_DEPENDENCIES[factKey] || [];
}

// ── Order events by dependency (independent first) ──────────────────────────
export function orderEventsByDependency(
  events: BusinessStateEvent[],
): {
  ordered: BusinessStateEvent[];
  refresh_order: Array<{ event_id: string; fact_key: string; dependency_level: number; blocking_dependencies: string[] }>;
} {
  const withLevels = events.map(event => ({
    event,
    dependency_level: getDependencyLevel(event.fact_key),
    blocking_dependencies: getBlockingDependencies(event.fact_key),
  }));

  // Sort by dependency level (0 first), then by timestamp
  withLevels.sort((a, b) => {
    if (a.dependency_level !== b.dependency_level) {
      return a.dependency_level - b.dependency_level;
    }
    return new Date(a.event.timestamp).getTime() - new Date(b.event.timestamp).getTime();
  });

  return {
    ordered: withLevels.map(w => w.event),
    refresh_order: withLevels.map(w => ({
      event_id: w.event.event_id,
      fact_key: w.event.fact_key,
      dependency_level: w.dependency_level,
      blocking_dependencies: w.blocking_dependencies,
    })),
  };
}

// ── Get consumer refresh order for a set of events ──────────────────────────
// Returns consumers in the order they should be refreshed, grouped by
// the dependency level of the events that triggered them.
export function getConsumerRefreshOrder(
  events: BusinessStateEvent[],
  affectedConsumersByEvent: Record<string, ConsumerId[]>,
): ConsumerId[] {
  const ordered = orderEventsByDependency(events);
  const seen = new Set<ConsumerId>();
  const result: ConsumerId[] = [];

  for (const event of ordered.ordered) {
    const consumers = affectedConsumersByEvent[event.event_id] || [];
    for (const consumer of consumers) {
      if (!seen.has(consumer)) {
        seen.add(consumer);
        result.push(consumer);
      }
    }
  }

  return result;
}