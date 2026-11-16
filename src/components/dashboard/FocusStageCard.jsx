/**
 * FocusStageCard — Focus Mode centered preview card
 *
 * Shows a clean, branded summary of the current briefing topic
 * using actual BIS data. Sits above the Galileo explanation panel.
 * Never covers anything. Never misaligns.
 */

import React from 'react';
import { motion } from 'framer-motion';

// ── Format helpers ────────────────────────────────────────────────────────────
const fmt = (n) => {
  if (n == null || isNaN(n) || n === 0) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
};
const fmtScore = (n) => n != null ? `${Math.round(n)}/100` : null;

// ── Color config per topic ────────────────────────────────────────────────────
const TOPIC_COLORS = {
  iq_score:             { accent: '#D4A853', icon: '◎', bg: 'rgba(212,168,83,0.06)' },
  business_impact_score:{ accent: '#D4A853', icon: '◈', bg: 'rgba(212,168,83,0.06)' },
  targeted_improvements:{ accent: '#00D9FF', icon: '◉', bg: 'rgba(0,217,255,0.05)' },
  profit_gap:           { accent: '#A855F7', icon: '▲', bg: 'rgba(168,85,247,0.05)' },
  value_gap:            { accent: '#00D9FF', icon: '◆', bg: 'rgba(0,217,255,0.05)' },
  tax_gap:              { accent: '#00D1B2', icon: '✦', bg: 'rgba(0,209,178,0.05)' },
  operations_gap:       { accent: '#FF4D57', icon: '⬡', bg: 'rgba(255,77,87,0.05)' },
  recast_ebitda:        { accent: '#D4A72C', icon: '◐', bg: 'rgba(212,167,44,0.05)' },
  freedom:              { accent: '#7C3AED', icon: '❋', bg: 'rgba(124,58,237,0.05)' },
};

const DEFAULT_COLOR = { accent: '#D4A853', icon: '●', bg: 'rgba(212,168,83,0.04)' };

// ── Metric extraction per step ID ─────────────────────────────────────────────
function extractMetrics(stepId, bis) {
  const r = bis?._raw || {};
  switch (stepId) {
    case 'iq_score':
      return r.iq_score != null
        ? [{ label: 'Impact Quotient™', value: `${Math.round(r.iq_score)}`, unit: '/ 100' }]
        : null;
    case 'business_impact_score':
      return r.iq_score != null
        ? [{ label: 'IQ Score', value: `${Math.round(r.iq_score)}`, unit: '/ 100' }]
        : null;
    case 'targeted_improvements': {
      const imp = bis?.targetedImprovements || [];
      const total = imp.reduce((s, i) => s + (i.value || 0), 0);
      return imp.length > 0
        ? [
            { label: 'Closeable Gaps', value: `${imp.length}`, unit: 'identified' },
            { label: 'Total Opportunity', value: fmt(total) || '—', unit: '' },
          ]
        : null;
    }
    case 'profit_gap':
      return r.profit_gap_amount != null
        ? [{ label: 'Annual Profit Gap', value: fmt(r.profit_gap_amount) || '—', unit: '/yr' }]
        : null;
    case 'value_gap':
      return r.value_gap_amount != null
        ? [
            { label: 'Current Value', value: fmt(r.current_value) || '—', unit: '' },
            { label: 'Value Gap', value: fmt(r.value_gap_amount) || '—', unit: '' },
          ]
        : null;
    case 'tax_gap':
      return r.tax_gap_annual != null
        ? [
            { label: 'Annual Overpayment', value: fmt(r.tax_gap_annual) || '—', unit: '/yr' },
            ...(r.tax_gap_ten_year ? [{ label: '10-Year Cost', value: fmt(r.tax_gap_ten_year) || '—', unit: '' }] : []),
          ]
        : null;
    case 'operations_gap':
      return r.operations_score != null
        ? [{ label: 'Operations Health', value: fmtScore(r.operations_score) || '—', unit: '' }]
        : null;
    case 'recast_ebitda':
      return (r.recast_ebitda != null || r.recast_add_backs != null)
        ? [
            ...(r.recast_ebitda != null ? [{ label: 'Recast EBITDA', value: fmt(r.recast_ebitda) || '—', unit: '/yr' }] : []),
            ...(r.recast_add_backs != null ? [{ label: 'Add-Backs', value: fmt(r.recast_add_backs) || '—', unit: '/yr' }] : []),
            ...(r.recast_valuation_increase ? [{ label: 'Value Increase', value: fmt(r.recast_valuation_increase) || '—', unit: '' }] : []),
          ]
        : null;
    case 'freedom':
      return r.freedom_score != null
        ? [{ label: 'Freedom Score', value: fmtScore(r.freedom_score) || '—', unit: '' }]
        : null;
    default:
      return null;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function FocusStageCard({ step, bis }) {
  const { accent, icon, bg } = TOPIC_COLORS[step.id] || DEFAULT_COLOR;
  const metrics = extractMetrics(step.id, bis);
  // Distinguish LOADING (contract not yet embedded) from NOT_ASSESSED (contract loaded, not completed)
  const contractLoaded = !!(bis?._sources?.assessmentSummary?.intelligence_contract?.assessment_completion_count != null);
  const isLoading = !step.hasData && !contractLoaded;

  return (
    <motion.div
      className="rounded-2xl overflow-hidden w-full"
      style={{
        background: bg,
        border: `1px solid ${accent}28`,
        boxShadow: `0 0 40px 0 ${accent}12, 0 8px 32px rgba(0,0,0,0.4)`,
      }}
      initial={{ opacity: 0, scale: 0.97, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
    >
      {/* Gold top accent line */}
      <div className="h-px w-full" style={{ background: `linear-gradient(to right, transparent, ${accent}50, transparent)` }} />

      <div className="px-6 py-5">
        {/* Header row */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg" style={{ color: accent }}>{icon}</span>
          <span className="text-[11px] uppercase tracking-[0.2em] font-semibold" style={{ color: accent }}>
            {step.title}
          </span>
          {!step.hasData && (
            <span className="ml-auto text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full"
              style={{
                background: isLoading ? 'rgba(212,168,83,0.08)' : 'rgba(255,255,255,0.05)',
                color: isLoading ? 'rgba(212,168,83,0.7)' : 'rgba(255,255,255,0.5)',
                border: isLoading ? '1px solid rgba(212,168,83,0.15)' : '1px solid rgba(255,255,255,0.1)',
              }}>
              {isLoading ? 'Loading…' : 'Not assessed'}
            </span>
          )}
        </div>

        {/* Headline */}
        <p className="text-[15px] font-semibold leading-snug mb-4" style={{ color: '#F0F0F0' }}>
          {step.headline}
        </p>

        {/* Metrics grid */}
        {metrics ? (
          <div className={`grid gap-3 ${metrics.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {metrics.map((m, i) => (
              <div key={i} className="rounded-xl px-4 py-3"
                style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  {m.label}
                </p>
                <p className="text-xl font-display font-bold" style={{ color: accent }}>
                  {m.value}
                  {m.unit && <span className="text-sm font-normal ml-1" style={{ color: `${accent}80` }}>{m.unit}</span>}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl px-4 py-3"
            style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.04)' }}>
            <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.55)' }}>
              {isLoading ? 'Loading your intelligence…' : 'Complete this assessment to see your data.'}
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}