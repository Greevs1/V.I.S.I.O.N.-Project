/**
 * Question Priority Engine — intelligent question selection.
 *
 * Replaces the linear question sequence with an information-value-driven
 * approach. Before asking anything, Galileo evaluates:
 *
 *   1. Does Galileo already know this from a connected source?
 *   2. Can Galileo reasonably derive it?
 *   3. Does the answer materially improve the current analysis?
 *   4. Is this the right moment to ask?
 *   5. Can Galileo provide value BEFORE asking another question?
 *
 * The engine returns the highest-value question, or null if Galileo
 * should provide value instead of asking.
 *
 * Reuses the existing adaptiveQuestions.js question definitions —
 * this engine wraps them with priority scoring, it doesn't replace them.
 */

import { getDiscoveryProgress, getQuestionDefinition as definitionFor, QUESTION_FIELDS } from './adaptiveQuestions';

// Information value scores for each field (0-100)
// How much each answer improves Galileo's current analysis
const INFORMATION_VALUE = {
  // Identity first. Nothing else can be benchmarked, compared or valued before
  // Galileo knows what kind of business it is looking at, so industry outranks
  // even revenue — and every other field is penalised while it is unknown.
  industry: 92,    // Unlocks benchmark lookup, valuation multiples
  revenue: 90,     // Unlocks profit margin, profit gap, value gap
  ebitda: 95,      // Unlocks value gap, valuation, recast EBITDA
  employees: 45,   // Unlocks operations health, owner dependency
  involvement: 60, // Unlocks operations score, freedom score, value impact
  goal: 35,        // Unlocks opportunity prioritization, strategy ranking
};

// What each field helps derive (for derivability checks)
const DERIVABLE_FROM = {
  ebitda: ['revenue', 'industry'],  // Can estimate EBITDA from revenue + industry margin
  employees: ['revenue'],           // Can rough-estimate from revenue scale
  involvement: [],                  // Can't be derived — must ask
  goal: ['intent'],                 // Can partially infer from stated intent
};

// What each field is already known from (connected sources)
const KNOWN_FROM_SOURCES = {
  revenue: ['document'],     // P&L extraction provides this
  ebitda: ['document'],      // P&L extraction provides this
};

/**
 * selectNextQuestion — the main entry point.
 *
 * Evaluates all unanswered questions and returns the highest-priority one,
 * or null if Galileo should provide value instead of asking.
 *
 * @param {object} ctx — {
 *   answers, intent, extractedFacts, model, benchmark,
 *   lastFieldAnswered, conversationLength, hasProvidedValueRecently
 * }
 * @returns {object|null} — { question, priority, reason } or null
 */
export function selectNextQuestion(ctx = {}) {
  const {
    answers = {},
    intent = null,
    extractedFacts = null,
    model = null,
    benchmark = null,
    lastFieldAnswered = null,
    hasProvidedValueRecently = false,
    answeredQuestionIds = [],
  } = ctx;

  // All not-yet-dealt-with fields. A SKIPPED question counts as dealt with: the
  // engine tracks what a human has actually handled, not only what carries a
  // value — otherwise one skip would be asked again forever.
  const unanswered = QUESTION_FIELDS
    .filter((f) => !answeredQuestionIds.includes(f))
    .filter((f) => answers[f] == null || answers[f] === '');

  if (unanswered.length === 0) return null;

  // Score each unanswered question
  const scored = unanswered.map((field) => {
    const score = scoreQuestion(field, {
      answers,
      intent,
      extractedFacts,
      benchmark,
      lastFieldAnswered,
      hasProvidedValueRecently,
    });
    return { field, ...score };
  });

  // Fields the available EVIDENCE has already answered are never asked. They are
  // reported so the caller can record them as dealt with (§O16).
  const skipped = scored.filter((s) => s.skip).map((s) => s.field);
  const eligible = scored.filter((s) => !s.skip).sort((a, b) => b.priority - a.priority);
  const top = eligible[0];
  if (!top) return { question: null, skipped, reason: 'all_questions_dealt_with' };

  // A low-priority question is still A QUESTION. It is offered together with the
  // signal that Galileo should say something useful first — it is NEVER turned
  // into "no question", which ended discovery early and skipped the field.
  const questionDef = questionFor(top.field);
  if (!questionDef) return { question: null, skipped, reason: 'no_question_definition' };

  return {
    question: questionDef,
    priority: top.priority,
    reason: top.reason,
    skipped,
    shouldProvideValueFirst: top.priority < 40 && !hasProvidedValueRecently,
  };
}

