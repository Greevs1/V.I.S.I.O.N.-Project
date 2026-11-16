#!/usr/bin/env node
/**
 * Phase B1.2 — Canonical-Fact Loader Scoping: INVESTIGATION HARNESS.
 *
 * READ-ONLY INVESTIGATION. No application source is modified: the harness
 * bundles the REAL canonical-fact modules (contextLoader, consumerAdapter,
 * resolver chain) with esbuild and runs them against an in-memory
 * PostgREST-shaped database. A PATCHED VARIANT is built from a temporary COPY
 * of the canonicalFact folder (minimal business_id filters applied to the
 * copy only) to evaluate the proposed minimal correction. The app files
 * themselves are never written.
 *
 * Scenarios (owner, advisor, business-switching, missing business):
 *   X-series — CURRENT behavior: proves or disproves cross-business exposure.
 *   P-series — PATCHED-COPY behavior: the minimal correction closes the gap.
 *   M-series — mutation probe: a reverted filter is caught by the harness.
 *
 *   node scripts/b12CanonicalFactScoping.test.cjs
 */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const TMP = path.join(__dirname, '.tmp', 'b12');
const SRC = path.join(ROOT, 'base44', 'shared', 'canonicalFact');

// ── In-memory PostgREST-shaped database ─────────────────────────────────────
function makeDb(fixtures) {
  const tables = new Map();
  for (const [name, rows] of Object.entries(fixtures || {})) tables.set(name, rows.map((r) => ({ ...r })));
  return { log: [], rows(name) { if (!tables.has(name)) tables.set(name, []); return tables.get(name); } };
}

function makeSb(db) {
  const mk = (table, alias) => {
    const st = { preds: [], sortCol: null, sortAsc: true, limitN: null, select: '*' };
    const b = {
      select(s) { st.select = s; return b; },
      schema() { return makeSb(db); },
      eq(c, v) { st.preds.push({ desc: [`${c} = ${JSON.stringify(v)}`], test: (r) => r[c] === v }); return b; },
      neq(c, v) { st.preds.push({ desc: [`${c} != ${JSON.stringify(v)}`], test: (r) => r[c] !== v }); return b; },
      in(c, vs) { st.preds.push({ desc: [`${c} in [${vs.join(',')}]`], test: (r) => vs.includes(r[c]) }); return b; },
      order(c, { ascending = true } = {}) { st.sortCol = c; st.sortAsc = ascending; return b; },
      limit(n) { st.limitN = n; return b; },
      maybeSingle() { return Promise.resolve(b).then((r) => ({ data: r.data?.[0] ?? null })); },
      single() { return Promise.resolve(b).then((r) => ({ data: r.data?.[0] ?? null })); },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          db.log.push({ table: alias || table, preds: st.preds.map((p) => p.desc.join(' & ')), select: st.select });
          let rows = db.rows(table).filter((r) => st.preds.every((p) => p.test(r)));
          if (st.sortCol) rows = [...rows].sort((x, y) => (x[st.sortCol] > y[st.sortCol] ? 1 : -1) * (st.sortAsc ? 1 : -1));
          if (st.limitN != null) rows = rows.slice(0, st.limitN);
          return { data: rows, error: null };
        }).then(resolve, reject);
      },
    };
    return b;
  };
  return { from: (t) => mk(t), schema: (s) => ({ from: (t) => mk(t, `${s}.${t}`) }) };
}

