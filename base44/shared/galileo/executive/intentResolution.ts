/**
 * Intent Resolution — Phase 13.4C.1
 *
 * Determines user intent from their message.
 * Uses workspace, workflow, and priorities as fallback when ambiguous.
 *
 * Pure reasoning. No LLM.
 */
import type { ExecutiveState, SituationAssessment, Priority, Intent, IntentType } from './types.ts';

const INTENT_KEYWORDS: Record<IntentType, string[]> = {
  understand: ['what', 'why', 'how', 'explain', 'mean', 'understand', 'tell me about'],
  review: ['review', 'check', 'verify', 'validate', 'assess', 'look at'],
  investigate: ['investigate', 'conflict', 'discrepancy', 'mismatch', 'why different', 'resolve'],
  prepare: ['prepare', 'meeting', 'client meeting', 'buyer meeting', 'board meeting', 'upcoming'],
  compare: ['compare', 'difference', 'versus', 'vs', 'delta', 'change between'],
  plan: ['plan', 'growth', 'initiative', '90 day', 'sprint', 'roadmap', 'next steps'],
  publish: ['publish', 'share', 'deliver', 'report', 'send to client'],
  explain: ['explain', 'break down', 'walk me through', 'show me'],
  navigate: ['where', 'go to', 'find', 'navigate', 'open', 'show'],
  learn: ['learn', 'education', 'tutorial', 'guide', 'help me understand'],
  execute: ['execute', 'run', 'do', 'start', 'begin', 'generate'],
};

const FALLBACK_MAP: Record<string, IntentType> = {
  valuation: 'review',
  growth: 'plan',
  verification: 'investigate',
  publication: 'publish',
  meeting: 'prepare',
  document: 'review',
};

export function resolveIntent(
  userMessage: string,
  state: ExecutiveState,
  assessment: SituationAssessment,
  priorities: Priority[]
): Intent {
  const message = userMessage.toLowerCase().trim();
  const detectedKeywords: string[] = [];

  // Try keyword matching
  let bestMatch: IntentType | null = null;
  let bestScore = 0;

  for (const [intentType, keywords] of Object.entries(INTENT_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      if (message.includes(keyword)) {
        score++;
        detectedKeywords.push(keyword);
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = intentType as IntentType;
    }
  }

  if (bestMatch && bestScore > 0) {
    return {
      type: bestMatch,
      confidence: Math.min(100, 50 + bestScore * 20),
      rawMessage: userMessage,
      detectedKeywords: [...new Set(detectedKeywords)],
      fallbackUsed: false,
    };
  }

  // Fallback: use workspace + priorities
  const fallbackIntent = determineFallbackIntent(state, assessment, priorities);
  return {
    type: fallbackIntent,
    confidence: 30,
    rawMessage: userMessage,
    detectedKeywords: [],
    fallbackUsed: true,
    fallbackReason: 'Ambiguous message; inferred from workspace and priorities.',
  };
}

function determineFallbackIntent(
  state: ExecutiveState,
  _assessment: SituationAssessment,
  priorities: Priority[]
): IntentType {
  // Check top priority category
  if (priorities.length > 0) {
    const topCategory = priorities[0].category;
    if (FALLBACK_MAP[topCategory]) return FALLBACK_MAP[topCategory];
  }

  // Check workspace
  if (state.currentWorkspace) {
    const ws = state.currentWorkspace.toLowerCase();
    if (ws.includes('valuation')) return 'review';
    if (ws.includes('growth')) return 'plan';
    if (ws.includes('verify')) return 'investigate';
    if (ws.includes('deliver')) return 'publish';
    if (ws.includes('intelligence')) return 'understand';
  }

  // Default
  return 'understand';
}