/**
 * LandingProgress — Phase 13.3F.2
 *
 * Compact progress strip showing the six-stage advisor journey:
 * Discover, Validate, Build Value, Valuation, Growth Plan, Deliverables.
 * Each stage shows completion percentage, status dot, and blocker badge.
 * The current stage is visually obvious. Clicking navigates to that workspace.
 */
import React from 'react';

const STATUS_DOT = {
  not_started: '#6B7280',
  in_progress: '#00D4FF',
  ready: '#22c55e',
  complete: '#22c55e',
  blocked: '#EF4444',
};

const STATUS_LABEL = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  ready: 'Ready',
  complete: 'Complete',
  blocked: 'Blocked',
};

export default function LandingProgress({ stages, onNavigate }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground mb-3">Valuation Progress</h3>
      <div className="flex items-center gap-1 overflow-x-auto pb-2 -mx-1 px-1">
        {stages.map((stage, idx) => {
          const dotColor = STATUS_DOT[stage.status] || '#6B7280';
          const isReady = stage.status === 'ready' || stage.status === 'complete';
          return (
            <button
              key={stage.key}
              onClick={() => onNavigate?.(stage.key)}
              title={`${stage.label}: ${STATUS_LABEL[stage.status]} · ${stage.nextAction}`}
              className="flex flex-col items-start gap-1 px-3 py-2.5 rounded-lg shrink-0 transition-all hover:bg-white/[0.03] min-w-[110px]"
              style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}
            >
              <div className="flex items-center gap-1.5 w-full">
                <span className="text-[9px] text-muted-foreground/40 tabular-nums">{idx + 1}</span>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dotColor }} />
                <span className="text-xs font-medium text-foreground truncate">{stage.label}</span>
                {stage.blockers > 0 && (
                  <span className="text-[9px] font-bold px-1 rounded tabular-nums ml-auto" style={{ color: '#EF4444', background: 'rgba(239,68,68,0.1)' }}>
                    {stage.blockers}
                  </span>
                )}
              </div>
              <div className="w-full">
                <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${stage.percent}%`, background: dotColor }} />
                </div>
              </div>
              <span className="text-[9px] text-muted-foreground/60">{stage.percent}% · {STATUS_LABEL[stage.status]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}