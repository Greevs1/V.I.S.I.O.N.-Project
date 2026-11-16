#!/usr/bin/env node
/**
 * documentUploadClassification.test.cjs — VISION 6D.0 classification hotfix.
 *
 * Run:  node scripts/documentUploadClassification.test.cjs
 *
 * OFFLINE AND NON-DESTRUCTIVE. No network, no database, no Base44 call, no
 * production record read, written or deleted. Production documents are never
 * used as fixtures: every scenario runs against an in-memory recording mock.
 *
 * THE CODE UNDER TEST IS THE SHIPPED CODE, compiled from its real source
 * (esbuild) and executed:
 *
 *   1. `src/lib/documents/documentTypes.js` — the frontend vocabulary and the
 *      upload/analysis state derivation, executed directly.
 *   2. `base44/shared/documents/documentTypes.ts` — the backend vocabulary, with
 *      the REAL EXTRACTION_SCHEMAS injected, so "does a reader exist?" is answered
 *      by the engine's own schema map.
 *   3. `base44/shared/documentExtraction/extractEngine.ts` — the REAL runExtraction,
 *      executed end-to-end against a recording Supabase mock.
 *   4. The REAL Security Kernel (authenticateActor / authorizeDocumentAccess /
 *      assertBusinessAccess) with the REAL runDocumentExtraction handler, so
 *      cross-business, suspended-actor and revoked-expert refusals are observed.
 *
 * EVIDENCE CLASS: UNIT/MOCK (real modules executed) + SOURCE-SEGMENT EXECUTION +
 * STATIC + MUTATION.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const esbuild = require('esbuild');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const git = (args) => execFileSync('git', args, { cwd: ROOT, maxBuffer: 32 * 1024 * 1024 }).toString();
const quiet = { log() {}, warn() {}, error() {}, info() {} };

const P = {
  FE_TYPES: 'src/lib/documents/documentTypes.js',
  FE_UPLOAD: 'src/pages/DocumentUpload.jsx',
  FE_DATAROOM: 'src/pages/DataRoom.jsx',
  FE_UPLOADCFG: 'src/components/documents/uploadConfig.jsx',
  BE_TYPES: 'base44/shared/documents/documentTypes.ts',
  ENGINE: 'base44/shared/documentExtraction/extractEngine.ts',
  STATE: 'base44/shared/documentExtraction/analysisState.ts',
  PERIOD: 'base44/shared/documentExtraction/periodIntegrity.ts',
  CONFIDENCE: 'base44/shared/documentExtraction/extractionConfidence.ts',
  UPLOAD_FN: 'base44/functions/uploadDocumentToSupabase/entry.ts',
  ROUTER: 'base44/functions/supabaseUserData/entry.ts',
  ENTRY: 'base44/functions/runDocumentExtraction/entry.ts',
  HOOK: 'src/hooks/useDocumentViewer.js',
  VIEWER: 'src/components/documents/DocumentViewer.jsx',
  ACTOR: 'base44/shared/authz/actor.ts',
  DOCACCESS: 'base44/shared/authz/documentAccess.ts',
  BUCKETS: 'base44/shared/documents/buckets.ts',
  GUARD: 'base44/shared/businessScope/writeGuard.ts',
  ACTIVE: 'base44/shared/businessScope/activeBusiness.ts',
  REL: 'base44/shared/businessScope/relationshipAccess.ts',
  TEST: 'scripts/documentUploadClassification.test.cjs',
  REPORT: 'VISION_DOCUMENT_UPLOAD_CLASSIFICATION_HOTFIX.md',
};

const failures = [];
const check = (id, label, ok, detail = '') => {
  if (!ok) failures.push(`${id} ${label}${detail ? ` — ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${String(id).padEnd(5)} ${label}${!ok && detail ? ` — ${detail}` : ''}`);
};

const strip = (s) => s.replace(/^\s*import[\s\S]*?from\s+'[^']+';/gm, '').replace(/^\s*export\s+/gm, '');
const toJs = (s, loader = 'ts') => esbuild.transformSync(s, { loader, format: 'cjs', target: 'es2020' }).code;

/** Every source the harness reads, overridable so mutations can substitute text. */
function sources(overrides = {}) {
  const s = {};
  for (const k of Object.keys(P)) {
    if (overrides[k] !== undefined) { s[k] = overrides[k]; continue; }
    // A file that does not exist yet (e.g. this slice's report before it is
    // written) is simply absent — never a reason to fail the harness.
    try { s[k] = read(P[k]); } catch (e) { s[k] = ''; }
  }
  return s;
}

// ─────────────────────────────────────────────────────────────────────────────
// Loaders — real modules, real schema map
// ─────────────────────────────────────────────────────────────────────────────
function loadModule(src, depNames, depValues, returns) {
  const factory = new Function('console', ...depNames, `${toJs(strip(src))}\n;return (${returns});`);
  return factory(quiet, ...depValues);
}

/** The real engine, with its three 6D.0 modules and injected vocabulary. */
function loadEngine(src = read(P.ENGINE)) {
  const periodApi = loadModule(src === read(P.ENGINE) ? read(P.PERIOD) : src.PERIOD ?? read(P.PERIOD), ['isApprovedDocumentBucket'], [() => true],
    '{ resolveReportingPeriod, periodMetadata, derivePeriodFromType }');
  const confApi = loadModule(read(P.CONFIDENCE), [], [],
    '{ resolveFieldConfidence, REVIEWED_REVIEW_STATUSES, PERIOD_REQUIRED_TYPES, MODEL_CONFIDENCE_REVIEW_THRESHOLD }');
  const stateApi = loadModule(read(P.STATE), [], [], '{ countExtractedFields, setDocumentUploadStatus, markAnalysis }');
  const factory = new Function(
    'console', 'isApprovedDocumentBucket', 'resolveReportingPeriod', 'periodMetadata', 'resolveFieldConfidence',
    'REVIEWED_REVIEW_STATUSES', 'PERIOD_REQUIRED_TYPES', 'MODEL_CONFIDENCE_REVIEW_THRESHOLD',
    'countExtractedFields', 'setDocumentUploadStatus', 'markAnalysis',
    `${toJs(strip(src))};return ({ runExtraction, EXTRACTION_SCHEMAS });`
  );
  const api = factory(
    quiet,
    (b) => ['documents', 'client-documents', 'consulting_library_files'].includes(b),
    periodApi.resolveReportingPeriod, periodApi.periodMetadata, confApi.resolveFieldConfidence,
    confApi.REVIEWED_REVIEW_STATUSES, confApi.PERIOD_REQUIRED_TYPES, confApi.MODEL_CONFIDENCE_REVIEW_THRESHOLD,
    stateApi.countExtractedFields, stateApi.setDocumentUploadStatus, stateApi.markAnalysis
  );
  return api;
}

