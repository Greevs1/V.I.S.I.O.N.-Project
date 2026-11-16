/**
 * Phase 6D.1B — SHADOW PROMOTION ENGINE — CERTIFICATION HARNESS
 *
 *   node scripts/digitalTwinShadowPromotion.test.cjs
 *
 * Offline, non-destructive, behavioural: it bundles the REAL modules, runs the REAL
 * shadow engine on production-shaped fixtures, and then attacks the real SOURCE with
 * adversarial mutations — every one must apply, change behaviour, and be caught.
 *
 * SECTIONS
 *   S1–S41    the required scenario matrix
 *   Q-*       the properties the phase must not lose (determinism, fingerprint KAT, reuse)
 *   FREEZE    the engine cannot write, asserted at source level
 *   M1–M12    the mutation battery (MISSED = 0, DID_NOT_APPLY = 0)
 */
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const P = (p) => path.join(ROOT, p);

const F = {
  contract: 'base44/shared/digitalTwin/contract.ts',
  provenance: 'base44/shared/digitalTwin/provenance.ts',
  qualities: 'base44/shared/digitalTwin/qualities.ts',
  trust: 'base44/shared/digitalTwin/trust.ts',
  preflight: 'base44/shared/digitalTwin/preflight.ts',
  shadowContract: 'base44/shared/digitalTwin/shadowContract.ts',
  shadow: 'base44/shared/digitalTwin/shadowPromotion.ts',
  fingerprint: 'base44/shared/digitalTwin/fingerprint.ts',
  registry: 'base44/shared/canonicalFact/registry.ts',
  semantics: 'base44/shared/documentObservation/semantics.ts',
  eligibility: 'base44/shared/documentExtraction/evidenceEligibility.ts',
  disposition: 'base44/shared/documentExtraction/fieldDisposition.ts',
  fn: 'base44/functions/digitalTwinShadowPromotion/entry.ts',
};

function applyEdits(text, edits) {
  let out = String(text);
  for (const e of edits || []) {
    if (!out.includes(e.find)) throw new Error(`mutation anchor not found in ${e.file}`);
    out = out.replace(e.find, e.replace);
  }
  return out;
}

function editsFor(edits, file) {
  return (edits || []).filter((e) => e.file === file);
}

async function load(entry, edits) {
  const byFile = {};
  for (const e of edits || []) (byFile[e.file] = byFile[e.file] || []).push(e);
  const plugins = [{
    name: 'harness',
    setup(b) {
      b.onResolve({ filter: /^@\// }, (a) => {
        const f = P('src/' + a.path.slice(2));
        for (const ext of ['', '.js', '.jsx', '.ts', '.tsx']) {
          if (fs.existsSync(f + ext) && fs.statSync(f + ext).isFile()) return { path: f + ext };
        }
        return { path: f };
      });
      b.onLoad({ filter: /.*/ }, (a) => {
        const rel = path.relative(ROOT, a.path).split(path.sep).join('/');
        const list = byFile[rel];
        if (!list) return undefined;
        const src = applyEdits(fs.readFileSync(a.path, 'utf8'), list);
        const loader = a.path.endsWith('.ts') ? 'ts' : a.path.endsWith('.jsx') ? 'jsx' : 'js';
        return { contents: src, loader };
      });
    },
  }];
  const out = await esbuild.build({
    entryPoints: [P(entry)], bundle: true, format: 'cjs', platform: 'node',
    write: false, logLevel: 'silent', plugins, external: ['npm:*', 'jsr:*'],
  });
  const m = { exports: {} };
  new Function('module', 'exports', 'require', out.outputFiles[0].text)(m, m.exports, require);
  return m.exports;
}

// ── Fixtures (production-shaped) ─────────────────────────────────────────────
const BIZ = 'biz-apex';
const OTHER = 'biz-summit';
const NAME = 'Apex Roofing LLC';
const DOC = 'doc-pl-2024';
const BASE_META = {
  fiscal_year: 2024, period_type: 'annual', period_source: 'model_reported',
  period_start: '2024-01-01', period_end: '2024-12-31', accounting_basis: 'accrual',
};

