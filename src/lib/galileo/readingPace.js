/**
 * readingPace — how long a cinematic Galileo message stays FULLY VISIBLE.
 *
 * WHY THIS IS A MODULE AND NOT A CONSTANT
 *
 * A staged message disappears on its own, so its timing is a courtesy the product
 * owes the visitor: long enough that nobody has to race Galileo to the end of a
 * sentence. One fixed hold cannot do that job — the promise is thirteen words and
 * the reason to share is twenty-seven — so the hold is derived from the copy itself.
 *
 * THE RULE (per message, measured from FULL visibility):
 *
 *   hold = max(4000, words / 200 * 60000 + 750)
 *
 *   · 200 wpm       the top of the comfortable 180–200 band, so the transition lands
 *                   just AFTER an average reader finishes, never at the instant they do;
 *   · + 750ms       the comprehension buffer that lets a sentence settle;
 *   · 4000ms floor  no staged message is ever shown for less than four seconds.
 *
 * FADES ARE NOT READING TIME. This function counts the copy only: the caller starts
 * the hold when the message has finished fading in, so `hold` is exactly the time the
 * message is at full opacity.
 *
 * WHERE THIS APPLIES — AND WHERE IT DOES NOT
 *
 * Only to STAGED copy: text the product shows on a clock and then removes on the
 * visitor's behalf (the arrival's introduction, and any future cinematic reveal).
 * Galileo's ordinary conversation is user-paced — nothing there is ever taken away
 * mid-sentence — so these timers must never be applied to a chat message.
 */

/** Words per minute used for staged copy. 180–200 is the comfortable band. */
export const READING_WPM = 200;

/** Let a sentence settle after it has been read. */
export const COMPREHENSION_BUFFER_MS = 750;

/** No staged message is ever held for less than this. */
export const MIN_STAGED_HOLD_MS = 4000;

/** Words in a piece of staged copy, counting every line it carries. */
export function countWords(text) {
  if (!text) return 0;
  return String(text).trim().split(/\s+/).filter(Boolean).length;
}

/** How long the copy takes to read, plus its comprehension buffer. */
export function readingTimeMs(text, { wpm = READING_WPM, bufferMs = COMPREHENSION_BUFFER_MS } = {}) {
  return Math.round((countWords(text) / wpm) * 60000) + bufferMs;
}

/**
 * stagedHoldMs — the readable hold for one staged message: the floor, or the copy's
 * own reading time whenever that is longer.
 */
export function stagedHoldMs(text, { floorMs = MIN_STAGED_HOLD_MS, ...reading } = {}) {
  return Math.max(floorMs, readingTimeMs(text, reading));
}