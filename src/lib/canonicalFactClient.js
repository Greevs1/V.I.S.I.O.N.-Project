/**
 * canonicalFactClient.js — Phase 14.2B
 *
 * Client-side helper for the Dashboard canonical consumer migration.
 * Merges canonical fact values into the raw data sources (metricsData,
 * latestSnapshot) BEFORE the BIS engine consumes them, so all downstream
 * calculations use canonical-preferred values without any calculation
 * or UI changes.
 *
 * Rules:
 *   - Canonical facts are PREFERRED. Legacy values are FALLBACK only.
 *   - Conflict state is EXPOSED via canonical_conflicts (not silently substituted).
 *   - Missing facts fall back to legacy values (BIS engine handles the gap).
 *   - Shadow comparison is computed for dev diagnostics only (not shown in UI).
 *   - No UI changes. No calculation changes. No metric definition changes.
 *
 * Reuses:
 *   - canonicalFactService.getCanonicalFacts (batch resolution)
 *   - Existing BIS engine (unchanged)
 */

import { base44 } from '@/api/base44Client';

// ── Pilot fact keys (must match server PILOT_FACT_KEYS) ─────────────────────
export const PILOT_FACT_KEYS = [
  'revenue',
  'gross_profit',
  'gross_margin',
  'net_income',
  'reported_ebitda',
  'normalized_ebitda',
  'owner_compensation',
  'cash',
  'debt',
  'customer_concentration',
];

// ── Map pilot fact keys to dashboard raw data field paths ───────────────────
// Only the pilot facts that are CURRENTLY consumed by BIE / Dashboard are mapped.
// Phase 14.2C: Fixed field mappings to match BIE engine read paths.
//
// CRITICAL: The BIE engine (bie/engine.js) reads:
//   revenue = as?.revenue || m?.revenue  (flat field 'revenue', NOT 'annual_revenue')
//   recast_add_backs = m?.recast_ebitda?.total_add_backs  (nested object, NOT flat)
//
// Previous Phase 14.2B mapping wrote canonical revenue to m.annual_revenue (wrong field)
// and normalized_ebitda to m.recast_ebitda (flat — would destroy nested object).
// These are fixed below.
const FACT_TO_DASHBOARD_FIELD = {
  // revenue: BIE reads m?.revenue (flat) — must write to 'revenue', not 'annual_revenue'
  revenue: { source: 'metricsData', field: 'revenue' },
  // net_income: BIE does not read m.net_profit directly; safe for Dashboard display
  net_income: { source: 'metricsData', field: 'net_profit' },
  // reported_ebitda: BIE does not read m.current_ebitda directly; safe for Dashboard display
  reported_ebitda: { source: 'metricsData', field: 'current_ebitda' },
  // normalized_ebitda: REMOVED from dashboard mapping — BIE reads m.recast_ebitda as a
  // nested object (m.recast_ebitda.total_add_backs). Writing a flat number would destroy
  // the nested object and break BIE's recast_add_backs resolution. normalized_ebitda is
  // not consumed by BIE or the Executive Brief as a flat dashboard_metrics field.
};

const FACT_TO_SNAPSHOT_FIELD = {
  revenue: 'annual_revenue',
  net_income: 'net_profit',
  reported_ebitda: 'ebitda',
  // normalized_ebitda: REMOVED — conflicted with reported_ebitda (both mapped to 'ebitda').
  // The second would overwrite the first. normalized_ebitda is not consumed by BIE.
};

// ── Shadow discrepancy classification (client-side) ─────────────────────────
function classifyShadow(canonical, legacy) {
  if (canonical == null && legacy == null) return { type: 'match', explanation: 'Both null' };
  if (canonical == null) return { type: 'expected_difference', explanation: 'Canonical missing, legacy has value' };
  if (legacy == null) return { type: 'expected_difference', explanation: 'Canonical resolved, legacy null' };

  const numC = Number(canonical);
  const numL = Number(legacy);
  if (isNaN(numC) || isNaN(numL)) {
    return String(canonical) === String(legacy)
      ? { type: 'match', explanation: 'String match' }
      : { type: 'unknown', explanation: 'Non-numeric differ' };
  }
  if (numC === numL) return { type: 'match', explanation: 'Identical' };

  const diff = Math.abs(numC - numL);
  const base = Math.max(Math.abs(numC), Math.abs(numL), 1);
  const pct = (diff / base) * 100;
  if (pct < 1) return { type: 'match', explanation: '< 1% (rounding)' };
  if (pct > 20) return { type: 'source_authority_difference', explanation: 'Large difference' };
  if (pct > 5) return { type: 'period_difference', explanation: 'Moderate difference' };
  return { type: 'expected_difference', explanation: 'Minor difference' };
}

