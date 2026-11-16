/**
 * ArrivalMessageStage — the ONE reveal region beneath Galileo.
 *
 * All three stages of the introduction occupy this single region, one at a time and
 * always in the same place: the promise with Galileo's name beneath it, then why he
 * needs a little context, then the first question (handed in as `children`). Nothing
 * is stacked, no invisible section keeps height, and the orb above never moves.
 *
 * ONE REGION, ONE FLOOR. The only reserved space is a responsive MIN-height, sized
 * to the tallest of the three states — the question with its two choices — and no
 * more. The content is TOP-aligned, so every stage begins at the same distance below
 * Galileo (the tight relationship the composition wants) and any slack falls BELOW
 * the active stage instead of opening a void between the orb and the words.
 *
 * ONE AT A TIME IS STRUCTURAL, NOT TIMED. A single AnimatePresence runs in
 * `mode="wait"`, so the outgoing stage must finish leaving before the incoming one
 * is mounted — including when the visitor clicks or taps to move on. The visitor's
 * own burst of clicks cannot overlap two stages.
 *
 * THE TIMING BELONGS TO THE CONTROLLER. This region only reports WHEN a message has
 * finished fading in (`onSettled`); ArrivalReveal owns how long it then stays.
 *
 * Motion is opacity and a few pixels of travel, on a long ease: in from +6px, out to
 * −4px. Under reduced motion the travel is dropped and the crossfade shortens; the
 * region is a polite live region besides, so no line is communicated ONLY by the
 * animation.
 */

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const EASE = [0.22, 0.61, 0.36, 1];
/** Keep the last word with its neighbour so "of." is never stranded. */
const unorphan = (text) => text.replace(/ (\S+)$/, '\u00A0$1');

/**
 * THE REGION'S FLOOR — the tallest state plus a few pixels, never more. Because it
 * is a minimum rather than a fixed height, the words can come and go without moving
 * Galileo, and the question can take the messages' place without reopening the dead
 * space beneath him.
 */
const REGION = 'min-h-[272px] md:min-h-[192px]';

/** The interaction's own fade into place: the same curve and the same 700ms as the
 *  copy, so the first question arrives exactly like the words before it. */
const INTERACTION_IN = 700;

/** Restrained travel — and none of it at all under reduced motion. */
const ENTER = { opacity: 0, y: 6 };
const LEAVE = { opacity: 0, y: -4 };
const FADE = { opacity: 0 };

function Beat({ beat }) {
  if (beat.kind === 'hook') {
    return (
      <>
        <h1
          className="max-w-[17ch] font-display text-[30px] font-normal leading-[1.08] tracking-[-0.015em] text-white md:max-w-[21ch] md:text-[46px]"
          style={{ textWrap: 'balance' }}
        >
          {unorphan(beat.copy)}
        </h1>
        {/* Galileo's own introduction, in the clean sans treatment, directly
            beneath the promise it belongs to — one stage, not two. */}
        <p
          className="mt-3 max-w-[36ch] text-[13.5px] font-light leading-[1.6] text-white/60 md:text-[15px]"
          style={{ textWrap: 'balance' }}
        >
          {beat.meet}
        </p>
      </>
    );
  }

  if (beat.kind === 'context') {
    return (
      // Important explanatory copy: a controlled measure so it reads elegantly, and
      // a size and contrast that make it immediately readable rather than fine print.
      <p
        className="max-w-[44ch] text-[15.5px] font-light leading-[1.7] text-white/[0.84] md:max-w-[54ch] md:text-[17px]"
        style={{ textWrap: 'balance' }}
      >
        {beat.copy}
      </p>
    );
  }

  return null;
}

export default function ArrivalMessageStage({ beat, reduced = false, children, onSettled }) {
  const speaking = !!beat && beat.kind !== 'form';
  // The interaction is never mounted beside a message: the stage shows the current
  // stage's copy OR the question, never both, and never an empty placeholder.
  const interaction = !speaking && children;

  return (
    <div
      aria-live="polite"
      className={`flex w-full flex-col items-center justify-start ${REGION}`}
    >
      <AnimatePresence mode="wait" initial={false}>
        {/* THE HOLD BEGINS WHEN THE FADE-IN ENDS. This region reports the moment the
            message has finished arriving; the controller owns the reading time from
            there, so a stage's hold is literally its time at full opacity. */}
        {speaking && (
          <motion.div
            key={beat.id}
            initial={reduced ? FADE : ENTER}
            animate={{ opacity: 1, y: 0 }}
            exit={
              reduced
                ? { ...FADE, transition: { duration: 0.2, ease: EASE } }
                : { ...LEAVE, transition: { duration: (beat.fadeOutMs || 300) / 1000, ease: EASE } }
            }
            transition={{ duration: reduced ? 0.2 : (beat.fadeInMs || 300) / 1000, ease: EASE }}
            onAnimationComplete={() => onSettled?.(beat.id)}
            className="flex w-full flex-col items-center"
          >
            <Beat beat={beat} />
          </motion.div>
        )}
        {interaction && (
          <motion.div
            key="interaction"
            initial={reduced ? FADE : ENTER}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? FADE : LEAVE}
            transition={{ duration: reduced ? 0.2 : INTERACTION_IN / 1000, ease: EASE }}
            className="flex w-full flex-col items-center"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}