var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// scripts/.tmp/b12Probe.ts
var b12Probe_exports = {};
__export(b12Probe_exports, {
  loadCanonicalFactsForConsumer: () => loadCanonicalFactsForConsumer,
  loadIntelligenceContext: () => loadIntelligenceContext
});
module.exports = __toCommonJS(b12Probe_exports);

// base44/shared/canonicalFact/types.ts
var SOURCE_AUTHORITY = {
  verified_tax_return: 1,
  // Highest — government-filed, advisor-verified
  reviewed_financials: 2,
  // CPA-reviewed, advisor-confirmed
  advisor_entry_verified: 3,
  // Advisor-entered and verified
  uploaded_financials: 4,
  // Uploaded but not yet reviewed
  extracted_field: 5,
  // AI-extracted, pending review
  assessment_answer: 6,
  // Owner-provided in assessment
  advisor_entry_unverified: 7,
  // Advisor-typed, not yet verified
  owner_estimate: 8,
  // Lowest — unverified owner estimate
  system_derived: 9,
  // Special — calculation, not a source
  benchmark: 10,
  // Special — industry benchmark
  prior_published_version: 11
  // Historical — immutable evidence, not current
};

// base44/shared/canonicalFact/registry.ts
function financialFact(fact_key, display_name, description, business_meaning, candidate_sources, opts = {}) {
  return {
    fact_key,
    category: "financial",
    display_name,
    description,
    business_meaning,
    value_type: "currency",
    unit: "USD",
    candidate_sources,
    required_verification_level: "needs_review",
    allow_fallback: true,
    conflict_materiality_threshold: 0.05,
    conflict_tolerance: "standard",
    applicable_periods: ["fiscal_year", "ttm", "calendar_year"],
    default_period: "fiscal_year",
    lineage_requirements: [],
    is_derived: false,
    registered_consumers: ["dashboard", "valuation", "bis", "assessments"],
    is_pilot: false,
    ...opts
  };
}
var FACT_REGISTRY = [
  // ── PILOT FACT 1: Revenue ─────────────────────────────────────────────────
  financialFact(
    "revenue",
    "Revenue",
    "Total annual top-line revenue",
    "Primary input to margin calculation, valuation multiple, and benchmark comparison",
    [
      { source_type: "extracted_field", source_authority: "verified_tax_return", field_names: ["gross_receipts"], doc_types: ["business_tax_return"] },
      { source_type: "extracted_field", source_authority: "uploaded_financials", field_names: ["annual_revenue", "total_revenue", "gross_revenue"], doc_types: ["profit_and_loss"] },
      { source_type: "financial_normalization", source_authority: "reviewed_financials", valuation_financial_field: "revenue" },
      { source_type: "advisor_entry", source_authority: "advisor_entry_verified", valuation_question_key: "ttm_revenue" },
      { source_type: "dashboard_metric", source_authority: "system_derived", dashboard_metric_key: "annual_revenue" },
      { source_type: "profile_record", source_authority: "owner_estimate", profile_financial_key: "annual_revenue" },
      { source_type: "assessment_answer", source_authority: "assessment_answer", assessment_type: "profit_gap", field_names: ["p1_rev", "revenue"] }
    ],
    {
      conflict_materiality_threshold: 0.05,
      registered_consumers: ["dashboard", "profit_gap_assessment", "value_gap_assessment", "bis", "valuation", "profile_financials", "dashboard_metrics"],
      is_pilot: true
    }
  ),
  // ── PILOT FACT 2: Gross Profit ────────────────────────────────────────────
  financialFact(
    "gross_profit",
    "Gross Profit",
    "Revenue minus cost of goods sold",
    "Enables gross margin analysis and profitability benchmarking",
    [
      { source_type: "extracted_field", source_authority: "uploaded_financials", field_names: ["gross_profit", "gross_income"], doc_types: ["profit_and_loss"] },
      { source_type: "financial_normalization", source_authority: "reviewed_financials", valuation_financial_field: "gross_profit" }
    ],
    {
      registered_consumers: ["dashboard", "profit_gap_assessment", "valuation"],
      is_pilot: true
    }
  ),
  // ── PILOT FACT 3: Gross Margin ────────────────────────────────────────────
  financialFact(
    "gross_margin",
    "Gross Margin %",
    "Gross profit divided by revenue",
    "Profitability benchmark vs industry",
    [
      { source_type: "system_derived", source_authority: "system_derived", derive_fn: "gross_margin_from_profit_and_revenue" }
      // 6D.1A GATE 6C — the Profit Gap assessment's margin answer is NOT a gross
      // margin and no longer supplies one. `p1_mymargin` / `net_profit_margin` are
      // documented elsewhere in the platform as a NET profit margin (see
      // src/lib/profitSemantics.js and AssessmentContext.jsx), so admitting them
      // here manufactured a gross margin that was never measured. Gross margin is
      // DERIVED from revenue and gross profit only — the lineage declared below.
    ],
    {
      value_type: "percentage",
      unit: "%",
      is_derived: true,
      lineage_requirements: ["revenue", "gross_profit"],
      registered_consumers: ["dashboard", "profit_gap_assessment", "valuation"],
      is_pilot: true
    }
  ),
  // ── PILOT FACT 4: Net Income ──────────────────────────────────────────────
  financialFact(
    "net_income",
    "Net Income",
    "Bottom-line net profit after all expenses",
    "Used in capitalization of earnings and as EBITDA base",
    [
      // 6D.1A GATE 6A — TAXABLE INCOME IS NOT NET INCOME and no longer supplies it.
      // A return's taxable income is a TAX result after tax-specific adjustments; net
      // income is an ACCOUNTING result. They are distinct concepts, and the document
      // policy already treats taxable income as its own thing (fieldDisposition). The
      // figure is retained as evidence — it is simply no longer silently relabelled.
      { source_type: "extracted_field", source_authority: "verified_tax_return", field_names: ["ordinary_business_income"], doc_types: ["business_tax_return"] },
      { source_type: "extracted_field", source_authority: "uploaded_financials", field_names: ["net_profit", "net_income", "profit"], doc_types: ["profit_and_loss"] },
      { source_type: "financial_normalization", source_authority: "reviewed_financials", valuation_financial_field: "net_income" },
      { source_type: "dashboard_metric", source_authority: "system_derived", dashboard_metric_key: "net_profit" },
      { source_type: "profile_record", source_authority: "owner_estimate", profile_financial_key: "net_profit" }
    ],
    {
      registered_consumers: ["dashboard", "profit_gap_assessment", "value_gap_assessment", "bis", "valuation", "profile_financials", "dashboard_metrics"],
      is_pilot: true
    }
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
    "taxable_income",
    "Taxable Income",
    "Taxable income as reported on a return \u2014 a tax result after tax-specific adjustments",
    "Historical tax question input \u2014 never an accounting result, never a substitute for net income",
    [
      // EVIDENCE_ONLY, said out loud: the document policy already dispositions this
      // field that way, so the concept is READABLE and ANSWERABLE while never being
      // promoted as a business fact. Declaring it here is what makes the registry
      // agree with the policy instead of leaving the concept with no home at all.
      { source_type: "extracted_field", source_authority: "verified_tax_return", field_names: ["taxable_income"], doc_types: ["business_tax_return"], evidence_scope: "evidence_only" }
    ],
    { registered_consumers: ["galileo", "tax_gap_assessment", "bis"] }
  ),
  // ── 6D.1A GATE 6B — OPERATING INCOME (EBIT), WITH ITS OWN HOME ────────────
  // Same repair, same reasoning: `operating_income` no longer supplies reported EBITDA
  // (EBITDA adds back depreciation and amortization; EBIT does not), but EBIT is a real
  // reported measure that must stay reachable under its OWN name. The document policy
  // keeps it EVIDENCE_ONLY, so it is readable and answerable without ever being
  // promoted as an accounting result it is not.
  financialFact(
    "ebit",
    "Operating Income (EBIT)",
    "Operating income as reported \u2014 earnings before interest and taxes",
    "Distinct from EBITDA: EBIT does NOT add back depreciation and amortization",
    [
      // EVIDENCE_ONLY, and for the same reason: EBIT is a real reported measure that
      // the document policy deliberately keeps out of canonical promotion. It is a
      // concept with a home, not a candidate for a business fact.
      { source_type: "extracted_field", source_authority: "uploaded_financials", field_names: ["operating_income"], doc_types: ["profit_and_loss"], evidence_scope: "evidence_only" }
    ],
    { registered_consumers: ["galileo", "valuation"] }
  ),
  // ── PILOT FACT 5: Reported EBITDA ─────────────────────────────────────────
  financialFact(
    "reported_ebitda",
    "Reported EBITDA",
    "EBITDA as reported or extracted (pre-normalization)",
    "Base earnings before recast adjustments",
    [
      // 6D.1A GATE 6B — EBIT IS NOT EBITDA. Operating income no longer supplies
      // reported EBITDA. EBITDA adds back depreciation and amortization; folding EBIT
      // into it either substituted a smaller measure silently or manufactured a
      // material "conflict" between two genuinely different things. `operating_income`
      // remains extracted, dispositioned and available as evidence.
      { source_type: "extracted_field", source_authority: "uploaded_financials", field_names: ["ebitda"] },
      { source_type: "financial_normalization", source_authority: "reviewed_financials", valuation_financial_field: "ebitda" },
      { source_type: "dashboard_metric", source_authority: "system_derived", dashboard_metric_key: "current_ebitda" },
      { source_type: "assessment_calculation", source_authority: "assessment_answer", assessment_type: "value_gap", field_names: ["v2_ebitda", "ebitda"] }
    ],
    {
      conflict_materiality_threshold: 0.05,
      registered_consumers: ["dashboard", "value_gap_assessment", "recast_ebitda_assessment", "bis", "valuation", "dashboard_metrics"],
      is_pilot: true
    }
  ),
  // ── PILOT FACT 6: Normalized EBITDA ────────────────────────────────────────
  financialFact(
    "normalized_ebitda",
    "Normalized EBITDA",
    "EBITDA after recast adjustments and add-backs",
    "Primary driver of enterprise value under the EBITDA multiple method",
    [
      { source_type: "financial_normalization", source_authority: "reviewed_financials", valuation_financial_field: "normalized_ebitda" },
      { source_type: "dashboard_metric", source_authority: "system_derived", dashboard_metric_key: "recast_ebitda" },
      { source_type: "assessment_calculation", source_authority: "assessment_answer", assessment_type: "recast_ebitda", field_names: ["rc_ebitda", "ebitda"] },
      { source_type: "system_derived", source_authority: "system_derived", derive_fn: "normalized_ebitda_from_net_income_and_addbacks" }
    ],
    {
      is_derived: true,
      lineage_requirements: ["net_income", "owner_compensation", "add_backs"],
      required_verification_level: "verified",
      registered_consumers: ["valuation", "bis", "dashboard", "reports", "growth_plan"],
      is_pilot: true
    }
  ),
  // ── PILOT FACT 7: Owner Compensation ───────────────────────────────────────
  financialFact(
    "owner_compensation",
    "Owner Compensation",
    "Total owner compensation including salary and distributions",
    "Core recast adjustment to normalized earnings",
    [
      { source_type: "extracted_field", source_authority: "verified_tax_return", field_names: ["officer_compensation"], doc_types: ["business_tax_return"] },
      { source_type: "extracted_field", source_authority: "uploaded_financials", field_names: ["owner_compensation", "owner_payroll"], doc_types: ["profit_and_loss", "payroll_report"] },
      { source_type: "financial_normalization", source_authority: "reviewed_financials", valuation_financial_field: "owner_compensation" },
      { source_type: "advisor_entry", source_authority: "advisor_entry_verified", valuation_question_key: "owner_compensation_actual" },
      { source_type: "assessment_answer", source_authority: "assessment_answer", assessment_type: "recast_ebitda", field_names: ["owner_comp", "owner_compensation"] }
    ],
    {
      conflict_materiality_threshold: 0.1,
      registered_consumers: ["recast_ebitda_assessment", "bis", "valuation", "profile_financials"],
      is_pilot: true
    }
  ),
  // ── PILOT FACT 8: Cash ────────────────────────────────────────────────────
  financialFact(
    "cash",
    "Cash",
    "Cash on hand from balance sheet",
    "Equity bridge component",
    [
      { source_type: "extracted_field", source_authority: "uploaded_financials", field_names: ["cash_on_hand", "cash"], doc_types: ["balance_sheet"] },
      { source_type: "financial_normalization", source_authority: "reviewed_financials", valuation_financial_field: "cash" }
    ],
    {
      // Phase 14.3D: Added dashboard and galileo to match subscription registry
      // (both consumers subscribe to cash via CONSUMER_SUBSCRIPTIONS)
      registered_consumers: ["dashboard", "galileo", "valuation", "bis"],
      is_pilot: true
    }
  ),
  // ── PILOT FACT 9: Debt ────────────────────────────────────────────────────
  financialFact(
    "debt",
    "Total Debt",
    "Total outstanding debt from balance sheet or debt schedule",
    "Equity bridge component \u2014 subtracted from enterprise value",
    [
      { source_type: "extracted_field", source_authority: "uploaded_financials", field_names: ["total_debt", "loan_balance"], doc_types: ["balance_sheet", "debt_schedule"] },
      { source_type: "financial_normalization", source_authority: "reviewed_financials", valuation_financial_field: "total_debt" }
    ],
    {
      conflict_materiality_threshold: 0.05,
      // Phase 14.3C: Added dashboard and galileo to match subscription registry
      // (both consumers subscribe to debt via CONSUMER_SUBSCRIPTIONS)
      registered_consumers: ["dashboard", "galileo", "valuation", "bis", "equity_bridge"],
      is_pilot: true
    }
  ),
  // ── PILOT FACT 10: Customer Concentration ─────────────────────────────────
  {
    fact_key: "customer_concentration",
    category: "business_profile",
    display_name: "Customer Concentration",
    description: "Percentage of revenue from top customer or top N customers",
    business_meaning: "Risk indicator \u2014 high concentration reduces transferability and valuation",
    value_type: "percentage",
    unit: "%",
    candidate_sources: [
      { source_type: "advisor_entry", source_authority: "advisor_entry_verified", valuation_question_key: "customer_concentration" },
      { source_type: "assessment_answer", source_authority: "assessment_answer", assessment_type: "operations_gap", field_names: ["customer_concentration", "top_customer_pct"] }
    ],
    required_verification_level: "needs_review",
    allow_fallback: false,
    conflict_materiality_threshold: 0.1,
    conflict_tolerance: "standard",
    applicable_periods: ["point_in_time"],
    default_period: "point_in_time",
    lineage_requirements: [],
    is_derived: false,
    registered_consumers: ["build_value", "valuation", "bis"],
    is_pilot: true
  },
  // ══════════════════════════════════════════════════════════════════════════
  // REMAINING 40 FACTS (registered, resolved after pilot certification)
  // ══════════════════════════════════════════════════════════════════════════
  // ── Financial (continued) ─────────────────────────────────────────────────
  financialFact("total_assets", "Total Assets", "Total assets from balance sheet", "Valuation input", [
    { source_type: "extracted_field", source_authority: "uploaded_financials", field_names: ["total_assets"], doc_types: ["balance_sheet"] },
    { source_type: "financial_normalization", source_authority: "reviewed_financials", valuation_financial_field: "total_assets" }
  ], { registered_consumers: ["valuation", "bis"] }),
  financialFact("total_liabilities", "Total Liabilities", "Total liabilities from balance sheet", "Valuation input", [
    { source_type: "extracted_field", source_authority: "uploaded_financials", field_names: ["total_liabilities"], doc_types: ["balance_sheet"] },
    { source_type: "financial_normalization", source_authority: "reviewed_financials", valuation_financial_field: "total_liabilities" }
  ], { registered_consumers: ["valuation", "bis"] }),
  financialFact("total_equity", "Total Equity", "Total equity from balance sheet", "Valuation input", [
    { source_type: "extracted_field", source_authority: "uploaded_financials", field_names: ["total_equity"], doc_types: ["balance_sheet"] }
  ], { registered_consumers: ["valuation", "bis"] }),
  financialFact("agi", "Adjusted Gross Income", "AGI from personal tax return", "Tax Gap assessment input", [
    { source_type: "extracted_field", source_authority: "verified_tax_return", field_names: ["adjusted_gross_income"], doc_types: ["personal_tax_return"] },
    { source_type: "profile_record", source_authority: "owner_estimate", profile_financial_key: "adjusted_gross_income" },
    { source_type: "assessment_answer", source_authority: "assessment_answer", assessment_type: "tax_gap", field_names: ["t3_agi"] }
  ], { registered_consumers: ["tax_gap_assessment", "bis", "profile_financials"] }),
  // 6D.0c.1-P §P8/§P9 — HISTORICAL TAX. Declared so a HISTORICAL tax question has a
  // canonical meaning at all: without it, "how much did I pay in tax 2024" matched
  // no concept, the evidence lane never ran, and a PROJECTED tax-strategy impact was
  // left standing as the answer. The definition is deliberately narrow — the tax
  // REPORTED on a return or statement, which is a liability and not cash paid — and
  // an answer using it must say which of those it is.
  financialFact("total_tax", "Total Tax Reported", "Income tax reported on a return or statement for the period (a liability, not cash payments)", "Historical tax question input \u2014 never a projected saving", [
    // 6D.1A GATE 6D — RECONCILED WITH THE DOCUMENT POLICY. A personal return's total
    // tax is the OWNER's liability, and the evidence policy already classifies it
    // PERSONAL_ONLY (fieldDisposition: personal_irs total_tax → not business-relevant).
    // Declaring it `personal_only` here makes the registry AGREE with that policy
    // instead of contradicting it, so a historical tax question is still answered from
    // the owner's own return while the figure can never become a BUSINESS fact merely
    // because a business was active. Retained as evidence; not deleted.
    { source_type: "extracted_field", source_authority: "verified_tax_return", field_names: ["total_tax"], doc_types: ["personal_tax_return"], evidence_scope: "personal_only" },
    // A company's own tax expense IS the business's figure, and stays promotable.
    { source_type: "extracted_field", source_authority: "uploaded_financials", field_names: ["taxes"], doc_types: ["profit_and_loss"] }
  ], { registered_consumers: ["galileo", "tax_gap_assessment", "bis"] }),
  financialFact("monthly_take_home", "Monthly Take-Home", "Owner monthly take-home pay", "Freedom assessment input", [
    { source_type: "system_derived", source_authority: "system_derived", derive_fn: "monthly_take_home_from_net_income" },
    { source_type: "assessment_answer", source_authority: "assessment_answer", assessment_type: "operations_gap", field_names: ["o4_takehome"] },
    { source_type: "profile_record", source_authority: "owner_estimate", profile_financial_key: "monthly_take_home" }
  ], { is_derived: true, lineage_requirements: ["net_income"], registered_consumers: ["operations_gap_assessment", "freedom_assessment", "bis", "dashboard_metrics"] }),
  financialFact("employee_count", "Employee Count", "Total number of employees", "Operations assessment input", [
    { source_type: "extracted_field", source_authority: "uploaded_financials", field_names: ["employee_count"], doc_types: ["payroll_report"] },
    { source_type: "assessment_answer", source_authority: "assessment_answer", assessment_type: "operations_gap", field_names: ["employee_count"] }
  ], { value_type: "number", registered_consumers: ["operations_gap_assessment", "bis", "valuation"] }),
  financialFact("total_payroll", "Total Payroll", "Total annual payroll", "Recast EBITDA input", [
    { source_type: "extracted_field", source_authority: "uploaded_financials", field_names: ["total_payroll"], doc_types: ["payroll_report"] },
    { source_type: "financial_normalization", source_authority: "reviewed_financials", valuation_financial_field: "total_payroll" }
  ], { registered_consumers: ["recast_ebitda_assessment", "bis", "valuation"] }),
  financialFact("add_backs", "Add-backs", "Total approved add-backs for recast EBITDA", "Normalized EBITDA component", [
    { source_type: "advisor_entry", source_authority: "advisor_entry_verified", valuation_financial_field: "total_add_backs" }
  ], { is_derived: true, lineage_requirements: ["normalized_ebitda"], required_verification_level: "verified", registered_consumers: ["valuation", "recast_ebitda_assessment", "bis"] }),
  financialFact("historical_growth_rate", "Revenue Growth Rate", "Historical revenue growth rate", "DCF and multiple selection input", [
    { source_type: "assessment_calculation", source_authority: "assessment_answer", assessment_type: "profit_gap", field_names: ["growth_rate", "cagr"] }
  ], { value_type: "percentage", registered_consumers: ["valuation", "bis"] }),
  financialFact("annual_capex", "Annual CapEx", "Annual capital expenditures", "DCF input", [
    { source_type: "advisor_entry", source_authority: "advisor_entry_verified", valuation_question_key: "annual_capex" }
  ], { registered_consumers: ["valuation"] }),
  // ── Valuation ──────────────────────────────────────────────────────────────
  financialFact("enterprise_value", "Enterprise Value", "Reconciled enterprise value", "Primary valuation output", [
    { source_type: "system_derived", source_authority: "system_derived", derive_fn: "enterprise_value_from_reconciliation" }
  ], { is_derived: true, lineage_requirements: ["normalized_ebitda", "valuation_multiple"], required_verification_level: "verified", registered_consumers: ["dashboard", "bis", "reports", "growth_plan", "executive_brief"] }),
  financialFact("equity_value", "Equity Value", "Equity value after equity bridge", "Valuation output", [
    { source_type: "system_derived", source_authority: "system_derived", derive_fn: "equity_value_from_ev_and_bridge" }
  ], { is_derived: true, lineage_requirements: ["enterprise_value", "cash", "debt"], required_verification_level: "verified", registered_consumers: ["dashboard", "bis", "reports"] }),
  financialFact("valuation_multiple", "Valuation Multiple", "Approved valuation multiple", "EV calculation input", [
    { source_type: "advisor_entry", source_authority: "advisor_entry_verified", valuation_question_key: "valuation_multiple" },
    { source_type: "benchmark", source_authority: "benchmark" }
  ], { value_type: "number", unit: "x", registered_consumers: ["valuation"] }),
  financialFact("discount_rate", "Discount Rate", "DCF discount rate", "DCF input", [
    { source_type: "advisor_entry", source_authority: "advisor_entry_verified", valuation_question_key: "discount_rate" },
    { source_type: "benchmark", source_authority: "benchmark" }
  ], { value_type: "percentage", registered_consumers: ["valuation"] }),
  // ── Business Quality (6 dimensions) ────────────────────────────────────────
  ...["financial_quality", "growth_quality", "commercial_quality", "operational_quality", "leadership_transferability", "risk_governance"].map((dim) => ({
    fact_key: `${dim}_score`,
    category: "business_quality",
    display_name: dim.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") + " Score",
    description: `${dim} dimension score from Build Value engine`,
    business_meaning: "Institutional dimension of business quality",
    value_type: "number",
    unit: "/100",
    candidate_sources: [{ source_type: "system_derived", source_authority: "system_derived", derive_fn: `build_value_${dim}` }],
    required_verification_level: "needs_review",
    allow_fallback: false,
    conflict_materiality_threshold: 0.1,
    conflict_tolerance: "standard",
    applicable_periods: ["point_in_time"],
    default_period: "point_in_time",
    lineage_requirements: [],
    is_derived: true,
    registered_consumers: ["build_value", "bis", "dashboard"],
    is_pilot: false
  })),
  // ── Business Profile ──────────────────────────────────────────────────────
  {
    fact_key: "industry",
    category: "business_profile",
    display_name: "Industry",
    description: "Business industry classification",
    business_meaning: "Drives benchmark selection and multiple range",
    value_type: "text",
    candidate_sources: [{ source_type: "business_record", source_authority: "advisor_entry_verified", business_field: "industry" }],
    required_verification_level: "verified",
    allow_fallback: false,
    conflict_materiality_threshold: 0,
    conflict_tolerance: "strict",
    applicable_periods: ["point_in_time"],
    default_period: "point_in_time",
    lineage_requirements: [],
    is_derived: false,
    registered_consumers: ["all_assessments", "bis", "valuation", "benchmarks"],
    is_pilot: false
  },
  {
    fact_key: "entity_structure",
    category: "business_profile",
    display_name: "Entity Structure",
    description: "Legal entity type (LLC, S-Corp, C-Corp, etc.)",
    business_meaning: "Determines tax structure and transaction structure",
    value_type: "single_select",
    candidate_sources: [
      { source_type: "business_record", source_authority: "advisor_entry_verified", business_field: "entity_type" },
      { source_type: "advisor_entry", source_authority: "advisor_entry_verified", valuation_question_key: "legal_entity_type" }
    ],
    required_verification_level: "verified",
    allow_fallback: false,
    conflict_materiality_threshold: 0,
    conflict_tolerance: "strict",
    applicable_periods: ["point_in_time"],
    default_period: "point_in_time",
    lineage_requirements: [],
    is_derived: false,
    registered_consumers: ["tax_gap_assessment", "valuation", "bis"],
    is_pilot: false
  },
  {
    fact_key: "recurring_revenue_pct",
    category: "business_profile",
    display_name: "Recurring Revenue %",
    description: "Percentage of revenue that is recurring/contractual",
    business_meaning: "Reduces buyer risk and supports higher multiple",
    value_type: "percentage",
    unit: "%",
    candidate_sources: [{ source_type: "advisor_entry", source_authority: "advisor_entry_verified", valuation_question_key: "recurring_revenue_pct" }],
    required_verification_level: "needs_review",
    allow_fallback: false,
    conflict_materiality_threshold: 0.1,
    conflict_tolerance: "standard",
    applicable_periods: ["point_in_time"],
    default_period: "point_in_time",
    lineage_requirements: [],
    is_derived: false,
    registered_consumers: ["build_value", "valuation", "bis"],
    is_pilot: false
  },
  // ── Intelligence & Assessment ──────────────────────────────────────────────
  ...[
    ["iq_score", "IQ Score", "Composite intelligence quotient", "number", "/100"],
    ["business_impact_score", "Business Impact Score", "Intelligence profile completeness", "number", "/100"],
    ["profit_gap_amount", "Profit Gap Amount", "Annual profit gap vs industry best", "currency", "USD"],
    ["value_gap_amount", "Value Gap Amount", "Current vs potential business value gap", "currency", "USD"],
    ["tax_gap_annual", "Tax Gap Annual", "Annual tax overpayment estimate", "currency", "USD"],
    ["operations_score", "Operations Score", "Operations health score 0-100", "number", "/100"],
    ["freedom_score", "Freedom Score", "Personal freedom score 0-100", "number", "/100"],
    ["recast_add_backs", "Recast Add-backs", "Total recast add-backs identified", "currency", "USD"]
  ].map(([key, name, desc, vtype, unit]) => ({
    fact_key: key,
    category: "intelligence_assessment",
    display_name: name,
    description: desc,
    business_meaning: "Intelligence signal for dashboard and advisory",
    value_type: vtype,
    unit,
    candidate_sources: [{ source_type: "system_derived", source_authority: "system_derived", derive_fn: `bis_${key}` }],
    required_verification_level: "needs_review",
    allow_fallback: true,
    conflict_materiality_threshold: 0.1,
    conflict_tolerance: "standard",
    applicable_periods: ["point_in_time"],
    default_period: "point_in_time",
    lineage_requirements: [],
    is_derived: true,
    registered_consumers: ["dashboard", "bis", "executive_brief"],
    is_pilot: false
  })),
  // ── Growth & Execution ────────────────────────────────────────────────────
  {
    fact_key: "growth_initiatives",
    category: "growth_execution",
    display_name: "Growth Initiatives",
    description: "Approved growth plan initiatives",
    business_meaning: "Actions to improve EBITDA, multiple, transferability",
    value_type: "text",
    candidate_sources: [{ source_type: "system_derived", source_authority: "system_derived", derive_fn: "growth_plan_initiatives" }],
    required_verification_level: "verified",
    allow_fallback: false,
    conflict_materiality_threshold: 0,
    conflict_tolerance: "strict",
    applicable_periods: ["point_in_time"],
    default_period: "point_in_time",
    lineage_requirements: ["enterprise_value", "normalized_ebitda"],
    is_derived: true,
    registered_consumers: ["growth_plan", "sprint", "bis"],
    is_pilot: false
  },
  {
    fact_key: "sprint_progress",
    category: "growth_execution",
    display_name: "Sprint Progress",
    description: "Current 90-day sprint completion percentage",
    business_meaning: "Execution progress indicator",
    value_type: "percentage",
    unit: "%",
    candidate_sources: [{ source_type: "system_derived", source_authority: "system_derived", derive_fn: "sprint_progress_from_tasks" }],
    required_verification_level: "any",
    allow_fallback: true,
    conflict_materiality_threshold: 0,
    conflict_tolerance: "lenient",
    applicable_periods: ["point_in_time"],
    default_period: "point_in_time",
    lineage_requirements: [],
    is_derived: true,
    registered_consumers: ["dashboard", "bis", "sprint"],
    is_pilot: false
  },
  // ── Document & Verification ────────────────────────────────────────────────
  {
    fact_key: "document_completeness",
    category: "document_verification",
    display_name: "Document Completeness",
    description: "Percentage of required documents uploaded and processed",
    business_meaning: "Data readiness indicator",
    value_type: "percentage",
    unit: "%",
    candidate_sources: [{ source_type: "system_derived", source_authority: "system_derived", derive_fn: "document_completeness_from_documents" }],
    required_verification_level: "any",
    allow_fallback: true,
    conflict_materiality_threshold: 0,
    conflict_tolerance: "lenient",
    applicable_periods: ["point_in_time"],
    default_period: "point_in_time",
    lineage_requirements: [],
    is_derived: true,
    registered_consumers: ["discover", "bis", "dashboard", "confidence"],
    is_pilot: false
  },
  {
    fact_key: "verification_status",
    category: "document_verification",
    display_name: "Verification Status",
    description: "Overall verification status of business facts",
    business_meaning: "Trust indicator for intelligence",
    value_type: "text",
    candidate_sources: [{ source_type: "system_derived", source_authority: "system_derived", derive_fn: "verification_status_from_fields" }],
    required_verification_level: "any",
    allow_fallback: true,
    conflict_materiality_threshold: 0,
    conflict_tolerance: "lenient",
    applicable_periods: ["point_in_time"],
    default_period: "point_in_time",
    lineage_requirements: [],
    is_derived: true,
    registered_consumers: ["intelligence", "verify", "build_value", "confidence"],
    is_pilot: false
  },
  {
    fact_key: "confidence_score",
    category: "document_verification",
    display_name: "Confidence Score",
    description: "Overall confidence in business intelligence",
    business_meaning: "Trust signal for valuation and advisory",
    value_type: "number",
    unit: "/100",
    candidate_sources: [{ source_type: "system_derived", source_authority: "system_derived", derive_fn: "confidence_from_confidence_engine" }],
    required_verification_level: "any",
    allow_fallback: true,
    conflict_materiality_threshold: 0,
    conflict_tolerance: "lenient",
    applicable_periods: ["point_in_time"],
    default_period: "point_in_time",
    lineage_requirements: [],
    is_derived: true,
    registered_consumers: ["valuation", "bis", "dashboard"],
    is_pilot: false
  },
  {
    fact_key: "publication_status",
    category: "document_verification",
    display_name: "Publication Status",
    description: "Valuation publication status",
    business_meaning: "Indicates whether valuation is published",
    value_type: "text",
    candidate_sources: [{ source_type: "business_record", source_authority: "advisor_entry_verified", business_field: "valuation_status" }],
    required_verification_level: "verified",
    allow_fallback: false,
    conflict_materiality_threshold: 0,
    conflict_tolerance: "strict",
    applicable_periods: ["point_in_time"],
    default_period: "point_in_time",
    lineage_requirements: [],
    is_derived: false,
    registered_consumers: ["valuation", "reports", "deliverables", "bis"],
    is_pilot: false
  }
];
var PILOT_FACT_KEYS = FACT_REGISTRY.filter((f) => f.is_pilot).map((f) => f.fact_key);
function getFactDefinition(factKey) {
  return FACT_REGISTRY.find((f) => f.fact_key === factKey);
}

