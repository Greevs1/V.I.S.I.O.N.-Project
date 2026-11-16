/**
 * meetingIntelligence/coordinator.ts — Phase 15.3
 *
 * The Meeting Intelligence Coordinator.
 *
 * The Coordinator is NOT an engine.
 * It is NOT an orchestrator.
 * It is a SYNTHESIS LAYER.
 *
 * It observes certified outputs and builds meeting-specific preparation.
 *
 * It NEVER owns business truth.
 * It NEVER performs calculations.
 * It NEVER creates another recommendation engine.
 * It NEVER synchronizes systems.
 * It NEVER bypasses governance.
 *
 * It ONLY composes existing intelligence into a Meeting Brief.
 *
 * The Two-Minute Rule: an advisor must be able to answer
 * "What changed? What deserves discussion? What decisions must be made?
 *  What should I celebrate? What should I ask?"
 * within two minutes of the coordinator's output.
 *
 * Constitution Compliance:
 *   Article I — One Truth (reads from canonical facts, does not create truth)
 *   Article II — Single Ownership (does not own any business concept)
 *   Article III — No Duplicate Intelligence (synthesizes, does not duplicate)
 *   Article IV — Explainability (every output carries confidence and lineage)
 *   Article V — Advisor Governance (prepares, does not decide)
 *   Article VIII — Canonical First (reads canonical facts first)
 *   Article XIII — Constitution Supremacy (this coordinator is a new subsystem, registered)
 */

import type {
  MeetingBrief,
  MeetingContext,
  MeetingIntelligenceInput,
} from './types.ts';
import { buildMeetingContext } from './meetingContext.ts';
import { buildMeetingBrief } from './meetingBrief.ts';
import { applyAdvisorMode } from './advisorMode.ts';

/**
 * Build the Meeting Intelligence — the single reusable function that
 * synthesizes a Meeting Brief from certified inputs.
 *
 * This is the ONLY public entry point for Meeting Intelligence.
 * All synthesis flows through this coordinator.
 */
export function buildMeetingIntelligence(input: MeetingIntelligenceInput): MeetingBrief {
  // ── Step 1: Build Meeting Context (READ from certified engines) ───────────
  const context: MeetingContext = buildMeetingContext(input);

  // ── Step 2: Build Meeting Brief (SYNTHESIS from context) ──────────────────
  const brief: MeetingBrief = buildMeetingBrief(context, input);

  // ── Step 3: Apply Advisor Mode (presentation priorities only) ────────────
  const advisorModeBrief = applyAdvisorMode(brief);

  return advisorModeBrief;
}

// ── Re-export sub-modules for direct access if needed ────────────────────────
export { buildMeetingContext } from './meetingContext.ts';
export { buildMeetingBrief } from './meetingBrief.ts';
export { buildSuggestedQuestions } from './suggestedQuestions.ts';
export { identifyDecisionMoments } from './decisionMoments.ts';
export { applyAdvisorMode, DEFAULT_ADVISOR_MODE } from './advisorMode.ts';
export { filterMeetingBriefForClient } from './clientSafe.ts';
export { POST_MEETING_CONTRACT } from './postMeetingContract.ts';
export { MEETING_INTENTS, getMeetingIntentConfig, isInternalIntent, getIntentDisplayName } from './meetingIntent.ts';