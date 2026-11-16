/**
 * GalileoCoach
 *
 * Animated Galileo advisor message that slides in beside an assessment question.
 * Auto-fades after `autoFadeDuration` ms. A persistent replay button remains.
 *
 * Props:
 *   message        - string: the coaching message
 *   fieldKey       - string: used to save to transcript
 *   autoFadeDuration - ms (default 5000)
 *   onShown        - called when message appears (for transcript)
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { addToTranscript } from '@/lib/journeyTranscript';

export default function GalileoCoach({
  message,
  fieldKey,
  autoFadeDuration = 20000,
  className = '',
}) {
  const [visible, setVisible] = useState(true);
  const savedRef = useRef(false);

  // Save to transcript once per mount
  useEffect(() => {
    if (!savedRef.current && message && fieldKey) {
      savedRef.current = true;
      addToTranscript({ fieldKey, message });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset to visible when message changes (new step brings new guidance)
  useEffect(() => {
    setVisible(true);
  }, [message]);

  const handleDismiss = () => setVisible(false);
  const handleReplay = () => setVisible(true);

  if (!message) return null;

  return (
    <div className={`space-y-2 ${className}`}>
      <AnimatePresence mode="wait">
        {visible && (
          <motion.div
            key="coach-message"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
            className="flex items-start gap-3 rounded-xl px-4 py-3.5"
            style={{
              background: 'rgba(212,168,83,0.06)',
              border: '1px solid rgba(212,168,83,0.18)',
            }}
          >
            <div className="shrink-0 mt-0.5">
              <Sparkles className="w-4 h-4 text-[#D4A853]/70" />
            </div>
            <p className="text-sm text-white/80 leading-relaxed font-light flex-1">{message}</p>
            <button
              onClick={handleDismiss}
              className="shrink-0 ml-2 text-white/30 hover:text-white/60 transition-colors text-xs"
              aria-label="Dismiss guidance"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Persistent replay pill — always visible after first show */}
      {!visible && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          type="button"
          onClick={handleReplay}
          className="inline-flex items-center gap-1.5 text-[10px] tracking-[0.12em] uppercase text-[#D4A853]/40 hover:text-[#D4A853]/70 transition-colors py-1"
        >
          <Sparkles className="w-3 h-3" />
          Galileo · Review Guidance
        </motion.button>
      )}
    </div>
  );
}