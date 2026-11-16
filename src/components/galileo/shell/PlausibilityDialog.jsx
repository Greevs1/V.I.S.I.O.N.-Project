/**
 * PlausibilityDialog — inline plausibility check clarification.
 *
 * When Galileo detects a material anomaly in user-entered data, it surfaces
 * a conversational clarification moment — not an error message.
 *
 * The user can:
 *   - Confirm the value is correct (stored so Galileo doesn't re-challenge)
 *   - Get help estimating
 *   - Re-enter the number
 *
 * Never rejects unusual data. Never silently changes user data.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { AlertCircle } from 'lucide-react';

export default function PlausibilityDialog({ check, onRespond }) {
  if (!check || check.ok) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* Galileo's conversational observation */}
      <div className="flex items-start gap-2.5">
        <AlertCircle className="w-4 h-4 text-[#D4A853]/60 mt-0.5 shrink-0" />
        <p className="text-sm text-white/70 leading-relaxed">{check.message}</p>
      </div>

      {/* Clarification actions */}
      <div className="flex flex-col gap-2 max-w-md mx-auto">
        {check.suggestions?.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onRespond(opt.value)}
            className="w-full text-left px-4 py-3 rounded-xl border border-white/10 bg-white/[0.02] hover:border-[#D4A853]/30 hover:bg-[#D4A853]/[0.03] transition-all"
          >
            <span className="block text-sm font-medium text-white/85">{opt.label}</span>
            {opt.desc && <span className="block text-xs text-white/40 mt-0.5">{opt.desc}</span>}
          </button>
        ))}
      </div>
    </motion.div>
  );
}