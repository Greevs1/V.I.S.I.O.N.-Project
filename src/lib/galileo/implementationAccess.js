/**
 * implementationAccess — ONE presentation resolver for the two implementation
 * paths (GUIDE ME WITH GALILEO / WORK WITH OUR TEAM).
 *
 * WHY THIS EXISTS
 * "Guide me with Galileo" and "Work with our team" are NOT sales buttons. They
 * are contextual action doors, and what they SAY must change with what the
 * owner already has. Selling someone something they already have is the fastest
 * way to make the product feel like it does not know them.
 *
 * WHAT IT IS NOT
 * It is not a source of truth. It holds no entitlement state, no advisor
 * records and no pricing. It is a pure function over information that already
 * exists elsewhere:
 *   · useMembership()          — the live tier + the role override
 *   · the advisor relationship — resolved from the existing advisory tables
 *   · the caller's context     — which surface the choice is being made from
 *
 * NOTHING HERE PERSISTS, FETCHES, OR DECIDES ACCESS. It only decides what to
 * render and which already-existing destination the action points at.
 *
 * ACCESS MECHANISM REUSED
 * There is no checkout or billing system in this application. When access does
 * not exist, the action points at the ONE existing mechanism the rest of the
 * product already uses (/strategy-call, the same destination
 * MembershipUpgradeBanner uses). No fake purchase is ever presented.
 */

import { LEVERS } from './opportunityScenarios';

// ── Paths ───────────────────────────────────────────────────────────────────
export const ImplementationPath = {
  GALILEO: 'galileo',
  TEAM: 'team',
};

/**
 * Galileo path states.
 *   available — the owner's plan already includes implemented guidance
 *   locked    — it does not, so the door leads to the existing access mechanism
 */
export const GalileoState = { AVAILABLE: 'available', LOCKED: 'locked' };

/**
 * Team path states. These are genuinely different situations, not one state
 * with a boolean:
 *   connected — a REAL advisor/expert relationship already exists for this
 *               business. We name them. We never sell what they already have.
 *   included  — expert implementation is part of the plan, but nobody is named
 *               on this business yet.
 *   locked    — it is not part of the plan.
 */
export const TeamState = {
  CONNECTED: 'connected',
  INCLUDED: 'included',
  LOCKED: 'locked',
};

/** The one place the existing access destination is named. */
export const ACCESS_DESTINATION = '/strategy-call';

/**
 * resolveImplementationAccess — the single decision point.
 *
 * @param {object}  membership  — the result of useMembership(): { tier, isPaid, isAdvisorOrAdmin }
 * @param {object}  advisor     — { connected, advisor: { name, role } } from the existing advisory data
 * @param {object}  context     — { implementationExists } — whether real work already exists
 * @returns {{ galileo: object, team: object }}
 */
export function resolveImplementationAccess({ membership, advisor, context } = {}) {
  const isPaid = !!membership?.isPaid;
  const advisorName = advisor?.connected ? advisor?.advisor?.name || null : null;
  const advisorRole = advisor?.connected ? advisor?.advisor?.role || null : null;
  const implementationExists = !!context?.implementationExists;
  // 'plan' — the choice sits under an implementation preview, so the Galileo
  // action IS building (or continuing) the real 90-Day Sprint.
  const planMode = context?.mode === 'plan';

  return {
    galileo: resolveGalileo({ isPaid, implementationExists, planMode }),
    team: resolveTeam({ isPaid, advisorName, advisorRole }),
  };
}