// base44/shared/canonicalFact/sourceHierarchy.ts
function authorityRank(authority) {
  return SOURCE_AUTHORITY[authority] ?? 99;
}
function isPublishedSnapshot(result) {
  return result.source_type === "prior_published_version";
}
function isSourceApplicable(result, requestedPeriod, asOfDate) {
  if (isPublishedSnapshot(result)) {
    if (!asOfDate) return false;
    return true;
  }
  if (requestedPeriod && result.reporting_period) {
    const normalized1 = requestedPeriod.toLowerCase().replace(/[^a-z0-9]/g, "");
    const normalized2 = result.reporting_period.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (normalized1 !== normalized2 && !normalized1.includes(normalized2) && !normalized2.includes(normalized1)) {
      return false;
    }
  }
  if (asOfDate && result.source_date) {
    const sourceDate = new Date(result.source_date);
    const cutoff = new Date(asOfDate);
    if (sourceDate > cutoff) return false;
  }
  return true;
}
function selectAuthoritativeCandidate(results, opts = {}) {
  const { requestedPeriod, asOfDate, materialityThreshold = 0.05, advisorApprovedValue } = opts;
  if (advisorApprovedValue) {
    return {
      selected: advisorApprovedValue,
      reason: "advisor_approved_governance_lock",
      is_conflict: false,
      is_missing: false
    };
  }
  const applicable = results.filter((r) => isSourceApplicable(r, requestedPeriod, asOfDate));
  if (applicable.length === 0) {
    return { selected: null, reason: "no_applicable_sources", is_conflict: false, is_missing: true };
  }
  if (applicable.length === 1) {
    return { selected: applicable[0], reason: "single_applicable_source", is_conflict: false, is_missing: false };
  }
  const sorted = [...applicable].sort((a, b) => {
    const rankA = sourceTypeToAuthority(a.source_type);
    const rankB = sourceTypeToAuthority(b.source_type);
    if (rankA !== rankB) return rankA - rankB;
    return b.confidence - a.confidence;
  });
  const topAuthority = sourceTypeToAuthority(sorted[0].source_type);
  const sameAuthority = sorted.filter((r) => sourceTypeToAuthority(r.source_type) === topAuthority);
  if (sameAuthority.length > 1) {
    const conflicts = detectMaterialConflicts(sameAuthority, materialityThreshold);
    if (conflicts.length > 0) {
      return {
        selected: null,
        reason: `material_conflict_between_${conflicts.length}_sources`,
        is_conflict: true,
        is_missing: false
      };
    }
  }
  return {
    selected: sorted[0],
    reason: `selected_highest_authority_${sorted[0].source_type}`,
    is_conflict: false,
    is_missing: false
  };
}
function sourceTypeToAuthority(sourceType) {
  const map = {
    verified_tax_return: "verified_tax_return",
    reviewed_financials: "reviewed_financials",
    financial_normalization: "reviewed_financials",
    advisor_entry: "advisor_entry_verified",
    business_record: "advisor_entry_verified",
    uploaded_financials: "uploaded_financials",
    extracted_field: "extracted_field",
    document: "uploaded_financials",
    assessment_answer: "assessment_answer",
    assessment_calculation: "assessment_answer",
    dashboard_metric: "system_derived",
    profile_record: "owner_estimate",
    prior_valuation_answer: "advisor_entry_unverified",
    prior_published_version: "prior_published_version",
    client_confirmation: "advisor_entry_verified",
    system_derived: "system_derived",
    benchmark: "benchmark"
  };
  return authorityRank(map[sourceType] || "owner_estimate");
}
function detectMaterialConflicts(results, threshold) {
  const conflicts = [];
  for (let i = 0; i < results.length; i++) {
    for (let j = i + 1; j < results.length; j++) {
      const a = results[i];
      const b = results[j];
      const numA = Number(a.value);
      const numB = Number(b.value);
      if (isNaN(numA) || isNaN(numB)) continue;
      const diff = Math.abs(numA - numB);
      const base = Math.max(Math.abs(numA), Math.abs(numB), 1);
      const pct = diff / base * 100;
      if (pct > threshold * 100) {
        conflicts.push({ a, b, pct: Math.round(pct * 10) / 10 });
      }
    }
  }
  return conflicts;
}

