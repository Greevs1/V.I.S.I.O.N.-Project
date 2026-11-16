#!/usr/bin/env node
/**
 * adminCanonicalActor.test.cjs — Phase P3: canonical admin actor resolution in
 * supabaseUserData, extended by S3.0 with the canonical ACTOR suspension gate.
 *
 * Run:  node scripts/adminCanonicalActor.test.cjs
 *
 * OFFLINE AND NON-DESTRUCTIVE. No network, no database, no Base44 call, no
 * production record read, written or deleted. `git` is used read-only to compare
 * against the committed pre-P3 revision.
 *
 * THE CODE UNDER TEST IS THE SHIPPED CODE — not a restatement of it:
 *
 *   1. `base44/shared/authz/actor.ts` is COMPILED from its real TypeScript source
 *      (esbuild, loader 'ts' — the same source the platform runs; only the module
 *      `import`/`export` keywords are removed) and evaluated in a node:vm sandbox.
 *      Its REAL authenticateActor / resolveActingProfile / ADMIN_ROLES /
 *      errorResponse are executed; only the pure business-scope guard is stubbed.
 *   2. The REAL `resolveOverrideTarget` function is brace-matched out of the real
 *      `base44/functions/supabaseUserData/entry.ts`, compiled the same way, and
 *      evaluated in that sandbox with those real helpers in scope.
 *
 * The adversarial matrix (A–R) therefore exercises the production decision path,
 * and the mutation section mutates THAT extracted source and re-runs the matrix.
 *
 * EVIDENCE CLASS: UNIT/MOCK (sandboxed real modules) + STATIC/CONTROL-FLOW +
 * GIT-DIFF PROOF. No browser and no live database was used.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const esbuild = require('esbuild');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
/** Whitespace-insensitive digest: proves CONTENT equality, not formatting. */
const contentSha = (s) => sha(String(s).replace(/\s+/g, ' ').trim());
const git = (args) => execFileSync('git', args, { cwd: ROOT, maxBuffer: 32 * 1024 * 1024 }).toString();

// ─────────────────────────────────────────────────────────────────────────────
// PRE-P3 BASELINE — why the comparison target is NOT `HEAD`.
// P3 is COMMITTED (see P3_COMMIT), so `HEAD:<file>` IS the fixed revision. Using
// HEAD as "before" compares the fix against itself and passes vacuously — which
// is exactly what happened on the first post-commit run (S11 saw email 0→0).
// The baseline is resolved at runtime, never hardcoded:
//   P3_COMMIT = the commit that ADDED this harness
//   BASELINE  = that commit's parent — the last revision before the P3 change
// ─────────────────────────────────────────────────────────────────────────────
const P3_COMMIT = git(['log', '--diff-filter=A', '--format=%H', '-1', '--', 'scripts/adminCanonicalActor.test.cjs']).trim();
const BASELINE = git(['rev-parse', `${P3_COMMIT}^`]).trim();
const baselineOf = (p) => git(['show', `${BASELINE}:${p}`]);

const ENTRY = 'base44/functions/supabaseUserData/entry.ts';
const ACTOR = 'base44/shared/authz/actor.ts';
const DOC_ACCESS = 'base44/shared/authz/documentAccess.ts';
const DOC_ADMIN = 'base44/functions/getDocumentsAdmin/entry.ts';
const STORAGE_SQL = 'src/supabase/migrations/phase_s2_storage_containment.sql';

