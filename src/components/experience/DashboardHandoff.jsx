/**
 * DashboardHandoff
 *
 * Full-screen animated "Building your Business Intelligence Model..." screen
 * shown between AccountPromotion completion and dashboard redirect.
 *
 * Animate each model line in sequence, then call onComplete.
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';

const MODELS = [
  'Financial Model',
  'Value Model',
  'Tax Model',
  'Cash Flow Model',
  'Freedom Model',
  'Sprint Plan',
  'Opportunity Engine',
  'Advisor Context',
];

const ITEM_DELAY = 420; // ms between each item appearing
const HOLD_AFTER = 800; // ms after last item before completing

export default function DashboardHandoff({ onComplete }) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const advance = (i) => {
      if (cancelled) return;
      if (i <= MODELS.length) {
        setVisibleCount(i);
        setTimeout(() => advance(i + 1), ITEM_DELAY);
      } else {
        setTimeout(() => {
          if (!cancelled) {
            setDone(true);
            setTimeout(() => { if (!cancelled) onComplete?.(); }, 600);
          }
        }, HOLD_AFTER);
      }
    };

    // Small initial delay so the screen has time to mount
    const init = setTimeout(() => advance(1), 400);
    return () => { cancelled = true; clearTimeout(init); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: done ? 0 : 1 }}
      transition={{ duration: 0.6 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black px-8"
    >
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex items-center gap-3 mb-10"
      >
        <Sparkles className="w-5 h-5 text-[#D4A853]/60" />
        <p className="text-white/60 text-lg font-light tracking-wide">
          Building your Business Intelligence Model...
        </p>
      </motion.div>

      {/* Model list */}
      <div className="space-y-3 min-w-[260px]">
        <AnimatePresence>
          {MODELS.slice(0, visibleCount).map((model, i) => (
            <motion.div
              key={model}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
              className="flex items-center gap-3"
            >
              <span className="text-[#D4A853] text-sm font-medium w-4">✓</span>
              <span className="text-white/75 text-sm font-light">{model}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}