// base44/shared/canonicalFact/reportingPeriod.ts
function parsePeriodLabel(label) {
  if (!label) return null;
  const lower = label.toLowerCase().trim();
  if (lower === "ttm" || lower === "trailing twelve months") return { type: "ttm", label: "TTM" };
  if (lower === "ytd" || lower === "year to date") return { type: "ytd", label: "YTD" };
  const fyMatch = lower.match(/^fy(\d{2,4})$/);
  if (fyMatch) {
    const year = fyMatch[1].length === 2 ? 2e3 + parseInt(fyMatch[1]) : parseInt(fyMatch[1]);
    return { type: "fiscal_year", label: `FY${year}`, fiscal_year: year, start_date: `${year}-01-01`, end_date: `${year}-12-31` };
  }
  const cyMatch = lower.match(/^(?:cy)?(\d{4})$/);
  if (cyMatch) {
    const year = parseInt(cyMatch[1]);
    return { type: "calendar_year", label: `${year}`, fiscal_year: year, start_date: `${year}-01-01`, end_date: `${year}-12-31` };
  }
  const qMatch = lower.match(/^q([1-4])[-_\s]*(\d{4})$/);
  if (qMatch) {
    const q = parseInt(qMatch[1]);
    const year = parseInt(qMatch[2]);
    const startMonth = (q - 1) * 3;
    return { type: "quarter", label: `Q${q}-${year}`, fiscal_year: year, start_date: `${year}-${String(startMonth + 1).padStart(2, "0")}-01` };
  }
  const mMatch = lower.match(/^(\d{4})-(\d{2})$/);
  if (mMatch) return { type: "month", label: `${mMatch[1]}-${mMatch[2]}`, fiscal_year: parseInt(mMatch[1]) };
  const dMatch = lower.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dMatch) return { type: "point_in_time", label: dMatch[1], end_date: dMatch[1] };
  if (lower === "valuation date" || lower === "valuation_date") return { type: "valuation_date", label: "Valuation Date" };
  return null;
}
function isPeriodCompatible(candidatePeriod, requestedPeriod) {
  if (!requestedPeriod) return true;
  if (!candidatePeriod) return true;
  const candidateParsed = parsePeriodLabel(candidatePeriod);
  if (!candidateParsed) return true;
  if (candidateParsed.type === requestedPeriod.type) {
    if (requestedPeriod.fiscal_year && candidateParsed.fiscal_year) {
      return candidateParsed.fiscal_year === requestedPeriod.fiscal_year;
    }
    return true;
  }
  if (requestedPeriod.type === "ttm" && (candidateParsed.type === "fiscal_year" || candidateParsed.type === "calendar_year")) {
    return true;
  }
  if ((requestedPeriod.type === "fiscal_year" || requestedPeriod.type === "calendar_year") && (candidateParsed.type === "fiscal_year" || candidateParsed.type === "calendar_year") && requestedPeriod.fiscal_year && candidateParsed.fiscal_year && requestedPeriod.fiscal_year === candidateParsed.fiscal_year) {
    return true;
  }
  return false;
}

