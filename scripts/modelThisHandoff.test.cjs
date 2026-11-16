#!/usr/bin/env node
/**
 * MODEL THIS → THE MAIN VISION INTERFACE (H1–H12 + mutations).
 *
 * WHAT THIS PROVES
 *   MODEL THIS used to open a right-side "Scenario Detail" drawer. That is a detail
 *   INSPECTOR, and the action it was attached to is a TRANSITION: the owner had gone
 *   from discovery to "I want to see what I could actually do about this."
 *
 *   This suite proves the replacement is real, and that it is wired to the EXISTING
 *   architecture rather than a second scenario system:
 *     · the canonical Scenario is created (lever mapping from the What If catalog)
 *     · it is PRESERVED in the existing saved store, as exploring — not a Play
 *     · the record carries the whole context forward (opportunity, strategy, facts,
 *       answers, intent, evidence, confidence) — nothing restarts
 *     · the arriving copy is DERIVED from that record, so a pricing opportunity and
 *       an owner-dependency opportunity do not say the same thing
 *     · the next steps are the opportunity's OWN actions, capped at three
 *     · a refresh does not lose it, and returning to the conversation does not
 *       re-open it
 *     · NO Scenario Detail drawer is opened by MODEL THIS
 *
 * WHAT IT LOADS
 *   The real modules: activeScenario.js, implementationAccess.js,
 *   opportunityScenarios.js, saveManager.js — plus source-level assertions on the
 *   hook, the shell, the drawer and the input stream (which cannot be imported here).
 *
 * Run: node scripts/modelThisHandoff.test.cjs
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
  drawer: 'src/components/galileo/shell/IntelligenceDrawer.jsx',
  stream: 'src/components/galileo/shell/ConversationStream.jsx',
};

const read = (p, overrides) =>
  overrides && overrides[p] != null ? overrides[p] : fs.readFileSync(path.join(ROOT, p), 'utf8');
const codeOf = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
/** Drop import/export syntax so a pure module can be evaluated in plain node. */
const loadable = (s) =>
  s.replace(/^\s*import[\s\S]*?from\s+'[^']+';/gm, '').replace(/^\s*export\s+/gm, '');

// ── A real session store, so the refresh path is exercised for real ───────────
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
  } catch (err) {
    detail = err?.message || String(err);
  }
  results.push({ id, ok, label, detail });
  if (!ok && !mutationRound) failures.push(`${id} ${label}`);
  if (!mutationRound) console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

