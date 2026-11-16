/**
 * canonicalFact/contextLoader.ts — Phase 14.2A
 *
 * Loads the IntelligenceContext for a business. Reuses the exact same data
 * loading pattern as the existing intelligenceEngine consumers
 * (verificationQueueService, valuationService).
 *
 * The IntelligenceContext is the existing contract for all intelligence
 * resolvers. No new context shape is created.
 */

import type { IntelligenceContext } from '../valuationEngine/intelligenceMapping.ts';
import type { AuthCtx } from '../valuationEngine/valuationAuth.ts';

// ── Map canonical fact_key to existing FIELD_REGISTRY field_key ─────────────
// This allows us to reuse the existing certified resolvers directly.
export const FACT_KEY_TO_FIELD_REGISTRY: Record<string, string> = {
  // Pilot facts
  revenue: 'ttm_revenue',
  gross_profit: 'gross_profit',
  gross_margin: 'gross_margin_percentage',
  net_income: 'net_income',
  reported_ebitda: 'ttm_ebitda',
  normalized_ebitda: 'ttm_ebitda', // Reuses EBITDA resolver; normalization is a derived layer
  owner_compensation: 'owner_compensation_actual',
  cash: 'cash',
  debt: 'total_debt',
  customer_concentration: 'customer_concentration', // May not exist in FIELD_REGISTRY yet

  // Non-pilot facts (mapped where possible)
  total_assets: 'total_assets',
  total_liabilities: 'total_liabilities',
  total_equity: 'total_equity',
  agi: 'agi',
  monthly_take_home: 'monthly_take_home',
  employee_count: 'employee_count',
  total_payroll: 'total_payroll',
  historical_growth_rate: 'historical_growth_rate',
  annual_capex: 'annual_capex',
};

