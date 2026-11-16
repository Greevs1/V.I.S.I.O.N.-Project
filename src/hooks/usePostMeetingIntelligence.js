import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

/**
 * usePostMeetingIntelligence — Phase 15.4
 *
 * Non-blocking hook for Post-Meeting Intelligence closeout.
 * Calls the postMeetingIntelligence backend function which:
 *   - Synthesizes proposed outcomes from meeting context + advisor notes
 *   - Routes approved outcomes to existing certified write services
 *
 * Keyed by businessId + meetingId so outcomes remain scoped.
 * No cross-business leakage.
 */
export function usePostMeetingIntelligence({ businessId, profileId, userEmail, intent, enabled = true }) {
  const queryClient = useQueryClient();
  const [closeoutState, setCloseoutState] = useState(null);

  // ── Synthesize outcomes ────────────────────────────────────────────────────
  const synthesizeMutation = useMutation({
    mutationFn: async ({ advisorNotes, explicitDecisions, meetingDate }) => {
      const res = await base44.functions.invoke('postMeetingIntelligence', {
        action: 'synthesizeOutcomes',
        data: {
          business_id: businessId,
          profile_id: profileId,
          user_email: userEmail,
          intent,
          advisor_notes: advisorNotes,
          explicit_decisions: explicitDecisions,
          meeting_date: meetingDate,
        },
      });
      return res.data;
    },
    onSuccess: (data) => {
      setCloseoutState(data);
      queryClient.invalidateQueries({ queryKey: ['post-meeting-closeout', businessId] });
    },
  });

  // ── Approve outcome ──────────────────────────────────────────────────────────
  const approveMutation = useMutation({
    mutationFn: async (outcome) => {
      const res = await base44.functions.invoke('postMeetingIntelligence', {
        action: 'approveOutcome',
        data: {
          business_id: businessId,
          profile_id: profileId,
          user_email: userEmail,
          outcome,
        },
      });
      return res.data;
    },
    onSuccess: (data) => {
      // Update local state — move outcome from proposed to approved
      if (closeoutState) {
        const updated = { ...closeoutState };
        updated.proposed_outcomes = updated.proposed_outcomes.filter(
          (o) => o.outcome_id !== data.outcome_id
        );
        updated.approved_outcomes = updated.approved_outcomes || [];
        updated.summary.total_approved++;
        updated.summary.total_proposed--;
        setCloseoutState(updated);
      }
      queryClient.invalidateQueries({ queryKey: ['post-meeting-closeout', businessId] });
    },
  });

  // ── Dismiss outcome ──────────────────────────────────────────────────────────
  const dismissMutation = useMutation({
    mutationFn: async (outcome) => {
      const res = await base44.functions.invoke('postMeetingIntelligence', {
        action: 'dismissOutcome',
        data: {
          business_id: businessId,
          outcome,
        },
      });
      return res.data;
    },
    onSuccess: (data) => {
      if (closeoutState) {
        const updated = { ...closeoutState };
        updated.proposed_outcomes = updated.proposed_outcomes.filter(
          (o) => o.outcome_id !== data.outcome_id
        );
        updated.summary.total_dismissed++;
        updated.summary.total_proposed--;
        setCloseoutState(updated);
      }
    },
  });

  // ── Defer outcome ────────────────────────────────────────────────────────────
  const deferMutation = useMutation({
    mutationFn: async (outcome) => {
      const res = await base44.functions.invoke('postMeetingIntelligence', {
        action: 'deferOutcome',
        data: {
          business_id: businessId,
          outcome,
        },
      });
      return res.data;
    },
    onSuccess: (data) => {
      if (closeoutState) {
        const updated = { ...closeoutState };
        updated.proposed_outcomes = updated.proposed_outcomes.filter(
          (o) => o.outcome_id !== data.outcome_id
        );
        updated.summary.total_deferred++;
        updated.summary.total_proposed--;
        setCloseoutState(updated);
      }
    },
  });

  // ── Get client-safe follow-up ────────────────────────────────────────────────
  const getClientFollowup = useCallback(async (approvedOutcomes) => {
    const res = await base44.functions.invoke('postMeetingIntelligence', {
      action: 'getClientSafeFollowup',
      data: {
        business_id: businessId,
        profile_id: profileId,
        intent,
        approved_outcomes: approvedOutcomes,
      },
    });
    return res.data;
  }, [businessId, profileId, intent]);

  return {
    closeoutState,
    isLoading: synthesizeMutation.isPending,
    isApproving: approveMutation.isPending,
    synthesize: synthesizeMutation.mutate,
    approve: approveMutation.mutate,
    dismiss: dismissMutation.mutate,
    defer: deferMutation.mutate,
    getClientFollowup,
    reset: () => setCloseoutState(null),
  };
}