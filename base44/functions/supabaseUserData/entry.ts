/**
 * supabaseUserData — secure Supabase reads/writes via service role.
 * All operations are scoped to the authenticated Base44 user's profile.
 *
 * NOTE: This function is preserved as the primary entry point for backwards compatibility.
 * The logic has been extracted into focused sub-functions (supabaseProfileData,
 * supabaseDashboardData, supabaseRoadmapData, supabaseOpportunityData,
 * supabaseVerificationData, supabaseDocumentData) which can also be called directly.
 *
 * Guest session actions are handled by dedicated guestSessionService function.
 *
 * Supported actions:
 *   Profile:      getProfile, getFullProfile, completeOnboarding,
 *                 getBusinessAssessments, getBusinessAssessment,
 *                 getGapAnalyses, getAdvisorNotes, createAdvisorNote
 *
 *   Dashboard:    getDashboardMetrics, upsertDashboardMetrics,
 *                 getMetricSnapshots, getMetricSnapshotsAll, getLatestMetricSnapshot,
 *                 getValueCreationEvents, getValueCreationSummary, getAssessmentSummary
 *
 *   Roadmap:      getRoadmapItems, updateRoadmapItemStatus, onRoadmapItemCompleted
 *
 *   Opportunity:  getBusinessOpportunities, getNextBestAction, getNextBestActions,
 *                 getAllNextBestActions, acceptNextBestAction, dismissNextBestAction,
 *                 resetNextBestAction, updateNextBestAction
 *
 *   Verification: getVerificationQueue, verifyRoadmapItem, verifyValueCreationEvent
 *
 *   Documents:    getDocuments, upsertDocument, uploadDocument,
 *                 getDocumentAnalysisQueue, getExtractedFieldsReviewQueue,
 *                 updateExtractedFieldReview
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
// Phase 6D.0c.3 AUTOMATIC RELEVANT-EVIDENCE POLICY — this router no longer reaches
// extraction directly, and there is no owner scope-confirmation action: Retry only
// enqueues the canonical durable pipeline (shared module below), so no user-reachable
// path can extract inline.
import { retryDocumentIngestion } from '../../shared/documentIngestion/retry.ts';
import { overrideDocumentClassification } from '../../shared/documentIngestion/classificationOverride.ts';
import { resolveBaselineBusinessValue } from '../../shared/intelligenceContract/baselineResolver.ts';
import { buildBusinessIntelligenceContract } from '../../shared/intelligenceContract/businessIntelligenceContract.ts';
import { validateBusinessScope } from '../../shared/businessScope/writeGuard.ts';
import {
  resolveActiveBusiness,
  assertBusinessAccess,
  businessContextError,
  BUSINESS_CONTEXT_REQUIRED,
} from '../../shared/businessScope/activeBusiness.ts';
import {
  authenticateActor,
  resolveActingProfile,
  errorResponse,
  ADMIN_ROLES,
} from '../../shared/authz/actor.ts';
import { authorizeDocumentAccess } from '../../shared/authz/documentAccess.ts';
import { isApprovedDocumentBucket } from '../../shared/documents/buckets.ts';
import { isReadableDocumentType } from '../../shared/documents/documentTypes.ts';
import { resumeIngestion } from '../../shared/documentIngestion/resume.ts';

/**
 * P3 — CANONICAL ADMIN OVERRIDE DECISION. ONE path for every action in this
 * router, so no action carries its own admin check.
 *
 * `_router_user_email` and the body's profile identifiers are TARGET identifiers:
 * they may say WHICH profile is wanted. They never say WHO is asking, and they
 * never establish permission to reach that profile.
 *
 * AUTHORITY comes from VISION's canonical record only:
 *
 *   authenticated Base44 session → authenticateActor() → canonical profiles row
 *     → profiles.id → profiles.app_role → may the actor target another profile?
 *
 *   profiles.app_role ∈ ADMIN_ROLES → yes (admin / super_admin)
 *   anything else                   → refused BEFORE the target is resolved, so a
 *                                     non-admin cannot use this endpoint to probe
 *                                     which addresses exist
 *
 * Base44's user.role is authentication context: it establishes the session and
 * nothing else. It neither grants nor withholds administrative standing here.
 *
 * TARGET RESOLUTION reuses the existing shared resolver, resolveActingProfile().
 * There is no second actor resolver, no second role list and no second
 * authorization framework in this function.
 *
 * Returns { profile } on success, or { denial: Response } when refused.
 */
