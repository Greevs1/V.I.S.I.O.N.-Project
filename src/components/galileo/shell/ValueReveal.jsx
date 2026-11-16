/**
 * ValueReveal — the signature Galileo value reveal moment.
 *
 * The number is the hero. No card border. Just typography on the canvas.
 *
 *   ESTIMATED BUSINESS VALUE
 *   $3.8M – $4.6M
 *   Based on what I know so far
 *
 *   Potential Galileo sees:
 *   +$1.2M
 *   worth investigating
 *
 *   [How I calculated this] [Improve confidence]
 *
 * Subtle entrance animation — premium and restrained, not flashy.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, FileText, TrendingUp } from 'lucide-react';

const fmt = (n) => {
  if (n == null || isNaN(n)) return null;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
};

const STATUS_LABELS = {
  computed: 'Modeled',
  verified: 'Document Supported',
  document_supported: 'Document Supported',
  modeled: 'Modeled',
};

export default function ValueReveal({ signal, updated, onImproveConfidence }) {
  const [showHow, setShowHow] = useState(false);
  if (!signal) return null;

  const statusLabel = STATUS_LABELS[signal.status] || 'Modeled';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="py-6 text-center space-y-3"
    >
      {/* Label */}
      <p className="text-[11px] uppercase tracking-[0.2em] text-white/40 font-medium">
        {updated ? "Updated Business Value" : "Estimated Business Value"}
      </p>

      {/* Hero number */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <p className="text-4xl md:text-5xl font-display font-bold text-white tracking-tight">
          {fmt(signal.current)}{signal.potential != null && signal.potential !== signal.current && (
            <> <span className="text-white/30 font-normal">–</span> {fmt(signal.potential)}</>
          )}
        </p>
      </motion.div>

      {/* Subtitle */}
      <p className="text-sm text-white/45">
        Based on what I know so far
        <span className="text-white/25 mx-1.5">·</span>
        <span className="text-white/35">{statusLabel}</span>
      </p>

      {/* Potential */}
      {signal.gap > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="pt-2"
        >
          <p className="text-xs text-white/40 mb-1">Potential Galileo sees</p>
          <p className="text-2xl font-display font-semibold text-[#D4A853]">
            +{fmt(signal.gap)}
          </p>
          <p className="text-xs text-white/35 mt-0.5">worth investigating</p>
        </motion.div>
      )}

      {/* Subtle actions */}
      <div className="flex items-center justify-center gap-4 pt-3">
        <button
          onClick={() => setShowHow((s) => !s)}
          className="flex items-center gap-1 text-[11px] text-white/40 hover:text-white/70 transition-colors"
        >
          {showHow ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {showHow ? 'Hide' : 'How I calculated this'}
        </button>
        {onImproveConfidence && (
          <button
            onClick={onImproveConfidence}
            className="flex items-center gap-1 text-[11px] text-white/40 hover:text-white/70 transition-colors"
          >
            <FileText className="w-3 h-3" />
            Improve confidence
          </button>
        )}
      </div>

      <AnimatePresence>
        {showHow && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="text-[11px] text-white/40 leading-relaxed space-y-1 pt-2 max-w-sm mx-auto text-left"
          >
            <p><span className="text-white/55">Source:</span> {signal.source}</p>
            {signal.period && <p><span className="text-white/55">Period:</span> {signal.period}</p>}
            <p><span className="text-white/55">Method:</span> EBITDA × valuation multiple range (industry-typical)</p>
            <p className="text-white/30 mt-1.5">The multiple is modeled, not from actual comparables. Real multiple evidence would refine this further.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}