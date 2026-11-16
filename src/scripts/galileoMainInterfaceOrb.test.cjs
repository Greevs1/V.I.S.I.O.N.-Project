/**
 * galileoMainInterfaceOrb.test.cjs — CAN GALILEO ACTUALLY BE SEEN?
 *
 * WHY THIS EXISTS
 *
 * The previous suites proved the orb was MOUNTED and that draw calls happened.
 * Neither can tell a rendered Galileo from a black circle: a shader whose light
 * is thinner than a pixel still issues drawArrays. On the main interface — the
 * "WHAT GALILEO FOUND" surface, which mounts the orb at 52px — the container was
 * present and the visible orb was not.
 *
 * So this harness measures the thing that actually matters: the LUMINANCE the
 * shipping shader produces at the size that surface uses. `rasterSample()` is a
 * faithful line-by-line port of orbShaderSource.js's fragment shader, driven by
 * the REAL uniforms (orbProfile → orbMotion → the same view object the renderer
 * receives). It is a measuring instrument, not a GPU.
 *
 * WHAT IT ASSERTS
 *
 *   O1  the main interface mounts the canonical orb at its real size
 *   O2  the renderer receives a valid, non-zero size and a live context
 *   O3  a visible frame OR the visible static fallback is present
 *   O4  an empty framebuffer can never remain on screen as a black circle
 *   O5  pausing (tab hidden) preserves the last visible frame
 *   O6  pausing (offscreen) preserves the last visible frame
 *   O7  canvas/WebGL initialisation failure produces the fallback
 *   O8  reduced motion produces a visible Galileo
 *   O9  a route transition / re-init never leaves a dead canvas
 *   O10 small-size rendering has real luminance against the surface it sits on
 *
 * Run:            node src/scripts/galileoMainInterfaceOrb.test.cjs
 * Measure only:   PROBE=1 node src/scripts/galileoMainInterfaceOrb.test.cjs
 */

const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '../..');
const ORB = path.join(ROOT, 'src/components/galileo/identity/GalileoOrb.jsx');
const SHADER = path.join(ROOT, 'src/lib/galileo/orbShader.js');
const FALLBACK = path.join(ROOT, 'src/components/galileo/identity/GalileoOrbFallback.jsx');
const NEXT_BEST_MOVE = path.join(ROOT, 'src/components/galileo/home/NextBestMove.jsx');

const TAU = Math.PI * 2;
const PI = Math.PI;

// ════════════════════════════════════════════════════════════════════════════
// A FAITHFUL CPU PORT OF THE SHIPPING FRAGMENT SHADER (orbShaderSource.js)
// ════════════════════════════════════════════════════════════════════════════
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fract = (x) => x - Math.floor(x);
const mix = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const stepv = (edge, x) => (x < edge ? 0 : 1);
const mod = (x, y) => x - y * Math.floor(x / y);

function hash3(x, y, z) {
  const px = fract(x * 0.3183099 + 0.11);
  const py = fract(y * 0.3183099 + 0.17);
  const pz = fract(z * 0.3183099 + 0.13);
  const a = px * 17, b = py * 17, c = pz * 17;
  return fract(a * b * c * (a + b + c));
}

function vnoise(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const h = (a, b, c) => hash3(ix + a, iy + b, iz + c);
  const m = (a, b, t) => a + (b - a) * t;
  return m(
    m(m(h(0, 0, 0), h(1, 0, 0), fx), m(h(0, 1, 0), h(1, 1, 0), fx), fy),
    m(m(h(0, 0, 1), h(1, 0, 1), fx), m(h(0, 1, 1), h(1, 1, 1), fx), fy),
    fz,
  );
}

const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function ribbonNormal(U, fi) {
  const seed = fi * 2.399 + 0.7;
  const sgn = mod(fi, 2) < 0.5 ? 1 : -1;
  const travelClock = mix(U.flow, U.flow2, stepv(0.5, mod(fi, 2)));
  let phi = seed * 2.1 + travelClock * sgn * (0.55 + 0.21 * fi)
    + (vnoise(fi * 5.1, U.flow * 0.11, 1.7) - 0.5) * 1.4
    + (vnoise(fi * 2.7, U.field * 0.34, 9.1) - 0.5) * 0.95;
  let tilt = 0.32 + fi * 0.31 + (vnoise(fi * 3.3, U.flow * 0.09, 5.3) - 0.5) * 0.35
    + (vnoise(fi * 1.9, U.field * 0.24, 3.7) - 0.5) * 0.3;
  tilt += U.inward * 0.32;
  if (fi > 1.5 && fi < 2.5) {
    tilt += U.sweep * smoothstep(0.4, 0.9, vnoise(7.0, U.flow * 0.23, 2.0)) * 0.9;
  }
  const target = 2.35 + fi * 0.14;
  const d = mod(phi - target + PI, TAU) - PI;
  phi = target + d * (1 - U.conv);
  phi = mix(phi, target, U.org * 0.45);
  tilt = mix(tilt, 0.44 + fi * 0.05, U.conv);
  tilt = mix(tilt, 0.42 + fi * 0.06, U.org * 0.5);
  return [Math.sin(tilt) * Math.cos(phi), Math.sin(tilt) * Math.sin(phi), Math.cos(tilt)];
}

