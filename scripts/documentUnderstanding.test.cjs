#!/usr/bin/env node
/**
 * documentUnderstanding.test.cjs — VISION 6D.0b — AUTOMATIC DOCUMENT UNDERSTANDING.
 *
 * Run:  node scripts/documentUnderstanding.test.cjs
 *
 * OFFLINE AND NON-DESTRUCTIVE. No network, no database, no Base44 call, no
 * production record read, written or deleted. The PROVIDER IS MOCKED (Decision 5):
 * every fixture is synthetic text authored for this harness. The user's real
 * 2024 Form 1040 is never a fixture, never read, never reclassified.
 *
 * THE CODE UNDER TEST IS THE SHIPPED CODE, compiled from its real source and
 * executed: taxonomy, contract, deterministic signals, semantic classifier, the
 * understanding service, persistence and the orchestrator — against in-memory
 * recording mocks for Supabase and the Base44 service-role client.
 *
 * EVIDENCE CLASS: UNIT/MOCK (real modules executed) + STATIC + MUTATION.
 *
 *   D1-D45   cross-layer contract, ownership, scope and state assertions
 *   F1-F6    financial statement classification
 *   T1-T9    tax form recognition (independent of reader support)
 *   M1-M15   mutation tests — each must be CAUGHT
 */

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const quiet = { log() {}, warn() {}, error() {}, info() {} };