// base44/shared/canonicalFact/lineage.ts
function buildLineage(factKey, selected, dependencyFactKeys) {
  const lineage = [];
  lineage.push({
    step: 1,
    fact_key: factKey,
    operation: "direct",
    description: `Selected from ${selected.source_name}`,
    source_id: selected.source_id,
    source_name: selected.source_name
  });
  dependencyFactKeys.forEach((depKey, idx) => {
    lineage.push({
      step: idx + 2,
      fact_key: depKey,
      operation: "depends_on",
      description: `Depends on ${depKey}`
    });
  });
  return lineage;
}
function buildEvidence(selected, alternatives) {
  const evidence = [];
  evidence.push({
    type: mapSourceTypeToEvidenceType(selected.source_type),
    source_name: selected.source_name,
    source_id: selected.source_id || "",
    source_date: selected.source_date || "",
    value: selected.value,
    confidence: selected.confidence,
    verified: selected.confidence >= 85,
    reporting_period: selected.reporting_period
  });
  alternatives.forEach((alt) => {
    evidence.push({
      type: mapSourceTypeToEvidenceType(alt.source_type),
      source_name: alt.source_name,
      source_id: alt.source_id || "",
      source_date: alt.source_date || "",
      value: alt.value,
      confidence: alt.confidence,
      verified: alt.confidence >= 85,
      reporting_period: alt.reporting_period
    });
  });
  return evidence;
}
function mapSourceTypeToEvidenceType(sourceType) {
  const map = {
    document: "document",
    extracted_field: "document",
    document_analysis: "document",
    assessment_answer: "assessment",
    assessment_calculation: "assessment",
    dashboard_metric: "derived",
    financial_normalization: "calculation",
    advisor_entry: "advisor",
    client_confirmation: "client",
    benchmark: "benchmark",
    system_derived: "derived",
    prior_valuation_answer: "calculation",
    prior_published_version: "calculation",
    business_record: "advisor",
    profile_record: "client",
    ownership_record: "advisor",
    gap_analysis: "assessment"
  };
  return map[sourceType] || "derived";
}

