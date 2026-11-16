/**
 * resolveExpertAccess — the ONE place that decides whether the active owner may
 * enter the ACTUAL Expert ecosystem. The Sprint expert pill consults this and
 * nothing else before choosing a door.
 *
 * ── WHAT "EXPERT ACCESS" ACTUALLY MEANS HERE (audited, not assumed) ──────────
 *
 * 1. The Expert ecosystem (ExpertNetwork: Find an Expert / My Experts) is
 *    already gated by `useMembership().isPaid`:
 *      ExpertNetwork.jsx → `gated = !isPaid && (tab === 'find' || tab === 'mine')`
 *      → wrapped in PremiumWorkspaceOverlay.
 *    That IS the existing product rule for this app, so this resolver REUSES it
 *    instead of inventing a second entitlement system.
 *
 * 2. `useMembership()` reads profiles.membership_tier / subscription_tier
 *    ('member' | 'pro' | 'premium') and subscription_status
 *    ('active' | 'trialing'), and returns tier 'advisor' (full access) for the
 *    internal roles. So: an active paid membership IS Expert access. There is no
 *    separate expert-service SKU in the codebase.
 *
 * 3. `expert_advisor_access` is NOT a purchase signal. It is a RELATIONSHIP /
 *    authorization record created by an admin (`grant` action) and read
 *    owner-side through `getMyAdvisor`. A relationship alone therefore never
 *    unlocks the paid experience (Part 13): entitlement decides WHETHER, the
 *    relationship only decides WHICH door (your team vs find an expert).
 *    `business_entities.assigned_advisor_id` and `client_saved_experts` are
 *    read the same way — relationship, not entitlement.
 *
 * 4. INTERNAL_OVERRIDE exists so internal operators are not locked out of a
 *    surface they legitimately use, matching the existing authorization model
 *    (the same roles `useMembership` already treats as full access). It is
 *    NEVER used to infer consumer access.
 *
 * ── FAIL CLOSED ─────────────────────────────────────────────────────────────
 * Anything that cannot be proven → LOCKED. `pending` is exposed separately so
 * the surface can say "checking" instead of showing sales copy to a paid member
 * whose profile has not loaded. Neither state ever exposes the ecosystem.
 */

export const ExpertAccessState = {
  /** Entitled + a real advisor relationship exists for this business. */
  CONNECTED_PAID: 'CONNECTED_PAID',
  /** Entitled, no relationship yet — expert support is included in the plan. */
  INCLUDED_PAID: 'INCLUDED_PAID',
  /** Internal operator using the existing authorization model. */
  INTERNAL_OVERRIDE: 'INTERNAL_OVERRIDE',
  /** Not proven entitled. Value preview only, never the ecosystem. */
  LOCKED: 'LOCKED',
};

export const INTERNAL_ROLES = ['super_admin', 'advisor', 'admin', 'expert', 'expert_advisor'];

export function isInternalRole(role) {
  return INTERNAL_ROLES.includes(role);
}

/**
 * @param {object}  args
 * @param {string}  args.requestedRole  the role the Sprint task recommends (context only)
 * @param {string}  args.role           auth role (useAuth)
 * @param {object}  args.membership     useMembership() → { tier, isPaid, isAdvisorOrAdmin }
 * @param {object}  args.advisor        useAdvisorRelationship() → { loading, connected, advisor, source }
 * @param {boolean} args.pending        true while the profile that carries the tier is still loading
 */
export function resolveExpertAccess({ requestedRole, role, membership, advisor, pending = false }) {
  const relationship = {
    connected: !!advisor?.connected,
    advisor: advisor?.advisor || null,
    source: advisor?.source || null,
  };
  const requested = requestedRole || null;
  const base = { relationship, requestedRole: requested };

  // Unresolved entitlement is NOT entitlement. Locked, but flagged so the
  // surface can wait instead of selling.
  if (pending) {
    return { ...base, accessState: ExpertAccessState.LOCKED, hasExpertAccess: false, pending: true };
  }

  if (isInternalRole(role)) {
    return { ...base, accessState: ExpertAccessState.INTERNAL_OVERRIDE, hasExpertAccess: true, pending: false };
  }

  if (membership?.isPaid) {
    return {
      ...base,
      accessState: relationship.connected
        ? ExpertAccessState.CONNECTED_PAID
        : ExpertAccessState.INCLUDED_PAID,
      hasExpertAccess: true,
      pending: false,
    };
  }

  return { ...base, accessState: ExpertAccessState.LOCKED, hasExpertAccess: false, pending: false };
}