/**
 * ArrivalReveal — the cinematic Galileo introduction, run by ONE controller.
 *
 * ONE COMPOSITION THAT CHANGES OVER TIME. Three things persist from the first frame
 * to the last: the VISION wordmark, Galileo, and the background. Everything else is
 * a stage that appears, is read, and dissolves — never a section stacked above the
 * next, never a slide, never a scroll, and never a "Next" button.
 *
 *   VISION → Galileo forms from darkness (already moving) → the promise, with his
 *   name beneath it → why he needs a little context → the first question
 *
 * THE THREE STAGES SHARE ONE REGION. The copy and the interaction are the SAME band
 * (see ArrivalMessageStage), so the question fades in exactly where the messages
 * were and the orb above never moves by a pixel. `form` carries no copy: it is the
 * beat in which the orb resolves, and its membrane is already flowing.
 *
 * ── THE ONE AUTHORITATIVE CONTROLLER ────────────────────────────────────────────
 *
 * Every change of stage goes through `goToStage`: the timeline's own wait finishing,
 * a click, a key, the skip control. Nothing else may decide when a stage ends. It
 * owns the current stage, the generation it belongs to, the single hold timer, the
 * interaction lock and the cleanup, and it guarantees four things:
 *
 *  1 · THE HOLD IS THE TIME AT FULL OPACITY. The stage reports when its fade-in has
 *      completed; only then is the message's own reading time armed (readingPace).
 *      Fades are not counted as reading time, and the four-second floor is a floor.
 *  2 · A STALE CALLBACK CANNOT ADVANCE A LATER STAGE. Each transition increments a
 *      generation; the timer armed under generation N does nothing unless N is still
 *      current. A wait created for the promise can never advance the paragraph after
 *      the visitor has already moved on by hand.
 *  3 · ONE INTERACTION MOVES ONE STAGE. After every transition the presentation
 *      ignores advance input for a short, invisible lock, and a click only counts if
 *      its press BEGAN on this surface — so the click, tap or held key that dismissed
 *      the film cannot also advance the copy that has just mounted.
 *  4 · THE VISITOR IS NEVER TRAPPED. The skip control cuts straight to the question
 *      and is deliberately exempt from the lock; the choice stays until it is answered.
 *
 * PRIVACY: the orb receives exactly `state`, `size`, `intelligence` and `emerge`.
 * Nothing else can reach the visualization, and no business value exists here.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import GalileoOrb from '@/components/galileo/identity/GalileoOrb';
import { VISION_WORDMARK_URL, VISION_WORDMARK_WINDOW } from '@/lib/visionBrand';
import {
  ARRIVAL_COPY,
  ARRIVAL_OPTIONS,
  ARRIVAL_ORB,
  acknowledgementFor,
  markArrivalSequenceComplete,
} from '@/lib/galileo/arrivalContent';
import { buildArrivalSequence } from '@/lib/galileo/arrivalSequence';
import ArrivalMessageStage from './ArrivalMessageStage';
import ArrivalChoices from './ArrivalChoices';

const EASE = [0.22, 0.61, 0.36, 1];
/** Keyboard ways forward through the introduction (never Tab — that must still navigate). */
const ADVANCE_KEYS = ['Enter', 'Escape', 'ArrowRight'];

/**
 * How long the chosen card holds its confirmation — and Galileo his answer — before
 * the conversation takes over. Short enough never to feel like a delay, long enough
 * for the visitor to see that their choice landed.
 */
const CHOICE_CONFIRM_MS = 180;

/**
 * THE ACKNOWLEDGEMENT LIVES HERE, beneath the SAME Galileo. The choices dissolve,
 * Galileo answers, his line appears under him, and only the surrounding words leave
 * before the hand-off.
 */
const ACK_HOLD_MS = 1600;
const LEAVE_MS = 450;

/**
 * THE INVISIBLE INTERACTION LOCK. After any stage change — including this surface
 * mounting when the film ends — advance input is ignored for this long, so the
 * interaction that caused the change cannot reach the stage that has just appeared.
 * It is never shown to the visitor and never blocks the skip control.
 */