// ── Load IntelligenceContext for a business ──────────────────────────────────
// Reuses the same loading pattern as verificationQueueService.
export async function loadIntelligenceContext(
  ctx: AuthCtx,
  businessId: string,
): Promise<IntelligenceContext> {
  const { sb, vsb, profileId } = ctx;

  // Resolve the business's profile_id (owner)
  const { data: business } = await sb
    .from('business_entities')
    .select('id, business_name, industry, entity_type, business_family_type, description, assigned_advisor_id')
    .eq('id', businessId)
    .maybeSingle();

  // Get the owner profile for this business
  const { data: businessOwners } = await sb
    .from('business_owners')
    .select('profile_id')
    .eq('business_id', businessId)
    .limit(1);
  const ownerProfileId = businessOwners?.[0]?.profile_id || profileId;

  // Load owner profile
  const { data: ownerProfile } = await sb
    .from('profiles')
    .select('id, email, first_name, last_name, company, primary_business_id')
    .eq('id', ownerProfileId)
    .maybeSingle();

  // Load documents (completed only)
  const { data: documents } = await sb
    .from('documents')
    .select('id, name, document_type, upload_status, year, file_path, created_at')
    .eq('business_id', businessId)
    .eq('upload_status', 'completed');

  // Load extracted fields
  const { data: extractedFields } = await sb
    .from('extracted_fields')
    .select('id, field_name, field_label, field_value, normalized_value, confidence_score, review_status, source_document_type, document_id, metadata, created_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  // Load document analyses
  const docIds = (documents || []).map((d) => d.id);
  let documentAnalyses: any[] = [];
  if (docIds.length > 0) {
    const { data: analyses } = await sb
      .from('document_analysis')
      .select('id, document_id, analysis_status, confidence_score, extracted_summary')
      .in('document_id', docIds);
    documentAnalyses = analyses || [];
  }

  // Load Base44 Assessment entity (for the owner profile)
  let assessments: any[] = [];
  try {
    const base44Assessments = await ctx.user && ctx.profile
      ? await loadBase44Assessments(ctx, ownerProfileId)
      : [];
    assessments = base44Assessments;
  } catch {
    assessments = [];
  }

  // Load Supabase business_assessments
  const { data: businessAssessments } = await sb
    .from('business_assessments')
    .select('id, assessment_type, status, answers, results, updated_at, completed_at')
    .eq('profile_id', ownerProfileId)
    .order('updated_at', { ascending: false });

  // Load dashboard metrics (most recent)
  const { data: dashboardMetricsRow } = await sb
    .from('dashboard_metrics')
    .select('*')
    .eq('profile_id', ownerProfileId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Load gap analyses
  const { data: gapAnalyses } = await sb
    .from('gap_analyses')
    .select('id, assessment_type, gap_amount, severity, created_at')
    .eq('profile_id', ownerProfileId)
    .order('created_at', { ascending: false });

  // Load profile financials
  const { data: profileFinancials } = await sb
    .from('profile_financials')
    .select('*')
    .eq('profile_id', ownerProfileId)
    .maybeSingle();

  // Load valuation data (if a valuation exists for this business)
  const { data: valuations } = await vsb
    .from('business_valuations')
    .select('id, business_id, status')
    .eq('business_id', businessId)
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
    .limit(1);

  let valuationAnswers: any[] = [];
  let valuationFinancials: any[] = [];
  let valuationAdjustments: any[] = [];
  let valuationVersions: any[] = [];
  let valuationQuestions: any[] = [];

  if (valuations && valuations.length > 0) {
    const valuationId = valuations[0].id;

    const [answersRes, finsRes, adjRes, versionsRes, questionsRes] = await Promise.all([
      vsb.from('valuation_answers').select('*').eq('valuation_id', valuationId),
      vsb.from('valuation_financials').select('*').eq('valuation_id', valuationId).order('period_end_date', { ascending: false }),
      vsb.from('valuation_adjustments').select('*').eq('valuation_id', valuationId),
      vsb.from('valuation_versions').select('*').eq('valuation_id', valuationId).order('version_number', { ascending: false }),
      vsb.from('valuation_questions').select('*').limit(500),
    ]);

    valuationAnswers = answersRes.data || [];
    valuationFinancials = finsRes.data || [];
    valuationAdjustments = adjRes.data || [];
    valuationVersions = versionsRes.data || [];
    valuationQuestions = questionsRes.data || [];
  }

  return {
    business: business || { id: businessId },
    owners: businessOwners || [],
    profile: ownerProfile || ctx.profile,
    documents: documents || [],
    extractedFields: extractedFields || [],
    documentAnalyses,
    assessments,
    businessAssessments: businessAssessments || [],
    dashboardMetrics: dashboardMetricsRow || {},
    gapAnalyses: gapAnalyses || [],
    valuationAnswers,
    valuationFinancials,
    valuationAdjustments,
    valuationVersions,
    valuationQuestions,
    profileFinancials: profileFinancials || null,
  };
}

// ── Load Base44 Assessment entity records for a profile ─────────────────────
async function loadBase44Assessments(ctx: AuthCtx, _ownerProfileId: string): Promise<any[]> {
  // The Assessment entity is scoped by created_by_id (Base44 user).
  // We use the Base44 SDK to load assessments for the current user context.
  // For cross-profile access (advisor viewing client), we rely on the
  // Supabase business_assessments table which is the canonical store.
  // Base44 Assessment entity is used for the current user's own assessments.
  try {
    const base44Assessments = await ctx.user
      ? await loadCurrentUserAssessments(ctx)
      : [];
    return base44Assessments;
  } catch {
    return [];
  }
}

// ── Load current user's Base44 Assessment records ────────────────────────────
async function loadCurrentUserAssessments(ctx: AuthCtx): Promise<any[]> {
  // Use the Base44 SDK (user-scoped) to load assessments.
  // This returns the current authenticated user's assessments.
  // For advisor viewing a client, business_assessments (Supabase) is used.
  const { createClientFromRequest } = await import('npm:@base44/sdk@0.8.41');
  // The ctx already has the base44 client via the user object — but we need
  // the SDK client. Since we're in a backend function, we use the service role
  // to read assessments scoped by the owner's profile.
  // However, Assessment entity RLS scopes by created_by_id (Base44 user),
  // not profile_id. So we return empty here and rely on business_assessments.
  return [];
}