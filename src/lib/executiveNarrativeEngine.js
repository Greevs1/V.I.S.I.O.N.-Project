/**
 * Executive Narrative Engine
 *
 * Converts a BusinessIntelligenceState (BIS) object into structured narrative
 * insight objects. Each object is a self-contained briefing unit for Galileo.
 *
 * Style: strategic advisor voice — educational, factual, never salesy.
 * No pricing, no membership pitch, no advisory upsell until the final step.
 *
 * Output shape per metric:
 * {
 *   id:               string  — unique identifier
 *   category:         string  — 'overview' | 'profit' | 'value' | 'tax' | 'operations' | 'recast' | 'freedom' | 'action'
 *   title:            string  — short display label
 *   headline:         string  — one bold sentence summarizing the finding
 *   observation:      string  — what Galileo found (data-driven, no invention)
 *   whatItMeans:      string  — plain-English explanation for a non-financial owner
 *   recommendation:   string  — one concrete next action
 *   impact:           string | null  — formatted dollar/score impact if measurable
 *   confidence:       'high' | 'medium' | 'low' | 'none'
 *   source:           string  — where data came from
 *   nextActionLabel:  string  — CTA button text
 *   nextActionTarget: string  — route or URL
 *   priority:         number  — sort order (lower = higher priority)
 *   hasData:          boolean — false means assessment not yet completed
 * }
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n) => {
  if (n == null || isNaN(n) || n === 0) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
};

const fmtPerYear = (n) => {
  const f = fmt(n);
  return f ? `${f}/yr` : null;
};

const fmtScore = (n) => (n != null && !isNaN(n)) ? `${Math.round(n)}/100` : null;

function confidence(bis, type) {
  const r = bis?._raw || {};
  switch (type) {
    case 'profit':     return r.profit_gap_amount != null ? 'high' : 'none';
    case 'value':      return r.value_gap_amount != null ? 'high' : 'none';
    case 'tax':        return r.tax_gap_annual != null ? 'high' : 'none';
    case 'operations': return r.operations_score != null ? 'high' : 'none';
    case 'recast':     return (r.recast_ebitda != null || r.recast_add_backs != null) ? 'high' : 'none';
    case 'freedom':    return r.freedom_score != null ? 'high' : 'none';
    case 'iq':         return r.iq_score != null ? 'medium' : 'low';
    default:           return 'low';
  }
}

/**
 * isAssessmentCompleted — reads the contract's explicit `completed` flag.
 *
 * The Shared Intelligence Contract (embedded in bis._sources.assessmentSummary.
 * intelligence_contract) is the single certified owner of assessment completion
 * state. A completed assessment with a zero result is still ASSESSED.
 *
 * Consumers MUST NOT infer completion from a truthy metric (gap > 0, score != null).
 * If completed = true, the narrative may NEVER say "Not assessed."
 *
 * Falls back to metric presence only when the contract is unavailable (legacy path).
 */
function isAssessmentCompleted(bis, type) {
  const contract = bis?._sources?.assessmentSummary?.intelligence_contract;

  // PRIMARY: Shared Intelligence Contract — the single certified owner.
  if (contract?.assessments?.[type]) {
    const completed = contract.assessments[type].completed === true;
    if (completed) return true;
    // Contract says not completed — check if it's truly not completed vs. still loading
    // by verifying the contract has been fully built (has assessment_completion_count)
    if (contract.assessment_completion_count != null) {
      return false; // contract is loaded and says not completed
    }
  }

  // SECONDARY: bis._raw values are contract-derived via the BIE engine.
  // If the BIE engine resolved a non-null value, the contract/assessment had data.
  // This handles the race condition where the briefing renders before the
  // full contract object is embedded but the BIE has already resolved metrics.
  const r = bis?._raw || {};
  switch (type) {
    case 'profit_gap':       return r.profit_gap_amount != null;
    case 'value_gap':        return r.value_gap_amount != null || r.current_value != null;
    case 'tax_gap':          return r.tax_gap_annual != null;
    case 'operations_gap':   return r.operations_score != null;
    case 'recast_ebitda':    return r.recast_ebitda != null || r.recast_add_backs != null;
    case 'freedom_assessment': return r.freedom_score != null;
    default:                 return false;
  }
}

