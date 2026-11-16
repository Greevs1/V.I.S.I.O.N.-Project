/**
 * Executive Intelligence Engine — Main Orchestrator
 * Phase 13.4C.1
 *
 * The ONLY decision layer. Nothing invokes capabilities directly.
 * Every request flows through EIE.
 *
 * Pipeline:
 *   1. Build Executive State
 *   2. Assess Situation
 *   3. Determine Priorities
 *   4. Resolve Intent
 *   5. Select Capability
 *   6. Determine Execution Strategy
 *   7. Generate Recommendations
 *   8. Plan Follow-up
 *   9. Determine Interruption
 *  10. Build Executive Brief
 *  11. Assess Confidence
 *  12. Validate Safety
 *
 * Pure reasoning. No LLM. No capability execution.
 */
import type { EIEInput, EIEDecision, ExecutiveState, Priority } from './types.ts';
import { buildExecutiveState } from './stateModel.ts';
import { assessSituation } from './situationAssessment.ts';
import { determinePriorities } from './priorityEngine.ts';
import { resolveIntent } from './intentResolution.ts';
import { selectCapability } from './capabilitySelection.ts';
import { determineStrategy } from './executionStrategy.ts';
import { generateRecommendations } from './recommendationEngine.ts';
import { planFollowUp } from './followUpPlanner.ts';
import { determineInterruption } from './interruptionPolicy.ts';
import { buildExecutiveBrief } from './executiveBrief.ts';
import { assessConfidence } from './confidenceModel.ts';
import { validateSafety } from './safety.ts';
import {
  trackDecision, trackRecommendationGenerated, trackCapabilitySelection,
  trackPriority,
} from './analytics.ts';

export function process(input: EIEInput): EIEDecision {
  // 1. Build state (priorities computed in step 3, passed back via rebuild)
  let state = buildExecutiveState(input.context, []);

  // 2. Assess situation
  const assessment = assessSituation(state);

  // 3. Determine priorities
  const priorities: Priority[] = determinePriorities(state, assessment);
  state = buildExecutiveState(input.context, priorities);

  // 4. Resolve intent
  const intent = resolveIntent(input.userMessage, state, assessment, priorities);

  // 5. Select capability
  const capabilitySelection = selectCapability(intent, state, assessment, priorities);

  // 6. Determine execution strategy
  const executionStrategy = determineStrategy(capabilitySelection, state, intent);

  // 7. Generate recommendations
  const recommendations = generateRecommendations(state, assessment, priorities);

  // 8. Plan follow-up
  const followUpPlan = planFollowUp(capabilitySelection.selectedCapabilityId, state);

  // 9. Determine interruption (for top recommendation)
  const topRecommendation = recommendations.length > 0 ? recommendations[0] : null;
  const interruptionDecision = determineInterruption(topRecommendation, state);

  // 10. Build executive brief
  const brief = buildExecutiveBrief(state, assessment, priorities, recommendations);

  // 11. Assess confidence
  const confidence = assessConfidence(topRecommendation, state);

  // 12. Validate safety
  const safety = validateSafety('decide');

  // Track analytics
  trackDecision();
  trackCapabilitySelection(capabilitySelection.selectedCapabilityId);
  recommendations.forEach((r) => {
    trackRecommendationGenerated();
    trackPriority(r.priority);
  });

  return {
    state,
    assessment,
    priorities,
    intent,
    capabilitySelection,
    executionStrategy,
    recommendations,
    followUpPlan,
    interruptionDecision,
    brief,
    confidence,
    safety,
  };
}

export function processWithoutMessage(context: import('./types.ts').EIEContext): EIEDecision {
  return process({ userMessage: '', context });
}

export { buildExecutiveState } from './stateModel.ts';
export { assessSituation } from './situationAssessment.ts';
export { determinePriorities } from './priorityEngine.ts';
export { resolveIntent } from './intentResolution.ts';
export { selectCapability } from './capabilitySelection.ts';
export { determineStrategy } from './executionStrategy.ts';
export { generateRecommendations } from './recommendationEngine.ts';
export { planFollowUp } from './followUpPlanner.ts';
export { determineInterruption } from './interruptionPolicy.ts';
export { buildExecutiveBrief } from './executiveBrief.ts';
export { assessConfidence } from './confidenceModel.ts';
export { validateSafety, getSafetyPolicy } from './safety.ts';
export { getAnalytics, resetAnalytics } from './analytics.ts';