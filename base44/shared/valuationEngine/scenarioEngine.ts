/**
 * valuationEngine/scenarioEngine.ts — Scenario Modeling Engine.
 * Supports current, indicated, defensible, potential, conservative, base, aggressive, strategic.
 * Potential and strategic are clearly separated from current indicated value.
 * Pure function: no DB, no React, no SDK. Deterministic.
 */

import { Decimal, money } from './decimal.ts';
import type { ScenarioInput, ScenarioOutput, CalculationWarning } from './types.ts';

export const ENGINE_VERSION = '13.3.0';
export const METHODOLOGY_VERSION = '1.0.0';

export function processScenario(input: ScenarioInput): ScenarioOutput {
  const warnings: CalculationWarning[] = [];

  // ── Validate scenario type ────────────────────────────────────────
  const validTypes = ['current', 'indicated', 'defensible', 'potential', 'conservative', 'base', 'aggressive', 'strategic'];
  if (!validTypes.includes(input.scenario_type)) {
    warnings.push({
      code: 'INVALID_SCENARIO_TYPE',
      message: `Invalid scenario type: ${input.scenario_type}`,
      severity: 'error',
    });
  }

  // ── Calculate enterprise value if not provided ────────────────────
  let enterpriseValue = money(input.enterprise_value || 0);
  if (enterpriseValue.isZero() && input.normalized_earnings.isPositive() && input.applied_multiple.isPositive()) {
    enterpriseValue = input.normalized_earnings.multiply(input.applied_multiple);
  }

  // ── Calculate equity value if not provided ────────────────────────
  let equityValue = money(input.equity_value || 0);
  if (equityValue.isZero()) {
    equityValue = enterpriseValue
      .add(money(input.cash_adjustment || 0))
      .subtract(money(input.debt_adjustment || 0))
      .add(money(input.working_capital_adjustment || 0));
  }

  // ── Potential scenario warnings ──────────────────────────────────
  if (input.scenario_type === 'potential') {
    if (input.included_improvements.length === 0) {
      warnings.push({
        code: 'POTENTIAL_WITHOUT_IMPROVEMENTS',
        message: 'Potential scenario should include identified improvements. Value is not guaranteed.',
        severity: 'warning',
      });
    }
    warnings.push({
      code: 'POTENTIAL_NOT_GUARANTEED',
      message: 'Potential value is not guaranteed and must not be presented as current fair market value.',
      severity: 'info',
    });
  }

  // ── Strategic scenario warnings ──────────────────────────────────
  if (input.scenario_type === 'strategic') {
    warnings.push({
      code: 'STRATEGIC_NOT_FMV',
      message: 'Strategic value includes buyer-specific synergies and is not fair market value.',
      severity: 'info',
    });
  }

  // ── Unsupported assumptions ──────────────────────────────────────
  if (input.confidence_score < 40) {
    warnings.push({
      code: 'LOW_CONFIDENCE',
      message: `Scenario confidence is ${input.confidence_score}%. Assumptions may not be well-supported.`,
      severity: 'warning',
    });
  }

  return {
    scenario_type: input.scenario_type,
    scenario_name: input.scenario_name,
    enterprise_value: enterpriseValue,
    equity_value: equityValue,
    confidence_score: input.confidence_score,
    assumptions: input.assumptions,
    is_recommended: input.is_recommended,
    warnings,
  };
}

export function processScenarios(inputs: ScenarioInput[]): ScenarioOutput[] {
  return inputs.map(processScenario);
}