/**
 * Executive Briefing Copy — Presentation Layer
 *
 * Maps each engine narrative topic to the 5-section executive story structure:
 *   whatYouSee · whyItMatters · opportunity · nextMove · executiveInsight
 *
 * The engine (executiveNarrativeEngine.js) remains the sole data source for
 * observations, impact values, and confidence. This file only supplies
 * presentation copy — no calculations, no data extraction.
 *
 * Tone: executive advisor. "The data suggests…" — never "You should…".
 * Opportunity = outcomes, never implementation. Never reveals proprietary methodology.
 */

export const BRIEFING_COPY = {
  iq_score: {
    whatYouSee: "Your Impact Quotient is a composite score reflecting how efficiently your business generates, retains, and compounds value across every dimension we measure.",
    whyItMatters: "A higher score means more of your opportunity landscape is visible and actionable. It reflects readiness — not just performance.",
    opportunity: "There is meaningful opportunity to strengthen this score through targeted intelligence gathering across the remaining dimensions.",
    nextMove: "Continue identifying the remaining intelligence gaps.",
    executiveInsight: "What you can measure, you can improve. What you can't measure is already costing you.",
  },

  business_impact_score: {
    whatYouSee: "This score measures how complete your business intelligence profile is — how much of your opportunity landscape is currently visible.",
    whyItMatters: "A more complete profile means sharper decisions and fewer blind spots. It's the difference between navigating with a map and navigating by feel.",
    opportunity: "Each additional assessment adds a new dimension of clarity, revealing opportunities that remain hidden until measured.",
    nextMove: "Complete the next assessment to expand your intelligence coverage.",
    executiveInsight: "Clarity is the highest-leverage investment an owner can make.",
  },

  targeted_improvements: {
    whatYouSee: "These are the measurable, closeable gaps identified across your business — each quantified using your own numbers against real industry benchmarks.",
    whyItMatters: "Identified gaps represent captured opportunity. Unidentified gaps represent silent cost. Knowing where the gaps are is the first step toward closing them.",
    opportunity: "Multiple opportunities exist. Galileo has already prioritized the highest-leverage ones based on your business profile.",
    nextMove: "Review the execution priorities Galileo has prepared.",
    executiveInsight: "The gaps you can measure are the gaps you can close. The ones you can't are still there.",
  },

  profit_gap: {
    whatYouSee: "Profit measures how efficiently your business converts revenue into earnings. The Profit Gap is the difference between your current margin and what the best operators in your industry achieve.",
    whyItMatters: "Stronger profit margins create more flexibility, higher valuations, and greater resilience. Profit compounds twice — once in your bank account, and again in your business value.",
    opportunity: "There is meaningful opportunity to improve this metric through operational and financial optimization.",
    nextMove: "Compare alternative future scenarios to see the impact of closing this gap.",
    executiveInsight: "Profit compounds twice: once in your bank account, and again in your business valuation.",
  },

  value_gap: {
    whatYouSee: "Business Value reflects what an outside buyer would likely pay today. The Value Gap is the difference between your current value and what your business could be worth with strategic improvements.",
    whyItMatters: "Value isn't just about revenue. Buyers pay for transferable earnings, systems, and independence from any single person. Owner dependency lowers transferable value regardless of revenue.",
    opportunity: "There are multiple strategies capable of improving this area. Galileo has prioritized the highest-leverage opportunities for your business.",
    nextMove: "Review the execution priorities Galileo has prepared.",
    executiveInsight: "The business you've built and the business a buyer can acquire are often two different assets.",
  },

  tax_gap: {
    whatYouSee: "The Tax Gap represents estimated annual tax overpayment — money that could legally remain in your business or personal accounts through proper structuring.",
    whyItMatters: "Every dollar overpaid in taxes is a dollar that could have compounded inside the business, been reinvested, or been distributed as owner income. Taxes are one of the few expenses that can often be reduced without reducing performance.",
    opportunity: "There are multiple strategies capable of improving this area. Galileo has already prioritized the highest-leverage opportunities.",
    nextMove: "Review the execution priorities Galileo has prepared.",
    executiveInsight: "Taxes are one of the few expenses that can often be reduced without reducing performance.",
  },

  operations_gap: {
    whatYouSee: "Your Operations Health Score measures how systematized your business is — and how dependent it is on your personal involvement.",
    whyItMatters: "Buyers apply a risk discount to owner-dependent businesses. The more the business relies on you, the lower the multiple they'll pay. Every process that depends on you becomes a ceiling on the company's value.",
    opportunity: "There is meaningful opportunity to improve this metric through operational and financial optimization.",
    nextMove: "Review the execution priorities Galileo has prepared.",
    executiveInsight: "Every process that depends on you becomes a ceiling on the company's value.",
  },

  recast_ebitda: {
    whatYouSee: "Recast EBITDA identifies owner-specific expenses that a new owner would not carry — revealing the true earning power of your business.",
    whyItMatters: "When a buyer evaluates your business, they look at normalized earnings, not your reported net income. Properly documenting add-backs can significantly increase what a buyer would pay.",
    opportunity: "There is meaningful opportunity to increase your normalized earnings through proper expense classification.",
    nextMove: "Review the execution priorities Galileo has prepared.",
    executiveInsight: "The number on your tax return and the number a buyer evaluates are rarely the same number.",
  },

  freedom: {
    whatYouSee: "Your Freedom Score connects your business performance to your personal financial independence — modeling what it would take to give you the choice to step away.",
    whyItMatters: "Financial freedom isn't just about having enough to retire. It's about having the optionality to choose — when to work, how to work, and whether to work. Your business gaps directly accelerate or delay that timeline.",
    opportunity: "Closing your highest-dollar business gap is the single fastest way to improve your freedom timeline.",
    nextMove: "Compare alternative future scenarios to see the impact on your timeline.",
    executiveInsight: "Freedom isn't a number. It's the moment your business can run without you and still grow.",
  },
};

// Evidence Strength mapping (replaces "Confidence")
export const EVIDENCE_LABEL = {
  high: 'High',
  medium: 'Moderate',
  low: 'Emerging',
  none: 'Emerging',
};

export const EVIDENCE_COLOR = {
  high: '#10B981',
  medium: '#D4A853',
  low: 'rgba(255,255,255,0.28)',
  none: 'rgba(255,255,255,0.15)',
};