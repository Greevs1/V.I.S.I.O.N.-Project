/**
 * businessStateSync/liveSyncPolicy.ts — Phase 14.3B
 *
 * Centralized Live Sync Policy — determines which fact+consumer+business
 * combinations are LIVE vs SHADOW.
 *
 * PILOT MATRIX (Phase 14.3D):
 *   revenue + dashboard = LIVE
 *   revenue + galileo   = LIVE
 *   debt + dashboard     = LIVE
 *   debt + galileo       = LIVE
 *   cash + dashboard     = LIVE
 *   cash + galileo       = LIVE
 *   ALL other combinations = SHADOW
 *
 * The policy is centralized. No feature flags scattered through components.
 *
 * GLOBAL KILL SWITCH:
 *   CANONICAL_LIVE_SYNC_ENABLED — if false, ALL propagation returns to
 *   shadow-only behavior. No code rewrites required. Telemetry preserved.
 */

import type { ConsumerId } from './types.ts';

// ── Global Kill Switch ───────────────────────────────────────────────────────
// If false, ALL live sync returns to shadow-only. No code rewrites needed.
let CANONICAL_LIVE_SYNC_ENABLED = true;

// ── Live Matrix ───────────────────────────────────────────────────────────────
// Map of "fact_key:consumer_id" → enabled (true = LIVE, false = SHADOW)
// Phase 14.3B: revenue + dashboard, revenue + galileo
// Phase 14.3C: debt + dashboard, debt + galileo (point-in-time fact expansion)
// Phase 14.3D: cash + dashboard, cash + galileo (second point-in-time fact expansion)
const LIVE_MATRIX: Record<string, boolean> = {
  'revenue:dashboard': true,
  'revenue:galileo': true,
  'debt:dashboard': true,
  'debt:galileo': true,
  'cash:dashboard': true,
  'cash:galileo': true,
  // All other combinations are implicitly SHADOW (not in matrix)
};

// ── Pilot Business Cohort ─────────────────────────────────────────────────────
// If empty, NO businesses are live (safe default). Admin adds businesses via
// the liveSyncOrchestrator backend function.
let PILOT_BUSINESS_IDS: string[] = [];

// ── Consumer confidence requirements ──────────────────────────────────────────
const CONSUMER_CONFIDENCE_REQUIREMENTS: Record<ConsumerId, number> = {
  dashboard: 65,
  galileo: 50,    // Galileo can explain uncertainty, lower threshold acceptable
  executive_brief: 65,
  business_intelligence: 65,
  growth_plan: 85,
  reports: 85,
  meeting_prep: 65,
  assessments: 50,
  valuation: 65,
  documents: 50,
  roadmap: 65,
  sprints: 85,
};

// ── Check if live sync is enabled for a fact+consumer+business ───────────────
export function isLiveSyncEnabled(
  factKey: string,
  consumerId: ConsumerId,
  businessId: string,
): boolean {
  // 1. Global kill switch
  if (!CANONICAL_LIVE_SYNC_ENABLED) return false;

  // 2. Fact+consumer must be in the live matrix
  const matrixKey = `${factKey}:${consumerId}`;
  if (!LIVE_MATRIX[matrixKey]) return false;

  // 3. Business must be in the pilot cohort
  if (PILOT_BUSINESS_IDS.length === 0) return false; // No businesses = no live sync
  if (!PILOT_BUSINESS_IDS.includes(businessId)) return false;

  return true;
}

// ── Get the sync mode for a fact+consumer+business ───────────────────────────
export function getLiveSyncMode(
  factKey: string,
  consumerId: ConsumerId,
  businessId: string,
): 'live' | 'shadow' {
  return isLiveSyncEnabled(factKey, consumerId, businessId) ? 'live' : 'shadow';
}

// ── Get the confidence requirement for a consumer ───────────────────────────
export function getConsumerConfidenceRequirement(consumerId: ConsumerId): number {
  return CONSUMER_CONFIDENCE_REQUIREMENTS[consumerId] || 65;
}

// ── Kill switch controls ─────────────────────────────────────────────────────
export function isGlobalLiveSyncEnabled(): boolean {
  return CANONICAL_LIVE_SYNC_ENABLED;
}

export function setGlobalLiveSyncEnabled(enabled: boolean): void {
  CANONICAL_LIVE_SYNC_ENABLED = enabled;
}

// ── Pilot business cohort controls ───────────────────────────────────────────
export function getPilotBusinessIds(): string[] {
  return [...PILOT_BUSINESS_IDS];
}

export function addPilotBusiness(businessId: string): void {
  if (!PILOT_BUSINESS_IDS.includes(businessId)) {
    PILOT_BUSINESS_IDS.push(businessId);
  }
}

export function removePilotBusiness(businessId: string): void {
  PILOT_BUSINESS_IDS = PILOT_BUSINESS_IDS.filter(id => id !== businessId);
}

export function isPilotBusiness(businessId: string): boolean {
  return PILOT_BUSINESS_IDS.includes(businessId);
}

// ── Get the full live matrix (for observability) ──────────────────────────────
export function getLiveMatrix(): Record<string, boolean> {
  return { ...LIVE_MATRIX };
}

// ── Get pilot status (for observability/admin) ───────────────────────────────
export function getPilotStatus(): {
  global_enabled: boolean;
  live_matrix: Record<string, boolean>;
  pilot_businesses: string[];
  live_combinations: string[];
} {
  const liveCombinations = Object.entries(LIVE_MATRIX)
    .filter(([_, enabled]) => enabled)
    .map(([key]) => key);

  return {
    global_enabled: CANONICAL_LIVE_SYNC_ENABLED,
    live_matrix: { ...LIVE_MATRIX },
    pilot_businesses: [...PILOT_BUSINESS_IDS],
    live_combinations: liveCombinations,
  };
}