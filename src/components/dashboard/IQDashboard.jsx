import React from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, Gem, Receipt, Activity, Sparkles } from 'lucide-react';
import GalileoCardInsight from '@/components/dashboard/GalileoCardInsight';
import GapValidationBreakdown from '@/components/dashboard/GapValidationBreakdown';

const ASSESSMENT_ICONS = {
  profit: TrendingUp,
  value: Gem,
  tax: Receipt,
  operations: Activity,
  recast: Sparkles,
};

const STATUS_LABEL = {
  SIGNIFICANT: 'Significant',
  MODERATE: 'Moderate',
  LOW: 'Low',
};

const fmtCurrency = (n, unit = 'K') => {
  if (n == null || isNaN(n)) return '—';
  if (unit === 'M' || n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (unit === 'K/yr') return `$${Math.round(n).toLocaleString('en-US')}/yr`;
  if (unit === 'K/mo') return `$${Math.round(n).toLocaleString('en-US')}/mo`;
  if (unit === '/yr') return `$${Math.round(n).toLocaleString('en-US')}/yr`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
};

const GAP_TYPE_TO_CARD = { profit: 'profit_gap', value: 'value_gap', tax: 'tax_gap', operations: 'operations_gap' };

const SEVERITY_WIDTH = { SIGNIFICANT: '100%', MODERATE: '66%', LOW: '33%' };

// Card type → contract assessment type key
const CARD_TO_ASSESSMENT_TYPE = {
  profit: 'profit_gap',
  value: 'value_gap',
  tax: 'tax_gap',
  operations: 'operations_gap',
  recast: 'recast_ebitda',
};

/**
 * IQDashboard — Business At A Glance gap cards.
 *
 * Contract-owned fields (completion + primary values) come from the shared
 * useBusinessIntelligenceContract hook via the `contract` prop. This is the
 * SINGLE certified source for assessment truth.
 *
 * Non-contract fields (severity, GalileoCardInsight) still read from `bis`
 * and `assessmentSummary` — these are NOT assessment truth.
 *
 * State machine:
 *   LOADING  → contractLoading && !contract  → show "Loading…"
 *   READY    → contract available            → read completion + values from contract
 *   GUEST    → no contract (guest user)       → fall back to bis._raw
 */
export default function IQDashboard({ bis, contract, contractLoading, assessmentSummary, latestSnapshot, metricsData }) {
  const r = bis?._raw || {};
  const pgDetails = bis?.profit?.details || assessmentSummary?.profit_gap_details || {};
  const vgDetails = bis?.value?.details || assessmentSummary?.value_gap_details || {};
  const tgDetails = bis?.tax?.details || assessmentSummary?.tax_gap_details || {};
  const ogDetails = bis?.operations?.details || assessmentSummary?.operations_gap_details || {};

  // ── Completion: from the shared contract (single certified source) ──────────
  const isCompleted = (cardType) => {
    const at = CARD_TO_ASSESSMENT_TYPE[cardType];
    if (contract?.assessments?.[at]) {
      return contract.assessments[at].completed === true;
    }
    // Guest fallback: check bis._sources.assessmentSummary.intelligence_contract
    const guestContract = bis?._sources?.assessmentSummary?.intelligence_contract;
    return guestContract?.assessments?.[at]?.completed === true;
  };

  // ── Values: contract-preferred, bis._raw fallback for guests ─────────────────
  const taxGapAnnual = contract?.tax?.annual_tax_gap ?? r.tax_gap_annual ?? null;
  const taxGapTenYear = contract?.tax?.ten_year_tax_gap ?? r.tax_gap_ten_year ?? null;
  const recastEbitda = contract?.profitability?.recast_ebitda ?? r.recast_ebitda ?? null;
  const recastAddBacks = contract?.profitability?.total_addbacks ?? r.recast_add_backs ?? null;
  const recastValIncrease = contract?.profitability?.recast_value_impact ?? r.recast_valuation_increase ?? null;
  const profitGapAmount = contract?.profitability?.profit_gap ?? r.profit_gap_amount ?? null;
  const currentValue = contract?.valuation?.current_value ?? r.current_value ?? null;
  const potentialValue = contract?.valuation?.potential_value ?? r.potential_value ?? null;
  const valueGapAmount = contract?.valuation?.value_gap ?? r.value_gap_amount ?? null;
  const opsScore = contract?.operations?.operations_score ?? r.operations_score ?? null;
  const monthlyFreed = contract?.operations?.monthly_value_of_time_freed ?? r.monthly_value_of_time_freed ?? null;
  const hourlyFreed = contract?.operations?.hourly_value_of_time_freed ?? r.hourly_value_of_time_freed ?? null;

  const gapData = {
    profit: {
      severity: (bis?.profit?.severity || pgDetails.severity || assessmentSummary?.profit_gap_severity)?.toUpperCase() || null,
      mainValue: profitGapAmount != null ? fmtCurrency(profitGapAmount, 'K') : null,
      secondaryValue: pgDetails.gap_to_average != null ? fmtCurrency(pgDetails.gap_to_average, 'K') : null,
      completed: isCompleted('profit'),
    },
    value: {
      severity: (bis?.value?.severity || vgDetails.severity || assessmentSummary?.value_gap_severity)?.toUpperCase() || null,
      mainValue: currentValue != null ? fmtCurrency(currentValue, 'M') : null,
      secondaryValue: potentialValue != null ? fmtCurrency(potentialValue, 'M') : null,
      completed: isCompleted('value'),
    },
    tax: (() => {
      const stratCount = r.tax_strategy_count || tgDetails.opportunities?.length || 0;
      return {
        severity: (bis?.tax?.severity || tgDetails.severity || assessmentSummary?.tax_gap_severity)?.toUpperCase() || null,
        mainValue: taxGapAnnual != null ? fmtCurrency(taxGapAnnual, 'K/yr') : null,
        secondaryValue: taxGapTenYear != null ? fmtCurrency(taxGapTenYear, 'K') : null,
        completed: isCompleted('tax'),
      };
    })(),
    operations: (() => {
      let opsSecondary = null;
      if (monthlyFreed > 0) opsSecondary = `$${Math.round(monthlyFreed).toLocaleString('en-US')}/mo`;
      else if (hourlyFreed > 0) opsSecondary = `$${Math.round(hourlyFreed).toLocaleString('en-US')}/hr`;
      return {
        severity: (bis?.operations?.severity || ogDetails.severity || assessmentSummary?.operations_gap_severity)?.toUpperCase() || null,
        mainValue: opsScore != null ? `${Math.round(opsScore)}/100` : null,
        secondaryValue: opsSecondary,
        completed: isCompleted('operations'),
      };
    })(),
    recast: {
      severity: null,
      mainValue: recastEbitda != null ? fmtCurrency(recastEbitda, 'K') : null,
      secondaryValue: recastValIncrease != null ? fmtCurrency(recastValIncrease, 'M') : null,
      completed: isCompleted('recast'),
    },
  };

  const colors = {
    profit: { title: '#A855F7', value: '#A855F7', border: 'rgba(168, 85, 247, 0.3)' },
    value: { title: '#00D9FF', value: '#00D9FF', border: 'rgba(0, 217, 255, 0.3)' },
    tax: { title: '#00D1B2', value: '#00D1B2', border: 'rgba(0, 209, 178, 0.3)' },
    operations: { title: '#FF4D57', value: '#FF4D57', border: 'rgba(255, 77, 87, 0.3)' },
    recast: { title: '#D4A72C', value: '#D4A72C', border: 'rgba(212, 167, 44, 0.3)' }
  };

  const GapCard = ({ type, data }) => {
    const titles = {
      profit: 'Profit Gap',
      value: 'Value Gap',
      tax: 'Tax Gap',
      operations: 'Operations',
      recast: 'Recast EBITDA',
    };
    const Icon = ASSESSMENT_ICONS[type];
    const c = colors[type];
    const statusLabel = data.severity
      ? (STATUS_LABEL[data.severity] || data.severity.charAt(0) + data.severity.slice(1).toLowerCase())
      : null;

    // State machine: LOADING vs READY vs GUEST
    const isLoading = contractLoading && !contract && !data.mainValue;
    const showAssessed = data.completed || data.mainValue;

    return (
      <div
        className="group rounded-2xl p-6 md:p-7 transition-all duration-300 hover:border-white/10 hover:-translate-y-0.5 flex flex-col h-full min-h-[210px]"
        style={{
          background: '#161616',
          border: '1px solid rgba(255,255,255,0.05)',
        }}>
        {/* Header: icon + title + Why */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center opacity-80 transition-opacity group-hover:opacity-100" style={{ background: `${c.value}10` }}>
              <Icon className="w-4 h-4" style={{ color: c.value }} />
            </div>
            <h3 className="text-[12px] font-semibold tracking-[0.12em] uppercase text-muted-foreground">
              {titles[type]}
            </h3>
          </div>
          <GalileoCardInsight
            cardType={GAP_TYPE_TO_CARD[type] || 'recast_ebitda'}
            assessmentSummary={assessmentSummary}
            metricsData={metricsData}
            bis={bis}
          />
        </div>

        {isLoading ? (
          <div className="flex-1 flex flex-col justify-center">
            <div className="flex items-center gap-2 opacity-50">
              <div className="w-3 h-3 rounded-full border border-white/20 border-t-white/50 animate-spin" />
              <span className="text-[13px] text-muted-foreground/60">Loading…</span>
            </div>
          </div>
        ) : showAssessed ? (
          <div className="flex-1 flex flex-col">
            {/* Primary KPI — the focal point */}
            <p className="text-4xl md:text-5xl font-display font-bold leading-none mb-2" style={{ color: c.value }}>
              {data.mainValue || 'Assessed'}
            </p>
            {data.secondaryValue && (
              <p className="text-[13px] text-muted-foreground/70 mb-6">{data.secondaryValue}</p>
            )}

            {/* Status + opportunity progress — quiet, anchored to the bottom */}
            {type !== 'recast' && (
              <div className="mt-auto">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: c.value, opacity: 0.6 }} />
                  <span className="text-[11px] text-muted-foreground/60">{statusLabel || 'Opportunity'}</span>
                </div>
                <div className="h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      background: c.value,
                      width: data.severity ? (SEVERITY_WIDTH[data.severity] || '33%') : '33%',
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-3 opacity-50">
              <Icon className="w-4 h-4" style={{ color: c.value }} />
              <span className="text-[13px] text-muted-foreground/60">Ready to Discover</span>
            </div>
            <Link
              to={`/assessments/${type === 'recast' ? 'recast-ebitda' : type + '-gap'}`}
              className="inline-flex items-center gap-1 text-[13px] font-medium hover:underline"
              style={{ color: c.title }}>
              Complete Assessment →
            </Link>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4" data-walkthrough="iq-gaps" id="business-at-a-glance">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
        <div data-walkthrough="gap-profit" className="h-full"><GapCard type="profit" data={gapData.profit} /></div>
        <GapCard type="value" data={gapData.value} />
        <div data-walkthrough="gap-tax" className="h-full"><GapCard type="tax" data={gapData.tax} /></div>
        <GapCard type="operations" data={gapData.operations} />
        <GapCard type="recast" data={gapData.recast} />
      </div>

      {/* Gap Validation Breakdown — preserved */}
      <GapValidationBreakdown bis={bis} />
    </div>
  );
}