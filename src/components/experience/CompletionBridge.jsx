/**
 * Completion Bridge
 * 
 * Renders between section completion and the next section.
 * Sequence:
 *   1. ✓ completion mark fades in (300ms)
 *   2. Galileo closing message fades in (800ms)
 *   3. Bridge text fades in (400ms)
 *   4. onComplete fires after totalDuration
 * 
 * Used by GuidedAssessmentScene after each section completes.
 */

import React, { useEffect } from 'react';
import { motion } from 'framer-motion';

export default function CompletionBridge({ closingMessage, bridgeText, onComplete, duration = 3200 }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete?.();
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onComplete]);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center px-8 text-center space-y-6">
      {/* Completion check */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="w-8 h-8 rounded-full border border-[#D4A853]/60 flex items-center justify-center"
      >
        <span className="text-[#D4A853] text-sm">✓</span>
      </motion.div>

      {/* Galileo closing message */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.8 }}
        className="text-xl font-light text-white/90 leading-relaxed max-w-md"
      >
        {closingMessage}
      </motion.p>

      {/* Bridge text */}
      {bridgeText && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4, duration: 0.6 }}
          className="text-sm text-white/35 tracking-wide italic"
        >
          {bridgeText}
        </motion.p>
      )}
    </div>
  );
}