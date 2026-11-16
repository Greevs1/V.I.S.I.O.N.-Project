import React from 'react';
import { Shield, ShieldCheck, AlertTriangle } from 'lucide-react';

const STATUS_CONFIG = {
  galileo_verified_pending_expert: {
    label: 'GALILEO VERIFIED, NOT EXPERT VERIFIED',
    sublabel: 'AI-generated plan awaiting expert review',
    icon: Shield,
    color: '#D4A853',
    bg: 'rgba(212, 168, 83, 0.1)',
    border: 'rgba(212, 168, 83, 0.3)',
    textColor: '#D4A853',
  },
  galileo_and_expert_verified: {
    label: 'GALILEO & EXPERT VERIFIED',
    sublabel: 'Human expert has reviewed and approved this plan',
    icon: ShieldCheck,
    color: '#22c55e',
    bg: 'rgba(34, 197, 94, 0.1)',
    border: 'rgba(34, 197, 94, 0.3)',
    textColor: '#22c55e',
  },
  expert_changes_requested: {
    label: 'EXPERT REVIEW: CHANGES REQUESTED',
    sublabel: 'Expert has requested modifications to this plan',
    icon: AlertTriangle,
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.1)',
    border: 'rgba(245, 158, 11, 0.3)',
    textColor: '#f59e0b',
  },
};

export default function SprintVerificationBadge({ sprint }) {
  const status = sprint?.verification_status || 'galileo_verified_pending_expert';
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.galileo_verified_pending_expert;
  const Icon = config.icon;

  return (
    <div
      className="rounded-xl p-4 mb-4 border"
      style={{
        background: config.bg,
        border: `1px solid ${config.border}`,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${config.color}20` }}
        >
          <Icon className="w-5 h-5" style={{ color: config.color }} />
        </div>

        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-bold tracking-wide"
            style={{ color: config.color }}
          >
            {config.label}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {config.sublabel}
          </p>

          {/* Show verification notes if present */}
          {sprint?.verification_notes && (
            <div className="mt-3 p-2 rounded-lg bg-background/50 border border-border">
              <p className="text-[11px] text-muted-foreground">
                <strong>Expert Notes:</strong> {sprint.verification_notes}
              </p>
            </div>
          )}

          {/* Show timestamps */}
          {sprint?.expert_verified_at && (
            <p className="text-[10px] text-muted-foreground mt-2">
              Verified on {new Date(sprint.expert_verified_at).toLocaleDateString()}
            </p>
          )}
          {sprint?.review_requested_at && status === 'galileo_verified_pending_expert' && (
            <p className="text-[10px] text-muted-foreground mt-2">
              Review requested {new Date(sprint.review_requested_at).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}