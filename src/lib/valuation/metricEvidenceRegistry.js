/**
 * metricEvidenceRegistry — Phase 13.3G
 *
 * Central mapping of important valuation metrics to their evidence metadata.
 * Used by EvidenceMetric and EvidenceDrawer to provide consistent provenance,
 * source-edit routing, and governance display across all workspaces.
 *
 * Each entry:
 *   field_key              — canonical key (matches intelligence candidates)
 *   display_name           — human-readable label
 *   category               — financial | commercial | operational | methodology |
 *                            conclusion | confidence | scenario | driver | identity
 *   source_type            — document | assessment | advisor_judgment |
 *                            ai_extraction | client_confirmation | benchmark
 *   destination            — where to edit the source input (workspace route hint)
 *   editable               — can an assigned advisor edit this directly?
 *   governance_required   — should a FieldLockBadge appear?
 *   evidence_types         — what evidence supports this value
 *   calculation_type       — derived | direct | approved (for source-edit routing)
 *   explainability_node    — links to ExplainabilityPanel where available
 *   default_owner_role      — who typically owns this field
 *   change_request_allowed — can read-only users request changes?
 *
 * Derived values (calculation_type: 'derived') show "Edit Source Inputs"
 * instead of a direct edit action — they cannot be edited directly.
 */