const obs = (o = {}) => ({
  id: 'ef-1', business_id: BIZ, document_id: DOC, field_name: 'annual_revenue',
  normalized_value: 1250000, accepted_normalized_value: 1250000,
  review_status: 'accepted', source_document_type: 'profit_and_loss', source_page: 1,
  confidence_score: '95', metadata: { ...BASE_META }, ...o,
});
const doc = (o = {}) => ({ id: DOC, name: '2024_Profit_and_Loss.pdf', document_type: 'profit_and_loss', business_id: BIZ, ...o });
const analysis = (o = {}) => ({ id: 'an-1', document_id: DOC, analysis_status: 'completed', extracted_data: { extraction_method: 'ai_extraction' }, ...o });

const item = (o = {}, x = {}) => ({
  observation: obs(o),
  document: x.document !== undefined ? x.document : doc(),
  analysis: x.analysis !== undefined ? x.analysis : analysis(),
  association: x.association !== undefined ? x.association : { identityNames: [NAME] },
  attestation: x.attestation !== undefined ? x.attestation : null,
});

async function evaluate(edits = null) {
  const SC = await load(F.shadowContract, edits);
  const SP = await load(F.shadow, edits);
  const FP = await load(F.fingerprint, edits);
  const PF = await load(F.preflight, edits);
  const TR = await load(F.trust, edits);
  const QL = await load(F.qualities, edits);
  const PV = await load(F.provenance, edits);
  const RG = await load(F.registry, edits);

  const run = (items, x = {}) => SP.evaluateShadowPromotion({
    business: { businessId: x.businessId !== undefined ? x.businessId : BIZ, businessName: x.businessName !== undefined ? x.businessName : NAME },
    observations: items,
    existingFacts: x.existingFacts || [],
    pilotKeys: x.pilotKeys,
  });
  const one = (o = {}, x = {}) => run([item(o, x)], x)[0];

  const res = {};
  const set = (k, v) => { res[k] = !!v; };

  // ══ S1–S2 : THE HAPPY PATH ═══════════════════════════════════════════════
  const s1 = one();
  set('S1', s1.decision === 'WOULD_PROMOTE' && s1.fact_key === 'revenue' && s1.candidate_value === 1250000
    && s1.in_pilot === true && s1.would_write_fact === true && s1.would_write_evidence === true
    && s1.period_quality === 'EXACT' && s1.accounting_basis === 'accrual' && s1.verification_state === 'confirmed');

  const s2 = one({ field_name: 'gross_profit', normalized_value: 625000, accepted_normalized_value: 625000 });
  set('S2', s2.decision === 'WOULD_PROMOTE' && s2.fact_key === 'gross_profit' && s2.candidate_value === 625000);

  // ══ S3–S5 : PROVENANCE ═══════════════════════════════════════════════════
  const s3 = one({ metadata: { ...BASE_META, evidence_origin: 'SYNTHETIC' } });
  set('S3', s3.decision === 'BLOCKED' && s3.blockers.includes('SYNTHETIC_SOURCE') && s3.would_write_fact === false && s3.provenance_class === 'SYNTHETIC');

  const s4 = run([item({ confidence_score: '98' }, { analysis: analysis({ extracted_data: { extraction_method: 'mock_extraction' } }) })])[0];
  set('S4', s4.decision === 'BLOCKED' && s4.blockers.includes('SYNTHETIC_SOURCE') && s4.provenance_class === 'SYNTHETIC' && s4.verification_state === 'confirmed');

  const s5 = run([item({ field_name: 'gross_profit', normalized_value: 625000, accepted_normalized_value: 625000 },
    { document: doc({ name: 'demo_pl.pdf' }), analysis: analysis({ extracted_data: {} }) })])[0];
  set('S5', s5.decision === 'BLOCKED' && s5.provenance_class === 'DEMO');

  // ══ S6–S8 : BUSINESS ASSOCIATION ═════════════════════════════════════════
  const s6 = one({}, { association: { identityNames: [] } });
  set('S6', s6.decision === 'BLOCKED' && s6.blockers.includes('BUSINESS_ASSOCIATION_AMBIGUOUS') && s6.business_association === 'ASSOCIATION_AMBIGUOUS');

  const s7 = one({}, { association: { identityNames: ['Apex Roofing Services Inc'] } });
  set('S7', s7.decision !== 'WOULD_PROMOTE' && s7.business_association !== 'ASSOCIATION_PROVEN');

  const s8 = one({ business_id: OTHER });
  set('S8', s8.decision === 'BLOCKED' && s8.blockers.includes('BUSINESS_ASSOCIATION_REJECTED'));

  // ══ S9–S14 : PERIOD ══════════════════════════════════════════════════════
  const s9 = one({ metadata: { ...BASE_META, period_type: 'fiscal_year' } });
  set('S9', s9.decision === 'WOULD_PROMOTE' && s9.period_quality === 'EXACT'
    && s9.period_type !== 'trailing_twelve_months' && s9.period_type !== 'ttm');

  const s10 = one({ metadata: { ...BASE_META, period_type: 'calendar_year' } });
  set('S10', s10.decision === 'WOULD_PROMOTE' && s10.period_quality === 'EXACT');

  const s11 = one({ metadata: { ...BASE_META, period_type: 'ttm' } });
  set('S11', s11.decision === 'WOULD_PROMOTE' && ['EXACT', 'BOUNDED'].includes(s11.period_quality)
    && Boolean(s11.period_type) && s11.period_type !== 'fiscal_year');

  const s12 = one({ metadata: { period_raw: 'All Dates (2021-2025)', period_source: 'unresolved', accounting_basis: 'accrual' } });
  set('S12', s12.decision === 'BLOCKED' && s12.blockers.includes('MULTI_PERIOD_AGGREGATE') && s12.period_quality === 'AGGREGATE_MULTI_PERIOD');

  const s13 = one({ metadata: { accounting_basis: 'accrual' } });
  set('S13', s13.decision === 'BLOCKED' && s13.blockers.includes('PERIOD_UNKNOWN') && s13.period_quality === 'UNKNOWN');

  const s14 = one({ metadata: { period_raw: 'FY (unresolved)', period_source: 'unresolved', accounting_basis: 'accrual' } });
  set('S14', s14.decision === 'BLOCKED' && s14.blockers.includes('PERIOD_AMBIGUOUS') && s14.period_quality === 'AMBIGUOUS');

  // ══ S15–S17 : BASIS ══════════════════════════════════════════════════════
  const s15 = one({ metadata: { ...BASE_META, accounting_basis: 'cash' } });
  set('S15', s15.decision === 'WOULD_PROMOTE' && s15.accounting_basis === 'cash');

  set('S16', s1.decision === 'WOULD_PROMOTE' && s1.accounting_basis === 'accrual');

  const s17 = one({ metadata: { fiscal_year: 2024, period_type: 'annual', period_source: 'model_reported', period_start: '2024-01-01', period_end: '2024-12-31' } });
  set('S17', s17.decision === 'BLOCKED' && s17.blockers.includes('BASIS_UNKNOWN') && s17.basis_required === true);

  // ══ S18–S21 : REVIEW & VERIFICATION ══════════════════════════════════════
  const s18 = one({ review_status: 'pending_review' });
  set('S18', s18.decision === 'BLOCKED' && s18.blockers.includes('REVIEW_PENDING') && s18.human_confirmation_state === 'proposed');

  const s19 = one();
  set('S19', s19.decision === 'WOULD_PROMOTE' && s19.human_confirmation_state === 'confirmed'
    && s19.verification_state === 'confirmed' && s19.verification_state !== 'verified');

  const s20 = run([item({}, { attestation: { verified: true, method: 'advisor_review', byProfileId: 'p1' } })])[0];
  set('S20', s20.decision === 'WOULD_PROMOTE' && s20.verification_state === 'verified' && s20.verification_method === 'advisor_review');

  const s21 = one({ review_status: 'rejected' });
  set('S21', s21.decision === 'BLOCKED' && s21.blockers.includes('REVIEW_REJECTED'));

  // ══ S22–S26 : GROUPING & CONFLICT ════════════════════════════════════════
  const s22 = run([item({ id: 'ef-1' }), item({ id: 'ef-2' })]);
  const s22w = s22.find((r) => r.decision === 'WOULD_PROMOTE');
  set('S22', s22.length === 2 && s22w && s22.filter((r) => r.decision === 'SUPERSEDED').length === 1
    && s22w.evidence_ids.length === 2 && s22w.warnings.includes('DUPLICATE_OBSERVATION'));

  const s23 = run([item({ id: 'ef-1' }), item({ id: 'ef-2', normalized_value: 1250100, accepted_normalized_value: 1250100 })]);
  const s23w = s23.find((r) => r.decision === 'WOULD_PROMOTE');
  set('S23', s23w && s23.filter((r) => r.decision === 'SUPERSEDED').length === 1 && s23w.warnings.includes('MINOR_VARIANCE'));

  const s24 = run([item({ id: 'ef-1' }), item({ id: 'ef-2', normalized_value: 900000, accepted_normalized_value: 900000 })]);
  set('S24', s24.every((r) => r.decision === 'CONFLICTED')
    && s24.every((r) => r.conflicting_candidate_ids.length === 2)
    && s24.every((r) => r.candidates.length === 2));

  const taxItem = item({
    id: 'ef-tax', field_name: 'gross_receipts', source_document_type: 'business_tax_return',
    normalized_value: 1600000, accepted_normalized_value: 1600000,
    metadata: { form_type: 'form_1120', ...BASE_META },
  }, { document: doc({ name: '2024_1120.pdf', document_type: 'business_tax_return' }) });
  const plItem = item({ id: 'ef-pl' });
  const s25 = run([taxItem, plItem]);
  const s25w = s25.find((r) => r.decision === 'WOULD_PROMOTE');
  set('S25', s25.length === 2 && s25w && s25w.source_authority === 'verified_tax_return'
    && s25w.warnings.includes('LOWER_AUTHORITY_DISAGREEMENT')
    && s25.filter((r) => r.decision === 'SUPERSEDED').length === 1);

  const s26 = run([item({ id: 'ef-1' }, { attestation: { verified: true, method: 'advisor_review', byProfileId: 'p1' } }),
    item({ id: 'ef-2', normalized_value: 900000, accepted_normalized_value: 900000 })]);
  set('S26', s26.every((r) => r.decision === 'CONFLICTED'));

  // ══ S27–S29 : FINGERPRINT ════════════════════════════════════════════════
  const base = one();
  const existingFrom = (r, o = {}) => ({
    id: 'fact-1', business_id: BIZ, fact_key: r.fact_key,
    period_type: r.period_type, period_label: r.period_label,
    period_start: r.period_start, period_end: r.period_end,
    accounting_basis: r.accounting_basis, fingerprint: r.fingerprint, superseded_at: null, ...o,
  });

  const s27 = one({}, { existingFacts: [existingFrom(base)] });
  set('S27', s27.decision === 'WOULD_PROMOTE' && s27.fingerprint_outcome === 'DUPLICATE'
    && s27.would_write_fact === false && s27.warnings.includes('DUPLICATE_FINGERPRINT'));

  const s28 = one({}, { existingFacts: [existingFrom(base, { fingerprint: 'deadbeef' })] });
  set('S28', s28.fingerprint_outcome === 'CORRECTION' && s28.supersedes_candidate_id === 'fact-1'
    && s28.would_write_fact === true && s28.warnings.includes('CORRECTION_OF_EXISTING_FACT'));

  const s29 = one({}, { existingFacts: [existingFrom(base, { fingerprint: 'deadbeef', superseded_at: '2026-01-01T00:00:00Z' })] });
  set('S29', s29.fingerprint_outcome === 'NEW' && s29.warnings.includes('EXISTING_FACT_SUPERSEDED'));

  // ══ S30–S34 : SCOPE, SENSITIVITY, ASSOCIATION ════════════════════════════
  const s30 = run([item({
    field_name: 'total_tax', source_document_type: 'personal_tax_return', normalized_value: 31000, accepted_normalized_value: 31000,
    metadata: { form_type: 'form_1040', ...BASE_META },
  }, { document: doc({ name: '2023_1040.pdf', document_type: 'personal_tax_return' }) })])[0];
  set('S30', s30.decision !== 'WOULD_PROMOTE' && s30.blockers.includes('PERSONAL_ONLY'));

  const s31 = run([
    item({ id: 'ef-p', field_name: 'adjusted_gross_income', source_document_type: 'personal_tax_return', normalized_value: 185000, accepted_normalized_value: 185000, metadata: { form_type: 'form_1040', ...BASE_META } },
      { document: doc({ id: 'doc-1040', name: '2023_1040.pdf', document_type: 'personal_tax_return' }) }),
    taxItem,
  ]);
  set('S31', s31.find((r) => r.fact_key === 'revenue').decision === 'WOULD_PROMOTE'
    && s31.find((r) => r.fact_key === 'agi').decision !== 'WOULD_PROMOTE');

  const s32 = run([item({
    field_name: 'taxable_income', source_document_type: 'business_tax_return', normalized_value: 187500, accepted_normalized_value: 187500,
    metadata: { form_type: 'form_1120', ...BASE_META },
  }, { document: doc({ name: '2024_1120.pdf', document_type: 'business_tax_return' }) })])[0];
  set('S32', s32.decision !== 'WOULD_PROMOTE' && s32.blockers.includes('EVIDENCE_ONLY_CONCEPT'));

  const s33 = run([item({
    field_name: 'employee_ssn', source_document_type: 'w2', normalized_value: 412998877, accepted_normalized_value: 412998877,
    metadata: { form_type: 'w2', ...BASE_META },
  }, { document: doc({ name: 'W2.pdf', document_type: 'w2' }) })])[0];
  set('S33', s33.decision !== 'WOULD_PROMOTE' && s33.blockers.includes('SENSITIVE'));

  const s34 = run([item({
    field_name: 'business_name', source_document_type: 'business_tax_return', normalized_value: null, field_value: 'Apex',
    metadata: { form_type: 'form_1120', ...BASE_META },
  }, { document: doc({ name: '2024_1120.pdf', document_type: 'business_tax_return' }) })])[0];
  set('S34', s34.decision !== 'WOULD_PROMOTE');

  // ══ S35–S37 : PILOT BOUNDARY & VALUE INTEGRITY ═══════════════════════════
  const s35 = one({ field_name: 'net_profit', normalized_value: 200000, accepted_normalized_value: 200000 });
  set('S35', s35.decision === 'NOT_IN_PILOT' && s35.fact_key === 'net_income' && s35.would_write_fact === false);

  const s36 = one({ field_name: 'totally_unknown_field_xyz' });
  set('S36', s36.decision === 'NO_CANDIDATE' && s36.fact_key === null);

  const s37 = one({ normalized_value: 'abc', accepted_normalized_value: 'abc' });
  set('S37', s37.decision === 'BLOCKED' && s37.candidate_value === null && s37.blockers.includes('MISSING_PROVENANCE'));

  // ══ S38–S41 : VALUE PLAUSIBILITY (warnings, never gates) ═════════════════
  const s38 = one({ normalized_value: 0, accepted_normalized_value: 0 });
  set('S38', s38.decision === 'WOULD_PROMOTE' && s38.warnings.includes('ZERO_VALUE'));

  const s39 = one({ normalized_value: -50000, accepted_normalized_value: -50000 });
  set('S39', s39.decision === 'WOULD_PROMOTE' && s39.warnings.includes('NEGATIVE_VALUE'));

  const s40 = one({ field_name: 'gross_profit', normalized_value: 0, accepted_normalized_value: 0 });
  set('S40', s40.decision === 'WOULD_PROMOTE' && s40.warnings.includes('ZERO_VALUE'));

  const s41 = run([
    item({ field_name: 'gross_profit', normalized_value: 900000, accepted_normalized_value: 900000 }),
    item({ id: 'ef-r', field_name: 'annual_revenue', normalized_value: 500000, accepted_normalized_value: 500000 }),
  ]);
  set('S41', s41.find((r) => r.fact_key === 'gross_profit').warnings.includes('GROSS_PROFIT_EXCEEDS_REVENUE'));

  // ══ PROPERTIES THE PHASE MUST NOT LOSE ═══════════════════════════════════
  set('FINGERPRINT-KAT', FP.sha256Hex('') === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    && FP.sha256Hex('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    && FP.sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq') === '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'
    && base.fingerprint && base.fingerprint.length === 64 && /^[0-9a-f]{64}$/.test(base.fingerprint));

  set('FINGERPRINT-PREIMAGE', base.fingerprint_preimage.split('|').length === 11
    && base.fingerprint_preimage.startsWith(BIZ + '|revenue|')
    && base.fingerprint_preimage.endsWith('|1250000'));

  set('DETERMINISM', JSON.stringify(one({ field_name: 'gross_profit', normalized_value: 625000, accepted_normalized_value: 625000 }))
    === JSON.stringify(one({ field_name: 'gross_profit', normalized_value: 625000, accepted_normalized_value: 625000 })));

  set('PILOT-CLOSED', Array.isArray(SP.SHADOW_PILOT_KEYS) && SP.SHADOW_PILOT_KEYS.length === 2
    && SP.SHADOW_PILOT_KEYS.includes('revenue') && SP.SHADOW_PILOT_KEYS.includes('gross_profit'));

  set('ONE-DECISION', s24.every((r) => ['WOULD_PROMOTE', 'BLOCKED', 'CONFLICTED', 'NOT_IN_PILOT', 'NO_CANDIDATE', 'SUPERSEDED'].includes(r.decision))
    && s1.decision === 'WOULD_PROMOTE' && s35.decision === 'NOT_IN_PILOT' && s36.decision === 'NO_CANDIDATE');

  set('SUMMARY', (() => {
    const sum = SP.summarizeShadow(run([item(), taxItem, item({ field_name: 'net_profit', normalized_value: 1, accepted_normalized_value: 1 })]));
    return sum.observations_evaluated === 3 && sum.by_decision.WOULD_PROMOTE >= 1
      && sum.pilot_candidates.revenue >= 1 && sum.would_write_facts >= 1
      && typeof sum.by_blocker === 'object' && typeof sum.by_provenance === 'object';
  })());

  set('REUSE-PREFLIGHT', /evaluatePromotionPreflight/.test(shadowSrc(edits)) && /import \{ fieldMapping, docTypeAllowed \}/.test(shadowSrc(edits)));

  Object.assign(res, freezeChecks(edits));
  return res;
}

