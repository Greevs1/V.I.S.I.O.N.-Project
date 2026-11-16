/**
 * Opportunity Intelligence State Qualification
 *
 * Determines the intelligence state of an opportunity based on evidence
 * DIRECTLY RELEVANT to that specific opportunity. A successful document
 * extraction alone does NOT validate an opportunity — validation requires
 * evidence specific to the opportunity's underlying conclusion and calculation.
 *
 * States:
 *   hypothesis  — evidence suggests something worth investigating, but
 *                 insufficient evidence exists to quantify or substantiate
 *   supported   — enough relevant evidence to model/quantify a potential
 *                 opportunity, but important assumptions remain
 *   validated   — evidence directly relevant to the specific opportunity
 *                 sufficiently supports the underlying conclusion
 *   captured    — implementation occurred and actual results measured
 *                 (not implemented in Phase 1.2)
 *
 * Example: Finding Revenue + EBITDA in a P&L does NOT validate a margin-
 * improvement opportunity. A margin opportunity may require evidence such
 * as current gross margin, historical gross margin, appropriate benchmark,
 * COGS trend, pricing information, and other directly relevant evidence.
 */

export const INTELLIGENCE_STATES = {
  HYPOTHESIS: 'hypothesis',
  SUPPORTED: 'supported',
  VALIDATED: 'validated',
  CAPTURED: 'captured',
};

/**
 * Evidence requirements per opportunity type.
 * Each opportunity defines what evidence is needed for `supported` and
 * `validated` states. `hypothesis` is always achievable (it only requires
 * the opportunity to exist). `validated` is intentionally strict — it
 * requires evidence directly relevant to the specific conclusion.
 */
const OPPORTUNITY_REQUIREMENTS = {
  // Value Gap = (potential_value - current_value) where value = EBITDA × multiple
  value_gap: {
    supported: (evidence) => {
      // Need real EBITDA from a document to model the gap with real earnings.
      // The multiple remains modeled (industry-typical), so this is SUPPORTED,
      // not VALIDATED.
      const ex = evidence.extractedFacts?.facts || {};
      return !!evidence.extractedFacts?.success && (
        ex.reported_ebitda?.normalized != null ||
        ex.operating_income?.normalized != null
      );
    },
    validated: (_evidence) => {
      // Would require: real EBITDA + actual multiple evidence (comparable
      // transactions, industry-specific multiple data). Not achievable in
      // Phase 1.2 — the multiple is always modeled.
      return false;
    },
  },

  // Owner Dependency = operations health from formal assessment + systems evidence
  owner_dependency: {
    supported: (evidence) => {
      // Need a formal operations assessment (not available in the Magic Loop).
      return !!evidence.assessments?.operations_completed;
    },
    validated: (_evidence) => {
      // Would require: operations assessment + document evidence of
      // documented systems/processes. Not achievable in Phase 1.2.
      return false;
    },
  },

  // Margin Improvement = close gap between current and benchmark margin
  margin_improvement: {
    supported: (evidence) => {
      // Need current gross margin from a document (revenue + gross_profit).
      const ex = evidence.extractedFacts?.facts || {};
      return !!evidence.extractedFacts?.success &&
        ex.gross_profit?.normalized != null &&
        ex.annual_revenue?.normalized > 0;
    },
    validated: (_evidence) => {
      // Would require: current margin + historical margin + benchmark +
      // COGS trend + pricing information. Not achievable in Phase 1.2.
      return false;
    },
  },
};

/**
 * qualifyOpportunityState — determines the intelligence state of an opportunity.
 *
 * @param {string} opportunityType — 'value_gap', 'owner_dependency', 'margin_improvement', etc.
 * @param {object} evidence — { extractedFacts, verified, answers, assessments }
 * @returns {string} — 'hypothesis' | 'supported' | 'validated' | 'captured'
 */
export function qualifyOpportunityState(opportunityType, evidence = {}) {
  const requirements = OPPORTUNITY_REQUIREMENTS[opportunityType];
  if (!requirements) return INTELLIGENCE_STATES.HYPOTHESIS;

  // Check states from strongest to weakest
  if (requirements.validated(evidence)) return INTELLIGENCE_STATES.VALIDATED;
  if (requirements.supported(evidence)) return INTELLIGENCE_STATES.SUPPORTED;
  return INTELLIGENCE_STATES.HYPOTHESIS;
}

/**
 * getOpportunityStateLabel — returns a human-readable label for the state.
 */
export function getOpportunityStateLabel(state) {
  switch (state) {
    case INTELLIGENCE_STATES.VALIDATED: return 'Validated Opportunity';
    case INTELLIGENCE_STATES.SUPPORTED: return 'Supported Opportunity';
    case INTELLIGENCE_STATES.HYPOTHESIS: return 'Hypothesis';
    case INTELLIGENCE_STATES.CAPTURED: return 'Captured Outcome';
    default: return 'Hypothesis';
  }
}

/**
 * getOpportunityStateColor — returns Tailwind classes for the state badge.
 */
export function getOpportunityStateColor(state) {
  switch (state) {
    case INTELLIGENCE_STATES.VALIDATED:
      return 'border-emerald-400/30 bg-emerald-400/5 text-emerald-400/80';
    case INTELLIGENCE_STATES.SUPPORTED:
      return 'border-cyan-400/30 bg-cyan-400/5 text-cyan-400/80';
    case INTELLIGENCE_STATES.HYPOTHESIS:
    default:
      return 'border-[#D4A853]/30 bg-[#D4A853]/5 text-[#D4A853]/80';
  }
}

/**
 * getConfidenceLabel — returns a confidence label appropriate for the state.
 */
export function getConfidenceLabel(state) {
  switch (state) {
    case INTELLIGENCE_STATES.VALIDATED: return 'High';
    case INTELLIGENCE_STATES.SUPPORTED: return 'Medium';
    case INTELLIGENCE_STATES.HYPOTHESIS:
    default: return 'Developing';
  }
}