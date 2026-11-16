/**
 * Plausibility Checks — reusable guardrails for user-entered financial data.
 *
 * Before Galileo turns user-entered numbers into polished financial conclusions,
 * these checks identify material anomalies and create conversational clarification
 * moments — not error messages.
 *
 * Never rejects unusual data. Never silently changes user data.
 * Flags material anomalies and allows confirmation.
 *
 * Confirmation state is stored so Galileo does not repeatedly challenge
 * a number the user explicitly confirmed.
 */

const HIGH_MARGIN_THRESHOLD = 30;
const VERY_HIGH_MARGIN_THRESHOLD = 50;
const REV_PER_EMP_MIN = 30000;
const REV_PER_EMP_MAX = 2000000;

const fmt = (n) => {
  if (n == null || isNaN(n)) return '—';
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
};

/**
 * checkEbitdaPlausibility — the primary plausibility guardrail.
 * Checks EBITDA > revenue, negative EBITDA, and unusual margins.
 */
export function checkEbitdaPlausibility(revenue, ebitda, benchmark = null) {
  if (revenue == null || ebitda == null) return { ok: true };

  if (ebitda > revenue) {
    return {
      ok: false,
      anomaly: 'ebitda_exceeds_revenue',
      message: "That would put your EBITDA higher than your revenue, which isn't possible. Did you mean a different number?",
      suggestions: [
        { value: 're_enter', label: 'I meant something else', desc: 'Let me re-enter the number' },
        { value: 'estimate', label: 'Help me estimate it', desc: "I'm not sure of the exact number" },
      ],
    };
  }

  const margin = (ebitda / revenue) * 100;

  if (ebitda < 0) {
    return {
      ok: false,
      anomaly: 'negative_ebitda',
      message: "A negative EBITDA means the business is currently operating at a loss. That's not unusual for a business in transition — I just want to make sure I have this right.",
      margin,
      suggestions: [
        { value: 'confirm', label: "Yes, that's right", desc: 'We are operating at a loss right now' },
        { value: 're_enter', label: 'I meant something else', desc: 'Let me re-enter the number' },
      ],
    };
  }

  const industryAvg = benchmark?.averageMargin;
  const industryLabel = benchmark?.normalizedIndustry ? ` for ${benchmark.normalizedIndustry}` : '';
  const highThreshold = industryAvg ? Math.max(industryAvg * 3, HIGH_MARGIN_THRESHOLD) : HIGH_MARGIN_THRESHOLD;
  const veryHighThreshold = industryAvg ? Math.max(industryAvg * 5, VERY_HIGH_MARGIN_THRESHOLD) : VERY_HIGH_MARGIN_THRESHOLD;

  if (margin >= veryHighThreshold) {
    return {
      ok: false,
      anomaly: 'very_high_margin',
      message: `That would put your EBITDA margin around ${margin.toFixed(0)}%, which is unusually high${industryLabel}. Is that really your EBITDA, or were you thinking of another profit number?`,
      margin,
      suggestions: [
        { value: 'confirm', label: "Yes, that's right", desc: 'Our margins are genuinely this high' },
        { value: 'estimate', label: 'Help me estimate it', desc: "I'm not sure of the exact number" },
        { value: 're_enter', label: 'I meant something else', desc: 'Let me re-enter the number' },
      ],
    };
  }

  if (industryAvg && margin > industryAvg * 2 && margin >= HIGH_MARGIN_THRESHOLD) {
    return {
      ok: false,
      anomaly: 'high_margin',
      message: `That would put your EBITDA margin around ${margin.toFixed(0)}%, which is higher than typical${industryLabel} (around ${industryAvg.toFixed(0)}%). Is that your EBITDA, or were you thinking of a different profit number?`,
      margin,
      suggestions: [
        { value: 'confirm', label: "Yes, that's right", desc: 'Our margins are above typical' },
        { value: 'estimate', label: 'Help me estimate it', desc: "I'm not sure of the exact number" },
        { value: 're_enter', label: 'I meant something else', desc: 'Let me re-enter the number' },
      ],
    };
  }

  return { ok: true };
}

/**
 * checkEmployeeRevenueRatio — flags extreme revenue-per-employee ratios.
 */
export function checkEmployeeRevenueRatio(employees, revenue) {
  if (employees == null || revenue == null || employees <= 0) return { ok: true };

  const revPerEmp = revenue / employees;

  if (revPerEmp < REV_PER_EMP_MIN) {
    return {
      ok: false,
      anomaly: 'low_revenue_per_employee',
      message: `That's about $${Math.round(revPerEmp / 1e3)}K of revenue per person, which is lower than I'd expect. Is that the right revenue figure?`,
      suggestions: [
        { value: 'confirm', label: "Yes, that's right", desc: 'We have low revenue per person' },
        { value: 're_enter', label: 'Let me re-check', desc: 'I might have the wrong number' },
      ],
    };
  }

  if (revPerEmp > REV_PER_EMP_MAX) {
    return {
      ok: false,
      anomaly: 'high_revenue_per_employee',
      message: `That's about $${(revPerEmp / 1e6).toFixed(1)}M of revenue per person, which is very high. Is that the right headcount?`,
      suggestions: [
        { value: 'confirm', label: "Yes, that's right", desc: 'We have very high revenue per person' },
        { value: 're_enter', label: 'Let me re-check', desc: 'I might have the wrong number' },
      ],
    };
  }

  return { ok: true };
}

/**
 * checkDocumentConflict — flags when extracted document data conflicts
 * with manually entered answers.
 */
export function checkDocumentConflict(extractedFacts, answers) {
  if (!extractedFacts?.success || !answers) return { ok: true };

  const facts = extractedFacts.facts || {};
  const docRevenue = facts.annual_revenue?.normalized;
  const docEbitda = facts.reported_ebitda?.normalized ?? facts.operating_income?.normalized;

  if (docRevenue != null && answers.revenue != null) {
    const diff = Math.abs(docRevenue - answers.revenue) / Math.max(docRevenue, answers.revenue, 1);
    if (diff > 0.2) {
      return {
        ok: false,
        anomaly: 'document_revenue_conflict',
        message: `Your document shows revenue of ${fmt(docRevenue)}, but you mentioned ${fmt(answers.revenue)}. Which should I use?`,
        suggestions: [
          { value: 'use_doc', label: `Use document: ${fmt(docRevenue)}`, desc: 'From your uploaded financials' },
          { value: 'use_user', label: `Use my number: ${fmt(answers.revenue)}`, desc: 'I know our actual revenue' },
        ],
      };
    }
  }

  if (docEbitda != null && answers.ebitda != null) {
    const diff = Math.abs(docEbitda - answers.ebitda) / Math.max(docEbitda, answers.ebitda, 1);
    if (diff > 0.2) {
      return {
        ok: false,
        anomaly: 'document_ebitda_conflict',
        message: `Your document shows EBITDA of ${fmt(docEbitda)}, but you mentioned ${fmt(answers.ebitda)}. Which should I use?`,
        suggestions: [
          { value: 'use_doc', label: `Use document: ${fmt(docEbitda)}`, desc: 'From your uploaded financials' },
          { value: 'use_user', label: `Use my number: ${fmt(answers.ebitda)}`, desc: 'I know our actual EBITDA' },
        ],
      };
    }
  }

  return { ok: true };
}