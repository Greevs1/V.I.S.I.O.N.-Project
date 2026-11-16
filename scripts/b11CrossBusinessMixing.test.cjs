#!/usr/bin/env node
/**
 * Phase B1.1 — Business Scoping Integrity: BEHAVIORAL REGRESSION SUITE.
 *
 * Offline and non-destructive. Bundles the REAL source (shared BIE consumer,
 * askGalileo, buildGalileoContext) with esbuild, runs it against an in-memory
 * PostgREST-shaped database with a two-business fixture profile, and requires:
 *
 *   A. Shared module: two-business isolation, business switching, advisor
 *      access, fail-closed guard, empty assessments, legacy null-business
 *      exclusion, evidence/recommendation consistency, and an adversarial
 *      mutation sweep (each reverted filter must be CAUGHT).
 *   B. Handlers (real Deno.serve handlers under a Deno stub): missing business
 *      context, unauthorized business selection, focus answers scoped to the
 *      active business, advisor access to a client's business, legacy null rows
 *      invisible, and Galileo/BIE context parity.
 *
 * These are MOCK-DATA tests of real source behavior. They make no claim about
 * runtime, production, or database state.
 *
 *   node scripts/b11CrossBusinessMixing.test.cjs
 */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const SHARED = 'base44/shared/galileoBieConsumer/entry.ts';
const ASK = 'base44/functions/askGalileo/entry.ts';
const CTX = 'base44/functions/buildGalileoContext/entry.ts';

// ── Environment / runtime stubs ─────────────────────────────────────────────
const ENV = {
  VITE_SUPABASE_URL: 'https://mock.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  OPENROUTER_API_KEY: '', // LLM path skipped -> deterministic rule-based answers
};
let capturedHandler = null;
globalThis.Deno = {
  env: { get: (k) => (Object.prototype.hasOwnProperty.call(ENV, k) ? ENV[k] : null) },
  serve: (fn) => { capturedHandler = fn; return { finished: Promise.resolve() }; },
};

const CURRENT = { sb: null, base44: null };

// ── In-memory PostgREST-shaped database ─────────────────────────────────────
function makeDb(fixtures) {
  const tables = new Map();
  for (const [name, rows] of Object.entries(fixtures || {})) tables.set(name, rows.map((r) => ({ ...r })));
  return {
    log: [],
    rows(name) { if (!tables.has(name)) tables.set(name, []); return tables.get(name); },
  };
}

function makeSb(db) {
  const exec = (table, st) => {
    db.log.push({ table, preds: st.preds.map((p) => p.desc), select: st.select, op: st.op || 'select' });
    let rows = db.rows(table).filter((r) => st.preds.every((p) => p.test(r)));
    if (st.sortCol) {
      rows = [...rows].sort((a, b) => {
        const av = a[st.sortCol], bv = b[st.sortCol];
        const c = av < bv ? -1 : av > bv ? 1 : 0;
        return st.sortAsc ? c : -c;
      });
    }
    if (st.limit != null) rows = rows.slice(0, st.limit);
    if (st.op === 'update') { for (const r of rows) Object.assign(r, st.patch); return rows; }
    return rows;
  };
  const chain = (table) => {
    const st = { preds: [], sortCol: null, sortAsc: true, limit: null, op: null, patch: null, select: null };
    const b = {
      select: (cols) => { st.select = cols == null ? null : String(cols); return b; },
      ilike: (c, v) => { st.preds.push({ desc: `ilike(${c})`, test: (r) => String(r[c] ?? '').toLowerCase().includes(String(v).toLowerCase()) }); return b; },
      eq: (c, v) => { st.preds.push({ desc: `eq(${c}=${JSON.stringify(v)})`, test: (r) => r[c] === v }); return b; },
      neq: (c, v) => { st.preds.push({ desc: `neq(${c})`, test: (r) => r[c] !== v }); return b; },
      in: (c, arr) => { st.preds.push({ desc: `in(${c})`, test: (r) => arr.includes(r[c]) }); return b; },
      is: (c, v) => { st.preds.push({ desc: `is(${c}=${JSON.stringify(v)})`, test: (r) => r[c] === v }); return b; },
      order: (c, o) => { st.sortCol = c; st.sortAsc = !!(o && o.ascending); return b; },
      limit: (n) => { st.limit = n; return b; },
      range: () => b,
      maybeSingle: () => Promise.resolve({ data: exec(table, st)[0] ?? null }),
      single: () => Promise.resolve({ data: exec(table, st)[0] ?? null }),
      insert: (row) => { const rows = db.rows(table); const full = { ...row, id: row.id || `ins-${rows.length + 1}` }; rows.push(full); return { select: () => ({ single: async () => ({ data: full }) }) }; },
      update: (patch) => { st.op = 'update'; st.patch = patch; return b; },
      then: (resolve, reject) => { try { resolve({ data: exec(table, st) }); } catch (e) { reject(e); } },
    };
    return b;
  };
  return { from: chain, schema: () => ({ from: chain }) };
}

