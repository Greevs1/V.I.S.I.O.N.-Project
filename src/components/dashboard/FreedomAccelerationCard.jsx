/**
 * FreedomAccelerationCard — Dashboard Intelligence Card (Phase 7)
 *
 * Optionally enhances existing dashboard cards with:
 * - Top freedom accelerator
 * - Projected freedom acceleration
 * - Best opportunity stack
 *
 * ADDITIVE ONLY — renders nothing if no projections exist.
 * Does not modify any existing dashboard logic.
 */
import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Zap, Calendar, TrendingUp, ChevronDown, ChevronRight } from 'lucide-react';

const fmt = (n) => {
  if (!n && n !== 0) return '—';
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1000)}K`;
  return `$${Math.round(n)}`;
};

export default function FreedomAccelerationCard() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    base44.functions.invoke('calculateFreedomAcceleration', { action: 'getSummary', data: {} })
      .then(res => setSummary(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Render nothing if no projections exist or still loading
  if (loading) return null;
  if (!summary?.top_accelerator && !summary?.best_scenario) return null;

  const top = summary.top_accelerator;
  const scenario = summary.best_scenario;
  const currentDate = summary.baseline?.current_freedom_date;

  return (
    <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg, rgba(0,212,255,0.06) 0%, rgba(212,168,83,0.06) 100%)', border: '1px solid rgba(0,212,255,0.2)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,212,255,0.15)' }}>
            <Zap className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div>
            <p className="text-[10px] font-semibold tracking-[0.15em] uppercase text-cyan-400">Freedom Acceleration Engine™</p>
            {currentDate && <p className="text-[10px] text-muted-foreground">Current freedom date: <strong className="text-foreground">{currentDate}</strong></p>}
          </div>
        </div>
        <button onClick={() => setExpanded(!expanded)} className="text-muted-foreground hover:text-foreground">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </div>

      {/* Top Accelerator */}
      {top && (
        <div className="rounded-xl p-4 mb-3" style={{ background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.15)' }}>
          <p className="text-[9px] uppercase tracking-widest text-cyan-400 mb-1">Highest-Impact Accelerator</p>
          <p className="text-sm font-semibold text-foreground mb-2">{top.source_name}</p>
          <div className="flex items-center gap-4">
            <div>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Projected Date</p>
              <p className="text-base font-display font-bold text-cyan-400">{top.projected_freedom_date}</p>
            </div>
            <div>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Acceleration</p>
              <p className="text-base font-display font-bold text-primary">+{top.freedom_acceleration_months} months</p>
            </div>
            {top.confidence_score && (
              <div>
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Confidence</p>
                <p className="text-sm font-semibold text-muted-foreground">{top.confidence_score}%</p>
              </div>
            )}
          </div>
          {top.why_this_moves_freedom && (
            <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed italic">"{top.why_this_moves_freedom.slice(0, 180)}…"</p>
          )}
        </div>
      )}

      {/* Best Scenario */}
      {scenario && (
        <div className="rounded-xl p-4" style={{ background: 'rgba(212,168,83,0.05)', border: '1px solid rgba(212,168,83,0.2)' }}>
          <p className="text-[9px] uppercase tracking-widest text-primary mb-1">Best Opportunity Stack</p>
          <p className="text-sm font-semibold text-foreground mb-2">{scenario.source_name}</p>
          <div className="flex items-center gap-4">
            <div>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Projected Date</p>
              <p className="text-base font-display font-bold text-primary">{scenario.projected_freedom_date}</p>
            </div>
            <div>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Combined Acceleration</p>
              <p className="text-base font-display font-bold text-emerald-400">+{scenario.freedom_acceleration_months} months</p>
            </div>
          </div>
        </div>
      )}

      {/* All singles expanded */}
      {expanded && summary.all_singles?.length > 1 && (
        <div className="mt-4 space-y-2">
          <p className="text-[9px] uppercase tracking-widest text-muted-foreground">All Projections</p>
          {summary.all_singles.map((p, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
              <p className="text-xs text-foreground truncate max-w-[60%]">{p.source_name}</p>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs font-semibold text-primary">+{p.freedom_acceleration_months} mo</span>
                <span className="text-xs text-muted-foreground">{p.projected_freedom_date}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}