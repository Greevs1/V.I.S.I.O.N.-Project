import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

/**
 * useMeetingIntelligence — Phase 15.3A
 *
 * Non-blocking hook for Meeting Intelligence synthesis.
 * Calls the meetingIntelligence backend function which synthesizes
 * a Two-Minute Meeting Brief from certified outputs.
 *
 * Keyed by businessId + intent so changing intent re-synthesizes
 * without cross-business leakage.
 */
export function useMeetingIntelligence({ businessId, profileId, userEmail, intent, enabled = true }) {
  return useQuery({
    queryKey: ['meeting-intelligence', businessId, intent],
    queryFn: async () => {
      const res = await base44.functions.invoke('meetingIntelligence', {
        action: 'getMeetingBrief',
        data: {
          business_id: businessId,
          profile_id: profileId,
          user_email: userEmail,
          intent,
        },
      });
      return res.data;
    },
    enabled: !!businessId && enabled,
    staleTime: 5 * 60 * 1000, // 5 min cache — intent change re-synthesizes, business data stays fresh
    initialData: null,
    refetchOnWindowFocus: false,
  });
}