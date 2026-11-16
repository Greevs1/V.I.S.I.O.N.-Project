/**
 * deliverablesEngine — Phase 13.3E.5
 *
 * Pure, deterministic engine for the Deliverables workspace. Organizes
 * valuation outputs by audience, derives deliverable status from version +
 * sharing + freshness data, and enforces client-safe boundaries.
 *
 * No reports are generated from mutable working records without clear draft
 * labeling. No client report uses internal confidence, evidence, or
 * calculation detail. Shared outputs remain historical and unchanged.
 */

// ── Deliverable definitions by audience ───────────────────────────────────
export const DELIVERABLE_DEFINITIONS = [
  // Client
  { key: 'client_eva', label: 'Enterprise Value Analysis', audience: 'Client', icon: 'FileText', client_safe: true, purpose: 'Client-facing summary of indicated Enterprise Value and key value drivers' },
  { key: 'client_valuation_summary', label: 'Valuation Summary', audience: 'Client', icon: 'FileText', client_safe: true, purpose: 'One-page valuation overview for the business owner' },
  { key: 'client_growth_plan', label: 'Growth Plan', audience: 'Client', icon: 'TrendingUp', client_safe: true, purpose: 'Client-visible initiatives and expected outcomes' },
  { key: 'client_what_changed', label: 'What Changed Since Last Valuation', audience: 'Client', icon: 'GitCompare', client_safe: true, purpose: 'Plain-language summary of value changes between versions' },
  { key: 'client_valuation_story', label: 'Valuation Story', audience: 'Client', icon: 'BookOpen', client_safe: true, purpose: 'Narrative explaining the valuation conclusion' },
  { key: 'client_quarterly_review', label: 'Quarterly Value Review', audience: 'Client', icon: 'Calendar', client_safe: true, purpose: 'Quarterly check-in on value drivers and initiatives' },

  // Advisor
  { key: 'advisor_internal_analysis', label: 'Internal Valuation Analysis', audience: 'Advisor', icon: 'ClipboardList', client_safe: false, purpose: 'Full internal analysis with calculation lines and evidence' },
  { key: 'advisor_evidence_report', label: 'Evidence and Explainability Report', audience: 'Advisor', icon: 'FileSearch', client_safe: false, purpose: 'Trace from value to evidence for every calculation' },
  { key: 'advisor_verification_summary', label: 'Verification Summary', audience: 'Advisor', icon: 'CheckCircle', client_safe: false, purpose: 'Summary of resolved and unresolved verification items' },
  { key: 'advisor_conclusion', label: 'Advisor Conclusion', audience: 'Advisor', icon: 'Gavel', client_safe: false, purpose: 'The advisor\'s defensible opinion of value' },
  { key: 'advisor_readiness_report', label: 'Publication Readiness Report', audience: 'Advisor', icon: 'ClipboardCheck', client_safe: false, purpose: 'Current readiness status and blockers' },
  { key: 'advisor_version_comparison', label: 'Version Comparison', audience: 'Advisor', icon: 'GitCompare', client_safe: false, purpose: 'Side-by-side comparison of published versions' },

  // Transaction and Capital Partners
  { key: 'buyer_preparation', label: 'Buyer Preparation Summary', audience: 'Transaction', icon: 'Building', client_safe: true, purpose: 'Summary prepared for potential buyers' },
  { key: 'lender_summary', label: 'Lender Summary', audience: 'Transaction', icon: 'Landmark', client_safe: true, purpose: 'Summary for lending institutions' },
  { key: 'cpa_summary', label: 'CPA Summary', audience: 'Transaction', icon: 'Calculator', client_safe: true, purpose: 'Summary for the client\'s CPA' },
  { key: 'family_office_summary', label: 'Family Office Summary', audience: 'Transaction', icon: 'Users', client_safe: true, purpose: 'Summary for family office stakeholders' },
  { key: 'board_summary', label: 'Board Summary', audience: 'Transaction', icon: 'Presentation', client_safe: false, purpose: 'Summary for board review' },
  { key: 'qoe_preparation', label: 'Quality of Earnings Preparation', audience: 'Transaction', icon: 'FileCheck', client_safe: false, purpose: 'QoE preparation summary for due diligence' },
];

export const AUDIENCES = [
  { key: 'Client', label: 'Client', icon: 'User', color: '#00D4FF' },
  { key: 'Advisor', label: 'Advisor', icon: 'Briefcase', color: '#D4A853' },
  { key: 'Transaction', label: 'Transaction and Capital Partners', icon: 'Building', color: '#A855F7' },
];

// ── Deliverable status model ──────────────────────────────────────────────
export const DELIVERABLE_STATUSES = {
  not_started: { label: 'Not Started', color: '#6B7280', order: 0 },
  draft: { label: 'Draft', color: '#6B7280', order: 1 },
  needs_data: { label: 'Needs Data', color: '#F59E0B', order: 2 },
  needs_review: { label: 'Needs Review', color: '#F59E0B', order: 3 },
  advisor_approved: { label: 'Advisor Approved', color: '#D4A853', order: 4 },
  ready_to_generate: { label: 'Ready to Generate', color: '#00D4FF', order: 5 },
  generated: { label: 'Generated', color: '#22c55e', order: 6 },
  shared: { label: 'Shared', color: '#22c55e', order: 7 },
  revoked: { label: 'Revoked', color: '#EF4444', order: 8 },
  stale: { label: 'Stale', color: '#F59E0B', order: 9 },
  archived: { label: 'Archived', color: '#6B7280', order: 10 },
};

