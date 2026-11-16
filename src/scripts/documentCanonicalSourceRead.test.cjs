#!/usr/bin/env node
/**
 * documentCanonicalSourceRead.test.cjs — VISION 6D.0b.2.1
 * CANONICAL SOURCE READ + FAILURE SEMANTICS REPAIR.
 *
 * Run:  node src/scripts/documentCanonicalSourceRead.test.cjs
 *
 * OFFLINE AND NON-DESTRUCTIVE. No network, no database, no Base44 call, no
 * production record read, written or deleted. NEITHER production specimen
 * (9a964471-a421-41d2-a8e6-fd19983fdd1e, a871e587-3af7-4523-9f36-c25d0cd4bf0d)
 * is a fixture, and neither is contacted.
 *
 * THE CODE UNDER TEST IS THE SHIPPED CODE:
 *   · base44/shared/supabase/projectUrl.ts        compiled and EXECUTED
 *   · base44/shared/documentIngestion/orchestration.ts compiled and EXECUTED against
 *     recording mocks (understanding / extraction are recording stubs — their
 *     internals belong to 6D.0b and 6D.0d harnesses)
 *   · src/lib/documents/documentTypes.js          compiled and EXECUTED (the real
 *     owner-facing resolver)
 *   · the worker and upload entries                inspected as shipped bytes
 *
 * EVIDENCE CLASS: EXECUTED (real module run) · STATIC (invariant over reviewed
 * bytes) · GIT (unchanged in the working tree vs HEAD) · REF (another harness).
 *
 *   S1-S40    canonical source read + failure semantics contract
 *   SM1-SM25  mutation tests — each must be CAUGHT
 */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const { execFileSync } = require('child_process');

const ROOT = fs.existsSync(path.join(__dirname, '..', 'base44'))
  ? path.join(__dirname, '..')
  : path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const quiet = { log() {}, warn() {}, error() {}, info() {} };

