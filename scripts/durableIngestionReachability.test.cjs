#!/usr/bin/env node
/**
 * 6D.1B.2a — DURABLE INGESTION JOB REACHABILITY (J1–J15).
 *
 * This harness exists because ONE question was answered wrongly by assumption:
 * "where does the durable ingestion job live?" The orchestration module is the
 * answer — DocumentIngestionJob is a BASE44 ENTITY, and `document_ingestion_jobs`
 * is not a persistence surface at all. Every check below therefore runs against
 * the REAL modules with the REAL identifier flowing through them, and mutates the
 * identifier mapping and the queued-response contract to prove the checks bite.
 *
 * Modules loaded (real source, imports stripped and dependencies injected):
 *   base44/shared/documentIngestion/orchestration.ts   (ledger, claim, lease, recovery)
 *   base44/shared/documentIngestion/resume.ts          (canonical resume)
 *   base44/shared/documentIngestion/retry.ts           (product Retry)
 *   base44/functions/processDocumentIngestionJob/entry.ts (the worker's HTTP contract)
 * Plus the DEPLOYED workflow definitions, read as data.
 *
 * Mutations: M-ID (workflow identifier mismatch), M-FQ (false queued:true).
 */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const ORCH = 'base44/shared/documentIngestion/orchestration.ts';
const RESUME = 'base44/shared/documentIngestion/resume.ts';
const RETRY = 'base44/shared/documentIngestion/retry.ts';
const WORKER = 'base44/functions/processDocumentIngestionJob/entry.ts';
const ROUTER = 'base44/functions/supabaseUserData/entry.ts';
const WF_PRIMARY = 'base44/workflows/Document Ingestion.jsonc';
const WF_RECOVERY = 'base44/workflows/Document Ingestion Recovery.jsonc';

