/**
 * WhereYouStand — five compact KPI cards below the hero.
 *
 * Visually secondary to the HeroStoryCard. Each card:
 *   small icon → small label → large metric (count-up) → tiny trend
 *
 * Desktop: 5 in a row. Tablet: wraps. Mobile: horizontal swipe cards.
 *
 * Metrics: Business IQ, Current Value, Potential Value, Operations Health, Time Value Freed
 * Trends: computed from BIE journal entries since last briefing.
 */
import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Gem, TrendingUp, Activity, Clock } from 'lucide-react';
import { loadJournal } from '@/lib/bie';
import { useCountUp } from '@/hooks/useCountUp';

const fmt = (n) => {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}K`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
};

function getTrend(journal, metricId, changedIds) {
  if (!changedIds.includes(metricId)) return null;
  const entries = journal.filter(e => e.metricId === metricId || (e.affectedMetrics || []).includes(metricId));
  const latest = entries[entries.length - 1];
  if (!latest) return null;
  // ONLY legitimate deltas produce a trend.
  // value_increased / value_decreased require a real prior baseline (oldValue != null).
  // metric_appeared is a FIRST MEASUREMENT — there is no prior value to compare against,
  // so it must NOT produce a trend. Treating first-measurement as +fullValue was the
  // defect that showed "+74 pts since last review" / "+$2.2M since last review" on
  // first-ever dashboard load (missing baseline defaulted to zero).
  if (typeof latest.newValue === 'number' && typeof latest.oldValue === 'number' && latest.oldValue != null) {
    return latest.newValue - latest.oldValue;
  }
  // metric_appeared: no prior baseline → no trend (card shows "—").
  return null;
}

function KPICard({ icon: Icon, label, value, suffix, color, trend, delay }) {
  const animated = useCountUp(typeof value === 'number' ? value : null);
  const isScore = suffix === '/100';
  const display = typeof value === 'number'
    ? (isScore ? Math.round(animated) : fmt(animated))
    : '—';

  const trendText = useMemo(() => {
    if (trend == null) return null;
    if (trend === 0) return null; // no change = no trend to display
    if (isScore) {
      return trend > 0
        ? `+${Math.round(trend)} pts since last review`
        : `${Math.round(trend)} pts since last review`;
    }
    return trend > 0
      ? `+${fmt(trend)} since last review`
      : `-${fmt(Math.abs(trend))} since last review`;
  }, [trend, isScore]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      className="rounded-xl p-4 md:p-5 relative overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:border-white/10 shrink-0"
      style={{ background: '#121214', border: '1px solid rgba(255,255,255,0.05)' }}
    >
      <div className="absolute top-0 right-0 w-20 h-20 rounded-full pointer-events-none opacity-40"
        style={{ background: `radial-gradient(circle, ${color}10 0%, transparent 70%)` }} />
      <div className="relative flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: `${color}12` }}>
          <Icon className="w-3 h-3" style={{ color }} />
        </div>
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      </div>
      <p className="relative text-2xl md:text-3xl font-display font-bold leading-none mb-2" style={{ color }}>
        {display}
        {suffix && <span className="text-sm font-medium ml-0.5 opacity-50">{suffix}</span>}
      </p>
      <p className="text-[11px] text-muted-foreground/60 leading-tight">
        {trendText || '—'}
      </p>
    </motion.div>
  );
}

export default function WhereYouStand({ bis, businessId }) {
  const r = bis?._raw || {};

  const trends = useMemo(() => {
    const changedIds = bis?.engine?.changedSinceLastBriefing || [];
    if (!changedIds.length || !businessId) return {};
    const journal = loadJournal(businessId);
    return {
      iq: getTrend(journal, 'iq_score', changedIds),
      currentValue: getTrend(journal, 'current_value', changedIds),
      potentialValue: getTrend(journal, 'potential_value', changedIds),
      operations: getTrend(journal, 'operations_score', changedIds),
      timeFreed: getTrend(journal, 'monthly_value_of_time_freed', changedIds),
    };
  }, [bis, businessId]);

  const kpis = [
    { id: 'iq', icon: Sparkles, label: 'Business IQ', value: r.iq_score, suffix: '/100', color: '#F5F5F5', trend: trends.iq },
    { id: 'current', icon: Gem, label: 'Current Value', value: r.current_value, suffix: '', color: '#00D9FF', trend: trends.currentValue },
    { id: 'potential', icon: TrendingUp, label: 'Potential Value', value: r.potential_value, suffix: '', color: '#00D9FF', trend: trends.potentialValue },
    { id: 'ops', icon: Activity, label: 'Operations Health', value: r.operations_score, suffix: '/100', color: '#FF4D57', trend: trends.operations },
    { id: 'time', icon: Clock, label: 'Time Value Freed', value: r.monthly_value_of_time_freed, suffix: '/mo', color: '#A855F7', trend: trends.timeFreed },
  ];

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <p className="text-[12px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">Where You Stand</p>
        <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.05)' }} />
      </div>
      {/* Desktop: 5 in a row. Tablet: 3-col wraps. Mobile: horizontal swipe. */}
      <div className="hidden md:grid grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map((k, i) => (
          <KPICard key={k.id} {...k} delay={i * 0.06} />
        ))}
      </div>
      <div className="md:hidden flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory"
        style={{ scrollbarWidth: 'none' }}>
        {kpis.map((k, i) => (
          <div key={k.id} className="snap-start" style={{ minWidth: '200px' }}>
            <KPICard {...k} delay={i * 0.06} />
          </div>
        ))}
      </div>
    </div>
  );
}