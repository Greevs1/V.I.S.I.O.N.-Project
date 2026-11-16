#!/usr/bin/env node
/**
 * extractionIntegrity.test.cjs — Phase 6D.0 — EXTRACTION INTEGRITY.
 *
 * Run:  node scripts/extractionIntegrity.test.cjs
 *
 * OFFLINE AND NON-DESTRUCTIVE. No network, no database, no Base44 call, no
 * production record read, written or deleted. Every assertion runs against
 * in-memory mocks.
 *
 * THE CODE UNDER TEST IS THE SHIPPED CODE — compiled from its real TypeScript
 * source (esbuild, loader 'ts') and executed:
 *
 *   1. `base44/shared/documentExtraction/extractEngine.ts` — the REAL
 *      runExtraction, executed end-to-end against a recording Supabase mock, plus
 *      the three 6D.0 modules it now composes:
 *        periodIntegrity.ts · extractionConfidence.ts · analysisState.ts
 *   2. `base44/functions/runDocumentExtraction/entry.ts` — the REAL Deno.serve
 *      handler, executed with the REAL Security Kernel (authenticateActor /
 *      validateBusinessScope / relationship lifecycle / authorizeDocumentAccess)
 *      so cross-business, suspended-actor and revoked-expert refusals are
 *      observed, not asserted from source text.
 *   3. `getDocumentSignedUrl` — the REAL branch text is extracted from
 *      supabaseUserData/entry.ts by brace matching and executed with injected
 *      dependencies (the pattern the existing document harnesses use).
 *
 * EVIDENCE CLASS: UNIT/MOCK (real modules executed) + SOURCE-SEGMENT EXECUTION +
 * STATIC + MUTATION. No browser and no live database.
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

const ENGINE = 'base44/shared/documentExtraction/extractEngine.ts';
const PERIOD = 'base44/shared/documentExtraction/periodIntegrity.ts';
const CONFIDENCE = 'base44/shared/documentExtraction/extractionConfidence.ts';
const STATE = 'base44/shared/documentExtraction/analysisState.ts';
const ENTRY = 'base44/functions/runDocumentExtraction/entry.ts';
const ROUTER = 'base44/functions/supabaseUserData/entry.ts';
const HOOK = 'src/hooks/useDocumentViewer.js';
const VIEWER = 'src/components/documents/DocumentViewer.jsx';
const ACTOR = 'base44/shared/authz/actor.ts';
const DOCACCESS = 'base44/shared/authz/documentAccess.ts';
const GUARD = 'base44/shared/businessScope/writeGuard.ts';
const ACTIVE = 'base44/shared/businessScope/activeBusiness.ts';
const REL = 'base44/shared/businessScope/relationshipAccess.ts';
const TEST = 'scripts/extractionIntegrity.test.cjs';

const failures = [];
const check = (id, label, ok, detail = '') => {
  if (!ok) failures.push(`${id} ${label}${detail ? ` — ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${String(id).padEnd(5)} ${label}${!ok && detail ? ` — ${detail}` : ''}`);
};

// ─────────────────────────────────────────────────────────────────────────────
const strip = (s) => s.replace(/^\s*import[\s\S]*?from\s+'[^']+';/gm, '').replace(/^\s*export\s+/gm, '');
const toJs = (s) => esbuild.transformSync(s, { loader: 'ts', format: 'cjs', target: 'es2020' }).code;
const jsCache = new Map();
const compileJs = (src) => {
  if (!jsCache.has(src)) jsCache.set(src, toJs(strip(src)));
  return jsCache.get(src);
};

const ResponseStub = { json: (body, init = {}) => ({ status: init.status || 200, body, json: async () => body }) };

/** Load a compiled module with its (stripped) imports injected. */
function loadModule(src, depNames, depValues, returns) {
  const factory = new Function('console', ...depNames, `${compileJs(src)}\n;return (${returns});`);
  return factory(quiet, ...depValues);
}

// ─────────────────────────────────────────────────────────────────────────────
// Recording Supabase mock — every read and EVERY WRITE is recorded so the
// harness can prove what the engine did and did not touch.
// ─────────────────────────────────────────────────────────────────────────────
const WRITE_OPS = new Set(['insert', 'update', 'delete', 'upsert']);
const PROTECTED_TABLES = ['business_facts', 'business_fact_evidence'];

