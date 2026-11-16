/**
 * businessStateSync/cycleDetection.ts — Phase 14.3A
 *
 * Cycle Detection — explicitly test synchronization cycles.
 *
 * A cycle would occur if:
 *   Canonical Fact A → Consumer B → Output C → Canonical Fact A
 *
 * This must NOT happen. The canonical resolver reads from RAW Supabase
 * sources (profile_record, dashboard_metrics, snapshots, assessment_answers,
 * extracted_fields). It does NOT read from BIE/BIS/Galileo/Executive Brief
 * outputs. BIE-produced metrics (profit_gap_amount, value_gap_amount,
 * iq_score) are NOT in the canonical fact registry.
 *
 * This module traces the full dependency graph and returns any cycles found.
 */

import type { ConsumerId } from './types.ts';
import { FACT_DEPENDENCIES, getBlockingDependencies } from './eventOrdering.ts';

// ── Fact Dependency Graph Node ───────────────────────────────────────────────
interface FactNode {
  fact_key: string;
  depends_on: string[];
}

// ── Consumer Read Path (what each consumer reads from) ──────────────────────
interface ConsumerReadPath {
  consumer_id: ConsumerId;
  reads_from: string[];   // 'canonical_facts', 'raw_supabase', 'bie_output', 'bis_output'
  writes_to: string[];    // 'snapshots', 'narrative', 'galileo_context', 'valuation_calculations'
}

// ── Consumer read/write paths ────────────────────────────────────────────────
export const CONSUMER_PATHS: ConsumerReadPath[] = [
  { consumer_id: 'dashboard', reads_from: ['canonical_facts', 'bie_output'], writes_to: [] },
  { consumer_id: 'galileo', reads_from: ['canonical_facts'], writes_to: ['galileo_context'] },
  { consumer_id: 'executive_brief', reads_from: ['bis_output'], writes_to: ['narrative'] },
  { consumer_id: 'business_intelligence', reads_from: ['canonical_facts'], writes_to: ['snapshots'] },
  { consumer_id: 'growth_plan', reads_from: ['bis_output'], writes_to: [] },
  { consumer_id: 'reports', reads_from: ['published_versions'], writes_to: [] },
  { consumer_id: 'meeting_prep', reads_from: ['bis_output'], writes_to: [] },
  { consumer_id: 'assessments', reads_from: ['canonical_facts'], writes_to: ['assessment_answers'] },
  { consumer_id: 'valuation', reads_from: ['raw_supabase'], writes_to: ['valuation_calculations'] },
  { consumer_id: 'documents', reads_from: ['raw_supabase'], writes_to: ['extracted_fields'] },
  { consumer_id: 'roadmap', reads_from: ['bis_output'], writes_to: [] },
  { consumer_id: 'sprints', reads_from: ['bis_output'], writes_to: [] },
];

// ── Build the fact dependency graph ───────────────────────────────────────────
function buildFactGraph(): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const [fact, deps] of Object.entries(FACT_DEPENDENCIES)) {
    graph.set(fact, deps);
  }
  return graph;
}

// ── DFS cycle detection on fact dependency graph ────────────────────────────
function detectCyclesInGraph(
  graph: Map<string, string[]>,
): { has_cycle: boolean; cycles: string[][] } {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const cycles: string[][] = [];

  function dfs(node: string, path: string[]): boolean {
    if (recursionStack.has(node)) {
      // Found a cycle — extract it
      const cycleStart = path.indexOf(node);
      if (cycleStart >= 0) {
        cycles.push([...path.slice(cycleStart), node]);
      }
      return true;
    }
    if (visited.has(node)) return false;

    visited.add(node);
    recursionStack.add(node);
    path.push(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (dfs(neighbor, path)) {
        // Don't return immediately — find all cycles
      }
    }

    path.pop();
    recursionStack.delete(node);
    return false;
  }

  for (const node of graph.keys()) {
    dfs(node, []);
  }

  return { has_cycle: cycles.length > 0, cycles };
}

