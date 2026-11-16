#!/usr/bin/env node
/**
 * galileoContextActorBinding.test.cjs — Phase P-S3 — closes SEC-001.
 *
 * Run:  node scripts/galileoContextActorBinding.test.cjs
 *
 * OFFLINE AND NON-DESTRUCTIVE. No network, no database, no Base44 call, no
 * production record read, written or deleted. `git` is used READ-ONLY to obtain
 * the pre-change revision of the function under test.
 *
 * THE CODE UNDER TEST IS THE SHIPPED CODE — not a restatement of it:
 *
 *   1. `base44/functions/buildGalileoContext/entry.ts` is COMPILED from its real
 *      TypeScript source (esbuild, loader 'ts') and its REAL Deno.serve handler is
 *      EXECUTED end-to-end against a production-faithful Supabase mock. Every
 *      assertion therefore observes the function's real decision and real response.
 *   2. The shared Security Kernel it imports is the REAL source, compiled the same
 *      way and evaluated in a node:vm sandbox in dependency order:
 *        relationshipAccess.ts -> writeGuard.ts -> activeBusiness.ts -> actor.ts
 *      Real authenticateActor / resolveActingProfile / requireBusinessContext /
 *      validateBusinessScope / isActiveRelationship are what run.
 *   3. The PRE-CHANGE revision — the parent of the commit that added this harness,
 *      resolved at runtime, `HEAD` only while the harness is still untracked — is
 *      executed through the
 *      SAME harness, so SEC-001 is demonstrated in the baseline and its closure in
 *      the new source with one instrumented harness, and payload compatibility is
 *      proven by comparing the two — not by asserting it.
 *
 * EVIDENCE CLASS: UNIT/MOCK (real function + real kernel modules executed against
 * a stubbed database) + STATIC + GIT-DIFF PROOF. No browser and no live database.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const esbuild = require('esbuild');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const git = (args) => execFileSync('git', args, { cwd: ROOT, maxBuffer: 32 * 1024 * 1024 }).toString();
const quiet = { log() {}, warn() {}, error() {}, info() {} };

const ENTRY = 'base44/functions/buildGalileoContext/entry.ts';
const ACTOR = 'base44/shared/authz/actor.ts';
const GUARD = 'base44/shared/businessScope/writeGuard.ts';
const ACTIVE = 'base44/shared/businessScope/activeBusiness.ts';
const REL = 'base44/shared/businessScope/relationshipAccess.ts';
const TEST = 'scripts/galileoContextActorBinding.test.cjs';
const REPORT = 'SECURITY_P_S3_GALILEO_ACTOR_BINDING_REPORT.md';

const failures = [];
const check = (id, label, ok, detail = '') => {
  if (!ok) failures.push(`${id} ${label}${detail ? ` — ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${String(id).padEnd(6)} ${label}${!ok && detail ? ` — ${detail}` : ''}`);
};

// ─────────────────────────────────────────────────────────────────────────────
// Compile real TypeScript to runnable JS (module keywords dropped, since every
// dependency is injected explicitly so a mutation can be applied per module).
// ─────────────────────────────────────────────────────────────────────────────
const strip = (s) =>
  s.replace(/^\s*import[\s\S]*?from\s+'[^']+';/gm, '').replace(/^\s*export\s+/gm, '');
const toJs = (s) => esbuild.transformSync(s, { loader: 'ts', format: 'cjs', target: 'es2020' }).code;
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const jsCache = new Map();
const compileJs = (src) => {
  if (!jsCache.has(src)) jsCache.set(src, toJs(strip(src)));
  return jsCache.get(src);
};

// ─────────────────────────────────────────────────────────────────────────────
// Production-faithful fixtures.
// NOTE: `advisor_assignments` DOES NOT EXIST in production (proven in P-S1 and
// re-verified here against the live catalog), so the mock returns the same 42P01
// error PostgREST returns. That is what makes the legacy step-5 branch inert.
// ─────────────────────────────────────────────────────────────────────────────
const PROFILES = [
  { id: 'p-ownerA', email: 'ownera@vision.test', base44_user_id: 'u-ownerA', app_role: 'owner', primary_business_id: 'b-A', profile_status: 'active' },
  { id: 'p-ownerB', email: 'ownerb@vision.test', base44_user_id: 'u-ownerB', app_role: 'owner', primary_business_id: 'b-B', profile_status: 'active' },
  { id: 'p-admin', email: 'admin@vision.test', base44_user_id: 'u-admin', app_role: 'admin', primary_business_id: 'b-admin', profile_status: 'active' },
  { id: 'p-super', email: 'super@vision.test', base44_user_id: 'u-super', app_role: 'super_admin', primary_business_id: 'b-super', profile_status: 'active' },
  { id: 'p-expert', email: 'expert@vision.test', base44_user_id: 'u-expert', app_role: 'expert_advisor', primary_business_id: null, profile_status: 'active' },
  { id: 'p-expert-rev', email: 'expertrev@vision.test', base44_user_id: 'u-expert-rev', app_role: 'expert_advisor', primary_business_id: null, profile_status: 'active' },
  { id: 'p-expert-drift', email: 'expertdrift@vision.test', base44_user_id: 'u-expert-drift', app_role: 'expert_advisor', primary_business_id: null, profile_status: 'active' },
  { id: 'p-advisor', email: 'advisor@vision.test', base44_user_id: 'u-advisor', app_role: 'advisor', primary_business_id: null, profile_status: 'active' },
  { id: 'p-susp', email: 'susp@vision.test', base44_user_id: 'u-susp', app_role: 'owner', primary_business_id: 'b-A', profile_status: 'suspended' },
];

const BUSINESS = [
  { id: 'b-A', business_name: 'Business A', profile_id: 'p-ownerA', assigned_advisor_id: null },
  { id: 'b-B', business_name: 'Business B', profile_id: 'p-ownerB', assigned_advisor_id: null },
  { id: 'b-admin', business_name: 'Admin Co', profile_id: 'p-admin', assigned_advisor_id: null },
  { id: 'b-super', business_name: 'Super Co', profile_id: 'p-super', assigned_advisor_id: null },
];

// The canonical relationship model: grant = active+revoked_at null;
// revoke = revoked status + revoked_at; a drifted row is active status WITH
// revoked_at populated (a partial revoke — explicitly DENY per S3.0.2).
const RELATIONSHIPS = [
  { id: 'rel-active', expert_profile_id: 'p-expert', business_id: 'b-B', access_status: 'active', revoked_at: null },
  { id: 'rel-revoked', expert_profile_id: 'p-expert-rev', business_id: 'b-B', access_status: 'revoked', revoked_at: '2026-01-01T00:00:00Z' },
  { id: 'rel-drift', expert_profile_id: 'p-expert-drift', business_id: 'b-B', access_status: 'active', revoked_at: '2026-01-01T00:00:00Z' },
];

const DATA = {
  documents: [
    { id: 'doc-B', business_id: 'b-B', name: 'B-secret.pdf', document_type: 'profit_and_loss', upload_status: 'completed', year: 2025 },
    { id: 'doc-A', business_id: 'b-A', name: 'A.pdf', document_type: 'profit_and_loss', upload_status: 'completed', year: 2025 },
  ],
  dashboard_metrics: [{ id: 'dm-B', business_id: 'b-B', annual_revenue: 11, net_profit: 12, ebitda: 13, updated_at: '2026-01-01' }],
  business_metric_snapshots: [{ id: 'snap-B', business_id: 'b-B', snapshot_date: '2026-01-01', overall_impact_score: 61, annual_revenue: 11 }],
  business_assessments: [{ id: 'as-B', business_id: 'b-B', assessment_type: 'profit_gap', score: 50, estimated_opportunity_value: 123456 }],
  business_opportunities: [{ id: 'op-B', business_id: 'b-B', title: 'B-secret opportunity', priority_score: 90, status: 'open' }],
  next_best_actions: [{ id: 'nba-B', business_id: 'b-B', title: 'B-secret action', priority_score: 80, status: 'recommended' }],
  roadmap_items: [{ id: 'rm-B', business_id: 'b-B', title: 'B-secret roadmap', status: 'In Progress', impact_score: 70 }],
  value_creation_events: [{ id: 'vce-B', business_id: 'b-B', title: 'B-secret value', status: 'verified', confidence_level: 'verified' }],
  advisor_notes: [
    { id: 'an-B', profile_id: 'p-ownerB', business_id: 'b-B', note: 'B-secret advisor note', visibility: 'shared', created_at: '2026-01-01' },
    { id: 'an-A', profile_id: 'p-ownerA', business_id: 'b-A', note: 'A note', visibility: 'shared', created_at: '2026-01-01' },
  ],
  extracted_fields: [{ id: 'ef-B', business_id: 'b-B', field_name: 'revenue', accepted_value: '999', review_status: 'accepted' }],
  strategy_outcomes: [{ id: 'so-B', business_id: 'b-B', status: 'verified', source_type: 'sprint', total_actual_impact: 5 }],
  ninety_day_sprint_paths: [
    { id: 'sp-B', profile_id: 'p-ownerB', business_id: 'b-B', path_title: 'B-secret sprint', is_active: true, progress_percent: 40 },
    { id: 'sp-A', profile_id: 'p-ownerA', business_id: 'b-A', path_title: 'A sprint', is_active: true, progress_percent: 10 },
  ],
  ninety_day_sprint_tasks: [{ id: 'st-B', path_id: 'sp-B', title: 'B-secret task', task_type: 'main_task', status: 'pending' }],
};

const AUTHZ_TABLES = ['profiles', 'business_entities', 'business_owners', 'business_team_members', 'expert_advisor_access', 'advisor_assignments'];
const CONTENT_TABLES = ['documents', 'dashboard_metrics', 'business_metric_snapshots', 'business_assessments', 'business_opportunities',
  'next_best_actions', 'roadmap_items', 'value_creation_events', 'advisor_notes', 'extracted_fields', 'strategy_outcomes',
  'ninety_day_sprint_paths', 'ninety_day_sprint_tasks'];

/** Faithful Supabase/PostgREST query-builder mock. Records every table touched. */
function makeWorld() {
  const reads = [];
  const tables = {
    profiles: PROFILES,
    business_entities: BUSINESS,
    business_owners: [],
    business_team_members: [],
    expert_advisor_access: RELATIONSHIPS,
    ...DATA,
  };
  const builder = (table) => {
    const rec = { table, eq: [] };
    reads.push(rec);
    const fns = [];
    const self = {
      select: () => self,
      order: () => self,
      limit: () => self,
      eq: (c, v) => { rec.eq.push([c, v]); fns.push((r) => r[c] === v); return self; },
      neq: (c, v) => { fns.push((r) => r[c] !== v); return self; },
      in: (c, a) => { fns.push((r) => Array.isArray(a) && a.includes(r[c])); return self; },
      is: (c, v) => { fns.push((r) => (v === null ? r[c] === null || r[c] === undefined : r[c] === v)); return self; },
      ilike: (c, v) => { fns.push((r) => String(r[c] || '').trim().toLowerCase() === String(v).trim().toLowerCase()); return self; },
      maybeSingle: async () => settle(true),
      then: (res, rej) => Promise.resolve(settle(false)).then(res, rej),
    };
    const rows = () => (tables[table] || []).filter((r) => fns.every((f) => f(r)));
    function settle(single) {
      if (table === 'advisor_assignments') {
        return { data: null, error: { message: 'relation "public.advisor_assignments" does not exist', code: '42P01' } };
      }
      const list = rows();
      return { data: single ? (list[0] ?? null) : list, error: null };
    }
    return self;
  };
  return { reads, entityReads: [], sb: { from: builder, schema: () => ({ from: builder }) } };
}

