/**
 * intelligenceMapping.ts — Phase 13.3E.2
 *
 * Extraction-to-valuation mapping registry, field-specific source priority
 * rules, and add-back candidate detection rules.
 *
 * This is the single source of truth for how raw platform data maps to
 * valuation intelligence candidates. UI components and backend services
 * both import from here — never hard-code mappings inside components.
 *
 * Pure data + resolver functions. No I/O.
 */

// ============================================================================
// SOURCE TYPES (allowlisted — no dynamic source execution)
// ============================================================================
export const SOURCE_TYPES = [
  'business_record',
  'profile_record',
  'ownership_record',
  'document',
  'extracted_field',
  'document_analysis',
  'assessment_answer',
  'assessment_calculation',
  'dashboard_metric',
  'gap_analysis',
  'financial_normalization',
  'prior_valuation_answer',
  'prior_published_version',
  'advisor_entry',
  'client_confirmation',
  'system_derived',
] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];

// ============================================================================
// FIELD CATEGORIES (Business Snapshot groups)
// ============================================================================
export const SNAPSHOT_CATEGORIES = [
  { key: 'business_identity', label: 'Business Identity', order: 1 },
  { key: 'financial_performance', label: 'Financial Performance', order: 2 },
  { key: 'balance_sheet_cash_flow', label: 'Balance Sheet & Cash Flow', order: 3 },
  { key: 'commercial_quality', label: 'Commercial Quality', order: 4 },
  { key: 'organization_transferability', label: 'Organization & Transferability', order: 5 },
  { key: 'risk', label: 'Risk', order: 6 },
] as const;

// ============================================================================
// RESOLVER HELPERS
// Each resolver reads from a loaded `ctx` and returns a candidate or null.
// Resolvers are pure — they only read, never write.
// ============================================================================

export interface ResolverResult {
  value: any;
  formatted?: string;
  source_type: SourceType;
  source_id?: string;
  source_name: string;
  source_date?: string;
  confidence: number; // 0-100
  reporting_period?: string;
}

export interface IntelligenceContext {
  business: any;
  owners: any[];
  profile: any;
  documents: any[];
  extractedFields: any[];
  documentAnalyses: any[];
  assessments: any[]; // Base44 Assessment entity list
  businessAssessments: any[]; // Supabase business_assessments
  dashboardMetrics: any;
  gapAnalyses: any[];
  valuationAnswers: any[];
  valuationFinancials: any[];
  valuationAdjustments: any[];
  valuationVersions: any[];
  valuationQuestions: any[];
  profileFinancials: any;
}

// ── Dashboard metric resolver ──────────────────────────────────────────────
const fromDashboardMetric = (key: string, label = 'Dashboard Metrics') =>
  (ctx: IntelligenceContext): ResolverResult | null => {
    const dm = ctx.dashboardMetrics;
    if (!dm || dm[key] == null || dm[key] === '') return null;
    return {
      value: dm[key],
      source_type: 'dashboard_metric',
      source_name: label,
      source_date: dm.updated_at || dm.created_at,
      confidence: 70,
    };
  };

// ── Extracted field resolver (first match by field name) ──────────────────
const fromExtractedField = (fieldNames: string[], docTypes?: string[]) =>
  (ctx: IntelligenceContext): ResolverResult | null => {
    const fields = (ctx.extractedFields || []).filter((f) => {
      if (!fieldNames.includes(f.field_name)) return false;
      if (docTypes && f.source_document_type && !docTypes.includes(f.source_document_type)) return false;
      return true;
    });
    if (fields.length === 0) return null;
    // Prefer accepted over pending_review, then highest confidence
    const sorted = [...fields].sort((a, b) => {
      const ra = a.review_status === 'accepted' ? 1 : 0;
      const rb = b.review_status === 'accepted' ? 1 : 0;
      if (ra !== rb) return rb - ra;
      return Number(b.confidence_score || 0) - Number(a.confidence_score || 0);
    });
    const f = sorted[0];
    const num = typeof f.normalized_value === 'number'
      ? f.normalized_value
      : parseFloat(String(f.field_value || '').replace(/[^0-9.\-]/g, ''));
    return {
      value: isNaN(num) ? f.field_value : num,
      source_type: 'extracted_field',
      source_id: f.id,
      source_name: `Document: ${f.field_label || f.field_name}`,
      source_date: f.created_at,
      confidence: Math.min(95, Number(f.confidence_score || 70)),
      reporting_period: f.metadata?.period || f.metadata?.fiscal_year || undefined,
    };
  };

