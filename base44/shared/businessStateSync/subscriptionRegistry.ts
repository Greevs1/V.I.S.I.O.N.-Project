/**
 * businessStateSync/subscriptionRegistry.ts — Phase 14.3
 *
 * Reusable Subscription Registry.
 *
 * Each consumer declares:
 *   - Facts subscribed to
 *   - Refresh mode
 *   - Priority
 *   - Review requirements
 *   - Background refresh eligibility
 *   - Certified engine used for refresh
 *
 * Registry-driven. No hardcoded propagation.
 * Consumers continue using their certified engines — this registry only
 * declares WHAT they subscribe to, not HOW they refresh.
 */

import type { ConsumerId, ConsumerSubscription } from './types.ts';

// ── Consumer Subscriptions ───────────────────────────────────────────────────
export const CONSUMER_SUBSCRIPTIONS: ConsumerSubscription[] = [
  {
    consumer_id: 'dashboard',
    display_name: 'Dashboard',
    fact_keys: [
      'revenue', 'gross_profit', 'net_income', 'reported_ebitda', 'normalized_ebitda',
      'debt', 'cash', 'owner_compensation', 'customer_concentration',
    ],
    refresh_mode: 'immediate',
    priority: 1,
    review_required: false,
    background_refresh_eligible: true,
    refresh_path: 'React Query invalidation via bisVersion increment → BIS rebuild → BIE engine → Dashboard re-render',
    certified_engine: 'buildBusinessIntelligenceEngine (BIE)',
  },
  {
    consumer_id: 'galileo',
    display_name: 'Galileo',
    fact_keys: [
      'revenue', 'gross_profit', 'net_income', 'reported_ebitda', 'normalized_ebitda',
      'debt', 'cash', 'owner_compensation', 'customer_concentration',
    ],
    refresh_mode: 'immediate',
    priority: 2,
    review_required: false,
    background_refresh_eligible: true,
    refresh_path: 'buildGalileoContext rebuild on next askGalileo call → canonical facts re-resolved',
    certified_engine: 'buildGalileoContext + canonicalFact/consumerAdapter',
  },
  {
    consumer_id: 'executive_brief',
    display_name: 'Executive Brief',
    fact_keys: ['revenue'],
    refresh_mode: 'immediate',
    priority: 1,
    review_required: false,
    background_refresh_eligible: false,
    refresh_path: 'BIS rebuild → executiveNarrativeEngine → buildProfitGapNarrative reads bis._raw.revenue',
    certified_engine: 'executiveNarrativeEngine (via BIE)',
  },
  {
    consumer_id: 'business_intelligence',
    display_name: 'Business Intelligence Engine',
    fact_keys: [
      'revenue', 'gross_profit', 'net_income', 'reported_ebitda', 'normalized_ebitda',
      'debt', 'cash', 'owner_compensation', 'customer_concentration',
    ],
    refresh_mode: 'immediate',
    priority: 1,
    review_required: false,
    background_refresh_eligible: true,
    refresh_path: 'BIE engine rebuild via buildBusinessIntelligenceState → canonicalFacts preferred',
    certified_engine: 'buildBusinessIntelligenceEngine (BIE)',
  },
  {
    consumer_id: 'growth_plan',
    display_name: 'Growth Plan',
    fact_keys: ['revenue', 'reported_ebitda', 'normalized_ebitda', 'customer_concentration'],
    refresh_mode: 'background',
    priority: 3,
    review_required: false,
    background_refresh_eligible: true,
    refresh_path: 'GrowthPlanWorkspace re-derives candidate initiatives from insightsEngine on next render',
    certified_engine: 'insightsEngine (growthPlanEngine)',
  },
  {
    consumer_id: 'reports',
    display_name: 'Deliverables & Reports',
    fact_keys: ['revenue', 'reported_ebitda', 'normalized_ebitda'],
    refresh_mode: 'next_open',
    priority: 4,
    review_required: false,
    background_refresh_eligible: false,
    refresh_path: 'DeliverablesWorkspace rebuilds from published version on next open (published versions immutable)',
    certified_engine: 'deliverablesEngine',
  },
  {
    consumer_id: 'meeting_prep',
    display_name: 'Meeting Prep',
    fact_keys: ['revenue', 'reported_ebitda', 'normalized_ebitda'],
    refresh_mode: 'next_open',
    priority: 5,
    review_required: false,
    background_refresh_eligible: false,
    refresh_path: 'StrategyCall page rebuilds from BIS on next open',
    certified_engine: 'BIS projection (via BIE)',
  },
  {
    consumer_id: 'assessments',
    display_name: 'Assessments',
    fact_keys: ['business_profile', 'revenue', 'gross_profit', 'net_income'],
    refresh_mode: 'background',
    priority: 3,
    review_required: false,
    background_refresh_eligible: true,
    refresh_path: 'Assessment prefill map updates from canonical facts on next assessment open',
    certified_engine: 'assessmentPrefillMap',
  },
  {
    consumer_id: 'valuation',
    display_name: 'Valuation',
    fact_keys: [
      'revenue', 'gross_profit', 'net_income', 'reported_ebitda', 'normalized_ebitda',
      'debt', 'cash', 'owner_compensation', 'customer_concentration',
    ],
    refresh_mode: 'review_required',
    priority: 2,
    review_required: true,
    background_refresh_eligible: false,
    refresh_path: 'Valuation stalenessMap marks calculations stale → advisor review required before recalculation',
    certified_engine: 'stalenessMap + valuationCalculationEngine',
  },
  {
    consumer_id: 'documents',
    display_name: 'Documents',
    fact_keys: ['document_verified'],
    refresh_mode: 'immediate',
    priority: 2,
    review_required: false,
    background_refresh_eligible: true,
    refresh_path: 'Document classification memory updates → Data Room refreshes on next open',
    certified_engine: 'classificationMemory',
  },
  {
    consumer_id: 'roadmap',
    display_name: 'Roadmap',
    fact_keys: ['revenue', 'reported_ebitda', 'normalized_ebitda'],
    refresh_mode: 'background',
    priority: 3,
    review_required: false,
    background_refresh_eligible: true,
    refresh_path: 'Roadmap recalculates from BIS on next render',
    certified_engine: 'BIS projection (via BIE)',
  },
  {
    consumer_id: 'sprints',
    display_name: '90-Day Sprints',
    fact_keys: ['revenue', 'reported_ebitda', 'normalized_ebitda', 'customer_concentration'],
    refresh_mode: 'background',
    priority: 3,
    review_required: false,
    background_refresh_eligible: true,
    refresh_path: 'Sprint recommendations re-derive from BIS on next sprint open',
    certified_engine: 'sprintRecommendations (via BIE)',
  },
];

// ── Registry lookup functions ────────────────────────────────────────────────
const SUBSCRIPTION_MAP: Record<string, ConsumerSubscription> = CONSUMER_SUBSCRIPTIONS.reduce(
  (acc, sub) => { acc[sub.consumer_id] = sub; return acc; },
  {} as Record<string, ConsumerSubscription>,
);

export function getSubscription(consumerId: ConsumerId): ConsumerSubscription | null {
  return SUBSCRIPTION_MAP[consumerId] || null;
}

export function getConsumersForFact(factKey: string): ConsumerSubscription[] {
  return CONSUMER_SUBSCRIPTIONS.filter(sub => sub.fact_keys.includes(factKey));
}

export function getAllSubscriptions(): ConsumerSubscription[] {
  return CONSUMER_SUBSCRIPTIONS;
}

export function isConsumerSubscribed(consumerId: ConsumerId, factKey: string): boolean {
  const sub = SUBSCRIPTION_MAP[consumerId];
  return sub ? sub.fact_keys.includes(factKey) : false;
}