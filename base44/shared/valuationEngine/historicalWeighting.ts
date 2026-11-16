/**
 * valuationEngine/historicalWeighting.ts — Historical Weighting Engine.
 * Calculates maintainable earnings from multiple periods.
 * Pure function: no DB, no React, no SDK. Deterministic.
 */

import { Decimal, money, sum } from './decimal.ts';
import type {
  HistoricalWeightingInput,
  HistoricalWeightingOutput,
  CalculationWarning,
} from './types.ts';

export const ENGINE_VERSION = '13.3.0';
export const METHODOLOGY_VERSION = '1.0.0';

export function calculateHistoricalWeighting(input: HistoricalWeightingInput): HistoricalWeightingOutput {
  const warnings: CalculationWarning[] = [];

  if (input.periods.length === 0) {
    warnings.push({
      code: 'NO_PERIODS',
      message: 'No financial periods provided',
      severity: 'error',
    });
    return {
      method: input.weighting_method,
      period_values: [],
      final_maintainable_earnings: Decimal.zero(),
      total_weight: Decimal.zero(),
      rationale: 'No periods available',
      confidence_impact: 0,
      warnings,
    };
  }

  const periodValues = input.periods.map(p => ({
    period_id: p.period_id,
    period_label: p.period_label,
    earnings: p.earnings,
    weight: Decimal.zero(),
    weighted_contribution: Decimal.zero(),
  }));

  let finalEarnings = Decimal.zero();
  let totalWeight = Decimal.zero();
  let rationale = '';
  let confidenceImpact = 50;

  switch (input.weighting_method) {
    case 'latest_period': {
      const latest = periodValues[periodValues.length - 1];
      latest.weight = Decimal.fromNumber(1);
      latest.weighted_contribution = latest.earnings;
      finalEarnings = latest.earnings;
      totalWeight = Decimal.fromNumber(1);
      rationale = 'Latest period only';
      confidenceImpact = 40;
      break;
    }

    case 'trailing_twelve_months': {
      // Use the most recent period labeled as TTM, or calculate from monthly data
      const ttm = periodValues.find(p => p.period_label.toLowerCase().includes('ttm') || p.period_label.toLowerCase().includes('trailing'));
      if (ttm) {
        ttm.weight = Decimal.fromNumber(1);
        ttm.weighted_contribution = ttm.earnings;
        finalEarnings = ttm.earnings;
        totalWeight = Decimal.fromNumber(1);
        rationale = 'Trailing twelve months';
        confidenceImpact = 55;
      } else {
        // Fall back to latest period
        const latest = periodValues[periodValues.length - 1];
        latest.weight = Decimal.fromNumber(1);
        latest.weighted_contribution = latest.earnings;
        finalEarnings = latest.earnings;
        totalWeight = Decimal.fromNumber(1);
        rationale = 'TTM not available, using latest period';
        confidenceImpact = 40;
        warnings.push({
          code: 'TTM_NOT_AVAILABLE',
          message: 'No TTM period found, using latest period instead',
          severity: 'warning',
        });
      }
      break;
    }

    case 'simple_average': {
      const avg = sum(periodValues.map(p => p.earnings)).divide(Decimal.fromNumber(periodValues.length));
      periodValues.forEach(pv => {
        pv.weight = Decimal.fromNumber(1).divide(Decimal.fromNumber(periodValues.length));
        pv.weighted_contribution = pv.earnings.divide(Decimal.fromNumber(periodValues.length));
      });
      finalEarnings = avg;
      totalWeight = Decimal.fromNumber(1);
      rationale = `Simple average of ${periodValues.length} period(s)`;
      confidenceImpact = 60;
      break;
    }

    case 'weighted_average': {
      if (!input.custom_weights || input.custom_weights.length === 0) {
        warnings.push({
          code: 'NO_CUSTOM_WEIGHTS',
          message: 'Weighted average selected but no custom weights provided, using simple average',
          severity: 'warning',
        });
        // Fall back to simple average
        const avg = sum(periodValues.map(p => p.earnings)).divide(Decimal.fromNumber(periodValues.length));
        periodValues.forEach(pv => {
          pv.weight = Decimal.fromNumber(1).divide(Decimal.fromNumber(periodValues.length));
          pv.weighted_contribution = pv.earnings.divide(Decimal.fromNumber(periodValues.length));
        });
        finalEarnings = avg;
        totalWeight = Decimal.fromNumber(1);
        rationale = `Simple average (no custom weights) of ${periodValues.length} period(s)`;
        confidenceImpact = 55;
        break;
      }

      // Validate weights total 100%
      const weightTotal = sum(input.custom_weights.map(w => w.weight));
      if (Math.abs(weightTotal.toNumber() - 1) > 0.001) {
        warnings.push({
          code: 'INVALID_WEIGHT_TOTAL',
          message: `Custom weights total ${weightTotal.toNumber() * 100}%, must be 100%`,
          severity: 'error',
        });
      }

      let weighted = Decimal.zero();
      for (const cw of input.custom_weights) {
        const pv = periodValues.find(p => p.period_id === cw.period_id);
        if (pv) {
          pv.weight = cw.weight;
          pv.weighted_contribution = pv.earnings.multiply(cw.weight);
          weighted = weighted.add(pv.weighted_contribution);
        }
      }
      finalEarnings = weighted;
      totalWeight = weightTotal;
      rationale = `Weighted average with custom weights`;
      confidenceImpact = 65;
      break;
    }

    case 'trend_adjusted': {
      // Simple linear trend: calculate slope and project forward
      if (periodValues.length < 2) {
        warnings.push({
          code: 'INSUFFICIENT_PERIODS_FOR_TREND',
          message: 'Trend adjustment requires at least 2 periods, using latest',
          severity: 'warning',
        });
        const latest = periodValues[periodValues.length - 1];
        latest.weight = Decimal.fromNumber(1);
        latest.weighted_contribution = latest.earnings;
        finalEarnings = latest.earnings;
        totalWeight = Decimal.fromNumber(1);
        rationale = 'Latest period (insufficient data for trend)';
        confidenceImpact = 40;
        break;
      }

      // Simple linear regression
      const n = periodValues.length;
      const xs = periodValues.map((_, i) => i);
      const ys = periodValues.map(p => p.earnings.toNumber());
      const sumX = xs.reduce((a, b) => a + b, 0);
      const sumY = ys.reduce((a, b) => a + b, 0);
      const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
      const sumXX = xs.reduce((a, x) => a + x * x, 0);
      const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;
      const projectedValue = intercept + slope * n; // Next period

      // Weight periods with recency bias
      const weights = periodValues.map((_, i) => (i + 1));
      const weightSum = weights.reduce((a, b) => a + b, 0);
      periodValues.forEach((pv, i) => {
        pv.weight = Decimal.fromNumber(weights[i] / weightSum);
        pv.weighted_contribution = pv.earnings.multiply(pv.weight);
      });

      finalEarnings = Decimal.fromNumber(projectedValue);
      totalWeight = Decimal.fromNumber(1);
      rationale = `Trend-adjusted (slope: ${slope.toFixed(2)}, projected: ${projectedValue.toFixed(2)})`;
      confidenceImpact = 50;
      break;
    }

    case 'advisor_selected': {
      if (!input.advisor_selected_value) {
        warnings.push({
          code: 'NO_ADVISOR_VALUE',
          message: 'Advisor-selected method requires a value, using latest period',
          severity: 'warning',
        });
        const latest = periodValues[periodValues.length - 1];
        latest.weight = Decimal.fromNumber(1);
        latest.weighted_contribution = latest.earnings;
        finalEarnings = latest.earnings;
        totalWeight = Decimal.fromNumber(1);
        rationale = 'Latest period (no advisor value provided)';
        confidenceImpact = 40;
        break;
      }
      finalEarnings = input.advisor_selected_value;
      totalWeight = Decimal.fromNumber(1);
      rationale = 'Advisor-selected maintainable earnings';
      confidenceImpact = 70;
      break;
    }

    case 'forecast_supported': {
      if (!input.forecast_supported_value) {
        warnings.push({
          code: 'NO_FORECAST_VALUE',
          message: 'Forecast-supported method requires a value, using latest period',
          severity: 'warning',
        });
        const latest = periodValues[periodValues.length - 1];
        latest.weight = Decimal.fromNumber(1);
        latest.weighted_contribution = latest.earnings;
        finalEarnings = latest.earnings;
        totalWeight = Decimal.fromNumber(1);
        rationale = 'Latest period (no forecast value provided)';
        confidenceImpact = 40;
        break;
      }
      finalEarnings = input.forecast_supported_value;
      totalWeight = Decimal.fromNumber(1);
      rationale = 'Forecast-supported maintainable earnings';
      confidenceImpact = 65;
      break;
    }
  }

  return {
    method: input.weighting_method,
    period_values: periodValues,
    final_maintainable_earnings: finalEarnings,
    total_weight: totalWeight,
    rationale,
    confidence_impact: confidenceImpact,
    warnings,
  };
}