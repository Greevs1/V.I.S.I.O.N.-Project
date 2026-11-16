/**
 * getDocumentsAdmin.s3.mock.test.cjs — Phase S3 OFFLINE handler harness.
 *
 * Executes the REAL patched source of getDocumentsAdmin and its REAL canonical
 * authorization chain against an IN-MEMORY mock database. Nothing leaves the
 * process: no network, no Supabase, no Base44 entity, no live record.
 *
 *   Real code under test (transpiled from TypeScript at run time):
 *     base44/functions/getDocumentsAdmin/entry.ts        (handler + loadAuthorizedDocument)
 *     base44/shared/authz/actor.ts                       (authenticateActor, authorizeBusinessAccess)
 *     base44/shared/authz/documentAccess.ts              (decision module)
 *     base44/shared/businessScope/activeBusiness.ts      (assertBusinessAccess)
 *     base44/shared/businessScope/writeGuard.ts          (validateBusinessScope — revocation rule)
 *
 *   Stubbed (the ONLY substitutions):
 *     npm:@base44/sdk            → createClientFromRequest returns a fixed session user
 *     npm:@supabase/supabase-js  → createClient returns the in-memory mock
 *     Deno.serve / Deno.env      → captures the handler / fixed fake env
 *
 * The mock records EVERY operation in order, including every delete and every
 * createSignedUrl, so "denied requests never reach delete" is OBSERVED.
 *
 * Usage:  const { run } = require('./getDocumentsAdmin.s3.mock.test.cjs'); await run('/app')
 *    or:  node src/scripts/getDocumentsAdmin.s3.mock.test.cjs
 */

const fs = require('fs');
const path = require('path');

const FILES = {
  entry: 'base44/functions/getDocumentsAdmin/entry.ts',
  actor: 'base44/shared/authz/actor.ts',
  docAccess: 'base44/shared/authz/documentAccess.ts',
  active: 'base44/shared/businessScope/activeBusiness.ts',
  guard: 'base44/shared/businessScope/writeGuard.ts',
};

// ── Fixtures ────────────────────────────────────────────────────────────────
function fixtures() {
  return {
    profiles: [
      { id: 'p-owner', base44_user_id: 'u-owner', email: 'owner@t', app_role: 'owner', primary_business_id: 'b-1' },
      { id: 'p-other', base44_user_id: 'u-other', email: 'other@t', app_role: 'owner', primary_business_id: 'b-2' },
      { id: 'p-advisor', base44_user_id: 'u-advisor', email: 'adv@t', app_role: 'advisor' },
      { id: 'p-revoked', base44_user_id: 'u-revoked', email: 'rev@t', app_role: 'advisor' },
      { id: 'p-unrel-adv', base44_user_id: 'u-unrel-adv', email: 'unadv@t', app_role: 'advisor' },
      { id: 'p-team', base44_user_id: 'u-team', email: 'team@t', app_role: 'team_member' },
      { id: 'p-assignee', base44_user_id: 'u-assignee', email: 'asg@t', app_role: 'owner' },
      { id: 'p-stranger', base44_user_id: 'u-stranger', email: 'str@t', app_role: 'owner' },
      { id: 'p-admin', base44_user_id: 'u-admin', email: 'admin@t', app_role: 'admin' },
      { id: 'p-super', base44_user_id: 'u-super', email: 'super@t', app_role: 'super_admin' },
      { id: 'p-expert-active', base44_user_id: 'u-expert-active', email: 'exa@t', app_role: 'expert_advisor' },
      { id: 'p-expert-revoked', base44_user_id: 'u-expert-revoked', email: 'exr@t', app_role: 'expert_advisor' },
      { id: 'p-expert-pending', base44_user_id: 'u-expert-pending', email: 'exp@t', app_role: 'expert_advisor' },
    ],
    business_entities: [
      { id: 'b-1', business_name: 'Own Co', profile_id: 'p-owner', assigned_advisor_id: null },
      { id: 'b-2', business_name: 'Foreign Co', profile_id: 'p-other', assigned_advisor_id: 'p-advisor' },
    ],
    business_team_members: [{ id: 't-1', profile_id: 'p-team', business_id: 'b-2' }],
    business_owners: [],
    advisor_assignments: [{ id: 'aa-1', advisor_profile_id: 'p-revoked', business_id: 'b-2', status: 'revoked' }],
    // S3.0.2 — the relationship grants business scope ONLY while ACTIVE.
    expert_advisor_access: [
      { id: 'eaa-active', expert_profile_id: 'p-expert-active', client_profile_id: 'p-other', business_id: 'b-2', access_status: 'active', revoked_at: null },
      { id: 'eaa-revoked', expert_profile_id: 'p-expert-revoked', client_profile_id: 'p-other', business_id: 'b-2', access_status: 'revoked', revoked_at: '2026-01-05T00:00:00Z' },
      { id: 'eaa-pending', expert_profile_id: 'p-expert-pending', client_profile_id: 'p-other', business_id: 'b-2', access_status: 'pending', revoked_at: null },
    ],
    // An assignment row exists — and must grant NOTHING.
    document_assignments: [{ id: 'da-1', document_id: 'd-foreign', assignee_profile_id: 'p-assignee' }],
    documents: [
      { id: 'd-own', name: 'own.pdf', profile_id: 'p-owner', business_id: 'b-1', storage_bucket: 'documents', file_path: 'p-owner/own.pdf', created_at: '2026-01-03' },
      { id: 'd-foreign', name: 'foreign.pdf', profile_id: 'p-other', business_id: 'b-2', storage_bucket: 'documents', file_path: 'p-other/foreign.pdf', created_at: '2026-01-02' },
      { id: 'd-nobiz', name: 'nobiz.pdf', profile_id: 'p-other', business_id: null, storage_bucket: 'documents', file_path: 'p-other/nobiz.pdf', created_at: '2026-01-01' },
      { id: 'd-lib', name: 'lib.pdf', profile_id: 'p-admin', business_id: null, storage_bucket: 'consulting_library_files', file_scope: 'consulting_library', file_path: 'lib/lib.pdf', created_at: '2026-01-04' },
    ],
  };
}

