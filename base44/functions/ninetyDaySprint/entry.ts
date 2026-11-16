/**
 * ninetyDaySprint — Galileo-powered 90-day sprint + next best action system.
 *
 * Supabase tables (source of truth):
 *   ninety_day_sprint_paths  — sprint paths
 *   ninety_day_sprint_tasks  — sprint tasks (FK: path_id)
 *
 * Base44 entities (for notes, reminders, document links):
 *   SprintTaskNote, SprintReminder, SprintTaskDocument
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { authenticateActor, resolveActingProfile, errorResponse } from '../../shared/authz/actor.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { loadAssessmentResults } from '../../shared/intelligenceContract/assessmentLoader.ts';
import {
  resolveActiveBusiness,
  businessContextError,
} from '../../shared/businessScope/activeBusiness.ts';

function isValidUUID(str) {
  if (!str || typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

function getSupabase() {
  const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
  const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function getProfile(sb, email) {
  const { data } = await sb.from('profiles').select('id, primary_business_id').eq('email', email).maybeSingle();
  return data;
}

// ── Build rich business context for Galileo (parallelized) ───────────────────
async function buildSprintContext(sb, profileId, businessId, base44) {
  const ctx = { assessments: {}, opportunities: [], metrics: null, financials: null, industry: null };

  // Phase 6.9 — business-owned evidence must come from the ACTIVE business only.
  // `assessment_answers`, `dashboard_metrics`, `gap_analyses` and
  // `extracted_fields` all carry business_id, so a sprint generated for one
  // business can no longer be built from another business's numbers.
  // `profile_financials` and the galileo_opportunities entity are profile-level
  // by design and remain unscoped — recorded as remaining debt in the report.
  const scope = (q) => (businessId ? q.eq('business_id', businessId) : q);

  const [assessmentRows, metrics, gaps, extracted, opps, financials, profitGapIndustry, bizEntity] = await Promise.allSettled([
    scope(sb.from('assessment_answers').select('assessment_type, answers').eq('profile_id', profileId)).order('created_at', { ascending: false }).limit(10),
    scope(sb.from('dashboard_metrics').select('revenue, net_profit, ebitda, ciq_score, industry').eq('profile_id', profileId)).order('created_at', { ascending: false }).limit(1),
    scope(sb.from('gap_analyses').select('gap_type, severity, gap_amount').eq('profile_id', profileId)).order('created_at', { ascending: false }).limit(8),
    scope(sb.from('extracted_fields').select('field_name, accepted_value, accepted_normalized_value, field_category, source_document_type').eq('profile_id', profileId)).in('review_status', ['accepted', 'corrected']).order('reviewed_at', { ascending: false }).limit(20),
    base44.asServiceRole.entities.galileo_opportunities.filter({ profile_id: profileId }, '-created_date', 5),
    sb.from('profile_financials').select('annual_revenue, monthly_take_home, ebitda').eq('profile_id', profileId).maybeSingle(),
    // Primary industry source: profit_gap assessment answer
    scope(sb.from('assessment_answers').select('answer_value').eq('profile_id', profileId)).eq('assessment_type', 'profit_gap').eq('question_key', 'industry_input').order('created_at', { ascending: false }).limit(1),
    // Fallback: business_entities.industry
    businessId ? sb.from('business_entities').select('industry, industry_type').eq('id', businessId).maybeSingle() : Promise.resolve({ status: 'fulfilled', value: { data: null } }),
  ]);

  if (assessmentRows.status === 'fulfilled' && assessmentRows.value.data?.length) {
    for (const row of assessmentRows.value.data) {
      if (!ctx.assessments[row.assessment_type]) ctx.assessments[row.assessment_type] = row.answers;
    }
  }
  if (metrics.status === 'fulfilled' && metrics.value.data?.[0]) ctx.metrics = metrics.value.data[0];
  if (gaps.status === 'fulfilled' && gaps.value.data?.length) ctx.gaps = gaps.value.data;
  if (extracted.status === 'fulfilled' && extracted.value.data?.length) ctx.extractedFields = extracted.value.data;
  if (opps.status === 'fulfilled' && opps.value?.length) ctx.opportunities = opps.value.map(o => ({ title: o.title, category: o.category, score: o.strategic_opportunity_score, industry_context: o.industry_context }));
  if (financials.status === 'fulfilled' && financials.value.data) ctx.financials = financials.value.data;

  // ── Resolve industry: profit_gap answer > business_entities > dashboard_metrics ──
  const pgIndustryVal = profitGapIndustry.status === 'fulfilled' ? profitGapIndustry.value.data?.[0]?.answer_value : null;
  const bizEntityData = bizEntity.status === 'fulfilled' ? bizEntity.value.data : null;
  ctx.industry = pgIndustryVal
    || bizEntityData?.industry || bizEntityData?.industry_type
    || ctx.metrics?.industry
    || null;

  console.log('[ninetyDaySprint] Resolved industry:', ctx.industry, '| source:', pgIndustryVal ? 'profit_gap_assessment' : (bizEntityData?.industry ? 'business_entities' : 'dashboard_metrics'));

  // Build structured evidence items for Galileo
  ctx.evidenceItems = [];
  for (const f of (ctx.extractedFields || [])) {
    ctx.evidenceItems.push({ source: 'uploaded_document', field: f.field_name, value: String(f.accepted_normalized_value ?? f.accepted_value ?? ''), document_type: f.source_document_type });
  }
  if (ctx.gaps?.length) {
    for (const g of ctx.gaps) {
      ctx.evidenceItems.push({ source: 'assessment', field: g.gap_type, value: 'Severity: ' + g.severity + ', Gap: $' + (g.gap_amount || 0) });
    }
  }
  if (ctx.metrics?.revenue) ctx.evidenceItems.push({ source: 'dashboard_metrics', field: 'revenue', value: '$' + ctx.metrics.revenue });
  if (ctx.metrics?.ebitda) ctx.evidenceItems.push({ source: 'dashboard_metrics', field: 'ebitda', value: '$' + ctx.metrics.ebitda });
  if (ctx.metrics?.ciq_score) ctx.evidenceItems.push({ source: 'dashboard_metrics', field: 'iq_score', value: '' + ctx.metrics.ciq_score });
  ctx.evidenceCompleteness = {
    documents: (ctx.extractedFields || []).length,
    assessments: Object.keys(ctx.assessments || {}).length,
    basis: (ctx.extractedFields || []).length >= 5 ? 'high' : Object.keys(ctx.assessments || {}).length >= 2 ? 'moderate' : 'low',
  };

  return ctx;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const sb = getSupabase();
    const body = await req.json().catch(() => ({}));
    const { action, data = {} } = body;

    const profile = await getProfile(sb, user.email);
    const profileId = profile?.id;
    const isAdmin = user.role === 'admin' || user.role === 'super_admin';

    // ── Phase 6.9 — CANONICAL ACTIVE BUSINESS ────────────────────────────────
    // `businessId` used to be `profile.primary_business_id`. Every Sprint path,
    // objective and task written while a NON-primary business was active was
    // therefore stamped with the PRIMARY business's id: the record was filed
    // under the wrong business permanently, and `getSprint`'s business filter
    // could then never find it again.
    //
    // Resolution is lazy — only the actions that genuinely need a business
    // resolve one, so read-only/admin actions are unaffected — and it goes
    // through the canonical contract: an explicitly requested active business is
    // authoritative, and the profile default applies only when the account owns
    // a single business. `primary_business_id` is never a silent substitute.
    const requestedBusinessId =
      data?.active_business_id || data?.businessId || data?.business_id ||
      body?.active_business_id || body?.businessId || null;

    let _activeBusinessId;
    const getActiveBusinessId = async () => {
      if (_activeBusinessId === undefined) {
        const resolved = await resolveActiveBusiness(sb, profile, requestedBusinessId, { action });
        _activeBusinessId = resolved.business_id;
      }
      return _activeBusinessId;
    };

    // ── Phase 6B.4 — the actor is derived from the session, never the body ──
    const actor = await authenticateActor(base44, sb);

    // ── GENERATE PATHS ──────────────────────────────────────────────────────
    if (action === 'generatePaths') {
      let businessId;
      try { businessId = await getActiveBusinessId(); }
      catch (bizErr) { return businessContextError(bizErr); }
      // Phase C.1: Base44 Assessment retired — read computed results from Supabase.
      const { byType: calcByType } = await loadAssessmentResults(sb, businessId);
      const assessmentSummary = Object.entries(calcByType).reduce((acc, [type, calc]) => {
        if (calc.result_json) acc[type] = calc.result_json;
        return acc;
      }, {});

      const prompt = `You are Galileo, the V.I.S.I.O.N. Platform strategic AI. Generate THREE distinct 90-day execution paths based on this business data:

${JSON.stringify(assessmentSummary, null, 2)}

Return JSON: { "paths": [{ "id": "cash_flow", "title": "...", "goal": "...", "why_it_matters": "...", "expected_outcome": "...", "ease": "easy|medium|advanced", "estimated_impact": "...", "confidence": 85, "recommended_first_move": "...", "summary": "..." }] }

Make each path distinct and specific. If data is limited, use smart defaults.`;

      const llmRes = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: 'object',
          properties: { paths: { type: 'array', items: { type: 'object', properties: {
            id: { type: 'string' }, title: { type: 'string' }, goal: { type: 'string' },
            why_it_matters: { type: 'string' }, expected_outcome: { type: 'string' },
            ease: { type: 'string' }, estimated_impact: { type: 'string' },
            confidence: { type: 'number' }, recommended_first_move: { type: 'string' },
            summary: { type: 'string' }
          }}}}
        }
      });

      return Response.json({ paths: llmRes.paths || fallbackPaths() });
    }

    // ── SELECT PATH ─────────────────────────────────────────────────────────
    if (action === 'selectPath') {
      const { pathId, pathTitle, pathGoal, pathSummary, confidence, ease, estimatedImpact, expectedOutcome, opportunityBase44Id } = data;

      let businessId;
      try { businessId = await getActiveBusinessId(); }
      catch (bizErr) { return businessContextError(bizErr); }

      if (!isValidUUID(profileId)) {
        return Response.json({ error: `Invalid UUID for profile_id. Received: ${profileId}` }, { status: 400 });
      }
      if (businessId && !isValidUUID(businessId)) {
        return Response.json({ error: `Invalid UUID for business_id. Received: ${businessId}` }, { status: 400 });
      }

      // ── Check if this exact sprint path was previously built and has tasks ──
      // Match by opportunity Base44 ID (stored in path_key) or by path title
      const lookupKey = opportunityBase44Id || pathId;
      if (lookupKey) {
        const { data: existingPaths } = await sb.from('ninety_day_sprint_paths')
          .select('*')
          .eq('profile_id', profileId)
          .eq('path_key', lookupKey)
          .order('created_at', { ascending: false })
          .limit(1);

        if (existingPaths?.[0]) {
          const existingSprint = existingPaths[0];
          const { data: existingTasks } = await sb.from('ninety_day_sprint_tasks')
            .select('id')
            .eq('path_id', existingSprint.id)
            .neq('is_deleted', true)
            .limit(1);

          if (existingTasks?.length > 0) {
            // This sprint already has tasks — deactivate others and restore this one
            await sb.from('ninety_day_sprint_paths')
              .update({ is_active: false, status: 'archived', archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
              .eq('profile_id', profileId)
              .eq('is_active', true)
              .neq('id', existingSprint.id);

            const { data: restored } = await sb.from('ninety_day_sprint_paths')
              .update({ is_active: true, status: 'active', archived_at: null, updated_at: new Date().toISOString() })
              .eq('id', existingSprint.id)
              .select().single();

            console.log(`[ninetyDaySprint] Restored existing sprint ${existingSprint.id} with tasks`);
            return Response.json({ sprint: restored || existingSprint, restored: true });
          }
        }
      }

      // Deactivate existing active paths (no match found above)
      await sb.from('ninety_day_sprint_paths')
        .update({ is_active: false, status: 'archived', archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('profile_id', profileId)
        .eq('is_active', true);

      const nowISO = new Date().toISOString();
      const safeOpportunityId = (data.opportunityId && isValidUUID(data.opportunityId)) ? data.opportunityId : null;

      // Resolve industry and evidence from opportunity for storing on the sprint path
      const { data: pgIndustryRow } = await sb.from('assessment_answers')
        .select('answer_value').eq('profile_id', profileId).eq('assessment_type', 'profit_gap').eq('question_key', 'industry_input')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      const sprintIndustry = pgIndustryRow?.answer_value || null;

      // Pull evidence from the linked opportunity if available
      let oppEvidence = { recommendation_reason: null, evidence_sources: null, expected_impact: null };
      if (opportunityBase44Id) {
        try {
          const opp = await base44.asServiceRole.entities.galileo_opportunities.get(opportunityBase44Id);
          if (opp) {
            oppEvidence.recommendation_reason = opp.recommendation_reason || null;
            oppEvidence.evidence_sources = opp.evidence_sources || null;
            oppEvidence.expected_impact = opp.expected_impact || null;
          }
        } catch (e) { console.log('[ninetyDaySprint] Could not fetch opportunity evidence:', e.message); }
      }

      const { data: sprint, error } = await sb.from('ninety_day_sprint_paths').insert({
        profile_id: profileId,
        business_id: businessId || null,
        opportunity_id: safeOpportunityId,
        path_key: lookupKey || null,
        path_title: pathTitle,
        path_goal: pathGoal,
        path_summary: pathSummary,
        expected_outcome: expectedOutcome || null,
        ease_of_implementation: ease || null,
        estimated_impact: estimatedImpact || null,
        galileo_confidence: confidence || null,
        industry_context: sprintIndustry,
        recommendation_reason: oppEvidence.recommendation_reason,
        evidence_sources: oppEvidence.evidence_sources,
        expected_impact: oppEvidence.expected_impact,
        status: 'active',
        is_selected: true,
        is_active: true,
        progress_percent: 0,
        verification_status: 'galileo_verified_pending_expert',
        galileo_verified: true,
        expert_verified: false,
        needs_expert_review: true,
        last_galileo_update_at: nowISO,
        review_requested_at: nowISO,
        created_by: profileId,
        created_at: nowISO,
        updated_at: nowISO,
      }).select().single();

      if (error) {
        console.error('[ninetyDaySprint] insert path error:', JSON.stringify(error));
        return Response.json({ error: error.message }, { status: 500 });
      }

      // Link Base44 opportunity entity back to the new sprint path
      if (opportunityBase44Id) {
        try {
          await base44.asServiceRole.entities.galileo_opportunities.update(opportunityBase44Id, {
            converted_to_path: true, path_id: sprint.id
          });
        } catch (e) { console.error('Link opportunity failed:', e.message); }
      }

      // Track first sprint created achievement
      try {
        await base44.functions.invoke('achievementNotifications', {
          action: 'trackSprintCreated',
          data: { sprint_id: sprint.id },
        });
      } catch (e) { console.log('[ninetyDaySprint] Achievement tracking failed:', e.message); }

      return Response.json({ sprint });
    }

    // ── GENERATE SPRINT TASKS (with full Galileo context + duplicate prevention) ─
    // ── GENERATE SPRINT / PREVIEW SPRINT ─────────────────────────────────────
    // ONE generator, two modes. `previewSprint` runs the exact same context load,
    // prompt and fallback as `generateSprint` and returns the plan WITHOUT
    // writing anything, so Vision can show an owner what implementation would
    // look like before they commit. There is no second Sprint engine.
    //
    // `generateSprint` may receive `planned_tasks` — the plan the owner was just
    // shown by the preview — so the Sprint they build is the Sprint they saw,
    // rather than a second, different generation. Those tasks pass through the
    // same insert path below; they only replace the model call.
    if (action === 'generateSprint' || action === 'previewSprint') {
      const isPreview = action === 'previewSprint';
      const { sprint_id, sprint_title, sprint_goal } = data;

      if (!isPreview && !sprint_id) return Response.json({ error: 'sprint_id required' }, { status: 400 });
      if (isPreview && !sprint_title) return Response.json({ error: 'sprint_title required' }, { status: 400 });

      let businessId;
      try { businessId = await getActiveBusinessId(); }
      catch (bizErr) { return businessContextError(bizErr); }

      // ── DUPLICATE PREVENTION: check if tasks already exist ──
      const { data: existingTasks, error: checkErr } = isPreview ? { data: null, error: null } : await sb
        .from('ninety_day_sprint_tasks')
        .select('id, title, month_number, week_number, task_type, status, ease, impact, priority, sort_order, expected_outcome, due_date, is_deleted, is_galileo_generated')
        .eq('path_id', sprint_id)
        .neq('is_deleted', true);

      if (!checkErr && existingTasks?.length > 0) {
        console.log(`[ninetyDaySprint] Tasks already exist for path ${sprint_id}: ${existingTasks.length} tasks. Returning existing.`);
        return Response.json({ tasks: existingTasks, source: 'existing', count: existingTasks.length });
      }

      // ── Load rich context for Galileo ──
      const ctx = profileId ? await buildSprintContext(sb, profileId, businessId, base44) : {};

      const today = new Date();
      const startStr = today.toISOString().split('T')[0];
      const end = new Date(today);
      end.setDate(end.getDate() + 90);
      const endStr = end.toISOString().split('T')[0];

      // Build context summary for prompt
      const contextLines = [];
      if (ctx.metrics) {
        contextLines.push(`Business Metrics: Revenue=${ctx.metrics.revenue ? '$'+Math.round(ctx.metrics.revenue/1000)+'K' : 'unknown'}, EBITDA=${ctx.metrics.ebitda ? '$'+Math.round(ctx.metrics.ebitda/1000)+'K' : 'unknown'}, Industry=${ctx.metrics.industry || 'unknown'}, IQ Score=${ctx.metrics.ciq_score || 'unknown'}`);
      }
      if (ctx.financials) {
        contextLines.push(`Financials: Annual Revenue=$${ctx.financials.annual_revenue || 0}, Monthly Take-Home=$${ctx.financials.monthly_take_home || 0}`);
      }
      if (ctx.gaps?.length) {
        contextLines.push(`Key Gaps: ${ctx.gaps.map(g => `${g.gap_type}(${g.severity})`).join(', ')}`);
      }
      if (ctx.opportunities?.length) {
        contextLines.push(`Top Opportunities: ${ctx.opportunities.slice(0,3).map(o => o.title).join('; ')}`);
      }
      if (ctx.extractedFields?.length) {
        const keyFields = ctx.extractedFields.slice(0, 10).map(f => `${f.field_name}: ${f.field_value}`).join(', ');
        contextLines.push(`Extracted Document Data: ${keyFields}`);
      }
      const assessmentKeys = Object.keys(ctx.assessments || {});
      if (assessmentKeys.length) {
        contextLines.push(`Completed Assessments: ${assessmentKeys.join(', ')}`);
      }

      const hasContext = contextLines.length > 0;
      const contextSection = hasContext
        ? `\n\nCLIENT BUSINESS CONTEXT (use this to make tasks specific):\n${contextLines.join('\n')}`
        : '\n\nNote: Limited client data available. Generate practical tasks based on the selected path.';

      const industry = ctx.industry || '';
      const industryGuidanceMap = industry.toLowerCase();
      let industryExpertGuide = '';
      if (industryGuidanceMap.includes('landscap') || industryGuidanceMap.includes('lawn') || industryGuidanceMap.includes('tree') || industryGuidanceMap.includes('irrigation')) {
        industryExpertGuide = `For landscaping/lawn care: expert types include Fractional CFO (job costing, crew margin), Operations Consultant (route density, crew utilization), CPA/Tax Strategist (equipment depreciation, Section 179, entity structure), HR Advisor (crew labor classification W-2 vs 1099), Insurance Advisor (equipment, liability, workers comp). Tasks should reference: job costing by service line, route density, crew utilization rates, equipment costs, maintenance contract vs one-time revenue mix, seasonal cash flow, change order management, subcontractor leakage.`;
      } else if (industryGuidanceMap.includes('construct') || industryGuidanceMap.includes('contractor') || industryGuidanceMap.includes('plumb') || industryGuidanceMap.includes('electr') || industryGuidanceMap.includes('hvac') || industryGuidanceMap.includes('trades')) {
        industryExpertGuide = `For construction/trades: expert types include Fractional CFO (WIP accounting, job costing), Attorney (contract/change order language, lien rights), CPA/Tax Strategist (equipment depreciation, bonus depreciation, entity), Insurance Advisor (bonding, liability, workers comp), Operations Consultant (project scheduling, labor burden). Tasks should reference: job costing accuracy, change order process, crew utilization, equipment ROI, collections timeline, bonding capacity.`;
      } else if (industryGuidanceMap.includes('professional') || industryGuidanceMap.includes('consult') || industryGuidanceMap.includes('legal') || industryGuidanceMap.includes('account') || industryGuidanceMap.includes('advisor') || industryGuidanceMap.includes('engineer')) {
        industryExpertGuide = `For professional services: expert types include Fractional CFO (utilization, realization rate, capacity analysis), Pricing Strategist (value-based vs hourly, packaging), Operations Consultant (delivery leverage, process), Attorney (non-compete, IP, partnership). Tasks should reference: billable utilization per professional, realization rate, client concentration, recurring vs project revenue mix, pricing model, owner billability.`;
      } else if (industryGuidanceMap.includes('restaurant') || industryGuidanceMap.includes('food') || industryGuidanceMap.includes('catering') || industryGuidanceMap.includes('hospitality')) {
        industryExpertGuide = `For food/hospitality: expert types include Operations Consultant (food cost, labor scheduling), CPA (tip reporting, payroll compliance), Fractional CFO (menu costing, prime cost). Tasks should reference: food cost %, labor cost by shift, table turn rate, average check size, supplier renegotiation, catering revenue.`;
      } else if (industryGuidanceMap.includes('healthcare') || industryGuidanceMap.includes('medical') || industryGuidanceMap.includes('dental') || industryGuidanceMap.includes('therapy') || industryGuidanceMap.includes('clinic')) {
        industryExpertGuide = `For healthcare: expert types include Practice Management Consultant (collections, scheduling), Attorney (HIPAA, payer contracts), CPA (provider compensation, entity structure), Insurance Advisor (malpractice, key-person). Tasks should reference: collections rate by payer, revenue per provider per day, credentialing, overhead ratio per treatment room.`;
      } else if (industryGuidanceMap.includes('real estate') || industryGuidanceMap.includes('property') || industryGuidanceMap.includes('landlord')) {
        industryExpertGuide = `For real estate: expert types include CPA/Tax Strategist (cost segregation, depreciation, 1031 exchange), Real Estate Attorney (entity, contracts), Fractional CFO (NOI optimization, debt structure). Tasks should reference: NOI vs cap rate, vacancy rate, depreciation/cost segregation, refinancing timing.`;
      } else if (industryGuidanceMap.includes('retail') || industryGuidanceMap.includes('ecommerce') || industryGuidanceMap.includes('wholesale')) {
        industryExpertGuide = `For retail/e-commerce: expert types include Operations Consultant (inventory, fulfillment), CPA (inventory methods, COGS), Fractional CFO (cash conversion cycle, vendor terms). Tasks should reference: inventory turnover, gross margin by SKU/category, customer acquisition cost vs LTV, returns rate, vendor terms.`;
      }

      const industryBlock = industry
        ? `\n\nINDUSTRY: "${industry}" — THIS IS THE PRIMARY LENS FOR ALL TASKS\n${industryExpertGuide}\nEvery task title and description MUST reference ${industry}-specific activities, metrics, or terminology. Do NOT use generic language.`
        : '';

      const evidenceBlock = (ctx.evidenceItems || []).length > 0
        ? '\n\nCLIENT-SPECIFIC EVIDENCE (reference in task_reason for each task):\n' +
          ctx.evidenceItems.map(e => '- [' + e.source + '] ' + e.field + ': ' + e.value).join('\n') +
          '\nData completeness: ' + (ctx.evidenceCompleteness?.basis || 'low')
        : '\n\nLIMITED DATA: Set confidence_score below 50 for all tasks.';

      const prompt = `You are Galileo. Create a 90-day sprint plan for: "${sprint_title}" | Goal: "${sprint_goal}"
Period: ${startStr} to ${endStr}
${contextSection}${evidenceBlock}${industryBlock}

Rules: 14 main tasks total. Month 1 (weeks 1-4): Foundation. Month 2 (weeks 5-8): Execution. Month 3 (weeks 9-12): Optimization.

CRITICAL: Every task must answer "Why does THIS client need this task?" Do NOT generate generic advice.
- Tasks MUST be specific to ${industry || 'this business'} — NEVER use generic tasks
- FORBIDDEN: "Review data", "Improve operations", "Meet with team", "Analyze financials"
- REQUIRED: Use ${industry || 'industry'}-specific terminology, metrics, and workflows in every task title
- Every task MUST include task_reason: 1-2 sentences explaining WHY this task exists for THIS client, referencing specific evidence
- Every task MUST include task_evidence: array of {source, field, value} from the CLIENT EVIDENCE above
- Every task MUST include confidence_score (0-100). 70+ only when supported by client documents/assessments. Below 50 when based on industry averages.
- expected_outcome MUST be specific and measurable (dollar amounts or percentages)
- Reference actual data from context where available
- For expert_needed: set true if task requires professional expertise beyond owner's scope
- recommended_expert_type must be specific to both task AND industry
- expert_reason must explain WHY this expert matters FOR THIS SPECIFIC TASK

Return JSON: { "tasks": [{ "title": "...", "description": "...", "month_number": 1, "week_number": 1, "due_date": "YYYY-MM-DD", "priority": "critical|high|medium|low", "ease": "easy|medium|advanced", "impact": "critical|high|medium|low", "expected_outcome": "...", "sort_order": 1, "expert_needed": true, "recommended_expert_type": "CPA", "expert_reason": "...", "task_reason": "...", "task_evidence": [{"source":"...","field":"...","value":"..."}], "confidence_score": 75 }] }`;

      // The plan the owner already reviewed, when they are building from a preview.
      const plannedTasks = !isPreview && Array.isArray(data.planned_tasks)
        ? data.planned_tasks
            .filter((t: any) => t && typeof t.title === 'string' && t.title.trim())
            .slice(0, 20)
        : null;

      let llmRes;
      if (plannedTasks && plannedTasks.length > 0) {
        llmRes = { tasks: plannedTasks };
      } else try {
        llmRes = await base44.integrations.Core.InvokeLLM({
          prompt,
          response_json_schema: {
            type: 'object',
            properties: { tasks: { type: 'array', items: { type: 'object', properties: {
              title: { type: 'string' }, description: { type: 'string' },
              month_number: { type: 'number' }, week_number: { type: 'number' },
              due_date: { type: 'string' }, priority: { type: 'string' },
              ease: { type: 'string' }, impact: { type: 'string' },
              expected_outcome: { type: 'string' }, sort_order: { type: 'number' },
              expert_needed: { type: 'boolean' }, recommended_expert_type: { type: 'string' },
              expert_reason: { type: 'string' },
              task_reason: { type: 'string' },
              task_evidence: { type: 'array', items: { type: 'object', properties: { source: { type: 'string' }, field: { type: 'string' }, value: { type: 'string' } } } },
              confidence_score: { type: 'number' }
            }}}}
          }
        });
      } catch (llmErr) {
        console.error('[ninetyDaySprint] LLM error, using fallback tasks:', llmErr.message);
        llmRes = { tasks: generateFallbackTasks(sprint_title, sprint_goal, startStr) };
      }

      const rawTasks = llmRes?.tasks?.length ? llmRes.tasks : generateFallbackTasks(sprint_title, sprint_goal, startStr);

      // Preview: return the plan, write nothing.
      if (isPreview) {
        return Response.json({
          preview: true,
          tasks: rawTasks,
          contextUsed: hasContext,
          fallback: !hasContext,
        });
      }

      const now = new Date().toISOString();
      const taskDefs = rawTasks.map((t, i) => {
        const weekNum = t.week_number || (i + 1);
        const monthNum = t.month_number || Math.ceil(weekNum / 4);
        // Calculate due date from week number if not provided
        let dueDate = t.due_date;
        if (!dueDate) {
          const d = new Date(today);
          d.setDate(d.getDate() + (weekNum * 7) - 3);
          dueDate = d.toISOString().split('T')[0];
        }
        return {
          path_id: sprint_id,
          task_type: 'main_task',
          title: t.title,
          description: t.description || '',
          month_number: monthNum,
          week_number: weekNum,
          due_date: dueDate,
          priority: t.priority || 'medium',
          ease: t.ease || 'medium',
          impact: t.impact || 'medium',
          expected_outcome: t.expected_outcome || '',
          sort_order: t.sort_order || i + 1,
          status: 'not_started',
          is_galileo_generated: true,
          is_user_created: false,
          locked: true,
          expert_needed: t.expert_needed || false,
          recommended_expert_type: t.recommended_expert_type || null,
          expert_reason: t.expert_reason || null,
          task_reason: t.task_reason || null,
          task_evidence: t.task_evidence || null,
          confidence_score: t.confidence_score || null,
          industry_context: ctx.industry || null,
          profile_id: profileId,
          business_id: businessId,
          created_by: profileId,
          created_at: now,
          updated_at: now,
        };
      });

      let created, insertErr;
      ({ data: created, error: insertErr } = await sb.from('ninety_day_sprint_tasks').insert(taskDefs).select());
      if (insertErr) {
        // Evidence columns might not exist yet — retry without them
        console.warn('[ninetyDaySprint] Insert with evidence columns failed, retrying without:', insertErr.message);
        const cleanDefs = taskDefs.map(({ task_reason, task_evidence, confidence_score, ...rest }) => rest);
        ({ data: created, error: insertErr } = await sb.from('ninety_day_sprint_tasks').insert(cleanDefs).select());
        if (insertErr) {
          console.error('[ninetyDaySprint] bulk insert tasks error:', JSON.stringify(insertErr));
          return Response.json({ error: insertErr.message }, { status: 500 });
        }
      }

      console.log(`[ninetyDaySprint] Generated ${created?.length || 0} tasks for path ${sprint_id}. Context sources used: ${hasContext ? contextLines.length : 0}. Fallback: ${!hasContext}`);

      // Notify admins that sprint needs expert verification
      try {
        const adminUsers = await base44.asServiceRole.entities.User.filter({ role: { $in: ['admin', 'super_admin'] } });
        const clientRes = await sb.from('profiles').select('full_name').eq('id', profileId).maybeSingle();
        const clientName = clientRes?.data?.full_name || 'Client';

        for (const adminUser of adminUsers) {
          await base44.functions.invoke('notificationService', {
            action: 'createNotification',
            data: {
              recipient_id: adminUser.id,
              notification_type: 'sprint_needs_expert_review',
              title: 'New Galileo Sprint Needs Expert Verification',
              message: `A new Galileo-generated 90-Day Sprint needs expert verification for ${clientName}.`,
              related_entity_type: 'NinetyDaySprint',
              related_entity_id: sprint_id,
              action_url: '/advisory/command-center',
              priority: 'high',
              metadata: { sprint_id: sprint_id, client_name: clientName },
            },
          });
        }
        console.log('[ninetyDaySprint] Admin notifications sent for sprint verification');
      } catch (notifErr) {
        console.warn('[ninetyDaySprint] Verification notification failed:', notifErr.message);
      }

      return Response.json({
        tasks: created || [],
        source: 'generated',
        count: created?.length || 0,
        contextUsed: hasContext,
        fallback: !hasContext,
      });
    }

    // ── GENERATE FROM BIE RECOMMENDATIONS (canonical Sprint restoration) ────
    // Consumes bis.engine.recommendations (passed from the client — never
    // recomputed server-side) and builds rich Sprint Objectives (main_task) +
    // Sprint Tasks (subtask). Deduplicates by recommendation id, preserves
    // completed work, and prioritizes using existing recommendation metadata.
    if (action === 'generateFromRecommendations') {
      const { sprint_id, recommendations } = data;
      if (!sprint_id) return Response.json({ error: 'sprint_id required' }, { status: 400 });

      let businessId;
      try { businessId = await getActiveBusinessId(); }
      catch (bizErr) { return businessContextError(bizErr); }

      const recs = Array.isArray(recommendations) ? recommendations.filter(r => r && r.id) : [];

      // Insert helper — retries without task_evidence if the column is unavailable
      const insertTask = async (payload) => {
        const { data: row, error } = await sb.from('ninety_day_sprint_tasks').insert(payload).select().single();
        if (!error) return row;
        if (payload.task_evidence !== undefined) {
          const { task_evidence, ...rest } = payload;
          const { data: row2, error: err2 } = await sb.from('ninety_day_sprint_tasks').insert(rest).select().single();
          if (!err2) return row2;
          console.warn('[ninetyDaySprint] insertTask retry failed:', err2.message);
        }
        return null;
      };

      // ── Load existing objectives for dedup / preserve-completed ──
      const { data: existingTasks } = await sb.from('ninety_day_sprint_tasks')
        .select('*').eq('path_id', sprint_id).neq('is_deleted', true);
      const existingByRecId = {};
      for (const t of (existingTasks || [])) {
        if (t.task_type !== 'main_task') continue;
        let recId = null;
        try {
          const ev = typeof t.task_evidence === 'string' ? JSON.parse(t.task_evidence) : t.task_evidence;
          recId = ev?.recommendation_id;
        } catch { /* ignore */ }
        if (recId) existingByRecId[recId] = t;
      }

      // ── Prioritize: priority (high>medium>low) then estimatedImpact desc ──
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      const sorted = [...recs].sort((a, b) => {
        const pa = priorityOrder[a.priority] ?? 3;
        const pb = priorityOrder[b.priority] ?? 3;
        if (pa !== pb) return pa - pb;
        return (b.estimatedImpact || 0) - (a.estimatedImpact || 0);
      });

      const now = new Date().toISOString();
      const today = new Date();
      const createdObjectives = [];
      const createdTasks = [];
      const preserved = [];
      let objectiveCount = 0;

      for (let i = 0; i < sorted.length; i++) {
        const rec = sorted[i];
        const recId = rec.id;
        const tpl = RECOMMENDATION_OBJECTIVES[recId] || RECOMMENDATION_OBJECTIVES.__default;

        // ── Dedup: objective already exists → preserve + merge missing subtasks ──
        if (existingByRecId[recId]) {
          const existingObj = existingByRecId[recId];
          preserved.push(recId);
          const { data: existingSubs } = await sb.from('ninety_day_sprint_tasks')
            .select('title, status').eq('parent_task_id', existingObj.id).neq('is_deleted', true);
          const existingTitles = new Set((existingSubs || []).map(s => (s.title || '').toLowerCase()));
          for (let j = 0; j < tpl.tasks.length; j++) {
            const tt = tpl.tasks[j];
            if (existingTitles.has(tt.title.toLowerCase())) continue; // never duplicate
            const subDue = (() => { const d = new Date(today); d.setDate(d.getDate() + ((existingObj.week_number || 1) * 7) + j * 7); return d.toISOString().split('T')[0]; })();
            const sub = await insertTask({
              path_id: sprint_id, parent_task_id: existingObj.id, task_type: 'subtask',
              title: tt.title, description: tt.purpose, month_number: existingObj.month_number || 1,
              week_number: existingObj.week_number || 1, due_date: subDue,
              priority: rec.priority || 'medium', ease: tt.ease || 'medium', impact: 'medium',
              expected_outcome: tt.completionCriteria, sort_order: j + 1, status: 'not_started',
              is_galileo_generated: true, is_user_created: false, locked: false,
              task_evidence: { recommendation_id: recId, completion_criteria: tt.completionCriteria, source: 'bis_engine_recommendations' },
              profile_id: profileId, business_id: businessId, created_by: profileId, created_at: now, updated_at: now,
            });
            if (sub) createdTasks.push(sub);
          }
          continue;
        }

        // ── Create new objective (main_task) ──
        const monthNum = Math.min(Math.floor(i / 2) + 1, 3);
        const weekNum = Math.min((i * 2) + 1, 12);
        const estValue = rec.estimatedImpact || 0;
        const impactLevel = estValue >= 100000 ? 'critical' : estValue >= 25000 ? 'high' : 'medium';
        const objDue = (() => { const d = new Date(today); d.setDate(d.getDate() + (weekNum * 7) - 3); return d.toISOString().split('T')[0]; })();

        const obj = await insertTask({
          path_id: sprint_id, task_type: 'main_task',
          title: rec.label || tpl.label,
          description: tpl.executiveSummary,
          month_number: monthNum, week_number: weekNum, due_date: objDue,
          priority: rec.priority || 'medium', ease: 'medium', impact: impactLevel,
          expected_outcome: tpl.businessOutcome, sort_order: ++objectiveCount, status: 'not_started',
          is_galileo_generated: true, is_user_created: false, locked: true,
          expert_needed: true, recommended_expert_type: tpl.expertType, expert_reason: tpl.expertReason,
          task_reason: tpl.whyItMatters,
          task_evidence: {
            recommendation_id: recId, estimated_value: estValue,
            estimated_value_formatted: rec.estimatedImpactFormatted || rec.formatted || null,
            success_metric: tpl.successMetric, related_assessment: tpl.relatedAssessment,
            related_assessment_target: rec.target || tpl.relatedAssessmentTarget,
            dependencies: tpl.dependencies, recommended_owner: tpl.recommendedOwner,
            completion_window: tpl.completionWindow, why_now: tpl.whyNow,
            metric_improves: rec.formatted || null, source: 'bis_engine_recommendations',
          },
          confidence_score: rec.confidence || 72,
          profile_id: profileId, business_id: businessId, created_by: profileId, created_at: now, updated_at: now,
        });

        if (!obj) { console.warn('[ninetyDaySprint] Failed to create objective for', recId); continue; }
        createdObjectives.push(obj);

        // ── Create Sprint Tasks (subtasks) for this objective ──
        for (let j = 0; j < tpl.tasks.length; j++) {
          const tt = tpl.tasks[j];
          const subWeek = Math.min(weekNum + j, 12);
          const subDue = (() => { const d = new Date(today); d.setDate(d.getDate() + (subWeek * 7) - 3); return d.toISOString().split('T')[0]; })();
          const sub = await insertTask({
            path_id: sprint_id, parent_task_id: obj.id, task_type: 'subtask',
            title: tt.title, description: tt.purpose, month_number: monthNum, week_number: subWeek, due_date: subDue,
            priority: rec.priority || 'medium', ease: tt.ease || 'medium', impact: 'medium',
            expected_outcome: tt.completionCriteria, sort_order: j + 1, status: 'not_started',
            is_galileo_generated: true, is_user_created: false, locked: false,
            task_evidence: { recommendation_id: recId, completion_criteria: tt.completionCriteria, source: 'bis_engine_recommendations' },
            profile_id: profileId, business_id: businessId, created_by: profileId, created_at: now, updated_at: now,
          });
          if (sub) createdTasks.push(sub);
        }
      }

      console.log(`[ninetyDaySprint] generateFromRecommendations: ${createdObjectives.length} new objectives, ${createdTasks.length} new tasks, ${preserved.length} preserved. Recs: ${recs.length}`);

      return Response.json({
        objectives: createdObjectives,
        tasks: createdTasks,
        preserved,
        source: 'bis_recommendations',
        recommendationCount: recs.length,
      });
    }

    // ── GET SPRINT FOR A SPECIFIC PROFILE (expert advisor portal) ───────────
    if (action === 'getSprintForProfile') {
      const requestedTargetId = body.data?.profile_id || body.profile_id;
      if (!requestedTargetId) return Response.json({ sprint: null, tasks: [] });

      // ── Phase 6B.4 — a named target must be an AUTHORIZED target ─────────
      // Previously any authenticated caller received another profile's sprint and
      // tasks simply by naming that profile id. Authorization is now the same
      // ownership/assignment rule the rest of the platform enforces.
      let sprintTarget;
      try {
        sprintTarget = await resolveActingProfile(sb, actor, { targetProfileId: requestedTargetId });
      } catch (err) {
        return errorResponse(err);
      }
      const targetProfileId = sprintTarget.profile.id;

      const { data: sprints } = await sb
        .from('ninety_day_sprint_paths')
        .select('*')
        .eq('profile_id', targetProfileId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1);

      const activeSprint = sprints?.[0];
      if (!activeSprint) return Response.json({ sprint: null, tasks: [] });

      const { data: tasks } = await sb
        .from('ninety_day_sprint_tasks')
        .select('*')
        .eq('path_id', activeSprint.id)
        .neq('is_deleted', true)
        .order('sort_order', { ascending: true });

      const taskList = tasks || [];
      const mainTasks = taskList.filter(t => t.task_type === 'main_task');
      const completed = mainTasks.filter(t => t.status === 'completed').length;
      const progress = mainTasks.length > 0 ? Math.round((completed / mainTasks.length) * 100) : 0;

      return Response.json({
        sprint: { ...activeSprint, progress_percent: progress },
        tasks: taskList,
      });
    }

    // ── GET SPRINT ──────────────────────────────────────────────────────────
    if (action === 'getSprint') {
      if (!profileId) return Response.json({ sprint: null, tasks: [], notes: [], docs: [], reminders: [] });

      // ── Phase 6.9 — canonical active business ────────────────────────────────
      // Was `data.active_business_id || null`. When a caller omitted it, the query
      // fell through to a PROFILE-WIDE selection: the newest active sprint from ANY
      // of the owner's businesses was returned as "the" active sprint — and the
      // progress write below then mutated that sprint. Selection must be
      // business-scoped BEFORE any mutation can occur.
      let activeBizId;
      try {
        activeBizId = await getActiveBusinessId();
      } catch (bizErr) { return businessContextError(bizErr); }
      console.log('[ninetyDaySprint] getSprint active_business_id:', activeBizId);

      // Sprint path query: when activeBizId set → show that business OR null (legacy/profile-level).
      // When absent (single-business) → plain profile query, identical to pre-1C behavior.
      let sprintsQuery = sb
        .from('ninety_day_sprint_paths')
        .select('*')
        .eq('profile_id', profileId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1);

      if (activeBizId) {
        sprintsQuery = sb
          .from('ninety_day_sprint_paths')
          .select('*')
          .eq('profile_id', profileId)
          .eq('is_active', true)
          .or(`business_id.eq.${activeBizId},business_id.is.null`)
          .order('created_at', { ascending: false })
          .limit(1);
      }

      const { data: sprints, error: sprintErr } = await sprintsQuery;

      if (sprintErr) return Response.json({ sprint: null, tasks: [], notes: [], docs: [], reminders: [] });
      const activeSprint = sprints?.[0];
      if (!activeSprint) return Response.json({ sprint: null, tasks: [], notes: [], docs: [], reminders: [] });

      const { data: rawTasks } = await sb
        .from('ninety_day_sprint_tasks')
        .select('*')
        .eq('path_id', activeSprint.id)
        .neq('is_deleted', true)
        .order('sort_order', { ascending: true });

      // Phase 1C task scope filtering (Sprint Scope Matrix).
      // No activeBizId → show all (single-business / legacy unchanged).
      // activeBizId set → apply scope_level rules.
      const taskList = !activeBizId
        ? (rawTasks || [])
        : (rawTasks || []).filter(t => {
            const sl = t.scope_level || null;
            if (sl === 'portfolio') return false;          // always hide
            if (sl === 'profile') return true;             // always show
            if (sl === 'business' || sl === 'hybrid') {
              return !t.business_id || t.business_id === activeBizId;
            }
            return true;                                   // null (legacy) → show
          });

      // Compute progress
      const mainTasks = taskList.filter(t => t.task_type === 'main_task');
      const completed = mainTasks.filter(t => t.status === 'completed').length;
      const progress = mainTasks.length > 0 ? Math.round((completed / mainTasks.length) * 100) : 0;

      if (progress !== (activeSprint.progress_percent || 0)) {
        await sb.from('ninety_day_sprint_paths')
          .update({ progress_percent: progress, updated_at: new Date().toISOString() })
          .eq('id', activeSprint.id);
      }

      // Fetch Base44 entities for notes, docs, reminders
      const notes = await base44.entities.SprintTaskNote.filter(
        { sprint_id: activeSprint.id, is_deleted: { $ne: true } }, '-created_date', 500
      );
      const docs = await base44.entities.SprintTaskDocument.filter(
        { sprint_id: activeSprint.id }, '-created_date', 100
      );
      const reminders = await base44.entities.SprintReminder.filter(
        { sprint_id: activeSprint.id, status: 'scheduled' }, '-created_date', 50
      );

      return Response.json({
        sprint: { ...activeSprint, progress_percent: progress },
        tasks: taskList,
        notes: notes || [],
        docs: docs || [],
        reminders: reminders || [],
      });
    }

    // ── EXPERT VERIFY SPRINT ──────────────────────────────────────────────
    if (action === 'expertVerifySprint') {
      const { sprint_id, verified, notes } = data;

      if (!sprint_id) return Response.json({ error: 'sprint_id required' }, { status: 400 });

      // Load the sprint to check assigned verifier
      const { data: sprintRows } = await sb.from('ninety_day_sprint_paths').select('*').eq('id', sprint_id).limit(1);
      const targetSprint = sprintRows?.[0];

      // Permission check: admin always allowed; expert advisor only if assigned verifier or has sprint_access
      const isAssignedVerifier = targetSprint?.assigned_verifier_profile_id === profileId;
      const supabaseProfileRes = await sb.from('profiles').select('app_role, sprint_access').eq('id', profileId).maybeSingle();
      const spProfile = supabaseProfileRes?.data;
      const isExpertWithAccess = spProfile?.app_role === 'expert_advisor' && (isAssignedVerifier || spProfile?.sprint_access === true);

      if (!isAdmin && !isExpertWithAccess) {
        return Response.json({ error: 'Unauthorized - admin or assigned expert advisor required' }, { status: 403 });
      }

      const nowISO = new Date().toISOString();
      const updateData = {
        updated_at: nowISO,
        verification_notes: notes || null,
      };

      if (verified) {
        updateData.expert_verified = true;
        updateData.verification_status = 'galileo_and_expert_verified';
        updateData.needs_expert_review = false;
        updateData.expert_verified_by = profileId;
        updateData.expert_verified_at = nowISO;
        updateData.verification_assignment_status = 'completed';
      } else {
        updateData.expert_verified = false;
        updateData.verification_status = 'expert_changes_requested';
        updateData.needs_expert_review = true;
        updateData.verification_assignment_status = 'changes_requested';
      }

      const { data: updated, error } = await sb.from('ninety_day_sprint_paths')
        .update(updateData)
        .eq('id', sprint_id)
        .select()
        .single();

      if (error) {
        console.error('[ninetyDaySprint] Expert verify error:', error);
        return Response.json({ error: error.message }, { status: 500 });
      }

      // Notify admins of outcome; notify client if changes requested
      try {
        const sprintTitle = targetSprint?.path_title || '90-Day Sprint';
        const adminUsers = await base44.asServiceRole.entities.User.filter({ role: { $in: ['admin', 'super_admin'] } });
        if (verified) {
          for (const adminUser of adminUsers) {
            await base44.functions.invoke('notificationService', {
              action: 'createNotification',
              data: {
                recipient_id: adminUser.id,
                notification_type: 'galileo_update',
                title: 'Sprint Expert Verified',
                message: `"${sprintTitle}" has been marked as expert verified.`,
                related_entity_type: 'NinetyDaySprint',
                related_entity_id: sprint_id,
                action_url: '/admin',
                priority: 'medium',
              },
            });
          }
        } else {
          // Notify admins of changes requested
          for (const adminUser of adminUsers) {
            await base44.functions.invoke('notificationService', {
              action: 'createNotification',
              data: {
                recipient_id: adminUser.id,
                notification_type: 'sprint_changes_requested',
                title: 'Sprint Changes Requested',
                message: `An expert requested changes to "${sprintTitle}". Notes: ${notes || 'none'}`,
                related_entity_type: 'NinetyDaySprint',
                related_entity_id: sprint_id,
                action_url: '/admin',
                priority: 'high',
              },
            });
          }
        }
      } catch (notifErr) {
        console.warn('[ninetyDaySprint] Admin notification failed:', notifErr.message);
      }

      return Response.json({ sprint: updated, success: true });
    }

    // ── UPDATE TASK ────────────────────────────────────────────────────────
    if (action === 'updateTask') {
      const { task_id, ...updates } = data;

      const { data: tasks } = await sb.from('ninety_day_sprint_tasks').select('*').eq('id', task_id);
      const task = tasks?.[0];
      if (!task) return Response.json({ error: 'Task not found' }, { status: 404 });

      if (task.locked && task.is_galileo_generated && !isAdmin) {
        const allowedFields = ['status', 'completed_at', 'completed_by'];
        const disallowed = Object.keys(updates).filter(k => !allowedFields.includes(k));
        if (disallowed.length > 0) {
          return Response.json({ error: 'Cannot modify Galileo-generated plan tasks' }, { status: 403 });
        }
      }

      if (updates.status === 'completed') {
        updates.completed_at = new Date().toISOString();
        updates.completed_by = profileId;
      }

      updates.updated_at = new Date().toISOString();

      const { data: updated, error } = await sb.from('ninety_day_sprint_tasks')
        .update(updates).eq('id', task_id).select().single();

      if (error) return Response.json({ error: error.message }, { status: 500 });

      // ── Check for sprint completion after marking complete ───────────────
      if (updates.status === 'completed' && task.path_id && profileId) {
        try {
          const { data: allTasks } = await sb.from('ninety_day_sprint_tasks')
            .select('status, task_type').eq('path_id', task.path_id).neq('is_deleted', true);
          const mainTasks = (allTasks || []).filter(t => t.task_type === 'main_task');
          const allDone = mainTasks.length > 0 && mainTasks.every(t => t.status === 'completed' || t.id === task_id);
          
          if (allDone) {
            // Get sprint details
            const { data: sprintRows } = await sb.from('ninety_day_sprint_paths').select('path_title, profile_id').eq('id', task.path_id).limit(1);
            const sprint = sprintRows?.[0];
            
            // Notify sprint owner
            const ownerUsers = await base44.asServiceRole.entities.User.filter({ email: user.email });
            const ownerUser = ownerUsers?.[0];
            if (ownerUser) {
              await base44.functions.invoke('notificationService', {
                action: 'createNotification',
                data: {
                  recipient_id: ownerUser.id,
                  recipient_profile_id: profileId,
                  notification_type: 'sprint_completed',
                  title: '🎉 90-Day Sprint Complete!',
                  message: `You've completed all tasks in "${sprint?.path_title || '90-Day Sprint'}". Congratulations!`,
                  action_url: '/advisory/command-center',
                  priority: 'high',
                  recipient_email: user.email,
                },
              });
              
              // Track achievement
              await base44.functions.invoke('achievementNotifications', {
                action: 'trackSprintProgress',
                data: { sprint_id: task.path_id, progress_percent: 100 },
              });
            }
          } else {
            // Track progress milestone (25, 50, 75)
            const completed = mainTasks.filter(t => t.status === 'completed').length;
            const progress = Math.round((completed / mainTasks.length) * 100);
            await base44.functions.invoke('achievementNotifications', {
              action: 'trackSprintProgress',
              data: { sprint_id: task.path_id, progress_percent: progress },
            });
          }
        } catch (notifErr) {
          console.warn('[ninetyDaySprint] Sprint completion notification failed:', notifErr.message);
        }
      }

      return Response.json({ task: updated });
    }

    // ── ASSIGN TASK ────────────────────────────────────────────────────────
    if (action === 'assignTask') {
      const { task_id, assigned_to_id, assigned_to_name, assigned_to_email, sprint_title } = data;
      const { data: tasks } = await sb.from('ninety_day_sprint_tasks').select('*').eq('id', task_id);
      if (!tasks?.[0]) return Response.json({ error: 'Task not found' }, { status: 404 });
      const task = tasks[0];

      const { data: updated, error } = await sb.from('ninety_day_sprint_tasks')
        .update({
          assigned_to_profile_id: assigned_to_id || null,
          assigned_to_name: assigned_to_name || null,
          updated_at: new Date().toISOString(),
        }).eq('id', task_id).select().single();

      if (error) return Response.json({ error: error.message }, { status: 500 });

      // ── Notify assigned user ────────────────────────────────────────────
      if (assigned_to_id && assigned_to_id !== user.id) {
        try {
          await base44.functions.invoke('notificationService', {
            action: 'createNotification',
            data: {
              recipient_id: assigned_to_id,
              sender_id: user.id,
              notification_type: 'task_assigned',
              title: 'Sprint Task Assigned to You',
              message: `"${task.title}" has been assigned to you${sprint_title ? ` in the "${sprint_title}" sprint` : ''}.`,
              related_entity_type: 'SprintTask',
              related_entity_id: task_id,
              action_url: '/advisory/command-center',
              priority: task.priority === 'critical' ? 'critical' : task.priority === 'high' ? 'high' : 'medium',
              recipient_email: assigned_to_email || null,
            },
          });
        } catch (notifErr) {
          console.warn('[ninetyDaySprint] Task assignment notification failed:', notifErr.message);
        }
      }

      return Response.json({ task: updated });
    }

    // ── ADD SUBTASK ────────────────────────────────────────────────────────
    if (action === 'addSubtask') {
      let businessId;
      try { businessId = await getActiveBusinessId(); }
      catch (bizErr) { return businessContextError(bizErr); }

      const now = new Date().toISOString();
      const { data: subtask, error } = await sb.from('ninety_day_sprint_tasks').insert({
        path_id: data.sprint_id,
        parent_task_id: data.parent_task_id,
        title: data.title,
        task_type: 'subtask',
        month_number: data.month_number || null,
        week_number: data.week_number || null,
        is_user_created: true,
        locked: false,
        is_galileo_generated: false,
        status: 'not_started',
        sort_order: data.sort_order || 0,
        description: '',
        priority: 'medium',
        ease: 'medium',
        impact: 'medium',
        profile_id: profileId,
        business_id: businessId,
        created_by: profileId,
        created_at: now,
        updated_at: now,
      }).select().single();

      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ task: subtask });
    }

    // ── DELETE SUBTASK ─────────────────────────────────────────────────────
    if (action === 'deleteSubtask') {
      const { task_id } = data;
      const { data: tasks } = await sb.from('ninety_day_sprint_tasks').select('*').eq('id', task_id);
      const task = tasks?.[0];
      if (!task) return Response.json({ error: 'Task not found' }, { status: 404 });

      if (task.task_type !== 'subtask') {
        return Response.json({ error: 'Cannot delete main tasks' }, { status: 400 });
      }
      if (task.locked && task.is_galileo_generated && !isAdmin) {
        return Response.json({ error: 'This action is locked.' }, { status: 403 });
      }
      if (task.created_by !== profileId && !isAdmin) {
        return Response.json({ error: 'You can only delete your own subtasks' }, { status: 403 });
      }

      await sb.from('ninety_day_sprint_tasks').update({
        is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: profileId,
        updated_at: new Date().toISOString(),
      }).eq('id', task_id);

      return Response.json({ success: true });
    }

    // ── ADD NOTE ───────────────────────────────────────────────────────────
    if (action === 'addNote') {
      if (!data.note_text?.trim()) {
        return Response.json({ error: 'Note text is required' }, { status: 400 });
      }

      const note = await base44.entities.SprintTaskNote.create({
        task_id: data.task_id,
        sprint_id: data.sprint_id,
        note_text: data.note_text.trim(),
        created_by_name: user.full_name || user.email,
      });
      return Response.json({ note });
    }

    // ── DELETE NOTE ────────────────────────────────────────────────────────
    if (action === 'deleteNote') {
      const { note_id } = data;
      const notes = await base44.entities.SprintTaskNote.filter({ id: note_id });
      if (!notes[0]) return Response.json({ error: 'Note not found' }, { status: 404 });

      const note = notes[0];
      if (note.created_by_id !== user.id && !isAdmin) {
        return Response.json({ error: 'You can only delete your own notes' }, { status: 403 });
      }

      const now = new Date().toISOString();
      await base44.asServiceRole.entities.SprintTaskNote.update(note_id, {
        is_deleted: true, deleted_at: now, deleted_by: user.id,
      });

      return Response.json({ success: true });
    }

    // ── ATTACH DOCUMENT ────────────────────────────────────────────────────
    if (action === 'attachDocument') {
      const { task_id, sprint_id, document_id, document_name } = data;

      const existing = await base44.entities.SprintTaskDocument.filter({ task_id, document_id });
      if (existing?.length > 0) {
        return Response.json({ attachment: existing[0], note: 'Already attached' });
      }

      const attachment = await base44.entities.SprintTaskDocument.create({
        task_id, sprint_id, document_id,
        document_name: document_name || 'Attached document',
        attached_by: user.full_name || user.email,
      });
      return Response.json({ attachment });
    }

    // ── DETACH DOCUMENT ────────────────────────────────────────────────────
    if (action === 'detachDocument') {
      const { attachment_id } = data;
      await base44.asServiceRole.entities.SprintTaskDocument.delete(attachment_id);
      return Response.json({ success: true });
    }

    // ── SET REMINDER ───────────────────────────────────────────────────────
    if (action === 'setReminder') {
      const reminder = await base44.entities.SprintReminder.create({
        sprint_id: data.sprint_id,
        task_id: data.task_id || null,
        reminder_type: data.reminder_type || 'weekly',
        reminder_datetime: data.reminder_datetime || null,
        email: user.email,
        status: 'scheduled',
      });
      return Response.json({ reminder, note: 'Reminder saved.' });
    }

    // ── GET REMINDERS ──────────────────────────────────────────────────────
    if (action === 'getReminders') {
      const reminders = await base44.entities.SprintReminder.filter(
        { sprint_id: data.sprint_id, status: 'scheduled' }, '-created_date', 50
      );
      return Response.json({ reminders: reminders || [] });
    }

    // ── GET TEAM MEMBERS ───────────────────────────────────────────────────
    if (action === 'getTeamMembers') {
      const allUsers = await base44.asServiceRole.entities.User.list('-created_date', 200);
      const members = (allUsers || []).map(u => ({
        id: u.id, full_name: u.full_name || u.email?.split('@')[0] || 'Unknown',
        email: u.email, role: u.role || 'user',
      }));
      return Response.json({ members });
    }

    // ── NEXT BEST ACTION ───────────────────────────────────────────────────
    if (action === 'getNextBestAction') {
      if (!profileId) return Response.json({ action: null });

      // Phase 6.9 — scope the sprint to the ACTIVE business before selecting its
      // next action; a profile-wide pick would surface another business's work.
      let nbaBusinessId;
      try {
        nbaBusinessId = await getActiveBusinessId();
      } catch (bizErr) { return businessContextError(bizErr); }
      if (!nbaBusinessId) return Response.json({ action: null });

      const { data: sprints } = await sb
        .from('ninety_day_sprint_paths')
        .select('id')
        .eq('profile_id', profileId)
        .eq('business_id', nbaBusinessId)
        .eq('is_active', true)
        .limit(1);

      if (!sprints?.[0]) return Response.json({ action: null });

      const { data: tasks } = await sb
        .from('ninety_day_sprint_tasks')
        .select('*')
        .eq('path_id', sprints[0].id)
        .eq('task_type', 'main_task')
        .neq('status', 'completed')
        .neq('is_deleted', true)
        .order('sort_order', { ascending: true });

      if (!tasks?.length) return Response.json({ action: null });

      const impactScore = { critical: 4, high: 3, medium: 2, low: 1 };
      const easeScore = { easy: 2, medium: 1.5, advanced: 1 };

      const scored = tasks.map(t => ({
        ...t,
        _score: (impactScore[t.impact] || 2) * (easeScore[t.ease] || 1.5) / ((t.sort_order || 1)),
      }));
      scored.sort((a, b) => b._score - a._score);

      const best = scored[0];
      const whyReasons = [];
      if (best.impact === 'critical' || best.impact === 'high') whyReasons.push('High impact (' + best.impact + ')');
      if (best.ease === 'easy') whyReasons.push('Easy to implement');
      if (best.priority === 'critical' || best.priority === 'high') whyReasons.push(best.priority + ' priority');
      whyReasons.push('Week ' + best.week_number + ' in sprint timeline');
      best.why_next = whyReasons.join('. ') + '.';
      return Response.json({ action: best });
    }

    // ── GENERATE PDF ───────────────────────────────────────────────────────
    if (action === 'generatePDF') {
      const { sprint_id } = data;
      const { data: sprints } = await sb.from('ninety_day_sprint_paths').select('*').eq('id', sprint_id);
      const s = sprints?.[0];
      if (!s) return Response.json({ error: 'Sprint not found' }, { status: 404 });

      const { data: tasks } = await sb
        .from('ninety_day_sprint_tasks')
        .select('*')
        .eq('path_id', sprint_id)
        .neq('is_deleted', true)
        .order('sort_order', { ascending: true });

      const mainTasks = (tasks || []).filter(t => t.task_type === 'main_task');
      const completed = mainTasks.filter(t => t.status === 'completed').length;
      const total = mainTasks.length;

      const monthGroups = [1, 2, 3].map(m => ({
        month: m,
        tasks: mainTasks.filter(t => t.month_number === m),
      }));

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        body { font-family: 'Inter', sans-serif; background: #0a0a0a; color: #e5e5e5; padding: 40px; }
        h1 { color: #d4a34b; font-size: 24px; margin-bottom: 4px; }
        h2 { font-size: 16px; color: #d4a34b; margin-top: 32px; }
        .subtitle { color: #888; font-size: 13px; margin-bottom: 24px; }
        .card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 12px; padding: 20px; margin-bottom: 16px; }
        .stat { font-size: 12px; color: #888; } .stat strong { color: #d4a34b; }
        .task { background: #111; border: 1px solid #222; border-radius: 8px; padding: 12px; margin-bottom: 8px; }
        .task-title { font-size: 14px; font-weight: 600; }
        .task-meta { font-size: 11px; color: #888; margin-top: 4px; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 500; }
        .badge-green { background: rgba(16,185,129,0.15); color: #10b981; border: 1px solid rgba(16,185,129,0.3); }
        .badge-amber { background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid rgba(245,158,11,0.3); }
        .badge-blue { background: rgba(59,130,246,0.15); color: #3b82f6; border: 1px solid rgba(59,130,246,0.3); }
        .footer { margin-top: 40px; text-align: center; color: #555; font-size: 10px; border-top: 1px solid #222; padding-top: 16px; }
      </style></head><body>
        <h1>V.I.S.I.O.N. Platform &mdash; 90-Day Sprint</h1>
        <p class="subtitle">IQ&trade; Impact Quotient | Generated by Galileo</p>
        <div class="card">
          <p class="stat"><strong>Path:</strong> ${s.path_title}</p>
          <p class="stat"><strong>Goal:</strong> ${s.path_goal}</p>
          <p class="stat"><strong>Progress:</strong> ${completed}/${total} tasks (${s.progress_percent || 0}%)</p>
        </div>
        ${monthGroups.map(g => `
          <h2>Month ${g.month}</h2>
          ${g.tasks.map(t => `
            <div class="task">
              <div class="task-title">${t.status === 'completed' ? '&#10003; ' : ''}${t.title}</div>
              <div class="task-meta">
                Week ${t.week_number} &nbsp;|&nbsp; Due: ${t.due_date || '&mdash;'} &nbsp;|&nbsp; ${t.ease} &nbsp;|&nbsp; ${t.impact}
                <span class="badge ${t.status === 'completed' ? 'badge-green' : t.status === 'in_progress' ? 'badge-amber' : 'badge-blue'}">${(t.status || '').replace('_', ' ')}</span>
              </div>
              ${t.expected_outcome ? `<p class="task-meta">${t.expected_outcome}</p>` : ''}
            </div>
          `).join('')}
        `).join('')}
        <div class="footer">V.I.S.I.O.N. Platform | IQ&trade; Impact Quotient | Galileo AI Strategic Advisor</div>
      </body></html>`;

      return new Response(html, {
        headers: {
          'Content-Type': 'text/html',
          'Content-Disposition': 'attachment; filename="90-day-sprint.html"',
        },
      });
    }

    // ── GENERATE ICS ───────────────────────────────────────────────────────
    if (action === 'generateICS') {
      const { sprint_id, task_id } = data;

      let tasks = [];
      if (task_id) {
        const { data: t } = await sb.from('ninety_day_sprint_tasks').select('*').eq('id', task_id).neq('is_deleted', true);
        if (t?.[0]) tasks = [t[0]];
      } else if (sprint_id) {
        const { data: all } = await sb.from('ninety_day_sprint_tasks').select('*').eq('path_id', sprint_id).neq('is_deleted', true).order('sort_order');
        tasks = all || [];
      }

      if (tasks.length === 0) return Response.json({ error: 'No tasks found' }, { status: 404 });

      const icsLines = [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//VISION Platform//90-Day Sprint//EN',
      ];

      for (const t of tasks) {
        if (!t.due_date) continue;
        const dt = t.due_date.replace(/-/g, '');
        icsLines.push(
          'BEGIN:VEVENT',
          `DTSTART;VALUE=DATE:${dt}`,
          `DTEND;VALUE=DATE:${dt}`,
          `SUMMARY:${t.title}`,
          `DESCRIPTION:${t.description || ''}\\nExpected: ${t.expected_outcome || ''}\\nPriority: ${t.priority} | Ease: ${t.ease} | Impact: ${t.impact}`,
          `UID:${t.id}@vision-platform`,
          'END:VEVENT',
        );
      }

      icsLines.push('END:VCALENDAR');
      return new Response(icsLines.join('\r\n'), {
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Content-Disposition': 'attachment; filename="90-day-sprint.ics"',
        },
      });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error('[ninetyDaySprint] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ── Recommendation → Sprint Objective templates (BIE-driven) ──────────────────
// Each BIE recommendation id maps to a rich objective template. The Sprint engine
// consumes bis.engine.recommendations ONLY — these templates provide the
// strategic narrative + deterministic tasks per recommendation type. No scoring
// is invented here; priority/impact come from the recommendation metadata.
const RECOMMENDATION_OBJECTIVES = {
  profit_gap_amount: {
    label: 'Close Your Profit Gap',
    executiveSummary: 'Your margin trails best-in-class operators in your industry. This objective closes the gap between current profitability and the top-quartile benchmark, directly increasing cash flow and enterprise value.',
    businessOutcome: 'Recover the identified profit gap by lifting net margin toward best-in-class, adding it to annual earnings.',
    whyItMatters: 'Margin is the highest-leverage number in your business — every point multiplies at exit. Closing this gap compounds across both cash flow and valuation.',
    whyNow: 'Your Profit Gap assessment quantified the exact opportunity; acting now captures the value before it erodes further.',
    successMetric: 'Net margin movement toward best-in-class; dollars of annual profit recovered.',
    relatedAssessment: 'Profit Gap',
    relatedAssessmentTarget: '/assessments/profit-gap',
    recommendedOwner: 'Fractional CFO',
    expertType: 'Fractional CFO',
    expertReason: 'A CFO benchmarks margin by service line and sequences the highest-ROI margin moves.',
    completionWindow: '30–60 days',
    dependencies: ['revenue', 'profit_gap_amount'],
    tasks: [
      { title: 'Benchmark margin by service line', purpose: 'Break down margin by product/service line against industry benchmarks to find the largest leaks.', completionCriteria: 'Margin-by-line analysis complete with top 3 leak lines identified.', ease: 'easy' },
      { title: 'Identify top 3 margin levers', purpose: 'Select the three highest-impact actions (pricing, COGS, mix) to close the gap.', completionCriteria: 'Three prioritized margin levers documented with expected dollar impact.', ease: 'medium' },
      { title: 'Execute first margin quick-win', purpose: 'Implement the fastest, highest-confidence margin improvement.', completionCriteria: 'First margin change live with a measurable result.', ease: 'medium' },
      { title: 'Install monthly margin review', purpose: 'Establish a recurring margin review so gains are protected and extended.', completionCriteria: 'Monthly margin review cadence scheduled with owner and CFO.', ease: 'easy' },
    ],
  },
  value_gap_amount: {
    label: 'Close Your Value Gap',
    executiveSummary: 'Your enterprise value sits below its potential. This objective closes the gap between current valuation and the achievable valuation by strengthening transferability, growth, and risk profile.',
    businessOutcome: 'Lift enterprise value toward its potential by improving the drivers buyers reward.',
    whyItMatters: 'Enterprise value is what you ultimately capture. Every improvement to transferability and risk multiplies through your exit multiple.',
    whyNow: 'Your Value Gap assessment quantified the missed value; the levers are now known and sequenced.',
    successMetric: 'Enterprise value movement toward potential; reduction in owner-dependency risk.',
    relatedAssessment: 'Value Gap',
    relatedAssessmentTarget: '/assessments/value-gap',
    recommendedOwner: 'Exit Advisor / CEPA',
    expertType: 'Certified Exit Planning Advisor',
    expertReason: 'A CEPA sequences value-driver improvements that buyers actually reward at exit.',
    completionWindow: '45–90 days',
    dependencies: ['value_gap_amount', 'current_value'],
    tasks: [
      { title: 'Audit value drivers', purpose: 'Score each value driver (transferability, growth, risk) to find the weakest links.', completionCriteria: 'Value-driver scorecard complete with lowest 3 drivers flagged.', ease: 'easy' },
      { title: 'Assess transferability', purpose: 'Identify owner-dependency and process gaps that reduce buyer confidence.', completionCriteria: 'Transferability gaps documented with remediation notes.', ease: 'medium' },
      { title: 'Build multiple-expansion plan', purpose: 'Sequence the changes that justify a higher exit multiple.', completionCriteria: 'Multiple-expansion roadmap approved with target multiple.', ease: 'advanced' },
      { title: 'Engage exit advisor', purpose: 'Validate the value plan with a CEPA and align it to your timeline.', completionCriteria: 'Advisor engaged and value plan reviewed.', ease: 'easy' },
    ],
  },
  tax_gap_annual: {
    label: 'Implement Tax Strategies',
    executiveSummary: 'You are overpaying in taxes annually. This objective captures the identified tax gap through entity, retirement, and strategy optimization — every dollar saved drops to the bottom line.',
    businessOutcome: 'Reduce annual tax overpayment, increasing after-tax cash flow and enterprise value.',
    whyItMatters: 'Every tax dollar saved is pure profit. Tax savings also compound through your exit multiple.',
    whyNow: 'Your Tax Gap assessment identified the specific strategies and their annual value.',
    successMetric: 'Annual tax savings realized; strategies implemented and documented.',
    relatedAssessment: 'Tax Gap',
    relatedAssessmentTarget: '/assessments/tax-gap',
    recommendedOwner: 'CPA / Tax Strategist',
    expertType: 'CPA / Tax Strategist',
    expertReason: 'A tax strategist sequences entity, retirement, and PTET strategies for your situation.',
    completionWindow: '30–60 days',
    dependencies: ['tax_gap_annual'],
    tasks: [
      { title: 'Review entity structure', purpose: 'Confirm your entity structure is optimal for tax efficiency and exit.', completionCriteria: 'Entity review complete with recommended changes.', ease: 'medium' },
      { title: 'Implement top tax strategy', purpose: 'Deploy the highest-value, fastest tax strategy from your assessment.', completionCriteria: 'First strategy implemented with documented annual savings.', ease: 'medium' },
      { title: 'Build multi-year tax plan', purpose: 'Sequence remaining strategies across the year to maximize compounding.', completionCriteria: 'Multi-year tax plan documented and scheduled.', ease: 'advanced' },
      { title: 'Engage CPA for execution', purpose: 'Partner with a CPA to file and maintain the strategies.', completionCriteria: 'CPA engaged and strategies filed.', ease: 'easy' },
    ],
  },
  operations_score: {
    label: 'Improve Operations Health',
    executiveSummary: 'Your operations health score reflects owner-dependency and process gaps. This objective raises the score by systemizing operations, freeing owner time, and reducing buyer risk.',
    businessOutcome: 'Raise the operations health score, freeing owner hours and strengthening transferability.',
    whyItMatters: 'Operational strength protects your multiple and reduces the cost of owner-dependency.',
    whyNow: 'Your Operations assessment measured the score and the hours of owner time that can be freed.',
    successMetric: 'Operations health score increase; owner hours freed per week.',
    relatedAssessment: 'Operations Gap',
    relatedAssessmentTarget: '/assessments/operations-gap',
    recommendedOwner: 'Operations Consultant',
    expertType: 'Operations Consultant',
    expertReason: 'An operations consultant systemizes processes and reduces owner-dependency.',
    completionWindow: '45–90 days',
    dependencies: ['operations_score'],
    tasks: [
      { title: 'Document core SOPs', purpose: 'Capture the top owner-dependent processes as repeatable systems.', completionCriteria: 'Top 5 SOPs documented and accessible.', ease: 'medium' },
      { title: 'Audit owner time', purpose: 'Track where owner hours go to find delegation opportunities.', completionCriteria: 'Owner time audit complete with delegation targets.', ease: 'easy' },
      { title: 'Select systems to automate', purpose: 'Choose the highest-leverage processes to systemize or automate.', completionCriteria: 'Systems shortlist approved with ROI estimates.', ease: 'medium' },
      { title: 'Build delegation plan', purpose: 'Sequence ownership transfer so the business runs without the owner.', completionCriteria: 'Delegation plan with owners and deadlines.', ease: 'medium' },
    ],
  },
  freedom_score: {
    label: 'Accelerate Freedom',
    executiveSummary: 'Your freedom score measures how close you are to operating without the business depending on you. This objective accelerates that path by freeing time and building recurring revenue.',
    businessOutcome: 'Increase the freedom score and hours freed per week.',
    whyItMatters: 'Freedom is the ultimate return on ownership — it protects your time and your exit.',
    whyNow: 'Your Freedom assessment quantified the gap and the hours available to recover.',
    successMetric: 'Freedom score increase; hours freed per week.',
    relatedAssessment: 'Freedom',
    relatedAssessmentTarget: '/assessments/freedom',
    recommendedOwner: 'Operations Consultant',
    expertType: 'Operations Consultant',
    expertReason: 'An operations consultant builds the systems that convert owner hours into freedom.',
    completionWindow: '60–90 days',
    dependencies: ['freedom_score', 'hours_freed_per_week'],
    tasks: [
      { title: 'Baseline time and freedom', purpose: 'Establish the current freedom score and weekly owner hours.', completionCriteria: 'Baseline documented with target freedom score.', ease: 'easy' },
      { title: 'Automate recurring work', purpose: 'Identify and automate the repetitive tasks consuming owner time.', completionCriteria: 'Top 3 automations live or scoped.', ease: 'medium' },
      { title: 'Strengthen recurring revenue', purpose: 'Shift revenue mix toward recurring to stabilize freedom.', completionCriteria: 'Recurring revenue plan with targets.', ease: 'advanced' },
      { title: 'Build freedom roadmap', purpose: 'Sequence the path to the target freedom score over the sprint.', completionCriteria: 'Freedom roadmap approved.', ease: 'medium' },
    ],
  },
  recast_valuation_increase: {
    label: 'Recast EBITDA',
    executiveSummary: 'Your EBITDA understates the true earnings of the business. This objective normalizes EBITDA by adding back one-time and personal expenses, directly lifting your valuation.',
    businessOutcome: 'Increase normalized EBITDA and the resulting enterprise valuation.',
    whyItMatters: 'Recast EBITDA is the number buyers actually use. Every add-back multiplies through your exit multiple.',
    whyNow: 'Your Recast EBITDA assessment identified the add-backs and their valuation impact.',
    successMetric: 'Normalized EBITDA increase; valuation lift at current multiple.',
    relatedAssessment: 'Recast EBITDA',
    relatedAssessmentTarget: '/assessments/recast-ebitda',
    recommendedOwner: 'Fractional CFO',
    expertType: 'Fractional CFO',
    expertReason: 'A CFO normalizes EBITDA defensibly and quantifies the valuation impact.',
    completionWindow: '30–45 days',
    dependencies: ['recast_add_backs'],
    tasks: [
      { title: 'Normalize add-backs', purpose: 'Identify and document all legitimate EBITDA add-backs.', completionCriteria: 'Add-back schedule complete and defensible.', ease: 'medium' },
      { title: 'Audit one-time expenses', purpose: 'Separate true one-time costs from recurring operations.', completionCriteria: 'One-time expenses isolated and documented.', ease: 'medium' },
      { title: 'Produce recast financials', purpose: 'Generate normalized financials that reflect true earnings.', completionCriteria: 'Recast financials produced and reviewed.', ease: 'advanced' },
      { title: 'Quantify valuation impact', purpose: 'Apply your multiple to the recast EBITDA to show the value lift.', completionCriteria: 'Valuation impact documented.', ease: 'easy' },
    ],
  },
  __default: {
    label: 'Pursue This Opportunity',
    executiveSummary: 'Galileo identified a measurable opportunity for your business. This objective captures it through a focused 90-day execution plan.',
    businessOutcome: 'Capture the identified opportunity value through structured execution.',
    whyItMatters: 'This opportunity was surfaced from your business intelligence and represents measurable, closeable value.',
    whyNow: 'Your intelligence profile quantified this opportunity; acting now secures the value.',
    successMetric: 'Opportunity value captured; related metric improvement.',
    relatedAssessment: null,
    relatedAssessmentTarget: null,
    recommendedOwner: 'Business Advisor',
    expertType: 'Business Advisor',
    expertReason: 'An advisor sequences the execution to capture the opportunity reliably.',
    completionWindow: '30–90 days',
    dependencies: [],
    tasks: [
      { title: 'Baseline the opportunity', purpose: 'Document the current state and the target for this opportunity.', completionCriteria: 'Baseline and target documented.', ease: 'easy' },
      { title: 'Define the execution plan', purpose: 'Sequence the steps to capture the opportunity.', completionCriteria: 'Execution plan approved.', ease: 'medium' },
      { title: 'Execute first step', purpose: 'Implement the first, highest-confidence action.', completionCriteria: 'First step complete with a measurable result.', ease: 'medium' },
      { title: 'Review and adjust', purpose: 'Measure progress and refine the plan.', completionCriteria: 'Progress reviewed and plan updated.', ease: 'easy' },
    ],
  },
};

// ── Fallback task generator when LLM fails ───────────────────────────────────
function generateFallbackTasks(sprintTitle, sprintGoal, startStr) {
  const start = new Date(startStr);
  function offsetDate(days) {
    const d = new Date(start);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }

  return [
    // Month 1 — Foundation
    { title: `Baseline Audit: ${sprintTitle}`, description: `Assess current state for "${sprintGoal}". Document all relevant metrics, gaps, and dependencies. (Generated based on available information)`, month_number: 1, week_number: 1, due_date: offsetDate(7), priority: 'critical', ease: 'easy', impact: 'high', expected_outcome: 'Clear baseline documented for the sprint path', sort_order: 1 },
    { title: 'Identify Quick Wins', description: 'Find 3-5 fast, high-impact actions that can be completed in 2 weeks with minimal resources. (Generated based on available information)', month_number: 1, week_number: 2, due_date: offsetDate(14), priority: 'high', ease: 'easy', impact: 'high', expected_outcome: 'Quick wins identified and prioritized', sort_order: 2 },
    { title: 'Engage Key Stakeholders', description: 'Brief key team members, advisors, or partners on the sprint focus and their roles. (Generated based on available information)', month_number: 1, week_number: 2, due_date: offsetDate(14), priority: 'high', ease: 'easy', impact: 'medium', expected_outcome: 'Alignment secured from all key stakeholders', sort_order: 3 },
    { title: 'Execute Quick Win #1', description: 'Implement first identified quick win from the baseline audit. Track results. (Generated based on available information)', month_number: 1, week_number: 3, due_date: offsetDate(21), priority: 'high', ease: 'easy', impact: 'high', expected_outcome: 'First measurable result from sprint path', sort_order: 4 },
    { title: 'Month 1 Strategy Review', description: 'Review progress from foundation phase. Adjust priorities for Month 2. Document lessons. (Generated based on available information)', month_number: 1, week_number: 4, due_date: offsetDate(28), priority: 'medium', ease: 'easy', impact: 'medium', expected_outcome: 'Clear action plan for Month 2 execution', sort_order: 5 },
    // Month 2 — Execution
    { title: 'Core Implementation: Phase 1', description: 'Begin primary implementation activities for the sprint goal. Focus on highest-impact items first. (Generated based on available information)', month_number: 2, week_number: 5, due_date: offsetDate(35), priority: 'critical', ease: 'medium', impact: 'critical', expected_outcome: 'Primary sprint objective 25% complete', sort_order: 6 },
    { title: 'Systems & Process Update', description: 'Update relevant systems, processes, or workflows to support the sprint objective. (Generated based on available information)', month_number: 2, week_number: 6, due_date: offsetDate(42), priority: 'high', ease: 'medium', impact: 'high', expected_outcome: 'Operational infrastructure aligned with sprint goal', sort_order: 7 },
    { title: 'Mid-Sprint Progress Check', description: 'Evaluate KPIs at the 45-day mark. Identify blockers and adjust approach if needed. (Generated based on available information)', month_number: 2, week_number: 6, due_date: offsetDate(45), priority: 'high', ease: 'easy', impact: 'high', expected_outcome: 'Sprint is on track or corrective action identified', sort_order: 8 },
    { title: 'Core Implementation: Phase 2', description: 'Continue and deepen primary implementation. Resolve any blockers from Phase 1. (Generated based on available information)', month_number: 2, week_number: 7, due_date: offsetDate(49), priority: 'high', ease: 'medium', impact: 'high', expected_outcome: 'Sprint objective 60% complete', sort_order: 9 },
    { title: 'Team Accountability Check-in', description: 'Review team assignments, deadlines, and remove blockers. Celebrate early wins. (Generated based on available information)', month_number: 2, week_number: 8, due_date: offsetDate(56), priority: 'medium', ease: 'easy', impact: 'medium', expected_outcome: 'Team fully aligned and motivated for final push', sort_order: 10 },
    // Month 3 — Optimization
    { title: 'Optimization & Refinement', description: 'Based on Month 1-2 results, optimize the approach and address any remaining gaps. (Generated based on available information)', month_number: 3, week_number: 9, due_date: offsetDate(63), priority: 'high', ease: 'medium', impact: 'high', expected_outcome: 'Refined execution delivering measurable improvements', sort_order: 11 },
    { title: 'Scale What Works', description: 'Identify what has worked best and scale those activities for maximum impact. (Generated based on available information)', month_number: 3, week_number: 10, due_date: offsetDate(70), priority: 'high', ease: 'medium', impact: 'critical', expected_outcome: 'Best practices scaled for maximum ROI', sort_order: 12 },
    { title: 'Document Results & Systems', description: 'Document all processes, results, and learnings for long-term sustainability. (Generated based on available information)', month_number: 3, week_number: 11, due_date: offsetDate(77), priority: 'medium', ease: 'easy', impact: 'high', expected_outcome: 'Sprint outcomes documented and systematized', sort_order: 13 },
    { title: '90-Day Sprint Final Review', description: 'Complete final review: measure all KPIs against original goals, present findings, plan next sprint. (Generated based on available information)', month_number: 3, week_number: 12, due_date: offsetDate(90), priority: 'critical', ease: 'easy', impact: 'critical', expected_outcome: 'Sprint results measured, next steps identified, momentum maintained', sort_order: 14 },
  ];
}

function fallbackPaths() {
  return [
    {
      id: 'cash_flow', title: 'Increase Cash Flow',
      goal: 'Improve owner take-home, cash clarity, and short-term financial breathing room.',
      why_it_matters: 'Cash flow is the lifeblood of your business.',
      expected_outcome: 'Increase monthly free cash flow and reduce financial leakage.',
      ease: 'easy', estimated_impact: '$15K–$50K over 90 days', confidence: 82,
      recommended_first_move: 'Complete a 30-day cash flow audit.',
      summary: 'Focus on immediate cash flow wins: audit expenses, optimize collections, renegotiate vendor terms.',
    },
    {
      id: 'enterprise_value', title: 'Increase Enterprise Value',
      goal: 'Improve EBITDA, transferability, operational scalability.',
      why_it_matters: 'Enterprise value determines your exit multiple.',
      expected_outcome: 'Increase potential enterprise value and reduce owner dependency.',
      ease: 'medium', estimated_impact: '$50K–$200K improvement', confidence: 78,
      recommended_first_move: 'Complete EBITDA normalization analysis.',
      summary: 'Systematize operations, document SOPs, normalize EBITDA, reduce owner dependency.',
    },
    {
      id: 'tax_risk', title: 'Reduce Tax & Risk Exposure',
      goal: 'Reduce preventable tax leakage, legal risk, and protection gaps.',
      why_it_matters: 'Every dollar saved in taxes is a dollar added to your bottom line.',
      expected_outcome: 'Keep more of what the business earns, strengthen protection.',
      ease: 'medium', estimated_impact: '$10K–$40K in savings', confidence: 85,
      recommended_first_move: 'Review entity structure with CPA.',
      summary: 'Review entity structure, optimize retirement, implement PTET, review insurance.',
    },
  ];
}