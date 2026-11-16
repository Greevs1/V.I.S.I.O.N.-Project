/**
 * valuationEngine/reconciliationEngine.ts — Method Reconciliation Engine.
 * Weights multiple method results into a final enterprise value range.
 * Weights must total exactly 100%. Does not average automatically.
 * Pure function: no DB, no React, no SDK. Deterministic.
 */

import { Decimal, money, sum } from './decimal.ts';
import type {
  MethodReconciliationInput,
  MethodReconciliationOutput,
  MethodResult,
  CalculationWarning,
} from './types.ts';

export const ENGINE_VERSION = '13.3.0';
export const METHODOLOGY_VERSION = '1.0.0';

export function calculateReconciliation(input: MethodReconciliationInput): MethodReconciliationOutput {
  const warnings: CalculationWarning[] = [];

  if (input.method_results.length === 0) {
    warnings.push({
      code: 'NO_METHOD_RESULTS',
      message: 'No method results provided for reconciliation',
      severity: 'error',
    });
    return {
      included_methods: [],
      excluded_methods: input.excluded_methods,
      total_weight: Decimal.zero(),
      weighted_ev_low: Decimal.zero(),
      weighted_ev_mid: Decimal.zero(),
      weighted_ev_high: Decimal.zero(),
      warnings,
    };
  }

  // ── Validate weights total 100% ───────────────────────────────────
  const totalWeight = sum(input.weights.map(w => w.weight));
  if (Math.abs(totalWeight.toNumber() - 1) > 0.001) {
    warnings.push({
      code: 'INVALID_WEIGHT_TOTAL',
      message: `Method weights total ${totalWeight.toNumber() * 100}%. Must total exactly 100%.`,
      severity: 'error',
    });
  }

  // ── Build included methods ────────────────────────────────────────
  const includedMethods: {
    method_key: string;
    method_name: string;
    weight: Decimal;
    weighted_ev_low: Decimal;
    weighted_ev_mid: Decimal;
    weighted_ev_high: Decimal;
  }[] = [];

  let weightedEVLow = Decimal.zero();
  let weightedEVMid = Decimal.zero();
  let weightedEVHigh = Decimal.zero();

  for (const result of input.method_results) {
    const weightEntry = input.weights.find(w => w.method_key === result.method_key);
    if (!weightEntry) {
      warnings.push({
        code: 'MISSING_WEIGHT',
        message: `No weight provided for method "${result.method_name}"`,
        severity: 'warning',
      });
      continue;
    }

    const weight = weightEntry.weight;
    const wLow = result.enterprise_value_low.multiply(weight);
    const wMid = result.enterprise_value_mid.multiply(weight);
    const wHigh = result.enterprise_value_high.multiply(weight);

    includedMethods.push({
      method_key: result.method_key,
      method_name: result.method_name,
      weight,
      weighted_ev_low: wLow,
      weighted_ev_mid: wMid,
      weighted_ev_high: wHigh,
    });

    weightedEVLow = weightedEVLow.add(wLow);
    weightedEVMid = weightedEVMid.add(wMid);
    weightedEVHigh = weightedEVHigh.add(wHigh);
  }

  // ── Single method case ────────────────────────────────────────────
  if (input.method_results.length === 1) {
    warnings.push({
      code: 'SINGLE_METHOD',
      message: 'Only one method included. Weight is 100% by default.',
      severity: 'info',
    });
  }

  return {
    included_methods: includedMethods,
    excluded_methods: input.excluded_methods,
    total_weight: totalWeight,
    weighted_ev_low: weightedEVLow,
    weighted_ev_mid: weightedEVMid,
    weighted_ev_high: weightedEVHigh,
    warnings,
  };
}