function ribbonAt(U, P, n, fi, microFade) {
  const seed = fi * 2.399 + 0.7;
  const clock = mix(U.flow, U.flow2, stepv(0.5, mod(fi, 2)));
  const qx = P[0] * 1.55 + seed;
  const qy = P[1] * 1.55 + clock * 0.6;
  const qz = P[2] * 1.55 + (-clock * 0.21 + U.field * 0.7);
  let def = (vnoise(qx, qy, qz) - 0.5) * U.fold
    + (vnoise(qx * 2.3 + 3.1, qy * 2.3 + 3.1, qz * 2.3 + 3.1) - 0.5) * U.fold * 0.4;
  def += (vnoise(P[0] * 1.1 + fi * 2.0, P[1] * 1.1 + fi * 2.0, U.field * 1.5) - 0.5) * U.fold * 0.55;
  def += (vnoise(P[0] * 2.7 + seed * 1.7, P[1] * 2.7 + seed * 1.7, U.edge * 1.1 + fi * 3.3) - 0.5) * U.fold * 0.6;

  const offset = (fract(seed * 0.618) - 0.5) * 0.2 * (1 - U.conv);
  let s = dot(P, n) - offset + def;
  const migrW = U.detail >= 1 ? hash3(fi * 7.13 + 0.5, 1.7, 3.1) - 0.5
    : hash3(fi * 7.13 + 0.5, 1.7, 3.1) - 0.5;
  s += U.migr * migrW * 1.1 * (1 - U.conv);

  const a = normalize(cross(n, [0.31, 0.95, 0.0]));
  const b = cross(n, a);
  const abx = dot(P, a);
  const aby = dot(P, b);
  const len = Math.hypot(abx, aby);
  const ux = abx / (len + 0.0001);
  const uy = aby / (len + 0.0001);
  const m = vnoise(ux * 1.25 + seed, uy * 1.25 + seed, clock * 0.27 + seed);
  const mask = smoothstep(0.3, 0.72, m);
  let w = (0.026 + 0.07 * smoothstep(0.3, 0.92, m)) * (0.8 + 0.4 * fract(seed * 1.3));
  // SMALL-SCALE LIGHT FLOOR: a luminous feature must never be thinner than a
  // pixel, or it stops existing. No-op when detail is 1 (the arrival's scale).
  w = Math.max(w, U.minW / U.radius);

  const f = s / w;
  const core = Math.exp(-f * f);
  const veil = Math.exp(-f * f * 0.07) * 0.26;
  const lip = 0.72 + 0.48 * (f / (1 + Math.abs(f)));
  const strands = 0.5 + 0.5 * Math.sin(s * U.strand + def * 23 + seed * 11);
  const micro = 1 + U.micro * microFade * (strands * strands * 0.95 - 0.32);
  const body = (core * lip * micro + veil) * mask;

  let fine = 0;
  if (U.struct > 0.02) {
    const g = s / (w * 0.34);
    fine = Math.exp(-g * g) * mask * U.struct * 0.42 * U.detail;
  }
  return body + fine;
}

