/**
 * CuriosityGap — 1–3 areas worth investigating, then "Want me to dig deeper?"
 *
 * Opportunities come from the preliminary model (existing logic). No invented
 * opportunities. The transition into deeper discovery is a natural question,
 * not a hard sell.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';

export default function CuriosityGap({ opportunities, onInvestigate, onSkip }) {
  if (!opportunities || opportunities.length === 0) {
    return (
      <div className="flex flex-col items-center max-w-xl mx-auto px-6 pt-6 text-center">
        <p className="text-base text-white/55 leading-relaxed">
          I don't have enough yet to point at a specific opportunity — but connect your financials
          and I'll find something worth your time.
        </p>
        <Button
          onClick={onInvestigate}
          className="mt-6 h-12 px-6 bg-[#D4A853] text-black hover:bg-[#D4A853]/90"
        >
          Connect my business
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col max-w-2xl mx-auto px-6 pt-4 w-full">
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-base text-white/55 font-light italic mb-6 text-center"
      >
        "I already see a few areas worth investigating."
      </motion.p>

      <div className="space-y-3">
        {opportunities.slice(0, 3).map((opp, i) => (
          <motion.div
            key={opp.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="rounded-xl border border-white/10 bg-white/[0.02] p-5"
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#D4A853]/10 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="w-4 h-4 text-[#D4A853]" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-white">{opp.title}</p>
                <p className="text-[13px] text-white/55 mt-1 leading-relaxed">{opp.summary}</p>
                {opp.potentialValueImpact > 0 && (
                  <p className="text-xs text-[#D4A853]/80 mt-2">
                    Potential value impact: ~${(opp.potentialValueImpact / 1000).toFixed(0)}K
                    <span className="text-white/30 ml-1">(modeled)</span>
                  </p>
                )}
                <p className="text-[11px] text-white/40 mt-1.5">
                  Confidence: {opp.confidence}
                </p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="flex flex-col items-center mt-8 gap-3">
        <p className="text-sm text-white/60 text-center">Want me to dig deeper?</p>
        <Button
          onClick={onInvestigate}
          className="h-12 px-6 bg-[#D4A853] text-black font-medium hover:bg-[#D4A853]/90"
        >
          Yes, investigate
        </Button>
        <button onClick={onSkip} className="text-xs text-white/40 hover:text-white/70 mt-1">
          Continue with my estimates
        </button>
      </div>
    </div>
  );
}