// base44/shared/canonicalFact/clientSafe.ts
function applyClientSafeFilter(fact) {
  return {
    ...fact,
    // Strip diagnostics (internal only)
    diagnostics: void 0,
    // Strip internal source IDs (keep names for transparency)
    source_id: "",
    // Strip alternative candidate source IDs
    alternative_candidates: fact.alternative_candidates.map((c) => ({
      ...c,
      source_id: ""
    })),
    // Strip evidence source IDs (keep names)
    evidence: fact.evidence.map((e) => ({
      ...e,
      source_id: ""
    })),
    // Strip lineage source IDs
    lineage: fact.lineage.map((l) => ({
      ...l,
      source_id: void 0
    })),
    // Mark as consumer safe
    consumer_safe: true,
    // Simplify confidence to a consumer-friendly level (hide numeric score)
    confidence_level: fact.confidence_level,
    confidence_score: fact.confidence_level === "verified" ? 100 : fact.confidence_level === "high" ? 85 : fact.confidence_level === "medium" ? 70 : fact.confidence_level === "low" ? 50 : 0
  };
}
function applyClientSafeFilterConflict(conflict) {
  return {
    ...conflict,
    candidates: conflict.candidates.map((c) => ({
      ...c,
      source_id: ""
    }))
  };
}

