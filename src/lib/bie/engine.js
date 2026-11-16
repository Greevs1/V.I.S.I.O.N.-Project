/**
 * Business Intelligence Engine (BIE)
 *
 * The brain of the platform. Every business metric exists as an intelligent
 * BusinessIntelligenceMetric object rather than a primitive value.
 *
 * Architecture:
 *
 *   Business Intelligence Engine
 *   ↓
 *   Business Intelligence State (projection)
 *   ↓
 *   Dashboard / Executive Briefing / Scenario Builder / Sprints / Advisor / Galileo
 *
 * The engine:
 *   1. Builds BusinessIntelligenceMetric objects for every metric
 *   2. Links them via the Intelligence Graph
 *   3. Calculates Business Intelligence Health
 *   4. Creates an Intelligence Snapshot (if metrics changed)
 *   5. Writes Change Journal entries (if metrics changed)
 *   6. Generates Sprint-ready recommendations
 *   7. Projects to BIS (backward compatible)
 *
 * Nothing in the platform should calculate metrics independently anymore.
 */

import { createMetric, METRIC_CATEGORIES, withSprintReadiness } from './metricTypes';
import { getAssessmentCompletion } from '../assessmentCompletionService';
import IntelligenceGraph from './graph';
import { calculateBusinessIntelligenceHealth } from './health';
import { getLatestSnapshot, createSnapshot, appendSnapshot, getChangedMetricIdsSince, hydrateSnapshotsFromBackend } from './snapshots';
import { loadJournal, appendJournalEntry, entriesFromSnapshotDiff, JOURNAL_EVENT_TYPES, hydrateJournalFromBackend } from './journal';

// ── Formatting helpers (mirrors BIS for consistency) ─────────────────────────

const fmtUSD = (n) => {
  if (n == null || isNaN(n)) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
};

const fmtPct = (n) => (n == null || isNaN(n)) ? null : `${Math.round(n)}%`;
const fmtScore = (n) => (n == null || isNaN(n)) ? null : `${Math.round(n)}/100`;

// ── Sprint recommendation templates ───────────────────────────────────────────

const SPRINT_RECOMMENDATIONS = {
  profit_gap_amount: {
    label: 'Close Profit Gap',
    target: '/assessments/profit-gap',
    priority: 'high',
    estimatedImpact: (v) => v || 0,
    requiredMetrics: ['profit_gap_amount', 'revenue'],
    requiredConfidence: 'assessment_summary',
  },
  value_gap_amount: {
    label: 'Close Value Gap',
    target: '/assessments/value-gap',
    priority: 'high',
    estimatedImpact: (v) => v || 0,
    requiredMetrics: ['value_gap_amount', 'current_value'],
    requiredConfidence: 'assessment_summary',
  },
  tax_gap_annual: {
    label: 'Implement Tax Strategies',
    target: '/assessments/tax-gap',
    priority: 'high',
    estimatedImpact: (v) => v || 0,
    requiredMetrics: ['tax_gap_annual'],
    requiredConfidence: 'assessment_summary',
  },
  operations_score: {
    label: 'Improve Operations Health',
    target: '/assessments/operations-gap',
    priority: 'medium',
    estimatedImpact: () => 100000,
    requiredMetrics: ['operations_score'],
    requiredConfidence: 'assessment_summary',
  },
  freedom_score: {
    label: 'Accelerate Freedom',
    target: '/assessments/freedom',
    priority: 'medium',
    estimatedImpact: () => 50000,
    requiredMetrics: ['freedom_score', 'hours_freed_per_week'],
    requiredConfidence: 'assessment_summary',
  },
  recast_valuation_increase: {
    label: 'Recast EBITDA',
    target: '/assessments/recast-ebitda',
    priority: 'medium',
    estimatedImpact: (v) => v || 0,
    requiredMetrics: ['recast_add_backs'],
    requiredConfidence: 'dashboard_metrics',
  },
};

// ── Main Engine Builder ───────────────────────────────────────────────────────

