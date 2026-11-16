/**
 * ValuationJourneyNav — Phase 13.3E.4
 *
 * Compact vertical journey navigation for the Valuation workspace. Shows
 * the 10 steps with their status. Clicking a step scrolls to the section.
 * On mobile, converts to a compact current-step selector.
 */
import React from 'react';
import { CheckCircle2, Circle, AlertTriangle, Clock, RefreshCw, Lock } from 'lucide-react';

const STATUS_ICON = {
  complete: CheckCircle2,
  in_progress: Clock,
  needs_review: AlertTriangle,
  stale: RefreshCw,
  blocked: AlertTriangle,
  not_started: Circle,
  not_applicable: Lock,
};

const STATUS_COLOR = {
  complete: '#22c55e',
  in_progress: '#00D4FF',
  needs_review: '#F59E0B',
  stale: '#F59E0B',
  blocked: '#EF4444',
  not_started: '#6B7280',
  not_applicable: '#6B7280',
};

export default function ValuationJourneyNav({ steps, activeStep, onSelect }) {
  return (
    <>
      {/* Desktop / tablet — vertical rail */}
      <div className="hidden sm:block">
        <div className="rounded-xl p-3 space-y-0.5" style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)' }}>
          <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground px-2 pb-1.5">Valuation Journey</p>
          {steps.map((step, idx) => {
            const Icon = STATUS_ICON[step.status] || Circle;
            const color = STATUS_COLOR[step.status] || '#6B7280';
            const active = activeStep === step.section;
            return (
              <button
                key={step.key}
                onClick={() => onSelect(step.section)}
                className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left transition-all ${
                  active ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'
                }`}
              >
                <span className="text-[10px] text-muted-foreground/40 w-4 text-right shrink-0">{idx + 1}</span>
                <Icon className="w-3.5 h-3.5 shrink-0" style={{ color }} />
                <span className={`text-xs flex-1 truncate ${active ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                  {step.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Mobile — compact current-step selector */}
      <div className="sm:hidden">
        <select
          value={activeStep || ''}
          onChange={(e) => onSelect(e.target.value)}
          className="w-full rounded-lg bg-secondary text-foreground text-xs px-3 py-2 border border-border"
        >
          {steps.map((step, idx) => (
            <option key={step.key} value={step.section}>
              {idx + 1}. {step.label} ({step.status.replace(/_/g, ' ')})
            </option>
          ))}
        </select>
      </div>
    </>
  );
}