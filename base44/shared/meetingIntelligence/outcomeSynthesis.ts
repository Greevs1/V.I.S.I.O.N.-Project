/**
 * meetingIntelligence/outcomeSynthesis.ts — Phase 15.4
 *
 * Outcome Synthesis — proposes outcomes from meeting context + advisor notes.
 *
 * This is NOT an LLM call. This is RULE-BASED synthesis from structured inputs:
 *   - Meeting Brief (Phase 15.3)
 *   - Advisor-entered meeting notes (free text)
 *   - Explicit decisions captured by advisor
 *   - Galileo conversation context (if available)
 *   - Booking metadata
 *
 * No transcripts. No audio. No inferred decisions from nonexistent sources.
 *
 * Constitution Compliance:
 *   Article I — One Truth (synthesis references, does not create truth)
 *   Article V — Advisor Governance (proposes only, never executes)
 *   Article VII — Extension First (extends existing systems)
 */

import type {
  PostMeetingOutcome,
  PostMeetingSynthesisInput,
  OutcomeType,
  OutcomeEvidence,
  MeetingContextRef,
  ProposedAction,
  MemoryCandidateClassification,
} from './postMeetingTypes.ts';
import { classifyRisk, OUTCOME_OWNERSHIP } from './outcomeOwnership.ts';
import { checkDuplicate } from './duplicateDetection.ts';

/**
 * Synthesize proposed outcomes from meeting context + advisor notes.
 *
 * This is the ONLY public entry point for outcome synthesis.
 * All synthesis flows through this function.
 *
 * Returns proposed outcomes — NEVER executes anything.
 */