/**
 * isContractLoaded — checks whether the Shared Intelligence Contract is available.
 * Used to distinguish LOADING from NOT_ASSESSED.
 */
function isContractLoaded(bis) {
  const contract = bis?._sources?.assessmentSummary?.intelligence_contract;
  return !!(contract && contract.assessments && contract.assessment_completion_count != null);
}

// ── Individual Narrative Builders ─────────────────────────────────────────────

function buildIQScoreNarrative(bis) {
  const r = bis?._raw || {};
  const score = r.iq_score;
  const hasScore = score != null;

  let headline, observation, whatItMeans;

  if (!hasScore) {
    headline = 'Your Intelligence Profile is being assembled.';
    observation = 'No composite score has been calculated yet. Complete at least two gap assessments to generate your Impact Quotient.';
    whatItMeans = 'The IQ Score reflects how efficiently your business generates, retains, and compounds value across profit, tax, operations, and exit readiness.';
  } else {
    const tier = score >= 75 ? 'strong' : score >= 50 ? 'developing' : 'early-stage';
    headline = `Your Impact Quotient is ${Math.round(score)} — a ${tier} intelligence profile.`;
    observation = `Your score of ${Math.round(score)} was derived from the assessments you have completed. It reflects measurable performance across profit efficiency, tax structure, operations health, and value creation readiness.`;
    whatItMeans = score >= 75
      ? 'A score in this range indicates the business is operating with measurable efficiency. The highest-leverage moves now are compounding the gains already in place.'
      : score >= 50
      ? 'There is a solid foundation here — and meaningful gaps that are still open. The goal is to close those gaps in a sequenced, highest-impact-first order.'
      : 'This reflects an early-stage intelligence profile. That is normal at this point in the process. Every assessment completed sharpens the picture and reveals the next highest-leverage move.';
  }

  return {
    id: 'iq_score',
    category: 'overview',
    title: 'Impact Quotient™',
    headline,
    observation,
    whatItMeans,
    recommendation: hasScore
      ? 'Focus on the gap with the highest dollar impact first — that is where Galileo will direct its attention.'
      : 'Complete the Profit Gap assessment to generate your first IQ Score data point.',
    impact: hasScore ? `${Math.round(score)}/100` : null,
    confidence: confidence(bis, 'iq'),
    source: r.iq_score != null ? 'Assessment data' : 'Pending assessments',
    nextActionLabel: hasScore ? 'View Gap Analysis' : 'Start Profit Gap',
    nextActionTarget: hasScore ? '/dashboard' : '/assessments/profit-gap',
    priority: 1,
    hasData: hasScore,
  };
}

function buildBusinessImpactScoreNarrative(bis, impactResult) {
  const score = impactResult?.impact_score ?? 0;
  const label = impactResult?.impact_label ?? 'Getting Started';
  const remaining = impactResult?.remaining_unknowns ?? [];
  const opportunity = impactResult?.identified_opportunity;
  const completion = impactResult?.completion_percent ?? 0;

  const hasData = score > 0;

  return {
    id: 'business_impact_score',
    category: 'overview',
    title: 'Intelligence Profile Score',
    headline: hasData
      ? `Your intelligence profile is ${completion}% complete — ${label}.`
      : 'Your intelligence profile has not started yet.',
    observation: hasData
      ? `${Object.values(impactResult?.dimensions || {}).filter(d => d.present).length} of the key intelligence dimensions have been populated. ${remaining.length > 0 ? `Still missing: ${remaining.slice(0, 3).join(', ')}.` : 'All major dimensions are active.'}`
      : 'No assessments or documents have been completed yet. Each one adds a new dimension of clarity to the business picture.',
    whatItMeans: 'This score measures how complete your business intelligence profile is — not how well the business is performing. A higher score means more of the opportunity landscape is visible and actionable. It is a measure of readiness, not results.',
    recommendation: remaining.length > 0
      ? `Complete the ${remaining[0]} assessment next to increase your intelligence coverage.`
      : 'Your profile is comprehensive. Focus on closing the highest-dollar gap identified.',
    impact: opportunity ? `${fmt(opportunity)} identified opportunity` : null,
    confidence: completion >= 60 ? 'high' : completion >= 30 ? 'medium' : 'low',
    source: 'BusinessIntelligenceState calculation',
    nextActionLabel: remaining.length > 0 ? `Complete ${remaining[0]}` : 'View Sprint Plan',
    nextActionTarget: remaining.length > 0 ? '/assessments/profit-gap' : '/dashboard',
    priority: 2,
    hasData,
  };
}