/** One fragment, exactly as the shipping shader computes it. */
function rasterSample(U, px, py) {
  const p = [(px - U.resX * 0.5) / U.radius, (py - U.resY * 0.5) / U.radius];
  const r = Math.hypot(p[0], p[1]);
  if (r > 1.25) return { lum: 0, alpha: 0, r };

  const dir = [p[0] / Math.max(r, 0.0001), p[1] / Math.max(r, 0.0001)];
  const z = Math.sqrt(Math.max(0, 1 - r * r));
  const ang = Math.atan2(p[1], p[0]);

  const da0 = Math.abs(mod(ang - 2.2 + PI, TAU) - PI);
  const open = (1 - smoothstep(U.reveal * 3.5, U.reveal * 3.5 + 0.7, da0)) * smoothstep(0, 0.12, U.reveal);
  const ribbonReveal = smoothstep(0.25, 0.8, U.reveal);
  const bodyReveal = smoothstep(0.4, 1.0, U.reveal);

  const cnt = Math.min(U.count, mix(2.0, 4.0, U.detail)) - (1 - U.coh) * 0.5;
  const Pf = [p[0], p[1], z];
  const Pb = [p[0], p[1], -z];
  const Pl = [dir[0], dir[1], 0];
  const microFade = smoothstep(0.15, 0.5, z);
  let front = 0, back = 0, limb = 0;
  for (let i = 0; i < 4; i += 1) {
    const fi = i;
    let wgt = clamp(cnt - fi, 0, 1);
    if (wgt <= 0) continue;
    wgt *= mix(0.4 + 0.9 * fract(fi * 7.31 + 0.37), 1, U.coh);
    const n = ribbonNormal(U, fi);
    if (r < 1) {
      front += wgt * ribbonAt(U, Pf, n, fi, microFade);
      back += wgt * ribbonAt(U, Pb, n, fi, microFade * 0.5);
    }
    if (r > 0.9) limb += wgt * ribbonAt(U, Pl, n, fi, 0);
  }

  const limbGain = 0.34 + 0.66 * (0.24 / (0.24 + z));
  let centerDim = mix(0.14, 1.0, smoothstep(0.93, 0.38, z));
  centerDim = mix(centerDim, 1.0, U.sweep * 0.55);
  const F = front * limbGain * centerDim * U.bright * ribbonReveal * 1.95;
  const B = back * (0.5 + 0.5 * (1 - z)) * U.bright * ribbonReveal * 1.3;
  const Lm = limb * U.bright * ribbonReveal * 1.12;

  const warp = 0.26 * Math.sin(ang * 3 + U.edge * 1.6) + 0.15 * Math.sin(ang * 5 - U.field * 2.1);
  const bandA = Math.pow(0.5 + 0.5 * Math.sin(ang * 2 - U.flow * 6 + 1.3), 14);
  const bandB = Math.pow(0.5 + 0.5 * Math.sin(ang * 3 + U.edge * 3.2 + warp), 10);
  const gateA = 0.25 + 0.95 * smoothstep(0.2, 0.86, vnoise(dir[0] * 2.1, dir[1] * 2.1, U.flow * 0.17));
  const gateB = 0.2 + 1.0 * smoothstep(0.28, 0.9, vnoise(dir[0] * 3.3 + 7, dir[1] * 3.3 + 7, U.edge * 0.19));
  const trav = (bandA * gateA + bandB * gateB * 0.85) * U.travel;
  const rimMod = smoothstep(0.3, 0.85, vnoise(dir[0] * 1.6 + 2, dir[1] * 1.6 + 2, U.flow * 0.2));

  let wave = 0;
  if (U.wave >= 0 && U.wave < 2.6) {
    const wa = 2.35 + U.wave * 2.4;
    const dw = Math.abs(mod(ang - wa + PI, TAU) - PI);
    wave = Math.exp(-dw * dw / 0.07) * smoothstep(0, 0.3, U.wave) * smoothstep(2.6, 1.5, U.wave);
  }
  const fa = Math.abs(mod(ang - 2.35 + PI, TAU) - PI);
  const focus = U.focus * Math.exp(-fa * fa / 0.42);

  const breathUp = (U.breath - 0.5) * 2;
  let rimL = (0.05 + 0.32 * rimMod * rimMod + 1.45 * Lm + trav * 1.15 + wave * 1.7 + focus * 0.85) * open;
  rimL *= 1 + 0.14 * breathUp;

  const d = (r - 1) * U.radius;
  const lw = 0.7 * U.ratio * (1 - 0.16 * breathUp);
  const rimLine = Math.exp(-d * d / (lw * lw));
  const innerLift = Math.exp(-Math.max(-d, 0) / (3 * U.ratio)) * stepv(d, 0) * 0.16;
  const outerLift = Math.exp(-Math.max(d, 0) / (2.4 * U.ratio)) * stepv(0, d) * 0.3;
  const rim = rimL * (rimLine + innerLift + outerLift);

  const bodyA = clamp((1 - r) * U.radius + 0.5, 0, 1) * bodyReveal;
  const body = [
    0.02 + 0.045 * Math.pow(1 - z, 2.4),
    0.022 + 0.043 * Math.pow(1 - z, 2.4),
    0.03 + 0.046 * Math.pow(1 - z, 2.4),
  ];
  const hlx = p[0] + 0.34;
  const hly = p[1] - 0.38;
  const hlTerm = Math.exp(-(hlx * hlx + hly * hly) * 3.2);
  body[0] += 0.022 * hlTerm; body[1] += 0.022 * hlTerm; body[2] += 0.027 * hlTerm;

  const champ = [0.94, 0.8, 0.55];
  const gold = [0.84, 0.66, 0.4];
  const ivory = [1.0, 0.97, 0.91];

  let col = body.map((v) => v * bodyA);
  col = col.map((v, i) => v + F * mix(gold[i], champ[i], clamp(F, 0, 1)) + ivory[i] * Math.max(F - 0.7, 0) * 0.8);
  col = col.map((v, i) => v + B * gold[i] * 0.3);
  col = col.map((v, i) => v + rim * mix(champ[i], ivory[i], clamp(rimL - 0.45, 0, 1)));

  if (U.pulse >= 0 && U.pulse < 3.2) {
    const pr = 1 + U.pulse * 0.13;
    const pd = (r - pr) * U.radius;
    const pw = 2.2 * U.ratio;
    const penv = smoothstep(0, 0.18, U.pulse) * Math.exp(-U.pulse * 1.7) * smoothstep(1.26, 1.16, pr);
    col = col.map((v, i) => v + champ[i] * penv * Math.exp(-pd * pd / (pw * pw)) * 0.62 + champ[i] * penv * 0.028 * bodyA);
  }
  if (r > 1) {
    const atm = 0.05 * Math.exp(-(r - 1) * 7) * smoothstep(1.24, 1.02, r) * bodyReveal;
    const c = [mix(0.3, champ[0], 0.55), mix(0.34, champ[1], 0.55), mix(0.45, champ[2], 0.55)];
    col = col.map((v, i) => v + c[i] * atm);
  }

  col = col.map((v) => 1 - Math.exp(-v * 1.3));
  col = col.map((v, i) => v + (hash3(px, py, U.time + i) - 0.5) / 255);
  col = col.map((v) => Math.max(v, 0));
  const a = Math.max(bodyA, clamp(Math.max(col[0], col[1], col[2]) * 1.1, 0, 1));
  return { lum: Math.max(col[0], col[1], col[2]), alpha: a, r, parts: { front, back, limb, F, B, Lm, rimL, rim, bodyA, col0: col[0], open, wave, focus, breathUp, da0, fa, limbGain, centerDim, ribbonReveal, z, ang, PI } };
}

// ════════════════════════════════════════════════════════════════════════════
// UNIFORMS — built the way the component builds them (profile → motion → view)
// ════════════════════════════════════════════════════════════════════════════
function clarityFor(size) {
  return size >= 100 ? 1 : size >= 72 ? 0.6 : 0;
}

