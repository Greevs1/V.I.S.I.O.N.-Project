/**
 * businessStateSync/liveOrchestrator.ts — Phase 14.3B
 *
 * Live Synchronization Orchestrator — applies the live sync policy to
 * determine whether each consumer should receive LIVE or SHADOW propagation.
 *
 * Flow:
 *   BusinessStateEvent
 *     → Live Sync Policy (is this fact+consumer+business live?)
 *       → If LIVE:
 *         → Circuit Breaker check (is this consumer's breaker tripped?)
 *           → If tripped: SHADOW (fallback)
 *           → If healthy: Event Qualification
 *             → If qualified: LIVE ACTION (invalidate consumer)
 *             → If not qualified: SHADOW (record only)
 *       → If SHADOW: SHADOW ACTION (record only)
 *
 * Shadow comparison CONTINUES for ALL consumers, even live ones.
 * This gives us live actual vs shadow expected for comparison.
 */

import type {
  BusinessStateEvent,
  ConsumerId,
  PropagationDecision,
} from './types.ts';
import type { CanonicalFact } from '../canonicalFact/types.ts';
import { isLiveSyncEnabled, getLiveSyncMode } from './liveSyncPolicy.ts';
import { isTripped, recordSuccess, recordFailure } from './circuitBreaker.ts';
import { qualifyEvent, type QualificationResult } from './eventQualification.ts';
import { getConsumersForFact } from './subscriptionRegistry.ts';
import { classifyPropagationBatch } from './governance.ts';

// ── Live Sync Action ─────────────────────────────────────────────────────────
export interface LiveSyncAction {
  event_id: string;
  business_id: string;
  fact_key: string;
  consumer_id: ConsumerId;
  mode: 'live' | 'shadow';
  action_type: 'invalidate' | 'record_only' | 'fallback';
  qualification_result?: QualificationResult;
  governance_classification: string;
  circuit_breaker_tripped: boolean;
  circuit_breaker_reason?: string;
  status: 'pending' | 'completed' | 'failed' | 'fallback_used' | 'shadow_recorded';
  reason: string;
  timestamp: string;
}

// ── Live Orchestration Result ───────────────────────────────────────────────
export interface LiveOrchestrationResult {
  event: BusinessStateEvent;
  shadow_decisions: PropagationDecision[];  // ALL consumers (shadow comparison continues)
  live_actions: LiveSyncAction[];            // Per-consumer actions (live or shadow)
  summary: {
    total_consumers: number;
    live_consumers: number;
    shadow_consumers: number;
    qualified_live: number;
    blocked_by_breaker: number;
    blocked_by_qualification: number;
    blocked_by_policy: number;
  };
}

// ── Orchestrate a single event through the live sync pipeline ────────────────
export function orchestrateLiveSync(
  event: BusinessStateEvent,
  canonicalFact?: CanonicalFact,
): LiveOrchestrationResult {
  // 1. Get all consumers subscribed to this fact (for shadow comparison)
  const subscriptions = getConsumersForFact(event.fact_key);
  const consumerIds: ConsumerId[] = subscriptions.map(s => s.consumer_id);

  // 2. Shadow decisions for ALL consumers (shadow comparison continues)
  const shadowDecisions = classifyPropagationBatch(event, consumerIds);

  // 3. For each consumer, determine live vs shadow action
  const liveActions: LiveSyncAction[] = [];
  let liveCount = 0;
  let shadowCount = 0;
  let qualifiedLive = 0;
  let blockedByBreaker = 0;
  let blockedByQualification = 0;
  let blockedByPolicy = 0;

  for (const consumerId of consumerIds) {
    const shadowDecision = shadowDecisions.find(d => d.consumer_id === consumerId)!;
    const governanceClassification = shadowDecision.classification;

    // Check if this fact+consumer+business is in the live matrix
    const liveEnabled = isLiveSyncEnabled(event.fact_key, consumerId, event.business_id);

    if (!liveEnabled) {
      // SHADOW: record only
      liveActions.push({
        event_id: event.event_id,
        business_id: event.business_id,
        fact_key: event.fact_key,
        consumer_id: consumerId,
        mode: 'shadow',
        action_type: 'record_only',
        governance_classification: governanceClassification,
        circuit_breaker_tripped: false,
        status: 'shadow_recorded',
        reason: 'Not in live matrix or business not in pilot cohort. Shadow mode.',
        timestamp: new Date().toISOString(),
      });
      shadowCount++;
      blockedByPolicy++;
      continue;
    }

    // LIVE: check circuit breaker
    if (isTripped(consumerId)) {
      // Breaker tripped — fall back to shadow
      liveActions.push({
        event_id: event.event_id,
        business_id: event.business_id,
        fact_key: event.fact_key,
        consumer_id: consumerId,
        mode: 'shadow',
        action_type: 'fallback',
        governance_classification: governanceClassification,
        circuit_breaker_tripped: true,
        circuit_breaker_reason: 'Circuit breaker tripped due to repeated failures',
        status: 'fallback_used',
        reason: 'Circuit breaker tripped. Falling back to shadow mode.',
        timestamp: new Date().toISOString(),
      });
      shadowCount++;
      blockedByBreaker++;
      continue;
    }

    // LIVE: qualify the event (fact-aware: period-based vs point-in-time)
    const qualification = qualifyEvent(event, consumerId, canonicalFact);

    if (!qualification.qualified) {
      // Not qualified — shadow (record only)
      liveActions.push({
        event_id: event.event_id,
        business_id: event.business_id,
        fact_key: event.fact_key,
        consumer_id: consumerId,
        mode: 'shadow',
        action_type: 'record_only',
        qualification_result: qualification,
        governance_classification: governanceClassification,
        circuit_breaker_tripped: false,
        status: 'shadow_recorded',
        reason: `Event not qualified for live sync: ${qualification.reason}`,
        timestamp: new Date().toISOString(),
      });
      shadowCount++;
      blockedByQualification++;
      continue;
    }

    // LIVE: qualified — create invalidate action
    liveActions.push({
      event_id: event.event_id,
      business_id: event.business_id,
      fact_key: event.fact_key,
      consumer_id: consumerId,
      mode: 'live',
      action_type: 'invalidate',
      qualification_result: qualification,
      governance_classification: governanceClassification,
      circuit_breaker_tripped: false,
      status: 'pending',
      reason: 'Event qualified for live propagation. Consumer should invalidate and re-read canonical fact.',
      timestamp: new Date().toISOString(),
    });
    liveCount++;
    qualifiedLive++;
  }

  return {
    event,
    shadow_decisions: shadowDecisions,
    live_actions: liveActions,
    summary: {
      total_consumers: consumerIds.length,
      live_consumers: liveCount,
      shadow_consumers: shadowCount,
      qualified_live: qualifiedLive,
      blocked_by_breaker: blockedByBreaker,
      blocked_by_qualification: blockedByQualification,
      blocked_by_policy: blockedByPolicy,
    },
  };
}

// ── Record the result of a live sync action (success or failure) ────────────
export function recordLiveActionResult(
  consumerId: ConsumerId,
  success: boolean,
  errorClass?: string,
): void {
  if (success) {
    recordSuccess(consumerId);
  } else {
    recordFailure(consumerId, errorClass);
  }
}