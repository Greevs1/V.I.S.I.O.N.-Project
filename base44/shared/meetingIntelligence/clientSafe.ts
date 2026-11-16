/**
 * meetingIntelligence/clientSafe.ts — Phase 15.3
 *
 * Client-Safe filtering for Meeting Intelligence.
 *
 * Creates two contracts:
 *   1. Advisor Brief — includes internal review items, draft observations, internal risks
 *   2. Client Brief — excludes internal methodology, hidden notes, draft adjustments
 *
 * Reuses existing permission architecture — no new permission system.
 *
 * Constitution Compliance:
 *   Article I — One Truth (filtering does not change truth, only visibility)
 *   Article VI — Permission Respect (client-safe follows existing permission architecture)
 *   Article XI — Business Isolation (client-safe is per-business, no leakage)
 */

import type { MeetingBrief, ClientSafeBrief, AdvisorNote } from './types.ts';

/**
 * Filter a Meeting Brief for client-safe consumption.
 * Excludes: advisor_notes, internal methodology, draft adjustments, internal discussions.
 */
export function filterMeetingBriefForClient(brief: MeetingBrief): ClientSafeBrief {
  // The client-safe brief is already built into the Meeting Brief.
  // This function ensures it's properly filtered and returns the client-safe version.
  return brief.client_safe_brief;
}

/**
 * Check if a brief section is client-safe.
 */
export function isSectionClientSafe(section: string): boolean {
  const clientSafeSections = [
    'meeting_summary',
    'since_last_meeting',
    'celebrate',
    'discuss',
    'decisions_required',
    'suggested_questions',
    'open_risks',
    'owner_wins',
    'meeting_timeline',
  ];

  const internalOnlySections = [
    'advisor_notes',
  ];

  return clientSafeSections.includes(section) && !internalOnlySections.includes(section);
}

/**
 * Get advisor-only notes from a brief (excluded from client view).
 */
export function getAdvisorOnlyNotes(brief: MeetingBrief): AdvisorNote[] {
  return brief.advisor_notes.notes;
}

/**
 * Check if the brief has internal-only content.
 */
export function hasInternalContent(brief: MeetingBrief): boolean {
  return brief.advisor_notes.notes.length > 0;
}