function detailFor(size) {
  // --baseline measures the shader as it shipped BEFORE the small-size terms.
  if (process.argv.includes('--baseline')) return 1;
  return size >= 120 ? 1 : clamp((size - 40) / 80, 0, 1);
}

function minWidthFor(size, detail) {
  if (process.argv.includes('--baseline')) return 0;
  return mix(1.15, 0, detail) * (size < 120 ? 1 : 0);
}

/** The exact uniform bundle + view the renderer receives, at time `at`. */
function buildUniforms({ size, dpr, state = 'idle', intelligence = 0, compact = false, emerge = false, reduced = false, at = 12 }, mods) {
  const { orbProfile, createOrbMotion } = mods;
  const motion = createOrbMotion({ reduced, emerge: emerge && !reduced });
  const W = size;
  const R = W * 0.4;
  const ratio = Math.min(dpr, 2.5);
  const resX = Math.round(W * ratio);
  const resY = resX;
  let u = null;
  const profile = orbProfile(state, { intelligence, reduced, compact });
  for (let t = 0; t <= at * 1000; t += 16) {
    u = motion.step(profile, t / 1000);
  }
  const view = {
    width: resX,
    height: resY,
    radius: R * ratio * (u.scale || 1),
    ratio,
    strand: (TAU * R) / 3.2,
    clarity: clarityFor(size),
  };
  const detail = detailFor(size);
  const U = {
    ...u,
    // The renderer's breathing value, under the name the shader uses. (The motion
    // engine calls it `breathe`; this is the alias that a name-derived mapping
    // got WRONG, which is what made every luminous term NaN.)
    breath: u.breathe,
    micro: u.micro * view.clarity,
    resX, resY,
    radius: view.radius,
    ratio,
    strand: view.strand,
    detail,
    minW: minWidthFor(size, detail),
  };
  return { U, view, detail };
}

/**
 * Measure the light the shader actually emits.
 *  · full   — every device pixel, for the lit-area fraction
 *  · rim    — a dense scan across the limb band, where the perimeter lives
 *  · face   — a coarse scan of the dark face, where the membranes cross
 */
