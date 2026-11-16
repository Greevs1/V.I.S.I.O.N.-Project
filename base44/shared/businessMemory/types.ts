/**
 * businessMemory/types.ts — Phase 15.5
 *
 * Business Memory Record Contract — Type definitions.
 *
 * Business Memory is NOT:
 *   - chat history (Galileo owns that)
 *   - an audit log (existing audit owns that)
 *   - another timeline (CBSS owns that)
 *   - another notes system (ClientNote owns that)
 *   - another canonical fact store (Canonical Fact Registry owns that)
 *   - another recommendation engine (BIE owns that)
 *
 * Business Memory exists to preserve durable business context that should
 * influence future executive understanding without confusing memory with
 * current truth.
 *
 * Constitution Compliance:
 *   Article I — One Truth (memory references, does not duplicate canonical facts)
 *   Article II — Single Ownership (memory owns "durable context", not facts)
 *   Article III — No Duplicate Intelligence (memory references, not copies)
 *   Article VII — Extension First (memory is an extension point, not a parallel system)
 */

// ── Memory Categories ──────────────────────────────────────────────────────────
export type MemoryCategory =
  | 'strategic_decision'
  | 'long_term_objective'
  | 'owner_preference'
  | 'advisor_decision'
  | 'major_commitment'
  | 'material_business_event'
  | 'leadership_change'
  | 'operating_philosophy'
  | 'transaction_intent'
  | 'risk_acceptance'
  | 'capital_allocation_decision'
  | 'strategic_constraint';

// ── Memory Importance ──────────────────────────────────────────────────────────
// Importance affects future retrieval priority, NOT urgency.
// Something may be strategically important but not urgent.
export type MemoryImportance = 'critical' | 'strategic' | 'useful' | 'contextual';

// ── Memory Status ──────────────────────────────────────────────────────────────
export type MemoryStatus = 'candidate' | 'confirmed' | 'superseded' | 'expired' | 'rejected';

// ── Current Relevance ──────────────────────────────────────────────────────────
export type CurrentRelevance = 'current' | 'historical' | 'stale' | 'expired';

// ── Memory Source Type ──────────────────────────────────────────────────────────
export type MemorySourceType =
  | 'post_meeting_outcome'
  | 'advisor_decision'
  | 'growth_plan_milestone'
  | 'valuation_publication'
  | 'verification_resolution'
  | 'owner_objective'
  | 'business_structure_change'
  | 'advisor_capture';

// ── Created From ────────────────────────────────────────────────────────────────
export type CreatedFrom =
  | 'post_meeting_closeout'
  | 'advisor_capture'
  | 'growth_plan'
  | 'valuation'
  | 'verification'
  | 'manual';

// ── Expiration Behavior ────────────────────────────────────────────────────────
export type ExpirationBehavior =
  | 'retain_historically'
  | 'review_periodically'
  | 'expire_when_superseded'
  | 'expire_when_removed';

// ── Memory Reference ────────────────────────────────────────────────────────────
// Memory REFERENCES existing authoritative records. It does NOT copy them.
export interface MemorySourceReference {
  record_type: string;
  record_id: string;
  record_summary: string;
}

export interface MemoryEvidence {
  source_name: string;
  source_type: string;
  source_id: string;
}

// ── Business Memory Record ─────────────────────────────────────────────────────
export interface BusinessMemoryRecord {
  memory_id: string;
  business_id: string;
  category: MemoryCategory;
  title: string;
  summary: string;
  effective_date: string | null;
  importance: MemoryImportance;
  confidence: number;
  source_type: MemorySourceType;
  source_reference: MemorySourceReference | null;
  source_evidence: MemoryEvidence[];
  created_from: CreatedFrom;
  confirmed_by_profile_id: string | null;
  confirmed_by_name: string | null;
  confirmation_status: MemoryStatus;
  client_visible: boolean;
  superseded_by: string | null;
  supersedes: string | null;
  review_date: string | null;
  expiration_behavior: ExpirationBehavior;
  current_relevance: CurrentRelevance;
  memory_status: MemoryStatus;
  relevance_tags: string[];
  confirmed_at: string | null;
  rejected_at: string | null;
  rejected_by_profile_id: string | null;
  rejected_reason: string | null;
  superseded_at: string | null;
}

