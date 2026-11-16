/**
 * BusinessStoryPanel — Phase 8 (Redesigned)
 *
 * The emotional center of the dashboard — "What should I care about today?"
 * Draws from BIS raw values and the latest journal entries.
 * No LLM — template-based from real data only.
 *
 * Tone: Galileo advisor voice. Factual, never salesy.
 */
import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { loadJournal } from '@/lib/bie';

const fmt = (n) => {
  if (n == null || isNaN(n)) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
};

function highestGapLabel(r) {
  const gaps = [
    { id: 'profit_gap_amount', label: 'Profit Gap', value: r.profit_gap_amount || 0 },
    { id: 'tax_gap_annual',    label: 'Tax Gap',    value: r.tax_gap_annual || 0 },
    { id: 'value_gap_amount',  label: 'Value Gap',  value: r.value_gap_amount || 0 },
  ].filter(g => g.value > 0);
  if (!gaps.length) return null;
  gaps.sort((a, b) => b.value - a.value);
  return gaps[0];
}

export default function BusinessStoryPanel({ bis, businessId, onMeetAdvisor }) {
  const story = useMemo(() => {
    const r = bis?._raw || {};
    const health = bis?.engine?.health;
    const hasData = bis?.hasData;
    if (!hasData) return null;

    const top = highestGapLabel(r);
    const totalIdentified = (r.profit_gap_amount || 0) + (r.value_gap_amount || 0) + (r.tax_gap_annual || 0) + (r.recast_add_backs || 0);
    const iq = r.iq_score;
    const opsScore = r.operations_score;

    const headline = top
      ? `Your ${top.label} is your highest-leverage opportunity`
      : 'Your business intelligence profile is taking shape';

    const supporting = top
      ? `Closing your ${top.label} of ${fmt(top.value) || 'measurable value'} would strengthen both your cash flow and your exit valuation. Across all dimensions, Galileo has identified ${fmt(totalIdentified) || 'significant value'} in measurable, closeable opportunities.`
      : 'Each assessment you complete reveals new opportunities and sharpens your strategy. Complete your first assessment to begin building your intelligence profile.';

    const metrics = [
      { label: 'Total Opportunity', value: fmt(totalIdentified) || '—', color: '#D4A853' },
      { label: 'Impact Quotient', value: iq != null ? `${Math.round(iq)}` : '—', color: '#D4A853' },
      { label: 'Operations Health', value: opsScore != null ? `${Math.round(opsScore)}/100` : '—', color: '#FF4D57' },
    ];

    return { headline, supporting, metrics };
  }, [bis, businessId]);

  if (!story) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="rounded-2xl p-8 md:p-10 h-full flex flex-col relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(212,168,83,0.08) 0%, #161616 60%)',
        border: '1px solid rgba(212,168,83,0.15)',
      }}
    >
      {/* Decorative gold accent glow */}
      <div className="absolute top-0 right-0 w-56 h-56 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(212,168,83,0.10) 0%, transparent 70%)' }} />

      <div className="relative flex items-center gap-2 mb-4">
        <span style={{ color: 'rgba(212,168,83,0.9)', fontSize: 14 }}>✦</span>
        <p className="text-[12px] font-semibold tracking-[0.15em] uppercase text-muted-foreground">
          Today's Business Story
        </p>
      </div>

      <h2 className="relative text-2xl md:text-3xl font-display font-bold mb-4 leading-snug" style={{ color: '#F5F5F5' }}>
        {story.headline}
      </h2>

      <p className="relative text-base md:text-lg leading-relaxed text-foreground/70 mb-8">
        {story.supporting}
      </p>

      <div className="relative grid grid-cols-3 gap-4 mt-auto mb-6">
        {story.metrics.map((m, i) => (
          <div key={i}>
            <p className="text-2xl md:text-3xl font-display font-bold leading-none" style={{ color: m.color }}>
              {m.value}
            </p>
            <p className="text-[12px] text-muted-foreground mt-2">
              {m.label}
            </p>
          </div>
        ))}
      </div>

      <button
        onClick={onMeetAdvisor}
        className="relative inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-[14px] font-semibold transition-all duration-300 hover:opacity-95 hover:-translate-y-0.5 self-start"
        style={{ background: '#D4A853', color: '#08080C' }}
      >
        Explore the full story
        <ArrowRight className="w-4 h-4" />
      </button>
    </motion.div>
  );
}