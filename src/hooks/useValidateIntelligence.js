/**
 * useValidateIntelligence — Phase 15.2
 *
 * Non-blocking hook for Living Intelligence enrichment of the Validate workspace.
 *
 * - Keyed by valuationId (business switching safe)
 * - Client-safe filtered by role
 * - Non-blocking: Dashboard/Validate renders without waiting
 * - Reuses bisVersion for invalidation
 * - No writes, no queue creation
 */
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';

export function useValidateIntelligence({ valuationId, verificationItems, recommendedAction, queueSummary }) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['validateIntelligence', valuationId, user?.id],
    queryFn: async () => {
      if (!valuationId) return null;
      const res = await base44.functions.invoke('livingIntelligence', {
        action: 'getValidateIntelligence',
        data: {
          valuation_id: valuationId,
          verification_items: verificationItems || [],
          recommended_action: recommendedAction || null,
          queue_summary: queueSummary || null,
        },
      });
      return res.data || null;
    },
    enabled: !!valuationId && !!verificationItems?.length,
    staleTime: 0,
    initialData: null,
  });
}