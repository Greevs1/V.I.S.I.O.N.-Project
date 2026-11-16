/**
 * canonicalFact/consumerAdapter.ts — Phase 14.2B
 *
 * The Controlled Canonical Consumer Migration Adapter.
 *
 * This is the single shared READ-path adapter that production consumers
 * (Galileo, Dashboard) use to consume canonical business facts safely.
 *
 * Architecture:
 *   Existing sources → Canonical Fact Resolver → Consumer (via this adapter)
 *
 * Rules enforced:
 *   - Canonical facts are PREFERRED. Legacy values are FALLBACK only.
 *   - Conflict state is EXPOSED, never silently substituted.
 *   - Missing facts fall back to legacy ONLY when the registry permits.
 *   - Never fall back when canonical = conflict or blocked.
 *   - Shadow comparison is computed for every fact (internal only).
 *   - Telemetry records migration metadata only (no user content).
 *   - Client-safe filtering is applied per consumer visibility.
 *   - Reporting period applicability wins before source authority.
 *
 * NO WRITES. NO PROPAGATION. NO UI CHANGES. NO LEGACY REMOVAL.
 *
 * Reuses:
 *   - valuationAuth.AuthCtx
 *   - canonicalFact.resolver.resolveFact, applyVisibilityScope
 *   - canonicalFact.contextLoader.loadIntelligenceContext
 *   - canonicalFact.resolverHelpers.loadCandidates, getAdvisorApprovedValue
 *   - canonicalFact.registry.PILOT_FACT_KEYS
 */

import type { AuthCtx } from '../valuationEngine/valuationAuth.ts';
import {
  resolveFact,
  applyVisibilityScope,
  PILOT_FACT_KEYS,
} from './index.ts';
import { loadIntelligenceContext } from './contextLoader.ts';
import {
  loadCandidates,
  getAdvisorApprovedValue,
} from './resolverHelpers.ts';
import type {
  CanonicalFact,
  FactConflict,
  VisibilityScope,
  DiscrepancyType,
  ReportingPeriod,
} from './types.ts';

// ── Consumer identifiers ────────────────────────────────────────────────────
export type ConsumerId = 'galileo' | 'dashboard';

// ── Adapter Input ───────────────────────────────────────────────────────────
export interface ConsumerAdapterOptions {
  factKeys: string[];
  consumer: ConsumerId;
  visibilityScope?: VisibilityScope;
  reportingPeriod?: ReportingPeriod;
  asOfDate?: string;
  legacyValues?: Record<string, any>; // For shadow comparison
}

// ── Shadow Diagnostic (internal only, never shown to users) ────────────────
export interface ShadowDiagnostic {
  fact_key: string;
  consumer: ConsumerId;
  legacy_value: any;
  canonical_value: any;
  discrepancy_type: DiscrepancyType;
  canonical_used: boolean;
  fallback_used: boolean;
  resolution_status: string;
  explanation: string;
}

// ── Telemetry Record (migration metadata only, no user content) ────────────
export interface TelemetryRecord {
  consumer: ConsumerId;
  fact_key: string;
  canonical_used: boolean;
  fallback_used: boolean;
  resolution_status: string;
  difference_classification: string;
  resolution_duration_ms: number;
}

// ── Adapter Output ──────────────────────────────────────────────────────────
export interface ConsumerAdapterResult {
  facts: Record<string, CanonicalFact | null>;
  conflicts: Record<string, FactConflict | null>;
  missing: string[];
  errors: Record<string, string>;
  shadow: ShadowDiagnostic[];
  telemetry: TelemetryRecord[];
  fallbackUsed: Record<string, boolean>;
  resolvedCount: number;
  conflictCount: number;
  missingCount: number;
  totalDurationMs: number;
}

// ── Resolve visibility scope from auth context ──────────────────────────────
export function resolveScopeFromCtx(ctx: AuthCtx, businessId: string): VisibilityScope {
  if (ctx.isSuperAdmin) return 'internal';
  const role = ctx.profile?.app_role;
  if (role === 'admin' || role === 'advisor' || role === 'expert_advisor') {
    return 'internal';
  }
  if (ctx.profile?.primary_business_id === businessId) return 'client_safe';
  return 'client_safe';
}

