/**
 * canonicalFact/registry.ts — Phase 14.2A
 *
 * The Canonical Fact Registry — the single semantic authority for business
 * facts. Each fact declares its identity,
 * source candidates, source priority rules, verification requirements,
 * conflict tolerance, reporting periods, lineage requirements, and
 * registered consumers.
 *
 * This registry is DECLARATIVE — it contains no resolution logic. The
 * resolver (resolver.ts) reads this registry and applies the rules.
 *
 * Reuses:
 *   - intelligenceMapping.FIELD_REGISTRY (existing 30+ field definitions)
 *   - intelligenceMapping.SourceType (16 source types)
 *
 * The first 10 facts (PILOT_FACTS) are the controlled pilot. The remaining
 * 40 are registered but resolved only after pilot certification.
 */

import type { SourceType } from '../valuationEngine/intelligenceMapping.ts';
import type { SourceAuthority, ValueType, ReportingPeriodType } from './types.ts';

// ── Fact Category ───────────────────────────────────────────────────────────
export type FactCategory =
  | 'financial'
  | 'valuation'
  | 'business_quality'
  | 'business_profile'
  | 'intelligence_assessment'
  | 'growth_execution'
  | 'document_verification';

// ── Candidate Source Declaration ───────────────────────────────────────────
export interface CandidateSource {
  source_type: SourceType;
  source_authority: SourceAuthority;
  /**
   * 6D.1A — WHAT THIS CANDIDATE MAY BECOME, independent of what it may be READ as.
   *
   *   'business'      (default) a candidate for a business fact
   *   'personal_only' it is the owner's own figure — readable as their evidence,
   *                   never a business fact. Personal tax figures live here.
   *   'evidence_only' a real, useful concept that is deliberately NOT a business
   *                   fact (an association name; a tax measure that is not an
   *                   accounting result). Retained for intelligence, never promoted.
   *
   * The declaration lives WITH the candidate so the registry itself states what
   * promotion may do, instead of a promotion engine deciding it by convention.
   */
  evidence_scope?: 'business' | 'personal_only' | 'evidence_only';
  field_names?: string[];          // extracted_field names or answer keys
  doc_types?: string[];            // document types to filter
  assessment_type?: string;        // for assessment resolvers
  valuation_question_key?: string; // for valuation answer resolvers
  valuation_financial_field?: string; // for valuation financial resolvers
  dashboard_metric_key?: string;   // for dashboard metric resolvers
  profile_financial_key?: string;  // for profile financial resolvers
  business_field?: string;        // for business entity resolvers
  derive_fn?: string;             // name of derived function (lookup in resolver)
}

// ── Fact Definition ─────────────────────────────────────────────────────────
export interface FactDefinition {
  fact_key: string;
  category: FactCategory;
  display_name: string;
  description: string;
  business_meaning: string;
  value_type: ValueType;
  unit?: string;

  // ── Source candidates in priority order (highest authority first) ──
  candidate_sources: CandidateSource[];

  // ── Verification ──
  required_verification_level: 'verified' | 'suggested' | 'needs_review' | 'any';
  allow_fallback: boolean;

  // ── Conflict ──
  conflict_materiality_threshold: number;  // e.g. 0.05 = 5%
  conflict_tolerance: 'strict' | 'standard' | 'lenient';

  // ── Reporting Periods ──
  applicable_periods: ReportingPeriodType[];
  default_period: ReportingPeriodType;

  // ── Lineage ──
  lineage_requirements: string[];   // fact_keys this fact derives from
  is_derived: boolean;

  // ── Consumers ──
  registered_consumers: string[];

  // ── Pilot flag ──
  is_pilot: boolean;
}

// ── Helper: standard financial fact ─────────────────────────────────────────
function financialFact(
  fact_key: string,
  display_name: string,
  description: string,
  business_meaning: string,
  candidate_sources: CandidateSource[],
  opts: Partial<FactDefinition> = {},
): FactDefinition {
  return {
    fact_key,
    category: 'financial',
    display_name,
    description,
    business_meaning,
    value_type: 'currency',
    unit: 'USD',
    candidate_sources,
    required_verification_level: 'needs_review',
    allow_fallback: true,
    conflict_materiality_threshold: 0.05,
    conflict_tolerance: 'standard',
    applicable_periods: ['fiscal_year', 'ttm', 'calendar_year'],
    default_period: 'fiscal_year',
    lineage_requirements: [],
    is_derived: false,
    registered_consumers: ['dashboard', 'valuation', 'bis', 'assessments'],
    is_pilot: false,
    ...opts,
  };
}