// ── Business entity resolver ──────────────────────────────────────────────
const fromBusinessEntity = (key: string, label: string) =>
  (ctx: IntelligenceContext): ResolverResult | null => {
    const b = ctx.business;
    if (!b || b[key] == null || b[key] === '') return null;
    return {
      value: b[key],
      source_type: 'business_record',
      source_id: b.id,
      source_name: `Business Record: ${label}`,
      confidence: 80,
    };
  };

// ── Profile financials resolver ────────────────────────────────────────────
const fromProfileFinancials = (key: string, label: string) =>
  (ctx: IntelligenceContext): ResolverResult | null => {
    const pf = ctx.profileFinancials;
    if (!pf || pf[key] == null || pf[key] === '') return null;
    return {
      value: pf[key],
      source_type: 'profile_record',
      source_name: `Profile Financials: ${label}`,
      source_date: pf.updated_at,
      confidence: 65,
    };
  };

// ── Base44 Assessment answer resolver ──────────────────────────────────────
const fromAssessment = (assessmentType: string, answerKeys: string[]) =>
  (ctx: IntelligenceContext): ResolverResult | null => {
    const a = (ctx.assessments || []).find((x) => x.assessment_type === assessmentType && x.status === 'completed');
    if (!a) return null;
    const ans = a.answers || {};
    const res = a.results || {};
    for (const k of answerKeys) {
      if (ans[k] != null && ans[k] !== '') {
        return {
          value: ans[k],
          source_type: 'assessment_answer',
          source_id: a.id,
          source_name: `Assessment: ${assessmentType.replace(/_/g, ' ')}`,
          source_date: a.completed_at || a.updated_date,
          confidence: 72,
        };
      }
      if (res[k] != null && res[k] !== '') {
        return {
          value: res[k],
          source_type: 'assessment_calculation',
          source_id: a.id,
          source_name: `Assessment Result: ${assessmentType.replace(/_/g, ' ')}`,
          source_date: a.completed_at || a.updated_date,
          confidence: 75,
        };
      }
    }
    return null;
  };

// ── Supabase business_assessments resolver ─────────────────────────────────
const fromBusinessAssessment = (assessmentType: string, answerKeys: string[]) =>
  (ctx: IntelligenceContext): ResolverResult | null => {
    const a = (ctx.businessAssessments || []).find((x) => x.assessment_type === assessmentType);
    if (!a) return null;
    const ans = a.answers || {};
    const res = a.results || {};
    for (const k of answerKeys) {
      if (ans[k] != null && ans[k] !== '') {
        return { value: ans[k], source_type: 'assessment_answer', source_id: a.id, source_name: `Assessment: ${assessmentType}`, source_date: a.updated_at, confidence: 70 };
      }
      if (res[k] != null && res[k] !== '') {
        return { value: res[k], source_type: 'assessment_calculation', source_id: a.id, source_name: `Assessment Result: ${assessmentType}`, source_date: a.updated_at, confidence: 73 };
      }
    }
    return null;
  };

// ── Existing valuation answer resolver ─────────────────────────────────────
const fromValuationAnswer = (questionKey: string) =>
  (ctx: IntelligenceContext): ResolverResult | null => {
    const q = (ctx.valuationQuestions || []).find((x) => x.question_key === questionKey);
    if (!q) return null;
    const a = (ctx.valuationAnswers || []).find((x) => x.question_id === q.id);
    if (!a || a.answer_value == null || a.answer_value === '') return null;
    const isAdvisor = a.source_type === 'advisor_entry';
    const isVerified = a.advisor_verification_status === 'verified' || a.is_confirmed;
    return {
      value: a.answer_value,
      source_type: isAdvisor ? 'advisor_entry' : 'prior_valuation_answer',
      source_id: a.id,
      source_name: isAdvisor ? 'Advisor Entry' : 'Prior Valuation Answer',
      source_date: a.answered_at,
      confidence: isVerified ? 95 : isAdvisor ? 85 : 60,
    };
  };

