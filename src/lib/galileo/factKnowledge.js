/**
 * factKnowledge — WHAT GALILEO KNOWS, AND WHAT IT DOES NOT.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE
 *
 *   UNKNOWN IS NOT ZERO.
 *
 *   A fact that is null, undefined, missing, unanswered, skipped, non-numeric or
 *   out of range is UNKNOWN. It is never 0, never "$0", never "none", never
 *   "no profit", never "below benchmark". Those are claims about the world, and
 *   Galileo may only make a claim the evidence supports.
 *
 *   revenue = 5,000,000 · ebitda = unknown   →   profit_margin = UNKNOWN
 *   revenue = 5,000,000 · ebitda = 0         →   profit_margin = 0%   (a real zero)
 *
 * HOW THE OLD DEFECT WORKED
 *
 *   `Number(null)` is 0, and `Number.isFinite(0)` is true. So a guard written as
 *   `Number.isFinite(Number(answers.ebitda))` reads an UNANSWERED EBITDA as a
 *   verified zero, and a margin of 0/5,000,000 = 0% becomes "computable". The
 *   number was never in the data; it was manufactured by the coercion. That is
 *   why `||` → `??` alone is not a repair: the epistemic state has to be explicit,
 *   which is what this module carries.
 *
 * EPISTEMIC STATES (per fact)
 *
 *   known               — supplied or extracted as a real number
 *   estimated           — modelled (the estimator), usable but NOT a measurement
 *   unknown             — no value exists
 *   needs_verification  — a value exists from a document and is pending review
 *
 * A DERIVED METRIC IS ONLY COMPUTED WHEN EVERY REQUIRED INPUT IS REAL (known or
 * estimated). A conclusion is gated on the same test — see conclusionReadiness.
 *
 * Pure module: no imports, no side effects, no persistence.
 */

export const Knowledge = {
  KNOWN: 'known',
  ESTIMATED: 'estimated',
  UNKNOWN: 'unknown',
  NEEDS_VERIFICATION: 'needs_verification',
};

/** The financial facts a conclusion can be built from. */
export const FINANCIAL_FACTS = ['revenue', 'ebitda'];

/** A metric's required inputs. Adding a metric here is the ONLY place it is declared. */
export const METRIC_REQUIREMENTS = {
  profit_margin: ['revenue', 'ebitda'],
};

/** Human names, used in the question Galileo asks when a fact is missing. */
const FACT_QUESTION = {
  revenue: { field: 'revenue', reason: 'I need the scale of the business before I can compare anything.' },
  ebitda: { field: 'ebitda', reason: 'Profitability is the next piece I need.' },
};

/**
 * toNumber — a real number, or null. '' and 'abc' are null, never 0.
 * A string carrying currency/commas is parsed; a string with no digits is not.
 */
export function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]/g, '');
    if (cleaned === '' || cleaned === '-' || cleaned === '.' || cleaned === '-.') return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** knowledgeOf — the epistemic state of a bare value. */
export function knowledgeOf(value) {
  return toNumber(value) == null ? Knowledge.UNKNOWN : Knowledge.KNOWN;
}

/** isReal — may a derived metric use this fact at all? */
export function isReal(entry) {
  return entry?.state === Knowledge.KNOWN || entry?.state === Knowledge.ESTIMATED;
}

function factOf(name, docValue, verifiedValue, answerValue, estimated, period) {
  const doc = toNumber(docValue);
  if (doc != null) {
    return { name, value: doc, state: Knowledge.KNOWN, source: 'document', period: period || null };
  }
  const confirmed = toNumber(verifiedValue);
  if (confirmed != null) {
    return { name, value: confirmed, state: Knowledge.KNOWN, source: 'verified', period: period || null };
  }
  const supplied = toNumber(answerValue);
  if (supplied != null) {
    return estimated
      ? { name, value: supplied, state: Knowledge.ESTIMATED, source: 'modeled_estimate' }
      : { name, value: supplied, state: Knowledge.KNOWN, source: 'you' };
  }
  return { name, value: null, state: Knowledge.UNKNOWN, source: null };
}

/**
 * resolveFacts — the ONE reading of the financial facts, with provenance.
 *
 * Precedence is the canonical source hierarchy: an extracted document fact
 * outranks a confirmed fact, which outranks a supplied answer. An answer that
 * came from the estimator is ESTIMATED and can never be reported as measured.
 *
 * @returns {{ revenue: Fact, ebitda: Fact }}
 */
export function resolveFacts({ answers = {}, verified = {}, extractedFacts = null, estimated = {} } = {}) {
  const exFacts = extractedFacts?.facts || {};
  const period = extractedFacts?.period || null;
  return {
    revenue: factOf(
      'revenue',
      exFacts.annual_revenue?.normalized,
      verified.revenue,
      answers.revenue,
      !!estimated.revenue,
      period,
    ),
    ebitda: factOf(
      'ebitda',
      exFacts.reported_ebitda?.normalized ?? exFacts.operating_income?.normalized,
      verified.ebitda,
      answers.ebitda,
      !!estimated.ebitda,
      period,
    ),
  };
}

