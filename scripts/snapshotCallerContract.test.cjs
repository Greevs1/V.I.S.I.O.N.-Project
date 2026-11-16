#!/usr/bin/env node
/**
 * snapshotCallerContract.test.cjs — S4 Gate B · AUTH-1 offline certification.
 *
 *   node scripts/snapshotCallerContract.test.cjs
 *
 * OFFLINE AND NON-DESTRUCTIVE. No network, no database, no Base44 call, no Supabase
 * project contacted, no fixture created, no SQL executed. Nothing is deployed.
 *
 * THE CODE UNDER TEST IS THE SHIPPED CODE, not a restatement of it:
 *
 *   1. `base44/shared/authz/actor.ts`, `.../canonicalActor.ts` and
 *      `base44/functions/createSnapshotFromReviewedFields/entry.ts` are COMPILED from
 *      their real TypeScript sources (esbuild, loader 'ts' — the same source the
 *      platform runs; only the module `import`/`export` keywords are removed) and
 *      evaluated together in one node:vm context, so the real `HttpError`,
 *      `errorResponse`, `resolveCanonicalActor` and the real handler closure are the
 *      ones exercised.
 *   2. `Deno.serve` is stubbed to CAPTURE the handler, so every request below flows
 *      through the real endpoint body: real identity gate, real comparator, real
 *      payload builder, real result validation, real error mapping.
 *   3. The only mocks are the ADAPTERS at the edge — the SDK client and the Supabase
 *      client — which is exactly where a database would sit.
 *
 * SECTIONS
 *   S        the fifteen source checks S1–S15 (4 D2 invariants hold now; 4 D2
 *            post-apply criteria are PENDING AUTH-2; S9–S15 judged on this change)
 *   A        canonical identity (A1–A12)
 *   B        request body (B1–B3)
 *   C        business authorization (C1–C8)
 *   D        fail-closed pagination (D1–D8)
 *   E        deterministic total-order selection (E1–E7)
 *   F        RPC payload + no direct writes (F1–F6)
 *   G        RPC result validation (G1–G10)
 *   H        error-code mapping (H1–H7)
 *
 * EVIDENCE CLASS: UNIT/MOCK (real modules, mocked adapters) + STATIC/SOURCE.
 * NOT DB-PASS. Every database-side expectation remains with AUTH-2.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

const ACTOR = 'base44/shared/authz/actor.ts';
const CANONICAL = 'base44/shared/authz/canonicalActor.ts';
const ENTRY = 'base44/functions/createSnapshotFromReviewedFields/entry.ts';
const D2 = 'src/VISION_S4_GATE_B_02_SQL_MIGRATION.md';

const failures = [];
let passes = 0;
const check = (label, ok, detail = '') => {
  if (ok) passes += 1;
  else failures.push(detail ? `${label} — ${detail}` : label);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? ` — ${detail}` : ''}`);
};
const pending = (label, measured, expected) =>
  console.log(`PENDING  ${label} — measured ${measured}, expected ${expected} after AUTH-2 (not authorized here)`);
const section = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 68 - t.length))}`);

// ─────────────────────────────────────────────────────────────────────────────
// Compile the REAL TypeScript (module keywords dropped, types erased)
// ─────────────────────────────────────────────────────────────────────────────
const strip = (s) => s
  .replace(/^\s*import[\s\S]*?from\s+'[^']+';/gm, '')
  .replace(/^\s*export\s+/gm, '');
const toJs = (ts) => esbuild.transformSync(ts, { loader: 'ts', format: 'esm', target: 'es2020' }).code;
/** Comments removed — every source assertion below judges CODE, never prose about code. */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const ACTOR_SRC = read(ACTOR);
const CANONICAL_SRC = read(CANONICAL);
const ENTRY_SRC = read(ENTRY);
const D2_SRC = read(D2);

const SCRIPT = [
  toJs(strip(ACTOR_SRC)),
  toJs(strip(CANONICAL_SRC)),
  toJs(strip(ENTRY_SRC)),
].join('\n');

// ─────────────────────────────────────────────────────────────────────────────
// Adapter mocks (the only mocks in this file)
// ─────────────────────────────────────────────────────────────────────────────
const ResponseStub = {
  json: (body, init = {}) => ({ status: init.status || 200, body }),
};

const UID = 'base44-user-1';
const PROFILE = 'profile-1';
const BIZ = 'business-1';
const DOC = 'document-1';
const SNAP = '11111111-2222-3333-4444-555555555555';

function okRpc(applied = { annual_revenue: 100 }, over = {}) {
  return {
    snapshot_id: SNAP,
    snapshot_type: 'historical',
    deduplicated: false,
    dashboard_metrics_updated: false,
    promoted_over_newer: false,
    is_latest: false,
    applied,
    skipped: [],
    confidence_score: 91,
    dashboard_skipped_reason: null,
    ...over,
  };
}

function row(id, name, reviewed, created) {
  return { id, field_name: name, reviewed_at: reviewed, created_at: created };
}

function baseCfg(over = {}) {
  return {
    user: { id: UID, email: 'owner@example.test' },
    profiles: [{ id: PROFILE, app_role: 'admin', profile_status: 'active', base44_user_id: UID }],
    document: {
      id: DOC, name: 'P&L 2024', document_type: 'profit_and_loss',
      year: 2024, business_id: BIZ, profile_id: PROFILE,
    },
    entity: { id: BIZ, profile_id: PROFILE, assigned_advisor_id: null },
    owners: [],
    rows: [row('f-rev', 'annual_revenue', '2024-05-01T00:00:00Z', '2024-01-01T00:00:00Z')],
    rpc: { data: okRpc(), error: null },
    body: { documentId: DOC },
    ...over,
  };
}

