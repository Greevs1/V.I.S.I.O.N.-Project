/**
 * valuationEngine/equityBridge.ts — Equity Value Bridge Engine.
 * Enterprise Value → Equity Value with approved adjustments.
 * Pure function: no DB, no React, no SDK. Deterministic.
 */

import { Decimal, money, sum } from './decimal.ts';
import type { EquityBridgeInput, EquityBridgeOutput, CalculationWarning } from './types.ts';

export const ENGINE_VERSION = '13.3.0';
export const METHODOLOGY_VERSION = '1.0.0';

export function calculateEquityBridge(input: EquityBridgeInput): EquityBridgeOutput {
  const warnings: CalculationWarning[] = [];
  const bridgeLines: { label: string; amount: Decimal; direction: 'add' | 'subtract' }[] = [];

  let totalAdditions = Decimal.zero();
  let totalSubtractions = Decimal.zero();

  // ── Process bridge items ──────────────────────────────────────────
  for (const item of input.bridge_items) {
    if (!item.advisor_approved) {
      warnings.push({
        code: 'UNAPPROVED_BRIDGE_ITEM',
        message: `Bridge item "${item.label}" is not advisor-approved. Excluded.`,
        severity: 'warning',
        field: item.id,
      });
      continue;
    }

    const amount = money(item.amount || 0);
    bridgeLines.push({
      label: item.label,
      amount,
      direction: item.direction,
    });

    if (item.direction === 'add') {
      totalAdditions = totalAdditions.add(amount);
    } else {
      totalSubtractions = totalSubtractions.add(amount);
    }
  }

  // ── Calculate equity values ────────────────────────────────────────
  const netAdjustment = totalAdditions.subtract(totalSubtractions);
  const equityLow = input.enterprise_value_low.add(netAdjustment);
  const equityMid = input.enterprise_value_mid.add(netAdjustment);
  const equityHigh = input.enterprise_value_high.add(netAdjustment);

  // ── Warnings ──────────────────────────────────────────────────────
  if (equityMid.isNegative()) {
    warnings.push({
      code: 'NEGATIVE_EQUITY_VALUE',
      message: 'Equity value is negative. Debt and liabilities exceed enterprise value.',
      severity: 'warning',
    });
  }

  return {
    total_additions: totalAdditions,
    total_subtractions: totalSubtractions,
    equity_value_low: equityLow,
    equity_value_mid: equityMid,
    equity_value_high: equityHigh,
    bridge_lines: bridgeLines,
    warnings,
  };
}