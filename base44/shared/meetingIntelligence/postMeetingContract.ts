/**
 * meetingIntelligence/postMeetingContract.ts — Phase 15.3
 *
 * Post-Meeting Contract — FRAMEWORK ONLY.
 *
 * Do NOT implement post-meeting intelligence.
 *
 * Define:
 *   • What should be remembered
 *   • Meeting outcomes
 *   • Follow-up items
 *   • Advisor commitments
 *   • Owner commitments
 *   • Future Business Memory relationship
 *   • Future Timeline relationship
 *   • Extension points
 *
 * Constitution Compliance:
 *   Article I — One Truth (post-meeting memory does not duplicate canonical facts)
 *   Article II — Single Ownership (post-meeting owns "meeting outcomes", not facts)
 *   Article VII — Extension First (post-meeting is an extension point, not a parallel system)
 */

import type { PostMeetingContract } from './types.ts';

/**
 * The Post-Meeting Contract.
 *
 * This is a FRAMEWORK. implemented: false.
 * Future phases will implement post-meeting intelligence by EXTENDING this contract.
 */
export const POST_MEETING_CONTRACT: PostMeetingContract = {
  implemented: false,

  // ── What Should Be Remembered ──────────────────────────────────────────────
  what_should_be_remembered: [
    {
      name: 'Meeting Decisions',
      what_to_remember: 'Decisions made during the meeting — approved add-backs, selected strategies, confirmed priorities',
      retention: 'Permanent (aligned with valuation immutability — Article XII)',
      relationship_to_business_memory: 'Decisions are stored as Business Memory "Advisor Decisions" — referenced by future Meeting Briefs',
    },
    {
      name: 'Action Items',
      what_to_remember: 'Tasks assigned during the meeting — owner, deadline, context',
      retention: 'Until completed + 90 days (for audit trail)',
      relationship_to_business_memory: 'Action items feed the Sprint system and Business Memory "Execution History"',
    },
    {
      name: 'Follow-Up Commitments',
      what_to_remember: 'What the advisor and owner committed to do next, with deadlines',
      retention: 'Until completed + 90 days',
      relationship_to_business_memory: 'Commitments feed Business Memory "Meeting Intelligence" category',
    },
    {
      name: 'Discussion Highlights',
      what_to_remember: 'Key topics discussed, questions raised, conclusions reached',
      retention: '90 days (conversation relevance decays)',
      relationship_to_business_memory: 'Highlights feed Business Memory "Conversation Context" category',
    },
    {
      name: 'Open Questions',
      what_to_remember: 'Questions that were raised but not resolved — for future meetings',
      retention: 'Until resolved or 180 days',
      relationship_to_business_memory: 'Open questions feed future Meeting Briefs as "Suggested Questions"',
    },
  ],

  // ── Meeting Outcomes ──────────────────────────────────────────────────────
  meeting_outcomes: [
    'Decisions made (with rationale)',
    'Action items assigned (with owner and deadline)',
    'Follow-up commitments (advisor and owner)',
    'Open questions for future meetings',
    'Next meeting date and intent',
  ],

  // ── Follow-Up Items ────────────────────────────────────────────────────────
  follow_up_items: [
    'Advisor follow-up: complete assigned tasks before next meeting',
    'Owner follow-up: provide requested documents or confirmations',
    'System follow-up: update verification queue with meeting decisions',
    'System follow-up: update sprint with new action items',
    'System follow-up: update Business Memory with meeting outcomes',
  ],

  // ── Advisor Commitments ───────────────────────────────────────────────────
  advisor_commitments: [
    'Review pending verification items before next meeting',
    'Prepare valuation adjustments based on meeting decisions',
    'Follow up on outstanding client requests',
    'Update growth plan priorities based on discussion',
  ],

  // ── Owner Commitments ─────────────────────────────────────────────────────
  owner_commitments: [
    'Provide requested documents by agreed deadline',
    'Confirm information requested during meeting',
    'Complete assigned action items',
    'Prepare for next meeting topic',
  ],

  // ── Business Memory Relationship ──────────────────────────────────────────
  business_memory_relationship: `Post-Meeting Intelligence feeds Business Memory.
Meeting decisions, action items, and follow-up commitments are stored as Business Memory
entries in the "Meeting Intelligence" and "Advisor Decisions" categories.

Business Memory references the Meeting Brief by ID. It does not duplicate the brief.
Future Meeting Briefs read from Business Memory to understand prior meeting context.

This is a one-way feed: Meeting → Memory. Memory does not modify the Meeting Brief.
The Meeting Brief remains an immutable record of what was prepared for the meeting.`,

  // ── Timeline Relationship ─────────────────────────────────────────────────
  timeline_relationship: `Post-Meeting Intelligence references the Business Timeline.
Meeting outcomes that cause business state changes (e.g., approved add-backs) create
new Timeline entries through the existing CBSS event system.

Post-Meeting Intelligence does NOT create timeline entries directly.
It triggers the existing certified systems (valuation service, verification queue)
which then create timeline events through the normal propagation flow.

This ensures the Timeline remains the single immutable record of business state changes.`,

  // ── Extension Points ──────────────────────────────────────────────────────
  extension_points: [
    'Meeting Replay™ — replay past meetings for context',
    'Meeting Transcripts™ — transcribe meeting audio for searchability',
    'Action Item Intelligence™ — track and analyze action item completion',
    'Automatic Follow-Up™ — send reminders for commitments before deadlines',
    'Predictive Meeting Preparation™ — predict meeting topics based on business state',
    'Business Memory™ — store meeting outcomes as persistent memory',
    'Business DNA™ — extract patterns from meeting history',
    'Business Twin™ — simulate meeting outcomes before they happen',
  ],
};