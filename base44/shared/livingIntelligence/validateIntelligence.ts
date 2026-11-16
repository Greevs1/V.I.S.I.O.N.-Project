/**
 * livingIntelligence/validateIntelligence.ts — Phase 15.2
 *
 * The Validate Intelligence Model.
 *
 * If an advisor opened this valuation's Validate workspace right now...
 * what should they know?
 *
 * Synthesizes from the EXISTING verification queue (passed from client).
 * Does NOT create queue items. Does NOT resolve items. Does NOT calculate.
 * Only explains, contextualizes, and prioritizes.
 *
 * Constitution Compliance:
 *   Article I — One Truth (reads from verification queue service)
 *   Article IV — Explainability (every claim carries evidence)
 *   Article V — Advisor Governance (explains, does not decide)
 *   Article VI — Client Safety (no internal terms exposed)
 */

export interface ValidateIntelligenceInput {
  business_id: string;
  valuation_id: string;
  profile_id: string;
  // From client (already fetched by VerifyWorkspace — no duplicate fetch)
  verification_items: any[];
  recommended_action: any | null;
  queue_summary: any | null;
  // From server (optional context)
  valuation_metadata?: any | null;
  user_role?: string;
}

export interface ValidateAttentionItem {
  item_id: string;
  headline: string;
  why_now: string;
  what_unlocks: string;
  evidence_strength: 'verified' | 'high' | 'moderate' | 'emerging' | 'low';
  recommended_existing_action: string;
  is_publication_blocker: boolean;
  certified_owner: string;
}

export interface ValidateIntelligence {
  valuation_id: string;
  business_id: string;
  generated_at: string;
  primary_attention_item: ValidateAttentionItem | null;
  secondary_attention_items: ValidateAttentionItem[];
  publication_impact: {
    is_blocked: boolean;
    blocker_count: number;
    blocker_summary: string;
  };
  quiet_state: boolean;
  advisor_summary: string;
  _meta: {
    sources_used: string[];
    constitution_compliant: true;
    no_calculations_performed: true;
    no_duplicate_intelligence: true;
    no_queue_items_created: true;
  };
}

