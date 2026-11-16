/**
 * meetingIntelligence/types.ts — Phase 15.3
 *
 * Type definitions for the Meeting Intelligence Foundation.
 *
 * Meeting Intelligence NEVER owns business truth.
 * Meeting Intelligence NEVER performs calculations.
 * Meeting Intelligence NEVER creates another recommendation engine.
 * Meeting Intelligence ONLY synthesizes existing certified outputs into a
 * meeting-specific preparation layer.
 *
 * The Two-Minute Rule: an advisor must be able to answer
 * "What changed? What deserves discussion? What decisions must be made?
 *  What should I celebrate? What should I ask?"
 * within two minutes of opening the Meeting Brief.
 *
 * Constitution Compliance: Articles I-XIII (no duplication, no bypass, no governance violation)
 */

// ── Trust Hierarchy (reused from Living Intelligence) ───────────────────────
export enum MeetingConfidenceSource {
  VERIFIED_CANONICAL_FACT = 'verified_canonical_fact',
  CERTIFIED_ENGINE_OUTPUT = 'certified_engine_output',
  ADVISOR_REVIEWED_CONCLUSION = 'advisor_reviewed_conclusion',
  MEETING_SYNTHESIS = 'meeting_synthesis',
  // SPECULATION is NOT ALLOWED — Meeting Intelligence never speculates
}

// ── Meeting Intent ───────────────────────────────────────────────────────────
// The intent determines priority, context focus, talking points, questions, and decision focus.
// Framework only — no AI reasoning.
export type MeetingIntentType =
  | 'quarterly_review'
  | 'monthly_review'
  | 'tax_planning'
  | 'valuation_review'
  | 'exit_planning'
  | 'annual_planning'
  | 'growth_planning'
  | 'cash_flow_review'
  | 'operations_review'
  | 'acquisition'
  | 'due_diligence'
  | 'board_meeting'
  | 'succession_planning'
  | 'discovery_call'
  | 'strategy_session'
  | 'internal_advisor_review'
  | 'custom';

export interface MeetingIntentConfig {
  type: MeetingIntentType;
  display_name: string;
  // What priorities to emphasize in the brief
  priority_focus: MeetingPriorityFocus[];
  // Which certified systems to emphasize
  context_emphasis: MeetingContextEmphasis[];
  // Default decision focus areas
  decision_focus: string[];
  // Typical cadence (for time-since-last-meeting context)
  typical_cadence: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual' | 'ad_hoc';
  // Whether this intent is advisor-internal only
  is_internal: boolean;
}

export type MeetingPriorityFocus =
  | 'financial_performance'
  | 'valuation_progress'
  | 'tax_strategy'
  | 'growth_initiatives'
  | 'operational_health'
  | 'exit_readiness'
  | 'cash_management'
  | 'risk_mitigation'
  | 'execution_progress'
  | 'document_readiness'
  | 'advisor_collaboration'
  | 'discovery';

export type MeetingContextEmphasis =
  | 'executive_context'
  | 'business_timeline'
  | 'canonical_facts'
  | 'growth_plan'
  | 'business_valuation'
  | 'assessments'
  | 'executive_brief'
  | 'documents'
  | 'verification_queue'
  | 'sprint_progress'
  | 'advisor_assignments'
  | 'client_requests';

// ── Meeting Context ──────────────────────────────────────────────────────────
// A reusable object that holds everything the coordinator needs to synthesize a brief.
// Everything references existing certified owners — nothing is recalculated.
export interface MeetingContext {
  meeting_id: string;
  business_id: string;
  profile_id: string;

  // Meeting identity
  intent: MeetingIntentType;
  intent_config: MeetingIntentConfig;
  scheduled_at: string | null;
  previous_meeting_date: string | null;
  time_since_previous_meeting: string | null; // human-readable (e.g., "30 days")

  // Participants
  advisor: MeetingParticipant | null;
  participants: MeetingParticipant[];

  // Certified state (READ from existing engines — NOT recalculated)
  major_business_changes: MeetingChangeReference[];
  completed_initiatives: MeetingInitiativeReference[];
  outstanding_requests: MeetingRequestReference[];
  pending_reviews: MeetingReviewReference[];
  pending_approvals: MeetingApprovalReference[];
  publication_status: MeetingPublicationStatus;
  current_priorities: MeetingPriorityReference[];
  risks: MeetingRiskReference[];
  opportunities: MeetingOpportunityReference[];
  business_confidence: MeetingConfidenceSummary;
  business_momentum: MeetingMomentumSummary;
  recent_milestones: MeetingMilestoneReference[];

  _meta: MeetingContextMeta;
}

export interface MeetingParticipant {
  id: string;
  name: string;
  role: string;
  is_advisor: boolean;
  is_owner: boolean;
}

export interface MeetingChangeReference {
  id: string;
  summary: string;
  certified_owner: string;
  timestamp: string;
  // Reference to the certified source (CBSS event, timeline entry, etc.)
  source_ref: string;
}

