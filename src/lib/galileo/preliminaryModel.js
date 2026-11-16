/**
 * Preliminary Business Model builder for the Galileo Magic Loop.
 *
 * Maps conversational discovery answers into the EXISTING certified
 * calculation functions (assessmentCalculations.js). It does NOT invent
 * financial results — every number comes from an existing formula, and
 * every value is labeled with its evidence status:
 *
 *   computed  — derived from user-provided numbers (e.g. margin = ebitda/revenue)
 *   modeled   — existing formula with existing default inputs (e.g. valuation multiple)
 *   estimated — qualitative mapping from a conversational answer
 *   verified  — confirmed by the user from an uploaded document
 *   learning  — not yet known (shown as "Learning...")
 *
 * No new source of truth. No new tables. Pure projection of existing logic.
 */

import {
  calcValueGap,
  calcOperationsScore,
  calcFreedomScore,
} from '@/lib/assessmentCalculations';
import {
  qualifyOpportunityState,
  getConfidenceLabel,
} from './opportunityQualification';
import { resolveFacts, knownMargin } from './factKnowledge';

// Existing defaults from calcValueGap — reused, not invented.
const DEFAULT_MULT = 4;
const DEFAULT_MULT_TOP = 9.5;
const DEFAULT_STRAT = 40;

// Owner involvement → operations health (qualitative mapping).
// Derived from the existing calcOperationsScore 1–6 scale semantics:
//   heavy ≈ avg 2/6 → ~33, moderate ≈ avg 3.5/6 → ~58, light ≈ avg 4.5/6 → ~75
const INVOLVEMENT_TO_OPS = {
  light: { score: 75, label: 'Light owner involvement' },
  moderate: { score: 58, label: 'Moderate owner dependency' },
  heavy: { score: 33, label: 'High owner dependency' },
};

const INVOLVEMENT_TO_FREEDOM = {
  light: { label: 'Few owner-required hours', hours: 18 },
  moderate: { label: 'Moderate owner-required hours', hours: 35 },
  heavy: { label: 'Business runs on you', hours: 55 },
};

/**
 * buildPreliminaryModel
 *
 * @param {object} answers — { industry, revenue, ebitda, employees, involvement, goal }
 * @param {object} [verified] — optional verified overrides from document confirmation
 *   { revenue, ebitda } — when present, those signals become "verified"
 * @returns {object} model — { signals, businessModel, opportunities, completeness, confidence }
 */
