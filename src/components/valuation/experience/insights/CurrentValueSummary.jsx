/**
 * CurrentValueSummary — Phase 13.3E.5
 *
 * Displays the current value hierarchy at the top of the Insights area.
 * Clearly distinguishes Current Value, Defensible Value, Potential Value,
 * and Equity Value — never combining them into one headline number.
 */
import React from 'react';
import { fmtCurrency, fmtRange } from '@/lib/valuation/valuationState';

function ValueTile({ label, value, sublabel, color, isPrimary }) {
  return (
    <div
      className="rounded-xl p-3.5"
      style={{
        background: isPrimary ? `${color}08` : 'rgba(255,255,255,0.015)',
        border: `1px solid ${isPrimary ? `${color}25` : 'rgba(255,255,255,0.05)'}`,
      }}
    >
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <p className="text-lg font-display font-bold mt-1" style={{ color: isPrimary ? color : 'hsl(var(--foreground))' }}>
        {value}
      </p>
      {sublabel && <p className="text-[10px] text-muted-foreground mt-0.5">{sublabel}</p>}
    </div>
  );
}

export default function CurrentValueSummary({ currentValue }) {
  if (!currentValue) return null;

  const {
    hasApprovedValuation,
    enterprise_value,
    equity_value,
    defensible_value,
    potential_value,
    ev_gap,
    overall_confidence,
    confidence_max,
    valuation_date,
    current_version,
    working_status,
    publication_ready,
  } = currentValue;

  if (!hasApprovedValuation) {
    return (
      <div className="rounded-xl p-5 text-center" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <p className="text-sm text-muted-foreground">Complete the Valuation stage to unlock approved value insights.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Primary value hierarchy */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <ValueTile
          label="Enterprise Value"
          value={enterprise_value.mid != null ? fmtCurrency(enterprise_value.mid) : '—'}
          sublabel={enterprise_value.range !== '—' ? `Range: ${enterprise_value.range}` : null}
          color="#D4A853"
          isPrimary
        />
        <ValueTile
          label="Equity Value"
          value={equity_value.mid != null ? fmtCurrency(equity_value.mid) : '—'}
          sublabel={equity_value.range !== '—' ? `Range: ${equity_value.range}` : null}
          color="#00D4FF"
          isPrimary
        />
        <ValueTile
          label="Defensible Value"
          value={defensible_value != null ? fmtCurrency(defensible_value) : 'Not yet determined'}
          sublabel="Conservative, defensible"
          color="#22c55e"
        />
        <ValueTile
          label="Potential Value"
          value={potential_value != null ? fmtCurrency(potential_value) : 'Not yet determined'}
          sublabel="Future modeled value — not current value"
          color="#A855F7"
        />
      </div>

      {/* Secondary metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="rounded-lg p-3 bg-background/40 border border-border">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">EV Gap</p>
          <p className="text-sm font-semibold text-foreground mt-0.5">
            {ev_gap != null ? fmtCurrency(ev_gap) : '—'}
          </p>
        </div>
        <div className="rounded-lg p-3 bg-background/40 border border-border">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Overall Confidence</p>
          <p className="text-sm font-semibold text-foreground mt-0.5">
            {overall_confidence != null ? `${overall_confidence}/${confidence_max}` : '—'}
          </p>
        </div>
        <div className="rounded-lg p-3 bg-background/40 border border-border">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Valuation Date</p>
          <p className="text-sm font-semibold text-foreground mt-0.5">
            {valuation_date ? new Date(valuation_date).toLocaleDateString() : '—'}
          </p>
        </div>
        <div className="rounded-lg p-3 bg-background/40 border border-border">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Current Version</p>
          <p className="text-sm font-semibold text-foreground mt-0.5">
            {current_version || 'Not published'}
          </p>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="capitalize">Working status: {working_status}</span>
        <span>·</span>
        <span>Publication: {publication_ready ? 'Ready' : 'Not ready'}</span>
      </div>
    </div>
  );
}