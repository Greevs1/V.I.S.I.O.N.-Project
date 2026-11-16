/**
 * GalileoEducationModal — Phase 9, item 6
 *
 * Shown ONCE immediately after the Executive Briefing finishes.
 * Introduces the Galileo icon and how to use it.
 * Dismissal is persisted — never shown repeatedly.
 *
 * "Got It" → dismiss for this session (still can re-appear after a fresh briefing).
 * "Don't Show Again" → persist permanently.
 */
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';

const FOREVER_KEY = 'vision_galileo_education_never_v1';
const SESSION_KEY = 'vision_galileo_education_dismissed_v1';

export function useGalileoEducation() {
  const [shouldShow, setShouldShow] = useState(false);

  // Show is triggered externally via reveal(); here we only gate on persistence.
  useEffect(() => {
    try {
      if (localStorage.getItem(FOREVER_KEY) === '1' || sessionStorage.getItem(SESSION_KEY) === '1') {
        setShouldShow(false);
      }
    } catch { /* non-fatal */ }
  }, []);

  const reveal = () => {
    try {
      if (localStorage.getItem(FOREVER_KEY) === '1' || sessionStorage.getItem(SESSION_KEY) === '1') return;
    } catch { /* non-fatal */ }
    setShouldShow(true);
  };

  const dismiss = () => {
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* non-fatal */ }
    setShouldShow(false);
  };

  const dontShowAgain = () => {
    try { localStorage.setItem(FOREVER_KEY, '1'); sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* non-fatal */ }
    setShouldShow(false);
  };

  return { shouldShow, reveal, dismiss, dontShowAgain };
}

export default function GalileoEducationModal({ open, onGotIt, onDontShowAgain }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 flex items-center justify-center"
          style={{ zIndex: 70, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(8px)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            className="w-full max-w-md mx-4 rounded-2xl p-7 text-center"
            style={{ background: '#161616', border: '1px solid rgba(212,168,83,0.25)' }}
          >
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
              style={{ background: 'rgba(212,168,83,0.1)', border: '1px solid rgba(212,168,83,0.2)' }}>
              <Sparkles className="w-7 h-7" style={{ color: '#D4A853' }} />
            </div>

            <p className="text-[11px] uppercase tracking-[0.2em] font-semibold mb-2" style={{ color: 'rgba(212,168,83,0.85)' }}>
              Meet Galileo
            </p>
            <h2 className="text-xl font-display font-bold mb-3" style={{ color: '#F5F5F5' }}>
              Your intelligence companion.
            </h2>
            <p className="text-[13px] leading-relaxed mb-6" style={{ color: 'rgba(255,255,255,0.68)' }}>
              Throughout your IQ Dashboard you'll notice the Galileo&nbsp;✦ icon. Whenever you'd like deeper insight into a score, gap, recommendation, or opportunity, simply click it. Galileo provides deeper business intelligence based entirely on your own data.
            </p>

            <div className="flex flex-col gap-2.5">
              <button
                onClick={onGotIt}
                className="w-full px-5 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-85"
                style={{ background: '#D4A853', color: '#08080C' }}
              >
                Got It
              </button>
              <button
                onClick={onDontShowAgain}
                className="w-full text-[12px] uppercase tracking-wider transition-opacity hover:opacity-60"
                style={{ color: 'rgba(255,255,255,0.5)' }}
              >
                Don't Show Again
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}