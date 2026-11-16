#!/usr/bin/env node
/**
 * Certification Test — Shared Intelligence Contract
 *
 * Run: node scripts/certify-intelligence-contract.js
 *
 * Checks:
 *   1. Forbidden direct dependencies (architecture guard)
 *   2. Contract field registry validity
 *   3. Base44 Assessment authority regression (no new writes)
 *   4. Base44 Document authority regression (zero consumers)
 *   5. Business-scoped cache key validation (static where possible)
 *   6. Contract consumer registration
 *
 * Exit code 0 = PASS, 1 = FAIL
 */

const fs = require('fs');
const path = require('path');

function walkDir(dir, exts) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (['node_modules', '.git', 'dist', 'build'].includes(item.name)) continue;
      results.push(...walkDir(fullPath, exts));
    } else if (exts.some((e) => item.name.endsWith(e))) {
      results.push(fullPath);
    }
  }
  return results;
}

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
}

// ── 1. Architecture Guard ─────────────────────────────────────────────────
const { runGuard } = require('./architectureGuard.js');
const guardResult = runGuard();
const criticalViolations = guardResult.violations.filter((v) => v.severity === 'CRITICAL');
check(
  'Architecture Guard — no forbidden direct dependencies',
  criticalViolations.length === 0,
  criticalViolations.length === 0
    ? 'No critical violations.'
    : `${criticalViolations.length} critical violations:\n${criticalViolations.map((v) => `   ${v.file}:${v.line} — ${v.rule}`).join('\n')}`
);

// ── 2. Contract Field Registry Validity ───────────────────────────────────
const registryPath = 'base44/shared/intelligenceContract/contractFieldRegistry.ts';
const registryExists = fs.existsSync(registryPath);
check('Contract Field Registry exists', registryExists, registryExists ? 'Found.' : `Missing: ${registryPath}`);

if (registryExists) {
  const registryContent = fs.readFileSync(registryPath, 'utf-8');
  const hasFields = registryContent.includes('CONTRACT_FIELD_REGISTRY');
  const hasAllDomains = ['valuation', 'profitability', 'tax', 'operations', 'freedom', 'business_iq', 'assessments', 'document_readiness'].every(
    (d) => registryContent.includes(`'${d}'`)
  );
  check('Contract Field Registry — has all domains', hasFields && hasAllDomains, hasAllDomains ? 'All 8 domains present.' : 'Missing domains.');
}

// ── 3. Base44 Assessment Authority Regression ─────────────────────────────
const allFiles = [...walkDir('src', ['.js', '.jsx', '.ts', '.tsx']), ...walkDir('base44', ['.ts'])];
let assessmentWrites = 0;
let assessmentReads = 0;
const assessmentWriteLocations = [];

for (const file of allFiles) {
  if (file.includes('architectureGuard') || file.includes('certify-intelligence')) continue;
  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//')) return;

    // Writes (frozen)
    if (/\.entities\.Assessment\.(create|update|delete|bulkCreate|bulkUpdate|updateMany)/.test(line)) {
      // Allow debug/diagnostic functions
      if (file.includes('debug') || file.includes('diag')) return;
      // Allow if explicitly FROZEN
      if (line.includes('// FROZEN') || line.includes('// LEGACY_MIRROR_REMOVED')) return;
      assessmentWrites++;
      assessmentWriteLocations.push(`${file}:${i + 1}`);
    }

    // Reads
    if (/\.entities\.Assessment\.(filter|list|get)/.test(line)) {
      if (file.includes('debug') || file.includes('diag')) return;
      assessmentReads++;
    }
  });
}

check(
  'Base44 Assessment — no new authoritative writes (frozen)',
  assessmentWrites === 0,
  assessmentWrites === 0 ? 'No unauthorized writes.' : `${assessmentWrites} writes found:\n${assessmentWriteLocations.join('\n')}`
);

// ── 4. Base44 Document Authority Regression ──────────────────────────────
let documentEntityUses = 0;
const documentLocations = [];

for (const file of allFiles) {
  if (file.includes('architectureGuard') || file.includes('certify-intelligence')) continue;
  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//')) return;
    // .entities.Document but NOT DocumentFolder, DocumentClassification, etc.
    if (/\.entities\.Document\b(?!\w)/.test(line)) {
      documentEntityUses++;
      documentLocations.push(`${file}:${i + 1}`);
    }
  });
}

check(
  'Base44 Document — zero persistent consumers',
  documentEntityUses === 0,
  documentEntityUses === 0 ? 'No consumers.' : `${documentEntityUses} uses found:\n${documentLocations.join('\n')}`
);

// ── 5. Business-scoped cache key validation ───────────────────────────────
const businessCachePatterns = [
  'assessment-summary', 'business-intelligence', 'dashboard-metrics', 'galileo-context',
  'business-contract', 'baseline', 'living-intelligence',
];
const srcFiles = walkDir('src', ['.js', '.jsx']);
let cacheKeyIssues = 0;
const cacheKeyIssueLocations = [];

for (const file of srcFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  lines.forEach((line, i) => {
    if (!/queryKey:\s*\[/.test(line)) return;
    const keyMatch = line.match(/queryKey:\s*\[([^\]]*)\]/);
    if (!keyMatch) return;
    const key = keyMatch[1].toLowerCase();
    const isBusinessScoped = businessCachePatterns.some((p) => key.includes(p));
    if (!isBusinessScoped) return;
    const nextFewLines = lines.slice(i, i + 3).join(' ');
    const hasBusinessId = /business[_]?id|businessId|activeBusinessId/i.test(nextFewLines);
    if (!hasBusinessId) {
      cacheKeyIssues++;
      cacheKeyIssueLocations.push(`${file}:${i + 1} — key: ${keyMatch[1].slice(0, 60)}`);
    }
  });
}

check(
  'Cache keys — business-scoped queries include business_id',
  cacheKeyIssues === 0,
  cacheKeyIssues === 0 ? 'All business-scoped cache keys include business_id.' : `${cacheKeyIssues} keys missing business_id:\n${cacheKeyIssueLocations.join('\n')}`
);

// ── 6. Contract consumer registration ─────────────────────────────────────
const contractBuilderExists = fs.existsSync('base44/shared/intelligenceContract/businessIntelligenceContract.ts');
const contractBackendExists = fs.existsSync('base44/functions/getBusinessIntelligenceContract/entry.ts');
const baselineResolverExists = fs.existsSync('base44/shared/intelligenceContract/baselineResolver.ts');

check(
  'Contract consumer registration — certified owners exist',
  contractBuilderExists && contractBackendExists && baselineResolverExists,
  `Builder: ${contractBuilderExists}, Backend: ${contractBackendExists}, Baseline: ${baselineResolverExists}`
);

// ── Report ────────────────────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  SHARED INTELLIGENCE CONTRACT — CERTIFICATION TEST           ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

let allPass = true;
for (const r of results) {
  const icon = r.pass ? '✅' : '❌';
  console.log(`${icon} ${r.name}`);
  if (r.detail && !r.pass) {
    console.log(`   ${r.detail.split('\n').join('\n   ')}`);
  }
  if (!r.pass) allPass = false;
}

console.log('\n' + '═'.repeat(62));
if (allPass) {
  console.log('  RESULT: SHARED INTELLIGENCE CONTRACT ENFORCEMENT CERTIFIED ✅');
} else {
  console.log('  RESULT: SHARED INTELLIGENCE CONTRACT ENFORCEMENT NOT CERTIFIED ❌');
}
console.log('═'.repeat(62) + '\n');

process.exit(allPass ? 0 : 1);