// ── Derive deliverable status ─────────────────────────────────────────────
// Status is derived from: published version existence, sharing status,
// client-safe boundary, staleness, and advisor approval.
export function deriveDeliverableStatus(def, { summary, versions, readiness, sharingStatus, isStale }) {
  const hasVersion = versions && versions.length > 0;
  const currentVersion = versions?.[0];
  const isShared = sharingStatus === 'shared';
  const isPublished = hasVersion;

  // No published version — everything is not_started or draft
  if (!isPublished) {
    if (def.client_safe) return 'not_started';
    return 'not_started';
  }

  // Stale check — source valuation changed since last generation
  if (isStale && isShared) return 'stale';

  // Client-safe and shared
  if (def.client_safe && isShared) return 'shared';

  // Client-safe but not shared
  if (def.client_safe && !isShared) return 'ready_to_generate';

  // Internal reports
  if (!def.client_safe) {
    if (readiness?.ready) return 'ready_to_generate';
    return 'needs_review';
  }

  return 'draft';
}

// ── Build deliverable cards ───────────────────────────────────────────────
export function buildDeliverables({ summary, versions, readiness }) {
  const sharingStatus = summary?.valuation?.client_sharing_status || 'not_shared';
  const currentVersion = versions?.[0];
  const isStale = false; // Would compare version date to last calculation date

  return DELIVERABLE_DEFINITIONS.map((def) => {
    const status = deriveDeliverableStatus(def, { summary, versions, readiness, sharingStatus, isStale });
    const statusMeta = DELIVERABLE_STATUSES[status] || DELIVERABLE_STATUSES.not_started;

    return {
      ...def,
      status,
      status_label: statusMeta.label,
      status_color: statusMeta.color,
      current_version: currentVersion ? `v${currentVersion.version_number}` : null,
      source_version: currentVersion ? `v${currentVersion.version_number}` : null,
      last_generated: currentVersion?.published_at || null,
      generated_by: currentVersion?.published_by_name || null,
      review_status: readiness?.ready ? 'Approved' : 'Pending',
      client_safe: def.client_safe,
      shared_status: def.client_safe ? sharingStatus : 'internal',
      shared_date: sharingStatus === 'shared' ? summary?.valuation?.client_shared_at : null,
      revoked_date: sharingStatus === 'revoked' ? summary?.valuation?.client_revoked_at : null,
      data_freshness: isStale ? 'Stale' : 'Current',
      stale_warning: isStale,
      missing_sections: [],
      can_generate: readiness?.ready || false,
      can_share: def.client_safe && readiness?.ready && !!currentVersion,
      can_revoke: def.client_safe && sharingStatus === 'shared',
      can_preview: !!currentVersion,
    };
  });
}

// ── Group by audience ─────────────────────────────────────────────────────
export function groupByAudience(deliverables) {
  return AUDIENCES.map((aud) => ({
    ...aud,
    deliverables: deliverables.filter((d) => d.audience === aud.key),
  }));
}

// ── Deliverables progress ─────────────────────────────────────────────────
export function computeDeliverablesProgress(deliverables, { summary, readiness }) {
  const hasVersion = (summary?.versionCount || 0) > 0;
  if (!hasVersion) {
    return { percent: 0, status: 'not_started', next_action: 'Publish a valuation version before generating final client deliverables' };
  }

  const total = deliverables.length;
  const generated = deliverables.filter((d) => ['generated', 'shared'].includes(d.status)).length;
  const shared = deliverables.filter((d) => d.status === 'shared').length;
  const needsAttention = deliverables.filter((d) => ['needs_data', 'needs_review', 'stale'].includes(d.status)).length;
  const ready = deliverables.filter((d) => d.status === 'ready_to_generate').length;

  const percent = Math.round((generated / total) * 100);
  let status = 'in_progress';
  let nextAction = `Generate ${ready} ready deliverable${ready !== 1 ? 's' : ''}`;

  if (needsAttention > 0) {
    nextAction = `Resolve ${needsAttention} deliverable${needsAttention !== 1 ? 's' : ''} needing attention`;
  } else if (shared > 0 && ready === 0 && needsAttention === 0) {
    status = 'ready';
    nextAction = 'All deliverables generated — review shared outputs';
  }

  return { percent, status, next_action: nextAction, generated, shared, needs_attention: needsAttention, ready };
}

// ── Client-safe boundary enforcement ─────────────────────────────────────
// Returns only the deliverables a client should see, with client-safe fields only.
export function toClientSafeDeliverables(deliverables) {
  return deliverables
    .filter((d) => d.client_safe && ['shared'].includes(d.status))
    .map((d) => ({
      key: d.key,
      label: d.label,
      audience: d.audience,
      purpose: d.purpose,
      status: d.status,
      current_version: d.current_version,
      shared_date: d.shared_date,
    }));
}