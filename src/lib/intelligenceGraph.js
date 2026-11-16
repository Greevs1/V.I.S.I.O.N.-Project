/**
 * Intelligence Graph — Phase 3 Foundation
 *
 * Internal-only canonical data structure for tracking business context,
 * evidence/source lineage, and metric provenance.
 *
 * NO UI EXPOSURE. Used internally by engines, recommendations, and Galileo
 * to know where values came from.
 *
 * Schema:
 *   Each node has:
 *     id         - unique identifier
 *     type       - 'metric' | 'assessment_answer' | 'document_field' | 'recommendation'
 *     value      - the raw value
 *     sources    - array of source references (lineage)
 *     confidence - 0–100
 *     updated_at - ISO timestamp
 */

const GRAPH_KEY = 'vision_intelligence_graph_v1';

/**
 * Source types for provenance tracking
 */
export const SOURCE_TYPES = {
  JOURNEY_ANSWER:   'journey_answer',
  MEMBER_ANSWER:    'member_answer',
  DOCUMENT_EXTRACT: 'document_extract',
  BENCHMARK:        'benchmark',
  COMPUTED:         'computed',
  PROMOTED:         'promoted_from_guest',
};

/**
 * Get the current in-memory graph (from sessionStorage)
 */
export function getGraph() {
  try {
    return JSON.parse(sessionStorage.getItem(GRAPH_KEY) || '{}');
  } catch {
    return {};
  }
}

/**
 * Record a metric with provenance
 *
 * @param {string} metricKey     - e.g. 'revenue', 'profit_gap', 'tax_gap_annual'
 * @param {*}      value         - the value
 * @param {string} sourceType    - SOURCE_TYPES constant
 * @param {object} sourceMeta    - { assessmentType?, fieldName?, documentId?, confidence? }
 */
export function recordMetric(metricKey, value, sourceType, sourceMeta = {}) {
  if (value == null) return;
  try {
    const graph = getGraph();
    const existing = graph[metricKey];
    const node = {
      id: metricKey,
      type: 'metric',
      value,
      sources: [
        ...(existing?.sources || []),
        {
          source_type: sourceType,
          ...sourceMeta,
          recorded_at: new Date().toISOString(),
        },
      ].slice(-5), // keep last 5 sources
      confidence: sourceMeta.confidence ?? (sourceType === SOURCE_TYPES.DOCUMENT_EXTRACT ? 85 : sourceType === SOURCE_TYPES.MEMBER_ANSWER ? 70 : 50),
      updated_at: new Date().toISOString(),
    };
    graph[metricKey] = node;
    sessionStorage.setItem(GRAPH_KEY, JSON.stringify(graph));
  } catch {}
}

/**
 * Record a full assessment completion into the graph
 * Called by assessment cores when they complete in journey or member mode
 */
export function recordAssessmentCompletion(assessmentType, answers, results, sourceType = SOURCE_TYPES.MEMBER_ANSWER) {
  if (!answers || !assessmentType) return;

  // Map assessment answers to canonical metric keys
  const mappings = {
    profit_gap: [
      ['revenue',              answers.p1_rev || answers.revenue || answers.annual_revenue],
      ['current_margin',       answers.p1_mymargin || answers.currentMargin || answers.current_margin],
      ['profit_gap_amount',    results?.profit_gap || results?.gapToBest || results?.gap_to_best],
    ],
    value_gap: [
      ['current_business_value', results?.current_value || results?.currentValue],
      ['value_gap_amount',       results?.value_gap || results?.valueGap],
    ],
    tax_gap: [
      ['tax_gap_annual',    results?.t3_annual_gap || results?.totalAnnualSavings],
    ],
    operations_gap: [
      ['operations_score',    results?.operations_score || results?.operationsScore],
      ['monthly_value_freed', results?.monthly_value_freed || results?.monthlyValueFreed],
      ['owner_hours_per_week',answers.o4_hrs || answers.hours_per_week || answers.hoursPerWeek],
    ],
    recast_ebitda: [
      ['total_add_backs',     results?.total_addbacks || results?.totalAddBacks || results?.total_add_backs],
      ['recast_ebitda_value', results?.recast_ebitda || results?.recastEbitda],
    ],
    freedom_assessment: [
      ['freedom_date',         results?.freedom_date || results?.freedomDate],
      ['target_monthly_income',answers.f_desired_retirement_income || answers.target_monthly_income || answers.targetMonthlyIncome],
    ],
  };

  const pairs = mappings[assessmentType] || [];
  for (const [key, value] of pairs) {
    if (value != null && value !== 0) {
      recordMetric(key, value, sourceType, {
        assessmentType,
        confidence: sourceType === SOURCE_TYPES.JOURNEY_ANSWER ? 60 : 70,
      });
    }
  }
}

/**
 * Record a document-extracted field into the graph
 */
export function recordDocumentField(fieldName, value, documentId, confidence = 80) {
  recordMetric(fieldName, value, SOURCE_TYPES.DOCUMENT_EXTRACT, {
    documentId,
    fieldName,
    confidence,
  });
}

/**
 * Get provenance for a metric
 * Returns { value, confidence, sources, age_hours }
 */
export function getMetricProvenance(metricKey) {
  const graph = getGraph();
  const node = graph[metricKey];
  if (!node) return null;
  const ageMs = Date.now() - new Date(node.updated_at).getTime();
  return {
    value:       node.value,
    confidence:  node.confidence,
    sources:     node.sources || [],
    age_hours:   Math.round(ageMs / 3_600_000),
    is_stale:    ageMs > 24 * 3_600_000, // stale if > 24h
  };
}

/**
 * Build a provenance-aware context object for dashboard/Galileo
 * Returns only fields that have confirmed values
 */
export function buildProvenanceContext() {
  const graph = getGraph();
  const context = {};
  for (const [key, node] of Object.entries(graph)) {
    if (node.value != null && node.confidence >= 40) {
      context[key] = {
        value:      node.value,
        confidence: node.confidence,
        source:     node.sources?.[node.sources.length - 1]?.source_type || 'unknown',
      };
    }
  }
  return context;
}

/**
 * Clear the graph (call on logout or when promoting guest session)
 */
export function clearGraph() {
  try { sessionStorage.removeItem(GRAPH_KEY); } catch {}
}