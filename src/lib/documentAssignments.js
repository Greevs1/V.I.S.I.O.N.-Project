/**
 * Document assignments — the client side of ONE backend contract.
 *
 * The Data Room's assign panel, the document viewer's collaboration block and
 * the "Assigned to Me" list all speak to `documentAssignments`. Nothing here
 * decides authorization: the backend resolves the active business, proves the
 * actor, proves the assignee is already authorized for that business, and only
 * then writes. This module is presentation vocabulary plus one invoke helper.
 */

import { base44 } from '@/api/base44Client';

/** The three purposes (§3). Deliberately not a workflow engine. */
export const ASSIGNMENT_TYPES = [
  { id: 'review', label: 'Review', hint: 'Please review this document.' },
  { id: 'action_required', label: 'Action Required', hint: 'Something needs to be done with this document.' },
  { id: 'fyi', label: 'FYI', hint: 'Keep this for reference.' },
];

export function assignmentTypeLabel(id) {
  return ASSIGNMENT_TYPES.find((t) => t.id === id)?.label || 'Review';
}

export function assignmentTypeShort(id) {
  if (id === 'action_required') return 'Action';
  if (id === 'fyi') return 'FYI';
  return 'Review';
}

export function assignmentStatusLabel(status) {
  if (status === 'completed') return 'Completed';
  if (status === 'removed') return 'Removed';
  return 'Open';
}

/**
 * FYI is informational: there is no reliable "seen" signal in this system, so
 * no completion is offered for it (§10 — do not fake read receipts).
 */
export function isCompletable(assignmentType) {
  return assignmentType === 'review' || assignmentType === 'action_required';
}

/** One invoke helper: the backend returns { error } for anything it refuses. */
export async function callDocumentAssignments(action, data = {}) {
  const res = await base44.functions.invoke('documentAssignments', { action, data });
  const payload = res?.data || {};
  if (payload.error) throw new Error(payload.error);
  return payload;
}

/**
 * The document list's restrained indicator (§6): "Assigned to Sarah +2".
 * Returns null when nobody has it, so ordinary rows stay untouched.
 */
export function assignmentIndicator(assignments = []) {
  const current = (assignments || []).filter((a) => a.status !== 'removed');
  if (current.length === 0) return null;
  const first = (current[0].assignee_name || '').split(' ')[0] || 'someone';
  return current.length === 1 ? `Assigned to ${first}` : `Assigned to ${first} +${current.length - 1}`;
}