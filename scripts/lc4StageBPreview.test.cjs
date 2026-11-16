#!/usr/bin/env node
/**
 * LC-4 STAGE B — the Model This repair and the guest business home (S1–S12).
 *
 * WHAT THIS PROVES
 *   The Model This transition used to COMPLETE but DEAD-END: the destination was a
 *   terminal card whose only door led back to the same fork, so clicking again
 *   re-ran the identical decision. Stage B repairs that and gives the transition a
 *   destination — a personalized, LIMITED business home for a guest or free user.
 *
 *     S1  the same action can only ever activate ONE scenario (idempotent)
 *     S2  a different action is a different scenario
 *     S3  an activation without an action id keeps the previous behaviour exactly
 *     S4  the record carries the answers and the resolved financial facts forward
 *     S5  returning to the conversation moves FORWARD — the fork recedes
 *     S6  the handler is idempotent and the retry re-runs the SAME payload
 *     S7  a failed transition is a visible, retryable state
 *     S8  the preview is a guest surface — no member endpoint, no member hook
 *     S9  no non-functional Ask Galileo control is exposed
 *     S10 the preview invents no zero for a fact it does not have
 *     S11 the page wires the preview only in the non-home branch, with the drawer
 *     S12 the preview REUSES the member pulse component and the canonical facts
 *
 * WHAT IT LOADS
 *   The real modules (activeScenario, implementationAccess, opportunityScenarios,
 *   saveManager) in a real session store, plus source-level assertions on the hook,
 *   the continuation surface, the preview and the page (React cannot run here).
 *
 * Run: node scripts/lc4StageBPreview.test.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const F = {
  active: 'src/lib/galileo/activeScenario.js',
  access: 'src/lib/galileo/implementationAccess.js',
  levers: 'src/lib/galileo/opportunityScenarios.js',
  save: 'src/lib/galileo/saveManager.js',
  hook: 'src/hooks/useGalileoConversation.js',
  page: 'src/pages/galileo/GalileoReimagined.jsx',
  continuation: 'src/components/galileo/vision/ScenarioContinuation.jsx',
  status: 'src/components/galileo/vision/ContinuationStatus.jsx',
  preview: 'src/components/galileo/home/GuestHomePreview.jsx',
  stream: 'src/components/galileo/shell/ConversationStream.jsx',
};

const read = (p, overrides) =>
  overrides && overrides[p] != null ? overrides[p] : fs.readFileSync(path.join(ROOT, p), 'utf8');
const codeOf = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const loadable = (s) =>
  s.replace(/^\s*import[\s\S]*?from\s+'[^']+';/gm, '').replace(/^\s*export\s+/gm, '');

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

const failures = [];
const results = [];
let mutationRound = false;
function check(id, label, fn) {
  let ok = false;
  let detail = '';
  try {
    const r = fn();
    ok = r === true || (r && r.ok === true);
    if (r && r.detail) detail = r.detail;
  } catch (e) {
    ok = false;
    detail = e.message;
  }
  results.push({ id, ok });
  if (!ok && !mutationRound) failures.push(`${id} ${label}`);
  if (!mutationRound) console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}${detail ? ` — ${detail}` : ''}`);
}

function buildWorld(overrides = {}, store = new MemoryStorage()) {
  global.window = { sessionStorage: store };
  global.sessionStorage = store;

  const LEVERS = new Function(`${loadable(read(F.levers, overrides))}; return LEVERS;`)();
  const { scenarioForOpportunity } = new Function(
    'LEVERS',
    `${loadable(read(F.access, overrides))}; return { scenarioForOpportunity };`,
  )(LEVERS);
  const saveMod = new Function(
    `${loadable(read(F.save, overrides))}; return { saveItem, getSavedItems };`,
  )();
  const active = new Function(
    'scenarioForOpportunity',
    'saveItem',
    `${loadable(read(F.active, overrides))}
     return { activateScenario, readActiveScenario, markScenarioReturned, scenarioContinuation };`,
  )(scenarioForOpportunity, saveMod.saveItem);

  return { store, active, saveMod };
}

const OPP = {
  id: 'owner_dependency',
  title: 'Owner Dependency',
  summary: 'How much the business depends on you is affecting your freedom and what a buyer would pay.',
  confidence: 'moderate',
  evidence: ['Your reported owner involvement', 'Buyers discount businesses that run on the owner'],
  strategies: ['Document your key processes', 'Delegate one operational area', 'Build a management layer'],
};

const BASE = {
  answers: { industry: 'Commercial HVAC', revenue: 5000000, ebitda: null },
  facts: {
    revenue: { name: 'revenue', state: 'known', value: 5000000, source: 'you' },
    ebitda: { name: 'ebitda', state: 'unknown', value: null, source: null },
  },
  intent: 'reduce_dependency',
  model: { signals: { operations: { score: 33 } } },
  guestSessionId: 'guest_123',
  opportunity: OPP,
  strategy: 'Document your key processes',
};

/** The body of a named const/function in a source string. */
function sliceFn(src, signature) {
  const start = src.indexOf(signature);
  if (start < 0) return '';
  const nextFn = src.indexOf('\n  const ', start + signature.length);
  const nextSection = src.indexOf('\n  // ──', start + signature.length);
  const ends = [nextFn, nextSection].filter((i) => i > 0);
  const end = ends.length ? Math.min(...ends) : src.length;
  return src.slice(start, end);
}