// ── Galileo path ────────────────────────────────────────────────────────────
// `isPaid` already carries the role override from useMembership: internal roles
// (super_admin, advisor, admin, expert) resolve to the advisor tier, so they are
// never accidentally locked out of their own product.
function resolveGalileo({ isPaid, implementationExists, planMode }) {
  if (!isPaid) {
    return {
      path: ImplementationPath.GALILEO,
      state: GalileoState.LOCKED,
      available: false,
      locked: true,
      statusLabel: 'Guided implementation',
      title: 'With Galileo',
      description:
        'Turn this into a guided implementation plan and I will walk you through it step by step.',
      ctaLabel: 'Unlock Galileo guidance',
      // The existing access mechanism, not a checkout.
      action: { type: 'access', destination: ACCESS_DESTINATION },
    };
  }

  return {
    path: ImplementationPath.GALILEO,
    state: GalileoState.AVAILABLE,
    available: true,
    locked: false,
    statusLabel: 'Included in your plan',
    title: 'With Galileo',
    description: planMode
      ? implementationExists
        ? 'You already have an active 90-Day Sprint. Pick it back up and I will guide each step.'
        : 'Turn this into your active 90-Day Sprint and I will guide you through it.'
      : implementationExists
        ? 'Pick this back up and I will keep guiding each step.'
        : "I'll walk you through this step by step.",
    ctaLabel: planMode
      ? implementationExists
        ? 'Continue my plan'
        : 'Build my 90-Day Plan'
      : implementationExists
        ? 'Continue with Galileo'
        : 'Start with Galileo',
    action: { type: 'galileo' },
  };
}

// ── Team path ───────────────────────────────────────────────────────────────
function resolveTeam({ isPaid, advisorName, advisorRole }) {
  // A real relationship outranks the tier: it is what the owner actually has.
  if (advisorName) {
    return {
      path: ImplementationPath.TEAM,
      state: TeamState.CONNECTED,
      available: true,
      connected: true,
      locked: false,
      assignedExpert: { name: advisorName, role: advisorRole || null },
      statusLabel: advisorRole || 'Your team',
      title: 'Continue with your team',
      description: 'Bring this into your existing advisory relationship.',
      ctaLabel: 'Continue with your team',
      action: { type: 'team' },
    };
  }

  if (isPaid) {
    return {
      path: ImplementationPath.TEAM,
      state: TeamState.INCLUDED,
      available: true,
      connected: false,
      locked: false,
      assignedExpert: null,
      statusLabel: 'Included in your plan',
      title: 'Work with our team',
      description: 'Expert implementation is included in your plan.',
      ctaLabel: 'Get started',
      action: { type: 'team' },
    };
  }

  return {
    path: ImplementationPath.TEAM,
    state: TeamState.LOCKED,
    available: false,
    connected: false,
    locked: true,
    assignedExpert: null,
    statusLabel: 'Expert support',
    title: 'With our team',
    description:
      'Bring in an expert who can work from the same business intelligence Galileo uses, and help you implement this.',
    ctaLabel: 'Explore expert support',
    action: { type: 'access', destination: ACCESS_DESTINATION },
  };
}

/**
 * scenarioForOpportunity — maps a real opportunity onto a lever the What If
 * engine can genuinely model.
 *
 * Returns null when no supported lever applies, and the caller then shows NO
 * What If action. Offering a model that cannot run would be theatre.
 *
 * The lever keys are validated against the engine's own catalog, so this can
 * never point at a scenario the engine does not implement.
 */
export function scenarioForOpportunity(opportunity) {
  if (!opportunity) return null;

  const text = [
    opportunity.title,
    opportunity.subtitle,
    opportunity.summary,
    opportunity.category,
    opportunity.domain,
    opportunity.raw?.description,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (!text) return null;

  let key = null;
  if (/pric|rate increase|charge more/.test(text)) key = 'raise_prices';
  else if (/margin|cost control|efficien|overhead/.test(text)) key = 'improve_margins';
  else if (/manager|owner depend|key person|delegat|involvement|concentrat|step back/.test(text)) {
    key = 'hire_manager';
  } else if (/salesperson|sales hire|sales rep/.test(text)) key = 'hire_salesperson';
  else if (/revenue|top line|sales growth|turnover/.test(text)) key = 'add_revenue';

  if (!key || !LEVERS[key]) return null;
  return { key, prompt: LEVERS[key].prompt, title: LEVERS[key].title };
}