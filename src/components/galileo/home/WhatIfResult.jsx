/**
 * WhatIfResult — the scenario result.
 *
 * Answers, in order:
 *   WHAT CHANGES?  NOW → WHAT IF
 *   WHAT DOES IT COST? / CREATE?   the estimated rows
 *   WHY?           Galileo's read
 *   WHAT DID IT ASSUME?            assumptions, with their basis
 *   WHAT DOES IT NOT KNOW?         missing
 *
 * Every figure shown here came from the engine's model output. Nothing is
 * recomputed and nothing is embellished. Scenario figures are MODELLED and are
 * labelled as such wherever they appear.
 */

import React, { useState } from 'react';
import ExplainableText from '@/components/galileo/explain/ExplainableText';
import { motion } from 'framer-motion';
import { ChevronDown, Info, TriangleAlert } from 'lucide-react';

const CONFIDENCE_STYLE = {
  high: 'text-emerald-300/80 border-emerald-400/25',
  medium: 'text-vision-champagne border-vision-gold/25',
  low: 'text-white/50 border-white/12',
};

export default function WhatIfResult({ scenario }) {
  const [showAssumptions, setShowAssumptions] = useState(false);
  if (!scenario || scenario.status !== 'computed') return null;

  const confidence = CONFIDENCE_STYLE[scenario.confidence] || CONFIDENCE_STYLE.low;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
      className="space-y-5 rounded-2xl vision-glass-raised vision-sheen p-5 md:p-6"
    >
      {/* ── Header ── */}
      <div className="space-y-1.5">
        <p className="text-[10px] uppercase tracking-[0.18em] text-vision-champagne/70">
          What if
        </p>
        <h3 className="font-display text-[21px] leading-snug text-white/90 md:text-[24px]">
          {scenario.scenario_title}
        </h3>
        {scenario.question && (
          <p className="text-[11.5px] text-white/35">You asked: {scenario.question}</p>
        )}
      </div>

      {/* ── NOW → WHAT IF ── */}
      {scenario.comparison?.length > 0 && (
        <div className="space-y-2">
          <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-3 border-b border-white/[0.07] pb-2">
            <span className="text-[10px] uppercase tracking-wider text-white/30" />
            <span className="text-[10px] uppercase tracking-wider text-white/30">Now</span>
            <span className="text-[10px] uppercase tracking-wider text-vision-champagne/60">
              What if
            </span>
          </div>

          {scenario.comparison.map((row) => (
            <div key={row.metric} className="space-y-1">
              <div className="grid grid-cols-[1.4fr_1fr_1fr] items-baseline gap-3">
                <span className="text-[12.5px] text-white/70">
                  {/* The engine's own metric label. A term the glossary knows gets
                      an explanation; anything else renders exactly as returned. */}
                  <ExplainableText text={row.metric} surface="whatif" />
                </span>
                <span className="text-[13px] text-white/50">{row.now ?? '—'}</span>
                <span className="text-[13.5px] font-medium text-white/90">
                  {row.what_if ?? '—'}
                </span>
              </div>
              {row.derivation && (
                <p className="text-[10.5px] leading-relaxed text-white/30">{row.derivation}</p>
              )}
            </div>
          ))}

          <p className="pt-1 text-[10.5px] text-white/30">
            Modelled on your {scenario.earnings_basis_label?.toLowerCase()}. Scenario figures are
            hypothetical and are not changes to your business data.
          </p>
        </div>
      )}

      {/* ── Galileo's read ── */}
      {scenario.galileo_read && (
        <div className="space-y-2 border-t border-white/[0.07] pt-4">
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/30">Galileo's read</p>
          <p className="font-display text-[15px] leading-relaxed text-white/80">
            {scenario.galileo_read}
          </p>
        </div>
      )}

      {/* ── What it assumed ── */}
      {(scenario.assumed?.length > 0 ||
        scenario.estimated?.length > 0 ||
        scenario.missing?.length > 0) && (
        <div className="space-y-2.5 border-t border-white/[0.07] pt-4">
          <button
            type="button"
            onClick={() => setShowAssumptions((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-white/50 transition-colors hover:text-white/80 vision-focus"
          >
            <ChevronDown
              className={`h-3 w-3 transition-transform duration-200 ${
                showAssumptions ? 'rotate-180' : ''
              }`}
            />
            {showAssumptions ? 'Hide' : 'See'} what Galileo knew, assumed and still needs
          </button>

          {showAssumptions && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-3 overflow-hidden pt-1"
            >
              <ClassBlock
                title="Known"
                tone="text-emerald-300/70"
                items={(scenario.known || []).map((k) => `${k.label}: ${k.value}`)}
              />
              <ClassBlock
                title="Assumed"
                tone="text-vision-champagne/70"
                items={(scenario.assumed || []).map((a) => `${a.label}: ${a.value} — ${a.basis}`)}
              />
              <ClassBlock
                title="Estimated"
                tone="text-white/55"
                items={(scenario.estimated || []).map((e) => `${e.label}: ${e.value} — ${e.note}`)}
              />
              <ClassBlock
                title="Missing"
                tone="text-white/45"
                items={(scenario.missing || []).map((m) => `${m.label} — ${m.why}`)}
              />
            </motion.div>
          )}
        </div>
      )}

      {/* ── Confidence, stated with its reason ── */}
      <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.07] pt-3.5">
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${confidence}`}
        >
          {scenario.confidence} confidence
        </span>
        <span className="text-[11px] leading-relaxed text-white/40">
          {scenario.confidence_reason}
        </span>
      </div>

      {/* ── What the model deliberately did not claim ── */}
      {scenario.warnings?.length > 0 && (
        <div className="space-y-1.5 rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
          {scenario.warnings.map((w) => (
            <p key={w} className="flex items-start gap-2 text-[11px] leading-relaxed text-white/45">
              <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0 text-vision-champagne/60" />
              {w}
            </p>
          ))}
        </div>
      )}

      {scenario.value_model && !scenario.value_model.available && scenario.value_model.reason && (
        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-white/40">
          <Info className="mt-0.5 h-3 w-3 shrink-0 text-white/30" />
          {scenario.value_model.reason}
        </p>
      )}
    </motion.div>
  );
}

function ClassBlock({ title, tone, items }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className={`text-[10px] uppercase tracking-wider ${tone}`}>{title}</p>
      {items.map((item) => (
        <p key={item} className="text-[11.5px] leading-relaxed text-white/50">
          {item}
        </p>
      ))}
    </div>
  );
}