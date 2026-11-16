/**
 * Architecture Guard — Shared Intelligence Contract Enforcement
 *
 * A lightweight static analysis guard that detects forbidden dependencies
 * and direct reads of contract-owned persistence by presentation/synthesis
 * consumers.
 *
 * Dependency Direction (ALLOWED, top-down only):
 *   PERSISTENCE  →  DOMAIN OWNER  →  SHARED CONTRACT  →  SYNTHESIS  →  PRESENTATION
 *
 * VIOLATIONS detected:
 *   1. Presentation layer (src/components, src/pages, src/hooks) directly
 *      querying contract-owned Supabase tables.
 *   2. Presentation layer directly using base44.entities.Assessment or
 *      base44.entities.Document.
 *   3. Synthesis layer (src/lib) querying contract-owned tables WITHOUT
 *      going through the contract or certified service.
 *
 * Usage:
 *   node scripts/certify-intelligence-contract.js
 *
 * This guard is intentionally lightweight — no external dependencies.
 * It uses Node.js built-in fs/path only.
 */

const fs = require('fs');
const path = require('path');

// ── Contract-owned tables that presentation MUST NOT query directly ───────
const CONTRACT_OWNED_TABLES = [
  'assessment_sessions',
  'assessment_answers',
  'assessment_calculations',
  'business_assessments',
  'dashboard_metrics',
  'extracted_fields',
  'business_metric_snapshots',
  'value_creation_events',
];

// ── Base44 entities that MUST NOT be used for current business truth ──────
const FORBIDDEN_BASE44_ENTITIES = ['Assessment', 'Document'];

// ── Presentation layer directories ──────────────────────────────────────────
const PRESENTATION_DIRS = ['src/components', 'src/pages', 'src/hooks'];

// ── Synthesis layer directories (may use contract/services, not raw tables) ─
const SYNTHESIS_DIRS = ['src/lib'];

// ── Allowed synthesis modules (contract access, certified services) ───────
const ALLOWED_SYNTHESIS_MODULES = [
  'intelligenceContract',
  'businessIntelligenceState',
  'assessmentCompletionService',
  'canonicalFactClient',
  'supabaseClient',
  'base44Client',
  'valuationService',
  'sprintAdapter',
  'formatters',
  'anonymousSession',
];

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

function checkFile(filePath, layer) {
  const violations = [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    // Skip comments
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
    // Skip architecture guard itself and docs
    if (filePath.includes('architectureGuard') || filePath.includes('contractFieldRegistry')) return;

    // Check for direct Supabase table reads
    for (const table of CONTRACT_OWNED_TABLES) {
      if (line.includes(`.from('${table}')`) || line.includes(`.from("${table}")`)) {
        violations.push({
          severity: 'CRITICAL',
          file: filePath,
          line: i + 1,
          rule: 'NO_DIRECT_PERSISTENCE_READ',
          detail: `${layer} layer directly queries contract-owned table '${table}'. Use the Shared Business Intelligence Contract instead.`,
        });
      }
    }

    // Check for forbidden Base44 entity usage (Assessment, Document)
    for (const entity of FORBIDDEN_BASE44_ENTITIES) {
      // Match .entities.Assessment but NOT .entities.AssessmentContext etc.
      const regex = new RegExp(`\\.entities\\.${entity}\\b(?!\\w)`, 'g');
      if (regex.test(line) && !line.includes('// LEGACY_MIRROR') && !line.includes('// FROZEN')) {
        violations.push({
          severity: 'CRITICAL',
          file: filePath,
          line: i + 1,
          rule: 'NO_BASE44_ENTITY_FOR_TRUTH',
          detail: `${layer} layer uses base44.entities.${entity} for business truth. This entity is frozen/retired.`,
        });
      }
    }
  });

  return violations;
}

function runGuard() {
  const allViolations = [];
  let filesChecked = 0;

  // Check presentation layer
  for (const dir of PRESENTATION_DIRS) {
    const files = walkDir(dir, ['.js', '.jsx']);
    filesChecked += files.length;
    for (const file of files) {
      allViolations.push(...checkFile(file, 'PRESENTATION'));
    }
  }

  // Check synthesis layer (stricter — no raw table reads for current truth)
  for (const dir of SYNTHESIS_DIRS) {
    const files = walkDir(dir, ['.js', '.jsx']);
    filesChecked += files.length;
    for (const file of files) {
      // Synthesis may use contract-owned tables only if explicitly building the contract
      // or in a certified service. Flag all direct reads; allowlisted files skip.
      const isContractBuilder =
        file.includes('intelligenceContract') ||
        file.includes('businessIntelligenceState') ||
        file.includes('canonicalFact') ||
        file.includes('baselineResolver');
      if (isContractBuilder) return;

      const violations = checkFile(file, 'SYNTHESIS');
      allViolations.push(...violations);
    }
  }

  // Check backend functions for Base44 Assessment/Document writes (FROZEN)
  const backendFiles = walkDir('base44/functions', ['.ts']);
  filesChecked += backendFiles.length;
  for (const file of backendFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('//')) return;
      // Check for Base44 Assessment WRITES (frozen)
      if (/\.entities\.Assessment\.(create|update|delete|bulkCreate|bulkUpdate|updateMany)/.test(line)) {
        // Allow if explicitly marked as FROZEN or in debug/diagnostic
        if (file.includes('debug') || file.includes('diag') || line.includes('// FROZEN')) return;
        allViolations.push({
          severity: 'HIGH',
          file,
          line: i + 1,
          rule: 'BASE44_ASSESSMENT_WRITE_FROZEN',
          detail: 'Base44 Assessment write detected. Base44 Assessment is frozen — no new authoritative writes.',
        });
      }
    });
  }

  return { filesChecked, violations: allViolations };
}

module.exports = { runGuard, CONTRACT_OWNED_TABLES, FORBIDDEN_BASE44_ENTITIES };

// If run directly, execute and report
if (require.main === module) {
  const { filesChecked, violations } = runGuard();
  console.log(`\n🔒 Shared Intelligence Contract Architecture Guard`);
  console.log(`   Files checked: ${filesChecked}`);
  console.log(`   Violations: ${violations.length}\n`);

  if (violations.length === 0) {
    console.log('✅ PASS — No forbidden dependencies detected.\n');
    process.exit(0);
  }

  const critical = violations.filter((v) => v.severity === 'CRITICAL');
  const high = violations.filter((v) => v.severity === 'HIGH');

  if (critical.length > 0) {
    console.log(`❌ CRITICAL (${critical.length}):`);
    for (const v of critical) {
      console.log(`   ${v.file}:${v.line} — ${v.rule}`);
      console.log(`     ${v.detail}\n`);
    }
  }

  if (high.length > 0) {
    console.log(`⚠️  HIGH (${high.length}):`);
    for (const v of high) {
      console.log(`   ${v.file}:${v.line} — ${v.rule}`);
      console.log(`     ${v.detail}\n`);
    }
  }

  process.exit(critical.length > 0 ? 1 : 0);
}