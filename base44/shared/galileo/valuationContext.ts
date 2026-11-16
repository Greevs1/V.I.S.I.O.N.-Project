/**
 * valuationContext.ts — Phase 13.4A.2
 *
 * Galileo Valuation Context Service — a read-only context assembler that
 * gathers and normalizes valuation context for the Galileo intelligence
 * layer.
 *
 * Responsibilities:
 *   - Resolve the user's valuation access mode (server-side, authoritative)
 *   - Assemble a summary-first valuation context contract
 *   - Filter internal vs client-safe context based on access mode
 *   - Validate focused records against active business/valuation
 *   - Compute a lightweight context version for cache invalidation
 *   - Build a compact source index for citation traceability
 *
 * It must NOT:
 *   - Generate conversational answers
 *   - Persist chat messages
 *   - Perform valuation calculations
 *   - Mutate valuation records
 *   - Approve anything
 *   - Execute user actions
 *
 * Architecture rule: "Authorize first, query second." The access mode
 * determines what is queried — internal details are never queried and
 * then filtered out for client-safe users.
 *
 * Reuses:
 *   - valuationShared.loadValuationContext — valuation + assignment loading
 *   - valuationShared.requireBusinessAccess — business-level access check
 *   - Same approved-output selection rules as valuationState.js (frontend)
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type AccessMode =
  | 'super_admin_internal'
  | 'assigned_advisor_internal'
  | 'assigned_reviewer_internal'
  | 'assigned_publisher_internal'
  | 'assigned_viewer_internal'
  | 'business_owner_client_safe'
  | 'client_team_client_safe'
  | 'no_access';

export interface ValuationContextInput {
  sb: any;
  profile: any;
  profileId: string;
  businessId?: string;
  valuationId?: string;
  workspaceKey?: string;
  sectionKey?: string;
  focusedRecordType?: string;
  focusedRecordId?: string;
  conversationMode?: string;
}

export interface ValuationContextResult {
  available: boolean;
  reason?: string;
  access_mode?: AccessMode;
  business_context?: any;
  valuation_context?: any;
  access_context?: any;
  readiness?: any;
  approved_outputs?: any;
  evidence_summary?: any;
  verification_summary?: any;
  build_value_summary?: any;
  growth_plan_summary?: any;
  version_summary?: any;
  owner_request_context?: any;
  focused_record?: any;
  source_index?: any[];
  context_version?: string;
}

// ── Main Export ──────────────────────────────────────────────────────────────

export async function buildGalileoValuationContext(
  input: ValuationContextInput,
): Promise<ValuationContextResult> {
  const { sb, profile, profileId, valuationId, businessId } = input;

  // No valuation context if no valuation and no business
  if (!valuationId && !businessId) {
    return { available: false, reason: 'no_context' };
  }

  const vsb = sb.schema('valuation');

  // ── 1. Resolve access mode ──────────────────────────────────────────────
  const access = await resolveAccessMode(sb, vsb, profile, profileId, businessId, valuationId);

  if (access.mode === 'no_access') {
    return { available: false, reason: 'not_authorized' };
  }

  const isClientSafe = access.mode === 'business_owner_client_safe' || access.mode === 'client_team_client_safe';

  // ── 2. Query data based on access mode ───────────────────────────────────
  if (isClientSafe) {
    return await buildClientSafeContext(sb, vsb, {
      ...input,
      access,
      isClientSafe: true,
    });
  }

  return await buildInternalContext(sb, vsb, {
    ...input,
    access,
    isClientSafe: false,
  });
}

// ── Access Mode Resolution ───────────────────────────────────────────────────

async function resolveAccessMode(
  sb: any,
  vsb: any,
  profile: any,
  profileId: string,
  businessId: string | undefined,
  valuationId: string | undefined,
): Promise<{ mode: AccessMode; valuation?: any; assignment?: any }> {
  // Super admin → full internal access
  if (profile.app_role === 'super_admin') {
    let valuation = null;
    if (valuationId) {
      const v = await loadValuationRecord(vsb, valuationId);
      valuation = v;
    }
    return { mode: 'super_admin_internal', valuation };
  }

  // If valuationId provided, check assignment
  if (valuationId) {
    const { valuation, assignment } = await loadValuationWithAssignment(vsb, profileId, valuationId);
    if (!valuation) return { mode: 'no_access' };

    if (assignment && assignment.can_view) {
      if (assignment.can_publish) return { mode: 'assigned_publisher_internal', valuation, assignment };
      if (assignment.can_review) return { mode: 'assigned_reviewer_internal', valuation, assignment };
      if (assignment.can_edit) return { mode: 'assigned_advisor_internal', valuation, assignment };
      return { mode: 'assigned_viewer_internal', valuation, assignment };
    }

    // No assignment — check if business owner or client team
    if (valuation.business_id && (await isBusinessOwner(sb, profileId, valuation.business_id))) {
      return { mode: 'business_owner_client_safe', valuation };
    }
    if (profile.app_role === 'owner' || profile.app_role === 'team_member') {
      return { mode: profile.app_role === 'owner' ? 'business_owner_client_safe' : 'client_team_client_safe', valuation };
    }

    return { mode: 'no_access' };
  }

  // No valuationId — check business ownership for owner request context
  if (businessId) {
    if (await isBusinessOwner(sb, profileId, businessId)) {
      return { mode: 'business_owner_client_safe' };
    }
    if (profile.app_role === 'owner' || profile.app_role === 'team_member') {
      return { mode: profile.app_role === 'owner' ? 'business_owner_client_safe' : 'client_team_client_safe' };
    }
    return { mode: 'no_access' };
  }

  return { mode: 'no_access' };
}

// ── Internal Context Builder ─────────────────────────────────────────────────

async function buildInternalContext(
  sb: any,
  vsb: any,
  input: ValuationContextInput & { access: any; isClientSafe: boolean },
): Promise<ValuationContextResult> {
  const { profile, profileId, valuationId, workspaceKey, sectionKey, access } = input;
  const valuation = access.valuation;

  if (!valuationId || !valuation) {
    return { available: false, reason: 'no_valuation' };
  }

  const businessId = valuation.business_id;

  // Parallel fetch all internal data sources
  const [
    bizRes, calcsRes, methodSelsRes, confRes, conclusionsRes,
    weightingsRes, valueDriversRes, versionsRes, verifItemsRes,
    equityBridgeRes, assignRes,
  ] = await Promise.allSettled([
    sb.from('business_entities').select('id, business_name, industry, business_family_type').eq('id', businessId).maybeSingle(),
    vsb.from('valuation_calculations').select('*').eq('valuation_id', valuationId).order('calculated_at', { ascending: false }),
    vsb.from('valuation_method_selections').select('*').eq('valuation_id', valuationId),
    vsb.from('valuation_confidence_scores').select('*').eq('valuation_id', valuationId),
    vsb.from('valuation_conclusions').select('*').eq('valuation_id', valuationId),
    vsb.from('valuation_historical_weighting').select('*').eq('valuation_id', valuationId),
    vsb.from('valuation_value_drivers').select('*').eq('valuation_id', valuationId),
    vsb.from('valuation_versions').select('*').eq('valuation_id', valuationId).order('created_at', { ascending: false }),
    vsb.from('valuation_verification_items').select('id, item_type, severity, status, title, field_key, is_publication_blocker').eq('valuation_id', valuationId).is('resolved_at', null),
    vsb.from('valuation_equity_bridge_items').select('*').eq('valuation_id', valuationId),
    vsb.from('valuation_assignments').select('assigned_profile_id, assignment_role, can_view, can_edit, can_review, can_publish, can_manage_assignments').eq('valuation_id', valuationId).is('removed_at', null),
  ]);

  const safe = (r: any, fb: any = null) => r.status === 'fulfilled' ? (r.value?.data ?? fb) : fb;
  const safeList = (r: any, fb: any[] = []) => r.status === 'fulfilled' ? (r.value?.data ?? fb) : fb;

  const business = safe(bizRes);
  const calcs = safeList(calcsRes, []);
  const methodSels = safeList(methodSelsRes, []);
  const confidenceScores = safeList(confRes, []);
  const conclusions = safeList(conclusionsRes, []);
  const weightings = safeList(weightingsRes, []);
  const valueDrivers = safeList(valueDriversRes, []);
  const versions = safeList(versionsRes, []);
  const verifItems = safeList(verifItemsRes, []);
  const equityBridge = safeList(equityBridgeRes, []);
  const assignments = safeList(assignRes, []);

  // ── Approved output selectors (match valuationState.js) ─────────────────
  const blendedRecon = selectBlendedRecon(calcs);
  const equityBridgeCalc = selectEquityBridge(calcs);
  const overallConfidence = selectOverallConfidence(confidenceScores);
  const approvedConclusion = selectApprovedConclusion(conclusions);

  // ── Build context contract ──────────────────────────────────────────────
  const approvedOutputs = {
    normalized_ebitda: blendedRecon?.normalized_ebitda ?? null,
    maintainable_earnings: blendedRecon?.maintainable_earnings ?? null,
    enterprise_value: blendedRecon?.enterprise_value ?? blendedRecon?.result_value ?? null,
    enterprise_value_range: blendedRecon ? {
      low: blendedRecon.defensible_value ?? null,
      high: blendedRecon.potential_value ?? null,
    } : null,
    defensible_value: blendedRecon?.defensible_value ?? null,
    potential_value: blendedRecon?.potential_value ?? null,
    equity_value: equityBridgeCalc?.equity_value ?? null,
    confidence: overallConfidence ? {
      score: overallConfidence.score ?? overallConfidence.confidence_score ?? null,
      category: overallConfidence.category ?? null,
      is_stale: overallConfidence.is_stale ?? false,
    } : null,
    advisor_conclusion: approvedConclusion ? {
      conclusion_text: approvedConclusion.conclusion_text ?? approvedConclusion.conclusion ?? null,
      advisor_approved: true,
      approved_by: approvedConclusion.approved_by_profile_id ?? null,
      approved_at: approvedConclusion.approved_at ?? null,
    } : null,
  };

  // ── Readiness ────────────────────────────────────────────────────────────
  const staleCalcs = calcs.filter((c: any) => c.is_stale);
  const publicationBlockers = verifItems.filter((i: any) => i.is_publication_blocker);
  const readiness = {
    discover_completion: null, // populated by intelligence engine (Phase 13.4A.3)
    validation_open_count: verifItems.length,
    build_value_completion: null,
    calculation_readiness: calcs.length > 0 ? (staleCalcs.length === 0 ? 'current' : 'stale') : 'not_started',
    publication_readiness: publicationBlockers.length === 0 && approvedConclusion ? 'ready' : publicationBlockers.length > 0 ? 'blocked' : 'in_progress',
    critical_blockers: publicationBlockers.map((b: any) => ({ id: b.id, title: b.title, type: b.item_type })),
    warnings: staleCalcs.map((c: any) => ({ id: c.id, type: c.calculation_type, reason: c.stale_reason })),
    stale_calculations: staleCalcs.map((c: any) => ({ id: c.id, type: c.calculation_type, methodology: c.methodology, reason: c.stale_reason })),
  };

  // ── Evidence summary ─────────────────────────────────────────────────────
  const evidenceSummary = {
    document_count: null, // populated from documents table (Phase 13.4A.3)
    extraction_count: null,
    verified_fields: null,
    conflicting_fields: null,
    missing_fields: null,
    assessment_count: null,
    evidence_gaps: verifItems.filter((i: any) => i.item_type === 'missing_information').map((i: any) => i.title),
  };

  // ── Verification summary ─────────────────────────────────────────────────
  const criticalItems = verifItems.filter((i: any) => i.severity === 'critical');
  const highItems = verifItems.filter((i: any) => i.severity === 'high');
  const verificationSummary = {
    critical_items: criticalItems.map((i: any) => ({ id: i.id, title: i.title, type: i.item_type })),
    high_priority_items: highItems.map((i: any) => ({ id: i.id, title: i.title, type: i.item_type })),
    waiting_on_owner: verifItems.filter((i: any) => i.item_type === 'client_request').length,
    waiting_on_advisor: verifItems.filter((i: any) => i.item_type === 'advisor_judgment' || i.item_type === 'methodology_decision').length,
    publication_blockers: publicationBlockers.length,
  };

  // ── Build value summary (derived from value drivers) ────────────────────
  const driverCalcs = valueDrivers.filter((d: any) => d.driver_type === 'driver' || d.is_positive);
  const detractorCalcs = valueDrivers.filter((d: any) => d.driver_type === 'detractor' || !d.is_positive);
  const buildValueSummary = {
    strongest_dimension: null, // populated from build value scores (Phase 13.4A.3)
    weakest_dimension: null,
    largest_ebitda_constraint: null,
    largest_multiple_constraint: null,
    largest_transferability_risk: null,
    value_drivers: driverCalcs.slice(0, 5).map((d: any) => ({ id: d.id, label: d.label || d.title, impact: d.estimated_impact })),
    value_detractors: detractorCalcs.slice(0, 5).map((d: any) => ({ id: d.id, label: d.label || d.title, impact: d.estimated_impact })),
  };

  // ── Growth plan summary ──────────────────────────────────────────────────
  // Growth plan initiatives are derived in the frontend engine from value
  // drivers and calculations. For the context, we provide a compact summary.
  const growthPlanSummary = {
    candidate_initiatives: null, // populated from growth plan engine (Phase 13.4A.3)
    approved_initiatives: null,
    client_visible_initiatives: null,
  };

  // ── Version summary ──────────────────────────────────────────────────────
  const currentVersion = versions[0] || null;
  const priorVersion = versions[1] || null;
  const versionSummary = {
    current_version: currentVersion ? { id: currentVersion.id, version_number: currentVersion.version_number, created_at: currentVersion.created_at } : null,
    prior_version: priorVersion ? { id: priorVersion.id, version_number: priorVersion.version_number, created_at: priorVersion.created_at } : null,
    enterprise_value_delta: (currentVersion?.enterprise_value != null && priorVersion?.enterprise_value != null)
      ? currentVersion.enterprise_value - priorVersion.enterprise_value : null,
    equity_value_delta: (currentVersion?.equity_value != null && priorVersion?.equity_value != null)
      ? currentVersion.equity_value - priorVersion.equity_value : null,
    confidence_delta: null,
    attribution_summary: null,
  };

  // ── Context version ──────────────────────────────────────────────────────
  const contextVersion = computeContextVersion(valuation, calcs, versions, assignments);

  // ── Source index ────────────────────────────────────────────────────────
  const sourceIndex = buildInternalSourceIndex(vsb, valuation, calcs, versions, verifItems, valueDrivers);

  // ── Focused record validation ──────────────────────────────────────────
  const focusedRecord = await validateFocusedRecord(vsb, {
    valuationId,
    focusedRecordType: input.focusedRecordType,
    focusedRecordId: input.focusedRecordId,
    calcs,
    versions,
    verifItems,
    valueDrivers,
  });

  return {
    available: true,
    access_mode: access.mode,
    business_context: {
      business_id: businessId,
      business_name: business?.business_name || null,
      business_family_type: business?.business_family_type || null,
    },
    valuation_context: {
      valuation_id: valuationId,
      valuation_name: valuation.valuation_name || null,
      lifecycle_status: valuation.status || null,
      engagement_type: valuation.valuation_type || null,
      purpose: valuation.valuation_purpose || null,
      valuation_date: valuation.valuation_date || null,
      current_workspace: workspaceKey || null,
      current_section: sectionKey || null,
      latest_published_version: valuation.latest_published_version_id || null,
      shared_version: valuation.client_sharing_status === 'shared' ? valuation.latest_published_version_id : null,
    },
    access_context: {
      current_profile_id: profileId,
      app_role: profile.app_role,
      assignment_role: access.assignment?.assignment_role || null,
      can_view: access.assignment?.can_view ?? (access.mode === 'super_admin_internal'),
      can_edit: access.assignment?.can_edit ?? (access.mode === 'super_admin_internal'),
      can_review: access.assignment?.can_review ?? (access.mode === 'super_admin_internal'),
      can_publish: access.assignment?.can_publish ?? (access.mode === 'super_admin_internal'),
      can_manage_assignments: access.assignment?.can_manage_assignments ?? (access.mode === 'super_admin_internal'),
      client_safe_only: false,
    },
    readiness,
    approved_outputs: approvedOutputs,
    evidence_summary: evidenceSummary,
    verification_summary: verificationSummary,
    build_value_summary: buildValueSummary,
    growth_plan_summary: growthPlanSummary,
    version_summary: versionSummary,
    focused_record: focusedRecord,
    source_index: sourceIndex,
    context_version: contextVersion,
  };
}

// ── Client-Safe Context Builder ───────────────────────────────────────────────

async function buildClientSafeContext(
  sb: any,
  vsb: any,
  input: ValuationContextInput & { access: any; isClientSafe: boolean },
): Promise<ValuationContextResult> {
  const { profile, profileId, valuationId, businessId, workspaceKey, sectionKey, access } = input;
  const valuation = access.valuation;

  // Determine business ID
  const bizId = valuation?.business_id || businessId;
  if (!bizId) {
    return { available: false, reason: 'no_business' };
  }

  // Fetch business name + owner request (client-safe only)
  const [bizRes, requestRes] = await Promise.allSettled([
    sb.from('business_entities').select('id, business_name, industry, business_family_type').eq('id', bizId).maybeSingle(),
    vsb.from('valuation_requests')
      .select('id, request_type, request_reason, desired_timeline, target_event_date, urgency, status, submitted_at, valuation_purpose, transaction_context, additional_information_requested, assigned_lead_advisor_id, converted_valuation_id')
      .eq('business_id', bizId)
      .eq('requested_by_profile_id', profileId)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  const safe = (r: any, fb: any = null) => r.status === 'fulfilled' ? (r.value?.data ?? fb) : fb;
  const safeList = (r: any, fb: any[] = []) => r.status === 'fulfilled' ? (r.value?.data ?? fb) : fb;

  const business = safe(bizRes);
  const requests = safeList(requestRes, []);

  // Owner request context (no internal request number)
  const ownerRequestContext = requests.length > 0 ? {
    has_active_request: !['withdrawn', 'declined', 'closed', 'converted_to_valuation'].includes(requests[0].status),
    purpose: requests[0].valuation_purpose || null,
    desired_timeline: requests[0].desired_timeline || null,
    target_event_date: requests[0].target_event_date || null,
    urgency: requests[0].urgency || null,
    status: requests[0].status || null,
    submitted_at: requests[0].submitted_at || null,
    information_requested: (requests[0].additional_information_requested || []).map((i: any) => ({ label: i.label, detail: i.detail, responded: i.responded })),
    assigned_advisor: null, // populated below if converted
    next_step: getNextStepLabel(requests[0].status),
  } : null;

  // If converted, fetch assigned advisor name (client-safe label only)
  if (ownerRequestContext && requests[0]?.converted_valuation_id && requests[0]?.assigned_lead_advisor_id) {
    try {
      const { data: advisor } = await sb.from('profiles')
        .select('first_name, last_name').eq('id', requests[0].assigned_lead_advisor_id).maybeSingle();
      if (advisor) {
        ownerRequestContext.assigned_advisor = `${advisor.first_name || ''} ${advisor.last_name || ''}`.trim() || null;
      }
    } catch { /* non-fatal */ }
  }

  // Shared version context (if valuation exists and is shared)
  let sharedVersion = null;
  let approvedOutputs = null;
  if (valuation && valuation.client_sharing_status === 'shared' && valuation.latest_published_version_id) {
    try {
      const { data: version } = await vsb.from('valuation_versions')
        .select('id, version_number, enterprise_value, equity_value, confidence_score, conclusion_summary, created_at')
        .eq('id', valuation.latest_published_version_id).maybeSingle();
      if (version) {
        sharedVersion = {
          version_number: version.version_number,
          created_at: version.created_at,
        };
        approvedOutputs = {
          enterprise_value: version.enterprise_value ?? null,
          enterprise_value_range: null, // populated from version range fields if available
          equity_value: version.equity_value ?? null,
          confidence: version.confidence_score != null ? { score: version.confidence_score, category: null, is_stale: false } : null,
          advisor_conclusion: version.conclusion_summary ? {
            conclusion_text: version.conclusion_summary,
            advisor_approved: true,
          } : null,
        };
      }
    } catch { /* non-fatal */ }
  }

  // Context version
  const contextVersion = valuation ? `v1_${new Date(valuation.updated_at || valuation.created_at || Date.now()).getTime()}` : 'v1_0';

  // Source index (client-safe labels only)
  const sourceIndex: any[] = [];
  if (ownerRequestContext) {
    sourceIndex.push({ source_type: 'valuation_request', safe_label: 'Your Valuation Request', client_visible: true });
  }
  if (sharedVersion) {
    sourceIndex.push({ source_type: 'published_version', safe_label: `Published Version ${sharedVersion.version_number}`, client_visible: true });
  }

  return {
    available: true,
    access_mode: access.mode,
    business_context: {
      business_id: bizId,
      business_name: business?.business_name || null,
      business_family_type: business?.business_family_type || null,
    },
    valuation_context: valuation ? {
      valuation_id: valuationId,
      valuation_name: valuation.valuation_name || null,
      lifecycle_status: valuation.status || null,
      current_workspace: workspaceKey || null,
      current_section: sectionKey || null,
      shared_version: sharedVersion?.version_number || null,
    } : { valuation_id: null, current_workspace: workspaceKey || null, current_section: sectionKey || null },
    access_context: {
      current_profile_id: profileId,
      app_role: profile.app_role,
      assignment_role: null,
      can_view: true,
      can_edit: false,
      can_review: false,
      can_publish: false,
      can_manage_assignments: false,
      client_safe_only: true,
    },
    readiness: null, // client-safe: no internal readiness details
    approved_outputs: approvedOutputs,
    evidence_summary: null, // client-safe: no internal evidence details
    verification_summary: null, // client-safe: no internal verification details
    build_value_summary: null, // client-safe: no internal build value details
    growth_plan_summary: null, // client-safe: populated from approved client-visible initiatives (Phase 13.4A.3)
    version_summary: sharedVersion ? { current_version: sharedVersion, prior_version: null, enterprise_value_delta: null, equity_value_delta: null, confidence_delta: null, attribution_summary: null } : null,
    owner_request_context: ownerRequestContext,
    source_index: sourceIndex,
    context_version: contextVersion,
  };
}

