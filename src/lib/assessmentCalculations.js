// ─────────────────────────────────────────────
// PROFIT GAP — SEMANTIC CONTRACT (Phase 6B.1)
// ─────────────────────────────────────────────
//
// HISTORY, so this is never re-litigated:
//   Phase 6A added a margin_type guard here with DEFAULT arguments. Because
//   both defaulted to 'net_profit', the guard could never fire — a safe
//   function with unsafe callers fixes nothing.
//
// NOW: margin semantics are REQUIRED at every call site. There are no
// defaults, so a caller physically cannot compare two different metric
// families by accident. The canonical definitions live in @/lib/profitSemantics.
//
// The profitBenchmark function returns NET PROFIT margins. Only a NET PROFIT
// margin may be compared against it. An EBITDA or gross margin returns
// BENCHMARK_UNAVAILABLE — never an approximation.

import {
  MARGIN_METRIC,
  MARGIN_PROVENANCE,
  PROFIT_POSITION,
  benchmarkCompatible,
  hasBenchmarkFor,
  isComparable,
} from '@/lib/profitSemantics';

export const MarginType = {
  NET_PROFIT: 'net_profit',
  EBITDA: 'ebitda',
  GROSS: 'gross',
};

/**
 * calcProfitGap — compares the owner's margin against a benchmark margin.
 *
 * `margin_type` and `benchmark_margin_type` are REQUIRED. No defaults exist,
 * so an implicit (and therefore silent) comparison is impossible.
 *
 * `margin_provenance` records how trustworthy the stored value is. An
 * ambiguous or EBITDA-derived value is NEVER compared — it returns
 * NEEDS_VERIFICATION instead of a number.
 *
 * @returns {object} always includes `position`; numeric fields are null when
 *   the comparison is not permitted.
 */
export function calcProfitGap({
  p1_rev = 0,
  p1_mymargin = 0,
  p1_avg = 0,
  p1_top = 0,
  margin_type,
  benchmark_margin_type,
  margin_provenance = MARGIN_PROVENANCE.VERIFIED,
}) {
  const refuse = (position, reason) => ({
    profit_gap: null,
    profit_gap_to_avg: null,
    profit_score: null,
    position,
    comparable: false,
    insufficient_data: true,
    insufficient_data_reason: reason,
  });

  // 1. Semantics must be stated explicitly.
  if (!margin_type || !benchmark_margin_type) {
    return refuse(
      PROFIT_POSITION.NEEDS_VERIFICATION,
      'Margin semantics were not declared. Refusing to compare an unlabelled margin.',
    );
  }

  // 2. Different metric families can never be compared.
  if (!benchmarkCompatible(margin_type, benchmark_margin_type)) {
    return refuse(
      PROFIT_POSITION.BENCHMARK_UNAVAILABLE,
      `Margin type mismatch: the value is a ${margin_type} but the benchmark is a ${benchmark_margin_type}. These cannot be compared.`,
    );
  }

  // 3. No benchmark source exists for this metric family.
  if (!hasBenchmarkFor(benchmark_margin_type)) {
    return refuse(
      PROFIT_POSITION.BENCHMARK_UNAVAILABLE,
      `No ${benchmark_margin_type} benchmark source is available.`,
    );
  }

  // 4. Provenance must permit comparison.
  if (!isComparable({ marginMetricKey: margin_type, benchmarkMetricKey: benchmark_margin_type, provenance: margin_provenance })) {
    return refuse(
      PROFIT_POSITION.NEEDS_VERIFICATION,
      'This margin cannot be verified as the same metric type as the benchmark. Confirmation is required before comparing.',
    );
  }

  // 5. Comparison is permitted.
  const profit_gap_to_avg = Math.max(0, p1_rev * ((p1_avg - p1_mymargin) / 100));
  const profit_gap = Math.max(0, p1_rev * ((p1_top - p1_mymargin) / 100));
  const profit_score = p1_top > 0 ? Math.min(100, Math.round((p1_mymargin / p1_top) * 100)) : 0;

  let position;
  if (p1_mymargin < p1_avg) position = PROFIT_POSITION.BELOW_BENCHMARK;
  else if (p1_top > 0 && p1_mymargin < p1_top) position = PROFIT_POSITION.WITHIN_RANGE;
  else position = PROFIT_POSITION.ABOVE_BENCHMARK;

  return { profit_gap, profit_gap_to_avg, profit_score, position, comparable: true };
}

