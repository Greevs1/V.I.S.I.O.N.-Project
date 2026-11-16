/**
 * businessDNA/lineage.ts — Phase E
 *
 * Evidence Lineage Deduplication — THE CRITICAL INDEPENDENCE ENGINE.
 *
 * Five copies of the same metric are NOT five pieces of evidence.
 *
 * Example:
 *   Tax Gap appears in Dashboard, Executive Brief, Galileo, BIS, BIE.
 *   They all derive from the same underlying assessment_calculations:tax_gap.
 *   That is ONE underlying evidence lineage.
 *
 * This module prevents duplicate confidence inflation by deduplicating
 * evidence by its lineage root before counting independent sources.
 *
 * Constitution Compliance:
 *   Article I — One Truth (lineage root traces to the single source)
 *   Article III — No Duplicate Intelligence (prevents counting copies as independent)
 */

import type { DNAEvidenceRef } from './types.ts';

export interface LineageDedupResult {
  /** All evidence refs, deduplicated by lineage_root (first occurrence wins) */
  unique_refs: DNAEvidenceRef[];
  /** Number of unique lineage roots (= independent evidence count) */
  independent_count: number;
  /** Total refs before dedup */
  total_count: number;
  /** Refs that were duplicates (same lineage root as another) */
  duplicates: DNAEvidenceRef[];
  /** Map of lineage_root → count of refs sharing that root */
  lineage_groups: Record<string, number>;
}

/**
 * Deduplicate evidence by lineage_root.
 *
 * Multiple evidence refs sharing the same lineage_root represent the same
 * underlying fact rendered in different systems. They count as ONE
 * independent evidence source.
 */
export function deduplicateEvidenceByLineage(refs: DNAEvidenceRef[]): LineageDedupResult {
  const seen = new Map<string, DNAEvidenceRef>();
  const duplicates: DNAEvidenceRef[] = [];
  const lineage_groups: Record<string, number> = {};

  for (const ref of refs) {
    const root = ref.lineage_root || `unknown:${ref.evidence_id}`;
    lineage_groups[root] = (lineage_groups[root] || 0) + 1;

    if (seen.has(root)) {
      duplicates.push(ref);
    } else {
      seen.set(root, ref);
    }
  }

  const unique_refs = Array.from(seen.values());

  return {
    unique_refs,
    independent_count: unique_refs.length,
    total_count: refs.length,
    duplicates,
    lineage_groups,
  };
}

/**
 * Count independent evidence sources (lineage-deduplicated).
 */
export function countIndependentSources(refs: DNAEvidenceRef[]): number {
  const roots = new Set<string>();
  for (const ref of refs) {
    roots.add(ref.lineage_root || `unknown:${ref.evidence_id}`);
  }
  return roots.size;
}

/**
 * Count independent evidence sources filtered by domain.
 */
export function countIndependentByDomain(refs: DNAEvidenceRef[]): Record<string, number> {
  const byDomain: Record<string, number> = {};
  const seen = new Set<string>();
  for (const ref of refs) {
    const key = `${ref.source_domain}:${ref.lineage_root}`;
    if (!seen.has(key)) {
      seen.add(key);
      byDomain[ref.source_domain] = (byDomain[ref.source_domain] || 0) + 1;
    }
  }
  return byDomain;
}

/**
 * Build a lineage root for a given source.
 * Standard format: `<underlying_table>:<field_or_key>`
 *
 * Examples:
 *   assessment_calculations:tax_gap
 *   assessment_calculations:profit_gap
 *   business_memories:strategic_decision
 *   business_decisions:dec-xxx
 *   business_valuations:current_value
 */
export function buildLineageRoot(table: string, key: string): string {
  return `${table}:${key}`;
}