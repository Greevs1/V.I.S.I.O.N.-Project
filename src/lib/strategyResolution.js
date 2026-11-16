/**
 * Strategy Resolution Bridge — Phase 12B.2
 *
 * Frontend bridge that fetches canonical BIE recommendations and passes them
 * to the selectStrategiesForClient compatibility adapter. The adapter resolves
 * strategies via resolveStrategyMappings and returns the legacy response shape.
 *
 * Canonical transport (same pattern as NBA and Sprint):
 *   Frontend / BIE → canonical recommendations payload
 *   → selectStrategiesForClient adapter
 *   → resolveStrategyMappings
 *   → legacy response/table adapter
 *
 * No recommendation logic lives here — it is a pure transport layer.
 */
import { base44 } from '@/api/base44Client';
import { fetchNbaRecommendations } from '@/lib/nbaRecommendations';

/**
 * Resolve strategies for a business using canonical BIE recommendations.
 *
 * @param {string} activeBusinessId — from BusinessContext
 * @param {object} opts
 * @param {boolean} opts.persist — whether to persist to client_strategy_scores
 * @returns {Promise<object>} { strategies, strategy_context, pipeline_status }
 */
export async function resolveStrategiesForBusiness(activeBusinessId, opts = {}) {
  if (!activeBusinessId) return { strategies: [], strategy_context: null, pipeline_status: { error: 'no_business_id' } };

  const { persist = true } = opts;

  // Step 1: Fetch canonical BIE recommendations (same source as NBA)
  const recommendations = await fetchNbaRecommendations(activeBusinessId);
  if (!recommendations || recommendations.length === 0) {
    return { strategies: [], strategy_context: null, pipeline_status: { error: 'no_recommendations' } };
  }

  // Step 2: Pass canonical payload to the selectStrategiesForClient adapter
  const res = await base44.functions.invoke('selectStrategiesForClient', {
    business_id: activeBusinessId,
    canonical_version: 1,
    recommendations,
    persist,
  });

  return res.data || { strategies: [], strategy_context: null, pipeline_status: { error: 'no_response' } };
}

/**
 * Resolve strategies for a single recommendation key (direct call to resolveStrategyMappings).
 * Used by admin tools and strategy metadata enrichment.
 *
 * @param {string} recommendationKey — e.g., 'profit_gap_amount'
 * @param {string} businessId
 * @param {object} clientData — { revenue, industry } for eligibility filtering
 * @returns {Promise<object>} { strategies, recommendation_key }
 */
export async function resolveStrategiesForKey(recommendationKey, businessId, clientData = null) {
  if (!recommendationKey) return { strategies: [], recommendation_key: null };

  const res = await base44.functions.invoke('resolveStrategyMappings', {
    action: 'resolve',
    recommendation_key: recommendationKey,
    business_id: businessId,
    client_data: clientData,
  });

  return res.data || { strategies: [], recommendation_key: recommendationKey };
}

/**
 * Get unmapped strategies for the admin Needs Mapping Review queue.
 *
 * @returns {Promise<object>} { unmapped, by_category, total }
 */
export async function getUnmappedStrategies() {
  const res = await base44.functions.invoke('resolveStrategyMappings', {
    action: 'getUnmappedStrategies',
  });
  return res.data || { unmapped: [], by_category: {}, total: 0 };
}