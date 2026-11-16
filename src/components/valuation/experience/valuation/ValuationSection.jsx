/**
 * ValuationSection — Phase 13.3E.4
 *
 * Reusable collapsible section for the Valuation command center. Shows a
 * collapsed summary with status and stale badges, and expands to reveal the
 * certified component content. No calculation logic — pure presentation.
 */
import React, { useState } from 'react';
import { ChevronDown, CheckCircle2, Circle, AlertTriangle, Clock, Lock, RefreshCw } from 'lucide-react';

const STATUS_META = {
  complete:      { label: 'Complete',    icon: CheckCircle2, color: '#22c55e', bg: 'rgba(34,197,94,0.06)',  border: 'rgba(34,197,94,0.2)' },
  in_progress:   { label: 'In Progress', icon: Clock,        color: '#00D4FF', bg: 'rgba(0,212,255,0.06)',  border: 'rgba(0,212,255,0.2)' },
  needs_review:  { label: 'Needs Review',icon: AlertTriangle,color: '#F59E0B', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.2)' },
  stale:         { label: 'Stale',       icon: RefreshCw,    color: '#F59E0B', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.2)' },
  blocked:       { label: 'Blocked',     icon: AlertTriangle,color: '#EF4444', bg: 'rgba(239,68,68,0.06)',  border: 'rgba(239,68,68,0.2)' },
  not_started:   { label: 'Not Started', icon: Circle,       color: '#6B7280', bg: 'rgba(107,114,128,0.04)', border: 'rgba(107,114,128,0.15)' },
  not_applicable:{ label: 'N/A',         icon: Lock,         color: '#6B7280', bg: 'rgba(107,114,128,0.04)', border: 'rgba(107,114,128,0.15)' },
};

export default function ValuationSection({
  id, title, subtitle, status = 'not_started', stale = false,
  summary: summaryContent, children, defaultExpanded = false,
  onOpenValidate, validateLabel, onOpenAdvanced, advancedLabel,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const meta = STATUS_META[status] || STATUS_META.not_started;
  const Icon = meta.icon;

  return (
    <div id={id} className="rounded-xl overflow-hidden scroll-mt-32" style={{ background: meta.bg, border: `1px solid ${meta.border}` }}>
      {/* Collapsed header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-4 flex items-center justify-between gap-3 hover:bg-white/[0.01] transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Icon className={`w-4 h-4 shrink-0 ${stale ? 'animate-pulse' : ''}`} style={{ color: meta.color }} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground truncate">{title}</p>
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0" style={{ color: meta.color, background: `${meta.color}15` }}>
                {meta.label}
              </span>
            </div>
            {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {/* Summary content — visible when collapsed */}
      {!expanded && summaryContent && (
        <div className="px-4 pb-3 -mt-1">
          {summaryContent}
        </div>
      )}

      {/* Expanded detail — certified component */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/[0.04] pt-3">
          {children}

          {/* Contextual links */}
          <div className="flex flex-wrap gap-2 pt-1">
            {onOpenValidate && (
              <button onClick={onOpenValidate} className="text-[11px] text-primary hover:underline">
                {validateLabel || 'Open in Validate →'}
              </button>
            )}
            {onOpenAdvanced && (
              <button onClick={onOpenAdvanced} className="text-[11px] text-muted-foreground hover:text-foreground">
                {advancedLabel || 'Open in Advanced →'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}