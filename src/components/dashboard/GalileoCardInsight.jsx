import React, { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * GalileoCardInsight — Phase 4B
 * Card-level "Why this matters" explanations using real BIS values.
 * Each card type renders a deterministic, data-driven insight.
 */

const fmtK = (n) => {
  if (!n || n === 0) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(n / 1000)}K`;
};
const fmtDollars = (n) => n ? `$${Math.round(n).toLocaleString('en-US')}` : null;

function buildInsight(cardType, bis, assessmentSummary, metricsData) {
  const r = bis?._raw || {};
  const as = assessmentSummary || {};
  const m = metricsData || {};

  switch (cardType) {
    case 'iq_score': {
      const score = r.iq_score || as.derived_iq_score || m.ciq_score || null;
      const gaps = bis?.targetedImprovements?.length || 0;
      return {
        title: 'What this score means',
        body: score
          ? `Your score of ${Math.round(score)} reflects how efficiently your business is generating, retaining, and compounding value. ${score < 50 ? 'There are significant opportunities still uncaptured.' : score < 75 ? 'You\'re making progress — several high-leverage gaps remain.' : 'You\'re performing well — focus on compounding the gains.'}`
          : 'This score reflects profit efficiency, tax health, operations maturity, and your path to personal freedom.',
        cta: gaps > 0 ? `${gaps} closable gaps identified` : null,
      };
    }
    case 'profit_gap': {
      const gap = r.profit_gap_amount || as.profit_gap_amount || m.profit_gap?.gap_to_best;
      const revenue = r.revenue || as.revenue || m.revenue;
      const multiple = 4.5;
      const valImpact = gap ? Math.round(gap * multiple) : null;
      return {
        title: 'Why profit is your highest-leverage gap',
        body: gap
          ? `There's ${fmtK(gap)}/year in uncaptured profit between your current margins and what the top operators in your industry achieve. At a ${multiple}x exit multiple, closing this gap adds ${fmtK(valImpact)} to your business value.`
          : 'This shows the profit margin difference between your business and top performers in your industry. Every margin point recovered multiplies directly into exit valuation.',
        cta: valImpact ? `Potential valuation impact: ${fmtK(valImpact)}` : null,
      };
    }
    case 'value_gap': {
      const current = r.current_value || as.current_business_value;
      const potential = r.potential_value;
      const gap = r.value_gap_amount || as.value_gap_amount;
      return {
        title: 'The gap between where you are and where you could be',
        body: current && potential
          ? `Your business is currently valued around ${fmtK(current)}. With the right strategic moves, it could reach ${fmtK(potential)} — a difference of ${fmtK(gap) || 'significant value'}. This gap closes through margin improvement, operational systems, and exit readiness.`
          : 'This represents the difference between your current business value and its potential with strategic optimization. The gap narrows as you close profit, tax, and operations gaps.',
        cta: gap ? `Value gap: ${fmtK(gap)}` : null,
      };
    }
    case 'tax_gap': {
      const annual = r.tax_gap_annual || as.tax_gap_annual || m.tax_gap?.annual_overpayment;
      const tenYear = r.tax_gap_ten_year || as.tax_gap_ten_year || (annual ? annual * 10 : null);
      const count = r.tax_strategy_count || null;
      return {
        title: 'Tax overpayment compounds against you',
        body: annual
          ? `You may be overpaying ${fmtDollars(annual)}/year in taxes through strategies that are legal and widely used — but rarely implemented without a proactive advisor. Over 10 years, that's ${fmtK(tenYear)} that could have been reinvested.`
          : 'Tax gap strategies reduce unnecessary leakage through legal structures most business owners never use. Every dollar saved compounds over your working years.',
        cta: count ? `${count} strategy opportunities identified` : annual ? `10-year cost of inaction: ${fmtK(tenYear)}` : null,
      };
    }
    case 'operations_gap': {
      const score = r.operations_score != null ? Math.round(r.operations_score) : null;
      const hoursWorked = r.hours_worked_per_week || as.hours_worked_per_week;
      const hourlyVal = r.hourly_value_of_time_freed;
      const hoursFreed = r.hours_freed_per_week || 10;
      const monthlyFreed = r.monthly_value_of_time_freed || (hourlyVal ? Math.round(hourlyVal * hoursFreed * 4) : null);
      return {
        title: 'How much of your time is trapped in the business',
        body: hoursWorked && hourlyVal
          ? `You currently work about ${hoursWorked} hours each week. Based on your monthly take-home, each hour you recover is worth about ${fmtDollars(hourlyVal)}. Recovering ${hoursFreed} hours per week creates roughly ${fmtDollars(monthlyFreed)}/month of time value.`
          : score != null
          ? `Your operations health score is ${score}/100. ${score < 50 ? 'Owner-dependency is your largest hidden risk — buyers discount heavily for it.' : score < 75 ? 'Solid foundation — further systems reduce your personal risk and increase multiple.' : 'Strong systems protect your valuation and reduce buyer risk.'}`
          : 'This measures how much of the business runs on you personally. The more owner-dependent it is, the lower buyers value it — and the less freedom you have.',
        cta: monthlyFreed ? `Time value: ${fmtDollars(monthlyFreed)}/month recoverable` : score ? `Score: ${score}/100` : null,
      };
    }
    case 'recast_ebitda': {
      const addBacks = r.recast_add_backs || m.recast_ebitda?.total_add_backs;
      const valIncrease = r.recast_valuation_increase || m.recast_ebitda?.valuation_increase;
      return {
        title: 'What your EBITDA looks like to a buyer',
        body: addBacks
          ? `Recast EBITDA identifies ${fmtK(addBacks)}/year in owner-specific expenses that a new owner wouldn't carry. This recasting adds ${fmtK(valIncrease)} to how a buyer values your business — making it one of the simplest valuation levers available.`
          : 'Recast EBITDA adjusts your reported earnings to reflect what a new owner would actually see. Owner perks, one-time expenses, and personal-use items can significantly change your valuation multiple.',
        cta: valIncrease ? `Valuation increase: ${fmtK(valIncrease)}` : null,
      };
    }
    case 'path_to_freedom': {
      const monthlyTakeHome = r.monthly_take_home;
      const hoursWorked = r.hours_worked_per_week;
      const profitGap = r.profit_gap_amount;
      const taxGap = r.tax_gap_annual;
      return {
        title: 'How your business connects to your personal independence',
        body: monthlyTakeHome
          ? `Your current take-home of ${fmtDollars(monthlyTakeHome)}/month sets the baseline. Closing your profit gap (${fmtK(profitGap) || 'identified'}) and tax gap (${fmtK(taxGap) || 'identified'}/yr) accelerates the date you reach financial independence — sometimes by several years.`
          : 'Path to Freedom connects every business improvement to your personal timeline. Each gap you close brings forward your freedom date.',
        cta: null,
      };
    }
    case 'scenario_builder': {
      return {
        title: 'Model the impact before you commit',
        body: 'This builder uses the same baseline as your Path to Freedom projection. Adjust the levers to see how different strategies affect your exit value, monthly income, and freedom timeline — before committing to any of them.',
        cta: null,
      };
    }
    case 'targeted_improvements': {
      const improvements = bis?.targetedImprovements || [];
      const total = improvements.reduce((s, i) => s + (i.value || 0), 0);
      return {
        title: 'Your highest-leverage opportunities',
        body: improvements.length > 0
          ? `I found ${improvements.length} closeable gap${improvements.length !== 1 ? 's' : ''} in your business — ${improvements.map(i => i.label).join(', ')}. Each one identified from your own data, each one actionable.`
          : 'These are the specific areas where your business has measurable, closeable gaps. Complete assessments to see your full opportunity picture.',
        cta: total > 0 ? `Total identified: ${fmtK(total)}` : null,
      };
    }
    default:
      return null;
  }
}

