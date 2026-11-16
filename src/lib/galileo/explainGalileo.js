/**
 * Explain-with-Galileo bridge.
 *
 * ONE assistant, many surfaces. An explanation affordance anywhere in Vision
 * hands its question to whichever Galileo is already on screen:
 *   1. the global Ask Galileo bar (GlobalGalileoBar) is always mounted on the
 *      authenticated Vision surface — inside a workspace as much as on Home —
 *      so a question handed over always has somewhere to land;
 *   2. the Vision Home ask bar (useVisionActions) answers it in the full,
 *      actionable panel, which is what "Continue with Galileo" opens;
 *   3. if neither is listening (a standalone route such as an assessment opened
 *      directly), the question is carried to the real Galileo on Vision via
 *      `?ask=`, which the Home ask bar consumes on mount.
 *
 * No second chatbot is created anywhere: the question always lands in the
 * existing useAskGalileo / askGalileo path.
 *
 * The GLOSSARY owns which terms may be explained and their canonical meaning.
 * Galileo owns simplification, analogy, and "what this means for my business".
 */

import { useCallback } from 'react';

const bridges = [];

/** Register a Galileo that can answer. Last registered wins; returns unregister. */
export function registerGalileoBridge(handler) {
  if (typeof handler !== 'function') return () => {};
  bridges.push(handler);
  return () => {
    const i = bridges.indexOf(handler);
    if (i >= 0) bridges.splice(i, 1);
  };
}

function activeBridge() {
  return bridges.length ? bridges[bridges.length - 1] : null;
}

/** Plain-language question for "what does this mean for MY business" (Level 2). */
export function explainForMyBusinessQuestion(term, { businessLabel = null, relatedValue = null } = {}) {
  const where = businessLabel ? ` the ${businessLabel}` : '';
  const value = relatedValue ? ` It currently shows ${relatedValue}.` : '';
  return (
    `Explain "${term}" for my business in the simplest possible language — what it means, why it matters, ` +
    `and what would improve it.${where ? ` Focus on${where}.` : ''}${value}`
  );
}

/** Deeper question for the third level: the owner wants the full picture. */
export function deeperExplanationQuestion(term, { businessLabel = null } = {}) {
  return (
    `Teach me "${term}" properly: the definition in one sentence, then where my number comes from, ` +
    `what drives it, and anything it affects elsewhere in my business.` +
    (businessLabel ? ` Focus on the ${businessLabel}.` : '')
  );
}

/**
 * Send an explanation request to the live Galileo.
 * @returns {'galileo'|'vision'} where the question was handed off.
 */
export function explainWithGalileo({ question, term = null, surface = null }) {
  if (!question) return 'vision';
  const handler = activeBridge();
  if (handler) {
    handler({ question, term, surface });
    return 'galileo';
  }
  // Nobody listening on this surface — carry it to the real Galileo on Vision.
  window.location.assign(`/galileo?ask=${encodeURIComponent(question)}`);
  return 'vision';
}

/** Hook form, so components do not import the mutable module functions directly. */
export function useExplainGalileo() {
  return useCallback((args) => explainWithGalileo(args), []);
}