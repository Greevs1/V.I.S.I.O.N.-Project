/**
 * Phase 13.2 — Valuation Questionnaire Definition Library
 *
 * Versioned, conditional-logic-aware question definitions for the
 * Enterprise Value Analysis™ framework.
 *
 * 27 sections, ~85 questions. Not all questions display for every company —
 * conditional_logic adapts the questionnaire to industry, size, purpose,
 * and available data.
 *
 * DO NOT hard-code questions inside React components. This file is the
 * single source of truth for question definitions.
 *
 * Version: 1.0.0
 */

export const QUESTIONNAIRE_VERSION = '1.0.0';

// ============================================================================
// SECTIONS
// ============================================================================
export const VALUATION_SECTIONS = [
  { section_key: 'engagement_purpose', section_name: 'Engagement and Valuation Purpose', display_order: 1 },
  { section_key: 'business_identity', section_name: 'Business Identity and Ownership', display_order: 2 },
  { section_key: 'historical_financials', section_name: 'Historical Financial Performance', display_order: 3 },
  { section_key: 'quality_of_earnings', section_name: 'Quality of Earnings and Recast Adjustments', display_order: 4 },
  { section_key: 'revenue_quality', section_name: 'Revenue Quality', display_order: 5 },
  { section_key: 'customer_concentration', section_name: 'Customer Concentration', display_order: 6 },
  { section_key: 'growth_market', section_name: 'Growth and Market Position', display_order: 7 },
  { section_key: 'sales_engine', section_name: 'Sales and Commercial Engine', display_order: 8 },
  { section_key: 'gross_margin', section_name: 'Gross Margin and Profitability', display_order: 9 },
  { section_key: 'cash_conversion', section_name: 'Cash Conversion and Working Capital', display_order: 10 },
  { section_key: 'capex_asset', section_name: 'Capital Expenditures and Asset Intensity', display_order: 11 },
  { section_key: 'management_team', section_name: 'Management Team and Leadership Depth', display_order: 12 },
  { section_key: 'owner_dependency', section_name: 'Owner Dependency', display_order: 13 },
  { section_key: 'operational_maturity', section_name: 'Operational Maturity', display_order: 14 },
  { section_key: 'technology_data', section_name: 'Technology and Data Maturity', display_order: 15 },
  { section_key: 'customer_capital', section_name: 'Customer Capital', display_order: 16 },
  { section_key: 'human_capital', section_name: 'Human Capital', display_order: 17 },
  { section_key: 'structural_capital', section_name: 'Structural Capital', display_order: 18 },
  { section_key: 'social_brand_capital', section_name: 'Social and Brand Capital', display_order: 19 },
  { section_key: 'legal_tax_risk', section_name: 'Legal, Tax, and Regulatory Risk', display_order: 20 },
  { section_key: 'contracts_transferability', section_name: 'Contracts and Transferability', display_order: 21 },
  { section_key: 'competitive_moat_ip', section_name: 'Competitive Moats and Intellectual Property', display_order: 22 },
  { section_key: 'forecast_reliability', section_name: 'Forecast Reliability', display_order: 23 },
  { section_key: 'transaction_readiness', section_name: 'Transaction Readiness', display_order: 24 },
  { section_key: 'buyer_universe', section_name: 'Buyer Universe and Strategic Value', display_order: 25 },
  { section_key: 'family_wealth', section_name: 'Family Wealth and Capital Allocation Context', display_order: 26 },
  { section_key: 'advisor_conclusions', section_name: 'Advisor Conclusions', display_order: 27 },
];