function measure(U) {
  let maxLum = 0, lit = 0, total = 0, facePeak = 0, rimPeak = 0;
  const stepX = 1;
  for (let y = 0; y < U.resY; y += stepX) {
    for (let x = 0; x < U.resX; x += stepX) {
      const s = rasterSample(U, x + 0.5, y + 0.5);
      total += 1;
      if (s.lum >= 0.06) lit += 1;
      if (s.lum > maxLum) maxLum = s.lum;
      if (s.r < 0.95 && s.lum > facePeak) facePeak = s.lum;
    }
  }
  // The limb band: 1.5 device pixels either side of r = 1.
  const band = (3 * U.ratio) / U.radius;
  for (let k = 0; k < 720; k += 1) {
    const ang = (k / 720) * TAU;
    for (let rr = 1 - band; rr <= 1 + band; rr += band / 6) {
      const s = rasterSample(U, U.resX * 0.5 + Math.cos(ang) * rr * U.radius, U.resY * 0.5 + Math.sin(ang) * rr * U.radius);
      if (s.lum > rimPeak) rimPeak = s.lum;
    }
  }
  return {
    maxLum, facePeak, rimPeak,
    litFraction: total ? lit / total : 0,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// BUNDLING (same loader the other orb harnesses use)
// ════════════════════════════════════════════════════════════════════════════
const aliasPlugin = (overrides = {}) => ({
  name: 'vision-alias',
  setup(build) {
    build.onResolve({ filter: /^@\// }, (args) => {
      const base = path.join(ROOT, 'src', args.path.slice(2));
      for (const ext of ['', '.jsx', '.js', '/index.js', '/index.jsx']) {
        if (fs.existsSync(base + ext) && fs.statSync(base + ext).isFile()) return { path: base + ext };
      }
      return { path: base };
    });
    build.onLoad({ filter: /\.(jsx|js)$/ }, (args) => {
      if (!overrides[args.path]) return undefined;
      return { contents: overrides[args.path], loader: 'jsx' };
    });
  },
});

async function bundle(entrySource, { overrides = {}, reactShim = false } = {}) {
  const plugins = [aliasPlugin(overrides)];
  if (reactShim) {
    plugins.unshift({
      name: 'react-shim',
      setup(build) {
        build.onResolve({ filter: /^react(\/jsx-runtime|\/jsx-dev-runtime)?$/ }, () => ({ path: 'react-shim', namespace: 'shim' }));
        build.onLoad({ filter: /.*/, namespace: 'shim' }, () => ({
          contents: `
            const useRef = (v) => globalThis.__HOOKS__.ref(v);
            const useEffect = (fn) => globalThis.__HOOKS__.effect(fn);
            const useState = (v) => globalThis.__HOOKS__.state(v);
            const jsx = (type, props) => ({ type, props });
            module.exports = { __esModule: true, default: { createElement: jsx }, useRef, useEffect, useState, jsx, jsxs: jsx, Fragment: 'frag' };
          `,
          loader: 'js',
        }));
      },
    });
  }
  const out = await esbuild.build({
    stdin: { contents: entrySource, resolveDir: ROOT, loader: 'jsx' },
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    loader: { '.js': 'jsx' }, logLevel: 'silent', plugins,
    define: { 'import.meta.env': '{}' },
  });
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', out.outputFiles[0].text)(mod, mod.exports, require);
  return mod.exports;
}

const LIB_ENTRY = `
  import { orbProfile, ORB_STATES } from '@/lib/galileo/orbPresence';
  import { createOrbMotion } from '@/lib/galileo/orbMotion';
  import { ORB_FRAGMENT } from '@/lib/galileo/orbShaderSource';
  import GalileoOrb from '@/components/galileo/identity/GalileoOrb';
  import GalileoOrbFallback from '@/components/galileo/identity/GalileoOrbFallback';
  export { orbProfile, ORB_STATES, createOrbMotion, ORB_FRAGMENT, GalileoOrb, GalileoOrbFallback };
`;

// ════════════════════════════════════════════════════════════════════════════
// A GL CONTEXT THAT BEHAVES LIKE A REAL ONE, INCLUDING LOSS
// ════════════════════════════════════════════════════════════════════════════
function glContext({ frame = 'lit', loseOnRequest = true } = {}) {
  const state = { lost: false, drawArrays: 0, uniform1f: {}, uniform2f: {}, deletes: 0, clears: 0, readPixels: 0 };
  const gl = {
    COMPILE_STATUS: 1, LINK_STATUS: 2, VERTEX_SHADER: 3, FRAGMENT_SHADER: 4,
    ARRAY_BUFFER: 5, STATIC_DRAW: 6, FLOAT: 7, TRIANGLE_STRIP: 8,
    isContextLost: () => state.lost,
    createShader: () => (state.lost ? null : {}),
    shaderSource() {}, compileShader() {},
    getShaderParameter: () => !state.lost,
    deleteShader() { state.deletes += 1; },
    createProgram: () => (state.lost ? null : {}),
    attachShader() {}, linkProgram() {},
    getProgramParameter: () => !state.lost,
    deleteProgram() { state.deletes += 1; },
    createBuffer: () => ({}),
    bindBuffer() {},
    bufferData() {},
    deleteBuffer() { state.deletes += 1; },
    getAttribLocation: () => 0,
    getUniformLocation: (p, name) => ({ name }),
    uniform1f: (loc, v) => { if (loc) state.uniform1f[loc.name] = v; },
    uniform2f: (loc, x, y) => { if (loc) state.uniform2f[loc.name] = [x, y]; },
    enableVertexAttribArray() {},
    vertexAttribPointer() {},
    useProgram() {},
    drawArrays() { state.drawArrays += 1; },
    viewport() {},
    clear() { state.clears += 1; },
    getExtension: (name) => (name === 'WEBGL_lose_context' && loseOnRequest
      ? { loseContext: () => { state.lost = true; } }
      : null),
    readPixels: (x, y, w, h, fmt, type, out) => {
      state.readPixels += 1;
      for (let i = 0; i < out.length; i += 4) {
        out[i] = frame === 'zero' ? 0 : 40;
        out[i + 1] = frame === 'zero' ? 0 : 34;
        out[i + 2] = frame === 'zero' ? 0 : 24;
        out[i + 3] = frame === 'zero' ? 0 : 255;
      }
    },
  };
  return { gl, state };
}

function mount({ mods, size = 52, props = {}, context = 'ok', reduced = false, tabHidden = false, offscreen = false, frame = 'lit' }) {
  const { GalileoOrb, GalileoOrbFallback } = mods;
  const ctx = glContext({ frame });
  const canvas = { style: {}, width: 0, height: 0, getContext: () => (context === 'ok' ? ctx.gl : null), addEventListener() {}, removeEventListener() {} };
  const effects = [];
  const fallbackSets = [];
  let refIndex = 0;
  globalThis.__HOOKS__ = {
    ref: (v) => (refIndex++ === 0 ? { current: canvas } : { current: v }),
    effect: (fn) => effects.push(fn),
    state: (v) => [typeof v === 'function' ? v() : v, (x) => fallbackSets.push(x)],
  };
  globalThis.window = {
    devicePixelRatio: 2,
    matchMedia: (q) => ({ matches: reduced && q.includes('reduce') }),
    location: { href: 'http://localhost/', search: '', origin: 'http://localhost' },
  };
  globalThis.document = { hidden: tabHidden };
  const raf = [];
  globalThis.requestAnimationFrame = (fn) => { raf.push(fn); return raf.length; };
  globalThis.cancelAnimationFrame = () => {};
  const observers = [];
  globalThis.IntersectionObserver = class {
    constructor(cb) { this.cb = cb; observers.push(cb); }
    observe() {}
    disconnect() {}
  };

  let error = null;
  let cleanup;
  let elm;
  try {
    elm = GalileoOrb({ state: 'idle', size, intelligence: 0, ...props, __fallbackType: GalileoOrbFallback });
    cleanup = effects[0]?.();
    for (let i = 0; i < 3 && raf.length; i += 1) raf.shift()(performance.now() + i * 16);
  } catch (e) { error = e; }

  const childOf = (node) => (node && node.props ? node.props.children : null);
  const child = childOf(elm);
  const childFallback = !!child && typeof child.type === 'function' && child.type.name === 'GalileoOrbFallback';

  return {
    error, state: ctx.state, canvas, elm, child, childFallback, fallback: childFallback || fallbackSets.includes(true),
    fallbackSets, observers, cleanup, raf, hidden: () => { globalThis.document.hidden = true; },
    pump: (n = 3) => { let drew = 0; const before = ctx.state.drawArrays; for (let i = 0; i < n && raf.length; i += 1) raf.shift()(performance.now() + 100 + i * 16); drew = ctx.state.drawArrays - before; return drew; },
    remountOnSameCanvas: () => { const e2 = []; globalThis.__HOOKS__.effect = (fn) => e2.push(fn); const before = ctx.state.drawArrays; try { GalileoOrb({ state: 'idle', size, intelligence: 0, ...props }); } catch (e) { return { error: e, drew: 0 }; } e2[0]?.(); for (let i = 0; i < 3 && raf.length; i += 1) raf.shift()(performance.now() + 400 + i * 16); return { drew: ctx.state.drawArrays - before }; },
  };
}

/**
 * The uniforms the REAL renderer sent, keyed as the shader names them — i.e. the
 * frame the owner is actually looking at. A mismatch between this and
 * `buildUniforms` (what the motion engine intended) is precisely the class of
 * defect that made the orb black, so the visibility checks measure THIS.
 */
function capturedU(m) {
  const u = {};
  Object.entries(m.state.uniform1f).forEach(([name, value]) => {
    u[name.slice(1, 2).toLowerCase() + name.slice(2)] = value;
  });
  const res = m.state.uniform2f.uRes || [0, 0];
  return { ...u, resX: res[0], resY: res[1] };
}

// ════════════════════════════════════════════════════════════════════════════
// PROBE — the measurements, on their own
// ════════════════════════════════════════════════════════════════════════════
async function probe(mods) {
  const rows = [];
  const cases = [
    { label: 'main interface 52px  (DPR 2)', size: 52, dpr: 2 },
    { label: 'main interface 52px  (DPR 1)', size: 52, dpr: 1 },
    { label: 'conversation  150px (DPR 2)', size: 150, dpr: 2 },
    { label: 'arrival       360px (DPR 2)', size: 360, dpr: 2 },
  ];
  for (const c of cases) {
    for (const state of ['idle', 'attention']) {
      let best = null;
      for (const at of [8, 11, 14]) {
        const { U } = buildUniforms({ ...c, state, intelligence: 40, at }, mods);
        const m = measure(U);
        if (!best || m.maxLum > best.maxLum) best = m;
      }
      rows.push({ ...c, state, ...best });
    }
  }
  console.log('\n  GALILEO — MEASURED LUMINANCE (CPU port of the shipping shader)');
  console.log('  size/state                     maxLum  facePeak  rimPeak  litArea');
  rows.forEach((r) => {
    console.log(`  ${r.label.padEnd(28)} ${r.state.padEnd(9)} ${r.maxLum.toFixed(3).padStart(7)} ${r.facePeak.toFixed(3).padStart(9)} ${r.rimPeak.toFixed(3).padStart(8)} ${(r.litFraction * 100).toFixed(2).padStart(7)}%`);
  });
  console.log('');
  return rows;
}

// ════════════════════════════════════════════════════════════════════════════
// CHECKS
// ════════════════════════════════════════════════════════════════════════════
/**
 * Visibility floors, set from measurement, not taste: the glass card the small
 * orb sits on has its own luminance around 0.04–0.06, so light below that is
 * invisible no matter how pretty it is.
 */
const FLOORS = { rimPeak: 0.18, facePeak: 0.08, litFraction: 0.01 };

async function runChecks({ orbSource, shaderSource, fallbackSource } = {}) {
  const failures = [];
  const check = (id, label, ok, detail = '') => { if (!ok) failures.push(`${id} ${label}${detail ? ` — ${detail}` : ''}`); };

  const overrides = {};
  if (orbSource) overrides[ORB] = orbSource;
  if (shaderSource) overrides[SHADER] = shaderSource;
  if (fallbackSource) overrides[FALLBACK] = fallbackSource;

  const mods = await bundle(LIB_ENTRY, { overrides, reactShim: true });

  // ── O1 — the surface the owner is looking at mounts the canonical orb ──────
  const nbm = fs.readFileSync(NEXT_BEST_MOVE, 'utf8');
  const mountLine = (nbm.match(/<GalileoOrb[^>]*size=\{52\}[^>]*\/>/) || [''])[0];
  check('O1', 'the main interface mounts the canonical Galileo orb at its real size',
    /state=\{orbState\}/.test(mountLine) && /size=\{52\}/.test(mountLine)
    && /decorative/.test(mountLine) && !/emerge/.test(mountLine)
    && /What Galileo Found/.test(nbm),
    mountLine || 'mount line not found');

  // ── O2 — the renderer is handed a valid size and a live context ────────────
  const live = mount({ mods });
  check('O2', 'the renderer receives a valid non-zero size and draws a real frame',
    !live.error && live.canvas.width === 104 && live.canvas.height === 104
    && (live.state.drawArrays || 0) > 0 && (live.state.uniform1f.uRadius || 0) > 1
    && (live.state.uniform1f.uBright || 0) > 0.2 && (live.state.uniform2f.uRes || [0, 0])[0] === 104
    && Number.isFinite(live.state.uniform1f.uBreath) && live.state.uniform1f.uBreath > 0
    && !live.fallback,
    live.error ? String(live.error) : `canvas=${live.canvas.width}x${live.canvas.height} draws=${live.state.drawArrays} r=${live.state.uniform1f.uRadius} bright=${live.state.uniform1f.uBright} breath=${live.state.uniform1f.uBreath}`);

  // ── O3 — a visible frame OR the visible fallback is present ────────────────
  // Measured from the uniforms the renderer ACTUALLY sent, never from intent.
  const captured = capturedU(live);
  const smallM = measure(captured);
  const arrival = buildUniforms({ size: 360, dpr: 2, state: 'idle', intelligence: 40, at: 11 }, mods);
  const arrivalM = measure(arrival.U);
  check('O3', 'a frame with real light is on screen at the main interface size',
    smallM.rimPeak >= FLOORS.rimPeak && smallM.facePeak >= FLOORS.facePeak && smallM.litFraction >= FLOORS.litFraction,
    `rim=${smallM.rimPeak.toFixed(3)} face=${smallM.facePeak.toFixed(3)} lit=${(smallM.litFraction * 100).toFixed(2)}%`);
  check('O3b', 'the main-interface orb keeps the arrival\'s visual identity, at a lower intensity',
    smallM.rimPeak <= arrivalM.rimPeak + 0.6 && smallM.rimPeak >= FLOORS.rimPeak,
    `small=${smallM.rimPeak.toFixed(3)} arrival=${arrivalM.rimPeak.toFixed(3)}`);

  // ── O4 — an empty framebuffer can never stay on screen ────────────────────
  const empty = mount({ mods, frame: 'zero' });
  check('O4', 'a renderer that produced nothing degrades to the static sphere, never a black circle',
    !empty.error && empty.fallback === true && (empty.state.drawArrays || 0) >= 1,
    `fallback=${empty.fallback} draws=${empty.state.drawArrays}`);

  // ── O5 — a hidden tab pauses without clearing the frame ───────────────────
  const hiddenTab = mount({ mods, tabHidden: true });
  const afterHidden = hiddenTab.pump(3);
  check('O5', 'a hidden tab stops drawing but keeps the last frame (never blanked)',
    !hiddenTab.error && (hiddenTab.state.clears || 0) === 0 && afterHidden === 0
    && (hiddenTab.state.drawArrays || 0) >= 0 && !hiddenTab.fallback,
    `clears=${hiddenTab.state.clears} drawsAfterPause=${afterHidden} fallback=${hiddenTab.fallback}`);

  // ── O6 — offscreen pauses without clearing the frame ──────────────────────
  const off = mount({ mods, offscreen: true });
  off.observers.forEach((cb) => cb([{ isIntersecting: false }]));
  const afterOff = off.pump(3);
  check('O6', 'going offscreen stops drawing but preserves the last frame',
    !off.error && afterOff === 0 && (off.state.clears || 0) === 0 && !off.fallback
    && (off.state.uniform1f.uRadius || 0) > 1,
    `drawsAfterPause=${afterOff} clears=${off.state.clears} fallback=${off.fallback}`);

  // ── O7 — initialisation failure produces the fallback ─────────────────────
  const noCtx = mount({ mods, context: 'none' });
  check('O7', 'no WebGL context → the static Galileo sphere (never an empty circle)',
    !noCtx.error && noCtx.fallback === true,
    `fallback=${noCtx.fallback} error=${noCtx.error || 'none'}`);

  // ── O8 — reduced motion still shows Galileo ───────────────────────────────
  const still = mount({ mods, reduced: true });
  const { U: stillU } = buildUniforms({ size: 52, dpr: 1, state: 'idle', intelligence: 40, reduced: true, at: 2 }, mods);
  const stillM = measure(stillU);
  check('O8', 'reduced motion draws one coherent, visible frame',
    !still.error && (still.state.drawArrays || 0) === 1 && still.raf.length === 0
    && stillM.rimPeak >= FLOORS.rimPeak,
    `draws=${still.state.drawArrays} raf=${still.raf.length} rim=${stillM.rimPeak.toFixed(3)}`);

  // ── O9 — a route transition / re-init never leaves a dead canvas ──────────
  const again = live;
  const re2 = again.remountOnSameCanvas();
  check('O9', 're-initialising on the same canvas (route/scale change) still renders',
    !re2.error && re2.drew > 0,
    `draws=${re2.drew} error=${re2.error || 'none'}`);

  // ── O10 — small-size contrast, and the fallback's own light ───────────────
  const fbHtml = await (async () => {
    const ssr = await bundle(`
      import React from 'react';
      import { renderToString } from 'react-dom/server';
      import GalileoOrbFallback from '@/components/galileo/identity/GalileoOrbFallback';
      export const small = () => renderToString(<GalileoOrbFallback size={52} />);
    `, { overrides });
    globalThis.window = { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), devicePixelRatio: 1, location: { href: 'http://localhost/', search: '', origin: 'http://localhost' } };
    globalThis.SVGElement = globalThis.SVGElement || class {};
    delete globalThis.document;
    try { return ssr.small(); } catch (e) { return `ERROR ${e}`; }
  })();
  // The fallback's own light must survive at 52px. Read its RENDERED geometry —
  // the perimeter circle's stroke width and the peak opacity of its gradient —
  // because that is what a 41-pixel sphere actually shows: a black body is fine,
  // a body with no visible edge is a black circle.
  const rimCircles = [...fbHtml.matchAll(/<circle[^>]*r="40"[^>]*\/>/g)].map((m) => m[0]);
  const rimEdge = rimCircles.map((c) => {
    const w = Number((c.match(/stroke-width="([\d.]+)"/) || [])[1] || 0);
    const solid = Number((c.match(/stroke-opacity="([\d.]+)"/) || [])[1] || 1);
    const grad = (c.match(/stroke="url\(#([^"]+)\)"/) || [])[1];
    const stops = grad
      ? [...fbHtml.matchAll(new RegExp(`<linearGradient id="${grad}"[\\s\\S]*?</linearGradient>`, 'g'))]
        .flatMap((g) => [...g[0].matchAll(/stop-opacity="([\d.]+)"/g)].map((s) => Number(s[1])))
      : [];
    return { w, peak: stops.length ? Math.max(...stops, solid) : solid };
  });
  check('O10', 'the static fallback shows a visible Galileo perimeter at 52px',
    /data-orb-fallback="true"/.test(fbHtml) && rimEdge.length >= 2
    && rimEdge.some((e) => e.w >= 0.6 && e.peak >= 0.5),
    `perimeter=${JSON.stringify(rimEdge)}`);

  return failures;
}

