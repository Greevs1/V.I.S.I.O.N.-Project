#!/usr/bin/env node
/**
 * galileoArrivalPolish.test.cjs — the arrival polish contract (G1–G16).
 *
 * WHAT THIS PROVES, AND WHAT IT DOES NOT
 *
 * The motion checks EXECUTE the real `createOrbMotion` against the real
 * `orbProfile` and read the parameters the shader is actually handed: that the
 * field never freezes, that it runs on several INDEPENDENT clocks, that a
 * discovery produces exactly ONE pulse, that thinking genuinely moves more than
 * idle, and that reduced motion stills all of it. Random starting phases are
 * pinned, so the numbers are deterministic.
 *
 * The typography and control checks parse the classes the components really
 * render (rendered through react-dom/server where a component is involved) and
 * compare them against the brief's ranges — contrast alphas, sizes, weights,
 * borders, radii and hover distances.
 *
 * What is NOT claimed here: how any of it LOOKS on a screen. This harness does
 * not watch Galileo move; it proves the motion exists, is independent, and is
 * within the intended envelope.
 *
 * Run: node src/scripts/galileoArrivalPolish.test.cjs
 */

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const MOTION = path.join(ROOT, 'src/lib/galileo/orbMotion.js');
const PRESENCE = path.join(ROOT, 'src/lib/galileo/orbPresence.js');
const SHADER = 'src/lib/galileo/orbShaderSource.js';
const ORB = 'src/components/galileo/identity/GalileoOrb.jsx';
const REVEAL = 'src/components/galileo/arrival/ArrivalReveal.jsx';
const ARRIVAL = 'src/components/galileo/arrival/VisionArrival.jsx';
const CHOICES = 'src/components/galileo/arrival/ArrivalChoices.jsx';
const CONTENT = 'src/lib/galileo/arrivalContent.js';

/** Identifiers that would mean real business data reached the visualization. */
const FORBIDDEN = [
  'business_id', 'profile_id', 'document_id', 'file_url', 'signed_url', 'signedUrl',
  'access_token', 'revenue', 'ebitda', 'net_profit', 'email', 'evidence', 'business_facts',
];

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

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
      return { contents: overrides[args.path], loader: args.path.endsWith('.jsx') ? 'jsx' : 'js' };
    });
  },
});

async function bundle(entry, { overrides = {} } = {}) {
  const out = await esbuild.build({
    stdin: { contents: entry, resolveDir: ROOT, loader: 'jsx' },
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    logLevel: 'silent', plugins: [aliasPlugin(overrides)],
    define: { 'import.meta.env': '{}' },
  });
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', out.outputFiles[0].text)(mod, mod.exports, require);
  return mod.exports;
}

