/**
 * GALILEO NEW-USER ONBOARDING RECOVERY — functional harness (O1–O25).
 *
 * WHAT THIS PROVES
 *   The first-run experience MOVES. Every continuation action either produces a
 *   question the owner has not already dealt with, or explicitly advances the
 *   experience — and the reported "Keep Going" loop is structurally impossible.
 *
 * WHAT IT LOADS
 *   The REAL modules, not copies:
 *     · src/lib/galileo/adaptiveQuestions.js      (the question bank)
 *     · src/lib/galileo/questionPriorityEngine.js (the Knowledge Gap Engine)
 *     · src/lib/galileo/signalAwakening.js        (Business Pulse awakening)
 *     · src/lib/galileo/experienceStateMachine.js (experience state)
 *   plus the two files that cannot be imported in plain node (a React hook and an
 *   .jsx component) — those are asserted at SOURCE level, which is where their
 *   contribution lives: which handler a continuation calls, and which composition
 *   the question renders.
 *
 * Run: node scripts/galileoOnboardingRecovery.test.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILES = {
  questions: 'src/lib/galileo/adaptiveQuestions.js',
  gap: 'src/lib/galileo/questionPriorityEngine.js',
  pulse: 'src/lib/galileo/signalAwakening.js',
  state: 'src/lib/galileo/experienceStateMachine.js',
  hook: 'src/hooks/useGalileoConversation.js',
  stream: 'src/components/galileo/shell/ConversationStream.jsx',
};
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ── A tiny ESM→CJS evaluator for the pure modules ────────────────────────────
const exportedNames = (src) =>
  [...new Set([...src.matchAll(/^export\s+(?:function|const|let)\s+([A-Za-z0-9_]+)/gm)].map((m) => m[1]))];

function evaluate(sources) {
  const merged = sources.join('\n');
  const names = exportedNames(merged);
  // Named imports become local bindings FIRST (an alias like `X as Y` is a real
  // binding), so stripping the import lines afterwards cannot lose a name.
  const shimmed = merged.replace(
    /^\s*import\s*\{([^}]*)\}\s*from\s*'[^']*';\s*$/gm,
    (line, spec) => spec
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const [name, alias] = s.split(/\s+as\s+/).map((x) => x.trim());
        return alias ? `const ${alias} = ${name};` : '';
      })
      .filter(Boolean)
      .join('\n'),
  );
  const body = shimmed
    .replace(/^\s*import[^;]*;\s*$/gm, '')
    .replace(/^export\s+/gm, '');
  // eslint-disable-next-line no-new-func
  return new Function(`${body}\nreturn { ${names.join(', ')} };`)();
}

// ── Test plumbing ────────────────────────────────────────────────────────────
const failures = [];
const log = [];
function check(id, description, condition, detail) {
  if (condition) log.push(`  ok   ${id}  ${description}`);
  else {
    const line = `  FAIL ${id}  ${description}${detail ? ` — ${detail}` : ''}`;
    log.push(line);
    failures.push(line);
  }
}

const QUESTIONS = 'src/lib/galileo/adaptiveQuestions.js';
const ALL_INTENTS = [
  'find_opportunities', 'improve_cash_flow', 'lower_taxes', 'increase_profit',
  'increase_value', 'get_ready_to_sell', 'reduce_dependency', 'already_implementing', 'not_sure',
];

function loadStack(sources = {}) {
  const questionsSrc = sources.questions || read(FILES.questions);
  const gapSrc = sources.gap || read(FILES.gap);
  return {
    questionsSrc,
    gapSrc,
    G: evaluate([questionsSrc, gapSrc]),
    P: evaluate([read(FILES.pulse)]),
    S: evaluate([read(FILES.state)]),
  };
}

function runChecks(sources = {}) {
  const before = failures.length;
  const { G, P, S, questionsSrc, gapSrc } = loadStack(sources);
  const hookSrc = sources.hook || read(FILES.hook);
  const streamSrc = sources.stream || read(FILES.stream);
  // A stack whose modules failed to evaluate is reported, not thrown.
  if (!G?.selectNextGap) {
    check('O0', 'the knowledge gap engine loaded', false, 'selectNextGap missing');
    return failures.slice(before);
  }

  const gap = (ctx) => G.selectNextGap(ctx);
  const field = (ctx) => gap(ctx)?.question?.field || null;

  // ── O1 / O2 — the subject fork progresses ─────────────────────────────────
  check('O1', 'My Business progresses to a question', !!field({ answers: {}, intent: null }) === true,
    'expected a question, got none');
  check('O2', 'A Client progresses to a question', !!field({ answers: {}, intent: 'not_sure' }),
    'expected a question, got none');

  // ── O3 — each intent progresses ───────────────────────────────────────────
  const intentProgress = ALL_INTENTS.map((intent) => ({
    intent, f: field({ answers: { industry: 'Construction' }, answeredQuestionIds: ['industry'], intent }),
  }));
  check('O3', 'each of the 9 intents progresses to a question',
    intentProgress.every((r) => !!r.f), JSON.stringify(intentProgress.filter((r) => !r.f)));

  // ── O4 — Not Sure progresses ──────────────────────────────────────────────
  check('O4', '"Show me what you see" progresses', !!field({ answers: {}, intent: 'not_sure' }));

  // ── O5 — "Keep exploring" continues the sequence ──────────────────────────
  const afterRevenue = field({
    answers: { industry: 'Construction', revenue: 2400000 },
    answeredQuestionIds: ['industry', 'revenue'],
  });
  check('O5', 'a continuation after revenue asks a DIFFERENT question',
    !!afterRevenue && afterRevenue !== 'revenue', `got ${afterRevenue}`);

  // ── O6 — the same question cannot repeat after it was answered ────────────
  const repeatAttempt = gap({
    answers: { industry: 'Construction', revenue: 2400000, ebitda: 260000 },
    answeredQuestionIds: ['industry', 'revenue', 'ebitda'],
    currentQuestionId: 'ebitda',
  });
  check('O6', 'an answered question is refused and the next gap is resolved',
    repeatAttempt.question?.field !== 'ebitda' && repeatAttempt.refused.includes('ebitda'),
    JSON.stringify(repeatAttempt.refused));

  // ── O7 — an unknown/skipped answer still progresses ───────────────────────
  const afterSkip = field({ answers: { industry: null }, answeredQuestionIds: ['industry'] });
  check('O7', 'a skipped answer progresses and is not re-asked',
    !!afterSkip && afterSkip !== 'industry', `got ${afterSkip}`);

  // ── O8 — a skipped question is never re-asked ─────────────────────────────
  const skipTwo = field({
    answers: { industry: 'Construction', revenue: null, ebitda: null },
    answeredQuestionIds: ['industry', 'revenue', 'ebitda'],
  });
  check('O8', 'skipped revenue/EBITDA are not re-asked',
    !!skipTwo && !['industry', 'revenue', 'ebitda'].includes(skipTwo), `got ${skipTwo}`);

  // ── O9 / O10 — connections and upload return to the journey ───────────────
  check('O9', 'the connection sheet returns to the gap sequence (source)',
    /askNextRef\.current\?\.\(answers, null, gapRef\.current\)/.test(hookSrc));
  check('O10', 'upload remains available from the accelerator (source)',
    /variant: 'document_upload'/.test(hookSrc) && /'share_financials'/.test(hookSrc));

  // ── O11 — the pulse wakes only where supported ────────────────────────────
  const cold = P.computeSignalStates(null, {}, null);
  check('O11', 'with no data every signal stays Learning (no fabricated value)',
    Object.values(cold).every((s) => s.value == null), JSON.stringify(cold));

  // ── O12 — no unsupported financial conclusion ─────────────────────────────
  const revenueOnly = P.computeSignalStates(null, { revenue: 2400000 }, null);
  check('O12', 'revenue alone produces no margin, no value, and no cash/tax figure',
    revenueOnly.profit.value == null && revenueOnly.value.value == null
      && revenueOnly.cash.value == null && revenueOnly.tax.value == null,
    JSON.stringify({ profit: revenueOnly.profit, value: revenueOnly.value }));

  // ── O13 — the first insight arrives without an account ───────────────────
  const warm = P.computeSignalStates(null, { revenue: 2400000, ebitda: 260000 }, null);
  check('O13', 'revenue + EBITDA alone wake Profit at 10.8% — no connection, no account',
    warm.profit.value != null && warm.profit.label === '10.8%', JSON.stringify(warm.profit));
  check('O13b', 'the first insight is stated in Galileo\'s own voice (source)',
    /profit margin, and I already have enough/.test(hookSrc));

  // ── O14 — the account prompt waits for preservation value ────────────────
  check('O14', 'preservation is offered only once a responsible insight exists (source)',
    /if \(valueShownRef\.current && !phasesRef\.current\.has\('preservation'\)\)/.test(hookSrc));

  // ── O15 — a returning user does not restart onboarding ───────────────────
  check('O15', 'the first-run state is restored instead of replayed (source)',
    hookSrc.includes('sessionStorage.getItem(PROGRESSION_KEY)') && /if \(!saved\?\.started\) return;/.test(hookSrc));

  // ── O16 — existing evidence skips redundant questions ───────────────────
  const withDoc = gap({
    answers: {},
    extractedFacts: { success: true, facts: { annual_revenue: { normalized: 2000000 } } },
  });
  check('O16', 'revenue known from a document is never asked',
    withDoc.skipped.includes('revenue') && withDoc.question?.field !== 'revenue',
    JSON.stringify({ skipped: withDoc.skipped, asked: withDoc.question?.field }));

  // ── O17 / O18 — intent biases, never locks ───────────────────────────────
  const biased = gap({
    answers: { industry: 'Construction', revenue: 2400000, ebitda: 260000 },
    answeredQuestionIds: ['industry', 'revenue', 'ebitda'],
    intent: 'reduce_dependency',
  });
  check('O17', 'the selected intent biases question priority',
    biased.question?.field === 'involvement' && /Prioritized by intent/.test(biased.reason || ''),
    JSON.stringify({ field: biased.question?.field, reason: biased.reason }));
  const intentNeutral = ALL_INTENTS.every((intent) => !!field({ answers: {}, intent }));
  check('O18', 'no intent prevents the other opportunities from being reachable', intentNeutral);

  // ── O19 — a refresh preserves session progression ───────────────────────
  const restoreIdx = hookSrc.indexOf('sessionStorage.getItem(PROGRESSION_KEY)');
  const introIdx = hookSrc.indexOf("Let's see what your business is capable of.");
  check('O19', 'progression is persisted and restored before the intro can replay (source)',
    restoreIdx > -1 && introIdx > restoreIdx && hookSrc.includes('sessionStorage.setItem(PROGRESSION_KEY'));

  // ── O20 — no infinite state transition ──────────────────────────────────
  let answers = {};
  let answered = [];
  const walk = [];
  for (let i = 0; i < 12; i += 1) {
    const step = gap({ answers, answeredQuestionIds: answered });
    walk.push(step);
    if (!step.question) break;
    answered = [...answered, step.question.field];
    answers = { ...answers, [step.question.field]: step.question.field === 'industry' ? 'Construction' : 1 };
  }
  const asked = walk.map((w) => w.question?.field).filter(Boolean);
  check('O20', 'a walk over the whole journey asks each question once and then advances',
    asked.length === 6 && new Set(asked).size === 6 && walk[walk.length - 1].advance === true,
    JSON.stringify(asked));

  // ── O21 — no duplicate Galileo response ─────────────────────────────────
  check('O21', 'no message is emitted from inside a state updater (source)',
    !/setAnswers\(\(prev\)\s*=>\s*\{[\s\S]{0,300}addMessage/.test(hookSrc));

  // ── O22 — no duplicate Save prompt, and no looping continuation ─────────
  const saveModelEmissions = (hookSrc.match(/variant: 'save_model'/g) || []).length;
  check('O22', 'exactly one Save emission, with no "Keep Going" option beside it',
    saveModelEmissions === 1 && !/variant: 'save_model'[\s\S]{0,400}'continue'/.test(hookSrc),
    `emissions=${saveModelEmissions}`);

  // ── O23 — no dead-end state ─────────────────────────────────────────────
  const partials = [
    {}, { industry: 'Construction' }, { industry: 'Construction', revenue: 1 },
    { industry: 'Construction', revenue: 1, ebitda: 2 },
    { industry: 'Construction', revenue: 1, ebitda: 2, involvement: 'light' },
    { industry: 'Construction', revenue: 1, ebitda: 2, involvement: 'light', employees: 3 },
  ];
  let deadEnds = 0;
  for (const p of partials) {
    for (const intent of ALL_INTENTS) {
      const r = gap({ answers: p, intent, answeredQuestionIds: Object.keys(p) });
      if (!r.question && !r.advance) deadEnds += 1;
    }
  }
  check('O23', 'every state either asks a question or advances — never neither',
    deadEnds === 0, `dead ends=${deadEnds}`);

  // ── O23b — a low-priority question is still a question ──────────────────
  // The engine's "say something useful first" signal must never be mistaken for
  // "there is nothing left to ask" — that equivalence ended discovery early.
  const lowPriority = gap({
    answers: { industry: 'Construction', revenue: 1, ebitda: 2, involvement: 'light', employees: 3 },
    answeredQuestionIds: ['industry', 'revenue', 'ebitda', 'involvement', 'employees'],
  });
  check('O23b', 'a low-priority question is still ASKED, never turned into "no question"',
    lowPriority.question?.field === 'goal' && !lowPriority.advance,
    JSON.stringify({ field: lowPriority.question?.field, advance: lowPriority.advance }));

  // ── O24 — the owner can type instead of choosing ────────────────────────
  const industryQ = G.getQuestionDefinition('industry');
  check('O24', 'industry is a typed answer, numbers may be skipped',
    industryQ?.inputType === 'text' && G.getQuestionDefinition('revenue')?.allowSkip === true,
    JSON.stringify({ industry: industryQ?.inputType }));

  // ── O25 — the owner can always continue without connecting ──────────────
  check('O25', 'the accelerator always offers a non-connecting continuation (source)',
    /'keep_exploring'/.test(hookSrc) && /Keep exploring with my estimates/.test(hookSrc));

  // ── Visual contract (source-level) ──────────────────────────────────────
  check('V1', 'the subject fork renders as two decision tiles (not two form rows) (source)',
    /entry\.field === 'context' \?/.test(streamSrc));
  check('V2', 'multi-option selectors compose in a grid, not a single column stack (source)',
    /grid-cols-1 sm:grid-cols-2 max-w-\[680px\]/.test(streamSrc));
  check('V3', 'the tertiary "not sure" action is quieter than the intents (source)',
    /entry\.tertiary &&/.test(streamSrc));
  check('V4', 'the desktop canvas uses the available width (source)',
    /lg:max-w-\[1080px\]/.test(streamSrc));

  // Guard the fix that made question selection reliable at all.
  check('V5', 'the question bank is addressed by name, not by deletion (source)',
    /return definitionFor\(field\) \|\| null;/.test(gapSrc) && !/delete mockAnswers\[field\]/.test(gapSrc));
  check('V6', 'the question bank exports its ordered field list (source)',
    /export const QUESTION_FIELDS/.test(questionsSrc));

  // V7 — the bug this check exists to prevent: a continuation reading a name that
  // is not in its scope. That shipped as a lint failure and broke the preview, so
  // the no-opportunity branch is asserted to read the live answer state — and to
  // reference nothing it does not declare.
  const proceedBlock = hookSrc
    .slice(
      hookSrc.indexOf('const proceedToOpportunity = useCallback('),
      hookSrc.indexOf('const advanceExperience = useCallback('),
    )
    .replace(/\/\/[^\n]*/g, '');
  check('V7', 'the no-opportunity continuation reads the live answers, never an out-of-scope name (source)',
    proceedBlock.includes('answers,') && !/\bcurrentAnswers\b/.test(proceedBlock));

  return failures.slice(before);
}