/** --dump: every uniform the port was handed, and two sample points. */
async function dump(mods) {
  const { U } = buildUniforms({ size: 52, dpr: 2, state: 'idle', intelligence: 40, at: 11 }, mods);
  console.log('\n  UNIFORMS');
  Object.keys(U).sort().forEach((k) => console.log(`    ${k} = ${String(U[k])}`));
  console.log('\n  SAMPLES (52px @ DPR 2, centre = 52,52 device px)');
  [[52, 52], [52 + 41.6, 52], [52, 52 + 41.6], [70, 70]].forEach(([x, y]) => {
    console.log(`    (${x},${y}) → ${JSON.stringify(rasterSample(U, x, y))}`);
  });
  const n0 = ribbonNormal(U, 0);
  console.log('\n  TRACE');
  [0, 1, 2].forEach((fi) => {
    const n = ribbonNormal(U, fi);
    console.log(`    fi=${fi} n=${n.map((v) => v.toFixed(3)).join(',')} face=${ribbonAt(U, [0, 0, 1], n, fi, 1)} back=${ribbonAt(U, [0, 0, -1], n, fi, 0.5)} limb=${ribbonAt(U, [1, 0, 0], n, fi, 0)}`);
  });
  console.log(`    centre parts = ${JSON.stringify(rasterSample(U, 52, 52).parts)}`);
  console.log(`    hash3(1.2,3.4,5.6) = ${hash3(1.2, 3.4, 5.6)}`);
  console.log(`    vnoise(1.2,3.4,5.6) = ${vnoise(1.2, 3.4, 5.6)}`);
  console.log(`    ribbonNormal(0) = ${JSON.stringify(n0)}`);
  console.log(`    ribbonAt(face) = ${ribbonAt(U, [0, 0, 1], n0, 0, 1)}`);
  console.log(`    ribbonAt(limb) = ${ribbonAt(U, [1, 0, 0], n0, 0, 0)}`);
  console.log('');
}