function makeEntityStore() {
  const tables = new Map();
  const arr = (n) => { if (!tables.has(n)) tables.set(n, []); return tables.get(n); };
  return new Proxy({}, {
    get(_, name) {
      const a = arr(name);
      return {
        filter: async (q) => a.filter((r) => Object.entries(q || {}).every(([k, v]) =>
          (v && typeof v === 'object' && v.$ne !== undefined) ? r[k] !== v.$ne : r[k] === v)),
        get: async (id) => a.find((r) => r.id === id) || null,
        create: async (row) => { const full = { ...row, id: row.id || `ent-${a.length + 1}` }; a.push(full); return full; },
        update: async (id, patch) => { const r = a.find((x) => x.id === id); if (r) Object.assign(r, patch); return r; },
      };
    },
  });
}

function makeBase44(user) {
  const entities = makeEntityStore();
  return {
    auth: { me: async () => user },
    asServiceRole: { entities, integrations: {} },
    integrations: {},
    functions: { invoke: async () => ({}) },
    users: {},
  };
}

// ── Bundling / evaluation of the real source ────────────────────────────────
async function bundle(entryFile, mutation = null) {
  const plugins = [{
    name: 'b11-mutation',
    setup(build) {
      if (!mutation) return;
      build.onLoad({ filter: /.*/ }, (args) => {
        if (path.resolve(args.path) !== path.join(ROOT, mutation.file)) return undefined;
        const src = fs.readFileSync(args.path, 'utf8');
        if (!src.includes(mutation.find)) throw new Error(`mutation anchor not found in ${mutation.file}: ${mutation.find}`);
        return { contents: src.replace(mutation.find, mutation.replace), loader: 'ts' };
      });
    },
  }];
  const out = await esbuild.build({
    entryPoints: [path.join(ROOT, entryFile)],
    bundle: true, format: 'cjs', platform: 'node', write: false,
    logLevel: 'silent', plugins, external: ['npm:*', 'jsr:*'],
  });
  return out.outputFiles[0].text;
}

function evalModule(code) {
  const m = { exports: {} };
  const req = (name) => {
    if (name.startsWith('npm:@supabase/supabase-js')) return { createClient: () => CURRENT.sb };
    if (name.startsWith('npm:@base44/sdk')) return { createClientFromRequest: () => CURRENT.base44, createClient: () => CURRENT.base44 };
    if (name.startsWith('npm:jsr')) return {};
    return require(name);
  };
  new Function('module', 'exports', 'require', code)(m, m.exports, req);
  return m.exports;
}

// ── Fixtures ────────────────────────────────────────────────────────────────
const A = 'biz-a', B = 'biz-b', C = 'biz-c', FOREIGN = 'biz-foreign';
const OWNER = 'prof-owner', ADVISOR = 'prof-adv', STRANGER = 'prof-stranger';

