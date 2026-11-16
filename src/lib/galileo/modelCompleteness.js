/**
 * Model Completeness — a subtle "Galileo is learning" indicator.
 *
 * Represents how complete Galileo's model of the business is,
 * NOT confidence in any individual conclusion.
 *
 * Individual conclusions maintain their own confidence/evidence state
 * (User Reported, Document Supported, Modeled, etc.).
 *
 * Weighted by information gain — fields that unlock more intelligence
 * contribute more to completeness.
 */

const FIELD_WEIGHTS = {
  industry: 15,
  revenue: 20,
  ebitda: 25,
  involvement: 15,
  employees: 10,
  goal: 5,
  document: 10,
};

const TOTAL_WEIGHT = Object.values(FIELD_WEIGHTS).reduce((a, b) => a + b, 0);

/**
 * computeModelCompleteness — returns a 0-100 percentage of model completeness.
 *
 * @param {object} answers — { industry, revenue, ebitda, employees, involvement, goal }
 * @param {object|null} extractedFacts — document extraction result
 * @returns {number} 0-100
 */
export function computeModelCompleteness(answers = {}, extractedFacts = null) {
  let score = 0;

  for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
    if (field === 'document') {
      if (extractedFacts?.success) score += weight;
    } else if (answers[field] != null && answers[field] !== '') {
      score += weight;
    }
  }

  return Math.round((score / TOTAL_WEIGHT) * 100);
}

/**
 * getCompletenessLabel — returns a natural language label for the percentage.
 */
export function getCompletenessLabel(pct) {
  if (pct >= 85) return "I'm starting to get a pretty good picture of the business.";
  if (pct >= 60) return "I'm building a useful picture of your business.";
  if (pct >= 40) return "I'm starting to see the shape of your business.";
  if (pct >= 20) return "I'm getting a first look at your business.";
  return "I'm just starting to learn about your business.";
}