function code(s) {
  return String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}
function shadowSrc(edits) {
  return applyEdits(fs.readFileSync(P(F.shadow), 'utf8'), editsFor(edits, F.shadow));
}
function freezeChecks(edits) {
  const out = {};
  const shadow = code(shadowSrc(edits));
  const shadowContract = code(applyEdits(fs.readFileSync(P(F.shadowContract), 'utf8'), editsFor(edits, F.shadowContract)));
  const fp = code(applyEdits(fs.readFileSync(P(F.fingerprint), 'utf8'), editsFor(edits, F.fingerprint)));
  const fnSrc = code(applyEdits(fs.readFileSync(P(F.fn), 'utf8'), editsFor(edits, F.fn)));
  const all = shadow + '\n' + shadowContract + '\n' + fp;

  // FREEZE-1 — the shadow modules hold no writer and no client.
  out['FREEZE-1'] = !/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(|createClient/.test(all)
    && !/\.from\(['"]business_facts['"]\)/.test(all);
  // FREEZE-2 — the production function declares no write of any kind.
  out['FREEZE-2'] = !/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/.test(fnSrc)
    && /writes_performed: false/.test(fnSrc);
  // FREEZE-3 — the fact tables are only ever COUNTED or SELECTed, never written.
  out['FREEZE-3'] = !/from\(['"]business_facts['"]\)[\s\S]{0,80}?\.(insert|update|upsert|delete)\(/.test(fnSrc)
    && !/from\(['"]business_fact_evidence['"]\)[\s\S]{0,80}?\.(insert|update|upsert|delete)\(/.test(fnSrc);
  // FREEZE-4 — the freeze is measured before AND after, and reported.
  out['FREEZE-4'] = /fact_freeze_before/.test(fnSrc) && /fact_freeze_after/.test(fnSrc) && /fact_freeze_held/.test(fnSrc);
  // REUSE-1 — no second blocker vocabulary was invented.
  out['REUSE-1'] = !/PROMOTION_BLOCKERS\s*=/.test(shadow) && /from '\.\/preflight\.ts'/.test(shadowSrc(edits));
  // REUSE-2 — no second authority hierarchy.
  out['REUSE-2'] = /SOURCE_AUTHORITY/.test(shadow) && !/authorityRank\s*:\s*\{/.test(shadow);
  return out;
}

// ── The mutation battery ────────────────────────────────────────────────────
const MUTATIONS = [
  { id: 'M1', what: 'synthetic (mock) evidence accepted as real', probe: 'S4',
    edits: [{ file: F.provenance, find: '  if (method === SYNTHETIC_METHOD) {', replace: '  if (false && method === SYNTHETIC_METHOD) {' }] },
  { id: 'M2', what: 'foreign-business evidence allowed through', probe: 'S8',
    edits: [{ file: F.preflight, find: '  if (!row?.business_id || (businessId && String(row.business_id) !== String(businessId))) {', replace: '  if (false && (!row?.business_id || (businessId && String(row.business_id) !== String(businessId)))) {' }] },
  { id: 'M3', what: 'a multi-year aggregate treated as a single period', probe: 'S12',
    edits: [{ file: F.qualities, find: '  if (raw && MULTI_PERIOD_PATTERNS.some((p) => p.test(raw))) {', replace: '  if (false && raw && MULTI_PERIOD_PATTERNS.some((p) => p.test(raw))) {' }] },
  { id: 'M4', what: 'an unknown basis silently treated as accrual', probe: 'S17',
    edits: [{ file: F.qualities, find: '  if (raw == null) return { basis: ACCOUNTING_BASIS.UNKNOWN, source: null, recorded: false };', replace: '  if (raw == null) return { basis: ACCOUNTING_BASIS.ACCRUAL, source: null, recorded: false };' }] },
  { id: 'M5', what: 'unreviewed evidence treated as confirmed', probe: 'S18',
    edits: [{ file: F.trust, find: '  const review_state = CONFIRMING_REVIEW_STATES.includes(reviewStatus)', replace: '  const review_state = true' }] },
  { id: 'M6', what: 'human confirmation treated as verification', probe: 'S19',
    edits: [{ file: F.trust, find: '  if (explicitlyVerified) {', replace: '  if (explicitlyVerified || review_state === REVIEW_STATE.CONFIRMED) {' }] },
  { id: 'M7', what: 'the pilot gate bypassed', probe: 'S35',
    edits: [{ file: F.shadow, find: '  else if (!inPilot) decision = SHADOW_DECISIONS.NOT_IN_PILOT;', replace: '  else if (false && !inPilot) decision = SHADOW_DECISIONS.NOT_IN_PILOT;' }] },
  { id: 'M8', what: 'a material conflict ignored', probe: 'S24',
    edits: [{ file: F.shadow, find: '  const topMaterial = relativeSpread(topValues) > threshold;', replace: '  const topMaterial = false;' }] },
  { id: 'M9', what: 'the LOWEST authority wins the group', probe: 'S25',
    edits: [{ file: F.shadow, find: '  const topRank = Math.min(...members.map((m) => m.source_authority_rank));', replace: '  const topRank = Math.max(...members.map((m) => m.source_authority_rank));' }] },
  { id: 'M10', what: 'personal-only evidence promoted (BOTH protections must fail)', probe: 'S30',
    edits: [
      { file: F.disposition, find: "    total_tax: eo(false, 'a tax liability of the individual, not business tax expense'),", replace: '    total_tax: cf(true),' },
      { file: F.preflight, find: '  } else if (evidenceScope === \'personal_only\') {', replace: "  } else if (false && evidenceScope === 'personal_only') {" },
      { file: F.preflight, find: "  } else if (eligibility.state === 'PERSONAL_ONLY') {", replace: "  } else if (false && eligibility.state === 'PERSONAL_ONLY') {" },
    ] },
  { id: 'M11', what: 'a fiscal year silently rewritten as TTM', probe: 'S9',
    edits: [{ file: F.shadow, find: '    period_type: per.period_type ?? null,', replace: "    period_type: String(per.period_type ?? '') === 'fiscal_year' ? 'trailing_twelve_months' : (per.period_type ?? null)," }] },
  { id: 'M12', what: 'the shadow engine writes business_facts (source-level)', probe: 'FREEZE-1',
    edits: [{ file: F.shadow, find: 'export const SHADOW_ENGINE_VERSION = SHADOW_VERSION;', replace: "export const SHADOW_ENGINE_VERSION = SHADOW_VERSION;\nasync function __mutantWrite(sb){ return sb.from('business_facts').insert({}); }" }] },
];

const DESC = {
  S1: 'a real, associated, FY2024, accrual revenue → WOULD_PROMOTE',
  S2: 'a real gross profit → WOULD_PROMOTE',
  S3: 'declared SYNTHETIC → BLOCKED (human acceptance cannot launder it)',
  S4: 'an accepted mock extraction at 98% confidence → BLOCKED',
  S5: 'demonstration material → BLOCKED',
  S6: 'association unproven → BLOCKED',
  S7: 'a near-match business name does not silently pass',
  S8: 'evidence filed under another business → BLOCKED',
  S9: 'an exact stated fiscal year → WOULD_PROMOTE (never rewritten as TTM)',
  S10: 'an exact calendar year → WOULD_PROMOTE',
  S11: 'a TTM figure keeps its own period type',
  S12: 'a multi-year aggregate → BLOCKED',
  S13: 'no period → BLOCKED (UNKNOWN)',
  S14: 'a stated-but-unresolved period → BLOCKED (AMBIGUOUS)',
  S15: 'cash basis → WOULD_PROMOTE',
  S16: 'accrual basis → WOULD_PROMOTE',
  S17: 'unknown basis on a flow measure → BLOCKED',
  S18: 'unreviewed evidence → BLOCKED',
  S19: 'confirmed evidence → WOULD_PROMOTE, verification_state = confirmed (not verified)',
  S20: 'an explicit attestation → verified',
  S21: 'rejected evidence → BLOCKED',
  S22: 'two identical observations → one fact, two evidence rows',
  S23: 'minor variance → one selected, one subsumed, MINOR_VARIANCE',
  S24: 'material same-authority disagreement → CONFLICTED (both shown)',
  S25: 'higher authority wins deterministically; the loser is retained',
  S26: 'verification does not break an authority tie',
  S27: 'a duplicate fingerprint → a real promotion would be a no-op',
  S28: 'a changed value on the same identity → CORRECTION (supersedes)',
  S29: 'an already-superseded existing fact is surfaced',
  S30: 'personal-only evidence is never promoted',
  S31: 'a personal document does not poison business evidence',
  S32: 'an evidence-only concept is retained and never promoted',
  S33: 'a PII identifier is never promoted',
  S34: 'an association-only field is never promoted',
  S35: 'a canonical concept outside the pilot → NOT_IN_PILOT',
  S36: 'an unknown concept → NO_CANDIDATE',
  S37: 'an unparseable value → BLOCKED (missing provenance)',
  S38: 'zero revenue → promotable, WARNED',
  S39: 'negative revenue → promotable, WARNED',
  S40: 'zero gross profit → promotable, WARNED',
  S41: 'gross profit above revenue → WARNED',
  'FINGERPRINT-KAT': 'SHA-256 matches published test vectors; the 6C fingerprint is 64 hex',
  'FINGERPRINT-PREIMAGE': 'the preimage is the 6C identity, in the declaration\u2019s field order',
  'DETERMINISM': 'the same evidence replays to the same result, byte for byte',
  'PILOT-CLOSED': 'the active pilot is exactly revenue + gross_profit',
  'ONE-DECISION': 'every result carries exactly one primary decision',
  'SUMMARY': 'the summary aggregates decisions, pilot keys and distributions',
  'REUSE-PREFLIGHT': 'the shadow engine calls the certified 6D.1A pre-flight and the one bridge',
  'FREEZE-1': 'the shadow modules hold no writer, no client and no fact-table reference',
  'FREEZE-2': 'the production shadow function declares no write of any kind',
  'FREEZE-3': 'the fact tables are only counted or selected, never written',
  'FREEZE-4': 'the freeze is measured before AND after and reported',
  'REUSE-1': 'no second blocker vocabulary was invented',
  'REUSE-2': 'no second authority hierarchy was invented',
};

(async () => {
  let failures = 0;
  const base = await evaluate();
  for (const [k, v] of Object.entries(base)) {
    if (!v) failures++;
    console.log(`${v ? 'PASS' : 'FAIL'}  ${String(k).padEnd(20)} ${DESC[k] || ''}`);
  }
  let caught = 0;
  for (const m of MUTATIONS) {
    let outcome;
    try {
      const r = await evaluate(m.edits);
      outcome = r[m.probe] === false ? 'CAUGHT' : 'MISSED';
    } catch (e) {
      outcome = /mutation anchor not found/.test(e.message) ? 'DID_NOT_APPLY' : 'CAUGHT';
      if (outcome === 'DID_NOT_APPLY') console.log(`      anchor missing: ${m.edits[0].file} :: ${m.edits[0].find.split('\n')[0]}`);
      else console.log(`      ${m.id} threw (behaviour changed): ${String(e.message).split('\n')[0]}`);
    }
    if (outcome === 'CAUGHT') caught++; else failures++;
    console.log(`${outcome} ${m.id.padEnd(4)} ${m.what} (probe ${m.probe})`);
  }
  console.log(`\nchecks: ${Object.keys(base).length}`);
  console.log(`mutations: ${caught}/${MUTATIONS.length} APPLIED + BEHAVIOR_CHANGED + CAUGHT`);
  console.log(failures ? `${failures} FAILURE(S)` : 'ALL CHECKS PASS');
  process.exit(failures ? 1 : 0);
})();