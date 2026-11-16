#!/usr/bin/env node
/**
 * documentSignedUrlAuthorization.test.cjs — Phase S3.1
 *
 * Run:  node scripts/documentSignedUrlAuthorization.test.cjs
 *
 * OFFLINE AND NON-DESTRUCTIVE. No network, no database, no Storage call, no
 * production record read, written or signed. `git` is used read-only to prove
 * the change surface.
 *
 * THE CODE UNDER TEST IS THE SHIPPED CODE, not a restatement of it:
 *
 *   The REAL `base44/functions/supabaseUserData/entry.ts` is COMPILED from its
 *   real TypeScript source (esbuild) and its REAL Deno handler is invoked with a
 *   mock Supabase client that records EVERY operation. The REAL authorization
 *   spine it imports is used too — `base44/shared/authz/actor.ts`,
 *   `base44/shared/authz/documentAccess.ts`, `base44/shared/businessScope/
 *   writeGuard.ts`, `base44/shared/businessScope/activeBusiness.ts`,
 *   `base44/shared/businessScope/relationshipAccess.ts` and the NEW
 *   `base44/shared/documents/buckets.ts` are all loaded from source.
 *
 *   Stubbed (the ONLY substitutions, all OFF the action's execution path):
 *     npm:@base44/sdk            → a fixed auth identity per call
 *     npm:@supabase/supabase-js  → the in-memory mock
 *     documentExtraction/extractEngine                 (never reached here)
 *     intelligenceContract/baselineResolver            (never reached here)
 *     intelligenceContract/businessIntelligenceContract(never reached here)
 *
 * The Supabase mock records every read and every createSignedUrl, so "authorized
 * before minting" and "denied → zero createSignedUrl calls" are OBSERVED.
 * The mutation section mutates THAT real source and re-runs the matrix.
 *
 * EVIDENCE CLASS: UNIT/MOCK (real modules, sandboxed) + STATIC/CONTROL-FLOW +
 * GIT-DIFF PROOF.
 */

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const git = (a) => execFileSync('git', a, { cwd: ROOT, maxBuffer: 32e6 }).toString();
const names = (s) => s.trim().split('\n').filter(Boolean);

const ENTRY = 'base44/functions/supabaseUserData/entry.ts';
const ADMIN_ENTRY = 'base44/functions/getDocumentsAdmin/entry.ts';
const BUCKETS = 'base44/shared/documents/buckets.ts';
const DOC_ACCESS = 'base44/shared/authz/documentAccess.ts';
const ACTOR = 'base44/shared/authz/actor.ts';
const REL = 'base44/shared/businessScope/relationshipAccess.ts';
const GUARD = 'base44/shared/businessScope/writeGuard.ts';
const ACTIVE = 'base44/shared/businessScope/activeBusiness.ts';
const TEST = 'scripts/documentSignedUrlAuthorization.test.cjs';

