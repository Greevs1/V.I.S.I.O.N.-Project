/**
 * BusinessIntelligenceState (BIS)
 *
 * Single canonical source of truth for all dashboard intelligence.
 * Every metric resolves through one ordered fallback chain:
 *   1. assessmentSummary (from Base44 Assessment entities via supabaseUserData)
 *   2. dashboard_metrics (Supabase JSONB row)
 *   3. latestSnapshot (business_metric_snapshots row)
 *   4. profileFinancials / businessEntity
 *
 * Dashboard components must read from BIS. They must NOT run their own fallback chains.
 *
 * Canonical field names (use these everywhere — old aliases map in here, never leak out):
 *   profit_gap_amount, value_gap_amount, recast_ebitda, recast_valuation_increase,
 *   tax_gap_annual, tax_strategy_count, operations_score,
 *   monthly_take_home, hours_worked_per_week, hourly_value_of_time_freed,
 *   monthly_value_of_time_freed, hours_freed_per_week,
 *   freedom_score, freedom_gap, iq_score, business_impact_score
 */

// ── Business Intelligence Engine integration ─────────────────────────────────
import { buildBusinessIntelligenceEngine } from './bie';

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtUSD = (n) => {
  if (n == null || isNaN(n)) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
};

// ── Main Builder ─────────────────────────────────────────────────────────────
// NOTE: The old resolve* helper functions were removed in Phase 7 cleanup.
// The BIE engine (./bie/engine.js) now performs all metric resolution inline
// with its own fallback chain. BIS is a projection of the engine output.

/**
 * buildGuestAssessmentSummary
 *
 * Converts raw guest session assessment_answers into the same shape
 * as assessmentSummary returned by supabaseUserData.getAssessmentSummary.
 * This ensures guests get full BIS population without any auth requirement.
 */
export function buildGuestAssessmentSummary(guestSession) {
  if (!guestSession?.assessment_answers) return null;
  const aa = guestSession.assessment_answers;

  const pg = aa['profit_gap']?.results || aa['profit_gap']?.answers || {};
  const vg = aa['value_gap']?.results  || aa['value_gap']?.answers  || {};
  const tg = aa['tax_gap']?.results    || aa['tax_gap']?.answers    || {};
  const og = aa['operations_gap']?.results || aa['operations_gap']?.answers || {};
  const re = aa['recast_ebitda']?.results  || aa['recast_ebitda']?.answers  || {};
  const fa = aa['freedom_assessment']?.results || aa['freedom_assessment']?.answers || {};

  const summary = {};

  // Profit Gap
  if (pg.profit_gap != null || pg.gapToBest != null || pg.gap_to_best != null) {
    summary.profit_gap_amount  = pg.profit_gap ?? pg.gapToBest ?? pg.gap_to_best ?? null;
    summary.profit_gap_score   = pg.profit_score ?? null;
    summary.profit_gap_severity = summary.profit_gap_amount > 200000 ? 'SIGNIFICANT' : summary.profit_gap_amount > 50000 ? 'MODERATE' : 'LOW';
    summary.profit_gap_details = { gap_to_average: pg.profit_gap_to_avg ?? pg.gapToAvg ?? null, summary: null };
    summary.revenue = pg.p1_rev ?? pg.revenue ?? null;
  }

  // Value Gap
  if (vg.value_gap != null || vg.valueGap != null) {
    summary.value_gap_amount   = vg.value_gap ?? vg.valueGap ?? null;
    summary.current_business_value = vg.current_value ?? vg.currentValue ?? null;
    summary.value_gap_details  = { current_value: vg.current_value ?? vg.currentValue ?? null, potential_value: vg.potential_value ?? vg.potentialValue ?? null };
    summary.value_gap_severity = summary.value_gap_amount > 1000000 ? 'SIGNIFICANT' : summary.value_gap_amount > 300000 ? 'MODERATE' : 'LOW';
  }

  // Tax Gap
  if (tg.t3_annual_gap != null || tg.totalAnnualSavings != null) {
    summary.tax_gap_annual     = tg.t3_annual_gap ?? tg.totalAnnualSavings ?? null;
    summary.tax_gap_ten_year   = summary.tax_gap_annual ? summary.tax_gap_annual * 10 : null;
    summary.tax_gap_severity   = summary.tax_gap_annual > 30000 ? 'SIGNIFICANT' : summary.tax_gap_annual > 10000 ? 'MODERATE' : 'LOW';
  }

  // Operations Gap — canonical field names
  if (og.operations_score != null || og.operationsScore != null) {
    summary.operations_score       = og.operations_score ?? og.operationsScore ?? null;
    summary.operations_gap_severity = summary.operations_score < 40 ? 'SIGNIFICANT' : summary.operations_score < 65 ? 'MODERATE' : 'LOW';
    summary.monthly_take_home      = og.monthly_take_home ?? og.o4_takehome ?? og.monthlyTakeHome ?? null;
    summary.hours_worked_per_week  = og.hours_worked_per_week ?? og.o4_hrs ?? og.hoursWorkedPerWeek ?? null;
    summary.hourly_value_of_time_freed  = og.hourly_value_of_time_freed ?? og.hourly_value ?? null;
    summary.monthly_value_of_time_freed = og.monthly_value_of_time_freed ?? og.monthly_value_freed ?? null;
    summary.hours_freed_per_week   = og.hours_freed_per_week ?? og.freed_hours_per_week ?? null;
    summary.operations_gap_details = {
      monthly_take_home: summary.monthly_take_home,
      hours_worked_per_week: summary.hours_worked_per_week,
      hourly_value_of_time_freed: summary.hourly_value_of_time_freed,
      monthly_value_of_time_freed: summary.monthly_value_of_time_freed,
      hours_freed_per_week: summary.hours_freed_per_week,
    };
  }

  // Recast EBITDA
  if (re.total_addbacks != null || re.totalAddBacks != null || re.total_add_backs != null) {
    summary.recast_ebitda_details = {
      add_backs: re.total_addbacks ?? re.totalAddBacks ?? re.total_add_backs ?? null,
      valuation_increase: re.recast_value_impact ?? re.valuationIncrease ?? re.valuation_increase ?? null,
    };
  }

  // Freedom
  if (fa.freedom_score != null) {
    summary.freedom_score = fa.freedom_score;
  }

  // Composite IQ from available scores
  const scores = [];
  if (pg.profit_score != null) scores.push(pg.profit_score);
  else if (aa['profit_gap']) scores.push(55);
  if (aa['value_gap']) scores.push(60);
  if (summary.tax_gap_annual != null) scores.push(summary.tax_gap_annual > 20000 ? 45 : 70);
  if (summary.operations_score != null) scores.push(summary.operations_score);
  else if (aa['operations_gap']) scores.push(50);
  if (scores.length > 0) {
    summary.derived_iq_score = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }

  return Object.keys(summary).length > 0 ? summary : null;
}

