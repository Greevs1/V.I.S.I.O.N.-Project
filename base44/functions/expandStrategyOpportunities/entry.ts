/**
 * expandStrategyOpportunities — Strategic Opportunity Expansion Engine v2
 *
 * ADDITIVE LAYER ONLY. Does not modify any existing tables or functions.
 *
 * Enhancements v2:
 *  1. Eligibility Intelligence — three-tier status: ELIGIBLE / POTENTIAL / INELIGIBLE
 *  2. Stack Sequencing — numbered implementation_sequence per expansion
 *  3. "Why This Is Above Board" — compliance_explanation per tax/legal stack
 *  4. Stack Quality Score — eligibility, compounding, readiness, documentation, expert priority
 *  5. Sprint Hand-Off — 30-day sprint structure per expansion
 *  6. Admin Test Harness — action='testHarness' for super_admin debug runs
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireBusinessContext } from '../../shared/businessScope/activeBusiness.ts';

const COMPLIANCE_DISCLAIMER = "This is a strategic opportunity for review with the appropriate licensed professional before implementation.";

// ─────────────────────────────────────────────────────────────────────────────
// EXPANSION MAP DEFINITIONS
// Each map now includes: implementation_sequence, compliance_explanation, sprint_handoff
// ─────────────────────────────────────────────────────────────────────────────
const BUILT_IN_EXPANSION_MAPS = [
  {
    expansion_name: "Paying Children Wealth Stack",
    expansion_description: "Transform a simple payroll deduction into a multi-generational wealth building sequence that compounds across tax, wealth, and freedom gaps simultaneously.",
    primary_gap: "tax",
    secondary_gaps: ["wealth", "freedom"],
    expansion_sequence: [
      "Pay children legitimate wages for real, documented business work",
      "Use the child's standard deduction to reduce their taxable income",
      "Create earned income that qualifies for retirement and investment accounts",
      "Evaluate family management company structure if multiple children and appropriate",
      "Redirect after-tax earned income into long-term wealth vehicles (Roth IRA, UTMA)",
      "Consider overfunded life insurance or compliant wealth-building tools based on eligibility",
      "Build flexibility for college funding without impacting financial aid eligibility",
      "Create future retirement income optionality for the child",
      "Improve family wealth transfer efficiency across generations",
      "Accelerate household freedom path through tax-efficient income redirection"
    ],
    implementation_sequence: [
      { step: 1, action: "Confirm eligible child work — identify real, age-appropriate tasks (admin, photography, social media, etc.)", owner: "Business Owner", timeframe: "Week 1" },
      { step: 2, action: "Confirm entity/payroll structure with CPA — verify FICA treatment, especially for sole props and S-Corps", owner: "CPA", timeframe: "Week 1-2" },
      { step: 3, action: "Define job duties, reasonable compensation level, and documentation process", owner: "Business Owner + CPA", timeframe: "Week 2" },
      { step: 4, action: "Set up payroll, time tracking, and documentation process (time sheets, job descriptions)", owner: "Business Owner + Payroll Professional", timeframe: "Week 2-3" },
      { step: 5, action: "Evaluate Roth IRA eligibility — child must have earned income; contribute up to earned amount", owner: "Wealth Strategist", timeframe: "Week 3" },
      { step: 6, action: "Evaluate overfunded life insurance, UTMA, or other wealth vehicles with licensed advisor", owner: "Insurance/Wealth Strategist", timeframe: "Week 3-4" },
      { step: 7, action: "Implement funding plan and set annual review cadence to track tax and wealth impact", owner: "CPA + Advisor", timeframe: "Week 4" }
    ],
    compliance_explanation: "This strategy is above board only when: (1) compensation is reasonable for the work performed, (2) work is legitimate and documented, (3) payroll rules are followed precisely, (4) entity type determines FICA treatment (sole props/single-member LLCs can pay minor children FICA-free; S-Corps cannot), and (5) licensed CPA, payroll professional, and wealth strategist review the full structure. This identifies the opportunity — it does not implement it.",
    first_order_effects: [
      "Immediate reduction in business taxable income",
      "Child earns legitimate W-2 income",
      "Family payroll documentation established"
    ],
    second_order_effects: [
      "Child's earned income enables IRA/Roth IRA contributions",
      "Standard deduction shelters most or all of child's wages from federal tax",
      "Business deduction reduces owner's self-employment tax burden",
      "Cash flow redirected from IRS to family wealth vehicles"
    ],
    third_order_effects: [
      "Compounding tax-advantaged growth over child's lifetime",
      "Reduced estate tax exposure through wealth transfer",
      "College funding flexibility created without FAFSA penalty",
      "Owner's personal freedom accelerated via reduced tax drag",
      "Family wealth transfer efficiency improved across 1-2 generations"
    ],
    required_conditions: {
      has_children: "HARD_BLOCK",       // Must be confirmed — cannot assume
      has_taxable_income: "REQUIRED",   // Must exist for deduction to matter
      children_can_work: "REQUIRED"     // Children must do real, documentable work
    },
    eligibility_notes: {
      has_children: "Cannot be confirmed from available data — owner must confirm they have minor or young-adult children",
      children_can_work: "Requires confirmation that children have age-appropriate tasks available in the business",
      has_taxable_income: "Confirmed from tax gap or profit gap assessment data"
    },
    required_documents: ["Tax return (prior year)", "Business payroll records", "Business expense documentation", "Child's W-2 (if previously paid)"],
    contraindications: [
      "S-Corp owner cannot pay minor children FICA-free — verify with CPA",
      "Child must perform real, documented work — phantom employment is not defensible",
      "Compensation must be reasonable for the duties performed"
    ],
    expert_review_required: ["CPA", "Payroll professional", "Insurance/wealth strategist"],
    estimated_tax_impact: 8000,
    estimated_freedom_acceleration_months: 6,
    base_confidence_score: 80,
    compounding_score: 95,    // Very high — cascades through tax → wealth → freedom
    base_strategy_key: "paying_children",
    sprint_handoff: {
      sprint_title: "Paying Children Payroll Launch",
      sprint_objective: "Establish a compliant, documented payroll structure that creates immediate tax savings and long-term wealth building for the owner's children.",
      week_1_tasks: ["Confirm child eligibility and identify age-appropriate job duties", "Schedule CPA review of entity type and FICA implications"],
      week_2_tasks: ["Draft job descriptions and reasonable compensation schedule", "Set up payroll system or add child to existing payroll"],
      week_3_tasks: ["Begin first payroll cycle with documentation", "Evaluate Roth IRA or wealth vehicle contribution plan"],
      week_4_tasks: ["Confirm all documentation is complete and audit-ready", "Schedule annual review date"],
      success_metric: "Child's first paycheck issued, W-2 on track, Roth IRA or wealth vehicle account opened",
      required_documents: ["Child's Social Security number", "Job description document", "Prior year tax return", "Payroll setup confirmation"],
      expert_roles_needed: ["CPA", "Payroll professional", "Wealth/insurance strategist"]
    }
  },
  {
    expansion_name: "Accountable Plan Cash Flow Stack",
    expansion_description: "Convert unreimbursed owner expenses from after-tax personal costs into pre-tax business deductions, creating immediate cash flow improvement that compounds into freedom acceleration.",
    primary_gap: "tax",
    secondary_gaps: ["cash_flow", "freedom"],
    expansion_sequence: [
      "Audit all unreimbursed owner business expenses (home office, vehicle, phone, travel, meals)",
      "Establish a formal written accountable reimbursement plan policy",
      "Begin documenting and reimbursing legitimate business expenses tax-efficiently",
      "Improve owner's monthly net cash flow through reimbursement",
      "Redirect freed-up cash to high-interest debt paydown, reserves, or wealth vehicles",
      "Improve personal financial stability without increasing business revenue",
      "Accelerate freedom path by improving household monthly surplus"
    ],
    implementation_sequence: [
      { step: 1, action: "List all business-related expenses currently paid personally (home office, vehicle, phone, internet, tools)", owner: "Business Owner", timeframe: "Week 1" },
      { step: 2, action: "Calculate monthly dollar amount of unreimbursed expenses to quantify opportunity", owner: "Business Owner + CPA", timeframe: "Week 1" },
      { step: 3, action: "Draft a written Accountable Plan policy document with CPA guidance", owner: "CPA", timeframe: "Week 2" },
      { step: 4, action: "Implement expense submission and reimbursement process (receipt logging, monthly submission)", owner: "Business Owner + Bookkeeper", timeframe: "Week 2-3" },
      { step: 5, action: "Process first reimbursement cycle and validate tax treatment with CPA", owner: "CPA + Bookkeeper", timeframe: "Week 3" },
      { step: 6, action: "Redirect monthly reimbursement surplus to debt paydown, reserves, or investment account", owner: "Business Owner", timeframe: "Week 4" },
      { step: 7, action: "Set quarterly review to ensure plan is consistently applied and documented", owner: "CPA", timeframe: "Week 4" }
    ],
    compliance_explanation: "An Accountable Plan is a well-established IRS-approved reimbursement mechanism. It is above board only when: (1) the plan is in writing, (2) expenses are legitimate business expenses, (3) employees (including owners) substantiate expenses with receipts, (4) excess advances are returned, and (5) personal expenses are never mixed in. When done correctly, reimbursements are not taxable income to the recipient. CPA and bookkeeper review required.",
    first_order_effects: [
      "Immediate pre-tax treatment of previously after-tax expenses",
      "Formal reimbursement policy created and documented",
      "Owner monthly cash flow increases without salary change"
    ],
    second_order_effects: [
      "Business taxable income reduced by reimbursement amount",
      "Owner W-2 or draw not increased — no additional payroll tax",
      "Personal monthly surplus increases",
      "Debt paydown or savings acceleration becomes possible"
    ],
    third_order_effects: [
      "Reduced owner dependency on business distributions for personal expenses",
      "Freedom date accelerated by 3-8 months through surplus redirection",
      "Business valuation not impacted — expenses were already incurred",
      "Audit trail created that strengthens overall tax position"
    ],
    required_conditions: {
      has_taxable_income: "REQUIRED",
      has_unreimbursed_expenses: "INFERRED"   // Assumed for active businesses — high confidence
    },
    eligibility_notes: {
      has_taxable_income: "Confirmed from tax gap or profit data",
      has_unreimbursed_expenses: "Assumed for businesses with $50K+ revenue — very few owners reimburse all business expenses perfectly"
    },
    required_documents: ["Business expense records", "Prior year tax return", "Vehicle/home office logs if applicable"],
    contraindications: [
      "Plan must be in writing and consistently applied — verbal plans are not compliant",
      "Personal expenses cannot be included under any circumstances",
      "Flat monthly allowances without substantiation are not compliant accountable plans"
    ],
    expert_review_required: ["CPA", "Bookkeeper"],
    estimated_tax_impact: 5000,
    estimated_cash_flow_impact: 500,
    estimated_freedom_acceleration_months: 4,
    base_confidence_score: 85,
    compounding_score: 72,
    base_strategy_key: "accountable_plan",
    sprint_handoff: {
      sprint_title: "Accountable Plan Implementation Sprint",
      sprint_objective: "Create and activate a compliant written Accountable Plan that converts personal business expense payments into pre-tax reimbursements immediately.",
      week_1_tasks: ["Audit all personally-paid business expenses (estimate monthly total)", "Schedule CPA review to confirm eligible expense categories"],
      week_2_tasks: ["Draft written Accountable Plan policy document", "Set up expense submission process (receipt app, spreadsheet, or bookkeeping software)"],
      week_3_tasks: ["Submit first expense reimbursement batch", "Confirm bookkeeping treatment is correct"],
      week_4_tasks: ["Calculate monthly cash flow improvement", "Decide where to redirect surplus (debt, reserves, or investment)"],
      success_metric: "First reimbursement processed, written plan on file, monthly surplus calculated",
      required_documents: ["Written Accountable Plan policy", "Expense receipts (current month)", "Prior year tax return"],
      expert_roles_needed: ["CPA", "Bookkeeper"]
    }
  },
  {
    expansion_name: "Cost Segregation Reinvestment Stack",
    expansion_description: "Accelerate depreciation on qualifying real estate to generate an immediate tax shield, then systematically redeploy those preserved dollars into compounding wealth and business value creation.",
    primary_gap: "tax",
    secondary_gaps: ["value", "wealth", "freedom"],
    expansion_sequence: [
      "Evaluate whether business or personal real estate qualifies for cost segregation study",
      "Commission cost segregation study from qualified specialist",
      "Accelerate depreciation deductions on qualifying components (15-year and 5-year property)",
      "Reduce current year taxable income by accelerated deduction amount",
      "Preserve cash that would have gone to taxes",
      "Reinvest tax savings into debt reduction, equipment, key hires, or wealth accumulation",
      "Potentially increase operational capacity through reinvestment",
      "Increase enterprise value through improved cash position and operational capacity",
      "Accelerate personal freedom path through compounding reinvestment"
    ],
    implementation_sequence: [
      { step: 1, action: "Confirm real estate ownership and gather property records (purchase price, improvement history, depreciation schedule)", owner: "Business Owner", timeframe: "Week 1" },
      { step: 2, action: "Consult CPA to assess whether property value and tax situation justify study cost (typically $500K+ property)", owner: "CPA", timeframe: "Week 1-2" },
      { step: 3, action: "Engage qualified cost segregation specialist for preliminary analysis and fee quote", owner: "CPA/Advisor", timeframe: "Week 2" },
      { step: 4, action: "Commission cost segregation study — specialist reclassifies property components", owner: "Cost Segregation Specialist", timeframe: "Week 3-4" },
      { step: 5, action: "CPA reviews study, applies accelerated depreciation deductions to current tax year", owner: "CPA", timeframe: "Week 4" },
      { step: 6, action: "Calculate net tax savings and create a reinvestment plan for preserved cash", owner: "CPA + Advisor", timeframe: "Week 4" },
      { step: 7, action: "Implement reinvestment plan — allocate preserved dollars to debt, equipment, hiring, or wealth vehicles", owner: "Business Owner + Advisor", timeframe: "Month 2" }
    ],
    compliance_explanation: "Cost segregation is a well-established, IRS-recognized engineering-based tax strategy. It is above board only when: (1) a qualified specialist performs the study, (2) property components are correctly reclassified per IRS guidelines, (3) depreciation recapture is planned for on eventual sale, and (4) CPA files the amended or current-year return with the study documentation attached. This is not a tax shelter — it is acceleration of depreciation you are already entitled to.",
    first_order_effects: [
      "Significant current-year tax deduction beyond standard depreciation",
      "Immediate cash preservation equal to tax savings",
      "Cost segregation study creates audit-defensible documentation"
    ],
    second_order_effects: [
      "Preserved cash deployed into higher-return activities",
      "Debt paydown improves monthly cash flow",
      "Equipment or hiring investment improves operational output",
      "EBITDA improvement through operational investment"
    ],
    third_order_effects: [
      "Business valuation increases from improved EBITDA",
      "Personal wealth accelerated through compounding reinvestment",
      "Tax liability is deferred, not eliminated — plan for recapture with advisor",
      "Freedom date potentially accelerated by 6-18 months"
    ],
    required_conditions: {
      owns_real_estate: "HARD_BLOCK",         // Cannot proceed without real estate
      has_taxable_income: "REQUIRED",
      property_value_sufficient: "REQUIRED"  // Study cost only justified at scale
    },
    eligibility_notes: {
      owns_real_estate: "Not confirmed in current data — requires owner confirmation of real estate ownership",
      has_taxable_income: "Confirmed from assessment data",
      property_value_sufficient: "Property must typically be $500K+ for study economics to work — not confirmed"
    },
    required_documents: ["Property records and cost basis", "Prior year tax return", "Depreciation schedule", "Property improvement history"],
    contraindications: [
      "Depreciation recapture applies on sale — must model exit tax impact with CPA",
      "Study cost typically $5,000-$15,000 — must be justified by tax savings",
      "Not beneficial for properties with minimal personal property components"
    ],
    expert_review_required: ["CPA", "Cost segregation specialist"],
    estimated_tax_impact: 25000,
    estimated_freedom_acceleration_months: 12,
    base_confidence_score: 65,   // Lower until real estate is confirmed
    compounding_score: 85,
    base_strategy_key: "cost_segregation",
    sprint_handoff: {
      sprint_title: "Cost Segregation Feasibility Sprint",
      sprint_objective: "Determine whether cost segregation is viable for this business's real estate, and if so, commission the study.",
      week_1_tasks: ["Gather property records — purchase price, date acquired, improvement history", "Schedule CPA consultation to assess feasibility"],
      week_2_tasks: ["CPA confirms whether study economics make sense", "If yes — identify and contact 2-3 qualified cost segregation specialists"],
      week_3_tasks: ["Review specialist proposals and select firm", "Commission study (or decide to defer based on CPA guidance)"],
      week_4_tasks: ["Monitor study progress", "Begin planning for reinvestment of projected tax savings"],
      success_metric: "Feasibility confirmed, specialist engaged or decision made, reinvestment plan drafted",
      required_documents: ["Property deed", "Purchase and closing documents", "Depreciation schedule", "Prior year tax return"],
      expert_roles_needed: ["CPA", "Cost segregation specialist"]
    }
  },
  {
    expansion_name: "Pricing Optimization Value Stack",
    expansion_description: "Closing a pricing gap doesn't just improve this year's margin — it compounds through EBITDA into a multiplied increase in business valuation that may be worth 4-8x the annual profit improvement.",
    primary_gap: "profit",
    secondary_gaps: ["value", "cash_flow", "freedom"],
    expansion_sequence: [
      "Analyze profitability by service line, project type, or product SKU",
      "Identify underpriced or loss-leader work consuming capacity",
      "Redesign pricing model based on value delivered, not cost-plus",
      "Implement price increases with documented value justification",
      "Increase gross margin percentage per unit of work",
      "Increase EBITDA as both revenue and margin improve",
      "Apply EBITDA multiple to calculate valuation improvement",
      "Improve monthly cash flow from improved margin",
      "Accelerate freedom date through higher profit and valuation"
    ],
    implementation_sequence: [
      { step: 1, action: "Pull P&L and segment revenue by service line, project type, or product — identify margin by category", owner: "Business Owner + Advisor", timeframe: "Week 1" },
      { step: 2, action: "Calculate true cost per job/engagement including labor burden, overhead allocation, and materials", owner: "Business Owner + CPA", timeframe: "Week 1-2" },
      { step: 3, action: "Identify underpriced work — compare actual margin to industry benchmarks", owner: "Advisor", timeframe: "Week 2" },
      { step: 4, action: "Design new pricing structure — value-based where possible, cost-plus minimum elsewhere", owner: "Business Owner + Advisor", timeframe: "Week 2-3" },
      { step: 5, action: "Roll out price increases to new engagements first; communicate value clearly to clients", owner: "Business Owner", timeframe: "Week 3-4" },
      { step: 6, action: "Track gross margin improvement weekly for the first 30 days", owner: "Business Owner + Bookkeeper", timeframe: "Month 2" },
      { step: 7, action: "Calculate EBITDA improvement and model new business valuation with advisor", owner: "Advisor + CPA", timeframe: "Month 2" }
    ],
    compliance_explanation: "Pricing optimization is a standard business strategy. No special compliance considerations apply — businesses have the right to set their own prices. Where it involves contracts or regulated pricing structures, legal review of contract terms is recommended. The valuation impact calculation uses standard EBITDA multiple methodology, which should be validated by a qualified business valuator for any formal exit or financing process.",
    first_order_effects: [
      "Higher revenue per job/engagement/sale",
      "Improved gross margin percentage",
      "Reduced proportion of unprofitable work"
    ],
    second_order_effects: [
      "EBITDA increases proportionally to margin improvement",
      "Cash flow improves monthly",
      "Owner distributions can increase without harming business health",
      "Bandwidth freed from low-margin work for high-margin work"
    ],
    third_order_effects: [
      "Business valuation increases by EBITDA × industry multiple",
      "Freedom date accelerates as monthly surplus grows",
      "Exit readiness improves as buyer sees sustainable margin",
      "Customer quality typically improves as price-shopping clients self-select out"
    ],
    required_conditions: {
      has_revenue: "REQUIRED",
      below_industry_margin: "INFERRED"   // Confirmed via profit gap assessment
    },
    eligibility_notes: {
      has_revenue: "Confirmed from business data",
      below_industry_margin: "Confirmed by Profit Gap assessment — business is below industry benchmarks"
    },
    required_documents: ["Profit & Loss statement", "Job/project cost reports if available", "Industry benchmark data"],
    contraindications: [
      "Price increases must be supported by clear, communicated value — cannot be arbitrary",
      "Rapid increases in commodity markets may cause client churn — phase in strategically",
      "Review contracts for pricing clauses before changes"
    ],
    expert_review_required: ["Business advisor/strategist"],
    estimated_profit_impact: 30000,
    estimated_value_impact: 150000,
    estimated_freedom_acceleration_months: 9,
    base_confidence_score: 80,
    compounding_score: 90,   // Very high — margin × EBITDA × multiple is a powerful chain
    base_strategy_key: "pricing_optimization",
    sprint_handoff: {
      sprint_title: "Pricing Optimization Discovery Sprint",
      sprint_objective: "Identify the highest-margin-improvement pricing changes and implement the first wave with new clients/projects.",
      week_1_tasks: ["Pull P&L and identify top 3-5 service/product lines by revenue", "Calculate actual margin for each using full cost allocation"],
      week_2_tasks: ["Compare to industry margin benchmarks", "Identify 2-3 underpriced areas with highest improvement potential"],
      week_3_tasks: ["Draft new pricing structure for new engagements", "Prepare value communication for client conversations"],
      week_4_tasks: ["Implement new pricing on all new quotes/proposals", "Track first 30 days of margin improvement"],
      success_metric: "New pricing in effect on all new work, margin improvement tracked and quantified",
      required_documents: ["P&L by service line", "Job cost reports", "Current pricing schedule"],
      expert_roles_needed: ["Business advisor/strategist", "CPA for margin analysis"]
    }
  },
  {
    expansion_name: "SOP Transferability Stack",
    expansion_description: "Documented systems don't just create consistency — they are the primary driver of business transferability, which directly increases exit value and reduces the owner's personal time dependency.",
    primary_gap: "value",
    secondary_gaps: ["operations", "freedom"],
    expansion_sequence: [
      "Identify the 5-10 core processes most dependent on owner knowledge",
      "Document each process in a clear, trainable SOP format",
      "Reduce owner as the single point of failure for each process",
      "Improve training consistency and onboarding speed for new team members",
      "Improve execution quality as team follows documented best practices",
      "Improve business transferability — buyers pay premium for documented systems",
      "Reduce buyer-perceived risk — undocumented businesses trade at discount",
      "Increase business valuation through reduced key-person dependency",
      "Accelerate exit readiness and personal freedom path"
    ],
    implementation_sequence: [
      { step: 1, action: "List the top 10 things that only the owner knows how to do — every item is an SOP opportunity", owner: "Business Owner", timeframe: "Week 1" },
      { step: 2, action: "Prioritize the top 3 that if the owner was unavailable would most disrupt operations", owner: "Business Owner", timeframe: "Week 1" },
      { step: 3, action: "Record or write the first SOP — video walkthrough + written checklist format works well", owner: "Business Owner", timeframe: "Week 2" },
      { step: 4, action: "Have a team member follow the SOP and identify gaps — refine until someone else can execute it", owner: "Business Owner + Team Member", timeframe: "Week 2-3" },
      { step: 5, action: "Document the remaining top-5 SOPs using the same format", owner: "Business Owner + Team", timeframe: "Week 3-4" },
      { step: 6, action: "Store SOPs in an accessible system (Google Drive, Notion, internal wiki)", owner: "Business Owner", timeframe: "Week 4" },
      { step: 7, action: "Schedule monthly SOP review and identify next 5 to document", owner: "Business Owner", timeframe: "Month 2+" }
    ],
    compliance_explanation: "SOP development is a standard business operations practice with no special compliance requirements. Where SOPs cover regulated activities (e.g., financial reporting, HR processes, safety procedures), they should be reviewed by the appropriate licensed professional to ensure regulatory compliance is reflected in the documented process.",
    first_order_effects: [
      "Core processes are documented and reproducible",
      "Owner no longer single point of failure for key workflows",
      "Training time for new hires reduced"
    ],
    second_order_effects: [
      "Owner reclaims 5-15 hours/week previously spent on operational coverage",
      "Team execution quality and consistency improves",
      "Customer experience becomes more predictable and scalable"
    ],
    third_order_effects: [
      "Business valuation increases — buyers pay 0.5-2x revenue premium for documented, transferable businesses",
      "Exit readiness score improves significantly",
      "Owner dependency score decreases, improving freedom score",
      "Freedom date accelerates as owner dependency is reduced"
    ],
    required_conditions: {
      has_revenue: "REQUIRED",
      has_employees_or_contractors: "INFERRED"
    },
    eligibility_notes: {
      has_revenue: "Confirmed",
      has_employees_or_contractors: "Assumed for businesses with meaningful revenue — SOPs are also valuable for solo operators planning to scale"
    },
    required_documents: ["Current operational notes or process documentation (if any)", "Org chart or team roster"],
    contraindications: [
      "SOPs require 10-20 hours of owner time upfront — must schedule deliberately",
      "AI-generated SOPs without owner review often miss critical nuances"
    ],
    expert_review_required: ["Operations advisor"],
    estimated_value_impact: 200000,
    estimated_freedom_acceleration_months: 8,
    base_confidence_score: 82,
    compounding_score: 80,
    base_strategy_key: "sop_development",
    sprint_handoff: {
      sprint_title: "SOP Foundation Sprint",
      sprint_objective: "Document the top 5 owner-dependent processes so any qualified team member can execute them independently.",
      week_1_tasks: ["List all owner-dependent processes (everything only you know how to do)", "Identify top 3 by operational risk if owner is unavailable"],
      week_2_tasks: ["Record or write SOP #1 — video + written checklist format", "Have a team member attempt to follow SOP #1 and capture gaps"],
      week_3_tasks: ["Finalize SOPs #1 and #2 to completion", "Begin drafting SOPs #3 and #4"],
      week_4_tasks: ["Complete SOPs #3-5", "Upload all to shared system (Google Drive, Notion, etc.)"],
      success_metric: "5 core SOPs documented, tested, and stored in accessible format",
      required_documents: ["Existing process notes", "Team roster", "Access to current workflow tools"],
      expert_roles_needed: ["Operations advisor (optional but accelerates quality)"]
    }
  },
  {
    expansion_name: "Key Employee Retention Value Protection Stack",
    expansion_description: "Key employees are often invisible enterprise value. Losing one key person can reduce business value by 10-30%. Retaining them creates compounding stability that buyers pay a premium for.",
    primary_gap: "value",
    secondary_gaps: ["operations", "protection"],
    expansion_sequence: [
      "Identify the 1-3 team members whose departure would most impact revenue or operations",
      "Assess current compensation, benefits, and career path for each",
      "Create a formal retention plan (compensation, equity-like incentives, career roadmap)",
      "Reduce operational single-points-of-failure beyond just the owner",
      "Improve business transferability — buyers discount heavily for key-person risk",
      "Protect enterprise value from departure events",
      "Improve buyer confidence during due diligence",
      "Increase exit readiness through documented, stable team structure"
    ],
    implementation_sequence: [
      { step: 1, action: "Identify your 1-3 key employees — the ones whose departure would most disrupt revenue or operations", owner: "Business Owner", timeframe: "Week 1" },
      { step: 2, action: "Assess current compensation vs. market rate — use industry salary surveys", owner: "Business Owner + HR Advisor", timeframe: "Week 1-2" },
      { step: 3, action: "Design a retention package — could include bonus structure, profit sharing, flexible benefits, or career path", owner: "Business Owner + Attorney/Benefits Advisor", timeframe: "Week 2-3" },
      { step: 4, action: "Have retention agreements reviewed by attorney — especially any non-compete or equity components", owner: "Attorney", timeframe: "Week 3" },
      { step: 5, action: "Present and implement retention plan with each key employee", owner: "Business Owner", timeframe: "Week 3-4" },
      { step: 6, action: "Document each key employee's role, key relationships, and institutional knowledge", owner: "Business Owner + Employee", timeframe: "Week 4" },
      { step: 7, action: "Set annual retention review — revisit compensation and career path each year", owner: "Business Owner", timeframe: "Ongoing" }
    ],
    compliance_explanation: "Key employee retention arrangements are legal business agreements. They are above board when: (1) contracts are drafted or reviewed by a licensed attorney, (2) non-compete clauses comply with applicable state law (many states have restrictions), (3) equity-like arrangements follow securities law if applicable, and (4) deferred compensation plans follow IRS 409A rules. Attorney and benefits advisor review is required for any formal retention agreement.",
    first_order_effects: [
      "Key employees have documented retention plans",
      "Compensation benchmarking reveals competitive gaps",
      "Retention risk formally assessed and tracked"
    ],
    second_order_effects: [
      "Key person risk removed from buyer due diligence concerns",
      "Operational continuity improves",
      "Team morale and culture strengthens through demonstrated investment"
    ],
    third_order_effects: [
      "Business valuation increases as key-person discount is removed",
      "Exit process smoother — buyers confident in team stability post-close",
      "Owner freedom improves as operational stability reduces emergency dependency"
    ],
    required_conditions: {
      has_employees: "REQUIRED",
      has_revenue: "REQUIRED"
    },
    eligibility_notes: {
      has_employees: "Confirmed from business profile data",
      has_revenue: "Confirmed from assessment data"
    },
    required_documents: ["Team roster and compensation summary", "Current employment agreements if any", "Org chart"],
    contraindications: [
      "Retention bonuses and equity arrangements require legal review",
      "Non-competes must comply with state law — FTC rule changes may affect enforceability",
      "Deferred compensation plans must comply with IRS 409A"
    ],
    expert_review_required: ["Attorney", "Benefits advisor", "Business strategist"],
    estimated_value_impact: 150000,
    estimated_freedom_acceleration_months: 6,
    base_confidence_score: 72,
    compounding_score: 75,
    base_strategy_key: "key_employee_retention",
    sprint_handoff: {
      sprint_title: "Key Employee Retention Plan Sprint",
      sprint_objective: "Create and implement documented retention plans for the top 1-3 employees whose departure would most damage the business.",
      week_1_tasks: ["Identify top 1-3 key employees", "Pull compensation data and compare to market benchmarks"],
      week_2_tasks: ["Draft retention plan options (bonus, profit share, benefits, career path)", "Schedule attorney review of any agreement language"],
      week_3_tasks: ["Attorney reviews and approves agreements", "Schedule conversations with each key employee"],
      week_4_tasks: ["Present and execute retention agreements", "Begin documentation of each employee's key knowledge and relationships"],
      success_metric: "Retention plans signed, compensation benchmarked, institutional knowledge documented",
      required_documents: ["Current employment agreements", "Compensation records", "Org chart"],
      expert_roles_needed: ["Attorney", "HR/benefits advisor"]
    }
  },
  {
    expansion_name: "Debt Optimization Freedom Stack",
    expansion_description: "High-interest debt is a compounding drag on freedom. Restructuring it frees monthly cash flow that can be systematically redirected toward wealth accumulation and freedom acceleration.",
    primary_gap: "cash_flow",
    secondary_gaps: ["freedom", "wealth"],
    expansion_sequence: [
      "Audit all outstanding debt by interest rate, balance, and monthly payment",
      "Identify debt costing more than 8-10% annually as priority targets",
      "Evaluate refinancing, consolidation, or accelerated payoff based on cash position",
      "Restructure or refinance high-cost debt where terms are available",
      "Reduce total monthly debt service burden",
      "Redirect freed cash flow to reserves, investments, or additional debt paydown",
      "Increase monthly investable surplus",
      "Improve personal financial stability and reduce financial stress",
      "Accelerate freedom timeline through compounding surplus redirection"
    ],
    implementation_sequence: [
      { step: 1, action: "Create a complete debt inventory — every loan, line of credit, and obligation with rate, balance, and payment", owner: "Business Owner + CPA", timeframe: "Week 1" },
      { step: 2, action: "Rank debt by interest rate — highest cost first", owner: "Business Owner", timeframe: "Week 1" },
      { step: 3, action: "For each high-cost debt: evaluate refinancing market, consolidation options, or accelerated payoff feasibility", owner: "Financial Strategist + Lender", timeframe: "Week 2" },
      { step: 4, action: "Select the best path: refinance, consolidate, or accelerated payoff plan", owner: "Business Owner + Advisor", timeframe: "Week 2-3" },
      { step: 5, action: "Implement chosen path — initiate refinancing process or set up accelerated payoff schedule", owner: "Business Owner + Lender", timeframe: "Week 3-4" },
      { step: 6, action: "Calculate net monthly cash flow improvement after restructuring", owner: "CPA", timeframe: "Week 4" },
      { step: 7, action: "Redirect freed monthly cash flow to reserves, wealth vehicles, or next-priority debt", owner: "Business Owner + Advisor", timeframe: "Month 2" }
    ],
    compliance_explanation: "Debt optimization is a standard financial planning strategy. It involves no special compliance requirements. Any refinancing or new loan agreements should be reviewed carefully for terms, prepayment penalties, and covenants. If personal guarantees are involved, attorney review is recommended. All lender relationships should be managed with full disclosure.",
    first_order_effects: [
      "High-interest debt identified and quantified",
      "Refinancing or paydown plan created",
      "Monthly cash flow pressure reduced"
    ],
    second_order_effects: [
      "Monthly surplus increases after debt restructuring",
      "Financial stress reduced as debt service burden decreases",
      "Investable surplus created from freed cash flow"
    ],
    third_order_effects: [
      "Compounding growth on redirected surplus accelerates wealth",
      "Freedom date accelerated as monthly surplus grows",
      "Business creditworthiness improves, enabling better terms in future",
      "Owner distributions can increase without business harm"
    ],
    required_conditions: {
      has_debt: "INFERRED",   // Near-universal for active businesses
      has_revenue: "REQUIRED"
    },
    eligibility_notes: {
      has_debt: "Assumed — nearly all active businesses carry some debt; confirm actual debt schedule with owner",
      has_revenue: "Confirmed from business data"
    },
    required_documents: ["Debt schedule or liability summary", "Business and personal credit overview", "Bank statements (recent)"],
    contraindications: [
      "Refinancing has closing costs — verify net benefit over remaining loan term",
      "Early payoff penalties must be evaluated before committing",
      "Some SBA loans have prepayment penalties in early years"
    ],
    expert_review_required: ["Financial strategist", "CPA", "Lender"],
    estimated_cash_flow_impact: 1500,
    estimated_freedom_acceleration_months: 10,
    base_confidence_score: 75,
    compounding_score: 78,
    base_strategy_key: "debt_optimization",
    sprint_handoff: {
      sprint_title: "Debt Audit and Optimization Sprint",
      sprint_objective: "Complete a full debt audit, identify the highest-cost obligations, and create an actionable restructuring or paydown plan.",
      week_1_tasks: ["List all business and personally-guaranteed debt with rate, balance, and monthly payment", "Calculate total monthly debt service burden"],
      week_2_tasks: ["Rank by cost (rate)", "Research refinancing options for highest-cost items (contact 2-3 lenders)"],
      week_3_tasks: ["Evaluate refinancing proposals vs. accelerated payoff cost", "Select best path for each priority debt"],
      week_4_tasks: ["Initiate chosen path (refinancing application or payment acceleration)", "Calculate monthly cash flow improvement and redirect plan"],
      success_metric: "Debt inventory complete, restructuring plan active, monthly surplus identified and redirected",
      required_documents: ["Loan statements", "Personal guarantee documents", "Business bank statements"],
      expert_roles_needed: ["Financial strategist", "CPA", "Lender/banker"]
    }
  },
  {
    expansion_name: "Entity Optimization Tax Protection Stack",
    expansion_description: "Entity structure is the foundation of all tax planning. The wrong structure can cost 5-15% of net income annually in unnecessary taxes and expose personal assets to business liability.",
    primary_gap: "tax",
    secondary_gaps: ["protection", "value"],
    expansion_sequence: [
      "Review current entity structure against revenue, ownership, and exit goals",
      "Evaluate current tax treatment (sole prop, single-member LLC, S-Corp, C-Corp)",
      "Identify tax inefficiencies in current structure",
      "Evaluate liability exposure under current structure",
      "Model optimal owner compensation split (salary vs. distributions for S-Corp)",
      "Improve tax efficiency through optimized compensation structure",
      "Align legal/protection structure with current business risk profile",
      "Support future sale planning by ensuring entity is sale-ready",
      "Reduce ongoing annual tax burden through structural optimization"
    ],
    implementation_sequence: [
      { step: 1, action: "Gather current entity documents (Articles of Incorporation/Organization, Operating Agreement, EIN letter)", owner: "Business Owner", timeframe: "Week 1" },
      { step: 2, action: "CPA reviews current structure and quantifies annual tax cost of current vs. optimal structure", owner: "CPA", timeframe: "Week 1-2" },
      { step: 3, action: "Attorney reviews liability exposure under current structure and recommends changes if needed", owner: "Attorney", timeframe: "Week 2" },
      { step: 4, action: "If S-Corp election is optimal — CPA determines eligibility, timing, and files election (March 15 deadline for current year)", owner: "CPA", timeframe: "Week 2-3" },
      { step: 5, action: "Model optimal owner W-2 salary vs. distribution split to minimize payroll tax legally", owner: "CPA", timeframe: "Week 3" },
      { step: 6, action: "Implement new compensation structure — set payroll for W-2 component", owner: "CPA + Payroll", timeframe: "Week 3-4" },
      { step: 7, action: "Confirm protection structure is aligned — ensure business activities are within the correct entity", owner: "Attorney + CPA", timeframe: "Week 4" }
    ],
    compliance_explanation: "Entity optimization is a fundamental tax and legal planning strategy. It is above board when: (1) CPA models the tax impact of each structure option with accurate numbers, (2) attorney ensures the entity conversion follows state and federal law correctly, (3) S-Corp elections are filed by the IRS deadline, (4) W-2 salary for S-Corp owners reflects reasonable compensation per IRS standards, and (5) no personal expenses are run through the business entity. Both CPA and attorney review are required — this is not a DIY strategy.",
    first_order_effects: [
      "Current entity structure formally reviewed and documented",
      "Tax inefficiencies quantified in dollar terms",
      "Liability gaps identified"
    ],
    second_order_effects: [
      "S-Corp election (if applicable) reduces self-employment tax on distributions",
      "Owner compensation structured to minimize payroll tax legally",
      "Liability exposure reduced through proper structure"
    ],
    third_order_effects: [
      "Annual tax savings compound over years — often $10K-$30K+ annually",
      "Business is sale-ready from a structural perspective",
      "Protection structure supports personal asset preservation",
      "Exit planning simplified when entity is properly structured from start"
    ],
    required_conditions: {
      has_taxable_income: "REQUIRED",
      has_revenue: "REQUIRED"
    },
    eligibility_notes: {
      has_taxable_income: "Confirmed from assessment data",
      has_revenue: "Confirmed from business data"
    },
    required_documents: ["Current entity formation documents", "Prior year tax return", "Current owner compensation documentation", "Operating Agreement"],
    contraindications: [
      "Entity conversion has state filing fees and timing constraints",
      "S-Corp election has strict IRS deadlines — typically March 15 for current year",
      "Reasonable compensation requirement must be met — IRS scrutinizes S-Corp owner salaries",
      "Some entities (trusts, foreign nationals, certain corporations) cannot elect S-Corp status"
    ],
    expert_review_required: ["CPA", "Attorney"],
    estimated_tax_impact: 15000,
    estimated_freedom_acceleration_months: 7,
    base_confidence_score: 82,
    compounding_score: 80,
    base_strategy_key: "entity_optimization",
    sprint_handoff: {
      sprint_title: "Entity Structure Review Sprint",
      sprint_objective: "Complete a full entity structure review and implement the optimal structure for tax efficiency, liability protection, and exit readiness.",
      week_1_tasks: ["Gather all entity formation documents and prior year tax return", "Schedule CPA review — specifically to model current vs. optimal structure tax impact"],
      week_2_tasks: ["CPA delivers structure analysis with dollar impact of each option", "Attorney reviews liability exposure if structure change is recommended"],
      week_3_tasks: ["Make structure decision based on CPA/attorney input", "If S-Corp: file election by deadline; if restructuring: initiate state filings"],
      week_4_tasks: ["Implement new W-2 salary and distribution plan", "Confirm bookkeeping is updated to reflect new structure"],
      success_metric: "Optimal entity structure confirmed or implemented, annual tax savings quantified",
      required_documents: ["Entity formation documents", "Operating Agreement", "Prior year tax return (personal and business)", "Current payroll records"],
      expert_roles_needed: ["CPA", "Attorney"]
    }
  }
];

// ─────────────────────────────────────────────────────────────────────────────
// ELIGIBILITY ENGINE
// Three-tier status: ELIGIBLE | POTENTIAL | INELIGIBLE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * HARD_BLOCK  — expansion cannot proceed without this; marks as INELIGIBLE or POTENTIAL
 * REQUIRED    — needed but can be assumed from data; marks as POTENTIAL if missing
 * INFERRED    — assumed from heuristics; low penalty if absent
 */