const USERS = {
  owner: { id: 'u-owner', email: 'owner@t', role: 'user' },
  other: { id: 'u-other', email: 'other@t', role: 'user' },
  advisor: { id: 'u-advisor', email: 'adv@t', role: 'user' },
  revoked: { id: 'u-revoked', email: 'rev@t', role: 'user' },
  unrelAdvisor: { id: 'u-unrel-adv', email: 'unadv@t', role: 'user' },
  team: { id: 'u-team', email: 'team@t', role: 'user' },
  assignee: { id: 'u-assignee', email: 'asg@t', role: 'user' },
  stranger: { id: 'u-stranger', email: 'str@t', role: 'user' },
  admin: { id: 'u-admin', email: 'admin@t', role: 'admin' },
  superAdmin: { id: 'u-super', email: 'super@t', role: 'user' },
  expertActive: { id: 'u-expert-active', email: 'exa@t', role: 'user' },
  expertRevoked: { id: 'u-expert-revoked', email: 'exr@t', role: 'user' },
  expertPending: { id: 'u-expert-pending', email: 'exp@t', role: 'user' },
  anonymous: null,
};

// ── In-memory Supabase mock (records every op) ─────────────────────────────
function createMockSupabase(db, log) {
  function builder(table) {
    const st = { table, op: 'select', filters: [], limit: null, order: null };
    const match = (row) => st.filters.every(([kind, col, val]) =>
      kind === 'eq' ? row[col] === val
        // `.is(col, null)` — PostgREST's `col IS NULL`, used by the relationship
        // lookup to exclude partially-revoked rows.
        : kind === 'is' ? (row[col] ?? null) === val
          : String(row[col] ?? '').toLowerCase() === String(val).toLowerCase());
    const exec = () => {
      const rows = (db[table] || []).filter(match);
      log.push({ kind: st.op, table, filters: st.filters.map((f) => f.slice()), limit: st.limit });
      if (st.op === 'delete') {
        db[table] = (db[table] || []).filter((r) => !match(r));
        return { data: null, error: null };
      }
      let out = rows.slice();
      if (st.order) out.sort((a, b) => String(b[st.order]).localeCompare(String(a[st.order])));
      if (st.limit != null) out = out.slice(0, st.limit);
      return { data: out, error: null };
    };
    const b = {
      select() { return b; },
      delete() { st.op = 'delete'; return b; },
      eq(col, val) { st.filters.push(['eq', col, val]); return b; },
      ilike(col, val) { st.filters.push(['ilike', col, val]); return b; },
      is(col, val) { st.filters.push(['is', col, val]); return b; },
      order(col) { st.order = col; return b; },
      limit(n) { st.limit = n; return b; },
      async maybeSingle() { const r = exec(); return { data: (r.data && r.data[0]) || null, error: null }; },
      then(res, rej) { return Promise.resolve().then(exec).then(res, rej); },
    };
    return b;
  }
  return {
    from: builder,
    storage: {
      from(bucket) {
        return {
          async createSignedUrl(p, ttl) {
            log.push({ kind: 'createSignedUrl', bucket, path: p, ttl });
            return { data: { signedUrl: `mock://${bucket}/${p}?ttl=${ttl}` }, error: null };
          },
        };
      },
    },
  };
}

