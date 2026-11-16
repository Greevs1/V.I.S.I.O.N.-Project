/**
 * valuationDeltaEngine.ts — Phase 13.3D Version Intelligence
 *
 * Pure, deterministic functions that compute immutable derived artifacts
 * comparing two consecutive PUBLISHED valuation versions.
 *
 * NEVER compares against drafts.
 * NEVER compares against stale calculations.
 * Only compares immutable published version snapshots.
 *
 * Outputs:
 *   - deltaSummary: metric-by-metric previous/current/abs/pct
 *   - valueAttribution: quantified EV change attribution
 *   - waterfall: EV waterfall from V1 → V2
 *   - advisorSummary: full advisor-facing Valuation Story
 *   - clientSummary: client-safe "What Changed" narrative
 */

export const DELTA_ENGINE_VERSION = '13.3.0';

// ── Types ────────────────────────────────────────────────────────────────────

interface VersionSnapshot {
  version_number: number;
  published_at: string;
  internal_snapshot: any;
  client_safe_snapshot: any;
}

interface MetricDelta {
  metric: string;
  previous_value: number | null;
  current_value: number | null;
  absolute_delta: number | null;
  percentage_delta: number | null;
}

interface AttributionItem {
  category: string;
  estimated_ev_impact: number;
  confidence: number; // 0-100
  supporting_calculation_ids: string[];
  supporting_value_driver_ids: string[];
  explanation: string;
  proven: boolean;
}

interface WaterfallStep {
  step: string;
  amount: number;
  cumulative: number;
}