/**
 * resolveProfitGap — the single explicit binding of the platform's Profit Gap
 * input to its canonical metric type.
 *
 * The Profit Gap assessment asks, verbatim, for "Your Current Net Profit
 * Margin". The benchmark returned by `profitBenchmark` is a net profit margin
 * benchmark. Both sides are therefore NET PROFIT MARGIN — stated once, here,
 * rather than assumed in a default argument.
 */
export function resolveProfitGap(state = {}) {
  return calcProfitGap({
    p1_rev: state.p1_rev,
    p1_mymargin: state.p1_mymargin,
    p1_avg: state.p1_avg,
    p1_top: state.p1_top,
    margin_type: MARGIN_METRIC.NET_PROFIT_MARGIN,
    benchmark_margin_type: MARGIN_METRIC.NET_PROFIT_MARGIN,
    margin_provenance: state.p1_mymargin_provenance || MARGIN_PROVENANCE.VERIFIED,
  });
}

/**
 * calcNetProfitMargin — canonical net profit margin calculation.
 * Net Margin = Net Profit / Revenue
 */
export function calcNetProfitMargin(revenue, netProfit) {
  if (!revenue || revenue <= 0) return null;
  if (netProfit == null) return null;
  return (netProfit / revenue) * 100;
}

/**
 * calcEbitdaMargin — canonical EBITDA margin calculation.
 * EBITDA Margin = EBITDA / Revenue
 */
export function calcEbitdaMargin(revenue, ebitda) {
  if (!revenue || revenue <= 0) return null;
  if (ebitda == null) return null;
  return (ebitda / revenue) * 100;
}

// ─────────────────────────────────────────────
// VALUE GAP
// ─────────────────────────────────────────────
export function calcValueGap({ v2_ebitda = 0, v2_mult = 4, v2_mult_top = 9.5, v2_strat = 40 }) {
  const current_value = v2_ebitda * v2_mult;
  const potential_multiple = v2_mult + ((v2_mult_top - v2_mult) * (v2_strat / 100));
  const potential_value = v2_ebitda * potential_multiple;
  const value_gap = Math.max(0, potential_value - current_value);
  return { current_value, potential_multiple, potential_value, value_gap };
}

// ─────────────────────────────────────────────
// RECAST EBITDA
// ─────────────────────────────────────────────
export function calcRecastEBITDA({ rc_ebitda = 0, rc_addbacks = {}, v2_mult = 4 }) {
  const total_addbacks = Object.values(rc_addbacks).reduce((s, v) => s + (Number(v) || 0), 0);
  const recast_ebitda = rc_ebitda + total_addbacks;
  const recast_value_impact = total_addbacks * v2_mult;
  return { recast_ebitda, total_addbacks, recast_value_impact };
}

// ─────────────────────────────────────────────
// TAX GAP
// ─────────────────────────────────────────────
const ENTITY_SAVINGS = { sole_prop: 0.025, llc: 0.015, s_corp: 0, c_corp: 0.01, partnership: 0.012 };

export function calcTaxGap({ t3_agi = 0, t3_entity = 'sole_prop', t3_kids = 0, t3_prop = 'no',
  t3_rd = 'no', t3_hsa = 'no', t3_ret = 'no', t3_home_office = 'no',
  t3_vehicle = 'no', t3_ptet = 'no' }) {
  let annual_gap = 0;
  const strategies = [];
  const strategyBreakdown = [];

  const entityRate = ENTITY_SAVINGS[t3_entity] || 0;
  if (entityRate > 0) {
    const amt = Math.round(t3_agi * entityRate);
    annual_gap += amt;
    strategies.push('Entity Restructuring');
    strategyBreakdown.push({ name: 'Entity Restructuring', amount: amt });
  }
  if (t3_prop === 'yes') { annual_gap += 10000; strategies.push('Cost Segregation & Bonus Depreciation'); strategyBreakdown.push({ name: 'Cost Segregation & Bonus Depreciation', amount: 10000 }); }
  if (t3_rd === 'yes') { annual_gap += 5000; strategies.push('R&D Tax Credits (IRC §41)'); strategyBreakdown.push({ name: 'R&D Tax Credits (IRC §41)', amount: 5000 }); }
  if (t3_hsa === 'no') { annual_gap += 1800; strategies.push('HSA / HRA Setup'); strategyBreakdown.push({ name: 'HSA / HRA Setup', amount: 1800 }); }
  if (t3_ret === 'no') { annual_gap += 3500; strategies.push('Qualified Retirement Plan'); strategyBreakdown.push({ name: 'Qualified Retirement Plan', amount: 3500 }); }
  if (t3_home_office === 'yes') { annual_gap += 2000; strategies.push('Home Office & Accountable Plan'); strategyBreakdown.push({ name: 'Home Office & Accountable Plan', amount: 2000 }); }
  if (t3_vehicle === 'yes') { annual_gap += 4000; strategies.push('Section 179 / Vehicle Deduction'); strategyBreakdown.push({ name: 'Section 179 / Vehicle Deduction', amount: 4000 }); }
  if (t3_ptet === 'yes') { const amt = Math.round(t3_agi * 0.005); annual_gap += amt; strategies.push('PTET Election'); strategyBreakdown.push({ name: 'PTET Election', amount: amt }); }
  if (t3_kids > 0) { const amt = t3_kids * 2000; annual_gap += amt; strategies.push('Child Tax Credits'); strategyBreakdown.push({ name: 'Child Tax Credits', amount: amt }); }

  return { t3_annual_gap: annual_gap, t3_strategies: strategies, t3_strategy_breakdown: strategyBreakdown };
}

