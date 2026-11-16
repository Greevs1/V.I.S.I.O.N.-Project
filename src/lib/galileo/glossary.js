/**
 * Vision Glossary — the CONTROLLED list of industry terms Vision is allowed to
 * put an explanation affordance on.
 *
 * WHY A GLOSSARY EXISTS AT ALL
 *   · It decides WHICH words get an ⓘ affordance. A term that is not here is
 *     rendered as plain text — the interface never becomes Wikipedia (Part 16),
 *     and Vision never invents a definition for something it does not know.
 *   · It holds the CANONICAL, deterministic meaning for standard accounting and
 *     business terms (Part 32). EBITDA has one meaning; Galileo may simplify it
 *     and apply it to a business, but it may not quietly redefine it.
 *   · Contextual explanation, analogy and "what this means for my business" are
 *     NOT here. Those come from the ONE Galileo (see explainGalileo.js), because
 *     they depend on the business's own numbers.
 *
 * This is a small controlled list, not an encyclopedia. Deliberately: it covers
 * the terminology the reachable Vision surfaces actually render.
 *
 * `plain`   — one-sentence professional-but-plain meaning (Level 1).
 * `analogy` — the radically simple version, used only where it genuinely helps
 *             (Part 18). Optional; absent means the plain sentence is simple
 *             enough on its own.
 * `industry`— the industry this term belongs to when it is industry-specific
 *             (Part 25). Null means it is general business/finance language.
 */

