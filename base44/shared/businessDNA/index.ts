/**
 * businessDNA/index.ts — Phase E
 *
 * Public API for the Business DNA Foundation.
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
 *   Article V — Advisor Governance (AI proposes, deterministic rules qualify)
 *   Article XVII — Business DNA Authority (derived, never authoritative)
 *   Article XI — Business Isolation (patterns are business-scoped)
 */

// Types
export type {
  DNAFamily, PatternStatus, PatternStrength, PatternConfidence,
  FreshnessState, PatternDirection, PatternVisibility, EvidenceDomain,
  DNAEvidenceRef, PatternImplication, DNAQuestion, BusinessDNAPattern,
  BusinessDNA, BusinessDNAMeta, AICandidatePattern, AIContradiction,
  AICandidateResponse, PatternEvolution, ClientSafePattern, ContradictionResult,
} from './types.ts';

export { DNA_FAMILIES, PATTERN_STATUSES } from './types.ts';

// Families
export {
  FAMILY_DEFINITIONS, getFamilyDefinition, getFamilyLabel,
  isValidPatternType, getDefaultClientVisibility,
  OWNER_DNA_FORBIDDEN_TERMS, isOwnerDNASafe,
} from './families.ts';

// Lineage (critical independence engine)
export {
  deduplicateEvidenceByLineage, countIndependentSources,
  countIndependentByDomain, buildLineageRoot,
} from './lineage.ts';
export type { LineageDedupResult } from './lineage.ts';

// Qualification
export {
  QUALIFICATION_THRESHOLDS, qualifyPattern, shouldWeaken,
  shouldRetire, isValidTransition,
} from './qualification.ts';

// Confidence
export {
  calculateConfidence, calculateFreshness,
  validateStrengthConfidenceSeparation,
} from './confidence.ts';

// Contradiction
export { detectContradiction, applyContradiction } from './contradiction.ts';

// Supersession
export {
  supersedePattern, linkSupersession, getSupersessionChain,
  isSuperseded, isCurrentPattern,
} from './supersession.ts';

// Client Safety
export {
  isPatternClientVisible, filterEvidenceForClient,
  filterImplicationsForClient, filterQuestionsForClient,
  toClientSafePattern, filterPatternsForClient,
  getExcludedInternalFields,
} from './clientSafe.ts';

// Coordinator (synthesis engine)
export {
  buildCandidatePrompt, getCandidateResponseSchema,
  processCandidateResponse, reconcileCandidatePattern,
  buildBusinessDNA, buildPatternEvolution, generatePatternId,
} from './coordinator.ts';
export type { EvidenceCatalog } from './coordinator.ts';