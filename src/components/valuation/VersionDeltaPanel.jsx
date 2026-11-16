/**
 * VersionDeltaPanel — Phase 13.3D
 * Displays the delta summary, value attribution, and waterfall for a
 * published version compared to its predecessor.
 */
import React, { useState, useEffect } from 'react';
import { getVersionDelta } from '@/lib/valuationService';
import { TrendingUp, TrendingDown, Minus, GitCompare, Award, BarChart3 } from 'lucide-react';

export default function VersionDeltaPanel({ valuationId, currentVersionId }) {
  const [delta, setDelta] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!valuationId || !currentVersionId) return;
    setLoading(true);
    getVersionDelta(valuationId, currentVersionId)
      .then((res) => setDelta(res?.delta || null))
      .catch(() => setDelta(null))
      .finally(() => setLoading(false));
  }, [valuationId, currentVersionId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
        <div className="w-3 h-3 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
        Loading version delta...
      </div>
    );
  }

  if (!delta) {
    return (
      <div className="rounded-lg p-4 text-center text-xs text-muted-foreground" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <GitCompare className="w-5 h-5 mx-auto mb-2 text-muted-foreground/40" />
        No version delta available. Deltas are generated automatically when a new version is published after an existing one.
      </div>
    );
  }

  const { delta_summary, value_attribution, waterfall, advisor_summary, client_summary } = delta;

  return (
    <div className="space-y-6">
      {/* Delta Summary */}
      <DeltaSummaryCard summary={delta_summary} />

      {/* Value Attribution */}
      <ValueAttributionCard attribution={value_attribution} />

      {/* Enterprise Value Waterfall */}
      <WaterfallCard waterfall={waterfall} />

      {/* Valuation Story (Advisor) */}
      <AdvisorStoryCard story={advisor_summary} />

      {/* Valuation Story (Client) */}
      <ClientStoryCard story={client_summary} />
    </div>
  );
}