// ── Valuation financial resolver ───────────────────────────────────────────
const fromValuationFinancial = (field: string) =>
  (ctx: IntelligenceContext): ResolverResult | null => {
    // Most recent approved financial
    const fins = (ctx.valuationFinancials || [])
      .filter((f) => f[field] != null && f[field] !== '')
      .sort((a, b) => (b.period_end_date || '').localeCompare(a.period_end_date || ''));
    if (fins.length === 0) return null;
    const f = fins[0];
    const isApproved = f.advisor_approval_status === 'approved';
    return {
      value: f[field],
      source_type: 'financial_normalization',
      source_id: f.id,
      source_name: `Valuation Financial: ${f.period_label || 'Current Period'}`,
      source_date: f.updated_at || f.period_end_date,
      confidence: isApproved ? 92 : 55,
      reporting_period: f.period_label || f.fiscal_year?.toString(),
    };
  };

// ── System-derived resolver (passes a derive function) ─────────────────────
const derived = (fn: (ctx: IntelligenceContext) => any, sourceName: string, confidence = 60) =>
  (ctx: IntelligenceContext): ResolverResult | null => {
    const v = fn(ctx);
    if (v == null || (typeof v === 'number' && isNaN(v))) return null;
    return { value: v, source_type: 'system_derived', source_name: sourceName, confidence };
  };

// ============================================================================
// FIELD REGISTRY
// Each field defines: key, display_name, category, answer_type, question_key,
// valuation_relevance, resolvers (priority-ordered), missing_guidance.
// ============================================================================

export interface FieldDef {
  field_key: string;
  display_name: string;
  category: string;
  answer_type: string;
  question_key?: string;
  valuation_relevance?: string;
  resolvers: ((ctx: IntelligenceContext) => ResolverResult | null)[];
  missing_guidance: { why_it_matters: string; best_source: string };
  materiality_threshold?: number; // for conflict detection
}