// ============================================================================
// QUESTION LIBARY
// ============================================================================
export const VALUATION_QUESTIONS = [
  // ── 1. Engagement and Valuation Purpose ──────────────────────────────────
  {
    question_key: 'valuation_purpose',
    section: 'engagement_purpose',
    question_text: 'What is the primary purpose of this valuation?',
    explanation: 'Different purposes may produce different conclusions. The purpose guides methodology selection and standard of value.',
    answer_type: 'single_select',
    options: ['strategic_planning', 'exit_planning', 'internal_ownership_planning', 'potential_sale', 'buyer_preparation', 'capital_raise', 'estate_planning', 'tax_planning', 'partner_transaction', 'other'],
    required: true,
    valuation_relevance: 'context',
    client_answerable: false,
    advisor_only: true,
    display_order: 1,
  },
  {
    question_key: 'standard_of_value',
    section: 'engagement_purpose',
    question_text: 'Which standard of value applies?',
    explanation: 'Fair market value differs from investment value or strategic value. The advisor must select the appropriate standard.',
    answer_type: 'single_select',
    options: ['fair_market_value', 'investment_value', 'strategic_value', 'fair_value', 'indicative_enterprise_value'],
    required: true,
    valuation_relevance: 'enterprise_value',
    client_answerable: false,
    advisor_only: true,
    display_order: 2,
  },
  {
    question_key: 'valuation_premise',
    section: 'engagement_purpose',
    question_text: 'What is the valuation premise?',
    explanation: 'Going concern vs. orderly liquidation vs. asset sale produce fundamentally different results.',
    answer_type: 'single_select',
    options: ['going_concern', 'orderly_liquidation', 'asset_sale', 'stock_sale', 'controlling_interest', 'minority_interest'],
    required: true,
    valuation_relevance: 'enterprise_value',
    client_answerable: false,
    advisor_only: true,
    display_order: 3,
  },
  {
    question_key: 'valuation_date',
    section: 'engagement_purpose',
    question_text: 'What is the valuation date?',
    explanation: 'The valuation date is preserved in every version. Value can change materially over time.',
    answer_type: 'date',
    required: true,
    valuation_relevance: 'enterprise_value',
    client_answerable: false,
    advisor_only: true,
    display_order: 4,
  },
  {
    question_key: 'engagement_type_disclosure',
    section: 'engagement_purpose',
    question_text: 'Confirm the engagement type for client-facing disclosure.',
    explanation: 'Enterprise Value Analysis™ is the default. Calculation of Value, Formal Valuation, or Certified Appraisal require additional professional review.',
    answer_type: 'single_select',
    options: ['enterprise_value_analysis', 'calculation_of_value', 'formal_valuation', 'certified_appraisal', 'fairness_opinion'],
    required: true,
    valuation_relevance: 'context',
    client_answerable: false,
    advisor_only: true,
    display_order: 5,
  },

  // ── 2. Business Identity and Ownership ───────────────────────────────────
  {
    question_key: 'legal_entity_type',
    section: 'business_identity',
    question_text: 'What is the legal entity type?',
    answer_type: 'single_select',
    options: ['llc', 's_corp', 'c_corp', 'partnership', 'sole_proprietor', 'other'],
    required: true,
    valuation_relevance: 'transferability',
    display_order: 6,
  },
  {
    question_key: 'ownership_structure',
    section: 'business_identity',
    question_text: 'Describe the ownership structure (number of owners, percentage split).',
    answer_type: 'textarea',
    required: true,
    valuation_relevance: 'transferability',
    display_order: 7,
  },
  {
    question_key: 'entity_tax_election',
    section: 'business_identity',
    question_text: 'What is the current tax election (if applicable)?',
    answer_type: 'single_select',
    options: ['schedule_c', 's_corp_election', 'partnership_return', 'c_corp_return', 'not_applicable'],
    required: false,
    valuation_relevance: 'context',
    conditional_logic: { field: 'legal_entity_type', operator: 'in', value: ['llc', 's_corp', 'partnership'] },
    display_order: 8,
  },
  {
    question_key: 'business_description',
    section: 'business_identity',
    question_text: 'Provide a brief description of what the business does.',
    answer_type: 'textarea',
    required: true,
    valuation_relevance: 'context',
    display_order: 9,
  },

  // ── 3. Historical Financial Performance ──────────────────────────────────
  {
    question_key: 'historical_revenue_3yr',
    section: 'historical_financials',
    question_text: 'Provide revenue for the last 3 fiscal years.',
    explanation: 'Enter the most recent 3 years of reported revenue. This is used for trend analysis.',
    answer_type: 'currency',
    required: true,
    valuation_relevance: 'enterprise_value',
    suggested_evidence: 'P&L statements, tax returns',
    display_order: 10,
  },
  {
    question_key: 'historical_ebitda_3yr',
    section: 'historical_financials',
    question_text: 'Provide reported EBITDA for the last 3 fiscal years.',
    answer_type: 'currency',
    required: true,
    valuation_relevance: 'enterprise_value',
    suggested_evidence: 'P&L statements, tax returns',
    display_order: 11,
  },
  {
    question_key: 'historical_gross_margin_trend',
    section: 'historical_financials',
    question_text: 'Has gross margin been stable, expanding, or compressing?',
    answer_type: 'single_select',
    options: ['stable', 'expanding', 'compressing', 'volatile'],
    required: true,
    valuation_relevance: 'profitability',
    display_order: 12,
  },
  {
    question_key: 'ttm_revenue',
    section: 'historical_financials',
    question_text: 'What is trailing twelve months (TTM) revenue?',
    answer_type: 'currency',
    required: true,
    valuation_relevance: 'enterprise_value',
    suggested_evidence: 'Most recent P&L or internal financials',
    display_order: 13,
  },
  {
    question_key: 'ttm_ebitda',
    section: 'historical_financials',
    question_text: 'What is trailing twelve months (TTM) EBITDA?',
    answer_type: 'currency',
    required: true,
    valuation_relevance: 'enterprise_value',
    display_order: 14,
  },

  // ── 4. Quality of Earnings and Recast Adjustments ─────────────────────────
  {
    question_key: 'owner_compensation_actual',
    section: 'quality_of_earnings',
    question_text: 'What is the actual owner compensation (total)?',
    explanation: 'Include salary, bonuses, distributions, and perks. Used for recast adjustment.',
    answer_type: 'currency',
    required: true,
    valuation_relevance: 'profitability',
    suggested_evidence: 'Payroll reports, P&L, K-1s',
    display_order: 15,
  },
  {
    question_key: 'owner_market_compensation',
    section: 'quality_of_earnings',
    question_text: 'What is the market-rate replacement compensation for the owner role?',
    answer_type: 'currency',
    required: true,
    valuation_relevance: 'profitability',
    display_order: 16,
  },
  {
    question_key: 'one_time_expenses',
    section: 'quality_of_earnings',
    question_text: 'List any one-time or non-recurring expenses in the last 3 years.',
    answer_type: 'textarea',
    required: false,
    valuation_relevance: 'profitability',
    display_order: 17,
  },
  {
    question_key: 'related_party_transactions',
    section: 'quality_of_earnings',
    question_text: 'Are there any related-party transactions (rent, services, etc.)?',
    answer_type: 'boolean',
    required: true,
    valuation_relevance: 'profitability',
    conditional_logic: { field: 'one_time_expenses', operator: 'exists' },
    display_order: 18,
  },
  {
    question_key: 'related_party_details',
    section: 'quality_of_earnings',
    question_text: 'Describe related-party transactions and their terms.',
    answer_type: 'textarea',
    required: false,
    valuation_relevance: 'profitability',
    conditional_logic: { field: 'related_party_transactions', operator: 'equals', value: true },
    display_order: 19,
  },

  // ── 5. Revenue Quality ────────────────────────────────────────────────────
  {
    question_key: 'recurring_revenue_percentage',
    section: 'revenue_quality',
    question_text: 'What percentage of revenue is recurring (contracts, subscriptions, etc.)?',
    answer_type: 'percentage',
    required: true,
    valuation_relevance: 'multiple',
    display_order: 20,
  },
  {
    question_key: 'revenue_concentration_top_customer',
    section: 'revenue_quality',
    question_text: 'What percentage of revenue comes from the top customer?',
    answer_type: 'percentage',
    required: true,
    valuation_relevance: 'risk',
    display_order: 21,
  },
  {
    question_key: 'revenue_concentration_top_10',
    section: 'revenue_quality',
    question_text: 'What percentage of revenue comes from the top 10 customers?',
    answer_type: 'percentage',
    required: true,
    valuation_relevance: 'risk',
    display_order: 22,
  },
  {
    question_key: 'customer_retention_rate',
    section: 'revenue_quality',
    question_text: 'What is the annual customer retention rate?',
    answer_type: 'percentage',
    required: false,
    valuation_relevance: 'multiple',
    display_order: 23,
  },

  // ── 6. Customer Concentration ─────────────────────────────────────────────
  {
    question_key: 'customer_count',
    section: 'customer_concentration',
    question_text: 'How many active customers does the business have?',
    answer_type: 'number',
    required: true,
    valuation_relevance: 'risk',
    display_order: 24,
  },
  {
    question_key: 'customer_industry_diversity',
    section: 'customer_concentration',
    question_text: 'How many different industries do your customers represent?',
    answer_type: 'number',
    required: false,
    valuation_relevance: 'risk',
    display_order: 25,
  },
  {
    question_key: 'customer_contract_status',
    section: 'customer_concentration',
    question_text: 'What percentage of revenue is under written contracts?',
    answer_type: 'percentage',
    required: false,
    valuation_relevance: 'transferability',
    display_order: 26,
  },

  // ── 7. Growth and Market Position ─────────────────────────────────────────
  {
    question_key: 'historical_growth_rate',
    section: 'growth_market',
    question_text: 'What has been the 3-year revenue CAGR?',
    answer_type: 'percentage',
    required: true,
    valuation_relevance: 'growth',
    display_order: 27,
  },
  {
    question_key: 'market_size',
    section: 'growth_market',
    question_text: 'What is the estimated total addressable market (TAM)?',
    answer_type: 'currency',
    required: false,
    valuation_relevance: 'growth',
    display_order: 28,
  },
  {
    question_key: 'market_share_estimate',
    section: 'growth_market',
    question_text: 'What is the estimated market share?',
    answer_type: 'percentage',
    required: false,
    valuation_relevance: 'growth',
    display_order: 29,
  },
  {
    question_key: 'competitive_position',
    section: 'growth_market',
    question_text: 'How would you describe the competitive position?',
    answer_type: 'single_select',
    options: ['market_leader', 'strong_challenger', 'mid_market', 'niche_player', 'challenged'],
    required: true,
    valuation_relevance: 'multiple',
    display_order: 30,
  },

  // ── 8. Sales and Commercial Engine ────────────────────────────────────────
  {
    question_key: 'sales_process_description',
    section: 'sales_engine',
    question_text: 'Describe the primary sales process (inbound, outbound, channel, etc.).',
    answer_type: 'textarea',
    required: true,
    valuation_relevance: 'transferability',
    display_order: 31,
  },
  {
    question_key: 'sales_team_size',
    section: 'sales_engine',
    question_text: 'How many people are in the sales organization?',
    answer_type: 'number',
    required: false,
    valuation_relevance: 'context',
    display_order: 32,
  },
  {
    question_key: 'sales_cycle_length',
    section: 'sales_engine',
    question_text: 'What is the average sales cycle length (in days)?',
    answer_type: 'number',
    required: false,
    valuation_relevance: 'context',
    display_order: 33,
  },
  {
    question_key: 'customer_acquisition_cost',
    section: 'sales_engine',
    question_text: 'What is the average customer acquisition cost (CAC)?',
    answer_type: 'currency',
    required: false,
    valuation_relevance: 'profitability',
    display_order: 34,
  },

  // ── 9. Gross Margin and Profitability ─────────────────────────────────────
  {
    question_key: 'gross_margin_percentage',
    section: 'gross_margin',
    question_text: 'What is the current gross margin percentage?',
    answer_type: 'percentage',
    required: true,
    valuation_relevance: 'profitability',
    display_order: 35,
  },
  {
    question_key: 'gross_margin_vs_industry',
    section: 'gross_margin',
    question_text: 'How does the gross margin compare to industry benchmarks?',
    answer_type: 'single_select',
    options: ['above_average', 'average', 'below_average', 'unknown'],
    required: false,
    valuation_relevance: 'multiple',
    display_order: 36,
  },
  {
    question_key: 'operating_margin_trend',
    section: 'gross_margin',
    question_text: 'Has operating margin been improving, stable, or declining?',
    answer_type: 'single_select',
    options: ['improving', 'stable', 'declining'],
    required: true,
    valuation_relevance: 'profitability',
    display_order: 37,
  },

  // ── 10. Cash Conversion and Working Capital ───────────────────────────────
  {
    question_key: 'days_sales_outstanding',
    section: 'cash_conversion',
    question_text: 'What is the current Days Sales Outstanding (DSO)?',
    answer_type: 'number',
    required: false,
    valuation_relevance: 'risk',
    display_order: 38,
  },
  {
    question_key: 'days_inventory_outstanding',
    section: 'cash_conversion',
    question_text: 'What is the current Days Inventory Outstanding (DIO)?',
    answer_type: 'number',
    required: false,
    valuation_relevance: 'risk',
    conditional_logic: { field: 'legal_entity_type', operator: 'not_equals', value: 'service_business' },
    display_order: 39,
  },
  {
    question_key: 'days_payable_outstanding',
    section: 'cash_conversion',
    question_text: 'What is the current Days Payable Outstanding (DPO)?',
    answer_type: 'number',
    required: false,
    valuation_relevance: 'context',
    display_order: 40,
  },
  {
    question_key: 'working_capital_balance',
    section: 'cash_conversion',
    question_text: 'What is the current working capital balance?',
    answer_type: 'currency',
    required: false,
    valuation_relevance: 'enterprise_value',
    display_order: 41,
  },

  // ── 11. Capital Expenditures and Asset Intensity ───────────────────────────
  {
    question_key: 'annual_capex',
    section: 'capex_asset',
    question_text: 'What is the average annual capital expenditure?',
    answer_type: 'currency',
    required: true,
    valuation_relevance: 'enterprise_value',
    display_order: 42,
  },
  {
    question_key: 'capex_vs_depreciation',
    section: 'capex_asset',
    question_text: 'How does annual capex compare to annual depreciation?',
    answer_type: 'single_select',
    options: ['significantly_above', 'slightly_above', 'roughly_equal', 'below'],
    required: false,
    valuation_relevance: 'context',
    display_order: 43,
  },
  {
    question_key: 'owned_real_estate',
    section: 'capex_asset',
    question_text: 'Does the business own real estate?',
    answer_type: 'boolean',
    required: true,
    valuation_relevance: 'enterprise_value',
    display_order: 44,
  },
  {
    question_key: 'real_estate_value',
    section: 'capex_asset',
    question_text: 'What is the estimated value of owned real estate?',
    answer_type: 'currency',
    required: false,
    valuation_relevance: 'enterprise_value',
    conditional_logic: { field: 'owned_real_estate', operator: 'equals', value: true },
    display_order: 45,
  },

  // ── 12. Management Team and Leadership Depth ──────────────────────────────
  {
    question_key: 'management_team_depth',
    section: 'management_team',
    question_text: 'Rate the depth of the management team beyond the owner.',
    answer_type: 'scale_1_5',
    required: true,
    valuation_relevance: 'multiple',
    display_order: 46,
  },
  {
    question_key: 'key_person_dependency',
    section: 'management_team',
    question_text: 'How dependent is the business on key individuals beyond the owner?',
    answer_type: 'scale_1_5',
    required: true,
    valuation_relevance: 'risk',
    display_order: 47,
  },
  {
    question_key: 'management_tenure',
    section: 'management_team',
    question_text: 'What is the average tenure of key management (in years)?',
    answer_type: 'number',
    required: false,
    valuation_relevance: 'multiple',
    display_order: 48,
  },

  // ── 13. Owner Dependency ──────────────────────────────────────────────────
  {
    question_key: 'owner_hours_per_week',
    section: 'owner_dependency',
    question_text: 'How many hours per week does the owner work in the business?',
    answer_type: 'number',
    required: true,
    valuation_relevance: 'transferability',
    display_order: 49,
  },
  {
    question_key: 'owner_role_description',
    section: 'owner_dependency',
    question_text: 'Describe the owner primary role in the business.',
    answer_type: 'textarea',
    required: true,
    valuation_relevance: 'transferability',
    display_order: 50,
  },
  {
    question_key: 'owner_relationship_importance',
    section: 'owner_dependency',
    question_text: 'How important are the owner personal relationships to revenue?',
    answer_type: 'scale_1_5',
    required: true,
    valuation_relevance: 'risk',
    display_order: 51,
  },
  {
    question_key: 'succession_plan_exists',
    section: 'owner_dependency',
    question_text: 'Does a formal succession plan exist?',
    answer_type: 'boolean',
    required: true,
    valuation_relevance: 'owner_readiness',
    display_order: 52,
  },

  // ── 14. Operational Maturity ──────────────────────────────────────────────
  {
    question_key: 'documented_sops',
    section: 'operational_maturity',
    question_text: 'Are standard operating procedures documented?',
    answer_type: 'single_select',
    options: ['comprehensive', 'partial', 'minimal', 'none'],
    required: true,
    valuation_relevance: 'transferability',
    display_order: 53,
  },
  {
    question_key: 'erp_system',
    section: 'operational_maturity',
    question_text: 'What primary systems does the business use (ERP, CRM, etc.)?',
    answer_type: 'textarea',
    required: false,
    valuation_relevance: 'context',
    display_order: 54,
  },
  {
    question_key: 'operational_metrics_tracked',
    section: 'operational_maturity',
    question_text: 'Are operational KPIs regularly tracked and reviewed?',
    answer_type: 'boolean',
    required: true,
    valuation_relevance: 'multiple',
    display_order: 55,
  },

  // ── 15. Technology and Data Maturity ──────────────────────────────────────
  {
    question_key: 'technology_stack_modernity',
    section: 'technology_data',
    question_text: 'How would you rate the modernity of the technology stack?',
    answer_type: 'scale_1_5',
    required: true,
    valuation_relevance: 'multiple',
    display_order: 56,
  },
  {
    question_key: 'data_quality_rating',
    section: 'technology_data',
    question_text: 'How would you rate the quality and accessibility of business data?',
    answer_type: 'scale_1_5',
    required: true,
    valuation_relevance: 'multiple',
    display_order: 57,
  },
  {
    question_key: 'cybersecurity_measures',
    section: 'technology_data',
    question_text: 'Are formal cybersecurity measures in place?',
    answer_type: 'boolean',
    required: false,
    valuation_relevance: 'risk',
    display_order: 58,
  },

  // ── 16. Customer Capital ──────────────────────────────────────────────────
  {
    question_key: 'customer_satisfaction_score',
    section: 'customer_capital',
    question_text: 'What is the customer satisfaction score (NPS or equivalent)?',
    answer_type: 'number',
    required: false,
    valuation_relevance: 'multiple',
    display_order: 59,
  },
  {
    question_key: 'brand_awareness',
    section: 'customer_capital',
    question_text: 'How would you rate brand awareness in the market?',
    answer_type: 'scale_1_5',
    required: false,
    valuation_relevance: 'multiple',
    display_order: 60,
  },

  // ── 17. Human Capital ──────────────────────────────────────────────────────
  {
    question_key: 'employee_count',
    section: 'human_capital',
    question_text: 'How many full-time equivalent employees does the business have?',
    answer_type: 'number',
    required: true,
    valuation_relevance: 'context',
    display_order: 61,
  },
  {
    question_key: 'employee_turnover_rate',
    section: 'human_capital',
    question_text: 'What is the annual employee turnover rate?',
    answer_type: 'percentage',
    required: false,
    valuation_relevance: 'risk',
    display_order: 62,
  },
  {
    question_key: 'key_employee_agreements',
    section: 'human_capital',
    question_text: 'Do key employees have employment agreements or non-compete clauses?',
    answer_type: 'boolean',
    required: false,
    valuation_relevance: 'transferability',
    display_order: 63,
  },

  // ── 18. Structural Capital ────────────────────────────────────────────────
  {
    question_key: 'intellectual_property',
    section: 'structural_capital',
    question_text: 'Does the business own intellectual property (patents, trademarks, trade secrets)?',
    answer_type: 'boolean',
    required: true,
    valuation_relevance: 'multiple',
    display_order: 64,
  },
  {
    question_key: 'ip_description',
    section: 'structural_capital',
    question_text: 'Describe the intellectual property.',
    answer_type: 'textarea',
    required: false,
    valuation_relevance: 'multiple',
    conditional_logic: { field: 'intellectual_property', operator: 'equals', value: true },
    display_order: 65,
  },
  {
    question_key: 'proprietary_processes',
    section: 'structural_capital',
    question_text: 'Does the business have proprietary processes or methodologies?',
    answer_type: 'boolean',
    required: false,
    valuation_relevance: 'multiple',
    display_order: 66,
  },

  // ── 19. Social and Brand Capital ──────────────────────────────────────────
  {
    question_key: 'online_reputation',
    section: 'social_brand_capital',
    question_text: 'How would you rate the online reputation (reviews, ratings)?',
    answer_type: 'scale_1_5',
    required: false,
    valuation_relevance: 'multiple',
    display_order: 67,
  },
  {
    question_key: 'community_involvement',
    section: 'social_brand_capital',
    question_text: 'Is the business active in community or industry associations?',
    answer_type: 'boolean',
    required: false,
    valuation_relevance: 'context',
    display_order: 68,
  },

  // ── 20. Legal, Tax, and Regulatory Risk ────────────────────────────────────
  {
    question_key: 'pending_litigation',
    section: 'legal_tax_risk',
    question_text: 'Is there any pending or threatened litigation?',
    answer_type: 'boolean',
    required: true,
    valuation_relevance: 'risk',
    display_order: 69,
  },
  {
    question_key: 'litigation_details',
    section: 'legal_tax_risk',
    question_text: 'Describe any pending or threatened litigation.',
    answer_type: 'textarea',
    required: false,
    valuation_relevance: 'risk',
    conditional_logic: { field: 'pending_litigation', operator: 'equals', value: true },
    display_order: 70,
  },
  {
    question_key: 'regulatory_compliance_status',
    section: 'legal_tax_risk',
    question_text: 'Are there any known regulatory compliance issues?',
    answer_type: 'boolean',
    required: true,
    valuation_relevance: 'risk',
    display_order: 71,
  },
  {
    question_key: 'tax_filing_status',
    section: 'legal_tax_risk',
    question_text: 'Are all tax filings current and up to date?',
    answer_type: 'boolean',
    required: true,
    valuation_relevance: 'risk',
    display_order: 72,
  },

  // ── 21. Contracts and Transferability ─────────────────────────────────────
  {
    question_key: 'key_contracts_transferable',
    section: 'contracts_transferability',
    question_text: 'Are key customer and supplier contracts transferable to a new owner?',
    answer_type: 'single_select',
    options: ['fully_transferable', 'transferable_with_consent', 'not_transferable', 'unknown'],
    required: true,
    valuation_relevance: 'transferability',
    display_order: 73,
  },
  {
    question_key: 'change_of_control_provisions',
    section: 'contracts_transferability',
    question_text: 'Do any contracts contain change-of-control provisions?',
    answer_type: 'boolean',
    required: false,
    valuation_relevance: 'transferability',
    display_order: 74,
  },

  // ── 22. Competitive Moats and Intellectual Property ───────────────────────
  {
    question_key: 'competitive_moat_strength',
    section: 'competitive_moat_ip',
    question_text: 'How would you rate the strength of the competitive moat?',
    answer_type: 'scale_1_5',
    required: true,
    valuation_relevance: 'multiple',
    display_order: 75,
  },
  {
    question_key: 'barriers_to_entry',
    section: 'competitive_moat_ip',
    question_text: 'What are the primary barriers to entry for competitors?',
    answer_type: 'textarea',
    required: false,
    valuation_relevance: 'multiple',
    display_order: 76,
  },

  // ── 23. Forecast Reliability ───────────────────────────────────────────────
  {
    question_key: 'has_forecast',
    section: 'forecast_reliability',
    question_text: 'Does the business have a formal financial forecast?',
    answer_type: 'boolean',
    required: true,
    valuation_relevance: 'growth',
    display_order: 77,
  },
  {
    question_key: 'forecast_accuracy',
    section: 'forecast_reliability',
    question_text: 'How accurate have historical forecasts been?',
    answer_type: 'single_select',
    options: ['highly_accurate', 'reasonably_accurate', 'inaccurate', 'no_track_record'],
    required: false,
    valuation_relevance: 'multiple',
    conditional_logic: { field: 'has_forecast', operator: 'equals', value: true },
    display_order: 78,
  },
  {
    question_key: 'projected_growth_rate',
    section: 'forecast_reliability',
    question_text: 'What is the projected revenue growth rate for the next 3 years?',
    answer_type: 'percentage',
    required: false,
    valuation_relevance: 'growth',
    conditional_logic: { field: 'has_forecast', operator: 'equals', value: true },
    display_order: 79,
  },

  // ── 24. Transaction Readiness ─────────────────────────────────────────────
  {
    question_key: 'financial_statements_quality',
    section: 'transaction_readiness',
    question_text: 'How would you rate the quality of financial statements?',
    answer_type: 'scale_1_5',
    required: true,
    valuation_relevance: 'multiple',
    display_order: 80,
  },
  {
    question_key: 'audited_financials',
    section: 'transaction_readiness',
    question_text: 'Are the financial statements audited or reviewed?',
    answer_type: 'single_select',
    options: ['audited', 'reviewed', 'compiled', 'internal_only'],
    required: true,
    valuation_relevance: 'multiple',
    display_order: 81,
  },
  {
    question_key: 'data_room_preparedness',
    section: 'transaction_readiness',
    question_text: 'How prepared is the business for a due diligence data room?',
    answer_type: 'scale_1_5',
    required: false,
    valuation_relevance: 'business_readiness',
    display_order: 82,
  },

  // ── 25. Buyer Universe and Strategic Value ────────────────────────────────
  {
    question_key: 'buyer_universe_size',
    section: 'buyer_universe',
    question_text: 'How large is the potential buyer universe?',
    answer_type: 'single_select',
    options: ['large', 'moderate', 'limited', 'very_limited'],
    required: false,
    valuation_relevance: 'multiple',
    display_order: 83,
  },
  {
    question_key: 'strategic_synergy_potential',
    section: 'buyer_universe',
    question_text: 'Is there potential for strategic buyer synergies?',
    answer_type: 'boolean',
    required: false,
    valuation_relevance: 'multiple',
    display_order: 84,
  },

  // ── 26. Family Wealth and Capital Allocation Context ──────────────────────
  {
    question_key: 'post_exit_income_needs',
    section: 'family_wealth',
    question_text: 'What are the estimated post-exit annual income needs?',
    answer_type: 'currency',
    required: false,
    valuation_relevance: 'context',
    client_answerable: true,
    advisor_only: false,
    display_order: 85,
  },
  {
    question_key: 'estate_planning_concerns',
    section: 'family_wealth',
    question_text: 'Are there estate planning or intergenerational transfer concerns?',
    answer_type: 'boolean',
    required: false,
    valuation_relevance: 'context',
    client_answerable: true,
    advisor_only: false,
    display_order: 86,
  },

  // ── 27. Advisor Conclusions ───────────────────────────────────────────────
  {
    question_key: 'advisor_overall_assessment',
    section: 'advisor_conclusions',
    question_text: 'Advisor overall assessment of the business.',
    answer_type: 'textarea',
    required: false,
    valuation_relevance: 'context',
    client_answerable: false,
    advisor_only: true,
    display_order: 87,
  },
  {
    question_key: 'advisor_key_risks',
    section: 'advisor_conclusions',
    question_text: 'Key risks identified during the valuation.',
    answer_type: 'textarea',
    required: false,
    valuation_relevance: 'risk',
    client_answerable: false,
    advisor_only: true,
    display_order: 88,
  },
  {
    question_key: 'advisor_key_strengths',
    section: 'advisor_conclusions',
    question_text: 'Key strengths identified during the valuation.',
    answer_type: 'textarea',
    required: false,
    valuation_relevance: 'multiple',
    client_answerable: false,
    advisor_only: true,
    display_order: 89,
  },
  {
    question_key: 'advisor_value_driver_summary',
    section: 'advisor_conclusions',
    question_text: 'Summary of primary value drivers and detractors.',
    answer_type: 'textarea',
    required: false,
    valuation_relevance: 'enterprise_value',
    client_answerable: false,
    advisor_only: true,
    display_order: 90,
  },
];

