/**
 * statusModel — single source of truth for valuation lifecycle statuses.
 *
 * Status values match the migration CHECK constraint exactly:
 *   not_started | in_progress | needs_review | advisor_approved | published | archived
 *
 * All UI labels, transitions, and validations must use this module.
 * Do not scatter status strings or translations across components.
 */

export const VALUATION_STATUSES = [
  'not_started',
  'in_progress',
  'needs_review',
  'advisor_approved',
  'published',
  'archived',
];

export const STATUS_LABELS = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  needs_review: 'Needs Review',
  advisor_approved: 'Advisor Approved',
  published: 'Published',
  archived: 'Archived',
};

export const STATUS_COLORS = {
  not_started: { color: '#6B7280', bg: 'rgba(107,114,128,0.08)' },
  in_progress: { color: '#D4A853', bg: 'rgba(212,168,83,0.08)' },
  needs_review: { color: '#F59E0B', bg: 'rgba(245,158,11,0.08)' },
  advisor_approved: { color: '#10B981', bg: 'rgba(16,185,129,0.08)' },
  published: { color: '#059669', bg: 'rgba(5,150,105,0.1)' },
  archived: { color: '#9CA3AF', bg: 'rgba(156,163,175,0.08)' },
};

/**
 * Valid status transitions.
 * Keys are current status; values are allowed next statuses.
 * `published` is only reachable via publishValuation (not updateValuationStatus).
 * `archived` is only reachable via archiveValuation (super_admin only).
 * `archived → advisor_approved` is only reachable via restoreArchivedValuation.
 */
export const VALID_TRANSITIONS = {
  not_started: ['in_progress'],
  in_progress: ['needs_review'],
  needs_review: ['advisor_approved', 'in_progress'],
  advisor_approved: ['needs_review'], // published is via publishValuation only
  published: [], // archived is via archiveValuation only
  archived: [], // restore is via restoreArchivedValuation only
};

/**
 * Validate a status transition requested via updateValuationStatus.
 * Does NOT govern publish/archive/restore (those have their own actions).
 */
export function isValidTransition(currentStatus, newStatus) {
  const allowed = VALID_TRANSITIONS[currentStatus] || [];
  return allowed.includes(newStatus);
}

/**
 * Normalize a status string from the backend to a known value.
 * Maps legacy/incorrect values to the canonical migration values.
 */
export function normalizeStatus(raw) {
  if (!raw) return 'not_started';
  if (VALUATION_STATUSES.includes(raw)) return raw;
  // Legacy mappings
  if (raw === 'ready_to_publish') return 'advisor_approved';
  if (raw === 'complete') return 'published';
  return 'not_started';
}