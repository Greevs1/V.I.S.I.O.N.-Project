/**
 * useBusinessIntelligenceContract — the SINGLE shared frontend contract hook.
 *
 * One React Query cache entry per business. Dashboard, Executive Brief, and
 * all frontend consumers read from this same hook. No independent contract
 * fetching or building.
 *
 * Query key: ['business-intelligence-contract', businessId, bisVersion]
 * - businessId scopes the cache per selected business
 * - bisVersion triggers refetch after assessment saves (same invalidation
 *   mechanism as all other Dashboard queries)
 *
 * @param {string} businessId  - active business ID from BusinessContext
 * @param {number} bisVersion  - BIS version counter (bumped after assessment saves)
 * @returns {{ data, isLoading, isError, error, refetch }}
 */
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export const CONTRACT_QUERY_KEY = 'business-intelligence-contract';

export function useBusinessIntelligenceContract(businessId, bisVersion) {
  return useQuery({
    queryKey: [CONTRACT_QUERY_KEY, businessId, bisVersion],
    queryFn: async () => {
      if (!businessId) return null;
      const res = await base44.functions.invoke('getBusinessIntelligenceContract', {
        business_id: businessId,
      });
      return res.data?.contract || null;
    },
    enabled: !!businessId,
    staleTime: 0,
  });
}