// ============================================================================
// METHODOLOGY RECOMMENDATION ENGINE
// ============================================================================
export const VALUATION_METHODOLOGIES = [
  {
    method_key: 'capitalization_of_earnings',
    method_name: 'Capitalization of Earnings',
    category: 'income',
    description: 'Capitalizes normalized earnings at a market-derived capitalization rate.',
    best_for: ['stable_earnings', 'mature_business', 'predictable_cash_flow'],
  },
  {
    method_key: 'dcf',
    method_name: 'Discounted Cash Flow',
    category: 'income',
    description: 'Projects future cash flows and discounts to present value.',
    best_for: ['growth_business', 'variable_cash_flow', 'forecast_available'],
  },
  {
    method_key: 'ebitda_multiple',
    method_name: 'EBITDA Multiple Method',
    category: 'market',
    description: 'Applies a market-derived EBITDA multiple to normalized EBITDA.',
    best_for: ['mid_market', 'profitable', 'comparable_transactions'],
  },
  {
    method_key: 'sde_multiple',
    method_name: 'SDE Multiple Method',
    category: 'market',
    description: 'Applies a Seller Discretionary Earnings multiple. Common for small businesses.',
    best_for: ['small_business', 'owner_operated', 'revenue_under_2m'],
  },
  {
    method_key: 'revenue_multiple',
    method_name: 'Revenue Multiple Method',
    category: 'market',
    description: 'Applies a revenue multiple. Used when earnings are negative or minimal.',
    best_for: ['early_stage', 'high_growth', 'negative_earnings'],
  },
  {
    method_key: 'guideline_transaction',
    method_name: 'Guideline Transaction Method',
    category: 'market',
    description: 'Uses actual transaction data from comparable business sales.',
    best_for: ['comparable_data_available', 'mid_market'],
  },
  {
    method_key: 'comparable_company',
    method_name: 'Comparable Company Method',
    category: 'market',
    description: 'Uses public company multiples as a reference.',
    best_for: ['large_business', 'public_comparables'],
  },
  {
    method_key: 'adjusted_net_asset',
    method_name: 'Adjusted Net Asset Value',
    category: 'asset',
    description: 'Values the business at the fair market value of its net assets.',
    best_for: ['asset_heavy', 'holding_company', 'minimal_earnings'],
  },
  {
    method_key: 'asset_floor',
    method_name: 'Asset Floor Value',
    category: 'asset',
    description: 'Establishes a floor value based on tangible assets.',
    best_for: ['distressed', 'asset_heavy'],
  },
  {
    method_key: 'liquidation',
    method_name: 'Liquidation Analysis',
    category: 'asset',
    description: 'Values the business assuming orderly or forced liquidation.',
    best_for: ['distressed', 'going_concern_doubt'],
  },
];

