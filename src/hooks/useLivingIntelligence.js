/**
 * useLivingIntelligence — Phase 15.1
 *
 * Client-side hook for the Living Intelligence Executive Presence API.
 *
 * Calls the livingIntelligence backend function once per business/bisVersion
 * to fetch both Executive Presence and Executive Context in a single round trip.
 *
 * The hook is NON-BLOCKING — Dashboard renders without waiting for LI.
 * Results enrich existing components when they arrive.
 *
 * Constitution Compliance:
 *   Article III — No Duplicate Intelligence (frontend receives structured outputs only)
 *   Article IV — Explainability (every item carries confidence source)
 *   Article XV — No Executive Session consumed for headline synthesis
 */
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

/**
 * Map a Living Intelligence certified owner to an existing Dashboard navigation destination.
 * Every surfaced item must map to an existing destination — no dead-end intelligence.
 */
export function mapItemToDestination(item) {
  if (!item) return null;

  const owner = item.certified_owner || '';
  const headline = (item.headline || '').toLowerCase();
  const action = (item.recommended_action || '').toLowerCase();

  // Verification / conflict → Valuation workspace
  if (owner.includes('verification') || action.includes('verification') || action.includes('conflict')) {
    return '/advisory/business-valuation';
  }

  // Confidence / data quality → Upload
  if (owner.includes('confidence') || action.includes('assessment') || action.includes('document') || action.includes('upload')) {
    return '/upload';
  }

  // Sprint / execution → Sprint bridge section
  if (owner.includes('sprint') || action.includes('sprint') || action.includes('task')) {
    return '#sprint-bridge-section';
  }

  // Growth plan / opportunities → Valuation / Growth Plan
  if (owner.includes('growth') || action.includes('growth') || action.includes('initiative')) {
    return '/advisory/business-valuation';
  }

  // Calendar / events → Calendar sync
  if (owner.includes('calendar') || action.includes('deadline') || action.includes('meeting')) {
    return '/calendar-sync';
  }

  // Valuation → Valuation workspace
  if (owner.includes('valuation') || headline.includes('valuation') || headline.includes('value')) {
    return '/advisory/business-valuation';
  }

  // CBSS / business change → Dashboard (default)
  if (owner.includes('cbss') || owner.includes('timeline')) {
    return '/dashboard';
  }

  // Default → Dashboard
  return '/dashboard';
}

/**
 * Translate confidence source to user-friendly label.
 * Does not expose technical trust-enum names to owners.
 */
export function translateConfidenceSource(source) {
  const translations = {
    verified_canonical_fact: 'Verified',
    certified_derived_fact: 'Based on current records',
    certified_engine_output: 'Based on current records',
    advisor_reviewed_conclusion: 'Advisor reviewed',
    business_intelligence_synthesis: 'Estimated',
    executive_narrative: 'Estimated',
    predictive_reasoning: 'Projected',
  };
  return translations[source] || null;
}

/**
 * Client-safe filter — owners never see internal review notes,
 * draft valuation conclusions, or internal methodology debate.
 */
function isClientSafe(item, userRole) {
  if (!item) return false;

  // Advisors and super_admins can see everything
  if (userRole === 'advisor' || userRole === 'super_admin' || userRole === 'admin') {
    return true;
  }

  // Owners: filter out internal-only items
  const headline = (item.headline || '').toLowerCase();
  const owner = (item.certified_owner || '').toLowerCase();

  // Hide verification queue items from owners (internal review)
  if (owner.includes('verification') && !headline.includes('complete')) {
    return false;
  }

  // Hide field governance items from owners
  if (owner.includes('field_governance')) {
    return false;
  }

  return true;
}

export function useLivingIntelligence({ businessId, bis, bisVersion, userRole }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['livingIntelligence', businessId, bisVersion],
    queryFn: async () => {
      if (!businessId || !bis) return null;

      // Extract minimal BIS data for the backend (no circular refs, no functions)
      const bisPayload = {
        _raw: bis._raw || {},
        _journal: bis._journal || [],
        _sprintReadyRecommendations: bis._sprintReadyRecommendations || [],
        _health: bis._health || null,
        engine: {
          changedSinceLastBriefing: bis.engine?.changedSinceLastBriefing || [],
        },
      };

      const res = await base44.functions.invoke('livingIntelligence', {
        action: 'getDashboardIntelligence',
        data: {
          business_id: businessId,
          bis: bisPayload,
        },
      });

      return res.data;
    },
    enabled: !!businessId && !!bis,
    staleTime: 0,
    retry: 1, // Don't retry aggressively — LI is enrichment, not critical
  });

  // ── Extract and client-safe filter ────────────────────────────────────────
  const executivePresence = data?.executive_presence || null;
  const executiveContext = data?.executive_context || null;

  // Filter Executive Presence items for client safety
  const safeItems = executivePresence?.items
    ? executivePresence.items.filter(item => isClientSafe(item, userRole))
    : [];

  // Filter What Changed items for client safety
  const safeChanges = executiveContext?.recently_changed_facts
    ? executiveContext.recently_changed_facts.filter(item => isClientSafe(item, userRole))
    : [];

  return {
    executivePresence: executivePresence ? {
      ...executivePresence,
      items: safeItems,
      five_minute_summary: executivePresence.five_minute_summary,
    } : null,
    businessMomentum: executiveContext?.business_momentum || null,
    whatChanged: safeChanges,
    isLoading,
    error,
  };
}