/**
 * buildWorld — evaluate the real modules against one storage instance.
 * The scenario mapper and the saved-item store are the LIVE implementations,
 * injected as the parameters the module actually imports.
 */
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
     return { activateScenario, readActiveScenario, markScenarioReturned, clearActiveScenario, scenarioContinuation };`,
  )(scenarioForOpportunity, saveMod.saveItem);

  return { store, active, saveMod, scenarioForOpportunity };
}

const OPP = {
  owner_dependency: {
    id: 'owner_dependency',
    title: 'Owner Dependency',
    summary:
      'How much the business depends on you day-to-day is likely affecting both your freedom and what a buyer would pay.',
    confidence: 'moderate',
    evidence: ['Your reported owner involvement', 'Buyers discount businesses that run on the owner'],
    strategies: ['Document your key processes', 'Delegate one operational area', 'Build a management layer', 'Reduce hours worked per week'],
  },
  pricing: {
    id: 'margin',
    title: 'Pricing Power',
    summary: 'Your pricing may not reflect the value you deliver.',
    confidence: 'low',
    evidence: ['Your revenue and margin'],
    strategies: ['Raise prices on the top 20% of accounts', 'Re-price legacy contracts'],
  },
};

const BASE = {
  answers: { industry: 'Commercial HVAC', revenue: 5000000, ebitda: null, involvement: 'heavy' },
  facts: { revenue: { state: 'known', value: 5000000 }, ebitda: { state: 'unknown', value: null } },
  intent: 'reduce_dependency',
  model: { signals: { operations: { score: 33 } } },
  guestSessionId: 'guest_123',
};

// ─────────────────────────────────────────────────────────────────────────────
function runChecks(overrides = {}) {
  const world = buildWorld(overrides);
  const record = world.active.activateScenario({ ...BASE, opportunity: OPP.owner_dependency, strategy: 'Document your key processes' });
  const pricingRecord = world.active.activateScenario({ ...BASE, opportunity: OPP.pricing, strategy: 'Raise prices on the top 20% of accounts' });
  const cont = world.active.scenarioContinuation(record);
  const pricingCont = world.active.scenarioContinuation(pricingRecord);

  check('H1', 'the canonical Scenario is created — the lever comes from the What If catalog', () => {
    if (!record) return { ok: false, detail: 'no record' };
    if (record.scenario?.key !== 'hire_manager') return { ok: false, detail: `key=${record.scenario?.key}` };
    if (pricingRecord.scenario?.key !== 'raise_prices') return { ok: false, detail: `pricing key=${pricingRecord.scenario?.key}` };
    return true;
  });

  check('H2', 'the scenario is PRESERVED in the existing saved store, as exploring (not a Play)', () => {
    const items = world.saveMod.getSavedItems();
    const saved = items.find((i) => i.type === 'scenario');
    if (!saved) return { ok: false, detail: 'nothing saved' };
    if (saved.data?.stage !== 'exploring') return { ok: false, detail: `stage=${saved.data?.stage}` };
    if (saved.data?.scenarioKey !== 'hire_manager') return { ok: false, detail: `scenarioKey=${saved.data?.scenarioKey}` };
    return true;
  });

  check('H3', 'the CONTEXT is carried forward — opportunity, strategy, facts, answers, intent', () => {
    if (record.opportunity?.title !== 'Owner Dependency') return { ok: false, detail: 'opportunity not carried' };
    if (!record.opportunity?.summary) return { ok: false, detail: 'summary not carried' };
    if (record.strategy !== 'Document your key processes') return { ok: false, detail: 'strategy not carried' };
    if (record.answers?.revenue !== 5000000) return { ok: false, detail: 'answers not carried' };
    if (record.intent !== 'reduce_dependency') return { ok: false, detail: 'intent not carried' };
    if (record.facts?.ebitda?.state !== 'unknown') return { ok: false, detail: 'fact states not carried' };
    return true;
  });

  check('H4', 'the arriving copy is DERIVED from this opportunity — never one global script', () => {
    if (!cont?.nextMove?.text) return { ok: false, detail: 'no next move' };
    if (!/depends on knowledge that lives only with you/i.test(cont.nextMove.text)) {
      return { ok: false, detail: cont.nextMove.text };
    }
    if (!pricingCont?.nextMove?.text) return { ok: false, detail: 'no pricing next move' };
    if (!/prices/i.test(pricingCont.nextMove.text)) return { ok: false, detail: pricingCont.nextMove.text };
    if (/document/i.test(pricingCont.nextMove.text)) return { ok: false, detail: `global copy leaked: ${pricingCont.nextMove.text}` };
    return true;
  });

  check('H5', 'the next steps are the opportunity’s OWN actions, chosen one first, at most three', () => {
    const steps = cont.steps || [];
    if (steps.length === 0 || steps.length > 3) return { ok: false, detail: `count=${steps.length}` };
    if (steps[0] !== 'Document your key processes') return { ok: false, detail: `first=${steps[0]}` };
    const invented = steps.filter((s) => !OPP.owner_dependency.strategies.includes(s));
    if (invented.length) return { ok: false, detail: `invented: ${invented.join(' | ')}` };
    return true;
  });

  check('H6', 'what Galileo found is the model’s own words, with its confidence and evidence', () => {
    if (cont.focusSummary !== OPP.owner_dependency.summary) return { ok: false, detail: 'summary not the model’s' };
    if (cont.confidence !== 'moderate') return { ok: false, detail: `confidence=${cont.confidence}` };
    if (!Array.isArray(cont.evidence) || cont.evidence.length !== 2) return { ok: false, detail: 'evidence not carried' };
    if (!cont.fork?.galileo?.label || !cont.fork?.expert?.label) return { ok: false, detail: 'fork missing' };
    return true;
  });

  check('H7', 'a refresh does not lose it — a fresh read sees the active scenario', () => {
    // The MOST RECENTLY activated scenario is the active one (one focus at a time),
    // and a brand-new module instance must read it back from storage alone.
    const reread = buildWorld(overrides, world.store).active.readActiveScenario();
    if (!reread) return { ok: false, detail: 'handoff lost' };
    if (reread.id !== pricingRecord.id) return { ok: false, detail: 'the active scenario is not the latest one' };
    if (reread.strategy !== pricingRecord.strategy) return { ok: false, detail: 'strategy lost' };
    if (!reread.opportunity?.title) return { ok: false, detail: 'opportunity lost across the refresh' };
    return true;
  });

  check('H8', 'returning to the conversation marks it returned, so it is not pushed twice', () => {
    const marked = world.active.markScenarioReturned();
    if (!marked?.returned) return { ok: false, detail: 'not marked' };
    const reread = buildWorld(overrides, world.store).active.readActiveScenario();
    if (reread.returned !== true) return { ok: false, detail: 'flag not persisted' };
    return true;
  });

  // ── source-level: the transition replaced the drawer, and the drawer remains ─
  const hook = codeOf(read(F.hook, overrides));
  const modelBranch = hook.slice(
    hook.indexOf('const handleImplementationAction = useCallback('),
    hook.indexOf('}, [selectedStrategy, selectedOpportunity, model, answers'),
  );

  check('H9', 'MODEL THIS no longer opens the Scenario Detail drawer — it transitions', () => {
    if (!modelBranch.includes('activateScenario({')) return { ok: false, detail: 'no canonical scenario created' };
    if (modelBranch.includes("type: 'scenario'")) return { ok: false, detail: 'the scenario drawer is back' };
    if (!modelBranch.includes("setFlowState('exploring')")) return { ok: false, detail: 'no transition' };
    if (!/setActiveScenario\(record\)/.test(modelBranch)) return { ok: false, detail: 'the scenario is not activated' };
    return true;
  });

  check('H10', 'the main interface continues it — the continuation surface, wired to the EXISTING flows', () => {
    const page = codeOf(read(F.page, overrides));
    if (!/loop\.showContinuation \? \(/.test(page)) return { ok: false, detail: 'no continuation branch' };
    if (!/<ScenarioContinuation/.test(page)) return { ok: false, detail: 'surface not rendered' };
    if (!/loop\.handleGuideChoice\('guide_me'\)/.test(page)) return { ok: false, detail: 'Galileo path not the existing one' };
    if (!/loop\.handleGuideChoice\('expert'\)/.test(page)) return { ok: false, detail: 'expert path not the existing one' };
    if (!/loop\.returnToConversation/.test(page)) return { ok: false, detail: 'no return to the conversation' };
    return true;
  });

  check('H11', 'no new entitlements are invented by the handoff', () => {
    const blob = codeOf(read(F.active, overrides)) + codeOf(read(F.continuation, overrides)) + codeOf(read(F.page, overrides));
    for (const bad of ['stripe', 'paywall', 'upgrade', 'credits', 'entitlement', 'subscription']) {
      if (new RegExp(bad, 'i').test(blob)) return { ok: false, detail: `billing invented: ${bad}` };
    }
    return true;
  });

  check('H12', 'the drawer is kept for what it is good at; the stream still routes the action', () => {
    const drawer = codeOf(read(F.drawer, overrides));
    if (!/type === 'scenario' && <ScenarioView/.test(drawer)) return { ok: false, detail: 'scenario view removed' };
    if (!/type === 'evidence' && <EvidenceView/.test(drawer)) return { ok: false, detail: 'evidence view removed' };
    if (!/type === 'pulse_domain'/.test(drawer)) return { ok: false, detail: 'pulse view removed' };
    if (!/case 'implement': onImplementationAction\(value\); break;/.test(codeOf(read(F.stream, overrides)))) {
      return { ok: false, detail: 'the action is no longer routed' };
    }
    return true;
  });

  check('H13', 'the handoff carries the answers and never resets the conversation', () => {
    if (!/answers: \{ \.\.\.answers \}/.test(codeOf(read(F.active, overrides)))) {
      return { ok: false, detail: 'answers are not carried, so a return could not resume them' };
    }
    // The transition must not restart anything: no conversation reset, no answer
    // reset, and no re-asking of what the owner already gave.
    if (/setConversation\(|setAnswers\(/.test(modelBranch)) {
      return { ok: false, detail: 'the handoff resets conversation state' };
    }
    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
const MUTATIONS = [
  {
    name: 'M-DRAWER    MODEL THIS opens the Scenario Detail drawer again',
    catchId: 'H9',
    apply: (s) => ({
      [F.hook]: s[F.hook].replace(
        "        setActiveScenario(record);\n        setFlowState('exploring');",
        "        setDrawerState({ open: true, type: 'scenario', data: { strategy: selectedStrategy } });\n        setActiveScenario(record);\n        setFlowState('exploring');",
      ),
    }),
  },
  {
    name: 'M-GLOBAL    the arriving copy becomes one hardcoded script',
    catchId: 'H4',
    apply: (s) => ({
      [F.active]: s[F.active].replace(
        '(record.scenario?.key && LEVER_MOVE[record.scenario.key])',
        "'Document systems & processes.'",
      ),
    }),
  },
  {
    name: 'M-CONTEXT   the context is dropped, so the arrival starts from nothing',
    catchId: 'H3',
    apply: (s) => ({ [F.active]: s[F.active].replace('    answers: { ...answers },', '    answers: {},') }),
  },
  {
    name: 'M-PRESERVE  the scenario is no longer kept as a real object',
    catchId: 'H2',
    apply: (s) => ({ [F.active]: s[F.active].replace('  try {\n    saveItem(', '  try {\n    if (false) saveItem(') }),
  },
  {
    name: 'M-REFRESH   a refresh loses the exploration',
    catchId: 'H7',
    apply: (s) => ({
      [F.active]: s[F.active].replace(
        '    const raw = store.getItem(ACTIVE_KEY);\n    return raw ? JSON.parse(raw) : null;',
        '    return null;',
      ),
    }),
  },
  {
    name: 'M-NEWPATH   the fork abandons the existing implementation paths',
    catchId: 'H10',
    apply: (s) => ({
      [F.page]: s[F.page].replace("loop.handleGuideChoice('expert')", "loop.handleGuideChoice('expert_v2')"),
    }),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
console.log('MODEL THIS → MAIN VISION INTERFACE (H1–H13)');
console.log('─'.repeat(74));
runChecks();

const canonical = results.slice();
const canonicalFailures = failures.slice();
results.length = 0;
failures.length = 0;

let mutationsOk = 0;
console.log('─'.repeat(74));
for (const m of MUTATIONS) {
  const base = Object.fromEntries(Object.keys(F).map((k) => [F[k], read(F[k])]));
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
  const caught = results.some((r) => !r.ok && m.catchId.split('/').some((id) => r.id === id));
  if (caught) {
    mutationsOk += 1;
    console.log(`CAUGHT  ${m.name}  (${m.catchId})`);
  } else {
    console.log(`MISSED  ${m.name}  (${m.catchId})`);
  }
}

results.length = 0;
canonical.forEach((r) => results.push(r));
failures.length = 0;
canonicalFailures.forEach((f) => failures.push(f));

const passed = results.filter((r) => r.ok).length;
console.log('─'.repeat(74));
console.log(`checks     : ${passed}/${results.length} PASS`);
console.log(`mutations  : ${mutationsOk}/${MUTATIONS.length} APPLIED + BEHAVIOR_CHANGED + CAUGHT`);
if (failures.length || mutationsOk !== MUTATIONS.length) {
  console.log('MODEL THIS HANDOFF — NOT CERTIFIED');
  if (failures.length) console.log(`failed: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('MODEL THIS HANDOFF — ALL CHECKS PASS');
console.log('NOTE: state, wiring and copy only. The transition was NOT observed in a browser here.');