async function resolveOverrideTarget(
  sb: any,
  actor: any,
  { targetEmail = null, targetProfileId = null }: {
    targetEmail?: string | null;
    targetProfileId?: string | null;
  } = {}
): Promise<{ profile: any; isTarget: boolean; denial: Response | null }> {
  const forbidden = (message: string) =>
    Response.json({ error: message }, { status: 403 });

  // An identifier that is absent, blank or whitespace-only is not a target: the
  // request is an ordinary self request.
  const wantsEmail = typeof targetEmail === 'string' && targetEmail.trim() ? targetEmail.trim() : null;
  const wantsProfileId = typeof targetProfileId === 'string' && targetProfileId.trim() ? targetProfileId.trim() : null;

  // The canonical application role — the ONLY input to this decision.
  const canonicalAdmin = ADMIN_ROLES.includes(actor?.profile?.app_role ?? null);

  // Acting on yourself is not an override: it needs no authority, and it must
  // keep working for every role.
  const selfEmail = String(actor?.profile?.email || actor?.user?.email || '').trim().toLowerCase();
  const emailIsSelf = Boolean(wantsEmail) && wantsEmail.toLowerCase() === selfEmail;
  const idIsSelf = Boolean(wantsProfileId) && wantsProfileId === actor?.profile_id;

  if ((wantsEmail || wantsProfileId) && !emailIsSelf && !idIsSelf && !canonicalAdmin) {
    return { profile: null, isTarget: false, denial: forbidden('Forbidden: admin access required for user override') };
  }

  // Server-side resolution of the requested target. Reused shared contract:
  // 404 when the target cannot be resolved (without disclosing whether it exists),
  // and self-detection when the target IS the actor.
  let resolved: { profile: any; isTarget: boolean };
  try {
    resolved = await resolveActingProfile(sb, actor, {
      targetEmail: wantsEmail,
      targetProfileId: wantsProfileId,
    });
  } catch (err) {
    return { profile: null, isTarget: false, denial: errorResponse(err) };
  }

  // Two identifiers that describe two different profiles are not a request this
  // endpoint honours — fail closed rather than pick one.
  const resolvedEmail = String(resolved.profile?.email || '').trim().toLowerCase();
  if (wantsEmail && wantsProfileId && resolvedEmail && resolvedEmail !== wantsEmail.toLowerCase()) {
    return { profile: null, isTarget: false, denial: forbidden('Forbidden: conflicting target identity') };
  }

  // resolveActingProfile also admits an actor who is provably authorized for the
  // target's BUSINESS. That is the advisor/business access path and it is NOT this
  // administrative override: through this override only a canonical administrator
  // may act as another profile.
  if (resolved.isTarget && !canonicalAdmin) {
    return { profile: null, isTarget: false, denial: forbidden('Forbidden: admin access required for user override') };
  }

  return { profile: resolved.profile, isTarget: resolved.isTarget, denial: null };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!rawUrl || !SERVICE_KEY) {
      return Response.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body = await req.json().catch(() => ({}));
    const { action, data, _router_user_email } = body;

    // ── P3 — CANONICAL ACTOR + TARGET RESOLUTION ──────────────────────────────
    // Authentication is mandatory and unconditional, and the actor's identity is
    // NEVER taken from the request body. The old gate here read the Base44
    // `user.role`, so a legitimate VISION administrator (profiles.app_role =
    // 'admin', Base44 role 'user') was refused, while a Base44-role admin whose
    // canonical role was 'owner' was trusted. Identity and role now come from the
    // canonical profiles row; the body may only name a TARGET.
    const actor = await authenticateActor(base44, sb);
    const user = actor.user;

    // Canonical administrative standing, decided once for the whole router.
    const isCanonicalAdmin = ADMIN_ROLES.includes(actor.profile?.app_role ?? null);

    // A target identifier may arrive as the router's own field or as one of the
    // profile identifiers callers pass alongside it. Both are TARGETS, never
    // identity, and both go through the one canonical decision below.
    const requestedTargetEmail =
      typeof _router_user_email === 'string' && _router_user_email.trim() ? _router_user_email.trim() : null;
    const requestedTargetProfileId =
      [data?.selectedProfileId, data?.selected_profile_id, data?.profileId]
        .find((v) => typeof v === 'string' && v.trim()) || null;

    const override = await resolveOverrideTarget(sb, actor, {
      targetEmail: requestedTargetEmail,
      targetProfileId: requestedTargetProfileId,
    });
    if (override.denial) return override.denial;

    // Every action below consumes the SAME fully-resolved acting profile.
    const getProfile = async () => override.profile;
    const resolvedEmail = override.profile?.email || null;

    // ── PROFILE ──────────────────────────────────────────────────────────────

    if (action === 'getProfile') {
      const profile = await getProfile();
      return Response.json({ profile });
    }

    // ── PHASE 1B: BUSINESS OWNERSHIP ─────────────────────────────────────────

    if (action === 'getBusinessOwnership') {
      const profile = await getProfile();
      if (!profile) return Response.json({ businesses: [] });
      const { data: rows, error } = await sb
        .from('business_owners')
        .select('business_id, ownership_type, ownership_role, is_primary_owner, ownership_percentage')
        .eq('profile_id', profile.id);
      if (error) {
        console.warn('[getBusinessOwnership] query failed (non-fatal):', error.message);
        return Response.json({ businesses: [] });
      }
      const bizIds = (rows || []).map(r => r.business_id).filter(Boolean);
      if (bizIds.length === 0) return Response.json({ businesses: [] });
      // Fetch business details
      const { data: bizRows, error: bizErr } = await sb
        .from('business_entities')
        .select('id, business_name, business_family_type, industry')
        .in('id', bizIds);
      if (bizErr) {
        console.warn('[getBusinessOwnership] business_entities query failed (non-fatal):', bizErr.message);
        return Response.json({ businesses: [] });
      }
      // Merge ownership metadata into each business record
      const ownerMap = (rows || []).reduce((acc, r) => { acc[r.business_id] = r; return acc; }, {});
      const businesses = (bizRows || []).map(b => ({
        id: b.id,
        name: b.business_name,
        business_family_type: b.business_family_type || 'operating_company',
        industry: b.industry || null,
        ownership_type: ownerMap[b.id]?.ownership_type || 'direct_individual',
        ownership_role: ownerMap[b.id]?.ownership_role || 'owner',
        is_primary_owner: ownerMap[b.id]?.is_primary_owner || false,
        ownership_percentage: ownerMap[b.id]?.ownership_percentage || 100,
      }));
      // Sort: primary owner businesses first
      businesses.sort((a, b) => (b.is_primary_owner ? 1 : 0) - (a.is_primary_owner ? 1 : 0));
      return Response.json({ businesses });
    }

    if (action === 'getFullProfile') {
      const profile = await getProfile();
      if (!profile) return Response.json({ profile: null, business: null });
      let business = null;
      if (profile.primary_business_id) {
        const { data: biz } = await sb.from('businesses').select('*').eq('id', profile.primary_business_id).maybeSingle();
        business = biz || null;
      } else {
        const { data: biz } = await sb.from('businesses').select('*').eq('profile_id', profile.id).limit(1);
        business = biz?.[0] || null;
      }
      return Response.json({ profile, business });
    }

    if (action === 'completeOnboarding') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });
      const { business_name, industry, annual_revenue_range, primary_goal } = data || {};
      const { error: pErr } = await sb.from('profiles')
        .update({ onboarding_completed: true, updated_at: new Date().toISOString() }).eq('id', profile.id);
      if (pErr) throw new Error(pErr.message);
      if (business_name || industry) {
        let bizId = profile.primary_business_id;
        if (!bizId) {
          const { data: bizRows } = await sb.from('businesses').select('id').eq('profile_id', profile.id).limit(1);
          bizId = bizRows?.[0]?.id;
        }
        if (bizId) {
          await sb.from('businesses').update({
            ...(business_name ? { name: business_name } : {}),
            ...(industry ? { industry } : {}),
            ...(annual_revenue_range ? { annual_revenue_range } : {}),
            updated_at: new Date().toISOString(),
          }).eq('id', bizId);
        }
      }
      if (primary_goal) {
        const { data: existingFin } = await sb.from('profile_financials').select('id').eq('profile_id', profile.id).maybeSingle();
        const finData = { profile_id: profile.id, primary_goal, updated_at: new Date().toISOString() };
        if (existingFin) {
          await sb.from('profile_financials').update(finData).eq('id', existingFin.id);
        } else {
          await sb.from('profile_financials').insert({ ...finData, created_at: new Date().toISOString() });
        }
      }
      return Response.json({ success: true });
    }

    if (action === 'getBusinessAssessments') {
      const profile = await getProfile();
      if (!profile) return Response.json({ assessments: [] });
      // Phase 6.9 — was profile-wide: a multi-business owner received a UNION of
      // every business's assessments, which then fed BIS directly.
      let businessId;
      try {
        ({ business_id: businessId } = await resolveActiveBusiness(sb, profile, data?.businessId, { action: 'getBusinessAssessments' }));
      } catch (bizErr) { return businessContextError(bizErr); }
      if (!businessId) return Response.json({ assessments: [] });
      const { data: assessments, error } = await sb
        .from('business_assessments').select('*')
        .eq('business_id', businessId).eq('profile_id', profile.id)
        .order('updated_at', { ascending: false });
      if (error) throw new Error(error.message);
      return Response.json({ assessments: assessments || [] });
    }

    if (action === 'getBusinessAssessment') {
      const profile = await getProfile();
      if (!profile) return Response.json({ assessment: null });
      const assessmentType = body.assessmentType || data?.assessmentType;
      if (!assessmentType) return Response.json({ error: 'assessmentType required' }, { status: 400 });
      // Phase 6.9 — was profile-wide, so maybeSingle() picked an ARBITRARY row
      // when the profile had an assessment of this type for several businesses.
      let businessId;
      try {
        ({ business_id: businessId } = await resolveActiveBusiness(sb, profile, data?.businessId, { action: 'getBusinessAssessment' }));
      } catch (bizErr) { return businessContextError(bizErr); }
      if (!businessId) return Response.json({ assessment: null });
      const { data: assessment, error } = await sb
        .from('business_assessments').select('*')
        .eq('business_id', businessId).eq('profile_id', profile.id)
        .eq('assessment_type', assessmentType).maybeSingle();
      if (error) throw new Error(error.message);
      return Response.json({ assessment });
    }

    if (action === 'getGapAnalyses') {
      const profile = await getProfile();
      if (!profile) return Response.json({ gaps: [] });
      // Phase 6.9 — was profile-wide: gap rows from every owned business were
      // returned together and rendered as the active business's gaps.
      let businessId;
      try {
        ({ business_id: businessId } = await resolveActiveBusiness(sb, profile, data?.businessId, { action: 'getGapAnalyses' }));
      } catch (bizErr) { return businessContextError(bizErr); }
      if (!businessId) return Response.json({ gaps: [] });
      const { data: gaps, error } = await sb
        .from('gap_analyses').select('*')
        .eq('business_id', businessId).eq('profile_id', profile.id)
        .order('updated_at', { ascending: false });
      if (error) throw new Error(error.message);
      return Response.json({ gaps: gaps || [] });
    }

    if (action === 'getAdvisorNotes') {
      const profile = await getProfile();
      if (!profile) return Response.json({ notes: [] });
      const { data: notes, error } = await sb
        .from('advisor_notes').select('*').eq('profile_id', profile.id).neq('visibility', 'advisor_only').order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return Response.json({ notes: notes || [] });
    }

    if (action === 'createAdvisorNote') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });
      const { data: note, error } = await sb
        .from('advisor_notes').insert({ ...data, profile_id: profile.id, visibility: 'client_visible' }).select().single();
      if (error) throw new Error(error.message);
      return Response.json({ note });
    }

    // ── DASHBOARD / METRICS ───────────────────────────────────────────────────

    if (action === 'getDashboardMetrics') {
      const profile = await getProfile();
      if (!profile) return Response.json({ metrics: null });
      // Phase 6.9 — resolve through the canonical contract. Never fall back to a
      // profile-wide query, which would return another business's metrics row.
      let businessId;
      try {
        ({ business_id: businessId } = await resolveActiveBusiness(sb, profile, data?.businessId, { action: 'getDashboardMetrics' }));
      } catch (bizErr) { return businessContextError(bizErr); }
      if (!businessId) return Response.json({ metrics: null });
      const { data: metrics, error } = await sb.from('dashboard_metrics').select('*')
        .eq('business_id', businessId)
        .order('updated_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw new Error(error.message);
      return Response.json({ metrics });
    }

    if (action === 'upsertDashboardMetrics') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });

      // Phase 6.9 — metrics identity is BUSINESS-scoped, not profile-scoped.
      // Keying this on profile_id alone meant a multi-business owner had a single
      // metrics row: saving B overwrote A's numbers.
      let businessId;
      try {
        ({ business_id: businessId } = await resolveActiveBusiness(sb, profile, data?.businessId, { action: 'upsertDashboardMetrics' }));
      } catch (bizErr) { return businessContextError(bizErr); }
      if (!businessId) {
        return Response.json(
          { error: 'business_id required to save dashboard metrics', code: BUSINESS_CONTEXT_REQUIRED },
          { status: 400 }
        );
      }

      const { businessId: _ignoredBusinessId, ...metricFields } = data || {};
      const metricsData = {
        ...metricFields,
        profile_id: profile.id,
        business_id: businessId,
        updated_at: new Date().toISOString(),
      };

      const { data: existing, error: lookupErr } = await sb
        .from('dashboard_metrics').select('id').eq('business_id', businessId).maybeSingle();
      if (lookupErr) throw new Error(lookupErr.message);

      if (existing) {
        const { data: result, error } = await sb
          .from('dashboard_metrics').update(metricsData).eq('id', existing.id).select().single();
        if (error) throw new Error(error.message);
        return Response.json({ metrics: result });
      }

      const { data: result, error } = await sb
        .from('dashboard_metrics').insert({ ...metricsData, created_at: new Date().toISOString() }).select().single();
      if (error) {
        // 23505 — a legacy profile-scoped unique constraint is still in force, so
        // this insert would have collided with ANOTHER business's row. Refuse
        // rather than write the wrong business's metrics.
        if (error.code === '23505') {
          console.error('[upsertDashboardMetrics] unique violation — identity still profile-scoped:', error.message);
          return Response.json({
            error: 'dashboard_metrics identity is still profile-scoped — apply migration phase_6_9_dashboard_metrics_business_identity.sql',
            code: 'DASHBOARD_METRICS_IDENTITY_MIGRATION_REQUIRED',
          }, { status: 409 });
        }
        throw new Error(error.message);
      }
      return Response.json({ metrics: result });
    }

    if (action === 'getMetricSnapshots') {
      const profile = await getProfile();
      if (!profile) return Response.json({ snapshots: [] });
      // Phase 6.9 — "latest/history for PROFILE" is not a business-scoped answer.
      let businessId;
      try {
        ({ business_id: businessId } = await resolveActiveBusiness(sb, profile, data?.businessId, { action: 'getMetricSnapshots' }));
      } catch (bizErr) { return businessContextError(bizErr); }
      if (!businessId) return Response.json({ snapshots: [] });
      const { data: snapshots, error } = await sb
        .from('business_metric_snapshots').select('snapshot_date, overall_impact_score')
        .eq('business_id', businessId).order('snapshot_date', { ascending: true }).limit(20);
      if (error) throw new Error(error.message);
      const mapped = (snapshots || []).filter(s => s.overall_impact_score != null).map(s => ({
        snapshot_date: s.snapshot_date, metric_value: s.overall_impact_score,
      }));
      return Response.json({ snapshots: mapped });
    }

    if (action === 'getMetricSnapshotsAll') {
      const profile = await getProfile();
      if (!profile) return Response.json({ snapshots: [] });
      // Phase 6.9 — was profile-wide: the historical IQ chart plotted every
      // owned business's snapshots on one axis.
      let businessId;
      try {
        ({ business_id: businessId } = await resolveActiveBusiness(sb, profile, data?.businessId, { action: 'getMetricSnapshotsAll' }));
      } catch (bizErr) { return businessContextError(bizErr); }
      if (!businessId) return Response.json({ snapshots: [] });
      const { data: snapshots, error } = await sb
        .from('business_metric_snapshots')
        .select('snapshot_date, overall_impact_score, data_confidence_score, annual_revenue, net_profit, ebitda, current_business_value, value_gap, profit_opportunity, tax_opportunity, cash_flow_opportunity')
        .eq('business_id', businessId).order('snapshot_date', { ascending: true }).limit(100);
      if (error) throw new Error(error.message);
      return Response.json({ snapshots: snapshots || [] });
    }

    if (action === 'getLatestMetricSnapshot') {
      const profile = await getProfile();
      if (!profile) return Response.json({ snapshot: null });
      // Phase 6.9 — "latest for business", never "latest for profile": different
      // businesses legitimately have different latest dates.
      let businessId;
      try {
        ({ business_id: businessId } = await resolveActiveBusiness(sb, profile, data?.businessId, { action: 'getLatestMetricSnapshot' }));
      } catch (bizErr) { return businessContextError(bizErr); }
      if (!businessId) return Response.json({ snapshot: null });
      const { data: snapshot, error } = await sb
        .from('business_metric_snapshots').select('*').eq('business_id', businessId)
        .eq('is_latest', true).order('snapshot_date', { ascending: false }).limit(1).maybeSingle();
      if (error) throw new Error(error.message);
      return Response.json({ snapshot: snapshot || null });
    }

    if (action === 'getValueCreationEvents') {
      const profile = await getProfile();
      if (!profile) return Response.json({ events: [] });
      // Phase 6.9 — was hardcoded to primary_business_id, so whenever a NON-primary
      // business was active this returned the primary business's events.
      let businessId;
      try {
        ({ business_id: businessId } = await resolveActiveBusiness(sb, profile, data?.businessId, { action: 'getValueCreationEvents' }));
      } catch (bizErr) { return businessContextError(bizErr); }
      if (!businessId) return Response.json({ events: [] });
      const { data: events, error } = await sb
        .from('value_creation_events').select('*').eq('business_id', businessId).order('created_at', { ascending: false }).limit(50);
      if (error) throw new Error(error.message);
      return Response.json({ events: events || [] });
    }

    if (action === 'getValueCreationSummary') {
      const profile = await getProfile();
      if (!profile) return Response.json({ summary: null });
      // Phase 6.9 — was hardcoded to primary_business_id, and WROTE the profile's
      // primary when it was absent. Now resolves the explicitly requested business
      // and performs no profile mutation from a read path.
      let activeBusinessId;
      try {
        ({ business_id: activeBusinessId } = await resolveActiveBusiness(sb, profile, data?.businessId, { action: 'getValueCreationSummary' }));
      } catch (bizErr) { return businessContextError(bizErr); }
      if (!activeBusinessId) return Response.json({ summary: null });
      const { data: raw, error } = await sb.from('v_value_creation_summary').select('*').eq('business_id', activeBusinessId).maybeSingle();
      if (error) throw new Error(error.message);
      if (!raw) return Response.json({ summary: null });
      const summary = {
        ...raw,
        total_value_created:      raw.total_estimated_value_created ?? null,
        value_created:            raw.total_estimated_value_created ?? null,
        total_tax_savings:        raw.total_estimated_tax_savings ?? null,
        profit_savings:           raw.total_estimated_profit_improvement ?? null,
        total_cash_flow_unlocked: raw.total_estimated_cash_flow_improvement ?? null,
        total_profit_improvement: raw.total_estimated_profit_improvement ?? null,
        total_debt_reduction:     raw.total_estimated_debt_reduction ?? null,
        strategy_wins_count:      raw.verified_events ?? null,
        total_identified_wins:    raw.total_value_events ?? null,
      };
      return Response.json({ summary });
    }

    if (action === 'getAssessmentSummary') {
      const profile = await getProfile();
      if (!profile) return Response.json({ summary: null });
      // Phase 6.9 — canonical resolution. This is the business context for the
      // entire assessment summary AND the Shared Intelligence Contract, so the
      // explicit active business is authoritative; `primary_business_id` is only a
      // default for accounts that own a single business.
      let summaryBusinessId;
      try {
        ({ business_id: summaryBusinessId } = await resolveActiveBusiness(sb, profile, data?.businessId, { action: 'getAssessmentSummary' }));
      } catch (bizErr) { return businessContextError(bizErr); }
      if (!summaryBusinessId) {
        const { data: bizForSummary } = await sb.from('businesses').select('id').eq('profile_id', profile.id).limit(1);
        summaryBusinessId = bizForSummary?.[0]?.id || null;
      }

      // ── Business Authorization ──────────────────────────────────────────────
      // Validate that the resolved business_id is authorized for this profile.
      // Pattern reused from valuationAuth.requireBusinessAccess (not imported to
      // avoid coupling). Super admins access any business. Owners must own.
      // Advisors must be assigned. No fallback to profile-wide results.
      if (!summaryBusinessId) {
        return Response.json({ summary: null, _debug: { reason: 'no_business_resolved' } });
      }
      const summaryRole = profile.app_role || user.role || 'owner';
      const summaryIsAdmin = ['admin', 'super_admin'].includes(summaryRole);
      if (!summaryIsAdmin) {
        const { data: bo } = await sb.from('business_owners')
          .select('business_id').eq('business_id', summaryBusinessId).eq('profile_id', profile.id).maybeSingle();
        const isOwner = !!bo || profile.primary_business_id === summaryBusinessId;
        let isAdvisor = false;
        if (!isOwner && summaryRole === 'advisor') {
          const { data: be } = await sb.from('business_entities')
            .select('id').eq('id', summaryBusinessId).eq('assigned_advisor_id', profile.id).maybeSingle();
          isAdvisor = !!be;
        }
        if (!isOwner && !isAdvisor) {
          return Response.json({ summary: null, _debug: { reason: 'business_not_authorized' } });
        }
      }

      // Pull from Supabase view for aggregate scores (already business-scoped)
      const { data: viewRow } = await sb
        .from('v_business_assessment_summary').select('*').eq('business_id', summaryBusinessId).maybeSingle();

      // Pull Supabase business_assessments — BUSINESS-SCOPED (not profile-scoped)
      // Each business has its own record per assessment type.
      const { data: baRows } = await sb
        .from('business_assessments')
        .select('assessment_type, score, estimated_opportunity_value, risk_level, opportunity_level, summary, key_findings, recommendations')
        .eq('business_id', summaryBusinessId)
        .in('assessment_type', ['profit_gap', 'value_gap', 'tax_gap', 'operations_gap', 'recast_ebitda', 'freedom_assessment']);
      const byType = (baRows || []).reduce((acc, r) => { acc[r.assessment_type] = r; return acc; }, {});
      const pg = byType['profit_gap'], vg = byType['value_gap'], tg = byType['tax_gap'], og = byType['operations_gap'], re = byType['recast_ebitda'];

      // ── SUPABASE SINGLE SOURCE OF TRUTH (Phase A Migration) ──────────────────
      // Base44 Assessment entities are NO LONGER read for assessment truth.
      // All assessment results come from Supabase tables:
      //   1. assessment_calculations.result_json (full computed results, via session join)
      //   2. dashboard_metrics JSONB detail columns (business-scoped, comprehensive)
      //   3. business_assessments (scores, opportunity levels, summaries)

      // 1. Read dashboard_metrics (business-scoped) — primary JSONB detail source
      let dm = null;
      if (summaryBusinessId) {
        const { data: dmByBiz } = await sb.from('dashboard_metrics').select('*').eq('business_id', summaryBusinessId).maybeSingle();
        dm = dmByBiz;
      }
      // Phase 6.9 — NO profile-wide fallback here. `dashboard_metrics` is now one
      // row per BUSINESS (see migration phase_6_9_dashboard_metrics_business_identity.sql),
      // and a profile-scoped lookup could return a DIFFERENT business's metrics and
      // feed them into this business's summary and Shared Intelligence Contract.
      if (!dm) {
        console.warn('[getAssessmentSummary] no dashboard_metrics row for business', summaryBusinessId);
      }

      // 2. Read assessment_calculations (via session join for business scoping)
      //    assessment_calculations has no business_id column — join through assessment_sessions
      const { data: sessions } = await sb.from('assessment_sessions')
        .select('id, assessment_type')
        .eq('business_id', summaryBusinessId)
        .order('completed_at', { ascending: false });

      const calcByType = {};
      if (sessions && sessions.length > 0) {
        const sessionIds = sessions.map(s => s.id);
        // Deterministic ordering: created_at DESC with id DESC as tiebreaker.
        // Without the id tiebreaker, rows with identical (or NULL) created_at
        // have non-deterministic order — meaning a stale RUN A calculation
        // could be selected over the newer RUN B calculation.
        const { data: calcs } = await sb.from('assessment_calculations')
          .select('id, session_id, assessment_type, result_json, input_json, created_at')
          .in('session_id', sessionIds)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false });
        for (const calc of (calcs || [])) {
          if (!calcByType[calc.assessment_type]) {
            calcByType[calc.assessment_type] = calc; // keep latest per type
          }
        }
      }

      const calcPg = calcByType['profit_gap']?.result_json || {};
      const calcVg = calcByType['value_gap']?.result_json || {};
      const calcTg = calcByType['tax_gap']?.result_json || {};
      const calcOg = calcByType['operations_gap']?.result_json || {};
      const calcRe = calcByType['recast_ebitda']?.result_json || {};
      const calcFa = calcByType['freedom_assessment']?.result_json || {};
      const calcOgAnswers = calcByType['operations_gap']?.input_json || {};

      // 3. Build summary from Supabase-only sources
      // Source hierarchy WITHIN Supabase (no database conflict, just evidence recency):
      //   assessment_calculations.result_json  — freshest, full computed results  (PRIMARY)
      //   dashboard_metrics JSONB details      — business-scoped, comprehensive   (SECONDARY)
      //   business_assessments columns         — summary scores                  (TERTIARY)
      const profitGapAmount = calcPg.gapToBest ?? calcPg.gap_to_best ?? calcPg.profit_gap
        ?? dm?.profit_gap_details?.gap_to_best ?? dm?.profit_gap
        ?? pg?.estimated_opportunity_value ?? null;
      const valueGapAmount = calcVg.valueGap ?? calcVg.value_gap
        ?? dm?.value_gap_details?.gap_amount ?? dm?.value_gap
        ?? vg?.estimated_opportunity_value ?? null;
      const taxGapAnnual = calcTg.t3_annual_gap ?? calcTg.totalAnnualSavings
        ?? dm?.tax_gap_details?.annual_overpayment ?? dm?.tax_gap
        ?? tg?.estimated_opportunity_value ?? null;
      const opsScore = calcOg.operations_score ?? calcOg.operationsScore
        ?? dm?.operations_gap_details?.score ?? dm?.operations_gap
        ?? viewRow?.operations_gap_score ?? og?.score ?? null;

      // Operations details — canonical names
      const monthlyFreed = calcOg.monthly_value_of_time_freed ?? calcOg.monthly_value_freed ?? calcOg.monthlyValueFreed
        ?? dm?.operations_gap_details?.monthly_value_of_time_freed ?? dm?.operations_gap_details?.monthly_value_freed ?? null;
      const hourlyValueFreed = calcOg.hourly_value_of_time_freed ?? calcOg.hourly_value ?? calcOg.hourly_value_freed
        ?? dm?.operations_gap_details?.hourly_value_of_time_freed ?? dm?.operations_gap_details?.hourly_value_freed ?? null;
      const hoursFreedPerWeek = calcOg.hours_freed_per_week ?? calcOg.freed_hours_per_week
        ?? dm?.operations_gap_details?.hours_freed_per_week ?? null;
      const monthlyTakeHome = calcOg.monthly_take_home ?? calcOgAnswers.o4_takehome
        ?? dm?.operations_gap_details?.monthly_take_home ?? null;
      const hoursWorkedPerWeek = calcOg.hours_worked_per_week ?? calcOgAnswers.o4_hrs
        ?? dm?.operations_gap_details?.hours_worked_per_week ?? null;

      // Recast EBITDA
      const recastAddBacks = calcRe.total_addbacks ?? calcRe.totalAddBacks ?? calcRe.total_add_backs
        ?? dm?.recast_ebitda_gap_details?.add_backs ?? null;
      const recastValuationIncrease = calcRe.recast_value_impact ?? calcRe.valuationIncrease ?? calcRe.valuation_increase
        ?? dm?.recast_ebitda_gap_details?.valuation_increase
        ?? re?.estimated_opportunity_value ?? null;

      // Freedom
      const freedomScore = calcFa.freedom_score ?? dm?.freedom_score ?? null;

      // IQ score — derived from Supabase assessment data (same formula as calcIQScore)
      const profitScore = calcPg.profit_score ?? dm?.profit_gap_details?.score ?? null;
      const opsScoreNum = typeof opsScore === 'number' ? opsScore : null;
      const taxScore = taxGapAnnual != null
        ? Math.max(0, Math.min(100, Math.round((1 - taxGapAnnual / Math.max(taxGapAnnual, 50000)) * 100)))
        : null;
      const iqComponents = [profitScore, opsScoreNum, freedomScore, taxScore].filter(v => v != null);
      const derivedIqScore = iqComponents.length >= 2
        ? Math.round(iqComponents.reduce((s, v) => s + v, 0) / iqComponents.length)
        : null;

      // Current / potential value
      const currentValue = calcVg.current_value ?? calcVg.currentValue
        ?? dm?.value_gap_details?.current_value ?? dm?.enterprise_value ?? null;
      const potentialValue = calcVg.potential_value ?? calcVg.potentialValue
        ?? dm?.value_gap_details?.potential_value ?? null;

      // ── BASELINE BUSINESS VALUE — Shared Intelligence Contract ──────────────
      // The single certified baseline resolver. Sourced from the first legitimate
      // Value Gap assessment calculation. Immutable, business-scoped, Supabase-backed.
      // Dashboard reads baseline from here — NOT from BIE journal.
      const baseline = await resolveBaselineBusinessValue(sb, summaryBusinessId);

      // ── SHARED BUSINESS INTELLIGENCE CONTRACT ──────────────────────────────
      // The single certified current-business intelligence state. Dashboard reads
      // all current-business metrics from this contract — no independent resolution.
      // See intelligenceContract/businessIntelligenceContract.ts.
      const intelligenceContract = await buildBusinessIntelligenceContract(sb, summaryBusinessId, profile.id);

      const summary = {
        ...(viewRow || {}),
        // ── Shared Business Intelligence Contract ──
        // The full normalized contract — single certified current-business state.
        // Dashboard, Executive Brief, Galileo, and Living Intelligence all read
        // from this. See intelligenceContract/businessIntelligenceContract.ts.
        intelligence_contract: intelligenceContract,
        contract_version: intelligenceContract.contract_version,
        contract_generated_at: intelligenceContract.generated_at,
        // ── Baseline Business Value (Shared Contract) ──
        baseline_business_value:       intelligenceContract.valuation.baseline_value,
        baseline_business_value_date:  intelligenceContract.valuation.baseline_date,
        baseline_business_value_status: intelligenceContract.valuation.baseline_status,
        baseline_business_value_source: intelligenceContract.valuation.baseline_source,
        profit_gap_amount:            profitGapAmount,
        profit_gap_severity:          pg?.opportunity_level ?? dm?.profit_gap_details?.severity ?? null,
        profit_gap_summary:           pg?.summary ?? dm?.profit_gap_details?.summary ?? null,
        profit_gap_details:           {
          severity: pg?.opportunity_level ?? dm?.profit_gap_details?.severity ?? null,
          gap_to_best: profitGapAmount,
          gap_to_average: calcPg.profit_gap_to_avg ?? calcPg.gapToAvg ?? dm?.profit_gap_details?.gap_to_average ?? null,
          summary: pg?.summary ?? dm?.profit_gap_details?.summary ?? null,
        },
        value_gap_amount:             valueGapAmount,
        value_gap_severity:           vg?.opportunity_level ?? dm?.value_gap_details?.severity ?? null,
        value_gap_summary:            vg?.summary ?? dm?.value_gap_details?.summary ?? null,
        value_gap_details:            {
          severity: vg?.opportunity_level ?? dm?.value_gap_details?.severity ?? null,
          current_value: currentValue,
          potential_value: potentialValue,
        },
        current_business_value:       currentValue,
        tax_gap_annual:               taxGapAnnual,
        tax_gap_ten_year:             taxGapAnnual != null ? Math.round(taxGapAnnual * 10) : null,
        tax_gap_severity:             tg?.opportunity_level ?? dm?.tax_gap_details?.severity ?? null,
        tax_gap_summary:              tg?.summary ?? dm?.tax_gap_details?.summary ?? null,
        tax_gap_details:              {
          severity: tg?.opportunity_level ?? dm?.tax_gap_details?.severity ?? null,
          annual_overpayment: taxGapAnnual,
          opportunities: calcTg.t3_strategies ?? dm?.tax_gap_details?.opportunities ?? [],
        },
        operations_score:             opsScore,
        operations_gap_severity:      og?.opportunity_level ?? dm?.operations_gap_details?.severity ?? null,
        operations_gap_summary:       og?.summary ?? dm?.operations_gap_details?.summary ?? null,
        operations_gap_details:       {
          severity:                    og?.opportunity_level ?? dm?.operations_gap_details?.severity ?? null,
          score:                       opsScore,
          hourly_value_of_time_freed:  hourlyValueFreed,
          monthly_value_of_time_freed: monthlyFreed,
          hours_freed_per_week:        hoursFreedPerWeek,
          monthly_take_home:           monthlyTakeHome,
          hours_worked_per_week:       hoursWorkedPerWeek,
          hourly_value_freed:          hourlyValueFreed,
          monthly_value_freed:         monthlyFreed,
        },
        hourly_value_of_time_freed:   hourlyValueFreed,
        monthly_value_of_time_freed:  monthlyFreed,
        hours_freed_per_week:         hoursFreedPerWeek,
        monthly_value_freed:          monthlyFreed,
        hourly_value_freed:           hourlyValueFreed,
        recast_ebitda_details:        {
          add_backs:          recastAddBacks,
          valuation_increase: recastValuationIncrease,
        },
        freedom_score:                freedomScore,
        derived_iq_score:             derivedIqScore,
        _source: 'supabase_only',
      };
      return Response.json({ summary });
    }

    // ── ROADMAP ───────────────────────────────────────────────────────────────

    if (action === 'getRoadmapItems') {
      const profile = await getProfile();
      if (!profile) return Response.json({ items: [] });
      // Phase 6.9 — was profile-wide, and these items are also fed into BIS as
      // roadmapItems, so mixed businesses leaked into the intelligence state.
      let businessId;
      try {
        ({ business_id: businessId } = await resolveActiveBusiness(sb, profile, data?.businessId, { action: 'getRoadmapItems' }));
      } catch (bizErr) { return businessContextError(bizErr); }
      if (!businessId) return Response.json({ items: [] });
      const { data: items, error } = await sb
        .from('roadmap_items').select('*')
        .eq('business_id', businessId).eq('profile_id', profile.id)
        .order('updated_at', { ascending: false });
      if (error) throw new Error(error.message);
      return Response.json({ items: items || [] });
    }

    if (action === 'updateRoadmapItemStatus') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });
      const { roadmap_item_id, status } = data || {};
      if (!roadmap_item_id) return Response.json({ error: 'roadmap_item_id required' }, { status: 400 });
      if (!status) return Response.json({ error: 'status required' }, { status: 400 });
      const VALID_STATUSES = [
        'Not Started', 'Gathering Information', 'Scheduled', 'In Progress',
        'Waiting On Owner', 'Waiting On Advisor', 'Implemented', 'Verified', 'Deferred', 'Dismissed',
      ];
      if (!VALID_STATUSES.includes(status)) {
        return Response.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
      }
      const { data: item, error: fetchErr } = await sb
        .from('roadmap_items')
        .select('id, profile_id, business_id, value_creation_event_id, completed_at, verified_at, estimated_value_created, estimated_tax_savings, estimated_profit_improvement, estimated_cash_flow_improvement')
        .eq('id', roadmap_item_id).maybeSingle();
      if (fetchErr) throw new Error(fetchErr.message);
      if (!item) return Response.json({ error: 'Roadmap item not found' }, { status: 404 });
      if (item.profile_id !== profile.id) return Response.json({ error: 'Forbidden' }, { status: 403 });
      const now = new Date().toISOString();
      const patch = { status, updated_at: now };
      if (status === 'Implemented' && !item.completed_at) patch.completed_at = now;
      if (status === 'Verified' && !item.verified_at) patch.verified_at = now;
      const { error: updateErr } = await sb.from('roadmap_items').update(patch).eq('id', roadmap_item_id);
      if (updateErr) throw new Error(updateErr.message);
      if ((status === 'Implemented' || status === 'Completed') && !item.value_creation_event_id) {
        try {
          const categoryMap = {
            profit_gap: 'profit', value_gap: 'valuation', tax_gap: 'tax',
            operations_gap: 'operations', recast_ebitda: 'valuation', freedom_assessment: 'operations',
          };
          const { data: existingVce } = await sb.from('value_creation_events').select('id').eq('roadmap_item_id', roadmap_item_id).maybeSingle();
          if (!existingVce) {
            const vcePayload = {
              business_id: item.business_id || null, roadmap_item_id: item.id,
              title: item.title, description: item.description || null,
              category: categoryMap[item.source_assessment_type] || item.category || 'general',
              source_assessment_type: item.source_assessment_type || null,
              status: 'pending_verification',
              estimated_impact: item.estimated_value_created || null,
              estimated_tax_savings: item.estimated_tax_savings || null,
              estimated_profit_improvement: item.estimated_profit_improvement || null,
              estimated_cash_flow_improvement: item.estimated_cash_flow_improvement || null,
              confidence_level: 'estimated', created_at: now, updated_at: now,
            };
            const { data: newVce } = await sb.from('value_creation_events').insert(vcePayload).select('id').single();
            if (newVce) await sb.from('roadmap_items').update({ value_creation_event_id: newVce.id, updated_at: now }).eq('id', roadmap_item_id);
          }
        } catch (vceCreateErr) {
          console.error('[updateRoadmapItemStatus] VCE auto-create failed (non-fatal):', vceCreateErr?.message);
        }
      }
      if (item.value_creation_event_id) {
        try {
          if (status === 'Implemented') {
            await sb.from('value_creation_events').update({ status: 'implemented', updated_at: now }).eq('id', item.value_creation_event_id);
          }
          if (status === 'Verified') {
            const { data: vce } = await sb.from('value_creation_events')
              .select('verified_value, verified_tax_savings, verified_profit_improvement, verified_cash_flow_improvement')
              .eq('id', item.value_creation_event_id).maybeSingle();
            const vcePatch = { status: 'verified', confidence_level: 'verified', updated_at: now };
            if (vce && !vce.verified_value && item.estimated_value_created) vcePatch.verified_value = item.estimated_value_created;
            if (vce && !vce.verified_tax_savings && item.estimated_tax_savings) vcePatch.verified_tax_savings = item.estimated_tax_savings;
            if (vce && !vce.verified_profit_improvement && item.estimated_profit_improvement) vcePatch.verified_profit_improvement = item.estimated_profit_improvement;
            if (vce && !vce.verified_cash_flow_improvement && item.estimated_cash_flow_improvement) vcePatch.verified_cash_flow_improvement = item.estimated_cash_flow_improvement;
            await sb.from('value_creation_events').update(vcePatch).eq('id', item.value_creation_event_id);
          }
        } catch (vceErr) {
          console.error('[updateRoadmapItemStatus] VCE cascade failed (non-fatal):', vceErr?.message || vceErr);
        }
      }
      return Response.json({ success: true, roadmap_item_id, status });
    }

    if (action === 'onRoadmapItemCompleted') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });
      const { roadmap_item_id } = data || {};
      if (!roadmap_item_id) return Response.json({ error: 'roadmap_item_id required' }, { status: 400 });
      const { data: item, error: fetchErr } = await sb.from('roadmap_items').select('*').eq('id', roadmap_item_id).maybeSingle();
      if (fetchErr) throw new Error(fetchErr.message);
      if (!item) return Response.json({ error: 'Roadmap item not found' }, { status: 404 });
      if (item.profile_id !== profile.id) return Response.json({ error: 'Forbidden' }, { status: 403 });
      const now = new Date().toISOString();
      const { data: existing } = await sb.from('value_creation_events').select('id, status').eq('roadmap_item_id', roadmap_item_id).maybeSingle();
      if (existing) {
        if (existing.status !== 'verified') {
          await sb.from('value_creation_events').update({ status: 'pending_verification', updated_at: now }).eq('id', existing.id);
        }
        return Response.json({ vce_id: existing.id, action: 'updated' });
      }
      const categoryMap = {
        profit_gap: 'profit', value_gap: 'valuation', tax_gap: 'tax',
        operations_gap: 'operations', recast_ebitda: 'valuation', freedom_assessment: 'operations',
      };
      const vcePayload = {
        business_id: item.business_id || null, roadmap_item_id: item.id,
        title: item.title, description: item.description || null,
        category: categoryMap[item.source_assessment_type] || item.category || 'general',
        source_assessment_type: item.source_assessment_type || null,
        status: 'pending_verification',
        estimated_impact: item.estimated_value_created || null,
        estimated_tax_savings: item.estimated_tax_savings || null,
        estimated_profit_improvement: item.estimated_profit_improvement || null,
        estimated_cash_flow_improvement: item.estimated_cash_flow_improvement || null,
        confidence_level: 'estimated', created_at: now, updated_at: now,
      };
      const { data: vce, error: insertErr } = await sb.from('value_creation_events').insert(vcePayload).select('id').single();
      if (insertErr) throw new Error(insertErr.message);
      await sb.from('roadmap_items').update({ value_creation_event_id: vce.id, updated_at: now }).eq('id', roadmap_item_id);
      return Response.json({ vce_id: vce.id, action: 'created' });
    }

    // ── OPPORTUNITIES / NEXT BEST ACTIONS ─────────────────────────────────────

    if (action === 'getBusinessOpportunities') {
      const profile = await getProfile();
      if (!profile) return Response.json({ opportunities: [] });
      // Phase 6.9 — was hardcoded to primary_business_id.
      let businessId;
      try {
        ({ business_id: businessId } = await resolveActiveBusiness(sb, profile, data?.businessId, { action: 'getBusinessOpportunities' }));
      } catch (bizErr) { return businessContextError(bizErr); }
      if (!businessId) return Response.json({ opportunities: [] });
      const { data: opportunities, error } = await sb
        .from('business_opportunities').select('*').eq('business_id', businessId).order('priority_score', { ascending: false }).limit(50);
      if (error) throw new Error(error.message);
      return Response.json({ opportunities: opportunities || [] });
    }

    if (action === 'getNextBestAction') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });
      // Phase 6.9 — resolve through the canonical active-business contract.
      // `data.businessId` / `data.business_id` are the explicit context; the
      // profile default is only used when it is unambiguous.
      let businessId;
      try {
        ({ business_id: businessId } = await resolveActiveBusiness(
          sb, profile, data?.businessId || data?.business_id, { action: 'getNextBestAction' }
        ));
      } catch (bizErr) { return businessContextError(bizErr); }
      if (!businessId) return Response.json({ fallback: 'onboarding_required', primary: null });
      const { data: topAction, error: topErr } = await sb
        .from('next_best_actions').select('*').eq('business_id', businessId)
        .in('status', ['recommended', 'accepted', 'in_progress']).order('priority_score', { ascending: false }).limit(1).maybeSingle();
      if (topErr) throw new Error(topErr.message);
      if (topAction) return Response.json({ primary: topAction, secondaries: [], reason: 'from_db' });
      // DB empty → only generate if canonical recommendations are provided by the frontend
      if (!data?.recommendations || !Array.isArray(data.recommendations) || data.recommendations.length === 0) {
        return Response.json({ primary: null, secondaries: [], reason: 'no_actions' });
      }
      try {
        const genResult = await base44.asServiceRole.functions.invoke('generateNextBestActions', {
          business_id: businessId,
          canonical_version: data?.canonical_version || 1,
          recommendations: data.recommendations,
        });
        if (genResult?.primary) return Response.json({
          primary: genResult.primary,
          secondaries: genResult.secondaries || [],
          reason: genResult.reason || 'generated',
          selected_type: genResult.selected_type || null,
        });
      } catch (genErr) {
        console.error('[getNextBestAction] generateNextBestActions invoke failed:', genErr?.message);
      }
      return Response.json({ primary: null, secondaries: [], reason: 'no_actions' });
    }

    if (action === 'getNextBestActions') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });
      const role = profile.app_role || user.role;
      const isOwner = role !== 'super_admin' && role !== 'advisor';
      let nbaQuery = sb.from('next_best_actions').select('*').in('status', ['recommended', 'accepted', 'in_progress']).order('priority_score', { ascending: false }).limit(10);
      if (isOwner) {
        // Phase 6.9 — was hardcoded to primary_business_id, so the active business's
        // next best actions never appeared for a non-primary selection.
        let ownerBusinessId;
        try {
          ({ business_id: ownerBusinessId } = await resolveActiveBusiness(sb, profile, data?.businessId, { action: 'getNextBestActions' }));
        } catch (bizErr) { return businessContextError(bizErr); }
        if (!ownerBusinessId) return Response.json({ actions: [] });
        nbaQuery = nbaQuery.eq('business_id', ownerBusinessId);
      } else if (role === 'advisor') {
        const { data: assignments } = await sb.from('advisor_assignments').select('business_id').eq('advisor_profile_id', profile.id);
        const bizIds = (assignments || []).map(a => a.business_id).filter(Boolean);
        if (bizIds.length === 0) return Response.json({ actions: [] });
        nbaQuery = nbaQuery.in('business_id', bizIds);
      }
      const { data: actions, error } = await nbaQuery;
      if (error) throw new Error(error.message);
      return Response.json({ actions: actions || [] });
    }

    if (action === 'getAllNextBestActions') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });
      const role = profile.app_role || user.role;
      if (role !== 'super_admin' && role !== 'advisor' && role !== 'admin') {
        return Response.json({ error: 'Forbidden: advisors only' }, { status: 403 });
      }
      let nbaQuery = sb.from('next_best_actions').select('*').order('priority_score', { ascending: false }).order('created_at', { ascending: false });
      if (role === 'advisor') {
        const { data: assignments } = await sb.from('advisor_assignments').select('business_id').eq('advisor_profile_id', profile.id);
        const bizIds = (assignments || []).map(a => a.business_id).filter(Boolean);
        if (bizIds.length === 0) return Response.json({ actions: [] });
        nbaQuery = nbaQuery.in('business_id', bizIds);
      }
      const { data: actions, error } = await nbaQuery;
      if (error) throw new Error(error.message);
      return Response.json({ actions: actions || [] });
    }

    if (action === 'acceptNextBestAction') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });
      const { action_id } = data || {};
      if (!action_id) return Response.json({ error: 'action_id required' }, { status: 400 });
      const { data: nba, error: fetchErr } = await sb.from('next_best_actions').select('*').eq('id', action_id).maybeSingle();
      if (fetchErr) throw new Error(fetchErr.message);
      if (!nba) return Response.json({ error: 'Action not found' }, { status: 404 });
      // Phase 6.9 — authorize the actor against the RECORD's business, not the
      // profile default. Previously every non-primary business returned 403 here,
      // making accept unusable outside the primary business.
      try {
        await assertBusinessAccess(sb, nba.business_id, profile, { action: 'acceptNextBestAction' });
      } catch (authErr) { return businessContextError(authErr); }
      const now = new Date().toISOString();
      let roadmapItemId = nba.metadata?.roadmap_item_id || null;
      let roadmapItem = null;
      if (!roadmapItemId) {
        const { data: existing } = await sb.from('roadmap_items').select('id').eq('business_id', nba.business_id).eq('title', nba.title).maybeSingle();
        roadmapItemId = existing?.id || null;
      }
      if (roadmapItemId) {
        const { data: linked } = await sb.from('roadmap_items').select('id, title, status').eq('id', roadmapItemId).maybeSingle();
        roadmapItem = linked;
      } else {
        const roadmapPayload = {
          business_id: nba.business_id, profile_id: profile.id, title: nba.title,
          description: nba.description || null, category: nba.category || 'general',
          priority: nba.priority_score >= 80 ? 'High' : nba.priority_score >= 60 ? 'Medium' : 'Low',
          impact_score: nba.priority_score || null, source_assessment_type: nba.source || null,
          estimated_value_created: nba.estimated_impact || null,
          estimated_tax_savings: nba.metadata?.estimated_tax_savings || null,
          estimated_profit_improvement: nba.metadata?.estimated_profit_improvement || null,
          estimated_cash_flow_improvement: nba.metadata?.estimated_cash_flow_improvement || null,
          status: 'Not Started', due_date: nba.due_date || null,
          value_creation_event_id: null, created_at: now, updated_at: now,
        };
        const { data: created, error: riErr } = await sb.from('roadmap_items').insert(roadmapPayload).select('id, title, status').single();
        if (riErr) { console.error('[acceptNextBestAction] roadmap_items insert failed (non-fatal):', riErr.message); }
        else { roadmapItem = created; roadmapItemId = created.id; }
      }
      const updatedMetadata = { ...(nba.metadata || {}), roadmap_item_id: roadmapItemId };
      const { data: updated, error: updateErr } = await sb.from('next_best_actions')
        .update({ status: 'accepted', updated_at: now, metadata: updatedMetadata }).eq('id', action_id).select().single();
      if (updateErr) throw new Error(updateErr.message);
      return Response.json({ action: updated, roadmap_item: roadmapItem, roadmap_linked: !!roadmapItemId });
    }

    if (action === 'dismissNextBestAction') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });
      const { action_id } = data || {};
      if (!action_id) return Response.json({ error: 'action_id required' }, { status: 400 });
      const { data: nbaAction, error: fetchErr } = await sb.from('next_best_actions').select('id, business_id').eq('id', action_id).maybeSingle();
      if (fetchErr) throw new Error(fetchErr.message);
      if (!nbaAction) return Response.json({ error: 'Action not found' }, { status: 404 });
      // Phase 6.9 — authorize against the RECORD's business (see acceptNextBestAction).
      try {
        await assertBusinessAccess(sb, nbaAction.business_id, profile, { action: 'dismissNextBestAction' });
      } catch (authErr) { return businessContextError(authErr); }
      const { data: updated, error: updateErr } = await sb.from('next_best_actions')
        .update({ status: 'dismissed', updated_at: new Date().toISOString(), metadata: { dismissed_by: profile.id, dismissed_at: new Date().toISOString() } })
        .eq('id', action_id).select().single();
      if (updateErr) throw new Error(updateErr.message);
      return Response.json({ action: updated });
    }

    if (action === 'resetNextBestAction') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });
      const role = profile.app_role || user.role;
      if (role !== 'super_admin' && role !== 'advisor' && role !== 'admin') return Response.json({ error: 'Forbidden: advisors only' }, { status: 403 });
      const { action_id } = data || {};
      if (!action_id) return Response.json({ error: 'action_id required' }, { status: 400 });
      const { data: updated, error: updateErr } = await sb.from('next_best_actions')
        .update({ status: 'recommended', updated_at: new Date().toISOString(), metadata: {} }).eq('id', action_id).select().single();
      if (updateErr) throw new Error(updateErr.message);
      return Response.json({ action: updated });
    }

    if (action === 'getAllNextBestActions') {
      // Already handled above
    }

    if (action === 'updateNextBestAction') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });
      const { action_id, status } = data || {};
      if (!action_id) return Response.json({ error: 'action_id required' }, { status: 400 });
      const now = new Date().toISOString();
      const updateData = { status, updated_at: now };
      if (status === 'dismissed' || status === 'accepted' || status === 'completed') {
        updateData.metadata = { [`${status}_by`]: profile.id, [`${status}_at`]: now };
      }
      const { data: updated, error: updateErr } = await sb.from('next_best_actions').update(updateData).eq('id', action_id).select().single();
      if (updateErr) throw new Error(updateErr.message);
      return Response.json({ action: updated });
    }

    // ── VERIFICATION ──────────────────────────────────────────────────────────

    if (action === 'verifyRoadmapItem') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });
      const role = profile.app_role || user.role;
      if (role !== 'super_admin' && role !== 'advisor' && role !== 'admin') return Response.json({ error: 'Forbidden: only advisors and admins can verify items' }, { status: 403 });
      const { roadmap_item_id, verification_notes, verified_value_created, verified_tax_savings, verified_profit_improvement, verified_cash_flow_improvement, verified_debt_reduction } = data || {};
      if (!roadmap_item_id) return Response.json({ error: 'roadmap_item_id required' }, { status: 400 });
      const { data: item, error: fetchErr } = await sb.from('roadmap_items')
        .select('id, profile_id, business_id, value_creation_event_id, verified_at, estimated_value_created, estimated_tax_savings, estimated_profit_improvement, estimated_cash_flow_improvement')
        .eq('id', roadmap_item_id).maybeSingle();
      if (fetchErr) throw new Error(fetchErr.message);
      if (!item) return Response.json({ error: 'Roadmap item not found' }, { status: 404 });
      if (role === 'advisor' && item.business_id) {
        const { data: assignment } = await sb.from('advisor_assignments').select('id').eq('advisor_profile_id', profile.id).eq('business_id', item.business_id).maybeSingle();
        if (!assignment) return Response.json({ error: 'Forbidden: not assigned to this business' }, { status: 403 });
      }
      const now = new Date().toISOString();
      const patch = {
        status: 'Verified', updated_at: now,
        ...(item.verified_at ? {} : { verified_at: now }),
        ...(verification_notes != null ? { verification_notes } : {}),
        verified_value_created:         verified_value_created         ?? item.estimated_value_created         ?? null,
        verified_tax_savings:           verified_tax_savings           ?? item.estimated_tax_savings           ?? null,
        verified_profit_improvement:    verified_profit_improvement    ?? item.estimated_profit_improvement    ?? null,
        verified_cash_flow_improvement: verified_cash_flow_improvement ?? item.estimated_cash_flow_improvement ?? null,
        ...(verified_debt_reduction != null ? { verified_debt_reduction } : {}),
      };
      const { error: updateErr } = await sb.from('roadmap_items').update(patch).eq('id', roadmap_item_id);
      if (updateErr) throw new Error(updateErr.message);
      if (item.value_creation_event_id) {
        try {
          const { data: vce } = await sb.from('value_creation_events')
            .select('verified_value, verified_tax_savings, verified_profit_improvement, verified_cash_flow_improvement, reviewed_by')
            .eq('id', item.value_creation_event_id).maybeSingle();
          const vcePatch = {
            status: 'verified', confidence_level: 'verified',
            reviewed_by: vce?.reviewed_by || profile.id, reviewed_at: now, updated_at: now,
            verified_value:                 verified_value_created         ?? vce?.verified_value                ?? item.estimated_value_created         ?? null,
            verified_tax_savings:           verified_tax_savings           ?? vce?.verified_tax_savings          ?? item.estimated_tax_savings           ?? null,
            verified_profit_improvement:    verified_profit_improvement    ?? vce?.verified_profit_improvement   ?? item.estimated_profit_improvement    ?? null,
            verified_cash_flow_improvement: verified_cash_flow_improvement ?? vce?.verified_cash_flow_improvement ?? item.estimated_cash_flow_improvement ?? null,
          };
          await sb.from('value_creation_events').update(vcePatch).eq('id', item.value_creation_event_id);
        } catch (vceErr) {
          console.error('[verifyRoadmapItem] VCE cascade failed (non-fatal):', vceErr?.message || vceErr);
        }
      }
      return Response.json({ success: true, roadmap_item_id, status: 'Verified' });
    }

    if (action === 'verifyValueCreationEvent') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });
      const role = profile.app_role || user.role;
      if (role !== 'super_admin' && role !== 'advisor' && role !== 'admin') return Response.json({ error: 'Forbidden: only advisors and admins can verify events' }, { status: 403 });
      const { event_id, verification_notes, verified_value, verified_tax_savings, verified_profit_improvement, verified_cash_flow_improvement } = data || {};
      if (!event_id) return Response.json({ error: 'event_id required' }, { status: 400 });
      const { data: vce, error: fetchErr } = await sb.from('value_creation_events')
        .select('id, business_id, roadmap_item_id, reviewed_by, reviewed_at, estimated_impact, verified_value, verified_tax_savings, verified_profit_improvement, verified_cash_flow_improvement')
        .eq('id', event_id).maybeSingle();
      if (fetchErr) throw new Error(fetchErr.message);
      if (!vce) return Response.json({ error: 'Event not found' }, { status: 404 });
      if (profile.app_role === 'advisor' && vce.business_id) {
        const { data: assignment } = await sb.from('advisor_assignments').select('id').eq('advisor_profile_id', profile.id).eq('business_id', vce.business_id).maybeSingle();
        if (!assignment) return Response.json({ error: 'Forbidden: not assigned to this business' }, { status: 403 });
      }
      const now = new Date().toISOString();
      const vcePatch = {
        status: 'verified', confidence_level: 'verified',
        reviewed_by: vce.reviewed_by || profile.id, reviewed_at: vce.reviewed_at || now, updated_at: now,
        verified_value:                 verified_value                ?? vce.verified_value                ?? vce.estimated_impact ?? null,
        verified_tax_savings:           verified_tax_savings          ?? vce.verified_tax_savings          ?? null,
        verified_profit_improvement:    verified_profit_improvement   ?? vce.verified_profit_improvement   ?? null,
        verified_cash_flow_improvement: verified_cash_flow_improvement ?? vce.verified_cash_flow_improvement ?? null,
        ...(verification_notes != null ? { notes: verification_notes } : {}),
      };
      const { error: updateErr } = await sb.from('value_creation_events').update(vcePatch).eq('id', event_id);
      if (updateErr) throw new Error(updateErr.message);
      if (vce.roadmap_item_id) {
        try {
          const { data: ri } = await sb.from('roadmap_items').select('id, verified_at').eq('id', vce.roadmap_item_id).maybeSingle();
          if (ri) await sb.from('roadmap_items').update({ status: 'Verified', ...(ri.verified_at ? {} : { verified_at: now }), updated_at: now }).eq('id', ri.id);
        } catch (riErr) {
          console.error('[verifyValueCreationEvent] roadmap_item cascade failed (non-fatal):', riErr?.message || riErr);
        }
      }
      return Response.json({ success: true, event_id, status: 'verified' });
    }

    if (action === 'getVerificationQueue') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });
      const role = profile.app_role || user.role;
      if (role !== 'super_admin' && role !== 'advisor' && role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
      let riQuery = sb.from('roadmap_items')
        .select('id, title, category, status, priority, profile_id, business_id, value_creation_event_id, estimated_value_created, estimated_tax_savings, estimated_profit_improvement, estimated_cash_flow_improvement, source_assessment_type, completed_at, verified_at, updated_at')
        .eq('status', 'Implemented').order('updated_at', { ascending: false }).limit(50);
      if (role === 'advisor') {
        const { data: assignments } = await sb.from('advisor_assignments').select('business_id').eq('advisor_profile_id', profile.id);
        const bizIds = (assignments || []).map(a => a.business_id).filter(Boolean);
        if (bizIds.length > 0) { riQuery = riQuery.in('business_id', bizIds); }
        else { return Response.json({ roadmap_items: [], value_creation_events: [] }); }
      }
      const { data: roadmapItems } = await riQuery;
      let vceQuery = sb.from('value_creation_events')
        .select('id, title, category, status, confidence_level, business_id, roadmap_item_id, estimated_impact, estimated_tax_savings, estimated_profit_improvement, estimated_cash_flow_improvement, reviewed_by, reviewed_at, updated_at')
        .in('status', ['pending_verification', 'implemented']).order('updated_at', { ascending: false }).limit(50);
      if (role === 'advisor') {
        const { data: assignments } = await sb.from('advisor_assignments').select('business_id').eq('advisor_profile_id', profile.id);
        const bizIds = (assignments || []).map(a => a.business_id).filter(Boolean);
        if (bizIds.length > 0) { vceQuery = vceQuery.in('business_id', bizIds); }
        else { return Response.json({ roadmap_items: roadmapItems || [], value_creation_events: [] }); }
      }
      const { data: vceItems } = await vceQuery;
      return Response.json({ roadmap_items: roadmapItems || [], value_creation_events: vceItems || [] });
    }

    // ── DOCUMENTS ─────────────────────────────────────────────────────────────

    if (action === 'getDocuments') {
      const profile = await getProfile();
      if (!profile) return Response.json({ documents: [], _debug: { reason: 'profile_not_found', resolvedEmail } });
      const profileId = profile.id;
      const bizId = profile.primary_business_id || null;

      // P3 — the ACTING profile is authoritative. A body-supplied profile id was
      // already resolved through the canonical target path above (admin-only, or
      // self), so it can no longer widen whose rows this action reads.
      const { selectedProfileId, selectedBusinessId: selectedBizId } = data || {};
      const effectiveProfileId = profileId;
      let effectiveBusinessId = bizId;
      if (selectedBizId && selectedBizId !== bizId) {
        if (isCanonicalAdmin) {
          effectiveBusinessId = selectedBizId;
        } else {
          // An owner must not escape their authorized businesses by naming one.
          try {
            await assertBusinessAccess(sb, selectedBizId, profile, { action: 'getDocuments' });
            effectiveBusinessId = selectedBizId;
          } catch (bizErr) { return businessContextError(bizErr); }
        }
      }

      let docQuery = sb.from('documents')
        .select('id, name, document_type, upload_source, file_url, file_path, file_size, year, status, upload_status, profile_id, business_id, created_at, updated_at')
        .order('created_at', { ascending: false });

      // Phase 6.9 — was `profile_id.eq.<me>,business_id.eq.<biz>`, which returned
      // EVERY document belonging to the profile, so an owner's other businesses'
      // documents were listed alongside the active business's.
      //
      // Correct shape: the active business's documents, PLUS profile-level
      // (household) documents, which are ACCOUNT_GLOBAL by design
      // (`document_scope = 'household'`, business_id null).
      if (effectiveBusinessId) {
        docQuery = docQuery.or(
          `business_id.eq.${effectiveBusinessId},and(business_id.is.null,profile_id.eq.${effectiveProfileId})`
        );
      } else if (effectiveProfileId) {
        docQuery = docQuery.eq('profile_id', effectiveProfileId);
      }

      const { data: documents, error } = await docQuery;
      if (error) throw new Error(error.message);

      const debugInfo = {
        effectiveProfileId,
        effectiveBusinessId,
        selectedProfileId: selectedProfileId || null,
        selectedBusinessId: selectedBizId || null,
        currentUserProfileId: profileId,
        currentUserBusinessId: bizId,
        queryMode: (effectiveProfileId && effectiveBusinessId) ? 'or_profile_or_business' : effectiveBusinessId ? 'business_only' : 'profile_only',
        rowCount: (documents || []).length,
        firstRows: (documents || []).slice(0, 3).map(d => ({ id: d.id, name: d.name, profile_id: d.profile_id, business_id: d.business_id })),
      };
      console.log('[getDocuments] DEBUG:', JSON.stringify(debugInfo));

      return Response.json({ documents: documents || [], _debug: debugInfo });
    }

    if (action === 'getDataRoomDocuments') {
      const profile = await getProfile();
      if (!profile) return Response.json({ documents: [], _debug: { reason: 'no_profile', mode: 'data_room' } });
      const role = profile.app_role || user.role || 'owner';
      const profileId = profile.id;
      const bizId = profile.primary_business_id || null;
      const { selectedBusinessId } = data || {};
      const isAdmin = ['admin', 'super_admin'].includes(role);

      // Resolve effective context — never pass null/undefined to eq()
      // Phase 6.9 — for an OWNER this was hardcoded to `bizId` (the primary
      // business), so the Data Room ignored the selected business entirely.
      let effectiveBusinessId;
      if (isAdmin) {
        effectiveBusinessId = selectedBusinessId || null;
      } else {
        try {
          ({ business_id: effectiveBusinessId } = await resolveActiveBusiness(
            sb, profile, selectedBusinessId || data?.businessId, { action: 'getDataRoomDocuments' }
          ));
        } catch (bizErr) { return businessContextError(bizErr); }
      }
      const effectiveProfileId = isAdmin && selectedBusinessId ? null : profileId;
      let queryMode = 'unknown';

      let docQuery = sb.from('documents')
        .select('id, name, document_type, upload_source, uploaded_by, related_entity_type, related_entity_id, file_url, file_path, file_size, year, status, upload_status, extracted_data, profile_id, business_id, created_at, updated_at')
        .order('created_at', { ascending: false })
        .limit(200);

      // Always scope to documents bucket — never consulting_library_files
      docQuery = docQuery.eq('storage_bucket', 'documents').eq('file_scope', 'client_document');

      if (isAdmin && selectedBusinessId) {
        // Admin viewing a specific client's Data Room
        docQuery = docQuery.eq('business_id', selectedBusinessId);
        queryMode = 'admin_selected_client';
      } else if (isAdmin) {
        // Admin global Data Room — all client documents (bucket+scope filter already applied)
        queryMode = 'admin_global';
      } else if (role === 'advisor') {
        const { data: assignments } = await sb.from('advisor_assignments').select('business_id').eq('advisor_profile_id', profileId);
        const bizIds = (assignments || []).map(a => a.business_id).filter(Boolean);
        if (bizIds.length > 0) {
          docQuery = docQuery.in('business_id', bizIds);
          queryMode = 'advisor_assigned';
        } else {
          return Response.json({ documents: [], _debug: { mode: 'data_room', queryMode: 'advisor_no_assignments', profileId, bizId, role } });
        }
      } else {
        // Phase 6.9 — was `profile_id.eq.<me>,business_id.eq.<primary>`, so the Data
        // Room listed EVERY document belonging to the profile — all of the owner's
        // businesses at once, with no way to tell them apart. Scope to the ACTIVE
        // business, plus profile-level (household) documents that carry no
        // business_id, which are ACCOUNT_GLOBAL by design.
        if (effectiveBusinessId) {
          docQuery = docQuery.or(
            `business_id.eq.${effectiveBusinessId},and(business_id.is.null,profile_id.eq.${profileId})`
          );
          queryMode = 'owner_active_business';
        } else if (profileId) {
          docQuery = docQuery.eq('profile_id', profileId);
          queryMode = 'owner_profile_only';
        } else {
          // Edge case: no profile_id and no business_id → return empty
          return Response.json({ documents: [], _debug: { mode: 'data_room', queryMode: 'owner_no_context', profileId, bizId, role } });
        }
      }

      console.log('[getDataRoomDocuments] queryMode:', queryMode, { profileId, bizId, selectedBusinessId, effectiveBusinessId, effectiveProfileId });

      const { data: documents, error: docErr } = await docQuery;
      if (docErr) {
        console.error('[getDataRoomDocuments] query error:', JSON.stringify(docErr));
        return Response.json({ error: docErr.message, _debug: { mode: 'data_room', queryMode, profileId, bizId, role, selectedBusinessId, errorCode: docErr.code } }, { status: 500 });
      }

      // Enrich with analysis status and confidence score
      const enriched = await Promise.all((documents || []).map(async (doc) => {
        let analysis_status = doc.upload_status || 'uploaded';
        let analysis_id = null;
        let confidence_score = null;
        let business_name = null;

        const { data: analysis } = await sb.from('document_analysis')
          .select('id, analysis_status, status, confidence_score')
          .eq('document_id', doc.id)
          .maybeSingle();
        if (analysis) {
          analysis_status = analysis.analysis_status || analysis.status || analysis_status;
          analysis_id = analysis.id;
          confidence_score = analysis.confidence_score ?? null;
        }

        if (doc.business_id) {
          const { data: biz } = await sb.from('business_entities').select('business_name').eq('id', doc.business_id).maybeSingle();
          business_name = biz?.business_name || null;
        }

        // Extract system_folder from extracted_data JSONB (our folder persistence mechanism)
        const system_folder = doc.extracted_data?.system_folder || null;
        return { ...doc, analysis_status, analysis_id, confidence_score, business_name, system_folder };
      }));

      return Response.json({
        documents: enriched || [],
        _debug: {
          mode: 'data_room',
          queryMode,
          profileId,
          bizId,
          effectiveBusinessId,
          effectiveProfileId,
          selectedBusinessId: selectedBusinessId || null,
          role,
          storageBucket: 'documents',
          fileScope: 'client_document',
          rowCount: (documents || []).length,
        }
      });
    }

    if (action === 'getDocumentSignedUrl') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      const { documentId } = data || {};
      if (!documentId) return Response.json({ error: 'documentId required' }, { status: 400 });

      // ── S3.1 — ONE document VIEW authorization decision ──────────────────────
      // Authentication already ran for the whole router (authenticateActor, with
      // the S3.0 suspension gate and canonical-only standing), and the canonical
      // profile is resolved above. This action decides ONE thing — may this actor
      // VIEW this document — through the shared engine, and it derives the tenant
      // from the PERSISTED document row. No request field (role, app_role,
      // business_id, bucket, assignment, notification metadata) establishes
      // authority here.
      //
      // Unauthorized and nonexistent are deliberately THE SAME external response,
      // so this endpoint is not an existence oracle for document UUIDs.
      const documentNotFound = () => Response.json({ error: 'Not found' }, { status: 404 });

      // Load the resource server-side FIRST — the row, not the request, names the
      // tenant and the storage location.
      const { data: doc, error: fetchErr } = await sb.from('documents')
        .select('id, file_path, profile_id, business_id, storage_bucket')
        .eq('id', documentId).maybeSingle();
      // A lookup failure is a database failure: the router maps it to an opaque
      // 500. It never mints a URL and it is never a document-existence signal.
      if (fetchErr) throw new Error(fetchErr.message);
      if (!doc) return documentNotFound();

      // Business scope is delegated to the hardened shared layer
      // (assertBusinessAccess → validateBusinessScope), which is where S3.0.2
      // relationship lifecycle lives — including "a revoked expert relationship
      // grants nothing". Nothing about expert/advisor status is restated here.
      const verdict = await authorizeDocumentAccess({
        doc,
        actor: {
          profile_id: profile.id,
          isAdmin: actor.isAdmin,
          hasProfile: Boolean(profile.id),
        },
        operation: 'view',
        checkBusinessAccess: (businessId: any) =>
          assertBusinessAccess(sb, businessId, profile, { action: 'getDocumentSignedUrl' }),
      });
      if (!verdict.authorized) return documentNotFound();

      if (!doc.file_path) return Response.json({ error: 'No file_path on document' }, { status: 400 });

      // The persisted row must name its OWN approved VISION document bucket.
      // There is deliberately NO fallback: a missing or unrecognized bucket fails
      // closed, and the object is never searched for in another bucket.
      if (!isApprovedDocumentBucket(doc.storage_bucket)) return documentNotFound();

      const { data: signedData, error: signedErr } = await sb.storage
        .from(doc.storage_bucket).createSignedUrl(doc.file_path, 900); // 15 minutes

      if (signedErr) {
        // ── Phase 6D.0-F — SOURCE EXISTENCE ────────────────────────────────────
        // A document whose persisted object is GONE is not an error condition for
        // its owner, and not evidence that the knowledge was lost: extraction that
        // already ran is retained. The storage error is logged server-side and
        // never returned; the response is a successful DETERMINATION that the
        // source is unavailable plus whether surviving extraction exists, so the
        // viewer can say exactly that in human language.
        const missing = /not\s*found|does not exist|object not found|400|404/i.test(String(signedErr.message || ''));
        if (missing) {
          const { count } = await sb.from('extracted_fields')
            .select('id', { count: 'exact', head: true })
            .eq('document_id', doc.id);
          console.error('[getDocumentSignedUrl] source_unavailable:', doc.id, signedErr.message);
          return Response.json({
            signedUrl: null,
            source_unavailable: true,
            reason: 'source_missing',
            has_extraction: (count || 0) > 0,
            evidence_total: count || 0,
          });
        }
        throw new Error(signedErr.message);
      }

      // ── WHAT THIS DOCUMENT IS vs WHAT VISION HAS READ FROM IT ───────────────
      // Whether a document can be DRAWN and whether VISION has read anything from
      // it are independent facts, and the viewer states both. The count is
      // reported on the SAME authorized determination that mints the view URL, so
      // reading the document never costs a second request — and never a second
      // authorization decision that could disagree with this one.
      const { count: evidenceCount } = await sb.from('extracted_fields')
        .select('id', { count: 'exact', head: true })
        .eq('document_id', doc.id);

      return Response.json({ signedUrl: signedData.signedUrl, evidence_total: evidenceCount || 0 });
    }

    if (action === 'deleteDocument') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });
      const role = profile.app_role || user.role || 'owner';
      const { documentId } = data || {};
      if (!documentId) return Response.json({ error: 'documentId required' }, { status: 400 });
      const { data: doc, error: fetchErr } = await sb.from('documents').select('id, profile_id, business_id').eq('id', documentId).maybeSingle();
      if (fetchErr) throw new Error(fetchErr.message);
      if (!doc) return Response.json({ error: 'Document not found' }, { status: 404 });
      if (!['admin', 'super_admin'].includes(role) && doc.profile_id !== profile.id) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
      // Delete document_analysis rows first
      await sb.from('document_analysis').delete().eq('document_id', documentId);
      const { error: delErr } = await sb.from('documents').delete().eq('id', documentId);
      if (delErr) throw new Error(delErr.message);
      return Response.json({ success: true });
    }

    if (action === 'retryDocumentAnalysis') {
      // ── 6D.0c.3 — RETRY MEANS THE CANONICAL DURABLE PIPELINE ───────────────
      // Retry re-enqueues durable work through the ONE durable path. It CANNOT run
      // extraction: this router no longer reaches an extraction engine at all (see
      // the import note at the top of this file). There is no owner decision to
      // satisfy before it: the automatic relevant-evidence policy removed the scope
      // gate, and a scope mismatch is now an eligibility input instead.
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });
      const { documentId } = data || {};
      if (!documentId) return Response.json({ error: 'documentId required' }, { status: 400 });

      const retry = await retryDocumentIngestion({
        sb,
        base44,
        documentId,
        actor: { profile_id: profile.id, role: profile.app_role || user.role || 'owner' },
        authorizeDocument: (doc: any) => authorizeDocumentAccess({
          doc,
          actor: { profile_id: profile.id, isAdmin: actor.isAdmin, hasProfile: Boolean(profile.id) },
          operation: 'view',
          checkBusinessAccess: (bizId: any) =>
            assertBusinessAccess(sb, bizId, profile, { action: 'retryDocumentAnalysis' }),
        }),
        resume: (id: string) => resumeIngestion({ sb, base44, documentId: id, now: new Date().toISOString() }),
      });

      if (!retry.ok) {
        const status = retry.code === 'not_found' ? 404 : 409;
        return Response.json({ success: false, error: retry.code, review: retry.review || null }, { status });
      }
      // `queued: true` is reachable ONLY from here, and only when the canonical
      // resume PROVED durable work exists: a newly persisted job (resumed) or live
      // work already in flight (reused). A resume that could not persist a job
      // returns ok:false above, so it can never reach this line and can never be
      // reported as queued.
      return Response.json({
        success: true,
        queued: true,
        job_id: retry.job_id ?? null,
        outcome: retry.outcome ?? null,
      });
    }

    if (action === 'markDocumentNeedsReview') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });
      const { documentId } = data || {};
      if (!documentId) return Response.json({ error: 'documentId required' }, { status: 400 });
      const now = new Date().toISOString();
      await sb.from('documents').update({ upload_status: 'needs_review', updated_at: now }).eq('id', documentId);
      await sb.from('document_analysis').update({ analysis_status: 'needs_review', status: 'needs_review', updated_at: now }).eq('document_id', documentId);
      return Response.json({ success: true });
    }

    if (action === 'upsertDocument') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });
      const { profile_id: _ignored, ...safeData } = data || {};
      const docData = { ...safeData, profile_id: profile.id };
      if (data.id) {
        const { data: existing } = await sb.from('documents').select('id, profile_id').eq('id', data.id).maybeSingle();
        if (!existing) return Response.json({ error: 'Document not found' }, { status: 404 });
        if (existing.profile_id !== profile.id) return Response.json({ error: 'Forbidden' }, { status: 403 });
        const { data: doc, error } = await sb.from('documents').update(docData).eq('id', data.id).select().single();
        if (error) throw new Error(error.message);
        return Response.json({ document: doc });
      }
      const { data: doc, error } = await sb.from('documents').insert(docData).select().single();
      if (error) throw new Error(error.message);
      return Response.json({ document: doc });
    }

    if (action === 'uploadDocument') {
      const uploadRes = await fetch(new URL('/functions/uploadDocumentToSupabase', req.url), {
        method: 'POST',
        // Phase 6B.4 — forward the caller's credential so the callee
        // re-authenticates the real user instead of trusting the payload.
        headers: {
          'Content-Type': 'application/json',
          Authorization: req.headers.get('Authorization') || '',
        },
        body: JSON.stringify(data || {}),
      });
      const result = await uploadRes.json();
      if (!uploadRes.ok) return Response.json({ error: result.error || 'Upload failed' }, { status: uploadRes.status });
      return Response.json({ document: result.document, storage: result.storage });
    }

    if (action === 'getDocumentAnalysisQueue') {
      const profile = await getProfile();
      if (!profile) return Response.json({ documents: [] });
      const role = profile.app_role || user.role;
      let docQuery = sb.from('documents')
        .select('id, name, document_type, upload_status, created_at, profile_id, business_id')
        .eq('storage_bucket', 'documents')
        .eq('file_scope', 'client_document')
        .in('upload_status', ['pending_analysis', 'queued', 'analyzing', 'needs_review', 'failed'])
        .order('created_at', { ascending: false }).limit(100);
      if (role === 'advisor') {
        const { data: assignments } = await sb.from('advisor_assignments').select('business_id').eq('advisor_profile_id', profile.id);
        const bizIds = (assignments || []).map(a => a.business_id).filter(Boolean);
        if (bizIds.length > 0) { docQuery = docQuery.in('business_id', bizIds); }
        else { return Response.json({ documents: [] }); }
      } else {
        // ── Phase 6B.4 — scope the queue to the authorized profile ───────────
        // Previously unscoped for every non-advisor role: an ordinary owner
        // received up to 100 queued documents belonging to every other user.
        docQuery = docQuery.eq('profile_id', profile.id);
      }
      const { data: documents, error } = await docQuery;
      if (error) throw new Error(error.message);
      const enriched = await Promise.all((documents || []).map(async (doc) => {
        let business_name = 'My Business', analysis_status = doc.upload_status, analysis_id = null;
        if (doc.business_id) {
          const { data: biz } = await sb.from('business_entities').select('business_name').eq('id', doc.business_id).maybeSingle();
          business_name = biz?.business_name || 'My Business';
        }
        const { data: analysis } = await sb.from('document_analysis').select('id, analysis_status, status').eq('document_id', doc.id).maybeSingle();
        if (analysis) { analysis_status = analysis.analysis_status || analysis.status || doc.upload_status; analysis_id = analysis.id; }
        return { ...doc, business_name, analysis_status, analysis_id };
      }));
      return Response.json({ documents: enriched || [] });
    }

    // ── Extraction review summary ───────────────────────────────────────────
    // REAL counts for the review experience, computed on the server so the Data
    // Room never loads extracted fields to count them.
    // Scoped exactly like the Data Room itself: the ACTIVE business plus the
    // caller's own profile-level (household) rows. A multi-business owner must
    // not see another business's facts counted here.
    if (action === 'getExtractionReviewSummary') {
      const profile = await getProfile();
      if (!profile) return Response.json({ totals: null, documents: {} });
      const role = profile.app_role || user.role || 'owner';
      const profileId = profile.id;
      const isAdminRole = ['admin', 'super_admin'].includes(role);

      let effectiveBusinessId = null;
      if (isAdminRole) {
        effectiveBusinessId = data?.businessId || null;
      } else {
        try {
          ({ business_id: effectiveBusinessId } = await resolveActiveBusiness(
            sb, profile, data?.businessId || null, { action: 'getExtractionReviewSummary' }
          ));
        } catch (bizErr) { return businessContextError(bizErr); }
      }

      const emptyTotals = { total: 0, accepted: 0, corrected: 0, pending_review: 0, needs_clarification: 0, rejected: 0, ready: 0, needs_review: 0 };

      let fieldQuery = sb
        .from('extracted_fields')
        .select('id, document_id, review_status')
        .limit(2000);
      if (role === 'advisor') {
        const { data: assignments } = await sb.from('advisor_assignments').select('business_id').eq('advisor_profile_id', profile.id);
        const bizIds = (assignments || []).map(a => a.business_id).filter(Boolean);
        if (bizIds.length > 0) fieldQuery = fieldQuery.in('business_id', bizIds);
        else return Response.json({ totals: emptyTotals, documents: {} });
      } else if (effectiveBusinessId) {
        fieldQuery = fieldQuery.or(`business_id.eq.${effectiveBusinessId},and(business_id.is.null,profile_id.eq.${profileId})`);
      } else {
        fieldQuery = fieldQuery.eq('profile_id', profileId);
      }

      const { data: fields, error } = await fieldQuery;
      if (error) throw new Error(error.message);

      const totals = { ...emptyTotals };
      const documents = {};
      for (const f of fields || []) {
        const status = f.review_status || 'pending_review';
        totals.total += 1;
        if (totals[status] !== undefined) totals[status] += 1;
        // "Ready" = governed information (accepted or corrected).
        // "Needs review" = extracted, not yet governed, still pending confirmation.
        const governed = status === 'accepted' || status === 'corrected';
        if (governed) totals.ready += 1;
        if (status === 'pending_review' || status === 'needs_clarification') totals.needs_review += 1;

        const key = f.document_id || 'unlinked';
        if (!documents[key]) documents[key] = { total: 0, ready: 0, needs_review: 0 };
        documents[key].total += 1;
        if (governed) documents[key].ready += 1;
        if (status === 'pending_review' || status === 'needs_clarification') documents[key].needs_review += 1;
      }
      return Response.json({ totals, documents });
    }

    if (action === 'getExtractedFieldsReviewQueue') {
      const profile = await getProfile();
      if (!profile) return Response.json({ fields: [] });
      const role = profile.app_role || user.role;
      const profileId = profile.id;
      let fieldQuery = sb.from('extracted_fields').select('*').eq('review_status', 'pending_review').order('created_at', { ascending: false }).limit(100);
      if (role === 'advisor') {
        const { data: assignments } = await sb.from('advisor_assignments').select('business_id').eq('advisor_profile_id', profile.id);
        const bizIds = (assignments || []).map(a => a.business_id).filter(Boolean);
        if (bizIds.length > 0) { fieldQuery = fieldQuery.in('business_id', bizIds); }
        else { return Response.json({ fields: [] }); }
      } else if (['admin', 'super_admin'].includes(role)) {
        // An admin is reviewing the Data Room they are looking at, so the queue
        // follows that business; with no business in view it stays their own.
        fieldQuery = data?.businessId
          ? fieldQuery.eq('business_id', data.businessId)
          : fieldQuery.eq('profile_id', profileId);
      } else {
        // ── The review queue is reached FROM the Data Room, so it is scoped to
        // the ACTIVE business (plus the caller's own household rows) rather than
        // to every business the profile owns. Before, a multi-business owner saw
        // all of their businesses' unreviewed facts in one list.
        let effectiveBusinessId = null;
        try {
          ({ business_id: effectiveBusinessId } = await resolveActiveBusiness(
            sb, profile, data?.businessId || null, { action: 'getExtractedFieldsReviewQueue' }
          ));
        } catch (bizErr) { return businessContextError(bizErr); }
        if (effectiveBusinessId) {
          fieldQuery = fieldQuery.or(`business_id.eq.${effectiveBusinessId},and(business_id.is.null,profile_id.eq.${profileId})`);
        } else {
          fieldQuery = fieldQuery.eq('profile_id', profileId);
        }
      }
      const { data: fields, error } = await fieldQuery;
      if (error) throw new Error(error.message);
      const enriched = await Promise.all((fields || []).map(async (field) => {
        let business_name = 'My Business', document_name = 'Unknown', document_type = field.source_document_type, document_year = null;
        if (field.document_id) {
          // `year` travels with the field so the review screen can state the
          // PERIOD a value belongs to, not only which document it came from.
          const { data: doc } = await sb.from('documents').select('name, document_type, year').eq('id', field.document_id).maybeSingle();
          document_name = doc?.name || 'Unknown'; document_type = doc?.document_type || field.source_document_type;
          document_year = doc?.year || null;
        }
        if (field.business_id) {
          const { data: biz } = await sb.from('business_entities').select('business_name').eq('id', field.business_id).maybeSingle();
          business_name = biz?.business_name || 'My Business';
        }
        return { ...field, business_name, document_name, document_type, document_year };
      }));
      return Response.json({ fields: enriched || [] });
    }

    if (action === 'updateExtractedFieldReview') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });
      const profileId = profile.id;
      const { fieldId, reviewStatus, acceptedValue, acceptedNormalizedValue, notes } = body;
      if (!fieldId || !reviewStatus) return Response.json({ error: 'fieldId and reviewStatus required' }, { status: 400 });
      const validStatuses = ['pending_review', 'accepted', 'corrected', 'rejected', 'needs_clarification'];
      if (!validStatuses.includes(reviewStatus)) return Response.json({ error: `Invalid reviewStatus. Must be one of: ${validStatuses.join(', ')}` }, { status: 400 });
      if (reviewStatus === 'needs_clarification' && (!notes || notes.trim() === '')) return Response.json({ error: 'Notes are required when marking as needs clarification' }, { status: 400 });
      const { data: field, error: fieldErr } = await sb.from('extracted_fields').select('*').eq('id', fieldId).maybeSingle();
      if (fieldErr) throw new Error(fieldErr.message);
      if (!field) return Response.json({ error: 'Field not found' }, { status: 404 });
      // ── Phase 6B.4 — the mutated object must establish its own ownership ──
      if (field.profile_id && field.profile_id !== profileId) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (!field.profile_id && field.document_id) {
        const { data: ownerDoc } = await sb.from('documents').select('profile_id').eq('id', field.document_id).maybeSingle();
        if (ownerDoc?.profile_id && ownerDoc.profile_id !== profileId) {
          return Response.json({ error: 'Forbidden' }, { status: 403 });
        }
      }
      const updateData = { review_status: reviewStatus, reviewed_by: profileId, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      if (reviewStatus === 'accepted') {
        updateData.accepted_value = acceptedValue !== undefined ? acceptedValue : field.field_value;
        updateData.accepted_normalized_value = acceptedNormalizedValue !== undefined ? acceptedNormalizedValue : field.normalized_value;
      } else if (reviewStatus === 'corrected') {
        if (acceptedValue === undefined || acceptedValue === '') return Response.json({ error: 'Corrected value is required' }, { status: 400 });
        updateData.accepted_value = acceptedValue;
        updateData.accepted_normalized_value = acceptedNormalizedValue !== undefined ? acceptedNormalizedValue : null;
      } else if (reviewStatus === 'rejected') {
        updateData.accepted_value = null; updateData.accepted_normalized_value = null;
      }
      if (notes !== undefined) updateData.notes = notes;
      const { data: updated, error: updateError } = await sb.from('extracted_fields').update(updateData).eq('id', fieldId).select().single();
      if (updateError) throw new Error(updateError.message);
      const { data: allFields } = await sb.from('extracted_fields').select('review_status').eq('document_id', field.document_id);
      if (allFields && allFields.length > 0) {
        const allReviewed = allFields.every(f => ['accepted', 'corrected', 'rejected'].includes(f.review_status));
        const hasClarification = allFields.some(f => f.review_status === 'needs_clarification');
        const newAnalysisStatus = allReviewed && !hasClarification ? 'completed' : 'needs_review';
        await sb.from('document_analysis').update({ analysis_status: newAnalysisStatus, status: newAnalysisStatus, updated_at: new Date().toISOString() }).eq('document_id', field.document_id);
        await sb.from('documents').update({ upload_status: allReviewed && !hasClarification ? 'completed' : 'needs_review', updated_at: new Date().toISOString() }).eq('id', field.document_id);
      }

      // ── Promotion means the field is now governable information ────────────
      // Run the EXISTING recalculation path (the same one the standalone advisor
      // review fires) so the derived metrics reflect the promoted value without a
      // manual refresh. Fire-and-forget: a failed recalculation must never fail
      // the review the owner just performed.
      if ((reviewStatus === 'accepted' || reviewStatus === 'corrected') && field.business_id) {
        base44.functions.invoke('regenerateCiqMetrics', { businessId: field.business_id })
          .catch((e) => console.error('[updateExtractedFieldReview] CIQ recalculation failed (non-fatal):', e?.message));
      }

      return Response.json({ field: updated });
    }

    // ── ADMIN LIBRARY FILES ──────────────────────────────────────────────────

    if (action === 'getAdminLibraryFiles') {
      // P3 — the canonical application role decides administrative standing, not
      // the Base44 role (a legitimate canonical admin may hold Base44 role 'user').
      if (!isCanonicalAdmin) {
        return Response.json({ error: 'Admin access required', _debug: { mode: 'admin_library' } }, { status: 403 });
      }

      const { search, limit = 200 } = data || {};

      let docQuery = sb.from('documents')
        .select('id, name, document_type, file_url, file_path, file_size, year, upload_source, uploaded_by, related_entity_type, related_entity_id, status, created_at, profile_id, business_id')
        .eq('storage_bucket', 'consulting_library_files')
        .eq('file_scope', 'consulting_library')
        .order('created_at', { ascending: false })
        .limit(limit);

      const { data: documents, error } = await docQuery;
      if (error) {
        console.error('[getAdminLibraryFiles] query error:', JSON.stringify(error));
        return Response.json({ error: error.message, _debug: { mode: 'admin_library', errorCode: error.code } }, { status: 500 });
      }

      let results = documents || [];
      if (search) {
        const q = search.toLowerCase();
        results = results.filter(d =>
          (d.name || '').toLowerCase().includes(q) ||
          (d.document_type || '').toLowerCase().includes(q)
        );
      }

      return Response.json({
        documents: results,
        _debug: {
          mode: 'admin_library',
          storageBucket: 'consulting_library_files',
          fileScope: 'consulting_library',
          rowCount: results.length,
          search: search || null,
        }
      });
    }

    // ── SCOPED DOCUMENT QUERIES ─────────────────────────────────────────────

    if (action === 'getClientDocumentsForUser') {
      const profile = await getProfile();
      if (!profile) return Response.json({ documents: [], _debug: { mode: 'client_docs', reason: 'no_profile' } });
      const profileId = profile.id;
      const bizId = profile.primary_business_id || null;

      // P3 — the acting profile is authoritative (resolved canonically above), so
      // `selectedProfileId` can no longer name another profile's rows.
      const { selectedProfileId, selectedBusinessId } = data || {};
      const effectiveProfileId = profileId;
      let effectiveBusinessId = bizId;
      if (selectedBusinessId && selectedBusinessId !== bizId) {
        if (isCanonicalAdmin) {
          effectiveBusinessId = selectedBusinessId;
        } else {
          try {
            await assertBusinessAccess(sb, selectedBusinessId, profile, { action: 'getClientDocumentsForUser' });
            effectiveBusinessId = selectedBusinessId;
          } catch (bizErr) { return businessContextError(bizErr); }
        }
      }

      let docQuery = sb.from('documents')
        .select('id, name, document_type, upload_source, file_url, file_path, file_size, year, status, upload_status, profile_id, business_id, created_at, updated_at')
        .eq('storage_bucket', 'documents')
        .eq('file_scope', 'client_document')
        .order('created_at', { ascending: false });

      // Null-safe or() builder
      const orParts = [];
      if (effectiveProfileId) orParts.push(`profile_id.eq.${effectiveProfileId}`);
      if (effectiveBusinessId) orParts.push(`business_id.eq.${effectiveBusinessId}`);
      if (orParts.length > 0) {
        docQuery = docQuery.or(orParts.join(','));
      } else {
        return Response.json({ documents: [], _debug: { mode: 'client_docs', reason: 'no_context', effectiveProfileId, effectiveBusinessId } });
      }

      const { data: documents, error } = await docQuery;
      if (error) {
        console.error('[getClientDocumentsForUser] query error:', JSON.stringify(error));
        return Response.json({ error: error.message, _debug: { mode: 'client_docs', errorCode: error.code } }, { status: 500 });
      }

      return Response.json({
        documents: documents || [],
        _debug: {
          mode: 'client_docs',
          effectiveProfileId,
          effectiveBusinessId,
          selectedProfileId: selectedProfileId || null,
          selectedBusinessId: selectedBusinessId || null,
          storageBucket: 'documents',
          fileScope: 'client_document',
          rowCount: (documents || []).length,
        }
      });
    }

    if (action === 'getAssignedResources') {
      const profile = await getProfile();
      if (!profile) return Response.json({ resources: [], _debug: { mode: 'assigned_resources', reason: 'no_profile' } });
      const profileId = profile.id;
      const bizId = profile.primary_business_id || null;

      // P3 — `data.profileId` is a TARGET identifier, resolved canonically above.
      const { selectedBusinessId } = data || {};
      const effectiveProfileId = profileId;
      const effectiveBusinessId = selectedBusinessId || bizId;

      const startTime = performance.now();
      let resources = [];

      try {
        // Primary: query resource_assignments table (null-safe: include null status rows)
        const { data: assignments } = await sb.from('resource_assignments')
          .select('id, resource_document_id, profile_id, business_id, assigned_by, created_at, status')
          .eq('profile_id', effectiveProfileId)
          .or('status.is.null,status.neq.cancelled')
          .order('created_at', { ascending: false });

        if (assignments && assignments.length > 0) {
          // Fetch the actual resource documents
          const docIds = assignments.map(a => a.resource_document_id).filter(Boolean);
          if (docIds.length > 0) {
            const { data: docs } = await sb.from('documents')
              .select('id, name, document_type, file_url, file_path, file_size, year, upload_source, uploaded_by, related_entity_type, related_entity_id, status, created_at, profile_id, business_id')
              .in('id', docIds);
            
            if (docs) {
              resources = docs.map(d => ({
                ...d,
                source: 'resource_assignment',
                assignment_id: assignments.find(a => a.resource_document_id === d.id)?.id ?? null,
              }));
            }
          }
        }

        // Fallback: check for legacy pointer documents
        if (resources.length === 0) {
          const { data: pointerDocs } = await sb.from('documents')
            .select('id, name, document_type, file_url, file_path, file_size, year, upload_source, uploaded_by, related_entity_type, related_entity_id, status, created_at, profile_id, business_id')
            .eq('storage_bucket', 'consulting_library_files')
            .eq('file_scope', 'consulting_library')
            .eq('related_entity_type', 'assigned_resource')
            .eq('profile_id', effectiveProfileId)
            .order('created_at', { ascending: false })
            .limit(100);

          if (pointerDocs) {
            resources = pointerDocs.map(d => ({
              ...d,
              source: 'pointer_document',
            }));
          }
        }

        const endTime = performance.now();
        console.log(`[getAssignedResources] Found ${resources.length} resources in ${Math.round(endTime - startTime)}ms for profile ${effectiveProfileId}`);
      } catch (e) {
        console.error('[getAssignedResources] Query failed:', e.message);
      }

      return Response.json({
        resources,
        _debug: {
          mode: 'assigned_resources',
          effectiveProfileId,
          effectiveBusinessId,
          rowCount: resources.length,
          duration_ms: Math.round(performance.now() - startTime),
        }
      });
    }

    if (action === 'getAssignedWorksheets') {
      const profile = await getProfile();
      if (!profile) return Response.json({ worksheets: [], _debug: { mode: 'assigned_worksheets', reason: 'no_profile' } });
      const profileId = profile.id;
      const bizId = profile.primary_business_id || null;

      // P3 — `data.profileId` is a TARGET identifier, resolved canonically above.
      const { selectedBusinessId, status_filter } = data || {};
      const effectiveProfileId = profileId;
      const effectiveBusinessId = selectedBusinessId || bizId;

      const startTime = performance.now();
      let worksheets = [];
      let assignments = [];

      try {
        // Build query for worksheet_assignments — null-safe: exclude cancelled only
        const { data: waData, error: waErr } = await sb.from('worksheet_assignments')
          .select('id, worksheet_id, assigned_to_profile_id, assigned_to_business_id, assigned_by_profile_id, status, due_date, scheduled_for, reminder_settings, created_at, updated_at, completed_at')
          .eq('assigned_to_profile_id', effectiveProfileId)
          .or('status.is.null,status.not.in.(cancelled,deleted)')
          .order('created_at', { ascending: false });
        
        if (waErr) {
          console.error('[getAssignedWorksheets] worksheet_assignments query error:', waErr);
          throw new Error(waErr.message);
        }

        assignments = waData || [];

        // Post-process: derive effective_status for tab grouping
        // Scheduled = status='scheduled' OR (due_date exists AND not completed)
        // Completed = status='completed'
        // Assigned = everything else (assigned, in_progress, null)
        const processedAssignments = assignments.map(a => {
          if (a.status === 'completed') {
            return { ...a, effective_status: 'completed' };
          }
          if (a.status === 'scheduled') {
            return { ...a, effective_status: 'scheduled' };
          }
          if (a.due_date) {
            // Has a due date and not completed → show in Scheduled
            return { ...a, effective_status: 'scheduled' };
          }
          return { ...a, effective_status: a.status || 'assigned' };
        });

        // Fetch worksheet templates in batch
        const worksheetIds = [...new Set(processedAssignments.map(a => a.worksheet_id).filter(Boolean))];
        
        if (worksheetIds.length > 0) {
          const allWorksheets = await base44.asServiceRole.entities.Worksheet.list('-created_date', 200);
          const worksheetMap = new Map((allWorksheets || []).map(w => [w.id, w]));
          
          worksheets = processedAssignments.map(a => {
            const worksheet = worksheetMap.get(a.worksheet_id);
            return {
              ...worksheet,
              assignment_id: a.id,
              assignment_status: a.effective_status,
              assigned_at: a.created_at,
              due_date: a.due_date,
              scheduled_for: a.scheduled_for,
              reminder_settings: a.reminder_settings,
              completed_at: a.completed_at,
              assigned_by_profile_id: a.assigned_by_profile_id,
              source: 'worksheet_assignment',
            };
          }).filter(w => w.title); // Filter out worksheets that don't exist
        }

        const endTime = performance.now();
        console.log(`[getAssignedWorksheets] Found ${worksheets.length} worksheets in ${Math.round(endTime - startTime)}ms for profile ${effectiveProfileId}`);
      } catch (e) {
        console.error('[getAssignedWorksheets] Query failed:', e.message);
      }

      return Response.json({
        worksheets,
        assignments,
        _debug: {
          mode: 'assigned_worksheets',
          effectiveProfileId,
          effectiveBusinessId,
          rowCount: worksheets.length,
          duration_ms: Math.round(performance.now() - startTime),
        }
      });
    }

    if (action === 'getAdminAssignedWorksheetsForUser') {
      // For admin viewing a specific user's worksheets
      const profile = await getProfile();
      if (!profile) return Response.json({ worksheets: [], _debug: { mode: 'admin_worksheets', reason: 'no_profile' } });
      // P3 — the AUTHENTICATED ACTOR's canonical role decides this (the acting
      // profile may be the target, whose role says nothing about the caller).
      if (!isCanonicalAdmin) {
        return Response.json({ error: 'Admin access required' }, { status: 403 });
      }

      const { selected_profile_id, selected_business_id, status_filter } = data || {};
      if (!selected_profile_id) {
        return Response.json({ error: 'selected_profile_id required' }, { status: 400 });
      }

      const startTime = performance.now();
      let worksheets = [];
      let assignments = [];

      try {
        // Build query for worksheet_assignments — null-safe: exclude cancelled only
        const { data: waData, error: waErr } = await sb.from('worksheet_assignments')
          .select('id, worksheet_id, assigned_to_profile_id, assigned_to_business_id, assigned_by_profile_id, status, due_date, scheduled_for, reminder_settings, created_at, updated_at, completed_at')
          .eq('assigned_to_profile_id', profile.id)
          .or('status.is.null,status.not.in.(cancelled,deleted)')
          .order('created_at', { ascending: false });
        
        if (waErr) {
          console.error('[getAdminAssignedWorksheetsForUser] worksheet_assignments query error:', waErr);
          throw new Error(waErr.message);
        }

        assignments = waData || [];

        // Derive effective_status for tab grouping (same logic as user-facing)
        const processedAssignments = assignments.map(a => {
          if (a.status === 'completed') return { ...a, effective_status: 'completed' };
          if (a.status === 'scheduled') return { ...a, effective_status: 'scheduled' };
          if (a.due_date) return { ...a, effective_status: 'scheduled' };
          return { ...a, effective_status: a.status || 'assigned' };
        });

        // Fetch worksheet templates in batch
        const worksheetIds = [...new Set(processedAssignments.map(a => a.worksheet_id).filter(Boolean))];
        
        if (worksheetIds.length > 0) {
          const allWorksheets = await base44.asServiceRole.entities.Worksheet.list('-created_date', 200);
          const worksheetMap = new Map((allWorksheets || []).map(w => [w.id, w]));
          
          worksheets = processedAssignments.map(a => {
            const worksheet = worksheetMap.get(a.worksheet_id);
            return {
              ...worksheet,
              assignment_id: a.id,
              assignment_status: a.effective_status,
              assigned_at: a.created_at,
              due_date: a.due_date,
              scheduled_for: a.scheduled_for,
              reminder_settings: a.reminder_settings,
              completed_at: a.completed_at,
              assigned_by_profile_id: a.assigned_by_profile_id,
              source: 'worksheet_assignment',
            };
          }).filter(w => w.title);
        }

        const endTime = performance.now();
        console.log(`[getAdminAssignedWorksheetsForUser] Found ${worksheets.length} worksheets in ${Math.round(endTime - startTime)}ms for profile ${selected_profile_id}`);
      } catch (e) {
        console.error('[getAdminAssignedWorksheetsForUser] Query failed:', e.message);
      }

      return Response.json({
        worksheets,
        assignments,
        _debug: {
          mode: 'admin_worksheets',
          selected_profile_id,
          selected_business_id,
          rowCount: worksheets.length,
          duration_ms: Math.round(performance.now() - startTime),
        }
      });
    }

    // ── 6D.0c.3: THE CANONICAL CLASSIFICATION REVIEW SURFACE ────────────────

    if (action === 'getClassificationReview') {
      // The Data Room's Classification view reads the canonical decision store —
      // never a function that does not exist. Business scope is PROVEN by the
      // shared access layer before any read; the request names the business, it
      // does not establish authority over it.
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      const { businessId, mode = 'pending' } = data || {};
      if (!businessId) return Response.json({ error: 'businessId required' }, { status: 400 });
      await assertBusinessAccess(sb, businessId, profile, { action: 'getClassificationReview' });

      const rows = await base44.asServiceRole.entities.DocumentClassification.filter({ business_id: businessId });
      const all = Array.isArray(rows) ? rows : ((rows as any)?.items || []);
      const sorted = [...all].sort((a: any, b: any) =>
        String(a.created_date || '').localeCompare(String(b.created_date || '')));

      if (mode === 'stats') {
        const reviewed = sorted.filter((r: any) => ['approved', 'rejected', 'overridden'].includes(r.classification_status));
        const confidences = sorted.map((r: any) => Number(r.confidence_score)).filter((n: number) => Number.isFinite(n));
        return Response.json({
          total: sorted.length,
          auto_filed: sorted.filter((r: any) => r.classification_status === 'auto_filed').length,
          manual_reviews: reviewed.length,
          pending: sorted.filter((r: any) => ['pending', 'awaiting_review'].includes(r.classification_status)).length,
          approval_rate: reviewed.length
            ? Math.round((sorted.filter((r: any) => r.classification_status === 'approved').length / reviewed.length) * 100)
            : 0,
          avg_confidence: confidences.length
            ? Math.round(confidences.reduce((a: number, b: number) => a + b, 0) / confidences.length)
            : 0,
        });
      }

      const selected = mode === 'history'
        ? sorted.slice(0, 50)
        : sorted.filter((r: any) => ['pending', 'awaiting_review'].includes(r.classification_status));

      return Response.json({
        records: selected.map((r: any) => ({
          id: r.id,
          document_id: r.document_id,
          document_name: r.document_name,
          reasoning: r.reasoning || null,
          classification_status: r.classification_status || 'pending',
          suggested_folder: r.suggested_folder || null,
          suggested_subfolder: r.suggested_subfolder || null,
          applied_folder: r.applied_folder || null,
          confidence_score: Number.isFinite(Number(r.confidence_score)) ? Number(r.confidence_score) : null,
          tax_year: r.tax_year || null,
          filed_at: r.filed_at || r.reviewed_at || null,
        })),
      });
    }

    // ── PHASE 1E: ADMIN DOCUMENT CLASSIFICATION OVERRIDE ─────────────────────

    if (action === 'overrideDocumentClassification') {
      // 6D.0c.3 — the admin/expert correction path lives in the shared
      // classification-override module and hands off to the durable resume. It never
      // extracts. It is the ONLY human classification action left: the owner-facing
      // scope confirmation was removed by the automatic relevant-evidence policy,
      // because a scope mismatch is now an ELIGIBILITY input rather than a gate.
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });
      const result = await overrideDocumentClassification({ sb, base44, profile, user, data });
      return Response.json(result.body, { status: result.status });
    }

    if (action === 'updateDocumentFolder') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });
      const profileRole = profile.app_role || user.role || 'owner';
      const { documentId, folderId } = data || {};
      if (!documentId || !folderId) return Response.json({ error: 'documentId and folderId required' }, { status: 400 });

      // Fetch doc to verify ownership
      const { data: doc, error: fetchErr } = await sb.from('documents')
        .select('id, profile_id, business_id').eq('id', documentId).maybeSingle();
      if (fetchErr) throw new Error(fetchErr.message);
      if (!doc) return Response.json({ error: 'Document not found' }, { status: 404 });

      // Access control
      const isAdminRole = ['admin', 'super_admin'].includes(profileRole);
      let ownsDoc = doc.profile_id === profile.id;
      if (!ownsDoc && doc.business_id) {
        // Phase 6.9 — accept any business the actor is authorized for, not only the
        // profile's primary business.
        try {
          await assertBusinessAccess(sb, doc.business_id, profile, { action: 'updateDocumentFolder' });
          ownsDoc = true;
        } catch { ownsDoc = false; }
      }
      const isExpertWithPerm = profileRole === 'expert_advisor' && profile.document_management === true;
      if (!isAdminRole && !ownsDoc && !isExpertWithPerm) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }

      // Fetch existing extracted_data to merge (don't overwrite other fields)
      const { data: existing, error: exErr } = await sb.from('documents')
        .select('extracted_data').eq('id', documentId).maybeSingle();
      if (exErr) throw new Error(exErr.message);
      const mergedData = { ...(existing?.extracted_data || {}), system_folder: folderId };

      const { error: updateErr } = await sb.from('documents')
        .update({ extracted_data: mergedData, updated_at: new Date().toISOString() })
        .eq('id', documentId);
      if (updateErr) throw new Error(updateErr.message);
      console.log(`[updateDocumentFolder] Updated doc ${documentId}: system_folder = ${folderId} (stored in extracted_data)`);
      return Response.json({ success: true, documentId, folderId });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    // Canonical failures keep their real status: 401 unauthenticated,
    // 403 authenticated-but-unauthorized, 404 target not resolvable.
    return errorResponse(error);
  }
});