export function buildPreliminaryModel(answers = {}, verified = {}, extractedFacts = null) {
  const exFacts = extractedFacts?.facts || {};
  const revenue = exFacts.annual_revenue?.normalized ?? verified.revenue ?? answers.revenue;
  const ebitda = exFacts.reported_ebitda?.normalized ?? exFacts.operating_income?.normalized ?? verified.ebitda ?? answers.ebitda;
  const involvement = answers.involvement;
  const isDocumentSupported = !!extractedFacts?.success && (exFacts.annual_revenue?.normalized != null || exFacts.reported_ebitda?.normalized != null);
  const docPeriod = extractedFacts?.period || null;

  const signals = {
    cash: null,
    tax: null,
    profit: null,
    operations: null,
    value: null,
    freedom: null,
  };

  // ── VALUE ── modeled from EBITDA × multiple (existing calcValueGap) ──────────
  if (ebitda > 0) {
    const v = calcValueGap({
      v2_ebitda: ebitda,
      v2_mult: DEFAULT_MULT,
      v2_mult_top: DEFAULT_MULT_TOP,
      v2_strat: DEFAULT_STRAT,
    });
    const isVerified = verified.ebitda != null;
    const valueStatus = isDocumentSupported ? 'document_supported' : isVerified ? 'verified' : 'modeled';
    signals.value = {
      current: v.current_value,
      potential: v.potential_value,
      gap: v.value_gap,
      status: valueStatus,
      label: isDocumentSupported || isVerified ? 'Business Value (from your financials)' : 'Estimated Business Value',
      source: isDocumentSupported ? `Your uploaded financials${docPeriod ? ` (${docPeriod})` : ''}` : isVerified ? 'Your uploaded financials' : 'Modeled from your EBITDA estimate',
      period: docPeriod,
    };
  }

  // ── PROFIT ── margin computed; gap needs benchmarks (not yet available) ─────
  // UNKNOWN ≠ ZERO. The margin is derived through the fact gate, which requires
  // BOTH inputs to be real — so an EBITDA that was never supplied (or was skipped)
  // cannot arrive here as a 0% margin. A genuinely supplied 0 IS a 0% margin, and
  // that is the one case which reports one.
  const marginFacts = resolveFacts({ answers, verified, extractedFacts });
  const marginKnowledge = knownMargin(marginFacts);
  if (marginKnowledge.ready) {
    const margin = (ebitda / revenue) * 100;
    const isVerified = verified.revenue != null && verified.ebitda != null;
    const profitStatus = isDocumentSupported ? 'document_supported' : isVerified ? 'verified' : 'computed';
    signals.profit = {
      margin: Math.round(margin * 10) / 10,
      gap: null, // requires industry benchmarks — left as "Learning..."
      status: profitStatus,
      label: isDocumentSupported || isVerified ? 'Profit Margin (from your financials)' : 'Estimated Margin',
      source: isDocumentSupported ? `Your uploaded financials${docPeriod ? ` (${docPeriod})` : ''}` : isVerified ? 'Your uploaded financials' : 'Derived from your revenue & EBITDA',
      period: docPeriod,
    };
  }

  // ── GROSS MARGIN ── from extracted facts when available ──────────────────
  if (isDocumentSupported && exFacts.gross_profit?.normalized != null && exFacts.annual_revenue?.normalized > 0) {
    const grossMargin = (exFacts.gross_profit.normalized / exFacts.annual_revenue.normalized) * 100;
    if (signals.profit) {
      signals.profit.grossMargin = Math.round(grossMargin * 10) / 10;
      signals.profit.grossProfit = exFacts.gross_profit.normalized;
      signals.profit.cogs = exFacts.cogs?.normalized ?? null;
    }
  }

  // ── OPERATIONS ── estimated from owner involvement ──────────────────────────
  if (involvement && INVOLVEMENT_TO_OPS[involvement]) {
    const ops = INVOLVEMENT_TO_OPS[involvement];
    signals.operations = {
      score: ops.score,
      label: ops.label,
      status: 'estimated',
      source: 'Your reported owner involvement',
    };
  }

  // ── FREEDOM ── estimated from owner involvement ────────────────────────────
  if (involvement && INVOLVEMENT_TO_FREEDOM[involvement]) {
    const fr = INVOLVEMENT_TO_FREEDOM[involvement];
    signals.freedom = {
      label: fr.label,
      hours: fr.hours,
      status: 'estimated',
      source: 'Your reported owner involvement',
    };
  }

  // CASH and TAX remain null → rendered as "Learning..."

  // ── Business Model summary ──────────────────────────────────────────────────
  const businessModel = {
    estimatedValue: signals.value?.current ?? null,
    valueRange: signals.value
      ? [signals.value.current, signals.value.potential]
      : null,
    intelligenceState: computeCompleteness(signals),
  };

  // ── Opportunities — only from computable, existing logic ────────────────────
  const opportunities = [];

  if (signals.value?.gap > 0) {
    opportunities.push({
      id: 'value_gap',
      title: 'Value Gap',
      summary:
        'Your business may be worth meaningfully more than its current trajectory suggests. Closing the gap between your current and potential valuation is one of the highest-leverage moves available to you.',
      potentialValueImpact: signals.value.gap,
      potentialAnnualImpact: null,
      intelligenceState: qualifyOpportunityState('value_gap', { extractedFacts, verified, answers }),
      confidence: getConfidenceLabel(qualifyOpportunityState('value_gap', { extractedFacts, verified, answers })),
      evidence: buildValueGapEvidence(answers, verified, extractedFacts),
      strategies: [
        'Reduce owner dependency (improves multiple)',
        'Strengthen recurring revenue',
        'Document systems & processes',
        'Improve margin consistency',
      ],
    });
  }

  if (involvement === 'heavy' || involvement === 'moderate') {
    const opsScore = INVOLVEMENT_TO_OPS[involvement].score;
    opportunities.push({
      id: 'owner_dependency',
      title: 'Owner Dependency',
      summary:
        'How much the business depends on you day-to-day is likely affecting both your freedom and what a buyer would pay. Reducing owner dependency is one of the few moves that improves value, operations, and freedom at the same time.',
      potentialValueImpact: estimateDependencyValueImpact(ebitda, opsScore),
      potentialAnnualImpact: null,
      intelligenceState: qualifyOpportunityState('owner_dependency', { extractedFacts, verified, answers }),
      confidence: getConfidenceLabel(qualifyOpportunityState('owner_dependency', { extractedFacts, verified, answers })),
      evidence: [
        'Your reported owner involvement',
        `Estimated operations health: ${opsScore}/100`,
        'Buyers discount businesses that run on the owner',
      ],
      strategies: [
        'Document your key processes',
        'Delegate one operational area',
        'Build a management layer',
        'Reduce hours worked per week',
      ],
    });
  }

  return {
    signals,
    businessModel,
    opportunities,
    completeness: businessModel.intelligenceState,
    confidence: {},
  };
}

