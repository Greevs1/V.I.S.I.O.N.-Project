/**
 * canonicalFact/resolverHelpers.ts — Phase 14.2B
 *
 * Shared resolver helpers extracted from canonicalFactService so that
 * both the canonicalFactService backend function and the consumerAdapter
 * can reuse the exact same candidate-loading and advisor-approved-value
 * logic without duplication.
 *
 * Reuses:
 *   - intelligenceMapping.FIELD_REGISTRY (existing certified resolvers)
 *   - canonicalFact.contextLoader.FACT_KEY_TO_FIELD_REGISTRY
 *   - canonicalFact.contextLoader.loadIntelligenceContext
 *
 * NO WRITES. NO PROPAGATION. READ-only helpers.
 */

import {
  FIELD_REGISTRY,
  type FieldDef,
  type ResolverResult,
  type IntelligenceContext,
} from '../valuationEngine/intelligenceMapping.ts';
import { FACT_KEY_TO_FIELD_REGISTRY } from './contextLoader.ts';

// ── Load candidates for a fact using existing FIELD_REGISTRY resolvers ──────
export async function loadCandidates(
  factKey: string,
  intelCtx: IntelligenceContext,
): Promise<ResolverResult[]> {
  const registryKey = FACT_KEY_TO_FIELD_REGISTRY[factKey];
  if (!registryKey) {
    return [];
  }

  const fieldDef: FieldDef | undefined = FIELD_REGISTRY.find((f) => f.field_key === registryKey);
  if (!fieldDef) return [];

  const results: ResolverResult[] = [];
  for (const resolve of fieldDef.resolvers) {
    try {
      const result = resolve(intelCtx);
      if (result) results.push(result);
    } catch {
      // Resolver errors are non-fatal — skip this candidate
    }
  }

  return results;
}

// ── Get advisor-approved valuation answer for a fact (governance lock) ──────
export function getAdvisorApprovedValue(
  factKey: string,
  intelCtx: IntelligenceContext,
): ResolverResult | null {
  const registryKey = FACT_KEY_TO_FIELD_REGISTRY[factKey];
  if (!registryKey) return null;

  const fieldDef = FIELD_REGISTRY.find((f) => f.field_key === registryKey);
  if (!fieldDef || !fieldDef.question_key) return null;

  const q = (intelCtx.valuationQuestions || []).find((x: any) => x.question_key === fieldDef.question_key);
  if (!q) return null;

  const a = (intelCtx.valuationAnswers || []).find((x: any) => x.question_id === q.id);
  if (!a || a.answer_value == null) return null;

  const isVerified = a.advisor_verification_status === 'verified' || a.is_confirmed;
  if (!isVerified) return null;

  return {
    value: a.answer_value,
    source_type: 'advisor_entry' as any,
    source_id: a.id,
    source_name: 'Advisor Entry (approved)',
    source_date: a.answered_at,
    confidence: 95,
  };
}