/** Pin the motion's random starting phases, so every number below is stable. */
function withPinnedRandom(fn) {
  const original = Math.random;
  Math.random = () => 0.5;
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

/** Drive the real motion over simulated time and record what the shader gets. */
function sampleMotion(mod, state, { seconds = 20, fps = 60, reduced = false, intelligence = 0, emerge = false, at = null, to = null } = {}) {
  return withPinnedRandom(() => {
    const motion = mod.createOrbMotion({ reduced, emerge });
    const frames = [];
    const steps = Math.round(seconds * fps);
    for (let i = 0; i <= steps; i += 1) {
      const t = i / fps;
      const current = at != null && t >= at && to ? to : state;
      const p = mod.orbProfile(current, { intelligence, reduced });
      frames.push({ t, state: current, ...motion.step(p, t) });
    }
    return frames;
  });
}

const nearest = (frames, t) => frames.reduce((best, f) => (Math.abs(f.t - t) < Math.abs(best.t - t) ? f : best), frames[0]);
/** Contiguous windows, in seconds, during which `key` is active. */
function windows(frames, key) {
  const found = [];
  let start = null;
  frames.forEach((f) => {
    const on = f[key] >= 0;
    if (on && start == null) start = f.t;
    if (!on && start != null) { found.push([start, f.t]); start = null; }
  });
  if (start != null) found.push([start, frames[frames.length - 1].t]);
  return found;
}
const extent = (frames, key) => {
  const values = frames.map((f) => f[key]);
  return { min: Math.min(...values), max: Math.max(...values), range: Math.max(...values) - Math.min(...values) };
};
/** Total movement of the field's clocks over the whole window. */
const motionEnergy = (frames) => {
  const keys = ['flow', 'flow2', 'field', 'edge', 'migr'];
  let total = 0;
  for (let i = 1; i < frames.length; i += 1) keys.forEach((k) => { total += Math.abs(frames[i][k] - frames[i - 1][k]); });
  return total;
};
const rateOf = (frames, key, a = 2, b = 12) => (nearest(frames, b)[key] - nearest(frames, a)[key]) / (b - a);
/** Is this clock a small-integer multiple of another? (a visible re-sync) */
const nearIntegerRatio = (ratio, upTo = 8, tol = 0.03) => {
  for (let i = 1; i <= upTo; i += 1) {
    if (Math.abs(ratio - i) / i < tol) return true;
    if (Math.abs(1 / ratio - i) / i < tol) return true;
  }
  return false;
};

/** The className React renders for the element carrying `marker`. */
const classesAt = (src, marker) => {
  const at = src.indexOf(marker);
  if (at < 0) return '';
  const open = src.lastIndexOf('className="', at);
  if (open < 0) return '';
  const close = src.indexOf('"', open + 11);
  return close < 0 ? '' : src.slice(open + 11, close);
};
const numberIn = (s, re) => {
  const m = s.match(re);
  return m ? Number(m[1]) : null;
};
/**
 * An opacity on the 0–1 scale. Tailwind writes `text-white/[0.42]` in the bracket
 * form but `text-white/50` as a bare percentage, so both are normalised here.
 */
const alphaIn = (s, re) => {
  const v = numberIn(s, re);
  return v == null ? null : v > 1 ? v / 100 : v;
};

async function runChecks(sources = {}) {
  const failures = [];
  const check = (id, label, ok, detail = '') => { if (!ok) failures.push(`${id} ${label}${detail ? ` — ${detail}` : ''}`); };

  const overrides = {};
  if (sources.MOTION) overrides[MOTION] = sources.MOTION;
  if (sources.PRESENCE) overrides[PRESENCE] = sources.PRESENCE;

  const motionSrc = sources.MOTION ?? fs.readFileSync(MOTION, 'utf8');
  const presenceSrc = sources.PRESENCE ?? fs.readFileSync(PRESENCE, 'utf8');
  const shaderSrc = sources.SHADER ?? read(SHADER);
  const orbSrc = sources.ORB ?? read(ORB);
  const revealSrc = sources.REVEAL ?? read(REVEAL);
  const choicesSrc = sources.CHOICES ?? read(CHOICES);
  const contentSrc = sources.CONTENT ?? read(CONTENT);
  const shader = stripComments(shaderSrc);
  const revealCode = stripComments(revealSrc);

  const mod = await bundle(`
    export { createOrbMotion } from '@/lib/galileo/orbMotion';
    export { orbProfile, ORB_STATES } from '@/lib/galileo/orbPresence';
  `, { overrides });

  // ── G1 — Galileo is never frozen while waiting ───────────────────────────
  const idle = sampleMotion(mod, 'idle', { seconds: 20 });
  const idleEdge = rateOf(idle, 'edge');
  const idleFlow = rateOf(idle, 'flow');
  const migr6 = nearest(idle, 8).migr - nearest(idle, 2).migr;
  const breathe = extent(idle, 'breathe');
  const scale = extent(idle, 'scale');
  const bright = extent(idle, 'bright');
  const brightSwing = bright.range / bright.max;
  check('G1', 'idle is visibly animated — light travels, a membrane drifts, the field breathes',
    Math.abs(idleEdge) * 10 > 1.5
    && idleFlow * 10 > 0.6
    && Math.abs(migr6) > 0.4
    && breathe.range > 0.55
    && Math.max(Math.abs(1 - scale.min), Math.abs(scale.max - 1)) >= 0.01
    && Math.max(Math.abs(1 - scale.min), Math.abs(scale.max - 1)) <= 0.02
    && brightSwing > 0.01 && brightSwing < 0.2,
    `edge/10s=${(Math.abs(idleEdge) * 10).toFixed(2)} flow/10s=${(idleFlow * 10).toFixed(2)} migr6=${migr6.toFixed(2)} scale=±${(Math.max(Math.abs(1 - scale.min), Math.abs(scale.max - 1)) * 100).toFixed(2)}% brightness=${(brightSwing * 100).toFixed(1)}%`);

  // ── G2 — several INDEPENDENT clocks, never one rhythm ────────────────────
  const clocks = { flow: idleFlow, flow2: rateOf(idle, 'flow2'), field: rateOf(idle, 'field'), edge: idleEdge };
  const names = Object.keys(clocks);
  const pairs = [];
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      const a = Math.abs(clocks[names[i]]);
      const b = Math.abs(clocks[names[j]]);
      pairs.push({ a: names[i], b: names[j], spread: Math.abs(a - b) / Math.max(a, b), ratio: a / b });
    }
  }
  const tooClose = pairs.filter((p) => p.spread < 0.05);
  const resonant = pairs.filter((p) => nearIntegerRatio(p.ratio));
  check('G2', 'the field runs on several independent clocks — none equal, none re-syncing',
    names.length === 4
    && Object.values(clocks).every((r) => Math.abs(r) > 0.01)
    && tooClose.length === 0 && resonant.length === 0,
    tooClose.length || resonant.length
      ? `close=${tooClose.map((p) => `${p.a}/${p.b}`).join(',')} resonant=${resonant.map((p) => `${p.a}/${p.b}`).join(',')}`
      : `rates=${names.map((n) => `${n}:${Math.abs(clocks[n]).toFixed(4)}`).join(' ')}`);

  // ── G3 — travel and deformation, not a rotating ball ─────────────────────
  // Two perimeter highlights on different clocks and in opposite directions, each
  // warped so its angular speed is non-uniform; the membranes are deformed by a
  // non-periodic noise field, so nothing about this is rigid rotation.
  const bandA = /sin\(ang \* 2\.0 - uFlow \* 6\.0/.test(shader);
  const bandB = /sin\(ang \* 3\.0 \+ uEdge \* 3\.2 \+ warp\)/.test(shader);
  const omegaA = 6 * Math.abs(idleFlow);
  const omegaB = 3.2 * Math.abs(idleEdge);
  check('G3', 'the perimeter is travelling light on two opposite clocks, not one rigid rotation',
    bandA && bandB && /warp/.test(shader)
    && !/mat2|mat3|uRotat/i.test(shader)
    && /vnoise/.test(shader) && /fi \* 2\.399/.test(shader)
    && Math.abs(omegaA - omegaB) / Math.max(omegaA, omegaB) > 0.15,
    `ωA=${omegaA.toFixed(3)} ωB=${omegaB.toFixed(3)}`);

  // ── G4 — a state doing more work genuinely moves more ────────────────────
  const busy = motionEnergy(sampleMotion(mod, 'thinking', { seconds: 6 }));
  const quiet = motionEnergy(sampleMotion(mod, 'idle', { seconds: 6 }));
  const idleProfile = mod.orbProfile('idle');
  const thinkingProfile = mod.orbProfile('thinking');
  const analyzingProfile = mod.orbProfile('analyzing');
  check('G4', 'thinking and analyzing are visibly richer than idle',
    busy / quiet > 1.25
    && thinkingProfile.flow > idleProfile.flow && thinkingProfile.travel > idleProfile.travel
    && thinkingProfile.fold > idleProfile.fold && thinkingProfile.micro > idleProfile.micro
    && analyzingProfile.ribbons > idleProfile.ribbons && analyzingProfile.flow > thinkingProfile.flow,
    `thinking/idle motion=${(busy / quiet).toFixed(2)} ribbons ${idleProfile.ribbons}/${analyzingProfile.ribbons}`);

  // ── G5 — discovery is ONE ordered sentence, with one restrained pulse ────
  const found = sampleMotion(mod, 'idle', { seconds: 14, at: 2, to: 'discovery' });
  const after = found.filter((f) => f.t > 7);
  const pulsePeak = extent(found, 'pulse').max;
  const convStart = windows(found, 'conv')[0] || [null, null];
  const waveStart = windows(found, 'wave')[0] || [null, null];
  const pulseStart = windows(found, 'pulse')[0] || [null, null];
  const steady = sampleMotion(mod, 'discovery', { seconds: 20 });
  // ONE wave, ONE ring: each event channel rises and never restarts while the
  // state is unchanged (a re-firing pulse would reset this).
  const monotone = (frames, key) => {
    const on = frames.filter((f) => f[key] >= 0);
    return on.length > 0 && on.every((f, i) => i === 0 || f[key] >= on[i - 1][key] - 1e-9);
  };
  check('G5', 'discovery converges, organises, brightens one region, sends one wave and one pulse, then settles',
    windows(found, 'conv').length === 1 && windows(found, 'org').length === 1
    && windows(found, 'focus').length === 1 && windows(found, 'wave').length === 1
    && windows(found, 'pulse').length === 1
    && convStart[0] < waveStart[0] && waveStart[0] <= pulseStart[0]
    && pulsePeak < 3.2
    && after.every((f) => f.conv === 0 && f.org === 0 && f.focus === 0 && f.wave === -1 && f.pulse === -1)
    && monotone(found, 'wave') && monotone(found, 'pulse') && monotone(steady, 'pulse')
    && windows(steady, 'pulse').length === 1,
    `pulse windows=${windows(found, 'pulse').length} peak=${pulsePeak.toFixed(2)} steady=${windows(steady, 'pulse').length} monotone=${monotone(found, 'pulse')}`);

  // ── G6 — crisp while it moves: per-device-pixel, no post-processing ──────
  check('G6', 'the edge stays sharp at full motion — device-pixel limb, DPR backing store, no blur pass',
    /lw = 0\.7 \* uRatio/.test(shader) && /gl_FragCoord/.test(shader)
    && /Math\.min\(typeof window !== 'undefined' \? window\.devicePixelRatio \|\| 1 : 1, 2\.5\)/.test(orbSrc)
    && /canvas\.width = Math\.round\(px \* ratio\)/.test(orbSrc)
    && !/blur|framebuffer|postProcess|RenderTarget/i.test(shader));

  // ── G7 — reduced motion is respected, and the field is still ────────────
  const still = sampleMotion(mod, 'discovery', { seconds: 12, reduced: true, at: 0, to: 'discovery' });
  const frozenKeys = ['flow', 'flow2', 'field', 'edge', 'migr', 'conv', 'wave', 'pulse', 'scale', 'breathe'];
  const frozen = frozenKeys.every((k) => extent(still, k).range === 0);
  check('G7', 'reduced motion stills every clock, drops the events and the breathing swell',
    frozen && mod.orbProfile('discovery', { reduced: true }).flow === 0
    && /if \(still\) \{/.test(orbSrc) && /emerge=\{!reduced\}/.test(revealSrc)
    && /buildArrivalSequence\(\{ reduced \}\)/.test(revealSrc),
    `frozen=${frozen}`);

  // ── G8 — offscreen and backgrounded windows cost nothing ────────────────
  check('G8', 'rendering pauses offscreen and while the tab is hidden',
    /document\.hidden/.test(orbSrc) && /IntersectionObserver/.test(orbSrc)
    && /!visible/.test(orbSrc) && /cancelAnimationFrame/.test(orbSrc));

  // ── G9 — the lower interaction text is readable ─────────────────────────
  const eyebrow = classesAt(revealCode, '{ARRIVAL_COPY.invitationLead}');
  const question = classesAt(revealCode, '{ARRIVAL_COPY.invitation}');
  const note = classesAt(revealCode, '{ARRIVAL_COPY.noAccount}');
  const qAlpha = numberIn(question, /text-white\/\[([\d.]+)\]/);
  const qSize = numberIn(question, /text-\[([\d.]+)px\]/);
  const qBig = numberIn(question, /md:text-\[([\d.]+)px\]/);
  const eAlpha = numberIn(eyebrow, /text-white\/\[([\d.]+)\]/);
  const nAlpha = numberIn(note, /text-white\/\[([\d.]+)\]/);
  check('G9', 'the final question dominates, the eyebrow reads, the note stays subtle',
    qAlpha != null && qAlpha >= 0.9 && qSize >= 15 && qSize <= 17 && qBig >= 16 && qBig <= 18
    && /font-medium/.test(question)
    && eAlpha != null && eAlpha >= 0.48 && eAlpha <= 0.58
    && /uppercase/.test(eyebrow) && /tracking-\[0\.24em\]/.test(eyebrow)
    && nAlpha != null && nAlpha >= 0.38 && nAlpha <= 0.45,
    `question=${qAlpha}@${qSize}/${qBig}px eyebrow=${eAlpha} note=${nAlpha}`);

  // ── G10–G13 — the choices, as they are actually rendered ────────────────
  const ssr = await bundle(`
    import React from 'react';
    import { renderToString } from 'react-dom/server';
    import ArrivalChoices from '@/components/galileo/arrival/ArrivalChoices';
    import { ARRIVAL_OPTIONS } from '@/lib/galileo/arrivalContent';
    // The RESTING state is what the visitor meets; the CHOSEN state is what a
    // selection looks like. Both are asserted.
    export const resting = () => renderToString(
      <ArrivalChoices options={ARRIVAL_OPTIONS} onChoose={() => {}} />
    );
    export const chosen = () => renderToString(
      <ArrivalChoices options={ARRIVAL_OPTIONS} onChoose={() => {}} selected="my_business" />
    );
  `, { overrides: sources.CHOICES ? { [path.join(ROOT, CHOICES)]: sources.CHOICES } : {} });

  let html = '';
  let chosenHtml = '';
  try { html = ssr.resting(); chosenHtml = ssr.chosen(); } catch (e) { html = `ERROR ${e}`; }
  const cards = html.match(/class="[^"]*group relative[^"]*"/g) || [];
  const card = (cards[0] || '').replace(/^class="|"$/g, '');
  const title = (html.match(/class="block text-\[[\d.]+px\][^"]*"/g) || [''])[0];
  const desc = (html.match(/class="mt-0\.5 block[^"]*"/g) || [''])[0];
  const borderAlpha = alphaIn(card, /(?:^|\s)border-vision-champagne\/([\d.]+)/);
  const hoverBorder = alphaIn(card, /hover:border-vision-champagne\/([\d.]+)/);
  const radius = numberIn(card, /rounded-\[([\d.]+)px\]/);
  const minH = numberIn(card, /min-h-\[([\d.]+)px\]/);
  const lift = numberIn(card, /hover:-translate-y-\[([\d.]+)px\]/);

  check('G10', 'both choices render as visible surfaces with a champagne edge and an arrow',
    /My Business/.test(html) && /I run it/.test(html) && /A Client/.test(html) && /I advise them/.test(html)
    && cards.length === 2 && (html.match(/<svg/g) || []).length === 2
    && borderAlpha != null && borderAlpha >= 0.2 && borderAlpha <= 0.35
    && /from-white\/\[0\.035\] to-white\/\[0\.012\]/.test(card)
    && /inset_0_1px_0_rgba\(255,255,255/.test(card),
    `cards=${cards.length} border=${borderAlpha}`);

  check('G11', 'title, supporting line and arrow carry the new hierarchy',
    numberIn(title, /text-\[([\d.]+)px\]/) >= 14 && numberIn(title, /text-\[([\d.]+)px\]/) <= 15
    && /font-medium/.test(title) && numberIn(title, /text-white\/\[([\d.]+)\]/) >= 0.9
    && numberIn(desc, /text-\[([\d.]+)px\]/) >= 11.5 && numberIn(desc, /text-\[([\d.]+)px\]/) <= 12.5
    && alphaIn(desc, /(?:^|\s)text-white\/([\d.]+)/) < numberIn(title, /text-white\/\[([\d.]+)\]/)
    && /text-vision-champagne/.test(html) && /stroke-width="1.5"/.test(html),
    `title=${numberIn(title, /text-\[([\d.]+)px\]/)}px/${numberIn(title, /text-white\/\[([\d.]+)\]/)}`);

  check('G12', 'hover lifts, warms the edge and moves the arrow — with no glow',
    lift != null && lift >= 1 && lift <= 2
    && hoverBorder != null && hoverBorder >= 0.4
    && /group-hover:translate-x-1/.test(html)
    && /transition-\[color,background-color,border-color,box-shadow,transform\]/.test(card)
    && /duration-200/.test(card)
    && !/blur|drop-shadow|shadow-\[0_0_[2-9]/.test(html),
    `lift=${lift}px hoverBorder=${hoverBorder}`);

  check('G13', 'keyboard focus stays visible and the controls are real buttons',
    /<button/.test(html) && /aria-pressed="false"/.test(html)
    && /focus-visible:border-vision-champagne\/70/.test(card)
    && /focus-visible:ring-2/.test(card)
    && /focus-visible:outline-none/.test(card));

  // ── G14 — the choice is answered before the conversation takes over ──────
  const confirmMs = numberIn(revealCode, /const CHOICE_CONFIRM_MS = (\d+);/);
  check('G14', 'the chosen card confirms and Galileo answers it, without delaying the handoff',
    confirmMs != null && confirmMs > 60 && confirmMs <= 400
    && /setSelected\(value\)/.test(revealCode) && /setReacting\(true\)/.test(revealCode)
    && /reacting \? 'responding' : 'idle'/.test(revealCode)
    && /selected=\{selected\}/.test(revealCode)
    // …and the chosen surface says so, rather than looking like the resting one.
    && /aria-pressed="true"/.test(chosenHtml) && /border-vision-champagne\/60/.test(chosenHtml)
    // The choice still reaches the existing conversation path, and the orb call
    // site is untouched.
    && /const choose = \(value\) => \{/.test(revealCode) && /onChoose\?\.\(value\)/.test(revealCode)
    && /<GalileoOrb state=\{orbState\} size="hero" intelligence=\{0\} emerge=\{!reduced\} continuity="galileo" \/>/.test(revealSrc),
    `confirm=${confirmMs}ms`);

  // ── G15 — the visualization's boundary is unchanged ─────────────────────
  const surface = [revealCode, stripComments(choicesSrc), stripComments(motionSrc), stripComments(presenceSrc), shader, stripComments(orbSrc)].join('\n');
  const leaked = [...new Set(FORBIDDEN.filter((k) => surface.includes(k)))];
  const orbCalls = revealCode.match(/<GalileoOrb[^>]*>/g) || [];
  check('G15', 'no business value, document or identity identifier reaches the visualization',
    leaked.length === 0 && orbCalls.length > 0
    && orbCalls.every((c) => /state=/.test(c) && /size=/.test(c) && !/value=|answers|facts|profile/.test(c)),
    leaked.length ? `found=${leaked.join(',')}` : `${orbCalls.length} orb call(s)`);

  // ── G16 — onboarding state and routing are untouched ────────────────────
  const content = await bundle(`
    export {
      resolveEntrySurface, shouldPlayArrivalSequence, INTRO_SEEN_KEY, ARRIVAL_FILM_KEY, ARRIVAL_ORB,
    } from '@/lib/galileo/arrivalContent';
  `, { overrides: sources.CONTENT ? { [path.join(ROOT, CONTENT)]: sources.CONTENT } : {} });
  global.window = {
    location: { search: '' },
    localStorage: { getItem: () => 'true', setItem() {} },
    sessionStorage: { getItem: () => null, setItem() {} },
  };
  // The FILM flag is set ('true' on localStorage above) and the SEQUENCE flag is not:
  // the introduction must still run. Conflating the two is the live defect.
  const filmSeenStillSeesIntroduction = content.shouldPlayArrivalSequence();
  delete global.window;
  check('G16', 'the onboarding decision, its durable flags and the journey timing are unchanged',
    content.resolveEntrySurface({}) === 'arrival'
    && content.resolveEntrySurface({ isHomeMode: true }) === 'home'
    && content.resolveEntrySurface({ authLoading: true }) === 'resolving'
    && content.resolveEntrySurface({ conversationStarted: true }) === 'loop'
    && content.INTRO_SEEN_KEY === 'vision_intro_completed'
    && content.ARRIVAL_FILM_KEY === 'vision_arrival_film_seen_v2'
    && filmSeenStillSeesIntroduction === true
    && /useState\(shouldPlayArrivalSequence\)/.test(read(ARRIVAL))
    && /cinematic \? 0 : questionStep/.test(revealSrc)
    && /const skip = useCallback/.test(revealCode));

  return failures;
}

const TOTAL = 16;

(async () => {
  const baseline = await runChecks();
  console.log('\n  GALILEO ARRIVAL POLISH — motion, typography and controls');
  console.log(`  checks     : ${TOTAL - baseline.length}/${TOTAL} PASS`);
  baseline.forEach((f) => console.log(`  FAIL  ${f}`));

  const motionFile = fs.readFileSync(MOTION, 'utf8');
  const presenceFile = fs.readFileSync(PRESENCE, 'utf8');
  const revealFile = read(REVEAL);
  const choicesFile = read(CHOICES);

  const mutations = [
    {
      name: 'M-FROZEN   the field stops advancing (a decorative still)',
      sources: () => ({ MOTION: motionFile.replace('S.phase = (S.phase + dt * cur.flow * slow * drift) % 997;', 'S.phase = S.phase % 997;') }),
      mustFail: ['G1'],
    },
    {
      name: 'M-RESTRAIN idle returns to the old, restrained liveliness',
      sources: () => ({ PRESENCE: presenceFile.replace('flow: 0.115, fold: 0.24, micro: 0.5', 'flow: 0.03, fold: 0.2, micro: 0.4') }),
      mustFail: ['G1'],
    },
    {
      name: 'M-ONECLOCK every clock runs at the same rate',
      sources: () => ({ MOTION: motionFile.replace('{ flow2: 0.0731, field: 0.0271, migr: 0.1807, edge: 0.2709 }', '{ flow2: 0.115, field: 0.115, migr: 0.115, edge: 0.115 }') }),
      mustFail: ['G2'],
    },
    {
      name: 'M-NOBREATH the breathing swell is removed',
      sources: () => ({ MOTION: motionFile.replace('scale: 1 + BREATH_SCALE * swell,', 'scale: 1,') }),
      mustFail: ['G1'],
    },
    {
      name: 'M-TWOPULSE discovery fires more than one outward ring',
      sources: () => ({ MOTION: motionFile.replace('pulse = tp >= 1.9 ? tp - 1.9 : -1;', 'pulse = tp >= 1.9 ? (tp - 1.9) % 1.2 : -1;') }),
      mustFail: ['G5'],
    },
    {
      name: 'M-DIM      the final question fades back into the black',
      sources: () => ({ REVEAL: revealFile.replace('text-white/[0.96] md:text-[17.5px]', 'text-white/40 md:text-[17.5px]') }),
      mustFail: ['G9'],
    },
    {
      name: 'M-FLAT     the choices go back to quiet dark containers',
      sources: () => ({ CHOICES: choicesFile.replace('border-vision-champagne/25 shadow-', 'border-white/[0.06] shadow-').replace('from-white/[0.035] to-white/[0.012]', 'from-transparent to-transparent') }),
      mustFail: ['G10'],
    },
    {
      name: 'M-NOANSWER the selection no longer reaches Galileo',
      sources: () => ({ REVEAL: revealFile.replace("reacting ? 'responding' : 'idle'", "'idle'") }),
      mustFail: ['G14'],
    },
    {
      name: 'M-LEAK     a business value is handed to the orb',
      sources: () => ({ REVEAL: revealFile.replace('<GalileoOrb state={orbState} size="hero" intelligence={0} emerge={!reduced} continuity="galileo" />', '<GalileoOrb state={orbState} size="hero" intelligence={0} emerge={!reduced} continuity="galileo" revenue={1} />') }),
      mustFail: ['G15', 'G14'],
    },
  ];

  let caught = 0;
  for (const m of mutations) {
    const applied = Object.values(m.sources()).some((s, i) => s !== [motionFile, presenceFile, revealFile, choicesFile][i]);
    const res = await runChecks(m.sources());
    const hit = applied && m.mustFail.every((id) => res.some((f) => f.startsWith(`${id} `)));
    if (hit) caught += 1;
    console.log(`  ${hit ? 'CAUGHT' : 'MISSED'}  ${m.name}`);
  }
  console.log(`  mutations  : ${caught}/${mutations.length} APPLIED + BEHAVIOR_CHANGED + CAUGHT`);

  const ok = baseline.length === 0 && caught === mutations.length;
  console.log('');
  console.log(`  GALILEO ARRIVAL POLISH — ${ok ? 'ALL CHECKS PASS' : 'NOT CERTIFIED'}`);
  console.log('  NOTE: the motion parameters were EXECUTED and measured; how they look');
  console.log('        on a screen was NOT observed here and is not claimed.');
  console.log('');
  process.exit(ok ? 0 : 1);
})();