/**
 * StrategyExplorer — lightweight Creator behavior.
 *
 * Explores potential strategies for the selected opportunity. Not the full
 * Scenario architecture — just enough to demonstrate:
 *   OPPORTUNITY → POSSIBLE STRATEGY → DECISION
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Check, ArrowRight } from 'lucide-react';

export default function StrategyExplorer({ opportunity, onChoose, onBack }) {
  const [selected, setSelected] = useState(null);
  const strategies = opportunity?.strategies || [];

  return (
    <div className="flex flex-col max-w-2xl mx-auto px-6 pt-4 w-full">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <p className="text-[11px] uppercase tracking-[0.2em] text-white/40 font-semibold mb-2">
          Opportunity — {opportunity?.title}
        </p>
        <h2 className="text-xl md:text-2xl font-display font-bold text-white mb-2">
          Here are a few ways we could approach it.
        </h2>
        <p className="text-sm text-white/50 mb-6">
          Pick the one that feels right. We can model it more deeply later.
        </p>

        <div className="space-y-2.5">
          {strategies.map((s, i) => (
            <motion.button
              key={s}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => setSelected(s)}
              className={`w-full text-left px-5 py-4 rounded-xl border transition-all flex items-center justify-between ${
                selected === s
                  ? 'border-[#D4A853]/50 bg-[#D4A853]/[0.06]'
                  : 'border-white/10 bg-white/[0.02] hover:border-white/20'
              }`}
            >
              <span className={`text-sm ${selected === s ? 'text-white' : 'text-white/75'}`}>{s}</span>
              {selected === s && (
                <span className="w-5 h-5 rounded-full bg-[#D4A853] flex items-center justify-center">
                  <Check className="w-3 h-3 text-black" />
                </span>
              )}
            </motion.button>
          ))}
        </div>

        <div className="flex justify-between mt-8">
          <Button onClick={onBack} variant="ghost" className="text-white/50 hover:text-white">
            Back
          </Button>
          <Button
            onClick={() => onChoose(selected)}
            disabled={!selected}
            className="h-11 px-5 bg-[#D4A853] text-black hover:bg-[#D4A853]/90"
          >
            How do I move forward? <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </motion.div>
    </div>
  );
}