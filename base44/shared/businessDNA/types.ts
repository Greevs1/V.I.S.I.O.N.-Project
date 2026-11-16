/**
 * businessDNA/types.ts — Phase E
 *
 * Business DNA Foundation — Type Definitions.
 *
 * Business DNA is DERIVED INTELLIGENCE describing durable patterns observed
 * across certified business evidence. It is NEVER authoritative source truth.
 *
 * Business DNA is NOT:
 *   - raw facts or current metrics (Shared Contract owns those)
 *   - an assessment or score (Assessment Engine owns those)
 *   - Business Memory (memory stores confirmed context; DNA derives patterns)
 *   - Timeline (timeline records events; DNA synthesizes patterns across events)
 *   - Decision Intelligence (decisions frame choices; DNA synthesizes across decisions)
 *   - Valuation (valuation calculates value; DNA describes value sensitivity)
 *   - Business Twin (simulation/prediction — reserved for future)
 *
 * Constitution Compliance:
 *   Article I — One Truth (DNA references evidence, never duplicates)
 *   Article II — Single Ownership (DNA owns "derived pattern intelligence")
 *   Article III — No Duplicate Intelligence (synthesizes, never recalculates)
 *   Article XVII — Business DNA Authority (derived, never authoritative)
 *   Article XI — Business Isolation (patterns are business-scoped)
 */

// ── Six DNA Families ───────────────────────────────────────────────────────────
export type DNAFamily =
  | 'economic'
  | 'value'
  | 'operating'
  | 'decision'
  | 'owner'
  | 'risk_resilience';

export const DNA_FAMILIES: DNAFamily[] = [
  'economic', 'value', 'operating', 'decision', 'owner', 'risk_resilience',
];

// ── Pattern Status (Governed Lifecycle) ───────────────────────────────────────
export type PatternStatus =
  | 'candidate'
  | 'emerging'
  | 'established'
  | 'contested'
  | 'weakening'
  | 'superseded'
  | 'retired';

export const PATTERN_STATUSES: PatternStatus[] = [
  'candidate', 'emerging', 'established', 'contested', 'weakening', 'superseded', 'retired',
];

// ── Pattern Strength (how strongly pattern affects business) ──────────────────
export type PatternStrength = 'low' | 'moderate' | 'high' | 'very_high';

// ── Pattern Confidence (how certain we are the pattern is real) ────────────────
export type PatternConfidence = 'low' | 'moderate' | 'high' | 'very_high';

// ── Freshness State ────────────────────────────────────────────────────────────
export type FreshnessState = 'current' | 'aging' | 'stale' | 'historical';

// ── Direction ──────────────────────────────────────────────────────────────────
export type PatternDirection = 'improving' | 'declining' | 'stable' | 'unknown';

// ── Client Visibility ──────────────────────────────────────────────────────────
export type PatternVisibility = 'advisor_internal' | 'client_safe';

// ── Evidence Domains (which certified system contributed) ──────────────────────
export type EvidenceDomain =
  | 'shared_contract'
  | 'assessment'
  | 'document'
  | 'business_memory'
  | 'timeline'
  | 'decision'
  | 'decision_outcome'
  | 'valuation'
  | 'growth_plan'
  | 'sprint'
  | 'roadmap'
  | 'meeting'
  | 'verification'
  | 'value_creation_event'
  | 'advisor_confirmation';

// ── DNA Evidence Reference (references evidence, never copies it) ─────────────
export interface DNAEvidenceRef {
  evidence_id: string;
  source_domain: EvidenceDomain;
  source_name: string;
  source_reference: string;
  summary: string;
  observed_at: string;
  /**
   * The underlying source root for lineage deduplication.
   * Multiple systems rendering the same fact share a lineage root.
   * Example: 'assessment_calculations:tax_gap' — regardless of whether
   * it appears in Dashboard, Executive Brief, Galileo, or BIS.
   */
  lineage_root: string;
  client_visible: boolean;
  advisor_confirmed: boolean;
}

// ── Pattern Implication ────────────────────────────────────────────────────────
export interface PatternImplication {
  domain: 'value' | 'operations' | 'freedom' | 'risk' | 'growth' | 'tax';
  description: string;
  references_existing_concept: string;
}

