/**
 * Materiality Policy — Shared Historical Comparison Thresholds
 *
 * THE SINGLE CERTIFIED OWNER for deciding whether a metric value change is
 * "meaningful" (material) vs. immaterial numeric drift (rounding, recalculation noise).
 *
 * Used by the BIE snapshot layer (createSnapshot) to decide whether a metric
 * is added to `changedMetrics`. Immaterial drift is absorbed silently — the
 * stored value updates, but no change event, no journal entry, and no
 * `changedSinceLastBriefing` flag is produced.
 *
 * This prevents phantom micro-delta hero states (e.g. +$5 on a $2.2M business
 * from recalculation rounding) from being promoted as meaningful review changes.
 *
 * Thresholds:
 *   - Currency/valuation metrics: absolute change >= $1,000 OR percentage >= 0.1%
 *   - Score metrics (0-100 scale): absolute change >= 1 point
 *   - Count metrics (hours, counts): absolute change >= 1 unit
 *   - Non-numeric: any structural change is material
 *   - First appearance (oldValue == null): always material (new metric)
 *
 * Consumers MUST NOT hardcode their own materiality thresholds.
 * If a new metric type needs different thresholds, extend this policy.
 */

// Score metrics live on a 0-100 scale — a fractional change is noise.
const SCORE_METRICS = new Set([
  'operations_score',
  'freedom_score',
  'profit_score',
  'iq_score',
]);

// Count metrics are integer-valued — sub-1 drift is impossible/noise.
const COUNT_METRICS = new Set([
  'hours_freed_per_week',
  'hours_worked_per_week',
  'tax_strategy_count',
]);

// Currency/valuation thresholds
const CURRENCY_ABS_THRESHOLD = 1000;   // $1,000
const CURRENCY_PCT_THRESHOLD = 0.001;  // 0.1%

/**
 * Determine whether a metric value change is material (meaningful) or
 * immaterial (numeric drift / rounding noise).
 *
 * @param {string} metricId - The canonical metric ID
 * @param {*} oldValue - Previous value (null = first appearance)
 * @param {*} newValue - Current value
 * @returns {boolean} True if the change is material and should be recorded
 */
export function isMaterialChange(metricId, oldValue, newValue) {
  // First appearance (no prior value) — always material (new metric)
  if (oldValue == null || newValue == null) {
    return oldValue !== newValue;
  }

  // Non-numeric values — any structural difference is material
  if (typeof oldValue !== 'number' || typeof newValue !== 'number') {
    return JSON.stringify(oldValue) !== JSON.stringify(newValue);
  }

  const absDelta = Math.abs(newValue - oldValue);

  // Score metrics (0-100): 1 point threshold
  if (SCORE_METRICS.has(metricId)) {
    return absDelta >= 1;
  }

  // Count metrics: 1 unit threshold
  if (COUNT_METRICS.has(metricId)) {
    return absDelta >= 1;
  }

  // Currency / valuation metrics: absolute OR percentage threshold
  const absBase = Math.max(Math.abs(oldValue), Math.abs(newValue));
  const pctDelta = absBase > 0 ? absDelta / absBase : 0;
  return absDelta >= CURRENCY_ABS_THRESHOLD || pctDelta >= CURRENCY_PCT_THRESHOLD;
}

export default { isMaterialChange };