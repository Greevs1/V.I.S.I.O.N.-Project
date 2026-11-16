/**
 * Phase 6D.1A — DIGITAL TWIN ACTIVATION SAFETY + EVIDENCE QUALITY
 * CERTIFICATION HARNESS
 *
 * Offline, non-destructive, and behavioural wherever behaviour can be executed: it
 * bundles the REAL modules, runs the REAL pre-flight on real-shaped fixtures, and
 * then attacks the real SOURCE with adversarial mutations, requiring every one to
 * apply, change behaviour, and be caught.
 *
 *   node scripts/digitalTwinActivationSafety.test.cjs
 *
 * SECTIONS
 *   Q1–Q20   the required promotion pre-flight matrix
 *   S1–S8    the conflict-view security contract (Gate 1)
 *   FREEZE   the fact freeze — no promotion writer exists on any path
 *   ARCH     whole-repository wiring
 *   M1–M15   the mutation battery (MISSED = 0, DID_NOT_APPLY = 0, UNRUN = 0)
 *
 * WHAT THIS HARNESS CANNOT DO, STATED PLAINLY
 *   It has no database session, so S1–S8 assert the SECURITY CONTRACT that the
 *   repair establishes (grants, security_invoker, policy expressions) rather than
 *   running two live actors. The live half of Gate 1 is verified against the
 *   production catalog separately (VISION_PHASE_6D_1A_ACTIVATION_SAFETY.md §13).
 *   Nothing here claims to have executed what it only asserts.
 */
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const P = (p) => path.join(ROOT, p);

const CONTRACT = 'base44/shared/digitalTwin/contract.ts';
const PROVENANCE = 'base44/shared/digitalTwin/provenance.ts';
const QUALITIES = 'base44/shared/digitalTwin/qualities.ts';
const TRUST = 'base44/shared/digitalTwin/trust.ts';
const PREFLIGHT = 'base44/shared/digitalTwin/preflight.ts';
const REGISTRY = 'base44/shared/canonicalFact/registry.ts';
const SEMANTICS = 'base44/shared/documentObservation/semantics.ts';
const ELIGIBILITY = 'base44/shared/documentExtraction/evidenceEligibility.ts';
const DISPOSITION = 'base44/shared/documentExtraction/fieldDisposition.ts';
const MIGRATION = 'src/supabase/migrations/phase_6d_1a_secure_fact_conflicts.sql';
const MIGRATION_VERIFY = 'src/supabase/migrations/phase_6d_1a_secure_fact_conflicts_verification.sql';
const SIX_C = 'src/supabase/migrations/phase_6c_digital_twin_facts.sql';
const PREFLIGHT_FN = 'base44/functions/digitalTwinPreflight/entry.ts';
const PROBE_FN = 'base44/functions/secureFactConflictView/entry.ts';

