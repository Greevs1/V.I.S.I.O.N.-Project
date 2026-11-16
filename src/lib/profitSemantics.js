/**
 * Canonical Profit Semantics — the single source of truth for what each
 * profit/margin figure in the platform MEANS.
 *
 * WHY THIS EXISTS (Phase 6B.1, Blocker 2):
 *   `p1_mymargin` has been treated as a NET PROFIT margin when benchmarked
 *   (the Profit Gap question literally asks "Your Current Net Profit Margin")
 *   and as an EBITDA margin when deriving valuation inputs. Comparing an
 *   EBITDA margin against a net-profit benchmark always flatters the user,
 *   because EBITDA margin is structurally higher than net profit margin.
 *
 *   No amount of plumbing can fix that if the FIELD itself carries two
 *   meanings. So: every metric is defined here once, with an explicit key,
 *   and every comparison must name both sides' metric keys. A comparison
 *   between different metric families is REFUSED, never approximated.
 *
 * This is deliberately a typed code-level contract — not a database table.
 *
 * CONSUMERS:
 *   src/lib/assessmentCalculations.js  — calcProfitGap
 *   src/components/assessments/*       — display + opportunity framing
 *   base44/functions/regenerateCiqMetrics, saveAssessmentToSupabase
 */

// ─────────────────────────────────────────────────────────────────────────────
// METRIC KEYS
// ─────────────────────────────────────────────────────────────────────────────

export const MARGIN_METRIC = {
  GROSS_MARGIN: 'gross_margin',
  EBITDA_MARGIN: 'ebitda_margin',
  OPERATING_MARGIN: 'operating_margin',
  NET_PROFIT_MARGIN: 'net_profit_margin',
};

export const AMOUNT_METRIC = {
  REVENUE: 'revenue',
  GROSS_PROFIT: 'gross_profit',
  EBITDA: 'ebitda',
  OPERATING_INCOME: 'operating_income',
  NET_INCOME: 'net_income',
};

// ─────────────────────────────────────────────────────────────────────────────
// PROVENANCE — how much a stored margin value can be trusted
// ─────────────────────────────────────────────────────────────────────────────

export const MARGIN_PROVENANCE = {
  /** The user was asked for this exact margin and entered it. */
  VERIFIED: 'verified',
  /** Derived from an explicit EBITDA figure. Verified as EBITDA, not as net. */
  DERIVED_FROM_EBITDA: 'derived_from_ebitda',
  /** Derived by treating a net-profit margin as if it were EBITDA (an estimate). */
  ESTIMATED_FROM_NET_PROFIT: 'estimated_from_net_profit',
  /** Historical value whose metric family cannot be established. Not comparable. */
  AMBIGUOUS_LEGACY: 'ambiguous_legacy',
};

