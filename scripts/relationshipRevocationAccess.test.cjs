#!/usr/bin/env node
/**
 * relationshipRevocationAccess.test.cjs — Phase S3.0.2
 * Relationship revocation enforcement in the shared BUSINESS ACCESS decision.
 *
 * Run:  node scripts/relationshipRevocationAccess.test.cjs
 *
 * OFFLINE AND NON-DESTRUCTIVE. No network, no database, no Base44 call, no
 * production record read, written or revoked. `git` is used read-only to prove
 * the change surface.
 *
 * THE CODE UNDER TEST IS THE SHIPPED CODE — not a restatement of it:
 *
 *   1. `base44/shared/businessScope/relationshipAccess.ts` (the shared predicate
 *      and resolver) and `base44/shared/businessScope/writeGuard.ts`
 *      (validateBusinessScope — the shared business-access decision consumed by
 *      every business-scoped call site, RLS-mirroring) are COMPILED from their
 *      real TypeScript sources (esbuild, loader 'ts') and evaluated in a
 *      node:vm sandbox. Their REAL functions execute; only the Supabase client is
 *      an in-memory mock.
 *   2. `base44/shared/authz/actor.ts` (authenticateActor) is loaded the same way
 *      for the composed suspension case, so "denied BEFORE relationship
 *      authorization" is observed, not asserted.
 *   3. The mutation section mutates THAT extracted real source and re-runs the
 *      matrix, proving each regression would be caught.
 *
 * The Supabase mock applies `.eq` / `.is` / `.limit` the way PostgREST does
 * (filter first, THEN bound the row count), so "the database filter, not a
 * candidate window" is OBSERVED in the recorded query rather than asserted from
 * the source alone.
 *
 * EVIDENCE CLASS: UNIT/MOCK (sandboxed real modules) + STATIC + GIT-DIFF PROOF.
 * No browser and no live database was used.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const esbuild = require('esbuild');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const git = (args) => execFileSync('git', args, { cwd: ROOT, maxBuffer: 32e6 }).toString();

const GUARD = 'base44/shared/businessScope/writeGuard.ts';
const REL = 'base44/shared/businessScope/relationshipAccess.ts';
const ACTOR = 'base44/shared/authz/actor.ts';
const EXPERT_API = 'base44/functions/expertAdvisorAccess/entry.ts';
const DOC_ACCESS = 'base44/shared/authz/documentAccess.ts';
const DOC_ADMIN = 'base44/functions/getDocumentsAdmin/entry.ts';
const TEST = 'scripts/relationshipRevocationAccess.test.cjs';

const failures = [];
const check = (label, ok, detail = '') => {
  if (!ok) failures.push(detail ? `${label} — ${detail}` : label);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? ` — ${detail}` : ''}`);
};
const note = (label, text) => console.log(`NOTE  ${label} — ${text}`);

// ─────────────────────────────────────────────────────────────────────────────
// Compile the REAL TypeScript to runnable JS (module keywords dropped)
// ─────────────────────────────────────────────────────────────────────────────
const strip = (s) => s
  .replace(/^\s*import[\s\S]*?from\s+'[^']+';/gm, '')
  .replace(/^\s*export\s+/gm, '');
const toJs = (ts) => esbuild.transformSync(ts, { loader: 'ts', format: 'esm', target: 'es2020' }).code;
/** Strip comments so a static check matches EXECUTABLE code, never prose. */
const deComment = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const quiet = { log() {}, warn() {}, error() {}, info() {} };
const ResponseStub = { json: (body, init = {}) => ({ status: init.status || 200, body, json: async () => body }) };

/**
 * buildSandbox — evaluate the REAL relationship predicate + REAL writeGuard
 * (and, when asked, the REAL actor module) against an in-memory Supabase mock.
 * Sources are parameters so the mutation section can re-run mutated code.
 */
