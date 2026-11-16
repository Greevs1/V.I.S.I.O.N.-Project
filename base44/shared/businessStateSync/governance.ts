/**
 * businessStateSync/governance.ts — Phase 14.3
 *
 * Propagation Governance — every propagation decision must classify itself:
 *   Automatic          — safe to propagate without human intervention
 *   Advisor Review     — advisor must review before propagation
 *   Verification Required — fact must be verified before propagation
 *   Blocked            — propagation blocked by governance rules
 *
 * Never automatically propagate:
 *   - Conflicting facts
 *   - Advisor locked values
 *   - Published valuations
 *   - Client-approved values
 *   - Anything blocked by governance
 *
 * Reuses:
 *   - canonicalFact/types.ts (VerificationStatus, ResolutionStatus)
 *   - valuationEngine/stalenessMap.ts (review_required pattern)
 *   - canonicalFact/sourceHierarchy.ts (advisor_approved, published_snapshot)
 */

import type {
  BusinessStateEvent,
  ConsumerId,
  PropagationClassification,
  PropagationDecision,
} from './types.ts';
import type { CanonicalFact } from '../canonicalFact/types.ts';
import { getRefreshPolicy } from './refreshPolicies.ts';

// ── Classify a single propagation decision ────────────────────────────────────
export function classifyPropagation(
  event: BusinessStateEvent,
  consumerId: ConsumerId,
): PropagationDecision {
  const policy = getRefreshPolicy(event.event_type, consumerId);

  // ── BLOCKED conditions (never propagate) ───────────────────────────────────

  // Published valuations are immutable — never propagate changes to them
  if (event.source_authority === 'prior_published_version') {
    return {
      event,
      consumer_id: consumerId,
      classification: 'blocked',
      refresh_mode: 'blocked',
      reason: 'Published valuation snapshots are immutable historical evidence.',
      blocked_reason: 'published_version_immutable',
    };
  }

  // Conflicting facts — never auto-propagate
  if (event.verification_status === 'conflicting') {
    return {
      event,
      consumer_id: consumerId,
      classification: 'verification_required',
      refresh_mode: 'review_required',
      reason: 'Fact has conflicting sources — verification required before propagation.',
      blocked_reason: 'conflicting_fact',
    };
  }

  // ── REVIEW REQUIRED conditions ─────────────────────────────────────────────

  // Valuation always requires advisor review (stalenessMap pattern)
  if (consumerId === 'valuation' && policy.review_required) {
    return {
      event,
      consumer_id: consumerId,
      classification: 'advisor_review',
      refresh_mode: 'review_required',
      reason: 'Valuation calculations require advisor review before recalculation. Staleness marked, not auto-recalculated.',
    };
  }

  // Low confidence facts require verification
  if (event.confidence < 65) {
    return {
      event,
      consumer_id: consumerId,
      classification: 'verification_required',
      refresh_mode: 'review_required',
      reason: `Confidence ${event.confidence} is below threshold (65). Verification required before propagation.`,
    };
  }

  // Advisor-locked values (high authority, advisor-approved) — other consumers
  // can auto-refresh, but valuation still needs review
  if (event.verification_status === 'verified' && consumerId !== 'valuation') {
    return {
      event,
      consumer_id: consumerId,
      classification: 'automatic',
      refresh_mode: policy.refresh_mode,
      reason: 'Fact is advisor-verified. Safe to propagate to non-valuation consumers.',
    };
  }

  // ── AUTOMATIC conditions ───────────────────────────────────────────────────

  // If policy is immediate or background and no governance blocks, propagate
  if (policy.refresh_mode === 'immediate' || policy.refresh_mode === 'background') {
    return {
      event,
      consumer_id: consumerId,
      classification: 'automatic',
      refresh_mode: policy.refresh_mode,
      reason: `Policy ${policy.refresh_mode} for ${event.event_type} → ${consumerId}. No governance blocks.`,
    };
  }

  // ── DEFERRED conditions ────────────────────────────────────────────────────

  // next_open and review_required policies without blocks
  if (policy.refresh_mode === 'next_open') {
    return {
      event,
      consumer_id: consumerId,
      classification: 'automatic',
      refresh_mode: 'next_open',
      reason: 'Consumer will refresh on next open. No immediate action required.',
    };
  }

  // Default: review required
  return {
    event,
    consumer_id: consumerId,
    classification: 'advisor_review',
    refresh_mode: policy.refresh_mode,
    reason: 'Default classification: advisor review required.',
  };
}

// ── Check if a fact is blocked by governance ─────────────────────────────────
export function isBlockedByGovernance(
  event: BusinessStateEvent,
  consumerId: ConsumerId,
): boolean {
  const decision = classifyPropagation(event, consumerId);
  return decision.classification === 'blocked';
}

// ── Check if a canonical fact is advisor-locked ──────────────────────────────
export function isAdvisorLocked(canonicalFact: CanonicalFact): boolean {
  return canonicalFact.advisor_approved === true && canonicalFact.confidence_score >= 85;
}

// ── Check if a canonical fact is from a published version ────────────────────
export function isFromPublishedVersion(canonicalFact: CanonicalFact): boolean {
  return canonicalFact.source_type === 'prior_published_version';
}

// ── Check if a canonical fact is client-confirmed ────────────────────────────
export function isClientConfirmed(canonicalFact: CanonicalFact): boolean {
  return canonicalFact.client_confirmed === true;
}

// ── Batch: classify propagation for all consumers ────────────────────────────
export function classifyPropagationBatch(
  event: BusinessStateEvent,
  consumerIds: ConsumerId[],
): PropagationDecision[] {
  return consumerIds.map(cid => classifyPropagation(event, cid));
}