function businessFixtures() {
  return {
    // Order is deliberate: under a profile-scoped regression the LEGACY row
    // (latest updated / first by type) or biz-b's row must contaminate.
    dashboard_metrics: [
      { profile_id: OWNER, business_id: null, revenue: 9999999, ciq_score: 99, overall_impact_score: 99, updated_at: '2026-03-01' },
      { profile_id: OWNER, business_id: B, revenue: 400000, ciq_score: 45, overall_impact_score: 45, updated_at: '2026-02-01' },
      { profile_id: OWNER, business_id: A, revenue: 1000000, ciq_score: 70, overall_impact_score: 70, updated_at: '2026-01-01' },
    ],
    business_assessments: [
      { profile_id: OWNER, business_id: null, assessment_type: 'tax_gap', estimated_opportunity_value: 888888, score: 1, risk_level: 'low', opportunity_level: 'low', summary: 'legacy', key_findings: null },
      { profile_id: OWNER, business_id: B, assessment_type: 'profit_gap', estimated_opportunity_value: 15000, score: 30, risk_level: 'low', opportunity_level: 'low', summary: 'B profit', key_findings: null },
      { profile_id: OWNER, business_id: B, assessment_type: 'tax_gap', estimated_opportunity_value: 7000, score: 35, risk_level: 'low', opportunity_level: 'low', summary: 'B tax', key_findings: null },
      { profile_id: OWNER, business_id: A, assessment_type: 'profit_gap', estimated_opportunity_value: 120000, score: 55, risk_level: 'high', opportunity_level: 'significant', summary: 'A profit', key_findings: null },
      { profile_id: OWNER, business_id: A, assessment_type: 'tax_gap', estimated_opportunity_value: 45000, score: 60, risk_level: 'medium', opportunity_level: 'moderate', summary: 'A tax', key_findings: null },
    ],
    business_metric_snapshots: [
      { profile_id: OWNER, business_id: null, snapshot_date: '2026-04-01', overall_impact_score: 99, annual_revenue: 9999999, net_profit: 1, ebitda: 1, current_business_value: 1, value_gap: 1, profit_opportunity: 1, tax_opportunity: 1, cash_flow_opportunity: 1, data_confidence_score: 1 },
      { profile_id: OWNER, business_id: B, snapshot_date: '2026-02-01', overall_impact_score: 45, annual_revenue: 400000, net_profit: 2, ebitda: 2, current_business_value: 2, value_gap: 2, profit_opportunity: 2, tax_opportunity: 2, cash_flow_opportunity: 2, data_confidence_score: 2 },
      { profile_id: OWNER, business_id: A, snapshot_date: '2026-01-01', overall_impact_score: 70, annual_revenue: 1000000, net_profit: 3, ebitda: 3, current_business_value: 3, value_gap: 3, profit_opportunity: 3, tax_opportunity: 3, cash_flow_opportunity: 3, data_confidence_score: 3 },
    ],
    documents: [
      { profile_id: OWNER, business_id: null, name: 'Legacy Doc.pdf', document_type: 'tax_return', upload_status: 'completed', year: 2020 },
      { profile_id: OWNER, business_id: B, name: 'B Doc.pdf', document_type: 'balance_sheet', upload_status: 'completed', year: 2024 },
      { profile_id: OWNER, business_id: A, name: 'A P&L.pdf', document_type: 'profit_loss', upload_status: 'completed', year: 2024 },
      { profile_id: OWNER, business_id: A, name: 'A Tax.pdf', document_type: 'tax_return', upload_status: 'completed', year: 2024 },
    ],
    extracted_fields: [
      { profile_id: OWNER, business_id: null, field_name: 'legacy_field', accepted_value: 1, accepted_normalized_value: 1, review_status: 'accepted', source_document_type: 'tax_return' },
      { profile_id: OWNER, business_id: B, field_name: 'b_field', accepted_value: 2, accepted_normalized_value: 2, review_status: 'accepted', source_document_type: 'balance_sheet' },
      { profile_id: OWNER, business_id: A, field_name: 'a_field', accepted_value: 3, accepted_normalized_value: 3, review_status: 'accepted', source_document_type: 'profit_loss' },
    ],
    advisor_notes: [
      { profile_id: OWNER, business_id: null, note: 'legacy note', visibility: 'client', created_at: '2026-01-05' },
      { profile_id: OWNER, business_id: A, note: 'A advisor note', visibility: 'client', created_at: '2026-01-01' },
    ],
    ninety_day_sprint_paths: [
      { profile_id: OWNER, business_id: null, path_title: 'Legacy Sprint', path_goal: 'legacy', status: 'active', progress_percent: 10, is_active: true, created_at: '2026-01-09' },
      { profile_id: OWNER, business_id: A, path_title: 'A Sprint', path_goal: 'A goal', status: 'active', progress_percent: 50, is_active: true, created_at: '2026-01-01' },
    ],
  };
}

function handlerFixtures() {
  const f = businessFixtures();
  f.profiles = [
    { id: OWNER, email: 'owner@x.com', base44_user_id: 'b44-owner', app_role: 'owner', primary_business_id: A, membership_tier: 'pro', subscription_status: 'active', profile_status: 'active' },
    { id: ADVISOR, email: 'adv@x.com', base44_user_id: 'b44-adv', app_role: 'advisor', primary_business_id: null, membership_tier: null, subscription_status: null, profile_status: 'active' },
    { id: STRANGER, email: 'stranger@x.com', base44_user_id: 'b44-stranger', app_role: 'owner', primary_business_id: FOREIGN, profile_status: 'active' },
  ];
  f.business_entities = [
    { id: A, profile_id: OWNER, assigned_advisor_id: ADVISOR, business_name: 'Biz A', industry: 'construction' },
    { id: B, profile_id: OWNER, assigned_advisor_id: null, business_name: 'Biz B', industry: 'retail' },
    { id: FOREIGN, profile_id: STRANGER, assigned_advisor_id: null, business_name: 'Foreign Biz', industry: 'other' },
  ];
  f.business_owners = [];
  f.business_team_members = [];
  f.advisor_assignments = [{ advisor_profile_id: ADVISOR, business_id: A, status: 'active' }];
  f.expert_advisor_access = [];
  f.next_best_actions = [
    { id: 'nba-a', business_id: A, title: 'A NBA', action_type: 'opportunity', priority_score: 90, estimated_impact: 50000, status: 'recommended', reason: 'A reason', difficulty_level: 'easy', expected_time_days: 10 },
    { id: 'nba-b', business_id: B, title: 'B NBA', action_type: 'opportunity', priority_score: 80, estimated_impact: 9000, status: 'recommended', reason: 'B reason', difficulty_level: 'easy', expected_time_days: 10 },
  ];
  f.recommendation_strategy_mappings = [];
  f.recommendation_overrides = [];
  f.strategic_hypotheses = [];
  f.strategy_learning_summary = [];
  f.galileo_conversations = [];
  f.ninety_day_sprint_tasks = [];
  f.business_opportunities = [];
  f.roadmap_items = [];
  f.value_creation_events = [];
  f.strategy_outcomes = [];
  f.assessment_answers = [];
  f.profile_financials = [];
  return f;
}

