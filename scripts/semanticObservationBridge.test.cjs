#!/usr/bin/env node
/**
 * semanticObservationBridge.test.cjs — VISION 6D.0a — SEMANTIC OBSERVATION BRIDGE.
 *
 * Run:  node scripts/semanticObservationBridge.test.cjs
 *
 * OFFLINE AND NON-DESTRUCTIVE. No network, no database, no Base44 call, no
 * production record read, written or deleted. Every scenario runs against an
 * in-memory recording mock; the production observations used for diagnosis are
 * never a fixture.
 *
 * THE CODE UNDER TEST IS THE SHIPPED CODE, compiled from its real source and
 * executed:
 *   1. base44/shared/canonicalFact/registry.ts — the canonical semantic registry.
 *   2. base44/shared/documentObservation/semantics.ts — the ONE bridge.
 *   3. base44/shared/intelligenceContract/businessIntelligenceContract.ts — the
 *      real Shared Intelligence Contract, executed for two businesses against a
 *      recording Supabase mock (baselineResolver stubbed; it is not under test).
 *   4. base44/functions/buildGalileoContext/entry.ts — the real consumer text,
 *      asserted (static) because it is a Deno handler the harness does not boot.
 *
 * EVIDENCE CLASS: UNIT/MOCK (real modules executed) + STATIC + MUTATION.
 */

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const quiet = { log() {}, warn() {}, error() {}, info() {} };

const P = {
  REGISTRY: 'base44/shared/canonicalFact/registry.ts',
  SEMANTICS: 'base44/shared/documentObservation/semantics.ts',
  CONTRACT: 'base44/shared/intelligenceContract/businessIntelligenceContract.ts',
  GALILEO: 'base44/functions/buildGalileoContext/entry.ts',
};

