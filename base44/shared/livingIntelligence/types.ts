/**
 * livingIntelligence/types.ts — Phase 15.0
 *
 * Type definitions for the Living Intelligence Foundation.
 *
 * Living Intelligence NEVER owns business truth.
 * Living Intelligence NEVER performs calculations.
 * Living Intelligence ONLY observes, synthesizes, explains, prioritizes,
 * predicts, and coordinates executive understanding.
 *
 * Everything reuses existing certified engines.
 *
 * Constitution Compliance: Articles I-XIII (no duplication, no bypass, no governance violation)
 */

// ── Trust Hierarchy ──────────────────────────────────────────────────────────
// Confidence flows in this order. Living Intelligence must never present
// synthesized insight as if it were verified business truth.
export enum ConfidenceSource {
  VERIFIED_CANONICAL_FACT = 'verified_canonical_fact',
  CERTIFIED_DERIVED_FACT = 'certified_derived_fact',
  CERTIFIED_ENGINE_OUTPUT = 'certified_engine_output',
  ADVISOR_REVIEWED_CONCLUSION = 'advisor_reviewed_conclusion',
  BUSINESS_INTELLIGENCE_SYNTHESIS = 'business_intelligence_synthesis',
  EXECUTIVE_NARRATIVE = 'executive_narrative',
  PREDICTIVE_REASONING = 'predictive_reasoning',
  // SPECULATION is NOT ALLOWED — Living Intelligence never speculates
}

// ── Executive Context ────────────────────────────────────────────────────────
// One reusable object that continuously maintains executive understanding.
// Everything is metadata. No duplicate calculations. No duplicate intelligence.
export interface ExecutiveContext {
  business_id: string;
  profile_id: string;
  generated_at: string;

  // Current Business State (read from BIS — NOT recalculated)
  current_business_state: CurrentBusinessState;

  // Business Momentum (descriptive, not a score)
  business_momentum: BusinessMomentum;

  // Top Opportunities (read from Growth Plan + BIE — NOT recalculated)
  top_opportunities: ExecutiveItem[];

  // Top Risks (read from BIE + Verification Queue — NOT recalculated)
  top_risks: ExecutiveItem[];

  // Advisor Attention Items (read from Verification Queue + Field Governance)
  advisor_attention_items: AttentionItem[];

  // Owner Attention Items (read from Sprint + NBA — NOT recalculated)
  owner_attention_items: AttentionItem[];

  // Business Confidence (read from Confidence Engine — NOT recalculated)
  business_confidence: BusinessConfidence;

  // Recently Changed Facts (read from CBSS + Timeline — NOT recalculated)
  recently_changed_facts: WhatChangedItem[];

  // Pending Advisor Reviews (read from Verification Queue + Field Governance)
  pending_advisor_reviews: PendingReview[];

  // Upcoming Deadlines (read from Sprint + Calendar + Agreements)
  upcoming_deadlines: UpcomingDeadline[];

  // Business Narrative (read from Executive Narrative Engine — NOT regenerated)
  business_narrative: BusinessNarrative;

  // Metadata
  _meta: ExecutiveContextMeta;
}

export interface CurrentBusinessState {
  // All values READ from BIS — never recalculated by Living Intelligence
  iq_score: number | null;
  business_impact_score: number | null;
  revenue: number | null;
  normalized_ebitda: number | null;
  enterprise_value: number | null;
  profit_gap_amount: number | null;
  value_gap_amount: number | null;
  tax_gap_annual: number | null;
  operations_score: number | null;
  freedom_score: number | null;
  // Source: BIE
  source: 'business_intelligence_engine';
}

export interface BusinessMomentum {
  // Momentum is DESCRIPTIVE — not a score, not a calculation
  // It summarizes direction, consistency, acceleration, execution, confidence
  direction: MomentumDirection;
  consistency: MomentumConsistency;
  acceleration: MomentumAcceleration;
  execution: MomentumExecution;
  confidence: MomentumConfidence;
  // Human-readable summary (synthesized from observations, not calculated)
  summary: string;
  // Supporting observations (from timeline, sprint progress, BIE changes)
  observations: MomentumObservation[];
}

