import React from 'react';
import { TrendingUp } from 'lucide-react';

/**
 * Before Strategy vs After Strategy comparison panel.
 * Powered by business_metric_snapshots (all metric types via getMetricSnapshotsAll).
 * Shows first snapshot vs latest snapshot for each metric type.
 * Renders nothing if fewer than 2 snapshots exist — purely additive.
 */

const METRIC_LABELS = {
  iq_score:           { label: 'IQ™ Score',          fmt: (v) => Math.round(v), suffix: '/100' },
  profit_margin:      { label: 'Profit Margin',       fmt: (v) => v.toFixed(1), suffix: '%' },
  operations_score:   { label: 'Operations Score',    fmt: (v) => Math.round(v), suffix: '/100' },
  freedom_score:      { label: 'Freedom Score',       fmt: (v) => Math.round(v), suffix: '/100' },
  enterprise_value:   { label: 'Enterprise Value',    fmt: (v) => v >= 1_000_000 ? `$${(v/1_000_000).toFixed(1)}M` : `$${Math.round(v/1000)}K`, suffix: '' },
  annual_revenue:     { label: 'Annual Revenue',      fmt: (v) => v >= 1_000_000 ? `$${(v/1_000_000).toFixed(1)}M` : `$${Math.round(v/1000)}K`, suffix: '' },
  ebitda:             { label: 'EBITDA',              fmt: (v) => v >= 1_000_000 ? `$${(v/1_000_000).toFixed(1)}M` : `$${Math.round(v/1000)}K`, suffix: '' },
};

export default function BeforeAfterStrategy({ snapshots }) {
  if (!snapshots || snapshots.length < 2) return null;

  // Group by metric_type, find first and latest per type
  const byType = {};
  for (const s of snapshots) {
    if (!byType[s.metric_type]) byType[s.metric_type] = [];
    byType[s.metric_type].push(s);
  }

  // Only include types that have at least 2 data points and are in our label map
  const comparisons = Object.entries(byType)
    .filter(([type, rows]) => METRIC_LABELS[type] && rows.length >= 2)
    .map(([type, rows]) => {
      const sorted = [...rows].sort((a, b) => new Date(a.snapshot_date) - new Date(b.snapshot_date));
      const first = sorted[0];
      const latest = sorted[sorted.length - 1];
      const meta = METRIC_LABELS[type];
      const improved = latest.metric_value >= first.metric_value;
      return {
        type,
        label: meta.label,
        before: `${meta.fmt(first.metric_value)}${meta.suffix}`,
        after: `${meta.fmt(latest.metric_value)}${meta.suffix}`,
        improved,
        pctChange: first.metric_value !== 0
          ? Math.round(((latest.metric_value - first.metric_value) / Math.abs(first.metric_value)) * 100)
          : null,
      };
    });

  if (comparisons.length === 0) return null;

  return (
    <div className="glass rounded-xl p-6">
      <div className="flex items-center gap-2 mb-5">
        <TrendingUp className="w-4 h-4 text-primary" />
        <p className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">
          Before Strategy vs After Strategy
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {comparisons.map(({ type, label, before, after, improved, pctChange }) => (
          <div key={type} className="glass rounded-lg p-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">{label}</p>
            <div className="flex items-center justify-between">
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground mb-1">Before</p>
                <p className="text-lg font-display font-bold text-muted-foreground">{before}</p>
              </div>
              <div className="flex flex-col items-center gap-1">
                <TrendingUp className={`w-4 h-4 ${improved ? 'text-emerald-400' : 'text-red-400 rotate-180'}`} />
                {pctChange != null && (
                  <span className={`text-[10px] font-semibold ${improved ? 'text-emerald-400' : 'text-red-400'}`}>
                    {improved ? '+' : ''}{pctChange}%
                  </span>
                )}
              </div>
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground mb-1">After</p>
                <p className={`text-lg font-display font-bold ${improved ? 'text-primary' : 'text-foreground'}`}>{after}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}