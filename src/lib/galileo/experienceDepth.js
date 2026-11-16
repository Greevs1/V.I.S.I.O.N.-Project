/**
 * Experience Depth — HOW FAR the interface is trying to take the owner.
 *
 * WHAT THIS IS
 * A deterministic statement of the experience the surface is trying to deliver,
 * derived ONLY from what Galileo can honestly stand on right now:
 *
 *   DISCOVER     something worth looking at exists (or Galileo cannot say yet)
 *   UNDERSTAND   Galileo can explain why, from real data
 *   EXPLORE      what could be done — direction, not implementation
 *   IMPLEMENT    real work exists to continue
 *   COLLABORATE  a real human relationship is in play
 *
 * WHAT THIS IS NOT
 * It is NOT a plan, a tier, a price or a permission. It creates no billing, no
 * entitlement and no gate. Whether the owner may PROCEED is decided by the
 * existing commercial authority (`useMembership` → `resolveImplementationAccess`),
 * which this module neither reads nor replaces. Depth says what the surface is
 * TRYING to do; authority says whether it may.
 */

export const ExperienceDepth = {
  DISCOVER: 'discover',
  UNDERSTAND: 'understand',
  EXPLORE: 'explore',
  IMPLEMENT: 'implement',
  COLLABORATE: 'collaborate',
};

export const DEPTH_LABELS = {
  [ExperienceDepth.DISCOVER]: 'Discover',
  [ExperienceDepth.UNDERSTAND]: 'Understand',
  [ExperienceDepth.EXPLORE]: 'Explore',
  [ExperienceDepth.IMPLEMENT]: 'Implement',
  [ExperienceDepth.COLLABORATE]: 'Collaborate',
};

/**
 * resolveExperienceDepth — the ONE mapping, ordered by what is strongest.
 *
 * @param {object} input
 * @param {boolean} input.supported          Galileo can compute this area from real data
 * @param {boolean} input.hasOpportunity     a canonical opportunity exists in this area
 * @param {boolean} input.hasImplementation  real work already exists for it
 * @param {boolean} input.advisorConnected   a REAL expert relationship exists (not a click)
 * @returns {string} one of ExperienceDepth.*
 */
export function resolveExperienceDepth({
  supported = false,
  hasOpportunity = false,
  hasImplementation = false,
  advisorConnected = false,
} = {}) {
  if (hasImplementation) return ExperienceDepth.IMPLEMENT;
  if (advisorConnected && hasOpportunity) return ExperienceDepth.COLLABORATE;
  if (hasOpportunity) return ExperienceDepth.EXPLORE;
  if (supported) return ExperienceDepth.UNDERSTAND;
  return ExperienceDepth.DISCOVER;
}

/**
 * nextLayerThread — the ONE subtle thread to pull at each depth, with the REAL
 * capability behind it.
 *
 * A thread is never a teaser for a feature that does not exist: `capability`
 * always names something already implemented and already reachable on Home
 * (a command handler, the expert surface, the sprint workspace, or the
 * existing uploader). If a capability were ever removed, its thread must go
 * with it — that is the whole point of naming it here rather than in copy.
 */
export function nextLayerThread(depth) {
  switch (depth) {
    case ExperienceDepth.IMPLEMENT:
      return {
        text: 'I can turn this into a 90-day plan.',
        capability: { action: 'open_sprint' },
      };
    case ExperienceDepth.COLLABORATE:
      return {
        text: 'An expert can validate this before you act.',
        capability: { action: 'expert' },
      };
    case ExperienceDepth.EXPLORE:
      return {
        text: 'I can model what this might do to business value.',
        capability: { action: 'whatif' },
      };
    case ExperienceDepth.UNDERSTAND:
      return {
        text: "I can show you what I'd investigate first.",
        capability: { action: 'view_opportunities' },
      };
    case ExperienceDepth.DISCOVER:
    default:
      return {
        text: 'I can sharpen this the moment you share a document.',
        capability: { action: 'upload' },
      };
  }
}