function buildProfitGapNarrative(bis) {
  const r = bis?._raw || {};
  const as = bis?._sources?.assessmentSummary || {};
  const gap = r.profit_gap_amount;
  const revenue = r.revenue;
  const severity = bis?.profit?.severity;
  const details = bis?.profit?.details || {};
  const gapToAvg = details.gap_to_average;
  const completed = isAssessmentCompleted(bis, 'profit_gap');
  const hasData = gap != null && gap > 0;

  let headline, observation, whatItMeans;

  if (!completed) {
    headline = 'Profit Gap assessment not yet completed.';
    observation = 'No profit gap data is available. Complete the Profit Gap assessment to compare your margin against industry benchmarks.';
    whatItMeans = 'The Profit Gap measures the difference between what your business earns in profit margin and what the best operators in your industry earn. Every margin point recovered adds directly to owner income and business value at exit.';
  } else if (!hasData) {
    headline = 'Your Profit Gap assessment is complete — no significant margin gap was found.';
    observation = revenue
      ? `Based on your reported revenue of ${fmt(revenue)}, your current margin is tracking close to best-in-class operators in your industry. No material gap was identified.`
      : 'The analysis found no material gap between your current margin and best-in-class operators in your industry.';
    whatItMeans = 'This is a strong result. It means your cost structure and pricing discipline are already aligned with top performers. The focus now shifts to compounding that strength through value, tax, and operations optimization.';
  } else {
    headline = `There is ${fmt(gap)}/year in uncaptured profit identified between your current margin and best-in-class operators.`;
    observation = revenue
      ? `Based on your reported revenue of ${fmt(revenue)}, your current margin sits below top-quartile operators in your industry. Closing this gap would add ${fmt(gap)} annually without requiring any additional revenue.`
      : `The profit analysis identified a ${fmt(gap)}/year gap to best-in-class margins in your industry.${gapToAvg ? ` The gap to the industry average is ${fmt(gapToAvg)}/year.` : ''}`;
    whatItMeans = 'Profit is the highest-leverage gap in most businesses because it compounds in two directions: it adds to owner income immediately, and it multiplies at exit. A $1 improvement in annual profit typically adds $4–5 in business value, depending on the exit multiple.';
  }

  return {
    id: 'profit_gap',
    category: 'profit',
    title: 'Profit Gap',
    headline,
    observation,
    whatItMeans,
    recommendation: hasData
      ? 'Review your top three expense categories against industry benchmarks. Margin improvement rarely requires reducing revenue — it usually comes from cost structure and pricing discipline.'
      : 'Enter your revenue and current profit margin to see how your margins compare to your industry.',
    impact: hasData ? fmt(gap) : null,
    confidence: confidence(bis, 'profit'),
    source: as?.profit_gap_amount != null ? 'Profit Gap Assessment' : 'Dashboard metrics',
    nextActionLabel: completed ? (hasData ? 'Review Profit Assessment' : 'Revisit Profit Assessment') : 'Start Profit Gap',
    nextActionTarget: '/assessments/profit-gap',
    priority: 3,
    hasData: completed,
  };
}

