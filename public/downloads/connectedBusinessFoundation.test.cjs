#!/usr/bin/env node
/**
 * CONNECTED BUSINESS — CB-001 FOUNDATION CONTRACT (CB-1 … CB-25, M-series).
 *
 * WHAT THIS PROVES
 *   The connection + credential foundation is safe to deploy: the two tables
 *   exist as specified, the same-business integrity is enforced STRUCTURALLY
 *   (composite FK, not application logic), the ACL trap left by SEC-031/SEC-032
 *   is defeated explicitly rather than inherited, no browser role can reach
 *   either table, credential plaintext has no path into either table, and the
 *   migration cannot touch the Digital Twin fact freeze.
 *
 * WHAT IT LOADS
 *   · src/supabase/migrations/phase_cb_001_connection_credential_foundation.sql
 *   · src/supabase/migrations/phase_cb_001_connection_credential_foundation_verification.sql
 *   · src/supabase/migrations/phase_cb_001_connection_credential_foundation_certification.sql
 *     — the deployed-posture artifact, including the full 8-privilege effective
 *       matrix (rows L2 / L3 / L4). The P-series PARSES its predicates and runs
 *       them against privilege states, so the matrix is tested behaviourally.
 *   · src/supabase/migrations/phase_cb_001_2_supersession_rotation_unit_integrity.sql
 *     — CB-001.2, the ADDITIVE rotation-unit hardening. Checked by CB-33 (exact
 *       ordered column mapping of both new objects, not name presence) and
 *       mutation-certified by MU-10.
 *   · src/supabase/migrations/phase_cb_002_vault_credential_wrappers.sql (+ its
 *     certification, adversarial and residue companions) — CB-002, the Vault
 *     credential wrapper surface. Checked by CB-34 … CB-45 and mutated by the
 *     MU2-series: the four wrappers must be service_role-only, SECURITY DEFINER,
 *     owner-pinned, search_path-pinned, and may never return plaintext more
 *     broadly than the one documented resolve contract.
 *   · base44/shared/providers/vocabulary.ts — TRANSPILED WITH THE REAL esbuild
 *     AND EXECUTED, so the metadata guard is tested behaviourally, not by reading
 *     its source text. The shipped module is the thing under test.
 *
 * WHAT IT CANNOT PROVE (deployment-dependent — see the verification .sql)
 *   That the tables are actually deployed with these ACLs. This harness certifies
 *   the artifact; the read-only catalog probes certify the deployment.
 *
 * Run: node scripts/connectedBusinessFoundation.test.cjs
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SQL_PATH = path.join(ROOT, 'src/supabase/migrations/phase_cb_001_connection_credential_foundation.sql');
const VERIFY_PATH = path.join(ROOT, 'src/supabase/migrations/phase_cb_001_connection_credential_foundation_verification.sql');
const VOCAB_PATH = path.join(ROOT, 'base44/shared/providers/vocabulary.ts');
const CERT_PATH = path.join(ROOT, 'src/supabase/migrations/phase_cb_001_connection_credential_foundation_certification.sql');
const CB12_PATH = path.join(ROOT, 'src/supabase/migrations/phase_cb_001_2_supersession_rotation_unit_integrity.sql');
const CB2_PATH = path.join(ROOT, 'src/supabase/migrations/phase_cb_002_vault_credential_wrappers.sql');
const CB2CERT_PATH = path.join(ROOT, 'src/supabase/migrations/phase_cb_002_vault_credential_wrappers_certification.sql');
const CB2ADV_PATH = path.join(ROOT, 'src/supabase/migrations/phase_cb_002_vault_credential_wrappers_adversarial.sql');
const CB2RES_PATH = path.join(ROOT, 'src/supabase/migrations/phase_cb_002_vault_credential_wrappers_adversarial_residue.sql');
const CB2PRE_PATH = path.join(ROOT, 'src/supabase/migrations/phase_cb_002_vault_live_preflight.sql');
const CB3_PATH = path.join(ROOT, 'src/supabase/migrations/phase_cb_003_provider_authorization_attempts.sql');
const CB3CERT_PATH = path.join(ROOT, 'src/supabase/migrations/phase_cb_003_provider_authorization_attempts_certification.sql');
const CB3ADV_PATH = path.join(ROOT, 'src/supabase/migrations/phase_cb_003_provider_authorization_attempts_adversarial.sql');
const CB3RES_PATH = path.join(ROOT, 'src/supabase/migrations/phase_cb_003_provider_authorization_attempts_adversarial_residue.sql');
const CB21_PATH = path.join(ROOT, 'src/supabase/migrations/phase_cb_002_1_rotation_lifecycle_hardening.sql');
const CB21CERT_PATH = path.join(ROOT, 'src/supabase/migrations/phase_cb_002_1_rotation_lifecycle_hardening_certification.sql');
const CB21ADV_PATH = path.join(ROOT, 'src/supabase/migrations/phase_cb_002_1_rotation_lifecycle_hardening_adversarial.sql');
const CB21RES_PATH = path.join(ROOT, 'src/supabase/migrations/phase_cb_002_1_rotation_lifecycle_hardening_adversarial_residue.sql');
const CB2MOD_PATH = path.join(ROOT, 'scripts/cb002VaultWrapperChecks.cjs');
const createCb2Checks = require('./cb002VaultWrapperChecks.cjs');
const createCb3Checks = require('./cb003AuthorizationAttemptChecks.cjs');
const CB4_PATH = path.join(ROOT, 'src/supabase/migrations/phase_cb_004_provider_operation_authorization.sql');
const CB4CERT_PATH = path.join(ROOT, 'src/supabase/migrations/phase_cb_004_provider_operation_authorization_certification.sql');
const CB4ADV_PATH = path.join(ROOT, 'src/supabase/migrations/phase_cb_004_provider_operation_authorization_adversarial.sql');
const CB4RES_PATH = path.join(ROOT, 'src/supabase/migrations/phase_cb_004_provider_operation_authorization_adversarial_residue.sql');
const CB4KERNEL_PATH = path.join(ROOT, 'base44/shared/providers/authorization.ts');
// CB-004.2 — the additive system-execution operation. Its migration is passed to
// the kernel checks as `mig42`: the effective operation domain and the effective
// system narrowing are the UNION of the applied CB-004 artifact and this one
// successor, so both are parsed rather than one being assumed.
const CB42_PATH = path.join(ROOT, 'src/supabase/migrations/phase_cb_004_2_system_execution_operation.sql');
const createCb21Checks = require('./cb0021RotationLifecycleChecks.cjs');
const createCb4Checks = require('./cb004AuthorizationKernelChecks.cjs');
// CB-004.1 — the live-sync authorization boundary. Its own module, executed
// behaviourally: the REAL entry point runs against a stub environment with the
// canonical Security Kernel injected as spies.
const createCb41Checks = require('./cb0041LiveSyncAuthorizationChecks.cjs');
// CB-005B — the provider execution foundation. Its checks live in their own module
// and run the REAL shipped pipeline (policy, identity, checkpoint, system context,
// repository, executor) against an in-process model of the SQL contracts, so the
// fencing, lease, dedup and checkpoint semantics are executed rather than asserted.
const CB5B_MIG_PATH = path.join(ROOT, 'src/supabase/migrations/phase_cb_005b_provider_execution_foundation.sql');
const CB5B_VERIFY_PATH = path.join(ROOT, 'src/supabase/migrations/phase_cb_005b_provider_execution_foundation_verification.sql');
const CB5B_POLICY_PATH = path.join(ROOT, 'base44/shared/providerSync/executionPolicy.ts');
const CB5B_STATE_PATH = path.join(ROOT, 'base44/shared/providerSync/jobStateMachine.ts');
const CB5B_IDENTITY_PATH = path.join(ROOT, 'base44/shared/providerSync/observationIdentity.ts');
const CB5B_CHECKPOINT_PATH = path.join(ROOT, 'base44/shared/providerSync/checkpointPolicy.ts');
const CB5B_SYSTEM_PATH = path.join(ROOT, 'base44/shared/providerSync/systemContext.ts');
const CB5B_REPO_PATH = path.join(ROOT, 'base44/shared/providerSync/jobRepository.ts');
const CB5B_EXEC_PATH = path.join(ROOT, 'base44/shared/providerSync/workerExecutor.ts');
const CB5B_ENTRY_PATH = path.join(ROOT, 'base44/functions/providerSyncWorker/entry.ts');
const CB5B_PREFLIGHT_PATH = path.join(ROOT, 'src/supabase/migrations/phase_cb_005b_provider_execution_foundation_preflight.sql');
const createCb5bChecks = require('./cb005bProviderExecutionChecks.cjs');
const CB41_ENTRY_PATH = path.join(ROOT, 'base44/functions/liveSyncOrchestrator/entry.ts');
const CB41_MODULE_PATH = path.join(ROOT, 'base44/shared/businessStateSync/liveSyncAuthorization.ts');
const CB41_PROJECTURL_PATH = path.join(ROOT, 'base44/shared/supabase/projectUrl.ts');
const CB41_EVENTS_PATH = path.join(ROOT, 'base44/shared/businessStateSync/events.ts');

const read = (p) => fs.readFileSync(p, 'utf8');

// Comment lines carry the design rationale and DO mention the fact tables and
// Vault on purpose. Freeze-neutrality and no-vault-writes must be judged on the
// EXECUTABLE statements only.
const stripComments = (src) => src.replace(/--.*$/gm, '');

let failures = [];
let checks = 0;

const ok = (id, condition, detail) => {
  checks += 1;
  if (!condition) failures.push(`${id}${detail ? ` — ${detail}` : ''}`);
  return !!condition;
};

const has = (src, re) => (re instanceof RegExp ? re.test(src) : src.includes(re));

// ── The canonical credential-name vocabularies (Issue 1 + Issue 2) ──────────
// ONE definition per list, asserted against BOTH the migration and the
// certification, so a list can never drift between the defense and its proof.
//
// PROHIBITED_CREDENTIAL_COLUMNS — column names that must never exist.
// PROHIBITED_METADATA_KEYS — the same names PLUS bare `token`/`secret`, applied to
//   the safe-metadata JSON objects. A key named exactly `token` is
//   credential-shaped; a key named `token_expires_at` is bookkeeping. Exact key
//   membership is what keeps those two apart, and the distinction is the whole
//   point of the constraint.
// APPROVED_REFERENCE_COLUMNS — vault_secret_id: an opaque POINTER to a Vault
//   secret, never the secret itself. It contains the substring "secret", which is
//   exactly why no guard in this suite may be a substring match.
const PROHIBITED_CREDENTIAL_COLUMNS = [
  'access_token', 'refresh_token', 'public_token', 'authorization_code',
  'client_secret', 'client_secret_value', 'password', 'credential_value',
  'plaintext_secret', 'decrypted_secret', 'token_value', 'secret_value',
];
const PROHIBITED_METADATA_KEYS = [...PROHIBITED_CREDENTIAL_COLUMNS, 'token', 'secret'];
const APPROVED_REFERENCE_COLUMNS = ['vault_secret_id'];

// ── The COMPLETE effective privilege matrix (certification rows L2 / L3 / L4) ─
// ONE definition of the invariant. It is asserted against the artifact AND used
// to drive the behavioural tests, so the invariant and its proof cannot drift.
// MAINTAIN is a real PostgreSQL 17 table privilege and IS included: the live ACL
// which exposed the production defect read `arwdDxtm`.
const GRANTED_TO_SERVICE_ROLE = ['SELECT', 'INSERT', 'UPDATE'];
const FORBIDDEN_EFFECTIVE = ['DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'];
const EFFECTIVE_PRIVILEGES = [...GRANTED_TO_SERVICE_ROLE, ...FORBIDDEN_EFFECTIVE];
const CB001_TABLES = ['business_connections', 'provider_credentials'];
// privilege → the CTE column alias that probes it
const PRIV_COLUMN = {
  SELECT: 'sel', INSERT: 'ins', UPDATE: 'upd', DELETE: 'del',
  TRUNCATE: 'trunc', REFERENCES: 'refs', TRIGGER: 'trig', MAINTAIN: 'maint',
};
const COLUMN_PRIV = Object.fromEntries(Object.entries(PRIV_COLUMN).map(([p, c]) => [c, p]));
const MATRIX_ROW_FOR = { service_role: 'L2', anon: 'L3', authenticated: 'L4' };
// The full report: 27 pre-existing rows (A … V) + the matrix rows L2/L3/L4.
const CERT_ROW_IDS = ['A', 'B', 'C1', 'C2', 'C3', 'C4', 'C5', 'D', 'E', 'F', 'F2', 'G',
  'H', 'I', 'J', 'K', 'L', 'L2', 'L3', 'L4', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V'];

// ── Load the subject of this certification ──────────────────────────────────
const sql = read(SQL_PATH);
const verifySql = read(VERIFY_PATH);
const liveSql = stripComments(sql);

// ── Load the REAL vocabulary module via esbuild ─────────────────────────────
function loadVocabulary(source) {
  const { transformSync } = require('esbuild');
  const out = transformSync(source, { loader: 'ts', format: 'cjs', target: 'node18' });
  const mod = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('exports', 'module', 'require', out.code)(mod.exports, mod, require);
  return mod.exports;
}

// ============================================================================
// CB-1..CB-8 — business_connections
// ============================================================================
function checkConnectionTable(src) {
  const block = src.slice(src.indexOf('create table if not exists public.business_connections'));
  const body = block.slice(0, block.indexOf('create index'));

  const columns = [
    'id', 'business_id', 'provider', 'connection_category', 'provider_organization_id',
    'provider_organization_name', 'display_name', 'status', 'capabilities',
    'connected_by_profile_id', 'initiated_by_profile_id', 'connected_at',
    'disconnected_at', 'disconnected_by_profile_id',
    'last_sync_started_at', 'last_sync_completed_at', 'last_successful_sync_at',
    'sync_status', 'last_error_class', 'reauthorization_required',
    'metadata_safe', 'created_at', 'updated_at',
  ];
  ok('CB-1', columns.every((c) => new RegExp(`^\\s+${c}\\s`, 'm').test(body)),
    `missing column(s): ${columns.filter((c) => !new RegExp(`^\\s+${c}\\s`, 'm').test(body)).join(', ')}`);

  // FK targets must be the canonically deployed identities, and the delete
  // semantics must differ: business cascades, actors are never cascaded into.
  ok('CB-2', /business_id\s+uuid not null references public\.business_entities\(id\) on delete cascade/.test(body),
    'business FK must reference public.business_entities(id) ON DELETE CASCADE');
  ok('CB-3',
    ['connected_by_profile_id', 'initiated_by_profile_id', 'disconnected_by_profile_id']
      .every((c) => new RegExp(`${c}\\s+uuid null references public\\.profiles\\(id\\) on delete set null`).test(body)),
    'actor FKs must reference public.profiles(id) ON DELETE SET NULL — actor deletion must never delete connection history');

  // Status vs sync_status are deliberately separate vocabularies.
  ok('CB-4', /constraint business_connections_status_check[\s\S]{0,200}'connecting', 'active', 'syncing', 'needs_attention', 'error', 'disconnected', 'revoked'/.test(body),
    'connection status vocabulary wrong');
  ok('CB-5', /constraint business_connections_sync_status_check[\s\S]{0,140}sync_status is null or sync_status in \('idle', 'running', 'failed', 'needs_reauth'\)/.test(body),
    'sync_status must be nullable and separate from connection status');

  // Unique connection identity, and NOT globally unique on the provider org.
  ok('CB-6', /constraint business_connections_identity_unique\s+unique \(business_id, provider, provider_organization_id\)/.test(body),
    'unique (business_id, provider, provider_organization_id) missing');
  ok('CB-6b',
    !/unique\s*\(\s*provider_organization_id\s*\)/.test(src) &&
    !/create unique index[\s\S]{0,120}on public\.business_connections \(provider_organization_id\)/i.test(src),
    'provider_organization_id must NOT be globally unique — that would make it a cross-business authorization primitive');

  // Same-business anchor used by the credential composite FK.
  ok('CB-7', /constraint business_connections_id_business_unique\s+unique \(id, business_id\)/.test(body),
    'unique (id, business_id) anchor missing — the credential composite FK cannot work without it');

  // Only the three justified indexes.
  const idx = ['business_connections_business_status_idx', 'business_connections_provider_org_idx', 'business_connections_provider_status_idx'];
  ok('CB-8', idx.every((i) => src.includes(i)), `missing index(es): ${idx.filter((i) => !src.includes(i)).join(', ')}`);
  ok('CB-8b', (src.match(/create index if not exists business_connections_/g) || []).length === 3,
    'unexpected number of business_connections indexes — only the three justified paths should exist');
}

// ============================================================================
// CB-9..CB-14 — provider_credentials
// ============================================================================
function checkCredentialTable(src) {
  const start = src.indexOf('create table if not exists public.provider_credentials');
  const block = src.slice(start);
  const body = block.slice(0, block.indexOf('create unique index'));

  const columns = [
    'id', 'business_connection_id', 'business_id', 'credential_type', 'vault_secret_id',
    'status', 'expires_at', 'rotation_metadata_safe', 'created_at', 'updated_at',
    'revoked_at', 'superseded_by_credential_id',
  ];
  ok('CB-9', columns.every((c) => new RegExp(`^\\s+${c}\\s`, 'm').test(body)),
    `missing column(s): ${columns.filter((c) => !new RegExp(`^\\s+${c}\\s`, 'm').test(body)).join(', ')}`);

  // THE CENTRAL SECURITY CLAIM: same-business integrity is structural.
  ok('CB-10', /constraint provider_credentials_connection_same_business_fkey\s+foreign key \(business_connection_id, business_id\)\s+references public\.business_connections \(id, business_id\) on delete cascade/.test(body),
    'composite same-business FK missing — a Business A credential must be structurally incapable of referencing a Business B connection');
  ok('CB-10b', /constraint provider_credentials_id_business_unique\s+unique \(id, business_id\)/.test(body),
    'credential (id, business_id) anchor missing');
  ok('CB-11', /constraint provider_credentials_superseded_same_business_fkey\s+foreign key \(superseded_by_credential_id, business_id\)\s+references public\.provider_credentials \(id, business_id\)/.test(body),
    'supersession FK must stay inside the same business');

  // Rotation is recorded, never overwritten in place.
  ok('CB-12', /superseded_by_credential_id\s+uuid null/.test(body) && /constraint provider_credentials_no_self_supersede\s+check \(superseded_by_credential_id is null or superseded_by_credential_id <> id\)/.test(body),
    'rotation/supersession shape missing');
  ok('CB-12b', /constraint provider_credentials_lifecycle_shape[\s\S]{0,260}status <> 'revoked' or revoked_at is not null[\s\S]{0,120}status <> 'superseded' or superseded_by_credential_id is not null/.test(body),
    'terminal credential states must carry their evidence; expiration must not be equated with revocation');
  ok('CB-12c', /constraint provider_credentials_status_check[\s\S]{0,200}'pending', 'active', 'rotating', 'superseded', 'revoked', 'expired', 'error'/.test(body),
    'credential status vocabulary wrong');

  // At most one active credential per (connection, credential_type): the
  // database, not code, is what makes rotation unambiguous.
  ok('CB-13', /create unique index if not exists provider_credentials_one_active_idx[\s\S]{0,200}where status = 'active'/.test(src),
    'partial unique index enforcing a single active credential missing');

  // No plaintext-shaped COLUMN of any kind. Judged on the COLUMN DECLARATIONS
  // only: the credential-key deny-lists below legitimately NAME these keys inside
  // CHECK constraints, and a whole-body scan would report the defense itself as
  // the defect.
  const columnLines = body
    .split('\n')
    .filter((l) => /^\s{2}(?!constraint\s)[a-z_][a-z0-9_]*\s+[a-z]/i.test(l))
    .join('\n');
  ok('CB-14', !/\b(access_token|refresh_token|public_token|link_token|authorization_code|client_secret|plaintext)\b/.test(columnLines),
    'a plaintext credential column name appears in provider_credentials');
}

// ============================================================================
// CB-15..CB-18 — lockdown: the ACL trap must be defeated explicitly
// ============================================================================
function checkLockdown(src) {
  // Statement checks run against comment-stripped source: a check for a STATEMENT
  // must never be satisfiable by prose, and — as a real false positive proved —
  // must never be TRIPPED by prose either. Comments carry the rationale and name
  // privileged operations on purpose.
  const live = stripComments(src);
  for (const t of ['business_connections', 'provider_credentials']) {
    ok(`CB-15:${t}`, new RegExp(`alter table public\\.${t} enable row level security;`).test(live),
      'RLS must be enabled EXPLICITLY, not left to the rls_auto_enable event trigger');
    // Per-role, and service_role INCLUDED. Omitting the service_role revoke is
    // exactly how the inherited arwdDxtm survived CB-001 into production: the
    // later GRANT cannot narrow it, and the live certification caught it as L/N.
    ok(`CB-16:${t}`, ['public', 'anon', 'authenticated', 'service_role']
      .every((r) => new RegExp(`revoke all on table public\\.${t} from ${r};`).test(live)),
      'must revoke PUBLIC + anon + authenticated + service_role explicitly — pg_default_acl otherwise leaves arwdDxtm inherited');
    ok(`CB-17:${t}`, new RegExp(`grant select, insert, update on table public\\.${t} to service_role;`).test(live),
      'service_role must receive exactly SELECT/INSERT/UPDATE');
  }
  // DELETE withheld on BOTH tables — lifecycle uses revoked/superseded state.
  ok('CB-18', !/grant[^;]*\bdelete\b[^;]*\bto\b/i.test(live),
    'DELETE must never be granted — credential and connection history must not be destroyable by a normal operation');
  // No browser policies yet.
  ok('CB-19', !/create policy/i.test(live),
    'no RLS policies may be created in CB-001 — anon/authenticated have no direct access at all');
  // The updated_at trigger function is locked down too.
  ok('CB-20', /revoke all on function public\.touch_connected_business_updated_at\(\) from public, anon, authenticated;/.test(live),
    'the trigger function must be revoked from PUBLIC/anon/authenticated (default ACL grants anon EXECUTE)');

  // CB-30 — ORDER IS CORRECTNESS, not style. REVOKE-then-GRANT lands on exactly
  // {select, insert, update}; GRANT-then-REVOKE lands on NOTHING and silently
  // locks every backend writer out. The artifact must not be reorderable.
  for (const t of ['business_connections', 'provider_credentials']) {
    const rev = live.indexOf(`revoke all on table public.${t} from service_role;`);
    const gr = live.indexOf(`grant select, insert, update on table public.${t} to service_role;`);
    ok(`CB-30:${t}`, rev !== -1 && gr !== -1 && rev < gr,
      `service_role must be REVOKEd before it is GRANTed on ${t} (revoke@${rev}, grant@${gr})`);
  }
  // CB-31 — the intended set is exactly SELECT/INSERT/UPDATE. A GRANT ALL would
  // reintroduce the inherited posture by hand.
  ok('CB-31', !/grant\s+all\b/i.test(live),
    'no GRANT ALL may appear — the intended privilege set is exactly SELECT/INSERT/UPDATE');
}

// ============================================================================
// CB-21..CB-23 — scope discipline: freeze neutrality and no Vault writes
// ============================================================================
function checkScopeDiscipline(live) {
  const forbidden = ['business_facts', 'business_fact_evidence', 'business_fact_conflicts', 'shadow', 'canonicalfact', 'resolvefact'];
  const hit = forbidden.filter((f) => live.toLowerCase().includes(f));
  ok('CB-21', hit.length === 0, `CB-001 must not touch the Digital Twin — found: ${hit.join(', ')}`);

  // No Vault interaction of ANY kind in CB-001.
  const vaultWrites = [
    /create_secret/i, /update_secret/i, /vault\.secrets/i, /vault\.decrypted_secrets/i,
    /insert\s+into\s+vault/i, /delete\s+from\s+vault/i, /vault\.create/i,
  ];
  const vaultHit = vaultWrites.filter((re) => re.test(live));
  ok('CB-22', vaultHit.length === 0,
    'CB-001 must perform NO Vault access — no create_secret, no update_secret, no reads of vault.secrets/decrypted_secrets');

  // The opaque-naming rule must be recorded, not merely remembered.
  ok('CB-23', /vision-provider-credential/.test(sql) && /must never encode/.test(sql),
    'the opaque Vault secret naming rule must be documented in the migration');
}

// ============================================================================
// CB-24..CB-25 — verification file completeness
// ============================================================================
function checkVerificationFile(src) {
  const required = [
    'information_schema.columns', 'pg_constraint', 'pg_indexes', 'relacl',
    'relrowsecurity', 'pg_policies', 'has_table_privilege',
    'business_facts_count', 'business_fact_evidence_count',
    'provider_credentials_connection_same_business_fkey',
  ];
  const missing = required.filter((r) => !src.includes(r));
  ok('CB-24', missing.length === 0, `verification file missing: ${missing.join(', ')}`);
  ok('CB-25', /rollback;/i.test(src), 'the cross-business rejection test must ROLLBACK and leave no rows behind');
}

// ============================================================================
// V-series — vocabulary drift between the SQL CHECKs and the shipped module
// ============================================================================
function sqlList(src, constraint) {
  // Must match the `in (...)` list itself. The constraint's own parens WRAP that
  // list — `check (provider in ('quickbooks', 'plaid'))` — so a naive
  // `\(([^)]*)\)` stops at the inner ')', silently truncating the vocabulary and
  // manufacturing drift that does not exist.
  const m = src.match(new RegExp(`constraint ${constraint}[\\s\\S]{0,320}?\\bin\\s*\\(([^)]*)\\)`));
  if (!m) return null;
  return m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
}

function checkVocabulary(src, vocab) {
  const pairs = [
    ['business_connections_provider_check', vocab.PROVIDERS],
    ['business_connections_category_check', vocab.CONNECTION_CATEGORIES],
    ['business_connections_status_check', vocab.CONNECTION_STATUSES],
    ['business_connections_sync_status_check', vocab.SYNC_STATUSES],
    ['provider_credentials_type_check', vocab.CREDENTIAL_TYPES],
    ['provider_credentials_status_check', vocab.CREDENTIAL_STATUSES],
  ];
  pairs.forEach(([constraint, list], i) => {
    const inSql = sqlList(src, constraint);
    const same = Array.isArray(inSql) && inSql.length === list.length && list.every((v) => inSql.includes(v));
    ok(`V-${i + 1}`, same, `vocabulary drift in ${constraint}: sql=${JSON.stringify(inSql)} module=${JSON.stringify(list)}`);
  });

  // Every provider must have exactly one category, and every credential type a provider.
  const missingCat = vocab.PROVIDERS.filter((p) => !vocab.PROVIDER_CATEGORY[p]);
  ok('V-7', missingCat.length === 0, `providers without a declared category: ${missingCat.join(', ')}`);
  const missingType = vocab.CREDENTIAL_TYPES.filter((t) => !vocab.CREDENTIAL_TYPE_PROVIDER[t]);
  ok('V-8', missingType.length === 0,
    `credential types without a provider binding: ${missingType.join(', ')} — this binding is what stops a plaid credential attaching to a quickbooks connection`);
}

// ============================================================================
// CB-26..CB-29 — the DATABASE-level metadata key defense (Issue 2)
// ============================================================================
function checkMetadataKeyDefense(src) {
  const names = [
    'business_connections_metadata_no_credential_keys',
    'provider_credentials_rotation_metadata_no_credential_keys',
  ];
  names.forEach((n) => ok(`CB-26:${n}`, src.includes(`constraint ${n}`),
    `metadata credential-key CHECK ${n} is missing — a jsonb object type check alone still permits {"access_token": "..."}`));

  // The guard must be EXACT-KEY membership (`?|`), on BOTH columns. A substring
  // operator here would reject token_expires_at — the very bookkeeping rotation
  // needs — and would be a worse bug than the gap it closed.
  const exact = [...src.matchAll(/check\s*\(\s*not\s*\(\s*([a-z_]*metadata_safe)\s*\?\|\s*array\[/g)].map((m) => m[1]);
  ok('CB-27', exact.length === 2 && exact.includes('metadata_safe') && exact.includes('rotation_metadata_safe'),
    `both metadata columns must use jsonb ?| exact-key membership (found: ${JSON.stringify(exact)})`);
  ok('CB-28', !/metadata_safe\s*[~!]/.test(src),
    'the metadata guard must NOT use a substring/regex operator on the metadata columns');

  const declared = [...src.matchAll(/\?\|\s*array\[([\s\S]*?)\]\s*(?:::text\[\])?\)/g)]
    .map((m) => (m[1].match(/'([a-z_]+)'/g) || []).map((s) => s.replace(/'/g, '')))
    .filter((list) => list.length);
  ok('CB-29', declared.length === 2 && declared.every((l) => l.length === PROHIBITED_METADATA_KEYS.length && PROHIBITED_METADATA_KEYS.every((k) => l.includes(k))),
    `both metadata deny-lists must equal the canonical ${PROHIBITED_METADATA_KEYS.length}-key set; found: ${JSON.stringify(declared)}`);
}

// ============================================================================
// CB-33 — CB-001.2 rotation-unit supersession integrity
// ============================================================================
// Supersession must stay inside the exact rotation unit that
// provider_credentials_one_active_idx already defines:
//   (business_connection_id, credential_type).
// Proving it needs the EXACT ordered column mapping of both new objects. A
// name-only search would pass on a constraint built over the WRONG columns —
// which is precisely the defect CB-33 exists to prevent.
function checkRotationUnit(src) {
  const live = stripComments(src);

  // CB-33a — the UNIQUE anchor the FK must reference, exact order included.
  const anchor = src.match(
    /alter table public\.provider_credentials\s+add constraint provider_credentials_id_rotation_unit_unique\s+unique\s*\(([^)]*)\)/i);
  const anchorCols = anchor ? anchor[1].split(',').map((s) => s.trim()) : null;
  ok('CB-33a', !!anchor && anchorCols.join(',') === 'id,business_connection_id,credential_type',
    `provider_credentials_id_rotation_unit_unique must be UNIQUE (id, business_connection_id, credential_type) in that exact order; found ${JSON.stringify(anchorCols)}`);

  // CB-33b — the rotation-unit FK: source and target column lists, in order.
  const fk = src.match(
    /alter table public\.provider_credentials\s+add constraint provider_credentials_superseded_same_rotation_unit_fkey\s+foreign key\s*\(([^)]*)\)\s*references public\.provider_credentials\s*\(([^)]*)\)([^;]*)/i);
  const fkSrc = fk ? fk[1].split(',').map((s) => s.trim()) : null;
  const fkRef = fk ? fk[2].split(',').map((s) => s.trim()) : null;
  const fkTail = fk ? fk[3] : '';
  ok('CB-33b', !!fk
    && fkSrc.join(',') === 'superseded_by_credential_id,business_connection_id,credential_type'
    && fkRef.join(',') === 'id,business_connection_id,credential_type',
    `the rotation-unit FK must map (superseded_by_credential_id, business_connection_id, credential_type) -> (id, business_connection_id, credential_type), in that exact order; found ${JSON.stringify(fkSrc)} -> ${JSON.stringify(fkRef)}`);

  // CB-33c — NO ON DELETE clause: supersession history is never destroyed by a
  // delete, matching the existing supersession FK.
  ok('CB-33c', !!fk && !/on delete/i.test(fkTail),
    'the rotation-unit FK must carry NO ON DELETE clause (NO ACTION)');

  // CB-33d — idempotency. ADD CONSTRAINT has no IF NOT EXISTS, so BOTH additions
  // must be guarded by a pg_constraint existence test on the exact name.
  const adds = (live.match(/add constraint/gi) || []).length;
  const guards = (live.match(/if not exists/gi) || []).length;
  const pgConstraint = (live.match(/from pg_constraint/gi) || []).length;
  ok('CB-33d', adds === 2 && guards === 2 && pgConstraint >= 2,
    `both additions must be idempotent, guarded by a pg_constraint name check (adds=${adds}, guards=${guards}, pg_constraint refs=${pgConstraint})`);

  // CB-33e — scope discipline, judged on EXECUTABLE statements only: one
  // committing transaction; no object created; no ACL/RLS/default-privilege
  // change; no data written; no Vault, provider or Digital Twin reference.
  const begins = (live.match(/\bbegin\s*;/gi) || []).length;
  const commits = (live.match(/\bcommit\s*;/gi) || []).length;
  const rollbacks = (live.match(/\brollback\s*;/gi) || []).length;
  const forbidden = [
    /\bcreate\s+(table|view|function|trigger|policy|index|schema|sequence|type)\b/i,
    /\balter\s+default\s+privileges\b/i,
    /\b(grant|revoke)\b/i,
    /row\s+level\s+security/i,
    /\binsert\s+into\b/i,
    /\bdelete\s+from\b/i,
    /\bupdate\s+public\./i,
    /\bvault\b/i,
    /\b(dblink|pg_net|http)\b/i,
    /\b(business_facts|business_fact_evidence|business_fact_conflicts)\b/i,
  ].filter((re) => re.test(live));
  ok('CB-33e', begins === 1 && commits === 1 && rollbacks === 0 && forbidden.length === 0,
    `CB-001.2 must be ONE committing transaction that creates no object, touches no ACL/RLS/default privileges, writes no rows and references no Vault, provider or Digital Twin system — found begins=${begins}, commits=${commits}, rollbacks=${rollbacks}, forbidden=${forbidden.map(String).join(' ')}`);
}

// ============================================================================
// CA-series — the certification must AGREE with the migration it certifies
// ============================================================================
function declaredColumns(src, table) {
  const start = src.indexOf(`create table if not exists public.${table} (`);
  const lines = src.slice(start).split('\n').slice(1);
  const cols = [];
  for (const line of lines) {
    if (/^\s*constraint\s/i.test(line)) break;
    if (/^\);\s*$/.test(line) || /^\s*--/.test(line)) continue;
    const m = line.match(/^\s{2}([a-z_][a-z0-9_]*)\s+[a-z]/i);
    if (m) cols.push(m[1]);
  }
  return cols.join(',');
}

function checkCertificationAgreement(sqlSrc, certSrc) {
  // CA-1/CA-2 — a certification whose expected column literal drifted from the
  // migration would report a spurious FAIL against a correct deployment.
  const grab = (re) => { const m = certSrc.match(re); return m ? m[0].slice(1, -1) : null; };
  ok('CA-1', grab(/'id,business_id,provider,connection_category[^']*'/) === declaredColumns(sqlSrc, 'business_connections'),
    'certification C1 expected column list does not match the migration');
  ok('CA-2', grab(/'id,business_connection_id,business_id,credential_type[^']*'/) === declaredColumns(sqlSrc, 'provider_credentials'),
    'certification C2 expected column list does not match the migration');

  // CA-3 — the expected CHECK count must equal the real count. Label and literal
  // are compared to each other AND to the artifact, so a renumber cannot drift.
  const fRow = certSrc.match(/select 'F', 'exact CHECK constraints \((\d+)\)',[\s\S]{0,80}?'(\d+)'/);
  const realChecks = (sqlSrc.match(/constraint\s+[a-z_][a-z0-9_]*\s+check\s*\(/g) || []).length;
  ok('CA-3', !!fRow && fRow[1] === fRow[2] && Number(fRow[1]) === realChecks,
    `certification F must expect ${realChecks} CHECK constraints (label=${fRow?.[1]}, literal=${fRow?.[2]})`);

  // CA-4/CA-5 — the deny-list and the approved reference must be what the
  // certification actually APPLIES, not what a comment claims.
  const listFrom = (cte) => {
    const m = certSrc.match(new RegExp(`${cte}\\(name\\)\\s+as\\s*\\(\\s*values([\\s\\S]*?)\\n\\)\\s*,`));
    return m ? (m[1].match(/'([a-z_]+)'/g) || []).map((s) => s.replace(/'/g, '')) : null;
  };
  const denied = listFrom('prohibited_credential_columns');
  const approved = listFrom('approved_reference_columns');
  ok('CA-4', Array.isArray(denied) && denied.length === PROHIBITED_CREDENTIAL_COLUMNS.length &&
    PROHIBITED_CREDENTIAL_COLUMNS.every((c) => denied.includes(c)),
    `certification deny-list must equal PROHIBITED_CREDENTIAL_COLUMNS; found ${JSON.stringify(denied)}`);
  ok('CA-5', Array.isArray(approved) && approved.length === 1 && approved[0] === 'vault_secret_id',
    `certification must approve exactly vault_secret_id; found ${JSON.stringify(approved)}`);

  // CA-6/CA-7 — the classification itself, the five names the correction names.
  const wrong = [
    ...PROHIBITED_CREDENTIAL_COLUMNS.filter((n) => !(denied || []).includes(n)),
    ...APPROVED_REFERENCE_COLUMNS.filter((n) => (denied || []).includes(n)),
  ];
  ok('CA-6', wrong.length === 0, `misclassified: ${wrong.join(', ')}`);
  const required = ['access_token', 'refresh_token', 'client_secret', 'decrypted_secret', 'password'];
  const notRejected = required.filter((n) => !(denied || []).includes(n));
  ok('CA-7', notRejected.length === 0 && !(denied || []).includes('vault_secret_id'),
    `the five required credential names must be rejected while vault_secret_id is allowed; failing: ${notRejected.join(', ')}`);
}

// ============================================================================
// M-series — the metadata guard, executed for real
// ============================================================================
function checkMetadataGuard(vocab) {
  const { assertSafeMetadata } = vocab;
  const throws = (v) => { try { assertSafeMetadata(v); return false; } catch { return true; } };

  const mustThrow = {
    'access_token': { access_token: 'x' },
    'camelCase accessToken': { accessToken: 'x' },
    'dashed access-token': { 'access-token': 'x' },
    'refresh_token': { refresh_token: 'x' },
    'public_token': { public_token: 'x' },
    'link_token': { link_token: 'x' },
    'authorization_code': { authorization_code: 'x' },
    'client_secret': { client_secret: 'x' },
    'secret': { secret: 'x' },
    'password': { password: 'x' },
    'nested refresh_token': { nested: { refresh_token: 'x' } },
    'array of objects': { items: [{ link_token: 'x' }] },
    'suffixed my_public_token': { my_public_token: 'x' },
  };
  const undetected = Object.entries(mustThrow).filter(([, v]) => !throws(v)).map(([k]) => k);
  ok('M-1', undetected.length === 0, `guard failed to reject: ${undetected.join(', ')}`);

  const mustPass = {
    'real metadata': { sync_window_days: 90, institution: 'Acme', rotation_reason: 'scheduled', company_name: 'Acme HVAC LLC' },
    'nested safe metadata': { provider: { region: 'us', api_version: 2 } },
    'token_count is not a token': { token_count: 3 },
    'empty object': {},
  };
  const falsePositives = Object.entries(mustPass).filter(([, v]) => throws(v)).map(([k]) => k);
  ok('M-2', falsePositives.length === 0,
    `guard produced false positives on legitimate metadata: ${falsePositives.join(', ')} — a brittle matcher would be worse than useless`);
}

// ============================================================================
// Mutation certification — the checks must actually detect the defects
// ============================================================================
function mutationCertification() {
  // A collected failure carries its detail text, so a bare Array.includes() would
  // never match — and every mutation would look undetected. Match by prefix.
  const detected = (list, prefix) => list.some((f) => f.startsWith(prefix));

  const mutations = [
    {
      id: 'MU-1',
      why: 'service_role loses its explicit revoke, so inherited arwdDxtm survives (the production defect)',
      sql: sql
        .replace('revoke all on table public.business_connections from public;', '')
        .replace('revoke all on table public.business_connections from anon;', '')
        .replace('revoke all on table public.business_connections from authenticated;', '')
        .replace('revoke all on table public.business_connections from service_role;', ''),
      verify: (s) => detected(checkLockdownRun(s), 'CB-16:business_connections'),
    },
    {
      id: 'MU-2',
      why: 'DELETE granted to service_role',
      sql: sql + '\ngrant delete on table public.business_connections to service_role;\n',
      verify: (s) => detected(checkLockdownRun(s), 'CB-18'),
    },
    {
      id: 'MU-3',
      why: 'composite same-business FK removed',
      sql: sql.replace(/foreign key \(business_connection_id, business_id\)\s+references public\.business_connections \(id, business_id\) on delete cascade,/, ''),
      verify: (s) => detected(checkCredentialRun(s), 'CB-10'),
    },
    {
      id: 'MU-4',
      why: 'provider vocabulary widened to an arbitrary string',
      sql: sql.replace("check (provider in ('quickbooks', 'plaid'))", 'check (provider is not null)'),
      verify: (s) => detected(checkVocabularyRun(s), 'V-1'),
    },
    {
      id: 'MU-5',
      why: 'Vault write smuggled into CB-001',
      sql: sql + "\nselect vault.create_secret('x', 'y');\n",
      verify: (s) => detected(checkScopeRun(s), 'CB-22'),
    },
    {
      id: 'MU-6',
      why: 'RLS no longer enabled explicitly',
      sql: sql.replace('alter table public.provider_credentials enable row level security;', ''),
      verify: (s) => detected(checkLockdownRun(s), 'CB-15:provider_credentials'),
    },
    {
      id: 'MU-7',
      why: 'metadata credential-key deny-list hollowed out',
      sql: sql.replace(/'access_token', 'refresh_token', 'public_token',\n\s*'authorization_code', 'client_secret', 'client_secret_value',/g, ''),
      verify: (s) => detected(checkMetadataDefenseRun(s), 'CB-29'),
    },
    {
      id: 'MU-8',
      why: 'metadata guard weakened from exact-key membership to a substring operator',
      sql: sql.replace('check (not (metadata_safe ?| array[', 'check (not (metadata_safe::text ~ array['),
      verify: (s) => detected(checkMetadataDefenseRun(s), 'CB-27'),
    },
    {
      id: 'MU-9',
      why: 'ACL block reordered so the GRANT precedes the REVOKE, which would lock service_role out entirely',
      sql: sql
        .replace('revoke all on table public.provider_credentials from service_role;', '')
        .replace('grant select, insert, update on table public.provider_credentials to service_role;',
          'grant select, insert, update on table public.provider_credentials to service_role;\n'
          + 'revoke all on table public.provider_credentials from service_role;'),
      verify: (s) => detected(checkLockdownRun(s), 'CB-30:provider_credentials'),
    },
  ];
  const undetected = [];
  for (const m of mutations) {
    if (!m.verify(stripComments(m.sql))) undetected.push(`${m.id} (${m.why})`);
  }
  ok('MU', undetected.length === 0, `mutations NOT detected: ${undetected.join('; ')}`);
}

// ============================================================================
// P-series — the artifact must PERMANENTLY prove the full 8-privilege matrix
// ============================================================================
const norm = (s) => s.replace(/\s+/g, ' ').trim();

// Every `bool_and(<terms>) filter (where role_name = '<role>')` in the artifact.
function parsedPredicates(certSrc, role) {
  const out = [];
  const re = new RegExp(`bool_and\\(([^)]*)\\)\\s*filter \\(where role_name = '${role}'\\)`, 'g');
  let m;
  while ((m = re.exec(certSrc)) !== null) out.push(norm(m[1]));
  return out;
}

// The EIGHT-term predicate for a role — the full-matrix one. It is PARSED from
// the artifact, so a dropped or added term is a detectable change to the proof.
function matrixPredicate(certSrc, role) {
  const cols = Object.values(PRIV_COLUMN);
  return parsedPredicates(certSrc, role)
    .map((expr) => expr.split(' and ').map((t) => t.trim()))
    .find((terms) => terms.length === 8
      && cols.every((c) => terms.some((t) => t === c || t === `not ${c}`))) || null;
}

// Evaluate the artifact's OWN parsed predicate against a privilege state, so the
// behavioural tests below exercise the certification's semantics — not a
// paraphrase of them. State shape: { <table>: { <role>: [privileges] } }.
function evaluateParsedMatrix(certSrc, state) {
  const out = {};
  for (const role of Object.keys(MATRIX_ROW_FOR)) {
    const terms = matrixPredicate(certSrc, role);
    if (!terms) { out[MATRIX_ROW_FOR[role]] = 'FAIL'; continue; }
    const bothTables = CB001_TABLES.every((t) => {
      const privs = (state[t] && state[t][role]) || [];
      return terms.every((term) => {
        const negated = term.startsWith('not ');
        const priv = COLUMN_PRIV[negated ? term.slice(4) : term];
        if (!priv) return false;
        return negated ? !privs.includes(priv) : privs.includes(priv);
      });
    });
    out[MATRIX_ROW_FOR[role]] = bothTables ? 'PASS' : 'FAIL';
  }
  return out;
}

const stateOf = (grants) => {
  const state = {};
  for (const t of CB001_TABLES) {
    state[t] = {};
    for (const [role, privs] of Object.entries(grants)) state[t][role] = [...privs];
  }
  return state;
};

function checkPrivilegeMatrixCertification(certSrc) {
  const live = stripComments(certSrc);

  // P-1 — every one of the eight must be PROBED with has_table_privilege. A
  // privilege that is never probed is a privilege that is never proven: that is
  // precisely the gap that let TRUNCATE/REFERENCES/TRIGGER/MAINTAIN ride along
  // unseen on `arwdDxtm`. DELETE-only was the original defect.
  const unprobed = EFFECTIVE_PRIVILEGES.filter((p) =>
    !new RegExp(`has_table_privilege\\(r\\.role_name, 'public\\.' \\|\\| t\\.table_name, '${p}'\\)`).test(certSrc));
  ok('P-1', unprobed.length === 0,
    `the certification does not probe: ${unprobed.join(', ')}`);

  // P-2 — each role must carry an 8-term predicate whose terms are EXACTLY
  // right: the three positives for service_role, all eight negated for
  // anon/authenticated. Term-set equality, so an added term fails too.
  for (const role of Object.keys(MATRIX_ROW_FOR)) {
    const expected = EFFECTIVE_PRIVILEGES.map((p) =>
      (role === 'service_role' && GRANTED_TO_SERVICE_ROLE.includes(p))
        ? PRIV_COLUMN[p] : `not ${PRIV_COLUMN[p]}`);
    const terms = matrixPredicate(certSrc, role);
    ok(`P-2:${role}`, !!terms && terms.length === expected.length && expected.every((t) => terms.includes(t)),
      `the ${role} matrix predicate must be exactly {${expected.join(', ')}}; found ${JSON.stringify(terms)}`);
  }

  // P-3 — MAINTAIN must be probed AND explicitly excluded for every role. This
  // is the PostgreSQL 17 privilege the live `arwdDxtm` proved exists here;
  // dropping it would silently shrink the invariant back to seven.
  ok('P-3', EFFECTIVE_PRIVILEGES.includes('MAINTAIN')
    && new RegExp(`has_table_privilege\\(r\\.role_name, 'public\\.' \\|\\| t\\.table_name, 'MAINTAIN'\\)`).test(certSrc)
    && Object.keys(MATRIX_ROW_FOR).every((r) => (matrixPredicate(certSrc, r) || []).includes('not maint')),
    'MAINTAIN must be probed and explicitly excluded for all three roles — this server is PostgreSQL 17+');

  // P-4 — the three rows exist, are named, and derive their verdict from the
  // matrix predicate rather than from a re-worded copy of it.
  const rowPredicate = { L2: 'service_role_exact_8', L3: 'anon_clean_8', L4: 'authed_clean_8' };
  for (const [id, predicate] of Object.entries(rowPredicate)) {
    ok(`P-4:${id}`, new RegExp(`select '${id}',[\\s\\S]{0,700}?when f\\.${predicate} then 'PASS' else 'FAIL'`).test(certSrc),
      `row ${id} must exist and derive its verdict from f.${predicate}`);
  }

  // P-4b — the DOCUMENTED expectation must be the intended state, generated from
  // the same constants the evaluator uses, so the two cannot disagree.
  const ordered = (privs) => EFFECTIVE_PRIVILEGES.filter((p) => privs.includes(p)).join(', ');
  const grantedLiteral = CB001_TABLES.map((t) => `${t} → ${ordered(GRANTED_TO_SERVICE_ROLE)}`).join(' | ');
  const noneLiteral = CB001_TABLES.map((t) => `${t} → none`).join(' | ');
  ok('P-4b', certSrc.includes(`'${grantedLiteral}`) && certSrc.includes(`'${noneLiteral}'`),
    `documented L2/L3/L4 expectations must read "${grantedLiteral}" and "${noneLiteral}"`);

  // P-5 — the documented row count must equal the real row count, and every
  // pre-existing row must still be present. Adding coverage must never silently
  // drop a row, and the header must never advertise a stale count.
  const declared = Number((certSrc.match(/returns ONE report: (\d+) rows/) || [])[1]);
  const firstRow = (certSrc.match(/select '([A-Z]\d?)' id,/) || [])[1];
  const rest = [...certSrc.matchAll(/union all select '([A-Z]\d?)'/g)].map((m) => m[1]);
  const all = firstRow ? [firstRow, ...rest] : rest;
  ok('P-5', declared === CERT_ROW_IDS.length && all.length === CERT_ROW_IDS.length
    && new Set(all).size === all.length && CERT_ROW_IDS.every((id) => all.includes(id)),
    `row count/documentation drift: declared=${declared}, actual=${all.length}, expected=${CERT_ROW_IDS.length}, present=${JSON.stringify(all)}`);

  // P-6 — the pre-existing rows must survive SEMANTICALLY unchanged. L and N are
  // compared verbatim: "preserved" has to mean the same predicate, not a
  // similar-looking one. J and K likewise.
  const preserved = {
    L: "case when f.service_role_exact then 'PASS' else 'FAIL' end",
    N: "case when f.service_role_delete is not true then 'PASS' else 'FAIL' end",
    J: "case when f.anon_clean then 'PASS' else 'FAIL' end",
    K: "case when f.authed_clean then 'PASS' else 'FAIL' end",
  };
  const weakened = Object.entries(preserved).filter(([, expr]) => !norm(certSrc).includes(norm(expr)));
  ok('P-6', weakened.length === 0,
    `pre-existing certification semantics altered or removed: ${weakened.map(([id]) => id).join(', ')}`);

  // P-7 — the certification is READ-ONLY. It reports posture; it must never be
  // able to change it.
  const writes = live.match(/^\s*(insert|update|delete|alter|drop|create|grant|revoke|truncate)\b/gim) || [];
  ok('P-7', writes.length === 0,
    `the certification must contain no write/DDL statement: ${writes.join(', ')}`);
}

// ============================================================================
// PM-series — the matrix checks must actually FAIL on every way it can break
// ============================================================================
function mutationPrivilegeMatrix(certSrc) {
  const undetected = [];
  const base = { service_role: [...GRANTED_TO_SERVICE_ROLE], anon: [], authenticated: [] };
  const expectFail = (label, state, rows) => {
    const got = evaluateParsedMatrix(certSrc, state);
    const missed = rows.filter((row) => got[row] !== 'FAIL');
    if (missed.length) undetected.push(`${label} (not caught: ${missed.join(', ')})`);
  };

  // The intended state MUST pass — otherwise every mutation below is meaningless.
  const intended = evaluateParsedMatrix(certSrc, stateOf(base));
  const falseAlarm = Object.entries(intended).filter(([, v]) => v !== 'PASS').map(([k]) => k);
  if (falseAlarm.length) undetected.push(`intended state must PASS (failing: ${falseAlarm.join(', ')})`);

  // 1–5: service_role GAINS one of the five forbidden privileges.
  for (const p of FORBIDDEN_EFFECTIVE) {
    expectFail(`service_role gains ${p}`,
      stateOf({ ...base, service_role: [...GRANTED_TO_SERVICE_ROLE, p] }), ['L2']);
  }
  // 6–8: service_role LOSES one of the three intended privileges.
  for (const p of GRANTED_TO_SERVICE_ROLE) {
    expectFail(`service_role loses ${p}`,
      stateOf({ ...base, service_role: GRANTED_TO_SERVICE_ROLE.filter((x) => x !== p) }), ['L2']);
  }
  // The ORIGINAL production defect, verbatim: the complete `arwdDxtm` set.
  expectFail('service_role = arwdDxtm (original production defect)',
    stateOf({ ...base, service_role: [...EFFECTIVE_PRIVILEGES] }), ['L2']);

  // The invariant holds per TABLE — a clean table must not mask a dirty one.
  const split = stateOf(base);
  split.provider_credentials.service_role = [...GRANTED_TO_SERVICE_ROLE, 'TRUNCATE'];
  expectFail('extras on provider_credentials only', split, ['L2']);

  // 9–10: anon / authenticated GAIN any one of the eight.
  for (const role of ['anon', 'authenticated']) {
    for (const p of EFFECTIVE_PRIVILEGES) {
      expectFail(`${role} gains ${p}`, stateOf({ ...base, [role]: [p] }), [MATRIX_ROW_FOR[role]]);
    }
  }

  // The artifact must fail too if EITHER half of the proof is dropped: the
  // has_table_privilege probe, or the predicate term that consumes it.
  const caughtBy = (mutated, marker) =>
    collect(() => checkPrivilegeMatrixCertification(mutated)).join(' ').includes(marker);

  const probeDrops = EFFECTIVE_PRIVILEGES.filter((p) =>
    !caughtBy(certSrc.replace(new RegExp(`'${p}'`, 'g'), "''"), 'the certification does not probe'));
  if (probeDrops.length) undetected.push(`dropping a has_table_privilege probe went unnoticed: ${probeDrops.join(', ')}`);

  const termDrops = FORBIDDEN_EFFECTIVE.filter((p) =>
    !caughtBy(certSrc.replace(new RegExp(`and not ${PRIV_COLUMN[p]}\\b`, 'g'), ''), 'matrix predicate must be exactly'));
  if (termDrops.length) undetected.push(`dropping a predicate term went unnoticed: ${termDrops.join(', ')}`);

  // The documented row count must not be a stale claim.
  if (!caughtBy(certSrc.replace(/returns ONE report: \d+ rows/, 'returns ONE report: 99 rows'),
    'row count/documentation drift')) {
    undetected.push('a stale documented row count went unnoticed');
  }

  ok('PM', undetected.length === 0, `privilege-matrix mutations NOT detected: ${undetected.join('; ')}`);
}

// ============================================================================
// MU-10 — the rotation-unit guard must go RED on every way it can break
// ============================================================================
// A check that cannot fail is not a check. Each mutation is applied to the
// canonical CB-001.2 source IN MEMORY ONLY — the artifact on disk is never
// written, so restoring the canonical artifact is guaranteed by construction.
function mutationRotationUnit(cb12Src) {
  const escaped = [];
  const caught = (mutated) =>
    collect(() => checkRotationUnit(mutated)).some((f) => f.startsWith('CB-33'));

  // The FK removed outright.
  if (!caught(cb12Src.replace(
    /add constraint provider_credentials_superseded_same_rotation_unit_fkey[\s\S]*?credential_type\);/,
    ''))) escaped.push('rotation-unit FK removed');

  // The FK present but over the WRONG target mapping — what a name-only search
  // would sail straight past.
  if (!caught(cb12Src.replace(
    'references public.provider_credentials (id, business_connection_id, credential_type)',
    'references public.provider_credentials (id, credential_type, business_connection_id)'))) {
    escaped.push('rotation-unit FK target columns reordered');
  }

  // The FK narrowed, silently dropping same-type enforcement.
  if (!caught(cb12Src.replace(
    'foreign key (superseded_by_credential_id, business_connection_id, credential_type)',
    'foreign key (superseded_by_credential_id, credential_type)'))) {
    escaped.push('rotation-unit FK narrowed to two columns');
  }

  // An ON DELETE clause smuggled in, which would put history in reach of a delete.
  if (!caught(cb12Src.replace(
    'references public.provider_credentials (id, business_connection_id, credential_type)',
    'references public.provider_credentials (id, business_connection_id, credential_type) on delete cascade'))) {
    escaped.push('ON DELETE cascade added to the rotation-unit FK');
  }

  // The anchor hollowed out.
  if (!caught(cb12Src.replace(
    'unique (id, business_connection_id, credential_type)',
    'unique (id)'))) {
    escaped.push('rotation-unit anchor hollowed out to (id)');
  }

  ok('MU-10', escaped.length === 0, `rotation-unit mutations NOT detected: ${escaped.join('; ')}`);
}

// Runners that collect failures WITHOUT touching the global counters, so the
// mutation pass can run the same checks against a mutated artifact.
const collect = (fn) => { const out = []; const saved = failures; failures = out; fn(); failures = saved; return out; };
let checkLockdownRun, checkCredentialRun, checkVocabularyRun, checkScopeRun, checkMetadataDefenseRun;

// ============================================================================
// Execute
// ============================================================================
async function runChecks() {
  failures = [];
  checks = 0;
  const vocab = loadVocabulary(read(VOCAB_PATH));

  // Each runner must certify the source it is HANDED — the mutation pass relies on
  // being able to run these same checks against a deliberately broken artifact.
  checkLockdownRun = (s) => collect(() => checkLockdown(s));
  checkCredentialRun = (s) => collect(() => checkCredentialTable(s));
  checkVocabularyRun = (s) => collect(() => checkVocabulary(s, vocab));
  checkScopeRun = (s) => collect(() => checkScopeDiscipline(s));
  checkMetadataDefenseRun = (s) => collect(() => checkMetadataKeyDefense(s));

  checkConnectionTable(sql);
  checkCredentialTable(sql);
  checkLockdown(sql);
  checkScopeDiscipline(liveSql);
  checkVerificationFile(verifySql);
  checkVocabulary(sql, vocab);
  checkMetadataGuard(vocab);
  checkMetadataKeyDefense(sql);
  const certSrc = fs.existsSync(CERT_PATH) ? read(CERT_PATH) : '';
  checkCertificationAgreement(sql, certSrc);
  checkPrivilegeMatrixCertification(certSrc);
  mutationCertification();
  mutationPrivilegeMatrix(certSrc);

  // CB-001.2 — additive rotation-unit integrity (CB-33 + MU-10).
  const cb12Src = fs.existsSync(CB12_PATH) ? read(CB12_PATH) : '';
  checkRotationUnit(cb12Src);
  mutationRotationUnit(cb12Src);

  // CB-002 — the Vault credential wrapper surface (CB-34 … CB-45 + MU2-series).
  // The checks live in their own module so this file stays editable; they are
  // additive and weaken nothing above.
  const cb2Sources = {
    mig: fs.existsSync(CB2_PATH) ? read(CB2_PATH) : '',
    cert: fs.existsSync(CB2CERT_PATH) ? read(CB2CERT_PATH) : '',
    adv: fs.existsSync(CB2ADV_PATH) ? read(CB2ADV_PATH) : '',
    res: fs.existsSync(CB2RES_PATH) ? read(CB2RES_PATH) : '',
    pre: fs.existsSync(CB2PRE_PATH) ? read(CB2PRE_PATH) : '',
  };
  const cb2 = createCb2Checks({ ok, stripComments, collect });
  cb2.run(vocab, cb2Sources);
  cb2.mutation(vocab, cb2Sources);

  // CB-003 — the provider authorization-attempt boundary (CB-47 … CB-66 +
  // MU3-series). Additive: it weakens nothing above and lives in its own module.
  const cb3Sources = {
    mig: fs.existsSync(CB3_PATH) ? read(CB3_PATH) : '',
    cert: fs.existsSync(CB3CERT_PATH) ? read(CB3CERT_PATH) : '',
    adv: fs.existsSync(CB3ADV_PATH) ? read(CB3ADV_PATH) : '',
    res: fs.existsSync(CB3RES_PATH) ? read(CB3RES_PATH) : '',
  };
  const cb3 = createCb3Checks({ ok, stripComments, collect });
  cb3.run(vocab, cb3Sources);
  cb3.mutation(vocab, cb3Sources);

  // CB-002.1 — credential rotation lifecycle hardening (CB-71 … CB-86 + MU21-series).
  // Additive: it weakens nothing above and lives in its own module. It receives the
  // CB-002 module's SOURCE as well, because the fix must also prove the superseded
  // predecessor check no longer pins the defective membership test.
  const cb21Sources = {
    mig: fs.existsSync(CB21_PATH) ? read(CB21_PATH) : '',
    cert: fs.existsSync(CB21CERT_PATH) ? read(CB21CERT_PATH) : '',
    adv: fs.existsSync(CB21ADV_PATH) ? read(CB21ADV_PATH) : '',
    res: fs.existsSync(CB21RES_PATH) ? read(CB21RES_PATH) : '',
    cb2Module: fs.existsSync(CB2MOD_PATH) ? read(CB2MOD_PATH) : '',
  };
  const cb21 = createCb21Checks({ ok, stripComments, collect });
  cb21.run(vocab, cb21Sources);
  cb21.mutation(vocab, cb21Sources);

  // CB-004 — the provider operation authorization kernel (CB-88 … CB-105 +
  // MU4-series). Additive: it weakens nothing above and lives in its own module.
  // It receives the KERNEL and the VOCABULARY SOURCE as well, because the
  // decision matrix is certified behaviourally — the real module is transpiled
  // with esbuild and executed against fixtures with the canonical Security Kernel
  // injected as spies — and because the SQL vocabularies must not drift from the
  // shipped module. CB-004.2 rides along as `mig42` so the CB-004 checks certify
  // the EFFECTIVE vocabulary (CB-004 plus its one additive successor) rather than
  // either artifact alone.
  const cb4Sources = {
    mig: fs.existsSync(CB4_PATH) ? read(CB4_PATH) : '',
    cert: fs.existsSync(CB4CERT_PATH) ? read(CB4CERT_PATH) : '',
    adv: fs.existsSync(CB4ADV_PATH) ? read(CB4ADV_PATH) : '',
    res: fs.existsSync(CB4RES_PATH) ? read(CB4RES_PATH) : '',
    kernel: fs.existsSync(CB4KERNEL_PATH) ? read(CB4KERNEL_PATH) : '',
    vocab: read(VOCAB_PATH),
    mig42: fs.existsSync(CB42_PATH) ? read(CB42_PATH) : '',
  };
  const cb4 = createCb4Checks({ ok, stripComments, collect });
  await cb4.run(vocab, cb4Sources);
  await cb4.mutation(vocab, cb4Sources);

  // CB-004.1 — the live-sync authorization boundary (CB41-1 … CB41-30, S1 … S10 +
  // MU41-series). Additive: it weakens nothing above and lives in its own module.
  // The entry point and the boundary module are TRANSPILED WITH THE REAL esbuild
  // AND EXECUTED against a stub environment, so the shipped boundary is the thing
  // under test and the side effects of a refusal are countable.
  const cb41Sources = {
    entry: fs.existsSync(CB41_ENTRY_PATH) ? read(CB41_ENTRY_PATH) : '',
    module: fs.existsSync(CB41_MODULE_PATH) ? read(CB41_MODULE_PATH) : '',
    projectUrl: fs.existsSync(CB41_PROJECTURL_PATH) ? read(CB41_PROJECTURL_PATH) : '',
    events: fs.existsSync(CB41_EVENTS_PATH) ? read(CB41_EVENTS_PATH) : '',
  };
  const cb41 = createCb41Checks({ ok, stripComments, collect });
  await cb41.run(vocab, cb41Sources);
  await cb41.mutation(vocab, cb41Sources);

  // CB-005B — the provider execution foundation (CB5B-series + T-series + MU5B).
  // Additive: it weakens nothing above and lives in its own module. The shipped
  // modules are transpiled and EXECUTED against a model of the exact SQL contracts,
  // so concurrency, lease expiry, fencing, deduplication and checkpoint atomicity
  // are observable behaviour rather than promises.
  const cb5bSources = {
    mig: fs.existsSync(CB5B_MIG_PATH) ? read(CB5B_MIG_PATH) : '',
    verify: fs.existsSync(CB5B_VERIFY_PATH) ? read(CB5B_VERIFY_PATH) : '',
    // The CB-005B suite EXECUTES the certification kernel against the model, so it
    // receives the kernel and the vocabulary it is compiled against.
    kernel: fs.existsSync(CB4KERNEL_PATH) ? read(CB4KERNEL_PATH) : '',
    vocab: read(VOCAB_PATH),
    policy: fs.existsSync(CB5B_POLICY_PATH) ? read(CB5B_POLICY_PATH) : '',
    state: fs.existsSync(CB5B_STATE_PATH) ? read(CB5B_STATE_PATH) : '',
    identity: fs.existsSync(CB5B_IDENTITY_PATH) ? read(CB5B_IDENTITY_PATH) : '',
    checkpoint: fs.existsSync(CB5B_CHECKPOINT_PATH) ? read(CB5B_CHECKPOINT_PATH) : '',
    system: fs.existsSync(CB5B_SYSTEM_PATH) ? read(CB5B_SYSTEM_PATH) : '',
    repository: fs.existsSync(CB5B_REPO_PATH) ? read(CB5B_REPO_PATH) : '',
    executor: fs.existsSync(CB5B_EXEC_PATH) ? read(CB5B_EXEC_PATH) : '',
    entry: fs.existsSync(CB5B_ENTRY_PATH) ? read(CB5B_ENTRY_PATH) : '',
    // The install preflight is an ARTIFACT OF THIS PHASE, so the suite holds it to its
    // contract too: it must exist, and it must change nothing.
    preflight: fs.existsSync(CB5B_PREFLIGHT_PATH) ? read(CB5B_PREFLIGHT_PATH) : '',
  };
  const cb5b = createCb5bChecks({ ok, stripComments, collect });
  await cb5b.run(vocab, cb5bSources);
  await cb5b.mutation(vocab, cb5bSources);

  return { checks, failures };
}

module.exports = { runChecks };

if (require.main === module) {
  // runChecks is async now: the CB-004 behavioural pass transpiles and EXECUTES
  // the real authorization kernel, which is asynchronous by nature.
  runChecks().then(({ checks, failures }) => {
    console.log('CONNECTED BUSINESS — CB-001 FOUNDATION CONTRACT');
    console.log('='.repeat(64));
    console.log(`checks run: ${checks}`);
    if (failures.length === 0) {
      console.log('RESULT: PASS — artifact is deployable and freeze-neutral.');
    } else {
      console.log(`RESULT: FAIL — ${failures.length} failing check(s):`);
      failures.forEach((f) => console.log('  · ' + f));
    }
    console.log('='.repeat(64));
    console.log('NOTE: this certifies the ARTIFACT. Deployed ACL/RLS certification requires');
    console.log('      the phase_*_certification.sql artifact to be run against the live');
    console.log('      database after each migration is applied.');
    process.exit(failures.length === 0 ? 0 : 1);
  });
}