// ── Main synthesis function ──────────────────────────────────────────────────
export function buildValidateIntelligence(input: ValidateIntelligenceInput): ValidateIntelligence {
  const items = input.verification_items || [];
  const recommended = input.recommended_action;
  const summary = input.queue_summary || {};

  // ── Determine quiet state ──────────────────────────────────────────────────
  const openItems = items.filter((i) => !['resolved', 'rejected', 'not_applicable', 'closed'].includes(i.status));
  const quietState = openItems.length === 0 && (summary.total_open === 0 || summary.total_open == null);

  // ── Publication impact ─────────────────────────────────────────────────────
  const blockerItems = openItems.filter((i) => i.is_publication_blocker || i.item_type === 'publication_blocker');
  const publicationImpact = {
    is_blocked: blockerItems.length > 0,
    blocker_count: blockerItems.length,
    blocker_summary: blockerItems.length > 0
      ? `${blockerItems.length} item${blockerItems.length !== 1 ? 's' : ''} must be resolved before publication`
      : 'No publication blockers',
  };

  // ── Build primary attention item ───────────────────────────────────────────
  // Reuse the existing recommended action — do NOT replace it
  let primaryAttentionItem: ValidateAttentionItem | null = null;

  if (recommended && recommended.action_type !== 'proceed') {
    // Find the matching queue item for richer context
    const matchingItem = openItems.find((i) =>
      i.title === recommended.title || i.id === recommended.item_id
    ) || openItems[0];

    primaryAttentionItem = {
      item_id: matchingItem?.id || recommended.item_id || 'recommended',
      headline: recommended.title || matchingItem?.title || 'Review required',
      why_now: determineWhyNow(matchingItem, recommended, publicationImpact),
      what_unlocks: determineWhatUnlocks(matchingItem, openItems),
      evidence_strength: determineEvidenceStrength(matchingItem),
      recommended_existing_action: determineRecommendedAction(matchingItem),
      is_publication_blocker: matchingItem?.is_publication_blocker || matchingItem?.item_type === 'publication_blocker' || false,
      certified_owner: 'verification_queue_service',
    };
  } else if (openItems.length > 0) {
    // No explicit recommendation but items exist — use highest priority
    const sorted = [...openItems].sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return (order[a.priority || a.severity] ?? 4) - (order[b.priority || b.severity] ?? 4);
    });
    const top = sorted[0];
    primaryAttentionItem = {
      item_id: top.id,
      headline: top.title,
      why_now: determineWhyNow(top, null, publicationImpact),
      what_unlocks: determineWhatUnlocks(top, openItems),
      evidence_strength: determineEvidenceStrength(top),
      recommended_existing_action: determineRecommendedAction(top),
      is_publication_blocker: top.is_publication_blocker || top.item_type === 'publication_blocker',
      certified_owner: 'verification_queue_service',
    };
  }

  // ── Build secondary attention items (max 2) ────────────────────────────────
  // Lighter treatment — only headline + why_now
  const secondaryItems: ValidateAttentionItem[] = [];
  if (openItems.length > 1) {
    const sorted = [...openItems].sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return (order[a.priority || a.severity] ?? 4) - (order[b.priority || b.severity] ?? 4);
    });

    // Skip the primary item, take next 2
    const primaryId = primaryAttentionItem?.item_id;
    const candidates = sorted.filter((i) => i.id !== primaryId).slice(0, 2);

    for (const item of candidates) {
      secondaryItems.push({
        item_id: item.id,
        headline: item.title,
        why_now: determineWhyNow(item, null, publicationImpact),
        what_unlocks: determineWhatUnlocks(item, openItems),
        evidence_strength: determineEvidenceStrength(item),
        recommended_existing_action: determineRecommendedAction(item),
        is_publication_blocker: item.is_publication_blocker || item.item_type === 'publication_blocker',
        certified_owner: 'verification_queue_service',
      });
    }
  }

  // ── Advisor summary ────────────────────────────────────────────────────────
  const advisorSummary = synthesizeAdvisorSummary(
    primaryAttentionItem,
    secondaryItems,
    publicationImpact,
    quietState,
  );

  return {
    valuation_id: input.valuation_id,
    business_id: input.business_id,
    generated_at: new Date().toISOString(),
    primary_attention_item: primaryAttentionItem,
    secondary_attention_items: secondaryItems,
    publication_impact: publicationImpact,
    quiet_state: quietState,
    advisor_summary: advisorSummary,
    _meta: {
      sources_used: identifySources(input),
      constitution_compliant: true,
      no_calculations_performed: true,
      no_duplicate_intelligence: true,
      no_queue_items_created: true,
    },
  };
}

// ── Why Now ──────────────────────────────────────────────────────────────────
function determineWhyNow(item: any, recommended: any, publicationImpact: any): string {
  if (!item && !recommended) return 'This item requires your attention.';

  // Publication blocker — highest urgency
  if (item?.is_publication_blocker || item?.item_type === 'publication_blocker') {
    return 'This blocks publication — resolving it is required before the valuation can be published.';
  }

  // Conflict — high urgency
  if (item?.item_type === 'conflicting_value') {
    return 'Two sources disagree on this value — resolving the conflict ensures your valuation uses the correct figure.';
  }

  // Missing required field
  if (item?.item_type === 'missing_required_field' || item?.item_type === 'missing_document') {
    return 'This information is required for your valuation calculation — the valuation cannot be completed without it.';
  }

  // Low confidence
  if (item?.item_type === 'low_confidence_value') {
    return 'The confidence in this value is below the threshold for publication — confirming it strengthens your valuation.';
  }

  // Add-back
  if (item?.item_type === 'proposed_add_back') {
    return 'This add-back affects your normalized earnings — approving or rejecting it changes your valuation multiple.';
  }

  // Advisor judgment
  if (item?.item_type === 'advisor_judgment') {
    return 'Your judgment is needed on this item — it affects the valuation methodology.';
  }

  // Client confirmation
  if (item?.item_type === 'client_confirmation' || item?.requires_client_input) {
    return 'Your client needs to provide this information — the valuation is waiting on their response.';
  }

  // Use recommended detail as fallback
  if (recommended?.detail) return recommended.detail;

  return 'This item requires your review before the valuation can proceed.';
}

