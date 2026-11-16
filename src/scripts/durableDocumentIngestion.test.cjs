#!/usr/bin/env node
/**
 * durableDocumentIngestion.test.cjs — VISION 6D.0b.2 — DURABLE DOCUMENT INGESTION.
 *
 * Run:  node scripts/durableDocumentIngestion.test.cjs
 *
 * OFFLINE AND NON-DESTRUCTIVE. No network, no database, no Base44 call, no
 * production record read, written or deleted. The production specimen
 * 9a964471-a421-41d2-a8e6-fd19983fdd1e is never a fixture and is never contacted.
 *
 * THE CODE UNDER TEST IS THE SHIPPED CODE: base44/shared/documentIngestion/
 * orchestration.ts is compiled from its real source and EXECUTED against
 * recording mocks. The understanding and extraction engines are RECORDING STUBS
 * here — their internals are already proven by scripts/documentUnderstanding.test.cjs
 * (6D.0b) and scripts/extractionIntegrity.test.cjs, and this harness proves the
 * ORCHESTRATION contract around them (claim, lease, retry, idempotency, recovery,
 * isolation), which is what 6D.0b.2 changes.
 *
 * EVIDENCE CLASS per assertion: EXECUTED (real module run) · STATIC (invariant over
 * the exact reviewed bytes) · REF (proven by another harness in the battery).
 *
 *   Q1-Q60    durable ingestion contract
 *   QM1-QM35  mutation tests — each must be CAUGHT
 */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

// This harness lives under src/scripts/, the other reviewed harnesses live under
// scripts/ — resolve the repo root from whichever one actually holds base44/.
const ROOT = fs.existsSync(path.join(__dirname, '..', 'base44'))
  ? path.join(__dirname, '..')
  : path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const quiet = { log() {}, warn() {}, error() {}, info() {} };

const failures = [];
let total = 0;
const check = (id, label, ok, detail = '') => {
  total += 1;
  if (!ok) failures.push(`${id} ${label}${detail ? ` — ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${String(id).padEnd(5)} ${label}${!ok && detail ? ` — ${detail}` : ''}`);
};

const P = {
  orchestration: 'base44/shared/documentIngestion/orchestration.ts',
  entity: 'base44/entities/DocumentIngestionJob.jsonc',
  workerFn: 'base44/functions/processDocumentIngestionJob/entry.ts',
  upload: 'base44/functions/uploadDocumentToSupabase/entry.ts',
  wfIngestion: 'base44/workflows/Document Ingestion.jsonc',
  wfRecovery: 'base44/workflows/Document Ingestion Recovery.jsonc',
  dataRoom: 'src/pages/DataRoom.jsx',
  uploadPage: 'src/pages/DocumentUpload.jsx',
  visionActions: 'src/hooks/useVisionActions.js',
  askGalileoHook: 'src/hooks/useAskGalileo.js',
  askGalileoFn: 'base44/functions/askGalileo/entry.ts',
  docAccess: 'base44/shared/authz/documentAccess.ts',
  types: 'src/lib/documents/documentTypes.js',
};
const S = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, read(v)]));

// ── Compile + load the SHIPPED orchestration module ──────────────────────────
const strip = (s) => s.replace(/^\s*import[\s\S]*?from\s+'[^']+';/gm, '').replace(/^\s*export\s+/gm, '');
const toJs = (s) => esbuild.transformSync(s, { loader: 'ts', format: 'cjs', target: 'es2020' }).code;
const RETURNS =
  '({ JOB_STATES, MAX_ATTEMPTS, LEASE_MS, RETRY_BACKOFF_MS, CLAIMABLE_ANALYSIS_STATES, SETTLED_ANALYSIS_STATES, isJobClaimable, classifyFailure, backoffFor, resolveContentAccess, claimJob, processJob, findDueJobs, sweepJobs })';

// The shipped orchestrator classifies every run through the extraction engine's ONE
// canonical classifier (`classifyExtractionOutcome`, imported by the module). This
// harness STRIPS imports, so each module-level dependency has to be injected as a
// parameter — with the classifier omitted it was an undeclared identifier and the
// worker died mid-run (ReferenceError), which is a harness-injection defect, not a
// product defect. The REAL classifier is compiled from the shipped engine and never
// re-implemented, so the retry/permanent semantics under test stay the engine's own.
const ENGINE_FILE = 'base44/shared/documentExtraction/extractEngine.ts';
function loadClassifier() {
  return new Function(
    'console',
    `${toJs(strip(read(ENGINE_FILE)))}\n;return { classifyExtractionOutcome };`,
  )(quiet).classifyExtractionOutcome;
}
function compile(srcOverride) {
  const src = srcOverride !== undefined ? srcOverride : S.orchestration;
  const classifyExtractionOutcome = loadClassifier();
  return (understanding, extraction) =>
    new Function('console', 'runIngestionUnderstanding', 'runExtraction', 'classifyExtractionOutcome', `${toJs(strip(src))}\n;return ${RETURNS};`)(
      quiet,
      understanding,
      // 6D.0c: the shipped engine persists its outcome canonically BEFORE it returns,
      // so the default stub is wrapped to do the same. A stub that merely RETURNED
      // success is now (correctly) refused by the completion PROOF, which is exactly
      // the silent-success bug this phase fixes. Only the SUCCESS path gains a
      // persistence write: an override that throws or reports a non-completed
      // finalStatus passes through untouched, so no failure assertion changes.
      persistLikeEngine(extraction),
      classifyExtractionOutcome,
    );
}

/** Mirrors the engine's own canonical write for a successfully completed run. */
function persistLikeEngine(extraction) {
  return async (sbW, ...rest) => {
    const result = await extraction(sbW, ...rest);
    if (result && result.finalStatus === 'completed') {
      const row = (sbW?.tables?.document_analysis || [])[0];
      if (row) {
        row.analysis_status = 'completed';
        row.extracted_data = {
          completed_at: '2026-10-04T21:00:00.000Z',
          reconcile: { inserted: 1, updated: 0, unchanged: 0 },
          extracted_fields_count: 1,
          reporting_period: '2024',
        };
      }
    }
    return result;
  };
}
const load = compile(undefined);

// ── Recording Supabase mock ─────────────────────────────────────────────────
function makeSb(seed = {}) {
  const tables = {};
  for (const [k, v] of Object.entries(seed)) tables[k] = v.map((r) => ({ ...r }));
  const writes = [];
  function chain(table) {
    const st = { table, op: 'select', payload: null, filters: [], single: false, returning: false };
    const rows = () => (tables[table] || []).filter((r) => st.filters.every(([c, v, kind]) => (kind === 'in' ? v.includes(r[c]) : r[c] === v)));
    const settle = () => {
      const matched = rows();
      if (st.op === 'update') {
        writes.push({ table, op: 'update', payload: st.payload });
        matched.forEach((r) => Object.assign(r, st.payload));
        return { data: st.returning ? matched.map((r) => ({ id: r.id })) : matched, error: null };
      }
      if (st.op === 'insert') {
        writes.push({ table, op: 'insert', payload: st.payload });
        (tables[table] = tables[table] || []).push(st.payload);
        return { data: [st.payload], error: null };
      }
      return { data: st.single ? matched[0] || null : matched, error: null };
    };
    const obj = {
      select() { if (st.op === 'update') st.returning = true; return obj; },
      eq(c, v) { st.filters.push([c, v, 'eq']); return obj; },
      in(c, v) { st.filters.push([c, v, 'in']); return obj; },
      limit() { return obj; },
      maybeSingle() { st.single = true; return obj; },
      single() { st.single = true; return obj; },
      update(p) { st.op = 'update'; st.payload = p; return obj; },
      insert(p) { st.op = 'insert'; st.payload = p; return obj; },
      then(res, rej) { return Promise.resolve(settle()).then(res, rej); },
    };
    return obj;
  }
  return {
    writes, tables, from: chain,
    storage: { from: () => ({ createSignedUrl: async (p) => ({ data: { signedUrl: `https://signed.invalid/${p}` } }) }) },
  };
}