const results = [];
const failures = [];
const check = (evidence, id, label, ok, detail = '') => {
  const pass = ok === true;
  results.push({ id, pass });
  if (!pass) failures.push(`${id} ${label}${detail ? ` — ${detail}` : ''}`);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${String(evidence).padEnd(8)} ${String(id).padEnd(4)} ${label}${!pass && detail ? ` — ${detail}` : ''}`);
};

const P = {
  normalizer: 'base44/shared/supabase/projectUrl.ts',
  orchestration: 'base44/shared/documentIngestion/orchestration.ts',
  workerFn: 'base44/functions/processDocumentIngestionJob/entry.ts',
  upload: 'base44/functions/uploadDocumentToSupabase/entry.ts',
  entity: 'base44/entities/DocumentIngestionJob.jsonc',
  wfIngestion: 'base44/workflows/Document Ingestion.jsonc',
  wfRecovery: 'base44/workflows/Document Ingestion Recovery.jsonc',
  feTypes: 'src/lib/documents/documentTypes.js',
  dataRoom: 'src/pages/DataRoom.jsx',
  uploadPage: 'src/pages/DocumentUpload.jsx',
  pipelineHook: 'src/hooks/useDocumentPipelinePolling.js',
  understanding: 'base44/shared/documentUnderstanding/understandDocument.ts',
  classifier: 'base44/shared/documentUnderstanding/semanticClassifier.ts',
  taxonomy: 'base44/shared/documentUnderstanding/taxonomy.ts',
  persister: 'base44/shared/documentUnderstanding/persist.ts',
  extractEngine: 'base44/shared/documentExtraction/extractEngine.ts',
  docAccess: 'base44/shared/authz/documentAccess.ts',
  buckets: 'base44/shared/documents/buckets.ts',
  relationshipAccess: 'base44/shared/businessScope/relationshipAccess.ts',
  actor: 'base44/shared/authz/actor.ts',
};
const S = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, read(v)]));

const SPECIMENS = ['9a964471-a421-41d2-a8e6-fd19983fdd1e', 'a871e587-3af7-4523-9f36-c25d0cd4bf0d'];
const SLICE = [S.normalizer, S.orchestration, S.workerFn, S.upload, S.entity, S.wfIngestion, S.wfRecovery];

// SM5's mutation works on the trailing-slash strip inside the ONE normalizer. It is
// expressed as two FRAGMENTS of plain source with no regex literal, so the mutation can
// never again be defeated by this harness escaping its own backslashes: an earlier
// revision double-escaped the anchor, the split matched nothing, and the mutation was a
// silent no-op that still reported "not caught". The assertion also proves the mutation
// APPLIED, so a no-op can never masquerade as a caught mutation.
const NORMALIZER_TRAILING_STRIP = "return raw.replace(API_PATH_SEGMENT, '').replace(";
const NORMALIZER_TRAILING_STRIP_LOST = "return raw.replace(API_PATH_SEGMENT, ''); return String(";

// ── Compilation ──────────────────────────────────────────────────────────────
const strip = (s) => s.replace(/^\s*import[\s\S]*?from\s+'[^']+';/gm, '').replace(/^\s*export\s+/gm, '');
const toTs = (s) => esbuild.transformSync(s, { loader: 'ts', format: 'cjs', target: 'es2020' }).code;
const toJs = (s) => esbuild.transformSync(s, { loader: 'js', format: 'cjs', target: 'es2020' }).code;

function loadNormalizer(src = S.normalizer) {
  return new Function('console', `${toTs(strip(src))}\n;return { normalizeSupabaseProjectUrl };`)(quiet).normalizeSupabaseProjectUrl;
}

const ORCH_RETURNS =
  '({ JOB_STATES, MAX_ATTEMPTS, LEASE_MS, RETRY_BACKOFF_MS, CLAIMABLE_ANALYSIS_STATES, SETTLED_ANALYSIS_STATES, READ_OUTCOMES, UNRESOLVED_INFRASTRUCTURE_REASONS, isJobClaimable, classifyFailure, backoffFor, resolveContentAccess, readCanonicalRow, claimJob, processJob, findDueJobs, sweepJobs })';

// The shipped orchestrator classifies every run through the extraction engine's ONE
// canonical classifier (`classifyExtractionOutcome`, imported by the module). This
// harness STRIPS imports, so each module-level dependency has to be injected as a
// parameter — with the classifier omitted it was an undeclared identifier and the
// worker died mid-run (ReferenceError), which is a harness-injection defect, not a
// product defect. The REAL classifier is compiled from the shipped engine and never
// re-implemented, so the outcome semantics under test stay the engine's own.
const ENGINE_FILE = 'base44/shared/documentExtraction/extractEngine.ts';
function loadClassifier() {
  return new Function(
    'console',
    `${toTs(strip(read(ENGINE_FILE)))}\n;return { classifyExtractionOutcome };`,
  )(quiet).classifyExtractionOutcome;
}
function loadOrchestration(src = S.orchestration) {
  const classifyExtractionOutcome = loadClassifier();
  return (understanding, extraction) =>
    new Function('console', 'runIngestionUnderstanding', 'runExtraction', 'classifyExtractionOutcome', `${toTs(strip(src))}\n;return ${ORCH_RETURNS};`)(
      quiet,
      understanding,
      // 6D.0c: the shipped engine persists its outcome canonically BEFORE it returns,
      // so the default stub is wrapped to do the same. A stub that merely RETURNED
      // success is now (correctly) refused by the completion PROOF. Only the SUCCESS
      // path gains a persistence write: an override that throws or reports a
      // non-completed finalStatus passes through untouched.
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
const loadOrch = loadOrchestration(undefined);

function resolverFrom(src = S.feTypes) {
  const body = src.replace(/^export\s+/gm, '');
  return new Function(`${toJs(body)}; return { ANALYSIS_STATE, ANALYSIS_LABEL, PROCESSING_FAILED_NOTE, resolveDocumentStates };`)();
}
const fe = resolverFrom(undefined);

const normalize = loadNormalizer(undefined);

// ── Recording mocks ─────────────────────────────────────────────────────────
function makeSb(opts = {}) {
  const tables = {
    documents: opts.documents ?? [DOC()],
    document_analysis: opts.analysis ?? [ANA()],
  };
  const reads = [];
  const writes = [];
  const behaviour = opts.reads || {};

  function chain(table) {
    const st = { table, op: 'select', payload: null, filters: [], single: false, returning: false };
    const rows = () => (tables[table] || []).filter((r) => st.filters.every(([c, v, kind]) => (kind === 'in' ? v.includes(r[c]) : r[c] === v)));
    const settle = () => {
      if (st.op === 'select') {
        reads.push({ table, columns: st.columns || null });
        const b = behaviour[table];
        if (b && b.error) return { data: null, error: b.error };
        const matched = rows();
        return { data: st.single ? matched[0] || null : matched, error: null };
      }
      if (st.op === 'update') {
        writes.push({ table, op: 'update', payload: st.payload });
        const matched = rows();
        matched.forEach((r) => Object.assign(r, st.payload));
        return { data: st.returning ? matched.map((r) => ({ id: r.id })) : matched, error: opts.writeError || null };
      }
      if (st.op === 'insert') {
        writes.push({ table, op: 'insert', payload: st.payload });
        (tables[table] = tables[table] || []).push(st.payload);
        return { data: [st.payload], error: null };
      }
      return { data: null, error: null };
    };
    const obj = {
      select(c) { st.columns = c; if (st.op === 'update') st.returning = true; return obj; },
      eq(c, v) { st.filters.push([c, v, 'eq']); return obj; },
      in(c, v) { st.filters.push([c, v, 'in']); return obj; },
      limit() { return obj; },
      maybeSingle() { st.single = true; return obj; },
      single() { st.single = true; return obj; },
      update(p) { st.op = 'update'; st.payload = p; return obj; },
      insert(p) { st.op = 'insert'; st.payload = p; return obj; },
      then(res, rej) {
        const b = st.op === 'select' ? behaviour[table] : null;
        if (b && b.throws) return Promise.reject(b.throws).then(res, rej);
        return Promise.resolve(settle()).then(res, rej);
      },
    };
    return obj;
  }

  return {
    reads,
    writes,
    tables,
    from: chain,
    storage: {
      from: () => ({
        createSignedUrl: async (p) => {
          if (opts.storageThrows) throw opts.storageThrows;
          if (opts.storageError) return { data: null, error: opts.storageError };
          return { data: { signedUrl: `https://signed.invalid/${p}` }, error: null };
        },
      }),
    },
  };
}

function makeBase44(jobSeed = [], opts = {}) {
  const jobs = jobSeed.map((j) => ({ ...j }));
  const jobWrites = [];
  const core = [];
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
      const items = jobs.filter((j) => !statuses || statuses.includes(j.status));
      return { items, has_more: false };
    },
  };
  return {
    jobs,
    jobWrites,
    core,
    asServiceRole: {
      integrations: {
        Core: {
          InvokeLLM: async (a) => {
            core.push(a || {});
            return opts.llmResponse || {};
          },
        },
      },
      entities: {
        DocumentIngestionJob: api,
        DocumentClassification: {
          create: async (p) => ({ ...p, id: 'dc-1' }),
          update: async (id, p) => ({ ...p, id }),
          filter: async () => [],
        },
      },
    },
  };
}

const DOC = (over = {}) => ({
  id: 'doc1', profile_id: 'prof1', business_id: 'biz-a', document_scope: 'business',
  storage_bucket: 'documents', file_path: 'prof1/biz-a/1_1040.pdf', file_url: null,
  name: '1040.pdf', document_type: 'other', year: null, upload_status: 'pending_analysis', status: 'uploaded', ...over,
});
const ANA = (over = {}) => ({ id: 'an1', document_id: 'doc1', status: 'queued', analysis_status: 'queued', ...over });
const JOB = (over = {}) => ({
  id: 'job1', document_id: 'doc1', analysis_id: 'an1', status: 'queued', attempt_count: 0,
  claimed_at: null, lease_expires_at: null, next_retry_at: null, last_attempt_at: null,
  last_error_class: null, last_error_message: null, ...over,
});