/**
 * Recommend methodologies based on business characteristics.
 * The advisor makes the final methodology decision.
 */
export function recommendMethodologies(answers) {
  const recommendations = { primary: [], secondary: [], supporting: [], excluded: [] };
  const revenue = answers?.ttm_revenue || 0;
  const ebitda = answers?.ttm_ebitda || 0;
  const hasForecast = answers?.has_forecast === true;
  const ownerHours = answers?.owner_hours_per_week || 0;

  // EBITDA multiple — default for mid-market profitable businesses
  if (ebitda > 0 && revenue > 500000) {
    recommendations.primary.push('ebitda_multiple');
  }

  // SDE multiple — for small owner-operated businesses
  if (revenue > 0 && revenue < 2000000 && ownerHours > 30) {
    recommendations.primary = ['sde_multiple'];
    recommendations.secondary.push('ebitda_multiple');
  }

  // DCF — if forecast available and growth business
  if (hasForecast) {
    recommendations.secondary.push('dcf');
  }

  // Capitalization of earnings — for stable earnings
  if (ebitda > 0 && answers?.historical_gross_margin_trend === 'stable') {
    recommendations.secondary.push('capitalization_of_earnings');
  }

  // Revenue multiple — for early stage or negative earnings
  if (ebitda <= 0 && revenue > 0) {
    recommendations.primary = ['revenue_multiple'];
  }

  // Adjusted net asset — for asset-heavy businesses
  if (answers?.owned_real_estate === true || answers?.annual_capex > 500000) {
    recommendations.supporting.push('adjusted_net_asset');
  }

  // Guideline transaction — if comparable data likely
  if (revenue > 1000000 && ebitda > 0) {
    recommendations.supporting.push('guideline_transaction');
  }

  return recommendations;
}