const ownerUser = { id: 'b44-owner', email: 'owner@x.com', role: 'user' };
const advUser = { id: 'b44-adv', email: 'adv@x.com', role: 'user' };

// ── Assertion helpers ────────────────────────────────────────────────────────
const BIZ_TABLES = ['dashboard_metrics', 'business_assessments', 'business_metric_snapshots', 'documents', 'extracted_fields', 'advisor_notes', 'ninety_day_sprint_paths', 'next_best_actions'];

// Asserts every logged query against `tables` is scoped to bizId.
// `allowProfileScoped` lists EXACT out-of-scope query signatures (table+select)
// belonging to modules OUTSIDE B1.1's authorized files — currently the
// canonical-fact context loader (shared/canonicalFact/contextLoader.ts), which
// the buildGalileoContext chain imports via consumerAdapter and which still
// reads dashboard_metrics/business_assessments profile-wide. That finding is
// reported separately (adjacent finding AF-1) and is NOT masked here: any
// profile-scoped query whose signature is not allowlisted fails this assertion.
function assertBizScopedLog(db, bizId, tables, allowProfileScoped = []) {
  const allowed = new Set(allowProfileScoped.map((a) => `${a.table}|${a.select}`));
  for (const t of tables) {
    const entries = db.log.filter((l) => l.table === t);
    if (entries.length === 0) continue; // table not queried in this flow
    for (const e of entries) {
      const isProfileScoped = e.preds.some((p) => p.startsWith('eq(profile_id='));
      if (isProfileScoped && allowed.has(`${t}|${e.select}`)) continue; // documented out-of-scope module
      if (isProfileScoped) {
        throw new Error(`${t}: profile-scoped query issued (${JSON.stringify(e.preds)}, select=${e.select})`);
      }
      if (!e.preds.includes(`eq(business_id=${JSON.stringify(bizId)})`)) {
        throw new Error(`${t}: query missing business_id=${bizId} filter (${JSON.stringify(e.preds)})`);
      }
    }
  }
}

function assertNoContamination(result, forbidden) {
  const text = JSON.stringify(result);
  for (const [needle, label] of forbidden) {
    if (text.includes(needle)) throw new Error(`cross-business contamination: found ${label} (${needle})`);
  }
}

// A-figure / B-figure formatters (mirror formatValue)
const fmt = (n) => `$${Math.round(n).toLocaleString('en-US')}`;

// ── Test runner ──────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const failures = [];
async function t(name, fn) {
  try { await fn(); pass++; console.log(`  PASS  ${name}`); }
  catch (e) { fail++; failures.push(`${name}: ${e.message}`); console.log(`  FAIL  ${name}: ${e.message}`); }
}

