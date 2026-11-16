/**
 * ValuationProgress — Phase 13.3F.1
 *
 * Compact horizontal journey rail. Replaces the previous 6-card progress
 * grid AND the workspace tab bar with a single compact selector.
 *
 * Shows: step number, short label, status dot, blocker badge.
 * Descriptions appear on hover (title attribute).
 * On mobile, scrolls horizontally with no overflow.
 */
import React from 'react';
import { Layers } from 'lucide-react';

const STATUS_DOT = {
  not_started: '#6B7280',
  in_progress: '#00D4FF',
  gathering_data: '#00D4FF',
  needs_verification: '#F59E0B',
  advisor_review: '#A855F7',
  ready: '#22c55e',
  complete: '#22c55e',
  blocked: '#EF4444',
};

export default function ValuationProgress({ stages, activeKey, onSelect }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1 -mx-1 px-1">
      {stages.map((stage, idx) => {
        const active = activeKey === stage.key;
        const dotColor = STATUS_DOT[stage.status] || '#6B7280';
        return (
          <button
            key={stage.key}
            onClick={() => onSelect(stage.key)}
            title={stage.nextAction}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg shrink-0 transition-all ${
              active ? 'bg-white/[0.05] text-foreground ring-1 ring-border' : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.02]'
            }`}
          >
            <span className="text-[10px] text-muted-foreground/40 tabular-nums">{idx + 1}</span>
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dotColor }} />
            <span className="text-xs font-medium whitespace-nowrap">{stage.label}</span>
            {stage.blockers > 0 && (
              <span
                className="text-[9px] font-bold px-1 rounded tabular-nums"
                style={{ color: '#EF4444', background: 'rgba(239,68,68,0.1)' }}
              >
                {stage.blockers}
              </span>
            )}
          </button>
        );
      })}
      {/* Advanced separator */}
      <div className="w-px h-4 bg-border mx-1 shrink-0" />
      <button
        onClick={() => onSelect('advanced')}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg shrink-0 transition-all ${
          activeKey === 'advanced'
            ? 'bg-white/[0.05] text-foreground ring-1 ring-border'
            : 'text-muted-foreground/80 hover:text-foreground hover:bg-white/[0.02]'
        }`}
      >
        <Layers className="w-3 h-3" />
        <span className="text-xs font-medium whitespace-nowrap">Advanced</span>
      </button>
    </div>
  );
}