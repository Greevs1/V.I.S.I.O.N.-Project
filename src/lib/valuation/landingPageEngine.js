/**
 * landingPageEngine — Phase 13.3F.2
 *
 * Pure, deterministic derivation of the Business Valuation landing page
 * state from loaded data (summary, calcSummary, readiness, intelligence,
 * versionDeltas, valueDrivers). No I/O. No calculations. No fabrication.
 *
 * Outputs:
 *   - nextAction: single primary action with why/unlocks/owner/link
 *   - kpiCards: four owner-focused KPI cards
 *   - topInsights: strength, risk, opportunity, next action
 *   - stages: six-stage advisor journey progress
 *   - versionChange: delta between published versions
 *   - emptyState: guided starting state for new valuations
 *   - advisorMetrics: advisor-only operational metrics
 *   - viewMode: which layout to render
 */
import { buildExecutiveInsights, IMPACT_NOT_QUANTIFIABLE } from './insightsEngine';
import {
  getBlendedRecon, getEquityBridge, getOverallConfidence, getApprovedConclusion,
  getNormalizedEarnings, fmtCurrency, fmtRange,
  getConclusionStatus, getPublishStatus, computeNextAction, getWorkflowStateLabel,
  getLatestCalcVersion,
} from './valuationState';

// ── Helpers ──────────────────────────────────────────────────────────────────
export function fmtDelta(value) {
  if (value == null || isNaN(value)) return null;
  const abs = Math.abs(value);
  const sign = value >= 0 ? '+' : '−';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function fmtPctDelta(current, previous) {
  if (current == null || previous == null || previous === 0) return null;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

// ── Stage computation (landing page — no queueSummary dependency) ────────────
function computeLandingStages({ summary, calcSummary, readiness, intelligence }) {
  const valuation = summary?.valuation;
  const versionCount = summary?.versionCount || 0;
  const calcs = calcSummary?.calculations || [];
  const leadAdvisor = summary?.leadAdvisor;
  const responsible = leadAdvisor
    ? `${leadAdvisor.first_name || ''} ${leadAdvisor.last_name || ''}`.trim() || 'Unassigned'
    : 'Unassigned';
  const valBlockers = readiness?.critical_blockers?.length || 0;

  const valuationConclusion = getApprovedConclusion(calcSummary);
  const valuationConclusionStatus = getConclusionStatus(calcSummary);
  const valuationPublishStatus = getPublishStatus(readiness);
  const valuationReady = !!valuationConclusion;
  const valuationStarted = calcs.length > 0 || valuation?.status === 'in_progress' || valuation?.status === 'needs_review' || valuationConclusionStatus === 'in_progress';

  // Discover
  const intelPct = intelligence?.summary?.completion_percentage ?? null;
  const intelConflicts = intelligence?.summary?.conflicting || 0;
  const intelStatus = intelPct == null ? 'not_started' : intelConflicts > 0 ? 'blocked' : intelPct >= 80 ? 'ready' : 'in_progress';
  const intelNext = intelligence?.recommendedAction?.title || 'Run Intelligence Scan';

  // Validate (from readiness blockers + intelligence conflicts)
  const validateBlockers = valBlockers + intelConflicts;
  let val2Status = 'not_started';
  let val2Pct = 0;
  let val2Next = 'Open the Validation Queue';
  if (validateBlockers > 0) {
    val2Status = 'blocked'; val2Pct = 20;
    val2Next = `Resolve ${validateBlockers} critical item${validateBlockers !== 1 ? 's' : ''}`;
  } else if (intelPct != null && intelPct >= 80) {
    val2Status = 'ready'; val2Pct = 100;
    val2Next = 'Validation complete — proceed to Build Value';
  } else if (intelPct != null && intelPct > 0) {
    val2Status = 'in_progress'; val2Pct = 50;
    val2Next = 'Review evidence and resolve conflicts';
  }

  // Build Value
  const bvCompleteness = intelligence?.summary?.completion_percentage ?? 0;
  const bvStatus = bvCompleteness >= 60 ? 'ready' : bvCompleteness > 0 ? 'in_progress' : 'not_started';
  const bvNext = bvCompleteness >= 60 ? 'Review business quality dimensions' : 'Gather more evidence in Discover';

  return [
    { key: 'discover', label: 'Discover', status: intelStatus, percent: intelPct || 0, blockers: intelConflicts, nextAction: intelNext, responsible },
    { key: 'validate', label: 'Validate', status: val2Status, percent: val2Pct, blockers: validateBlockers, nextAction: val2Next, responsible },
    { key: 'build_value', label: 'Build Value', status: bvStatus, percent: bvCompleteness, blockers: 0, nextAction: bvNext, responsible },
    {
      key: 'valuation',
      label: 'Valuation',
      status: valuationReady ? 'ready' : valuationPublishStatus === 'blocked' ? 'blocked' : valuationStarted ? 'in_progress' : 'not_started',
      percent: valuationReady ? 100 : valuationStarted ? 60 : 0,
      blockers: valBlockers,
      nextAction: valuationReady ? 'Review conclusion' : valuationStarted ? 'Continue calculations' : 'Open Valuation workspace',
      responsible,
    },
    {
      key: 'growth_plan',
      label: 'Growth Plan',
      status: (valuationReady || valuationStarted) ? 'in_progress' : bvCompleteness > 0 ? 'in_progress' : 'not_started',
      percent: (valuationReady || valuationStarted) ? 40 : bvCompleteness > 0 ? 20 : 0,
      blockers: 0,
      nextAction: (valuationReady || valuationStarted) ? 'Review candidate initiatives' : bvCompleteness > 0 ? 'Complete Valuation to unlock initiatives' : 'Review Build Value and Valuation findings',
      responsible,
    },
    {
      key: 'deliverables',
      label: 'Deliverables',
      status: versionCount > 0 ? 'in_progress' : 'not_started',
      percent: versionCount > 0 ? 50 : 0,
      blockers: valBlockers,
      nextAction: versionCount > 0 ? 'Generate and share deliverables' : 'Publish a version',
      responsible,
    },
  ];
}

// ── Permission derivation ────────────────────────────────────────────────────
function derivePermissions({ summary, role }) {
  const isSuperAdmin = role === 'super_admin';
  const asg = summary?.assignment;
  return {
    canView: isSuperAdmin || !!asg?.can_view,
    canEdit: isSuperAdmin || !!asg?.can_edit,
    canReview: isSuperAdmin || !!asg?.can_review,
    canPublish: isSuperAdmin || !!asg?.can_publish,
    canCreate: isSuperAdmin || !!asg?.can_create_valuation || (!summary?.valuation && (role === 'advisor' || isSuperAdmin)),
    canRestore: isSuperAdmin || !!asg?.can_restore_valuation,
    canArchive: isSuperAdmin || !!asg?.can_archive_valuation,
    canManageAssignments: isSuperAdmin || !!asg?.can_manage_assignments,
    isSuperAdmin,
  };
}

// ── Next best action ─────────────────────────────────────────────────────────
function deriveLandingNextAction({ summary, calcSummary, readiness, intelligence, canPublish, canEdit, permissions, accessSummary }) {
  const valuation = summary?.valuation;

  if (!valuation) {
    if (permissions?.canCreate) {
      return { label: 'Start New Valuation', why: 'Begin a structured enterprise value analysis for this business.', unlocks: 'The full advisory journey', owner: 'Advisor', link: 'start', isStart: true };
    }
    return { label: 'No active valuation', why: 'Your advisor will initiate the valuation process.', unlocks: 'Enterprise Value analysis', owner: 'Advisor', link: null };
  }

  if (valuation.status === 'archived') {
    if (permissions?.canRestore) {
      return { label: 'Restore Valuation', why: 'This valuation is archived. Restore it to continue working.', unlocks: 'Active working valuation', owner: 'Advisor', link: 'restore', isRestore: true };
    }
    if (permissions?.canCreate) {
      return { label: 'Start New Valuation', why: 'The current valuation is archived.', unlocks: 'A fresh valuation cycle', owner: 'Advisor', link: 'start', isStart: true };
    }
    return { label: 'View Historical Valuation', why: 'The active valuation is archived.', unlocks: 'Historical results', owner: 'Advisor', link: 'history' };
  }

  // Phase 13.3G.3: Prioritize missing assignments before stage-based actions.
  // Only show these to users who can manage assignments (they're the ones who can fix it).
  if (permissions?.canManageAssignments) {
    // Priority 1: No business owner
    const owners = accessSummary?.owners || [];
    const hasOwner = owners.length > 0;
    if (!hasOwner) {
      return { label: 'Assign Business Owner', why: 'No business owner is linked to this valuation.', unlocks: 'Client access and ownership context', owner: 'Advisor', link: 'manage_access' };
    }

    // Priority 2: No lead advisor
    const assignments = summary?.assignments || [];
    const hasLead = assignments.some((a) => a.assignment_role === 'lead') || summary?.leadAdvisor;
    if (!hasLead) {
      return { label: 'Assign Advisor', why: 'No lead advisor is assigned to this valuation.', unlocks: 'Advisor-led progress', owner: 'Advisor', link: 'manage_access' };
    }
  }

  const stages = computeLandingStages({ summary, calcSummary, readiness, intelligence });

  // Blocked stages first
  const blocked = stages.find((s) => s.status === 'blocked');
  if (blocked) {
    return { label: blocked.nextAction, why: `${blocked.label} has ${blocked.blockers} blocker${blocked.blockers !== 1 ? 's' : ''} preventing progress.`, unlocks: 'Continued progress', owner: blocked.responsible, link: blocked.key };
  }

  // Valuation workspace internal next action
  const valNext = computeNextAction({ summary, calcSummary, readiness, canPublish });
  if (valNext && valNext.step !== 'publish') {
    return {
      label: valNext.label,
      why: valNext.why,
      unlocks: valNext.unlocks,
      owner: stages.find((s) => s.key === 'valuation')?.responsible || 'Advisor',
      link: valNext.linkToValidate ? 'validate' : 'valuation',
    };
  }

  // Publish ready
  if (valNext?.isPublish && canPublish) {
    return { label: 'Publish Valuation', why: valNext.why, unlocks: valNext.unlocks, owner: 'Advisor', link: 'valuation', isPublish: true };
  }

  // In-progress stages
  const inProgress = stages.find((s) => s.status === 'in_progress');
  if (inProgress) {
    return { label: inProgress.nextAction, why: `${inProgress.label} is in progress.`, unlocks: 'Next stage', owner: inProgress.responsible, link: inProgress.key };
  }

  // Not-started stages
  const notStarted = stages.find((s) => s.status === 'not_started');
  if (notStarted) {
    return { label: notStarted.nextAction, why: `${notStarted.label} has not started.`, unlocks: 'Progress', owner: notStarted.responsible, link: notStarted.key };
  }

  // All ready — check sharing
  const sharingStatus = valuation.client_sharing_status;
  if (sharingStatus === 'shared') {
    return { label: 'View Shared Results', why: 'The valuation has been shared with the client.', unlocks: 'Client-facing deliverables', owner: 'Advisor', link: 'deliverables' };
  }

  if (canPublish && readiness?.ready) {
    return { label: 'Publish Valuation', why: 'All readiness checks pass.', unlocks: 'Immutable published snapshot', owner: 'Advisor', link: 'valuation' };
  }

  return { label: 'Begin Growth Plan', why: 'Valuation is complete. Prioritize value-building initiatives.', unlocks: 'Growth Plan', owner: 'Advisor', link: 'growth_plan' };
}

// ── KPI cards ────────────────────────────────────────────────────────────────
function deriveKPICards({ calcSummary, insights, readiness, versionChange }) {
  const recon = getBlendedRecon(calcSummary);
  const bridge = getEquityBridge(calcSummary);
  const ne = getNormalizedEarnings(calcSummary);
  const currentValue = insights?.currentValue;
  const latestDelta = versionChange?.delta;

  const cards = [];

  // 1. Normalized EBITDA
  const ebitda = ne?.normalized_ebitda ?? ne?.maintainable_earnings ?? null;
  cards.push({
    key: 'ebitda',
    metric: 'Normalized EBITDA',
    value: ebitda != null ? fmtCurrency(ebitda) : null,
    workflowState: !ebitda ? (ne ? 'Earnings normalization in progress' : 'Financial information still required') : null,
    status: ne?.is_approved ? 'complete' : ne ? 'in_progress' : 'not_started',
    change: latestDelta?.ebitdaDelta != null ? fmtDelta(latestDelta.ebitdaDelta) : null,
    explanation: 'The maintainable earnings figure used across income-based methods.',
    link: 'valuation',
  });

  // 2. Valuation Multiple
  const multiple = recon?.final_multiple_mid ?? null;
  cards.push({
    key: 'multiple',
    metric: 'Valuation Multiple',
    value: multiple != null ? `${multiple.toFixed(1)}x` : null,
    workflowState: !multiple ? (recon ? 'Reconciliation in progress' : 'Method selection incomplete') : null,
    status: recon?.is_approved ? 'complete' : recon ? 'in_progress' : 'not_started',
    change: latestDelta?.multipleDelta != null ? `${latestDelta.multipleDelta >= 0 ? '+' : ''}${latestDelta.multipleDelta.toFixed(1)}x` : null,
    explanation: 'The blended multiple applied to normalized earnings.',
    link: 'valuation',
  });

  // 3. Enterprise Value Gap
  const evGap = currentValue?.ev_gap;
  cards.push({
    key: 'ev_gap',
    metric: 'Enterprise Value Gap',
    value: evGap != null ? fmtCurrency(evGap) : null,
    workflowState: !evGap ? (currentValue?.hasApprovedValuation ? 'Defensible and potential values pending' : 'Valuation not yet calculated') : null,
    status: evGap != null ? 'complete' : 'not_started',
    change: null,
    explanation: 'The gap between defensible and potential Enterprise Value.',
    link: 'valuation',
  });

  // 4. Equity Value
  const eqMid = bridge?.equity_value_mid ?? bridge?.equity_value ?? null;
  cards.push({
    key: 'equity',
    metric: 'Equity Value',
    value: eqMid != null ? fmtCurrency(eqMid) : null,
    workflowState: !eqMid ? (bridge ? 'Equity bridge in progress' : 'Enterprise value pending') : null,
    status: bridge?.is_approved ? 'complete' : bridge ? 'in_progress' : 'not_started',
    change: latestDelta?.equityDelta != null ? fmtDelta(latestDelta.equityDelta) : null,
    explanation: 'The value attributable to shareholders after the equity bridge.',
    link: 'valuation',
  });

  return cards;
}

// ── Top insights ─────────────────────────────────────────────────────────────
function deriveTopInsights({ insights }) {
  const topDriver = insights?.topDrivers?.[0] || null;
  const topDetractor = insights?.topDetractors?.[0] || null;
  const fastestWin = insights?.fastestWins?.[0] || null;
  const nextAction = insights?.nextAction || null;

  return {
    biggestStrength: topDriver ? {
      title: topDriver.name,
      whyItMatters: topDriver.why_it_matters || topDriver.current_state || 'Supports business quality and valuation.',
      ebitdaRelevance: topDriver.ebitda_relevance || '—',
      multipleRelevance: topDriver.multiple_relevance || '—',
      evRelevance: topDriver.ev_impact_label || IMPACT_NOT_QUANTIFIABLE,
      confidence: topDriver.confidence,
      action: 'Review in Build Value',
      link: 'build_value',
    } : null,
    biggestRisk: topDetractor ? {
      title: topDetractor.name,
      whyItMatters: topDetractor.why_it_matters || topDetractor.current_issue || 'Suppresses business quality or valuation.',
      ebitdaRelevance: topDetractor.ebitda_effect || '—',
      multipleRelevance: topDetractor.multiple_effect || '—',
      evRelevance: topDetractor.ev_impact_label || IMPACT_NOT_QUANTIFIABLE,
      confidence: topDetractor.confidence,
      action: topDetractor.link_to_validate ? 'Resolve in Validate' : 'Review in Build Value',
      link: topDetractor.link_to_validate ? 'validate' : 'build_value',
    } : null,
    fastestOpportunity: fastestWin ? {
      title: fastestWin.name,
      whyItMatters: fastestWin.why_fast_win || 'Candidate opportunity supported by current evidence.',
      ebitdaRelevance: fastestWin.ebitda_relevance || '—',
      multipleRelevance: fastestWin.multiple_relevance || '—',
      evRelevance: IMPACT_NOT_QUANTIFIABLE,
      confidence: fastestWin.confidence,
      action: fastestWin.link_to_validate ? 'Resolve in Validate' : 'Review in Growth Plan',
      link: fastestWin.link_to_validate ? 'validate' : 'growth_plan',
    } : null,
    nextAction: nextAction ? {
      title: nextAction.label,
      whyItMatters: 'The recommended next step based on current workflow state.',
      ebitdaRelevance: '—',
      multipleRelevance: '—',
      evRelevance: IMPACT_NOT_QUANTIFIABLE,
      confidence: null,
      action: nextAction.label,
      link: nextAction.link,
    } : null,
  };
}

// ── Version change ───────────────────────────────────────────────────────────
function deriveVersionChange({ versionDeltas, insights }) {
  const vi = insights?.versionIntelligence;
  if (!vi?.has_multiple_versions || !vi?.latest_delta) {
    return { hasMultipleVersions: false, delta: null };
  }
  const d = vi.latest_delta;
  return {
    hasMultipleVersions: true,
    delta: {
      evDelta: d.ev_delta,
      equityDelta: d.equity_delta,
      ebitdaDelta: d.ebitda_delta,
      multipleDelta: d.multiple_delta,
      confidenceDelta: d.confidence_delta,
      versionFrom: d.version_from,
      versionTo: d.version_to,
      primaryReason: d.value_attribution || d.advisor_story || null,
    },
  };
}

// ── Empty state ──────────────────────────────────────────────────────────────
function deriveEmptyState({ intelligence, readiness, summary, calcSummary }) {
  const valuation = summary?.valuation;
  if (!valuation) return null;

  const conclusion = getApprovedConclusion(calcSummary);
  if (conclusion) return null; // not an empty state if conclusion exists

  const intelSummary = intelligence?.summary || {};
  const documents = intelligence?.documents?.length || intelSummary.document_count || 0;
  const assessments = intelligence?.assessments?.length || intelSummary.assessment_count || 0;
  const verifiedPoints = intelSummary.verified_count || intelSummary.total_candidates || 0;
  const readinessPct = intelSummary.completion_percentage ?? 0;

  // Missing items: from intelligence missing candidates + readiness blockers
  const missingCandidates = (intelligence?.candidates || []).filter((c) => c.status === 'missing').slice(0, 3);
  const missingItems = missingCandidates.map((c) => c.display_name || c.field_key).filter(Boolean);
  const blockerItems = (readiness?.critical_blockers || []).slice(0, 3).map((b) => b.message).filter(Boolean);
  const allMissing = [...missingItems, ...blockerItems].slice(0, 4);

  return {
    readinessPct,
    gathered: { documents, assessments, verifiedPoints },
    missing: allMissing,
  };
}

// ── Advisor metrics ──────────────────────────────────────────────────────────
function deriveAdvisorMetrics({ calcSummary, readiness, intelligence, summary }) {
  const valuation = summary?.valuation;
  const calcs = calcSummary?.calculations || [];
  const staleCount = calcs.filter((c) => c.is_stale).length;
  const unapprovedCount = calcs.filter((c) => !c.is_approved && !c.superseded_by_calculation_id).length;
  const missingEvidenceCount = (intelligence?.candidates || []).filter((c) => c.status === 'missing').length;
  const conclusionStatus = getConclusionStatus(calcSummary);
  const publishStatus = getPublishStatus(readiness);
  const clientVisibility = valuation?.client_sharing_status || 'not_shared';

  return {
    verificationBlockers: readiness?.critical_blockers?.length || 0,
    staleCalculations: staleCount,
    missingApprovals: unapprovedCount,
    missingEvidence: missingEvidenceCount,
    conclusionStatus,
    publishStatus,
    clientVisibility,
  };
}

// ── Main entry ───────────────────────────────────────────────────────────────
export function deriveLandingState({
  summary, calcSummary, readiness, intelligence, versionDeltas, valueDrivers,
  role, canEdit, canPublish, accessSummary,
}) {
  const permissions = derivePermissions({ summary, role });
  const insights = buildExecutiveInsights({ intelligence, calcSummary, readiness, summary, valueDrivers, versionDeltas });
  const nextAction = deriveLandingNextAction({ summary, calcSummary, readiness, intelligence, canPublish: permissions.canPublish, canEdit: permissions.canEdit, permissions, accessSummary });
  const stages = computeLandingStages({ summary, calcSummary, readiness, intelligence });
  const versionChange = deriveVersionChange({ versionDeltas, insights });
  const kpiCards = deriveKPICards({ calcSummary, insights, readiness, versionChange });
  const topInsights = deriveTopInsights({ insights });
  const emptyState = deriveEmptyState({ intelligence, readiness, summary, calcSummary });
  const advisorMetrics = deriveAdvisorMetrics({ calcSummary, readiness, intelligence, summary });
  const workflowState = getWorkflowStateLabel({ summary, calcSummary, readiness });

  const valuation = summary?.valuation;
  const isArchived = valuation?.status === 'archived';
  const hasConclusion = !!(calcSummary?.conclusions || []).find((c) => c.advisor_approved);
  const isAdvisor = role === 'advisor' || role === 'super_admin';

  return {
    insights,
    nextAction,
    kpiCards,
    topInsights,
    stages,
    versionChange,
    emptyState,
    advisorMetrics,
    workflowState,
    isAdvisor,
    permissions,
    viewMode: {
      noValuation: !valuation,
      showDashboard: !!valuation && !isArchived && hasConclusion,
      showEmptyState: !!valuation && !isArchived && !hasConclusion,
      showArchivedState: !!valuation && isArchived,
    },
  };
}