// ── Load the REAL source, transpiled, with only the SDK imports stubbed ─────
function loadHandler(root, state) {
  const ts = require(path.join(root, 'node_modules/typescript'));
  const cache = {};

  const ResponseImpl = (typeof Response !== 'undefined' && typeof Response.json === 'function')
    ? Response
    : { json: (body, init = {}) => ({ status: init.status || 200, async json() { return body; } }) };

  let captured = null;
  const Deno = {
    serve(h) { captured = h; },
    env: { get: (k) => ({ VITE_SUPABASE_URL: 'https://mock.supabase.local', SUPABASE_SERVICE_ROLE_KEY: 'mock-key' }[k]) },
  };

  const stubs = {
    'npm:@base44/sdk@0.8.31': { createClientFromRequest: (req) => ({ auth: { me: async () => req.__user } }) },
    'npm:@supabase/supabase-js@2': { createClient: () => state.sb },
  };

  function load(abs) {
    if (cache[abs]) return cache[abs].exports;
    const src = fs.readFileSync(abs, 'utf8');
    const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const mod = { exports: {} };
    cache[abs] = mod;
    const req = (spec) => {
      if (stubs[spec]) return stubs[spec];
      if (spec.startsWith('.')) return load(path.resolve(path.dirname(abs), spec));
      throw new Error(`unexpected import ${spec} in ${abs}`);
    };
    const quiet = { log() {}, error() {}, warn() {}, info() {} };
    new Function('exports', 'require', 'module', 'Deno', 'Response', 'console', js)(mod.exports, req, mod, Deno, ResponseImpl, quiet);
    return mod.exports;
  }

  load(path.join(root, FILES.entry));
  if (!captured) throw new Error('Deno.serve handler was not captured');
  return captured;
}

