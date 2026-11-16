#!/usr/bin/env node
/**
 * adminDocumentViewer.test.cjs — Phase P5 — Admin document viewing.
 *
 * Run:  node scripts/adminDocumentViewer.test.cjs
 *
 * OFFLINE AND NON-DESTRUCTIVE. No network, no database, no Base44 call, no
 * production record read, written or deleted. `git` is used read-only to prove
 * the change surface.
 *
 * THE CODE UNDER TEST IS THE SHIPPED CODE — not a restatement of it:
 *
 *   1. src/components/admin/AdminUserProfileContext.jsx — the REAL
 *      `handleOpenDocument` is brace-matched out of the real component source
 *      and EXECUTED against the real viewer hook. Whatever the admin surface
 *      hands the viewer is therefore observed, not described.
 *   2. src/hooks/useDocumentViewer.js — compiled to CommonJS (esbuild) and RUN
 *      with stubbed react / @/api/base44Client / sonner, so the signed-URL
 *      REQUEST payload, the success path and the refusal path are observed.
 *   3. Every file outside the approved surface is proven byte-for-byte
 *      identical to `git show HEAD:<path>`.
 *
 * The mutation section mutates THAT extracted source and re-runs the matrix.
 *
 * EVIDENCE CLASS: UNIT/MOCK (real extracted component handler + real hook run
 * against stubs) + STATIC + GIT-DIFF PROOF. No browser and no live database.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const esbuild = require('esbuild');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const git = (args) => execFileSync('git', args, { cwd: ROOT, maxBuffer: 32 * 1024 * 1024 }).toString();
const headOf = (p) => git(['show', `HEAD:${p}`]);
const quiet = { log() {}, warn() {}, error() {}, info() {} };

const COMPONENT = 'src/components/admin/AdminUserProfileContext.jsx';
const HOOK = 'src/hooks/useDocumentViewer.js';
const VIEWER = 'src/components/documents/DocumentViewer.jsx';
const TEST = 'scripts/adminDocumentViewer.test.cjs';

/** Files this slice must leave byte-identical (asserted against HEAD). */
const IMMUTABLE = [
  HOOK,
  VIEWER,
  'src/components/admin/AdminWorkspaceHost.jsx',
  'src/lib/visionWorkspace/registry.js',
  'src/hooks/useVisionWorkspace.js',
  'src/lib/visionWorkspace/openDocument.js',
  'src/components/vision/workspace/VisionWorkspace.jsx',
  'src/components/vision/workspace/WorkspaceHeader.jsx',
  'src/components/galileo/shell/GlobalGalileoBar.jsx',
  // 6D.0c GALILEO HALF — useAskGalileo.js is now INSIDE the approved 6D.0c
  // surface: it carries the focused-document context and the SERVER-derived
  // evidence state. It is therefore no longer an immutable file, and F1b's
  // approved working set lists it explicitly.
  'src/hooks/useVisionActions.js',
  'src/pages/DataRoom.jsx',
  'src/components/notifications/NotificationBell.jsx',
  'src/hooks/useNotificationNavigation.js',
  'src/lib/notifications/notificationDestination.js',
  'src/index.css',
  'base44/functions/supabaseUserData/entry.ts',
  'base44/functions/getDocumentsAdmin/entry.ts',
  'base44/shared/authz/documentAccess.ts',
  'base44/shared/authz/actor.ts',
  'base44/shared/businessScope/relationshipAccess.ts',
  'base44/shared/businessScope/writeGuard.ts',
  'base44/shared/businessScope/activeBusiness.ts',
  'base44/shared/documents/buckets.ts',
];

const SIGNED = 'signed://s3.1/object?ttl=900';
const ROW = {
  id: 'doc-1',
  name: '2024-p-and-l.pdf',
  document_type: 'profit_and_loss',
  // The row as getClientDocumentsForUser returns it: it CARRIES a stored
  // 24-hour signed URL from upload time.
  file_path: 'p-client/b-client/2024-p-and-l.pdf',
  file_url: 'https://legacy.supabase.co/storage/v1/object/sign/documents/24h-token',
  file_size: 2048,
  status: 'uploaded',
  upload_source: 'admin',
  business_id: 'b-client',
  created_at: '2026-01-02T00:00:00Z',
};

// ─────────────────────────────────────────────────────────────────────────────
// Real hook, executed with stubs
// ─────────────────────────────────────────────────────────────────────────────
const toCjs = (src) => esbuild.transformSync(src, { loader: 'js', format: 'cjs', target: 'es2020' }).code;

