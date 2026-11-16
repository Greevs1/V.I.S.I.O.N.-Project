/**
 * meetingIntelligence/postMeetingTypes.ts — Phase 15.4
 *
 * Post-Meeting Outcome Contract — Type definitions.
 *
 * This is the GOVERNED BRIDGE between a meeting and existing certified systems.
 * Post-Meeting Intelligence NEVER owns business truth.
 * Post-Meeting Intelligence NEVER creates a new table.
 * Post-Meeting Intelligence ONLY proposes outcomes that route to existing owners.
 *
 * Constitution Compliance:
 *   Article I — One Truth (outcomes reference canonical facts, do not duplicate)
 *   Article II — Single Ownership (post-meeting owns "outcome proposals", not facts)
 *   Article V — Advisor Governance (AI proposes, advisor confirms, existing systems execute)
 *   Article VII — Extension First (post-meeting extends existing systems, does not create parallel)
 */

// ── Outcome Types ──────────────────────────────────────────────────────────────
// Every outcome routes to an EXISTING owner. No new tables.
export type OutcomeType =
  | 'decision'
  | 'commitment'
  | 'follow_up'
  | 'information_request'
  | 'advisor_note_candidate'
  | 'owner_note_candidate'
  | 'verification_candidate'
  | 'growth_plan_candidate'
  | 'sprint_task_candidate'
  | 'roadmap_candidate'
  | 'valuation_review_candidate'
  | 'document_request_candidate'
  | 'timeline_event_candidate';

// ── Risk Classification ────────────────────────────────────────────────────────
export type OutcomeRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

// ── Approval Status ────────────────────────────────────────────────────────────
export type OutcomeApprovalStatus =
  | 'pending'
  | 'approved'
  | 'edited'
  | 'dismissed'
  | 'deferred';

// ── Destination System ────────────────────────────────────────────────────────
// Maps to EXISTING certified systems. No new destinations.
export type DestinationSystem =
  | 'advisor_notes'        // → ClientNote entity
  | 'sprint_tasks'          // → ninetyDaySprint function
  | 'growth_plan'           // → valuationService / growthPlanEngine
  | 'verification_queue'    // → verificationQueueService
  | 'document_requests'     // → supabaseVerificationData (client requests)
  | 'valuation_review'     // → valuationService (flag for review)
  | 'business_timeline'     // → CBSS events (via existing systems)
  | 'roadmap'               // → sprintRecommendations / sprintAdapter
  | 'needs_review';         // → cannot be safely resolved

// ── Post-Meeting Outcome ──────────────────────────────────────────────────────
export interface PostMeetingOutcome {
  outcome_id: string;
  type: OutcomeType;
  title: string;
  description: string;
  responsible_party: 'advisor' | 'owner' | 'system' | 'joint';
  due_date: string | null;
  supporting_context: string;
  supporting_evidence: OutcomeEvidence[];
  confidence: number; // 0-100
  destination_system: DestinationSystem;
  proposed_action: ProposedAction;
  client_visible: boolean;
  requires_confirmation: boolean;
  risk_level: OutcomeRiskLevel;
  memory_candidate: boolean;
  memory_category: string | null;
  source_meeting_context: MeetingContextRef;
  approval_status: OutcomeApprovalStatus;
  approved_version: PostMeetingOutcome | null; // if edited
  approved_by: string | null;
  approved_at: string | null;
  destination_validation: DestinationValidationResult;
  duplicate_check: DuplicateCheckResult;
}

export interface OutcomeEvidence {
  source_name: string;
  source_type: 'meeting_brief' | 'advisor_note' | 'galileo_context' | 'canonical_fact' | 'timeline' | 'assessment';
  source_id: string;
  certified_owner: string;
}

export interface MeetingContextRef {
  meeting_id: string;
  business_id: string;
  profile_id: string;
  intent: string;
  meeting_date: string | null;
}

// ── Proposed Action ────────────────────────────────────────────────────────────
export interface ProposedAction {
  action_type: string;
  destination_system: DestinationSystem;
  payload: Record<string, any>;
  navigation_url: string | null;
}