function buildValueGapNarrative(bis) {
  const r = bis?._raw || {};
  const currentValue = r.current_value;
  const potentialValue = r.potential_value;
  const gap = r.value_gap_amount;
  const completed = isAssessmentCompleted(bis, 'value_gap');
  const hasData = gap != null && gap > 0;

  let headline, observation, whatItMeans;

  if (!completed) {
    headline = 'Value Gap assessment not yet completed.';
    observation = 'No business valuation data is available. The Value Gap assessment calculates the difference between what your business is worth today and what it could be worth with strategic improvements.';
    whatItMeans = 'Business value is determined by a combination of earnings, growth, risk, and transferability. Most owners do not realize how much of their potential value is still locked inside the operating model — unrealized until exit.';
  } else if (!hasData) {
    headline = 'Your Value Gap assessment is complete — no significant value gap was found.';
    observation = currentValue
      ? `Your current business value is estimated at ${fmt(currentValue)}. The analysis found no material gap between your current value and your potential value at this time.`
      : 'The analysis found no material gap between your current business value and its potential value at this time.';
    whatItMeans = 'This is a positive signal. It means your business is already capturing most of its potential value. The focus now shifts to protecting that value through operations, tax efficiency, and transferability.';
  } else {
    headline = currentValue && potentialValue
      ? `Your business could be worth ${fmt(potentialValue)} — compared to approximately ${fmt(currentValue)} today.`
      : `There is a ${fmt(gap)} value gap identified between current and potential enterprise value.`;
    observation = currentValue && potentialValue
      ? `The analysis estimates your current business value at ${fmt(currentValue)}. With improvements to margin, operations, and buyer readiness, the potential value reaches ${fmt(potentialValue)} — a ${fmt(gap)} gap.`
      : `The Value Gap of ${fmt(gap)} represents the difference between what buyers would pay today and what the business could command with better profitability and transferability.`;
    whatItMeans = 'This is not just an exit number. If you ever want to sell, raise capital, bring in a partner, or simply know what you have built — this is what the business is worth to someone other than you. The gap closes as you improve margins, reduce owner dependency, and build systems that run without you.';
  }

  return {
    id: 'value_gap',
    category: 'value',
    title: 'Value Gap',
    headline,
    observation,
    whatItMeans,
    recommendation: hasData
      ? 'The fastest way to close the value gap is to improve EBITDA margins and reduce owner dependency. Both directly raise the multiple a buyer or investor would apply.'
      : 'Complete the Value Gap assessment to see your estimated current and potential business value.',
    impact: hasData ? fmt(gap) : null,
    confidence: confidence(bis, 'value'),
    source: 'Value Gap Assessment',
    nextActionLabel: completed ? (hasData ? 'Review Valuation' : 'Revisit Valuation') : 'Start Value Gap',
    nextActionTarget: '/assessments/value-gap',
    priority: 4,
    hasData: completed,
  };
}

function buildTaxGapNarrative(bis) {
  const r = bis?._raw || {};
  const annual = r.tax_gap_annual;
  const tenYear = r.tax_gap_ten_year;
  const stratCount = r.tax_strategy_count;
  const completed = isAssessmentCompleted(bis, 'tax_gap');
  const hasData = annual != null && annual > 0;

  let headline, observation, whatItMeans;

  if (!completed) {
    headline = 'Tax Gap assessment not yet completed.';
    observation = 'No tax gap data is available. The Tax Gap assessment identifies legal, IRS-approved strategies that may reduce unnecessary tax overpayment based on your income structure and entity type.';
    whatItMeans = 'Most business owners pay more in taxes than they need to — not because of anything improper, but because the default tax system does not proactively suggest strategies. A proactive tax advisor or structure change can often capture meaningful savings without any aggressive or risky approaches.';
  } else if (!hasData) {
    headline = 'Your Tax Gap assessment is complete — no significant tax overpayment was identified.';
    observation = 'Based on your income structure and entity type, the analysis found no material tax overpayment at this time. Your current tax structure appears aligned with the strategies available to your profile.';
    whatItMeans = 'This is a positive signal. It means your tax structure is already capturing the strategies appropriate for your situation. The focus now shifts to ensuring this efficiency is preserved as your income and entity structure evolve.';
  } else {
    headline = `The tax analysis identified approximately ${fmtPerYear(annual)} in potential annual tax overpayment.`;
    observation = tenYear
      ? `Over 10 years, at current rates, that compounds to ${fmt(tenYear)}. ${stratCount ? `${stratCount} specific tax strategies were identified during the assessment.` : ''} These are legal structures most business owners in your position are not currently using.`
      : `${stratCount ? `${stratCount} tax strategy opportunities were identified.` : ''} These are legal, IRS-approved approaches — not aggressive shelters.`;
    whatItMeans = 'This is not about tax avoidance. It is about making sure the tax structure is working as hard as the business. Every dollar paid unnecessarily is a dollar that could have compounded inside a retirement account, been reinvested in the business, or been distributed as owner income.';
  }

  return {
    id: 'tax_gap',
    category: 'tax',
    title: 'Tax Gap',
    headline,
    observation,
    whatItMeans,
    recommendation: hasData
      ? 'Start with the highest-dollar strategy identified and review it with a qualified tax advisor before year-end. The goal is implementation, not just awareness.'
      : 'Complete the Tax Gap assessment with your income and entity type to see your estimated annual overpayment.',
    impact: hasData ? fmtPerYear(annual) : null,
    confidence: confidence(bis, 'tax'),
    source: 'Tax Gap Assessment',
    nextActionLabel: completed ? (hasData ? 'Review Tax Strategies' : 'Revisit Tax Strategies') : 'Start Tax Gap',
    nextActionTarget: '/assessments/tax-gap',
    priority: 5,
    hasData: completed,
  };
}

