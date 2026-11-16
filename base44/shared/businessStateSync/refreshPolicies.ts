/**
 * businessStateSync/refreshPolicies.ts — Phase 14.3
 *
 * Refresh Policies — per (event_type, consumer_id) policy resolution.
 *
 * Every consumer declares how it should react to each event type:
 *   Immediate      — refresh as soon as the event is received
 *   Background     — refresh in the background (no user-visible blocking)
 *   Review Required — advisor must review before refresh propagates
 *   Next Open      — refresh when the consumer is next opened
 *   Blocked        — propagation blocked by governance
 *
 * Reuses:
 *   - subscriptionRegistry (default refresh mode per consumer)
 *   - stalenessMap (valuation review_required pattern)
 */

import type {
  BusinessStateEventType,
  ConsumerId,
  RefreshMode,
  RefreshPolicy,
} from './types.ts';
import { getSubscription } from './subscriptionRegistry.ts';

// ── Policy Overrides ──────────────────────────────────────────────────────────
// Key format: `${event_type}:${consumer_id}`
// When no override exists, the consumer's default refresh_mode is used.
const POLICY_OVERRIDES: Record<string, Omit<RefreshPolicy, 'consumer_id' | 'event_type'>> = {
  // Revenue Updated
  'revenue_updated:dashboard': { refresh_mode: 'immediate', priority: 1, review_required: false },
  'revenue_updated:galileo': { refresh_mode: 'immediate', priority: 2, review_required: false },
  'revenue_updated:executive_brief': { refresh_mode: 'immediate', priority: 1, review_required: false },
  'revenue_updated:business_intelligence': { refresh_mode: 'immediate', priority: 1, review_required: false },
  'revenue_updated:growth_plan': { refresh_mode: 'background', priority: 3, review_required: false },
  'revenue_updated:reports': { refresh_mode: 'next_open', priority: 4, review_required: false },
  'revenue_updated:meeting_prep': { refresh_mode: 'next_open', priority: 5, review_required: false },
  'revenue_updated:valuation': { refresh_mode: 'review_required', priority: 2, review_required: true },
  'revenue_updated:roadmap': { refresh_mode: 'background', priority: 3, review_required: false },
  'revenue_updated:sprints': { refresh_mode: 'background', priority: 3, review_required: false },

  // EBITDA Updated
  'ebitda_updated:dashboard': { refresh_mode: 'immediate', priority: 1, review_required: false },
  'ebitda_updated:galileo': { refresh_mode: 'immediate', priority: 2, review_required: false },
  'ebitda_updated:business_intelligence': { refresh_mode: 'immediate', priority: 1, review_required: false },
  'ebitda_updated:growth_plan': { refresh_mode: 'background', priority: 3, review_required: false },
  'ebitda_updated:reports': { refresh_mode: 'next_open', priority: 4, review_required: false },
  'ebitda_updated:valuation': { refresh_mode: 'review_required', priority: 2, review_required: true },

  // Debt Updated
  'debt_updated:dashboard': { refresh_mode: 'immediate', priority: 1, review_required: false },
  'debt_updated:galileo': { refresh_mode: 'immediate', priority: 2, review_required: false },
  'debt_updated:valuation': { refresh_mode: 'review_required', priority: 2, review_required: true },

  // Cash Updated
  'cash_updated:dashboard': { refresh_mode: 'immediate', priority: 1, review_required: false },
  'cash_updated:galileo': { refresh_mode: 'immediate', priority: 2, review_required: false },
  'cash_updated:valuation': { refresh_mode: 'review_required', priority: 2, review_required: true },

  // Document Verified
  'document_verified:dashboard': { refresh_mode: 'background', priority: 3, review_required: false },
  'document_verified:galileo': { refresh_mode: 'background', priority: 3, review_required: false },
  'document_verified:valuation': { refresh_mode: 'review_required', priority: 2, review_required: true },
  'document_verified:documents': { refresh_mode: 'immediate', priority: 2, review_required: false },
  'document_verified:assessments': { refresh_mode: 'immediate', priority: 3, review_required: false },

  // Assessment Completed
  'assessment_completed:dashboard': { refresh_mode: 'immediate', priority: 1, review_required: false },
  'assessment_completed:galileo': { refresh_mode: 'immediate', priority: 2, review_required: false },
  'assessment_completed:executive_brief': { refresh_mode: 'immediate', priority: 1, review_required: false },
  'assessment_completed:business_intelligence': { refresh_mode: 'immediate', priority: 1, review_required: false },
  'assessment_completed:roadmap': { refresh_mode: 'background', priority: 3, review_required: false },
  'assessment_completed:sprints': { refresh_mode: 'background', priority: 3, review_required: false },
  'assessment_completed:meeting_prep': { refresh_mode: 'next_open', priority: 5, review_required: false },
  'assessment_completed:valuation': { refresh_mode: 'review_required', priority: 2, review_required: true },

  // Confidence Changed
  'confidence_changed:dashboard': { refresh_mode: 'immediate', priority: 1, review_required: false },
  'confidence_changed:galileo': { refresh_mode: 'immediate', priority: 2, review_required: false },
  'confidence_changed:executive_brief': { refresh_mode: 'immediate', priority: 1, review_required: false },
  'confidence_changed:valuation': { refresh_mode: 'review_required', priority: 2, review_required: true },

  // Verification Resolved
  'verification_resolved:dashboard': { refresh_mode: 'background', priority: 3, review_required: false },
  'verification_resolved:galileo': { refresh_mode: 'background', priority: 3, review_required: false },
  'verification_resolved:valuation': { refresh_mode: 'immediate', priority: 2, review_required: false },
  'verification_resolved:reports': { refresh_mode: 'next_open', priority: 4, review_required: false },

  // Growth Plan Updated
  'growth_plan_updated:dashboard': { refresh_mode: 'background', priority: 3, review_required: false },
  'growth_plan_updated:galileo': { refresh_mode: 'background', priority: 3, review_required: false },
  'growth_plan_updated:roadmap': { refresh_mode: 'background', priority: 3, review_required: false },
  'growth_plan_updated:sprints': { refresh_mode: 'background', priority: 3, review_required: false },

  // Valuation Published
  'valuation_published:dashboard': { refresh_mode: 'immediate', priority: 1, review_required: false },
  'valuation_published:galileo': { refresh_mode: 'immediate', priority: 2, review_required: false },
  'valuation_published:reports': { refresh_mode: 'immediate', priority: 2, review_required: false },
  'valuation_published:growth_plan': { refresh_mode: 'background', priority: 3, review_required: false },

  // Business DNA Updated
  'business_dna_updated:dashboard': { refresh_mode: 'background', priority: 3, review_required: false },
  'business_dna_updated:galileo': { refresh_mode: 'background', priority: 3, review_required: false },
  'business_dna_updated:growth_plan': { refresh_mode: 'background', priority: 3, review_required: false },

  // Business Profile Updated
  'business_profile_updated:dashboard': { refresh_mode: 'background', priority: 3, review_required: false },
  'business_profile_updated:galileo': { refresh_mode: 'background', priority: 3, review_required: false },
  'business_profile_updated:meeting_prep': { refresh_mode: 'next_open', priority: 5, review_required: false },
  'business_profile_updated:assessments': { refresh_mode: 'background', priority: 3, review_required: false },
};

// ── Resolve refresh policy ───────────────────────────────────────────────────
export function getRefreshPolicy(
  eventType: BusinessStateEventType,
  consumerId: ConsumerId,
): RefreshPolicy {
  const key = `${eventType}:${consumerId}`;
  const override = POLICY_OVERRIDES[key];
  const subscription = getSubscription(consumerId);

  if (override) {
    return { consumer_id: consumerId, event_type: eventType, ...override };
  }

  // Fall back to subscription default
  const defaultMode: RefreshMode = subscription?.refresh_mode || 'background';
  return {
    consumer_id: consumerId,
    event_type: eventType,
    refresh_mode: defaultMode,
    priority: subscription?.priority || 5,
    review_required: subscription?.review_required || false,
  };
}

// ── Get all policies for an event type ───────────────────────────────────────
export function getPoliciesForEventType(
  eventType: BusinessStateEventType,
  subscribedConsumers: ConsumerId[],
): RefreshPolicy[] {
  return subscribedConsumers
    .map(cid => getRefreshPolicy(eventType, cid))
    .sort((a, b) => a.priority - b.priority);
}