#!/usr/bin/env node
/**
 * GALILEO IDENTITY CONTRACT — one canonical Galileo, everywhere.
 *
 * The GL context here is not a stub that returns "lit": readPixels computes the
 * pixels the shader WOULD produce, from the uniforms the real renderer sent, via
 * the canonical CPU port. So "the arrival fell back to a still" is detected the
 * same way it happened in the product.
 *
 *   node src/scripts/galileoIdentity.test.cjs
 */
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'scripts') walk(rel, out); } else if (/\.(jsx?|tsx?)$/.test(e.name)) out.push(rel);
  }
  return out;
}

async function bundle(entry, sources = {}) {
  const plugins = [{
    name: 'alias',
    setup(build) {
      build.onResolve({ filter: /^@\// }, (a) => {
        const base = path.join(ROOT, 'src', a.path.slice(2));
        const hit = ['', '.js', '.jsx'].map((x) => base + x).find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
        return { path: hit };
      });
      build.onLoad({ filter: /\.(js|jsx)$/ }, (a) => {
        const rel = path.relative(ROOT, a.path);
        if (sources[rel]) return { contents: sources[rel], loader: 'jsx' };
        return undefined;
      });
      build.onResolve({ filter: /^react(\/jsx-runtime|\/jsx-dev-runtime)?$/ }, () => ({ path: 'react-shim', namespace: 'shim' }));
      build.onLoad({ filter: /.*/, namespace: 'shim' }, () => ({
        contents: `
          const useRef = (v) => globalThis.__HOOKS__.ref(v);
          const useEffect = (fn) => globalThis.__HOOKS__.effect(fn);
          const useState = (v) => globalThis.__HOOKS__.state(v);
          const jsx = (type, props) => ({ type, props });
          module.exports = { __esModule: true, default: { createElement: jsx }, useRef, useEffect, useState, jsx, jsxs: jsx, Fragment: 'frag' };`,
        loader: 'js',
      }));
    },
  }];
  const out = await esbuild.build({
    stdin: { contents: entry, resolveDir: ROOT, loader: 'jsx' },
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    loader: { '.js': 'jsx' }, logLevel: 'silent', plugins, define: { 'import.meta.env': '{}' },
  });
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', out.outputFiles[0].text)(mod, mod.exports, require);
  return mod.exports;
}

const ENTRY = `
  export * from '@/lib/galileo/orbField';
  export { ORB_SIZES, resolveOrbSize } from '@/lib/galileo/orbSizes';
  export { createOrbMotion } from '@/lib/galileo/orbMotion';
  export { orbProfile } from '@/lib/galileo/orbPresence';
  export { readContinuity } from '@/lib/galileo/orbContinuity';
  export { acknowledgementFor, ARRIVAL_OPTIONS } from '@/lib/galileo/arrivalContent';
  import GalileoOrb from '@/components/galileo/identity/GalileoOrb';
  import GalileoOrbFallback from '@/components/galileo/identity/GalileoOrbFallback';
  export { GalileoOrb, GalileoOrbFallback };
`;

// ── An emulating GL context ─────────────────────────────────────────────────
function emulatedGL(M) {
  const st = { u1: {}, u2: {}, draws: 0 };
  const V = () => ({ ...st.u1, uRes: st.u2.uRes });
  const gl = {
    COMPILE_STATUS: 1, LINK_STATUS: 2, VERTEX_SHADER: 3, FRAGMENT_SHADER: 4, ARRAY_BUFFER: 5, STATIC_DRAW: 6, FLOAT: 7, TRIANGLE_STRIP: 8, RGBA: 9, UNSIGNED_BYTE: 10,
    createShader: () => ({}), shaderSource() {}, compileShader() {}, getShaderParameter: () => true, deleteShader() {},
    createProgram: () => ({}), attachShader() {}, linkProgram() {}, getProgramParameter: () => true, deleteProgram() {},
    createBuffer: () => ({}), bindBuffer() {}, bufferData() {}, deleteBuffer() {}, getAttribLocation: () => 0,
    getUniformLocation: (p, name) => ({ name }), useProgram() {}, enableVertexAttribArray() {}, vertexAttribPointer() {}, viewport() {},
    uniform1f: (l, v) => { st.u1[l.name] = v; }, uniform2f: (l, x, y) => { st.u2[l.name] = [x, y]; },
    drawArrays() { st.draws += 1; st.last = V(); },
    readPixels(x, y, w, h, f, t, out) {
      const frame = st.last; const n = M.prepareOrb(frame);
      for (let j = 0; j < h; j += 1) for (let i = 0; i < w; i += 1) {
        const c = M.sampleOrb(frame, x + i + 0.5, y + j + 0.5, n); const k = (j * w + i) * 4;
        out[k] = c[0] * 255; out[k + 1] = c[1] * 255; out[k + 2] = c[2] * 255; out[k + 3] = c[3] * 255;
      }
    },
  };
  return { gl, st };
}

