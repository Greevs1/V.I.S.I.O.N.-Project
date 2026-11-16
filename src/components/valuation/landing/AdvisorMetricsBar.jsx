/**
 * AdvisorMetricsBar — Phase 13.3F.2
 *
 * Compact advisor-only metrics bar. Shows operational health indicators
 * that advisors need but owners do not: verification blockers, stale
 * calculations, missing approvals, missing evidence, conclusion status,
 * publication readiness, and client visibility.
 *
 * Owner-facing value metrics remain primary; this bar is secondary.
 */
import React from 'react';

const STATUS_COLOR = {
  complete: '#22c55e',
  ready: '#22c55e',
  in_progress: '#00D4FF',
  not_started: '#6B7280',
  stale: '#F59E0B',
  blocked: '#EF4444',
};

const STATUS_LABEL = {
  complete: 'Complete',
  ready: 'Ready',
  in_progress: 'In Progress',
  not_started: 'Not Started',
  stale: 'Stale',
  blocked: 'Blocked',
};

function Metric({ label, value, alert }) {
  const color = alert ? '#EF4444' : '#6B7280';
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      <span className="text-[10px] text-muted-foreground/70">{label}:</span>
      <span className="text-[10px] font-medium text-foreground/90">{value}</span>
    </div>
  );
}

export default function AdvisorMetricsBar({ metrics }) {
  if (!metrics) return null;
  const {
    verificationBlockers, staleCalculations, missingApprovals, missingEvidence,
    conclusionStatus, publishStatus, clientVisibility,
  } = metrics;

  return (
    <div
      className="rounded-xl p-3 flex flex-wrap items-center gap-x-4 gap-y-2"
      style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)' }}
    >
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground/50 font-semibold w-full mb-0.5">Advisor Operations</p>
      <Metric label="Verification Blockers" value={verificationBlockers} alert={verificationBlockers > 0} />
      <Metric label="Stale Calcs" value={staleCalculations} alert={staleCalculations > 0} />
      <Metric label="Missing Approvals" value={missingApprovals} alert={missingApprovals > 0} />
      <Metric label="Missing Evidence" value={missingEvidence} alert={missingEvidence > 0} />
      <Metric label="Conclusion" value={STATUS_LABEL[conclusionStatus] || conclusionStatus} />
      <Metric label="Publication" value={STATUS_LABEL[publishStatus] || publishStatus} />
      <Metric label="Client Visibility" value={(clientVisibility || 'not_shared').replace(/_/g, ' ')} />
    </div>
  );
}