// ── Fetch canonical facts for the dashboard (batch) ────────────────────────
export async function fetchCanonicalFactsForDashboard(businessId) {
  if (!businessId) return null;
  try {
    const res = await base44.functions.invoke('canonicalFactService', {
      action: 'getCanonicalFacts',
      data: { businessId, factKeys: PILOT_FACT_KEYS },
    });
    return res.data;
  } catch (err) {
    // Canonical resolution failure is non-fatal — dashboard uses legacy
    console.warn('[CanonicalFacts] Dashboard fetch failed (non-fatal):', err?.message || err);
    return null;
  }
}

// ── Merge canonical facts into dashboard raw data sources ───────────────────
// Returns { metricsData, latestSnapshot, canonicalMeta, shadowDiagnostics, conflicts }
// The merged metricsData/snapshot are fed to the BIS engine unchanged.
export function mergeCanonicalIntoDashboardSources(canonicalResult, metricsData, latestSnapshot) {
  if (!canonicalResult) {
    return {
      metricsData: metricsData || {},
      latestSnapshot: latestSnapshot || {},
      canonicalMeta: { available: false },
      shadowDiagnostics: [],
      conflicts: [],
    };
  }

  const facts = canonicalResult.facts || [];
  const conflicts = canonicalResult.conflicts || [];
  const missing = canonicalResult.missing || [];

  const mergedMetrics = { ...(metricsData || {}) };
  const mergedSnapshot = { ...(latestSnapshot || {}) };
  const shadowDiagnostics = [];

  // Phase 14.2C: Build a factsMap for BIE/Executive Brief canonical-preferred reads.
  // Only includes resolved/stale facts (not conflicts) — conflicts are exposed separately.
  const factsMap = {};
  for (const f of facts) {
    if (f.resolution_status === 'resolved' || f.resolution_status === 'stale') {
      factsMap[f.fact_key] = {
        value: f.value,
        source_name: f.source_name,
        confidence: f.confidence_score,
        verification: f.verification_status,
        resolution: f.resolution_status,
        reporting_period: f.reporting_period?.label || null,
      };
    }
  }

  const canonicalMeta = {
    available: facts.length > 0 || conflicts.length > 0,
    resolved_count: facts.length,
    conflict_count: conflicts.length,
    missing_count: missing.length,
    fact_keys: {},
  };

  // Track conflict fact keys for UI state
  const conflictKeys = new Set(conflicts.map((c) => c.fact_key));

  // Apply canonical values to metricsData
  for (const fact of facts) {
    const mapping = FACT_TO_DASHBOARD_FIELD[fact.fact_key];
    if (!mapping) continue; // Fact not used on dashboard — do not introduce

    const legacyValue = mergedMetrics[mapping.field] ?? null;
    const canonicalValue = fact.value;
    const { type, explanation } = classifyShadow(canonicalValue, legacyValue);

    shadowDiagnostics.push({
      fact_key: fact.fact_key,
      consumer: 'dashboard',
      legacy_value: legacyValue,
      canonical_value: canonicalValue,
      discrepancy_type: type,
      explanation,
      resolution_status: fact.resolution_status,
      canonical_used: fact.resolution_status !== 'conflict' && canonicalValue != null,
    });

    // Only override with canonical when resolved (not conflict, not missing, not stale-forbidden)
    if (fact.resolution_status === 'resolved' || fact.resolution_status === 'stale') {
      mergedMetrics[mapping.field] = canonicalValue;
      canonicalMeta.fact_keys[fact.fact_key] = {
        used: true,
        source: fact.source_name,
        confidence: fact.confidence_score,
        verification: fact.verification_status,
        resolution: fact.resolution_status,
      };
    }
  }

  // Apply canonical values to latestSnapshot
  for (const fact of facts) {
    const snapField = FACT_TO_SNAPSHOT_FIELD[fact.fact_key];
    if (!snapField) continue;

    if (fact.resolution_status === 'resolved' || fact.resolution_status === 'stale') {
      mergedSnapshot[snapField] = fact.value;
    }
  }

  // Expose conflicts (for internal flagging — no UI change in this phase)
  canonicalMeta.conflicts = conflicts.map((c) => ({
    fact_key: c.fact_key,
    display_name: c.display_name,
    reason: c.reason,
  }));

  return {
    metricsData: mergedMetrics,
    latestSnapshot: mergedSnapshot,
    canonicalMeta,
    factsMap,
    shadowDiagnostics,
    conflicts: canonicalMeta.conflicts,
  };
}