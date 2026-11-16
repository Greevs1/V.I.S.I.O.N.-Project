/**
 * scenarioEngine/compute — deterministic scenario arithmetic.
 *
 * PURE. No database, no SDK, no LLM, no clock. Given the SAME governed
 * baseline and the same declared inputs it returns the SAME result every time.
 *
 * THE RULES THIS FILE ENFORCES
 *  1. Metric semantics are never mixed. The scenario runs on ONE earnings
 *     basis (recast EBITDA → reported EBITDA → net profit) and says which.
 *     EBITDA is never presented as net profit, and a net-profit-only business
 *     gets no EBITDA multiple maths.
 *  2. No governed value is ever invented. A missing baseline field makes the
 *     scenario unmodellable, not approximated.
 *  3. Nothing here is a business fact. Outputs are ESTIMATED and are never
 *     written back over canonical data.
 *  4. Precision is honest: two significant figures, ranges where the driver is
 *     an assumption.
 *
 * The valuation relationship reused here is the same one the certified
 * valuation engine applies — enterprise value = normalized earnings × applied
 * multiple. The multiple is NOT invented: it is the multiple IMPLIED by this
 * business's own governed current value and governed earnings, and it is
 * labelled as derived. When that relationship cannot be established, no value
 * figure is produced at all.
 */

import {
  LEVERS,
  VARIABLE_COST_RATIO,
  VARIABLE_COST_BASIS,
  approxMoney,
  approxMoneyRange,
  approxHours,
  toTwoSigFigs,
} from './catalog.ts';
import {
  applyBaselineInputs,
  getRecoverableBaseline,
  buildRecoveryRequest,
  OWNER_REPORTED_LABEL,
  OWNER_REPORTED_NOTE,
} from './recovery.ts';
import type {
  ScenarioBaseline,
  ScenarioResult,
  DeclaredAssumption,
  ComparisonRow,
  EarningsBasis,
} from './types.ts';

// ── Baseline from the Business Intelligence Contract ─────────────────────────
/**
 * Read the governed baseline. Every field is passed through unchanged —
 * null stays null. `0` is a measured zero and is preserved as such.
 */
export function buildBaseline(contract: any): ScenarioBaseline {
  const p = contract?.profitability || {};
  const v = contract?.valuation || {};
  const o = contract?.operations || {};

  const recast = numOrNull(p.recast_ebitda);
  const reported = numOrNull(p.reported_ebitda);
  const netProfit = numOrNull(p.net_profit);

  let basis: EarningsBasis = 'none';
  let earningsValue: number | null = null;
  if (recast != null) {
    basis = 'recast_ebitda';
    earningsValue = recast;
  } else if (reported != null) {
    basis = 'reported_ebitda';
    earningsValue = reported;
  } else if (netProfit != null) {
    basis = 'net_profit';
    earningsValue = netProfit;
  }

  return {
    business_name: contract?.business_identity?.name ?? null,
    revenue: numOrNull(p.revenue),
    net_profit: netProfit,
    reported_ebitda: reported,
    recast_ebitda: recast,
    current_value: numOrNull(v.current_value),
    potential_value: numOrNull(v.potential_value),
    value_gap: numOrNull(v.value_gap),
    annual_tax_gap: numOrNull(contract?.tax?.annual_tax_gap),
    hours_freed_per_week: numOrNull(o.hours_freed_per_week),
    hourly_value_of_time_freed: numOrNull(o.hourly_value_of_time_freed),
    freedom_score: numOrNull(contract?.freedom?.freedom_score),
    business_iq: numOrNull(contract?.business_iq),
    earnings_basis: basis,
    earnings_value: earningsValue,
    contract_generated_at: contract?.generated_at ?? null,
  };
}

export function earningsBasisLabel(basis: EarningsBasis): string {
  switch (basis) {
    case 'recast_ebitda':
      return 'Recast EBITDA';
    case 'reported_ebitda':
      return 'EBITDA';
    case 'net_profit':
      return 'Net profit';
    default:
      return 'No earnings figure available';
  }
}

function numOrNull(v: any): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