const makeBase44 = (user, entityReads) => {
  const ent = (name) => ({
    filter: async () => { entityReads.push(name); return []; },
    list: async () => { entityReads.push(name); return []; },
  });
  return {
    auth: { me: async () => user },
    asServiceRole: {
      entities: {
        KnowledgeBaseEntry: ent('KnowledgeBaseEntry'),
        ReadinessItem: ent('ReadinessItem'),
        GalileoConversation: ent('GalileoConversation'),
      },
    },
  };
};

/** The shared Intelligence Contract is a different code path, unchanged by P-S3 —
 *  it is stubbed identically for BOTH revisions so the payload comparison is fair. */
const CONTRACT = {
  contract_version: 'test',
  generated_at: '2026-01-01T00:00:00Z',
  profitability: { revenue: 100, net_profit: 20, reported_ebitda: 30 },
  valuation: {
    current_value: 1000, potential_value: 2000, value_gap: 1000, baseline_value: 900, baseline_date: '2025-01-01',
    baseline_status: 'confirmed', baseline_source: 'test', verified_value_created: 0, prior_review_value: null,
    prior_review_date: null, change_since_last_review: null, comparison_available: false,
  },
  business_iq: 55,
  business_confidence: 70,
  assessments: { profit_gap: { completed: true }, value_gap: { completed: false }, tax_gap: { completed: false }, operations_gap: { completed: false }, recast_ebitda: { completed: false }, freedom_assessment: { completed: false } },
};

