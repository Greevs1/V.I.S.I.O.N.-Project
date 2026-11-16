/**
 * ExtractionStatusCard
 *
 * Compact async status indicator shown while Galileo reads uploaded documents.
 * Cycles through status messages. Fades out when done.
 *
 * Props:
 *   loading  - bool: true while extraction is running
 *   found    - number: how many values found so far
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';

const READING_STEPS = [
  'Reading Financial Statements...',
  'Finding Revenue...',
  'Analyzing Payroll...',
  'Calculating EBITDA...',
  'Scanning Tax Documents...',
  'Identifying Add-backs...',
];

export default function ExtractionStatusCard({ loading, found = 0 }) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => {
      setStepIndex((prev) => (prev + 1) % READING_STEPS.length);
    }, 1400);
    return () => clearInterval(id);
  }, [loading]);

  if (!loading && found === 0) return null;

  return (
    <AnimatePresence>
      {(loading || found > 0) && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.4 }}
          className="flex items-center gap-3 rounded-lg px-4 py-2.5"
          style={{
            background: 'rgba(212,168,83,0.04)',
            border: '1px solid rgba(212,168,83,0.12)',
          }}
        >
          <Sparkles className={`w-3.5 h-3.5 shrink-0 ${loading ? 'animate-pulse text-[#D4A853]/50' : 'text-[#D4A853]/40'}`} />
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.p
                key={stepIndex}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25 }}
                className="text-xs text-white/45 font-light"
              >
                {READING_STEPS[stepIndex]}
              </motion.p>
            ) : (
              <motion.p
                key="done"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-xs text-white/40 font-light"
              >
                ✓ Found {found} value{found !== 1 ? 's' : ''} in your documents
              </motion.p>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}