/**
 * GuidedJourney — Phase 13.3E.4A
 *
 * A compact guided-journey component near the page header. Answers:
 *   - Where am I? (current stage)
 *   - What has been completed?
 *   - What is blocking progress?
 *   - What should I do next?
 *   - Who owns the next action?
 *
 * Shows ONE recommended next action — never several equal-priority calls.
 */
import React from 'react';
import { MapPin, CheckCircle2, AlertTriangle, ArrowRight, User } from 'lucide-react';

const STAGE_LABELS = {
  discover: 'Discover',
  validate: 'Validate',
  build_value: 'Build Value',
  valuation: 'Valuation',
  growth_plan: 'Growth Plan',
  deliverables: 'Deliverables',
};

export default function GuidedJourney({ stages, activeKey, responsible }) {
  const activeStage = stages.find((s) => s.key === activeKey);
  const completedCount = stages.filter((s) => s.status === 'ready' || s.status === 'complete').length;
  const blockedCount = stages.filter((s) => s.status === 'blocked').length;

  // Find the single highest-priority next action across all stages
  const nextActionStage = stages.find((s) => s.status === 'blocked')
    || stages.find((s) => s.status === 'in_progress')
    || stages.find((s) => s.status === 'not_started')
    || activeStage;

  const nextAction = nextActionStage?.nextAction || 'Review the workspace';
  const nextStageLabel = STAGE_LABELS[nextActionStage?.key] || nextActionStage?.label || '';

  return (
    <div
      className="rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center gap-3"
      style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Where am I */}
      <div className="flex items-center gap-2 shrink-0">
        <MapPin className="w-3.5 h-3.5 text-primary" />
        <div>
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Current Stage</p>
          <p className="text-sm font-semibold text-foreground">{STAGE_LABELS[activeKey] || activeKey}</p>
        </div>
      </div>

      <div className="hidden sm:block w-px h-8 bg-border" />

      {/* Progress summary */}
      <div className="flex items-center gap-4 shrink-0">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="w-3 h-3 text-accent" />
          <span className="text-xs text-muted-foreground">{completedCount} of {stages.length} complete</span>
        </div>
        {blockedCount > 0 && (
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3 text-destructive" />
            <span className="text-xs text-destructive">{blockedCount} blocked</span>
          </div>
        )}
      </div>

      <div className="hidden sm:block w-px h-8 bg-border" />

      {/* Next action */}
      <div className="flex-1 min-w-0">
        <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Next Action</p>
        <p className="text-xs text-foreground truncate">
          <span className="text-primary/80 font-medium">{nextStageLabel}:</span> {nextAction}
        </p>
      </div>

      {/* Who owns it */}
      <div className="flex items-center gap-2 shrink-0">
        <User className="w-3 h-3 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{responsible || 'Unassigned'}</span>
        <ArrowRight className="w-3 h-3 text-primary/60" />
      </div>
    </div>
  );
}