export const GLOSSARY = {
  // ── Profitability ────────────────────────────────────────────────────────
  ebitda: {
    id: 'ebitda',
    term: 'EBITDA',
    full: 'Earnings Before Interest, Taxes, Depreciation & Amortization',
    aliases: ['ebitda'],
    category: 'profitability',
    plain:
      'A simple way to look at how much money the business makes from running the business itself, before interest on loans, taxes, and some accounting expenses.',
  },
  sde: {
    id: 'sde',
    term: 'SDE',
    full: "Seller's Discretionary Earnings",
    aliases: ['seller\u2019s discretionary earnings', "seller's discretionary earnings", 'sde'],
    category: 'profitability',
    plain:
      'How much the owner takes out of the business in total — profit plus the owner\u2019s pay plus personal expenses the business covers.',
  },
  normalized_earnings: {
    id: 'normalized_earnings',
    term: 'Normalized earnings',
    aliases: ['normalised earnings', 'normalized ebitda', 'normalised ebitda', 'normalized earnings'],
    category: 'profitability',
    plain:
      'What the profit would have looked like in a normal year, after removing one-off or owner-specific items.',
  },
  add_backs: {
    id: 'add_backs',
    term: 'Add-backs',
    aliases: ['add-backs', 'addbacks', 'add back', 'add backs'],
    category: 'profitability',
    plain:
      'Personal or one-off costs that were run through the business — they get added back to profit because a buyer would not inherit them.',
    analogy:
      'If the business pays for your personal car, that money is not really a cost of running the business. A buyer adds it back.',
  },
  gross_margin: {
    id: 'gross_margin',
    term: 'Gross margin',
    aliases: ['gross margin', 'gross profit margin'],
    category: 'profitability',
    plain:
      'What is left from each sale after paying the direct cost of delivering it, shown as a percentage.',
  },
  net_margin: {
    id: 'net_margin',
    term: 'Net margin',
    aliases: ['net margin', 'net profit margin'],
    category: 'profitability',
    plain: 'What is left as profit out of every dollar of sales, after all costs.',
  },
  cogs: {
    id: 'cogs',
    term: 'COGS',
    full: 'Cost of Goods Sold',
    aliases: ['cogs', 'cost of goods sold'],
    category: 'profitability',
    plain: 'The direct cost of delivering what you sold — materials, labour, and job costs.',
  },
  run_rate: {
    id: 'run_rate',
    term: 'Run rate',
    aliases: ['run rate', 'run-rate'],
    category: 'profitability',
    plain: 'What a recent period would add up to over a full year if it kept going at the same pace.',
  },
  ttm: {
    id: 'ttm',
    term: 'TTM',
    full: 'Trailing Twelve Months',
    aliases: ['ttm', 'trailing twelve months'],
    category: 'profitability',
    plain: 'The last twelve months of results, whenever they happened to fall.',
  },
  recurring_revenue: {
    id: 'recurring_revenue',
    term: 'Recurring revenue',
    aliases: ['recurring revenue'],
    category: 'profitability',
    plain: 'Money that comes back on a regular basis without having to win the work again.',
  },
  quality_of_earnings: {
    id: 'quality_of_earnings',
    term: 'Quality of earnings',
    aliases: ['quality of earnings', 'qoe'],
    category: 'profitability',
    plain:
      'A check that the profit shown is real, repeatable, and not created by one-off events.',
  },

  // ── Cash & working capital ──────────────────────────────────────────────
  working_capital: {
    id: 'working_capital',
    term: 'Working capital',
    aliases: ['working capital'],
    category: 'cash',
    plain:
      'The money tied up in running the day-to-day business — what customers owe you and what you hold as stock, less what you still owe others.',
    analogy:
      'Think of the cash that is temporarily parked in the business: waiting to be paid, or sitting on a shelf.',
  },
  ar: {
    id: 'ar',
    term: 'Accounts receivable',
    aliases: ['accounts receivable', 'receivables', 'a/r'],
    category: 'cash',
    plain: 'Money customers owe your business but have not paid yet.',
  },
  ap: {
    id: 'ap',
    term: 'Accounts payable',
    aliases: ['accounts payable', 'payables', 'a/p'],
    category: 'cash',
    plain: 'Money your business owes other people but has not paid yet.',
  },
  cash_conversion_cycle: {
    id: 'cash_conversion_cycle',
    term: 'Cash conversion cycle',
    aliases: ['cash conversion cycle'],
    category: 'cash',
    plain: 'How many days the business waits between paying for its work and being paid for it.',
  },
  free_cash_flow: {
    id: 'free_cash_flow',
    term: 'Free cash flow',
    aliases: ['free cash flow'],
    category: 'cash',
    plain: 'The cash the business produces after paying for the things it needs to keep running and growing.',
  },
  capex: {
    id: 'capex',
    term: 'Capital expenditure',
    aliases: ['capex', 'capital expenditure', 'capital expenditures'],
    category: 'cash',
    plain: 'Money spent on equipment, vehicles, or property that the business will use for years.',
  },
  debt_service: {
    id: 'debt_service',
    term: 'Debt service',
    aliases: ['debt service'],
    category: 'cash',
    plain: 'The total loan payments the business has to make — both the interest and the principal.',
  },
  dscr: {
    id: 'dscr',
    term: 'DSCR',
    full: 'Debt Service Coverage Ratio',
    aliases: ['dscr', 'debt service coverage ratio'],
    category: 'cash',
    plain:
      'How many times over the business can cover its loan payments with the cash it generates. Lenders usually want it above 1.25.',
  },
  leverage: {
    id: 'leverage',
    term: 'Leverage',
    // 'leverage' alone is usually a verb in business prose ("leverage our
    // strengths"). Only the unambiguous forms auto-detect; an explicit
    // affordance still resolves the entry by name.
    aliases: ['leverage ratio', 'gearing'],
    category: 'cash',
    plain: 'How much of the business is funded by borrowing rather than by the owner.',
  },

  // ── Value & valuation ──────────────────────────────────────────────────
  enterprise_value: {
    id: 'enterprise_value',
    term: 'Enterprise value',
    aliases: ['enterprise value'],
    category: 'value',
    plain: 'What the business itself is judged to be worth, before loans and cash are accounted for.',
  },
  valuation_multiple: {
    id: 'valuation_multiple',
    term: 'Valuation multiple',
    // 'multiple' / 'multiples' are ordinary English ("multiple vendors", "multiple
    // accounts") — as auto-detect aliases they would attach a valuation definition
    // to the wrong sentence, so they are not terms. The phrase forms stay, and an
    // explicit affordance can still resolve this entry by name.
    aliases: ['valuation multiple', 'ebitda multiple'],
    category: 'value',
    plain: 'A number used to turn earnings into an estimated business value.',
    analogy:
      'If a business earns $1M and the multiple is 5×, the estimate is $5M. The multiple reflects how attractive and repeatable those earnings are.',
  },
  margin_expansion: {
    id: 'margin_expansion',
    term: 'Margin expansion',
    aliases: ['margin expansion'],
    category: 'value',
    plain: 'Keeping more of each dollar of sales than you used to.',
  },
  multiple_expansion: {
    id: 'multiple_expansion',
    term: 'Multiple expansion',
    aliases: ['multiple expansion'],
    category: 'value',
    plain:
      'The business becoming worth more per dollar of earnings, because it looks safer or more attractive to a buyer.',
  },

  // ── Risk & concentration ───────────────────────────────────────────────
  customer_concentration: {
    id: 'customer_concentration',
    term: 'Customer concentration',
    aliases: ['customer concentration', 'revenue concentration', 'client concentration'],
    category: 'risk',
    plain: 'How much of your revenue depends on a small number of customers.',
    analogy:
      'Imagine you have 10 customers, but one customer gives you half your money. If that customer leaves, it hurts a lot. That is customer concentration.',
  },
  owner_dependency: {
    id: 'owner_dependency',
    term: 'Owner dependency',
    aliases: ['owner dependency', 'owner dependence', 'key-person risk', 'key person risk'],
    category: 'risk',
    plain:
      'How much the business relies on the owner personally — relationships, decisions, or know-how that would leave with them.',
  },
  succession_risk: {
    id: 'succession_risk',
    term: 'Succession risk',
    aliases: ['succession risk', 'succession'],
    category: 'risk',
    plain: 'The risk that the business struggles when the current owner or leader steps away.',
  },
  transferability: {
    id: 'transferability',
    term: 'Transferability',
    aliases: ['transferability', 'transferable'],
    category: 'risk',
    plain: 'How easily the business would keep working if someone else owned it.',
  },

  // ── Growth & marketing ─────────────────────────────────────────────────
  cac: {
    id: 'cac',
    term: 'CAC',
    full: 'Customer Acquisition Cost',
    aliases: ['cac', 'customer acquisition cost'],
    category: 'growth',
    plain: 'What it costs, on average, to win one new customer.',
  },
  ltv: {
    id: 'ltv',
    term: 'LTV',
    full: 'Lifetime Value',
    aliases: ['ltv', 'lifetime value', 'customer lifetime value'],
    category: 'growth',
    plain: 'How much profit one customer is expected to bring in over the whole time they stay.',
  },
  churn: {
    id: 'churn',
    term: 'Churn',
    aliases: ['churn'],
    category: 'growth',
    plain: 'The share of customers who leave over a period.',
  },
  arr: {
    id: 'arr',
    term: 'ARR',
    full: 'Annual Recurring Revenue',
    aliases: ['arr', 'annual recurring revenue'],
    industry: 'saas',
    category: 'growth',
    plain: 'The yearly value of subscriptions you have already won, counted once, not per payment.',
  },
  mrr: {
    id: 'mrr',
    term: 'MRR',
    full: 'Monthly Recurring Revenue',
    aliases: ['mrr', 'monthly recurring revenue'],
    industry: 'saas',
    category: 'growth',
    plain: 'The monthly value of your subscriptions, counted once a month.',
  },
  nrr: {
    id: 'nrr',
    term: 'NRR',
    full: 'Net Revenue Retention',
    aliases: ['nrr', 'net revenue retention'],
    industry: 'saas',
    category: 'growth',
    plain:
      'Whether the customers you already have spend more or less with you this year than last, after any who left.',
  },

  // ── Industry: construction & trades ────────────────────────────────────
  backlog: {
    id: 'backlog',
    term: 'Backlog',
    aliases: ['backlog'],
    industry: 'construction',
    category: 'industry',
    plain: 'Work you have already won but have not finished yet.',
  },
  wip: {
    id: 'wip',
    term: 'WIP',
    full: 'Work in Progress',
    aliases: ['wip', 'work in progress', 'work-in-progress'],
    industry: 'construction',
    category: 'industry',
    plain: 'Jobs you have started and partly completed but not yet billed in full.',
  },
  retainage: {
    id: 'retainage',
    term: 'Retainage',
    // 'retention' is ambiguous (employee retention) — only the unambiguous
    // construction word auto-detects.
    aliases: ['retainage'],
    industry: 'construction',
    category: 'industry',
    plain:
      'Money the customer holds back until the job is finished and signed off. You have earned it, but you do not have it yet.',
  },
  bonding_capacity: {
    id: 'bonding_capacity',
    term: 'Bonding capacity',
    aliases: ['bonding capacity'],
    industry: 'construction',
    category: 'industry',
    plain: 'How much work a surety will let you take on at once, based on your finances and track record.',
  },

  // ── Industry: professional services ────────────────────────────────────
  utilization: {
    id: 'utilization',
    term: 'Utilization',
    aliases: ['utilization', 'utilisation'],
    industry: 'professional_services',
    category: 'industry',
    plain: 'The share of your team\u2019s available hours that are actually billed to clients.',
  },
  realization: {
    id: 'realization',
    term: 'Realization',
    aliases: ['realization', 'realisation'],
    industry: 'professional_services',
    category: 'industry',
    plain:
      'How much of your standard rate you actually collect, after discounts and any amounts you choose not to bill.',
  },
  billable_rate: {
    id: 'billable_rate',
    term: 'Billable rate',
    aliases: ['billable rate'],
    industry: 'professional_services',
    category: 'industry',
    plain: 'What you charge per hour of work.',
  },

  // ── Industry: healthcare ───────────────────────────────────────────────
  payer_mix: {
    id: 'payer_mix',
    term: 'Payer mix',
    aliases: ['payer mix'],
    industry: 'healthcare',
    category: 'industry',
    plain: 'The blend of who pays you — insurers, government programmes, or patients directly.',
  },
  reimbursement_rate: {
    id: 'reimbursement_rate',
    term: 'Reimbursement rate',
    aliases: ['reimbursement rate'],
    industry: 'healthcare',
    category: 'industry',
    plain: 'What you actually get paid for a service, compared to what you bill for it.',
  },

  // ── Analysis methods that appear as Sprint tasks ───────────────────────
  cohort_analysis: {
    id: 'cohort_analysis',
    term: 'Cohort analysis',
    aliases: ['cohort analysis', 'cohort'],
    category: 'method',
    plain:
      'Grouping customers into similar buckets so you can see which groups stay, leave, or spend more.',
  },
  unit_economics: {
    id: 'unit_economics',
    term: 'Unit economics',
    aliases: ['unit economics'],
    category: 'method',
    plain: 'Whether you make money on one customer, one job, or one sale — before counting the overheads.',
  },
  pricing_power: {
    id: 'pricing_power',
    term: 'Pricing power',
    aliases: ['pricing power'],
    category: 'method',
    plain: 'How easily you can raise prices without losing customers.',
  },
};

