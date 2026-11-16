/**
 * businessStateSync/shadowSync.ts — Phase 14.3
 *
 * Shadow Synchronization — DO NOT enable production propagation.
 *
 * Run every synchronization in SHADOW MODE. Compare:
 *   - Expected refreshes (what the registry says should refresh)
 *   - Actual refreshes (what the existing mechanisms actually refreshed)
 *   - Missed consumers (expected but not actual)
 *   - Unexpected consumers (actual but not expected)
 *   - Propagation timing
 *
 * Document all differences. Nothing mutates production automatically.
 */

import type {
  BusinessStateEvent,
  ConsumerId,
  ShadowSyncResult,
  ShadowDifference,
  PropagationDecision,
} from './types.ts';

// ── Run shadow comparison ────────────────────────────────────────────────────
// FIX (Phase 14.3A): Only IMMEDIATE consumers that don't refresh are "missed."
// BACKGROUND and NEXT_OPEN consumers are "expected deferred" — they refresh
// later, not immediately. The original implementation incorrectly flagged
// all automatic consumers that didn't refresh immediately as "missed."
export function runShadowComparison(
  event: BusinessStateEvent,
  decisions: PropagationDecision[],
  actualRefreshes: ConsumerId[],
  propagationTimingMs: number = 0,
): ShadowSyncResult {
  // Expected IMMEDIATE = automatic + immediate mode (these should refresh now)
  const expectedImmediate: ConsumerId[] = decisions
    .filter(d => d.classification === 'automatic' && d.refresh_mode === 'immediate')
    .map(d => d.consumer_id);

  // Expected DEFERRED = automatic + background/next_open mode (these refresh later)
  const expectedDeferred: ConsumerId[] = decisions
    .filter(d => d.classification === 'automatic' && (d.refresh_mode === 'background' || d.refresh_mode === 'next_open'))
    .map(d => d.consumer_id);

  // All expected (for the result record)
  const expectedRefreshes: ConsumerId[] = [...expectedImmediate, ...expectedDeferred];

  // Missed = expected IMMEDIATE but not in actual (these are real misses)
  const missedConsumers = expectedImmediate.filter(
    c => !actualRefreshes.includes(c),
  );

  // Unexpected = actual but not in expected (immediate or deferred)
  const unexpectedConsumers = actualRefreshes.filter(
    c => !expectedRefreshes.includes(c),
  );

  // Build differences
  const differences: ShadowDifference[] = [];

  for (const consumer of missedConsumers) {
    differences.push({
      consumer_id: consumer,
      difference_type: 'missed_refresh',
      detail: `${consumer} was expected to refresh immediately for ${event.event_type} but did not.`,
    });
  }

  for (const consumer of unexpectedConsumers) {
    differences.push({
      consumer_id: consumer,
      difference_type: 'unexpected_refresh',
      detail: `${consumer} refreshed for ${event.event_type} but was not expected to.`,
    });
  }

  // Timing variance (if propagation took longer than expected)
  const expectedTimingMs = expectedImmediate.length * 100; // ~100ms per immediate consumer
  if (propagationTimingMs > expectedTimingMs * 2 && expectedTimingMs > 0) {
    differences.push({
      consumer_id: 'all' as ConsumerId,
      difference_type: 'timing_variance',
      detail: `Propagation took ${propagationTimingMs}ms (expected ~${expectedTimingMs}ms).`,
    });
  }

  return {
    event_id: event.event_id,
    expected_refreshes: expectedRefreshes,
    actual_refreshes: actualRefreshes,
    missed_consumers: missedConsumers,
    unexpected_consumers: unexpectedConsumers,
    propagation_timing_ms: propagationTimingMs,
    differences,
  };
}

// ── Detect missed consumers ──────────────────────────────────────────────────
export function detectMissedConsumers(
  expected: ConsumerId[],
  actual: ConsumerId[],
): ConsumerId[] {
  return expected.filter(c => !actual.includes(c));
}

// ── Detect unexpected consumers ──────────────────────────────────────────────
export function detectUnexpectedConsumers(
  expected: ConsumerId[],
  actual: ConsumerId[],
): ConsumerId[] {
  return actual.filter(c => !expected.includes(c));
}

// ── Check if shadow results have differences ─────────────────────────────────
export function hasDifferences(result: ShadowSyncResult): boolean {
  return result.differences.length > 0;
}

// ── Summarize shadow results ────────────────────────────────────────────────
export function summarizeShadowResults(results: ShadowSyncResult[]): {
  total_events: number;
  events_with_differences: number;
  total_missed: number;
  total_unexpected: number;
  total_timing_variances: number;
} {
  let eventsWithDiffs = 0;
  let totalMissed = 0;
  let totalUnexpected = 0;
  let totalTiming = 0;

  for (const result of results) {
    if (hasDifferences(result)) eventsWithDiffs++;
    totalMissed += result.missed_consumers.length;
    totalUnexpected += result.unexpected_consumers.length;
    totalTiming += result.differences.filter(d => d.difference_type === 'timing_variance').length;
  }

  return {
    total_events: results.length,
    events_with_differences: eventsWithDiffs,
    total_missed: totalMissed,
    total_unexpected: totalUnexpected,
    total_timing_variances: totalTiming,
  };
}