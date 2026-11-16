/**
 * orbMotion — turns a stream of real states into smooth shader parameters.
 *
 * ONE FIELD, SEVERAL INDEPENDENT CLOCKS.
 *
 * A state change never snaps: every parameter eases toward its new target, and
 * every PHASE is INTEGRATED (phase += rate × dt), so speeding up or slowing down
 * never jumps the field. Five clocks run the luminous field at unrelated rates:
 *
 *   flow    the primary membrane travel — the state's own flow
 *   flow2   a second membrane family, on its own slower clock
 *   field   the slow deformation (bending, drifting, relaxing)
 *   migr    one membrane's vertical migration
 *   edge    the light travelling the perimeter
 *
 * TWO ZONES, ONE GALILEO. The clocks above drive the SHELL, and every one of them
 * runs at a CONSTANT rate: no two share a rate and no pair shares a small-integer
 * ratio, so the parts never resync, but the outside stays what it should be —
 * calm, slow, fluid, elegant, with no gust, no whip and no sudden change of
 * direction. The deformation they drive runs through a NON-PERIODIC 3D noise
 * field, which is what makes a visible loop seam impossible rather than unlikely.
 *
 * INSIDE the shell there are two more clocks (`intP`, `intF`) — the interior
 * volume. They run at ~1.3× the shell's own rates, so the intelligence inside
 * Galileo is measurably more active than its surface while never becoming busy,
 * and they are the ONLY thing that moves faster.
 *
 * TRUTHFULNESS IS UNCHANGED: every rate is scaled by the state's OWN flow, so a
 * state that is honestly doing more work genuinely moves more, `idle` stays
 * contemplative, and reduced motion (flow 0) freezes every clock at once.
 *
 * CONTINUITY: `snapshot()` captures the whole motion state and `resume` restores
 * it, so the same Galileo can continue on a new canvas without a pose change.
 */

const KEYS = ['flow', 'fold', 'micro', 'sweep', 'inward', 'travel', 'ribbons', 'glow', 'coherence', 'energy'];
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const ease = (v) => v * v * (3 - 2 * v);
const ramp = (t, a, b) => ease(clamp01((t - a) / (b - a)));

const TAU = Math.PI * 2;

/** The idle flow from orbPresence: the reference liveliness (drive = 1). */
const IDLE_FLOW = 0.115;

/** Absolute rates for the secondary clocks — unrelated to each other and to the primary. */
const RATES = Object.freeze({ flow2: 0.0731, field: 0.0271, migr: 0.1807, edge: 0.2709 });

/**
 * THE INTERIOR'S RATE — ~1.3× the shell's own. The volume inside Galileo is
 * measurably more active than the surface it moves behind (the requested 20–35%
 * margin), and still deliberately slow: activity, never energy for its own sake.
 */
export const INT_RATE = 1.3;

/**
 * BREATHING — two slow, unrelated sines: an irregular 5–7s swell of ±1.5% size
 * and ±5% edge concentration. Almost subconscious, never a button pulse.
 */
const BREATH_A = TAU / 5.4;
const BREATH_B = TAU / 7.1;
const BREATH_SCALE = 0.015;
const BREATH_LIGHT = 0.05;

/** Full frame rate is for real work and real events; contemplative states are calm. */
const BUSY_FLOW = 0.13;

/**
 * THE CANONICAL POSE — the one frame Galileo is shown in when he cannot move:
 * reduced motion, and the still fallback. They are therefore the same picture.
 */
export const CANONICAL_POSE = Object.freeze({
  phase: 3.7, phase2: 1.9, field: 2.6, migrP: 0.4, edgeP: 0.9, intP: 5.2, intF: 1.4,
});

