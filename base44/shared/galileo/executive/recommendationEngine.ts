/**
 * Recommendation Engine — Phase 13.4C.1
 *
 * Generates recommendations. Not responses.
 * Every recommendation includes: reason, priority, estimated impact,
 * confidence, next capability.
 *
 * Pure reasoning. No LLM.
 */
import type {
  ExecutiveState, SituationAssessment, Priority, Recommendation, IntentType, ExecutionStrategyType
} from './types.ts';

let recommendationCounter = 0;

function generateId(): string {
  recommendationCounter++;
  return `rec_${Date.now()}_${recommendationCounter}`;
}

export function generateRecommendations(
  state: ExecutiveState,
  assessment: SituationAssessment,
  priorities: Priority[]
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  // Generate from priorities
  for (const priority of priorities.slice(0, 5)) {
    const rec = priorityToRecommendation(priority, state, assessment);
    if (rec) recommendations.push(rec);
  }

  // Generate from assessment gaps
  if (assessment.whatIsIncomplete.length > 0 && recommendations.length < 5) {
    recommendations.push({
      id: generateId(),
      title: 'Review Incomplete Items',
      description: `${assessment.whatIsIncomplete.length} item(s) need attention`,
      reason: 'Incomplete items may block progress on valuation or publication.',
      priority: 'medium',
      estimatedImpact: 'Unblocks downstream workflows',
      confidence: 70,
      nextCapabilityId: 'review.missing_information',
      nextCapabilityName: 'Review Missing Information',
      intent: 'review' as IntentType,
      executionStrategy: 'advisor' as ExecutionStrategyType,
      missingEvidence: [],
    });
  }

  // Generate from opportunities
  if (state.growthPlanState && state.growthPlanState.readyInitiatives > 0 && recommendations.length < 5) {
    recommendations.push({
      id: generateId(),
      title: 'Increase Enterprise Value',
      description: `${state.growthPlanState.readyInitiatives} initiative(s) ready for execution`,
      reason: 'Ready initiatives can directly impact enterprise value.',
      priority: 'medium',
      estimatedImpact: 'Quantifiable EV improvement',
      confidence: 75,
      nextCapabilityId: 'increase.enterprise_value',
      nextCapabilityName: 'Increase Enterprise Value',
      intent: 'execute' as IntentType,
      executionStrategy: 'advisor' as ExecutionStrategyType,
      missingEvidence: [],
    });
  }

  return recommendations;
}

function priorityToRecommendation(
  priority: Priority,
  state: ExecutiveState,
  _assessment: SituationAssessment
): Recommendation | null {
  if (!priority.relatedCapabilityId) return null;

  const intentMap: Record<string, IntentType> = {
    publication: 'publish',
    verification: 'investigate',
    meeting: 'prepare',
    document: 'review',
    growth: 'plan',
  };

  const strategyMap: Record<string, ExecutionStrategyType> = {
    publication: 'confirm',
    verification: 'advisor',
    meeting: 'advisor',
    document: 'read',
    growth: 'advisor',
  };

  const impactMap: Record<string, string> = {
    critical: 'Blocks publication',
    high: 'Enables next workflow stage',
    medium: 'Improves data quality',
    low: 'Strategic advancement',
  };

  return {
    id: generateId(),
    title: priority.title,
    description: priority.description,
    reason: priority.explainable,
    priority: priority.level,
    estimatedImpact: impactMap[priority.level] || 'Improves overall position',
    confidence: state.valuationId ? 80 : 50,
    nextCapabilityId: priority.relatedCapabilityId,
    nextCapabilityName: formatName(priority.relatedCapabilityId),
    intent: intentMap[priority.category] || 'review',
    executionStrategy: strategyMap[priority.category] || 'advisor',
    missingEvidence: state.valuationId ? [] : ['Active valuation'],
  };
}

function formatName(capId: string): string {
  return capId.split('.').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}