// ============================================================================
// THE CANONICAL FACTS — 47 declared
//   23 literal financial facts + 10 literal business-profile/document facts
//   + 6 generated business-quality dimensions + 8 generated intelligence facts
// The first 10 entries are PILOT facts (is_pilot: true) — the set served today
// by canonicalFactService and consumerAdapter; the other 37 are declared but not
// yet served. The CBIL blueprint designed an inventory of 50 concepts; three of
// them are not declared under any name (valuation_version, sprint_tasks,
// conflict_status) and two are present under other keys (revenue_growth_rate →
// historical_growth_rate, field_confidence → confidence_score). See
// src/PHASE_6C_DIGITAL_TWIN_FACTS_ARCHITECTURE.md §5.1.
// ============================================================================

export const FACT_REGISTRY: FactDefinition[] = [

  // ── PILOT FACT 1: Revenue ─────────────────────────────────────────────────
  financialFact(
    'revenue',
    'Revenue',
    'Total annual top-line revenue',
    'Primary input to margin calculation, valuation multiple, and benchmark comparison',
    [
      { source_type: 'extracted_field', source_authority: 'verified_tax_return', field_names: ['gross_receipts'], doc_types: ['business_tax_return'] },
      { source_type: 'extracted_field', source_authority: 'uploaded_financials', field_names: ['annual_revenue', 'total_revenue', 'gross_revenue'], doc_types: ['profit_and_loss'] },
      { source_type: 'financial_normalization', source_authority: 'reviewed_financials', valuation_financial_field: 'revenue' },
      { source_type: 'advisor_entry', source_authority: 'advisor_entry_verified', valuation_question_key: 'ttm_revenue' },
      { source_type: 'dashboard_metric', source_authority: 'system_derived', dashboard_metric_key: 'annual_revenue' },
      { source_type: 'profile_record', source_authority: 'owner_estimate', profile_financial_key: 'annual_revenue' },
      { source_type: 'assessment_answer', source_authority: 'assessment_answer', assessment_type: 'profit_gap', field_names: ['p1_rev', 'revenue'] },
    ],
    {
      conflict_materiality_threshold: 0.05,
      registered_consumers: ['dashboard', 'profit_gap_assessment', 'value_gap_assessment', 'bis', 'valuation', 'profile_financials', 'dashboard_metrics'],
      is_pilot: true,
    },
  ),

  // ── PILOT FACT 2: Gross Profit ────────────────────────────────────────────
  financialFact(
    'gross_profit',
    'Gross Profit',
    'Revenue minus cost of goods sold',
    'Enables gross margin analysis and profitability benchmarking',
    [
      { source_type: 'extracted_field', source_authority: 'uploaded_financials', field_names: ['gross_profit', 'gross_income'], doc_types: ['profit_and_loss'] },
      { source_type: 'financial_normalization', source_authority: 'reviewed_financials', valuation_financial_field: 'gross_profit' },
    ],
    {
      registered_consumers: ['dashboard', 'profit_gap_assessment', 'valuation'],
      is_pilot: true,
    },
  ),

  // ── PILOT FACT 3: Gross Margin ────────────────────────────────────────────
  financialFact(
    'gross_margin',
    'Gross Margin %',
    'Gross profit divided by revenue',
    'Profitability benchmark vs industry',
    [
      { source_type: 'system_derived', source_authority: 'system_derived', derive_fn: 'gross_margin_from_profit_and_revenue' },
      // 6D.1A GATE 6C — the Profit Gap assessment's margin answer is NOT a gross
      // margin and no longer supplies one. `p1_mymargin` / `net_profit_margin` are
      // documented elsewhere in the platform as a NET profit margin (see
      // src/lib/profitSemantics.js and AssessmentContext.jsx), so admitting them
      // here manufactured a gross margin that was never measured. Gross margin is
      // DERIVED from revenue and gross profit only — the lineage declared below.
    ],
    {
      value_type: 'percentage',
      unit: '%',
      is_derived: true,
      lineage_requirements: ['revenue', 'gross_profit'],
      registered_consumers: ['dashboard', 'profit_gap_assessment', 'valuation'],
      is_pilot: true,
    },
  ),

  // ── PILOT FACT 4: Net Income ──────────────────────────────────────────────
  financialFact(
    'net_income',
    'Net Income',
    'Bottom-line net profit after all expenses',
    'Used in capitalization of earnings and as EBITDA base',
    [
      // 6D.1A GATE 6A — TAXABLE INCOME IS NOT NET INCOME and no longer supplies it.
      // A return's taxable income is a TAX result after tax-specific adjustments; net
      // income is an ACCOUNTING result. They are distinct concepts, and the document
      // policy already treats taxable income as its own thing (fieldDisposition). The
      // figure is retained as evidence — it is simply no longer silently relabelled.
      { source_type: 'extracted_field', source_authority: 'verified_tax_return', field_names: ['ordinary_business_income'], doc_types: ['business_tax_return'] },
      { source_type: 'extracted_field', source_authority: 'uploaded_financials', field_names: ['net_profit', 'net_income', 'profit'], doc_types: ['profit_and_loss'] },
      { source_type: 'financial_normalization', source_authority: 'reviewed_financials', valuation_financial_field: 'net_income' },
      { source_type: 'dashboard_metric', source_authority: 'system_derived', dashboard_metric_key: 'net_profit' },
      { source_type: 'profile_record', source_authority: 'owner_estimate', profile_financial_key: 'net_profit' },
    ],
    {
      registered_consumers: ['dashboard', 'profit_gap_assessment', 'value_gap_assessment', 'bis', 'valuation', 'profile_financials', 'dashboard_metrics'],
      is_pilot: true,
    },
  ),

  // ── 6D.1A GATE 6A — TAXABLE INCOME, WITH ITS OWN HOME ─────────────────────
  // The correction above removed taxable income as a SOURCE of net income, because a
  // return's taxable income is a tax result and net income is an accounting result.
  // Removing a source must never DELETE a concept: the figure is real, the document
  // policy already dispositions it (CANONICAL_FACT on a business return; EVIDENCE_ONLY
  // — the owner's own — on a personal return), and the ontology already declares a
  // `taxable_income` concept. Declared here as its OWN fact so it stays reachable and
  // answerable AS a tax result, and can never be relabelled as net income.
  financialFact(
    'taxable_income',
    'Taxable Income',
    'Taxable income as reported on a return — a tax result after tax-specific adjustments',
    'Historical tax question input — never an accounting result, never a substitute for net income',
    [
      // EVIDENCE_ONLY, said out loud: the document policy already dispositions this
      // field that way, so the concept is READABLE and ANSWERABLE while never being
      // promoted as a business fact. Declaring it here is what makes the registry
      // agree with the policy instead of leaving the concept with no home at all.
      { source_type: 'extracted_field', source_authority: 'verified_tax_return', field_names: ['taxable_income'], doc_types: ['business_tax_return'], evidence_scope: 'evidence_only' },
    ],
    { registered_consumers: ['galileo', 'tax_gap_assessment', 'bis'] },
  ),

  // ── 6D.1A GATE 6B — OPERATING INCOME (EBIT), WITH ITS OWN HOME ────────────
  // Same repair, same reasoning: `operating_income` no longer supplies reported EBITDA
  // (EBITDA adds back depreciation and amortization; EBIT does not), but EBIT is a real
  // reported measure that must stay reachable under its OWN name. The document policy
  // keeps it EVIDENCE_ONLY, so it is readable and answerable without ever being
  // promoted as an accounting result it is not.
  financialFact(
    'ebit',
    'Operating Income (EBIT)',
    'Operating income as reported — earnings before interest and taxes',
    'Distinct from EBITDA: EBIT does NOT add back depreciation and amortization',
    [
      // EVIDENCE_ONLY, and for the same reason: EBIT is a real reported measure that
      // the document policy deliberately keeps out of canonical promotion. It is a
      // concept with a home, not a candidate for a business fact.
      { source_type: 'extracted_field', source_authority: 'uploaded_financials', field_names: ['operating_income'], doc_types: ['profit_and_loss'], evidence_scope: 'evidence_only' },
    ],
    { registered_consumers: ['galileo', 'valuation'] },
  ),

  // ── PILOT FACT 5: Reported EBITDA ─────────────────────────────────────────
  financialFact(
    'reported_ebitda',
    'Reported EBITDA',
    'EBITDA as reported or extracted (pre-normalization)',
    'Base earnings before recast adjustments',
    [
      // 6D.1A GATE 6B — EBIT IS NOT EBITDA. Operating income no longer supplies
      // reported EBITDA. EBITDA adds back depreciation and amortization; folding EBIT
      // into it either substituted a smaller measure silently or manufactured a
      // material "conflict" between two genuinely different things. `operating_income`
      // remains extracted, dispositioned and available as evidence.
      { source_type: 'extracted_field', source_authority: 'uploaded_financials', field_names: ['ebitda'] },
      { source_type: 'financial_normalization', source_authority: 'reviewed_financials', valuation_financial_field: 'ebitda' },
      { source_type: 'dashboard_metric', source_authority: 'system_derived', dashboard_metric_key: 'current_ebitda' },
      { source_type: 'assessment_calculation', source_authority: 'assessment_answer', assessment_type: 'value_gap', field_names: ['v2_ebitda', 'ebitda'] },
    ],
    {
      conflict_materiality_threshold: 0.05,
      registered_consumers: ['dashboard', 'value_gap_assessment', 'recast_ebitda_assessment', 'bis', 'valuation', 'dashboard_metrics'],
      is_pilot: true,
    },
  ),

  // ── PILOT FACT 6: Normalized EBITDA ────────────────────────────────────────
  financialFact(
    'normalized_ebitda',
    'Normalized EBITDA',
    'EBITDA after recast adjustments and add-backs',
    'Primary driver of enterprise value under the EBITDA multiple method',
    [
      { source_type: 'financial_normalization', source_authority: 'reviewed_financials', valuation_financial_field: 'normalized_ebitda' },
      { source_type: 'dashboard_metric', source_authority: 'system_derived', dashboard_metric_key: 'recast_ebitda' },
      { source_type: 'assessment_calculation', source_authority: 'assessment_answer', assessment_type: 'recast_ebitda', field_names: ['rc_ebitda', 'ebitda'] },
      { source_type: 'system_derived', source_authority: 'system_derived', derive_fn: 'normalized_ebitda_from_net_income_and_addbacks' },
    ],
    {
      is_derived: true,
      lineage_requirements: ['net_income', 'owner_compensation', 'add_backs'],
      required_verification_level: 'verified',
      registered_consumers: ['valuation', 'bis', 'dashboard', 'reports', 'growth_plan'],
      is_pilot: true,
    },
  ),

  // ── PILOT FACT 7: Owner Compensation ───────────────────────────────────────
  financialFact(
    'owner_compensation',
    'Owner Compensation',
    'Total owner compensation including salary and distributions',
    'Core recast adjustment to normalized earnings',
    [
      { source_type: 'extracted_field', source_authority: 'verified_tax_return', field_names: ['officer_compensation'], doc_types: ['business_tax_return'] },
      { source_type: 'extracted_field', source_authority: 'uploaded_financials', field_names: ['owner_compensation', 'owner_payroll'], doc_types: ['profit_and_loss', 'payroll_report'] },
      { source_type: 'financial_normalization', source_authority: 'reviewed_financials', valuation_financial_field: 'owner_compensation' },
      { source_type: 'advisor_entry', source_authority: 'advisor_entry_verified', valuation_question_key: 'owner_compensation_actual' },
      { source_type: 'assessment_answer', source_authority: 'assessment_answer', assessment_type: 'recast_ebitda', field_names: ['owner_comp', 'owner_compensation'] },
    ],
    {
      conflict_materiality_threshold: 0.1,
      registered_consumers: ['recast_ebitda_assessment', 'bis', 'valuation', 'profile_financials'],
      is_pilot: true,
    },
  ),

  // ── PILOT FACT 8: Cash ────────────────────────────────────────────────────
  financialFact(
    'cash',
    'Cash',
    'Cash on hand from balance sheet',
    'Equity bridge component',
    [
      { source_type: 'extracted_field', source_authority: 'uploaded_financials', field_names: ['cash_on_hand', 'cash'], doc_types: ['balance_sheet'] },
      { source_type: 'financial_normalization', source_authority: 'reviewed_financials', valuation_financial_field: 'cash' },
    ],
    {
      // Phase 14.3D: Added dashboard and galileo to match subscription registry
      // (both consumers subscribe to cash via CONSUMER_SUBSCRIPTIONS)
      registered_consumers: ['dashboard', 'galileo', 'valuation', 'bis'],
      is_pilot: true,
    },
  ),

  // ── PILOT FACT 9: Debt ────────────────────────────────────────────────────
  financialFact(
    'debt',
    'Total Debt',
    'Total outstanding debt from balance sheet or debt schedule',
    'Equity bridge component — subtracted from enterprise value',
    [
      { source_type: 'extracted_field', source_authority: 'uploaded_financials', field_names: ['total_debt', 'loan_balance'], doc_types: ['balance_sheet', 'debt_schedule'] },
      { source_type: 'financial_normalization', source_authority: 'reviewed_financials', valuation_financial_field: 'total_debt' },
    ],
    {
      conflict_materiality_threshold: 0.05,
      // Phase 14.3C: Added dashboard and galileo to match subscription registry
      // (both consumers subscribe to debt via CONSUMER_SUBSCRIPTIONS)
      registered_consumers: ['dashboard', 'galileo', 'valuation', 'bis', 'equity_bridge'],
      is_pilot: true,
    },
  ),

  // ── PILOT FACT 10: Customer Concentration ─────────────────────────────────
  {
    fact_key: 'customer_concentration',
    category: 'business_profile',
    display_name: 'Customer Concentration',
    description: 'Percentage of revenue from top customer or top N customers',
    business_meaning: 'Risk indicator — high concentration reduces transferability and valuation',
    value_type: 'percentage',
    unit: '%',
    candidate_sources: [
      { source_type: 'advisor_entry', source_authority: 'advisor_entry_verified', valuation_question_key: 'customer_concentration' },
      { source_type: 'assessment_answer', source_authority: 'assessment_answer', assessment_type: 'operations_gap', field_names: ['customer_concentration', 'top_customer_pct'] },
    ],
    required_verification_level: 'needs_review',
    allow_fallback: false,
    conflict_materiality_threshold: 0.1,
    conflict_tolerance: 'standard',
    applicable_periods: ['point_in_time'],
    default_period: 'point_in_time',
    lineage_requirements: [],
    is_derived: false,
    registered_consumers: ['build_value', 'valuation', 'bis'],
    is_pilot: true,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // REMAINING 40 FACTS (registered, resolved after pilot certification)
  // ══════════════════════════════════════════════════════════════════════════

  // ── Financial (continued) ─────────────────────────────────────────────────
  financialFact('total_assets', 'Total Assets', 'Total assets from balance sheet', 'Valuation input', [
    { source_type: 'extracted_field', source_authority: 'uploaded_financials', field_names: ['total_assets'], doc_types: ['balance_sheet'] },
    { source_type: 'financial_normalization', source_authority: 'reviewed_financials', valuation_financial_field: 'total_assets' },
  ], { registered_consumers: ['valuation', 'bis'] }),

  financialFact('total_liabilities', 'Total Liabilities', 'Total liabilities from balance sheet', 'Valuation input', [
    { source_type: 'extracted_field', source_authority: 'uploaded_financials', field_names: ['total_liabilities'], doc_types: ['balance_sheet'] },
    { source_type: 'financial_normalization', source_authority: 'reviewed_financials', valuation_financial_field: 'total_liabilities' },
  ], { registered_consumers: ['valuation', 'bis'] }),

  financialFact('total_equity', 'Total Equity', 'Total equity from balance sheet', 'Valuation input', [
    { source_type: 'extracted_field', source_authority: 'uploaded_financials', field_names: ['total_equity'], doc_types: ['balance_sheet'] },
  ], { registered_consumers: ['valuation', 'bis'] }),

  financialFact('agi', 'Adjusted Gross Income', 'AGI from personal tax return', 'Tax Gap assessment input', [
    { source_type: 'extracted_field', source_authority: 'verified_tax_return', field_names: ['adjusted_gross_income'], doc_types: ['personal_tax_return'] },
    { source_type: 'profile_record', source_authority: 'owner_estimate', profile_financial_key: 'adjusted_gross_income' },
    { source_type: 'assessment_answer', source_authority: 'assessment_answer', assessment_type: 'tax_gap', field_names: ['t3_agi'] },
  ], { registered_consumers: ['tax_gap_assessment', 'bis', 'profile_financials'] }),

  // 6D.0c.1-P §P8/§P9 — HISTORICAL TAX. Declared so a HISTORICAL tax question has a
  // canonical meaning at all: without it, "how much did I pay in tax 2024" matched
  // no concept, the evidence lane never ran, and a PROJECTED tax-strategy impact was
  // left standing as the answer. The definition is deliberately narrow — the tax
  // REPORTED on a return or statement, which is a liability and not cash paid — and
  // an answer using it must say which of those it is.
  financialFact('total_tax', 'Total Tax Reported', 'Income tax reported on a return or statement for the period (a liability, not cash payments)', 'Historical tax question input — never a projected saving', [
    // 6D.1A GATE 6D — RECONCILED WITH THE DOCUMENT POLICY. A personal return's total
    // tax is the OWNER's liability, and the evidence policy already classifies it
    // PERSONAL_ONLY (fieldDisposition: personal_irs total_tax → not business-relevant).
    // Declaring it `personal_only` here makes the registry AGREE with that policy
    // instead of contradicting it, so a historical tax question is still answered from
    // the owner's own return while the figure can never become a BUSINESS fact merely
    // because a business was active. Retained as evidence; not deleted.
    { source_type: 'extracted_field', source_authority: 'verified_tax_return', field_names: ['total_tax'], doc_types: ['personal_tax_return'], evidence_scope: 'personal_only' },
    // A company's own tax expense IS the business's figure, and stays promotable.
    { source_type: 'extracted_field', source_authority: 'uploaded_financials', field_names: ['taxes'], doc_types: ['profit_and_loss'] },
  ], { registered_consumers: ['galileo', 'tax_gap_assessment', 'bis'] }),

  financialFact('monthly_take_home', 'Monthly Take-Home', 'Owner monthly take-home pay', 'Freedom assessment input', [
    { source_type: 'system_derived', source_authority: 'system_derived', derive_fn: 'monthly_take_home_from_net_income' },
    { source_type: 'assessment_answer', source_authority: 'assessment_answer', assessment_type: 'operations_gap', field_names: ['o4_takehome'] },
    { source_type: 'profile_record', source_authority: 'owner_estimate', profile_financial_key: 'monthly_take_home' },
  ], { is_derived: true, lineage_requirements: ['net_income'], registered_consumers: ['operations_gap_assessment', 'freedom_assessment', 'bis', 'dashboard_metrics'] }),

  financialFact('employee_count', 'Employee Count', 'Total number of employees', 'Operations assessment input', [
    { source_type: 'extracted_field', source_authority: 'uploaded_financials', field_names: ['employee_count'], doc_types: ['payroll_report'] },
    { source_type: 'assessment_answer', source_authority: 'assessment_answer', assessment_type: 'operations_gap', field_names: ['employee_count'] },
  ], { value_type: 'number', registered_consumers: ['operations_gap_assessment', 'bis', 'valuation'] }),

  financialFact('total_payroll', 'Total Payroll', 'Total annual payroll', 'Recast EBITDA input', [
    { source_type: 'extracted_field', source_authority: 'uploaded_financials', field_names: ['total_payroll'], doc_types: ['payroll_report'] },
    { source_type: 'financial_normalization', source_authority: 'reviewed_financials', valuation_financial_field: 'total_payroll' },
  ], { registered_consumers: ['recast_ebitda_assessment', 'bis', 'valuation'] }),

  financialFact('add_backs', 'Add-backs', 'Total approved add-backs for recast EBITDA', 'Normalized EBITDA component', [
    { source_type: 'advisor_entry', source_authority: 'advisor_entry_verified', valuation_financial_field: 'total_add_backs' },
  ], { is_derived: true, lineage_requirements: ['normalized_ebitda'], required_verification_level: 'verified', registered_consumers: ['valuation', 'recast_ebitda_assessment', 'bis'] }),

  financialFact('historical_growth_rate', 'Revenue Growth Rate', 'Historical revenue growth rate', 'DCF and multiple selection input', [
    { source_type: 'assessment_calculation', source_authority: 'assessment_answer', assessment_type: 'profit_gap', field_names: ['growth_rate', 'cagr'] },
  ], { value_type: 'percentage', registered_consumers: ['valuation', 'bis'] }),

  financialFact('annual_capex', 'Annual CapEx', 'Annual capital expenditures', 'DCF input', [
    { source_type: 'advisor_entry', source_authority: 'advisor_entry_verified', valuation_question_key: 'annual_capex' },
  ], { registered_consumers: ['valuation'] }),

  // ── Valuation ──────────────────────────────────────────────────────────────
  financialFact('enterprise_value', 'Enterprise Value', 'Reconciled enterprise value', 'Primary valuation output', [
    { source_type: 'system_derived', source_authority: 'system_derived', derive_fn: 'enterprise_value_from_reconciliation' },
  ], { is_derived: true, lineage_requirements: ['normalized_ebitda', 'valuation_multiple'], required_verification_level: 'verified', registered_consumers: ['dashboard', 'bis', 'reports', 'growth_plan', 'executive_brief'] }),

  financialFact('equity_value', 'Equity Value', 'Equity value after equity bridge', 'Valuation output', [
    { source_type: 'system_derived', source_authority: 'system_derived', derive_fn: 'equity_value_from_ev_and_bridge' },
  ], { is_derived: true, lineage_requirements: ['enterprise_value', 'cash', 'debt'], required_verification_level: 'verified', registered_consumers: ['dashboard', 'bis', 'reports'] }),

  financialFact('valuation_multiple', 'Valuation Multiple', 'Approved valuation multiple', 'EV calculation input', [
    { source_type: 'advisor_entry', source_authority: 'advisor_entry_verified', valuation_question_key: 'valuation_multiple' },
    { source_type: 'benchmark', source_authority: 'benchmark' },
  ], { value_type: 'number', unit: 'x', registered_consumers: ['valuation'] }),

  financialFact('discount_rate', 'Discount Rate', 'DCF discount rate', 'DCF input', [
    { source_type: 'advisor_entry', source_authority: 'advisor_entry_verified', valuation_question_key: 'discount_rate' },
    { source_type: 'benchmark', source_authority: 'benchmark' },
  ], { value_type: 'percentage', registered_consumers: ['valuation'] }),

  // ── Business Quality (6 dimensions) ────────────────────────────────────────
  ...['financial_quality', 'growth_quality', 'commercial_quality', 'operational_quality', 'leadership_transferability', 'risk_governance'].map((dim) => ({
    fact_key: `${dim}_score`,
    category: 'business_quality' as FactCategory,
    display_name: dim.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') + ' Score',
    description: `${dim} dimension score from Build Value engine`,
    business_meaning: 'Institutional dimension of business quality',
    value_type: 'number' as ValueType,
    unit: '/100',
    candidate_sources: [{ source_type: 'system_derived' as SourceType, source_authority: 'system_derived' as SourceAuthority, derive_fn: `build_value_${dim}` }],
    required_verification_level: 'needs_review' as const,
    allow_fallback: false,
    conflict_materiality_threshold: 0.1,
    conflict_tolerance: 'standard' as const,
    applicable_periods: ['point_in_time' as ReportingPeriodType],
    default_period: 'point_in_time' as ReportingPeriodType,
    lineage_requirements: [],
    is_derived: true,
    registered_consumers: ['build_value', 'bis', 'dashboard'],
    is_pilot: false,
  })),

  // ── Business Profile ──────────────────────────────────────────────────────
  {
    fact_key: 'industry',
    category: 'business_profile',
    display_name: 'Industry',
    description: 'Business industry classification',
    business_meaning: 'Drives benchmark selection and multiple range',
    value_type: 'text',
    candidate_sources: [{ source_type: 'business_record', source_authority: 'advisor_entry_verified', business_field: 'industry' }],
    required_verification_level: 'verified',
    allow_fallback: false,
    conflict_materiality_threshold: 0,
    conflict_tolerance: 'strict',
    applicable_periods: ['point_in_time'],
    default_period: 'point_in_time',
    lineage_requirements: [],
    is_derived: false,
    registered_consumers: ['all_assessments', 'bis', 'valuation', 'benchmarks'],
    is_pilot: false,
  },
  {
    fact_key: 'entity_structure',
    category: 'business_profile',
    display_name: 'Entity Structure',
    description: 'Legal entity type (LLC, S-Corp, C-Corp, etc.)',
    business_meaning: 'Determines tax structure and transaction structure',
    value_type: 'single_select',
    candidate_sources: [
      { source_type: 'business_record', source_authority: 'advisor_entry_verified', business_field: 'entity_type' },
      { source_type: 'advisor_entry', source_authority: 'advisor_entry_verified', valuation_question_key: 'legal_entity_type' },
    ],
    required_verification_level: 'verified',
    allow_fallback: false,
    conflict_materiality_threshold: 0,
    conflict_tolerance: 'strict',
    applicable_periods: ['point_in_time'],
    default_period: 'point_in_time',
    lineage_requirements: [],
    is_derived: false,
    registered_consumers: ['tax_gap_assessment', 'valuation', 'bis'],
    is_pilot: false,
  },
  {
    fact_key: 'recurring_revenue_pct',
    category: 'business_profile',
    display_name: 'Recurring Revenue %',
    description: 'Percentage of revenue that is recurring/contractual',
    business_meaning: 'Reduces buyer risk and supports higher multiple',
    value_type: 'percentage',
    unit: '%',
    candidate_sources: [{ source_type: 'advisor_entry', source_authority: 'advisor_entry_verified', valuation_question_key: 'recurring_revenue_pct' }],
    required_verification_level: 'needs_review',
    allow_fallback: false,
    conflict_materiality_threshold: 0.1,
    conflict_tolerance: 'standard',
    applicable_periods: ['point_in_time'],
    default_period: 'point_in_time',
    lineage_requirements: [],
    is_derived: false,
    registered_consumers: ['build_value', 'valuation', 'bis'],
    is_pilot: false,
  },

  // ── Intelligence & Assessment ──────────────────────────────────────────────
  ...[
    ['iq_score', 'IQ Score', 'Composite intelligence quotient', 'number', '/100'],
    ['business_impact_score', 'Business Impact Score', 'Intelligence profile completeness', 'number', '/100'],
    ['profit_gap_amount', 'Profit Gap Amount', 'Annual profit gap vs industry best', 'currency', 'USD'],
    ['value_gap_amount', 'Value Gap Amount', 'Current vs potential business value gap', 'currency', 'USD'],
    ['tax_gap_annual', 'Tax Gap Annual', 'Annual tax overpayment estimate', 'currency', 'USD'],
    ['operations_score', 'Operations Score', 'Operations health score 0-100', 'number', '/100'],
    ['freedom_score', 'Freedom Score', 'Personal freedom score 0-100', 'number', '/100'],
    ['recast_add_backs', 'Recast Add-backs', 'Total recast add-backs identified', 'currency', 'USD'],
  ].map(([key, name, desc, vtype, unit]) => ({
    fact_key: key,
    category: 'intelligence_assessment' as FactCategory,
    display_name: name,
    description: desc,
    business_meaning: 'Intelligence signal for dashboard and advisory',
    value_type: vtype as ValueType,
    unit,
    candidate_sources: [{ source_type: 'system_derived' as SourceType, source_authority: 'system_derived' as SourceAuthority, derive_fn: `bis_${key}` }],
    required_verification_level: 'needs_review' as const,
    allow_fallback: true,
    conflict_materiality_threshold: 0.1,
    conflict_tolerance: 'standard' as const,
    applicable_periods: ['point_in_time' as ReportingPeriodType],
    default_period: 'point_in_time' as ReportingPeriodType,
    lineage_requirements: [],
    is_derived: true,
    registered_consumers: ['dashboard', 'bis', 'executive_brief'],
    is_pilot: false,
  })),

  // ── Growth & Execution ────────────────────────────────────────────────────
  {
    fact_key: 'growth_initiatives',
    category: 'growth_execution',
    display_name: 'Growth Initiatives',
    description: 'Approved growth plan initiatives',
    business_meaning: 'Actions to improve EBITDA, multiple, transferability',
    value_type: 'text',
    candidate_sources: [{ source_type: 'system_derived', source_authority: 'system_derived', derive_fn: 'growth_plan_initiatives' }],
    required_verification_level: 'verified',
    allow_fallback: false,
    conflict_materiality_threshold: 0,
    conflict_tolerance: 'strict',
    applicable_periods: ['point_in_time'],
    default_period: 'point_in_time',
    lineage_requirements: ['enterprise_value', 'normalized_ebitda'],
    is_derived: true,
    registered_consumers: ['growth_plan', 'sprint', 'bis'],
    is_pilot: false,
  },
  {
    fact_key: 'sprint_progress',
    category: 'growth_execution',
    display_name: 'Sprint Progress',
    description: 'Current 90-day sprint completion percentage',
    business_meaning: 'Execution progress indicator',
    value_type: 'percentage',
    unit: '%',
    candidate_sources: [{ source_type: 'system_derived', source_authority: 'system_derived', derive_fn: 'sprint_progress_from_tasks' }],
    required_verification_level: 'any',
    allow_fallback: true,
    conflict_materiality_threshold: 0,
    conflict_tolerance: 'lenient',
    applicable_periods: ['point_in_time'],
    default_period: 'point_in_time',
    lineage_requirements: [],
    is_derived: true,
    registered_consumers: ['dashboard', 'bis', 'sprint'],
    is_pilot: false,
  },

  // ── Document & Verification ────────────────────────────────────────────────
  {
    fact_key: 'document_completeness',
    category: 'document_verification',
    display_name: 'Document Completeness',
    description: 'Percentage of required documents uploaded and processed',
    business_meaning: 'Data readiness indicator',
    value_type: 'percentage',
    unit: '%',
    candidate_sources: [{ source_type: 'system_derived', source_authority: 'system_derived', derive_fn: 'document_completeness_from_documents' }],
    required_verification_level: 'any',
    allow_fallback: true,
    conflict_materiality_threshold: 0,
    conflict_tolerance: 'lenient',
    applicable_periods: ['point_in_time'],
    default_period: 'point_in_time',
    lineage_requirements: [],
    is_derived: true,
    registered_consumers: ['discover', 'bis', 'dashboard', 'confidence'],
    is_pilot: false,
  },
  {
    fact_key: 'verification_status',
    category: 'document_verification',
    display_name: 'Verification Status',
    description: 'Overall verification status of business facts',
    business_meaning: 'Trust indicator for intelligence',
    value_type: 'text',
    candidate_sources: [{ source_type: 'system_derived', source_authority: 'system_derived', derive_fn: 'verification_status_from_fields' }],
    required_verification_level: 'any',
    allow_fallback: true,
    conflict_materiality_threshold: 0,
    conflict_tolerance: 'lenient',
    applicable_periods: ['point_in_time'],
    default_period: 'point_in_time',
    lineage_requirements: [],
    is_derived: true,
    registered_consumers: ['intelligence', 'verify', 'build_value', 'confidence'],
    is_pilot: false,
  },
  {
    fact_key: 'confidence_score',
    category: 'document_verification',
    display_name: 'Confidence Score',
    description: 'Overall confidence in business intelligence',
    business_meaning: 'Trust signal for valuation and advisory',
    value_type: 'number',
    unit: '/100',
    candidate_sources: [{ source_type: 'system_derived', source_authority: 'system_derived', derive_fn: 'confidence_from_confidence_engine' }],
    required_verification_level: 'any',
    allow_fallback: true,
    conflict_materiality_threshold: 0,
    conflict_tolerance: 'lenient',
    applicable_periods: ['point_in_time'],
    default_period: 'point_in_time',
    lineage_requirements: [],
    is_derived: true,
    registered_consumers: ['valuation', 'bis', 'dashboard'],
    is_pilot: false,
  },
  {
    fact_key: 'publication_status',
    category: 'document_verification',
    display_name: 'Publication Status',
    description: 'Valuation publication status',
    business_meaning: 'Indicates whether valuation is published',
    value_type: 'text',
    candidate_sources: [{ source_type: 'business_record', source_authority: 'advisor_entry_verified', business_field: 'valuation_status' }],
    required_verification_level: 'verified',
    allow_fallback: false,
    conflict_materiality_threshold: 0,
    conflict_tolerance: 'strict',
    applicable_periods: ['point_in_time'],
    default_period: 'point_in_time',
    lineage_requirements: [],
    is_derived: false,
    registered_consumers: ['valuation', 'reports', 'deliverables', 'bis'],
    is_pilot: false,
  },
];

// ── Pilot Facts (first 10) ───────────────────────────────────────────────────
export const PILOT_FACT_KEYS = FACT_REGISTRY.filter((f) => f.is_pilot).map((f) => f.fact_key);

// ── Lookup helpers ──────────────────────────────────────────────────────────
export function getFactDefinition(factKey: string): FactDefinition | undefined {
  return FACT_REGISTRY.find((f) => f.fact_key === factKey);
}

export function getFactsByCategory(category: FactCategory): FactDefinition[] {
  return FACT_REGISTRY.filter((f) => f.category === category);
}

export function getFactConsumers(factKey: string): string[] {
  return getFactDefinition(factKey)?.registered_consumers || [];
}