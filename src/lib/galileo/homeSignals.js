/**
 * Home Signals — maps the Business Intelligence Contract to the signal model
 * consumed by HomeBusinessPulse and DomainFocus.
 *
 * This is the BIS-native signal path for Galileo Home. The Magic Loop uses
 * computeSignalStates (from signalAwakening.js) which reads from conversation
 * answers and extracted facts. Home reads from the certified BIS contract.
 *
 * Never manufactures a number. If BIS has the data, display it. If not, the
 * signal remains in LEARNING state.
 *
 * Provenance is preserved on every signal for "Why?" interactions.
 */

import { SignalState } from '@/lib/galileo/signalAwakening';

/**
 * buildSignalsFromBIS — maps BIS contract fields to the signal model.
 *
 * @param {object|null} contract — the Business Intelligence Contract
 * @returns {object} — { profit, value, operations, freedom, tax, cash }
 */
export function buildSignalsFromBIS(contract) {
  if (!contract) return {};

  const signals = {};

  // ── PROFIT ──────────────────────────────────────────────────────────
  const revenue = contract.profitability?.revenue;
  const ebitda = contract.profitability?.reported_ebitda;
  if (revenue != null && ebitda != null && revenue > 0) {
    const margin = (ebitda / revenue) * 100;
    signals.profit = {
      margin,
      gap: contract.profitability?.profit_gap ?? null,
      benchmark: null, // Benchmarks not in BIS — separate lookup needed
      trend: null, // No historical comparison in BIS yet
      source: contract.profitability?.revenue_source || 'connected',
      provenance: classifyProvenance(contract.profitability?.revenue_source),
      updatedAt: contract.generated_at,
    };
  }

  // ── VALUE ────────────────────────────────────────────────────────────
  if (contract.valuation?.current_value != null) {
    signals.value = {
      current: contract.valuation.current_value,
      gap: contract.valuation?.value_gap ?? null,
      potential: contract.valuation?.potential_value ?? null,
      benchmark: null,
      source: contract.valuation?.current_value_source || 'modeled',
      provenance: classifyProvenance(contract.valuation?.current_value_source),
      updatedAt: contract.generated_at,
    };
  }

  // ── OPERATIONS ──────────────────────────────────────────────────────
  if (contract.operations?.operations_score != null) {
    signals.operations = {
      score: contract.operations.operations_score,
      hoursFreed: contract.operations?.hours_freed_per_week ?? null,
      monthlyValueFreed: contract.operations?.monthly_value_of_time_freed ?? null,
      source: contract.operations?.operations_score_source || 'assessment',
      provenance: classifyProvenance(contract.operations?.operations_score_source),
      updatedAt: contract.generated_at,
    };
  }

  // ── FREEDOM ─────────────────────────────────────────────────────────
  if (contract.freedom?.freedom_score != null) {
    signals.freedom = {
      score: contract.freedom.freedom_score,
      source: contract.freedom?.freedom_score_source || 'assessment',
      provenance: classifyProvenance(contract.freedom?.freedom_score_source),
      updatedAt: contract.generated_at,
    };
  }

  // ── TAX ─────────────────────────────────────────────────────────────
  if (contract.tax?.annual_tax_gap != null) {
    signals.tax = {
      gap: contract.tax.annual_tax_gap,
      tenYearGap: contract.tax?.ten_year_tax_gap ?? null,
      source: contract.tax?.annual_tax_gap_source || 'assessment',
      provenance: classifyProvenance(contract.tax?.annual_tax_gap_source),
      updatedAt: contract.generated_at,
    };
  }

  // ── CASH ────────────────────────────────────────────────────────────
  // Cash flow data is not currently in BIS. Signal remains absent (LEARNING).
  // When accounting integration is connected, this will be populated.

  return signals;
}

/**
 * computeHomeSignalStates — derives signal states from BIS-built signals.
 * This is the Home equivalent of computeSignalStates, but reads from BIS
 * instead of conversation answers/extracted facts.
 *
 * @param {object} signals — the signals from buildSignalsFromBIS
 * @param {string|null} activeDomain — currently active pulse domain
 * @returns {object} — { cash, tax, profit, operations, value, freedom }
 */
export function computeHomeSignalStates(signals = {}, activeDomain = null) {
  return {
    cash: computeCashHomeSignal(signals.cash, activeDomain),
    tax: computeTaxHomeSignal(signals.tax, activeDomain),
    profit: computeProfitHomeSignal(signals.profit, activeDomain),
    operations: computeOperationsHomeSignal(signals.operations, activeDomain),
    value: computeValueHomeSignal(signals.value, activeDomain),
    freedom: computeFreedomHomeSignal(signals.freedom, activeDomain),
  };
}

function computeCashHomeSignal(signal, activeDomain) {
  // Cash flow data not yet in BIS
  const state = activeDomain === 'cash' ? SignalState.ACTIVE : SignalState.LEARNING;
  return { state, value: null, label: 'Learning…', provenance: null };
}

