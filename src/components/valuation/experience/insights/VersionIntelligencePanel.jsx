/**
 * VersionIntelligencePanel — Phase 13.3E.5
 *
 * Integrates the certified Version Intelligence into the advisor experience.
 * Shows what changed since the previous valuation: EV delta, Equity delta,
 * EBITDA delta, Multiple delta, Confidence delta, Defensible/Potential delta,
 * Value Attribution, Enterprise Value Waterfall, and the Advisor and
 * Client-safe Valuation Stories.
 *
 * Does not alter immutable version records. Provides compare, open attribution,
 * open waterfall, view stories, and preview client story.
 */
import React, { useState } from 'react';
import { ChevronDown, ChevronUp, GitCompare, TrendingUp, TrendingDown, BookOpen, FileText, BarChart3, Eye } from 'lucide-react';
import { fmtCurrency } from '@/lib/valuation/valuationState';

function DeltaRow({ label, value, suffix }) {
  if (value == null) return null;
  const isPositive = value > 0;
  const isNegative = value < 0;
  const color = isPositive ? '#22c55e' : isNegative ? '#EF4444' : '#6B7280';
  const Icon = isPositive ? TrendingUp : isNegative ? TrendingDown : null;
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium flex items-center gap-1" style={{ color }}>
        {Icon && <Icon className="w-3 h-3" />}
        {fmtCurrency(value)}
        {suffix && <span className="text-[10px] text-muted-foreground ml-1">{suffix}</span>}
      </span>
    </div>
  );
}

export default function VersionIntelligencePanel({ versionIntelligence, onOpenAdvanced }) {
  const [expanded, setExpanded] = useState(false);
  const [activeStory, setActiveStory] = useState(null);

  if (!versionIntelligence?.has_multiple_versions) {
    return (
      <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <p className="text-xs text-muted-foreground">
          Version Intelligence appears after a second published version. Publish the current valuation to enable version comparison.
        </p>
      </div>
    );
  }

  const delta = versionIntelligence.latest_delta;

  return (
    <div className="space-y-2.5">
      {/* Latest delta summary */}
      <div
        className="rounded-xl p-4"
        style={{ background: 'rgba(212,168,83,0.04)', border: '1px solid rgba(212,168,83,0.15)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">
              What Changed: v{delta.version_from} → v{delta.version_to}
            </p>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-primary hover:underline flex items-center gap-1"
          >
            {expanded ? 'Hide detail' : 'Show detail'}
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {/* Delta grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
          <DeltaRow label="Enterprise Value Δ" value={delta.ev_delta} />
          <DeltaRow label="Equity Value Δ" value={delta.equity_delta} />
          <DeltaRow label="EBITDA Δ" value={delta.ebitda_delta} />
          <DeltaRow label="Multiple Δ" value={delta.multiple_delta} suffix="x" />
          <DeltaRow label="Confidence Δ" value={delta.confidence_delta} suffix="pts" />
          <DeltaRow label="Defensible Value Δ" value={delta.defensible_delta} />
          <DeltaRow label="Potential Value Δ" value={delta.potential_delta} />
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="space-y-2.5">
          {/* Value Attribution */}
          {delta.value_attribution && (
            <div className="rounded-xl p-3.5" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="w-3.5 h-3.5 text-accent" />
                <p className="text-xs font-semibold text-foreground">Value Attribution</p>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {typeof delta.value_attribution === 'string'
                  ? delta.value_attribution
                  : 'Value attribution breakdown available in the Advanced workspace.'}
              </p>
            </div>
          )}

          {/* EV Waterfall */}
          {delta.waterfall && (
            <div className="rounded-xl p-3.5" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="w-3.5 h-3.5 text-primary" />
                <p className="text-xs font-semibold text-foreground">Enterprise Value Waterfall</p>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {typeof delta.waterfall === 'string'
                  ? delta.waterfall
                  : 'Waterfall breakdown available in the Advanced workspace.'}
              </p>
            </div>
          )}

          {/* Valuation Stories */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {delta.advisor_story && (
              <button
                onClick={() => setActiveStory(activeStory === 'advisor' ? null : 'advisor')}
                className="rounded-xl p-3.5 text-left"
                style={{ background: 'rgba(212,168,83,0.04)', border: '1px solid rgba(212,168,83,0.15)' }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <BookOpen className="w-3.5 h-3.5 text-primary" />
                  <p className="text-xs font-semibold text-foreground">Advisor Valuation Story</p>
                </div>
                <p className="text-[10px] text-muted-foreground line-clamp-2">
                  {typeof delta.advisor_story === 'string' ? delta.advisor_story : 'Advisor narrative for this version delta.'}
                </p>
              </button>
            )}
            {delta.client_story && (
              <button
                onClick={() => setActiveStory(activeStory === 'client' ? null : 'client')}
                className="rounded-xl p-3.5 text-left"
                style={{ background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.15)' }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Eye className="w-3.5 h-3.5 text-accent" />
                  <p className="text-xs font-semibold text-foreground">Client-Safe Valuation Story</p>
                </div>
                <p className="text-[10px] text-muted-foreground line-clamp-2">
                  {typeof delta.client_story === 'string' ? delta.client_story : 'Client-safe narrative for this version delta.'}
                </p>
              </button>
            )}
          </div>

          {/* Full story display */}
          {activeStory && (
            <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="text-xs text-foreground leading-relaxed">
                {activeStory === 'advisor' ? delta.advisor_story : delta.client_story}
              </p>
            </div>
          )}

          {/* All versions */}
          {versionIntelligence.deltas.length > 1 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">All Version Comparisons</p>
              <div className="space-y-1.5">
                {versionIntelligence.deltas.map((d, i) => (
                  <div key={i} className="flex items-center gap-3 text-[11px] p-2 rounded-lg bg-background/40 border border-border">
                    <span className="font-medium text-foreground">v{d.version_from} → v{d.version_to}</span>
                    <span className="text-muted-foreground">EV: {d.ev_delta != null ? fmtCurrency(d.ev_delta) : '—'}</span>
                    <span className="text-muted-foreground">Equity: {d.equity_delta != null ? fmtCurrency(d.equity_delta) : '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Advanced link */}
          <button
            onClick={() => onOpenAdvanced?.()}
            className="flex items-center gap-1 text-[10px] text-primary hover:underline"
          >
            <FileText className="w-3 h-3" />
            Open full Version Intelligence in Advanced
          </button>
        </div>
      )}
    </div>
  );
}