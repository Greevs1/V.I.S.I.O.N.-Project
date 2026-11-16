/**
 * businessDNA/coordinator.ts — Phase E
 *
 * Business DNA Coordinator — The synthesis engine.
 *
 * This module is the DETERMINISTIC + AI HYBRID boundary:
 *
 * Deterministic (this module):
 *   - evidence lineage dedup
 *   - business scope
 *   - status transitions (qualification)
 *   - confidence inputs
 *   - freshness
 *   - contradictions (structurally detectable)
 *   - supersession rules
 *   - client visibility
 *   - Owner DNA safety validation
 *
 * AI (via prompt + response processing):
 *   - semantic pattern synthesis
 *   - candidate generation
 *   - implication explanation
 *   - relationship discovery
 *
 * AI proposes candidates. Deterministic rules qualify them.
 * No candidate may silently become established.
 *
 * Constitution Compliance:
 *   Article I — One Truth (references evidence, never recalculates)
 *   Article III — No Duplicate Intelligence (synthesizes, never duplicates)
 *   Article V — Advisor Governance (AI proposes, rules qualify)
 *   Article XVII — Business DNA Authority (derived, never authoritative)
 */

import type {
  BusinessDNAPattern, BusinessDNA, BusinessDNAMeta, DNAEvidenceRef,
  AICandidatePattern, AICandidateResponse, AIContradiction,
  DNAFamily, PatternStatus, PatternStrength, PatternConfidence,
  PatternDirection, PatternVisibility, PatternImplication, DNAQuestion,
  PatternEvolution, ContradictionResult,
} from './types.ts';
import { DNA_FAMILIES } from './types.ts';
import { FAMILY_DEFINITIONS, isOwnerDNASafe, getDefaultClientVisibility } from './families.ts';
import { deduplicateEvidenceByLineage, countIndependentSources, buildLineageRoot } from './lineage.ts';
import { qualifyPattern, isValidTransition } from './qualification.ts';
import { calculateConfidence, calculateFreshness } from './confidence.ts';
import { detectContradiction, applyContradiction } from './contradiction.ts';
import { isPatternClientVisible, filterPatternsForClient } from './clientSafe.ts';

// ── Evidence Catalog (built by backend, consumed by coordinator) ─────────────
export interface EvidenceCatalog {
  business_id: string;
  contract_summary: Record<string, unknown> | null;
  memories: Array<{
    memory_id: string; category: string; title: string; summary: string;
    effective_date: string | null; importance: string; client_visible: boolean;
  }>;
  timeline_events: Array<{
    event_id: string; title: string; timestamp: string;
  }>;
  decisions: Array<{
    decision_id: string; title: string; decision_type: string;
    decided_at: string | null; selected_option_label: string | null;
    decision_reason: string; importance: string;
  }>;
  decision_outcomes: Array<{
    decision_id: string; title: string; outcome_status: string;
    outcome_notes: string; decided_at: string; outcome_reviewed_at: string | null;
  }>;
  valuation_summary: {
    current_value: number | null; baseline_value: number | null;
    value_gap: number | null; status: string;
  } | null;
  growth_plan_summary: {
    total_initiatives: number; active_initiatives: number;
  } | null;
  sprint_evidence: Array<{
    sprint_id: string; status: string; progress_percent: number; path_title: string | null;
  }>;
  value_creation_events: Array<{
    event_id: string; title: string; verified_value: number | null; created_at: string;
  }>;
  assessment_scores: Array<{
    assessment_type: string; completed: boolean; score: number | null;
    estimated_opportunity_value: number | null;
  }>;
  evidence_refs: DNAEvidenceRef[];
}

