#!/usr/bin/env node
/**
 * GALILEO PRESENCE — the orb's truthfulness, privacy and motion contract.
 *
 * The orb is the one part of this experience that could quietly lie. It could
 * pulse when nothing was discovered, claim "analyzing" during a fake delay, or
 * become a surface through which business data leaks into presentation. This
 * harness asserts each of those is structurally impossible, on the REAL modules:
 *
 *   src/lib/galileo/orbPresence.js                              (the state contract)
 *   src/components/galileo/identity/GalileoOrb.jsx              (the renderer)
 *   src/components/galileo/identity/GalileoOrbMark.jsx          (the light identity)
 *   src/components/galileo/identity/GalileoDiscoveryMoment.jsx  (the reveal)
 *
 * Mutations: M-COHERENCE (intelligence stops mattering), M-PULSE (idle celebrates),
 * M-DATA (a business value reaches the renderer).
 */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const ORB_MODULE = 'src/lib/galileo/orbPresence.js';
const ORB = 'src/components/galileo/identity/GalileoOrb.jsx';
const MARK = 'src/components/galileo/identity/GalileoOrbMark.jsx';
const MOMENT = 'src/components/galileo/identity/GalileoDiscoveryMoment.jsx';

const quiet = { log() {}, warn() {}, error() {}, info() {} };
const stripImports = (s) => s.replace(/^\s*import[\s\S]*?from\s+'[^']+';/gm, '').replace(/^\s*export\s+/gm, '');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const toJs = (s) => esbuild.transformSync(s, { loader: 'js', format: 'cjs', target: 'es2020' }).code;

/** Identifiers that would mean real business data reached the visualization. */
const FORBIDDEN = [
  'business_id', 'profile_id', 'document_id', 'document_analysis_id', 'file_url', 'file_path',
  'signed_url', 'signedUrl', 'accessToken', 'access_token', 'revenue', 'ebitda', 'net_profit',
  'email', 'evidence', 'business_facts', 'answers',
];

