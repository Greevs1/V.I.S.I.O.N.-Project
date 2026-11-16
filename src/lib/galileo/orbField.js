/**
 * orbField — the ONE definition of what Galileo looks like.
 *
 * Three things live here, and nowhere else:
 *
 *   orbView(size, ratio)      how a size simplifies the composition (detail,
 *                             minimum line width, micro-strands) — the same
 *                             object at every scale, never a different design
 *   orbUniforms(u, view)      the exact values the shader receives, by name,
 *                             always finite
 *   sampleOrb(V, x, y, n)     a faithful CPU port of the fragment shader, used to
 *                             paint STILL frames (fallback, micro mark) so a
 *                             frozen Galileo is literally a frame of the living one
 *
 * Presentation-only: the inputs are motion parameters and a size.
 */

import { orbProfile } from './orbPresence';
import { createOrbMotion } from './orbMotion';

const PI = Math.PI;
const TAU = PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fract = (x) => x - Math.floor(x);
const mix = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const stepv = (edge, x) => (x < edge ? 0 : 1);
const mod = (x, y) => x - y * Math.floor(x / y);

/** The dark core (see the fragment shader): the graphite sphere at the centre. */
const CORE_R = 0.62;

/** How the composition simplifies at a given CSS size. Exact no-op at hero scale. */
export function orbView(size, ratio = 1, scale = 1) {
  const clarity = size >= 100 ? 1 : size >= 72 ? 0.6 : 0;
  const detail = size >= 120 ? 1 : clamp((size - 40) / 80, 0, 1);
  const minW = size < 120 ? 1.15 * (1 - detail) : 0;
  const R = size * 0.4;
  return { radius: R * ratio * scale, ratio, strand: (2 * PI * R) / 3.2, clarity, detail, minW };
}

const fin = (v, safe = 0) => (Number.isFinite(v) ? v : safe);

/** Motion output + view → the shader's uniforms, by their shader names. */
export function orbUniforms(u, view, width, height) {
  return {
    uRes: [width, height],
    uRadius: fin(view.radius, 1), uRatio: fin(view.ratio, 1), uStrand: fin(view.strand, 1),
    uMicro: fin(u.micro * view.clarity), uDetail: fin(view.detail, 1), uMinW: fin(view.minW),
    uFlow: fin(u.flow), uFlow2: fin(u.flow2), uField: fin(u.field), uMigr: fin(u.migr), uEdge: fin(u.edge),
    uTime: fin(u.time), uFold: fin(u.fold), uSweep: fin(u.sweep), uInward: fin(u.inward),
    uTravel: fin(u.travel), uBright: fin(u.bright, 1), uCount: fin(u.count, 3), uCoh: fin(u.coh, 1),
    uConv: fin(u.conv), uOrg: fin(u.org), uFocus: fin(u.focus), uWave: fin(u.wave, -1),
    uPulse: fin(u.pulse, -1), uReveal: fin(u.reveal, 1), uBreath: fin(u.breathe, 0.5), uStruct: fin(u.struct),
    uInt: fin(u.int), uIntF: fin(u.intF), uInner: fin(u.inner),
  };
}

// ── CPU PORT OF orbShaderSource (keep in lock-step with the GLSL) ───────────
function hash3(x, y, z) {
  const a = fract(x * 0.3183099 + 0.11) * 17;
  const b = fract(y * 0.3183099 + 0.17) * 17;
  const c = fract(z * 0.3183099 + 0.13) * 17;
  return fract(a * b * c * (a + b + c));
}

