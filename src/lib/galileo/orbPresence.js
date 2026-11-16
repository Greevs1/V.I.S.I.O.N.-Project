/**
 * orbPresence — the ENTIRE contract between VISION and the Galileo visualization.
 *
 * WHY THIS FILE EXISTS
 *
 * The orb is PRESENTATIONAL ONLY. It is handed a state NAME, a coarse 0-100
 * intelligence level and two booleans about the rendering environment — nothing
 * else. There is no parameter through which a business value, a document, a URL,
 * a signed link, an identity or a piece of evidence could arrive, so the
 * visualization cannot leak what it cannot receive (Part II privacy boundary).
 *
 * It is also pure and deterministic, which is what makes the mapping from REAL
 * application state to what the owner sees directly assertable: the same inputs
 * always produce the same drawing parameters, and nothing here invents progress.
 *
 * TRUTHFULNESS
 *
 * No state in this table claims work the application is not doing. `analyzing`
 * is only ever selected by a caller that genuinely has a request in flight, and
 * the intelligence level changes ONE thing only — structural coherence — never a
 * progress ring and never a claim about what VISION knows.
 */

export const ORB_STATES = Object.freeze([
  'idle',
  'listening',
  'thinking',
  'analyzing',
  'discovery',
  'responding',
  'learning',
  'attention',
  'degraded',
]);

/**
 * What each state means, in words. The label is exposed as accessible text so an
 * important state is never communicated ONLY through the animation (Part XVI).
 */
export const ORB_STATE_LABEL = Object.freeze({
  idle: 'Galileo is present',
  listening: 'Galileo is listening',
  thinking: 'Galileo is thinking',
  analyzing: 'Galileo is working through what it has',
  discovery: 'Galileo has found something',
  responding: 'Galileo is answering',
  learning: 'Galileo is learning something new',
  attention: 'Galileo has something worth seeing',
  degraded: 'Galileo is temporarily limited',
});

/** Copy for the safe, generic states — never a fabricated pipeline name. */
export const ORB_STATE_COPY = Object.freeze({
  thinking: 'Reviewing what I know...',
  analyzing: 'Working through this...',
  learning: 'Connecting the pieces...',
});

/**
 * How each state moves the luminous field. `flow` is the field's speed, `fold`
 * how much the membranes deform, `micro` the strand activity, `sweep` how far a
 * membrane may cross the dark face, `inward` how far the membranes drift from
 * the limb onto the face (attention), `travel` the waves running round the
 * circumference, `ribbons` the effective membrane count, `glow` the luminance.
 * `pulse: 'once'` + `ring` is the single discovery event; `wave: 'once'` is one
 * wave of light round part of the circumference as an answer begins.
 */