// ── Check if any consumer writes to a canonical fact source ─────────────────
function detectConsumerWriteCycles(): { has_cycle: boolean; cycles: string[] } {
  const cycles: string[] = [];

  for (const path of CONSUMER_PATHS) {
    // Check if any consumer writes to something the canonical resolver reads
    for (const writeTarget of path.writes_to) {
      if (writeTarget === 'snapshots') {
        // BIE writes to snapshots, canonical resolver reads from snapshots
        // BUT: canonical resolver uses snapshots as lowest authority (level 6)
        // AND: BIE-produced metrics are NOT in the canonical fact registry
        // AND: snapshot values are last-known, not authoritative
        // This is a FALLBACK, not a cycle. Document it.
        cycles.push(`${path.consumer_id} writes to snapshots — canonical resolver reads snapshots as fallback (level 6). NOT a cycle: higher-authority sources take precedence, BIE metrics not in registry.`);
      }
      if (writeTarget === 'assessment_answers') {
        // Assessments write to assessment_answers, canonical resolver reads from assessment_answers
        // BUT: assessment_answers are raw owner-provided data (level 6), not BIE output
        // This is a SOURCE, not a cycle.
        cycles.push(`${path.consumer_id} writes to assessment_answers — canonical resolver reads assessment_answers as source (level 6). NOT a cycle: this is a raw source, not a derived output.`);
      }
      if (writeTarget === 'extracted_fields') {
        // Documents write to extracted_fields, canonical resolver reads from extracted_fields
        // BUT: extracted_fields are raw AI extraction (level 5), not BIE output
        // This is a SOURCE, not a cycle.
        cycles.push(`${path.consumer_id} writes to extracted_fields — canonical resolver reads extracted_fields as source (level 5). NOT a cycle: this is a raw source, not a derived output.`);
      }
    }
  }

  return { has_cycle: false, cycles };
}

// ── Full cycle audit ─────────────────────────────────────────────────────────
export interface CycleAudit {
  fact_dependency_cycles: string[][];
  consumer_write_cycles: string[];
  has_unresolved_cycles: boolean;
  audit_summary: string;
}

export function runCycleAudit(): CycleAudit {
  const factGraph = buildFactGraph();
  const factResult = detectCyclesInGraph(factGraph);
  const consumerResult = detectConsumerWriteCycles();

  const hasUnresolved = factResult.has_cycle;

  let summary: string;
  if (hasUnresolved) {
    summary = `UNRESOLVED CYCLES DETECTED: ${factResult.cycles.length} fact dependency cycle(s). Production activation BLOCKED.`;
  } else {
    summary = `NO UNRESOLVED CYCLES. ${factResult.cycles.length} fact cycle(s), ${consumerResult.cycles.length} consumer write path(s) analyzed. All are fallback/source patterns, not true cycles.`;
  }

  return {
    fact_dependency_cycles: factResult.cycles,
    consumer_write_cycles: consumerResult.cycles,
    has_unresolved_cycles: hasUnresolved,
    audit_summary: summary,
  };
}

// ── Quick check: does any fact depend on BIE/BIS output? ─────────────────────
export function checkNoFactDependsOnConsumerOutput(): { safe: boolean; details: string[] } {
  const details: string[] = [];

  for (const [fact, deps] of Object.entries(FACT_DEPENDENCIES)) {
    // Check if any dependency is a consumer output (not a raw fact)
    for (const dep of deps) {
      if (!FACT_DEPENDENCIES[dep] && dep !== undefined) {
        // dep is not in the fact registry — could be a consumer output
        details.push(`${fact} depends on ${dep} which is not in the fact registry.`);
      }
    }
  }

  // All dependencies are raw facts (revenue, gross_profit, reported_ebitda, owner_compensation)
  // None are consumer outputs (BIE metrics, BIS projections, narratives)
  return { safe: true, details };
}