// ── Two-business fixture (multi-business owner + advisor) ──────────────────
function fixtures() {
  return {
    profiles: [
      { id: 'p-owner', first_name: 'Owner', app_role: 'user', primary_business_id: 'b-B' },
      { id: 'p-adv', first_name: 'Advisor', app_role: 'advisor', primary_business_id: 'b-adv' },
    ],
    business_entities: [
      { id: 'b-A', business_name: 'Business A', industry: 'retail' },
      { id: 'b-B', business_name: 'Business B', industry: 'construction' },
      { id: 'b-C', business_name: 'Business C', industry: 'hospitality' },
      { id: 'b-adv', business_name: "Advisor's Own", industry: 'consulting' },
    ],
    business_owners: [
      { business_id: 'b-A', profile_id: 'p-owner' },
      { business_id: 'b-B', profile_id: 'p-owner' },
    ],
    dashboard_metrics: [
      { id: 'dm-A', business_id: 'b-A', profile_id: 'p-owner', annual_revenue: 2000000, net_profit: 400000, current_ebitda: 600000, updated_at: '2026-10-01T00:00:00Z' },
      { id: 'dm-B', business_id: 'b-B', profile_id: 'p-owner', annual_revenue: 500000, net_profit: 50000, current_ebitda: 120000, updated_at: '2026-09-01T00:00:00Z' },
      { id: 'dm-adv', business_id: 'b-adv', profile_id: 'p-adv', annual_revenue: 999999, net_profit: 111111, current_ebitda: 222222, updated_at: '2026-10-15T00:00:00Z' },
    ],
    business_assessments: [
      { id: 'ba-A', business_id: 'b-A', profile_id: 'p-owner', assessment_type: 'profit_gap', answers: { p1_rev: 2100000, p1_profit: 420000 }, results: {}, updated_at: '2026-10-02T00:00:00Z' },
    ],
    gap_analyses: [
      { id: 'ga-A', business_id: 'b-A', profile_id: 'p-owner', assessment_type: 'profit_gap', gap_amount: 150000, severity: 'high', created_at: '2026-10-01T00:00:00Z' },
    ],
    profile_financials: [
      { id: 'pf-A', business_id: 'b-A', profile_id: 'p-owner', agi: 300000, monthly_take_home: 15000, updated_at: '2026-10-01T00:00:00Z' },
      { id: 'pf-B', business_id: 'b-B', profile_id: 'p-owner', agi: 90000, monthly_take_home: 8000, updated_at: '2026-09-01T00:00:00Z' },
    ],
    documents: [], extracted_fields: [], document_analysis: [],
    business_valuations: [], valuation_answers: [], valuation_financials: [], valuation_adjustments: [], valuation_versions: [],
    valuation_questions: [{ id: 'q-1', question_key: 'ttm_revenue' }],
  };
}

const A_VALUES = [2000000, 2100000, 400000, 600000, 150000, 300000, 15000];
const ADV_VALUES = [999999, 111111, 222222];