function buildOperationsGapNarrative(bis) {
  const r = bis?._raw || {};
  const score = r.operations_score;
  const hoursWorked = r.hours_worked_per_week;
  const hourlyValue = r.hourly_value_of_time_freed;
  const monthlyValue = r.monthly_value_of_time_freed;
  const hoursFreed = r.hours_freed_per_week || 10;
  const completed = isAssessmentCompleted(bis, 'operations_gap');
  const hasData = score != null;

  let headline, observation, whatItMeans;

  if (!completed) {
    headline = 'Operations assessment not yet completed.';
    observation = 'No operations health data is available. The Operations Gap assessment scores how systematized your business is — and how dependent it is on your personal involvement.';
    whatItMeans = 'Your time is one of the most expensive resources in the business. If the business cannot run without you for more than a few days, that creates two problems: it limits your personal freedom, and it reduces what a buyer would pay at exit. Both are solvable with the right systems.';
  } else if (!hasData) {
    headline = 'Your Operations assessment is complete — your operational health score is being calculated.';
    observation = 'The assessment has been completed. Your operations health score will appear here once the calculation is finalized across all six dimensions of operational maturity.';
    whatItMeans = 'Completing this assessment is the first step toward understanding how systematized your business is. The score reveals where owner-dependency creates risk — and where delegation and systems will produce the largest gains in both time and value.';
  } else {
    const tier = score >= 75 ? 'well-systematized' : score >= 45 ? 'moderately owner-dependent' : 'heavily owner-dependent';
    headline = `Your Operations Health Score is ${Math.round(score)}/100 — currently ${tier}.`;
    observation = hoursWorked && hourlyValue
      ? `You are working approximately ${hoursWorked} hours per week. At your current compensation level, each recovered hour is worth approximately ${fmt(hourlyValue)}. Recovering ${hoursFreed} hours per week through delegation and systems creates roughly ${fmt(monthlyValue)}/month of time value.`
      : `An operations score of ${Math.round(score)} indicates ${score < 45 ? 'significant owner-dependency that reduces business transferability and exit value' : score < 75 ? 'moderate systems maturity with clear opportunities to reduce personal bottlenecks' : 'strong operational foundation with well-documented processes and delegation'}.`;
    whatItMeans = 'Buyers apply a risk discount to owner-dependent businesses. The more the business relies on your specific knowledge, relationships, or daily presence, the lower the multiple they will pay. Improving this score simultaneously protects your business value and returns time to you.';
  }

  return {
    id: 'operations_gap',
    category: 'operations',
    title: 'Operations Health',
    headline,
    observation,
    whatItMeans,
    recommendation: hasData
      ? score < 60
        ? 'Identify the three processes that cannot run without you personally. Documenting and delegating those three will produce the largest improvement in your score and your time.'
        : 'Continue building delegation depth. The goal is not just running well today — it is running well without you present.'
      : 'Complete the Operations assessment to score your business across six dimensions of operational maturity.',
    impact: hasData ? fmtScore(score) : null,
    confidence: confidence(bis, 'operations'),
    source: 'Operations Gap Assessment',
    nextActionLabel: completed ? (hasData ? 'Review Operations Score' : 'Revisit Operations') : 'Start Operations Gap',
    nextActionTarget: '/assessments/operations-gap',
    priority: 6,
    hasData: completed,
  };
}