function makeSb(seed = {}, opts = {}) {
  const writes = [];
  const reads = [];
  const storageCalls = [];
  const tables = {};
  for (const [k, v] of Object.entries(seed)) tables[k] = v.map((r) => ({ ...r }));
  const missingTables = new Set(opts.missingTables || []);

  function query(table) {
    const state = { table, filters: [], op: 'select', payload: null, single: false, headCount: false };
    const rows = () => (tables[table] || []).filter((r) => state.filters.every(([c, v]) => r[c] === v));

    const settle = () => {
      if (WRITE_OPS.has(state.op)) {
        writes.push({ table, op: state.op, payload: state.payload, filters: state.filters.slice() });
      } else {
        reads.push({ table, filters: state.filters.slice() });
      }
      if (missingTables.has(table)) {
        return { data: null, count: null, error: { message: `relation "public.${table}" does not exist`, code: '42P01' } };
      }
      if (state.op === 'insert') {
        const list = Array.isArray(state.payload) ? state.payload : [state.payload];
        const created = list.map((r, i) => ({ id: r.id || `${table}-new-${writes.length}-${i}`, ...r }));
        (tables[table] = tables[table] || []).push(...created);
        return { data: state.single ? created[0] : created, error: null };
      }
      if (state.op === 'update') {
        for (const r of rows()) Object.assign(r, state.payload);
        return { data: null, error: null };
      }
      if (state.op === 'delete') {
        const keep = (tables[table] || []).filter((r) => !state.filters.every(([c, v]) => r[c] === v));
        tables[table] = keep;
        return { data: null, error: null };
      }
      const list = rows();
      if (state.headCount) return { data: null, count: list.length, error: null };
      return { data: state.single ? (list[0] ?? null) : list, count: list.length, error: null };
    };

    const builder = {
      select: (cols, o) => {
        if (o && o.head) state.headCount = true;
        return builder;
      },
      eq: (c, v) => { state.filters.push([c, v]); return builder; },
      in: () => builder,
      order: () => builder,
      limit: () => builder,
      is: () => builder,
      neq: () => builder,
      ilike: () => builder,
      insert: (payload) => { state.op = 'insert'; state.payload = payload; return builder; },
      update: (payload) => { state.op = 'update'; state.payload = payload; return builder; },
      delete: () => { state.op = 'delete'; return builder; },
      upsert: (payload) => { state.op = 'upsert'; state.payload = payload; return builder; },
      single: () => { state.single = true; return Promise.resolve(settle()); },
      maybeSingle: () => { state.single = true; return Promise.resolve(settle()); },
      then: (res, rej) => Promise.resolve(settle()).then(res, rej),
    };
    return builder;
  }

  const storageQueue = [];
  const storage = {
    from: (bucket) => ({
      createSignedUrl: async (p, ttl) => {
        storageCalls.push({ bucket, path: p, ttl });
        const next = storageQueue.shift() || opts.storageDefault || { signedUrl: `https://signed.example/${bucket}/${p}?ttl=${ttl}` };
        return next.error ? { data: null, error: next.error } : { data: { signedUrl: next.signedUrl }, error: null };
      },
    }),
  };

  return {
    sb: { from: query, storage },
    writes, reads, storageCalls,
    queueStorage: (items) => storageQueue.push(...items),
    writesTo: (t) => writes.filter((w) => w.table === t),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────
const DOC = 'doc-1';
const BUSINESS = 'b-A';
const OTHER_BUSINESS = 'b-B';

const baseDocument = {
  id: DOC, name: 'Q4_ProfitLoss.pdf', document_type: 'profit_and_loss',
  file_path: 'profile-1/b-A/1700000000000_Q4_ProfitLoss.pdf',
  storage_bucket: 'documents', profile_id: 'p-owner', business_id: BUSINESS, year: null,
};
const baseAnalysis = {
  id: 'an-1', document_id: DOC, document_type: 'profit_and_loss', analysis_status: 'queued',
  status: 'queued', profile_id: 'p-owner', business_id: BUSINESS,
  extracted_data: {}, extracted_summary: null,
};

const PROFIT_FIELDS = ['annual_revenue', 'cogs', 'gross_profit', 'operating_expenses', 'operating_income',
  'reported_ebitda', 'interest_expense', 'taxes', 'depreciation', 'amortization', 'net_profit',
  'total_expenses', 'owner_compensation'];

const CTX = {
  documentAnalysisId: 'an-1', documentId: DOC, documentType: 'profit_and_loss',
  profileId: 'p-owner', businessId: BUSINESS, year: null,
};

function extractorReturning(output) {
  return { asServiceRole: { integrations: { Core: {
    ExtractDataFromUploadedFile: async () => ({ output }),
  } } } };
}
function extractorFailing(message, succeedAfter = 0) {
  let calls = 0;
  const fn = async () => {
    calls++;
    if (calls <= succeedAfter) return { output: { reporting_period: '2025', annual_revenue: '$1,000,000', net_profit: '$100,000' } };
    throw new Error(message);
  };
  return { base44: { asServiceRole: { integrations: { Core: { ExtractDataFromUploadedFile: fn } } } }, calls: () => calls };
}

/** Compile the three 6D.0 modules + the engine, with dependencies injected. */
function loadEngine(sources = {}) {
  const periodApi = loadModule(
    sources.PERIOD ?? read(PERIOD),
    ['isApprovedDocumentBucket'], [() => true], // buckets not used by the period module
    '{ parseReportingPeriod, resolveReportingPeriod, periodMetadata, derivePeriodFromType }'
  );
  const confApi = loadModule(sources.CONFIDENCE ?? read(CONFIDENCE), [], [],
    '{ resolveFieldConfidence, REVIEWED_REVIEW_STATUSES, PERIOD_REQUIRED_TYPES, MODEL_CONFIDENCE_REVIEW_THRESHOLD }');
  const stateApi = loadModule(sources.STATE ?? read(STATE), [], [],
    '{ countExtractedFields, setDocumentUploadStatus, markAnalysis }');
  const engine = loadModule(
    sources.ENGINE ?? read(ENGINE),
    ['isApprovedDocumentBucket', 'resolveReportingPeriod', 'periodMetadata', 'resolveFieldConfidence',
      'REVIEWED_REVIEW_STATUSES', 'PERIOD_REQUIRED_TYPES', 'MODEL_CONFIDENCE_REVIEW_THRESHOLD',
      'countExtractedFields', 'setDocumentUploadStatus', 'markAnalysis'],
    [
      (b) => ['documents', 'client-documents', 'consulting_library_files'].includes(b),
      periodApi.resolveReportingPeriod, periodApi.periodMetadata, confApi.resolveFieldConfidence,
      confApi.REVIEWED_REVIEW_STATUSES, confApi.PERIOD_REQUIRED_TYPES, confApi.MODEL_CONFIDENCE_REVIEW_THRESHOLD,
      stateApi.countExtractedFields, stateApi.setDocumentUploadStatus, stateApi.markAnalysis,
    ],
    '{ runExtraction, EXTRACTION_SCHEMAS, normalizeExtraction, buildExtractionSchema, parseCurrency }'
  );
  return { engine, periodApi, confApi, stateApi, sources };
}

/** Run one extraction scenario. */
async function runExtract({ engine, document = baseDocument, analysis = baseAnalysis, seed = {}, base44 = null, ctx = CTX, storageDefault, missingTables }) {
  const world = makeSb({
    documents: [document], document_analysis: [analysis], extracted_fields: [], ...seed,
  }, { storageDefault, missingTables });
  const result = await engine.runExtraction(world.sb, ctx, { base44: base44 || extractorReturning({ reporting_period: 'Jan 2025 - Dec 2025', annual_revenue: '$1,000,000', net_profit: '$100,000' }) });
  return { result, world };
}
const analysisRow = (world) => (world.writesTo('document_analysis').slice(-1)[0] || {}).payload || {};
const fieldRows = (world) => world.writesTo('extracted_fields');
const docStatus = (world) => { const w = world.writesTo('documents').slice(-1)[0]; return w ? (w.payload.upload_status ?? null) : null; };

// ─────────────────────────────────────────────────────────────────────────────
// Security Kernel (real sources) + the real runDocumentExtraction handler
// ─────────────────────────────────────────────────────────────────────────────
function compileKernel(sources = {}) {
  const relApi = vm.runInNewContext(`${compileJs(sources.REL ?? read(REL))};({ isActiveRelationship, resolveActiveExpertRelationship })`,
    { console: quiet, Response: ResponseStub });
  const guardApi = vm.runInNewContext(`${compileJs(sources.GUARD ?? read(GUARD))};({ validateBusinessScope })`,
    { console: quiet, Response: ResponseStub, resolveActiveExpertRelationship: relApi.resolveActiveExpertRelationship, Deno: { env: { get: () => undefined } } });
  const activeApi = vm.runInNewContext(`${compileJs(sources.ACTIVE ?? read(ACTIVE))};({ requireBusinessContext, resolveActiveBusiness, assertBusinessAccess })`,
    { console: quiet, Response: ResponseStub, validateBusinessScope: guardApi.validateBusinessScope });
  const actorApi = vm.runInNewContext(`${compileJs(sources.ACTOR ?? read(ACTOR))};({ authenticateActor, resolveActingProfile, authorizeBusinessAccess, errorResponse, ADMIN_ROLES })`,
    { console: quiet, Response: ResponseStub, validateBusinessScope: guardApi.validateBusinessScope });
  const docApi = vm.runInNewContext(`${compileJs(sources.DOCACCESS ?? read(DOCACCESS))};({ authorizeDocumentAccess, resolveDocumentAuthorization })`,
    { console: quiet, Response: ResponseStub });
  return { ...activeApi, ...actorApi, ...docApi };
}

const IDENTITIES = {
  ownerA: { id: 'u-ownerA', email: 'ownera@vision.test' },
  ownerB: { id: 'u-ownerB', email: 'ownerb@vision.test' },
  b44adminOwnerA: { id: 'u-ownerA', email: 'ownera@vision.test', role: 'admin' },
  admin: { id: 'u-admin', email: 'admin@vision.test' },
  expert: { id: 'u-expert', email: 'expert@vision.test' },
  expertRev: { id: 'u-expert-rev', email: 'expertrev@vision.test' },
  suspended: { id: 'u-susp', email: 'susp@vision.test' },
};

const AUTHZ_SEED = {
  profiles: [
    { id: 'p-owner', email: 'ownera@vision.test', base44_user_id: 'u-ownerA', app_role: 'owner', primary_business_id: BUSINESS, profile_status: 'active' },
    { id: 'p-ownerB', email: 'ownerb@vision.test', base44_user_id: 'u-ownerB', app_role: 'owner', primary_business_id: OTHER_BUSINESS, profile_status: 'active' },
    { id: 'p-admin', email: 'admin@vision.test', base44_user_id: 'u-admin', app_role: 'admin', primary_business_id: 'b-admin', profile_status: 'active' },
    { id: 'p-expert', email: 'expert@vision.test', base44_user_id: 'u-expert', app_role: 'expert_advisor', primary_business_id: null, profile_status: 'active' },
    { id: 'p-expert-rev', email: 'expertrev@vision.test', base44_user_id: 'u-expert-rev', app_role: 'expert_advisor', primary_business_id: null, profile_status: 'active' },
    { id: 'p-susp', email: 'susp@vision.test', base44_user_id: 'u-susp', app_role: 'owner', primary_business_id: BUSINESS, profile_status: 'suspended' },
  ],
  business_entities: [
    { id: BUSINESS, profile_id: 'p-owner' },
    { id: OTHER_BUSINESS, profile_id: 'p-ownerB' },
  ],
  business_owners: [],
  business_team_members: [],
  expert_advisor_access: [
    { id: 'rel-active', expert_profile_id: 'p-expert', business_id: BUSINESS, access_status: 'active', revoked_at: null },
    { id: 'rel-revoked', expert_profile_id: 'p-expert-rev', business_id: BUSINESS, access_status: 'revoked', revoked_at: '2026-01-01T00:00:00Z' },
  ],
  documents: [
    { id: DOC, name: 'A.pdf', document_type: 'profit_and_loss', file_path: 'p/b-A/A.pdf', storage_bucket: 'documents', profile_id: 'p-owner', business_id: BUSINESS },
    { id: 'doc-foreign', name: 'B.pdf', document_type: 'profit_and_loss', file_path: 'p/b-B/B.pdf', storage_bucket: 'documents', profile_id: 'p-ownerB', business_id: OTHER_BUSINESS },
  ],
  document_analysis: [
    { id: 'an-1', document_id: DOC, document_type: 'profit_and_loss', analysis_status: 'failed', extracted_data: {}, business_id: BUSINESS, profile_id: 'p-owner' },
    { id: 'an-foreign', document_id: 'doc-foreign', document_type: 'profit_and_loss', analysis_status: 'failed', extracted_data: {}, business_id: OTHER_BUSINESS, profile_id: 'p-ownerB' },
  ],
  extracted_fields: [], business_facts: [], business_fact_evidence: [],
};



/** Extract the real `getDocumentSignedUrl` branch by brace matching and execute it. */
function extractRouterBranch(sourceText, actionName) {
  const start = sourceText.indexOf(`if (action === '${actionName}') {`);
  if (start < 0) throw new Error(`branch not found: ${actionName}`);
  let depth = 0;
  for (let i = sourceText.indexOf('{', start); i < sourceText.length; i++) {
    if (sourceText[i] === '{') depth++;
    else if (sourceText[i] === '}') {
      depth--;
      if (depth === 0) return sourceText.slice(start, i + 1);
    }
  }
  throw new Error('unbalanced branch');
}

/**
 * Execute the REAL getDocumentSignedUrl branch (extracted by brace matching) with
 * its dependencies injected. `getProfile` is injected because the branch resolves
 * its own profile — the branch text is executed exactly as it ships.
 */
const AUTHORIZED_BUCKETS = (b) => ['documents', 'client-documents', 'consulting_library_files'].includes(b);

async function runSignedUrlBranch({ kernel, data, sbSeed = {}, storageDefault, actorIsAdmin = false, profile = { id: 'p-owner', app_role: 'owner', primary_business_id: BUSINESS, email: 'ownera@vision.test' }, routerSource = null }) {
  const world = makeSb(JSON.parse(JSON.stringify({ ...AUTHZ_SEED, ...sbSeed })), { storageDefault });
  const branch = extractRouterBranch(routerSource || read(ROUTER), 'getDocumentSignedUrl');
  // Drop the branch's own `if (...) {` opener and its matching closing brace: the
  // remainder is the branch body, executed as shipped.
  const body = branch
    .replace(/^if \(action === 'getDocumentSignedUrl'\) \{/, '')
    .replace(/\}\s*$/, '');
  // The branch ships as TypeScript, so it is compiled before execution — the code
  // executed here is the code that ships, annotations included.
  const js = toJs(`module.exports.__run = async () => {${body}};`);
  const mod = { exports: {} };
  new Function(
    'sb', 'getProfile', 'data', 'actor', 'authorizeDocumentAccess', 'assertBusinessAccess', 'isApprovedDocumentBucket', 'Response', 'module',
    js
  )(world.sb, async () => profile, data, { isAdmin: actorIsAdmin },
    kernel.authorizeDocumentAccess, kernel.assertBusinessAccess, AUTHORIZED_BUCKETS, ResponseStub, mod);
  const res = await mod.exports.__run();
  return { res, world };
}

// ─────────────────────────────────────────────────────────────────────────────
(async () => {
  const { engine } = loadEngine();
  const kernel = compileKernel();
  // Capture the handler registered by Deno.serve.
  const origServePatch = () => {};

  console.log('── E1–E14 — extraction behaviour (real engine executed) ──');

  // E1 supported document processes successfully
  {
    const { result, world } = await runExtract({ engine });
    check('E1', 'supported document processes and persists its fields',
      result.success === true && result.finalStatus === 'completed' && result.extractedFieldsCount === 2
      && fieldRows(world).length === 2 && docStatus(world) === 'completed',
      `status=${result.finalStatus} fields=${result.extractedFieldsCount} docStatus=${docStatus(world)}`);
    check('E1b', 'the document row is the authority for the type used', result.documentType === 'profit_and_loss');
  }

  // E2 unsupported document type fails honestly
  {
    const doc = { ...baseDocument, document_type: 'other' };
    const an = { ...baseAnalysis, document_type: 'other' };
    const { result, world } = await runExtract({ engine, document: doc, analysis: an, ctx: { ...CTX, documentType: 'other' } });
    const payload = analysisRow(world);
    check('E2', 'unclassified document is STORED and marked unsupported — never a failed upload',
      result.finalStatus === 'unsupported' && result.errorClass === 'unsupported_type'
      && payload.extracted_data?.unsupported_kind === 'classification_unsupported'
      && payload.analysis_status === 'unsupported'
      && fieldRows(world).length === 0 && docStatus(world) === 'uploaded',
      `class=${result.errorClass} kind=${payload.extracted_data?.unsupported_kind} analysis=${payload.analysis_status} docStatus=${docStatus(world)}`);
    const named = await runExtract({ engine, document: { ...baseDocument, document_type: 'buy_sell_agreement' }, analysis: { ...baseAnalysis, document_type: 'buy_sell_agreement' }, ctx: { ...CTX, documentType: 'buy_sell_agreement' } });
    check('E2b', 'a named-but-unreadable type is distinguished from an unclassified one',
      named.result.errorClass === 'unsupported_type'
      && analysisRow(named.world).extracted_data?.unsupported_kind === 'extraction_unsupported',
      `kind=${analysisRow(named.world).extracted_data?.unsupported_kind}`);
  }

  // E3 confidence is not hardcoded
  {
    const noConfidence = await runExtract({ engine });
    const rows = fieldRows(noConfidence.world);
    const scores = rows.map((w) => w.payload.confidence_score);
    check('E3', 'no confidence is fabricated when the provider reports none',
      scores.every((s) => s === null) && noConfidence.result.averageConfidence === null
      && noConfidence.result.confidenceState === 'unavailable'
      && !scores.includes(85) && !scores.includes('85'),
      `scores=${JSON.stringify(scores)} avg=${noConfidence.result.averageConfidence}`);

    const withConfidence = await runExtract({
      engine,
      base44: extractorReturning({
        reporting_period: 'Jan 2025 - Dec 2025',
        annual_revenue: { value: '$1,000,000', confidence: 0.92 },
        net_profit: { value: '$100,000', confidence: 88 },
        cogs: '$600,000', // no reported confidence → the state must be MIXED, not uniform
      }),
    });
    const reported = fieldRows(withConfidence.world).map((w) => w.payload.confidence_score).filter((s) => s != null);
    check('E3b', "a provider-reported confidence is preserved, not replaced",
      reported.includes(92) && reported.includes(88) && withConfidence.result.confidenceState === 'mixed',
      `scores=${JSON.stringify(reported)} state=${withConfidence.result.confidenceState}`);
  }

  // E4 needs_review reachable
  {
    const unnormalized = await runExtract({
      engine,
      base44: extractorReturning({ reporting_period: 'Jan 2025 - Dec 2025', annual_revenue: 'not disclosed', net_profit: '$100,000' }),
    });
    check('E4', 'needs_review is reachable from a legitimate rule (unnormalizable value)',
      unnormalized.result.finalStatus === 'needs_review'
      && unnormalized.result.reviewReasons.includes('value_not_normalized'),
      `reasons=${JSON.stringify(unnormalized.result.reviewReasons)}`);

    const noPeriod = await runExtract({ engine, base44: extractorReturning({ annual_revenue: '$1,000,000' }) });
    check('E4b', 'an unresolved period on a period-bearing document requires review',
      noPeriod.result.finalStatus === 'needs_review'
      && noPeriod.result.reviewReasons.includes('reporting_period_unresolved'),
      `reasons=${JSON.stringify(noPeriod.result.reviewReasons)}`);
    check('E4c', 'confidence being unavailable is NOT itself a review reason',
      !noPeriod.result.reviewReasons.includes('confidence_unavailable') && noPeriod.result.confidenceState === 'unavailable');
  }

  // E5 / E6 period integrity
  {
    const { result, world } = await runExtract({ engine });
    const meta = fieldRows(world)[0].payload.metadata;
    const periodInfo = analysisRow(world).extracted_data?.period_info;
    check('E5', 'the extracted reporting period survives persistence verbatim',
      meta.period_raw === 'Jan 2025 - Dec 2025' && meta.period_source === 'model_reported'
      && meta.period_start === '2025-01-01' && meta.period_end === '2025-12-31'
      && result.period?.period_type === 'annual'
      && periodInfo?.period_start === '2025-01-01',
      `raw=${meta.period_raw} start=${meta.period_start} source=${meta.period_source}`);

    // A balance sheet is an as-of document: its period is 'as of <date>'.
    const asOf = await runExtract({
      engine,
      document: { ...baseDocument, document_type: 'balance_sheet' },
      analysis: { ...baseAnalysis, document_type: 'balance_sheet' },
      ctx: { ...CTX, documentType: 'balance_sheet' },
      base44: extractorReturning({ reporting_period: 'As of December 31, 2025', cash_on_hand: '$350,000' }),
    });
    const am = fieldRows(asOf.world)[0].payload.metadata;
    check('E6', 'as_of_date survives where the source states an as-of period',
      am.as_of_date === '2025-12-31' && am.period_end === '2025-12-31'
      && analysisRow(asOf.world).extracted_data?.period_info?.period_type === 'as_of',
      `as_of=${am.as_of_date} type=${am.period_type}`);

    const declared = await runExtract({ engine, ctx: { ...CTX, year: 2024 }, base44: extractorReturning({ annual_revenue: '$1,000,000' }) });
    const dm = fieldRows(declared.world)[0].payload.metadata;
    check('E6b', 'a declared year is labelled as declared, never presented as extracted',
      dm.period_source === 'user_declared_year' && dm.period_start === '2024-01-01' && dm.period_raw === null
      && declared.result.finalStatus === 'completed',
      `source=${dm.period_source} start=${dm.period_start}`);
    const nothing = await runExtract({ engine, base44: extractorReturning({ annual_revenue: '$1,000,000' }) });
    const nm = fieldRows(nothing.world)[0].payload.metadata;
    check('E6c', 'no calendar year is manufactured when nothing states a period',
      nm.period_start === null && nm.period_end === null && nm.fiscal_year === null
      && nm.period_source === 'unresolved' && nm.period_ambiguous === true,
      `start=${nm.period_start} source=${nm.period_source}`);
  }

  // E7 transient retry preserves required client/context
  {
    const failer = extractorFailing('operation timeout while contacting provider', 0);
    const world = makeSb({ documents: [baseDocument], document_analysis: [baseAnalysis], extracted_fields: [] });
    const result = await engine.runExtraction(world.sb, CTX, { base44: failer.base44 });
    const retryWrite = analysisRow(world);
    check('E7', 'a transient failure is classified transient, not permanent',
      result.finalStatus === 'failed' && retryWrite.extracted_data?._retry_info?.last_error_class === 'transient'
      && retryWrite.extracted_data?._retry_info?.attempt === 3,
      `class=${retryWrite.extracted_data?._retry_info?.last_error_class} attempt=${retryWrite.extracted_data?._retry_info?.attempt}`);
  }
  {
    // The defect class: the recursion dropped the base44 client, so attempt 2 threw
    // "requires base44 client" and a recoverable failure became terminal.
    let calls = 0;
    const flaky = { asServiceRole: { integrations: { Core: { ExtractDataFromUploadedFile: async () => {
      calls++;
      if (calls === 1) throw new Error('network timeout');
      return { output: { reporting_period: 'Jan 2025 - Dec 2025', annual_revenue: '$1,000,000' } };
    } } } } };
    const world = makeSb({ documents: [baseDocument], document_analysis: [baseAnalysis], extracted_fields: [] });
    const result = await engine.runExtraction(world.sb, CTX, { base44: flaky });
    check('E7b', 'a retry after a transient failure keeps the base44 client (and therefore succeeds)',
      result.success === true && result.finalStatus === 'completed' && calls === 2,
      `success=${result.success} status=${result.finalStatus} providerCalls=${calls}`);
  }

  // E8 retry remains the same business/document
  {
    const world = makeSb({ documents: [baseDocument], document_analysis: [baseAnalysis], extracted_fields: [] });
    let calls = 0;
    const flaky = { asServiceRole: { integrations: { Core: { ExtractDataFromUploadedFile: async () => {
      calls++;
      if (calls === 1) throw new Error('network timeout');
      return { output: { reporting_period: 'Jan 2025 - Dec 2025', annual_revenue: '$1,000,000' } };
    } } } } };
    const result = await engine.runExtraction(world.sb, CTX, { base44: flaky });
    const analysisWrites = world.writesTo('document_analysis');
    const inserted = analysisWrites.filter((w) => w.op === 'insert');
    const touchedAnalyses = new Set(analysisWrites.flatMap((w) => w.filters.filter(([c]) => c === 'id').map(([, v]) => v)));
    const touchedBusinesses = new Set(world.writesTo('extracted_fields').map((w) => w.payload.business_id));
    check('E8', 'retry stays on the same analysis and document and never re-scopes the business',
      inserted.length === 0 && touchedAnalyses.size <= 1 && [...touchedAnalyses].every((v) => v === 'an-1')
      && [...touchedBusinesses].every((v) => v === BUSINESS) && result.businessScoped !== false,
      `analyses=${[...touchedAnalyses]} businesses=${[...touchedBusinesses]}`);
  }

  // E9 / E10 / E11 / E25 review safety
  const reviewedSeed = {
    extracted_fields: [
      { id: 'ef-accepted', document_analysis_id: 'an-1', document_id: DOC, field_name: 'annual_revenue', review_status: 'accepted', normalized_value: 900000, accepted_value: '$900,000', accepted_normalized_value: 900000, reviewed_by: 'p-owner', reviewed_at: '2026-09-01T00:00:00Z', metadata: { period_start: '2025-01-01' } },
      { id: 'ef-corrected', document_analysis_id: 'an-1', document_id: DOC, field_name: 'net_profit', review_status: 'corrected', normalized_value: 50000, accepted_value: '$90,000', accepted_normalized_value: 90000, reviewed_by: 'p-owner', reviewed_at: '2026-09-02T00:00:00Z', metadata: {} },
      { id: 'ef-rejected', document_analysis_id: 'an-1', document_id: DOC, field_name: 'cogs', review_status: 'rejected', normalized_value: 500000, metadata: {} },
      { id: 'ef-pending', document_analysis_id: 'an-1', document_id: DOC, field_name: 'taxes', review_status: 'pending_review', normalized_value: 10000, metadata: {} },
    ],
  };
  const reprocess = await runExtract({
    engine, seed: reviewedSeed,
    base44: extractorReturning({ reporting_period: 'Jan 2025 - Dec 2025', annual_revenue: '$1,000,000', net_profit: '$100,000', cogs: '$600,000', taxes: '$12,000' }),
  });
  {
    const updates = fieldRows(reprocess.world).filter((w) => w.op === 'update');
    const deletes = fieldRows(reprocess.world).filter((w) => w.op === 'delete');
    const byId = (id) => updates.find((w) => w.filters.some(([c, v]) => c === 'id' && v === id));
    const acceptedUpd = byId('ef-accepted');
    const correctedUpd = byId('ef-corrected');
    const rejectedUpd = byId('ef-rejected');
    const pendingUpd = byId('ef-pending');

    check('E9', 'an ACCEPTED observation is never silently replaced (decision + value preserved)',
      deletes.length === 0 && !updates.some((w) => w.filters.some(([c, v]) => c === 'id' && v === 'ef-accepted') && ('normalized_value' in w.payload || 'review_status' in w.payload))
      && Boolean(acceptedUpd?.payload?.metadata?.reprocess_discrepancy),
      `updates=${JSON.stringify(updates.map((u) => Object.keys(u.payload)))}`);

    check('E10', 'a CORRECTED observation is never silently replaced',
      !updates.some((w) => w.filters.some(([c, v]) => c === 'id' && v === 'ef-corrected') && ('accepted_normalized_value' in w.payload || 'normalized_value' in w.payload || 'review_status' in w.payload))
      && Boolean(correctedUpd?.payload?.metadata?.reprocess_discrepancy),
      `correctedUpdate=${JSON.stringify(correctedUpd?.payload ? Object.keys(correctedUpd.payload) : null)}`);

    check('E11', 'a REJECTED observation is not resurrected as trusted',
      !fieldRows(reprocess.world).some((w) => w.op === 'insert' && w.payload.field_name === 'cogs')
      && !updates.some((w) => w.filters.some(([c, v]) => c === 'id' && v === 'ef-rejected') && w.payload.review_status && w.payload.review_status !== 'rejected'),
      'a rejected field must keep its status and gain no replacement row');

    check('E12', 'a PENDING observation is safely reconciled in place',
      Boolean(pendingUpd) && pendingUpd.payload.normalized_value === 12000 && !fieldRows(reprocess.world).some((w) => w.op === 'insert' && w.payload.field_name === 'taxes'),
      JSON.stringify(pendingUpd?.payload ?? null));

    check('E25', 'reprocessing preserves human review lineage and surfaces the discrepancy',
      reprocess.result.finalStatus === 'needs_review'
      && reprocess.result.reviewReasons.includes('reprocess_discrepancy')
      && reprocess.result.discrepancyCount >= 2
      && reprocess.result.reviewPreserved === 3
      && fieldRows(reprocess.world).filter((w) => w.op === 'insert').length === 0,
      `reasons=${JSON.stringify(reprocess.result.reviewReasons)} preserved=${reprocess.result.reviewPreserved} discrepancies=${reprocess.result.discrepancyCount}`);
  }

  // E13 / E14 storage bucket authority
  {
    const library = await runExtract({ engine, document: { ...baseDocument, storage_bucket: 'client-documents' } });
    check('E13', 'the persisted storage_bucket is used to read the source',
      library.world.storageCalls.length === 1 && library.world.storageCalls[0].bucket === 'client-documents'
      && !library.world.storageCalls.some((c) => c.bucket === 'documents'),
      JSON.stringify(library.world.storageCalls));

    const unapproved = await runExtract({ engine, document: { ...baseDocument, storage_bucket: 'some-other-bucket' } });
    check('E14', 'an unapproved persisted bucket fails closed without guessing a bucket',
      unapproved.result.finalStatus === 'failed' && unapproved.result.errorClass === 'source_unresolvable'
      && unapproved.world.storageCalls.length === 0,
      `class=${unapproved.result.errorClass} storageCalls=${unapproved.world.storageCalls.length}`);

    const clientBucket = await runExtract({ engine, ctx: { ...CTX, storage_bucket: 'attacker-bucket', bucket: 'attacker-bucket' } });
    check('E14b', 'a client-supplied bucket cannot influence which bucket is read',
      clientBucket.world.storageCalls.length === 1 && clientBucket.world.storageCalls[0].bucket === 'documents',
      JSON.stringify(clientBucket.world.storageCalls));
  }

  console.log('\n── E15–E18 — source missing + viewer contract ──');

  // E15 missing source does not delete surviving extraction
  {
    const seed = { extracted_fields: [
      { id: 'ef-1', document_analysis_id: 'an-1', document_id: DOC, field_name: 'annual_revenue', review_status: 'pending_review', normalized_value: 1000000, metadata: {} },
      { id: 'ef-2', document_analysis_id: 'an-1', document_id: DOC, field_name: 'net_profit', review_status: 'accepted', normalized_value: 100000, accepted_normalized_value: 100000, metadata: {} },
    ] };
    const missing = await runExtract({ engine, seed, storageDefault: { error: { message: 'Object not found', statusCode: 404 } } });
    const payload = analysisRow(missing.world);
    check('E15', 'a missing source does not delete surviving extraction',
      fieldRows(missing.world).length === 0
      && payload.extracted_data?.source_status === 'missing'
      && payload.extracted_data?.retained_extracted_fields === 2
      && payload.analysis_status === 'needs_review'
      && missing.result.sourceStatus === 'missing',
      `writes=${fieldRows(missing.world).length} status=${payload.analysis_status} source=${payload.extracted_data?.source_status}`);

    const none = await runExtract({ engine, storageDefault: { error: { message: 'Object not found', statusCode: 404 } } });
    check('E15b', 'a missing source with no surviving extraction is a distinct, classed failure',
      analysisRow(none.world).extracted_data?._retry_info?.last_error_class === 'source_missing'
      && none.result.finalStatus === 'failed' && docStatus(none.world) === 'failed');
  }

  // E16 missing source produces a safe user-facing state (real router branch executed)
  {
    const withExtraction = await runSignedUrlBranch({
      kernel, data: { documentId: DOC }, storageDefault: { error: { message: 'Object not found', statusCode: 404 } },
      sbSeed: { extracted_fields: [{ id: 'ef-1', document_id: DOC, document_analysis_id: 'an-1', field_name: 'annual_revenue' }] },
      userDoc: { profile: { id: 'p-owner', app_role: 'owner', primary_business_id: BUSINESS } },
    });
    check('E16', 'a missing source produces a safe source state, not a raw error',
      withExtraction.res.status === 200 && withExtraction.res.body?.source_unavailable === true
      && withExtraction.res.body?.has_extraction === true
      && withExtraction.res.body?.signedUrl === null
      && !/HTTPException|traceback|Object not found/.test(JSON.stringify(withExtraction.res.body)),
      JSON.stringify(withExtraction.res.body));

    const withoutExtraction = await runSignedUrlBranch({
      kernel, data: { documentId: DOC }, storageDefault: { error: { message: 'Object not found', statusCode: 404 } },
      userDoc: { profile: { id: 'p-owner', app_role: 'owner', primary_business_id: BUSINESS } },
    });
    check('E16b', 'retained extraction is only claimed when it actually exists',
      withoutExtraction.res.body?.has_extraction === false,
      JSON.stringify(withoutExtraction.res.body));
  }

  // E17 no raw error reaches the owner
  {
    const viewer = read(VIEWER);
    const hook = read(HOOK);
    check('E17', 'the owner-facing source-missing state carries human language and no raw error',
      /VISION still has information previously extracted from this document/.test(viewer)
      && /The original file is no longer available\. Re-upload it to continue\./.test(viewer)
      && !/HTTPException|traceback|error\.message/.test(viewer)
      && !/HTTPException|traceback/.test(hook),
      'viewer/hook must not surface transport error text');
  }

  // E18 existing valid document viewer still works
  {
    const ok = await runSignedUrlBranch({
      kernel, data: { documentId: DOC },
      userDoc: { profile: { id: 'p-owner', app_role: 'owner', primary_business_id: BUSINESS } },
    });
    check('E18', 'an existing valid document still resolves a signed URL from its own bucket',
      ok.res.status === 200 && typeof ok.res.body?.signedUrl === 'string'
      && ok.world.storageCalls[0]?.bucket === 'documents' && ok.world.storageCalls[0]?.ttl === 900,
      JSON.stringify(ok.res.body));
    check('E18b', 'the source state travels out of the SINGLE authorized resolution call (no second request)',
      /source_unavailable/.test(read(HOOK))
      && (read(HOOK).match(/action: 'getDocumentSignedUrl'/g) || []).length === 1
      && /onSourceState/.test(read(HOOK))
      && !/\.catch\(\(\) => null\)/.test(read(HOOK))
      && !read(HOOK).includes("action: 'getDocumentSignedUrl' }"),
      'the viewer must consume the state from the one call it already makes');
  }

  console.log('\n── E19–E20 — no Digital Twin writes ──');

  {
    const all = [
      reprocess.world, (await runExtract({ engine })).world,
      (await runExtract({ engine, storageDefault: { error: { message: 'Object not found' } } })).world,
    ];
    const touched = new Set(all.flatMap((w) => w.writes.map((x) => x.table)));
    check('E19', 'extraction writes ZERO business_facts rows', !touched.has('business_facts'), `touched=${[...touched].join(', ')}`);
    check('E20', 'extraction writes ZERO business_fact_evidence rows', !touched.has('business_fact_evidence'));
    const engineSrc = read(ENGINE) + read(STATE) + read(PERIOD) + read(CONFIDENCE);
    check('E20b', 'no fact table name appears in any 6D.0 extraction module',
      !/business_facts|business_fact_evidence/.test(engineSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')));
  }

  console.log('\n── E21–E24 — authorization on the modified path (real kernel + real handler) ──');

  // Capture the handler registered by Deno.serve inside the compiled entry.
  const entryHandler = (user, world, kernelRef, engineRef) => {
    const code = compileJs(read(ENTRY));
    let captured = null;
    const fakeBase44 = { auth: { me: async () => user }, ...extractorReturning({ reporting_period: '2025', annual_revenue: '$1,000,000' }) };
    const spy = async (sb, ctx, options) => engineRef.runExtraction(sb, ctx, { ...options, base44: fakeBase44 });
    new Function('createClientFromRequest', 'createClient', 'runExtraction', 'authenticateActor', 'errorResponse',
      'authorizeDocumentAccess', 'assertBusinessAccess', 'Deno', 'Response', 'console', code)(
      () => fakeBase44, () => world.sb, spy, kernelRef.authenticateActor, kernelRef.errorResponse,
      kernelRef.authorizeDocumentAccess, kernelRef.assertBusinessAccess,
      { env: { get: (k) => (k === 'VITE_SUPABASE_URL' ? 'https://mock.supabase.co' : 'mock-key') }, serve: (fn) => { captured = fn; } },
      ResponseStub, quiet
    );
    return captured;
  };

  const runHandler = async ({ user, analysisId, kernelRef = kernel, engineRef = engine, sbSeed = {} }) => {
    const world = makeSb(JSON.parse(JSON.stringify({ ...AUTHZ_SEED, ...sbSeed })), {});
    const handler = entryHandler(user, world, kernelRef, engineRef);
    const res = await handler({ json: async () => ({ documentAnalysisId: analysisId }) });
    return { res, world };
  };

  {
    const owner = await runHandler({ user: IDENTITIES.ownerA, analysisId: 'an-1' });
    check('E21', 'the owner of the document may still run extraction on their own document',
      owner.res.status === 200, `status=${owner.res.status} body=${JSON.stringify(owner.res.body).slice(0, 120)}`);

    const cross = await runHandler({ user: IDENTITIES.ownerA, analysisId: 'an-foreign' });
    const unknown = await runHandler({ user: IDENTITIES.ownerA, analysisId: 'an-does-not-exist' });
    check('E21b', 'a foreign document is refused on the extraction path',
      cross.res.status === 404, `status=${cross.res.status}`);
    check('E21c', 'a foreign analysis and a nonexistent analysis are indistinguishable (no oracle)',
      JSON.stringify(cross.res) === JSON.stringify(unknown.res),
      `${JSON.stringify(cross.res.body)} vs ${JSON.stringify(unknown.res.body)}`);

    const b44Admin = await runHandler({ user: IDENTITIES.b44adminOwnerA, analysisId: 'an-foreign' });
    check('E21d', 'a Base44 user.role of admin does NOT elevate canonical standing on this path',
      b44Admin.res.status === 404, `status=${b44Admin.res.status}`);

    const canonicalAdmin = await runHandler({ user: IDENTITIES.admin, analysisId: 'an-foreign' });
    check('E21e', 'a canonical admin retains access', canonicalAdmin.res.status === 200, `status=${canonicalAdmin.res.status}`);

    const expert = await runHandler({ user: IDENTITIES.expert, analysisId: 'an-1' });
    check('E21f', 'an expert with a LIVE canonical relationship is authorized through the shared layer',
      expert.res.status === 200, `status=${expert.res.status} body=${JSON.stringify(expert.res.body).slice(0, 140)}`);

    const revoked = await runHandler({ user: IDENTITIES.expertRev, analysisId: 'an-1' });
    check('E23', 'a REVOKED expert relationship grants nothing on this path', revoked.res.status === 404, `status=${revoked.res.status}`);

    const suspended = await runHandler({ user: IDENTITIES.suspended, analysisId: 'an-1' });
    check('E22', 'a suspended canonical actor is denied on this path',
      suspended.res.status === 403 || suspended.res.status === 404, `status=${suspended.res.status}`);

    const entrySrc = read(ENTRY);
    const entryCode = entrySrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // The retired table must not appear in this function's own code at all. (The
    // shared Security Kernel carries a pre-existing inert probe of it — that is
    // kernel scope, it fails closed and this slice does not touch it.)
    check('E24', 'the extraction path itself never consults advisor_assignments',
      !/advisor_assignments/.test(strip(entryCode)),
      'the retired table must not reappear in this function');
    check('E24d', 'the expert grant came from the canonical relationship, not from advisor_assignments',
      expert.res.status === 200 && !(AUTHZ_SEED.advisor_assignments || []).length,
      'a live expert is authorized while zero advisor_assignments rows exist in the environment');
    check('E24b', 'the modified path reuses the Security Kernel rather than restating authority',
      /authenticateActor/.test(entrySrc) && /authorizeDocumentAccess/.test(entrySrc) && /assertBusinessAccess/.test(entrySrc));
    check('E24c', 'the extraction path derives its tenant from the persisted row',
      !/body\.business_id|body\.profile_id/.test(strip(entrySrc)));
  }

  console.log('\n── M1–M12 — MUTATION TESTS (mutate the REAL source, re-run, must be caught) ──');
  const baselineEngine = read(ENGINE);
  const baselineConf = read(CONFIDENCE);
  const baselineRouter = read(ROUTER);
  const baselineEntry = read(ENTRY);

  const CONF_LINE = 'confidence_score: confidence.score,';
  const PERIOD_LINE = 'const period = resolveReportingPeriod(extractedPeriodRaw, ctx.year ?? docRow?.year ?? null);';
  // 6D.0c retarget: the engine's recursive reader call was renamed from `runExtraction`
  // to `runExtractionCore` (the public `runExtraction` remains the ONE exported entry
  // point, which now wraps the core so it can attach the typed outcome). The anchor
  // moves with the function it names — the mutation and the assertion are unchanged.
  const RETRY_BLOCK = `return runExtractionCore(sb, ctx, {
        attempt: attempt + 1,
        base44: options?.base44,
        useMock: options?.useMock,
      });`;
  const REVIEWED_GUARD = 'if (existing && REVIEWED_REVIEW_STATUSES.includes(existing.review_status)) {';
  const RECONCILE_LOAD = `    const { data: existingFields } = await sb.from('extracted_fields')`;
  const SIGN_CALL = `      .from(docRow.storage_bucket)`;
  const SAFE_RESPONSE = `          return Response.json({
            signedUrl: null,
            source_unavailable: true,
            reason: 'source_missing',
            has_extraction: (count || 0) > 0,
          });`;
  const VERDICT_GATE = `    if (!verdict.authorized) return Response.json({ error: 'Not found' }, { status: 404 });`;

  const MUTATIONS = [
    { id: 'M1', name: 'confidence restored to the hardcoded 85', file: 'ENGINE',
      edits: [[CONF_LINE, `confidence_score: confidence.score == null ? '85' : confidence.score,`]] },
    { id: 'M2', name: 'the extracted reporting period discarded', file: 'ENGINE',
      edits: [[PERIOD_LINE, `const period = resolveReportingPeriod(null, ctx.year ?? docRow?.year ?? null);`]] },
    { id: 'M3', name: 'retry drops the base44/client context', file: 'ENGINE',
      edits: [[RETRY_BLOCK, `return runExtractionCore(sb, ctx, { attempt: attempt + 1 });`]] },
    { id: 'M4', name: 'all extracted fields deleted before reprocessing', file: 'ENGINE',
      edits: [[RECONCILE_LOAD, `    await sb.from('extracted_fields').delete().eq('document_analysis_id', ctx.documentAnalysisId);\n${RECONCILE_LOAD}`]] },
    { id: 'M5', name: 'the storage bucket hardcoded to "documents"', file: 'ENGINE',
      edits: [[SIGN_CALL, `      .from('documents')`]] },
    { id: 'M6', name: 'the raw storage error exposed instead of the safe source state', file: 'ROUTER',
      edits: [[SAFE_RESPONSE, `          throw new Error(signedErr.message);`]] },
    { id: 'M7', name: 'a reviewed observation treated as replaceable (accepted erased)', file: 'ENGINE',
      edits: [[REVIEWED_GUARD, `if (false && existing && REVIEWED_REVIEW_STATUSES.includes(existing.review_status)) {`]] },
    { id: 'M8', name: 'reviewed observations no longer protected by the status list', file: 'CONF',
      edits: [[`export const REVIEWED_REVIEW_STATUSES = ['accepted', 'corrected', 'rejected', 'needs_clarification'];`,
        `export const REVIEWED_REVIEW_STATUSES = ['accepted', 'corrected', 'needs_clarification'];`]] },
    { id: 'M9', name: 'a reviewed observation is re-pended instead of preserved', file: 'ENGINE',
      edits: [[`          await sb.from('extracted_fields').update({
            metadata: {`, `          await sb.from('extracted_fields').update({
            review_status: 'pending_review',
            metadata: {`]] },
    { id: 'M9b', name: 'reprocessing falls through and overwrites a reviewed observation', file: 'ENGINE',
      edits: [[`        continue;
      }

      if (existing) {`, `      }

      if (existing) {`]] },
    { id: 'M10', name: 'extraction writes business_facts', file: 'ENGINE',
      edits: [[RECONCILE_LOAD, `    await sb.from('business_facts').insert({ business_id: ctx.businessId, fact_key: 'revenue', value_numeric: 1 });\n${RECONCILE_LOAD}`]] },
    { id: 'M11', name: 'a client-supplied bucket trusted for the source read', file: 'ENGINE',
      edits: [[`      .from(docRow.storage_bucket)\n      .createSignedUrl(docRow.file_path, 300)`,
        `      .from((ctx as any).storage_bucket || docRow.storage_bucket)\n      .createSignedUrl(docRow.file_path, 300)`]] },
    { id: 'M12', name: 'business scope broadened on the extraction path', file: 'ENTRY',
      edits: [[VERDICT_GATE, `    if (false && !verdict.authorized) return Response.json({ error: 'Not found' }, { status: 404 });`],
        [`        assertBusinessAccess(sb, businessId, actor.profile, { action: 'runDocumentExtraction' }),`,
          `        Promise.resolve(businessId),`]] },
  ];

  for (const mut of MUTATIONS) {
    const sources = {};
    let mutated = null;
    if (mut.file === 'ENGINE') mutated = baselineEngine;
    if (mut.file === 'CONF') mutated = baselineConf;
    if (mut.file === 'ROUTER') mutated = baselineRouter;
    if (mut.file === 'ENTRY') mutated = baselineEntry;

    const missingEdit = mut.edits.find(([find]) => !mutated.includes(find));
    if (missingEdit) {
      check(mut.id, `${mut.name} → CAUGHT`, false, `mutation anchor not found: ${String(missingEdit[0]).slice(0, 60)}`);
      continue;
    }
    for (const [find, repl] of mut.edits) mutated = mutated.replace(find, repl);
    if (mut.file === 'ENGINE') sources.ENGINE = mutated;
    if (mut.file === 'CONF') sources.CONFIDENCE = mutated;
    if (mut.file === 'ROUTER') sources.ROUTER = mutated;
    if (mut.file === 'ENTRY') sources.ENTRY = mutated;

    let caught = false;
    let why = '';
    try {
      if (mut.file === 'ROUTER') {
        let threw = null;
        let body = null;
        try {
          const out = await runSignedUrlBranch({
            kernel, data: { documentId: DOC }, routerSource: mutated,
            storageDefault: { error: { message: 'Object not found', statusCode: 404 } },
          });
          body = out.res.body;
        } catch (e) { threw = e; }
        caught = Boolean(threw) || body?.source_unavailable !== true || /Object not found/.test(JSON.stringify(body));
        why = threw ? `raw error escaped: ${threw.message}` : `body=${JSON.stringify(body)}`;
      } else if (mut.file === 'ENTRY') {
        const loaded = loadEngine(sources);
        const kernelRef = compileKernel();
        const mutatedEntrySource = sources.ENTRY;
        const code = compileJs(mutatedEntrySource);
        const world = makeSb(JSON.parse(JSON.stringify(AUTHZ_SEED)), {});
        let captured = null;
        const fakeBase44 = { auth: { me: async () => IDENTITIES.ownerA }, ...extractorReturning({ reporting_period: '2025', annual_revenue: '$1,000,000' }) };
        new Function('createClientFromRequest', 'createClient', 'runExtraction', 'authenticateActor', 'errorResponse',
          'authorizeDocumentAccess', 'assertBusinessAccess', 'Deno', 'Response', 'console', code)(
          () => fakeBase44, () => world.sb,
          async (sb, ctx, options) => loaded.engine.runExtraction(sb, ctx, { ...options, base44: fakeBase44 }),
          kernelRef.authenticateActor, kernelRef.errorResponse, kernelRef.authorizeDocumentAccess, kernelRef.assertBusinessAccess,
          { env: { get: () => 'mock' }, serve: (fn) => { captured = fn; } }, ResponseStub, quiet
        );
        const res = await captured({ json: async () => ({ documentAnalysisId: 'an-foreign' }) });
        caught = res.status !== 404;
        why = `cross-business request returned ${res.status}`;
      } else {
        const loaded = loadEngine(sources);
        const confApi = loaded.confApi;
        const reviewedStatuses = confApi.REVIEWED_REVIEW_STATUSES;

        if (mut.id === 'M1') {
          const r = await runExtract({ engine: loaded.engine });
          const scores = fieldRows(r.world).map((w) => w.payload.confidence_score);
          caught = scores.includes('85') || scores.includes(85);
          why = `scores=${JSON.stringify(scores)}`;
        } else if (mut.id === 'M2') {
          const r = await runExtract({ engine: loaded.engine });
          const meta = fieldRows(r.world)[0].payload.metadata;
          caught = meta.period_start !== '2025-01-01' || meta.period_raw == null;
          why = `period_start=${meta.period_start} raw=${meta.period_raw}`;
        } else if (mut.id === 'M3') {
          let calls = 0;
          const flaky = { asServiceRole: { integrations: { Core: { ExtractDataFromUploadedFile: async () => {
            calls++; if (calls === 1) throw new Error('network timeout');
            return { output: { reporting_period: '2025', annual_revenue: '$1,000,000' } };
          } } } } };
          const world = makeSb({ documents: [baseDocument], document_analysis: [baseAnalysis], extracted_fields: [] });
          const r = await loaded.engine.runExtraction(world.sb, CTX, { base44: flaky });
          caught = r.success !== true;
          why = `retry outcome=${r.finalStatus}`;
        } else if (mut.id === 'M4') {
          const seed = { extracted_fields: [{ id: 'ef-accepted', document_analysis_id: 'an-1', document_id: DOC, field_name: 'annual_revenue', review_status: 'accepted', normalized_value: 900000, accepted_normalized_value: 900000, metadata: {} }] };
          const r = await runExtract({ engine: loaded.engine, seed });
          caught = fieldRows(r.world).some((w) => w.op === 'delete');
          why = 'a delete was issued against reviewed observations';
        } else if (mut.id === 'M5') {
          const r = await runExtract({ engine: loaded.engine, document: { ...baseDocument, storage_bucket: 'client-documents' } });
          caught = r.world.storageCalls.some((c) => c.bucket === 'documents');
          why = `buckets=${JSON.stringify(r.world.storageCalls.map((c) => c.bucket))}`;
        } else if (mut.id === 'M7' || mut.id === 'M8' || mut.id === 'M9' || mut.id === 'M9b') {
          const seed = { extracted_fields: [
            { id: 'ef-accepted', document_analysis_id: 'an-1', document_id: DOC, field_name: 'annual_revenue', review_status: 'accepted', normalized_value: 900000, accepted_normalized_value: 900000, reviewed_at: '2026-09-01T00:00:00Z', metadata: {} },
            { id: 'ef-corrected', document_analysis_id: 'an-1', document_id: DOC, field_name: 'net_profit', review_status: 'corrected', normalized_value: 50000, accepted_normalized_value: 90000, metadata: {} },
            { id: 'ef-rejected', document_analysis_id: 'an-1', document_id: DOC, field_name: 'cogs', review_status: 'rejected', normalized_value: 500000, metadata: {} },
            { id: 'ef-pending', document_analysis_id: 'an-1', document_id: DOC, field_name: 'taxes', review_status: 'pending_review', normalized_value: 10000, metadata: {} },
          ] };
          // Every reviewed field is produced by this run, so a mutation that stops
          // protecting it actually gets the chance to overwrite it.
          const r = await runExtract({
            engine: loaded.engine, seed,
            base44: extractorReturning({ reporting_period: 'Jan 2025 - Dec 2025', annual_revenue: '$1,000,000', net_profit: '$100,000', cogs: '$600,000', taxes: '$12,000' }),
          });
          const updates = fieldRows(r.world).filter((w) => w.op === 'update');
          // A reviewed observation is honoured only if NO update touched its value,
          // its accepted value or its review status, and no row replaced it.
          const touchedReviewed = (id) => updates.some((w) => w.filters.some(([c, v]) => c === 'id' && v === id)
            && ('normalized_value' in w.payload || 'accepted_normalized_value' in w.payload
              || 'accepted_value' in w.payload || 'review_status' in w.payload));
          const replacement = (name) => fieldRows(r.world).some((w) => w.op === 'insert'
            && w.payload.field_name === name && w.payload.review_status === 'pending_review');
          const acceptedErased = touchedReviewed('ef-accepted') || replacement('annual_revenue');
          const correctedErased = touchedReviewed('ef-corrected') || replacement('net_profit');
          const rejectedResurrected = touchedReviewed('ef-rejected') || replacement('cogs');
          caught = acceptedErased || correctedErased || rejectedResurrected;
          why = `accepted=${acceptedErased} corrected=${correctedErased} rejectedResurrected=${rejectedResurrected} statuses=${JSON.stringify(reviewedStatuses)}`;
        } else if (mut.id === 'M10') {
          const r = await runExtract({ engine: loaded.engine });
          caught = r.world.writesTo('business_facts').length > 0;
          why = `business_facts writes=${r.world.writesTo('business_facts').length}`;
        } else if (mut.id === 'M11') {
          const r = await runExtract({ engine: loaded.engine, ctx: { ...CTX, storage_bucket: 'attacker-bucket' } });
          caught = r.world.storageCalls.some((c) => c.bucket === 'attacker-bucket');
          why = `buckets=${JSON.stringify(r.world.storageCalls.map((c) => c.bucket))}`;
        }
      }
    } catch (e) {
      caught = true;
      why = `threw: ${e.message}`;
    }
    check(mut.id, `${mut.name} → ${caught ? 'CAUGHT' : 'NOT CAUGHT'}`, caught, why);
  }

  console.log('\n── STATIC INVARIANTS ──');
  {
    const engine = read(ENGINE);
    const code = engine.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    check('S1', 'no fabricated confidence constant remains in the extraction path', !/'85'|"85"/.test(code) && !/85 \* /.test(code));
    check('S2', 'no blanket delete of extracted_fields remains', !/from\('extracted_fields'\)\s*\.delete\(\)/.test(code));
    check('S3', 'the engine never hardcodes a storage bucket', !/storage\s*\.from\('documents'\)/.test(code) && /isApprovedDocumentBucket\(docRow/.test(code));
    {
      const signIdx = code.indexOf('createSignedUrl');
      const loadIdx = code.indexOf("from('extracted_fields')");
      const writeIdx = code.indexOf("from('extracted_fields').insert");
      check('S4', 'source availability is decided before any extraction state changes',
        signIdx > 0 && loadIdx > signIdx && writeIdx > signIdx,
        `sign@${signIdx} load@${loadIdx} write@${writeIdx}`);
    }
    // 6D.0c retarget: the third clause now names the retry's OWN call shape — the
    // recursive `runExtractionCore(sb, ctx, { attempt: attempt + 1, … })` — instead of
    // the bare `runExtraction(sb, ctx,` prefix, which after the rename would also match
    // the public wrapper's single delegation and could pass even if the retry lost its
    // context. This is STRICTER than before, never weaker.
    check('S5', 'the retry carries base44, the mock flag and the same context', /base44: options\?\.base44/.test(code) && /useMock: options\?\.useMock/.test(code) && /runExtractionCore\(sb, ctx, \{\s*attempt: attempt \+ 1,/.test(code));
    check('S6', 'review-safety constants are imported, not restated', /REVIEWED_REVIEW_STATUSES/.test(code) && !/const REVIEWED_REVIEW_STATUSES/.test(code));
    check('S7', 'one period implementation exists (the engine does not re-declare it)',
      !/function parseReportingPeriod/.test(code) && !/function resolveReportingPeriod/.test(code) && /resolveReportingPeriod\(/.test(code));
    check('S8', 'the extraction entry point no longer derives standing from the Base44 role', !/user\.role/.test(read(ENTRY).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')));
    check('S9', 'the source-missing response is the only place a missing object is turned into a state',
      /source_unavailable: true/.test(read(ROUTER)) && /sourceMissing/.test(read(HOOK)) && /SourceMissingPanel/.test(read(VIEWER)));
    check('S10', 'no metric/valuation/fact semantics were touched by this slice',
      !/dashboard_metrics|valuation|opportunity|business_iq/.test(code));
  }

  console.log('\n── CHANGE SURFACE ──');
  {
    const names = (s) => s.trim().split('\n').filter(Boolean);
    const slice = [...new Set([
      ...names(git(['diff', '--name-only', 'HEAD'])),
      ...names(git(['ls-files', '--others', '--exclude-standard'])),
    ])].sort();
    // TEST-CONTRACT MAINTENANCE (allowlist lines ONLY) — five older security
    // harnesses pin the repository change surface of THEIR slice. This slice landed
    // later, so those allowlists were extended to name the reviewed 6D.0 files. No
    // behavioral, security, mutation or authorization assertion in any of them was
    // removed or weakened: their PASS totals rose or held (55→56, 101→103, 120→125,
    // 76→78, 50→52), zero mutation/case/expectation lines were deleted, and every
    // removed line was replaced by an equivalent, explicit successor. They are named
    // here so THIS harness still fails on ANY unexplained file.
    const APPROVED_ALLOWLIST_MAINTENANCE = [
      'scripts/adminCanonicalActor.test.cjs',
      'scripts/adminDocumentViewer.test.cjs',
      'scripts/documentSignedUrlAuthorization.test.cjs',
      'scripts/galileoContextActorBinding.test.cjs',
      'scripts/relationshipRevocationAccess.test.cjs',
    ];
    const EXPECTED = [
      ENGINE, PERIOD, CONFIDENCE, STATE, ENTRY, ROUTER, HOOK, VIEWER, TEST,
      'VISION_PHASE_6D_0_EXTRACTION_INTEGRITY_REPORT.md',
      // 6D.0 CLASSIFICATION HOTFIX surface (landed after the 6D.0 publish): the
      // uploader, the shared type vocabulary it now shares with this engine, the
      // Data Room presentation of the two separate facts, and that hotfix's own
      // harness + report. Named here so this harness still fails on any OTHER
      // unexplained file.
      'base44/shared/documents/documentTypes.ts',
      'base44/functions/uploadDocumentToSupabase/entry.ts',
      'src/lib/documents/documentTypes.js',
      'src/pages/DocumentUpload.jsx',
      'src/pages/DataRoom.jsx',
      'src/components/documents/uploadConfig.jsx',
      'scripts/documentUploadClassification.test.cjs',
      // 6D.0c.1-P PRODUCTION REPAIR — a LATER, APPROVED slice, declared by name.
      'base44/shared/galileo/provisionalEvidence.ts',
      'base44/shared/canonicalFact/registry.ts',
      'base44/functions/askGalileo/entry.ts',
      'src/scripts/documentKnowledgeCompletion.test.cjs',
      'VISION_PHASE_6D_0C_1_PROVISIONAL_EVIDENCE_RETRIEVAL.md', ...require('./slice6D0C2Files.cjs'),
      'VISION_DOCUMENT_UPLOAD_CLASSIFICATION_HOTFIX.md',
      // 6D.0a SEMANTIC OBSERVATION BRIDGE — a LATER, APPROVED slice: ONE new shared
      // module, the shared contract that now reads it, buildGalileoContext's CONSUMER
      // wiring (the extraction path itself is untouched), its own harness and its
      // report. Allowlist lines ONLY — T1–T22, the extraction/mutation checks and the
      // Digital-Twin freeze assertions above are unchanged.
      'base44/shared/documentObservation/semantics.ts',
      'base44/shared/intelligenceContract/businessIntelligenceContract.ts',
      'base44/functions/buildGalileoContext/entry.ts',
      'scripts/semanticObservationBridge.test.cjs',
      'src/VISION_PHASE_6D_0A_SEMANTIC_OBSERVATION_BRIDGE.md',
      // 6D.0b AUTOMATIC DOCUMENT UNDERSTANDING — a LATER, APPROVED slice: the ONE
      // server-side understanding module set, the canonical upload entry point that
      // now runs it, its own harness and its report. The extraction path itself is
      // untouched (runExtraction is called exactly as before, only conditionally).
      // Allowlist lines ONLY — T1–T22, the extraction/mutation checks and the
      // Digital-Twin freeze assertions above are unchanged.
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
      // asks about an exact document. ALLOWLIST LINES ONLY — T1–T22, the
      // extraction/mutation checks and the Digital-Twin freeze assertions above are
      // unchanged.
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
      // 6D.0b.2.1 CANONICAL SOURCE READ REPAIR — a LATER, APPROVED slice: the ONE
      // shared project-URL normalizer BOTH ingestion paths build their Supabase client
      // from (the worker's raw-value bug is what stranded a real 1040), this slice's
      // own harness, and its report. ALLOWLIST LINES ONLY — every T-series, extraction,
      // review-safety, source-state and Digital-Twin freeze assertion above is untouched.
      'base44/shared/supabase/projectUrl.ts',
      'src/scripts/documentCanonicalSourceRead.test.cjs',
      'VISION_PHASE_6D_0B_2_1_CANONICAL_SOURCE_READ_REPAIR.md',
      // 6D.0c DOCUMENT KNOWLEDGE COMPLETION — a LATER, APPROVED slice: the durable
      // confirmation/resume module, the confirmation handler that now resumes
      // ingestion server-side, this slice's own harness and its report. ALLOWLIST
      // LINES ONLY — every T-series, extraction, retry, review-safety, source-state
      // and Digital-Twin freeze assertion above is untouched.
      'base44/shared/documentIngestion/resume.ts',
      'base44/functions/supabaseUserData/entry.ts',
      'src/scripts/documentKnowledgeCompletion.test.cjs',
      'VISION_PHASE_6D_0C_DOCUMENT_KNOWLEDGE_COMPLETION.md',
      // 6D.0c.1 PROVISIONAL EVIDENCE RETRIEVAL — a LATER, APPROVED slice: ONE new
      // shared module (the provisional lane) and its report. Allowlist lines ONLY —
      // T1–T22, the extraction/mutation checks and the Digital-Twin freeze
      // assertions above are unchanged; nothing on the extraction path moved.
      'base44/shared/galileo/provisionalEvidence.ts',
      'VISION_PHASE_6D_0C_1_PROVISIONAL_EVIDENCE_RETRIEVAL.md', ...require('./slice6D0C2Files.cjs'),
      // 6D.0c GALILEO HALF — the focused-document contract surface: the ONE new
      // shared module that resolves a focused document SERVER-SIDE (row-derived
      // tenant, canonical document authorization, exact-document knowledge,
      // PII-minimized projection), its consumer wiring in askGalileo, and the
      // answer surface that now shows a SERVER-derived evidence state. The
      // extraction path itself is untouched. ALLOWLIST LINES ONLY.
      'base44/shared/galileo/focusedDocument.ts',
      'base44/functions/askGalileo/entry.ts',
      'src/hooks/useAskGalileo.js',
      'src/components/galileo/home/GalileoAnswerPanel.jsx',
      ...APPROVED_ALLOWLIST_MAINTENANCE,
    ].sort();
    const unexpected = slice.filter((f) => !EXPECTED.includes(f));
    check('F1', 'the slice touches only the extraction path, the source/viewer state, its harness, its report and the reviewed allowlist maintenance',
      unexpected.length === 0, unexpected.join(', ') || 'none');
    console.log(`     surface: ${slice.length ? slice.join(', ') : '(clean — everything already committed)'}`);
  }

  console.log('\n' + '─'.repeat(74));
  if (failures.length) {
    console.log(`RESULT: FAIL — ${failures.length} assertion(s) failed`);
    failures.forEach((f) => console.log(`   · ${f}`));
    process.exit(1);
  }
  console.log('RESULT: PASS — extraction is truthful, deterministic, review-safe, source-aware');
  console.log('and recoverable, and no Digital Twin row is written.');
  console.log('No network, database or production record was touched by this script.');
})().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});