const INTERACTION_LOCK_MS = 450;

/** Development-only measurement probe (never ships as analytics, carries no data). */
const DEV_PROBE = !!import.meta.env?.DEV;

const isCompactViewport = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 640px)').matches;

export default function ArrivalReveal({ onChoose, showNoAccount = true, cinematic = true }) {
  const reduced = !!useReducedMotion();
  const [compact, setCompact] = useState(isCompactViewport);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(null);
  const [reacting, setReacting] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const timers = useRef([]);
  const sequence = useMemo(() => buildArrivalSequence({ reduced }), [reduced]);

  // The question is the state AFTER the last beat; the timeline never runs past it.
  const questionStep = sequence.beats.length;
  // A fresh arrival runs the introduction; a visitor who already reached the choice
  // in this session resumes AT the choice (see shouldPlayArrivalSequence).
  const [stageIndex, setStageIndex] = useState(() => (cinematic ? 0 : questionStep));

  // ── The controller's own state: stage, generation, one hold timer, one lock ──
  const stageRef = useRef(stageIndex);
  const genRef = useRef(0);
  const holdRef = useRef(null);
  const lockUntilRef = useRef(0);
  const pressArmedRef = useRef(false);
  const settledRef = useRef(null);

  const atQuestion = stageIndex >= questionStep;
  const beat = atQuestion ? null : sequence.beats[stageIndex];

  const clearHold = useCallback(() => {
    clearTimeout(holdRef.current);
    holdRef.current = null;
  }, []);

  /**
   * THE HOLD — armed for exactly one beat, under exactly one generation. A timer
   * whose generation is no longer current is inert, so a wait left over from a stage
   * the visitor has already left can never advance the stage they are on now.
   */
  const armHold = useCallback((forBeat, index, generation) => {
    clearHold();
    if (!forBeat || !forBeat.holdMs) return;
    holdRef.current = setTimeout(() => {
      if (generation !== genRef.current) return;
      goToStageRef.current?.(index + 1);
    }, forBeat.holdMs);
  }, [clearHold]);

  /** Forward reference: `armHold` needs the transition, the transition needs `armHold`. */
  const goToStageRef = useRef(null);

  /**
   * THE ONE TRANSITION. Every path — the timeline, a click, a key, the skip control —
   * arrives here, and here only: cancel the pending wait, spend the generation, arm
   * the lock, spend any unspent press, record the measurement, then move.
   */
  const goToStage = useCallback((next) => {
    const target = Math.max(0, Math.min(next, questionStep));
    if (target === stageRef.current) return;
    genRef.current += 1;
    clearHold();
    lockUntilRef.current = Date.now() + INTERACTION_LOCK_MS;
    pressArmedRef.current = false;
    if (DEV_PROBE && settledRef.current) {
      // The measured full-opacity time of the stage that is leaving — the number the
      // acceptance brief asks for, read from the clock rather than from the plan.
      console.info(
        `[VISION] arrival stage=${settledRef.current.id} fullyVisibleMs=${Date.now() - settledRef.current.at}`
      );
      settledRef.current = null;
    }
    stageRef.current = target;
    setStageIndex(target);
  }, [clearHold, questionStep]);

  useEffect(() => {
    goToStageRef.current = goToStage;
  }, [goToStage]);

  /**
   * The emergence beat has no copy and nothing to fade in, so it is armed the moment
   * it becomes current; every staged message is armed by its own fade-in completing.
   */
  useEffect(() => {
    const current = sequence.beats[stageRef.current];
    if (current && !current.fadeInMs) armHold(current, stageRef.current, genRef.current);
  }, [stageIndex, sequence, armHold]);

  /**
   * A stage says it has finished arriving. Only the stage that is CURRENT may arm a
   * hold: an outgoing stage reporting its exit late is ignored.
   */
  const onStageSettled = useCallback((settledId) => {
    const index = stageRef.current;
    const current = sequence.beats[index];
    if (!current || current.id !== settledId) return;
    settledRef.current = { id: settledId, at: Date.now() };
    if (DEV_PROBE) {
      console.info(`[VISION] arrival stage=${settledId} fullyVisible begins · hold=${current.holdMs}ms`);
    }
    armHold(current, index, genRef.current);
  }, [sequence, armHold]);

  /** One interaction, one stage: the lock is spent by every transition. */
  const advance = useCallback(() => {
    if (Date.now() < lockUntilRef.current) return;
    goToStage(stageRef.current + 1);
  }, [goToStage]);

  /** Cut straight to the question — deliberately never locked out. */
  const skip = useCallback(() => {
    goToStage(questionStep);
  }, [goToStage, questionStep]);

  // This surface mounts the instant the film ends or is skipped: the lock starts now,
  // so the interaction that dismissed the film belongs to the film and nothing else.
  useEffect(() => {
    lockUntilRef.current = Date.now() + INTERACTION_LOCK_MS;
  }, []);

  // The introduction is complete when the visitor REACHES the choice — the point at
  // which the sequence has said everything it has to say. Not when the film ended,
  // not when Galileo mounted, not when a stage mounted.
  useEffect(() => {
    if (atQuestion) markArrivalSequenceComplete();
  }, [atQuestion]);

  useEffect(() => {
    const query = typeof window !== 'undefined' ? window.matchMedia?.('(max-width: 640px)') : null;
    if (!query) return undefined;
    const onChange = () => setCompact(query.matches);
    onChange();
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    if (atQuestion) return undefined;
    const onKey = (e) => {
      if (ADVANCE_KEYS.includes(e.key)) advance();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [atQuestion, advance]);

  const size = compact ? ARRIVAL_ORB.mobile : ARRIVAL_ORB.desktop;
  // `idle` while waiting; one wave of light (`responding`) the instant a choice is
  // made; `attention` while he presents what he will do — all the SAME orb.
  const orbState = atQuestion
    ? (acknowledging ? 'attention' : reacting ? 'responding' : 'idle')
    : beat.state;

  const choose = (value) => {
    if (busy) return;
    setBusy(true);
    setSelected(value);
    setReacting(true);
    const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));
    later(() => setAcknowledging(true), CHOICE_CONFIRM_MS);
    later(() => setLeaving(true), CHOICE_CONFIRM_MS + ACK_HOLD_MS);
    // The words have left; Galileo is handed to the conversation, in place.
    later(() => onChoose?.(value), CHOICE_CONFIRM_MS + ACK_HOLD_MS + (reduced ? 0 : LEAVE_MS));
  };

  useEffect(() => () => {
    clearTimeout(holdRef.current);
    timers.current.forEach(clearTimeout);
  }, []);

  return (
    <div
      data-vision-arrival="galileo-introduction"
      data-vision-beat={atQuestion ? 'question' : beat.id}
      // A CLICK ADVANCES ONE STAGE — and only when its press BEGAN on this surface.
      // A press that started on the film (or before this mounted at all) can never
      // advance the copy that has just appeared, and the lock spends the same window.
      onPointerDown={
        atQuestion
          ? undefined
          : () => { pressArmedRef.current = Date.now() >= lockUntilRef.current; }
      }
      onClick={
        atQuestion
          ? undefined
          : () => {
            if (!pressArmedRef.current) return;
            pressArmedRef.current = false;
            advance();
          }
      }
      className="relative flex min-h-full w-full items-center justify-center px-6 py-6 md:py-8"
    >
      <div className="flex w-full max-w-[760px] flex-col items-center text-center">
        {/* ── VISION — persistent ───────────────────────────────────────── */}
        <motion.span
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: leaving ? 0 : 0.92 }}
          transition={{ duration: reduced ? 0 : leaving ? LEAVE_MS / 1000 : 0.8, ease: 'easeOut' }}
          className="block"
        >
          <span className={VISION_WORDMARK_WINDOW.window}>
            <img
              src={VISION_WORDMARK_URL}
              alt="V.I.S.I.O.N. Platform"
              className={VISION_WORDMARK_WINDOW.image.className}
              style={VISION_WORDMARK_WINDOW.image.style}
            />
          </span>
        </motion.span>

        {/* ── GALILEO — persistent, and alive from its first visible frame ──
            `emerge` draws the formation (limb arc → membranes → body); the
            membrane is already moving while it forms. Reduced motion draws the
            approved still frame instead, at full presence. */}
        {/* `layoutId` + `continuity`: when the conversation takes over, this
            same Galileo glides to his place above it and keeps moving. */}
        <motion.div
          layoutId="galileo-presence"
          transition={{ layout: { duration: 0.9, ease: EASE } }}
          className="relative mt-2 flex items-center justify-center md:mt-3"
          style={{ width: size, height: size }}
        >
          <GalileoOrb state={orbState} size="hero" intelligence={0} emerge={!reduced} continuity="galileo" />
        </motion.div>

        {/* ── THE ONE REVEAL REGION ─────────────────────────────────────────
            All three stages occupy this same region, one at a time: the promise
            with Galileo's name beneath it, why he needs a little context, then the
            first question. The question is handed in as the region's children, so
            it fades in where the messages were and the region's own reserved height
            keeps Galileo above from moving. The interaction is NOT mounted until
            the question is reached — the choice can never appear early. ── */}
        <ArrivalMessageStage beat={beat} reduced={reduced} onSettled={onStageSettled}>
          {atQuestion && (
            <AnimatePresence mode="wait" initial={false}>
              {acknowledging && (
                <motion.p
                  key="acknowledgement"
                  initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
                  animate={{ opacity: leaving ? 0 : 1, y: 0 }}
                  transition={{ duration: reduced ? 0.2 : leaving ? LEAVE_MS / 1000 : 0.6, ease: EASE }}
                  className="mt-6 max-w-[640px] text-[15px] leading-relaxed text-white/85 md:text-[17px]"
                >
                  {acknowledgementFor(selected)}
                </motion.p>
              )}
              {!acknowledging && (
                <motion.div
                  key="question"
                  // The region itself fades the whole interaction in; this element
                  // only animates when the acknowledgement replaces it.
                  initial={false}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: { duration: reduced ? 0.15 : 0.35 } }}
                  transition={{ duration: reduced ? 0.25 : 0.7, ease: EASE }}
                  className="flex w-full flex-col items-center"
                >
                  <span aria-hidden="true" className="h-px w-10 bg-vision-champagne/30" />
                  {/* A deliberate eyebrow label, not metadata: still small and
                      letterspaced, but bright enough to be read at a glance. */}
                  <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.24em] text-white/[0.52]">
                    {ARRIVAL_COPY.invitationLead}
                  </p>
                  {/* The dominant element of the lower surface: warm ivory, a shade
                      heavier, and unambiguously legible against black. */}
                  <p className="mt-2.5 text-[16px] font-medium leading-snug tracking-[-0.005em] text-white/[0.96] md:text-[17.5px]">
                    {ARRIVAL_COPY.invitation}
                  </p>
                  <ArrivalChoices
                    options={ARRIVAL_OPTIONS}
                    onChoose={choose}
                    disabled={busy}
                    selected={selected}
                  />
                  {showNoAccount && (
                    <p className="mt-4 text-[11.5px] text-white/[0.42]">{ARRIVAL_COPY.noAccount}</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </ArrivalMessageStage>
      </div>

      {/* ── SKIP — subtle, and only while the timeline is running ────────── */}
      <AnimatePresence>
        {!atQuestion && (
          <motion.button
            key="skip"
            type="button"
            onClick={(e) => {
              // Never let skipping also count as a stage advance.
              e.stopPropagation();
              skip();
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.4 } }}
            transition={{ duration: 0.6, delay: 0.8 }}
            className="fixed bottom-5 right-6 rounded-full border border-white/[0.08] px-3.5 py-1.5 text-[11px] uppercase tracking-[0.18em] text-white/45 transition-colors hover:border-vision-champagne/40 hover:text-white/80 focus-visible:border-vision-champagne/60 focus-visible:outline-none"
          >
            {ARRIVAL_COPY.skip}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}