/**
 * buildBusinessIntelligenceState
 *
 * BIS is now a PROJECTION of the Business Intelligence Engine.
 * The engine builds intelligent BusinessIntelligenceMetric objects,
 * calculates BI Health, creates snapshots, and writes the change journal.
 * BIS is the backward-compatible projection that existing dashboard
 * components continue to consume unchanged.
 *
 * @param {object} inputs
 * @param {object} inputs.profile        - Supabase profile row
 * @param {string} inputs.activeBusinessId
 * @param {object} inputs.assessmentSummary  - from supabaseUserData.getAssessmentSummary
 * @param {object} inputs.dashboardMetrics   - from supabaseUserData.getDashboardMetrics
 * @param {object} inputs.latestSnapshot     - from supabaseUserData.getLatestMetricSnapshot
 * @param {Array}  inputs.assessmentsData    - Base44 Assessment entities or Supabase rows
 * @param {Array}  inputs.documents          - document list
 * @param {Array}  inputs.roadmapItems
 * @param {object} inputs.businessEntity
 * @param {object} inputs.guestSession       - guest session object (for unauthenticated users)
 * @param {object} inputs.engineOpts         - engine build options (triggeredBy, reason)
 * @returns {BusinessIntelligenceState}
 */
export function buildBusinessIntelligenceState({
  profile = null,
  activeBusinessId = null,
  assessmentSummary = null,
  dashboardMetrics = null,
  latestSnapshot = null,
  assessmentsData = [],
  documents = [],
  roadmapItems = [],
  businessEntity = null,
  guestSession = null,
  canonicalFacts = null, // Phase 14.2C: canonical facts map for preferred reads
  engineOpts = {},
} = {}) {
  // For guests: build assessmentSummary from guest session data if no authenticated summary exists
  const guestSummary = (!assessmentSummary && guestSession) ? buildGuestAssessmentSummary(guestSession) : null;
  const resolvedAssessmentSummary = assessmentSummary || guestSummary || null;

  // ── Build via the Business Intelligence Engine ────────────────────────────
  // The engine produces intelligent metric objects, graph, health, snapshots,
  // journal, and a BIS projection. We return the projection + attach the engine.
  const engineResult = buildBusinessIntelligenceEngine({
    profile,
    activeBusinessId,
    assessmentSummary: resolvedAssessmentSummary,
    dashboardMetrics,
    latestSnapshot,
    assessmentsData,
    documents,
    roadmapItems,
    businessEntity,
    guestSession,
    canonicalFacts,
  }, engineOpts);

  // The BIS projection — structurally identical to the original BIS output
  const bis = engineResult.bis;

  // Attach the engine output for systems that want to use it directly
  // (Executive Briefing, Galileo, future AI, etc.)
  bis.engine = engineResult;

  return bis;
}

