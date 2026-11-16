/**
 * ProfitBenchmark — compact visual benchmark track.
 *
 * Instead of three equal columns in a large box, a restrained horizontal
 * layout that clearly distinguishes user-reported, modeled, and
 * document-supported data.
 *
 *   YOUR PROFITABILITY
 *
 *   You             8.0%
 *   Typical         6–10%
 *   Best-in-class   14%+
 *
 * Source accessible through a small "Why this benchmark?" interaction.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';

const STATUS_LABELS = {
  computed: 'User Reported',
  verified: 'User Reported',
  document_supported: 'Document Supported',
  modeled: 'Modeled',
};

export default function ProfitBenchmark({ signal, updated }) {
  const [showWhy, setShowWhy] = useState(false);
  const bench = signal?.benchmark;
  if (!bench) return null;

  const statusLabel = STATUS_LABELS[signal.status] || 'Estimated';
  const userMargin = signal.margin;
  const hasBenchmark = bench.typicalLow != null && bench.typicalHigh != null;

  // Build a 0-100% scale for the visual track
  const scaleMax = Math.max(bench.bestInClass || 0, userMargin || 0, bench.typicalHigh || 0) * 1.2;
  const toPct = (v) => scaleMax > 0 ? Math.min((v / scaleMax) * 100, 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="py-4 space-y-3"
    >
      {/* Label */}
      <div className="flex items-center gap-2">
        <p className="text-[11px] uppercase tracking-[0.2em] text-white/40 font-medium">
          Your Profitability
        </p>
        {updated && <span className="text-[10px] text-emerald-400/60">Updated</span>}
      </div>

      {/* Compact rows */}
      <div className="space-y-2">
        {/* User */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/45 w-20 shrink-0">You</span>
          <div className="flex-1 h-1 bg-white/[0.04] rounded-full overflow-hidden relative">
            {userMargin != null && (
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${toPct(userMargin)}%` }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="h-full bg-[#D4A853] rounded-full"
              />
            )}
          </div>
          <span className="text-sm font-medium text-white/85 w-12 text-right">{userMargin != null ? `${userMargin}%` : '—'}</span>
        </div>

        {/* Typical */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/45 w-20 shrink-0">Typical</span>
          <div className="flex-1 h-1 bg-white/[0.04] rounded-full overflow-hidden relative">
            {hasBenchmark && (
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${toPct(bench.typicalHigh)}%`, x: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="h-full bg-white/20 rounded-full absolute"
                style={{ left: `${toPct(bench.typicalLow)}%`, width: `${toPct(bench.typicalHigh) - toPct(bench.typicalLow)}%` }}
              />
            )}
          </div>
          <span className="text-sm text-white/55 w-12 text-right">{bench.typicalRange || '—'}</span>
        </div>

        {/* Best-in-class */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/45 w-20 shrink-0">Best-in-class</span>
          <div className="flex-1 h-1 bg-white/[0.04] rounded-full overflow-hidden relative">
            {bench.bestInClass != null && (
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${toPct(bench.bestInClass)}%` }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="h-full bg-cyan-400/50 rounded-full"
              />
            )}
          </div>
          <span className="text-sm text-cyan-400/70 w-12 text-right">{bench.bestInClass != null ? `${bench.bestInClass}%+` : '—'}</span>
        </div>
      </div>

      {/* Status + potential */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-[10px] text-white/35">{statusLabel}</span>
        {bench.potentialGap != null && bench.potentialGap > 0 && (
          <span className="text-[11px] text-white/50">
            {bench.potentialGap} margin points available
            {signal.gap != null && <> · <span className="text-[#D4A853]">{fmt(signal.gap)}/yr</span></>}
          </span>
        )}
      </div>

      {/* Why this benchmark */}
      <button
        onClick={() => setShowWhy((s) => !s)}
        className="flex items-center gap-1 text-[11px] text-white/35 hover:text-white/60 transition-colors"
      >
        {showWhy ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {showWhy ? 'Hide benchmark source' : 'Why this benchmark?'}
      </button>
      <AnimatePresence>
        {showWhy && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="text-[11px] text-white/40 leading-relaxed space-y-1"
          >
            <p><span className="text-white/55">Industry:</span> {bench.normalizedIndustry || '—'}</p>
            <p><span className="text-white/55">Sources:</span> {bench.sources}</p>
            <p><span className="text-white/55">Confidence:</span> {bench.confidence}</p>
            {bench.notes && <p><span className="text-white/55">Notes:</span> {bench.notes}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

const fmt = (n) => {
  if (n == null || isNaN(n)) return null;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
};