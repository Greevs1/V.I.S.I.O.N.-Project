/**
 * NOW Surface — one subtle contextual item that deserves attention.
 *
 * Appears beneath the top bar when something genuinely deserves attention.
 * Only ONE item at a time. No carousel. No news-feed. No notification clutter.
 *
 * If nothing deserves attention, show nothing.
 *
 * Examples:
 *   "Galileo finished analyzing your 2025 financials."
 *   "Your margin is above typical for your industry."
 *   "New opportunity detected."
 *   "Two actions need your attention."
 */

/**
 * selectNowItem — evaluates the current context and returns the single
 * most important NOW item, or null if nothing deserves attention.
 *
 * @param {object} ctx — {
 *   model, answers, extractedFacts, flowState, conversation,
 *   savedCount, isAuthenticated, isReturningUser, activeSprints
 * }
 * @returns {object|null} — { message, type, actionLabel, actionValue } or null
 */
export function selectNowItem(ctx = {}) {
  const {
    model = null,
    answers = {},
    extractedFacts = null,
    flowState = 'welcoming',
    savedCount = 0,
    isAuthenticated = false,
    isReturningUser = false,
    activeSprints = 0,
    recentChanges = [],
  } = ctx;

  // Priority 1: Document analysis just completed (Magic Loop)
  if (extractedFacts?.success && flowState === 'revealing') {
    return {
      type: 'analysis_complete',
      message: "Galileo finished analyzing your financials.",
      actionLabel: 'See what changed',
      actionValue: 'view_results',
    };
  }

  // Priority 2: New opportunity detected (Magic Loop)
  if (model?.opportunities?.length > 0 && flowState === 'opportunity') {
    const opp = model.opportunities[0];
    return {
      type: 'opportunity_detected',
      message: `New opportunity detected: ${opp.title}`,
      actionLabel: 'Investigate',
      actionValue: 'investigate',
    };
  }

  // Priority 3: Recent changes detected (Home — from BIS recent_documents)
  // Only fire if there are real changes since the last visit.
  if (flowState === 'home' && recentChanges && recentChanges.length > 0) {
    const change = recentChanges[0];
    return {
      type: 'recent_change',
      message: recentChanges.length === 1
        ? change.title
        : `${recentChanges.length} new things since your last visit.`,
      actionLabel: 'See what changed',
      actionValue: 'view_changes',
    };
  }

  // Priority 4: Margin observation (Magic Loop — above/below typical)
  if (model?.signals?.profit?.benchmark && answers.revenue && answers.ebitda) {
    const margin = (answers.ebitda / answers.revenue) * 100;
    const bench = model.signals.profit.benchmark;
    if (bench.bestInClass && margin >= bench.bestInClass) {
      return {
        type: 'margin_above_best',
        message: `Your ${margin.toFixed(1)}% margin is above best-in-class for your industry.`,
        actionLabel: null,
        actionValue: null,
      };
    }
    if (bench.typicalHigh && margin > bench.typicalHigh) {
      return {
        type: 'margin_above_typical',
        message: `Your margin is above typical for your industry.`,
        actionLabel: 'See benchmark',
        actionValue: 'view_benchmark',
      };
    }
  }

  // Priority 5: Returning user with active sprints (Home)
  if (isReturningUser && isAuthenticated && activeSprints > 0 && flowState === 'home') {
    return {
      type: 'active_plays',
      message: activeSprints === 1
        ? "You have one active play. Here's what needs your attention."
        : `You have ${activeSprints} active plays. Here's what needs your attention.`,
      actionLabel: 'View plays',
      actionValue: 'view_plays',
    };
  }

  // Priority 6: Saved items exist (Magic Loop)
  if (savedCount > 0 && flowState === 'saving') {
    return {
      type: 'saved_items',
      message: savedCount === 1
        ? "One item saved to your session."
        : `${savedCount} items saved to your session.`,
      actionLabel: null,
      actionValue: null,
    };
  }

  // Nothing deserves attention right now
  return null;
}