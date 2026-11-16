#!/usr/bin/env node
/**
 * GALILEO NEXT BEST ACTION + CONTINUITY — functional harness (N1–N15, C-series).
 *
 * WHAT THIS PROVES
 *   That the hero of Vision Home is a DECISION, not a suggestion: deterministic,
 *   de-duplicated, business-scoped, never re-offering what the owner already
 *   handled — and that authenticated Home ACKNOWLEDGES a discovery instead of
 *   announcing that it is "still building an understanding" of a business whose
 *   value gap it just showed (§8, §12, §15, §27).
 *
 * WHAT IT LOADS
 *   The REAL modules:
 *     · src/lib/galileo/nextBestMoveResolver.js  (the resolver)
 *     · src/lib/galileo/valueContinuity.js       (the canonical discovery)
 *     · src/lib/galileo/handledMoves.js          (the anti-loop ledger)
 *   plus source-level assertions on the files that cannot be imported in plain
 *   node (a .jsx component and the Home hook) — which is where their contribution
 *   actually lives: which props the orb receives, and which string the hero can
 *   no longer say.
 *
 * Run: node scripts/galileoNextAction.test.cjs
 */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const F = {
  resolver: 'src/lib/galileo/nextBestMoveResolver.js',
  continuity: 'src/lib/galileo/valueContinuity.js',
  handled: 'src/lib/galileo/handledMoves.js',
  nbaComponent: 'src/components/galileo/home/NextBestMove.jsx',
  homeComponent: 'src/components/galileo/home/GalileoHome.jsx',
  homeHook: 'src/hooks/useGalileoHome.js',
};
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
// Source assertions apply to LIVE code, not to comments: a comment that quotes a
// phrase in order to document its removal is not a reasoning path.
const codeOf = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const quiet = { log() {}, warn() {}, error() {}, info() {} };
// These modules are pure and carry no imports, so the export keyword is all that
// has to come off before they can be evaluated in plain node. Any failure to load
// is REPORTED, never swallowed — a harness that dies silently certifies nothing.
const strip = (s) => s
  .replace(/^\s*import[\s\S]*?from\s+'[^']+';/gm, '')
  .replace(/^\s*export\s+/gm, '');

function loadCjs(source, returns, extraParams = [], extraArgs = []) {
  try {
    return new Function('console', ...extraParams, `${strip(source)}\n;return (${returns});`)(
      quiet, ...extraArgs,
    );
  } catch (err) {
    failures.push(`LOAD  ${returns} — ${err?.message || err}`);
    console.log(`FAIL  LOAD  ${returns} — ${err?.message || err}`);
    return null;
  }
}

function fakeSessionStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    _dump: () => [...store.entries()],
  };
}

const failures = [];
const check = (id, description, condition, detail) => {
  if (condition) console.log(`  ok   ${id}  ${description}`);
  else {
    const line = `  FAIL ${id}  ${description}${detail ? ` — ${detail}` : ''}`;
    console.log(line);
    failures.push(line);
  }
};