// ── What Unlocks ─────────────────────────────────────────────────────────────
function determineWhatUnlocks(item: any, allOpenItems: any[]): string {
  if (!item) return 'Resolving this advances the valuation workflow.';

  if (item.is_publication_blocker || item.item_type === 'publication_blocker') {
    return 'Resolving this enables publication of the valuation.';
  }

  if (item.item_type === 'conflicting_value') {
    return 'Resolving this conflict ensures consistent figures across all calculations.';
  }

  if (item.item_type === 'missing_required_field' || item.item_type === 'missing_document') {
    return 'Providing this enables the valuation calculation to proceed.';
  }

  if (item.item_type === 'proposed_add_back') {
    return 'Approving this add-back increases your normalized EBITDA, which increases your enterprise value.';
  }

  if (item.item_type === 'low_confidence_value') {
    return 'Confirming this value raises the overall confidence of the valuation.';
  }

  return 'Resolving this advances the valuation workflow.';
}

// ── Evidence Strength ────────────────────────────────────────────────────────
function determineEvidenceStrength(item: any): ValidateAttentionItem['evidence_strength'] {
  const conf = item?.confidence_score;
  if (conf == null) return 'emerging';
  if (conf >= 85) return 'verified';
  if (conf >= 70) return 'high';
  if (conf >= 50) return 'moderate';
  return 'low';
}

// ── Recommended Existing Action ───────────────────────────────────────────────
function determineRecommendedAction(item: any): string {
  if (!item) return 'Review this item.';

  if (item.item_type === 'conflicting_value') return 'Resolve Conflict';
  if (item.item_type === 'proposed_add_back') return 'Approve or Reject';
  if (item.item_type === 'missing_required_field' || item.item_type === 'missing_document') return 'Request from Client';
  if (item.requires_client_input) return 'Request from Client';
  if (item.item_type === 'low_confidence_value') return 'Confirm or Edit';
  if (item.item_type === 'advisor_judgment') return 'Provide Judgment';

  return 'Review';
}

// ── Advisor Summary ──────────────────────────────────────────────────────────
function synthesizeAdvisorSummary(
  primary: ValidateAttentionItem | null,
  secondary: ValidateAttentionItem[],
  publicationImpact: any,
  quietState: boolean,
): string {
  if (quietState) {
    return 'Nothing requires immediate review. The queue is clear.';
  }

  if (!primary) {
    return 'Review the open items in the queue.';
  }

  const parts: string[] = [];

  // Lead with the primary item
  parts.push(`Review: ${primary.headline}. ${primary.why_now}`);

  // Mention publication impact
  if (publicationImpact.is_blocked) {
    parts.push(`${publicationImpact.blocker_count} item${publicationImpact.blocker_count !== 1 ? 's' : ''} block publication.`);
  }

  // Mention secondary items briefly
  if (secondary.length > 0) {
    const rest = secondary.map((s) => s.headline).join('; ');
    parts.push(`Also open: ${rest}.`);
  }

  return parts.join(' ');
}

// ── Identify Sources ─────────────────────────────────────────────────────────
function identifySources(input: ValidateIntelligenceInput): string[] {
  const sources: string[] = ['verification_queue_service'];
  if (input.valuation_metadata) sources.push('valuation_calculation_engine');
  if (input.queue_summary) sources.push('verification_queue_summary');
  return sources;
}

// ── Client-Safe Filter ───────────────────────────────────────────────────────
// Owners should not see internal review context
export function filterValidateIntelligenceForClient(
  intelligence: ValidateIntelligence,
  userRole: string,
): ValidateIntelligence {
  // Advisors and admins see everything
  if (userRole === 'advisor' || userRole === 'super_admin' || userRole === 'admin') {
    return intelligence;
  }

  // Owners see only publication impact and quiet state — not internal review details
  return {
    ...intelligence,
    primary_attention_item: null,
    secondary_attention_items: [],
    advisor_summary: intelligence.quiet_state
      ? 'Nothing requires your attention right now.'
      : 'Your advisor is reviewing your valuation. You may receive a request for information.',
  };
}