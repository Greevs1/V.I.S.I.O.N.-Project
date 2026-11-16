/**
 * Sprint Recommendations Bridge
 *
 * The Business Intelligence Engine (BIE) builds bis.engine.recommendations
 * client-side. The Sprint engine must consume ONLY those recommendations
 * (never recompute them). This helper fetches the same inputs the BIE uses,
 * builds BIS via the existing engine, and returns a serializable
 * recommendations array for the ninetyDaySprint backend function.
 *
 * No recommendation logic lives here — it is a pure projection of
 * bis.engine.recommendations.
 */
import { base44 } from '@/api/base44Client';
import { buildBusinessIntelligenceState } from '@/lib/businessIntelligenceState';

export async function fetchSprintRecommendations(activeBusinessId) {
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
      label: r.recommendation?.relatedSprint?.label || r.id,
      target: r.recommendation?.relatedSprint?.target || null,
      priority: r.recommendation?.priority || 'medium',
      estimatedImpact: r.recommendation?.estimatedImpact || 0,
      estimatedImpactFormatted: r.formatted || null,
      requiredMetrics: r.recommendation?.requiredMetrics || [],
      requiredConfidence: r.recommendation?.requiredConfidence || null,
      value: r.value,
      formatted: r.formatted,
      category: r.category,
      confidence: r.confidence,
    }));
  } catch (e) {
    console.error('[sprintRecommendations] fetch failed:', e.message);
    return [];
  }
}