async function run(opts = {}) {
  const sb = opts.sb || makeSb(opts);
  const b44 = opts.base44 || makeBase44([opts.job || JOB()]);
  const calls = { understanding: [], extraction: [] };
  const understanding = async (args) => {
    calls.understanding.push(args);
    // The real path reads the document through the platform AI integration; the stub
    // does the same so "provider invoked / not invoked" is evidenced, not asserted.
    await b44.asServiceRole.integrations.Core.InvokeLLM({ prompt: 'x', file_urls: [args.signedUrl] });
    if (opts.understanding) return opts.understanding(args);
    return { route_extraction: true, result: { document_type: 'personal_tax_return', applied_document_type: 'personal_tax_return' } };
  };
  const extraction = async (sbArg, args, ctx) => {
    calls.extraction.push(args);
    if (opts.extraction) return opts.extraction(args);
    // 6D.0c: the engine's real success shape. `success: true` is what the shipped
    // classifier maps to 'success'; without it the run classifies as a retryable
    // failure and the completion proof is never reached.
    return { success: true, finalStatus: 'completed' };
  };
  const mods = (opts.compile || loadOrch)(understanding, extraction);
  const outcome = await mods.processJob({ sb, base44: b44, jobId: opts.jobId || 'job1', now: opts.now || '2026-10-04T22:00:00.000Z' });
  return { outcome, sb, b44, calls, mods };
}
const lastJobPatch = (r) => (r.b44.jobWrites.filter((w) => w.op === 'update').pop() || {}).patch || {};
const analysisWrites = (r) => r.sb.writes.filter((w) => w.table === 'document_analysis');
const touchedIdentity = (r) => r.sb.writes.some((w) => w.payload && ('business_id' in w.payload || 'document_scope' in w.payload || 'profile_id' in w.payload));

const QUERY_ERRORS = {
  pgrst125: { message: 'Invalid path specified in request URL', code: 'PGRST125' },
  network: { message: 'TypeError: fetch failed', code: null },
  fivexx: { message: 'Internal Server Error', code: '500' },
  auth: { message: 'Unauthorized: invalid service credential', code: '401' },
};