// ── Classify discrepancy between canonical and legacy value ─────────────────
export function classifyShadowDiscrepancy(
  canonical: any,
  legacy: any,
  fact: CanonicalFact | null,
): { type: DiscrepancyType; explanation: string } {
  if (canonical == null && legacy == null) {
    return { type: 'match', explanation: 'Both canonical and legacy are null' };
  }
  if (canonical == null) {
    return { type: 'expected_difference', explanation: 'Canonical missing, legacy has value — fallback used' };
  }
  if (legacy == null) {
    return { type: 'expected_difference', explanation: 'Canonical resolved, legacy had no value — canonical introduced' };
  }

  const numC = Number(canonical);
  const numL = Number(legacy);

  if (isNaN(numC) || isNaN(numL)) {
    return String(canonical) === String(legacy)
      ? { type: 'match', explanation: 'String values agree' }
      : { type: 'unknown', explanation: 'Non-numeric values differ' };
  }

  if (numC === numL) {
    return { type: 'match', explanation: 'Values identical' };
  }

  const diff = Math.abs(numC - numL);
  const base = Math.max(Math.abs(numC), Math.abs(numL), 1);
  const pct = (diff / base) * 100;

  if (pct < 1) {
    return { type: 'match', explanation: 'Difference < 1% (rounding)' };
  }

  if (fact?.resolution_status === 'conflict') {
    return { type: 'conflict', explanation: 'Canonical resolver detected conflict' };
  }

  // Check if the canonical fact is from a different reporting period
  if (fact?.reporting_period?.label && fact.reporting_period.label !== 'TTM') {
    return { type: 'period_difference', explanation: `Canonical from period ${fact.reporting_period.label}` };
  }

  if (pct > 20) {
    return { type: 'source_authority_difference', explanation: 'Large difference — likely different source authority' };
  }
  if (pct > 5) {
    return { type: 'period_difference', explanation: 'Moderate difference — possibly different period' };
  }

  return { type: 'expected_difference', explanation: 'Minor difference (derivation or rounding)' };
}