function evaluateEligibility(map, clientSignals) {
  const conditions = map.required_conditions || {};
  const notes = map.eligibility_notes || {};
  const metConditions = {};
  const missingRequired = [];
  const hardBlocksMissing = [];
  const ineligibleReasons = [];
  const missingDataToCollect = [];

  for (const [condition, type] of Object.entries(conditions)) {
    const met = !!clientSignals[condition];
    metConditions[condition] = met;

    if (!met) {
      const note = notes[condition] || condition;
      if (type === 'HARD_BLOCK') {
        hardBlocksMissing.push({ condition, note });
      } else if (type === 'REQUIRED') {
        missingRequired.push({ condition, note });
        missingDataToCollect.push(note);
      } else if (type === 'INFERRED') {
        missingDataToCollect.push(`${condition} — assumed but not confirmed`);
      }
    }
  }

  // Eligibility tier determination
  let eligibilityStatus;
  let eligibilityReason;

  if (hardBlocksMissing.length > 0) {
    // Check if we simply don't know (unknown) vs. confirmed absent
    const unknownBlocks = hardBlocksMissing.filter(b => clientSignals[b.condition] === undefined || clientSignals[b.condition] === false);
    if (unknownBlocks.length > 0 && clientSignals._data_partial) {
      eligibilityStatus = 'POTENTIAL';
      eligibilityReason = `Cannot confirm eligibility — ${unknownBlocks.map(b => b.note).join('; ')}`;
    } else {
      eligibilityStatus = 'POTENTIAL'; // Default to POTENTIAL not INELIGIBLE for unknown conditions
      eligibilityReason = `Requires confirmation: ${hardBlocksMissing.map(b => b.note).join('; ')}`;
    }
  } else if (missingRequired.length > 0) {
    eligibilityStatus = 'POTENTIAL';
    eligibilityReason = `Likely eligible — missing confirmation: ${missingRequired.map(r => r.note).join('; ')}`;
  } else {
    eligibilityStatus = 'ELIGIBLE';
    eligibilityReason = 'All required conditions met from available data';
  }

  return {
    eligibilityStatus,
    eligibilityReason,
    metConditions,
    hardBlocksMissing,
    missingRequired,
    missingDataToCollect,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// QUALITY SCORING
// ─────────────────────────────────────────────────────────────────────────────
function computeQualityScores(map, eligResult, clientData, adjustedConfidence) {
  const { revenue = 0, taxGapAmount = 0, profitGapAmount = 0, valueGapAmount = 0 } = clientData;

  // Eligibility score: 100 = fully eligible, 60 = potential, 20 = ineligible
  const eligibilityScore = eligResult.eligibilityStatus === 'ELIGIBLE' ? 95
    : eligResult.eligibilityStatus === 'POTENTIAL' ? 60
    : 20;

  // Compounding score: from the map definition
  const compoundingScore = map.compounding_score || 70;

  // Implementation readiness: based on how many required docs are missing
  const requiredDocsCount = (map.required_documents || []).length;
  const implementationReadinessScore = Math.max(30, 90 - (eligResult.missingDataToCollect.length * 10));

  // Documentation score: do we have the data to support this?
  const documentationScore = adjustedConfidence;

  // Expert review priority: 1 = urgent (many experts needed), 5 = low
  const expertCount = (map.expert_review_required || []).length;
  const expertReviewPriority = expertCount >= 3 ? 1 : expertCount >= 2 ? 2 : 3;

  // Overall composite ranking score
  const compositeScore = Math.round(
    (eligibilityScore * 0.25) +
    (compoundingScore * 0.25) +
    (adjustedConfidence * 0.20) +
    (implementationReadinessScore * 0.15) +
    ((map.estimated_freedom_acceleration_months || 0) * 2 * 0.15)  // up to ~15 pts from 5 months
  );

  return {
    eligibility_score: eligibilityScore,
    compounding_score: compoundingScore,
    implementation_readiness_score: implementationReadinessScore,
    documentation_score: documentationScore,
    expert_review_priority: expertReviewPriority,
    composite_score: Math.min(100, compositeScore),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLIENT SIGNALS
// ─────────────────────────────────────────────────────────────────────────────
function deriveClientSignals(ctx, clientData) {
  const { revenue = 0, taxGapAmount = 0, profitGapAmount = 0 } = clientData || {};
  const businessProfile = ctx?.business_profile || {};
  const industry = (businessProfile.industry || '').toLowerCase();
  const isRealEstate = industry.includes('real estate') || industry.includes('property') || industry.includes('landlord');

  return {
    has_revenue: revenue > 0,
    has_taxable_income: taxGapAmount > 0 || profitGapAmount > 0 || revenue > 100000,
    has_children: undefined,          // Cannot determine — intentionally undefined (not false)
    children_can_work: undefined,     // Same
    has_unreimbursed_expenses: revenue > 50000,
    owns_real_estate: isRealEstate ? true : undefined,  // undefined = unknown if not in RE industry
    property_value_sufficient: isRealEstate && revenue > 200000,
    below_industry_margin: profitGapAmount > 0,
    has_employees: (businessProfile.employees || 0) > 1,
    has_employees_or_contractors: (businessProfile.employees || 0) > 0 || revenue > 100000,
    has_debt: true,
    has_high_debt: false,
    _data_partial: !revenue || !taxGapAmount,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EVIDENCE + IMPACT PROJECTION
// ─────────────────────────────────────────────────────────────────────────────
function buildExpansionEvidence(ctx, clientData, map) {
  const evidence = [];
  const { revenue, taxGapAmount, profitGapAmount, valueGapAmount } = clientData || {};
  if (revenue > 0) evidence.push({ source: 'metrics', field: 'revenue', value: `$${revenue.toLocaleString()}` });
  if (taxGapAmount > 0 && map.primary_gap === 'tax') evidence.push({ source: 'assessment', field: 'tax_gap', value: `$${taxGapAmount.toLocaleString()}/yr` });
  if (profitGapAmount > 0 && map.primary_gap === 'profit') evidence.push({ source: 'assessment', field: 'profit_gap', value: `$${profitGapAmount.toLocaleString()}` });
  if (valueGapAmount > 0 && map.primary_gap === 'value') evidence.push({ source: 'assessment', field: 'value_gap', value: `$${(valueGapAmount / 1_000_000).toFixed(1)}M` });
  const ciq = ctx?.ciq_summary?.current_score;
  if (ciq) evidence.push({ source: 'snapshot', field: 'ciq_score', value: `${ciq}/100` });
  return evidence;
}

function projectImpact(map, clientData) {
  const { taxGapAmount = 0, profitGapAmount = 0, valueGapAmount = 0 } = clientData || {};
  return {
    projected_tax_impact: map.estimated_tax_impact
      ? Math.min(map.estimated_tax_impact, taxGapAmount > 0 ? taxGapAmount : map.estimated_tax_impact)
      : null,
    projected_profit_impact: map.estimated_profit_impact
      ? (profitGapAmount > 0 ? Math.min(map.estimated_profit_impact, profitGapAmount) : map.estimated_profit_impact)
      : null,
    projected_value_impact: map.estimated_value_impact
      ? (valueGapAmount > 0 ? Math.min(map.estimated_value_impact, valueGapAmount * 0.3) : map.estimated_value_impact)
      : null,
    projected_cash_flow_impact: map.estimated_cash_flow_impact || null,
    projected_freedom_acceleration_months: map.estimated_freedom_acceleration_months || null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SEED HELPER
// ─────────────────────────────────────────────────────────────────────────────
function buildSeedRow(m, now) {
  return {
    expansion_name: m.expansion_name,
    expansion_description: m.expansion_description,
    primary_gap: m.primary_gap,
    secondary_gaps: m.secondary_gaps,
    expansion_sequence: m.expansion_sequence,
    first_order_effects: m.first_order_effects,
    second_order_effects: m.second_order_effects,
    third_order_effects: m.third_order_effects,
    required_conditions: m.required_conditions,
    required_documents: m.required_documents,
    contraindications: m.contraindications,
    expert_review_required: m.expert_review_required,
    estimated_tax_impact: m.estimated_tax_impact || null,
    estimated_profit_impact: m.estimated_profit_impact || null,
    estimated_value_impact: m.estimated_value_impact || null,
    estimated_cash_flow_impact: m.estimated_cash_flow_impact || null,
    estimated_freedom_acceleration_months: m.estimated_freedom_acceleration_months || null,
    confidence_score: m.base_confidence_score || 70,
    active: true,
    created_at: now,
    updated_at: now,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SERVICE_KEY) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    const body = await req.json().catch(() => ({}));
    const { action = 'expand', business_id: bodyBizId, profile_id: bodyProfId, persist = true } = body;

    // Resolve profile & business
    let profile_id = bodyProfId;
    let business_id = bodyBizId;
    if (!profile_id || !business_id) {
      const { data: prof } = await sb.from('profiles').select('id, primary_business_id, app_role').eq('email', user.email).maybeSingle();
      if (prof) {
        if (!profile_id) profile_id = prof.id;
        if (!business_id) {
          // Phase 6.9B — canonical resolution. Was `prof.primary_business_id`.
          const { businessId: canonBizId, denial: bizDenial } = await requireBusinessContext(
            sb, prof, null, 'expandStrategyOpportunities'
          );
          if (bizDenial) return bizDenial;
          business_id = canonBizId;
        }
      }
    }
    if (!business_id) return Response.json({ error: 'business_id required' }, { status: 400 });

    // ── Admin test harness (super_admin only) ────────────────────────────────
    if (action === 'testHarness') {
      const { data: prof } = await sb.from('profiles').select('app_role').eq('id', profile_id).maybeSingle();
      const role = prof?.app_role || user.role;
      if (!['super_admin', 'advisor', 'admin'].includes(role)) {
        return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });
      }
      // Run expand with persist=false and return full debug output
      const debugRes = await runExpansionEngine(sb, business_id, profile_id, false);
      return Response.json({
        debug: true,
        business_id,
        profile_id,
        ...debugRes,
        _raw_client_signals: debugRes.client_signals_used,
        _timestamp: new Date().toISOString(),
      });
    }

    // ── GET EXPANSIONS (read-only) ───────────────────────────────────────────
    if (action === 'getExpansions') {
      const { data: expansions } = await sb
        .from('client_strategy_expansions')
        .select('*')
        .eq('business_id', business_id)
        .in('status', ['recommended', 'potential'])
        .order('priority_rank', { ascending: true })
        .limit(20);
      return Response.json({ expansions: expansions || [], total: (expansions || []).length });
    }

    // ── SEED EXPANSION MAPS ──────────────────────────────────────────────────
    if (action === 'seedExpansionMaps') {
      const { data: existing } = await sb.from('strategy_expansion_map').select('id').limit(1);
      if (existing && existing.length > 0) {
        return Response.json({ message: 'Already seeded', count: existing.length });
      }
      const now = new Date().toISOString();
      const { data: inserted, error: err } = await sb
        .from('strategy_expansion_map')
        .insert(BUILT_IN_EXPANSION_MAPS.map(m => buildSeedRow(m, now)))
        .select('id, expansion_name');
      if (err) return Response.json({ error: err.message }, { status: 500 });
      return Response.json({ success: true, seeded: inserted?.length || 0, maps: inserted });
    }

    // ── MAIN: EXPAND ─────────────────────────────────────────────────────────
    const result = await runExpansionEngine(sb, business_id, profile_id, persist);
    return Response.json(result);

  } catch (error) {
    console.error('[expandStrategyOpportunities] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CORE ENGINE (extracted for reuse by testHarness)
// ─────────────────────────────────────────────────────────────────────────────
async function runExpansionEngine(sb, business_id, profile_id, persist) {
  // Step 1: Load context inline
  let ctx = {};
  try {
    const [bizR, dashR, assessR, snapR] = await Promise.allSettled([
      sb.from('business_entities').select('industry, entity_type, employee_count, num_employees, business_name').eq('id', business_id).maybeSingle(),
      sb.from('dashboard_metrics').select('revenue, net_profit, ciq_score, freedom_score, enterprise_value').eq('profile_id', profile_id).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
      sb.from('business_assessments').select('assessment_type, score, estimated_opportunity_value, opportunity_level, summary').eq('profile_id', profile_id),
      sb.from('business_metric_snapshots').select('annual_revenue, net_profit, overall_impact_score, data_confidence_score').eq('profile_id', profile_id).order('snapshot_date', { ascending: false }).limit(1).maybeSingle(),
    ]);
    const sv = (s, fb = null) => s.status === 'fulfilled' ? (s.value?.data ?? fb) : fb;
    const biz = sv(bizR); const dash = sv(dashR); const assmts = sv(assessR, []); const snap = sv(snapR);
    const byType = (assmts || []).reduce((a, r) => { a[r.assessment_type] = r; return a; }, {});
    ctx = {
      business_profile: {
        industry: biz?.industry || null,
        entity_type: biz?.entity_type || null,
        employees: biz?.employee_count || biz?.num_employees || 0,
        name: biz?.business_name || null,
      },
      current_metrics: {
        revenue: { value: snap?.annual_revenue || dash?.revenue || null },
      },
      gap_summary: {
        tax_gap: { amount: byType.tax_gap?.estimated_opportunity_value || 0 },
        profit_gap: { amount: byType.profit_gap?.estimated_opportunity_value || 0 },
        value_gap: { amount: byType.value_gap?.estimated_opportunity_value || 0 },
        operations_gap: { amount: byType.operations_gap?.estimated_opportunity_value || 0 },
      },
      ciq_summary: { current_score: snap?.overall_impact_score || dash?.ciq_score || null },
    };
  } catch (e) {
    console.warn('[expandStrategyOpportunities] context load non-fatal:', e.message);
  }

  const revenue = ctx?.current_metrics?.revenue?.value || 0;
  const taxGapAmount = ctx?.gap_summary?.tax_gap?.amount || 0;
  const profitGapAmount = ctx?.gap_summary?.profit_gap?.amount || 0;
  const valueGapAmount = ctx?.gap_summary?.value_gap?.amount || 0;
  const clientData = { revenue, taxGapAmount, profitGapAmount, valueGapAmount };
  const clientSignals = deriveClientSignals(ctx, clientData);

  // Step 2: Load/seed expansion maps
  let { data: expansionMaps } = await sb.from('strategy_expansion_map').select('*').eq('active', true);
  if (!expansionMaps || expansionMaps.length === 0) {
    const now = new Date().toISOString();
    const { data: seeded } = await sb.from('strategy_expansion_map')
      .insert(BUILT_IN_EXPANSION_MAPS.map(m => buildSeedRow(m, now))).select('*');
    expansionMaps = seeded || [];
    console.log('[expandStrategyOpportunities] Auto-seeded', expansionMaps.length, 'expansion maps');
  }

  // Use inline definitions if DB seeding failed (table may not exist yet)
  if (!expansionMaps || expansionMaps.length === 0) {
    expansionMaps = BUILT_IN_EXPANSION_MAPS.map((m, i) => ({
      ...buildSeedRow(m, new Date().toISOString()),
      id: `inline_${i}`,
      expansion_sequence: m.expansion_sequence,
      first_order_effects: m.first_order_effects,
      second_order_effects: m.second_order_effects,
      third_order_effects: m.third_order_effects,
      required_conditions: m.required_conditions,
      contraindications: m.contraindications,
    }));
  }

  // Enrich maps with inline data not stored in DB (implementation_sequence, compliance_explanation, sprint_handoff)
  const enrichedMaps = expansionMaps.map(dbMap => {
    const inlineMatch = BUILT_IN_EXPANSION_MAPS.find(m => m.expansion_name === dbMap.expansion_name);
    return inlineMatch ? { ...dbMap, ...inlineMatch, id: dbMap.id } : dbMap;
  });

  // Step 3: Avoid duplicates
  let existingMapIds = new Set();
  try {
    const { data: existing } = await sb
      .from('client_strategy_expansions')
      .select('expansion_map_id')
      .eq('business_id', business_id)
      .in('status', ['recommended', 'potential', 'in_progress', 'completed']);
    existingMapIds = new Set((existing || []).map(e => e.expansion_map_id));
  } catch (_) { /* table may not exist yet */ }

  // Step 4: Evaluate each map
  const evaluated = [];
  for (const map of enrichedMaps) {
    if (existingMapIds.has(map.id)) continue;

    const eligResult = evaluateEligibility(map, clientSignals);
    if (eligResult.eligibilityStatus === 'INELIGIBLE') continue;  // Skip true ineligibles only

    const evidence = buildExpansionEvidence(ctx, clientData, map);
    const projectedImpact = projectImpact(map, clientData);

    const dataQualityBonus = revenue > 0 && (taxGapAmount > 0 || profitGapAmount > 0) ? 8 : 0;
    const missingPenalty = eligResult.missingDataToCollect.length * 5;
    const adjustedConfidence = Math.min(95, Math.max(25, (map.base_confidence_score || 70) + dataQualityBonus - missingPenalty));

    const qualityScores = computeQualityScores(map, eligResult, clientData, adjustedConfidence);

    evaluated.push({
      map,
      eligResult,
      evidence,
      projectedImpact,
      adjustedConfidence,
      qualityScores,
    });
  }

  // Step 5: Sort by composite score
  evaluated.sort((a, b) => b.qualityScores.composite_score - a.qualityScores.composite_score);

  // Step 6: Persist
  const persisted = [];
  if (persist && evaluated.length > 0) {
    const now = new Date().toISOString();
    for (let i = 0; i < evaluated.length; i++) {
      const { map, eligResult, projectedImpact, qualityScores, adjustedConfidence, evidence } = evaluated[i];
      const row = {
        profile_id,
        business_id,
        expansion_map_id: map.id?.startsWith('inline_') ? null : map.id,
        expansion_name: map.expansion_name,
        recommendation_type: 'strategy_expansion',
        opportunity_stack: map.expansion_sequence,
        first_order_outcomes: map.first_order_effects || [],
        second_order_outcomes: map.second_order_effects || [],
        third_order_outcomes: map.third_order_effects || [],
        affected_gaps: [map.primary_gap, ...(map.secondary_gaps || [])].filter(Boolean),
        projected_profit_impact: projectedImpact.projected_profit_impact,
        projected_tax_impact: projectedImpact.projected_tax_impact,
        projected_value_impact: projectedImpact.projected_value_impact,
        projected_cash_flow_impact: projectedImpact.projected_cash_flow_impact,
        projected_freedom_acceleration_months: projectedImpact.projected_freedom_acceleration_months,
        required_conditions_met: eligResult.metConditions,
        missing_data: eligResult.missingDataToCollect,
        supporting_evidence: evidence,
        compliance_notes: COMPLIANCE_DISCLAIMER,
        expert_review_required: map.expert_review_required || [],
        confidence_score: adjustedConfidence,
        priority_rank: i + 1,
        status: eligResult.eligibilityStatus === 'ELIGIBLE' ? 'recommended' : 'potential',
        created_at: now,
        updated_at: now,
      };
      try {
        const { data: ins } = await sb.from('client_strategy_expansions').insert(row).select('id, expansion_name, priority_rank, status').single();
        if (ins) persisted.push(ins);
      } catch (e) {
        console.warn('[expandStrategyOpportunities] persist failed (non-fatal):', e.message);
      }
    }
  }

  // Step 7: Build rich response
  const expansions = evaluated.map((e, i) => ({
    rank: i + 1,
    expansion_name: e.map.expansion_name,
    expansion_description: e.map.expansion_description,

    // Eligibility Intelligence
    eligibility: {
      status: e.eligResult.eligibilityStatus,       // ELIGIBLE | POTENTIAL
      reason: e.eligResult.eligibilityReason,
      conditions_met: e.eligResult.metConditions,
      hard_blocks_missing: e.eligResult.hardBlocksMissing.map(b => b.note),
      required_missing: e.eligResult.missingRequired.map(r => r.note),
      data_to_collect_next: e.eligResult.missingDataToCollect,
      confidence_impact: e.eligResult.missingDataToCollect.length > 0
        ? `Confidence reduced by ${e.eligResult.missingDataToCollect.length * 5}pts from missing confirmation`
        : 'Full confidence — all data available',
    },

    // Stack
    primary_gap: e.map.primary_gap,
    affected_gaps: [e.map.primary_gap, ...(e.map.secondary_gaps || [])],
    opportunity_stack: e.map.expansion_sequence,

    // Why more powerful
    why_more_powerful: `The ${e.map.expansion_name} goes beyond the base strategy. While a single move addresses the ${e.map.primary_gap} gap, this sequence creates compounding effects across ${(e.map.secondary_gaps || []).join(', ')} — each step unlocking the next.`,

    // Implementation sequence (Enhancement 2)
    implementation_sequence: e.map.implementation_sequence || [],

    // Outcomes
    first_order_outcomes: e.map.first_order_effects,
    second_order_outcomes: e.map.second_order_effects,
    third_order_outcomes: e.map.third_order_effects,

    // Projected impact
    projected_impact: {
      tax_savings: e.projectedImpact.projected_tax_impact,
      profit_improvement: e.projectedImpact.projected_profit_impact,
      value_increase: e.projectedImpact.projected_value_impact,
      cash_flow_monthly: e.projectedImpact.projected_cash_flow_impact,
      freedom_acceleration_months: e.projectedImpact.projected_freedom_acceleration_months,
    },

    // Compliance (Enhancement 3)
    compliance_explanation: e.map.compliance_explanation || COMPLIANCE_DISCLAIMER,
    compliance_note: COMPLIANCE_DISCLAIMER,
    contraindications: e.map.contraindications || [],
    expert_review_required: e.map.expert_review_required,

    // Quality scores (Enhancement 4)
    quality_scores: e.qualityScores,
    confidence_score: e.adjustedConfidence,

    // 30-day sprint handoff (Enhancement 5)
    sprint_handoff: e.map.sprint_handoff || null,

    // Supporting data
    supporting_evidence: e.evidence,
  }));

  return {
    success: true,
    expansions,
    total_expansions: expansions.length,
    eligible_count: expansions.filter(e => e.eligibility.status === 'ELIGIBLE').length,
    potential_count: expansions.filter(e => e.eligibility.status === 'POTENTIAL').length,
    persisted_count: persisted.length,
    client_signals_used: {
      has_revenue: !!evaluated[0]?.evidence?.find(ev => ev.field === 'revenue'),
      tax_gap_confirmed: taxGapAmount > 0,
      profit_gap_confirmed: profitGapAmount > 0,
      value_gap_confirmed: valueGapAmount > 0,
      children_status: 'unknown — requires owner confirmation',
      real_estate_status: clientSignals.owns_real_estate === true ? 'confirmed' : clientSignals.owns_real_estate === undefined ? 'unknown' : 'not detected',
    },
    generated_at: new Date().toISOString(),
  };
}