/**
 * scoreQuestion — evaluates a single question's priority.
 *
 * Returns a priority score (0-100) and a reason explaining the score.
 */
function scoreQuestion(field, ctx = {}) {
  const {
    answers = {},
    intent = null,
    extractedFacts = null,
    benchmark = null,
    lastFieldAnswered = null,
    hasProvidedValueRecently = false,
  } = ctx;

  let priority = INFORMATION_VALUE[field] || 30;
  const reasons = [];

  // 1. Already known from a connected source?
  const knownSources = KNOWN_FROM_SOURCES[field] || [];
  if (knownSources.includes('document') && extractedFacts?.success) {
    const exFacts = extractedFacts?.facts || {};
    const docValue = getDocValueForField(field, exFacts);
    if (docValue != null) {
      return {
        priority: 0,
        reason: `Already known from document (${formatMoney(docValue)})`,
        skip: true,
      };
    }
  }

  // 2. Can be derived?
  const derivableFrom = DERIVABLE_FROM[field] || [];
  if (derivableFrom.length > 0) {
    const canDerive = derivableFrom.every((f) => answers[f] != null);
    if (canDerive && field === 'ebitda' && benchmark) {
      // We can estimate EBITDA from revenue + industry margin
      priority -= 20;
      reasons.push('Can be estimated from revenue + industry benchmark');
    }
  }

  // 3. Materially improves current analysis?
  const progress = getDiscoveryProgress(answers);
  if (field === 'goal' && !progress.hasEnoughForModel) {
    // Goal is only valuable once we have a model
    priority -= 30;
    reasons.push('More valuable after model exists');
  }

  if (field === 'employees' && !answers.revenue) {
    // Employees less valuable before we know revenue
    priority -= 15;
    reasons.push('More valuable after revenue is known');
  }

  // 4. Is this the right moment?
  if (!answers.industry && field !== 'industry') {
    // Without identity there is nothing to compare against: benchmarks,
    // valuation multiples and peer sets are all industry-relative.
    priority -= 25;
    reasons.push('Identity is not known yet');
  }
  if (lastFieldAnswered === 'industry' && field === 'revenue') {
    priority += 10; // Natural flow: industry → revenue
    reasons.push('Natural conversation flow');
  }
  if (lastFieldAnswered === 'revenue' && field === 'ebitda') {
    priority += 10; // Natural flow: revenue → ebitda
    reasons.push('Natural conversation flow');
  }

  // 5. Intent-based priority adjustment
  if (intent) {
    const intentPriority = getIntentPriority(intent, field);
    priority += intentPriority;
    if (intentPriority > 0) reasons.push(`Prioritized by intent: ${intent}`);
  }

  // 6. Don't ask back-to-back questions without value
  if (lastFieldAnswered && !hasProvidedValueRecently) {
    // After the first 2 questions, require value between questions
    const answeredCount = Object.values(answers).filter((v) => v != null).length;
    if (answeredCount >= 2) {
      priority -= 15;
      reasons.push('Should provide value before asking again');
    }
  }

  // Clamp to 0-100
  priority = Math.max(0, Math.min(100, priority));

  return {
    priority,
    reason: reasons.length > 0 ? reasons.join('; ') : 'Standard priority',
  };
}

/**
 * getIntentPriority — adjusts question priority based on user intent.
 */
function getIntentPriority(intent, field) {
  const intentPriorities = {
    reduce_dependency: { involvement: +25, employees: +15, goal: +10 },
    improve_cash_flow: { revenue: +10, ebitda: +10, employees: +5 },
    get_ready_to_sell: { involvement: +20, employees: +15, goal: +10 },
    lower_taxes: { ebitda: +10, employees: +5 },
    increase_profit: { revenue: +10, ebitda: +15 },
    increase_value: { ebitda: +15, involvement: +15 },
    find_opportunities: { ebitda: +10, involvement: +10 },
    already_implementing: { goal: +20 },
    not_sure: {},
  };

  return (intentPriorities[intent] || {})[field] || 0;
}

/**
 * questionFor — ONE DIRECT LOOKUP into the existing question bank.
 *
 * The previous indirection (delete the field, then ask the bank for "the next"
 * one) returned null whenever another field came first in the bank's order —
 * which silently SKIPPED the question and ended discovery early. A definition
 * is now requested by name, so a missing field can no longer masquerade as an
 * exhausted gap.
 */