// base44/shared/valuationEngine/intelligenceMapping.ts
var fromDashboardMetric = (key, label = "Dashboard Metrics") => (ctx) => {
  const dm = ctx.dashboardMetrics;
  if (!dm || dm[key] == null || dm[key] === "") return null;
  return {
    value: dm[key],
    source_type: "dashboard_metric",
    source_name: label,
    source_date: dm.updated_at || dm.created_at,
    confidence: 70
  };
};
var fromExtractedField = (fieldNames, docTypes) => (ctx) => {
  const fields = (ctx.extractedFields || []).filter((f2) => {
    if (!fieldNames.includes(f2.field_name)) return false;
    if (docTypes && f2.source_document_type && !docTypes.includes(f2.source_document_type)) return false;
    return true;
  });
  if (fields.length === 0) return null;
  const sorted = [...fields].sort((a, b) => {
    const ra = a.review_status === "accepted" ? 1 : 0;
    const rb = b.review_status === "accepted" ? 1 : 0;
    if (ra !== rb) return rb - ra;
    return Number(b.confidence_score || 0) - Number(a.confidence_score || 0);
  });
  const f = sorted[0];
  const num = typeof f.normalized_value === "number" ? f.normalized_value : parseFloat(String(f.field_value || "").replace(/[^0-9.\-]/g, ""));
  return {
    value: isNaN(num) ? f.field_value : num,
    source_type: "extracted_field",
    source_id: f.id,
    source_name: `Document: ${f.field_label || f.field_name}`,
    source_date: f.created_at,
    confidence: Math.min(95, Number(f.confidence_score || 70)),
    reporting_period: f.metadata?.period || f.metadata?.fiscal_year || void 0
  };
};
var fromBusinessEntity = (key, label) => (ctx) => {
  const b = ctx.business;
  if (!b || b[key] == null || b[key] === "") return null;
  return {
    value: b[key],
    source_type: "business_record",
    source_id: b.id,
    source_name: `Business Record: ${label}`,
    confidence: 80
  };
};
var fromProfileFinancials = (key, label) => (ctx) => {
  const pf = ctx.profileFinancials;
  if (!pf || pf[key] == null || pf[key] === "") return null;
  return {
    value: pf[key],
    source_type: "profile_record",
    source_name: `Profile Financials: ${label}`,
    source_date: pf.updated_at,
    confidence: 65
  };
};
var fromAssessment = (assessmentType, answerKeys) => (ctx) => {
  const a = (ctx.assessments || []).find((x) => x.assessment_type === assessmentType && x.status === "completed");
  if (!a) return null;
  const ans = a.answers || {};
  const res = a.results || {};
  for (const k of answerKeys) {
    if (ans[k] != null && ans[k] !== "") {
      return {
        value: ans[k],
        source_type: "assessment_answer",
        source_id: a.id,
        source_name: `Assessment: ${assessmentType.replace(/_/g, " ")}`,
        source_date: a.completed_at || a.updated_date,
        confidence: 72
      };
    }
    if (res[k] != null && res[k] !== "") {
      return {
        value: res[k],
        source_type: "assessment_calculation",
        source_id: a.id,
        source_name: `Assessment Result: ${assessmentType.replace(/_/g, " ")}`,
        source_date: a.completed_at || a.updated_date,
        confidence: 75
      };
    }
  }
  return null;
};
var fromBusinessAssessment = (assessmentType, answerKeys) => (ctx) => {
  const a = (ctx.businessAssessments || []).find((x) => x.assessment_type === assessmentType);
  if (!a) return null;
  const ans = a.answers || {};
  const res = a.results || {};
  for (const k of answerKeys) {
    if (ans[k] != null && ans[k] !== "") {
      return { value: ans[k], source_type: "assessment_answer", source_id: a.id, source_name: `Assessment: ${assessmentType}`, source_date: a.updated_at, confidence: 70 };
    }
    if (res[k] != null && res[k] !== "") {
      return { value: res[k], source_type: "assessment_calculation", source_id: a.id, source_name: `Assessment Result: ${assessmentType}`, source_date: a.updated_at, confidence: 73 };
    }
  }
  return null;
};
var fromValuationFinancial = (field) => (ctx) => {
  const fins = (ctx.valuationFinancials || []).filter((f2) => f2[field] != null && f2[field] !== "").sort((a, b) => (b.period_end_date || "").localeCompare(a.period_end_date || ""));
  if (fins.length === 0) return null;
  const f = fins[0];
  const isApproved = f.advisor_approval_status === "approved";
  return {
    value: f[field],
    source_type: "financial_normalization",
    source_id: f.id,
    source_name: `Valuation Financial: ${f.period_label || "Current Period"}`,
    source_date: f.updated_at || f.period_end_date,
    confidence: isApproved ? 92 : 55,
    reporting_period: f.period_label || f.fiscal_year?.toString()
  };
};
var derived = (fn, sourceName, confidence = 60) => (ctx) => {
  const v = fn(ctx);
  if (v == null || typeof v === "number" && isNaN(v)) return null;
  return { value: v, source_type: "system_derived", source_name: sourceName, confidence };
};
var FIELD_REGISTRY = [
  // ── Business Identity ────────────────────────────────────────────────────
  {
    field_key: "legal_name",
    display_name: "Legal Name",
    category: "business_identity",
    answer_type: "text",
    resolvers: [fromBusinessEntity("business_name", "Legal Name")],
    missing_guidance: { why_it_matters: "Required for engagement letter and valuation report.", best_source: "Business entity record or operating agreement" }
  },
  {
    field_key: "entity_type",
    display_name: "Entity Type",
    category: "business_identity",
    answer_type: "single_select",
    question_key: "legal_entity_type",
    valuation_relevance: "transferability",
    resolvers: [fromBusinessEntity("entity_type", "Entity Type"), fromBusinessEntity("business_family_type", "Business Family")],
    missing_guidance: { why_it_matters: "Determines tax structure and transaction structure.", best_source: "Filed tax return or operating agreement" }
  },
  {
    field_key: "industry",
    display_name: "Industry",
    category: "business_identity",
    answer_type: "text",
    resolvers: [fromBusinessEntity("industry", "Industry")],
    missing_guidance: { why_it_matters: "Drives benchmark selection and multiple range.", best_source: "Business entity record" }
  },
  {
    field_key: "business_description",
    display_name: "Business Description",
    category: "business_identity",
    answer_type: "textarea",
    question_key: "business_description",
    valuation_relevance: "context",
    resolvers: [fromBusinessEntity("description", "Description")],
    missing_guidance: { why_it_matters: "Context for buyer universe and strategic value.", best_source: "Advisor interview or business record" }
  },
  {
    field_key: "ownership_structure",
    display_name: "Ownership Structure",
    category: "business_identity",
    answer_type: "textarea",
    question_key: "ownership_structure",
    valuation_relevance: "transferability",
    resolvers: [],
    missing_guidance: { why_it_matters: "Affects premise of value and minority discounts.", best_source: "Operating agreement or cap table" }
  },
  // ── Financial Performance ───────────────────────────────────────────────
  {
    field_key: "ttm_revenue",
    display_name: "TTM Revenue",
    category: "financial_performance",
    answer_type: "currency",
    question_key: "ttm_revenue",
    valuation_relevance: "enterprise_value",
    materiality_threshold: 0.05,
    resolvers: [
      fromValuationFinancial("revenue"),
      fromExtractedField(["annual_revenue", "gross_receipts", "total_revenue", "gross_revenue"], ["profit_and_loss", "business_tax_return"]),
      fromDashboardMetric("annual_revenue", "Annual Revenue"),
      fromProfileFinancials("annual_revenue", "Annual Revenue"),
      fromBusinessAssessment("profit_gap", ["p1_rev", "revenue"]),
      fromAssessment("profit_gap", ["p1_rev", "revenue"])
    ],
    missing_guidance: { why_it_matters: "Primary input to revenue and EBITDA multiples.", best_source: "Most recent P&L or tax return" }
  },
  {
    field_key: "ttm_ebitda",
    display_name: "TTM EBITDA",
    category: "financial_performance",
    answer_type: "currency",
    question_key: "ttm_ebitda",
    valuation_relevance: "enterprise_value",
    materiality_threshold: 0.05,
    resolvers: [
      fromValuationFinancial("ebitda"),
      fromDashboardMetric("recast_ebitda", "Recast EBITDA"),
      fromDashboardMetric("current_ebitda", "Current EBITDA"),
      fromExtractedField(["ebitda", "recast_ebitda", "normalized_ebitda", "adjusted_ebitda"]),
      fromBusinessAssessment("recast_ebitda", ["rc_ebitda", "ebitda"]),
      fromAssessment("recast_ebitda", ["rc_ebitda", "ebitda"]),
      fromAssessment("value_gap", ["v2_ebitda", "ebitda"])
    ],
    missing_guidance: { why_it_matters: "Primary driver of enterprise value under the EBITDA multiple method.", best_source: "Recast EBITDA assessment or normalized P&L" }
  },
  {
    field_key: "gross_profit",
    display_name: "Gross Profit",
    category: "financial_performance",
    answer_type: "currency",
    resolvers: [fromExtractedField(["gross_profit", "gross_income"])],
    missing_guidance: { why_it_matters: "Enables gross margin analysis.", best_source: "P&L statement" }
  },
  {
    field_key: "gross_margin_percentage",
    display_name: "Gross Margin %",
    category: "financial_performance",
    answer_type: "percentage",
    question_key: "gross_margin_percentage",
    valuation_relevance: "profitability",
    resolvers: [
      derived((ctx) => {
        const rev = fromExtractedField(["annual_revenue", "gross_receipts"])?.value;
        const gp = fromExtractedField(["gross_profit", "gross_income"])?.value;
        if (rev && gp && rev > 0) return Math.round(gp / rev * 1e3) / 10;
        return null;
      }, "Derived from P&L", 55)
    ],
    missing_guidance: { why_it_matters: "Profitability benchmark vs industry.", best_source: "P&L statement" }
  },
  {
    field_key: "net_income",
    display_name: "Net Income",
    category: "financial_performance",
    answer_type: "currency",
    resolvers: [
      fromDashboardMetric("net_profit", "Net Profit"),
      fromExtractedField(["net_profit", "net_income", "profit"]),
      fromProfileFinancials("net_profit", "Net Profit"),
      // 6D.1A GATE 6A — `taxable_income` was removed here for the same reason it was
      // removed from the canonical registry: a return's TAXABLE income is a tax
      // result, not the accounting net income this field asks for. The field is still
      // extracted and still available as evidence; it simply no longer answers a
      // net-income question.
      fromExtractedField(["ordinary_business_income"], ["business_tax_return"])
    ],
    missing_guidance: { why_it_matters: "Used in capitalization of earnings.", best_source: "P&L or tax return" }
  },
  {
    field_key: "owner_compensation_actual",
    display_name: "Owner Compensation (Actual)",
    category: "financial_performance",
    answer_type: "currency",
    question_key: "owner_compensation_actual",
    valuation_relevance: "profitability",
    materiality_threshold: 0.1,
    resolvers: [
      fromValuationFinancial("owner_compensation"),
      fromExtractedField(["owner_compensation", "officer_compensation", "owner_payroll"], ["profit_and_loss", "business_tax_return", "payroll_report"]),
      fromBusinessAssessment("recast_ebitda", ["owner_comp", "owner_compensation"]),
      fromAssessment("recast_ebitda", ["owner_comp", "owner_compensation"])
    ],
    missing_guidance: { why_it_matters: "Core recast adjustment to normalized earnings.", best_source: "Payroll report or tax return" }
  },
  {
    field_key: "historical_growth_rate",
    display_name: "3-Year Revenue CAGR",
    category: "financial_performance",
    answer_type: "percentage",
    question_key: "historical_growth_rate",
    valuation_relevance: "growth",
    resolvers: [
      fromAssessment("profit_gap", ["growth_rate", "cagr"]),
      fromBusinessAssessment("profit_gap", ["growth_rate", "cagr"])
    ],
    missing_guidance: { why_it_matters: "Trend input for DCF and multiple selection.", best_source: "3 years of P&L or tax returns" }
  },
  {
    field_key: "annual_capex",
    display_name: "Annual CapEx",
    category: "financial_performance",
    answer_type: "currency",
    question_key: "annual_capex",
    valuation_relevance: "enterprise_value",
    resolvers: [],
    missing_guidance: { why_it_matters: "Required for DCF and maintenance-capex normalization.", best_source: "P&L or fixed-asset schedule" }
  },
  // ── Balance Sheet & Cash Flow ────────────────────────────────────────────
  {
    field_key: "cash",
    display_name: "Cash",
    category: "balance_sheet_cash_flow",
    answer_type: "currency",
    resolvers: [fromExtractedField(["cash_on_hand", "cash"], ["balance_sheet"])],
    missing_guidance: { why_it_matters: "Equity bridge component.", best_source: "Balance sheet" }
  },
  {
    field_key: "total_debt",
    display_name: "Total Debt",
    category: "balance_sheet_cash_flow",
    answer_type: "currency",
    materiality_threshold: 0.1,
    resolvers: [
      fromExtractedField(["total_debt", "loan_balance"], ["balance_sheet", "debt_schedule"])
    ],
    missing_guidance: { why_it_matters: "Equity bridge component \u2014 subtracted from enterprise value.", best_source: "Balance sheet or debt schedule" }
  },
  {
    field_key: "total_assets",
    display_name: "Total Assets",
    category: "balance_sheet_cash_flow",
    answer_type: "currency",
    resolvers: [fromExtractedField(["total_assets"], ["balance_sheet"])],
    missing_guidance: { why_it_matters: "Asset approach reference.", best_source: "Balance sheet" }
  },
  {
    field_key: "total_liabilities",
    display_name: "Total Liabilities",
    category: "balance_sheet_cash_flow",
    answer_type: "currency",
    resolvers: [fromExtractedField(["total_liabilities"], ["balance_sheet"])],
    missing_guidance: { why_it_matters: "Equity bridge reference.", best_source: "Balance sheet" }
  },
  {
    field_key: "working_capital_balance",
    display_name: "Working Capital",
    category: "balance_sheet_cash_flow",
    answer_type: "currency",
    question_key: "working_capital_balance",
    valuation_relevance: "enterprise_value",
    resolvers: [],
    missing_guidance: { why_it_matters: "Cash-conversion quality signal.", best_source: "Balance sheet" }
  },
  // ── Commercial Quality ──────────────────────────────────────────────────
  {
    field_key: "recurring_revenue_percentage",
    display_name: "Recurring Revenue %",
    category: "commercial_quality",
    answer_type: "percentage",
    question_key: "recurring_revenue_percentage",
    valuation_relevance: "multiple",
    resolvers: [fromAssessment("value_gap", ["recurring_revenue", "recurring_pct"]), fromBusinessAssessment("value_gap", ["recurring_revenue", "recurring_pct"])],
    missing_guidance: { why_it_matters: "Materially impacts multiple premium.", best_source: "Customer contracts or CRM" }
  },
  {
    field_key: "revenue_concentration_top_customer",
    display_name: "Top Customer %",
    category: "commercial_quality",
    answer_type: "percentage",
    question_key: "revenue_concentration_top_customer",
    valuation_relevance: "risk",
    resolvers: [fromAssessment("value_gap", ["top_customer_pct", "top_customer"]), fromBusinessAssessment("value_gap", ["top_customer_pct", "top_customer"])],
    missing_guidance: { why_it_matters: "Customer concentration risk discount.", best_source: "Customer-level revenue report" }
  },
  {
    field_key: "customer_retention_rate",
    display_name: "Customer Retention",
    category: "commercial_quality",
    answer_type: "percentage",
    question_key: "customer_retention_rate",
    valuation_relevance: "multiple",
    resolvers: [fromAssessment("value_gap", ["retention_rate", "customer_retention"]), fromBusinessAssessment("value_gap", ["retention_rate", "customer_retention"])],
    missing_guidance: { why_it_matters: "Recurring revenue quality signal.", best_source: "CRM or customer report" }
  },
  {
    field_key: "customer_count",
    display_name: "Active Customers",
    category: "commercial_quality",
    answer_type: "number",
    question_key: "customer_count",
    valuation_relevance: "risk",
    resolvers: [fromAssessment("value_gap", ["customer_count", "active_customers"]), fromBusinessAssessment("value_gap", ["customer_count", "active_customers"])],
    missing_guidance: { why_it_matters: "Concentration context.", best_source: "CRM export" }
  },
  // ── Organization & Transferability ──────────────────────────────────────
  {
    field_key: "employee_count",
    display_name: "Employee Count (FTE)",
    category: "organization_transferability",
    answer_type: "number",
    question_key: "employee_count",
    valuation_relevance: "context",
    resolvers: [
      fromExtractedField(["employee_count"], ["payroll_report"]),
      fromAssessment("operations_gap", ["employee_count", "fte_count"]),
      fromBusinessAssessment("operations_gap", ["employee_count", "fte_count"])
    ],
    missing_guidance: { why_it_matters: "Operational scale and owner-dependency context.", best_source: "Payroll report" }
  },
  {
    field_key: "owner_hours_per_week",
    display_name: "Owner Hours/Week",
    category: "organization_transferability",
    answer_type: "number",
    question_key: "owner_hours_per_week",
    valuation_relevance: "transferability",
    resolvers: [fromAssessment("freedom_assessment", ["owner_hours", "hours_per_week"]), fromBusinessAssessment("freedom_assessment", ["owner_hours", "hours_per_week"])],
    missing_guidance: { why_it_matters: "Owner-dependency and transferability signal.", best_source: "Freedom Assessment" }
  },
  {
    field_key: "succession_plan_exists",
    display_name: "Succession Plan",
    category: "organization_transferability",
    answer_type: "boolean",
    question_key: "succession_plan_exists",
    valuation_relevance: "owner_readiness",
    resolvers: [fromAssessment("operations_gap", ["succession_plan"]), fromBusinessAssessment("operations_gap", ["succession_plan"])],
    missing_guidance: { why_it_matters: "Transferability and buyer risk signal.", best_source: "Operations Assessment" }
  },
  {
    field_key: "documented_sops",
    display_name: "Documented SOPs",
    category: "organization_transferability",
    answer_type: "single_select",
    question_key: "documented_sops",
    valuation_relevance: "transferability",
    resolvers: [fromAssessment("operations_gap", ["sops", "documented_sops"]), fromBusinessAssessment("operations_gap", ["sops", "documented_sops"])],
    missing_guidance: { why_it_matters: "Operational maturity and transferability.", best_source: "Operations Assessment" }
  },
  // ── Risk ─────────────────────────────────────────────────────────────────
  {
    field_key: "pending_litigation",
    display_name: "Pending Litigation",
    category: "risk",
    answer_type: "boolean",
    question_key: "pending_litigation",
    valuation_relevance: "risk",
    resolvers: [],
    missing_guidance: { why_it_matters: "Material risk discount.", best_source: "Advisor interview or legal review" }
  },
  {
    field_key: "tax_filing_status",
    display_name: "Tax Filings Current",
    category: "risk",
    answer_type: "boolean",
    question_key: "tax_filing_status",
    valuation_relevance: "risk",
    resolvers: [],
    missing_guidance: { why_it_matters: "Compliance and buyer diligence risk.", best_source: "Tax return or CPA confirmation" }
  },
  {
    field_key: "cybersecurity_measures",
    display_name: "Cybersecurity Measures",
    category: "risk",
    answer_type: "boolean",
    question_key: "cybersecurity_measures",
    valuation_relevance: "risk",
    resolvers: [],
    missing_guidance: { why_it_matters: "Increasingly material buyer diligence item.", best_source: "IT review or advisor interview" }
  }
];