export const FIELD_REGISTRY: FieldDef[] = [
  // ── Business Identity ────────────────────────────────────────────────────
  {
    field_key: 'legal_name',
    display_name: 'Legal Name',
    category: 'business_identity',
    answer_type: 'text',
    resolvers: [fromBusinessEntity('business_name', 'Legal Name')],
    missing_guidance: { why_it_matters: 'Required for engagement letter and valuation report.', best_source: 'Business entity record or operating agreement' },
  },
  {
    field_key: 'entity_type',
    display_name: 'Entity Type',
    category: 'business_identity',
    answer_type: 'single_select',
    question_key: 'legal_entity_type',
    valuation_relevance: 'transferability',
    resolvers: [fromBusinessEntity('entity_type', 'Entity Type'), fromBusinessEntity('business_family_type', 'Business Family')],
    missing_guidance: { why_it_matters: 'Determines tax structure and transaction structure.', best_source: 'Filed tax return or operating agreement' },
  },
  {
    field_key: 'industry',
    display_name: 'Industry',
    category: 'business_identity',
    answer_type: 'text',
    resolvers: [fromBusinessEntity('industry', 'Industry')],
    missing_guidance: { why_it_matters: 'Drives benchmark selection and multiple range.', best_source: 'Business entity record' },
  },
  {
    field_key: 'business_description',
    display_name: 'Business Description',
    category: 'business_identity',
    answer_type: 'textarea',
    question_key: 'business_description',
    valuation_relevance: 'context',
    resolvers: [fromBusinessEntity('description', 'Description')],
    missing_guidance: { why_it_matters: 'Context for buyer universe and strategic value.', best_source: 'Advisor interview or business record' },
  },
  {
    field_key: 'ownership_structure',
    display_name: 'Ownership Structure',
    category: 'business_identity',
    answer_type: 'textarea',
    question_key: 'ownership_structure',
    valuation_relevance: 'transferability',
    resolvers: [],
    missing_guidance: { why_it_matters: 'Affects premise of value and minority discounts.', best_source: 'Operating agreement or cap table' },
  },

  // ── Financial Performance ───────────────────────────────────────────────
  {
    field_key: 'ttm_revenue',
    display_name: 'TTM Revenue',
    category: 'financial_performance',
    answer_type: 'currency',
    question_key: 'ttm_revenue',
    valuation_relevance: 'enterprise_value',
    materiality_threshold: 0.05,
    resolvers: [
      fromValuationFinancial('revenue'),
      fromExtractedField(['annual_revenue', 'gross_receipts', 'total_revenue', 'gross_revenue'], ['profit_and_loss', 'business_tax_return']),
      fromDashboardMetric('annual_revenue', 'Annual Revenue'),
      fromProfileFinancials('annual_revenue', 'Annual Revenue'),
      fromBusinessAssessment('profit_gap', ['p1_rev', 'revenue']),
      fromAssessment('profit_gap', ['p1_rev', 'revenue']),
    ],
    missing_guidance: { why_it_matters: 'Primary input to revenue and EBITDA multiples.', best_source: 'Most recent P&L or tax return' },
  },
  {
    field_key: 'ttm_ebitda',
    display_name: 'TTM EBITDA',
    category: 'financial_performance',
    answer_type: 'currency',
    question_key: 'ttm_ebitda',
    valuation_relevance: 'enterprise_value',
    materiality_threshold: 0.05,
    resolvers: [
      fromValuationFinancial('ebitda'),
      fromDashboardMetric('recast_ebitda', 'Recast EBITDA'),
      fromDashboardMetric('current_ebitda', 'Current EBITDA'),
      fromExtractedField(['ebitda', 'recast_ebitda', 'normalized_ebitda', 'adjusted_ebitda']),
      fromBusinessAssessment('recast_ebitda', ['rc_ebitda', 'ebitda']),
      fromAssessment('recast_ebitda', ['rc_ebitda', 'ebitda']),
      fromAssessment('value_gap', ['v2_ebitda', 'ebitda']),
    ],
    missing_guidance: { why_it_matters: 'Primary driver of enterprise value under the EBITDA multiple method.', best_source: 'Recast EBITDA assessment or normalized P&L' },
  },
  {
    field_key: 'gross_profit',
    display_name: 'Gross Profit',
    category: 'financial_performance',
    answer_type: 'currency',
    resolvers: [fromExtractedField(['gross_profit', 'gross_income'])],
    missing_guidance: { why_it_matters: 'Enables gross margin analysis.', best_source: 'P&L statement' },
  },
  {
    field_key: 'gross_margin_percentage',
    display_name: 'Gross Margin %',
    category: 'financial_performance',
    answer_type: 'percentage',
    question_key: 'gross_margin_percentage',
    valuation_relevance: 'profitability',
    resolvers: [
      derived((ctx) => {
        const rev = fromExtractedField(['annual_revenue', 'gross_receipts'])?.value;
        const gp = fromExtractedField(['gross_profit', 'gross_income'])?.value;
        if (rev && gp && rev > 0) return Math.round((gp / rev) * 1000) / 10;
        return null;
      }, 'Derived from P&L', 55),
    ],
    missing_guidance: { why_it_matters: 'Profitability benchmark vs industry.', best_source: 'P&L statement' },
  },
  {
    field_key: 'net_income',
    display_name: 'Net Income',
    category: 'financial_performance',
    answer_type: 'currency',
    resolvers: [
      fromDashboardMetric('net_profit', 'Net Profit'),
      fromExtractedField(['net_profit', 'net_income', 'profit']),
      fromProfileFinancials('net_profit', 'Net Profit'),
      // 6D.1A GATE 6A — `taxable_income` was removed here for the same reason it was
      // removed from the canonical registry: a return's TAXABLE income is a tax
      // result, not the accounting net income this field asks for. The field is still
      // extracted and still available as evidence; it simply no longer answers a
      // net-income question.
      fromExtractedField(['ordinary_business_income'], ['business_tax_return']),
    ],
    missing_guidance: { why_it_matters: 'Used in capitalization of earnings.', best_source: 'P&L or tax return' },
  },
  {
    field_key: 'owner_compensation_actual',
    display_name: 'Owner Compensation (Actual)',
    category: 'financial_performance',
    answer_type: 'currency',
    question_key: 'owner_compensation_actual',
    valuation_relevance: 'profitability',
    materiality_threshold: 0.1,
    resolvers: [
      fromValuationFinancial('owner_compensation'),
      fromExtractedField(['owner_compensation', 'officer_compensation', 'owner_payroll'], ['profit_and_loss', 'business_tax_return', 'payroll_report']),
      fromBusinessAssessment('recast_ebitda', ['owner_comp', 'owner_compensation']),
      fromAssessment('recast_ebitda', ['owner_comp', 'owner_compensation']),
    ],
    missing_guidance: { why_it_matters: 'Core recast adjustment to normalized earnings.', best_source: 'Payroll report or tax return' },
  },
  {
    field_key: 'historical_growth_rate',
    display_name: '3-Year Revenue CAGR',
    category: 'financial_performance',
    answer_type: 'percentage',
    question_key: 'historical_growth_rate',
    valuation_relevance: 'growth',
    resolvers: [
      fromAssessment('profit_gap', ['growth_rate', 'cagr']),
      fromBusinessAssessment('profit_gap', ['growth_rate', 'cagr']),
    ],
    missing_guidance: { why_it_matters: 'Trend input for DCF and multiple selection.', best_source: '3 years of P&L or tax returns' },
  },
  {
    field_key: 'annual_capex',
    display_name: 'Annual CapEx',
    category: 'financial_performance',
    answer_type: 'currency',
    question_key: 'annual_capex',
    valuation_relevance: 'enterprise_value',
    resolvers: [],
    missing_guidance: { why_it_matters: 'Required for DCF and maintenance-capex normalization.', best_source: 'P&L or fixed-asset schedule' },
  },

  // ── Balance Sheet & Cash Flow ────────────────────────────────────────────
  {
    field_key: 'cash',
    display_name: 'Cash',
    category: 'balance_sheet_cash_flow',
    answer_type: 'currency',
    resolvers: [fromExtractedField(['cash_on_hand', 'cash'], ['balance_sheet'])],
    missing_guidance: { why_it_matters: 'Equity bridge component.', best_source: 'Balance sheet' },
  },
  {
    field_key: 'total_debt',
    display_name: 'Total Debt',
    category: 'balance_sheet_cash_flow',
    answer_type: 'currency',
    materiality_threshold: 0.1,
    resolvers: [
      fromExtractedField(['total_debt', 'loan_balance'], ['balance_sheet', 'debt_schedule']),
    ],
    missing_guidance: { why_it_matters: 'Equity bridge component — subtracted from enterprise value.', best_source: 'Balance sheet or debt schedule' },
  },
  {
    field_key: 'total_assets',
    display_name: 'Total Assets',
    category: 'balance_sheet_cash_flow',
    answer_type: 'currency',
    resolvers: [fromExtractedField(['total_assets'], ['balance_sheet'])],
    missing_guidance: { why_it_matters: 'Asset approach reference.', best_source: 'Balance sheet' },
  },
  {
    field_key: 'total_liabilities',
    display_name: 'Total Liabilities',
    category: 'balance_sheet_cash_flow',
    answer_type: 'currency',
    resolvers: [fromExtractedField(['total_liabilities'], ['balance_sheet'])],
    missing_guidance: { why_it_matters: 'Equity bridge reference.', best_source: 'Balance sheet' },
  },
  {
    field_key: 'working_capital_balance',
    display_name: 'Working Capital',
    category: 'balance_sheet_cash_flow',
    answer_type: 'currency',
    question_key: 'working_capital_balance',
    valuation_relevance: 'enterprise_value',
    resolvers: [],
    missing_guidance: { why_it_matters: 'Cash-conversion quality signal.', best_source: 'Balance sheet' },
  },

  // ── Commercial Quality ──────────────────────────────────────────────────
  {
    field_key: 'recurring_revenue_percentage',
    display_name: 'Recurring Revenue %',
    category: 'commercial_quality',
    answer_type: 'percentage',
    question_key: 'recurring_revenue_percentage',
    valuation_relevance: 'multiple',
    resolvers: [fromAssessment('value_gap', ['recurring_revenue', 'recurring_pct']), fromBusinessAssessment('value_gap', ['recurring_revenue', 'recurring_pct'])],
    missing_guidance: { why_it_matters: 'Materially impacts multiple premium.', best_source: 'Customer contracts or CRM' },
  },
  {
    field_key: 'revenue_concentration_top_customer',
    display_name: 'Top Customer %',
    category: 'commercial_quality',
    answer_type: 'percentage',
    question_key: 'revenue_concentration_top_customer',
    valuation_relevance: 'risk',
    resolvers: [fromAssessment('value_gap', ['top_customer_pct', 'top_customer']), fromBusinessAssessment('value_gap', ['top_customer_pct', 'top_customer'])],
    missing_guidance: { why_it_matters: 'Customer concentration risk discount.', best_source: 'Customer-level revenue report' },
  },
  {
    field_key: 'customer_retention_rate',
    display_name: 'Customer Retention',
    category: 'commercial_quality',
    answer_type: 'percentage',
    question_key: 'customer_retention_rate',
    valuation_relevance: 'multiple',
    resolvers: [fromAssessment('value_gap', ['retention_rate', 'customer_retention']), fromBusinessAssessment('value_gap', ['retention_rate', 'customer_retention'])],
    missing_guidance: { why_it_matters: 'Recurring revenue quality signal.', best_source: 'CRM or customer report' },
  },
  {
    field_key: 'customer_count',
    display_name: 'Active Customers',
    category: 'commercial_quality',
    answer_type: 'number',
    question_key: 'customer_count',
    valuation_relevance: 'risk',
    resolvers: [fromAssessment('value_gap', ['customer_count', 'active_customers']), fromBusinessAssessment('value_gap', ['customer_count', 'active_customers'])],
    missing_guidance: { why_it_matters: 'Concentration context.', best_source: 'CRM export' },
  },

  // ── Organization & Transferability ──────────────────────────────────────
  {
    field_key: 'employee_count',
    display_name: 'Employee Count (FTE)',
    category: 'organization_transferability',
    answer_type: 'number',
    question_key: 'employee_count',
    valuation_relevance: 'context',
    resolvers: [
      fromExtractedField(['employee_count'], ['payroll_report']),
      fromAssessment('operations_gap', ['employee_count', 'fte_count']),
      fromBusinessAssessment('operations_gap', ['employee_count', 'fte_count']),
    ],
    missing_guidance: { why_it_matters: 'Operational scale and owner-dependency context.', best_source: 'Payroll report' },
  },
  {
    field_key: 'owner_hours_per_week',
    display_name: 'Owner Hours/Week',
    category: 'organization_transferability',
    answer_type: 'number',
    question_key: 'owner_hours_per_week',
    valuation_relevance: 'transferability',
    resolvers: [fromAssessment('freedom_assessment', ['owner_hours', 'hours_per_week']), fromBusinessAssessment('freedom_assessment', ['owner_hours', 'hours_per_week'])],
    missing_guidance: { why_it_matters: 'Owner-dependency and transferability signal.', best_source: 'Freedom Assessment' },
  },
  {
    field_key: 'succession_plan_exists',
    display_name: 'Succession Plan',
    category: 'organization_transferability',
    answer_type: 'boolean',
    question_key: 'succession_plan_exists',
    valuation_relevance: 'owner_readiness',
    resolvers: [fromAssessment('operations_gap', ['succession_plan']), fromBusinessAssessment('operations_gap', ['succession_plan'])],
    missing_guidance: { why_it_matters: 'Transferability and buyer risk signal.', best_source: 'Operations Assessment' },
  },
  {
    field_key: 'documented_sops',
    display_name: 'Documented SOPs',
    category: 'organization_transferability',
    answer_type: 'single_select',
    question_key: 'documented_sops',
    valuation_relevance: 'transferability',
    resolvers: [fromAssessment('operations_gap', ['sops', 'documented_sops']), fromBusinessAssessment('operations_gap', ['sops', 'documented_sops'])],
    missing_guidance: { why_it_matters: 'Operational maturity and transferability.', best_source: 'Operations Assessment' },
  },

  // ── Risk ─────────────────────────────────────────────────────────────────
  {
    field_key: 'pending_litigation',
    display_name: 'Pending Litigation',
    category: 'risk',
    answer_type: 'boolean',
    question_key: 'pending_litigation',
    valuation_relevance: 'risk',
    resolvers: [],
    missing_guidance: { why_it_matters: 'Material risk discount.', best_source: 'Advisor interview or legal review' },
  },
  {
    field_key: 'tax_filing_status',
    display_name: 'Tax Filings Current',
    category: 'risk',
    answer_type: 'boolean',
    question_key: 'tax_filing_status',
    valuation_relevance: 'risk',
    resolvers: [],
    missing_guidance: { why_it_matters: 'Compliance and buyer diligence risk.', best_source: 'Tax return or CPA confirmation' },
  },
  {
    field_key: 'cybersecurity_measures',
    display_name: 'Cybersecurity Measures',
    category: 'risk',
    answer_type: 'boolean',
    question_key: 'cybersecurity_measures',
    valuation_relevance: 'risk',
    resolvers: [],
    missing_guidance: { why_it_matters: 'Increasingly material buyer diligence item.', best_source: 'IT review or advisor interview' },
  },
];

