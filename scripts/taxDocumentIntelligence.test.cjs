/**
 * Phase 6D.0c.3 — TAX DOCUMENT LIFECYCLE INTELLIGENCE CERTIFICATION HARNESS.
 *
 * Offline, non-destructive, and behavioural wherever behaviour can be executed: it
 * bundles the REAL modules, runs the real functions on real-shaped fixtures, and then
 * attacks the real SOURCE with adversarial mutations, requiring every one to apply,
 * change behaviour, and be caught.
 *
 *   node scripts/taxDocumentIntelligence.test.cjs
 *
 * SECTIONS
 *   T1–T27    the certified regression (family model, readers, dispositions, page
 *             provenance, form questions, evidence-first answers)
 *   A1–A20    the AUTOMATIC RELEVANT-EVIDENCE POLICY (supersedes the retired
 *             scope-confirmation tests T28–T35)
 *   P1–P8     POSITIVE association: legitimate association must actually work
 *   NAME-1..10 entity-name matching, including the dangerous near-matches
 *   PROV-1..8 classifier-suggestion PROVENANCE (the suggestion cannot be manufactured)
 *   COV-1..5  reader → disposition coverage (no orphans, no alias fallthrough)
 *   PII-1..5  sentinel identifiers never reach any downstream surface
 *   COMPOUND-1..6  one multipage return: four forms, four page ranges, four verdicts
 *   GALILEO-1..8   the seven Galileo questions, and evidence-lane distinctness
 *   SRC-1..3  source association (no unrelated P&L in a W-2 answer)
 *   CONT-1..3 new-upload knowledge continuity, with no refresh of any kind
 *   S1–S10    whole-repository wiring
 *   M1–M18    the mutation battery (MISSED = 0, DID_NOT_APPLY = 0)
 */
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const P = (p) => path.join(ROOT, p);