// ── Baseline ────────────────────────────────────────────────────────────────
log.push('── baseline: the real modules');
const baseline = runChecks();

// ── MUTATION BATTERY ────────────────────────────────────────────────────────
log.push('\n── mutation battery');
const mutations = [
  {
    id: 'M-LOOP',
    what: 'the dealt-with set is ignored, so an answered question can be selected again',
    sources: () => ({
      gap: read(FILES.gap).replace(
        /const unanswered = QUESTION_FIELDS\n\s*\.filter\(\(f\) => !answeredQuestionIds\.includes\(f\)\)/,
        'const unanswered = QUESTION_FIELDS',
      ),
    }),
  },
  {
    id: 'M-EARLY',
    what: 'a low-priority question is turned back into "no question", ending discovery early',
    sources: () => ({
      gap: read(FILES.gap).replace(
        /const questionDef = questionFor\(top\.field\);/,
        "const questionDef = (top.priority < 40) ? null : questionFor(top.field);",
      ),
    }),
  },
  {
    id: 'M-FRAGILE',
    what: 'the fragile order-based lookup is restored (a field can silently vanish)',
    sources: () => ({
      gap: read(FILES.gap).replace(
        /function questionFor\(field\) \{\n\s*return definitionFor\(field\) \|\| null;\n\}/,
        'function questionFor(field) {\n  return null;\n}',
      ),
    }),
  },
];
const results = [];
for (const m of mutations) {
  const found = runChecks(m.sources());
  const caught = found.length > 0;
  results.push({ id: m.id, caught, failed: found.map((f) => f.trim().split(/\s+/)[1]) });
  log.push(`  ${caught ? 'CAUGHT' : 'MISSED'}  ${m.id}  ${m.what}${caught ? ` → failed: ${results[results.length - 1].failed.join(', ')}` : ''}`);
}

const ok = baseline.length === 0 && results.every((r) => r.caught);
console.log(log.join('\n'));
console.log('');
console.log(`  checks        : ${baseline.length === 0 ? 'O1–O25 + V1–V7 PASS' : `${baseline.length} FAILED`}`);
console.log(`  mutations     : ${results.filter((r) => r.caught).length}/${results.length} APPLIED + BEHAVIOR_CHANGED + CAUGHT`);
console.log('');
console.log(`GALILEO ONBOARDING RECOVERY — ${ok ? 'ALL CHECKS PASS' : 'NOT CERTIFIED'}`);
process.exit(ok ? 0 : 1);