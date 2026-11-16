/**
 * canonicalFact/types.ts — Phase 14.2A
 *
 * The Canonical Fact Contract — the normalized response model for the
 * Canonical Business Intelligence Layer (CBIL) READ layer.
 *
 * This is NOT a persisted record. It is a normalized response returned by
 * the canonical fact resolver. All data stays in its existing certified
 * source tables. The resolver reads, normalizes, and returns.
 *
 * Reuses:
 *   - intelligenceMapping.SourceType (16 source types, allowlisted)
 *   - intelligenceMapping.ResolverResult (candidate shape)
 *   - intelligenceEngine.ConfidenceLevel (verified/high/medium/low/missing/conflicting)
 */

import type { SourceType } from '../valuationEngine/intelligenceMapping.ts';

// ── Source Authority Hierarchy (8 levels, configurable per fact) ───────────
export const SOURCE_AUTHORITY = {
  verified_tax_return: 1,        // Highest — government-filed, advisor-verified
  reviewed_financials: 2,         // CPA-reviewed, advisor-confirmed
  advisor_entry_verified: 3,      // Advisor-entered and verified
  uploaded_financials: 4,         // Uploaded but not yet reviewed
  extracted_field: 5,             // AI-extracted, pending review
  assessment_answer: 6,           // Owner-provided in assessment
  advisor_entry_unverified: 7,    // Advisor-typed, not yet verified
  owner_estimate: 8,              // Lowest — unverified owner estimate
  system_derived: 9,              // Special — calculation, not a source
  benchmark: 10,                  // Special — industry benchmark
  prior_published_version: 11,    // Historical — immutable evidence, not current
} as const;

export type SourceAuthority = keyof typeof SOURCE_AUTHORITY;

// ── Resolution Status ───────────────────────────────────────────────────────
export type ResolutionStatus =
  | 'resolved'           // Authoritative value selected
  | 'conflict'           // Material conflict between sources
  | 'missing'            // No candidates available
  | 'needs_review'       // Candidates exist but below confidence threshold
  | 'stale';             // Selected candidate is stale (>18 months)

// ── Verification Status ─────────────────────────────────────────────────────
export type VerificationStatus =
  | 'verified'           // Advisor-approved
  | 'suggested'          // AI populated, high confidence (≥85)
  | 'needs_review'       // AI populated, medium confidence (65-84)
  | 'missing'            // No source
  | 'conflicting';       // Conflict between sources

// ── Conflict Status ────────────────────────────────────────────────────────
export type ConflictStatus = 'none' | 'minor' | 'material';

// ── Visibility Scope ────────────────────────────────────────────────────────
export type VisibilityScope = 'internal' | 'client_safe';

// ── Value Type ──────────────────────────────────────────────────────────────
export type ValueType = 'currency' | 'percentage' | 'number' | 'text' | 'boolean' | 'date' | 'single_select';

// ── Reporting Period ────────────────────────────────────────────────────────
export type ReportingPeriodType =
  | 'fiscal_year'
  | 'calendar_year'
  | 'ttm'
  | 'ytd'
  | 'quarter'
  | 'month'
  | 'point_in_time'
  | 'valuation_date';

export interface ReportingPeriod {
  type: ReportingPeriodType;
  label: string;          // "FY2024", "TTM", "Q3-2024", "As of 2024-08-07"
  start_date?: string;
  end_date?: string;
  fiscal_year?: number;
}

// ── Evidence ────────────────────────────────────────────────────────────────
export interface FactEvidence {
  type: 'document' | 'assessment' | 'calculation' | 'advisor' | 'client' | 'benchmark' | 'derived';
  source_name: string;
  source_id: string;
  source_date: string;
  value: any;
  confidence: number;
  verified: boolean;
  reporting_period?: string;
}

// ── Lineage Node ────────────────────────────────────────────────────────────
export interface LineageNode {
  step: number;
  fact_key: string;            // Which canonical fact this step derives from
  operation: string;            // "direct" | "sum" | "subtract" | "multiply" | "lookup" | "reconcile"
  description: string;          // "Add-backs added to net income"
  source_id?: string;
  source_name?: string;
}

// ── Alternative Candidate ──────────────────────────────────────────────────
export interface AlternativeCandidate {
  source_name: string;
  source_type: SourceType;
  source_authority: number;
  value: any;
  confidence: number;
  reporting_period?: string;
  source_date?: string;
  verification_status: VerificationStatus;
}

// ── The Canonical Fact (15+ attribute contract) ────────────────────────────
export interface CanonicalFact {
  // ── Identity ──
  fact_key: string;
  display_name: string;
  category: string;
  business_id: string;

  // ── Value ──
  value: any;
  formatted_value: string;
  value_type: ValueType;
  unit?: string;

  // ── Source ──
  source_type: SourceType;
  source_id: string;
  source_name: string;
  source_authority: number;
  source_date?: string;

  // ── Reporting ──
  reporting_period?: ReportingPeriod;
  effective_date?: string;

  // ── Confidence & Verification ──
  confidence_score: number;          // 0-100
  confidence_level: 'verified' | 'high' | 'medium' | 'low' | 'missing' | 'conflicting';
  verification_status: VerificationStatus;
  conflict_status: ConflictStatus;
  advisor_approved: boolean;
  client_confirmed: boolean;

  // ── Audit ──
  updated_at: string;
  updated_by?: string;

  // ── Evidence & Lineage ──
  evidence: FactEvidence[];
  lineage: LineageNode[];
  alternative_candidates: AlternativeCandidate[];

  // ── Resolution Metadata ──
  resolution_status: ResolutionStatus;
  is_stale: boolean;
  is_derived: boolean;

  // ── Visibility ──
  consumer_safe: boolean;

  // ── Diagnostics (internal only, stripped for client_safe) ──
  diagnostics?: {
    candidate_count: number;
    selected_source: string;
    resolution_duration_ms: number;
    conflict_detected: boolean;
    fallback_used: boolean;
  };
}

// ── Conflict Object (returned when resolution_status = 'conflict') ──────────
export interface FactConflict {
  fact_key: string;
  display_name: string;
  candidates: AlternativeCandidate[];
  materiality_threshold: number;
  max_variance_percentage: number;
  recommended_verification_path: string;
  recommended_source?: string;
  reason: string;
}

// ── Resolver Input ──────────────────────────────────────────────────────────
export interface ResolveFactInput {
  businessId: string;
  factKey: string;
  asOfDate?: string;           // Point-in-time resolution
  reportingPeriod?: ReportingPeriod;
  visibilityScope?: VisibilityScope;
}

export interface ResolveFactsInput {
  businessId: string;
  factKeys: string[];
  asOfDate?: string;
  reportingPeriod?: ReportingPeriod;
  visibilityScope?: VisibilityScope;
}

// ── Resolver Output ─────────────────────────────────────────────────────────
export interface ResolveFactResult {
  fact: CanonicalFact | null;
  conflict: FactConflict | null;
  error?: string;
}

export interface ResolveFactsResult {
  facts: CanonicalFact[];
  conflicts: FactConflict[];
  missing: string[];
  errors: Record<string, string>;
}

// ── Shadow Comparison ───────────────────────────────────────────────────────
export type DiscrepancyType =
  | 'match'
  | 'expected_difference'
  | 'period_difference'
  | 'source_authority_difference'
  | 'conflict'
  | 'current_consumer_bug'
  | 'canonical_resolver_bug'
  | 'unknown';

export interface ShadowDiscrepancy {
  fact_key: string;
  consumer: string;
  consumer_value: any;
  canonical_value: any;
  discrepancy_type: DiscrepancyType;
  explanation: string;
}