interface DeltaResult {
  deltaSummary: {
    metrics: MetricDelta[];
    version_numbers: { previous: number; current: number };
  };
  valueAttribution: {
    items: AttributionItem[];
    total_attributed: number;
    unattributed: number;
    can_attribute: boolean;
  };
  waterfall: {
    steps: WaterfallStep[];
    previous_ev: number;
    current_ev: number;
  };
  advisorSummary: any;
  clientSummary: any;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const safeNum = (v: any): number | null => {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isNaN(n) ? null : n;
};

const round2 = (n: number): number => Math.round(n * 100) / 100;
const round4 = (n: number): number => Math.round(n * 10000) / 10000;

const calcDelta = (prev: number | null, curr: number | null): { abs: number | null; pct: number | null } => {
  if (prev == null || curr == null) return { abs: null, pct: null };
  const abs = round4(curr - prev);
  const pct = prev !== 0 ? round2(((curr - prev) / Math.abs(prev)) * 100) : null;
  return { abs, pct };
};

// ── Extract metrics from a published snapshot ─────────────────────────────────

const extractMetrics = (snap: any): Record<string, number | null> => {
  const m: Record<string, number | null> = {};
  if (!snap) return m;

  // Enterprise Value (from blended reconciliation)
  const blended = snap.blended_reconciliation || snap.internal_snapshot?.blended_reconciliation;
  if (blended) {
    m.enterprise_value_low = safeNum(blended.enterprise_value_low);
    m.enterprise_value_mid = safeNum(blended.enterprise_value_mid);
    m.enterprise_value_high = safeNum(blended.enterprise_value_high);
  }

  // Equity Value (from equity bridge)
  const bridge = snap.equity_bridge || snap.internal_snapshot?.equity_bridge;
  if (bridge) {
    m.equity_value_low = safeNum(bridge.equity_value_low);
    m.equity_value_mid = safeNum(bridge.equity_value_mid);
    m.equity_value_high = safeNum(bridge.equity_value_high);
  }

  // Confidence
  const conf = snap.confidence || snap.internal_snapshot?.confidence;
  if (conf) {
    m.confidence = safeNum(conf.score);
  }

  // Advisor conclusion
  const concl = snap.advisor_conclusion || snap.internal_snapshot?.advisor_conclusion;
  if (concl) {
    m.defensible_value_low = safeNum(concl.defensible_value_low);
    m.defensible_value_mid = safeNum(concl.defensible_value_mid);
    m.defensible_value_high = safeNum(concl.defensible_value_high);
    m.maintainable_earnings = safeNum(concl.maintainable_earnings);
  }

  // Normalized EBITDA / SDE (from financial history or calculation lines)
  const financials = snap.financial_history || snap.internal_snapshot?.financial_history;
  if (financials && financials.length > 0) {
    const latest = financials[financials.length - 1];
    m.normalized_ebitda = safeNum(latest.recast_ebitda || latest.normalized_ebitda);
    m.normalized_sde = safeNum(latest.recast_sde || latest.normalized_sde);
    m.revenue = safeNum(latest.annual_revenue || latest.revenue);
  }

  // Method weights
  const methodSels = snap.method_selections || snap.internal_snapshot?.method_selections;
  if (methodSels && methodSels.length > 0) {
    for (const ms of methodSels) {
      if (ms.selection_role === 'primary') {
        m.primary_multiple = safeNum(ms.method_weight);
      }
    }
  }

  return m;
};

// ── Delta Summary ────────────────────────────────────────────────────────────

const METRIC_KEYS = [
  'enterprise_value_low', 'enterprise_value_mid', 'enterprise_value_high',
  'equity_value_low', 'equity_value_mid', 'equity_value_high',
  'normalized_ebitda', 'normalized_sde', 'revenue',
  'primary_multiple', 'confidence',
  'defensible_value_low', 'defensible_value_mid', 'defensible_value_high',
  'maintainable_earnings',
];

export function computeDeltaSummary(prev: VersionSnapshot, curr: VersionSnapshot): any {
  const prevMetrics = extractMetrics(prev);
  const currMetrics = extractMetrics(curr);

  const metrics: MetricDelta[] = [];
  for (const key of METRIC_KEYS) {
    const pv = prevMetrics[key] ?? null;
    const cv = currMetrics[key] ?? null;
    const { abs, pct } = calcDelta(pv, cv);
    // Only include if at least one version has a value
    if (pv != null || cv != null) {
      metrics.push({
        metric: key,
        previous_value: pv,
        current_value: cv,
        absolute_delta: abs,
        percentage_delta: pct,
      });
    }
  }

  return {
    metrics,
    version_numbers: { previous: prev.version_number, current: curr.version_number },
  };
}

// ── Value Attribution ─────────────────────────────────────────────────────────

export function computeValueAttribution(prev: VersionSnapshot, curr: VersionSnapshot): any {
  const prevMetrics = extractMetrics(prev);
  const currMetrics = extractMetrics(curr);

  const prevEV = prevMetrics.enterprise_value_mid;
  const currEV = currMetrics.enterprise_value_mid;

  if (prevEV == null || currEV == null) {
    return {
      items: [],
      total_attributed: 0,
      unattributed: 0,
      can_attribute: false,
      reason: 'Enterprise value not available in one or both versions',
    };
  }

  const totalChange = round4(currEV - prevEV);
  const items: AttributionItem[] = [];
  let attributed = 0;

  // 1. EBITDA Growth attribution
  const prevEbitda = prevMetrics.normalized_ebitda;
  const currEbitda = currMetrics.normalized_ebitda;
  const prevMultiple = prevMetrics.primary_multiple;
  const currMultiple = currMetrics.primary_multiple;

  if (prevEbitda != null && currEbitda != null && prevMultiple != null) {
    const ebitdaChange = currEbitda - prevEbitda;
    const ebitdaImpact = round4(ebitdaChange * prevMultiple);
    if (Math.abs(ebitdaImpact) > 0.01) {
      items.push({
        category: 'EBITDA Growth',
        estimated_ev_impact: ebitdaImpact,
        confidence: 70,
        supporting_calculation_ids: [],
        supporting_value_driver_ids: [],
        explanation: `Normalized EBITDA changed from ${prevEbitda} to ${currEbitda}, applied at previous multiple of ${prevMultiple}x`,
        proven: true,
      });
      attributed = round4(attributed + ebitdaImpact);
    }
  }

  // 2. Multiple Expansion attribution
  if (currEbitda != null && prevMultiple != null && currMultiple != null) {
    const multipleChange = currMultiple - prevMultiple;
    const multipleImpact = round4(currEbitda * multipleChange);
    if (Math.abs(multipleImpact) > 0.01) {
      items.push({
        category: 'Multiple Expansion',
        estimated_ev_impact: multipleImpact,
        confidence: 65,
        supporting_calculation_ids: [],
        supporting_value_driver_ids: [],
        explanation: `Primary multiple changed from ${prevMultiple}x to ${currMultiple}x, applied to current EBITDA of ${currEbitda}`,
        proven: true,
      });
      attributed = round4(attributed + multipleImpact);
    }
  }

  // 3. Confidence / Risk adjustment (residual if other factors don't explain full change)
  const residual = round4(totalChange - attributed);
  if (Math.abs(residual) > 0.01) {
    const prevConf = prevMetrics.confidence;
    const currConf = currMetrics.confidence;
    if (prevConf != null && currConf != null && currConf !== prevConf) {
      items.push({
        category: 'Risk / Confidence Adjustment',
        estimated_ev_impact: residual,
        confidence: 40,
        supporting_calculation_ids: [],
        supporting_value_driver_ids: [],
        explanation: `Confidence changed from ${prevConf}% to ${currConf}%. Residual value change of ${residual} attributed to risk/confidence and other factors.`,
        proven: false,
      });
      attributed = round4(attributed + residual);
    } else {
      // Unattributed residual
      items.push({
        category: 'Other Quantified Factors',
        estimated_ev_impact: residual,
        confidence: 20,
        supporting_calculation_ids: [],
        supporting_value_driver_ids: [],
        explanation: `Unable to attribute automatically. Residual change of ${residual} not explained by EBITDA, multiple, or confidence changes.`,
        proven: false,
      });
      attributed = round4(attributed + residual);
    }
  }

  const unattributed = round4(totalChange - attributed);

  return {
    items,
    total_attributed: round4(attributed),
    unattributed,
    can_attribute: items.length > 0 && Math.abs(unattributed) < Math.abs(totalChange) * 0.1,
    previous_ev: prevEV,
    current_ev: currEV,
    total_change: totalChange,
  };
}

// ── Enterprise Value Waterfall ────────────────────────────────────────────────

export function computeWaterfall(prev: VersionSnapshot, curr: VersionSnapshot): any {
  const prevMetrics = extractMetrics(prev);
  const currMetrics = extractMetrics(curr);
  const attribution = computeValueAttribution(prev, curr);

  const prevEV = prevMetrics.enterprise_value_mid ?? 0;
  const currEV = currMetrics.enterprise_value_mid ?? 0;

  const steps: WaterfallStep[] = [];
  let cumulative = prevEV;

  steps.push({ step: `Version ${prev.version_number} Enterprise Value`, amount: prevEV, cumulative });

  // Add each attribution item as a waterfall step
  for (const item of attribution.items || []) {
    cumulative = round4(cumulative + item.estimated_ev_impact);
    steps.push({
      step: item.category,
      amount: item.estimated_ev_impact,
      cumulative,
    });
  }

  // Final step
  steps.push({ step: `Version ${curr.version_number} Enterprise Value`, amount: currEV, cumulative: currEV });

  return {
    steps,
    previous_ev: prevEV,
    current_ev: currEV,
    total_change: round4(currEV - prevEV),
  };
}

// ── Valuation Story (Advisor Version) ─────────────────────────────────────────

export function computeAdvisorSummary(prev: VersionSnapshot, curr: VersionSnapshot): any {
  const delta = computeDeltaSummary(prev, curr);
  const attribution = computeValueAttribution(prev, curr);
  const waterfall = computeWaterfall(prev, curr);

  const prevMetrics = extractMetrics(prev);
  const currMetrics = extractMetrics(curr);

  const sections: any = {};

  // Executive Summary
  const evDelta = delta.metrics.find((m: MetricDelta) => m.metric === 'enterprise_value_mid');
  const confDelta = delta.metrics.find((m: MetricDelta) => m.metric === 'confidence');
  sections.executive_summary = {
    previous_version: prev.version_number,
    current_version: curr.version_number,
    previous_published_at: prev.published_at,
    current_published_at: curr.published_at,
    enterprise_value_change: evDelta ? { from: evDelta.previous_value, to: evDelta.current_value, abs: evDelta.absolute_delta, pct: evDelta.percentage_delta } : null,
    confidence_change: confDelta ? { from: confDelta.previous_value, to: confDelta.current_value, abs: confDelta.absolute_delta, pct: confDelta.percentage_delta } : null,
  };

  // Enterprise Value Changes
  sections.enterprise_value_changes = delta.metrics.filter((m: MetricDelta) => m.metric.startsWith('enterprise_value'));

  // Primary Drivers (from attribution)
  sections.primary_drivers = (attribution.items || [])
    .filter((i: AttributionItem) => i.proven && Math.abs(i.estimated_ev_impact) > 0.01)
    .map((i: AttributionItem) => ({ category: i.category, impact: i.estimated_ev_impact, confidence: i.confidence, explanation: i.explanation }));

  // Primary Risks
  sections.primary_risks = (attribution.items || [])
    .filter((i: AttributionItem) => i.estimated_ev_impact < 0)
    .map((i: AttributionItem) => ({ category: i.category, impact: i.estimated_ev_impact, explanation: i.explanation }));

  // Confidence Changes
  sections.confidence_changes = confDelta ? {
    previous: confDelta.previous_value,
    current: confDelta.current_value,
    delta: confDelta.absolute_delta,
  } : null;

  // Methodology Changes
  const prevMethodSels = (prev.internal_snapshot?.method_selections || prev.method_selections || []);
  const currMethodSels = (curr.internal_snapshot?.method_selections || curr.method_selections || []);
  const prevMethods = prevMethodSels.map((m: any) => m.method_key).sort();
  const currMethods = currMethodSels.map((m: any) => m.method_key).sort();
  const methodsAdded = currMethods.filter((m: string) => !prevMethods.includes(m));
  const methodsRemoved = prevMethods.filter((m: string) => !currMethods.includes(m));
  sections.methodology_changes = {
    previous_methods: prevMethods,
    current_methods: currMethods,
    methods_added: methodsAdded,
    methods_removed: methodsRemoved,
  };

  // Operational Changes (EBITDA, revenue)
  sections.operational_changes = {
    ebitda: delta.metrics.find((m: MetricDelta) => m.metric === 'normalized_ebitda'),
    revenue: delta.metrics.find((m: MetricDelta) => m.metric === 'revenue'),
  };

  // Capital Structure Changes (equity value vs enterprise value)
  sections.capital_structure_changes = {
    equity_value: delta.metrics.find((m: MetricDelta) => m.metric === 'equity_value_mid'),
    enterprise_value: delta.metrics.find((m: MetricDelta) => m.metric === 'enterprise_value_mid'),
  };

  // Advisor Commentary
  sections.advisor_commentary = {
    attribution_summary: attribution.can_attribute
      ? `Enterprise value change of ${attribution.total_change} attributed to ${attribution.items.length} factors.`
      : 'Unable to attribute automatically.',
    waterfall_summary: `EV moved from ${waterfall.previous_ev} to ${waterfall.current_ev} across ${waterfall.steps.length - 2} attribution steps.`,
  };

  // Buyer Readiness Commentary
  const buyerReady = (currMetrics.confidence ?? 0) >= 70;
  sections.buyer_readiness_commentary = buyerReady
    ? `Confidence at ${currMetrics.confidence}% supports buyer-ready presentation.`
    : `Confidence at ${currMetrics.confidence}% — additional documentation recommended before buyer presentation.`;

  // Recommended Review Date (90 days from current publication)
  const reviewDate = new Date(curr.published_at);
  reviewDate.setDate(reviewDate.getDate() + 90);
  sections.recommended_review_date = reviewDate.toISOString().split('T')[0];

  // Supporting evidence references
  sections.supporting_calculation_ids = (attribution.items || []).flatMap((i: AttributionItem) => i.supporting_calculation_ids);
  sections.supporting_value_driver_ids = (attribution.items || []).flatMap((i: AttributionItem) => i.supporting_value_driver_ids);

  return sections;
}

// ── Valuation Story (Client Version) ──────────────────────────────────────────

export function computeClientSummary(prev: VersionSnapshot, curr: VersionSnapshot): any {
  const delta = computeDeltaSummary(prev, curr);
  const attribution = computeValueAttribution(prev, curr);

  const evDelta = delta.metrics.find((m: MetricDelta) => m.metric === 'enterprise_value_mid');
  const confDelta = delta.metrics.find((m: MetricDelta) => m.metric === 'confidence');
  const ebitdaDelta = delta.metrics.find((m: MetricDelta) => m.metric === 'normalized_ebitda');

  const sections: any = {};

  // "What Changed Since Your Last Valuation"
  sections.title = 'What Changed Since Your Last Valuation';
  sections.previous_version = prev.version_number;
  sections.current_version = curr.version_number;

  // Verified value changes (client-safe)
  const valueChanges: any[] = [];
  if (evDelta && evDelta.absolute_delta != null) {
    valueChanges.push({
      metric: 'Enterprise Value',
      direction: evDelta.absolute_delta > 0 ? 'increased' : 'decreased',
      change: evDelta.absolute_delta,
      percentage: evDelta.percentage_delta,
    });
  }
  if (ebitdaDelta && ebitdaDelta.absolute_delta != null) {
    valueChanges.push({
      metric: 'Normalized Earnings',
      direction: ebitdaDelta.absolute_delta > 0 ? 'increased' : 'decreased',
      change: ebitdaDelta.absolute_delta,
      percentage: ebitdaDelta.percentage_delta,
    });
  }
  sections.verified_value_changes = valueChanges;

  // Verified confidence improvements
  sections.verified_confidence_changes = confDelta && confDelta.absolute_delta != null ? {
    direction: confDelta.absolute_delta > 0 ? 'improved' : 'decreased',
    change: confDelta.absolute_delta,
  } : null;

  // High-level explanation (no internal IDs, no weighting, no evidence IDs)
  const drivers = (attribution.items || [])
    .filter((i: AttributionItem) => i.proven && Math.abs(i.estimated_ev_impact) > 0.01)
    .map((i: AttributionItem) => ({
      category: i.category,
      impact_direction: i.estimated_ev_impact > 0 ? 'positive' : 'negative',
    }));
  sections.high_level_explanation = drivers.length > 0
    ? `Primary value drivers: ${drivers.map((d: any) => d.category).join(', ')}.`
    : 'Unable to attribute changes to specific drivers at this time.';

  // Verified risks (client-safe, no internal details)
  sections.verified_risks = (attribution.items || [])
    .filter((i: AttributionItem) => i.estimated_ev_impact < 0)
    .map((i: AttributionItem) => ({ category: i.category, description: 'A factor that reduced enterprise value' }));

  // Exclude: internal notes, internal weighting, internal evidence IDs, override history, audit records
  // (These are intentionally NOT included in the client summary)

  return sections;
}

// ── Full Delta Computation ────────────────────────────────────────────────────

export function computeVersionDelta(prev: VersionSnapshot, curr: VersionSnapshot): DeltaResult {
  return {
    deltaSummary: computeDeltaSummary(prev, curr),
    valueAttribution: computeValueAttribution(prev, curr),
    waterfall: computeWaterfall(prev, curr),
    advisorSummary: computeAdvisorSummary(prev, curr),
    clientSummary: computeClientSummary(prev, curr),
  };
}