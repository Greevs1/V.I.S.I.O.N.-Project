/**
 * meetingIntelligence/suggestedQuestions.ts — Phase 15.3
 *
 * Suggested Questions synthesis.
 *
 * Generates structured discussion prompts — NOT conclusions.
 * Every question references certified evidence.
 *
 * Examples:
 *   "I noticed gross margin improved while labor costs also increased. What changed operationally?"
 *   "Customer concentration increased. Was this intentional?"
 *   "Your recurring revenue accelerated. How sustainable is that trend?"
 *
 * Constitution Compliance:
 *   Article I — One Truth (questions reference facts, do not create them)
 *   Article IV — Explainability (every question cites evidence)
 *   Article V — Advisor Governance (questions prompt discussion, not decisions)
 */

import type {
  SuggestedQuestion,
  QuestionEvidence,
  MeetingIntelligenceInput,
  MeetingContext,
  MeetingIntentType,
  MeetingConfidenceSource,
} from './types.ts';

/**
 * Build suggested questions from the Meeting Context and certified inputs.
 * Questions are PROMPTS, not conclusions. Every question cites evidence.
 */
export function buildSuggestedQuestions(
  context: MeetingContext,
  input: MeetingIntelligenceInput
): SuggestedQuestion[] {
  const questions: SuggestedQuestion[] = [];
  const intent = context.intent;

  // ── From Business Changes ─────────────────────────────────────────────────
  for (const change of context.major_business_changes.slice(0, 5)) {
    const q = questionFromChange(change, intent);
    if (q) questions.push(q);
  }

  // ── From Risks ─────────────────────────────────────────────────────────────
  for (const risk of context.risks.slice(0, 3)) {
    questions.push(questionFromRisk(risk, intent));
  }

  // ── From Opportunities ─────────────────────────────────────────────────────
  for (const opp of context.opportunities.slice(0, 3)) {
    questions.push(questionFromOpportunity(opp, intent));
  }

  // ── From Pending Reviews (intent-specific) ────────────────────────────────
  if (intent === 'valuation_review' || intent === 'internal_advisor_review') {
    for (const review of context.pending_reviews.slice(0, 3)) {
      questions.push(questionFromReview(review, intent));
    }
  }

  // ── From Outstanding Requests ──────────────────────────────────────────────
  for (const req of context.outstanding_requests.slice(0, 2)) {
    questions.push(questionFromRequest(req, intent));
  }

  // ── From Momentum (if direction is mixed or declining) ────────────────────
  const momentum = context.business_momentum;
  if (momentum.direction === 'declining' || momentum.direction === 'mixed') {
    questions.push({
      id: `q-momentum-${context.meeting_id}`,
      prompt: `Business momentum is currently ${momentum.direction}. What factors are driving this, and what would shift it positive?`,
      why_ask: 'Understanding momentum drivers helps prioritize corrective action',
      evidence_references: [{
        source_name: 'Business Momentum',
        source_type: 'engine_output',
        source_id: context.meeting_id,
        certified_owner: 'living_intelligence',
      }],
      intent_relevance: ['quarterly_review', 'monthly_review', 'strategy_session', 'annual_planning'],
      confidence_source: MeetingConfidenceSource.MEETING_SYNTHESIS,
    });
  }

  // ── Deduplicate and limit ─────────────────────────────────────────────────
  const unique = deduplicateQuestions(questions);
  return unique.slice(0, 7); // Maximum 7 — clarity over completeness
}

// ── Question builders ─────────────────────────────────────────────────────────

function questionFromChange(change: any, intent: MeetingIntentType): SuggestedQuestion | null {
  const summary = change.summary || '';
  if (!summary) return null;

  return {
    id: `q-change-${change.id}`,
    prompt: `"${summary}" — what drove this change, and is it expected to continue?`,
    why_ask: 'Understanding the cause of business changes helps assess sustainability',
    evidence_references: [{
      source_name: 'Business Timeline',
      source_type: 'timeline',
      source_id: change.source_ref || change.id,
      certified_owner: change.certified_owner,
    }],
    intent_relevance: ['quarterly_review', 'monthly_review', 'strategy_session', 'board_meeting'],
    confidence_source: MeetingConfidenceSource.CERTIFIED_ENGINE_OUTPUT,
  };
}

function questionFromRisk(risk: any, intent: MeetingIntentType): SuggestedQuestion {
  return {
    id: `q-risk-${risk.id}`,
    prompt: `"${risk.headline}" is flagged as a ${risk.severity} risk. What's your perspective on mitigation?`,
    why_ask: 'Risk awareness supports proactive mitigation planning',
    evidence_references: [{
      source_name: 'Executive Context — Top Risks',
      source_type: 'engine_output',
      source_id: risk.id,
      certified_owner: risk.certified_owner,
    }],
    intent_relevance: ['quarterly_review', 'monthly_review', 'exit_planning', 'strategy_session', 'internal_advisor_review'],
    confidence_source: MeetingConfidenceSource.CERTIFIED_ENGINE_OUTPUT,
  };
}

function questionFromOpportunity(opp: any, intent: MeetingIntentType): SuggestedQuestion {
  return {
    id: `q-opp-${opp.id}`,
    prompt: `"${opp.headline}" shows potential. Should we prioritize this in the next cycle?`,
    why_ask: 'Opportunity prioritization supports growth planning',
    evidence_references: [{
      source_name: 'Executive Context — Top Opportunities',
      source_type: 'engine_output',
      source_id: opp.id,
      certified_owner: opp.certified_owner,
    }],
    intent_relevance: ['growth_planning', 'quarterly_review', 'annual_planning', 'strategy_session'],
    confidence_source: MeetingConfidenceSource.CERTIFIED_ENGINE_OUTPUT,
  };
}

function questionFromReview(review: any, intent: MeetingIntentType): SuggestedQuestion {
  return {
    id: `q-review-${review.id}`,
    prompt: `"${review.title}" requires ${review.review_type}. What's your recommendation?`,
    why_ask: 'Advisor input on pending reviews moves the valuation forward',
    evidence_references: [{
      source_name: 'Verification Queue',
      source_type: 'engine_output',
      source_id: review.id,
      certified_owner: review.certified_owner,
    }],
    intent_relevance: ['valuation_review', 'internal_advisor_review', 'exit_planning'],
    confidence_source: MeetingConfidenceSource.CERTIFIED_ENGINE_OUTPUT,
  };
}

function questionFromRequest(req: any, intent: MeetingIntentType): SuggestedQuestion {
  const typeLabel = req.request_type === 'document' ? 'document' : 'confirmation';
  return {
    id: `q-req-${req.id}`,
    prompt: `We're still waiting on ${typeLabel} for "${req.title}". Can you provide an update?`,
    why_ask: 'Outstanding requests block progress — follow-up keeps things moving',
    evidence_references: [{
      source_name: 'Client Requests',
      source_type: 'engine_output',
      source_id: req.id,
      certified_owner: req.certified_owner,
    }],
    intent_relevance: ['quarterly_review', 'monthly_review', 'valuation_review', 'discovery_call'],
    confidence_source: MeetingConfidenceSource.CERTIFIED_ENGINE_OUTPUT,
  };
}

function deduplicateQuestions(questions: SuggestedQuestion[]): SuggestedQuestion[] {
  const seen = new Set<string>();
  return questions.filter(q => {
    const key = q.prompt.slice(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}