// ── Business Impact Score Calculator ─────────────────────────────────────────

/**
 * calculateBusinessImpactScore(bis)
 *
 * Execution readiness score — "how much of the measurable opportunity has been
 * identified and how complete is the intelligence profile?"
 * This is NOT the IQ Score. It measures data completeness + assessment coverage.
 *
 * Weights:
 *   Profit Gap      15%   Value Gap    15%   Tax Gap         15%
 *   Operations      15%   Recast EBITDA 10%  Freedom         10%
 *   Documents       10%   Assessment %  5%   Roadmap ready    3%
 *   Scenario ready   2%   (Total: 100%)
 */
export function calculateBusinessImpactScore(bis) {
  if (!bis) return null;
  const r = bis._raw || {};

  // Each dimension scores 0–100, then weighted
  const dims = {
    profit:     { score: r.profit_gap_amount > 0 ? 100 : 0,          weight: 0.15, label: 'Profit Gap',       present: r.profit_gap_amount > 0 },
    value:      { score: r.value_gap_amount > 0 ? 100 : 0,           weight: 0.15, label: 'Value Gap',        present: r.value_gap_amount > 0 },
    tax:        { score: r.tax_gap_annual > 0 ? 100 : 0,             weight: 0.15, label: 'Tax Gap',          present: r.tax_gap_annual > 0 },
    operations: { score: r.operations_score != null ? 100 : 0,        weight: 0.15, label: 'Operations',       present: r.operations_score != null },
    recast:     { score: r.recast_add_backs > 0 ? 100 : 0,           weight: 0.10, label: 'Recast EBITDA',    present: r.recast_add_backs > 0 },
    freedom:    { score: r.freedom_score != null ? 100 : 0,           weight: 0.10, label: 'Freedom',          present: r.freedom_score != null },
    documents:  { score: bis.hasDocuments ? 100 : 0,                  weight: 0.10, label: 'Documents',        present: bis.hasDocuments },
    assessment: { score: bis.hasAssessmentData ? 100 : 0,             weight: 0.05, label: 'Assessment',       present: bis.hasAssessmentData },
    roadmap:    { score: bis.hasRoadmap ? 100 : 0,                    weight: 0.03, label: 'Sprint Plan',      present: bis.hasRoadmap },
    scenario:   { score: (r.profit_gap_amount > 0 && r.freedom_score != null) ? 100 : (r.profit_gap_amount > 0 ? 50 : 0), weight: 0.02, label: 'Scenario', present: r.profit_gap_amount > 0 },
  };

  const raw_score = Object.values(dims).reduce((sum, d) => sum + d.score * d.weight, 0);
  const impact_score = Math.round(raw_score);

  const presentCount = Object.values(dims).filter(d => d.present).length;
  const totalDims = Object.keys(dims).length;
  const completion_percent = Math.round((presentCount / totalDims) * 100);

  // Identified opportunity = sum of all monetary gaps
  const identified_opportunity = (r.profit_gap_amount || 0) + (r.value_gap_amount || 0) + (r.tax_gap_annual || 0) + (r.recast_add_backs || 0);
  const available_opportunity = identified_opportunity > 0 ? identified_opportunity : null;

  const remaining_unknowns = Object.values(dims).filter(d => !d.present).map(d => d.label);

  let impact_label, impact_description;
  if (impact_score >= 80) {
    impact_label = 'Fully Equipped';
    impact_description = 'All major intelligence dimensions are active. Your dashboard reflects a complete picture.';
  } else if (impact_score >= 60) {
    impact_label = 'Strong Foundation';
    impact_description = 'Core gaps identified. Complete remaining assessments to unlock the full picture.';
  } else if (impact_score >= 35) {
    impact_label = 'Building Intelligence';
    impact_description = 'Good start — your profile is growing. Each completed assessment sharpens your strategy.';
  } else if (impact_score >= 10) {
    impact_label = 'Early Stage';
    impact_description = 'You\'ve begun. Complete your assessments to see your full business opportunity.';
  } else {
    impact_label = 'Getting Started';
    impact_description = 'Complete your first assessment to begin building your intelligence profile.';
  }

  const confidence = completion_percent >= 60 ? 'high' : completion_percent >= 30 ? 'medium' : 'low';

  return {
    impact_score,
    impact_label,
    impact_description,
    confidence,
    completion_percent,
    identified_opportunity,
    available_opportunity,
    remaining_unknowns,
    dimensions: dims,
  };
}

/**
 * Convenience: check if BIS has meaningful data for a specific gap type.
 */
export function bisHasGap(bis, type) {
  if (!bis) return false;
  switch (type) {
    case 'profit':     return bis._raw.profit_gap_amount > 0;
    case 'value':      return bis._raw.value_gap_amount > 0;
    case 'tax':        return bis._raw.tax_gap_annual > 0;
    case 'operations': return bis._raw.operations_score != null;
    default:           return false;
  }
}