/**
 * buildBusinessIntelligenceEngine
 *
 * @param {object} inputs — same shape as buildBusinessIntelligenceState
 * @param {object} opts
 * @param {string} opts.triggeredBy — what triggered this build ('assessment', 'document', 'scenario', 'advisor', 'sprint', 'system')
 * @param {string} opts.reason — human-readable reason
 * @returns {BIEngineResult}
 */
export function buildBusinessIntelligenceEngine(inputs = {}, opts = {}) {
  const {
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
  } = inputs;

  const triggeredBy = opts.triggeredBy || 'system';
  const reason = opts.reason || 'engine_rebuild';

  const m = dashboardMetrics || {};
  const as = assessmentSummary || {};
  const ls = latestSnapshot || {};
  const now = new Date().toISOString();
  const bid = activeBusinessId || m?.business_id || as?.business_id || null;
  const pid = profile?.id || null;
  const meta = { businessId: bid, profileId: pid, lastUpdated: as?.last_assessment_update || now };

  // ── Shared Business Intelligence Contract (preferred source) ────────────
  // The contract is the single certified current-business intelligence state.
  // BIE prefers contract values (from supabaseUserData.getAssessmentSummary)
  // over independent resolution. Legacy fallback (assessmentSummary →
  // dashboardMetrics) is preserved as a secondary path for when the contract
  // is not yet populated. See intelligenceContract/businessIntelligenceContract.ts.
  const contract = as?.intelligence_contract || null;

  // ── Resolve raw values (contract-preferred, legacy fallback) ───────────
  // Phase 14.2C: Canonical facts are PREFERRED for pilot facts (revenue).
  // Phase C: Shared Intelligence Contract is preferred for all business metrics.
  // Legacy fallback (assessmentSummary → dashboardMetrics) is preserved.
  const canonicalRevenue = canonicalFacts?.revenue?.value ?? null;
  const revenue = canonicalRevenue ?? contract?.profitability?.revenue ?? as?.revenue ?? m?.revenue ?? null;
  const profit_gap_amount = contract?.profitability?.profit_gap ?? as?.profit_gap_amount ?? m?.profit_gap?.gap_to_best ?? as?.profit_gap?.gap_to_best ?? null;
  const profit_score = contract?.profitability?.profit_score ?? as?.profit_gap_score ?? m?.profit_gap?.score ?? null;
  const value_gap_amount = contract?.valuation?.value_gap ?? as?.value_gap_amount ?? m?.value_gap?.gap_amount ?? as?.value_gap?.gap_amount ?? null;
  const current_value = contract?.valuation?.current_value ?? as?.current_business_value ?? m?.value_gap?.current_value ?? as?.value_gap_details?.current_value ?? null;
  // Source hierarchy: prefer Shared Intelligence Contract, then Base44 assessment
  // summary (fresh, business-scoped), then dashboard_metrics.
  const potential_value = contract?.valuation?.potential_value ?? as?.value_gap_details?.potential_value ?? m?.value_gap?.potential_value ?? null;
  // Tax Gap — handle both numeric column (saveAssessmentToSupabase) and JSONB object (hydrateDashboardFromJourney)
  const m_tax_gap = m?.tax_gap;
  const tax_gap_annual = contract?.tax?.annual_tax_gap
    ?? as?.tax_gap_annual
    ?? m?.tax_gap_details?.annual_overpayment
    ?? (typeof m_tax_gap === 'object' && m_tax_gap !== null ? m_tax_gap?.annual_overpayment : (typeof m_tax_gap === 'number' && m_tax_gap > 0 ? m_tax_gap : null))
    ?? null;
  const tax_gap_ten_year = as?.tax_gap_ten_year ?? (typeof m_tax_gap === 'object' && m_tax_gap !== null ? m_tax_gap?.ten_year_cost : null) ?? (tax_gap_annual ? tax_gap_annual * 10 : null);
  const tax_strategy_count = as?.tax_gap_details?.opportunities?.length ?? as?.tax_opportunities?.length ?? (typeof m_tax_gap === 'object' && m_tax_gap !== null ? m_tax_gap?.strategy_count : null) ?? null;
  // Operations — handle both numeric column (saveAssessmentToSupabase) and JSONB object (hydrateDashboardFromJourney)
  const m_ops_gap = m?.operations_gap;
  const operations_score = contract?.operations?.operations_score
    ?? as?.operations_score
    ?? m?.operations_gap_details?.score
    ?? (typeof m_ops_gap === 'object' && m_ops_gap !== null ? m_ops_gap?.health_score : (typeof m_ops_gap === 'number' ? m_ops_gap : null))
    ?? null;
  const monthly_take_home = as?.monthly_take_home
    ?? m?.operations_gap_details?.monthly_take_home
    ?? (typeof m_ops_gap === 'object' && m_ops_gap !== null ? m_ops_gap?.monthly_take_home : null)
    ?? as?.operations_gap_details?.monthly_take_home ?? null;
  const hours_worked_per_week = as?.hours_worked_per_week
    ?? m?.operations_gap_details?.hours_worked_per_week
    ?? (typeof m_ops_gap === 'object' && m_ops_gap !== null ? m_ops_gap?.hours_worked_per_week : null)
    ?? as?.operations_gap_details?.hours_worked_per_week ?? null;
  const hourly_value_of_time_freed = (() => {
    const direct = as?.hourly_value_of_time_freed ?? m?.operations_gap?.hourly_value_of_time_freed ?? as?.operations_gap_details?.hourly_value_of_time_freed ?? as?.hourly_value_freed ?? m?.operations_gap?.hourly_value_freed ?? null;
    if (direct != null) return direct;
    if (monthly_take_home > 0 && hours_worked_per_week > 0) return Math.round(monthly_take_home / (hours_worked_per_week * 4));
    return null;
  })();
  const monthly_value_of_time_freed = (() => {
    const direct = contract?.operations?.monthly_value_of_time_freed ?? as?.monthly_value_of_time_freed ?? m?.operations_gap?.monthly_value_of_time_freed ?? as?.operations_gap_details?.monthly_value_of_time_freed ?? as?.monthly_value_freed ?? m?.operations_gap?.monthly_value_freed ?? null;
    if (direct != null) return direct;
    if (hourly_value_of_time_freed > 0) {
      const freed = as?.hours_freed_per_week ?? m?.operations_gap?.hours_freed_per_week ?? null;
      if (freed != null) return Math.round(freed * 4 * hourly_value_of_time_freed);
    }
    return null;
  })();
  const hours_freed_per_week = (() => {
    const stored = as?.hours_freed_per_week ?? m?.operations_gap?.hours_freed_per_week ?? as?.operations_gap_details?.hours_freed_per_week ?? m?.operations_gap?.freed_hours_per_week ?? as?.operations_gap_details?.freed_hours_per_week ?? null;
    // No hardcoded default — return null when no data exists
    return stored;
  })();
  // Recast EBITDA — contract-preferred, then assessmentSummary, then dashboard_metrics
  const m_recast = m?.recast_ebitda;
  const recast_ebitda = contract?.profitability?.recast_ebitda ?? null;
  const recast_add_backs = contract?.profitability?.total_addbacks
    ?? as?.recast_ebitda_details?.add_backs
    ?? m?.recast_ebitda_gap_details?.add_backs
    ?? (typeof m_recast === 'object' && m_recast !== null ? m_recast?.total_add_backs : null)
    ?? null;
  const recast_valuation_increase = contract?.profitability?.recast_value_impact
    ?? as?.recast_ebitda_details?.valuation_increase
    ?? m?.recast_ebitda_gap_details?.valuation_increase
    ?? (typeof m_recast === 'object' && m_recast !== null ? m_recast?.valuation_increase : null)
    ?? null;
  const freedom_score = contract?.freedom?.freedom_score ?? as?.freedom_score ?? m?.freedom_score ?? null;
  const iq_score = contract?.business_iq
    ?? (m?.ciq_score > 0 ? m.ciq_score : m?.overall_impact_score > 0 ? m.overall_impact_score : ls?.overall_impact_score > 0 ? Math.round(ls.overall_impact_score) : as?.derived_iq_score > 0 ? as.derived_iq_score : null);

  // ── Build BusinessIntelligenceMetric objects ─────────────────────────────
  const metrics = {};

  const addMetric = (id, category, value, formatted, source, confidence, extras = {}) => {
    const deps = IntelligenceGraph.getDependencies(id);
    const dependents = IntelligenceGraph.getDependents(id);
    const usedBy = IntelligenceGraph.getConsumers(id);
    let metric = createMetric({
      id, category, value, formatted, source, confidence,
      ...meta,
      dependencies: deps,
      dependents: dependents,
      usedBy,
      ...extras,
    });
    // Attach sprint readiness if a recommendation template exists
    const sprintRec = SPRINT_RECOMMENDATIONS[id];
    if (sprintRec && value != null) {
      metric = withSprintReadiness(metric, {
        relatedSprint: { label: sprintRec.label, target: sprintRec.target },
        priority: sprintRec.priority,
        estimatedImpact: sprintRec.estimatedImpact(value),
        requiredMetrics: sprintRec.requiredMetrics,
        requiredConfidence: sprintRec.requiredConfidence,
      });
    }
    metrics[id] = metric;
  };

  // Phase 14.2C: Source label reflects canonical when canonical revenue is used
  const revenueSource = canonicalRevenue != null ? 'canonical' : (as?.revenue != null ? 'assessment_summary' : 'dashboard_metrics');
  addMetric('revenue', METRIC_CATEGORIES.FINANCIAL, revenue, fmtUSD(revenue), revenueSource, 'assessment_summary');
  addMetric('profit_gap_amount', METRIC_CATEGORIES.FINANCIAL, profit_gap_amount, fmtUSD(profit_gap_amount), as?.profit_gap_amount != null ? 'assessment_summary' : 'dashboard_metrics', 'assessment_summary');
  addMetric('profit_score', METRIC_CATEGORIES.INTELLIGENCE, profit_score, fmtScore(profit_score), 'assessment_summary', 'assessment_summary');
  addMetric('value_gap_amount', METRIC_CATEGORIES.VALUATION, value_gap_amount, fmtUSD(value_gap_amount), as?.value_gap_amount != null ? 'assessment_summary' : 'dashboard_metrics', 'assessment_summary');
  addMetric('current_value', METRIC_CATEGORIES.VALUATION, current_value, fmtUSD(current_value), 'assessment_summary', 'assessment_summary');
  addMetric('potential_value', METRIC_CATEGORIES.VALUATION, potential_value, fmtUSD(potential_value), 'assessment_summary', 'assessment_summary');
  addMetric('tax_gap_annual', METRIC_CATEGORIES.TAX, tax_gap_annual, tax_gap_annual != null ? `${fmtUSD(tax_gap_annual)}/yr` : null, as?.tax_gap_annual != null ? 'assessment_summary' : 'dashboard_metrics', 'assessment_summary');
  addMetric('tax_gap_ten_year', METRIC_CATEGORIES.TAX, tax_gap_ten_year, fmtUSD(tax_gap_ten_year), 'derived', 'derived');
  addMetric('tax_strategy_count', METRIC_CATEGORIES.TAX, tax_strategy_count, tax_strategy_count != null ? `${tax_strategy_count}` : null, 'assessment_summary', 'assessment_summary');
  addMetric('operations_score', METRIC_CATEGORIES.OPERATIONS, operations_score, fmtScore(operations_score), as?.operations_score != null ? 'assessment_summary' : 'dashboard_metrics', 'assessment_summary');
  addMetric('monthly_take_home', METRIC_CATEGORIES.OPERATIONS, monthly_take_home, fmtUSD(monthly_take_home), 'assessment_summary', 'assessment_summary');
  addMetric('hours_worked_per_week', METRIC_CATEGORIES.OPERATIONS, hours_worked_per_week, hours_worked_per_week != null ? `${hours_worked_per_week}h/wk` : null, 'assessment_summary', 'assessment_summary');
  addMetric('hourly_value_of_time_freed', METRIC_CATEGORIES.OPERATIONS, hourly_value_of_time_freed, hourly_value_of_time_freed != null ? `${fmtUSD(hourly_value_of_time_freed)}/hr` : null, hourly_value_of_time_freed != null ? 'assessment_summary' : 'derived', 'derived');
  addMetric('monthly_value_of_time_freed', METRIC_CATEGORIES.OPERATIONS, monthly_value_of_time_freed, monthly_value_of_time_freed != null ? `${fmtUSD(monthly_value_of_time_freed)}/mo` : null, 'assessment_summary', 'assessment_summary');
  addMetric('hours_freed_per_week', METRIC_CATEGORIES.OPERATIONS, hours_freed_per_week, hours_freed_per_week != null ? `${hours_freed_per_week}h/wk` : null, 'assessment_summary', 'assessment_summary');
  addMetric('recast_ebitda', METRIC_CATEGORIES.FINANCIAL, recast_ebitda, fmtUSD(recast_ebitda), contract?.profitability?.recast_ebitda != null ? 'intelligence_contract' : 'dashboard_metrics', 'dashboard_metrics');
  addMetric('recast_add_backs', METRIC_CATEGORIES.FINANCIAL, recast_add_backs, fmtUSD(recast_add_backs), contract?.profitability?.total_addbacks != null ? 'intelligence_contract' : 'dashboard_metrics', 'dashboard_metrics');
  addMetric('recast_valuation_increase', METRIC_CATEGORIES.VALUATION, recast_valuation_increase, fmtUSD(recast_valuation_increase), contract?.profitability?.recast_value_impact != null ? 'intelligence_contract' : 'dashboard_metrics', 'dashboard_metrics');
  addMetric('freedom_score', METRIC_CATEGORIES.FREEDOM, freedom_score, fmtScore(freedom_score), 'assessment_summary', 'assessment_summary');
  addMetric('iq_score', METRIC_CATEGORIES.INTELLIGENCE, iq_score, iq_score != null ? `${Math.round(iq_score)}` : null, m?.ciq_score ? 'dashboard_metrics' : as?.derived_iq_score ? 'assessment_summary' : 'snapshot', 'dashboard_metrics');

  // ── Build a lightweight BIS-compatible projection ────────────────────────
  // This is what existing dashboard components consume. It must remain
  // structurally identical to the original buildBusinessIntelligenceState output.
  // CANONICAL (Phase 9): completion derives from metric presence via the
  // Assessment Completion Service — never from raw entity lists. This keeps
  // bis.onboarding in lock-step with BIHealthCard, IQDashboard, and the Briefing.
  const _completionForOnboarding = getAssessmentCompletion({
    _raw: { profit_gap_amount, value_gap_amount, tax_gap_annual, operations_score, recast_add_backs, freedom_score },
  });
  const completedAssessmentTypes = new Set(_completionForOnboarding.completedTypes);
  const hasAssessmentData = completedAssessmentTypes.size > 0 || !!(profit_gap_amount > 0 || value_gap_amount > 0 || tax_gap_annual > 0 || operations_score != null);
  const guestDocCount = guestSession?.document_queue?.filter(d => d.status === 'uploaded_guest').length || 0;
  const hasDocuments = (documents || []).filter(d => d.file_url && !d.file_url.includes('placeholder')).length > 0 || guestDocCount > 0;
  const hasRoadmap = (roadmapItems || []).length > 0;
  const hasData = !!(profit_gap_amount || value_gap_amount || tax_gap_annual || operations_score != null || iq_score);

  const targetedImprovements = [];
  if (profit_gap_amount > 0) targetedImprovements.push({ type: 'profit', label: 'Profit Gap', value: profit_gap_amount, formatted: fmtUSD(profit_gap_amount) });
  if (value_gap_amount > 0) targetedImprovements.push({ type: 'value', label: 'Value Gap', value: value_gap_amount, formatted: fmtUSD(value_gap_amount) });
  if (tax_gap_annual > 0) targetedImprovements.push({ type: 'tax', label: 'Tax Gap', value: tax_gap_annual, formatted: `${fmtUSD(tax_gap_annual)}/yr` });
  if (operations_score != null) targetedImprovements.push({ type: 'operations', label: 'Ops Health', value: operations_score, formatted: fmtScore(operations_score) });
  if (hourly_value_of_time_freed > 0) targetedImprovements.push({ type: 'time_freed', label: 'Value of Time Freed', value: hourly_value_of_time_freed, formatted: `${fmtUSD(hourly_value_of_time_freed)}/hr` });

  // Helper to project a metric back to the old BIS metric shape
  const projectMetric = (metric) => ({
    value: metric.value,
    formatted: metric.formatted,
    isAvailable: metric.isAvailable,
    source: metric.source,
    confidence: metric.confidence,
    lastUpdated: metric.lastUpdated,
    businessId: metric.businessId,
    profileId: metric.profileId,
    reasonIfMissing: metric.reasonIfMissing,
    _provenance: metric._provenance,
  });

  const bis = {
    _raw: {
      profit_gap_amount, value_gap_amount, current_value, potential_value,
      tax_gap_annual, tax_gap_ten_year, tax_strategy_count, operations_score,
      monthly_take_home, hours_worked_per_week, hourly_value_of_time_freed,
      monthly_value_of_time_freed, hours_freed_per_week, recast_add_backs,
      recast_valuation_increase, recast_ebitda, freedom_score, iq_score, revenue,
    },
    hasData, hasAssessmentData, hasDocuments, hasRoadmap,
    isGuest: !assessmentSummary && !!guestSession,
    targetedImprovements,
    iq: { iq_score: projectMetric(metrics.iq_score) },
    profit: {
      profit_gap_amount: projectMetric(metrics.profit_gap_amount),
      profit_score: projectMetric(metrics.profit_score),
      severity: as?.profit_gap_severity || m?.profit_gap?.severity || null,
      details: as?.profit_gap_details || {},
    },
    value: {
      value_gap_amount: projectMetric(metrics.value_gap_amount),
      current_value: projectMetric(metrics.current_value),
      potential_value: projectMetric(metrics.potential_value),
      severity: as?.value_gap_severity || m?.value_gap?.severity || null,
      details: as?.value_gap_details || {},
    },
    tax: {
      tax_gap_annual: projectMetric(metrics.tax_gap_annual),
      tax_gap_ten_year: projectMetric(metrics.tax_gap_ten_year),
      tax_strategy_count: projectMetric(metrics.tax_strategy_count),
      severity: as?.tax_gap_severity || m?.tax_gap?.severity || null,
      details: as?.tax_gap_details || {},
    },
    operations: {
      operations_score: projectMetric(metrics.operations_score),
      monthly_take_home: projectMetric(metrics.monthly_take_home),
      hours_worked_per_week: projectMetric(metrics.hours_worked_per_week),
      hourly_value_of_time_freed: projectMetric(metrics.hourly_value_of_time_freed),
      monthly_value_of_time_freed: projectMetric(metrics.monthly_value_of_time_freed),
      hours_freed_per_week: projectMetric(metrics.hours_freed_per_week),
      severity: as?.operations_gap_severity || m?.operations_gap?.severity || null,
      details: as?.operations_gap_details || {},
    },
    recastEbitda: {
      recast_ebitda: projectMetric(metrics.recast_ebitda),
      recast_add_backs: projectMetric(metrics.recast_add_backs),
      recast_valuation_increase: projectMetric(metrics.recast_valuation_increase),
      details: m?.recast_ebitda || {},
    },
    freedom: { freedom_score: projectMetric(metrics.freedom_score) },
    business: { revenue: projectMetric(metrics.revenue), business_id: bid, profile_id: pid, entity: businessEntity || null },
    onboarding: {
      hasDocuments, hasAssessmentData, hasRoadmap,
      completedAssessmentTypes: [...completedAssessmentTypes],
      steps: { upload: hasDocuments, assess: hasAssessmentData, execute: hasRoadmap },
    },
    _sources: { assessmentSummary: as, dashboardMetrics: m, latestSnapshot: ls },
  };

  // ── Calculate Business Intelligence Health ────────────────────────────────
  const health = calculateBusinessIntelligenceHealth(bis, { documents });

  // ── Create snapshot (if metrics changed) ──────────────────────────────────
  const previousSnapshot = getLatestSnapshot(bid);
  const snapshot = createSnapshot({
    businessId: bid,
    metrics,
    previousSnapshot,
    reason,
    triggeredBy,
  });

  const hasChanges = snapshot.changedMetrics.length > 0;
  if (hasChanges && bid) {
    appendSnapshot(bid, snapshot, pid);
    // Write journal entries from the diff (each gets a Galileo summary)
    const journalEntries = entriesFromSnapshotDiff(snapshot);
    for (const entry of journalEntries) {
      appendJournalEntry(bid, entry, pid);
    }
  }

  // ── Build recommendations (Sprint-ready) ───────────────────────────────────
  const recommendations = Object.values(metrics)
    .filter(m => m.recommendation != null)
    .sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return (priorityOrder[a.recommendation.priority] ?? 3) - (priorityOrder[b.recommendation.priority] ?? 3);
    });

  // ── Changed metric IDs since last briefing (for Executive Briefing evolution) ─
  const lastBriefingVersion = (() => {
    try { return parseInt(localStorage.getItem('vision_bie_last_briefing_version_' + bid) || '0', 10) || 0; }
    catch { return 0; }
  })();
  const changedSinceLastBriefing = bid ? getChangedMetricIdsSince(bid, lastBriefingVersion) : [];

  // ── Return the full engine result ───────────────────────────────────────────
  return {
    // The intelligent metric objects
    metrics,
    // The intelligence graph
    graph: IntelligenceGraph,
    // Business Intelligence Health (NOT IQ Score)
    health,
    // The current snapshot
    snapshot,
    // Whether metrics changed in this build
    hasChanges,
    // Sprint-ready recommendations
    recommendations,
    // Metric IDs that changed since the last executive briefing
    changedSinceLastBriefing,
    // The BIS projection (backward compatible)
    bis,
    // Metadata
    _meta: {
      businessId: bid,
      profileId: pid,
      triggeredBy,
      reason,
      timestamp: now,
      metricCount: Object.keys(metrics).length,
      activeMetricCount: Object.values(metrics).filter(m => m.isAvailable).length,
    },
  };
}

/**
 * Mark that a briefing has been shown, recording the current snapshot version.
 */
export function markBriefingShown(businessId) {
  if (!businessId) return;
  const latest = getLatestSnapshot(businessId);
  if (latest) {
    try { localStorage.setItem('vision_bie_last_briefing_version_' + businessId, String(latest.version)); }
    catch { /* non-fatal */ }
  }
}

/**
 * Hydrate BIE snapshots and journal from Supabase for a business.
 * Called on app load / business switch to pull persisted data into localStorage.
 * Fire-and-forget — the engine reads from localStorage synchronously.
 */
export async function hydrateBieFromBackend(businessId, profileId) {
  if (!businessId || !profileId) return;
  await Promise.all([
    hydrateSnapshotsFromBackend(businessId, profileId),
    hydrateJournalFromBackend(businessId, profileId),
  ]);
}

export default { buildBusinessIntelligenceEngine, markBriefingShown, hydrateBieFromBackend };