/** The backend vocabulary, given the engine's REAL schema map. */
function loadBackendTypes(src, schemas) {
  const factory = new Function('console', 'EXTRACTION_SCHEMAS',
    `${toJs(strip(src))};return ({ STORABLE_DOCUMENT_TYPES, UNCLASSIFIED_DOCUMENT_TYPE, UNCLASSIFIED_DOCUMENT_TYPES, READABLE_DOCUMENT_TYPES, normalizeDocumentType, isReadableDocumentType, isUnclassifiedDocumentType });`);
  return factory(quiet, schemas);
}

/** The frontend vocabulary + the upload/analysis state derivation. */
function loadFrontendTypes(src) {
  const exportsList = '{ AUTO_DETECT_DOCUMENT_TYPE, DOCUMENT_TYPES, READABLE_DOCUMENT_TYPES, STORABLE_DOCUMENT_TYPES, isReadableDocumentType, documentTypeLabel, ANALYSIS_STATE, resolveDocumentStates }';
  const factory = new Function('console', 'module', 'exports',
    `${toJs(src, 'js')}\n;return (module.exports && module.exports.DOCUMENT_TYPES) ? module.exports : (${exportsList});`);
  const mod = { exports: {} };
  return factory(quiet, mod, mod.exports);
}

// ─────────────────────────────────────────────────────────────────────────────
// Recording Supabase mock
// ─────────────────────────────────────────────────────────────────────────────
function makeSb(seed = {}, opts = {}) {
  const writes = [];
  const reads = [];
  const storageCalls = [];
  const tables = {};
  for (const [k, v] of Object.entries(seed)) tables[k] = v.map((r) => ({ ...r }));

  function query(table) {
    const st = { table, filters: [], op: 'select', payload: null, single: false };
    const rows = () => (tables[table] || []).filter((r) => st.filters.every(([c, v]) => r[c] === v));
    const settle = () => {
      if (['insert', 'update', 'delete', 'upsert'].includes(st.op)) writes.push({ table, op: st.op, payload: st.payload, filters: st.filters.slice() });
      else reads.push({ table, filters: st.filters.slice() });
      if (st.op === 'insert') {
        const list = Array.isArray(st.payload) ? st.payload : [st.payload];
        const created = list.map((r, i) => ({ id: r.id || `${table}-new-${writes.length}-${i}`, ...r }));
        (tables[table] = tables[table] || []).push(...created);
        return { data: st.single ? created[0] : created, error: null };
      }
      if (st.op === 'update') { for (const r of rows()) Object.assign(r, st.payload); return { data: null, error: null }; }
      if (st.op === 'delete') { tables[table] = (tables[table] || []).filter((r) => !st.filters.every(([c, v]) => r[c] === v)); return { data: null, error: null }; }
      const list = rows();
      return { data: st.single ? (list[0] ?? null) : list, count: list.length, error: null };
    };
    const b = {
      select: () => b, eq: (c, v) => { st.filters.push([c, v]); return b; }, in: () => b, order: () => b,
      limit: () => b, is: () => b, neq: () => b, ilike: () => b,
      insert: (p) => { st.op = 'insert'; st.payload = p; return b; },
      update: (p) => { st.op = 'update'; st.payload = p; return b; },
      delete: () => { st.op = 'delete'; return b; },
      upsert: (p) => { st.op = 'upsert'; st.payload = p; return b; },
      single: () => { st.single = true; return Promise.resolve(settle()); },
      maybeSingle: () => { st.single = true; return Promise.resolve(settle()); },
      then: (res, rej) => Promise.resolve(settle()).then(res, rej),
    };
    return b;
  }

  const queue = opts.storageQueue ? [...opts.storageQueue] : [];
  const storage = {
    from: (bucket) => ({
      createSignedUrl: async (p, ttl) => {
        storageCalls.push({ bucket, path: p, ttl });
        const next = queue.shift();
        if (next && next.error) return { data: null, error: next.error };
        return { data: { signedUrl: (next && next.signedUrl) || `https://signed.example/${bucket}/${p}?ttl=${ttl}` }, error: null };
      },
    }),
  };

  return { sb: { from: query, storage }, writes, reads, storageCalls, writesTo: (t) => writes.filter((w) => w.table === t) };
}

