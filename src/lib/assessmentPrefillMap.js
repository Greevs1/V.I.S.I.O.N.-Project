/**
 * assessmentPrefillMap.js
 *
 * Defines the mapping between document-extracted fields and assessment inputs.
 * Used by useAssessmentPrefill hook to suggest pre-filled values in Journey mode.
 *
 * Each entry specifies:
 *   - assessment_key: which assessment this field belongs to
 *   - field_key:      the AssessmentContext state key to populate
 *   - extracted_keys: keys from extracted_fields / state_snapshot to check
 *   - transform:      optional function to calculate from extracted value
 *   - label:          human-readable label for the field
 *   - source_label:   "Suggested from your [document type]"
 *   - confidence_min: minimum confidence score (0-100) to accept
 */

export const PREFILL_MAP = [
  // ── Profit Gap ─────────────────────────────────────────────────────────────
  {
    assessment_key: 'profit_gap',
    field_key: 'p1_rev',
    label: 'Annual Revenue',
    extracted_keys: ['total_revenue', 'gross_receipts', 'annual_revenue', 'revenue'],
    source_label: 'Suggested from your P&L or tax return',
    confidence_min: 50,
    transform: (v) => Math.round(Number(v)),
  },
  {
    assessment_key: 'profit_gap',
    field_key: 'p1_mymargin',
    label: 'Net Profit Margin',
    extracted_keys: ['net_profit_margin', 'profit_margin'],
    source_label: 'Suggested from your P&L',
    confidence_min: 50,
    transform: (v) => parseFloat(Number(v).toFixed(1)),
  },
  {
    assessment_key: 'profit_gap',
    field_key: 'p1_mymargin',
    label: 'Net Profit Margin',
    // Calculated from net_income / revenue when margin not directly available
    extracted_keys: ['__calculated_margin'],
    source_label: 'Calculated from net income ÷ revenue in your documents',
    confidence_min: 40,
    transform: (v) => parseFloat(Number(v).toFixed(1)),
  },

  // ── Value Gap ───────────────────────────────────────────────────────────────
  {
    assessment_key: 'value_gap',
    field_key: 'v2_ebitda',
    label: 'EBITDA',
    extracted_keys: ['ebitda', 'sde', 'net_income', 'ordinary_business_income'],
    source_label: 'Suggested from your P&L or tax return',
    confidence_min: 50,
    transform: (v) => Math.round(Number(v)),
  },
  {
    assessment_key: 'value_gap',
    field_key: 'p1_rev',
    label: 'Annual Revenue',
    extracted_keys: ['total_revenue', 'gross_receipts', 'annual_revenue', 'revenue'],
    source_label: 'Suggested from your documents',
    confidence_min: 50,
    transform: (v) => Math.round(Number(v)),
  },

  // ── Recast EBITDA ───────────────────────────────────────────────────────────
  {
    assessment_key: 'recast_ebitda',
    field_key: 'rc_ebitda',
    label: 'Reported EBITDA',
    extracted_keys: ['ebitda', 'net_income', 'ordinary_business_income'],
    source_label: 'Suggested from your P&L or tax return',
    confidence_min: 50,
    transform: (v) => Math.round(Number(v)),
  },
  {
    assessment_key: 'recast_ebitda',
    field_key: 'rc_addbacks.owner_comp',
    label: 'Owner Compensation Add-back',
    extracted_keys: ['officer_compensation', 'owner_salary', 'owner_compensation'],
    source_label: 'Suggested from your payroll data or tax return',
    confidence_min: 50,
    transform: (v) => Math.round(Number(v)),
  },
  {
    assessment_key: 'recast_ebitda',
    field_key: 'rc_addbacks.da',
    label: 'Depreciation & Amortization',
    extracted_keys: ['depreciation', 'depreciation_amortization', 'da'],
    source_label: 'Suggested from your tax return or P&L',
    confidence_min: 50,
    transform: (v) => Math.round(Number(v)),
  },
  {
    assessment_key: 'recast_ebitda',
    field_key: 'rc_addbacks.interest',
    label: 'Interest Expense',
    extracted_keys: ['interest_expense', 'interest'],
    source_label: 'Suggested from your P&L or debt schedule',
    confidence_min: 50,
    transform: (v) => Math.round(Number(v)),
  },

  // ── Tax Gap ─────────────────────────────────────────────────────────────────
  {
    assessment_key: 'tax_gap',
    field_key: 't3_agi',
    label: 'Adjusted Gross Income (AGI)',
    extracted_keys: ['adjusted_gross_income', 'agi', 'total_income'],
    source_label: 'Suggested from your personal tax return',
    confidence_min: 60,
    transform: (v) => Math.round(Number(v)),
  },
  {
    assessment_key: 'tax_gap',
    field_key: 't3_entity',
    label: 'Entity Type',
    extracted_keys: ['entity_type', 'business_entity_type'],
    source_label: 'Suggested from your business tax return',
    confidence_min: 60,
    transform: (v) => String(v).toLowerCase().replace(/\s+/g, '_'),
  },

  // ── Operations Gap ──────────────────────────────────────────────────────────
  {
    assessment_key: 'operations_gap',
    field_key: 'o4_hrs',
    label: 'Owner Hours per Week',
    extracted_keys: ['owner_hours_per_week', 'owner_hours'],
    source_label: 'Suggested from your profile',
    confidence_min: 40,
    transform: (v) => Math.round(Number(v)),
  },
  {
    assessment_key: 'operations_gap',
    field_key: 'o4_takehome',
    label: 'Monthly Take-Home Pay',
    extracted_keys: ['monthly_owner_income', 'owner_monthly_income', 'owner_draw'],
    source_label: 'Suggested from your payroll or tax return',
    confidence_min: 50,
    transform: (v) => Math.round(Number(v)),
  },

  // ── Freedom Assessment ──────────────────────────────────────────────────────
  {
    assessment_key: 'freedom_assessment',
    field_key: 'f_household_expenses',
    label: 'Monthly Household Expenses',
    extracted_keys: ['monthly_household_expenses', 'monthly_personal_expenses'],
    source_label: 'Suggested from your personal financial statement',
    confidence_min: 40,
    transform: (v) => Math.round(Number(v)),
  },
  {
    assessment_key: 'freedom_assessment',
    field_key: 'f_net_worth',
    label: 'Estimated Net Worth',
    extracted_keys: ['net_worth', 'total_net_worth', 'investable_assets'],
    source_label: 'Suggested from your balance sheet',
    confidence_min: 40,
    transform: (v) => Math.round(Number(v)),
  },
];