/** Every alias, longest first — so "customer concentration" wins over "concentration". */
const ALIAS_INDEX = Object.values(GLOSSARY)
  .flatMap((entry) => entry.aliases.map((alias) => ({ alias, entry })))
  .sort((a, b) => b.alias.length - a.alias.length);

/** `ebitda`, `EBITDA`, `EBITDA ` — all resolve. Returns null when unknown. */
export function resolveTerm(key) {
  if (!key) return null;
  const raw = String(key).trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (GLOSSARY[lower]) return GLOSSARY[lower];
  const byAlias = ALIAS_INDEX.find((e) => e.alias === lower);
  if (byAlias) return byAlias.entry;
  const byName = Object.values(GLOSSARY).find((e) => e.term.toLowerCase() === lower);
  return byName || null;
}

/**
 * Find the terms Vision is allowed to explain inside free text (a Sprint task
 * title, an expert brief line, a Playbook row). Deterministic word-boundary
 * matching — it never guesses at a term that is not in the glossary.
 */
export function detectTerms(text, { max = 2, exclude = [] } = {}) {
  if (!text) return [];
  const found = [];
  const haystack = String(text);
  const skip = new Set(exclude);
  for (const { alias, entry } of ALIAS_INDEX) {
    if (found.length >= max) break;
    if (skip.has(entry.id) || found.some((f) => f.id === entry.id)) continue;
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // One word → word boundaries; multi-word → boundaries around the phrase.
    const pattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
    if (pattern.test(haystack)) found.push(entry);
  }
  return found;
}

