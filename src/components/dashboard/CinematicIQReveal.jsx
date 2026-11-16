/**
 * CinematicIQReveal — Phase 4C
 *
 * "Galileo reveals the dashboard" — ~7 second animated sequence.
 * Shown only on first dashboard visit. Stored in localStorage.
 * After completion, normal dashboard renders underneath.
 *
 * Sequence:
 *  0.0s — "Connecting everything I've learned..."
 *  0.8s — Data dimensions check one by one (Revenue, Profit, Taxes, Operations, Value, Docs, Confidence)
 *  4.5s — IQ Score counts up
 *  5.5s — Business Impact Score counts up
 *  6.5s — Fade out, reveal dashboard
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Check } from 'lucide-react';

const STORAGE_KEY = 'vision_cinematic_reveal_v1';

export function useCinematicReveal() {
  const [shouldShow, setShouldShow] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    try {
      const done = localStorage.getItem(STORAGE_KEY);
      setShouldShow(!done);
    } catch {}
    setChecked(true);
  }, []);

  const markSeen = () => {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
    setShouldShow(false);
  };

  const resetReveal = () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    setShouldShow(true);
  };

  return { shouldShow: checked && shouldShow, markSeen, resetReveal };
}

const DIMENSIONS = [
  { key: 'revenue',    label: 'Revenue',       delay: 800  },
  { key: 'profit',     label: 'Profit',        delay: 1200 },
  { key: 'taxes',      label: 'Taxes',         delay: 1600 },
  { key: 'operations', label: 'Operations',    delay: 2000 },
  { key: 'value',      label: 'Business Value',delay: 2400 },
  { key: 'documents',  label: 'Documents',     delay: 2800 },
  { key: 'confidence', label: 'Confidence',    delay: 3200 },
];

function useCountUp(target, duration = 1200, start = false) {
  const [current, setCurrent] = useState(0);
  const raf = useRef(null);

  useEffect(() => {
    if (!start || target == null) return;
    const startTime = performance.now();
    const animate = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(eased * target));
      if (progress < 1) {
        raf.current = requestAnimationFrame(animate);
      }
    };
    raf.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf.current);
  }, [start, target, duration]);

  return current;
}

export default function CinematicIQReveal({ onComplete, iqScore = 0, impactScore = 0, bis }) {
  const [phase, setPhase] = useState('intro');       // intro | scanning | iq | impact | done
  const [checkedDims, setCheckedDims] = useState([]);
  const [startIQ, setStartIQ] = useState(false);
  const [startImpact, setStartImpact] = useState(false);
  const [visible, setVisible] = useState(true);

  const displayIQ = useCountUp(Math.round(iqScore), 900, startIQ);
  const displayImpact = useCountUp(Math.round(impactScore), 900, startImpact);

  // Orchestrate the sequence
  useEffect(() => {
    // Phase 1: intro text 0–0.7s
    const t1 = setTimeout(() => setPhase('scanning'), 700);

    // Phase 2: check dimensions one at a time
    const timers = DIMENSIONS.map((dim, i) =>
      setTimeout(() => {
        setCheckedDims(prev => [...prev, dim.key]);
        if (i === DIMENSIONS.length - 1) {
          // All checked — move to IQ phase after 400ms
          setTimeout(() => {
            setPhase('iq');
            setStartIQ(true);
          }, 400);
        }
      }, dim.delay)
    );

    // Phase 3: IQ count-up starts at ~3.6s, impact at ~4.8s
    const t3 = setTimeout(() => { setPhase('impact'); setStartImpact(true); }, 4800);

    // Phase 4: fade out and call onComplete at ~6.8s
    const t4 = setTimeout(() => {
      setPhase('done');
      setVisible(false);
      setTimeout(onComplete, 600);
    }, 6800);

    return () => {
      clearTimeout(t1);
      timers.forEach(clearTimeout);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const r = bis?._raw || {};
  // Determine which dimensions have data
  const dimData = {
    revenue:    r.revenue != null,
    profit:     r.profit_gap_amount > 0,
    taxes:      r.tax_gap_annual > 0,
    operations: r.operations_score != null,
    value:      r.value_gap_amount > 0,
    documents:  bis?.hasDocuments,
    confidence: bis?.hasAssessmentData,
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: '#060608' }}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
        >
          <div className="w-full max-w-sm px-8 space-y-8">

            {/* Galileo badge */}
            <motion.div
              className="flex items-center justify-center gap-2"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <Sparkles className="w-5 h-5" style={{ color: '#D4A853' }} />
              <span className="text-[11px] tracking-[0.2em] uppercase font-medium" style={{ color: '#D4A853' }}>
                Galileo Intelligence
              </span>
            </motion.div>

            {/* Intro message */}
            <motion.div
              className="text-center space-y-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.5 }}
            >
              <p className="text-xl font-display font-semibold" style={{ color: '#F5F5F5' }}>
                {phase === 'intro'
                  ? "I'm connecting everything I've learned..."
                  : phase === 'scanning'
                  ? 'Building your intelligence profile...'
                  : 'Profile complete.'}
              </p>
            </motion.div>

            {/* Dimension checklist */}
            {(phase === 'scanning' || phase === 'iq' || phase === 'impact' || phase === 'done') && (
              <div className="space-y-2">
                {DIMENSIONS.map((dim) => {
                  const isChecked = checkedDims.includes(dim.key);
                  const hasData = dimData[dim.key];
                  return (
                    <motion.div
                      key={dim.key}
                      className="flex items-center justify-between"
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: isChecked ? 1 : 0.3, x: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <span className="text-sm" style={{ color: isChecked ? '#F5F5F5' : '#374151' }}>
                        {dim.label}
                      </span>
                      <AnimatePresence>
                        {isChecked && (
                          <motion.div
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                            className="flex items-center gap-1.5"
                          >
                            <Check className="w-4 h-4" style={{ color: hasData ? '#10B981' : '#D4A853' }} />
                            <span className="text-[11px]" style={{ color: hasData ? '#10B981' : '#9CA3AF' }}>
                              {hasData ? 'Found' : 'Ready'}
                            </span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* Score reveal */}
            {(phase === 'iq' || phase === 'impact' || phase === 'done') && (
              <motion.div
                className="flex items-center justify-center gap-8 pt-4 border-t border-white/10"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <div className="text-center">
                  <p className="text-4xl font-display font-bold" style={{ color: '#D4A853' }}>
                    {displayIQ}
                  </p>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">IQ Score</p>
                </div>
                {(phase === 'impact' || phase === 'done') && (
                  <motion.div
                    className="text-center"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4 }}
                  >
                    <p className="text-4xl font-display font-bold" style={{ color: '#10B981' }}>
                      {displayImpact}
                    </p>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">Impact Score</p>
                  </motion.div>
                )}
              </motion.div>
            )}

            {/* Skip */}
            <div className="flex justify-center">
              <button
                onClick={() => { setVisible(false); setTimeout(onComplete, 300); }}
                className="text-[11px] text-white/20 hover:text-white/40 transition-colors"
              >
                Skip
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}