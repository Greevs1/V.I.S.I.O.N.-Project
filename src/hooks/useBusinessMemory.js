import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

/**
 * useBusinessMemory — Phase 15.5
 *
 * Non-blocking hook for Business Memory retrieval and confirmation.
 *
 * Business Memory preserves durable executive context that should influence
 * future understanding. It is NOT chat history, notes, timeline, or facts.
 *
 * Keyed by businessId so memories remain scoped. No cross-business leakage.
 *
 * Retrieval does NOT consume Executive Sessions.
 */
export function useBusinessMemory({ businessId, meetingIntent, enabled = true }) {
  const queryClient = useQueryClient();

  // ── Retrieve relevant confirmed memories ────────────────────────────────
  const { data: memoriesData, isLoading } = useQuery({
    queryKey: ['businessMemories', businessId, meetingIntent],
    queryFn: async () => {
      const res = await base44.functions.invoke('businessMemoryService', {
        action: 'getRelevantBusinessMemories',
        data: {
          business_id: businessId,
          meeting_intent: meetingIntent,
          limit: 20,
        },
      });
      return res.data;
    },
    enabled: !!businessId && enabled,
    staleTime: 5 * 60 * 1000, // 5-minute stale time — memory doesn't change rapidly
  });

  // ── Confirm a memory candidate ───────────────────────────────────────────
  const confirmMutation = useMutation({
    mutationFn: async (candidate) => {
      const res = await base44.functions.invoke('businessMemoryService', {
        action: 'confirmBusinessMemory',
        data: {
          business_id: businessId,
          candidate,
        },
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['businessMemories', businessId] });
      queryClient.invalidateQueries({ queryKey: ['memoryCandidates', businessId] });
    },
  });

  // ── Reject a memory candidate ────────────────────────────────────────────
  const rejectMutation = useMutation({
    mutationFn: async ({ candidateId, reason }) => {
      const res = await base44.functions.invoke('businessMemoryService', {
        action: 'rejectMemoryCandidate',
        data: {
          business_id: businessId,
          candidate_id: candidateId,
          reason,
        },
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memoryCandidates', businessId] });
    },
  });

  // ── Create candidate from post-meeting outcome ──────────────────────────
  const createFromOutcomeMutation = useMutation({
    mutationFn: async (outcome) => {
      const res = await base44.functions.invoke('businessMemoryService', {
        action: 'createCandidateFromOutcome',
        data: {
          business_id: businessId,
          outcome,
        },
      });
      return res.data;
    },
  });

  // ── Get pending candidates for advisor review ────────────────────────────
  const { data: candidatesData } = useQuery({
    queryKey: ['memoryCandidates', businessId],
    queryFn: async () => {
      const res = await base44.functions.invoke('businessMemoryService', {
        action: 'getMemoryCandidates',
        data: { business_id: businessId },
      });
      return res.data;
    },
    enabled: !!businessId && enabled,
    staleTime: 60 * 1000,
  });

  return {
    memories: memoriesData?.memories || [],
    totalMemories: memoriesData?.total || 0,
    clientSafeFiltered: memoriesData?.filtered_for_client_safe || 0,
    isLoading,
    candidates: candidatesData?.candidates || [],
    confirm: confirmMutation.mutate,
    reject: rejectMutation.mutate,
    createFromOutcome: createFromOutcomeMutation.mutate,
    isConfirming: confirmMutation.isPending,
  };
}