/**
 * Estimate Helper — intelligent EBITDA estimation when the user doesn't know.
 *
 * Instead of dead-ending when a user doesn't know their EBITDA, Galileo asks
 * easier questions and derives a modeled estimate.
 *
 * All estimates are labeled "MODELED ESTIMATE" — never presented as
 * document-supported fact.
 *
 * Uses existing assessment knowledge: industry-typical margins from the
 * benchmark system, owner compensation as a proxy, and range-based estimation.
 */

const MARGIN_RANGES = [
  { value: 'under_5', label: 'Less than 5%', min: 0, mid: 0.025, max: 0.05 },
  { value: 'five_to_ten', label: 'Around 5–10%', min: 0.05, mid: 0.075, max: 0.10 },
  { value: 'ten_to_twenty', label: '10–20%', min: 0.10, mid: 0.15, max: 0.20 },
  { value: 'over_twenty', label: 'More than 20%', min: 0.20, mid: 0.25, max: 0.35 },
];

/**
 * getEstimateQuestions — returns the sequence of estimate questions.
 * Galileo starts with the easiest approach and escalates if needed.
 */
export function getEstimateQuestions(revenue, benchmark) {
  const questions = [];

  // Approach 1: Margin range (easiest, most universal)
  questions.push({
    id: 'margin_range',
    prompt: 'Would you say the business usually keeps less than 5%, around 5–10%, 10–20%, or more than 20% after operating expenses?',
    sub: 'This is your profit margin — what stays after paying for everything that keeps the business running.',
    inputType: 'choice',
    options: MARGIN_RANGES.map((r) => ({ value: r.value, label: r.label })),
    allowSkip: true,
  });

  // Approach 2: Owner compensation (good proxy for small businesses)
  if (revenue && revenue > 0) {
    questions.push({
      id: 'owner_comp',
      prompt: 'About how much did you personally take out of the business last year?',
      sub: 'Owner salary, distributions, or profit — a rough number helps me estimate.',
      inputType: 'number',
      placeholder: 'e.g. 150000',
      prefix: '$',
      allowSkip: true,
    });
  }

  return questions;
}

/**
 * calculateEstimateFromMargin — derives EBITDA from a selected margin range.
 */
export function calculateEstimateFromMargin(revenue, rangeValue) {
  const range = MARGIN_RANGES.find((r) => r.value === rangeValue);
  if (!range || !revenue) return null;

  const ebitda = Math.round(revenue * range.mid);
  return {
    ebitda,
    margin: range.mid * 100,
    method: `Estimated from your revenue × typical margin range (${range.label})`,
    label: 'MODELED ESTIMATE',
    range,
  };
}

/**
 * calculateEstimateFromOwnerComp — derives EBITDA from owner compensation.
 * Uses the industry benchmark margin to estimate total EBITDA, then
 * adds back owner compensation as a proxy.
 */
export function calculateEstimateFromOwnerComp(revenue, ownerComp, benchmark) {
  if (!revenue || !ownerComp) return null;

  const industryMargin = benchmark?.averageMargin ? benchmark.averageMargin / 100 : 0.08;
  const benchmarkEbitda = Math.round(revenue * industryMargin);
  // Owner comp is part of EBITDA add-backs; estimate = benchmark + owner comp adjustment
  const estimatedEbitda = Math.round(benchmarkEbitda + (ownerComp * 0.5));

  return {
    ebitda: estimatedEbitda,
    margin: (estimatedEbitda / revenue) * 100,
    method: `Estimated from your owner compensation + industry-typical margin`,
    label: 'MODELED ESTIMATE',
  };
}

/**
 * calculateEstimateFromBenchmark — derives EBITDA from industry-typical margin.
 * Used as a fallback when the user skips all estimate questions.
 */
export function calculateEstimateFromBenchmark(revenue, benchmark) {
  if (!revenue) return null;

  const margin = benchmark?.averageMargin ? benchmark.averageMargin / 100 : 0.08;
  const ebitda = Math.round(revenue * margin);

  return {
    ebitda,
    margin: margin * 100,
    method: `Estimated from industry-typical margin (${benchmark?.normalizedIndustry || 'your industry'})`,
    label: 'MODELED ESTIMATE',
  };
}

/**
 * getEstimateFromAnswers — processes estimate flow answers and returns
 * the best available estimate.
 */
export function getEstimateFromAnswers(revenue, estimateAnswers, benchmark) {
  if (estimateAnswers?.margin_range) {
    return calculateEstimateFromMargin(revenue, estimateAnswers.margin_range);
  }
  if (estimateAnswers?.owner_comp) {
    return calculateEstimateFromOwnerComp(revenue, estimateAnswers.owner_comp, benchmark);
  }
  return calculateEstimateFromBenchmark(revenue, benchmark);
}