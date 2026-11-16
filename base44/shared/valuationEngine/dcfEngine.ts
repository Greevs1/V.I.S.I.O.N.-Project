/**
 * valuationEngine/dcfEngine.ts — Discounted Cash Flow Engine.
 * Projects future cash flows and discounts to present value.
 * Supports perpetuity-growth and exit-multiple terminal methods.
 * Pure function: no DB, no React, no SDK. Deterministic.
 */

import { Decimal, money } from './decimal.ts';
import type { DCFInput, DCFOutput, DCFProjectionYear, CalculationWarning } from './types.ts';

export const ENGINE_VERSION = '13.3.0';
export const METHODOLOGY_VERSION = '1.0.0';

export function calculateDCF(input: DCFInput): DCFOutput {
  const warnings: CalculationWarning[] = [];

  // ── Validate inputs ────────────────────────────────────────────────
  if (input.forecast_period_years < 3 || input.forecast_period_years > 10) {
    warnings.push({
      code: 'INVALID_FORECAST_PERIOD',
      message: `Forecast period ${input.forecast_period_years} years is outside 3-10 range`,
      severity: 'error',
    });
  }

  if (input.projections.length === 0) {
    warnings.push({
      code: 'NO_PROJECTIONS',
      message: 'No forecast projections provided',
      severity: 'error',
    });
    return emptyDCF(warnings);
  }

  // Validate year ordering
  for (let i = 1; i < input.projections.length; i++) {
    if (input.projections[i].year <= input.projections[i - 1].year) {
      warnings.push({
        code: 'INVALID_YEAR_ORDERING',
        message: `Year ${input.projections[i].year} is not after year ${input.projections[i - 1].year}`,
        severity: 'error',
      });
    }
  }

  // Discount rate must exceed terminal growth
  if (input.discount_rate.lessThanOrEqual(input.terminal_growth_rate) && input.terminal_value_method === 'gordon_growth') {
    warnings.push({
      code: 'DISCOUNT_RATE_TOO_LOW',
      message: `Discount rate (${(input.discount_rate.toNumber() * 100).toFixed(1)}%) must exceed terminal growth rate (${(input.terminal_growth_rate.toNumber() * 100).toFixed(1)}%)`,
      severity: 'error',
    });
    return emptyDCF(warnings);
  }

  // Forecast reliability warning
  if (input.forecast_reliability_score < 40) {
    warnings.push({
      code: 'LOW_FORECAST_RELIABILITY',
      message: `Forecast reliability score ${input.forecast_reliability_score} is low. DCF results may not be defensible.`,
      severity: 'warning',
    });
  }

  // ── Calculate projection years ─────────────────────────────────────
  const projectionYears: DCFProjectionYear[] = [];
  let totalPV = Decimal.zero();

  for (let i = 0; i < input.projections.length; i++) {
    const proj = input.projections[i];
    const year = proj.year;

    // Unlevered FCF = EBITDA - Taxes - CapEx - WC Change
    const unleveredFCF = money(proj.ebitda || 0)
      .subtract(money(proj.taxes || 0))
      .subtract(money(proj.capex || 0))
      .subtract(money(proj.working_capital_change || 0));

    // Discount factor = 1 / (1 + r)^year
    const discountFactor = Decimal.fromNumber(1).divide(
      Decimal.fromNumber(1 + input.discount_rate.toNumber()).multiply(Decimal.fromNumber(year))
    );

    // Present value
    const pv = unleveredFCF.multiply(discountFactor);
    totalPV = totalPV.add(pv);

    projectionYears.push({
      year,
      revenue: money(proj.revenue || 0),
      ebitda: money(proj.ebitda || 0),
      taxes: money(proj.taxes || 0),
      capex: money(proj.capex || 0),
      working_capital_change: money(proj.working_capital_change || 0),
      unlevered_fcf: unleveredFCF,
      discount_factor: discountFactor,
      present_value: pv,
    });

    if (unleveredFCF.isNegative()) {
      warnings.push({
        code: 'NEGATIVE_FCF',
        message: `Year ${year} has negative unlevered free cash flow`,
        severity: 'warning',
        field: `year_${year}`,
      });
    }
  }

  // ── Terminal value ─────────────────────────────────────────────────
  const lastProj = input.projections[input.projections.length - 1];
  let terminalValue = Decimal.zero();
  let pvTerminalValue = Decimal.zero();

  if (input.terminal_value_method === 'gordon_growth') {
    // TV = FCF_n+1 / (r - g)
    const lastFCF = money(lastProj.ebitda || 0)
      .subtract(money(lastProj.taxes || 0))
      .subtract(money(lastProj.capex || 0))
      .subtract(money(lastProj.working_capital_change || 0));

    const nextYearFCF = lastFCF.multiply(Decimal.fromNumber(1 + input.terminal_growth_rate.toNumber()));
    const capRate = input.discount_rate.subtract(input.terminal_growth_rate);
    terminalValue = nextYearFCF.divide(capRate);
  } else {
    // Exit multiple: TV = EBITDA_n × Exit Multiple
    terminalValue = money(lastProj.ebitda || 0).multiply(input.terminal_exit_multiple);
  }

  // PV of terminal value
  const terminalDiscountFactor = Decimal.fromNumber(1).divide(
    Decimal.fromNumber(1 + input.discount_rate.toNumber()).multiply(Decimal.fromNumber(lastProj.year))
  );
  pvTerminalValue = terminalValue.multiply(terminalDiscountFactor);

  // ── Enterprise value ────────────────────────────────────────────────
  const enterpriseValue = totalPV.add(pvTerminalValue);

  // ── Sensitivity analysis ───────────────────────────────────────────
  const sensitivity: { discount_rate: Decimal; growth_rate: Decimal; enterprise_value: Decimal }[] = [];
  const discountRates = [input.discount_rate.toNumber() - 0.02, input.discount_rate.toNumber(), input.discount_rate.toNumber() + 0.02];
  const growthRates = [input.terminal_growth_rate.toNumber() - 0.01, input.terminal_growth_rate.toNumber(), input.terminal_growth_rate.toNumber() + 0.01];

  for (const dr of discountRates) {
    for (const gr of growthRates) {
      if (dr <= gr && input.terminal_value_method === 'gordon_growth') continue;

      // Recalculate with these rates
      let sensPV = Decimal.zero();
      for (const proj of input.projections) {
        const fcf = money(proj.ebitda || 0)
          .subtract(money(proj.taxes || 0))
          .subtract(money(proj.capex || 0))
          .subtract(money(proj.working_capital_change || 0));
        const df = Decimal.fromNumber(1).divide(
          Decimal.fromNumber(1 + dr).multiply(Decimal.fromNumber(proj.year))
        );
        sensPV = sensPV.add(fcf.multiply(df));
      }

      let sensTV: Decimal;
      if (input.terminal_value_method === 'gordon_growth') {
        const lastFCF = money(lastProj.ebitda || 0)
          .subtract(money(lastProj.taxes || 0))
          .subtract(money(lastProj.capex || 0))
          .subtract(money(lastProj.working_capital_change || 0));
        const nextFCF = lastFCF.multiply(Decimal.fromNumber(1 + gr));
        sensTV = nextFCF.divide(Decimal.fromNumber(dr - gr));
      } else {
        sensTV = money(lastProj.ebitda || 0).multiply(input.terminal_exit_multiple);
      }

      const sensDF = Decimal.fromNumber(1).divide(
        Decimal.fromNumber(1 + dr).multiply(Decimal.fromNumber(lastProj.year))
      );
      const sensEV = sensPV.add(sensTV.multiply(sensDF));

      sensitivity.push({
        discount_rate: Decimal.fromNumber(dr),
        growth_rate: Decimal.fromNumber(gr),
        enterprise_value: sensEV,
      });
    }
  }

  return {
    projection_years: projectionYears,
    total_present_value: totalPV,
    terminal_value: terminalValue,
    pv_terminal_value: pvTerminalValue,
    enterprise_value: enterpriseValue,
    sensitivity,
    warnings,
  };
}

function emptyDCF(warnings: CalculationWarning[]): DCFOutput {
  return {
    projection_years: [],
    total_present_value: Decimal.zero(),
    terminal_value: Decimal.zero(),
    pv_terminal_value: Decimal.zero(),
    enterprise_value: Decimal.zero(),
    sensitivity: [],
    warnings,
  };
}