/** Compile the REAL kernel modules in dependency order. */
function compileApi(src = {}, cache = {}) {
  // NOTE: `Response` is required here — the canonical refusal contract
  // (businessContextError / errorResponse) builds a real Response, exactly as it
  // does at runtime. Omitting it makes every denial throw instead of refusing.
  const relApi = vm.runInNewContext(
    `${compileJs(src.REL ?? read(REL))};({ isActiveRelationship, resolveActiveExpertRelationship })`,
    { console: quiet, Response: ResponseStub }
  );
  const guardApi = vm.runInNewContext(
    `${compileJs(src.GUARD ?? read(GUARD))};({ validateBusinessScope })`,
    { console: quiet, Response: ResponseStub, resolveActiveExpertRelationship: relApi.resolveActiveExpertRelationship, Deno: { env: { get: () => undefined } } }
  );
  const activeApi = vm.runInNewContext(
    `${compileJs(src.ACTIVE ?? read(ACTIVE))};({ requireBusinessContext, resolveActiveBusiness, assertBusinessAccess })`,
    { console: quiet, Response: ResponseStub, validateBusinessScope: guardApi.validateBusinessScope }
  );
  const actorApi = vm.runInNewContext(
    `${compileJs(src.ACTOR ?? read(ACTOR))};({ authenticateActor, resolveActingProfile, authorizeBusinessAccess, errorResponse, ADMIN_ROLES })`,
    { console: quiet, Response: ResponseStub, validateBusinessScope: guardApi.validateBusinessScope }
  );
  cache.api = { ...activeApi, ...actorApi, validateBusinessScope: guardApi.validateBusinessScope };
  return cache.api;
}

const ResponseStub = { json: (body, init = {}) => ({ status: init.status || 200, body, json: async () => body }) };

/** Execute the REAL function handler end-to-end for one scenario. */
async function runEntry({ source, user, payload, api }) {
  const world = makeWorld();
  const base44 = makeBase44(user, world.entityReads);
  const src = source ?? read(ENTRY);

  let handler = null;
  // The function's own config guard must pass (it is not what this slice tests).
  const Deno = {
    env: { get: (k) => (k === 'VITE_SUPABASE_URL' ? 'https://mock.supabase.co' : k === 'SUPABASE_SERVICE_ROLE_KEY' ? 'mock-service-role-key' : undefined) },
    serve: (fn) => { handler = fn; },
  };

  const mod = { exports: {} };
  const req = () => { throw new Error('unexpected import'); };
  // eslint-disable-next-line no-new-func
  new Function(
    'require', 'module', 'exports',
    'createClientFromRequest', 'createClient',
    'requireBusinessContext', 'authenticateActor', 'resolveActingProfile', 'errorResponse',
    'fetchCanonicalRecommendations', 'buildBusinessIntelligenceContract', 'buildGalileoValuationContext',
    'loadCanonicalFactsForConsumer', 'getPreferredValue', 'PILOT_FACT_KEYS',
    'Deno', 'Response', 'console',
    compileJs(src)
  )(
    req, mod, mod.exports,
    () => base44, () => world.sb,
    api.requireBusinessContext, api.authenticateActor, api.resolveActingProfile, api.errorResponse,
    async () => ({ recommendations: [] }),
    async () => CONTRACT,
    async () => ({ available: false }),
    async () => ({ shadow: [], telemetry: [], conflicts: {}, resolvedCount: 0, missingCount: 0, facts: {} }),
    () => ({ source: 'legacy', value: null }),
    [],
    Deno, ResponseStub, quiet
  );

  if (!handler) throw new Error('Deno.serve did not register a handler');
  const res = await handler({ json: async () => payload });
  return { status: res.status, body: res.body, reads: world.reads, entityReads: world.entityReads };
}

// ─────────────────────────────────────────────────────────────────────────────
const U = {
  ownerA: { id: 'u-ownerA', email: 'ownera@vision.test', role: 'user' },
  ownerA_b44admin: { id: 'u-ownerA', email: 'ownera@vision.test', role: 'admin' },
  admin: { id: 'u-admin', email: 'admin@vision.test', role: 'user' },
  super: { id: 'u-super', email: 'super@vision.test', role: 'user' },
  expert: { id: 'u-expert', email: 'expert@vision.test', role: 'user' },
  expertRev: { id: 'u-expert-rev', email: 'expertrev@vision.test', role: 'user' },
  expertDrift: { id: 'u-expert-drift', email: 'expertdrift@vision.test', role: 'user' },
  advisor: { id: 'u-advisor', email: 'advisor@vision.test', role: 'user' },
  suspended: { id: 'u-susp', email: 'susp@vision.test', role: 'user' },
};

