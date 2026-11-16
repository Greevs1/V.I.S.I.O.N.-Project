/**
 * buildValueEngine — Phase 13.3E.4A
 *
 * Pure, deterministic engine that organizes existing intelligence candidates
 * into six institutional business-quality dimensions. No calculations. No
 * fabrication. No I/O. It consumes the intelligence record already loaded by
 * the Discover workspace and re-presents it as a business-quality diagnosis.
 *
 * The six dimensions:
 *   1. Financial Quality
 *   2. Growth Quality
 *   3. Commercial Quality
 *   4. Operational Quality
 *   5. Leadership and Transferability
 *   6. Risk and Governance
 *
 * For each dimension the engine produces a scorecard:
 *   - current_score: the actual primary metric value, or "Insufficient
 *     verified information" when the data is missing.
 *   - confidence: average confidence of available evidence (0-100).
 *   - evidence_completeness: available / expected (0-100).
 *   - strengths: available evidence with positive relevance.
 *   - risks: available evidence with risk relevance or low confidence.
 *   - missing_evidence: expected items with no data.
 *   - ebitda / multiple / transferability relevance (static labels).
 *   - recommended_next_step: derived from what is missing.
 *
 * It also produces a Business Quality Summary:
 *   - strongest dimension, weakest dimension, largest constraints, gaps,
 *     highest-confidence strength, recommended next action.
 *
 * Nothing here alters the Valuation Engine. No new values are invented.
 */

// ── Dimension definitions ─────────────────────────────────────────────────
// Each evidence item maps to a field_key in the intelligence registry when
// available. Items without a resolver show as "missing" — never fabricated.

