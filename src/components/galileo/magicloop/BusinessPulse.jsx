/**
 * BusinessPulse — the six primary business signals.
 *
 * Each signal surfaces the most meaningful current value Galileo knows, or a
 * "Learning..." state when data isn't available yet. No arbitrary scores.
 * Values come from the preliminary model (existing calculation logic).
 */

import React from 'react';
import { motion } from 'framer-motion';
import { formatSignalValue, COMPLETENESS_LABELS } from '@/lib/galileo/preliminaryModel';

const SIGNALS = [
  { key: 'cash', label: 'Cash', icon: '💧' },
  { key: 'tax', label: 'Tax', icon: '🧾' },
  { key: 'profit', label: 'Profit', icon: '📈' },
  { key: 'operations', label: 'Operations', icon: '⚙' },
  { key: 'value', label: 'Value', icon: '◆' },
  { key: 'freedom', label: 'Freedom', icon: '✦' },
];

export default function BusinessPulse({ model, compact = false }) {
  const signals = model?.signals || {};

  return (
    <div className={`grid grid-cols-3 md:grid-cols-6 gap-2 ${compact ? '' : 'md:gap-3'}`}>
      {SIGNALS.map((sig, i) => {
        const formatted = formatSignalValue(sig.key, signals[sig.key]);
        const isLearning = !formatted;
        return (
          <motion.div
            key={sig.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.3 }}
            className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 flex flex-col gap-0.5 min-w-0"
          >
            <span className="text-[10px] uppercase tracking-[0.12em] text-white/40 font-medium flex items-center gap-1">
              <span className="text-white/30 text-[11px]">{sig.icon}</span>
              {sig.label}
            </span>
            {isLearning ? (
              <span className="text-[12px] text-white/35 italic">Learning…</span>
            ) : (
              <>
                <span className="text-[13px] font-medium text-white/85 truncate" title={formatted.primary}>
                  {formatted.primary}
                </span>
                {formatted.secondary && (
                  <span className="text-[10px] text-white/45 truncate">{formatted.secondary}</span>
                )}
              </>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

export function IntelligenceBadge({ completeness }) {
  const label = COMPLETENESS_LABELS[completeness] || 'Early';
  const dotColor = {
    EARLY: 'bg-white/40',
    DEVELOPING: 'bg-[#D4A853]/70',
    CONNECTED: 'bg-[#D4A853]',
    STRONG: 'bg-emerald-400',
  }[completeness] || 'bg-white/40';

  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-white/55">
      <span className="text-[10px] uppercase tracking-wider text-white/40">Business Intelligence</span>
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      <span className="font-medium text-white/75">{label}</span>
    </span>
  );
}