// ── Runner ──────────────────────────────────────────────────────────────────
async function run(root = path.join(__dirname, '..', '..')) {
  const state = { db: null, log: null, sb: null };
  const handler = loadHandler(root, state);

  const results = [];
  async function call(label, user, body, expect) {
    state.db = fixtures();
    state.log = [];
    state.sb = createMockSupabase(state.db, state.log);
    const res = await handler({ __user: user, json: async () => body });
    const payload = await res.json();
    const deletes = state.log.filter((o) => o.kind === 'delete');
    const signs = state.log.filter((o) => o.kind === 'createSignedUrl');
    const listQueries = state.log.filter((o) => o.kind === 'select' && o.table === 'documents' && o.limit != null);
    const ctx = { status: res.status, payload, deletes, signs, listQueries, log: state.log, db: state.db };
    const failures = expect(ctx) || [];
    results.push({ label, ok: failures.length === 0, status: res.status, failures });
  }

  const want = (cond, msg) => (cond ? null : msg);
  const all = (...xs) => xs.filter(Boolean);
  const noSideEffects = (c) => all(want(c.deletes.length === 0, `delete executed (${c.deletes.length})`), want(c.signs.length === 0, `createSignedUrl executed (${c.signs.length})`));
  const denied404 = (c) => all(want(c.status === 404, `status ${c.status} != 404`), want(!('signedUrl' in c.payload), 'url leaked'), ...noSideEffects(c));
  const forged = { business_id: 'b-1', target_business_id: 'b-1', profile_id: 'p-admin', user_id: 'u-admin', _router_user_email: 'admin@t', target_profile_id: 'p-admin' };

  // ── VIEW (getSignedUrl) ──
  const V = (doc, extra = {}) => ({ action: 'getSignedUrl', document_id: doc, ...extra });
  const allowSign = (c) => all(want(c.status === 200, `status ${c.status}`), want(c.signs.length === 1, 'no signed url'), want(c.signs[0] && c.signs[0].ttl === 900, 'ttl changed'), want(c.deletes.length === 0, 'delete executed'));
  await call('VIEW owner + own document → allow', USERS.owner, V('d-own'), allowSign);
  await call('VIEW owner + foreign document → deny', USERS.owner, V('d-foreign'), denied404);
  await call('VIEW active assigned advisor → allow (existing semantics)', USERS.advisor, V('d-foreign'), allowSign);
  await call('VIEW team member (authorized business) → allow (existing semantics)', USERS.team, V('d-foreign'), allowSign);
  await call('VIEW unrelated advisor → deny', USERS.unrelAdvisor, V('d-foreign'), denied404);
  await call('VIEW revoked advisor → deny (canonical validateBusinessScope)', USERS.revoked, V('d-foreign'), (c) => all(
    ...denied404(c),
    want(c.log.some((o) => o.table === 'advisor_assignments'), 'revocation rule was not consulted')));
  // ── S3.0.2 — expert relationship LIFECYCLE (expert_advisor_access) ──
  await call('VIEW expert with ACTIVE relationship → allow (existing semantics)', USERS.expertActive, V('d-foreign'), (c) => all(
    ...allowSign(c),
    want(c.log.some((o) => o.table === 'expert_advisor_access'), 'relationship was not consulted')));
  await call('VIEW expert AFTER REVOKE → deny', USERS.expertRevoked, V('d-foreign'), (c) => all(
    ...denied404(c),
    want(c.log.some((o) => o.table === 'expert_advisor_access'), 'relationship was not consulted')));
  await call('VIEW expert with PENDING relationship → deny', USERS.expertPending, V('d-foreign'), denied404);
  await call('VIEW unrelated user → deny', USERS.stranger, V('d-foreign'), denied404);
  await call('VIEW document assignee without business access → deny', USERS.assignee, V('d-foreign'), denied404);
  await call('VIEW null business_id (non-owner) → deny', USERS.stranger, V('d-nobiz'), denied404);
  await call('VIEW nonexistent document → deny', USERS.owner, V('00000000-0000-0000-0000-000000000000'), denied404);
  await call('VIEW invalid identifier → 400, no side effects', USERS.owner, V(12345), (c) => all(want(c.status === 400, `status ${c.status}`), ...noSideEffects(c)));
  await call('VIEW mismatched caller business_id cannot grant (stranger forges b-1/admin ids)', USERS.stranger, V('d-foreign', forged), denied404);
  await call('VIEW mismatched caller business_id cannot revoke (advisor sends b-1)', USERS.advisor, V('d-foreign', { business_id: 'b-1', target_business_id: 'b-1' }), (c) => all(
    ...allowSign(c), want(c.signs[0] && c.signs[0].path === 'p-other/foreign.pdf', 'path not from document row')));
  await call('VIEW caller-supplied file_path/bucket ignored', USERS.owner, V('d-own', { file_path: 'p-other/foreign.pdf', bucket: 'consulting_library_files', storage_bucket: 'x' }), (c) => all(
    ...allowSign(c), want(c.signs[0] && c.signs[0].path === 'p-owner/own.pdf' && c.signs[0].bucket === 'documents', 'caller path/bucket used')));
  await call('VIEW unauthenticated → 401, no side effects', USERS.anonymous, V('d-own'), (c) => all(want(c.status === 401, `status ${c.status}`), ...noSideEffects(c)));

  // ── DELETE ──
  const D = (doc, extra = {}) => ({ action: 'delete', document_id: doc, ...extra });
  const allowDelete = (id) => (c) => all(
    want(c.status === 200 && c.payload.success === true, `status ${c.status}`),
    want(c.deletes.length === 1, `delete count ${c.deletes.length}`),
    want(c.deletes[0] && c.deletes[0].filters.length === 1 && c.deletes[0].filters[0][1] === 'id' && c.deletes[0].filters[0][2] === id, 'delete not scoped to authorized row id'),
    want(c.log.findIndex((o) => o.kind === 'select' && o.table === 'documents') < c.log.findIndex((o) => o.kind === 'delete'), 'row not loaded before delete'),
    want(!c.db.documents.some((d) => d.id === id), 'row not removed in mock'),
    want(c.db.documents.length === 3, 'other rows affected'));
  const deniedDelete = (c) => all(...denied404(c), want(c.db.documents.length === 4, 'mock row count changed'));
  await call('DEL owner-of-record → allow (reaches delete branch)', USERS.owner, D('d-own'), allowDelete('d-own'));
  await call('DEL admin → allow', USERS.admin, D('d-foreign'), allowDelete('d-foreign'));
  await call('DEL super_admin (profiles.app_role) → allow', USERS.superAdmin, D('d-foreign'), allowDelete('d-foreign'));
  await call('DEL active assigned advisor → deny before delete', USERS.advisor, D('d-foreign'), deniedDelete);
  await call('DEL revoked advisor → deny before delete', USERS.revoked, D('d-foreign'), deniedDelete);
  await call('DEL unrelated advisor → deny before delete', USERS.unrelAdvisor, D('d-foreign'), deniedDelete);
  await call('DEL team member (not owner/admin) → deny before delete', USERS.team, D('d-foreign'), deniedDelete);
  await call('DEL document assignee → deny before delete', USERS.assignee, D('d-foreign'), deniedDelete);
  await call('DEL unrelated user → deny before delete', USERS.stranger, D('d-foreign'), deniedDelete);
  await call('DEL owner + foreign document → deny before delete', USERS.owner, D('d-foreign'), deniedDelete);
  await call('DEL nonexistent UUID → deny before delete', USERS.owner, D('00000000-0000-0000-0000-000000000000'), deniedDelete);
  await call('DEL forged admin identity in body → deny before delete', USERS.stranger, D('d-foreign', forged), deniedDelete);
  await call('DEL unauthenticated → 401, no delete', USERS.anonymous, D('d-own'), (c) => all(want(c.status === 401, `status ${c.status}`), ...noSideEffects(c)));
  await call('DEL missing document_id → 400, no delete', USERS.owner, { action: 'delete' }, (c) => all(want(c.status === 400, `status ${c.status}`), ...noSideEffects(c)));

  // ── QUERY ──
  const idsOf = (c) => (c.payload.documents || []).map((d) => d.id).sort().join(',');
  const noList = (c) => want(c.listQueries.length === 0, 'document list query was executed');
  await call('QUERY admin default (consulting_library_files) → scoped result', USERS.admin, {}, (c) => all(
    want(c.status === 200, `status ${c.status}`), want(idsOf(c) === 'd-lib', `got ${idsOf(c)}`),
    want(c.listQueries[0] && c.listQueries[0].filters.some((f) => f[1] === 'file_scope' && f[2] === 'consulting_library'), 'library scope missing')));
  await call('QUERY admin documents bucket + business → scoped result', USERS.admin, { bucket: 'documents', target_business_id: 'b-2' }, (c) => all(
    want(c.status === 200, `status ${c.status}`), want(idsOf(c) === 'd-foreign', `got ${idsOf(c)}`)));
  await call("QUERY bucket = 'x' → reject, no query executed", USERS.admin, { bucket: 'x', limit: 200 }, (c) => all(want(c.status === 400, `status ${c.status}`), noList(c)));
  await call("QUERY bucket = '' → reject, no query executed", USERS.admin, { bucket: '' }, (c) => all(want(c.status === 400, `status ${c.status}`), noList(c)));
  await call('QUERY bucket = null → reject, no query executed', USERS.admin, { bucket: null }, (c) => all(want(c.status === 400, `status ${c.status}`), noList(c)));
  // ── S3.1 — the bucket vocabulary is now the SHARED policy ──
  // 'documents' and 'consulting_library_files' behave exactly as before; the
  // shared policy additionally recognises 'client-documents' as an approved
  // bucket, so that request is no longer refused and is scoped to THAT bucket
  // (the reported S3.1 behaviour expansion for this function's query action).
  await call('QUERY bucket = client-documents → accepted by the shared policy, scoped to THAT bucket', USERS.admin, { bucket: 'client-documents' }, (c) => all(
    want(c.status === 200, `status ${c.status}`),
    want(c.listQueries.length === 1, 'listing query not executed'),
    want(c.listQueries[0].filters.some((f) => f[1] === 'storage_bucket' && f[2] === 'client-documents'), 'client-documents scope missing'),
    want(idsOf(c) === '', `unexpected rows: ${idsOf(c)}`)));
  await call("QUERY unknown bucket as non-admin → reject", USERS.advisor, { bucket: 'x', target_business_id: 'b-2' }, (c) => all(want(c.status === 400, `status ${c.status}`), noList(c)));
  await call('QUERY authorized advisor + own assigned business → scoped result', USERS.advisor, { bucket: 'documents', target_business_id: 'b-2' }, (c) => all(
    want(c.status === 200, `status ${c.status}`), want(idsOf(c) === 'd-foreign', `got ${idsOf(c)}`)));
  await call('QUERY advisor with no business → 403 (no global listing)', USERS.advisor, { bucket: 'documents' }, (c) => all(want(c.status === 403, `status ${c.status}`), noList(c)));
  await call('QUERY advisor → unrelated business → 403', USERS.advisor, { bucket: 'documents', target_business_id: 'b-1' }, (c) => all(want(c.status === 403, `status ${c.status}`), noList(c)));
  await call('QUERY revoked advisor → former business → 403', USERS.revoked, { bucket: 'documents', target_business_id: 'b-2' }, (c) => all(want(c.status === 403, `status ${c.status}`), noList(c)));
  await call('QUERY active expert → assigned business → scoped result', USERS.expertActive, { bucket: 'documents', target_business_id: 'b-2' }, (c) => all(
    want(c.status === 200, `status ${c.status}`), want(idsOf(c) === 'd-foreign', `got ${idsOf(c)}`)));
  await call('QUERY revoked expert → former business → 403', USERS.expertRevoked, { bucket: 'documents', target_business_id: 'b-2' }, (c) => all(want(c.status === 403, `status ${c.status}`), noList(c)));
  await call('QUERY unrelated user → 403', USERS.stranger, { bucket: 'documents', target_business_id: 'b-2' }, (c) => all(want(c.status === 403, `status ${c.status}`), noList(c)));
  await call('QUERY filters cannot broaden (target_profile_id of foreign owner)', USERS.advisor, { bucket: 'documents', target_business_id: 'b-2', target_profile_id: 'p-owner' }, (c) => all(
    want(c.status === 200, `status ${c.status}`), want(idsOf(c) === '', `leaked ${idsOf(c)}`),
    want(c.listQueries[0] && c.listQueries[0].filters.some((f) => f[1] === 'business_id' && f[2] === 'b-2'), 'business constraint missing')));
  await call('QUERY huge limit is clamped to 200 and scope kept', USERS.advisor, { bucket: 'documents', target_business_id: 'b-2', limit: 999999 }, (c) => all(
    want(c.status === 200, `status ${c.status}`), want(c.listQueries[0] && c.listQueries[0].limit === 200, `limit ${c.listQueries[0] && c.listQueries[0].limit}`), want(idsOf(c) === 'd-foreign', `got ${idsOf(c)}`)));
  await call('QUERY forged admin identity in body does not elevate', USERS.stranger, { bucket: 'documents', ...forged, target_business_id: 'b-2' }, (c) => all(want(c.status === 403, `status ${c.status}`), noList(c)));
  await call('QUERY unauthenticated → 401', USERS.anonymous, {}, (c) => all(want(c.status === 401, `status ${c.status}`), noList(c)));

  const failed = results.filter((r) => !r.ok);
  return { total: results.length, passed: results.length - failed.length, failed: failed.length, results };
}

module.exports = { run };

if (require.main === module) {
  run().then((r) => {
    r.results.forEach((x) => console.log(`${x.ok ? 'PASS' : 'FAIL'}  [${x.status}] ${x.label}${x.ok ? '' : ' — ' + x.failures.join('; ')}`));
    console.log(`\n${r.passed}/${r.total} passed`);
    process.exit(r.failed ? 1 : 0);
  });
}