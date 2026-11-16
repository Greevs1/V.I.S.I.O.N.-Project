/**
 * Signal Awakening — progressive business pulse awakening.
 *
 * Signals don't appear fully populated immediately. They progressively
 * awaken as Galileo understands the business:
 *
 *   unknown    → No data at all → "Learning…"
 *   learning   → Some data, not enough to compute → "Learning…"
 *   known      → Enough data to compute → show value
 *   interesting → Value computed + has potential/insight → show value + indicator
 *   active     → User is currently interacting with this domain → highlighted
 *
 * This creates the feeling that Galileo is building a living model.
 * NOT gamified progress bars — just quiet, honest signal states.
 */

export const SignalState = {
  UNKNOWN: 'unknown',
  LEARNING: 'learning',
  KNOWN: 'known',
  INTERESTING: 'interesting',
  ACTIVE: 'active',
};

/**
 * computeSignalStates — derives the awakening state for each of the 6 signals.
 *
 * @param {object} model — the preliminary model from buildPreliminaryModel
 * @param {object} answers — current discovery answers
 * @param {object} extractedFacts — document extraction result
 * @param {string|null} activeDomain — currently active pulse domain
 * @returns {object} — { cash, tax, profit, operations, value, freedom } each with { state, value, label }
 */
export function computeSignalStates(model = null, answers = {}, extractedFacts = null, activeDomain = null) {
  const signals = model?.signals || {};
  const hasDoc = extractedFacts?.success;

  return {
    cash: computeCashSignal(signals.cash, answers, hasDoc, activeDomain),
    tax: computeTaxSignal(signals.tax, answers, hasDoc, activeDomain),
    profit: computeProfitSignal(signals.profit, answers, extractedFacts, activeDomain),
    operations: computeOperationsSignal(signals.operations, answers, activeDomain),
    value: computeValueSignal(signals.value, answers, extractedFacts, activeDomain),
    freedom: computeFreedomSignal(signals.freedom, answers, activeDomain),
  };
}

function computeCashSignal(signal, answers, hasDoc, activeDomain) {
  // Cash requires cash flow data we don't have yet
  const state = activeDomain === 'cash' ? SignalState.ACTIVE : SignalState.UNKNOWN;
  return { state, value: null, label: 'Learning…' };
}

function computeTaxSignal(signal, answers, hasDoc, activeDomain) {
  // Tax requires tax return data
  let state = SignalState.UNKNOWN;
  if (hasDoc) state = SignalState.LEARNING;
  if (activeDomain === 'tax') state = SignalState.ACTIVE;
  return { state, value: null, label: state === SignalState.UNKNOWN ? 'Learning…' : 'Analyzing…' };
}

function computeProfitSignal(signal, answers, extractedFacts, activeDomain) {
  const hasDoc = extractedFacts?.success;
  const exFacts = extractedFacts?.facts || {};
  const docRevenue = exFacts.annual_revenue?.normalized;
  const docEbitda = exFacts.reported_ebitda?.normalized ?? exFacts.operating_income?.normalized;

  // Need both revenue and ebitda for profit margin
  const revenue = docRevenue ?? answers.revenue;
  const ebitda = docEbitda ?? answers.ebitda;

  if (!revenue || ebitda == null) {
    const state = activeDomain === 'profit' ? SignalState.ACTIVE : SignalState.LEARNING;
    return { state, value: null, label: 'Learning…' };
  }

  const margin = (ebitda / revenue) * 100;
  const hasBenchmark = signal?.benchmark != null;
  const hasGap = signal?.gap != null && signal.gap > 0;

  let state = SignalState.KNOWN;
  if (hasGap) state = SignalState.INTERESTING;
  if (activeDomain === 'profit') state = SignalState.ACTIVE;

  return {
    state,
    value: margin,
    label: `${margin.toFixed(1)}%`,
    secondary: hasBenchmark ? 'vs industry' : null,
    source: hasDoc ? 'document' : 'user',
  };
}

function computeOperationsSignal(signal, answers, activeDomain) {
  if (!answers.involvement && !answers.employees) {
    const state = activeDomain === 'operations' ? SignalState.ACTIVE : SignalState.LEARNING;
    return { state, value: null, label: 'Learning…' };
  }

  const score = signal?.score;
  if (score == null) {
    const state = activeDomain === 'operations' ? SignalState.ACTIVE : SignalState.LEARNING;
    return { state, value: null, label: 'Learning…' };
  }

  let state = SignalState.KNOWN;
  if (score < 50) state = SignalState.INTERESTING; // Low score = opportunity
  if (activeDomain === 'operations') state = SignalState.ACTIVE;

  return {
    state,
    value: score,
    label: score < 40 ? 'High dependency' : score < 65 ? 'Moderate' : 'Light',
    secondary: 'owner involvement',
  };
}

function computeValueSignal(signal, answers, extractedFacts, activeDomain) {
  const hasDoc = extractedFacts?.success;
  const exFacts = extractedFacts?.facts || {};
  const docRevenue = exFacts.annual_revenue?.normalized;
  const docEbitda = exFacts.reported_ebitda?.normalized ?? exFacts.operating_income?.normalized;

  const revenue = docRevenue ?? answers.revenue;
  const ebitda = docEbitda ?? answers.ebitda;

  if (!revenue || ebitda == null) {
    const state = activeDomain === 'value' ? SignalState.ACTIVE : SignalState.LEARNING;
    return { state, value: null, label: 'Learning…' };
  }

  if (!signal || signal.current == null) {
    const state = activeDomain === 'value' ? SignalState.ACTIVE : SignalState.LEARNING;
    return { state, value: null, label: 'Learning…' };
  }

  const hasGap = signal.gap != null && signal.gap > 0;
  let state = SignalState.KNOWN;
  if (hasGap) state = SignalState.INTERESTING;
  if (activeDomain === 'value') state = SignalState.ACTIVE;

  return {
    state,
    value: signal.current,
    label: formatMoney(signal.current),
    secondary: hasGap ? `+${formatMoney(signal.gap)} potential` : null,
    source: hasDoc ? 'document' : 'modeled',
  };
}

function computeFreedomSignal(signal, answers, activeDomain) {
  if (!answers.involvement) {
    const state = activeDomain === 'freedom' ? SignalState.ACTIVE : SignalState.LEARNING;
    return { state, value: null, label: 'Learning…' };
  }

  const score = signal?.score;
  if (score == null) {
    const state = activeDomain === 'freedom' ? SignalState.ACTIVE : SignalState.LEARNING;
    return { state, value: null, label: 'Learning…' };
  }

  let state = SignalState.KNOWN;
  if (score < 50) state = SignalState.INTERESTING;
  if (activeDomain === 'freedom') state = SignalState.ACTIVE;

  return {
    state,
    value: score,
    label: score < 40 ? 'Constrained' : score < 65 ? 'Moderate' : 'Free',
    secondary: 'owner freedom',
  };
}

/**
 * getAwakeningProgress — returns how many signals have awakened.
 * Used for subtle model completeness, NOT a gamified progress bar.
 */
export function getAwakeningProgress(signalStates) {
  const states = Object.values(signalStates);
  const awake = states.filter((s) => s.state !== SignalState.UNKNOWN && s.state !== SignalState.LEARNING).length;
  return {
    awake,
    total: states.length,
    ratio: awake / states.length,
  };
}

function formatMoney(n) {
  if (n == null) return null;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
}