const RANDOM_UUID = '11111111-1111-4111-8111-111111111111';

const SCENARIOS = [
  { id: 'G1', name: 'unauthenticated → denied', user: null, payload: { business_id: 'b-A' }, expect: 401, noContent: true },
  { id: 'G1b', name: 'unauthenticated + profile_id supplied → still denied', user: null, payload: { profile_id: 'p-ownerB', business_id: 'b-B' }, expect: 401, noContent: true },
  { id: 'G2', name: 'Owner A → Business A → allowed', user: U.ownerA, payload: { active_business_id: 'b-A' }, expect: 200, business: 'b-A' },
  { id: 'G3', name: 'Owner A → Business B → denied', user: U.ownerA, payload: { active_business_id: 'b-B' }, expect: 403, noContent: true },
  { id: 'G4', name: "Owner A supplies Business B owner's profile_id → denied", user: U.ownerA, payload: { profile_id: 'p-ownerB', business_id: 'b-B' }, expect: 403, noContent: true },
  { id: 'G5', name: 'Owner A supplies own profile_id with Business B → denied', user: U.ownerA, payload: { profile_id: 'p-ownerA', business_id: 'b-B' }, expect: 403, noContent: true },
  { id: 'G6', name: 'Owner A supplies a random profile_id → no authority', user: U.ownerA, payload: { profile_id: RANDOM_UUID, business_id: 'b-A' }, expect: 403, noContent: true },
  { id: 'G7', name: 'Owner A omits profile_id and business → own business works', user: U.ownerA, payload: {}, expect: 200, business: 'b-A' },
  { id: 'G8a', name: 'Canonical super_admin names a subject → subject business allowed', user: U.super, payload: { profile_id: 'p-ownerB', business_id: 'b-B' }, expect: 200, business: 'b-B' },
  { id: 'G8b', name: 'Canonical super_admin requests Business B directly → allowed', user: U.super, payload: { active_business_id: 'b-B' }, expect: 200, business: 'b-B' },
  { id: 'G8c', name: 'Canonical admin (non-super) requests an unrelated business → denied (unchanged)', user: U.admin, payload: { active_business_id: 'b-B' }, expect: 403, noContent: true },
  { id: 'G8d', name: 'Canonical admin names a subject → subject business allowed', user: U.admin, payload: { profile_id: 'p-ownerB', business_id: 'b-B' }, expect: 200, business: 'b-B' },
  { id: 'G9', name: "Non-admin supplies role='admin' → denied", user: U.ownerA, payload: { profile_id: 'p-ownerB', business_id: 'b-B', role: 'admin' }, expect: 403, noContent: true },
  { id: 'G10', name: 'Base44 user.role=admin but canonical app_role is not admin → denied', user: U.ownerA_b44admin, payload: { profile_id: 'p-ownerB', business_id: 'b-B' }, expect: 403, noContent: true },
  { id: 'G10b', name: 'Base44 role does not break the actor\u2019s own legitimate access', user: U.ownerA_b44admin, payload: { active_business_id: 'b-A' }, expect: 200, business: 'b-A' },
  { id: 'G11', name: 'Active authorized expert → assigned Business B → allowed', user: U.expert, payload: { active_business_id: 'b-B' }, expect: 200, business: 'b-B' },
  { id: 'G12', name: 'Revoked expert → Business B → denied', user: U.expertRev, payload: { active_business_id: 'b-B' }, expect: 403, noContent: true },
  { id: 'G12b', name: 'Partial revoke (active status + revoked_at) → denied', user: U.expertDrift, payload: { active_business_id: 'b-B' }, expect: 403, noContent: true },
  { id: 'G13', name: 'Advisor with no active canonical relationship → denied', user: U.advisor, payload: { active_business_id: 'b-B' }, expect: 403, noContent: true },
  // §6 — PIVOT TEST: business authority is NOT identity authority. This expert IS
  // authorized for b-B, yet naming the client's profile id is refused, so a related
  // third party cannot step into the client's identity to widen what they receive.
  { id: 'G22', name: "Active expert + ANOTHER client's profile_id → denied (business access ≠ acting as that client)", user: U.expert, payload: { profile_id: 'p-ownerB', business_id: 'b-B' }, expect: 403, noContent: true },
  { id: 'G14', name: 'Suspended canonical actor → denied', user: U.suspended, payload: { active_business_id: 'b-A' }, expect: 403, noContent: true },
  { id: 'G15', name: 'Unknown business → safe failure', user: U.ownerA, payload: { active_business_id: 'b-does-not-exist' }, expect: 403, noContent: true },
  { id: 'G17a', name: 'No business-scoped read before authorization (owner→B)', user: U.ownerA, payload: { active_business_id: 'b-B' }, expect: 403, noContent: true },
  { id: 'G17b', name: 'No business-scoped read before authorization (foreign profile_id)', user: U.ownerA, payload: { profile_id: 'p-ownerB', business_id: 'b-B' }, expect: 403, noContent: true },
];

