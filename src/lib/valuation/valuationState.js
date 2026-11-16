/**
 * valuationState — Phase 13.3E.4
 *
 * Pure, deterministic functions that derive the Valuation workspace journey
 * state, section statuses, and the recommended next action from real loaded
 * data (calcSummary, readiness, summary). No I/O. No calculations. No
 * fabrication. When data is missing, the state honestly reports "not_started".
 *
 * The certified Valuation Engine remains the source of truth — this module
 * only interprets its outputs for presentation.
 */

// ── Currency formatter ─────────────────────────────────────────────────────
export function fmtCurrency(value) {
  if (value == null || isNaN(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export function fmtRange(low, high) {
  if (low == null && high == null) return '—';
  return `${fmtCurrency(low)} – ${fmtCurrency(high)}`;
}

// ── Calculation selectors (match certified patterns) ───────────────────────
export function getBlendedRecon(calcSummary) {
  const calcs = calcSummary?.calculations || [];
  return calcs.find(
    (c) => c.calculation_type === 'reconciliation' &&
           c.methodology === 'blended' &&
           !c.superseded_by_calculation_id &&
           c.is_approved
  );
}

export function getEquityBridge(calcSummary) {
  const calcs = calcSummary?.calculations || [];
  return calcs.find(
    (c) => c.calculation_type === 'reconciliation' &&
           c.methodology === 'equity_bridge' &&
           !c.superseded_by_calculation_id &&
           c.is_approved
  );
}

export function getOverallConfidence(calcSummary) {
  return (calcSummary?.confidence_scores || []).find((c) => c.is_overall);
}

export function getApprovedConclusion(calcSummary) {
  return (calcSummary?.conclusions || []).find((c) => c.advisor_approved);
}

export function getNormalizedEarnings(calcSummary) {
  return calcSummary?.normalized_earnings || null;
}

export function getHistoricalWeighting(calcSummary) {
  return calcSummary?.historical_weighting || null;
}

export function getMethodSelections(calcSummary) {
  return calcSummary?.method_selections || [];
}

export function getLatestCalcVersion(calcSummary) {
  const calcs = calcSummary?.calculations || [];
  return calcs[0]?.calculation_engine_version || '—';
}

export function getLatestCalcDate(calcSummary) {
  const calcs = calcSummary?.calculations || [];
  const latest = calcs[0]?.created_date || calcs[0]?.updated_date;
  return latest ? new Date(latest).toLocaleDateString() : '—';
}

// ── Setup completion ───────────────────────────────────────────────────────
export function getSetupStatus(summary) {
  const v = summary?.valuation;
  if (!v) return 'not_started';
  const hasPurpose = !!v.valuation_purpose;
  const hasStandard = !!v.standard_of_value;
  const hasPremise = !!v.valuation_premise;
  const hasDate = !!v.valuation_date;
  const count = [hasPurpose, hasStandard, hasPremise, hasDate].filter(Boolean).length;
  if (count === 4) return 'complete';
  if (count > 0) return 'in_progress';
  return 'not_started';
}

// ── Section status derivation ───────────────────────────────────────────────
export function getEarningsStatus(calcSummary) {
  const ne = getNormalizedEarnings(calcSummary);
  if (!ne) return 'not_started';
  if (ne.is_stale) return 'stale';
  if (ne.is_approved) return 'complete';
  return 'in_progress';
}

export function getWeightingStatus(calcSummary) {
  const hw = getHistoricalWeighting(calcSummary);
  if (!hw) return 'not_started';
  if (hw.is_stale) return 'stale';
  if (hw.is_approved) return 'complete';
  return 'in_progress';
}

export function getMethodsStatus(calcSummary) {
  const selections = getMethodSelections(calcSummary);
  if (selections.length === 0) return 'not_started';
  const selected = selections.filter((s) => s.is_selected);
  if (selected.length === 0) return 'not_started';
  const approved = selected.filter((s) => s.is_approved);
  const hasStale = selected.some((s) => s.is_stale);
  if (hasStale) return 'stale';
  if (approved.length === selected.length) return 'complete';
  return 'in_progress';
}

export function getReconciliationStatus(calcSummary) {
  const recon = getBlendedRecon(calcSummary);
  if (!recon) {
    const anyRecon = (calcSummary?.calculations || []).find(
      (c) => c.calculation_type === 'reconciliation' && c.methodology === 'blended'
    );
    if (anyRecon?.is_stale) return 'stale';
    if (anyRecon) return 'in_progress';
    return 'not_started';
  }
  return 'complete';
}

export function getEnterpriseValueStatus(calcSummary) {
  const recon = getBlendedRecon(calcSummary);
  if (!recon) return 'not_started';
  if (recon.is_stale) return 'stale';
  return 'complete';
}

export function getEquityValueStatus(calcSummary) {
  const bridge = getEquityBridge(calcSummary);
  const anyBridge = (calcSummary?.calculations || []).find(
    (c) => c.calculation_type === 'reconciliation' && c.methodology === 'equity_bridge'
  );
  if (!bridge && !anyBridge) return 'not_started';
  if (!bridge && anyBridge?.is_stale) return 'stale';
  if (!bridge) return 'in_progress';
  if (bridge.is_stale) return 'stale';
  return 'complete';
}

export function getConfidenceStatus(calcSummary) {
  const scores = calcSummary?.confidence_scores || [];
  if (scores.length === 0) return 'not_started';
  const overall = getOverallConfidence(calcSummary);
  if (!overall) return 'in_progress';
  return 'complete';
}

export function getConclusionStatus(calcSummary) {
  const conclusions = calcSummary?.conclusions || [];
  if (conclusions.length === 0) return 'not_started';
  const approved = getApprovedConclusion(calcSummary);
  if (approved) return 'complete';
  return 'in_progress';
}

export function getPublishStatus(readiness) {
  if (!readiness) return 'not_started';
  if (readiness.ready) return 'complete';
  if (readiness.critical_blockers?.length > 0) return 'blocked';
  return 'in_progress';
}

// ── Journey steps ──────────────────────────────────────────────────────────
export const JOURNEY_STEPS = [
  { key: 'setup', label: 'Setup', section: 'setup' },
  { key: 'earnings', label: 'Earnings', section: 'earnings' },
  { key: 'weighting', label: 'Weighting', section: 'weighting' },
  { key: 'methods', label: 'Methods', section: 'methods' },
  { key: 'reconciliation', label: 'Reconciliation', section: 'reconciliation' },
  { key: 'enterprise_value', label: 'Value', section: 'enterprise_value' },
  { key: 'equity_value', label: 'Equity', section: 'equity_value' },
  { key: 'confidence', label: 'Confidence', section: 'confidence' },
  { key: 'conclusion', label: 'Conclusion', section: 'conclusion' },
  { key: 'publish', label: 'Publish', section: 'publish' },
];

export function computeJourney({ summary, calcSummary, readiness }) {
  const statusFns = {
    setup: () => getSetupStatus(summary),
    earnings: () => getEarningsStatus(calcSummary),
    weighting: () => getWeightingStatus(calcSummary),
    methods: () => getMethodsStatus(calcSummary),
    reconciliation: () => getReconciliationStatus(calcSummary),
    enterprise_value: () => getEnterpriseValueStatus(calcSummary),
    equity_value: () => getEquityValueStatus(calcSummary),
    confidence: () => getConfidenceStatus(calcSummary),
    conclusion: () => getConclusionStatus(calcSummary),
    publish: () => getPublishStatus(readiness),
  };

  return JOURNEY_STEPS.map((step) => ({
    ...step,
    status: statusFns[step.key](),
  }));
}

// ── Recommended next action ─────────────────────────────────────────────────
export function computeNextAction({ summary, calcSummary, readiness, canPublish }) {
  const setup = getSetupStatus(summary);
  const earnings = getEarningsStatus(calcSummary);
  const weighting = getWeightingStatus(calcSummary);
  const methods = getMethodsStatus(calcSummary);
  const recon = getReconciliationStatus(calcSummary);
  const equity = getEquityValueStatus(calcSummary);
  const confidence = getConfidenceStatus(calcSummary);
  const conclusion = getConclusionStatus(calcSummary);
  const publish = getPublishStatus(readiness);

  if (setup !== 'complete')
    return { step: 'setup', label: 'Complete the valuation setup', why: 'Purpose, standard of value, premise, and date are required before calculations.', unlocks: 'Maintainable earnings calculation', section: 'setup' };

  if (earnings === 'not_started')
    return { step: 'earnings', label: 'Calculate maintainable earnings', why: 'Normalized earnings form the basis for every income-based method.', unlocks: 'Method selection and historical weighting', section: 'earnings' };

  if (earnings === 'stale')
    return { step: 'earnings', label: 'Recalculate maintainable earnings', why: 'Underlying financial data has changed since the last calculation.', unlocks: 'Updated method results', section: 'earnings' };

  if (weighting === 'not_started' || weighting === 'in_progress')
    return { step: 'weighting', label: 'Approve historical weighting', why: 'Weighting determines the maintainable earnings figure used across methods.', unlocks: 'Method calculations', section: 'weighting' };

  if (weighting === 'stale')
    return { step: 'weighting', label: 'Recalculate historical weighting', why: 'Earnings data has changed since the last weighting.', unlocks: 'Updated maintainable earnings', section: 'weighting' };

  if (methods === 'not_started')
    return { step: 'methods', label: 'Select a primary methodology', why: 'At least one method must be selected and approved before reconciliation.', unlocks: 'Reconciliation', section: 'methods' };

  if (methods === 'in_progress')
    return { step: 'methods', label: 'Approve method selections', why: 'Selected methods require advisor approval before they can be reconciled.', unlocks: 'Reconciliation', section: 'methods' };

  if (methods === 'stale')
    return { step: 'methods', label: 'Review stale method selections', why: 'Underlying inputs have changed since methods were approved.', unlocks: 'Updated method results', section: 'methods' };

  if (recon !== 'complete')
    return { step: 'reconciliation', label: 'Approve the blended reconciliation', why: 'The weighted Enterprise Value requires advisor approval.', unlocks: 'Enterprise Value and Equity Bridge', section: 'reconciliation' };

  if (equity === 'stale')
    return { step: 'equity_value', label: 'Recalculate the equity bridge', why: 'Enterprise Value has changed since the equity bridge was last calculated.', unlocks: 'Updated Equity Value', section: 'equity_value' };

  if (equity === 'not_started' || equity === 'in_progress')
    return { step: 'equity_value', label: 'Calculate the equity bridge', why: 'Equity Value requires a bridge from Enterprise Value.', unlocks: 'Equity Value', section: 'equity_value' };

  if (confidence !== 'complete')
    return { step: 'confidence', label: 'Complete confidence scoring', why: 'Defensibility requires confidence assessment across all categories.', unlocks: 'Advisor conclusion', section: 'confidence' };

  if (conclusion !== 'complete')
    return { step: 'conclusion', label: 'Complete the advisor conclusion', why: 'The conclusion synthesizes all results into a defensible opinion of value.', unlocks: 'Publication', section: 'conclusion' };

  if (publish === 'blocked') {
    const firstBlocker = readiness?.critical_blockers?.[0];
    return {
      step: 'publish',
      label: firstBlocker?.message || 'Resolve the next publication blocker',
      why: firstBlocker?.detail || 'Critical blockers must be resolved before publishing.',
      unlocks: 'Publication',
      section: 'publish',
      linkToValidate: true,
    };
  }

  if (publish === 'complete' && canPublish)
    return { step: 'publish', label: 'Publish Version', why: 'All readiness checks pass.', unlocks: 'Immutable published snapshot', section: 'publish', isPublish: true };

  return { step: 'publish', label: 'Review the valuation', why: 'All steps are complete.', unlocks: 'Publication', section: 'publish' };
}

// ── Workflow state label (for command header when no approved conclusion) ──
export function getWorkflowStateLabel({ summary, calcSummary, readiness }) {
  const setup = getSetupStatus(summary);
  const earnings = getEarningsStatus(calcSummary);
  const weighting = getWeightingStatus(calcSummary);
  const methods = getMethodsStatus(calcSummary);
  const recon = getReconciliationStatus(calcSummary);
  const equity = getEquityValueStatus(calcSummary);
  const conclusion = getConclusionStatus(calcSummary);

  if (setup !== 'complete') return 'Setup incomplete';
  if (earnings === 'not_started') return 'Earnings require calculation';
  if (earnings === 'stale') return 'Earnings require recalculation';
  if (weighting === 'not_started' || weighting === 'in_progress') return 'Historical weighting pending';
  if (weighting === 'stale') return 'Weighting is stale';
  if (methods === 'not_started') return 'Method selection incomplete';
  if (methods === 'in_progress') return 'Methods awaiting approval';
  if (methods === 'stale') return 'Methods are stale';
  if (recon !== 'complete') return 'Reconciliation awaiting approval';
  if (equity === 'stale') return 'Equity bridge is stale';
  if (equity === 'not_started' || equity === 'in_progress') return 'Equity bridge pending';
  if (conclusion !== 'complete') return 'Advisor conclusion not approved';
  return 'Valuation in progress';
}