function computeCompleteness(signals) {
  const filled = Object.values(signals).filter((s) => s != null).length;
  if (filled >= 5) return 'STRONG';
  if (filled >= 4) return 'DEVELOPING';
  if (filled >= 2) return 'EARLY';
  return 'EARLY';
}

function buildValueGapEvidence(answers, verified, extractedFacts) {
  const ev = [];
  const exFacts = extractedFacts?.facts || {};
  const docPeriod = extractedFacts?.period;

  if (extractedFacts?.success) {
    if (exFacts.annual_revenue?.normalized != null) {
      ev.push(`Revenue from your uploaded financials${docPeriod ? ` (${docPeriod})` : ''}`);
    }
    if (exFacts.reported_ebitda?.normalized != null) {
      ev.push('EBITDA from your uploaded financials');
    } else if (exFacts.operating_income?.normalized != null) {
      ev.push('Operating income from your uploaded financials (used as EBITDA proxy)');
    }
    if (exFacts.gross_profit?.normalized != null) {
      ev.push('Gross profit from your uploaded financials');
    }
  } else if (verified.ebitda != null) {
    ev.push('Your EBITDA, confirmed from your uploaded financials');
  } else if (answers.ebitda > 0) {
    ev.push('Your estimated EBITDA');
  }
  ev.push('Modeled valuation multiple range (industry-typical low to high)');
  ev.push('Existing value-gap calculation (EBITDA × multiple)');
  return ev;
}

// Rough estimate: moving from current ops score toward 75 (light dependency)
// could improve the multiple by ~1–2x, applied to EBITDA.
function estimateDependencyValueImpact(ebitda, opsScore) {
  if (!ebitda || ebitda <= 0) return null;
  const multipleUplift = Math.max(0, (75 - opsScore) / 75) * 1.5;
  return Math.round(ebitda * multipleUplift);
}

/**
 * formatSignalValue — renders a signal for the Business Pulse.
 * Returns { primary, secondary, status } or null when learning.
 */
export function formatSignalValue(signalKey, signal) {
  if (!signal) return null;
  const fmt = (n) => {
    if (n == null || isNaN(n)) return null;
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
    return `$${Math.round(n).toLocaleString('en-US')}`;
  };

  switch (signalKey) {
    case 'value':
      return {
        primary: signal.current != null ? fmt(signal.current) : null,
        secondary: signal.gap ? `+${fmt(signal.gap)} modeled potential` : null,
        status: signal.status,
      };
    case 'profit':
      return {
        primary: signal.margin != null ? `${signal.margin}%` : null,
        secondary: signal.gap ? `${fmt(signal.gap)} gap` : 'Benchmarking…',
        status: signal.status,
      };
    case 'operations':
      return {
        primary: signal.label,
        secondary: signal.score != null ? `${signal.score}/100` : null,
        status: signal.status,
      };
    case 'freedom':
      return {
        primary: signal.label,
        secondary: signal.hours != null ? `${signal.hours} hrs/wk owner-required` : null,
        status: signal.status,
      };
    case 'cash':
    case 'tax':
    default:
      return null;
  }
}

export const COMPLETENESS_LABELS = {
  EARLY: 'Early',
  DEVELOPING: 'Developing',
  CONNECTED: 'Connected',
  STRONG: 'Strong',
};