export function calcTaxCompound(annual_gap = 0, rate = 6, years = 10) {
  let total = 0;
  for (let y = 0; y < years; y++) total += annual_gap * Math.pow(1 + rate / 100, y);
  return Math.round(total);
}

// ─────────────────────────────────────────────
// SHARED HELPER: VALUE OF TIME FREED
// ─────────────────────────────────────────────
/**
 * calculateValueOfTimeFreed
 *
 * Canonical single-source formula for Value of Time Freed.
 * Used by: OperationsGap assessment, IQ Dashboard ops card,
 *          IQ Score closable gaps, Freedom calculations, Scenario Builder.
 *
 * Returns:
 *   hourly_value_of_time_freed  — always calculated if take-home & hours exist
 *   monthly_value_of_time_freed — only when freed hours can be determined
 *   monthly_take_home_used
 *   hours_worked_per_week_used
 *   hours_freed_per_week_used
 *   source — provenance string
 */
export function calculateValueOfTimeFreed({
  monthlyTakeHome = 0,
  annualIncome = 0,
  annualProfit = 0,
  ownerComp = 0,
  hoursWorkedPerWeek = 0,
  hoursFreedPerWeek = null,
  targetHoursPerWeek = null,
} = {}) {
  // Resolve monthly take-home: explicit > annual income / 12 > annual profit / 12 > owner comp / 12
  let monthly_take_home_used = 0;
  let source = 'none';

  if (monthlyTakeHome > 0) {
    monthly_take_home_used = monthlyTakeHome;
    source = 'operations_gap_input';
  } else if (annualIncome > 0) {
    monthly_take_home_used = Math.round(annualIncome / 12);
    source = 'annual_income_derived';
  } else if (annualProfit > 0) {
    monthly_take_home_used = Math.round(annualProfit / 12);
    source = 'annual_profit_derived';
  } else if (ownerComp > 0) {
    monthly_take_home_used = Math.round(ownerComp / 12);
    source = 'owner_comp_derived';
  }

  const hours_worked_per_week_used = hoursWorkedPerWeek > 0 ? hoursWorkedPerWeek : 50;

  // Hourly Value = Monthly Take-Home / (Hours/Week × 4)
  const hoursPerMonth = hours_worked_per_week_used * 4;
  const hourly_value_of_time_freed =
    monthly_take_home_used > 0 && hoursPerMonth > 0
      ? Math.round(monthly_take_home_used / hoursPerMonth)
      : 0;

  // Resolve freed hours: explicit > current minus target > null (skip monthly calc)
  let hours_freed_per_week_used = null;
  if (hoursFreedPerWeek != null && hoursFreedPerWeek > 0) {
    hours_freed_per_week_used = hoursFreedPerWeek;
  } else if (targetHoursPerWeek != null && targetHoursPerWeek > 0 && hours_worked_per_week_used > targetHoursPerWeek) {
    hours_freed_per_week_used = hours_worked_per_week_used - targetHoursPerWeek;
  }

  // Monthly Value = Freed Hours/Week × 4 × Hourly Value
  const monthly_value_of_time_freed =
    hourly_value_of_time_freed > 0 && hours_freed_per_week_used != null
      ? Math.round(hours_freed_per_week_used * 4 * hourly_value_of_time_freed)
      : 0;

  return {
    hourly_value_of_time_freed,
    monthly_value_of_time_freed,
    monthly_take_home_used,
    hours_worked_per_week_used,
    hours_freed_per_week_used,
    source,
  };
}

