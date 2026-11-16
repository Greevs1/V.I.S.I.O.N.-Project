/**
 * businessStateSync/types.ts — Phase 14.3
 *
 * Canonical Business State Synchronization (CBSS) — Type Contract.
 *
 * The platform must always maintain ONE synchronized understanding of the
 * business. Every business fact changes once. Every consumer reacts
 * appropriately. No consumer owns business truth. Consumers subscribe.
 *
 * This module is SHADOW MODE only. No production propagation occurs.
 * All types are declarative contracts consumed by the orchestrator.
 *
 * Reuses:
 *   - canonicalFact/types.ts (CanonicalFact, SourceAuthority, VerificationStatus)
 *   - canonicalFact/registry.ts (FactDefinition, fact_key)
 *   - valuationEngine/stalenessMap.ts (SourceChangeType, CalculationType)
 */

import type { SourceAuthority, VerificationStatus } from '../canonicalFact/types.ts';

// ── Business State Event Type ───────────────────────────────────────────────
export type BusinessStateEventType =
  | 'revenue_updated'
  | 'gross_profit_updated'
  | 'net_income_updated'
  | 'ebitda_updated'
  | 'debt_updated'
  | 'cash_updated'
  | 'owner_compensation_updated'
  | 'customer_concentration_updated'
  | 'document_verified'
  | 'assessment_completed'
  | 'confidence_changed'
  | 'verification_resolved'
  | 'growth_plan_updated'
  | 'valuation_published'
  | 'business_dna_updated'
  | 'business_profile_updated';

// ── Business State Event ─────────────────────────────────────────────────────
export interface BusinessStateEvent {
  event_id: string;
  event_type: BusinessStateEventType;
  business_id: string;
  fact_key: string;
  previous_value: any;
  new_value: any;
  effective_date: string;
  reporting_period?: string;
  confidence: number;
  verification_status: VerificationStatus;
  evidence_reference?: string;
  source_authority: string;
  reason: string;
  timestamp: string;
}

// ── Consumer ID ──────────────────────────────────────────────────────────────
export type ConsumerId =
  | 'dashboard'
  | 'galileo'
  | 'executive_brief'
  | 'growth_plan'
  | 'reports'
  | 'meeting_prep'
  | 'business_intelligence'
  | 'assessments'
  | 'valuation'
  | 'documents'
  | 'roadmap'
  | 'sprints';

// ── Refresh Mode ──────────────────────────────────────────────────────────────
export type RefreshMode = 'immediate' | 'background' | 'review_required' | 'next_open' | 'blocked';

// ── Consumer Subscription ────────────────────────────────────────────────────
export interface ConsumerSubscription {
  consumer_id: ConsumerId;
  display_name: string;
  fact_keys: string[];
  refresh_mode: RefreshMode;
  priority: number;
  review_required: boolean;
  background_refresh_eligible: boolean;
  refresh_path: string;
  certified_engine: string;
}

// ── Refresh Policy ────────────────────────────────────────────────────────────
export interface RefreshPolicy {
  consumer_id: ConsumerId;
  event_type: BusinessStateEventType;
  refresh_mode: RefreshMode;
  priority: number;
  review_required: boolean;
}

// ── Impact Radius ─────────────────────────────────────────────────────────────
export interface FactImpact {
  fact_key: string;
  dependent_consumers: ConsumerId[];
  propagation_path: string[];
  business_impact: string;
  priority: number;
  refresh_order: number;
}

// ── Propagation Decision ──────────────────────────────────────────────────────
export type PropagationClassification =
  | 'automatic'
  | 'advisor_review'
  | 'verification_required'
  | 'blocked';

export interface PropagationDecision {
  event: BusinessStateEvent;
  consumer_id: ConsumerId;
  classification: PropagationClassification;
  refresh_mode: RefreshMode;
  reason: string;
  blocked_reason?: string;
}

// ── Explainable Synchronization ──────────────────────────────────────────────
export interface ExplainableSyncEntry {
  event_id: string;
  consumer_id: ConsumerId;
  action: string;
  explanation: string;
  classification: PropagationClassification;
  timestamp: string;
}

export interface ExplainableSyncReport {
  event_id: string;
  event_type: BusinessStateEventType;
  fact_key: string;
  business_id: string;
  summary: string;
  entries: ExplainableSyncEntry[];
  timestamp: string;
}

// ── Business Change Timeline ──────────────────────────────────────────────────
export type PropagationStatus = 'pending' | 'propagated' | 'blocked' | 'deferred' | 'shadow_only';

export interface TimelineEntry {
  entry_id: string;
  event_id: string;
  timestamp: string;
  change_description: string;
  business_fact: string;
  evidence_reference?: string;
  affected_systems: ConsumerId[];
  propagation_status: PropagationStatus;
  advisor_review_required: boolean;
  verification_status: string;
  business_impact: string;
}

export interface BusinessChangeTimeline {
  business_id: string;
  entries: TimelineEntry[];
}

// ── Shadow Synchronization ────────────────────────────────────────────────────
export interface ShadowDifference {
  consumer_id: ConsumerId;
  difference_type: 'missed_refresh' | 'unexpected_refresh' | 'timing_variance';
  detail: string;
}

export interface ShadowSyncResult {
  event_id: string;
  expected_refreshes: ConsumerId[];
  actual_refreshes: ConsumerId[];
  missed_consumers: ConsumerId[];
  unexpected_consumers: ConsumerId[];
  propagation_timing_ms: number;
  differences: ShadowDifference[];
}

// ── Observability ─────────────────────────────────────────────────────────────
export interface ConsumerMetrics {
  notified: number;
  refreshed: number;
  blocked: number;
  deferred: number;
  avg_refresh_ms: number;
}

export interface ObservabilityMetrics {
  events_generated: number;
  consumers_notified: number;
  consumers_refreshed: number;
  consumers_blocked: number;
  consumers_deferred: number;
  review_required_events: number;
  propagation_duration_ms: number;
  by_consumer: Record<string, ConsumerMetrics>;
  by_event_type: Record<string, number>;
}

// ── Orchestration Result ──────────────────────────────────────────────────────
export interface OrchestrationResult {
  event: BusinessStateEvent;
  decisions: PropagationDecision[];
  explainable_report: ExplainableSyncReport;
  timeline_entry: TimelineEntry;
  shadow_result: ShadowSyncResult;
  is_shadow_mode: boolean;
}