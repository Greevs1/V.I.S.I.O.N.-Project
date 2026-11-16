/**
 * HeroStoryCard — the hero of the IQ Dashboard above-the-fold.
 *
 * Full-width, ~42vh, with subtle breathing ambient gradients.
 *
 * Left:  Hero state — Baseline Business Value OR Verified Value Created
 * Right: "Today's Story" — highest-leverage gap narrative
 * Bottom: Primary CTA "Continue Executive Briefing →" + Secondary "Ask Galileo"
 *
 * ── PRESENTATION ONLY (Phase C: Phantom Micro-Delta Repair) ──────────────
 * HeroStoryCard no longer resolves raw business truth. It does NOT:
 *   - sum journal value_increased events
 *   - decide materiality
 *   - decide whether a change is verified
 *   - scan raw journal events to establish truth
 *
 * It receives already-resolved certified fields from the Shared Intelligence
 * Contract (via Dashboard props):
 *   - verifiedValue  — advisor-verified value creation events (Supabase)
 *   - baselineValue  — immutable first-measured Current Value (baselineResolver)
 *   - baselineStatus — ESTABLISHED | NOT_ESTABLISHED | NEEDS_REVIEW
 *   - baselineDate   — when the baseline was established
 *
 * Hero States:
 *   STATE A — BASELINE: No verified value created; baseline established.
 *     "Baseline Business Value" / "$X" / "Established [date]"
 *   STATE C — VERIFIED: Advisor-verified value creation events exist.
 *     "Verified Value Created" / "+$X" / "Verified Business Value Created"
 *   QUIET  — NO BASELINE: No baseline and no verified value.
 *     "Baseline" / "—" / "Complete an assessment to establish your baseline"
 *
 * A raw Current Value delta (e.g. +$5 from recalculation rounding) is NOT
 * "Verified Business Value Created" and is NOT displayed as a hero gain.
 * Materiality is resolved upstream in the BIE snapshot layer (materialityPolicy.js).
 */
import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useCountUp } from '@/hooks/useCountUp';