/**
 * metricReadiness — can this metric be computed, and if not, what is missing?
 */
export function metricReadiness(metric, facts) {
  const required = METRIC_REQUIREMENTS[metric] || [];
  const missing = required.filter((f) => !isReal(facts?.[f]));
  return { metric, required, missing, ready: required.length > 0 && missing.length === 0 };
}

/** questionForFact — the highest-value question that would make a conclusion possible. */
export function questionForFact(field) {
  return FACT_QUESTION[field] || null;
}

/**
 * knownMargin — the ONE profit margin.
 *
 * Returns ready:false with the missing inputs whenever either side is not real.
 * A zero revenue is real but not a usable denominator, so the margin stays
 * UNKNOWN rather than becoming Infinity.
 */
export function knownMargin(facts) {
  const readiness = metricReadiness('profit_margin', facts);
  if (!readiness.ready) {
    return { ready: false, value: null, state: Knowledge.UNKNOWN, missing: readiness.missing };
  }
  const margin = (facts.ebitda.value / facts.revenue.value) * 100;
  if (!Number.isFinite(margin) || facts.revenue.value === 0) {
    return { ready: false, value: null, state: Knowledge.UNKNOWN, missing: ['revenue'] };
  }
  return {
    ready: true,
    value: Math.round(margin * 10) / 10,
    state: facts.ebitda.state === Knowledge.ESTIMATED ? Knowledge.ESTIMATED : Knowledge.KNOWN,
    missing: [],
  };
}

/**
 * requiredFactsKnown — THE CONCLUSION READINESS GATE.
 *
 * Before Galileo produces an interpretation, insight, benchmark comparison,
 * derived statement or opportunity, it asks this. When it is false the
 * conclusion is NOT MADE; the caller asks the question that would make it
 * possible instead (readiness.question).
 */
export function requiredFactsKnown(conclusion, facts) {
  return metricReadiness(conclusion, facts).ready;
}

/**
 * conclusionReadiness — the gate plus the value and the next question.
 * @returns {{ ready, conclusion, value, state, missing, question }}
 */
export function conclusionReadiness(conclusion, facts) {
  const readiness = metricReadiness(conclusion, facts);
  if (!readiness.ready) {
    return {
      ready: false,
      conclusion,
      value: null,
      state: Knowledge.UNKNOWN,
      missing: readiness.missing,
      question: questionForFact(readiness.missing[0]),
    };
  }
  if (conclusion === 'profit_margin') {
    const margin = knownMargin(facts);
    return {
      ready: margin.ready,
      conclusion,
      value: margin.value,
      state: margin.state,
      missing: margin.missing,
      question: margin.ready ? null : questionForFact(margin.missing[0]),
    };
  }
  return { ready: true, conclusion, value: null, state: Knowledge.KNOWN, missing: [], question: null };
}

/** Money, formatted for speech. Unknown renders as nothing — never $0. */
export function formatMoney(n) {
  const value = toNumber(n);
  if (value == null) return null;
  if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (Math.abs(value) >= 1e3) return `$${Math.round(value / 1e3)}K`;
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

/**
 * profitInsightLine — THE FIRST INSIGHT, or null.
 *
 * This is the sentence that used to be said at the revenue step with a
 * manufactured 0%. It is now gated on the readiness of the metric it states, and
 * it distinguishes a measured margin from a modelled one — an estimate is never
 * dressed as knowledge.
 */
export function profitInsightLine(facts) {
  const margin = conclusionReadiness('profit_margin', facts);
  if (!margin.ready) return null;
  if (margin.state === Knowledge.ESTIMATED) {
    return `That's enough for me to start seeing the shape of it. On the modeled EBITDA, you're around a ${margin.value}% margin — that's an estimate, so I'd treat it as a starting point rather than a measurement.`;
  }
  return `That's enough for me to start seeing the shape of it. You're running at roughly a ${margin.value}% profit margin, and I already have enough to start looking at where profit may be leaking.`;
}

/**
 * revenueObservation — what REVENUE ALONE honestly supports.
 *
 * Revenue is known; profitability is not. So this states the scale, places the
 * benchmark in the industry's own terms, and says plainly what is still missing.
 * It never states, implies or estimates a margin.
 */
export function revenueObservation(facts, benchmark = null) {
  const revenue = facts?.revenue;
  if (!isReal(revenue)) return null;
  const amount = formatMoney(revenue.value);
  const low = benchmark?.typicalLow;
  const high = benchmark?.typicalHigh;
  const industry = benchmark?.normalizedIndustry || 'your industry';
  if (low != null && high != null) {
    return `That puts your revenue at ${amount}. For ${industry}, typical businesses operate on ${low}–${high}% margins — I'll need your profitability before I can say where you sit in that range.`;
  }
  return `At about ${amount} in revenue, I can start narrowing the benchmarks that matter. Profitability is the next piece I need.`;
}