export type MomentumDirection = 'improving' | 'stable' | 'declining' | 'mixed' | 'unknown';
export type MomentumConsistency = 'consistent' | 'variable' | 'emerging' | 'unknown';
export type MomentumAcceleration = 'accelerating' | 'steady' | 'decelerating' | 'unknown';
export type MomentumExecution = 'on_track' | 'at_risk' | 'behind' | 'not_started' | 'unknown';
export type MomentumConfidence = 'high' | 'medium' | 'low' | 'unknown';

export interface MomentumObservation {
  dimension: string;
  observation: string;
  source: ConfidenceSource;
}

// ── Executive Item (Opportunities & Risks) ────────────────────────────────────
export interface ExecutiveItem {
  id: string;
  headline: string;
  why_it_matters: string;
  business_impact: string;
  confidence: number; // 0-100
  confidence_source: ConfidenceSource;
  recommended_action: string;
  supporting_evidence: EvidenceReference[];
  certified_owner: string; // Which certified engine owns this
  priority: number; // 1 (highest) - 10 (lowest)
}

export interface EvidenceReference {
  source_name: string;
  source_type: 'canonical_fact' | 'derived_fact' | 'engine_output' | 'advisor_review' | 'assessment' | 'document';
  source_id: string;
  confidence: number;
}

// ── Attention Items ───────────────────────────────────────────────────────────
export interface AttentionItem {
  id: string;
  title: string;
  description: string;
  attention_type: 'advisor' | 'owner';
  urgency: 'immediate' | 'soon' | 'routine';
  certified_owner: string;
  action_url: string | null;
}

// ── Business Confidence ──────────────────────────────────────────────────────
export interface BusinessConfidence {
  overall_confidence: number | null; // 0-100, READ from Confidence Engine
  data_confidence: number | null;
  calculation_confidence: number | null;
  methodology_confidence: number | null;
  advisor_confidence: number | null;
  source: 'confidence_engine';
  summary: string;
}

// ── What Changed ──────────────────────────────────────────────────────────────
export interface WhatChangedItem {
  id: string;
  what_changed: string;
  why_it_changed: string;
  what_caused_it: string;
  what_depends_on_it: string[];
  what_should_happen_next: string;
  who_should_care: 'advisor' | 'owner' | 'both';
  can_it_wait: 'immediate' | 'soon' | 'routine';
  confidence_source: ConfidenceSource;
  timestamp: string;
  // Source references (to CBSS events, timeline, canonical facts)
  source_event_id: string | null;
  source_timeline_id: string | null;
  certified_owner: string;
}

// ── What Matters Now ──────────────────────────────────────────────────────────
export interface WhatMattersNowItem {
  id: string;
  title: string;
  description: string;
  category: WhatMattersCategory;
  priority: number; // 1 (highest) - 10 (lowest)
  confidence_source: ConfidenceSource;
  certified_owner: string;
  recommended_action: string;
  action_url: string | null;
}

export type WhatMattersCategory =
  | 'opportunity'
  | 'risk'
  | 'advisor_task'
  | 'owner_task'
  | 'upcoming_event'
  | 'business_change'
  | 'verification_item'
  | 'growth_opportunity';

// ── Executive Presence ────────────────────────────────────────────────────────
// If the owner logged in right now, what should V.I.S.I.O.N. proactively tell them?
// Maximum: Three executive items.
export interface ExecutivePresenceItem {
  id: string;
  headline: string;
  why_it_matters: string;
  business_impact: string;
  confidence: number; // 0-100
  confidence_source: ConfidenceSource;
  recommended_action: string;
  supporting_evidence: EvidenceReference[];
  certified_owner: string; // Which certified engine owns the underlying data
}