const MISSING_BASELINE_LABELS: Record<string, string> = {
  revenue: 'Revenue',
  net_profit: 'Net profit',
  reported_ebitda: 'EBITDA',
  recast_ebitda: 'Recast EBITDA',
  current_value: 'Current business value',
  hours_freed_per_week: 'Owner hours recovered',
  hourly_value_of_time_freed: 'Value of your time',
};

// ── Main entry ───────────────────────────────────────────────────────────────
export function computeScenario(
  scenarioKey: string,
  rawInputs: Record<string, any>,
  governedBaseline: ScenarioBaseline,
  question: string | null = null,
  baselineInputs: Record<string, any> = {},
): ScenarioResult {
  // Owner-reported baseline values fill an ABSENCE only. A governed figure
  // always wins, so a value typed for a scenario can never displace real data.
  const { baseline, reported, superseded } = applyBaselineInputs(
    governedBaseline,
    baselineInputs,
  );

  const lever = LEVERS[scenarioKey];
  if (!lever) {
    return {
      status: 'unsupported',
      scenario_key: scenarioKey,
      scenario_title: 'That scenario',
      question,
      reason: 'That scenario is not one Vision can model from your business data yet.',
      would_require: [],
    };
  }

  // ── 1. Governed baseline requirements ─────────────────────────────────────
  // A missing governed input no longer ends the experience when the owner can
  // legitimately supply it. Vision asks for that ONE figure and the scenario
  // resumes with it. A field that is not recoverable still declines honestly.
  const missingBaseline = lever.requires.filter((field) => baseline[field] == null);
  if (missingBaseline.length > 0) {
    const recoverable = missingBaseline.find((field) => getRecoverableBaseline(field as string));

    if (recoverable) {
      const spec = getRecoverableBaseline(recoverable as string)!;
      return {
        status: 'needs_input',
        scenario_key: lever.key,
        scenario_title: lever.title,
        question,
        input: {
          key: spec.field,
          label: spec.label,
          unit: spec.unit,
          question: spec.question,
          estimate_value: spec.estimate_value,
          estimate_basis: spec.estimate_basis,
        },
        recovery: buildRecoveryRequest(spec.field) || undefined,
      };
    }

    return {
      status: 'unsupported',
      scenario_key: lever.key,
      scenario_title: lever.title,
      question,
      reason:
        'Vision can only model this against numbers it actually has for your business, and ' +
        missingBaseline.map((f) => MISSING_BASELINE_LABELS[f as string] || f).join(' and ') +
        ' is not on file yet.',
      would_require: missingBaseline.map((f) => MISSING_BASELINE_LABELS[f as string] || String(f)),
    };
  }

  // ── 2. Declared inputs — ask for the ONE that matters, never guess it ─────
  const inputs: Record<string, number> = {};
  const assumedInputs: DeclaredAssumption[] = [];

  for (const spec of lever.inputs) {
    const supplied = numOrNull(rawInputs?.[spec.key]);
    if (supplied != null) {
      inputs[spec.key] = supplied;
      continue;
    }
    if (spec.default_value != null) {
      inputs[spec.key] = spec.default_value;
      assumedInputs.push({
        key: spec.key,
        label: spec.label,
        value: formatInput(spec.default_value, spec.unit),
        basis: spec.estimate_basis || 'A starting assumption so the model can run.',
        from_business_data: false,
        source_class: 'declared_assumption',
      });
      continue;
    }
    // No default and nothing supplied — ASK. One question, highest value first.
    return {
      status: 'needs_input',
      scenario_key: lever.key,
      scenario_title: lever.title,
      question,
      input: {
        key: spec.key,
        label: spec.label,
        unit: spec.unit,
        question: spec.question,
        estimate_value: spec.estimate_value,
        estimate_basis: spec.estimate_basis,
      },
    };
  }

  // ── 3. Known governed inputs this model used ─────────────────────────────
  // A value the owner typed for this scenario is NEVER listed as known. This is
  // the one place it could be mistaken for verified business data.
  const ownerReportedFields = new Set(reported.map((r) => r.field));
  const known: Array<{ label: string; value: string; source: string }> = [];
  if (baseline.revenue != null && !ownerReportedFields.has('revenue')) {
    known.push({ label: 'Revenue', value: approxMoney(baseline.revenue) || '—', source: 'your business data' });
  }
  if (baseline.earnings_value != null) {
    known.push({
      label: earningsBasisLabel(baseline.earnings_basis),
      value: approxMoney(baseline.earnings_value) || '—',
      source: 'your business data',
    });
  }
  if (baseline.current_value != null) {
    known.push({ label: 'Business value', value: approxMoney(baseline.current_value) || '—', source: 'your business data' });
  }

  // ── 4. Modelled change in governed earnings ──────────────────────────────
  const modelled = modelEarningsDelta(scenarioKey, inputs, baseline);
  const earningsDelta = modelled.earnings_delta;

  // ── 5. Valuation bridge — only when the relationship is real ─────────────
  const valueModel = modelValueDelta(earningsDelta, baseline);

  // ── 6. Assembled output ──────────────────────────────────────────────────
  // Owner-reported values are disclosed in the ASSUMED class, never KNOWN: they
  // are unverified by definition and must never read as a business fact.
  const reportedAssumptions: DeclaredAssumption[] = reported.map((r) => ({
    key: r.field,
    label: r.label,
    value: r.formatted,
    basis: OWNER_REPORTED_LABEL + ' — ' + OWNER_REPORTED_NOTE,
    from_business_data: false,
    source_class: 'owner_reported' as const,
  }));

  const assumed: DeclaredAssumption[] = [
    ...reportedAssumptions,
    ...assumedInputs,
    ...modelled.assumptions,
  ];
  const estimated: Array<{ label: string; value: string; note: string }> = modelled.estimated;
  const missing: Array<{ label: string; why: string }> = [...modelled.missing];
  const comparison: ComparisonRow[] = modelled.comparison;

  if (earningsDelta != null && baseline.earnings_value != null) {
    comparison.push({
      metric: earningsBasisLabel(baseline.earnings_basis),
      now: approxMoney(baseline.earnings_value),
      what_if: approxMoney(baseline.earnings_value + earningsDelta),
      derivation:
        modelled.earnings_derivation +
        ' Applied to your ' +
        earningsBasisLabel(baseline.earnings_basis) +
        '.',
    });
  }

  if (valueModel.available && valueModel.value_delta != null && baseline.current_value != null) {
    comparison.push({
      metric: 'Business value',
      now: approxMoney(baseline.current_value),
      what_if: approxMoney(baseline.current_value + valueModel.value_delta),
      derivation: valueModel.basis || '',
    });
  } else if (valueModel.reason) {
    missing.push({
      label: 'Business value impact',
      why: valueModel.reason,
    });
  }

  // ── 7. Confidence — stated with its reason, never as a bare number ───────
  const assumptionDriven = assumed.filter((a) => !a.from_business_data).length;
  let confidence: 'high' | 'medium' | 'low' = 'medium';
  let confidenceReason = '';
  if (earningsDelta == null) {
    confidence = 'low';
    confidenceReason = 'Vision could not establish a governed earnings figure to model against.';
  } else if (assumptionDriven === 0) {
    confidence = 'high';
    confidenceReason = 'Every figure in this model came from your own business data.';
  } else if (valueModel.available) {
    confidence = 'medium';
    confidenceReason =
      assumptionDriven === 1
        ? 'One figure is a declared assumption; the rest is from your business data.'
        : assumptionDriven + ' figures are declared assumptions; the rest is from your business data.';
  } else {
    confidence = 'low';
    confidenceReason =
      'This model rests on ' +
      (assumptionDriven === 1 ? 'a declared assumption' : assumptionDriven + ' declared assumptions') +
      ' and no value relationship could be established.';
  }

  // ── 8. Owner-reported disclosure ─────────────────────────────────────────
  // Stated plainly every time a typed figure drove the model, and also when a
  // typed figure was DROPPED because real data arrived in the meantime.
  const warnings: string[] = [...modelled.warnings];

  if (reported.length > 0) {
    warnings.push(
      'This scenario uses ' +
        (reported.length === 1 ? 'a figure' : reported.length + ' figures') +
        ' you entered yourself. ' +
        (reported.length === 1 ? 'It is' : 'They are') +
        ' not verified and not saved to your business records.',
    );
  }

  if (superseded.length > 0) {
    warnings.push(
      'Your business records now hold a verified figure for ' +
        superseded.map((f) => MISSING_BASELINE_LABELS[f] || f).join(' and ') +
        ', so Vision used that instead of the figure you entered.',
    );
  }

  return {
    status: 'computed',
    scenario_key: scenarioKey,
    scenario_title: lever.title,
    question,
    earnings_basis: baseline.earnings_basis,
    earnings_basis_label: earningsBasisLabel(baseline.earnings_basis),
    known,
    assumed,
    estimated,
    missing,
    comparison,
    earnings_delta: earningsDelta,
    value_model: valueModel,
    confidence,
    confidence_reason: confidenceReason,
    warnings,
  };
}