// ── DNA Question (unanswered question routed to existing systems) ─────────────
export interface DNAQuestion {
  question_id: string;
  question: string;
  why_it_matters: string;
  route_to: 'verification_queue' | 'advisor' | 'document_request' | 'assessment' | 'meeting' | 'galileo';
}

// ── Business DNA Pattern (the full record) ────────────────────────────────────
export interface BusinessDNAPattern {
  pattern_id: string;
  business_id: string;

  family: DNAFamily;
  pattern_key: string;
  title: string;
  statement: string;
  pattern_type: string;

  status: PatternStatus;
  strength: PatternStrength;
  confidence: PatternConfidence;

  evidence_refs: DNAEvidenceRef[];
  evidence_count: number;
  independent_source_count: number;

  first_observed_at: string;
  last_observed_at: string;
  freshness: FreshnessState;
  direction: PatternDirection;
  trend: string;

  supporting_facts: string[];
  contradicting_facts: string[];

  source_domains: EvidenceDomain[];
  client_visibility: PatternVisibility;

  advisor_confirmed: boolean;
  advisor_contested: boolean;
  advisor_confirmed_by: string | null;
  advisor_confirmed_at: string | null;

  implications: PatternImplication[];
  related_pattern_ids: string[];
  dna_questions: DNAQuestion[];

  supersedes_pattern_id: string | null;
  superseded_by_pattern_id: string | null;

  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ── Business DNA (full composition for a business) ────────────────────────────
export interface BusinessDNA {
  business_id: string;
  patterns: BusinessDNAPattern[];
  evidence_summary: {
    total_evidence_refs: number;
    independent_lineages: number;
    by_domain: Record<string, number>;
  };
  families_summary: Record<DNAFamily, {
    pattern_count: number;
    established_count: number;
    emerging_count: number;
    candidate_count: number;
  }>;
  generated_at: string;
  _meta: BusinessDNAMeta;
}

export interface BusinessDNAMeta {
  sources_used: string[];
  contract_consumed: boolean;
  no_calculations_performed: true;
  no_duplicate_intelligence: true;
  no_authoritative_recalculation: true;
  generated_at: string;
}

// ── AI Candidate Pattern (proposed by AI, qualified by deterministic rules) ──
export interface AICandidatePattern {
  family: DNAFamily;
  pattern_key: string;
  title: string;
  statement: string;
  pattern_type: string;
  strength: PatternStrength;
  evidence_refs: string[];
  supporting_facts: string[];
  contradicting_facts: string[];
  implications: PatternImplication[];
  dna_questions: Omit<DNAQuestion, 'question_id'>[];
  direction: PatternDirection;
  client_visibility: PatternVisibility;
}

export interface AIContradiction {
  new_pattern_key: string;
  existing_pattern_id: string;
  explanation: string;
}

export interface AICandidateResponse {
  candidate_patterns: AICandidatePattern[];
  contradictions: AIContradiction[];
  summary: string;
}

// ── Pattern Evolution (THEN / NOW / DIRECTION) ────────────────────────────────
export interface PatternEvolution {
  pattern_id: string;
  title: string;
  family: DNAFamily;
  then_status: PatternStatus;
  now_status: PatternStatus;
  then_strength: PatternStrength;
  now_strength: PatternStrength;
  direction: PatternDirection;
  evidence_summary: string;
  first_observed_at: string;
  last_observed_at: string;
}

// ── Client-Safe Pattern ───────────────────────────────────────────────────────
export interface ClientSafePattern {
  pattern_id: string;
  family: DNAFamily;
  title: string;
  statement: string;
  pattern_type: string;
  status: PatternStatus;
  strength: PatternStrength;
  confidence: PatternConfidence;
  direction: PatternDirection;
  implications: PatternImplication[];
  dna_questions: DNAQuestion[];
  first_observed_at: string;
  last_observed_at: string;
  evidence_count: number;
  independent_source_count: number;
  _meta: {
    client_safe: true;
    excluded_internal_items: string[];
  };
}

// ── Contradiction Detection Result ────────────────────────────────────────────
export interface ContradictionResult {
  has_contradiction: boolean;
  existing_pattern_id: string | null;
  new_pattern_key: string;
  explanation: string;
  recommended_action: 'mark_weakening' | 'mark_contested' | 'create_candidate' | 'none';
}