export interface MeetingInitiativeReference {
  id: string;
  title: string;
  status: string;
  certified_owner: string;
}

export interface MeetingRequestReference {
  id: string;
  title: string;
  request_type: 'document' | 'confirmation' | 'approval';
  status: string;
  certified_owner: string;
}

export interface MeetingReviewReference {
  id: string;
  title: string;
  review_type: string;
  urgency: 'immediate' | 'soon' | 'routine';
  certified_owner: string;
}

export interface MeetingApprovalReference {
  id: string;
  title: string;
  approval_type: string;
  certified_owner: string;
}

export interface MeetingPublicationStatus {
  is_published: boolean;
  is_blocked: boolean;
  blocker_count: number;
  certified_owner: string;
}

export interface MeetingPriorityReference {
  id: string;
  title: string;
  priority: number;
  certified_owner: string;
}

export interface MeetingRiskReference {
  id: string;
  headline: string;
  severity: 'high' | 'medium' | 'low';
  certified_owner: string;
}

export interface MeetingOpportunityReference {
  id: string;
  headline: string;
  potential_impact: string;
  certified_owner: string;
}

export interface MeetingConfidenceSummary {
  overall_confidence: number | null;
  source: string;
  summary: string;
}

export interface MeetingMomentumSummary {
  direction: string;
  summary: string;
  certified_owner: string;
}

export interface MeetingMilestoneReference {
  id: string;
  title: string;
  completed_at: string;
  certified_owner: string;
}

export interface MeetingContextMeta {
  sources_used: string[];
  constitution_compliant: true;
  no_calculations_performed: true;
  no_duplicate_intelligence: true;
}

// ── Meeting Brief ─────────────────────────────────────────────────────────────
// The reusable Meeting Brief model. Maximum reading time: two minutes.
// This is the CONTRACT — no UI, no text generation yet.
export interface MeetingBrief {
  meeting_id: string;
  business_id: string;
  intent: MeetingIntentType;
  generated_at: string;

  // ── Two-Minute Sections ──
  meeting_summary: MeetingSummary;
  since_last_meeting: SinceLastMeeting;
  celebrate: CelebrateSection;
  discuss: DiscussSection;
  decisions_required: DecisionSection;
  suggested_questions: SuggestedQuestion[];
  open_risks: OpenRiskSection;
  owner_wins: OwnerWinsSection;
  advisor_notes: AdvisorNotesSection; // internal only — excluded from client brief
  client_safe_brief: ClientSafeBrief;

  // ── Meeting Timeline (reused from Business Timeline) ──
  meeting_timeline: MeetingTimelineSection;

  // ── Decision Moments ──
  decision_moments: DecisionMoment[];

  // ── Metadata ──
  _meta: MeetingBriefMeta;
}

export interface MeetingSummary {
  headline: string;
  one_line_context: string;
  meeting_intent_label: string;
  time_since_previous: string | null;
}

export interface SinceLastMeeting {
  completed_items: string[];
  changed_facts: string[];
  new_items: string[];
  blocked_items: string[];
}

export interface CelebrateSection {
  wins: CelebrateItem[];
  // Empty array is valid — silence passes certification
}

export interface CelebrateItem {
  headline: string;
  why_it_matters: string;
  certified_owner: string;
}

export interface DiscussSection {
  topics: DiscussTopic[];
  // Maximum 5 — clarity over completeness
}

export interface DiscussTopic {
  id: string;
  headline: string;
  why_it_deserves_discussion: string;
  supporting_evidence: string;
  certified_owner: string;
  priority: number;
}

export interface DecisionSection {
  decisions: DecisionItem[];
  // Empty array is valid — no decisions required
}

export interface DecisionItem {
  id: string;
  title: string;
  decision_type: string;
  context: string;
  certified_owner: string;
  action_url: string | null;
}

export interface OpenRiskSection {
  risks: OpenRiskItem[];
  // Maximum 3 — clarity over completeness
}

export interface OpenRiskItem {
  id: string;
  headline: string;
  severity: 'high' | 'medium' | 'low';
  certified_owner: string;
}

export interface OwnerWinsSection {
  wins: string[];
  // Owner-facing celebration — positive momentum, completed tasks, milestones
}

export interface AdvisorNotesSection {
  notes: AdvisorNote[];
  // Internal only — never exposed to client
}

export interface AdvisorNote {
  id: string;
  note: string;
  category: 'preparation' | 'risk' | 'opportunity' | 'follow_up';
  certified_owner: string;
}

// ── Client-Safe Brief ─────────────────────────────────────────────────────────
export interface ClientSafeBrief {
  meeting_summary: MeetingSummary;
  since_last_meeting: SinceLastMeeting;
  celebrate: CelebrateSection;
  discuss: DiscussSection;
  decisions_required: DecisionSection;
  suggested_questions: SuggestedQuestion[];
  open_risks: OpenRiskSection;
  owner_wins: OwnerWinsSection;
  meeting_timeline: MeetingTimelineSection;
  // NO advisor_notes — excluded
  _meta: {
    client_safe: true;
    excluded_internal_items: string[];
  };
}