function runChecks(overrides = {}) {
  const world = buildWorld(overrides);

  const first = world.active.activateScenario({ ...BASE, sourceActionId: 'e12' });
  const second = world.active.activateScenario({ ...BASE, sourceActionId: 'e12' });
  const savedAfterRepeat = world.saveMod.getSavedItems().filter((i) => i.type === 'scenario');

  check('S1', 'the SAME action can only ever activate ONE scenario — idempotent by action id', () => {
    if (!first || !second) return { ok: false, detail: 'no record' };
    if (first.id !== second.id) return { ok: false, detail: `two scenarios: ${first.id} / ${second.id}` };
    if (savedAfterRepeat.length !== 1) return { ok: false, detail: `saved=${savedAfterRepeat.length}` };
    if (second.sourceActionId !== 'e12') return { ok: false, detail: 'the action id is not persisted' };
    return true;
  });

  check('S2', 'a DIFFERENT action is a different scenario', () => {
    const other = world.active.activateScenario({ ...BASE, sourceActionId: 'e13', strategy: 'Delegate one operational area' });
    if (!other || other.id === first.id) return { ok: false, detail: 'the second action was collapsed' };
    const saved = world.saveMod.getSavedItems().filter((i) => i.type === 'scenario');
    if (saved.length !== 2) return { ok: false, detail: `saved=${saved.length}` };
    return true;
  });

  check('S3', 'an activation WITHOUT an action id keeps the previous behaviour exactly', () => {
    const w = buildWorld(overrides);
    const a = w.active.activateScenario({ ...BASE });
    const b = w.active.activateScenario({ ...BASE, strategy: 'Delegate one operational area' });
    if (!a || !b) return { ok: false, detail: 'no record' };
    if (a.id === b.id) return { ok: false, detail: 'a deliberate second exploration was collapsed' };
    return true;
  });

  check('S4', 'the transition carries the answers and the resolved facts — nothing is re-derived', () => {
    if (first.answers?.revenue !== 5000000) return { ok: false, detail: 'answers dropped' };
    if (first.answers?.industry !== 'Commercial HVAC') return { ok: false, detail: 'industry dropped' };
    if (first.facts?.ebitda?.state !== 'unknown') return { ok: false, detail: 'fact states dropped' };
    if (first.facts?.revenue?.value !== 5000000) return { ok: false, detail: 'fact value dropped' };
    return true;
  });

  const hook = codeOf(read(F.hook, overrides));
  const returnFn = sliceFn(hook, 'const returnToConversation = useCallback(');

  check('S5', 'returning to the conversation moves FORWARD — the fork recedes instead of re-asking', () => {
    if (!returnFn) return { ok: false, detail: 'no return path' };
    if (!/addMessage\(/.test(returnFn)) return { ok: false, detail: 'no outcome is appended, so the card stays active' };
    if (!/closeContinuation\(\)/.test(returnFn)) return { ok: false, detail: 'the scenario is not marked returned' };
    // The card recedes because an action entry only renders while it is the ACTIVE entry.
    const stream = codeOf(read(F.stream, overrides));
    if (!/if \(!isInteractive\) return null;/.test(stream)) return { ok: false, detail: 'the stream always renders the action' };
    if (!/isActive=\{idx === showEntries\.length - 1\}/.test(stream)) return { ok: false, detail: 'active entry is not the last entry' };
    return true;
  });

  const handler = sliceFn(hook, 'const handleImplementationAction = useCallback(');

  check('S6', 'the handler is idempotent and the retry re-runs the SAME payload', () => {
    if (!/lastModelThisActionRef\.current === implementationActionId\) return;/.test(handler)) {
      return { ok: false, detail: 'no per-action guard' };
    }
    if (!/sourceActionId: implementationActionId/.test(handler)) return { ok: false, detail: 'the action id is not passed to the store' };
    if (!/implementationRetryRef\.current = \{/.test(handler)) return { ok: false, detail: 'the attempt inputs are not kept' };
    if (!/implementationPhase'?,? '?(resolving)|setImplementationPhase\('resolving'\)/.test(handler)) {
      return { ok: false, detail: 'no resolving phase' };
    }
    if (!/catch \(error\)[\s\S]{0,220}setImplementationPhase\('error'\)/.test(handler)) {
      return { ok: false, detail: 'a failure is not a state' };
    }
    const retry = sliceFn(hook, 'const retryImplementation = useCallback(');
    if (!/handleImplementationAction\('model', true\)/.test(retry)) {
      return { ok: false, detail: 'the retry does not re-run the transition with the same inputs' };
    }
    return true;
  });

  check('S7', 'a failed or in-flight transition is a VISIBLE state, and it is retryable', () => {
    if (!/implementationPhase === 'error'/.test(hook)) return { ok: false, detail: 'the error phase cannot be rendered' };
    if (!/implementationPhase === 'resolving'/.test(hook)) return { ok: false, detail: 'the resolving phase cannot be rendered' };
    const status = codeOf(read(F.status, overrides));
    if (!/phase === 'resolving'/.test(status)) return { ok: false, detail: 'no loading surface' };
    if (!/Try Again/.test(status)) return { ok: false, detail: 'no retry control' };
    if (!/onRetry/.test(status)) return { ok: false, detail: 'the retry is not wired' };
    if (!/answers are|nothing was lost|Everything you have already told me is kept/i.test(status)) {
      return { ok: false, detail: 'the failure does not promise the work is kept' };
    }
    const cont = codeOf(read(F.continuation, overrides));
    if (!/phase !== 'ready'/.test(cont)) return { ok: false, detail: 'the surface ignores the phase' };
    return true;
  });

  const preview = codeOf(read(F.preview, overrides));

  check('S8', 'the preview is a GUEST surface — no member endpoint, no member hook, no resolver', () => {
    for (const bad of ['useGalileoHome', 'base44', 'askGalileo', 'BusinessContext', 'getBusinessIntelligenceContract']) {
      if (preview.includes(bad)) return { ok: false, detail: `member dependency: ${bad}` };
    }
    if (/\bfetch\(/.test(preview)) return { ok: false, detail: 'the preview performs a request' };
    if (/\.filter\(\{[^}]*business_id/.test(preview)) return { ok: false, detail: 'it queries records directly' };
    return true;
  });

  check('S9', 'no non-functional Ask Galileo control is exposed', () => {
    if (/AskGalileoBar/.test(preview)) return { ok: false, detail: 'the live ask bar is rendered for a guest' };
    if (/<input|<textarea|contentEditable/.test(preview)) return { ok: false, detail: 'a dead input is exposed' };
    if (!/not open for a preview without an account/.test(preview)) {
      return { ok: false, detail: 'the limitation is not explained' };
    }
    return true;
  });

  check('S10', 'the preview invents no zero for a fact it does not have', () => {
    for (const bad of ['?? 0', '|| 0', 'value ?? 0', 'fact?.value ||']) {
      if (preview.includes(bad)) return { ok: false, detail: `zero fallback: ${bad}` };
    }
    if (!/Not known yet/.test(preview)) return { ok: false, detail: 'an unknown fact has no honest label' };
    if (!/approxMoney\(v\) \?\? '\$0'/.test(preview)) {
      return { ok: false, detail: 'a REAL zero is not distinguished from unknown' };
    }
    return true;
  });

  const page = codeOf(read(F.page, overrides));

  check('S11', 'the page wires the preview ONLY in the non-home branch, with the existing drawer', () => {
    const iHome = page.indexOf('{isHomeMode ? (');
    const iPreview = page.indexOf('guestPreview ? (');
    if (iHome < 0) return { ok: false, detail: 'no home branch' };
    if (iPreview < 0) return { ok: false, detail: 'the preview is not wired' };
    if (!(iHome < iPreview)) return { ok: false, detail: 'the preview is reachable from the member home branch' };
    if (!/<GuestHomePreview/.test(page)) return { ok: false, detail: 'surface not rendered' };
    if (!/facts=\{loop\.financialFacts\}/.test(page)) return { ok: false, detail: 'it does not use the canonical fact reading' };
    const previewBranch = page.slice(iPreview, page.indexOf('loop.showContinuation ? (', iPreview));
    if (!/<IntelligenceDrawer/.test(previewBranch)) return { ok: false, detail: 'domain tiles cannot open' };
    if (!/loop\.onPulseClick/.test(previewBranch)) return { ok: false, detail: 'no existing domain handler' };
    return true;
  });

  check('S12', 'the preview REUSES the member pulse and the canonical facts — no second model', () => {
    if (!/from '\.\/HomeBusinessPulse'/.test(preview) && !/HomeBusinessPulse/.test(preview)) {
      return { ok: false, detail: 'the pulse is not reused' };
    }
    if (!/HomeBusinessPulse/.test(preview)) return { ok: false, detail: 'the pulse is not rendered' };
    if (!/from '@\/lib\/galileo\/factKnowledge'/.test(preview)) return { ok: false, detail: 'fact states are not the canonical ones' };
    if (/buildPreliminaryModel|calcValueGap/.test(preview)) return { ok: false, detail: 'the preview computes its own model' };
    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
const base = {};
for (const k of Object.values(F)) base[k] = fs.readFileSync(path.join(ROOT, k), 'utf8');

const MUTATIONS = [
  {
    name: 'M-IDEMPOTENT  activation collapses nothing, so a double click creates two scenarios',
    catchId: 'S1',
    apply: (s) => ({
      [F.active]: s[F.active].replace(
        'if (sourceActionId && already && already.sourceActionId === sourceActionId) {',
        'if (false) {',
      ),
    }),
  },
  {
    name: 'M-LOOP        returning stops appending the outcome, so the fork is shown again',
    catchId: 'S5',
    apply: (s) => ({
      [F.hook]: s[F.hook].replace(
        "    addMessage(\n      'assistant',\n      explored",
        "    const _unused = (explored\n      ? explored\n      : null);\n    void (_unused",
      ),
    }),
  },
  {
    name: 'M-ZERO        an unknown fact becomes a confident zero in the preview',
    catchId: 'S10',
    apply: (s) => ({
      [F.preview]: s[F.preview].replace(
        "const formatted = money(fact?.value);",
        "const formatted = money(fact?.value ?? 0);",
      ),
    }),
  },
  {
    name: 'M-MEMBERHOME  the guest preview becomes reachable from the member home branch',
    catchId: 'S11',
    apply: (s) => ({
      [F.page]: s[F.page].replace('{isHomeMode ? (', '{guestPreview ? ('),
    }),
  },
  {
    name: 'M-SILENTFAIL  a failed transition silently drops back into the stream',
    catchId: 'S7',
    apply: (s) => ({
      [F.hook]: s[F.hook].replace(
        "    || implementationPhase === 'error'",
        "    || false",
      ),
    }),
  },
];

function runMutations() {
  let caught = 0;
  for (const m of MUTATIONS) {
    const mutated = { ...base, ...m.apply(base) };
    const applied = Object.keys(F).some((k) => mutated[F[k]] !== base[F[k]]);
    if (!applied) {
      console.log(`MISSED  ${m.name} — the mutation did not apply (source drifted)`);
      continue;
    }
    results.length = 0;
    failures.length = 0;
    mutationRound = true;
    runChecks(mutated);
    mutationRound = false;
    const wasCaught = results.some((r) => !r.ok && r.id === m.catchId);
    if (wasCaught) {
      caught += 1;
      console.log(`CAUGHT  ${m.name}  (${m.catchId})`);
    } else {
      console.log(`SURVIVED  ${m.name}  (${m.catchId})`);
    }
  }
  return caught;
}

console.log('LC-4 STAGE B — MODEL THIS REPAIR + GUEST BUSINESS HOME');
console.log('─'.repeat(74));
runChecks({});
const canonicalFailures = failures.slice();
results.length = 0;
failures.length = 0;
const caught = runMutations();
// Restore the canonical run so the summary reports the real suite, not the last
// mutated round.
results.length = 0;
failures.length = 0;
canonicalFailures.forEach((f) => failures.push(f));

console.log('─'.repeat(74));
console.log(`checks     : ${12 - failures.length}/12 PASS`);
console.log(`mutations  : ${caught}/${MUTATIONS.length} APPLIED + CAUGHT`);
if (failures.length || caught !== MUTATIONS.length) {
  if (failures.length) console.log(`FAILURES: ${failures.join(' · ')}`);
  console.log('LC-4 STAGE B — FAILED');
  process.exit(1);
}
console.log('LC-4 STAGE B — ALL CHECKS PASS');