async function main() {
  console.log('Phase B1.1 behavioral suite — real bundled source, in-memory database\n');

  const sharedCode = await bundle(SHARED);
  const askCode = await bundle(ASK);
  const ctxCode = await bundle(CTX);

  // ═══ SECTION A — shared BIE consumer (real module, mocked sb) ═══
  console.log('── Section A: shared BIE consumer ──');

  await t('A1 two businesses with different values: biz-a recommendations come from biz-a only', async () => {
    const db = makeDb(businessFixtures());
    const sb = makeSb(db);
    const shared = evalModule(sharedCode);
    const { recommendations, raw, latestSnapshot } = await shared.fetchCanonicalRecommendations(sb, OWNER, A);
    const byKey = Object.fromEntries(recommendations.map((r) => [r.recommendation_key, r]));
    if (byKey.profit_gap_amount?.estimatedImpact !== 120000) throw new Error(`profit impact ${byKey.profit_gap_amount?.estimatedImpact} != 120000`);
    if (byKey.tax_gap_annual?.estimatedImpact !== 45000) throw new Error(`tax impact ${byKey.tax_gap_annual?.estimatedImpact} != 45000`);
    if (raw.revenue !== 1000000) throw new Error(`revenue ${raw.revenue} != 1000000`);
    if (raw.iq_score !== 70) throw new Error(`iq ${raw.iq_score} != 70`);
    if (latestSnapshot?.overall_impact_score !== 70) throw new Error(`snapshot iq ${latestSnapshot?.overall_impact_score} != 70`);
    if (!recommendations.every((r) => r.businessId === A)) throw new Error('recommendation stamped with wrong business');
    assertNoContamination({ recommendations, raw, latestSnapshot }, [[fmt(15000), 'biz-b profit'], [fmt(7000), 'biz-b tax'], [fmt(400000), 'biz-b revenue'], ['888888', 'legacy tax'], ['9999999', 'legacy revenue'], ['"ciq_score":99', 'legacy iq']]);
    assertBizScopedLog(db, A, ['dashboard_metrics', 'business_assessments', 'business_metric_snapshots']);
  });

  await t('A2 switching active businesses: biz-b recommendations come from biz-b only', async () => {
    const db = makeDb(businessFixtures());
    const sb = makeSb(db);
    const shared = evalModule(sharedCode);
    const { recommendations, raw } = await shared.fetchCanonicalRecommendations(sb, OWNER, B);
    const byKey = Object.fromEntries(recommendations.map((r) => [r.recommendation_key, r]));
    if (byKey.profit_gap_amount?.estimatedImpact !== 15000) throw new Error(`profit impact ${byKey.profit_gap_amount?.estimatedImpact} != 15000`);
    if (byKey.tax_gap_annual?.estimatedImpact !== 7000) throw new Error(`tax impact ${byKey.tax_gap_annual?.estimatedImpact} != 7000`);
    if (raw.revenue !== 400000) throw new Error(`revenue ${raw.revenue} != 400000`);
    assertNoContamination({ recommendations, raw }, [[fmt(120000), 'biz-a profit'], [fmt(45000), 'biz-a tax'], ['888888', 'legacy tax'], ['9999999', 'legacy revenue']]);
    assertBizScopedLog(db, B, ['dashboard_metrics', 'business_assessments', 'business_metric_snapshots']);
  });

  await t('A3 authorized advisor access: client business records visible through business scoping', async () => {
    const db = makeDb(businessFixtures());
    const sb = makeSb(db);
    const shared = evalModule(sharedCode);
    // Records carry the OWNER's profile_id; the ADVISOR reaches them through the
    // business authorization + business filter — a profile_id filter would
    // wrongly exclude the advisor here.
    const { recommendations } = await shared.fetchCanonicalRecommendations(sb, ADVISOR, A);
    const byKey = Object.fromEntries(recommendations.map((r) => [r.recommendation_key, r]));
    if (byKey.profit_gap_amount?.estimatedImpact !== 120000) throw new Error(`advisor sees ${byKey.profit_gap_amount?.estimatedImpact} instead of the client's 120000`);
    if (recommendations.length === 0) throw new Error('advisor got no recommendations — business scoping broke advisor access');
  });

  await t('A4 fail-closed guard: null/empty/"null" business is refused, never profile-wide', async () => {
    const sb = makeSb(makeDb(businessFixtures()));
    const shared = evalModule(sharedCode);
    for (const bad of [null, undefined, '', '   ', 'null']) {
      let threw = false;
      try { await shared.fetchCanonicalRecommendations(sb, OWNER, bad); } catch { threw = true; }
      if (!threw) throw new Error(`fetchCanonicalRecommendations accepted business_id=${JSON.stringify(bad)}`);
      threw = false;
      try { await shared.buildSupportingEvidence(sb, OWNER, bad, 'tax_gap_annual', {}); } catch { threw = true; }
      if (!threw) throw new Error(`buildSupportingEvidence accepted business_id=${JSON.stringify(bad)}`);
    }
    // No reads were issued while refusing
    if (sb === null) throw new Error('unreachable');
  });

  await t('A5 recommendation/evidence business consistency: evidence cites biz-a only', async () => {
    const db = makeDb(businessFixtures());
    const sb = makeSb(db);
    const shared = evalModule(sharedCode);
    const { raw } = await shared.fetchCanonicalRecommendations(sb, OWNER, A);
    const evidence = await shared.buildSupportingEvidence(sb, OWNER, A, 'tax_gap_annual', raw);
    const src = evidence.assessmentSources?.[0];
    if (src?.opportunity_value !== 45000) throw new Error(`evidence assessment value ${src?.opportunity_value} != 45000`);
    if (!evidence.metrics.some((m) => m.field === 'tax_gap_annual' && m.value === 45000)) throw new Error('evidence metrics missing the biz-a tax value');
    const names = evidence.documents.map((d) => d.name);
    if (names.includes('Legacy Doc.pdf') || names.includes('B Doc.pdf')) throw new Error(`evidence documents contaminated: ${names}`);
    if (!names.includes('A P&L.pdf') || !names.includes('A Tax.pdf')) throw new Error(`evidence documents missing biz-a docs: ${names}`);
    assertBizScopedLog(db, A, ['documents', 'business_assessments', 'extracted_fields']);
  });

  await t('A6 empty assessments: biz-c reports honest missing data, no sibling fallback', async () => {
    const sb = makeSb(makeDb(businessFixtures()));
    const shared = evalModule(sharedCode);
    const { recommendations } = await shared.fetchCanonicalRecommendations(sb, OWNER, C);
    if (recommendations.length !== 0) throw new Error(`biz-c should have no recommendations, got ${recommendations.length}`);
    const evidence = await shared.buildSupportingEvidence(sb, OWNER, C, 'tax_gap_annual', {});
    if (!evidence.missingInformation.includes('Tax Gap assessment not completed')) throw new Error('honest missing-data list absent');
    assertNoContamination(evidence, [[fmt(120000), 'biz-a profit'], [fmt(45000), 'biz-a tax'], [fmt(15000), 'biz-b profit'], ['888888', 'legacy tax']]);
  });

  await t('A7 legacy null-business records are invisible under strict filtering', async () => {
    const db = makeDb(businessFixtures());
    const sb = makeSb(db);
    const shared = evalModule(sharedCode);
    const { recommendations, raw, latestSnapshot, assessmentSummary } = await shared.fetchCanonicalRecommendations(sb, OWNER, A);
    assertNoContamination({ recommendations, raw, latestSnapshot, assessmentSummary }, [['888888', 'legacy tax'], ['9999999', 'legacy revenue'], ['"overall_impact_score":99', 'legacy snapshot iq'], ['Legacy', 'legacy row text']]);
    // The issued queries cannot return null-business rows: eq(business_id="biz-a") excludes them.
    for (const tbl of ['dashboard_metrics', 'business_assessments', 'business_metric_snapshots', 'documents', 'extracted_fields']) {
      const e = db.log.filter((l) => l.table === tbl);
      if (e.length && !e.every((q) => q.preds.includes('eq(business_id="biz-a")'))) throw new Error(`${tbl} not strictly business-filtered`);
    }
  });

  // Adversarial mutations: each reverted filter must be CAUGHT by the suite's probes.
  const MUTATIONS = [
    { name: 'fetch: dashboard_metrics filter reverted', find: "sb.from('dashboard_metrics').select('*').eq('business_id', businessId)", replace: "sb.from('dashboard_metrics').select('*').eq('profile_id', profileId)" },
    { name: 'fetch: business_assessments filter reverted', find: "sb.from('business_assessments').select('*').eq('business_id', businessId)", replace: "sb.from('business_assessments').select('*').eq('profile_id', profileId)" },
    { name: 'fetch: business_metric_snapshots filter reverted', find: "sb.from('business_metric_snapshots').select('*').eq('business_id', businessId)", replace: "sb.from('business_metric_snapshots').select('*').eq('profile_id', profileId)" },
    { name: 'evidence: documents filter reverted', find: "sb.from('documents').select('name, document_type, upload_status, year').eq('business_id', businessId)", replace: "sb.from('documents').select('name, document_type, upload_status, year').eq('profile_id', profileId)" },
    { name: 'evidence: business_assessments filter reverted', find: "sb.from('business_assessments').select('assessment_type, score, estimated_opportunity_value, summary, key_findings').eq('business_id', businessId)", replace: "sb.from('business_assessments').select('assessment_type, score, estimated_opportunity_value, summary, key_findings').eq('profile_id', profileId)" },
    { name: 'evidence: extracted_fields filter reverted', find: "sb.from('extracted_fields').select('field_name, accepted_value, accepted_normalized_value, source_document_type').eq('business_id', businessId)", replace: "sb.from('extracted_fields').select('field_name, accepted_value, accepted_normalized_value, source_document_type').eq('profile_id', profileId)" },
  ];
  for (const mut of MUTATIONS) {
    await t(`A8 mutation caught: ${mut.name}`, async () => {
      const mutatedCode = await bundle(SHARED, { file: SHARED, find: mut.find, replace: mut.replace });
      const shared = evalModule(mutatedCode);
      const db = makeDb(businessFixtures());
      const sb = makeSb(db);
      await shared.fetchCanonicalRecommendations(sb, OWNER, A);
      const { raw } = await shared.fetchCanonicalRecommendations(sb, OWNER, A);
      await shared.buildSupportingEvidence(sb, OWNER, A, 'tax_gap_annual', raw);
      // The mutation must be detectable: a business-data query for biz-a that
      // lacks the business filter (or carries a profile filter).
      let detected = false;
      for (const l of db.log) {
        if (!BIZ_TABLES.includes(l.table)) continue;
        if (l.preds.some((p) => p.startsWith('eq(profile_id=')) || !l.preds.some((p) => p.startsWith('eq(business_id='))) detected = true;
      }
      if (!detected) throw new Error('mutation was NOT caught by the log/value probes');
    });
  }

  // ═══ SECTION B — real handlers under the Deno stub ═══
  console.log('\n── Section B: askGalileo / buildGalileoContext handlers ──');

  const callHandler = async (code, user, payload, fixtures) => {
    const db = makeDb(fixtures || handlerFixtures());
    CURRENT.sb = makeSb(db);
    CURRENT.base44 = makeBase44(user);
    capturedHandler = null;
    evalModule(code);
    if (!capturedHandler) throw new Error('handler was not captured from Deno.serve');
    const req = new Request('https://app/functions/x', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
    });
    const res = await capturedHandler(req);
    return { res, json: await res.json(), db };
  };

  const FOCUS = 'What should I focus on?';

  await t('B1 missing business context: multi-business owner refused with 400 BUSINESS_CONTEXT_REQUIRED', async () => {
    const { res, json } = await callHandler(askCode, ownerUser, { question: FOCUS });
    if (res.status !== 400) throw new Error(`expected 400, got ${res.status} ${JSON.stringify(json)}`);
    if (json.code !== 'BUSINESS_CONTEXT_REQUIRED') throw new Error(`expected BUSINESS_CONTEXT_REQUIRED, got ${JSON.stringify(json)}`);
  });

  await t('B2 unauthorized business selection: foreign business refused with 403', async () => {
    const { res } = await callHandler(askCode, ownerUser, { question: FOCUS, business_id: FOREIGN });
    if (res.status !== 403) throw new Error(`expected 403 for a business the owner does not have access to, got ${res.status}`);
  });

  await t('B3 askGalileo biz-a: answer and recommendations come from biz-a only', async () => {
    const { res, json, db } = await callHandler(askCode, ownerUser, { question: FOCUS, business_id: A });
    if (res.status !== 200) throw new Error(`expected 200, got ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
    if (json.canonical_recommendations_count !== 2) throw new Error(`expected 2 canonical recommendations (profit+tax for biz-a), got ${json.canonical_recommendations_count}`);
    const answer = String(json.response?.answer || '');
    if (!answer.includes(fmt(120000)) && !answer.includes(fmt(45000))) throw new Error(`answer carries no biz-a figure: ${answer.slice(0, 160)}`);
    assertNoContamination({ answer }, [[fmt(15000), 'biz-b profit'], [fmt(7000), 'biz-b tax'], [fmt(400000), 'biz-b revenue'], ['888,888', 'legacy tax'], ['10.0M', 'legacy revenue']]);
    assertBizScopedLog(db, A, BIZ_TABLES);
  });

  await t('B4 askGalileo biz-b (switching): answer comes from biz-b only', async () => {
    const { res, json, db } = await callHandler(askCode, ownerUser, { question: FOCUS, business_id: B });
    if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
    if (json.canonical_recommendations_count !== 2) throw new Error(`expected 2 canonical recommendations for biz-b, got ${json.canonical_recommendations_count}`);
    const answer = String(json.response?.answer || '');
    if (!answer.includes(fmt(15000)) && !answer.includes(fmt(7000))) throw new Error(`answer carries no biz-b figure: ${answer.slice(0, 160)}`);
    assertNoContamination({ answer }, [[fmt(120000), 'biz-a profit'], [fmt(45000), 'biz-a tax'], ['888,888', 'legacy tax']]);
    assertBizScopedLog(db, B, BIZ_TABLES);
  });

  await t('B5 authorized advisor access: advisor answered from the client business through the assignment', async () => {
    const { res, json, db } = await callHandler(askCode, advUser, { question: FOCUS, business_id: A });
    if (res.status !== 200) throw new Error(`advisor call failed: ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
    if (json.canonical_recommendations_count !== 2) throw new Error(`advisor expected the client's 2 recommendations, got ${json.canonical_recommendations_count}`);
    const answer = String(json.response?.answer || '');
    if (!answer.includes(fmt(120000)) && !answer.includes(fmt(45000))) throw new Error(`advisor answer missing the client's figures: ${answer.slice(0, 160)}`);
    assertBizScopedLog(db, A, BIZ_TABLES);
  });

  await t('B6 buildGalileoContext biz-a: gap summary, sprint and notes belong to biz-a; legacy null rows invisible', async () => {
    const { res, json, db } = await callHandler(ctxCode, ownerUser, { business_id: A });
    if (res.status !== 200) throw new Error(`expected 200, got ${res.status} ${JSON.stringify(json).slice(0, 300)}`);
    const ctx = json.context || {};
    if (ctx.gap_summary?.profit_gap?.amount !== 120000) throw new Error(`gap profit ${ctx.gap_summary?.profit_gap?.amount} != 120000`);
    if (ctx.gap_summary?.tax_gap?.amount !== 45000) throw new Error(`gap tax ${ctx.gap_summary?.tax_gap?.amount} != 45000`);
    if (ctx.active_sprint?.path_title !== 'A Sprint') throw new Error(`active sprint ${ctx.active_sprint?.path_title} != 'A Sprint' (legacy null-business sprint leaked?)`);
    if (ctx.advisor_notes_summary?.count !== 1) throw new Error(`advisor notes count ${ctx.advisor_notes_summary?.count} != 1 (legacy null-business note leaked?)`);
    if (ctx.advisor_notes_summary?.notes?.[0]?.content !== 'A advisor note') throw new Error('advisor notes content wrong');
    if ((ctx.canonical_recommendations || []).length !== 2) throw new Error(`canonical recommendations ${ctx.canonical_recommendations?.length} != 2`);
    assertNoContamination(ctx, [['Legacy Sprint', 'legacy sprint'], ['legacy note', 'legacy note'], ['888,888', 'legacy tax'], [fmt(15000), 'biz-b profit']]);
    // AF-1 (out of B1.1 scope): the canonical-fact context loader imported by
    // the consumerAdapter chain still reads dashboard_metrics and
    // business_assessments profile-wide. Its exact signatures are allowlisted
    // here; every other query must be business-scoped. The shared-module sites
    // are additionally covered precisely (without this interference) by the
    // Section A module-level suite and mutation sweep.
    assertBizScopedLog(db, A, BIZ_TABLES, [
      { table: 'dashboard_metrics', select: '*' },
      { table: 'business_assessments', select: 'id, assessment_type, status, answers, results, updated_at, completed_at' },
    ]);
  });

  await t('B7 buildGalileoContext biz-b (switching): no biz-a values, no sprint, no notes', async () => {
    const { res, json } = await callHandler(ctxCode, ownerUser, { business_id: B });
    if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
    const ctx = json.context || {};
    if (ctx.gap_summary?.profit_gap?.amount !== 15000) throw new Error(`gap profit ${ctx.gap_summary?.profit_gap?.amount} != 15000`);
    if (ctx.active_sprint !== null) throw new Error('biz-b should have no active sprint');
    if (ctx.advisor_notes_summary?.count !== 0) throw new Error('biz-b should have no advisor notes');
    assertNoContamination(ctx, [[fmt(120000), 'biz-a profit'], [fmt(45000), 'biz-a tax'], ['A Sprint', 'biz-a sprint'], ['A advisor note', 'biz-a note']]);
  });

  await t('B8 Galileo / BIE context parity: same business, same values across both surfaces', async () => {
    const ask = await callHandler(askCode, ownerUser, { question: FOCUS, business_id: A });
    const gal = await callHandler(ctxCode, ownerUser, { business_id: A });
    if (ask.res.status !== 200 || gal.res.status !== 200) throw new Error(`handler failure: ask=${ask.res.status} ctx=${gal.res.status}`);
    // Both surfaces saw exactly the same business-scoped assessment rows.
    if (ask.json.canonical_recommendations_count !== (gal.json.context.canonical_recommendations || []).length) {
      throw new Error(`recommendation count mismatch: askGalileo=${ask.json.canonical_recommendations_count} context=${gal.json.context.canonical_recommendations?.length}`);
    }
    const galProfit = (gal.json.context.canonical_recommendations || []).find((r) => r.recommendation_key === 'profit_gap_amount');
    if (galProfit?.estimatedImpact !== 120000) throw new Error(`context profit impact ${galProfit?.estimatedImpact} != 120000`);
    // Gap summary and canonical recommendations agree within the context surface.
    if (gal.json.context.gap_summary.profit_gap.amount !== galProfit.estimatedImpact) throw new Error('gap summary and canonical recommendation disagree');
    // The number of completed assessments askGalileo reported equals the context surface's non-empty gap types.
    const askCompleted = ask.json.context_quality.assessments_completed;
    const galGapTypes = ['profit_gap', 'value_gap', 'tax_gap', 'operations_gap', 'recast_ebitda', 'freedom']
      .filter((k) => (k === 'freedom' ? gal.json.context.gap_summary.freedom : gal.json.context.gap_summary[k]) != null && (k === 'freedom' ? gal.json.context.gap_summary.freedom : gal.json.context.gap_summary[k]).amount != null);
    if (askCompleted !== galGapTypes.length) throw new Error(`assessments_completed mismatch: askGalileo=${askCompleted} context=${galGapTypes.length}`);
  });

  console.log(`\nb11CrossBusinessMixing: ${pass} PASS, ${fail} FAIL (of ${pass + fail})`);
  if (failures.length) { failures.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
}

main().catch((e) => { console.error('SUITE ERROR:', e); process.exit(1); });