export const METRIC_REGISTRY = {
  // ── Business Identity ─────────────────────────────────────────────────────
  legal_name: { display_name: 'Legal Name', category: 'identity', source_type: 'document', destination: 'discover', editable: true, governance_required: false, evidence_types: ['formation_docs', 'operating_agreement'], calculation_type: 'direct', default_owner_role: 'advisor', change_request_allowed: true },
  dba: { display_name: 'DBA', category: 'identity', source_type: 'document', destination: 'discover', editable: true, governance_required: false, evidence_types: ['formation_docs'], calculation_type: 'direct', default_owner_role: 'advisor', change_request_allowed: true },
  entity_type: { display_name: 'Entity Type', category: 'identity', source_type: 'document', destination: 'discover', editable: true, governance_required: false, evidence_types: ['formation_docs'], calculation_type: 'direct', default_owner_role: 'advisor', change_request_allowed: true },
  industry: { display_name: 'Industry', category: 'identity', source_type: 'assessment', destination: 'discover', editable: true, governance_required: false, evidence_types: ['assessment', 'benchmark'], calculation_type: 'direct', default_owner_role: 'advisor', change_request_allowed: true },
  naics: { display_name: 'NAICS Code', category: 'identity', source_type: 'benchmark', destination: 'discover', editable: true, governance_required: false, evidence_types: ['benchmark'], calculation_type: 'direct', default_owner_role: 'advisor', change_request_allowed: true },
  years_in_business: { display_name: 'Years in Business', category: 'identity', source_type: 'document', destination: 'discover', editable: true, governance_required: false, evidence_types: ['formation_docs'], calculation_type: 'direct', default_owner_role: 'advisor', change_request_allowed: true },
  ownership: { display_name: 'Ownership Structure', category: 'identity', source_type: 'document', destination: 'discover', editable: true, governance_required: true, evidence_types: ['operating_agreement', 'cap_table'], calculation_type: 'direct', default_owner_role: 'advisor', change_request_allowed: true },

  // ── Financial ──────────────────────────────────────────────────────────────
  revenue: { display_name: 'Revenue', category: 'financial', source_type: 'document', destination: 'discover', editable: true, governance_required: true, evidence_types: ['profit_loss', 'tax_return'], calculation_type: 'direct', default_owner_role: 'advisor', change_request_allowed: true },
  gross_profit: { display_name: 'Gross Profit', category: 'financial', source_type: 'document', destination: 'discover', editable: true, governance_required: true, evidence_types: ['profit_loss'], calculation_type: 'direct', default_owner_role: 'advisor', change_request_allowed: true },
  gross_margin: { display_name: 'Gross Margin', category: 'financial', source_type: 'document', destination: 'discover', editable: false, governance_required: true, evidence_types: ['profit_loss'], calculation_type: 'derived', default_owner_role: 'advisor', change_request_allowed: true },
  net_income: { display_name: 'Net Income', category: 'financial', source_type: 'document', destination: 'discover', editable: true, governance_required: true, evidence_types: ['profit_loss', 'tax_return'], calculation_type: 'direct', default_owner_role: 'advisor', change_request_allowed: true },
  reported_ebitda: { display_name: 'Reported EBITDA', category: 'financial', source_type: 'document', destination: 'discover', editable: true, governance_required: true, evidence_types: ['profit_loss'], calculation_type: 'direct', default_owner_role: 'advisor', change_request_allowed: true },
  normalized_ebitda: { display_name: 'Normalized EBITDA', category: 'financial', source_type: 'advisor_judgment', destination: 'valuation', editable: true, governance_required: true, evidence_types: ['adjustments', 'profit_loss'], calculation_type: 'derived', explainability_node: 'normalized_earnings', default_owner_role: 'advisor', change_request_allowed: true },
  reported_sde: { display_name: 'Reported SDE', category: 'financial', source_type: 'document', destination: 'discover', editable: true, governance_required: true, evidence_types: ['profit_loss', 'tax_return'], calculation_type: 'direct', default_owner_role: 'advisor', change_request_allowed: true },
  normalized_sde: { display_name: 'Normalized SDE', category: 'financial', source_type: 'advisor_judgment', destination: 'valuation', editable: true, governance_required: true, evidence_types: ['adjustments'], calculation_type: 'derived', explainability_node: 'normalized_earnings', default_owner_role: 'advisor', change_request_allowed: true },
  owner_compensation: { display_name: 'Owner Compensation', category: 'financial', source_type: 'document', destination: 'discover', editable: true, governance_required: true, evidence_types: ['payroll_report', 'tax_return'], calculation_type: 'direct', default_owner_role: 'advisor', change_request_allowed: true },
  cash: { display_name: 'Cash', category: 'financial', source_type: 'document', destination: 'discover', editable: true, governance_required: true, evidence_types: ['balance_sheet'], calculation_type: 'direct', default_owner_role: 'advisor', change_request_allowed: true },
  debt: { display_name: 'Debt', category: 'financial', source_type: 'document', destination: 'valuation', editable: true, governance_required: true, evidence_types: ['balance_sheet', 'debt_schedule'], calculation_type: 'direct', default_owner_role: 'advisor', change_request_allowed: true },
  working_capital: { display_name: 'Working Capital', category: 'financial', source_type: 'document', destination: 'valuation', editable: false, governance_required: true, evidence_types: ['balance_sheet'], calculation_type: 'derived', explainability_node: 'equity_bridge', default_owner_role: 'advisor', change_request_allowed: true },
  capex: { display_name: 'CapEx', category: 'financial', source_type: 'document', destination: 'discover', editable: true, governance_required: true, evidence_types: ['profit_loss', 'tax_return'], calculation_type: 'direct', default_owner_role: 'advisor', change_request_allowed: true },

  // ── Commercial ─────────────────────────────────────────────────────────────
  recurring_revenue: { display_name: 'Recurring Revenue', category: 'commercial', source_type: 'assessment', destination: 'discover', editable: true, governance_required: true, evidence_types: ['assessment', 'contracts'], calculation_type: 'direct', default_owner_role: 'advisor', change_request_allowed: true },
  customer_concentration: { display_name: 'Customer Concentration', category: 'commercial', source_type: 'assessment', destination: 'validate', editable: true, governance_required: true, evidence_types: ['assessment', 'contracts'], calculation_type: 'direct', default_owner_role: 'advisor', change_request_allowed: true },
  retention: { display_name: 'Retention Rate', category: 'commercial', source_type: 'assessment', destination: 'discover', editable: true, governance_required: true, evidence_types: ['assessment'], calculation_type: 'direct', default_owner_role: 'advisor', change_request_allowed: true },
  churn: { display_name: 'Churn Rate', category: 'commercial', source_type: 'assessment', destination: 'discover', editable: true, governance_required: true, evidence_types: ['assessment'], calculation_type: 'direct', default_owner_role: 'advisor', change_request_allowed: true },
  backlog: { display_name: 'Backlog', category: 'commercial', source_type: 'document', destination: 'discover', editable: true, governance_required: true, evidence_types: ['contracts', 'pipeline'], calculation_type: 'direct', default_owner_role: 'advisor', change_request_allowed: true },
  pricing_power: { display_name: 'Pricing Power', category: 'commercial', source_type: 'assessment', destination: 'discover', editable: true, governance_required: true, evidence_types: ['assessment'], calculation_type: 'direct', default_owner_role: 'advisor', change_request_allowed: true },

  // ── Operational ────────────────────────────────────────────────────────────
  headcount: { display_name: 'Headcount', category: 'operational', source_type: 'document', destination: 'discover', editable: true, governance_required: false, evidence_types: ['payroll_report'], calculation_type: 'direct', default_owner_role: 'advisor', change_request_allowed: true },
  owner_dependency: { display_name: 'Owner Dependency', category: 'operational', source_type: 'assessment', destination: 'discover', editable: true, governance_required: true, evidence_types: ['assessment'], calculation_type: 'direct', default_owner_role: 'advisor', change_request_allowed: true },
  management_depth: { display_name: 'Management Depth', category: 'operational', source_type: 'assessment', destination: 'discover', editable: true, governance_required: true, evidence_types: ['assessment'], calculation_type: 'direct', default_owner_role: 'advisor', change_request_allowed: true },
  sop_coverage: { display_name: 'SOP Coverage', category: 'operational', source_type: 'assessment', destination: 'discover', editable: true, governance_required: false, evidence_types: ['assessment'], calculation_type: 'direct', default_owner_role: 'advisor', change_request_allowed: true },
  kpi_maturity: { display_name: 'KPI Maturity', category: 'operational', source_type: 'assessment', destination: 'discover', editable: true, governance_required: false, evidence_types: ['assessment'], calculation_type: 'direct', default_owner_role: 'advisor', change_request_allowed: true },
  forecast_reliability: { display_name: 'Forecast Reliability', category: 'operational', source_type: 'assessment', destination: 'discover', editable: true, governance_required: false, evidence_types: ['assessment', 'historical_financials'], calculation_type: 'direct', default_owner_role: 'advisor', change_request_allowed: true },

  // ── Valuation ──────────────────────────────────────────────────────────────
  maintainable_earnings: { display_name: 'Maintainable Earnings', category: 'methodology', source_type: 'advisor_judgment', destination: 'valuation', editable: true, governance_required: true, evidence_types: ['normalized_earnings', 'adjustments'], calculation_type: 'derived', explainability_node: 'normalized_earnings', default_owner_role: 'advisor', change_request_allowed: true },
  selected_multiple: { display_name: 'Selected Multiple', category: 'methodology', source_type: 'benchmark', destination: 'valuation', editable: true, governance_required: true, evidence_types: ['benchmark', 'comps'], calculation_type: 'direct', explainability_node: 'multiple_analysis', default_owner_role: 'advisor', change_request_allowed: true },
  enterprise_value: { display_name: 'Enterprise Value', category: 'conclusion', source_type: 'advisor_judgment', destination: 'valuation', editable: false, governance_required: true, evidence_types: ['reconciliation', 'methods'], calculation_type: 'derived', explainability_node: 'reconciliation', default_owner_role: 'lead_advisor', change_request_allowed: true },
  defensible_value: { display_name: 'Defensible Value', category: 'conclusion', source_type: 'advisor_judgment', destination: 'valuation', editable: false, governance_required: true, evidence_types: ['conclusion'], calculation_type: 'approved', default_owner_role: 'lead_advisor', change_request_allowed: true },
  potential_value: { display_name: 'Potential Value', category: 'conclusion', source_type: 'advisor_judgment', destination: 'valuation', editable: false, governance_required: true, evidence_types: ['scenario'], calculation_type: 'derived', default_owner_role: 'lead_advisor', change_request_allowed: true },
  equity_value: { display_name: 'Equity Value', category: 'conclusion', source_type: 'advisor_judgment', destination: 'valuation', editable: false, governance_required: true, evidence_types: ['equity_bridge'], calculation_type: 'derived', explainability_node: 'equity_bridge', default_owner_role: 'lead_advisor', change_request_allowed: true },
  confidence: { display_name: 'Confidence', category: 'confidence', source_type: 'advisor_judgment', destination: 'valuation', editable: true, governance_required: true, evidence_types: ['confidence_scoring'], calculation_type: 'derived', explainability_node: 'confidence', default_owner_role: 'advisor', change_request_allowed: true },
  overall_confidence: { display_name: 'Overall Confidence', category: 'confidence', source_type: 'advisor_judgment', destination: 'valuation', editable: false, governance_required: true, evidence_types: ['confidence_scoring'], calculation_type: 'derived', explainability_node: 'confidence', default_owner_role: 'lead_advisor', change_request_allowed: true },
  method_weights: { display_name: 'Method Weights', category: 'methodology', source_type: 'advisor_judgment', destination: 'valuation', editable: true, governance_required: true, evidence_types: ['reconciliation'], calculation_type: 'direct', explainability_node: 'reconciliation', default_owner_role: 'advisor', change_request_allowed: true },
  advisor_conclusion: { display_name: 'Advisor Conclusion', category: 'conclusion', source_type: 'advisor_judgment', destination: 'valuation', editable: true, governance_required: true, evidence_types: ['conclusion'], calculation_type: 'approved', default_owner_role: 'lead_advisor', change_request_allowed: false },

  // ── Build Value Dimensions ──────────────────────────────────────────────────
  financial_quality: { display_name: 'Financial Quality', category: 'driver', source_type: 'advisor_judgment', destination: 'build_value', editable: false, governance_required: false, evidence_types: ['assessment', 'financials'], calculation_type: 'derived', default_owner_role: 'advisor', change_request_allowed: true },
  growth_quality: { display_name: 'Growth Quality', category: 'driver', source_type: 'advisor_judgment', destination: 'build_value', editable: false, governance_required: false, evidence_types: ['assessment'], calculation_type: 'derived', default_owner_role: 'advisor', change_request_allowed: true },
  commercial_quality: { display_name: 'Commercial Quality', category: 'driver', source_type: 'advisor_judgment', destination: 'build_value', editable: false, governance_required: false, evidence_types: ['assessment'], calculation_type: 'derived', default_owner_role: 'advisor', change_request_allowed: true },
  operational_quality: { display_name: 'Operational Quality', category: 'driver', source_type: 'advisor_judgment', destination: 'build_value', editable: false, governance_required: false, evidence_types: ['assessment'], calculation_type: 'derived', default_owner_role: 'advisor', change_request_allowed: true },
  leadership_transferability: { display_name: 'Leadership & Transferability', category: 'driver', source_type: 'advisor_judgment', destination: 'build_value', editable: false, governance_required: false, evidence_types: ['assessment'], calculation_type: 'derived', default_owner_role: 'advisor', change_request_allowed: true },
  risk_governance: { display_name: 'Risk & Governance', category: 'driver', source_type: 'advisor_judgment', destination: 'build_value', editable: false, governance_required: false, evidence_types: ['assessment'], calculation_type: 'derived', default_owner_role: 'advisor', change_request_allowed: true },
};

/**
 * Look up a metric by field_key. Returns a normalized entry with defaults
 * so callers never receive undefined for required properties.
 */
export function getMetricDefinition(fieldKey) {
  const entry = METRIC_REGISTRY[fieldKey];
  if (!entry) {
    return {
      display_name: fieldKey,
      category: 'financial',
      source_type: 'advisor_judgment',
      destination: null,
      editable: false,
      governance_required: false,
      evidence_types: [],
      calculation_type: 'direct',
      default_owner_role: 'advisor',
      change_request_allowed: true,
    };
  }
  return entry;
}

/**
 * Returns true if a metric is derived (cannot be edited directly).
 * Derived metrics show "Edit Source Inputs" instead of an edit action.
 */
export function isDerivedMetric(fieldKey) {
  const def = getMetricDefinition(fieldKey);
  return def.calculation_type === 'derived' || def.calculation_type === 'approved';
}

/**
 * Returns the destination workspace for source-edit routing.
 */
export function getSourceEditDestination(fieldKey) {
  return getMetricDefinition(fieldKey).destination;
}