// base44/shared/valuationEngine/intelligenceEngine.ts
function confidenceLevel(score, verified = false, conflicting = false) {
  if (conflicting) return "conflicting";
  if (verified) return "verified";
  if (score >= 85) return "high";
  if (score >= 65) return "medium";
  if (score >= 40) return "low";
  return "missing";
}

// base44/shared/canonicalFact/resolver.ts
function formatValue(value, valueType) {
  if (value == null || value === "") return "";
  if (valueType === "currency") {
    const n = Number(value);
    if (!isNaN(n)) return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
    return String(value);
  }
  if (valueType === "percentage") {
    const n = Number(value);
    if (!isNaN(n)) return `${n}%`;
    return String(value);
  }
  if (valueType === "number") return String(value);
  return String(value);
}
function confidenceToVerificationStatus(level, advisorApproved, conflictStatus) {
  if (conflictStatus === "material") return "conflicting";
  if (advisorApproved) return "verified";
  if (level === "high") return "suggested";
  if (level === "medium" || level === "low") return "needs_review";
  return "missing";
}
function isStale(sourceDate) {
  if (!sourceDate) return false;
  const d = new Date(sourceDate);
  if (isNaN(d.getTime())) return false;
  const months = (Date.now() - d.getTime()) / (1e3 * 60 * 60 * 24 * 30);
  return months > 18;
}
function buildAlternatives(results, selected) {
  return results.filter((r) => r !== selected).map((r) => ({
    source_name: r.source_name,
    source_type: r.source_type,
    source_authority: 0,
    // Filled by sourceHierarchy if needed
    value: r.value,
    confidence: r.confidence,
    reporting_period: r.reporting_period,
    source_date: r.source_date,
    verification_status: r.confidence >= 85 ? "verified" : r.confidence >= 65 ? "suggested" : "needs_review"
  }));
}
function buildConflict(factKey, displayName, results, materialityThreshold) {
  const candidates = results.map((r) => ({
    source_name: r.source_name,
    source_type: r.source_type,
    source_authority: 0,
    value: r.value,
    confidence: r.confidence,
    reporting_period: r.reporting_period,
    source_date: r.source_date,
    verification_status: r.confidence >= 85 ? "verified" : "needs_review"
  }));
  let maxVariance = 0;
  for (let i = 0; i < results.length; i++) {
    for (let j = i + 1; j < results.length; j++) {
      const a = Number(results[i].value);
      const b = Number(results[j].value);
      if (!isNaN(a) && !isNaN(b)) {
        const diff = Math.abs(a - b);
        const base = Math.max(Math.abs(a), Math.abs(b), 1);
        const pct = diff / base * 100;
        if (pct > maxVariance) maxVariance = pct;
      }
    }
  }
  const sorted = [...results].sort((a, b) => b.confidence - a.confidence);
  const recommended = sorted[0];
  return {
    fact_key: factKey,
    display_name: displayName,
    candidates,
    materiality_threshold: materialityThreshold,
    max_variance_percentage: Math.round(maxVariance * 10) / 10,
    recommended_verification_path: "Route to Verification Queue for advisor resolution",
    recommended_source: recommended?.source_name,
    reason: `Material conflict between ${candidates.length} sources (max variance: ${Math.round(maxVariance * 10) / 10}%)`
  };
}
function resolveFact(factKey, candidates, opts = {}) {
  const startTime = Date.now();
  const def = getFactDefinition(factKey);
  if (!def) {
    return { fact: null, conflict: null };
  }
  const threshold = opts.materialityThreshold || def.conflict_materiality_threshold;
  const periodFiltered = candidates.filter(
    (c) => isPeriodCompatible(c.reporting_period, opts.requestedPeriod)
  );
  const selection = selectAuthoritativeCandidate(periodFiltered, {
    requestedPeriod: opts.requestedPeriod?.label,
    asOfDate: opts.asOfDate,
    materialityThreshold: threshold,
    advisorApprovedValue: opts.advisorApprovedValue
  });
  if (selection.is_conflict) {
    const conflict = buildConflict(factKey, def.display_name, periodFiltered, threshold);
    return { fact: null, conflict };
  }
  if (selection.is_missing || !selection.selected) {
    const fact2 = {
      fact_key: factKey,
      display_name: def.display_name,
      category: def.category,
      business_id: "",
      // Filled by caller
      value: null,
      formatted_value: "",
      value_type: def.value_type,
      unit: def.unit,
      source_type: "system_derived",
      source_id: "",
      source_name: "No source",
      source_authority: 99,
      confidence_score: 0,
      confidence_level: "missing",
      verification_status: "missing",
      conflict_status: "none",
      advisor_approved: false,
      client_confirmed: false,
      updated_at: (/* @__PURE__ */ new Date()).toISOString(),
      evidence: [],
      lineage: [],
      alternative_candidates: [],
      resolution_status: "missing",
      is_stale: false,
      is_derived: def.is_derived,
      consumer_safe: false,
      diagnostics: {
        candidate_count: candidates.length,
        selected_source: "none",
        resolution_duration_ms: Date.now() - startTime,
        conflict_detected: false,
        fallback_used: false
      }
    };
    return { fact: fact2, conflict: null };
  }
  const selected = selection.selected;
  const alternatives = buildAlternatives(periodFiltered, selected);
  const level = confidenceLevel(selected.confidence, opts.advisorApprovedValue != null, false);
  const stale = isStale(selected.source_date);
  const verificationStatus = confidenceToVerificationStatus(level, opts.advisorApprovedValue != null, "none");
  const lineage = buildLineage(factKey, selected, def.lineage_requirements);
  const evidence = buildEvidence(selected, alternatives);
  const fact = {
    fact_key: factKey,
    display_name: def.display_name,
    category: def.category,
    business_id: "",
    // Filled by caller
    value: selected.value,
    formatted_value: formatValue(selected.value, def.value_type),
    value_type: def.value_type,
    unit: def.unit,
    source_type: selected.source_type,
    source_id: selected.source_id || "",
    source_name: selected.source_name,
    source_authority: 0,
    source_date: selected.source_date,
    reporting_period: opts.requestedPeriod,
    effective_date: selected.source_date,
    confidence_score: selected.confidence,
    confidence_level: level,
    verification_status: verificationStatus,
    conflict_status: "none",
    advisor_approved: opts.advisorApprovedValue != null,
    client_confirmed: selected.source_type === "client_confirmation",
    updated_at: selected.source_date || (/* @__PURE__ */ new Date()).toISOString(),
    updated_by: void 0,
    evidence,
    lineage,
    alternative_candidates: alternatives,
    resolution_status: stale ? "stale" : "resolved",
    is_stale: stale,
    is_derived: def.is_derived,
    consumer_safe: false,
    diagnostics: {
      candidate_count: candidates.length,
      selected_source: selected.source_type,
      resolution_duration_ms: Date.now() - startTime,
      conflict_detected: false,
      fallback_used: def.allow_fallback && candidates.length === 0
    }
  };
  return { fact, conflict: null };
}
function applyVisibilityScope(fact, conflict, visibilityScope) {
  if (visibilityScope === "client_safe") {
    return {
      fact: fact ? applyClientSafeFilter(fact) : null,
      conflict: conflict ? applyClientSafeFilterConflict(conflict) : null
    };
  }
  return { fact, conflict };
}

