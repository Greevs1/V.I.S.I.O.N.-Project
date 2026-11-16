/**
 * Adaptive Questions — the Knowledge Gap Engine.
 *
 * Replaces the fixed "Question 1 of 5" sequence with adaptive, one-at-a-time
 * natural questions. Galileo asks only what materially improves its current
 * understanding or the user's current goal.
 *
 * Reuses existing assessment intelligence as a knowledge bank — each question
 * maps to a specific calculation, benchmark, or opportunity it unlocks.
 */

// Which existing calculation/benchmark each answer unlocks
const QUESTION_UNLOCKS = {
  industry: ['benchmark_lookup', 'valuation_multiple_refinement', 'industry_classification'],
  revenue: ['profit_margin', 'profit_gap', 'value_gap', 'revenue_range'],
  ebitda: ['value_gap', 'profit_margin', 'recast_ebitda', 'valuation'],
  employees: ['operations_health', 'owner_dependency'],
  involvement: ['operations_score', 'freedom_score', 'owner_dependency_value_impact'],
  goal: ['opportunity_prioritization', 'strategy_ranking'],
};

/**
 * The ordered field bank. ONE list, exported, so the priority engine and the
 * conversation controller can never disagree about what "a question" is.
 */
export const QUESTION_FIELDS = ['industry', 'revenue', 'ebitda', 'employees', 'involvement', 'goal'];

/**
 * getNextQuestion — determines the most valuable next question to ask.
 *
 * @param {object} answers — current answers { industry, revenue, ebitda, employees, involvement, goal }
 * @param {string} intent — the user's selected intent
 * @returns {object|null} — the next question or null if discovery is complete
 */
export function getNextQuestion(answers = {}, intent = null) {
  const order = buildQuestionOrder(intent);
  for (const field of order) {
    if (answers[field] == null || answers[field] === '') {
      return getQuestionDefinition(field, answers);
    }
  }
  return null;
}

/**
 * buildQuestionOrder — prioritizes questions based on intent.
 * Every intent still needs industry + revenue + ebitda for value/profit.
 * Some intents prioritize involvement or goal earlier.
 */
function buildQuestionOrder(intent) {
  const base = ['industry', 'revenue', 'ebitda'];

  // Intent-specific prioritization
  switch (intent) {
    case 'reduce_dependency':
      return ['industry', 'revenue', 'ebitda', 'involvement', 'employees', 'goal'];
    case 'improve_cash_flow':
      return ['industry', 'revenue', 'ebitda', 'employees', 'involvement'];
    case 'get_ready_to_sell':
      return ['industry', 'revenue', 'ebitda', 'involvement', 'employees', 'goal'];
    case 'lower_taxes':
      return ['industry', 'revenue', 'ebitda', 'employees'];
    default:
      return [...base, 'involvement', 'employees', 'goal'];
  }
}

/**
 * getQuestionDefinition — returns the question definition for a field.
 * Questions are natural, conversational, and adaptive — no "Question X of Y".
 */
export function getQuestionDefinition(field, existingAnswers = {}) {
  const questions = {
    industry: {
      field: 'industry',
      prompt: "Tell me a little about the business. What do you do?",
      sub: "A short phrase is fine — I just need the shape of it.",
      inputType: 'text',
      placeholder: 'e.g. Commercial HVAC services',
      unlocks: QUESTION_UNLOCKS.industry,
    },
    revenue: {
      field: 'revenue',
      prompt: "Roughly, how big are you today?",
      sub: "Annual revenue — an estimate is fine. I'll refine it if you share financials later.",
      inputType: 'number',
      placeholder: 'e.g. 2500000',
      prefix: '$',
      allowSkip: true,
      unlocks: QUESTION_UNLOCKS.revenue,
    },
    ebitda: {
      field: 'ebitda',
      prompt: "And roughly what does the business produce in profit before owner-specific adjustments?",
      sub: "EBITDA — a range is completely fine. If you're not sure, skip and I'll estimate.",
      inputType: 'number',
      placeholder: 'e.g. 400000',
      prefix: '$',
      allowSkip: true,
      unlocks: QUESTION_UNLOCKS.ebitda,
    },
    employees: {
      field: 'employees',
      prompt: "How many people work in the business?",
      sub: "Including yourself.",
      inputType: 'number',
      placeholder: 'e.g. 12',
      allowSkip: true,
      unlocks: QUESTION_UNLOCKS.employees,
    },
    involvement: {
      field: 'involvement',
      prompt: "How involved are you in the day-to-day?",
      sub: "This tells me a lot about operations and freedom.",
      inputType: 'choice',
      options: [
        { value: 'light', label: 'Light', desc: 'I mostly steer; others run it' },
        { value: 'moderate', label: 'Moderate', desc: "I'm in it most days" },
        { value: 'heavy', label: 'Heavy', desc: 'It runs on me' },
      ],
      unlocks: QUESTION_UNLOCKS.involvement,
    },
    goal: {
      field: 'goal',
      prompt: "What matters most to you right now?",
      sub: "This helps me prioritize what I show you.",
      inputType: 'choice',
      options: [
        { value: 'increase_value', label: 'Increase business value' },
        { value: 'increase_profit', label: 'Increase profit' },
        { value: 'reduce_dependency', label: 'Reduce owner dependency' },
        { value: 'get_ready_to_sell', label: 'Get ready to sell' },
        { value: 'improve_cash_flow', label: 'Improve cash flow' },
        { value: 'not_sure', label: "I'm not sure — show me what you see" },
      ],
      allowSkip: true,
      unlocks: QUESTION_UNLOCKS.goal,
    },
  };

  return questions[field] || null;
}

