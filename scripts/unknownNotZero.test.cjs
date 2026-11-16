#!/usr/bin/env node
/**
 * UNKNOWN ≠ ZERO — financial semantics gate (U1–U16, M-series).
 *
 * WHAT THIS PROVES
 *   The exact defect from the reported screenshot: revenue $5,000,000 with EBITDA
 *   UNANSWERED. Galileo said "you're running at roughly a 0% profit margin" and
 *   "I already have enough to start looking at where profit may be leaking", then
 *   asked for the EBITDA it had just claimed to know.
 *
 *   The cause was a semantic one: `Number(null)` is 0 and `Number.isFinite(0)` is
 *   true, so an unanswered fact was read as a verified zero and 0/5,000,000 became
 *   a "computable" margin. This suite runs the REAL gate and the REAL model on that
 *   input, and asserts:
 *     · revenue KNOWN, EBITDA UNKNOWN, margin UNKNOWN
 *     · no forbidden output of any kind (0%, $0, "no profit", "leak", "below benchmark")
 *     · EBITDA 500,000 → 10% margin, and ONLY THEN may profitability be interpreted
 *     · EBITDA 0 SUPPLIED → 0% margin (a real zero still works — UNKNOWN ≠ ZERO,
 *       not ZERO ≠ ZERO)
 *     · a modelled estimate is ESTIMATED, never reported as a measurement
 *
 * WHAT IT LOADS
 *   The real modules: src/lib/galileo/factKnowledge.js, preliminaryModel.js,
 *   interpretation.js — plus source-level assertions on the files that cannot be
 *   imported in plain node (the hook, the state machine, the question bank, the
 *   input component, the assessment prefill).
 *
 * Run: node scripts/unknownNotZero.test.cjs
 */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const F = {
  facts: 'src/lib/galileo/factKnowledge.js',
  model: 'src/lib/galileo/preliminaryModel.js',
  interpretation: 'src/lib/galileo/interpretation.js',
  hook: 'src/hooks/useGalileoConversation.js',
  stateMachine: 'src/lib/galileo/experienceStateMachine.js',
  questions: 'src/lib/galileo/adaptiveQuestions.js',
  stream: 'src/components/galileo/shell/ConversationStream.jsx',
  cards: 'src/components/galileo/shell/InsightCards.jsx',
  prefill: 'src/hooks/useAssessmentPrefill.js',
};

const read = (p, overrides) =>
  overrides && overrides[p] != null ? overrides[p] : fs.readFileSync(path.join(ROOT, p), 'utf8');

// Source assertions apply to LIVE code, not to comments: a comment quoting a
// phrase in order to document its removal is not a reasoning path.
const codeOf = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const stripExports = (s) => s.replace(/^\s*export\s+/gm, '').replace(/^\s*import[\s\S]*?from\s+'[^']+';/gm, '');

const failures = [];
const results = [];
/** During a mutation round the per-check chatter is suppressed — only the verdict is printed. */
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

/** factsFrom — evaluate the REAL factKnowledge module (import-free) from source. */
function factsFrom(source) {
  return new Function(
    `${stripExports(source)}
     return { Knowledge, resolveFacts, conclusionReadiness, requiredFactsKnown, knownMargin,
              profitInsightLine, revenueObservation, metricReadiness, knowledgeOf, toNumber };`,
  )();
}

/** bundleModule — evaluate a real module (and its relative/alias imports) as CJS. */
function bundleModule(entry) {
  const out = esbuild.buildSync({
    stdin: {
      contents: `module.exports = require(${JSON.stringify('./' + entry)});`,
      resolveDir: ROOT,
      sourcefile: 'harness-entry.js',
    },
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'es2020',
    write: false,
    logLevel: 'silent',
    alias: { '@': path.join(ROOT, 'src') },
  });
  const code = out.outputFiles[0].text;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', code)(mod, mod.exports, require);
  return mod.exports;
}

const FACTS_SRC = read(F.facts);

