/**
 * CONNECTED BUSINESS — CB-004 PROVIDER OPERATION AUTHORIZATION KERNEL CHECKS
 *
 * Extracted from scripts/connectedBusinessFoundation.test.cjs so the harness stays
 * editable; the harness requires this module and calls run() + mutation(). Every
 * check is additive — nothing here weakens a CB-001, CB-001.1, CB-001.2, CB-002,
 * CB-002.1 or CB-003 check.
 *
 * WHAT THIS IS FOR
 *   CB-004 rests on one invariant: SERVICE ROLE IS CAPABILITY, NOT AUTHORIZATION.
 *   That invariant is easy to lose in a later edit and hard to notice, so every
 *   way it can break is a mutation below: trusting request.business_id, skipping
 *   authorizeBusinessAccess, accepting an arbitrary operation string, accepting a
 *   caller-supplied actor, resolving a credential before authorization, consuming
 *   an OAuth attempt before reauthorization, granting a browser role EXECUTE,
 *   allowing audit UPDATE/DELETE, letting credential-shaped metadata through,
 *   skipping the connection-state check, telling a probe that a foreign resource
 *   exists, or permitting a system path to name a business.
 *
 * HOW IT PROVES THINGS — TWO DIFFERENT KINDS OF EVIDENCE
 *   · The SQL artifacts are inspected structurally: the ACL statements, the CHECK
 *     vocabulary, the recursive metadata guard, the function's own identity
 *     arguments. Where a fact can come from the deployed definition it is taken
 *     from there rather than from a comment.
 *   · The KERNEL IS TRANSPILED WITH THE REAL esbuild AND EXECUTED against
 *     fixtures with the canonical Security Kernel functions injected as spies.
 *     That is what makes the decision matrix behavioural rather than textual: the
 *     shipped module is the thing under test, and the spies prove it CALLS
 *     authenticateActor / authorizeBusinessAccess / validateBusinessScope instead
 *     of re-implementing them.
 *
 * WHAT IT CANNOT PROVE
 *   That the migration is deployed, or that the live ACLs match the artifact.
 *   Those are the certification SQL's job. This file certifies the ARTIFACT and
 *   the MODULE.
 *
 * The module is pure: it reads strings, executes the kernel in-process, calls the
 * supplied `ok`, and uses the supplied `collect` for mutation isolation. It writes
 * nothing.
 */