// ── Build AI Prompt for Candidate Generation ─────────────────────────────────
export function buildCandidatePrompt(catalog: EvidenceCatalog): string {
  const familyDescriptions = DNA_FAMILIES.map((f) => {
    const def = FAMILY_DEFINITIONS[f];
    return `  ${f}: ${def.description}`;
  }).join('\n');

  const evidenceSummary = catalog.evidence_refs.map((r) =>
    `  [${r.evidence_id}] (${r.source_domain}) ${r.source_name}: ${r.summary}`
  ).join('\n');

  const memories = catalog.memories.map((m) =>
    `  - ${m.title}: ${m.summary} (${m.category}, ${m.importance})`
  ).join('\n');

  const timeline = catalog.timeline_events.map((t) =>
    `  - ${t.timestamp?.split('T')[0]}: ${t.title}`
  ).join('\n');

  const decisions = catalog.decisions.map((d) =>
    `  - ${d.title} (${d.decision_type}, ${d.importance}): selected "${d.selected_option_label}" — ${d.decision_reason}`
  ).join('\n');

  const outcomes = catalog.decision_outcomes.map((o) =>
    `  - ${o.title}: ${o.outcome_status} — ${o.outcome_notes}`
  ).join('\n');

  const valuation = catalog.valuation_summary
    ? `  Current: ${catalog.valuation_summary.current_value}, Baseline: ${catalog.valuation_summary.baseline_value}, Gap: ${catalog.valuation_summary.value_gap}, Status: ${catalog.valuation_summary.status}`
    : '  No valuation data';

  const growth = catalog.growth_plan_summary
    ? `  Total: ${catalog.growth_plan_summary.total_initiatives}, Active: ${catalog.growth_plan_summary.active_initiatives}`
    : '  No growth plan data';

  const sprints = catalog.sprint_evidence.map((s) =>
    `  - ${s.path_title || 'Sprint'}: ${s.status}, ${s.progress_percent}% progress`
  ).join('\n');

  const vce = catalog.value_creation_events.map((v) =>
    `  - ${v.title}: $${v.verified_value} (${v.created_at?.split('T')[0]})`
  ).join('\n');

  const assessments = catalog.assessment_scores.map((a) =>
    `  - ${a.assessment_type}: ${a.completed ? `score ${a.score}, opportunity $${a.estimated_opportunity_value}` : 'not completed'}`
  ).join('\n');

  return `You are a Business DNA synthesis engine for V.I.S.I.O.N.

Your role: identify DURABLE PATTERNS that characterize how this business creates value, operates, makes decisions, depends on its owner, encounters risk, and evolves.

SIX DNA FAMILIES:
${familyDescriptions}

RULES:
1. Identify PATTERNS, not facts. A pattern is a recurring behavior or structural characteristic observed across multiple evidence points.
2. Each pattern must reference evidence by evidence_id (from the evidence list below).
3. Do NOT declare patterns as "established" — you propose candidates; deterministic rules qualify them.
4. Do NOT psychoanalyze the owner. Owner DNA describes observable BUSINESS DEPENDENCY only. No personality traits, disorders, or psychological speculation.
5. If evidence is insufficient for a family, return NO patterns for that family. Quiet state is required — do NOT generate generic filler.
6. Each pattern needs: family, pattern_key, title, statement, pattern_type, strength, direction, evidence_refs (IDs), implications, and questions.
7. Strength = how strongly the pattern affects business behavior/value. Confidence is calculated separately by deterministic rules.
8. Identify contradictions with existing patterns if any.

BUSINESS EVIDENCE:

Shared Contract Summary:
${JSON.stringify(catalog.contract_summary?.valuation || {}, null, 2)}
${JSON.stringify(catalog.contract_summary?.profitability || {}, null, 2)}
${JSON.stringify(catalog.contract_summary?.operations || {}, null, 2)}
${JSON.stringify(catalog.contract_summary?.freedom || {}, null, 2)}

Business Memory (confirmed context):
${memories || '  None'}

Timeline Events:
${timeline || '  None'}

Decisions (decided):
${decisions || '  None'}

Decision Outcomes (confirmed):
${outcomes || '  None'}

Valuation:
${valuation}

Growth Plan:
${growth}

Sprint Evidence:
${sprints || '  None'}

Value Creation Events:
${vce || '  None'}

Assessment Scores:
${assessments || '  None'}

Evidence Catalog (reference by evidence_id):
${evidenceSummary || '  None'}

Analyze this evidence and propose candidate Business DNA patterns. Return only patterns supported by specific evidence. If evidence is sparse, return fewer patterns. Quality over quantity.`;
}