function buildRecastEbitdaNarrative(bis) {
  const r = bis?._raw || {};
  const recastEbitda = r.recast_ebitda;
  const addBacks = r.recast_add_backs;
  const valIncrease = r.recast_valuation_increase;
  const completed = isAssessmentCompleted(bis, 'recast_ebitda');
  // hasData: any meaningful recast value exists (recast EBITDA, add-backs, or value impact)
  const hasData = (recastEbitda != null && recastEbitda > 0) || (addBacks != null && addBacks > 0);

  let headline, observation, whatItMeans;

  if (!completed) {
    headline = 'Recast EBITDA assessment not yet completed.';
    observation = 'No recast EBITDA data is available. This assessment identifies owner-specific expenses that a new owner would not carry — which directly increases what a buyer would pay for the business.';
    whatItMeans = 'When a buyer evaluates a business, they do not look at your reported net income. They look at a "normalized" or "recast" earnings figure that removes personal expenses. Understanding this number is one of the simplest ways to immediately increase perceived business value.';
  } else if (!hasData) {
    headline = 'Your Recast EBITDA assessment is complete — no significant owner add-backs were identified.';
    observation = 'The analysis reviewed your expenses for owner-specific costs that a new owner would not carry. No material add-backs were found at this time, meaning your reported earnings are already close to your normalized EBITDA.';
    whatItMeans = 'This is a clean result. It means your P&L is already showing the true earning power of the business. The focus now shifts to protecting that earnings quality through margin and operations optimization.';
  } else {
    // Distinguish recast EBITDA (primary) from add-backs (how we got there) and value impact (why it matters)
    headline = recastEbitda != null
      ? `Your recast EBITDA is ${fmt(recastEbitda)}/year — ${fmt(addBacks)} in owner add-backs normalized into your earnings.`
      : `${fmt(addBacks)}/year in owner add-backs have been identified that increase your recast EBITDA.`;
    observation = valIncrease
      ? `After removing ${fmt(addBacks)}/year in owner-related expenses, your normalized EBITDA${recastEbitda != null ? ` is ${fmt(recastEbitda)}/year` : ''}. At a typical exit multiple, this recasting is estimated to increase business value by approximately ${fmt(valIncrease)}.`
      : `${fmt(addBacks)}/year in owner add-backs have been documented. These are legitimate expenses that a new owner would not incur, and they directly increase the earnings a buyer evaluates.`;
    whatItMeans = 'This is one of the most underutilized levers in a business sale. Owners often undervalue their business because they show personal expenses inside the P&L. A proper recast shows the true earning power — and that number commands a higher multiple.';
  }

  return {
    id: 'recast_ebitda',
    category: 'recast',
    title: 'Recast EBITDA',
    headline,
    observation,
    whatItMeans,
    recommendation: hasData
      ? 'Work with your CPA to formally document these add-backs in a quality-of-earnings format. A buyer will scrutinize every line — preparation is protection.'
      : 'Complete the Recast EBITDA assessment to identify owner expenses that increase your normalized earnings.',
    impact: hasData ? fmt(valIncrease || recastEbitda || addBacks) : null,
    confidence: confidence(bis, 'recast'),
    source: 'Recast EBITDA Assessment',
    nextActionLabel: completed ? (hasData ? 'Review Recast EBITDA' : 'Revisit Recast EBITDA') : 'Start Recast EBITDA',
    nextActionTarget: '/assessments/recast-ebitda',
    priority: 7,
    hasData: completed,
  };
}