// ─────────────────────────────────────────────
// OPERATIONS SCORE
// ─────────────────────────────────────────────
// Default freed hours: 2 hrs/day × 5 business days
const DEFAULT_HOURS_FREED_PER_WEEK = 10;

export function calcOperationsScore({ o4_scores = [3, 3, 3, 3, 3, 3], o4_hrs = 50, o4_takehome = 0, o4_hours_freed = null }) {
  const avg = o4_scores.reduce((s, v) => s + v, 0) / o4_scores.length;
  const operations_score = Math.round((avg / 6) * 100);

  // Freed hours resolution:
  // 1. Explicit user override (o4_hours_freed > 0)
  // 2. Default: 10 hrs/week (2 hrs/day × 5 days)
  let freedHrsPerWeek;
  let freed_source;
  if (o4_hours_freed != null && o4_hours_freed >= 0) {
    freedHrsPerWeek = o4_hours_freed;
    freed_source = 'user_override';
  } else {
    freedHrsPerWeek = DEFAULT_HOURS_FREED_PER_WEEK;
    freed_source = 'default_2_hours_per_day';
  }

  const vtf = calculateValueOfTimeFreed({
    monthlyTakeHome: o4_takehome || 0,
    hoursWorkedPerWeek: o4_hrs || 50,
    hoursFreedPerWeek: freedHrsPerWeek,
  });

  const hourly_value = vtf.hourly_value_of_time_freed;
  const monthly_value_freed = o4_takehome > 0 ? vtf.monthly_value_of_time_freed : 0;

  return {
    operations_score,
    monthly_value_freed,
    monthly_value_of_time_freed: monthly_value_freed,
    hourly_value,
    hourly_value_of_time_freed: hourly_value,
    freed_hours_per_week: freedHrsPerWeek,
    hours_freed_per_week: freedHrsPerWeek,
    hours_freed_source: freed_source,
  };
}

// ─────────────────────────────────────────────
// FREEDOM SCORE
// ─────────────────────────────────────────────
export function calcFreedomScore(state) {
  const {
    f_unplugged_days = 14, f_run_without_you = 'no', f_stress_level = 7,
    o4_scores = [3,3,3,3,3,3], f_net_worth = 500000,
    f_desired_retirement_income = 15000, v2_ebitda = 0, v2_mult = 4,
    rc_ebitda = 0, rc_addbacks = {}, v2_mult_top = 9.5, v2_strat = 40,
  } = state;

  const { operations_score } = calcOperationsScore({ o4_scores, o4_hrs: state.o4_hrs || 50, o4_takehome: state.o4_takehome || 0 });
  const time_freedom = Math.min(100, Math.round((f_unplugged_days / 30) * 100));
  const operations_freedom = f_run_without_you === 'yes' ? 100 : operations_score;
  const stress_score = Math.max(0, (10 - f_stress_level) * 10);
  const freedom_score = Math.round((time_freedom + operations_freedom + stress_score) / 3);

  // Freedom Date calculation
  const { potential_value } = calcValueGap({ v2_ebitda, v2_mult, v2_mult_top, v2_strat });
  const { recast_ebitda: normalized } = calcRecastEBITDA({ rc_ebitda, rc_addbacks, v2_mult });
  const current_business_value = v2_ebitda * v2_mult;
  const target_wealth = f_desired_retirement_income * 12 * 25;
  const current_savings_rate = Math.max(1, normalized * 0.3);
  const optimized_savings_rate = Math.max(1, normalized * 0.35);
  const current_wealth_gap = Math.max(0, target_wealth - f_net_worth - current_business_value);
  const optimized_wealth_gap = Math.max(0, target_wealth - f_net_worth - potential_value);
  const current_years_to_freedom = Math.ceil(current_wealth_gap / current_savings_rate);
  const optimized_years_to_freedom = Math.ceil(optimized_wealth_gap / optimized_savings_rate);

  const freeDate = new Date();
  freeDate.setFullYear(freeDate.getFullYear() + Math.min(Math.max(0, optimized_years_to_freedom), 40));
  const freedom_date = freeDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  return {
    time_freedom, operations_freedom, stress_score, freedom_score,
    current_years_to_freedom, optimized_years_to_freedom,
    freedom_date, target_wealth,
  };
}