// ── Approved Output Selectors (match valuationState.js) ────────────────────────

function selectBlendedRecon(calcs: any[]): any {
  return (calcs || []).find((c) =>
    c.calculation_type === 'reconciliation' &&
    c.methodology === 'blended' &&
    !c.superseded_by_calculation_id &&
    c.is_approved
  );
}

function selectEquityBridge(calcs: any[]): any {
  return (calcs || []).find((c) =>
    c.calculation_type === 'reconciliation' &&
    c.methodology === 'equity_bridge' &&
    !c.superseded_by_calculation_id &&
    c.is_approved
  );
}

function selectOverallConfidence(scores: any[]): any {
  return (scores || []).find((c) => c.is_overall);
}

function selectApprovedConclusion(conclusions: any[]): any {
  return (conclusions || []).find((c) => c.advisor_approved);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function loadValuationRecord(vsb: any, valuationId: string): Promise<any> {
  const { data, error } = await vsb.from('business_valuations')
    .select('*').eq('id', valuationId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function loadValuationWithAssignment(vsb: any, profileId: string, valuationId: string): Promise<{ valuation: any; assignment: any }> {
  const valuation = await loadValuationRecord(vsb, valuationId);
  if (!valuation) return { valuation: null, assignment: null };
  const { data: asg } = await vsb.from('valuation_assignments')
    .select('can_view, can_edit, can_review, can_publish, can_manage_assignments, assignment_role')
    .eq('valuation_id', valuationId)
    .eq('assigned_profile_id', profileId)
    .is('removed_at', null)
    .maybeSingle();
  return { valuation, assignment: asg || null };
}

async function isBusinessOwner(sb: any, profileId: string, businessId: string): Promise<boolean> {
  const { data: bo } = await sb.from('business_owners')
    .select('business_id').eq('business_id', businessId).eq('profile_id', profileId).maybeSingle();
  return !!bo;
}

function getNextStepLabel(status: string): string {
  const labels: Record<string, string> = {
    submitted: 'The V.I.S.I.O.N. Team is reviewing your request.',
    received: 'An administrator will review your request shortly.',
    under_review: 'An administrator is reviewing your request.',
    waiting_on_owner: 'The V.I.S.I.O.N. Team needs more information from you.',
    approved: 'Your valuation is being prepared. An advisor will be assigned.',
    declined: 'Your request was declined. Contact your advisor for details.',
    converted_to_valuation: 'Your valuation has been created.',
    withdrawn: 'This request was withdrawn.',
    closed: 'This request was closed.',
  };
  return labels[status] || 'In progress.';
}

function computeContextVersion(valuation: any, calcs: any[], versions: any[], assignments: any[]): string {
  const timestamps: number[] = [];
  if (valuation?.updated_at) timestamps.push(new Date(valuation.updated_at).getTime());
  if (calcs?.[0]?.calculated_at) timestamps.push(new Date(calcs[0].calculated_at).getTime());
  if (versions?.[0]?.created_at) timestamps.push(new Date(versions[0].created_at).getTime());
  const maxTs = timestamps.length > 0 ? Math.max(...timestamps) : 0;
  return `v1_${maxTs}`;
}

function buildInternalSourceIndex(vsb: any, valuation: any, calcs: any[], versions: any[], verifItems: any[], valueDrivers: any[]): any[] {
  const index: any[] = [];
  const valuationId = valuation?.id;

  if (calcs.length > 0) {
    index.push({
      source_type: 'calculation',
      safe_label: 'Approved Calculations',
      valuation_id: valuationId,
      confidence: calcs[0]?.is_approved ? 'verified' : 'provisional',
      client_visible: false,
      open_destination: 'valuation',
      evidence_available: true,
    });
  }
  if (versions.length > 0) {
    index.push({
      source_type: 'published_version',
      safe_label: `Version ${versions[0].version_number || 'Current'}`,
      valuation_id: valuationId,
      confidence: 'verified',
      client_visible: valuation?.client_sharing_status === 'shared',
      open_destination: 'deliverables',
      evidence_available: true,
    });
  }
  if (verifItems.length > 0) {
    index.push({
      source_type: 'verification_item',
      safe_label: 'Verification Queue',
      valuation_id: valuationId,
      confidence: 'pending',
      client_visible: false,
      open_destination: 'validate',
      evidence_available: true,
    });
  }
  if (valueDrivers.length > 0) {
    index.push({
      source_type: 'value_driver',
      safe_label: 'Value Driver Analysis',
      valuation_id: valuationId,
      confidence: 'provisional',
      client_visible: false,
      open_destination: 'build_value',
      evidence_available: true,
    });
  }
  return index;
}

async function validateFocusedRecord(
  vsb: any,
  input: { valuationId: string; focusedRecordType?: string; focusedRecordId?: string; calcs: any[]; versions: any[]; verifItems: any[]; valueDrivers: any[] },
): Promise<any> {
  const { valuationId, focusedRecordType, focusedRecordId, calcs, versions, verifItems, valueDrivers } = input;
  if (!focusedRecordType || !focusedRecordId) return null;

  const id = focusedRecordId;

  switch (focusedRecordType) {
    case 'verification_item':
      if (verifItems.find((i) => i.id === id)) {
        return { type: focusedRecordType, id, valid: true };
      }
      break;
    case 'calculation':
      if (calcs.find((c) => c.id === id)) {
        return { type: focusedRecordType, id, valid: true };
      }
      break;
    case 'version':
      if (versions.find((v) => v.id === id)) {
        return { type: focusedRecordType, id, valid: true };
      }
      break;
    case 'value_driver':
      if (valueDrivers.find((d) => d.id === id)) {
        return { type: focusedRecordType, id, valid: true };
      }
      break;
    case 'initiative':
    case 'deliverable':
    case 'adjustment':
    case 'methodology':
      // These will be validated against their specific tables in Phase 13.4A.3+
      return { type: focusedRecordType, id, valid: 'pending_validation' };
    default:
      return { type: focusedRecordType, id, valid: false, reason: 'unknown_type' };
  }

  return { type: focusedRecordType, id, valid: false, reason: 'not_found_or_not_authorized' };
}

// ── Conversation Scope Helper ─────────────────────────────────────────────────
// Used by askGalileo to find or create a scoped conversation.

export interface ConversationScope {
  profile_id: string;
  business_id: string | null;
  valuation_id: string | null;
  conversation_mode: string; // 'general' | 'valuation_advisor'
  visibility_scope: string;  // 'internal' | 'client_safe'
}

export function resolveConversationScope(
  profileId: string,
  businessId: string | undefined,
  valuationId: string | undefined,
  conversationMode: string | undefined,
  clientSafeOnly: boolean,
): ConversationScope {
  return {
    profile_id: profileId,
    business_id: businessId || null,
    valuation_id: valuationId || null,
    conversation_mode: conversationMode || (valuationId ? 'valuation_advisor' : 'general'),
    visibility_scope: clientSafeOnly ? 'client_safe' : 'internal',
  };
}

export function scopeMatches(existing: any, scope: ConversationScope): boolean {
  if (!existing) return false;
  return (
    existing.business_id === scope.business_id &&
    existing.valuation_id === scope.valuation_id &&
    (existing.conversation_mode || 'general') === scope.conversation_mode &&
    (existing.visibility_scope || 'internal') === scope.visibility_scope
  );
}