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
 *   4. Production application code (src/**, base44/**) obtaining the Base44
 *      SHARED Supabase connector as a runtime access path. VISION's Supabase
 *      boundary is the authorization chain — never a builder-owned connector.
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
  'business_dna_patterns', // Phase E — DNA must go through businessDNAService
];

// ── Forbidden DNA family tables (one table is sufficient) ──────────────────
const FORBIDDEN_DNA_FAMILY_TABLES = [
  'economic_dna', 'value_dna', 'operations_dna',
  'decision_dna', 'owner_dna', 'risk_dna',
  'business_dna_economic', 'business_dna_value',
  'business_dna_operating', 'business_dna_decision',
  'business_dna_owner', 'business_dna_risk',
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

// ── Base44 SHARED Supabase connector — PROHIBITED as a runtime path ────────
// The shared connector authenticates as the BUILDER'S Supabase account. It is a
// builder/development convenience only (migrations, inspection) and must never
// become an alternate path around:
//   Base44 session → canonical actor → profile → authorizeBusinessAccess →
//   permissions → business-scoped resource → controlled backend operation →
//   audit → Supabase
// The risk is concrete, not theoretical: the connector can retrieve the project's
// service_role key, and this is a public app, so a single unauthorized function
// would expose full database authority to unauthenticated callers.
//
// NOT flagged, by design:
//   • npm:@supabase/supabase-js clients — the controlled runtime path
//   • Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') inside authorized functions
//   • migration SQL and SQL tooling
//   • test fixtures (*.test.cjs) and the scripts/ harness directories
const SHARED_CONNECTOR_METHODS = [
  'getConnection',
  'getWorkspaceConnection',
  'getCurrentAppUserConnection',
];
const PROHIBITED_CONNECTOR_TYPE = 'supabase';

// Production runtime surfaces only: backend application code + frontend.
const RUNTIME_CODE_DIRS = ['src', 'base44'];

// Builder-only / verification-only surfaces that must NOT be flagged.
function isNonRuntimeArtifact(filePath) {
  const p = filePath.replace(/\\/g, '/');
  if (p.includes('architectureGuard')) return true; // this guard's own rule text
  if (p.includes('certify-intelligence')) return true;
  if (p.includes('/scripts/') || p.startsWith('scripts/')) return true; // harnesses + tooling
  if (/\.test\.(cjs|js|ts)$/.test(p)) return true; // test fixtures
  if (p.includes('/migrations/')) return true; // migration tooling
  if (p.endsWith('.md')) return true; // documentation
  return false;
}

/**
 * Static detection of the shared Supabase connector as a runtime access path.
 * Pure function over (filePath, content) so it can be mutation-certified.
 *
 * Catches the direct form in any quote style and across line breaks, and the
 * realistic indirect form where the integration type is held in a variable
 * first (const T = 'supabase'; … getConnection(T)).
 *
 * This is a static net, not a proof: a path assembled at runtime from fragments
 * would evade it. The enforced invariant is architectural — no production
 * function may use this connector — and this guard makes the obvious violation
 * fail the build.
 */
function sharedConnectorViolations(filePath, content) {
  if (isNonRuntimeArtifact(filePath)) return [];
  const violations = [];
  const methods = SHARED_CONNECTOR_METHODS.join('|');
  const type = PROHIBITED_CONNECTOR_TYPE;
  // Blank full-line comments line-for-line, so line numbers stay exact: a doc
  // comment that merely NAMES the prohibited call must not fail the build, while
  // real code that makes the call must.
  const source = content
    .split('\n')
    .map((line) => (/^\s*(\/\/|\*|\/\*)/.test(line) ? '' : line))
    .join('\n');
  const lineOf = (index) => source.slice(0, index).split('\n').length;
  const detail =
    `Production code reaches the Base44 SHARED Supabase connector. That connection ` +
    `acts as the BUILDER'S Supabase account and bypasses authorizeBusinessAccess. ` +
    `Use the controlled backend path (SUPABASE_SERVICE_ROLE_KEY inside an already ` +
    `authorized backend function) instead.`;

  // Direct: a connector accessor whose argument is the shared connector type.
  const direct = new RegExp(`\\b(${methods})\\s*\\([^)]*['"\`]${type}['"\`]`, 'g');
  let m;
  while ((m = direct.exec(source)) !== null) {
    violations.push({
      severity: 'CRITICAL',
      file: filePath,
      line: lineOf(m.index),
      rule: 'NO_SHARED_SUPABASE_CONNECTOR_RUNTIME_PATH',
      detail,
    });
  }

  // Indirect: the type is assigned to a variable, then passed to an accessor.
  const assigned = new RegExp(`\\b(?:const|let|var)\\s+(\\w+)\\s*=\\s*['"\`]${type}['"\`]`, 'g');
  while ((m = assigned.exec(source)) !== null) {
    const name = m[1];
    const viaVariable = new RegExp(`\\b(${methods})\\s*\\([^)]*(?:\\b${name}\\b|\\$\\{${name}\\})`);
    if (viaVariable.test(source)) {
      violations.push({
        severity: 'CRITICAL',
        file: filePath,
        line: lineOf(m.index),
        rule: 'NO_SHARED_SUPABASE_CONNECTOR_RUNTIME_PATH',
        detail: `${detail} (resolved through the variable '${name}'.)`,
      });
    }
  }

  return violations;
}

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

    // Check for forbidden DNA family tables (one table is sufficient)
    for (const table of FORBIDDEN_DNA_FAMILY_TABLES) {
      if (line.includes(`.from('${table}')`) || line.includes(`.from("${table}")`) || line.includes(`CREATE TABLE ${table}`)) {
        violations.push({
          severity: 'CRITICAL',
          file: filePath,
          line: i + 1,
          rule: 'NO_DUPLICATE_DNA_FAMILY_TABLE',
          detail: `${layer} layer references forbidden DNA family table '${table}'. Use business_dna_patterns (one table) instead.`,
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
      if (isContractBuilder) continue;

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

  // Check production runtime code for the prohibited shared Supabase connector.
  for (const dir of RUNTIME_CODE_DIRS) {
    const files = walkDir(dir, ['.js', '.jsx', '.ts', '.tsx']);
    filesChecked += files.length;
    for (const file of files) {
      if (isNonRuntimeArtifact(file)) continue;
      allViolations.push(...sharedConnectorViolations(file, fs.readFileSync(file, 'utf-8')));
    }
  }

  return { filesChecked, violations: allViolations };
}

module.exports = {
  runGuard,
  sharedConnectorViolations,
  isNonRuntimeArtifact,
  CONTRACT_OWNED_TABLES,
  FORBIDDEN_BASE44_ENTITIES,
  PROHIBITED_CONNECTOR_TYPE,
};

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