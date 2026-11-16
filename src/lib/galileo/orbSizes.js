/**
 * orbSizes — the ONLY sizes Galileo is ever shown at.
 *
 * Surfaces ask for a PRESET; they never choose pixels, and they never choose
 * geometry. The canonical renderer simplifies itself for whatever size this
 * resolves to (see orbField.orbView), so every preset is the same Galileo.
 *
 * Values are CANVAS sizes; the visible sphere is 80% of each.
 */

export const ORB_SIZES = Object.freeze({
  hero: Object.freeze({ desktop: 360, mobile: 236 }),         // arrival, major Galileo moments
  conversation: Object.freeze({ desktop: 232, mobile: 168 }), // asking, above the conversation
  companion: Object.freeze({ desktop: 150, mobile: 108 }),    // the conversation, settled
  presence: Object.freeze({ desktop: 56, mobile: 52 }),       // "What Galileo Found" and similar
  micro: Object.freeze({ desktop: 18, mobile: 16 }),          // inputs, headers — identity only
});

/** A preset name (or, for legacy callers, a number) → canvas px. */
export function resolveOrbSize(size, compact = false) {
  if (typeof size === 'number' && Number.isFinite(size) && size > 0) return size;
  const band = ORB_SIZES[size] || ORB_SIZES.conversation;
  return compact ? band.mobile : band.desktop;
}