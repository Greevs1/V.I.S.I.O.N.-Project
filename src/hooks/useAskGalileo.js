/**
 * useAskGalileo — real question/answer against the canonical intelligence.
 *
 * ── THE 400 THIS HOOK WAS PRODUCING ──────────────────────────────────────────
 * It invoked `askGalileo` with `{ question }` and nothing else. The backend
 * resolves the business through the Phase 6.9 canonical contract
 * (resolveActorBusinessContext → resolveActiveBusiness), which REFUSES to
 * substitute `primary_business_id` when the account owns more than one business:
 * it throws BUSINESS_CONTEXT_REQUIRED → HTTP 400.
 *
 * The contract is right — guessing the business is exactly the cross-tenant
 * defect Phase 6.9 removed. The CALLER was wrong: it never supplied the explicit
 * scope it already had. So this hook now sends the canonical
 * `active_business_id` from the Business Context Engine — the same value every
 * other business-scoped surface in Vision uses. Nothing server-side was
 * weakened.
 *
 * ── WHY THE BUSINESS IS READ AT CALL TIME ────────────────────────────────────
 * It is read from a ref on the render that fires the request, never captured
 * once, so a switch to Business B cannot send A's scope. A response that
 * arrives after the business changed is DISCARDED rather than rendered, which
 * is what stops A's answer appearing under B on a rapid A→B switch.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useBusinessContext } from '@/lib/BusinessContext';

const GENERIC_ERROR = "Galileo couldn't complete that request.";

/** Map a transport/backend failure to something a person can read (Part 23). */
function readFriendlyError(err) {
  const code = err?.response?.data?.code || err?.code;
  const status = err?.response?.status;

  if (code === 'BUSINESS_CONTEXT_REQUIRED') {
    return 'Galileo needs to know which business this is about. Choose a business, then ask again.';
  }
  if (code === 'BUSINESS_CONTEXT_DENIED' || status === 403) {
    return "Galileo couldn't verify your access to this business.";
  }
  if (status === 401) {
    return 'Your session has ended. Sign in again to keep asking Galileo.';
  }
  if (status === 404 || status === 502) {
    return "Galileo isn't reachable right now.";
  }
  return GENERIC_ERROR;
}

