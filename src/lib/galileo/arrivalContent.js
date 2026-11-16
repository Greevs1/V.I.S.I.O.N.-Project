/**
 * arrivalContent — the arrival experience's copy, and its TWO separate durable facts.
 *
 * WHY THIS IS A SEPARATE, PURE MODULE
 *
 * The arrival is the only place in the product that speaks BEFORE Galileo asks
 * anything, so its copy is a contract: it makes a specific promise ("start
 * showing you", never "will show you"), and the first discovery must pay that
 * promise off. Keeping the words in one pure module means they can be asserted
 * directly instead of scraped out of JSX, and it keeps the components about
 * layout and timing only.
 *
 * TWO FACTS, TWO FLAGS — NEVER CONFLATED
 *
 *   the FILM has been shown        `vision_arrival_film_seen_v2`  (durable, per visitor)
 *   the INTRODUCTION was completed `vision_arrival_sequence_complete_v1` (per session)
 *
 * The film's flag is written when the film ends OR is skipped, and it is what the
 * Enterprise Journey reads too, so nobody sits through the film twice. The
 * sequence's flag is written only when the visitor REACHES THE CHOICE. Reading the
 * first as though it answered the second is what collapsed the introduction: every
 * visit after the first opened straight on the question, with the promise and the
 * reason to share never mounting at all. Neither flag stores anything beyond a
 * boolean: no identity, no business, no session — nothing security-sensitive.
 */

/** The existing journey flag. Reused verbatim — do not fork it. */
export const INTRO_SEEN_KEY = 'vision_intro_completed';

/**
 * The ARRIVAL's own film flag.
 *
 * ROOT CAUSE OF THE FILM NOT PLAYING: the arrival used to READ the legacy
 * journey key above. Every browser that had ever passed through the Enterprise
 * Journey (the previous default entry) already carried it, so the film was
 * silently skipped and the visitor landed on the static reveal. The arrival now
 * reads its own versioned key and still WRITES the legacy one, so the journey
 * never replays the film either. Boolean only — no identity, no business.
 */
export const ARRIVAL_FILM_KEY = 'vision_arrival_film_seen_v2';

/**
 * The ARRIVAL SEQUENCE's own flag — a DIFFERENT FACT from the film's.
 *
 * Having watched (or skipped) the film says nothing about whether the visitor has
 * been through the introduction, and conflating the two is what collapsed it: the
 * durable film flag was read as "skip the arrival", so every visit after the first
 * opened straight on the question — the promise and the reason to share never
 * mounted at all. They are two facts, so they are two flags.
 *
 * It is SESSION-scoped, and written only when the visitor REACHES THE CHOICE: not
 * when the film ends, not when the film is skipped, not when Galileo mounts, not
 * when a stage mounts. So a refresh after the choice resumes AT the choice, a
 * refresh before it replays the introduction, and a new visit is a fresh arrival.
 * `?intro=replay` asks for it explicitly whatever the flag says.
 */
export const ARRIVAL_SEQUENCE_KEY = 'vision_arrival_sequence_complete_v1';

/** Explicit replay for review/acceptance: `?intro=replay`. */
const replayRequested = () => {
  try {
    return new URLSearchParams(window.location.search).get('intro') === 'replay';
  } catch {
    return false;
  }
};

/** Has this visitor already been shown the arrival film? */
export function hasSeenIntro() {
  if (typeof window === 'undefined') return false;
  if (replayRequested()) return false;
  try {
    return window.localStorage.getItem(ARRIVAL_FILM_KEY) === 'true';
  } catch {
    // Storage unavailable (private mode / blocked): show the introduction
    // rather than silently skipping the product's opening.
    return false;
  }
}

/**
 * Remember that the FILM has been shown. This is the film's own fact and nothing
 * more: it never decides whether the introduction's stages run (see
 * ARRIVAL_SEQUENCE_KEY above). Best-effort, boolean only.
 */
export function markIntroSeen() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ARRIVAL_FILM_KEY, 'true');
    window.localStorage.setItem(INTRO_SEEN_KEY, 'true');
  } catch { /* best-effort */ }
}

/** Has this visitor already been through the introduction in THIS session? */
export function hasCompletedArrivalSequence() {
  if (typeof window === 'undefined') return false;
  if (replayRequested()) return false;
  try {
    return window.sessionStorage.getItem(ARRIVAL_SEQUENCE_KEY) === 'true';
  } catch {
    // Storage unavailable (private mode / blocked): run the introduction rather
    // than silently collapsing the product's opening.
    return false;
  }
}

/**
 * The introduction is complete the moment the visitor reaches the choice — the point
 * at which the sequence has said everything it has to say. Best-effort: a session in
 * which storage is unavailable simply sees the introduction again.
 */
export function markArrivalSequenceComplete() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(ARRIVAL_SEQUENCE_KEY, 'true');
  } catch { /* best-effort */ }
}

/**
 * shouldShowArrival — who gets the arrival experience.
 *
 * Anonymous and fresh only. An established authenticated owner resumes their
 * business experience, and a guest session that has already started carries on
 * where it left off — the arrival never interrupts work in progress.
 */
export function shouldShowArrival({ isAuthenticated = false, conversationHasStarted = false } = {}) {
  if (isAuthenticated) return false;
  if (conversationHasStarted) return false;
  return true;
}