// ─────────────────────────────────────────────────────────────────────────────
// Behavioural checks — the REAL gate, on the REAL reported input
// ─────────────────────────────────────────────────────────────────────────────
function runChecks(overrides = {}) {
  const M = factsFrom(read(F.facts, overrides));
  const KNOWLEDGE = M.Knowledge;

  const unknownCase = M.resolveFacts({ answers: { industry: 'Commercial HVAC', revenue: 5000000 } });
  const knownCase = M.resolveFacts({ answers: { industry: 'Commercial HVAC', revenue: 5000000, ebitda: 500000 } });
  const zeroCase = M.resolveFacts({ answers: { industry: 'Commercial HVAC', revenue: 5000000, ebitda: 0 } });
  const estimatedCase = M.resolveFacts({
    answers: { industry: 'Commercial HVAC', revenue: 5000000, ebitda: 500000 },
    estimated: { ebitda: true },
  });

  const FORBIDDEN = /0%|zero percent|\$0\b|no profit|losing money|profit leak|leaking|below benchmark|underperform/i;

  check('U1', 'revenue $5M known · EBITDA unanswered → UNKNOWN (never 0)', () => {
    if (unknownCase.revenue.state !== KNOWLEDGE.KNOWN) return { ok: false, detail: `revenue=${unknownCase.revenue.state}` };
    if (unknownCase.ebitda.state !== KNOWLEDGE.UNKNOWN) return { ok: false, detail: `ebitda=${unknownCase.ebitda.state}` };
    if (unknownCase.ebitda.value !== null) return { ok: false, detail: `ebitda value=${unknownCase.ebitda.value}` };
    return true;
  });

  check('U2', 'profit margin is NOT computable, and EBITDA is named as the missing input', () => {
    const r = M.conclusionReadiness('profit_margin', unknownCase);
    if (r.ready) return { ok: false, detail: 'margin reported ready' };
    if (r.value !== null) return { ok: false, detail: `value=${r.value}` };
    if (!r.missing.includes('ebitda')) return { ok: false, detail: `missing=${JSON.stringify(r.missing)}` };
    if (r.question?.field !== 'ebitda') return { ok: false, detail: 'no next question offered' };
    return true;
  });

  check('U3', 'the conclusion readiness gate refuses the conclusion', () =>
    M.requiredFactsKnown('profit_margin', unknownCase) === false);

  check('U4', 'NO first insight exists at the revenue step', () => {
    const line = M.profitInsightLine(unknownCase);
    if (line !== null) return { ok: false, detail: String(line).slice(0, 120) };
    return true;
  });

  check('U5', 'what revenue ALONE says is honest — scale, benchmarks, what is missing', () => {
    const line = M.revenueObservation(unknownCase);
    if (!line) return { ok: false, detail: 'no observation' };
    if (FORBIDDEN.test(line)) return { ok: false, detail: `forbidden claim: ${line}` };
    if (!/\$5\.0M/.test(line)) return { ok: false, detail: `no scale stated: ${line}` };
    if (!/profitab/i.test(line)) return { ok: false, detail: `does not state what is missing: ${line}` };
    return true;
  });

  check('U6', 'a peer benchmark range may be quoted, but never as the owner’s position', () => {
    const line = M.revenueObservation(unknownCase, { typicalLow: 8, typicalHigh: 14, normalizedIndustry: 'HVAC' });
    if (!line) return { ok: false, detail: 'no observation' };
    if (/you're running at|your margin is|below benchmark/i.test(line)) return { ok: false, detail: line };
    if (!/8–14%/.test(line)) return { ok: false, detail: `benchmark range missing: ${line}` };
    return true;
  });

  check('U7', 'EBITDA $500,000 → margin 10%, and ONLY NOW may profitability be interpreted', () => {
    const r = M.conclusionReadiness('profit_margin', knownCase);
    if (!r.ready) return { ok: false, detail: `ready=${r.ready}` };
    if (r.value !== 10) return { ok: false, detail: `value=${r.value}` };
    const line = M.profitInsightLine(knownCase);
    if (!line || !/10%/.test(line)) return { ok: false, detail: `insight=${line}` };
    return true;
  });

  check('U8', 'EBITDA 0 SUPPLIED → margin 0% (a real zero is a fact)', () => {
    const r = M.conclusionReadiness('profit_margin', zeroCase);
    if (!r.ready) return { ok: false, detail: `ready=${r.ready} missing=${JSON.stringify(r.missing)}` };
    if (r.value !== 0) return { ok: false, detail: `value=${r.value}` };
    if (zeroCase.ebitda.state !== KNOWLEDGE.KNOWN) return { ok: false, detail: `state=${zeroCase.ebitda.state}` };
    const line = M.profitInsightLine(zeroCase);
    if (!line || !/0% profit margin/.test(line)) return { ok: false, detail: `insight=${line}` };
    return true;
  });

  check('U9', 'a modelled EBITDA is ESTIMATED — usable, never called a measurement', () => {
    const r = M.conclusionReadiness('profit_margin', estimatedCase);
    if (!r.ready) return { ok: false, detail: 'estimate not usable at all' };
    if (r.state !== KNOWLEDGE.ESTIMATED) return { ok: false, detail: `state=${r.state}` };
    const line = M.profitInsightLine(estimatedCase);
    if (!line) return { ok: false, detail: 'no line' };
    if (/leaking/i.test(line)) return { ok: false, detail: `estimate claims knowledge: ${line}` };
    if (!/estimate/i.test(line)) return { ok: false, detail: `estimate not disclosed: ${line}` };
    return true;
  });

  check('U10', 'null · undefined · "" · "abc" · skipped are all UNKNOWN, never 0', () => {
    const cases = [null, undefined, '', 'abc', '   ', NaN];
    const bad = [];
    for (const v of cases) {
      const f = M.resolveFacts({ answers: { revenue: 5000000, ebitda: v } });
      if (f.ebitda.state !== KNOWLEDGE.UNKNOWN || f.ebitda.value !== null) bad.push(JSON.stringify(v));
      if (M.requiredFactsKnown('profit_margin', f)) bad.push(`ready:${JSON.stringify(v)}`);
    }
    if (bad.length) return { ok: false, detail: bad.join(', ') };
    return true;
  });

  check('U11', 'revenue 0 with a known EBITDA → margin UNKNOWN (not Infinity, not 0)', () => {
    const f = M.resolveFacts({ answers: { revenue: 0, ebitda: 500000 } });
    const r = M.conclusionReadiness('profit_margin', f);
    if (r.ready) return { ok: false, detail: `ready with value ${r.value}` };
    if (/Infinity|NaN/.test(String(r.value))) return { ok: false, detail: String(r.value) };
    return true;
  });

  check('U12', 'a document fact outranks the answer, and confirmation outranks both', () => {
    const withDoc = M.resolveFacts({
      answers: { revenue: 1000000, ebitda: 50000 },
      extractedFacts: { facts: { annual_revenue: { normalized: 5000000 }, reported_ebitda: { normalized: 500000 } } },
    });
    if (withDoc.revenue.source !== 'document') return { ok: false, detail: `source=${withDoc.revenue.source}` };
    if (M.conclusionReadiness('profit_margin', withDoc).value !== 10) return { ok: false, detail: 'document margin not used' };
    const confirmed = M.resolveFacts({ answers: { revenue: 1000000 }, verified: { revenue: 5000000, ebitda: 500000 } });
    if (confirmed.revenue.source !== 'verified') return { ok: false, detail: `source=${confirmed.revenue.source}` };
    return true;
  });

  // ── the model that feeds the Pulse ────────────────────────────────────────
  const model = bundleModule(F.model);
  check('U13', 'preliminary model: revenue only → NO profit signal, NO value signal, no opportunity from value', () => {
    const built = model.buildPreliminaryModel({ industry: 'Commercial HVAC', revenue: 5000000 });
    if (built.signals.profit !== null) return { ok: false, detail: `profit=${JSON.stringify(built.signals.profit)}` };
    if (built.signals.value !== null) return { ok: false, detail: `value=${JSON.stringify(built.signals.value)}` };
    if (built.opportunities.some((o) => o.id === 'value_gap')) return { ok: false, detail: 'value_gap invented' };
    return true;
  });

  check('U14', 'preliminary model: EBITDA 500,000 → 10% margin; EBITDA 0 → 0% (both real)', () => {
    const ten = model.buildPreliminaryModel({ industry: 'Commercial HVAC', revenue: 5000000, ebitda: 500000 });
    if (ten.signals.profit?.margin !== 10) return { ok: false, detail: `margin=${ten.signals.profit?.margin}` };
    const zero = model.buildPreliminaryModel({ industry: 'Commercial HVAC', revenue: 5000000, ebitda: 0 });
    if (zero.signals.profit?.margin !== 0) return { ok: false, detail: `margin=${zero.signals.profit?.margin}` };
    return true;
  });

  const interpretation = bundleModule(F.interpretation);
  check('U15', 'interpretAnswer says nothing about margin while EBITDA is unanswered', () => {
    if (interpretation.interpretAnswer('ebitda', { revenue: 5000000, ebitda: null }) !== null) {
      return { ok: false, detail: 'spoke about an unknown margin' };
    }
    if (interpretation.interpretAnswer('revenue', { revenue: 5000000, ebitda: null }) !== null) {
      return { ok: false, detail: 'revenue answer produced a margin statement' };
    }
    const said = interpretation.interpretAnswer('ebitda', { revenue: 5000000, ebitda: 500000 });
    if (!said || !/10%/.test(said)) return { ok: false, detail: `said=${said}` };
    return true;
  });

  // ── source-level: the coercion may not return ─────────────────────────────
  check('U16', 'the insight path asks the gate — no Number()/isFinite coercion of a missing fact', () => {
    const hook = codeOf(read(F.hook, overrides));
    if (!/profitInsightLine\(facts\)/.test(hook)) return { ok: false, detail: 'the gate is not used by the hook' };
    if (/Number\(answers\.ebitda\)/.test(hook)) return { ok: false, detail: 'Number(answers.ebitda) is back' };
    if (/Number\.isFinite\(ebitda\)/.test(hook)) return { ok: false, detail: 'isFinite(ebitda) is back' };
    if (/profit margin, and I already have enough/.test(hook)) return { ok: false, detail: 'the sentence was re-inlined' };
    return true;
  });

  check('S1', 'the hook passes fact states into interpretation and the value rhythm', () => {
    const hook = codeOf(read(F.hook, overrides));
    if (!/resolveFacts\(\{ answers: updated, verified, extractedFacts, estimated \}\)/.test(hook)) {
      return { ok: false, detail: 'no resolved facts in answerDiscoveryQuestion' };
    }
    if (!/interpretAnswer\(actualField, updated, facts\)/.test(hook)) return { ok: false, detail: 'interpretation not fact-aware' };
    if (!/facts: resolveFacts\(/.test(hook)) return { ok: false, detail: 'value-before-question not fact-aware' };
    if (!/Knowledge\.ESTIMATED/.test(hook)) return { ok: false, detail: 'estimate language not gated on the state' };
    return true;
  });

  check('S2', 'the state machine states a REVENUE observation, not a margin one', () => {
    const sm = codeOf(read(F.stateMachine, overrides));
    if (/'margin_observation'/.test(sm)) return { ok: false, detail: 'margin_observation is back' };
    if (!/revenueObservation\(facts, benchmark\)/.test(sm)) return { ok: false, detail: 'revenueObservation not used' };
    if (/typical businesses operate on \$\{benchmark\.typicalLow\}–\$\{benchmark\.typicalHigh\}% margins\./.test(sm)) {
      return { ok: false, detail: 'peer range stated without the missing input' };
    }
    return true;
  });

  check('S3', 'the question bank never implies a margin is known after revenue', () => {
    const q = codeOf(read(F.questions, overrides));
    if (/start looking at margins/.test(q)) return { ok: false, detail: 'the old revenue line is back' };
    return true;
  });

  check('S4', 'a non-numeric entry becomes UNKNOWN, never 0', () => {
    const stream = codeOf(read(F.stream, overrides));
    if (!/Number\.isFinite\(parsed\) \? parsed : null/.test(stream)) return { ok: false, detail: 'the input can store NaN' };
    return true;
  });

  check('S5', 'no `|| 0` manufactures a zero in the scenario card', () => {
    const cards = codeOf(read(F.cards, overrides));
    if (/signals\?\.value\?\.current \/ 4 \|\| 0/.test(cards)) return { ok: false, detail: 'the coercion is back' };
    if (!/signals\?\.value\?\.current != null/.test(cards)) return { ok: false, detail: 'no explicit unknown handling' };
    return true;
  });

  check('S6', 'the assessment prefill no longer prefills $0 for an absent metric', () => {
    const prefill = codeOf(read(F.prefill, overrides));
    if (/d\.revenue \|\| 0|d\.ebitda \|\| 0|d\.net_profit \|\| 0/.test(prefill)) {
      return { ok: false, detail: 'a missing profile metric becomes 0' };
    }
    return true;
  });

  check('S7', 'the gate is centralised — the rule is declared where facts live', () => {
    // The declared rule is prose (it is a contract, so its wording is part of it),
    // and it is read from the RAW source for exactly that reason. The machine-
    // checkable parts are asserted on the live code.
    const raw = read(F.facts, overrides);
    if (!raw.includes('UNKNOWN IS NOT ZERO')) return { ok: false, detail: 'the rule is not declared' };
    const facts = codeOf(raw);
    for (const needle of ['METRIC_REQUIREMENTS', 'requiredFactsKnown', 'conclusionReadiness', 'knownMargin']) {
      if (!facts.includes(needle)) return { ok: false, detail: `missing: ${needle}` };
    }
    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutation certification — each defect, reintroduced, must be caught
// ─────────────────────────────────────────────────────────────────────────────
const MUTATIONS = [
  {
    name: 'M-COERCE   the missing EBITDA is coerced to a number again (the reported defect)',
    catchId: 'U16',
    apply: (s) => ({
      [F.hook]: s[F.hook].replace(
        'const firstInsight = valueShownRef.current ? null : profitInsightLine(facts);',
        'const _ebitda = Number(answers.ebitda);\n    const firstInsight = valueShownRef.current ? null : `You are running at roughly ${Math.round((_ebitda / Number(answers.revenue)) * 1000) / 10}% profit margin`;',
      ),
    }),
  },
  {
    name: 'M-GATE     the readiness gate is bypassed, so the metric computes anyway',
    catchId: 'U2/U3/U4',
    apply: (s) => ({
      [F.facts]: s[F.facts].replace(
        '  return { metric, required, missing, ready: required.length > 0 && missing.length === 0 };',
        '  return { metric, required, missing, ready: required.length > 0 };',
      ),
    }),
  },
  {
    name: 'M-ZERO     the scenario card manufactures $0 again',
    catchId: 'S5',
    apply: (s) => ({
      [F.cards]: s[F.cards].replace(
        'model?.signals?.value?.current != null ? model.signals.value.current / 4 : null',
        '(model?.signals?.value?.current / 4) || 0',
      ),
    }),
  },
  {
    name: 'M-PREFILL  an absent profile metric becomes 0 in the assessment prefill',
    catchId: 'S6',
    apply: (s) => ({ [F.prefill]: s[F.prefill].replace('ebitda: d.ebitda ?? null,', 'ebitda: d.ebitda || 0,') }),
  },
  {
    name: 'M-OBS      the revenue observation is called a margin observation again',
    catchId: 'S2',
    apply: (s) => ({
      [F.stateMachine]: s[F.stateMachine].replace("type: 'revenue_observation',", "type: 'margin_observation',"),
    }),
  },
  {
    name: 'M-QUOTE    the revenue line implies a margin is known again',
    catchId: 'S3',
    apply: (s) => ({
      [F.questions]: s[F.questions].replace(
        'That gives me the scale of the business. Profitability is the next piece I need.',
        'That gives me enough to start looking at margins.',
      ),
    }),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
console.log('UNKNOWN ≠ ZERO — financial semantics gate (U1–U16, S1–S7)');
console.log('─'.repeat(74));
runChecks();

let mutationsOk = 0;
console.log('─'.repeat(74));
// The canonical verdict is kept; every mutation round is scored on its own run and
// then discarded, so a reintroduced defect cannot pollute the reported result.
const canonical = results.slice();
const canonicalFailures = failures.slice();
results.length = 0;
failures.length = 0;

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
  console.log('UNKNOWN ≠ ZERO — NOT CERTIFIED');
  if (failures.length) console.log(`failed: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('UNKNOWN ≠ ZERO — ALL CHECKS PASS');
console.log('NOTE: semantics and language only. No rendered pixel was observed here.');