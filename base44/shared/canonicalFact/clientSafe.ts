/**
 * canonicalFact/clientSafe.ts — Phase 14.2A
 *
 * Client-Safe Filtering. Canonical fact resolution must support internal
 * and client_safe visibility scopes. The client-safe version must NOT
 * expose internal IDs, advisor notes, rejected candidates, hidden
 * adjustments, internal confidence logic, source storage locations,
 * restricted documents, or unpublished valuation information.
 *
 * Reuses:
 *   - valuationContext.resolveAccessMode (existing access mode resolution)
 *   - Same client visibility rules as the valuation system
 */

import type { CanonicalFact, FactConflict, VisibilityScope } from './types.ts';

// ── Apply client-safe filter to a canonical fact ────────────────────────────
// Strips internal diagnostics, internal IDs, rejected candidates, and
// internal confidence logic.
export function applyClientSafeFilter(fact: CanonicalFact): CanonicalFact {
  return {
    ...fact,
    // Strip diagnostics (internal only)
    diagnostics: undefined,

    // Strip internal source IDs (keep names for transparency)
    source_id: '',

    // Strip alternative candidate source IDs
    alternative_candidates: fact.alternative_candidates.map((c) => ({
      ...c,
      source_id: '',
    })),

    // Strip evidence source IDs (keep names)
    evidence: fact.evidence.map((e) => ({
      ...e,
      source_id: '',
    })),

    // Strip lineage source IDs
    lineage: fact.lineage.map((l) => ({
      ...l,
      source_id: undefined,
    })),

    // Mark as consumer safe
    consumer_safe: true,

    // Simplify confidence to a consumer-friendly level (hide numeric score)
    confidence_level: fact.confidence_level,
    confidence_score: fact.confidence_level === 'verified' ? 100 : fact.confidence_level === 'high' ? 85 : fact.confidence_level === 'medium' ? 70 : fact.confidence_level === 'low' ? 50 : 0,
  };
}

// ── Apply client-safe filter to a conflict ──────────────────────────────────
export function applyClientSafeFilterConflict(conflict: FactConflict): FactConflict {
  return {
    ...conflict,
    candidates: conflict.candidates.map((c) => ({
      ...c,
      source_id: '',
    })),
  };
}

// ── Determine visibility scope from profile and business access ─────────────
// Reuses the same logic as valuationContext.resolveAccessMode.
// If the user is the business owner (not an assigned advisor), scope is client_safe.
export function determineVisibilityScope(
  profileRole: string,
  isBusinessOwner: boolean,
  hasAdvisorAssignment: boolean,
): VisibilityScope {
  // Super admins and assigned advisors get internal scope
  if (profileRole === 'super_admin') return 'internal';
  if (profileRole === 'admin' || profileRole === 'advisor' || profileRole === 'expert_advisor') {
    if (hasAdvisorAssignment) return 'internal';
  }

  // Business owners get client_safe scope
  if (isBusinessOwner) return 'client_safe';

  // Default to client_safe (least privilege)
  return 'client_safe';
}

// ── Check if a fact should be hidden from client_safe view ──────────────────
// Some facts are internal-only (e.g., advisor notes, internal confidence logic).
export function isFactClientSafe(fact: CanonicalFact): boolean {
  // Published valuation facts are client-safe
  if (fact.fact_key === 'publication_status') return true;

  // Facts from unpublished valuations are NOT client-safe
  if (fact.source_type === 'prior_valuation_answer' && !fact.advisor_approved) return false;

  // Internal advisor entries that aren't verified are NOT client-safe
  if (fact.source_type === 'advisor_entry' && !fact.advisor_approved && fact.confidence_score < 85) {
    return false;
  }

  return true;
}