// ── JSON Schema for AI Response ──────────────────────────────────────────────
export function getCandidateResponseSchema() {
  return {
    type: 'object' as const,
    properties: {
      candidate_patterns: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            family: { type: 'string', enum: DNA_FAMILIES },
            pattern_key: { type: 'string' },
            title: { type: 'string' },
            statement: { type: 'string' },
            pattern_type: { type: 'string' },
            strength: { type: 'string', enum: ['low', 'moderate', 'high', 'very_high'] },
            evidence_refs: { type: 'array', items: { type: 'string' } },
            supporting_facts: { type: 'array', items: { type: 'string' } },
            contradicting_facts: { type: 'array', items: { type: 'string' } },
            implications: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  domain: { type: 'string', enum: ['value', 'operations', 'freedom', 'risk', 'growth', 'tax'] },
                  description: { type: 'string' },
                  references_existing_concept: { type: 'string' },
                },
              },
            },
            dna_questions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  question: { type: 'string' },
                  why_it_matters: { type: 'string' },
                  route_to: { type: 'string', enum: ['verification_queue', 'advisor', 'document_request', 'assessment', 'meeting', 'galileo'] },
                },
              },
            },
            direction: { type: 'string', enum: ['improving', 'declining', 'stable', 'unknown'] },
            client_visibility: { type: 'string', enum: ['advisor_internal', 'client_safe'] },
          },
        },
      },
      contradictions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            new_pattern_key: { type: 'string' },
            existing_pattern_id: { type: 'string' },
            explanation: { type: 'string' },
          },
        },
      },
      summary: { type: 'string' },
    },
  };
}

// ── Process AI Response into Candidate Patterns ──────────────────────────────
export function processCandidateResponse(
  response: AICandidateResponse,
  catalog: EvidenceCatalog,
): { candidates: AICandidatePattern[]; contradictions: AIContradiction[] } {
  const candidates = (response.candidate_patterns || []).filter((c) => {
    // Validate family (must be one of the six)
    if (!DNA_FAMILIES.includes(c.family)) return false;
    // Owner DNA safety — reject psychological profiling (strict, non-negotiable)
    if (c.family === 'owner' && !isOwnerDNASafe(c.statement)) return false;
    // Must have at least 1 evidence ref
    if (!c.evidence_refs || c.evidence_refs.length === 0) return false;
    // pattern_type is accepted as-is (AI may use variations of predefined types)
    return true;
  });

  return {
    candidates,
    contradictions: response.contradictions || [],
  };
}

// ── Reconcile a Candidate Pattern with Deterministic Rules ───────────────────
/**
 * Takes an AI-proposed candidate and applies deterministic qualification,
 * confidence, contradiction detection, and freshness rules.
 *
 * AI proposes the pattern statement and strength.
 * Deterministic rules decide status, confidence, freshness, and direction validation.
 */
export function reconcileCandidatePattern(
  candidate: AICandidatePattern,
  catalog: EvidenceCatalog,
  existingPatterns: BusinessDNAPattern[],
  patternId: string,
): BusinessDNAPattern {
  const now = new Date().toISOString();

  // Resolve evidence refs from catalog
  const resolvedEvidence = (candidate.evidence_refs || [])
    .map((id) => catalog.evidence_refs.find((r) => r.evidence_id === id))
    .filter((r): r is DNAEvidenceRef => r !== undefined);

  // Deduplicate by lineage
  const dedup = deduplicateEvidenceByLineage(resolvedEvidence);

  // Temporal data
  const observedDates = resolvedEvidence
    .map((r) => r.observed_at)
    .filter(Boolean)
    .sort();
  const firstObservedAt = observedDates[0] || now;
  const lastObservedAt = observedDates[observedDates.length - 1] || now;

  // Detect contradictions with existing patterns
  const contradiction = detectContradiction(
    candidate.family,
    candidate.pattern_key,
    candidate.direction,
    candidate.statement,
    existingPatterns,
  );

  const hasMaterialContradiction = contradiction.has_contradiction;

  // Deterministic qualification
  const status = qualifyPattern(
    resolvedEvidence,
    hasMaterialContradiction,
    firstObservedAt,
    lastObservedAt,
    false, // advisor_confirmed — new candidates are never pre-confirmed
  );

  // Deterministic confidence
  const confidence = calculateConfidence(
    resolvedEvidence,
    firstObservedAt,
    lastObservedAt,
    hasMaterialContradiction,
    false, // advisor_confirmed
  );

  // Freshness
  const freshness = calculateFreshness(lastObservedAt);

  // Client visibility (default from family if not specified by AI)
  const clientVisibility: PatternVisibility =
    candidate.client_visibility || (getDefaultClientVisibility(candidate.family) ? 'client_safe' : 'advisor_internal');

  // Build DNA questions with IDs
  const dnaQuestions: DNAQuestion[] = (candidate.dna_questions || []).map((q, i) => ({
    question_id: `q-${patternId}-${i}`,
    question: q.question,
    why_it_matters: q.why_it_matters,
    route_to: q.route_to,
  }));

  return {
    pattern_id: patternId,
    business_id: catalog.business_id,
    family: candidate.family,
    pattern_key: candidate.pattern_key,
    title: candidate.title,
    statement: candidate.statement,
    pattern_type: candidate.pattern_type,
    status,
    strength: candidate.strength,
    confidence,
    evidence_refs: dedup.unique_refs,
    evidence_count: dedup.total_count,
    independent_source_count: dedup.independent_count,
    first_observed_at: firstObservedAt,
    last_observed_at: lastObservedAt,
    freshness,
    direction: candidate.direction,
    trend: '',
    supporting_facts: candidate.supporting_facts || [],
    contradicting_facts: candidate.contradicting_facts || [],
    source_domains: [...new Set(resolvedEvidence.map((r) => r.source_domain))] as any,
    client_visibility: clientVisibility,
    advisor_confirmed: false,
    advisor_contested: false,
    advisor_confirmed_by: null,
    advisor_confirmed_at: null,
    implications: candidate.implications || [],
    related_pattern_ids: [],
    dna_questions: dnaQuestions,
    supersedes_pattern_id: contradiction.existing_pattern_id,
    superseded_by_pattern_id: null,
    metadata: {
      contradiction_detected: hasMaterialContradiction,
      contradiction_explanation: contradiction.explanation,
    },
    created_at: now,
    updated_at: now,
  };
}