// ── Per-lever modelling ──────────────────────────────────────────────────────
interface ModelledDelta {
  earnings_delta: number | null;
  earnings_derivation: string;
  assumptions: DeclaredAssumption[];
  estimated: Array<{ label: string; value: string; note: string }>;
  missing: Array<{ label: string; why: string }>;
  comparison: ComparisonRow[];
  warnings: string[];
}

function emptyDelta(): ModelledDelta {
  return {
    earnings_delta: null,
    earnings_derivation: '',
    assumptions: [],
    estimated: [],
    missing: [],
    comparison: [],
    warnings: [],
  };
}

function modelEarningsDelta(
  key: string,
  inputs: Record<string, number>,
  baseline: ScenarioBaseline,
): ModelledDelta {
  const out = emptyDelta();
  const revenue = baseline.revenue;

  switch (key) {
    case 'raise_prices': {
      const pct = inputs.pct;
      const deltaRevenue = (revenue as number) * (pct / 100);
      const deltaEarnings = deltaRevenue * (1 - VARIABLE_COST_RATIO);
      out.earnings_delta = deltaEarnings;
      out.earnings_derivation =
        'A ' + pct + '% price increase on your ' + approxMoney(revenue) + ' of revenue adds ' +
        approxMoney(deltaRevenue) + ', of which ' + Math.round((1 - VARIABLE_COST_RATIO) * 100) +
        '% reaches earnings.';
      out.assumptions.push({
        key: 'variable_cost_ratio',
        label: 'Direct-cost share of new revenue',
        value: Math.round(VARIABLE_COST_RATIO * 100) + '%',
        basis: VARIABLE_COST_BASIS,
        from_business_data: false,
        source_class: 'declared_assumption',
      });
      out.comparison.push({
        metric: 'Revenue',
        now: approxMoney(revenue),
        what_if: approxMoney((revenue as number) + deltaRevenue),
        derivation: pct + '% applied to your revenue.',
      });
      out.estimated.push({
        label: 'Added revenue',
        value: approxMoneyRange(deltaRevenue) || '—',
        note: 'Price change applied to current revenue.',
      });
      break;
    }

    case 'add_revenue': {
      const amount = inputs.amount;
      const deltaEarnings = amount * (1 - VARIABLE_COST_RATIO);
      out.earnings_delta = deltaEarnings;
      out.earnings_derivation =
        'Adding ' + approxMoney(amount) + ' of revenue, of which ' +
        Math.round((1 - VARIABLE_COST_RATIO) * 100) + '% reaches earnings.';
      out.assumptions.push({
        key: 'variable_cost_ratio',
        label: 'Direct-cost share of new revenue',
        value: Math.round(VARIABLE_COST_RATIO * 100) + '%',
        basis: VARIABLE_COST_BASIS,
        from_business_data: false,
        source_class: 'declared_assumption',
      });
      out.comparison.push({
        metric: 'Revenue',
        now: approxMoney(revenue),
        what_if: approxMoney((revenue as number) + amount),
        derivation: 'Your figure added to current revenue.',
      });
      break;
    }

    case 'improve_margins': {
      const points = inputs.points;
      const deltaEarnings = (revenue as number) * (points / 100);
      out.earnings_delta = deltaEarnings;
      out.earnings_derivation =
        'A ' + points + ' point margin improvement on ' + approxMoney(revenue) +
        ' of revenue is worth ' + approxMoney(deltaEarnings) + ' in earnings.';
      out.estimated.push({
        label: 'Earnings improvement',
        value: approxMoneyRange(deltaEarnings) || '—',
        note: 'Margin points applied to current revenue. How you reach them is not modelled.',
      });
      break;
    }

    case 'hire_manager': {
      const cost = inputs.annual_cost;
      const hoursRecovered = inputs.hours_recovered;
      const hourlyValue = baseline.hourly_value_of_time_freed;

      out.earnings_delta = -cost;
      out.earnings_derivation =
        'The management cost of ' + approxMoney(cost) + ' is a direct reduction in earnings.';

      out.comparison.push({
        metric: 'Management cost',
        now: '$0',
        what_if: approxMoney(cost),
        derivation: 'The annual cost you entered.',
      });
      out.comparison.push({
        metric: 'Owner hours per week',
        now: null,
        what_if: approxHours(hoursRecovered),
        derivation: 'Hours you would hand over — your figure, not a modelled outcome.',
      });

      // A rate of zero cannot value anything. Applying it would assert that the
      // owner's time is worth nothing — a claim this model has no basis for —
      // so an absent OR non-positive rate takes the "not modelled" branch, which
      // declines to put a number on it rather than inventing one.
      if (hourlyValue != null && hourlyValue > 0) {
        const recoveredValue = hoursRecovered * 52 * hourlyValue;
        out.earnings_delta = recoveredValue - cost;
        out.earnings_derivation =
          'Recovered owner time at your governed value of ' + approxMoney(hourlyValue) +
          '/hour is worth ' + approxMoney(recoveredValue) + ', less the ' + approxMoney(cost) +
          ' management cost.';
        out.estimated.push({
          label: 'Value of recovered owner time',
          value: approxMoney(recoveredValue) || '—',
          note: 'Your business value of an owner hour, applied to the hours you hand over.',
        });
        out.comparison.push({
          metric: 'Value of recovered time',
          now: null,
          what_if: approxMoney(recoveredValue),
          derivation: 'Hours handed over, valued at the rate your business already carries.',
        });
      } else {
        out.missing.push({
          label: 'Value of recovered owner time',
          why: 'Your business has no governed value per owner hour on file, so Vision will not put a number on it.',
        });
        out.warnings.push(
          'This model shows the cost of the hire. It does not credit the value of the work the manager would take over, because no verified value for your time is on file.',
        );
      }
      break;
    }

    case 'hire_salesperson': {
      const cost = inputs.annual_cost;
      const newRevenue = inputs.new_revenue;
      const deltaEarnings = newRevenue * (1 - VARIABLE_COST_RATIO) - cost;
      out.earnings_delta = deltaEarnings;
      out.earnings_derivation =
        'New revenue of ' + approxMoney(newRevenue) + ' contributes ' +
        approxMoney(newRevenue * (1 - VARIABLE_COST_RATIO)) + ', less the ' + approxMoney(cost) +
        ' sales cost.';
      out.assumptions.push({
        key: 'variable_cost_ratio',
        label: 'Direct-cost share of new revenue',
        value: Math.round(VARIABLE_COST_RATIO * 100) + '%',
        basis: VARIABLE_COST_BASIS,
        from_business_data: false,
        source_class: 'declared_assumption',
      });
      out.comparison.push({
        metric: 'Sales cost',
        now: '$0',
        what_if: approxMoney(cost),
        derivation: 'The annual cost you entered.',
      });
      out.comparison.push({
        metric: 'Revenue',
        now: approxMoney(revenue),
        what_if: approxMoney((revenue ?? 0) + newRevenue),
        derivation: 'Your expected new revenue added on top.',
      });
      break;
    }

    case 'reduce_owner_involvement': {
      const hours = inputs.hours;
      const hourlyValue = baseline.hourly_value_of_time_freed;

      out.comparison.push({
        metric: 'Owner hours per week',
        now: null,
        what_if: approxHours(hours),
        derivation: 'Hours you would hand over.',
      });

      // A rate of zero cannot value anything. Applying it would assert that the
      // owner's time is worth nothing — a claim this model has no basis for —
      // so an absent OR non-positive rate takes the "not modelled" branch, which
      // declines to put a number on it rather than inventing one.
      if (hourlyValue != null && hourlyValue > 0) {
        const recoveredValue = hours * 52 * hourlyValue;
        out.estimated.push({
          label: 'Value of recovered owner time',
          value: approxMoney(recoveredValue) || '—',
          note: 'Your governed value per owner hour, applied to the hours handed over.',
        });
        out.comparison.push({
          metric: 'Value of recovered time',
          now: null,
          what_if: approxMoney(recoveredValue),
          derivation: 'Hours handed over, valued at the rate your business already carries.',
        });
      } else {
        out.missing.push({
          label: 'Value of recovered owner time',
          why: 'Your business has no governed value per owner hour on file.',
        });
      }

      // Handing over involvement is NOT an earnings line item, and greater owner
      // independence is not modelled here as a multiple change: that would be
      // inventing a valuation effect the business data does not support.
      out.missing.push({
        label: 'Valuation effect of reduced owner dependency',
        why: 'Vision does not yet model how independence changes a buyer\'s multiple. Modelling it would invent a valuation effect your data does not support.',
      });
      out.warnings.push(
        'Reducing your involvement is a freedom decision first. Vision shows the hours and what they are worth — it does not claim a valuation uplift.',
      );
      break;
    }

    default:
      break;
  }

  return out;
}