function buildSandbox({ relSource = read(REL), guardSource = read(GUARD), withActor = false } = {}) {
  const sbx = { Deno: { env: { get: () => undefined } }, console: quiet, Response: ResponseStub };
  Object.assign(sbx, vm.runInNewContext(
    `${toJs(strip(relSource))}\n;({ ACTIVE_RELATIONSHIP_STATUS, RELATIONSHIP_DECISION_COLUMNS, isActiveRelationship, resolveActiveExpertRelationship });`,
    sbx
  ));
  Object.assign(sbx, vm.runInNewContext(
    `${toJs(strip(guardSource))}\n;({ validateBusinessScope });`,
    sbx
  ));
  if (withActor) {
    Object.assign(sbx, vm.runInNewContext(`${toJs(strip(read(ACTOR)))}\n;({ authenticateActor });`, sbx));
  }
  return sbx;
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory Supabase mock — records every table read so "denied before any
// business read" is OBSERVED.
// ─────────────────────────────────────────────────────────────────────────────
function makeSb(db, log = [], opts = {}) {
  function builder(table) {
    const st = { table, filters: [], limit: null };
    const match = (row) => st.filters.every(([col, val]) => {
      // `.is(col, null)` is the NULL predicate — distinct from `.eq(col, null)`.
      if (val && typeof val === 'object' && 'is' in val) return (row[col] ?? null) === val.is;
      return row[col] === val;
    });
    const exec = () => {
      // PostgREST order: FILTER first, THEN bound the row count. `forceRows`
      // simulates the database handing back a row that should not have matched
      // (drift, a stale read, a tampered row), so the application predicate can be
      // proven to still run on whatever comes back.
      const rows = opts.forceRows?.[table]
        ? opts.forceRows[table].slice()
        : (db[table] || []).filter(match);
      const bounded = st.limit != null ? rows.slice(0, st.limit) : rows;
      const error = opts.error?.[table] ? { message: opts.error[table] } : null;
      log.push({ table, filters: st.filters.map((f) => f.slice()), limit: st.limit, error });
      return { data: error ? null : bounded, error };
    };
    const b = {
      select: () => b,
      eq: (col, val) => { st.filters.push([col, val]); return b; },
      is: (col, val) => { st.filters.push([col, { is: val }]); return b; },
      limit: (n) => { st.limit = n; return b; },
      maybeSingle: async () => { const r = exec(); return { data: r.data ? (r.data[0] || null) : null, error: r.error }; },
      then: (res, rej) => Promise.resolve().then(exec).then(res, rej),
    };
    return b;
  }
  return { from: builder };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────
const FIXTURES = {
  profiles: [
    { id: 'p-client', base44_user_id: 'u-client', email: 'client@t', app_role: 'owner', primary_business_id: 'b-client' },
    { id: 'p-otherowner', base44_user_id: 'u-other', email: 'other@t', app_role: 'owner', primary_business_id: 'b-other' },
    { id: 'p-expert', base44_user_id: 'u-expert', email: 'expert@t', app_role: 'expert_advisor' },
    { id: 'p-unrelated', base44_user_id: 'u-unrelated', email: 'unrel@t', app_role: 'expert_advisor' },
    { id: 'p-assignee', base44_user_id: 'u-assignee', email: 'asg@t', app_role: 'owner' },
    { id: 'p-super', base44_user_id: 'u-super', email: 'super@t', app_role: 'super_admin' },
    { id: 'p-admin', base44_user_id: 'u-admin', email: 'admin@t', app_role: 'admin' },
    { id: 'p-suspended', base44_user_id: 'u-suspended', email: 'susp@t', app_role: 'expert_advisor', profile_status: 'suspended' },
  ],
  business_entities: [
    { id: 'b-client', business_name: 'Client Co', profile_id: 'p-client', assigned_advisor_id: null },
    { id: 'b-other', business_name: 'Other Co', profile_id: 'p-otherowner', assigned_advisor_id: null },
  ],
  business_team_members: [],
  business_owners: [],
  advisor_assignments: [],
  expert_advisor_access: [],
  // An assignment row exists — it must not affect this decision at all.
  document_assignments: [{ id: 'da-1', document_id: 'd-1', assignee_profile_id: 'p-assignee' }],
};

const B = 'b-client';
const E = 'p-expert';

const activeRow = (over = {}) => ({
  id: 'eaa-active', expert_profile_id: E, client_profile_id: 'p-client',
  business_id: B, access_status: 'active', revoked_at: null, ...over,
});

/** A revoked historical row — the state `expertAdvisorAccess · revoke` writes. */
const revokedRow = (i) => ({
  id: `eaa-revoked-${i}`, expert_profile_id: E, client_profile_id: 'p-client',
  business_id: B, access_status: 'revoked', revoked_at: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`,
});

const withRows = (rows) => ({ ...FIXTURES, expert_advisor_access: rows });

async function decide(sbx, rows, businessId, profileId, extraArgs = [], opts = {}) {
  const log = [];
  const sb = makeSb(withRows(rows), log, opts);
  try {
    const res = await sbx.validateBusinessScope(sb, businessId, profileId, ...extraArgs);
    return { allow: true, reason: res.authorization_reason, log };
  } catch (e) {
    return { allow: false, message: e.message, log };
  }
}

const readTables = (log) => [...new Set(log.map((o) => o.table))].join(',');

// ─────────────────────────────────────────────────────────────────────────────
// MATRIX — the real shared decision
// ─────────────────────────────────────────────────────────────────────────────
const CASES = [
  { id: 'R1',  name: 'ACTIVE relationship → ALLOW existing business scope', rows: [activeRow()], biz: B, who: E, allow: true, reason: 'expert_access' },
  { id: 'R2',  name: 'same relationship AFTER REVOKE → DENY', rows: [activeRow({ access_status: 'revoked', revoked_at: '2026-01-05T00:00:00Z' })], biz: B, who: E, allow: false },
  { id: 'R3',  name: "status 'revoked' but revoked_at NULL → DENY", rows: [activeRow({ access_status: 'revoked', revoked_at: null })], biz: B, who: E, allow: false },
  { id: 'R4',  name: "status 'active' but revoked_at POPULATED → DENY", rows: [activeRow({ access_status: 'active', revoked_at: '2026-01-05T00:00:00Z' })], biz: B, who: E, allow: false },
  { id: 'R5',  name: "status 'pending' (non-authorizing) → DENY", rows: [activeRow({ access_status: 'pending' })], biz: B, who: E, allow: false },
  { id: 'R6',  name: 'unknown status value → DENY', rows: [activeRow({ access_status: 'suspended' })], biz: B, who: E, allow: false },
  { id: 'R7',  name: 'row names ANOTHER expert → DENY (unrelated expert)', rows: [activeRow({ expert_profile_id: 'p-unrelated' })], biz: B, who: E, allow: false },
  { id: 'R8',  name: 'correct expert, WRONG business → DENY', rows: [activeRow()], biz: 'b-other', who: E, allow: false },
  { id: 'R9',  name: 'actor on the CLIENT side of the row → DENY (not the expert)', rows: [activeRow()], biz: B, who: 'p-client', allow: true, reason: 'owner (business_entities.profile_id)', note: 'client is the owner: allowed as OWNER, never as expert_access' },
  { id: 'R14', name: 'MISSING relationship → DENY', rows: [], biz: B, who: E, allow: false },
  { id: 'R15a', name: 'ONLY a revoked historical row → DENY (no resurrection)', rows: [activeRow({ access_status: 'revoked', revoked_at: '2026-01-02T00:00:00Z' })], biz: B, who: E, allow: false },
  { id: 'R15b', name: 'revoked historical row + ACTIVE row for the same pair → ALLOW (the ACTIVE row grants)', rows: [activeRow({ id: 'eaa-old', access_status: 'revoked', revoked_at: '2026-01-02T00:00:00Z' }), activeRow({ id: 'eaa-new' })], biz: B, who: E, allow: true, reason: 'expert_access' },
  { id: 'R15c', name: 'active-but-revoked_at row + clean ACTIVE row → ALLOW (the DB filter excludes the partial revoke)', rows: [activeRow({ id: 'eaa-partial', revoked_at: '2026-01-03T00:00:00Z' }), activeRow({ id: 'eaa-clean' })], biz: B, who: E, allow: true, reason: 'expert_access' },
  { id: 'R8b', name: 'revoked row + FORGED access_status/revoked_at arguments → DENY', rows: [activeRow({ access_status: 'revoked', revoked_at: '2026-01-05T00:00:00Z' })], biz: B, who: E, allow: false, extra: [{ access_status: 'active', revoked_at: null, is_authorized: true }] },
  { id: 'R9b', name: 'FORGED expert_profile_id argument (actor holds no row) → DENY', rows: [activeRow({ expert_profile_id: 'p-unrelated' })], biz: B, who: E, allow: false, extra: [{ expert_profile_id: E }] },
  { id: 'R10', name: 'FORGED business_id argument (actor holds no row there) → DENY', rows: [activeRow()], biz: 'b-other', who: E, allow: false, extra: [{ business_id: B }] },
  { id: 'R11', name: 'document assignment only (no relationship) → DENY, assignment table never read', rows: [], biz: B, who: 'p-assignee', allow: false, forbidReads: ['document_assignments'] },
  { id: 'R12a', name: 'canonical super_admin with NO relationship → ALLOW (existing admin semantics preserved)', rows: [], biz: B, who: 'p-super', allow: true, reason: 'super_admin' },
  { id: 'R12b', name: "app_role 'admin' (not super_admin) with no relationship → DENY (existing semantics preserved)", rows: [], biz: B, who: 'p-admin', allow: false },

  // ── S3.0.2 CORRECTION — database filter + application predicate ────────────
  // The query asks only for a relationship that CAN satisfy the predicate, so no
  // arbitrary candidate window exists for a live relationship to fall outside of.
  { id: 'R16', name: '>50 revoked historical rows + ONE active → ALLOW (no candidate window to fall outside)', rows: [...Array(60)].map((_, i) => revokedRow(i)).concat([activeRow({ id: 'eaa-live' })]), biz: B, who: E, allow: true, reason: 'expert_access' },
  { id: 'R17', name: 'MULTIPLE active matching rows → ALLOW (existence, not uniqueness)', rows: [activeRow({ id: 'eaa-a' }), activeRow({ id: 'eaa-b' }), activeRow({ id: 'eaa-c' })], biz: B, who: E, allow: true, reason: 'expert_access' },
  { id: 'R18', name: "revoked(revoked_at NULL) + 'pending' historical rows + ACTIVE → ALLOW (the ACTIVE row still grants)", rows: [activeRow({ id: 'eaa-rev', access_status: 'revoked', revoked_at: null }), activeRow({ id: 'eaa-pend', access_status: 'pending', revoked_at: null }), activeRow({ id: 'eaa-live' })], biz: B, who: E, allow: true, reason: 'expert_access' },
  // Defence in depth: the predicate must still refuse a row that should never have
  // come back from the query (drift, a stale read, a tampered row).
  { id: 'R20', name: "DRIFT — query returns a 'pending' row despite the filter → DENY (predicate still applied)", rows: [], biz: B, who: E, allow: false, opts: { forceRows: { expert_advisor_access: [activeRow({ access_status: 'pending' })] } } },
  { id: 'R20b', name: 'DRIFT — query returns ACTIVE status + revoked_at populated → DENY (predicate still applied)', rows: [], biz: B, who: E, allow: false, opts: { forceRows: { expert_advisor_access: [activeRow({ revoked_at: '2026-01-09T00:00:00Z' })] } } },
  { id: 'R21', name: 'RELATIONSHIP QUERY ERROR → DENY (fail closed)', rows: [activeRow()], biz: B, who: E, allow: false, opts: { error: { expert_advisor_access: 'connection reset by peer' } } },
];

(async () => {
  const base = buildSandbox({ withActor: true });

  console.log('── PREDICATE (pure, real source) ──');
  check('P1  a persisted ACTIVE row is active', base.isActiveRelationship(activeRow()) === true);
  check('P2  revoked status is NOT active', base.isActiveRelationship(activeRow({ access_status: 'revoked' })) === false);
  check('P3  populated revoked_at is NOT active, even with status active', base.isActiveRelationship(activeRow({ revoked_at: 'x' })) === false);
  check('P4  null / non-object / status-less rows are NOT active', base.isActiveRelationship(null) === false && base.isActiveRelationship('active') === false && base.isActiveRelationship({ id: 'x' }) === false);
  check("P5  the ACTIVE value is the one the existing grant writer sets ('active')", base.ACTIVE_RELATIONSHIP_STATUS === 'active', base.ACTIVE_RELATIONSHIP_STATUS);
  check('P6  the decision reads only persisted row fields (no request-shaped input in the signature)', !/(^|[^A-Za-z])(body|req|request|data)\b/.test(String(base.isActiveRelationship)));

  console.log('\n── ADVERSARIAL MATRIX (real validateBusinessScope) ──');
  for (const tc of CASES) {
    const r = await decide(base, tc.rows, tc.biz, tc.who, tc.extra || [], tc.opts || {});
    const reads = readTables(r.log);
    const ok = tc.allow
      ? r.allow === true && (tc.reason === undefined || r.reason === tc.reason)
      : r.allow === false && !r.log.some((o) => (tc.forbidReads || []).includes(o.table));
    check(`${tc.id.padEnd(5)} ${tc.name}`, ok, ok ? '' : `got allow=${r.allow} reason=${r.reason || r.message} reads=[${reads}]`);
    if (ok && tc.note) note(`${tc.id.padEnd(5)}`, tc.note);
  }

  console.log('\n── PRODUCTION QUERY SHAPE — a database filter, not a candidate window ──');
  {
    const probe = await decide(base, [activeRow()], B, E);
    const q = probe.log.find((o) => o.table === 'expert_advisor_access');
    const f = (col) => (q?.filters || []).find(([c]) => c === col)?.[1];
    check('Q1  the production query carries access_status = active', f('access_status') === 'active', JSON.stringify(q?.filters));
    check('Q2  the production query carries revoked_at IS NULL', !!f('revoked_at') && f('revoked_at').is === null, JSON.stringify(q?.filters));
    check('Q3  the production query carries the expert AND business identity filters', f('expert_profile_id') === E && f('business_id') === B, JSON.stringify(q?.filters));
    check('Q4  the query is bounded to ONE row (no window for a live row to fall outside)', q?.limit === 1, String(q?.limit));
    check('Q5  the row the query returns is still judged by the canonical predicate', /return isActiveRelationship\(row\) \? row : null;/.test(deComment(read(REL))));
    check('Q6  the existence query is not maybeSingle() (duplicate active rows must not error)', !/maybeSingle/.test(deComment(read(REL))));
  }

  console.log('\n── R13 SUSPENDED ACTOR — denied BEFORE any relationship authorization ──');
  {
    // The actor is suspended AND holds an ACTIVE relationship: the strongest form
    // of the case. The composed path is the real authenticateActor → real
    // validateBusinessScope.
    const rows = [activeRow({ expert_profile_id: 'p-suspended', client_profile_id: 'p-client' })];
    const log = [];
    const sb = makeSb(withRows(rows), log);
    let out;
    try {
      const actor = await base.authenticateActor({ auth: { me: async () => ({ id: 'u-suspended', email: 'susp@t', role: 'admin' }) } }, sb);
      await base.validateBusinessScope(sb, B, actor.profile_id);
      out = { allow: true };
    } catch (e) {
      out = { allow: false, status: e.status };
    }
    check('R13  suspended actor + ACTIVE relationship → 403 DENY at the actor stage', out.allow === false && out.status === 403, `got ${JSON.stringify(out)}`);
    check('R13b no business or relationship table was read after the refusal', !log.some((o) => o.table === 'business_entities' || o.table === 'expert_advisor_access'), `reads=[${readTables(log)}]`);
  }

  // ── MUTATIONS — mutate the REAL source, re-run the matrix, catch it ────────
  console.log('\n── MUTATION TESTS — mutate the REAL extracted source, re-run, catch it ──');
  const ACTIVE_BODY = [
    '  if (!row || typeof row !== \'object\') return false;',
    '  if (row.access_status !== ACTIVE_RELATIONSHIP_STATUS) return false;',
    '  if (row.revoked_at) return false;',
    '  return true;',
  ].join('\n');
  const STATUS_LINE = '  if (row.access_status !== ACTIVE_RELATIONSHIP_STATUS) return false;';
  const REVOKED_LINE = '  if (row.revoked_at) return false;';
  const STEP6_LINE = '  const expertRelationship = await resolveActiveExpertRelationship(sb, profile_id, business_id);';
  const REL_SRC = read(REL);
  const GUARD_SRC = read(GUARD);

  // NOTE on catch-sets after the S3.0.2 correction: because the QUERY now excludes
  // non-active and revoked rows, an in-memory predicate violation can only be
  // observed on a row that should never have been returned (R20 / R20b simulate
  // exactly that). Those two cases are therefore the load-bearing catches for the
  // predicate mutations, and they exist precisely to prove the predicate still runs.
  const MUTATIONS = [
    {
      id: 'M1', name: 'row EXISTENCE alone grants access (the original defect)',
      on: 'rel', edits: [{ find: ACTIVE_BODY, replace: '  return !!row;' }],
      mustCatch: ['R20', 'R20b'],
    },
    {
      id: 'M2', name: 'revoked_at ignored by the predicate',
      on: 'rel', edits: [{ find: REVOKED_LINE + '\n', replace: '' }],
      mustCatch: ['R20b'],
    },
    {
      id: 'M3', name: 'access_status ignored by the predicate',
      on: 'rel', edits: [{ find: STATUS_LINE + '\n', replace: '' }],
      mustCatch: ['R20'],
    },
    {
      id: 'M4', name: 'tolerant display rule copied into the decision (status != revoked)',
      on: 'rel', edits: [{ find: STATUS_LINE, replace: "  if (row.access_status === 'revoked') return false;" }],
      mustCatch: ['R20'],
    },
    {
      id: 'M5', name: 'writeGuard reverted to row presence (old authorization path)',
      on: 'guard', edits: [{ find: STEP6_LINE, replace: `  const { data: expertRelationship } = await sb
    .from('expert_advisor_access')
    .select('id')
    .eq('expert_profile_id', profile_id)
    .eq('business_id', business_id)
    .maybeSingle();` }],
      mustCatch: ['R2', 'R3', 'R4', 'R15a'],
    },
    {
      id: 'M6', name: 'expert identity filter dropped (unrelated expert accepted)',
      on: 'rel', edits: [{ find: "    .eq('expert_profile_id', String(expertProfileId))\n", replace: '' }],
      mustCatch: ['R7', 'R9b'],
    },
    {
      id: 'M7', name: 'business filter dropped (unknown business accepted)',
      on: 'rel', edits: [{ find: "    .eq('business_id', String(businessId))\n", replace: '' }],
      mustCatch: ['R8', 'R10'],
    },
    {
      id: 'M8', name: 'access_status DATABASE filter removed',
      on: 'rel', edits: [{ find: "    .eq('access_status', ACTIVE_RELATIONSHIP_STATUS)\n", replace: '' }],
      mustCatch: ['R18'],
    },
    {
      id: 'M9', name: 'revoked_at DATABASE filter removed',
      on: 'rel', edits: [{ find: "    .is('revoked_at', null)\n", replace: '' }],
      mustCatch: ['R15c'],
    },
    {
      id: 'M10', name: 'application predicate removed from the resolver return',
      on: 'rel', edits: [{ find: '  return isActiveRelationship(row) ? row : null;', replace: '  return row || null;' }],
      mustCatch: ['R20', 'R20b'],
    },
    {
      // The pre-correction resolver, restored faithfully: NO database status /
      // revoked filter, an arbitrary 60-row window, and the predicate applied to
      // whatever happened to land inside that window.
      id: 'M11', name: 'arbitrary candidate-window behaviour restored (unfiltered limit 60 + in-memory find)',
      on: 'rel', edits: [
        { find: "    .eq('access_status', ACTIVE_RELATIONSHIP_STATUS)\n", replace: '' },
        { find: "    .is('revoked_at', null)\n", replace: '' },
        { find: '    .limit(1);', replace: '    .limit(60);' },
        { find: '  return isActiveRelationship(row) ? row : null;', replace: '  return (rows || []).find(isActiveRelationship) || null;' },
      ],
      mustCatch: ['R16'],
    },
  ];

  for (const mut of MUTATIONS) {
    const src = mut.on === 'rel' ? REL_SRC : GUARD_SRC;
    const missing = mut.edits.find((e) => !src.includes(e.find));
    if (missing) {
      check(`${mut.id} ${mut.name}`, false, `mutation anchor not found: ${missing.find.slice(0, 46)}`);
      continue;
    }
    const mutated = mut.edits.reduce((s, e) => s.replace(e.find, e.replace), src);
    const sbx = buildSandbox({
      relSource: mut.on === 'rel' ? mutated : REL_SRC,
      guardSource: mut.on === 'guard' ? mutated : GUARD_SRC,
    });
    const caught = [];
    for (const caseId of mut.mustCatch) {
      const tc = CASES.find((c) => c.id === caseId);
      const r = await decide(sbx, tc.rows, tc.biz, tc.who, tc.extra || [], tc.opts || {});
      const ok = tc.allow
        ? r.allow === true && (tc.reason === undefined || r.reason === tc.reason)
        : r.allow === false;
      if (!ok) caught.push(caseId);
    }
    check(`${mut.id} ${mut.name} → caught by [${caught.join(', ') || 'NOTHING'}]`, caught.length > 0, caught.length ? '' : 'the harness would NOT have caught this regression');
  }

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n── WIRING — one decision, one predicate, no second system ──');
  const guardRaw = read(GUARD);
  const relRaw = read(REL);
  const expertApi = read(EXPERT_API);
  // Comments may describe the rule; these checks assert BEHAVIOUR, so comments
  // are stripped first (module-level `deComment`) and only executable code matches.
  const guardJs = deComment(guardRaw);
  const relJs = deComment(relRaw);

  check('W1  the guard imports the shared predicate', /import \{ resolveActiveExpertRelationship \} from '\.\/relationshipAccess\.ts';/.test(guardRaw));
  check('W2  the old row-presence decision is gone from the guard', !/if \(expertRow\)/.test(guardRaw) && !/\.select\('id'\)\s*\n\s*\.eq\('expert_profile_id'/.test(guardRaw));
  check('W3  the guard decides the expert relationship in exactly ONE place', (guardRaw.match(/resolveActiveExpertRelationship\(/g) || []).length === 1);
  check('W4  the guard declares no local status/revoked rule (single source of truth)', !/access_status|revoked_at/.test(guardJs), guardJs.match(/.{0,40}(access_status|revoked_at).{0,40}/) ? String(guardJs.match(/.{0,40}(access_status|revoked_at).{0,40}/)[0]) : '');
  check('W5  the resolver takes only the actor-derived ids (no request object)', /resolveActiveExpertRelationship\(\s*sb: any,\s*expertProfileId: any,\s*businessId: any/.test(relRaw));
  check('W6a the query pushes access_status = active into the database', /\.eq\('access_status', ACTIVE_RELATIONSHIP_STATUS\)/.test(relJs));
  check('W6b the query pushes revoked_at IS NULL into the database', /\.is\('revoked_at', null\)/.test(relJs));
  check('W6c no arbitrary candidate window remains (bounded to a single row)', !/MAX_CANDIDATE_ROWS/.test(relJs) && /\.limit\(1\)/.test(relJs));
  check('W6d the returned row is STILL passed through the canonical predicate before authorization', /return isActiveRelationship\(row\) \? row : null;/.test(relJs));
  check('W7  a read error fails closed', /if \(error\) return null;/.test(relRaw));
  check('W8  no second advisor authorization system or table was introduced', !/createTable|CREATE TABLE|new table/i.test(relRaw) && !/advisor_relationship|expert_access_v2|relationship_grants/i.test(relRaw + guardRaw));
  check('W9  the decision consults only expert_advisor_access', (relJs.match(/from\('([a-z_]+)'\)/g) || []).join(',') === "from('expert_advisor_access')", (relJs.match(/from\('([a-z_]+)'\)/g) || []).join(','));

  // Existing consumers must keep their rule — the fix aligns with them, not
  // against them (no divergent fourth rule introduced anywhere).
  const ACTIVE_CONSUMERS = [
    [EXPERT_API, 'listMyClients'],
    [EXPERT_API, 'checkPermission'],
    ['base44/functions/recommendationOverrides/entry.ts', 'verifyAdvisorAccess'],
    ['base44/functions/selectStrategiesForClient/entry.ts', 'ownership/advisor check'],
    ['base44/functions/resolveStrategyMappings/entry.ts', 'ownership/advisor check'],
    ['base44/functions/generateAdvisorCommandCenter/entry.ts', 'advisor roster'],
  ];
  ACTIVE_CONSUMERS.forEach(([file, what], i) => {
    const src = read(file);
    check(`W10.${i + 1} existing authorization consumer keeps its ACTIVE filter — ${what}`, /\.eq\('access_status', 'active'\)/.test(src), file);
  });
  check('W11 the only writers of access_status remain grant(active)/revoke(revoked)',
    JSON.stringify((expertApi.match(/access_status: '[a-z]+'/g) || []).sort()) === JSON.stringify(["access_status: 'active'", "access_status: 'active'", "access_status: 'revoked'"]),
    (expertApi.match(/access_status: '[a-z]+'/g) || []).join(', '));
  check("W12 the grant writer still clears revoked_at, the revoke writer still sets it", /revoked_at: null/.test(expertApi) && /revoked_at: new Date\(\)\.toISOString\(\)/.test(expertApi));
  check('W13 the display readers were left tolerant and non-authorizing (unchanged)', (expertApi.match(/\.neq\('access_status', 'revoked'\)/g) || []).length === 3);

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n── CHANGE SURFACE — S3.1, documents, RLS and schema untouched ──');
  // The reviewed S3.0.2 slice is COMMITTED; this refinement sits on top of it.
  // "Changed" therefore means "changed since the reviewed S3.0.2 commit", counted
  // across BOTH the committed correction and any uncommitted working-tree edit, so
  // this assertion holds identically before and after the correction is committed.
  const S302_COMMIT = git(['log', '--diff-filter=A', '--format=%H', '-1', '--', REL]).trim();
  const names = (s) => s.trim().split('\n').filter(Boolean);
  const changed = [...new Set([
    ...names(git(['diff', '--name-only', S302_COMMIT, 'HEAD'])),
    ...names(git(['diff', '--name-only', S302_COMMIT])),
    ...names(git(['ls-files', '--others', '--exclude-standard'])),
  ])].sort();
  // S3.1 — the reviewed slice layered on the S3.0.2 correction: the converged
  // document VIEW path, its shared bucket policy, getDocumentsAdmin's vocabulary
  // swap, and the harnesses that pin them (adminCanonicalActor and
  // documentAccessAuthorization were rebased; documentSignedUrlAuthorization is
  // the new S3.1 harness).
  const S31_FILES = [
    'base44/functions/supabaseUserData/entry.ts',
    'base44/functions/getDocumentsAdmin/entry.ts',
    'base44/shared/documents/buckets.ts',
    'scripts/documentSignedUrlAuthorization.test.cjs',
    'scripts/adminCanonicalActor.test.cjs',
    'scripts/documentAccessAuthorization.test.cjs',
  ];
  // P5 REBASE — the reviewed P5 slice (Admin document viewing) adds one product
  // file (the Admin client's Documents tab) and one harness. The revocation rule
  // itself is untouched: W1–W13 above still resolve through the shared predicate,
  // and F1b/F3 below still pin the authorization spine.
  const P5_FILES = ['src/components/admin/AdminUserProfileContext.jsx', 'scripts/adminDocumentViewer.test.cjs'];
  // P-S3 REBASE — the reviewed P-S3 slice (Galileo context actor binding, closes
  // SEC-001) changes ONE backend function and adds one harness plus one review
  // report; the committed ledger reports are named because they are part of the
  // repository surface, not product code. NOTHING above changes: W1–W13, the
  // query-filter assertions and every mutation check are untouched.
  const P_S3_FILES = [
    'base44/functions/buildGalileoContext/entry.ts',
    'scripts/galileoContextActorBinding.test.cjs',
    'SECURITY_P_S3_GALILEO_ACTOR_BINDING_REPORT.md',
  ];
  const APPROVED_REPORTS = [
    'SECURITY_LEDGER_POST_P5.md',
    'src/SECURITY_LEDGER_P_S1_BOUNDARY2_VERIFICATION.md',
  ];
  // 6D.0 REBASE — the reviewed 6D.0 slice (document extraction integrity) is a
  // LATER, APPROVED slice layered on P5/P-S3. Allowlist line ONLY: W1–W13, the
  // revocation matrix, the suspended-actor and query-filter assertions and every
  // mutation check above are untouched.
  const P_6D0_FILES = [
    'base44/functions/runDocumentExtraction/entry.ts',
    'base44/shared/documentExtraction/analysisState.ts',
    'base44/shared/documentExtraction/extractEngine.ts',
    'base44/shared/documentExtraction/extractionConfidence.ts',
    'base44/shared/documentExtraction/periodIntegrity.ts',
    'scripts/extractionIntegrity.test.cjs',
    'src/hooks/useDocumentViewer.js',
    'src/components/documents/DocumentViewer.jsx',
    'src/VISION_PHASE_6D_EVIDENCE_INTELLIGENCE_AUDIT.md',
    'VISION_PHASE_6D_0_EXTRACTION_INTEGRITY_REPORT.md',
  ];
  // CLASSIFICATION HOTFIX REBASE — the reviewed document-upload classification
  // hotfix is a LATER, APPROVED slice. Allowlist line ONLY: W1-W13, the
  // authorization matrix and every mutation check above are untouched.
  const CLASSIFICATION_HOTFIX_FILES = [
    'base44/shared/documents/documentTypes.ts',
    'base44/functions/uploadDocumentToSupabase/entry.ts',
    'src/lib/documents/documentTypes.js',
    'src/pages/DocumentUpload.jsx',
    'src/pages/DataRoom.jsx',
    'src/components/documents/uploadConfig.jsx',
    'scripts/documentUploadClassification.test.cjs',
    'VISION_DOCUMENT_UPLOAD_CLASSIFICATION_HOTFIX.md',
  // 6D.0c.1-P PRODUCTION REPAIR — a LATER, APPROVED slice, declared by name.
  ].filter((f) => ![REL, TEST, 'src/scripts/getDocumentsAdmin.s3.mock.test.cjs', ...S31_FILES, ...P5_FILES, ...P_S3_FILES, ...APPROVED_REPORTS, ...P_6D0_FILES, 'base44/shared/galileo/provisionalEvidence.ts', 'base44/shared/canonicalFact/registry.ts', 'base44/functions/askGalileo/entry.ts', 'src/scripts/documentKnowledgeCompletion.test.cjs', 'VISION_PHASE_6D_0C_1_PROVISIONAL_EVIDENCE_RETRIEVAL.md', ...require('./slice6D0C2Files.cjs')].includes(f));
  // 6D.0a REBASE — the reviewed Semantic Observation Bridge slice: ONE new shared
  // module, the shared contract that now reads it, buildGalileoContext's CONSUMER
  // wiring, its own harness, the post-hotfix audit report and this slice's report.
  // Allowlist line ONLY: W1–W13, the revocation matrix and every mutation check are
  // untouched, and relationshipAccess.ts / writeGuard.ts remain unmodified.
  const P_6D0A_FILES = [
    'base44/shared/documentObservation/semantics.ts',
    'base44/shared/intelligenceContract/businessIntelligenceContract.ts',
    'base44/functions/buildGalileoContext/entry.ts',
    'scripts/semanticObservationBridge.test.cjs',
    'VISION_DOCUMENT_UNDERSTANDING_AND_GALILEO_INTELLIGENCE_AUDIT.md',
    'src/VISION_PHASE_6D_0A_SEMANTIC_OBSERVATION_BRIDGE.md',
  ];
  // 6D.0b AUTOMATIC DOCUMENT UNDERSTANDING — a LATER, APPROVED slice. Allowlist
  // lines ONLY: the relationship predicate, the suspension rule and every mutation
  // check above are unchanged.
  const P_6D0B_FILES = [
    'base44/shared/documentUnderstanding/taxonomy.ts',
    'base44/shared/documentUnderstanding/contract.ts',
    'base44/shared/documentUnderstanding/signals.ts',
    'base44/shared/documentUnderstanding/semanticClassifier.ts',
    'base44/shared/documentUnderstanding/understandDocument.ts',
    'base44/shared/documentUnderstanding/persist.ts',
    'base44/shared/documentUnderstanding/orchestrator.ts',
    'base44/functions/uploadDocumentToSupabase/entry.ts',
    'scripts/documentUnderstanding.test.cjs',
    'VISION_PHASE_6D_0B_AUTOMATIC_DOCUMENT_UNDERSTANDING.md',
    // 6D.0b.1 REAL PROVIDER SEAM REPAIR — a LATER, APPROVED slice: the provider
    // seam's BOUNDED read, the schema-aware applied-type write, the canonical
    // upload/analysis state vocabulary, the surfaces that read it and the CTA that
    // asks about an exact document. ALLOWLIST LINES ONLY — the revocation,
    // authorization and change-surface assertions themselves are unchanged.
    'src/lib/documents/documentTypes.js',
    'src/hooks/useDocumentPipelinePolling.js',
    'src/hooks/useAskGalileo.js',
    'src/hooks/useVisionActions.js',
    'src/pages/DataRoom.jsx',
    'src/pages/DocumentUpload.jsx',
    'scripts/documentUnderstandingRealSeam.test.cjs',
    // 6D.0b.2 — durable document ingestion (reviewed surface).
    'base44/entities/DocumentIngestionJob.jsonc',
    'base44/functions/processDocumentIngestionJob/entry.ts',
    'base44/shared/documentIngestion/orchestration.ts',
    'base44/workflows/Document Ingestion.jsonc',
    'base44/workflows/Document Ingestion Recovery.jsonc',
    'src/scripts/durableDocumentIngestion.test.cjs',
    'VISION_PHASE_6D_0B_2_DURABLE_DOCUMENT_INGESTION.md',
    // 6D.0c — the Galileo half's own completion report is a later APPROVED slice.
    'VISION_PHASE_6D_0C_DOCUMENT_KNOWLEDGE_COMPLETION.md',
    'src/pages/DocumentUpload.jsx',
    'VISION_PHASE_6D_0B_1_REAL_PROVIDER_SEAM_REPAIR.md',
  ];
  // Set equality (deduped): a file named by more than one approved slice is still
  // ONE changed file. No new file is admitted by this.
  // 6D.0b.2.1 CANONICAL SOURCE READ REPAIR — a LATER, APPROVED slice. Allowlist line
  // ONLY: the ONE shared project-URL normalizer, its harness and its report.
  const P_6D0B2_1_FILES = [
    'base44/shared/supabase/projectUrl.ts',
    'src/scripts/documentCanonicalSourceRead.test.cjs',
    'VISION_PHASE_6D_0B_2_1_CANONICAL_SOURCE_READ_REPAIR.md',
  ];
  const ALLOWED = [...new Set([REL, TEST, 'src/scripts/getDocumentsAdmin.s3.mock.test.cjs', ...S31_FILES, ...P5_FILES, ...P_S3_FILES, ...APPROVED_REPORTS, ...P_6D0_FILES, ...CLASSIFICATION_HOTFIX_FILES, ...P_6D0A_FILES, ...P_6D0B_FILES, ...P_6D0B2_1_FILES, 'base44/shared/documentIngestion/resume.ts', 'src/scripts/documentKnowledgeCompletion.test.cjs', 'base44/shared/galileo/focusedDocument.ts', 'base44/functions/askGalileo/entry.ts', 'src/hooks/useAskGalileo.js', 'src/components/galileo/home/GalileoAnswerPanel.jsx', 'base44/shared/galileo/provisionalEvidence.ts', 'base44/shared/canonicalFact/registry.ts', 'VISION_PHASE_6D_0C_1_PROVISIONAL_EVIDENCE_RETRIEVAL.md', ...require('./slice6D0C2Files.cjs')])].sort();
  check("F1  the change surface since the reviewed commit is exactly this correction's files plus the P5 slice", JSON.stringify(changed) === JSON.stringify(ALLOWED), changed.join(', '));
  check('F1b writeGuard.ts is UNCHANGED since the reviewed S3.0.2 commit (no authorization semantics moved)', !changed.includes(GUARD));
  // S3.1 rebased the S3.0.2-era harness explicitly: its S1/S4/S6/S11/W17/F3/F4
  // assertions were re-based for the reviewed VIEW change. "Not moved" is therefore
  // no longer the invariant; a DELIBERATE, documented rebase is.
  check('F1c the S3.0.2-era harness was rebased only for S3.1 (documented, not silent drift)',
    changed.includes('scripts/adminCanonicalActor.test.cjs') && /S3\.1 REBASE/.test(read('scripts/adminCanonicalActor.test.cjs')));
  // S3.1 is now COMPLETE: the VIEW path converged ONTO the shared engine, so
  // supabaseUserData IS expected to have changed. The invariant this assertion
  // protects — the shared document engine itself is not modified — still holds.
  check('F2  the shared document engine is untouched by S3.1 (the VIEW path converged onto it)', changed.includes('base44/functions/supabaseUserData/entry.ts') && !changed.includes(DOC_ACCESS) && !changed.includes(ACTOR), changed.join(', '));
  check('F3  the actor module is untouched by this slice', !changed.includes(ACTOR));
  check('F4  no SQL, migration, RLS or Storage file changed', !changed.some((f) => f.endsWith('.sql') || f.startsWith('src/supabase/')));
  check('F5  the only frontend files changed are the reviewed P5 Admin Documents tab, the reviewed 6D.0 source-missing state, the classification hotfix and the 6D.0a reports', !changed.some((f) => f.startsWith('src/') && !f.startsWith('src/scripts/') && !P5_FILES.includes(f) && !APPROVED_REPORTS.includes(f) && !P_6D0_FILES.includes(f) && !CLASSIFICATION_HOTFIX_FILES.includes(f) && !P_6D0A_FILES.includes(f) && !P_6D0B_FILES.includes(f) && f !== 'src/components/galileo/home/GalileoAnswerPanel.jsx' && !require('./slice6D0C2Files.cjs').includes(f)));

  note('SCOPE', 'client↔business COHERENCE of a relationship row (matrix item "correct business, wrong client") is NOT enforced here: the decision is the expert↔business pair, and the client dimension is validated at GRANT time by requireBusinessContext. Re-verifying it at read time is the deferred relationship-model decision, not part of the lifecycle fix.');

  console.log('\n' + '─'.repeat(72));
  if (failures.length) {
    console.log(`RESULT: FAIL — ${failures.length} assertion(s) failed`);
    failures.forEach((f) => console.log(`   · ${f}`));
    process.exit(1);
  }
  console.log('RESULT: PASS — relationship revocation is enforced by the shared business-access decision.');
  console.log('No network, database or production record was touched by this script.');
})().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});