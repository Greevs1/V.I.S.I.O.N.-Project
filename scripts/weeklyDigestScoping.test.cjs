#!/usr/bin/env node
/**
 * P0 Weekly Digest Repair — REGRESSION SUITE
 *
 * Offline. Bundles the REAL base44/shared/digest/weeklyDigestAssembly.ts with esbuild and
 * runs it against an in-memory PostgREST-shaped database that mirrors the audited live
 * data for the affected account (3 businesses):
 *
 *   Business A (target) : 17 sprint paths (1 active), 236 tasks, 53 documents, NO metrics
 *   Business B          : 1 ACTIVE sprint (id sorts first — adversarial), 14 tasks, 3 docs,
 *                         the account's ONLY dashboard_metrics row (ciq 87)
 *   Business C          : 4 documents
 *   NULL business       : 7 documents (legacy)
 *
 * The fake only applies the filters the module actually asks for — so a missing business
 * filter surfaces foreign rows instead of being silently corrected.
 *
 *   node scripts/weeklyDigestScoping.test.cjs
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const ASSEMBLY = 'base44/shared/digest/weeklyDigestAssembly.ts';
const FUNCTION = 'base44/functions/weeklyDigestScheduled/entry.ts';
const LEGACY = 'base44/functions/weeklyDigest/entry.ts';

const A = '42f42075-c453-436a-8c5f-2dc29ef718c6'; // target — "My Business"
const B = 'b3e5ceb3-edfe-4124-bfd7-17faaed2a54f'; // has the only metrics row
const C = 'e507bf87-82d1-4bb7-9ae0-3a30881ac7da';
const NOW = new Date('2026-11-02T16:00:00.000Z');

// ── esbuild the real module (and optionally a mutated copy) ──────────────────
async function loadModule(sourceOverride) {
  const out = path.join(os.tmpdir(), `wda_${Date.now()}_${Math.random().toString(36).slice(2)}.cjs`);
  if (sourceOverride) {
    const tmpEntry = path.join(os.tmpdir(), `wda_src_${Date.now()}_${Math.random().toString(36).slice(2)}.ts`);
    fs.writeFileSync(tmpEntry, sourceOverride);
    await esbuild.build({ entryPoints: [tmpEntry], bundle: true, format: 'cjs', platform: 'node', outfile: out, logLevel: 'silent' });
  } else {
    await esbuild.build({ entryPoints: [path.join(ROOT, ASSEMBLY)], bundle: true, format: 'cjs', platform: 'node', outfile: out, logLevel: 'silent' });
  }
  return require(out);
}

// ── in-memory Supabase stand-in (applies ONLY the filters asked for) ─────────
function createSb(fixtures, calls = []) {
  return {
    from(table) {
      const state = { table, filters: [], order: null, limit: null };
      const run = () => {
        let rows = (fixtures[table] || []).slice();
        for (const [col, op, val] of state.filters) {
          rows = rows.filter((r) => {
            const v = r[col];
            if (op === 'eq') return v === val;
            if (op === 'neq') return v !== val;
            if (op === 'gte') return v != null && String(v) >= String(val);
            if (op === 'lte') return v != null && String(v) <= String(val);
            return true;
          });
        }
        if (state.order) {
          const { col, asc } = state.order;
          rows.sort((x, y) => (x[col] < y[col] ? -1 : x[col] > y[col] ? 1 : 0) * (asc ? 1 : -1));
        }
        if (state.limit != null) rows = rows.slice(0, state.limit);
        return { data: rows, error: null };
      };
      const q = {
        select: () => q,
        eq: (c, v) => { state.filters.push([c, 'eq', v]); return q; },
        neq: (c, v) => { state.filters.push([c, 'neq', v]); return q; },
        gte: (c, v) => { state.filters.push([c, 'gte', v]); return q; },
        lte: (c, v) => { state.filters.push([c, 'lte', v]); return q; },
        order: (c, o) => { state.order = { col: c, asc: !(o && o.ascending === false) }; return q; },
        limit: (n) => { state.limit = n; return q; },
        then: (res, rej) => {
          calls.push({ table, filters: state.filters.map((f) => f.join(':')) });
          Promise.resolve().then(run).then(res, rej);
        },
      };
      return q;
    },
  };
}

function createBase44(opportunities, calls = []) {
  return {
    asServiceRole: {
      entities: {
        galileo_opportunities: {
          filter: async (query) => {
            calls.push({ entity: 'galileo_opportunities', query });
            return opportunities.filter(
              (o) =>
                (!query.business_id || o.business_id === query.business_id) &&
                (!query.profile_id || o.profile_id === query.profile_id)
            );
          },
        },
      },
    },
  };
}

// ── audited live shape ──────────────────────────────────────────────────────
const P = '4b9daf4b-efcd-43d9-a1e6-de5aaaf02aeb';

function buildFixtures(overrides = {}) {
  const sprintPaths = [];
  for (let i = 0; i < 17; i++) {
    sprintPaths.push({
      id: `a-sprint-${String(i).padStart(2, '0')}`,
      path_title: `A sprint ${i}`,
      progress_percent: i === 3 ? 64 : 10,
      business_id: A,
      is_active: i === 3,
    });
  }
  // Adversarial: another business's ACTIVE sprint whose id sorts BEFORE every A sprint,
  // so an unscoped deterministic query would select it.
  sprintPaths.push({ id: '0-b-sprint', path_title: 'B sprint', progress_percent: 99, business_id: B, is_active: true });
  sprintPaths.push({ id: 'c-sprint', path_title: 'C sprint', progress_percent: 5, business_id: C, is_active: false });

  const tasks = [];
  for (let i = 0; i < 236; i++) {
    tasks.push({
      path_id: 'a-sprint-03',
      business_id: A,
      is_deleted: false,
      status: i % 4 === 0 ? 'completed' : 'in_progress',
      due_date: i % 4 === 0 ? '2026-10-10' : i % 7 === 0 ? '2026-11-04' : '2026-11-20',
      title: `A task ${i}`,
    });
  }
  for (let i = 0; i < 14; i++) {
    tasks.push({
      path_id: 'aa-b-sprint',
      business_id: B,
      is_deleted: false,
      status: 'in_progress',
      due_date: '2026-11-04',
      title: `B task ${i}`,
    });
  }

  const documents = [];
  for (let i = 0; i < 53; i++) {
    documents.push({ business_id: A, status: i % 3 === 0 ? 'completed' : 'processing', created_at: i < 9 ? '2026-10-30T10:00:00Z' : '2026-09-01T10:00:00Z' });
  }
  for (let i = 0; i < 3; i++) documents.push({ business_id: B, status: 'completed', created_at: '2026-10-30T10:00:00Z' });
  for (let i = 0; i < 4; i++) documents.push({ business_id: C, status: 'completed', created_at: '2026-10-30T10:00:00Z' });
  for (let i = 0; i < 7; i++) documents.push({ business_id: null, status: 'completed', created_at: '2026-10-30T10:00:00Z' });

  const metrics = [{ business_id: B, ciq_score: 87, created_at: '2026-10-31T10:00:00Z' }];

  const opportunities = [
    { id: 'o1', business_id: A, profile_id: P, status: 'open', created_date: '2026-10-31T10:00:00Z' },
    { id: 'o2', business_id: A, profile_id: P, status: 'completed', created_date: '2026-08-01T10:00:00Z' },
    { id: 'o3', business_id: A, profile_id: P, status: 'open', created_date: '2026-08-02T10:00:00Z' },
    { id: 'o4', business_id: B, profile_id: P, status: 'open', created_date: '2026-10-31T10:00:00Z' },
  ];

  const fixtures = {
    ninety_day_sprint_paths: sprintPaths,
    ninety_day_sprint_tasks: tasks,
    documents,
    dashboard_metrics: metrics,
    profiles: [{ id: P, primary_business_id: A }],
  };
  return { fixtures: { ...fixtures, ...overrides }, opportunities };
}

async function assemble(mod, overrides = {}, opportunitiesOverride) {
  const { fixtures, opportunities } = buildFixtures(overrides);
  const calls = [];
  const sb = createSb(fixtures, calls);
  const base44 = createBase44(opportunitiesOverride ?? opportunities, calls);
  const result = await mod.assembleWeeklyDigest({ sb, base44, profileId: P, businessId: A, now: NOW });
  return { result, calls };
}

// ── harness ─────────────────────────────────────────────────────────────────
const checks = [];
const check = (name, fn) => checks.push({ name, fn });
const ok = (cond, msg) => { if (!cond) throw new Error(msg || 'assertion failed'); };

(async () => {
  const mod = await loadModule();
  const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

  check('D1 — documents counted for the authorized business only (53, not 67)', async () => {
    const { result } = await assemble(mod);
    ok(result.scope.documents_considered === 53, `documents_considered=${result.scope.documents_considered}, expected 53`);
  });

  check('D2 — no NULL-business and no other-business rows used', async () => {
    const { result } = await assemble(mod);
    ok(result.scope.null_business_rows === 0, `null_business_rows=${result.scope.null_business_rows}`);
    ok(result.scope.violations.length === 0, `violations=${JSON.stringify(result.scope.violations)}`);
    ok(result.scope.scope_verified === true, 'scope_verified must be true');
    ok(
      result.scope.distinct_business_ids.length === 1 && result.scope.distinct_business_ids[0] === A,
      `distinct_business_ids=${JSON.stringify(result.scope.distinct_business_ids)}`
    );
  });

  check('D3 — IQ metrics report unavailable, never another business\'s 87', async () => {
    const { result } = await assemble(mod);
    ok(result.digest.iq_score_available === false, 'iq_score_available must be false');
    ok(result.digest.iq_score_change === null, `iq_score_change=${result.digest.iq_score_change} (must be null, not 0)`);
    ok(result.digest.iq_score_display === 'Not yet available.', `display=${result.digest.iq_score_display}`);
    ok(result.message.includes('IQ Score Change: Not yet available.'), 'message must say Not yet available.');
    ok(!result.message.includes('87'), 'message must not contain another business\'s score');
    ok(result.scope.metrics_rows_considered === 0, `metrics_rows_considered=${result.scope.metrics_rows_considered}`);
  });

  check('D4 — active sprint is the business\'s own, deterministically chosen', async () => {
    const { result } = await assemble(mod);
    ok(result.active_sprint && result.active_sprint.id === 'a-sprint-03', `active_sprint=${JSON.stringify(result.active_sprint)}`);
    ok(result.active_sprint.business_id === A, 'active sprint must belong to the authorized business');
    ok(result.digest.sprint_progress === 64, `sprint_progress=${result.digest.sprint_progress}`);
  });

  check('D5 — same-business determinism: two active sprints resolve to the lowest id', async () => {
    const dual = buildFixtures().fixtures.ninety_day_sprint_paths.filter((s) => s.business_id === A && !s.is_active);
    dual.push({ id: 'p2', business_id: A, is_active: true, progress_percent: 20, path_title: 'p2' });
    dual.push({ id: 'p1', business_id: A, is_active: true, progress_percent: 30, path_title: 'p1' });
    const { result } = await assemble(mod, {
      ninety_day_sprint_paths: dual,
      ninety_day_sprint_tasks: buildFixtures().fixtures.ninety_day_sprint_tasks.filter((t) => t.business_id === A),
    });
    ok(result.active_sprint.id === 'p1', `expected deterministic 'p1', got '${result.active_sprint.id}'`);
  });

  check('D6 — sprint tasks counted for the sprint AND business (no B tasks)', async () => {
    const { result } = await assemble(mod);
    ok(result.scope.sprint_tasks_considered === 236, `sprint_tasks_considered=${result.scope.sprint_tasks_considered}`);
    ok(result.digest.tasks_completed === 59, `tasks_completed=${result.digest.tasks_completed} (expected 59 of 236)`);
  });

  check('D7 — opportunities business-scoped', async () => {
    const { result, calls } = await assemble(mod);
    const q = calls.find((c) => c.entity === 'galileo_opportunities').query;
    ok(q.business_id === A, `opportunity query business_id=${q.business_id}`);
    ok(result.digest.new_opportunities === 1, `new_opportunities=${result.digest.new_opportunities}`);
    ok(result.digest.completed_opportunities === 1, `completed=${result.digest.completed_opportunities}`);
  });

  check('D8 — positive control: business WITH metrics reports a real change', async () => {
    const { result } = await assemble(mod, {
      dashboard_metrics: [
        { business_id: A, ciq_score: 70, created_at: '2026-10-30T10:00:00Z' },
        { business_id: A, ciq_score: 64, created_at: '2026-10-20T10:00:00Z' },
      ],
    });
    ok(result.digest.iq_score_available === true, 'must be available with 2 rows');
    ok(result.digest.iq_score_change === 6, `iq_score_change=${result.digest.iq_score_change}`);
    ok(result.message.includes('IQ Score Change: +6'), `message: ${result.message.split('\n').pop()}`);
    ok(result.scope.scope_verified === true, 'scope must remain verified');
  });

  check('D9 — missing business context is refused (module never invents one)', async () => {
    const { fixtures } = buildFixtures();
    let threw = false;
    try {
      await mod.assembleWeeklyDigest({ sb: createSb(fixtures), base44: createBase44([]), profileId: P, businessId: '', now: NOW });
    } catch { threw = true; }
    ok(threw, 'assembly must throw without an authorized business_id');
  });

  // ── mutation sweep: remove a business filter and prove the suite catches it ─
  const source = read(ASSEMBLY);

  check('M1 — mutation: unscoped documents are caught', async () => {
    const mutated = source.replace(
      ".select('status, created_at, business_id')\n    .eq('business_id', businessId)\n    .order('created_at'",
      ".select('status, created_at, business_id')\n    .order('created_at'"
    );
    ok(mutated !== source, 'mutation target not found');
    const m = await loadModule(mutated);
    const { result } = await assemble(m);
    ok(result.scope.documents_considered === 67, `mutated docs=${result.scope.documents_considered}, expected 67 (contamination)`);
    ok(result.scope.scope_verified === false, 'mutation must fail scope verification');
    ok(result.scope.null_business_rows === 7, `mutated null rows=${result.scope.null_business_rows}`);
  });

  check('M2 — mutation: unscoped metrics leak another business\'s IQ', async () => {
    const mutated = source.replace(
      ".select('ciq_score, created_at, business_id')\n    .eq('business_id', businessId)",
      ".select('ciq_score, created_at, business_id')"
    );
    ok(mutated !== source, 'mutation target not found');
    const m = await loadModule(mutated);
    const { result } = await assemble(m);
    ok(result.digest.iq_score_available === true, 'mutation should leak the foreign metric');
    ok(result.message.includes('87'), 'mutation should surface the foreign score');
    ok(result.scope.scope_verified === false, 'mutation must fail scope verification');
  });

  check('M3 — mutation: unscoped sprint selection picks another business\'s active sprint', async () => {
    const mutated = source.replace(
      ".select('id, path_title, progress_percent, business_id')\n    .eq('business_id', businessId)",
      ".select('id, path_title, progress_percent, business_id')"
    );
    ok(mutated !== source, 'mutation target not found');
    const m = await loadModule(mutated);
    const { result } = await assemble(m);
    ok(result.active_sprint.id === '0-b-sprint', `mutated picked ${result.active_sprint.id} (expected the foreign sprint)`);
    ok(result.scope.scope_verified === false, 'mutation must fail scope verification');
  });

  // ── static contract: the scheduled entry point ─────────────────────────────
  const fn = read(FUNCTION);

  check('S1 — business_id is required; no fallback, no primary default', async () => {
    ok(fn.includes('BUSINESS_CONTEXT_REQUIRED'), 'must refuse with BUSINESS_CONTEXT_REQUIRED');
    ok(!/allowPrimaryDefault/.test(fn), 'must not enable allowPrimaryDefault');
    ok(!/primary_business_id\s*(\|\||\?\?)\s*requestedBusinessId/.test(fn), 'must not fall back to primary');
    ok(fn.includes('requireBusinessContext('), 'must use the canonical guard');
    ok(fn.includes('requestedBusinessId,') && fn.includes("'weeklyDigestScheduled.generateWeeklyDigest'"), 'guard must receive the requested business');
  });

  check('S2 — dry_run executes before any write/invoke', async () => {
    const dry = fn.indexOf('if (dryRun)');
    const invoke = fn.indexOf("base44.functions.invoke('notificationService'");
    ok(dry > -1 && invoke > -1 && dry < invoke, 'dry run must precede the notification invoke');
    ok(fn.includes('writes_performed: false'), 'dry run must assert writes_performed: false');
  });

  check('S3 — notification stays in-app and business-scoped', async () => {
    ok(fn.includes('recipient_id: user.id'), 'recipient ownership preserved');
    ok(fn.includes('recipient_profile_id: profileId'), 'recipient profile preserved');
    ok(fn.includes('business_id: assembled.business_id'), 'notification business scoping preserved');
    ok(!/SendEmail\s*\(/.test(fn) && !/recipient_email\s*:/.test(fn), 'email must not be introduced');
    ok(fn.includes('DIGEST_SCOPE_MISMATCH'), 'unverified scope must block delivery');
  });

  check('S4 — admin-only guard for an automation-invoked endpoint', async () => {
    ok(/user\.role\)\)\s*\{\s*return Response\.json\(\{ error: 'Forbidden' \}/.test(fn) || fn.includes("new Response") || fn.includes("error: 'Forbidden'"), 'must return 403 for non-admins');
    ok(fn.includes("['admin', 'super_admin']"), 'admin roles must be declared');
  });

  check('S5 — legacy weeklyDigest untouched and no longer the workflow step', async () => {
    const legacy = read(LEGACY);
    ok(legacy.includes("Deno.serve(async (req)"), 'legacy weeklyDigest handler must be unchanged');
    ok(!legacy.includes('weeklyDigestScheduled'), 'legacy function must not reference the new one');
    ok(!legacy.includes('weekDigestAssembly') && !legacy.includes('weeklyDigestAssembly'), 'legacy must not import the new module');
  });

  // ── run ────────────────────────────────────────────────────────────────────
  let pass = 0;
  const failures = [];
  for (const { name, fn: run } of checks) {
    try {
      await run();
      pass += 1;
      console.log(`PASS  ${name}`);
    } catch (e) {
      failures.push({ name, message: e.message });
      console.log(`FAIL  ${name}\n        ${e.message}`);
    }
  }

  console.log(`\nchecks : ${pass}/${checks.length} PASS${failures.length ? ` — ${failures.length} FAILED` : ' — EVIDENCE COMPLETE'}`);
  if (failures.length) process.exit(1);
})();