/**
 * Evaluate conditional logic for a question given current answers.
 * Returns true if the question should be displayed.
 *
 * Supported operators:
 *   equals, not_equals, greater_than, less_than, contains, not_contains,
 *   any_selected, all_selected, exists, not_exists,
 *   document_available, assessment_completed, industry_match,
 *   business_model_match, revenue_threshold, ebitda_threshold,
 *   valuation_purpose, standard_of_value, selected_methodology
 */
export function shouldDisplayQuestion(question, answers) {
  if (!question.conditional_logic || Object.keys(question.conditional_logic).length === 0) {
    return true;
  }
  const { field, operator, value } = question.conditional_logic;
  const answerValue = answers?.[field];
  const rawValue = answerValue?.value !== undefined ? answerValue.value : answerValue;

  switch (operator) {
    case 'equals': return rawValue === value;
    case 'not_equals': return rawValue !== value;
    case 'greater_than': return Number(rawValue) > Number(value);
    case 'less_than': return Number(rawValue) < Number(value);
    case 'contains': return String(rawValue || '').includes(String(value));
    case 'not_contains': return !String(rawValue || '').includes(String(value));
    case 'in': return Array.isArray(value) && value.includes(rawValue);
    case 'any_selected':
      return Array.isArray(rawValue) && rawValue.some(v => (Array.isArray(value) ? value : [value]).includes(v));
    case 'all_selected':
      return Array.isArray(rawValue) && (Array.isArray(value) ? value : [value]).every(v => rawValue.includes(v));
    case 'exists': return rawValue != null && rawValue !== '' && !(Array.isArray(rawValue) && rawValue.length === 0);
    case 'not_exists': return rawValue == null || rawValue === '' || (Array.isArray(rawValue) && rawValue.length === 0);
    case 'document_available':
      return answers?.__documents_available === true;
    case 'assessment_completed':
      return answers?.__assessments_completed === true;
    case 'industry_match':
      return answers?.industry === value;
    case 'business_model_match':
      return answers?.business_model === value;
    case 'revenue_threshold':
      return Number(answers?.ttm_revenue || 0) >= Number(value);
    case 'ebitda_threshold':
      return Number(answers?.ttm_ebitda || 0) >= Number(value);
    case 'valuation_purpose':
      return answers?.valuation_purpose === value;
    case 'standard_of_value':
      return answers?.standard_of_value === value;
    case 'selected_methodology':
      return answers?.__selected_methodologies?.includes(value) === true;
    default: return true;
  }
}