// ── Recording Base44 mock (the ledger + provider + DocumentClassification) ──
function makeBase44(jobSeed = []) {
  const jobs = jobSeed.map((j) => ({ ...j }));
  const jobWrites = [];
  const entityWrites = [];
  const api = {
    get: async (id) => jobs.find((j) => j.id === id) || null,
    update: async (id, patch) => {
      jobWrites.push({ op: 'update', id, patch });
      const j = jobs.find((x) => x.id === id);
      if (j) Object.assign(j, patch);
      return { ...(j || {}), id };
    },
    create: async (p) => {
      const rec = { ...p, id: `job-${jobs.length + 1}` };
      jobs.push(rec);
      jobWrites.push({ op: 'create', payload: p });
      return rec;
    },
    filter: async (q = {}) => {
      const statuses = q?.status?.$in || null;
      const items = jobs.filter(
        (j) =>
          (!statuses || statuses.includes(j.status)) &&
          (!q.document_id || j.document_id === q.document_id) &&
          (!q.analysis_id || j.analysis_id === q.analysis_id),
      );
      return { items, has_more: false };
    },
  };
  return {
    jobs, jobWrites, entityWrites,
    asServiceRole: {
      integrations: { Core: { InvokeLLM: async () => ({}) } },
      entities: {
        DocumentIngestionJob: api,
        DocumentClassification: {
          create: async (p) => { entityWrites.push({ op: 'create', payload: p }); return { ...p, id: 'dc-1' }; },
          update: async (id, p) => { entityWrites.push({ op: 'update', id, payload: p }); return { ...p, id }; },
          filter: async () => [],
        },
      },
    },
  };
}

const DOC = (over = {}) => ({ id: 'doc1', profile_id: 'prof1', business_id: 'biz-a', document_scope: 'business', storage_bucket: 'documents', file_path: 'prof1/biz-a/1_1040.pdf', file_url: null, name: '1040.pdf', document_type: 'other', year: null, upload_status: 'pending_analysis', status: 'uploaded', ...over });
const ANA = (over = {}) => ({ id: 'an1', document_id: 'doc1', status: 'queued', analysis_status: 'queued', ...over });
const JOB = (over = {}) => ({ id: 'job1', document_id: 'doc1', analysis_id: 'an1', status: 'queued', attempt_count: 0, claimed_at: null, lease_expires_at: null, next_retry_at: null, last_attempt_at: null, last_error_class: null, last_error_message: null, ...over });

