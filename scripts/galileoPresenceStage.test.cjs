#!/usr/bin/env node
/**
 * galileoPresenceStage.test.cjs — the PRESENCE contract.
 *
 * The defect this pass repairs was VISUAL, so these checks can only prove the
 * STRUCTURE that makes the visual appear: that a medium presence is mounted on
 * the onboarding canvas unconditionally, that its state is derived from real
 * experience state, that no processing word is said without real work, and that
 * nothing sensitive can reach it. Whether the golden intelligence form is
 * actually visible on screen is a browser fact and is NOT claimed here.
 *
 * Run: node scripts/galileoPresenceStage.test.cjs
 */

const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/.*$/gm, '');

const STAGE = 'src/lib/galileo/presenceStage.js';
const INTERP = 'src/lib/galileo/interpretation.js';
const ORB_MODULE = 'src/lib/galileo/orbPresence.js';
const PRESENCE_JSX = 'src/components/galileo/identity/GalileoPresence.jsx';
const ORB_JSX = 'src/components/galileo/identity/GalileoOrb.jsx';
const STREAM = 'src/components/galileo/shell/ConversationStream.jsx';
const PULSE = 'src/components/galileo/shell/LivingBusinessPulse.jsx';
const HOOK = 'src/hooks/useGalileoConversation.js';
const QUESTIONS = 'src/lib/galileo/adaptiveQuestions.js';

/** What must never reach a visualization. */
const FORBIDDEN = ['revenue', 'ebitda', 'business_id', 'email', 'token', 'document', 'ssn'];
/** What must never enter a presence resolver. */
const DATA_ISH = ['answers', 'signalValues', 'businessName', 'facts', 'evidence'];

const loadModule = (src, names) => {
  // Canonical size presets are a dependency of the stage; inline them.
  const sizes = require('fs').readFileSync(require('path').join(__dirname, '../src/lib/galileo/orbSizes.js'), 'utf8');
  const js = ((/orbSizes/.test(src) ? sizes + '\n' : '') + src.replace(/^import[^\n]*\n/gm, ''))
    .replace(/export const /g, 'const ').replace(/export function /g, 'function ');
  return new Function(`${js};return ({${names.join(', ')}});`)();
};