// ── Suggested Questions ───────────────────────────────────────────────────────
export interface SuggestedQuestion {
  id: string;
  prompt: string;
  why_ask: string;
  evidence_references: QuestionEvidence[];
  intent_relevance: MeetingIntentType[];
  confidence_source: MeetingConfidenceSource;
}

export interface QuestionEvidence {
  source_name: string;
  source_type: 'canonical_fact' | 'engine_output' | 'assessment' | 'document' | 'timeline';
  source_id: string;
  certified_owner: string;
}

// ── Decision Moments ──────────────────────────────────────────────────────────
export interface DecisionMoment {
  id: string;
  decision_type: DecisionMomentType;
  title: string;
  description: string;
  certified_owner: string;
  action_url: string | null;
  // Metadata only — no workflow changes
}

export type DecisionMomentType =
  | 'approve_valuation_assumption'
  | 'request_documents'
  | 'finalize_add_back'
  | 'review_tax_strategy'
  | 'prioritize_growth_plan'
  | 'approve_publication'
  | 'complete_verification'
  | 'assign_advisor'
  | 'resolve_conflict'
  | 'approve_initiative'
  | 'review_assessment'
  | 'schedule_follow_up';

// ── Meeting Timeline (reuses Business Timeline) ──────────────────────────────
export interface MeetingTimelineSection {
  completed_since_last: TimelineEntryRef[];
  started: TimelineEntryRef[];
  blocked: TimelineEntryRef[];
  waiting_on_owner: TimelineEntryRef[];
  waiting_on_advisor: TimelineEntryRef[];
  waiting_on_documents: TimelineEntryRef[];
  waiting_on_verification: TimelineEntryRef[];
  waiting_on_publication: TimelineEntryRef[];
}

export interface TimelineEntryRef {
  id: string;
  title: string;
  status: string;
  timestamp: string;
  certified_owner: string;
}

// ── Advisor Mode ──────────────────────────────────────────────────────────────
// Advisor Mode changes presentation priorities. It does NOT change business truth.
export interface AdvisorModeConfig {
  emphasize: AdvisorModeEmphasis[];
  // Never changes calculations — only presentation
}

export type AdvisorModeEmphasis =
  | 'decision_support'
  | 'discussion_prompts'
  | 'risks'
  | 'evidence'
  | 'preparation';

// ── Post-Meeting Contract (Framework Only — No Implementation) ───────────────
export interface PostMeetingContract {
  implemented: false;
  what_should_be_remembered: PostMeetingMemoryCategory[];
  meeting_outcomes: string[];
  follow_up_items: string[];
  advisor_commitments: string[];
  owner_commitments: string[];
  business_memory_relationship: string;
  timeline_relationship: string;
  extension_points: string[];
}

export interface PostMeetingMemoryCategory {
  name: string;
  what_to_remember: string;
  retention: string;
  relationship_to_business_memory: string;
}

// ── Meeting Intelligence Input ────────────────────────────────────────────────
// The coordinator receives this input (all from certified engines) and synthesizes.
export interface MeetingIntelligenceInput {
  business_id: string;
  profile_id: string;
  meeting_id: string;
  intent: MeetingIntentType;

  // From Executive Context (Living Intelligence — read-only)
  executive_context: any | null;

  // From Business Timeline (CBSS — read-only)
  timeline: any[];

  // From Canonical Fact Resolver (read-only)
  canonical_facts: any | null;

  // From Growth Plan Engine (read-only)
  growth_initiatives: any[];

  // From Business Valuation (read-only)
  valuation_metadata: any | null;

  // From Assessments (read-only)
  assessment_results: any[];

  // From Executive Brief (read-only)
  executive_brief: any | null;

  // From Documents (read-only)
  documents: any[];

  // From Verification Queue (read-only)
  pending_reviews: any[];

  // From Advisor assignments (read-only)
  advisor_assignments: any[];

  // From Client requests (read-only)
  client_requests: any[];

  // From Sprint (read-only)
  sprint_data: any | null;

  // From Business Memory Contract (framework reference — read-only)
  business_memory_contract: any | null;

  // Meeting-specific
  scheduled_at: string | null;
  previous_meeting_date: string | null;
  advisor: MeetingParticipant | null;
  participants: MeetingParticipant[];
}

// ── Extension Points (Future Compatibility) ───────────────────────────────────
export interface MeetingIntelligenceExtensionPoints {
  business_memory: string;
  business_dna: string;
  business_twin: string;
  meeting_replay: string;
  meeting_transcripts: string;
  action_item_intelligence: string;
  automatic_follow_up: string;
  predictive_meeting_preparation: string;
}

// ── Meeting Brief Metadata ────────────────────────────────────────────────────
export interface MeetingBriefMeta {
  sources_used: string[];
  reading_time_estimate: string; // "~2 minutes"
  constitution_compliant: true;
  no_calculations_performed: true;
  no_duplicate_intelligence: true;
  no_new_recommendation_engine: true;
  reused_existing_certified_outputs: true;
}