function mount(M, props, { reduced = false } = {}) {
  const { gl, st } = emulatedGL(M);
  const canvas = { style: {}, width: 0, height: 0, getContext: () => gl, addEventListener() {}, removeEventListener() {} };
  const effects = []; const sets = []; let refs = 0;
  globalThis.__HOOKS__ = {
    ref: (v) => (refs++ === 0 ? { current: canvas } : { current: v }),
    effect: (fn) => effects.push(fn),
    state: (v) => [typeof v === 'function' ? v() : v, (x) => sets.push(x)],
  };
  globalThis.window = { devicePixelRatio: 1, matchMedia: (q) => ({ matches: reduced && q.includes('reduce') }) };
  globalThis.document = { hidden: false };
  const raf = [];
  globalThis.requestAnimationFrame = (fn) => { raf.push(fn); return raf.length; };
  globalThis.cancelAnimationFrame = () => {};
  globalThis.IntersectionObserver = class { observe() {} disconnect() {} };
  const elm = M.GalileoOrb(props);
  const cleanup = effects[0]?.();
  const t0 = performance.now();
  const pump = (n, from = 40) => { for (let i = 0; i < n && raf.length; i += 1) raf.shift()(t0 + from + i * 40); };
  return { elm, st, fellBack: sets.includes(true), cleanup, pump };
}

function measure(M, V) {
  const n = M.prepareOrb(V); const [W, H] = V.uRes; let lit = 0; let disc = 0; let rim = 0;
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    const r = Math.hypot(x + 0.5 - W / 2, y + 0.5 - H / 2) / V.uRadius;
    if (r > 1.02) continue;
    const c = M.sampleOrb(V, x + 0.5, y + 0.5, n); const lum = Math.max(c[0], c[1], c[2]);
    disc += 1; if (lum > 0.12) lit += 1; if (r > 0.94) rim = Math.max(rim, lum);
  }
  return { litArea: lit / disc, rim };
}

const results = [];
const check = (id, label, ok, detail = '') => results.push({ id, label, ok: !!ok, detail });