/**
 * Check if a previously answered question is now hidden due to conditional logic.
 * Returns true if the question has an answer but is currently hidden.
 */
export function isHiddenWithAnswer(question, answers) {
  const hasAnswer = answers?.[question.question_key] != null && answers?.[question.question_key] !== '';
  return hasAnswer && !shouldDisplayQuestion(question, answers);
}

/**
 * Calculate completion percentage, excluding hidden questions.
 * Hidden questions with preserved answers are marked inactive and do not
 * reduce the completion percentage.
 */
export function calculateCompletion(answers) {
  const activeQuestions = getActiveQuestions(answers);
  const requiredActive = activeQuestions.filter(q => q.required);
  const answeredRequired = requiredActive.filter(q => {
    const val = answers?.[q.question_key];
    return val != null && val !== '' && !(Array.isArray(val) && val.length === 0);
  });
  return {
    total: activeQuestions.length,
    required: requiredActive.length,
    answered: answeredRequired.length,
    percentage: requiredActive.length > 0 ? Math.round((answeredRequired.length / requiredActive.length) * 100) : 0,
  };
}

/**
 * Get all questions for a section, filtered by conditional logic.
 */
export function getSectionQuestions(sectionKey, answers) {
  return VALUATION_QUESTIONS
    .filter(q => q.section === sectionKey)
    .filter(q => shouldDisplayQuestion(q, answers))
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
}

/**
 * Get all active questions, filtered by conditional logic.
 */
export function getActiveQuestions(answers) {
  return VALUATION_QUESTIONS
    .filter(q => shouldDisplayQuestion(q, answers))
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
}