/**
 * galileoOrbRuntime.test.cjs — RUNTIME proof that Galileo can actually render.
 *
 * Static source checks passed while the orb crashed on mount (a TDZ
 * ReferenceError). This harness EXECUTES the real code instead:
 *
 *   R1–R6  the real GalileoOrb, bundled with esbuild, its mount effect actually
 *          run against a recording canvas: frames draw, nothing throws, a missing
 *          or throwing 2D context degrades to the static fallback, and reduced
 *          motion draws exactly one frame with no loop.
 *   R7–R9  the real VisionArrival / ArrivalReveal rendered with react-dom/server:
 *          the orb's canvas, the brief's copy and the render-path probe are in
 *          the actual markup.
 *   R10    the real entry decision: a signed-in visitor WITHOUT a business gets
 *          the arrival (the live defect), an owner gets Home.
 *
 * Mutations re-inject the TDZ crash and the anonymous-only gate; both must be caught.
 *
 * Run: node src/scripts/galileoOrbRuntime.test.cjs
 */

const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '../..');
const ORB = path.join(ROOT, 'src/components/galileo/identity/GalileoOrb.jsx');
const CONTENT = path.join(ROOT, 'src/lib/galileo/arrivalContent.js');

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

// ── A recording WebGL context: any method is accepted and counted (shader
//    compile/link status reads return truthy, so the real renderer is built) ──
function recordingContext() {
  const calls = {};
  const gradient = { addColorStop() {} };
  return {
    calls,
    ctx: new Proxy({}, {
      get(_, key) {
        if (key === 'createRadialGradient') return () => gradient;
        return (...a) => { calls[key] = (calls[key] || 0) + 1; return a; };
      },
      set() { return true; },
    }),
  };
}

function mountOrb(GalileoOrb, { context = 'ok', reduced = false, props = {} } = {}) {
  const rec = recordingContext();
  const canvas = {
    style: {},
    getContext: () => {
      if (context === 'throw') throw new Error('canvas unavailable');
      return context === 'null' ? null : rec.ctx;
    },
  };
  const effects = [];
  const fallbackSets = [];
  let refIndex = 0;
  const raf = [];
  globalThis.__HOOKS__ = {
    ref: (v) => (refIndex++ === 0 ? { current: canvas } : { current: v }),
    effect: (fn) => effects.push(fn),
    state: (v) => [typeof v === 'function' ? v() : v, (x) => fallbackSets.push(x)],
  };
  globalThis.window = {
    devicePixelRatio: 2,
    location: { href: 'http://localhost/', search: '', origin: 'http://localhost' },
    matchMedia: (q) => ({ matches: reduced && q.includes('reduce') }),
  };
  globalThis.document = { hidden: false };
  globalThis.requestAnimationFrame = (fn) => { raf.push(fn); return raf.length; };
  globalThis.cancelAnimationFrame = () => {};

  let error = null;
  let cleanup;
  try {
    GalileoOrb({ state: 'idle', size: 220, intelligence: 40, ...props });
    cleanup = effects[0]?.();
    for (let i = 0; i < 3 && raf.length; i += 1) raf.shift()(performance.now() + i * 16);
  } catch (e) { error = e; }
  return { error, calls: rec.calls, fallbackSets, rafQueued: raf.length, cleanup };
}

