/**
 * GalileoPresence — the persistent presence stage.
 *
 * WHY THIS EXISTS
 *
 * The orb was previously mounted only inside a 40px "thinking…" row, which meant
 * it existed for roughly two seconds of a five-minute first run, at a size and
 * alpha where it could not be seen on a near-black field. The intended medium
 * presence was therefore structurally present and visually absent.
 *
 * This stage is mounted ONCE on the onboarding canvas and stays. It renders the
 * orb at the brief's size band with an atmospheric glow that extends past the
 * orb's own bounds, and it derives its state from REAL experience state only.
 *
 * PRIVACY (unchanged boundary)
 *
 * The stage takes booleans, a flow word and a coarse 0-100 intelligence level. It
 * passes exactly `state`, `size` and `intelligence` to the orb — nothing else can
 * reach the visualization, and nothing is written to analytics, logs or the DOM.
 */

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import GalileoOrb from './GalileoOrb';
import { presenceLayout, resolvePresence } from '@/lib/galileo/presenceStage';
import { hasContinuity } from '@/lib/galileo/orbContinuity';

const isCompactViewport = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 640px)').matches;

export default function GalileoPresence({
  isThinking = false,
  revealing = false,
  hasNewInsight = false,
  learning = false,
  hasDecision = false,
  awaitingAnswer = false,
  degraded = false,
  intelligence = 0,
}) {
  const [compact, setCompact] = useState(isCompactViewport);

  useEffect(() => {
    const query = typeof window !== 'undefined' ? window.matchMedia?.('(max-width: 640px)') : null;
    if (!query) return undefined;
    const onChange = () => setCompact(query.matches);
    onChange();
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);

  const presence = resolvePresence({
    degraded, isThinking, revealing, hasNewInsight, learning, hasDecision, awaitingAnswer,
  });
  const { size, preset } = presenceLayout(presence.emphasis, compact);
  const [continuing] = useState(() => hasContinuity('galileo'));

  return (
    <div className="flex flex-col items-center pb-5 md:pb-7">
      {/* Continuity with the arrival: the same intelligence settles into place
          (a gentle scale-down), rather than resetting. */}
      {/* The SAME Galileo the arrival showed: `layoutId` glides him here from
          the arrival, and `continuity` resumes his motion, so the hand-off is
          one object moving, never a second orb appearing. */}
      <motion.div
        layoutId="galileo-presence"
        initial={continuing ? false : { opacity: 0, scale: 1.12 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.9, ease: [0.22, 0.61, 0.36, 1], layout: { duration: 0.9, ease: [0.22, 0.61, 0.36, 1] } }}
        className="relative flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <GalileoOrb state={presence.state} size={preset} intelligence={intelligence} continuity="galileo" />
      </motion.div>

      {/* Processing language appears ONLY while real work is in flight. */}
      <AnimatePresence mode="wait">
        {presence.caption && (
          <motion.p
            key={presence.caption}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-1 text-[12.5px] text-white/55 text-center"
          >
            {presence.caption}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}