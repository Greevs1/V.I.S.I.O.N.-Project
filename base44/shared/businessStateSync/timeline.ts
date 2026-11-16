/**
 * businessStateSync/timeline.ts — Phase 14.3
 *
 * Business Change Timeline model — NOT UI. Only the underlying data model.
 *
 * Every business event supports:
 *   - Timestamp
 *   - Change description
 *   - Business fact
 *   - Evidence
 *   - Affected systems
 *   - Propagation status
 *   - Advisor review required
 *   - Verification status
 *   - Business impact
 *
 * Future UI will consume this model.
 */

import type {
  BusinessStateEvent,
  PropagationDecision,
  PropagationStatus,
  TimelineEntry,
  BusinessChangeTimeline,
} from './types.ts';
import { getImpactRadius } from './impactRadius.ts';

// ── Entry ID generator ───────────────────────────────────────────────────────
function generateEntryId(event: BusinessStateEvent): string {
  return `tl_${event.event_id}`;
}

// ── Determine propagation status from decisions ─────────────────────────────
function derivePropagationStatus(
  decisions: PropagationDecision[],
  isShadowMode: boolean,
): PropagationStatus {
  if (isShadowMode) return 'shadow_only';

  const allAutomatic = decisions.every(d => d.classification === 'automatic');
  const anyBlocked = decisions.some(d => d.classification === 'blocked');
  const anyReviewRequired = decisions.some(d => d.classification === 'advisor_review' || d.classification === 'verification_required');

  if (anyBlocked) return 'blocked';
  if (anyReviewRequired) return 'deferred';
  if (allAutomatic) return 'propagated';
  return 'pending';
}

// ── Create a timeline entry from an event and decisions ──────────────────────
export function createTimelineEntry(
  event: BusinessStateEvent,
  decisions: PropagationDecision[],
  isShadowMode: boolean = true,
): TimelineEntry {
  const impact = getImpactRadius(event.fact_key);
  const affectedSystems = decisions.map(d => d.consumer_id);
  const advisorReviewRequired = decisions.some(d => d.classification === 'advisor_review');

  const factDisplay = event.fact_key.replace(/_/g, ' ');
  const changeDescription = `${factDisplay} changed from ${event.previous_value} to ${event.new_value}`;

  return {
    entry_id: generateEntryId(event),
    event_id: event.event_id,
    timestamp: event.timestamp,
    change_description: changeDescription,
    business_fact: event.fact_key,
    evidence_reference: event.evidence_reference,
    affected_systems: affectedSystems,
    propagation_status: derivePropagationStatus(decisions, isShadowMode),
    advisor_review_required: advisorReviewRequired,
    verification_status: event.verification_status,
    business_impact: impact.business_impact,
  };
}

// ── Build a timeline from entries ───────────────────────────────────────────
export function buildTimeline(
  businessId: string,
  entries: TimelineEntry[],
): BusinessChangeTimeline {
  const sorted = [...entries].sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  return {
    business_id: businessId,
    entries: sorted,
  };
}

// ── Filter timeline entries by propagation status ────────────────────────────
export function filterByStatus(
  timeline: BusinessChangeTimeline,
  status: PropagationStatus,
): TimelineEntry[] {
  return timeline.entries.filter(e => e.propagation_status === status);
}

// ── Filter timeline entries requiring advisor review ─────────────────────────
export function filterAdvisorReviewRequired(
  timeline: BusinessChangeTimeline,
): TimelineEntry[] {
  return timeline.entries.filter(e => e.advisor_review_required);
}

// ── Get recent entries (last N) ──────────────────────────────────────────────
export function getRecentEntries(
  timeline: BusinessChangeTimeline,
  limit: number = 10,
): TimelineEntry[] {
  return timeline.entries.slice(0, limit);
}