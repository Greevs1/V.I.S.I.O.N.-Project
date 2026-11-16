/**
 * galileoCoachScript.js
 *
 * All Galileo coaching messages for the Enterprise Journey.
 * One message per field/step — what a world-class advisor would say.
 * No AI calls — fully deterministic.
 */

export const COACH = {
  // ── Profit Gap ──────────────────────────────────────────────────────────────
  profit_gap_industry: "Tell me your industry and I'll pull benchmark data from thousands of comparable businesses — average margins, top-quartile performance, and best-in-class operators. This is where we start measuring your gap.",

  profit_gap_revenue_confirm: (val) =>
    `I found ${val} in your uploaded documents. Does this represent your total annual revenue — everything collected before expenses?`,

  profit_gap_revenue: "Your total annual revenue is the starting line. Everything else is measured as a percentage of this number. Check the top line of your Profit & Loss or your business tax return.",

  profit_gap_margin: "Your net profit margin tells me how much of every dollar you actually keep. Divide your net income by revenue. If you ran $2M and kept $300K, that's a 15% margin. Industry leaders often run 25–40% in your category.",

  profit_gap_results: (gap, industry) =>
    `Based on what I've seen in ${industry}, there's approximately ${gap} in recoverable profit sitting inside your current cost structure. In the next section, I'll show you exactly where it's hiding.`,

  // ── Value Gap ───────────────────────────────────────────────────────────────
  value_gap_ebitda_confirm: (val, source) =>
    `I found ${val} as your EBITDA from ${source}. EBITDA is the metric buyers use to value businesses — it strips out financing and taxes to show true earning power. Does this look right?`,

  value_gap_ebitda: "EBITDA is what buyers actually pay for. It stands for Earnings Before Interest, Taxes, Depreciation, and Amortization. Your net income is a good starting point — we'll normalize it in the next section.",

  value_gap_multiple: "Your EBITDA multiple is the number that transforms your earnings into an enterprise value. A business earning $500K at a 5x multiple sells for $2.5M. Buyers pay higher multiples for lower-risk, more transferable businesses.",

  value_gap_potential: "Now let's set a target. Where could your EBITDA realistically be in 24–36 months with the right strategy? Move the slider to a goal — this isn't a promise, it's a direction.",

  // ── Recast EBITDA ───────────────────────────────────────────────────────────
  recast_intro: "Your reported EBITDA understates your true earning power. Buyers normalize it by adding back owner-specific costs that won't transfer with the business. We call these add-backs. I'll walk you through each category.",

  recast_owner_comp: "This is the gap between what you pay yourself and what it would cost to hire a professional manager to run this business. If you pay yourself $250K but a CEO replacement would cost $150K, the add-back is $100K.",

  recast_personal_expenses: "Business owners often run personal expenses through the company — meals, travel, subscriptions. These are legitimate tax strategies, but buyers add them back because they won't continue after the sale.",

  recast_vehicle: "Personal vehicles expensed to the business are added back at their annual depreciation and operating cost. Check your business tax return for the vehicle deduction amount.",

  recast_family_payroll: "If you employ family members at above-market rates, the premium over fair market compensation is added back. This is common and expected — buyers understand it.",

  recast_nonrecurring: "One-time expenses — a lawsuit settlement, a major repair, a one-time consulting project — don't reflect ongoing operations. Buyers remove them to see normalized profitability.",

  recast_rent_norm: "If you own the building your business occupies, the rent you charge yourself may differ from market rate. The difference — up or down — is normalized to reflect what a buyer would actually pay.",

  recast_da_auto: (amount) =>
    `I identified ${amount} in depreciation and amortization from your uploaded documents and added it back automatically. This is a non-cash expense that doesn't reflect real cash outflow.`,

  recast_da: "Depreciation and amortization are non-cash expenses — accounting entries that reduce reported income without actual cash leaving the business. Buyers always add these back.",

  recast_interest_auto: (amount) =>
    `I found ${amount} in interest expense from your documents. Since buyers bring their own capital structure, this is added back — it won't exist under new ownership.`,

  recast_interest: "Interest on business debt is added back because buyers will have their own financing arrangements. Your interest expense doesn't reflect the cost structure of the business under new ownership.",

  recast_results: (reported, normalized, impact, multiple) =>
    `Your normalized EBITDA is ${normalized} — ${impact} higher than your reported figure. At a ${multiple}x multiple, that represents additional enterprise value. This is the number sophisticated buyers will use.`,

  // ── Confirmation prompts (when data found) ─────────────────────────────────
  confirm_prompt: (label, value, source) =>
    `I found your ${label} — ${value} — from your ${source}. Can you confirm this is accurate?`,
};