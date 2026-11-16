import React from 'react';
import { ShieldAlert, AlertTriangle, Eye, XCircle } from 'lucide-react';

/**
 * Displays the Devil's Advocate challenge output.
 * Challenges the evidence, not the person.
 */
export default function DecisionChallengeView({ challenge, loading }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">Challenging assumptions...</p>
        </div>
      </div>
    );
  }

  if (!challenge) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <div className="text-center">
          <ShieldAlert className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Run a challenge to test the decision</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Challenges the evidence, not the person</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      {challenge.challenge_summary && (
        <div className="glass rounded-lg p-3 border-l-2 border-amber-400/50">
          <p className="text-xs text-foreground leading-relaxed">{challenge.challenge_summary}</p>
        </div>
      )}

      {/* Challenged Assumptions */}
      {challenge.challenged_assumptions?.length > 0 && (
        <ChallengeSection icon={AlertTriangle} title="Challenged Assumptions" color="#F59E0B">
          {challenge.challenged_assumptions.map((a) => (
            <div key={a.assumption_id} className="text-xs border-l-2 pl-2 py-1" style={{ borderColor: a.severity === 'high' ? '#EF4444' : a.severity === 'medium' ? '#F59E0B' : '#6B7280' }}>
              <p className="font-medium text-foreground">{a.statement}</p>
              <p className="text-muted-foreground mt-0.5">{a.challenge}</p>
              <span className="text-[10px] capitalize" style={{ color: a.severity === 'high' ? '#EF4444' : '#F59E0B' }}>{a.severity} severity</span>
            </div>
          ))}
        </ChallengeSection>
      )}

      {/* Confirmation Bias */}
      {challenge.confirmation_bias_risks?.length > 0 && (
        <ChallengeSection icon={Eye} title="Confirmation Bias Risks" color="#8B5CF6">
          {challenge.confirmation_bias_risks.map((r, i) => (
            <p key={i} className="text-xs text-muted-foreground py-0.5">• {r}</p>
          ))}
        </ChallengeSection>
      )}

      {/* Missing Evidence */}
      {challenge.missing_evidence?.length > 0 && (
        <ChallengeSection icon={XCircle} title="Missing Evidence" color="#EF4444">
          {challenge.missing_evidence.map((e, i) => (
            <p key={i} className="text-xs text-muted-foreground py-0.5">• {e}</p>
          ))}
        </ChallengeSection>
      )}

      {/* Strongest Opposing Case */}
      {challenge.strongest_opposing_case && (
        <ChallengeSection icon={ShieldAlert} title="Strongest Opposing Case" color="#D4A853">
          <p className="text-xs text-foreground leading-relaxed">{challenge.strongest_opposing_case}</p>
        </ChallengeSection>
      )}

      {/* Failure Modes */}
      {challenge.failure_modes?.length > 0 && (
        <ChallengeSection icon={AlertTriangle} title="Failure Modes" color="#EF4444">
          {challenge.failure_modes.map((f) => (
            <div key={f.mode_id} className="text-xs border-l-2 border-red-400/30 pl-2 py-1">
              <p className="font-medium text-foreground">{f.description}</p>
              {f.trigger && <p className="text-muted-foreground mt-0.5">Trigger: {f.trigger}</p>}
              {f.impact && <p className="text-muted-foreground">Impact: {f.impact}</p>}
              {f.mitigation && <p className="text-amber-400/80">Mitigation: {f.mitigation}</p>}
            </div>
          ))}
        </ChallengeSection>
      )}
    </div>
  );
}

function ChallengeSection({ icon: Icon, title, color, children }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="w-3.5 h-3.5" style={{ color }} />
        <p className="text-[10px] font-semibold tracking-wider uppercase" style={{ color }}>{title}</p>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}