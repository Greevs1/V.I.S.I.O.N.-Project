/**
 * Domain Focus — the domain-specific canvas focus experience.
 *
 * Clicking a Pulse signal focuses the central canvas on that domain.
 * No route change. The domain surface is conversational intelligence,
 * not a dashboard.
 *
 * Each domain has:
 *   - A header with the current indicator + trend
 *   - Industry context (where supported)
 *   - Best-in-class (where supported)
 *   - A Galileo observation about what's driving the current state
 *   - Relevant objects (Opportunity, Trend, Evidence, Question, Scenario, Play)
 *   - Conversation starters for that domain
 */

export const Domain = {
  CASH: 'cash',
  TAX: 'tax',
  PROFIT: 'profit',
  OPERATIONS: 'operations',
  VALUE: 'value',
  FREEDOM: 'freedom',
};

const DOMAIN_LABELS = {
  [Domain.CASH]: 'Cash',
  [Domain.TAX]: 'Tax',
  [Domain.PROFIT]: 'Profit',
  [Domain.OPERATIONS]: 'Operations',
  [Domain.VALUE]: 'Value',
  [Domain.FREEDOM]: 'Freedom',
};

const DOMAIN_COLORS = {
  [Domain.CASH]: '#00D9FF',
  [Domain.TAX]: '#00D1B2',
  [Domain.PROFIT]: '#A855F7',
  [Domain.OPERATIONS]: '#FF4D57',
  [Domain.VALUE]: '#D4A853',
  [Domain.FREEDOM]: '#7C3AED',
};

/**
 * buildDomainFocus — constructs the domain focus content from the business model.
 *
 * @param {string} domain — one of Domain.*
 * @param {object} model — the business intelligence model
 * @param {object} ctx — additional context (opportunities, sprints, etc.)
 * @returns {object} — domain focus content
 */
export function buildDomainFocus(domain, model = {}, ctx = {}) {
  const label = DOMAIN_LABELS[domain] || domain;
  const signal = model?.signals?.[domain];

  const focus = {
    domain,
    label,
    indicator: extractIndicator(domain, signal, model, ctx),
    trend: extractTrend(domain, signal, model, ctx),
    industryContext: extractIndustryContext(domain, signal, ctx),
    bestInClass: extractBestInClass(domain, signal, ctx),
    observation: buildObservation(domain, signal, model, ctx),
    relevantObjects: extractRelevantObjects(domain, model, ctx),
    conversationStarters: getDomainConversationStarters(domain, signal),
  };

  return focus;
}

function extractIndicator(domain, signal, model, ctx) {
  if (!signal) return { value: null, label: 'Learning' };

  switch (domain) {
    case Domain.PROFIT:
      if (signal.margin != null) {
        return { value: `${signal.margin.toFixed(1)}%`, label: 'Current margin' };
      }
      return { value: null, label: 'Learning' };

    case Domain.VALUE:
      if (signal.current != null) {
        return { value: formatMoney(signal.current), label: 'Estimated value' };
      }
      return { value: null, label: 'Learning' };

    case Domain.OPERATIONS:
      if (signal.score != null) {
        return {
          value: signal.score < 40 ? 'High dependency' : signal.score < 65 ? 'Moderate' : 'Light',
          label: 'Owner involvement',
        };
      }
      return { value: null, label: 'Learning' };

    case Domain.FREEDOM:
      if (signal.score != null) {
        return {
          value: signal.score < 40 ? 'Constrained' : signal.score < 65 ? 'Moderate' : 'Free',
          label: 'Owner freedom',
        };
      }
      return { value: null, label: 'Learning' };

    case Domain.CASH:
      return { value: null, label: 'Connect financials' };

    case Domain.TAX:
      return { value: null, label: 'Connect tax data' };

    default:
      return { value: null, label: 'Learning' };
  }
}

function extractTrend(domain, signal, model, ctx) {
  if (!signal) return null;

  switch (domain) {
    case Domain.PROFIT:
      if (signal.trend != null) {
        const pts = signal.trend > 0 ? `+${signal.trend.toFixed(1)}` : signal.trend.toFixed(1);
        return { value: `${pts} pts`, direction: signal.trend > 0 ? 'up' : 'down' };
      }
      return null;

    case Domain.VALUE:
      if (signal.gap != null && signal.gap > 0) {
        return { value: `+${formatMoney(signal.gap)} modeled`, direction: 'up' };
      }
      return null;

    case Domain.OPERATIONS:
    case Domain.FREEDOM:
      return null;

    default:
      return null;
  }
}

function extractIndustryContext(domain, signal, ctx) {
  if (domain === Domain.PROFIT && signal?.benchmark) {
    return {
      label: 'Industry context',
      typical: signal.benchmark.typicalLow && signal.benchmark.typicalHigh
        ? `${signal.benchmark.typicalLow}–${signal.benchmark.typicalHigh}%`
        : null,
      bestInClass: signal.benchmark.bestInClass ? `${signal.benchmark.bestInClass}%` : null,
    };
  }
  return null;
}

