/**
 * ExpertVerificationQueue — shown in Expert Advisor Command Center.
 * Shows sprints assigned to the current advisor for verification.
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Shield, ExternalLink, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

function fmtDate(d) {
  if (!d) return '—';
  try { return format(new Date(d), 'MMM d, yyyy'); } catch { return '—'; }
}

const STATUS_LABELS = {
  galileo_verified_pending_expert: { label: 'Pending Review', color: '#D4A853' },
  expert_changes_requested: { label: 'Changes Requested', color: '#f59e0b' },
  galileo_and_expert_verified: { label: 'Verified', color: '#22c55e' },
};

export default function ExpertVerificationQueue({ onReviewSprint }) {
  const { supabaseProfile } = useAuth();
  const myProfileId = supabaseProfile?.id;

  const { data: sprints = [], isLoading } = useQuery({
    queryKey: ['expert-verification-assigned', myProfileId],
    queryFn: async () => {
      if (!myProfileId) return [];
      const res = await base44.functions.invoke('getSprintVerificationQueue', { mode: 'expert' });
      const all = res.data?.sprints || [];
      return all.filter(s =>
        s.needs_expert_review === true ||
        s.verification_status === 'galileo_verified_pending_expert' ||
        s.verification_status === 'expert_changes_requested'
      );
    },
    enabled: !!myProfileId,
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (sprints.length === 0) return null;

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(212,168,83,0.25)', background: 'rgba(212,168,83,0.03)' }}>
      <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'rgba(212,168,83,0.15)' }}>
        <Shield className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold">Sprint Verification Assigned to Me</p>
        <span className="ml-auto text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full px-2 py-0.5">
          {sprints.length}
        </span>
      </div>

      <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
        {sprints.map(sprint => {
          const statusCfg = STATUS_LABELS[sprint.verification_status] || STATUS_LABELS.galileo_verified_pending_expert;
          return (
            <div key={sprint.id} className="px-4 py-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{sprint.path_title || '90-Day Sprint'}</p>
                {sprint.business_name && (
                  <p className="text-xs text-muted-foreground truncate">{sprint.business_name}</p>
                )}
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[10px] font-semibold" style={{ color: statusCfg.color }}>
                    {statusCfg.label}
                  </span>
                  {sprint.review_requested_at && (
                    <span className="text-[10px] text-muted-foreground">
                      Requested {fmtDate(sprint.review_requested_at)}
                    </span>
                  )}
                </div>
                {sprint.verification_notes && (
                  <p className="text-[10px] text-amber-300/80 mt-1 truncate">Notes: {sprint.verification_notes}</p>
                )}
              </div>
              <Button
                size="sm"
                className="gap-1.5 h-7 text-xs shrink-0"
                onClick={() => onReviewSprint?.(sprint)}
              >
                <ExternalLink className="w-3 h-3" />
                Review
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}