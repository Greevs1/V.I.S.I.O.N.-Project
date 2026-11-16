/**
 * businessMemory/durabilityTest.ts — Phase 15.5
 *
 * Memory Quality Test — every candidate must pass before becoming a memory.
 *
 * A candidate must be:
 *   1. Durable — it will remain relevant beyond the current moment
 *   2. Meaningful — it has executive significance
 *   3. Supported — it has evidence or source reference
 *   4. Improves future decisions — losing it would reduce decision quality
 *   5. Not belonging elsewhere — it is not a note, fact, timeline event, or audit
 *
 * If any check fails, the candidate does NOT become memory.
 */

import type { DurabilityTestResult, MemoryCandidate } from './types.ts';

export function runDurabilityTest(candidate: {
  title: string;
  summary: string;
  source_reference: MemoryCandidate['source_reference'];
  source_evidence: MemoryCandidate['source_evidence'];
  category: string;
}): DurabilityTestResult {
  const failureReasons: string[] = [];

  // 1. Is it durable? — does the summary suggest lasting relevance?
  const isDurable = checkDurability(candidate.summary, candidate.category);

  // 2. Is it meaningful? — is there enough substance?
  const isMeaningful = checkMeaningfulness(candidate.title, candidate.summary);

  // 3. Is it supported? — does it have evidence or a source reference?
  const isSupported = checkSupport(candidate.source_reference, candidate.source_evidence);

  // 4. Will it improve future decisions? — is it actionable context?
  const improvesFuture = checkFutureImpact(candidate.summary, candidate.category);

  // 5. Does it belong somewhere else? — is it actually a note/fact/timeline event?
  const belongsElsewhere = checkBelongsElsewhere(candidate.summary, candidate.category);

  if (!isDurable) failureReasons.push('Not durable — relevance appears to be short-term only');
  if (!isMeaningful) failureReasons.push('Not meaningful — insufficient executive substance');
  if (!isSupported) failureReasons.push('Not supported — no evidence or source reference');
  if (!improvesFuture) failureReasons.push('Does not improve future decisions');
  if (belongsElsewhere) failureReasons.push('Belongs in another system (note, fact, timeline, audit)');

  return {
    passed: failureReasons.length === 0,
    is_durable: isDurable,
    is_meaningful: isMeaningful,
    is_supported: isSupported,
    improves_future_decisions: improvesFuture,
    belongs_elsewhere: belongsElsewhere,
    failure_reasons: failureReasons,
  };
}

function checkDurability(summary: string, category: string): boolean {
  if (!summary || summary.length < 15) return false;

  // Transaction intent, long-term objectives, strategic decisions are inherently durable
  const durableCategories = [
    'long_term_objective',
    'transaction_intent',
    'strategic_decision',
    'operating_philosophy',
    'capital_allocation_decision',
  ];
  if (durableCategories.includes(category)) return true;

  // Check for durability indicators in the summary
  const durabilityIndicators = [
    'intends', 'plans to', 'agreed to', 'decided to', 'committed to',
    'shifted toward', 'changed', 'restructured', 'pivoted', 'accepted',
    'rejected', 'approved', 'concluded', 'long-term', 'before exit',
  ];

  const lowerSummary = summary.toLowerCase();
  return durabilityIndicators.some((ind) => lowerSummary.includes(ind));
}

function checkMeaningfulness(title: string, summary: string): boolean {
  if (!title || title.length < 5) return false;
  if (!summary || summary.length < 15) return false;
  // Reject purely transactional notes
  const transactionalPatterns = [
    'sent an email', 'called to remind', 'follow up on',
    'reminder:', 'todo:', 'action item:', 'pending',
  ];
  const lowerSummary = summary.toLowerCase();
  return !transactionalPatterns.some((p) => lowerSummary.includes(p));
}

function checkSupport(
  sourceReference: MemoryCandidate['source_reference'],
  sourceEvidence: MemoryCandidate['source_evidence']
): boolean {
  // Must have either a source reference or at least one evidence item
  if (sourceReference && sourceReference.record_id) return true;
  if (sourceEvidence && sourceEvidence.length > 0) return true;
  return false;
}

function checkFutureImpact(summary: string, category: string): boolean {
  if (!summary) return false;

  // Categories that inherently improve future decisions
  const highImpactCategories = [
    'long_term_objective',
    'transaction_intent',
    'strategic_decision',
    'advisor_decision',
    'operating_philosophy',
    'risk_acceptance',
    'strategic_constraint',
  ];
  if (highImpactCategories.includes(category)) return true;

  // Check for forward-looking language
  const forwardLooking = [
    'will influence', 'should guide', 'future', 'going forward',
    'before exit', 'for the next', 'strategically', 'priority',
  ];
  const lowerSummary = summary.toLowerCase();
  return forwardLooking.some((p) => lowerSummary.includes(p));
}

function checkBelongsElsewhere(summary: string, category: string): boolean {
  if (!summary) return false;

  // Patterns that suggest this belongs in another system
  const notePatterns = ['note:', 'jotted down', 'reminder to'];
  const factPatterns = ['revenue is', 'ebitda is', 'current value is', 'as of today'];
  const timelinePatterns = ['uploaded on', 'completed on', 'submitted at'];
  const auditPatterns = ['approved at', 'changed by', 'modified by'];

  const lowerSummary = summary.toLowerCase();

  // If it's primarily a factual statement about current values, it belongs in Canonical Facts
  if (factPatterns.some((p) => lowerSummary.includes(p)) && category === 'material_business_event') {
    return false; // material events can reference current values
  }
  if (factPatterns.some((p) => lowerSummary.includes(p)) && !lowerSummary.includes('decided') && !lowerSummary.includes('agreed')) {
    return true;
  }

  return (
    notePatterns.some((p) => lowerSummary.includes(p)) ||
    timelinePatterns.some((p) => lowerSummary.includes(p)) ||
    auditPatterns.some((p) => lowerSummary.includes(p))
  );
}