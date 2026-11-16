/**
 * orbContinuity — lets ONE Galileo continue across a re-mount.
 *
 * When a surface hands Galileo to the next one (arrival → conversation), the
 * outgoing orb records its motion state under a continuity key and the incoming
 * orb resumes from it: same phases, same clock, same pose. The canvas is new;
 * the field the owner is looking at is not.
 *
 * Holds motion phases only — never business, identity or session data.
 */

const store = new Map();

export function writeContinuity(key, value) {
  if (key) store.set(key, value);
}

export function readContinuity(key) {
  return key ? store.get(key) || null : null;
}

export function hasContinuity(key) {
  return !!key && store.has(key);
}