// ════════════════════════════════════════════════════════════════════════════
(async () => {
  const mods = await bundle(LIB_ENTRY, { reactShim: true });
  if (process.argv.includes('--dump')) { await dump(mods); return; }
  if (process.argv.includes('--probe')) { await probe(mods); return; }

  const TOTAL = 11;
  const baseline = await runChecks();
  console.log('\n  GALILEO MAIN INTERFACE ORB — VISIBLE-RENDER CERTIFICATION');
  console.log(`  checks     : ${TOTAL - baseline.length}/${TOTAL} PASS`);
  baseline.forEach((f) => console.log(`  FAIL  ${f}`));

  const orbSrc = fs.readFileSync(ORB, 'utf8');
  const shaderSrc = fs.readFileSync(SHADER, 'utf8');
  const fbSrc = fs.readFileSync(FALLBACK, 'utf8');
  const mutations = [
    { name: 'M-NANBREATH the breathing uniform is derived from the name again (undefined → NaN → black disc)',
      shaderSource: shaderSrc.replace('breath: u.breathe,', 'breath: u.breath,'),
      mustFail: 'O2' },
    { name: 'M-LOSTCTX  the context is destroyed on dispose, so a re-init draws nothing',
      shaderSource: shaderSrc.replace('gl.deleteShader(fs);', "gl.deleteShader(fs);\n      gl.getExtension('WEBGL_lose_context')?.loseContext?.();"),
      mustFail: 'O9' },
    { name: 'M-NOGATE   an empty framebuffer is left on screen as a black circle',
      orbSource: orbSrc.replace('setFallback(true);\n          return undefined;', 'return undefined;'),
      mustFail: 'O4' },
    { name: 'M-DARKFB   the fallback\'s light is thinned away at small sizes',
      fallbackSource: fbSrc.replace('strokeWidth="0.9"', 'strokeWidth="0.2"').replace('peak={0.9} at={0.35}', 'peak={0.08} at={0.35}'),
      mustFail: 'O10' },
  ];
  let caught = 0;
  for (const m of mutations) {
    const applied = (m.orbSource && m.orbSource !== orbSrc)
      || (m.shaderSource && m.shaderSource !== shaderSrc)
      || (m.fallbackSource && m.fallbackSource !== fbSrc);
    const res = await runChecks(m);
    const hit = applied && res.some((f) => f.startsWith(`${m.mustFail} `));
    if (hit) caught += 1;
    console.log(`  ${hit ? 'CAUGHT' : 'MISSED'}  ${m.name}`);
  }
  console.log(`  mutations  : ${caught}/${mutations.length} CAUGHT`);
  const okAll = baseline.length === 0 && caught === mutations.length;
  console.log(okAll ? '  GALILEO MAIN INTERFACE ORB — ALL CHECKS PASS\n' : '  GALILEO MAIN INTERFACE ORB — NOT CERTIFIED\n');
  process.exit(okAll ? 0 : 1);
})();