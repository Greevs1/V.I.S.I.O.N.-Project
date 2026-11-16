/**
 * GalileoPageGuide
 *
 * Self-contained Galileo guidance component for logged-in assessment pages.
 * Auto-appears on mount. Stays visible 20 seconds then fades to "Review Guidance".
 * Fixed bottom-right — never covers inputs or primary buttons.
 *
 * Props:
 *   message    - coaching message string
 *   pageKey    - unique string used to avoid re-showing on same session revisit (optional)
 */
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X } from 'lucide-react';

export default function GalileoPageGuide({ message, pageKey }) {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Show guide on mount AND when message changes (new page/step)
    setDismissed(false);
    const show = setTimeout(() => setVisible(true), 400);
    return () => clearTimeout(show);
  }, [message, pageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReplay = () => {
    setDismissed(false);
    setVisible(true);
  };

  const handleDismiss = () => {
    setVisible(false);
    setDismissed(true);
  };

  if (!message) return null;

  return (
    <div className="fixed bottom-20 right-4 z-40 max-w-xs w-full pointer-events-none">
      <AnimatePresence mode="wait">
        {visible && (
          <motion.div
            key="guide-bubble"
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            className="pointer-events-auto rounded-xl px-4 py-4 shadow-2xl shadow-black/60"
            style={{
              background: 'rgba(13,13,13,0.96)',
              border: '1px solid rgba(212,168,83,0.25)',
              backdropFilter: 'blur(16px)',
            }}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#D4A853]/70 shrink-0" />
                <p className="text-[10px] tracking-[0.18em] uppercase text-[#D4A853]/60 font-medium">Galileo</p>
              </div>
              <button
                type="button"
                onClick={handleDismiss}
                className="text-white/25 hover:text-white/60 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-xs text-white/75 leading-relaxed font-light">{message}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Review Guidance pill — shown when faded but not permanently dismissed */}
      {!visible && !dismissed && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="pointer-events-auto flex justify-end pr-1"
        >
          <button
            type="button"
            onClick={handleReplay}
            className="inline-flex items-center gap-1.5 text-[10px] tracking-[0.12em] uppercase text-[#D4A853]/40 hover:text-[#D4A853]/70 transition-colors py-1"
          >
            <Sparkles className="w-3 h-3" />
            Galileo · Review Guidance
          </button>
        </motion.div>
      )}
    </div>
  );
}