/**
 * Extracted-document field keys → the glossary term behind them, so accounting
 * language that came out of a P&L can be explained where it is shown (Part 27).
 * A key that is not mapped simply gets no affordance.
 */
export const DOCUMENT_FIELD_TERMS = {
  accounts_receivable: 'ar',
  accounts_payable: 'ap',
  inventory: 'working_capital',
  cost_of_goods_sold: 'cogs',
  cogs: 'cogs',
  gross_profit: 'gross_margin',
  gross_margin: 'gross_margin',
  net_income: 'net_margin',
  net_profit: 'net_margin',
  ebitda: 'ebitda',
  operating_expenses: 'net_margin',
  owner_compensation: 'sde',
  depreciation: 'ebitda',
  amortization: 'ebitda',
  interest_expense: 'debt_service',
  total_debt: 'leverage',
  capital_expenditures: 'capex',
  revenue: null,
};

/** The glossary term for an extracted field, if Vision can explain it. */
export function termForDocumentField(fieldKeyOrName) {
  if (!fieldKeyOrName) return null;
  const key = String(fieldKeyOrName).trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (DOCUMENT_FIELD_TERMS[key]) return GLOSSARY[DOCUMENT_FIELD_TERMS[key]] || null;
  return resolveTerm(fieldKeyOrName);
}

/**
 * Session memory for explanations (Part 24).
 *
 * A term is explained ONCE per active session, so a card does not re-teach the
 * same word every time it appears. In memory only — deliberately no database,
 * no localStorage, nothing to clean up. A refresh starts a fresh session, which
 * is the correct amount of persistence for a teaching hint.
 */
const explainedThisSession = new Set();

export function markTermExplained(termId) {
  if (termId) explainedThisSession.add(termId);
}

export function hasTermBeenExplained(termId) {
  return !!termId && explainedThisSession.has(termId);
}

export function resetExplainedTerms() {
  explainedThisSession.clear();
}