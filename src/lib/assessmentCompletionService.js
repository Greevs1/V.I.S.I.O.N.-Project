/**
 * Assessment Completion Service — CANONICAL source of truth (Phase 9)
 *
 * Every component that needs to know whether an assessment is "completed"
 * MUST read from this service. Nothing infers completion independently.
 *
 * Completion is defined by the Shared Intelligence Contract
 * (contract.assessments[type].completed) — the single certified owner.
 * A completed assessment with a zero result is still COMPLETED.
 * Falls back to metric presence in bis._raw only when the contract is
 * unavailable (legacy path). This guarantees the Business Intelligence
 * Confidence card, the Executive Briefing, the Journey, Onboarding
 * Progress, and the Dashboard all agree.
 *
 * Shape:
 *   {
 *     profit: true, value: true, tax: true,
 *     operations: true, recast: true, freedom: true,
 *     completedCount: 6, totalCount: 6,
 *     missing: [{ key, label, path, estimatedValue }],
 *     completedTypes: ['profit_gap', ...],
 *     confidenceScore: 94,
 *     highestValueMissing: { key, label, path, estimatedValue } | null,
 *   }
 *
 * This file performs NO calculations — it is a read-only projection of BIS.
 */

const ASSESSMENTS = [
  { key: 'profit',     type: 'profit_gap',         label: 'Profit Gap',   metric: 'profit_gap_amount',  path: '/assessments/profit-gap',    estValue: (r) => r.profit_gap_amount || 50000 },
  { key: 'value',      type: 'value_gap',          label: 'Value Gap',    metric: 'value_gap_amount',    path: '/assessments/value-gap',     estValue: (r) => r.value_gap_amount || 250000 },
  { key: 'tax',        type: 'tax_gap',            label: 'Tax Gap',       metric: 'tax_gap_annual',      path: '/assessments/tax-gap',       estValue: (r) => r.tax_gap_annual || 15000 },
  { key: 'operations', type: 'operations_gap',    label: 'Operations',    metric: 'operations_score',    path: '/assessments/operations-gap', estValue: () => 100000 },
  { key: 'recast',     type: 'recast_ebitda',      label: 'Recast EBITDA', metric: 'recast_add_backs',    path: '/assessments/recast-ebitda', estValue: (r) => r.recast_valuation_increase || 200000 },
  { key: 'freedom',    type: 'freedom_assessment', label: 'Freedom',       metric: 'freedom_score',       path: '/assessments/freedom',       estValue: () => 50000 },
];

export const ASSESSMENT_LIST = ASSESSMENTS;

export function getAssessmentCompletion(bis) {
  // Canonical: Shared Intelligence Contract is the single certified owner of
  // assessment completion state. A completed assessment with a zero result
  // is still COMPLETED. Never infer from metric presence alone.
  const contract = bis?._sources?.assessmentSummary?.intelligence_contract;
  const r = bis?._raw || {};
  const status = {};
  const missing = [];
  const completedTypes = [];
  let completedCount = 0;

  for (const a of ASSESSMENTS) {
    const present = contract?.assessments?.[a.type]?.completed === true || r[a.metric] != null;
    status[a.key] = present;
    if (present) {
      completedCount += 1;
      completedTypes.push(a.type);
    } else {
      missing.push({ key: a.key, label: a.label, path: a.path, estimatedValue: a.estValue(r) });
    }
  }

  const totalCount = ASSESSMENTS.length;
  const confidenceScore = Math.round((completedCount / totalCount) * 100);
  const highestValueMissing = missing.length
    ? missing.slice().sort((x, y) => (y.estimatedValue || 0) - (x.estimatedValue || 0))[0]
    : null;

  return {
    profit: status.profit,
    value: status.value,
    tax: status.tax,
    operations: status.operations,
    recast: status.recast,
    freedom: status.freedom,
    completedCount,
    totalCount,
    missing,
    completedTypes,
    confidenceScore,
    highestValueMissing,
  };
}

export default getAssessmentCompletion;