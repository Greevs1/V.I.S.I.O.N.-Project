/**
 * LivingBusinessPulse — the premium floating dock with progressive awakening.
 *
 * Six signals progressively awaken as Galileo understands the business:
 *   unknown    → "Learning…"
 *   learning   → "Learning…"
 *   known      → show value
 *   interesting → show value + subtle indicator
 *   active     → highlighted (user is interacting)
 *
 * When a signal genuinely CHANGES state because Galileo learned something, it
 * receives ONE restrained illumination — a single soft glow that fades. No
 * bounce, no flash, no celebration. The owner should notice "Galileo just
 * learned something", nothing more.
 *
 * The signal states are AUTHORITATIVE INPUT: they are derived from the canonical
 * signals upstream and are never recomputed here.
 *
 * Clicking a signal opens intelligence INSIDE the Galileo workspace
 * (IntelligenceDrawer) — never navigates to an old dashboard.
 */

import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { computeSignalStates, SignalState } from '@/lib/galileo/signalAwakening';

const SIGNALS = [
  { key: 'cash', label: 'Cash' },
  { key: 'tax', label: 'Tax' },
  { key: 'profit', label: 'Profit' },
  { key: 'operations', label: 'Operations' },
  { key: 'value', label: 'Value' },
  { key: 'freedom', label: 'Freedom' },
];

const STATE_STYLES = {
  [SignalState.UNKNOWN]: 'opacity-40',
  [SignalState.LEARNING]: 'opacity-50',
  [SignalState.KNOWN]: 'opacity-90',
  [SignalState.INTERESTING]: 'opacity-100',
  [SignalState.ACTIVE]: 'opacity-100',
};

/** The one-shot awakening illumination. */
const AWAKENING_GLOW = '0 0 0 1px rgba(212,168,83,0.20), 0 0 26px -6px rgba(212,168,83,0.30)';
const NO_GLOW = '0 0 0 0px rgba(212,168,83,0)';

export default function LivingBusinessPulse({ model, signalStates, onSignalClick, activeDomain }) {
  // Use provided signalStates (from the hook) or compute from model
  const states = signalStates || computeSignalStates(model, {}, null, activeDomain);
  const signals = model?.signals || {};

  // A signal that has genuinely just changed state illuminates once.
  const [awakened, setAwakened] = useState({});
  const previousRef = useRef({});

  useEffect(() => {
    const previous = previousRef.current;
    const current = {};
    const changed = {};

    SIGNALS.forEach((s) => {
      const state = states[s.key]?.state;
      current[s.key] = state;
      const was = previous[s.key];
      const quiet = state === SignalState.UNKNOWN || state === SignalState.LEARNING;
      // Only a real transition into a known state — never the first paint.
      if (was && was !== state && !quiet) changed[s.key] = true;
    });

    previousRef.current = current;

    const keys = Object.keys(changed);
    if (keys.length === 0) return undefined;

    setAwakened(changed);
    const timer = setTimeout(() => setAwakened({}), 1000);
    return () => clearTimeout(timer);
  }, [states]);

  return (
    <div className="flex items-stretch gap-1.5 md:gap-2 bg-black/40 backdrop-blur-md rounded-2xl border border-white/[0.06] px-2 py-2 overflow-x-auto scrollbar-none">
      {SIGNALS.map((sig, i) => {
        const signal = signals[sig.key];
        const stateInfo = states[sig.key] || { state: SignalState.UNKNOWN, label: 'Learning…' };
        const stateOpacity = STATE_STYLES[stateInfo.state] || 'opacity-40';
        const isActive = activeDomain === sig.key;
        const isUnknown = stateInfo.state === SignalState.UNKNOWN || stateInfo.state === SignalState.LEARNING;
        const isInteresting = stateInfo.state === SignalState.INTERESTING;
        const justAwakened = !!awakened[sig.key];

        return (
          <motion.button
            key={sig.key}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0, boxShadow: justAwakened ? AWAKENING_GLOW : NO_GLOW }}
            transition={{ duration: justAwakened ? 0.45 : 0.7, delay: justAwakened ? 0 : i * 0.04 }}
            onClick={() => onSignalClick?.(sig.key)}
            className={`flex-shrink-0 rounded-xl px-3 py-2 flex flex-col gap-0.5 min-w-[72px] text-left transition-all ${stateOpacity} ${
              isActive
                ? 'bg-[#D4A853]/[0.08] border border-[#D4A853]/25'
                : isInteresting
                  ? 'bg-white/[0.02] border border-[#D4A853]/10 hover:bg-white/[0.04]'
                  : isUnknown
                    ? 'hover:bg-white/[0.03] border border-transparent'
                    : 'hover:bg-white/[0.04] border border-transparent'
            }`}
          >
            <span className="text-[9px] uppercase tracking-[0.1em] text-white/55 font-medium flex items-center gap-1">
              {sig.label}
              {isInteresting && (
                <span className="w-1 h-1 rounded-full bg-[#D4A853] animate-pulse" />
              )}
            </span>
            {isUnknown ? (
              <span className="text-[11px] text-white/45 italic">{stateInfo.label || 'Learning…'}</span>
            ) : (
              <>
                <span className="text-[12px] font-medium text-white/90 truncate" title={stateInfo.label}>
                  {stateInfo.label}
                </span>
                {stateInfo.secondary && (
                  <span className="text-[9px] text-white/60 truncate" title={stateInfo.secondary}>
                    {stateInfo.secondary}
                  </span>
                )}
              </>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}