function vnoise(x, y, z) {
  const ix = Math.floor(x); const iy = Math.floor(y); const iz = Math.floor(z);
  let fx = x - ix; let fy = y - iy; let fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const h = (a, b, c) => hash3(ix + a, iy + b, iz + c);
  const m = (a, b, t) => a + (b - a) * t;
  return m(
    m(m(h(0, 0, 0), h(1, 0, 0), fx), m(h(0, 1, 0), h(1, 1, 0), fx), fy),
    m(m(h(0, 0, 1), h(1, 0, 1), fx), m(h(0, 1, 1), h(1, 1, 1), fx), fy),
    fz,
  );
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function ribbonNormal(V, fi) {
  const seed = fi * 2.399 + 0.7;
  const sgn = mod(fi, 2) < 0.5 ? 1 : -1;
  const travelClock = mix(V.uFlow, V.uFlow2, stepv(0.5, mod(fi, 2)));
  let phi = seed * 2.1 + travelClock * sgn * (0.55 + 0.21 * fi)
    + (vnoise(fi * 5.1, V.uFlow * 0.11, 1.7) - 0.5) * 1.4
    + (vnoise(fi * 2.7, V.uField * 0.34, 9.1) - 0.5) * 0.95;
  let tilt = 0.32 + fi * 0.31 + (vnoise(fi * 3.3, V.uFlow * 0.09, 5.3) - 0.5) * 0.35
    + (vnoise(fi * 1.9, V.uField * 0.24, 3.7) - 0.5) * 0.3;
  tilt += V.uInward * 0.32;
  if (fi > 1.5 && fi < 2.5) tilt += V.uSweep * smoothstep(0.4, 0.9, vnoise(7.0, V.uFlow * 0.23, 2.0)) * 0.9;
  const target = 2.35 + fi * 0.14;
  const d = mod(phi - target + PI, TAU) - PI;
  phi = target + d * (1 - V.uConv);
  phi = mix(phi, target, V.uOrg * 0.45);
  tilt = mix(tilt, 0.44 + fi * 0.05, V.uConv);
  tilt = mix(tilt, 0.42 + fi * 0.06, V.uOrg * 0.5);
  const n = [Math.sin(tilt) * Math.cos(phi), Math.sin(tilt) * Math.sin(phi), Math.cos(tilt)];
  const a = normalize(cross(n, [0.31, 0.95, 0.0]));
  return { n, a, b: cross(n, a) };
}

function ribbonAt(V, P, R, fi, microFade) {
  const seed = fi * 2.399 + 0.7;
  const clock = mix(V.uFlow, V.uFlow2, stepv(0.5, mod(fi, 2)));
  const qx = P[0] * 1.55 + seed;
  const qy = P[1] * 1.55 + clock * 0.6;
  const qz = P[2] * 1.55 + (-clock * 0.21 + V.uField * 0.7);
  let def = (vnoise(qx, qy, qz) - 0.5) * V.uFold
    + (vnoise(qx * 2.3 + 3.1, qy * 2.3 + 3.1, qz * 2.3 + 3.1) - 0.5) * V.uFold * 0.4;
  def += (vnoise(P[0] * 1.1 + fi * 2.0, P[1] * 1.1 + fi * 2.0, V.uField * 1.5) - 0.5) * V.uFold * 0.55;
  def += (vnoise(P[0] * 2.7 + seed * 1.7, P[1] * 2.7 + seed * 1.7, V.uEdge * 1.1 + fi * 3.3) - 0.5) * V.uFold * 0.6;
  const offset = (fract(seed * 0.618) - 0.5) * 0.2 * (1 - V.uConv);
  let s = dot(P, R.n) - offset + def;
  s += V.uMigr * (hash3(fi * 7.13 + 0.5, 1.7, 3.1) - 0.5) * 1.1 * (1 - V.uConv);

  const abx = dot(P, R.a);
  const aby = dot(P, R.b);
  const len = Math.hypot(abx, aby) + 0.0001;
  const m = vnoise((abx / len) * 1.25 + seed, (aby / len) * 1.25 + seed, clock * 0.27 + seed);
  const mask = smoothstep(0.3, 0.72, m);
  let w = (0.026 + 0.07 * smoothstep(0.3, 0.92, m)) * (0.8 + 0.4 * fract(seed * 1.3));
  w = Math.max(w, V.uMinW / V.uRadius);

  const f = s / w;
  const core = Math.exp(-f * f);
  const veil = Math.exp(-f * f * 0.07) * 0.26;
  const lip = 0.72 + 0.48 * (f / (1 + Math.abs(f)));
  const strands = 0.5 + 0.5 * Math.sin(s * V.uStrand + def * 23 + seed * 11);
  const micro = 1 + V.uMicro * microFade * (strands * strands * 0.95 - 0.32);
  let fine = 0;
  if (V.uStruct > 0.02) {
    const g2 = s / (w * 0.34);
    fine = Math.exp(-g2 * g2) * mask * V.uStruct * 0.42 * V.uDetail;
  }
  return (core * lip * micro + veil) * mask + fine;
}

/**
 * THE INTERIOR — the CPU port of the fragment shader's interiorField: thin, faint
 * currents crossing the volume of the sphere, each one the line where two drifting
 * planes meet, so its distance from the view ray and the depth of closest approach
 * are solved exactly. Front currents read crisp and bright, rear ones soft, dim and
 * partly hidden by the graphite core, and the whole interior fades out before the
 * limb. Keep in lock-step with the GLSL: the still frame is painted from here, so a
 * frozen Galileo is the same Galileo.
 */
function interiorField(V, p0, p1, r, z, guard) {
  const waveOut = V.uWave > 0 ? Math.min(1, V.uWave / 1.1) : 0;
  const icnt = Math.min(mix(1.6, 3.0, smoothstep(0.22, 0.52, V.uInner)), mix(1.8, 3.0, V.uDetail));
  const coreExit = Math.sqrt(Math.max(0, CORE_R * CORE_R - r * r));
  let acc = 0;
  for (let i = 0; i < 3; i += 1) {
    const fi = i;
    const wgt = clamp(icnt - fi, 0, 1);
    if (wgt <= 0) continue;
    const seed = fi * 2.77 + 1.3;
    const sgn = mod(fi, 2) < 0.5 ? 1 : -1;
    const uIn = V.uInt * (0.86 + 0.28 * fract(seed * 0.71));
    const fIn = V.uIntF * (0.84 + 0.32 * fract(seed * 1.31));
    const ax = 0.62 + fi * 0.29 + (vnoise(fi * 3.9, uIn * 0.12, 2.7) - 0.5) * 0.95;
    const ay = seed + sgn * (0.42 + 0.13 * fi) * uIn * 0.55
      + (vnoise(fi * 2.3, fIn * 0.17, 6.9) - 0.5) * 1.15;
    const dir = [Math.sin(ax) * Math.cos(ay), Math.sin(ax) * Math.sin(ay), Math.cos(ax)];
    const up = Math.abs(dir[1]) < 0.86 ? [0, 1, 0] : [1, 0, 0];
    const n1 = normalize(cross(dir, up));
    const n2 = cross(dir, n1);
    const spread = (1 - 0.72 * V.uConv) * (1 + 0.8 * waveOut);
    const o1 = (vnoise(fi * 5.1, uIn * 0.13, 3.9) - 0.5) * 1.15 * spread;
    const o2 = (vnoise(fi * 4.3, fIn * 0.11, 8.3) - 0.5) * 1.15 * spread;
    const A1 = n1[0] * p0 + n1[1] * p1 - o1;
    const A2 = n2[0] * p0 + n2[1] * p1 - o2;
    const den = n1[2] * n1[2] + n2[2] * n2[2];
    const tc = clamp(-((A1 * n1[2] + A2 * n2[2]) / Math.max(den, 0.02)), -z, z);
    const d1 = A1 + n1[2] * tc;
    const d2 = A2 + n2[2] * tc;
    const dist = Math.hypot(d1, d2);
    const soft = 1 + 1.1 * Math.max(-tc, 0);
    let w = (0.020 + 0.014 * fract(seed * 1.7)) * soft;
    w = Math.max(w, V.uMinW / V.uRadius);
    const f = dist / w;
    const cur = Math.exp(-f * f) + Math.exp(-f * f * 0.06) * 0.22;
    const behind = stepv(r, CORE_R) * smoothstep(coreExit + 0.06, coreExit - 0.06, tc);
    const qx = p0 - d1 * n1[0] - d2 * n2[0];
    const qy = p1 - d1 * n1[1] - d2 * n2[1];
    const qz = tc - d1 * n1[2] - d2 * n2[2];
    const along = smoothstep(0.30, 0.80, vnoise(
      qx * 2.1 + seed * 3.1, qy * 2.1 + seed * 1.7 + V.uIntF * 0.21, qz * 2.1 + seed,
    ));
    const depthGain = mix(0.5, 1.3, smoothstep(-z, z, tc));
    acc += wgt * cur * (1 - 0.94 * behind) * along * depthGain * (0.85 + 0.3 * fract(seed * 0.53));
  }
  return acc * guard * 0.42;
}

/** Per-frame constants (the membrane planes). */
export function prepareOrb(V) {
  return [0, 1, 2, 3].map((fi) => ribbonNormal(V, fi));
}

const CHAMP = [0.94, 0.8, 0.55];
const GOLD = [0.84, 0.66, 0.4];
const IVORY = [1.0, 0.97, 0.91];

/** One fragment, as the shader computes it → premultiplied [r, g, b, a] in 0..1. */
export function sampleOrb(V, px, py, normals) {
  const [resX, resY] = V.uRes;
  const p0 = (px - resX * 0.5) / V.uRadius;
  const p1 = (py - resY * 0.5) / V.uRadius;
  const r = Math.hypot(p0, p1);
  if (r > 1.25) return [0, 0, 0, 0];
  const dir = [p0 / Math.max(r, 0.0001), p1 / Math.max(r, 0.0001)];
  const z = Math.sqrt(Math.max(0, 1 - r * r));
  const ang = Math.atan2(p1, p0);

  const da0 = Math.abs(mod(ang - 2.2 + PI, TAU) - PI);
  const open = (1 - smoothstep(V.uReveal * 3.5, V.uReveal * 3.5 + 0.7, da0)) * smoothstep(0, 0.12, V.uReveal);
  const ribbonReveal = smoothstep(0.25, 0.8, V.uReveal);
  const bodyReveal = smoothstep(0.4, 1.0, V.uReveal);

  const cnt = Math.min(V.uCount, mix(2.0, 4.0, V.uDetail)) - (1 - V.uCoh) * 0.5;
  const microFade = smoothstep(0.15, 0.5, z);
  let front = 0; let back = 0; let limb = 0;
  for (let fi = 0; fi < 4; fi += 1) {
    let wgt = clamp(cnt - fi, 0, 1);
    if (wgt <= 0) continue;
    wgt *= mix(0.4 + 0.9 * fract(fi * 7.31 + 0.37), 1, V.uCoh);
    const R = normals[fi];
    if (r < 1) {
      front += wgt * ribbonAt(V, [p0, p1, z], R, fi, microFade);
      back += wgt * ribbonAt(V, [p0, p1, -z], R, fi, microFade * 0.5);
    }
    if (r > 0.9) limb += wgt * ribbonAt(V, [dir[0], dir[1], 0], R, fi, 0);
  }

  const limbGain = 0.34 + 0.66 * (0.24 / (0.24 + z));
  let centerDim = mix(0.14, 1.0, smoothstep(0.93, 0.38, z));
  centerDim = mix(centerDim, 1.0, V.uSweep * 0.55);
  const F = front * limbGain * centerDim * V.uBright * ribbonReveal * 1.95;
  const B = back * (0.5 + 0.5 * (1 - z)) * V.uBright * ribbonReveal * 1.3;
  const Lm = limb * V.uBright * ribbonReveal * 1.12;

  const warp = 0.26 * Math.sin(ang * 3 + V.uEdge * 1.6) + 0.15 * Math.sin(ang * 5 - V.uField * 2.1);
  const bandA = Math.pow(0.5 + 0.5 * Math.sin(ang * 2 - V.uFlow * 6 + 1.3), 14);
  const bandB = Math.pow(0.5 + 0.5 * Math.sin(ang * 3 + V.uEdge * 3.2 + warp), 10);
  const gateA = 0.25 + 0.95 * smoothstep(0.2, 0.86, vnoise(dir[0] * 2.1, dir[1] * 2.1, V.uFlow * 0.17));
  const gateB = 0.2 + 1.0 * smoothstep(0.28, 0.9, vnoise(dir[0] * 3.3 + 7, dir[1] * 3.3 + 7, V.uEdge * 0.19));
  const trav = (bandA * gateA + bandB * gateB * 0.85) * V.uTravel;
  const rimMod = smoothstep(0.3, 0.85, vnoise(dir[0] * 1.6 + 2, dir[1] * 1.6 + 2, V.uFlow * 0.2));

  let wave = 0;
  if (V.uWave >= 0 && V.uWave < 2.6) {
    const dw = Math.abs(mod(ang - (2.35 + V.uWave * 2.4) + PI, TAU) - PI);
    wave = Math.exp(-dw * dw / 0.07) * smoothstep(0, 0.3, V.uWave) * smoothstep(2.6, 1.5, V.uWave);
  }
  const fa = Math.abs(mod(ang - 2.35 + PI, TAU) - PI);
  const focus = V.uFocus * Math.exp(-fa * fa / 0.42);

  const breathUp = (V.uBreath - 0.5) * 2;
  let rimL = (0.05 + 0.32 * rimMod * rimMod + 1.45 * Lm + trav * 1.15 + wave * 1.7 + focus * 0.85) * open;
  rimL *= 1 + 0.14 * breathUp;
  const d = (r - 1) * V.uRadius;
  const lw = 0.7 * V.uRatio * (1 - 0.16 * breathUp);
  const rimLine = Math.exp(-d * d / (lw * lw));
  const innerLift = Math.exp(-Math.max(-d, 0) / (3 * V.uRatio)) * stepv(d, 0) * 0.16;
  const outerLift = Math.exp(-Math.max(d, 0) / (2.4 * V.uRatio)) * stepv(0, d) * 0.3;
  const rim = rimL * (rimLine + innerLift + outerLift);

  // The interior: faint champagne energy moving through the volume. It fades out
  // well before the limb, so it cannot touch the silhouette or the crisp edge.
  let IV = 0;
  if (r < 1 && V.uInner > 0.02) {
    const guard = (1 - smoothstep(0.70, 0.94, r)) * smoothstep(0.45, 1.0, V.uReveal);
    if (guard > 0.001) IV = interiorField(V, p0, p1, r, z, guard) * V.uInner;
  }
  const inFocus = V.uFocus * Math.exp(-fa * fa / 0.5) * Math.exp(-(r * r) / 0.30);
  const IVgold = IV * 0.9;
  const IVivory = (IV * 0.5 + inFocus * V.uInner * 0.5) * 0.55;

  const bodyA = clamp((1 - r) * V.uRadius + 0.5, 0, 1) * bodyReveal;
  const shade = Math.pow(1 - z, 2.4);
  const hlx = p0 + 0.34; const hly = p1 - 0.38;
  const hl = Math.exp(-(hlx * hlx + hly * hly) * 3.2);
  const body = [0.02 + 0.045 * shade + 0.022 * hl, 0.022 + 0.043 * shade + 0.022 * hl, 0.03 + 0.046 * shade + 0.027 * hl];

  const col = [0, 1, 2].map((i) => body[i] * bodyA
    + F * mix(GOLD[i], CHAMP[i], clamp(F, 0, 1)) + IVORY[i] * Math.max(F - 0.7, 0) * 0.8
    + B * GOLD[i] * 0.3
    + rim * mix(CHAMP[i], IVORY[i], clamp(rimL - 0.45, 0, 1))
    + IVgold * mix(GOLD[i], CHAMP[i], 0.72) + IVivory * IVORY[i]);

  if (V.uPulse >= 0 && V.uPulse < 3.2) {
    const pr = 1 + V.uPulse * 0.13;
    const pd = (r - pr) * V.uRadius;
    const pw = 2.2 * V.uRatio;
    const penv = smoothstep(0, 0.18, V.uPulse) * Math.exp(-V.uPulse * 1.7) * smoothstep(1.26, 1.16, pr);
    for (let i = 0; i < 3; i += 1) col[i] += CHAMP[i] * penv * (Math.exp(-pd * pd / (pw * pw)) * 0.62 + 0.028 * bodyA);
  }
  if (r > 1) {
    const atm = 0.05 * Math.exp(-(r - 1) * 7) * smoothstep(1.24, 1.02, r) * bodyReveal;
    const c = [mix(0.3, CHAMP[0], 0.55), mix(0.34, CHAMP[1], 0.55), mix(0.45, CHAMP[2], 0.55)];
    for (let i = 0; i < 3; i += 1) col[i] += c[i] * atm;
  }
  for (let i = 0; i < 3; i += 1) col[i] = Math.max(0, 1 - Math.exp(-col[i] * 1.3));
  const a = Math.max(bodyA, clamp(Math.max(col[0], col[1], col[2]) * 1.1, 0, 1));
  return [Math.min(col[0], a), Math.min(col[1], a), Math.min(col[2], a), a];
}

/**
 * The uniforms of Galileo's still frame — the CANONICAL POSE, exactly the frame
 * reduced motion shows. Fallback and micro marks are this frame, nothing else.
 */
export function stillUniforms({ size, ratio = 1, state = 'idle', intelligence = 0, compact = false }) {
  const motion = createOrbMotion({ reduced: true });
  const u = motion.step(orbProfile(state, { intelligence, reduced: true, compact }), 0);
  const W = Math.round(size * ratio);
  return orbUniforms(u, orbView(size, ratio, 1), W, W);
}