async function runChecks({ orbSource, reimaginedSource } = {}) {
  const failures = [];
  const check = (id, label, ok, detail = '') => { if (!ok) failures.push(`${id} ${label}${detail ? ` — ${detail}` : ''}`); };

  const overrides = orbSource ? { [ORB]: orbSource } : {};
  const { default: GalileoOrb } = await bundle(
    "export { default } from '@/components/galileo/identity/GalileoOrb';",
    { overrides, reactShim: true },
  );

  const ok = mountOrb(GalileoOrb);
  check('R1', 'the orb mounts without throwing', !ok.error, ok.error && String(ok.error));
  check('R2', 'the living WebGL surface actually draws (no silent fallback)',
    (ok.calls.drawArrays || 0) > 0 && (ok.calls.uniform1f || 0) > 0 && !ok.fallbackSets.includes(true),
    `drawArrays=${ok.calls.drawArrays || 0} fallback=${ok.fallbackSets.includes(true)}`);
  check('R3', 'the animation loop keeps running and can be cancelled',
    ok.rafQueued > 0 && typeof ok.cleanup === 'function');

  const nul = mountOrb(GalileoOrb, { context: 'null' });
  check('R4', 'no WebGL context → static fallback, never blank', !nul.error && nul.fallbackSets.includes(true));
  const thr = mountOrb(GalileoOrb, { context: 'throw' });
  check('R5', 'a throwing canvas → static fallback, never a crash', !thr.error && thr.fallbackSets.includes(true));
  const still = mountOrb(GalileoOrb, { reduced: true });
  check('R6', 'reduced motion → one coherent frame, no loop',
    !still.error && (still.calls.drawArrays || 0) === 1 && still.rafQueued === 0);

  // ── Real SSR of the arrival ───────────────────────────────────────────────
  const ssr = await bundle(`
    import React from 'react';
    import { renderToString } from 'react-dom/server';
    import VisionArrival from '@/components/galileo/arrival/VisionArrival';
    import GalileoOrbFallback from '@/components/galileo/identity/GalileoOrbFallback';
    export const arrival = () => renderToString(<VisionArrival showVideo={false} onEnter={() => {}} />);
    export const fallback = () => renderToString(<GalileoOrbFallback size={220} />);
  `);
  // A minimal, inert browser surface for module-level checks during the render.
  globalThis.window = {
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1,
    location: { href: 'http://localhost/', search: '', origin: 'http://localhost' },
  };
  globalThis.SVGElement = globalThis.SVGElement || class {};
  globalThis.HTMLElement = globalThis.HTMLElement || class {};
  delete globalThis.document;
  let html = '';
  const quiet = console.error;
  console.error = () => {};
  try { html = ssr.arrival(); } catch (e) { html = `ERROR ${e}`; }
  console.error = quiet;
  check('R7', 'the arrival renders the Galileo orb canvas', html.includes('<canvas') && html.includes('role="img"'), html.slice(0, 120));
  // The introduction is a SEQUENCE now: the first frame carries the orb and no
  // copy at all, and the choice is not on screen until the question is reached.
  check('R8', 'the arrival opens on Galileo alone — no stacked copy, no premature choice',
    html.includes('<canvas')
    && html.includes('data-vision-arrival="galileo-introduction"')
    && html.includes('data-vision-beat="form"')
    && !html.includes('Whose business are we exploring?')
    && !html.includes('My Business')
    && !html.includes('See what your business'));
  const SEQ = await bundle("export { buildArrivalSequence } from '@/lib/galileo/arrivalSequence';");
  const beats = SEQ.buildArrivalSequence({}).beats;
  const said = beats.map((b) => `${b.copy || ''} ${b.meet || ''} ${b.supporting || ''} ${b.lead || ''}`).join(' ');
  const kindIndex = (k) => beats.findIndex((b) => b.kind === k);
  check('R8b', 'the whole introduction is in the sequence, in the brief\'s order',
    said.includes('See what your business is really capable of.')
    && said.includes('Meet Galileo, your business intelligence.')
    && said.includes('begin showing you what deserves your attention')
    // THREE stages, in order — and nothing after the last one but the question.
    && kindIndex('hook') >= 0 && kindIndex('context') > kindIndex('hook')
    && kindIndex('context') === beats.length - 1);
  check('R9', 'the render-path probe identifies the arrival', html.includes('data-vision-screen="galileo-arrival-v2"'));
  const fb = ssr.fallback();
  check('R9b', 'the static fallback keeps the same footprint', fb.includes('width:220px') && fb.includes('<svg') && !fb.includes('✦'));

  // ── The real entry decision, and that the page uses it ───────────────────
  const C = await bundle("export { resolveEntrySurface } from '@/lib/galileo/arrivalContent';");
  const reimagined = reimaginedSource ?? fs.readFileSync(path.join(ROOT, 'src/pages/galileo/GalileoReimagined.jsx'), 'utf8');
  check('R10', 'a signed-in visitor without a business gets the arrival; an owner gets Home',
    C.resolveEntrySurface({ isHomeMode: false }) === 'arrival'
    && C.resolveEntrySurface({ isHomeMode: true }) === 'home'
    && C.resolveEntrySurface({ authLoading: true }) === 'resolving'
    && /if \(surface === 'arrival'\)/.test(reimagined)
    && /<VisionArrival/.test(reimagined)
    && !/!home\.isAuthenticated\) \{\s*return <VisionArrival/.test(reimagined));

  return failures;
}

(async () => {
const TOTAL = 12;
const baseline = await runChecks();
console.log('\n  GALILEO ORB — RUNTIME RENDER CERTIFICATION');
console.log(`  checks     : ${TOTAL - baseline.length}/${TOTAL} PASS`);
baseline.forEach((f) => console.log(`  FAIL  ${f}`));

const orbSrc = fs.readFileSync(ORB, 'utf8');
const reimSrc = fs.readFileSync(path.join(ROOT, 'src/pages/galileo/GalileoReimagined.jsx'), 'utf8');
const mutations = [
  { name: 'M-TDZ      the orb reads its geometry before declaring it', orbSource: orbSrc.replace('const clarity = size >= 100', 'const clarity = W >= 100'), mustFail: 'R2' },
  { name: 'M-BLANK    a missing context leaves blank space', orbSource: orbSrc.replace("if (!gl) {\n      setFallback(true);", 'if (!gl) {\n      void 0;'), mustFail: 'R4' },
  { name: 'M-ANONGATE the arrival is anonymous-only again', reimaginedSource: reimSrc.replace("if (surface === 'arrival') {", 'if (arrivalOpen && !home.isAuthenticated) {\n    return <VisionArrival />;\n  }\n  if (false) {'), mustFail: 'R10' },
];
let caught = 0;
for (const m of mutations) {
  const applied = (m.orbSource && m.orbSource !== orbSrc) || (m.reimaginedSource && m.reimaginedSource !== reimSrc);
  const res = await runChecks(m);
  const hit = applied && res.some((f) => f.startsWith(`${m.mustFail} `));
  if (hit) caught += 1;
  console.log(`  ${hit ? 'CAUGHT' : 'MISSED'}  ${m.name}`);
}
console.log(`  mutations  : ${caught}/${mutations.length} CAUGHT`);
const okAll = baseline.length === 0 && caught === mutations.length;
console.log(okAll ? '  GALILEO ORB RUNTIME — ALL CHECKS PASS\n' : '  GALILEO ORB RUNTIME — NOT CERTIFIED\n');
process.exit(okAll ? 0 : 1);
})();