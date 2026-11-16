/**
 * BusinessIntelligenceMetric — Type Definition & Factory
 *
 * Every business metric in the platform becomes an intelligent object
 * rather than a primitive value. A metric knows:
 *   - Its value and formatted display
 *   - Where the value came from (source/provenance)
 *   - How confident we are in it
 *   - What it depends on (dependencies)
 *   - What depends on it (dependents)
 *   - Which systems consume it (usedBy)
 *   - Related sprint, scenario, advisor notes, documents
 *   - Its recommendation and status
 *   - Version history (changeLog)
 *
 * This is the atomic unit of the Business Intelligence Engine.
 */

// ── Confidence levels ────────────────────────────────────────────────────────

export const CONFIDENCE_LEVELS = {
  user_entered:       { label: 'User Entered',        rank: 1 },
  assessment_summary: { label: 'Assessment Verified', rank: 2 },
  dashboard_metrics:  { label: 'System Calculated',  rank: 3 },
  snapshot:           { label: 'Historical Snapshot', rank: 4 },
  derived:            { label: 'Engine Derived',      rank: 5 },
  none:               { label: 'Emerging',            rank: 0 },
};

export function confidenceLabel(level) {
  return CONFIDENCE_LEVELS[level]?.label || 'Emerging';
}

// ── Metric categories ─────────────────────────────────────────────────────────

export const METRIC_CATEGORIES = {
  FINANCIAL:   'financial',
  VALUATION:   'valuation',
  TAX:         'tax',
  OPERATIONS:  'operations',
  FREEDOM:     'freedom',
  INTELLIGENCE:'intelligence',
  HEALTH:      'health',
};

// ── Metric status ─────────────────────────────────────────────────────────────

export const METRIC_STATUS = {
  ACTIVE:   'active',
  MISSING:  'missing',
  STALE:    'stale',
  DRAFT:    'draft',
};

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * createMetric — builds a BusinessIntelligenceMetric object.
 *
 * @param {object} opts
 * @param {string} opts.id               — unique metric identifier (e.g. 'profit_gap_amount')
 * @param {string} opts.category         — one of METRIC_CATEGORIES
 * @param {*}      opts.value             — raw value (number, string, null)
 * @param {string} opts.formatted        — display-formatted value
 * @param {string} opts.source           — where the value came from
 * @param {string} opts.confidence       — confidence level key
 * @param {string} opts.lastUpdated      — ISO timestamp
 * @param {string} opts.businessId
 * @param {string} opts.profileId
 * @param {string[]} opts.dependencies   — metric IDs this metric depends on
 * @param {string[]} opts.dependents     — metric IDs that depend on this metric
 * @param {string[]} opts.usedBy         — systems consuming this metric
 * @param {object} opts.relatedSprint    — sprint linkage
 * @param {object} opts.relatedScenario  — scenario linkage
 * @param {string[]} opts.relatedAdvisorNotes
 * @param {string[]} opts.relatedDocuments
 * @param {object} opts.recommendation   — { label, target, priority, estimatedImpact, requiredMetrics, requiredConfidence }
 * @param {string} opts.reasonIfMissing
 * @returns {BusinessIntelligenceMetric}
 */
export function createMetric({
  id,
  category = METRIC_CATEGORIES.FINANCIAL,
  value = null,
  formatted = null,
  source = 'unknown',
  confidence = 'none',
  lastUpdated = null,
  businessId = null,
  profileId = null,
  dependencies = [],
  dependents = [],
  usedBy = [],
  relatedSprint = null,
  relatedScenario = null,
  relatedAdvisorNotes = [],
  relatedDocuments = [],
  recommendation = null,
  reasonIfMissing = null,
}) {
  const isAvailable = value != null && value !== '' && !(typeof value === 'number' && isNaN(value));

  return {
    id,
    category,
    value: isAvailable ? value : null,
    formatted: isAvailable ? formatted : null,
    isAvailable,
    source: source || 'unknown',
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    lastUpdated,
    businessId,
    profileId,
    dependencies: dependencies || [],
    dependents: dependents || [],
    usedBy: usedBy || [],
    relatedSprint: relatedSprint || null,
    relatedScenario: relatedScenario || null,
    relatedAdvisorNotes: relatedAdvisorNotes || [],
    relatedDocuments: relatedDocuments || [],
    recommendation: recommendation || null,
    status: isAvailable ? METRIC_STATUS.ACTIVE : METRIC_STATUS.MISSING,
    reasonIfMissing: isAvailable ? null : (reasonIfMissing || 'No data available'),
    version: 1,
    changeLog: [],
    // Backward-compatible provenance (existing BIS consumers read this)
    _provenance: {
      source_type: source || 'unknown',
      source_label: source || 'Unknown source',
      confidence,
      last_updated: lastUpdated,
      business_id: businessId,
      profile_id: profileId,
    },
  };
}

/**
 * Attach a recommendation to an existing metric (returns new metric object).
 */
export function withRecommendation(metric, recommendation) {
  return { ...metric, recommendation };
}

/**
 * Attach sprint readiness to a metric.
 */
export function withSprintReadiness(metric, { relatedSprint, priority, estimatedImpact, requiredMetrics = [], requiredConfidence = 'assessment_summary' }) {
  return {
    ...metric,
    relatedSprint: relatedSprint || metric.relatedSprint,
    recommendation: {
      ...(metric.recommendation || {}),
      priority,
      estimatedImpact,
      requiredMetrics,
      requiredConfidence,
    },
  };
}