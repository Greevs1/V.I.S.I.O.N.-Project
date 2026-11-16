/**
 * CONNECTED BUSINESS — CB-005B PROVIDER EXECUTION FOUNDATION CHECKS
 *
 * Extracted from scripts/connectedBusinessFoundation.test.cjs so the harness stays
 * editable; the harness requires this module and calls run() + mutation(). Every
 * check is additive — nothing here weakens a CB-001 … CB-004.2 check.
 *
 * WHAT THIS PROVES, AND HOW
 *
 *   1. STRUCTURAL — the migration is read and its contracts are parsed: the three
 *      tables, the seven functions, the fence predicates, the claim predicate, the
 *      dedup key expression, the checkpoint compare-and-swap, the ACLs, and the
 *      correspondence between the shipped policy constants and the database bounds.
 *
 *   2. BEHAVIOURAL — the REAL shipped modules (executionPolicy, jobStateMachine,
 *      observationIdentity, checkpointPolicy, systemContext, jobRepository,
 *      workerExecutor) and the REAL certification kernel are transpiled with esbuild
 *      and EXECUTED against an in-process model of the SQL contracts. Concurrency,
 *      lease expiry, recovery, fencing, deduplication, cursor compare-and-swap,
 *      rollback and retry exhaustion are therefore observed, not asserted.
 *
 * WHAT THE MODEL IS, AND WHAT IT IS NOT
 *   The model is NOT the database. It is a faithful executable statement of the rules
 *   the SQL declares, and the static checks below assert that the SQL really declares
 *   them — so a model that drifts from the migration turns the structural checks red.
 *   Deployed behaviour remains the _verification.sql probe file's job, and CB-005B is
 *   NOT production certified by any of this.
 *
 * The module is pure: it reads strings, executes modules in-process, calls the
 * supplied `ok`, and uses the supplied `collect` for mutation isolation.
 */
// The hardening group lives in its own module: lock doctrine, install posture, the
// authorization boundary and the report's own contract are a review surface of their
// own, and keeping them out of this file leaves room for the model and the mutations.
const { createHardeningChecks, hardeningBehaviouralTests } = require('./cb005bHardeningChecks.cjs');

module.exports = function createCb5bChecks({ ok, stripComments, collect }) {
  const TABLES = ['provider_sync_jobs', 'provider_sync_checkpoints', 'provider_observations'];
  const FUNCTIONS = [
    'provider_sync_job_enqueue', 'provider_sync_job_claim', 'provider_sync_job_renew_lease',
    'provider_sync_job_complete', 'provider_sync_job_sweep', 'provider_sync_job_authorize',
    'provider_sync_observation_ingest',
  ];
  // The signatures, in the order the functions declare them. Used for the ACL and
  // owner checks, so a signature change is a visible failure rather than a silent
  // "revoke matched nothing".
  const SIGNATURES = {
    provider_sync_job_enqueue: 'uuid, uuid, uuid, text, text, integer, integer, integer',
    provider_sync_job_claim: 'text, integer, integer',
    provider_sync_job_renew_lease: 'uuid, uuid, uuid, text, integer',
    provider_sync_job_complete: 'uuid, uuid, uuid, text, text, text, text, text, integer',
    provider_sync_job_sweep: 'integer',
    provider_sync_job_authorize: 'uuid, uuid, uuid, text',
    provider_sync_observation_ingest: 'uuid, uuid, uuid, text, jsonb, jsonb',
  };
  const LEASE_BOUNDS = { min: 30, max: 900 };
  const CLAIM_BOUNDS = { min: 1, max: 5 };
  const ATTEMPT_BOUNDS = { min: 1, max: 10 };
  const ATTEMPT_SECONDS_BOUNDS = { min: 30, max: 3600 };
  const BATCH_OBSERVATIONS = 500;
  const PAYLOAD_BYTES = 16384;
  const BATCH_BYTES = 2097152;
  const BACKOFF_MAX = 900;
  const SWEEP_BOUNDS = { min: 1, max: 500 };

  const live = (src) => stripComments(src || '');
  /** Deploy-time statements only: function bodies blanked. */
  const deployTime = (src) => src.replace(/\$\$[\s\S]*?\$\$/g, '$$BODY$$');
  const bodyOf = (src, name) => {
    const start = (src || '').indexOf(`create or replace function public.${name}(`);
    if (start < 0) return '';
    const end = src.indexOf('$$;', start);
    return end < 0 ? '' : src.slice(start, end + 3);
  };
  const loadTs = (source, resolver) => {
    const { transformSync } = require('esbuild');
    const out = transformSync(source, { loader: 'ts', format: 'cjs', target: 'node18' });
    const mod = { exports: {} };
    // eslint-disable-next-line no-new-func
    new Function('exports', 'module', 'require', out.code)(mod.exports, mod, resolver || require);
    return mod.exports;
  };

  // ══════════════════════════════════════════════════════════════════════════
  // THE EXECUTABLE WORLD — the shipped modules, wired to a model of the SQL
  // ══════════════════════════════════════════════════════════════════════════
  const BIZ_A = '00000000-0000-0000-0000-0000000005a1';
  const BIZ_B = '00000000-0000-0000-0000-0000000005b1';
  const CONN_A = '00000000-0000-0000-0000-000000000501';
  const CONN_B = '00000000-0000-0000-0000-000000000502';
  const CONN_DEAD = '00000000-0000-0000-0000-000000000503';
  const CRED_A = '00000000-0000-0000-0000-0000000005c1';
  const CRED_OTHER_CONNECTION = '00000000-0000-0000-0000-0000000005c2';
  const JOB_A = '00000000-0000-0000-0000-0000000005j1'.replace('j', '0');
  const SECRET_MARKER = 'vision_test_cb005b_plaintext_must_not_appear';
  /**
   * The shipped modules the model stands in for. Assigned ONCE per loaded runner,
   * BEFORE any world is created, so a world can never run its first RPC without the
   * predicate and vocabularies it must consult — the ordering is structural rather
   * than a convention.
   */
  let RUNNER_API = { state: null, identity: null };

  /**
   * The model. Every mutation re-validates the row against the shipped
   * rowShapeViolations(), so the model can never hold a state the real table would
   * reject — a fixture the database would refuse proves nothing.
   */
  function createWorld(options = {}) {
    const state = {
      api: RUNNER_API,
      now: 1_800_000_000_000,
      jobs: [],
      checkpoints: [],
      observations: [],
      audit: [],
      adapterCalls: 0,
      completeCalls: 0,
      renewCalls: 0,
      claimCalls: 0,
      credentialResolutions: 0,
      factWrites: 0,
      seq: 1,
    };
    const uuid = () => {
      const n = String(state.seq++).padStart(12, '0');
      return `00000000-0000-4000-8000-${n}`;
    };
    const iso = (ms) => new Date(ms).toISOString();
    const nowIso = () => iso(state.now);
    const tick = (ms) => { state.now += ms; };

    state.jobs.push({
      id: JOB_A,
      business_id: BIZ_A,
      business_connection_id: CONN_A,
      credential_id: CRED_A,
      credential_type: 'quickbooks_refresh',
      provider: 'quickbooks',
      provider_operation: 'transactions.read',
      status: 'queued',
      priority: 100,
      attempt_count: options.attemptCount || 0,
      max_attempts: options.maxAttempts || 5,
      max_attempt_seconds: options.maxAttemptSeconds || 600,
      attempt_id: null,
      attempt_started_at: null,
      claimed_by: null,
      claimed_at: null,
      lease_id: null,
      lease_expires_at: null,
      lease_renewal_count: 0,
      next_attempt_at: nowIso(),
      last_error_class: null,
      last_error_code: null,
      last_error_message: null,
      completed_at: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    });
    if (options.siblingJob) {
      // A SECOND live job on the SAME business and connection, different operation:
      // the case the cross-job serialization exists for (the dedup key names neither).
      state.jobs.push({ ...state.jobs[0], id: '00000000-0000-4000-8000-0000000005f3', provider_operation: 'accounts.read' });
    }
    if (options.forgeSecondJob) {
      state.jobs.push({ ...state.jobs[0], id: '00000000-0000-4000-8000-0000000005f2', business_id: BIZ_B, business_connection_id: CONN_B });
    }

    const connections = [
      { id: CONN_A, business_id: BIZ_A, provider: 'quickbooks', status: options.connectionStatus || 'active' },
      { id: CONN_B, business_id: BIZ_B, provider: 'quickbooks', status: 'active' },
      { id: CONN_DEAD, business_id: BIZ_A, provider: 'plaid', status: 'needs_attention' },
    ];
    const credentials = [
      {
        id: CRED_A,
        business_id: BIZ_A,
        business_connection_id: options.credentialConnection || CONN_A,
        credential_type: 'quickbooks_refresh',
        status: options.credentialStatus || 'active',
        superseded_by_credential_id: null,
        expires_at: null,
      },
      {
        id: CRED_OTHER_CONNECTION,
        business_id: BIZ_A,
        business_connection_id: CONN_B,
        credential_type: 'quickbooks_refresh',
        status: 'active',
        superseded_by_credential_id: null,
        expires_at: null,
      },
    ];

    const findJob = (id) => state.jobs.find((j) => j.id === id) || null;
    // `laxLease` is a MUTATION-ONLY override: it models a database whose lease
    // enforcement has been removed, so the behavioural suite can be proven able to
    // fail. Nothing in the product path can reach it.
    const leaseExpired = (j) => !options.laxLease && Date.parse(j.lease_expires_at) <= state.now;
    // The attempt's ABSOLUTE deadline, mirrored from the table: attempt_started_at +
    // max_attempt_seconds. `laxDeadline` is a MUTATION-ONLY override modelling a database
    // that still CAPS every lease at the deadline but stopped REFUSING an attempt once the
    // deadline had passed — the exact defect this correction closes. Nothing in the
    // product path can reach it.
    const attemptDeadline = (j) => Date.parse(j.attempt_started_at) + j.max_attempt_seconds * 1000;
    const deadlinePassed = (j) => !options.laxDeadline && attemptDeadline(j) <= state.now;
    const auditVocabulary = {
      operations: null, reasonCodes: null, decisions: ['allow', 'deny'], resourceTypes: null,
    };

    function checkRowShape(row) {
      const violations = state.api.state.rowShapeViolations(row);
      if (violations.length > 0) throw new Error(`model produced an impossible job row: ${violations.join(', ')}`);
    }

    function makeQuery(table, opts) {
      const filters = [];
      const q = {
        _limit: null,
        _order: null,
        _count: false,
        _head: false,
        select(_cols, o) { q._count = !!(o && o.count === 'exact'); q._head = !!(o && o.head === true); return q; },
        eq(col, val) { filters.push([col, val]); return q; },
        order(col, o) { q._order = [col, o && o.ascending === false ? -1 : 1]; return q; },
        limit(n) { q._limit = n; return q; },
        _rows() {
          let rows = (opts.rows[table] || []).filter((r) => filters.every(([c, v]) => r[c] === v));
          if (q._order) {
            const [col, dir] = q._order;
            rows = rows.slice().sort((a, b) => (String(a[col]) < String(b[col]) ? -dir : String(a[col]) > String(b[col]) ? dir : 0));
          }
          if (q._limit !== null) rows = rows.slice(0, q._limit);
          return rows;
        },
        maybeSingle() {
          const rows = q._rows();
          return Promise.resolve({ data: q._head ? null : (rows[0] || null), count: null, error: null });
        },
        then(resolve, reject) {
          try {
            const rows = q._rows();
            resolve({ data: q._head ? null : rows, count: q._count || q._head ? rows.length : null, error: null });
          } catch (e) { reject(e); }
        },
      };
      return q;
    }

    function makeSb() {
      return {
        from(table) {
          if (/business_fact/.test(table)) {
            state.factWrites += 1;
            throw new Error(`CB-005B must never touch ${table}`);
          }
          const rows = {
            provider_sync_jobs: state.jobs,
            provider_sync_checkpoints: state.checkpoints,
            provider_observations: state.observations,
            business_connections: connections,
            provider_credentials: credentials,
            provider_authorization_attempts: [],
            profiles: [],
          };
          return makeQuery(table, { rows });
        },
        rpc(name, args) {
          return Promise.resolve(dispatchRpc(name, args));
        },
      };
    }

    /** The SQL contracts, as executed rules. */
    function dispatchRpc(name, args) {
      const a = args || {};
      switch (name) {
        case 'provider_operation_audit_record': {
          const v = auditVocabulary;
          if (!v.decisions.includes(a.p_decision)) throw new Error('audit: decision outside the vocabulary');
          if (a.p_reason_code && v.reasonCodes && !v.reasonCodes.includes(a.p_reason_code)) {
            throw new Error(`audit: reason_code ${a.p_reason_code} outside the vocabulary`);
          }
          if (a.p_operation && a.p_operation !== 'unknown' && v.operations && !v.operations.includes(a.p_operation)) {
            throw new Error(`audit: operation ${a.p_operation} outside the vocabulary`);
          }
          if (a.p_decision === 'allow' && !a.p_provider) throw new Error('audit: an allow must record a provider');
          if (a.p_actor_kind === 'system' && a.p_actor_profile_id !== null) {
            throw new Error('audit: a system row must not name a profile');
          }
          if ((a.p_decision === 'allow') !== (a.p_reason_code === 'AUTHORIZED')) {
            throw new Error('audit: allow and AUTHORIZED are the same fact');
          }
          state.audit.push(a);
          return { data: uuid(), error: null };
        }

        case 'provider_sync_job_claim': {
          state.claimCalls += 1;
          const eligible = state.jobs
            .filter((j) => state.api.state.isClaimEligible(j, state.now) && j.attempt_count < j.max_attempts)
            .sort((x, y) => x.priority - y.priority || String(x.created_at).localeCompare(String(y.created_at)));
          const picked = eligible.slice(0, a.p_limit);
          const granted = picked.map((j) => {
            j.status = 'claimed';
            j.attempt_count += 1;
            j.attempt_id = uuid();
            j.attempt_started_at = nowIso();
            j.claimed_by = a.p_worker_id;
            j.claimed_at = nowIso();
            j.lease_id = uuid();
            // THE CAP ON THE GRANT: a lease may never outlive the attempt's own budget,
            // so a 900-second request against a 30-second attempt is granted 30.
            j.lease_expires_at = iso(state.now + Math.min(a.p_lease_seconds, j.max_attempt_seconds) * 1000);
            j.lease_renewal_count = 0;
            j.next_attempt_at = null;
            j.last_error_class = null;
            j.last_error_code = null;
            j.last_error_message = null;
            j.updated_at = nowIso();
            checkRowShape(j);
            return { ...j };
          });
          return { data: granted, error: null };
        }

        case 'provider_sync_job_renew_lease': {
          state.renewCalls += 1;
          const j = findJob(a.p_job_id);
          if (!j) return { data: false, error: null };
          const liveLease = j.status === 'claimed'
            && j.attempt_id === a.p_attempt_id && j.lease_id === a.p_lease_id && j.claimed_by === a.p_worker_id
            && !leaseExpired(j)
            // THE ABSOLUTE DEADLINE, refused AT or after it (strict `<`): the last
            // admissible renewal is one that begins strictly inside the budget.
            && attemptDeadline(j) > state.now;
          if (!liveLease) return { data: false, error: null };
          // THE RENEWAL BUDGET. The database REFUSES past 100 — its WHERE clause
          // carries the bound — rather than writing 101 and tripping attempt_bounds,
          // so the model must refuse too. Returning false is exactly what the SQL
          // does: the row is left untouched and the worker reads a lost lease.
          if (j.lease_renewal_count >= 100) return { data: false, error: null };
          // The renewed lease is CAPPED at the same absolute deadline the grant is.
          j.lease_expires_at = iso(Math.min(state.now + a.p_lease_seconds * 1000, attemptDeadline(j)));
          j.lease_renewal_count += 1;
          j.updated_at = nowIso();
          checkRowShape(j);
          return { data: true, error: null };
        }

        case 'provider_sync_job_complete': {
          state.completeCalls += 1;
          const j = findJob(a.p_job_id);
          if (!j) return { data: 'NOT_FOUND', error: null };
          const fenced = j.status !== 'claimed'
            || j.attempt_id !== a.p_attempt_id || j.lease_id !== a.p_lease_id || j.claimed_by !== a.p_worker_id;
          if (fenced) return { data: 'LEASE_FENCED', error: null };
          // The absolute deadline is judged BEFORE the lease and independently of it, so
          // a stale completion reports what it actually is rather than a superseded claim.
          if (deadlinePassed(j)) return { data: 'ATTEMPT_EXPIRED', error: null };
          if (leaseExpired(j)) return { data: 'LEASE_FENCED', error: null };
          j.lease_id = null;
          j.lease_expires_at = null;
          j.updated_at = nowIso();
          if (a.p_outcome === 'completed') {
            j.status = 'completed';
            j.completed_at = nowIso();
            j.next_attempt_at = null;
            j.last_error_class = null; j.last_error_code = null; j.last_error_message = null;
            checkRowShape(j);
            return { data: 'completed', error: null };
          }
          if (a.p_outcome === 'failed') {
            j.status = 'failed';
            j.next_attempt_at = null;
            j.last_error_class = a.p_error_class;
            j.last_error_code = a.p_error_code || a.p_error_class;
            j.last_error_message = a.p_error_message || 'terminal execution failure';
            checkRowShape(j);
            return { data: 'failed', error: null };
          }
          if (j.attempt_count < j.max_attempts) {
            const backoff = Math.min(Math.max(a.p_backoff_seconds || 30, 1), BACKOFF_MAX);
            j.status = 'retry_wait';
            j.next_attempt_at = iso(state.now + backoff * 1000);
            j.last_error_class = a.p_error_class;
            j.last_error_code = a.p_error_code || a.p_error_class;
            j.last_error_message = a.p_error_message || 'retryable execution failure';
            checkRowShape(j);
            return { data: 'retry_wait', error: null };
          }
          j.status = 'failed';
          j.next_attempt_at = null;
          j.last_error_class = 'transient_exhausted';
          j.last_error_code = a.p_error_code || 'attempts_exhausted';
          j.last_error_message = 'attempt budget exhausted';
          checkRowShape(j);
          return { data: 'failed', error: null };
        }

        case 'provider_sync_job_sweep': {
          const doomed = state.jobs.filter((j) => (
            (j.status === 'queued' || j.status === 'retry_wait') && j.attempt_count >= j.max_attempts
          ) || (
            j.status === 'claimed' && j.attempt_count >= j.max_attempts && Date.parse(j.lease_expires_at) <= state.now
          )).slice(0, a.p_limit);
          doomed.forEach((j) => {
            j.status = 'failed';
            j.lease_id = null;
            j.lease_expires_at = null;
            j.last_error_class = 'transient_exhausted';
            j.last_error_code = 'attempts_exhausted';
            j.last_error_message = 'attempt budget exhausted before a successful execution';
            j.next_attempt_at = null;
            checkRowShape(j);
          });
          return { data: doomed.length, error: null };
        }

        case 'provider_sync_job_authorize': {
          const j = findJob(a.p_job_id);
          if (!j) return { data: { verified: false, claim_state: 'job_not_found' }, error: null };
          const snapshot = {
            id: j.id, business_id: j.business_id, business_connection_id: j.business_connection_id,
            credential_id: j.credential_id, credential_type: j.credential_type,
            provider: j.provider, provider_operation: j.provider_operation, status: j.status,
            attempt_count: j.attempt_count, max_attempts: j.max_attempts,
          };
          if (!a.p_job_id || !a.p_attempt_id || !a.p_lease_id) {
            return { data: { verified: false, claim_state: 'context_incomplete' }, error: null };
          }
          if (j.status !== 'claimed') return { data: { verified: false, claim_state: 'job_not_claimed', job: snapshot }, error: null };
          if (j.attempt_id !== a.p_attempt_id || j.lease_id !== a.p_lease_id || j.claimed_by !== a.p_worker_id) {
            return { data: { verified: false, claim_state: 'claim_mismatch', job: snapshot }, error: null };
          }
          // The absolute deadline, refused INDEPENDENTLY of the lease and reported under
          // its own claim_state.
          if (deadlinePassed(j)) {
            return { data: { verified: false, claim_state: 'attempt_expired', job: snapshot }, error: null };
          }
          // `laxAuthorization` is a MUTATION-ONLY override modelling a verifier that kept
          // answering "live" after the lease it verified had lapsed — the standing-permission
          // defect. Nothing in the shipped code asks for it; the mutation suite does.
          if (!options.laxAuthorization && leaseExpired(j)) {
            return { data: { verified: false, claim_state: 'lease_expired', job: snapshot }, error: null };
          }
          if (j.attempt_count > j.max_attempts) {
            return { data: { verified: false, claim_state: 'attempt_exhausted', job: snapshot }, error: null };
          }
          return {
            data: {
              verified: true, claim_state: 'live',
              job: {
                ...snapshot, attempt_id: j.attempt_id, lease_id: j.lease_id,
                max_attempt_seconds: j.max_attempt_seconds,
                attempt_started_at: j.attempt_started_at, lease_expires_at: j.lease_expires_at,
              },
            },
            error: null,
          };
        }

        case 'provider_sync_observation_ingest': {
          // THE FENCE, in the same order as the SQL: the job row first (FOR UPDATE),
          // then validation, then the insert, then the checkpoint compare-and-swap.
          const j = findJob(a.p_job_id);
          const fenced = (reason) => ({ data: null, error: { message: `LEASE_FENCED (${reason})` } });
          if (!j) return fenced('job_not_found');
          if (j.status !== 'claimed') return fenced('job_not_claimed');
          if (j.attempt_id !== a.p_attempt_id || j.lease_id !== a.p_lease_id || j.claimed_by !== a.p_worker_id) {
            return fenced('claim_mismatch');
          }
          // The absolute deadline, BEFORE any mutation and independently of the lease.
          if (deadlinePassed(j)) {
            return { data: null, error: { message: 'ATTEMPT_EXPIRED (the attempt passed its absolute deadline of N seconds; nothing is written)' } };
          }
          if (leaseExpired(j)) return fenced('lease_expired');

          const batch = a.p_observations || [];
          const cp = a.p_checkpoint || null;
          let existing = null;
          if (cp) {
            if (!/^(accounts|balances|transactions|statement|invoices|journal)(:[A-Za-z0-9_.-]{1,64}){0,2}$/.test(String(cp.scope))) {
              return { data: null, error: { message: 'checkpoint scope is not a bounded known scope' } };
            }
            existing = state.checkpoints.find((c) => c.job_id === j.id && c.checkpoint_scope === cp.scope) || null;
            if (!existing) {
              if (cp.expected_version !== 0) return { data: null, error: { message: 'CHECKPOINT_STALE (no checkpoint exists)' } };
              existing = {
                id: uuid(), business_id: j.business_id, business_connection_id: j.business_connection_id,
                job_id: j.id, checkpoint_scope: cp.scope, cursor_kind: cp.cursor_kind,
                cursor_ordinal: null, cursor_token: null, cursor_version: 0,
                last_batch_id: null, last_observation_id: null, last_attempt_id: null,
                last_lease_id: null, last_advanced_at: null, created_at: nowIso(), updated_at: nowIso(),
              };
              // STAGED, not committed: the row enters the world only when the unit
              // commits, so a failed validation leaves nothing behind. The model
              // reproduces the transaction instead of approximating it.
            }
            if (existing.cursor_kind !== cp.cursor_kind) return { data: null, error: { message: 'CHECKPOINT_KIND_MISMATCH' } };
            if (existing.cursor_version !== cp.expected_version) return { data: null, error: { message: 'CHECKPOINT_STALE (expected_version)' } };
            if (cp.cursor_kind === 'ordered') {
              if (typeof cp.cursor_ordinal !== 'number' || cp.cursor_ordinal < 0) {
                return { data: null, error: { message: 'an ordered checkpoint requires a non-negative numeric cursor_ordinal' } };
              }
              if (existing.cursor_ordinal !== null && !(cp.cursor_ordinal > existing.cursor_ordinal)) {
                return { data: null, error: { message: 'CHECKPOINT_NOT_MONOTONIC' } };
              }
            } else if (typeof cp.cursor_token !== 'string' || cp.cursor_token.length < 1) {
              return { data: null, error: { message: 'an opaque checkpoint requires a bounded cursor_token' } };
            }
          }

          // Every rule the SQL validates before it writes.
          const prepared = [];
          for (const o of batch) {
            if (!o || typeof o !== 'object') return { data: null, error: { message: 'every observation must be an object' } };
            if (!state.api.identity.OBSERVATION_OBJECT_TYPES.includes(o.object_type)) {
              return { data: null, error: { message: 'unsupported object_type' } };
            }
            if (!state.api.identity.OBSERVATION_VALUE_KINDS.includes(o.value_kind)) {
              return { data: null, error: { message: 'unsupported value_kind' } };
            }
            if (!o.provider_object_id || !o.source_version) {
              return { data: null, error: { message: 'provider_object_id and source_version are required' } };
            }
            if (JSON.stringify(o.payload || {}).length > PAYLOAD_BYTES) {
              return { data: null, error: { message: 'observation payload exceeds the 16 KiB bound' } };
            }
            const dedupKey = payloadHash(state.api.identity.dedupKeyMaterial({
              business_id: j.business_id, provider: j.provider, business_connection_id: j.business_connection_id,
              object_type: o.object_type, provider_object_id: o.provider_object_id,
              value_kind: o.value_kind, source_version: o.source_version,
            }));
            if (o.dedup_key && o.dedup_key !== dedupKey) return { data: null, error: { message: 'DEDUP_KEY_MISMATCH' } };
            const hash = payloadHash(JSON.stringify(o.payload || {}));
            prepared.push({ ...o, dedup_key: dedupKey, payload_hash: hash });
          }
          if (batch.length > BATCH_OBSERVATIONS) return { data: null, error: { message: 'batch exceeds the 500 observation bound' } };

          // CLASSIFY FIRST, against COMMITTED rows only, counting DELIVERIES — the
          // corrected SQL's semantics exactly. (The model runs one unit at a time, which
          // is what the SQL's per-key advisory locks make true of concurrent units that
          // share a key: each classifies against the other's committed result.)
          const byKey = new Map();
          prepared.forEach((p) => {
            const e = byKey.get(p.dedup_key) || { first: p, count: 0, hashes: new Set() };
            e.count += 1;
            e.hashes.add(p.payload_hash);
            byKey.set(p.dedup_key, e);
          });
          let duplicates = 0;
          let conflicts = 0;
          const absent = [];
          byKey.forEach((e, key) => {
            // contradicted WITHIN the batch: every delivery after the first is a conflict
            // (`modelIgnoresBatchContradiction` is MUTATION-ONLY: it proves the
            // behavioural suite fails when this detection is lost.)
            if (e.hashes.size > 1 && !options.modelIgnoresBatchContradiction) { conflicts += e.count - 1; return; }
            const stored = state.observations.find((o) => o.dedup_key === key);
            if (!stored) { duplicates += e.count - 1; absent.push(e.first); return; }
            if (stored.payload_hash === e.first.payload_hash) duplicates += e.count;
            else conflicts += e.count;
          });

          // A CONFLICT IS A REFUSAL, mirroring the SQL exactly: refused WHOLE, before
          // anything is staged — no observation, no cursor movement.
          if (conflicts > 0) {
            return { data: null, error: { message: `OBSERVATION_CONFLICT (${conflicts})` } };
          }

          // ── THE FENCE IS RE-ASKED AT THE MUTATION BOUNDARY ────────────────────
          // The SQL asks the deadline again here, after every per-key advisory lock has
          // been taken and immediately before the one statement that writes evidence, so
          // a long transaction cannot pay for a lock wait with the time it began.
          // `boundaryTickMs` is a TEST-ONLY override that makes such a wait visible to
          // the model — the wait itself cannot be reproduced in-process.
          if (options.boundaryTickMs) state.now += options.boundaryTickMs;
          if (deadlinePassed(j)) {
            return { data: null, error: { message: 'ATTEMPT_EXPIRED (the attempt passed its absolute deadline while the unit waited for its keys; nothing is written)' } };
          }
          // ── THE LEASE, RE-READ AT THAT SAME BOUNDARY ─────────────────────────
          // The row lock taken at the fence above is still held, so the IDENTITY cannot
          // have changed while the unit waited — only the clock has. `lease_expires_at`
          // names an instant that passes on its own, so a lease that was live on arrival
          // must be re-judged here, against the instant the unit is actually ready to
          // write. This is the discriminating half of the correction: the deadline above
          // can be far away while the lease has already lapsed. `modelIgnoresBoundaryLease`
          // is MUTATION-ONLY: it proves the behavioural suite fails when it is lost.
          if (!options.modelIgnoresBoundaryLease && leaseExpired(j)) {
            return fenced('lease_expired after the key wait');
          }

          // INSERT the absent keys, one row each, first delivery wins. STAGED, not
          // committed: a row enters the world only when the unit commits.
          const staged = [];
          let lastId = null;
          for (const p of absent) {
            const row = {
              id: uuid(),
              business_id: j.business_id,
              business_connection_id: j.business_connection_id,
              credential_id: (credentials.find((c) => c.business_id === j.business_id
                && c.business_connection_id === j.business_connection_id
                && c.credential_type === j.credential_type && c.status === 'active') || {}).id || null,
              job_id: j.id, attempt_id: j.attempt_id, lease_id: j.lease_id,
              provider: j.provider, provider_operation: j.provider_operation,
              object_type: p.object_type, provider_object_id: p.provider_object_id,
              value_kind: p.value_kind, source_version: p.source_version,
              source_updated_at: p.source_updated_at || null,
              payload: p.payload, payload_hash: p.payload_hash, dedup_key: p.dedup_key,
              observed_at: nowIso(), created_at: nowIso(),
            };
            staged.push(row);
            lastId = row.id;
          }

          // THE RECEIPT MUST DESCRIBE THE STORE (the SQL's 5d assertion).
          const delivered = prepared.length;
          if (staged.length !== absent.length || staged.length + duplicates + conflicts !== delivered) {
            return { data: null, error: { message: 'OBSERVATION_RACE (receipt does not reconcile)' } };
          }

          // COMMIT: the staged observations enter the world here — after every
          // validation and the refusal above, and in the same step as any cursor
          // movement below, never one without the other.
          staged.forEach((row) => state.observations.push(row));
          const inserted = staged.length;

          let checkpointReceipt = null;
          if (cp) {
            if (existing.cursor_version !== cp.expected_version) {
              return { data: null, error: { message: 'CHECKPOINT_STALE (compare-and-swap lost)' } };
            }
            // Committed WITH the observations that justify it: the row appears in the same
            // step the cursor moves, never before, never after.
            if (state.checkpoints.indexOf(existing) === -1) state.checkpoints.push(existing);
            existing.cursor_version += 1;
            if (cp.cursor_kind === 'ordered') existing.cursor_ordinal = cp.cursor_ordinal;
            else existing.cursor_token = cp.cursor_token;
            existing.last_batch_id = uuid();
            existing.last_observation_id = lastId;
            existing.last_attempt_id = j.attempt_id;
            existing.last_lease_id = j.lease_id;
            existing.last_advanced_at = nowIso();
            existing.updated_at = nowIso();
            checkpointReceipt = { scope: cp.scope, cursor_kind: cp.cursor_kind, cursor_version: existing.cursor_version };
          }

          return {
            data: {
              job_id: j.id, attempt_id: j.attempt_id, attempt_count: j.attempt_count,
              batch_id: uuid(), delivered, inserted, duplicates, conflicts,
              last_observation_id: lastId, checkpoint: checkpointReceipt,
            },
            error: null,
          };
        }

        case 'provider_sync_job_enqueue': {
          const existingJob = state.jobs.find((j) => j.business_connection_id === a.p_business_connection_id
            && j.provider === a.p_provider && j.provider_operation === a.p_provider_operation
            && ['queued', 'claimed', 'retry_wait'].includes(j.status));
          if (existingJob) return { data: existingJob.id, error: null };
          const id = uuid();
          state.jobs.push({
            id,
            business_id: a.p_business_id,
            business_connection_id: a.p_business_connection_id,
            credential_id: a.p_credential_id,
            credential_type: 'quickbooks_refresh',
            provider: a.p_provider,
            provider_operation: a.p_provider_operation,
            status: 'queued', priority: a.p_priority, attempt_count: 0,
            max_attempts: a.p_max_attempts, max_attempt_seconds: a.p_max_attempt_seconds,
            attempt_id: null, attempt_started_at: null, claimed_by: null, claimed_at: null,
            lease_id: null, lease_expires_at: null, lease_renewal_count: 0,
            next_attempt_at: nowIso(), last_error_class: null, last_error_code: null,
            last_error_message: null, completed_at: null, created_at: nowIso(), updated_at: nowIso(),
          });
          return { data: id, error: null };
        }

        case 'provider_credential_resolve':
          state.credentialResolutions += 1;
          return { data: SECRET_MARKER, error: null };

        default:
          throw new Error(`model: unexpected rpc ${name}`);
      }
    }

    // The model's hashing must agree with the shipped module's: the same material
    // string through the same sha256. The suite compares the two directly.
    const nodeCrypto = require('crypto');
    const payloadHash = (text) => nodeCrypto.createHash('sha256').update(text, 'utf8').digest('hex');

    return {
      state,
      sb: makeSb(),
      tick,
      now: () => state.now,
      job: () => state.jobs[0],
      dedupKey: (material) => payloadHash(material),
      _internal: { payloadHash },
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STATIC CHECKS — the migration's contracts, parsed
  // ══════════════════════════════════════════════════════════════════════════
  function checkPresence(src) {
    const missing = ['mig', 'verify', 'policy', 'state', 'identity', 'checkpoint', 'system', 'repository', 'executor', 'entry']
      .filter((k) => !src[k] || src[k].length < 200);
    ok('CB5B-1', missing.length === 0,
      `all CB-005B sources must exist and be non-trivial — missing/empty: ${missing.join(', ')}`);
  }

  function checkObjects(src) {
    const d = deployTime(live(src.mig));
    for (const t of TABLES) {
      ok(`CB5B-2:${t}`, new RegExp(`create table if not exists public\\.${t} \\(`).test(d),
        `${t} must be created by this migration`);
    }
    const created = [...d.matchAll(/create table if not exists public\.([a-z_]+)/g)].map((m) => m[1]);
    ok('CB5B-2:exact', created.length === TABLES.length && TABLES.every((t) => created.includes(t)),
      `exactly the three CB-005B tables may be created — found ${JSON.stringify(created)}`);

    const fns = [...d.matchAll(/create or replace function public\.([a-z_]+)\s*\(/g)].map((m) => m[1]);
    ok('CB5B-3', fns.length === FUNCTIONS.length && FUNCTIONS.every((f) => fns.includes(f)),
      `exactly the seven execution functions may be created — found ${JSON.stringify(fns)}`);
    const idx = [...d.matchAll(/create (unique )?index if not exists ([a-z_]+)/g)].map((m) => m[2]);
    ok('CB5B-3:indexes', idx.length >= 8 && idx.length <= 14,
      `the index set must stay bounded and purposeful — found ${idx.length}: ${JSON.stringify(idx)}`);
  }

  function checkAcl(src) {
    const d = deployTime(live(src.mig));
    for (const t of TABLES) {
      ok(`CB5B-4:${t}`, new RegExp(`alter table public\\.${t} enable row level security;`).test(d),
        `RLS must be enabled EXPLICITLY on ${t} — never left to the rls_auto_enable trigger`);
      const missing = ['public', 'anon', 'authenticated', 'service_role']
        .filter((r) => !new RegExp(`revoke all on table public\\.${t} from ${r};`).test(d));
      ok(`CB5B-5:${t}`, missing.length === 0,
        `${t} must be REVOKEd from PUBLIC, anon, authenticated AND service_role — missing: ${missing.join(', ')}`);
      ok(`CB5B-6:${t}`, new RegExp(`grant select on table public\\.${t} to service_role;`).test(d),
        `service_role must receive SELECT on ${t} and nothing more`);
      const rev = d.indexOf(`revoke all on table public.${t} from service_role;`);
      const gr = d.indexOf(`grant select on table public.${t} to service_role;`);
      ok(`CB5B-7:${t}`, rev !== -1 && gr !== -1 && rev < gr,
        `REVOKE-then-GRANT is correctness on ${t}: the reverse lands on nothing (revoke@${rev}, grant@${gr})`);
    }

    // No role may hold a WRITE privilege on any of the three tables: every mutation
    // goes through a fenced function, or it does not happen.
    const writeGrants = [...d.matchAll(/grant[^;]*\b(insert|update|delete|truncate|references|trigger|maintain)\b[^;]*\bon table\b[^;]*/gi)].map((m) => m[0]);
    ok('CB5B-8', writeGrants.length === 0,
      `no role may be granted a write privilege on any CB-005B table — the functions are the only writers; found ${JSON.stringify(writeGrants)}`);
    const allGrants = [...d.matchAll(/grant[^;]*on table[^;]*;/gi)].map((m) => m[0].replace(/\s+/g, ' ').trim());
    // Assert the INTENDED state directly: exactly one SELECT-to-service_role grant per
    // table, and the granted table set is the three CB-005B tables. Reading the table
    // name out of each grant and comparing the results as a SET proves the same thing a
    // literal regex would — without depending on how the statement happens to be spelled.
    const grantedTables = allGrants
      .map((g) => (g.match(/on table public\.([a-z_]+) to service_role/) || ['', ''])[1])
      .filter(Boolean)
      .sort();
    ok('CB5B-8b', allGrants.length === TABLES.length
      && allGrants.every((g) => /^grant select on table public\.[a-z_]+ to service_role;$/.test(g))
      && grantedTables.join(',') === TABLES.slice().sort().join(','),
      `exactly three table grants may exist — SELECT to service_role on each of the three tables; found ${JSON.stringify(allGrants)}; parsed table set=${JSON.stringify(grantedTables)} expected=${JSON.stringify(TABLES.slice().sort())} count=${allGrants.length}/${TABLES.length} shaped=${JSON.stringify(allGrants.map((g) => /^grant select on table public\.[a-z_]+ to service_role;$/.test(g)))}`);

    for (const f of FUNCTIONS) {
      const sig = SIGNATURES[f];
      const esc = sig.replace(/[(),]/g, '\\$&');
      const body = bodyOf(src.mig, f);
      ok(`CB5B-9:${f}`, /\bsecurity definer\b/.test(body)
        && body.includes('set search_path = pg_catalog, public')
        && new RegExp(`alter function public\\.${f}\\(${esc}\\) owner to postgres;`).test(d),
        `${f} must be SECURITY DEFINER, search_path-pinned and owner-pinned to postgres`);
      const missingRevoke = ['public', 'anon', 'authenticated', 'service_role']
        .filter((r) => !new RegExp(`revoke all on function public\\.${f}\\(${esc}\\) from ${r};`).test(d));
      ok(`CB5B-10:${f}`, missingRevoke.length === 0,
        `${f} must be REVOKEd from all four roles — missing: ${missingRevoke.join(', ')}`);
      ok(`CB5B-11:${f}`, new RegExp(`grant execute on function public\\.${f}\\(${esc}\\) to service_role;`).test(d),
        `${f} must be granted to service_role only`);
    }
    ok('CB5B-12', !/grant\s+execute\b[^;]*\bto\s+(PUBLIC|anon|authenticated)\b/i.test(d),
      'no browser role may ever be granted EXECUTE on an execution function');
    ok('CB5B-13', !/security invoker/i.test(d),
      'no SECURITY INVOKER function may exist on this boundary — the functions must run as their owner, not as the caller');

    // Policies: SELECT for service_role only. A policy for a browser role, or a
    // write policy of any kind, would be a second, unaudited access path.
    const policies = [...live(src.mig).matchAll(/create policy ([a-z_]+)\s+on public\.([a-z_]+) for (\w+) to ([a-z_]+)/g)]
      .map((m) => ({ name: m[1], table: m[2], cmd: m[3].toLowerCase(), role: m[4] }));
    ok('CB5B-14', policies.length === 3
      && policies.every((p) => p.cmd === 'select' && p.role === 'service_role' && TABLES.includes(p.table)),
      `exactly three policies may exist — SELECT for service_role on each of the three tables; found ${JSON.stringify(policies)}`);
  }

  function checkFencing(src) {
    const d = deployTime(live(src.mig));
    const claim = bodyOf(src.mig, 'provider_sync_job_claim');
    const renew = bodyOf(src.mig, 'provider_sync_job_renew_lease');
    const complete = bodyOf(src.mig, 'provider_sync_job_complete');
    const ingest = bodyOf(src.mig, 'provider_sync_observation_ingest');
    const authorize = bodyOf(src.mig, 'provider_sync_job_authorize');

    // ── the lease shape: claimed ⟺ a live lease exists; otherwise BOTH are null.
    ok('CB5B-15', /constraint provider_sync_jobs_lease_shape[\s\S]{0,420}status = 'claimed'[\s\S]{0,320}status <> 'claimed' and lease_id is null and lease_expires_at is null/.test(live(src.mig)),
      'the lease shape must make a live-looking lease on a non-claimed job UNREPRESENTABLE — a stale lease is then structurally impossible, not merely refused');
    ok('CB5B-16', /constraint provider_sync_jobs_attempt_bounds[\s\S]{0,300}attempt_count >= 0 and attempt_count <= max_attempts/.test(live(src.mig)),
      'the attempt bounds must be a table-level invariant, so no code path can exceed the budget');

    // ── the claim predicate: DB time, both eligibility branches, SKIP LOCKED.
    ok('CB5B-17', /for update skip locked/.test(claim),
      'the claim must use FOR UPDATE SKIP LOCKED — that is what makes two concurrent workers receive disjoint sets');
    ok('CB5B-18', /status in \('queued', 'retry_wait'\) and j\.next_attempt_at <= v_now/.test(claim)
      && /status = 'claimed' and j\.lease_expires_at <= v_now/.test(claim),
      'the claim must cover BOTH a fresh job and an expired-lease recovery, and must read the WALL CLOCK — one clock_timestamp() reading, v_now — as the authority; now() is transaction START time, so a long transaction would answer every deadline question with the instant it began');
    ok('CB5B-19', /attempt_count < j\.max_attempts/.test(claim) && /attempt_count\s+= j\.attempt_count \+ 1/.test(claim)
      && /attempt_id\s+= gen_random_uuid\(\)/.test(claim) && /lease_id\s+= gen_random_uuid\(\)/.test(claim),
      'a claim must increment the attempt and mint a NEW attempt_id and lease_id, so the previous attempt is permanently fenced out');
    ok('CB5B-20', !/\bnow\(\)\s*\+\s*make_interval|current_timestamp/.test(claim.replace(/make_interval\(secs => p_lease_seconds\)/, ''))
      && /lease_expires_at\s+= least\([\s\S]{0,240}make_interval\(secs => j\.max_attempt_seconds\)/.test(claim),
      'the claim must CAP the lease it grants at the attempt\'s own deadline — least(..., max_attempt_seconds) — so a 900-second request against a 30-second attempt is granted 30, and no clock-skewed time expression may enter beyond the caller-bounded interval');

    // ── the fence, in every writer.
    for (const [name, body] of [['renew_lease', renew], ['complete', complete], ['ingest', ingest], ['authorize', authorize]]) {
      const hasAll = /status = 'claimed'|status !== 'claimed'|status <> 'claimed'/.test(body)
        && /attempt_id/.test(body) && /lease_id/.test(body) && /claimed_by/.test(body)
        // The clock comparison, in the form each writer actually uses: v_now is the ONE
        // wall-clock reading a lifecycle function takes, so `> v_now` and
        // `<= clock_timestamp()` are the same fact written twice. The alternation admits
        // only server-side time expressions — a caller-supplied value cannot satisfy it.
        && />\s*(v_now\b|now\(\)|clock_timestamp\(\))|<=\s*(v_now\b|now\(\)|clock_timestamp\(\))/.test(body);
      ok(`CB5B-21:${name}`, hasAll,
        `${name} must fence on status + attempt_id + lease_id + claimed_by AND on the database's wall clock (clock_timestamp()/v_now) — a worker that lost its lease, or whose attempt ran out of time, must change nothing`);
    }
    ok('CB5B-22', /return 'LEASE_FENCED';/.test(complete) && /LEASE_FENCED \(/.test(ingest),
      'a fenced completion must be reported, and a fenced ingest must RAISE so the transaction rolls back whole');
    ok('CB5B-23', /v_now < j\.attempt_started_at \+ make_interval\(secs => j\.max_attempt_seconds\)/.test(renew)
      && /set lease_expires_at\s+= least\([\s\S]{0,280}j\.attempt_started_at \+ make_interval\(secs => j\.max_attempt_seconds\)/.test(renew),
      'lease RENEWAL must be refused AT or after the attempt deadline (strict <, on the wall clock) AND what it grants must be CAPPED at that same deadline — together those stop a runaway worker holding a job open');
    ok('CB5B-24', !/where\s+true|where\s+1\s*=\s*1/i.test(complete + ingest + renew),
      'no writer may carry an unconditional WHERE — the fence is the predicate');
    ok('CB5B-25', /for update;/.test(ingest) && /for update;/.test(complete),
      'the ingest and the completion must LOCK the job row, so they cannot interleave and the fence reads the snapshot it writes');
  }

  // ── THE ABSOLUTE ATTEMPT DEADLINE: attempt_started_at + max_attempt_seconds ──
  // A lease is a claim on a job; the DEADLINE is a bound on the attempt itself. The
  // defect this block exists for is a deadline that was only ever compared in one
  // place, so a claim could grant a lease longer than the budget, a renewal could
  // extend past it, and an expired attempt could still authorize, ingest and complete.
  function checkAttemptDeadline(src) {
    const claim = bodyOf(src.mig, 'provider_sync_job_claim');
    const renew = bodyOf(src.mig, 'provider_sync_job_renew_lease');
    const complete = bodyOf(src.mig, 'provider_sync_job_complete');
    const authorize = bodyOf(src.mig, 'provider_sync_job_authorize');
    const ingest = bodyOf(src.mig, 'provider_sync_observation_ingest');
    const sweep = bodyOf(src.mig, 'provider_sync_job_sweep');
    const asCode = (t) => t.replace(/\/\*([^*]|\*[^/])*\*\//g, ' ').replace(/(^|[^-])--[^\n]*/gm, '$1');

    // THE TABLE MAKES IT UNREPRESENTABLE — the strongest form of the cap, and the reason
    // the recovery predicate ("deadline passed" ⇒ "lease expired") holds of the table.
    ok('CB5B-114', /constraint provider_sync_jobs_lease_within_attempt[\s\S]{0,320}extract\(epoch from \(lease_expires_at - attempt_started_at\)\) <= max_attempt_seconds/.test(live(src.mig)),
      'the table must REFUSE a lease that outlives its attempt budget (provider_sync_jobs_lease_within_attempt), so "the lease reads live" can never outvote the deadline');

    // NO FUNCTION READS now(). now() is transaction START time: one long transaction — a
    // worker holding a row lock, waiting on an advisory lock, or simply slow — would keep
    // answering every deadline question with the instant it BEGAN.
    const readers = [claim, renew, complete, authorize, ingest, sweep].filter((b) => /\bnow\(\)/.test(asCode(b)));
    ok('CB5B-115', readers.length === 0,
      `no CB-005B function may read now(): every scheduling and deadline instant comes from clock_timestamp() (offenders=${readers.length})`);

    // THE GRANT AND THE RENEWAL ARE BOTH CAPPED, and both refusals are on the wall clock.
    ok('CB5B-116', /lease_expires_at\s+= least\([\s\S]{0,260}make_interval\(secs => j\.max_attempt_seconds\)/.test(claim)
      && /v_now < j\.attempt_started_at \+ make_interval\(secs => j\.max_attempt_seconds\)/.test(renew)
      && /set lease_expires_at\s+= least\([\s\S]{0,300}j\.attempt_started_at \+ make_interval\(secs => j\.max_attempt_seconds\)/.test(renew),
      'claim must CAP its grant and renew must CAP its extension at the attempt deadline, and renew must be refused AT or after that deadline');

    // AUTHORIZE REFUSES IT, INDEPENDENTLY AND FIRST, under its own claim_state.
    const authorizeDeadline = authorize.indexOf("'attempt_expired'");
    ok('CB5B-117', authorizeDeadline > -1 && authorizeDeadline < authorize.indexOf("'lease_expired'")
      && /clock_timestamp\(\) >= v_job\.attempt_started_at \+ make_interval\(secs => v_job\.max_attempt_seconds\)/.test(authorize),
      'authorize must refuse an attempt at or past its absolute deadline with its OWN claim_state, checked independently of — and before — the lease refusal');

    // COMPLETE REFUSES IT TOO, under its own verdict, before the lease test.
    const completeDeadline = complete.indexOf("return 'ATTEMPT_EXPIRED';");
    ok('CB5B-118', completeDeadline > -1 && completeDeadline < complete.indexOf('v_job.lease_expires_at <= clock_timestamp()')
      && /clock_timestamp\(\) >= v_job\.attempt_started_at \+ make_interval\(secs => v_job\.max_attempt_seconds\)/.test(complete),
      'complete must refuse a stale completion past the deadline under its own verdict, BEFORE the lease test, so "my attempt ran out of time" is never mistaken for "someone took my claim"');

    // INGEST REFUSES IT TWICE: before any mutation, and again at the mutation boundary.
    // The boundary guard is asserted as a live CONDITION, not as a message: a check that
    // merely looked for the refusal text would pass on a guard someone had disabled with
    // `if false then` — a vacuous test of exactly this correction — so the condition
    // itself is counted, and required to sit ahead of the statement that writes evidence.
    const fence = ingest.indexOf('absolute deadline of');
    const boundary = ingest.indexOf('while the unit waited for its keys');
    const boundaryCond = 'if clock_timestamp() >= v_job.attempt_started_at + make_interval(secs => v_job.max_attempt_seconds) then';
    const boundaryGuards = ingest.split(boundaryCond).length - 1;
    ok('CB5B-119', fence > -1 && boundary > -1 && fence < boundary
      && boundaryGuards === 1
      && ingest.indexOf(boundaryCond) < boundary
      && fence < ingest.indexOf('insert into public.provider_sync_checkpoints')
      && boundary < ingest.indexOf('insert into public.provider_observations'),
      'the ingest must refuse an expired attempt BEFORE any mutation (ahead of the checkpoint write) AND re-read the deadline AT the mutation boundary (ahead of the observation insert), so a lock wait cannot be paid for with time that has already passed');

    // EVERY WAITING WRITER READS THE CLOCK AFTER IT HOLDS THE ROW. Three writers can
    // wait on the job row — the renewal, the completion and the ingestion — and each
    // takes the lock FIRST and reads the wall clock AFTER it. A reading captured before
    // the wait is the defect this asserts against: a call that arrived inside its lease
    // (or its budget) but was SERVED after it lapsed must be refused, never granted on
    // the instant it arrived. See cb005bHardeningChecks.cjs for the differential that
    // demonstrates the difference rather than asserting it.
    const completeLock = complete.indexOf('for update;');
    const renewLock = renew.indexOf('for update;');
    const ingestLock = ingest.indexOf('for update;');
    ok('CB5B-120', ingest.indexOf('v_now := clock_timestamp();') > ingestLock
      && completeLock > -1 && complete.indexOf('clock_timestamp() >= v_job.attempt_started_at', completeLock) > completeLock
      && renewLock > -1 && renew.indexOf('v_now := clock_timestamp();') > renewLock
      && /v_now\s+timestamptz;/.test(renew) && !/v_now\s+timestamptz\s*:=/.test(renew),
      `complete, ingest AND renew_lease must each read the wall clock AFTER the row lock is held, with the renewal declaring NO pre-lock instant (complete@${completeLock}, renew@${renewLock}, ingest@${ingestLock}) — otherwise the wait itself buys them time they no longer have`);

    // THE SWEEP — the only route that retires an exhausted attempt — is on the wall clock.
    ok('CB5B-121', /v_now\s+timestamptz := clock_timestamp\(\)/.test(sweep) && /j\.lease_expires_at <= v_now/.test(sweep),
      'the sweep must read the wall clock too, or an exhausted attempt whose deadline has passed would sit unclaimable and unretired');

    // THE LEASE IS RE-READ AT THAT SAME BOUNDARY. The row lock taken at step 2 freezes the
    // row for the whole unit — nobody can extend the lease behind this worker's back — but
    // it cannot freeze TIME, and lease_expires_at names an instant that passes on its own.
    // Without this re-read, a unit that arrived inside its lease and then waited for its
    // keys would still write evidence after the lease had lapsed; the deadline guard beside
    // it cannot cover that case, because the grant is capped at the deadline rather than
    // extended to it. Asserted as a live CONDITION, positioned: after the per-key lock and
    // ahead of the one statement that writes evidence, with the identity re-read from the
    // row at that point rather than assumed from the entry fence.
    const leaseReread = 'if v_now >= v_job.lease_expires_at then';
    const rowReread = 'where j.id = p_job_id;';
    const advisoryLockAt = ingest.indexOf('perform pg_advisory_xact_lock(v_lock_key);');
    const evidenceInsertAt = ingest.indexOf('insert into public.provider_observations');
    ok('CB5B-143', advisoryLockAt > -1 && evidenceInsertAt > -1
      && ingest.indexOf(leaseReread) > advisoryLockAt && ingest.indexOf(leaseReread) < evidenceInsertAt
      && ingest.indexOf(rowReread) > advisoryLockAt && ingest.indexOf(rowReread) < evidenceInsertAt
      && /v_now := clock_timestamp\(\);/.test(ingest.slice(advisoryLockAt, ingest.indexOf(leaseReread)))
      && ingest.indexOf('LEASE_FENCED \(lease_expired while the unit waited for its keys\)') > -1,
      `the ingest must re-read the LEASE at the mutation boundary, from a clock read AFTER the per-key locks and BEFORE the observation insert, with the claim re-asserted from the row (lease_guard@${ingest.indexOf(leaseReread)}, row_reread@${ingest.indexOf(rowReread)}, lock@${advisoryLockAt}, insert@${evidenceInsertAt}) — the row lock freezes the row, never the clock`);
  }

  function checkIngestAtomicity(src) {
    const ingest = bodyOf(src.mig, 'provider_sync_observation_ingest');
    const d = deployTime(live(src.mig));

    // The order that makes the promise true: fence → validate → insert → advance.
    const insertAt = ingest.indexOf('insert into public.provider_observations');
    const cpUpdateAt = ingest.indexOf('update public.provider_sync_checkpoints');
    ok('CB5B-26', insertAt > -1 && cpUpdateAt > -1 && insertAt < cpUpdateAt,
      'the checkpoint advance must come AFTER the observation insert in the SAME transaction — the cursor may never move ahead of what was committed');
    // CROSS-JOB SERIALIZATION. The job-row lock serializes one job; the dedup key
    // names neither job nor operation, so writers of DIFFERENT jobs must be serialized
    // per key, in lock-id order, BEFORE they classify — and the insert may carry no
    // on-conflict clause, so a bypassed serialization raises rather than discards.
    const ingestCode = live(ingest).replace(/\s+/g, ' ');
    const lockAt = ingestCode.indexOf('perform pg_advisory_xact_lock(v_lock_key);');
    const insAt = ingestCode.indexOf('insert into public.provider_observations');
    const retAt = ingestCode.indexOf('returning id, dedup_key');
    ok('CB5B-27', lockAt > -1
      && /for v_lock_key in select distinct hashtextextended\('cb005b:provider_observations:dedup_key:' \|\| k, 0\) from unnest\(v_keys\) as k order by 1 loop perform pg_advisory_xact_lock\(v_lock_key\); end loop;/.test(ingestCode)
      && lockAt < ingestCode.indexOf('left join public.provider_observations')
      && insAt > -1 && retAt > insAt && !/on conflict/i.test(ingestCode.slice(insAt, retAt)),
      `every writer of a dedup_key must take a transaction-scoped lock on it, in lock-id order, before classifying; and the observation insert must carry NO on-conflict clause (lock@${lockAt}, insert@${insAt}, on_conflict_in_insert=${insAt > -1 && /on conflict/i.test(ingestCode.slice(insAt, retAt))})`);
    const raceAt = ingestCode.indexOf('OBSERVATION_RACE');
    ok('CB5B-108', raceAt > insAt
      && raceAt < ingestCode.indexOf('set cursor_version = c.cursor_version + 1')
      && ingestCode.includes('if v_inserted <> v_absent_keys or v_delivered_count <> v_count or v_inserted + v_duplicates + v_conflicts <> v_delivered_count then')
      && ingestCode.includes('coalesce(sum(delivered_count), 0)::int into v_conflicts, v_duplicates, v_absent_keys, v_delivered_count')
      && /m\.includes\(OBSERVATION_RACE\) \|\| m\.includes\('provider_observations_dedup_unique'\)/.test(src.repository || '')
      && /code === 'CHECKPOINT_STALE' \|\| code === 'OBSERVATION_RACE'/.test(src.executor || ''),
      'the receipt must count DELIVERIES and must reconcile with the store before any cursor moves; a race or a raw unique violation must reach the worker as the closed, RETRYABLE code OBSERVATION_RACE');
    ok('CB5B-28', /and c\.cursor_version = v_expected/.test(ingest) && /get diagnostics v_updated = row_count/.test(ingest)
      && /CHECKPOINT_STALE \(compare-and-swap lost\)/.test(ingest),
      'the checkpoint advance must be a compare-and-swap whose failure RAISES, so observations and cursor roll back together');
    ok('CB5B-29', /CHECKPOINT_NOT_MONOTONIC/.test(ingest) && /v_ordinal > v_cp\.cursor_ordinal/.test(ingest),
      'an ORDERED cursor must advance strictly monotonically, enforced numerically');
    ok('CB5B-30', /expected_version is REQUIRED for a checkpoint advance/.test(ingest),
      'an OPAQUE cursor must be advanced only with an explicit expected version — never by comparing tokens');
    ok('CB5B-31', !/exception\s+when/i.test(ingest),
      'the ingest must contain NO exception handler — a swallowed error would commit part of a batch');
    ok('CB5B-32', /jsonb_array_length\(p_observations\)/.test(ingest) && /v_count > 500/.test(ingest)
      && /length\(p_observations::text\) > 2097152/.test(ingest)
      && /length\(\(v_elem->'payload'\)::text\) > 16384/.test(ingest),
      'the ingest must bound the batch count, the batch bytes and each payload');

    // Only the ingest writes a checkpoint: "advance without committing" has no API.
    // EVERY function the migration creates is inspected — not merely the seven expected
    // names — so an eighth function that touches the checkpoint cannot escape this check.
    // Bodies are extracted with a self-contained scan rather than a name lookup, so a
    // function the check has never heard of is still read as a whole. `[\s\S]*?\$\$;`
    // runs from the declaration to that function's own terminator, so one function's
    // body can never bleed into the next one's.
    const fnBodies = (src.mig || '').split(/(?=create or replace function public\.)/).slice(1)
      .map((chunk) => ({ name: (chunk.match(/create or replace function public\.([a-z_]+)/) || [])[1], body: chunk }));
    const cpWriters = fnBodies.filter((fb) => /update public\.provider_sync_checkpoints/.test(fb.body)).map((fb) => fb.name);
    ok('CB5B-33', cpWriters.length === 1 && cpWriters[0] === 'provider_sync_observation_ingest',
      `the checkpoint may be written by exactly ONE function — the fenced ingest — found ${JSON.stringify(cpWriters)}`);

    // The dedup key is computed from the JOB ROW plus the semantic identity.
    ok('CB5B-34', /v_active_credential_id/.test(ingest) && /credential_type = v_job\.credential_type/.test(ingest),
      'the observation\'s credential must be derived from the job row\'s rotation unit, not from anything the worker sent');
    ok('CB5B-35', !/p_business_id/.test(ingest) && !/p_provider\s+(text|:=)/.test(ingest),
      'the ingest must accept NO business or provider argument — deriving them from the row is what makes a forged identifier inert');

    // Freeze and capability neutrality, judged on executable statements.
    // Judged on CODE with string literals removed. A COMMENT that explains the freeze
    // must be free to NAME the frozen tables; a STATEMENT that touches them may not,
    // and the two must not be confused — the literal-free scan is what separates them.
    const codeOnly = d.replace(/'[^']*'/g, "''");
    const twin = ['business_facts', 'business_fact_evidence', 'business_fact_conflicts', 'dashboard_metrics']
      .filter((t) => new RegExp(`\\b${t}\\b`, 'i').test(codeOnly));
    ok('CB5B-36', twin.length === 0,
      `the migration must touch no Digital Twin and no metric object — found ${twin.join(', ')}`);
    const vault = ['vault\\.', 'create_secret', 'decrypted_secrets', 'provider_credential_resolve']
      .filter((t) => new RegExp(t, 'i').test(codeOnly));
    ok('CB5B-37', vault.length === 0,
      `the migration must perform no Vault access and no credential resolution — found ${vault.join(', ')}`);
    const net = [...codeOnly.matchAll(/\b(dblink|pg_net|http|https:\/\/|fetch)\b/gi)].map((m) => m[1]);
    ok('CB5B-38', net.length === 0,
      `the migration must call no provider and no network — found ${net.join(', ')}`);
    const begins = (d.match(/\bbegin\s*;/gi) || []).length;
    const commits = (d.match(/\bcommit\s*;/gi) || []).length;
    ok('CB5B-39', begins === 1 && commits === 1,
      `the migration must be ONE committing transaction (begins=${begins}, commits=${commits})`);
  }

  function checkModelAgreement(src, vocab) {
    const mig = live(src.mig);

    // The dedup key field ORDER is load-bearing: the SQL concatenation and the
    // module's DEDUP_KEY_FIELDS must be the same sequence, or every key disagrees.
    const identity = loadTs(src.identity, (s) => (s === '../providers/vocabulary.ts' ? vocab : s === './executionPolicy.ts' ? loadTs(src.policy, require) : require(s)));
    const fields = identity.DEDUP_KEY_FIELDS;
    const expectedOrder = ['business_id', 'provider', 'business_connection_id', 'object_type', 'provider_object_id', 'value_kind', 'source_version'];
    // The SQL is concatenated with `||`, so splitting on it yields the operand order
    // directly — a token comparison rather than a set of indexOf guesses, which is
    // the difference between proving the ORDER and merely hoping it.
    const concatSql = (mig.match(/v_job\.business_id::text \|\|[\s\S]*?v_source_version, 'utf8'/) || [''])[0];
    // The SQL builds the key from the JOB ROW plus the VALIDATED LOCAL VARIABLES, so the
    // extractor understands all three spellings that expression can use: a job-row field,
    // one of the validated locals, or a direct jsonb read. Missing the locals would report
    // the shipped order as three fields when it is seven — a false accusation, not a defense.
    const LOCAL_FIELDS = {
      v_obj_type: 'object_type',
      v_obj_id: 'provider_object_id',
      v_value_kind: 'value_kind',
      v_source_version: 'source_version',
    };
    const sqlOrder = concatSql
      .split('||')
      .map((part) => {
        const jobField = part.match(/v_job\.([a-z_]+)/);
        if (jobField) return jobField[1];
        const localField = part.match(/\b(v_obj_type|v_obj_id|v_value_kind|v_source_version)\b/);
        if (localField) return LOCAL_FIELDS[localField[1]];
        const jsonField = part.match(/->>'([a-z_]+)'/);
        return jsonField ? jsonField[1] : null;
      })
      .filter(Boolean);
    ok('CB5B-40', fields.length === 7
      && fields.join(',') === expectedOrder.join(',')
      && sqlOrder.length === 7 && sqlOrder.join(',') === expectedOrder.join(','),
      `the dedup key must be sha256 over the seven fields in ONE order, in both the module and the SQL; module=${JSON.stringify(fields)} sql=${JSON.stringify(sqlOrder)}`);
    ok('CB5B-41', /encode\(sha256\(convert_to\(/.test(mig) && !/\bmd5\(/.test(mig),
      'the canonical fingerprints must use sha256 — md5 is not a deduplication identity');
    ok('CB5B-42', /length\(dedup_key\) = 64 and dedup_key ~ '\^\[0-9a-f\]\{64\}\$'/.test(mig)
      && /length\(payload_hash\) = 64 and payload_hash ~ '\^\[0-9a-f\]\{64\}\$'/.test(mig),
      'both fingerprints must be constrained to 64 lowercase hex characters, so a malformed key cannot be stored');
    ok('CB5B-43', /unique \(dedup_key\)/.test(mig),
      'dedup_key must be UNIQUE — the uniqueness is what makes re-delivery idempotent, not the code that looks first');

    // Policy constants ↔ database bounds. A bound tightened in code while the
    // database still permits the looser value is the drift this catches.
    const policy = loadTs(src.policy, require);
    // Each row is [label, the database bound as SQL, whether the module agrees with it].
    // Both halves are required: a bound the database never enforces is advice, and a
    // bound the module disagrees with is a drift that will surface as a rejected call.
    const bounds = [
      ['lease seconds', /p_lease_seconds < 30 or p_lease_seconds > 900/,
        policy.EXECUTION_LIMITS.LEASE_SECONDS_MIN === 30 && policy.EXECUTION_LIMITS.LEASE_SECONDS_MAX === 900],
      ['claim batch', /p_limit < 1 or p_limit > 5/,
        policy.EXECUTION_LIMITS.CLAIM_BATCH_MIN === 1 && policy.EXECUTION_LIMITS.CLAIM_BATCH_MAX === 5],
      ['attempts', /p_max_attempts < 1 or p_max_attempts > 10/,
        policy.EXECUTION_LIMITS.MAX_ATTEMPTS_MIN === 1 && policy.EXECUTION_LIMITS.MAX_ATTEMPTS_MAX === 10],
      ['attempt seconds', /p_max_attempt_seconds < 30 or p_max_attempt_seconds > 3600/,
        policy.EXECUTION_LIMITS.MAX_ATTEMPT_SECONDS_MIN === 30 && policy.EXECUTION_LIMITS.MAX_ATTEMPT_SECONDS_MAX === 3600],
      ['sweep', /p_limit < 1 or p_limit > 500/, policy.EXECUTION_LIMITS.SWEEP_LIMIT_MAX === 500],
    ];
    const drifted = bounds.filter(([label, re, moduleAgrees]) => !re.test(mig) || !moduleAgrees);
    ok('CB5B-44', drifted.length === 0,
      `every policy bound must have its exact database counterpart, and the module must agree — drifted: ${drifted.map(([l]) => l).join(', ') || '<none>'}`);
    ok('CB5B-45', policy.EXECUTION_LIMITS.MAX_BATCH_OBSERVATIONS === BATCH_OBSERVATIONS
      && policy.EXECUTION_LIMITS.MAX_OBSERVATION_PAYLOAD_BYTES === PAYLOAD_BYTES
      && policy.EXECUTION_LIMITS.MAX_BATCH_BYTES === BATCH_BYTES
      && policy.EXECUTION_LIMITS.BACKOFF_MAX_SECONDS === BACKOFF_MAX
      && policy.EXECUTION_LIMITS.ATTEMPT_MS_BUDGET < policy.EXECUTION_LIMITS.MAX_ATTEMPT_SECONDS_MAX * 1000,
      'the batch, payload, backoff and attempt budgets must agree with the database, and the application attempt budget must stay BELOW the database one');
    ok('CB5B-46', /least\(greatest\(coalesce\(p_backoff_seconds, 30\), 1\), 900\)/.test(bodyOf(src.mig, 'provider_sync_job_complete')),
      'the retry backoff must be CLAMPED in the database, so a caller cannot choose an unbounded delay');

    // Vocabularies: statuses, operations and error classes, in both places.
    const statuses = (mig.match(/constraint provider_sync_jobs_status_check\s+check \(status in \(([^)]*)\)/) || [])[1] || '';
    const sqlStatuses = (statuses.match(/'([a-z_]+)'/g) || []).map((s) => s.replace(/'/g, ''));
    ok('CB5B-47', sqlStatuses.length === policy.JOB_STATUSES.length
      && policy.JOB_STATUSES.every((s) => sqlStatuses.includes(s)),
      `the SQL status vocabulary must equal the module's — sql=${JSON.stringify(sqlStatuses)} module=${JSON.stringify([...policy.JOB_STATUSES])}`);
    const errs = (mig.match(/constraint provider_sync_jobs_error_class_check[\s\S]{0,320}?in \(([^)]*)\)/) || [])[1] || '';
    const sqlErrors = (errs.match(/'([a-z_]+)'/g) || []).map((s) => s.replace(/'/g, ''));
    ok('CB5B-48', sqlErrors.length === policy.EXECUTION_ERROR_CLASSES.length
      && policy.EXECUTION_ERROR_CLASSES.every((e) => sqlErrors.includes(e)),
      `the failure classification must be closed and identical in both places — sql=${JSON.stringify(sqlErrors)} module=${JSON.stringify([...policy.EXECUTION_ERROR_CLASSES])}`);
    const ops = (mig.match(/constraint provider_sync_jobs_operation_check\s+check \(provider_operation in \(([^)]*)\)/) || [])[1] || '';
    const sqlOps = (ops.match(/'([a-z_.]+)'/g) || []).map((s) => s.replace(/'/g, ''));
    ok('CB5B-49', sqlOps.length === policy.JOB_OPERATIONS.length
      && policy.JOB_OPERATIONS.every((o) => sqlOps.includes(o))
      && sqlOps.every((o) => o !== 'sync.execute'),
      `a job may only carry a pull operation, never the authorization operation itself — sql=${JSON.stringify(sqlOps)}`);

    // The state machine: every state reachable, terminals closed, no dead state.
    const machine = loadTs(src.state, (s) => (s === './executionPolicy.ts' ? policy : require(s)));
    const reachable = Object.keys(machine.JOB_TRANSITIONS);
    const targets = new Set();
    reachable.forEach((from) => machine.JOB_TRANSITIONS[from].forEach((to) => targets.add(to)));
    // Every state must be enterable (as a source or a target), the initial state must
    // never be RE-entered, and both terminal states must be closed. 'queued' is a
    // source only, on purpose: nothing may re-open a job.
    ok('CB5B-50', reachable.length === policy.JOB_STATUSES.length
      && policy.JOB_STATUSES.every((s) => reachable.includes(s) || targets.has(s))
      && !targets.has('queued')
      && machine.JOB_TRANSITIONS.completed.length === 0 && machine.JOB_TRANSITIONS.failed.length === 0,
      `every declared state must be reachable, nothing may re-enter the initial state, and both terminal states must be closed — targets=${JSON.stringify([...targets])}`);
    ok('CB5B-51', machine.isClaimEligible({ status: 'queued', next_attempt_at: new Date(0).toISOString(), attempt_count: 0, max_attempts: 1 }, Date.now()) === true
      && machine.isClaimEligible({ status: 'completed', attempt_count: 0, max_attempts: 1 }, Date.now()) === false
      && machine.isClaimEligible({ status: 'claimed', lease_expires_at: new Date(Date.now() + 60000).toISOString(), attempt_count: 0, max_attempts: 1 }, Date.now()) === false
      && machine.isClaimEligible({ status: 'claimed', lease_expires_at: new Date(Date.now() - 1000).toISOString(), attempt_count: 0, max_attempts: 1 }, Date.now()) === true,
      'the claim predicate must admit a due job, admit an EXPIRED lease, and refuse a live lease, a terminal state and an exhausted budget');

    // The checkpoint policy: kind immutability, monotonicity, CAS.
    const cpPolicy = loadTs(src.checkpoint, require);
    const committed = { checkpoint_scope: 'transactions', cursor_kind: 'ordered', cursor_ordinal: 10, cursor_token: null, cursor_version: 3 };
    ok('CB5B-52', cpPolicy.validateAdvance({ committed, advance: { scope: 'transactions', cursor_kind: 'ordered', expected_version: 3, cursor_ordinal: 11 } }).ok === true
      && cpPolicy.validateAdvance({ committed, advance: { scope: 'transactions', cursor_kind: 'ordered', expected_version: 3, cursor_ordinal: 10 } }).code === 'checkpoint_not_monotonic'
      && cpPolicy.validateAdvance({ committed, advance: { scope: 'transactions', cursor_kind: 'ordered', expected_version: 2, cursor_ordinal: 11 } }).code === 'checkpoint_stale'
      && cpPolicy.validateAdvance({ committed, advance: { scope: 'transactions', cursor_kind: 'opaque', expected_version: 3, cursor_token: 'v2:abc' } }).code === 'cursor_kind_is_immutable',
      'the checkpoint policy must advance a monotonic ordered cursor, refuse a backwards one, refuse a stale version and refuse a kind change');
    ok('CB5B-53', cpPolicy.isValidCheckpointScope('transactions:acct_1') && !cpPolicy.isValidCheckpointScope('anything')
      && !cpPolicy.isValidCheckpointScope('transactions; drop table x'),
      'checkpoint scopes must be a closed, bounded set — never caller-composed free text');

    // The system context can only be built from a DATABASE-VERIFIED claim.
    const system = loadTs(src.system, require);
    let forged = false;
    try {
      system.buildVerifiedContext({ verified: false, claim_state: 'lease_expired', job: { id: 'j', attempt_id: 'a' } });
      forged = true;
    } catch { forged = false; }
    ok('CB5B-54', forged === false
      && system.buildVerifiedContext({ verified: true, claim_state: 'live', job: { id: 'j1', attempt_id: 'a1' } }).authenticity === 'verified'
      && system.buildUnverifiedContext({ claimState: 'lease_expired', jobId: 'j1' }).authenticity === 'unverified',
      'a verified system context must be constructible ONLY from a database-verified claim — a forged or expired claim must be unrepresentable as verified');

    const forbidden = system.findForbiddenWakeBodyKeys;
    ok('CB5B-55', forbidden({ action: 'wake' }).length === 0
      && forbidden({ action: 'wake', job_id: 'x' }).length === 1
      && forbidden({ action: 'wake', system_context: {}, authenticity: 'verified', business_id: 'b', provider: 'plaid', credential_id: 'c', attempt_id: 'a', lease_id: 'l', worker_id: 'w' }).length === 8,
      'the wake surface must REFUSE every authority-shaped key (job, business, provider, credential, attempt, lease, system context, worker identity) rather than ignore it');
  }

  function checkEntry(src, policy) {
    const entry = src.entry;
    ok('CB5B-56', /findForbiddenWakeBodyKeys\(body\)/.test(entry) && /rejected_keys/.test(entry),
      'the wake surface must reject authority-shaped body keys and say so');
    ok('CB5B-57', /if \(!actor\.isAdmin\) \{/.test(entry) && /require a canonical platform admin/.test(entry),
      'wake and sweep must be gated on canonical platform admin standing');
    ok('CB5B-58', /authorizeBusinessAccess\(sb, actor, businessId\)/.test(entry),
      'status must be held to the ordinary business gate — the canonical one, not a second rule');
    ok('CB5B-59', /deriveWorkerId\(actorKind, actor\.profile_id\)/.test(entry) && !/body\.worker_id|body\.workerId/.test(entry),
      'the worker identity must be DERIVED server-side; reading a caller-supplied one would let a caller choose its own attribution');
    ok('CB5B-60', /DISABLED_PROVIDER_ADAPTER/.test(src.executor) && !/fetch\(/.test(src.executor)
      && !/https?:\/\//.test(src.executor) && !/\baxios\b|\bnode-fetch\b/.test(src.executor),
      'CB-005B must wire NO provider transport — the only adapter is the disabled one, and the executor performs no HTTP');
    ok('CB5B-61', /resolveCredential/.test(src.executor) && /safeLogFields/.test(src.executor)
      && !/console\.log\([^)]*(payload|credential|token|secret)/i.test(src.executor + entry),
      'the executor must resolve a credential only through the injected callback and must never log a payload, credential or token');
    ok('CB5B-62', !/provider_sync_jobs.*insert\b/i.test(src.repository)
      && !/\.insert\(/.test(src.repository),
      'the repository must never write a table directly — every mutation is an RPC that fences and validates');
    ok('CB5B-63', /provider_credential_resolve/.test(entry) && /p_business_connection_id/.test(entry)
      && /p_credential_type/.test(entry) && !/p_credential_id/.test(entry),
      'the credential resolver must be addressed by the ROTATION UNIT (business, connection, credential_type), never by a credential id — that is what makes execution rotation-correct');
    ok('CB5B-64', /EXECUTION_LIMITS\.CLAIM_BATCH_MAX/.test(entry) && /provider_calls_performed: false/.test(entry),
      'the wake response must state that no provider call was performed, and must publish the bound it used');

    // A REFUSAL MUST MUTATE NOTHING. The refusal branch may not call a job-state
    // writer: work that was never this worker's cannot be marked failed or retried by
    // it, and a denial that consumed the job would be a denial-of-service that anyone
    // able to send a wake could trigger by asking.
    const refusalAt = src.executor.indexOf('if (!decision || decision.executable !== true) {');
    const refusalEnd = refusalAt < 0 ? -1 : src.executor.indexOf("log('execution_authorized'", refusalAt);
    const refusalBlock = (refusalAt < 0 || refusalEnd < 0) ? '' : src.executor.slice(refusalAt, refusalEnd);
    ok('CB5B-97', refusalBlock.length > 0
      && !/completeJob\(/.test(refusalBlock) && !/ingestBatch\(/.test(refusalBlock) && !/renewLease\(/.test(refusalBlock),
      'the refusal branch must contain NO job-state writer — a refused execution writes nothing but the audit');

    // The execution budgets, all three of them, checked before every page.
    ok('CB5B-98', /pageBudgetExhausted\(execution\.pages\) \|\| observationBudgetExhausted\(execution\.observations\)/.test(src.executor)
      && /attemptBudgetExhausted\(\{ attemptStartedAtMs: startedAtMs/.test(src.executor)
      && /decideLeaseRenewal\(\{/.test(src.executor),
      'the loop must check the page, observation and attempt budgets before every page, and must decide lease renewal from the database lease');

    // The verification artifact: read-only, and it must probe the posture that matters.
    const verify = live(src.verify);
    const writes = verify.match(/^\s*(insert|update|delete|alter|drop|create|grant|revoke|truncate|begin|commit|rollback)\b/gim) || [];
    ok('CB5B-65', writes.length === 0, `the verification artifact must be READ-ONLY — found: ${writes.join(', ')}`);
    const required = ['information_schema.columns', 'pg_constraint', 'pg_indexes', 'pg_policies', 'has_table_privilege',
      'has_function_privilege', 'pg_get_functiondef', 'relrowsecurity', 'provider_operation_audit', 'business_facts',
      'provider_sync_checkpoints', 'provider_observations'];
    const missing = required.filter((r) => !src.verify.includes(r));
    ok('CB5B-66', missing.length === 0,
      `the verification artifact must probe columns, constraints, indexes, policies, privileges, function hardening and the freeze — missing: ${missing.join(', ')}`);
    ok('CB5B-67', /provider_sync_observation_ingest/.test(src.verify) && /insert into public\.provider_observations/.test(src.verify),
      'the verification must prove the deployed ingest body is append-only — one insert, no update and no delete');
    const declaredFns = (src.verify.match(/'provider_sync_[a-z_]+'|provider_sync_observation_ingest/g) || []);
    ok('CB5B-68', declaredFns.length >= FUNCTIONS.length - 1,
      'the verification must name every deployed function it certifies');
    ok('CB5B-69', /policy_count = 3/.test(src.verify) && /service_role/.test(src.verify) && /anon/.test(src.verify),
      'the verification must prove the policy count and the three-role privilege boundary');
    ok('CB5B-70', /NOT production certified/.test(src.verify),
      'the verification artifact must state that it does not certify the phase — a report that overstates itself is worse than none');

    // The report must certify the deletion rules from the CATALOGUE (confdeltype — the
    // action the server actually stored), assert an FK COUNT beside each rule (a rule
    // check over an empty set is vacuously true, which is the false green this file
    // exists to prevent), assert that NO evidence key cascades, and assert that the
    // intentional orchestration cascades are still cascades — so the retention fix
    // cannot pass by having deleted the design instead of correcting it.
    ok('CB5B-113',
      /confdeltype/.test(src.verify)
      && /observation_job_fk_count = 2 and f\.observation_job_fk_restrict_count = 2/.test(src.verify)
      && /f\.observation_connection_fk_restrict = 1/.test(src.verify)
      && /f\.observation_credential_fk_set_null = 1/.test(src.verify)
      && /f\.observation_cascading_fks = 0/.test(src.verify)
      && /f\.checkpoint_job_fk_count = 2 and f\.checkpoint_job_fk_cascade_count = 2/.test(src.verify)
      && /f\.job_orchestration_cascade_count = 2/.test(src.verify),
      'the verification must prove the deployed deletion rules from pg_constraint.confdeltype, with an FK count beside every rule and both intentional cascades still asserted');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BEHAVIOURAL CHECKS — the shipped pipeline, executed
  // ══════════════════════════════════════════════════════════════════════════
  function buildRunner(src, vocab) {
    const policy = loadTs(src.policy, require);
    const stateMod = loadTs(src.state, (s) => (s === './executionPolicy.ts' ? policy : require(s)));
    const identity = loadTs(src.identity, (s) => (s === '../providers/vocabulary.ts' ? vocab : s === './executionPolicy.ts' ? policy : require(s)));
    const checkpoint = loadTs(src.checkpoint, require);
    const system = loadTs(src.system, require);
    const repository = loadTs(src.repository, (s) => (s === './executionPolicy.ts' ? policy : require(s)));
    const actorStub = {
      authenticateActor: async (b) => {
        if (!b) { const e = new Error('Unauthorized'); e.status = 401; throw e; }
        return b.actor;
      },
      authorizeBusinessAccess: async () => true,
    };
    const kernel = loadTs(src.kernel, (s) => {
      if (s === './vocabulary.ts') return vocab;
      if (s === '../authz/actor.ts') return { authenticateActor: actorStub.authenticateActor, authorizeBusinessAccess: actorStub.authorizeBusinessAccess };
      if (s === '../businessScope/writeGuard.ts') return { validateBusinessScope: async () => ({ authorization_reason: 'owner (business_entities.profile_id)' }) };
      return require(s);
    });
    const executor = loadTs(src.executor, (s) => ({
      '../providers/authorization.ts': kernel,
      './executionPolicy.ts': policy,
      './observationIdentity.ts': identity,
      './checkpointPolicy.ts': checkpoint,
      './systemContext.ts': system,
      './jobRepository.ts': repository,
    }[s] || require(s)));

    RUNNER_API = { state: stateMod, identity };

    return {
      policy, state: stateMod, identity, checkpoint, system, repository, kernel, executor,
    };
  }

  /** A resume-aware adapter: pages are ordered ordinals, and it continues from the
   *  committed cursor exactly like a real page walker would. */
  function pagedAdapter(pages, opts = {}) {
    const calls = [];
    return {
      name: opts.name || 'test_paged',
      requiresCredential: !!opts.requiresCredential,
      calls,
      async fetchPage({ checkpoint, resolveCredential }) {
        calls.push({ checkpoint: checkpoint ? checkpoint.cursor_version : null });
        if (opts.credential) await resolveCredential();
        if (opts.failFirst && calls.length === 1) {
          return { ok: false, rate_limited: true, retry_after_seconds: 600, error_class: 'rate_limited' };
        }
        const start = checkpoint && typeof checkpoint.cursor_ordinal === 'number' ? checkpoint.cursor_ordinal : 0;
        const page = pages.find((p) => p.ordinal > start);
        if (!page) return { ok: true, drafts: [], scope: opts.scope || 'transactions', done: true };
        return {
          ok: true,
          drafts: page.drafts,
          scope: opts.scope || 'transactions',
          next: { cursor_kind: 'ordered', cursor_ordinal: page.ordinal },
          done: opts.neverDone ? false : page.ordinal === pages[pages.length - 1].ordinal && !opts.keepGoing,
        };
      },
    };
  }

  function draft(index, overrides = {}) {
    return {
      object_type: 'transaction',
      provider_object_id: `txn-${index}`,
      value_kind: 'amount',
      source_version: 'v1',
      payload: { amount: index * 10, currency: 'USD' },
      ...overrides,
    };
  }

  async function runBehavioural(src, vocab, emit, overrides = {}) {
    let R = null;
    try {
      R = buildRunner(src, vocab);
    } catch (e) {
      emit('CB5B-71:load', false, `the shipped pipeline did not load: ${e.message}`);
      return;
    }
    emit('CB5B-71:load', typeof R.executor.executeClaimedJob === 'function'
      && typeof R.executor.runWorkerWake === 'function'
      && typeof R.repository.claimJobs === 'function'
      && typeof R.kernel.authorizeProviderOperation === 'function',
      'the executor, the repository and the certification kernel must all load and export their entry points');

    const failures = [];
    const t = (id, condition, detail) => {
      emit(id, condition, detail);
      if (!condition) failures.push(id);
    };

    // The model is wired to the SHIPPED state predicate and semantic vocabularies, so
    // it cannot drift from the module it stands in for. Mutation-only overrides are
    // merged here, which is how the mutation pass weakens the database deliberately.
    RUNNER_API = { state: R.state, identity: R.identity };
    const build = (options = {}) => {
      const world = createWorld({ ...overrides, ...options, api: RUNNER_API });
      world.api = RUNNER_API;
      return world;
    };

    // ── T0 · the fixtures are shape-valid rows the real table would accept ────
    {
      const w = build();
      t('CB5B-72', R.state.rowShapeViolations(w.job()).length === 0
        && R.state.rowShapeViolations({ status: 'claimed', attempt_id: 'a', lease_id: 'l', claimed_by: 'w', lease_expires_at: new Date().toISOString(), attempt_started_at: new Date().toISOString(), attempt_count: 0, max_attempts: 1 }).length === 0
        && R.state.rowShapeViolations({ status: 'queued', attempt_id: 'a', lease_id: 'l', lease_expires_at: new Date().toISOString(), attempt_count: 0, max_attempts: 1 }).includes('non_claimed_with_live_lease_columns'),
        'the lease-shape invariant must accept a correct row and reject a non-claimed job that still carries live lease columns');
    }

    // ── TD · THE ABSOLUTE ATTEMPT DEADLINE, exercised ────────────────────────
    {
      // A 30-second attempt asked for a 900-second lease: the grant is capped at the
      // attempt's own deadline, and the row the database writes is a legal one.
      const w = build({ maxAttemptSeconds: 30 });
      // The lock-doctrine and authorization-boundary regressions run here, inside the TD
      // fixture, so their failures are collected by this suite rather than reported twice.
      await hardeningBehaviouralTests({ R, build, t, draft });

      const granted = (await R.repository.claimJobs(w.sb, { workerId: 'worker-A', limit: 5, leaseSeconds: 900 }))[0];
      const grantMs = Date.parse(granted.lease_expires_at) - Date.parse(granted.attempt_started_at);
      t('CB5B-122', grantMs === 30000 && R.state.rowShapeViolations(w.job()).length === 0,
        `a 900-second lease request against a 30-second attempt must be GRANTED 30 seconds, and the row must stay shape-valid (grant=${grantMs}ms)`);

      // Renewal immediately BEFORE the deadline is allowed — and still capped at it.
      w.tick(29000);
      const renewed = await R.repository.renewLease(w.sb, {
        jobId: granted.id, attemptId: granted.attempt_id, leaseId: granted.lease_id, workerId: 'worker-A', leaseSeconds: 900,
      });
      const renewMs = Date.parse(w.job().lease_expires_at) - Date.parse(w.job().attempt_started_at);
      t('CB5B-123', renewed === true && renewMs === 30000,
        `renewal one second before the deadline must SUCCEED and stay capped at the deadline (renewed=${renewed}, lease=${renewMs}ms)`);

      // AT the exact deadline: renewal, authorization, ingestion and completion each
      // refuse, each on its own terms.
      w.tick(1000);
      const atDeadline = await R.repository.renewLease(w.sb, {
        jobId: granted.id, attemptId: granted.attempt_id, leaseId: granted.lease_id, workerId: 'worker-A', leaseSeconds: 900,
      });
      t('CB5B-124', atDeadline === false,
        `renewal AT the exact deadline must be REFUSED (got ${atDeadline})`);

      const auth = await R.repository.authorizeClaim(w.sb, {
        jobId: granted.id, attemptId: granted.attempt_id, leaseId: granted.lease_id, workerId: 'worker-A',
      });
      t('CB5B-125', auth.verified === false && auth.claim_state === 'attempt_expired',
        `authorization at the deadline must refuse with its OWN state, independently of the lease (saw ${auth.claim_state})`);

      // Ingestion after the deadline: refused whole — nothing written, no cursor moved.
      const before = { obs: w.state.observations.length, cp: JSON.stringify(w.state.checkpoints) };
      let ingestErr = null;
      try {
        await R.repository.ingestBatch(w.sb, {
          jobId: granted.id, attemptId: granted.attempt_id, leaseId: granted.lease_id, workerId: 'worker-A',
          observations: [draft(1)],
          checkpoint: { scope: 'transactions', cursor_kind: 'ordered', expected_version: 0, cursor_ordinal: 100 },
        });
      } catch (e) { ingestErr = e.code; }
      t('CB5B-126', ingestErr === 'ATTEMPT_EXPIRED' && w.state.observations.length === before.obs
        && JSON.stringify(w.state.checkpoints) === before.cp,
        `ingestion after the deadline must refuse with ATTEMPT_EXPIRED and write NOTHING — no observation, no checkpoint, no cursor movement (code=${ingestErr}, observations=${w.state.observations.length})`);

      // Completion after the deadline: its own verdict, and the job is left untouched.
      const verdict = await R.repository.completeJob(w.sb, {
        jobId: granted.id, attemptId: granted.attempt_id, leaseId: granted.lease_id, workerId: 'worker-A', outcome: 'completed',
      });
      t('CB5B-127', verdict === 'ATTEMPT_EXPIRED' && w.job().status === 'claimed',
        `a stale completion must be refused with its OWN verdict and must change nothing (verdict=${verdict}, status=${w.job().status})`);

      // RECOVERY: the same attempt, expired, is reclaimable with a NEW identity.
      const reclaimed = (await R.repository.claimJobs(w.sb, { workerId: 'worker-B', limit: 5 }))[0];
      t('CB5B-128', !!reclaimed && reclaimed.attempt_id !== granted.attempt_id && reclaimed.lease_id !== granted.lease_id
        && reclaimed.attempt_count === 2 && R.state.rowShapeViolations(w.job()).length === 0,
        'an attempt that ran out of time must remain RECOVERABLE: claim must take it with a NEW attempt and lease while budget remains');
    }

    {
      // An exhausted attempt past its deadline is RETIRED by the sweep, not stranded.
      const w = build({ maxAttempts: 1, maxAttemptSeconds: 30 });
      const granted = (await R.repository.claimJobs(w.sb, { workerId: 'worker-A', limit: 5, leaseSeconds: 900 }))[0];
      w.tick(31000);
      const swept = await R.repository.sweepJobs(w.sb, { limit: 10 });
      t('CB5B-129', swept === 1 && w.job().status === 'failed' && w.job().last_error_class === 'transient_exhausted',
        `an exhausted attempt past its deadline must be RETIRED (swept=${swept}, status=${w.job().status}, class=${w.job().last_error_class})`);

      // A deadline that passes WHILE the unit waits for its keys still refuses at the
      // mutation boundary, and still writes nothing.
      const w2 = build({ maxAttemptSeconds: 30, boundaryTickMs: 31000 });
      const g2 = (await R.repository.claimJobs(w2.sb, { workerId: 'worker-A', limit: 5, leaseSeconds: 900 }))[0];
      let boundaryErr = null;
      try {
        await R.repository.ingestBatch(w2.sb, {
          jobId: g2.id, attemptId: g2.attempt_id, leaseId: g2.lease_id, workerId: 'worker-A',
          observations: [draft(1)],
          checkpoint: { scope: 'transactions', cursor_kind: 'ordered', expected_version: 0, cursor_ordinal: 100 },
        });
      } catch (e) { boundaryErr = e.code; }
      t('CB5B-130', boundaryErr === 'ATTEMPT_EXPIRED' && w2.state.observations.length === 0 && w2.state.checkpoints.length === 0,
        `a deadline that passes while the unit WAITS for its keys must still refuse at the mutation boundary (code=${boundaryErr}, observations=${w2.state.observations.length}, checkpoints=${w2.state.checkpoints.length})`);
    }

    // ── A LEASE THAT LAPSES WHILE THE UNIT WAITS FOR ITS KEYS ────────────────
    // The probe above is about the DEADLINE. This pair is about the LEASE, and it is the
    // discriminating case: the grant is capped at the attempt's own deadline, never
    // extended to it, so a 30-second lease on a 600-second attempt can lapse while the
    // attempt is still comfortably inside its budget. A boundary re-read of the deadline
    // alone would have admitted this batch — which is exactly what makes the pair a test
    // of the correction rather than a restatement of it.
    {
      const w3 = build({ maxAttemptSeconds: 600, boundaryTickMs: 30000 });
      const g3 = (await R.repository.claimJobs(w3.sb, { workerId: 'worker-A', limit: 5, leaseSeconds: 30 }))[0];
      let err = null;
      let receipt = null;
      try {
        receipt = await R.repository.ingestBatch(w3.sb, {
          jobId: g3.id, attemptId: g3.attempt_id, leaseId: g3.lease_id, workerId: 'worker-A',
          observations: [draft(1)],
          checkpoint: { scope: 'transactions', cursor_kind: 'ordered', expected_version: 0, cursor_ordinal: 100 },
        });
      } catch (e) { err = e.code; }
      t('CB5B-144', err === 'LEASE_FENCED' && receipt === null
        && w3.state.observations.length === 0 && w3.state.checkpoints.length === 0
        && w3.job().status === 'claimed',
        `a lease that lapses while the unit WAITS for its keys must be refused AT the boundary — nothing written, no cursor moved, the job left claimed (code=${err}, observations=${w3.state.observations.length}, checkpoints=${w3.state.checkpoints.length})`);

      // The same unit, on a live lease, must ingest normally: the refusal above is a
      // verdict about the clock, not a failure of the batch, the identity or the locks.
      const w4 = build({ maxAttemptSeconds: 600 });
      const g4 = (await R.repository.claimJobs(w4.sb, { workerId: 'worker-A', limit: 5, leaseSeconds: 30 }))[0];
      const ok4 = await R.repository.ingestBatch(w4.sb, {
        jobId: g4.id, attemptId: g4.attempt_id, leaseId: g4.lease_id, workerId: 'worker-A',
        observations: [draft(1)],
        checkpoint: { scope: 'transactions', cursor_kind: 'ordered', expected_version: 0, cursor_ordinal: 100 },
      }).then((r) => r, (e) => ({ error: e.code }));
      t('CB5B-145', ok4.inserted === 1 && ok4.delivered === 1 && !ok4.error
        && w4.state.observations.length === 1
        && w4.state.checkpoints.length === 1 && w4.state.checkpoints[0].cursor_version === 1,
        `the SAME unit must ingest while its lease is live — one observation inserted and the cursor advanced once (inserted=${ok4.inserted}, rows=${w4.state.observations.length}, cursor=${w4.state.checkpoints[0] && w4.state.checkpoints[0].cursor_version}, error=${ok4.error || 'none'})`);
    }

    // ── T1 · two workers race for the same job ───────────────────────────────
    {
      const w = build();
      const a = await R.repository.claimJobs(w.sb, { workerId: 'worker-A', limit: 5 });
      const b = await R.repository.claimJobs(w.sb, { workerId: 'worker-B', limit: 5 });
      t('CB5B-73', a.length === 1 && b.length === 0 && w.job().attempt_count === 1
        && w.job().claimed_by === 'worker-A',
        `two workers must receive DISJOINT claims: A=${a.length}, B=${b.length}, attempts=${w.job().attempt_count}`);
    }

    // ── T2 · an expired claimed lease is RECOVERED, with a new identity ──────
    {
      const w = build();
      const first = (await R.repository.claimJobs(w.sb, { workerId: 'worker-A', limit: 5 }))[0];
      const staleAttempt = first.attempt_id;
      const staleLease = first.lease_id;
      w.tick(200000); // past the 180s lease
      const second = (await R.repository.claimJobs(w.sb, { workerId: 'worker-B', limit: 5 }))[0];
      t('CB5B-74', Boolean(second)
        && second.attempt_id !== staleAttempt && second.lease_id !== staleLease
        && second.attempt_count === 2 && second.claimed_by === 'worker-B'
        && R.state.rowShapeViolations(w.job()).length === 0,
        'a job whose lease expired must be reclaimed with a NEW attempt and lease, the attempt budget consumed, and the row still shape-valid');

      // ── T3 · the stale worker can no longer write ────────────────────────
      let fenced = null;
      try {
        await R.repository.ingestBatch(w.sb, {
          jobId: w.job().id, attemptId: staleAttempt, leaseId: staleLease, workerId: 'worker-A',
          observations: [{ object_type: 'transaction', provider_object_id: 'txn-stale', value_kind: 'amount', source_version: 'v1', payload: { amount: 1 } }],
          checkpoint: null,
        });
      } catch (e) { fenced = e.code; }
      t('CB5B-75', fenced === 'LEASE_FENCED' && w.state.observations.length === 0,
        `a worker whose lease was superseded must be refused by the database (saw ${fenced}) and must write nothing (observations=${w.state.observations.length})`);
    }

    // ── T4 · a stale checkpoint version loses the compare-and-swap, and the
    //         batch ROLLS BACK with it ─────────────────────────────────────────
    {
      const w = build();
      await R.repository.claimJobs(w.sb, { workerId: 'worker-A', limit: 5 });
      const job = w.job();
      const ids = { jobId: job.id, attemptId: job.attempt_id, leaseId: job.lease_id, workerId: 'worker-A' };
      await R.repository.ingestBatch(w.sb, { ...ids, observations: [], checkpoint: { scope: 'transactions', cursor_kind: 'ordered', expected_version: 0, cursor_ordinal: 100 } });
      const version = w.state.checkpoints[0].cursor_version;
      let stale = null;
      try {
        await R.repository.ingestBatch(w.sb, {
          ...ids,
          observations: [{ object_type: 'transaction', provider_object_id: 'txn-lost', value_kind: 'amount', source_version: 'v1', payload: { amount: 7 } }],
          checkpoint: { scope: 'transactions', cursor_kind: 'ordered', expected_version: 0, cursor_ordinal: 200 },
        });
      } catch (e) { stale = e.code; }
      t('CB5B-76', version === 1 && stale === 'CHECKPOINT_STALE'
        && w.state.observations.length === 0 && w.state.checkpoints[0].cursor_version === 1,
        `a lost compare-and-swap must raise (saw ${stale}), leave the cursor at 1 and leave NO observation committed (observations=${w.state.observations.length}) — the unit is atomic in both directions`);
    }

    // ── T5 · the lease expires mid-flight: stop, commit nothing new, stay recoverable
    {
      const w = build();
      const pages = [{ ordinal: 100, drafts: [draft(1)] }, { ordinal: 200, drafts: [draft(2)] }];
      let calls = 0;
      const adapter = {
        name: 'expiring',
        async fetchPage() {
          calls += 1;
          if (calls === 1) return { ok: true, drafts: [draft(1)], scope: 'transactions', next: { cursor_kind: 'ordered', cursor_ordinal: 100 } };
          // The second page arrives after the lease has lapsed.
          w.tick(200000);
          return { ok: true, drafts: [draft(2)], scope: 'transactions', next: { cursor_kind: 'ordered', cursor_ordinal: 200 } };
        },
      };
      const claimed = (await R.repository.claimJobs(w.sb, { workerId: 'worker-A', limit: 5 }))[0];
      const outcome = await R.executor.executeClaimedJob({
        sb: w.sb, workerId: 'worker-A', job: claimed, adapter, now: w.now,
        resolveCredential: async () => SECRET_MARKER,
      });
      const job = w.job();
      t('CB5B-77', outcome.outcome === 'lease_lost' && job.status === 'claimed' && job.completed_at === null
        && w.state.observations.length === 1 && w.state.checkpoints[0].cursor_version === 1,
        `a worker that loses its lease mid-flight must stop and NOT complete the job (saw outcome=${outcome.outcome}, status=${job.status}); the page it committed while the lease was live stays committed`);
      // …and the job is recoverable by the next worker.
      const recovered = await R.repository.claimJobs(w.sb, { workerId: 'worker-B', limit: 5 });
      t('CB5B-78', recovered.length === 1 && recovered[0].attempt_count === 2,
        'the abandoned job must be recoverable by another worker without operator intervention');
    }

    // ── T6 · a foreign job cannot be executed, and the refusal writes nothing ─
    {
      const w = build();
      const outcome = await R.executor.executeClaimedJob({
        sb: w.sb, workerId: 'worker-A',
        job: { id: '00000000-0000-4000-8000-00000000ffff', attempt_id: 'a', lease_id: 'l', claimed_by: 'worker-A' },
        adapter: pagedAdapter([{ ordinal: 100, drafts: [draft(1)] }]), now: w.now,
      });
      const audit = w.state.audit[w.state.audit.length - 1] || {};
      t('CB5B-79', outcome.outcome === 'claim_not_verified' && w.state.observations.length === 0
        && w.state.checkpoints.length === 0 && audit.p_reason_code === 'PROVIDER_AUTHENTICITY_FAILED'
        && audit.p_decision === 'deny' && audit.p_actor_kind === 'system',
        `a job identity that is not this worker's must be refused and AUDITED as an unverified system attempt (reason=${audit.p_reason_code}), with no write of any kind`);
    }

    // ── T7 · cross-connection credential, and a refusal that consumes nothing ──
    {
      const w = build({ credentialConnection: CONN_B });
      await R.repository.claimJobs(w.sb, { workerId: 'worker-A', limit: 5 });
      const job = w.job();
      const adapter = pagedAdapter([{ ordinal: 100, drafts: [draft(1)] }]);
      const outcome = await R.executor.executeClaimedJob({ sb: w.sb, workerId: 'worker-A', job, adapter, now: w.now });
      const audit = w.state.audit[w.state.audit.length - 1] || {};
      t('CB5B-80', outcome.outcome === 'not_executable' && adapter.calls.length === 0
        && w.state.observations.length === 0 && audit.p_reason_code === 'CREDENTIAL_UNAVAILABLE'
        && w.job().status === 'claimed',
        `a credential belonging to another connection must refuse execution (saw ${outcome.outcome}/${audit.p_reason_code}) WITHOUT consuming the attempt or touching the adapter`);
    }

    // ── T8 · an unusable connection is refused, and the refusal writes nothing ─
    {
      const w = build({ connectionStatus: 'needs_attention' });
      await R.repository.claimJobs(w.sb, { workerId: 'worker-A', limit: 5 });
      const job = w.job();
      const adapter = pagedAdapter([{ ordinal: 100, drafts: [draft(1)] }]);
      const outcome = await R.executor.executeClaimedJob({ sb: w.sb, workerId: 'worker-A', job, adapter, now: w.now });
      t('CB5B-81', outcome.outcome === 'not_executable' && adapter.calls.length === 0
        && w.state.observations.length === 0 && w.job().status === 'claimed',
        'an unusable connection must refuse execution before any provider call, and must leave the job exactly as the claim left it');
    }

    // ── T9 · a forged provider identifier in the row cannot change the audit ──
    {
      const w = build();
      await R.repository.claimJobs(w.sb, { workerId: 'worker-A', limit: 5 });
      const job = { ...w.job(), provider: 'plaid', provider_operation: 'balances.read' };
      const adapter = pagedAdapter([{ ordinal: 100, drafts: [draft(1)] }]);
      await R.executor.executeClaimedJob({ sb: w.sb, workerId: 'worker-A', job, adapter, now: w.now });
      const audit = w.state.audit[w.state.audit.length - 1] || {};
      t('CB5B-82', audit.p_provider === 'quickbooks' && audit.p_operation === 'sync.execute'
        && audit.p_resource_type === 'sync_job' && audit.p_resource_id === w.job().id,
        `the audit must record the ROW-derived provider and the authorization operation (saw ${audit.p_provider}/${audit.p_operation}); a tampered identifier must be inert`);
    }

    // ── T10 · duplicate delivery is idempotent ───────────────────────────────
    {
      const w = build();
      await R.repository.claimJobs(w.sb, { workerId: 'worker-A', limit: 5 });
      const job = w.job();
      const ids = { jobId: job.id, attemptId: job.attempt_id, leaseId: job.lease_id, workerId: 'worker-A' };
      const built = await R.identity.buildIngestBatch({ businessId: BIZ_A, provider: 'quickbooks', connectionId: CONN_A, drafts: [draft(1), draft(2)] });
      const first = await R.repository.ingestBatch(w.sb, { ...ids, observations: built.observations, checkpoint: null });
      const second = await R.repository.ingestBatch(w.sb, { ...ids, observations: built.observations, checkpoint: null });
      t('CB5B-83', built.ok === true && first.inserted === 2 && second.inserted === 0
        && second.duplicates === 2 && w.state.observations.length === 2,
        `re-delivering the same logical observations must insert nothing new (first=${first.inserted}, second=${second.inserted}, duplicates=${second.duplicates}, rows=${w.state.observations.length})`);
    }

    // ── T11 · a genuine version change is preserved, not collapsed ───────────
    {
      const w = build();
      await R.repository.claimJobs(w.sb, { workerId: 'worker-A', limit: 5 });
      const job = w.job();
      const ids = { jobId: job.id, attemptId: job.attempt_id, leaseId: job.lease_id, workerId: 'worker-A' };
      const v1 = await R.identity.buildIngestBatch({ businessId: BIZ_A, provider: 'quickbooks', connectionId: CONN_A, drafts: [draft(1)] });
      await R.repository.ingestBatch(w.sb, { ...ids, observations: v1.observations, checkpoint: null });
      const v2 = await R.identity.buildIngestBatch({ businessId: BIZ_A, provider: 'quickbooks', connectionId: CONN_A, drafts: [draft(1, { source_version: 'v2', payload: { amount: 999, currency: 'USD' } })] });
      const second = await R.repository.ingestBatch(w.sb, { ...ids, observations: v2.observations, checkpoint: null });
      const versions = w.state.observations.map((o) => o.source_version).sort();
      t('CB5B-84', second.inserted === 1 && w.state.observations.length === 2
        && versions.join(',') === 'v1,v2',
        `a legitimate source-record change must be a NEW observation (versions=${JSON.stringify(versions)}), never a collapsed duplicate`);
    }

    // ── T12 · value_kind is part of identity, so two dimensions are two rows ──
    {
      const w = build();
      await R.repository.claimJobs(w.sb, { workerId: 'worker-A', limit: 5 });
      const job = w.job();
      const ids = { jobId: job.id, attemptId: job.attempt_id, leaseId: job.lease_id, workerId: 'worker-A' };
      const built = await R.identity.buildIngestBatch({
        businessId: BIZ_A, provider: 'quickbooks', connectionId: CONN_A,
        drafts: [draft(1, { value_kind: 'amount', payload: { amount: 10 } }), draft(1, { value_kind: 'status', payload: { status: 'posted' } })],
      });
      const receipt = await R.repository.ingestBatch(w.sb, { ...ids, observations: built.observations, checkpoint: null });
      t('CB5B-85', receipt.inserted === 2 && w.state.observations.length === 2
        && new Set(w.state.observations.map((o) => o.dedup_key)).size === 2,
        'the same provider object and version observed in two semantic dimensions must be two rows (a value_kind collision would silently lose one)');
    }

    // ── T13 · a crash-retry cannot skip or duplicate unpersisted records ─────
    {
      const w = build();
      await R.repository.claimJobs(w.sb, { workerId: 'worker-A', limit: 5 });
      const job = w.job();
      const ids = { jobId: job.id, attemptId: job.attempt_id, leaseId: job.lease_id, workerId: 'worker-A' };
      const page1 = await R.identity.buildIngestBatch({ businessId: BIZ_A, provider: 'quickbooks', connectionId: CONN_A, drafts: [draft(1)] });
      const page2 = await R.identity.buildIngestBatch({ businessId: BIZ_A, provider: 'quickbooks', connectionId: CONN_A, drafts: [draft(2)] });
      const first = await R.repository.ingestBatch(w.sb, {
        ...ids, observations: page1.observations,
        checkpoint: { scope: 'transactions', cursor_kind: 'ordered', expected_version: 0, cursor_ordinal: 100 },
      });

      // The writer's view of the cursor is STALE — the crash happened before it recorded
      // v=1 — so the whole unit is refused and NOTHING is committed with it. A partial
      // commit here is exactly how a source record would be silently skipped.
      let stale = null;
      try {
        await R.repository.ingestBatch(w.sb, {
          ...ids, observations: page2.observations,
          checkpoint: { scope: 'transactions', cursor_kind: 'ordered', expected_version: 0, cursor_ordinal: 200 },
        });
      } catch (e) { stale = e.code; }
      const afterStale = { rows: w.state.observations.length, version: w.state.checkpoints[0].cursor_version };

      // The retry, carrying the version it should have had, commits page two and only
      // then moves the cursor forward — monotonically, and with nothing skipped.
      const second = await R.repository.ingestBatch(w.sb, {
        ...ids, observations: page2.observations,
        checkpoint: { scope: 'transactions', cursor_kind: 'ordered', expected_version: 1, cursor_ordinal: 200 },
      });
      t('CB5B-86', first.inserted === 1 && stale === 'CHECKPOINT_STALE'
        && afterStale.rows === 1 && afterStale.version === 1
        && second.inserted === 1 && w.state.observations.length === 2
        && w.state.checkpoints[0].cursor_version === 2
        && w.state.checkpoints[0].cursor_ordinal === 200,
        `a crash-retry must roll the stale unit back completely (rows=${afterStale.rows}, version=${afterStale.version}) and then commit the page and its cursor together (rows=${w.state.observations.length}, cursor=${w.state.checkpoints[0].cursor_version}@${w.state.checkpoints[0].cursor_ordinal}) — no skipping, no duplicating`);
    }

    // ── T14 · a partial batch failure rolls the WHOLE unit back ──────────────
    {
      const w = build();
      await R.repository.claimJobs(w.sb, { workerId: 'worker-A', limit: 5 });
      const job = w.job();
      const ids = { jobId: job.id, attemptId: job.attempt_id, leaseId: job.lease_id, workerId: 'worker-A' };
      const good = await R.identity.buildIngestBatch({ businessId: BIZ_A, provider: 'quickbooks', connectionId: CONN_A, drafts: [draft(1)] });
      let code = null;
      try {
        await R.repository.ingestBatch(w.sb, {
          ...ids,
          observations: [...good.observations, { object_type: 'transaction', provider_object_id: 'txn-bad', value_kind: 'not_a_kind', source_version: 'v1', payload: {} }],
          checkpoint: { scope: 'transactions', cursor_kind: 'ordered', expected_version: 0, cursor_ordinal: 100 },
        });
      } catch (e) { code = e.code; }
      t('CB5B-87', code === 'REJECTED_INPUT' && w.state.observations.length === 0
        && w.state.checkpoints.length === 0,
        `one invalid observation must fail the whole unit (saw ${code}) and commit NOTHING — neither the good rows nor the cursor`);
    }

    // ── T15 · bounded retries, and exhaustion is terminal and visible ────────
    {
      const w = build({ maxAttempts: 2 });
      // The adapter is rate-limited once; the worker must NOT hammer it in place.
      const adapter = pagedAdapter([{ ordinal: 100, drafts: [draft(1)] }], { failFirst: true });
      const firstClaim = (await R.repository.claimJobs(w.sb, { workerId: 'worker-A', limit: 5 }))[0];
      const first = await R.executor.executeClaimedJob({ sb: w.sb, workerId: 'worker-A', job: firstClaim, adapter, now: w.now });
      t('CB5B-88', first.outcome === 'retry_wait' && first.error_class === 'rate_limited'
        && adapter.calls.length === 1 && w.job().next_attempt_at > new Date(w.now()).toISOString(),
        `a rate limit must DEFER, not retry in place (calls=${adapter.calls.length}, outcome=${first.outcome})`);

      // Walk the job to exhaustion.
      let guard = 0;
      while (!R.state.isTerminalStatus(w.job().status) && guard < 10) {
        guard += 1;
        w.tick(1000000);
        const claimed = await R.repository.claimJobs(w.sb, { workerId: 'worker-A', limit: 5 });
        if (claimed.length === 0) break;
        await R.executor.executeClaimedJob({ sb: w.sb, workerId: 'worker-A', job: claimed[0], adapter: pagedAdapter([], { failFirst: true }), now: w.now });
      }
      const swept = await R.repository.sweepJobs(w.sb, { limit: 10 });
      t('CB5B-89', R.state.isTerminalStatus(w.job().status) && w.job().last_error_class === 'transient_exhausted',
        `repeated retryable failures must end in a TERMINAL, visible failure (status=${w.job().status}, class=${w.job().last_error_class}, swept=${swept}) rather than retrying forever`);
    }

    // ── T16 · oversized payloads and unbounded page counts are refused ───────
    {
      const w = build();
      const huge = await R.identity.buildIngestBatch({
        businessId: BIZ_A, provider: 'quickbooks', connectionId: CONN_A,
        drafts: [draft(1, { payload: { blob: 'x'.repeat(PAYLOAD_BYTES + 100) } })],
      });
      t('CB5B-90', huge.ok === false && huge.errors.length === 1 && huge.errors[0].code === 'payload_too_large',
        'an oversized payload must be refused locally with a specific code rather than sent and rejected by the database');

      await R.repository.claimJobs(w.sb, { workerId: 'worker-A', limit: 5 });
      const job = w.job();
      let pages = 0;
      const endless = {
        name: 'endless',
        async fetchPage({ checkpoint }) {
          pages += 1;
          const start = checkpoint && typeof checkpoint.cursor_ordinal === 'number' ? checkpoint.cursor_ordinal : 0;
          return { ok: true, drafts: [], scope: 'transactions', next: { cursor_kind: 'ordered', cursor_ordinal: start + 100 } };
        },
      };
      const outcome = await R.executor.executeClaimedJob({ sb: w.sb, workerId: 'worker-A', job, adapter: endless, now: w.now });
      t('CB5B-91', outcome.outcome === 'retry_wait' && pages <= R.policy.EXECUTION_LIMITS.MAX_PAGES_PER_EXECUTION,
        `an unbounded page walk must be stopped by the page budget (pages=${pages}, outcome=${outcome.outcome}) and deferred, not run forever`);
    }

    // ── T17 · the completed path, end to end, with nothing leaked ────────────
    {
      const w = build();
      let resolverCalls = 0;
      const adapter = pagedAdapter([{ ordinal: 100, drafts: [draft(1)] }, { ordinal: 200, drafts: [draft(2)] }], { credential: true });
      const logs = [];
      const claimed = (await R.repository.claimJobs(w.sb, { workerId: 'worker-A', limit: 5 }))[0];
      const outcome = await R.executor.executeClaimedJob({
        sb: w.sb, workerId: 'worker-A', job: claimed, adapter, now: w.now,
        logger: (event, fields) => logs.push(`${event} ${JSON.stringify(fields)}`),
        resolveCredential: async () => { resolverCalls += 1; return SECRET_MARKER; },
      });
      const everything = JSON.stringify({ outcome, logs, audit: w.state.audit, observations: w.state.observations });
      t('CB5B-92', outcome.outcome === 'completed' && w.job().status === 'completed'
        && w.state.observations.length === 2 && w.state.checkpoints[0].cursor_version === 2
        // The adapter resolves ONCE PER PAGE and retains nothing: two pages fetched means two
        // resolutions, and the plaintext is used for that fetch only (CB5B-93 proves no leak).
        && resolverCalls === 2 && adapter.calls.length === 2 && w.state.factWrites === 0,
        `the full pipeline must complete the job, persist both pages and advance the cursor twice (status=${w.job().status}, rows=${w.state.observations.length}, cursor=${w.state.checkpoints[0].cursor_version}, credential_resolutions=${resolverCalls}, page_fetches=${adapter.calls.length}, fact_writes=${w.state.factWrites})`);
      t('CB5B-93', everything.indexOf(SECRET_MARKER) === -1,
        'the resolved credential plaintext must appear in NO outcome, log line, audit row or observation — the boundary is one-way');
    }

    // ── T18 · a refusal never causes a credential to be resolved ────────────
    {
      const w = build({ connectionStatus: 'needs_attention' });
      await R.repository.claimJobs(w.sb, { workerId: 'worker-A', limit: 5 });
      const adapter = pagedAdapter([{ ordinal: 100, drafts: [draft(1)] }], { credential: true });
      await R.executor.executeClaimedJob({
        sb: w.sb, workerId: 'worker-A', job: w.job(), adapter, now: w.now,
        resolveCredential: async () => { w.state.credentialResolutions += 1; return SECRET_MARKER; },
      });
      t('CB5B-94', w.state.credentialResolutions === 0 && w.state.audit[w.state.audit.length - 1].p_decision === 'deny',
        'a DENIED execution must never reach the credential boundary — capability is not authorization, and plaintext must not exist for a refused call');
    }

    // ── T19 · the worker identity is derived, and the wake pass is bounded ──
    {
      const ids = new Set([R.repository.deriveWorkerId('admin', 'p1'), R.repository.deriveWorkerId('admin', 'p1')]);
      const w = build();
      const wake = await R.executor.runWorkerWake({ sb: w.sb, workerId: 'admin:p1:nonce', adapter: pagedAdapter([]), now: w.now, maxExecutions: 5 });
      t('CB5B-95', ids.size === 2 && wake.evaluated <= R.policy.EXECUTION_LIMITS.MAX_EXECUTIONS_PER_WAKE
        && w.job().claimed_by === 'admin:p1:nonce',
        'each execution must carry its own derived worker identity, and one wake must never exceed its execution budget');
    }

    // ── T20 · enqueue is idempotent, and one live job per scope is structural ─
    {
      const w = build();
      const first = await R.repository.enqueueJob(w.sb, { businessId: BIZ_A, connectionId: CONN_A, credentialId: CRED_A, provider: 'quickbooks', providerOperation: 'transactions.read' });
      const second = await R.repository.enqueueJob(w.sb, { businessId: BIZ_A, connectionId: CONN_A, credentialId: CRED_A, provider: 'quickbooks', providerOperation: 'transactions.read' });
      const other = await R.repository.enqueueJob(w.sb, { businessId: BIZ_A, connectionId: CONN_A, credentialId: CRED_A, provider: 'quickbooks', providerOperation: 'accounts.read' });
      t('CB5B-96', first === second && first !== other && w.state.jobs.length === 2,
        `re-enqueuing the same scope must return the live job, not create a second one (distinct operations remain distinct jobs)`);
      ok('CB5B-96:partial', /create unique index if not exists provider_sync_jobs_one_active_per_scope_idx[\s\S]{0,220}where status in \('queued', 'claimed', 'retry_wait'\)/.test(live(src.mig)),
        'the one-live-job-per-scope rule must be a PARTIAL UNIQUE INDEX, so it holds under concurrency and not merely in the enqueue function');
    }

    // ── T20 · the schedule column survives a whole lifecycle ─────────────────
    {
      const w = build();
      const seen = [];
      const snap = (label) => seen.push(`${label}:${w.job().status}:${w.job().next_attempt_at === null ? 'null' : 'set'}`);
      snap('seed');
      const claimed = (await R.repository.claimJobs(w.sb, { workerId: 'worker-A', limit: 5 }))[0];
      snap('claimed');
      await R.repository.completeJob(w.sb, {
        jobId: claimed.id, attemptId: claimed.attempt_id, leaseId: claimed.lease_id,
        workerId: 'worker-A', outcome: 'retryable', errorClass: 'transient', backoffSeconds: 30,
      });
      snap('retry_wait');
      w.tick(40000);
      const reclaimed = (await R.repository.claimJobs(w.sb, { workerId: 'worker-B', limit: 5 }))[0];
      snap('reclaimed');
      await R.repository.completeJob(w.sb, {
        jobId: reclaimed.id, attemptId: reclaimed.attempt_id, leaseId: reclaimed.lease_id,
        workerId: 'worker-B', outcome: 'completed',
      });
      snap('completed');
      t('CB5B-106',
        claimed.next_attempt_at === null
        && w.job().status === 'completed' && w.job().next_attempt_at === null
        && seen.join(' ') === 'seed:queued:set claimed:claimed:null retry_wait:retry_wait:set reclaimed:claimed:null completed:completed:null'
        && R.state.rowShapeViolations(w.job()).length === 0,
        `the schedule must be present exactly while a job is claimable and absent while it is claimed or terminal — observed ${seen.join(' ')} (a NOT NULL column would have failed at the FIRST claim)`);
    }

    // ── T21 · a conflicting payload refuses the unit and skips nothing ────────
    {
      const w = build();
      const claimed = (await R.repository.claimJobs(w.sb, { workerId: 'worker-A', limit: 5 }))[0];
      const ids = { jobId: claimed.id, attemptId: claimed.attempt_id, leaseId: claimed.lease_id, workerId: 'worker-A' };
      const v1 = await R.identity.buildIngestBatch({ businessId: BIZ_A, provider: 'quickbooks', connectionId: CONN_A, drafts: [draft(1)] });
      await R.repository.ingestBatch(w.sb, {
        ...ids, observations: v1.observations,
        checkpoint: { scope: 'transactions', cursor_kind: 'ordered', expected_version: 0, cursor_ordinal: 100 },
      });
      const rowsBefore = w.state.observations.length;
      const versionBefore = w.state.checkpoints[0].cursor_version;

      // The SAME object and version carrying a DIFFERENT payload. It cannot be stored
      // (the row is immutable) and it is not a new identity, so the only honest answers
      // are "refuse the unit" or "lose it behind a cursor that has already moved".
      const conflicting = await R.identity.buildIngestBatch({
        businessId: BIZ_A, provider: 'quickbooks', connectionId: CONN_A,
        drafts: [draft(1, { payload: { amount: 12345, currency: 'USD' } })],
      });
      let code = null;
      let receipt = null;
      try {
        receipt = await R.repository.ingestBatch(w.sb, {
          ...ids, observations: conflicting.observations,
          checkpoint: { scope: 'transactions', cursor_kind: 'ordered', expected_version: 1, cursor_ordinal: 200 },
        });
      } catch (e) { code = e.code; }

      t('CB5B-107',
        code === 'OBSERVATION_CONFLICT' && receipt === null
        && w.state.observations.length === rowsBefore
        && w.state.observations.filter((o) => o.payload && o.payload.amount === 12345).length === 0
        && w.state.checkpoints[0].cursor_version === versionBefore
        && w.state.checkpoints[0].cursor_ordinal === 100
        && w.job().status === 'claimed',
        `a conflicting payload must REFUSE the whole unit (code=${code}) and commit nothing: rows=${w.state.observations.length}/${rowsBefore}, cursor=${w.state.checkpoints[0].cursor_version}/${versionBefore}@${w.state.checkpoints[0].cursor_ordinal}, job=${w.job().status} — never a silent skip`);
    }

    // ── T22 · a batch that contradicts ITSELF is refused, and repeats reconcile ─
    {
      const w = build();
      const claimed = (await R.repository.claimJobs(w.sb, { workerId: 'worker-A', limit: 5 }))[0];
      const ids = { jobId: claimed.id, attemptId: claimed.attempt_id, leaseId: claimed.lease_id, workerId: 'worker-A' };
      const raw = (amount) => ({ object_type: 'transaction', provider_object_id: 'txn-self', value_kind: 'amount', source_version: 'v1', payload: { amount } });
      let code = null;
      try { await R.repository.ingestBatch(w.sb, { ...ids, observations: [raw(1), raw(2)], checkpoint: null }); } catch (e) { code = e.code; }
      const rowsAfterRefusal = w.state.observations.length;
      const repeat = await R.repository.ingestBatch(w.sb, { ...ids, observations: [raw(1), raw(1)], checkpoint: null });
      t('CB5B-109', code === 'OBSERVATION_CONFLICT' && rowsAfterRefusal === 0
        && repeat.delivered === 2 && repeat.inserted === 1 && repeat.duplicates === 1 && repeat.conflicts === 0
        && repeat.inserted + repeat.duplicates + repeat.conflicts === repeat.delivered,
        `a batch whose deliveries disagree must be refused with nothing stored (code=${code}, rows=${rowsAfterRefusal}); an identical repeat must reconcile per DELIVERY (delivered=${repeat.delivered}, inserted=${repeat.inserted}, duplicates=${repeat.duplicates})`);
    }

    // ── T23 · two DIFFERENT jobs sharing a key: second identical is a duplicate,
    //         second different is a refusal — never a silent discard ─────────────
    {
      const w = build({ siblingJob: true });
      const claims = await R.repository.claimJobs(w.sb, { workerId: 'worker-A', limit: 5 });
      const [a, b] = claims;
      const idsOf = (c) => ({ jobId: c.id, attemptId: c.attempt_id, leaseId: c.lease_id, workerId: 'worker-A' });
      const v1 = await R.identity.buildIngestBatch({ businessId: BIZ_A, provider: 'quickbooks', connectionId: CONN_A, drafts: [draft(7)] });
      const changed = await R.identity.buildIngestBatch({ businessId: BIZ_A, provider: 'quickbooks', connectionId: CONN_A, drafts: [draft(7, { payload: { amount: 777, currency: 'USD' } })] });
      const first = await R.repository.ingestBatch(w.sb, { ...idsOf(a), observations: v1.observations, checkpoint: null });
      const same = await R.repository.ingestBatch(w.sb, { ...idsOf(b), observations: v1.observations, checkpoint: null });
      let code = null;
      try { await R.repository.ingestBatch(w.sb, { ...idsOf(b), observations: changed.observations, checkpoint: null }); } catch (e) { code = e.code; }
      t('CB5B-110', claims.length === 2 && a.provider_operation !== b.provider_operation
        && first.inserted === 1 && same.inserted === 0 && same.duplicates === 1 && same.delivered === 1
        && code === 'OBSERVATION_CONFLICT' && w.state.observations.length === 1
        && w.state.observations[0].payload.amount === 70 && w.state.observations[0].job_id === a.id,
        `two jobs delivering one key must resolve against the first COMMITTED row: identical → duplicate (inserted=${same.inserted}, duplicates=${same.duplicates}); different → OBSERVATION_CONFLICT (code=${code}), the stored payload unchanged (rows=${w.state.observations.length})`);
      t('CB5B-111', R.repository.classifyDatabaseError('provider_sync_observation_ingest: OBSERVATION_RACE (receipt does not reconcile)') === 'OBSERVATION_RACE'
        && R.repository.classifyDatabaseError('duplicate key value violates unique constraint "provider_observations_dedup_unique"') === 'OBSERVATION_RACE',
        'a reconciliation failure and a raw unique violation must both reach the worker as the closed, retryable OBSERVATION_RACE');
    }

    t('CB5B:behaviour', failures.length === 0, `behavioural failures: ${failures.join(', ') || '<none>'}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════════════════
  // SCHEMA ↔ WRITER AGREEMENT (CB5B-100 … CB5B-105)
  //
  // WHY THIS SECTION EXISTS
  //   provider_sync_jobs.next_attempt_at was declared NOT NULL while
  //   provider_sync_job_claim() assigned it NULL. Every other check in this suite
  //   passed: the row-shape model mirrored the CHECK constraints but not column
  //   NULLABILITY, so the contradiction was invisible until a worker actually claimed
  //   a job and the UPDATE raised. Nothing short of comparing each WRITE against the
  //   column's DECLARATION could have seen it, and that is what this section does —
  //   for every column of every table, not just the one that bit.
  // ══════════════════════════════════════════════════════════════════════════

  /** Each table's declared columns, and whether each is NOT NULL. */
  function parseDeclaredColumns(mig) {
    const out = {};
    for (const table of TABLES) {
      const start = mig.indexOf(`create table if not exists public.${table} (`);
      if (start === -1) continue;
      const cols = {};
      for (const line of mig.slice(start).split('\n').slice(1)) {
        if (/^\);\s*$/.test(line)) break;
        if (/^\s*(constraint\s|--)/i.test(line)) continue;
        const m = line.match(/^\s{2}([a-z_][a-z0-9_]*)\s+[a-z]/i);
        if (!m) continue;
        cols[m[1]] = { notNull: /\bnot null\b/i.test(line), hasDefault: /\bdefault\b/i.test(line) };
      }
      out[table] = cols;
    }
    return out;
  }

  /** Comma-split at paren depth 0, so `coalesce(a, b)` stays ONE value. */
  function splitTop(text) {
    const parts = [];
    let depth = 0;
    let cur = '';
    for (const ch of String(text)) {
      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
      if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
      cur += ch;
    }
    parts.push(cur);
    return parts.map((p) => p.trim());
  }

  /** The parenthesised group opening at `open`, depth-aware. */
  function parenGroup(text, open) {
    let depth = 0;
    for (let i = open; i < text.length; i += 1) {
      if (text[i] === '(') depth += 1;
      else if (text[i] === ')') { depth -= 1; if (depth === 0) return text.slice(open + 1, i); }
    }
    return null;
  }

  function checkSchemaAgreement(src) {
    const mig = live(src.mig);
    const declared = parseDeclaredColumns(mig);
    const nullOnNotNull = [];
    const unknownColumns = [];
    const writes = [];
    const insertedColumns = [];

    // ── every UPDATE's SET clause, checked against the table it updates ──────
    const upd = /update public\.([a-z_]+)([\s\S]*?)\bwhere\b/g;
    let m;
    while ((m = upd.exec(mig)) !== null) {
      const table = m[1];
      const body = m[2];
      if (!declared[table] || body.length > 4000) continue;
      const setAt = body.search(/\bset\b/i);
      if (setAt === -1) continue;
      for (const assignment of splitTop(body.slice(setAt + 3))) {
        const eq = assignment.indexOf('=');
        if (eq === -1) continue;
        const col = assignment.slice(0, eq).trim();
        if (!/^[a-z_][a-z0-9_]*$/.test(col)) continue;
        const value = assignment.slice(eq + 1).trim();
        writes.push({ table, col, value });
        if (!declared[table][col]) { unknownColumns.push(`${table}.${col}`); continue; }
        if (/^null$/i.test(value) && declared[table][col].notNull) {
          nullOnNotNull.push(`UPDATE ${table} assigns NULL to NOT NULL column ${col}`);
        }
      }
    }

    // ── every INSERT … VALUES, positionally, against the declared columns ────
    const ins = /insert into public\.([a-z_]+)\s*\(/g;
    while ((m = ins.exec(mig)) !== null) {
      const table = m[1];
      if (!declared[table]) continue;
      const list = parenGroup(mig, m.index + m[0].length - 1);
      if (list === null) continue;
      // The column LIST is explicit in every INSERT here — including INSERT … SELECT —
      // so coverage of the NOT NULL columns is checkable without parsing any values.
      insertedColumns.push({ table, names: splitTop(list) });
      const valuesAt = mig.indexOf('values', m.index + list.length);
      if (valuesAt === -1) continue;
      const open = mig.indexOf('(', valuesAt);
      const values = open === -1 ? null : parenGroup(mig, open);
      if (values === null) continue;
      const names = splitTop(list);
      const vals = splitTop(values);
      if (names.length !== vals.length) continue;
      for (let i = 0; i < names.length; i += 1) {
        writes.push({ table, col: names[i], value: vals[i] });
        if (!declared[table][names[i]]) { unknownColumns.push(`${table}.${names[i]}`); continue; }
        if (/^null$/i.test(vals[i]) && declared[table][names[i]].notNull) {
          nullOnNotNull.push(`INSERT into ${table} puts NULL in NOT NULL column ${names[i]}`);
        }
      }
    }

    ok('CB5B-100', nullOnNotNull.length === 0,
      `no function may assign NULL to a NOT NULL column — the schema cannot prevent it, so the first affected call is where it would surface: ${nullOnNotNull.join('; ') || '<none>'}`);
    ok('CB5B-100b', unknownColumns.length === 0,
      `every column a function writes must exist on the table it writes: ${JSON.stringify(unknownColumns)}`);

    // ── a literal written into a CHECK-ed column must be IN that vocabulary ───
    const vocabularies = {};
    for (const table of TABLES) {
      const start = mig.indexOf(`create table if not exists public.${table} (`);
      if (start === -1) continue;
      const block = mig.slice(start, mig.indexOf('\n);', start));
      const found = {};
      // Every `check ( … )` clause, read depth-aware, then its `col in ( … )` list.
      // Read from the CLAUSE rather than from the constraint's own shape, because a
      // vocabulary is usually guarded — `last_error_class is null or last_error_class
      // in (…)` — and a stricter pattern would silently skip exactly those columns.
      const re = /check \(/g;
      let vm;
      while ((vm = re.exec(block)) !== null) {
        const clause = parenGroup(block, vm.index + 6);
        if (clause === null) continue;
        const membership = clause.match(/([a-z_][a-z0-9_]*) in \(([^)]*)\)/);
        if (!membership) continue;
        // UNION, never first-wins. A column's memberships can appear in more than one
        // clause — `status in ('queued','retry_wait')` inside schedule_shape alongside
        // the full vocabulary in status_check — and taking only one of them would flag
        // legal writes as drift. The union can only ever be too permissive, which is
        // the safe direction for a check that must not cry wolf.
        const values = (membership[2].match(/'[^']*'/g) || []).map((s) => s.replace(/'/g, ''));
        found[membership[1]] = Array.from(new Set((found[membership[1]] || []).concat(values)));
      }
      vocabularies[table] = found;
    }
    const outsideVocabulary = writes
      .filter((w) => /^'[^']*'$/.test(w.value))
      .filter((w) => {
        const list = (vocabularies[w.table] || {})[w.col];
        return Array.isArray(list) && list.indexOf(w.value.slice(1, -1)) === -1;
      })
      .map((w) => `${w.table}.${w.col} = ${w.value}`);
    ok('CB5B-100d', outsideVocabulary.length === 0,
      `a literal written into a CHECK-constrained column must be a member of that vocabulary, or the write raises at runtime: ${JSON.stringify(outsideVocabulary)}`);

    // ── an INSERT must SUPPLY every NOT NULL column it has no default for ────
    const uncovered = [];
    for (const insert of insertedColumns) {
      for (const col of Object.keys(declared[insert.table] || {})) {
        const meta = declared[insert.table][col];
        if (meta.notNull && !meta.hasDefault && insert.names.indexOf(col) === -1) {
          uncovered.push(`${insert.table}.${col}`);
        }
      }
    }
    ok('CB5B-100e', uncovered.length === 0,
      `every INSERT must list every NOT NULL column that has no default, or the statement fails at runtime: ${JSON.stringify(uncovered)}`);
    ok('CB5B-100c',
      /next_attempt_at\s+timestamptz\s+null/.test(mig)
      && /next_attempt_at\s*=\s*null/.test(bodyOf(src.mig, 'provider_sync_job_claim')),
      'the claim CLEARS the schedule, so the column MUST be nullable — the original contradiction was a NOT NULL declaration against exactly this assignment');

    // ── the schedule invariant, in the artifact and in the shipped module ────
    ok('CB5B-101',
      /constraint provider_sync_jobs_schedule_shape[\s\S]{0,420}status in \('queued', 'retry_wait'\) and next_attempt_at is not null[\s\S]{0,220}status in \('claimed', 'completed', 'failed'\) and next_attempt_at is null/.test(mig),
      'the schedule invariant must be a TABLE constraint, so a claimable job with no schedule — unclaimable in silence — cannot be stored at all');

    const policy = loadTs(src.policy, require);
    const machine = loadTs(src.state, (s) => (s === './executionPolicy.ts' ? policy : require(s)));
    const violation = (row) => machine.rowShapeViolations(row);
    ok('CB5B-101b',
      violation({ status: 'queued', attempt_count: 0, max_attempts: 5, next_attempt_at: null }).indexOf('claimable_without_schedule') > -1
      && violation({ status: 'retry_wait', attempt_count: 1, max_attempts: 5, last_error_class: 'transient', next_attempt_at: null }).indexOf('claimable_without_schedule') > -1
      && violation({ status: 'queued', attempt_count: 0, max_attempts: 5, next_attempt_at: new Date().toISOString() }).length === 0
      && violation({ status: 'completed', completed_at: new Date().toISOString(), attempt_count: 1, max_attempts: 5, next_attempt_at: new Date().toISOString() }).indexOf('unscheduled_state_carrying_schedule') > -1,
      'the shipped row-shape predicate must report BOTH directions: a claimable job with no schedule, and an unscheduled state carrying one');

    const completeBody = bodyOf(src.mig, 'provider_sync_job_complete');
    ok('CB5B-101c',
      /next_attempt_at\s*=\s*null/.test(bodyOf(src.mig, 'provider_sync_job_claim'))
      && (completeBody.match(/next_attempt_at\s*=\s*null/g) || []).length === 3
      && /next_attempt_at\s*=\s*clock_timestamp\(\) \+ make_interval/.test(completeBody)
      && /next_attempt_at\s*=\s*null/.test(bodyOf(src.mig, 'provider_sync_job_sweep')),
      'every lifecycle writer must state the schedule for the state it writes: the claim clears it, complete clears it on each terminal path and sets the retry instant on the retryable one, and sweep clears it on the way to failed — and that retry instant is measured from the WALL CLOCK, because a backoff computed from transaction start time would shorten as its transaction grew');

    // ── the conflict refusal, and WHERE it sits ─────────────────────────────
    const ingestNorm = bodyOf(src.mig, 'provider_sync_observation_ingest').replace(/\s+/g, ' ');
    const refusal = ingestNorm.indexOf('OBSERVATION_CONFLICT');
    const advance = ingestNorm.indexOf('set cursor_version = c.cursor_version + 1');
    ok('CB5B-102',
      /if v_conflicts > 0 then/.test(ingestNorm) && refusal > -1 && advance > -1 && refusal < advance,
      `a non-zero conflict count must REFUSE the unit before the cursor compare-and-swap (refusal@${refusal}, advance@${advance}) — otherwise the contradiction is silently skipped behind a cursor that will never re-fetch that page`);
    ok('CB5B-102b',
      /'conflicts', v_conflicts,/.test(bodyOf(src.mig, 'provider_sync_observation_ingest')),
      'the receipt keeps its conflicts field, which is now provably always 0 because a non-zero count cannot return');

    // ── the renewal budget, and the closed code a refusal travels as ─────────
    ok('CB5B-105',
      /lease_renewal_count between 0 and 100/.test(mig)
      && /and j\.lease_renewal_count < 100/.test(bodyOf(src.mig, 'provider_sync_job_renew_lease'))
      && /export const OBSERVATION_CONFLICT = 'OBSERVATION_CONFLICT';/.test(src.repository)
      && /if \(m\.includes\(OBSERVATION_CONFLICT\)\) return OBSERVATION_CONFLICT;/.test(src.repository)
      && policy.TERMINAL_ERROR_CLASSES.indexOf('provider_protocol_error') > -1
      && /deferred = \{ errorClass: 'provider_protocol_error', code \};/.test(src.executor),
      'attempt_bounds caps the renewal count, so renew_lease must REFUSE past it rather than trip the CHECK; and a conflict refusal must reach the job as a closed, terminal, visible failure code');

    // ── EVIDENCE RETENTION: the deletion rule on every FK into the evidence ──
    // A CASCADE into provider_observations deletes evidence that nobody asked to
    // delete, from a record the operator was never looking at, and does it silently.
    // The rule is therefore asserted as a MATRIX — one intentional cascade (the
    // checkpoint's, which is a position and not evidence), RESTRICT on both keys into
    // the job, RESTRICT on the key into the connection, SET NULL on the key into the
    // credential — rather than as a single "no cascade" sweep, because a sweep would
    // also pass on a design that had flattened the intentional cascades away.
    const fkOnDelete = (block, name) => {
      const re = new RegExp(`constraint ${name}\\s+foreign key \\([^)]*\\)\\s+references public\\.[a-z_]+ \\([^)]*\\)\\s+on delete ([a-z ]+?(?:\\([^)]*\\))?),`);
      const hit = block.match(re);
      return hit ? hit[1].trim() : null;
    };
    const obsDef = (mig.match(/create table if not exists public\.provider_observations \(([\s\S]*?)\n\);/) || [])[1] || '';
    const cpDef = (mig.match(/create table if not exists public\.provider_sync_checkpoints \(([\s\S]*?)\n\);/) || [])[1] || '';
    const evidenceRule = {
      job_business: fkOnDelete(obsDef, 'provider_observations_job_same_business_fkey'),
      job_connection: fkOnDelete(obsDef, 'provider_observations_job_same_connection_fkey'),
      connection: fkOnDelete(obsDef, 'provider_observations_connection_same_business_fkey'),
      credential: fkOnDelete(obsDef, 'provider_observations_credential_same_business_fkey'),
    };
    ok('CB5B-112',
      obsDef.length > 0 && cpDef.length > 0
      && evidenceRule.job_business === 'restrict'
      && evidenceRule.job_connection === 'restrict'
      && evidenceRule.connection === 'restrict'
      && evidenceRule.credential === 'set null (credential_id)'
      && !/on delete cascade/.test(obsDef)
      && fkOnDelete(cpDef, 'provider_sync_checkpoints_job_same_business_fkey') === 'cascade'
      && fkOnDelete(cpDef, 'provider_sync_checkpoints_job_same_connection_fkey') === 'cascade',
      `evidence retention matrix drifted: ${JSON.stringify(evidenceRule)}; observation cascades=${(obsDef.match(/on delete cascade/g) || []).length}; checkpoint=${fkOnDelete(cpDef, 'provider_sync_checkpoints_job_same_business_fkey')}`);
  }

  const hardeningChecks = createHardeningChecks({ ok, live, bodyOf });

  async function run(vocab, src) {
    checkPresence(src);
    checkObjects(src);
    checkAcl(src);
    checkFencing(src);
    checkAttemptDeadline(src);
    hardeningChecks.checkLockDoctrineAndPosture(src);
    checkIngestAtomicity(src);
    checkSchemaAgreement(src);
    checkModelAgreement(src, vocab);
    checkEntry(src);
    await runBehavioural(src, vocab, ok);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MU5B-series — every check must FAIL on the way it can break. Mutations are
  // applied IN MEMORY ONLY; no artifact on disk is ever written.
  // ══════════════════════════════════════════════════════════════════════════
  async function mutation(vocab, src) {
    const undetected = [];
    const apply = (source, from, to) => {
      const out = source.replace(from, to);
      if (out === source) throw new Error(`mutation target not found: ${String(from).slice(0, 60)}`);
      return out;
    };
    const redStatic = (fn, mutated) => collect(() => fn(mutated, vocab)).some((f) => /^CB5B/.test(f));
    const redBehavioural = async (mutated, emitOnly, overrides) => {
      const out = [];
      await runBehavioural(mutated, vocab, (id, cond, detail) => {
        if (!cond) out.push(`${id} — ${detail}`);
        return !!cond;
      }, overrides || {});
      return out.some((f) => emitOnly.test(f));
    };

    const cases = [
      ['MU5B-1', 'the claim stops using SKIP LOCKED, so two workers could claim one job',
        () => redStatic((m) => checkFencing({ ...src, mig: m }), apply(src.mig, 'for update skip locked', 'for update'))],
      ['MU5B-2', 'the expired-lease recovery branch is removed from the claim',
        () => redStatic((m) => checkFencing({ ...src, mig: m }), apply(src.mig, "or (j.status = 'claimed' and j.lease_expires_at <= v_now)", ''))],
      ['MU5B-3', 'the claim stops consuming the attempt budget',
        () => redStatic((m) => checkFencing({ ...src, mig: m }), apply(src.mig, 'attempt_count       = j.attempt_count + 1,', ''))],
      ['MU5B-4', 'the claim reuses the previous attempt identity instead of minting a new one',
        () => redStatic((m) => checkFencing({ ...src, mig: m }), apply(src.mig, 'attempt_id          = gen_random_uuid(),', 'attempt_id          = coalesce(j.attempt_id, gen_random_uuid()),'))],
      ['MU5B-5', 'a non-claimed job may keep live lease columns (a stale lease becomes representable)',
        () => redStatic((m) => checkFencing({ ...src, mig: m }), apply(src.mig, "or (status <> 'claimed' and lease_id is null and lease_expires_at is null)", ''))],
      ['MU5B-6', 'the lease fence is dropped from the ingest',
        () => redStatic((m) => checkFencing({ ...src, mig: m }), apply(src.mig, 'if v_job.status <> \'claimed\' then', 'if false then'))],
      ['MU5B-7', 'the checkpoint is advanced BEFORE the observations are inserted',
        () => redStatic((m) => checkIngestAtomicity({ ...src, mig: m }),
          apply(src.mig, '  -- The credential that actually produced this evidence: the CURRENT active',
            '  update public.provider_sync_checkpoints set cursor_version = cursor_version + 1 where job_id = v_job.id;\n\n  -- The credential that actually produced this evidence: the CURRENT active'))],
      ['MU5B-8', 'the checkpoint advance stops being a compare-and-swap',
        () => redStatic((m) => checkIngestAtomicity({ ...src, mig: m }), apply(src.mig, 'and c.cursor_version = v_expected;', ';'))],
      ['MU5B-9', 'the ordered cursor may move backwards',
        () => redStatic((m) => checkIngestAtomicity({ ...src, mig: m }), apply(src.mig, 'if v_cp.cursor_ordinal is not null and not (v_ordinal > v_cp.cursor_ordinal) then', 'if false then'))],
      ['MU5B-10', 'the ingest swallows its errors instead of rolling the unit back',
        () => redStatic((m) => checkIngestAtomicity({ ...src, mig: m }), apply(src.mig, '  return jsonb_build_object(\n    \'job_id\', v_job.id,', '  exception when others then null;\n  return jsonb_build_object(\n    \'job_id\', v_job.id,'))],
      ['MU5B-11', 'the per-key cross-job lock is removed, re-opening the concurrent ingest race',
        () => redStatic((m) => checkIngestAtomicity({ ...src, mig: m }), apply(src.mig, '    perform pg_advisory_xact_lock(v_lock_key);', '    null;'))],
      ['MU5B-42', 'ON CONFLICT DO NOTHING is re-added to the observation insert, so a payload can be discarded silently',
        () => redStatic((m) => checkIngestAtomicity({ ...src, mig: m }), apply(src.mig, '       order by e.key, e.ord\n      returning id, dedup_key', '       order by e.key, e.ord\n      on conflict (dedup_key) do nothing\n      returning id, dedup_key'))],
      ['MU5B-43', 'the per-key locks are taken in KEY order, so colliding hashes can deadlock two writers',
        () => redStatic((m) => checkIngestAtomicity({ ...src, mig: m }), apply(src.mig, "      from unnest(v_keys) as k\n     order by 1\n  loop", "      from unnest(v_keys) as k\n  loop"))],
      ['MU5B-44', 'the receipt reconciliation is disabled',
        () => redStatic((m) => checkIngestAtomicity({ ...src, mig: m }), apply(src.mig, '  if v_inserted <> v_absent_keys\n', '  if false and v_inserted <> v_absent_keys\n'))],
      ['MU5B-45', 'the receipt counts KEYS instead of deliveries again',
        () => redStatic((m) => checkIngestAtomicity({ ...src, mig: m }), apply(src.mig, '    coalesce(sum(delivered_count), 0)::int\n    into v_conflicts', '    count(*)::int\n    into v_conflicts'))],
      ['MU5B-46', 'a race reaches the worker as a terminal failure instead of a retry',
        () => redStatic((m) => checkIngestAtomicity({ ...src, executor: m }), apply(src.executor, "code === 'CHECKPOINT_STALE' || code === 'OBSERVATION_RACE'", "code === 'CHECKPOINT_STALE'"))],
      ['MU5B-47', 'the model stops detecting a batch that contradicts itself',
        () => redBehavioural(src, /^CB5B-109|^CB5B:behaviour/, { modelIgnoresBatchContradiction: true })],
      ['MU5B-12', 'the payload bound is removed from the ingest',
        () => redStatic((m) => checkIngestAtomicity({ ...src, mig: m }), apply(src.mig, "if length((v_elem->'payload')::text) > 16384 then", 'if false then'))],
      ['MU5B-13', 'a browser role is granted a write on a CB-005B table',
        () => redStatic((m) => checkAcl({ ...src, mig: m }), src.mig + '\ngrant insert on table public.provider_observations to authenticated;\n')],
      ['MU5B-14', 'the policy set is widened beyond SELECT-for-service_role',
        () => redStatic((m) => checkAcl({ ...src, mig: m }), src.mig + '\ncreate policy provider_sync_jobs_anon_select on public.provider_sync_jobs for select to anon using (true);\n')],
      ['MU5B-15', 'a function stops being SECURITY DEFINER',
        () => redStatic((m) => checkAcl({ ...src, mig: m }), apply(src.mig, 'security definer\nset search_path = pg_catalog, public\nas $$\ndeclare\n  v_ids uuid[];', 'security invoker\nset search_path = pg_catalog, public\nas $$\ndeclare\n  v_ids uuid[];'))],
      ['MU5B-16', 'a function loses its owner pin',
        () => redStatic((m) => checkAcl({ ...src, mig: m }), apply(src.mig, 'alter function public.provider_sync_job_claim(text, integer, integer) owner to postgres;', ''))],
      ['MU5B-17', 'the dedup key field order changes in the database',
        () => redStatic((m) => checkModelAgreement({ ...src, mig: m }, vocab), apply(src.mig,
          "v_job.business_id::text || '|' || v_job.provider || '|' || v_job.business_connection_id::text || '|' ||\n      v_obj_type || '|' || v_obj_id || '|' || v_value_kind || '|' || v_source_version",
          "v_job.provider || '|' || v_job.business_id::text || '|' || v_job.business_connection_id::text || '|' ||\n      v_obj_type || '|' || v_obj_id || '|' || v_value_kind || '|' || v_source_version"))],
      ['MU5B-18', 'the canonical fingerprint is downgraded to md5',
        () => redStatic((m) => checkModelAgreement({ ...src, mig: m }, vocab), src.mig.replace(/encode\(sha256\(/g, 'encode(md5('))],
      ['MU5B-19', 'a policy bound drifts from the database bound',
        () => redStatic((m) => checkModelAgreement({ ...src, policy: m }, vocab), apply(src.policy, 'LEASE_SECONDS_MAX: 900,', 'LEASE_SECONDS_MAX: 1800,'))],
      ['MU5B-20', 'the failure vocabulary is widened in the database',
        () => redStatic((m) => checkModelAgreement({ ...src, mig: m }, vocab), src.mig.replace("'transient', 'rate_limited', 'timeout', 'provider_error', 'provider_protocol_error',", "'transient', 'rate_limited', 'timeout', 'provider_error', 'provider_protocol_error', 'made_up_class',"))],
      ['MU5B-21', 'the status vocabulary drifts between SQL and module',
        () => redStatic((m) => checkModelAgreement({ ...src, policy: m }, vocab), apply(src.policy, "export const JOB_STATUSES = ['queued', 'claimed', 'retry_wait', 'completed', 'failed'] as const;", "export const JOB_STATUSES = ['queued', 'claimed', 'retry_wait', 'completed', 'failed', 'blocked'] as const;"))],
      ['MU5B-22', 'a Digital Twin reference is smuggled into the migration',
        () => redStatic((m) => checkIngestAtomicity({ ...src, mig: m }), src.mig + '\n-- insert into public.business_facts (id) values (gen_random_uuid());\nselect 1 from public.business_facts limit 1;\n')],
      ['MU5B-23', 'a Vault call is smuggled into the migration',
        () => redStatic((m) => checkIngestAtomicity({ ...src, mig: m }), src.mig + "\nselect vault.decrypted_secrets from vault.decrypted_secrets limit 1;\n")],
      ['MU5B-24', 'the wake surface starts accepting authority-shaped keys',
        () => redStatic((m) => checkEntry({ ...src, entry: m }), apply(src.entry, 'const forbidden = findForbiddenWakeBodyKeys(body);', 'const forbidden = [];\n  void findForbiddenWakeBodyKeys;'))],
      ['MU5B-25', 'the wake surface stops requiring canonical admin standing',
        () => redStatic((m) => checkEntry({ ...src, entry: m }), apply(src.entry, 'if (!actor.isAdmin) {', 'if (false) {'))],
      ['MU5B-26', 'the worker identity starts coming from the request body',
        () => redStatic((m) => checkEntry({ ...src, entry: m }), apply(src.entry, 'const workerId = deriveWorkerId(actorKind, actor.profile_id);', 'const workerId = body.worker_id || deriveWorkerId(actorKind, actor.profile_id);'))],
      ['MU5B-27', 'a real provider transport is wired into the executor',
        () => redStatic((m) => checkEntry({ ...src, executor: m }), src.executor + "\nasync function leak() { return fetch('https://api.quickbooks.intuit.com/v3/company'); }\n")],
      ['MU5B-28', 'the verification artifact stops being read-only',
        () => redStatic((m) => checkEntry({ ...src, verify: m }), src.verify + '\nupdate public.provider_sync_jobs set status = \'completed\';\n')],
      ['MU5B-29', 'the checkpoint gains a second writer, so it can advance without observations',
        () => redStatic((m) => checkIngestAtomicity({ ...src, mig: m }),
          apply(src.mig, 'alter function public.provider_sync_job_sweep(integer) owner to postgres;',
            'alter function public.provider_sync_job_sweep(integer) owner to postgres;\n\ncreate or replace function public.provider_sync_checkpoint_advance(p_job_id uuid, p_scope text) returns void language sql as $$ update public.provider_sync_checkpoints set cursor_version = cursor_version + 1 where job_id = p_job_id and checkpoint_scope = p_scope; $$;\n'))],
      ['MU5B-30', 'the system context can be built from an unverified claim',
        () => redStatic((m) => checkModelAgreement({ ...src, system: m }, vocab), apply(src.system,
          "if (claim.verified !== true || claim.claim_state !== 'live') {\n    throw new Error('systemContext: refusing to build a verified context from an unverified claim');\n  }",
          ''))],
    ];

    // ── the MODEL mutations: the behavioural suite must be able to FAIL ───────
    const modelMutations = [
      ['MU5B-31', 'the database stops enforcing lease expiry, so a lapsed worker keeps writing',
        () => redBehavioural(src, /^CB5B-7[5-8]|^CB5B:behaviour/, { laxLease: true })],
      ['MU5B-32', 'a refusal starts writing job state (the job is mutated by a denied call)',
        () => redStatic((m) => checkEntry({ ...src, executor: m }),
          apply(src.executor,
            "outcome: verification.verified ? 'not_executable' : 'claim_not_verified',",
            "outcome: verification.verified ? 'not_executable' : 'claim_not_verified',\n      _mutated_side_effect: await completeJob(sb, { jobId, attemptId: identity.attemptId, leaseId: identity.leaseId, workerId: deps.workerId, outcome: 'retryable', errorClass: 'transient' }),"))],
      ['MU5B-33', 'the execution budgets stop being checked, so a walk can run unbounded',
        () => redStatic((m) => checkEntry({ ...src, executor: m }),
          apply(src.executor, 'if (pageBudgetExhausted(execution.pages) || observationBudgetExhausted(execution.observations)) {', 'if (false) {'))],
      ['MU5B-34', 'the application attempt budget is raised past the database budget',
        () => redStatic((m) => checkModelAgreement({ ...src, policy: m }, vocab),
          apply(src.policy, 'ATTEMPT_MS_BUDGET: 600000,', 'ATTEMPT_MS_BUDGET: 7200000,'))],
      // ── the corrected contradictions, each re-broken in the exact way it broke ──
      ['MU5B-35', 'next_attempt_at is declared NOT NULL again while the claim still clears it (the ORIGINAL contradiction)',
        () => redStatic((m) => checkSchemaAgreement({ ...src, mig: m }),
          apply(src.mig, 'next_attempt_at       timestamptz null default now(),', 'next_attempt_at       timestamptz not null default now(),'))],
      ['MU5B-36', 'the schedule invariant is deleted, so a claimable job can be stranded unclaimable',
        () => redStatic((m) => checkSchemaAgreement({ ...src, mig: m }),
          apply(src.mig, "  constraint provider_sync_jobs_schedule_shape\n    check (\n      (status in ('queued', 'retry_wait') and next_attempt_at is not null)\n      or (status in ('claimed', 'completed', 'failed') and next_attempt_at is null)\n    ),\n", ''))],
      ['MU5B-37', 'sweep stops clearing the schedule on the way to failed',
        () => redStatic((m) => checkSchemaAgreement({ ...src, mig: m }),
          apply(src.mig, "         next_attempt_at = null,\n         last_error_class = 'transient_exhausted',\n         last_error_code = 'attempts_exhausted',", "         last_error_class = 'transient_exhausted',\n         last_error_code = 'attempts_exhausted',"))],
      ['MU5B-38', 'the conflict refusal is disabled, so a conflicting payload is silently skipped',
        () => redStatic((m) => checkSchemaAgreement({ ...src, mig: m }),
          apply(src.mig, 'if v_conflicts > 0 then', 'if false then'))],
      ['MU5B-39', 'the conflict refusal is raised only AFTER the cursor has already advanced',
        () => redStatic((m) => checkSchemaAgreement({ ...src, mig: m }), (() => {
          const stripped = apply(src.mig,
            "  if v_conflicts > 0 then\n    raise exception 'provider_sync_observation_ingest: OBSERVATION_CONFLICT (% delivered observation(s) carry a different payload for a dedup_key that is already stored; the stored evidence is immutable, so the batch is refused rather than silently skipped)', v_conflicts\n      using errcode = 'P0001';\n  end if;\n\n  ",
            '  ');
          return apply(stripped, '  -- ── 7 · the receipt ─────',
            "  if v_conflicts > 0 then\n    raise exception 'OBSERVATION_CONFLICT (late)';\n  end if;\n\n  -- ── 7 · the receipt ─────");
        })())],
      ['MU5B-40', 'a lifecycle writer spells an error class that is not in the column vocabulary',
        () => redStatic((m) => checkSchemaAgreement({ ...src, mig: m }),
          apply(src.mig, "         last_error_class = 'transient_exhausted',\n         last_error_code = 'attempts_exhausted',", "         last_error_class = 'transient_exhaustd',\n         last_error_code = 'attempts_exhausted',"))],
      ['MU5B-41', 'an INSERT stops supplying a NOT NULL column that has no default',
        () => redStatic((m) => checkSchemaAgreement({ ...src, mig: m }),
          apply(src.mig, 'business_id, business_connection_id, credential_id, credential_type,\n      provider, provider_operation,', 'business_id, business_connection_id, credential_id,\n      provider, provider_operation,'))],
      // ── evidence retention, re-broken in each of the three ways it can break ──
      ['MU5B-48', 'the observation key into the job cascades again, so deleting a job destroys its evidence silently',
        () => redStatic((m) => checkSchemaAgreement({ ...src, mig: m }),
          apply(src.mig,
            'references public.provider_sync_jobs (id, business_id) on delete restrict,',
            'references public.provider_sync_jobs (id, business_id) on delete cascade,'))],
      ['MU5B-49', 'the observation key into the connection cascades again, so a disconnect destroys evidence',
        () => redStatic((m) => checkSchemaAgreement({ ...src, mig: m }),
          apply(src.mig,
            'references public.business_connections (id, business_id) on delete restrict,',
            'references public.business_connections (id, business_id) on delete cascade,'))],
      ['MU5B-50', 'the observation key into the credential cascades, so evidence is lost where SET NULL preserves it',
        () => redStatic((m) => checkSchemaAgreement({ ...src, mig: m }),
          apply(src.mig,
            'references public.provider_credentials (id, business_id) on delete set null (credential_id),',
            'references public.provider_credentials (id, business_id) on delete cascade,'))],
      // ── the ABSOLUTE DEADLINE, re-broken in each way it can break ───────────
      ['MU5B-51', 'the claim stops capping its grant at the attempt deadline, so a lease can outlive the budget',
        () => redStatic((m) => checkAttemptDeadline({ ...src, mig: m }),
          apply(src.mig, 'v_now + make_interval(secs => j.max_attempt_seconds)', 'v_now + make_interval(secs => p_lease_seconds)'))],
      ['MU5B-52', 'the renewal deadline refusal is dropped, so a renewal can run past the budget',
        () => redStatic((m) => checkAttemptDeadline({ ...src, mig: m }),
          apply(src.mig, '     and v_now < j.attempt_started_at + make_interval(secs => j.max_attempt_seconds)', ''))],
      ['MU5B-53', 'authorize stops refusing an attempt past its own deadline',
        () => redStatic((m) => checkAttemptDeadline({ ...src, mig: m }),
          apply(src.mig, "  if clock_timestamp() >= v_job.attempt_started_at + make_interval(secs => v_job.max_attempt_seconds) then\n    return jsonb_build_object('verified', false, 'claim_state', 'attempt_expired',", "  if false then\n    return jsonb_build_object('verified', false, 'claim_state', 'attempt_expired',"))],
      ['MU5B-54', 'the ingest stops re-reading the deadline at the mutation boundary',
        () => redStatic((m) => checkAttemptDeadline({ ...src, mig: m }),
          apply(src.mig, "  if clock_timestamp() >= v_job.attempt_started_at + make_interval(secs => v_job.max_attempt_seconds) then\n    raise exception 'provider_sync_observation_ingest: ATTEMPT_EXPIRED (the attempt passed its absolute deadline while the unit waited for its keys; nothing is written)'", "  if false then\n    raise exception 'provider_sync_observation_ingest: ATTEMPT_EXPIRED (the attempt passed its absolute deadline while the unit waited for its keys; nothing is written)'"))],
      ['MU5B-55', 'complete stops refusing a stale completion past the deadline',
        () => redStatic((m) => checkAttemptDeadline({ ...src, mig: m }),
          apply(src.mig, "  if clock_timestamp() >= v_job.attempt_started_at + make_interval(secs => v_job.max_attempt_seconds) then\n    return 'ATTEMPT_EXPIRED';", "  if false then\n    return 'ATTEMPT_EXPIRED';"))],
      ['MU5B-56', 'the table stops making a lease beyond the attempt budget unrepresentable',
        () => redStatic((m) => checkAttemptDeadline({ ...src, mig: m }),
          apply(src.mig, 'extract(epoch from (lease_expires_at - attempt_started_at)) <= max_attempt_seconds', 'true'))],
      ['MU5B-57', 'a lifecycle writer goes back to now(), so a long transaction outlives its own deadline',
        () => redStatic((m) => checkAttemptDeadline({ ...src, mig: m }),
          apply(src.mig, '  v_now timestamptz := clock_timestamp();', '  v_now timestamptz := now();'))],
      ['MU5B-58', 'the database stops refusing an attempt past its absolute deadline (the lease cap is left in place)',
        () => redBehavioural(src, /^CB5B-12[2-9]|^CB5B-13[0-9]/, { laxDeadline: true })],
      ['MU5B-59', 'the renewal goes back to reading the clock BEFORE it takes the row lock, so a wait can extend a lapsed lease',
        () => redStatic((m) => checkAttemptDeadline({ ...src, mig: m }),
          apply(src.mig, '  v_now timestamptz;', '  v_now timestamptz := clock_timestamp();'))],
      ['MU5B-60', 'the renewal stops taking the row lock at all, so nothing makes its reading fresh',
        () => redStatic((m) => checkAttemptDeadline({ ...src, mig: m }),
          apply(src.mig, '     for update;\n\n  if v_job.id is null then\n    return false;\n  end if;\n\n  v_now := clock_timestamp();', '\n  v_now := clock_timestamp();'))],
      ['MU5B-61', 'the install guard is disabled, so a second run would meet an existing schema instead of refusing it',
        () => redStatic((m) => hardeningChecks.checkLockDoctrineAndPosture({ ...src, mig: m }),
          apply(src.mig, '  if v_existing is not null then', '  if false then'))],
      ['MU5B-62', 'a destructive DROP is introduced to simulate repeatability',
        () => redStatic((m) => hardeningChecks.checkLockDoctrineAndPosture({ ...src, mig: m }),
          src.mig.replace('begin;', 'begin;\ndrop table if exists public.provider_sync_jobs;'))],
      ['MU5B-63', 'the preflight stops being read-only',
        () => redStatic((m) => hardeningChecks.checkLockDoctrineAndPosture({ ...src, preflight: m }),
          apply(src.preflight, 'with expected_tables(name) as (', 'create table if not exists public.cb005b_preflight_marker(id int);\nwith expected_tables(name) as ('))],
      ['MU5B-64', 'authorization starts locking the job row, so a previous result begins to look like standing permission',
        () => redStatic((m) => hardeningChecks.checkLockDoctrineAndPosture({ ...src, mig: m }),
          apply(src.mig, '  select j.* into v_job from public.provider_sync_jobs j where j.id = p_job_id;', '  select j.* into v_job from public.provider_sync_jobs j where j.id = p_job_id for update;'))],
      ['MU5B-65', 'the worker writes a table directly instead of going through a fenced function',
        () => redStatic((m) => hardeningChecks.checkLockDoctrineAndPosture({ ...src, executor: m }),
          apply(src.executor, 'const execution = { pages: 0,', "const bypass = (sb, id) => sb.from('provider_sync_jobs').update({ status: 'completed' }).eq('id', id);\n  const execution = { pages: 0,"))],
      ['MU5B-66', 'the certified kernel gate stops being called before the execution',
        () => redStatic((m) => hardeningChecks.checkLockDoctrineAndPosture({ ...src, executor: m }),
          apply(src.executor, 'const decision = await authorizeProviderOperation({', 'const decision = { executable: true };\n  const skipped = authorizeProviderOperation_UNUSED({'))],
      ['MU5B-67', 'the report stops labelling its rows, so the kinds of evidence become indistinguishable',
        () => redStatic((m) => hardeningChecks.checkLockDoctrineAndPosture({ ...src, verify: m }),
          apply(src.verify, 'left join row_class rc on rc.id = report.id', '-- class join removed'))],
      ['MU5B-68', 'the report keeps its EXECUTABLE rows but never calls the functions it claims to execute',
        () => redStatic((m) => hardeningChecks.checkLockDoctrineAndPosture({ ...src, verify: m }),
          src.verify.split('cb005b-verification-probe').join('probe-disabled'))],
      ['MU5B-69', 'the renewal stops capping what it grants at the attempt deadline',
        () => redStatic((m) => checkAttemptDeadline({ ...src, mig: m }),
          apply(src.mig, '                                 j.attempt_started_at + make_interval(secs => j.max_attempt_seconds)\n                               ),', '                                 v_now + make_interval(secs => p_lease_seconds)\n                               ),'))],
      ['MU5B-70', 'the executor stops stopping on an expired attempt, and carries on after it',
        () => redStatic((m) => hardeningChecks.checkLockDoctrineAndPosture({ ...src, executor: m }),
          apply(src.executor, 'if (isLeaseFence(code) || code === ATTEMPT_EXPIRED) {', 'if (isLeaseFence(code)) {'))],
      ['MU5B-71', 'the authorization that verified a live claim is allowed to survive its lease (the model refuses it)',
        () => redBehavioural(src, /^CB5B-14[0-2]/, { laxAuthorization: true })],
      ['MU5B-72', 'the ingest stops re-reading the LEASE at the mutation boundary, so a unit that waited past its lease still writes',
        () => redStatic((m) => checkAttemptDeadline({ ...src, mig: m }),
          apply(src.mig, "  if v_now >= v_job.lease_expires_at then\n    raise exception 'provider_sync_observation_ingest: LEASE_FENCED (lease_expired while the unit waited for its keys)'", "  if false then\n    raise exception 'provider_sync_observation_ingest: LEASE_FENCED (lease_expired while the unit waited for its keys)'"))],
      ['MU5B-73', 'the ingest stops re-asserting the claim at the mutation boundary, so a claim lost during the wait is invisible at the write',
        () => redStatic((m) => checkAttemptDeadline({ ...src, mig: m }),
          apply(src.mig, '  select j.* into v_job\n    from public.provider_sync_jobs j\n   where j.id = p_job_id;\n', ''))],
      ['MU5B-74', 'the database stops re-judging the lease after the key wait (the model refuses it)',
        () => redBehavioural(src, /^CB5B-144/, { modelIgnoresBoundaryLease: true })],
    ];

    for (const [id, why, detect] of [...cases, ...modelMutations]) {
      let detected = false;
      try { detected = await detect(); } catch (e) { detected = false; }
      if (!detected) undetected.push(`${id} (${why})`);
    }
    ok('MU5B', undetected.length === 0, `CB-005B mutations NOT detected: ${undetected.join('; ')}`);
  }

  return { run, mutation };
};