// ── Valuation bridge ─────────────────────────────────────────────────────────
/**
 * The implied multiple is derived from the business's OWN governed figures:
 * current value ÷ governed earnings. It is not a benchmark and not invented.
 * When either side is absent, or the basis is net profit, no value figure is
 * produced.
 */
function modelValueDelta(
  earningsDelta: number | null,
  baseline: ScenarioBaseline,
): { available: boolean; multiple: number | null; basis: string | null; value_delta: number | null; reason: string | null } {
  if (earningsDelta == null) {
    return {
      available: false,
      multiple: null,
      basis: null,
      value_delta: null,
      reason: 'No earnings change could be modelled, so no value effect follows.',
    };
  }

  if (baseline.earnings_basis === 'net_profit') {
    return {
      available: false,
      multiple: null,
      basis: null,
      value_delta: null,
      reason:
        'Value is normally derived from EBITDA, and your business does not have an EBITDA figure on file yet. Vision will not apply an earnings multiple to net profit, because they are different measures.',
    };
  }

  if (baseline.current_value == null || baseline.earnings_value == null || baseline.earnings_value === 0) {
    return {
      available: false,
      multiple: null,
      basis: null,
      value_delta: null,
      reason:
        'Your business does not have both a current value and an earnings figure on file, so the value effect of this change cannot be established.',
    };
  }

  const multiple = baseline.current_value / baseline.earnings_value;
  if (!Number.isFinite(multiple) || multiple <= 0 || multiple > 30) {
    return {
      available: false,
      multiple: null,
      basis: null,
      value_delta: null,
      reason:
        'The relationship between your current value and earnings does not produce a usable multiple, so Vision will not model a value effect.',
    };
  }

  return {
    available: true,
    multiple: toTwoSigFigs(multiple * 100) / 100,
    basis:
      'Derived from your own current value of ' + approxMoney(baseline.current_value) + ' and ' +
      approxMoney(baseline.earnings_value) + ' of ' + earningsBasisLabel(baseline.earnings_basis).toLowerCase() +
      ', applied at roughly ' + (toTwoSigFigs(multiple * 100) / 100).toFixed(1) + '×.',
    value_delta: earningsDelta * multiple,
  };
}

// ── Input formatting ─────────────────────────────────────────────────────────
function formatInput(value: number, unit: string | null): string {
  if (unit === '$') return approxMoney(value) || '$0';
  if (unit === '%') return value + '%';
  return value + (unit ? ' ' + unit : '');
}