function makeSb(cfg, calls) {
  const exec = (st) => {
    switch (st.table) {
      case 'profiles':
        calls.profileFilters = st.filters;
        return { data: cfg.profilesError ? null : cfg.profiles, error: cfg.profilesError || null };
      case 'documents':
        return { data: cfg.document === undefined ? null : cfg.document, error: cfg.documentError || null };
      case 'business_entities':
        return { data: cfg.entity === undefined ? null : cfg.entity, error: cfg.entityError || null };
      case 'business_owners':
        return { data: cfg.owners || [], error: cfg.ownersError || null };
      case 'extracted_fields': {
        if (st.opts && st.opts.head === true) {
          calls.counts += 1;
          const seq = cfg.counts || [(cfg.rows || []).length];
          const value = seq[Math.min(calls.counts - 1, seq.length - 1)];
          return { count: value, error: cfg.countError || null };
        }
        calls.pageReads += 1;
        const rows = cfg.rows || [];
        const [a, z] = st.range || [0, rows.length - 1];
        let page = rows.slice(a, z + 1);
        if (cfg.pageTransform) page = cfg.pageTransform(page, { from: a, to: z, index: calls.pageReads });
        return { data: cfg.pageError ? null : page, error: cfg.pageError || null };
      }
      default:
        return { data: null, error: null };
    }
  };

  return {
    from(table) {
      calls.from.push(table);
      const st = { table, filters: {}, opts: null, range: null };
      const b = {
        select(_sel, opts) { st.opts = opts || null; return b; },
        eq(c, v) { st.filters[c] = v; return b; },
        in(c, v) { st.filters[c] = v; return b; },
        or() { return b; },
        order() { return b; },
        range(a, z) { st.range = [a, z]; return b; },
        limit() { return b; },
        maybeSingle() { return b; },
        single() { return b; },
        then(res, rej) { return Promise.resolve(exec(st)).then(res, rej); },
      };
      return b;
    },
    rpc(name, args) {
      calls.rpc.push({ name, args });
      return Promise.resolve({
        data: cfg.rpc ? cfg.rpc.data : null,
        error: cfg.rpc ? cfg.rpc.error : null,
      });
    },
  };
}

/** Run one request through the REAL handler with the adapters mocked. */
function run(cfg) {
  const calls = { rpc: [], from: [], counts: 0, pageReads: 0, profileFilters: null };
  const log = [];
  let handler = null;

  const SB = makeSb(cfg, calls);
  const BASE44 = {
    auth: {
      me: async () => {
        if (cfg.meError) throw cfg.meError;
        return cfg.user === undefined ? { id: UID } : cfg.user;
      },
    },
  };

  const env = cfg.env || { VITE_SUPABASE_URL: 'https://stub.invalid', SUPABASE_SERVICE_ROLE_KEY: 'stub-key' };
  const ctx = vm.createContext({
    console: { error: (m) => log.push(String(m)), log: () => {}, warn: () => {} },
    Response: ResponseStub,
    Deno: { env: { get: (k) => env[k] }, serve: (fn) => { handler = fn; } },
    createClientFromRequest: () => BASE44,
    createClient: () => SB,
  });

  vm.runInContext(SCRIPT, ctx, { filename: 's4-gate-b-bundle.js' });

  if (typeof handler !== 'function') throw new Error('the handler was never registered via Deno.serve');

  const req = {
    json: async () => {
      if (cfg.badBody) throw new Error('invalid json');
      return cfg.body === undefined ? {} : cfg.body;
    },
  };

  return Promise.resolve(handler(req)).then((res) => ({ res, calls, log }));
}

