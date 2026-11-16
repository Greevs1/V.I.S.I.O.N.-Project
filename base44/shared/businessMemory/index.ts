/**
 * businessMemory/index.ts — Phase 15.5
 *
 * Public API for the Business Memory Foundation.
 *
 * Business Memory is NOT:
 *   - chat history
 *   - an audit log
 *   - another timeline
 *   - another notes system
 *   - another canonical fact store
 *   - another recommendation engine
 *
 * Business Memory exists to preserve durable business context that should
 * influence future executive understanding without confusing memory with
 * current truth.
 *
 * Constitution Compliance:
 *   Article I — One Truth (memory references, does not duplicate)
 *   Article II — Single Ownership (memory owns "durable context")
 *   Article III — No Duplicate Intelligence (memory references, not copies)
 *   Article V — Advisor Governance (AI proposes, advisor confirms)
 *   Article VII — Extension First (memory extends existing systems)
 *   Article XI — Business Isolation (memory is strictly business-scoped)
 */

// Types
export type {
  MemoryCategory,
  MemoryImportance,
  MemoryStatus,
  CurrentRelevance,
  MemorySourceType,
  CreatedFrom,
  ExpirationBehavior,
  MemorySourceReference,
  MemoryEvidence,
  BusinessMemoryRecord,
  MemoryCandidate,
  DurabilityTestResult,
  MemoryDuplicateCheck,
  MemoryRetrievalQuery,
  MemoryRetrievalResult,
  MemoryConflictResult,
  SupersessionResult,
  ClientSafeMemory,
  MemoryAuditEntry,
  MemoryBoundaryDefinition,
} from './types.ts';

// Categories
export {
  MEMORY_CATEGORIES,
  getCategoryDefinition,
  getCategoryDisplayName,
  getDefaultImportance,
  getDefaultExpiration,
  getDefaultClientVisible,
  getTypicalRelevanceTags,
} from './categories.ts';

// Boundaries
export { MEMORY_BOUNDARIES, getBoundaryDefinition, isMemoryDistinctFrom } from './memoryBoundaries.ts';

// Durability Test
export { runDurabilityTest } from './durabilityTest.ts';

// Candidate Generation
export {
  generateCandidatesFromOutcome,
  generateCandidateFromAdvisorCapture,
  generateCandidatesFromOutcomes,
} from './candidateGeneration.ts';

// Supersession
export {
  supersedeMemory,
  isSuperseded,
  isCurrent,
  getSupersessionChain,
  shouldExpire,
  markAsStale,
} from './supersession.ts';

// Conflict Detection
export { detectConflicts, hasConflicts } from './conflictDetection.ts';

// Relevance Retrieval
export {
  retrieveRelevantMemories,
  getRelevanceTagsForIntent,
  buildRetrievalQuery,
} from './relevanceRetrieval.ts';

// Client-Safe
export {
  filterMemoriesForClient,
  isMemoryClientSafe,
  toClientSafeMemory,
  getExcludedInternalCategories,
  shouldEnforceClientSafe,
} from './clientSafe.ts';

// Audit Trail
export {
  createProposalAuditEntry,
  createConfirmationAuditEntry,
  createRejectionAuditEntry,
  createSupersessionAuditEntry,
  createRetrievalAuditEntry,
  createExpirationAuditEntry,
} from './auditTrail.ts';