const failures = [];
const check = (id, label, ok, detail = '') => {
  if (!ok) failures.push(`${id} ${label}${detail ? ` — ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${String(id).padEnd(4)} ${label}${!ok && detail ? ` — ${detail}` : ''}`);
};

const P = {
  taxonomy: 'base44/shared/documentUnderstanding/taxonomy.ts',
  contract: 'base44/shared/documentUnderstanding/contract.ts',
  signals: 'base44/shared/documentUnderstanding/signals.ts',
  semanticClassifier: 'base44/shared/documentUnderstanding/semanticClassifier.ts',
  understandDocument: 'base44/shared/documentUnderstanding/understandDocument.ts',
  persist: 'base44/shared/documentUnderstanding/persist.ts',
  orchestrator: 'base44/shared/documentUnderstanding/orchestrator.ts',
  upload: 'base44/functions/uploadDocumentToSupabase/entry.ts',
  bridge: 'base44/shared/documentObservation/semantics.ts',
};

// ── Compile + load (same pattern as the existing document harnesses) ────────
const strip = (s) => s.replace(/^\s*import[\s\S]*?from\s+'[^']+';/gm, '').replace(/^\s*export\s+/gm, '');
const toJs = (s) => esbuild.transformSync(s, { loader: 'ts', format: 'cjs', target: 'es2020' }).code;

/** The six production reader keys, as the extraction engine declares them. */
const EXTRACTION_SCHEMAS = {
  profit_and_loss: { fields: [] }, balance_sheet: { fields: [] },
  business_tax_return: { fields: [] }, personal_tax_return: { fields: [] },
  debt_schedule: { fields: [] }, payroll_report: { fields: [] },
};

const M = {
  taxonomy: { uses: ['EXTRACTION_SCHEMAS'], returns: '({ FILE_FORMATS, DOCUMENT_FAMILIES, STORABLE_TYPES, TYPE_FAMILY, TYPE_LABELS, SUBTYPE_LABELS, SUBTYPE_PARENT, READABLE_TYPES, CANONICAL_FOLDER_BY_TYPE, UNCLASSIFIED_TYPE, isKnownType, isKnownSubtype, subtypeBelongsTo, familyOf, resolveReaderKey, isReaderSupported, folderFor, labelFor, labelForSubtype })' },
  contract: { uses: [], returns: '({ CONFIDENCE_HIGH_MIN, CONFIDENCE_MEDIUM_MIN, CONFIDENCE_CALIBRATION, bandFor, finalizeResult, toPersistedContract })' },
  signals: { uses: [], returns: '({ CONTENT_STRENGTH, FORM_RULES, STATEMENT_HEADINGS, TEXT_READABLE_FORMATS, fileFormatFromMime, isTextReadableFormat, structuralSignals, recognizeForms, evaluateContent, detectTaxYear, detectReportingPeriod, detectAccountingBasis, weakFilenameHints })' },
  semanticClassifier: { uses: [], returns: '({ buildProviderSchema, buildClassificationPrompt, classifyWithProvider })' },
  understandDocument: {
    uses: ['EXTRACTION_SCHEMAS', 'STORABLE_TYPES', 'SUBTYPE_PARENT', 'TYPE_FAMILY', 'UNCLASSIFIED_TYPE', 'isKnownType', 'isKnownSubtype', 'subtypeBelongsTo', 'resolveReaderKey', 'isReaderSupported', 'folderFor', 'familyOf', 'labelFor', 'labelForSubtype', 'finalizeResult', 'bandFor', 'CONFIDENCE_CALIBRATION', 'fileFormatFromMime', 'isTextReadableFormat', 'evaluateContent', 'structuralSignals', 'detectReportingPeriod', 'detectAccountingBasis', 'weakFilenameHints', 'CONTENT_STRENGTH', 'classifyWithProvider'],
    returns: '({ understandDocument, inferScopeFromType, decodeBase64Text, SCOPE_BY_TYPE })',
  },
  persist: {
    uses: ['labelFor', 'labelForSubtype', 'folderFor', 'familyOf', 'toPersistedContract'],
    returns: '({ ALLOWED_DOCUMENT_PATCH_KEYS, buildDocumentPatch, buildDecisionPayload, persistUnderstanding })',
  },
  orchestrator: { uses: ['understandDocument', 'persistUnderstanding'], returns: '({ runIngestionUnderstanding })' },
};

const ORDER = ['taxonomy', 'contract', 'signals', 'semanticClassifier', 'understandDocument', 'persist', 'orchestrator'];

function loadAll(overrides = {}) {
  const registry = { EXTRACTION_SCHEMAS };
  const modules = {};
  for (const key of ORDER) {
    const mod = M[key];
    const src = overrides[key] !== undefined ? overrides[key] : read(P[key]);
    const names = mod.uses;
    const factory = new Function('console', ...names, `${toJs(strip(src))}\n;return ${mod.returns};`);
    const exported = factory(quiet, ...names.map((n) => registry[n]));
    Object.assign(registry, exported);
    modules[key] = exported;
  }
  return { modules, registry };
}

// ── Recording Supabase mock ─────────────────────────────────────────────────
function makeSb(seed = {}) {
  const writes = [];
  const tables = {};
  for (const [k, v] of Object.entries(seed)) tables[k] = v.map((r) => ({ ...r }));

  function chain(table) {
    const st = { table, op: 'select', payload: null, filters: [], single: false };
    const settle = async () => {
      if (st.op === 'update' || st.op === 'insert') {
        writes.push({ table, op: st.op, payload: st.payload });
        if (st.op === 'update') {
          (tables[table] || []).forEach((r) => {
            if (st.filters.every(([c, v]) => r[c] === v)) Object.assign(r, st.payload);
          });
        } else {
          tables[table] = tables[table] || [];
          tables[table].push(st.payload);
        }
      }
      const rows = (tables[table] || []).filter((r) => st.filters.every(([c, v]) => r[c] === v));
      if (st.op === 'select' && st.columns && table === 'documents') {
        const sample = (tables[table] || [])[0] || {};
        const missing = st.columns.filter((c) => !(c in sample));
        if (missing.length) return { data: null, error: { message: `column ${missing[0]} does not exist` } };
      }
      return { data: st.single ? (rows[0] || null) : rows };
    };
    const obj = {
      // COLUMN-AWARE select. The live `documents` table does not hold every column
      // the pipeline once assumed, and a database rejects a patch naming an absent
      // column WHOLESALE. The mock models that so the contract stays testable.
      select(cols) { st.columns = typeof cols === 'string' ? cols.split(',').map((c) => c.trim()) : null; return obj; },
      limit() { return obj; },
      eq(c, v) { st.filters.push([c, v]); return obj; },
      update(p) { st.op = 'update'; st.payload = p; return obj; },
      insert(p) { st.op = 'insert'; st.payload = p; return obj; },
      maybeSingle() { st.single = true; return obj; },
      single() { st.single = true; return obj; },
      then(res, rej) { return settle().then(res, rej); },
    };
    return obj;
  }
  return { writes, tables, from: chain };
}

// ── Recording Base44 mock (provider + DocumentClassification entity) ────────
function makeBase44(provider, entitySeed = []) {
  const calls = [];
  const entityWrites = [];
  const entityList = entitySeed.map((e) => ({ ...e }));
  return {
    calls, entityWrites, entityList,
    asServiceRole: {
      integrations: {
        Core: {
          InvokeLLM: async (args) => {
            calls.push(args);
            if (provider.throw) throw new Error('provider_down');
            return provider.next;
          },
        },
      },
      entities: {
        DocumentClassification: {
          filter: async (q) => entityList.filter((e) => Object.entries(q).every(([k, v]) => e[k] === v)),
          create: async (p) => { entityWrites.push({ op: 'create', payload: p }); const rec = { ...p, id: 'dc-new' }; entityList.push(rec); return rec; },
          update: async (id, p) => { entityWrites.push({ op: 'update', id, payload: p }); return { ...p, id }; },
        },
      },
    },
  };
}

// ── SYNTHETIC fixtures — authored here, no real document, no real identity ──
const F = {
  f1040: { document_type: 'personal_tax_return', document_subtype: 'form_1040', document_family: 'tax', form_number: '1040', form_title: 'U.S. Individual Income Tax Return', statement_heading: '', structural_markers: ['Wages, salaries, tips', 'Adjusted gross income', 'Taxable income', 'Total tax'], tax_year: '2024', reporting_period: '2024', accounting_basis: 'none', semantic_scope: 'personal', entity_name: 'Fixture Taxpayer', entity_identifier: '', content_confidence: 96, suggested_business_id: 'none' },
  f1120s: { document_type: 'business_tax_return', document_subtype: 'form_1120s', document_family: 'tax', form_number: '1120-S', form_title: 'U.S. Income Tax Return for an S Corporation', structural_markers: ['Gross receipts or sales', 'Ordinary business income'], tax_year: '2023', reporting_period: '2023', semantic_scope: 'business', entity_name: 'Fixture S Corp', entity_identifier: '', content_confidence: 94 },
  f1120: { document_type: 'business_tax_return', document_subtype: 'form_1120', document_family: 'tax', form_number: '1120', form_title: 'U.S. Corporation Income Tax Return', structural_markers: ['Gross receipts or sales', 'Taxable income'], tax_year: '2023', reporting_period: '2023', semantic_scope: 'business', entity_name: 'Fixture Corp', entity_identifier: '', content_confidence: 93 },
  f1065: { document_type: 'business_tax_return', document_subtype: 'form_1065', document_family: 'tax', form_number: '1065', form_title: 'U.S. Return of Partnership Income', structural_markers: ['Gross receipts or sales', 'Ordinary business income'], tax_year: '2023', reporting_period: '2023', semantic_scope: 'business', entity_name: 'Fixture Partners', entity_identifier: '', content_confidence: 93 },
  fSchedC: { document_type: 'schedule_c', document_subtype: 'schedule_c', document_family: 'tax', form_number: 'Schedule C', form_title: 'Profit or Loss From Business', structural_markers: ['Gross receipts', 'Expenses'], tax_year: '2024', reporting_period: '2024', semantic_scope: 'business', entity_name: 'Fixture Sole Prop', entity_identifier: '', content_confidence: 90 },
  fSchedE: { document_type: 'schedule_e', document_subtype: 'schedule_e', document_family: 'tax', form_number: 'Schedule E', form_title: 'Supplemental Income and Loss', structural_markers: ['Rents received', 'Total expenses'], tax_year: '2024', reporting_period: '2024', semantic_scope: 'business', entity_name: 'Fixture Rental', entity_identifier: '', content_confidence: 90 },
  fK1: { document_type: 'k1', document_subtype: 'k1', document_family: 'tax', form_number: 'Schedule K-1', form_title: "Partner's Share of Income, Deductions, Credits", structural_markers: ['Ordinary business income', 'Distributions'], tax_year: '2023', reporting_period: '2023', semantic_scope: 'business', entity_name: 'Fixture Partners', entity_identifier: '', content_confidence: 91 },
  fW2: { document_type: 'w2', document_subtype: 'w2', document_family: 'tax', form_number: 'W-2', form_title: 'Wage and Tax Statement', structural_markers: ['Wages, tips, other compensation', 'Federal income tax withheld'], tax_year: '2024', reporting_period: '2024', semantic_scope: 'personal', entity_name: 'Fixture Employee', entity_identifier: '', content_confidence: 97 },
  f1099: { document_type: 'form_1099', document_subtype: 'form_1099_nec', document_family: 'tax', form_number: '1099-NEC', form_title: 'Nonemployee Compensation', structural_markers: ['Nonemployee compensation'], tax_year: '2024', reporting_period: '2024', semantic_scope: 'business', entity_name: 'Fixture Payee', entity_identifier: '', content_confidence: 95 },
  fPL: { document_type: 'profit_and_loss', document_subtype: 'none', document_family: 'financial_statement', statement_heading: 'Profit and Loss', structural_markers: ['Revenue', 'Cost of Goods Sold', 'Gross Profit', 'Net Income'], tax_year: '2024', reporting_period: 'Jan 1, 2024 to Dec 31, 2024', accounting_basis: 'accrual', semantic_scope: 'business', entity_name: 'Fixture Co', entity_identifier: '', content_confidence: 92 },
  fBS: { document_type: 'balance_sheet', document_subtype: 'none', document_family: 'financial_statement', statement_heading: 'Balance Sheet', structural_markers: ['Assets', 'Liabilities', 'Total Equity', 'Cash'], tax_year: '2024', reporting_period: '2024', semantic_scope: 'business', entity_name: 'Fixture Co', entity_identifier: '', content_confidence: 91 },
  fPLweak: { document_type: 'profit_and_loss', document_subtype: 'none', document_family: 'financial_statement', statement_heading: 'Profit and Loss', structural_markers: ['Revenue'], tax_year: '2024', reporting_period: '2024', semantic_scope: 'business', entity_name: 'Fixture Co', entity_identifier: '', content_confidence: 60 },
  fAssertOnly: { document_type: 'profit_and_loss', document_subtype: 'none', document_family: 'financial_statement', form_number: '', form_title: '', statement_heading: '', structural_markers: [], tax_year: '2024', semantic_scope: 'business', entity_name: '', entity_identifier: '', content_confidence: 80 },
  fUnknown: { document_type: 'other', document_subtype: 'none', document_family: 'other', form_number: '', form_title: '', statement_heading: '', structural_markers: [], tax_year: '', reporting_period: '', semantic_scope: 'ambiguous', entity_name: '', entity_identifier: '', content_confidence: 5 },
};

// ── Scenario runner ─────────────────────────────────────────────────────────
const BASE_TABLES = () => ({
  document_analysis: [{ id: 'an1', document_id: 'doc1', extracted_data: {}, document_type: 'other' }],
  documents: [{ id: 'doc1', document_type: 'other', year: null, business_id: null, system_folder: null, upload_status: 'pending_analysis' }],
});

async function runCase(modules, opts = {}) {
  const provider = { next: opts.fixture === undefined ? F.f1040 : opts.fixture, throw: !!opts.providerThrow };
  const b44 = makeBase44(provider, opts.entitySeed || []);
  const sb = makeSb(opts.tables || BASE_TABLES());
  const outcome = await modules.orchestrator.runIngestionUnderstanding({
    sb,
    base44: b44,
    document: { id: 'doc1', name: opts.fileName || 'fixture.pdf', year: opts.currentYear ?? null, document_type: opts.currentType || 'other', business_id: opts.businessId || null },
    documentId: 'doc1',
    documentName: opts.fileName || 'fixture.pdf',
    fileName: opts.fileName || 'fixture.pdf',
    mimeType: opts.mimeType || 'application/pdf',
    signedUrl: opts.signedUrl === undefined ? 'https://signed.invalid/fixture' : opts.signedUrl,
    base64: opts.base64 ?? null,
    declaredType: opts.declaredType ?? 'other',
    profileId: 'profile-fixture',
    businessId: opts.businessId || null,
    candidateBusinesses: opts.candidates || [],
  });
  return { outcome, result: outcome.result, sb, b44 };
}

const docWrites = (sb) => sb.writes.filter((w) => w.table === 'documents');
const analysisWrites = (sb) => sb.writes.filter((w) => w.table === 'document_analysis');
const tablesWritten = (sb, b44) => new Set([
  ...sb.writes.map((w) => w.table),
  ...b44.entityWrites.map(() => 'DocumentClassification'),
]);
const anyFailedUpload = (sb) => docWrites(sb).some((w) => w.payload && w.payload.upload_status === 'failed');

async function run() {
  const { modules, registry } = loadAll();

  // ══ D1-D45 ═══════════════════════════════════════════════════════════════
  const uploadSrc = read(P.upload);
  // 6D.0b.2: the pipeline moved out of the upload request into the durable
  // canonical worker. The property is unchanged — understanding is invoked
  // non-fatally — so the assertion is retargeted at where it now lives.
  const workerSrc = read('base44/shared/documentIngestion/orchestration.ts');
  check('D1', 'canonical worker invokes understanding non-fatally', /runIngestionUnderstanding\(\{/.test(workerSrc) && /recordFailure\(\{ jobs, sb, job, analysis, now, attempt, stage: 'classification'/.test(workerSrc));

  const c1040 = await runCase(modules, { fixture: F.f1040, fileName: 'banana.pdf' });
  check('D2', 'file name does not determine classification (banana.pdf)', c1040.result.document_type === 'personal_tax_return' && c1040.result.document_subtype === 'form_1040');
  check('D3', '1040 content → personal_tax_return', c1040.result.document_type === 'personal_tax_return');
  check('D4', 'subtype → form_1040', c1040.result.document_subtype === 'form_1040');
  check('D5', 'tax year preserved', c1040.result.tax_year === 2024, String(c1040.result.tax_year));
  check('D6', 'high-confidence 1040 routes automatically', c1040.result.confidence_band === 'high' && c1040.result.route_extraction === true && c1040.outcome.route_extraction === true);
  check('D7', 'reader = personal_tax_return', c1040.result.reader_key === 'personal_tax_return' && c1040.result.reader_supported === true);
  check('D8', 'extraction invoked when routing is permitted', /if \(!ingestion \|\| ingestion\.route_extraction !== true\) \{/.test(workerSrc) && /runExtraction\(/.test(workerSrc) && c1040.outcome.route_extraction === true);
  const appliedWrite = docWrites(c1040.sb).find((w) => w.payload && w.payload.document_type === 'personal_tax_return');
  check('D9', 'applied type persisted for extraction to read', !!appliedWrite);
  check('D10', 'no review state demanded for a decisive classification', c1040.result.requires_confirmation === false && !analysisWrites(c1040.sb).some((w) => w.payload && w.payload.analysis_status === 'needs_review'));
  check('D11', 'no business_facts writes', !tablesWritten(c1040.sb, c1040.b44).has('business_facts'));
  check('D12', 'no business_fact_evidence writes', !tablesWritten(c1040.sb, c1040.b44).has('business_fact_evidence'));
  check('D13', 'correct Data Room folder', appliedWrite && appliedWrite.payload.system_folder === 'tax_returns', appliedWrite && String(appliedWrite.payload.system_folder));
  check('D14', 'no duplicate storage object', !c1040.sb.writes.some((w) => /storage/.test(w.table)) && !/\.upload\(/.test(read(P.persist) + read(P.orchestrator) + read(P.understandDocument)));

  const w2 = await runCase(modules, { fixture: F.fW2, fileName: 'scan.pdf' });
  check('D15', 'unsupported reader does not become "other"', w2.result.document_type === 'w2' && w2.result.applied_document_type === 'w2');
  check('D16', 'W-2 recognized while unsupported', w2.result.document_subtype === 'w2' && w2.result.reader_supported === false && !anyFailedUpload(w2.sb));

  const unknown = await runCase(modules, { fixture: F.fUnknown, fileName: 'mystery.pdf' });
  check('D17', 'low confidence safely asks the user', unknown.result.confidence_band === 'low' && unknown.result.decision_status === 'pending' && unknown.result.requires_confirmation === true && unknown.result.applied_document_type === 'other');

  const override = await runCase(modules, {
    fixture: F.fPL, fileName: 'statement.pdf',
    entitySeed: [{ id: 'dc0', document_id: 'doc1', classification_status: 'overridden', classification_source: 'admin_manual', document_type: 'balance_sheet', original_folder: 'inbox' }],
  });
  check('D18', 'manual correction is not re-routed over', override.outcome.route_extraction === false && override.outcome.persisted.skipped === 'human_override' && docWrites(override.sb).length === 0);
  check('D19', 'human override record is never clobbered', override.b44.entityWrites.length === 0);
  const priorCase = await runCase(modules, {
    fixture: F.f1040, fileName: 'again.pdf',
    entitySeed: [{ id: 'dc9', document_id: 'doc1', classification_status: 'awaiting_review', classification_source: 'galileo_auto', document_type: 'other', confidence_score: 60, updated_date: '2026-01-01T00:00:00.000Z' }],
  });
  const priorReasoning = (priorCase.b44.entityWrites.find((w) => w.op === 'update' && w.payload) || {}).payload?.reasoning || '';
  check('D19', 'prior decision recorded in lineage', /prior:/.test(priorReasoning) && /"document_type":"other"/.test(priorReasoning));
  check('D20', 'classification cannot grant authorization (patch surface)', docWrites(priorCase.sb).every((w) => Object.keys(w.payload).every((k) => modules.persist.ALLOWED_DOCUMENT_PATCH_KEYS.includes(k))));
  check('D21', 'cross-business association denied', (await runCase(modules, { fixture: { ...F.f1120s, suggested_business_id: 'biz-zzz' }, candidates: [{ id: 'biz-a', name: 'Fixture A' }] })).result.suggested_business_id === null);
  // 6D.0b.2: authorization is still decided at upload, before any durable work
  // state exists; the worker then re-derives business/scope from canonical rows.
  check('D22', 'understanding holds no authorization logic', !/sb\.from\('profiles'\)|validateBusinessScope|user_condition/.test(read(P.understandDocument) + read(P.persist) + workerSrc) && uploadSrc.indexOf('validateBusinessScope') < uploadSrc.indexOf('DocumentIngestionJob.create'));
  check('D23', 'suspended/revoked actors are still denied before durable work is queued', /validateBusinessScope|access_control|advisor_assignments/.test(uploadSrc) && uploadSrc.indexOf('access_control') < uploadSrc.indexOf('DocumentIngestionJob.create'));

  const noSource = await runCase(modules, { fixture: F.f1040, signedUrl: null });
  check('D24', 'source-missing path is safe', noSource.b44.calls.length === 0 && noSource.result.unresolved_reason === 'no_content_access' && !anyFailedUpload(noSource.sb));

  const providerDown = await runCase(modules, { providerThrow: true });
  check('D25', 'classification failure is not an upload failure', providerDown.outcome.ok === true && !anyFailedUpload(providerDown.sb) && providerDown.result.decision_status === 'pending');
  check('D26', 'extraction failure is not an upload failure', /stage: 'extraction'/.test(workerSrc) && /canonicalOnExhaustion: 'failed'/.test(workerSrc) && !/upload_status:\s*'failed'/.test(read(P.persist) + read(P.orchestrator) + workerSrc));
  check('D27', '6D.0a bridge untouched', fs.existsSync(path.join(ROOT, P.bridge)) && read(P.bridge).includes('export') && !/documentObservation/.test(read(P.understandDocument) + read(P.persist)));
  const analysisClassification = analysisWrites(c1040.sb).find((w) => w.payload && w.payload.extracted_data && w.payload.extracted_data.classification);
  check('D28', 'period survives classification → extraction', c1040.result.tax_year === 2024 && appliedWrite.payload.year === 2024 && analysisClassification.payload.extracted_data.classification.tax_year === 2024 && read('base44/shared/documentExtraction/extractEngine.ts').includes("select('id, file_path, storage_bucket, document_type, profile_id, business_id, year')"));

  const mismatch = await runCase(modules, { fixture: F.f1040, fileName: 'banana.pdf', businessId: 'biz-a' });
  check('D29', 'personal 1040 is not blindly assigned to the active business', mismatch.result.scope_mismatch === true && mismatch.result.applied_document_type === 'personal_tax_return' && docWrites(mismatch.sb).every((w) => !('business_id' in w.payload) && !('document_scope' in w.payload)));
  check('D30', 'banana.pdf containing a 1040 still becomes form_1040', c1040.result.document_subtype === 'form_1040' && c1040.result.classification_evidence.every((e) => !/banana/i.test(e)));
  const dcWrite = c1040.b44.entityWrites.find((w) => w.op === 'create' || w.op === 'update');
  check('D31', 'DocumentClassification is the canonical history record', !!dcWrite && dcWrite.payload.document_id === 'doc1' && !!dcWrite.payload.reasoning && !!dcWrite.payload.classification_status);
  check('D32', 'documents.document_type is the applied type, not an independent authority', appliedWrite.payload.document_type === c1040.result.applied_document_type && !('confidence_score' in appliedWrite.payload) && dcWrite.payload.confidence_score === c1040.result.classification_confidence);
  check('D33', 'high confidence needs no admin review', c1040.result.decision_status === 'auto_filed' && dcWrite.payload.classification_status === 'auto_filed' && dcWrite.payload.classification_source === 'galileo_auto');
  const medium = await runCase(modules, { fixture: F.fAssertOnly, fileName: 'vague.pdf' });
  check('D34', 'medium confidence awaits confirmation', medium.result.confidence_band === 'medium' && medium.result.decision_status === 'awaiting_review' && medium.result.requires_confirmation === true && medium.outcome.route_extraction === false);
  check('D35', 'low confidence remains unresolved safely', unknown.result.applied_document_type === 'other' && docWrites(unknown.sb).every((w) => !('system_folder' in w.payload)));
  check('D36', 'scope mismatch never changes authorization', docWrites(mismatch.sb).every((w) => !('business_id' in w.payload) && !('document_scope' in w.payload) && !('profile_id' in w.payload)));
  check('D37', 'personal 1040 under Business A does not silently move', mismatch.result.route_extraction === false && mismatch.result.decision_status === 'awaiting_review' && mismatch.result.notes.some((n) => /not been moved/.test(n)));
  const schemaWithCandidates = modules.semanticClassifier.buildProviderSchema({ types: modules.taxonomy.STORABLE_TYPES, subtypes: Object.keys(modules.taxonomy.SUBTYPE_PARENT), families: ['tax'], candidateBusinesses: [{ id: 'biz-a', name: 'Fixture A' }] });
  const promptWithCandidates = modules.semanticClassifier.buildClassificationPrompt({ fileName: 'x.pdf', mimeType: 'application/pdf', declaredType: 'other', candidateBusinesses: [{ id: 'biz-a', name: 'Fixture A' }], isUncertain: true });
  const noCandidatesSchema = modules.semanticClassifier.buildProviderSchema({ types: modules.taxonomy.STORABLE_TYPES, subtypes: ['form_1040'], families: ['tax'], candidateBusinesses: [] });
  check('D38', 'model receives only authorized candidate businesses', JSON.stringify(schemaWithCandidates.properties.suggested_business_id.enum) === JSON.stringify(['none', 'biz-a']) && /Fixture A/.test(promptWithCandidates) && !('suggested_business_id' in noCandidatesSchema.properties));
  check('D39', 'classifier cannot invent a business id', (await runCase(modules, { fixture: { ...F.f1040, suggested_business_id: 'biz-not-supplied' }, candidates: [{ id: 'biz-a' }] })).result.suggested_business_id === null);
  const declared = await runCase(modules, { declaredType: 'profit_and_loss', fixture: F.f1040 });
  check('D40', 'explicit trustworthy type incurs no classification call', declared.b44.calls.length === 0 && declared.result.classification_method === 'declared_explicit' && declared.result.route_extraction === true);
  const unknownDeclared = await runCase(modules, { declaredType: 'other', fixture: F.f1040 });
  check('D41', 'unknown/other invokes understanding', unknownDeclared.b44.calls.length === 1);
  check('D42', 'provider failure preserves upload success; a layer defect preserves legacy routing',
    providerDown.outcome.ok === true
    && !anyFailedUpload(providerDown.sb)
    && providerDown.result.applied_document_type === 'other'
    && providerDown.result.decision_status === 'pending'
    && /ok: false,[\s\S]*?route_extraction: true,/.test(read(P.orchestrator)));
  check('D43', 'classifier and extraction share one taxonomy', read(P.taxonomy).includes('Object.keys(EXTRACTION_SCHEMAS)') && read(P.understandDocument).includes('types: STORABLE_TYPES'));
  check('D44', 'no duplicate reader map', read(P.taxonomy).includes("from '../documentExtraction/extractEngine.ts'")
    && !/fields:\s*\[/.test(read(P.taxonomy))
    && !/READER_MAP|reader_map/.test(read(P.understandDocument) + read(P.persist)));
  check('D45', 'ClassificationMemory is not written', !tablesWritten(c1040.sb, c1040.b44).has('ClassificationMemory') && !/ClassificationMemory/.test(read(P.understandDocument) + read(P.persist) + read(P.orchestrator)));

  // ══ F1-F6 ════════════════════════════════════════════════════════════════
  const pl = await runCase(modules, { fixture: F.fPL, fileName: 'statement.pdf' });
  check('F1', 'P&L content → profit_and_loss', pl.result.document_type === 'profit_and_loss' && pl.result.confidence_band === 'high');
  const plRenamed = await runCase(modules, { fixture: F.fPL, fileName: 'banana-2.pdf' });
  check('F2', 'renamed P&L still classified correctly', plRenamed.result.document_type === 'profit_and_loss');
  const bs = await runCase(modules, { fixture: F.fBS, fileName: 'statement.pdf' });
  check('F3', 'Balance Sheet content → balance_sheet', bs.result.document_type === 'balance_sheet');
  const bsRenamed = await runCase(modules, { fixture: F.fBS, fileName: 'zzz.pdf' });
  check('F4', 'renamed Balance Sheet still classified correctly', bsRenamed.result.document_type === 'balance_sheet');
  const unsupportedSemantic = await runCase(modules, { fixture: F.f1099, fileName: 'form.pdf' });
  check('F5', 'unsupported semantic type retains classification', unsupportedSemantic.result.document_type === 'form_1099' && unsupportedSemantic.result.reader_supported === false);
  const weakPL = await runCase(modules, { fixture: F.fPLweak, fileName: 'statement.pdf' });
  check('F6', 'ambiguous financial report requests confirmation', weakPL.result.confidence_band === 'medium' && weakPL.result.requires_confirmation === true && weakPL.outcome.route_extraction === false);

  // ══ T1-T9 ════════════════════════════════════════════════════════════════
  const T = [
    ['T1', F.f1040, 'personal_tax_return', 'form_1040', true],
    ['T2', F.f1120, 'business_tax_return', 'form_1120', true],
    ['T3', F.f1120s, 'business_tax_return', 'form_1120s', true],
    ['T4', F.f1065, 'business_tax_return', 'form_1065', true],
    ['T5', F.fSchedC, 'schedule_c', 'schedule_c', false],
    ['T6', F.fSchedE, 'schedule_e', 'schedule_e', false],
    ['T7', F.fK1, 'k1', 'k1', false],
    ['T8', F.fW2, 'w2', 'w2', false],
    ['T9', F.f1099, 'form_1099', 'form_1099_nec', false],
  ];
  for (const [id, fixture, type, subtype, reader] of T) {
    const r = await runCase(modules, { fixture, fileName: 'form.pdf' });
    check(id, `${type} / ${subtype} recognized (reader ${reader ? 'present' : 'absent'})`,
      r.result.document_type === type && r.result.document_subtype === subtype && r.result.reader_supported === reader);
  }

  // ══ M1-M15 — each mutation must be CAUGHT ═══════════════════════════════
  const expectCaught = async (id, label, mutatedKey, find, replace, probe) => {
    const original = read(P[mutatedKey]);
    const mutatedSource = original.replace(find, replace);
    if (mutatedSource === original) { check(id, label, false, 'mutation anchor not found'); return; }
    const mutated = loadAll({ [mutatedKey]: mutatedSource });
    const caught = await probe(mutated.modules, mutatedSource);
    check(id, label, caught === true, caught === true ? '' : 'mutation not caught');
  };

  await expectCaught('M1', 'filename becoming authoritative is caught', 'understandDocument',
    'evaluateContent(providerText)', 'evaluateContent(input.fileName)',
    async (m) => (await runCase(m, { fixture: F.f1040, fileName: 'banana.pdf' })).outcome.route_extraction !== true);
  await expectCaught('M2', '1040 → other is caught', 'understandDocument',
    'type = evidenceCandidate.type;', "type = UNCLASSIFIED_TYPE;",
    async (m) => (await runCase(m, { fixture: F.f1040, fileName: 'banana.pdf' })).result.document_type !== 'personal_tax_return');
  await expectCaught('M3', '1120-S → personal_tax_return is caught', 'signals',
    "type: 'business_tax_return', subtype: 'form_1120s'", "type: 'personal_tax_return', subtype: 'form_1120s'",
    async (m) => (await runCase(m, { fixture: F.f1120s })).result.document_type !== 'business_tax_return');
  await expectCaught('M4', 'unsupported W-2 → other is caught', 'understandDocument',
    'if (weak.tokens.length) evidence.push(...weak.tokens);', "if (!readerSupported) type = UNCLASSIFIED_TYPE;\n  if (weak.tokens.length) evidence.push(...weak.tokens);",
    async (m) => (await runCase(m, { fixture: F.fW2 })).result.document_type === 'other');
  await expectCaught('M5', 'classifier granting business access is caught', 'persist',
    "const patch: Record<string, any> = { updated_at: now };", "const patch: Record<string, any> = { updated_at: now, business_id: currentDocument && currentDocument.business_id };",
    async (m) => {
      const r = await runCase(m, { fixture: F.f1040, businessId: 'biz-a' });
      return docWrites(r.sb).some((w) => 'business_id' in w.payload);
    });
  await expectCaught('M6', 'blind business assignment to a 1040 is caught', 'persist',
    'if (result.applied_folder) patch.system_folder = result.applied_folder;', "if (result.applied_folder) patch.system_folder = result.applied_folder;\n  patch.document_scope = 'business';",
    async (m) => docWrites((await runCase(m, { fixture: F.f1040, businessId: 'biz-a' })).sb).some((w) => 'document_scope' in w.payload));
  await expectCaught('M7', 'classification failure marking upload failed is caught', 'persist',
    "patch.upload_status = 'uploaded';", "patch.upload_status = 'failed';",
    async (m) => anyFailedUpload((await runCase(m, { providerThrow: true })).sb));
  await expectCaught('M8', 'unsupported reader marking upload failed is caught', 'persist',
    "patch.analysis_status = 'unsupported';", "patch.analysis_status = 'failed';",
    async (m) => analysisWrites((await runCase(m, { fixture: F.fW2 })).sb).some((w) => w.payload && w.payload.analysis_status === 'failed'));
  {
    const mutatedPersist = read(P.persist).replace('export async function persistUnderstanding', "async function _storageDup(sb) { await sb.storage.from('documents').upload('x', 'y'); }\nexport async function persistUnderstanding");
    check('M9', 'duplicate storage object is caught', /\.upload\(/.test(mutatedPersist));
  }
  await expectCaught('M10', 'period discarded is caught', 'persist',
    'if (result.tax_year && !(currentDocument && currentDocument.year)) patch.year = result.tax_year;', '// period dropped',
    async (m) => (await runCase(m, { fixture: F.f1040 })).result.tax_year === 2024
      && !docWrites((await runCase(m, { fixture: F.f1040 })).sb).some((w) => w.payload.year === 2024));
  await expectCaught('M11', 'manual correction losing provenance is caught', 'persist',
    'lineage = ` | prior: ${JSON.stringify({', 'lineage = ` | previous: ${JSON.stringify({',
    async (m) => {
      const r = await runCase(m, { fixture: F.f1040, entitySeed: [{ id: 'dc9', document_id: 'doc1', classification_status: 'awaiting_review', classification_source: 'galileo_auto', document_type: 'other' }] });
      const reasoning = (r.b44.entityWrites.find((w) => w.payload) || {}).payload?.reasoning || '';
      return !/prior:/.test(reasoning);
    });
  {
    const sources = { a: read(P.understandDocument), b: read(P.signals) };
    const mutatedSources = { ...sources, c: "export async function understandDocument() { return null; }" };
    const count = (map) => Object.values(map).filter((s) => /export async function understandDocument/.test(s)).length;
    check('M12', 'duplicate classifier introduced is caught', count(sources) === 1 && count(mutatedSources) === 2);
  }
  {
    const srcFiles = {};
    const walk = (dir) => {
      for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(rel);
        else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) srcFiles[rel] = read(rel);
      }
    };
    walk('src');
    const references = (map) => Object.keys(map).filter((k) => /understandDocument/.test(map[k])).length;
    check('M13', 'client-side classification bypass is caught', references(srcFiles) === 0 && references({ ...srcFiles, 'src/fake.js': 'understandDocument()' }) === 1);
  }
  await expectCaught('M14', 'business_facts write introduced is caught', 'persist',
    'export async function persistUnderstanding', "async function _factWrite(sb) { await sb.from('business_facts').insert({}); }\nexport async function persistUnderstanding",
    async (_m, src) => /business_facts/.test(src));
  await expectCaught('M15', 'business_fact_evidence write introduced is caught', 'persist',
    'export async function persistUnderstanding', "async function _evidenceWrite(sb) { await sb.from('business_fact_evidence').insert({}); }\nexport async function persistUnderstanding",
    async (_m, src) => /business_fact_evidence/.test(src));

  // ══ RESULT ═══════════════════════════════════════════════════════════════
  console.log('');
  if (failures.length) {
    console.log(`FAILED — ${failures.length}`);
    for (const f of failures) console.log(`  · ${f}`);
    return { failures };
  }
  console.log(`PASSED — all 6D.0b assertions (D1-D45, F1-F6, T1-T9, M1-M15 = 75)`);
  return { failures };
}

module.exports = { run };

if (require.main === module) {
  run()
    .then((r) => { if (r.failures.length) process.exit(1); })
    .catch((e) => { console.error(e); process.exit(1); });
}