function buildFreedomNarrative(bis) {
  const r = bis?._raw || {};
  const freedomScore = r.freedom_score;
  const profitGap = r.profit_gap_amount;
  const taxGap = r.tax_gap_annual;
  const completed = isAssessmentCompleted(bis, 'freedom_assessment');
  const hasData = freedomScore != null;
  const hasDependentData = profitGap != null || taxGap != null;

  let headline, observation, whatItMeans;

  if (!completed) {
    headline = 'Freedom Assessment not yet completed.';
    observation = 'No Freedom Score has been calculated yet. The Freedom Assessment connects your business performance to your personal financial independence timeline.';
    whatItMeans = 'Most business owners work hard to build wealth — but rarely model what it would actually take to stop having to. The Freedom Assessment maps your current business metrics against your personal income goals and calculates the specific gap between where you are and where you need to be.';
  } else if (!hasData) {
    headline = 'Your Freedom Assessment is complete — your Freedom Score is being finalized.';
    observation = 'The assessment has been completed. Your Freedom Score — which connects your business performance to your personal financial independence timeline — will appear here once the calculation is finalized.';
    whatItMeans = 'Completing this assessment is the first step toward modeling what it would take to reach financial independence. The score reveals the gap between where you are and where you need to be — and which business improvements would close it fastest.';
  } else {
    const tier = freedomScore >= 75 ? 'strong readiness' : freedomScore >= 45 ? 'moderate readiness' : 'early-stage readiness';
    headline = `Your Freedom Score is ${Math.round(freedomScore)}/100 — ${tier} for financial independence.`;
    observation = hasDependentData
      ? `Your freedom timeline is directly affected by the gaps identified elsewhere in your business. ${profitGap ? `Closing your profit gap of ${fmt(profitGap)}/year` : ''} ${taxGap ? `and recovering ${fmtPerYear(taxGap)} in tax overpayment` : ''} would accelerate your financial independence date — sometimes by several years.`
      : `A Freedom Score of ${Math.round(freedomScore)} reflects your current business performance, savings trajectory, and financial independence readiness. Improving your business gaps is the fastest path to moving this score.`;
    whatItMeans = 'Financial freedom is not just about having enough money to retire. It is about having the choice. The Freedom Assessment models exactly what needs to change in your business and personal finances to give you that choice — and when.';
  }

  return {
    id: 'freedom',
    category: 'freedom',
    title: 'Path to Freedom',
    headline,
    observation,
    whatItMeans,
    recommendation: hasData
      ? 'The single fastest way to improve your Freedom Score is to close your highest-dollar business gap. Every dollar of additional profit or tax savings changes your financial independence timeline.'
      : 'Complete the Freedom Assessment to calculate your financial independence score and see what business improvements would have the biggest impact on your timeline.',
    impact: hasData ? fmtScore(freedomScore) : null,
    confidence: confidence(bis, 'freedom'),
    source: 'Freedom Assessment',
    nextActionLabel: completed ? (hasData ? 'View Path to Freedom' : 'Revisit Freedom Assessment') : 'Start Freedom Assessment',
    nextActionTarget: '/assessments/freedom',
    priority: 8,
    hasData: completed,
  };
}