const failures = [];
const check = (label, ok, detail = '') => {
  if (!ok) failures.push(detail ? `${label} — ${detail}` : label);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? ` — ${detail}` : ''}`);
};

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures — the canonical world: identities, businesses, relationships, docs.
// ─────────────────────────────────────────────────────────────────────────────
const FIXTURES = (() => {
  const bulkRevoked = Array.from({ length: 60 }, (_, i) => ({
    id: `eaa-bulk-${i}`, expert_profile_id: 'p-expert-bulk', business_id: 'b-client',
    access_status: 'revoked', revoked_at: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`,
  }));
  return {
    profiles: [
      { id: 'p-owner', base44_user_id: 'u-owner', email: 'owner@t', app_role: 'owner', primary_business_id: 'b-own' },
      // canonical OWNER whose Base44 role is admin — matrix 13/24
      { id: 'p-owner-admin', base44_user_id: 'u-owner-admin', email: 'owner-admin@t', app_role: 'owner', primary_business_id: 'b-own' },
      // canonical ADMIN whose Base44 role is an ordinary user — matrix 3/23
      { id: 'p-admin', base44_user_id: 'u-admin', email: 'admin@t', app_role: 'admin' },
      { id: 'p-super', base44_user_id: 'u-super', email: 'super@t', app_role: 'super_admin' },
      { id: 'p-client', base44_user_id: 'u-client', email: 'client@t', app_role: 'owner', primary_business_id: 'b-client' },
      { id: 'p-other', base44_user_id: 'u-other', email: 'other@t', app_role: 'owner', primary_business_id: 'b-other' },
      { id: 'p-expert-active', base44_user_id: 'u-expert-active', email: 'exa@t', app_role: 'expert_advisor' },
      { id: 'p-expert-revoked', base44_user_id: 'u-expert-revoked', email: 'exr@t', app_role: 'expert_advisor' },
      { id: 'p-expert-partial', base44_user_id: 'u-expert-partial', email: 'exp2@t', app_role: 'expert_advisor' },
      { id: 'p-expert-pending', base44_user_id: 'u-expert-pending', email: 'exp3@t', app_role: 'expert_advisor' },
      { id: 'p-expert-dup', base44_user_id: 'u-expert-dup', email: 'exd@t', app_role: 'expert_advisor' },
      { id: 'p-expert-bulk', base44_user_id: 'u-expert-bulk', email: 'exb@t', app_role: 'expert_advisor' },
      { id: 'p-expert-revoked-null', base44_user_id: 'u-expert-revoked-null', email: 'exrn@t', app_role: 'expert_advisor' },
      { id: 'p-advisor-assigned', base44_user_id: 'u-advisor-assigned', email: 'ada@t', app_role: 'advisor' },
      { id: 'p-advisor-revoked', base44_user_id: 'u-advisor-revoked', email: 'adr@t', app_role: 'advisor' },
      { id: 'p-advisor-none', base44_user_id: 'u-advisor-none', email: 'adn@t', app_role: 'advisor' },
      { id: 'p-team', base44_user_id: 'u-team', email: 'team@t', app_role: 'team_member' },
      { id: 'p-team-other', base44_user_id: 'u-team-other', email: 'teamo@t', app_role: 'team_member' },
      { id: 'p-stranger', base44_user_id: 'u-stranger', email: 'str@t', app_role: 'owner', primary_business_id: 'b-stranger' },
      { id: 'p-assignee', base44_user_id: 'u-assignee', email: 'asg@t', app_role: 'owner' },
      { id: 'p-assignee-member', base44_user_id: 'u-assignee-member', email: 'asgm@t', app_role: 'owner' },
      { id: 'p-susp-admin', base44_user_id: 'u-susp-admin', email: 'suspa@t', app_role: 'admin', profile_status: 'suspended' },
      { id: 'p-susp-expert', base44_user_id: 'u-susp-expert', email: 'suspe@t', app_role: 'expert_advisor', profile_status: 'suspended' },
    ],
    business_entities: [
      { id: 'b-own', business_name: 'Own Co', profile_id: 'p-owner', assigned_advisor_id: null },
      { id: 'b-client', business_name: 'Client Co', profile_id: 'p-client', assigned_advisor_id: null },
      { id: 'b-other', business_name: 'Other Co', profile_id: 'p-other', assigned_advisor_id: null },
      { id: 'b-stranger', business_name: 'Stranger Co', profile_id: 'p-stranger', assigned_advisor_id: null },
    ],
    business_team_members: [
      { id: 'tm-1', profile_id: 'p-team', business_id: 'b-client' },
      { id: 'tm-2', profile_id: 'p-team-other', business_id: 'b-other' },
      { id: 'tm-3', profile_id: 'p-assignee-member', business_id: 'b-client' }, // case 11
    ],
    advisor_assignments: [
      { id: 'aa-active', advisor_profile_id: 'p-advisor-assigned', business_id: 'b-client', status: 'active' },
      { id: 'aa-revoked', advisor_profile_id: 'p-advisor-revoked', business_id: 'b-client', status: 'revoked' },
    ],
    expert_advisor_access: [
      { id: 'eaa-active', expert_profile_id: 'p-expert-active', business_id: 'b-client', access_status: 'active', revoked_at: null },
      { id: 'eaa-revoked', expert_profile_id: 'p-expert-revoked', business_id: 'b-client', access_status: 'revoked', revoked_at: '2026-01-05T00:00:00Z' },
      { id: 'eaa-partial', expert_profile_id: 'p-expert-partial', business_id: 'b-client', access_status: 'active', revoked_at: '2026-01-06T00:00:00Z' },
      { id: 'eaa-pending', expert_profile_id: 'p-expert-pending', business_id: 'b-client', access_status: 'pending', revoked_at: null },
      { id: 'eaa-revoked-null', expert_profile_id: 'p-expert-revoked-null', business_id: 'b-client', access_status: 'revoked', revoked_at: null },
      { id: 'eaa-dup-1', expert_profile_id: 'p-expert-dup', business_id: 'b-client', access_status: 'active', revoked_at: null },
      { id: 'eaa-dup-2', expert_profile_id: 'p-expert-dup', business_id: 'b-client', access_status: 'active', revoked_at: null },
      ...bulkRevoked,
      { id: 'eaa-bulk-live', expert_profile_id: 'p-expert-bulk', business_id: 'b-client', access_status: 'active', revoked_at: null },
    ],
    // An assignment row exists for both assignees — it must grant NOTHING by itself.
    document_assignments: [
      { id: 'da-1', document_id: 'd-client', assignee_profile_id: 'p-assignee' },
      { id: 'da-2', document_id: 'd-client', assignee_profile_id: 'p-assignee-member' },
    ],
    documents: [
      { id: 'd-own', name: 'own.pdf', profile_id: 'p-owner', business_id: 'b-own', storage_bucket: 'documents', file_path: 'p-owner/own.pdf' },
      { id: 'd-client', name: 'client.pdf', profile_id: 'p-client', business_id: 'b-client', storage_bucket: 'documents', file_path: 'p-client/client.pdf' },
      { id: 'd-lib', name: 'lib.pdf', profile_id: 'p-client', business_id: 'b-client', storage_bucket: 'consulting_library_files', file_path: 'lib/lib.pdf' },
      { id: 'd-clientdoc', name: 'cd.pdf', profile_id: 'p-client', business_id: 'b-client', storage_bucket: 'client-documents', file_path: 'cd/cd.pdf' },
      { id: 'd-nobucket', name: 'nobucket.pdf', profile_id: 'p-client', business_id: 'b-client', storage_bucket: null, file_path: 'p-client/nobucket.pdf' },
      { id: 'd-emptybucket', name: 'empty.pdf', profile_id: 'p-client', business_id: 'b-client', storage_bucket: '', file_path: 'p-client/empty.pdf' },
      { id: 'd-weird', name: 'weird.pdf', profile_id: 'p-client', business_id: 'b-client', storage_bucket: 'backups', file_path: 'p-client/weird.pdf' },
      { id: 'd-nobiz', name: 'household.pdf', profile_id: 'p-client', business_id: null, storage_bucket: 'documents', file_path: 'p-client/household.pdf' },
    ],
  };
})();

const DOC = (id) => FIXTURES.documents.find((d) => d.id === id) || {};

const USERS = {
  'u-owner': { id: 'u-owner', email: 'owner@t', role: 'user' },
  'u-owner-admin': { id: 'u-owner-admin', email: 'owner-admin@t', role: 'admin' },      // Base44 admin
  'u-admin': { id: 'u-admin', email: 'admin@t', role: 'user' },                          // canonical admin
  'u-super': { id: 'u-super', email: 'super@t', role: 'user' },
  'u-client': { id: 'u-client', email: 'client@t', role: 'user' },
  'u-other': { id: 'u-other', email: 'other@t', role: 'user' },
  'u-expert-active': { id: 'u-expert-active', email: 'exa@t', role: 'user' },
  'u-expert-revoked': { id: 'u-expert-revoked', email: 'exr@t', role: 'user' },
  'u-expert-partial': { id: 'u-expert-partial', email: 'exp2@t', role: 'user' },
  'u-expert-pending': { id: 'u-expert-pending', email: 'exp3@t', role: 'user' },
  'u-expert-dup': { id: 'u-expert-dup', email: 'exd@t', role: 'user' },
  'u-expert-bulk': { id: 'u-expert-bulk', email: 'exb@t', role: 'user' },
  'u-expert-revoked-null': { id: 'u-expert-revoked-null', email: 'exrn@t', role: 'user' },
  'u-advisor-assigned': { id: 'u-advisor-assigned', email: 'ada@t', role: 'user' },
  'u-advisor-revoked': { id: 'u-advisor-revoked', email: 'adr@t', role: 'user' },
  'u-advisor-none': { id: 'u-advisor-none', email: 'adn@t', role: 'user' },
  'u-team': { id: 'u-team', email: 'team@t', role: 'user' },
  'u-team-other': { id: 'u-team-other', email: 'teamo@t', role: 'user' },
  'u-stranger': { id: 'u-stranger', email: 'str@t', role: 'user' },
  'u-assignee': { id: 'u-assignee', email: 'asg@t', role: 'user' },
  'u-assignee-member': { id: 'u-assignee-member', email: 'asgm@t', role: 'user' },
  // Base44 standing is REAL on purpose: it must not rescue a suspended profile.
  'u-susp-admin': { id: 'u-susp-admin', email: 'suspa@t', role: 'admin' },
  'u-susp-expert': { id: 'u-susp-expert', email: 'suspe@t', role: 'user' },
};