/**
 * shouldAskFollowUp — checks if Galileo should ask a clarifying follow-up
 * after the user describes their business. Returns a follow-up question
 * or null if the answer was clear enough.
 */
export function shouldAskFollowUp(field, value) {
  if (field !== 'industry') return null;

  const v = (value || '').toLowerCase();
  // If the user gave a very short or ambiguous answer, ask for clarification
  if (v.length < 5) {
    return {
      field: '_industry_clarify',
      prompt: "Mostly residential, commercial, or a mix?",
      sub: "This helps me find the right benchmarks.",
      inputType: 'choice',
      options: [
        { value: 'residential', label: 'Mostly residential' },
        { value: 'commercial', label: 'Mostly commercial' },
        { value: 'mix', label: 'A mix of both' },
      ],
      isFollowUp: true,
    };
  }
  return null;
}

/**
 * getDiscoveryProgress — returns a subtle progress indicator (not visible to user).
 * Used internally to determine when enough information exists to build a model.
 */
export function getDiscoveryProgress(answers = {}) {
  const critical = ['industry', 'revenue', 'ebitda'];
  const filled = critical.filter((f) => answers[f] != null && answers[f] !== '').length;
  return {
    criticalFilled: filled,
    criticalTotal: critical.length,
    hasEnoughForModel: filled >= 2,
    hasEnoughForBenchmark: filled >= 1 && answers.industry != null,
  };
}

/**
 * getWhyItMattered — returns a natural conversational message about why
 * the answer was useful. Uses natural variation — not mechanical.
 *
 * Each field has multiple message variants. Galileo picks one based on
 * what the answer unlocked.
 */
export function getWhyItMattered(field, value, answers = {}) {
  const variants = {
    industry: [
      "That gives me a much better comparison group.",
      "Now I can tell which benchmarks actually apply to you.",
      "That helps me find the right benchmarks for you.",
    ],
    // Revenue alone supports SCALE, not profitability. Every variant here must stay
    // true of what the owner just supplied — none may imply a margin is known.
    revenue: [
      "That gives me the scale of the business. Profitability is the next piece I need.",
      "Now I can see the scale of the operation.",
      "That tells me a lot about the shape of your business.",
    ],
    ebitda: [
      "Now I can make a first pass at profitability and value.",
      "That's the key number — now I can model what the business is worth.",
      "With that, I can see both your margin and your value.",
    ],
    employees: [
      "That tells me how much of the work rests on the team rather than on you.",
      "Now I can see the shape of the operation around you.",
    ],
    involvement: [
      "That tells me a lot about both your freedom and what a buyer would see.",
      "Owner involvement is one of the biggest drivers of value and freedom.",
      "That sharpens both your operations picture and your freedom.",
    ],
    goal: [
      "That helps me prioritize what I show you.",
      "Now I know what matters most to you right now.",
    ],
  };

  const msgs = variants[field];
  if (!msgs) return null;
  // Deterministic pick based on answer count to avoid repetition
  const filledCount = Object.values(answers).filter((v) => v != null && v !== '').length;
  return msgs[filledCount % msgs.length];
}