/**
 * NBA Recommendations Bridge — Phase 12A.1
 *
 * The Business Intelligence Engine (BIE) builds bis.engine.recommendations
 * client-side. The NBA backend must consume ONLY those canonical recommendations
 * (never recompute them). This helper fetches the same inputs the BIE uses,
 * builds BIS via the existing engine, and returns a serializable canonical
 * recommendations array for the generateNextBestActions backend function.
 *
 * No recommendation logic lives here — it is a pure projection of
 * bis.engine.recommendations. The single recommendation generation source
 * is src/lib/bie/engine.js (SPRINT_RECOMMENDATIONS templates).
 */
import { base44 } from '@/api/base44Client';
import { buildBusinessIntelligenceState } from '@/lib/businessIntelligenceState';

const CONFIDENCE_SCORE = {
  user_entered: 90,
  assessment_summary: 80,
  dashboard_metrics: 60,
  snapshot: 50,
  derived: 40,
  none: 30,
};

/**
 * Fetch canonical BIE recommendations for a business.
 * @param {string} activeBusinessId — from BusinessContext (NOT primary_business_id)
 * @returns {Promise<Array>} canonical recommendation objects
 */
export async function fetchNbaRecommendations(activeBusinessId) {
  if (!activeBusinessId) return [];
  try {
    const [metricsRes, summaryRes, snapRes] = await Promise.all([
      base44.functions.invoke('supabaseUserData', { action: 'getDashboardMetrics', data: { businessId: activeBusinessId } }),
      base44.functions.invoke('supabaseUserData', { action: 'getAssessmentSummary', data: { businessId: activeBusinessId } }),
      base44.functions.invoke('supabaseUserData', { action: 'getLatestMetricSnapshot' }),
    ]);

    const bis = buildBusinessIntelligenceState({
      activeBusinessId,
      assessmentSummary: summaryRes.data?.summary || null,
      dashboardMetrics: metricsRes.data?.metrics || null,
      latestSnapshot: snapRes.data?.snapshot || null,
    });

    const recs = bis?.engine?.recommendations || [];
    return recs.map(r => ({
      id: r.id,
      metricId: r.id,
      title: r.relatedSprint?.label || r.id,
      summary: r.formatted || null,
      category: r.category,
      priority: r.recommendation?.priority || 'medium',
      estimatedImpact: r.recommendation?.estimatedImpact || 0,
      estimatedImpactFormatted: r.formatted || null,
      confidence: CONFIDENCE_SCORE[r.confidence] || 50,
      confidenceLevel: r.confidence || null,
      requiredConfidence: r.recommendation?.requiredConfidence || null,
      requiredMetrics: r.recommendation?.requiredMetrics || [],
      dependencies: [],
      relatedAssessment: r.relatedSprint?.target || null,
      relatedSprint: r.relatedSprint || null,
      status: r.isAvailable ? 'active' : 'missing',
      value: r.value,
      formatted: r.formatted,
      businessId: r.businessId || activeBusinessId,
      profileId: r.profileId || null,
      lastUpdated: r.lastUpdated || new Date().toISOString(),
      canonicalVersion: 1,
    }));
  } catch (e) {
    console.error('[nbaRecommendations] fetch failed:', e.message);
    return [];
  }
}