export interface ExecutivePresence {
  business_id: string;
  profile_id: string;
  generated_at: string;
  // Maximum 3 items — clarity over completeness
  items: ExecutivePresenceItem[];
  // The golden question: "If I only had five minutes with this business today,
  // what should I know?"
  five_minute_summary: string;
  _meta: {
    sources_used: string[];
    constitution_compliant: true;
    no_calculations_performed: true;
    no_duplicate_intelligence: true;
  };
}

// ── Pending Reviews ───────────────────────────────────────────────────────────
export interface PendingReview {
  id: string;
  review_type: 'conflict' | 'low_confidence' | 'missing_evidence' | 'field_change_request';
  title: string;
  description: string;
  certified_owner: string; // Verification Queue or Field Governance
  submitted_at: string;
  urgency: 'immediate' | 'soon' | 'routine';
}

// ── Upcoming Deadlines ────────────────────────────────────────────────────────
export interface UpcomingDeadline {
  id: string;
  title: string;
  deadline_type: 'sprint_task' | 'agreement' | 'booking' | 'assessment' | 'valuation';
  due_date: string;
  certified_owner: string;
  action_url: string | null;
}

// ── Business Narrative ───────────────────────────────────────────────────────
export interface BusinessNarrative {
  // READ from Executive Narrative Engine — NOT regenerated by Living Intelligence
  summary: string;
  source: 'executive_narrative_engine';
  last_generated_at: string | null;
}

// ── Executive Context Metadata ───────────────────────────────────────────────
export interface ExecutiveContextMeta {
  sources_used: string[]; // List of certified engines consulted
  constitution_compliant: true;
  no_calculations_performed: true;
  no_duplicate_intelligence: true;
  no_canonical_facts_duplicated: true;
  no_sync_bypassed: true;
  no_governance_bypassed: true;
}

// ── Living Intelligence Input ─────────────────────────────────────────────────
// The coordinator receives this input (all from certified engines) and synthesizes.
export interface LivingIntelligenceInput {
  business_id: string;
  profile_id: string;

  // From BIE (read-only, NOT recalculated)
  bis: any | null;

  // From Canonical Fact Resolver (read-only)
  canonical_facts: any | null;

  // From CBSS / Timeline (read-only)
  recent_events: any[];
  timeline: any[];

  // From Growth Plan Engine (read-only)
  growth_initiatives: any[];

  // From Valuation metadata (read-only)
  valuation_metadata: any | null;

  // From Verification Queue (read-only)
  pending_reviews: any[];

  // From Sprint (read-only)
  sprint_data: any | null;
  upcoming_deadlines: any[];

  // From Confidence Engine (read-only)
  confidence_scores: any | null;

  // From Executive Narrative Engine (read-only)
  executive_brief: any | null;

  // From Assessment results (read-only)
  assessment_results: any[];

  // From Advisor review state (read-only)
  advisor_review_state: any | null;
}

// ── Business Memory Contract (Framework Only — No Implementation) ────────────
export interface BusinessMemoryContract {
  // What should be remembered
  memory_categories: MemoryCategory[];
  // Relationship to Timeline
  timeline_relationship: string;
  // Relationship to Canonical Facts
  canonical_facts_relationship: string;
  // Relationship to Galileo
  galileo_relationship: string;
  // Relationship to Advisors
  advisor_relationship: string;
  // Retention philosophy
  retention_philosophy: RetentionPhilosophy;
  // Extension points
  extension_points: string[];
  // Implementation status
  implemented: false;
}

export interface MemoryCategory {
  name: string;
  description: string;
  what_to_remember: string;
  retention_duration: string;
  relationship_to_timeline: string;
  relationship_to_canonical_facts: string;
}

export interface RetentionPhilosophy {
  principle: string;
  rules: string[];
  decay_model: string;
}

// ── Extension Points (Future Compatibility) ──────────────────────────────────
export interface LivingIntelligenceExtensionPoints {
  business_memory: string;
  business_dna: string;
  business_twin: string;
  predictive_simulation: string;
  advisor_co_pilot: string;
  meeting_intelligence: string;
  continuous_executive_brief: string;
  autonomous_planning: string;
}