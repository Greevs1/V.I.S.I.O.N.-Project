/**
 * canonicalFact/lineage.ts — Phase 14.2A
 *
 * Lineage Assembly. Every resolved fact must be explainable. Lineage is
 * DERIVED from existing audit data — not stored in a graph database.
 *
 * Reuses:
 *   - valuation_calculation_lines (existing audit trail)
 *   - valuation_audit_log (existing change history)
 *   - extracted_fields (existing source documents)
 *   - valuation_adjustments (existing add-backs)
 *   - BIE journal (existing intelligence changes)
 */

import type { LineageNode, FactEvidence } from './types.ts';
import type { ResolverResult } from '../valuationEngine/intelligenceMapping.ts';

// ── Build lineage for a resolved fact ───────────────────────────────────────
// Assembles an ordered chain from primary sources to the current value.
export function buildLineage(
  factKey: string,
  selected: ResolverResult,
  dependencyFactKeys: string[],
): LineageNode[] {
  const lineage: LineageNode[] = [];

  // Step 1: The selected source
  lineage.push({
    step: 1,
    fact_key: factKey,
    operation: 'direct',
    description: `Selected from ${selected.source_name}`,
    source_id: selected.source_id,
    source_name: selected.source_name,
  });

  // Steps 2+: Dependency chain (if this fact is derived)
  dependencyFactKeys.forEach((depKey, idx) => {
    lineage.push({
      step: idx + 2,
      fact_key: depKey,
      operation: 'depends_on',
      description: `Depends on ${depKey}`,
    });
  });

  return lineage;
}

// ── Build evidence list for a resolved fact ─────────────────────────────────
export function buildEvidence(
  selected: ResolverResult,
  alternatives: ResolverResult[],
): FactEvidence[] {
  const evidence: FactEvidence[] = [];

  // Primary evidence: the selected source
  evidence.push({
    type: mapSourceTypeToEvidenceType(selected.source_type),
    source_name: selected.source_name,
    source_id: selected.source_id || '',
    source_date: selected.source_date || '',
    value: selected.value,
    confidence: selected.confidence,
    verified: selected.confidence >= 85,
    reporting_period: selected.reporting_period,
  });

  // Alternative evidence: other candidates
  alternatives.forEach((alt) => {
    evidence.push({
      type: mapSourceTypeToEvidenceType(alt.source_type),
      source_name: alt.source_name,
      source_id: alt.source_id || '',
      source_date: alt.source_date || '',
      value: alt.value,
      confidence: alt.confidence,
      verified: alt.confidence >= 85,
      reporting_period: alt.reporting_period,
    });
  });

  return evidence;
}

function mapSourceTypeToEvidenceType(sourceType: string): FactEvidence['type'] {
  const map: Record<string, FactEvidence['type']> = {
    document: 'document',
    extracted_field: 'document',
    document_analysis: 'document',
    assessment_answer: 'assessment',
    assessment_calculation: 'assessment',
    dashboard_metric: 'derived',
    financial_normalization: 'calculation',
    advisor_entry: 'advisor',
    client_confirmation: 'client',
    benchmark: 'benchmark',
    system_derived: 'derived',
    prior_valuation_answer: 'calculation',
    prior_published_version: 'calculation',
    business_record: 'advisor',
    profile_record: 'client',
    ownership_record: 'advisor',
    gap_analysis: 'assessment',
  };
  return map[sourceType] || 'derived';
}