const failures = [];
const check = (label, ok, detail = '') => {
  if (!ok) failures.push(detail ? `${label} — ${detail}` : label);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? ` — ${detail}` : ''}`);
};

// ─────────────────────────────────────────────────────────────────────────────
// Compile the REAL TypeScript to runnable JS (same code, module keywords dropped)
// ─────────────────────────────────────────────────────────────────────────────
const strip = (s) => s
  .replace(/^\s*import[\s\S]*?from\s+'[^']+';/gm, '')
  .replace(/^\s*export\s+/gm, '');
const toJs = (ts) => esbuild.transformSync(ts, { loader: 'ts', format: 'esm', target: 'es2020' }).code;

/** Brace-match a function out of compiled JS (paren-aware, so parameter destructuring is safe). */
function extractFunction(src, name) {
  const nameIdx = src.indexOf(`async function ${name}(`);
  if (nameIdx < 0) throw new Error(`could not locate ${name}() in ${ENTRY}`);
  let depth = 0;
  let bodyStart = -1;
  for (let i = src.indexOf('(', nameIdx); i < src.length; i += 1) {
    if (src[i] === '(') depth += 1;
    else if (src[i] === ')') {
      depth -= 1;
      if (depth === 0) { bodyStart = src.indexOf('{', i); break; }
    }
  }
  if (bodyStart < 0) throw new Error(`could not find the body of ${name}()`);
  depth = 0;
  for (let j = bodyStart; j < src.length; j += 1) {
    if (src[j] === '{') depth += 1;
    else if (src[j] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(nameIdx, j + 1);
    }
  }
  throw new Error(`unbalanced braces while extracting ${name}()`);
}

const ACTOR_JS = toJs(strip(read(ACTOR)));
const ENTRY_JS = toJs(strip(read(ENTRY)));

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures + mocks
// ─────────────────────────────────────────────────────────────────────────────
const ResponseStub = {
  json: (body, init = {}) => ({ status: init.status || 200, body, json: async () => body }),
};

/** Stub of the pure business-scope guard: only these two profile↔business pairs pass. */
const BUSINESS_AUTHORIZED = new Set(['p-advisor|b-client', 'p-member|b-client']);
const validateBusinessScope = async (_sb, businessId, profileId) => {
  if (!BUSINESS_AUTHORIZED.has(`${profileId}|${businessId}`)) {
    const err = new Error('scope denied');
    err.status = 403;
    throw err;
  }
  return true;
};

const FIXTURES = {
  profiles: [
    { id: 'p-admin', email: 'admin@vision.test', app_role: 'admin', base44_user_id: 'u-admin', primary_business_id: 'b-admin' },
    { id: 'p-super', email: 'super@vision.test', app_role: 'super_admin', base44_user_id: 'u-super' },
    { id: 'p-super2', email: 'super2@vision.test', app_role: 'super_admin', base44_user_id: 'u-super2' },
    { id: 'p-owner', email: 'owner@vision.test', app_role: 'owner', base44_user_id: 'u-owner', primary_business_id: 'b-owner' },
    { id: 'p-member', email: 'member@vision.test', app_role: 'team_member', base44_user_id: 'u-member', primary_business_id: 'b-member' },
    { id: 'p-advisor', email: 'advisor@vision.test', app_role: 'advisor', base44_user_id: 'u-advisor' },
    { id: 'p-expert', email: 'expert@vision.test', app_role: 'expert_advisor', base44_user_id: 'u-expert' },
    { id: 'p-client', email: 'client@vision.test', app_role: 'owner', base44_user_id: 'u-client', primary_business_id: 'b-client' },
    // ── S3.0 fixtures: the ACTOR's own canonical profile_status ──
    { id: 'p-owner-active', email: 'owner-active@vision.test', app_role: 'owner', base44_user_id: 'u-owner-active', profile_status: 'active' },
    { id: 'p-owner-incomplete', email: 'owner-incomplete@vision.test', app_role: 'owner', base44_user_id: 'u-owner-incomplete', profile_status: 'incomplete' },
    { id: 'p-admin-active', email: 'admin-active@vision.test', app_role: 'admin', base44_user_id: 'u-admin-active', profile_status: 'active' },
    { id: 'p-admin-incomplete', email: 'admin-incomplete@vision.test', app_role: 'admin', base44_user_id: 'u-admin-incomplete', profile_status: 'incomplete' },
    { id: 'p-super-active', email: 'super-active@vision.test', app_role: 'super_admin', base44_user_id: 'u-super-active', profile_status: 'active' },
    { id: 'p-invited-owner', email: 'invited@vision.test', app_role: 'owner', base44_user_id: 'u-invited-owner', profile_status: 'invited' },
    { id: 'p-susp-owner', email: 'susp-owner@vision.test', app_role: 'owner', base44_user_id: 'u-susp-owner', profile_status: 'suspended', primary_business_id: 'b-susp' },
    { id: 'p-susp-admin', email: 'susp-admin@vision.test', app_role: 'admin', base44_user_id: 'u-susp-admin', profile_status: 'suspended' },
    { id: 'p-susp-super', email: 'susp-super@vision.test', app_role: 'super_admin', base44_user_id: 'u-susp-super', profile_status: 'suspended' },
  ],
  // Ownership rows make the advisor and the team member PROVABLY authorized for the
  // target's business — so the shared resolver's business-scope fallback really is
  // reachable, and the override gate is what must deny them.
  business_owners: [
    { profile_id: 'p-advisor', business_id: 'b-client' },
    { profile_id: 'p-member', business_id: 'b-client' },
  ],
  business_entities: [],
};

const base44Users = {
  'u-admin': { id: 'u-admin', email: 'admin@vision.test', role: 'user', full_name: 'Canonical Admin' },
  'u-super': { id: 'u-super', email: 'super@vision.test', role: 'admin', full_name: 'Canonical Super' },
  'u-super2': { id: 'u-super2', email: 'super2@vision.test', role: 'user', full_name: 'Canonical Super, Base44 role user' },
  'u-owner': { id: 'u-owner', email: 'owner@vision.test', role: 'admin', full_name: 'Forged Base44 admin' },
  'u-owner2': { id: 'u-owner2', email: 'owner@vision.test', role: 'super_admin', full_name: 'Forged Base44 super admin' },
  'u-member': { id: 'u-member', email: 'member@vision.test', role: 'user', full_name: 'Team member' },
  'u-advisor': { id: 'u-advisor', email: 'advisor@vision.test', role: 'admin', full_name: 'Business-authorized advisor' },
  'u-expert': { id: 'u-expert', email: 'expert@vision.test', role: 'admin', full_name: 'Expert advisor' },
  'u-noprofile': { id: 'u-noprofile', email: 'ghost@vision.test', role: 'admin', full_name: 'No canonical profile' },
  // ── S3.0 actors. The suspended ones keep REAL Base44 standing on purpose:
  // ST9/ST10 prove that Base44 standing cannot rescue a suspended canonical profile. ──
  'u-owner-active': { id: 'u-owner-active', email: 'owner-active@vision.test', role: 'user', full_name: 'Active owner' },
  'u-owner-incomplete': { id: 'u-owner-incomplete', email: 'owner-incomplete@vision.test', role: 'user', full_name: 'Incomplete owner' },
  'u-admin-active': { id: 'u-admin-active', email: 'admin-active@vision.test', role: 'user', full_name: 'Active canonical admin' },
  'u-admin-incomplete': { id: 'u-admin-incomplete', email: 'admin-incomplete@vision.test', role: 'user', full_name: 'Incomplete canonical admin' },
  'u-super-active': { id: 'u-super-active', email: 'super-active@vision.test', role: 'user', full_name: 'Active canonical super admin' },
  'u-invited-owner': { id: 'u-invited-owner', email: 'invited@vision.test', role: 'user', full_name: 'Invited owner' },
  'u-susp-owner': { id: 'u-susp-owner', email: 'susp-owner@vision.test', role: 'admin', full_name: 'Suspended owner, Base44 role admin' },
  'u-susp-admin': { id: 'u-susp-admin', email: 'susp-admin@vision.test', role: 'admin', full_name: 'Suspended canonical admin, Base44 role admin' },
  'u-susp-super': { id: 'u-susp-super', email: 'susp-super@vision.test', role: 'super_admin', full_name: 'Suspended canonical super admin' },
};

/** Faithful Supabase query-builder mock: select/eq/ilike/limit/maybeSingle. */
function makeSb(fixtures = FIXTURES) {
  const match = (table, f) => (fixtures[table] || []).find((row) =>
    Object.entries(f).every(([col, val]) => {
      if (val && typeof val === 'object' && val.ilike) {
        return String(row[col] || '').trim().toLowerCase() === String(val.ilike).trim().toLowerCase();
      }
      return row[col] === val;
    })) || null;
  const builder = (table, filters = {}) => ({
    select: () => builder(table, filters),
    eq: (col, val) => builder(table, { ...filters, [col]: val }),
    ilike: (col, val) => builder(table, { ...filters, [col]: { ilike: val } }),
    limit: () => builder(table, filters),
    maybeSingle: async () => ({ data: match(table, filters), error: null }),
  });
  return { from: (table) => builder(table) };
}

const sandbox = {
  Response: ResponseStub,
  console: { log: () => {}, warn: () => {}, error: () => {} },
  validateBusinessScope,
  requestBodyAppRole: 'admin', // present so the mutation that TRUSTS it can run
};
const actorApi = vm.runInNewContext(
  `${ACTOR_JS}\n;({ ADMIN_ROLES, authenticateActor, resolveActingProfile, errorResponse, HttpError });`,
  sandbox
);
Object.assign(sandbox, actorApi);
const { ADMIN_ROLES, authenticateActor, resolveActingProfile } = actorApi;

const OVERRIDE_SRC = extractFunction(ENTRY_JS, 'resolveOverrideTarget');
const compileOverride = (source) => vm.runInNewContext(`(${source})`, sandbox);
const resolveOverrideTarget = compileOverride(OVERRIDE_SRC);

const actorFor = (userId) =>
  authenticateActor({ auth: { me: async () => base44Users[userId] } }, makeSb());

async function decide(userId, { targetEmail = null, targetProfileId = null, fn = resolveOverrideTarget } = {}) {
  const sb = makeSb();
  const actor = await actorFor(userId);
  const out = await fn(sb, actor, { targetEmail, targetProfileId });
  return {
    decision: out.denial ? 'deny' : 'allow',
    status: out.denial ? out.denial.status : 200,
    error: out.denial ? out.denial.body?.error : null,
    isTarget: out.isTarget,
    profileId: out.profile?.id || null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
const CLIENT = 'client@vision.test';
const CLIENT_ID = 'p-client';
const SELF = 'owner@vision.test';

const MATRIX = [
  { id: 'A', name: 'canonical admin (Base44 role "user") → target another profile', actor: 'u-admin', targetEmail: CLIENT, expect: 'allow', isTarget: true, profileId: CLIENT_ID },
  { id: 'B', name: 'canonical super_admin (Base44 role admin) → target', actor: 'u-super', targetEmail: CLIENT, expect: 'allow', isTarget: true, profileId: CLIENT_ID },
  { id: 'B2', name: 'canonical super_admin (Base44 role "user") → target', actor: 'u-super2', targetEmail: CLIENT, expect: 'allow', isTarget: true, profileId: CLIENT_ID },
  { id: 'C', name: 'owner → target another profile', actor: 'u-owner', targetEmail: CLIENT, expect: 'deny', status: 403 },
  { id: 'D', name: 'team member (business-authorized for the target) → target', actor: 'u-member', targetEmail: CLIENT, expect: 'deny', status: 403 },
  { id: 'E', name: 'advisor (business-authorized for the target) → target', actor: 'u-advisor', targetEmail: CLIENT, expect: 'deny', status: 403 },
  { id: 'F', name: 'expert_advisor → target', actor: 'u-expert', targetEmail: CLIENT, expect: 'deny', status: 403 },
  { id: 'G', name: 'missing canonical profile (Base44 role admin) → target', actor: 'u-noprofile', targetEmail: CLIENT, expect: 'deny', status: 403 },
  { id: 'K', name: 'owner changes the target email to a real user', actor: 'u-owner', targetEmail: CLIENT, expect: 'deny', status: 403 },
  { id: 'L', name: 'owner changes the target profile_id to a real user', actor: 'u-owner', targetProfileId: CLIENT_ID, expect: 'deny', status: 403 },
  { id: 'L2', name: 'owner supplies BOTH identifiers for another user', actor: 'u-owner', targetEmail: CLIENT, targetProfileId: CLIENT_ID, expect: 'deny', status: 403 },
  { id: 'M', name: 'owner with no target identifier resolves to their OWN profile', actor: 'u-owner', expect: 'allow', isTarget: false, profileId: 'p-owner' },
  { id: 'N', name: 'canonical admin → nonexistent target email (safe 404)', actor: 'u-admin', targetEmail: 'nobody@vision.test', expect: 'deny', status: 404 },
  { id: 'N2', name: 'NON-admin → nonexistent target email → 403, never 404 (no existence oracle)', actor: 'u-owner', targetEmail: 'nobody@vision.test', expect: 'deny', status: 403 },
  { id: 'O', name: 'owner targets their OWN email', actor: 'u-owner', targetEmail: SELF, expect: 'allow', isTarget: false, profileId: 'p-owner' },
  { id: 'O2', name: 'owner targets their own email in different CASE', actor: 'u-owner', targetEmail: 'OWNER@Vision.Test', expect: 'allow', isTarget: false, profileId: 'p-owner' },
  { id: 'P', name: 'canonical admin targets SELF', actor: 'u-admin', targetEmail: 'admin@vision.test', expect: 'allow', isTarget: false, profileId: 'p-admin' },
  { id: 'P2', name: 'owner targets their OWN profile_id', actor: 'u-owner', targetProfileId: 'p-owner', expect: 'allow', isTarget: false, profileId: 'p-owner' },
  { id: 'Q', name: 'admin: email says client, id says SELF → conflict', actor: 'u-admin', targetEmail: CLIENT, targetProfileId: 'p-admin', expect: 'deny', status: 403 },
  { id: 'Q2', name: 'admin: two identifiers naming two different profiles → conflict', actor: 'u-admin', targetEmail: 'admin@vision.test', targetProfileId: CLIENT_ID, expect: 'deny', status: 403 },
  { id: 'Q3', name: 'non-admin: own email + another profile_id → identifiers disagree → fail closed', actor: 'u-advisor', targetEmail: 'advisor@vision.test', targetProfileId: CLIENT_ID, expect: 'deny', status: 403 },
  { id: 'R', name: 'no target identifier (normal user)', actor: 'u-member', expect: 'allow', isTarget: false, profileId: 'p-member' },
  { id: 'R2', name: 'whitespace-only target override (normal user)', actor: 'u-member', targetEmail: '   ', expect: 'allow', isTarget: false, profileId: 'p-member' },
  { id: 'I', name: 'forged request-body app_role=admin + canonical owner → target', actor: 'u-owner', targetEmail: CLIENT, expect: 'deny', status: 403 },
  { id: 'J', name: 'Base44 role admin + canonical app_role owner → target', actor: 'u-owner', targetEmail: CLIENT, expect: 'deny', status: 403 },
  { id: 'J2', name: 'Base44 role super_admin + canonical app_role owner → target', actor: 'u-owner2', targetEmail: CLIENT, expect: 'deny', status: 403 },
];

(async () => {
  console.log('── ADVERSARIAL MATRIX (A–R) — real extracted decision + real shared helpers ──');
  for (const tc of MATRIX) {
    const r = await decide(tc.actor, { targetEmail: tc.targetEmail, targetProfileId: tc.targetProfileId });
    const ok = tc.expect === 'allow'
      ? r.decision === 'allow' &&
        (tc.isTarget === undefined || r.isTarget === tc.isTarget) &&
        (tc.profileId === undefined || r.profileId === tc.profileId)
      : r.decision === 'deny' && (tc.status === undefined || r.status === tc.status);
    check(`${tc.id.padEnd(3)} ${tc.name}`, ok, ok ? '' : `got ${r.decision}/${r.status} profile=${r.profileId} isTarget=${r.isTarget}`);
  }

  console.log('\n── I — the request body cannot grant admin authority ──');
  check(
    'I   the real decision function cannot even read the request body',
    !/\b(data|body|_router_user_email|app_role_request)\b/.test(OVERRIDE_SRC),
    'it receives only sb, actor and the two target identifiers'
  );
  const forged = await decide('u-owner', { targetEmail: CLIENT });
  check('I   canonical owner + forged app_role=admin in the request → DENY', forged.decision === 'deny' && forged.status === 403, `got ${forged.decision}/${forged.status}`);
  const entryJsCode = ENTRY_JS.replace(/\/\*[\s\S]*?\*\//g, '');
  check('I   the router never reads a role from the request', !/data\?\.app_role|body\.app_role|data\.app_role|_router_user_role/.test(entryJsCode));

  console.log('\n── H — disabled / inactive canonical profile ──');
  const actorSrcRaw = read(ACTOR);
  check(
    'H   authenticateActor consults NO active/inactive flag — recorded as an OPEN GAP, not claimed as passing',
    !/is_active|is_disabled|deactivated|disabled_at|deleted_at/.test(actorSrcRaw),
    /is_active|is_disabled|deactivated|disabled_at|deleted_at/.test(actorSrcRaw)
      ? 'an active/inactive filter now exists — this case must be re-tested'
      : 'no such column is read anywhere in the shared actor module'
  );

  // ───────────────────────────────────────────────────────────────────────────
  // S3.0 — CANONICAL ACTOR SUSPENSION GATE.
  //
  // The invariant under test:
  //   authenticated session → canonical profile resolution → profile exists
  //     → profile_status !== 'suspended' → role / relationship authorization
  //
  // This is the ACTOR's status, never the TARGET's: no target-profile suspension
  // policy is invented here, and no consumer restates the rule (it lives once, in
  // authenticateActor, so all 14 consumers inherit it).
  console.log('\n── S3.0 SUSPENSION GATE — real authenticateActor, ACTOR-status semantics ──');

  const compileActorModule = (jsSource) => vm.runInNewContext(
    `${jsSource}\n;({ authenticateActor, resolveActingProfile, ADMIN_ROLES, HttpError });`,
    { Response: ResponseStub, console: { log() {}, warn() {}, error() {} }, validateBusinessScope }
  );

  /** Actor stage only — for the status matrix. */
  const actorOutcomeWith = async (authFn, userId) => {
    try {
      const actor = await authFn({ auth: { me: async () => base44Users[userId] } }, makeSb());
      return { ok: true, role: actor.role, isAdmin: actor.isAdmin, profileId: actor.profile_id, status: actor.profile?.profile_status ?? null };
    } catch (e) {
      return { ok: false, status: e.status, name: e.name, message: e.message };
    }
  };

  /** The whole request path, recording WHICH stage refused (actor vs override). */
  async function evalCase(tc, { authFn = authenticateActor, overrideFn = resolveOverrideTarget } = {}) {
    const sb = makeSb();
    let stage = 'actor';
    try {
      const actor = await authFn({ auth: { me: async () => base44Users[tc.actor] } }, sb);
      if (!tc.targetEmail && !tc.targetProfileId) {
        return { ok: true, stage, role: actor.role, isAdmin: actor.isAdmin, profileId: actor.profile_id, status: actor.profile?.profile_status ?? null };
      }
      stage = 'override';
      const out = await overrideFn(sb, actor, { targetEmail: tc.targetEmail || null, targetProfileId: tc.targetProfileId || null });
      return { ok: true, stage, decision: out.denial ? 'deny' : 'allow', status: out.denial?.status, isTarget: out.isTarget, profileId: out.profile?.id || null };
    } catch (e) {
      return { ok: false, stage, status: e.status, name: e.name, message: e.message };
    }
  }

  const SUSPENDED_OWNER_EMAIL = 'susp-owner@vision.test';
  const SUSPENSION = [
    { id: 'ST1', name: 'active owner → resolves', actor: 'u-owner-active', expect: 'resolved', role: 'owner' },
    { id: 'ST2', name: 'incomplete owner → resolves (the onboarding default)', actor: 'u-owner-incomplete', expect: 'resolved', role: 'owner' },
    { id: 'ST3', name: 'active admin → resolves', actor: 'u-admin-active', expect: 'resolved', isAdmin: true },
    { id: 'ST4', name: 'incomplete admin → resolves', actor: 'u-admin-incomplete', expect: 'resolved', isAdmin: true },
    { id: 'ST5', name: 'active super_admin → resolves', actor: 'u-super-active', expect: 'resolved', isAdmin: true },
    { id: 'ST6', name: 'SUSPENDED owner → DENY', actor: 'u-susp-owner', expect: 'denied', status: 403 },
    { id: 'ST7', name: 'SUSPENDED admin → DENY', actor: 'u-susp-admin', expect: 'denied', status: 403 },
    { id: 'ST8', name: 'SUSPENDED super_admin → DENY', actor: 'u-susp-super', expect: 'denied', status: 403 },
    { id: 'ST9', name: 'Base44 role admin + canonical SUSPENDED owner → DENY', actor: 'u-susp-owner', expect: 'denied', status: 403 },
    { id: 'ST10', name: 'Base44 role admin + canonical SUSPENDED admin → DENY', actor: 'u-susp-admin', expect: 'denied', status: 403 },
    { id: 'ST11', name: 'request-body role/app_role cannot bypass suspension', actor: 'u-susp-owner', expect: 'denied', status: 403 },
    { id: 'ST12', name: 'missing canonical profile → existing behavior unchanged', actor: 'u-noprofile', expect: 'resolved', profileId: null },
    { id: 'ST13', name: 'self request cannot bypass suspension (targets own email)', actor: 'u-susp-owner', targetEmail: SUSPENDED_OWNER_EMAIL, expect: 'denied', status: 403, stage: 'actor' },
    { id: 'ST14', name: 'admin TARGET OVERRIDE cannot bypass ACTOR suspension', actor: 'u-susp-admin', targetEmail: CLIENT, expect: 'denied', status: 403, stage: 'actor' },
    { id: 'ST15', name: 'invited profile → resolves (reported finding; unchanged by S3.0)', actor: 'u-invited-owner', expect: 'resolved', role: 'owner' },
  ];

  const suspensionOk = (tc, r) => (tc.expect === 'resolved'
    ? r.ok === true &&
      (tc.role === undefined || r.role === tc.role) &&
      (tc.isAdmin === undefined || r.isAdmin === tc.isAdmin) &&
      (tc.profileId === undefined || r.profileId === tc.profileId)
    : r.ok === false && r.status === tc.status && r.name === 'HttpError' && (tc.stage === undefined || r.stage === tc.stage));

  for (const tc of SUSPENSION) {
    const r = await evalCase(tc);
    const ok = suspensionOk(tc, r);
    check(`${tc.id.padEnd(4)} ${tc.name}`, ok, ok ? '' : `got ok=${r.ok} stage=${r.stage} status=${r.status} role=${r.role} profile=${r.profileId}`);
  }

  // ST12b — the gate must not change the pre-existing "no canonical profile" path.
  const noProfileResolution = await (async () => {
    try {
      const actor = await actorFor('u-noprofile');
      await resolveActingProfile(makeSb(), actor, {});
      return 'allowed';
    } catch (e) { return String(e.status); }
  })();
  check('ST12b missing profile still resolves to 404 (unchanged; gate does not alter it)', noProfileResolution === '404', noProfileResolution);

  const ACTOR_SRC = read(ACTOR);
  const AUTH_FN = extractFunction(ACTOR_JS, 'authenticateActor');
  check('ST16 the gate consults the CANONICAL profile_status', /profile\?\.profile_status === 'suspended'/.test(ACTOR_SRC));
  check('ST17 the gate is NOT a "must be active" requirement', !/profile_status\s*[!=]==?\s*'active'/.test(ACTOR_SRC));
  check('ST18 the gate runs BEFORE any role/standing is derived', AUTH_FN.indexOf("=== 'suspended'") < AUTH_FN.indexOf('const appRole'), `gate@${AUTH_FN.indexOf("=== 'suspended'")} role@${AUTH_FN.indexOf('const appRole')}`);
  check('ST19 no request-body input reaches the actor resolution', !/\bbody\b|\breq\b|requestBody/.test(AUTH_FN));
  check('ST20 denial reuses the shared contract (single HttpError 403, no second error framework)', /new HttpError\(403,/.test(AUTH_FN) && (ACTOR_SRC.match(/class \w*Error/g) || []).length === 1);
  check('ST21 a forged request-body app_role is present and still cannot rescue a suspended actor', sandbox.requestBodyAppRole === 'admin' && (await actorOutcomeWith(authenticateActor, 'u-susp-owner')).ok === false);

  // ── S3.0 MUTATIONS — mutate the REAL shared module, prove the matrix catches it ──
  const SUSPENSION_MUTATIONS = [
    { id: 'A1', name: 'suspension gate removed entirely', find: "if (profile?.profile_status === 'suspended') {", replace: 'if (false) {', mustCatch: ['ST6', 'ST7', 'ST8', 'ST13', 'ST14'] },
    { id: 'A2', name: 'gate inverted to REQUIRE active (the production-breaking mistake)', find: "profile?.profile_status === 'suspended'", replace: "profile?.profile_status !== 'active'", mustCatch: ['ST1', 'ST2', 'ST3', 'ST4', 'ST5'] },
    { id: 'A3', name: 'administrators exempted from the suspension gate', find: "if (profile?.profile_status === 'suspended') {", replace: "if (profile?.profile_status === 'suspended' && !ADMIN_ROLES.includes(profile?.app_role)) {", mustCatch: ['ST7', 'ST8'] },
    { id: 'A4', name: 'gate reads the Base44 record instead of the canonical profile', find: "profile?.profile_status === 'suspended'", replace: "user?.profile_status === 'suspended'", mustCatch: ['ST6', 'ST7', 'ST8'] },
  ];

  for (const mut of SUSPENSION_MUTATIONS) {
    if (!ACTOR_SRC.includes(mut.find)) {
      check(`M-${mut.id} ${mut.name}`, false, `mutation anchor not found: ${mut.find.slice(0, 46)}`);
      continue;
    }
    const mutatedApi = compileActorModule(toJs(strip(ACTOR_SRC.replace(mut.find, mut.replace))));
    const caught = [];
    for (const caseId of mut.mustCatch) {
      const tc = SUSPENSION.find((s) => s.id === caseId);
      const r = await evalCase(tc, { authFn: mutatedApi.authenticateActor });
      if (!suspensionOk(tc, r)) caught.push(caseId);
    }
    check(`M-${mut.id} ${mut.name} → caught by [${caught.join(', ') || 'NOTHING'}]`, caught.length > 0, caught.length ? '' : 'the harness would NOT have caught this regression');
  }

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n── MUTATION TESTS — mutate the REAL extracted source, re-run, catch it ──');
  const DECISION_LINE = 'const canonicalAdmin = ADMIN_ROLES.includes(actor?.profile?.app_role ?? null);';
  const GATE_LINE = 'if ((wantsEmail || wantsProfileId) && !emailIsSelf && !idIsSelf && !canonicalAdmin) {';
  const RESOLVER_GUARD = 'if (resolved.isTarget && !canonicalAdmin) {';
  // Format-agnostic: the compiled call may be re-wrapped, the shape is what matters.
  const RESOLVE_BLOCK = /resolved = await resolveActingProfile\([^)]*\);/;

  // NOTE ON DEFENCE IN DEPTH: the early gate, the conflict check and the resolver
  // guard are three independent refusals. The gate additionally runs BEFORE any
  // resolution, which is what stops a non-admin from using this endpoint as an
  // existence oracle (N2). Mutations 5 and 6 therefore assert against the cases
  // each mechanism ALONE is responsible for.
  const MUTATIONS = [
    {
      name: '1. authorization reverted to the Base44 user.role',
      edits: [{ find: DECISION_LINE, replace: 'const canonicalAdmin = ADMIN_ROLES.includes(actor?.user?.role ?? null);' }],
      mustCatch: ['A', 'B2', 'J', 'J2'],
    },
    {
      name: '2. request body app_role trusted',
      edits: [{ find: DECISION_LINE, replace: 'const canonicalAdmin = ADMIN_ROLES.includes(actor?.profile?.app_role ?? null) || ADMIN_ROLES.includes(requestBodyAppRole);' }],
      // S3.0.1 NOTE — this mutation's original cases (I, J: a canonical owner who
      // holds Base44 standing) are NO LONGER distinguishable by outcome: with
      // canonical-only standing the SECOND layer refuses them as well, because
      // resolveActingProfile denies the override on `actor.isAdmin === false`.
      // The forged-body regression is still caught — by D and E, the two
      // non-admins who ARE business-authorized for the target, which is exactly
      // the case a trusted request-body app_role would wrongly admit.
      mustCatch: ['D', 'E'],
    },
    {
      name: '3. target identifier treated as IDENTITY instead of a target (resolver bypassed)',
      edits: [{ find: RESOLVE_BLOCK, replace: '    resolved = { profile: actor.profile, isTarget: false };' }],
      mustCatch: ['A', 'B', 'N'],
    },
    {
      name: '4. admin check removed entirely',
      edits: [{ find: DECISION_LINE, replace: 'const canonicalAdmin = true;' }],
      mustCatch: ['C', 'D', 'E', 'F', 'G', 'J'],
    },
    {
      name: '5. early gate dropped (a non-admin could probe which targets exist)',
      edits: [{ find: GATE_LINE, replace: 'if (false) {' }],
      mustCatch: ['N2'],
    },
    {
      name: '6. gate AND resolver guard dropped (business-scope fallback becomes the admin override)',
      edits: [{ find: GATE_LINE, replace: 'if (false) {' }, { find: RESOLVER_GUARD, replace: 'if (false) {' }],
      mustCatch: ['D', 'E'],
    },
  ];

  for (const mut of MUTATIONS) {
    const missing = mut.edits.find((e) => (e.find instanceof RegExp ? !e.find.test(OVERRIDE_SRC) : !OVERRIDE_SRC.includes(e.find)));
    if (missing) {
      check(`M${mut.name.slice(0, 1)} ${mut.name}`, false, `mutation anchor not found: ${String(missing.find).slice(0, 46)}`);
      continue;
    }
    const mutated = compileOverride(mut.edits.reduce((s, e) => s.replace(e.find, e.replace), OVERRIDE_SRC));
    const caught = [];
    for (const caseId of mut.mustCatch) {
      const tc = MATRIX.find((m) => m.id === caseId);
      const r = await decide(tc.actor, { targetEmail: tc.targetEmail || null, targetProfileId: tc.targetProfileId || null, fn: mutated });
      if (r.decision !== tc.expect || (tc.status !== undefined && r.status !== tc.status)) caught.push(caseId);
    }
    check(`M${mut.name.slice(0, 1)} ${mut.name} → caught by [${caught.join(', ') || 'NOTHING'}]`, caught.length > 0, caught.length ? '' : 'the harness would NOT have caught this regression');
  }

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n── WIRING — one path, reuse, no parallel implementation ──');
  const headEntry = baselineOf(ENTRY); // the PRE-P3 revision of the same file
  const roleLiterals = (src) => (src.match(/\[['"]admin['"],\s*['"]super_admin['"]\]/g) || []).length;

  check('W1  imports the shared actor contract', /from '\.\.\/\.\.\/shared\/authz\/actor\.ts'/.test(read(ENTRY)));
  check('W2  authenticateActor is called exactly once', (ENTRY_JS.match(/await authenticateActor\(/g) || []).length === 1);
  check('W3  resolveActingProfile is called exactly once, inside the one decision fn', (ENTRY_JS.match(/await resolveActingProfile\(/g) || []).length === 1);
  check('W4  the router calls the one decision fn exactly once', (ENTRY_JS.match(/await resolveOverrideTarget\(/g) || []).length === 1);
  check('W5  the authority input is profiles.app_role ONLY', /ADMIN_ROLES\.includes\(actor\?\.profile\?\.app_role \?\? null\)/.test(OVERRIDE_SRC));
  check('W6  ADMIN_ROLES comes from the shared module; no local role list is declared here', /import \{[\s\S]*?ADMIN_ROLES,[\s\S]*?\} from '\.\.\/\.\.\/shared\/authz\/actor\.ts'/.test(read(ENTRY)) && !/const ADMIN_ROLES/.test(ENTRY_JS));
  check('W7  the shared module exports the ONE role list', /export const ADMIN_ROLES/.test(read(ACTOR)));
  check('W8  every action consumes ONE resolved profile', /const getProfile = async \(\) => override\.profile;/.test(read(ENTRY)));
  check('W9  all 48 profile call sites are unchanged', (read(ENTRY).match(/await getProfile\(\)/g) || []).length === 48, String((read(ENTRY).match(/await getProfile\(\)/g) || []).length));
  check('W10 canonical failures keep their real status (errorResponse)', /return errorResponse\(error\);/.test(read(ENTRY)));
  check('W11 the legacy Base44-role override gate is gone', !/user\.role !== 'admin'/.test(ENTRY_JS));
  check('W12 both administrative action gates use canonical standing', (ENTRY_JS.match(/if \(!isCanonicalAdmin\) \{/g) || []).length === 2);
  check('W13 body-supplied profile ids no longer scope any query', !/effectiveProfileId = (selectedProfileId|explicitProfileId) \|\| profileId/.test(ENTRY_JS));
  check('W14 the admin worksheets query uses the resolved profile', /\.eq\('assigned_to_profile_id', profile\.id\)/.test(read(ENTRY)));
  check('W15 non-admins cannot select an unauthorized business (2 document-list actions)', (ENTRY_JS.match(/assertBusinessAccess\(sb, selectedBiz/g) || []).length + (ENTRY_JS.match(/assertBusinessAccess\(sb, selectedBusinessId/g) || []).length === 2);
  check('W16 gate runs BEFORE resolution (no existence oracle for non-admins)', OVERRIDE_SRC.indexOf('!canonicalAdmin) {') < OVERRIDE_SRC.indexOf('await resolveActingProfile('));
  // S3.1 — the reviewed VIEW change REMOVES one admin-role literal (the local
  // ['admin','super_admin'] list that used to decide this action), so the invariant
  // is "no NEW literal" (after ≤ before), with the reduction being exactly the one
  // literal the S3.1 slice deleted.
  check('W17 no NEW admin-role literal was introduced (S3.1 removed one from the VIEW action)', roleLiterals(read(ENTRY)) <= roleLiterals(headEntry) && roleLiterals(headEntry) - roleLiterals(read(ENTRY)) === 1, `${roleLiterals(headEntry)} before → ${roleLiterals(read(ENTRY))} after`);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n── DATA SCOPE — document authorization, Storage and RLS unchanged ──');
  const blockOf = (src, startMarker, endMarker) => {
    const s = src.indexOf(startMarker);
    const e = src.indexOf(endMarker);
    if (s < 0 || e < 0 || e <= s) throw new Error(`block markers not found: ${startMarker}`);
    return src.slice(s, e);
  };
  const actionBlock = (src, action, nextAction) =>
    blockOf(src, `if (action === '${action}') {`, `if (action === '${nextAction}') {`);
  const selectsOf = (src, action, nextAction) =>
    (actionBlock(src, action, nextAction).match(/\.select\([^)]*\)/g) || []).join('|');

  // S3.1 REBASE — the document VIEW action WAS the reviewed S3.1 change: its local
  // authorization (local admin list, advisor_assignments branch, owner/business
  // branch) was replaced by the shared documentAccess engine. Pinning the previous
  // byte-shape would now pin the vulnerable shape. The S3.1 invariant lives in
  // scripts/documentSignedUrlAuthorization.test.cjs; DELETE stays pinned below.
  check('S1  getDocumentSignedUrl delegates to the shared document engine (S3.1 reviewed change)', /await authorizeDocumentAccess\(/.test(actionBlock(read(ENTRY), 'getDocumentSignedUrl', 'deleteDocument')) && !/advisor_assignments/.test(actionBlock(read(ENTRY), 'getDocumentSignedUrl', 'deleteDocument')));
  check('S2  deleteDocument authorization is byte-identical to the pre-P3 baseline', contentSha(actionBlock(headEntry, 'deleteDocument', 'retryDocumentAnalysis')) === contentSha(actionBlock(read(ENTRY), 'deleteDocument', 'retryDocumentAnalysis')));
  check('S3  signed URL lifetime unchanged (900s)', /createSignedUrl\(doc\.file_path, 900\)/.test(read(ENTRY)));
  check('S4  the legacy advisor_assignments authorization branch is GONE from the VIEW action (S3.1)', !/advisor_assignments/.test(actionBlock(read(ENTRY), 'getDocumentSignedUrl', 'deleteDocument')));
  check('S5  shared document authorization module untouched', read(DOC_ACCESS) === baselineOf(DOC_ACCESS));
  // S3.1 REBASE — getDocumentsAdmin changed ONLY its bucket VOCABULARY (its local
  // two-bucket list was replaced by the shared policy in shared/documents/
  // buckets.ts). Its AUTHORIZATION surface is unchanged: loadAuthorizedDocument,
  // the getSignedUrl branch and the delete branch remain byte-identical.
  {
    const headAdmin = baselineOf(DOC_ADMIN);
    const nowAdmin = read(DOC_ADMIN);
    const spanOf = (src, a, b) => src.slice(src.indexOf(a), src.indexOf(b));
    check('S6  getDocumentsAdmin authorization surface unchanged (S3.1 changed vocabulary only)',
      contentSha(spanOf(headAdmin, 'async function loadAuthorizedDocument', 'Deno.serve')) === contentSha(spanOf(nowAdmin, 'async function loadAuthorizedDocument', 'Deno.serve')) &&
      contentSha(spanOf(headAdmin, "body.action === 'delete'", "body.action === 'getSignedUrl'")) === contentSha(spanOf(nowAdmin, "body.action === 'delete'", "body.action === 'getSignedUrl'")) &&
      contentSha(spanOf(headAdmin, "body.action === 'getSignedUrl'", 'QUERY action')) === contentSha(spanOf(nowAdmin, "body.action === 'getSignedUrl'", 'QUERY action')) &&
      !/const ALLOWED_BUCKETS/.test(nowAdmin) && /isApprovedDocumentBucket/.test(nowAdmin));
  }
  check('S7  Storage containment migration untouched', read(STORAGE_SQL) === baselineOf(STORAGE_SQL));
  check('S8  no SQL / migration file changed at all since the pre-P3 baseline', git(['diff', '--name-only', BASELINE, '--', 'src/supabase/migrations']).trim() === '');
  check('S9  document lists still scoped to the same bucket + file scope', (read(ENTRY).match(/\.eq\('storage_bucket', 'documents'\)/g) || []).length === (headEntry.match(/\.eq\('storage_bucket', 'documents'\)/g) || []).length);
  check('S10 the document-list column selections are unchanged (no widened rows)', selectsOf(headEntry, 'getDocuments', 'getDataRoomDocuments') === selectsOf(read(ENTRY), 'getDocuments', 'getDataRoomDocuments') && selectsOf(headEntry, 'getClientDocumentsForUser', 'getAssignedResources') === selectsOf(read(ENTRY), 'getClientDocumentsForUser', 'getAssignedResources'));
  {
    const count = (src, re) => (src.match(re) || []).length;
    const colCounts = (src) => Array.from(src.matchAll(/\.eq\('([a-z_]+)'/g))
      .reduce((m, mt) => { m[mt[1]] = (m[mt[1]] || 0) + 1; return m; }, {});
    const before = colCounts(headEntry);
    const after = colCounts(read(ENTRY));
    // S3.1 REBASE — the reviewed VIEW change additionally removed the legacy
    // advisor_assignments lookup, so two further `.eq` filters disappear:
    // advisor_profile_id (1) and business_id (1). 'email' is the P3 removal.
    const S31_REMOVED = { email: 1, advisor_profile_id: 1, business_id: 1 };
    // 6D.0 REBASE (QUERY CONTRACT) — the reviewed 6D.0 slice adds exactly ONE
    // additive read to the document-view path: the source-existence determination
    // counts extracted_fields (head-only, count only) for the SAME document id the
    // actor was ALREADY authorized to view in this request. It runs strictly AFTER
    // S3.1 authorizeDocumentAccess approves the document and AFTER the persisted
    // bucket is approved, accepts NO caller-supplied tenant, returns no rows and
    // gates nothing. The added filter is pinned EXACTLY (+1), never tolerated: a
    // second new column, a removed tenant predicate or any unscoped count still
    // fails, and `.or(` usage must remain identical.
    const S31_ADDED = { document_id: 1 };
    const EXPECTED_REDUCED = Object.keys(S31_REMOVED);
    const EXPECTED_ADDED = Object.keys(S31_ADDED);
    const EXPECTED_CHANGED = [...EXPECTED_REDUCED, ...EXPECTED_ADDED].sort();
    const changedCols = Object.keys({ ...before, ...after })
      .filter((k) => (before[k] || 0) !== (after[k] || 0))
      .sort();
    check(
      'S11 the ONLY query filters that changed are the reviewed removals (P3 identity lookup + S3.1 legacy advisor branch) and the reviewed 6D.0 document-scoped count',
      JSON.stringify(changedCols) === JSON.stringify(EXPECTED_CHANGED) &&
        Object.entries(S31_REMOVED).every(([col, n]) => (before[col] || 0) === (after[col] || 0) + n) &&
        Object.entries(S31_ADDED).every(([col, n]) => (after[col] || 0) === (before[col] || 0) + n) &&
        count(headEntry, /\.or\(/g) === count(read(ENTRY), /\.or\(/g),
      `changed columns: [${changedCols.join(', ')}] (email ${before.email || 0}→${after.email || 0}, advisor_profile_id ${before.advisor_profile_id || 0}→${after.advisor_profile_id || 0}, business_id ${before.business_id || 0}→${after.business_id || 0})`
    );
    check(
      'S11b every other query filter column survived with the same call count',
      Object.keys(before).filter((k) => !EXPECTED_CHANGED.includes(k)).every((k) => before[k] === after[k]) &&
        Object.keys(after).filter((k) => !EXPECTED_CHANGED.includes(k)).every((k) => before[k] === after[k])
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n── CHANGE SURFACE ──');
  const TEST = 'scripts/adminCanonicalActor.test.cjs';
  const p3Files = git(['show', '--name-only', '--format=', P3_COMMIT]).trim().split('\n').filter(Boolean).sort();
  check('F1  the P3 commit contains exactly the two product files + this harness', JSON.stringify(p3Files) === JSON.stringify([ACTOR, ENTRY, TEST].sort()), p3Files.join(', '));
  // S3.1 — union of tracked changes since the pre-P3 baseline AND files not yet in
  // git, so a NEW module (the shared bucket policy) cannot slip past these checks.
  const changed = [...new Set([
    ...git(['diff', '--name-only', BASELINE]).trim().split('\n'),
    ...git(['ls-files', '--others', '--exclude-standard']).trim().split('\n'),
  ])].filter(Boolean).sort();
  // `src/scripts/` holds OFFLINE TEST HARNESSES, not product frontend code. S3.0.2
  // extends the S3 document-security mock there to cover relationship revocation;
  // that is a test artifact. Every PRODUCT frontend file remains forbidden.
  // P5 REBASE — the reviewed P5 slice (Admin document viewing) changes exactly ONE
  // frontend file: the Admin client's Documents tab, whose rows now open the
  // EXISTING viewer through the S3.1 path this harness guards. Every other
  // product frontend file must still be untouched, and no authorization file
  // moved (F3/F4/F5 below and S1–S11 above are unchanged).
  const P5_FRONTEND = ['src/components/admin/AdminUserProfileContext.jsx'];
  // P-S3 REBASE — committed REVIEW REPORTS are not frontend code. The ledger reports
  // were committed by earlier reviewed slices; the P-S3 report is this slice's.
  // Naming them explicitly (rather than exempting *.md wholesale) keeps the allowlist
  // exact: no product frontend file — .jsx/.js/.css included — can hide behind them.
  const APPROVED_REPORTS = [
    'SECURITY_LEDGER_POST_P5.md',
    'src/SECURITY_LEDGER_P_S1_BOUNDARY2_VERIFICATION.md',
    'SECURITY_P_S3_GALILEO_ACTOR_BINDING_REPORT.md',
  ];
  // 6D.0 REBASE — the reviewed 6D.0 slice (extraction integrity) is a LATER,
  // APPROVED slice: ONE further backend function (the extraction entry point),
  // four shared extraction modules, the shared viewer hook and the DocumentViewer,
  // plus its own harness and two reports. Allowlist lines ONLY — S1–S11, every
  // authorization assertion and every mutation check above are untouched.
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
  const P_6D0_BACKEND = P_6D0_FILES.filter((f) => f.startsWith('base44/functions/'));
  const P_6D0_SHARED = P_6D0_FILES.filter((f) => f.startsWith('base44/shared/'));
  const P_6D0_FRONTEND = P_6D0_FILES.filter((f) => f.startsWith('src/'));
  // CLASSIFICATION HOTFIX REBASE — the reviewed document-upload classification
  // hotfix is a LATER, APPROVED slice: ONE new backend vocabulary module, ONE
  // changed upload function, the shared frontend vocabulary, the upload page, the
  // Data Room presentation, its upload-config seam, its own harness and its report.
  // Allowlist lines ONLY — S1-S11, every authorization assertion and every mutation
  // check above are untouched.
  const CLASSIFICATION_HOTFIX_FILES = [
    'base44/shared/documents/documentTypes.ts',
    'base44/functions/uploadDocumentToSupabase/entry.ts',
    'src/lib/documents/documentTypes.js',
    'src/pages/DocumentUpload.jsx',
    'src/pages/DataRoom.jsx',
    'src/components/documents/uploadConfig.jsx',
    'scripts/documentUploadClassification.test.cjs',
    'VISION_DOCUMENT_UPLOAD_CLASSIFICATION_HOTFIX.md',
  ];
  const CHF_BACKEND = CLASSIFICATION_HOTFIX_FILES.filter((f) => f.startsWith('base44/functions/'));
  const CHF_SHARED = CLASSIFICATION_HOTFIX_FILES.filter((f) => f.startsWith('base44/shared/'));
  const CHF_FRONTEND = CLASSIFICATION_HOTFIX_FILES.filter((f) => f.startsWith('src/'));
  const changedFrontend = changed.filter((f) => f.startsWith('src/') && !f.startsWith('src/supabase/') && !f.startsWith('src/scripts/'));
  // 6D.0a REBASE — the reviewed Semantic Observation Bridge slice's report is a
  // `src/` document; the slice's code is shared-module code (covered by F4, which
  // proves the authorization spine unchanged). Allowlist line ONLY.
  const P_6D0A_FRONTEND = ['src/VISION_PHASE_6D_0A_SEMANTIC_OBSERVATION_BRIDGE.md'];
  // 6D.0b.1 REAL PROVIDER SEAM REPAIR — a LATER, APPROVED slice: the canonical
  // upload/analysis state vocabulary, the pipeline-following hook, the surfaces that
  // read it and the CTA that asks about an exact document. Allowlist lines ONLY —
  // S1-S11, every authorization assertion and every mutation check above are
  // untouched.
  const P_6D0B1_FRONTEND = [
    'src/lib/documents/documentTypes.js',
    'src/hooks/useDocumentPipelinePolling.js',
    // 6D.0b.2 — reviewed frontend surface.
    'src/scripts/durableDocumentIngestion.test.cjs',
    'src/hooks/useAskGalileo.js',
    'src/hooks/useVisionActions.js',
    'src/pages/DataRoom.jsx',
    'src/pages/DocumentUpload.jsx',
    // 6D.0c — the answer surface now renders the SERVER-derived evidence state.
    'src/components/galileo/home/GalileoAnswerPanel.jsx',
    // 6D.0c.2 — the evidence-first answer surface (reviewed slice list).
    ...require('./slice6D0C2Files.cjs').filter((f) => f.startsWith('src/')),
  ];
  // 6D.0b.2 DURABLE DOCUMENT INGESTION — a LATER, APPROVED slice: the durable
  // orchestration ledger, the ONE canonical worker and its two workflows. The
  // worker adds no authorization path (the spine below is untouched) and derives
  // document/business/scope from canonical rows. Allowlist lines ONLY — S1-S11 and
  // every authorization assertion in this harness are unchanged.
  const P_6D0B2_BACKEND = ['base44/functions/processDocumentIngestionJob/entry.ts', 'base44/functions/askGalileo/entry.ts'];
  // 6D.0b.2.1 REBASE — the reviewed CANONICAL SOURCE READ REPAIR slice adds exactly ONE
  // further shared module: the ONE project-URL normalizer both ingestion paths build
  // their Supabase client from. Allowlist line ONLY: F1–F5, the canonical-actor rule,
  // the admin authority table and every mutation check above are untouched, and the
  // authorization spine stays proven unmodified.
  // 6D.0c DOCUMENT KNOWLEDGE COMPLETION — a LATER, APPROVED slice adds ONE more
  // INGESTION module to this same reviewed surface: the durable confirmation/resume
  // module (server-side, authorized, idempotent — it derives the tenant from the
  // document row and leaves the settled state before a job can observe it). The
  // AUTHORIZATION SPINE this harness guards (actor.ts, documentAccess.ts,
  // relationshipAccess.ts, writeGuard.ts, buckets.ts) is untouched — S1–S11 above
  // still prove it. ALLOWLIST LINE ONLY.
  // 6D.0c GALILEO HALF adds ONE further shared module to this reviewed surface:
  // the focused-document knowledge contract. It invents NO permission model — it
  // CALLS the canonical authorizeDocumentAccess() guarded below — and it derives
  // the tenant from the document ROW. ALLOWLIST LINE ONLY.
  // 6D.0c.1 PROVISIONAL EVIDENCE RETRIEVAL adds ONE further shared module to this
  // reviewed surface: the provisional lane. It invents NO permission model and no
  // storage — it derives its rows from the SAME canonical extraction rows the
  // confirmed path reads, keeps them explicitly unverified, and calls the existing
  // canonical authorization for the focused document. ALLOWLIST LINE ONLY.
  const P_6D0B2_SHARED = ['base44/shared/documentIngestion/orchestration.ts', 'base44/shared/supabase/projectUrl.ts', 'base44/shared/documentIngestion/resume.ts', 'base44/shared/galileo/focusedDocument.ts', 'base44/shared/galileo/provisionalEvidence.ts'];
  // 6D.0c.1-P PRODUCTION REPAIR — a LATER, APPROVED slice: the certification harness
  // this phase repaired (test-only), and the report it updates.
  const unapprovedFrontend = changedFrontend.filter((f) => !P5_FRONTEND.includes(f) && !APPROVED_REPORTS.includes(f) && !P_6D0_FRONTEND.includes(f) && !CHF_FRONTEND.includes(f) && !P_6D0A_FRONTEND.includes(f) && !P_6D0B1_FRONTEND.includes(f) && f !== 'src/scripts/documentKnowledgeCompletion.test.cjs');
  check('F2  the only frontend file changed is the reviewed P5 Admin Documents tab (plus the later reviewed reports)', unapprovedFrontend.length === 0, unapprovedFrontend.join(', '));
  // S3.1 — the reviewed slice changes exactly ONE other backend function
  // (getDocumentsAdmin: bucket VOCABULARY only; its authorization surface is
  // proven unchanged by S6 above).
  const S31_BACKEND = ['base44/functions/getDocumentsAdmin/entry.ts'];
  // P-S3 REBASE — the reviewed P-S3 slice adds exactly ONE further backend function:
  // buildGalileoContext, whose authorization prologue is this slice's product change
  // (SEC-001). ENTRY above is already excluded; every OTHER backend function stays
  // forbidden, so this remains a whitelist of reviewed changes, not a relaxation.
  const P_S3_BACKEND = ['base44/functions/buildGalileoContext/entry.ts'];
  // 6D.0c.1-P PRODUCTION REPAIR — a LATER, APPROVED slice: askGalileo's consumer wiring.
  check('F3  no other backend function changed (S3.1: getDocumentsAdmin vocabulary, P-S3: buildGalileoContext authorization, 6D.0: the extraction entry point, hotfix: the upload function, 6D.0c.1-P: askGalileo consumer wiring)', !changed.some((f) => f.startsWith('base44/functions/') && f !== ENTRY && f !== 'base44/functions/askGalileo/entry.ts' && !S31_BACKEND.includes(f) && !P_S3_BACKEND.includes(f) && !P_6D0_BACKEND.includes(f) && !CHF_BACKEND.includes(f) && !P_6D0B2_BACKEND.includes(f)), changed.filter((f) => f.startsWith('base44/functions/')).join(', '));
  // S3.0.2 deliberately extends the change surface: relationship revocation is
  // enforced in the shared business-scope decision. Those two modules are the
  // reviewed S3.0.2 change; any OTHER shared module (documentAccess.ts included)
  // must still be untouched.
  const S302_SHARED = [
    'base44/shared/businessScope/writeGuard.ts',
    'base44/shared/businessScope/relationshipAccess.ts',
  ];
  // S3.1 — the reviewed slice ADDS exactly one shared module (the bucket policy).
  // The authorization spine (documentAccess.ts, actor.ts, relationshipAccess.ts,
  // writeGuard.ts) remains untouched.
  const S31_SHARED = ['base44/shared/documents/buckets.ts'];
  // 6D.0a REBASE — the reviewed Semantic Observation Bridge slice adds ONE shared
  // module (the bridge) and extends ONE shared module (the shared intelligence
  // contract, which now reads it). Allowlist lines ONLY: F1–F5, S1–S11 and every
  // mutation check above are untouched, and the authorization spine (actor.ts,
  // documentAccess.ts, relationshipAccess.ts, writeGuard.ts, buckets.ts) is still
  // proven unmodified.
  const P_6D0A_SHARED = [
    'base44/shared/documentObservation/semantics.ts',
    'base44/shared/intelligenceContract/businessIntelligenceContract.ts',
  ];
  // 6D.0b REBASE — the reviewed AUTOMATIC DOCUMENT UNDERSTANDING slice adds a
  // server-side understanding module set under base44/shared/documentUnderstanding/.
  // Allowlist lines ONLY: the canonical-actor rule, the admin authority table and
  // every mutation check above are untouched, and the authorization spine (actor.ts,
  // documentAccess.ts, relationshipAccess.ts, writeGuard.ts, buckets.ts) remains
  // proven unmodified by the checks below.
  const P_6D0B_SHARED = [
    'base44/shared/documentUnderstanding/taxonomy.ts',
    'base44/shared/documentUnderstanding/contract.ts',
    'base44/shared/documentUnderstanding/signals.ts',
    'base44/shared/documentUnderstanding/semanticClassifier.ts',
    'base44/shared/documentUnderstanding/understandDocument.ts',
    'base44/shared/documentUnderstanding/persist.ts',
    'base44/shared/documentUnderstanding/orchestrator.ts',
  ];
  const unapprovedShared = changed.filter((f) => f.startsWith('base44/shared/') && f !== ACTOR
    // 6D.0c.1-P PRODUCTION REPAIR — a LATER, APPROVED slice: the provisional lane and
    // the ONE canonical registry its aliases must resolve through.
    && f !== 'base44/shared/galileo/provisionalEvidence.ts' && f !== 'base44/shared/canonicalFact/registry.ts'
    // 6D.0c.2 — the evidence-first answer engine (reviewed slice list).
    && !require('./slice6D0C2Files.cjs').includes(f)
    && !S302_SHARED.includes(f) && !S31_SHARED.includes(f) && !P_6D0_SHARED.includes(f) && !CHF_SHARED.includes(f) && !P_6D0A_SHARED.includes(f) && !P_6D0B_SHARED.includes(f) && !P_6D0B2_SHARED.includes(f));
  check('F4  no other shared module changed (documentAccess.ts, relationshipAccess.ts included)', unapprovedShared.length === 0, unapprovedShared.join(', '));
  check('F5  no migration, SQL, Storage or RLS file changed', !changed.some((f) => f.startsWith('src/supabase/') || f.endsWith('.sql')), changed.filter((f) => f.endsWith('.sql')).join(', '));

  // ───────────────────────────────────────────────────────────────────────────
  // S3.0.1 — CANONICAL ADMIN AUTHORITY.
  //
  // The invariant: Base44 authentication establishes WHO the caller is. It never
  // grants VISION administrative standing. For an authenticated actor, standing
  // is `profiles.app_role ∈ {admin, super_admin}` and nothing else — no Base44
  // role, no forged field, and a missing canonical profile fails closed.
  console.log('\n── S3.0.1 CANONICAL ADMIN AUTHORITY — real authenticateActor, canonical-only ──');

  const A_USERS = {
    'u-c-admin-user': { id: 'u-c-admin-user', email: 'ca@vision.test', role: 'user' },
    'u-c-super-user': { id: 'u-c-super-user', email: 'cs@vision.test', role: 'user' },
    'u-c-admin-admin': { id: 'u-c-admin-admin', email: 'caa@vision.test', role: 'admin' },
    'u-c-owner-admin': { id: 'u-c-owner-admin', email: 'coa@vision.test', role: 'admin' },
    'u-c-owner-super': { id: 'u-c-owner-super', email: 'cos@vision.test', role: 'super_admin' },
    'u-c-advisor-admin': { id: 'u-c-advisor-admin', email: 'cad@vision.test', role: 'admin' },
    'u-c-expert-admin': { id: 'u-c-expert-admin', email: 'cex@vision.test', role: 'admin' },
    'u-c-team-admin': { id: 'u-c-team-admin', email: 'cte@vision.test', role: 'admin' },
    'u-c-owner-user': { id: 'u-c-owner-user', email: 'cou@vision.test', role: 'user' },
    'u-c-susp-admin': { id: 'u-c-susp-admin', email: 'csa@vision.test', role: 'admin' },
    'u-c-susp-owner': { id: 'u-c-susp-owner', email: 'cso@vision.test', role: 'admin' },
    'u-c-noprofile': { id: 'u-c-noprofile', email: 'cnp@vision.test', role: 'admin' },
  };
  const aProf = (id, app_role, uid, status) => ({ id, email: `${id}@vision.test`, app_role, base44_user_id: uid, profile_status: status });
  const A_FIX = {
    profiles: [
      aProf('cp-admin-user', 'admin', 'u-c-admin-user', 'active'),
      aProf('cp-super-user', 'super_admin', 'u-c-super-user', 'active'),
      aProf('cp-admin-admin', 'admin', 'u-c-admin-admin', 'active'),
      aProf('cp-owner-admin', 'owner', 'u-c-owner-admin', 'active'),
      aProf('cp-owner-super', 'owner', 'u-c-owner-super', 'active'),
      aProf('cp-advisor-admin', 'advisor', 'u-c-advisor-admin', 'active'),
      aProf('cp-expert-admin', 'expert_advisor', 'u-c-expert-admin', 'active'),
      aProf('cp-team-admin', 'team_member', 'u-c-team-admin', 'active'),
      aProf('cp-owner-user', 'owner', 'u-c-owner-user', 'active'),
      aProf('cp-susp-admin', 'admin', 'u-c-susp-admin', 'suspended'),
      aProf('cp-susp-owner', 'owner', 'u-c-susp-owner', 'suspended'),
    ],
    business_owners: [],
    business_entities: [],
  };
  // Forged request values are IN SCOPE for every run: a regression that trusted
  // them would be caught rather than merely asserted against.
  const FORGED = { requestBodyRole: 'admin', requestBodyAppRole: 'super_admin' };

  const authWithSource = async (source, userId) => {
    const api = vm.runInNewContext(`${source}\n;({ authenticateActor });`, {
      Response: ResponseStub,
      console: { log() {}, warn() {}, error() {} },
      validateBusinessScope,
      ...FORGED,
    });
    try {
      const a = await api.authenticateActor({ auth: { me: async () => A_USERS[userId] } }, makeSb(A_FIX));
      return { ok: true, isAdmin: a.isAdmin, isSuperAdmin: a.isSuperAdmin, role: a.role, profileId: a.profile_id, hasProfile: !!a.profile };
    } catch (e) {
      return { ok: false, status: e.status, name: e.name };
    }
  };
  const authAs = (userId) => authWithSource(ACTOR_JS, userId);

  const AUTHORITY = [
    { id: 'CA1', name: 'canonical admin + Base44 user → isAdmin TRUE', actor: 'u-c-admin-user', expect: true, role: 'admin' },
    { id: 'CA2', name: 'canonical super_admin + Base44 user → TRUE', actor: 'u-c-super-user', expect: true, super: true },
    { id: 'CA3', name: 'canonical admin + Base44 admin → TRUE', actor: 'u-c-admin-admin', expect: true },
    { id: 'CA4', name: 'canonical owner + Base44 ADMIN → FALSE', actor: 'u-c-owner-admin', expect: false, role: 'owner' },
    { id: 'CA5', name: 'canonical owner + Base44 SUPER_ADMIN → FALSE', actor: 'u-c-owner-super', expect: false, role: 'owner' },
    { id: 'CA6', name: 'canonical advisor + Base44 admin → FALSE', actor: 'u-c-advisor-admin', expect: false },
    { id: 'CA7', name: 'canonical expert_advisor + Base44 admin → FALSE', actor: 'u-c-expert-admin', expect: false },
    { id: 'CA8', name: 'canonical team_member + Base44 admin → FALSE', actor: 'u-c-team-admin', expect: false },
    { id: 'CA9', name: 'canonical owner + Base44 user → FALSE', actor: 'u-c-owner-user', expect: false },
    { id: 'CA12', name: 'forged request role + app_role cannot change standing', actor: 'u-c-owner-user', expect: false },
    { id: 'CA10', name: 'suspended canonical admin → DENY before isAdmin', actor: 'u-c-susp-admin', expect: 'deny' },
    { id: 'CA11', name: 'suspended canonical owner + Base44 admin → DENY', actor: 'u-c-susp-owner', expect: 'deny' },
    { id: 'CA14', name: 'NO canonical profile + Base44 admin → fail closed, no elevation', actor: 'u-c-noprofile', expect: false, role: 'user', hasProfile: false },
  ];

  const authorityOk = (tc, r) => {
    if (tc.expect === 'deny') return r.ok === false && r.status === 403 && r.name === 'HttpError';
    return r.ok === true &&
      r.isAdmin === tc.expect &&
      (tc.super === undefined || r.isSuperAdmin === tc.super) &&
      (tc.role === undefined || r.role === tc.role) &&
      (tc.hasProfile === undefined || r.hasProfile === tc.hasProfile);
  };

  for (const tc of AUTHORITY) {
    const r = await authAs(tc.actor);
    const ok = authorityOk(tc, r);
    check(`${tc.id.padEnd(5)} ${tc.name}`, ok, ok ? '' : `got ${JSON.stringify(r)}`);
  }

  // CA14 end-to-end: a profile-less Base44 admin cannot use the admin TARGET
  // OVERRIDE either — the failure is closed at the actor stage, before resolution.
  const noProfileActor = await (async () => {
    try {
      const api = vm.runInNewContext(`${ACTOR_JS}\n;({ authenticateActor });`, { Response: ResponseStub, console: { log() {}, warn() {}, error() {} }, validateBusinessScope, ...FORGED });
      return await api.authenticateActor({ auth: { me: async () => A_USERS['u-c-noprofile'] } }, makeSb(A_FIX));
    } catch { return null; }
  })();
  const noProfileOut = await resolveOverrideTarget(makeSb(A_FIX), noProfileActor, { targetEmail: CLIENT, targetProfileId: null });
  check('CA14b profile-less Base44 admin cannot admin-override a target (fail closed)', !!noProfileOut.denial && noProfileOut.denial.status === 403, JSON.stringify(noProfileOut.denial || noProfileOut));

  // Static: the rule is stated once, canonically, and reads no request input.
  check('S301-1 the authority input is the canonical profile role ONLY', /isAdmin: ADMIN_ROLES\.includes\(appRole\),/.test(ACTOR_SRC) && !/base44Role/.test(ACTOR_SRC));
  check('S301-2 isSuperAdmin is canonical-only too', /isSuperAdmin: appRole === 'super_admin',/.test(ACTOR_SRC));
  check('S301-3 the role string carries no Base44 fallback', /role: appRole \|\| 'user',/.test(ACTOR_SRC));
  check('S301-4 still ONE admin-role list, defined once', /export const ADMIN_ROLES = \['admin', 'super_admin'\];/.test(ACTOR_SRC) && (ACTOR_SRC.match(/ADMIN_ROLES = \[/g) || []).length === 1);
  check('S301-5 the suspension gate still precedes role derivation', AUTH_FN.indexOf("=== 'suspended'") < AUTH_FN.indexOf('const appRole'));
  check('S301-6 the actor function reads no request input, and no forged value reaches it', !/\bbody\b|\breq\b|requestBody/.test(AUTH_FN) && !/requestBody(Role|AppRole)/.test(AUTH_FN));
  check('S301-7 the Base44 role is no longer read for standing', !/user\.role/.test(AUTH_FN));

  // Shared-flag consumers inherit the rule instead of restating it.
  const sharedFlagConsumers = [
    'base44/functions/supabaseProfileData/entry.ts',
    'base44/functions/documentAssignments/entry.ts',
    'base44/functions/getDocumentsAdmin/entry.ts',
  ];
  check('S301-8 every shared-flag consumer resolves the actor through the shared contract', sharedFlagConsumers.every((f) => /shared\/authz\/actor\.ts/.test(read(f))));
  check('S301-9 none of them derives standing from the Base44 role', sharedFlagConsumers.every((f) => !/user\??\.role\s*(===|!==|\|\|)/.test(read(f))));

  // Mutations — mutate the REAL actor source, prove each regression is caught.
  const A_ISADMIN = 'isAdmin: ADMIN_ROLES.includes(appRole),';
  const MUT_S301 = [
    { id: 'A', name: 'Base44 role restored to isAdmin', find: A_ISADMIN, replace: 'isAdmin: ADMIN_ROLES.includes(appRole) || ADMIN_ROLES.includes(user.role || null),', mustCatch: ['CA4', 'CA5', 'CA6', 'CA7', 'CA8'] },
    { id: 'B', name: 'forged request role trusted', find: A_ISADMIN, replace: 'isAdmin: ADMIN_ROLES.includes(appRole) || ADMIN_ROLES.includes(requestBodyRole || null),', mustCatch: ['CA12'] },
    { id: 'C', name: 'forged request app_role trusted', find: A_ISADMIN, replace: 'isAdmin: ADMIN_ROLES.includes(appRole) || ADMIN_ROLES.includes(requestBodyAppRole || null),', mustCatch: ['CA12'] },
    { id: 'D', name: 'Base44 admin exempted from the canonical role', find: A_ISADMIN, replace: "isAdmin: ADMIN_ROLES.includes(appRole) || user.role === 'admin',", mustCatch: ['CA4', 'CA6', 'CA7', 'CA8'] },
    { id: 'E', name: 'missing-profile Base44 admin becomes VISION admin', find: A_ISADMIN, replace: 'isAdmin: appRole ? ADMIN_ROLES.includes(appRole) : ADMIN_ROLES.includes(user.role || null),', mustCatch: ['CA14'] },
    { id: 'F', name: 'suspension gate bypassed', find: "if (profile?.profile_status === 'suspended') {", replace: 'if (false) {', mustCatch: ['CA10', 'CA11'] },
  ];
  for (const mut of MUT_S301) {
    if (!ACTOR_SRC.includes(mut.find)) {
      check(`M-S301-${mut.id} ${mut.name}`, false, `mutation anchor not found: ${mut.find.slice(0, 46)}`);
      continue;
    }
    const mutatedSource = toJs(strip(ACTOR_SRC.replace(mut.find, mut.replace)));
    const caught = [];
    for (const caseId of mut.mustCatch) {
      const tc = AUTHORITY.find((s) => s.id === caseId);
      const r = await authWithSource(mutatedSource, tc.actor);
      if (!authorityOk(tc, r)) caught.push(caseId);
    }
    check(`M-S301-${mut.id} ${mut.name} → caught by [${caught.join(', ') || 'NOTHING'}]`, caught.length > 0, caught.length ? '' : 'the harness would NOT have caught this regression');
  }

  console.log('\n' + '─'.repeat(72));
  if (failures.length) {
    console.log(`RESULT: FAIL — ${failures.length} assertion(s) failed`);
    failures.forEach((f) => console.log(`   · ${f}`));
    process.exit(1);
  }
  console.log('RESULT: PASS — canonical actor/target resolution verified against the real code.');
  console.log('No network, database or production record was touched by this script.');
})().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});