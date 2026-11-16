/**
 * canonicalFact/resolver.ts — Phase 14.2A
 *
 * The Canonical Fact Resolver — one server-safe resolver that answers:
 * "What is the current authoritative value of this business fact?"
 *
 * resolveCanonicalFact({ businessId, factKey, asOfDate?, reportingPeriod?, visibilityScope? })
 * resolveCanonicalFacts({ businessId, factKeys, asOfDate?, reportingPeriod?, visibilityScope? })
 *
 * Resolution steps:
 *   1. Validate business scope (reuses valuationAuth.requireBusinessAccess)
 *   2. Load candidate sources (reuses intelligenceMapping resolvers)
 *   3. Normalize candidate values
 *   4. Apply reporting-period relevance (reuses reportingPeriod module)
 *   5. Apply source authority (reuses sourceHierarchy module)
 *   6. Apply verification state
 *   7. Apply advisor locks / governance (reuses fieldGovernanceService)
 *   8. Detect conflicts (reuses intelligenceEngine.detectConflicts)
 *   9. Select authoritative candidate when defensible
 *   10. Return lineage (reuses lineage module)
 *   11. Return alternatives where relevant
 *   12. Return explicit missing/conflict state when no authoritative answer exists
 *
 * NO WRITES. NO PROPAGATION. NO AUTOMATIC APPROVALS.
 *
 * Reuses:
 *   - valuationAuth.resolveAuthCtx, requireBusinessAccess
 *   - intelligenceMapping resolvers (fromExtractedField, fromDashboardMetric, etc.)
 *   - intelligenceEngine.buildCandidate, confidenceLevel, detectConflicts
 *   - sourceHierarchy.selectAuthoritativeCandidate
 *   - reportingPeriod.isPeriodCompatible
 *   - lineage.buildLineage, buildEvidence
 *   - clientSafe.applyClientSafeFilter
 */

import type { AuthCtx } from '../valuationEngine/valuationAuth.ts';
import {
  type ResolverResult,
  type IntelligenceContext,
} from '../valuationEngine/intelligenceMapping.ts';
import { confidenceLevel } from '../valuationEngine/intelligenceEngine.ts';
import { getFactDefinition, FACT_REGISTRY, PILOT_FACT_KEYS } from './registry.ts';
import type {
  CanonicalFact,
  FactConflict,
  ResolveFactInput,
  ResolveFactResult,
  ResolveFactsInput,
  ResolveFactsResult,
  AlternativeCandidate,
  VerificationStatus,
  VisibilityScope,
} from './types.ts';
import { selectAuthoritativeCandidate } from './sourceHierarchy.ts';
import { isPeriodCompatible, getCurrentPeriod } from './reportingPeriod.ts';
import { buildLineage, buildEvidence } from './lineage.ts';
import { applyClientSafeFilter, applyClientSafeFilterConflict, determineVisibilityScope } from './clientSafe.ts';

// ── Format value for display ────────────────────────────────────────────────
function formatValue(value: any, valueType: string): string {
  if (value == null || value === '') return '';
  if (valueType === 'currency') {
    const n = Number(value);
    if (!isNaN(n)) return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
    return String(value);
  }
  if (valueType === 'percentage') {
    const n = Number(value);
    if (!isNaN(n)) return `${n}%`;
    return String(value);
  }
  if (valueType === 'number') return String(value);
  return String(value);
}

// ── Map confidence level to verification status ─────────────────────────────
function confidenceToVerificationStatus(
  level: string,
  advisorApproved: boolean,
  conflictStatus: string,
): VerificationStatus {
  if (conflictStatus === 'material') return 'conflicting';
  if (advisorApproved) return 'verified';
  if (level === 'high') return 'suggested';
  if (level === 'medium' || level === 'low') return 'needs_review';
  return 'missing';
}

// ── Check staleness (source date > 18 months) ────────────────────────────────
function isStale(sourceDate?: string): boolean {
  if (!sourceDate) return false;
  const d = new Date(sourceDate);
  if (isNaN(d.getTime())) return false;
  const months = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30);
  return months > 18;
}

