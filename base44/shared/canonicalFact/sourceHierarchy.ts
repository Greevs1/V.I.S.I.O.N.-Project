/**
 * canonicalFact/sourceHierarchy.ts — Phase 14.2A
 *
 * The 8-level configurable source authority hierarchy. One reusable
 * source-authority resolver. Not scattered through conditionals.
 *
 * Rules:
 *   1. Higher-authority verified source wins over lower-authority source.
 *   2. A lower-authority source must never silently overwrite a higher-authority source.
 *   3. Same-level conflicting sources must produce conflict state.
 *   4. Advisor-approved or locked values must respect existing governance.
 *   5. Published valuation snapshots remain immutable historical evidence, not mutable current facts.
 *   6. Source applicability must consider reporting period and effective date.
 *
 * Reuses:
 *   - types.SOURCE_AUTHORITY (8-level hierarchy)
 *   - intelligenceMapping.ResolverResult (candidate shape)
 *   - intelligenceEngine.confidenceLevel (confidence tier calculation)
 */

import { SOURCE_AUTHORITY, type SourceAuthority } from './types.ts';
import type { ResolverResult } from '../valuationEngine/intelligenceMapping.ts';

// ── Authority rank (lower number = higher authority) ───────────────────────
export function authorityRank(authority: SourceAuthority): number {
  return SOURCE_AUTHORITY[authority] ?? 99;
}

// ── Check if a source is verified (advisor-confirmed) ───────────────────────
export function isVerifiedSource(result: ResolverResult): boolean {
  // Verified sources: advisor_entry with verification, reviewed financials, verified tax return
  return (
    result.source_type === 'advisor_entry' ||
    result.source_type === 'financial_normalization' ||
    result.source_type === 'client_confirmation'
  ) && result.confidence >= 85;
}

// ── Check if a source is a published snapshot (immutable historical) ───────
export function isPublishedSnapshot(result: ResolverResult): boolean {
  return result.source_type === 'prior_published_version';
}

// ── Source Applicability Check ─────────────────────────────────────────────
// Considers reporting period and effective date. Does NOT assume newest = best.
export function isSourceApplicable(
  result: ResolverResult,
  requestedPeriod?: string,
  asOfDate?: string,
): boolean {
  // Published snapshots are historical evidence — only applicable for historical queries
  if (isPublishedSnapshot(result)) {
    if (!asOfDate) return false; // Not applicable for "current" queries
    return true;
  }

  // Check reporting period match if requested
  if (requestedPeriod && result.reporting_period) {
    // Exact match or compatible (e.g., "FY2024" matches "2024")
    const normalized1 = requestedPeriod.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalized2 = result.reporting_period.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalized1 !== normalized2 && !normalized1.includes(normalized2) && !normalized2.includes(normalized1)) {
      return false;
    }
  }

  // Check as-of date: source must be on or before the as-of date
  if (asOfDate && result.source_date) {
    const sourceDate = new Date(result.source_date);
    const cutoff = new Date(asOfDate);
    if (sourceDate > cutoff) return false;
  }

  return true;
}

// ── Source Selection Algorithm ─────────────────────────────────────────────
// Selects the authoritative candidate from a list of results.
// Returns null if no authoritative candidate can be selected (conflict or missing).
export interface SourceSelectionResult {
  selected: ResolverResult | null;
  reason: string;
  is_conflict: boolean;
  is_missing: boolean;
}

export function selectAuthoritativeCandidate(
  results: ResolverResult[],
  opts: {
    requestedPeriod?: string;
    asOfDate?: string;
    materialityThreshold?: number;
    advisorApprovedValue?: ResolverResult | null;
  } = {},
): SourceSelectionResult {
  const { requestedPeriod, asOfDate, materialityThreshold = 0.05, advisorApprovedValue } = opts;

  // Rule 4: Advisor-approved values take precedence (governance lock)
  if (advisorApprovedValue) {
    return {
      selected: advisorApprovedValue,
      reason: 'advisor_approved_governance_lock',
      is_conflict: false,
      is_missing: false,
    };
  }

  // Filter by applicability (reporting period + as-of date)
  const applicable = results.filter((r) => isSourceApplicable(r, requestedPeriod, asOfDate));

  if (applicable.length === 0) {
    return { selected: null, reason: 'no_applicable_sources', is_conflict: false, is_missing: true };
  }

  if (applicable.length === 1) {
    return { selected: applicable[0], reason: 'single_applicable_source', is_conflict: false, is_missing: false };
  }

  // Sort by authority rank (lower = higher authority), then by confidence
  const sorted = [...applicable].sort((a, b) => {
    const rankA = sourceTypeToAuthority(a.source_type);
    const rankB = sourceTypeToAuthority(b.source_type);
    if (rankA !== rankB) return rankA - rankB;
    return b.confidence - a.confidence;
  });

  // Check for conflict among top-authority sources
  const topAuthority = sourceTypeToAuthority(sorted[0].source_type);
  const sameAuthority = sorted.filter((r) => sourceTypeToAuthority(r.source_type) === topAuthority);

  if (sameAuthority.length > 1) {
    // Check materiality
    const conflicts = detectMaterialConflicts(sameAuthority, materialityThreshold);
    if (conflicts.length > 0) {
      return {
        selected: null,
        reason: `material_conflict_between_${conflicts.length}_sources`,
        is_conflict: true,
        is_missing: false,
      };
    }
  }

  // Select the top candidate
  return {
    selected: sorted[0],
    reason: `selected_highest_authority_${sorted[0].source_type}`,
    is_conflict: false,
    is_missing: false,
  };
}

// ── Map source_type to authority rank ──────────────────────────────────────
function sourceTypeToAuthority(sourceType: string): number {
  const map: Record<string, SourceAuthority> = {
    verified_tax_return: 'verified_tax_return',
    reviewed_financials: 'reviewed_financials',
    financial_normalization: 'reviewed_financials',
    advisor_entry: 'advisor_entry_verified',
    business_record: 'advisor_entry_verified',
    uploaded_financials: 'uploaded_financials',
    extracted_field: 'extracted_field',
    document: 'uploaded_financials',
    assessment_answer: 'assessment_answer',
    assessment_calculation: 'assessment_answer',
    dashboard_metric: 'system_derived',
    profile_record: 'owner_estimate',
    prior_valuation_answer: 'advisor_entry_unverified',
    prior_published_version: 'prior_published_version',
    client_confirmation: 'advisor_entry_verified',
    system_derived: 'system_derived',
    benchmark: 'benchmark',
  };
  return authorityRank(map[sourceType] || 'owner_estimate');
}

// ── Conflict Detection (reuses intelligenceEngine.detectConflicts logic) ────
function detectMaterialConflicts(
  results: ResolverResult[],
  threshold: number,
): { a: ResolverResult; b: ResolverResult; pct: number }[] {
  const conflicts: { a: ResolverResult; b: ResolverResult; pct: number }[] = [];
  for (let i = 0; i < results.length; i++) {
    for (let j = i + 1; j < results.length; j++) {
      const a = results[i];
      const b = results[j];
      const numA = Number(a.value);
      const numB = Number(b.value);
      if (isNaN(numA) || isNaN(numB)) continue;
      const diff = Math.abs(numA - numB);
      const base = Math.max(Math.abs(numA), Math.abs(numB), 1);
      const pct = (diff / base) * 100;
      if (pct > threshold * 100) {
        conflicts.push({ a, b, pct: Math.round(pct * 10) / 10 });
      }
    }
  }
  return conflicts;
}