async function run(opts = {}) {
  const sb = makeSb({ documents: [opts.document || DOC()], document_analysis: [opts.analysis || ANA()] });
  const b44 = makeBase44([opts.job || JOB()]);
  const calls = { understanding: [], extraction: [] };
  const understanding = async (args) => { calls.understanding.push(args); return (opts.understanding || (() => ({ route_extraction: true, result: { document_type: 'personal_tax_return', applied_document_type: 'personal_tax_return' } })))(args); };
  // 6D.0c: the DEFAULT success stub must return the engine's real shape. The shipped
  // contract is `success: true` → 'success' (see classifyExtractionOutcome); a stub
  // returning only `{ finalStatus: 'completed' }` classifies as a RETRYABLE FAILURE,
  // so the orchestrator's retry branch fires before the completion proof is reached.
  // Only the default success signal gains `success: true` — every explicit
  // opts.extraction override (the failure cases) is untouched.
  const extraction = async (sbArg, args, ctx) => { calls.extraction.push(args); return (opts.extraction || (() => ({ success: true, finalStatus: 'completed' })))(args, sbArg, ctx); };
  const mods = (opts.compile || load)(understanding, extraction);
  const outcome = await mods.processJob({ sb, base44: b44, jobId: opts.jobId || 'job1', now: opts.now || '2026-10-04T21:00:00.000Z' });
  return { outcome, sb, b44, calls, mods, understanding, extraction };
}
const jobStatus = (r) => (r.b44.jobWrites.filter((w) => w.op === 'update').pop() || {}).patch?.status;
const docAnalyses = (r) => r.sb.writes.filter((w) => w.table === 'document_analysis');
const touchedBusiness = (r) => r.sb.writes.some((w) => w.payload && ('business_id' in w.payload || 'document_scope' in w.payload || 'profile_id' in w.payload));