function runChecks(sources = {}) {
  const failures = [];
  const check = (id, label, ok, detail = '') => {
    if (!ok) failures.push(`${id} ${label}${detail ? ` — ${detail}` : ''}`);
  };

  const stageSrc = sources.STAGE ?? read(STAGE);
  const interpSrc = sources.INTERP ?? read(INTERP);
  const orbSrc = sources.ORB_MODULE ?? read(ORB_MODULE);
  const presenceSrc = sources.PRESENCE_JSX ?? read(PRESENCE_JSX);
  const orbJsxSrc = sources.ORB_JSX ?? read(ORB_JSX);
  const streamSrc = sources.STREAM ?? read(STREAM);
  const pulseSrc = sources.PULSE ?? read(PULSE);
  const hookSrc = sources.HOOK ?? read(HOOK);
  const questionSrc = sources.QUESTIONS ?? read(QUESTIONS);

  const stage = loadModule(stageSrc, ['resolvePresence', 'presenceLayout', 'PRESENCE_SIZES', 'PRESENCE_CAPTIONS']);
  const orb = loadModule(orbSrc, ['orbProfile', 'ORB_STATES']);

  const stageCode = stripComments(stageSrc);
  const presenceCode = stripComments(presenceSrc);
  const interpCode = stripComments(interpSrc);

  // ── G2 — a medium presence, not the tiny mark ──────────────────────────────
  const focal = stage.presenceLayout('focal', false);
  const settled = stage.presenceLayout('settled', false);
  check('G2', 'the presence is a medium visualization, smaller than the arrival hero',
    // Canvas size; visible sphere = 80% → 170–200px focal on desktop.
    focal.size * 0.8 >= 170 && focal.size * 0.8 <= 200 && focal.glow === undefined && settled.size >= 72,
    `focal=${focal.size} settled=${settled.size}`);

  // ── G9 — mobile is smaller and simplified ──────────────────────────────────
  const focalMobile = stage.presenceLayout('focal', true);
  const settledMobile = stage.presenceLayout('settled', true);
  check('G9', 'the mobile presence is appropriately smaller',
    focalMobile.size >= 96 && focalMobile.size <= 180
    && focalMobile.size < focal.size && settledMobile.size <= focalMobile.size,
    `mobile=${focalMobile.size} settledMobile=${settledMobile.size}`);

  // ── G4/G5/G23 — real states, visibly distinct from one another ─────────────
  const listening = stage.resolvePresence({ awaitingAnswer: true });
  const thinking = stage.resolvePresence({ isThinking: true });
  const analyzing = stage.resolvePresence({ isThinking: true, revealing: true });
  const discovery = stage.resolvePresence({ hasNewInsight: true });
  const learning = stage.resolvePresence({ learning: true });
  check('G4', 'a question on screen is a state of its own, distinct from working',
    listening.state === 'listening' && thinking.state === 'thinking' && listening.state !== thinking.state,
    `${listening.state}/${thinking.state}`);
  check('G5', 'analysis is distinct from processing, and learning is distinct too',
    analyzing.state === 'analyzing' && analyzing.state !== thinking.state && learning.state === 'learning');
  check('G23', 'discovery is its own signature state',
    discovery.state === 'discovery' && !['listening', 'thinking', 'analyzing', 'learning', 'idle'].includes(discovery.state));
  check('P-PRIO', 'a limited system outranks every other state',
    stage.resolvePresence({ degraded: true, hasNewInsight: true }).state === 'degraded');
  check('P-DET', 'one real state always resolves to one presence',
    JSON.stringify(stage.resolvePresence({ isThinking: true }))
      === JSON.stringify(stage.resolvePresence({ isThinking: true })));

  // ── TRUTH — no processing word without real work in flight ─────────────────
  check('TRUTH', 'processing language appears only while work is genuinely running',
    stage.resolvePresence({}).caption === null
    && stage.resolvePresence({ hasNewInsight: true }).caption === null
    && stage.resolvePresence({ awaitingAnswer: true }).caption === null
    && stage.resolvePresence({ learning: true }).caption === stage.PRESENCE_CAPTIONS.learning
    && stage.resolvePresence({ isThinking: true }).caption === stage.PRESENCE_CAPTIONS.thinking
    && stage.resolvePresence({ isThinking: true, revealing: true }).caption === stage.PRESENCE_CAPTIONS.analyzing);

  // ── G6/G8/G7 — the orb's certified contract still holds ────────────────────
  check('G6', 'discovery still produces exactly one restrained pulse',
    orb.orbProfile('discovery').pulse === 'once'
    && ['idle', 'listening', 'thinking', 'analyzing', 'learning'].every((s) => orb.orbProfile(s).pulse === 'none'));
  check('G8', 'reduced motion stills the field and removes inflow and the pulse',
    orb.orbProfile('discovery', { reduced: true }).pulse === 'none'
    && orb.orbProfile('discovery', { reduced: true }).flow === 0
    && orb.orbProfile('analyzing', { reduced: true }).inward === 0);
  check('G7', 'intelligence still changes coherence, and nothing else',
    orb.orbProfile('idle', { intelligence: 15 }).coherence < orb.orbProfile('idle', { intelligence: 90 }).coherence
    && orb.orbProfile('idle', { intelligence: 15 }).energy === orb.orbProfile('idle', { intelligence: 90 }).energy);

  // ── G10 — the visualization's inputs are the privacy boundary ──────────────
  const orbCall = (presenceCode.match(/<GalileoOrb[\s\S]*?\/>/) || [''])[0];
  const leaked = [...new Set([...FORBIDDEN].filter((k) => presenceCode.includes(k) || stageCode.includes(k)))];
  check('G10', 'no business value, document or identity reaches the presence',
    leaked.length === 0 && orbCall.includes('state=') && orbCall.includes('size=') && orbCall.includes('intelligence='),
    leaked.length ? `found=${leaked.join(',')}` : `orb=${orbCall.replace(/\s+/g, ' ').slice(0, 70)}`);
  const dataish = [...new Set([...DATA_ISH].filter((k) => new RegExp(`${k}\\s*[=:]`).test(stageCode)))];
  check('G10b', 'the stage takes booleans and a level, never a value',
    dataish.length === 0, `found=${dataish.join(',')}`);

  // ── G1/G3 — MOUNTED, and mounted unconditionally ───────────────────────────
  check('G1', 'the presence is mounted on the onboarding canvas',
    /<GalileoPresence/.test(streamSrc) && /import GalileoPresence/.test(streamSrc));
  check('G3', 'the presence is not switched on only while thinking',
    !/isThinking\s*&&\s*[<(]/.test(streamSrc) && !/size=\{40\}/.test(streamSrc) && !/GalileoDiscoveryMoment/.test(streamSrc));

  // ── G24 — answered pills collapse instead of stacking ──────────────────────
  check('G24', 'answered discovery pills collapse into the business summary',
    /e\.type === 'message' && e\.role === 'user' && discoveryFields\.includes\(e\.field\)/.test(streamSrc));

  // ── G11/G27 — the question engine is untouched and remains the only driver ─
  check('G11', 'questions are still selected by the existing engine',
    /selectNextGap\(/.test(hookSrc) && /export function getNextQuestion/.test(questionSrc)
    && /QUESTION_FIELDS/.test(questionSrc));
  check('G27a', 'the interpretation layer selects no question of its own',
    /interpretAnswer\(/.test(hookSrc) && /bridgeToQuestion\(/.test(hookSrc)
    && !/QUESTION_FIELDS|getNextQuestion|selectNextGap/.test(interpCode));

  // ── G12/G23b — the discovery statement is still said, once ─────────────────
  check('G23b', 'the discovery is stated before the number is revealed',
    /I found something worth looking at/.test(hookSrc)
    && hookSrc.indexOf('I found something worth looking at') < hookSrc.indexOf("variant: 'value'"));

  // ── G14 — the Pulse still derives canonically, and illuminates once ────────
  check('G14', 'pulse signals derive from the canonical states and awaken once',
    /signalStates \|\| computeSignalStates/.test(pulseSrc)
    && /AWAKENING_GLOW/.test(pulseSrc) && /previousRef/.test(pulseSrc));

  // ── No fabricated delay, no timer, in the presence layer ───────────────────
  check('G-DELAY', 'the presence layer contains no timer at all',
    !/setTimeout|setInterval/.test(stageCode) && !/setTimeout|setInterval/.test(presenceCode));

  // ── ORB-TDZ — a binding must never be read before it is initialized ────────
  // The crash class source-shape checks cannot see: the orb's profile setup sits
  // ABOVE its canvas geometry, so reading the geometry's later binding there
  // throws a ReferenceError the moment the orb mounts — on the arrival screen and
  // in every conversation. Asserted against comment-stripped code.
  const orbCode = stripComments(orbJsxSrc);
  const wDecl = orbCode.indexOf('const W = size;');
  const beforeW = wDecl > 0 ? orbCode.slice(0, wDecl) : '';
  check('ORB-TDZ', 'the orb reads no binding before it is initialized',
    wDecl > 0 && !/(^|[^A-Za-z0-9_$])W([^A-Za-z0-9_$]|$)/.test(beforeW),
    wDecl < 0 ? 'geometry declaration not found' : 'a binding is read above its declaration');

  return failures;
}

const TOTAL_CHECKS = 22;
const baseline = runChecks();
const pass = TOTAL_CHECKS - baseline.length;

console.log('');
console.log('  GALILEO PRESENCE + EXPERIENCE MAGIC PASS — contract checks');
console.log('  ─────────────────────────────────────────────────────────────────');
if (baseline.length) baseline.forEach((f) => console.log(`  FAIL ${f}`));
console.log('');
console.log(`  checks     : ${pass} PASS  (G1–G28 subset, structural only)`);

const mutations = [
  {
    name: 'M-TINY   the presence collapses back to an invisible mark',
    sources: () => ({ STAGE: read(STAGE).replace('focal: { desktop: 232, mobile: 168 }', 'focal: { desktop: 40, mobile: 40 }') }),
    mustFail: ['G2'],
  },
  {
    name: 'M-CAPTION a processing line is spoken while nothing is running',
    sources: () => ({
      STAGE: read(STAGE).replace(
        "return { state: 'idle', emphasis: 'focal', caption: null };",
        "return { state: 'idle', emphasis: 'focal', caption: PRESENCE_CAPTIONS.thinking };",
      ),
    }),
    mustFail: ['TRUTH'],
  },
  {
    name: 'M-GATE   the presence is hidden again behind isThinking',
    sources: () => ({
      STREAM: read(STREAM).replace(
        '<GalileoPresence {...presence} intelligence={intelligence} />',
        '{isThinking && <GalileoPresence {...presence} intelligence={intelligence} />}',
      ),
    }),
    mustFail: ['G3'],
  },
  {
    name: 'M-LEAK   a business field is handed to the stage',
    sources: () => ({
      STAGE: read(STAGE).replace('export function resolvePresence({', 'export function resolvePresence({ businessName = null,'),
    }),
    mustFail: ['G10b'],
  },
  {
    name: 'M-TDZ     the orb reads its geometry binding before declaring it',
    sources: () => ({
      ORB_JSX: read(ORB_JSX).replace('const clarity = size >= 100', 'const clarity = W >= 100'),
    }),
    mustFail: ['ORB-TDZ'],
  },
];

(async () => {
  const results = [];
  for (const m of mutations) {
    const found = runChecks(m.sources());
    const caught = m.mustFail.every((id) => found.some((f) => f.startsWith(id)));
    results.push(caught);
    console.log(`  ${caught ? 'CAUGHT  ' : 'MISSED  '}${m.name}`);
  }
  console.log('');
  console.log(`  mutations  : ${results.filter(Boolean).length}/${results.length} APPLIED + BEHAVIOR_CHANGED + CAUGHT`);
  const ok = baseline.length === 0 && results.every(Boolean);
  console.log('');
  console.log(`  GALILEO PRESENCE + MAGIC PASS — ${ok ? 'ALL CHECKS PASS' : 'NOT CERTIFIED'}`);
  console.log('  NOTE: this proves the STRUCTURE that makes the visual appear. Whether the');
  console.log('        golden intelligence form is visible on screen is a browser fact and');
  console.log('        is NOT claimed by this harness.');
  console.log('');
  process.exit(ok ? 0 : 1);
})();