// ── Build alternative candidates from non-selected results ──────────────────
function buildAlternatives(results: ResolverResult[], selected: ResolverResult | null): AlternativeCandidate[] {
  return results
    .filter((r) => r !== selected)
    .map((r) => ({
      source_name: r.source_name,
      source_type: r.source_type,
      source_authority: 0, // Filled by sourceHierarchy if needed
      value: r.value,
      confidence: r.confidence,
      reporting_period: r.reporting_period,
      source_date: r.source_date,
      verification_status: r.confidence >= 85 ? 'verified' as VerificationStatus : r.confidence >= 65 ? 'suggested' as VerificationStatus : 'needs_review' as VerificationStatus,
    }));
}

// ── Build a conflict object ─────────────────────────────────────────────────
function buildConflict(
  factKey: string,
  displayName: string,
  results: ResolverResult[],
  materialityThreshold: number,
): FactConflict {
  const candidates: AlternativeCandidate[] = results.map((r) => ({
    source_name: r.source_name,
    source_type: r.source_type,
    source_authority: 0,
    value: r.value,
    confidence: r.confidence,
    reporting_period: r.reporting_period,
    source_date: r.source_date,
    verification_status: r.confidence >= 85 ? 'verified' as VerificationStatus : 'needs_review' as VerificationStatus,
  }));

  // Calculate max variance
  let maxVariance = 0;
  for (let i = 0; i < results.length; i++) {
    for (let j = i + 1; j < results.length; j++) {
      const a = Number(results[i].value);
      const b = Number(results[j].value);
      if (!isNaN(a) && !isNaN(b)) {
        const diff = Math.abs(a - b);
        const base = Math.max(Math.abs(a), Math.abs(b), 1);
        const pct = (diff / base) * 100;
        if (pct > maxVariance) maxVariance = pct;
      }
    }
  }

  // Recommend the highest-confidence source
  const sorted = [...results].sort((a, b) => b.confidence - a.confidence);
  const recommended = sorted[0];

  return {
    fact_key: factKey,
    display_name: displayName,
    candidates,
    materiality_threshold: materialityThreshold,
    max_variance_percentage: Math.round(maxVariance * 10) / 10,
    recommended_verification_path: 'Route to Verification Queue for advisor resolution',
    recommended_source: recommended?.source_name,
    reason: `Material conflict between ${candidates.length} sources (max variance: ${Math.round(maxVariance * 10) / 10}%)`,
  };
}