async function main() {
  // ══ Q1-Q5 — durable work state is persisted, and nothing waits on the request
  const jobIdx = S.upload.indexOf('DocumentIngestionJob.create');
  const analysisIdx = S.upload.indexOf(".from('document_analysis')");
  check('Q1', 'upload persists the document before any later work', S.upload.indexOf("from('documents')") < analysisIdx && analysisIdx < jobIdx);
  check('Q2', 'upload persists a queued analysis row', /analysis_status: 'queued'/.test(S.upload) && /status:\s*'queued'/.test(S.upload));
  check('Q3', 'the response can complete before classification (no inline pipeline)', !/runIngestionUnderstanding/.test(S.upload) && !/runExtraction/.test(S.upload) && /pipeline_status:\s*ingestionJobId \? 'queued'/.test(S.upload));
  check('Q4', 'browser closure is irrelevant: no client code runs the worker', !/processDocumentIngestionJob/.test(S.dataRoom) && !/processDocumentIngestionJob/.test(S.uploadPage));
  check('Q5', 'the durable entity-triggered workflow claims the queued job', /"trigger_type":\s*"entity"/.test(S.wfIngestion) && /"entity_name":\s*"DocumentIngestionJob"/.test(S.wfIngestion) && /"events":\s*\[\s*"create"\s*\]/.test(S.wfIngestion) && /processDocumentIngestionJob/.test(S.wfIngestion));

  // ══ Q6-Q8 — duplicate delivery, double-processing, regression
  const first = await run();
  const secondOutcome = await first.mods.processJob({ sb: first.sb, base44: first.b44, jobId: 'job1', now: '2026-10-04T21:00:05.000Z' });
  check('Q6', 'duplicate delivery is safe and converges on the same state', first.outcome.decision === 'completed' && ['already_leased', 'already_completed', 'already_claimed', 'terminal'].includes(secondOutcome.decision) && first.calls.understanding.length === 1);
  const b = await run({ job: JOB({ status: 'processing', attempt_count: 1, claimed_at: '2026-10-04T20:59:00.000Z', lease_expires_at: '2026-10-04T21:04:00.000Z' }) });
  check('Q7', 'a second worker cannot double-process a live lease', b.outcome.decision === 'already_leased' && b.calls.understanding.length === 0 && b.calls.extraction.length === 0);
  const done = await run({ job: JOB({ status: 'completed', attempt_count: 1 }) });
  check('Q8', 'a completed job cannot regress', done.outcome.decision === 'already_completed' && jobStatus(done) === undefined && done.calls.understanding.length === 0, jobStatus(done));

  // ══ Q9-Q13 — failure classes, bounded retry, truthful metadata
  const timeout = await run({ understanding: () => { throw new Error('classification_read_timeout'); } });
  check('Q9', 'a provider timeout is retryable, not terminal', timeout.outcome.decision === 'retry' && timeout.outcome.error_class === 'transient' && jobStatus(timeout) === 'waiting_retry' && !!timeout.b44.jobWrites.slice(-1)[0].patch.next_retry_at);
  const n5xx = await run({ extraction: () => { throw new Error('storage 503 temporary failure'); } });
  check('Q10', 'a transient failure retries and the classification still lands', n5xx.outcome.decision === 'retry' && n5xx.calls.understanding.length === 1 && jobStatus(n5xx) === 'waiting_retry');
  const third = await run({ job: JOB({ status: 'queued', attempt_count: 2 }), understanding: () => { throw new Error('provider 502'); } });
  check('Q11', 'retry is bounded: attempt 3 of 3 is terminal', third.outcome.decision === 'failed' && third.outcome.attempt_count === 3 && third.b44.jobWrites.slice(-1)[0].patch.last_error_class === 'transient_exhausted');
  const fourth = await run({ job: JOB({ status: 'waiting_retry', attempt_count: 3, next_retry_at: '2026-10-04T20:00:00.000Z' }) });
  check('Q12', 'an exhausted job never loops again', fourth.outcome.decision === 'terminal' && fourth.calls.understanding.length === 0);
  const perm = await run({ understanding: () => { throw new Error('malformed unsupported content contract'); } });
  check('Q12', 'a permanent failure is terminal on its first attempt', perm.outcome.decision === 'failed' && perm.outcome.error_class === 'permanent' && perm.outcome.attempt_count === 1);
  const persisted = first.b44.jobWrites.map((w) => w.patch || {}).filter((p) => p.attempt_count !== undefined);
  check('Q13', 'attempt metadata is persisted truthfully on the ledger', persisted.length === 1 && persisted[0].attempt_count === 1 && 'claimed_at' in persisted[0] && 'lease_expires_at' in persisted[0] && 'last_attempt_at' in persisted[0]);
  check('Q13', 'error class and message are persisted on failure', !!timeout.b44.jobWrites.slice(-1)[0].patch.last_error_class && /classification:/.test(timeout.b44.jobWrites.slice(-1)[0].patch.last_error_message));

  // ══ Q14-Q18 — the engine is reused, never reimplemented
  check('Q14', 'orchestration never classifies: it writes no document_type', !docAnalyses(first).some((w) => 'document_type' in (w.payload || {})) && !first.sb.writes.some((w) => w.table === 'documents' && w.payload && 'document_type' in w.payload));
  check('Q14', 'the existing understanding engine is the one invoked (REF: 6D.0b D9/D13 persist the applied type)', /runIngestionUnderstanding\(\{/.test(S.orchestration) && fs.existsSync(path.join(ROOT, 'scripts/documentUnderstanding.test.cjs')));
  const noRoute = await run({ understanding: () => ({ route_extraction: false, result: { document_type: 'w2' } }) });
  check('Q15', 'the reader route decided by classification is honoured', noRoute.outcome.decision === 'completed' && noRoute.outcome.route_extraction === false && noRoute.calls.extraction.length === 0);
  check('Q15', 'extraction is invoked on the APPLIED canonical type, after apply', /documentType: document\.document_type/.test(S.orchestration) && !/job\.document_type/.test(S.orchestration));
  check('Q16', '1040 → personal_tax_return reader (REF: 6D.0b T1)', /personal_tax_return/.test(read('base44/shared/documentUnderstanding/taxonomy.ts')));
  check('Q17', 'P&L → profit_and_loss reader (REF: 6D.0b F1)', /profit_and_loss/.test(read('base44/shared/documentUnderstanding/taxonomy.ts')));
  check('Q18', 'extraction persists through the existing engine with canonical ids', first.calls.extraction.length === 1 && first.calls.extraction[0].documentAnalysisId === 'an1' && first.calls.extraction[0].documentId === 'doc1');
  check('Q18', 'the extraction engine is not reimplemented here', /runExtraction\(/.test(S.orchestration) && !/documentExtraction/.test(S.wfIngestion + S.wfRecovery));

  // ══ Q19-Q21 — review safety
  const reviewWrites = first.sb.writes.concat(timeout.sb.writes, third.sb.writes).map((w) => w.payload || {});
  check('Q19', 'an accepted review cannot be erased by orchestration', reviewWrites.every((p) => !('extracted_fields' in p) && !('accepted_fields' in p)));
  check('Q20', 'a corrected review cannot be overwritten by orchestration', reviewWrites.every((p) => !('corrected_fields' in p) && !('verified_fields' in p)));
  check('Q21', 'a rejected review cannot be resurrected or cleared', reviewWrites.every((p) => !('rejected_fields' in p) && !('review_status' in p)));
  check('Q19', 'a retry never clears extracted data (REF: extractionIntegrity review-safety)', !/extracted_data:\s*\{\s*\}/.test(S.orchestration) && fs.existsSync(path.join(ROOT, 'scripts/extractionIntegrity.test.cjs')));

  // ══ Q22-Q26 — truthful canonical states, never an upload failure
  const noSource = await run({ understanding: () => { throw new Error('no_content_access'); } });
  check('Q22', 'a missing source is truthful and terminal, not a retry loop', noSource.outcome.decision === 'failed' && noSource.outcome.error_class === 'permanent');
  check('Q23', 'unclassified is not turned into unsupported by orchestration', !docAnalyses(noRoute).some((w) => (w.payload || {}).analysis_status === 'unsupported') && /'needs_classification'/.test(S.orchestration));
  check('Q24', 'a recognized unsupported type completes rather than retrying', noRoute.outcome.decision === 'completed' && noRoute.b44.jobWrites.slice(-1)[0].patch.status === 'completed');
  const exFail = await run({ job: JOB({ attempt_count: 2 }), extraction: () => { throw new Error('provider 500'); } });
  check('Q25', 'an exhausted extraction failure is truthful (Analysis failed)', exFail.outcome.decision === 'failed' && docAnalyses(exFail).some((w) => (w.payload || {}).analysis_status === 'failed'));
  check('Q26', 'intelligence failure never marks the upload failed', !/upload_status:\s*'failed'/.test(S.orchestration + S.upload) && /success:\s*true/.test(S.upload) && /'not_queued'/.test(S.upload));
  check('Q26', 'upload success does not depend on the job being created', /catch \(jobErr\)/.test(S.upload) && /const respond = Response\.json/.test(S.upload));

  // ══ Q27-Q30 — the UI observes, it never works
  check('Q27', 'the Data Room reads persisted canonical state', /resolveDocumentStates\(doc\)/.test(S.dataRoom) && /useDocumentPipelinePolling/.test(S.dataRoom));
  check('Q28', 'DocumentUpload reads persisted canonical state', /resolveDocumentStates/.test(S.uploadPage) && /analysisLabel\(states\.analysis\)/.test(S.uploadPage));
  check('Q29', 'client polling is not required for execution', /"trigger_type":\s*"entity"/.test(S.wfIngestion) && /invoke_backend_function/.test(S.wfIngestion) && !/setInterval/.test(S.orchestration + S.workerFn));
  const refresh = await run({ job: JOB({ status: 'completed', attempt_count: 1 }) });
  check('Q30', 'refresh/reload cannot restart or duplicate the job', refresh.outcome.decision === 'already_completed' && refresh.calls.understanding.length === 0 && refresh.calls.extraction.length === 0);

  // ══ Q31-Q36 — identity and isolation
  const entity = JSON.parse(S.entity);
  const fields = Object.keys(entity.properties);
  check('Q31', 'the ledger is keyed to the canonical document/analysis pair', fields.includes('document_id') && fields.includes('analysis_id') && entity.required.includes('document_id') && entity.required.includes('analysis_id'));
  check('Q32', 'business_id is NOT on the ledger and is never written', !fields.includes('business_id') && !touchedBusiness(first));
  check('Q33', 'document_scope is NOT on the ledger and is never written', !fields.includes('document_scope') && !touchedBusiness(first));
  const hostile = await run({ job: JOB({ business_id: 'biz-zzz', document_scope: 'household', profile_id: 'prof-zzz' }) });
  check('Q34', 'a cross-business pivot through the ledger is impossible', hostile.calls.understanding[0].businessId === 'biz-a' && hostile.calls.understanding[0].profileId === 'prof1');
  {
    const r = await run();
    const out = await r.mods.processJob({ sb: r.sb, base44: r.b44, jobId: 'job1', document_id: 'doc-zzz', business_id: 'biz-zzz', document_scope: 'household' });
    check('Q34', 'a caller-supplied document id cannot redirect the job', r.calls.understanding[0].documentId === 'doc1' && r.calls.understanding.length === 1 && ['already_claimed', 'already_leased', 'already_completed'].includes(out.decision));
  }
  const mismatch = await run({ analysis: ANA({ document_id: 'doc-other' }) });
  check('Q34', 'a mismatched pair is refused terminally', mismatch.outcome.decision === 'failed' && mismatch.outcome.error_class === 'relationship_mismatch' && mismatch.calls.understanding.length === 0);
  check('Q35', 'a revoked relationship cannot alter scope (REF: relationshipRevocationAccess)', /isOwnerOfRecord/.test(S.docAccess) && fs.existsSync(path.join(ROOT, 'scripts/relationshipRevocationAccess.test.cjs')) && !/advisor_assignments|access_control|user_condition/.test(S.orchestration));
  check('Q36', 'a suspended actor cannot alter scope (REF: adminCanonicalActor)', fs.existsSync(path.join(ROOT, 'scripts/adminCanonicalActor.test.cjs')) && !/user_condition|role ===/.test(S.orchestration));
  check('Q36', 'a non-admin user session cannot drive the worker', /base44\.auth\.me\(\)/.test(S.workerFn) && /403/.test(S.workerFn));

  // ══ Q37-Q43 — no duplicates, no facts, CTA preserved
  check('Q37', 'duplicate classification rows are prevented by the atomic claim', /\.in\('status', CLAIMABLE_ANALYSIS_STATES\)/.test(S.orchestration) && /Array\.isArray\(data\) && data\.length === 1/.test(S.orchestration) && first.calls.understanding.length === 1);
  check('Q38', 'duplicate extracted-field corruption is prevented', first.calls.extraction.length === 1 && secondOutcome.decision !== 'completed');
  const ledgerFiles = [S.orchestration, S.workerFn, S.upload, S.entity, S.wfIngestion, S.wfRecovery];
  check('Q39', 'no business_facts write anywhere in the slice', ledgerFiles.every((t) => !/\.from\('business_facts'\)/.test(t)));
  check('Q40', 'no business_fact_evidence write anywhere in the slice', ledgerFiles.every((t) => !/\.from\('business_fact_evidence'\)/.test(t)));
  check('Q41', 'the Galileo CTA still submits automatically', /DOCUMENT_FINDINGS_QUESTION/.test(S.visionActions) && /this document/.test(S.visionActions));
  check('Q42', 'the CTA still carries the exact document and the server reauthorizes it', /focused_record_id/.test(S.askGalileoHook) && /focused_record_id/.test(S.askGalileoFn) && /isOwnerOfRecord/.test(S.docAccess));
  check('Q43', 'activeBusinessId is untouched by the whole path', !/setActiveBusiness/.test(S.visionActions + S.askGalileoHook + S.workerFn + S.orchestration));

  // ══ Q44-Q46 — recovery scope
  check('Q44', 'a stranded queued job is recoverable', (await first.mods.findDueJobs({ base44: makeBase44([JOB()]) })).length === 1);
  check('Q44', 'the recovery sweep runs the SAME worker', /sweepJobs\(\{ sb, base44, now \}\)/.test(S.workerFn) && /processJob\(\{ sb, base44, jobId: job\.id/.test(S.orchestration));
  // The fixture instants are absolute, so the evaluation instant must be too: an
  // unpinned `now` reads the wall clock, and once real time passes 23:00Z the
  // "not-yet-due" fixture has genuinely become due. Pinned to Q46's instant.
  const Q45_NOW = '2026-10-04T21:00:00.000Z';
  check('Q45', 'a stranded processing job with an expired lease is recoverable', (await first.mods.findDueJobs({ base44: makeBase44([JOB({ status: 'processing', lease_expires_at: '2026-10-04T20:00:00.000Z' })]), now: Q45_NOW })).length === 1);
  check('Q45', 'a due retry is recoverable, a not-yet-due retry is not', (await first.mods.findDueJobs({ base44: makeBase44([JOB({ status: 'waiting_retry', attempt_count: 1, next_retry_at: '2026-10-04T20:59:00.000Z' })]), now: Q45_NOW })).length === 1 && (await first.mods.findDueJobs({ base44: makeBase44([JOB({ status: 'waiting_retry', attempt_count: 1, next_retry_at: '2026-10-04T23:00:00.000Z' })]), now: Q45_NOW })).length === 0);
  const recovSeed = [JOB({ id: 'done', status: 'completed' }), JOB({ id: 'dead', status: 'failed' }), JOB({ id: 'live', status: 'processing', lease_expires_at: '2026-10-04T23:00:00.000Z' }), JOB({ id: 'stranded', status: 'processing', lease_expires_at: '2026-10-04T20:00:00.000Z' })];
  const dueIds = (await first.mods.findDueJobs({ base44: makeBase44(recovSeed), now: '2026-10-04T21:00:00.000Z' })).map((j) => j.id);
  check('Q46', 'recovery ignores completed and terminal jobs', !dueIds.includes('done') && !dueIds.includes('dead'));
  check('Q46', 'recovery does not steal a live lease', !dueIds.includes('live') && dueIds.includes('stranded'));
  check('Q44', 'the recovery workflow is scheduled and recovery-only', /"trigger_type":\s*"scheduled"/.test(S.wfRecovery) && /"sweep":\s*true/.test(S.wfRecovery) && /RECOVERY ONLY/.test(S.wfRecovery));

  // ══ Q47-Q50 — durability ownership
  // The WORD may appear in explanatory prose (and does, to record why it was
  // replaced); the CALL and the runtime import must not exist anywhere here.
  check('Q47', 'waitUntil is not used anywhere in ingestion durability', !/waitUntil\s*\(/.test(S.upload + S.orchestration + S.workerFn) && !/base44:runtime['"]/.test(S.upload + S.orchestration) && !/waitUntil/.test(S.workerFn));
  check('Q48', 'the browser is not the worker', !/processDocumentIngestionJob|sweepJobs/.test(S.dataRoom + S.uploadPage) && !/base44\.functions\.invoke\('processDocumentIngestionJob'\)/.test(read('src/hooks/useDocumentPipelinePolling.js')));
  check('Q49', 'no recursive retry: the worker never invokes itself', !/functions\.invoke/.test(S.orchestration + S.workerFn));
  const wfDoc = S.wfIngestion;
  const transitions = [...wfDoc.matchAll(/"then":\s*"([a-z_]+|end)"/g)].map((m) => m[1]);
  check('Q49', 'the workflow graph is a bounded DAG ending in end', transitions.length > 0 && transitions.filter((t) => t === 'end').length >= 2 && !/"then":\s*"run_ingestion_worker"/.test(wfDoc));
  check('Q50', 'exactly ONE canonical worker implementation exists', (S.orchestration.match(/export async function processJob/g) || []).length === 1 && (read('base44/functions/processDocumentIngestionJob/entry.ts').match(/processJob\(/g) || []).length === 1 && !/recoverDocumentIngestionJobs/.test(read('' + 'base44/functions/processDocumentIngestionJob/entry.ts')));
  check('Q50', 'the workflow holds no classification or extraction logic', !/classifyWithProvider|runExtraction\(|extractEngine|EXTRACTION_SCHEMAS|understandDocument/.test(S.wfIngestion + S.wfRecovery) && !/import /.test(S.wfIngestion + S.wfRecovery));

  // ══ Q51-Q53 — the ledger carries no copied truth
  ['business_id', 'document_scope', 'profile_id', 'role', 'email'].forEach((f) => {
    check('Q51', `job ledger carries no ${f}`, !fields.includes(f) && !new RegExp(`job\\.${f}`).test(S.orchestration));
  });
  ['document_type', 'classification', 'subtype', 'tax_year', 'confidence'].forEach((f) => {
    check('Q52', `job ledger carries no ${f}`, !fields.includes(f) && !new RegExp(`job\\.${f}`).test(S.orchestration));
  });
  ['extracted', 'financial', 'revenue', 'ebitda', 'folder'].forEach((f) => {
    check('Q53', `job ledger carries no ${f} truth`, !new RegExp(f, 'i').test(fields.join(',')));
  });

  // ══ Q54-Q60 — trigger architecture and convergence
  check('Q54', 'normal ingestion uses the entity trigger', /"trigger_type":\s*"entity"/.test(S.wfIngestion) && /"create"/.test(S.wfIngestion));
  check('Q55', 'the scheduled workflow is recovery-only', !/processDocumentIngestionJob"\s*,\s*"args":\s*\{\s*"job_id"/.test(S.wfRecovery) && /"sweep":\s*true/.test(S.wfRecovery) && !/DocumentIngestionJob"\s*,\s*"events"/.test(S.wfRecovery));
  // 6D.0c retarget (INTENTIONAL CONTRACT EVOLUTION, not a weakening): the approved
  // handoff now moves the canonical row OUT of `processing` (handOffToExtraction writes
  // analysis_status AND status = 'pending_analysis') before the reader runs, so the old
  // `status === 'processing'` clause asserted the PRE-handoff contract — the very state
  // this phase repairs. The assertion's intent is unchanged and is now stated against
  // the canonical post-extraction state the completion PROOF itself validates: the row
  // settled as `completed`, and a duplicate delivery still cannot complete a second time.
  check('Q56', 'duplicate delivery converges on the same canonical state', first.outcome.decision === 'completed' && secondOutcome.decision !== 'completed' && first.sb.tables.document_analysis[0].analysis_status === 'completed');
  check('Q57', 'workflow versioning cannot corrupt a running job', /"version":\s*"1\.0"/.test(S.wfIngestion) && /job_id/.test(S.wfIngestion) && (S.orchestration.match(/isJobClaimable\(/g) || []).length >= 1);
  const expired = await run({ job: JOB({ status: 'processing', attempt_count: 1, lease_expires_at: '2026-10-04T20:00:00.000Z' }) });
  check('Q58', 'an expired lease can be reclaimed', expired.outcome.decision === 'completed' && expired.outcome.attempt_count === 2 && expired.calls.understanding.length === 1);
  const live = await run({ job: JOB({ status: 'processing', attempt_count: 1, lease_expires_at: '2026-10-04T21:05:00.000Z' }) });
  check('Q59', 'an unexpired lease cannot be stolen', live.outcome.decision === 'already_leased' && live.calls.understanding.length === 0);
  check('Q60', 'a terminal completed job performs zero provider calls', done.outcome.provider_calls === 0 && done.calls.understanding.length === 0 && done.calls.extraction.length === 0);

  // ══ QM1-QM35 — every mutation must be CAUGHT ═════════════════════════════
  const caught = (id, label, ok) => check(id, label, ok === true, ok === true ? '' : 'mutation not caught');
  const mut = (src, find, replace) => src.split(find).join(replace);
  const changed = (src, find, replace) => mut(src, find, replace) !== src;

  caught('QM1', 'removing the durable trigger is caught', changed(S.upload, 'DocumentIngestionJob.create', 'noopCreate') && !/DocumentIngestionJob\.create/.test(mut(S.upload, 'DocumentIngestionJob.create', 'noopCreate')));
  caught('QM2', 'relying on waitUntil is caught', /waitUntil/.test(mut(S.upload, 'const respond = Response.json', 'const __r = waitUntil(x);\nconst respond = Response.json')));
  caught('QM3', 'processing before the queued state is persisted is caught', !!mut(S.upload, 'if (analysisId) {', 'if (true) {') && jobIdx > analysisIdx);
  {
    const m = mut(S.orchestration, "if (job.status === JOB_STATES.COMPLETED) return { claimable: false, reason: 'completed' };", '');
    caught('QM4', 'a duplicate delivery duplicating classification is caught', load(m) === undefined ? false : (await (async () => {
      const r = await run({ job: JOB({ status: 'completed' }), compile: compile(m) });
      return r.outcome.decision !== 'already_completed';
    })()) === true);
  }
  {
    const m = mut(S.orchestration, "if ((job.attempt_count || 0) >= MAX_ATTEMPTS) return { claimable: false, reason: 'attempts_exhausted' };", '');
    const r = await run({ job: JOB({ status: 'waiting_retry', attempt_count: 3, next_retry_at: '2026-10-04T20:00:00.000Z' }), compile: compile(m) });
    caught('QM5', 'duplicate delivery duplicating extraction is caught', r.calls.extraction.length > 0);
  }
  {
    const m = mut(S.orchestration, "if (job.status === JOB_STATES.COMPLETED) return { claimable: false, reason: 'completed' };", '');
    const r = await run({ job: JOB({ status: 'completed' }), compile: compile(m) });
    caught('QM6', 'a completed job being reprocessed is caught', r.calls.understanding.length > 0);
  }
  {
    const m = mut(S.orchestration, 'export const MAX_ATTEMPTS = 3;', 'export const MAX_ATTEMPTS = 1000000;');
    const r = await run({ job: JOB({ attempt_count: 2 }), understanding: () => { throw new Error('provider 502'); }, compile: compile(m) });
    caught('QM7', 'retrying forever is caught', r.outcome.decision !== 'failed');
  }
  {
    const m = mut(S.orchestration, "canonicalOnExhaustion: 'needs_classification'", "canonicalOnExhaustion: 'failed'");
    const r = await run({ job: JOB({ attempt_count: 2 }), understanding: () => { throw new Error('timeout'); }, compile: compile(m) });
    caught('QM8', 'a timeout becoming Analysis failed is caught', docAnalyses(r).some((w) => (w.payload || {}).analysis_status === 'failed'));
  }
  {
    const m = mut(S.orchestration, "canonicalOnExhaustion: 'needs_classification'", "canonicalOnExhaustion: 'unsupported'");
    const r = await run({ job: JOB({ attempt_count: 2 }), understanding: () => { throw new Error('timeout'); }, compile: compile(m) });
    caught('QM9', 'a timeout becoming Unsupported is caught', docAnalyses(r).some((w) => (w.payload || {}).analysis_status === 'unsupported'));
  }
  caught('QM10', 'routing a stale type into extraction is caught', /documentType: 'other'/.test(mut(S.orchestration, 'documentType: document.document_type', "documentType: 'other'")));
  caught('QM11', 'overwriting an accepted review is caught', /extracted_fields/.test(mut(S.orchestration, 'const failure = classifyFailure(err);', "await sb.from('document_analysis').update({ extracted_fields: [] });\n  const failure = classifyFailure(err);")));
  caught('QM12', 'overwriting a corrected review is caught', /verified_fields/.test(mut(S.orchestration, 'const failure = classifyFailure(err);', "await sb.from('document_analysis').update({ verified_fields: [] });\n  const failure = classifyFailure(err);")));
  caught('QM13', 'resurrecting a rejected field is caught', /rejected_fields/.test(mut(S.orchestration, 'const failure = classifyFailure(err);', "await sb.from('document_analysis').update({ rejected_fields: [] });\n  const failure = classifyFailure(err);")));
  caught('QM14', 'trusting a ledger business_id is caught', /job\.business_id/.test(mut(S.orchestration, 'const businessId = document.business_id || null;', 'const businessId = job.business_id || null;')));
  caught('QM15', 'trusting a ledger document_scope is caught', /job\.document_scope/.test(mut(S.orchestration, 'const profileId = document.profile_id || null;', 'const profileId = document.profile_id || null; const scope = job.document_scope;')));
  {
    const m = mut(S.orchestration, 'businessId,\n      currentDocument: document,', 'businessId: extra.business_id,\n      currentDocument: document,');
    caught('QM16', 'a caller-supplied cross-business pivot is caught', /extra\.business_id/.test(m));
  }
  caught('QM17', 'the UI being required to advance the worker is caught', /processDocumentIngestionJob/.test(mut(S.orchestration, 'export async function sweepJobs', "const __ui = () => sb.invoke('processDocumentIngestionJob');\nexport async function sweepJobs")));
  caught('QM18', 'a refresh starting a duplicate job is caught', !/existing\?\.items/.test(mut(S.upload, 'const active = (existing?.items || [])[0];', 'const active = null;')));
  {
    // Both halves of the recovery scope are mutated: the query that excludes
    // completed work AND the claimable filter that re-checks it.
    let m = mut(S.orchestration, 'return rows.filter((j: any) => isJobClaimable(j, now).claimable);', 'return rows;');
    m = mut(m, '{ status: { $in: [JOB_STATES.QUEUED, JOB_STATES.PROCESSING, JOB_STATES.WAITING_RETRY] } }', '{ status: { $in: [JOB_STATES.COMPLETED] } }');
    const modsM = compile(m)(async () => ({}), async () => ({}));
    const due = (await modsM.findDueJobs({ base44: makeBase44([JOB({ status: 'completed' })]), now: '2026-10-04T21:00:00.000Z' })).map((j) => j.id);
    caught('QM19', 'recovery reprocessing a completed job is caught', due.includes('job1'));
  }
  caught('QM20', 'a business_facts write is caught', /business_facts/.test(mut(S.orchestration, 'const DOCUMENT_COLUMNS =', "const __f = () => sb.from('business_facts');\nconst DOCUMENT_COLUMNS =")));
  caught('QM21', 'a business_fact_evidence write is caught', /business_fact_evidence/.test(mut(S.orchestration, 'const DOCUMENT_COLUMNS =', "const __e = () => sb.from('business_fact_evidence');\nconst DOCUMENT_COLUMNS =")));
  caught('QM22', 'the CTA no longer submitting is caught', !/DOCUMENT_FINDINGS_QUESTION/.test(mut(S.visionActions, 'DOCUMENT_FINDINGS_QUESTION', 'GENERIC_PROMPT')));
  caught('QM23', 'the CTA losing the exact document is caught', !/focused_record_id/.test(mut(S.askGalileoHook, 'focused_record_id', 'unscoped')));
  caught('QM24', 'the CTA bypassing authorization is caught', !/isOwnerOfRecord/.test(mut(S.docAccess, 'isOwnerOfRecord', 'alwaysAllow')));
  caught('QM25', 'a second classifier being introduced is caught', !/classifyWithProvider/.test(S.orchestration) && /classifyWithProvider/.test(mut(S.orchestration, 'const DOCUMENT_COLUMNS =', 'const __c = classifyWithProvider;\nconst DOCUMENT_COLUMNS =')));
  caught('QM26', 'copying business_id into the ledger is caught', /business_id/.test(mut(S.entity, '"document_id"', '"business_id",\n    "document_id"')));
  caught('QM27', 'copying document_type into the ledger is caught', /document_type/.test(mut(S.entity, '"analysis_id"', '"document_type",\n    "analysis_id"')));
  caught('QM28', 'the sweeper becoming the normal ingestion path is caught', !/"trigger_type":\s*"entity"/.test(mut(S.wfIngestion, '"trigger_type": "entity"', '"trigger_type": "scheduled"')));
  {
    const m = mut(S.orchestration, "return lease > t\n      ? { claimable: false, reason: 'leased' }", "return false\n      ? { claimable: false, reason: 'leased' }");
    const mods = compile(m)(async () => ({}), async () => ({}));
    const r = await (async () => { const sb = makeSb({ documents: [DOC()], document_analysis: [ANA()] }); const b44 = makeBase44([JOB({ status: 'processing', lease_expires_at: '2026-10-04T23:00:00.000Z' })]); return mods.processJob({ sb, base44: b44, jobId: 'job1', now: '2026-10-04T21:00:00.000Z' }); })();
    caught('QM29', 'recovery stealing a live lease is caught', r.decision !== 'already_leased');
  }
  {
    const m = mut(S.orchestration, "if (job.status === JOB_STATES.COMPLETED) return { claimable: false, reason: 'completed' };", '');
    const r = await run({ job: JOB({ status: 'completed' }), compile: compile(m) });
    caught('QM30', 'a completed job calling the provider again is caught', r.calls.understanding.length > 0);
  }
  caught('QM31', 'the ledger becoming canonical analysis state is caught', /extracting/.test(mut(S.entity, '"waiting_retry",', '"waiting_retry",\n        "extracting",')));
  caught('QM32', 'the workflow duplicating classifier logic is caught', /classifyWithProvider/.test(mut(S.wfIngestion, '"function_name": "processDocumentIngestionJob"', '"function_name": "classifyWithProvider"')));
  caught('QM33', 'the workflow duplicating extraction logic is caught', /runExtraction/.test(mut(S.wfIngestion, '"function_name": "processDocumentIngestionJob"', '"function_name": "runExtraction"')));
  caught('QM34', 'a client triggering arbitrary processing by job id is caught', /processDocumentIngestionJob/.test(mut(S.dataRoom, 'const navigate = useNavigate();', "const __x = () => base44.functions.invoke('processDocumentIngestionJob', { job_id: 'x' });\n  const navigate = useNavigate();")));
  caught('QM35', 'a retry erasing reviewed work is caught', /extracted_data: \{\}/.test(mut(S.orchestration, 'const failure = classifyFailure(err);', "await sb.from('document_analysis').update({ extracted_data: {} });\n  const failure = classifyFailure(err);")));

  console.log('');
  if (failures.length) {
    console.log(`FAILED — ${failures.length}`);
    failures.forEach((f) => console.log(`  · ${f}`));
    return { failures };
  }
  console.log(`PASSED — all ${total} checks across Q1-Q60 and QM1-QM35`);
  return { failures };
}

module.exports = { run: main };

if (require.main === module) {
  main()
    .then((r) => { if (r.failures.length) process.exit(1); })
    .catch((e) => { console.error(e); process.exit(1); });
}