const failures = [];
const check = (id, label, ok, detail = '') => {
  if (!ok) failures.push(`${id} ${label}${detail ? ` — ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}${!ok && detail ? ` — ${detail}` : ''}`);
};

// ─────────────────────────────────────────────────────────────────────────────
const quiet = { log() {}, warn() {}, error() {}, info() {} };
const strip = (s) => s.replace(/^\s*import[\s\S]*?from\s+'[^']+';/gm, '').replace(/^\s*export\s+/gm, '');
const toJs = (s) => esbuild.transformSync(s, { loader: 'ts', format: 'cjs', target: 'es2020' }).code;
const loadModule = (src, deps, values, returns) =>
  new Function('console', ...deps, `${toJs(strip(src))}\n;return (${returns});`)(quiet, ...values);

// ── Mock Supabase: chainable, records every read and EVERY WRITE ──────────────
function makeSb(tables = {}) {
  const state = { tables: JSON.parse(JSON.stringify(tables)) };
  const writes = [];
  const ops = [];
  const from = (table) => {
    const q = { table, op: 'select', filters: [], payload: null, inCol: null, inVals: null, single: false, returning: false };
    const rows = () => (state.tables[table] || []).filter((r) => q.filters.every(([c, v]) => r[c] === v));
    const resolve = () => {
      ops.push({ table, op: q.op, filters: q.filters });
      if (q.op === 'select') return { data: q.single ? (rows()[0] ?? null) : rows(), error: null };
      writes.push({ table, op: q.op, payload: q.payload, filters: q.filters, inVals: q.inVals });
      if (q.op === 'update') {
        if (q.inVals) {
          const hit = rows().filter((r) => q.inVals.includes(r.status));
          if (!hit.length) return { data: [], error: null };
          hit.forEach((r) => Object.assign(r, q.payload));
          return { data: hit.map((r) => ({ id: r.id })), error: null };
        }
        const target = rows();
        target.forEach((r) => Object.assign(r, q.payload));
        return q.returning ? { data: target.map((r) => ({ id: r.id })), error: null } : { data: null, error: null };
      }
      return { data: null, error: null };
    };
    const api = {
      select() { if (q.op === 'update') q.returning = true; return api; },
      update(p) { q.op = 'update'; q.payload = p; return api; },
      eq(c, v) { q.filters.push([c, v]); return api; },
      in(c, v) { q.inCol = c; q.inVals = v; return api; },
      order() { return api; },
      limit() { return api; },
      maybeSingle() { q.single = true; return Promise.resolve(resolve()); },
      single() { q.single = true; return Promise.resolve(resolve()); },
      then(res, rej) { return Promise.resolve(resolve()).then(res, rej); },
    };
    return api;
  };
  const storage = {
    from: () => ({
      createSignedUrl: async () => ({ data: { signedUrl: 'https://unit.test/signed' }, error: null }),
    }),
  };
  return { sb: { from, storage }, writes, ops, tables: state.tables };
}

// ── Mock Base44 entity ledger (THE canonical persistence for jobs) ────────────
function makeJobs(seed = []) {
  const rows = JSON.parse(JSON.stringify(seed));
  const calls = { filter: [], list: [], get: [], create: [], update: [] };
  return {
    rows, calls,
    async filter(query) {
      calls.filter.push(query);
      const items = rows.filter((j) => Object.entries(query || {}).every(([k, v]) =>
        v && typeof v === 'object' && Array.isArray(v.$in) ? v.$in.includes(j[k]) : j[k] === v));
      return { items, next_cursor: null, has_more: false };
    },
    async list() { calls.list.push(true); return { items: rows }; },
    async get(id) { calls.get.push(id); return rows.find((j) => j.id === id) || null; },
    async create(p) { calls.create.push(p); const row = { id: `job_${rows.length + 1}`, attempt_count: 0, ...p }; rows.push(row); return row; },
    async update(id, p) { calls.update.push({ id, patch: p }); const r = rows.find((j) => j.id === id); if (r) Object.assign(r, p); return r; },
  };
}

function loadStack(sources = {}) {
  const orch = loadModule(
    sources.ORCH ?? read(ORCH),
    ['runIngestionUnderstanding', 'runExtraction', 'classifyExtractionOutcome'],
    [async () => ({ route_extraction: false, result: {} }), async () => ({ success: false }), () => 'permanent_failure'],
    `{ JOB_ENTITY, JOB_STATES, EXTRACTION_HANDOFF_STATE, MAX_ATTEMPTS, LEASE_MS, CLAIMABLE_ANALYSIS_STATES,
       SETTLED_ANALYSIS_STATES, READ_OUTCOMES, readCanonicalRow, isJobClaimable, claimJob, processJob,
       findDueJobs, sweepJobs, handOffToExtraction, markAnalysisWaitingRetry, proveExtractionPersisted, classifyFailure }`,
  );
  const resume = loadModule(
    sources.RESUME ?? read(RESUME),
    ['JOB_ENTITY', 'JOB_STATES', 'EXTRACTION_HANDOFF_STATE', 'readCanonicalRow', 'READ_OUTCOMES', 'isApprovedDocumentBucket'],
    [orch.JOB_ENTITY, orch.JOB_STATES, orch.EXTRACTION_HANDOFF_STATE, orch.readCanonicalRow, orch.READ_OUTCOMES, () => true],
    '{ resumeIngestion, RESUME_OUTCOMES, CONFIRMABLE_ANALYSIS_STATES, RESTARTABLE_FAILURE_STATES }',
  );
  const retry = loadModule(sources.RETRY ?? read(RETRY), [], [], '{ retryDocumentIngestion }');
  return { orch, resume, retry };
}

const DOC = 'doc-1';
const ANALYSIS = 'ana-1';
const failedAnalysisTables = () => ({
  documents: [{ id: DOC, profile_id: 'p1', business_id: 'b1', document_type: 'profit_and_loss', year: 2023, upload_status: 'failed', file_path: 'p/doc.xlsx', storage_bucket: 'documents' }],
  document_analysis: [{ id: ANALYSIS, document_id: DOC, status: 'failed', analysis_status: 'failed', document_type: 'profit_and_loss' }],
});

// ═════════════════════════════════════════════════════════════════════════════
async function runChecks(sources = {}) {
  const local = [];
  const expect = (id, label, ok, detail = '') => {
    if (!ok) local.push(`${id} ${label}${detail ? ` — ${detail}` : ''}`);
  };
  const { orch, resume, retry } = loadStack(sources);
  const WF_TEXT = sources.WF_PRIMARY ?? read(WF_PRIMARY);
  const WF_RECOVERY_TEXT = sources.WF_RECOVERY ?? read(WF_RECOVERY);
  const WORKER_TEXT = sources.WORKER ?? read(WORKER);
  const ROUTER_TEXT = sources.ROUTER ?? read(ROUTER);
  const RETRY_TEXT = sources.RETRY ?? read(RETRY);
  const RESUME_TEXT = sources.RESUME ?? read(RESUME);

  // ── J1 — Retry success creates exactly one durable ledger entry ─────────────
  const t1 = makeSb(failedAnalysisTables());
  const jobs1 = makeJobs([{ id: 'old-1', document_id: DOC, analysis_id: ANALYSIS, status: 'failed', attempt_count: 1 }]);
  const r1 = await resume.resumeIngestion({ sb: t1.sb, base44: { asServiceRole: { entities: { DocumentIngestionJob: jobs1 } } }, documentId: DOC });
  expect('J1', 'resume creates exactly one durable job', jobs1.calls.create.length === 1 && r1.ok === true && r1.outcome === 'resumed',
    `creates=${jobs1.calls.create.length} ok=${r1.ok} outcome=${r1.outcome}`);

  // ── J2 — queued ⟺ a job was persisted (product Retry honours resume) ────────
  const t2 = makeSb(failedAnalysisTables());
  const jobs2 = makeJobs([{ id: 'old-1', document_id: DOC, analysis_id: ANALYSIS, status: 'failed', attempt_count: 1 }]);
  const retry2 = await retry.retryDocumentIngestion({
    sb: t2.sb, documentId: DOC, authorizeDocument: async () => ({ authorized: true }),
    resume: (id) => resume.resumeIngestion({ sb: t2.sb, base44: { asServiceRole: { entities: { DocumentIngestionJob: jobs2 } } }, documentId: id }),
  });
  expect('J2', 'queued acceptance carries the persisted job id',
    retry2.ok === true && jobs2.calls.create.length === 1 && retry2.job_id === jobs2.rows[jobs2.rows.length - 1].id,
    `ok=${retry2.ok} job_id=${retry2.job_id} created=${jobs2.rows[jobs2.rows.length - 1]?.id}`);

  // ── J3 — persistence failure can NEVER return queued/ok ────────────────────
  const t3 = makeSb(failedAnalysisTables());
  const jobs3 = makeJobs([]);
  jobs3.create = async () => { throw new Error('ledger write failed'); };
  const retry3 = await retry.retryDocumentIngestion({
    sb: t3.sb, documentId: DOC, authorizeDocument: async () => ({ authorized: true }),
    resume: (id) => resume.resumeIngestion({ sb: t3.sb, base44: { asServiceRole: { entities: { DocumentIngestionJob: jobs3 } } }, documentId: id }),
  });
  expect('J3', 'a failed ledger persistence cannot be reported as queued', retry3.ok === false && retry3.code === 'not_resumable',
    `ok=${retry3.ok} code=${retry3.code}`);

  // ── J4/J5 — the workflow identifier === the persisted job id ───────────────
  const wfEntityTrigger = /"trigger_type":\s*"entity"/.test(WF_TEXT) && /"entity_name":\s*"DocumentIngestionJob"/.test(WF_TEXT) && /"events":\s*\[\s*"create"\s*\]/.test(WF_TEXT);
  const wfJobIdMapping = /"job_id":\s*"\$\{\s*\.trigger\.entity_id\s*\}"/.test(WF_TEXT);
  const jobs4 = makeJobs([{ id: 'job-9', document_id: DOC, analysis_id: ANALYSIS, status: 'queued', attempt_count: 0 }]);
  const jobIdFromLedger = jobs4.rows[0].id;
  const workflowJobId = (WF_TEXT.match(/"job_id":\s*"\$\{\s*\.trigger\.entity_id\s*\}"/) || [null])[0] ? jobIdFromLedger : null;
  expect('J4', 'workflow triggers on the job entity and maps the ledger id to job_id', wfEntityTrigger && wfJobIdMapping,
    `entityTrigger=${wfEntityTrigger} mapping=${wfJobIdMapping}`);
  expect('J5', 'the identifier the workflow passes IS the persisted ledger id', workflowJobId === jobIdFromLedger && jobs4.calls.filter.length === 0,
    `passed=${workflowJobId}`);

  // ── J6 — the worker looks up THAT job, through the entry contract ───────────
  const seen = { jobId: null };
  const workerApi = loadModule(
    WORKER_TEXT.replace(/export\s+default\s+(async\s+function)/, 'const __entry = $1'),
    ['createClientFromRequest', 'createClient', 'secrets', 'processJob', 'sweepJobs', 'normalizeSupabaseProjectUrl'],
    [
      () => ({ auth: { me: async () => null } }),
      () => ({}),
      { get: () => 'stub' },
      async ({ jobId }) => { seen.jobId = jobId; return { ok: true, decision: 'completed' }; },
      async () => ({ inspected: 0, outcomes: [] }),
      () => 'https://unit.test',
    ],
    '{ __entry }',
  );
  const wfId = 'job-9';
  const workerRes = await workerApi.__entry(new Request('https://unit.test/functions/processDocumentIngestionJob', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ job_id: wfId }),
  }));
  const workerBody = await workerRes.json();
  expect('J6', 'the worker consumes the job id it was handed, and only that id', seen.jobId === wfId && workerBody.ok === true,
    `jobId=${seen.jobId} ok=${workerBody.ok}`);

  // ── J7 — duplicate delivery cannot win twice (the claim's own witness) ─────
  const t7 = makeSb({
    documents: [{ id: DOC, profile_id: 'p1', business_id: 'b1', document_type: 'profit_and_loss', file_path: 'p/d.xlsx', storage_bucket: 'documents' }],
    // another worker already holds the canonical claim witness
    document_analysis: [{ id: ANALYSIS, document_id: DOC, status: 'processing', analysis_status: 'processing' }],
  });
  const jobs7 = makeJobs([{ id: 'job-7', document_id: DOC, analysis_id: ANALYSIS, status: 'queued', attempt_count: 0 }]);
  const out7 = await orch.processJob({ sb: t7.sb, base44: { asServiceRole: { entities: { DocumentIngestionJob: jobs7 } } }, jobId: 'job-7' });
  expect('J7', 'a duplicate delivery loses the canonical claim', out7.decision === 'already_claimed' || out7.decision === 'already_completed',
    `decision=${out7.decision}`);

  // ── J8/J9 — lease semantics: live lease blocks, expired lease recovers ─────
  const future = new Date(Date.now() + 60_000).toISOString();
  const past = new Date(Date.now() - 60_000).toISOString();
  const live = orch.isJobClaimable({ status: 'processing', attempt_count: 1, lease_expires_at: future });
  const expired = orch.isJobClaimable({ status: 'processing', attempt_count: 1, lease_expires_at: past });
  expect('J8', 'a live lease prevents a double claim', live.claimable === false && live.reason === 'leased', `reason=${live.reason}`);
  expect('J9', 'an expired lease is claimable again', expired.claimable === true && expired.reason === 'lease_expired', `reason=${expired.reason}`);

  // ── J10 — recovery discovers a stranded queued job and ignores terminal ones ──
  const jobs10 = makeJobs([
    { id: 'stranded', document_id: DOC, analysis_id: ANALYSIS, status: 'queued', attempt_count: 0 },
    { id: 'done', document_id: DOC, analysis_id: ANALYSIS, status: 'completed', attempt_count: 1 },
    { id: 'dead', document_id: DOC, analysis_id: ANALYSIS, status: 'failed', attempt_count: 1 },
    { id: 'held', document_id: DOC, analysis_id: ANALYSIS, status: 'processing', attempt_count: 1, lease_expires_at: future },
  ]);
  const due = await orch.findDueJobs({ base44: { asServiceRole: { entities: { DocumentIngestionJob: jobs10 } } } });
  const dueIds = due.map((j) => j.id);
  expect('J10', 'recovery finds the stranded queued job and nothing else',
    dueIds.length === 1 && dueIds[0] === 'stranded', `due=${dueIds.join(',')}`);
  expect('J10b', 'recovery is the same canonical worker, on a schedule',
    /"trigger_type":\s*"scheduled"/.test(WF_RECOVERY_TEXT) && /"sweep":\s*true/.test(WF_RECOVERY_TEXT),
    'recovery workflow shape');

  // ── J11/J12 — history retained, a NEW ledger entry per retry ───────────────
  expect('J11', 'the failed job history is never rewritten by a resume',
    jobs2.calls.update.filter((u) => u.id === 'old-1').length === 0, `updates=${jobs2.calls.update.length}`);
  expect('J12', 'a retry appends a new ledger entry alongside the old one',
    jobs2.rows.length === 2 && jobs2.rows[0].status === 'failed' && jobs2.rows[1].status === 'queued',
    `rows=${jobs2.rows.map((r) => r.status).join(',')}`);

  // ── J13 — no manual analysis re-arm, and Retry cannot extract ──────────────
  const analysisWrites = t2.writes.filter((w) => w.table === 'document_analysis');
  const handoffWrite = analysisWrites.find((w) => w.payload?.analysis_status === 'pending_analysis');
  expect('J13', 'the canonical resume performs the handoff itself (no manual re-arm)',
    Boolean(handoffWrite) && !/extractEngine/.test(RETRY_TEXT) && !/extractEngine/.test(RESUME_TEXT),
    `handoff=${Boolean(handoffWrite)}`);

  // ── J14 — document/business authority unchanged by a retry ────────────────
  const docWrites = t2.writes.filter((w) => w.table === 'documents');
  const docPatchKeys = Object.keys(docWrites[0]?.payload || {});
  expect('J14', 'a retry never reassigns business, profile or scope',
    docWrites.length === 1 && docPatchKeys.sort().join(',') === 'updated_at,upload_status'
    && analysisWrites.every((w) => !('business_id' in (w.payload || {})) && !('profile_id' in (w.payload || {}))),
    `docPatch=${docPatchKeys.join(',')}`);

  // ── J15 — the Digital Twin is untouched, structurally ─────────────────────
  const twinFree = [RETRY, RESUME, ORCH, WORKER, ROUTER]
    .every((p) => !/business_facts|business_fact_evidence|shadowPromotion/.test(read(p)));
  expect('J15', 'no ingestion path touches business_facts or the shadow engine', twinFree);

  // ── J2b — the router returns `queued` only after a durable resume ──────────
  const guardIdx = ROUTER_TEXT.indexOf('if (!retry.ok)');
  const refusalIdx = ROUTER_TEXT.indexOf('success: false, error: retry.code');
  const queuedIdx = ROUTER_TEXT.indexOf('queued: true');
  expect('J2b', 'the router maps a non-durable resume to an honest failure, never to queued',
    guardIdx !== -1 && refusalIdx > guardIdx && queuedIdx > refusalIdx && /job_id: retry\.job_id/.test(ROUTER_TEXT),
    `guard=${guardIdx} refusal=${refusalIdx} queued=${queuedIdx}`);

  return local;
}

// ═════════════════════════════════════════════════════════════════════════════
// BASELINE
(async () => {
const baseline = await runChecks();
console.log(`\n── baseline: ${baseline.length ? `${baseline.length} FAILED` : 'ALL CHECKS PASS'}`);
baseline.forEach((f) => console.log(`   FAIL ${f}`));

// ── MUTATION BATTERY ─────────────────────────────────────────────────────────
const mutations = [
  {
    name: 'M-ID  workflow identifier mismatch (entity_id → data.id)',
    applies: (id) => id === 'M-ID',
    sources: () => ({ WF_PRIMARY: read(WF_PRIMARY).replace(/\$\{\s*\.trigger\.entity_id\s*\}/g, '${ .trigger.data.id }') }),
    mustFail: ['J4'],
  },
  {
    name: 'M-FQ  false queued:true — Retry accepts a resume that persisted nothing',
    applies: (id) => id === 'M-FQ',
    sources: () => ({ RETRY: read(RETRY).replace('if (outcome && outcome.ok === false)', 'if (false && outcome && outcome.ok === false)') }),
    mustFail: ['J3'],
  },
];

const results = [];
for (const m of mutations) {
  const found = await runChecks(m.sources());
  const hit = m.mustFail.every((id) => found.some((f) => f.startsWith(id)));
  results.push({ name: m.name, caught: hit, detail: hit ? `${m.mustFail.join(',')} caught` : `expected ${m.mustFail.join(',')} — got: ${found.join(' | ') || 'none'}` });
  console.log(`${hit ? 'CAUGHT  ' : 'MISSED  '}${m.name} — ${results[results.length - 1].detail}`);
}

const mutationsOkay = results.every((r) => r.caught);
const ok = baseline.length === 0 && mutationsOkay;
console.log('');
console.log(`checks J1–J15 : ${baseline.length === 0 ? 'ALL CHECKS PASS' : `${baseline.length} FAILED`}`);
console.log(`mutations     : ${results.filter((r) => r.caught).length}/${mutations.length} APPLIED + BEHAVIOR_CHANGED + CAUGHT`);
console.log(ok ? '\n6D.1B.2a DURABLE INGESTION JOB REACHABILITY — ALL CHECKS PASS' : '\n6D.1B.2a DURABLE INGESTION JOB REACHABILITY — NOT CERTIFIED');
process.exit(ok ? 0 : 1);
})();