const fmt = (n) => {
  if (n == null || isNaN(n)) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}K`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
};

const formatBaselineDate = (dateStr) => {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
};

function buildStory(r, contract) {
  // Today's Story uses the SAME contract values as the rest of the Dashboard.
  // The contract is the single certified source — no independent resolution.
  const c = contract || {};
  const gaps = [
    { id: 'value_gap', label: 'Value Gap', value: c.valuation?.value_gap ?? r.value_gap_amount ?? 0, current: c.valuation?.current_value ?? r.current_value, potential: c.valuation?.potential_value ?? r.potential_value },
    { id: 'profit_gap', label: 'Profit Gap', value: c.profitability?.profit_gap ?? r.profit_gap_amount ?? 0 },
    { id: 'tax_gap', label: 'Tax Gap', value: c.tax?.annual_tax_gap ?? r.tax_gap_annual ?? 0 },
  ].filter(g => g.value > 0);

  if (!gaps.length) return null;
  gaps.sort((a, b) => b.value - a.value);
  const top = gaps[0];

  if (top.id === 'value_gap' && top.potential != null && top.current != null) {
    return {
      narrative: `Your Value Gap is still preventing approximately ${fmt(top.value)} of enterprise value.`,
      outcome: `If addressed, your estimated value increases to ${fmt(top.potential)}.`,
    };
  }
  if (top.id === 'profit_gap') {
    return {
      narrative: `Your Profit Gap of ${fmt(top.value)} is your highest-leverage opportunity.`,
      outcome: 'Closing it would strengthen both cash flow and your exit valuation.',
    };
  }
  return {
    narrative: `Your Tax Gap of ${fmt(top.value)}/yr compounds your Value Gap.`,
    outcome: 'Every dollar overpaid in taxes reduces EBITDA — and your exit multiple.',
  };
}

export default function HeroStoryCard({ bis, businessId, verifiedValue, baselineValue, baselineDate, baselineStatus, contract, onContinueBriefing, onAskGalileo }) {
  const r = bis?._raw || {};

  // ── Hero State Resolution (presentation-only) ──────────────────────────
  // No journal scanning, no materiality decisions, no raw event summing.
  // The hero state is resolved entirely from already-certified contract fields.
  const heroState = useMemo(() => {
    // STATE C — VERIFIED VALUE CREATED
    // Only advisor-verified value creation events (Supabase value_creation_events
    // WHERE status='verified' AND confidence_level='verified'). A raw Current
    // Value delta is NOT verified value created — it is never promoted here.
    if (verifiedValue > 0) {
      return { state: 'verified', amount: verifiedValue };
    }
    // STATE A — BASELINE BUSINESS VALUE
    // Immutable first-measured Current Value from the shared baselineResolver.
    // Does NOT move when Current Value later changes.
    if (baselineStatus === 'ESTABLISHED' && baselineValue != null && baselineValue > 0) {
      return { state: 'baseline', amount: baselineValue, baselineDate };
    }
    if (baselineStatus === 'NEEDS_REVIEW' && baselineValue != null && baselineValue > 0) {
      return { state: 'baseline', amount: baselineValue, baselineDate, needsReview: true };
    }
    // QUIET — NO BASELINE
    return { state: 'no_baseline', amount: 0 };
  }, [verifiedValue, baselineValue, baselineDate, baselineStatus]);

  const story = useMemo(() => buildStory(r, contract), [r, contract]);
  const animatedValue = useCountUp(heroState.amount || 0, 1400);
  const displayValue = heroState.amount > 0 ? fmt(animatedValue) : null;

  // ── Display labels (driven by heroState, not raw journal inference) ──────
  const labelTop = heroState.state === 'verified'
    ? 'Verified Value Created'
    : heroState.state === 'baseline'
      ? 'Baseline Business Value'
      : 'Baseline';

  const labelSub = heroState.state === 'verified'
    ? 'Verified Business Value Created'
    : heroState.state === 'baseline'
      ? heroState.needsReview
        ? `Established ${formatBaselineDate(heroState.baselineDate)} · Review pending`
        : `Established ${formatBaselineDate(heroState.baselineDate)}`
      : 'Complete an assessment to establish your baseline';

  const showPlus = heroState.state === 'verified';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      className="relative w-full rounded-2xl overflow-hidden"
      style={{ minHeight: 'min(42vh, 400px)' }}
    >
      {/* Base */}
      <div className="absolute inset-0" style={{ background: '#0E0E10' }} />

      {/* Breathing ambient gradients */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 60% 80% at 20% 30%, rgba(212,168,83,0.10) 0%, transparent 50%), radial-gradient(ellipse 50% 70% at 80% 70%, rgba(0,217,255,0.05) 0%, transparent 50%)',
        }}
        animate={{ opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 40% 60% at 70% 20%, rgba(212,168,83,0.05) 0%, transparent 60%)',
        }}
        animate={{ opacity: [0.4, 0.8, 0.4] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
      />

      {/* Content */}
      <div className="relative h-full flex flex-col p-8 md:p-12 lg:p-14" style={{ minHeight: 'min(42vh, 400px)' }}>
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
          {/* Left: Hero State */}
          <div className="flex flex-col justify-center">
            <p className="text-[12px] font-medium tracking-[0.15em] uppercase text-muted-foreground mb-4">
              {labelTop}
            </p>
            {displayValue ? (
              <motion.p
                className="text-5xl md:text-6xl lg:text-7xl font-display font-bold leading-tight text-gold-gradient mb-3 py-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.4 }}
              >
                {showPlus ? '+' : ''}{displayValue}
              </motion.p>
            ) : (
              <p className="text-4xl md:text-5xl font-display font-bold leading-none text-foreground/40 mb-3">
                {heroState.state === 'no_baseline' ? 'Baseline not yet established' : 'Awaiting data'}
              </p>
            )}
            <p className="text-base md:text-lg text-foreground/60 font-light">
              {labelSub}
            </p>
            {heroState.state === 'baseline' && (r.potential_value != null || r.value_gap_amount != null) && (
              <p className="text-sm text-muted-foreground/60 mt-2">
                Potential {fmt(r.potential_value) || '—'} • Value Gap {fmt(r.value_gap_amount) || '—'}
              </p>
            )}
          </div>

          {/* Right: Today's Story */}
          {story && (
            <div className="flex flex-col justify-center lg:border-l lg:border-white/10 lg:pl-12">
              <p className="text-[12px] font-medium tracking-[0.15em] uppercase text-muted-foreground mb-4">
                Today's Story
              </p>
              <p className="text-lg md:text-xl text-foreground/85 leading-relaxed mb-3 font-light">
                {story.narrative}
              </p>
              <p className="text-base md:text-lg text-foreground/55 leading-relaxed font-light">
                {story.outcome}
              </p>
            </div>
          )}
        </div>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-3 mt-8">
          <button
            onClick={onContinueBriefing}
            className="group inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-300 hover:shadow-lg hover:shadow-primary/20 hover:-translate-y-0.5"
            style={{ background: '#D4A853', color: '#08080C' }}
          >
            Continue Executive Briefing
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </button>
          <button
            onClick={onAskGalileo}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-medium border border-white/10 text-foreground/80 hover:text-foreground hover:bg-white/5 hover:border-white/20 transition-all duration-300"
          >
            <Sparkles className="w-4 h-4 text-primary" />
            Ask Galileo
          </button>
        </div>
      </div>
    </motion.div>
  );
}