// ── Predicates (shared by an assertion and its mutation twin) ────────────────
const Pred = {
  // a backend client cannot carry its own private normalization implementation
  workerUsesShared: (t) => /normalizeSupabaseProjectUrl\(secrets\.get\('VITE_SUPABASE_URL'\)\)/.test(t)
    && !/replace\(\/\\\/\(rest/.test(t),
  uploadUsesShared: (t) => /normalizeSupabaseProjectUrl\(Deno\.env\.get\('VITE_SUPABASE_URL'\)\)/.test(t)
    && !/replace\(\/\\\/\(rest/.test(t),
  // the read separates a failed query from an absent row
  readSeparates: (t) => /outcome: READ_OUTCOMES\.QUERY_ERROR/.test(t) && /outcome: READ_OUTCOMES\.NOT_FOUND/.test(t),
  classifierOwned: (t) => /runIngestionUnderstanding\(\{/.test(t) && !/classifyWithProvider|EXTRACTION_SCHEMAS/.test(t),
  // source_missing is reachable only from a successful read that found nothing
  readErrorNeverNull: (t) => /if \(res\?\.error\) return failed\(res\.error\);/.test(t) && /catch \(err: any\) \{\s*return failed\(err\);/.test(t),
  transientClassified: (t) => /content_read_unavailable/.test(t) && /transient/.test(t),
  configClassified: (t) => /PGRST125\|invalid path/.test(t) && /configuration_error/.test(t),
  retryScheduled: (t) => /status: JOB_STATES\.WAITING_RETRY/.test(t) && /next_retry_at,\n  \}\);/.test(t),
  attemptIncrements: (t) => /const attempt = \(job\.attempt_count \|\| 0\) \+ 1;/.test(t),
  bounded: (t) => /export const MAX_ATTEMPTS = 3;/.test(t),
  configNeverMissing: (t) => !/error_class: 'source_missing'[\s\S]{0,120}preClaimFailure/.test(t),
  sourceMissingGuarded: (t) => /documentRead\.outcome === READ_OUTCOMES\.NOT_FOUND/.test(t),
  noSecondWorker: (t) => (t.match(/export async function processJob/g) || []).length === 1,
  noLedgerTruth: (t) => !/job\.(business_id|document_scope|profile_id)/.test(t),
  noFactWrite: (t) => !/\.from\('business_facts'\)/.test(t) && !/\.from\('business_fact_evidence'\)/.test(t),
  noSpecimen: (t) => SPECIMENS.every((id) => !t.includes(id)),
  noWaitUntil: (t) => !/waitUntil\s*\(/.test(t),
  noInternalsInNote: (t) => !/PGRST|postgrest|supabase|service[_ -]?role|rest\/v1/i.test(t),
};

const gitClean = (paths) => {
  try {
    execFileSync('git', ['diff', '--quiet', 'HEAD', '--', ...paths], { cwd: ROOT, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

async function main() {
  // ══ S1-S7 — ONE normalizer, used by BOTH paths ═════════════════════════════
  const N = normalize;
  check('EXECUTED', 'S1', 'a bare project URL normalizes to itself', N('https://project.supabase.co') === 'https://project.supabase.co', N('https://project.supabase.co'));
  check('EXECUTED', 'S2', 'a trailing slash normalizes away', N('https://project.supabase.co/') === 'https://project.supabase.co', N('https://project.supabase.co/'));
  check('EXECUTED', 'S3', '/rest/v1 normalizes to the project root', N('https://project.supabase.co/rest/v1') === 'https://project.supabase.co', N('https://project.supabase.co/rest/v1'));
  check('EXECUTED', 'S4', '/rest/v1/ (the production value) normalizes to the project root', N('https://project.supabase.co/rest/v1/') === 'https://project.supabase.co', N('https://project.supabase.co/rest/v1/'));
  check('EXECUTED', 'S4', 'auth/storage paths and deeper REST paths normalize too, and nothing else is touched', N('https://project.supabase.co/storage/v1/object/x') === 'https://project.supabase.co' && N('https://project.supabase.co/rest/v1/documents?select=id') === 'https://project.supabase.co' && N('') === '' && N(undefined) === '');
  check('EXECUTED', 'S4', 'an unknown value is not rewritten into a different URL', N('https://example.test/base') === 'https://example.test/base', N('https://example.test/base'));
  check('STATIC', 'S5', 'the upload builds its project URL through the shared normalizer', Pred.uploadUsesShared(S.upload));
  check('STATIC', 'S6', 'the worker builds its project URL through the shared normalizer', Pred.workerUsesShared(S.workerFn));
  {
    const implementations = [S.normalizer, S.orchestration, S.workerFn, S.upload].filter((t) => /rest\\\/v1/.test(t));
    check('STATIC', 'S7', 'no duplicate normalization implementation exists in the ingestion slice', implementations.length === 1 && implementations[0] === S.normalizer && (S.normalizer.match(/API_PATH_SEGMENT =/g) || []).length === 1, `${implementations.length}`);
    check('STATIC', 'S7', 'both consumers import the ONE shared module', /import \{ normalizeSupabaseProjectUrl \} from '..\/..\/shared\/supabase\/projectUrl.ts';/.test(S.upload) && /import \{ normalizeSupabaseProjectUrl \} from '..\/..\/shared\/supabase\/projectUrl.ts';/.test(S.workerFn));
  }

  // ══ S8-S14 — canonical read semantics ═════════════════════════════════════
  const found = await run();
  check('EXECUTED', 'S8', 'a successful row read is FOUND and the run proceeds', found.outcome.decision === 'completed' && found.calls.understanding.length === 1, found.outcome.decision);
  const missing = await run({ documents: [], analysis: [ANA({ document_id: 'doc-gone' })] });
  check('EXECUTED', 'S9', 'a successful zero-row read is NOT_FOUND', missing.outcome.decision === 'failed' && missing.outcome.error_class === 'source_missing' && lastJobPatch(missing).last_error_class === 'source_missing', `${missing.outcome.decision}/${lastJobPatch(missing).last_error_class}`);

  const qErr = {};
  for (const [k, err] of Object.entries(QUERY_ERRORS)) {
    qErr[k] = await run({ reads: { documents: { error: err } } });
  }
  check('EXECUTED', 'S10', 'PGRST125 is a QUERY_ERROR, never a missing row', lastJobPatch(qErr.pgrst125).last_error_class !== 'source_missing' && lastJobPatch(qErr.pgrst125).last_error_class === 'configuration_error', lastJobPatch(qErr.pgrst125).last_error_class);
  const networkThrow = await run({ reads: { documents: { throws: new Error('fetch failed') } } });
  check('EXECUTED', 'S11', 'a thrown transport failure is a QUERY_ERROR', networkThrow.outcome.decision === 'retry' && lastJobPatch(networkThrow).last_error_class === 'transient', `${networkThrow.outcome.decision}/${lastJobPatch(networkThrow).last_error_class}`);
  check('EXECUTED', 'S12', 'a 5xx is a QUERY_ERROR', qErr.fivexx.outcome.decision === 'retry' && lastJobPatch(qErr.fivexx).last_error_class === 'transient', `${qErr.fivexx.outcome.decision}/${lastJobPatch(qErr.fivexx).last_error_class}`);
  check('EXECUTED', 'S13', 'QUERY_ERROR never becomes source_missing', [qErr.pgrst125, qErr.network, qErr.fivexx, qErr.auth, networkThrow].every((r) => lastJobPatch(r).last_error_class !== 'source_missing' && !/source_missing/.test(String(lastJobPatch(r).last_error_message))));
  check('EXECUTED', 'S14', 'NOT_FOUND may become source_missing (and did)', missing.outcome.decision === 'failed' && lastJobPatch(missing).last_error_class === 'source_missing');

  // ══ S15-S20 — transient infrastructure uses the durable retry system ══════
  check('EXECUTED', 'S15', 'a transient query error enters the retry classifier', qErr.fivexx.outcome.error_class === 'transient' && qErr.fivexx.outcome.decision === 'retry');
  check('EXECUTED', 'S16', 'a transient query error schedules a retry instead of failing', lastJobPatch(qErr.fivexx).status === 'waiting_retry' && qErr.fivexx.outcome.decision === 'retry');
  check('EXECUTED', 'S17', 'next_retry_at is persisted (and the job is reclaimable when due)', typeof lastJobPatch(qErr.fivexx).next_retry_at === 'string' && Date.parse(lastJobPatch(qErr.fivexx).next_retry_at) > Date.parse('2026-10-04T22:00:00.000Z'));
  {
    const due = await found.mods.findDueJobs({ base44: makeBase44([JOB({ status: 'waiting_retry', attempt_count: 1, next_retry_at: '2026-10-04T21:00:00.000Z' })]), now: '2026-10-04T22:00:00.000Z' });
    check('EXECUTED', 'S17', 'recovery can reclaim the scheduled retry', due.length === 1);
  }
  check('EXECUTED', 'S18', 'a pre-claim attempt increments the attempt counter', lastJobPatch(qErr.fivexx).attempt_count === 1, String(lastJobPatch(qErr.fivexx).attempt_count));
  const third = await run({ job: JOB({ attempt_count: 2 }), reads: { documents: { error: QUERY_ERRORS.fivexx } } });
  check('EXECUTED', 'S19', 'max attempts are enforced (attempt 3 of 3 is terminal)', third.outcome.decision === 'failed' && third.outcome.attempt_count === 3 && lastJobPatch(third).last_error_class === 'transient_exhausted', `${third.outcome.decision}/${lastJobPatch(third).last_error_class}`);
  check('EXECUTED', 'S20', 'an exhausted transient failure is a truthful failed state, and the canonical row states processing did not finish', lastJobPatch(third).status === 'failed' && analysisWrites(third).some((w) => (w.payload || {}).analysis_status === 'needs_classification'));
  check('EXECUTED', 'S20', 'a transient failure is never terminal on its first attempt', qErr.fivexx.outcome.decision !== 'failed');

  // ══ S21-S23 — source_missing is earned, never assumed ════════════════════
  check('EXECUTED', 'S21', 'a configuration error never becomes source_missing', lastJobPatch(qErr.pgrst125).last_error_class === 'configuration_error' && !/source_missing/.test(String(lastJobPatch(qErr.pgrst125).last_error_message)), String(lastJobPatch(qErr.pgrst125).last_error_message));
  check('EXECUTED', 'S21', 'a configuration error is terminal, not retried forever', qErr.pgrst125.outcome.decision === 'failed' && lastJobPatch(qErr.pgrst125).next_retry_at === null);
  check('STATIC', 'S22', 'source_missing requires a SUCCESSFUL canonical read that found nothing', Pred.sourceMissingGuarded(S.orchestration) && Pred.readErrorNeverNull(S.orchestration));
  const absentSource = await run({ documents: [DOC({ file_path: null, file_url: null })] });
  check('EXECUTED', 'S22', 'a proven-absent source coordinate set is source_missing; an unreadable-but-present source is not', absentSource.outcome.error_class === 'source_missing' && lastJobPatch(absentSource).last_error_class === 'source_missing' && lastJobPatch(qErr.fivexx).last_error_class !== 'source_missing');
  {
    const signFail = await run({ storageError: { message: 'storage unavailable', statusCode: 503 } });
    check('EXECUTED', 'S22', 'a signed-URL/storage failure is transient (retry), not source_missing', signFail.outcome.decision === 'retry' && lastJobPatch(signFail).last_error_class === 'transient', `${signFail.outcome.decision}/${lastJobPatch(signFail).last_error_class}`);
  }
  check('EXECUTED', 'S23', 'the provider is NOT invoked before the canonical source is resolved', [qErr.pgrst125, qErr.network, qErr.fivexx, networkThrow].every((r) => r.calls.understanding.length === 0 && r.b44.core.length === 0));
  check('EXECUTED', 'S24', 'the provider IS invoked once the canonical source resolved', found.calls.understanding.length === 1 && found.b44.core.length === 1 && found.calls.understanding[0].signedUrl === 'https://signed.invalid/prof1/biz-a/1_1040.pdf');

  // ══ S25-S28 — nothing else was redesigned ════════════════════════════════
  check('GIT', 'S25', 'classification is untouched (taxonomy, signals, classifier, understanding, persistence)', gitClean([P.taxonomy, P.classifier, P.understanding, P.persister]));
  check('STATIC', 'S25', 'orchestration still invokes the ONE understanding engine and never classifies', Pred.classifierOwned(S.orchestration));
  check('GIT', 'S26', 'extraction is untouched', gitClean([P.extractEngine]));
  check('STATIC', 'S26', 'the reader route is honoured and extraction still runs on the canonical ids', /if \(!ingestion \|\| ingestion\.route_extraction !== true\)/.test(S.orchestration) && /documentType: document\.document_type/.test(S.orchestration) && found.calls.extraction.length === 1);
  check('EXECUTED', 'S27', 'business_id comes from the canonical row and is never written by orchestration', found.calls.understanding[0].businessId === 'biz-a' && !touchedIdentity(found) && !touchedIdentity(qErr.fivexx));
  check('EXECUTED', 'S28', 'document_scope comes from the canonical row and is never written by orchestration', found.calls.understanding[0].document?.document_scope === 'business' && !touchedIdentity(found) && Pred.noLedgerTruth(S.orchestration));
  check('GIT', 'S28', 'the authorization spine is untouched', gitClean([P.docAccess, P.buckets, P.relationshipAccess, P.actor]));

  // ══ S29-S34 — durable architecture, security surface, fact freeze ═════════
  check('STATIC', 'S29', 'the entity trigger is unchanged (create on DocumentIngestionJob)', /"trigger_type":\s*"entity"/.test(S.wfIngestion) && /"entity_name":\s*"DocumentIngestionJob"/.test(S.wfIngestion) && /"events":\s*\[\s*"create"\s*\]/.test(S.wfIngestion) && /processDocumentIngestionJob/.test(S.wfIngestion));
  check('GIT', 'S29', 'the entity schema change is documentation only (same property keys)', (() => {
    try {
      const before = JSON.parse(execFileSync('git', ['show', 'HEAD:base44/entities/DocumentIngestionJob.jsonc'], { cwd: ROOT, encoding: 'utf8' }));
      const after = JSON.parse(S.entity);
      return JSON.stringify(Object.keys(before.properties)) === JSON.stringify(Object.keys(after.properties)) && JSON.stringify(Object.keys(before.rls)) === JSON.stringify(Object.keys(after.rls));
    } catch { return false; }
  })());
  check('STATIC', 'S30', 'recovery architecture is unchanged (scheduled, sweep-only, the SAME worker)', /"trigger_type":\s*"scheduled"/.test(S.wfRecovery) && /"sweep":\s*true/.test(S.wfRecovery) && /sweepJobs\(\{ sb, base44, now \}\)/.test(S.workerFn));
  check('STATIC', 'S31', 'waitUntil is absent from the whole ingestion slice', SLICE.every((t) => Pred.noWaitUntil(t)));
  check('STATIC', 'S32', 'the browser is not the worker', !/processDocumentIngestionJob/.test(S.dataRoom + S.uploadPage) && !/processDocumentIngestionJob/.test(S.pipelineHook));
  check('STATIC', 'S33', 'zero business_facts writes', SLICE.every((t) => !/\.from\('business_facts'\)/.test(t)));
  check('STATIC', 'S34', 'zero business_fact_evidence writes', SLICE.every((t) => !/\.from\('business_fact_evidence'\)/.test(t)));

  // ══ S35-S37 — the owner-facing failure semantics ══════════════════════════
  // The owner-facing sentence is read out of the shipped source with no regex, so
  // this harness cannot be defeated by its own escaping.
  const noteConstant = (t) => {
    const at = t.indexOf('PROCESSING_FAILED_NOTE =');
    if (at < 0) return '';
    const rest = t.slice(at);
    const candidates = [rest.indexOf('"'), rest.indexOf("'")].filter((i) => i >= 0).sort((a, b) => a - b);
    if (!candidates.length) return '';
    const quote = rest[candidates[0]];
    const end = rest.indexOf(quote, candidates[0] + 1);
    return end > candidates[0] ? rest.slice(candidates[0] + 1, end) : '';
  };
  const noteLiterals = [...S.feTypes.matchAll(/note:[ ]*'([^']*)'/g)].map((m) => m[1]);
  const labelLiterals = [...S.dataRoom.matchAll(/label:[ ]*'([^']*)'/g)].map((m) => m[1]);
  const infra = fe.resolveDocumentStates({ document_type: 'other', upload_status: 'pending_analysis', analysis_status: 'queued', created_at: '2026-10-04T20:00:00.000Z' });
  const stopped = fe.resolveDocumentStates({ document_type: 'other', upload_status: 'uploaded', analysis_status: 'needs_classification' });
  const ambiguous = fe.resolveDocumentStates({ document_type: 'other', upload_status: 'uploaded', analysis_status: 'needs_review' });
  check('STATIC', 'S35', 'no owner-facing surface exposes internal infrastructure detail',
    Pred.noInternalsInNote(noteConstant(S.feTypes))
    && noteLiterals.every(Pred.noInternalsInNote)
    && labelLiterals.every(Pred.noInternalsInNote)
    && S.feTypes.indexOf('PGRST125') < 0
    && S.dataRoom.indexOf('PGRST125') < 0
    && S.uploadPage.indexOf('PGRST125') < 0,
    noteConstant(S.feTypes) + ' | ' + noteLiterals.join(' · '));
  check('EXECUTED', 'S35', 'the owner is never shown the raw provider/HTTP error', !/PGRST|rest\/v1|supabase|service[_ -]?role/i.test(`${infra.note} ${stopped.note} ${ambiguous.note}`));
  check('EXECUTED', 'S36', 'genuine classification ambiguity keeps its own message', /confirmation/i.test(ambiguous.note || '') && ambiguous.analysis === 'needs_review', ambiguous.note);
  check('EXECUTED', 'S37', 'an infrastructure processing failure gets a DIFFERENT, truthful message', infra.note === fe.PROCESSING_FAILED_NOTE && stopped.note === fe.PROCESSING_FAILED_NOTE && infra.note !== ambiguous.note, `${infra.note} | ${ambiguous.note}`);
  check('EXECUTED', 'S37', 'the truthful message says processing did not finish (never a verdict about the type)', /couldn't finish processing/i.test(infra.note || '') && !/could not determine/i.test(infra.note || ''));
  check('EXECUTED', 'S37', 'the production symptom (stale queued run) resolves to the truthful failure, not the ambiguity message', fe.resolveDocumentStates({ document_type: 'other', upload_status: 'pending_analysis', status: 'uploaded', analysis_status: 'queued', created_at: '2026-10-04T20:00:00.000Z' }).note === fe.PROCESSING_FAILED_NOTE);

  // ══ S38-S40 — preserved contracts ════════════════════════════════════════
  const decided = await run({ understanding: () => ({ route_extraction: false, result: { document_type: 'w2', applied_document_type: 'w2', unresolved_reason: null } }) });
  check('EXECUTED', 'S38', 'a real classification decision still completes (recognized / no reader)', decided.outcome.decision === 'completed' && decided.calls.extraction.length === 0);
  check('EXECUTED', 'S38', 'an unresolved READ (no_content_access / classification_unavailable) is not completed: it retries', await (async () => {
    const a = await run({ understanding: () => ({ route_extraction: false, result: { document_type: 'other', unresolved_reason: 'no_content_access' } }) });
    const b = await run({ understanding: () => ({ route_extraction: false, result: { document_type: 'other', unresolved_reason: 'classification_unavailable' } }) });
    return a.outcome.decision === 'retry' && b.outcome.decision === 'retry' && lastJobPatch(a).status === 'waiting_retry';
  })());
  check('EXECUTED', 'S38', 'a genuine content-read verdict (no evidence / family only) is NOT retried', await (async () => {
    const a = await run({ understanding: () => ({ route_extraction: false, result: { document_type: 'other', unresolved_reason: 'no_content_evidence' } }) });
    return a.outcome.decision === 'completed';
  })());
  check('EXECUTED', 'S39', 'a genuine missing document stays terminal, immediately', missing.outcome.decision === 'failed' && lastJobPatch(missing).next_retry_at === null && lastJobPatch(missing).attempt_count === undefined && missing.calls.understanding.length === 0);
  check('STATIC', 'S40', 'exactly ONE canonical worker remains', Pred.noSecondWorker(S.orchestration) && (S.workerFn.match(/processJob\(/g) || []).length === 1 && !/recoverDocumentIngestionJobs/.test(S.workerFn));
  check('STATIC', 'S40', 'the worker still derives document/business/scope from canonical records and nothing else', /const businessId = document\.business_id \|\| null;/.test(S.orchestration) && /const profileId = document\.profile_id \|\| null;/.test(S.orchestration) && Pred.noLedgerTruth(S.orchestration));
  check('STATIC', 'S40', 'the attempt invariant is documented on the ledger', /configuration_error, source_missing or relationship_mismatch/.test(S.entity) && /configuration_error/.test(S.entity));
  check('STATIC', 'S40', 'neither production specimen appears anywhere in the slice', SLICE.every(Pred.noSpecimen));

  // ══ SM1-SM25 — every mutation must be CAUGHT ══════════════════════════════
  const mut = (src, find, replace) => src.split(find).join(replace);
  const caught = (id, label, ok) => check('MUTATION', id, label, ok === true, ok === true ? '' : 'mutation not caught');

  caught('SM1', 'the worker using the raw env URL is caught', Pred.workerUsesShared(mut(S.workerFn, "normalizeSupabaseProjectUrl(secrets.get('VITE_SUPABASE_URL'))", "secrets.get('VITE_SUPABASE_URL')")) === false);
  caught('SM2', 'the upload using a private normalizer is caught', Pred.uploadUsesShared(mut(S.upload, "normalizeSupabaseProjectUrl(Deno.env.get('VITE_SUPABASE_URL'))", "(Deno.env.get('VITE_SUPABASE_URL') || '').replace(/\\/(rest\\/v1\\/?).*$/, '').replace(/\\/$/, '')")) === false);
  caught('SM3', 'the worker using a private normalizer is caught', Pred.workerUsesShared(mut(S.workerFn, "normalizeSupabaseProjectUrl(secrets.get('VITE_SUPABASE_URL'))", "String(secrets.get('VITE_SUPABASE_URL')).replace(/\\/$/, '')")) === false);
  caught('SM4', '/rest/v1 no longer stripped is caught', loadNormalizer(mut(S.normalizer, 'const API_PATH_SEGMENT = /\\/(rest\\/v1\\/?|auth\\/v1\\/?|storage\\/v1\\/?).*$/;', 'const API_PATH_SEGMENT = /\\/(auth\\/v1\\/?|storage\\/v1\\/?).*$/;'))('https://project.supabase.co/rest/v1/') !== 'https://project.supabase.co');
  caught('SM5', 'trailing-slash handling loss is caught', mut(S.normalizer, NORMALIZER_TRAILING_STRIP, NORMALIZER_TRAILING_STRIP_LOST) !== S.normalizer && loadNormalizer(mut(S.normalizer, NORMALIZER_TRAILING_STRIP, NORMALIZER_TRAILING_STRIP_LOST))('https://project.supabase.co/') !== 'https://project.supabase.co');
  {
    const m = mut(S.orchestration, 'if (!documentRead.ok) {\n    return preClaimFailure({ jobs, sb, job, now, stage: \'source_read_documents\', err: documentRead.error });\n  }', 'if (!documentRead.ok && documentRead.outcome !== READ_OUTCOMES.QUERY_ERROR) {\n    return preClaimFailure({ jobs, sb, job, now, stage: \'source_read_documents\', err: documentRead.error });\n  }');
    const r = await run({ reads: { documents: { error: QUERY_ERRORS.pgrst125 } }, compile: loadOrchestration(m) });
    caught('SM6', 'a query error collapsing into a null row is caught', r.outcome.decision !== 'retry' && lastJobPatch(r).last_error_class === 'source_missing');
  }
  {
    const m = mut(S.orchestration, "last_error_class: failure.error_code || 'permanent',", "last_error_class: 'source_missing',");
    const r = await run({ reads: { documents: { error: QUERY_ERRORS.pgrst125 } }, compile: loadOrchestration(m) });
    caught('SM7', 'PGRST125 becoming source_missing is caught', lastJobPatch(r).last_error_class === 'source_missing');
  }
  {
    const m = mut(S.orchestration, 'catch (err: any) {\n    return failed(err);\n  }', 'catch (err: any) {\n    return { ok: true, outcome: READ_OUTCOMES.NOT_FOUND, row: null, error: null };\n  }');
    const r = await run({ reads: { documents: { throws: new Error('fetch failed') } }, compile: loadOrchestration(m) });
    caught('SM8', 'a network error becoming source_missing is caught', lastJobPatch(r).last_error_class === 'source_missing');
  }
  {
    const m = mut(S.orchestration, 'if (res?.error) return failed(res.error);', 'if (res?.error) return { ok: true, outcome: READ_OUTCOMES.NOT_FOUND, row: null, error: null };');
    const r = await run({ reads: { documents: { error: QUERY_ERRORS.fivexx } }, compile: loadOrchestration(m) });
    caught('SM9', 'a 5xx becoming source_missing is caught', lastJobPatch(r).last_error_class === 'source_missing');
  }
  {
    const m = mut(S.orchestration, 'if (attempt >= MAX_ATTEMPTS) {', 'if (true) {');
    const r = await run({ reads: { documents: { error: QUERY_ERRORS.fivexx } }, compile: loadOrchestration(m) });
    caught('SM10', 'a transient error becoming terminal immediately is caught', r.outcome.decision === 'failed' && lastJobPatch(r).status === 'failed');
  }
  {
    const m = mut(S.orchestration, 'last_error_message: message,\n    next_retry_at,\n    lease_expires_at: null,', 'last_error_message: message,\n    next_retry_at: null,\n    lease_expires_at: null,');
    const r = await run({ reads: { documents: { error: QUERY_ERRORS.fivexx } }, compile: loadOrchestration(m) });
    caught('SM11', 'a retry without next_retry_at is caught', lastJobPatch(r).next_retry_at === null);
  }
  {
    const m = mut(S.orchestration, 'status: JOB_STATES.WAITING_RETRY,\n    last_attempt_at: now,\n    attempt_count: attempt,', 'status: JOB_STATES.WAITING_RETRY,\n    last_attempt_at: now,\n    attempt_count: job.attempt_count || 0,');
    const r = await run({ reads: { documents: { error: QUERY_ERRORS.fivexx } }, compile: loadOrchestration(m) });
    caught('SM12', 'a retry that does not increment the attempt is caught', lastJobPatch(r).attempt_count === 0);
  }
  {
    const m = mut(S.orchestration, 'export const MAX_ATTEMPTS = 3;', 'export const MAX_ATTEMPTS = 1000000;');
    const r = await run({ job: JOB({ attempt_count: 2 }), reads: { documents: { error: QUERY_ERRORS.fivexx } }, compile: loadOrchestration(m) });
    caught('SM13', 'retries exceeding the maximum are caught', r.outcome.decision !== 'failed');
  }
  {
    const m = mut(S.orchestration, "return { error_class: 'permanent', error_code: 'configuration_error', message };", "return { error_class: 'permanent', error_code: 'source_missing', message };");
    const r = await run({ reads: { documents: { error: QUERY_ERRORS.pgrst125 } }, compile: loadOrchestration(m) });
    caught('SM14', 'a configuration error masquerading as a missing source is caught', lastJobPatch(r).last_error_class === 'source_missing');
  }
  caught('SM15', 'the owner seeing a raw PGRST125 is caught', Pred.noInternalsInNote(noteConstant(mut(S.feTypes, "export const PROCESSING_FAILED_NOTE =\n  \"VISION couldn't finish processing this document. Upload it again to retry.\";", 'export const PROCESSING_FAILED_NOTE = "PGRST125: Invalid path specified in request URL";'))) === false);
  caught('SM16', 'the owner seeing Supabase internals is caught', Pred.noInternalsInNote(noteConstant(mut(S.feTypes, "Upload it again to retry.\"", 'Upload it again to retry. (supabase rest/v1 service-role failure)"'))) === false);
  {
    const m = mut(S.feTypes, "export const PROCESSING_FAILED_NOTE =\n  \"VISION couldn't finish processing this document. Upload it again to retry.\";", 'export const PROCESSING_FAILED_NOTE = \'Needs your confirmation before analysis.\';');
    const mutated = resolverFrom(m);
    caught('SM17', 'ambiguity and infrastructure sharing one message is caught', mutated.resolveDocumentStates({ document_type: 'other', upload_status: 'uploaded', analysis_status: 'needs_classification' }).note === mutated.resolveDocumentStates({ document_type: 'other', upload_status: 'uploaded', analysis_status: 'needs_review' }).note);
  }
  {
    const m = mut(S.orchestration, "const job = await jobs.get(jobId).catch(() => null);", "const job = await jobs.get(jobId).catch(() => null);\n  await runIngestionUnderstanding({ documentId: 'x' });");
    const r = await run({ reads: { documents: { error: QUERY_ERRORS.fivexx } }, compile: loadOrchestration(m) });
    caught('SM18', 'invoking the provider before the canonical row is resolved is caught', r.calls.understanding.length > 0);
  }
  caught('SM19', 'reintroducing waitUntil is caught', Pred.noWaitUntil(mut(S.upload, 'const respond = Response.json', 'const __r = waitUntil(x);\n    const respond = Response.json')) === false && Pred.noWaitUntil(mut(S.workerFn, 'export default async function (req: Request): Promise<Response> {', 'export default async function (req: Request): Promise<Response> { waitUntil(x);')) === false);
  {
    const m = mut(S.orchestration, 'export async function findDueJobs', 'export async function processJobRetryShadow({ jobId }: any) { return processJob({ jobId }); } export async function findDueJobs');
    caught('SM20', 'a second worker path is caught', Pred.noSecondWorker(m) === false);
  }
  caught('SM21', 'trusting a ledger business_id is caught', Pred.noLedgerTruth(mut(S.orchestration, 'const businessId = document.business_id || null;', 'const businessId = job.business_id || null;')) === false);
  caught('SM22', 'trusting a ledger document_scope is caught', Pred.noLedgerTruth(mut(S.orchestration, 'const profileId = document.profile_id || null;', 'const profileId = document.profile_id || null; const __scope = job.document_scope;')) === false);
  caught('SM23', 'a business_facts write is caught', Pred.noFactWrite(mut(S.orchestration, 'const DOCUMENT_COLUMNS =', "const __f = () => sb.from('business_facts');\nconst DOCUMENT_COLUMNS =")) === false);
  caught('SM24', 'a business_fact_evidence write is caught', Pred.noFactWrite(mut(S.orchestration, 'const DOCUMENT_COLUMNS =', "const __e = () => sb.from('business_fact_evidence');\nconst DOCUMENT_COLUMNS =")) === false);
  caught('SM25', 'backfilling a historical specimen is caught', Pred.noSpecimen(mut(S.orchestration, 'const DOCUMENT_COLUMNS =', `const __bf = () => sb.from('documents').update({}).eq('id', '${SPECIMENS[0]}');\nconst DOCUMENT_COLUMNS =`)) === false);

  // ── Result ────────────────────────────────────────────────────────────────
  console.log('');
  const sChecks = results.filter((r) => /^S\d+$/.test(r.id));
  const smChecks = results.filter((r) => /^SM\d+$/.test(r.id));
  console.log(`S1-S40: ${sChecks.filter((c) => c.pass).length}/${sChecks.length} passed · SM1-SM25: ${smChecks.filter((c) => c.pass).length}/${smChecks.length} caught`);
  if (failures.length) {
    console.log(`FAILED — ${failures.length}`);
    failures.forEach((f) => console.log(`  · ${f}`));
    return { failures };
  }
  console.log(`PASSED — all ${results.length} checks (S1-S40, SM1-SM25).`);
  return { failures };
}

module.exports = { run: main };
if (require.main === module) {
  main()
    .then((r) => { if (r.failures.length) process.exit(1); })
    .catch((e) => { console.error(e); process.exit(1); });
}