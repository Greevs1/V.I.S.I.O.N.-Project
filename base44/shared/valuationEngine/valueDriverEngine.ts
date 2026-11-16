/**
 * valuationEngine/valueDriverEngine.ts — Value Driver Engine.
 * Creates value-driver candidates from structured valuation findings.
 * Does NOT create the final roadmap. Does NOT generate unsupported impact estimates.
 * Pure function: no DB, no React, no SDK. Deterministic.
 */

import { Decimal, money } from './decimal.ts';
import type { ValueDriverInput, ValueDriverOutput, CalculationWarning } from './types.ts';

export const ENGINE_VERSION = '13.3.0';
export const METHODOLOGY_VERSION = '1.0.0';

export function processValueDriver(input: ValueDriverInput): ValueDriverOutput {
  const warnings: CalculationWarning[] = [];

  // ── Determine if impact is quantifiable ───────────────────────────
  const hasEbitdaImpact = input.estimated_ebitda_impact != null && input.estimated_ebitda_impact.isPositive();
  const hasMultipleImpact = input.estimated_multiple_impact != null && input.estimated_multiple_impact.isPositive();
  const isQuantifiable = hasEbitdaImpact || hasMultipleImpact;

  // ── Format impact estimates ───────────────────────────────────────
  const ebitdaImpactStr = hasEbitdaImpact
    ? input.estimated_ebitda_impact!.formatCurrency()
    : 'Impact not yet quantifiable';

  const multipleImpactStr = hasMultipleImpact
    ? input.estimated_multiple_impact!.formatMultiple()
    : 'Impact not yet quantifiable';

  // ── Calculate EV impact range ─────────────────────────────────────
  let evImpactLowStr = 'Impact not yet quantifiable';
  let evImpactHighStr = 'Impact not yet quantifiable';

  if (hasEbitdaImpact && hasMultipleImpact) {
    const ebitdaImpact = input.estimated_ebitda_impact!;
    const multipleImpact = input.estimated_multiple_impact!;
    // EV impact = EBITDA impact × (base multiple + multiple impact)
    // Low: EBITDA impact × base multiple
    // High: EBITDA impact × (base multiple + multiple impact)
    const evLow = ebitdaImpact.multiply(Decimal.fromNumber(3)); // Assume base multiple of 3x as conservative
    const evHigh = ebitdaImpact.multiply(Decimal.fromNumber(3).add(multipleImpact));
    evImpactLowStr = evLow.formatCurrency();
    evImpactHighStr = evHigh.formatCurrency();
  } else if (hasEbitdaImpact) {
    const evImpact = input.estimated_ebitda_impact!.multiply(Decimal.fromNumber(3));
    evImpactLowStr = evImpact.formatCurrency();
    evImpactHighStr = evImpact.formatCurrency();
  }

  // ── Client-visible explanation ────────────────────────────────────
  let clientExplanation = '';
  if (input.impact_type === 'value_enhancer') {
    clientExplanation = `${input.driver_name} is a value enhancer that ${isQuantifiable ? 'may increase business value' : 'has been identified as a positive factor'}.`;
  } else if (input.impact_type === 'value_detractor') {
    clientExplanation = `${input.driver_name} is a value detractor that ${isQuantifiable ? 'may reduce business value' : 'has been identified as a risk factor'}.`;
  } else if (input.impact_type === 'risk_factor') {
    clientExplanation = `${input.driver_name} is a risk factor that should be monitored.`;
  } else if (input.impact_type === 'opportunity') {
    clientExplanation = `${input.driver_name} represents an opportunity for value enhancement.`;
  } else {
    clientExplanation = `${input.driver_name} has been identified as a neutral factor.`;
  }

  // ── Warnings ──────────────────────────────────────────────────────
  if (!isQuantifiable) {
    warnings.push({
      code: 'IMPACT_NOT_QUANTIFIABLE',
      message: `Value driver "${input.driver_name}" has insufficient evidence to quantify impact.`,
      severity: 'info',
    });
  }

  if (input.confidence_score < 40) {
    warnings.push({
      code: 'LOW_CONFIDENCE',
      message: `Value driver "${input.driver_name}" has low confidence score (${input.confidence_score}%)`,
      severity: 'warning',
    });
  }

  if (input.evidence_references.length === 0) {
    warnings.push({
      code: 'NO_EVIDENCE',
      message: `Value driver "${input.driver_name}" has no evidence references.`,
      severity: 'warning',
    });
  }

  return {
    driver_key: input.driver_key,
    driver_name: input.driver_name,
    category: input.category,
    current_state: input.current_state,
    target_state: input.target_state,
    impact_type: input.impact_type,
    estimated_ebitda_impact: ebitdaImpactStr,
    estimated_multiple_impact: multipleImpactStr,
    estimated_ev_impact_low: evImpactLowStr,
    estimated_ev_impact_high: evImpactHighStr,
    confidence_score: input.confidence_score,
    evidence_references: input.evidence_references,
    client_visible_explanation: input.client_visible ? clientExplanation : '',
    advisor_review_required: input.confidence_score < 60 || !isQuantifiable,
    warnings,
  };
}

export function processValueDrivers(inputs: ValueDriverInput[]): ValueDriverOutput[] {
  return inputs.map(processValueDriver);
}