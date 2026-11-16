/**
 * arrivalSequence — the arrival's cinematic timeline, as ONE pure plan.
 *
 * WHY THIS IS A MODULE AND NOT JSX
 *
 * The introduction is a SEQUENCE, not a page: exactly one stage is on screen at a
 * time, and each is replaced by the next in place. That ordering is a product
 * contract (the promise is never read beside the question), so it is expressed here
 * as data — assertable, and impossible to "just add one more line" to — while the
 * component only lays out whatever beat it is given.
 *
 * WHAT A BEAT IS
 *
 *   id          stable key, so a beat is a keyframe and not a re-render
 *   kind        form | hook | context
 *   copy/meet   the line (or lines) this beat says
 *   state       the orb's presentation state while it is on screen
 *   words       how many words this beat actually carries
 *   holdMs      the time its copy stays FULLY VISIBLE
 *   fadeInMs/fadeOutMs   the beat's own fades, which are NOT reading time
 *
 * THE HOLD IS DERIVED FROM THE COPY, NEVER CHOSEN. `holdMs` comes from readingPace
 * (200 wpm + a 750ms comprehension buffer, floored at four seconds), so the promise
 * is not held for the paragraph's time and a twenty-seven word explanation is not
 * cut off after four seconds. The controller starts this hold when the message has
 * finished fading in, which is what makes `holdMs` literally the full-opacity time.
 *
 * THREE STAGES ONLY — the promise, the reason to give him context, and then the
 * question. `form` carries no copy: it is the beat in which Galileo forms out of
 * darkness, and it holds nothing but the emergence itself before the promise arrives.
 *
 * The orb states are the EXISTING presentational contract and nothing else. Nothing
 * is computed during the arrival, so no beat may claim work: stage 2 uses the
 * existing `listening` profile, whose energy is drawn INWARD — the only existing
 * parameter that moves the membranes onto the dark face — which is Galileo waking
 * visibly on the inside without claiming an analysis he is not running. No business
 * value reaches this file, or the visualization.
 */

import { ARRIVAL_COPY } from './arrivalContent';
import { countWords, stagedHoldMs } from './readingPace';

/**
 * ARRIVAL_TIMING — the rhythm around the words: the emergence beat and the fades.
 *
 * The HOLDS are deliberately not here. They belong to each stage's own copy (see
 * readingPace), which is what stops a fixed number from being too short for the
 * paragraph and too long for the promise.
 */
export const ARRIVAL_TIMING = Object.freeze({
  full: Object.freeze({ form: 900, fadeIn: 700, fadeOut: 700 }),
  reduced: Object.freeze({ form: 220, fadeIn: 140, fadeOut: 140 }),
});

function assemble(T) {
  /** A staged message carries its own reading time and its own fades. */
  const staged = (beat) => {
    const text = [beat.copy, beat.meet].filter(Boolean).join(' ');
    return {
      ...beat,
      words: countWords(text),
      holdMs: stagedHoldMs(text),
      fadeInMs: T.fadeIn,
      fadeOutMs: T.fadeOut,
    };
  };

  const plan = [
    // Galileo forms first. Nothing is said here and nothing is read here: the hold
    // is the emergence beat itself, and it is not a staging time for any copy.
    { id: 'form', kind: 'form', state: 'idle', copy: '', meet: '', words: 0, holdMs: T.form, fadeInMs: 0, fadeOutMs: 0 },
    staged({
      id: 'hook',
      kind: 'hook',
      state: 'idle',
      copy: ARRIVAL_COPY.headline,
      meet: ARRIVAL_COPY.meet,
    }),
    staged({
      id: 'context',
      kind: 'context',
      state: 'listening',
      copy: ARRIVAL_COPY.context,
    }),
  ];

  // The honest wall-clock length: every beat's fade in, hold and fade out.
  const totalMs = plan.reduce((n, b) => n + b.fadeInMs + b.holdMs + b.fadeOutMs, 0);
  return { beats: plan, totalMs, questionState: 'idle' };
}

/**
 * buildArrivalSequence — the plan the arrival runs, for the visitor's own motion
 * preference. Reduced motion shortens the FADES and the travel; it never shortens
 * the reading time, because a visitor who asks for less movement is not asking to
 * read faster. The question itself is NOT a beat: the sequence ends, and the
 * interaction takes over (the timeline never advances past the question).
 */
export function buildArrivalSequence({ reduced = false } = {}) {
  return assemble(reduced ? ARRIVAL_TIMING.reduced : ARRIVAL_TIMING.full);
}