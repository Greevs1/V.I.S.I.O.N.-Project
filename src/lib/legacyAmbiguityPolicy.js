/**
 * Legacy Ambiguity Policy — the formal rule for how historical records may
 * (and may not) enter the Digital Twin.
 *
 * WHY THIS EXISTS (Phase 6B.1, Blocker 3):
 *   Phase 6B found historical records whose business ownership and/or semantic
 *   meaning cannot be established with certainty — Sprints created by a service
 *   identity, roadmap items and assessment sessions that predate the only
 *   candidate business, a conversation whose creator has no profile, and
 *   `freedom_projections` rows holding the literal string 'test-biz'.
 *
 *   The tempting move is to backfill them by guessing. That would silently
 *   invent provenance, and the Digital Twin's entire value is trustworthy
 *   provenance. So instead: classify, preserve, and refuse to auto-canonicalise.
 *
 * This module is pure policy — no database access, no mutations. The Digital
 * Twin (business_facts) does NOT exist yet and is NOT created here.
 */

// ─────────────────────────────────────────────────────────────────────────────
// THE SIX CLASSES
// ─────────────────────────────────────────────────────────────────────────────

export const LEGACY_CLASS = {
  /** Business ownership AND semantic meaning are directly established. */
  VERIFIED: 'VERIFIED',
  /** Ownership/meaning can be deterministically derived from verified relationships. */
  DERIVABLE: 'DERIVABLE',
  /** Multiple plausible interpretations or owners exist. */
  AMBIGUOUS: 'AMBIGUOUS',
  /** A required parent/source no longer exists or cannot be resolved. */
  ORPHANED: 'ORPHANED',
  /** Confirmed development/test artifact. */
  TEST_DATA: 'TEST_DATA',
  /** Valid historical product data that should stay available but not auto-canonicalise. */
  LEGACY_ONLY: 'LEGACY_ONLY',
};

// ─────────────────────────────────────────────────────────────────────────────
// THE INGESTION RULE
// ─────────────────────────────────────────────────────────────────────────────

export const DIGITAL_TWIN_INGESTION = {
  VERIFIED: 'eligible_automatic',
  DERIVABLE: 'eligible_after_deterministic_derivation',
  AMBIGUOUS: 'never_automatically_canonicalize',
  ORPHANED: 'never_automatically_canonicalize',
  TEST_DATA: 'exclude',
  LEGACY_ONLY: 'preserve_do_not_canonicalize',
};

export function ingestionEligibility(legacyClass) {
  return DIGITAL_TWIN_INGESTION[legacyClass] || 'never_automatically_canonicalize';
}

export function mayAutoCanonicalize(legacyClass) {
  return ingestionEligibility(legacyClass) === 'eligible_automatic';
}

// ─────────────────────────────────────────────────────────────────────────────
// CLASSIFICATION DESCRIPTIONS (single source for docs + UI)
// ─────────────────────────────────────────────────────────────────────────────

export const LEGACY_CLASS_DESCRIPTION = {
  VERIFIED: 'Eligible for automatic Digital Twin ingestion.',
  DERIVABLE: 'Eligible once the business scope is derived deterministically from a verified parent.',
  AMBIGUOUS: 'Never automatically canonicalised. Preserved as legacy evidence; requires explicit human confirmation.',
  ORPHANED: 'Never automatically canonicalised. Preserved for audit only.',
  TEST_DATA: 'Excluded from the Digital Twin entirely.',
  LEGACY_ONLY: 'Preserved and available to the product, but not automatically canonicalised.',
};

// ─────────────────────────────────────────────────────────────────────────────
// THE CLASSIFIED HISTORICAL POPULATION (Phase 6B / 6B.1 findings)
// ─────────────────────────────────────────────────────────────────────────────
// Recorded here so the policy and the population it governs live together.
// COUNTS ARE OBSERVATIONS, NOT MUTATIONS — nothing here writes to any store.

