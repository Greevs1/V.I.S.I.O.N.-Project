/**
 * ValueChangeSummary — Phase 13.3F.2
 *
 * Shows the change in value since the last published version.
 * Displays EV, Equity, EBITDA, Multiple, and Confidence deltas.
 * Provides a "View What Changed" action to open the Version Intelligence.
 * Calm empty state when no prior version exists.
 */
import React from 'react';
import { ArrowRight, GitCompare } from 'lucide-react';
import { fmtDelta, fmtPctDelta } from '@/lib/valuation/landingPageEngine';

function DeltaRow({ label, delta, previous, current }) {
  if (delta == null) return null;
  const pct = fmtPctDelta(current, previous);
  const isPositive = delta >= 0;
  const color = isPositive ? '#22c55e' : '#EF4444';
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold" style={{ color }}>{fmtDelta(delta)}</span>
        {pct != null && (
          <span className="text-[10px]" style={{ color }}>{pct}</span>
        )}
      </div>
    </div>
  );
}

export default function ValueChangeSummary({ versionChange, onNavigate }) {
  if (!versionChange?.hasMultipleVersions) {
    return (
      <div
        className="rounded-xl p-5 text-center"
        style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)' }}
      >
        <GitCompare className="w-5 h-5 text-muted-foreground/30 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground/70">A version comparison will appear after the next published valuation.</p>
      </div>
    );
  }

  const d = versionChange.delta;
  return (
    <div
      className="rounded-xl p-5"
      style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Value Change Since Last Version</h3>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            {d.versionFrom ? `v${d.versionFrom}` : 'Previous'} → {d.versionTo ? `v${d.versionTo}` : 'Current'}
          </p>
        </div>
        <button
          onClick={() => onNavigate?.('deliverables')}
          className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          View What Changed
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>
      <div>
        <DeltaRow label="Enterprise Value" delta={d.evDelta} />
        <DeltaRow label="Equity Value" delta={d.equityDelta} />
        <DeltaRow label="EBITDA" delta={d.ebitdaDelta} />
        <DeltaRow label="Multiple" delta={d.multipleDelta != null ? d.multipleDelta : null} />
        <DeltaRow label="Confidence" delta={d.confidenceDelta != null ? d.confidenceDelta : null} />
      </div>
      {d.primaryReason && (
        <div className="mt-3 pt-3 border-t border-white/[0.04]">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Primary Verified Reason</p>
          <p className="text-xs text-foreground/90 leading-relaxed">{d.primaryReason}</p>
        </div>
      )}
    </div>
  );
}