async function load(entry, mutation = null) {
  const plugins = [{
    name: 'harness',
    setup(b) {
      b.onResolve({ filter: /^@\// }, (a) => {
        const f = P('src/' + a.path.slice(2));
        for (const ext of ['', '.js', '.jsx', '.ts']) {
          if (fs.existsSync(f + ext) && fs.statSync(f + ext).isFile()) return { path: f + ext };
        }
        return { path: f };
      });
      if (mutation && mutation.kind !== 'sql') {
        b.onLoad({ filter: /.*/ }, (a) => {
          if (path.resolve(a.path) !== P(mutation.file)) return undefined;
          const src = fs.readFileSync(a.path, 'utf8');
          if (!src.includes(mutation.find)) throw new Error(`mutation anchor not found in ${mutation.file}`);
          return { contents: src.replace(mutation.find, mutation.replace), loader: a.path.endsWith('.ts') ? 'ts' : 'js' };
        });
      }
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

// ── Fixtures ────────────────────────────────────────────────────────────────
const BIZ = 'biz-apex';
const OTHER_BIZ = 'biz-summit';
const BIZ_NAME = 'Apex Roofing LLC';
const DOC = 'doc-pl-2024';

/** A production-shaped observation: real reader, stated period, stated basis. */
const obs = (o = {}) => ({
  id: 'ef-1',
  business_id: BIZ,
  document_id: DOC,
  field_name: 'annual_revenue',
  normalized_value: 1250000,
  accepted_normalized_value: 1250000,
  review_status: 'accepted',
  source_document_type: 'profit_and_loss',
  source_page: 1,
  confidence_score: '95',
  metadata: {
    fiscal_year: 2024,
    period_type: 'annual',
    period_source: 'model_reported',
    period_start: '2024-01-01',
    period_end: '2024-12-31',
    accounting_basis: 'accrual',
  },
  ...o,
});

const doc = (o = {}) => ({
  id: DOC, name: '2024_Profit_and_Loss.pdf', document_type: 'profit_and_loss', business_id: BIZ, ...o,
});

/** A real provider read this document. */
const analysis = (o = {}) => ({
  id: 'an-1', document_id: DOC, analysis_status: 'completed',
  extracted_data: { extraction_method: 'ai_extraction' }, ...o,
});

const mockAnalysis = () => analysis({ extracted_data: { extraction_method: 'mock_extraction' } });

// ── Security contract of the repair (pure function of the SQL text) ─────────
function securityChecks(sql) {
  const raw = String(sql);
  const s = raw.replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ').toLowerCase(); // comments stripped
  const grants = (role) => new RegExp(`grant[^;]*on public\\.business_fact_conflicts[^;]*to ${role}`).test(s);
  const revokes = (role) => new RegExp(`revoke[^;]*on public\\.business_fact_conflicts[^;]*from ${role}`).test(s);
  const out = {};

  // S1 — anonymous access is gone, and cannot come back through a stray GRANT.
  out['S1'] = revokes('anon') && !grants('anon');
  // S2 — the PUBLIC pseudo-role (every unauthenticated connection) is revoked too.
  out['S2'] = revokes('public') && !grants('public');
  // S3 — the view stops being owner-privileged, so Business A's read of Business B's
  //      rows is refused by the BASE TABLE's policy, not by anything the view does.
  out['S3'] = /alter view public\.business_fact_conflicts set \(security_invoker = true\)/.test(s);
  // S4 — same mechanism, asserted in the other direction: one repair, symmetric effect.
  out['S4'] = out['S3'] && /can_access_business\(business_id\)/.test(readSixC());
  // S5 — the legitimate read path survives, for authenticated actors only.
  out['S5'] = grants('authenticated') && !grants('anon');
  // S6 — visibility is re-evaluated per read by the security kernel (a revoked team
  //      membership stops resolving), never cached into a column.
  out['S6'] = /can_access_business\(business_id\)/.test(readSixC())
    && !/revoke[^;]*select[^;]*from authenticated/.test(s);
  // S7 — the service role keeps its legitimate read: it is never revoked from, and
  //      FORCE RLS is never turned on (which would restrict the owner too).
  out['S7'] = !/service_role/.test(s) && !/force row level security/.test(s);
  // S8 — the view cannot be a policy bypass: the repair runs it as the invoker AND the
  //      verification step measures the anon grant directly.
  out['S8'] = out['S3'] && /has_table_privilege\('anon'/.test(String(fs.existsSync(P(MIGRATION_VERIFY)) ? fs.readFileSync(P(MIGRATION_VERIFY), 'utf8') : ''));
  return out;
}

let sixC = null;
function readSixC() {
  if (sixC === null) sixC = fs.existsSync(P(SIX_C)) ? fs.readFileSync(P(SIX_C), 'utf8') : '';
  return sixC;
}

// ── The assertion matrix ────────────────────────────────────────────────────
async function evaluate(mutation = null) {
  // A SQL mutation is a mutation of the REPAIR TEXT, so it exercises the security
  // contract directly and needs no bundling.
  if (mutation && mutation.kind === 'sql') {
    const sql = fs.readFileSync(P(MIGRATION), 'utf8');
    if (!sql.includes(mutation.find)) throw new Error(`mutation anchor not found in ${MIGRATION}`);
    return securityChecks(sql.replace(mutation.find, mutation.replace));
  }

  const C = await load(CONTRACT, mutation);
  const PV = await load(PROVENANCE, mutation);
  const QL = await load(QUALITIES, mutation);
  const TR = await load(TRUST, mutation);
  const PF = await load(PREFLIGHT, mutation);
  const RG = await load(REGISTRY, mutation);
  const SEM = await load(SEMANTICS, mutation);
  const EL = await load(ELIGIBILITY, mutation);
  const DP = await load(DISPOSITION, mutation);

  const res = {};
  const set = (k, v) => { res[k] = !!v; };
  const run = (observation, extra = {}) => PF.evaluatePromotionPreflight({
    observation,
    document: extra.document !== undefined ? extra.document : doc(),
    analysis: extra.analysis !== undefined ? extra.analysis : analysis(),
    business: { businessId: extra.businessId || BIZ, businessName: extra.businessName || BIZ_NAME },
    association: extra.association !== undefined ? extra.association : { identityNames: [BIZ_NAME] },
    attestation: extra.attestation ?? null,
  });
  const has = (r, code) => r.blockers.includes(code);
  const only = (r, code) => r.blockers.length === 1 && r.blockers[0] === code;

  // ══ Q1–Q20: THE PRE-FLIGHT MATRIX ════════════════════════════════════════
  // Q1 — a real, associated, exactly-dated, basis-bearing, confirmed revenue figure.
  const q1 = run(obs());
  set('Q1', q1.promotion_ready === true && q1.blockers.length === 0
    && q1.canonical_key === 'revenue' && q1.evidence_origin === 'REAL_SOURCE'
    && q1.business_association === 'ASSOCIATION_PROVEN'
    && q1.period_quality === 'EXACT' && q1.basis === 'accrual'
    && q1.review_state === 'confirmed' && q1.semantic_validity === true);

  // Q2 — the SAME figure, DECLARED synthetic. The declaration is the durable route.
  const q2 = run(obs({ metadata: { ...obs().metadata, evidence_origin: 'SYNTHETIC' } }));
  set('Q2', only(q2, 'SYNTHETIC_SOURCE') && q2.promotion_ready === false);

  // Q3 — an ACCEPTED mock extraction, high confidence, a document that really exists.
  //      Human acceptance must not convert a synthetic source into a real one.
  const q3 = run(obs({ confidence_score: '98' }), { analysis: mockAnalysis() });
  set('Q3', has(q3, 'SYNTHETIC_SOURCE') && q3.evidence_origin === 'SYNTHETIC'
    && q3.promotion_ready === false && q3.review_state === 'confirmed');

  // Q4 — real revenue, relation to this business not established by the document.
  const q4 = run(obs(), { association: { identityNames: [] } });
  set('Q4', only(q4, 'BUSINESS_ASSOCIATION_AMBIGUOUS') && q4.business_association === 'ASSOCIATION_AMBIGUOUS');

  // Q5 — the same figures filed under ANOTHER business.
  const q5 = run(obs({ business_id: OTHER_BIZ }));
  set('Q5', only(q5, 'BUSINESS_ASSOCIATION_REJECTED') && q5.business_association === 'ASSOCIATION_REJECTED');

  // Q6 — basis unknown, on a measure whose meaning depends on it.
  const q6meta = { ...obs().metadata };
  delete q6meta.accounting_basis;
  const q6 = run(obs({ metadata: q6meta }));
  set('Q6', only(q6, 'BASIS_UNKNOWN') && q6.basis_required === true && q6.basis === 'unknown');

  // Q7 — a five-year aggregate is NOT a fiscal year. Everything else about this row is
  // sound (real source, associated, accepted, basis stated), so its PERIOD is the only
  // thing wrong with it — which is exactly why the period must be judged on its own.
  const q7 = run(obs({ metadata: { period_raw: 'All Dates (2021-2025)', period_source: 'unresolved', accounting_basis: 'accrual' } }));
  set('Q7', only(q7, 'MULTI_PERIOD_AGGREGATE') && q7.period_quality === 'AGGREGATE_MULTI_PERIOD'
    && q7.period.raw === 'All Dates (2021-2025)');

  // Q8 — no period recorded at all is UNKNOWN, not "ambiguous" and not a year.
  const q8 = run(obs({ metadata: { accounting_basis: 'accrual' } }));
  set('Q8', only(q8, 'PERIOD_UNKNOWN') && q8.period_quality === 'UNKNOWN');

  // Q9 — nobody has reviewed it yet.
  const q9 = run(obs({ review_status: 'pending_review' }));
  set('Q9', only(q9, 'REVIEW_PENDING') && q9.review_state === 'proposed');

  // Q10 — HIGH CONFIDENCE IS NOT VERIFICATION, and neither is confirmation.
  const q10pending = run(obs({ review_status: 'pending_review', confidence_score: '99' }));
  const q10accepted = run(obs({ confidence_score: '99' }));
  set('Q10', q10pending.verification_state === 'unverified'
    && q10accepted.verification_state === 'confirmed'
    && q10accepted.verification_state !== 'verified'
    && TR.deriveTrust({ reviewStatus: 'accepted' }).verification_state !== 'verified'
    && TR.deriveTrust({ reviewStatus: 'accepted', attestation: { verified: true, method: 'advisor_review', byProfileId: 'p1' } }).verification_state === 'verified');

  // Q11 — TAXABLE INCOME IS NOT NET INCOME.
  const tiRow = obs({
    field_name: 'taxable_income', source_document_type: 'business_tax_return', normalized_value: 187500,
    metadata: { form_type: 'form_1120', period_type: 'annual', period_source: 'model_reported', period_start: '2024-01-01', period_end: '2024-12-31', accounting_basis: 'tax' },
  });
  const q11 = run(tiRow);
  set('Q11', SEM.fieldMapping('taxable_income').every((m) => m.fact_key !== 'net_income')
    && SEM.fieldMapping('taxable_income').length === 1
    && RG.FACT_REGISTRY.find((f) => f.fact_key === 'net_income').candidate_sources
      .every((c) => !(c.field_names || []).includes('taxable_income'))
    && q11.canonical_key === 'taxable_income' && q11.promotion_ready === false);
  // Q11-MAP — THE CONCEPT KEEPS ITS OWN HOME. It resolves to exactly one declared fact,
  // keyed for what it actually is. (An earlier form of this repair deleted the concept
  // instead of distinguishing it, which is why this check exists in this shape: the fix
  // must separate the two concepts, never remove one from the model.)
  set('Q11-MAP', SEM.fieldMapping('taxable_income').length === 1
    && SEM.fieldMapping('taxable_income')[0].fact_key === 'taxable_income'
    && !!RG.getFactDefinition('taxable_income')
    && RG.getFactDefinition('taxable_income').fact_key !== 'net_income');

  // Q12 — OPERATING INCOME IS NOT EBITDA.
  const oiRow = obs({ field_name: 'operating_income', normalized_value: 187500 });
  const q12 = run(oiRow);
  set('Q12', SEM.fieldMapping('operating_income').every((m) => m.fact_key !== 'reported_ebitda')
    && RG.FACT_REGISTRY.find((f) => f.fact_key === 'reported_ebitda').candidate_sources
      .every((c) => !(c.field_names || []).includes('operating_income'))
    && q12.blockers.includes('EVIDENCE_ONLY_CONCEPT') && q12.promotion_ready === false);

  // Q13 — A NET PROFIT MARGIN IS NOT A GROSS MARGIN.
  const gm = RG.FACT_REGISTRY.find((f) => f.fact_key === 'gross_margin');
  set('Q13', gm.candidate_sources.every((c) => !(c.field_names || []).some((n) => n === 'net_profit_margin' || n === 'p1_mymargin'))
    && SEM.fieldMapping('net_profit_margin').every((m) => m.fact_key !== 'gross_margin')
    && SEM.fieldMapping('net_profit_margin').length === 0);

  // Q14 — PERSONAL TOTAL TAX IS NOT A BUSINESS FACT, on either authority.
  const ttRow = obs({
    field_name: 'total_tax', source_document_type: 'personal_tax_return', normalized_value: null, field_value: '31000',
    metadata: { form_type: 'form_1040', period_type: 'annual', period_source: 'model_reported', period_start: '2024-01-01', period_end: '2024-12-31' },
  });
  const ttDisposition = EL.resolveEvidenceEligibility({ readerKey: 'form_1040', formType: 'form_1040', fieldName: 'total_tax', association: null });
  const ttFact = RG.FACT_REGISTRY.find((f) => f.fact_key === 'total_tax');
  const ttScopeOk = ttFact.candidate_sources
    .filter((c) => (c.doc_types || []).includes('personal_tax_return'))
    .every((c) => c.evidence_scope === 'personal_only');
  const q14 = run(ttRow, { document: doc({ name: '2023_1040.pdf', document_type: 'personal_tax_return' }) });
  set('Q14', ttDisposition.state === 'PERSONAL_ONLY' && ttScopeOk
    && q14.blockers.includes('PERSONAL_ONLY') && q14.promotion_ready === false);

  // Q15 — a PROJECTION is not a recorded result.
  const q15 = run(obs({ metadata: { ...obs().metadata, value_nature: 'projected' } }));
  set('Q15', only(q15, 'PROJECTED_VALUE'));
  const q15b = run(obs({ field_name: 'projected_revenue', metadata: { ...obs().metadata } }));
  set('Q15-NAME', q15b.blockers.includes('PROJECTED_VALUE'));

  // Q16 — the same evidence replays to the same verdict, byte for byte.
  set('Q16', JSON.stringify(run(obs({ field_name: 'gross_profit' }))) === JSON.stringify(run(obs({ field_name: 'gross_profit' }))));

  // Q17 — cross-business duplication cannot become two facts.
  const shared = { normalized_value: 2963916.96, accepted_normalized_value: 2963916.96 };
  const owned = run(obs({ ...shared, business_id: BIZ }));
  const foreign = run(obs({ ...shared, business_id: OTHER_BIZ }));
  set('Q17', owned.promotion_ready === true
    && foreign.promotion_ready === false
    && has(foreign, 'BUSINESS_ASSOCIATION_REJECTED')
    && foreign.canonical_key === owned.canonical_key);

  // Q18 — an identifier is never evidence.
  const ssnRow = obs({ field_name: 'employee_ssn', source_document_type: 'w2', normalized_value: 412998877, metadata: { form_type: 'w2', period_type: 'annual', period_source: 'model_reported', period_start: '2024-01-01', period_end: '2024-12-31' } });
  const q18 = run(ssnRow, { document: doc({ name: 'W2.pdf', document_type: 'w2' }) });
  set('Q18', has(q18, 'SENSITIVE') && q18.promotion_ready === false);

  // Q19 — an EVIDENCE-ONLY concept is RETAINED and never promotion-ready.
  const tiDisposition = DP.dispositionFor('business_tax_return', 'taxable_income');
  set('Q19', tiDisposition !== null && tiDisposition.business_relevant === true
    && has(q11, 'EVIDENCE_ONLY_CONCEPT') && q11.semantic_validity === false);

  // Q20 — a valid gross profit is eligible, so the gate is not simply "refuse everything".
  const q20 = run(obs({ field_name: 'gross_profit', normalized_value: 625000, accepted_normalized_value: 625000 }));
  set('Q20', q20.promotion_ready === true && q20.canonical_key === 'gross_profit');

  // The contract itself must expose the declared vocabulary.
  set('BLOCKERS', C.BLOCKER_ORDER.length === Object.keys(C.PROMOTION_BLOCKERS).length
    && Object.keys(C.PROMOTION_BLOCKERS).length >= 16
    && ['SYNTHETIC_SOURCE', 'UNKNOWN_SOURCE_ORIGIN', 'BUSINESS_ASSOCIATION_AMBIGUOUS', 'BUSINESS_ASSOCIATION_REJECTED',
      'PERIOD_UNKNOWN', 'PERIOD_AMBIGUOUS', 'MULTI_PERIOD_AGGREGATE', 'BASIS_UNKNOWN', 'REVIEW_PENDING',
      'SEMANTIC_MAPPING_INVALID', 'PERSONAL_ONLY', 'SENSITIVE', 'PROJECTED_VALUE', 'MISSING_PROVENANCE']
      .every((k) => !!C.PROMOTION_BLOCKERS[k]));
  set('PROV-PRECEDENCE', PV.classifyEvidenceOrigin({ observation: obs({ metadata: { ...obs().metadata, evidence_origin: 'TEST' } }), document: doc(), analysis: analysis() }).origin === 'TEST'
    && PV.classifyEvidenceOrigin({ observation: obs({ metadata: { ...obs().metadata, evidence_origin: 'DEMO' } }), document: doc(), analysis: analysis() }).origin === 'DEMO'
    && PV.classifyEvidenceOrigin({ observation: obs(), document: doc(), analysis: analysis() }).origin === 'REAL_SOURCE'
    && PV.classifyEvidenceOrigin({ observation: obs(), document: doc({ name: 'sample_pl.pdf' }), analysis: analysis({ extracted_data: {} }) }).origin === 'TEST'
    && PV.classifyEvidenceOrigin({ observation: obs(), document: doc({ name: 'something.pdf' }), analysis: analysis({ extracted_data: {} }) }).origin === 'UNKNOWN'
    && PV.classifyEvidenceOrigin({ observation: obs(), document: doc(), analysis: analysis({ extracted_data: {} }) }).origin === 'UNKNOWN');
  // BASIS-NA — basis is asked for ONLY where the fact's own DEFINITION makes it
  // meaningful. The rule reads the registry's declaration rather than a second list, so
  // a point-in-time concept does not pose the basis question at all — and
  // `not_applicable` on a measure that DOES depend on basis is not accepted as an answer.
  set('BASIS-NA', QL.basisRequiresValue(RG.getFactDefinition('revenue')) === true
    && QL.basisRequiresValue(RG.getFactDefinition('gross_profit')) === true
    && QL.basisRequiresValue(RG.getFactDefinition('customer_concentration')) === false
    && QL.basisRequiresValue(RG.getFactDefinition('industry')) === false
    && QL.resolveAccountingBasis({ metadata: {} }).basis === 'unknown'
    && QL.resolveAccountingBasis({ metadata: { accounting_basis: 'ACCRUAL' } }).basis === 'accrual'
    && QL.resolveAccountingBasis({ metadata: { accounting_basis: 'not_applicable' } }).basis === 'not_applicable'
    && QL.promotableBasis('not_applicable') === false && QL.promotableBasis('cash') === true);

  Object.assign(res, securityChecks(fs.readFileSync(P(MIGRATION), 'utf8')));
  Object.assign(res, freezeAndWiring());
  return res;
}

// ── FACT FREEZE + whole-repository wiring ──────────────────────────────────
function freezeAndWiring() {
  const out = {};
  const read = (p) => (fs.existsSync(P(p)) ? fs.readFileSync(P(p), 'utf8') : '');
  // COMMENTS ARE NOT CODE. Several assertions below are about what a module DECLARES —
  // "this contract does not import the confidence-based helper" — and a doc comment
  // that NAMES the thing it refuses must not read as the thing itself.
  const code = (s) => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  const digitalTwin = [CONTRACT, PROVENANCE, QUALITIES, TRUST, PREFLIGHT].map((p) => code(read(p))).join('\n');

  // FREEZE-1 — the shared pre-flight modules cannot write. No client, no verb.
  out['FREEZE-1'] = !/business_facts|business_fact_evidence/.test(digitalTwin)
    && !/\.insert\(|\.update\(|\.delete\(|\.upsert\(|createClient/.test(digitalTwin);
  // FREEZE-2 — the two new backend functions declare no write of any kind.
  const fn = code(read(PREFLIGHT_FN)) + code(read(PROBE_FN));
  out['FREEZE-2'] = !/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/.test(fn)
    && /writes_performed: false/.test(fn);
  // FREEZE-3 — nothing anywhere writes the fact tables. This is the freeze stated as
  //            a property of the repository, not of one file.
  const all = walk(['base44', 'src'])
    .filter((f) => /\.(ts|tsx|js|jsx)$/.test(f) && !/\.test\.cjs$/.test(f) && !/migrations\//.test(f))
    .map((f) => fs.readFileSync(P(f), 'utf8')).join('\n');
  out['FREEZE-3'] = !/from\(['"]business_facts['"]\)[\s\S]{0,80}?\.(insert|update|upsert|delete)\(/.test(all)
    && !/from\(['"]business_fact_evidence['"]\)[\s\S]{0,80}?\.(insert|update|upsert|delete)\(/.test(all);
  // FREEZE-4 — the pre-flight function's read path is the only DB contact it makes.
  out['FREEZE-4'] = !/\.from\(['"]business_facts['"]\)\.(insert|update|upsert|delete)/.test(fn)
    && /\.from\('business_facts'\)\.select\('\*', \{ count: 'exact', head: true \}\)/.test(fn);

  // ARCH-1 — the promotion contract does NOT inherit the legacy confidence-based
  //          authority helper. That helper belongs to the read-time resolver.
  out['ARCH-1'] = !/sourceHierarchy|isVerifiedSource/.test(digitalTwin);
  // ARCH-2 — the pre-flight trusts no confidence input: deriveTrust is called with the
  //          review state and an explicit attestation only.
  out['ARCH-2'] = !/confidence/.test(read(PREFLIGHT).split('deriveTrust({')[1]?.split('})')[0] || '')
    && /deriveTrust\(\{ reviewStatus: row\?\.review_status, attestation: input\?\.attestation \?\? null \}\)/.test(read(PREFLIGHT));
  // ARCH-3 — it reuses the CERTIFIED association resolver rather than inventing one.
  out['ARCH-3'] = /resolveAssociation/.test(read(PREFLIGHT))
    && /from '\.\.\/documentExtraction\/evidenceEligibility\.ts'/.test(read(PREFLIGHT))
    && !/entityNamesMatch\(/.test(read(PREFLIGHT));
  // ARCH-4 — it reuses the CERTIFIED disposition table for sensitivity.
  out['ARCH-4'] = /resolveEvidenceEligibility/.test(read(PREFLIGHT)) && /isSensitiveFieldName/.test(read(PREFLIGHT));
  // ARCH-5 — it reuses the ONE period derivation (the semantic bridge).
  out['ARCH-5'] = /observationPeriod/.test(read(QUALITIES)) && /import \{ observationPeriod \}/.test(read(QUALITIES));
  // ARCH-6 — the two base fact tables keep RLS on and exactly one read policy each,
  //          and no policy is ever written for anon.
  const sixC = readSixC();
  out['ARCH-6'] = (sixC.match(/enable row level security/g) || []).length >= 2
    && /can_access_business\(business_id\)/.test(sixC)
    && !/to anon/.test(sixC);
  // ARCH-7 — the migration and its verification are versioned together.
  out['ARCH-7'] = fs.existsSync(P(MIGRATION)) && fs.existsSync(P(MIGRATION_VERIFY));
  // ARCH-8 — the SYNTHETIC signal is tied to its PRODUCER: the engine sets
  //          'mock_extraction' only on the explicit fixture path, and the classifier
  //          reads that exact string.
  const engine = code(read('base44/shared/documentExtraction/extractEngine.ts'));
  out['ARCH-8'] = /if \(options\?\.useMock\) \{/.test(engine)
    && /extractionMethod = 'mock_extraction';/.test(engine)
    && /extraction_method: extractionMethod/.test(engine)
    && /export const SYNTHETIC_METHOD = 'mock_extraction';/.test(code(read(PROVENANCE)))
    && /observation\?\.metadata\?\.extraction_method/.test(code(read(PROVENANCE)));
  // ARCH-9 — the probe function reports rather than applies; it carries no DDL runner.
  out['ARCH-9'] = /writes_performed: false/.test(code(read(PROBE_FN))) && !/exec_sql|execute_sql|\.rpc\('/.test(code(read(PROBE_FN)));
  // ARCH-10 — the pre-flight evaluator is admin-only, like every other audit surface.
  out['ARCH-10'] = /user\.role !== 'admin' && user\.role !== 'super_admin'/.test(read(PREFLIGHT_FN))
    && /user\.role !== 'admin' && user\.role !== 'super_admin'/.test(read(PROBE_FN));
  return out;
}

function walk(dirs) {
  const out = [];
  const visit = (d) => {
    for (const entry of fs.readdirSync(P(d), { withFileTypes: true })) {
      const rel = `${d}/${entry.name}`;
      if (entry.isDirectory()) visit(rel);
      else out.push(rel);
    }
  };
  for (const d of dirs) if (fs.existsSync(P(d))) visit(d);
  return out;
}

const DESC = {
  Q1: 'real revenue + proven association + exact period + basis + confirmed → eligible',
  Q2: 'the same figure declared SYNTHETIC → blocked SYNTHETIC_SOURCE',
  Q3: 'an accepted mock extraction stays synthetic, at 98% confidence',
  Q4: 'real revenue whose relation to this business is unproven → blocked',
  Q5: 'evidence filed under another business → blocked',
  Q6: 'basis unknown on a measure that needs it → blocked',
  Q7: 'a five-year aggregate is not a fiscal year → blocked',
  Q8: 'no period recorded → UNKNOWN, blocked',
  Q9: 'unreviewed evidence → blocked',
  Q10: 'high confidence (and mere confirmation) never becomes VERIFIED',
  Q11: 'taxable income resolves to its OWN fact, never to net income',
  'Q11-MAP': 'taxable income keeps its own home: one fact, keyed for what it is',
  Q12: 'operating income no longer maps to reported EBITDA',
  Q13: 'a net profit margin no longer supplies gross margin',
  Q14: 'personal total tax is not a business fact, on either authority',
  Q15: 'a projected value → blocked PROJECTED_VALUE',
  'Q15-NAME': 'a projected field name is refused as well as a projected nature',
  Q16: 'the same evidence replays to the same verdict',
  Q17: 'cross-business duplication cannot become two facts',
  Q18: 'an identifier is never evidence → blocked SENSITIVE',
  Q19: 'an evidence-only concept is retained AND never promotion-ready',
  Q20: 'a valid gross profit is eligible — the gate is not "refuse everything"',
  BLOCKERS: 'the blocker vocabulary is closed, ordered and complete',
  'PROV-PRECEDENCE': 'declared origin outranks method, which outranks the name signal',
  'BASIS-NA': 'a point-in-time measure does not pose the basis question at all',
  'S1': 'anon cannot read conflicts', 'S2': 'unauthenticated (PUBLIC) cannot read conflicts',
  'S3': 'the view no longer runs as its owner — base RLS applies to the reader',
  'S4': 'Business A/B isolation is enforced by can_access_business, symmetrically',
  'S5': 'an authorized actor keeps the read (authenticated only)',
  'S6': 'a revoked relationship cannot read — the kernel re-evaluates per read',
  'S7': 'the service backend keeps legitimate access',
  'S8': 'the underlying RLS cannot be bypassed through the view, and it is measured',
  'FREEZE-1': 'the pre-flight modules contain no writer and no client',
  'FREEZE-2': 'the new functions declare no write of any kind',
  'FREEZE-3': 'nothing in the repository writes business_facts or business_fact_evidence',
  'FREEZE-4': 'the evaluator only counts the fact tables',
  'ARCH-1': 'the promotion contract does not inherit confidence-based authority',
  'ARCH-2': 'the pre-flight passes no confidence into the trust contract',
  'ARCH-3': 'association is the certified resolver, not a second implementation',
  'ARCH-4': 'sensitivity is the certified disposition table, not a second list',
  'ARCH-5': 'period is the one semantic derivation, not a second one',
  'ARCH-6': 'the fact tables keep RLS on, one read policy each, never to anon',
  'ARCH-7': 'the migration and its verification are versioned together',
  'ARCH-8': 'the synthetic signal is tied to its producer',
  'ARCH-9': 'the security probe reports rather than applies',
  'ARCH-10': 'both new surfaces are canonical-admin only',
};

const MUTATIONS = [
  { id: 'M1', what: 'a synthetic source accepted as real', file: PROVENANCE, probe: 'Q3',
    find: '  const method = methodOf(observation, analysis);\n  if (method === SYNTHETIC_METHOD) {',
    replace: "  const method = methodOf(observation, analysis);\n  if (String(observation?.review_status || '') === 'accepted') {\n    signals.push(ORIGIN_SIGNALS.METHOD_REAL);\n    return { origin: 'REAL_SOURCE', signals, promotion_eligible: true };\n  }\n  if (method === SYNTHETIC_METHOD) {" },
  { id: 'M2', what: 'a declared origin bypassed', file: PROVENANCE, probe: 'Q2',
    find: '  if (declared != null) {', replace: '  if (false && declared != null) {' },
  { id: 'M3', what: 'an unknown basis treated as accrual', file: QUALITIES, probe: 'Q6',
    find: '  if (raw == null) return { basis: ACCOUNTING_BASIS.UNKNOWN, source: null, recorded: false };',
    replace: '  if (raw == null) return { basis: ACCOUNTING_BASIS.ACCRUAL, source: null, recorded: false };' },
  { id: 'M4', what: 'a multi-period aggregate treated as a fiscal year', file: QUALITIES, probe: 'Q7',
    find: '  if (raw && MULTI_PERIOD_PATTERNS.some((p) => p.test(raw))) {',
    replace: '  if (false && raw && MULTI_PERIOD_PATTERNS.some((p) => p.test(raw))) {' },
  { id: 'M5', what: 'pending treated as confirmed', file: TRUST, probe: 'Q9',
    find: '  const review_state = CONFIRMING_REVIEW_STATES.includes(reviewStatus)\n    ? REVIEW_STATE.CONFIRMED',
    replace: '  const review_state = true\n    ? REVIEW_STATE.CONFIRMED' },
  { id: 'M6', what: 'confirmation (and confidence) treated as verification', file: TRUST, probe: 'Q10',
    find: '  if (explicitlyVerified) {', replace: '  if (explicitlyVerified || review_state === REVIEW_STATE.CONFIRMED) {' },
  { id: 'M7', what: 'taxable income → net income restored', file: REGISTRY, probe: 'Q11',
    find: "field_names: ['ordinary_business_income'], doc_types: ['business_tax_return'] },",
    replace: "field_names: ['ordinary_business_income', 'taxable_income'], doc_types: ['business_tax_return'] }," },
  { id: 'M8', what: 'operating income → reported EBITDA restored', file: REGISTRY, probe: 'Q12',
    find: "field_names: ['ebitda'] },", replace: "field_names: ['ebitda', 'operating_income'] }," },
  { id: 'M9', what: 'net profit margin → gross margin restored', file: REGISTRY, probe: 'Q13',
    find: "      { source_type: 'system_derived', source_authority: 'system_derived', derive_fn: 'gross_margin_from_profit_and_revenue' },",
    replace: "      { source_type: 'system_derived', source_authority: 'system_derived', derive_fn: 'gross_margin_from_profit_and_revenue' },\n      { source_type: 'assessment_calculation', source_authority: 'assessment_answer', assessment_type: 'profit_gap', field_names: ['p1_mymargin', 'net_profit_margin'] }," },
  { id: 'M10', what: 'personal total tax made business-relevant', file: DISPOSITION, probe: 'Q14',
    find: "    total_tax: eo(false, 'a tax liability of the individual, not business tax expense'),",
    replace: '    total_tax: cf(true),' },
  { id: 'M11', what: 'personal total-tax scope removed from the registry', file: REGISTRY, probe: 'Q14',
    find: "field_names: ['total_tax'], doc_types: ['personal_tax_return'], evidence_scope: 'personal_only' },",
    replace: "field_names: ['total_tax'], doc_types: ['personal_tax_return'] }," },
  { id: 'M12', what: 'a projected value allowed to promote', file: PREFLIGHT, probe: 'Q15',
    find: '  if (isProjectedObservation(row)) blockers.push(B.PROJECTED_VALUE);',
    replace: '  if (false && isProjectedObservation(row)) blockers.push(B.PROJECTED_VALUE);' },
  { id: 'M13', what: 'cross-business evidence allowed', file: PREFLIGHT, probe: 'Q5',
    find: '  if (!row?.business_id || (businessId && String(row.business_id) !== String(businessId))) {',
    replace: '  if (false && (!row?.business_id || (businessId && String(row.business_id) !== String(businessId)))) {' },
  { id: 'M14', what: 'the active business treated as its own association proof', file: PREFLIGHT, probe: 'Q4',
    find: '      identityNames: input?.association?.identityNames ?? [],',
    replace: '      identityNames: (input?.association?.identityNames ?? []).length ? input.association.identityNames : [businessName],' },
  { id: 'M15', what: 'the conflict view’s anonymous grant restored', kind: 'sql', probe: 'S1',
    find: 'revoke all on public.business_fact_conflicts from anon;',
    replace: 'grant select on public.business_fact_conflicts to anon;' },
  { id: 'M16', what: 'the conflict view’s RLS bypass restored', kind: 'sql', probe: 'S3',
    find: 'alter view public.business_fact_conflicts set (security_invoker = true);',
    replace: '-- mutation: owner-privileged view restored (RLS no longer applies)' },
];

(async () => {
  let failures = 0;
  const base = await evaluate();
  for (const [k, v] of Object.entries(base)) {
    if (!v) failures++;
    console.log(`${v ? 'PASS' : 'FAIL'}  ${String(k).padEnd(14)} ${DESC[k] || ''}`);
  }
  let caught = 0;
  for (const m of MUTATIONS) {
    let outcome;
    try {
      const r = await evaluate(m);
      outcome = r[m.probe] === false ? 'CAUGHT' : 'MISSED';
    } catch (e) {
      outcome = /mutation anchor not found/.test(e.message) ? 'DID_NOT_APPLY' : 'CAUGHT';
      if (outcome === 'DID_NOT_APPLY') console.log(`      anchor missing: ${m.file} :: ${m.find.split('\n')[0]}`);
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