/** One real extraction run for one document type. */
async function runEngine(engine, schemas, { documentType = 'profit_and_loss', uploadStatus = 'pending_analysis', bucket = 'documents', extractor = null, storageQueue = [] } = {}) {
  const document = {
    id: 'doc-1', name: 'D.pdf', document_type: documentType, file_path: 'p/b/1_D.pdf',
    storage_bucket: bucket, profile_id: 'p-1', business_id: 'b-1', year: null,
  };
  const analysis = {
    id: 'an-1', document_id: 'doc-1', document_type: documentType, analysis_status: uploadStatus,
    status: uploadStatus, profile_id: 'p-1', business_id: 'b-1', extracted_data: {},
  };
  const world = makeSb(
    { documents: [document], document_analysis: [analysis], extracted_fields: [], business_facts: [], business_fact_evidence: [] },
    { storageQueue }
  );

  const calls = { n: 0 };
  const output = { reporting_period: 'Jan 2025 - Dec 2025' };
  const schema = schemas[documentType];
  if (schema) for (const f of schema.fields) if (f.type === 'currency') output[f.name] = '$1,000';

  const base44 = {
    asServiceRole: {
      integrations: {
        Core: {
          ExtractDataFromUploadedFile: async () => {
            calls.n++;
            if (extractor) return extractor();
            return { output };
          },
        },
      },
    },
  };

  const result = await engine.runExtraction(world.sb, {
    documentAnalysisId: 'an-1', documentId: 'doc-1', documentType,
    profileId: 'p-1', businessId: 'b-1', year: null,
  }, { base44 });

  const lastAnalysis = world.writesTo('document_analysis').slice(-1)[0];
  const lastDoc = world.writesTo('documents').slice(-1)[0];
  return {
    result, world, extractorCalls: calls.n,
    analysisPayload: (lastAnalysis && lastAnalysis.payload) || {},
    docStatus: lastDoc ? lastDoc.payload.upload_status : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Security Kernel (real sources) + the real runDocumentExtraction handler
// ─────────────────────────────────────────────────────────────────────────────
const ResponseStub = { json: (body, init = {}) => ({ status: init.status || 200, body, json: async () => body }) };

function compileKernel(s) {
  const relApi = vm.runInNewContext(`${toJs(strip(s.REL))};({ resolveActiveExpertRelationship })`,
    { console: quiet, Response: ResponseStub });
  const guardApi = vm.runInNewContext(`${toJs(strip(s.GUARD))};({ validateBusinessScope })`,
    { console: quiet, Response: ResponseStub, resolveActiveExpertRelationship: relApi.resolveActiveExpertRelationship, Deno: { env: { get: () => undefined } } });
  const activeApi = vm.runInNewContext(`${toJs(strip(s.ACTIVE))};({ assertBusinessAccess })`,
    { console: quiet, Response: ResponseStub, validateBusinessScope: guardApi.validateBusinessScope });
  const actorApi = vm.runInNewContext(`${toJs(strip(s.ACTOR))};({ authenticateActor, errorResponse })`,
    { console: quiet, Response: ResponseStub, validateBusinessScope: guardApi.validateBusinessScope });
  const docApi = vm.runInNewContext(`${toJs(strip(s.DOCACCESS))};({ authorizeDocumentAccess })`,
    { console: quiet, Response: ResponseStub });
  return { ...activeApi, ...actorApi, ...docApi };
}

const BUSINESS = 'b-A';
const OTHER_BUSINESS = 'b-B';
const IDENTITIES = {
  ownerA: { id: 'u-ownerA', email: 'ownera@vision.test' },
  suspended: { id: 'u-susp', email: 'susp@vision.test' },
  expertRev: { id: 'u-expert-rev', email: 'expertrev@vision.test' },
};
const AUTHZ_SEED = {
  profiles: [
    { id: 'p-owner', email: 'ownera@vision.test', base44_user_id: 'u-ownerA', app_role: 'owner', primary_business_id: BUSINESS, profile_status: 'active' },
    { id: 'p-ownerB', email: 'ownerb@vision.test', base44_user_id: 'u-ownerB', app_role: 'owner', primary_business_id: OTHER_BUSINESS, profile_status: 'active' },
    { id: 'p-expert-rev', email: 'expertrev@vision.test', base44_user_id: 'u-expert-rev', app_role: 'expert_advisor', primary_business_id: null, profile_status: 'active' },
    { id: 'p-susp', email: 'susp@vision.test', base44_user_id: 'u-susp', app_role: 'owner', primary_business_id: BUSINESS, profile_status: 'suspended' },
  ],
  business_entities: [{ id: BUSINESS, profile_id: 'p-owner' }, { id: OTHER_BUSINESS, profile_id: 'p-ownerB' }],
  business_owners: [],
  business_team_members: [],
  expert_advisor_access: [{ id: 'rel-revoked', expert_profile_id: 'p-expert-rev', business_id: BUSINESS, access_status: 'revoked', revoked_at: '2026-01-01T00:00:00Z' }],
  documents: [
    { id: 'doc-1', name: 'A.pdf', document_type: 'profit_and_loss', file_path: 'p/b-A/A.pdf', storage_bucket: 'documents', profile_id: 'p-owner', business_id: BUSINESS },
    { id: 'doc-foreign', name: 'B.pdf', document_type: 'profit_and_loss', file_path: 'p/b-B/B.pdf', storage_bucket: 'documents', profile_id: 'p-ownerB', business_id: OTHER_BUSINESS },
  ],
  document_analysis: [
    { id: 'an-1', document_id: 'doc-1', document_type: 'profit_and_loss', analysis_status: 'failed', extracted_data: {}, business_id: BUSINESS, profile_id: 'p-owner' },
    { id: 'an-foreign', document_id: 'doc-foreign', document_type: 'profit_and_loss', analysis_status: 'failed', extracted_data: {}, business_id: OTHER_BUSINESS, profile_id: 'p-ownerB' },
  ],
  extracted_fields: [], business_facts: [], business_fact_evidence: [],
};

function entryHandler(s, kernel, engine, schemas, user, world) {
  let captured = null;
  const extractor = { asServiceRole: { integrations: { Core: { ExtractDataFromUploadedFile: async () => ({ output: { reporting_period: '2025', annual_revenue: '$1,000' } }) } } }, auth: { me: async () => user } };
  new Function('createClientFromRequest', 'createClient', 'runExtraction', 'authenticateActor', 'errorResponse',
    'authorizeDocumentAccess', 'assertBusinessAccess', 'Deno', 'Response', 'console', toJs(strip(read(P.ENTRY))))(
    () => extractor, () => world.sb,
    async (sb, ctx, options) => engine.runExtraction(sb, ctx, { ...options, base44: extractor }),
    kernel.authenticateActor, kernel.errorResponse, kernel.authorizeDocumentAccess, kernel.assertBusinessAccess,
    { env: { get: (k) => (k === 'VITE_SUPABASE_URL' ? 'https://mock.supabase.co' : 'mock-key') }, serve: (fn) => { captured = fn; } },
    ResponseStub, quiet
  );
  return captured;
}

async function runHandler(s, kernel, engine, schemas, { user, analysisId }) {
  const world = makeSb(JSON.parse(JSON.stringify(AUTHZ_SEED)));
  const handler = entryHandler(s, kernel, engine, schemas, user, world);
  const res = await handler({ json: async () => ({ documentAnalysisId: analysisId }) });
  return { res, world };
}

// ─────────────────────────────────────────────────────────────────────────────
// One full evaluation over a set of sources. Returns a flag per contract item.
// ─────────────────────────────────────────────────────────────────────────────
async function evaluate(s) {
  const R = {};
  const { runExtraction, EXTRACTION_SCHEMAS } = loadEngine(s.ENGINE);
  const be = loadBackendTypes(s.BE_TYPES, EXTRACTION_SCHEMAS);
  const fe = loadFrontendTypes(s.FE_TYPES);
  const worlds = [];
  const run = async (opts) => { const r = await runEngine({ runExtraction }, EXTRACTION_SCHEMAS, opts); worlds.push(r.world); return r; };

  // ── Vocabulary parity: frontend mirror, backend vocabulary, engine schemas ──
  R.parity = JSON.stringify([...fe.READABLE_DOCUMENT_TYPES].sort()) === JSON.stringify([...be.READABLE_DOCUMENT_TYPES].sort())
    && JSON.stringify([...be.READABLE_DOCUMENT_TYPES].sort()) === JSON.stringify([...Object.keys(EXTRACTION_SCHEMAS)].sort())
    && JSON.stringify([...fe.STORABLE_DOCUMENT_TYPES].sort()) === JSON.stringify([...be.STORABLE_DOCUMENT_TYPES].sort());

  // ── T1–T6: every readable type is readable everywhere and reaches its reader ──
  const READABLE = ['profit_and_loss', 'balance_sheet', 'business_tax_return', 'personal_tax_return', 'debt_schedule', 'payroll_report'];
  for (let i = 0; i < READABLE.length; i++) {
    const t = READABLE[i];
    const r = await run({ documentType: t });
    R[`t${i + 1}`] = Boolean(EXTRACTION_SCHEMAS[t])
      && be.READABLE_DOCUMENT_TYPES.includes(t)
      && fe.READABLE_DOCUMENT_TYPES.includes(t)
      && fe.DOCUMENT_TYPES.find((x) => x.value === t)?.readable === true
      && r.extractorCalls > 0
      && r.result.finalStatus !== 'unsupported';
  }
  R.t14 = READABLE.every((_, i) => R[`t${i + 1}`]);

  // ── T7–T10: an unsupported type is STORED, and never presented as an upload failure ──
  const other = await run({ documentType: 'other' });
  R.t7 = other.result.finalStatus === 'unsupported'
    && other.result.documentUploadStatus === 'uploaded'
    && other.docStatus === 'uploaded'
    && other.analysisPayload.analysis_status === 'unsupported';
  R.t8 = other.extractorCalls === 0;
  R.t9 = other.result.extractedFieldsCount === 0 && other.world.writesTo('extracted_fields').length === 0;
  R.no_document_erase = !other.world.writes.some((w) => w.table === 'documents' && w.op === 'delete');

  const stNew = fe.resolveDocumentStates({ document_type: 'other', upload_status: 'uploaded', status: 'uploaded' });
  const stLegacy = fe.resolveDocumentStates({ document_type: 'other', upload_status: 'failed', status: 'uploaded' });
  const unsupportedLabel = /unsupported:\s*\{ label: '([^']+)'/.exec(s.FE_DATAROOM);
  R.t10 = stNew.upload !== 'failed' && stNew.analysis === 'unsupported' && Boolean(stNew.note)
    && stLegacy.upload !== 'failed' && stLegacy.analysis === 'unsupported'
    && Boolean(unsupportedLabel) && !/fail/i.test(unsupportedLabel[1])
    && /ANALYSIS_STATUS_CONFIG/.test(s.FE_DATAROOM) && /resolveDocumentStates\(doc\)/.test(s.FE_DATAROOM);

  // T10b — the resolver must NOT blindly reinterpret every historical
  // upload_status='failed' as a storage success. A row with no storage evidence at
  // all (no storage state, no coordinates, no analysis record) is a genuine upload
  // failure and keeps that meaning.
  const stGenuineFail = fe.resolveDocumentStates({ document_type: 'profit_and_loss', upload_status: 'failed', status: 'failed' });
  R.t10b = stGenuineFail.upload === 'failed' && stGenuineFail.analysis === 'failed';

  // ── T11–T13: genuine failures keep their own meaning ──
  const storageFail = await run({ storageQueue: [{ error: { message: 'Object not found', statusCode: 404 } }] });
  R.t11 = storageFail.result.finalStatus === 'failed' && storageFail.docStatus === 'failed'
    && storageFail.result.errorClass === 'source_missing';

  const parserFail = await run({ extractor: () => { throw new Error('provider unavailable'); } });
  const stFail = fe.resolveDocumentStates({ document_type: 'profit_and_loss', upload_status: 'failed', status: 'uploaded' });
  R.t12 = parserFail.result.finalStatus === 'failed' && parserFail.analysisPayload.analysis_status === 'failed'
    && stFail.analysis === 'failed' && stFail.upload !== 'failed' && /Analysis failed/.test(stFail.note || '');

  R.t13 = storageFail.result.sourceStatus === 'missing'
    && /Original file unavailable/.test(s.VIEWER) && /sourceMissing/.test(s.HOOK)
    && /source_unavailable/.test(s.ROUTER);

  // ── T15/T16: an arbitrary or unknown type is normalized and fails safely ──
  R.t15 = be.normalizeDocumentType('eval_pwn') === 'other' && be.normalizeDocumentType('__proto__') === 'other'
    && be.normalizeDocumentType(42) === 'other' && be.normalizeDocumentType(null) === 'other'
    && be.normalizeDocumentType(undefined) === 'other' && be.normalizeDocumentType('') === 'other'
    && ['Profit_And_Loss', 'profit_and_loss\n', 0, {}].every((v) => { const n = be.normalizeDocumentType(v); return typeof n === 'string' && n.length > 0; })
    && /normalizeDocumentType\(documentType\)/.test(s.UPLOAD_FN)
    && /const schema = EXTRACTION_SCHEMAS\[documentType\];/.test(s.ENGINE)
    && !/EXTRACTION_SCHEMAS\[documentType\]\s*\(/.test(s.ENGINE);

  const unknown = await run({ documentType: 'totally_unknown_type' });
  R.t16 = unknown.result.finalStatus === 'unsupported' && unknown.extractorCalls === 0 && unknown.docStatus === 'uploaded';

  // ── UI seam: a real selector, never a filename, never an absent reader ──
  const assignments = [...s.FE_UPLOAD.matchAll(/(?:f|file)\.docType\s*=\s*([^;]+);/g)].map((m) => m[1].trim());
  R.ui_selector = /const \[docType, setDocType\]\s*=\s*useState\(AUTO_DETECT_DOCUMENT_TYPE\)/.test(s.FE_UPLOAD)
    && /onChange=\{\(e\) => setDocType\(e\.target\.value\)\}/.test(s.FE_UPLOAD)
    && /documentType: docTypeUsed/.test(s.FE_UPLOAD)
    && /t\.readable/.test(s.FE_UPLOAD);
  R.no_filename_authority = assignments.length > 0
    && assignments.every((a) => a === 'docType')
    && !/\bfile\.name\b[^\n]*docType|docType[^\n]*\bfile\.name\b/.test(s.FE_UPLOAD)
    && !/\.name\b/.test(s.FE_TYPES);

  // ── Viewer / bucket authority is untouched by this hotfix ──
  const filePathBranch = (() => {
    const start = s.HOOK.indexOf('} else if (document.id && document.file_path) {');
    if (start < 0) return '';
    let depth = 0;
    for (let i = s.HOOK.indexOf('{', start); i < s.HOOK.length; i++) {
      if (s.HOOK[i] === '{') depth++;
      else if (s.HOOK[i] === '}') { depth--; if (depth === 0) return s.HOOK.slice(start, i + 1); }
    }
    return '';
  })();
  R.viewer_no_stored_url_fallback = filePathBranch.length > 0
    && (filePathBranch.match(/action: 'getDocumentSignedUrl'/g) || []).length === 1
    && !/document\.file_url/.test(filePathBranch)
    && /onSourceState/.test(filePathBranch);

  const bucketRun = await run({ documentType: 'profit_and_loss', bucket: 'client-documents' });
  R.persisted_bucket_authority = bucketRun.world.storageCalls.length === 1
    && bucketRun.world.storageCalls[0].bucket === 'client-documents'
    && !/storage\s*\.from\('documents'\)/.test(s.ENGINE);

  // ── T17–T20: authorization is unchanged and still refuses ──
  const SURFACE_BASE = 'abc4844'; // the published 6D.0 commit
  const diffNames = (args) => { try { return git(args).trim().split('\n').filter(Boolean); } catch (e) { return []; } };
  // Measured from the PUBLISHED 6D.0 commit, never from "uncommitted work" alone:
  // the platform takes automatic checkpoint commits, and an uncommitted-only view
  // would silently empty this check the moment one is taken.
  const slice = [...new Set([
    ...diffNames(['diff', '--name-only', SURFACE_BASE, 'HEAD']),
    ...diffNames(['diff', '--name-only', 'HEAD']),
    ...diffNames(['ls-files', '--others', '--exclude-standard']),
  ])].sort();
  const AUTHORIZATION_FILES = [P.ACTOR, P.DOCACCESS, P.BUCKETS, P.GUARD, P.ACTIVE, P.REL, P.HOOK, P.VIEWER];
  R.t17 = AUTHORIZATION_FILES.every((f) => !slice.includes(f))
    && /validateBusinessScope\(sb, businessId, profileId\)/.test(s.UPLOAD_FN)
    && /authenticateActor/.test(s.ENTRY) && /authorizeDocumentAccess/.test(s.ENTRY) && /assertBusinessAccess/.test(s.ENTRY)
    && /if \(!verdict\.authorized\) return Response\.json\(\{ error: 'Not found' \}, \{ status: 404 \}\)/.test(s.ENTRY);

  const kernel = compileKernel(s);
  const owner = await runHandler(s, kernel, { runExtraction }, EXTRACTION_SCHEMAS, { user: IDENTITIES.ownerA, analysisId: 'an-1' });
  const foreign = await runHandler(s, kernel, { runExtraction }, EXTRACTION_SCHEMAS, { user: IDENTITIES.ownerA, analysisId: 'an-foreign' });
  const suspended = await runHandler(s, kernel, { runExtraction }, EXTRACTION_SCHEMAS, { user: IDENTITIES.suspended, analysisId: 'an-1' });
  const revoked = await runHandler(s, kernel, { runExtraction }, EXTRACTION_SCHEMAS, { user: IDENTITIES.expertRev, analysisId: 'an-1' });
  worlds.push(owner.world, foreign.world, suspended.world, revoked.world);
  R.t18 = owner.res.status === 200 && foreign.res.status === 404;
  R.t19 = suspended.res.status === 403 || suspended.res.status === 404;
  R.t20 = revoked.res.status === 404;

  // ── T21/T22: the Digital Twin is frozen ──
  R.t21 = !worlds.some((w) => w.writes.some((x) => x.table === 'business_facts'));
  R.t22 = !worlds.some((w) => w.writes.some((x) => x.table === 'business_fact_evidence'))
    && !/business_facts|business_fact_evidence/.test(strip(s.ENGINE) + strip(s.BE_TYPES) + strip(s.UPLOAD_FN));

  // ── Change surface ──
  // The reviewed 6D.0 harness is re-based BY this slice (its E2 status contract and
  // its F1 surface), so it belongs to this slice's surface. Allowlist line ONLY.
  // The five older security harnesses carry allowlist-line-only rebases for this
  // later, reviewed slice. No behavioral, security, mutation or authorization
  // assertion in any of them was removed or weakened (their PASS totals rise by
  // exactly the surface assertions this rebase repairs: 55→56, 101→103, 122→125,
  // 76→78, 50→52).
  const APPROVED_ALLOWLIST_MAINTENANCE = [
    'scripts/adminDocumentViewer.test.cjs',
    'scripts/documentSignedUrlAuthorization.test.cjs',
    'scripts/adminCanonicalActor.test.cjs',
    'scripts/relationshipRevocationAccess.test.cjs',
    'scripts/galileoContextActorBinding.test.cjs',
  ];
  // 6D.0a — the reviewed Semantic Observation Bridge slice (ONE new shared module,
  // the shared contract that now reads it, buildGalileoContext's consumer wiring,
  // its own harness, the post-hotfix audit report and its report). Allowlist lines
  // ONLY: T1–T22, the classification/mutation checks and the Digital-Twin freeze
  // assertions above are unchanged.
  const P_6D0A_FILES = [
    'base44/shared/documentObservation/semantics.ts',
    'base44/shared/intelligenceContract/businessIntelligenceContract.ts',
    'base44/functions/buildGalileoContext/entry.ts',
    'scripts/semanticObservationBridge.test.cjs',
    'VISION_DOCUMENT_UNDERSTANDING_AND_GALILEO_INTELLIGENCE_AUDIT.md',
    'src/VISION_PHASE_6D_0A_SEMANTIC_OBSERVATION_BRIDGE.md',
  ];
  // 6D.0b AUTOMATIC DOCUMENT UNDERSTANDING — a LATER, APPROVED slice: the ONE
  // server-side understanding module set, the canonical upload entry point that now
  // runs it, its own harness and its report. Allowlist lines ONLY: no behavioral,
  // authorization or mutation assertion was altered.
  const P_6D0B_FILES = [
    'base44/shared/documentUnderstanding/taxonomy.ts',
    'base44/shared/documentUnderstanding/contract.ts',
    'base44/shared/documentUnderstanding/signals.ts',
    'base44/shared/documentUnderstanding/semanticClassifier.ts',
    'base44/shared/documentUnderstanding/understandDocument.ts',
    'base44/shared/documentUnderstanding/persist.ts',
    'base44/shared/documentUnderstanding/orchestrator.ts',
    'base44/functions/uploadDocumentToSupabase/entry.ts',
    'scripts/documentUnderstanding.test.cjs',
    'VISION_PHASE_6D_0B_AUTOMATIC_DOCUMENT_UNDERSTANDING.md',
    // 6D.0b.1 REAL PROVIDER SEAM REPAIR — a LATER, APPROVED slice: the provider
    // seam's BOUNDED read, the schema-aware applied-type write, the canonical
    // upload/analysis state vocabulary, the surfaces that read it and the CTA that
    // asks about an exact document. ALLOWLIST LINES ONLY — T1–T22, the state
    // assertions and every mutation check above are unchanged.
    'src/lib/documents/documentTypes.js',
    'src/hooks/useDocumentPipelinePolling.js',
    'src/hooks/useAskGalileo.js',
    'src/hooks/useVisionActions.js',
    'src/pages/DataRoom.jsx',
    'src/pages/DocumentUpload.jsx',
    'scripts/documentUnderstandingRealSeam.test.cjs',
    // 6D.0b.2 — durable document ingestion (reviewed surface).
    'base44/entities/DocumentIngestionJob.jsonc',
    'base44/functions/processDocumentIngestionJob/entry.ts',
    'base44/shared/documentIngestion/orchestration.ts',
    'base44/workflows/Document Ingestion.jsonc',
    'base44/workflows/Document Ingestion Recovery.jsonc',
    'src/scripts/durableDocumentIngestion.test.cjs',
    'VISION_PHASE_6D_0B_2_DURABLE_DOCUMENT_INGESTION.md',
    'scripts/documentUnderstanding.test.cjs',
    'VISION_PHASE_6D_0B_1_REAL_PROVIDER_SEAM_REPAIR.md',
  ];
  // 6D.0b.2.1 CANONICAL SOURCE READ REPAIR — a LATER, APPROVED slice: the ONE shared
  // project-URL normalizer both ingestion paths build their Supabase client from, this
  // slice's own harness and its report. ALLOWLIST LINES ONLY — T1–T22, the vocabulary
  // parity check, the UI/authorization assertions and every mutation check above are
  // untouched.
  const P_6D0B2_1_FILES = [
    'base44/shared/supabase/projectUrl.ts',
    'src/scripts/documentCanonicalSourceRead.test.cjs',
    'VISION_PHASE_6D_0B_2_1_CANONICAL_SOURCE_READ_REPAIR.md',
  ];
  // 6D.0c DOCUMENT KNOWLEDGE COMPLETION — a LATER, APPROVED slice: the durable
  // confirmation/resume module (server-side, authorized, idempotent), the confirmation
  // handler that now calls it after persisting the decision, this slice's own harness
  // and its report. ALLOWLIST LINES ONLY — T1–T22, the classification assertions, the
  // vocabulary parity check and every mutation check above are unchanged.
  const P_6D0C_FILES = [
    'base44/shared/documentIngestion/resume.ts',
    'base44/functions/supabaseUserData/entry.ts',
    'src/scripts/documentKnowledgeCompletion.test.cjs',
    'VISION_PHASE_6D_0C_DOCUMENT_KNOWLEDGE_COMPLETION.md',
    // 6D.0c.1 PROVISIONAL EVIDENCE RETRIEVAL — a LATER, APPROVED slice: ONE new
    // shared module (the provisional retrieval lane that makes unreviewed document
    // evidence retrievable WITHOUT promoting it to canonical) and its report.
    // ALLOWLIST LINES ONLY — T1–T22, the classification assertions, the vocabulary
    // parity check and every mutation check above are unchanged.
    'base44/shared/galileo/provisionalEvidence.ts',
    'VISION_PHASE_6D_0C_1_PROVISIONAL_EVIDENCE_RETRIEVAL.md', ...require('./slice6D0C2Files.cjs'),
    // 6D.0c GALILEO HALF — the focused-document contract: the ONE new shared
    // module that resolves a focused document server-side (row-derived tenant,
    // canonical document authorization, exact-document knowledge, PII-minimized
    // projection), the consumer wiring in askGalileo, and the answer surface that
    // now shows the SERVER-derived evidence state instead of a self-awarded one.
    'base44/shared/galileo/focusedDocument.ts',
    'base44/functions/askGalileo/entry.ts',
    'src/hooks/useAskGalileo.js',
    'src/components/galileo/home/GalileoAnswerPanel.jsx',
  ];
  // 6D.0c.1-P PRODUCTION REPAIR — a LATER, APPROVED slice, declared by name: the
  // provisional lane, the one canonical registry it must resolve through, the
  // consumer wiring in askGalileo, its certification harness and its report.
  const EXPECTED = [P.FE_TYPES, P.FE_UPLOAD, P.FE_DATAROOM, P.FE_UPLOADCFG, P.BE_TYPES, P.ENGINE, P.STATE, P.UPLOAD_FN, P.ROUTER, P.TEST, P.REPORT, 'scripts/extractionIntegrity.test.cjs', ...P_6D0A_FILES, ...P_6D0B_FILES, ...P_6D0B2_1_FILES, ...P_6D0C_FILES, ...APPROVED_ALLOWLIST_MAINTENANCE, 'base44/shared/galileo/provisionalEvidence.ts', 'base44/shared/canonicalFact/registry.ts', 'base44/functions/askGalileo/entry.ts', 'src/scripts/documentKnowledgeCompletion.test.cjs', 'VISION_PHASE_6D_0C_1_PROVISIONAL_EVIDENCE_RETRIEVAL.md', ...require('./slice6D0C2Files.cjs')].sort();
  const unexpected = slice.filter((f) => !EXPECTED.includes(f));
  R.change_surface = unexpected.length === 0;
  R._unexpected = unexpected;
  R._slice = slice;
  R._surfaceDetail = unexpected.length ? `unexpected: ${unexpected.join(', ')}` : '';
  return R;
}

// ─────────────────────────────────────────────────────────────────────────────
(async () => {
  console.log('── T1–T22 — classification contract (real modules executed) ──');
  const baseline = await evaluate(sources());
  const LABELS = {
    t1: 'T1  profit_and_loss — reader exists at every layer', t2: 'T2  balance_sheet — reader exists at every layer',
    t3: 'T3  business_tax_return — reader exists at every layer', t4: 'T4  personal_tax_return — reader exists at every layer',
    t5: 'T5  debt_schedule — reader exists at every layer', t6: 'T6  payroll_report — reader exists at every layer',
    t7: 'T7  unsupported stored document → the upload itself succeeds', t8: 'T8  unsupported stored document → no parser invoked',
    t9: 'T9  unsupported stored document → no extracted fields invented', t10: 'T10 unsupported stored document → never shown as an upload failure',
    t11: 'T11 genuine storage failure → upload failed', t12: 'T12 genuine parser failure → analysis failed',
    t13: 'T13 source missing → source unavailable (viewer state intact)', t14: 'T14 supported type → extraction invoked',
    t10b: 'T10b a genuine historical upload failure keeps its meaning (no blind reinterpretation)',
    t15: 'T15 a client cannot submit an arbitrary parser/type', t16: 'T16 unknown type fails safely',
    t17: 'T17 authorization unchanged on this path', t18: 'T18 foreign business denied', t19: 'T19 suspended actor denied',
    t20: 'T20 revoked expert denied', t21: 'T21 zero business_facts writes', t22: 'T22 zero business_fact_evidence writes',
    parity: 'T-PARITY frontend vocabulary === backend vocabulary === engine readers',
    ui_selector: 'UI a real, non-bureaucratic document-type selection exists',
    no_filename_authority: 'T8b  no filename-only classification anywhere',
    no_document_erase: 'T9b  an unsupported document is never erased',
    viewer_no_stored_url_fallback: 'VIEWER no stored-URL fallback on the Data Room path',
    persisted_bucket_authority: 'BUCKET the persisted bucket is the source authority',
    change_surface: 'F1   the hotfix touches only its own surface',
  };
  for (const k of Object.keys(LABELS)) {
    const id = k === 't1' ? 'T1' : k === 't2' ? 'T2' : k === 't3' ? 'T3' : k === 't4' ? 'T4' : k === 't5' ? 'T5' : k === 't6' ? 'T6'
      : k === 't10b' ? 'T10b'
      : /^t\d+$/.test(k) ? k.toUpperCase() : k;
    const ok = baseline[k] === true;
    check(id, LABELS[k], ok, ok ? '' : (baseline._surfaceDetail && k === 'change_surface' ? baseline._surfaceDetail : 'assertion false'));
  }
  console.log(`     surface: ${baseline._slice.length ? baseline._slice.join(', ') : '(clean)'}`);

  console.log('\n── M1–M12 — MUTATION TESTS (mutate the REAL source, re-run, must be caught) ──');
  const MUTATIONS = [
    { id: 'M1', name: 'restore the hardcoded document type', file: 'FE_UPLOAD', target: 'ui_selector',
      edits: [[`  const [docType, setDocType]             = useState(AUTO_DETECT_DOCUMENT_TYPE);`, `  const [docType] = useState('other');`]] },
    { id: 'M2', name: 'expose an unreadable type as analyzable', file: 'FE_TYPES', target: 'parity',
      edits: [[`{ value: 'insurance_document',  label: 'Insurance Document',      readable: false }`, `{ value: 'insurance_document',  label: 'Insurance Document',      readable: true }`]] },
    { id: 'M3', name: 'invoke a reader that does not exist', file: 'ENGINE', target: 't8',
      edits: [[`if (!EXTRACTION_SCHEMAS[documentType]) {`, `if (false) {`]] },
    { id: 'M4', name: 'unsupported analysis recorded as an upload failure', file: 'ENGINE', target: 't7',
      edits: [[`    await setDocumentUploadStatus(sb, ctx.documentId, 'uploaded', now);`, `    await setDocumentUploadStatus(sb, ctx.documentId, 'failed', now);`]] },
    { id: 'M5', name: 'a parser failure presented as an upload failure', file: 'FE_TYPES', target: 't12',
      edits: [[`  const upload = rawUpload === 'failed' && storageEvidence ? 'uploaded' : rawUpload;`, `  const upload = rawUpload;`]] },
    { id: 'M6', name: 'trust an arbitrary client-supplied type', file: 'BE_TYPES', target: 't15',
      edits: [[`  return STORABLE_DOCUMENT_TYPES.includes(v) ? v : UNCLASSIFIED_DOCUMENT_TYPE;`, `  return v;`]] },
    { id: 'M7', name: 'filename becomes authoritative classification', file: 'FE_UPLOAD', target: 'no_filename_authority',
      edits: [[`      f.docType = docType;`, `      f.docType = /w-?2/i.test(f.name) ? 'personal_tax_return' : docType;`]] },
    { id: 'M8', name: "weaken the upload path's business-scope guard", file: 'UPLOAD_FN', target: 't17',
      edits: [[`        await validateBusinessScope(sb, businessId, profileId);`, `        await Promise.resolve();`]] },
    { id: 'M9', name: 'restore a hardcoded storage bucket for the source read', file: 'ENGINE', target: 'persisted_bucket_authority',
      edits: [[`      .from(docRow.storage_bucket)\n      .createSignedUrl(docRow.file_path, 300);`, `      .from('documents')\n      .createSignedUrl(docRow.file_path, 300);`]] },
    { id: 'M10', name: 'add a stored-URL fallback to the viewer path', file: 'HOOK', target: 'viewer_no_stored_url_fallback',
      edits: [[`          action: 'getDocumentSignedUrl',
          data: { documentId: document.id },
        });
        signedUrl = res.data?.signedUrl;`,
      `          action: 'getDocumentSignedUrl',
          data: { documentId: document.id },
        });
        signedUrl = res.data?.signedUrl || document.file_url;`]] },
    { id: 'M11', name: 'write a Digital Twin fact row', file: 'ENGINE', target: 't21',
      edits: [[`    const { data: existingFields } = await sb.from('extracted_fields')`, `    await sb.from('business_facts').insert({ business_id: ctx.businessId, fact_key: 'revenue', value_numeric: 1 });\n    const { data: existingFields } = await sb.from('extracted_fields')`]] },
    { id: 'M12', name: 'erase the unsupported document', file: 'ENGINE', target: 'no_document_erase',
      edits: [[`    await setDocumentUploadStatus(sb, ctx.documentId, 'uploaded', now);`, `    await sb.from('documents').delete().eq('id', ctx.documentId);\n    await setDocumentUploadStatus(sb, ctx.documentId, 'uploaded', now);`]] },
  ];

  for (const mut of MUTATIONS) {
    const original = read(P[mut.file]);
    const missing = mut.edits.find(([find]) => !original.includes(find));
    if (missing) {
      check(mut.id, `${mut.name} → CAUGHT`, false, `mutation anchor not found: ${String(missing[0]).slice(0, 70)}`);
      continue;
    }
    let mutated = original;
    for (const [find, repl] of mut.edits) mutated = mutated.replace(find, repl);
    const overrides = {};
    // MUTATION-SAFETY: the mutated file is supplied as source text, never written
    // to disk — production code on disk is never touched by this harness.
    overrides[mut.file] = mutated;
    let caught = false;
    let why = '';
    try {
      const res = await evaluate(sources(overrides));
      caught = res[mut.target] !== true;
      why = `${mut.target}=${JSON.stringify(res[mut.target])}`;
      if (!caught) why = `the mutated source still satisfied ${mut.target}`;
    } catch (e) {
      caught = true;
      why = `threw: ${e.message}`;
    }
    check(mut.id, `${mut.name} → ${caught ? 'CAUGHT' : 'NOT CAUGHT'}`, caught, why);
  }

  console.log('\n' + '─'.repeat(74));
  if (failures.length) {
    console.log(`RESULT: FAIL — ${failures.length} assertion(s) failed`);
    failures.forEach((f) => console.log(`   · ${f}`));
    process.exit(1);
  }
  console.log('RESULT: PASS — every document type the interface offers is either read by a real');
  console.log('reader or explicitly unsupported, a stored document is never presented as a');
  console.log('failed upload, authorization is unchanged and no fact row is written.');
  console.log('No network, database or production record was touched by this script.');
})().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});