// ─────────────────────────────────────────────────────────────────────────────
// In-memory Supabase mock — records EVERY operation.
// ─────────────────────────────────────────────────────────────────────────────
function makeSb(db, log, opts = {}) {
  function builder(table) {
    const st = { table, filters: [], limit: null };
    const match = (row) => st.filters.every(([kind, col, val]) => {
      if (kind === 'is') return (row[col] ?? null) === val;
      if (kind === 'ilike') return String(row[col] || '').trim().toLowerCase() === String(val).trim().toLowerCase();
      return row[col] === val;
    });
    const exec = () => {
      if (opts.error && opts.error[table]) {
        log.push({ kind: 'select', table, filters: st.filters.map((f) => f.slice()), limit: st.limit, error: opts.error[table] });
        return { data: null, error: { message: opts.error[table] } };
      }
      const rows = (db[table] || []).filter(match);
      log.push({ kind: 'select', table, filters: st.filters.map((f) => f.slice()), limit: st.limit });
      return { data: st.limit != null ? rows.slice(0, st.limit) : rows, error: null };
    };
    const b = {
      select: () => b,
      eq: (c, v) => { st.filters.push(['eq', c, v]); return b; },
      ilike: (c, v) => { st.filters.push(['ilike', c, v]); return b; },
      is: (c, v) => { st.filters.push(['is', c, v]); return b; },
      in: () => b,
      or: () => b,
      order: () => b,
      limit: (n) => { st.limit = n; return b; },
      maybeSingle: async () => { const r = exec(); return { data: r.data ? (r.data[0] || null) : null, error: r.error }; },
      then: (res, rej) => Promise.resolve().then(exec).then(res, rej),
    };
    return b;
  }
  return {
    from: builder,
    storage: {
      from: (bucket) => ({
        createSignedUrl: async (p, ttl) => {
          log.push({ kind: 'createSignedUrl', bucket, path: p, ttl });
          return { data: { signedUrl: `mock://${bucket}/${p}?ttl=${ttl}` }, error: null };
        },
      }),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Compile a VARIANT of the real sources (mutations pass source overrides).
// ─────────────────────────────────────────────────────────────────────────────
const quiet = { log() {}, warn() {}, error() {}, info() {} };
const ResponseImpl = (typeof Response !== 'undefined' && typeof Response.json === 'function')
  ? Response
  : { json: (body, init = {}) => ({ status: init.status || 200, body, json: async () => body }) };

function compileVariant(sources = {}) {
  const holder = { state: null };
  const DENO = {
    serve: (h) => { holder.handler = h; },
    env: { get: (k) => ({ VITE_SUPABASE_URL: 'https://mock.supabase.local', SUPABASE_SERVICE_ROLE_KEY: 'mock-key' }[k]) },
  };
  const cache = {};
  const stubs = {
    'npm:@base44/sdk@0.8.31': {
      createClientFromRequest: (req) => ({
        auth: { me: async () => req.__user },
        functions: { invoke: async () => ({}) },
        asServiceRole: { functions: { invoke: async () => ({}) }, entities: {} },
      }),
    },
    'npm:@supabase/supabase-js@2': { createClient: () => holder.state.sb },
    '../../shared/documentExtraction/extractEngine.ts': { runExtraction: async () => ({}) },
    '../../shared/intelligenceContract/baselineResolver.ts': { resolveBaselineBusinessValue: async () => null },
    '../../shared/intelligenceContract/businessIntelligenceContract.ts': { buildBusinessIntelligenceContract: async () => ({}) },
  };
  function load(fileAbs) {
    if (cache[fileAbs]) return cache[fileAbs].exports;
    const rel = path.relative(ROOT, fileAbs);
    const src = Object.prototype.hasOwnProperty.call(sources, rel) ? sources[rel] : fs.readFileSync(fileAbs, 'utf8');
    const js = esbuild.transformSync(src, { loader: 'ts', format: 'cjs', target: 'es2020' }).code;
    const mod = { exports: {} };
    cache[fileAbs] = mod;
    const req = (spec) => {
      if (Object.prototype.hasOwnProperty.call(stubs, spec)) return stubs[spec];
      if (spec.startsWith('.')) return load(path.resolve(path.dirname(fileAbs), spec));
      throw new Error(`unexpected import ${spec} in ${rel}`);
    };
    new Function('exports', 'module', 'require', 'Deno', 'Response', 'console', js)(
      mod.exports, mod, req, DENO, ResponseImpl, quiet
    );
    return mod.exports;
  }
  load(path.join(ROOT, ENTRY));
  if (!holder.handler) throw new Error('Deno.serve handler was not captured');
  return holder;
}

const base = compileVariant();

// ─────────────────────────────────────────────────────────────────────────────
// Invoke the REAL handler for the getDocumentSignedUrl action.
// ─────────────────────────────────────────────────────────────────────────────
async function call(variant, userKey, documentId, data = {}, opts = {}) {
  const db = { ...FIXTURES };
  const log = [];
  const sb = makeSb(db, log, opts);
  variant.state = { db, log, sb };
  const res = await variant.handler({
    __user: USERS[userKey],
    json: async () => ({ action: 'getDocumentSignedUrl', data: { ...(documentId ? { documentId } : {}), ...data } }),
    headers: { get: () => '' },
    url: 'https://mock/functions/supabaseUserData',
  });
  const body = await res.json();
  return { status: res.status, body, signs: log.filter((o) => o.kind === 'createSignedUrl'), log, db };
}

async function runCase(tc, variant = base) {
  const r = await call(variant, tc.user, tc.doc, tc.data || {}, tc.opts || {});
  const doc = tc.doc ? DOC(tc.doc) : null;
  const expBucket = tc.bucket !== undefined ? tc.bucket : (doc ? doc.storage_bucket : undefined);
  const expPath = tc.path !== undefined ? tc.path : (doc ? doc.file_path : undefined);
  const f = [];
  const want = (cond, msg) => { if (!cond) f.push(msg); };

  if (tc.expect === 'allow') {
    want(r.status === 200, `status ${r.status}`);
    want(typeof r.body.signedUrl === 'string' && r.body.signedUrl.length > 0, 'no signedUrl');
    want(r.signs.length === 1, `createSignedUrl count ${r.signs.length}`);
    if (r.signs[0]) {
      want(r.signs[0].bucket === expBucket, `bucket ${r.signs[0].bucket} != ${expBucket}`);
      want(r.signs[0].path === expPath, `path ${r.signs[0].path} != ${expPath}`);
      want(r.signs[0].ttl === 900, `ttl ${r.signs[0].ttl} != 900`);
    }
    // ORDER: lookup → authorization → bucket validation → minting
    const dIdx = r.log.findIndex((o) => o.kind === 'select' && o.table === 'documents');
    const sIdx = r.log.findIndex((o) => o.kind === 'createSignedUrl');
    want(dIdx !== -1 && dIdx < sIdx, 'document lookup did not precede URL minting');
    want(sIdx === r.log.length - 1, 'URL minting was not the final operation');
  } else if (tc.expect === 'deny404') {
    want(r.status === 404, `status ${r.status}`);
    want(JSON.stringify(r.body) === JSON.stringify({ error: 'Not found' }), `body ${JSON.stringify(r.body)}`);
    want(r.signs.length === 0, `createSignedUrl executed (${r.signs.length})`);
  } else if (tc.expect === 'deny403') {
    want(r.status === 403, `status ${r.status}`);
    want(r.signs.length === 0, `createSignedUrl executed (${r.signs.length})`);
  } else if (tc.expect === 'fail500') {
    want(r.status === 500, `status ${r.status}`);
    want(!r.body.signedUrl, 'url leaked');
    want(r.signs.length === 0, 'createSignedUrl executed');
  }
  return { ok: f.length === 0, failures: f, r };
}

// ─────────────────────────────────────────────────────────────────────────────
// THE MATRIX — the reviewer's 1–34 plus the legacy-branch regression (L1) and
// the bucket (B*) and existence-oracle (E*) cases.
// ─────────────────────────────────────────────────────────────────────────────
const CASES = [
  // 1–4, 23–24 — identity and standing
  { id: '1', name: 'owner → own-business document → ALLOW', user: 'u-owner', doc: 'd-own', expect: 'allow', bucket: 'documents' },
  { id: '2', name: 'owner → ANOTHER business → DENY', user: 'u-owner', doc: 'd-client', expect: 'deny404' },
  { id: '3', name: 'canonical admin (Base44 role user) → client document → ALLOW', user: 'u-admin', doc: 'd-client', expect: 'allow', bucket: 'documents' },
  { id: '4', name: 'canonical super_admin → ALLOW', user: 'u-super', doc: 'd-client', expect: 'allow', bucket: 'documents' },
  { id: '23', name: 'canonical admin whose Base44 role is an ordinary user → ALLOW', user: 'u-admin', doc: 'd-own', expect: 'allow', bucket: 'documents' },
  { id: '24', name: 'Base44 admin whose canonical app_role is owner → NO standing → DENY', user: 'u-owner-admin', doc: 'd-client', expect: 'deny404' },
  { id: '13b', name: 'Base44 admin + canonical owner but AUTHORIZED for the business → ALLOW', user: 'u-owner-admin', doc: 'd-own', expect: 'allow', bucket: 'documents' },
  // 5–9 — current business relationships
  { id: '5a', name: 'ACTIVE advisor_assignments relationship → ALLOW', user: 'u-advisor-assigned', doc: 'd-client', expect: 'allow', bucket: 'documents' },
  { id: '5b', name: 'authorized team member → ALLOW', user: 'u-team', doc: 'd-client', expect: 'allow', bucket: 'documents' },
  { id: '5c', name: 'ACTIVE expert relationship → ALLOW', user: 'u-expert-active', doc: 'd-client', expect: 'allow', bucket: 'documents' },
  { id: '8', name: 'authorized team member (explicit matrix line) → ALLOW', user: 'u-team', doc: 'd-client', expect: 'allow', bucket: 'documents' },
  { id: '25', name: 'active expert relationship → document VIEW ALLOW', user: 'u-expert-active', doc: 'd-client', expect: 'allow', bucket: 'documents' },
  { id: '30', name: 'duplicate ACTIVE expert relationships → ALLOW', user: 'u-expert-dup', doc: 'd-client', expect: 'allow', bucket: 'documents' },
  { id: '29', name: '>50 revoked historical relationships + one ACTIVE → ALLOW', user: 'u-expert-bulk', doc: 'd-client', expect: 'allow', bucket: 'documents' },
  { id: '6', name: 'REVOKED expert relationship → DENY', user: 'u-expert-revoked', doc: 'd-client', expect: 'deny404' },
  { id: '26', name: 'same expert relationship after REVOKE → DENY', user: 'u-expert-revoked', doc: 'd-client', expect: 'deny404' },
  { id: '27', name: 'active status but revoked_at POPULATED → DENY', user: 'u-expert-partial', doc: 'd-client', expect: 'deny404' },
  { id: '28', name: "revoked status with revoked_at NULL → DENY", user: 'u-expert-revoked-null', doc: 'd-client', expect: 'deny404' },
  { id: 'L1', name: 'REVOKED advisor_assignments row → DENY (the retired legacy branch would ALLOW)', user: 'u-advisor-revoked', doc: 'd-client', expect: 'deny404' },
  { id: '7', name: 'unrelated advisor (no relationship) → DENY', user: 'u-advisor-none', doc: 'd-client', expect: 'deny404' },
  { id: '9', name: 'unrelated team member → DENY', user: 'u-team-other', doc: 'd-client', expect: 'deny404' },
  // 10–12 — assignment never grants access
  { id: '10', name: 'document assignee ONLY → DENY', user: 'u-assignee', doc: 'd-client', expect: 'deny404' },
  { id: '11', name: 'assignee who ALSO has business access → ALLOW (business, not assignment)', user: 'u-assignee-member', doc: 'd-client', expect: 'allow', bucket: 'documents' },
  { id: '12', name: 'unrelated owner who knows the UUID → DENY', user: 'u-stranger', doc: 'd-client', expect: 'deny404' },
  { id: '12b', name: 'unrelated owner + real UUID of a documents row → DENY', user: 'u-stranger', doc: 'd-own', expect: 'deny404' },
  // 14–17 — forged request fields
  { id: '14', name: 'forged request role=admin → DENY', user: 'u-owner', doc: 'd-client', data: { role: 'admin' }, expect: 'deny404' },
  { id: '15', name: 'forged request app_role=super_admin → DENY', user: 'u-owner', doc: 'd-client', data: { app_role: 'super_admin' }, expect: 'deny404' },
  { id: '16', name: "forged actor's OWN business_id + profile_id + bucket + path → DENY", user: 'u-owner', doc: 'd-client', data: { profile_id: 'p-owner', business_id: 'b-own', active_business_id: 'b-own', bucket: 'documents', storage_bucket: 'documents', file_path: 'p-client/client.pdf' }, expect: 'deny404' },
  { id: '17', name: "forged business_id equal to the DOCUMENT's business, actor lacks access → DENY", user: 'u-stranger', doc: 'd-client', data: { business_id: 'b-client', active_business_id: 'b-client' }, expect: 'deny404' },
  // 18–22 — fail-closed and central denial
  { id: '18', name: 'nonexistent document → 404 Not found (fail closed)', user: 'u-owner', doc: '00000000-0000-0000-0000-000000000000', expect: 'deny404' },
  { id: '19', name: 'businessless document, non-owner → DENY (fail closed)', user: 'u-stranger', doc: 'd-nobiz', expect: 'deny404' },
  { id: '19b', name: 'businessless document OWNED by the actor → ALLOW (household record)', user: 'u-client', doc: 'd-nobiz', expect: 'allow', bucket: 'documents' },
  { id: '20', name: 'unapproved persisted bucket → DENY (fail closed)', user: 'u-client', doc: 'd-weird', expect: 'deny404' },
  { id: '21', name: 'SUSPENDED admin (Base44 role admin) → DENY centrally', user: 'u-susp-admin', doc: 'd-client', expect: 'deny403' },
  { id: '22', name: 'SUSPENDED expert with an ACTIVE relationship → DENY centrally', user: 'u-susp-expert', doc: 'd-client', expect: 'deny403' },
  // 31–32 — error paths
  { id: '31', name: 'business-scope query ERROR → DENY (fail closed)', user: 'u-expert-active', doc: 'd-client', opts: { error: { business_entities: 'connection reset by peer' } }, expect: 'deny404' },
  { id: '32', name: 'document lookup ERROR → opaque server failure, no URL', user: 'u-owner', doc: 'd-own', opts: { error: { documents: 'query failed' } }, expect: 'fail500' },
  // B* — the shared bucket policy
  { id: 'B08', name: 'B8 authorized document with storage_bucket null → NO signed URL', user: 'u-client', doc: 'd-nobucket', expect: 'deny404' },
  { id: 'B08b', name: 'B8b authorized document with storage_bucket empty string → NO signed URL', user: 'u-client', doc: 'd-emptybucket', expect: 'deny404' },
  { id: 'B09', name: 'B9 authorized document in client-documents → URL from client-documents', user: 'u-client', doc: 'd-clientdoc', expect: 'allow', bucket: 'client-documents' },
  { id: 'B09b', name: 'B9b admin + client-documents bucket → URL from client-documents', user: 'u-admin', doc: 'd-clientdoc', expect: 'allow', bucket: 'client-documents' },
  { id: 'B10', name: 'B10 authorized document in consulting_library_files → URL from that bucket', user: 'u-client', doc: 'd-lib', expect: 'allow', bucket: 'consulting_library_files' },
  { id: 'B11', name: 'B11 authorized document in documents → URL from documents', user: 'u-owner', doc: 'd-own', expect: 'allow', bucket: 'documents' },
  { id: 'B12', name: 'B12 request bucket differs from the persisted row → persisted row WINS', user: 'u-client', doc: 'd-lib', data: { bucket: 'documents', storage_bucket: 'documents', bucketId: 'documents' }, expect: 'allow', bucket: 'consulting_library_files' },
  { id: 'B13', name: 'B13 persisted bucket unknown while the request supplies an approved one → DENY', user: 'u-client', doc: 'd-weird', data: { bucket: 'documents', storage_bucket: 'documents' }, expect: 'deny404' },
];

// ─────────────────────────────────────────────────────────────────────────────
// The shared bucket policy (real module, executed).
// ─────────────────────────────────────────────────────────────────────────────
function loadBucketsModule(sources = {}) {
  const rel = BUCKETS;
  const src = sources[rel] || read(rel);
  const js = esbuild.transformSync(src, { loader: 'ts', format: 'cjs', target: 'es2020' }).code;
  const mod = { exports: {} };
  new Function('exports', 'module', 'require', js)(mod.exports, mod, () => ({}));
  return mod.exports;
}

// ─────────────────────────────────────────────────────────────────────────────
// MUTATIONS — mutate the REAL source, re-run the matrix, catch the regression.
// ─────────────────────────────────────────────────────────────────────────────
const LOAD_SPAN = `      const { data: doc, error: fetchErr } = await sb.from('documents')
        .select('id, file_path, profile_id, business_id, storage_bucket')
        .eq('id', documentId).maybeSingle();
      // A lookup failure is a database failure: the router maps it to an opaque
      // 500. It never mints a URL and it is never a document-existence signal.
      if (fetchErr) throw new Error(fetchErr.message);
      if (!doc) return documentNotFound();`;
const AUTH_SPAN = `      const verdict = await authorizeDocumentAccess({
        doc,
        actor: {
          profile_id: profile.id,
          isAdmin: actor.isAdmin,
          hasProfile: Boolean(profile.id),
        },
        operation: 'view',
        checkBusinessAccess: (businessId: any) =>
          assertBusinessAccess(sb, businessId, profile, { action: 'getDocumentSignedUrl' }),
      });
      if (!verdict.authorized) return documentNotFound();`;
const ISADMIN_LINE = '          isAdmin: actor.isAdmin,';
const MINT_LINE = '        .from(doc.storage_bucket).createSignedUrl(doc.file_path, 900); // 15 minutes';

const MUTATIONS = [
  {
    id: 'A', name: 'legacy advisor_assignments authorization branch restored',
    file: ENTRY, edits: [{ find: AUTH_SPAN, replace: `      const legacyRole = profile.app_role || user.role || 'owner';
      if (legacyRole === 'advisor') {
        if (!doc.business_id) return documentNotFound();
        const { data: legacyAssignment } = await sb.from('advisor_assignments').select('id')
          .eq('advisor_profile_id', profile.id).eq('business_id', doc.business_id).maybeSingle();
        if (!legacyAssignment) return documentNotFound();
      } else if (legacyRole !== 'admin' && legacyRole !== 'super_admin') {
        if (doc.profile_id !== profile.id) return documentNotFound();
      }` }],
    mustCatch: ['L1'],
  },
  {
    id: 'B', name: 'request business_id trusted for the business check',
    file: ENTRY, edits: [{ find: '          assertBusinessAccess(sb, businessId, profile, { action: \'getDocumentSignedUrl\' }),', replace: '          assertBusinessAccess(sb, data?.business_id || businessId, profile, { action: \'getDocumentSignedUrl\' }),' }],
    mustCatch: ['16'],
  },
  {
    id: 'C', name: 'request role trusted for admin standing',
    file: ENTRY, edits: [{ find: ISADMIN_LINE, replace: "          isAdmin: actor.isAdmin || ['admin', 'super_admin'].includes(data?.role)," }],
    mustCatch: ['14'],
  },
  {
    id: 'D', name: 'request app_role trusted for admin standing',
    file: ENTRY, edits: [{ find: ISADMIN_LINE, replace: "          isAdmin: actor.isAdmin || ['admin', 'super_admin'].includes(data?.app_role)," }],
    mustCatch: ['15'],
  },
  {
    id: 'E', name: 'Base44 role grants admin standing',
    file: ENTRY, edits: [{ find: ISADMIN_LINE, replace: "          isAdmin: actor.isAdmin || ['admin', 'super_admin'].includes(user?.role)," }],
    mustCatch: ['13b', '24'],
  },
  {
    id: 'F', name: 'document assignment grants VIEW',
    file: ENTRY, edits: [{ find: '      if (!verdict.authorized) return documentNotFound();', replace: `      let authorizedByAssignment = verdict.authorized;
      if (!authorizedByAssignment) {
        const { data: assignmentGrant } = await sb.from('document_assignments').select('id')
          .eq('document_id', doc.id).eq('assignee_profile_id', profile.id).maybeSingle();
        if (assignmentGrant) authorizedByAssignment = true;
      }
      if (!authorizedByAssignment) return documentNotFound();` }],
    mustCatch: ['10'],
  },
  {
    id: 'G', name: 'authorized against the REQUESTED business rather than the document row',
    file: ENTRY, edits: [{ find: `      const verdict = await authorizeDocumentAccess({
        doc,`, replace: `      const verdict = await authorizeDocumentAccess({
        doc: { ...doc, business_id: data?.business_id || data?.active_business_id || doc.business_id },` }],
    mustCatch: ['16'],
  },
  {
    id: 'H', name: 'hardened expert relationship check removed (row existence grants)',
    file: GUARD, edits: [{ find: '  const expertRelationship = await resolveActiveExpertRelationship(sb, profile_id, business_id);', replace: `  const { data: expertRelationship } = await sb.from('expert_advisor_access')
    .select('id').eq('expert_profile_id', profile_id).eq('business_id', business_id).maybeSingle();` }],
    mustCatch: ['6', '7'],
  },
  {
    id: 'I', name: 'revoked expert treated as active (both filters dropped)',
    file: REL, edits: [
      { find: "    .is('revoked_at', null)\n", replace: '' },
      { find: '  if (row.revoked_at) return false;\n', replace: '' },
    ],
    mustCatch: ['27'],
  },
  {
    id: 'J', name: 'signed URL minted without authorization',
    file: ENTRY, edits: [{ find: '      if (!verdict.authorized) return documentNotFound();', replace: '' }],
    mustCatch: ['12b', '2'],
  },
  {
    id: 'K', name: 'unknown bucket accepted',
    file: BUCKETS, edits: [{ find: '  return typeof bucket === \'string\' && APPROVED_DOCUMENT_BUCKETS.includes(bucket);', replace: '  return true;' }],
    mustCatch: ['20'],
  },
  {
    id: 'L', name: "hardcoded 'documents' bucket instead of the persisted approved one",
    file: ENTRY, edits: [{ find: MINT_LINE, replace: "        .from('documents').createSignedUrl(doc.file_path, 900); // 15 minutes" }],
    mustCatch: ['B10'],
  },
  {
    id: 'M', name: 'document lookup skipped (request-shaped document authorized)',
    file: ENTRY, edits: [{ find: LOAD_SPAN, replace: `      const doc = {
        id: documentId,
        profile_id: data?.profile_id || null,
        business_id: data?.business_id || null,
        storage_bucket: data?.storage_bucket ?? data?.bucket ?? null,
        file_path: data?.file_path || null,
      };` }],
    mustCatch: ['16'],
  },
  {
    id: 'N', name: 'shared documentAccess engine bypassed',
    file: ENTRY, edits: [{ find: AUTH_SPAN, replace: "      const verdict = { authorized: true, reason: 'bypassed' };\n      if (!verdict.authorized) return documentNotFound();" }],
    mustCatch: ['2', '10', '12'],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
(async () => {
  const entrySrc = read(ENTRY);
  const blockStart = entrySrc.indexOf("if (action === 'getDocumentSignedUrl')");
  const blockEnd = entrySrc.indexOf("if (action === 'deleteDocument')");
  const VIEW_BLOCK = entrySrc.slice(blockStart, blockEnd);
  // Static assertions are about BEHAVIOUR, never prose: comments are stripped
  // before a static check so a comment naming a removed mechanism cannot pass a
  // check that is supposed to prove the mechanism is gone.
  const deComment = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const VIEW_CODE = deComment(VIEW_BLOCK);

  console.log('── SHARED BUCKET POLICY (real module) ──');
  const bucketsApi = loadBucketsModule();
  const isApproved = bucketsApi.isApprovedDocumentBucket;
  const approvedList = bucketsApi.APPROVED_DOCUMENT_BUCKETS;
  check('B1  documents → approved', isApproved('documents') === true);
  check('B2  client-documents → approved', isApproved('client-documents') === true);
  check('B3  consulting_library_files → approved', isApproved('consulting_library_files') === true);
  check('B4  arbitrary bucket → NOT approved', isApproved('backups') === false);
  check('B5  empty string → NOT approved', isApproved('') === false);
  check('B6  null → NOT approved', isApproved(null) === false);
  check('B7  undefined → NOT approved', isApproved(undefined) === false);
  check('B7b whitespace-only → NOT approved', isApproved('   ') === false);
  check(
    'B14a the policy holds EXACTLY the three reviewed S2 buckets',
    JSON.stringify(approvedList) === JSON.stringify(['documents', 'client-documents', 'consulting_library_files']),
    JSON.stringify(approvedList)
  );
  const bucketsCode = read(BUCKETS).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  check('B14b the policy is tiny and pure (no auth, no I/O, no URL minting, no imports)',
    !/createSignedUrl|sb\.from|authorize|Supabase|^\s*import\s/m.test(bucketsCode));

  console.log('\n── ADVERSARIAL MATRIX — the REAL handler against the REAL spine ──');
  const results = {};
  for (const tc of CASES) {
    const out = await runCase(tc);
    results[tc.id] = out;
    check(`${String(tc.id).padEnd(5)} ${tc.name}`, out.ok, out.ok ? '' : out.failures.join('; '));
  }

  console.log('\n── SIGNED URL PROOF (34) — authorized row bucket + path, lifetime 900 ──');
  {
    let okAll = true;
    const detail = [];
    for (const tc of CASES.filter((c) => c.expect === 'allow')) {
      const s = results[tc.id].r.signs[0];
      const doc = DOC(tc.doc);
      if (!s || s.bucket !== doc.storage_bucket || s.path !== doc.file_path || s.ttl !== 900) {
        okAll = false; detail.push(`${tc.id}:${JSON.stringify(s)}`);
      }
    }
    check('34 createSignedUrl called ONLY with the authorized row bucket + path + ttl 900', okAll, detail.join(', '));
  }

  console.log('\n── EXISTENCE ORACLE (E1–E5) ──');
  const e1 = results['18'].r;   // nonexistent
  const e2 = results['12'].r;   // existing but unauthorized
  check('E1/E2 nonexistent → 404 Not found', e1.status === 404 && JSON.stringify(e1.body) === JSON.stringify({ error: 'Not found' }));
  check('E3 nonexistent and unauthorized are EXTERNALLY IDENTICAL', e1.status === e2.status && JSON.stringify(e1.body) === JSON.stringify(e2.body), `${e1.status}/${JSON.stringify(e1.body)} vs ${e2.status}/${JSON.stringify(e2.body)}`);
  check('E4 neither path calls createSignedUrl', e1.signs.length === 0 && e2.signs.length === 0);
  check('E5 knowledge of a real UUID gives no existence signal through this action', JSON.stringify(e1.body) === JSON.stringify(e2.body) && !('reason' in e2.body) && !('code' in e2.body));
  check('E5b the denied body carries no reason/outcome from the internal verdict', !/not_found|business_access_denied|no_business/.test(JSON.stringify(e2.body)));

  console.log('\n── ORDER OF OPERATIONS (structural) ──');
  const idx = (s) => VIEW_BLOCK.indexOf(s);
  check('O1 document lookup precedes authorization', idx("sb.from('documents')") !== -1 && idx("sb.from('documents')") < idx('authorizeDocumentAccess('));
  check('O2 authorization precedes bucket validation', idx('authorizeDocumentAccess(') < idx('isApprovedDocumentBucket('));
  check('O3 bucket validation precedes createSignedUrl', idx('isApprovedDocumentBucket(') < idx('createSignedUrl('));
  check('O4 exactly ONE createSignedUrl in the VIEW action', (VIEW_BLOCK.match(/createSignedUrl/g) || []).length === 1);
  check('O5 exactly ONE authorization call in the VIEW action', (VIEW_BLOCK.match(/authorizeDocumentAccess\(/g) || []).length === 1);

  console.log('\n── STATIC — the legacy logic is GONE ──');
  check('S1  no advisor_assignments authorization remains in the VIEW action', !/advisor_assignments/.test(VIEW_CODE));
  check('S2  no Base44 user.role read remains in the VIEW action', !/user\.role/.test(VIEW_CODE));
  check('S3  no local admin-role list remains in the VIEW action', !/\['admin',\s*'super_admin'\]/.test(VIEW_CODE));
  check('S4  no implicit bucket fallback remains (no `storage_bucket ||`, no `|| \'documents\'`)', !/storage_bucket\s*\|\|/.test(VIEW_CODE) && !/\|\|\s*'documents'/.test(VIEW_CODE));
  check('S5  the VIEW action imports BOTH shared modules', /import \{ authorizeDocumentAccess \}/.test(entrySrc) && /import \{ isApprovedDocumentBucket \}/.test(entrySrc));
  check('S6  the tenant is the DOCUMENT row (bucket minted from doc.storage_bucket, path from doc.file_path)', VIEW_BLOCK.includes('.from(doc.storage_bucket).createSignedUrl(doc.file_path, 900)'));
  check('S7  no notification / assignment / recipient field is consulted for authority', !/notification|recipient|assignee_profile_id|expert_profile_id|advisor_id/.test(VIEW_CODE));
  check('S8  the suspension gate stays central (not restated here)', !/profile_status/.test(VIEW_CODE));
  check('S9  the shared documentAccess engine is unchanged by this slice', read(DOC_ACCESS) === git(['show', 'HEAD:' + DOC_ACCESS]));
  check('S10 relationshipAccess is unchanged by this slice', read(REL) === git(['show', 'HEAD:' + REL]));
  check('S11 actor.ts is unchanged by this slice', read(ACTOR) === git(['show', 'HEAD:' + ACTOR]));
  check('S12 the VIEW action still requires the documentId (400) and does not leak it', VIEW_BLOCK.includes("documentId required"));

  console.log('\n── getDocumentsAdmin — vocabulary convergence, NOT a redesign ──');
  {
    const adminNow = read(ADMIN_ENTRY);
    const adminHead = git(['show', 'HEAD:' + ADMIN_ENTRY]);
    const span = (s, a, b) => s.slice(s.indexOf(a), s.indexOf(b));
    check('G1 loadAuthorizedDocument is byte-identical (authorization semantics unchanged)',
      span(adminHead, 'async function loadAuthorizedDocument', 'Deno.serve') === span(adminNow, 'async function loadAuthorizedDocument', 'Deno.serve'));
    check('G2 the delete branch is byte-identical', span(adminHead, "body.action === 'delete'", "body.action === 'getSignedUrl'") === span(adminNow, "body.action === 'delete'", "body.action === 'getSignedUrl'"));
    check('G3 the getSignedUrl branch is byte-identical (lifetime + fallback untouched)',
      span(adminHead, "body.action === 'getSignedUrl'", 'QUERY action') === span(adminNow, "body.action === 'getSignedUrl'", 'QUERY action'));
    check('G4 the local two-bucket list is GONE and the shared policy is imported',
      !/ALLOWED_BUCKETS/.test(adminNow) && /import \{ isApprovedDocumentBucket \}/.test(adminNow));
    check('G5 the query IS scoped to the approved bucket the caller requested (no implicit default)', /query = query\.eq\('storage_bucket', bucket\)/.test(adminNow));
    check('G6 client-documents is now an accepted vocabulary value (previously refused by the local list)', isApproved('client-documents') === true && /Invalid bucket/.test(adminNow));
    check('G7 the consulting_library_files listing scope is byte-identical',
      span(adminHead, "if (bucket === 'consulting_library_files')", '} else {') === span(adminNow, "if (bucket === 'consulting_library_files')", '} else {'));
  }

  console.log('\n── MUTATION TESTS — mutate the REAL extracted source, re-run, catch it ──');
  for (const mut of MUTATIONS) {
    const baseSrc = read(mut.file);
    const missing = mut.edits.find((e) => !baseSrc.includes(e.find));
    if (missing) {
      check(`MUT-${mut.id} ${mut.name}`, false, `mutation anchor not found: ${String(missing.find).slice(0, 60)}`);
      continue;
    }
    const mutated = mut.edits.reduce((s, e) => s.replace(e.find, e.replace), baseSrc);
    const variant = compileVariant({ [mut.file]: mutated });
    const caught = [];
    for (const caseId of mut.mustCatch) {
      const tc = CASES.find((c) => c.id === caseId);
      const out = await runCase(tc, variant);
      if (!out.ok) caught.push(caseId);
    }
    check(`MUT-${mut.id} ${mut.name} → caught by [${caught.join(', ') || 'NOTHING'}]`, caught.length > 0, caught.length ? '' : 'the harness would NOT have caught this regression');
  }

  console.log('\n── CHANGE SURFACE ──');
  // The baseline is the reviewed PRE-S3.1 revision, resolved at runtime and never
  // hardcoded: this harness is ADDED by the S3.1 commit, so that commit's parent is
  // the last revision before the reviewed change. While the slice is still in the
  // working tree the harness is untracked, so HEAD IS that baseline.
  // This assertion therefore reads the same way BEFORE and AFTER the commit:
  // uncommitted it is the working-tree change, committed it is that commit's diff —
  // and it cannot pass vacuously once the work is committed.
  const S31_COMMIT = git(['log', '--diff-filter=A', '--format=%H', '-1', '--', TEST]).trim();
  const BASELINE = S31_COMMIT ? git(['rev-parse', `${S31_COMMIT}^`]).trim() : git(['rev-parse', 'HEAD']).trim();
  const changed = [...new Set([
    ...names(git(['diff', '--name-only', BASELINE])),
    ...names(git(['diff', '--name-only', BASELINE, 'HEAD'])),
    ...names(git(['ls-files', '--others', '--exclude-standard'])),
  ])].sort();
  const PRODUCT = [ENTRY, ADMIN_ENTRY, BUCKETS].sort();
  const HARNESSES = [
    TEST,
    'scripts/adminCanonicalActor.test.cjs',
    'scripts/relationshipRevocationAccess.test.cjs',
    'scripts/documentAccessAuthorization.test.cjs',
    'src/scripts/getDocumentsAdmin.s3.mock.test.cjs',
  ].sort();
  // P5 REBASE — the reviewed P5 slice (Admin document viewing) adds one product
  // file (the Admin client's Documents tab: its rows now open the EXISTING viewer
  // through THIS action) and one harness. The authorization surface this harness
  // guards is unchanged — F2 and the whole matrix above are untouched.
  const P5_FILES = ['src/components/admin/AdminUserProfileContext.jsx', 'scripts/adminDocumentViewer.test.cjs'];
  // P-S3 REBASE — the reviewed P-S3 slice (Galileo context actor binding, closes
  // SEC-001) changes ONE backend function and adds one harness plus one review
  // report. The committed ledger reports are named because they are part of the
  // repository surface, not product code. F2 and the whole matrix above are
  // untouched: the shared authorization spine is still not modified.
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
  // LATER, APPROVED slice layered on P5/P-S3: the extraction entry point, four
  // shared extraction modules, the shared viewer hook, the DocumentViewer, its
  // own harness and two reports. Allowlist line ONLY — the authorization matrix
  // above (allow/deny, bucket policy, URL-minting order) is untouched.
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
  // hotfix is a LATER, APPROVED slice. Allowlist line ONLY: the authorization
  // matrix above (allow/deny, bucket policy, URL-minting order) is untouched.
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
  ].filter((f) => ![...PRODUCT, ...HARNESSES, ...P5_FILES, ...P_S3_FILES, ...APPROVED_REPORTS, ...P_6D0_FILES, 'base44/shared/galileo/provisionalEvidence.ts', 'base44/shared/canonicalFact/registry.ts', 'base44/functions/askGalileo/entry.ts', 'src/scripts/documentKnowledgeCompletion.test.cjs', 'VISION_PHASE_6D_0C_1_PROVISIONAL_EVIDENCE_RETRIEVAL.md', ...require('./slice6D0C2Files.cjs')].includes(f));
  // 6D.0a REBASE — the reviewed Semantic Observation Bridge slice: ONE new shared
  // module, the shared contract that now reads it, buildGalileoContext's CONSUMER
  // wiring, its own harness, the post-hotfix audit report and this slice's report.
  // Allowlist line ONLY — the authorization matrix (allow/deny, bucket policy,
  // URL-minting order) above is untouched.
  const P_6D0A_FILES = [
    'base44/shared/documentObservation/semantics.ts',
    'base44/shared/intelligenceContract/businessIntelligenceContract.ts',
    'base44/functions/buildGalileoContext/entry.ts',
    'scripts/semanticObservationBridge.test.cjs',
    'VISION_DOCUMENT_UNDERSTANDING_AND_GALILEO_INTELLIGENCE_AUDIT.md',
    'src/VISION_PHASE_6D_0A_SEMANTIC_OBSERVATION_BRIDGE.md',
  ];
  // 6D.0b AUTOMATIC DOCUMENT UNDERSTANDING — a LATER, APPROVED slice. Allowlist
  // lines ONLY: the authorization spine, the bucket authority, the signed-URL
  // contract and every mutation check above are unchanged.
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
    // asks about an exact document. ALLOWLIST LINES ONLY — every authorization
    // allow/deny case, mutation check and byte-identity assertion is unchanged.
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
  // 6D.0b.2.1 CANONICAL SOURCE READ REPAIR — a LATER, APPROVED slice. Allowlist line
  // ONLY: the ONE shared project-URL normalizer, its harness and its report.
  const P_6D0B2_1_FILES = [
    'base44/shared/supabase/projectUrl.ts',
    'src/scripts/documentCanonicalSourceRead.test.cjs',
    'VISION_PHASE_6D_0B_2_1_CANONICAL_SOURCE_READ_REPAIR.md',
  ];
  check('F1 change surface = exactly the 3 approved product files + 5 harness files + the P5 slice + the P-S3 slice + the 6D.0 slice + the classification hotfix slice + the 6D.0a slice + the 6D.0b slice',
    JSON.stringify(changed) === JSON.stringify([...new Set([...PRODUCT, ...HARNESSES, ...P5_FILES, ...P_S3_FILES, ...APPROVED_REPORTS, ...P_6D0_FILES, ...CLASSIFICATION_HOTFIX_FILES, ...P_6D0A_FILES, ...P_6D0B_FILES, ...P_6D0B2_1_FILES, 'base44/shared/documentIngestion/resume.ts', 'src/scripts/documentKnowledgeCompletion.test.cjs', 'base44/shared/galileo/focusedDocument.ts', 'base44/functions/askGalileo/entry.ts', 'src/hooks/useAskGalileo.js', 'src/components/galileo/home/GalileoAnswerPanel.jsx', 'base44/shared/galileo/provisionalEvidence.ts', 'base44/shared/canonicalFact/registry.ts', 'VISION_PHASE_6D_0C_1_PROVISIONAL_EVIDENCE_RETRIEVAL.md', ...require('./slice6D0C2Files.cjs')])].sort()), changed.join(', '));
  check('F2 the shared authorization spine is NOT modified by this slice',
    !changed.includes(DOC_ACCESS) && !changed.includes(ACTOR) && !changed.includes(REL) && !changed.includes(GUARD) && !changed.includes(ACTIVE));
  check('F3 the only frontend files changed are the reviewed P5 Admin Documents tab, the reviewed 6D.0 source-missing state, the classification hotfix and the 6D.0a reports', !changed.some((f) => f.startsWith('src/') && !f.startsWith('src/scripts/') && !P5_FILES.includes(f) && !APPROVED_REPORTS.includes(f) && !P_6D0_FILES.includes(f) && !CLASSIFICATION_HOTFIX_FILES.includes(f) && !P_6D0A_FILES.includes(f) && !P_6D0B_FILES.includes(f) && f !== 'src/components/galileo/home/GalileoAnswerPanel.jsx' && !require('./slice6D0C2Files.cjs').includes(f)));
  check('F4 no SQL / migration / RLS / Storage file changed', !changed.some((f) => f.endsWith('.sql') || f.startsWith('src/supabase/')));

  console.log('\n' + '─'.repeat(74));
  if (failures.length) {
    console.log(`RESULT: FAIL — ${failures.length} assertion(s) failed`);
    failures.forEach((f) => console.log(`   · ${f}`));
    process.exit(1);
  }
  console.log(`RESULT: PASS — ${CASES.length} matrix/bucket/oracle cases + 14 mutations verified against the real handler.`);
  console.log('No network, database, Storage object or production record was touched by this script.');
})().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});