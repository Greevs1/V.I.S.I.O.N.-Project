/**
 * CONNECTED BUSINESS — CB-004.1 LIVE SYNC AUTHORIZATION CHECKS
 *
 * Extracted from scripts/connectedBusinessFoundation.test.cjs so the harness
 * stays editable; the harness requires this module and calls run() + mutation().
 * Every check is additive — nothing here weakens a CB-001, CB-001.1, CB-001.2,
 * CB-002, CB-002.1, CB-003 or CB-004 check.
 *
 * WHAT THIS IS FOR
 *   CB-004.1 exists because three live-sync operations performed NO actor
 *   resolution: a request-body `business_id`, `consumer_id` or `action_id` WAS
 *   the authority, and the service role supplied the capability. The invariant
 *   that replaces it is easy to lose in a later edit and hard to notice, so every
 *   way it can break is a mutation below: skipping authenticateActor, trusting
 *   request.business_id over the row, skipping authorizeBusinessAccess, standing
 *   on Base44 `user.role`, dropping the resource→business binding, letting view
 *   imply mutation, recording the circuit breaker before authorization, or
 *   defaulting an unknown capability to a permissive one.
 *
 * HOW IT PROVES THINGS — BEHAVIOURAL, NOT TEXTUAL
 *   The REAL entry point is transpiled with the real esbuild and EXECUTED: the
 *   module-level Supabase client is built through a stub `createClient` that
 *   captures the URL it was given, the SDK is stubbed to supply a per-scenario
 *   actor, and the canonical Security Kernel (authenticateActor /
 *   authorizeBusinessAccess / validateBusinessScope) is injected as SPIES — so
 *   the shipped boundary is the thing under test, running its real parse → gate
 *   → act path against real event construction. `orchestrateLiveSync` and
 *   `recordLiveActionResult` are stubbed so an unauthorized path's SIDE EFFECTS
 *   are countable: a denial must produce zero inserts, zero updates and zero
 *   breaker activity.
 *
 * WHAT IT CANNOT PROVE
 *   That the live-sync store exists (it does not — see CB41-26, which proves the
 *   missing store fails safely) or that the deployed ACLs match any artifact.
 *
 * The module is pure: it reads strings, executes the entry in-process, calls the
 * supplied `ok`, and uses the supplied `collect` for mutation isolation. It
 * writes nothing.
 */
