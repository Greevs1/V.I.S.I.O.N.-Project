/**
 * decisionIntelligence/challengeEngine.ts — Phase D
 *
 * Devil's Advocate / Challenge Mode.
 *
 * Challenges the decision evidence, NOT the person.
 * Does NOT pretend to know the user's psychology.
 *
 * The challenge engine:
 *   1. Challenges assumptions
 *   2. Identifies confirmation bias risks
 *   3. Finds missing evidence
 *   4. Articulates the strongest opposing case
 *   5. Identifies failure modes
 *
 * This module builds the challenge prompt and processes the LLM response.
 * The actual LLM call happens in the backend function (which has SDK access).
 */

import type {
  BusinessDecision,
  DecisionChallenge,
  ChallengedAssumption,
  FailureMode,
} from './types.ts';

/**
 * Build the prompt for the LLM to generate a decision challenge.
 * The backend function calls InvokeLLM with this prompt.
 */
export function buildChallengePrompt(decision: BusinessDecision): string {
  const optionSummaries = decision.options
    .map((o, i) => `Option ${String.fromCharCode(65 + i)} (${o.label}): ${o.summary}`)
    .join('\n');

  const assumptionSummaries = decision.assumptions
    .map((a) => `- [${a.assumption_id}] ${a.statement} (confidence: ${a.confidence ?? 'unknown'}, impact if wrong: ${a.impact_if_wrong})`)
    .join('\n');

  const evidenceSummaries = decision.evidence
    .map((e) => `- [${e.evidence_id}] ${e.source_type}: ${e.summary} (confidence: ${e.confidence ?? 'unknown'})`)
    .join('\n');

  const riskSummaries = decision.risks
    .map((r) => `- ${r.description} (severity: ${r.severity})`)
    .join('\n');

  return `You are a devil's advocate for a business decision. Your role is to challenge the EVIDENCE and REASONING, not the person making the decision.

DECISION: ${decision.title}
QUESTION: ${decision.question}
TYPE: ${decision.decision_type}
IMPORTANCE: ${decision.importance}
RISK LEVEL: ${decision.risk_level}

OPTIONS:
${optionSummaries || 'No options defined yet.'}

ASSUMPTIONS:
${assumptionSummaries || 'No explicit assumptions defined.'}

EVIDENCE:
${evidenceSummaries || 'No evidence referenced.'}

KNOWN RISKS:
${riskSummaries || 'No risks identified.'}

Your task:
1. Challenge each assumption — what if it's wrong? What's the strongest challenge?
2. Identify confirmation bias risks — is the decision-maker favoring evidence that supports their preferred option?
3. Find missing evidence — what evidence should exist but doesn't?
4. Articulate the strongest opposing case — what's the best argument AGAINST the preferred option?
5. Identify failure modes — how could this decision fail after it's made?

Rules:
- Challenge the EVIDENCE, not the person.
- Do NOT pretend to know the user's psychology.
- Be specific and evidence-based.
- If there's not enough information to challenge something, say so.
- Do NOT fabricate evidence or probabilities.
- Return JSON only.

Return JSON with this structure:
{
  "challenged_assumptions": [
    { "assumption_id": "...", "statement": "...", "challenge": "...", "severity": "low|medium|high" }
  ],
  "confirmation_bias_risks": ["..."],
  "missing_evidence": ["..."],
  "strongest_opposing_case": "...",
  "failure_modes": [
    { "mode_id": "...", "description": "...", "trigger": "...", "impact": "...", "mitigation": "..." }
  ],
  "challenge_summary": "2-3 sentence summary of the key challenge"
}`;
}

/**
 * Process the LLM response into a DecisionChallenge object.
 */
export function processChallengeResponse(
  decisionId: string,
  llmResponse: unknown,
): DecisionChallenge {
  const response = llmResponse as Record<string, unknown>;

  const challengedAssumptions: ChallengedAssumption[] = (
    response.challenged_assumptions as ChallengedAssumption[]
  || []).map((a, i) => ({
    assumption_id: a.assumption_id || `challenge-assumption-${i}`,
    statement: a.statement || '',
    challenge: a.challenge || '',
    severity: a.severity || 'medium',
  }));

  const failureModes: FailureMode[] = (
    response.failure_modes as FailureMode[]
  || []).map((f, i) => ({
    mode_id: f.mode_id || `failure-${i}`,
    description: f.description || '',
    trigger: f.trigger || '',
    impact: f.impact || '',
    mitigation: f.mitigation || '',
  }));

  return {
    challenge_id: `challenge-${decisionId}-${Date.now()}`,
    decision_id: decisionId,
    challenged_assumptions: challengedAssumptions,
    confirmation_bias_risks: (response.confirmation_bias_risks as string[]) || [],
    missing_evidence: (response.missing_evidence as string[]) || [],
    strongest_opposing_case: (response.strongest_opposing_case as string) || '',
    failure_modes: failureModes,
    challenge_summary: (response.challenge_summary as string) || '',
    generated_at: new Date().toISOString(),
  };
}

/**
 * Determine if a challenge is severe enough to block a decision.
 */
export function shouldChallengeBlockDecision(challenge: DecisionChallenge): boolean {
  const highSeverityAssumptions = challenge.challenged_assumptions.filter(
    (a) => a.severity === 'high',
  );
  return highSeverityAssumptions.length > 0 || challenge.failure_modes.length > 3;
}