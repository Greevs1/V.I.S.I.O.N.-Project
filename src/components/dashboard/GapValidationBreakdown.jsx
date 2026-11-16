/**
 * GapValidationBreakdown — Universal, always visible, BIS-driven.
 * Shows all 6 gap categories for EVERYONE (guest, member, advisor, admin).
 * Never hides a card — shows "Waiting for data" when not available.
 */
import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, CheckCircle, Clock, Info } from 'lucide-react';

const fmt = (n) => {
  if (!n || n === 0) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
};

const GAP_CONFIG = [
  { key: 'profit',   label: 'Profit Gap',    color: '#A855F7', path: '/assessments/profit-gap' },
  { key: 'value',    label: 'Value Gap',     color: '#00D9FF', path: '/assessments/value-gap' },
  { key: 'tax',      label: 'Tax Gap',       color: '#00D1B2', path: '/assessments/tax-gap' },
  { key: 'operations', label: 'Operations',  color: '#FF4D57', path: '/assessments/operations-gap' },
  { key: 'recast',   label: 'Recast EBITDA', color: '#D4A72C', path: '/assessments/recast-ebitda' },
  { key: 'freedom',  label: 'Freedom',       color: '#D4A853', path: '/assessments/freedom' },
];

function buildGapRows(bis) {
  const r = bis?._raw || {};
  const as = bis?._sources?.assessmentSummary || {};
  const m = bis?._sources?.dashboardMetrics || {};

  return [
    {
      key: 'profit',
      value: r.profit_gap_amount,
      display: fmt(r.profit_gap_amount),
      source: as?.profit_gap_amount != null ? 'Assessment' : m?.profit_gap ? 'Dashboard Metrics' : null,
      confidence: as?.profit_gap_severity || m?.profit_gap?.severity || null,
      status: r.profit_gap_amount > 0 ? 'identified' : 'waiting',
    },
    {
      key: 'value',
      value: r.value_gap_amount,
      display: fmt(r.value_gap_amount),
      source: as?.value_gap_amount != null ? 'Assessment' : m?.value_gap ? 'Dashboard Metrics' : null,
      confidence: as?.value_gap_severity || m?.value_gap?.severity || null,
      status: r.value_gap_amount > 0 ? 'identified' : 'waiting',
    },
    {
      key: 'tax',
      value: r.tax_gap_annual,
      display: r.tax_gap_annual ? `${fmt(r.tax_gap_annual)}/yr` : null,
      source: as?.tax_gap_annual != null ? 'Assessment' : m?.tax_gap ? 'Dashboard Metrics' : null,
      confidence: as?.tax_gap_severity || m?.tax_gap?.severity || null,
      status: r.tax_gap_annual > 0 ? 'identified' : 'waiting',
    },
    {
      key: 'operations',
      value: r.operations_score,
      display: r.operations_score != null ? `${Math.round(r.operations_score)}/100` : null,
      source: as?.operations_score != null ? 'Assessment' : m?.operations_gap ? 'Dashboard Metrics' : null,
      confidence: as?.operations_gap_severity || m?.operations_gap?.severity || null,
      status: r.operations_score != null ? 'identified' : 'waiting',
    },
    {
      key: 'recast',
      value: r.recast_add_backs,
      display: fmt(r.recast_add_backs),
      source: r.recast_add_backs != null ? 'Assessment' : null,
      confidence: null,
      status: r.recast_add_backs > 0 ? 'identified' : 'waiting',
    },
    {
      key: 'freedom',
      value: r.freedom_score,
      display: r.freedom_score != null ? `${Math.round(r.freedom_score)}/100` : null,
      source: r.freedom_score != null ? 'Assessment' : null,
      confidence: null,
      status: r.freedom_score != null ? 'identified' : 'waiting',
    },
  ];
}

export default function GapValidationBreakdown({ bis }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const rows = buildGapRows(bis);
  const identifiedCount = rows.filter(r => r.status === 'identified').length;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handle = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const handle = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [open]);

  return (
    <div className="mt-3" ref={containerRef}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-xs font-medium text-primary/80 hover:text-primary transition-colors mx-auto"
      >
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        {open ? 'Hide Breakdown' : `View Breakdown (${identifiedCount}/6 identified)`}
      </button>

      {open && (
        <div className="mt-4 rounded-xl border border-border/60 overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.02)' }}>

          <div className="px-5 py-3 border-b border-border/40">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Gap Intelligence Breakdown
            </p>
            <p className="text-[11px] text-muted-foreground/60 mt-0.5">
              {identifiedCount} of 6 gaps identified · powered by BusinessIntelligenceState
            </p>
          </div>

          <div className="divide-y divide-border/30">
            {rows.map(row => {
              const cfg = GAP_CONFIG.find(c => c.key === row.key);
              const isIdentified = row.status === 'identified';
              return (
                <div key={row.key} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: isIdentified ? cfg.color : '#374151' }} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium" style={{ color: isIdentified ? '#F5F5F5' : '#6B7280' }}>
                        {cfg.label}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {row.source && (
                          <span className="text-[10px] text-muted-foreground/60">Source: {row.source}</span>
                        )}
                        {row.confidence && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded"
                            style={{ background: 'rgba(212,168,83,0.1)', color: '#D4A853' }}>
                            {String(row.confidence).toUpperCase()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {isIdentified ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold" style={{ color: cfg.color }}>
                          {row.display}
                        </span>
                        <CheckCircle className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground/50">Waiting for data</span>
                        <Clock className="w-3.5 h-3.5 text-muted-foreground/30" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="px-5 py-3 border-t border-border/40 flex items-start gap-2">
            <Info className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0 mt-0.5" />
            <p className="text-[10px] text-muted-foreground/50 leading-relaxed">
              All values sourced from BusinessIntelligenceState. Complete assessments to populate missing gaps.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}