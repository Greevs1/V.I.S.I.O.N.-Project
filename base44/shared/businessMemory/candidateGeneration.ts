/**
 * businessMemory/candidateGeneration.ts — Phase 15.5
 *
 * Memory Candidate Generation.
 *
 * Reuses approved post-meeting outcomes as the first candidate source.
 * Also defines future candidate sources from:
 *   - major advisor-approved strategic decisions
 *   - Growth Plan milestones
 *   - valuation publication
 *   - major verification resolution
 *   - long-term owner objective
 *   - major business structure change
 *
 * Does NOT automatically confirm memories.
 * Creates candidates only — advisor must confirm.
 */

import type {
  MemoryCandidate,
  MemoryCategory,
  MemorySourceType,
  CreatedFrom,
  MemoryImportance,
  MemorySourceReference,
  MemoryEvidence,
} from './types.ts';
import { runDurabilityTest } from './durabilityTest.ts';
import {
  getDefaultImportance,
  getDefaultClientVisible,
  getTypicalRelevanceTags,
} from './categories.ts';

// ── Post-Meeting Outcome → Memory Candidate ────────────────────────────────────
// The first candidate source: approved post-meeting outcomes that were
// flagged as memory_candidate=true.
export function generateCandidatesFromOutcome(outcome: {
  outcome_id: string;
  type: string;
  title: string;
  description: string;
  memory_candidate: boolean;
  memory_category: string | null;
  source_meeting_context: { business_id: string; meeting_id: string; intent: string };
  supporting_evidence?: any[];
  client_visible?: boolean;
  approved_at?: string | null;
}): MemoryCandidate | null {
  // Only outcomes flagged as memory candidates
  if (!outcome.memory_candidate) return null;

  // Map outcome type to memory category
  const category = mapOutcomeTypeToCategory(outcome.type, outcome.memory_category);
  if (!category) return null;

  // Build source reference — reference the post-meeting outcome, do NOT copy it
  const sourceReference: MemorySourceReference = {
    record_type: 'post_meeting_outcome',
    record_id: outcome.outcome_id,
    record_summary: outcome.title,
  };

  // Build source evidence from outcome's supporting evidence
  const sourceEvidence: MemoryEvidence[] = (outcome.supporting_evidence || []).map((e: any) => ({
    source_name: e.source_name || 'meeting_outcome',
    source_type: e.source_type || 'meeting_brief',
    source_id: e.source_id || outcome.outcome_id,
  }));

  const candidate: MemoryCandidate = {
    candidate_id: `candidate-${outcome.outcome_id}-${Date.now()}`,
    business_id: outcome.source_meeting_context.business_id,
    category,
    title: outcome.title,
    summary: outcome.description,
    effective_date: outcome.approved_at || new Date().toISOString().split('T')[0],
    importance: getDefaultImportance(category),
    confidence: 80, // outcomes are advisor-approved, so reasonable confidence
    source_type: 'post_meeting_outcome',
    source_reference: sourceReference,
    source_evidence: sourceEvidence,
    created_from: 'post_meeting_closeout',
    client_visible: outcome.client_visible ?? getDefaultClientVisible(category),
    relevance_tags: getTypicalRelevanceTags(category),
    durability_test: runDurabilityTest({
      title: outcome.title,
      summary: outcome.description,
      source_reference: sourceReference,
      source_evidence: sourceEvidence,
      category,
    }),
    duplicate_check: { has_duplicate: false, duplicate_type: 'none', existing_memory_id: null, existing_memory_title: null, existing_memory_status: null, recommended_action: 'create_new' },
    proposed_at: new Date().toISOString(),
    proposed_by_system: 'post_meeting_intelligence',
  };

  // If durability test fails, do not generate the candidate
  if (!candidate.durability_test.passed) {
    return null;
  }

  return candidate;
}

// ── Outcome Type → Memory Category Mapping ────────────────────────────────────
function mapOutcomeTypeToCategory(
  outcomeType: string,
  memoryCategory: string | null
): MemoryCategory | null {
  // If the outcome already has a memory_category, use it
  if (memoryCategory && isValidCategory(memoryCategory)) {
    return memoryCategory as MemoryCategory;
  }

  // Map by outcome type
  const mapping: Record<string, MemoryCategory> = {
    decision: 'strategic_decision',
    commitment: 'major_commitment',
    growth_plan_candidate: 'strategic_decision',
    valuation_review_candidate: 'advisor_decision',
    timeline_event_candidate: 'material_business_event',
  };

  return mapping[outcomeType] || null;
}

function isValidCategory(cat: string): boolean {
  const valid: MemoryCategory[] = [
    'strategic_decision', 'long_term_objective', 'owner_preference',
    'advisor_decision', 'major_commitment', 'material_business_event',
    'leadership_change', 'operating_philosophy', 'transaction_intent',
    'risk_acceptance', 'capital_allocation_decision', 'strategic_constraint',
  ];
  return valid.includes(cat as MemoryCategory);
}

// ── Advisor Capture → Memory Candidate ────────────────────────────────────────
// For when an advisor manually captures a durable context item.
export function generateCandidateFromAdvisorCapture(params: {
  business_id: string;
  category: MemoryCategory;
  title: string;
  summary: string;
  effective_date?: string | null;
  importance?: MemoryImportance;
  client_visible?: boolean;
  source_reference?: MemorySourceReference | null;
  source_evidence?: MemoryEvidence[];
  relevance_tags?: string[];
}): MemoryCandidate | null {
  const sourceReference = params.source_reference || {
    record_type: 'advisor_capture',
    record_id: `capture-${Date.now()}`,
    record_summary: params.title,
  };

  const sourceEvidence = params.source_evidence || [{
    source_name: 'advisor_capture',
    source_type: 'advisor_note',
    source_id: `capture-${Date.now()}`,
  }];

  const candidate: MemoryCandidate = {
    candidate_id: `candidate-capture-${Date.now()}`,
    business_id: params.business_id,
    category: params.category,
    title: params.title,
    summary: params.summary,
    effective_date: params.effective_date || new Date().toISOString().split('T')[0],
    importance: params.importance || getDefaultImportance(params.category),
    confidence: 75,
    source_type: 'advisor_capture',
    source_reference: sourceReference,
    source_evidence: sourceEvidence,
    created_from: 'advisor_capture',
    client_visible: params.client_visible ?? getDefaultClientVisible(params.category),
    relevance_tags: params.relevance_tags || getTypicalRelevanceTags(params.category),
    durability_test: runDurabilityTest({
      title: params.title,
      summary: params.summary,
      source_reference: sourceReference,
      source_evidence: sourceEvidence,
      category: params.category,
    }),
    duplicate_check: { has_duplicate: false, duplicate_type: 'none', existing_memory_id: null, existing_memory_title: null, existing_memory_status: null, recommended_action: 'create_new' },
    proposed_at: new Date().toISOString(),
    proposed_by_system: 'advisor_capture',
  };

  if (!candidate.durability_test.passed) {
    return null;
  }

  return candidate;
}

// ── Batch Candidate Generation ──────────────────────────────────────────────────
export function generateCandidatesFromOutcomes(outcomes: any[]): MemoryCandidate[] {
  return outcomes
    .map((o) => generateCandidatesFromOutcome(o))
    .filter((c): c is MemoryCandidate => c !== null);
}