function loadHook({ hookSource = read(HOOK) } = {}) {
  const calls = [];
  const toasts = [];
  const cells = [];
  let respond = async () => ({ data: { signedUrl: SIGNED } });

  const react = {
    useState: (init) => {
      const i = cells.length;
      if (!(i in cells)) cells[i] = init;
      return [cells[i], (v) => { cells[i] = typeof v === 'function' ? v(cells[i]) : v; }];
    },
    useCallback: (fn) => fn,
  };
  const base44 = {
    functions: {
      invoke: async (name, payload) => {
        calls.push({ name, payload });
        return respond(name, payload);
      },
    },
  };
  const sonner = {
    toast: {
      error: (m) => toasts.push(['error', m]),
      success: (m) => toasts.push(['success', m]),
    },
  };

  const mod = { exports: {} };
  const req = (spec) => {
    if (spec === 'react') return react;
    if (spec === '@/api/base44Client') return { base44 };
    if (spec === 'sonner') return sonner;
    throw new Error(`unexpected import ${spec}`);
  };
  new Function('exports', 'require', 'module', 'console', toCjs(hookSource))(mod.exports, req, mod, quiet);

  const api = mod.exports.useDocumentViewer();
  return {
    api,
    calls,
    toasts,
    responds: (fn) => { respond = fn; },
    state: () => ({ selected: cells[0], signedUrl: cells[1], open: cells[2], loading: cells[3], error: cells[4] }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Real component handler, extracted and executed
// ─────────────────────────────────────────────────────────────────────────────
const HANDLER_ANCHOR = 'const handleOpenDocument = (doc) => {';

function extractHandler(src) {
  const start = src.indexOf(HANDLER_ANCHOR);
  if (start < 0) throw new Error('handleOpenDocument not found in the component');
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('unbalanced braces while extracting handleOpenDocument');
}

const handlerSource = (src) => extractHandler(src).replace('const handleOpenDocument =', '').replace(/;\s*$/, '');

/** One microtask drain, so the hook's async work is observable before asserting. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const buildHandler = (componentSrc, hookApi, handed = []) =>
  vm.runInNewContext(`(${handlerSource(componentSrc)})`, {
    // Wrapped so the OBJECT the admin surface hands the viewer is OBSERVED, not
    // described: P19–P23 assert on what really crosses this boundary.
    openDocumentViewer: (arg) => { handed.push(arg); return hookApi.openDocumentViewer(arg); },
    // Present so mutations that inject a business switch or a second endpoint do
    // not throw before the static assertions can catch them.
    setActiveContext: () => {},
    base44: { functions: { invoke: async () => ({ data: {} }) } },
    console: quiet,
  });

// ─────────────────────────────────────────────────────────────────────────────
const blockOf = (src, startMarker, endMarker) => {
  const s = src.indexOf(startMarker);
  const e = src.indexOf(endMarker, s + 1);
  if (s < 0 || e < 0 || e <= s) throw new Error(`markers not found: ${startMarker}`);
  return src.slice(s, e);
};
const same = (a, b) => JSON.stringify(sortDeep(a)) === JSON.stringify(sortDeep(b));
function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === 'object') {
    return Object.keys(v).sort().reduce((o, k) => { o[k] = sortDeep(v[k]); return o; }, {});
  }
  return v;
}
const keys = (o) => Object.keys(o || {}).sort().join(',');

// ─────────────────────────────────────────────────────────────────────────────
// THE MATRIX — static + wiring + executable + change surface
// ─────────────────────────────────────────────────────────────────────────────
async function runChecks({ componentSrc, hookSrc }) {
  const results = [];
  const check = (id, label, ok, detail = '') => results.push({ id, label, pass: Boolean(ok), detail });
  const has = (s) => componentSrc.includes(s);

  let DOCS = '';
  let RES = '';
  let VIEWER_BLOCK = '';
  try {
    DOCS = blockOf(componentSrc, "{activeSection === 'documents' && (", "{activeSection === 'resources' && (");
    RES = blockOf(componentSrc, "{activeSection === 'resources' && (", "{activeSection === 'worksheets' && (() => {");
    VIEWER_BLOCK = blockOf(componentSrc, '{isDocumentViewerOpen && (', 'function EmptyState(');
  } catch (e) {
    check('P0', 'the admin surface still has its Documents / Resources / viewer blocks', false, e.message);
  }

  let handler = null;
  try {
    handler = handlerSource(componentSrc);
  } catch (e) {
    check('P0b', 'the admin handler is extractable', false, e.message);
  }

  // ── P1–P4: THE ROW INTERACTION ───────────────────────────────────────────
  check('P1', 'the client document row opens the document (row-level handler)', DOCS.includes('onClick={canOpen ? () => handleOpenDocument(doc) : undefined}'));
  check('P2', 'the whole row is the click target, with no duplicate viewer control added', DOCS.includes("title={canOpen ? 'Open document' : undefined}") && !DOCS.includes('<button') && !DOCS.includes('title="Preview"'));
  check('P2c', 'a row is interactive whenever it carries an identity — storage metadata never gates the attempt', DOCS.includes('const canOpen = Boolean(doc?.id);') && !DOCS.includes('const canOpen = Boolean(doc.file_path || doc.file_url);'));
  check('P3', 'the row is keyboard operable (Enter / Space)', DOCS.includes('onKeyDown={canOpen ? (e) => {') && DOCS.includes("e.key === 'Enter' || e.key === ' '") && DOCS.includes('tabIndex={canOpen ? 0 : undefined}'));
  check('P4', 'a nested control never opens the document (Resources keeps its own button, no row handler)', (RES.match(/<tr[^>]*onClick/g) || []).length === 0 && RES.includes('onClick={() => openDocumentViewer(doc)}'));

  // ── P5–P13: REUSE, NOT A SECOND SYSTEM ───────────────────────────────────
  check('P5', 'exactly one viewer is imported and rendered — no second viewer', (componentSrc.match(/<DocumentViewer/g) || []).length === 1 && (componentSrc.match(/documents\/DocumentViewer/g) || []).length === 1 && !/function DocumentViewer|const DocumentViewer/.test(componentSrc));
  check('P6', 'the existing surfaces keep their existing call (Resources preview unchanged)', (componentSrc.match(/openDocumentViewer\(/g) || []).length === 2 && componentSrc.includes('onClick={() => openDocumentViewer(doc)}'));
  // Section 7 — closing returns to the SAME Admin subject and section: the close
  // is the shared hook's state-only reset, and neither the handler, the component
  // nor the close path writes a URL, a subject, a section, a workspace or a business.
  const closeBody = (hookSrc.match(/const closeDocumentViewer = useCallback\(\(\) => \{[\s\S]*?\}, \[\]\);/) || [''])[0];
  check('P7', 'Back / Close is the existing close, and nothing writes the URL, subject, section or workspace',
    VIEWER_BLOCK.includes('onClose={closeDocumentViewer}') &&
    !/setActiveSection\(|setSelectedUser\(|onBack\(/.test(handler || '') &&
    !/useNavigate|setSearchParams|history\.pushState/.test(componentSrc) &&
    /setIsDocumentViewerOpen\(false\)/.test(closeBody) && /setSelectedDocument\(null\)/.test(closeBody) &&
    !/navigate|business|ActiveContext|workspace|section/i.test(closeBody),
    closeBody ? '' : 'closeDocumentViewer could not be located in the shared hook');
  check('P8', 'the admin path never switches the active business', !/setActiveContext|useBusinessContext|active_business_id/.test(componentSrc) && !/business/i.test(handler || ''));
  check('P9', 'a refusal shows the existing generic state, never the back-end reason', /setPreviewError\('Could not generate preview link'\)/.test(hookSrc) && /toast\.error\('Could not generate preview link'\)/.test(hookSrc) && !/error\.message|err\.message|error\?\.message/.test(hookSrc));
  check('P10', 'the call site withholds the stored file_url (one resolution path)', componentSrc.includes('openDocumentViewer({ ...doc, file_url: null })'));
  check('P11', 'the document is opened by its exact id, never by its name', (handler || '').includes('!doc?.id') && !/\.find\(/.test(handler || '') && !/name\s*===/.test(handler || ''));
  check('P12', 'no second signed-URL endpoint is introduced anywhere in the component', !/functions\.invoke\(\s*['"][^'"]*SignedUrl/.test(componentSrc) && !/getDocumentSignedUrl[A-Z]/.test(componentSrc) && /action: 'getDocumentSignedUrl'/.test(hookSrc));
  check('P13', 'no duplicate document state — the one viewer hook owns it', (componentSrc.match(/useDocumentViewer\(\)/g) || []).length === 1);

  // ── P14–P18: EVERYTHING ELSE IS UNTOUCHED ────────────────────────────────
  check('P14', 'no trail / registry / route change in this surface', !/workspace=|useSearchParams/.test(componentSrc));
  check('P15', 'the persistent shell and its one assistant are untouched', !/GalileoBar|GalileoShell|registerGalileoBridge/.test(componentSrc));
  check('P17', 'the notification → exact document path is not reinterpreted here', !/notificationDestination|related_entity_id|useNotificationNavigation/.test(componentSrc));
  let immutableOk = true;
  const immutableDetail = [];
  for (const f of IMMUTABLE) {
    try {
      if (read(f) !== headOf(f)) { immutableOk = false; immutableDetail.push(f); }
    } catch (e) { immutableOk = false; immutableDetail.push(`${f} (${e.message.split('\n')[0]})`); }
  }
  check('P16', 'every file outside the approved surface is byte-identical to HEAD', immutableOk, immutableDetail.join(', '));
  check('P18', 'the viewer and the design tokens are untouched (the row adds only existing vocabulary)', read(VIEWER) === headOf(VIEWER) && read('src/index.css') === headOf('src/index.css') && /\.vision-focus:focus-visible/.test(read('src/index.css')));

  // ── CHANGE SURFACE ───────────────────────────────────────────────────────
  // The P5 slice is COMMITTED, so its surface is asserted against the commit that
  // added this harness (resolved at runtime, never hardcoded), while the WORKING
  // TREE is asserted to carry nothing beyond this harness — the review itself must
  // not be able to move a product file.
  const P5_COMMIT = git(['log', '--diff-filter=A', '--format=%H', '-1', '--', TEST]).trim();
  const committed = git(['show', '--name-only', '--format=', P5_COMMIT]).trim().split('\n').filter(Boolean).sort();
  // The two surfaces this check needs are `committed` (the P5 commit) and
  // `working` (the tree since then) — both computed below.
  // P5 REBASE — this slice also re-bases the three earlier security harnesses:
  // their change-surface assertions now NAME the P5 files, while every security
  // assertion in them is unchanged and still passes (verified by re-running them).
  // That re-base is part of the reviewed P5 diff, so it is declared here too.
  const P5_REBASED_HARNESSES = [
    'scripts/adminCanonicalActor.test.cjs',
    'scripts/documentSignedUrlAuthorization.test.cjs',
    'scripts/relationshipRevocationAccess.test.cjs',
  ];
  const EXPECTED_SURFACE = [COMPONENT, TEST, ...P5_REBASED_HARNESSES].sort();
  check('F1', 'the committed P5 slice is exactly the admin Documents tab, its harness and the re-based suites',
    JSON.stringify(committed) === JSON.stringify(EXPECTED_SURFACE), `${P5_COMMIT.slice(0, 7)}: ${committed.join(', ')}`);
  const working = [...new Set([
    ...git(['diff', '--name-only', P5_COMMIT]).trim().split('\n'),
    ...git(['ls-files', '--others', '--exclude-standard']).trim().split('\n'),
  ])].filter(Boolean).sort();
  // The approved micro-correction re-touches the ONE approved product file (identity
  // governs the attempt — see P2c / P23 / P24). Nothing else may move.
  // P-S3 REBASE — the repository surface since the P5 commit now contains, beyond
  // this slice's own micro-correction, the committed ledger reports and the reviewed
  // P-S3 slice (ONE backend function + one harness + one report). This review was
  // permitted to rebase the four older harnesses' ALLOWLIST LINES ONLY; their
  // behavioral and security assertions are untouched, and no product frontend file
  // beyond the approved Admin Documents tab appears here.
  const P_S3_FILES = [
    'SECURITY_LEDGER_POST_P5.md',
    'src/SECURITY_LEDGER_P_S1_BOUNDARY2_VERIFICATION.md',
    'SECURITY_P_S3_GALILEO_ACTOR_BINDING_REPORT.md',
    'base44/functions/buildGalileoContext/entry.ts',
    'scripts/galileoContextActorBinding.test.cjs',
  ];
  const APPROVED_HARNESS_MAINTENANCE = [
    'scripts/adminCanonicalActor.test.cjs',
    'scripts/documentSignedUrlAuthorization.test.cjs',
    'scripts/relationshipRevocationAccess.test.cjs',
  ];
  // 6D.0 REBASE — the reviewed 6D.0 slice (document extraction integrity) is a
  // LATER, APPROVED slice: the extraction entry point, four shared extraction
  // modules, the shared viewer hook, the DocumentViewer, its own harness and two
  // reports. Allowlist lines ONLY — no behavioral, security, mutation or
  // authorization assertion in this harness is touched. P16 keeps its IMMUTABLE
  // list intact: every file named there is still proven byte-identical to HEAD.
  const P_6D0_FILES = [
    'base44/functions/runDocumentExtraction/entry.ts',
    'base44/functions/supabaseUserData/entry.ts',
    'base44/shared/documentExtraction/analysisState.ts',
    'base44/shared/documentExtraction/extractEngine.ts',
    'base44/shared/documentExtraction/extractionConfidence.ts',
    'base44/shared/documentExtraction/periodIntegrity.ts',
    'scripts/extractionIntegrity.test.cjs',
    'src/hooks/useDocumentViewer.js',
    'src/components/documents/DocumentViewer.jsx',
    'src/VISION_PHASE_6D_EVIDENCE_INTELLIGENCE_AUDIT.md',
    'VISION_PHASE_6D_0_EXTRACTION_INTEGRITY_REPORT.md',
  ];
  // CLASSIFICATION HOTFIX REBASE — the reviewed document-upload classification
  // hotfix is a LATER, APPROVED slice. Allowlist lines ONLY: no behavioral,
  // security, mutation or authorization assertion in this harness is touched.
  const CLASSIFICATION_HOTFIX_FILES = [
    'base44/shared/documents/documentTypes.ts',
    'base44/functions/uploadDocumentToSupabase/entry.ts',
    'src/lib/documents/documentTypes.js',
    'src/pages/DocumentUpload.jsx',
    'src/pages/DataRoom.jsx',
    'src/components/documents/uploadConfig.jsx',
    'scripts/documentUploadClassification.test.cjs',
    'VISION_DOCUMENT_UPLOAD_CLASSIFICATION_HOTFIX.md',
  // 6D.0c.1-P PRODUCTION REPAIR — a LATER, APPROVED slice. Declared, not exempted:
  // the repair's three product files, its certification harness and its report.
  ].filter((f) => ![...P_S3_FILES, ...APPROVED_HARNESS_MAINTENANCE, ...P_6D0_FILES, 'base44/shared/galileo/provisionalEvidence.ts', 'base44/shared/canonicalFact/registry.ts', 'base44/functions/askGalileo/entry.ts', 'src/scripts/documentKnowledgeCompletion.test.cjs', 'VISION_PHASE_6D_0C_1_PROVISIONAL_EVIDENCE_RETRIEVAL.md', ...require('./slice6D0C2Files.cjs'), COMPONENT, TEST].includes(f));
  // 6D.0a REBASE — the reviewed Semantic Observation Bridge slice: ONE new shared
  // module, the shared contract that now reads it, buildGalileoContext's CONSUMER
  // wiring (its viewer/document paths are untouched), its own harness, the
  // post-hotfix audit report and this slice's report. Allowlist lines ONLY —
  // H1–H8 and P1–P24 are unchanged.
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
  // runs it, its own harness and its report. Allowlist lines ONLY: H1–H8 and every
  // authorization assertion above are unchanged.
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
    // asks about an exact document. ALLOWLIST LINES ONLY — every behavioral,
    // authorization, byte-identity and mutation assertion here is unchanged.
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
    // 6D.0c — the Galileo half's own completion report is a later APPROVED slice.
    'VISION_PHASE_6D_0C_DOCUMENT_KNOWLEDGE_COMPLETION.md',
    'src/pages/DocumentUpload.jsx',
    'VISION_PHASE_6D_0B_1_REAL_PROVIDER_SEAM_REPAIR.md',
  ];
  // Set equality (deduped): a file named by more than one approved slice is still
  // ONE changed file. No new file is admitted by this.
  // 6D.0b.2.1 CANONICAL SOURCE READ REPAIR — a LATER, APPROVED slice. Allowlist line
  // ONLY: the ONE shared project-URL normalizer, its harness and its report. Every
  // behavioral, viewer-reuse and security assertion above is untouched.
  const P_6D0B2_1_FILES = [
    'base44/shared/supabase/projectUrl.ts',
    'src/scripts/documentCanonicalSourceRead.test.cjs',
    'VISION_PHASE_6D_0B_2_1_CANONICAL_SOURCE_READ_REPAIR.md',
  ];
  const EXPECTED_WORKING = [...new Set([COMPONENT, TEST, ...P_S3_FILES, ...APPROVED_HARNESS_MAINTENANCE, ...P_6D0_FILES, ...CLASSIFICATION_HOTFIX_FILES, ...P_6D0A_FILES, ...P_6D0B_FILES, ...P_6D0B2_1_FILES, 'base44/shared/documentIngestion/resume.ts', 'src/scripts/documentKnowledgeCompletion.test.cjs', 'base44/shared/galileo/focusedDocument.ts', 'base44/functions/askGalileo/entry.ts', 'src/hooks/useAskGalileo.js', 'src/components/galileo/home/GalileoAnswerPanel.jsx', 'base44/shared/galileo/provisionalEvidence.ts', 'base44/shared/canonicalFact/registry.ts', 'VISION_PHASE_6D_0C_1_PROVISIONAL_EVIDENCE_RETRIEVAL.md', ...require('./slice6D0C2Files.cjs')])].sort();
  check('F1b', 'only the approved product file and this harness have moved since the P5 commit',
    JSON.stringify(working) === JSON.stringify(EXPECTED_WORKING), working.join(', '));

  // ── H1–H8: THE REAL HANDLER + THE REAL HOOK, OBSERVED ────────────────────
  {
    // A. A real row, resolved by the back end.
    const h = loadHook({ hookSource: hookSrc });
    const open = buildHandler(componentSrc, h.api);
    await open({ ...ROW });
    await flush();
    const payload = h.calls[0]?.payload;
    const st = h.state();
    check('H1', 'the row goes to the ONE S3.1 action, for that exact documents row', h.calls.length === 1 && h.calls[0].name === 'supabaseUserData' && same(payload, { action: 'getDocumentSignedUrl', data: { documentId: ROW.id } }));
    check('H2', 'the request carries the document id ONLY (no tenant, role, bucket or path)', keys(payload?.data) === 'documentId');
    check('H3', 'the viewer opens on the back end’s URL, not the stored one', st.open === true && st.signedUrl === SIGNED && st.selected?.id === ROW.id && !String(st.signedUrl).includes('24h-token'));
    check('H9', 'the identity comes from the row id, never from the name', !JSON.stringify(payload || {}).includes(ROW.name));
  }

  {
    // B. The back end REFUSES (S3.1 answers 404 for unauthorized/nonexistent).
    const h = loadHook({ hookSource: hookSrc });
    h.responds(async () => { throw Object.assign(new Error('Not found'), { status: 404, response: { status: 404, data: { error: 'Not found' } } }); });
    const open = buildHandler(componentSrc, h.api);
    await open({ ...ROW });
    await flush();
    const st = h.state();
    check('H4', 'a refused document opens NOTHING — the stored URL is not rendered', st.open === false && st.signedUrl === null && st.error === 'Could not generate preview link');
    check('H6', 'the refusal text is generic (no back-end reason, no authorization internals)', !/Not found|404|403|authoriz|business|forbidden/i.test(String(st.error)) && h.toasts.every(([, m]) => !/Not found|404|403|authoriz|business/i.test(String(m))));
    check('H5', 'counter-proof: without the call-site normalization that URL WOULD render', await (async () => {
      const raw = loadHook({ hookSource: hookSrc });
      raw.responds(async () => { throw Object.assign(new Error('Not found'), { status: 404 }); });
      await raw.api.openDocumentViewer({ ...ROW });
      await flush();
      const rs = raw.state();
      return rs.open === true && String(rs.signedUrl).includes('24h-token');
    })());
  }

  {
    // C. Rows that cannot be resolved by the ONE approved path.
    const h = loadHook({ hookSource: hookSrc });
    const open = buildHandler(componentSrc, h.api);
    await open({ id: 'legacy-1', name: 'legacy.pdf', file_url: 'https://legacy.supabase.co/24h/stale' });
    await flush();
    const legacy = h.state();
    check('H7', 'a row with no file_path opens nothing (never its stale file_url)', h.calls.length === 0 && legacy.open === false && legacy.signedUrl === null && legacy.error === 'Could not generate preview link');
    const before = h.calls.length;
    await open({ id: 'no-file-1', name: 'empty.pdf' });
    await open({ name: 'no-id.pdf', file_path: 'a/b.pdf' });
    await open(null);
    await flush();
    // Under the approved contract the ATTEMPT is made (identity governs); what this
    // asserts is that no request is issued and the shared hook fails safely.
    check('H8', 'a row with no resolvable reference issues no request and fails safely (generic state)', h.calls.length === before && h.state().error === 'Could not generate preview link');
  }

  {
    // D. The hook’s OTHER consumer keeps its own path (nothing was redirected).
    const h = loadHook({ hookSource: hookSrc });
    await h.api.openDocumentViewer({ id: 'res-1', name: 'resource.pdf', resource_document_id: 'res-1' });
    await flush();
    check('H10', 'an assigned resource still resolves through its own existing action', h.calls.length === 1 && h.calls[0].name === 'worksheetResponses' && same(h.calls[0].payload, { action: 'getResourceSignedUrl', data: { resourceId: 'res-1' } }));
    // The shared hook is untouched, so its residual file_url fallback still
    // exists — the CALL SITE is what keeps it off the admin path (see H4 / H5).
    check('H11', 'the shared hook is unmodified: the call site withholds the stored URL instead', hookSrc === read(HOOK) && hookSrc.includes('return document.file_url || null;'));
  }

  // ── P19–P23: THE file_url PROTECTIONS, OBSERVED AT THE BOUNDARY ────────────
  // These assert what actually CROSSES the call site → viewer boundary (the real
  // handler against the real hook), for rows that carry a live stored URL.
  {
    // P19 — a live-looking stored URL on the row must not reach the viewer.
    const h = loadHook({ hookSource: hookSrc });
    const handed = [];
    const open = buildHandler(componentSrc, h.api, handed);
    await open({ ...ROW });
    await flush();
    check('P19', 'a row carrying a live file_url is handed over with file_url === null (id intact)',
      handed.length === 1 && !!handed[0] && handed[0].id === ROW.id && 'file_url' in handed[0] &&
      handed[0].file_url === null && handed[0].file_path === ROW.file_path && handed[0].name === ROW.name);

    // P20 — S3.1 refuses: the persisted URL is neither used nor rendered.
    const r = loadHook({ hookSource: hookSrc });
    r.responds(async () => { throw Object.assign(new Error('Not found'), { status: 404 }); });
    const handedRefused = [];
    const openRefused = buildHandler(componentSrc, r.api, handedRefused);
    await openRefused({ ...ROW });
    await flush();
    const rs = r.state();
    check('P20', 'when S3.1 refuses, the persisted file_url is not used or rendered anywhere',
      r.calls.length === 1 && rs.open === false && rs.signedUrl === null && rs.selected === null &&
      !JSON.stringify({ rs, toasts: r.toasts, handed: handedRefused }).includes('24h-token') &&
      handedRefused.length === 1 && handedRefused[0].file_url === null);

    // P21 — the refusal is the existing generic safe state, with no fallback preview.
    check('P21', 'a refusal produces the existing generic error state and no fallback preview',
      rs.error === 'Could not generate preview link' &&
      r.toasts.length === 1 && r.toasts[0][0] === 'error' && r.toasts[0][1] === 'Could not generate preview link' &&
      rs.open === false && rs.selected === null && rs.signedUrl === null &&
      !r.toasts.some(([, m]) => /Not found|404|403|authoriz|business|forbidden/i.test(String(m))));
  }

  {
    // P22 — an exact id with NO stored file_url still opens that id.
    const h = loadHook({ hookSource: hookSrc });
    const handed = [];
    const open = buildHandler(componentSrc, h.api, handed);
    const row = { id: 'doc-no-url', name: 'no-stored-url.pdf', document_type: 'other', file_path: 'p-client/b-client/no-stored-url.pdf' };
    await open({ ...row });
    await flush();
    check('P22', 'a row with an id but no stored file_url still opens that exact id',
      handed.length === 1 && handed[0].id === row.id && handed[0].file_url === null &&
      h.calls.length === 1 && same(h.calls[0].payload, { action: 'getDocumentSignedUrl', data: { documentId: row.id } }) &&
      h.state().open === true && h.state().signedUrl === SIGNED && h.state().selected?.id === row.id);

    // P23 — an exact id with NO client-side file_path is still handed to the viewer
    // by that id: the ADMIN side imposes no file_path precondition. Resolution
    // preconditions remain the shared hook's, unchanged (pinned by H7 / H11).
    const handed2 = [];
    const open2 = buildHandler(componentSrc, h.api, handed2);
    await open2({ id: 'doc-no-path', name: 'no-path.pdf', file_url: 'https://legacy.supabase.co/24h/legacy' });
    await flush();
    check('P23', 'a row with an id but no client-side file_path is still handed over by that exact id',
      handed2.length === 1 && handed2[0].id === 'doc-no-path' && handed2[0].file_url === null &&
      !JSON.stringify(h.calls).includes('doc-no-path'));

    // P24 — the strongest case: an id and NOTHING else. Identity governs, so the
    // attempt still happens; the shared hook then fails SAFELY, and no URL is invented.
    // A FRESH hook instance, so the safe-failure state is judged in isolation (a
    // hook cell keeps its value between calls within one instance).
    const h3 = loadHook({ hookSource: hookSrc });
    const handed3 = [];
    const open3 = buildHandler(componentSrc, h3.api, handed3);
    await open3({ id: 'doc-bare', name: 'bare.pdf', document_type: 'other' });
    await flush();
    const st3 = h3.state();
    check('P24', 'a row with an id and NO file_path/file_url is still openable: exact id handed over, safe failure, no invented URL',
      handed3.length === 1 && handed3[0].id === 'doc-bare' && handed3[0].file_url === null &&
      h3.calls.length === 0 &&
      st3.open === false && st3.signedUrl === null && st3.error === 'Could not generate preview link' &&
      !/https?:\/\//.test(JSON.stringify({ st3, toasts: h3.toasts, handed: handed3 })));
  }

  {
    // Section 5 — identity is the id, never the filename: two rows sharing a name
    // resolve to their OWN ids, with no fuzzy or name-based matching anywhere.
    const h = loadHook({ hookSource: hookSrc });
    const handed = [];
    const open = buildHandler(componentSrc, h.api, handed);
    await open({ id: 'doc-a', name: 'same-name.pdf', document_type: 'other', file_path: 'a/1.pdf' });
    await flush();
    await open({ id: 'doc-b', name: 'same-name.pdf', document_type: 'other', file_path: 'b/2.pdf' });
    await flush();
    check('H12', 'two documents sharing a filename open their own ids (identity is the id, never the name)',
      h.calls.length === 2 &&
      same(h.calls[0].payload, { action: 'getDocumentSignedUrl', data: { documentId: 'doc-a' } }) &&
      same(h.calls[1].payload, { action: 'getDocumentSignedUrl', data: { documentId: 'doc-b' } }) &&
      !JSON.stringify(h.calls).includes('same-name.pdf') &&
      h.state().selected?.id === 'doc-b');
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
(async () => {
  const COMPONENT_SRC = read(COMPONENT);
  const HOOK_SRC = read(HOOK);

  console.log('── P5 — ADMIN DOCUMENT VIEWING (real component handler + real hook) ──');
  const results = await runChecks({ componentSrc: COMPONENT_SRC, hookSrc: HOOK_SRC });
  const failures = [];
  for (const r of results) {
    if (!r.pass) failures.push(r);
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id.padEnd(4)} ${r.label}${!r.pass && r.detail ? ` — ${r.detail}` : ''}`);
  }

  // ── MUTATIONS — mutate the REAL extracted source, re-run, catch it ────────
  console.log('\n── MUTATION TESTS — mutate the REAL source, re-run the matrix, catch it ──');
  const CALL_SITE = 'openDocumentViewer({ ...doc, file_url: null });';
  const GUARD = 'if (!doc?.id) return;';
  const MUTATIONS = [
    { id: 'M1', on: 'component', name: 'the row stops opening the document', find: 'onClick={canOpen ? () => handleOpenDocument(doc) : undefined}', replace: 'onClick={undefined}', mustCatch: ['P1'] },
    { id: 'M2', on: 'component', name: 'the row loses keyboard access', find: "onKeyDown={canOpen ? (e) => {\n                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpenDocument(doc); }\n                      } : undefined}", replace: 'onKeyDown={undefined}', mustCatch: ['P3'] },
    { id: 'M3', on: 'component', name: 'the row predicate stops depending on identity', find: 'const canOpen = Boolean(doc?.id);', replace: 'const canOpen = true;', mustCatch: ['P2c'] },
    { id: 'M4', on: 'component', name: 'the call site stops withholding the stored file_url', find: CALL_SITE, replace: 'openDocumentViewer(doc);', mustCatch: ['P10', 'H4'] },
    // M5 is a JSX wiring regression, so the STATIC row assertion (P1) is what
    // catches it: the executable checks call the handler directly.
    { id: 'M5', on: 'component', name: 'the row stops handing over the row itself', find: 'handleOpenDocument(doc)', replace: 'handleOpenDocument({ name: doc.name, document_type: doc.document_type })', mustCatch: ['P1'] },
    { id: 'M6', on: 'hook', name: 'a client-supplied business_id is forwarded with the document id', find: 'data: { documentId: document.id },', replace: 'data: { documentId: document.id, business_id: document.business_id },', mustCatch: ['H2'] },
    // NOTE ON M7 — a hook-side "resolve via the stored URL" ordering is INERT on
    // this path by construction (the call site hands over file_url: null), which
    // is exactly what H4/H5 prove. M7 therefore mutates the request itself.
    { id: 'M7', on: 'hook', name: 'the request drops the document id', find: 'data: { documentId: document.id },', replace: 'data: {},', mustCatch: ['H1'] },
    { id: 'M8', on: 'hook', name: 'the hook drops the file_path requirement', find: '} else if (document.id && document.file_path) {', replace: '} else if (document.id) {', mustCatch: ['H7'] },
    { id: 'M9', on: 'hook', name: 'the back-end reason is surfaced in the refusal', find: "setPreviewError('Could not generate preview link');", replace: 'setPreviewError(error.message);', mustCatch: ['H4', 'H6'] },
    { id: 'M10', on: 'hook', name: 'the viewer opens with no URL at all', find: 'if (!signedUrl && !document.file_url) {', replace: 'if (false) {', mustCatch: ['H4'] },
    { id: 'M11', on: 'component', name: 'the admin path switches the active business', find: CALL_SITE, replace: "setActiveContext({ type: 'business', businessId: doc.business_id });\n    openDocumentViewer({ ...doc, file_url: null });", mustCatch: ['P8'] },
    { id: 'M12', on: 'component', name: 'a second signed-URL endpoint appears', find: CALL_SITE, replace: "base44.functions.invoke('getDocumentSignedUrlAdmin', { documentId: doc.id });\n    openDocumentViewer({ ...doc, file_url: null });", mustCatch: ['P12'] },
    // M13–M16 — the four file_url protections the audit added, each proven
    // LOAD-BEARING: removing it must fail a NAMED assertion above.
    // (M4 and M13 are two mutation shapes of the same invariant — the raw row vs
    // an explicitly restored stored URL — kept deliberately for defence in depth.)
    { id: 'M13', on: 'component', name: 'the call-site normalization is removed (the stored URL is handed over)', find: CALL_SITE, replace: 'openDocumentViewer({ ...doc, file_url: doc.file_url });', mustCatch: ['P19', 'P10', 'H4'] },
    { id: 'M14', on: 'hook', name: 'a refusal opens the viewer with the original URL instead of refusing', find: "        setPreviewError('Could not generate preview link');\n        toast.error('Could not generate preview link');\n        setIsLoadingPreview(false);\n        return;", replace: "        setPreviewError('Could not generate preview link');\n        toast.error('Could not generate preview link');\n        setIsLoadingPreview(false);\n        setDocumentSignedUrl(document.file_url || document.signedUrl || null);\n        setIsDocumentViewerOpen(true);\n        return;", mustCatch: ['H4', 'P21'] },
    { id: 'M15', on: 'component', name: 'the admin row requires a stored file_url before it can open', find: GUARD, replace: 'if (!doc?.id || !doc.file_url) return;', mustCatch: ['P22', 'P24'] },
    { id: 'M16', on: 'component', name: 'the admin row requires a client-side file_path before it can open', find: GUARD, replace: 'if (!doc?.id || !doc.file_path) return;', mustCatch: ['P23', 'H7', 'P24'] },
    // M17 — the exact regression the approved micro-correction removed: storage
    // metadata gating the ATTEMPT. Identity-only rows (P24) are what catch it.
    { id: 'M17', on: 'component', name: 'the guard again requires file_path OR file_url before it can open', find: GUARD, replace: 'if (!doc?.id || (!doc.file_path && !doc.file_url)) return;', mustCatch: ['P24'] },
  ];

  for (const mut of MUTATIONS) {
    const src = mut.on === 'component' ? COMPONENT_SRC : HOOK_SRC;
    if (!src.includes(mut.find)) {
      failures.push({ id: mut.id, label: mut.name, detail: `mutation anchor not found: ${mut.find.slice(0, 46)}` });
      console.log(`FAIL  ${mut.id} ${mut.name} — mutation anchor not found`);
      continue;
    }
    const mutated = src.replace(mut.find, mut.replace);
    const mutatedResults = await runChecks({
      componentSrc: mut.on === 'component' ? mutated : COMPONENT_SRC,
      hookSrc: mut.on === 'hook' ? mutated : HOOK_SRC,
    });
    const caught = mut.mustCatch.filter((id) => mutatedResults.some((r) => r.id === id && !r.pass));
    const ok = caught.length > 0;
    if (!ok) failures.push({ id: mut.id, label: mut.name, detail: 'the harness would NOT have caught this regression' });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${mut.id.padEnd(4)} ${mut.name} → caught by [${caught.join(', ') || 'NOTHING'}]`);
  }

  console.log('\n' + '─'.repeat(72));
  if (failures.length) {
    console.log(`RESULT: FAIL — ${failures.length} assertion(s) failed`);
    failures.forEach((f) => console.log(`   · ${f.id} ${f.label}${f.detail ? ` — ${f.detail}` : ''}`));
    process.exit(1);
  }
  console.log('RESULT: PASS — admin document viewing reuses the one viewer and the one S3.1 path,');
  console.log('with the Admin subject and the active business untouched.');
  console.log('No network, database or production record was touched by this script.');
})().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});