function runChecks(sources = {}) {
  const before = failures.length;

  const R = loadCjs(
    sources.resolver || read(F.resolver),
    '{ MoveType, resolveNextBestMove, actionKey, orbStateForMove, explainWhyThis }',
  );
  const V = loadCjs(sources.continuity || read(F.continuity), '{ deriveDiscoveryContext, hasReportableValueGap }');
  const M = loadCjs(
    sources.handled || read(F.handled),
    '{ getHandledMoves, markMoveEngaged, markMoveCompleted, dismissMove, keysWithDisposition }',
    ['sessionStorage'],
    [fakeSessionStorage()],
  );
  if (!R || !V || !M) return failures.slice(before);

  const resolve = (ctx) => R.resolveNextBestMove(ctx);
  const allOf = (r) => [r.primary, ...r.alternatives].filter(Boolean);
  const typesOf = (r) => allOf(r).map((c) => c.type);
  const keysOf = (r) => allOf(r).map((c) => c.key);

  const BIZ = 'biz-A';
  const base = { businessId: BIZ };

  // ── N1 — an active Play outranks exploration ─────────────────────────────
  const n1 = resolve({ ...base, activeSprints: [{ id: 's1', title: 'Margin sprint', progress: 40 }], hasFinancials: false });
  check('N1', 'an active Play outranks exploration (and a connection)', n1.primary?.type === 'continue_play', n1.primary?.type);

  // ── N2 — meaningful new evidence surfaces ────────────────────────────────
  const n2 = resolve({ ...base, recentChanges: [{ documentId: 'd1', title: 'New document: P&L 2024' }] });
  check('N2', 'meaningful new evidence surfaces', n2.primary?.type === 'new_document', n2.primary?.type);

  // ── N3 — an opportunity in progress can continue ─────────────────────────
  const n3 = resolve({ ...base, opportunities: [{ id: 'o1', status: 'active', title: 'Owner dependency' }] });
  check('N3', 'an opportunity already in progress is continued', n3.primary?.type === 'continue_opportunity', n3.primary?.type);

  // ── N4 — a supported opportunity surfaces ────────────────────────────────
  const n4 = resolve({ ...base, opportunities: [{ id: 'o2', status: 'available', title: 'Recurring revenue' }] });
  check('N4', 'a supported opportunity surfaces', n4.primary?.type === 'new_opportunity', n4.primary?.type);

  // ── N5 — a Knowledge Gap can surface, and is never invented ──────────────
  const n5 = resolve({
    ...base,
    knowledgeGaps: [{ field: 'largest_customer', prompt: 'About how much of your revenue comes from your largest customer?' }],
  });
  check('N5', 'a knowledge gap surfaces when a real gap is supplied',
    typesOf(n5).includes('knowledge_gap'), typesOf(n5).join(','));
  const n5b = resolve({ ...base });
  check('N5b', 'no knowledge gap is invented when none is supplied',
    !typesOf(n5b).includes('knowledge_gap'), typesOf(n5b).join(','));

  // ── N6 — a useful connection surfaces, but never as the primary ──────────
  const n6 = resolve({ ...base, hasFinancials: false });
  check('N6', 'a financials gap surfaces when financials are genuinely absent',
    typesOf(n6).includes('connect_source'), typesOf(n6).join(','));
  const n6b = resolve({
    ...base, hasFinancials: false,
    opportunities: [{ id: 'o9', status: 'available', title: 'Real work' }],
  });
  check('N6b', 'Connections is never automatically the primary action',
    n6b.primary?.type !== 'connect_source' && n6b.primary?.type === 'new_opportunity', n6b.primary?.type);
  const n6c = resolve({ ...base, hasFinancials: true });
  check('N6c', 'no financials gap is raised when the financials are already known',
    !typesOf(n6c).includes('connect_source'), typesOf(n6c).join(','));

  // ── N7 — general exploration is the fallback, and always exists ───────────
  const n7 = resolve({ ...base });
  check('N7', 'with nothing else, exploration is the fallback (never an empty state)',
    n7.primary?.type === 'explore_galileo', n7.primary?.type);
  check('N7b', 'the resolver always returns a primary',
    [ {}, { ...base }, { businessId: null } ].every((c) => !!resolve(c).primary));

  // ── N8 / N9 — handled moves are respected ───────────────────────────────
  // The key is COMPUTED through the same function the UI uses, so this cannot
  // pass by agreeing with a hardcoded string that the product does not produce.
  const oppKey = R.actionKey({ type: 'opportunity', id: 'o1' });
  const opp = [{ id: 'o1', status: 'available', title: 'Owner dependency' }];
  const n8 = resolve({ ...base, opportunities: opp, handledMoves: [{ key: oppKey, disposition: 'completed' }] });
  check('N8', 'a COMPLETED action is not offered again',
    !keysOf(n8).includes(oppKey), keysOf(n8).join(','));
  const n9 = resolve({ ...base, opportunities: opp, handledMoves: [{ key: oppKey, disposition: 'dismissed' }] });
  check('N9', 'a DISMISSED action is not offered again',
    !keysOf(n9).includes(oppKey), keysOf(n9).join(','));
  const n9b = resolve({ ...base, opportunities: opp, handledMoves: [{ key: oppKey, disposition: 'engaged' }] });
  check('N9b', 'an ENGAGED action steps out of the hero but stays reachable',
    n9b.primary?.key !== oppKey && keysOf(n9b).includes(oppKey),
    `${n9b.primary?.key} | ${keysOf(n9b).join(',')}`);

  // ── N10 — an unsupported opportunity is not surfaced ────────────────────
  const n10 = resolve({ ...base, opportunities: [{ id: 'o3', status: 'converted', title: 'Already done' }] });
  check('N10', 'an opportunity that is not available or active is not surfaced',
    !keysOf(n10).some((k) => k.includes('o3')), keysOf(n10).join(','));

  // ── N11 — no fake urgency ───────────────────────────────────────────────
  const rich = resolve({
    ...base,
    activeSprints: [{ id: 's1', title: 'Sprint', progress: 10 }],
    opportunities: [{ id: 'o1', status: 'available', title: 'Opp' }],
    recentChanges: [{ documentId: 'd1', title: 'Doc' }],
    hasFinancials: false,
    discoveries: { valueGap: 1_100_000, constraint: { key: 'owner_dependency', label: 'Owner dependency' } },
  });
  const urgencies = allOf(rich).map((c) => c.urgency);
  const fallback = resolve({ ...base });
  check('N11', 'every urgency is bounded and documented, and the fallback is genuinely last',
    urgencies.every((u) => typeof u === 'number' && u >= 1 && u <= 95)
    && urgencies.every((u) => u > (fallback.primary?.urgency ?? 0))
    && fallback.primary?.type === 'explore_galileo'
    && fallback.primary?.urgency === 10,
    `rich=[${urgencies.join(',')}] fallback=${fallback.primary?.urgency}`);

  // ── N12 — no cross-business candidate ───────────────────────────────────
  const n12 = resolve({
    ...base,
    opportunities: [
      { id: 'oA', status: 'available', title: 'Mine', business_id: BIZ },
      { id: 'oB', status: 'available', title: 'Theirs', business_id: 'biz-B' },
      { id: 'oC', status: 'available', title: 'Theirs (raw)', raw: { business_id: 'biz-B' } },
    ],
  });
  check('N12', 'an opportunity belonging to another business is never a candidate',
    keysOf(n12).includes(R.actionKey({ type: 'opportunity', id: 'oA' }))
    && !keysOf(n12).includes(R.actionKey({ type: 'opportunity', id: 'oB' }))
    && !keysOf(n12).includes(R.actionKey({ type: 'opportunity', id: 'oC' })),
    keysOf(n12).join(','));

  // ── N13 — no infinite loop ──────────────────────────────────────────────
  // Five moves genuinely exist in this state, so five engagements must produce
  // five DIFFERENT primaries. (Once every move has been engaged, showing the
  // highest-ranked one again is correct — there is nothing else left — so the
  // check is bounded to the moves that actually remain.)
  let handled = [];
  let previousKey = null;
  let repeated = 0;
  let nulled = 0;
  for (let i = 0; i < 5; i += 1) {
    const r = resolve({
      ...base,
      opportunities: [
        { id: 'o1', status: 'available', title: 'Owner dependency' },
        { id: 'o2', status: 'available', title: 'Recurring revenue' },
      ],
      discoveries: { valueGap: 900_000, constraint: null },
      hasFinancials: false,
      handledMoves: handled,
    });
    if (!r.primary) { nulled += 1; break; }
    if (r.primary.key === previousKey) repeated += 1;
    previousKey = r.primary.key;
    handled = [...handled, { key: r.primary.key, disposition: 'engaged' }];
  }
  check('N13', 'engaging moves never loops and never leaves the surface empty',
    nulled === 0 && repeated === 0, `nulled=${nulled} repeated=${repeated}`);

  // ── N14 — deterministic for identical state ─────────────────────────────
  const tie = {
    ...base,
    opportunities: [
      { id: 'zzz', status: 'available', title: 'Later in the array' },
      { id: 'aaa', status: 'available', title: 'Earlier in the array' },
    ],
  };
  const d1 = resolve(tie);
  const d2 = resolve(JSON.parse(JSON.stringify(tie)));
  const d3 = resolve({ ...tie, opportunities: [...tie.opportunities].reverse() });
  check('N14', 'identical state produces an identical answer, independent of array order',
    d1.primary?.key === d2.primary?.key && d1.primary?.key === d3.primary?.key,
    `${d1.primary?.key} / ${d2.primary?.key} / ${d3.primary?.key}`);

  // ── N15 — changed state produces a changed action ───────────────────────
  const priorState = resolve({ ...base, opportunities: [{ id: 'o1', status: 'available', title: 'Opp' }] });
  const changedState = resolve({
    ...base,
    opportunities: [{ id: 'o1', status: 'available', title: 'Opp' }],
    sprintBlockers: [{ id: 'b1', title: 'Decision needed' }],
  });
  check('N15', 'a genuinely changed state produces an appropriate new primary',
    priorState.primary?.type === 'new_opportunity' && changedState.primary?.type === 'sprint_blocker',
    `${priorState.primary?.type} → ${changedState.primary?.type}`);

  // ── One object, one move (no duplicate cards) ───────────────────────────
  const dup = resolve({
    ...base,
    opportunities: [{ id: 'o1', status: 'available', title: 'Opp' }],
    goals: [{ label: 'Exit in 3 years' }],
  });
  const keys = keysOf(dup);
  check('D1', 'the same object is never offered twice (no duplicate card)',
    new Set(keys).size === keys.length, keys.join(','));

  // ── The action vocabulary cannot mint access (§S7, §S8, §S14) ───────────
  const ALLOWED = new Set([
    'opportunity', 'goal_aligned', 'sprint', 'sprint_blocker', 'signal_deterioration',
    'evidence_gap', 'scenario_decision', 'expert_response', 'document_assignment',
    'galileo_question', 'new_document', 'value_gap', 'knowledge_gap', 'connect_source', 'explore',
  ]);
  const vocab = allOf(rich).concat(allOf(n12)).map((c) => c.actionValue?.type);
  check('S7', 'every action the hero can offer is a known, non-privileged destination',
    vocab.every((t) => ALLOWED.has(t)), [...new Set(vocab)].join(','));
  check('S7b', 'no candidate carries a permission, role or token payload',
    allOf(rich).every((c) => !c.actionValue?.role && !c.actionValue?.token && !c.actionValue?.grant),
  );

  // ── C7 / C8 — the experience cliff is structurally gone ─────────────────
  const cliff = resolve({
    ...base,
    discoveries: {
      valueGap: 1_100_000,
      constraint: { key: 'owner_dependency', label: 'Owner dependency', why: 'A business that depends on its owner transfers badly.' },
    },
    hasFinancials: true,
  });
  check('C7', 'authenticated Home acknowledges the preserved discovery instead of staying silent',
    cliff.primary?.type === 'value_gap_discovery'
    && cliff.primary.impact === 1_100_000
    && cliff.primary.impactKind === 'value_gap'
    && /owner dependency/i.test(cliff.primary.actionLabel),
    `${cliff.primary?.type} ${cliff.primary?.impact} ${cliff.primary?.actionLabel}`);
  check('C8', 'the resolver can no longer reason that it is "still building"',
    !/still building/i.test(JSON.stringify(cliff)) && !/still building/i.test(codeOf(read(F.resolver))));

  // ── Value continuity: canonical only, never fabricated ─────────────────
  const richCtx = {
    valuation: { valueGap: 1_100_000, currentValue: 4_000_000, potentialValue: 5_100_000, currentValueSource: 'modeled' },
    operations: { score: 33 },
    freedom: { score: 40 },
    financials: { revenue: 2_000_000, ebitda: 260_000, ebitdaSource: 'user_reported' },
    hasFinancials: true,
  };
  const discovery = V.deriveDiscoveryContext(richCtx);
  check('C6', 'the preserved value gap survives from canonical records',
    discovery?.valueGap === 1_100_000 && discovery?.currentValue === 4_000_000,
    JSON.stringify(discovery));
  check('C6b', 'the constraint is named only when the canonical score supports one',
    discovery?.constraint?.key === 'owner_dependency' && discovery?.constraint?.score === 33
    && V.deriveDiscoveryContext({ ...richCtx, operations: { score: 72 }, freedom: { score: 80 } })?.constraint === null,
    JSON.stringify(discovery?.constraint));
  check('C6c', 'a business with nothing canonical gets NO discovery (honest silence)',
    V.deriveDiscoveryContext({}) === null
    && V.deriveDiscoveryContext({ valuation: {}, operations: { score: 80 } }) === null
    && V.deriveDiscoveryContext(null) === null);
  check('C6d', '"more areas" can only be what the resolver actually produced',
    resolve({ ...base, handledMoves: [{ disposition: 'engaged', key: 'x' }] }).alternatives.length <= 3);

  // ── C15 / S12 — the ledger is business-scoped ───────────────────────────
  const store = fakeSessionStorage();
  const M2 = loadCjs(read(F.handled),
    '{ getHandledMoves, markMoveEngaged, markMoveCompleted, dismissMove, keysWithDisposition }',
    ['sessionStorage'], [store]);
  M2.markMoveEngaged('opportunity:o1', 'biz-A');
  M2.dismissMove('opportunity:o2', 'biz-A');
  check('S11', 'a handled move is recorded for its own business only',
    M2.getHandledMoves('biz-A').length === 2
    && M2.getHandledMoves('biz-B').length === 0
    && [...new Set(store._dump().map(([k]) => k))].every((k) => k.includes('biz-A') || k.includes('biz-B')),
    JSON.stringify(store._dump().map(([k]) => k)));
  check('S12', 'a disposition is recorded per key, never accumulating duplicates',
    (() => {
      M2.markMoveCompleted('opportunity:o1', 'biz-A');
      const rows = M2.getHandledMoves('biz-A').filter((m) => m.key === 'opportunity:o1');
      return rows.length === 1 && rows[0].disposition === 'completed';
    })());

  // ── Source-level contracts on the files that cannot be imported here ────
  const nbaSrc = sources.nbaComponent || read(F.nbaComponent);
  const homeSrc = sources.homeComponent || read(F.homeComponent);
  const hookSrc = sources.homeHook || read(F.homeHook);

  check('S13', 'the orb still receives only presentational props on Home',
    /<GalileoOrb\s+state=\{orbState\}\s+size=\{52\}\s+intelligence=\{intelligence\}\s+decorative\s*\/>/.test(nbaSrc)
    && !/GalileoOrb[\s\S]{0,120}(business_id|revenue|document_id|file_url|profile_id)/.test(nbaSrc));
  check('C7b', 'the hero cannot say "still building my understanding" any more (source)',
    !/still building my understanding/i.test(codeOf(nbaSrc)) && !/still building my understanding/i.test(codeOf(hookSrc)));
  check('C7c', 'Home passes the real orb state, the real alternatives and the real discovery',
    /orbState=\{home\.nextActionOrbState\}/.test(homeSrc)
    && /alternatives=\{home\.nextBestMove\?\.alternatives \|\| \[\]\}/.test(homeSrc)
    && /discoveries=\{deriveDiscoveryContext\(homeContext\)\}|deriveDiscoveryContext\(homeContext\)/.test(hookSrc));
  check('N7c', 'the "more areas" line is built from the resolver, never hardcoded (source)',
    /const moreCount = alternatives\.filter/.test(nbaSrc) && /moreCount > 0/.test(nbaSrc));
  check('S4', 'the resolver re-checks business scope at the point of use (source)',
    /function inBusinessScope\(/.test(read(F.resolver))
    && /inBusinessScope\(opp, ctx\)/.test(read(F.resolver))
    && /inBusinessScope\(assignment, ctx\)/.test(read(F.resolver)));
  check('D2', 'engagement is recorded through the shared router, not a second path (source)',
    /markMoveHandled: recordEngagement/.test(hookSrc) && /home\.markMoveHandled\?\./.test(read('src/hooks/useVisionActions.js')));

  return failures.slice(before);
}

// ── Baseline ────────────────────────────────────────────────────────────────
console.log('── baseline: the real modules');
const baseline = runChecks();

// ── Mutation battery ────────────────────────────────────────────────────────
console.log('\n── mutation battery');
const mutations = [
  {
    id: 'M-SUPPRESS',
    what: 'the handled-move filter is removed (a completed action is offered again)',
    sources: () => ({
      resolver: read(F.resolver).replace(
        '    .filter((c) => !suppressed.has(candidateKey(c)))\n',
        '',
      ),
    }),
  },
  {
    id: 'M-DEDUPE',
    what: 'the same object is allowed to appear twice',
    sources: () => ({
      resolver: read(F.resolver).replace(
        '  const byKey = new Map();\n  for (const c of scored) {\n    const key = candidateKey(c);\n    if (!byKey.has(key)) byKey.set(key, { ...c, key });\n  }\n  const ranked = [...byKey.values()];',
        '  const ranked = scored.map((c) => ({ ...c, key: candidateKey(c) }));',
      ),
    }),
  },
  {
    id: 'M-SCOPE',
    what: 'the business-scope guard is neutered (cross-business candidate)',
    sources: () => ({
      resolver: read(F.resolver).replace(
        '  const own = record?.business_id ?? record?.raw?.business_id ?? null;\n  return !own || own === target;',
        '  return true;',
      ),
    }),
  },
  {
    id: 'M-FALLBACK',
    what: 'the honest fallback is removed (the surface can go empty)',
    sources: () => ({
      resolver: read(F.resolver).replace(
        "    type: MoveType.EXPLORE_GALILEO,\n    title: 'Ask me anything about the business',",
        "    type: 'REMOVED',\n    title: 'x',",
      ),
    }),
  },
  {
    id: 'M-ENGAGED',
    what: 'engaging a move no longer moves the focus (the hero repeats itself)',
    sources: () => ({
      resolver: read(F.resolver).replace(
        '  const primary = ranked.find((c) => !engaged.has(c.key)) || ranked[0] || null;',
        '  const primary = ranked[0] || null;',
      ),
    }),
  },
  {
    id: 'M-CLIFF',
    what: 'the "still building" reasoning is restored on Home',
    sources: () => ({
      nbaComponent: read(F.nbaComponent).replace(
        'Ask me anything about the business, and I will tell you what I actually know.',
        "I'm still building my understanding of your business.",
      ),
    }),
  },
];

const results = [];
for (const m of mutations) {
  const found = runChecks(m.sources());
  const caught = found.length > 0;
  results.push({ id: m.id, caught, ids: found.map((f) => f.trim().split(/\s+/)[1]) });
  console.log(`  ${caught ? 'CAUGHT' : 'MISSED'}  ${m.id}  ${m.what}${caught ? ` → ${results[results.length - 1].ids.join(', ')}` : ''}`);
}

const ok = baseline.length === 0 && results.every((r) => r.caught);
console.log('');
console.log(`  checks     : ${baseline.length === 0 ? 'N1–N15 + C/S/D PASS' : `${baseline.length} FAILED`}`);
console.log(`  mutations  : ${results.filter((r) => r.caught).length}/${results.length} APPLIED + BEHAVIOR_CHANGED + CAUGHT`);
console.log('');
console.log(`GALILEO NEXT BEST ACTION + CONTINUITY — ${ok ? 'ALL CHECKS PASS' : 'NOT CERTIFIED'}`);
process.exit(ok ? 0 : 1);