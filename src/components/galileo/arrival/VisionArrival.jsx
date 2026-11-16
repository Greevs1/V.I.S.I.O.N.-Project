/**
 * VisionArrival — the anonymous entrance, as ONE continuous experience.
 *
 *   VISION INTRO VIDEO → VISION BRAND + GALILEO ORB → THE HOOK → CHOICE → DISCOVERY
 *
 * There is no page load, no route change and no blank frame anywhere in that
 * sequence: the three phases crossfade inside one fixed, near-black surface, and
 * the conversation is already mounted underneath, so the handoff is a state
 * change — not a navigation.
 *
 * THE VIDEO IS THE EXISTING ONE. It is rendered by the existing
 * `IntroExperience` component, which owns the media URL, the muted-autoplay
 * handling, the inline playback, the skip control and the graceful fallback. The
 * arrival only decides WHEN it is shown (once per visitor) and what happens when
 * it ends.
 *
 * Once the film is done or skipped, `markIntroSeen()` records that in the SAME
 * durable flag the Enterprise Journey already uses, so the two entry surfaces
 * agree and no visitor is asked to sit through the FILM twice. That flag is the
 * film's own fact: it never decides whether the introduction's stages run. The
 * sequence's completion is separate, session-scoped, and owned by the reveal.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import IntroExperience from '@/components/experience/IntroExperience';
import ArrivalReveal from './ArrivalReveal';
import { markIntroSeen, shouldPlayArrivalSequence } from '@/lib/galileo/arrivalContent';

const FADE = { duration: 0.6, ease: 'easeInOut' };
/** The film fades fully to black before Galileo's light begins — no hard cut. */
const FILM_OUT = { duration: 0.85, ease: [0.4, 0, 0.2, 1] };

export default function VisionArrival({ showVideo = true, showNoAccount = true, onEnter }) {
  const [phase, setPhase] = useState(showVideo ? 'video' : 'reveal');
  // Read ONCE, at mount, and it asks whether the INTRODUCTION has already been
  // completed in this session — a different fact from the film's own flag, so having
  // seen (or skipped) the film can never collapse the promise and the reason to
  // share. The sequence marks itself complete when the visitor reaches the choice.
  const [cinematic] = useState(shouldPlayArrivalSequence);

  // Development-only render-path probe. Carries the phase word only — no
  // business, identity, financial or session data — and never ships as analytics.
  useEffect(() => {
    if (import.meta.env?.DEV) console.info(`[VISION] GalileoArrivalV2 mounted · phase=${phase}`);
  }, [phase]);

  // Video finished, or the visitor skipped it: the film has been shown, and the
  // platform dissolves in. No reload, no intermediate screen.
  const finishVideo = useCallback(() => {
    markIntroSeen();
    setPhase('reveal');
  }, []);

  // The acknowledgement now happens beneath the SAME Galileo inside the reveal;
  // when it is done, the conversation takes Galileo over in place.
  const choose = useCallback((value) => {
    onEnter?.(value);
  }, [onEnter]);

  return (
    <div
      className="fixed inset-0 layer-workspace overflow-y-auto bg-black"
      data-vision-screen="galileo-arrival-v2"
      data-vision-phase={phase}
    >
      <AnimatePresence initial={false} mode="wait">
        {phase === 'video' && (
          <motion.div
            key="arrival-video"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: FILM_OUT }}
            transition={FADE}
            className="absolute inset-0"
          >
            <IntroExperience onComplete={finishVideo} onSkip={finishVideo} showReplay={false} />
          </motion.div>
        )}

        {phase === 'reveal' && (
          <motion.div
            key="arrival-reveal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={FADE}
            className="relative min-h-full"
          >
            <ArrivalReveal onChoose={choose} showNoAccount={showNoAccount} cinematic={cinematic} />
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}