export const KNOWN_LEGACY_POPULATION = [
  {
    group: 'NinetyDaySprint created by a verified creator',
    count: 2, legacyClass: LEGACY_CLASS.VERIFIED,
    businessOwnership: 'creator VERIFIED via profiles.base44_user_id; owner held exactly one business at creation',
    semanticStatus: 'CLEAR', recommendedTreatment: 'Backfill business_id on the main branch (records cannot be written from a branch).',
  },
  {
    group: 'NinetyDaySprint created by a service identity',
    count: 2, legacyClass: LEGACY_CLASS.ORPHANED,
    businessOwnership: 'creator is a service account with no profile mapping',
    semanticStatus: 'CLEAR', recommendedTreatment: 'Leave NULL. No automatic canonicalisation.',
  },
  {
    group: 'SprintTask (all business_id NULL)',
    count: 46, legacyClass: LEGACY_CLASS.DERIVABLE,
    businessOwnership: 'inherits from parent NinetyDaySprint',
    semanticStatus: 'CLEAR', recommendedTreatment: 'Inherit from the verified parent sprint; children of ORPHANED sprints stay NULL.',
  },
  {
    group: 'GalileoConversation created by a verified creator',
    count: 3, legacyClass: LEGACY_CLASS.VERIFIED,
    businessOwnership: 'creator VERIFIED; single business at the time',
    semanticStatus: 'CLEAR', recommendedTreatment: 'Backfill business_id + session_type on the main branch.',
  },
  {
    group: 'GalileoConversation with unresolvable creator',
    count: 1, legacyClass: LEGACY_CLASS.ORPHANED,
    businessOwnership: 'creator has no profile and no user record',
    semanticStatus: 'CLEAR', recommendedTreatment: 'Leave NULL. Audit only.',
  },
  {
    group: 'roadmap_items with business_id NULL',
    count: 26, legacyClass: LEGACY_CLASS.AMBIGUOUS,
    businessOwnership: 'all predate the only candidate business (created ~28 min later)',
    semanticStatus: 'CLEAR', recommendedTreatment: 'Do not backfill by inference. Product decision required.',
  },
  {
    group: 'assessment_sessions with business_id NULL',
    count: 14, legacyClass: LEGACY_CLASS.AMBIGUOUS,
    businessOwnership: 'all predate the only candidate business',
    semanticStatus: 'CLEAR', recommendedTreatment: 'Do not backfill by inference. Digital Twin must tolerate NULL-business assessment evidence.',
  },
  {
    group: 'assessment_calculations with business_id NULL (session also NULL)',
    count: 13, legacyClass: LEGACY_CLASS.LEGACY_ONLY,
    businessOwnership: 'parent session has no business_id',
    semanticStatus: 'CLEAR', recommendedTreatment: 'Stay NULL by design. Not canonicalised.',
  },
  {
    group: 'assessment_calculations with business_id NULL (session HAS business_id)',
    count: 229, legacyClass: LEGACY_CLASS.DERIVABLE,
    businessOwnership: 'deterministic via assessment_calculations.session_id → assessment_sessions.business_id',
    semanticStatus: 'CLEAR', recommendedTreatment: 'Backfill via phase_6b1_safe_foundation.sql Section C1.',
  },
  {
    group: 'documents with business_id NULL',
    count: 6, legacyClass: LEGACY_CLASS.VERIFIED,
    businessOwnership: 'uploaded_by a verified profile inside the single-business window',
    semanticStatus: 'CLEAR', recommendedTreatment: 'Backfill on the main branch.',
  },
  {
    group: 'gap_analyses without business_id',
    count: 19, legacyClass: LEGACY_CLASS.LEGACY_ONLY,
    businessOwnership: 'table has no business_id column; profile-scoped only',
    semanticStatus: 'CLEAR', recommendedTreatment: 'Legacy mirror. Not canonicalised.',
  },
  {
    group: "freedom_projections holding business_id = 'test-biz'",
    count: 9, legacyClass: LEGACY_CLASS.TEST_DATA,
    businessOwnership: 'literal test string, not a business identifier',
    semanticStatus: 'CLEAR', recommendedTreatment: 'Exclude from the Digital Twin. Cleanup needs a product decision (column is NOT NULL).',
  },
  {
    group: 'p1_mymargin values whose metric family cannot be established',
    count: null, legacyClass: LEGACY_CLASS.AMBIGUOUS,
    businessOwnership: 'ownership is fine; the SEMANTIC status is what is uncertain',
    semanticStatus: 'AMBIGUOUS', recommendedTreatment: 'Classify per value (net profit / EBITDA / ambiguous). Never auto-canonicalise. See profitSemantics.classifyLegacyMargin.',
  },
];

/**
 * summarizePopulation — counts per class, for reporting.
 */
export function summarizePopulation(population = KNOWN_LEGACY_POPULATION) {
  const byClass = {};
  let totalKnown = 0;
  for (const row of population) {
    byClass[row.legacyClass] = (byClass[row.legacyClass] || 0) + (row.count || 0);
    if (row.count != null) totalKnown += row.count;
  }
  return { byClass, totalKnown, groups: population.length };
}