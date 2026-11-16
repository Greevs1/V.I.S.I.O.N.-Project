/**
 * Why Explanations — Galileo metric explanations
 *
 * Deterministic, template-based explanations for the "Why?" button on each
 * major dashboard metric. Each explanation covers four dimensions:
 *   - What: what the metric measures
 *   - Calculation: how it is derived
 *   - Provenance: data source(s)
 *   - Relevance: why it matters for decisions
 *
 * No LLM required — these are static, factual explanations tied to metric IDs.
 */

const METRIC_EXPLANATIONS = {
  profit_gap_amount: {
    what: 'Your Profit Gap measures the difference between your current net profit margin and the margin achieved by best-in-class operators in your industry.',
    calculation: 'Calculated as (industry best-in-class margin % × your revenue) − your current net profit. Requires your revenue and current net profit from the Profit Gap assessment.',
    provenance: 'Source: Profit Gap assessment · Industry benchmark library',
    relevance: 'Profit is your highest-leverage metric because it compounds twice — once in cash flow, and again in your exit valuation at your industry multiple.',
  },
  value_gap_amount: {
    what: 'Your Value Gap is the difference between what your business is worth today and what it could be worth with strategic improvements.',
    calculation: 'Calculated as your potential business value (optimized EBITDA × industry multiple) minus your current business value. Requires current revenue, margin, and EBITDA.',
    provenance: 'Source: Value Gap assessment · Industry valuation multiples',
    relevance: 'Every gap you close — profit, tax, operations — narrows this number. It is the cumulative scoreboard of your business intelligence.',
  },
  tax_gap_annual: {
    what: 'Your Tax Gap is the estimated amount you overpay in taxes annually relative to what a properly structured business would owe.',
    calculation: 'Calculated from your Tax Gap assessment inputs, comparing your current effective tax position against available legal strategies. Multiplied by 10 for the 10-year cost figure.',
    provenance: 'Source: Tax Gap assessment · IRS-aligned strategy framework',
    relevance: 'Tax overpayment compounds silently. Every dollar overpaid is a dollar that could have compounded inside the business or been reinvested.',
  },
  operations_score: {
    what: 'Your Operations Health Score measures how systematized your business is and how dependent it is on your personal involvement.',
    calculation: 'Scored 0–100 from your Operations Gap assessment, weighing process documentation, team autonomy, and owner-involvement indicators.',
    provenance: 'Source: Operations Gap assessment',
    relevance: 'Buyers apply a risk discount to owner-dependent businesses. Every process that depends on you becomes a ceiling on company value.',
  },
  freedom_score: {
    what: 'Your Freedom Score connects your business performance to your personal financial independence — what it would take to give you the choice to step away.',
    calculation: 'Derived from your Freedom Assessment inputs, modeling your personal monthly burn rate against business cash flow and current assets.',
    provenance: 'Source: Freedom Assessment',
    relevance: 'Your business gaps directly accelerate or delay your freedom timeline. Closing your highest-dollar gap is the fastest path to optionality.',
  },
  iq_score: {
    what: 'Your Impact Quotient is a composite score reflecting how efficiently your business generates, retains, and compounds value across every dimension measured.',
    calculation: 'Weighted composite of profit, value, tax, operations, recast EBITDA, and freedom signals. Higher scores indicate more of your opportunity landscape is visible and actionable.',
    provenance: 'Source: All assessments combined',
    relevance: 'A higher score means sharper decisions and fewer blind spots. It reflects readiness — not just performance.',
  },
  business_impact_score: {
    what: 'Your Business Impact Score measures how complete your intelligence profile is — how much of your opportunity landscape is currently visible.',
    calculation: 'Weighted coverage across ten intelligence dimensions, including assessment completion, document coverage, and sprint readiness.',
    provenance: 'Source: BIS coverage analysis',
    relevance: 'A more complete profile means fewer blind spots. It is the difference between navigating with a map and navigating by feel.',
  },
  recast_add_backs: {
    what: 'Recast EBITDA identifies owner-specific expenses that a new owner would not carry, revealing the true earning power of your business.',
    calculation: 'Sum of add-backs identified in your Recast EBITDA assessment — discretionary, personal, and non-recurring expenses normalized to a buyer\'s view.',
    provenance: 'Source: Recast EBITDA assessment',
    relevance: 'Buyers evaluate normalized earnings, not reported net income. Properly documenting add-backs can significantly increase what a buyer would pay.',
  },
  recast_valuation_increase: {
    what: 'The valuation increase from recasting your EBITDA — how much additional enterprise value a buyer would assign once add-backs are documented.',
    calculation: 'Calculated as (recast add-backs × your industry exit multiple). Requires recast add-backs and the multiple from your Value Gap assessment.',
    provenance: 'Source: Recast EBITDA assessment · Industry multiples',
    relevance: 'This number is often the single fastest valuation lever available — it requires no operational change, only proper documentation.',
  },
  monthly_value_of_time_freed: {
    what: 'The monthly cash value of the time freed by improving your operations — how much owner time is worth once systematized.',
    calculation: 'Calculated as your monthly take-home ÷ (hours worked per week × 4). Requires Operations Gap assessment inputs.',
    provenance: 'Source: Operations Gap assessment',
    relevance: 'Every hour you free from operations is an hour you can redirect toward growth, strategy, or stepping away — the definition of owner leverage.',
  },
};

/**
 * Get the explanation for a metric, optionally enriched with the live BIS value.
 */
export function getWhyExplanation(metricId, bis = null) {
  const exp = METRIC_EXPLANATIONS[metricId];
  if (!exp) return null;
  const r = bis?._raw || {};
  const currentValue = r[metricId];
  return {
    ...exp,
    currentValue: currentValue != null ? currentValue : null,
    metricId,
  };
}

export default { getWhyExplanation, METRIC_EXPLANATIONS };