import React from 'react';
import { Link } from 'react-router-dom';

const fmtCurrency = (n, unit = 'K') => {
  if (n == null || isNaN(n)) return '—';
  if (unit === 'M') return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(n / 1000)}K`;
};

const severityConfig = {
  significant: {
    label: 'SIGNIFICANT',
    bg: 'bg-fuchsia-500/10',
    text: 'text-fuchsia-400',
    border: 'border-fuchsia-500/30',
  },
  moderate: {
    label: 'MODERATE',
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-400',
    border: 'border-cyan-500/30',
  },
  low: {
    label: 'LOW',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
  },
};

export default function IQGapCard({ gapType, data, assessmentSummary, latestSnapshot }) {
  const configs = {
    profit: {
      title: 'Profit Gap',
      severity: assessmentSummary.profit_gap_severity || 'low',
      primary: (() => {
        const val = assessmentSummary.profit_gap_amount ?? data.profit_gap?.gap_to_best ?? data.profit_gap?.gapToBest ?? latestSnapshot.profit_opportunity ?? null;
        const completed = data.profit_gap?.completed ?? (assessmentSummary.profit_gap_amount != null);
        return val != null ? (val === 0 ? '$0K' : fmtCurrency(val, 'K')) : (completed ? '$0K' : 'Complete assessment');
      })(),
      primaryLabel: 'gap to best-in-class',
      secondary: (() => {
        const secVal = data.profit_gap?.gap_to_average ?? data.profit_gap?.gapToAverage ?? null;
        return secVal != null && secVal !== 0 ? fmtCurrency(secVal, 'K') : '—';
      })(),
      secondaryLabel: 'gap to industry avg',
      footer: data.profit_gap?.margin_ceiling ? `${data.profit_gap.margin_ceiling.toFixed(1)}% vs ${data.profit_gap.industry_avg_margin?.toFixed(1) || '10'}% ceiling` : null,
      accentColor: 'fuchsia',
    },
    value: {
      title: 'Value Gap',
      severity: assessmentSummary.value_gap_severity || 'low',
      primary: (() => {
        const val = assessmentSummary.value_gap_amount ?? data.value_gap?.gap_amount ?? data.value_gap?.gapAmount ?? data.value_gap?.potential_value ?? data.value_gap?.potentialValue ?? latestSnapshot.value_gap ?? null;
        const completed = data.value_gap?.completed ?? (assessmentSummary.value_gap_amount != null);
        return val != null ? (val === 0 ? '$0M' : fmtCurrency(val, 'M')) : (completed ? '$0M' : 'Complete assessment');
      })(),
      primaryLabel: 'potential value',
      secondary: data.enterprise_value != null ? fmtCurrency(data.enterprise_value, 'M') : '—',
      secondaryLabel: 'industry avg value',
      tertiary: (() => {
        const terVal = data.value_gap?.gap_amount ?? data.value_gap?.gapAmount ?? data.value_gap?.potential_value ?? data.value_gap?.potentialValue ?? null;
        return terVal != null && terVal !== 0 ? fmtCurrency(terVal, 'M') : null;
      })(),
      tertiaryLabel: 'missed opportunity',
      accentColor: 'cyan',
    },
    tax: {
      title: 'Tax Gap',
      severity: assessmentSummary.tax_gap_severity || 'low',
      primary: (() => {
        const val = assessmentSummary.tax_gap_annual ?? data.tax_gap?.annual_overpayment;
        return val != null ? fmtCurrency(val, 'K/yr') : 'Complete assessment';
      })(),
      primaryLabel: 'estimated annual overpayment',
      secondary: assessmentSummary.tax_gap_ten_year ? fmtCurrency(assessmentSummary.tax_gap_ten_year, 'K') : '—',
      secondaryLabel: '10-yr cost of inaction',
      footer: assessmentSummary.tax_opportunities?.length > 0 ? assessmentSummary.tax_opportunities.join(', ') : null,
      accentColor: 'cyan',
    },
    operations: {
      title: 'Operations Gap',
      severity: assessmentSummary.operations_gap_severity || 'moderate',
      primary: (() => {
        const val = assessmentSummary.operations_score ?? data.operations_gap?.score ?? latestSnapshot.cash_flow_opportunity;
        return val != null ? `${Math.round(val)}/100` : 'Complete assessment';
      })(),
      primaryLabel: 'operations health score',
      secondary: (() => {
        const val = assessmentSummary.monthly_value_freed ?? data.operations_gap?.monthly_value_freed;
        return val != null ? fmtCurrency(val, 'K/mo') : '—';
      })(),
      secondaryLabel: 'freed value of time',
      footer: assessmentSummary.operations_gap_severity ? `${assessmentSummary.operations_gap_severity} gap` : null,
      accentColor: 'red',
    },
  };

  const config = configs[gapType];
  const severity = severityConfig[config.severity?.toLowerCase()] || severityConfig.low;

  const accentColors = {
    fuchsia: { text: 'text-fuchsia-400', border: 'border-fuchsia-500/30', bg: 'bg-fuchsia-500/5' },
    cyan: { text: 'text-cyan-400', border: 'border-cyan-500/30', bg: 'bg-cyan-500/5' },
    red: { text: 'text-red-400', border: 'border-red-500/30', bg: 'bg-red-500/5' },
  };

  const accent = accentColors[config.accentColor];

  return (
    <div className={`rounded-2xl p-8 space-y-6 h-full border ${severity.border} ${accent.bg} transition-all duration-300 hover:border-white/10`}>
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">{config.title}</h3>
          <p className={`text-[10px] font-medium tracking-[0.1em] uppercase mt-3 ${severity.text}`}>
            {severity.label}
          </p>
        </div>
        <div className={`text-xs font-medium uppercase px-2.5 py-1.5 rounded-full ${severity.bg} ${severity.text}`}>
          ◆
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <p className={`text-3xl md:text-4xl font-display font-bold ${config.primary === 'Complete assessment' ? 'text-foreground' : accent.text}`}>
            {config.primary}
          </p>
          <p className="text-[11px] text-muted-foreground uppercase tracking-[0.08em] mt-2">
            {config.primaryLabel}
          </p>
        </div>

        <div className="border-t border-white/5 pt-4">
          <p className="text-sm font-medium text-foreground">{config.secondary}</p>
          <p className="text-[11px] text-muted-foreground uppercase tracking-[0.08em] mt-1">
            {config.secondaryLabel}
          </p>
        </div>

        {config.tertiary && (
          <div className="border-t border-white/5 pt-4">
            <p className={`text-sm font-medium ${accent.text}`}>{config.tertiary}</p>
            <p className="text-[11px] text-muted-foreground uppercase tracking-[0.08em] mt-1">
              {config.tertiaryLabel}
            </p>
          </div>
        )}

        {config.footer && (
          <div className="border-t border-white/5 pt-4">
            <p className="text-xs text-muted-foreground leading-relaxed">{config.footer}</p>
          </div>
        )}
      </div>

      <Link
        to={`/assessments/${gapType}-gap`}
        className={`inline-flex items-center gap-1 text-xs font-medium ${accent.text} hover:underline`}
      >
        Complete assessment →
      </Link>
    </div>
  );
}