export function createOrbMotion({ reduced = false, emerge = false, resume = null } = {}) {
  const fixed = reduced;
  const S = resume
    ? { ...resume, cur: resume.cur ? { ...resume.cur } : null }
    : {
      cur: null,
      phase: fixed ? CANONICAL_POSE.phase : 11 + Math.random() * 40,
      phase2: fixed ? CANONICAL_POSE.phase2 : 5 + Math.random() * 23,
      field: fixed ? CANONICAL_POSE.field : 3 + Math.random() * 17,
      migrP: fixed ? CANONICAL_POSE.migrP : Math.random() * TAU,
      edgeP: fixed ? CANONICAL_POSE.edgeP : Math.random() * TAU,
      intP: fixed ? CANONICAL_POSE.intP : Math.random() * TAU,
      intF: fixed ? CANONICAL_POSE.intF : 2 + Math.random() * 23,
      structT: 0,
      lastT: null,
      prevState: null,
      eventAt: null,
      eventKind: null,
    };

  // A snapshot taken before the interior existed carries no interior clocks: give
  // them phases of their own rather than leaving the volume permanently frozen.
  if (S.intP == null) S.intP = Math.random() * TAU;
  if (S.intF == null) S.intF = 2 + Math.random() * 23;

  return {
    /** Something is moving fast enough to deserve full frame rate. */
    active(t) {
      const inEvent = S.eventAt != null && t - S.eventAt < 5;
      return inEvent || (S.cur && S.cur.flow > BUSY_FLOW) || (emerge && t < 7);
    },

    /** The whole motion state, so the same Galileo can continue elsewhere. */
    snapshot() {
      return { ...S, cur: S.cur ? { ...S.cur } : null };
    },

    step(p, t) {
      const dt = S.lastT == null ? 0 : Math.min(0.1, Math.max(0, t - S.lastT));
      S.lastT = t;
      if (!S.cur) {
        S.cur = {};
        KEYS.forEach((k) => { S.cur[k] = p[k] ?? 0; });
      } else {
        const k = 1 - Math.exp(-dt * 1.8);
        KEYS.forEach((key) => { S.cur[key] += ((p[key] ?? 0) - S.cur[key]) * k; });
      }
      const cur = S.cur;

      if (p.state !== S.prevState) {
        S.prevState = p.state;
        if (p.pulse === 'once' || p.wave === 'once') {
          S.eventAt = t;
          S.eventKind = p.ring ? 'discovery' : 'wave';
        }
      }

      // ── DISCOVERY — converge → organise → one region brighter → one wave → one ring → settle
      const tp = S.eventAt == null ? -1 : t - S.eventAt;
      let conv = 0;
      let org = 0;
      let focus = 0;
      let slow = 1;
      let wave = -1;
      let pulse = -1;
      if (tp >= 0 && tp < 5) {
        if (S.eventKind === 'discovery') {
          conv = ramp(tp, 0, 0.9) * (1 - ramp(tp, 3.2, 4.4));
          org = ramp(tp, 0.2, 1.1) * (1 - ramp(tp, 2.5, 3.9));
          focus = ramp(tp, 0.85, 1.5) * (1 - ramp(tp, 2.4, 3.6));
          slow = 1 - 0.8 * ramp(tp, 0.45, 0.8) * (1 - ramp(tp, 0.9, 1.3));
          wave = tp >= 1.5 ? tp - 1.5 : -1;
          pulse = tp >= 1.9 ? tp - 1.9 : -1;
        } else {
          wave = tp;
        }
      }

      // FORMATION SETTLING — livelier while emerging, easing exactly into idle.
      const settling = emerge ? 1 - ramp(t, 0.25, 6.5) : 0;
      const drift = 1 + 0.8 * settling;
      const bloom = 1 + 0.3 * settling;

      // ── THE SHELL'S CLOCKS — each integrates its own CONSTANT rate ──────────
      // Constant is the point: the outside of Galileo drifts, bends and breathes
      // smoothly, and never whips, folds or changes direction on a gust.
      const drive = (cur.flow / IDLE_FLOW) * slow * drift;
      S.phase = (S.phase + dt * cur.flow * slow * drift) % 997;
      S.phase2 = (S.phase2 + dt * RATES.flow2 * drive) % 997;
      S.field = (S.field + dt * RATES.field * drive) % 997;
      S.migrP = (S.migrP + dt * RATES.migr * drive) % 997;
      S.edgeP = (S.edgeP + dt * RATES.edge * drive) % 997;

      // ── THE INTERIOR'S CLOCKS — the volume inside the shell ────────────────
      // A constant rate ~1.3× the shell's, and deliberately NOT scaled by `slow`:
      // discovery calms the surface while the interior converges, because that is
      // where the finding is actually happening.
      const driveIn = (cur.flow / IDLE_FLOW) * drift;
      S.intP = (S.intP + dt * cur.flow * INT_RATE * drift) % 997;
      S.intF = (S.intF + dt * RATES.field * INT_RATE * driveIn) % 997;

      // NEW STRUCTURE — only while Galileo is genuinely learning.
      S.structT = p.state === 'learning' ? Math.min(8, S.structT + dt) : Math.max(0, S.structT - dt * 0.8);
      const struct = clamp01(S.structT / 7);

      // ── BREATHING ──────────────────────────────────────────────────────────
      const b1 = Math.sin(t * BREATH_A);
      const b2 = Math.sin(t * BREATH_B + 2.1);
      const breathe = reduced ? 0.5 : 0.5 + 0.5 * (0.62 * b1 + 0.38 * b2);
      const swell = reduced ? 0 : (breathe - 0.5) * 2;

      // ── HOW MUCH ENERGY IS MOVING INSIDE HIM ──────────────────────────────
      // From the state's OWN energy: an idle Galileo is alive but quiet, thinking
      // raises it, analyzing is richest and most interconnected, discovery draws
      // it into one converging current, and an answer lets it relax and drift back
      // outward. A state that is honestly doing more genuinely moves more.
      const waveIn = wave >= 0 ? clamp01(wave / 1.1) : 0;
      const inner = (0.14 + 0.42 * cur.energy + 0.2 * conv) * (1 - 0.35 * waveIn);

      return {
        flow: S.phase,
        flow2: S.phase2,
        field: S.field,
        migr: reduced ? Math.sin(CANONICAL_POSE.migrP) : Math.sin(S.migrP),
        edge: S.edgeP,
        int: S.intP,
        intF: S.intF,
        inner,
        time: t % 100,
        fold: cur.fold * (1.3 - 0.6 * cur.coherence) * bloom * (1 + 0.12 * org),
        micro: cur.micro * (0.75 + 0.5 * cur.coherence) * (1 + 0.6 * struct),
        sweep: cur.sweep,
        inward: cur.inward,
        travel: cur.travel,
        bright: cur.glow * (1 + BREATH_LIGHT * swell) * (1 + 0.15 * conv),
        count: Math.min(4, cur.ribbons + 0.35 * struct),
        coh: clamp01(cur.coherence + 0.22 * org),
        struct,
        conv,
        org,
        focus,
        breathe,
        scale: 1 + BREATH_SCALE * swell,
        wave,
        pulse,
        reveal: emerge ? ease(clamp01((t - 0.1) / 2.1)) : 1,
      };
    },
  };
}