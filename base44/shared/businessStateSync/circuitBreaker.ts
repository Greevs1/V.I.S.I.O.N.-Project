/**
 * businessStateSync/circuitBreaker.ts — Phase 14.3B
 *
 * Per-Consumer Circuit Breakers — Dashboard and Galileo have INDEPENDENT
 * circuit breakers. If one fails repeatedly, only THAT consumer's live sync
 * is disabled. The other continues running.
 *
 * No single consumer failure may cascade.
 *
 * Trip threshold: 3 consecutive failures
 * Cooldown: 60 seconds (auto-reset after cooldown)
 * State: in-memory (persists across warm invocations, resets on cold start)
 */

import type { ConsumerId } from './types.ts';

// ── Configuration ─────────────────────────────────────────────────────────────
const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 60000;

// ── Breaker State ───────────────────────────────────────────────────────────
interface BreakerState {
  consumer_id: ConsumerId;
  failure_count: number;
  last_failure_at: number | null;
  tripped: boolean;
  trip_reason: string | null;
  tripped_at: number | null;
  last_success_at: number | null;
}

// ── In-memory breaker registry ───────────────────────────────────────────────
const breakers = new Map<ConsumerId, BreakerState>();

// ── Initialize a breaker if it doesn't exist ─────────────────────────────────
function ensureBreaker(consumerId: ConsumerId): BreakerState {
  if (!breakers.has(consumerId)) {
    breakers.set(consumerId, {
      consumer_id: consumerId,
      failure_count: 0,
      last_failure_at: null,
      tripped: false,
      trip_reason: null,
      tripped_at: null,
      last_success_at: null,
    });
  }
  return breakers.get(consumerId)!;
}

// ── Check if cooldown has expired (auto-reset) ──────────────────────────────
function checkCooldown(state: BreakerState): boolean {
  if (!state.tripped || !state.tripped_at) return false;
  const elapsed = Date.now() - state.tripped_at;
  if (elapsed >= COOLDOWN_MS) {
    // Auto-reset after cooldown
    state.tripped = false;
    state.trip_reason = null;
    state.tripped_at = null;
    state.failure_count = 0;
    return true; // Was tripped, now reset
  }
  return false;
}

// ── Record a success (resets failure count) ──────────────────────────────────
export function recordSuccess(consumerId: ConsumerId): void {
  const state = ensureBreaker(consumerId);
  state.failure_count = 0;
  state.last_success_at = Date.now();
  // If it was tripped, a success means it's healthy again
  if (state.tripped) {
    state.tripped = false;
    state.trip_reason = null;
    state.tripped_at = null;
  }
}

// ── Record a failure (increments count, trips if threshold exceeded) ────────
export function recordFailure(
  consumerId: ConsumerId,
  errorClass: string = 'unknown',
): { tripped: boolean; failure_count: number } {
  const state = ensureBreaker(consumerId);
  state.failure_count++;
  state.last_failure_at = Date.now();

  if (state.failure_count >= FAILURE_THRESHOLD && !state.tripped) {
    state.tripped = true;
    state.trip_reason = `${errorClass} (${state.failure_count} consecutive failures)`;
    state.tripped_at = Date.now();
    return { tripped: true, failure_count: state.failure_count };
  }

  return { tripped: false, failure_count: state.failure_count };
}

// ── Check if a breaker is tripped ─────────────────────────────────────────────
export function isTripped(consumerId: ConsumerId): boolean {
  const state = ensureBreaker(consumerId);
  checkCooldown(state);
  return state.tripped;
}

// ── Get the full breaker state ────────────────────────────────────────────────
export function getBreakerState(consumerId: ConsumerId): BreakerState {
  const state = ensureBreaker(consumerId);
  checkCooldown(state);
  return { ...state };
}

// ── Get all breaker states ────────────────────────────────────────────────────
export function getAllBreakerStates(): Record<string, BreakerState> {
  const result: Record<string, BreakerState> = {};
  for (const [consumerId, state] of breakers) {
    checkCooldown(state);
    result[consumerId] = { ...state };
  }
  return result;
}

// ── Manually trip a breaker ──────────────────────────────────────────────────
export function tripBreaker(consumerId: ConsumerId, reason: string): void {
  const state = ensureBreaker(consumerId);
  state.tripped = true;
  state.trip_reason = reason;
  state.tripped_at = Date.now();
}

// ── Manually reset a breaker ──────────────────────────────────────────────────
export function resetBreaker(consumerId: ConsumerId): void {
  const state = ensureBreaker(consumerId);
  state.tripped = false;
  state.trip_reason = null;
  state.tripped_at = null;
  state.failure_count = 0;
}

// ── Reset all breakers ────────────────────────────────────────────────────────
export function resetAllBreakers(): void {
  for (const [, state] of breakers) {
    state.tripped = false;
    state.trip_reason = null;
    state.tripped_at = null;
    state.failure_count = 0;
  }
}