// ── Build BusinessDNA from Patterns + Evidence ──────────────────────────────
export function buildBusinessDNA(
  business_id: string,
  patterns: BusinessDNAPattern[],
  catalog: EvidenceCatalog,
): BusinessDNA {
  const now = new Date().toISOString();

  // Evidence summary
  const dedup = deduplicateEvidenceByLineage(catalog.evidence_refs);
  const byDomain: Record<string, number> = {};
  for (const ref of dedup.unique_refs) {
    byDomain[ref.source_domain] = (byDomain[ref.source_domain] || 0) + 1;
  }

  // Families summary
  const families_summary = {} as BusinessDNA['families_summary'];
  for (const family of DNA_FAMILIES) {
    const familyPatterns = patterns.filter((p) => p.family === family);
    families_summary[family] = {
      pattern_count: familyPatterns.length,
      established_count: familyPatterns.filter((p) => p.status === 'established').length,
      emerging_count: familyPatterns.filter((p) => p.status === 'emerging').length,
      candidate_count: familyPatterns.filter((p) => p.status === 'candidate').length,
    };
  }

  const meta: BusinessDNAMeta = {
    sources_used: Object.keys(byDomain),
    contract_consumed: catalog.contract_summary !== null,
    no_calculations_performed: true,
    no_duplicate_intelligence: true,
    no_authoritative_recalculation: true,
    generated_at: now,
  };

  return {
    business_id,
    patterns,
    evidence_summary: {
      total_evidence_refs: dedup.total_count,
      independent_lineages: dedup.independent_count,
      by_domain: byDomain,
    },
    families_summary,
    generated_at: now,
    _meta: meta,
  };
}

// ── Build Pattern Evolution (THEN / NOW / DIRECTION) ─────────────────────────
export function buildPatternEvolution(
  patterns: BusinessDNAPattern[],
  patternId: string,
): PatternEvolution | null {
  const pattern = patterns.find((p) => p.pattern_id === patternId);
  if (!pattern) return null;

  // Find the superseded version (the "then")
  const oldPattern = pattern.supersedes_pattern_id
    ? patterns.find((p) => p.pattern_id === pattern.supersedes_pattern_id)
    : null;

  return {
    pattern_id: pattern.pattern_id,
    title: pattern.title,
    family: pattern.family,
    then_status: oldPattern?.status || pattern.status,
    now_status: pattern.status,
    then_strength: oldPattern?.strength || pattern.strength,
    now_strength: pattern.strength,
    direction: pattern.direction,
    evidence_summary: `${pattern.evidence_count} evidence refs, ${pattern.independent_source_count} independent sources`,
    first_observed_at: pattern.first_observed_at,
    last_observed_at: pattern.last_observed_at,
  };
}

// ── Generate Pattern ID ───────────────────────────────────────────────────────
export function generatePatternId(businessId: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `dna-${businessId.substring(0, 8)}-${timestamp}${random}`;
}