function questionFor(field) {
  return definitionFor(field) || null;
}

// ── THE KNOWLEDGE GAP ENGINE (progression contract) ──────────────────────────

/**
 * The intelligence milestones. They are NOT wizard pages and the user never sees
 * them: they are how far Galileo has actually got, derived on every transition.
 *
 *   M0 subject known · M1 intent known · M2 business identity pending
 *   M3 business identity/category known · M4 operating shape partially known
 *   M5 first responsible insight available · M6 first opportunity candidate
 *   M7 preservation worthwhile (insight or opportunity exists)
 */
export const KNOWLEDGE_MILESTONES = ['M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7'];

export function computeMilestone({ answers = {}, model = null, insightShown = false, subjectKnown = false, intentKnown = false } = {}) {
  const has = (f) => answers[f] != null && answers[f] !== '';
  const hasOpportunity = (model?.opportunities?.length || 0) > 0;

  if (hasOpportunity) return 'M6';
  // M5 — a margin is computable, so a responsible observation exists.
  if (insightShown || (has('revenue') && has('ebitda'))) return 'M5';
  // M4 — financial shape plus at least one operating fact.
  if (has('revenue') && has('ebitda') && (has('involvement') || has('employees'))) return 'M4';
  if (has('industry') || has('revenue') || has('ebitda')) return 'M3';
  if (intentKnown) return 'M2';
  if (subjectKnown) return 'M1';
  return 'M0';
}

/**
 * selectNextGap — THE single progression decision for the first-run experience.
 *
 * known business state + selected intent + already answered questions +
 * available evidence + business-intelligence completeness
 *        ↓
 * highest-value UNANSWERED question   (or an explicit advance)
 *
 * ANTI-LOOP INVARIANT (§O6/O7/O20)
 *   A continuation may never re-emit a question that is already dealt with. If
 *   the currently rendered question has already been answered or skipped, the
 *   engine REFUSES that selection, records the refusal, and resolves the next
 *   eligible gap. When nothing eligible remains it returns `advance:true` — the
 *   experience moves forward instead of repeating. This is enforced here, in ONE
 *   place, so no caller can loop by accident.
 */
export function selectNextGap(ctx = {}) {
  const {
    answers = {},
    answeredQuestionIds = [],
    currentQuestionId = null,
    insightShown = false,
    subjectKnown = true,
    intentKnown = true,
  } = ctx;

  const milestone = computeMilestone({ ...ctx, insightShown, subjectKnown, intentKnown });
  const refused = [];

  // The refusal. A question already dealt with is excluded from selection — not
  // merely avoided — so a second continuation cannot select it either.
  let dealtWith = answeredQuestionIds;
  if (currentQuestionId && answeredQuestionIds.includes(currentQuestionId)) {
    refused.push(currentQuestionId);
  }

  let result = selectNextQuestion({ ...ctx, answeredQuestionIds: dealtWith });
  let guard = 0;
  while (result?.question && refused.includes(result.question.field) && guard < QUESTION_FIELDS.length + 2) {
    dealtWith = [...dealtWith, result.question.field];
    result = selectNextQuestion({ ...ctx, answeredQuestionIds: dealtWith });
    guard += 1;
  }

  const skipped = result?.skipped || [];
  if (!result?.question) {
    return {
      advance: true,
      question: null,
      milestone,
      refused,
      skipped,
      reason: refused.length ? `refused:${refused.join(',')}` : (result?.reason || 'no_eligible_gap'),
    };
  }

  return {
    advance: false,
    question: result.question,
    priority: result.priority,
    milestone,
    refused,
    skipped,
    shouldProvideValueFirst: !!result.shouldProvideValueFirst,
    reason: `priority:${result.priority} · ${result.reason}`,
  };
}

/**
 * shouldAskQuestion — final gate before asking.
 *
 * Returns true only if asking this question is the right move.
 */
export function shouldAskQuestion(ctx = {}) {
  const { hasProvidedValueRecently = false, answeredCount = 0 } = ctx;

  // First 2 questions: always ask
  if (answeredCount < 2) return true;

  // After that: only ask if we've provided value recently
  return hasProvidedValueRecently;
}

function getDocValueForField(field, exFacts) {
  if (field === 'revenue') return exFacts.annual_revenue?.normalized;
  if (field === 'ebitda') return exFacts.reported_ebitda?.normalized ?? exFacts.operating_income?.normalized;
  return null;
}

function formatMoney(n) {
  if (n == null) return null;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
}