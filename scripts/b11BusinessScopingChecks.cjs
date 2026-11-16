#!/usr/bin/env node
/**
 * Phase B1.1 — Business Scoping Integrity: STATIC CONTRACT CHECKS.
 *
 * Offline and non-destructive. Verifies the B1.1 source contract by reading the
 * three authorized files and asserting:
 *
 *   1. All business-data query sites in the shared BIE consumer, askGalileo and
 *      buildGalileoContext carry a business_id filter (no profile_id filter).
 *   2. The fail-closed guard exists and is invoked by both shared entry points.
 *   3. No writes were added to the shared module.
 *   4. Every caller of the shared module resolves the business through the
 *      canonical contract before calling.
 *   5. Codex-owned surfaces still exist with their documented exports
 *      (existence sanity, not change detection).
 *
 * Companion behavioral suite: scripts/b11CrossBusinessMixing.test.cjs
 *
 *   node scripts/b11BusinessScopingChecks.cjs
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const SHARED = 'base44/shared/galileoBieConsumer/entry.ts';
const ASK = 'base44/functions/askGalileo/entry.ts';
const CTX = 'base44/functions/buildGalileoContext/entry.ts';

const sharedSrc = read(SHARED);
const askSrc = read(ASK);
const ctxSrc = read(CTX);

function fnBody(src, startMarker, endMarker) {
  const s = src.indexOf(startMarker);
  if (s === -1) throw new Error(`start marker not found: ${startMarker.slice(0, 60)}`);
  const e = src.indexOf(endMarker, s);
  if (e === -1) throw new Error(`end marker not found after start: ${endMarker.slice(0, 60)}`);
  return src.slice(s, e);
}

const checks = [];
const check = (name, fn) => checks.push({ name, fn });
const ok = (b, msg) => { if (!b) throw new Error(msg || 'assertion failed'); };

// ── 1. Shared module: fetchCanonicalRecommendations ──────────────────────────
const fetchBody = fnBody(sharedSrc, 'export async function fetchCanonicalRecommendations', 'function formatValue');
check('shared/fetchCanonicalRecommendations: guard invoked', () => {
  ok(fetchBody.includes("requireAuthorizedBusinessId(businessId, 'fetchCanonicalRecommendations')"),
    'fail-closed guard call missing in fetchCanonicalRecommendations');
});
check('shared/fetchCanonicalRecommendations: 3 sites business-scoped', () => {
  ok(fetchBody.includes("sb.from('dashboard_metrics').select('*').eq('business_id', businessId)"), 'dashboard_metrics not business-scoped');
  ok(fetchBody.includes("sb.from('business_assessments').select('*').eq('business_id', businessId)"), 'business_assessments not business-scoped');
  ok(fetchBody.includes("sb.from('business_metric_snapshots').select('*').eq('business_id', businessId)"), 'business_metric_snapshots not business-scoped');
});
check('shared/fetchCanonicalRecommendations: no profile-scoped business reads', () => {
  ok(!fetchBody.includes(".eq('profile_id'"), 'profile_id filter remains in fetchCanonicalRecommendations');
});

// ── 2. Shared module: buildSupportingEvidence ────────────────────────────────
const evBody = fnBody(sharedSrc, 'export async function buildSupportingEvidence', 'function identifyMissingInformation');
check('shared/buildSupportingEvidence: guard invoked', () => {
  ok(evBody.includes("requireAuthorizedBusinessId(businessId, 'buildSupportingEvidence')"),
    'fail-closed guard call missing in buildSupportingEvidence');
});
check('shared/buildSupportingEvidence: 3 sites business-scoped', () => {
  ok(evBody.includes("sb.from('documents').select('name, document_type, upload_status, year').eq('business_id', businessId)"), 'documents not business-scoped');
  ok(evBody.includes("sb.from('business_assessments').select('assessment_type, score, estimated_opportunity_value, summary, key_findings').eq('business_id', businessId)"), 'business_assessments not business-scoped');
  ok(evBody.includes("sb.from('extracted_fields').select('field_name, accepted_value, accepted_normalized_value, source_document_type').eq('business_id', businessId)"), 'extracted_fields not business-scoped');
});
check('shared/buildSupportingEvidence: no profile-scoped business reads', () => {
  ok(!evBody.includes(".eq('profile_id'"), 'profile_id filter remains in buildSupportingEvidence');
});

// ── 3. Guard definition ──────────────────────────────────────────────────────
check('shared: requireAuthorizedBusinessId defined (fail-closed)', () => {
  ok(/function requireAuthorizedBusinessId\(\s*businessId: any,\s*caller: string/.test(sharedSrc),
    'guard function definition missing');
  ok(/typeof businessId !== 'string' \|\| !businessId\.trim\(\) \|\| businessId\.trim\(\) === 'null'/.test(sharedSrc),
    'guard does not reject null/empty/whitespace/"null" business ids');
});

// ── 4. No writes added to the shared module ─────────────────────────────────
check('shared: no writes added (insert count unchanged at 1)', () => {
  const inserts = (sharedSrc.match(/\.insert\(/g) || []).length;
  ok(inserts === 1, `expected exactly 1 pre-existing .insert( (recordLearningPattern), found ${inserts}`);
  ok(!sharedSrc.includes('.update(') && !sharedSrc.includes('.delete('), 'an update/delete write appeared in the shared module');
});

// ── 5. askGalileo supporting context ─────────────────────────────────────────
const askBlock = fnBody(askSrc, 'const [assessRes, docRes, nbaRes, sprintRes, notesRes]', 'const safeVal =');
check('askGalileo: assessments/sprint/notes business-scoped', () => {
  ok(askBlock.includes("sb.from('business_assessments').select('assessment_type, score, estimated_opportunity_value, risk_level, opportunity_level, summary, key_findings').eq('business_id', businessId)"), 'business_assessments not business-scoped in askGalileo');
  ok(askBlock.includes("sb.from('ninety_day_sprint_paths').select('id, path_title, path_goal, status, progress_percent, is_active').eq('business_id', businessId)"), 'ninety_day_sprint_paths not business-scoped in askGalileo');
  ok(/sb\.from\('advisor_notes'\)\.select\('id, note, created_at'\)\.eq\('business_id', businessId\)/.test(askBlock), 'advisor_notes not business-scoped in askGalileo');
});
check('askGalileo: no profile-scoped business reads in the supporting block', () => {
  ok(!askBlock.includes(".eq('profile_id', profileId)"), 'a profile_id filter remains in the askGalileo supporting block');
});

// ── 6. buildGalileoContext notes + sprint ────────────────────────────────────
const ctxBlock = fnBody(ctxSrc, 'const [', '// ── Fetch ReadinessItems');
check('buildGalileoContext: advisor notes + active sprint business-scoped', () => {
  ok(ctxBlock.includes("sb.from('advisor_notes').select('id, note, created_at, visibility').eq('business_id', business_id)"), 'advisor_notes not business-scoped in buildGalileoContext');
  ok(ctxBlock.includes("sb.from('ninety_day_sprint_paths').select('id, path_title, path_goal, status, progress_percent, is_active, created_at').eq('business_id', business_id)"), 'ninety_day_sprint_paths not business-scoped in buildGalileoContext');
});
check('buildGalileoContext: no profile-scoped business reads in the parallel fetch block', () => {
  ok(!ctxBlock.includes(".eq('profile_id', profile_id)"), 'a profile_id filter remains in the buildGalileoContext fetch block');
});

// ── 7. Every shared-module caller resolves the business canonically first ─────
const callerFiles = fs.readdirSync(path.join(ROOT, 'base44/functions'))
  .filter((d) => fs.existsSync(path.join(ROOT, 'base44/functions', d, 'entry.ts')))
  .map((d) => `base44/functions/${d}/entry.ts`);
const callers = [];
for (const f of callerFiles) {
  const src = read(f);
  if (!src.includes('fetchCanonicalRecommendations(') && !src.includes('buildSupportingEvidence(')) continue;
  if (f === ASK || f === CTX) { callers.push({ f, src }); continue; }
  if (/import\s*\{[^}]*fetchCanonicalRecommendations|import\s*\{[^}]*buildSupportingEvidence/.test(src)) callers.push({ f, src });
}
check('shared module: all callers enumerated', () => {
  const names = callers.map((c) => c.f.replace('base44/functions/', '').replace('/entry.ts', '')).sort();
  const expected = ['aiStrategicHypotheses', 'aiStrategyComparison', 'askGalileo', 'buildGalileoContext', 'galileoOpportunityEngine', 'generateGalileoInsights'];
  ok(JSON.stringify(names) === JSON.stringify(expected), `caller set changed: ${JSON.stringify(names)}`);
});
check('shared module: every caller resolves the business through the canonical contract', () => {
  for (const c of callers) {
    ok(/resolveActorBusinessContext|requireBusinessContext|resolveActiveBusiness/.test(c.src),
      `${c.f} calls the shared module without a canonical business resolution`);
  }
});
check('shared module: no caller passes a literal null business to the shared module', () => {
  for (const c of callers) {
    const bad = /fetchCanonicalRecommendations\([^)]*,\s*null\s*\)|buildSupportingEvidence\([^)]*,\s*null\s*,/.test(c.src);
    ok(!bad, `${c.f} passes a literal null business id to the shared module`);
  }
});

// ── 8. Codex-owned surfaces: existence sanity (not change detection) ─────────
check('codex: canonical strict-identity module present with documented exports', () => {
  const src = read('base44/shared/authz/canonicalActor.ts');
  for (const marker of ['export const CANONICAL_ACTIVE_STATUSES', 'export async function resolveCanonicalActor']) ok(src.includes(marker), `canonicalActor.ts missing marker "${marker}"`);
  ok(fs.existsSync(path.join(ROOT, 'base44/shared/authz/actor.ts')), 'shared/authz/actor.ts missing');
});
check('codex: snapshot writer still binds the canonical strict-identity resolver', () => {
  const snap = read('base44/functions/createSnapshotFromReviewedFields/entry.ts');
  ok(snap.includes('resolveCanonicalActor'), 'createSnapshotFromReviewedFields lost its canonicalActor binding');
  ok(fs.existsSync(path.join(ROOT, 'scripts/snapshotCallerContract.test.cjs')), 'snapshotCallerContract.test.cjs missing');
  ok(!sharedSrc.includes('createSnapshotFromReviewedFields'), 'shared module references the snapshot writer');
});

// ── Run ──────────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const failures = [];
for (const c of checks) {
  try { c.fn(); pass++; console.log(`  PASS  ${c.name}`); }
  catch (e) { fail++; failures.push(`${c.name}: ${e.message}`); console.log(`  FAIL  ${c.name}: ${e.message}`); }
}
console.log(`\nb11BusinessScopingChecks: ${pass} PASS, ${fail} FAIL (of ${checks.length})`);
if (failures.length) { failures.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }