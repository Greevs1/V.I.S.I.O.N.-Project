/**
 * Contract Field Registry — Machine-Readable
 *
 * The authoritative registry of all fields exposed by the Shared Business
 * Intelligence Contract. Every field that a presentation/synthesis consumer
 * may read MUST be registered here.
 *
 * Purpose:
 *   - Enable automated architectural validation (architecture guard)
 *   - Prevent silent bypass of the contract for current business truth
 *   - Document certified ownership, nullability, and scoping for every field
 *
 * Rules:
 *   - If a consumer needs a current business metric NOT in this registry,
 *     it MUST be added through the certified domain owner. Do NOT query
 *     another table directly.
 *   - Historical analytics fields (snapshots, journal, events) are NOT
 *     listed here — they are owned by their respective historical services
 *     and may be consumed directly by historical views.
 *   - Household/profile-scoped facts are marked HOUSEHOLD_SCOPE.
 *
 * See: SHARED_SUPABASE_INTELLIGENCE_CONTRACT.md
 */

export type ContractDomain =
  | 'valuation'
  | 'profitability'
  | 'tax'
  | 'operations'
  | 'freedom'
  | 'business_iq'
  | 'assessments'
  | 'document_readiness';

export type SourceType =
  | 'assessment_calculations'
  | 'dashboard_metrics'
  | 'business_assessments'
  | 'extracted_fields'
  | 'business_metric_snapshots'
  | 'value_creation_events'
  | 'derived'
  | 'baseline_resolver';

export type HistoricalOrCurrent = 'current' | 'historical';

export interface ContractFieldSpec {
  field_name: string;
  domain: ContractDomain;
  certified_owner: string;
  source_type: SourceType | SourceType[];
  nullable: boolean;
  business_scoped: boolean;
  historical_or_current: HistoricalOrCurrent;
  verification_requirement: 'none' | 'advisor_review' | 'document_review' | 'verified_event';
  consumer_notes: string;
}

