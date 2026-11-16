/**
 * meetingIntelligence/closeoutBuilder.ts — Phase 15.4
 *
 * Closeout Builder — assembles the full Post-Meeting Closeout state.
 *
 * This is the synthesis layer that combines:
 *   - Proposed outcomes (from outcomeSynthesis)
 *   - Destination validation
 *   - Duplicate detection results
 *   - Audit trail
 *   - Client-safe follow-up preview
 *   - Quiet state detection
 *
 * Constitution Compliance:
 *   Article I — One Truth (closeout references, does not create truth)
 *   Article V — Advisor Governance (proposes only, never executes)
 *   Article VII — Extension First (extends existing systems)
 */

import type {
  PostMeetingCloseout,
  PostMeetingOutcome,
  PostMeetingSynthesisInput,
  CloseoutSummary,
  CloseoutMeta,
} from './postMeetingTypes.ts';
import { synthesizeOutcomes } from './outcomeSynthesis.ts';
import { validateDestination } from './outcomeOwnership.ts';
import { buildClientSafeFollowup } from './clientSafeCloseout.ts';
import { initializeAuditTrail } from './auditTrail.ts';

/**
 * Build the full Post-Meeting Closeout state.
 *
 * This is the ONLY public entry point for closeout assembly.
 * Returns proposed outcomes — NEVER executes anything.
 */
export function buildPostMeetingCloseout(
  input: PostMeetingSynthesisInput,
  userRole: string,
): PostMeetingCloseout {
  // ── Step 1: Synthesize proposed outcomes ──────────────────────────────────
  const proposedOutcomes = synthesizeOutcomes(input);

  // ── Step 2: Validate destinations ──────────────────────────────────────────
  for (const outcome of proposedOutcomes) {
    outcome.destination_validation = validateDestination(
      outcome,
      userRole,
      input.business_id,
    );

    // If destination cannot be safely resolved, mark as needs_review
    if (!outcome.destination_validation.is_valid) {
      outcome.destination_system = 'needs_review';
      outcome.proposed_action.navigation_url = null;
    }
  }

  // ── Step 3: Initialize audit trail ──────────────────────────────────────────
  const auditTrail = initializeAuditTrail(proposedOutcomes);

  // ── Step 4: Build summary ──────────────────────────────────────────────────
  const summary = buildCloseoutSummary(proposedOutcomes);

  // ── Step 5: Build closeout state ───────────────────────────────────────────
  const closeout: PostMeetingCloseout = {
    closeout_id: `closeout-${input.meeting_id}-${Date.now()}`,
    meeting_context: {
      meeting_id: input.meeting_id,
      business_id: input.business_id,
      profile_id: input.profile_id,
      intent: input.intent,
      meeting_date: input.meeting_date,
    },
    proposed_outcomes: proposedOutcomes,
    approved_outcomes: [],
    dismissed_outcomes: [],
    deferred_outcomes: [],
    summary,
    client_safe_followup: null, // built after approvals
    audit_trail: auditTrail,
    _meta: buildCloseoutMeta(input),
  };

  return closeout;
}

/**
 * Build the closeout summary.
 */
function buildCloseoutSummary(outcomes: PostMeetingOutcome[]): CloseoutSummary {
  const byRisk = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  const byDestination: Record<string, number> = {};

  for (const o of outcomes) {
    byRisk[o.risk_level]++;
    byDestination[o.destination_system] = (byDestination[o.destination_system] || 0) + 1;
  }

  const isQuiet = outcomes.length === 0;

  return {
    total_proposed: outcomes.length,
    total_approved: 0,
    total_dismissed: 0,
    total_deferred: 0,
    by_risk: byRisk,
    by_destination: byDestination,
    is_quiet: isQuiet,
    quiet_message: isQuiet
      ? 'No material changes or follow-ups were identified.'
      : null,
  };
}

/**
 * Build the closeout metadata.
 */
function buildCloseoutMeta(input: PostMeetingSynthesisInput): CloseoutMeta {
  const sources: string[] = [];
  if (input.meeting_brief) sources.push('meeting_brief');
  if (input.advisor_notes) sources.push('advisor_notes');
  if (input.explicit_decisions?.length) sources.push('explicit_decisions');
  if (input.galileo_context) sources.push('galileo_context');
  if (input.booking_metadata) sources.push('booking_metadata');

  return {
    sources_used: sources,
    constitution_compliant: true,
    no_calculations_performed: true,
    no_new_tables_created: true,
    no_transcript_ingestion: true,
    no_business_memory_persisted: true,
    advisor_remains_authoritative: true,
  };
}

/**
 * Update closeout state after an approval/dismissal/defer action.
 */
export function updateCloseoutAfterAction(
  closeout: PostMeetingCloseout,
  outcome: PostMeetingOutcome,
  action: 'approved' | 'dismissed' | 'deferred',
): PostMeetingCloseout {
  // Remove from proposed
  const proposed = closeout.proposed_outcomes.filter(o => o.outcome_id !== outcome.outcome_id);

  // Add to appropriate list
  const approved = action === 'approved' ? [...closeout.approved_outcomes, outcome] : closeout.approved_outcomes;
  const dismissed = action === 'dismissed' ? [...closeout.dismissed_outcomes, outcome] : closeout.dismissed_outcomes;
  const deferred = action === 'deferred' ? [...closeout.deferred_outcomes, outcome] : closeout.deferred_outcomes;

  // Rebuild summary
  const byRisk = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  const byDestination: Record<string, number> = {};
  for (const o of approved) {
    byRisk[o.risk_level]++;
    byDestination[o.destination_system] = (byDestination[o.destination_system] || 0) + 1;
  }

  // Rebuild client-safe followup
  const updatedCloseout: PostMeetingCloseout = {
    ...closeout,
    proposed_outcomes: proposed,
    approved_outcomes: approved,
    dismissed_outcomes: dismissed,
    deferred_outcomes: deferred,
    summary: {
      ...closeout.summary,
      total_proposed: proposed.length,
      total_approved: approved.length,
      total_dismissed: dismissed.length,
      total_deferred: deferred.length,
      by_risk: byRisk,
      by_destination: byDestination,
      is_quiet: proposed.length === 0 && approved.length === 0,
      quiet_message: proposed.length === 0 && approved.length === 0
        ? 'No material changes or follow-ups were identified.'
        : null,
    },
  };

  // Rebuild client-safe followup from approved outcomes
  updatedCloseout.client_safe_followup = buildClientSafeFollowup(updatedCloseout);

  return updatedCloseout;
}