// ============================================================================
// ADD-BACK CANDIDATE DETECTION RULES
// ============================================================================
export interface AddBackRule {
  category: string;
  label: string;
  description: string;
  // Match against extracted field names or general-ledger-like signals
  match_fields: string[];
  why_qualifies: string;
  buyer_defensibility_warning: string;
  replacement_cost_consideration: string;
}

export const ADD_BACK_RULES: AddBackRule[] = [
  { category: 'personal_vehicle', label: 'Personal Vehicle Expense', description: 'Vehicle expenses that may include personal use.', match_fields: ['vehicle_expense', 'auto_expense', 'vehicle'], why_qualifies: 'Personal-use portion is non-operating.', buyer_defensibility_warning: 'Buyers require mileage logs to accept.', replacement_cost_consideration: 'Replacement vehicle allowance may be needed.' },
  { category: 'personal_travel', label: 'Personal Travel', description: 'Travel expenses with potential personal component.', match_fields: ['travel', 'travel_meals', 'meals'], why_qualifies: 'Non-business portion is non-operating.', buyer_defensibility_warning: 'Buyers scrutinize discretionary travel.', replacement_cost_consideration: 'None if fully personal.' },
  { category: 'family_payroll', label: 'Family Payroll', description: 'Wages paid to family members not active in the business.', match_fields: ['family_wages', 'wages'], why_qualifies: 'Above-market or non-working family wages are non-operating.', buyer_defensibility_warning: 'Buyers verify family member roles.', replacement_cost_consideration: 'Replacement cost for any legitimate role.' },
  { category: 'excess_owner_compensation', label: 'Excess Owner Compensation', description: 'Owner pay above market replacement rate.', match_fields: ['owner_compensation', 'officer_compensation', 'owner_payroll'], why_qualifies: 'Above-market portion is non-operating.', buyer_defensibility_warning: 'Buyers benchmark against market rate.', replacement_cost_consideration: 'Market-rate replacement compensation must remain.' },
  { category: 'one_time_legal', label: 'One-Time Legal Expense', description: 'Non-recurring legal costs.', match_fields: ['legal', 'legal_fees', 'litigation'], why_qualifies: 'Non-recurring.', buyer_defensibility_warning: 'Buyers require matter-level detail.', replacement_cost_consideration: 'None if truly one-time.' },
  { category: 'one_time_consulting', label: 'One-Time Consulting', description: 'Non-recurring consulting fees.', match_fields: ['consulting', 'professional_fees'], why_qualifies: 'Non-recurring.', buyer_defensibility_warning: 'Buyers verify non-recurring nature.', replacement_cost_consideration: 'None if truly one-time.' },
  { category: 'related_party_rent', label: 'Related-Party Rent', description: 'Rent paid to a related entity above/below market.', match_fields: ['rent', 'occupancy', 'rent_expense'], why_qualifies: 'Above/below market rent is non-operating.', buyer_defensibility_warning: 'Buyers require market rent confirmation.', replacement_cost_consideration: 'Market rent must remain.' },
  { category: 'charitable_contributions', label: 'Charitable Contributions', description: 'Discretionary contributions.', match_fields: ['charitable', 'donations', 'contributions'], why_qualifies: 'Discretionary, non-operating.', buyer_defensibility_warning: 'Buyers treat as non-recurring.', replacement_cost_consideration: 'None.' },
  { category: 'nonrecurring_relocation', label: 'Relocation Expense', description: 'One-time relocation costs.', match_fields: ['relocation', 'moving'], why_qualifies: 'Non-recurring.', buyer_defensibility_warning: 'Buyers verify one-time nature.', replacement_cost_consideration: 'None.' },
  { category: 'extraordinary_repairs', label: 'Extraordinary Repairs', description: 'Unusually large repair costs.', match_fields: ['repairs', 'maintenance'], why_qualifies: 'May be non-recurring.', buyer_defensibility_warning: 'Buyers require 3-year context.', replacement_cost_consideration: 'Ongoing maintenance must remain.' },
];

