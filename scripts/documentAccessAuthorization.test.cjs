#!/usr/bin/env node
/**
 * documentAccessAuthorization.test.cjs — Phase S3 authorization guard.
 *
 * Run:  node scripts/documentAccessAuthorization.test.cjs
 *
 * TWO KINDS OF ASSERTION — both NON-DESTRUCTIVE. This script creates, modifies
 * and deletes NOTHING. It performs no database, storage or network I/O.
 *
 *   UNIT / MOCK — the REAL source of base44/shared/authz/documentAccess.ts is
 *     executed in a node:vm sandbox (its TS-only type declarations and `: any`
 *     annotations are stripped, which is why the module keeps each type
 *     declaration on one line) and the full authorization decision table is
 *     exercised against a MOCKED business check.
 *
 *   CONTROL FLOW — static assertions on the SOURCE of
 *     base44/functions/getDocumentsAdmin/entry.ts, proving that authorization
 *     precedes the delete / createSignedUrl calls and that no broadening
 *     fallback branch remains.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const MODULE = 'base44/shared/authz/documentAccess.ts';
const ENTRY = 'base44/functions/getDocumentsAdmin/entry.ts';

const failures = [];
const check = (label, ok, detail = '') => {
  if (!ok) failures.push(detail ? `${label} — ${detail}` : label);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? ` — ${detail}` : ''}`);
};

// ─────────────────────────────────────────────────────────────────────────────
// Load the REAL module source into a sandbox.
// ─────────────────────────────────────────────────────────────────────────────
const moduleSource = fs.readFileSync(path.join(ROOT, MODULE), 'utf8');

const runtimeSource = moduleSource
  .split('\n')
  .filter((line) => !/^\s*export\s+(type|interface)\b/.test(line))
  .join('\n')
  .replace(/^\s*export\s+/gm, '')
  .replace(/:\s*any\b/g, '');

let api;
try {
  api = vm.runInNewContext(
    `${runtimeSource}\n;({ isOwnerOfRecord, resolveDocumentAuthorization, authorizeDocumentAccess });`,
    {}
  );
} catch (err) {
  console.error(`FATAL  could not evaluate ${MODULE} in sandbox — ${err.message}`);
  process.exit(1);
}

const { resolveDocumentAuthorization, authorizeDocumentAccess } = api;

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────
const OWNER = { profile_id: 'p-owner', isAdmin: false, hasProfile: true };
const ADVISOR = { profile_id: 'p-advisor', isAdmin: false, hasProfile: true };
const TEAM = { profile_id: 'p-team', isAdmin: false, hasProfile: true };
const ASSIGNEE = { profile_id: 'p-assignee', isAdmin: false, hasProfile: true };
const STRANGER = { profile_id: 'p-stranger', isAdmin: false, hasProfile: true };
const ADMIN = { profile_id: 'p-admin', isAdmin: true, hasProfile: true };
const NO_PROFILE = { profile_id: null, isAdmin: false, hasProfile: false };

const OWN_DOC = { id: 'doc-own', profile_id: 'p-owner', business_id: 'b-1' };
const FOREIGN_DOC = { id: 'doc-foreign', profile_id: 'p-other', business_id: 'b-2' };
const BUSINESSLESS_DOC = { id: 'doc-nobiz', profile_id: 'p-other', business_id: null };

/** Mocked canonical business check. Records every call. */
function mockBusinessCheck(allowedBusinessIds) {
  const calls = [];
  const fn = async (businessId) => {
    calls.push(businessId);
    if (allowedBusinessIds.includes(businessId)) return;
    throw new Error('denied');
  };
  return { fn, calls };
}

async function run(doc, actor, operation, allowed = []) {
  const { fn, calls } = mockBusinessCheck(allowed);
  const verdict = await authorizeDocumentAccess({
    doc,
    actor,
    operation,
    checkBusinessAccess: fn,
  });
  return { verdict, calls };
}