function extractBestInClass(domain, signal, ctx) {
  if (domain === Domain.PROFIT && signal?.benchmark?.bestInClass) {
    return { label: 'Best-in-class', value: `${signal.benchmark.bestInClass}%` };
  }
  return null;
}

function buildObservation(domain, signal, model, ctx) {
  if (!signal) return null;

  switch (domain) {
    case Domain.PROFIT:
      if (signal.benchmark && signal.margin != null) {
        if (signal.benchmark.bestInClass && signal.margin >= signal.benchmark.bestInClass) {
          return `Your margin is above best-in-class for your industry. That's exceptional.`;
        }
        if (signal.benchmark.typicalHigh && signal.margin > signal.benchmark.typicalHigh) {
          return `Your margin is above typical for your industry. There may be room to push further.`;
        }
        if (signal.benchmark.typicalLow && signal.margin < signal.benchmark.typicalLow) {
          const gap = signal.gap || 0;
          if (gap > 0) {
            return `Your margin is below typical for your industry. At your current revenue, that represents approximately ${formatMoney(gap)} of modeled annual gap.`;
          }
          return `Your margin is below typical for your industry. There's meaningful room to improve.`;
        }
        return `Your margin is within the typical range for your industry.`;
      }
      return null;

    case Domain.VALUE:
      if (signal.current != null && signal.gap != null && signal.gap > 0) {
        return `Your current estimated value is ${formatMoney(signal.current)}. Closing the gap to potential could add approximately ${formatMoney(signal.gap)}.`;
      }
      if (signal.current != null) {
        return `Your current estimated value is ${formatMoney(signal.current)}.`;
      }
      return null;

    case Domain.OPERATIONS:
      if (signal.score != null) {
        if (signal.score < 40) {
          return `Heavy owner involvement is one of the biggest drags on both your freedom and what a buyer would pay.`;
        }
        if (signal.score < 65) {
          return `Moderate involvement is common, but reducing it further is often where hidden value sits.`;
        }
        return `Light involvement usually means the business can run without you, which matters for both freedom and value.`;
      }
      return null;

    case Domain.FREEDOM:
      if (signal.score != null) {
        if (signal.score < 40) {
          return `You're currently constrained by the business. Reducing dependency would improve both quality of life and business value.`;
        }
        return null;
      }
      return null;

    default:
      return null;
  }
}

function extractRelevantObjects(domain, model, ctx) {
  const objects = [];
  const opportunities = ctx.opportunities || model?.opportunities || [];

  for (const opp of opportunities) {
    if (opp.domain === domain || opp.category === domain || domainMatchesOpportunity(domain, opp)) {
      objects.push({
        type: 'opportunity',
        id: opp.id || null,
        title: opp.title,
        impact: opp.impact || opp.potentialValueImpact || opp.modeledImpact,
        state: opp.status || opp.qualificationState,
      });
    }
  }

  return objects.slice(0, 3); // Show only most relevant
}

function domainMatchesOpportunity(domain, opp) {
  const oppDomain = (opp.domain || opp.category || '').toLowerCase();
  if (domain === Domain.PROFIT && (oppDomain.includes('profit') || oppDomain.includes('margin'))) return true;
  if (domain === Domain.VALUE && (oppDomain.includes('value') || oppDomain.includes('valuation'))) return true;
  if (domain === Domain.OPERATIONS && (oppDomain.includes('operation') || oppDomain.includes('management'))) return true;
  if (domain === Domain.FREEDOM && (oppDomain.includes('freedom') || oppDomain.includes('dependency'))) return true;
  if (domain === Domain.TAX && oppDomain.includes('tax')) return true;
  if (domain === Domain.CASH && (oppDomain.includes('cash') || oppDomain.includes('flow'))) return true;
  return false;
}

/**
 * getDomainConversationStarters — returns contextual commands for a domain.
 *
 * Phase 5.1: Only returns commands that have REAL handlers in GalileoHome.handleCommand.
 * No button renders without a working action.
 *
 * Real handlers:
 *   connect_financials → connections view
 *   view_opportunities → playbook view (domain-filtered)
 *   view_plays → playbook view (active tab)
 */
export function getDomainConversationStarters(domain, signal) {
  const base = {
    [Domain.PROFIT]: [
      { label: 'View profit opportunities', action: 'view_opportunities' },
    ],
    [Domain.VALUE]: [
      { label: 'View value opportunities', action: 'view_opportunities' },
    ],
    [Domain.OPERATIONS]: [
      { label: 'View operations opportunities', action: 'view_opportunities' },
    ],
    [Domain.FREEDOM]: [
      { label: 'View freedom opportunities', action: 'view_opportunities' },
    ],
    [Domain.CASH]: [
      { label: 'Connect financials', action: 'connect_financials' },
    ],
    [Domain.TAX]: [
      { label: 'Connect tax data', action: 'connect_financials' },
      { label: 'View tax opportunities', action: 'view_opportunities' },
    ],
  };

  return base[domain] || [];
}

function formatMoney(n) {
  if (n == null) return null;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
}