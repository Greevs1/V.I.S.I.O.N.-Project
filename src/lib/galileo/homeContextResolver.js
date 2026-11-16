/**
 * Home Context Resolver — determines which Galileo experience to show.
 *
 * The same shell supports all experiences. This resolver decides what
 * renders in the center canvas:
 *
 *   magic_loop    → New/low-intelligence user (discovery conversation)
 *   galileo_home  → Returning user with sufficient business intelligence
 *
 * A returning user should NEVER see onboarding again. If the business
 * model has sufficient persisted intelligence, load Galileo Home directly.
 *
 * If Galileo needs missing information later, it asks naturally:
 *   "Before I model that, there's one thing I don't know yet..."
 */

export const HomeMode = {
  MAGIC_LOOP: 'magic_loop',
  GALILEO_HOME: 'galileo_home',
};

/**
 * resolveHomeMode — determines the experience mode from context.
 *
 * @param {object} ctx — {
 *   isAuthenticated, hasBusinessModel, modelCompleteness,
 *   hasFinancials, hasOpportunities, hasActiveSprints
 * }
 * @returns {object} — { mode, reason }
 */
export function resolveHomeMode(ctx = {}) {
  const {
    isAuthenticated = false,
    hasIntelligence = false,
    hasFinancials = false,
    hasOpportunities = false,
    hasActiveSprints = false,
  } = ctx;

  // Not authenticated → always Magic Loop (anonymous discovery)
  if (!isAuthenticated) {
    return { mode: HomeMode.MAGIC_LOOP, reason: 'anonymous_guest' };
  }

  // Authenticated but no meaningful persisted intelligence → Magic Loop
  // (new user, or user with empty account)
  if (!hasIntelligence) {
    return { mode: HomeMode.MAGIC_LOOP, reason: 'no_business_intelligence' };
  }

  // Authenticated with meaningful persisted intelligence → Galileo Home
  // A business qualifies for Home if BIS has real data — regardless of
  // whether sprints or opportunities exist.
  return {
    mode: HomeMode.GALILEO_HOME,
    reason: 'returning_user',
    bias: hasActiveSprints ? 'produce' : 'create',
  };
}

/**
 * resolveHomeMaturity — determines the user's maturity stage.
 * The interface stays the same; the intelligence changes.
 *
 * @param {object} ctx — { modelCompleteness, hasFinancials, hasActiveSprints, hasGoals, hasValuation }
 * @returns {object} — { stage, description }
 */
export function resolveHomeMaturity(ctx = {}) {
  const {
    modelCompleteness = 0,
    hasFinancials = false,
    hasActiveSprints = false,
    hasGoals = false,
    hasValuation = false,
  } = ctx;

  // EARLY — still learning, no financials
  if (modelCompleteness < 40 && !hasFinancials) {
    return {
      stage: 'early',
      description: 'Galileo is still learning your business',
      prioritize: 'discovery',
    };
  }

  // ACTIVE IMPLEMENTATION — has active sprints
  if (hasActiveSprints) {
    return {
      stage: 'implementing',
      description: 'Galileo is tracking your active work',
      prioritize: 'actions',
    };
  }

  // EXIT PREPARATION — has goals + valuation
  if (hasGoals && hasValuation) {
    return {
      stage: 'exit_prep',
      description: 'Galileo is focused on your exit readiness',
      prioritize: 'value_risks',
    };
  }

  // MATURE — has financials, model is built
  if (hasFinancials && modelCompleteness >= 40) {
    return {
      stage: 'mature',
      description: 'Galileo is monitoring your business',
      prioritize: 'opportunities_trends',
    };
  }

  return {
    stage: 'early',
    description: 'Galileo is still learning your business',
    prioritize: 'discovery',
  };
}