/**
 * Galileo help bubble copy for each assessment field.
 * Shown in Journey mode only when showGalileoHelp=true.
 */
export const GALILEO_HELP = {
  // Profit Gap
  p1_rev: {
    title: 'Annual Revenue',
    body: "This is your total business income before expenses. You'll find it at the top of your P&L, income statement, or on your business tax return as gross receipts.",
    estimate: "If you're unsure, use your best annual estimate — even a rough number helps.",
    prefill_note: "If you uploaded a P&L or tax return, I may have found this already.",
  },
  p1_mymargin: {
    title: 'Net Profit Margin',
    body: "This shows how much profit remains after all expenses. Divide net income by revenue to get this number. For example: $200K net income ÷ $1M revenue = 20% margin.",
    estimate: "Most small businesses run 5–25%. Start with your best guess.",
    prefill_note: "I can calculate this from your P&L if you've uploaded one.",
  },

  // Value Gap
  v2_ebitda: {
    title: 'EBITDA',
    body: "This estimates earnings before interest, taxes, depreciation, and amortization — the most common way buyers value a business. Net income is a close enough starting point.",
    estimate: "Use your net income as a starting point. I'll refine it in the next section.",
    prefill_note: "If you uploaded financials, I may have pre-filled this from your documents.",
  },

  // Recast EBITDA
  rc_ebitda: {
    title: 'Reported EBITDA',
    body: "This is the earnings figure from your financials before normalization. Your accountant-reported net income or EBITDA goes here.",
    estimate: "Use your most recent full-year figure.",
    prefill_note: "I'll try to pre-fill this from your uploaded P&L or tax return.",
  },
  owner_comp: {
    title: 'Owner Compensation',
    body: "This is the difference between what you pay yourself and what a market-rate replacement manager would cost. Buyers add this back because it's not a true operating expense.",
    estimate: "If you pay yourself $200K but a manager costs $120K, enter $80K.",
    prefill_note: "Your W-2 or payroll report may contain this figure.",
  },
  da: {
    title: 'Depreciation & Amortization',
    body: "Non-cash expense on your income statement. Adding it back shows buyers true cash earnings. Look for it on Schedule K or your P&L.",
    estimate: "Check your tax return — it's usually listed separately.",
    prefill_note: "I'll look for this in your tax return or P&L if uploaded.",
  },
  interest: {
    title: 'Interest Expense',
    body: "Financing costs on business loans. Buyers remove this because they bring their own capital structure. Look for it on your P&L.",
    estimate: "Check your debt schedule or monthly loan statements.",
    prefill_note: "I may find this in your debt schedule or P&L.",
  },

  // Tax Gap
  t3_agi: {
    title: 'Adjusted Gross Income (AGI)',
    body: "Your total income minus specific deductions, before the standard or itemized deduction. Found on Line 11 of your Form 1040.",
    estimate: "Use last year's tax return if you have it nearby.",
    prefill_note: "I may have found this from your personal tax return.",
  },

  // Operations Gap
  o4_hrs: {
    title: 'Owner Hours per Week',
    body: "How many hours per week do you personally work in or on the business? This helps measure how dependent the business is on you.",
    estimate: "Be honest — most owners undercount. Include strategy, operations, client work, and admin.",
    prefill_note: null,
  },
  o4_takehome: {
    title: 'Monthly Take-Home Pay',
    body: "Your actual monthly income from this business — salary, distributions, or draws combined.",
    estimate: "Use what you actually deposit in your personal account each month.",
    prefill_note: "Payroll reports may help estimate this.",
  },

  // Freedom Assessment
  f_household_expenses: {
    title: 'Monthly Household Expenses',
    body: "What your household actually spends each month: mortgage/rent, utilities, food, insurance, travel, education — everything.",
    estimate: "A quick review of last month's bank or credit card statements works well.",
    prefill_note: null,
  },
  f_net_worth: {
    title: 'Estimated Net Worth',
    body: "Your total assets (business value, real estate, savings, investments) minus all liabilities (mortgages, loans, debts).",
    estimate: "A rough estimate is fine. Precision matters less than direction.",
    prefill_note: "Your balance sheet or personal financial statement may have this.",
  },
  f_desired_income: {
    title: 'Target Monthly Income',
    body: "How much monthly income would you need to feel financially free — whether you work or not?",
    estimate: "Think of the number that removes financial stress from your life.",
    prefill_note: null,
  },
};