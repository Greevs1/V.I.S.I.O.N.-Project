/**
 * PreliminaryBusinessModel — the first value moment.
 *
 * After 3–5 questions, Galileo stops asking and gives something back: a
 * preliminary Business Model with the Business Pulse emerging. Every value is
 * qualified (estimated / modeled / computed / learning). No definitive claims
 * when evidence is incomplete.
 */

import React from 'react';
import { motion } from 'framer-motion';
import BusinessPulse, { IntelligenceBadge } from './BusinessPulse';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

const fmt = (n) => {
  if (n == null || isNaN(n)) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
};

export default function PreliminaryBusinessModel({ model, onContinue }) {
  const value = model?.businessModel;
  const valueRange = value?.valueRange;
  const hasValue = valueRange && valueRange[0] != null;

  return (
    <div className="flex flex-col max-w-2xl mx-auto px-6 pt-4 w-full">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Galileo line */}
        <p className="text-base text-white/55 font-light italic mb-6 text-center">
          "That's enough for me to start. Here's what I see so far."
        </p>

        {/* Business Model card */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 md:p-8 space-y-6">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-semibold">
              Your Business
            </span>
            <IntelligenceBadge completeness={model?.completeness} />
          </div>

          {/* Estimated value */}
          <div className="text-center py-2">
            <p className="text-[11px] uppercase tracking-wider text-white/40 mb-2">
              Estimated Business Value
            </p>
            {hasValue ? (
              <p className="text-4xl md:text-5xl font-display font-bold text-white">
                {fmt(valueRange[0])}
                <span className="text-white/30 text-2xl font-normal"> – </span>
                {fmt(valueRange[1])}
              </p>
            ) : (
              <p className="text-2xl text-white/40 italic">Tell me your EBITDA to estimate value</p>
            )}
            {hasValue && (
              <p className="text-xs text-white/40 mt-2">
                Modeled from your EBITDA × an industry-typical multiple range
              </p>
            )}
          </div>

          {/* Business Pulse */}
          <div className="pt-2">
            <BusinessPulse model={model} />
          </div>
        </div>

        {/* Galileo explanation */}
        <div className="mt-6 space-y-3">
          <p className="text-sm text-white/60 leading-relaxed text-center">
            I've built a preliminary model from what you've told me. I'm still making several
            assumptions, but I already see a few areas worth investigating.
          </p>
          <p className="text-xs text-white/35 text-center">
            Values marked <span className="text-white/55">modeled</span> or{' '}
            <span className="text-white/55">estimated</span> are preliminary — they'll sharpen as I
            learn more. <span className="text-white/55">Learning…</span> means I don't have enough
            information yet.
          </p>
        </div>

        {/* Continue */}
        <div className="flex justify-center mt-8">
          <Button
            onClick={onContinue}
            className="h-12 px-6 bg-[#D4A853] text-black font-medium hover:bg-[#D4A853]/90"
          >
            Show me what you found <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </motion.div>
    </div>
  );
}