// ── Bundle builder: real source, or patched copy ────────────────────────────
function buildVariant({ patched = false, revertedFilter = null } = {}) {
  fs.rmSync(TMP, { recursive: true, force: true });
  const dir = path.join(TMP, 'cbil');
  fs.mkdirSync(dir, { recursive: true });
  if (patched || revertedFilter) {
    for (const f of fs.readdirSync(SRC)) fs.copyFileSync(path.join(SRC, f), path.join(dir, f));
    let loader = fs.readFileSync(path.join(SRC, 'contextLoader.ts'), 'utf8');
    // Minimal correction under evaluation (applied to the COPY only):
    // business-scope the four profile-wide reads, mirroring the canonical
    // pattern used by verificationQueueService (entry.ts L134–137).
    const from = loader.split(`.eq('profile_id', ownerProfileId)`).length - 1;
    loader = loader.split(`.eq('profile_id', ownerProfileId)`).join(`.eq('business_id', businessId)`);
    fs.writeFileSync(path.join(dir, 'contextLoader.ts'), loader);
    if (revertedFilter) {
      // Mutation probe: undo ONE business filter to prove the harness catches it.
      let mut = fs.readFileSync(path.join(dir, 'contextLoader.ts'), 'utf8');
      const anchor = `.from('${revertedFilter}')`;
      const i = mut.indexOf(anchor);
      const j = mut.indexOf(`.eq('business_id', businessId)`, i);
      mut = mut.slice(0, j) + mut.slice(j + `.eq('business_id', businessId)`.length);
      fs.writeFileSync(path.join(dir, 'contextLoader.ts'), mut);
    }
    // Relocate every ../valuationEngine value-import to the real engine.
    const VES = `'${path.join(SRC, '..', 'valuationEngine')}`;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.ts')) continue;
      let s = fs.readFileSync(path.join(dir, f), 'utf8');
      if (s.includes(`from '../valuationEngine/`)) {
        s = s.split(`from '../valuationEngine/`).join(`from ${VES}/`);
        fs.writeFileSync(path.join(dir, f), s);
      }
    }
  }
  const base = patched || revertedFilter ? dir : SRC;
  const name = revertedFilter ? 'entryMutated' : patched ? 'entryPatched' : 'entryCurrent';
  const entry = path.join(TMP, `${name}.ts`);
  fs.writeFileSync(entry, [
    `import { loadCanonicalFactsForConsumer } from ${JSON.stringify(path.join(base, 'consumerAdapter.ts'))};`,
    `import { loadIntelligenceContext } from ${JSON.stringify(path.join(base, 'contextLoader.ts'))};`,
    `import { PILOT_FACT_KEYS } from ${JSON.stringify(path.join(base, 'registry.ts'))};`,
    `export { loadCanonicalFactsForConsumer, loadIntelligenceContext, PILOT_FACT_KEYS };`,
  ].join('\n'));
  const out = entry.replace('.ts', '.cjs');
  esbuild.buildSync({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', outfile: out, logLevel: 'silent', external: ['npm:@base44/sdk@0.8.41'] });
  delete require.cache[require.resolve(out)];
  return { mod: require(out), db: null };
}

// ── Check plumbing ──────────────────────────────────────────────────────────
let pass = 0, fail = 0;
function check(id, label, ok, detail = '') {
  if (ok) { pass++; console.log(`  PASS ${id.padEnd(5)} ${label}`); }
  else { fail++; console.log(`  FAIL ${id.padEnd(5)} ${label}${detail ? ` — ${detail}` : ''}`); }
}

async function scenario(mod, ctx, businessId) {
  const db = makeDb(fixtures());
  const sb = makeSb(db);
  const c = { ...ctx, sb, vsb: sb.schema('valuation') };
  const adapter = await mod.loadCanonicalFactsForConsumer(c, businessId, {
    factKeys: mod.PILOT_FACT_KEYS, consumer: 'galileo', legacyValues: {},
  });
  return { adapter, db };
}

async function intel(mod, ctx, businessId) {
  const db = makeDb(fixtures());
  const sb = makeSb(db);
  const c = { ...ctx, sb, vsb: sb.schema('valuation') };
  const ctxOut = await mod.loadIntelligenceContext(c, businessId);
  return { ctxOut, db };
}

(async () => {
  const owner = { profileId: 'p-owner', profile: { id: 'p-owner', app_role: 'user', primary_business_id: 'b-B' }, user: null, isSuperAdmin: false };
  const advisor = { profileId: 'p-adv', profile: { id: 'p-adv', app_role: 'advisor', primary_business_id: 'b-adv' }, user: null, isSuperAdmin: false };

  const cur = buildVariant();
  console.log('\n── X-series — CURRENT behavior: does Business A data reach Business B? ──');
  {
    const { adapter } = await scenario(cur.mod, owner, 'b-B');
    const rev = adapter.facts.revenue;
    check('X1', 'EXPOSURE: Business B canonical revenue resolves to a Business A value (not Business B\u2019s 500,000)',
      rev?.value != null && A_VALUES.includes(rev.value), `got ${rev?.value} (${rev?.source_name})`);
    const { ctxOut } = await intel(cur.mod, owner, 'b-B');
    check('X2', 'EXPOSURE: Business B intel context holds Business A\u2019s dashboard row',
      ctxOut.dashboardMetrics?.id === 'dm-A', `got ${ctxOut.dashboardMetrics?.id}`);
    check('X3', 'EXPOSURE: Business B intel context holds Business A\u2019s assessment row',
      ctxOut.businessAssessments?.[0]?.id === 'ba-A', `got ${ctxOut.businessAssessments?.[0]?.id}`);
    check('X4', 'EXPOSURE: Business B intel context holds Business A\u2019s profile financials',
      ctxOut.profileFinancials?.id === 'pf-A', `got ${ctxOut.profileFinancials?.id}`);
    check('X5', 'EXPOSURE: Business B intel context holds Business A\u2019s gap analysis',
      ctxOut.gapAnalyses?.[0]?.id === 'ga-A', `got ${ctxOut.gapAnalyses?.[0]?.id}`);
    const { adapter: aA } = await scenario(cur.mod, owner, 'b-A');
    check('X6', 'EXPOSURE: switching businesses does not change the resolved revenue',
      aA.facts.revenue?.value === adapter.facts.revenue?.value);
  }
  {
    // Advisor acting on a business with NO business_owners row: ownerProfileId
    // falls back to the ACTING profile (contextLoader.ts L63).
    const { adapter } = await scenario(cur.mod, advisor, 'b-C');
    const rev = adapter.facts.revenue;
    check('X7', 'REVERSE EXPOSURE: advisor\u2019s own dashboard revenue surfaces as Business C\u2019s canonical fact',
      rev?.value === 999999, `got ${rev?.value} (${rev?.source_name})`);
  }
  {
    const { db } = await intel(cur.mod, owner, '');
    const dm = db.log.find((r) => r.table === 'dashboard_metrics');
    check('X8', 'NO GUARD: the loader accepts an empty businessId and still queries profile-wide',
      dm != null && !dm.preds.some((p) => p.includes('business_id')), JSON.stringify(dm?.preds));
  }

  const pat = buildVariant({ patched: true });
  console.log('\n── P-series — PATCHED COPY (minimal correction) behavior ──');
  {
    const { adapter } = await scenario(pat.mod, owner, 'b-B');
    const rev = adapter.facts.revenue;
    check('P1', 'PATCHED: Business B revenue resolves to its own row (500,000)',
      rev?.value === 500000, `got ${rev?.value}`);
    const vals = Object.values(adapter.facts).filter(Boolean).map((f) => f.value);
    check('P2', 'PATCHED: no Business A value appears in any Business B canonical fact',
      !vals.some((v) => A_VALUES.includes(v)), JSON.stringify(vals));
  }
  {
    const { ctxOut } = await intel(pat.mod, owner, 'b-B');
    check('P3', 'PATCHED: Business B intel context holds only Business B rows (dm-B / pf-B, no A assessments or gaps)',
      ctxOut.dashboardMetrics?.id === 'dm-B' && ctxOut.profileFinancials?.id === 'pf-B'
      && (ctxOut.businessAssessments || []).length === 0 && (ctxOut.gapAnalyses || []).length === 0,
      `dm=${ctxOut.dashboardMetrics?.id} pf=${ctxOut.profileFinancials?.id} ba=${ctxOut.businessAssessments?.length} ga=${ctxOut.gapAnalyses?.length}`);
  }
  {
    const { adapter } = await scenario(pat.mod, advisor, 'b-C');
    const rev = adapter.facts.revenue;
    const vals = Object.values(adapter.facts).filter(Boolean).map((f) => f.value);
    check('P4', 'PATCHED: advisor acting on an ownerless business gets honest-empty, never their own data',
      rev?.value == null && !vals.some((v) => ADV_VALUES.includes(v)), `revenue=${rev?.value} vals=${JSON.stringify(vals)}`);
  }
  {
    const { adapter: aA } = await scenario(pat.mod, owner, 'b-A');
    const { adapter: aB } = await scenario(pat.mod, owner, 'b-B');
    check('P5', 'PATCHED: business switching resolves each business\u2019s own value (A\u2019s own, B\u2019s own, never equal)',
      A_VALUES.includes(aA.facts.revenue?.value) && aB.facts.revenue?.value === 500000
      && aA.facts.revenue?.value !== aB.facts.revenue?.value,
      `A=${aA.facts.revenue?.value} B=${aB.facts.revenue?.value}`);
  }
  {
    const { db } = await intel(pat.mod, owner, 'b-B');
    const tables = ['dashboard_metrics', 'business_assessments', 'gap_analyses', 'profile_financials'];
    const allScoped = tables.every((t) => db.log.filter((r) => r.table === t).every((r) => r.preds.some((p) => p.includes('business_id'))));
    check('P6', 'PATCHED: every read of the four tables carries a business_id predicate', allScoped,
      JSON.stringify(db.log.filter((r) => tables.includes(r.table)).map((r) => `${r.table}: ${r.preds}`)));
  }

  console.log('\n── M-series — mutation probe: reverted filter must be caught ──');
  {
    const mut = buildVariant({ patched: true, revertedFilter: 'dashboard_metrics' });
    const { adapter } = await scenario(mut.mod, owner, 'b-B');
    const rev = adapter.facts.revenue;
    const caught = rev?.value != null && rev.value !== 500000;
    check('M1', 'a reverted dashboard_metrics filter reintroduces the leak (Business B resolves a foreign value) AND is detected by this harness',
      caught, `revenue=${rev?.value}`);
  }

  console.log(`\nchecks     : ${pass}/${pass + fail} PASS`);
  console.log('B1.2 INVESTIGATION HARNESS — ' + (fail === 0 ? 'EVIDENCE COMPLETE' : 'INCOMPLETE'));
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });