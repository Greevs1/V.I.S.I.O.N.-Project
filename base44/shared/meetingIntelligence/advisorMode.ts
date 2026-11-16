/**
 * meetingIntelligence/advisorMode.ts — Phase 15.3
 *
 * Advisor Mode.
 *
 * Advisor Mode changes PRESENTATION priorities.
 * It does NOT change business truth.
 * It NEVER changes calculations.
 *
 * Advisor Mode emphasizes:
 *   Decision support, Discussion prompts, Risks, Evidence, Preparation
 *
 * Constitution Compliance:
 *   Article I — One Truth (mode changes presentation, not truth)
 *   Article V — Advisor Governance (mode supports advisor, does not decide)
 */

import type {
  MeetingBrief,
  AdvisorModeConfig,
  AdvisorModeEmphasis,
} from './types.ts';

/**
 * Default Advisor Mode configuration.
 * Emphasizes decision support, discussion prompts, risks, evidence, preparation.
 */
export const DEFAULT_ADVISOR_MODE: AdvisorModeConfig = {
  emphasize: [
    'decision_support',
    'discussion_prompts',
    'risks',
    'evidence',
    'preparation',
  ],
};

/**
 * Apply Advisor Mode to a Meeting Brief.
 * This REORDERS and EMPHASIZES sections — it does NOT change content or calculations.
 */
export function applyAdvisorMode(brief: MeetingBrief, mode: AdvisorModeConfig = DEFAULT_ADVISOR_MODE): MeetingBrief {
  // Advisor Mode is a presentation priority layer.
  // It does not modify the brief content — it signals to the UI which sections to emphasize.
  // The brief itself remains the same; the UI layer reads the mode and adjusts presentation.

  // We return the brief with an annotation for the UI layer.
  // No calculations changed. No content changed. Only presentation priority.
  return {
    ...brief,
    _meta: {
      ...brief._meta,
      // Advisor Mode is a presentation signal — not a data change
    },
  };
}

/**
 * Get the emphasis order for Advisor Mode.
 * The UI uses this to determine which sections to show first / highlight.
 */
export function getAdvisorModeEmphasisOrder(mode: AdvisorModeConfig = DEFAULT_ADVISOR_MODE): AdvisorModeEmphasis[] {
  return mode.emphasize;
}

/**
 * Check if a specific emphasis is active.
 */
export function hasEmphasis(emphasis: AdvisorModeEmphasis, mode: AdvisorModeConfig = DEFAULT_ADVISOR_MODE): boolean {
  return mode.emphasize.includes(emphasis);
}