const BASELINE = [];
const check = (id, label, ok, detail = '') => {
  if (!ok) BASELINE.push(`${id} ${label}${detail ? ` — ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}${!ok && detail ? ` — ${detail}` : ''}`);
};

async function runChecks(sources = {}) {
  const local = [];
  const expect = (id, label, ok, detail = '') => {
    if (!ok) local.push(`${id} ${label}${detail ? ` — ${detail}` : ''}`);
  };

  const moduleSrc = sources.ORB_MODULE ?? read(ORB_MODULE);
  const orbSrc = sources.ORB ?? read(ORB);
  const markSrc = sources.MARK ?? read(MARK);
  const momentSrc = sources.MOMENT ?? read(MOMENT);

  const mod = new Function(
    'console',
    `${toJs(stripImports(moduleSrc))}\n;return ({ orbProfile, resolveOrbState, ORB_STATES, ORB_STATE_LABEL, ORB_STATE_COPY });`,
  )(quiet);

  const orbCode = stripComments(orbSrc);
  const markCode = stripComments(markSrc);
  const momentCode = stripComments(momentSrc);

  // ── P1/P2 — a state always renders, and an unknown state is never a crash ──
  const idle = mod.orbProfile('idle');
  const unknown = mod.orbProfile('not_a_state');
  expect('P1', 'the idle state renders', (() => {
    const nums = [idle.energy, idle.flow, idle.ribbons, idle.glow, idle.coherence];
    return nums.every((n) => typeof n === 'number' && Number.isFinite(n)) && idle.flow > 0 && idle.ribbons > 0;
  })(), JSON.stringify(idle));
  expect('P2', 'an unknown state resolves to idle, never throws',
    unknown.state === 'idle' && unknown.ribbons === idle.ribbons);

  // ── P3 — celebration is NOT a default (no fake discovery, no fake attention) ──
  const pulsing = mod.ORB_STATES.filter((s) => mod.orbProfile(s).pulse !== 'none');
  expect('P3', 'only discovery and attention carry a pulse',
    pulsing.length === 2 && pulsing.includes('discovery') && pulsing.includes('attention'),
    `pulsing=${pulsing.join(',')}`);

  // ── P4/P5 — the REAL intelligence level, and it changes coherence ALONE ──
  const low = mod.orbProfile('idle', { intelligence: 0 });
  const high = mod.orbProfile('idle', { intelligence: 100 });
  expect('P4', 'coherence rises with real intelligence and stays bounded',
    high.coherence > low.coherence && low.coherence >= 0 && high.coherence <= 1
    && low.coherence === mod.orbProfile('idle', { intelligence: 0 }).coherence,
    `low=${low.coherence} high=${high.coherence}`);
  expect('P5', 'intelligence changes coherence ONLY, never motion or geometry',
    low.energy === high.energy && low.flow === high.flow && low.fold === high.fold
    && low.ribbons === high.ribbons && low.inward === high.inward && low.travel === high.travel,
    `energy ${low.energy}/${high.energy} flow ${low.flow}/${high.flow}`);

  // ── P6/P7 — reduced motion, and the smaller screens ──
  const still = mod.orbProfile('discovery', { reduced: true, intelligence: 60 });
  expect('P6', 'reduced motion is a still field: no flow, no inflow, no pulse, no wave',
    still.flow === 0 && still.inward === 0 && still.travel === 0 && still.pulse === 'none'
    && still.wave === 'none' && still.breath === 0,
    JSON.stringify(still));
  const compact = mod.orbProfile('analyzing', { compact: true });
  const full = mod.orbProfile('analyzing');
  expect('P7', 'a compact viewport simplifies the field',
    compact.micro < full.micro && compact.ribbons < full.ribbons,
    `ribbons ${compact.ribbons}/${full.ribbons}`);

  // ── P8 — state comes from REAL flags, in a truthful order ──
  expect('P8', 'orb states resolve from real flags only',
    mod.resolveOrbState({}) === 'idle'
    && mod.resolveOrbState({ isThinking: true }) === 'thinking'
    && mod.resolveOrbState({ isThinking: true, isResponding: true }) === 'thinking'
    && mod.resolveOrbState({ hasNewInsight: true, isThinking: true }) === 'discovery'
    && mod.resolveOrbState({ degraded: true, hasNewInsight: true }) === 'degraded'
    && mod.resolveOrbState({ isResponding: true }) === 'responding'
    && mod.resolveOrbState({ isListening: true }) === 'listening');

  // ── P9 — the state is also WORDS, never animation alone (accessibility) ──
  expect('P9', 'every state carries an accessible label',
    mod.ORB_STATES.every((s) => typeof mod.ORB_STATE_LABEL[s] === 'string' && mod.ORB_STATE_LABEL[s].length > 4)
    && mod.ORB_STATES.length === 9,
    `states=${mod.ORB_STATES.join(',')}`);

  // ── P10 — the renderer's prop list is the privacy boundary ──
  const params = (orbSrc.match(/export default function GalileoOrb\(\{([\s\S]*?)\}\) \{/) || [null, ''])[1] || '';
  const accepted = (params.match(/^\s*([A-Za-z_$][\w$]*)/gm) || []).map((s) => s.trim()).sort();
  expect('P10', 'the orb accepts only presentational props',
    accepted.join(',') === 'className,decorative,emerge,intelligence,size,state', `accepted=${accepted.join(',')}`);

  // ── P11 — no business data, in any of the identity components ──
  const leaked = [orbCode, markCode, momentCode].flatMap((code) => FORBIDDEN.filter((k) => code.includes(k)));
  expect('P11', 'no business value, document or identity identifier reaches the visualization',
    leaked.length === 0, `found=${[...new Set(leaked)].join(',')}`);

  // ── P12 — no fake delay, no leak channel, one loop that is cancelled ──
  expect('P12', 'no timer fabricates processing time',
    !/setTimeout|setInterval/.test(orbCode) && !/setTimeout|setInterval/.test(momentCode));
  expect('P13', 'nothing about the state is written to the console or analytics',
    !/console\.|analytics\.track/.test(orbCode) && !/console\.|analytics\.track/.test(markCode));
  expect('P14', 'the renderer runs one loop and cancels it on unmount',
    (orbCode.match(/requestAnimationFrame/g) || []).length >= 1
    && /cancelAnimationFrame/.test(orbCode)
    && /return \(\) => cancelAnimationFrame/.test(orbCode));

  // ── P15/P16 — failure and reduced motion never block Galileo ──
  // Contract updated: a failed canvas now degrades to the static fallback at the
  // same size (never blank). Proven at RUNTIME by galileoOrbRuntime R4/R5.
  expect('P15', 'a canvas that cannot initialize degrades to the static fallback without throwing',
    /getContext\('webgl'/.test(orbCode) && /if \(!gl\) \{\s*setFallback\(true\)/.test(orbCode)
    && /if \(!renderer\) \{\s*setFallback\(true\)/.test(orbCode) && /webglcontextlost/.test(orbCode)
    && /<GalileoOrbFallback/.test(orbCode));
  expect('P16', 'reduced motion short-circuits to one frame, with no loop',
    /prefers-reduced-motion/.test(orbCode) && /if \(still\) \{/.test(orbCode));
  expect('P17', 'the mark is the lightweight identity, not the renderer',
    !/canvas|requestAnimationFrame/.test(markCode) && /✦/.test(markCode));

  return local;
}

(async () => {
  const baseline = await runChecks();
  console.log(`\n── baseline: ${baseline.length ? `${baseline.length} FAILED` : 'ALL CHECKS PASS'}`);
  baseline.forEach((f) => console.log(`   FAIL ${f}`));

  const mutations = [
    {
      name: 'M-COHERENCE  intelligence stops mattering (coherence becomes a constant)',
      sources: () => ({
        ORB_MODULE: read(ORB_MODULE).replace('0.28 + (level / 100) * 0.72 + (base.coherenceBias || 0)', '0.5'),
      }),
      mustFail: ['P4'],
    },
    {
      name: 'M-PULSE  idle celebrates (a pulse without a discovery)',
      sources: () => ({
        ORB_MODULE: read(ORB_MODULE).replace(
          "ribbons: 3, glow: 0.9, pulse: 'none', wave: 'none' },\n  listening",
          "ribbons: 3, glow: 0.9, pulse: 'once', wave: 'none' },\n  listening",
        ),
      }),
      mustFail: ['P3'],
    },
    {
      name: 'M-DATA  a business value reaches the renderer',
      sources: () => ({ ORB: read(ORB).replace('const R = W * 0.4;', 'const revenue = 1; const R = W * 0.4;') }),
      mustFail: ['P11'],
    },
  ];

  const results = [];
  for (const m of mutations) {
    const found = await runChecks(m.sources());
    const hit = m.mustFail.every((id) => found.some((f) => f.startsWith(id)));
    results.push({ name: m.name, caught: hit, detail: hit ? `${m.mustFail.join(',')} caught` : `expected ${m.mustFail.join(',')} — got: ${found.join(' | ') || 'none'}` });
    console.log(`${hit ? 'CAUGHT  ' : 'MISSED  '}${m.name} — ${results[results.length - 1].detail}`);
  }

  const mutationsOkay = results.every((r) => r.caught);
  const ok = baseline.length === 0 && mutationsOkay;
  console.log('');
  console.log(`checks P1–P17 : ${baseline.length === 0 ? 'ALL CHECKS PASS' : `${baseline.length} FAILED`}`);
  console.log(`mutations     : ${results.filter((r) => r.caught).length}/${mutations.length} APPLIED + BEHAVIOR_CHANGED + CAUGHT`);
  console.log(ok ? '\nGALILEO PRESENCE — ALL CHECKS PASS' : '\nGALILEO PRESENCE — NOT CERTIFIED');
  process.exit(ok ? 0 : 1);
})();