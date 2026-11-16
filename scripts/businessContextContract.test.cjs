#!/usr/bin/env node
/**
 * businessContextContract.test.cjs — Phase 6.9B regression guard.
 *
 * Small, dependency-free guard for the business-context contract. It does NOT
 * build a test framework: it asserts the SHAPE of the contract and that no
 * remediated path has regressed to a silent primary-business fallback.
 *
 * Run:  node scripts/businessContextContract.test.cjs
 *
 * Behavioural coverage (multi-business + missing → 400, explicit owned → 200,
 * foreign → 403, record mismatch → 403) is exercised at runtime through
 * `test_backend_function` against the live multi-business account; those results
 * are recorded in src/PHASE_6_9_BUSINESS_CONTEXT_REMEDIATION_REPORT.md.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const failures = [];
const check = (label, ok, detail = '') => {
  if (!ok) failures.push(detail ? `${label} — ${detail}` : label);
};

// ── 1. The contract module exposes the canonical API ─────────────────────────
const contractPath = 'base44/shared/businessScope/activeBusiness.ts';
const contract = read(contractPath);

for (const fn of [
  'resolveActiveBusiness',
  'requireBusinessContext',
  'assertBusinessAccess',
  'businessContextError',
  'businessScopeMismatch',
  'resolveActorBusinessContext',
]) {
  check(`${contractPath} exports ${fn}`, contract.includes(`export async function ${fn}`) || contract.includes(`export function ${fn}`));
}

for (const code of [
  'BUSINESS_CONTEXT_REQUIRED',
  'BUSINESS_SCOPE_MISMATCH',
  'BUSINESS_CONTEXT_DENIED',
  'BUSINESSLESS_RECORD',
]) {
  check(`${contractPath} defines ${code}`, contract.includes(code));
}

// The contract must refuse an ambiguous request rather than guess.
check(
  `${contractPath} refuses multi-business ambiguity`,
  /throw contextRequiredError\(action, ownedCount\)/.test(contract),
  'ambiguous multi-business request no longer refused'
);

// ── 2. The deprecated shared helper no longer resolves a business ────────────
const legacyPath = 'base44/shared/galileoBieConsumer/entry.ts';
const legacy = read(legacyPath);
const legacyFn = legacy.slice(legacy.indexOf('export async function resolveProfileAndBusiness'));

check(`${legacyPath} resolveProfileAndBusiness returns businessId: null`, /return \{ profileId, businessId: null, membershipStatus \}/.test(legacyFn));
check(`${legacyPath} resolveProfileAndBusiness no longer reads primary_business_id`, !legacyFn.includes('primary_business_id'));
check(`${legacyPath} resolveProfileAndBusiness ignores body identity`, !legacyFn.includes('data?.profile_id'));

// ── 3. Remediated paths must not regress to a silent fallback ────────────────
const REMEDIATED = [
  // Wave 1 — business-owned data surfaces
  'getBusinessIntelligenceContract',
  'supabaseOpportunityData',
  'savedPlaybookData',
  'supabaseDashboardData',
  'knowledgeBaseEngine',
  'achievementNotifications',
  'weeklyDigest',
  'googleDriveImport',
  'ownershipConcentrationEngine',
  // Wave 2 — engines, assessments, strategy, discovery
  'confidenceEngine',
  'profitIqEngine',
  'reportingQualityEngine',
  'calculateFreedomPaths',
  'worksheetResponses',
  'calendarService',
  'generateWeeklyDigest',
  'getMetricAutoPopulate',
  'saveAssessmentToSupabase',
  'regenerateCiqMetrics',
  'buildGalileoContext',
  'calculateFreedomAcceleration',
  'selectStrategiesForClient',
  'resolveStrategyMappings',
  'expandStrategyOpportunities',
  'recordStrategyOutcome',
  'expertAdvisorAccess',
  'protectionGapEngine',
  'enterpriseDiscoveryOrchestrator',
  'generateOpportunities',
  // Wave 2 — admin / diagnostic surfaces
  'forceUpdateDashboardMetrics',
  'createSampleExtractedFields',
  'createDiagnosticNextBestAction',
].

map((f) => `base44/functions/${f}/entry.ts`);

// Documented, deliberate exceptions — a profile-wide record that declares its own
// business is preferred first; the profile's primary is only a last resort inside
// this PORTFOLIO-scoped, read-only engine.
const ALLOWED = { 'base44/functions/ownershipConcentrationEngine/entry.ts': true };
ALLOWED['base44/functions/ownershipConcentrationEngine/entry.ts'] = true;

// Only SUBSTITUTION shapes are forbidden. An equality comparison against the
// profile's primary business (`x !== profile.primary_business_id`, used as an
// authorization shortcut) is legitimate and deliberately allowed.
const FORBIDDEN = [
  [/\|\|\s*profile\.primary_business_id/, 'silent `|| profile.primary_business_id` fallback'],
  [/\|\|\s*prof\.primary_business_id/, 'silent `|| prof.primary_business_id` fallback'],
  [/\|\|\s*(prof|profile)\??\.primary_business_id/, 'silent primary fallback'],
];

// Assignment INTO a business variable, taken from the profile's primary.
const FORBIDDEN_ASSIGN = /[^!<>=]=\s*(profile|prof)\??\.primary_business_id\s*[;,)]/;

// Only LIVE code is examined: explanatory comments in these files legitimately
// quote the old expressions they replaced.
const stripComments = (src) =>
  src.split('\n').filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n');

for (const file of REMEDIATED) {
  const src = read(file);
  const code = stripComments(src);
  check(`${file} imports the business-scope guard`, /businessScope\/activeBusiness\.ts/.test(src), 'no canonical import');
  if (ALLOWED[file]) {
    // Documented last resort: the record's OWN business is preferred first and the
    // profile's primary is reached only when the record declares none. Portfolio-scoped
    // and read-only.
    check(`${file} documents its last resort`, /dmRow\?\.business_id \|\| profile\.primary_business_id/.test(code));
    continue;
  }
  for (const [re, label] of FORBIDDEN) {
    check(`${file} free of ${label}`, !re.test(code));
  }
  check(`${file} free of bare primary assignment`, !FORBIDDEN_ASSIGN.test(code));
}

const ownPath = 'base44/functions/ownershipConcentrationEngine/entry.ts';
check(
  `${ownPath} prefers the metrics row's own business`,
  /dmRow\?\.business_id \|\| profile\.primary_business_id/.test(read(ownPath))
);

// ── Report ──────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error('✗ business-context contract FAILED:');
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log(`✓ business-context contract OK (${REMEDIATED.length} remediated paths checked)`);