module.exports = function createCb41Checks({ ok, stripComments, collect }) {
  const fs = require('fs');
  const path = require('path');
  const ROOT = path.join(__dirname, '..');

  const RAW_URL = 'https://vision-test-project.supabase.co/rest/v1/';
  const NORMALIZED_URL = 'https://vision-test-project.supabase.co';
  const SYNTHETIC_KEY = 'vision_test_service_key_not_a_real_secret';

  const BUSINESS_A = '11111111-1111-1111-1111-111111111111';
  const BUSINESS_B = '22222222-2222-2222-2222-222222222222';
  const ACTION_A = '33333333-3333-3333-3333-333333333333';
  const ACTION_B = '44444444-4444-4444-4444-444444444444';
  const ACTION_MISSING = '55555555-5555-5555-5555-555555555555';

  const AUTHORITY_FIELDS = ['consumer_id', 'mode', 'governance_classification', 'role', 'profile_id', 'actor'];
  const GRID = [
    'CB41-1', 'CB41-2', 'CB41-3', 'CB41-4', 'CB41-5', 'CB41-6', 'CB41-7', 'CB41-8', 'CB41-9',
    'CB41-10', 'CB41-11', 'CB41-12', 'CB41-13', 'CB41-14', 'CB41-15', 'CB41-16', 'CB41-17',
    'CB41-18', 'CB41-19', 'CB41-20', 'CB41-21', 'CB41-22', 'CB41-23', 'CB41-24', 'CB41-25',
    'CB41-26', 'CB41-27', 'CB41-28', 'CB41-29', 'CB41-30',
    'CB41-S1', 'CB41-S2', 'CB41-S3', 'CB41-S4', 'CB41-S5', 'CB41-S6', 'CB41-S7',
    'CB41-S8', 'CB41-S9', 'CB41-S10',
  ];

  /** TypeScript comment stripping: a header comment must never satisfy, or trip, a check. */
  const stripTsComments = (src) => (src || '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s\/\/[^\n]*$/gm, '');

  /**
   * A mutation that silently FAILS TO APPLY is indistinguishable from one the
   * suite failed to detect. Every case goes through this helper, which throws
   * when the target is absent, so the runner reports THREW(mutation target not
   * found) instead of a misleading "not detected".
   */
  const apply = (source, from, to) => {
    const out = source.replace(from, to);
    if (out === source) throw new Error(`mutation target not found: ${String(from).slice(0, 80)}`);
    return out;
  };

  /**
   * Every check goes through here. During a mutation run `sink` is set, so the
   * mutated suite's failures are collected LOCALLY and the global counters are
   * left untouched — which is what makes the behavioural mutations safe to run.
   */
  let sink = null;
  const check = (id, condition, detail) => {
    if (sink) {
      sink.push({ id, condition: !!condition, detail });
      return !!condition;
    }
    return ok(id, condition, detail);
  };

  // ══════════════════════════════════════════════════════════════════════════
  // THE SANDBOX
  // ══════════════════════════════════════════════════════════════════════════

  function compile(source) {
    const { transformSync } = require('esbuild');
    return transformSync(source, { loader: 'ts', format: 'cjs', target: 'node18' }).code;
  }

  function evaluate(code, requireShim) {
    const mod = { exports: {} };
    const deno = {
      env: {
        get: (key) => {
          if (key === 'VITE_SUPABASE_URL') return RAW_URL;
          if (key === 'SUPABASE_SERVICE_ROLE_KEY') return SYNTHETIC_KEY;
          return undefined;
        },
      },
    };
    // eslint-disable-next-line no-new-func
    new Function('exports', 'module', 'require', 'Deno', code)(mod.exports, mod, requireShim, deno);
    return mod.exports;
  }

  function newState() {
    return {
      capturedUrl: null,
      capturedKey: false,
      base44: undefined,
      resourceResult: { data: null, error: null },
      opResults: {
        select: { data: [], error: null },
        insert: { data: [], error: null },
        update: { error: null },
      },
      calls: { tables: [], inserts: [], updates: [], selects: [], rpcs: [] },
    };
  }

  function resetCalls(state) {
    for (const key of Object.keys(state.calls)) state.calls[key].length = 0;
  }

  /** A chainable Supabase stub whose results are read from the mutable state. */
  function makeSbClient(state) {
    function builder(table) {
      const b = {
        _op: 'select',
        insert(rows) { b._op = 'insert'; state.calls.inserts.push({ table, rows }); return b; },
        update(data) { b._op = 'update'; state.calls.updates.push({ table, data }); return b; },
        select(cols) { state.calls.selects.push({ table, cols: cols === undefined ? null : cols }); return b; },
        eq() { return b; },
        order() { return b; },
        limit() { return b; },
        single() { return Promise.resolve(state.resourceResult); },
        maybeSingle() { return Promise.resolve(state.resourceResult); },
        rpc(name, args) { state.calls.rpcs.push({ name, args }); return Promise.resolve({ data: null, error: null }); },
        then(resolve, reject) {
          const result = state.opResults[b._op] || { data: null, error: null };
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return b;
    }
    return { from(table) { state.calls.tables.push(table); return builder(table); } };
  }

  function makeSpies() {
    const spies = {
      authenticate: 0, business: [], scope: [], normalize: [], recordActionResult: [], orchestrate: 0,
      breakerCalls: 0, reasons: {},
    };

    spies.authenticateActor = async (base44) => {
      spies.authenticate += 1;
      if (!base44) { const e = new Error('Unauthorized'); e.status = 401; throw e; }
      const actor = base44.__actor;
      if (!actor || actor.__suspended) { const e = new Error('Forbidden: account not authorized'); e.status = 403; throw e; }
      return actor;
    };

    spies.authorizeBusinessAccess = async (sb, actor, businessId) => {
      spies.business.push(businessId);
      if (actor && actor.isAdmin) return true;
      if (actor && Array.isArray(actor.businesses) && actor.businesses.indexOf(businessId) > -1) return true;
      const e = new Error('Forbidden: no access to that business'); e.status = 403; throw e;
    };

    spies.validateBusinessScope = async (sb, businessId, profileId) => {
      spies.scope.push(businessId);
      return {
        business_id: businessId,
        profile_id: profileId,
        is_authorized: true,
        authorization_reason: spies.reasons[profileId] || '',
      };
    };

    spies.recordLiveActionResult = (consumerId, success, errorClass) => {
      spies.recordActionResult.push({ consumerId, success, errorClass });
    };

    spies.orchestrateLiveSync = (event) => {
      spies.orchestrate += 1;
      return {
        event,
      shadow_decisions: [],
      live_actions: [{
        event_id: event.event_id,
        business_id: event.business_id,
        fact_key: event.fact_key,
        consumer_id: 'dashboard',
        mode: 'shadow',
        action_type: 'record_only',
        governance_classification: 'automatic',
        circuit_breaker_tripped: false,
        status: 'shadow_recorded',
        reason: 'Not in live matrix.',
        timestamp: event.timestamp,
      }],
        summary: {},
      };
    };

    return spies;
  }

  /** Load and EXECUTE the real entry point against the stub environment. */
  function makeEnv(src) {
    const state = newState();
    const spies = makeSpies();

    const moduleExports = evaluate(compile(src.module), (spec) => {
      if (spec === '../authz/actor.ts') {
        return { authenticateActor: spies.authenticateActor, authorizeBusinessAccess: spies.authorizeBusinessAccess };
      }
      if (spec === '../businessScope/writeGuard.ts') return { validateBusinessScope: spies.validateBusinessScope };
      throw new Error(`unexpected import in the live-sync authorization module: ${spec}`);
    });

    const projectUrl = evaluate(compile(src.projectUrl), () => {
      throw new Error('unexpected runtime import in projectUrl.ts');
    });

    const events = evaluate(compile(src.events), (spec) => {
      throw new Error(`unexpected runtime import in events.ts: ${spec}`);
    });

    const policy = {
      isLiveSyncEnabled: () => false,
      getLiveSyncMode: () => 'shadow',
      getPilotStatus: () => ({ global_live_sync_enabled: false, pilot_businesses: [], live_matrix: {} }),
      setGlobalLiveSyncEnabled: () => { spies.breakerCalls += 1; },
      isGlobalLiveSyncEnabled: () => false,
      addPilotBusiness: () => { spies.breakerCalls += 1; },
      removePilotBusiness: () => { spies.breakerCalls += 1; },
      getPilotBusinessIds: () => [],
    };

    const breaker = {
      isTripped: () => false,
      recordSuccess: () => { spies.breakerCalls += 1; },
      recordFailure: () => { spies.breakerCalls += 1; },
      tripBreaker: () => { spies.breakerCalls += 1; },
      resetBreaker: () => { spies.breakerCalls += 1; },
      getBreakerState: () => ({ status: 'closed' }),
      getAllBreakerStates: () => ({}),
      resetAllBreakers: () => { spies.breakerCalls += 1; },
    };

    const entryExports = evaluate(compile(src.entry), (spec) => {
      if (spec === 'npm:@base44/sdk@0.8.31') return { createClientFromRequest: () => state.base44 };
      if (spec === 'https://esm.sh/@supabase/supabase-js@2') {
        return {
          createClient: (url, key) => {
            state.capturedUrl = url;
            state.capturedKey = Boolean(key);
            return makeSbClient(state);
          },
        };
      }
      if (spec === '../../shared/supabase/projectUrl.ts') {
        return {
          normalizeSupabaseProjectUrl: (value) => {
            spies.normalize.push(value);
            return projectUrl.normalizeSupabaseProjectUrl(value);
          },
        };
      }
      if (spec === '../../shared/authz/actor.ts') return { authenticateActor: spies.authenticateActor };
      if (spec === '../../shared/businessStateSync/liveSyncAuthorization.ts') return moduleExports;
      if (spec === '../../shared/businessStateSync/liveSyncPolicy.ts') return policy;
      if (spec === '../../shared/businessStateSync/circuitBreaker.ts') return breaker;
      if (spec === '../../shared/businessStateSync/eventQualification.ts') return { qualifyEvent: () => ({ qualified: false, checks: {}, reasons: [] }) };
      if (spec === '../../shared/businessStateSync/liveOrchestrator.ts') {
        return { orchestrateLiveSync: spies.orchestrateLiveSync, recordLiveActionResult: spies.recordLiveActionResult };
      }
      if (spec === '../../shared/businessStateSync/events.ts') return events;
      if (spec === '../../shared/businessStateSync/deduplication.ts') return { deduplicateEvents: (list) => list };
      throw new Error(`unexpected import in liveSyncOrchestrator: ${spec}`);
    });

    const call = async (options) => {
      const opts = options || {};
      resetCalls(state);
      state.base44 = opts.actor === undefined ? undefined : { __actor: opts.actor };
      const url = 'https://vision.test/functions/liveSyncOrchestrator' + (opts.action ? `?action=${opts.action}` : '');
      // The dispatcher accepts the action from the query string OR the body.
      const body = { ...(opts.body || {}), action: opts.action || (opts.body && opts.body.action) };
      const response = await entryExports.default({ url, json: async () => body });
      const payload = await response.json();
      return { status: response.status, payload };
    };

    return { state, spies, call, module: moduleExports };
  }

  const ACTORS = {
    ownerA: () => ({ profile_id: 'p-owner-a', isAdmin: false, businesses: [BUSINESS_A], user: { role: 'owner' } }),
    ownerB: () => ({ profile_id: 'p-owner-b', isAdmin: false, businesses: [BUSINESS_B], user: { role: 'owner' } }),
    teamA: () => ({ profile_id: 'p-team-a', isAdmin: false, businesses: [BUSINESS_A], user: { role: 'user' } }),
    advisorA: () => ({ profile_id: 'p-adv-a', isAdmin: false, businesses: [BUSINESS_A], user: { role: 'advisor' } }),
    expertA: () => ({ profile_id: 'p-expert-a', isAdmin: false, businesses: [BUSINESS_A], user: { role: 'expert' } }),
    unrelatedAdvisor: () => ({ profile_id: 'p-adv-x', isAdmin: false, businesses: [], user: { role: 'advisor' } }),
    admin: () => ({ profile_id: 'p-admin', isAdmin: true, businesses: [], user: { role: 'admin' } }),
    base44AdminLooking: () => ({ profile_id: 'p-owner-x', isAdmin: false, businesses: [BUSINESS_A], user: { role: 'admin' } }),
    unresolved: () => ({ profile_id: null, isAdmin: false, businesses: [], user: { role: 'user' } }),
    suspended: () => ({ profile_id: 'p-susp', isAdmin: false, businesses: [BUSINESS_A], user: { role: 'owner' }, __suspended: true }),
  };

  const REASONS = {
    'p-owner-a': 'owner (business_entities.profile_id)',
    'p-owner-b': 'owner (business_entities.profile_id)',
    'p-team-a': 'team_member',
    'p-adv-a': 'assigned_advisor (business_entities.assigned_advisor_id)',
    'p-expert-a': 'expert_access',
  };

  const rowB = () => ({ data: { id: ACTION_B, business_id: BUSINESS_B, consumer_id: 'dashboard', mode: 'live' }, error: null });
  const rowA = () => ({ data: { id: ACTION_A, business_id: BUSINESS_A, consumer_id: 'dashboard', mode: 'live' }, error: null });
  const missingTable = () => ({ data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.live_sync_actions' in the schema cache" } });

  function applyReasons(spies) {
    Object.assign(spies.reasons, REASONS);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BEHAVIOURAL SUITE — the 30 required behaviours, executed
  // ══════════════════════════════════════════════════════════════════════════
  async function behavioural(src) {
    const env = makeEnv(src);
    const { state, spies, call } = env;
    applyReasons(spies);

    const readBody = (businessId, consumerId) => ({ action: 'getLiveSyncActions', business_id: businessId, consumer_id: consumerId || 'galileo' });
    const completeBody = (actionId, extra) => ({ action: 'completeLiveSyncAction', action_id: actionId, success: true, ...(extra || {}) });
    // A well-formed canonical event: the entry runs the canonical validateEvent,
    // so a fixture must satisfy the real contract.
    const eventBody = (extra) => ({
      action: 'orchestrateLiveSync',
      event: {
        business_id: BUSINESS_A,
        fact_key: 'revenue',
        event_type: 'revenue_updated',
        previous_value: 1000,
        new_value: 1200,
        effective_date: '2026-09-30',
        confidence: 90,
        verification_status: 'verified',
        source_authority: 'reviewed_financials',
        reason: 'Reviewed financials restated',
        timestamp: '2026-10-01T00:00:00.000Z',
        ...(extra || {}),
      },
    });

    // ── 1. anonymous actor denied ───────────────────────────────────────────
    let r = await call({ actor: undefined, body: readBody(BUSINESS_A) });
    check('CB41-1', r.status === 401 && r.payload.code === 'NOT_AUTHORIZED' && spies.business.length === 0,
      `an anonymous caller must be refused before any business is considered (status=${r.status}, code=${r.payload.code}, businessCalls=${spies.business.length})`);

    // ── 2. unresolved actor denied (no canonical profile) ────────────────────
    r = await call({ actor: ACTORS.unresolved(), body: readBody(BUSINESS_A) });
    check('CB41-2', r.status === 401 && r.payload.code === 'NOT_AUTHORIZED' && spies.business.length === 0,
      `an actor with no canonical profile has no standing (status=${r.status}, code=${r.payload.code})`);

    // ── 3. suspended actor denied ───────────────────────────────────────────
    r = await call({ actor: ACTORS.suspended(), body: readBody(BUSINESS_A) });
    check('CB41-3', r.status === 403 && r.payload.code === 'NOT_AUTHORIZED' && state.calls.selects.length === 0,
      `a suspended canonical profile is refused centrally (status=${r.status}, selects=${state.calls.selects.length})`);

    // ── 4. owner can access own authorized resource ─────────────────────────
    state.resourceResult = rowB();
    r = await call({ actor: ACTORS.ownerB(), body: completeBody(ACTION_B) });
    check('CB41-4', r.status === 200 && state.calls.updates.length === 1 && spies.business.indexOf(BUSINESS_B) > -1,
      `the owner of the row's business may complete it (status=${r.status}, updates=${state.calls.updates.length}, businesses=${JSON.stringify(spies.business)})`);

    // ── 5. owner cannot access another business's resource (read) ───────────
    r = await call({ actor: ACTORS.ownerA(), body: readBody(BUSINESS_B) });
    check('CB41-5', r.status === 403 && r.payload.code === 'NOT_AUTHORIZED' && state.calls.selects.length === 0,
      `replacing business_id must not read another business (status=${r.status}, selects=${state.calls.selects.length})`);

    // ── 6. caller business_id cannot override row business_id ───────────────
    state.resourceResult = rowB();
    const businessBefore6 = spies.business.length;
    r = await call({ actor: ACTORS.ownerA(), body: completeBody(ACTION_B, { business_id: BUSINESS_A }) });
    check('CB41-6', r.status === 404 && r.payload.code === 'RESOURCE_UNAVAILABLE' && spies.business.length === businessBefore6
      && state.calls.updates.length === 0,
      `a request business_id that contradicts the row is refused BEFORE any business is authorized (status=${r.status}, code=${r.payload.code}, businessCalls=${spies.business.length - businessBefore6})`);

    // ── 7. caller action_id cannot cross tenant ─────────────────────────────
    state.resourceResult = rowB();
    r = await call({ actor: ACTORS.ownerA(), body: completeBody(ACTION_B) });
    const foreign = { status: r.status, payload: JSON.stringify(r.payload) };
    check('CB41-7', r.status === 404 && r.payload.code === 'RESOURCE_UNAVAILABLE' && state.calls.updates.length === 0
      && spies.business.indexOf(BUSINESS_B) > -1,
      `another tenant's action_id is refused on the row's business (status=${r.status}, code=${r.payload.code}, authorizedOn=${JSON.stringify(spies.business)})`);

    // ── 8. team member view allowed ─────────────────────────────────────────
    r = await call({ actor: ACTORS.teamA(), body: readBody(BUSINESS_A) });
    check('CB41-8', r.status === 200 && state.calls.selects.length === 1 && state.calls.selects[0].table === 'live_sync_actions',
      `a team member may view (status=${r.status}, selects=${state.calls.selects.length})`);

    // ── 9. team member start/complete denied ────────────────────────────────
    const teamStart = await call({ actor: ACTORS.teamA(), body: eventBody(), action: 'orchestrateLiveSync' });
    const teamStartInserts = state.calls.inserts.length;
    state.resourceResult = rowA();
    const recordsBefore9 = spies.recordActionResult.length;
    const teamComplete = await call({ actor: ACTORS.teamA(), body: completeBody(ACTION_A) });
    check('CB41-9', teamStart.status === 403 && teamStartInserts === 0 && teamComplete.status === 403
      && state.calls.updates.length === 0 && spies.recordActionResult.length === recordsBefore9,
      `team membership grants no execution authority (start=${teamStart.status}, inserts=${teamStartInserts}, complete=${teamComplete.status}, updates=${state.calls.updates.length})`);

    // ── 10. assigned advisor behaviour correct ──────────────────────────────
    r = await call({ actor: ACTORS.advisorA(), body: eventBody(), action: 'orchestrateLiveSync' });
    check('CB41-10', spies.business.indexOf(BUSINESS_A) > -1 && spies.scope.indexOf(BUSINESS_A) > -1
      && r.status === 200 && state.calls.inserts.length === 1,
      `an assigned advisor is authorized and the operation proceeds to the store (status=${r.status}, inserts=${state.calls.inserts.length})`);

    // ── 11. unrelated advisor denied ────────────────────────────────────────
    r = await call({ actor: ACTORS.unrelatedAdvisor(), body: eventBody(), action: 'orchestrateLiveSync' });
    check('CB41-11', r.status === 403 && r.payload.code === 'NOT_AUTHORIZED' && state.calls.inserts.length === 0,
      `an advisor with no relationship to the business is refused (status=${r.status}, inserts=${state.calls.inserts.length})`);

    // ── 12. expert view allowed but mutation denied ─────────────────────────
    const expertView = await call({ actor: ACTORS.expertA(), body: readBody(BUSINESS_A) });
    const expertStart = await call({ actor: ACTORS.expertA(), body: eventBody(), action: 'orchestrateLiveSync' });
    check('CB41-12', expertView.status === 200 && expertStart.status === 403 && state.calls.inserts.length === 0,
      `an active expert may view and may not execute (view=${expertView.status}, start=${expertStart.status})`);

    // ── 13. platform admin follows existing platform policy ─────────────────
    const businessBefore13 = spies.business.length;
    r = await call({ actor: ACTORS.admin(), body: readBody(BUSINESS_B) });
    check('CB41-13', r.status === 200 && state.calls.selects.length === 1 && spies.business.length - businessBefore13 === 1,
      `a canonical platform admin is admitted by the EXISTING policy on a business they do not belong to (status=${r.status})`);

    // ── 14. nonexistent resource non-enumerable ─────────────────────────────
    state.resourceResult = { data: null, error: null };
    const recordsBefore14 = spies.recordActionResult.length;
    r = await call({ actor: ACTORS.ownerB(), body: completeBody(ACTION_MISSING) });
    const absent = { status: r.status, payload: JSON.stringify(r.payload) };
    check('CB41-14', r.status === 404 && r.payload.code === 'RESOURCE_UNAVAILABLE' && state.calls.updates.length === 0
      && spies.recordActionResult.length === recordsBefore14
      && absent.payload.indexOf(BUSINESS_B) === -1 && absent.payload.indexOf(ACTION_MISSING) === -1,
      `an absent resource is generic and discloses nothing (status=${r.status}, payload=${absent.payload})`);

    // ── 15. foreign resource externally indistinguishable from unavailable ──
    check('CB41-15', foreign.status === absent.status && foreign.payload === absent.payload,
      `a foreign resource must be byte-identical to an absent one (foreign=${foreign.payload} absent=${absent.payload})`);

    // ── 16. service_role alone establishes no application authorization ─────
    r = await call({ actor: ACTORS.unrelatedAdvisor(), body: readBody(BUSINESS_A) });
    check('CB41-16', state.capturedKey === true && r.status === 403 && state.calls.selects.length === 0,
      `holding the service-role client authorizes nothing (keyPresent=${state.capturedKey}, status=${r.status})`);

    // ── 17. Base44 user.role cannot substitute for profiles.app_role ────────
    r = await call({ actor: ACTORS.base44AdminLooking(), body: readBody(BUSINESS_B) });
    check('CB41-17', r.status === 403 && state.calls.selects.length === 0,
      `a Base44 admin-looking user with non-admin app_role gains nothing by that role (status=${r.status})`);

    // ── 18. authorized completion reaches the intended operation ────────────
    state.resourceResult = rowA();
    const recordsBefore18 = spies.recordActionResult.length;
    r = await call({ actor: ACTORS.ownerA(), body: completeBody(ACTION_A, { success: false, error_class: 'transient' }) });
    const updated = state.calls.updates[0];
    const recorded18 = spies.recordActionResult.slice(recordsBefore18);
    check('CB41-18', r.status === 200 && updated && updated.data.status === 'failed'
      && recorded18.length === 1 && recorded18[0].consumerId === 'dashboard',
      `an authorized completion records the breaker and updates the exact row (updates=${state.calls.updates.length}, breaker=${spies.recordActionResult.length})`);

    // ── 19. authorized orchestration reaches the intended operation ─────────
    resetCalls(state);
    const orchestrateBefore = spies.orchestrate;
    r = await call({ actor: ACTORS.ownerA(), body: eventBody(), action: 'orchestrateLiveSync' });
    const insertedRows = state.calls.inserts.length === 1 ? state.calls.inserts[0].rows : [];
    check('CB41-19', state.calls.inserts.length === 1 && insertedRows.length === 1
      && insertedRows[0].business_id === BUSINESS_A && (spies.orchestrate - orchestrateBefore) === 1,
      `an authorized orchestration runs and writes the AUTHORIZED business only (inserts=${state.calls.inserts.length}, business=${insertedRows[0] && insertedRows[0].business_id})`);

    // ── 20. authorized read reaches the intended operation ──────────────────
    r = await call({ actor: ACTORS.ownerA(), body: readBody(BUSINESS_A) });
    check('CB41-20', r.status === 200 && state.calls.selects.length === 1 && Array.isArray(r.payload.actions),
      `an authorized read returns the actions of the authorized business (status=${r.status}, selects=${state.calls.selects.length})`);

    // ── 21. unauthorized complete produces ZERO breaker calls ───────────────
    state.resourceResult = rowB();
    const recordsBefore21 = spies.recordActionResult.length;
    const breakerBefore21 = spies.breakerCalls;
    await call({ actor: ACTORS.ownerA(), body: completeBody(ACTION_B) });
    check('CB41-21', spies.recordActionResult.length === recordsBefore21 && spies.breakerCalls === breakerBefore21,
      `an unauthorized completion has zero circuit-breaker side effects (records=${spies.recordActionResult.length - recordsBefore21}, breaker=${spies.breakerCalls - breakerBefore21})`);

    // ── 22. unauthorized complete produces ZERO database mutations ──────────
    check('CB41-22', state.calls.updates.length === 0 && state.calls.inserts.length === 0 && state.calls.rpcs.length === 0,
      `an unauthorized completion performs no mutation (updates=${state.calls.updates.length}, inserts=${state.calls.inserts.length})`);

    // ── 23. unauthorized orchestration produces ZERO inserts ────────────────
    const orchestrateBase = spies.orchestrate;
    await call({ actor: ACTORS.unrelatedAdvisor(), body: eventBody(), action: 'orchestrateLiveSync' });
    check('CB41-23', state.calls.inserts.length === 0 && spies.orchestrate === orchestrateBase,
      `an unauthorized orchestration never reaches orchestration or persistence (inserts=${state.calls.inserts.length})`);

    // ── 24. unknown capability / authority-shaped payload fails closed ──────
    const unknownOp = env.module.capabilityForOperation('__probe__');
    const unknownTarget = env.module.resolveLiveSyncTarget({ actor: ACTORS.ownerA(), operation: '__probe__', requestBusinessId: BUSINESS_A });
    // Every authority-shaped field is refused individually, so no combination of
    // them can smuggle authority through the payload.
    let authorityRejected = 0;
    const businessBefore24 = spies.business.length;
    for (const field of AUTHORITY_FIELDS) {
      const attempt = await call({
        actor: ACTORS.ownerA(),
        body: { event: { business_id: BUSINESS_A, fact_key: 'revenue', event_type: 'revenue_updated', [field]: 'forged' } },
        action: 'orchestrateLiveSync',
      });
      if (attempt.status === 400 && attempt.payload.code === 'INVALID_REQUEST') authorityRejected += 1;
    }
    check('CB41-24', unknownOp === null && unknownTarget.reason_code === 'INVALID_CAPABILITY'
      && authorityRejected === AUTHORITY_FIELDS.length && spies.business.length === businessBefore24,
      `an unknown capability is a DENY and every authority-shaped event field is refused (op=${String(unknownOp)}, target=${unknownTarget.reason_code}, rejected=${authorityRejected}/${AUTHORITY_FIELDS.length})`);

    // ── 25. malformed / unknown action fails closed ─────────────────────────
    const malformed = await call({ actor: ACTORS.ownerB(), body: completeBody('not-a-uuid') });
    check('CB41-25', malformed.status === 404 && malformed.payload.code === 'RESOURCE_UNAVAILABLE'
      && state.calls.tables.indexOf('live_sync_actions') === -1 && state.calls.updates.length === 0
      && malformed.payload.code === JSON.parse(absent.payload).code,
      `a malformed id is reported exactly like an absent one and never reaches the store (status=${malformed.status})`);

    // ── 26. missing infrastructure fails safely without leaking ─────────────
    state.opResults.insert = missingTable();
    const infra = await call({ actor: ACTORS.ownerA(), body: eventBody(), action: 'orchestrateLiveSync' });
    state.resourceResult = missingTable();
    const infraRow = await call({ actor: ACTORS.ownerB(), body: completeBody(ACTION_B) });
    const leak = /schema cache|PGRST|does not exist|live_sync_actions|SQLSTATE|42P01/i
      .test(JSON.stringify(infra.payload) + JSON.stringify(infraRow.payload));
    check('CB41-26', infra.status === 503 && infra.payload.code === 'SERVICE_UNAVAILABLE'
      && infraRow.status === 503 && infraRow.payload.code === 'SERVICE_UNAVAILABLE'
      && !leak,
      `a missing store is infrastructure, NOT an absent resource, and leaks no raw detail (write=${infra.status}, read=${infraRow.status}, leak=${leak})`);

    // ── 27. control plane uses canonical profiles.app_role standing ─────────
    r = await call({ actor: ACTORS.admin(), body: {}, action: 'getPilotStatus' });
    check('CB41-27', r.status === 200 && spies.authenticate >= 1,
      `the control plane resolves canonical standing through authenticateActor (status=${r.status}, authenticateCalls=${spies.authenticate})`);

    // ── 28. Base44 admin-looking user denied the admin control plane ────────
    r = await call({ actor: ACTORS.base44AdminLooking(), body: {}, action: 'getPilotStatus' });
    check('CB41-28', r.status === 403 && r.payload.code === 'NOT_AUTHORIZED',
      `Base44 user.role must not stand in for profiles.app_role (status=${r.status})`);

    // ── 29. canonical platform admin allowed ───────────────────────────────
    r = await call({ actor: ACTORS.admin(), body: { consumer_id: 'dashboard' }, action: 'getBreakerState' });
    check('CB41-29', r.status === 200,
      `a canonical platform admin is allowed by the existing policy (status=${r.status})`);

    // ── 30. the Supabase URL is normalized before use ───────────────────────
    check('CB41-30', state.capturedUrl === NORMALIZED_URL && spies.normalize.length === 1
      && spies.normalize[0] === RAW_URL,
      `the client must be built from the NORMALIZED project URL (captured=${state.capturedUrl}, normalizedCalls=${spies.normalize.length})`);

    return env;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STATIC CHECKS — artifact-level facts the behavioural run cannot prove
  // ══════════════════════════════════════════════════════════════════════════
  function staticChecks(src) {
    const entry = stripTsComments(src.entry);
    const moduleSrc = stripTsComments(src.module);
    const entryAndModule = entry + '\n' + moduleSrc;

    check('CB41-S1', !/\.user\s*\.\s*role|user\.role/.test(entry) && /actor\.isAdmin/.test(entry),
      'the orchestrator must not authorize on Base44 user.role anywhere — canonical actor.isAdmin only');

    check('CB41-S2', /authenticateActor\s*\(/.test(entryAndModule) && /import \{ authenticateActor \}/.test(src.entry),
      'authenticateActor must be imported and called on both the operation and control-plane paths');

    check('CB41-S3', /authorizeBusinessAccess\s*\(/.test(moduleSrc) && /validateBusinessScope\s*\(/.test(moduleSrc),
      'the module must call the canonical Security Kernel rather than restating business access');

    check('CB41-S4', /resource\.business_id/.test(moduleSrc) && /RESOURCE_BUSINESS_MISMATCH/.test(moduleSrc)
      && /RESOURCE_NOT_FOUND/.test(moduleSrc) && /requiresResourceOperation/.test(moduleSrc),
      'completion must derive its business from the ROW, with an absent row and a contradicting request both refused');

    check('CB41-S5', /return isKnownLiveSyncCapability\(capability\) \? capability : null;/.test(src.module)
      && !/capabilityForOperation[\s\S]{0,400}?\?\s*capability\s*:\s*'live_sync\.view'/.test(src.module),
      'an unknown capability must fail closed — no default may grant view or any other capability');

    const keyLines = entry.split('\n').filter((line) => line.indexOf('supabaseKey') > -1);
    check('CB41-S6', keyLines.length === 3
      && keyLines.every((line) => !/json\(|console\./.test(line))
      && keyLines.some((line) => /createClient\(supabaseUrl, supabaseKey/.test(line)),
      'the service-role key must be used only to build the client — never returned, logged or echoed');

    check('CB41-S7', /normalizeSupabaseProjectUrl\(Deno\.env\.get\("VITE_SUPABASE_URL"\)\)/.test(src.entry)
      && /createClient\(supabaseUrl/.test(src.entry)
      && !/createClient\(\s*Deno\.env\.get/.test(src.entry),
      'the raw VITE_SUPABASE_URL must never reach createClient — the canonical normalizer must');
  }

  /** Disk-level checks: what this phase did NOT touch. */
  function scopeChecks(src) {
    // S8 — no frontend file may reference the boundary.
    const importers = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!/\.(js|jsx|ts|tsx|cjs)$/.test(entry.name)) continue;
        const text = fs.readFileSync(full, 'utf8');
        if (/liveSyncAuthorization|authorizeLiveSyncOperation/.test(text)) {
          importers.push(path.relative(ROOT, full).split(path.sep).join('/'));
        }
      }
    };
    walk(path.join(ROOT, 'src'));
    walk(path.join(ROOT, 'base44'));
    const frontendImporters = importers.filter((p) => p.startsWith('src/'));
    const hookSrc = fs.readFileSync(path.join(ROOT, 'src/hooks/useLiveSyncSubscription.js'), 'utf8');
    check('CB41-S8', frontendImporters.length === 0 && /base44\.entities\.LiveSyncAction\.subscribe/.test(hookSrc),
      `no frontend file may be rewired to this boundary (found: ${frontendImporters.join(', ') || '<none>'})`);

    // S9 — the provider vocabulary is untouched and unimported.
    const vocabulary = fs.readFileSync(path.join(ROOT, 'base44/shared/providers/vocabulary.ts'), 'utf8');
    const providerOps = (vocabulary.match(/^\s*'[a-z._]+',$/gm) || []).length;
    check('CB41-S9', !/providers\//.test(stripTsComments(src.module))
      && !/provider_operation/.test(src.module)
      && providerOps > 0
      && !/live_sync/.test(vocabulary),
      'the live-sync boundary must not import or alter CB-004 provider vocabulary, and must not be routed through the provider kernel');

    // S10 — no SQL was written for this phase.
    const migrationsDir = path.join(ROOT, 'src/supabase/migrations');
    const names = fs.readdirSync(migrationsDir);
    const newPhase = names.filter((n) => /cb_?004_?1|cb0041/i.test(n));
    const hits = names
      .filter((n) => /live_sync_actions/i.test(fs.readFileSync(path.join(migrationsDir, n), 'utf8')))
      .map((n) => fs.readFileSync(path.join(migrationsDir, n), 'utf8'))
      .join('\n');
    const ddl = /create\s+table[^;]*live_sync_actions|alter\s+table[^;]*live_sync_actions|create\s+policy[\s\S]{0,200}?live_sync_actions|grant\s+[^;]*on\s+(table\s+)?(public\.)?live_sync_actions|create\s+index[^;]*live_sync_actions/i.test(hits);
    check('CB41-S10', newPhase.length === 0 && !ddl,
      `CB-004.1 must add no SQL and never create the live-sync store (newPhase=${JSON.stringify(newPhase)}, ddl=${ddl})`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MUTATIONS — every way this boundary can be undone must turn the suite RED
  // ══════════════════════════════════════════════════════════════════════════
  async function mutationCb41(src) {
    const undetected = [];
    const isCb41 = (failure) => /^CB41-/.test(failure);
    // The suite is ASYNCHRONOUS, so isolation is done here rather than through the
    // runner's synchronous `collect`: a promise-returning check would otherwise
    // report its failures AFTER isolation had been lifted, and every mutation
    // would be reported as undetected.
    const isolated = async (fn, ...args) => {
      const out = [];
      sink = out;
      try {
        await fn(...args);
      } finally {
        sink = null;
      }
      return out.filter((entry) => !entry.condition).map((entry) => entry.id);
    };
    let red = async (fn, ...args) => (await isolated(fn, ...args)).some(isCb41);
    const realRed = red;

    const cases = [
      ['MU41-1', 'authenticateActor is removed and a privileged actor is assumed',
        async () => {
          const mutated = apply(src.module,
            '    actor = await authenticateActor(input.base44, sb);',
            "    actor = { profile_id: 'mutant-actor', isAdmin: true, businesses: [input.requestBusinessId] };");
          return red(behavioural, { ...src, module: mutated });
        }],
      ['MU41-2', 'the request business_id is trusted instead of the ROW business_id',
        async () => {
          const mutated = apply(src.module,
            '    const rowBusiness = isUsableId(resource.business_id) ? resource.business_id : null;',
            '    const rowBusiness = isUsableId(input.requestBusinessId) ? input.requestBusinessId : null;');
          return red(behavioural, { ...src, module: mutated });
        }],
      ['MU41-3', 'authorizeBusinessAccess is skipped',
        async () => {
          const mutated = apply(src.module,
            '    await authorizeBusinessAccess(sb, actor, target.business_id);',
            '    businessAccessGranted = true;');
          return red(behavioural, { ...src, module: mutated });
        }],
      ['MU41-4', 'the control plane trusts Base44 user.role again',
        async () => {
          const mutated = apply(src.entry,
            '    if (!actor.isAdmin) {',
            '    if (actor.user && actor.user.role !== "admin" && actor.user.role !== "super_admin") {');
          return red(behavioural, { ...src, entry: mutated });
        }],
      ['MU41-5', 'the resource → business binding is removed from completion',
        async () => {
          const mutated = apply(src.module,
            "    if (!resource) return { reason_code: 'RESOURCE_NOT_FOUND', business_id: requestBusinessId, capability };",
            "    if (!resource) return { reason_code: 'TARGET_RESOLVED', business_id: requestBusinessId, capability };");
          return red(behavioural, { ...src, module: mutated });
        }],
      ['MU41-6', 'live_sync.view is allowed to imply start and complete',
        async () => {
          const mutated = apply(src.module,
            "  'live_sync.start': ['OWNER', 'ASSIGNED_ADVISOR', 'ADVISOR', 'PLATFORM_ADMIN'],",
            "  'live_sync.start': ['OWNER', 'ASSIGNED_ADVISOR', 'ADVISOR', 'PLATFORM_ADMIN', 'TEAM_MEMBER', 'EXPERT'],");
          return red(behavioural, { ...src, module: mutated });
        }],
      ['MU41-7', 'recordLiveActionResult is moved before the authorization gate',
        async () => {
          // Anchored on the COMPLETION handler's own gate call. `await gate({`
          // appears in all three handlers, and a plain replace would mutate the
          // first — the orchestration path — where the mutation is a no-op and
          // would be reported as undetected rather than as a miss.
          const mutated = apply(src.entry,
            '  const { denied, decision } = await gate({\n    base44,\n    operation: "completeLiveSyncAction",',
            "  const early = body?.action_id ? await loadLiveSyncAction(body.action_id) : null;\n  if (early && early.mode === 'live') recordLiveActionResult(early.consumer_id, body?.success, body?.error_class);\n  const { denied, decision } = await gate({\n    base44,\n    operation: \"completeLiveSyncAction\",");
          return red(behavioural, { ...src, entry: mutated });
        }],
      ['MU41-8', 'an unknown capability defaults to view',
        async () => {
          const mutated = apply(src.module,
            '  return isKnownLiveSyncCapability(capability) ? capability : null;',
            "  return isKnownLiveSyncCapability(capability) ? capability : 'live_sync.view';");
          return red(behavioural, { ...src, module: mutated });
        }],
    ];

    for (const [id, why, detect] of cases) {
      const seen = [];
      red = async (fn, ...args) => {
        const ids = await isolated(fn, ...args);
        seen.push(...ids);
        return ids.some(isCb41);
      };
      let detected = false;
      let thrown = '';
      try { detected = await detect(); } catch (e) { thrown = ` THREW(${(e && e.message) || e})`; }
      red = realRed;
      if (!detected) {
        const caught = seen.length ? seen.join(', ') : 'NO failure collected';
        undetected.push(`${id}${thrown} [${caught}] (${why})`);
      }
    }
    check('MU41', undetected.length === 0, `CB-004.1 mutations NOT detected: ${undetected.join('; ')}`);
  }

  async function run(vocab, src) {
    const missing = ['entry', 'module', 'projectUrl', 'events'].filter((k) => !src[k] || src[k].length === 0);
    check('CB41-P', missing.length === 0, `all four CB-004.1 sources must be supplied — missing: ${missing.join(', ')}`);
    if (missing.length > 0) return;

    await behavioural(src);
    staticChecks(src);
    scopeChecks(src);

    // The grid is declared in one place so drift is detectable.
    const declared = GRID.length;
    check('CB41-G', declared === 40, `the CB-004.1 grid must declare 40 checks (declared ${declared})`);
  }

  async function mutation(vocab, src) {
    await mutationCb41(src);
  }

  return { run, mutation };
};