export function useAskGalileo({ workspaceKey = null, route = null, focus = null } = {}) {
  const { context } = useBusinessContext();
  const activeBusinessId = context?.active_business_id || null;
  // The authoritative object the owner is standing in, flattened to primitives
  // so the callback identity stays stable. It travels as the EXISTING
  // focused_record_type / focused_record_id fields askGalileo already accepts —
  // never as a re-description of what the owner is looking at.
  const focusType = focus?.type || null;
  const focusId = focus?.id || null;

  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState(null);
  const [error, setError] = useState(null);

  // The business this render is scoped to, readable at call time.
  const businessRef = useRef(activeBusinessId);
  useEffect(() => {
    businessRef.current = activeBusinessId;
  }, [activeBusinessId]);

  // Two guards, because both matter: the sequence number rejects an out-of-order
  // response, and the business stamp rejects a response from a business we left.
  const seqRef = useRef(0);
  const lastQuestionRef = useRef('');

  // A CONTEXT CHANGE DISCARDES THE ANSWER. Three things invalidate it: the
  // business changed (A's answer must never appear under B), the surface changed
  // (the bar names where the owner is standing), and the focused object changed
  // (opening Document B must not leave Document A's answer on screen). The
  // question travels with its context; the answer cannot outlive it.
  useEffect(() => {
    seqRef.current += 1;
    setAnswer(null);
    setError(null);
  }, [activeBusinessId, workspaceKey, focusType, focusId]);

  /**
   * `ask(question, { focus })` — an optional PER-CALL focus. The standing context
   * of the surface (hook-level `focus`) is what the owner is looking at; a
   * per-call focus is the object a specific control speaks FOR (a document whose
   * findings are being asked about). It travels as the same EXISTING
   * focused_record_type / focused_record_id fields — one mechanism, never a
   * second description of context. The server re-resolves that object for itself
   * inside the authorized business, so a focus the caller is not entitled to
   * simply resolves to nothing.
   */
  const ask = useCallback(
    async (question, options = {}) => {
      const trimmed = question?.trim();
      if (!trimmed || loading) return false;

      const callFocusType = options?.focus?.type || focusType;
      const callFocusId = options?.focus?.id || focusId;
      const callWorkspaceKey = options?.workspaceKey || workspaceKey;
      const callRoute = options?.route || route;

      lastQuestionRef.current = trimmed;
      const seq = ++seqRef.current;
      const businessAtRequest = businessRef.current;

      setLoading(true);
      setError(null);
      setAnswer(null);

      const isStale = () =>
        seq !== seqRef.current || businessAtRequest !== businessRef.current;

      try {
        const res = await base44.functions.invoke('askGalileo', {
          question: trimmed,
          // THE FIX: explicit canonical business scope, never a fallback.
          active_business_id: businessAtRequest,
          ...(callWorkspaceKey ? { workspace_key: callWorkspaceKey } : {}),
          ...(callRoute ? { current_route: callRoute } : {}),
          ...(callFocusType && callFocusId ? { focused_record_type: callFocusType, focused_record_id: callFocusId } : {}),
        });

        if (isStale()) return false;

        const payload = res?.data?.response;
        if (res?.data?.error || !payload?.answer) {
          throw new Error(res?.data?.error || GENERIC_ERROR);
        }

        // Everything below is a REAL field on the askGalileo contract. The panel
        // renders only what the contract returned — nothing is inferred here.
        const labels = payload.intelligence_labels || {};
        const pick = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);

        setAnswer({
          question: trimmed,
          text: payload.answer,
          nextStep: payload.recommended_next_step || null,
          confidence: payload.confidence_level || null,
          missingData: pick(payload.missing_data),
          // ── Actionable-answer fields ──
          category: payload.category || null,
          recommendationKey: payload.recommendation_key || null,
          sources: pick(payload.supporting_sources),
          labels: {
            verified: pick(labels.verified),
            projected: pick(labels.projected),
            hypothesis: pick(labels.hypothesis),
            advisorConfirmed: pick(labels.advisor_confirmed),
          },
          hypothesesSurfaced: pick(payload.hypotheses_surfaced),
          dataDriven: payload.is_data_driven !== false,
          // The SERVER-derived evidence state (§13/§14) and the exact document
          // this answer was grounded in. Both come from the backend contract —
          // neither is inferred here, and the evidence state is never taken from
          // the model's own labels.
          evidenceState: res?.data?.evidence_state || null,
          focusedDocument: res?.data?.focused_document || null,
          focusedDocumentState: res?.data?.focused_document_state || null,
          conversationId: res?.data?.conversation_id || null,
          isGated: !!res?.data?.is_gated,
          // The document-assignment answer's own structured payload: real records
          // plus the authoritative ids behind them, and the proposal a change
          // needs. Rendered as-is, never re-derived on the client.
          assignment: payload.assignment || null,
          // ── The PROVISIONAL lane's server-derived payload (§3/§9/§10/§12/§14) ──
          // Unreviewed document evidence, the state it carries, the precedence that
          // decided the answer, the extraction-awareness counts, the proactive
          // notice, and the review CTA bound to an EXACT document id. Every number
          // here was computed on the server from persisted rows — nothing is
          // recomputed, recounted or inferred on the client.
          provisionalEvidence: res?.data?.provisional_evidence || null,
          evidencePrecedence: res?.data?.evidence_precedence || null,
          extractionAwareness: res?.data?.extraction_awareness || null,
          extractionNotice: res?.data?.extraction_notice || null,
          reviewAction: res?.data?.review_action || null,
          // 6D.0c.2 — the factual answer contract. When present it owns the
          // labels, the missing list, the source drawer and the next step.
          factual: res?.data?.factual_answer || payload.factual_answer || null,
        });
        return true;
      } catch (err) {
        console.error('[useAskGalileo] request failed:', err?.response?.data || err?.message || err);
        if (isStale()) return false;
        setError(readFriendlyError(err));
        return false;
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    },
    [loading, workspaceKey, route, focusType, focusId]
  );

  const dismiss = useCallback(() => {
    seqRef.current += 1;
    setAnswer(null);
    setError(null);
  }, []);

  /** Re-run the last question — backs the inline "Try again" affordance. */
  const retry = useCallback(() => {
    const question = lastQuestionRef.current;
    if (question) ask(question);
  }, [ask]);

  return { ask, answer, error, loading, dismiss, retry };
}