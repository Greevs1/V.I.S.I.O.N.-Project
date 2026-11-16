/**
 * digitalTwin/trust.ts — Phase 6D.1A — GATE 7: THE CANONICAL TRUST CONTRACT.
 *
 *     CONFIDENCE ≠ VERIFICATION
 *
 * The approved distinction, executed rather than described:
 *
 *   · A human ACCEPTED or CORRECTED the value   → CONFIRMED   (not verified)
 *   · A machine was HIGHLY CONFIDENT            → nothing at all
 *   · An explicit attestation exists            → may be VERIFIED
 *
 * This module is the ONLY place the promotion path derives trust, and its input
 * has no confidence field — so a confidence threshold cannot appear here by
 * accident, and a later phase cannot quietly reintroduce one.
 *
 * It deliberately does NOT import the legacy read-time authority helper
 * (`canonicalFact/sourceHierarchy.isVerifiedSource`), which infers a verified
 * source from `confidence >= 85`. That helper belongs to the read-time resolver;
 * the promotion contract must not inherit its behaviour. The harness enforces this
 * with an import guard, so the dependency cannot reappear unnoticed.
 *
 * PURE MODULE — imports nothing.
 */

export const TRUST_VERSION = '6d.1a.1';

export const REVIEW_STATE = { PROPOSED: 'proposed', CONFIRMED: 'confirmed', REJECTED: 'rejected' } as const;
export const VERIFICATION_STATE = { UNVERIFIED: 'unverified', CONFIRMED: 'confirmed', VERIFIED: 'verified' } as const;

/** Review states that a person has actively settled. */
const CONFIRMING_REVIEW_STATES = ['accepted', 'corrected'];
const REJECTING_REVIEW_STATES = ['rejected'];

export interface TrustVerdict {
  review_state: string;
  verification_state: string;
  verification_method: string | null;
}

/**
 * deriveTrust — review state first, then verification.
 *
 * `attestation` is the ONLY route to `verified`, and it must be explicit: an
 * identity AND a method. Nothing about the value's confidence or its extraction
 * quality participates.
 */
export function deriveTrust(input: {
  reviewStatus?: unknown;
  attestation?: {
    verified?: boolean;
    method?: string | null;
    byProfileId?: string | null;
    byService?: string | null;
  } | null;
}): TrustVerdict {
  const reviewStatus = String(input?.reviewStatus ?? 'unknown');

  const review_state = CONFIRMING_REVIEW_STATES.includes(reviewStatus)
    ? REVIEW_STATE.CONFIRMED
    : REJECTING_REVIEW_STATES.includes(reviewStatus)
      ? REVIEW_STATE.REJECTED
      : REVIEW_STATE.PROPOSED;

  const att = input?.attestation ?? null;
  const hasIdentity = Boolean(att?.byProfileId || att?.byService);
  const hasMethod = Boolean(att?.method);
  const explicitlyVerified = att?.verified === true && hasIdentity && hasMethod;

  if (explicitlyVerified) {
    return {
      review_state,
      verification_state: VERIFICATION_STATE.VERIFIED,
      verification_method: String(att?.method),
    };
  }

  return {
    review_state,
    verification_state: review_state === REVIEW_STATE.CONFIRMED
      ? VERIFICATION_STATE.CONFIRMED
      : VERIFICATION_STATE.UNVERIFIED,
    verification_method: null,
  };
}

/**
 * A confirmed observation is still not a promoted fact. This states the ceiling a
 * document observation can reach on its own, so no caller can read `confirmed` and
 * act as though it were `verified`.
 */
export const OBSERVATION_MAX_VERIFICATION = VERIFICATION_STATE.CONFIRMED;

export function isVerified(trust: TrustVerdict | null | undefined): boolean {
  return String(trust?.verification_state || '') === VERIFICATION_STATE.VERIFIED;
}

/** Machine confidence is never an input to trust. Kept as an explicit, testable statement. */
export function confidenceIsNotVerification(): boolean {
  return true;
}