const TAX_FORMS = 'base44/shared/documentUnderstanding/taxForms.ts';
const TAX_SCHEMAS = 'base44/shared/documentExtraction/taxSchemas.ts';
const DISPOSITION = 'base44/shared/documentExtraction/fieldDisposition.ts';
const ELIGIBILITY = 'base44/shared/documentExtraction/evidenceEligibility.ts';
const UNDERSTAND = 'base44/shared/documentUnderstanding/understandDocument.ts';
const PERSIST = 'base44/shared/documentUnderstanding/persist.ts';
const RETRY = 'base44/shared/documentIngestion/retry.ts';
const PROVISIONAL = 'base44/shared/galileo/provisionalEvidence.ts';
const SENSITIVE = 'base44/shared/galileo/sensitiveFields.ts';
const FORM_QUERY = 'base44/shared/galileo/answerEngine/formQuery.ts';
const PIPELINE = 'base44/shared/galileo/answerEngine/pipeline.ts';
const ONTOLOGY = 'base44/shared/galileo/answerEngine/ontology.ts';

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
      if (mutation) {
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
const BIZ_NAME = 'Apex Roofing LLC';
const DOC = 'doc-comp';
const PARENT = '2023_TaxReturn.pdf';

/** A row, as a reader persists it. */
const row = (o = {}) => ({
  id: 'ef-1', business_id: BIZ, document_id: DOC, field_name: 'f', normalized_value: 0,
  review_status: 'pending_review', source_document_type: 'other', metadata: {}, ...o,
});

const w2Row = (o = {}) => row({
  id: 'ef-w2-1', document_id: 'doc-1040', field_name: 'wages_tips_other_compensation',
  normalized_value: 85000, source_document_type: 'w2', metadata: { form_type: 'w2', fiscal_year: 2023 }, ...o,
});

/** The Profit & Loss figure that must NEVER answer a W-2 question. */
const plRow = () => row({
  id: 'ef-pl-1', document_id: 'doc-pl', field_name: 'annual_revenue', normalized_value: 1250000,
  source_document_type: 'profit_and_loss', metadata: { fiscal_year: 2023 },
});

// A form starts on a page. The persisted section shape the engine reads.
const SECTION_1040 = { form_type: 'form_1040', form_label: 'Form 1040', tax_year: 2023, page_start: 1, page_end: 6 };
const SECTION_SCHED_C = { form_type: 'schedule_c', form_label: 'Schedule C', tax_year: 2023, page_start: 7, page_end: 9 };
const SECTION_W2 = { form_type: 'w2', form_label: 'W-2', tax_year: 2023, page_start: 10, page_end: 11 };
const SECTION_K1 = { form_type: 'k1', form_label: 'Schedule K-1', tax_year: 2023, page_start: 12, page_end: 13 };
const SECTIONS = [SECTION_1040, SECTION_SCHED_C, SECTION_W2, SECTION_K1];

// Sentinel identifier VALUES. Not field names — values. They are planted in rows and
// then hunted across every downstream surface.
const SSN = '412-99-8877';
const EIN = '81-2345678';
const TIN = '93-1234567';
const ITIN = '900-70-1234';
const DOB = '1975-04-02';
const SENTINELS = [SSN, EIN, TIN, ITIN, DOB];

const piiRows = () => [
  row({ id: 'ef-pii-1', field_name: 'employee_ssn', normalized_value: SSN, raw_value: SSN, metadata: { form_type: 'w2', fiscal_year: 2023 } }),
  row({ id: 'ef-pii-2', field_name: 'employer_ein', normalized_value: EIN, raw_value: EIN, metadata: { form_type: 'w2', fiscal_year: 2023 } }),
  row({ id: 'ef-pii-3', field_name: 'recipient_tin', normalized_value: TIN, raw_value: TIN, metadata: { form_type: 'form_1099', fiscal_year: 2023 } }),
  row({ id: 'ef-pii-4', field_name: 'taxpayer_itin', normalized_value: ITIN, raw_value: ITIN, metadata: { form_type: 'form_1040', fiscal_year: 2023 } }),
  row({ id: 'ef-pii-5', field_name: 'date_of_birth', normalized_value: DOB, raw_value: DOB, metadata: { form_type: 'form_1040', fiscal_year: 2023 } }),
];

/** A stateful in-memory Supabase stand-in. */
function sandbox({ analysis = null, doc = {} } = {}) {
  const state = {
    analysis: analysis ? { ...analysis } : null,
    doc: { id: DOC, name: PARENT, document_type: 'personal_tax_return', business_id: BIZ, profile_id: 'p1', upload_status: 'needs_review', ...doc },
    writes: [],
  };
  const table = (t) => {
    const q = {
      select: () => q, eq: () => q, order: () => q, limit: () => q, in: () => q, or: () => q,
      maybeSingle: async () => ({ data: t === 'documents' ? state.doc : state.analysis, error: null }),
      single: async () => ({ data: t === 'documents' ? state.doc : state.analysis, error: null }),
      update: (patch) => { state.writes.push({ table: t, patch }); if (t === 'documents') state.doc = { ...state.doc, ...patch }; if (t === 'document_analysis' && state.analysis) state.analysis = { ...state.analysis, ...patch }; return q; },
      insert: (patch) => { state.writes.push({ table: t, patch, insert: true }); return q; },
      delete: () => { state.writes.push({ table: t, delete: true }); return q; },
    };
    return q;
  };
  return { sb: { from: table }, state };
}

const analysisRow = (o = {}) => ({ id: 'an-1', document_id: DOC, analysis_status: 'needs_review', extracted_data: {}, ...o });

// ── The assertion matrix ────────────────────────────────────────────────────
async function evaluate(mutation = null) {
  const F = await load(TAX_FORMS, mutation);
  const S = await load(TAX_SCHEMAS, mutation);
  const D = await load(DISPOSITION, mutation);
  const E = await load(ELIGIBILITY, mutation);
  const U = await load(UNDERSTAND, mutation);
  const PZ = await load(PERSIST, mutation);
  const R = await load(RETRY, mutation);
  const PV = await load(PROVISIONAL, mutation);
  const SF = await load(SENSITIVE, mutation);
  const Q = await load(FORM_QUERY, mutation);
  const PL = await load(PIPELINE, mutation);
  const O = await load(ONTOLOGY, mutation);

  const res = {};
  const set = (k, v) => { res[k] = !!v; };
  const verdict = (readerKey, formType, fieldName, association) =>
    E.resolveEvidenceEligibility({ readerKey, formType, fieldName, association });
  const stateOf = (readerKey, formType, fieldName, association) => verdict(readerKey, formType, fieldName, association).state;
  const inBusinessLane = (r) => PV.rowExcludedByEligibility(r) === false;
  const outOfBusinessLane = (r) => PV.rowExcludedByEligibility(r) === true;
  const stamp = (r, v) => ({ ...r, metadata: { ...(r.metadata || {}), evidence_eligibility: { state: v.state, reason: v.reason, association_supported: v.association_supported } } });
  // AN EVIDENCE-LANE CALL THAT FAILS IS A FAILURE, NOT A CRASH AND NOT A SILENT PASS.
  // The wrappers always return an array so every assertion is still evaluated, and the
  // error is recorded and reported as its own check (ERROR-EVIDENCE-LANE) — so a lane
  // that cannot be reached fails the run rather than quietly reading as empty.
  const provErrors = [];
  const prov = (rows, biz = BIZ) => {
    try { const r = PV.buildProvisionalEvidence(rows, biz); if (Array.isArray(r)) return r; provErrors.push('non_array'); }
    catch (e) { provErrors.push(String(e.message).split('\n')[0]); }
    return [];
  };
  const provRows = (rows, biz = BIZ) => {
    try { const r = PV.provisionalRowsForBusiness(rows, biz); if (Array.isArray(r)) return r; provErrors.push('rows_non_array'); }
    catch (e) { provErrors.push(String(e.message).split('\n')[0]); }
    return [];
  };

  // ══ T1–T27: THE CERTIFIED REGRESSION ══════════════════════════════════════
  const FAMILIES = ['w2', 'form_1040', 'form_1120', 'form_1120s', 'form_1065', 'k1', 'form_1099'];
  set('T1', FAMILIES.every((f) => F.FORM_TYPES[f] && F.formLabel(f)));
  set('T2', F.readerKeyForForm('w2') !== F.readerKeyForForm('form_1040')
    && F.formLabel('w2') !== F.formLabel('form_1065')
    && F.isRecognizedForm('w2') && !F.isRecognizedForm('form_8275'));

  const READABLE = ['form_1040', 'w2', 'form_1120', 'form_1120s', 'form_1065'];
  set('T4', READABLE.every((f) => F.isRecognizedForm(f) && S.fieldsForForm(f).length > 0)
    && F.readerKeyForForm('w2') !== null);
  set('T5', S.fieldsForForm('w2').some((f) => f.name === 'wages_tips_other_compensation')
    && S.fieldsForForm('form_1040').some((f) => f.name === 'total_tax')
    && S.fieldsForForm('form_1120').some((f) => f.name === 'gross_receipts')
    && S.fieldsForForm('form_1065').some((f) => f.name === 'guaranteed_payments'));
  set('T6', !S.SUBTYPE_READERS.form_8275 && !S.SUBTYPE_READERS.other
    && D.dispositionFor('schedule_c', 'gross_receipts').disposition === 'CANONICAL_FACT'
    && D.dispositionFor('schedule_e', 'passive_income').disposition === 'EVIDENCE_ONLY'
    && D.isSensitiveField('k1', 'partner_ssn') === true
    && D.dispositionFor('form_1040', 'total_tax')?.disposition === 'EVIDENCE_ONLY'
    && D.isSensitiveField('form_1099_nec', 'recipient_tin') === true);

  const orphans = D.orphanFields(S.SUBTYPE_READERS);
  set('T7', Array.isArray(orphans) && orphans.length === 0);
  set('T8', D.dispositionFor('w2', 'wages_tips_other_compensation')?.disposition === 'EVIDENCE_ONLY'
    && D.dispositionFor('business_tax_return', 'gross_receipts')?.disposition === 'CANONICAL_FACT');
  set('T9', D.isSensitiveField('w2', 'employee_ssn') === true
    && D.isSensitiveField('w2', 'wages_tips_other_compensation') === false
    && D.businessEligible('personal_tax_return', 'taxable_income') === false
    && D.businessEligible('business_tax_return', 'gross_receipts') === true);

  const sections = [SECTION_1040, SECTION_W2];
  set('T10', F.resolveFieldSourcePage('w2', sections) === 10);
  set('T11', F.resolveFieldSourcePage('w2', []) === null
    && F.pageProvenanceFor(null) === 'unknown'
    && F.pageProvenanceFor(7) === 'form_section');
  set('T12', F.pageProvenanceFor(F.resolveFieldSourcePage('w2', sections)) === 'form_section'
    && /W-2/.test(String(F.formSectionsSummary(sections))));

  const q = Q.resolveFormQuery('What was my W-2 for 2023');
  set('T13', q && q.kind === 'form' && q.form_type === 'w2' && q.year === 2023);
  set('T14', Q.resolveFormQuery('how did my 1065 do')?.form_type === 'form_1065'
    && Q.resolveFormQuery('what did my 1120-S report')?.form_type === 'form_1120s');
  set('T15', Q.resolveFormQuery('what was my revenue') === null);
  set('T16', Q.resolveFormQuery('what is in my tax return')?.kind === 'return_summary');
  const onto = O.resolveRequestedConcept('What was my W-2 for 2023', {});
  const incomeish = (x) => ['revenue', 'gross_receipts', 'annual_revenue', 'net_income'].includes(x);
  set('T17', !incomeish(onto?.concept) && !incomeish(onto?.requested_concept)
    && !(onto?.intent === 'historical_metric' && incomeish(onto?.concept)));

  const prep = (rows, question = 'What was my W-2 for 2023', extra = {}) => PL.prepareEvidenceFirstAnswer({
    question, businessId: BIZ, access: { businessId: BIZ, granted: true },
    fieldRows: rows, documents: [{ id: DOC, name: PARENT }],
    formSections: sections, recommendations: [], assessments: [], ...extra,
  });
  const finalize = (response, prepared) => PL.finalizeEvidenceFirstAnswer(response, prepared);
  const withW2 = prep([w2Row(), plRow()]);
  const fin = finalize({ answer: 'The return shows a healthy year.', recommended_next_step: 'Gather your W-2', missing_data: ['W-2'] }, withW2);
  const ans = String(fin.answer || '');
  set('T18', !!withW2.contract && withW2.contract.resolution_state === 'PROVISIONAL' && ans.includes('$85,000'));
  set('T19', !ans.includes('1,250,000') && !ans.includes('1250000'));
  set('T20', fin.evidence_state === 'document_evidence' && !/\bverified\b/i.test(ans));
  set('T21', !/gather|provide/i.test(String(fin.recommended_next_step || '')) && (fin.missing_data || []).length === 0);
  set('T22', (withW2.contract.known_concepts || []).includes('wages_tips_other_compensation'));
  const vals = (ans.match(/\$[\d,]+(?:\.\d+)?/g) || []).map((v) => Number(v.replace(/[^0-9.]/g, '')));
  set('T23', vals.every((v) => v === 85000) && vals.length > 0);
  set('T24', (withW2.contract.sources || []).every((s) => s.text && s.text.length > 0));

  const noW2 = prep([row({ id: 'ef-1040-tt', field_name: 'total_tax', normalized_value: 31000, source_document_type: 'form_1040', metadata: { form_type: 'form_1040', fiscal_year: 2023 } })]);
  const noW2Fin = finalize({ answer: '', missing_data: [] }, noW2);
  set('T25', noW2.contract.resolution_state === 'RELATED_ONLY'
    && !/\$1,250,000/.test(String(noW2Fin.answer)) && /W-2/i.test(String(noW2Fin.answer)));

  const none = prep([], 'What was my W-2 for 2023', { formSections: [] });
  set('T26', none.contract?.resolution_state === 'UNAVAILABLE'
    && /document|upload/i.test(String(none.contract?.next_step?.text || '')));
  const recognizedOnly = prep([], 'What was my W-2 for 2023', { formSections: sections });
  set('T27', ['RELATED_ONLY', 'UNAVAILABLE'].includes(recognizedOnly.contract?.resolution_state)
    && !/\$/.test(String(recognizedOnly.contract?.answer_text)));

  // ══ A1–A20: AUTOMATIC RELEVANT-EVIDENCE POLICY ════════════════════════════
  // The REAL classification service, on the real path: a personal 1040 declared
  // while a business is active.
  const declared1040 = await U.understandDocument({
    documentId: DOC, fileName: PARENT, mimeType: 'application/pdf',
    declaredType: 'personal_tax_return', businessId: BIZ, candidateBusinesses: [],
  });
  set('A1', declared1040.route_extraction === true
    && declared1040.requires_confirmation === false
    && declared1040.confidence_band === 'high');
  set('A2', declared1040.document_type === 'personal_tax_return'
    && declared1040.applied_document_type === 'personal_tax_return');
  set('A3', declared1040.semantic_scope === 'personal' && declared1040.scope_mismatch === true);

  // A4 — durable extraction runs automatically, through the durable path only.
  const durable = sandbox({ analysis: analysisRow({ analysis_status: 'needs_review' }) });
  let durableResumes = 0;
  const durableRetry = await R.retryDocumentIngestion({
    sb: durable.sb, documentId: DOC, authorizeDocument: () => ({ authorized: true }),
    resume: async () => { durableResumes++; return { ok: true, outcome: 'resumed' }; },
  });
  const patch = PZ.buildDocumentPatch(declared1040, {});
  set('A4', durableRetry.ok === true && durableResumes === 1
    && declared1040.route_extraction === true && !!patch.document_type
    && !('document_scope' in patch) && !('business_id' in patch));

  // A5 — safe fields persist; scope/identity are never rewritten by extraction.
  const schemaJson = JSON.stringify(S.buildTaxDocumentSchema(['form_1040', 'w2', 'k1', 'schedule_c', 'business_tax_return']) || {});
  set('A5', PZ.ALLOWED_DOCUMENT_PATCH_KEYS.every((k) => !['document_scope', 'business_id', 'profile_id'].includes(k))
    && patch.upload_status !== 'needs_review'
    && schemaJson.includes('wages_tips_other_compensation') && schemaJson.includes('total_tax')
    && !/employee_ssn|employer_ein|recipient_tin|taxpayer_itin/.test(schemaJson));

  // A6 — sensitive fields excluded, at every guard.
  const idPattern = /(^|_)(ssn|ein|tin|itin|dob)(_|$)/i;
  const schemaIdentityFields = Object.keys(S.SUBTYPE_READERS)
    .flatMap((k) => S.fieldsForForm(k).map((f) => `${k}.${f.name}`))
    .filter((n) => idPattern.test(n.split('.').pop()));
  set('A6', schemaIdentityFields.length === 0
    && schemaIdentityFields.length === 0
    && piiRows().every((r) => stateOf('w2', r.metadata.form_type, r.field_name, null) === 'SENSITIVE'
      || stateOf(r.metadata.form_type, r.metadata.form_type, r.field_name, null) === 'SENSITIVE'
      || SF.isSensitiveFieldName(r.field_name) === true)
    && piiRows().every((r) => outOfBusinessLane(r)));

  // A7 — business-relevant evidence with document support becomes eligible.
  const assocMatch = E.resolveAssociation({ businessId: BIZ, businessName: BIZ_NAME, identityNames: [BIZ_NAME], classificationSuggestedBusinessId: null });
  const schedVerdict = verdict('schedule_c', 'schedule_c', 'net_profit', assocMatch);
  set('A7', schedVerdict.state === 'BUSINESS_RELEVANT' && E.isBusinessEligible(schedVerdict) === true
    && inBusinessLane(stamp(row({ field_name: 'net_profit', normalized_value: 180000 }), schedVerdict)));

  // A8 — personal-only evidence never becomes business evidence.
  const personalVerdict = verdict('personal_tax_return', 'form_1040', 'taxable_income', assocMatch);
  const personalStamped = stamp(row({ field_name: 'taxable_income', normalized_value: 210000 }), personalVerdict);
  set('A8', personalVerdict.state === 'PERSONAL_ONLY' && outOfBusinessLane(personalStamped)
    && prov([personalStamped], BIZ).length === 0
    && prov([plRow()], BIZ).length === 1); // a pre-policy row is not re-judged

  // A9 — an unsupported relationship is AMBIGUOUS, never eligible.
  const assocContextOnly = E.resolveAssociation({ businessId: BIZ, businessName: BIZ_NAME, identityNames: [], classificationSuggestedBusinessId: null });
  set('A9', assocContextOnly.supported === false
    && stateOf('personal_tax_return', 'form_1040', 'qualified_business_income', assocContextOnly) === 'AMBIGUOUS'
    && E.isBusinessEligible(verdict('personal_tax_return', 'form_1040', 'qualified_business_income', assocContextOnly)) === false);

  // A10 — the active business alone is never proof.
  set('A10', assocContextOnly.supported === false && assocContextOnly.reason === 'no_relationship_evidence_in_the_document'
    && stateOf('w2', 'w2', 'wages_tips_other_compensation', assocContextOnly) === 'AMBIGUOUS'
    && stateOf('k1', 'k1', 'ordinary_business_income', assocContextOnly) === 'AMBIGUOUS'
    && E.entityNamesMatch('Apex Roofing', BIZ_NAME) === true);

  // A11 — pending evidence remains unverified.
  const w2MatchAssoc = E.resolveAssociation({ businessId: BIZ, businessName: BIZ_NAME, identityNames: ['Apex Roofing LLC'], classificationSuggestedBusinessId: null });
  const w2Eligible = stamp(w2Row(), verdict('w2', 'w2', 'wages_tips_other_compensation', w2MatchAssoc));
  const eligPrep = prep([w2Eligible]);
  const eligFin = finalize({ answer: '', missing_data: [] }, eligPrep);
  set('A11', w2Eligible.metadata.evidence_eligibility.state === 'BUSINESS_RELEVANT'
    && eligPrep.contract?.resolution_state === 'PROVISIONAL'
    && /pending review/.test(String(eligFin.answer))
    && !/\b(confirmed|verified)\b/i.test(String(eligFin.answer))
    && PV.PROVISIONAL_EVIDENCE_LABEL === 'UNVERIFIED DOCUMENT DATA');

  // A12 — no automatic confirmation.
  set('A12', declared1040.requires_confirmation === false
    && Object.values(E.ELIGIBILITY_STATES).sort().join(',') === 'AMBIGUOUS,BUSINESS_RELEVANT,PERSONAL_ONLY,SENSITIVE'
    && !/confirmed|verified/i.test(JSON.stringify(E.ELIGIBILITY_STATES)));

  // A13 — no automatic verification anywhere on this path.
  const engineSrc = fs.readFileSync(P('base44/shared/documentExtraction/extractEngine.ts'), 'utf8');
  const retrySrc = fs.readFileSync(P(RETRY), 'utf8');
  const understandSrc = fs.readFileSync(P(UNDERSTAND), 'utf8');
  const eligSrc = fs.readFileSync(P(ELIGIBILITY), 'utf8');
  const ingestionSrc = fs.readFileSync(P('base44/shared/documentIngestion/orchestration.ts'), 'utf8');
  set('A13', !/business_facts|business_fact_evidence/.test([engineSrc, retrySrc, understandSrc, eligSrc, ingestionSrc].join('\n'))
    && !/ANALYSIS_STATUS = ['"]verified|analysis_status: 'verified'|analysis_status: 'confirmed'/.test(engineSrc)
    && PV.isPendingReview('pending_review') === true && PV.isPendingReview('confirmed') === false);

  // A14 — no business_facts writes (behavioural twin).
  const rowsBefore = JSON.stringify([w2Row(), plRow()]);
  prep([w2Row(), plRow()]);
  set('A14', JSON.stringify([w2Row(), plRow()]) === rowsBefore && !/business_facts/.test(retrySrc));

  // A15 — Retry still uses the durable pipeline.
  set('A15', durableRetry.resumed === true && durableResumes === 1
    && /retryDocumentIngestion\(/.test(retrySrc) && !/extractEngine|runExtraction/.test(retrySrc));

  // A16 — duplicate delivery remains idempotent.
  const dupSandbox = sandbox({ analysis: analysisRow({ analysis_status: 'completed' }) });
  let dupResumes = 0;
  const dupRetry = await R.retryDocumentIngestion({
    sb: dupSandbox.sb, documentId: DOC, authorizeDocument: () => ({ authorized: true }),
    resume: async () => { dupResumes++; return { ok: false, outcome: 'not_resumable', reason: 'analysis_already_completed' }; },
  });
  const deniedSandbox = sandbox({ analysis: analysisRow() });
  const deniedRetry = await R.retryDocumentIngestion({
    sb: deniedSandbox.sb, documentId: DOC, authorizeDocument: () => ({ authorized: false }),
    resume: async () => { throw new Error('resume must not run'); },
  });
  set('A16', dupResumes === 1 && deniedRetry.ok === false && deniedSandbox.state.writes.length === 0);

  // A17 — W-2 employer mismatch cannot associate.
  const w2Mismatch = E.resolveAssociation({ businessId: BIZ, businessName: BIZ_NAME, identityNames: ['Summit Plumbing Inc'], classificationSuggestedBusinessId: null });
  const w2MismatchVerdict = verdict('w2', 'w2', 'wages_tips_other_compensation', w2Mismatch);
  const w2MismatchPrep = prep([stamp(w2Row(), w2MismatchVerdict)]);
  const w2MismatchFin = finalize({ answer: '', missing_data: [] }, w2MismatchPrep);
  set('A17', w2Mismatch.supported === false && w2MismatchVerdict.state === 'AMBIGUOUS'
    && outOfBusinessLane(stamp(w2Row(), w2MismatchVerdict))
    && /can'?t confidently tie this W-2/i.test(String(w2MismatchFin.answer)));

  // A18 — K-1 entity mismatch cannot associate.
  const k1Mismatch = E.resolveAssociation({ businessId: BIZ, businessName: BIZ_NAME, identityNames: ['Summit Holdings LP'], classificationSuggestedBusinessId: null });
  const k1MismatchVerdict = verdict('k1', 'k1', 'ordinary_business_income', k1Mismatch);
  set('A18', k1Mismatch.supported === false && k1MismatchVerdict.state === 'AMBIGUOUS'
    && E.isBusinessEligible(k1MismatchVerdict) === false
    && outOfBusinessLane(stamp(row({ field_name: 'ordinary_business_income', normalized_value: 45000 }), k1MismatchVerdict)));

  // A19 — Schedule C association follows the document's own evidence.
  set('A19', stateOf('schedule_c', 'schedule_c', 'gross_receipts', assocMatch) === 'BUSINESS_RELEVANT'
    && stateOf('schedule_c', 'schedule_c', 'gross_receipts', w2Mismatch) === 'AMBIGUOUS'
    && stateOf('schedule_c', 'schedule_c', 'business_name', assocMatch) === 'AMBIGUOUS'
    && E.isBusinessEligible(verdict('schedule_c', 'schedule_c', 'business_name', assocMatch)) === false);

  // A20 — cross-business isolation remains intact.
  const crossBusiness = E.resolveAssociation({ businessId: BIZ, businessName: BIZ_NAME, identityNames: ['Summit Plumbing Inc'], classificationSuggestedBusinessId: 'biz-other' });
  set('A20', crossBusiness.supported === false
    && provRows([{ ...plRow(), business_id: 'biz-other' }], BIZ).length === 0
    && provRows([plRow()], BIZ).length === 1);

  // ══ P1–P8: POSITIVE ASSOCIATION ══════════════════════════════════════════
  // The negative tests above are not enough: legitimate association must WORK.
  const pAssocMatch = E.resolveAssociation({ businessId: BIZ, businessName: BIZ_NAME, identityNames: [BIZ_NAME], classificationSuggestedBusinessId: null });
  const pAssocMismatch = E.resolveAssociation({ businessId: BIZ, businessName: BIZ_NAME, identityNames: ['Summit Plumbing Inc'], classificationSuggestedBusinessId: null });

  const p1Verdict = verdict('w2', 'w2', 'wages_tips_other_compensation', pAssocMatch);
  set('P1', pAssocMatch.supported === true && p1Verdict.state === 'BUSINESS_RELEVANT'
    && inBusinessLane(stamp(w2Row(), p1Verdict)));
  const p2Verdict = verdict('w2', 'w2', 'wages_tips_other_compensation', pAssocMismatch);
  set('P2', p2Verdict.state === 'AMBIGUOUS' && outOfBusinessLane(stamp(w2Row(), p2Verdict))
    && prov([stamp(w2Row(), p2Verdict)], BIZ).length === 0);

  const k1AssocMatch = E.resolveAssociation({ businessId: BIZ, businessName: BIZ_NAME, identityNames: ['Apex Roofing LLC'], classificationSuggestedBusinessId: null });
  const p3Verdict = verdict('k1', 'k1', 'ordinary_business_income', k1AssocMatch);
  set('P3', k1AssocMatch.supported === true && p3Verdict.state === 'BUSINESS_RELEVANT'
    && inBusinessLane(stamp(row({ field_name: 'ordinary_business_income', normalized_value: 45000 }), p3Verdict)));
  const k1AssocMismatch = E.resolveAssociation({ businessId: BIZ, businessName: BIZ_NAME, identityNames: ['Summit Holdings LP'], classificationSuggestedBusinessId: null });
  const p4Verdict = verdict('k1', 'k1', 'ordinary_business_income', k1AssocMismatch);
  set('P4', k1AssocMismatch.supported === false && p4Verdict.state === 'AMBIGUOUS' && outOfBusinessLane(stamp(row({ field_name: 'ordinary_business_income' }), p4Verdict)));

  const schedAssocMatch = E.resolveAssociation({ businessId: BIZ, businessName: BIZ_NAME, identityNames: ['Apex Roofing'], classificationSuggestedBusinessId: null });
  const p5Verdict = verdict('schedule_c', 'schedule_c', 'net_profit', schedAssocMatch);
  set('P5', schedAssocMatch.supported === true && p5Verdict.state === 'BUSINESS_RELEVANT'
    && inBusinessLane(stamp(row({ field_name: 'net_profit', normalized_value: 180000 }), p5Verdict)));
  const schedAssocMismatch = E.resolveAssociation({ businessId: BIZ, businessName: BIZ_NAME, identityNames: ['Apex Roofing Services LLC'], classificationSuggestedBusinessId: null });
  const p6Verdict = verdict('schedule_c', 'schedule_c', 'net_profit', schedAssocMismatch);
  set('P6', schedAssocMismatch.supported === false && p6Verdict.state === 'AMBIGUOUS'
    && outOfBusinessLane(stamp(row({ field_name: 'net_profit' }), p6Verdict))
    && prov([stamp(row({ field_name: 'net_profit' }), p6Verdict)], BIZ).length === 0);

  // P7 — the entity-name families behave identically, matched and unmatched.
  const entityForms = [['form_1120', 'business_tax_return'], ['form_1120s', 'business_tax_return_1120s'], ['form_1065', 'business_tax_return_1065'], ['k1', 'k1'], ['business_tax_return', 'business_tax_return']];
  set('P7', entityForms.every(([form, reader]) => {
    const matched = E.resolveAssociation({ businessId: BIZ, businessName: BIZ_NAME, identityNames: ['APEX ROOFING, L.L.C.'], classificationSuggestedBusinessId: null });
    const mismatched = E.resolveAssociation({ businessId: BIZ, businessName: BIZ_NAME, identityNames: ['Summit Plumbing Inc'], classificationSuggestedBusinessId: null });
    const ok = verdict(reader, form, 'gross_receipts', matched).state === 'BUSINESS_RELEVANT'
      && E.isBusinessEligible(verdict(reader, form, 'gross_receipts', mismatched)) === false
      && stateOf(reader, form, 'entity_name', matched) === 'AMBIGUOUS';
    return ok;
  }));

  // P8 — a name that exists only in the UI/context cannot establish association.
  const contextOnlyAssoc = E.resolveAssociation({ businessId: BIZ, businessName: BIZ_NAME, identityNames: [], classificationSuggestedBusinessId: null });
  set('P8', contextOnlyAssoc.supported === false
    && contextOnlyAssoc.evidence.length === 0
    && outOfBusinessLane(stamp(w2Row(), verdict('w2', 'w2', 'wages_tips_other_compensation', contextOnlyAssoc))));

  // ══ NAME-1..10: ENTITY-NAME MATCHING ═════════════════════════════════════
  set('NAME-1', E.entityNamesMatch('Apex Roofing LLC', 'Apex Roofing') === true);
  set('NAME-2', E.entityNamesMatch('Apex Roofing', 'Apex Roofing LLC') === true);
  set('NAME-3', E.entityNamesMatch('APEX ROOFING, LLC', BIZ_NAME) === true);
  set('NAME-4', E.entityNamesMatch('Apex Roofing L.L.C.', BIZ_NAME) === true);
  set('NAME-5', E.entityNamesMatch('Apex Roofing Holdings LLC', BIZ_NAME) === false);
  set('NAME-6', E.entityNamesMatch('Apex Roofing Services LLC', BIZ_NAME) === false);
  set('NAME-7', E.entityNamesMatch('Apex Roof LLC', BIZ_NAME) === false);
  set('NAME-8', E.entityNamesMatch('Apex Roofing & Construction LLC', BIZ_NAME) === false);
  set('NAME-9', E.entityNamesMatch('Summit Roofing LLC', BIZ_NAME) === false);
  // An uncertain relationship is AMBIGUOUS — never BUSINESS_RELEVANT.
  const nameNear = E.resolveAssociation({ businessId: BIZ, businessName: BIZ_NAME, identityNames: ['Apex Roofing Holdings LLC'], classificationSuggestedBusinessId: null });
  set('NAME-10', nameNear.supported === false
    && stateOf('schedule_c', 'schedule_c', 'net_profit', nameNear) === 'AMBIGUOUS'
    && E.isBusinessEligible(verdict('schedule_c', 'schedule_c', 'net_profit', nameNear)) === false);

  // ══ PROV-1..8: CLASSIFIER-SUGGESTION PROVENANCE ══════════════════════════
  const docSourced = E.resolveAssociation({ businessId: BIZ, businessName: null, identityNames: [], classificationSuggestedBusinessId: BIZ, classificationSuggestionSource: 'document_content' });
  set('PROV-1', docSourced.supported === true && docSourced.reason === 'document_content_identified_this_business');
  const forbidden = ['active_context', 'request_payload', 'ui_selection', 'primary_business_id', 'previous_conversation', 'another_document', ''];
  set('PROV-2', forbidden.every((src) => E.resolveAssociation({ businessId: BIZ, businessName: null, identityNames: [], classificationSuggestedBusinessId: BIZ, classificationSuggestionSource: src }).supported === false));
  set('PROV-3', stateOf('schedule_c', 'schedule_c', 'net_profit', E.resolveAssociation({ businessId: BIZ, businessName: BIZ_NAME, identityNames: [], classificationSuggestedBusinessId: BIZ, classificationSuggestionSource: 'request_payload' })) === 'AMBIGUOUS');
  // Another business's suggestion is not this business's evidence, even when tagged.
  const otherSuggestion = E.resolveAssociation({ businessId: BIZ, businessName: null, identityNames: [], classificationSuggestedBusinessId: 'biz-other', classificationSuggestionSource: 'document_content' });
  set('PROV-4', otherSuggestion.supported === false);
  // The classifier's suggestion is constrained to the actor's authorized candidates.
  const semanticSrc = fs.readFileSync(P('base44/shared/documentUnderstanding/understandDocument.ts'), 'utf8');
  set('PROV-5', /candidates\.some\(\(c\) => c\.id === cleanText\(raw\.suggested_business_id\)\)/.test(semanticSrc));
  // The only production caller tags the suggestion as document content.
  set('PROV-6', /classificationSuggestionSource: 'document_content'/.test(engineSrc));
  const suggestCallers = ['base44/shared/documentExtraction/extractEngine.ts'];
  set('PROV-7', suggestCallers.every((f) => /classificationSuggestedBusinessId/.test(fs.readFileSync(P(f), 'utf8')))
    && !/resolveAssociation/.test(fs.readFileSync(P(ELIGIBILITY), 'utf8').split('export function resolveAssociation')[0]));
  set('PROV-8', /classificationSuggestionSource/.test(eligSrc) && /DOCUMENT_CONTENT_SOURCE/.test(eligSrc));

  // ══ COV-1..5: READER → DISPOSITION COVERAGE ══════════════════════════════
  const readerKeys = Object.keys(S.SUBTYPE_READERS);
  const readerFields = readerKeys.flatMap((k) => S.fieldsForForm(k).map((f) => ({ key: k, field: f.name, d: D.dispositionFor(k, f.name) })));
  set('COV-1', readerKeys.length > 0 && readerKeys.every((k) => S.fieldsForForm(k).length > 0));
  // Every emitted field resolves EXACTLY ONE disposition — no fallthrough, no orphan.
  set('COV-2', readerFields.length > 0 && readerFields.every((r) => r.d && ['CANONICAL_FACT', 'EVIDENCE_ONLY', 'SENSITIVE', 'INTENTIONALLY_UNSUPPORTED'].includes(r.d.disposition)));
  set('COV-3', D.orphanFields(S.SUBTYPE_READERS).length === 0);
  // The alias map must cover every form-keyed reader: the empty-alias defect can no
  // longer return unnoticed (a reader with no resolvable table reads as "nothing").
  set('COV-4', readerKeys.filter((k) => k.startsWith('form_')).every((k) => D.dispositionFor(k, S.fieldsForForm(k)[0].name) !== null));
  // Association evidence is a DECLARED terminal disposition, not an accident.
  set('COV-5', readerFields.filter((r) => /_name$/.test(r.field)).length > 0
    && readerFields.filter((r) => /_name$/.test(r.field)).every((r) => r.d.disposition === 'EVIDENCE_ONLY')
    && ['w2', 'k1', 'schedule_c', 'form_1120', 'form_1120s', 'form_1065'].every((k) => E.isAssociationEvidenceField(k, k === 'schedule_c' ? 'business_name' : 'entity_name') || k === 'w2'));

  // ══ PII-1..5: SENTINEL IDENTIFIERS NEVER REACH A SURFACE ═════════════════
  const piiPrep = prep([...piiRows(), w2Row(), plRow()], 'What was my W-2 for 2023');
  const piiSurfaces = JSON.stringify({
    contract: piiPrep.contract,
    prompt: (() => { try { return String(PL.buildPromptBlock(piiPrep.contract || piiPrep) || ''); } catch (e) { return 'PROMPT_BLOCK_ERROR:' + e.message; } })(),
    evidence: prov([...piiRows(), w2Row()], BIZ),
    summary: E.summarizeEligibility(piiRows().map((r) => ({ eligibility: verdict('w2', 'w2', r.field_name, assocMatch) }))),
  });
  const piiAnswer = String(finalize({ answer: '', missing_data: [] }, piiPrep).answer || '');
  set('PII-1', SENTINELS.every((v) => !piiSurfaces.includes(v)) && !piiSurfaces.includes('PROMPT_BLOCK_ERROR'));
  set('PII-2', SENTINELS.every((v) => !piiAnswer.includes(v)));
  set('PII-3', piiRows().every((r) => SF.isSensitiveFieldName(r.field_name) === true));
  set('PII-4', piiRows().every((r) => outOfBusinessLane(r)) && prov(piiRows(), BIZ).length === 0);
  set('PII-5', !/employee_ssn|employer_ein|recipient_tin|taxpayer_itin|date_of_birth/.test(schemaJson));

  // ══ COMPOUND-1..6: ONE MULTIPAGE RETURN, FOUR FORMS ══════════════════════
  const compound = F.normalizeFormSections(SECTIONS, 2023);
  set('COMPOUND-1', compound.length === 4 && new Set(compound.map((s) => s.form_type)).size === 4);
  set('COMPOUND-2', compound.every((s) => s.tax_year === 2023 && s.page_start >= 1 && s.page_end >= s.page_start));
  set('COMPOUND-3', F.resolveFieldSourcePage('form_1040', compound) === 1
    && F.resolveFieldSourcePage('schedule_c', compound) === 7
    && F.resolveFieldSourcePage('w2', compound) === 10
    && F.resolveFieldSourcePage('k1', compound) === 12);
  // Reader routing is BY FORM, so two forms of one return never share a reader.
  set('COMPOUND-4', S.readerKeyForFormField('form_1040', 'total_tax') !== S.readerKeyForFormField('w2', 'wages_tips_other_compensation')
    && S.readerKeyForFormField('schedule_c', 'net_profit') !== S.readerKeyForFormField('k1', 'ordinary_business_income'));
  // Four forms in one document ⇒ four DIFFERENT eligibility decisions.
  set('COMPOUND-5', stateOf('personal_tax_return', 'form_1040', 'total_tax', assocMatch) === 'PERSONAL_ONLY'
    && stateOf('schedule_c', 'schedule_c', 'net_profit', assocMatch) === 'BUSINESS_RELEVANT'
    && stateOf('w2', 'w2', 'wages_tips_other_compensation', w2Mismatch) === 'AMBIGUOUS'
    && stateOf('k1', 'k1', 'ordinary_business_income', k1Mismatch) === 'AMBIGUOUS');
  const compoundRows = [
    row({ id: 'c-1040-tt', field_name: 'total_tax', normalized_value: 31000, source_document_type: 'form_1040', metadata: { form_type: 'form_1040', fiscal_year: 2023, evidence_eligibility: { state: 'PERSONAL_ONLY' } } }),
    row({ id: 'c-sc-np', field_name: 'net_profit', normalized_value: 180000, source_document_type: 'schedule_c', metadata: { form_type: 'schedule_c', fiscal_year: 2023, evidence_eligibility: { state: 'BUSINESS_RELEVANT', association_supported: true } } }),
    row({ id: 'c-w2-w', field_name: 'wages_tips_other_compensation', normalized_value: 85000, source_document_type: 'w2', metadata: { form_type: 'w2', fiscal_year: 2023, evidence_eligibility: { state: 'AMBIGUOUS', association_supported: false } } }),
    row({ id: 'c-k1-ob', field_name: 'ordinary_business_income', normalized_value: 45000, source_document_type: 'k1', metadata: { form_type: 'k1', fiscal_year: 2023, evidence_eligibility: { state: 'AMBIGUOUS', association_supported: false } } }),
    plRow(),
  ];
  const compoundPrep = prep(compoundRows, 'What was my W-2 for 2023', { formSections: compound });
  const compoundFin = finalize({ answer: '', missing_data: [] }, compoundPrep);
  const compoundAns = String(compoundFin.answer || '');
  set('COMPOUND-6', compoundAns.includes('$85,000') && !compoundAns.includes('1,250,000')
    && !compoundAns.includes('180,000') && F.resolveFieldSourcePage('w2', compound) === 10);

  // ══ GALILEO-1..8: THE OWNER'S QUESTIONS ══════════════════════════════════
  const ask = (question) => {
    const prepared = prep(compoundRows, question, { formSections: compound });
    const answered = finalize({ answer: '', missing_data: [] }, prepared);
    return { prepared, answered, text: String(answered.answer || ''), state: prepared.contract?.resolution_state };
  };
  const gSummary = ask('What do you know from my 2023 tax return?');
  set('GALILEO-1', /1040/.test(gSummary.text) && /W-2/.test(gSummary.text) && SENTINELS.every((v) => !gSummary.text.includes(v)));
  const gTaxable = ask('What was my taxable income in 2023?');
  set('GALILEO-2', ['PROVISIONAL', 'RELATED_ONLY', 'UNAVAILABLE'].includes(gTaxable.state)
    && !/\bverified\b|\bconfirmed\b/i.test(gTaxable.text)
    && !/apex roofing (made|earned|reported|had)/i.test(gTaxable.text));
  const gTotalTax = ask('What was my total tax in 2023?');
  set('GALILEO-3', ['PROVISIONAL', 'RELATED_ONLY', 'UNAVAILABLE'].includes(gTotalTax.state)
    && !/\bverified\b|\bconfirmed\b/i.test(gTotalTax.text)
    && (!gTotalTax.text.includes('31,000') || /pending review|can'?t confidently/i.test(gTotalTax.text)));
  const gW2 = ask('What was my W-2 for 2023?');
  set('GALILEO-4', gW2.text.includes('$85,000') && /pending review/i.test(gW2.text) && !gW2.text.includes('1,250,000'));
  const gWages = ask('What were my W-2 wages in 2023?');
  set('GALILEO-5', gWages.text.includes('$85,000') && !gWages.text.includes('1,250,000') && !gWages.text.includes('180,000'));
  const gWithheld = ask('What was withheld from my W-2?');
  const gWithheldVals = (gWithheld.text.match(/\$[\d,]+/g) || []).map((v) => Number(v.replace(/[^0-9]/g, '')));
  set('GALILEO-6', gWithheldVals.every((v) => [85000, 12000].includes(v)) && !gWithheld.text.includes('1,250,000'));
  const gBusiness = ask('What did Apex Roofing make in 2023?');
  set('GALILEO-7', !(gBusiness.text.includes('85,000') && /apex roofing/i.test(gBusiness.text))
    && !/\bverified\b/i.test(gBusiness.text));
  // The W-2 may be KNOWN without its wages being attributed to Apex Roofing: the
  // ambiguity is stated, and no sentence hands the wage figure to the business.
  set('GALILEO-8', /can'?t confidently tie this W-2/i.test(gW2.text) && /Summit Plumbing/.test(gW2.text));

  // ══ SRC-1..3: SOURCE ASSOCIATION ═════════════════════════════════════════
  const w2Sources = JSON.stringify(withW2.contract?.sources || []);
  set('SRC-1', !w2Sources.includes('doc-pl') && !/1,250,000/.test(w2Sources));
  set('SRC-2', w2Sources.includes(PARENT) || /W-2/.test(w2Sources));
  const gW2Sources = JSON.stringify(gW2.prepared.contract?.sources || []);
  set('SRC-3', !gW2Sources.includes('doc-pl') && !/1,250,000/.test(gW2Sources) && !/180,000/.test(gW2Sources));

  // ══ CONT-1..3: NEW-UPLOAD KNOWLEDGE CONTINUITY ═══════════════════════════
  // CONTROL A — a business-scope document: upload → durable ingestion → extraction →
  // persistence → IMMEDIATE retrieval, in one uninterrupted call chain.
  const contASandbox = sandbox({ analysis: analysisRow({ analysis_status: 'needs_review' }) });
  let contAResumes = 0;
  const contARetry = await R.retryDocumentIngestion({
    sb: contASandbox.sb, documentId: DOC, authorizeDocument: () => ({ authorized: true }),
    resume: async () => { contAResumes++; return { ok: true, outcome: 'resumed' }; },
  });
  const contARows = [plRow()];
  const contA = prep(contARows, 'What was my revenue in 2023?');
  const contAFin = finalize({ answer: '', missing_data: [] }, contA);
  set('CONT-1', contARetry.ok === true && contAResumes === 1
    && prov(contARows, BIZ).length === 1
    && String(contAFin.answer).includes('$1,250,000'));

  // CONTROL B — a PERSONAL tax document uploaded while a business is active:
  // extraction is automatic, eligibility is automatic, and the ELIGIBLE evidence is
  // immediately retrievable. No refresh, no re-upload, no manual review.
  const contBPrep = prep(compoundRows, 'What did Apex Roofing make in 2023?', { formSections: compound });
  const contBFin = finalize({ answer: '', missing_data: [] }, contBPrep);
  set('CONT-2', declared1040.route_extraction === true
    && declared1040.requires_confirmation === false
    && prov(compoundRows, BIZ).length > 0
    && String(contBFin.answer).length > 0);

  // …and the personal figure from that same document is NOT business evidence, in
  // the same pass, without a second decision.
  set('CONT-3', !prov(compoundRows, BIZ).some((i) => i.field_name === 'total_tax')
    && !prov(compoundRows, BIZ).some((i) => i.field_name === 'wages_tips_other_compensation')
    && prov(compoundRows, BIZ).some((i) => i.field_name === 'net_profit'));

  set('ERROR-EVIDENCE-LANE', provErrors.length === 0);
  if (provErrors.length) console.log('      evidence lane error(s): ' + [...new Set(provErrors)].slice(0, 3).join(' ; '));
  return res;
}

const DESC = {
  'ERROR-EVIDENCE-LANE': 'the business evidence lane answered every call',
  T1: 'every supported tax form is a recognized family with a label',
  T2: 'two form families never collapse into one',
  T4: 'each readable family resolves to a REAL reader',
  T5: 'the readers request the safe figures of their own form',
  T6: 'a form-keyed reader resolves its disposition table; schedules claim no reader',
  T7: 'no schema field exists without a declared disposition',
  T8: 'W-2 wages are evidence, not a canonical fact',
  T9: 'identifiers are sensitive; personal measures are not business-eligible',
  T10: 'a form field carries the page its form starts on',
  T11: 'with no page signal the provenance is "unknown", never a page',
  T12: 'provenance reads as form section, and the summary names the forms',
  T13: '"What was my W-2 for 2023" resolves to the W-2 for 2023',
  T14: '1065 and 1120-S questions resolve to their own forms',
  T15: 'a metric question is not treated as a form question',
  T16: 'a whole-return question is a summary, not a named form',
  T17: 'a form name is never silently read as an income metric',
  T18: 'the W-2 answer states the W-2 figure, pending review',
  T19: 'the Profit & Loss figure never enters a W-2 answer',
  T20: 'the answer is document evidence, never called verified',
  T21: 'the model may not re-ask for the figure it was given',
  T22: 'the contract knows the figures it already has',
  T23: 'no figure appears that was not extracted',
  T24: 'every source line names something',
  T25: 'no W-2 on file is said plainly, with what the return does report',
  T26: 'nothing on file asks for the document',
  T27: 'a recognized form with no figures invents no figure',
  A1: 'a personal 1040 in business context is EXTRACTED — no pause, no confirmation',
  A2: 'document identity is preserved: it stays a personal tax return',
  A3: 'semantic_scope stays personal; scope_mismatch is context, not a gate',
  A4: 'durable extraction runs automatically, and no patch touches scope or business',
  A5: 'safe fields persist; no identifier is ever requested',
  A6: 'identifiers are SENSITIVE and excluded from every surface',
  A7: 'business-relevant evidence with document support becomes eligible',
  A8: 'personal-only evidence never becomes business evidence',
  A9: 'an unsupported relationship is AMBIGUOUS, never eligible',
  A10: 'the active business alone is never proof of association',
  A11: 'pending evidence remains unverified',
  A12: 'nothing is automatically confirmed',
  A13: 'nothing is automatically verified',
  A14: 'no business_facts write on this path',
  A15: 'Retry still uses the durable pipeline, and never extracts',
  A16: 'duplicate delivery is inert; a denied actor writes nothing',
  A17: 'a W-2 employer mismatch cannot associate to the active business',
  A18: 'a K-1 entity mismatch cannot associate to the active business',
  A19: 'Schedule C association follows the document’s own evidence',
  A20: 'cross-business isolation remains intact',
  P1: 'W-2 employer MATCHES → eligible business evidence',
  P2: 'W-2 employer does NOT match → document evidence only',
  P3: 'K-1 entity MATCHES → eligible business evidence',
  P4: 'K-1 entity does NOT match → document evidence only',
  P5: 'Schedule C business MATCHES → eligible business evidence',
  P6: 'Schedule C business does NOT match → document evidence only',
  P7: '1120/1120-S/1065 entity matching behaves identically',
  P8: 'a name that exists only in context cannot associate',
  'NAME-1': 'Apex Roofing LLC ≡ Apex Roofing',
  'NAME-2': 'Apex Roofing ≡ Apex Roofing LLC',
  'NAME-3': 'APEX ROOFING, LLC ≡ Apex Roofing LLC',
  'NAME-4': 'Apex Roofing L.L.C. ≡ Apex Roofing LLC',
  'NAME-5': 'Apex Roofing Holdings LLC is a different entity',
  'NAME-6': 'Apex Roofing Services LLC is a different entity',
  'NAME-7': 'Apex Roof LLC is a different entity',
  'NAME-8': 'Apex Roofing & Construction LLC is a different entity',
  'NAME-9': 'a shared generic word is not a match',
  'NAME-10': 'an uncertain relationship is AMBIGUOUS, never eligible',
  'PROV-1': 'a document-content suggestion is honoured',
  'PROV-2': 'no other origin can supply a suggestion',
  'PROV-3': 'a request-payload suggestion cannot make evidence eligible',
  'PROV-4': 'another business’s suggestion is refused',
  'PROV-5': 'the classifier is constrained to the authorized candidates',
  'PROV-6': 'the production caller tags the suggestion as document content',
  'PROV-7': 'the resolver has no other caller and no self-declared input',
  'PROV-8': 'the provenance gate exists in the shipped source',
  'COV-1': 'every registered reader declares fields',
  'COV-2': 'every emitted field has exactly one declared disposition',
  'COV-3': 'no orphan concepts',
  'COV-4': 'no form-keyed reader falls through an empty alias',
  'COV-5': 'association evidence is a declared terminal disposition',
  'PII-1': 'no sentinel identifier reaches the prompt, contract or evidence lane',
  'PII-2': 'no sentinel identifier reaches the answer',
  'PII-3': 'the sensitive-name predicate knows every sentinel field',
  'PII-4': 'sensitive rows are excluded from the business lane entirely',
  'PII-5': 'no reader schema requests an identifier',
  'COMPOUND-1': 'one document, four detected forms',
  'COMPOUND-2': 'one tax year, four real page ranges',
  'COMPOUND-3': 'field provenance follows the FORM, page by page',
  'COMPOUND-4': 'reader routing is by form, never shared',
  'COMPOUND-5': 'four forms ⇒ four different eligibility decisions',
  'COMPOUND-6': 'the compound return answers the W-2 question from the W-2 only',
  'GALILEO-1': 'the 2023 return summary names its forms and no identifier',
  'GALILEO-2': 'taxable income is never presented as verified or as the business’s',
  'GALILEO-3': 'total tax is never presented as verified or confirmed',
  'GALILEO-4': 'the W-2 question is answered from the W-2, pending review',
  'GALILEO-5': 'the W-2 wages question uses the W-2, never the P&L or the Schedule C',
  'GALILEO-6': 'the withholding question uses the W-2’s own figures',
  'GALILEO-7': 'a business earnings question is never answered with wages',
  'GALILEO-8': 'the W-2 is known without its wages being attributed to Apex Roofing',
  'SRC-1': 'a W-2 answer never cites the unrelated P&L',
  'SRC-2': 'a W-2 answer cites the W-2 and its parent document',
  'SRC-3': 'the compound W-2 answer cites the W-2’s evidence only',
  'CONT-1': 'CONTROL A — business document: retrieval is immediate after ingestion',
  'CONT-2': 'CONTROL B — personal document: automatic extraction and immediate eligible retrieval',
  'CONT-3': 'CONTROL B — and the personal figure is not business evidence in the same pass',
};

const MUTATIONS = [
  { id: 'M1', what: 'W-2 declared unreadable', file: TAX_SCHEMAS, probe: 'T4', find: 'w2: { fields: W2_FIELDS }', replace: 'w2: { fields: [] }' },
  { id: 'M2', what: 'the relationship test forced to pass', file: ELIGIBILITY, probe: 'A9', find: '  if (associationSupported) {', replace: '  if (true) {' },
  { id: 'M3', what: 'page provenance invented when no form is on file', file: TAX_FORMS, probe: 'T11', find: "return page == null ? 'unknown' : 'form_section';", replace: "return 'form_section';" },
  { id: 'M4', what: 'page forced to page 1 regardless of the form', file: TAX_FORMS, probe: 'T11', find: 'export function resolveFieldSourcePage(formType: unknown, sections: FormSection[] | null | undefined): number | null {', replace: 'export function resolveFieldSourcePage(formType: unknown, sections: FormSection[] | null | undefined): number | null {\n  return 1;' },
  { id: 'M5', what: 'form name treated as an income metric', file: FORM_QUERY, probe: 'T15', find: 'if (isSummary) return { kind: \'return_summary\', form_type: null, form_label: \'tax return\', year, source: \'summary\' };', replace: 'if (true) return { kind: \'form\', form_type: \'form_1040\', form_label: \'Form 1040\', year, source: \'summary\' };' },
  { id: 'M6', what: 'form branch bypassed in the pipeline', file: PIPELINE, probe: 'T18', find: '  const formQuery = resolveFormQuery(input?.question);', replace: '  const formQuery = null && resolveFormQuery(input?.question);' },
  { id: 'M7', what: 'scope mismatch blocks extraction again', file: UNDERSTAND, probe: 'A1', find: "      && applied\n      && result.reader_supported;", replace: "      && applied\n      && result.reader_supported\n      && !result.scope_mismatch;" },
  { id: 'M8', what: 'scope mismatch routed back into needs_review', file: PERSIST, probe: 'A4', find: "  } else if (result.confidence_band === 'medium') {", replace: "  } else if (result.confidence_band === 'medium' || result.scope_mismatch) {" },
  { id: 'M9', what: 'identifiers stop being sensitive', file: DISPOSITION, probe: 'PII-3', find: "return dispositionFor(readerKey, fieldName)?.disposition === 'SENSITIVE';", replace: 'return false;' },
  { id: 'M10', what: 'a reader starts requesting an identifier', file: TAX_SCHEMAS, probe: 'A6', find: "export const W2_FIELDS: TaxField[] = [\n  f('wages_tips_other_compensation', 'Wages, Tips, Other Compensation'),", replace: "export const W2_FIELDS: TaxField[] = [\n  f('employee_ssn', 'Employee SSN', 'text'),\n  f('wages_tips_other_compensation', 'Wages, Tips, Other Compensation')," },
  { id: 'M11', what: 'entity names matched fuzzily', file: ELIGIBILITY, probe: 'NAME-8', find: '  return na === nb;', replace: '  return true;' },
  { id: 'M12', what: 'a suggestion accepted with no document provenance', file: ELIGIBILITY, probe: 'PROV-3', find: '    && suggestionSource === DOCUMENT_CONTENT_SOURCE', replace: '' },
  { id: 'M13', what: 'another business’s suggestion admitted', file: ELIGIBILITY, probe: 'PROV-4', find: '    && input?.businessId\n    && suggested === String(input.businessId)', replace: '' },
  { id: 'M14', what: 'the business evidence lane admits every row', file: PROVISIONAL, probe: 'A8', find: "export const NON_BUSINESS_ELIGIBILITY_STATES = ['PERSONAL_ONLY', 'AMBIGUOUS', 'SENSITIVE'];", replace: 'export const NON_BUSINESS_ELIGIBILITY_STATES = [];' },
  { id: 'M15', what: 'cross-business rows admitted by business scoping', file: PROVISIONAL, probe: 'A20', find: 'export function provisionalRowsForBusiness(rows: any, businessId: any) {', replace: 'export function provisionalRowsForBusiness(rows: any, businessId: any) {\n  return Array.isArray(rows) ? rows : [];' },
  { id: 'M16', what: 'pending review treated as nothing pending (pending → confirmed)', file: PROVISIONAL, probe: 'A11', find: "export const PENDING_REVIEW_STATES = ['pending_review', 'pending'];", replace: 'export const PENDING_REVIEW_STATES = [];' },
  { id: 'M17', what: 'the unverified label upgraded (pending → verified)', file: PROVISIONAL, probe: 'A11', find: "export const PROVISIONAL_EVIDENCE_LABEL = 'UNVERIFIED DOCUMENT DATA';", replace: "export const PROVISIONAL_EVIDENCE_LABEL = 'VERIFIED DOCUMENT DATA';" },
  { id: 'M18', what: 'Retry calls extraction directly instead of the durable pipeline', file: RETRY, probe: 'A15', find: 'export async function retryDocumentIngestion({', replace: 'export async function retryDocumentIngestion({\n  // mutation: extraction invoked directly (must never be reachable from Retry)' },
  { id: 'M19', what: 'unrelated rows selected as the form answer’s source', file: FORM_QUERY, probe: 'T19', find: '  const ownRows = rows.filter((r) => fieldFormOf(r) === formType)', replace: '  const ownRows = rows;' },
  { id: 'M20', what: 'document silently re-scoped by the extraction patch', file: PERSIST, probe: 'A4', find: "export const ALLOWED_DOCUMENT_PATCH_KEYS = ['document_type', 'system_folder', 'year', 'upload_status', 'updated_at'];", replace: "export const ALLOWED_DOCUMENT_PATCH_KEYS = ['document_type', 'system_folder', 'year', 'upload_status', 'updated_at', 'document_scope'];" },
];

/** Static, whole-repository wiring checks. */
function staticChecks() {
  const out = {};
  const read = (p) => fs.readFileSync(P(p), 'utf8');
  const router = read('base44/functions/supabaseUserData/entry.ts');
  out['S1-RETRY-NO-EXTRACT'] = !/runExtraction|extractDocument|extractEngine/.test(router);
  out['S2-RETRY-DELEGATES'] = /retryDocumentIngestion\(/.test(router) && /resume\(/.test(read(RETRY));
  out['S3-ONE-OVERRIDE'] = /classificationOverride\.ts/.test(router) && !/ALLOWED_OVERRIDE_ROLES/.test(router);
  const ask = read('base44/functions/askGalileo/entry.ts');
  out['S4-FORM-SECTIONS'] = /formSections:/.test(ask) && /extracted_data/.test(ask);
  out['S5-NOTICE-ASSOCIATED'] = /const noticeDocId = provisionalDocumentId \|\| null;/.test(ask);
  // THE OWNER-FACING SCOPE CONFIRMATION IS GONE — and cannot return by accident.
  const room = read('src/pages/DataRoom.jsx');
  out['S6-NO-OWNER-CONFIRMATION'] = !fs.existsSync(P('base44/shared/documentIngestion/confirmation.ts'))
    && !fs.existsSync(P('src/components/dataroom/DocumentScopeConfirmation.jsx'))
    && !/confirmDocumentClassification|getDocumentReview/.test(router)
    && !/DocumentScopeConfirmation/.test(room)
    && !/review_reason = .*scope_confirmation_required/.test(read(PERSIST));
  out['S7-CLASSIFICATION-REAL'] = /getClassificationReview/.test(read('src/components/dataroom/ClassificationReviewQueue.jsx'));
  out['S8-NO-MISSING-FUNCTION'] = ['src/components/dataroom/ClassificationReviewQueue.jsx', 'src/pages/DataRoom.jsx', 'src/components/documents/DocumentClassificationOverride.jsx']
    .every((f) => !/classifyDocument/.test(read(f)));
  out['S9-PROVENANCE-TAGGED'] = /classificationSuggestionSource: 'document_content'/.test(read('base44/shared/documentExtraction/extractEngine.ts'))
    && /candidates\.some\(\(c\) => c\.id === cleanText\(raw\.suggested_business_id\)\)/.test(read('base44/shared/documentUnderstanding/understandDocument.ts'));
  const ingestionFiles = fs.readdirSync(P('base44/shared/documentIngestion')).filter((f) => f.endsWith('.ts'));
  out['S10-INGESTION-NEVER-EXTRACTS'] = ingestionFiles.every((f) => !/extractEngine|runExtraction/.test(read(`base44/shared/documentIngestion/${f}`)));
  return out;
}

(async () => {
  let failures = 0;
  const base = await evaluate();
  for (const [k, v] of Object.entries(base)) {
    if (!v) failures++;
    console.log(`${v ? 'PASS' : 'FAIL'}  ${String(k).padEnd(12)} ${DESC[k] || ''}`);
  }
  const statics = staticChecks();
  for (const [k, v] of Object.entries(statics)) {
    if (!v) failures++;
    console.log(`${v ? 'PASS' : 'FAIL'}  ${k}`);
  }
  let caughtCount = 0;
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
    if (outcome === 'CAUGHT') caughtCount++; else failures++;
    console.log(`${outcome} ${m.id.padEnd(5)} ${m.what} (probe ${m.probe})`);
  }
  const laneErrors = base['ERROR-EVIDENCE-LANE'] === false;
  if (laneErrors) failures = failures; // already counted above
  console.log(`\nchecks: ${Object.keys(base).length} behavioural + ${Object.keys(statics).length} wiring`);
  console.log(`mutations: ${caughtCount}/${MUTATIONS.length} APPLIED + BEHAVIOR_CHANGED + CAUGHT`);
  console.log(failures ? `${failures} FAILURE(S)` : 'ALL CHECKS PASS');
  process.exit(failures ? 1 : 0);
})();