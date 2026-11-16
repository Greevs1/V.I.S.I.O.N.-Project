/**
 * meetingIntelligence/clientSafeCloseout.ts — Phase 15.4
 *
 * Client-Safe Closeout — filters outcomes for client-safe follow-up preview.
 *
 * Includes: decisions made, owner action items, advisor action items,
 *            documents requested, agreed priorities, next meeting focus
 *
 * Excludes: hidden risks, internal advisor notes, draft valuation assumptions,
 *           methodology debate, private scoring, internal confidence logic
 *
 * Constitution Compliance:
 *   Article VI — Client-Safe Boundary
 *   Article V — Advisor Governance (advisor controls what client sees)
 */

import type {
  PostMeetingOutcome,
  PostMeetingCloseout,
  ClientSafeFollowup,
} from './postMeetingTypes.ts';

/**
 * Build a client-safe follow-up preview from approved outcomes.
 * Only approved, client-visible outcomes are included.
 */
export function buildClientSafeFollowup(closeout: PostMeetingCloseout): ClientSafeFollowup | null {
  const approved = closeout.approved_outcomes.filter(o => o.client_visible);

  if (approved.length === 0) return null;

  const decisions_made = approved
    .filter(o => o.type === 'decision')
    .map(o => o.title);

  const owner_action_items = approved
    .filter(o => o.responsible_party === 'owner' && (o.type === 'follow_up' || o.type === 'commitment'))
    .map(o => o.title);

  const advisor_action_items = approved
    .filter(o => o.responsible_party === 'advisor' && (o.type === 'follow_up' || o.type === 'commitment'))
    .map(o => o.title);

  const documents_requested = approved
    .filter(o => o.type === 'document_request_candidate' || o.type === 'information_request')
    .map(o => o.title);

  const agreed_priorities = approved
    .filter(o => o.type === 'growth_plan_candidate' || o.type === 'roadmap_candidate')
    .map(o => o.title);

  return {
    decisions_made,
    owner_action_items,
    advisor_action_items,
    documents_requested,
    agreed_priorities,
    next_meeting_focus: null, // set by advisor if desired
    _meta: {
      client_safe: true,
      excluded_internal_items: [
        'advisor_notes',
        'verification_candidates',
        'valuation_review_candidates',
        'internal_confidence_logic',
        'methodology_debate',
        'private_scoring',
      ],
    },
  };
}

/**
 * Filter outcomes for client-safe display.
 * Excludes internal-only outcomes.
 */
export function filterOutcomesForClient(outcomes: PostMeetingOutcome[]): PostMeetingOutcome[] {
  return outcomes.filter(o => o.client_visible);
}

/**
 * Check if an outcome type is client-safe.
 */
export function isOutcomeClientSafe(outcome: PostMeetingOutcome): boolean {
  return outcome.client_visible;
}

/**
 * Get the list of excluded internal item types for client-safe preview.
 */
export function getExcludedInternalTypes(): string[] {
  return [
    'advisor_note_candidate',
    'verification_candidate',
    'valuation_review_candidate',
  ];
}