function buildTargetedImprovementsNarrative(bis) {
  const improvements = bis?.targetedImprovements || [];
  const total = improvements.reduce((s, i) => s + (i.value || 0), 0);
  const hasData = improvements.length > 0;

  const topThree = improvements.slice(0, 3);

  return {
    id: 'targeted_improvements',
    category: 'overview',
    title: 'Closeable Gaps',
    headline: hasData
      ? `${improvements.length} measurable gap${improvements.length > 1 ? 's' : ''} identified — ${fmt(total) || 'value quantified'} in total identified opportunity.`
      : 'No closeable gaps identified yet.',
    observation: hasData
      ? `The following gaps have been measured and quantified: ${topThree.map(i => `${i.label} (${i.formatted})`).join(', ')}${improvements.length > 3 ? `, and ${improvements.length - 3} more` : ''}. Each one is actionable — not theoretical.`
      : 'Complete at least one assessment to identify your first closeable gap.',
    whatItMeans: 'These are not estimates invented by a model. They are calculations based on your own numbers — revenue, margin, hours, income — compared against real industry benchmarks. The goal is to close them in order of dollar impact, starting with the highest.',
    recommendation: hasData
      ? `Start with ${topThree[0]?.label || 'your highest-priority gap'} — it represents the highest immediate opportunity based on your current data.`
      : 'Complete the Profit Gap assessment to identify your first measurable improvement target.',
    impact: hasData ? fmt(total) : null,
    confidence: hasData ? 'high' : 'none',
    source: 'BusinessIntelligenceState — all assessments',
    nextActionLabel: hasData ? 'Build Improvement Scenarios' : 'Start First Assessment',
    nextActionTarget: hasData ? '/dashboard' : '/assessments/profit-gap',
    priority: 9,
    hasData,
  };
}

function buildNextBestMoveNarrative(bis) {
  const improvements = bis?.targetedImprovements || [];
  const top = improvements[0];
  const hasData = improvements.length > 0;

  return {
    id: 'next_best_move',
    category: 'action',
    title: 'Next Best Move',
    headline: hasData
      ? `The highest-leverage move right now is addressing your ${top.label}.`
      : 'Complete your assessments to receive your personalized next best move.',
    observation: hasData
      ? `Based on your current intelligence profile, ${top.label} (${top.formatted}) represents the highest-dollar opportunity available to act on. This is where focused effort will produce the fastest measurable improvement.`
      : 'Once you have completed at least one gap assessment, Galileo will identify your highest-priority next action based on your specific business data.',
    whatItMeans: 'Every business has a constraint — one thing that, if addressed, produces the most value per hour of effort. The goal of the V.I.S.I.O.N. Platform is to identify that constraint precisely, so you never have to guess where to focus.',
    recommendation: hasData
      ? 'Review the assessment for this gap, identify one concrete action you can take in the next 30 days, and mark it in your sprint plan. Small consistent moves compound into large outcomes.'
      : 'Start with the Profit Gap assessment — it is the fastest assessment to complete and often reveals the highest-value opportunity.',
    impact: hasData ? top.formatted : null,
    confidence: hasData ? 'high' : 'none',
    source: 'BusinessIntelligenceState priority ranking',
    nextActionLabel: 'Build My 90-Day Sprint',
    nextActionTarget: '/dashboard',
    priority: 10,
    hasData,
  };
}

// ── Main Engine Export ────────────────────────────────────────────────────────

/**
 * buildExecutiveNarrative(bis, impactResult)
 *
 * @param {object} bis          - BusinessIntelligenceState from buildBusinessIntelligenceState()
 * @param {object} impactResult - Result from calculateBusinessImpactScore(bis) — optional
 * @returns {NarrativeItem[]}   - Ordered array of narrative insight objects
 */
export function buildExecutiveNarrative(bis, impactResult = null) {
  if (!bis) return [];

  const narratives = [
    buildIQScoreNarrative(bis),
    buildBusinessImpactScoreNarrative(bis, impactResult),
    buildTargetedImprovementsNarrative(bis),
    buildProfitGapNarrative(bis),
    buildValueGapNarrative(bis),
    buildTaxGapNarrative(bis),
    buildOperationsGapNarrative(bis),
    buildRecastEbitdaNarrative(bis),
    buildFreedomNarrative(bis),
    buildNextBestMoveNarrative(bis),
  ];

  return narratives.sort((a, b) => a.priority - b.priority);
}

/**
 * getNarrativeById(bis, id, impactResult)
 * Convenience: get a single narrative item by ID without building the full array.
 */
export function getNarrativeById(bis, id, impactResult = null) {
  return buildExecutiveNarrative(bis, impactResult).find(n => n.id === id) || null;
}

/**
 * getNarrativesWithData(bis, impactResult)
 * Returns only narratives that have real data (hasData === true).
 */
export function getNarrativesWithData(bis, impactResult = null) {
  return buildExecutiveNarrative(bis, impactResult).filter(n => n.hasData);
}