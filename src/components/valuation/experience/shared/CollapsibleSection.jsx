/**
 * CollapsibleSection — Phase 13.3F.1
 *
 * The standard Apple-style collapsed section header used across all valuation
 * workspaces. Shows: icon, title, one-sentence description, primary result,
 * status dot, confidence, blocker count, stale state, last updated, one
 * recommended action, and expand control.
 *
 * Density modes:
 *   summary  — title, primary metric, status dot, expand
 *   standard — + subtitle, confidence, blockers, stale, actions
 *   expert   — + last updated, pin control
 *
 * Controlled open/closed state from parent accordion. Max one primary +
 * one secondary action in collapsed state. Smooth transitions, aria-expanded,
 * keyboard accessible, reduced-motion respected.
 */
import React from 'react';
import { ChevronDown, Pin, PinOff, AlertTriangle } from 'lucide-react';

const STATUS_DOT = {
  complete: '#22c55e',
  ready: '#22c55e',
  in_progress: '#00D4FF',
  needs_review: '#F59E0B',
  stale: '#F59E0B',
  blocked: '#EF4444',
  not_started: '#6B7280',
  not_applicable: '#6B7280',
};

export default function CollapsibleSection({
  id, icon: Icon, title, subtitle,
  status = 'not_started', stale = false,
  confidence, blockerCount = 0, lastUpdated,
  primaryMetric, // { label, value }
  summary, // additional ReactNode for collapsed view (standard/expert only)
  primaryAction, secondaryAction,
  isOpen, onToggle, onPin, pinned = false,
  density = 'summary',
  children, highlight = false,
}) {
  const dotColor = STATUS_DOT[status] || STATUS_DOT.not_started;
  const showMeta = density !== 'summary';
  const showActions = density !== 'summary' && (!isOpen || pinned);
  const showPin = density === 'expert' && onPin;
  const showLastUpdated = density === 'expert' && lastUpdated;

  return (
    <div
      id={id}
      className={`rounded-xl scroll-mt-4 transition-all motion-safe:duration-200 ${
        highlight ? 'ring-1 ring-primary/30' : ''
      } ${isOpen ? 'bg-white/[0.02]' : 'bg-white/[0.008] hover:bg-white/[0.012]'}`}
      style={{ border: '1px solid rgba(255,255,255,0.05)' }}
    >
      {/* Header — toggle */}
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={`${id}-content`}
        className="w-full text-left p-4 flex items-start gap-3 transition-colors"
      >
        {Icon && (
          <Icon className="w-4 h-4 mt-1 shrink-0 text-muted-foreground" />
        )}
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dotColor }} />
            {stale && (
              <AlertTriangle className="w-3 h-3 text-amber-400/70 shrink-0" />
            )}
          </div>

          {showMeta && subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          )}

          {/* Primary metric — large value typography */}
          {primaryMetric && primaryMetric.value != null && (
            <p className="text-xl font-display font-bold text-foreground mt-2 leading-tight">
              {primaryMetric.value}
            </p>
          )}
          {primaryMetric && primaryMetric.label && showMeta && (
            <p className="text-[11px] text-muted-foreground mt-0.5">{primaryMetric.label}</p>
          )}

          {/* Meta row — muted secondary metadata */}
          {showMeta && (
            <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-muted-foreground flex-wrap">
              {confidence != null && (
                <span style={{ color: confidence >= 70 ? '#22c55e' : confidence >= 50 ? '#F59E0B' : '#EF4444' }}>
                  {confidence}% confidence
                </span>
              )}
              {blockerCount > 0 && (
                <>
                  {confidence != null && <span className="text-muted-foreground/30">·</span>}
                  <span className="text-destructive/90">{blockerCount} blocker{blockerCount !== 1 ? 's' : ''}</span>
                </>
              )}
              {showLastUpdated && (
                <>
                  <span className="text-muted-foreground/30">·</span>
                  <span>Updated {lastUpdated}</span>
                </>
              )}
            </div>
          )}

          {/* Additional summary content in collapsed state */}
          {summary && !isOpen && showMeta && (
            <div className="mt-2">{summary}</div>
          )}
        </div>

        {/* Expand control */}
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground shrink-0 mt-1 transition-transform motion-safe:duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Collapsed actions — max 1 primary + 1 secondary */}
      {showActions && !isOpen && (primaryAction || secondaryAction || showPin) && (
        <div className="px-4 pb-3 flex items-center gap-3">
          {primaryAction && (
            <button
              onClick={(e) => { e.stopPropagation(); primaryAction.onClick(); }}
              className="text-xs font-medium text-primary hover:underline"
            >
              {primaryAction.label}
            </button>
          )}
          {secondaryAction && (
            <button
              onClick={(e) => { e.stopPropagation(); secondaryAction.onClick(); }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {secondaryAction.label}
            </button>
          )}
          {showPin && (
            <button
              onClick={(e) => { e.stopPropagation(); onPin(); }}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              title={pinned ? 'Unpin section' : 'Pin section open'}
            >
              {pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
              {pinned ? 'Unpin' : 'Pin'}
            </button>
          )}
        </div>
      )}

      {/* Expanded content */}
      {isOpen && (
        <div
          id={`${id}-content`}
          className="border-t border-white/[0.04] px-4 pb-4 pt-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1"
        >
          {children}
        </div>
      )}
    </div>
  );
}