export default function GalileoCardInsight({ cardType, assessmentSummary, metricsData, bis }) {
  const [open, setOpen] = useState(false);
  const insight = buildInsight(cardType, bis, assessmentSummary, metricsData);
  if (!insight) return null;

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1 text-primary/40 hover:text-primary/70 transition-colors"
        aria-label="Galileo insight"
      >
        <Sparkles className="w-3.5 h-3.5" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute z-30 bottom-full left-0 mb-2 w-72 rounded-xl shadow-2xl p-4 space-y-2.5"
            style={{ background: 'rgba(13,13,16,0.97)', border: '1px solid rgba(212,168,83,0.2)', backdropFilter: 'blur(12px)' }}
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.18 }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-primary/60 shrink-0" />
                <p className="text-[9px] tracking-[0.2em] uppercase text-primary/50">Galileo</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-white/20 hover:text-white/50 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-white/90 text-xs font-semibold leading-snug">{insight.title}</p>
            <p className="text-white/55 text-xs leading-relaxed">{insight.body}</p>

            {insight.cta && (
              <div className="rounded-md px-3 py-1.5" style={{ background: 'rgba(212,168,83,0.08)', border: '1px solid rgba(212,168,83,0.15)' }}>
                <p className="text-[10px] font-medium" style={{ color: '#D4A853' }}>{insight.cta}</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}