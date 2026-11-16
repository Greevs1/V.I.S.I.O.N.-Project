/**
 * valuationEngine/capitalizationEngine.ts — Capitalization of Earnings Engine.
 * Cap Rate = Required Return − Long-Term Growth Rate
 * Indicated Value = Maintainable Earnings ÷ Cap Rate
 * Pure function: no DB, no React, no SDK. Deterministic.
 */

import { Decimal, money } from './decimal.ts';
import type { CapitalizationInput, CapitalizationOutput, CalculationWarning } from './types.ts';

export const ENGINE_VERSION = '13.3.0';
export const METHODOLOGY_VERSION = '1.0.0';

export function calculateCapitalization(input: CapitalizationInput): CapitalizationOutput {
  const warnings: CalculationWarning[] = [];

  // ── Validate inputs ────────────────────────────────────────────────
  if (input.required_return.lessThanOrEqual(input.long_term_growth_rate)) {
    warnings.push({
      code: 'GROWTH_EXCEEDS_RETURN',
      message: `Long-term growth rate (${(input.long_term_growth_rate.toNumber() * 100).toFixed(1)}%) must be less than required return (${(input.required_return.toNumber() * 100).toFixed(1)}%)`,
      severity: 'error',
    });
  }

  // ── Calculate capitalization rate ──────────────────────────────────
  const capRate = input.required_return.subtract(input.long_term_growth_rate);

  if (capRate.lessThanOrEqual(Decimal.zero())) {
    warnings.push({
      code: 'NON_POSITIVE_CAP_RATE',
      message: `Capitalization rate is ${capRate.toNumber() * 100}%. Must be positive.`,
      severity: 'error',
    });
    return {
      capitalization_rate: capRate,
      indicated_value: Decimal.zero(),
      sensitivity: [],
      warnings,
    };
  }

  // ── Calculate indicated value ──────────────────────────────────────
  const indicatedValue = input.maintainable_earnings.divide(capRate);

  // ── Check for unstable earnings ───────────────────────────────────
  if (input.maintainable_earnings.isNegative()) {
    warnings.push({
      code: 'NEGATIVE_EARNINGS',
      message: 'Cannot capitalize negative earnings. Method excluded.',
      severity: 'error',
    });
  }

  if (input.maintainable_earnings.isZero()) {
    warnings.push({
      code: 'ZERO_EARNINGS',
      message: 'Maintainable earnings are zero. Indicated value is zero.',
      severity: 'warning',
    });
  }

  // ── Sensitivity analysis ──────────────────────────────────────────
  const sensitivity: { required_return: Decimal; growth_rate: Decimal; cap_rate: Decimal; value: Decimal }[] = [];
  const returnRates = [input.required_return.toNumber() - 0.02, input.required_return.toNumber(), input.required_return.toNumber() + 0.02];
  const growthRates = [input.long_term_growth_rate.toNumber() - 0.01, input.long_term_growth_rate.toNumber(), input.long_term_growth_rate.toNumber() + 0.01];

  for (const ret of returnRates) {
    for (const gr of growthRates) {
      const cr = ret - gr;
      if (cr <= 0) continue;
      sensitivity.push({
        required_return: Decimal.fromNumber(ret),
        growth_rate: Decimal.fromNumber(gr),
        cap_rate: Decimal.fromNumber(cr),
        value: input.maintainable_earnings.divide(Decimal.fromNumber(cr)),
      });
    }
  }

  return {
    capitalization_rate: capRate,
    indicated_value: indicatedValue,
    sensitivity,
    warnings,
  };
}