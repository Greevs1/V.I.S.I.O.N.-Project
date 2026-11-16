/**
 * IntentSelector — "What would be most valuable right now?"
 *
 * A human question. Discovery-oriented intents map toward Creator;
 * implementation-oriented intents map toward Producer. The user never sees
 * that terminology in Phase 1.
 */

import React from 'react';
import { motion } from 'framer-motion';

export default function IntentSelector({ options, onSelect }) {
  const entries = Object.entries(options);
  return (
    <div className="flex flex-col items-center max-w-xl mx-auto px-6 pt-8">
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-2xl md:text-3xl font-display font-bold text-white tracking-tight text-center"
      >
        What would be most valuable right now?
      </motion.p>
      <p className="text-sm text-white/45 mt-2 mb-8 text-center">
        There's no wrong answer — I'll meet you wherever you are.
      </p>

      <div className="flex flex-col gap-2 w-full">
        {entries.map(([key, label], i) => (
          <motion.button
            key={key}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            onClick={() => onSelect(key)}
            className="w-full text-left px-5 py-3.5 rounded-xl border border-white/10 bg-white/[0.02] text-sm text-white/75 hover:border-[#D4A853]/40 hover:text-white hover:bg-[#D4A853]/[0.04] transition-all"
          >
            {label}
          </motion.button>
        ))}
      </div>
    </div>
  );
}