module.exports = function createCb4Checks({ ok, stripComments, collect }) {
  const TABLE = 'public.provider_operation_audit';
  const FN = 'public.provider_operation_audit_record';
  const FN_SIG = 'text, uuid, uuid, text, text, uuid, uuid, text, text, text, text, text, jsonb';
  const FN_TYPES = ['text', 'uuid', 'uuid', 'text', 'text', 'uuid', 'uuid', 'text', 'text', 'text', 'text', 'text', 'jsonb'];
  const INDEXES = ['provider_operation_audit_business_idx', 'provider_operation_audit_actor_idx', 'provider_operation_audit_connection_idx'];
  const COLUMNS = ['id', 'created_at', 'actor_kind', 'actor_profile_id', 'business_id', 'provider',
    'operation', 'business_connection_id', 'authorization_attempt_id', 'resource_type',
    'resource_id', 'decision', 'reason_code', 'request_correlation_id', 'safe_metadata'];
  const PLAINTEXT_COLUMNS = ['access_token', 'refresh_token', 'public_token', 'link_token',
    'authorization_code', 'client_secret', 'credential_value', 'plaintext_secret',
    'decrypted_secret', 'token_value', 'secret_value', 'password'];
  const SYNTHETIC_MARKER = 'vision_test_cb004_';
  const RESERVED_NAMESPACE = '00000000-0000-0000-0000-0000000c04';
  const CORRELATION_PREFIX = 'vision_test_corr_cb004_';
  const CB4_GRID = ['CB4-U0', 'CB4-D1', 'CB4-D2', 'CB4-D3', 'CB4-D4', 'CB4-D5', 'CB4-D6',
    'CB4-D7', 'CB4-D8', 'CB4-D9', 'CB4-D10', 'CB4-D11', 'CB4-D12', 'CB4-D13', 'CB4-D14',
    'CB4-R1', 'CB4-R2', 'CB4-R3', 'CB4-R4', 'CB4-P1', 'CB4-F1', 'CB4-C1'];
  const CB4_CERT_IDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N',
    'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];

  /** The migration's deploy-time statements: everything OUTSIDE the function body. */
  const deployTimeSql = (src) => src.replace(/\$\$[\s\S]*?\$\$/g, '$$BODY$$');

  /**
   * TypeScript/JavaScript comment stripping. The `stripComments` passed in from
   * the harness understands SQL `--` only, and a kernel check that a header
   * comment could satisfy — or trip — is not a check. The kernel's comments carry
   * the design rationale and therefore NAME the very things the code must not do.
   */
  const stripTsComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s\/\/[^\n]*$/gm, '');

  /** The function definition, from CREATE through its closing $$; */
  function fnBlock(src) {
    const start = src.indexOf(`create or replace function ${FN}(`);
    if (start < 0) return null;
    const end = src.indexOf('$$;', start);
    return end < 0 ? null : src.slice(start, end + 3);
  }

  /** Ordered argument TYPES taken from the migration's own header (CB-68 lesson). */
  function fnArgTypes(src) {
    const start = src.indexOf(`create or replace function ${FN}(`);
    if (start < 0) return null;
    const open = src.indexOf('(', start);
    const close = src.indexOf('\n)', open);
    if (open < 0 || close < 0) return null;
    return src.slice(open + 1, close).split(',').map((raw) => {
      let line = raw.trim();
      const at = line.indexOf(' default ');
      if (at > -1) line = line.slice(0, at).trim();
      const parts = line.split(/\s+/);
      return parts[parts.length - 1];
    }).join(', ');
  }

  /** The `in (...)` token list of one named CHECK constraint. */
  function sqlList(src, constraint) {
    const m = src.match(new RegExp(`constraint ${constraint}[\\s\\S]{0,400}?\\bin\\s*\\(([^)]*)\\)`));
    if (!m) return null;
    return m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
  }

  /**
   * The system-execution narrowing list inside a writer body — the SECOND copy of
   * the system vocabulary, and the copy that decides whether a system ALLOW can be
   * recorded at all. Parsed, never matched as a literal: a list change must be
   * visible to the check, not merely different from a string.
   */
  function parseNarrow(body) {
    const m = (body || '').match(/p_actor_kind = 'system'[\s\S]{0,220}?p_operation not in \(([^)]*)\)/);
    return m ? (m[1].match(/'([a-z_.]+)'/g) || []).map((s) => s.replace(/'/g, '')) : null;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // THE BEHAVIOURAL SANDBOX — the REAL kernel, transpiled and executed
  // ══════════════════════════════════════════════════════════════════════════
  function loadKernel(vocab, kernelSrc) {
    if (!kernelSrc) throw new Error('kernel source missing');
    const { transformSync } = require('esbuild');
    const deps = { authenticate: 0, business: [], scope: [], sources: {} };
    const actor = {
      authenticateActor: async (base44) => {
        deps.authenticate += 1;
        if (!base44) { const e = new Error('Unauthorized'); e.status = 401; throw e; }
        return base44.actor;
      },
      authorizeBusinessAccess: async (sb, a, businessId) => {
        deps.business.push(businessId);
        if (!(a && Array.isArray(a.businesses) && a.businesses.indexOf(businessId) > -1)) {
          const e = new Error('Forbidden'); e.status = 403; throw e;
        }
        return true;
      },
      validateBusinessScope: async (sb, businessId, profileId) => {
        deps.scope.push(businessId);
        return { authorization_reason: deps.sources[profileId] || '' };
      },
    };
    const shim = (spec) => {
      if (spec === './vocabulary.ts') return vocab;
      if (spec === '../authz/actor.ts') return { authenticateActor: actor.authenticateActor, authorizeBusinessAccess: actor.authorizeBusinessAccess };
      if (spec === '../businessScope/writeGuard.ts') return { validateBusinessScope: actor.validateBusinessScope };
      throw new Error(`unexpected import in the kernel: ${spec}`);
    };
    const out = transformSync(kernelSrc, { loader: 'ts', format: 'cjs', target: 'node18' });
    const mod = { exports: {} };
    // eslint-disable-next-line no-new-func
    new Function('exports', 'module', 'require', out.code)(mod.exports, mod, shim);
    return { api: mod.exports, deps };
  }

  /** A service-role client stub: row lookup by id, and an RPC sink. */
  function makeSb(rows, sink) {
    return {
      from(table) {
        const q = {
          _row: null,
          select() { return q; },
          eq(col, val) { q._row = (rows[table] || []).find((r) => r[col] === val) || null; return q; },
          maybeSingle() { return Promise.resolve({ data: q._row }); },
        };
        return q;
      },
      rpc(name, args) { sink.push({ name, args }); return Promise.resolve({ data: `audit-${sink.length}`, error: null }); },
    };
  }

  const BIZ_A = '00000000-0000-0000-0000-0000000c04a1';
  const BIZ_B = '00000000-0000-0000-0000-0000000c04b1';
  const CONN_A = '00000000-0000-0000-0000-0000000c0401';
  const CONN_B = '00000000-0000-0000-0000-0000000c0402';
  const CRED_A = '00000000-0000-0000-0000-0000000c04c1';
  // CB-005B credential-state fixtures: the credential precondition for a job
  // execution is proven against a superseded unit, an expired unit and a unit
  // belonging to another connection — each of which must fail closed.
  const CRED_SUPERSEDED = '00000000-0000-0000-0000-0000000c04c3';
  const CRED_EXPIRED = '00000000-0000-0000-0000-0000000c04c4';
  const CRED_FOREIGN_CONNECTION = '00000000-0000-0000-0000-0000000c04c5';
  const ATTEMPT_A = '00000000-0000-0000-0000-0000000c04e1';
  const OWNER = '00000000-0000-0000-0000-0000000c04f1';
  const TEAM = '00000000-0000-0000-0000-0000000c04f2';
  const OTHER = '00000000-0000-0000-0000-0000000c04f3';
  const SECRET_MARKER = `${SYNTHETIC_MARKER}secret_must_not_appear`;
  // CB-004.2 fixtures. The job id is a SYNTHETIC identifier for the reserved CB-004
  // namespace: the kernel never loads a job row (the job table does not exist in
  // this phase), it only proves the request named the resource the operation
  // requires. The job's own binding is the execution verifier's responsibility.
  const JOB_A = '00000000-0000-0000-0000-0000000c0451';
  const CONN_DEAD = '00000000-0000-0000-0000-0000000c0403';
  const VERIFIED_CTX = { kind: 'sync_worker', authenticity: 'verified', evidence_id: JOB_A };
  const CLAIMED_CTX = { kind: 'sync_worker', authenticity: 'claimed', evidence_id: JOB_A };

  const FIXTURE_ROWS = {
    business_connections: [
      { id: CONN_A, business_id: BIZ_A, provider: 'quickbooks', status: 'active' },
      { id: CONN_B, business_id: BIZ_B, provider: 'quickbooks', status: 'active' },
      { id: '00000000-0000-0000-0000-0000000c0403', business_id: BIZ_A, provider: 'plaid', status: 'disconnected' },
    ],
    provider_credentials: [
      { id: CRED_A, business_id: BIZ_A, business_connection_id: CONN_A, credential_type: 'quickbooks_refresh', status: 'active', superseded_by_credential_id: null, expires_at: null },
      { id: '00000000-0000-0000-0000-0000000c04c2', business_id: BIZ_A, business_connection_id: CONN_A, credential_type: 'quickbooks_access', status: 'revoked', superseded_by_credential_id: null, expires_at: null },
      { id: CRED_SUPERSEDED, business_id: BIZ_A, business_connection_id: CONN_A, credential_type: 'quickbooks_refresh', status: 'superseded', superseded_by_credential_id: CRED_A, expires_at: null },
      { id: CRED_EXPIRED, business_id: BIZ_A, business_connection_id: CONN_A, credential_type: 'quickbooks_refresh', status: 'active', superseded_by_credential_id: null, expires_at: '2000-01-01T00:00:00.000Z' },
      { id: CRED_FOREIGN_CONNECTION, business_id: BIZ_A, business_connection_id: CONN_B, credential_type: 'quickbooks_refresh', status: 'active', superseded_by_credential_id: null, expires_at: null },
    ],
    provider_authorization_attempts: [
      { id: ATTEMPT_A, business_id: BIZ_A, provider: 'quickbooks', status: 'pending', expires_at: '2099-01-01T00:00:00.000Z', initiated_by_profile_id: OWNER },
      { id: '00000000-0000-0000-0000-0000000c04e2', business_id: BIZ_A, provider: 'quickbooks', status: 'used', expires_at: '2099-01-01T00:00:00.000Z', initiated_by_profile_id: OWNER },
      { id: '00000000-0000-0000-0000-0000000c04e3', business_id: BIZ_A, provider: 'quickbooks', status: 'pending', expires_at: '2000-01-01T00:00:00.000Z', initiated_by_profile_id: OWNER },
    ],
  };

  const ACTOR = (profileId, businesses, isAdmin) => ({ actor: { user: { id: 'u1', email: 'a@b.c' }, profile: { id: profileId }, profile_id: profileId, role: 'owner', isAdmin: Boolean(isAdmin), isSuperAdmin: false, businesses } });

  // Every behavioural case. `expect` is the internal reason; the client code is
  // asserted separately, because the non-enumeration rule lives there.
  const CASES = [
    { id: 'A1', why: 'a permitted owner operation is authorized', req: { base44: ACTOR(OWNER, [BIZ_A]), operation: 'sync.start', connectionId: CONN_A }, expect: 'AUTHORIZED', client: 'AUTHORIZED', status: 200, executable: true, source: 'owner (business_entities.profile_id)' },
    { id: 'A2', why: 'an unresolved actor is denied', req: { operation: 'connection.create', businessId: BIZ_A, provider: 'quickbooks' }, expect: 'ACTOR_UNRESOLVED', client: 'NOT_AUTHORIZED', status: 401 },
    { id: 'A3', why: 'an actor without business access is denied', req: { base44: ACTOR(OWNER, [BIZ_B]), operation: 'connection.create', businessId: BIZ_A, provider: 'quickbooks' }, expect: 'BUSINESS_ACCESS_DENIED', client: 'NOT_AUTHORIZED', status: 403 },
    { id: 'A4', why: 'business access WITHOUT the required permission is denied', req: { base44: ACTOR(TEAM, [BIZ_A]), operation: 'sync.start', connectionId: CONN_A }, expect: 'PERMISSION_DENIED', client: 'NOT_AUTHORIZED', status: 403, source: 'team_member' },
    { id: 'A5', why: 'an unknown operation is denied', req: { base44: ACTOR(OWNER, [BIZ_A]), operation: 'connection.destroy', connectionId: CONN_A }, expect: 'INVALID_OPERATION', client: 'INVALID_REQUEST', status: 400 },
    { id: 'A6', why: 'a request business_id cannot redirect a connection of another business', req: { base44: ACTOR(OWNER, [BIZ_A, BIZ_B]), operation: 'connection.read', connectionId: CONN_B, businessId: BIZ_A }, expect: 'RESOURCE_BUSINESS_MISMATCH', client: 'RESOURCE_UNAVAILABLE', status: 404 },
    { id: 'A7', why: 'connection ownership is derived from the row (the resolver is called with the ROW business)', req: { base44: ACTOR(OWNER, [BIZ_B]), operation: 'connection.read', connectionId: CONN_B }, expect: 'AUTHORIZED', client: 'AUTHORIZED', status: 200, executable: true, source: 'owner (business_entities.profile_id)', assertBusinessCalled: BIZ_B },
    { id: 'A8', why: 'credential ownership cannot be redirected cross-business', req: { base44: ACTOR(OWNER, [BIZ_A, BIZ_B]), operation: 'credential.rotate', resourceType: 'credential', resourceId: CRED_A, businessId: BIZ_B }, expect: 'RESOURCE_BUSINESS_MISMATCH', client: 'RESOURCE_UNAVAILABLE', status: 404 },
    { id: 'A9', why: 'authorization-attempt ownership cannot be redirected cross-business', req: { base44: ACTOR(OWNER, [BIZ_A, BIZ_B]), operation: 'authorization.complete', authorizationAttemptId: ATTEMPT_A, businessId: BIZ_B }, expect: 'RESOURCE_BUSINESS_MISMATCH', client: 'RESOURCE_UNAVAILABLE', status: 404 },
    { id: 'A10', why: 'a disconnected connection is authorized but NOT executable', req: { base44: ACTOR(OWNER, [BIZ_A]), operation: 'sync.start', connectionId: '00000000-0000-0000-0000-0000000c0403' }, expect: 'CONNECTION_INACTIVE', client: 'NOT_EXECUTABLE', status: 409, allowed: true, executable: false, source: 'owner (business_entities.profile_id)' },
    { id: 'A11', why: 'a credential plaintext never appears in an authorization result', req: { base44: ACTOR(OWNER, [BIZ_A]), operation: 'sync.start', connectionId: CONN_A, metadata: { note: 'ok' } }, expect: 'AUTHORIZED', client: 'AUTHORIZED', status: 200, executable: true, source: 'owner (business_entities.profile_id)', noPlaintext: true },
    { id: 'A13', why: 'a DENIED attempt still produces an audit row', req: { base44: ACTOR(OWNER, [BIZ_B]), operation: 'connection.create', businessId: BIZ_A, provider: 'quickbooks' }, expect: 'BUSINESS_ACCESS_DENIED', client: 'NOT_AUTHORIZED', status: 403, auditDecision: 'deny' },
    { id: 'A14', why: 'an ALLOWED attempt produces an audit row', req: { base44: ACTOR(OWNER, [BIZ_A]), operation: 'balances.read', connectionId: CONN_A }, expect: 'AUTHORIZED', client: 'AUTHORIZED', status: 200, executable: true, source: 'owner (business_entities.profile_id)', auditDecision: 'allow' },
    { id: 'A17', why: 'service_role capability alone does NOT authorize (no session, no system claim)', req: { actorKind: 'system', operation: 'credential.resolve', connectionId: CONN_A }, expect: 'PROVIDER_AUTHENTICITY_FAILED', client: 'NOT_AUTHORIZED', status: 401 },
    { id: 'A4b', why: 'a team member may NOT manage credentials (least privilege, not just business access)', req: { base44: ACTOR(TEAM, [BIZ_A]), operation: 'credential.rotate', credentialId: CRED_A, resourceType: 'credential' }, expect: 'PERMISSION_DENIED', client: 'NOT_AUTHORIZED', status: 403, source: 'team_member' },
    { id: 'A18', why: 'an ABSENT resource fails closed without disclosing anything', req: { base44: ACTOR(OWNER, [BIZ_A]), operation: 'connection.read', connectionId: '00000000-0000-0000-0000-0000000c04ff' }, expect: 'RESOURCE_NOT_FOUND', client: 'RESOURCE_UNAVAILABLE', status: 404, noContext: true },
    { id: 'A18b', why: 'a FOREIGN resource is indistinguishable from an ABSENT one (the §13 non-enumeration rule)', req: { base44: ACTOR(OWNER, [BIZ_A]), operation: 'connection.read', connectionId: CONN_B }, expect: 'BUSINESS_ACCESS_DENIED', client: 'RESOURCE_UNAVAILABLE', status: 404, assertBusinessCalled: BIZ_B, noContext: true },
    { id: 'A19a', why: 'a consumed authorization attempt cannot be reauthorized (consume-before-reauthorize is unrepresentable)', req: { base44: ACTOR(OWNER, [BIZ_A]), operation: 'authorization.complete', authorizationAttemptId: '00000000-0000-0000-0000-0000000c04e2' }, expect: 'AUTHORIZATION_ATTEMPT_INVALID', client: 'RESOURCE_UNAVAILABLE', status: 404, source: 'owner (business_entities.profile_id)' },
    { id: 'A19b', why: 'an expired authorization attempt cannot be reauthorized', req: { base44: ACTOR(OWNER, [BIZ_A]), operation: 'authorization.complete', authorizationAttemptId: '00000000-0000-0000-0000-0000000c04e3' }, expect: 'AUTHORIZATION_ATTEMPT_INVALID', client: 'RESOURCE_UNAVAILABLE', status: 404, source: 'owner (business_entities.profile_id)' },
    { id: 'A19c', why: 'an attempt initiated by another actor cannot be completed', req: { base44: ACTOR(OTHER, [BIZ_A]), operation: 'authorization.complete', authorizationAttemptId: ATTEMPT_A }, expect: 'AUTHORIZATION_ATTEMPT_INVALID', client: 'RESOURCE_UNAVAILABLE', status: 404, source: 'owner (business_entities.profile_id)' },
    { id: 'A20a', why: 'a system path cannot substitute arbitrary business context', req: { actorKind: 'system', operation: 'webhook.process', connectionId: CONN_A, businessId: BIZ_B, systemContext: { kind: 'webhook', authenticity: 'verified', evidence_id: 'evt-1' } }, expect: 'RESOURCE_BUSINESS_MISMATCH', client: 'RESOURCE_UNAVAILABLE', status: 404 },
    { id: 'A20b', why: 'a system path may not perform a user operation (system is narrower)', req: { actorKind: 'system', operation: 'connection.create', businessId: BIZ_A, provider: 'quickbooks', systemContext: { kind: 'sync_worker', authenticity: 'verified', evidence_id: 'job-1' } }, expect: 'OPERATION_NOT_ALLOWED', client: 'NOT_AUTHORIZED', status: 403 },
    { id: 'A20c', why: 'a system webhook with no resolvable connection fails closed as a missing resource', req: { actorKind: 'system', operation: 'webhook.process', systemContext: { kind: 'webhook', authenticity: 'verified', evidence_id: 'evt-2' } }, expect: 'RESOURCE_NOT_FOUND', client: 'RESOURCE_UNAVAILABLE', status: 404 },
    { id: 'A20d', why: 'a system claim without a verification reference is refused', req: { actorKind: 'system', operation: 'credential.resolve', connectionId: CONN_A, systemContext: { kind: 'webhook', authenticity: 'verified' } }, expect: 'SYSTEM_CONTEXT_UNRESOLVED', client: 'NOT_AUTHORIZED', status: 403 },
    { id: 'A22', why: 'credential-shaped metadata is rejected before the audit is written', req: { base44: ACTOR(OWNER, [BIZ_A]), operation: 'balances.read', connectionId: CONN_A, metadata: { access_token: SECRET_MARKER } }, throws: true },

    // ── CB-004.2 · sync.execute — system execution of a SPECIFIC job ─────────
    // CB-005B strengthens this case: a job execution now also requires a LIVE
    // credential for the job's rotation unit, so the fixture supplies one. The
    // negative credential cases (CB42-K … N) prove the requirement is enforced.
    { id: 'CB42-A', why: 'a verified system worker executing a named job, with a live credential, is authorized', req: { actorKind: 'system', operation: 'sync.execute', connectionId: CONN_A, credentialId: CRED_A, businessId: BIZ_A, provider: 'quickbooks', resourceType: 'sync_job', resourceId: JOB_A, systemContext: VERIFIED_CTX }, expect: 'AUTHORIZED', client: 'AUTHORIZED', status: 200, executable: true, auditDecision: 'allow' },
    { id: 'CB42-B', why: 'a USER actor may never execute sync.execute', req: { base44: ACTOR(OWNER, [BIZ_A]), operation: 'sync.execute', connectionId: CONN_A, resourceType: 'sync_job', resourceId: JOB_A }, expect: 'OPERATION_NOT_ALLOWED', client: 'NOT_AUTHORIZED', status: 403, auditDecision: 'deny' },
    { id: 'CB42-C', why: 'a system actor may not perform accounts.read', req: { actorKind: 'system', operation: 'accounts.read', connectionId: CONN_A, systemContext: VERIFIED_CTX }, expect: 'OPERATION_NOT_ALLOWED', client: 'NOT_AUTHORIZED', status: 403 },
    { id: 'CB42-D', why: 'a system actor may not perform balances.read', req: { actorKind: 'system', operation: 'balances.read', connectionId: CONN_A, systemContext: VERIFIED_CTX }, expect: 'OPERATION_NOT_ALLOWED', client: 'NOT_AUTHORIZED', status: 403 },
    { id: 'CB42-E', why: 'a system actor may not perform transactions.read', req: { actorKind: 'system', operation: 'transactions.read', connectionId: CONN_A, systemContext: VERIFIED_CTX }, expect: 'OPERATION_NOT_ALLOWED', client: 'NOT_AUTHORIZED', status: 403 },
    { id: 'CB42-G', why: 'an UNVERIFIED system claim authorizing a job is refused', req: { actorKind: 'system', operation: 'sync.execute', connectionId: CONN_A, resourceType: 'sync_job', resourceId: JOB_A, systemContext: CLAIMED_CTX }, expect: 'PROVIDER_AUTHENTICITY_FAILED', client: 'NOT_AUTHORIZED', status: 401 },
    { id: 'CB42-H', why: 'a job execution with no resolvable connection fails closed as a missing resource', req: { actorKind: 'system', operation: 'sync.execute', resourceType: 'sync_job', resourceId: JOB_A, systemContext: VERIFIED_CTX }, expect: 'RESOURCE_NOT_FOUND', client: 'RESOURCE_UNAVAILABLE', status: 404, noContext: true },
    { id: 'CB42-I', why: 'an unusable connection is authorized but NOT executable for a job execution', req: { actorKind: 'system', operation: 'sync.execute', connectionId: CONN_DEAD, resourceType: 'sync_job', resourceId: JOB_A, systemContext: VERIFIED_CTX }, expect: 'CONNECTION_INACTIVE', client: 'NOT_EXECUTABLE', status: 409, allowed: true, executable: false },
    { id: 'CB42-J1', why: 'sync.execute without the required job resource is refused', req: { actorKind: 'system', operation: 'sync.execute', connectionId: CONN_A, systemContext: VERIFIED_CTX }, expect: 'RESOURCE_NOT_FOUND', client: 'RESOURCE_UNAVAILABLE', status: 404 },
    { id: 'CB42-J2', why: 'a credential resource cannot stand in for the job resource', req: { actorKind: 'system', operation: 'sync.execute', connectionId: CONN_A, resourceType: 'credential', resourceId: CRED_A, systemContext: VERIFIED_CTX }, expect: 'RESOURCE_NOT_FOUND', client: 'RESOURCE_UNAVAILABLE', status: 404 },
    { id: 'CB42-J3', why: 'a job resource type without an id is refused', req: { actorKind: 'system', operation: 'sync.execute', connectionId: CONN_A, resourceType: 'sync_job', systemContext: VERIFIED_CTX }, expect: 'RESOURCE_NOT_FOUND', client: 'RESOURCE_UNAVAILABLE', status: 404 },
    { id: 'CB42-J4', why: 'a system job execution cannot be redirected to another business by the request', req: { actorKind: 'system', operation: 'sync.execute', connectionId: CONN_A, businessId: BIZ_B, resourceType: 'sync_job', resourceId: JOB_A, systemContext: VERIFIED_CTX }, expect: 'RESOURCE_BUSINESS_MISMATCH', client: 'RESOURCE_UNAVAILABLE', status: 404 },

    // ── CB-005B · the credential precondition for a job execution ────────────
    // A job whose rotation unit has no live credential is AUTHORIZED but NOT
    // EXECUTABLE — 409, no context disclosed, and the audit says CREDENTIAL_UNAVAILABLE.
    { id: 'CB42-K', why: 'a job execution without any resolvable credential is not executable', req: { actorKind: 'system', operation: 'sync.execute', connectionId: CONN_A, credentialId: '00000000-0000-0000-0000-0000000c04ff', resourceType: 'sync_job', resourceId: JOB_A, systemContext: VERIFIED_CTX }, expect: 'CREDENTIAL_UNAVAILABLE', client: 'NOT_EXECUTABLE', status: 409, allowed: true, executable: false, auditDecision: 'deny' },
    { id: 'CB42-L', why: 'a superseded credential cannot authorize a job execution', req: { actorKind: 'system', operation: 'sync.execute', connectionId: CONN_A, credentialId: CRED_SUPERSEDED, resourceType: 'sync_job', resourceId: JOB_A, systemContext: VERIFIED_CTX }, expect: 'CREDENTIAL_UNAVAILABLE', client: 'NOT_EXECUTABLE', status: 409, allowed: true, executable: false, auditDecision: 'deny' },
    { id: 'CB42-M', why: 'an EXPIRED credential cannot authorize a job execution (expiry is not revocation, but it is not usable either)', req: { actorKind: 'system', operation: 'sync.execute', connectionId: CONN_A, credentialId: CRED_EXPIRED, resourceType: 'sync_job', resourceId: JOB_A, systemContext: VERIFIED_CTX }, expect: 'CREDENTIAL_UNAVAILABLE', client: 'NOT_EXECUTABLE', status: 409, allowed: true, executable: false, auditDecision: 'deny' },
    { id: 'CB42-N', why: 'a credential belonging to ANOTHER connection cannot authorize this connection\'s job', req: { actorKind: 'system', operation: 'sync.execute', connectionId: CONN_A, credentialId: CRED_FOREIGN_CONNECTION, resourceType: 'sync_job', resourceId: JOB_A, systemContext: VERIFIED_CTX }, expect: 'CREDENTIAL_UNAVAILABLE', client: 'NOT_EXECUTABLE', status: 409, allowed: true, executable: false, auditDecision: 'deny' },
  ];

  /**
   * emit — how a behavioural result is reported. Defaults to the harness `ok`,
   * so the main pass counts and records failures exactly like every static check.
   * The mutation pass injects its OWN collector instead, because a mutation must
   * be judged against a throwaway list rather than the real one.
   */
  async function runBehavior(vocab, kernelSrc, emit) {
    let loaded;
    try {
      loaded = loadKernel(vocab, kernelSrc);
    } catch (e) {
      emit('CB-104:load', false, `the kernel did not load: ${e.message}`);
      return;
    }
    emit('CB-104:load', typeof loaded.api.authorizeProviderOperation === 'function'
      && typeof loaded.api.evaluateProviderOperation === 'function',
      'the kernel must export authorizeProviderOperation and evaluateProviderOperation');

    const { api, deps } = loaded;
    const undetected = [];

    for (const c of CASES) {
      const sink = [];
      deps.sources[OWNER] = c.source || '';
      deps.sources[TEAM] = c.source || '';
      deps.sources[OTHER] = c.source || '';
      const before = deps.business.length;
      let got = null;
      let threw = null;
      try {
        got = await api.authorizeProviderOperation({ sb: makeSb(FIXTURE_ROWS, sink), ...c.req });
      } catch (e) {
        threw = e;
      }
      const label = `CB-105:${c.id}`;

      if (c.throws) {
        // The module guard must REJECT — never silently strip — before any audit.
        const rejected = Boolean(threw) || sink.length === 0;
        emit(label, rejected, `${c.why} — a credential-shaped key must throw before the audit is written`);
        if (!rejected) undetected.push(c.id);
        continue;
      }
      if (threw) {
        emit(label, false, `${c.why} — unexpected throw: ${threw.message}`);
        undetected.push(c.id);
        continue;
      }
      const problems = [];
      if (got.client_code !== c.client) problems.push(`client_code=${got.client_code} (want ${c.client})`);
      if (got.http_status !== c.status) problems.push(`status=${got.http_status} (want ${c.status})`);
      if (c.executable !== undefined && got.executable !== c.executable) problems.push(`executable=${got.executable} (want ${c.executable})`);
      if (c.allowed !== undefined && got.allowed !== c.allowed) problems.push(`allowed=${got.allowed}`);
      if (c.noPlaintext && JSON.stringify(got).includes(SECRET_MARKER)) problems.push('plaintext marker in the decision');
      if (c.noContext && got.context !== null) problems.push('a denial returned a resolved context (enumeration)');
      if (c.assertBusinessCalled && deps.business.slice(before).indexOf(c.assertBusinessCalled) === -1) {
        problems.push(`business authorization used ${JSON.stringify(deps.business.slice(before))} instead of the ROW business`);
      }
      // The INTERNAL reason code must never be returned to a caller.
      if (JSON.stringify(got).includes(c.expect) && got.client_code !== 'AUTHORIZED') {
        problems.push('the internal reason code leaked into the decision');
      }
      if (sink.length !== 1 || sink[0].name !== 'provider_operation_audit_record') {
        problems.push(`exactly one audit append expected, saw ${JSON.stringify(sink.map((s) => s.name))}`);
      } else {
        const args = sink[0].args;
        if (args.p_reason_code !== c.expect) problems.push(`audited reason=${args.p_reason_code} (want ${c.expect})`);
        if (c.auditDecision && args.p_decision !== c.auditDecision) problems.push(`audited decision=${args.p_decision}`);
        if (JSON.stringify(args).includes(SECRET_MARKER)) problems.push('plaintext marker in the audit payload');
      }
      // The canonical Security Kernel must have been used for a user actor.
      if (c.req.actorKind !== 'system' && c.req.base44 && deps.authenticate < 1) {
        problems.push('authenticateActor was never called — the canonical resolver was bypassed');
      }
      emit(label, problems.length === 0, `${c.why} — ${problems.join('; ')}`);
      if (problems.length) undetected.push(c.id);
    }
    emit('CB-105', undetected.length === 0, `behavioural authorization cases failed: ${undetected.join(', ')}`);

    // ── CB-107 · the system actor is exhausted against EVERY user-only operation.
    // The set is derived from the module's own classifier, so an operation added
    // later as user-kind is covered automatically, and one silently reclassified
    // to system-kind is caught by the set assertion below.
    const userOps = vocab.PROVIDER_OPERATIONS.filter((op) => vocab.operationActorKind(op) === 'user');
    const acceptedAsUser = [];
    for (const op of userOps) {
      const sink = [];
      let got = null;
      try {
        got = await api.authorizeProviderOperation({
          sb: makeSb(FIXTURE_ROWS, sink), actorKind: 'system', operation: op,
          connectionId: CONN_A, systemContext: VERIFIED_CTX,
        });
      } catch (err) { got = null; }
      const denied = Boolean(got) && got.executable === false && got.client_code === 'NOT_AUTHORIZED'
        && sink.length === 1 && sink[0].args.p_reason_code === 'OPERATION_NOT_ALLOWED';
      if (!denied) acceptedAsUser.push(op);
    }
    emit('CB-107', userOps.length === vocab.PROVIDER_OPERATIONS.length - vocab.SYSTEM_OPERATIONS.length
      && acceptedAsUser.length === 0,
      `every user-kind operation must be refused for a system actor; accepted: ${acceptedAsUser.join(', ') || '<none>'} (checked ${userOps.length})`);

    const systemOps = vocab.PROVIDER_OPERATIONS.filter((op) => vocab.operationActorKind(op) === 'system');
    emit('CB-107:system-set', systemOps.length === vocab.SYSTEM_OPERATIONS.length
      && vocab.SYSTEM_OPERATIONS.every((o) => systemOps.includes(o)),
      `the system operation set must be exactly SYSTEM_OPERATIONS; found ${JSON.stringify(systemOps)}`);

    // The audit row for a job execution must name the JOB, the ROW-derived binding
    // and the system actor — never a profile, never a caller-named operation.
    const sinkB = [];
    const gotB = await api.authorizeProviderOperation({
      sb: makeSb(FIXTURE_ROWS, sinkB), actorKind: 'system', operation: 'sync.execute',
      connectionId: CONN_A, credentialId: CRED_A, resourceType: 'sync_job', resourceId: JOB_A, systemContext: VERIFIED_CTX,
    });
    const aud = sinkB.length === 1 ? sinkB[0].args : {};
    emit('CB-107:audit-binding', gotB.executable === true
      && aud.p_actor_kind === 'system' && aud.p_actor_profile_id === null
      && aud.p_operation === 'sync.execute'
      && aud.p_resource_type === 'sync_job' && aud.p_resource_id === JOB_A
      && aud.p_business_id === BIZ_A && aud.p_provider === 'quickbooks'
      && aud.p_business_connection_id === CONN_A && aud.p_decision === 'allow',
      `a job execution must audit the job resource and the row-derived binding; saw ${JSON.stringify({ op: aud.p_operation, rt: aud.p_resource_type, rid: aud.p_resource_id, biz: aud.p_business_id, prov: aud.p_provider, conn: aud.p_business_connection_id, kind: aud.p_actor_kind, dec: aud.p_decision })}`);

    // The actor is resolved from the session, and NOWHERE ELSE: the input contract
    // must have no actor field a caller could populate.
    emit('CB-104:no-caller-actor', !/\bactor\s*[,:}]/.test((kernelSrc.match(/export type ProviderOperationInput[^\n]*/) || [''])[0]),
      'the input contract must not accept a caller-supplied actor — a constructed actor would be an authorization bypass');
  }

  /** The columns/tables a restated rule would name, judged with literals removed. */
  function restatedNames(already, ruleTables, codeOnly) {
    return ['assigned_advisor_id', ...ruleTables]
      .filter((t) => !already.includes(t) && codeOnly.includes(t));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CB-88 · presence
  // ══════════════════════════════════════════════════════════════════════════
  function checkPresence(vocab, src) {
    ok('CB-88', Object.values(src).every((s) => typeof s === 'string' && s.length > 0),
      'all CB-004 artifacts (migration, certification, adversarial, residue, kernel, vocabulary) must exist');
    // CB-004.2 added EXACTLY one operation, and it is a system one: 18 → 19
    // operations, 2 → 3 system operations. The counts are asserted rather than
    // derived so a silent reclassification cannot slip through; CB-106 proves the
    // SQL agrees with the module in all three places the vocabulary is enforced.
    ok('CB-88:module-vocab', Array.isArray(vocab.PROVIDER_OPERATIONS) && vocab.PROVIDER_OPERATIONS.length === 19
      && Array.isArray(vocab.PROVIDER_OPERATION_REASON_CODES) && vocab.PROVIDER_OPERATION_REASON_CODES.length === 13
      && Array.isArray(vocab.SYSTEM_OPERATIONS) && vocab.SYSTEM_OPERATIONS.length === 3
      && typeof vocab.operationActorKind === 'function',
      'the shipped vocabulary module must expose the operation, reason-code and system-operation vocabularies');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CB-89 · one table, one function, and nothing else
  // ══════════════════════════════════════════════════════════════════════════
  function checkObjectScope(migSrc) {
    const live = stripComments(migSrc);

    const tables = [...live.matchAll(/create table if not exists public\.([a-z_]+)/g)].map((m) => m[1]);
    ok('CB-89a', tables.length === 1 && tables[0] === 'provider_operation_audit',
      `exactly one table may be created, and it must be provider_operation_audit; found ${JSON.stringify(tables)}`);

    const fns = [...live.matchAll(/create or replace function public\.([a-z_]+)\s*\(/g)].map((m) => m[1]);
    ok('CB-89b', fns.length === 1 && fns[0] === 'provider_operation_audit_record',
      `exactly one function may be created; found ${JSON.stringify(fns)}`);

    const other = [
      /\bcreate\s+(view|materialized\s+view|sequence|schema|type|trigger|policy|extension|rule)\b/i,
      /\balter\s+default\s+privileges\b/i,
      /\bcreate\s+unique\s+index\b/i,
    ].filter((re) => re.test(live));
    ok('CB-89c', other.length === 0,
      `CB-004 must create no view, sequence, schema, type, trigger, policy, extension or default privilege — found ${other.map(String).join(' ')}`);

    const alters = (live.match(/^\s*alter (table|function)\b[^;]*;/gim) || []).map((s) => s.replace(/\s+/g, ' ').trim());
    const bad = alters.filter((s) => s !== `alter table ${TABLE} enable row level security;`
      && s !== `alter function ${FN}(${FN_SIG}) owner to postgres;`);
    ok('CB-89d', alters.length === 2 && bad.length === 0,
      `the only permitted ALTER statements are the explicit RLS enable and the owner pin — found: ${bad.join(' | ') || '<none>'}`);

    const idx = [...live.matchAll(/create index if not exists (provider_operation_audit_[a-z_]+_idx)/g)].map((m) => m[1]);
    ok('CB-89e', idx.length === 3 && INDEXES.every((i) => idx.includes(i)),
      `exactly the three intended indexes may be created; found ${JSON.stringify(idx)}`);

    ok('CB-89f', !/alter\s+table\s+public\.(business_connections|provider_credentials|provider_authorization_attempts)/i.test(live),
      'CB-004 must not alter the certified CB-001 / CB-001.2 / CB-003 tables');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CB-90 · the audit table's shape, and the absence of a plaintext column
  // ══════════════════════════════════════════════════════════════════════════
  function checkTableShape(migSrc) {
    const start = migSrc.indexOf(`create table if not exists ${TABLE}`);
    const body = migSrc.slice(start, migSrc.indexOf('comment on table'));

    const missing = COLUMNS.filter((c) => !new RegExp(`^\\s+${c}\\s`, 'm').test(body));
    ok('CB-90a', missing.length === 0, `missing column(s): ${missing.join(', ')}`);

    // A column DECLARATION is `name type` at the start of a line — never a mention
    // inside a deny-list, which is how the defense would otherwise flag itself.
    const declared = PLAINTEXT_COLUMNS.filter((c) => new RegExp(`^\\s+${c}\\s+(text|uuid|jsonb|varchar)`, 'm').test(body));
    ok('CB-90b', declared.length === 0,
      `the audit table must declare no plaintext credential column — found ${declared.join(', ')}`);

    // The audit must OUTLIVE the rows it names: SET NULL, never CASCADE.
    const fks = [...body.matchAll(/references public\.([a-z_]+)\(id\) on delete (\w+ \w+)/g)].map((m) => `${m[1]}:${m[2]}`);
    ok('CB-90c', fks.length === 4 && fks.every((f) => f.endsWith('set null')),
      `every FK must be ON DELETE SET NULL so deleting a business or an actor never deletes the audit trail; found ${JSON.stringify(fks)}`);

    ok('CB-90d', new RegExp(`references public\\.provider_authorization_attempts\\(id\\) on delete set null`).test(body)
      && new RegExp(`references public\\.business_connections\\(id\\) on delete set null`).test(body)
      && new RegExp(`references public\\.profiles\\(id\\) on delete set null`).test(body)
      && new RegExp(`references public\\.business_entities\\(id\\) on delete set null`).test(body),
      'the audit must reference profiles, business_entities, business_connections and provider_authorization_attempts');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CB-91 · vocabulary drift between the SQL CHECKs and the shipped module
  // ══════════════════════════════════════════════════════════════════════════
  function checkVocabularyDrift(migSrc, vocab, mig42) {
    const pairs = [
      ['provider_operation_audit_provider_check', vocab.PROVIDERS],
      ['provider_operation_audit_actor_kind_check', vocab.AUDIT_ACTOR_KINDS],
      ['provider_operation_audit_decision_check', vocab.AUDIT_DECISIONS],
      ['provider_operation_audit_reason_code_check', vocab.PROVIDER_OPERATION_REASON_CODES],
      ['provider_operation_audit_resource_type_check', vocab.PROVIDER_RESOURCE_TYPES],
    ];
    pairs.forEach(([constraint, list], i) => {
      const inSql = sqlList(migSrc, constraint);
      const same = Array.isArray(inSql) && inSql.length === list.length && list.every((v) => inSql.includes(v));
      ok(`CB-91:${i + 1}`, same,
        `vocabulary drift in ${constraint}: sql=${JSON.stringify(inSql)} module=${JSON.stringify(list)}`);
    });

    // The operation domain is the closed list PLUS the one recorded outlier. The
    // outlier sits OUTSIDE the `in (...)` list on purpose: it is not an operation,
    // it is the record THAT an operation outside the vocabulary was attempted.
    // The operation domain is the closed list PLUS the one recorded outlier, and
    // since CB-004.2 it is expressed across TWO artifacts: the applied CB-004
    // migration and its single additive successor. Both are parsed, and the
    // successor must be the complete, correct domain — while containing every
    // value the applied artifact contained, so an addition can never drop one.
    const ops = sqlList(migSrc, 'provider_operation_audit_operation_check');
    const ops42 = sqlList(mig42, 'provider_operation_audit_operation_check');
    ok('CB-91:6', Array.isArray(ops) && Array.isArray(ops42)
      && ops.length === vocab.PROVIDER_OPERATIONS.length - 1
      && ops.every((o) => ops42.includes(o))
      && ops42.length === vocab.PROVIDER_OPERATIONS.length
      && vocab.PROVIDER_OPERATIONS.every((o) => ops42.includes(o))
      && !ops42.includes(vocab.AUDIT_UNKNOWN_OPERATION)
      && new RegExp(`or operation = '${vocab.AUDIT_UNKNOWN_OPERATION}'`).test(mig42),
      `the deployed operation domain must be the closed ${vocab.PROVIDER_OPERATIONS.length}-operation vocabulary plus a separate '${vocab.AUDIT_UNKNOWN_OPERATION}' disjunct; cb004=${JSON.stringify(ops)} cb0042=${JSON.stringify(ops42)}`);

    ok('CB-91:7', vocab.operationActorKind('credential.resolve') === 'system'
      && vocab.operationActorKind('webhook.process') === 'system'
      && vocab.operationActorKind('connection.read') === 'user'
      && vocab.operationActorKind('nonsense') === null,
      'operationActorKind must classify correctly and fail closed on an unknown operation');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CB-92 · the record SHAPE — an audit row cannot state an impossible outcome
  // ══════════════════════════════════════════════════════════════════════════
  function checkRecordShape(migSrc) {
    const live = stripComments(migSrc);

    ok('CB-92a', /constraint provider_operation_audit_decision_reason_consistency\s+check \(\(decision = 'allow'\) = \(reason_code = 'AUTHORIZED'\)\)/.test(live),
      'ALLOW and AUTHORIZED must be the same fact in BOTH directions — no allow may cite another reason, and no other reason may be an allow');

    ok('CB-92b', /constraint provider_operation_audit_allow_has_provider\s+check \(decision <> 'allow' or provider is not null\)/.test(live),
      'an ALLOW must always record the provider it was authorized against');

    // Three-valued logic: `provider in (...)` on a NULL provider is NULL, which
    // PASSES a CHECK. The guard must say `is null or` explicitly.
    ok('CB-92c', /constraint provider_operation_audit_provider_check\s+check \(provider is null or provider in \(/.test(live),
      'the provider constraint must be written `provider is null or provider in (...)` — a bare `in (...)` passes for NULL and would admit an unknown provider');

    ok('CB-92d', /constraint provider_operation_audit_unknown_operation_check\s+check \(operation <> 'unknown' or decision = 'deny'\)/.test(live),
      'an operation outside the vocabulary may be RECORDED but never authorized');

    ok('CB-92e', /constraint provider_operation_audit_actor_identity_shape[\s\S]{0,260}actor_kind = 'user'[\s\S]{0,160}reason_code = 'ACTOR_UNRESOLVED'[\s\S]{0,120}actor_kind = 'system' and actor_profile_id is null/.test(live),
      'a SYSTEM row must never name a profile, and a USER row must name one unless the denial IS the unresolved actor');

    ok('CB-92f', /constraint provider_operation_audit_safe_metadata_shape\s+check \(jsonb_typeof\(safe_metadata\) = 'object' and length\(safe_metadata::text\) <= 4096\)/.test(live),
      'safe_metadata must be a bounded object — never a request or response body');

    ok('CB-92g', /constraint provider_operation_audit_correlation_shape[\s\S]{0,220}\[\[:cntrl:\]\]/.test(live)
      && /constraint provider_operation_audit_resource_id_shape\s+check \(resource_id is null or length\(resource_id\) between 1 and 128\)/.test(live),
      'free-text identifiers must be bounded and control-character free');

    const checks = (live.match(/constraint\s+provider_operation_audit_[a-z_]+\s+check/g) || []).length;
    ok('CB-92h', checks === 13,
      `exactly 13 named CHECK constraints must be declared — an extra one is an unproven rule and a missing one is a lost invariant; found ${checks}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CB-93 · the append-only ACL — the privilege is simply absent
  // ══════════════════════════════════════════════════════════════════════════
  function checkAuditAcl(migSrc) {
    const live = stripComments(migSrc);

    ok('CB-93a', new RegExp(`alter table ${TABLE} enable row level security;`).test(live),
      'RLS must be enabled EXPLICITLY, not left to the rls_auto_enable event trigger');

    const missing = ['public', 'anon', 'authenticated', 'service_role']
      .filter((r) => !new RegExp(`revoke all on table ${TABLE} from ${r};`).test(live));
    ok('CB-93b', missing.length === 0,
      `the table must be REVOKEd from PUBLIC, anon, authenticated AND service_role — pg_default_acl otherwise seeds the relation; missing: ${missing.join(', ')}`);

    ok('CB-93c', new RegExp(`grant select on table ${TABLE} to service_role;`).test(live),
      'service_role must receive SELECT on the audit table — and nothing else');

    const rev = live.indexOf(`revoke all on table ${TABLE} from service_role;`);
    const gr = live.indexOf(`grant select on table ${TABLE} to service_role;`);
    ok('CB-93d', rev !== -1 && gr !== -1 && rev < gr,
      `REVOKE-then-GRANT is a correctness property — the reverse lands on nothing (revoke@${rev}, grant@${gr})`);

    ok('CB-93e', !/grant[^;]*\b(insert|update|delete|truncate|references|trigger)\b[^;]*\bon table\b/i.test(live),
      'no role may be granted INSERT, UPDATE, DELETE or TRUNCATE on the audit table — the function is the only writer and history is not rewritable');

    ok('CB-93f', !/delete\s+from\s+public\.provider_operation_audit/i.test(live)
      && !/update\s+public\.provider_operation_audit/i.test(live),
      'the migration itself must never update or delete an audit row');

    ok('CB-93g', !/create policy/i.test(live),
      'no RLS policy may be created — anon/authenticated have no access at all, and the deny-all default is the point');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CB-94 · the one writer: hardening, ACL, and append-only in its own body
  // ══════════════════════════════════════════════════════════════════════════
  function checkWriter(migSrc, vocab, mig42) {
    const body = fnBlock(migSrc);
    ok('CB-94a', Boolean(body), 'the writer function must be defined');
    if (!body) return;

    ok('CB-94b', /\bsecurity definer\b/.test(body), 'the writer must be SECURITY DEFINER — it runs as its owner');
    ok('CB-94c', body.includes('set search_path = pg_catalog, public'), 'the writer must pin exactly `set search_path = pg_catalog, public`');
    ok('CB-94d', new RegExp(`alter function ${FN}\\(${FN_SIG}\\) owner to postgres;`).test(migSrc),
      'the writer\'s owner must be PINNED to postgres — a SECURITY DEFINER function runs as its OWNER');
    ok('CB-94e', !/security invoker/i.test(stripComments(migSrc)), 'no SECURITY INVOKER function may exist on this boundary');

    // The identity signature, derived from the migration's OWN header — the
    // CB-68 lesson: never compare a name-bearing rendering to a types-only one.
    const types = fnArgTypes(migSrc);
    ok('CB-94f', types === FN_TYPES.join(', '),
      `the writer's ordered argument types must be exactly (${FN_TYPES.join(', ')}); found (${types})`);

    const badRevoke = [];
    for (const role of ['public', 'anon', 'authenticated', 'service_role']) {
      if (!new RegExp(`revoke all on function ${FN}\\(${FN_SIG.replace(/[(),]/g, '\\$&')}\\) from ${role};`).test(migSrc)) {
        badRevoke.push(role);
      }
    }
    ok('CB-94g', badRevoke.length === 0,
      `the writer must be REVOKEd from PUBLIC, anon, authenticated AND service_role — missing: ${badRevoke.join(', ')}`);
    ok('CB-94h', new RegExp(`grant execute on function ${FN}\\(${FN_SIG.replace(/[(),]/g, '\\$&')}\\) to service_role;`).test(migSrc),
      'the writer must be granted to service_role only');
    ok('CB-94i', !/grant\s+execute\b[^;]*\bto\s+(PUBLIC|anon|authenticated)\b/gi.test(migSrc),
      'no browser role may ever be granted EXECUTE on the writer');

    const fnRev = migSrc.indexOf(`revoke all on function ${FN}(${FN_SIG}) from service_role;`);
    const fnGr = migSrc.indexOf(`grant execute on function ${FN}(${FN_SIG}) to service_role;`);
    ok('CB-94j', fnRev !== -1 && fnGr !== -1 && fnRev < fnGr,
      `the writer's REVOKE must precede its GRANT (revoke@${fnRev}, grant@${fnGr})`);

    // ── APPEND-ONLY, IN THE BODY ITSELF ────────────────────────────────────
    const inserts = (body.match(new RegExp(`insert into ${TABLE}`, 'g')) || []).length;
    ok('CB-94k', inserts === 1, `the writer must contain exactly ONE insert into the audit table; found ${inserts}`);
    ok('CB-94l', !new RegExp(`update\\s+${TABLE}`, 'i').test(body) && !new RegExp(`delete\\s+from\\s+${TABLE}`, 'i').test(body),
      'the writer must contain no UPDATE and no DELETE — append-only is the absence of the statement, not a promise');
    ok('CB-94m', !/\bupdate\s+public\./i.test(body) && !/\bdelete\s+from\b/i.test(body) && !/\btruncate\b/i.test(body),
      'the writer must not modify ANY table — it appends one row and returns');

    // ── THE VOCABULARY GUARDS INSIDE THE FUNCTION ──────────────────────────
    ok('CB-94n', /actor_kind not in \('user', 'system'\)/.test(body)
      && /a system operation must not name a profile/.test(body),
      'the writer must enforce the actor-kind pair and refuse a system row that names a profile');

    ok('CB-94o', /operation is outside the closed vocabulary/.test(body)
      && /reason_code is outside the bounded vocabulary/.test(body)
      && /decision must be allow or deny/.test(body),
      'the writer must re-validate operation, reason_code and decision independently of the table CHECKs');

    ok('CB-94p', /allow and AUTHORIZED are the same fact/.test(body)
      && /an authorized operation must record its provider/.test(body)
      && /an operation outside the vocabulary is never authorized/.test(body),
      'the writer must refuse an allow without a provider, an unknown operation as an allow, and a decision/reason contradiction');

    // ── SYSTEM EXECUTION IS NARROWER (CB-004 §17/§18) ──────────────────────
    // The DEPLOYED narrowing is the one in the latest replacement (CB-004.2), so
    // that is the list compared to the module; the applied CB-004 list must still
    // be a subset of it, which is what forbids a reclassification that removes an
    // operation from system execution instead of adding one.
    const narrowOps = parseNarrow(body);
    const narrowOps42 = parseNarrow(fnBlock(mig42 || ''));
    ok('CB-94q', Array.isArray(narrowOps) && Array.isArray(narrowOps42)
      && narrowOps.length === vocab.SYSTEM_OPERATIONS.length - 1
      && narrowOps.every((o) => vocab.SYSTEM_OPERATIONS.includes(o))
      && narrowOps42.length === vocab.SYSTEM_OPERATIONS.length
      && vocab.SYSTEM_OPERATIONS.every((o) => narrowOps42.includes(o)),
      `the deployed writer must narrow system execution to exactly the module's SYSTEM_OPERATIONS, and the applied list must remain a subset of it; cb004=${JSON.stringify(narrowOps)} cb0042=${JSON.stringify(narrowOps42)} module=${JSON.stringify([...vocab.SYSTEM_OPERATIONS])}`);

    ok('CB-94r', /a system operation may not authorize a user operation/.test(body),
      'the system narrowing must RAISE, not merely be documented');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CB-95 · the recursive metadata guard, and its deny list
  // ══════════════════════════════════════════════════════════════════════════
  function checkMetadataGuard(migSrc, vocab) {
    const body = fnBlock(migSrc) || '';

    ok('CB-95a', /with recursive containers\(depth, node\)/.test(body),
      'the database metadata guard must WALK the object recursively — a top-level-only check would miss a nested token');

    // Both set-returning functions must receive a CASE-selected argument, so a
    // scalar node cannot make jsonb_each/jsonb_array_elements raise. A guard that
    // can error on legitimate metadata is worse than no guard.
    ok('CB-95b', /jsonb_each\(case when jsonb_typeof\(c\.node\) = 'object' then c\.node else '\{\}'::jsonb end\)/.test(body)
      && /jsonb_array_elements\(case when jsonb_typeof\(c\.node\) = 'array' then c\.node else '\[\]'::jsonb end\)/.test(body),
      'both set-returning functions must be CASE-selected — an unguarded jsonb_each on a scalar raises');

    ok('CB-95c', /where c\.depth < 6/.test(body), 'the walk must be bounded by a depth limit');
    ok('CB-95d', /credential-shaped metadata key rejected/.test(body) && /raise exception/.test(body),
      'a credential-shaped key must RAISE — never silently strip, because a write that tried to smuggle a token must fail loudly');

    const declared = (body.match(/in \(\s*'accesstoken',[\s\S]*?\)/) || [''])[0];
    const tokens = (declared.match(/'([a-z]+)'/g) || []).map((s) => s.replace(/'/g, ''));
    const expected = vocab.FORBIDDEN_METADATA_KEYS;
    ok('CB-95e', tokens.length === expected.length && expected.every((k) => tokens.includes(k)),
      `the database deny-list must equal FORBIDDEN_METADATA_KEYS; sql=${JSON.stringify(tokens)} module=${JSON.stringify(expected)}`);

    ok('CB-95f', /jsonb_typeof\(p_safe_metadata\) <> 'object'/.test(body) && /length\(p_safe_metadata::text\) > 4096/.test(body),
      'the writer must reject a non-object or oversized safe_metadata before the walk');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CB-96 · the KERNEL: reuse, the credential boundary, and no consumption
  // ══════════════════════════════════════════════════════════════════════════
  function checkKernelSource(kernelSrc, vocab) {
    const live = stripTsComments(kernelSrc);

    ok('CB-96a', /from '\.\.\/authz\/actor\.ts'/.test(kernelSrc)
      && /authenticateActor/.test(live)
      && /authorizeBusinessAccess/.test(live),
      'the kernel must reuse authenticateActor and authorizeBusinessAccess from the existing Security Kernel');

    ok('CB-96b', /from '\.\.\/businessScope\/writeGuard\.ts'/.test(kernelSrc) && /validateBusinessScope/.test(live),
      'the kernel must read the relationship source from validateBusinessScope — never re-implement the seven-source rule');

    // It must not carry a second copy of the business-role rule.
    // Judged on CODE, with string literals removed, AND on the query shape. The
    // kernel legitimately CARRIES the canonical reason strings — `owner
    // (business_entities.profile_id)` — as DATA to match the Security Kernel's own
    // output against; that is consuming the rule, not restating it. The rule may
    // never be QUERIED. Both halves are needed: the literal-strip alone cannot see
    // `.from('business_owners')`, because a Supabase table name is always a string.
    const ruleTables = ['business_entities', 'business_team_members', 'business_owners',
      'advisor_assignments', 'expert_advisor_access'];
    const queried = ruleTables.filter((t) => new RegExp(`\\.from\\('${t}'\\)`).test(live));
    const codeOnly = live.replace(/'[^']*'/g, "''").replace(/`[^`]*`/g, '``');
    const restated = restatedNames(queried, ruleTables, codeOnly);
    ok('CB-96c', queried.length === 0 && restated.length === 0,
      `the kernel must not restate the canonical business rule — found ${[...queried, ...restated].join(', ')}`);

    // THE CREDENTIAL BOUNDARY: no resolution, no Vault, no plaintext field.
    const credentialReach = [
      /provider_credential_resolve/, /vault\./, /decrypted_secrets/, /create_secret/,
      /access_token/, /refresh_token/, /client_secret/,
    ].filter((re) => re.test(live));
    ok('CB-96d', credentialReach.length === 0,
      `the kernel must reach NO credential capability and no Vault object — found ${credentialReach.map(String).join(', ')}`);

    ok('CB-96e', !/plaintext/i.test(live), 'the kernel must have no plaintext field or path of any kind');

    // REAUTHORIZE BEFORE CONSUME: the kernel cannot consume, so it cannot pre-empt.
    ok('CB-96f', !/provider_authorization_attempt_consume/.test(live) && !/attempt_consume/.test(live),
      'the kernel must never consume an authorization attempt — consumption belongs to the certified CB-003 function, which is what makes reauthorize-before-consume structural');

    const rpc = (live.match(/rpc\('provider_operation_audit_record'/g) || []).length;
    ok('CB-96g', rpc === 1, `the kernel must append exactly one audit row per decision; found ${rpc}`);

    ok('CB-96h', /throw new Error\(`provider_operation_audit_record failed/.test(kernelSrc),
      'an authorization that cannot be RECORDED must not proceed — the audit failure must propagate');

    // NON-ENUMERATION: the internal reason code must never reach the caller.
    ok('CB-96i', /context: executable/.test(live),
      'the resolved context must be returned ONLY when the operation may proceed — a denial must disclose no business or provider');
    ok('CB-96j', /reason_code/.test(live) && /reason: evaluation\.reason_code/.test(kernelSrc),
      'the internal reason code must be carried to the audit rather than returned');
    ok('CB-96k', !/client_code: reason/.test(live) && !/client_code: args\.reason/.test(live),
      'the client code must come from the mapping table, never from the internal reason directly');

    // The permission model must stay small and closed.
    const perms = (kernelSrc.match(/'(connections|credentials|financial_data)\.[a-z_]+'/g) || []);
    ok('CB-96l', new Set(perms).size === 5,
      `exactly five provider permissions may exist; found ${JSON.stringify([...new Set(perms)])}`);

    ok('CB-96m', /PROVIDER_PERMISSION_SOURCES/.test(live) && /permissionAllows/.test(live),
      'permission must be decided by one closed source→capability table through one predicate');

    ok('CB-96n', /\bsb\.from\(/.test(live)
      && /'business_connections'/.test(live) && /'provider_credentials'/.test(live)
      && /'provider_authorization_attempts'/.test(live),
      'the kernel must load the resource rows itself — by id, from the table that owns it — so the business comes from the ROW and never from the request');

    ok('CB-96o', /assertSafeMetadata\(meta, 'provider_operation_audit\.safe_metadata'\)/.test(kernelSrc),
      'the kernel must run the application-side metadata guard before the audit RPC');

    // CB-004.2 — a SYSTEM operation must never ALSO carry a user permission. The
    // two facts are mutually exclusive: a permission describes what an interactive
    // actor may ask for, and a system operation has no interactive actor at all.
    // Giving one a permission is how "system-only" would quietly become reachable.
    const sysOps = Array.isArray(vocab && vocab.SYSTEM_OPERATIONS) ? vocab.SYSTEM_OPERATIONS : [];
    if (sysOps.length > 0) {
      const code = stripTsComments(kernelSrc);
      const withPermission = sysOps.filter((op) =>
        new RegExp(`'${op.replace(/\./g, '\\.')}'\\s*:\\s*'(connections|credentials|financial_data)\\.`).test(code));
      const notNull = sysOps.filter((op) =>
        !new RegExp(`'${op.replace(/\./g, '\\.')}'\\s*:\\s*null`).test(code));
      ok('CB-96p', withPermission.length === 0 && notNull.length === 0,
        `every system operation must map to NO user permission (null); carrying one: ${withPermission.join(', ') || '<none>'}; not null: ${notNull.join(', ') || '<none>'}`);
    }

    // CB-005B — exactly ONE operation may require a live credential, and it must
    // actually be enforced. Widening the list would silently make every listed
    // operation refuse to execute without a credential; emptying it would drop the
    // requirement while leaving the constant looking authoritative.
    const credListRaw = (kernelSrc.match(/OPERATIONS_REQUIRING_ACTIVE_CREDENTIAL\s*=\s*\[([^\]]*)\]/) || [])[1] || '';
    const credOps = (credListRaw.match(/'([a-z_.]+)'/g) || []).map((s) => s.replace(/'/g, ''));
    ok('CB-96q', credOps.length === 1 && credOps[0] === 'sync.execute'
      && /OPERATIONS_REQUIRING_ACTIVE_CREDENTIAL\.indexOf\(operation\)/.test(live),
      `exactly one operation may require an active credential (a job execution), and it must be enforced; declared ${JSON.stringify(credOps)}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CB-97 · scope discipline — freeze neutrality, no provider, no network
  // ══════════════════════════════════════════════════════════════════════════
  function checkScope(migSrc, kernelSrc) {
    const live = deployTimeSql(stripComments(migSrc));

    const begins = (live.match(/\bbegin\s*;/gi) || []).length;
    const commits = (live.match(/\bcommit\s*;/gi) || []).length;
    ok('CB-97a', begins === 1 && commits === 1,
      `CB-004 must be one committing transaction (begins=${begins}, commits=${commits})`);

    const twin = ['business_facts', 'business_fact_evidence', 'business_fact_conflicts']
      .filter((t) => new RegExp(`\\b${t}\\b`, 'i').test(stripComments(migSrc)) || kernelSrc.includes(t));
    ok('CB-97b', twin.length === 0,
      `CB-004 must touch no Digital Twin object and infer no financial truth — found ${twin.join(', ')}`);

    const vault = (stripComments(migSrc).match(/\b(vault\.|create_secret|decrypted_secrets|update_secret)\b/gi) || []);
    ok('CB-97c', vault.length === 0,
      `CB-004 must perform no Vault access of any kind — found ${vault.join(', ')}`);

    const net = [...stripComments(migSrc).matchAll(/\b(dblink|pg_net|http|https:\/\/|fetch)\b/gi)].map((m) => m[1]);
    ok('CB-97d', net.length === 0, `CB-004 must call no provider and no network — found ${net.join(', ')}`);

    ok('CB-97e', !/asServiceRole\.connectors|getConnection\s*\(\s*['"]supabase['"]/i.test(stripComments(migSrc) + kernelSrc),
      'the Base44 shared Supabase connector must never appear on the CB-004 path');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CB-98 · the certification must agree with the migration it certifies
  // ══════════════════════════════════════════════════════════════════════════
  function checkCertification(certSrc, migSrc) {
    const live = stripComments(certSrc);

    const declared = Number((certSrc.match(/returns ONE report: (\d+) rows/) || [])[1]);
    const first = (certSrc.match(/select '([A-Z])' id,/) || [])[1];
    const rest = [...certSrc.matchAll(/union all select '([A-Z])'/g)].map((m) => m[1]);
    const all = first ? [first, ...rest] : rest;
    ok('CB-98a', declared === CB4_CERT_IDS.length && all.length === CB4_CERT_IDS.length
      && new Set(all).size === all.length && CB4_CERT_IDS.every((id) => all.includes(id)),
      `certification row count/documentation drift: declared=${declared}, actual=${all.length}, expected=${CB4_CERT_IDS.length}`);

    const writes = live.match(/^\s*(insert|update|delete|alter|drop|create|grant|revoke|truncate)\b/gim) || [];
    ok('CB-98b', writes.length === 0, `the certification must be READ-ONLY — found: ${writes.join(', ')}`);

    // The proof must read the DEPLOYED definitions from catalogs, not the repo file.
    const catalogs = ['pg_constraint', 'pg_class', 'pg_proc', 'pg_get_functiondef', 'pg_get_constraintdef',
      'relrowsecurity', 'aclexplode', 'proargtypes', 'prosecdef', 'proconfig'];
    const missing = catalogs.filter((c) => !certSrc.includes(c));
    ok('CB-98c', missing.length === 0,
      `the certification must prove the deployed posture from catalogs — missing: ${missing.join(', ')}`);

    // The nine… the EIGHT effective privileges must each be probed, for each of
    // the three roles. The probe LIST is parsed from the artifact rather than
    // matched as a literal, so both the privilege set and the role set are
    // asserted structurally — dropping one turns this red either way.
    const privs = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'];
    const privBlock = (certSrc.match(/privs\(priv\)\s+as\s*\(\s*values([\s\S]*?)\n\)/) || [])[1] || '';
    const privTokens = (privBlock.match(/'([A-Z]+)'/g) || []).map((s) => s.replace(/'/g, ''));
    const roleBlock = (certSrc.match(/roles\(role_name\)\s+as\s*\(\s*values([\s\S]*?)\n\)/) || [])[1] || '';
    const roleTokens = (roleBlock.match(/'([a-z_]+)'/g) || []).map((s) => s.replace(/'/g, ''));
    ok('CB-98d', /has_table_privilege\(/.test(certSrc)
      && privTokens.length === privs.length && privs.every((p) => privTokens.includes(p))
      && roleTokens.length === 3 && ['service_role', 'anon', 'authenticated'].every((r) => roleTokens.includes(r)),
      `the certification must probe every one of the eight table privileges for all three roles; privileges=${JSON.stringify(privTokens)} roles=${JSON.stringify(roleTokens)}`);

    ok('CB-98e', /provider_operation_audit/.test(certSrc) && /provider_operation_audit_record/.test(certSrc),
      'the certification must name both the table and the writer');

    // The append-only claim must be tested against the DEPLOYED function body.
    ok('CB-98f', /pg_get_functiondef/.test(certSrc) && /update|delete/i.test(certSrc),
      'the certification must inspect the deployed writer for UPDATE/DELETE statements');

    ok('CB-98g', /business_facts/.test(certSrc) && /business_fact_evidence/.test(certSrc) && /business_fact_conflicts/.test(certSrc),
      'the certification must re-prove the Digital Twin freeze (facts, evidence, conflicts)');

    ok('CB-98h', /business_connections/.test(certSrc) && /provider_credentials/.test(certSrc),
      'the certification must re-prove the provider credential baseline');

    const sigTypes = fnArgTypes(migSrc);
    ok('CB-98i', certSrc.includes(`'${FN}(${sigTypes})'`) || certSrc.includes(sigTypes),
      'the certification must compare the writer against its ordered argument TYPES, derived from the migration');

    // Row-count and read-only discipline are asserted above; below: the verdict
    // grid must be a real case expression over real facts.
    const cases = (certSrc.match(/case when/g) || []).length;
    ok('CB-98j', cases >= 20, `the certification must emit a real verdict per row (found ${cases} CASE expressions)`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CB-99 · the adversarial suite: transactional, synthetic, non-enumerating
  // ══════════════════════════════════════════════════════════════════════════
  function checkAdversarial(advSrc) {
    const live = stripComments(advSrc);
    const stmts = live.split(';').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const rowReturning = stmts.filter((s) => /^select\b/i.test(s));

    const begins = (live.match(/\bbegin\s*;/gi) || []).length;
    const rollbacks = (live.match(/\brollback\s*;/gi) || []).length;
    const commits = (live.match(/\bcommit\s*;/gi) || []).length;
    ok('CB-99a', begins === 1 && rollbacks === 1 && commits === 0 && /^rollback$/i.test(stmts[stmts.length - 1]),
      `the adversarial suite must be ONE rollback-only transaction whose final statement is ROLLBACK (begins=${begins}, rollbacks=${rollbacks}, commits=${commits})`);

    ok('CB-99b', /cb004_adversarial_results/.test(rowReturning[rowReturning.length - 1] || '')
      && !/cb001_adversarial_results|cb002_adversarial_results|cb003_adversarial_results|cb0021_adversarial_results/.test(advSrc),
      'the verdict grid must be the last row-returning statement, and no earlier phase ledger may be reused');

    ok('CB-99c', advSrc.includes(RESERVED_NAMESPACE) && advSrc.includes(CORRELATION_PREFIX) && advSrc.includes(SYNTHETIC_MARKER),
      `the suite must use the reserved CB-004 namespace ${RESERVED_NAMESPACE}xx, its correlation prefix and the synthetic marker`);

    const realShapes = [/eyJ[A-Za-z0-9_-]{10,}/, /access-sandbox-/, /sandbox\.plaid\.com|production\.plaid\.com/,
      /quickbooks\.api\.intuit\.com/, /access_token\s*[=:]/, /refresh_token\s*[=:]/, /client_secret\s*[=:]/,
    ].filter((re) => re.test(advSrc));
    ok('CB-99d', realShapes.length === 0,
      `no real credential shape may appear anywhere in the suite — found ${realShapes.map(String).join(' ')}`);

    ok('CB-99e', /set local role anon;/.test(advSrc) && /set local role authenticated;/.test(advSrc)
      && /set local role service_role;/.test(advSrc) && /'SKIPPED'/.test(advSrc),
      "the suite must test EXECUTE denial by switching role, record service_role's positive capability, and report SKIPPED rather than a false PASS when a role cannot be assumed");

    // The DB-level cases must actually be attempted, not merely described.
    ok('CB-99f', /provider_operation_audit_record\(/.test(advSrc)
      && /insufficient_privilege/.test(advSrc),
      'the suite must invoke the writer across roles and prove the privilege refusals');

    ok('CB-99g', /provider_operation_audit_actor_identity_shape|provider_operation_audit_decision_reason_consistency|provider_operation_audit_unknown_operation_check/.test(advSrc)
      && /get stacked diagnostics/.test(advSrc),
      'the constraint backstops must be proven by naming the constraint that fired');

    const missing = CB4_GRID.filter((id) => !advSrc.includes(`'${id}'`));
    ok('CB-99h', missing.length === 0, `adversarial grid incomplete — missing ${missing.join(', ')}`);

    ok('CB-99i', /update\s+public\.provider_operation_audit/i.test(advSrc) && /delete\s+from\s+public\.provider_operation_audit/i.test(advSrc),
      'the suite must ATTEMPT an update and a delete on the audit trail and prove both are refused');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CB-100 · the residue companion
  // ══════════════════════════════════════════════════════════════════════════
  function checkResidue(resSrc) {
    const live = stripComments(resSrc);

    ok('CB-100a', (live.match(/\bselect\b/gi) || []).length >= 1
      && !/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate|begin|commit|rollback|do)\b/i.test(live),
      'the residue check must be READ-ONLY: no write, no DDL, no transaction, nothing to clean up');

    ok('CB-100b', /as residual_audit_rows/.test(resSrc) && /as residual_connections/.test(resSrc)
      && /as residual_vault_secrets/.test(resSrc) && /as cleanup_verdict/.test(resSrc),
      'the residue check must report residual_audit_rows, residual_connections, residual_vault_secrets and a cleanup_verdict');

    ok('CB-100c', resSrc.includes(CORRELATION_PREFIX) && resSrc.includes(RESERVED_NAMESPACE),
      'the residue check must key on BOTH residue shapes: the synthetic correlation prefix and the reserved connection namespace');

    ok('CB-100d', /then 'PASS'/.test(resSrc) && /else 'FAIL'/.test(resSrc)
      && /business_facts/.test(resSrc),
      'the verdict must be PASS only at zero residue, and must re-measure the Digital Twin freeze');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CB-106 · CB-004.2 — ONE additive operation, and nothing else
  //
  // The system vocabulary exists in FOUR places that must agree: the module
  // (SYSTEM_OPERATIONS), the audit table's operation CHECK, the writer's
  // re-validation of the closed domain, and the writer's system narrowing.
  // CB-004.2 adds one operation to all four. Each is parsed here, so an addition
  // that reaches only some of them is visible rather than silent.
  // ══════════════════════════════════════════════════════════════════════════
  function checkSystemExecutionOperation(vocab, src) {
    const mig42 = src.mig42 || '';
    const live = stripComments(mig42);
    const body = fnBlock(src.mig) || '';
    const body42 = fnBlock(mig42) || '';

    // (a) the table CHECK admits exactly the module vocabulary, plus the outlier
    const ops = sqlList(src.mig, 'provider_operation_audit_operation_check');
    const ops42 = sqlList(mig42, 'provider_operation_audit_operation_check');
    ok('CB-106a', Array.isArray(ops42)
      && ops42.length === vocab.PROVIDER_OPERATIONS.length
      && vocab.PROVIDER_OPERATIONS.every((o) => ops42.includes(o))
      && !ops42.includes(vocab.AUDIT_UNKNOWN_OPERATION)
      && /or operation = 'unknown'/.test(live),
      `the CB-004.2 CHECK must admit exactly the ${vocab.PROVIDER_OPERATIONS.length}-operation module vocabulary plus the separate '${vocab.AUDIT_UNKNOWN_OPERATION}' disjunct; found ${JSON.stringify(ops42)}`);

    ok('CB-106b', Array.isArray(ops) && Array.isArray(ops42)
      && ops.every((o) => ops42.includes(o)) && ops.length === ops42.length - 1,
      `every operation admitted by the applied CB-004 CHECK must survive in CB-004.2 — an addition may never drop a value; cb004=${JSON.stringify(ops)}`);

    // (b) the writer's OWN copy of the closed domain — the copy that refuses an
    //     operation before the table CHECK is ever consulted, and without which a
    //     legitimate system ALLOW would be unrecordable and therefore impossible
    const writerOps = ((body42.match(/p_operation <> 'unknown' and p_operation not in \(([^)]*)\)/) || [])[1] || '');
    const writerOpsList = (writerOps.match(/'([a-z_.]+)'/g) || []).map((s) => s.replace(/'/g, ''));
    ok('CB-106c', writerOpsList.length === vocab.PROVIDER_OPERATIONS.length
      && vocab.PROVIDER_OPERATIONS.every((o) => writerOpsList.includes(o)),
      `the replaced writer must re-validate the SAME closed domain; found ${JSON.stringify(writerOpsList)}`);

    const narrow = parseNarrow(body42);
    ok('CB-106d', Array.isArray(narrow) && narrow.length === vocab.SYSTEM_OPERATIONS.length
      && vocab.SYSTEM_OPERATIONS.every((o) => narrow.includes(o)),
      `the replaced writer's system narrowing must be exactly SYSTEM_OPERATIONS; sql=${JSON.stringify(narrow)} module=${JSON.stringify([...vocab.SYSTEM_OPERATIONS])}`);

    // (c) identity and posture survive the replacement
    ok('CB-106e', /\bsecurity definer\b/.test(body42)
      && body42.includes('set search_path = pg_catalog, public')
      && live.includes(`alter function ${FN}(${FN_SIG}) owner to postgres;`),
      'the replaced writer must stay SECURITY DEFINER, search_path-pinned and owner-pinned to postgres — a SECURITY DEFINER function runs as its OWNER');

    const revokeMissing = ['public', 'anon', 'authenticated', 'service_role']
      .filter((r) => !live.includes(`revoke all on function ${FN}(${FN_SIG}) from ${r};`));
    const fnRev42 = live.indexOf(`revoke all on function ${FN}(${FN_SIG}) from service_role;`);
    const fnGr42 = live.indexOf(`grant execute on function ${FN}(${FN_SIG}) to service_role;`);
    ok('CB-106f', revokeMissing.length === 0 && fnGr42 !== -1 && fnRev42 !== -1 && fnRev42 < fnGr42,
      `the replacement must re-assert the certified ACL — REVOKE for PUBLIC, anon, authenticated and service_role, then GRANT to service_role only; missing: ${revokeMissing.join(', ') || '<none>'}`);

    ok('CB-106g', !/grant\s+execute\b[^;]*\bto\s+(PUBLIC|anon|authenticated)\b/i.test(live)
      && !/grant[^;]*\bon table\b/i.test(live)
      && !/create policy/i.test(live),
      'CB-004.2 must WIDEN no privilege: no browser EXECUTE, no table grant, no RLS policy');

    // (d) NO GUARD LOST — the replacement is compared to the artifact it replaces,
    //     so a dropped validation is a failing check rather than a silent change
    const guards = (b) => [...b.matchAll(/raise exception '([^']+)'/g)].map((m) => m[1]);
    const g0 = guards(body);
    const g1 = guards(body42);
    ok('CB-106h', g0.length > 0 && g0.length === g1.length && g0.every((g) => g1.includes(g)),
      `the replaced writer must contain EVERY guard of the artifact it replaces (cb004=${g0.length}, cb0042=${g1.length})`);

    // (e) scope: ONE committing transaction, one constraint swap, one replacement
    const begins = (live.match(/\bbegin\s*;/gi) || []).length;
    const commits = (live.match(/\bcommit\s*;/gi) || []).length;
    const rollbacks = (live.match(/\brollback\s*;/gi) || []).length;
    const forbidden = [
      /\bcreate\s+(table|view|materialized\s+view|sequence|schema|type|trigger|policy|extension|rule)\b/i,
      /\bcreate\s+(unique\s+)?index\b/i,
      /\balter\s+default\s+privileges\b/i,
      /\binsert\s+into\b/i,
      /\bdelete\s+from\b/i,
      /\bupdate\s+public\./i,
      /\bvault\b/i,
      /\b(dblink|pg_net|http|https:\/\/|fetch)\b/i,
      /\b(business_facts|business_fact_evidence|business_fact_conflicts)\b/i,
      /\bprovider_sync_jobs\b/i,
      /\bprovider_observations\b/i,
      /\bprovider_sync_checkpoints\b/i,
      /\blive_sync_actions\b/i,
    // The writer's body is BLANKED for this scan: its one legitimate INSERT is the
    // audit append itself, asserted separately below. What must not appear is a
    // deploy-time write to any table, or any object created outside the swap.
    ].filter((re) => re.test(deployTimeSql(live)));
    ok('CB-106i', begins === 1 && commits === 1 && rollbacks === 0 && forbidden.length === 0,
      `CB-004.2 must be ONE committing transaction that creates no object, writes no row and touches no Vault, provider, Digital Twin or CB-005B object — begins=${begins}, commits=${commits}, forbidden=${forbidden.map(String).join(' ')}`);

    const fns = [...live.matchAll(/create or replace function public\.([a-z_]+)\s*\(/g)].map((m) => m[1]);
    ok('CB-106j', fns.length === 1 && fns[0] === 'provider_operation_audit_record',
      `CB-004.2 must replace exactly ONE function — the audit writer — and create none; found ${JSON.stringify(fns)}`);

    const alters = (live.match(/^\s*alter (table|function)\b[^;]*;/gim) || []).map((s) => s.replace(/\s+/g, ' ').trim());
    const alterText = alters.join(' | ');
    ok('CB-106k', alters.length === 3
      && alterText.includes(`alter table ${TABLE} drop constraint if exists provider_operation_audit_operation_check;`)
      && alterText.includes(`alter table ${TABLE} add constraint provider_operation_audit_operation_check`)
      && alterText.includes(`alter function ${FN}(${FN_SIG}) owner to postgres;`),
      `the only ALTER statements may be the constraint swap and the owner pin; found ${JSON.stringify(alters)}`);

    // (f) the replacement's own write discipline: append-only, exactly as before
    const bodyInserts = (body42.match(new RegExp(`insert into ${TABLE}`, 'g')) || []).length;
    ok('CB-106l', bodyInserts === 1
      && !new RegExp(`update\\s+${TABLE}`, 'i').test(body42)
      && !new RegExp(`delete\\s+from\\s+${TABLE}`, 'i').test(body42)
      && !/\btruncate\b/i.test(body42),
      `the replaced writer must remain APPEND-ONLY — exactly one insert into the audit table, no update, no delete, no truncate; found ${bodyInserts} insert(s)`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  async function run(vocab, src) {
    checkPresence(vocab, src);
    checkObjectScope(src.mig);
    checkTableShape(src.mig);
    checkVocabularyDrift(src.mig, vocab, src.mig42);
    checkRecordShape(src.mig);
    checkAuditAcl(src.mig);
    checkWriter(src.mig, vocab, src.mig42);
    checkMetadataGuard(src.mig, vocab);
    checkKernelSource(src.kernel, vocab);
    checkSystemExecutionOperation(vocab, src);
    checkScope(src.mig, src.kernel);
    checkCertification(src.cert, src.mig);
    checkAdversarial(src.adv);
    checkResidue(src.res);
    await runBehavior(vocab, src.kernel, ok);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MU4-series — every CB-004 check must FAIL on the way it can break.
  // Mutations are applied IN MEMORY ONLY: no artifact on disk is ever written.
  // ══════════════════════════════════════════════════════════════════════════
  async function mutation(vocab, src) {
    const undetected = [];
    const red = (fn, mutated) =>
      collect(() => fn(mutated)).some((f) => /^CB-(8[89]|9\d|10\d)/.test(f));
    // The behavioural collector cannot use `collect` (which swaps the harness's
    // failure list synchronously): the kernel is async, so the swap would be
    // restored before the first await resolves. It injects its own `emit` instead.
    const redBehaviour = async (mutated) => {
      const out = [];
      await runBehavior(vocab, mutated, (id, cond, detail) => {
        if (!cond) out.push(`${id} — ${detail}`);
        return !!cond;
      });
      return out.some((f) => /^CB-105|^CB-104/.test(f));
    };

    // A mutation that silently fails to APPLY is indistinguishable from one the
    // harness failed to detect — so each mutation asserts its own target exists.
    const apply = (source, from, to) => {
      const out = source.replace(from, to);
      if (out === source) throw new Error(`mutation target not found: ${String(from).slice(0, 70)}`);
      return out;
    };

    const cases = [
      ['MU4-1', 'a request business_id is allowed to redirect a row-derived resource',
        () => redBehaviour(apply(src.kernel, 'if (requestBusinessId && rowBusiness && requestBusinessId !== rowBusiness) {', 'if (false) {'))],
      ['MU4-2', 'authorizeBusinessAccess is skipped and access is assumed',
        () => redBehaviour(apply(src.kernel, 'await authorizeBusinessAccess(sb, actor, derivedBusiness);\n      businessAccessGranted = true;', 'businessAccessGranted = true;'))],
      ['MU4-3', 'an arbitrary operation string becomes valid',
        () => redBehaviour(apply(src.kernel, 'if (!isProviderOperation(operation)) return denyWith(', 'if (false) return denyWith('))],
      ['MU4-4', 'a caller-supplied actor is accepted instead of the session actor',
        () => redBehaviour(apply(src.kernel, 'export type ProviderOperationInput = { sb: any;', 'export type ProviderOperationInput = { sb: any; actor: any;'))],
      ['MU4-5', 'the kernel resolves a credential itself (capability before authorization)',
        () => red((k) => checkKernelSource(k), src.kernel + "\nawait sb.rpc('provider_credential_resolve', {});\n")],
      ['MU4-6', 'the OAuth attempt is consumed inside the kernel (consume before reauthorization)',
        () => red((k) => checkKernelSource(k), src.kernel + "\nawait sb.rpc('provider_authorization_attempt_consume', {});\n")],
      ['MU4-7', 'the connection-state check is skipped, so a dead connection executes',
        () => redBehaviour(apply(src.kernel, "if (OPERATIONS_REQUIRING_USABLE_CONNECTION.indexOf(operation) > -1) {", 'if (false) {'))],
      ['MU4-8', 'service_role capability is treated as authorization for a system path',
        () => redBehaviour(apply(src.kernel, "if (!state.systemContext || state.systemContext.authenticity !== 'verified') {", 'if (false) {'))],
      ['MU4-9', 'a user operation is permitted for a system actor (system becomes broader)',
        () => redBehaviour(apply(src.kernel, 'if (operationActorKind(operation) !== actorKind) return denyWith(', 'if (false) return denyWith('))],
      ['MU4-10', 'the non-enumeration mapping is relaxed, so a probe learns a foreign resource exists',
        () => redBehaviour(apply(src.kernel, "if (resolved && reasonCode === 'BUSINESS_ACCESS_DENIED') {\n    return { code: 'RESOURCE_UNAVAILABLE', status: 404 };\n  }", ''))],
      ['MU4-11', 'a denial starts returning a resolved context',
        () => redBehaviour(apply(src.kernel, 'context: executable', 'context: true'))],
      ['MU4-12', 'the internal reason code is returned to the caller',
        () => red((k) => checkKernelSource(k), apply(src.kernel, 'client_code: client.code,', 'client_code: reason,'))],
      ['MU4-13', 'a team member is granted credential management',
        () => redBehaviour(apply(src.kernel, "'credentials.manage': ['OWNER', 'ASSIGNED_ADVISOR', 'ADVISOR', 'PLATFORM_ADMIN'],", "'credentials.manage': ['OWNER', 'ASSIGNED_ADVISOR', 'ADVISOR', 'PLATFORM_ADMIN', 'TEAM_MEMBER'],"))],
      ['MU4-14', 'the kernel starts QUERYING the canonical business rule itself',
        () => red((k) => checkKernelSource(k), src.kernel + "\nconst y = await sb.from('business_owners').select('id');\n")],
      ['MU4-15', 'a browser role is granted EXECUTE on the writer',
        () => red((m) => checkWriter(m, vocab), src.mig + `\ngrant execute on function ${FN}(${FN_SIG}) to authenticated;\n`)],
      ['MU4-16', 'audit UPDATE/DELETE is granted to service_role',
        () => red((m) => checkAuditAcl(m), src.mig + `\ngrant update, delete on table ${TABLE} to service_role;\n`)],
      ['MU4-17', 'the audit INSERT is granted directly, bypassing the validating writer',
        () => red((m) => checkAuditAcl(m), src.mig + `\ngrant insert on table ${TABLE} to service_role;\n`)],
      ['MU4-18', 'the explicit service_role REVOKE is dropped (pg_default_acl survives)',
        () => red((m) => checkAuditAcl(m), apply(src.mig, `revoke all on table ${TABLE} from service_role;`, ''))],
      ['MU4-19', 'the decision/reason consistency CHECK is removed',
        () => red((m) => checkRecordShape(m), src.mig.replace(/\n  constraint provider_operation_audit_decision_reason_consistency[\s\S]*?,\n/, '\n'))],
      ['MU4-20', 'the actor identity shape CHECK is removed',
        () => red((m) => checkRecordShape(m), src.mig.replace(/\n  constraint provider_operation_audit_actor_identity_shape[\s\S]*?\n    \),/, ''))],
      ['MU4-21', 'the recursive metadata walk is replaced by a top-level-only check',
        () => red((m) => checkMetadataGuard(m, vocab), src.mig.replace(/with recursive containers\(depth, node\) as \(/, 'with containers(depth, node) as ('))],
      ['MU4-22', 'the CASE selection is removed, so a scalar node makes the guard raise',
        () => red((m) => checkMetadataGuard(m, vocab), src.mig.replace(/jsonb_each\(case when jsonb_typeof\(c\.node\) = 'object' then c\.node else '\{\}'::jsonb end\)/g, 'jsonb_each(c.node)'))],
      ['MU4-23', 'the database metadata denial is weakened to a strip',
        () => red((m) => checkMetadataGuard(m, vocab), apply(src.mig, 'credential-shaped metadata key rejected', 'credential-shaped metadata key noted'))],
      ['MU4-24', 'the system narrowing is dropped from the writer',
        () => red((m) => checkWriter(m, vocab), apply(src.mig, "and p_operation not in ('credential.resolve', 'webhook.process')", 'and true'))],
      ['MU4-25', 'the writer becomes SECURITY INVOKER',
        () => red((m) => checkWriter(m, vocab), apply(src.mig, 'language plpgsql\nsecurity definer', 'language plpgsql\nsecurity invoker'))],
      ['MU4-26', 'the writer gains a second write (append-only broken inside the body)',
        () => red((m) => checkWriter(m, vocab), src.mig.replace('  returning id into v_id;', `  delete from ${TABLE} where reason_code = 'AUTHORIZED';\n  returning id into v_id;`))],
      ['MU4-27', 'the writer search_path pin is removed',
        () => red((m) => checkWriter(m, vocab), apply(src.mig, '\nset search_path = pg_catalog, public\n', '\n'))],
      ['MU4-28', 'RLS is no longer enabled explicitly',
        () => red((m) => checkAuditAcl(m), apply(src.mig, `alter table ${TABLE} enable row level security;`, ''))],
      ['MU4-29', 'a Vault read is smuggled into the kernel',
        () => red((k) => checkKernelSource(k), src.kernel + "\nconst y = 'vault.decrypted_secrets';\n")],
      ['MU4-30', 'the audit failure is swallowed, so an unrecordable authorization proceeds',
        () => red((k) => checkKernelSource(k), apply(src.kernel, 'throw new Error(`provider_operation_audit_record failed: ${error.message}`);', 'return null;'))],
      ['MU4-31', 'a Digital Twin statement is smuggled into the migration',
        () => red((m) => checkScope(m, src.kernel), src.mig + '\ninsert into public.business_facts (id) values (gen_random_uuid());\n')],
      ['MU4-32', 'a real provider credential shape appears in the adversarial suite',
        () => red((a) => checkAdversarial(a), src.adv + "\n-- access_token = 'eyJhbGciOiJIUzI1NiJ9AAAAAAAA'\n")],
      ['MU4-33', 'the adversarial rollback is removed, so synthetic rows would persist',
        () => red((a) => checkAdversarial(a), apply(src.adv, /^rollback;$/m, ''))],
      ['MU4-34', 'the residue verdict is hollowed out so it can never FAIL',
        () => red((r) => checkResidue(r), apply(src.res, "else 'FAIL'", "else 'PASS'"))],
      ['MU4-35', 'the certification stops probing a privilege',
        () => red((c) => checkCertification(c, src.mig), src.cert.replace(/'MAINTAIN'/g, "''"))],
      ['MU4-36', 'the certification claims a stale row count',
        () => red((c) => checkCertification(c, src.mig), apply(src.cert, /returns ONE report: \d+ rows/, 'returns ONE report: 99 rows'))],
    ];

    // ── MU42-series · CB-004.2 — the additive operation, and every way it can rot
    //
    // The vocabulary module is a compiled artifact, so a mutation of its TEXT must
    // be re-transpiled to have any effect: editing a copy of the loaded object
    // would change nothing, because `operationActorKind` closes over its module's
    // own constant. A mutation that cannot actually apply is worse than no
    // mutation, so the loader below is used for exactly that.
    const loadVocab = (source) => {
      const { transformSync } = require('esbuild');
      const out = transformSync(source, { loader: 'ts', format: 'cjs', target: 'node18' });
      const mod = { exports: {} };
      // eslint-disable-next-line no-new-func
      new Function('exports', 'module', 'require', out.code)(mod.exports, mod, require);
      return mod.exports;
    };
    const redWithVocab = async (mutatedVocab, kernelSrc) => {
      const out = [];
      await runBehavior(mutatedVocab, kernelSrc, (id, cond, detail) => {
        if (!cond) out.push(`${id} — ${detail}`);
        return !!cond;
      });
      return out.some((f) => /^CB-10[457]/.test(f));
    };
    const ACTOR_KIND_GUARD = 'if (operationActorKind(operation) !== actorKind) return denyWith(';

    const cases42 = [
      ['MU42-1', 'sync.execute is dropped from SYSTEM_OPERATIONS (the SQL keeps it)',
        () => redWithVocab(loadVocab(apply(src.vocab,
          "export const SYSTEM_OPERATIONS = ['credential.resolve', 'webhook.process', 'sync.execute'] as const;",
          "export const SYSTEM_OPERATIONS = ['credential.resolve', 'webhook.process'] as const;")), src.kernel)],
      ['MU42-2', 'a user actor is allowed to execute sync.execute',
        () => redBehaviour(apply(src.kernel, ACTOR_KIND_GUARD, 'if (false) return denyWith('))],
      ['MU42-3', 'a system actor is allowed to execute a provider read',
        () => redBehaviour(apply(src.kernel, ACTOR_KIND_GUARD, 'if (false) return denyWith('))],
      ['MU42-4', 'the verified system-context requirement is removed',
        () => redBehaviour(apply(src.kernel, "if (!state.systemContext || state.systemContext.authenticity !== 'verified') {", 'if (false) {'))],
      ['MU42-5', 'the connection requirement is removed',
        () => redBehaviour(apply(src.kernel, 'const needsConnection = OPERATIONS_REQUIRING_CONNECTION.indexOf(operation) > -1;', 'const needsConnection = false;'))],
      ['MU42-6', 'the usable-connection requirement is removed',
        () => redBehaviour(apply(src.kernel, 'if (OPERATIONS_REQUIRING_USABLE_CONNECTION.indexOf(operation) > -1) {', 'if (false) {'))],
      ['MU42-7', 'an arbitrary resource type becomes acceptable for a job execution',
        () => redBehaviour(apply(src.kernel, 'if (state.resourceType !== JOB_RESOURCE_TYPE || !isUsableId(state.resourceId)) {', 'if (false) {'))],
      ['MU42-8', 'the request/row business contradiction is ignored',
        () => redBehaviour(apply(src.kernel, 'if (requestBusinessId && rowBusiness && requestBusinessId !== rowBusiness) {', 'if (false) {'))],
      ['MU42-9', 'sync.execute is given a user permission',
        () => red((k) => checkKernelSource(k, vocab), apply(src.kernel, "'sync.execute': null,", "'sync.execute': 'financial_data.sync',"))],
      ['MU42-10', 'an existing operation is reclassified as system-kind',
        () => redWithVocab(loadVocab(apply(src.vocab,
          "['credential.resolve', 'webhook.process', 'sync.execute'] as const",
          "['credential.resolve', 'webhook.process', 'sync.execute', 'transactions.read'] as const")), src.kernel)],
      // ── MU5B-series · CB-005B — the credential precondition for a job execution
      ['MU42-11', 'the credential precondition is dropped from the evaluator, so a job runs without a live credential',
        () => redBehaviour(apply(src.kernel, 'if (OPERATIONS_REQUIRING_ACTIVE_CREDENTIAL.indexOf(operation) > -1) {', 'if (false) {'))],
      ['MU42-12', 'the credential precondition is declared but no longer enforced by name',
        () => red((k) => checkKernelSource(k, vocab), apply(src.kernel,
          'export const OPERATIONS_REQUIRING_ACTIVE_CREDENTIAL = [',
          'export const OPERATIONS_REQUIRING_ACTIVE_CREDENTIAL_DISABLED = ['))],
      ['MU42-13', 'the credential precondition is widened to every operation',
        () => red((k) => checkKernelSource(k, vocab), apply(src.kernel,
          "export const OPERATIONS_REQUIRING_ACTIVE_CREDENTIAL = ['sync.execute'];",
          "export const OPERATIONS_REQUIRING_ACTIVE_CREDENTIAL = ['sync.execute', 'transactions.read'];\n"))],
      ['MU42-14', 'a credential from another connection is accepted for this connection',
        () => redBehaviour(apply(src.kernel,
          'if (connection && isUsableId(credential.business_connection_id)\n      && credential.business_connection_id !== connection.id) {',
          'if (false) {'))],
    ];
    cases.push(...cases42);

    for (const [id, why, detect] of cases) {
      let detected = false;
      try { detected = await detect(); } catch (e) { detected = false; }
      if (!detected) undetected.push(`${id} (${why})`);
    }
    ok('MU4', undetected.length === 0, `CB-004 mutations NOT detected: ${undetected.join('; ')}`);
  }

  return { run, mutation };
};