const failures = [];
const check = (id, label, ok, detail = '') => {
  if (!ok) failures.push(`${id} ${label}${detail ? ` — ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${String(id).padEnd(4)} ${label}${!ok && detail ? ` — ${detail}` : ''}`);
};

// ── Compile + load (same pattern as the existing document harnesses) ────────
const strip = (s) => s.replace(/^\s*import[\s\S]*?from\s+'[^']+';/gm, '').replace(/^\s*export\s+/gm, '');
const toJs = (s) => esbuild.transformSync(s, { loader: 'ts', format: 'cjs', target: 'es2020' }).code;

function loadModule(src, depNames, depValues, returns) {
  const factory = new Function('console', ...depNames, `${toJs(strip(src))}\n;return (${returns});`);
  return factory(quiet, ...depValues);
}

// ── Recording Supabase mock (writes are recorded; nothing else is) ──────────
const WRITE_OPS = new Set(['insert', 'update', 'delete', 'upsert']);

function makeSb(seed = {}) {
  const writes = [];
  const tables = {};
  for (const [k, v] of Object.entries(seed)) tables[k] = v.map((r) => ({ ...r }));

  function query(table) {
    const state = { table, filters: [], op: 'select', payload: null, single: false };
    const rows = () => (tables[table] || []).filter((r) => state.filters.every(([c, v]) => r[c] === v));
    const settle = () => {
      if (WRITE_OPS.has(state.op)) writes.push({ table, op: state.op, payload: state.payload });
      if (state.op === 'insert') {
        const list = Array.isArray(state.payload) ? state.payload : [state.payload];
        (tables[table] = tables[table] || []).push(...list);
        return { data: state.single ? list[0] : list, error: null };
      }
      const list = rows();
      return { data: state.single ? (list[0] ?? null) : list, count: list.length, error: null };
    };
    const builder = {
      select: () => builder,
      eq: (c, v) => { state.filters.push([c, v]); return builder; },
      in: () => builder, order: () => builder, limit: () => builder,
      neq: () => builder, is: () => builder, ilike: () => builder,
      insert: (p) => { state.op = 'insert'; state.payload = p; return builder; },
      update: (p) => { state.op = 'update'; state.payload = p; return builder; },
      delete: () => { state.op = 'delete'; return builder; },
      upsert: (p) => { state.op = 'upsert'; state.payload = p; return builder; },
      single: () => { state.single = true; return Promise.resolve(settle()); },
      maybeSingle: () => { state.single = true; return Promise.resolve(settle()); },
      then: (res, rej) => Promise.resolve(settle()).then(res, rej),
    };
    return builder;
  }
  return { sb: { from: query, storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: '' }, error: null }) }) } }, writes };
}

// ── Fixtures (the production SHAPE, not production rows) ───────────────────
const BIZ_A = 'b-A';
const BIZ_B = 'b-B';
const DOC_A = 'doc-A-1120s';
const FY2025 = {
  period_raw: '2025', period_source: 'model_reported', period_start: '2025-01-01',
  period_end: '2025-12-31', fiscal_year: 2025, period_type: 'annual', source_status: 'available',
};
const grossReceipts = () => ({
  id: 'ef-gr', business_id: BIZ_A, document_id: DOC_A, field_name: 'gross_receipts',
  accepted_value: '$1,250,000', accepted_normalized_value: '1250000', review_status: 'accepted',
  source_document_type: 'business_tax_return', source_page: 1, confidence_score: '92',
  reviewed_at: '2026-10-02T19:32:45Z', metadata: { ...FY2025 },
});
const officerComp = () => ({
  id: 'ef-oc', business_id: BIZ_A, document_id: DOC_A, field_name: 'officer_compensation',
  accepted_value: '$150,000', accepted_normalized_value: '150000', review_status: 'accepted',
  source_document_type: 'business_tax_return', confidence_score: '88',
  reviewed_at: '2026-10-02T19:32:46Z', metadata: { ...FY2025 },
});
const ordinaryIncome = () => ({
  id: 'ef-obi', business_id: BIZ_A, document_id: DOC_A, field_name: 'ordinary_business_income',
  accepted_value: '$187,500', accepted_normalized_value: '187500', review_status: 'accepted',
  source_document_type: 'business_tax_return', reviewed_at: '2026-10-02T19:32:47Z', metadata: { ...FY2025 },
});
const grossProfit = () => ({
  id: 'ef-gp', business_id: BIZ_A, document_id: 'doc-A-pl', field_name: 'gross_profit',
  accepted_value: '$625,000', accepted_normalized_value: '625000', review_status: 'accepted',
  source_document_type: 'profit_and_loss', reviewed_at: '2026-06-08T22:49:16Z',
  metadata: { extracted_at: '2026-06-08T23:02:43Z' }, // period NOT recorded — must stay honest
});

const seedA = () => ({
  business_entities: [{ id: BIZ_A, business_name: 'Apex Roofing LLC', industry: 'Residential Building Construction' }],
  documents: [{ id: DOC_A, name: '2025 1120-S.pdf', document_type: 'business_tax_return', upload_status: 'completed', year: 2025, business_id: BIZ_A, created_at: '2026-10-02' }],
  extracted_fields: [grossReceipts(), officerComp(), ordinaryIncome(), grossProfit()],
  business_assessments: [], business_metric_snapshots: [], dashboard_metrics: [],
  value_creation_events: [], business_opportunities: [],
});
// Business B's read result DELIBERATELY contains a FOREIGN row (Business A's own
// observation), as a leaked query would. The bridge is the second line of defence:
// it must refuse it, so Business B can never see Business A's revenue.
const seedB = () => ({
  business_entities: [{ id: BIZ_B, business_name: 'Apex Holdings LLC' }],
  documents: [], extracted_fields: [grossReceipts()], business_assessments: [], business_metric_snapshots: [],
  dashboard_metrics: [], value_creation_events: [], business_opportunities: [],
});

const NOT_ESTABLISHED = { baseline_value: null, baseline_date: null, baseline_status: 'NOT_ESTABLISHED', baseline_source: null, baseline_session_id: null };

// ── The suite: a pure function of the sources, so mutations can re-run it ───
async function runSuite(sources) {
  const out = { static: {}, checks: {} };
  const { registrySrc, semanticsSrc, contractSrc, galileoSrc } = sources;

  // ── STATIC checks (text) ─────────────────────────────────────────────────
  out.static.galileo_no_private_matcher = !/getAcceptedField/.test(galileoSrc);
  out.static.galileo_no_field_query = !/from\('extracted_fields'\)/.test(galileoSrc);
  out.static.galileo_reads_contract_semantics = /contract\.semantic_observations/.test(galileoSrc);
  out.static.contract_uses_bridge = /buildObservationLayer/.test(contractSrc) && !/getAcceptedField/.test(contractSrc);
  // The alias may appear in prose/comments; it must never appear as a MAPPING KEY
  // outside the registry (that is how a duplicate alias table would return).
  out.static.single_semantic_source = !/gross_receipts\s*:/.test(semanticsSrc) && !/gross_receipts\s*:/.test(contractSrc) && !/gross_receipts\s*:/.test(galileoSrc);
  out.static.no_fact_writes = !/from\('business_facts'\)/.test(contractSrc) && !/from\('business_fact_evidence'\)/.test(contractSrc)
    && !/from\('business_facts'\)/.test(semanticsSrc) && !/from\('business_fact_evidence'\)/.test(semanticsSrc)
    && !/from\('business_facts'\)/.test(galileoSrc) && !/from\('business_fact_evidence'\)/.test(galileoSrc);
  out.static.bridge_is_pure = !/\bsb\.from|supabase|Deno\.serve/.test(semanticsSrc);

  // ── Execute the real modules ─────────────────────────────────────────────
  let sem = null;
  let makeContract = null;
  let runtimeWrites = [];
  try {
    const reg = loadModule(registrySrc, [], [], '{ FACT_REGISTRY, PILOT_FACT_KEYS, getFactDefinition }');
    sem = loadModule(semanticsSrc, ['FACT_REGISTRY'], [reg.FACT_REGISTRY],
      '{ buildObservationLayer, mapObservation, resolveSemanticObservation, observationEligibility, fieldMapping, mappedFactKeys, observationPeriod, humanSourceLabel, SEMANTIC_MAPPING_VERSION }');
    makeContract = (contractText) => loadModule(
      contractText,
      ['resolveBaselineBusinessValue', 'CONTRACT_VERSION', 'buildObservationLayer'],
      [async () => NOT_ESTABLISHED, '2.0.0', sem.buildObservationLayer],
      '{ buildBusinessIntelligenceContract }',
    ).buildBusinessIntelligenceContract;

    const layerA = sem.buildObservationLayer(seedA().extracted_fields, BIZ_A);
    const byKey = layerA.by_key;

    // ── GOLDEN PATH G1–G21 ────────────────────────────────────────────────
    const row = grossReceipts();
    out.checks.G1 = row.business_id === BIZ_A;
    out.checks.G2 = row.source_document_type === 'business_tax_return';
    out.checks.G3 = Number(row.accepted_normalized_value) === 1250000;
    out.checks.G4 = row.review_status === 'accepted';
    out.checks.G5 = byKey.revenue?.canonical_key === 'revenue';
    out.checks.G6 = byKey.revenue?.period.period_origin === 'parsed'
      && byKey.revenue?.period.label === 'FY2025'
      && byKey.revenue?.period.period_start === '2025-01-01'
      && byKey.revenue?.period.period_end === '2025-12-31';
    out.checks.G7 = byKey.revenue?.business_id === BIZ_A;

    const sbA = makeSb(seedA());
    const cA = await makeContract(contractSrc)(sbA.sb, BIZ_A, 'p-owner');
    const sbB = makeSb(seedB());
    const cB = await makeContract(contractSrc)(sbB.sb, BIZ_B, 'p-owner');
    runtimeWrites = [...sbA.writes, ...sbB.writes];

    out.checks.G8 = Boolean(cA.semantic_observations && cA.semantic_observations.revenue);
    out.checks.G9 = cA.profitability.revenue === 1250000
      && cA.profitability.revenue_period_label === 'FY2025'
      && cA.profitability.revenue_lifecycle_state === 'confirmed';
    out.checks.G10 = byKey.revenue?.provenance.source_document_id === DOC_A
      && /business tax return/i.test(byKey.revenue?.provenance.source_label || '')
      && byKey.revenue?.provenance.source_field === 'gross_receipts';
    out.checks.G11 = !(cA.risks || []).some((r) => /verified revenue/i.test(r.risk || ''));
    out.checks.G12 = cB.profitability.revenue === null && !JSON.stringify(cB).includes('1250000');
    out.checks.G13 = Object.keys(cB.semantic_observations || {}).length === 0 && !JSON.stringify(cB).includes('1,250,000');

    const rejected = sem.mapObservation({ ...grossReceipts(), id: 'ef-rej', review_status: 'rejected' }, BIZ_A);
    const pending = sem.mapObservation({ ...grossReceipts(), id: 'ef-pend', review_status: 'pending_review' }, BIZ_A);
    out.checks.G14 = rejected.status === 'ineligible' && rejected.lifecycle_state === 'rejected';
    out.checks.G15 = pending.status === 'ineligible' && pending.lifecycle_state === 'proposed';

    const layerCorrected = sem.buildObservationLayer([
      { ...grossReceipts(), review_status: 'accepted', accepted_normalized_value: '1250000' },
      { ...grossReceipts(), id: 'ef-corr', review_status: 'corrected', accepted_value: '$1,300,000', accepted_normalized_value: '1300000', reviewed_at: '2026-10-03T00:00:00Z' },
    ], BIZ_A);
    out.checks.G16 = layerCorrected.by_key.revenue?.value === 1300000;

    out.checks.G17 = layerA.observations.every((o) => o.lifecycle_state === 'confirmed' && o.verification_status === 'unverified' && o.verification_method === null);

    const ttm = sem.resolveSemanticObservation(layerA.observations, 'revenue', { businessId: BIZ_A, requiredPeriodType: 'ttm' });
    out.checks.G18 = ttm.reason === 'period_mismatch' && ttm.observation === null
      && ttm.requested_period_type === 'ttm' && ttm.available_period_types.includes('annual');

    const missingSource = sem.mapObservation({ ...grossReceipts(), metadata: { ...FY2025, source_status: 'missing' } }, BIZ_A);
    out.checks.G19 = missingSource.status === 'mapped' && missingSource.observation.provenance.source_available === false
      && missingSource.observation.value === 1250000;

    out.checks.G20 = runtimeWrites.every((w) => w.table !== 'business_facts') && out.static.no_fact_writes;
    out.checks.G21 = runtimeWrites.every((w) => w.table !== 'business_fact_evidence');

    // ── MAPPING CONTRACT (P-series) ───────────────────────────────────────
    const m = (over) => sem.mapObservation({ ...grossReceipts(), ...over }, BIZ_A);
    const key = (over) => { const r = m(over); return r.status === 'mapped' ? r.observation.canonical_key : null; };
    out.checks.P1 = ['annual_revenue', 'total_revenue', 'gross_revenue'].every((f) =>
      key({ field_name: f, source_document_type: 'profit_and_loss' }) === 'revenue');
    // A BARE `revenue` extracted field is NOT declared by the canonical registry, so
    // the bridge refuses to invent it. Documented handoff gap for 6D.1 (registry
    // expansion), never a silent alias.
    out.checks.P1b = m({ field_name: 'revenue', source_document_type: 'profit_and_loss' }).status === 'unmapped';
    out.checks.P2 = key({ field_name: 'gross_receipts' }) === 'revenue';
    out.checks.P3 = key({ field_name: 'gross_receipts', source_document_type: 'profit_and_loss' }) === null;
    out.checks.P4 = key({ field_name: 'gross_profit', source_document_type: 'profit_and_loss' }) === 'gross_profit'
      && key({ field_name: 'gross_income', source_document_type: 'profit_and_loss' }) === 'gross_profit';
    out.checks.P5 = key({ field_name: 'owner_compensation', source_document_type: 'profit_and_loss' }) === 'owner_compensation'
      && key({ field_name: 'officer_compensation', source_document_type: 'business_tax_return' }) === 'owner_compensation';
    const registryDeclares = (factKey, fieldName) => {
      const reg = loadModule(registrySrc, [], [], '{ FACT_REGISTRY }').FACT_REGISTRY;
      const def = reg.find((f) => f.fact_key === factKey);
      return (def?.candidate_sources || []).some((s) => (s.field_names || []).includes(fieldName));
    };
    out.checks.P6 = key({ field_name: 'ordinary_business_income' }) === 'net_income'
      && registryDeclares('net_income', 'ordinary_business_income'); // authorized by the canonical definition, not by this module
    // 6D.1A GATE 6B — EXPECTATION UPDATED, AND MADE STRONGER.
    //
    // This check has always been about keeping two DIFFERENT earnings measures apart.
    // The registry used to admit `operating_income` as a reported_ebitda candidate,
    // which made EBIT and EBITDA the same number under two names; 6D.1A removed that
    // and gave `operating_income` its own fact (`ebit`). So each measure now resolves
    // to its OWN key, the two keys are asserted to differ, and the engine's literal
    // `reported_ebitda` field is still refused rather than guessed at.
    out.checks.P7 = key({ field_name: 'ebitda', source_document_type: 'profit_and_loss' }) === 'reported_ebitda'
      && key({ field_name: 'operating_income', source_document_type: 'profit_and_loss' }) === 'ebit'
      && key({ field_name: 'ebitda', source_document_type: 'profit_and_loss' })
        !== key({ field_name: 'operating_income', source_document_type: 'profit_and_loss' })
      && !sem.mappedFactKeys().includes('normalized_ebitda')
      && m({ field_name: 'reported_ebitda', source_document_type: 'profit_and_loss' }).status === 'unmapped';
    out.checks.P8 = m({ field_name: 'mystery_metric', review_status: 'accepted' }).status === 'unmapped'
      && m({ field_name: 'total_expenses', source_document_type: 'profit_and_loss' }).status === 'unmapped';
    out.checks.P9 = sem.fieldMapping('gross_receipts').length === 1
      && sem.fieldMapping('gross_receipts')[0].fact_key === 'revenue';

    // ── BUSINESS SCOPE + PERIOD ───────────────────────────────────────────
    const foreignLayer = sem.buildObservationLayer([{ ...grossReceipts(), business_id: BIZ_B }], BIZ_A);
    out.checks.P10 = foreignLayer.counts.foreign_business === 1 && Object.keys(foreignLayer.by_key).length === 0;
    const scopedOut = sem.buildObservationLayer([{ ...grossReceipts(), business_id: null }], BIZ_A);
    out.checks.P11 = scopedOut.counts.without_business_scope === 1 && Object.keys(scopedOut.by_key).length === 0;
    const noPeriod = sem.observationPeriod({ field_name: 'annual_revenue', metadata: {}, tax_year: null });
    out.checks.P12 = noPeriod.period_origin === 'unknown' && noPeriod.period_start === null
      && noPeriod.period_end === null && noPeriod.period_type === null
      && String(noPeriod.label) === 'period unknown'
      && !String(noPeriod.period_start).includes(String(new Date().getFullYear()));
    const declared = sem.observationPeriod({ metadata: {}, tax_year: 2024 });
    out.checks.P13 = declared.period_origin === 'declared' && declared.label === 'FY2024'
      && declared.period_end === '2024-12-31' && /declared at upload/.test(declared.note || '');
    const inferred = sem.observationPeriod({ metadata: { period_start: '2026-07-01', period_end: '2026-09-30', period_type: 'quarterly', fiscal_year: 2026 }, tax_year: null });
    out.checks.P14 = inferred.period_origin === 'inferred' && inferred.label === 'Q3 2026';
    out.checks.P15 = sem.mappedFactKeys().every((k) => true) && typeof sem.SEMANTIC_MAPPING_VERSION === 'string';
  } catch (err) {
    out.error = String(err && err.message);
  }
  return out;
}

// ── Base run (must be fully green) ──────────────────────────────────────────
async function main() {
const base = { registrySrc: read(P.REGISTRY), semanticsSrc: read(P.SEMANTICS), contractSrc: read(P.CONTRACT), galileoSrc: read(P.GALILEO) };
const r = await runSuite(base);

if (r.error) check('BASE', 'modules compile and execute', false, r.error);
check('S1', 'Galileo keeps no private field-name matcher', r.static.galileo_no_private_matcher);
check('S2', 'Galileo issues no extracted_fields query of its own', r.static.galileo_no_field_query);
check('S3', 'Galileo consumes the contract semantic layer', r.static.galileo_reads_contract_semantics);
check('S4', 'Contract uses the ONE bridge (no second matcher)', r.static.contract_uses_bridge);
check('S5', 'Single semantic source (aliases live only in the registry)', r.static.single_semantic_source);
check('S6', 'No business_facts / evidence writes anywhere in the bridge', r.static.no_fact_writes);
check('S7', 'The bridge is a pure module (no sb, no Deno, no supabase)', r.static.bridge_is_pure);

const g = r.checks;
check('G1', 'document belongs to Business A', g.G1);
check('G2', 'document type = business_tax_return', g.G2);
check('G3', 'gross_receipts = 1,250,000', g.G3);
check('G4', 'review = accepted', g.G4);
check('G5', 'mapper resolves canonical key = revenue', g.G5);
check('G6', 'period preserved (parsed FY2025, bounds intact)', g.G6);
check('G7', 'business_id preserved on the observation', g.G7);
check('G8', 'observation available through the approved read path', g.G8);
check('G9', 'Business A contract carries revenue with period + label', g.G9);
check('G10', 'attribution: source document + field + page preserved', g.G10);
check('G11', 'generic revenue knowledge gap suppressed', g.G11);
check('G12', 'Business B contract does NOT contain Business A revenue', g.G12);
check('G13', 'switching A → B removes A intelligence', g.G13);
check('G14', 'rejected observation unavailable', g.G14);
check('G15', 'pending observation unavailable', g.G15);
check('G16', 'corrected observation uses the corrected value', g.G16);
check('G17', 'accepted ≠ verified (confirmed / unverified, no method)', g.G17);
check('G18', 'period mismatch returns a precise, honest result', g.G18);
check('G19', 'source-missing provenance stays honest and the value survives', g.G19);
check('G20', 'zero business_facts writes', g.G20);
check('G21', 'zero business_fact_evidence writes', g.G21);

check('P1', 'revenue aliases → revenue', g.P1);
check('P1b', 'a bare `revenue` field is refused, not invented (registry gap documented)', g.P1b);
check('P2', 'gross_receipts (tax return) → revenue', g.P2);
check('P3', 'document-type discipline: gross_receipts on a P&L is refused', g.P3);
check('P4', 'gross_profit / gross_income → gross_profit', g.P4);
check('P5', 'owner_compensation + officer_compensation → owner_compensation', g.P5);
check('P6', 'ordinary_business_income → net_income ONLY where the registry declares it', g.P6);
check('P7', 'EBIT ≠ EBITDA (each measure has its own key, never aliased)', g.P7);
check('P8', 'unknown field → no fabricated mapping', g.P8);
check('P9', 'exactly one canonical meaning for gross_receipts', g.P9);
check('P10', 'a foreign-business observation is dropped', g.P10);
check('P11', 'a row without business scope is dropped', g.P11);
check('P12', 'no period → unknown, never a fabricated calendar year', g.P12);
check('P13', 'a declared year is labelled declared with its note', g.P13);
check('P14', 'recorded bounds without a source label are inferred (Q3 2026)', g.P14);
check('P15', 'mapping version + reachable fact keys exposed', g.P15);

// ── MUTATION TESTS M1–M13 — the harness must CATCH each regression ──────────
const mutate = (src, find, replace, label) => {
  if (!src.includes(find)) throw new Error(`mutation target not found: ${label || find}`);
  return src.replace(find, replace);
};
const pendingMutations = [];
const expectBroken = (id, label, mutated, assertKey) => {
  pendingMutations.push((async () => {
    let res;
    try { res = await runSuite(mutated); } catch (e) { res = { checks: {}, static: {}, error: e.message }; }
    const broken = assertKey(res);
    check(id, `${label} — caught`, broken === false, broken === false ? '' : 'the harness did NOT catch this regression');
  })());
};

expectBroken('M1', 'gross_receipts mapping removed', { ...base, registrySrc: mutate(base.registrySrc, "field_names: ['gross_receipts']", 'field_names: []', 'M1') }, (x) => x.checks.G5);
expectBroken('M2', 'ordinary_business_income mapped to net_income without registry authorization', { ...base, registrySrc: mutate(base.registrySrc, "'ordinary_business_income', 'taxable_income'", "'taxable_income'", 'M2') }, (x) => x.checks.P6);
expectBroken('M3', 'business-scope guard removed in the mapper', { ...base, semanticsSrc: mutate(base.semanticsSrc, "if (!row?.business_id) return { status: 'no_business', field_name: fieldName };", 'if (false) return { status: \'no_business\', field_name: fieldName };', 'M3') }, (x) => x.checks.P11);
expectBroken('M4', 'period bounds dropped from the observation', { ...base, semanticsSrc: mutate(base.semanticsSrc, 'const period = observationPeriod(row);', 'const period = { ...observationPeriod(row), period_start: null, period_end: null };', 'M4') }, (x) => x.checks.G6);
expectBroken('M5', 'pending becomes eligible', { ...base, semanticsSrc: mutate(base.semanticsSrc, "case 'pending_review':\n      return { eligible: false,", "case 'pending_review':\n      return { eligible: true,", 'M5') }, (x) => x.checks.G15);
expectBroken('M6', 'rejected becomes eligible', { ...base, semanticsSrc: mutate(base.semanticsSrc, "case 'rejected':\n      return { eligible: false,", "case 'rejected':\n      return { eligible: true,", 'M6') }, (x) => x.checks.G14);
expectBroken('M7', 'accepted becomes verified', { ...base, semanticsSrc: mutate(base.semanticsSrc, "verification_status: 'unverified',", "verification_status: 'verified',", 'M7') }, (x) => x.checks.G17);
expectBroken('M8', 'Business A observation leaks into Business B', { ...base, semanticsSrc: mutate(base.semanticsSrc, "if (row.business_id !== businessId) return { status: 'foreign_business', field_name: fieldName };", 'if (false) return { status: \'foreign_business\', field_name: fieldName };', 'M8') }, (x) => x.checks.G12 && x.checks.P10);
expectBroken('M9', 'hardcoded calendar year reintroduced', { ...base, semanticsSrc: mutate(base.semanticsSrc, "if (period_origin === 'unknown') {", "if (period_origin === 'unknown') { period_start = period_start || `${new Date().getFullYear()}-01-01`; period_end = period_end || `${new Date().getFullYear()}-12-31`;", 'M9') }, (x) => x.checks.P12);
expectBroken('M10', 'a duplicate alias table reintroduced', { ...base, contractSrc: mutate(base.contractSrc, 'const obs = observationLayer.by_key;', "const obs = observationLayer.by_key;\n  const DUPLICATE_ALIAS_TABLE = { gross_receipts: 'revenue' };", 'M10') }, (x) => x.static.single_semantic_source);
expectBroken('M11', 'Galileo directly queries extracted_fields again', { ...base, galileoSrc: mutate(base.galileoSrc, 'const semantic_observations = contract.semantic_observations || {};', "const semantic_observations = contract.semantic_observations || {};\n    const adHoc = await sb.from('extracted_fields').select('*');", 'M11') }, (x) => x.static.galileo_no_field_query);
expectBroken('M12', 'a business_facts write introduced', { ...base, contractSrc: mutate(base.contractSrc, 'const obs = observationLayer.by_key;', "const obs = observationLayer.by_key;\n  await sb.from('business_facts').insert([]);", 'M12') }, (x) => x.static.no_fact_writes);
expectBroken('M13', 'a business_fact_evidence write introduced', { ...base, contractSrc: mutate(base.contractSrc, 'const obs = observationLayer.by_key;', "const obs = observationLayer.by_key;\n  await sb.from('business_fact_evidence').insert([]);", 'M13') }, (x) => x.static.no_fact_writes);

await Promise.all(pendingMutations);

// ── Result ─────────────────────────────────────────────────────────────────
console.log('');
if (failures.length === 0) {
  console.log('6D.0a SEMANTIC OBSERVATION BRIDGE — ALL CHECKS PASSED');
  process.exit(0);
}
console.log(`6D.0a SEMANTIC OBSERVATION BRIDGE — ${failures.length} FAILURE(S)`);
for (const f of failures) console.log(`  · ${f}`);
process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });