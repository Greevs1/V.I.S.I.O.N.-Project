import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Activity, Gem, TrendingUp, Clock } from 'lucide-react';
import { calculateBusinessImpactScore } from '@/lib/businessIntelligenceState';
import GalileoCardInsight from '@/components/dashboard/GalileoCardInsight';

const KPI_ICONS = {
  iq: Sparkles,
  impact: Activity,
  potential: Gem,
  profit: TrendingUp,
  hours: Clock,
};

const fmt = (n, suffix = '') => {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M${suffix}`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}K${suffix}`;
  return `$${Math.round(n).toLocaleString('en-US')}${suffix}`;
};

export default function ExecutiveKPICards({ bis, impactScore }) {
  const r = bis?._raw || {};
  const impact = useMemo(() => {
    if (impactScore != null) return impactScore;
    const result = calculateBusinessImpactScore(bis);
    return result?.impact_score ?? 0;
  }, [bis, impactScore]);

  const kpis = [
    {
      id: 'iq',
      label: 'Impact Quotient',
      value: r.iq_score != null ? `${Math.round(r.iq_score)}` : '—',
      suffix: '/100',
      color: '#F5F5F5',
      hasWhy: true,
    },
    {
      id: 'impact',
      label: 'Business Impact',
      value: impact != null ? `${Math.round(impact)}` : '—',
      suffix: '/100',
      color: '#F5F5F5',
    },
    {
      id: 'potential',
      label: 'Potential Value',
      value: r.potential_value ? fmt(r.potential_value) : '—',
      suffix: '',
      color: '#00D9FF',
    },
    {
      id: 'profit',
      label: 'Annual Profit Gap',
      value: r.profit_gap_amount ? fmt(r.profit_gap_amount) : '—',
      suffix: '',
      color: '#A855F7',
    },
    {
      id: 'hours',
      label: 'Time Value Freed',
      value: r.monthly_value_of_time_freed ? fmt(r.monthly_value_of_time_freed, '/mo') : '—',
      suffix: '',
      color: '#FF4D57',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {kpis.map((kpi, i) => {
        const Icon = KPI_ICONS[kpi.id];
        return (
          <motion.div
            key={kpi.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.3 }}
            className="rounded-2xl p-5 md:p-6 relative flex flex-col overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:border-white/10"
            style={{
              background: '#161616',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            {/* Ambient glow */}
            <div className="absolute top-0 right-0 w-24 h-24 rounded-full pointer-events-none opacity-50"
              style={{ background: `radial-gradient(circle, ${kpi.color}12 0%, transparent 70%)` }} />

            <div className="relative flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${kpi.color}14` }}>
                  <Icon className="w-3.5 h-3.5" style={{ color: kpi.color }} />
                </div>
                <p className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider">
                  {kpi.label}
                </p>
              </div>
              {kpi.hasWhy && (
                <GalileoCardInsight cardType="iq_score" bis={bis} iqScore={r.iq_score} />
              )}
            </div>
            <p className="relative text-4xl md:text-5xl font-display font-bold leading-none flex-1" style={{ color: kpi.color }}>
              {kpi.value}
              {kpi.suffix && (
                <span className="text-lg font-medium ml-1" style={{ color: kpi.color, opacity: 0.5 }}>
                  {kpi.suffix}
                </span>
              )}
            </p>
          </motion.div>
        );
      })}
    </div>
  );
}