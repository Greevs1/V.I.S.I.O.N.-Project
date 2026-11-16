/**
 * NowSurface — one subtle contextual item beneath the top bar.
 *
 * Only appears when something genuinely deserves attention.
 * One item at a time. No carousel. No notification clutter.
 * If nothing deserves attention, show nothing.
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function NowSurface({ item, onAction }) {
  return (
    <AnimatePresence>
      {item && (
        <motion.div
          initial={{ opacity: 0, y: -8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: -8, height: 0 }}
          transition={{ duration: 0.3 }}
          className="shrink-0 overflow-hidden"
        >
          <div className="max-w-[860px] mx-auto px-4 md:px-8">
            <button
              onClick={() => item.actionValue && onAction?.(item.actionValue)}
              disabled={!item.actionValue}
              className={`w-full flex items-center gap-2.5 px-4 py-2 rounded-xl border border-[#D4A853]/15 bg-[#D4A853]/[0.03] ${
                item.actionValue ? 'hover:bg-[#D4A853]/[0.06] hover:border-[#D4A853]/25 cursor-pointer' : 'cursor-default'
              } transition-all`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#D4A853] shrink-0" />
              <span className="text-[12px] text-white/65 flex-1 text-left">
                {item.message}
              </span>
              {item.actionLabel && (
                <span className="text-[11px] text-[#D4A853] font-medium shrink-0">
                  {item.actionLabel} →
                </span>
              )}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}