/**
 * resolveEntrySurface — the ONE decision for what /galileo renders.
 *
 * WHY THIS EXISTS: the arrival used to be gated on "anonymous" alone, so ANY
 * signed-in visitor who had no business yet (including the builder preview,
 * which is always signed in) skipped it and landed on the legacy in-stream
 * opener. The real question is not "signed in?" but "is this a fresh Magic Loop
 * start?" — an owner with a business still goes straight Home, unchanged.
 *
 *   resolving  auth or business intelligence not yet known (never guess)
 *   home       an established owner — Vision Home
 *   loop       the conversation is already under way (restored or handed off)
 *   arrival    a fresh first run — the cinematic entrance
 */
export function resolveEntrySurface({
  authLoading = false,
  homeResolving = false,
  isHomeMode = false,
  conversationStarted = false,
  handedOff = false,
} = {}) {
  if (authLoading || homeResolving) return 'resolving';
  if (isHomeMode) return 'home';
  if (handedOff || conversationStarted) return 'loop';
  return 'arrival';
}

/**
 * shouldPlayIntroVideo — the cinematic plays once per visitor.
 *
 * A returning anonymous visitor still gets the arrival composition (the value
 * proposition, then the choice), just without the film. That is what makes the
 * introduction feel like the product's entrance rather than a splash to sit
 * through again.
 */
export function shouldPlayIntroVideo() {
  // Review aid: `?intro=skip` opens directly on the Galileo reveal.
  try {
    if (new URLSearchParams(window.location.search).get('intro') === 'skip') return false;
  } catch { /* no window */ }
  return !hasSeenIntro();
}

/**
 * shouldPlayArrivalSequence — does this arrival run the three stages?
 *
 * THE SEQUENCE IS NOT THE FILM. It asks about the INTRODUCTION's own completion and
 * nothing else, so a visitor whose browser already carries the film's flag still
 * gets the promise, the reason to share and the question, in order. A stage is never
 * skipped because something earlier happened.
 *
 * Decided ONCE, at mount, by the arrival surface: a fresh session runs it, a visitor
 * who already reached the choice in this session resumes at the choice, and
 * `?intro=replay` / `?intro=skip` force it for acceptance work.
 */
export function shouldPlayArrivalSequence() {
  try {
    const intro = new URLSearchParams(window.location.search).get('intro');
    if (intro === 'replay' || intro === 'skip') return true;
  } catch { /* no window */ }
  return !hasCompletedArrivalSequence();
}

/**
 * ARRIVAL_COPY — what the visitor reads before Galileo asks anything.
 *
 * THE SCRIPT IS THREE STAGES, and nothing more:
 *
 *   1. hook    — the promise, with Galileo's name beneath it
 *   2. context — why he needs a little context, as one readable paragraph
 *   3. the question — the existing choice, which stays until it is answered
 *
 * The introduction is a SEQUENCE, so these are the lines of a script rather than
 * sections of a page: each stage is on screen alone, in this order, and is replaced
 * by the next in the same place (the order itself lives in arrivalSequence.js).
 * Nothing here is a guarantee — Galileo says what he will START doing, never what
 * he will prove.
 */
export const ARRIVAL_COPY = {
  /** Stage 1, line 1 — the promise, in the display treatment. */
  headline: 'See what your business is really capable of.',
  /** Stage 1, line 2 — Galileo introduces himself, directly beneath it. */
  meet: 'Meet Galileo, your business intelligence.',
  /** Stage 2 — what he does once he is given context. */
  context: "Give Galileo a little context and he'll begin showing you what deserves your attention, where opportunity may be hiding, and what could make your business more valuable.",
  /** Stage 3 — the first question, and the only point at which the choice appears. */
  invitationLead: "Let's start with one thing.",
  invitation: 'Whose business are we exploring?',
  noAccount: 'No account required to start.',
  /** The way out of the cinematic — always available while it is running. */
  skip: 'Skip intro',
};

/**
 * ARRIVAL_OPTIONS — the EXISTING canonical subject choices.
 *
 * The values are the ones `useGalileoConversation` already routes on
 * (`my_business` / `a_client`). Only the descriptions differ from the legacy
 * in-stream wording, because on the arrival screen the labels need to say what
 * the visitor gets, not who they are.
 */
import { ORB_SIZES } from './orbSizes';

export const ARRIVAL_OPTIONS = [
  { value: 'my_business', label: 'My Business', desc: 'I run it' },
  { value: 'a_client', label: 'A Client', desc: 'I advise them' },
];

/**
 * ARRIVAL_ACKNOWLEDGEMENT — Galileo's response to the choice, before the first
 * real question. It says what he will do and sets the honesty expectation about
 * the data ("I'll tell you when better data would change the answer"), which is
 * the reason a visitor can safely answer with rough figures.
 */
export const ARRIVAL_ACKNOWLEDGEMENT = {
  my_business:
    "Perfect. I'll build a picture of your business as we go. You don't need perfect numbers. Give me what you know, and I'll tell you when better data would change the answer.",
  a_client:
    "Perfect. I'll build a picture of the business as we go. You don't need every detail. Give me what you know, and I'll tell you when better data would materially change the picture.",
};

/** Galileo's opening line once the choice is made — the arrival's handoff beat. */
export function acknowledgementFor(contextValue) {
  return ARRIVAL_ACKNOWLEDGEMENT[contextValue] || ARRIVAL_ACKNOWLEDGEMENT.my_business;
}

/**
 * The orb CANVAS size in the arrival composition. The visible sphere is 80% of
 * the canvas: ≈288px on desktop and ≈190px on mobile (brief: 260–320 / 170–210).
 */
export const ARRIVAL_ORB = ORB_SIZES.hero;