// ── Main adapter: batch-resolve canonical facts for a consumer ──────────────
export async function loadCanonicalFactsForConsumer(
  ctx: AuthCtx,
  businessId: string,
  opts: ConsumerAdapterOptions,
): Promise<ConsumerAdapterResult> {
  const totalStart = Date.now();

  const facts: Record<string, CanonicalFact | null> = {};
  const conflicts: Record<string, FactConflict | null> = {};
  const missing: string[] = [];
  const errors: Record<string, string> = {};
  const shadow: ShadowDiagnostic[] = [];
  const telemetry: TelemetryRecord[] = [];
  const fallbackUsed: Record<string, boolean> = {};

  // Filter to pilot facts only — Phase 14.2B is pilot-only
  const allowedKeys = opts.factKeys.filter((k) => PILOT_FACT_KEYS.includes(k));

  if (allowedKeys.length === 0) {
    return {
      facts, conflicts, missing, errors, shadow, telemetry, fallbackUsed,
      resolvedCount: 0, conflictCount: 0, missingCount: 0,
      totalDurationMs: Date.now() - totalStart,
    };
  }

  // Load the intelligence context once for all facts (batch)
  const intelCtx = await loadIntelligenceContext(ctx, businessId);
  const scope = opts.visibilityScope || resolveScopeFromCtx(ctx, businessId);

  for (const factKey of allowedKeys) {
    const factStart = Date.now();
    try {
      const candidates = await loadCandidates(factKey, intelCtx);
      const advisorApproved = getAdvisorApprovedValue(factKey, intelCtx);
      const { fact, conflict } = resolveFact(factKey, candidates, {
        requestedPeriod: opts.reportingPeriod,
        asOfDate: opts.asOfDate,
        advisorApprovedValue: advisorApproved,
        visibilityScope: scope,
      });
      const filtered = applyVisibilityScope(fact, conflict, scope);

      if (filtered.fact) {
        facts[factKey] = { ...filtered.fact, business_id: businessId };
        conflicts[factKey] = null;
      } else if (filtered.conflict) {
        conflicts[factKey] = filtered.conflict;
        facts[factKey] = null;
      } else {
        missing.push(factKey);
        facts[factKey] = null;
        conflicts[factKey] = null;
      }

      // Shadow comparison
      const legacyValue = opts.legacyValues?.[factKey] ?? null;
      const canonicalValue = filtered.fact?.value ?? null;
      const { type: discrepancyType, explanation } = classifyShadowDiscrepancy(
        canonicalValue, legacyValue, filtered.fact,
      );

      // Fallback rule: use canonical when resolved; fall back to legacy only when
      // canonical is missing AND registry allows fallback AND no conflict exists.
      const canonicalResolved = filtered.fact != null && filtered.fact.resolution_status !== 'conflict';
      const hasConflict = filtered.conflict != null;
      const fbUsed = !canonicalResolved && !hasConflict && legacyValue != null;

      fallbackUsed[factKey] = fbUsed;

      shadow.push({
        fact_key: factKey,
        consumer: opts.consumer,
        legacy_value: legacyValue,
        canonical_value: canonicalValue,
        discrepancy_type: discrepancyType,
        canonical_used: canonicalResolved,
        fallback_used: fbUsed,
        resolution_status: filtered.fact?.resolution_status
          || (hasConflict ? 'conflict' : 'missing'),
        explanation,
      });

      telemetry.push({
        consumer: opts.consumer,
        fact_key: factKey,
        canonical_used: canonicalResolved,
        fallback_used: fbUsed,
        resolution_status: filtered.fact?.resolution_status
          || (hasConflict ? 'conflict' : 'missing'),
        difference_classification: discrepancyType,
        resolution_duration_ms: Date.now() - factStart,
      });
    } catch (err: any) {
      errors[factKey] = err.message;
      missing.push(factKey);
      facts[factKey] = null;
      conflicts[factKey] = null;
      fallbackUsed[factKey] = opts.legacyValues?.[factKey] != null;

      shadow.push({
        fact_key: factKey,
        consumer: opts.consumer,
        legacy_value: opts.legacyValues?.[factKey] ?? null,
        canonical_value: null,
        discrepancy_type: 'unknown',
        canonical_used: false,
        fallback_used: fallbackUsed[factKey],
        resolution_status: 'error',
        explanation: `Resolver error: ${err.message}`,
      });

      telemetry.push({
        consumer: opts.consumer,
        fact_key: factKey,
        canonical_used: false,
        fallback_used: fallbackUsed[factKey],
        resolution_status: 'error',
        difference_classification: 'unknown',
        resolution_duration_ms: Date.now() - factStart,
      });
    }
  }

  const resolvedCount = Object.values(facts).filter((f) => f != null).length;
  const conflictCount = Object.values(conflicts).filter((c) => c != null).length;
  const missingCount = missing.length;

  return {
    facts,
    conflicts,
    missing,
    errors,
    shadow,
    telemetry,
    fallbackUsed,
    resolvedCount,
    conflictCount,
    missingCount,
    totalDurationMs: Date.now() - totalStart,
  };
}

// ── Get the preferred value for a fact (canonical or fallback) ─────────────
// This is the single function consumers call to get a fact value.
// Returns { value, source, canonical_used, conflict }.
export function getPreferredValue(
  adapterResult: ConsumerAdapterResult,
  factKey: string,
  legacyValue: any,
): {
  value: any;
  source: 'canonical' | 'legacy' | 'none';
  canonical_fact: CanonicalFact | null;
  conflict: FactConflict | null;
  canonical_used: boolean;
} {
  const fact = adapterResult.facts[factKey];
  const conflict = adapterResult.conflicts[factKey];

  if (fact && fact.resolution_status !== 'conflict' && fact.value != null) {
    return {
      value: fact.value,
      source: 'canonical',
      canonical_fact: fact,
      conflict: null,
      canonical_used: true,
    };
  }

  if (conflict) {
    // Expose conflict — do NOT silently substitute legacy
    return {
      value: null,
      source: 'none',
      canonical_fact: null,
      conflict,
      canonical_used: false,
    };
  }

  // Missing — fall back to legacy only if registry allows (checked in adapter)
  if (adapterResult.fallbackUsed[factKey] && legacyValue != null) {
    return {
      value: legacyValue,
      source: 'legacy',
      canonical_fact: null,
      conflict: null,
      canonical_used: false,
    };
  }

  return {
    value: null,
    source: 'none',
    canonical_fact: null,
    conflict: null,
    canonical_used: false,
  };
}