// ============================================================================
// DOCUMENT CATEGORY DEFINITIONS
// ============================================================================
export const DOCUMENT_CATEGORIES = [
  { key: 'tax_return', label: 'Tax Returns', doc_types: ['business_tax_return', 'personal_tax_return', 'tax_return'] },
  { key: 'profit_loss', label: 'Profit & Loss', doc_types: ['profit_and_loss', 'profit_loss'] },
  { key: 'balance_sheet', label: 'Balance Sheet', doc_types: ['balance_sheet'] },
  { key: 'general_ledger', label: 'General Ledger', doc_types: ['general_ledger'] },
  { key: 'payroll', label: 'Payroll', doc_types: ['payroll_report', 'payroll'] },
  { key: 'customer_reports', label: 'Customer Reports', doc_types: ['customer_report', 'ar_aging'] },
  { key: 'ar_aging', label: 'AR Aging', doc_types: ['ar_aging'] },
  { key: 'ap_aging', label: 'AP Aging', doc_types: ['ap_aging'] },
  { key: 'debt_statements', label: 'Debt Statements', doc_types: ['debt_schedule', 'debt_statement'] },
  { key: 'bank_statements', label: 'Bank Statements', doc_types: ['bank_statement'] },
  { key: 'forecast', label: 'Forecast', doc_types: ['forecast', 'budget'] },
  { key: 'org_chart', label: 'Org Chart', doc_types: ['org_chart'] },
  { key: 'customer_contracts', label: 'Customer Contracts', doc_types: ['customer_contract'] },
  { key: 'vendor_contracts', label: 'Vendor Contracts', doc_types: ['vendor_contract'] },
  { key: 'operating_agreement', label: 'Operating Agreement', doc_types: ['operating_agreement'] },
  { key: 'employee_roster', label: 'Employee Roster', doc_types: ['employee_roster'] },
  { key: 'sops', label: 'SOPs', doc_types: ['sop', 'sops'] },
  { key: 'insurance', label: 'Insurance', doc_types: ['insurance'] },
  { key: 'legal_documents', label: 'Legal Documents', doc_types: ['legal', 'legal_document'] },
] as const;

// ============================================================================
// ASSESSMENT DEFINITIONS
// ============================================================================
export const ASSESSMENT_DEFINITIONS = [
  { key: 'profit_gap', label: 'Profit Gap', entity_type: 'profit_gap' },
  { key: 'value_gap', label: 'Value Gap', entity_type: 'value_gap' },
  { key: 'recast_ebitda', label: 'Recast EBITDA', entity_type: 'recast_ebitda' },
  { key: 'tax_gap', label: 'Tax Gap', entity_type: 'tax_gap' },
  { key: 'operations_gap', label: 'Operations Gap', entity_type: 'operations_gap' },
  { key: 'freedom_assessment', label: 'Freedom Assessment', entity_type: 'freedom_assessment' },
] as const;