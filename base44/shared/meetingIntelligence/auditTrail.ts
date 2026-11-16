/**
 * meetingIntelligence/auditTrail.ts — Phase 15.4
 *
 * Audit Trail — records every outcome action for governance.
 *
 * Every approved outcome must retain:
 *   - meeting context
 *   - proposing actor/system
 *   - approving advisor
 *   - destination
 *   - timestamp
 *   - original proposal
 *   - approved version
 *   - source evidence
 *
 * Reuses existing audit systems where possible.
 * Does NOT create a second audit architecture.
 *
 * Constitution Compliance:
 *   Article IV — Explainability (every action is auditable)
 *   Article V — Advisor Governance (advisor identity recorded)
 */

import type {
  PostMeetingOutcome,
  AuditEntry,
  PostMeetingCloseout,
} from './postMeetingTypes.ts';

/**
 * Create an audit entry for a proposed outcome.
 */
export function createProposalAuditEntry(outcome: PostMeetingOutcome): AuditEntry {
  return {
    audit_id: `audit-${outcome.outcome_id}-proposed-${Date.now()}`,
    outcome_id: outcome.outcome_id,
    action: 'proposed',
    proposing_actor: outcome.supporting_evidence[0]?.source_name || 'meeting_intelligence',
    proposing_system: 'post_meeting_intelligence',
    approving_advisor: null,
    destination: outcome.destination_system,
    timestamp: new Date().toISOString(),
    original_proposal: JSON.stringify({
      title: outcome.title,
      description: outcome.description,
      type: outcome.type,
      destination: outcome.destination_system,
    }),
    approved_version: null,
    source_evidence: outcome.supporting_evidence.map(e => `${e.source_name}:${e.source_id}`),
  };
}

/**
 * Create an audit entry for an approved outcome.
 */
export function createApprovalAuditEntry(
  outcome: PostMeetingOutcome,
  advisorId: string,
  wasEdited: boolean,
): AuditEntry {
  return {
    audit_id: `audit-${outcome.outcome_id}-approved-${Date.now()}`,
    outcome_id: outcome.outcome_id,
    action: wasEdited ? 'edited' : 'approved',
    proposing_actor: outcome.supporting_evidence[0]?.source_name || 'meeting_intelligence',
    proposing_system: 'post_meeting_intelligence',
    approving_advisor: advisorId,
    destination: outcome.destination_system,
    timestamp: new Date().toISOString(),
    original_proposal: JSON.stringify({
      title: outcome.title,
      description: outcome.description,
      type: outcome.type,
      destination: outcome.destination_system,
    }),
    approved_version: outcome.approved_version
      ? JSON.stringify({
          title: outcome.approved_version.title,
          description: outcome.approved_version.description,
        })
      : null,
    source_evidence: outcome.supporting_evidence.map(e => `${e.source_name}:${e.source_id}`),
  };
}

/**
 * Create an audit entry for a dismissed outcome.
 */
export function createDismissalAuditEntry(
  outcome: PostMeetingOutcome,
  advisorId: string,
): AuditEntry {
  return {
    audit_id: `audit-${outcome.outcome_id}-dismissed-${Date.now()}`,
    outcome_id: outcome.outcome_id,
    action: 'dismissed',
    proposing_actor: outcome.supporting_evidence[0]?.source_name || 'meeting_intelligence',
    proposing_system: 'post_meeting_intelligence',
    approving_advisor: advisorId,
    destination: null,
    timestamp: new Date().toISOString(),
    original_proposal: JSON.stringify({
      title: outcome.title,
      type: outcome.type,
    }),
    approved_version: null,
    source_evidence: outcome.supporting_evidence.map(e => `${e.source_name}:${e.source_id}`),
  };
}

/**
 * Create an audit entry for a deferred outcome.
 */
export function createDeferAuditEntry(
  outcome: PostMeetingOutcome,
  advisorId: string,
): AuditEntry {
  return {
    audit_id: `audit-${outcome.outcome_id}-deferred-${Date.now()}`,
    outcome_id: outcome.outcome_id,
    action: 'deferred',
    proposing_actor: outcome.supporting_evidence[0]?.source_name || 'meeting_intelligence',
    proposing_system: 'post_meeting_intelligence',
    approving_advisor: advisorId,
    destination: null,
    timestamp: new Date().toISOString(),
    original_proposal: JSON.stringify({
      title: outcome.title,
      type: outcome.type,
    }),
    approved_version: null,
    source_evidence: outcome.supporting_evidence.map(e => `${e.source_name}:${e.source_id}`),
  };
}

/**
 * Create an audit entry for an executed outcome.
 */
export function createExecutionAuditEntry(
  outcome: PostMeetingOutcome,
  advisorId: string,
  destinationResult: any,
): AuditEntry {
  return {
    audit_id: `audit-${outcome.outcome_id}-executed-${Date.now()}`,
    outcome_id: outcome.outcome_id,
    action: 'executed',
    proposing_actor: 'post_meeting_intelligence',
    proposing_system: 'post_meeting_intelligence',
    approving_advisor: advisorId,
    destination: outcome.destination_system,
    timestamp: new Date().toISOString(),
    original_proposal: JSON.stringify({
      title: outcome.title,
      type: outcome.type,
    }),
    approved_version: JSON.stringify({
      title: outcome.title,
      description: outcome.description,
      destination: outcome.destination_system,
      result: destinationResult,
    }),
    source_evidence: outcome.supporting_evidence.map(e => `${e.source_name}:${e.source_id}`),
  };
}

/**
 * Initialize audit trail for a closeout with proposal entries.
 */
export function initializeAuditTrail(outcomes: PostMeetingOutcome[]): AuditEntry[] {
  return outcomes.map(o => createProposalAuditEntry(o));
}