export const CONTRACT_FIELD_REGISTRY: ContractFieldSpec[] = [
  // ── Valuation ──────────────────────────────────────────────────────────
  {
    field_name: 'valuation.current_value',
    domain: 'valuation',
    certified_owner: 'businessIntelligenceContract.ts',
    source_type: 'assessment_calculations',
    nullable: true,
    business_scoped: true,
    historical_or_current: 'current',
    verification_requirement: 'advisor_review',
    consumer_notes: 'Value Gap assessment is the certified owner. Fallback: dashboard_metrics, business_assessments.',
  },
  {
    field_name: 'valuation.potential_value',
    domain: 'valuation',
    certified_owner: 'businessIntelligenceContract.ts',
    source_type: 'assessment_calculations',
    nullable: true,
    business_scoped: true,
    historical_or_current: 'current',
    verification_requirement: 'advisor_review',
    consumer_notes: 'Value Gap assessment is the certified owner. Fallback: dashboard_metrics.',
  },
  {
    field_name: 'valuation.value_gap',
    domain: 'valuation',
    certified_owner: 'businessIntelligenceContract.ts',
    source_type: 'assessment_calculations',
    nullable: true,
    business_scoped: true,
    historical_or_current: 'current',
    verification_requirement: 'advisor_review',
    consumer_notes: 'Certified formula: potential - current when both available. Fallback: dashboard_metrics, derived_formula.',
  },
  {
    field_name: 'valuation.baseline_value',
    domain: 'valuation',
    certified_owner: 'baselineResolver.ts',
    source_type: 'baseline_resolver',
    nullable: true,
    business_scoped: true,
    historical_or_current: 'historical',
    verification_requirement: 'none',
    consumer_notes: 'Immutable first-measured current value. Business-specific. Does NOT move when current_value changes.',
  },
  {
    field_name: 'valuation.verified_value_created',
    domain: 'valuation',
    certified_owner: 'businessIntelligenceContract.ts',
    source_type: 'value_creation_events',
    nullable: true,
    business_scoped: true,
    historical_or_current: 'current',
    verification_requirement: 'verified_event',
    consumer_notes: 'Sum of verified VCEs only (status=verified, confidence_level=verified). null = no verified events (NOT 0).',
  },
  {
    field_name: 'valuation.prior_review_value',
    domain: 'valuation',
    certified_owner: 'businessIntelligenceContract.ts',
    source_type: 'derived',
    nullable: true,
    business_scoped: true,
    historical_or_current: 'historical',
    verification_requirement: 'none',
    consumer_notes: 'Not yet implemented. Always null.',
  },

  // ── Profitability ───────────────────────────────────────────────────────
  {
    field_name: 'profitability.revenue',
    domain: 'profitability',
    certified_owner: 'businessIntelligenceContract.ts',
    source_type: ['extracted_fields', 'dashboard_metrics', 'business_metric_snapshots'],
    nullable: true,
    business_scoped: true,
    historical_or_current: 'current',
    verification_requirement: 'document_review',
    consumer_notes: 'Document-derived (extracted_fields) preferred. Fallback: dashboard_metrics, snapshot.',
  },
  {
    field_name: 'profitability.net_profit',
    domain: 'profitability',
    certified_owner: 'businessIntelligenceContract.ts',
    source_type: ['extracted_fields', 'dashboard_metrics', 'business_metric_snapshots'],
    nullable: true,
    business_scoped: true,
    historical_or_current: 'current',
    verification_requirement: 'document_review',
    consumer_notes: 'Document-derived preferred. Fallback: dashboard_metrics, snapshot.',
  },
  {
    field_name: 'profitability.reported_ebitda',
    domain: 'profitability',
    certified_owner: 'businessIntelligenceContract.ts',
    source_type: ['extracted_fields', 'dashboard_metrics', 'business_metric_snapshots'],
    nullable: true,
    business_scoped: true,
    historical_or_current: 'current',
    verification_requirement: 'document_review',
    consumer_notes: 'Explicit EBITDA from documents preferred. Never substitute operating income when explicit EBITDA exists.',
  },
  {
    field_name: 'profitability.recast_ebitda',
    domain: 'profitability',
    certified_owner: 'businessIntelligenceContract.ts',
    source_type: 'assessment_calculations',
    nullable: true,
    business_scoped: true,
    historical_or_current: 'current',
    verification_requirement: 'advisor_review',
    consumer_notes: 'Recast EBITDA add-backs from assessment_calculations. Fallback: dashboard_metrics.',
  },
  {
    field_name: 'profitability.profit_gap',
    domain: 'profitability',
    certified_owner: 'businessIntelligenceContract.ts',
    source_type: 'assessment_calculations',
    nullable: true,
    business_scoped: true,
    historical_or_current: 'current',
    verification_requirement: 'advisor_review',
    consumer_notes: 'Profit Gap assessment is the certified owner. 0 = measured zero (completed). null = not assessed.',
  },
  {
    field_name: 'profitability.profit_score',
    domain: 'profitability',
    certified_owner: 'businessIntelligenceContract.ts',
    source_type: 'assessment_calculations',
    nullable: true,
    business_scoped: true,
    historical_or_current: 'current',
    verification_requirement: 'advisor_review',
    consumer_notes: 'Profit Gap assessment score.',
  },

  // ── Tax ─────────────────────────────────────────────────────────────────
  {
    field_name: 'tax.annual_tax_gap',
    domain: 'tax',
    certified_owner: 'businessIntelligenceContract.ts',
    source_type: 'assessment_calculations',
    nullable: true,
    business_scoped: true,
    historical_or_current: 'current',
    verification_requirement: 'advisor_review',
    consumer_notes: 'Tax Gap assessment is the certified owner. Fallback: dashboard_metrics, business_assessments.',
  },
  {
    field_name: 'tax.ten_year_tax_gap',
    domain: 'tax',
    certified_owner: 'businessIntelligenceContract.ts',
    source_type: 'derived',
    nullable: true,
    business_scoped: true,
    historical_or_current: 'current',
    verification_requirement: 'none',
    consumer_notes: 'Derived: annual_tax_gap × 10.',
  },

  // ── Operations ──────────────────────────────────────────────────────────
  {
    field_name: 'operations.operations_score',
    domain: 'operations',
    certified_owner: 'businessIntelligenceContract.ts',
    source_type: 'assessment_calculations',
    nullable: true,
    business_scoped: true,
    historical_or_current: 'current',
    verification_requirement: 'advisor_review',
    consumer_notes: 'Operations Gap assessment is the certified owner.',
  },
  {
    field_name: 'operations.monthly_value_of_time_freed',
    domain: 'operations',
    certified_owner: 'businessIntelligenceContract.ts',
    source_type: 'assessment_calculations',
    nullable: true,
    business_scoped: true,
    historical_or_current: 'current',
    verification_requirement: 'advisor_review',
    consumer_notes: 'From Operations Gap assessment.',
  },
  {
    field_name: 'operations.hours_freed_per_week',
    domain: 'operations',
    certified_owner: 'businessIntelligenceContract.ts',
    source_type: 'assessment_calculations',
    nullable: true,
    business_scoped: true,
    historical_or_current: 'current',
    verification_requirement: 'advisor_review',
    consumer_notes: 'From Operations Gap assessment. No hardcoded default.',
  },
  {
    field_name: 'operations.hourly_value_of_time_freed',
    domain: 'operations',
    certified_owner: 'businessIntelligenceContract.ts',
    source_type: 'assessment_calculations',
    nullable: true,
    business_scoped: true,
    historical_or_current: 'current',
    verification_requirement: 'advisor_review',
    consumer_notes: 'From Operations Gap assessment.',
  },

  // ── Freedom ─────────────────────────────────────────────────────────────
  {
    field_name: 'freedom.freedom_score',
    domain: 'freedom',
    certified_owner: 'businessIntelligenceContract.ts',
    source_type: 'assessment_calculations',
    nullable: true,
    business_scoped: true,
    historical_or_current: 'current',
    verification_requirement: 'advisor_review',
    consumer_notes: 'Freedom assessment is the certified owner.',
  },

  // ── Business IQ ─────────────────────────────────────────────────────────
  {
    field_name: 'business_iq',
    domain: 'business_iq',
    certified_owner: 'businessIntelligenceContract.ts',
    source_type: 'derived',
    nullable: true,
    business_scoped: true,
    historical_or_current: 'current',
    verification_requirement: 'none',
    consumer_notes: 'Derived from assessment component scores (profit, operations, freedom, tax). Fallback: dashboard_metrics.ciq_score, snapshot.',
  },
  {
    field_name: 'business_confidence',
    domain: 'business_iq',
    certified_owner: 'businessIntelligenceContract.ts',
    source_type: 'business_metric_snapshots',
    nullable: true,
    business_scoped: true,
    historical_or_current: 'current',
    verification_requirement: 'none',
    consumer_notes: 'Data confidence score from latest snapshot.',
  },

  // ── Assessments (completion state) ─────────────────────────────────────
  {
    field_name: 'assessments.{type}.completed',
    domain: 'assessments',
    certified_owner: 'businessIntelligenceContract.ts',
    source_type: ['assessment_calculations', 'business_assessments'],
    nullable: false,
    business_scoped: true,
    historical_or_current: 'current',
    verification_requirement: 'none',
    consumer_notes: 'Explicit boolean flag. completed=true even when result is 0. Consumers MUST NOT infer from metric value.',
  },
  {
    field_name: 'assessments.{type}.score',
    domain: 'assessments',
    certified_owner: 'businessIntelligenceContract.ts',
    source_type: 'business_assessments',
    nullable: true,
    business_scoped: true,
    historical_or_current: 'current',
    verification_requirement: 'advisor_review',
    consumer_notes: 'Assessment score from business_assessments.',
  },
  {
    field_name: 'assessments.{type}.estimated_opportunity_value',
    domain: 'assessments',
    certified_owner: 'businessIntelligenceContract.ts',
    source_type: 'business_assessments',
    nullable: true,
    business_scoped: true,
    historical_or_current: 'current',
    verification_requirement: 'advisor_review',
    consumer_notes: 'Opportunity value from business_assessments.',
  },
  {
    field_name: 'assessment_completion_count',
    domain: 'assessments',
    certified_owner: 'businessIntelligenceContract.ts',
    source_type: 'derived',
    nullable: false,
    business_scoped: true,
    historical_or_current: 'current',
    verification_requirement: 'none',
    consumer_notes: 'Count of completed assessments (out of 6).',
  },

  // ── Document Readiness ──────────────────────────────────────────────────
  {
    field_name: 'document_readiness.total_documents',
    domain: 'document_readiness',
    certified_owner: 'businessIntelligenceContract.ts',
    source_type: 'extracted_fields',
    nullable: false,
    business_scoped: true,
    historical_or_current: 'current',
    verification_requirement: 'none',
    consumer_notes: 'Count of documents for this business.',
  },
  {
    field_name: 'document_readiness.completed_count',
    domain: 'document_readiness',
    certified_owner: 'businessIntelligenceContract.ts',
    source_type: 'extracted_fields',
    nullable: false,
    business_scoped: true,
    historical_or_current: 'current',
    verification_requirement: 'none',
    consumer_notes: 'Count of completed (processed) documents.',
  },
  {
    field_name: 'document_readiness.years_covered',
    domain: 'document_readiness',
    certified_owner: 'businessIntelligenceContract.ts',
    source_type: 'extracted_fields',
    nullable: false,
    business_scoped: true,
    historical_or_current: 'current',
    verification_requirement: 'none',
    consumer_notes: 'Array of fiscal years covered by documents.',
  },
  {
    field_name: 'document_readiness.financial_data_confidence',
    domain: 'document_readiness',
    certified_owner: 'businessIntelligenceContract.ts',
    source_type: 'business_metric_snapshots',
    nullable: true,
    business_scoped: true,
    historical_or_current: 'current',
    verification_requirement: 'none',
    consumer_notes: 'Data confidence score from latest snapshot.',
  },
];

// ── Household-scope exceptions (NOT business-scoped) ──────────────────────
export const HOUSEHOLD_SCOPE_FIELDS: string[] = [
  // profile_financials fields are intentionally household/profile-scoped
  // and must NOT be treated as business facts without explicit governance.
  // Add entries here if household-scoped facts are introduced.
];

// ── Helper: check if a field is in the registry ───────────────────────────
export function isRegisteredContractField(fieldPath: string): boolean {
  // Handle wildcard patterns like assessments.{type}.completed
  const normalized = fieldPath.replace(/\{[^}]+\}/g, '{type}');
  return CONTRACT_FIELD_REGISTRY.some(
    (f) => f.field_name === fieldPath || f.field_name === normalized
  );
}

// ── Helper: get all business-scoped fields ────────────────────────────────
export function getBusinessScopedFields(): string[] {
  return CONTRACT_FIELD_REGISTRY.filter((f) => f.business_scoped).map((f) => f.field_name);
}