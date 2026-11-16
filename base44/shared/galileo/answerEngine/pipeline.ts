/**
 * Phase 6D.0c.2 — THE EVIDENCE-FIRST PIPELINE (the one askGalileo calls).
 *
 *   QUESTION → SEMANTIC INTENT → CONCEPT → PERIOD → EVIDENCE RETRIEVAL →
 *   EVIDENCE RESOLUTION → FACTUAL ANSWER CONTRACT → (model phrasing) → ENFORCEMENT
 *
 * `prepareEvidenceFirstAnswer` runs BEFORE the model; `finalizeEvidenceFirstAnswer`
 * runs LAST, after every other post-processing step, so nothing downstream can
 * overwrite the contract. The offline harness executes exactly these two calls.
 */

import { resolveRequestedConcept } from './ontology.ts';
import { buildEvidenceEnvelopes } from './envelope.ts';
import { resolveFactualRequest } from './resolver.ts';
import { buildAnswerContract, enforceAnswerContract, guardKnownConcepts, knownConceptsOf, formatValue } from './contract.ts';
import { buildObservationLayer } from '../../documentObservation/semantics.ts';
import { buildProvisionalEvidence } from '../provisionalEvidence.ts';
import { resolveFormQuery, buildFormQueryContract } from './formQuery.ts';

export function prepareEvidenceFirstAnswer(input: any) {
  const businessId = input?.businessId || null;
  const request = resolveRequestedConcept(input?.question, { fiscalYear: input?.fiscalYear });
  const rows = Array.isArray(input?.fieldRows) ? input.fieldRows : [];
  const envelopes = buildEvidenceEnvelopes({
    businessId,
    access: input?.access,
    canonicalObservations: buildObservationLayer(rows, businessId).observations,
    provisionalItems: buildProvisionalEvidence(rows, businessId),
    recommendations: input?.recommendations || [],
    assessments: input?.assessments || [],
    documents: input?.documents || [],
  });
  const known_concepts = knownConceptsOf(envelopes.factual);

  // ── 6D.0c.3 — A QUESTION ABOUT A NAMED TAX FORM ─────────────────────────────
  // "What was my W-2", "did I owe anything on my 1065". The FORM is the subject of
  // the question, so the answer is resolved from what the reader actually extracted
  // for that form (the document's own semantics and form inventory) instead of
  // treating the words "W-2" as an income metric and hoping a field matches. It
  // produces the same kind of contract, enforced by the same single code path.
  const formQuery = resolveFormQuery(input?.question);
  if (formQuery) {
    // The contract module resolves the form from the REQUEST wrapper (`request.form`),
    // so the form query travels beside the resolved intent — one shape, not two.
    const formContract = buildFormQueryContract({ ...request, form: formQuery }, {
      fieldRows: rows,
      documents: input?.documents || [],
      formSections: input?.formSections || [],
    });
    return {
      request,
      envelopes,
      known_concepts,
      form: formQuery,
      contract: formContract,
      prompt_block: buildPromptBlock(formContract),
    };
  }

  const claims = !envelopes.denied && request.intent === 'historical_metric' && !input?.focusedDocumentActive;
  if (!claims) return { request, envelopes, known_concepts, contract: null, prompt_block: null };

  const resolution = resolveFactualRequest(request, envelopes.factual);
  const contract = buildAnswerContract(request, resolution, envelopes, known_concepts);
  return { request, envelopes, known_concepts, contract, prompt_block: buildPromptBlock(contract) };
}

/** What the model is told: the decided answer, and what it may not say. */
export function buildPromptBlock(c: any) {
  return {
    instruction: [
      'THIS IS A FACTUAL QUESTION AND ITS ANSWER IS ALREADY DECIDED BY THE SERVER.',
      'factual_answer is shown to the owner FIRST, verbatim. Do not restate it and do not contradict it.',
      'Write at most two sentences of optional interpretation in "answer". Use no figure other than those in primary_values.',
      'You may NOT say the requested figure is unavailable or missing, may NOT ask the owner to gather or provide a figure listed in known_concepts, and may NOT use a projected opportunity as a reported or paid figure.',
      'Set recommended_next_step to null — the server decides it.',
    ].join(' '),
    resolution_state: c.resolution_state,
    requested_concept: c.requested_concept,
    factual_answer: c.answer_text,
    primary_values: c.primary_evidence.map((e: any) => ({ value: formatValue(e.value), period: e.period?.label || null, source: e.source?.document_name || null })),
    known_concepts: c.known_concepts,
    forbidden_claims: c.forbidden_claims,
  };
}

export function finalizeEvidenceFirstAnswer(response: any, prepared: any) {
  if (prepared?.contract) return enforceAnswerContract(response, prepared.contract);
  if (prepared?.known_concepts?.length) return guardKnownConcepts(response, prepared.known_concepts);
  return response;
}