async function run(sources = {}) {
  results.length = 0;
  const M = await bundle(ENTRY, sources);
  const files = walk('src').map((f) => ({ f, s: sources[f] ?? fs.readFileSync(path.join(ROOT, f), 'utf8') }));
  const presets = Object.keys(M.ORB_SIZES);

  // I1 — one renderer, one shader, one still painter
  const importers = (re) => files.filter(({ s }) => re.test(s)).map(({ f }) => f);
  const shaderUsers = importers(/from ['"][^'"]*orbShaderSource['"]/);
  const rendererUsers = importers(/from ['"][^'"]*\/orbShader['"]/);
  const legacy = ['src/components/galileo/arrival/ArrivalAcknowledgement.jsx', 'src/components/galileo/magicloop/GalileoEntry.jsx', 'src/components/galileo/magicloop/SaveBusinessMoment.jsx'].filter(exists);
  const identityDir = files.filter(({ f }) => f.includes('galileo/identity/'));
  const drawsOwnGeometry = identityDir.filter(({ s }) => /<ellipse|<circle|✦/.test(s)).map(({ f }) => f);
  check('I1', 'one canonical renderer: one shader, one GL renderer, no second drawing of Galileo',
    shaderUsers.length === 1 && /orbShader\.js$/.test(shaderUsers[0])
    && rendererUsers.length === 1 && /GalileoOrb\.jsx$/.test(rendererUsers[0])
    && !legacy.length && !drawsOwnGeometry.length,
    `shader=${shaderUsers} renderer=${rendererUsers} legacy=${legacy} ownGeometry=${drawsOwnGeometry}`);

  // I2 — surfaces request presets, never pixels or geometry
  const uses = files.flatMap(({ f, s }) => [...s.matchAll(/<GalileoOrb(?:Mark)?\b[^>]*>/g)].map((m) => ({ f, tag: m[0] })));
  const bad = uses.filter(({ tag }) => {
    const sz = tag.match(/size=(?:"([^"]+)"|\{([^}]+)\})/);
    if (!sz) return false;
    if (sz[1]) return !presets.includes(sz[1]);
    return !/^(px|size)$/.test(sz[2].trim()) || !/identity\//.test(tag);
  }).filter(({ f }) => !/identity\/(GalileoOrb|GalileoOrbFallback|GalileoOrbMark|GalileoPresence)\.jsx$/.test(f));
  check('I2', 'every Galileo surface requests a size preset', uses.length >= 8 && !bad.length,
    `uses=${uses.length} bad=${bad.map((b) => `${b.f}: ${b.tag}`).join(' | ')}`);

  // I3 — THE ROOT CAUSE: the emerging arrival orb must not fall back to a still
  const arrival = mount(M, { state: 'idle', size: 'hero', emerge: true, intelligence: 0 });
  check('I3', 'arrival (hero, emerging) renders the live canonical orb, not the fallback',
    !arrival.fellBack && arrival.st.draws >= 2 && arrival.st.last.uReveal < 0.2,
    `fellBack=${arrival.fellBack} draws=${arrival.st.draws} firstReveal=${arrival.st.last?.uReveal}`);

  // I4 — low Business Intelligence is still Galileo
  const lo = measure(M, M.stillUniforms({ size: 360, ratio: 0.5, intelligence: 0 }));
  const hi = measure(M, M.stillUniforms({ size: 360, ratio: 0.5, intelligence: 100 }));
  check('I4', 'at 0% intelligence Galileo keeps the same flowing identity as at 100%',
    lo.rim > 0.6 && hi.rim > 0.6 && lo.litArea / hi.litArea > 0.8,
    `lo=${JSON.stringify(lo)} hi=${JSON.stringify(hi)}`);

  // I5 — the fallback IS a paused canonical frame (reduced-motion frame == still frame)
  const still = mount(M, { state: 'idle', size: 'conversation', intelligence: 40 }, { reduced: true });
  const S = M.stillUniforms({ size: 232, ratio: 1, intelligence: 40 });
  const diffs = Object.keys(S).filter((k) => k !== 'uRes' && k !== 'uTime' && Math.abs((still.st.last?.[k] ?? NaN) - S[k]) > 1e-9);
  const fbSrc = sources['src/components/galileo/identity/GalileoOrbFallback.jsx'] ?? read('src/components/galileo/identity/GalileoOrbFallback.jsx');
  const stillSrc = read('src/lib/galileo/orbStill.js');
  check('I5', 'fallback = the canonical still frame (identical to the reduced-motion live frame)',
    !still.fellBack && !diffs.length && /<GalileoOrbStill/.test(fbSrc) && /sampleOrb/.test(stillSrc) && /stillUniforms/.test(stillSrc),
    `diffs=${diffs.join(',')}`);

  // I6 — small Galileo is never a black circle
  const pres = measure(M, M.stillUniforms({ size: 56, ratio: 2 }));
  const micro = measure(M, M.stillUniforms({ size: 18, ratio: 2 }));
  check('I6', 'presence and micro Galileo carry real light', pres.rim > 0.5 && pres.litArea > 0.15 && micro.rim > 0.4,
    `presence=${JSON.stringify(pres)} micro=${JSON.stringify(micro)}`);

  // I7 — continuity: ARRIVAL → choice → CONVERSATION is the same Galileo
  const reveal = sources['src/components/galileo/arrival/ArrivalReveal.jsx'] ?? read('src/components/galileo/arrival/ArrivalReveal.jsx');
  const presence = read('src/components/galileo/identity/GalileoPresence.jsx');
  const va = read('src/components/galileo/arrival/VisionArrival.jsx');
  const oneArrivalOrb = (reveal.match(/<GalileoOrb\b/g) || []).length === 1
    && /layoutId="galileo-presence"/.test(reveal) && /continuity="galileo"/.test(reveal)
    && /layoutId="galileo-presence"/.test(presence) && /continuity="galileo"/.test(presence)
    && !/'ack'/.test(va) && /acknowledgementFor\(selected\)/.test(reveal);
  for (const opt of M.ARRIVAL_OPTIONS) {
    const a = mount(M, { state: 'responding', size: 'hero', emerge: true, continuity: `galileo-${opt.value}` });
    a.pump(60);
    const before = a.st.last;
    a.cleanup?.();
    const saved = M.readContinuity(`galileo-${opt.value}`);
    const c = mount(M, { state: 'thinking', size: 'conversation', continuity: `galileo-${opt.value}` });
    const after = c.st.last;
    const dFlow = Math.abs(after.uFlow - before.uFlow);
    check(`I7.${opt.value}`, `ARRIVAL → "${opt.label}" → CONVERSATION continues the same Galileo`,
      oneArrivalOrb && !!saved && !c.fellBack && dFlow < 0.05 && after.uReveal === 1 && !!M.acknowledgementFor(opt.value),
      `oneArrivalOrb=${oneArrivalOrb} saved=${!!saved} dFlow=${dFlow.toFixed(4)} reveal=${after.uReveal}`);
  }

  // I8 — the SHELL is calm: constant, unrelated rates, no gusts, no jumps — while
  //      the interior clocks run at the requested 1.2–1.35× of the shell's.
  const motionSrc = read('src/lib/galileo/orbMotion.js');
  const mo = M.createOrbMotion({});
  const p = M.orbProfile('idle', {});
  const rates = []; let prev = mo.step(p, 0); let maxJump = 0; let dFlow = 0; let dInt = 0;
  for (let t = 1 / 30; t < 180; t += 1 / 30) {
    const u = mo.step(p, t);
    rates.push((u.flow - prev.flow) * 30);
    dFlow += u.flow - prev.flow; dInt += u.int - prev.int;
    maxJump = Math.max(maxJump, Math.abs(u.fold - prev.fold));
    prev = u;
  }
  const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
  const sd = Math.sqrt(rates.reduce((a, b) => a + (b - mean) ** 2, 0) / rates.length);
  const ratio = dInt / dFlow;
  check('I8', 'the shell drifts on constant, unrelated rates (no gusts, no jumps) while the interior runs ~1.3× it',
    sd / mean < 0.01 && maxJump < 0.01 && ratio > 1.2 && ratio < 1.35 && !/GUST_RATES|foldGust/.test(motionSrc),
    `cv=${(sd / mean).toFixed(4)} maxFoldStep=${maxJump.toFixed(5)} interior/shell=${ratio.toFixed(3)}`);

  // I9 — the INTERIOR is genuinely volumetric: more energy while Galileo works,
  //      sparse and faint (never a fill), and built from real depth terms.
  const orbSrc = read('src/lib/galileo/orbShaderSource.js');
  const fieldSrc = read('src/lib/galileo/orbField.js');
  const innerOf = (state) => {
    const V = M.stillUniforms({ size: 320, ratio: 1, state, intelligence: 60 });
    const n = M.prepareOrb(V);
    const n0 = M.prepareOrb({ ...V, uInner: 0 });
    const [W, H] = V.uRes;
    let peak = 0; let cover = 0; let disc = 0;
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
      const rr = Math.hypot(x + 0.5 - W / 2, y + 0.5 - H / 2) / V.uRadius;
      if (rr > 0.94) continue;
      const a = M.sampleOrb(V, x + 0.5, y + 0.5, n);
      const b = M.sampleOrb({ ...V, uInner: 0 }, x + 0.5, y + 0.5, n0);
      const d = Math.max(a[0], a[1], a[2]) - Math.max(b[0], b[1], b[2]);
      disc += 1; if (d > 0.02) cover += 1; peak = Math.max(peak, d);
    }
    return { peak, cover: cover / disc, V };
  };
  const idleIn = innerOf('idle');
  const anlzIn = innerOf('analyzing');
  const depthTerms = /interiorField/.test(orbSrc) && /interiorField/.test(fieldSrc)
    && /CORE_R/.test(orbSrc) && /CORE_R/.test(fieldSrc)
    && /smoothstep\(coreExit \+ 0\.06, coreExit - 0\.06, tc\)/.test(orbSrc)
    && /mix\(0\.5, 1\.3, smoothstep\(-z, z, tc\)\)/.test(orbSrc)
    && /uConv/.test(orbSrc) && /waveOut/.test(orbSrc);
  check('I9', 'the interior comes alive while Galileo works, stays sparse and faint, and carries real depth',
    idleIn.peak > 0.02 && anlzIn.peak > idleIn.peak * 1.2 && anlzIn.peak > 0.12 && anlzIn.peak < 0.45
      && anlzIn.cover < 0.3 && depthTerms,
    `idle=${idleIn.peak.toFixed(3)} analyzing=${anlzIn.peak.toFixed(3)} cover=${anlzIn.cover.toFixed(3)} depth=${depthTerms}`);

  // I10 — the interior leaves the SILHOUETTE, the crisp edge and the palette alone
  const withIn = measure(M, anlzIn.V);
  const without = measure(M, { ...anlzIn.V, uInner: 0 });
  const palette = /vec3 champ = vec3\(0\.94, 0\.8, 0\.55\);/.test(orbSrc)
    && /vec3 gold = vec3\(0\.84, 0\.66, 0\.4\);/.test(orbSrc)
    && /vec3 ivory = vec3\(1\.0, 0\.97, 0\.91\);/.test(orbSrc);
  check('I10', 'the interior never reaches the silhouette, the crisp edge or the palette',
    withIn.rim === without.rim && withIn.litArea < 0.75 && withIn.litArea < without.litArea + 0.2 && palette,
    `rimWith=${withIn.rim.toFixed(6)} rimWithout=${without.rim.toFixed(6)} litWith=${withIn.litArea.toFixed(3)} litWithout=${without.litArea.toFixed(3)} palette=${palette}`);

  return results.slice();
}