// ─────────────────────────────────────────────
// IQ™ SCORE (aggregate)
// ─────────────────────────────────────────────
export function calcIQScore(state) {
  // Only scores that are actually available contribute. A profit score of null
  // (semantics unverified) is EXCLUDED — it is never treated as zero, because
  // averaging in a fabricated zero would understate the owner's IQ score.
  const { profit_score } = resolveProfitGap(state);
  const { operations_score } = calcOperationsScore({ o4_scores: state.o4_scores });
  const { freedom_score } = calcFreedomScore(state);
  const { t3_annual_gap } = calcTaxGap(state);
  const maxTaxGap = (state.t3_agi || 1) * 0.1;
  const tax_score = t3_annual_gap !== null
    ? Math.max(0, Math.round((1 - t3_annual_gap / maxTaxGap) * 100))
    : 50;

  const scores = [operations_score, freedom_score, tax_score];
  if (profit_score != null) scores.push(profit_score);

  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

// ─────────────────────────────────────────────
// GALILEO CONTEXT OBJECT
// ─────────────────────────────────────────────
export function buildGalileoContext(state) {
  const profitCalc = resolveProfitGap(state);
  const valueCalc = calcValueGap(state);
  const recastCalc = calcRecastEBITDA(state);
  const taxCalc = calcTaxGap(state);
  const opsCalc = calcOperationsScore({ o4_scores: state.o4_scores });
  const freedomCalc = calcFreedomScore(state);
  const iq_score = calcIQScore(state);

  return {
    iq_score,
    business: {
      industry: state.industry,
      annual_revenue: state.p1_rev,
      current_margin_pct: state.p1_mymargin,
      ebitda: state.v2_ebitda,
    },
    profit_gap: {
      current_margin_pct: state.p1_mymargin,
      // Explicit semantics — a consumer must never have to guess what
      // current_margin_pct measures. Both sides are NET PROFIT MARGIN.
      margin_type: MARGIN_METRIC.NET_PROFIT_MARGIN,
      benchmark_margin_type: MARGIN_METRIC.NET_PROFIT_MARGIN,
      margin_provenance: state.p1_mymargin_provenance || MARGIN_PROVENANCE.VERIFIED,
      comparison_position: profitCalc.position,
      comparison_permitted: !!profitCalc.comparable,
      industry_avg_pct: state.p1_avg,
      top_quartile_pct: state.p1_top,
      annual_gap_to_avg: profitCalc.profit_gap_to_avg,
      annual_gap_to_best: profitCalc.profit_gap,
      profit_score: profitCalc.profit_score,
    },
    value_gap: {
      current_value: valueCalc.current_value,
      potential_value: valueCalc.potential_value,
      value_gap: valueCalc.value_gap,
      current_multiple: state.v2_mult,
      potential_multiple: valueCalc.potential_multiple,
      strategic_readiness_score: state.v2_strat,
    },
    recast_ebitda: {
      reported_ebitda: state.rc_ebitda,
      total_addbacks: recastCalc.total_addbacks,
      normalized_ebitda: recastCalc.recast_ebitda,
      valuation_impact: recastCalc.recast_value_impact,
    },
    tax_gap: {
      agi: state.t3_agi,
      entity_structure: state.t3_entity,
      annual_overpayment: taxCalc.t3_annual_gap,
      ten_year_cost: calcTaxCompound(taxCalc.t3_annual_gap, 6),
      identified_strategies: taxCalc.t3_strategies,
    },
    operations: {
      score: opsCalc.operations_score,
      hours_per_week: state.o4_hrs,
      monthly_takehome: state.o4_takehome,
      individual_scores: state.o4_scores,
    },
    freedom: {
      score: freedomCalc.freedom_score,
      unplugged_days_per_year: state.f_unplugged_days,
      business_runs_without_owner: state.f_run_without_you === 'yes',
      stress_level: state.f_stress_level,
      exit_timeline_years: state.f_exit_timeline,
      exit_type: state.f_exit_type,
      estimated_freedom_date: freedomCalc.freedom_date,
      years_to_freedom_optimized: freedomCalc.optimized_years_to_freedom,
      desired_retirement_income: state.f_desired_retirement_income,
      target_wealth_needed: freedomCalc.target_wealth,
    },
  };
}