// ── Resolve a single fact ───────────────────────────────────────────────────
export function resolveFact(
  factKey: string,
  candidates: ResolverResult[],
  opts: {
    requestedPeriod?: any;
    asOfDate?: string;
    materialityThreshold?: number;
    advisorApprovedValue?: ResolverResult | null;
    visibilityScope?: VisibilityScope;
  } = {},
): { fact: CanonicalFact | null; conflict: FactConflict | null } {
  const startTime = Date.now();
  const def = getFactDefinition(factKey);
  if (!def) {
    return { fact: null, conflict: null };
  }

  const threshold = opts.materialityThreshold || def.conflict_materiality_threshold;

  // Step 4: Apply reporting-period relevance
  const periodFiltered = candidates.filter((c) =>
    isPeriodCompatible(c.reporting_period, opts.requestedPeriod),
  );

  // Step 5-8: Apply source authority + conflict detection
  const selection = selectAuthoritativeCandidate(periodFiltered, {
    requestedPeriod: opts.requestedPeriod?.label,
    asOfDate: opts.asOfDate,
    materialityThreshold: threshold,
    advisorApprovedValue: opts.advisorApprovedValue,
  });

  // Conflict case
  if (selection.is_conflict) {
    const conflict = buildConflict(factKey, def.display_name, periodFiltered, threshold);
    return { fact: null, conflict };
  }

  // Missing case
  if (selection.is_missing || !selection.selected) {
    const fact: CanonicalFact = {
      fact_key: factKey,
      display_name: def.display_name,
      category: def.category,
      business_id: '', // Filled by caller
      value: null,
      formatted_value: '',
      value_type: def.value_type as any,
      unit: def.unit,
      source_type: 'system_derived' as any,
      source_id: '',
      source_name: 'No source',
      source_authority: 99,
      confidence_score: 0,
      confidence_level: 'missing',
      verification_status: 'missing',
      conflict_status: 'none',
      advisor_approved: false,
      client_confirmed: false,
      updated_at: new Date().toISOString(),
      evidence: [],
      lineage: [],
      alternative_candidates: [],
      resolution_status: 'missing',
      is_stale: false,
      is_derived: def.is_derived,
      consumer_safe: false,
      diagnostics: {
        candidate_count: candidates.length,
        selected_source: 'none',
        resolution_duration_ms: Date.now() - startTime,
        conflict_detected: false,
        fallback_used: false,
      },
    };
    return { fact, conflict: null };
  }

  const selected = selection.selected;
  const alternatives = buildAlternatives(periodFiltered, selected);
  const level = confidenceLevel(selected.confidence, opts.advisorApprovedValue != null, false);
  const stale = isStale(selected.source_date);
  const verificationStatus = confidenceToVerificationStatus(level, opts.advisorApprovedValue != null, 'none');

  // Build lineage and evidence
  const lineage = buildLineage(factKey, selected, def.lineage_requirements);
  const evidence = buildEvidence(selected, alternatives);

  const fact: CanonicalFact = {
    fact_key: factKey,
    display_name: def.display_name,
    category: def.category,
    business_id: '', // Filled by caller
    value: selected.value,
    formatted_value: formatValue(selected.value, def.value_type),
    value_type: def.value_type as any,
    unit: def.unit,
    source_type: selected.source_type,
    source_id: selected.source_id || '',
    source_name: selected.source_name,
    source_authority: 0,
    source_date: selected.source_date,
    reporting_period: opts.requestedPeriod,
    effective_date: selected.source_date,
    confidence_score: selected.confidence,
    confidence_level: level as any,
    verification_status: verificationStatus,
    conflict_status: 'none',
    advisor_approved: opts.advisorApprovedValue != null,
    client_confirmed: selected.source_type === 'client_confirmation',
    updated_at: selected.source_date || new Date().toISOString(),
    updated_by: undefined,
    evidence,
    lineage,
    alternative_candidates: alternatives,
    resolution_status: stale ? 'stale' : 'resolved',
    is_stale: stale,
    is_derived: def.is_derived,
    consumer_safe: false,
    diagnostics: {
      candidate_count: candidates.length,
      selected_source: selected.source_type,
      resolution_duration_ms: Date.now() - startTime,
      conflict_detected: false,
      fallback_used: def.allow_fallback && candidates.length === 0,
    },
  };

  return { fact, conflict: null };
}

// ── Apply visibility scope to a resolved fact ──────────────────────────────
export function applyVisibilityScope(
  fact: CanonicalFact,
  conflict: FactConflict | null,
  visibilityScope: VisibilityScope,
): { fact: CanonicalFact | null; conflict: FactConflict | null } {
  if (visibilityScope === 'client_safe') {
    return {
      fact: fact ? applyClientSafeFilter(fact) : null,
      conflict: conflict ? applyClientSafeFilterConflict(conflict) : null,
    };
  }
  return { fact, conflict };
}

// ── Get pilot fact keys ─────────────────────────────────────────────────────
export function getPilotFactKeys(): string[] {
  return PILOT_FACT_KEYS;
}

// ── Get all fact keys ───────────────────────────────────────────────────────
export function getAllFactKeys(): string[] {
  return FACT_REGISTRY.map((f) => f.fact_key);
}

// ── Resolve visibility scope from auth context ─────────────────────────────
export function resolveVisibilityScope(
  ctx: AuthCtx,
  isBusinessOwner: boolean,
  hasAdvisorAssignment: boolean,
): VisibilityScope {
  return determineVisibilityScope(ctx.profile.app_role, isBusinessOwner, hasAdvisorAssignment);
}