export const LEGACY_MARGIN_CLASSIFICATION = {
  VERIFIED_NET_PROFIT_MARGIN: 'VERIFIED_NET_PROFIT_MARGIN',
  VERIFIED_EBITDA_MARGIN: 'VERIFIED_EBITDA_MARGIN',
  AMBIGUOUS_LEGACY_MARGIN: 'AMBIGUOUS_LEGACY_MARGIN',
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPARISON OUTCOMES
// ─────────────────────────────────────────────────────────────────────────────

export const PROFIT_POSITION = {
  BELOW_BENCHMARK: 'BELOW_BENCHMARK',
  WITHIN_RANGE: 'WITHIN_RANGE',
  ABOVE_BENCHMARK: 'ABOVE_BENCHMARK',
  NEEDS_VERIFICATION: 'NEEDS_VERIFICATION',
  BENCHMARK_UNAVAILABLE: 'BENCHMARK_UNAVAILABLE',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
};

// ─────────────────────────────────────────────────────────────────────────────
// THE CANONICAL METRIC DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

export const PROFIT_METRICS = {
  [AMOUNT_METRIC.REVENUE]: {
    metric_key: 'revenue',
    display_name: 'Revenue',
    definition: 'Total sales before any costs are deducted.',
    numerator: null, denominator: null, unit: 'currency', family: 'amount',
    aliases: ['annual_revenue', 'p1_rev', 'total_revenue', 'sales'],
    benchmark_compatibility: [],
  },
  [AMOUNT_METRIC.GROSS_PROFIT]: {
    metric_key: 'gross_profit',
    display_name: 'Gross Profit',
    definition: 'Revenue minus cost of goods sold.',
    numerator: 'revenue − COGS', denominator: null, unit: 'currency', family: 'amount',
    aliases: ['gross_profit_amount'],
    benchmark_compatibility: [],
  },
  [MARGIN_METRIC.GROSS_MARGIN]: {
    metric_key: 'gross_margin',
    display_name: 'Gross Margin',
    definition: 'Share of revenue left after the direct cost of delivering the product or service.',
    numerator: 'gross_profit', denominator: 'revenue', unit: 'percent', family: 'margin',
    aliases: ['gross_margin_percentage', 'grossMargin', 'gross_margin_pct'],
    benchmark_compatibility: ['gross_margin'],
  },
  [AMOUNT_METRIC.EBITDA]: {
    metric_key: 'ebitda',
    display_name: 'EBITDA',
    definition: 'Earnings before interest, taxes, depreciation and amortisation — profit before financing, tax and accounting write-downs.',
    numerator: null, denominator: null, unit: 'currency', family: 'amount',
    aliases: ['v2_ebitda', 'rc_ebitda', 'reported_ebitda', 'normalized_ebitda', 'recast_ebitda'],
    benchmark_compatibility: [],
  },
  [MARGIN_METRIC.EBITDA_MARGIN]: {
    metric_key: 'ebitda_margin',
    display_name: 'EBITDA Margin',
    definition: 'EBITDA as a share of revenue. Structurally higher than net profit margin.',
    numerator: 'ebitda', denominator: 'revenue', unit: 'percent', family: 'margin',
    aliases: ['ebitda_margin_pct'],
    // IMPORTANT: an EBITDA margin can only ever be compared with an EBITDA benchmark.
    benchmark_compatibility: ['ebitda_margin'],
  },
  [AMOUNT_METRIC.OPERATING_INCOME]: {
    metric_key: 'operating_income',
    display_name: 'Operating Income',
    definition: 'Profit from core operations after operating expenses but before interest and tax.',
    numerator: null, denominator: null, unit: 'currency', family: 'amount',
    aliases: ['operating_profit'],
    benchmark_compatibility: [],
  },
  [MARGIN_METRIC.OPERATING_MARGIN]: {
    metric_key: 'operating_margin',
    display_name: 'Operating Margin',
    definition: 'Operating income as a share of revenue.',
    numerator: 'operating_income', denominator: 'revenue', unit: 'percent', family: 'margin',
    aliases: ['operating_margin_pct'],
    benchmark_compatibility: ['operating_margin'],
  },
  [AMOUNT_METRIC.NET_INCOME]: {
    metric_key: 'net_income',
    display_name: 'Net Profit',
    definition: 'What is left after every business expense, including interest and tax.',
    numerator: null, denominator: null, unit: 'currency', family: 'amount',
    aliases: ['net_profit', 'profit'],
    benchmark_compatibility: [],
  },
  [MARGIN_METRIC.NET_PROFIT_MARGIN]: {
    metric_key: 'net_profit_margin',
    display_name: 'Net Profit Margin',
    definition: 'Net profit as a share of revenue — the percentage of every dollar of revenue the owner keeps.',
    numerator: 'net_income', denominator: 'revenue', unit: 'percent', family: 'margin',
    aliases: ['p1_mymargin', 'profit_margin', 'current_margin', 'current_profit_margin'],
    benchmark_compatibility: ['net_profit_margin'],
  },
};

export function getMetric(key) {
  return PROFIT_METRICS[key] || null;
}

/**
 * The benchmark returned by the `profitBenchmark` function is a NET PROFIT
 * margin benchmark. There is currently NO EBITDA or gross-margin benchmark
 * source in the platform. This constant states that fact in one place.
 */
export const AVAILABLE_BENCHMARK_METRICS = [MARGIN_METRIC.NET_PROFIT_MARGIN];

export function hasBenchmarkFor(metricKey) {
  return AVAILABLE_BENCHMARK_METRICS.includes(metricKey);
}

/**
 * benchmarkCompatible — can these two margins legitimately be compared?
 * Different metric families can never be compared. Full stop.
 */
export function benchmarkCompatible(valueMetricKey, benchmarkMetricKey) {
  if (!valueMetricKey || !benchmarkMetricKey) return false;
  return valueMetricKey === benchmarkMetricKey;
}

/**
 * classifyLegacyMargin — classify a HISTORICAL `p1_mymargin` value.
 *
 * The Profit Gap question asks for a NET PROFIT margin, so a value entered
 * through that question is net profit. A value written by the Magic Loop
 * promotion path was derived from EBITDA. Anything else is ambiguous.
 *
 * Historical values are NEVER reinterpreted — they are classified.
 */
export function classifyLegacyMargin({ sourcePath, marginProvenance } = {}) {
  if (marginProvenance === MARGIN_PROVENANCE.DERIVED_FROM_EBITDA) {
    return LEGACY_MARGIN_CLASSIFICATION.VERIFIED_EBITDA_MARGIN;
  }
  if (sourcePath === 'profit_gap_assessment' || marginProvenance === MARGIN_PROVENANCE.VERIFIED) {
    return LEGACY_MARGIN_CLASSIFICATION.VERIFIED_NET_PROFIT_MARGIN;
  }
  if (sourcePath === 'magic_loop_promotion') {
    return LEGACY_MARGIN_CLASSIFICATION.VERIFIED_EBITDA_MARGIN;
  }
  return LEGACY_MARGIN_CLASSIFICATION.AMBIGUOUS_LEGACY_MARGIN;
}

/**
 * isComparable — may this stored margin be compared against a benchmark?
 * Only a verified net profit margin may be compared with the net profit benchmark.
 */
export function isComparable({ marginMetricKey, benchmarkMetricKey, provenance }) {
  if (provenance === MARGIN_PROVENANCE.AMBIGUOUS_LEGACY) return false;
  if (provenance === MARGIN_PROVENANCE.DERIVED_FROM_EBITDA) return false;
  if (provenance === MARGIN_PROVENANCE.ESTIMATED_FROM_NET_PROFIT) return false;
  return benchmarkCompatible(marginMetricKey, benchmarkMetricKey);
}

/**
 * compareToBenchmark — the ONLY sanctioned way to turn a margin and a
 * benchmark into an opportunity.
 *
 * Guarantees:
 *   - never returns a negative gap
 *   - never reports BELOW_BENCHMARK when the value is at or above the benchmark
 *   - never fabricates a comparison when semantics are unverified or the
 *     benchmark type is unavailable
 */
export function compareToBenchmark({
  value,
  valueMetricKey,
  benchmark,
  benchmarkMetricKey,
  provenance = MARGIN_PROVENANCE.VERIFIED,
} = {}) {
  if (
    value == null ||
    benchmark == null ||
    benchmark.average == null
  ) {
    return { position: PROFIT_POSITION.INSUFFICIENT_DATA, comparable: false, reason: 'Missing value or benchmark.' };
  }

  if (!benchmarkCompatible(valueMetricKey, benchmarkMetricKey)) {
    return {
      position: PROFIT_POSITION.BENCHMARK_UNAVAILABLE,
      comparable: false,
      reason: `A ${valueMetricKey || 'unknown'} cannot be compared with a ${benchmarkMetricKey || 'unknown'} benchmark.`,
    };
  }

  if (!hasBenchmarkFor(benchmarkMetricKey)) {
    return {
      position: PROFIT_POSITION.BENCHMARK_UNAVAILABLE,
      comparable: false,
      reason: `No ${benchmarkMetricKey} benchmark source is available.`,
    };
  }

  if (!isComparable({ marginMetricKey: valueMetricKey, benchmarkMetricKey, provenance })) {
    return {
      position: PROFIT_POSITION.NEEDS_VERIFICATION,
      comparable: false,
      reason: 'This margin cannot be verified as the same metric type as the benchmark. Confirmation is required before comparing.',
    };
  }

  const average = benchmark.average;
  const top = benchmark.top ?? null;

  let position;
  if (value < average) position = PROFIT_POSITION.BELOW_BENCHMARK;
  else if (top != null && value < top) position = PROFIT_POSITION.WITHIN_RANGE;
  else position = PROFIT_POSITION.ABOVE_BENCHMARK;

  return {
    position,
    comparable: true,
    average,
    top,
    // Gap is ALWAYS non-negative — "how much room is left", never a negative opportunity.
    gapToAverage: Math.max(0, average - value),
    gapToTop: top != null ? Math.max(0, top - value) : null,
    score: top != null && top > 0 ? Math.min(100, Math.round((value / top) * 100)) : null,
  };
}