// ─────────────────────────────────────────────────────────────────────────────
// UNIT / MOCK TESTED — VIEW decision table
// ─────────────────────────────────────────────────────────────────────────────
async function viewTests() {
  console.log('\n── UNIT/MOCK — VIEW ──');

  let r = await run(OWN_DOC, OWNER, 'view');
  check('VIEW  owner + own document → ALLOW', r.verdict.authorized === true, r.verdict.reason);

  r = await run(FOREIGN_DOC, OWNER, 'view');
  check('VIEW  owner + foreign document → DENY', r.verdict.authorized === false, r.verdict.reason);

  r = await run(FOREIGN_DOC, ADVISOR, 'view', ['b-2']);
  check('VIEW  active assigned advisor + authorized business → ALLOW', r.verdict.authorized === true, r.verdict.reason);

  r = await run(FOREIGN_DOC, ADVISOR, 'view', []);
  check('VIEW  unrelated advisor + foreign document → DENY', r.verdict.authorized === false, r.verdict.reason);

  r = await run(FOREIGN_DOC, ADVISOR, 'view', []);
  check('VIEW  revoked advisor (canonical check denies) → DENY', r.verdict.authorized === false, r.verdict.reason);

  r = await run(FOREIGN_DOC, TEAM, 'view', ['b-2']);
  check('VIEW  team member + authorized business → ALLOW', r.verdict.authorized === true, r.verdict.reason);

  r = await run(FOREIGN_DOC, ASSIGNEE, 'view', []);
  check('VIEW  document assignee without business access → DENY', r.verdict.authorized === false, r.verdict.reason);

  r = await run(FOREIGN_DOC, STRANGER, 'view', []);
  check('VIEW  unrelated user + known UUID → DENY', r.verdict.authorized === false, r.verdict.reason);

  r = await run(null, OWNER, 'view');
  check('VIEW  nonexistent document → DENY', r.verdict.authorized === false, r.verdict.reason);

  r = await run(BUSINESSLESS_DOC, STRANGER, 'view');
  check('VIEW  null business + non-owner → DENY (fail closed)', r.verdict.authorized === false, r.verdict.reason);

  r = await run(OWN_DOC, ADMIN, 'view');
  check('VIEW  admin → ALLOW', r.verdict.authorized === true, r.verdict.reason);

  // Tenant must come from the DOCUMENT. A caller-supplied business id is not
  // even an input to the decision — the required business is the document's.
  const decided = resolveDocumentAuthorization(FOREIGN_DOC, ADVISOR, 'view');
  check(
    'VIEW  required business is taken from the DOCUMENT row, never the caller',
    decided.outcome === 'require_business' && decided.business_id === FOREIGN_DOC.business_id,
    JSON.stringify(decided)
  );

  const forged = resolveDocumentAuthorization(
    { id: 'd', profile_id: 'p-other', business_id: 'b-real' },
    { profile_id: 'p-advisor', isAdmin: false, hasProfile: true },
    'view'
  );
  check(
    'VIEW  a client-supplied business_id cannot redirect the tenant',
    forged.outcome === 'require_business' && forged.business_id === 'b-real',
    JSON.stringify(forged)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// UNIT / MOCK TESTED — DELETE decision table
// ─────────────────────────────────────────────────────────────────────────────
async function deleteTests() {
  console.log('\n── UNIT/MOCK — DELETE ──');

  let r = await run(OWN_DOC, ADMIN, 'delete');
  check('DEL   admin → ALLOW', r.verdict.authorized === true, r.verdict.reason);

  r = await run(OWN_DOC, OWNER, 'delete');
  check('DEL   owner-of-record → ALLOW', r.verdict.authorized === true, r.verdict.reason);

  // THE CRITICAL CASE: an advisor who HAS full business access still cannot
  // delete. Authorization denies and the business check is never even consulted.
  r = await run(FOREIGN_DOC, ADVISOR, 'delete', ['b-2']);
  check('DEL   advisor WITH business access → DENY (stricter than VIEW)', r.verdict.authorized === false, r.verdict.reason);
  check('DEL   advisor denial does not consult the business check', r.calls.length === 0, `calls=${r.calls.length}`);

  r = await run(FOREIGN_DOC, TEAM, 'delete', ['b-2']);
  check('DEL   team member → DENY', r.verdict.authorized === false, r.verdict.reason);
  check('DEL   team-member denial does not consult the business check', r.calls.length === 0, `calls=${r.calls.length}`);

  r = await run(FOREIGN_DOC, ASSIGNEE, 'delete', ['b-2']);
  check('DEL   document assignee → DENY', r.verdict.authorized === false, r.verdict.reason);

  r = await run(FOREIGN_DOC, STRANGER, 'delete', ['b-2']);
  check('DEL   unrelated user → DENY', r.verdict.authorized === false, r.verdict.reason);

  r = await run(null, OWNER, 'delete');
  check('DEL   nonexistent / foreign UUID → DENY', r.verdict.authorized === false, r.verdict.reason);

  r = await run(FOREIGN_DOC, ADVISOR, 'delete');
  check('DEL   denial outcome is never "require_business"', r.calls.length === 0 && r.verdict.authorized === false);

  const d = resolveDocumentAuthorization(FOREIGN_DOC, ADVISOR, 'delete');
  check('DEL   advisor decision is a flat DENY', d.outcome === 'deny', JSON.stringify(d));
}

// ─────────────────────────────────────────────────────────────────────────────
// Module purity — the decision module performs no I/O and holds no client.
// ─────────────────────────────────────────────────────────────────────────────
function purityTests() {
  console.log('\n── UNIT/MOCK — module purity ──');

  check('MOD   no imports', !/^\s*import\s/m.test(moduleSource));
  check('MOD   no database client', !moduleSource.includes('sb.from('));
  check('MOD   no storage call', !moduleSource.includes('createSignedUrl'));
  check('MOD   performs no delete', !moduleSource.includes('.delete('));
  check('MOD   never reads request body', !/\bbody\b/.test(moduleSource));
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTROL FLOW VERIFIED — static execution-path assertions on entry.ts
// ─────────────────────────────────────────────────────────────────────────────
function controlFlowTests() {
  console.log('\n── CONTROL FLOW — getDocumentsAdmin/entry.ts ──');

  const entry = fs.readFileSync(path.join(ROOT, ENTRY), 'utf8');

  const deleteBlock = entry.slice(
    entry.indexOf("body.action === 'delete'"),
    entry.indexOf("body.action === 'getSignedUrl'")
  );
  const signBlock = entry.slice(
    entry.indexOf("body.action === 'getSignedUrl'"),
    entry.indexOf('QUERY action')
  );

  check(
    'CF    delete: authorization is invoked',
    deleteBlock.includes("loadAuthorizedDocument(sb, actor, body.document_id, 'delete')")
  );
  check(
    'CF    delete: authorization precedes the delete call',
    deleteBlock.indexOf('loadAuthorizedDocument') !== -1 &&
      deleteBlock.indexOf('loadAuthorizedDocument') < deleteBlock.indexOf('.delete()')
  );
  check(
    'CF    delete: deletes the AUTHORIZED row (doc.id), not the raw request id',
    deleteBlock.includes("eq('id', doc.id)") && !deleteBlock.includes("eq('id', document_id)")
  );

  check(
    'CF    getSignedUrl: authorization is invoked',
    signBlock.includes("loadAuthorizedDocument(sb, actor, body.document_id, 'view')")
  );
  check(
    'CF    getSignedUrl: authorization precedes createSignedUrl',
    signBlock.indexOf('loadAuthorizedDocument') !== -1 &&
      signBlock.indexOf('loadAuthorizedDocument') < signBlock.indexOf('createSignedUrl')
  );
  check('CF    getSignedUrl: path comes from the authorized doc row', signBlock.includes('doc.file_path'));

  check(
    'CF    actor is resolved before any action is handled',
    entry.indexOf('authenticateActor(') !== -1 &&
      entry.indexOf('authenticateActor(') < entry.indexOf("body.action === 'delete'")
  );
  check('CF    no client-supplied identity is consulted', !entry.includes('_router_user_email'));

  // S3.1 REBASE — the local two-bucket ALLOWED_BUCKETS list was replaced by the ONE
  // shared policy (shared/documents/buckets.ts). The invariant is now that the
  // shared policy governs the query bucket and that no local list remains; the
  // unknown-bucket refusal asserted below is unchanged.
  check('CF    query: bucket vocabulary comes from the SHARED policy', entry.includes('isApprovedDocumentBucket') && !entry.includes('ALLOWED_BUCKETS'));
  check('CF    query: unknown bucket is refused', entry.includes('Invalid bucket'));
  check(
    'CF    query: the broadening fallback branch is GONE',
    !/}\s*else\s*\{\s*\n\s*if \(target_profile_id\) query/.test(entry)
  );
  check('CF    query: non-admin must supply a business', entry.includes('An authorized business is required'));
  check(
    'CF    query: supplied business is validated against the actor',
    entry.includes('authorizeBusinessAccess(sb, actor, target_business_id)')
  );
  check(
    'CF    query: non-admin business is a hard constraint',
    /}\s*else\s*\{\s*\n\s*query = query\.eq\('business_id', target_business_id\);/.test(entry)
  );
  check('CF    query: limit is clamped', entry.includes('Math.min(Math.max(Number(limit)'));
  check('CF    errors are status-preserving and non-leaking', entry.includes('errorResponse(error)'));
}

// ─────────────────────────────────────────────────────────────────────────────
(async () => {
  await viewTests();
  await deleteTests();
  purityTests();
  controlFlowTests();

  console.log('\n' + '─'.repeat(70));
  if (failures.length) {
    console.log(`RESULT: FAIL — ${failures.length} assertion(s) failed`);
    failures.forEach((f) => console.log(`   · ${f}`));
    process.exit(1);
  }
  console.log('RESULT: PASS — all assertions passed (unit/mock + control-flow).');
  console.log('No live record was created, modified or deleted by this script.');
})();