(async () => {
  const base = await run();
  console.log('GALILEO IDENTITY CONTRACT');
  base.forEach((r) => console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.id} ${r.label}${r.ok ? '' : ` — ${r.detail}`}`));
  const orb = read('src/components/galileo/identity/GalileoOrb.jsx');
  const revealSrc = read('src/components/galileo/arrival/ArrivalReveal.jsx');
  const mutations = [
    { name: 'probe judges the emerging (dark) first frame again', mustFail: 'I3',
      sources: { 'src/components/galileo/identity/GalileoOrb.jsx': orb.split('paint({ ...first, reveal: 1 });').join('paint(first);') } },
    { name: 'arrival gets its own size / no continuity', mustFail: 'I7.my_business',
      sources: { 'src/components/galileo/arrival/ArrivalReveal.jsx': revealSrc.replace(' continuity="galileo"', '') } },
    { name: 'fallback becomes wireframe rings again', mustFail: 'I1',
      sources: { 'src/components/galileo/identity/GalileoOrbFallback.jsx': 'import React from "react"; export default function GalileoOrbFallback(){ return <svg><ellipse rx="40" ry="30"/></svg>; }' } },
    { name: 'the interior fills the centre like a gold ball', mustFail: 'I9',
      sources: { 'src/lib/galileo/orbField.js': read('src/lib/galileo/orbField.js').replace('return acc * guard * 0.42;', 'return acc * guard * 3.0;') } },
    { name: 'the interior becomes a broad veil over the whole sphere', mustFail: 'I9',
      sources: { 'src/lib/galileo/orbField.js': read('src/lib/galileo/orbField.js').replace('let w = (0.020 + 0.014 * fract(seed * 1.7)) * soft;', 'let w = (0.020 + 0.014 * fract(seed * 1.7)) * soft * 20;') } },
  ];
  let caught = 0;
  for (const m of mutations) {
    const res = await run(m.sources);
    const hit = res.find((r) => r.id === m.mustFail);
    const ok = hit && !hit.ok;
    if (ok) caught += 1;
    console.log(`  ${ok ? 'CAUGHT' : 'MISSED'}  ${m.name}`);
  }
  const pass = base.every((r) => r.ok) && caught === mutations.length;
  console.log(`  checks ${base.filter((r) => r.ok).length}/${base.length} · mutations ${caught}/${mutations.length}`);
  console.log(pass ? '  GALILEO IDENTITY — CERTIFIED' : '  GALILEO IDENTITY — NOT CERTIFIED');
  process.exit(pass ? 0 : 1);
})();