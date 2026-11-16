/**
 * Experience State Machine — the internal orchestration layer.
 *
 * Galileo infers its current experience state from behavior and context.
 * The user NEVER sees these states as steps or progress navigation.
 *
 * States:
 *   DISCOVER    — User is exploring, Galileo is gathering initial context
 *   UNDERSTAND  — Galileo is processing what it learned, showing why it mattered
 *   REVEAL      — Galileo is surfacing insights (value, profitability, opportunities)
 *   INVESTIGATE — User is exploring an opportunity deeper
 *   CREATE      — User is exploring strategies/scenarios
 *   DECIDE      — User is choosing an implementation path
 *   PRODUCE     — User is creating a sprint/plan
 *   MEASURE     — Returning user, tracking progress
 *
 * The state machine is PURE — it derives state from inputs, it doesn't
 * mutate them. The hook calls inferExperienceState() and uses the result
 * to drive UI behavior (what to show, what to ask, how to respond).
 */

import { revenueObservation } from './factKnowledge';

export const ExperienceState = {
  DISCOVER: 'discover',
  UNDERSTAND: 'understand',
  REVEAL: 'reveal',
  INVESTIGATE: 'investigate',
  CREATE: 'create',
  DECIDE: 'decide',
  PRODUCE: 'produce',
  MEASURE: 'measure',
};

/**
 * inferExperienceState — derives the current experience state from context.
 *
 * @param {object} ctx — {
 *   flowState, answers, model, selectedOpportunity, selectedStrategy,
 *   implementationChoice, isAuthenticated, isReturningUser,
 *   uploadedDocs, conversationLength, hasSavedItems, activeSprints
 * }
 * @returns {object} — { state, label, inferenceReason }
 */
export function inferExperienceState(ctx = {}) {
  const {
    flowState,
    answers = {},
    model,
    selectedOpportunity,
    selectedStrategy,
    implementationChoice,
    isAuthenticated,
    isReturningUser,
    uploadedDocs = [],
    hasSavedItems = false,
    activeSprints = 0,
  } = ctx;

  // MEASURE — returning user with active work
  if (isReturningUser && isAuthenticated && (activeSprints > 0 || hasSavedItems)) {
    return {
      state: ExperienceState.MEASURE,
      inferenceReason: 'Returning user with active work',
    };
  }

  // PRODUCE — user has chosen to create a sprint/plan
  if (implementationChoice === 'guide_me' || flowState === 'implementing') {
    return {
      state: ExperienceState.PRODUCE,
      inferenceReason: 'User chose to create a plan',
    };
  }

  // DECIDE — user is choosing implementation path (guide vs expert)
  if (flowState === 'saving' && implementationChoice == null && selectedStrategy) {
    return {
      state: ExperienceState.DECIDE,
      inferenceReason: 'User is choosing how to implement',
    };
  }

  // CREATE — user is exploring strategies/scenarios
  if (selectedStrategy || flowState === 'strategy') {
    return {
      state: ExperienceState.CREATE,
      inferenceReason: 'User is exploring strategies',
    };
  }

  // INVESTIGATE — user is exploring an opportunity deeper
  if (selectedOpportunity || flowState === 'opportunity') {
    return {
      state: ExperienceState.INVESTIGATE,
      inferenceReason: 'User is investigating an opportunity',
    };
  }

  // REVEAL — Galileo is surfacing insights
  if (model && (flowState === 'revealing' || flowState === 'awaiting_upload' || flowState === 'learning')) {
    return {
      state: ExperienceState.REVEAL,
      inferenceReason: 'Galileo is surfacing insights',
    };
  }

  // UNDERSTAND — Galileo is processing answers, showing why they mattered
  if (flowState === 'discovering' && model && Object.values(answers).filter((v) => v != null).length >= 2) {
    return {
      state: ExperienceState.UNDERSTAND,
      inferenceReason: 'Galileo is building understanding',
    };
  }

  // DISCOVER — initial exploration
  return {
    state: ExperienceState.DISCOVER,
    inferenceReason: 'Initial exploration',
  };
}

/**
 * inferMode — infers Creator vs Producer mode from behavior.
 * Creator = asking questions, exploring, understanding
 * Producer = creating outputs, implementing, tracking
 *
 * NEVER shown as a prominent toggle. Just inferred.
 */
export function inferMode(ctx = {}) {
  const { state, implementationChoice, activeSprints = 0 } = ctx;

  if (state === ExperienceState.PRODUCE || state === ExperienceState.MEASURE) {
    return 'produce';
  }
  if (implementationChoice === 'guide_me' || activeSprints > 0) {
    return 'produce';
  }
  if (state === ExperienceState.CREATE || state === ExperienceState.DECIDE) {
    return 'produce';
  }
  return 'create';
}

/**
 * shouldShowValueBeforeQuestion — determines if Galileo should provide
 * value (an insight, observation, or benchmark) before asking the next question.
 *
 * This creates the VALUE → QUESTION → VALUE → QUESTION rhythm
 * instead of QUESTION → QUESTION → QUESTION.
 */
export function shouldShowValueBeforeQuestion(ctx = {}) {
  const { state, answers = {}, model, lastFieldAnswered, benchmark, facts = null } = ctx;

  // AFTER REVENUE, STATE WHAT REVENUE ALONE SUPPORTS.
  //
  // This used to be typed `margin_observation` and fired while EBITDA was still
  // unanswered — naming a statement after a metric it cannot yet compute, which is
  // how the sequence came to interpret profitability BEFORE asking for it (§5).
  // It is now a revenue observation: the scale, the industry's own benchmark range,
  // and the flat statement that profitability is the next piece needed. The fact
  // gate decides whether it can be said at all.
  if (lastFieldAnswered === 'revenue' && answers.industry && answers.revenue && !answers.ebitda) {
    return {
      shouldShow: true,
      type: 'revenue_observation',
      message: revenueObservation(facts, benchmark) || buildMarginObservation(answers, benchmark),
    };
  }

  // After EBITDA, show value awakening
  if (lastFieldAnswered === 'ebitda' && answers.ebitda && answers.revenue) {
    return {
      shouldShow: true,
      type: 'value_awakening',
      message: "That also gives me enough to make a preliminary value estimate.",
    };
  }

  // After involvement, show operations observation
  if (lastFieldAnswered === 'involvement' && answers.involvement) {
    return {
      shouldShow: true,
      type: 'operations_observation',
      message: buildOperationsObservation(answers.involvement),
    };
  }

  return { shouldShow: false };
}

/** Fallback for when no resolved fact set was supplied. Still makes no margin claim. */
function buildMarginObservation(answers, benchmark) {
  if (!answers.revenue) return null;
  if (benchmark?.typicalLow && benchmark?.typicalHigh) {
    return `That puts your revenue at ${formatMoney(answers.revenue)}. For ${benchmark.normalizedIndustry || 'your industry'}, typical businesses operate on ${benchmark.typicalLow}–${benchmark.typicalHigh}% margins — I'll need your profitability before I can say where you sit in that range.`;
  }
  return `That gives me the scale of the business. Profitability is the next piece I need.`;
}

function buildOperationsObservation(involvement) {
  const map = {
    light: "That's good — light involvement usually means the business can run without you, which matters for both freedom and value.",
    moderate: "That tells me a lot. Moderate involvement is common, but reducing it further is often where hidden value sits.",
    heavy: "That's worth noting. Heavy owner involvement is one of the biggest drags on both your freedom and what a buyer would pay.",
  };
  return map[involvement] || null;
}

function formatMoney(n) {
  if (n == null) return null;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
}