const DIMENSIONS = [
  {
    key: 'financial_quality',
    label: 'Financial Quality',
    order: 1,
    ebitda_relevance: 'Primary',
    multiple_relevance: 'High',
    transferability_relevance: 'Moderate',
    primary_metric: { field_key: 'gross_margin_percentage', label: 'Gross Margin' },
    evidence_items: [
      { key: 'revenue_trend', label: 'Revenue Trend', field_key: 'ttm_revenue', relevance: 'ebitda' },
      { key: 'gross_margin_trend', label: 'Gross-Margin Trend', field_key: 'gross_margin_percentage', relevance: 'multiple' },
      { key: 'ebitda_trend', label: 'EBITDA Trend', field_key: 'ttm_ebitda', relevance: 'ebitda' },
      { key: 'earnings_quality', label: 'Earnings Quality', field_key: 'ttm_ebitda', relevance: 'ebitda' },
      { key: 'cash_conversion', label: 'Cash Conversion', field_key: null, relevance: 'ebitda' },
      { key: 'working_capital', label: 'Working Capital', field_key: 'working_capital_balance', relevance: 'ebitda' },
      { key: 'capex_intensity', label: 'CapEx Intensity', field_key: 'annual_capex', relevance: 'ebitda' },
      { key: 'financial_reporting_quality', label: 'Financial Reporting Quality', field_key: null, relevance: 'multiple' },
      { key: 'forecast_reliability', label: 'Forecast Reliability', field_key: null, relevance: 'multiple' },
      { key: 'approved_adjustments', label: 'Approved Adjustments', field_key: null, relevance: 'ebitda' },
      { key: 'qoe_concerns', label: 'Quality of Earnings Concerns', field_key: null, relevance: 'ebitda' },
    ],
  },
  {
    key: 'growth_quality',
    label: 'Growth Quality',
    order: 2,
    ebitda_relevance: 'High',
    multiple_relevance: 'Primary',
    transferability_relevance: 'Moderate',
    primary_metric: { field_key: 'historical_growth_rate', label: '3-Year Revenue CAGR' },
    evidence_items: [
      { key: 'historical_growth', label: 'Historical Growth', field_key: 'historical_growth_rate', relevance: 'multiple' },
      { key: 'forecast_growth', label: 'Forecast Growth', field_key: null, relevance: 'multiple' },
      { key: 'market_opportunity', label: 'Market Opportunity', field_key: null, relevance: 'multiple' },
      { key: 'growth_durability', label: 'Growth Durability', field_key: null, relevance: 'multiple' },
      { key: 'organic_growth', label: 'Organic Growth', field_key: null, relevance: 'ebitda' },
      { key: 'acquisition_opportunities', label: 'Acquisition Opportunities', field_key: null, relevance: 'ebitda' },
      { key: 'geographic_expansion', label: 'Geographic Expansion', field_key: null, relevance: 'multiple' },
      { key: 'product_expansion', label: 'Product / Service Expansion', field_key: null, relevance: 'multiple' },
      { key: 'capacity_constraints', label: 'Capacity Constraints', field_key: null, relevance: 'ebitda' },
    ],
  },
  {
    key: 'commercial_quality',
    label: 'Commercial Quality',
    order: 3,
    ebitda_relevance: 'Moderate',
    multiple_relevance: 'Primary',
    transferability_relevance: 'High',
    primary_metric: { field_key: 'customer_retention_rate', label: 'Customer Retention' },
    evidence_items: [
      { key: 'recurring_revenue', label: 'Recurring Revenue', field_key: 'recurring_revenue_percentage', relevance: 'multiple' },
      { key: 'contracted_revenue', label: 'Contracted Revenue', field_key: null, relevance: 'multiple' },
      { key: 'retention', label: 'Retention', field_key: 'customer_retention_rate', relevance: 'multiple' },
      { key: 'churn', label: 'Churn', field_key: null, relevance: 'multiple' },
      { key: 'customer_concentration', label: 'Customer Concentration', field_key: 'revenue_concentration_top_customer', relevance: 'risk' },
      { key: 'pricing_power', label: 'Pricing Power', field_key: null, relevance: 'multiple' },
      { key: 'revenue_mix', label: 'Revenue Mix', field_key: null, relevance: 'multiple' },
      { key: 'sales_process', label: 'Sales Process', field_key: null, relevance: 'ebitda' },
      { key: 'backlog', label: 'Backlog', field_key: null, relevance: 'ebitda' },
      { key: 'pipeline', label: 'Pipeline', field_key: null, relevance: 'ebitda' },
      { key: 'customer_profitability', label: 'Customer Profitability', field_key: null, relevance: 'ebitda' },
      { key: 'brand_position', label: 'Brand Position', field_key: null, relevance: 'multiple' },
    ],
  },
  {
    key: 'operational_quality',
    label: 'Operational Quality',
    order: 4,
    ebitda_relevance: 'High',
    multiple_relevance: 'High',
    transferability_relevance: 'Primary',
    primary_metric: { field_key: 'documented_sops', label: 'SOP Coverage' },
    evidence_items: [
      { key: 'sop_coverage', label: 'SOP Coverage', field_key: 'documented_sops', relevance: 'transferability' },
      { key: 'kpi_maturity', label: 'KPI Maturity', field_key: null, relevance: 'multiple' },
      { key: 'technology', label: 'Technology', field_key: null, relevance: 'multiple' },
      { key: 'automation', label: 'Automation', field_key: null, relevance: 'ebitda' },
      { key: 'capacity_utilization', label: 'Capacity Utilization', field_key: null, relevance: 'ebitda' },
      { key: 'quality_control', label: 'Quality Control', field_key: null, relevance: 'multiple' },
      { key: 'job_costing', label: 'Job Costing', field_key: null, relevance: 'ebitda' },
      { key: 'monthly_close', label: 'Monthly Close', field_key: null, relevance: 'multiple' },
      { key: 'reporting_cadence', label: 'Reporting Cadence', field_key: null, relevance: 'multiple' },
      { key: 'scalability', label: 'Scalability', field_key: null, relevance: 'multiple' },
      { key: 'process_dependency', label: 'Process Dependency', field_key: null, relevance: 'transferability' },
      { key: 'employee_count', label: 'Employee Count', field_key: 'employee_count', relevance: 'context' },
    ],
  },
  {
    key: 'leadership_transferability',
    label: 'Leadership and Transferability',
    order: 5,
    ebitda_relevance: 'Moderate',
    multiple_relevance: 'Moderate',
    transferability_relevance: 'Primary',
    primary_metric: { field_key: 'owner_hours_per_week', label: 'Owner Hours / Week' },
    evidence_items: [
      { key: 'owner_dependency', label: 'Owner Dependency', field_key: 'owner_hours_per_week', relevance: 'transferability' },
      { key: 'management_depth', label: 'Management Depth', field_key: null, relevance: 'transferability' },
      { key: 'second_in_command', label: 'Second-in-Command', field_key: null, relevance: 'transferability' },
      { key: 'leadership_accountability', label: 'Leadership Accountability', field_key: null, relevance: 'multiple' },
      { key: 'succession', label: 'Succession', field_key: 'succession_plan_exists', relevance: 'transferability' },
      { key: 'key_person_risk', label: 'Key-Person Risk', field_key: 'owner_hours_per_week', relevance: 'risk' },
      { key: 'employee_retention', label: 'Employee Retention', field_key: null, relevance: 'multiple' },
      { key: 'organizational_design', label: 'Organizational Design', field_key: null, relevance: 'transferability' },
      { key: 'contract_transferability', label: 'Contract Transferability', field_key: null, relevance: 'transferability' },
      { key: 'institutional_readiness', label: 'Institutional Readiness', field_key: null, relevance: 'transferability' },
      { key: 'ownership_structure', label: 'Ownership Structure', field_key: 'ownership_structure', relevance: 'transferability' },
    ],
  },
  {
    key: 'risk_governance',
    label: 'Risk and Governance',
    order: 6,
    ebitda_relevance: 'Moderate',
    multiple_relevance: 'High',
    transferability_relevance: 'High',
    primary_metric: { field_key: 'pending_litigation', label: 'Pending Litigation' },
    evidence_items: [
      { key: 'legal_risk', label: 'Legal Risk', field_key: 'pending_litigation', relevance: 'risk' },
      { key: 'tax_risk', label: 'Tax Risk', field_key: 'tax_filing_status', relevance: 'risk' },
      { key: 'regulatory_risk', label: 'Regulatory Risk', field_key: null, relevance: 'risk' },
      { key: 'cybersecurity', label: 'Cybersecurity', field_key: 'cybersecurity_measures', relevance: 'risk' },
      { key: 'insurance', label: 'Insurance', field_key: null, relevance: 'risk' },
      { key: 'vendor_concentration', label: 'Vendor Concentration', field_key: null, relevance: 'risk' },
      { key: 'customer_concentration_risk', label: 'Customer Concentration', field_key: 'revenue_concentration_top_customer', relevance: 'risk' },
      { key: 'personal_guarantees', label: 'Personal Guarantees', field_key: null, relevance: 'risk' },
      { key: 'licenses_permits', label: 'Licenses and Permits', field_key: null, relevance: 'risk' },
      { key: 'governance_maturity', label: 'Governance Maturity', field_key: null, relevance: 'multiple' },
      { key: 'change_of_control_risk', label: 'Change-of-Control Risk', field_key: null, relevance: 'risk' },
    ],
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

const findCandidate = (candidates, fieldKey) =>
  (Array.isArray(candidates) ? candidates : []).find((c) => c.field_key === fieldKey);

const avg = (nums) => (nums.length ? Math.round(nums.reduce((s, n) => s + n, 0) / nums.length) : 0);

const isVerified = (c) => c && (c.status === 'verified' || c.confidence_score >= 85);

// ── Scorecard builder ───────────────────────────────────────────────────────

function buildScorecard(dimension, candidates, conflicts) {
  const items = dimension.evidence_items.map((item) => {
    const candidate = item.field_key ? findCandidate(candidates, item.field_key) : null;
    const hasConflict = Array.isArray(conflicts) && conflicts.some((cf) => cf.field_key === item.field_key);
    return {
      ...item,
      available: !!candidate,
      value: candidate?.formatted_value || candidate?.suggested_value || null,
      confidence: candidate?.confidence_score || 0,
      source: candidate?.source_name || null,
      status: candidate?.status || 'missing',
      conflicting: hasConflict,
    };
  });

  const availableItems = items.filter((i) => i.available);
  const missingItems = items.filter((i) => !i.available);
  const conflictingItems = items.filter((i) => i.conflicting);

  const evidenceCompleteness = Math.round((availableItems.length / items.length) * 100);
  const confidence = availableItems.length
    ? avg(availableItems.map((i) => i.confidence))
    : 0;

  // Strengths: available, high confidence, positive relevance
  const strengths = availableItems
    .filter((i) => i.confidence >= 70 && (i.relevance === 'ebitda' || i.relevance === 'multiple' || i.relevance === 'transferability'))
    .map((i) => ({ label: i.label, value: i.value, confidence: i.confidence, source: i.source }));

  // Risks: risk relevance, or low confidence, or conflicting
  const risks = [
    ...availableItems.filter((i) => i.relevance === 'risk').map((i) => ({ label: i.label, value: i.value, confidence: i.confidence, source: i.source })),
    ...conflictingItems.map((i) => ({ label: i.label, value: 'Conflicting sources', confidence: 0, source: 'Multiple' })),
  ];

  // Current score: the primary metric's actual value, or insufficient
  const primary = dimension.primary_metric;
  const primaryCandidate = primary?.field_key ? findCandidate(candidates, primary.field_key) : null;
  const currentScore = primaryCandidate
    ? {
        label: primary.label,
        value: primaryCandidate.formatted_value || primaryCandidate.suggested_value,
        confidence: primaryCandidate.confidence_score,
        verified: isVerified(primaryCandidate),
      }
    : null; // null = "Insufficient verified information"

  // Recommended next validation step — derived from the highest-priority gap
  const recommendedNextStep = deriveNextStep(dimension, missingItems, conflictingItems, currentScore);

  return {
    key: dimension.key,
    label: dimension.label,
    order: dimension.order,
    ebitda_relevance: dimension.ebitda_relevance,
    multiple_relevance: dimension.multiple_relevance,
    transferability_relevance: dimension.transferability_relevance,
    current_score: currentScore,
    confidence,
    evidence_completeness: evidenceCompleteness,
    strengths,
    risks,
    missing_evidence: missingItems.map((i) => i.label),
    conflicting_count: conflictingItems.length,
    recommended_next_step: recommendedNextStep,
    items,
  };
}

function deriveNextStep(dimension, missing, conflicting, currentScore) {
  if (conflicting.length > 0) return `Resolve ${conflicting.length} conflicting value${conflicting.length !== 1 ? 's' : ''} in ${dimension.label}`;
  if (!currentScore) return `Verify ${dimension.primary_metric?.label || 'primary metric'} to establish a current score`;
  const highImpactMissing = missing.filter((m) => m.relevance === 'ebitda' || m.relevance === 'multiple' || m.relevance === 'transferability');
  if (highImpactMissing.length > 0) return `Gather evidence for ${highImpactMissing[0].label}`;
  if (missing.length > 0) return `Optional: document ${missing[0].label}`;
  return 'Sufficient verified evidence for this dimension';
}

// ── Business Quality Summary ────────────────────────────────────────────────

function buildSummary(scorecards) {
  const withScores = scorecards.filter((s) => s.current_score);
  const sortedByCompleteness = [...scorecards].sort((a, b) => b.evidence_completeness - a.evidence_completeness);
  const sortedByConfidence = [...scorecards].filter((s) => s.confidence > 0).sort((a, b) => b.confidence - a.confidence);

  const strongest = sortedByCompleteness[0] || null;
  const weakest = sortedByCompleteness[sortedByCompleteness.length - 1] || null;

  // Largest constraints — dimensions with the most risk items
  const sortedByRisk = [...scorecards].sort((a, b) => b.risks.length - a.risks.length);
  const largestRiskDimension = sortedByRisk[0] || null;

  // Largest evidence gap — dimension with lowest completeness
  const largestGap = sortedByCompleteness[sortedByCompleteness.length - 1] || null;

  // Highest-confidence strength
  const allStrengths = scorecards.flatMap((s) => s.strengths.map((st) => ({ ...st, dimension: s.label })));
  const highestConfidenceStrength = allStrengths.sort((a, b) => b.confidence - a.confidence)[0] || null;

  // EBITDA constraint — the dimension with most missing ebitda-relevance items
  const ebitdaGaps = scorecards
    .map((s) => ({ label: s.label, count: s.items.filter((i) => !i.available && i.relevance === 'ebitda').length }))
    .sort((a, b) => b.count - a.count);
  const largestEbitdaConstraint = ebitdaGaps[0]?.count > 0 ? ebitdaGaps[0] : null;

  // Multiple constraint
  const multipleGaps = scorecards
    .map((s) => ({ label: s.label, count: s.items.filter((i) => !i.available && i.relevance === 'multiple').length }))
    .sort((a, b) => b.count - a.count);
  const largestMultipleConstraint = multipleGaps[0]?.count > 0 ? multipleGaps[0] : null;

  // Transferability risk
  const transferabilityGaps = scorecards
    .map((s) => ({ label: s.label, count: s.items.filter((i) => !i.available && i.relevance === 'transferability').length }))
    .sort((a, b) => b.count - a.count);
  const largestTransferabilityRisk = transferabilityGaps[0]?.count > 0 ? transferabilityGaps[0] : null;

  // Recommended next action — from the most incomplete high-impact dimension
  const nextAction = scorecards
    .filter((s) => s.recommended_next_step !== 'Sufficient verified evidence for this dimension')
    .sort((a, b) => a.order - b.order)[0];

  return {
    strongest_dimension: strongest ? { label: strongest.label, completeness: strongest.evidence_completeness } : null,
    weakest_dimension: weakest ? { label: weakest.label, completeness: weakest.evidence_completeness } : null,
    largest_ebitda_constraint: largestEbitdaConstraint,
    largest_multiple_constraint: largestMultipleConstraint,
    largest_transferability_risk: largestTransferabilityRisk,
    largest_evidence_gap: largestGap ? { label: largestGap.label, completeness: largestGap.evidence_completeness } : null,
    highest_confidence_strength: highestConfidenceStrength,
    recommended_next_action: nextAction
      ? { dimension: nextAction.label, action: nextAction.recommended_next_step }
      : { dimension: null, action: 'Review the Build Value scorecards' },
  };
}

// ── Main entry ──────────────────────────────────────────────────────────────

export function buildValueAssessment(intelligence) {
  if (!intelligence || typeof intelligence !== 'object') return { scorecards: [], summary: null };

  const candidates = Array.isArray(intelligence.candidates) ? intelligence.candidates : [];
  const conflicts = Array.isArray(intelligence.conflicts) ? intelligence.conflicts : [];

  const scorecards = DIMENSIONS.map((dim) => buildScorecard(dim, candidates, conflicts));
  const summary = buildSummary(scorecards);

  return { scorecards, summary };
}

export const BUILD_VALUE_DIMENSION_KEYS = DIMENSIONS.map((d) => d.key);