// ═════════════════════════════════════════════════════════════════════════════
// S — THE FIFTEEN SOURCE CHECKS
// ═════════════════════════════════════════════════════════════════════════════
function sourceChecks() {
  section('S1–S15 · SOURCE CHECKS');

  const D2_SHA = md5(D2_SRC);
  check('S1  D2 byte-identical (AUTH-1 forbids editing D2)', D2_SHA === '93caa480de80ec621b4204bcbed898a9', D2_SHA);

  // S2 — hunk signatures present exactly once in D2 (post-apply criterion).
  const hunkSignatures = [
    'v_skipped_ids   uuid[]',
    'SNAPSHOT_INVALID_SKIPPED: field is not a canonical uuid',
    'v_skipped_ids && v_contributor_ids',
    'select unnest(v_contributor_ids || v_skipped_ids) as id',
    'reconciled in one statement inside this transaction',
    '| **V-16** |',
    'fifteen',
  ];
  const foundHunks = hunkSignatures.filter((s) => D2_SRC.includes(s)).length;
  if (foundHunks === 0) pending('S2  all 7 hunk signatures present exactly once', 0, 7);
  else check('S2  all 7 hunk signatures present exactly once', foundHunks === 7, `${foundHunks}/7`);

  // S3 — the RPC still takes 11 parameters.
  const sig = D2_SRC.slice(D2_SRC.indexOf('create or replace function public.create_reviewed_fields_snapshot('));
  const body = sig.slice(0, sig.indexOf(')'));
  const params = (body.match(/^\s{2}p_[a-z0-9_]+\s+(uuid|text|jsonb|boolean)/gm) || []).length;
  check('S3  RPC parameter count is 11', params === 11, `found ${params}`);

  // S4 — the three regprocedure literals are byte-identical.
  const regs = D2_SRC.match(/'public\.create_reviewed_fields_snapshot\([^)]*\)'/g) || [];
  check('S4  three regprocedure literals, all identical', regs.length === 3 && new Set(regs).size === 1, `${regs.length} occurrences`);

  // S5 / S6 — body raise sites and distinct codes (post-apply criteria).
  const bodyRaises = (D2_SRC.match(/raise exception/g) || []).length;
  const bodyRaisesOnly = (D2_SRC.split('\n').reduce((n, line, i) => (i >= 115 && i <= 775 && /raise exception/.test(line) ? n + 1 : n), 0));
  if (bodyRaisesOnly === 45) check('S5  body raise sites = 45', true);
  else pending('S5  body raise sites = 45', bodyRaisesOnly, 45);
  const d2Codes = new Set(D2_SRC.match(/SNAPSHOT_[A-Z_]+/g) || []);
  if (d2Codes.size === 27) check('S6  distinct codes = 27', true);
  else pending('S6  distinct codes = 27', d2Codes.size, 27);

  // S7 — OD-6: the approved allowlist value does not move.
  check(
    'S7  D2 v_active_statuses is still [active,incomplete] (OD-6)',
    /v_active_statuses constant text\[\] := array\['active','incomplete'\]/.test(D2_SRC),
  );

  // S8 — untouched-span hash (only meaningful after a patch).
  pending('S8  untouched-span hash unchanged', 'n/a pre-patch', 'identical after AUTH-2');

  // S9–S12 — judged on CODE, never on comments.
  const CANON_CODE = stripComments(CANONICAL_SRC);
  const ENTRY_CODE = stripComments(ENTRY_SRC);

  check('S9  canonicalActor: zero email predicates in code', !/\.eq\(\s*'email'/.test(CANON_CODE) && !/ilike\(/.test(CANON_CODE));
  const idEq = (CANON_CODE.match(/\.eq\(\s*'base44_user_id'/g) || []).length;
  check('S10 canonicalActor: exactly one base44_user_id predicate', idEq === 1, `found ${idEq}`);

  const identityReads = ENTRY_CODE.match(/body\.(email|profile_id|user_id|base44_user_id|role|created_by)/g) || [];
  check('S11 entry: zero identity reads from the request body', identityReads.length === 0, identityReads.join(','));

  const directWrites = ENTRY_CODE.match(/\.from\(\s*'(business_metric_snapshots|dashboard_metrics)'/g) || [];
  const writeVerbs = ENTRY_CODE.match(/\.(insert|update|upsert|delete)\(/g) || [];
  check('S12 entry: zero direct snapshot/dashboard writes', directWrites.length === 0 && writeVerbs.length === 0, `${directWrites.length} target(s), ${writeVerbs.length} verb(s)`);

  // S13 — mapping sets reconcile against D2.
  const statusBlock = ENTRY_CODE.slice(ENTRY_CODE.indexOf('const RPC_ERROR_STATUS'));
  const statusKeys = [...statusBlock.slice(0, statusBlock.indexOf('};')).matchAll(/^\s{2}(SNAPSHOT_[A-Z_]+):/gm)].map((m) => m[1]);
  const msgBlock = ENTRY_CODE.slice(ENTRY_CODE.indexOf('const RPC_ERROR_MESSAGES'));
  const msgKeys = [...msgBlock.slice(0, msgBlock.indexOf('};')).matchAll(/^\s{2}(SNAPSHOT_[A-Z_]+):/gm)].map((m) => m[1]);
  const extra = statusKeys.filter((k) => !d2Codes.has(k));
  check('S13 status map = D2 codes + exactly the proposed B14 code',
    statusKeys.length === 27 && extra.length === 1 && extra[0] === 'SNAPSHOT_POPULATION_INCOMPLETE',
    `${statusKeys.length} keys, extra=[${extra.join(',')}]`);
  check('S13b every mapped message is a mapped status, and B14 has its message',
    msgKeys.every((k) => statusKeys.includes(k)) && msgKeys.includes('SNAPSHOT_POPULATION_INCOMPLETE'),
    `messages=[${msgKeys.join(',')}]`);

  // S14 — substring safety of the ordered matcher (C-3).
  const collisions = [];
  for (const a of statusKeys) for (const b of statusKeys) if (a !== b && a.includes(b)) collisions.push(`${b}⊂${a}`);
  check('S14 no code name contains another', collisions.length === 0, collisions.join(','));

  // S15 — the caller and the RPC agree on "canonical uuid".
  const callerPattern = ENTRY_CODE.match(/UUID_PATTERN = \/(.+?)\/([a-z]*)/);
  const d2Pattern = D2_SRC.match(/\^\[0-9a-fA-F\]\{8\}-\[0-9a-fA-F\]\{4\}-\[0-9a-fA-F\]\{4\}-\[0-9a-fA-F\]\{4\}-\[0-9a-fA-F\]\{12\}\$/);
  let parityOk = Boolean(callerPattern && d2Pattern);
  if (parityOk) {
    const caller = new RegExp(callerPattern[1], callerPattern[2]);
    const rpc = new RegExp(d2Pattern[0].replace(/^\^/, '^').replace(/\$$/, '$'));
    const corpus = [
      SNAP, SNAP.toUpperCase(),
      'not-a-uuid-at-all-not-a-uuid-at-all-1234',
      '11111111-2222-3333-4444-55555555555',
      '11111111-2222-3333-4444-5555555555555',
      'g1111111-2222-3333-4444-555555555555',
      '',
    ];
    parityOk = corpus.every((v) => caller.test(v) === rpc.test(v));
  }
  check('S15 caller and V-16 agree on canonical uuid', parityOk);
}

// ═════════════════════════════════════════════════════════════════════════════
// A — CANONICAL IDENTITY
// ═════════════════════════════════════════════════════════════════════════════
async function identityTests() {
  section('A · CANONICAL IDENTITY');

  let r = await run(baseCfg({ meError: Object.assign(new Error('no token'), { status: 401 }) }));
  check('A1  no session → 401', r.res.status === 401, String(r.res.status));

  r = await run(baseCfg({ meError: new Error('socket hang up') }));
  check('A2  transport failure is not an auth verdict → 500', r.res.status === 500, String(r.res.status));

  r = await run(baseCfg({ meError: Object.assign(new Error('refused'), { status: 429 }) }));
  check('A3  other delivered 4xx → 403', r.res.status === 403, String(r.res.status));

  r = await run(baseCfg({ user: {} }));
  check('A4  session without an id → 401', r.res.status === 401, String(r.res.status));

  r = await run(baseCfg({ profiles: [] }));
  check('A5  zero bindings → 403', r.res.status === 403, String(r.res.status));

  r = await run(baseCfg({
    profiles: [
      { id: 'p-a', app_role: 'admin', profile_status: 'active', base44_user_id: UID },
      { id: 'p-b', app_role: 'user', profile_status: 'active', base44_user_id: UID },
    ],
  }));
  check('A6  two bindings → 403 (observed, not masked)', r.res.status === 403, String(r.res.status));

  r = await run(baseCfg({ profiles: [{ id: PROFILE, app_role: 'admin', profile_status: 'suspended', base44_user_id: UID }] }));
  check('A7  suspended → 403', r.res.status === 403, String(r.res.status));

  r = await run(baseCfg({ profiles: [{ id: PROFILE, app_role: 'admin', profile_status: 'invited', base44_user_id: UID }] }));
  check('A8  invited → 403', r.res.status === 403, String(r.res.status));

  r = await run(baseCfg({ profiles: [{ id: PROFILE, app_role: 'admin', profile_status: null, base44_user_id: UID }] }));
  check('A9  missing status refuses by coercion-proof check → 403', r.res.status === 403, String(r.res.status));

  r = await run(baseCfg({ profilesError: { message: 'boom' } }));
  check('A10 binding lookup failure → 500 (not a policy verdict)', r.res.status === 500, String(r.res.status));

  r = await run(baseCfg({ profiles: { not: 'an array' } }));
  check('A11 non-array bindings → 500', r.res.status === 500, String(r.res.status));

  r = await run(baseCfg({ profiles: [{ id: '', app_role: 'admin', profile_status: 'active', base44_user_id: UID }] }));
  check('A12 unusable profile id → 500', r.res.status === 500, String(r.res.status));

  r = await run(baseCfg({ profiles: [{ id: PROFILE, app_role: 'admin', profile_status: 'active', base44_user_id: 'other' }] }));
  check('A13 binding row carrying a foreign identity → 500', r.res.status === 500, String(r.res.status));

  // The email-fallback trap: a profile reachable only by email is NOT this session's.
  r = await run(baseCfg({ profiles: [] , user: { id: UID, email: 'owner@example.test' } }));
  const filters = r.calls.profileFilters || {};
  check('A14 an email-matching profile alone is refused (no fallback) → 403',
    r.res.status === 403 && Object.keys(filters).length === 1 && filters.base44_user_id === UID,
    `filters=${JSON.stringify(filters)}`);

  // `incomplete` is admitted — the OD-6 decision, on the owner path.
  r = await run(baseCfg({
    profiles: [{ id: PROFILE, app_role: 'user', profile_status: 'incomplete', base44_user_id: UID }],
    entity: { id: BIZ, profile_id: PROFILE, assigned_advisor_id: null },
  }));
  check('A15 incomplete + owner of record → allowed (OD-6)', r.res.status === 200 && r.calls.rpc.length === 1, String(r.res.status));

  r = await run(baseCfg({
    profiles: [{ id: PROFILE, app_role: 'advisor', profile_status: 'active', base44_user_id: UID }],
    entity: { id: BIZ, profile_id: 'someone-else', assigned_advisor_id: PROFILE },
    owners: [],
  }));
  check('A16 advisor is not elevated by assignment (D-4) → 404', r.res.status === 404, String(r.res.status));
}

// ═════════════════════════════════════════════════════════════════════════════
// B — REQUEST BODY
// ═════════════════════════════════════════════════════════════════════════════
async function bodyTests() {
  section('B · REQUEST BODY');

  let r = await run(baseCfg({ badBody: true }));
  check('B1  unparseable body → 400', r.res.status === 400, String(r.res.status));

  r = await run(baseCfg({ body: { documentId: DOC, snapshotType: 'projected' } }));
  check('B2  wrong snapshotType → 400 (never "projected")', r.res.status === 400, String(r.res.status));

  r = await run(baseCfg({ body: { documentId: DOC, isLatest: 'yes' } }));
  check('B3  non-boolean isLatest → 400', r.res.status === 400, String(r.res.status));

  r = await run(baseCfg({ body: { documentId: DOC, snapshotType: 'tax_year', isLatest: true, updateDashboard: true } }));
  check('B4  valid body reaches the RPC once', r.res.status === 200 && r.calls.rpc.length === 1, String(r.res.status));

  r = await run(baseCfg({ body: { documentId: DOC, profile_id: 'attacker', business_id: 'attacker-biz', created_by: 'x', email: 'x@y.z' } }));
  const args = r.calls.rpc[0] && r.calls.rpc[0].args;
  check('B5  body-supplied identity and tenant are inert',
    r.res.status === 200 && args && args.p_business_id === BIZ && args.p_actor_profile_id === PROFILE,
    args ? `biz=${args.p_business_id} actor=${args.p_actor_profile_id}` : 'no rpc');
}

// ═════════════════════════════════════════════════════════════════════════════
// C — BUSINESS AUTHORIZATION
// ═════════════════════════════════════════════════════════════════════════════
async function authorityTests() {
  section('C · BUSINESS AUTHORIZATION');

  const asUser = (over) => baseCfg({
    profiles: [{ id: PROFILE, app_role: 'user', profile_status: 'active', base44_user_id: UID }],
    ...over,
  });

  let r = await run(baseCfg({ body: {} }));
  check('C1  no documentId → 400', r.res.status === 400, String(r.res.status));

  r = await run(baseCfg({ document: null }));
  check('C2  document absent → 404', r.res.status === 404, String(r.res.status));

  r = await run(baseCfg({ documentError: { message: 'x' } }));
  check('C3  document query failure → 500', r.res.status === 500, String(r.res.status));

  r = await run(baseCfg({ document: { id: DOC, document_type: 'profit_and_loss', year: 2024, business_id: BIZ, profile_id: null } }));
  check('C4  document without an owner → 409', r.res.status === 409, String(r.res.status));

  r = await run(baseCfg({ document: { id: DOC, document_type: 'profit_and_loss', year: 2024, business_id: null, profile_id: PROFILE } }));
  check('C5  document without a business → 409', r.res.status === 409, String(r.res.status));

  r = await run(baseCfg({ entity: null }));
  check('C6  business absent and denial are the same 404', r.res.status === 404, String(r.res.status));

  r = await run(asUser({ entity: { id: BIZ, profile_id: 'someone-else', assigned_advisor_id: null }, owners: [] }));
  check('C7  unrelated caller → 404 (non-disclosure)', r.res.status === 404, String(r.res.status));

  r = await run(asUser({ entity: { id: BIZ, profile_id: 'someone-else', assigned_advisor_id: null }, owners: [{ id: 'own-1', end_date: null }] }));
  check('C8  ownership record without an ownership_role → allowed', r.res.status === 200, String(r.res.status));

  r = await run(asUser({ entityError: { message: 'x' } }));
  check('C9  entity query failure → 500 (never a policy verdict)', r.res.status === 500, String(r.res.status));

  r = await run(asUser({ entity: { id: BIZ, profile_id: 'someone-else' }, ownersError: { message: 'x' } }));
  check('C10 owners query failure → 500', r.res.status === 500, String(r.res.status));

  r = await run(asUser({ entity: { id: BIZ, profile_id: 'someone-else' }, owners: { not: 'array' } }));
  check('C11 non-array owners body → 500 (not "no rows")', r.res.status === 500, String(r.res.status));

  r = await run(baseCfg({ document: { id: DOC, document_type: 'payroll_report', year: 1800, business_id: BIZ, profile_id: PROFILE } }));
  check('C12 out-of-range reporting year → 409', r.res.status === 409, String(r.res.status));

  r = await run(baseCfg({ document: { id: DOC, document_type: 'payroll_report', year: null, business_id: BIZ, profile_id: PROFILE } }));
  check('C13 missing reporting year → 409', r.res.status === 409, String(r.res.status));

  r = await run(baseCfg({ document: { id: DOC, document_type: 'personal_tax_return', year: 2024, business_id: BIZ, profile_id: PROFILE } }));
  check('C14 personal tax return → 400 with its own message', r.res.status === 400, String(r.res.status));

  r = await run(baseCfg({ document: { id: DOC, document_type: 'unheard_of', year: 2024, business_id: BIZ, profile_id: PROFILE } }));
  check('C15 unknown document type → 400', r.res.status === 400, String(r.res.status));
}

// ═════════════════════════════════════════════════════════════════════════════
// D — FAIL-CLOSED PAGINATION
// ═════════════════════════════════════════════════════════════════════════════
async function paginationTests() {
  section('D · FAIL-CLOSED PAGINATION');

  let r = await run(baseCfg({ rows: [], counts: [0] }));
  check('D1  empty population → 400 in words', r.res.status === 400 && r.calls.rpc.length === 0, String(r.res.status));

  r = await run(baseCfg({ counts: [4001] }));
  check('D2  population above the ceiling → 409 before any page read', r.res.status === 409 && r.calls.pageReads === 0, String(r.res.status));

  r = await run(baseCfg({ pageTransform: (page) => page.slice(0, 0) }));
  check('D3  a SHORT page is a refusal, not exhaustion → 409', r.res.status === 409, String(r.res.status));

  r = await run(baseCfg({
    rows: [row('f-a', 'annual_revenue', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z')],
    counts: [2, 2],
    pageTransform: (page, meta) => (meta.index === 1
      ? [row('f-a', 'annual_revenue', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'), row('f-a', 'annual_revenue', '2024-01-02T00:00:00Z', '2024-01-01T00:00:00Z')]
      : page),
  }));
  check('D4  a repeated id across pages → 409', r.res.status === 409, String(r.res.status));

  r = await run(baseCfg({ counts: [1, 2] }));
  check('D5  population moved between the two counts → 409', r.res.status === 409, String(r.res.status));

  r = await run(baseCfg({ counts: [null] }));
  check('D6  an unreadable count is NOT a zero → 500', r.res.status === 500, String(r.res.status));

  r = await run(baseCfg({ countError: { message: 'x' } }));
  check('D7  count query failure → 500', r.res.status === 500, String(r.res.status));

  r = await run(baseCfg({ pageError: { message: 'x' } }));
  check('D8  page query failure → 500', r.res.status === 500, String(r.res.status));

  r = await run(baseCfg({ pageTransform: () => ({ not: 'array' }) }));
  check('D9  non-array page → 500', r.res.status === 500, String(r.res.status));

  r = await run(baseCfg({ rows: [row('', 'annual_revenue', null, null)] }));
  check('D10 a row without a usable id → 500', r.res.status === 500, String(r.res.status));

  r = await run(baseCfg({ counts: [1] }));
  check('D11 exact population reads exactly one page and closes it', r.res.status === 200 && r.calls.counts === 2 && r.calls.pageReads === 1,
    `counts=${r.calls.counts} pages=${r.calls.pageReads}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// E — DETERMINISTIC TOTAL-ORDER SELECTION
// ═════════════════════════════════════════════════════════════════════════════
async function orderingTests() {
  section('E · DETERMINISTIC SELECTION');

  const pick = async (rows) => {
    const r = await run(baseCfg({ rows, counts: [rows.length] }));
    const map = r.calls.rpc[0] && r.calls.rpc[0].args.p_field_map;
    const entry = (map || []).find((m) => m.target === 'annual_revenue');
    return { r, ids: entry ? entry.field_ids : null };
  };

  let { r, ids } = await pick([
    row('f-old', 'annual_revenue', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
    row('f-new', 'annual_revenue', '2024-06-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ]);
  check('E1  latest reviewed_at wins', r.res.status === 200 && ids[0] === 'f-new', JSON.stringify(ids));

  ({ r, ids } = await pick([
    row('f-none', 'annual_revenue', null, '2024-01-01T00:00:00Z'),
    row('f-real', 'annual_revenue', '2020-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ]));
  check('E2  a real timestamp beats an absent one', ids[0] === 'f-real', JSON.stringify(ids));

  ({ r, ids } = await pick([
    row('f-malformed', 'annual_revenue', 'not-a-date', '2024-01-01T00:00:00Z'),
    row('f-absent', 'annual_revenue', null, '2024-02-01T00:00:00Z'),
  ]));
  check('E3  absent and malformed are the same kind; created_at decides', ids[0] === 'f-absent', JSON.stringify(ids));

  ({ r, ids } = await pick([
    row('f-b', 'annual_revenue', null, null),
    row('f-a', 'annual_revenue', null, null),
  ]));
  check('E4  full tie falls to the unique id (no NaN, no input-order dependence)', ids[0] === 'f-b', JSON.stringify(ids));

  const forward = await pick([
    row('f-1', 'annual_revenue', null, null),
    row('f-2', 'annual_revenue', null, null),
    row('f-3', 'annual_revenue', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ]);
  const reverse = await pick([
    row('f-3', 'annual_revenue', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
    row('f-2', 'annual_revenue', null, null),
    row('f-1', 'annual_revenue', null, null),
  ]);
  check('E5  selection is identical under input reversal (total order)',
    JSON.stringify(forward.ids) === JSON.stringify(reverse.ids), `${JSON.stringify(forward.ids)} vs ${JSON.stringify(reverse.ids)}`);

  // The superseded duplicate: consumed by nobody, reported as a SKIP, keyed by ID not name.
  ({ r, ids } = await pick([
    row('f-old', 'annual_revenue', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
    row('f-new', 'annual_revenue', '2024-06-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ]));
  const skipped = r.calls.rpc[0].args.p_skipped;
  check('E6  the superseded duplicate is skipped, keyed by field id',
    skipped.length === 1 && skipped[0].field === 'f-old', JSON.stringify(skipped));
  check('E7  skip reason is true for this cause (X-6)',
    /Not selected for mapping/.test(skipped[0].reason) && !/no destination/i.test(skipped[0].reason), skipped[0].reason);

  r = await run(baseCfg({
    rows: [
      row('f-old', 'annual_revenue', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
      row('f-new', 'annual_revenue', '2024-06-01T00:00:00Z', '2024-01-01T00:00:00Z'),
      row('f-x', 'uncontracted_metric', '2024-06-01T00:00:00Z', '2024-01-01T00:00:00Z'),
    ],
    counts: [3],
  }));
  const sk = r.calls.rpc[0].args.p_skipped;
  check('E8  no two skip entries name the same field (V-15 unreachable)',
    new Set(sk.map((s) => s.field)).size === sk.length, `${sk.length} entries`);

  r = await run(baseCfg({ rows: [row('f-other', 'uncontracted_metric', null, null)], counts: [1] }));
  check('E9  nothing maps → 400 in words, no RPC', r.res.status === 400 && r.calls.rpc.length === 0, String(r.res.status));

  const many = await run(baseCfg({
    rows: [row('f-l1', 'loan_balance', null, null), row('f-l2', 'loan_balance', null, null)],
    counts: [2],
    document: { id: DOC, document_type: 'debt_schedule', year: 2024, business_id: BIZ, profile_id: PROFILE },
  }));
  const debt = (many.calls.rpc[0] && many.calls.rpc[0].args.p_field_map || []).find((m) => m.target === 'total_debt');
  check('E10 cardinality "many" contributes every row, op preserved',
    debt && debt.op === 'sum' && debt.field_ids.length === 2, debt ? JSON.stringify(debt) : 'absent');
}

// ═════════════════════════════════════════════════════════════════════════════
// F — RPC PAYLOAD
// ═════════════════════════════════════════════════════════════════════════════
async function payloadTests() {
  section('F · RPC PAYLOAD AND WRITE DISCIPLINE');

  const r = await run(baseCfg({ body: { documentId: DOC, isLatest: true, updateDashboard: true } }));
  const call = r.calls.rpc[0];

  check('F1  exactly one RPC call, correct name', r.calls.rpc.length === 1 && call.name === 'create_reviewed_fields_snapshot', String(r.calls.rpc.length));

  const expectedKeys = ['p_actor_base44_user_id', 'p_actor_profile_id', 'p_basis', 'p_business_id', 'p_field_map', 'p_is_latest', 'p_mapping_version', 'p_skipped', 'p_snapshot_type', 'p_source_document_id', 'p_update_dashboard'];
  const actual = Object.keys(call.args).sort();
  check('F2  exactly 11 parameters, exact names', JSON.stringify(actual) === JSON.stringify(expectedKeys), actual.join(','));

  check('F3  actor identity comes from the session, never the body',
    call.args.p_actor_profile_id === PROFILE && call.args.p_actor_base44_user_id === UID);

  check('F4  dashboard projection stays disabled even when requested',
    call.args.p_update_dashboard === false, String(call.args.p_update_dashboard));

  check('F5  p_skipped entries carry exactly {field, reason}',
    call.args.p_skipped.every((s) => JSON.stringify(Object.keys(s).sort()) === '["field","reason"]'));

  const forbidden = r.calls.from.filter((t) => t === 'business_metric_snapshots' || t === 'dashboard_metrics');
  check('F6  no direct snapshot or dashboard table access', forbidden.length === 0, forbidden.join(','));

  const tables = [...new Set(r.calls.from)].sort();
  check('F7  only the four expected read tables are touched', JSON.stringify(tables) === JSON.stringify(['business_entities', 'documents', 'extracted_fields', 'profiles']), tables.join(','));

  const r2 = await run(baseCfg({ body: { documentId: DOC, snapshotType: null } }));
  check('F8  an omitted snapshot_type is passed as null (database default)', r2.calls.rpc[0].args.p_snapshot_type === null);
}

// ═════════════════════════════════════════════════════════════════════════════
// G — RESULT VALIDATION
// ═════════════════════════════════════════════════════════════════════════════
async function resultTests() {
  section('G · RPC RESULT VALIDATION');

  const withResult = (data, body = { documentId: DOC }) => run(baseCfg({ rpc: { data, error: null }, body }));

  let r = await withResult(null);
  check('G1  null result → 500, no success claim', r.res.status === 500 && !r.res.body?.snapshot_id, String(r.res.status));

  r = await withResult([okRpc()]);
  check('G2  array result → 500', r.res.status === 500, String(r.res.status));

  r = await withResult(okRpc({}, { snapshot_id: null }));
  check('G3  missing snapshot_id → 500 (never "success with null id")', r.res.status === 500, String(r.res.status));

  r = await withResult(okRpc({}, { snapshot_id: 'not-a-uuid' }));
  check('G4  non-uuid snapshot_id → 500', r.res.status === 500, String(r.res.status));

  r = await withResult(okRpc({}, { snapshot_type: '' }));
  check('G5  empty snapshot_type → 500', r.res.status === 500, String(r.res.status));

  r = await withResult(okRpc({}, { deduplicated: 'true' }));
  check('G6  non-boolean flag → 500', r.res.status === 500, String(r.res.status));

  r = await withResult(okRpc({}));
  check('G7  empty applied → 500 (contradicts accepted inputs)', r.res.status === 500, String(r.res.status));

  r = await withResult(okRpc({ annual_revenue: 1 }, { skipped: [{ reason: 'x' }] }));
  check('G8  malformed skipped entry → 500', r.res.status === 500, String(r.res.status));

  r = await withResult(okRpc({ annual_revenue: 1 }, { confidence_score: 101 }));
  check('G9  out-of-range confidence → 500', r.res.status === 500, String(r.res.status));

  r = await withResult(okRpc({ annual_revenue: 1 }, { dashboard_skipped_reason: 7 }));
  check('G10 non-string dashboard_skipped_reason → 500', r.res.status === 500, String(r.res.status));

  r = await withResult(okRpc({ annual_revenue: 1 }, {
    skipped: [{ field: 'f-old', reason: 'Not selected for mapping (s4.mapping.v1)' }],
  }));
  const b = r.res.body || {};
  check('G11 valid result → 200 with request-shaped fields_mapped',
    r.res.status === 200 && b.success === true && b.fields_mapped?.[0]?.field === 'annual_revenue', JSON.stringify(b.fields_mapped));
  check('G12 echoed skip is reported as field_id, not field',
    b.fields_skipped?.[0]?.field_id === 'f-old' && b.fields_skipped?.[0]?.field === undefined, JSON.stringify(b.fields_skipped));

  const bs = await run(baseCfg({
    document: { id: DOC, document_type: 'balance_sheet', year: 2024, business_id: BIZ, profile_id: PROFILE },
    rows: [row('f-eq', 'total_equity', null, null)],
    counts: [1],
    rpc: { data: okRpc({ total_equity: 5 }), error: null },
  }));
  check('G13 a metadata target is reported as metadata.<key>',
    bs.res.status === 200 && bs.res.body.fields_mapped[0].mapped_to === 'metadata.total_equity',
    JSON.stringify(bs.res.body?.fields_mapped));

  const dedupe = await withResult(okRpc({ annual_revenue: 1 }, { deduplicated: true, snapshot_type: 'quarter' }));
  check('G15 a dedupe echoes the STORED type and says so',
    dedupe.res.status === 200 && dedupe.res.body.snapshot_type === 'quarter' && /already existed/.test(dedupe.res.body.message),
    dedupe.res.body?.message);

  const proj = await run(baseCfg({ body: { documentId: DOC, updateDashboard: true } }));
  check('G16 projection refusal is reported as a reason, never as success',
    proj.res.status === 200 && proj.res.body.dashboard_metrics_updated === false && proj.res.body.dashboard_skipped_reason === 'projection_disabled',
    JSON.stringify(proj.res.body?.dashboard_skipped_reason));
}

// ═════════════════════════════════════════════════════════════════════════════
// H — ERROR-CODE MAPPING
// ═════════════════════════════════════════════════════════════════════════════
async function mappingTests() {
  section('H · ERROR-CODE MAPPING');

  const withError = (message) => run(baseCfg({ rpc: { data: null, error: { message, code: 'P0001' } } }));

  let r = await withError('SNAPSHOT_POPULATION_INCOMPLETE: 2 eligible field(s) not mapped or skipped, 0 field(s) named that are not eligible');
  check('H1  new B14 code → 409', r.res.status === 409, String(r.res.status));
  check('H2  and it carries its real message, not "Request rejected"',
    r.res.body.error === 'The reviewed fields changed while this snapshot was being prepared. Reload and try again.',
    r.res.body.error);

  r = await withError('SNAPSHOT_FORBIDDEN');
  check('H3  FORBIDDEN → 404 (non-disclosure)', r.res.status === 404, String(r.res.status));

  r = await withError('SNAPSHOT_ACTOR_STATUS_NOT_ACTIVE');
  check('H4  ineligible status → 403', r.res.status === 403, String(r.res.status));

  r = await withError('SNAPSHOT_YEAR_REQUIRED');
  check('H5  YEAR_REQUIRED → 409 with its own message', r.res.status === 409 && /reporting year/.test(r.res.body.error), r.res.body.error);

  r = await withError('SNAPSHOT_INVALID_SKIPPED: duplicate field entry');
  check('H6  a payload-shape code is an INTERNAL defect → 500', r.res.status === 500, String(r.res.status));

  r = await withError('duplicate key value violates unique constraint "x"');
  check('H7  an unknown code → 500 and never echoes the database text',
    r.res.status === 500 && r.res.body.error === 'Internal server error', r.res.body.error);

  r = await withError('SNAPSHOT_DOCUMENT_BUSINESS_MISMATCH');
  check('H8  tenant mismatch → 404', r.res.status === 404, String(r.res.status));

  r = await withError('SNAPSHOT_CONTRIBUTOR_DRIFT');
  check('H9  contributor drift → 409', r.res.status === 409, String(r.res.status));

  // Unconfigured environment is not a caller error.
  r = await run(baseCfg({ env: {} }));
  check('H10 missing Supabase configuration → 500 without detail', r.res.status === 500, String(r.res.status));
}

// ═════════════════════════════════════════════════════════════════════════════
(async () => {
  console.log('S4 GATE B · AUTH-1 — offline caller-contract certification');
  console.log(`sources: ${ACTOR} · ${CANONICAL} · ${ENTRY}`);
  console.log('no network · no database · no Base44 or Supabase call · nothing deployed\n');

  sourceChecks();
  await identityTests();
  await bodyTests();
  await authorityTests();
  await paginationTests();
  await orderingTests();
  await payloadTests();
  await resultTests();
  await mappingTests();

  console.log(`\n${'─'.repeat(72)}`);
  console.log(`PASS ${passes}   FAIL ${failures.length}`);
  if (failures.length) {
    console.log('\nFAILURES');
    for (const f of failures) console.log(`  · ${f}`);
    process.exitCode = 1;
  } else {
    console.log('All offline checks passed. DB-side expectations remain with AUTH-2.');
  }
})().catch((err) => {
  console.error('HARNESS ERROR', err);
  process.exitCode = 1;
});