// ── Delta Summary ────────────────────────────────────────────────────────────
function DeltaSummaryCard({ summary }) {
  if (!summary?.metrics?.length) return null;
  return (
    <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-2 mb-3">
        <GitCompare className="w-4 h-4 text-primary" />
        <h4 className="text-xs font-semibold uppercase tracking-wider">Version Delta Summary</h4>
        <span className="text-[10px] text-muted-foreground ml-auto">
          V{summary.version_numbers?.previous} → V{summary.version_numbers?.current}
        </span>
      </div>
      <div className="space-y-1">
        {summary.metrics.map((m, i) => (
          <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
            <span className="text-xs text-muted-foreground capitalize">{m.metric.replace(/_/g, ' ')}</span>
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="text-muted-foreground/60">{formatVal(m.previous_value)}</span>
              <span className="text-muted-foreground/40">→</span>
              <span className="text-foreground">{formatVal(m.current_value)}</span>
              <DeltaBadge abs={m.absolute_delta} pct={m.percentage_delta} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Value Attribution ─────────────────────────────────────────────────────────
function ValueAttributionCard({ attribution }) {
  if (!attribution?.items?.length) return null;
  return (
    <div className="rounded-xl p-4" style={{ background: 'rgba(212,168,83,0.03)', border: '1px solid rgba(212,168,83,0.12)' }}>
      <div className="flex items-center gap-2 mb-3">
        <Award className="w-4 h-4 text-primary" />
        <h4 className="text-xs font-semibold uppercase tracking-wider text-primary">Value Attribution™</h4>
      </div>
      {!attribution.can_attribute && (
        <p className="text-[10px] text-muted-foreground italic mb-2">Unable to attribute automatically.</p>
      )}
      <div className="space-y-2">
        {attribution.items.map((item, i) => (
          <div key={i} className="flex items-start justify-between gap-3 py-1.5">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">{item.category}</span>
                {!item.proven && <span className="text-[9px] text-yellow-600 uppercase">unproven</span>}
              </div>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">{item.explanation}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-mono font-semibold" style={{ color: item.estimated_ev_impact >= 0 ? '#22c55e' : '#ef4444' }}>
                {item.estimated_ev_impact >= 0 ? '+' : ''}{formatVal(item.estimated_ev_impact)}
              </p>
              <p className="text-[9px] text-muted-foreground">{Math.round(item.confidence)}% conf.</p>
            </div>
          </div>
        ))}
      </div>
      {attribution.unattributed !== 0 && Math.abs(attribution.unattributed) > 0.01 && (
        <div className="mt-2 pt-2 border-t border-border/30">
          <p className="text-[10px] text-muted-foreground">
            Unattributed residual: <span className="font-mono">{formatVal(attribution.unattributed)}</span>
          </p>
        </div>
      )}
    </div>
  );
}

// ── Waterfall ─────────────────────────────────────────────────────────────────
function WaterfallCard({ waterfall }) {
  if (!waterfall?.steps?.length) return null;
  return (
    <div className="rounded-xl p-4" style={{ background: 'rgba(0,212,255,0.03)', border: '1px solid rgba(0,212,255,0.12)' }}>
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="w-4 h-4 text-accent" />
        <h4 className="text-xs font-semibold uppercase tracking-wider text-accent">Enterprise Value Waterfall</h4>
      </div>
      <div className="space-y-1">
        {waterfall.steps.map((step, i) => {
          const isStart = i === 0;
          const isEnd = i === waterfall.steps.length - 1;
          const isPositive = step.amount >= 0;
          return (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground flex-1 truncate">{step.step}</span>
              <span className="text-xs font-mono" style={{ color: isStart || isEnd ? '#D4A853' : isPositive ? '#22c55e' : '#ef4444' }}>
                {isStart || isEnd ? '' : isPositive ? '+' : ''}{formatVal(step.amount)}
              </span>
              <span className="text-[10px] text-muted-foreground/50 font-mono w-20 text-right">{formatVal(step.cumulative)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Advisor Story ─────────────────────────────────────────────────────────────
function AdvisorStoryCard({ story }) {
  if (!story) return null;
  return (
    <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <h4 className="text-xs font-semibold uppercase tracking-wider mb-3 text-primary">Valuation Story™ — Advisor Version</h4>
      <div className="space-y-3 text-xs">
        {story.executive_summary && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Executive Summary</p>
            <p className="text-muted-foreground">
              EV: {formatVal(story.executive_summary.enterprise_value_change?.from)} → {formatVal(story.executive_summary.enterprise_value_change?.to)}
              {' '}({story.executive_summary.enterprise_value_change?.pct != null ? `${story.executive_summary.enterprise_value_change.pct}%` : 'N/A'})
            </p>
          </div>
        )}
        {story.primary_drivers?.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Primary Drivers</p>
            {story.primary_drivers.map((d, i) => (
              <p key={i} className="text-muted-foreground">• {d.category}: {d.impact >= 0 ? '+' : ''}{formatVal(d.impact)} ({d.confidence}% conf.)</p>
            ))}
          </div>
        )}
        {story.methodology_changes && (story.methodology_changes.methods_added?.length > 0 || story.methodology_changes.methods_removed?.length > 0) && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Methodology Changes</p>
            {story.methodology_changes.methods_added?.length > 0 && <p className="text-muted-foreground">Added: {story.methodology_changes.methods_added.join(', ')}</p>}
            {story.methodology_changes.methods_removed?.length > 0 && <p className="text-muted-foreground">Removed: {story.methodology_changes.methods_removed.join(', ')}</p>}
          </div>
        )}
        {story.buyer_readiness_commentary && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Buyer Readiness</p>
            <p className="text-muted-foreground">{story.buyer_readiness_commentary}</p>
          </div>
        )}
        {story.recommended_review_date && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Recommended Review Date</p>
            <p className="text-muted-foreground">{story.recommended_review_date}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Client Story ──────────────────────────────────────────────────────────────
function ClientStoryCard({ story }) {
  if (!story) return null;
  return (
    <div className="rounded-xl p-4" style={{ background: 'rgba(34,197,94,0.03)', border: '1px solid rgba(34,197,94,0.12)' }}>
      <h4 className="text-xs font-semibold uppercase tracking-wider mb-3 text-green-500">{story.title || 'What Changed'}</h4>
      <div className="space-y-2 text-xs">
        {story.verified_value_changes?.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Verified Value Changes</p>
            {story.verified_value_changes.map((vc, i) => (
              <p key={i} className="text-muted-foreground capitalize">
                • {vc.metric} {vc.direction} by {formatVal(Math.abs(vc.change))} {vc.percentage != null ? `(${vc.percentage}%)` : ''}
              </p>
            ))}
          </div>
        )}
        {story.verified_confidence_changes && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Confidence</p>
            <p className="text-muted-foreground capitalize">Confidence {story.verified_confidence_changes.direction} by {formatVal(Math.abs(story.verified_confidence_changes.change))}%</p>
          </div>
        )}
        {story.high_level_explanation && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">High-Level Explanation</p>
            <p className="text-muted-foreground">{story.high_level_explanation}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatVal(n) {
  if (n == null) return '—';
  if (Math.abs(n) >= 1000000) return '$' + (n / 1000000).toFixed(2) + 'M';
  if (Math.abs(n) >= 1000) return '$' + (n / 1000).toFixed(1) + 'K';
  return '$' + Math.round(n).toLocaleString();
}

function DeltaBadge({ abs, pct }) {
  if (abs == null) return <span className="text-muted-foreground/40">—</span>;
  const isUp = abs > 0;
  const isFlat = abs === 0;
  const Icon = isFlat ? Minus : isUp ? TrendingUp : TrendingDown;
  const color = isFlat ? '#888' : isUp ? '#22c55e' : '#ef4444';
  return (
    <span className="flex items-center gap-0.5 text-[10px]" style={{ color }}>
      <Icon className="w-3 h-3" />
      {pct != null ? `${pct}%` : ''}
    </span>
  );
}