function computeTaxHomeSignal(signal, activeDomain) {
  if (!signal || signal.gap == null) {
    const state = activeDomain === 'tax' ? SignalState.ACTIVE : SignalState.LEARNING;
    return { state, value: null, label: 'Learning…', provenance: null };
  }

  const hasGap = signal.gap > 0;
  let state = SignalState.KNOWN;
  if (hasGap) state = SignalState.INTERESTING;
  if (activeDomain === 'tax') state = SignalState.ACTIVE;

  return {
    state,
    value: signal.gap,
    label: formatMoney(signal.gap),
    secondary: 'annual gap',
    provenance: signal.provenance,
    source: signal.source,
  };
}

function computeProfitHomeSignal(signal, activeDomain) {
  if (!signal || signal.margin == null) {
    const state = activeDomain === 'profit' ? SignalState.ACTIVE : SignalState.LEARNING;
    return { state, value: null, label: 'Learning…', provenance: null };
  }

  const hasGap = signal.gap != null && signal.gap > 0;
  let state = SignalState.KNOWN;
  if (hasGap) state = SignalState.INTERESTING;
  if (activeDomain === 'profit') state = SignalState.ACTIVE;

  return {
    state,
    value: signal.margin,
    label: `${signal.margin.toFixed(1)}%`,
    secondary: hasGap ? `${formatMoney(signal.gap)} gap` : null,
    provenance: signal.provenance,
    source: signal.source,
  };
}

function computeOperationsHomeSignal(signal, activeDomain) {
  if (!signal || signal.score == null) {
    const state = activeDomain === 'operations' ? SignalState.ACTIVE : SignalState.LEARNING;
    return { state, value: null, label: 'Learning…', provenance: null };
  }

  const score = signal.score;
  let state = SignalState.KNOWN;
  if (score < 50) state = SignalState.INTERESTING;
  if (activeDomain === 'operations') state = SignalState.ACTIVE;

  return {
    state,
    value: score,
    label: score < 40 ? 'High dependency' : score < 65 ? 'Moderate' : 'Light',
    secondary: signal.hoursFreed != null ? `${signal.hoursFreed} hrs/week freed` : 'owner involvement',
    provenance: signal.provenance,
    source: signal.source,
  };
}

function computeValueHomeSignal(signal, activeDomain) {
  if (!signal || signal.current == null) {
    const state = activeDomain === 'value' ? SignalState.ACTIVE : SignalState.LEARNING;
    return { state, value: null, label: 'Learning…', provenance: null };
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
    provenance: signal.provenance,
    source: signal.source,
  };
}

function computeFreedomHomeSignal(signal, activeDomain) {
  if (!signal || signal.score == null) {
    const state = activeDomain === 'freedom' ? SignalState.ACTIVE : SignalState.LEARNING;
    return { state, value: null, label: 'Learning…', provenance: null };
  }

  const score = signal.score;
  let state = SignalState.KNOWN;
  if (score < 50) state = SignalState.INTERESTING;
  if (activeDomain === 'freedom') state = SignalState.ACTIVE;

  return {
    state,
    value: score,
    label: score < 40 ? 'Constrained' : score < 65 ? 'Moderate' : 'Free',
    secondary: 'owner freedom',
    provenance: signal.provenance,
    source: signal.source,
  };
}

/**
 * classifyProvenance — maps a BIS source string to a provenance label.
 *
 * @param {string|null} source — the BIS source field (e.g. 'extracted_fields', 'assessment_calculations')
 * @returns {string} — one of: CONNECTED_DATA, DOCUMENT_SUPPORTED, USER_REPORTED, DERIVED, MODELED, BENCHMARK
 */
export function classifyProvenance(source) {
  if (!source) return null;
  const s = source.toLowerCase();
  if (s.includes('extracted') || s.includes('document')) return 'DOCUMENT_SUPPORTED';
  if (s.includes('assessment')) return 'MODELED';
  if (s.includes('dashboard') || s.includes('derived')) return 'DERIVED';
  if (s.includes('snapshot')) return 'CONNECTED_DATA';
  if (s.includes('benchmark')) return 'BENCHMARK';
  if (s.includes('business_assessments')) return 'USER_REPORTED';
  return 'DERIVED';
}

/**
 * getProvenanceLabel — human-readable label for provenance.
 */
export function getProvenanceLabel(provenance) {
  const labels = {
    CONNECTED_DATA: 'Connected Data',
    DOCUMENT_SUPPORTED: 'Document Supported',
    USER_REPORTED: 'User Reported',
    DERIVED: 'Derived',
    MODELED: 'Modeled',
    BENCHMARK: 'Benchmark',
  };
  return labels[provenance] || null;
}

function formatMoney(n) {
  if (n == null) return null;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
}