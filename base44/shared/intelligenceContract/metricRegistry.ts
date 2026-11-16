/**
 * Metric Ownership Registry — Shared Supabase Intelligence Contract
 *
 * Documents the CERTIFIED OWNER for every contract metric.
 * No metric may have ambiguous ownership.
 *
 * Authority Hierarchy (Supabase tables):
 *   assessment_calculations  > dashboard_metrics  (for assessment-owned results)
 *   extracted_fields          = raw extraction output
 *   canonical facts           = governed business fact resolution
 *   dashboard_metrics          = derived/cache/read model
 *   business_metric_snapshots  = historical state
 *
 * Snapshots and caches NEVER outrank current certified owners.
 */

export interface MetricOwnership {
  metric: string;
  certifiedOwner: string;
  authoritativeSource: string;
  derivedOwner: string | null;
  contractField: string;
  nullSemantics: string;
}

export const METRIC_REGISTRY: MetricOwnership[] = [
  // ── Valuation ──────────────────────────────────────────────────────────
  {
    metric: 'baseline_value',
    certifiedOwner: 'baselineResolver',
    authoritativeSource: 'assessment_calculations (via assessment_sessions, oldest value_gap)',
    derivedOwner: 'dashboard_metrics.value_gap_details.current_value (secondary)',
    contractField: 'valuation.baseline_value',
    nullSemantics: 'null = no legitimate baseline established yet',
  },
  {
    metric: 'current_value',
    certifiedOwner: 'Value Gap assessment calculation',
    authoritativeSource: 'assessment_calculations.result_json.current_value',
    derivedOwner: 'dashboard_metrics.value_gap_details.current_value',
    contractField: 'valuation.current_value',
    nullSemantics: 'null = no value gap assessment completed',
  },
  {
    metric: 'potential_value',
    certifiedOwner: 'Value Gap assessment calculation',
    authoritativeSource: 'assessment_calculations.result_json.potential_value',
    derivedOwner: 'dashboard_metrics.value_gap_details.potential_value',
    contractField: 'valuation.potential_value',
    nullSemantics: 'null = no potential value calculated',
  },
  {
    metric: 'value_gap',
    certifiedOwner: 'Value Gap assessment calculation',
    authoritativeSource: 'assessment_calculations.result_json.valueGap',
    derivedOwner: 'dashboard_metrics.value_gap_details.gap_amount',
    contractField: 'valuation.value_gap',
    nullSemantics: 'null = no value gap calculated. 0 = measured zero gap',
  },
  {
    metric: 'verified_value_created',
    certifiedOwner: 'Verified historical value-creation contract',
    authoritativeSource: 'value_creation_events WHERE status = verified',
    derivedOwner: null,
    contractField: 'valuation.verified_value_created',
    nullSemantics: 'null = no verified events. 0 = verified zero. NEVER includes identified opportunity or first measurement',
  },
  // ── Profitability ──────────────────────────────────────────────────────
  {
    metric: 'revenue',
    certifiedOwner: 'Canonical Fact resolver (document-derived)',
    authoritativeSource: 'canonical_facts / extracted_fields (accepted)',
    derivedOwner: 'dashboard_metrics.revenue / business_metric_snapshots.annual_revenue',
    contractField: 'profitability.revenue',
    nullSemantics: 'null = no verified revenue data',
  },
  {
    metric: 'net_profit',
    certifiedOwner: 'Canonical Fact resolver (document-derived)',
    authoritativeSource: 'canonical_facts / extracted_fields (accepted)',
    derivedOwner: 'dashboard_metrics.net_profit / business_metric_snapshots.net_profit',
    contractField: 'profitability.net_profit',
    nullSemantics: 'null = no verified net profit data',
  },
  {
    metric: 'reported_ebitda',
    certifiedOwner: 'Canonical Fact resolver (document-derived)',
    authoritativeSource: 'canonical_facts / extracted_fields (accepted)',
    derivedOwner: 'dashboard_metrics.recast_ebitda (legacy alias)',
    contractField: 'profitability.reported_ebitda',
    nullSemantics: 'null = no verified EBITDA data. Distinct from recast_ebitda',
  },
  {
    metric: 'recast_ebitda',
    certifiedOwner: 'Recast EBITDA assessment calculation',
    authoritativeSource: 'assessment_calculations.result_json.total_addbacks',
    derivedOwner: 'dashboard_metrics.recast_ebitda_gap_details.add_backs',
    contractField: 'profitability.recast_ebitda',
    nullSemantics: 'null = no recast assessment completed. Distinct from reported_ebitda',
  },
  {
    metric: 'profit_gap',
    certifiedOwner: 'Profit Gap assessment calculation',
    authoritativeSource: 'assessment_calculations.result_json.gapToBest',
    derivedOwner: 'dashboard_metrics.profit_gap_details.gap_to_best',
    contractField: 'profitability.profit_gap',
    nullSemantics: 'null = no profit gap assessment completed',
  },
  // ── Tax ────────────────────────────────────────────────────────────────
  {
    metric: 'annual_tax_gap',
    certifiedOwner: 'Tax Gap assessment calculation',
    authoritativeSource: 'assessment_calculations.result_json.t3_annual_gap',
    derivedOwner: 'dashboard_metrics.tax_gap_details.annual_overpayment',
    contractField: 'tax.annual_tax_gap',
    nullSemantics: 'null = no tax gap assessment completed',
  },
  {
    metric: 'ten_year_tax_gap',
    certifiedOwner: 'Derived from annual_tax_gap',
    authoritativeSource: 'annual_tax_gap * 10',
    derivedOwner: null,
    contractField: 'tax.ten_year_tax_gap',
    nullSemantics: 'null = no annual tax gap to derive from',
  },
  // ── Operations ────────────────────────────────────────────────────────
  {
    metric: 'operations_score',
    certifiedOwner: 'Operations Gap assessment calculation',
    authoritativeSource: 'assessment_calculations.result_json.operations_score',
    derivedOwner: 'dashboard_metrics.operations_gap_details.score',
    contractField: 'operations.operations_score',
    nullSemantics: 'null = no operations assessment completed. 0 = measured zero',
  },
  {
    metric: 'monthly_value_of_time_freed',
    certifiedOwner: 'Operations Gap assessment calculation',
    authoritativeSource: 'assessment_calculations.result_json.monthly_value_of_time_freed',
    derivedOwner: 'dashboard_metrics.operations_gap_details.monthly_value_of_time_freed',
    contractField: 'operations.monthly_value_of_time_freed',
    nullSemantics: 'null = not calculated. 0 = measured zero',
  },
  // ── Freedom ───────────────────────────────────────────────────────────
  {
    metric: 'freedom_score',
    certifiedOwner: 'Freedom Assessment calculation',
    authoritativeSource: 'assessment_calculations.result_json.freedom_score',
    derivedOwner: 'dashboard_metrics.freedom_score',
    contractField: 'freedom.freedom_score',
    nullSemantics: 'null = no freedom assessment completed',
  },
  // ── Business IQ ───────────────────────────────────────────────────────
  {
    metric: 'business_iq',
    certifiedOwner: 'Derived IQ Score (from assessment components)',
    authoritativeSource: 'assessment_calculations (profit_score, operations_score, freedom_score, tax_score)',
    derivedOwner: 'dashboard_metrics.ciq_score / business_metric_snapshots.overall_impact_score',
    contractField: 'business_iq',
    nullSemantics: 'null = fewer than 2 assessment components available',
  },
];

export const METRIC_OWNERSHIP_MAP: Record<string, MetricOwnership> = METRIC_REGISTRY.reduce(
  (acc, m) => { acc[m.metric] = m; return acc; },
  {} as Record<string, MetricOwnership>
);

export const CONTRACT_VERSION = '2.0.0';