// ── Destination Validation ────────────────────────────────────────────────────
export interface DestinationValidationResult {
  is_valid: boolean;
  destination_exists: boolean;
  belongs_to_business: boolean;
  has_write_permission: boolean;
  required_fields_known: boolean;
  workflow_supports_action: boolean;
  issues: string[];
}

// ── Duplicate Detection ────────────────────────────────────────────────────────
export interface DuplicateCheckResult {
  has_duplicate: boolean;
  duplicate_type: 'exact' | 'similar' | 'none';
  existing_item_id: string | null;
  existing_item_title: string | null;
  existing_item_status: string | null;
  recommended_action: 'update_existing' | 'keep_separate' | 'dismiss' | 'create_new';
}

// ── Post-Meeting Closeout State ────────────────────────────────────────────────
export interface PostMeetingCloseout {
  closeout_id: string;
  meeting_context: MeetingContextRef;
  proposed_outcomes: PostMeetingOutcome[];
  approved_outcomes: PostMeetingOutcome[];
  dismissed_outcomes: PostMeetingOutcome[];
  deferred_outcomes: PostMeetingOutcome[];
  summary: CloseoutSummary;
  client_safe_followup: ClientSafeFollowup | null;
  audit_trail: AuditEntry[];
  _meta: CloseoutMeta;
}

export interface CloseoutSummary {
  total_proposed: number;
  total_approved: number;
  total_dismissed: number;
  total_deferred: number;
  by_risk: { LOW: number; MEDIUM: number; HIGH: number };
  by_destination: Record<string, number>;
  is_quiet: boolean;
  quiet_message: string | null;
}

export interface CloseoutMeta {
  sources_used: string[];
  constitution_compliant: true;
  no_calculations_performed: true;
  no_new_tables_created: true;
  no_transcript_ingestion: true;
  no_business_memory_persisted: true;
  advisor_remains_authoritative: true;
}

// ── Client-Safe Follow-Up ──────────────────────────────────────────────────────
export interface ClientSafeFollowup {
  decisions_made: string[];
  owner_action_items: string[];
  advisor_action_items: string[];
  documents_requested: string[];
  agreed_priorities: string[];
  next_meeting_focus: string | null;
  _meta: {
    client_safe: true;
    excluded_internal_items: string[];
  };
}

// ── Audit Entry ────────────────────────────────────────────────────────────────
export interface AuditEntry {
  audit_id: string;
  outcome_id: string;
  action: 'proposed' | 'approved' | 'edited' | 'dismissed' | 'deferred' | 'executed';
  proposing_actor: string;
  proposing_system: string;
  approving_advisor: string | null;
  destination: DestinationSystem | null;
  timestamp: string;
  original_proposal: string;
  approved_version: string | null;
  source_evidence: string[];
}

// ── Synthesis Input ────────────────────────────────────────────────────────────
export interface PostMeetingSynthesisInput {
  business_id: string;
  profile_id: string;
  meeting_id: string;
  intent: string;
  meeting_date: string | null;

  // From Meeting Brief (Phase 15.3 — read-only)
  meeting_brief: any | null;

  // Advisor-entered meeting notes (free text from closeout UI)
  advisor_notes: string;

  // Explicit decisions captured by advisor (structured)
  explicit_decisions: ExplicitDecision[];

  // Existing Galileo conversation context (if available)
  galileo_context: any | null;

  // Existing booking metadata
  booking_metadata: any | null;

  // For duplicate detection — existing items
  existing_growth_initiatives: any[];
  existing_sprint_tasks: any[];
  existing_verification_items: any[];
  existing_document_requests: any[];
  existing_roadmap_items: any[];
  existing_advisor_notes: any[];
}

export interface ExplicitDecision {
  decision_type: string;
  title: string;
  description: string;
  responsible_party: 'advisor' | 'owner' | 'joint';
  due_date: string | null;
}

// ── Memory Candidate Classification ────────────────────────────────────────────
export interface MemoryCandidateClassification {
  memory_candidate: boolean;
  memory_category: string | null;
  reason: string;
}