export function synthesizeOutcomes(input: PostMeetingSynthesisInput): PostMeetingOutcome[] {
  const outcomes: PostMeetingOutcome[] = [];
  const meetingContext: MeetingContextRef = {
    meeting_id: input.meeting_id,
    business_id: input.business_id,
    profile_id: input.profile_id,
    intent: input.intent,
    meeting_date: input.meeting_date,
  };

  // ── Source 1: Explicit decisions captured by advisor ──────────────────────
  for (const decision of input.explicit_decisions || []) {
    outcomes.push(buildOutcome(
      'decision',
      decision.title,
      decision.description,
      decision.responsible_party || 'joint',
      decision.due_date,
      'Advisor-captured decision',
      [{ source_name: 'advisor_capture', source_type: 'advisor_note', source_id: meetingContext.meeting_id, certified_owner: 'advisor' }],
      90,
      meetingContext,
      input,
    ));
  }

  // ── Source 2: Meeting Brief decisions_required ──────────────────────────────
  const brief = input.meeting_brief;
  if (brief?.decisions_required?.decisions) {
    for (const d of brief.decisions_required.decisions.slice(0, 5)) {
      // Only if not already captured explicitly
      if (!outcomes.some(o => o.title === d.title)) {
        outcomes.push(buildOutcome(
          'decision',
          d.title,
          d.context || 'Decision required from meeting brief',
          'joint',
          null,
          'Meeting brief identified this decision as required',
          [{ source_name: 'meeting_brief', source_type: 'meeting_brief', source_id: d.id, certified_owner: 'meeting_intelligence' }],
          75,
          meetingContext,
          input,
        ));
      }
    }
  }

  // ── Source 3: Meeting Brief suggested questions → follow-up candidates ─────
  if (brief?.suggested_questions) {
    for (const q of brief.suggested_questions.slice(0, 3)) {
      outcomes.push(buildOutcome(
        'follow_up',
        `Follow up: ${q.prompt}`,
        q.why_ask || 'Suggested question from meeting brief',
        'advisor',
        null,
        'Meeting brief suggested question',
        [{ source_name: 'meeting_brief', source_type: 'meeting_brief', source_id: q.id, certified_owner: 'meeting_intelligence' }],
        60,
        meetingContext,
        input,
      ));
    }
  }

  // ── Source 4: Pending reviews → verification candidates ────────────────────
  if (brief?.advisor_notes?.notes) {
    for (const note of brief.advisor_notes.notes) {
      if (note.category === 'follow_up') {
        outcomes.push(buildOutcome(
          'follow_up',
          note.note,
          'Advisor follow-up identified in meeting brief',
          'advisor',
          null,
          'Meeting brief advisor note',
          [{ source_name: 'meeting_brief', source_type: 'meeting_brief', source_id: note.id, certified_owner: 'meeting_intelligence' }],
          65,
          meetingContext,
          input,
        ));
      }
    }
  }

  // ── Source 5: Outstanding requests → document request candidates ──────────
  if (brief?.meeting_timeline?.waiting_on_documents) {
    for (const doc of brief.meeting_timeline.waiting_on_documents.slice(0, 3)) {
      outcomes.push(buildOutcome(
        'document_request_candidate',
        `Request document: ${doc.title}`,
        'Document identified as needed in meeting brief',
        'owner',
        null,
        'Meeting brief identified missing document',
        [{ source_name: 'meeting_brief', source_type: 'meeting_brief', source_id: doc.id, certified_owner: 'verification_queue' }],
        70,
        meetingContext,
        input,
      ));
    }
  }

  // ── Source 6: Pending approvals → valuation review candidates ──────────────
  if (brief?.decisions_required?.decisions) {
    for (const d of brief.decisions_required.decisions) {
      if (d.decision_type === 'approve_valuation_assumption' || d.decision_type === 'approve_publication') {
        outcomes.push(buildOutcome(
          'valuation_review_candidate',
          d.title,
          d.context || 'Valuation review required',
          'advisor',
          null,
          'Meeting brief identified valuation review need',
          [{ source_name: 'meeting_brief', source_type: 'meeting_brief', source_id: d.id, certified_owner: 'valuation_service' }],
          85,
          meetingContext,
          input,
        ));
      }
    }
  }

  // ── Source 7: Growth plan opportunities → growth plan candidates ───────────
  if (brief?.discuss?.topics) {
    for (const topic of brief.discuss.topics.slice(0, 2)) {
      if (topic.headline && topic.headline.toLowerCase().includes('growth')) {
        outcomes.push(buildOutcome(
          'growth_plan_candidate',
          topic.headline,
          topic.why_it_deserves_discussion || 'Growth opportunity identified in meeting brief',
          'advisor',
          null,
          'Meeting brief discussion topic',
          [{ source_name: 'meeting_brief', source_type: 'meeting_brief', source_id: topic.id, certified_owner: 'growth_plan_engine' }],
          70,
          meetingContext,
          input,
        ));
      }
    }
  }

  // ── Source 8: Advisor-entered free-text notes → advisor note candidate ────
  if (input.advisor_notes && input.advisor_notes.trim().length > 0) {
    outcomes.push(buildOutcome(
      'advisor_note_candidate',
      'Meeting notes',
      input.advisor_notes.trim(),
      'advisor',
      null,
      'Advisor-entered meeting notes',
      [{ source_name: 'advisor_capture', source_type: 'advisor_note', source_id: meetingContext.meeting_id, certified_owner: 'advisor' }],
      95,
      meetingContext,
      input,
    ));
  }

  // ── Source 9: Galileo conversation context → follow-up candidates ──────────
  if (input.galileo_context?.messages) {
    const lastMessages = input.galileo_context.messages.slice(-3);
    for (const msg of lastMessages) {
      if (msg.role === 'assistant' && msg.content) {
        // Only if content suggests a follow-up (simple heuristic)
        const content = msg.content.toLowerCase();
        if (content.includes('follow up') || content.includes('next step') || content.includes('action item')) {
          outcomes.push(buildOutcome(
            'follow_up',
            'Galileo-suggested follow-up',
            msg.content.slice(0, 200),
            'advisor',
            null,
            'Galileo conversation context',
            [{ source_name: 'galileo_context', source_type: 'galileo_context', source_id: meetingContext.meeting_id, certified_owner: 'galileo' }],
            55,
            meetingContext,
            input,
          ));
        }
      }
    }
  }

  // ── Deduplicate outcomes by title ──────────────────────────────────────────
  const seen = new Set<string>();
  const deduped = outcomes.filter(o => {
    const key = o.title.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return deduped;
}

// ── Build Outcome Helper ──────────────────────────────────────────────────────
function buildOutcome(
  type: OutcomeType,
  title: string,
  description: string,
  responsible_party: 'advisor' | 'owner' | 'system' | 'joint',
  due_date: string | null,
  supporting_context: string,
  supporting_evidence: OutcomeEvidence[],
  confidence: number,
  meetingContext: MeetingContextRef,
  input: PostMeetingSynthesisInput,
): PostMeetingOutcome {
  const riskLevel = classifyRisk(type);
  const ownership = OUTCOME_OWNERSHIP[type];

  const proposedAction: ProposedAction = {
    action_type: ownership.write_action,
    destination_system: ownership.destination_system,
    payload: {
      title,
      description,
      responsible_party,
      due_date,
      business_id: meetingContext.business_id,
      profile_id: meetingContext.profile_id,
      meeting_id: meetingContext.meeting_id,
    },
    navigation_url: ownership.navigation_url,
  };

  const memoryClassification = classifyMemoryCandidate(type, title, description);

  const outcome: PostMeetingOutcome = {
    outcome_id: `outcome-${meetingContext.meeting_id}-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    title,
    description,
    responsible_party,
    due_date,
    supporting_context,
    supporting_evidence,
    confidence,
    destination_system: ownership.destination_system,
    proposed_action: proposedAction,
    client_visible: determineClientVisible(type, ownership.client_safe_boundary),
    requires_confirmation: true,
    risk_level: riskLevel,
    memory_candidate: memoryClassification.memory_candidate,
    memory_category: memoryClassification.memory_category,
    source_meeting_context: meetingContext,
    approval_status: 'pending',
    approved_version: null,
    approved_by: null,
    approved_at: null,
    destination_validation: {
      is_valid: false, // validated later
      destination_exists: true,
      belongs_to_business: true,
      has_write_permission: true,
      required_fields_known: !!(title && description),
      workflow_supports_action: true,
      issues: [],
    },
    duplicate_check: {
      has_duplicate: false,
      duplicate_type: 'none',
      existing_item_id: null,
      existing_item_title: null,
      existing_item_status: null,
      recommended_action: 'create_new',
    },
  };

  // Run duplicate detection
  outcome.duplicate_check = checkDuplicate(outcome, input);

  return outcome;
}

// ── Client-Visible Determination ──────────────────────────────────────────────
function determineClientVisible(type: OutcomeType, boundary: string): boolean {
  if (boundary === 'internal_only') return false;
  if (boundary === 'client_visible') return true;
  // For mixed boundaries, default to false (conservative)
  return type === 'owner_note_candidate' || type === 'commitment';
}

// ── Memory Candidate Classification ───────────────────────────────────────────
function classifyMemoryCandidate(
  type: OutcomeType,
  title: string,
  description: string,
): MemoryCandidateClassification {
  const memoryTypes: OutcomeType[] = [
    'decision',
    'commitment',
    'valuation_review_candidate',
    'growth_plan_candidate',
    'timeline_event_candidate',
  ];

  if (memoryTypes.includes(type)) {
    const category = type === 'decision' ? 'Advisor Decisions'
      : type === 'commitment' ? 'Meeting Intelligence'
      : type === 'valuation_review_candidate' ? 'Advisor Decisions'
      : type === 'growth_plan_candidate' ? 'Business Patterns'
      : 'Execution History';

    return {
      memory_candidate: true,
      memory_category: category,
      reason: `${type} outcomes are persistent professional records`,
    };
  }

  return {
    memory_candidate: false,
    memory_category: null,
    reason: 'Transactional outcome — not a memory candidate',
  };
}