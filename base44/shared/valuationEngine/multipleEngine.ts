/**
 * valuationEngine/multipleEngine.ts — Multiple-Based Valuation Engine.
 * Transparent multiple bridge: baseline → adjustments → final multiple → EV.
 * Pure function: no DB, no React, no SDK. Deterministic.
 */

import { Decimal, money, sum } from './decimal.ts';
import type {
  MultipleCalculationInput,
  MultipleCalculationOutput,
  MultipleAdjustment,
  CalculationWarning,
} from './types.ts';

export const ENGINE_VERSION = '13.3.0';
export const METHODOLOGY_VERSION = '1.0.0';

export function calculateMultipleMethod(input: MultipleCalculationInput): MultipleCalculationOutput {
  const warnings: CalculationWarning[] = [];

  // ── Validate benchmark ────────────────────────────────────────────
  if (!input.benchmark || !input.benchmark.is_approved) {
    warnings.push({
      code: 'NO_APPROVED_BENCHMARK',
      message: 'No approved benchmark available. Cannot derive final multiple.',
      severity: 'error',
    });
    return {
      baseline_multiple: input.baseline_multiple,
      total_adjustment: Decimal.zero(),
      final_multiple_low: Decimal.zero(),
      final_multiple_mid: Decimal.zero(),
      final_multiple_high: Decimal.zero(),
      enterprise_value_low: Decimal.zero(),
      enterprise_value_mid: Decimal.zero(),
      enterprise_value_high: Decimal.zero(),
      multiple_bridge: [],
      strategic_premium: null,
      warnings,
    };
  }

  // ── Validate earnings ──────────────────────────────────────────────
  const earnings = input.normalized_earnings;
  if (earnings.isNegative()) {
    warnings.push({
      code: 'NEGATIVE_EARNINGS',
      message: 'Cannot apply multiple to negative earnings. Method excluded.',
      severity: 'error',
    });
  }

  // ── Build multiple bridge ─────────────────────────────────────────
  const bridge: MultipleAdjustment[] = [];
  let totalAdjustment = Decimal.zero();
  let strategicPremium = Decimal.zero();
  let hasStrategicPremium = false;

  for (const adj of input.adjustments) {
    bridge.push(adj);
    totalAdjustment = totalAdjustment.add(adj.adjustment_value);

    if (adj.is_strategic_premium) {
      strategicPremium = strategicPremium.add(adj.adjustment_value);
      hasStrategicPremium = true;
    }
  }

  // ── Calculate final multiples ─────────────────────────────────────
  let finalLow: Decimal;
  let finalMid: Decimal;
  let finalHigh: Decimal;

  if (input.advisor_override_mid != null && input.advisor_override_low != null && input.advisor_override_high != null) {
    // Advisor override
    if (!input.override_rationale) {
      warnings.push({
        code: 'OVERRIDE_WITHOUT_RATIONALE',
        message: 'Advisor override used without rationale',
        severity: 'warning',
      });
    }
    finalLow = input.advisor_override_low;
    finalMid = input.advisor_override_mid;
    finalHigh = input.advisor_override_high;
  } else {
    // Benchmark + adjustments
    finalLow = input.benchmark.multiple_low.add(totalAdjustment);
    finalMid = input.benchmark.multiple_mid.add(totalAdjustment);
    finalHigh = input.benchmark.multiple_high.add(totalAdjustment);
  }

  // ── Validate multiple ordering ────────────────────────────────────
  if (finalLow.greaterThan(finalMid)) {
    warnings.push({
      code: 'INVALID_MULTIPLE_ORDERING',
      message: 'Multiple low exceeds multiple mid. Adjusting.',
      severity: 'error',
    });
    finalLow = finalMid;
  }
  if (finalMid.greaterThan(finalHigh)) {
    warnings.push({
      code: 'INVALID_MULTIPLE_ORDERING',
      message: 'Multiple mid exceeds multiple high. Adjusting.',
      severity: 'error',
    });
    finalHigh = finalMid;
  }

  // ── Calculate enterprise values ───────────────────────────────────
  const evLow = earnings.multiply(finalLow);
  const evMid = earnings.multiply(finalMid);
  const evHigh = earnings.multiply(finalHigh);

  // ── Strategic premium warning ─────────────────────────────────────
  if (hasStrategicPremium) {
    warnings.push({
      code: 'STRATEGIC_PREMIUM_SEPARATE',
      message: 'Strategic premium is included but must not be blended into fair-market or indicated value unless explicitly selected in a strategic scenario.',
      severity: 'warning',
    });
  }

  return {
    baseline_multiple: input.baseline_multiple,
    total_adjustment: totalAdjustment,
    final_multiple_low: finalLow,
    final_multiple_mid: finalMid,
    final_multiple_high: finalHigh,
    enterprise_value_low: evLow,
    enterprise_value_mid: evMid,
    enterprise_value_high: evHigh,
    multiple_bridge: bridge,
    strategic_premium: hasStrategicPremium ? strategicPremium : null,
    warnings,
  };
}