// base44/shared/canonicalFact/contextLoader.ts
var FACT_KEY_TO_FIELD_REGISTRY = {
  // Pilot facts
  revenue: "ttm_revenue",
  gross_profit: "gross_profit",
  gross_margin: "gross_margin_percentage",
  net_income: "net_income",
  reported_ebitda: "ttm_ebitda",
  normalized_ebitda: "ttm_ebitda",
  // Reuses EBITDA resolver; normalization is a derived layer
  owner_compensation: "owner_compensation_actual",
  cash: "cash",
  debt: "total_debt",
  customer_concentration: "customer_concentration",
  // May not exist in FIELD_REGISTRY yet
  // Non-pilot facts (mapped where possible)
  total_assets: "total_assets",
  total_liabilities: "total_liabilities",
  total_equity: "total_equity",
  agi: "agi",
  monthly_take_home: "monthly_take_home",
  employee_count: "employee_count",
  total_payroll: "total_payroll",
  historical_growth_rate: "historical_growth_rate",
  annual_capex: "annual_capex"
};
async function loadIntelligenceContext(ctx, businessId) {
  const { sb, vsb, profileId } = ctx;
  const { data: business } = await sb.from("business_entities").select("id, business_name, industry, entity_type, business_family_type, description, assigned_advisor_id").eq("id", businessId).maybeSingle();
  const { data: businessOwners } = await sb.from("business_owners").select("profile_id").eq("business_id", businessId).limit(1);
  const ownerProfileId = businessOwners?.[0]?.profile_id || profileId;
  const { data: ownerProfile } = await sb.from("profiles").select("id, email, first_name, last_name, company, primary_business_id").eq("id", ownerProfileId).maybeSingle();
  const { data: documents } = await sb.from("documents").select("id, name, document_type, upload_status, year, file_path, created_at").eq("business_id", businessId).eq("upload_status", "completed");
  const { data: extractedFields } = await sb.from("extracted_fields").select("id, field_name, field_label, field_value, normalized_value, confidence_score, review_status, source_document_type, document_id, metadata, created_at").eq("business_id", businessId).order("created_at", { ascending: false });
  const docIds = (documents || []).map((d) => d.id);
  let documentAnalyses = [];
  if (docIds.length > 0) {
    const { data: analyses } = await sb.from("document_analysis").select("id, document_id, analysis_status, confidence_score, extracted_summary").in("document_id", docIds);
    documentAnalyses = analyses || [];
  }
  let assessments = [];
  try {
    const base44Assessments = await ctx.user && ctx.profile ? await loadBase44Assessments(ctx, ownerProfileId) : [];
    assessments = base44Assessments;
  } catch {
    assessments = [];
  }
  const { data: businessAssessments } = await sb.from("business_assessments").select("id, assessment_type, status, answers, results, updated_at, completed_at").eq("profile_id", ownerProfileId).order("updated_at", { ascending: false });
  const { data: dashboardMetricsRow } = await sb.from("dashboard_metrics").select("*").eq("profile_id", ownerProfileId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const { data: gapAnalyses } = await sb.from("gap_analyses").select("id, assessment_type, gap_amount, severity, created_at").eq("profile_id", ownerProfileId).order("created_at", { ascending: false });
  const { data: profileFinancials } = await sb.from("profile_financials").select("*").eq("profile_id", ownerProfileId).maybeSingle();
  const { data: valuations } = await vsb.from("business_valuations").select("id, business_id, status").eq("business_id", businessId).neq("status", "archived").order("created_at", { ascending: false }).limit(1);
  let valuationAnswers = [];
  let valuationFinancials = [];
  let valuationAdjustments = [];
  let valuationVersions = [];
  let valuationQuestions = [];
  if (valuations && valuations.length > 0) {
    const valuationId = valuations[0].id;
    const [answersRes, finsRes, adjRes, versionsRes, questionsRes] = await Promise.all([
      vsb.from("valuation_answers").select("*").eq("valuation_id", valuationId),
      vsb.from("valuation_financials").select("*").eq("valuation_id", valuationId).order("period_end_date", { ascending: false }),
      vsb.from("valuation_adjustments").select("*").eq("valuation_id", valuationId),
      vsb.from("valuation_versions").select("*").eq("valuation_id", valuationId).order("version_number", { ascending: false }),
      vsb.from("valuation_questions").select("*").limit(500)
    ]);
    valuationAnswers = answersRes.data || [];
    valuationFinancials = finsRes.data || [];
    valuationAdjustments = adjRes.data || [];
    valuationVersions = versionsRes.data || [];
    valuationQuestions = questionsRes.data || [];
  }
  return {
    business: business || { id: businessId },
    owners: businessOwners || [],
    profile: ownerProfile || ctx.profile,
    documents: documents || [],
    extractedFields: extractedFields || [],
    documentAnalyses,
    assessments,
    businessAssessments: businessAssessments || [],
    dashboardMetrics: dashboardMetricsRow || {},
    gapAnalyses: gapAnalyses || [],
    valuationAnswers,
    valuationFinancials,
    valuationAdjustments,
    valuationVersions,
    valuationQuestions,
    profileFinancials: profileFinancials || null
  };
}
async function loadBase44Assessments(ctx, _ownerProfileId) {
  try {
    const base44Assessments = await ctx.user ? await loadCurrentUserAssessments(ctx) : [];
    return base44Assessments;
  } catch {
    return [];
  }
}
async function loadCurrentUserAssessments(ctx) {
  const { createClientFromRequest } = await import("npm:@base44/sdk@0.8.41");
  return [];
}

// base44/shared/canonicalFact/resolverHelpers.ts
async function loadCandidates(factKey, intelCtx) {
  const registryKey = FACT_KEY_TO_FIELD_REGISTRY[factKey];
  if (!registryKey) {
    return [];
  }
  const fieldDef = FIELD_REGISTRY.find((f) => f.field_key === registryKey);
  if (!fieldDef) return [];
  const results = [];
  for (const resolve of fieldDef.resolvers) {
    try {
      const result = resolve(intelCtx);
      if (result) results.push(result);
    } catch {
    }
  }
  return results;
}
function getAdvisorApprovedValue(factKey, intelCtx) {
  const registryKey = FACT_KEY_TO_FIELD_REGISTRY[factKey];
  if (!registryKey) return null;
  const fieldDef = FIELD_REGISTRY.find((f) => f.field_key === registryKey);
  if (!fieldDef || !fieldDef.question_key) return null;
  const q = (intelCtx.valuationQuestions || []).find((x) => x.question_key === fieldDef.question_key);
  if (!q) return null;
  const a = (intelCtx.valuationAnswers || []).find((x) => x.question_id === q.id);
  if (!a || a.answer_value == null) return null;
  const isVerified = a.advisor_verification_status === "verified" || a.is_confirmed;
  if (!isVerified) return null;
  return {
    value: a.answer_value,
    source_type: "advisor_entry",
    source_id: a.id,
    source_name: "Advisor Entry (approved)",
    source_date: a.answered_at,
    confidence: 95
  };
}

// base44/shared/canonicalFact/consumerAdapter.ts
function resolveScopeFromCtx(ctx, businessId) {
  if (ctx.isSuperAdmin) return "internal";
  const role = ctx.profile?.app_role;
  if (role === "admin" || role === "advisor" || role === "expert_advisor") {
    return "internal";
  }
  if (ctx.profile?.primary_business_id === businessId) return "client_safe";
  return "client_safe";
}
function classifyShadowDiscrepancy(canonical, legacy, fact) {
  if (canonical == null && legacy == null) {
    return { type: "match", explanation: "Both canonical and legacy are null" };
  }
  if (canonical == null) {
    return { type: "expected_difference", explanation: "Canonical missing, legacy has value \u2014 fallback used" };
  }
  if (legacy == null) {
    return { type: "expected_difference", explanation: "Canonical resolved, legacy had no value \u2014 canonical introduced" };
  }
  const numC = Number(canonical);
  const numL = Number(legacy);
  if (isNaN(numC) || isNaN(numL)) {
    return String(canonical) === String(legacy) ? { type: "match", explanation: "String values agree" } : { type: "unknown", explanation: "Non-numeric values differ" };
  }
  if (numC === numL) {
    return { type: "match", explanation: "Values identical" };
  }
  const diff = Math.abs(numC - numL);
  const base = Math.max(Math.abs(numC), Math.abs(numL), 1);
  const pct = diff / base * 100;
  if (pct < 1) {
    return { type: "match", explanation: "Difference < 1% (rounding)" };
  }
  if (fact?.resolution_status === "conflict") {
    return { type: "conflict", explanation: "Canonical resolver detected conflict" };
  }
  if (fact?.reporting_period?.label && fact.reporting_period.label !== "TTM") {
    return { type: "period_difference", explanation: `Canonical from period ${fact.reporting_period.label}` };
  }
  if (pct > 20) {
    return { type: "source_authority_difference", explanation: "Large difference \u2014 likely different source authority" };
  }
  if (pct > 5) {
    return { type: "period_difference", explanation: "Moderate difference \u2014 possibly different period" };
  }
  return { type: "expected_difference", explanation: "Minor difference (derivation or rounding)" };
}
async function loadCanonicalFactsForConsumer(ctx, businessId, opts) {
  const totalStart = Date.now();
  const facts = {};
  const conflicts = {};
  const missing = [];
  const errors = {};
  const shadow = [];
  const telemetry = [];
  const fallbackUsed = {};
  const allowedKeys = opts.factKeys.filter((k) => PILOT_FACT_KEYS.includes(k));
  if (allowedKeys.length === 0) {
    return {
      facts,
      conflicts,
      missing,
      errors,
      shadow,
      telemetry,
      fallbackUsed,
      resolvedCount: 0,
      conflictCount: 0,
      missingCount: 0,
      totalDurationMs: Date.now() - totalStart
    };
  }
  const intelCtx = await loadIntelligenceContext(ctx, businessId);
  const scope = opts.visibilityScope || resolveScopeFromCtx(ctx, businessId);
  for (const factKey of allowedKeys) {
    const factStart = Date.now();
    try {
      const candidates = await loadCandidates(factKey, intelCtx);
      const advisorApproved = getAdvisorApprovedValue(factKey, intelCtx);
      const { fact, conflict } = resolveFact(factKey, candidates, {
        requestedPeriod: opts.reportingPeriod,
        asOfDate: opts.asOfDate,
        advisorApprovedValue: advisorApproved,
        visibilityScope: scope
      });
      const filtered = applyVisibilityScope(fact, conflict, scope);
      if (filtered.fact) {
        facts[factKey] = { ...filtered.fact, business_id: businessId };
        conflicts[factKey] = null;
      } else if (filtered.conflict) {
        conflicts[factKey] = filtered.conflict;
        facts[factKey] = null;
      } else {
        missing.push(factKey);
        facts[factKey] = null;
        conflicts[factKey] = null;
      }
      const legacyValue = opts.legacyValues?.[factKey] ?? null;
      const canonicalValue = filtered.fact?.value ?? null;
      const { type: discrepancyType, explanation } = classifyShadowDiscrepancy(
        canonicalValue,
        legacyValue,
        filtered.fact
      );
      const canonicalResolved = filtered.fact != null && filtered.fact.resolution_status !== "conflict";
      const hasConflict = filtered.conflict != null;
      const fbUsed = !canonicalResolved && !hasConflict && legacyValue != null;
      fallbackUsed[factKey] = fbUsed;
      shadow.push({
        fact_key: factKey,
        consumer: opts.consumer,
        legacy_value: legacyValue,
        canonical_value: canonicalValue,
        discrepancy_type: discrepancyType,
        canonical_used: canonicalResolved,
        fallback_used: fbUsed,
        resolution_status: filtered.fact?.resolution_status || (hasConflict ? "conflict" : "missing"),
        explanation
      });
      telemetry.push({
        consumer: opts.consumer,
        fact_key: factKey,
        canonical_used: canonicalResolved,
        fallback_used: fbUsed,
        resolution_status: filtered.fact?.resolution_status || (hasConflict ? "conflict" : "missing"),
        difference_classification: discrepancyType,
        resolution_duration_ms: Date.now() - factStart
      });
    } catch (err) {
      errors[factKey] = err.message;
      missing.push(factKey);
      facts[factKey] = null;
      conflicts[factKey] = null;
      fallbackUsed[factKey] = opts.legacyValues?.[factKey] != null;
      shadow.push({
        fact_key: factKey,
        consumer: opts.consumer,
        legacy_value: opts.legacyValues?.[factKey] ?? null,
        canonical_value: null,
        discrepancy_type: "unknown",
        canonical_used: false,
        fallback_used: fallbackUsed[factKey],
        resolution_status: "error",
        explanation: `Resolver error: ${err.message}`
      });
      telemetry.push({
        consumer: opts.consumer,
        fact_key: factKey,
        canonical_used: false,
        fallback_used: fallbackUsed[factKey],
        resolution_status: "error",
        difference_classification: "unknown",
        resolution_duration_ms: Date.now() - factStart
      });
    }
  }
  const resolvedCount = Object.values(facts).filter((f) => f != null).length;
  const conflictCount = Object.values(conflicts).filter((c) => c != null).length;
  const missingCount = missing.length;
  return {
    facts,
    conflicts,
    missing,
    errors,
    shadow,
    telemetry,
    fallbackUsed,
    resolvedCount,
    conflictCount,
    missingCount,
    totalDurationMs: Date.now() - totalStart
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  loadCanonicalFactsForConsumer,
  loadIntelligenceContext
});