// ── Memory Candidate ───────────────────────────────────────────────────────────
// A candidate is a proposed memory that has NOT yet been confirmed.
// AI proposes. Advisor confirms. No automatic persistence.
export interface MemoryCandidate {
  candidate_id: string;
  business_id: string;
  category: MemoryCategory;
  title: string;
  summary: string;
  effective_date: string | null;
  importance: MemoryImportance;
  confidence: number;
  source_type: MemorySourceType;
  source_reference: MemorySourceReference | null;
  source_evidence: MemoryEvidence[];
  created_from: CreatedFrom;
  client_visible: boolean;
  relevance_tags: string[];
  durability_test: DurabilityTestResult;
  duplicate_check: MemoryDuplicateCheck;
  proposed_at: string;
  proposed_by_system: string;
}

// ── Durability Test ────────────────────────────────────────────────────────────
// Every candidate must pass: Is it durable? Is it meaningful? Is it supported?
// Will it improve future decisions? Does it belong somewhere else instead?
export interface DurabilityTestResult {
  passed: boolean;
  is_durable: boolean;
  is_meaningful: boolean;
  is_supported: boolean;
  improves_future_decisions: boolean;
  belongs_elsewhere: boolean;
  failure_reasons: string[];
}

// ── Duplicate Check ────────────────────────────────────────────────────────────
export interface MemoryDuplicateCheck {
  has_duplicate: boolean;
  duplicate_type: 'exact' | 'similar' | 'none';
  existing_memory_id: string | null;
  existing_memory_title: string | null;
  existing_memory_status: MemoryStatus | null;
  recommended_action: 'link_existing' | 'supersede_existing' | 'create_new' | 'reject';
}

// ── Retrieval Query ────────────────────────────────────────────────────────────
export interface MemoryRetrievalQuery {
  business_id: string;
  category?: MemoryCategory[];
  importance?: MemoryImportance[];
  relevance_tags?: string[];
  meeting_intent?: string;
  date_range?: { start: string; end: string };
  client_safe_only: boolean;
  include_historical: boolean;
  limit: number;
}

// ── Retrieval Result ───────────────────────────────────────────────────────────
export interface MemoryRetrievalResult {
  memories: BusinessMemoryRecord[];
  total: number;
  filtered_for_client_safe: number;
  query: MemoryRetrievalQuery;
}

// ── Conflict Result ────────────────────────────────────────────────────────────
export interface MemoryConflictResult {
  has_conflict: boolean;
  conflicting_memories: BusinessMemoryRecord[];
  conflict_description: string;
  recommended_review: string;
}

// ── Supersession Result ────────────────────────────────────────────────────────
export interface SupersessionResult {
  superseded_memory: BusinessMemoryRecord;
  new_memory: BusinessMemoryRecord;
  success: boolean;
}

// ── Client-Safe Memory ──────────────────────────────────────────────────────────
export interface ClientSafeMemory {
  memory_id: string;
  category: MemoryCategory;
  title: string;
  summary: string;
  effective_date: string | null;
  importance: MemoryImportance;
  relevance_tags: string[];
  source_summary: string;
}

// ── Memory Audit Entry ──────────────────────────────────────────────────────────
export interface MemoryAuditEntry {
  audit_id: string;
  memory_id: string;
  action: 'proposed' | 'confirmed' | 'rejected' | 'superseded' | 'expired' | 'updated' | 'retrieved';
  actor_profile_id: string | null;
  actor_system: string;
  timestamp: string;
  details: string;
  source_evidence: string[];
}

// ── Memory Boundaries ──────────────────────────────────────────────────────────
// Explicit boundaries between Memory and other systems.
export interface MemoryBoundaryDefinition {
  system: string;
  question_it_answers: string;
  example: string;
  relationship_to_memory: string;
}