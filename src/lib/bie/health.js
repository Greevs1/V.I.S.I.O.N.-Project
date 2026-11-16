/**
 * Business Intelligence Health
 *
 * NOT the IQ Score. A different metric that measures the completeness
 * and quality of the intelligence profile itself.
 *
 * Dimensions:
 *   1. Assessment completion       — % of 6 assessments completed
 *   2. Document coverage           — documents uploaded
 *   3. Document confidence         — avg confidence of extracted data
 *   4. Business profile completeness — revenue, industry, etc.
 *   5. Extraction completeness     — % of documents with extracted data
 *   6. Scenario completeness       — has scenario been built
 *   7. Validation completeness    — % of metrics validated
 *
 * Returns:
 *   - Health Score (0-100)
 *   - Health Label
 *   - Missing Information (list)
 *   - Highest Value Missing Data
 */

import { getAssessmentCompletion, ASSESSMENT_LIST } from '../assessmentCompletionService';

const ASSESSMENT_TYPES = ASSESSMENT_LIST.map(a => a.type);

const DIMENSION_WEIGHTS = {
  assessment_completion:        0.25,
  document_coverage:            0.15,
  document_confidence:          0.10,
  business_profile_completeness: 0.15,
  extraction_completeness:      0.10,
  scenario_completeness:        0.10,
  validation_completeness:      0.15,
};

/**
 * calculateBusinessIntelligenceHealth
 *
 * @param {object} bis — BusinessIntelligenceState (the projection)
 * @param {object} opts — additional context (documents, assessments, etc.)
 * @returns {BIHealth}
 */
export function calculateBusinessIntelligenceHealth(bis, opts = {}) {
  if (!bis) return null;

  const r = bis._raw || {};
  const documents = opts.documents || [];
  const hasScenario = !!(r.profit_gap_amount > 0 && r.freedom_score != null);

  // ── 1. Assessment completion (CANONICAL — Phase 9) ────────────────────────
  const completion = getAssessmentCompletion(bis);
  const completedCount = completion.completedCount;
  const assessmentScore = completion.confidenceScore;

  // ── 2. Document coverage ──────────────────────────────────────────────────
  const docCount = documents.length;
  const documentCoverageScore = docCount >= 5 ? 100 : docCount >= 3 ? 70 : docCount >= 1 ? 40 : 0;

  // ── 3. Document confidence ────────────────────────────────────────────────
  const docsConfidence = documents.filter(d => d.confidence_score != null);
  const avgConfidence = docsConfidence.length > 0
    ? Math.round(docsConfidence.reduce((s, d) => s + d.confidence_score, 0) / docsConfidence.length)
    : 0;

  // ── 4. Business profile completeness ──────────────────────────────────────
  const profileFields = [r.revenue, r.current_value, bis.business?.entity?.industry];
  const filledProfile = profileFields.filter(v => v != null && v !== '').length;
  const profileScore = Math.round((filledProfile / profileFields.length) * 100);

  // ── 5. Extraction completeness ────────────────────────────────────────────
  const extractedDocs = documents.filter(d => d.extracted_data && Object.keys(d.extracted_data).length > 0);
  const extractionScore = docCount > 0 ? Math.round((extractedDocs.length / docCount) * 100) : 0;

  // ── 6. Scenario completeness ──────────────────────────────────────────────
  const scenarioScore = hasScenario ? 100 : (r.profit_gap_amount > 0 ? 50 : 0);

  // ── 7. Validation completeness ───────────────────────────────────────────
  const allMetrics = [
    r.profit_gap_amount, r.value_gap_amount, r.tax_gap_annual,
    r.operations_score, r.freedom_score, r.iq_score,
  ];
  const presentMetrics = allMetrics.filter(v => v != null && v !== 0).length;
  const validationScore = Math.round((presentMetrics / allMetrics.length) * 100);

  // ── Weighted health score ─────────────────────────────────────────────────
  const dimensions = {
    assessment_completion:         { score: assessmentScore,  weight: DIMENSION_WEIGHTS.assessment_completion,         label: 'Assessment Completion', present: completedCount > 0 },
    document_coverage:             { score: documentCoverageScore, weight: DIMENSION_WEIGHTS.document_coverage,           label: 'Document Coverage', present: docCount > 0 },
    document_confidence:           { score: avgConfidence,    weight: DIMENSION_WEIGHTS.document_confidence,           label: 'Document Confidence', present: avgConfidence > 0 },
    business_profile_completeness: { score: profileScore,     weight: DIMENSION_WEIGHTS.business_profile_completeness, label: 'Business Profile', present: filledProfile > 0 },
    extraction_completeness:       { score: extractionScore,  weight: DIMENSION_WEIGHTS.extraction_completeness,       label: 'Extraction Completeness', present: extractedDocs.length > 0 },
    scenario_completeness:         { score: scenarioScore,    weight: DIMENSION_WEIGHTS.scenario_completeness,         label: 'Scenario Completeness', present: hasScenario },
    validation_completeness:       { score: validationScore,  weight: DIMENSION_WEIGHTS.validation_completeness,       label: 'Validation Completeness', present: presentMetrics > 0 },
  };

  const health_score = Math.round(
    Object.values(dimensions).reduce((sum, d) => sum + d.score * d.weight, 0)
  );

  // ── Health label ──────────────────────────────────────────────────────────
  let health_label;
  if (health_score >= 80)       health_label = 'Comprehensive';
  else if (health_score >= 60)  health_label = 'Strong';
  else if (health_score >= 40)  health_label = 'Developing';
  else if (health_score >= 20)  health_label = 'Early';
  else                          health_label = 'Initial';

  // ── Missing information (assessment portion drives from canonical service) ─
  const missing_information = [];
  if (completedCount < ASSESSMENT_TYPES.length) {
    missing_information.push({
      dimension: 'assessments',
      items: completion.missing.map(m => m.label),
      impact: 'high',
    });
  }
  if (docCount === 0) missing_information.push({ dimension: 'documents', items: ['No documents uploaded'], impact: 'high' });
  if (avgConfidence < 60 && docCount > 0) missing_information.push({ dimension: 'document_confidence', items: ['Low extraction confidence'], impact: 'medium' });
  if (filledProfile < profileFields.length) missing_information.push({ dimension: 'business_profile', items: ['Incomplete business profile'], impact: 'medium' });
  if (!hasScenario) missing_information.push({ dimension: 'scenario', items: ['No scenario built'], impact: 'low' });

  // ── Highest value missing data (canonical) ──────────────────────────────────
  const highest_value_missing_data = completion.highestValueMissing
    ? {
        label: `${completion.highestValueMissing.label} Assessment`,
        estimatedValue: completion.highestValueMissing.estimatedValue,
        target: completion.highestValueMissing.path,
      }
    : null;

  return {
    health_score,
    health_label,
    dimensions,
    missing_information,
    highest_value_missing_data,
    completed_assessments: completedCount,
    total_assessments: ASSESSMENT_TYPES.length,
  };
}

export default calculateBusinessIntelligenceHealth;