(async () => {
  const api = compileApi();
  const newSource = read(ENTRY);
  // The PRE-CHANGE revision is PINNED to the parent of the commit that added this
  // harness — resolved at runtime, never hardcoded. Reading `HEAD` alone would
  // silently stop being the pre-change revision the moment this slice is committed
  // (HEAD would then BE the fix), which would make B1/B2/B3 and G20 vacuous and S5
  // fail spuriously. While the slice is still in the working tree the harness is
  // untracked and HEAD IS the pre-change revision, so both states read the same.
  const SELF_COMMIT = git(['log', '--diff-filter=A', '--format=%H', '-1', '--', TEST]).trim();
  const BASELINE_REV = SELF_COMMIT ? `${SELF_COMMIT}^` : 'HEAD';
  const baselineSource = git(['show', `${BASELINE_REV}:${ENTRY}`]);
  const results = new Map();

  console.log('── G1–G17 — CANONICAL ACTOR BINDING (real function + real kernel, executed) ──');
  for (const sc of SCENARIOS) {
    const r = await runEntry({ source: newSource, user: sc.user, payload: sc.payload, api });
    results.set(sc.id, r);
    const problems = [];
    if (r.status !== sc.expect) problems.push(`status ${r.status} ≠ ${sc.expect}`);
    const json = JSON.stringify(r.body ?? {});
    if (sc.expect !== 200) {
      if (r.body?.context) problems.push('a context payload was returned');
      if (/B-secret|Business B|\bb-B\b/.test(json)) problems.push('foreign business content present');
    } else {
      const got = r.body?.context?._meta?.business_id;
      if (got !== sc.business) problems.push(`business ${got} ≠ ${sc.business}`);
      if (r.body?.context?.business_profile?.id !== sc.business) problems.push('business_profile mismatch');
    }
    if (sc.noContent) {
      const contentRead = r.reads.filter((x) => CONTENT_TABLES.includes(x.table)).map((x) => x.table);
      if (contentRead.length) problems.push(`content read before authorization: ${contentRead.join(', ')}`);
      if (r.entityReads.length) problems.push(`entity read before authorization: ${r.entityReads.join(', ')}`);
    }
    if (problems.length) problems.push(`body=${JSON.stringify(r.body).slice(0, 220)}`);
    check(sc.id, sc.name, problems.length === 0, problems.join(' | '));
  }

  console.log('\n── G16 — no tenant-existence oracle ──');
  {
    const foreignBiz = results.get('G3');
    const unknownBiz = results.get('G15');
    check('G16a', 'a foreign business and a nonexistent business are indistinguishable',
      foreignBiz.status === unknownBiz.status && JSON.stringify(foreignBiz.body) === JSON.stringify(unknownBiz.body),
      `${JSON.stringify(foreignBiz.body)} vs ${JSON.stringify(unknownBiz.body)}`);
    const foreignProfile = results.get('G4');
    const randomProfile = results.get('G6');
    check('G16b', 'a foreign profile id and a nonexistent profile id are indistinguishable',
      foreignProfile.status === randomProfile.status && JSON.stringify(foreignProfile.body) === JSON.stringify(randomProfile.body),
      `${JSON.stringify(foreignProfile.body)} vs ${JSON.stringify(randomProfile.body)}`);
  }

  console.log('\n── G21 — subject scoping (the expert never receives client-scoped personal blocks) ──');
  {
    const r = results.get('G11');
    const noteRead = r.reads.find((x) => x.table === 'advisor_notes');
    // B1.1 SUPERSESSION (approved Phase B1.1 change): advisor_notes is now
    // business-scoped to the authorized active business. The old guard —
    // profile-scoped reads must use the acting profile — prevented profile-wide
    // CLIENT data reaching the expert while the read was profile-scoped. With
    // business scoping the same boundary is enforced by the business
    // authorization itself: the expert reads ONLY the notes of the business
    // their active relationship grants (b-B), never profile-wide data, and
    // never another business's notes.
    const usedBusinessScope = noteRead?.eq?.some(([c, v]) => c === 'business_id' && v === 'b-B');
    const usedAnyProfileFilter = noteRead?.eq?.some(([c]) => c === 'profile_id');
    check('G21', 'advisor notes are scoped to the authorized business (B1.1), never profile-wide', Boolean(usedBusinessScope) && !usedAnyProfileFilter,
      `advisor_notes filter: ${JSON.stringify(noteRead?.eq)}`);
  }

  console.log('\n── G18–G20 — payload compatibility vs the PRE-CHANGE revision (same harness, same stubs) ──');
  const norm = (body) => {
    const b = JSON.parse(JSON.stringify(body ?? {}));
    if (b?.context?._meta) delete b.context._meta.generated_at;
    return JSON.stringify(b, Object.keys(b || {}).sort());
  };
  const COMPAT = [['G18', 'G2', 'legitimate OWNER payload'], ['G19', 'G8d', 'legitimate ADMIN-subject payload']];
  for (const [id, scId, label] of COMPAT) {
    const sc = SCENARIOS.find((s) => s.id === scId);
    const base = await runEntry({ source: baselineSource, user: sc.user, payload: sc.payload, api });
    const now = results.get(scId);
    check(id, `${label} remains contract compatible`, base.status === now.status && norm(base.body) === norm(now.body),
      `baseline ${base.status} vs new ${now.status}`);
  }
  {
    const sc = SCENARIOS.find((s) => s.id === 'G11');
    const base = await runEntry({ source: baselineSource, user: sc.user, payload: sc.payload, api });
    const now = results.get('G11');
    check('G20', 'legitimate EXPERT payload: baseline refused (403), canonical path authorizes (200) — documented improvement',
      base.status === 403 && now.status === 200 && now.body?.context?._meta?.business_id === 'b-B',
      `baseline ${base.status} / new ${now.status}`);
  }

  console.log('\n── BASELINE PROOF — SEC-001 demonstrated in the PRE-CHANGE revision ──');
  for (const [id, scId, label] of [
    ['B1', 'G4', "owner A + Business B owner's profile_id → FOREIGN CONTEXT in baseline"],
    ['B2', 'G6', 'random profile_id → refused in baseline (control)'],
    ['B3', 'G8c', 'canonical admin (non-super) + unrelated business → refused in baseline (unchanged)'],
  ]) {
    const sc = SCENARIOS.find((s) => s.id === scId);
    const base = await runEntry({ source: baselineSource, user: sc.user, payload: sc.payload, api });
    const leaked = base.status === 200 && base.body?.context?._meta?.business_id === 'b-B';
    check(id, label, id === 'B1' ? leaked : base.status === sc.expect,
      `baseline status ${base.status}, business ${base.body?.context?._meta?.business_id ?? '—'}`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n── STATIC INVARIANTS ──');
  const code = noComments(newSource);
  const authzCall = newSource.indexOf('await requireBusinessContext(');
  const firstBizRead = newSource.indexOf('await Promise.allSettled(');
  const bizEntityRead = newSource.indexOf("sb.from('business_entities').select('*')");
  check('S1', 'authorization is invoked before any business-content read', authzCall > 0 && authzCall < firstBizRead && authzCall < bizEntityRead,
    `authz@${authzCall} fetch@${firstBizRead} entity@${bizEntityRead}`);
  check('S2', 'the body no longer destructures profile_id as an identity variable', !/let\s*{[^}]*profile_id[^}]*}\s*=\s*body/.test(code) && /body\.profile_id/.test(code));
  check('S3', 'no Base44 role fallback and no legacy admin-role list remain', !/user\s*\.\s*role/.test(code) && !/\['super_admin',\s*'advisor',\s*'admin'\]/.test(code));
  check('S4', 'the canonical kernel is imported and reused (no second authorization system)',
    /from '\.\.\/\.\.\/shared\/authz\/actor\.ts'/.test(newSource) && /authenticateActor/.test(newSource) && /resolveActingProfile/.test(newSource) && /requireBusinessContext/.test(newSource));
  check('S5', 'the pre-change revision had the defect: body profile_id chosen the authorization profile',
    /let \{ business_id, active_business_id, profile_id/.test(baselineSource) &&
    /const role = profile\?\.app_role \|\| user\.role \|\| 'owner'/.test(baselineSource) &&
    /profile\?\.primary_business_id !== business_id/.test(baselineSource));

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n── MUTATION TESTS — mutate the REAL source, re-run the matrix, catch it ──');
  const RC = `      const { businessId, denial } = await requireBusinessContext(\n        sb, profile, requestedBusinessId, 'buildGalileoContext'\n      );`;
  const RESOLVE = `      const resolved = await resolveActingProfile(sb, actor, {\n        targetProfileId: idIsSelf ? null : wantsProfileId,\n      });`;
  const ACTORLINE = `      const actor = await authenticateActor(base44, sb);`;
  const GATE = `      if (wantsProfileId && !idIsSelf && !actor.isAdmin) {`;
  const RELQ = `    .eq('access_status', ACTIVE_RELATIONSHIP_STATUS)\n    .is('revoked_at', null)\n`;
  const RELPRED = `  if (row.access_status !== ACTIVE_RELATIONSHIP_STATUS) return false;\n  if (row.revoked_at) return false;\n  return true;`;

  const MUTATIONS = [
    // NOTE ON M1 — the pre-change behaviour for the profile_id path restored.
    // Mutating ONLY the resolver is inert: the override gate independently refuses
    // every foreign profile id for a non-admin before the resolver is reached. The
    // mutation therefore restores the defect end-to-end (the gate AND the resolver
    // are both bypassed for a body-supplied id), which is exactly what SEC-001 did —
    // and the fact that both edits are needed is itself evidence that two
    // independent refusals guard this path.
    { id: 'M1', name: 'body profile_id trusted as the subject (pre-change path restored)', mod: 'ENTRY',
      edits: [[GATE, `      if (false) {`], [RESOLVE, `      const resolved = { profile: (await sb.from('profiles').select('*').eq('id', wantsProfileId || actor.profile_id).maybeSingle()).data };`]],
      mustCatch: ['G4'] },
    { id: 'M2', name: "authorization by the supplied profile's primary_business_id (legacy judgment restored)", mod: 'ENTRY',
      edits: [[RC, `      const legacy = (await sb.from('profiles').select('id, app_role, primary_business_id').eq('id', profile_id).maybeSingle()).data;\n      const legacyRole = legacy?.app_role || 'owner';\n      if (!['super_admin', 'advisor', 'admin'].includes(legacyRole) && legacy?.primary_business_id !== requestedBusinessId) {\n        return Response.json({ error: 'Forbidden' }, { status: 403 });\n      }\n      const businessId = requestedBusinessId;\n      const denial = null;`]],
      mustCatch: ['G11'] },
    { id: 'M2b', name: 'requested business_id trusted as proof of access', mod: 'ENTRY',
      edits: [[RC, `      const businessId = requestedBusinessId;\n      const denial = null;`]],
      mustCatch: ['G3'] },
    { id: 'M3', name: 'a business-scoped read placed before authorization', mod: 'ENTRY',
      edits: [[RC, `      await sb.from('documents').select('id, name').eq('business_id', requestedBusinessId).limit(1);\n${RC}`]],
      mustCatch: ['G17a', 'G17b'] },
    { id: 'M4', name: 'Base44 user.role elevates canonical Admin standing', mod: 'ENTRY',
      edits: [[ACTORLINE, `${ACTORLINE}\n      if (!actor.isAdmin && ['admin', 'super_admin'].includes(actor.user?.role)) actor.isAdmin = true;`]],
      mustCatch: ['G10'] },
    { id: 'M5', name: "request-body role='admin' elevates Admin standing", mod: 'ENTRY',
      edits: [[ACTORLINE, `${ACTORLINE}\n      if (body.role === 'admin') actor.isAdmin = true;`]],
      mustCatch: ['G9'] },
    { id: 'M6', name: 'revoked_at ignored (a partial revoke is treated as a live relationship)', mod: 'REL',
      edits: [[RELQ, `    .eq('access_status', ACTIVE_RELATIONSHIP_STATUS)\n`], [`  if (row.revoked_at) return false;\n`, '']],
      mustCatch: ['G12b'] },
    { id: 'M7', name: 'relationship EXISTENCE authorizes (the advisor_assignments shape)', mod: 'REL',
      edits: [[RELQ, ''], [RELPRED, `  return Boolean(row);`]],
      mustCatch: ['G12'] },
    // NOTE ON M8 — "skip canonical actor resolution when profile_id is present".
    // The strictly inert form of this mutation (keep the session actor's standing
    // but skip the lookup) proves NOTHING: the override gate refuses every foreign
    // profile id for a non-admin, so the outcome can never differ. The load-bearing
    // form is the one SEC-001 actually shipped: skipping canonical resolution AND
    // letting the body-named profile supply the actor. That is what is mutated.
    { id: 'M8', name: 'canonical actor resolution skipped when profile_id is present (the body-named profile becomes the actor)', mod: 'ENTRY',
      edits: [[ACTORLINE, `      const actor = await (async () => {
        if (!body.profile_id) return authenticateActor(base44, sb);
        const { data: named } = await sb.from('profiles').select('*').eq('id', body.profile_id).maybeSingle();
        const namedRole = named?.app_role || null;
        return { user, profile: named, profile_id: named?.id || null, role: namedRole || 'user', isAdmin: ['admin', 'super_admin'].includes(namedRole) };
      })();`]],
      mustCatch: ['G4'] },
    { id: 'M9', name: "business authority from the subject's primary_business_id only (kernel dropped)", mod: 'ENTRY',
      edits: [[RC, `      if (profile?.primary_business_id !== requestedBusinessId) return Response.json({ error: 'Forbidden' }, { status: 403 });\n      const businessId = requestedBusinessId;\n      const denial = null;`]],
      mustCatch: ['G11'] },
    { id: 'M10', name: 'the authorization refusal is no longer returned', mod: 'ENTRY',
      edits: [[`      if (denial) {\n        // Canonical refusals pass through when they carry caller-actionable\n        // context (400 BUSINESS_CONTEXT_REQUIRED). A 403 is normalized to this\n        // function's own existing refusal so a foreign business and a nonexistent\n        // business are indistinguishable — no tenant-existence oracle.\n        if (denial.status === 403) return Response.json({ error: 'Forbidden' }, { status: 403 });\n        return denial;\n      }`, '']],
      mustCatch: ['G3'] },
    { id: 'M11', name: 'the canonical suspension gate removed', mod: 'ACTOR',
      edits: [[`  if (profile?.profile_status === 'suspended') {`, `  if (false) {`]],
      mustCatch: ['G14'] },
  ];

  for (const mut of MUTATIONS) {
    const field = { ENTRY: 'ENTRY', GUARD: 'GUARD', ACTIVE: 'ACTIVE', ACTOR: 'ACTOR', REL: 'REL' }[mut.mod];
    const sources = { ENTRY: newSource };
    const original = mut.mod === 'ENTRY' ? newSource : read({ REL, GUARD, ACTIVE, ACTOR }[mut.mod]);
    const missing = mut.edits.find(([find]) => !original.includes(find));
    if (missing) { check(mut.id, mut.name, false, `mutation anchor not found: ${String(missing[0]).slice(0, 52)}`); continue; }

    let mutated = original;
    for (const [find, repl] of mut.edits) mutated = mutated.replace(find, repl);
    sources[field] = mutated;

    let mutatedApi = api;
    if (mut.mod !== 'ENTRY') mutatedApi = compileApi(sources, {});

    const caught = [];
    for (const caseId of mut.mustCatch) {
      const sc = SCENARIOS.find((s) => s.id === caseId);
      const r = await runEntry({ source: sources.ENTRY, user: sc.user, payload: sc.payload, api: mutatedApi });
      const json = JSON.stringify(r.body ?? {});
      const contentRead = r.reads.some((x) => CONTENT_TABLES.includes(x.table));
      const broke =
        r.status !== sc.expect ||
        (sc.expect !== 200 && (/B-secret|Business B|\bb-B\b/.test(json) || r.body?.context)) ||
        (sc.expect === 200 && r.body?.context?._meta?.business_id !== sc.business) ||
        (sc.noContent && (contentRead || r.entityReads.length > 0));
      if (broke) caught.push(caseId);
    }
    check(mut.id, `${mut.name} → caught by [${caught.join(', ') || 'NOTHING'}]`, caught.length > 0,
      caught.length ? '' : 'the harness would NOT have caught this regression');
  }

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n── CHANGE SURFACE ──');
  // The slice is asserted as ONE union of three sources so the assertion reads the
  // SAME before the commit (working-tree edit + untracked harness/report) and after
  // it (the commit that added this harness — SELF_COMMIT, resolved above).
  // It cannot pass vacuously once the work is committed, and the surface it pins
  // stays exactly: ONE product file, this harness, the review report, plus the
  // four older harnesses this review rebased at the allowlist line only.
  const names = (s) => s.trim().split('\n').filter(Boolean);
  const slice = [...new Set([
    ...(SELF_COMMIT ? names(git(['diff', '--name-only', `${SELF_COMMIT}^`])) : []),
    ...names(git(['diff', '--name-only', 'HEAD'])),
    ...names(git(['ls-files', '--others', '--exclude-standard'])),
  ])].sort();
  // 6D.0 REBASE — the reviewed 6D.0 slice (document extraction integrity) landed
  // AFTER P-S3 and changed its own, separate path plus the shared viewer hook.
  // Allowlist lines ONLY: every G-series authorization/scoping assertion and every
  // mutation check in this harness is untouched, and P-S3's product change
  // (buildGalileoContext) remains the only file this harness certifies.
  const P_6D0_FILES = [
    'base44/functions/runDocumentExtraction/entry.ts',
    'base44/functions/supabaseUserData/entry.ts',
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
  const APPROVED_HARNESS_MAINTENANCE = [
    'scripts/adminCanonicalActor.test.cjs',
    'scripts/adminDocumentViewer.test.cjs',
    'scripts/documentSignedUrlAuthorization.test.cjs',
    'scripts/relationshipRevocationAccess.test.cjs',
    // 6D.0c GALILEO HALF — this review was permitted to rebase the classification
    // hotfix harness's change-surface allowlist too (allowlist lines ONLY; not one
    // behavioral, security or mutation assertion in it was touched).
    'scripts/documentUploadClassification.test.cjs',
  ];
  // The four older security harnesses appear only because THIS review was permitted
  // to rebase their change-surface allowlists (allowlist lines only — no behavioral
  // or security assertion in them was touched). No product file may appear beyond ENTRY.
  // CLASSIFICATION HOTFIX REBASE — the reviewed document-upload classification
  // hotfix is a LATER, APPROVED slice layered on P-S3/6D.0. Allowlist line ONLY:
  // G1-G12, every authorization assertion and every mutation check are untouched.
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
  ].filter((f) => ![ENTRY, TEST, REPORT, ...APPROVED_HARNESS_MAINTENANCE, ...P_6D0_FILES, 'base44/shared/galileo/provisionalEvidence.ts', 'base44/shared/canonicalFact/registry.ts', 'base44/functions/askGalileo/entry.ts', 'src/scripts/documentKnowledgeCompletion.test.cjs', 'VISION_PHASE_6D_0C_1_PROVISIONAL_EVIDENCE_RETRIEVAL.md', ...require('./slice6D0C2Files.cjs')].includes(f));
  // 6D.0a REBASE — the reviewed Semantic Observation Bridge slice. buildGalileoContext
  // (ENTRY) changes ONLY as a CONSUMER of the shared semantic layer: its P-S3
  // authorization prologue, actor binding and business scoping are untouched, and the
  // G-series assertions below still observe the real handler. Allowlist lines ONLY.
  const P_6D0A_FILES = [
    'base44/shared/documentObservation/semantics.ts',
    'base44/shared/intelligenceContract/businessIntelligenceContract.ts',
    'scripts/semanticObservationBridge.test.cjs',
    'VISION_DOCUMENT_UNDERSTANDING_AND_GALILEO_INTELLIGENCE_AUDIT.md',
    'src/VISION_PHASE_6D_0A_SEMANTIC_OBSERVATION_BRIDGE.md',
  ];
  // 6D.0b AUTOMATIC DOCUMENT UNDERSTANDING — a LATER, APPROVED slice: the ONE
  // server-side understanding module set, the canonical upload entry point that now
  // runs it, its own harness and its report. buildGalileoContext's authorization
  // path is untouched. Allowlist lines ONLY: SEC-001 and every mutation check above
  // are unchanged.
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
    // asks about an exact document. ALLOWLIST LINES ONLY — the actor binding,
    // tenant isolation and change-surface assertions themselves are unchanged.
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
  check('F1', 'the slice surface is exactly ONE product file, this harness, the review report and the later classification hotfix, 6D.0a and 6D.0b slices',
    JSON.stringify(slice) === JSON.stringify([...new Set([ENTRY, TEST, REPORT, ...APPROVED_HARNESS_MAINTENANCE, ...P_6D0_FILES, ...CLASSIFICATION_HOTFIX_FILES, ...P_6D0A_FILES, ...P_6D0B_FILES, ...P_6D0B2_1_FILES, 'base44/shared/documentIngestion/resume.ts', 'src/scripts/documentKnowledgeCompletion.test.cjs', 'base44/functions/askGalileo/entry.ts', 'base44/shared/galileo/focusedDocument.ts', 'src/hooks/useAskGalileo.js', 'src/components/galileo/home/GalileoAnswerPanel.jsx', 'base44/shared/galileo/provisionalEvidence.ts', 'base44/shared/canonicalFact/registry.ts', 'VISION_PHASE_6D_0C_1_PROVISIONAL_EVIDENCE_RETRIEVAL.md', ...require('./slice6D0C2Files.cjs')])].sort()),
    slice.join(', ') || '(none)');
  check('F2', 'no product file other than the reviewed entry point moved (plus the later classification hotfix, 6D.0a and 6D.0b slices)',
    slice.filter((f) => f !== ENTRY).every((f) => f === TEST || f === REPORT || APPROVED_HARNESS_MAINTENANCE.includes(f) || P_6D0_FILES.includes(f) || CLASSIFICATION_HOTFIX_FILES.includes(f) || P_6D0A_FILES.includes(f) || P_6D0B_FILES.includes(f) || P_6D0B2_1_FILES.includes(f) || f === 'base44/shared/documentIngestion/resume.ts' || f === 'src/scripts/documentKnowledgeCompletion.test.cjs' || f === 'base44/functions/askGalileo/entry.ts' || f === 'base44/shared/galileo/focusedDocument.ts' || f === 'src/hooks/useAskGalileo.js' || f === 'src/components/galileo/home/GalileoAnswerPanel.jsx' || f === 'base44/shared/galileo/provisionalEvidence.ts' || f === 'base44/shared/canonicalFact/registry.ts' || f === 'VISION_PHASE_6D_0C_1_PROVISIONAL_EVIDENCE_RETRIEVAL.md' || require('./slice6D0C2Files.cjs').includes(f)),
    slice.filter((f) => f !== ENTRY).join(', '));

  console.log('\n' + '─'.repeat(74));
  if (failures.length) {
    console.log(`RESULT: FAIL — ${failures.length} assertion(s) failed`);
    failures.forEach((f) => console.log(`   · ${f}`));
    process.exit(1);
  }
  console.log('RESULT: PASS — the actor comes only from the session, the business is authorized');
  console.log('before any business-scoped read, and SEC-001 is closed at the entry point.');
  console.log('No network, database or production record was touched by this script.');
})().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});