const PROFILES = Object.freeze({
  // Idle is the state a visitor meets first, so it must read as ALIVE within a
  // couple of seconds: the membranes travel, bend and carry migrating highlights
  // (`travel`) while the sphere itself stays exactly where it is. Calm and
  // intelligent, never busy — the values are still a fraction of `thinking`.
  // Listening is the same field, a little calmer, with the energy drawn inward.
  idle: { energy: 0.18, flow: 0.115, fold: 0.24, micro: 0.5, sweep: 0, inward: 0, travel: 0.12, ribbons: 3, glow: 0.9, pulse: 'none', wave: 'none' },
  listening: { energy: 0.25, flow: 0.1, fold: 0.2, micro: 0.5, sweep: 0, inward: 0.35, travel: 0.09, ribbons: 3, glow: 0.95, pulse: 'none', wave: 'none' },
  thinking: { energy: 0.6, flow: 0.16, fold: 0.3, micro: 0.6, sweep: 0.45, inward: 0.2, travel: 0.5, ribbons: 3.3, glow: 1, pulse: 'none', wave: 'none' },
  analyzing: { energy: 0.85, flow: 0.2, fold: 0.36, micro: 0.72, sweep: 0.45, inward: 0.18, travel: 0.7, ribbons: 4, glow: 1.05, pulse: 'none', wave: 'none' },
  discovery: { energy: 0.5, flow: 0.08, fold: 0.14, micro: 0.5, sweep: 0.2, inward: 0.2, travel: 0, ribbons: 3.4, glow: 1.1, pulse: 'once', wave: 'none', ring: true },
  responding: { energy: 0.3, flow: 0.085, fold: 0.18, micro: 0.45, sweep: 0, inward: 0.1, travel: 0.1, ribbons: 2.9, glow: 0.95, pulse: 'none', wave: 'once' },
  learning: { energy: 0.45, flow: 0.105, fold: 0.22, micro: 0.62, sweep: 0.15, inward: 0.15, travel: 0.2, ribbons: 3.3, glow: 1, pulse: 'none', wave: 'none' },
  attention: { energy: 0.32, flow: 0.07, fold: 0.18, micro: 0.45, sweep: 0, inward: 0.1, travel: 0, ribbons: 3, glow: 1, pulse: 'once', wave: 'none' },
  degraded: { energy: 0.08, flow: 0.025, fold: 0.14, micro: 0.2, sweep: 0, inward: 0, travel: 0, ribbons: 2.2, glow: 0.55, pulse: 'none', wave: 'none', coherenceBias: -0.25 },
});

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * orbProfile — how one real state is drawn.
 *
 * @param {string} state          one of ORB_STATES (unknown → idle, never a crash)
 * @param {object} options
 * @param {number} options.intelligence  the REAL Business Intelligence level, 0-100
 * @param {boolean} options.reduced      prefers-reduced-motion: a still field, no events
 * @param {boolean} options.compact      small screens: fewer membranes, less fine detail
 */
export function orbProfile(state, { intelligence = 0, reduced = false, compact = false } = {}) {
  const base = PROFILES[state] || PROFILES.idle;
  const level = Math.max(0, Math.min(100, Number(intelligence) || 0));

  // Coherence is the ONLY thing intelligence changes: the balance and calm of
  // the field — never a progress meter and never more motion. The floor is high
  // on purpose: at 0% (an anonymous visitor) Galileo is still fully Galileo —
  // the same flowing membranes, merely a little less organised. Low
  // understanding never thins him into a different-looking object.
  const coherence = clamp01(0.58 + (level / 100) * 0.42 + (base.coherenceBias || 0));

  // Reduced motion freezes every CLOCK (flow 0) — it does not strip the light.
  // sweep / inward / travel are shapes and highlight amplitudes; with the clocks
  // frozen they are a still pose, so the reduced frame is the same Galileo.
  return {
    state: PROFILES[state] ? state : 'idle',
    energy: base.energy,
    glow: base.glow,
    flow: reduced ? 0 : base.flow,
    fold: base.fold,
    micro: compact ? base.micro * 0.6 : base.micro,
    sweep: base.sweep,
    inward: base.inward,
    travel: base.travel,
    ribbons: compact ? Math.min(base.ribbons, 3.2) - 0.2 : base.ribbons,
    coherence,
    ring: !!base.ring,
    breath: reduced ? 0 : 0.5 - base.energy * 0.3,
    pulse: reduced ? 'none' : base.pulse,
    wave: reduced ? 'none' : base.wave,
  };
}

/**
 * resolveOrbState — the ONE place application state becomes an orb state.
 *
 * Every input is a boolean the caller already knows to be true, so the orb can
 * never display work that is not happening (no fake pipelines, G2/G3/G13).
 * Ordered by what the owner most needs to know right now.
 */
export function resolveOrbState({
  degraded = false,
  hasNewInsight = false,
  isThinking = false,
  hasNewEvidence = false,
  attention = false,
  isResponding = false,
  isListening = false,
} = {}) {
  if (degraded) return 'degraded';
  if (hasNewInsight) return 'discovery';
  if (isThinking) return 'thinking';
  if (hasNewEvidence) return 'learning';
  if (attention) return 'attention';
  if (isResponding) return 'responding';
  if (isListening) return 'listening';
  return 'idle';
}