/**
 * decisionIntelligenceService — Phase D
 *
 * Backend service for the Decision Intelligence Foundation.
 *
 * All operations are business-scoped and backend-mediated.
 * Supabase is the sole system of record.
 *
 * AI proposes. Humans decide. Existing systems execute.
 *
 * Supported actions:
 *   createDecision, getDecision, listDecisions, updateDecision,
 *   finalizeDecision, supersedeDecision,
 *   buildDecisionContext, challengeDecision,
 *   generateMemoryCandidate, getDecisionLedger
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { buildBusinessIntelligenceContract } from '../../shared/intelligenceContract/businessIntelligenceContract.ts';
import { resolveAuthCtx } from '../../shared/valuationEngine/valuationAuth.ts';
import {
  buildDecisionContext,
  assessDecisionReadiness,
  buildChallengePrompt,
  processChallengeResponse,
  shouldGenerateMemoryCandidate,
  generateMemoryCandidateFromDecision,
  determineExecutionRoutes,
  markRoutesRouted,
  toClientSafeDecision,
  DECISION_TYPES,
  DECISION_STATUSES,
  // Phase D.1 — Outcome Intelligence
  getOutcomeReviewState,
  buildDecisionOutcomeContext,
  assessOutcomeReadiness,
  buildOutcomeAnalysisPrompt,
  processOutcomeAnalysisResponse,
  getOutcomeAnalysisSchema,
  shouldGenerateOutcomeMemoryCandidate,
  generateOutcomeMemoryCandidates,
  toClientSafeOutcomeReview,
} from '../../shared/decisionIntelligence/index.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // ── Certified identity resolution + business authorization ──────────
    // Reuses valuationAuth.ts (the certified helper used by valuationService,
    // verificationQueueService, etc.). Resolves Base44 auth → profiles.id via
    // base44_user_id (preferred) or email. Never accepts a profile ID from the
    // frontend. Service-role bypasses RLS; every action explicitly authorizes.
    //
    // Identity chain: base44.auth.me() → profiles.base44_user_id → profiles.id
    // Business access: business_owners + business_entities.assigned_advisor_id
    //   (NOT advisor_assignments — certified pattern uses assigned_advisor_id)
    let ctx;
    try {
      ctx = await resolveAuthCtx(base44);
    } catch (e: any) {
      const status = e?.status || 401;
      return Response.json({ error: e?.message || 'Unauthorized' }, { status });
    }
    const { sb, profile, profileId, isSuperAdmin } = ctx;
    const isAdvisorOrAdmin = ['advisor', 'admin', 'super_admin'].includes(profile.app_role);

    // ── Decision-strict business authorization ────────────────────────────
    // Decision Intelligence backend authorization MUST exactly match the
    // RLS contract (business_decisions_select / _insert / _update). The RLS
    // contract recognizes ONLY:
    //   1. super_admin bypass
    //   2. business_owners relationship
    //   3. business_entities.assigned_advisor_id relationship
    //
    // It does NOT recognize profiles.primary_business_id by itself. Because
    // this service writes using the Supabase service role (which bypasses
    // RLS), the backend must NOT be more permissive than the RLS contract.
    // Therefore we intentionally do NOT reuse requireBusinessAccess() here —
    // that helper includes a primary_business_id fallback used by valuation
    // that is broader than the Decision RLS contract.
    //
    // This is the smallest safe strict-access layer: it reuses the certified
    // identity resolution (resolveAuthCtx) but applies Decision-specific
    // business-access semantics.
    const authorizeBusiness = async (businessId: string): Promise<boolean> => {
      if (isSuperAdmin) return true;
      if (!businessId) return false;
      // business_owners with active end_date (matches RLS: end_date IS NULL OR end_date > NOW())
      const { data: bo } = await sb
        .from('business_owners')
        .select('business_id, end_date')
        .eq('business_id', businessId)
        .eq('profile_id', profileId)
        .maybeSingle();
      if (bo && (!bo.end_date || new Date(bo.end_date) > new Date())) return true;
      // business_entities.assigned_advisor_id
      const { data: be } = await sb
        .from('business_entities')
        .select('id')
        .eq('id', businessId)
        .eq('assigned_advisor_id', profileId)
        .maybeSingle();
      if (be) return true;
      return false;
    };

    const body = await req.json().catch(() => ({}));
    const { action, data } = body;

    // ── Generate human-readable decision ID ──────────────────────────────
    function generateDecisionId(businessId: string): string {
      const timestamp = Date.now().toString(36);
      const random = Math.random().toString(36).substring(2, 8);
      return `dec-${businessId.substring(0, 8)}-${timestamp}${random}`;
    }

    // ── Map DB row to BusinessDecision ────────────────────────────────────
    function mapRowToDecision(row: any): any {
      if (!row) return null;
      return {
        decision_id: row.decision_id,
        business_id: row.business_id,
        title: row.title,
        decision_type: row.decision_type,
        decision_status: row.decision_status,
        question: row.question || '',
        context_summary: row.context_summary || '',
        created_by_profile_id: row.created_by_profile_id,
        decision_owner_profile_id: row.decision_owner_profile_id,
        created_at: row.created_at,
        target_decision_date: row.target_decision_date,
        decided_at: row.decided_at,
        importance: row.importance,
        risk_level: row.risk_level,
        meeting_context_id: row.meeting_context_id,
        options: row.options || [],
        assumptions: row.assumptions || [],
        evidence: row.evidence || [],
        risks: row.risks || [],
        unknowns: row.unknowns || [],
        recommendation: row.recommendation,
        selected_option_id: row.selected_option_id,
        decision_reason: row.decision_reason || '',
        decided_by_profile_id: row.decided_by_profile_id,
        expected_outcomes: row.expected_outcomes || [],
        actual_outcomes: row.actual_outcomes || [],
        outcome_status: row.outcome_status,
        outcome_review_date: row.outcome_review_date,
        outcome_reviewed_at: row.outcome_reviewed_at,
        outcome_notes: row.outcome_notes || '',
        source_contract_version: row.source_contract_version,
        source_context_snapshot: row.source_context_snapshot,
        visibility: row.visibility,
        client_visible: row.client_visible,
        supersedes_decision_id: row.supersedes_decision_id,
        superseded_by_decision_id: row.superseded_by_decision_id,
        execution_routes: row.execution_routes || [],
        updated_at: row.updated_at,
      };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CRUD
    // ═══════════════════════════════════════════════════════════════════════

    // ── createDecision ───────────────────────────────────────────────────
    if (action === 'createDecision') {
      const { business_id, title, decision_type, question, importance, risk_level, target_decision_date, meeting_context_id, visibility } = data || {};
      if (!business_id || !title) {
        return Response.json({ error: 'business_id and title required' }, { status: 400 });
      }
      if (!await authorizeBusiness(business_id)) {
        return Response.json({ error: 'Forbidden: not authorized for this business' }, { status: 403 });
      }
      if (!isAdvisorOrAdmin) {
        return Response.json({ error: 'Forbidden: advisor or admin required to create decisions' }, { status: 403 });
      }
      if (decision_type && !DECISION_TYPES.includes(decision_type)) {
        return Response.json({ error: `Invalid decision_type. Must be one of: ${DECISION_TYPES.join(', ')}` }, { status: 400 });
      }

      const decisionId = generateDecisionId(business_id);
      const now = new Date().toISOString();

      const insertData = {
        decision_id: decisionId,
        business_id,
        title,
        decision_type: decision_type || 'strategic',
        decision_status: 'draft',
        question: question || '',
        context_summary: '',
        created_by_profile_id: profile.id,
        decision_owner_profile_id: profile.id,
        created_at: now,
        target_decision_date: target_decision_date || null,
        importance: importance || 'strategic',
        risk_level: risk_level || 'medium',
        meeting_context_id: meeting_context_id || null,
        visibility: visibility || 'advisor_internal',
        client_visible: (visibility || 'advisor_internal') === 'client_safe',
      };

      const { data: inserted, error } = await sb.from('business_decisions')
        .insert(insertData).select('*').single();
      if (error) throw new Error(error.message);

      return Response.json({ decision: mapRowToDecision(inserted) });
    }

    // ── getDecision ──────────────────────────────────────────────────────
    if (action === 'getDecision') {
      const { decision_id, client_safe } = data || {};
      if (!decision_id) return Response.json({ error: 'decision_id required' }, { status: 400 });

      const { data: row, error } = await sb.from('business_decisions')
        .select('*').eq('decision_id', decision_id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) return Response.json({ error: 'Decision not found' }, { status: 404 });

      if (!await authorizeBusiness(row.business_id)) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }

      const decision = mapRowToDecision(row);
      // Owners always receive client-safe filtering; advisors/admins see full record.
      // Backend enforces the same visibility rules as RLS — never relies on the
      // frontend to hide advisor_internal fields.
      if (!isAdvisorOrAdmin) {
        // Owner — enforce visibility before returning
        if (!decision.client_visible && decision.visibility !== 'client_safe') {
          return Response.json({ error: 'Forbidden: not authorized to view this decision' }, { status: 403 });
        }
        return Response.json({ decision: toClientSafeDecision(decision) });
      }
      return Response.json({ decision });
    }

    // ── listDecisions ─────────────────────────────────────────────────────
    if (action === 'listDecisions') {
      const { business_id, status, decision_type, client_safe } = data || {};
      if (!business_id) return Response.json({ error: 'business_id required' }, { status: 400 });
      if (!await authorizeBusiness(business_id)) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }

      let query = sb.from('business_decisions')
        .select('*').eq('business_id', business_id)
        .order('created_at', { ascending: false }).limit(100);

      if (status) query = query.eq('decision_status', status);
      if (decision_type) query = query.eq('decision_type', decision_type);

      const { data: rows, error } = await query;
      if (error) throw new Error(error.message);

      let decisions = (rows || []).map(mapRowToDecision);
      // Owners always receive client-safe filtering; advisors/admins see all.
      // Backend enforces the same visibility rules as RLS.
      if (!isAdvisorOrAdmin) {
        decisions = decisions
          .filter((d) => d.client_visible || d.visibility === 'client_safe')
          .map(toClientSafeDecision);
      }
      return Response.json({ decisions });
    }

    // ── updateDecision ───────────────────────────────────────────────────
    if (action === 'updateDecision') {
      const { decision_id, updates } = data || {};
      if (!decision_id) return Response.json({ error: 'decision_id required' }, { status: 400 });
      if (!updates || typeof updates !== 'object') return Response.json({ error: 'updates object required' }, { status: 400 });

      const { data: existing, error: fetchErr } = await sb.from('business_decisions')
        .select('*').eq('decision_id', decision_id).maybeSingle();
      if (fetchErr) throw new Error(fetchErr.message);
      if (!existing) return Response.json({ error: 'Decision not found' }, { status: 404 });
      if (!await authorizeBusiness(existing.business_id)) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }

      // Only allow updates to non-finalized decisions
      if (existing.decision_status === 'decided' || existing.decision_status === 'superseded') {
        return Response.json({ error: 'Cannot update a finalized or superseded decision' }, { status: 409 });
      }

      // Whitelist updatable fields
      const allowedFields = [
        'title', 'decision_type', 'decision_status', 'question', 'context_summary',
        'target_decision_date', 'importance', 'risk_level', 'meeting_context_id',
        'options', 'assumptions', 'evidence', 'risks', 'unknowns',
        'recommendation', 'expected_outcomes', 'visibility', 'client_visible',
        'outcome_review_date',
      ];
      const updateData: Record<string, unknown> = {};
      for (const key of allowedFields) {
        if (key in updates) {
          // Validate decision_type and decision_status
          if (key === 'decision_type' && updates[key] && !DECISION_TYPES.includes(updates[key])) continue;
          if (key === 'decision_status' && updates[key] && !DECISION_STATUSES.includes(updates[key])) continue;
          updateData[key] = updates[key];
        }
      }

      if (Object.keys(updateData).length === 0) {
        return Response.json({ error: 'No valid fields to update' }, { status: 400 });
      }

      // Sync client_visible with visibility
      if ('visibility' in updateData) {
        updateData.client_visible = updateData.visibility === 'client_safe';
      }

      const { data: updated, error } = await sb.from('business_decisions')
        .update(updateData).eq('decision_id', decision_id).select('*').single();
      if (error) throw new Error(error.message);

      return Response.json({ decision: mapRowToDecision(updated) });
    }

    // ── finalizeDecision (DECIDE — human only) ──────────────────────────
    if (action === 'finalizeDecision') {
      const { decision_id, selected_option_id, decision_reason } = data || {};
      if (!decision_id) return Response.json({ error: 'decision_id required' }, { status: 400 });
      if (!selected_option_id) return Response.json({ error: 'selected_option_id required' }, { status: 400 });
      if (!decision_reason || decision_reason.trim() === '') {
        return Response.json({ error: 'decision_reason required to finalize' }, { status: 400 });
      }

      const { data: existing, error: fetchErr } = await sb.from('business_decisions')
        .select('*').eq('decision_id', decision_id).maybeSingle();
      if (fetchErr) throw new Error(fetchErr.message);
      if (!existing) return Response.json({ error: 'Decision not found' }, { status: 404 });
      if (!await authorizeBusiness(existing.business_id)) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }

      // Only advisors/admins can finalize — AI/Galileo may NEVER call this path.
      // This is the human decision authority gate (Constitution Article XV).
      if (!isAdvisorOrAdmin) {
        return Response.json({ error: 'Forbidden: only advisors and admins can finalize decisions' }, { status: 403 });
      }

      // Cannot finalize an already-decided decision
      if (existing.decision_status === 'decided') {
        return Response.json({ error: 'Decision already finalized' }, { status: 409 });
      }

      // Verify selected option exists
      const options = existing.options || [];
      const selectedOption = options.find((o: any) => o.option_id === selected_option_id);
      if (!selectedOption) {
        return Response.json({ error: 'Selected option not found in decision options' }, { status: 400 });
      }

      const now = new Date().toISOString();

      // Determine execution routes
      const decisionObj = mapRowToDecision(existing);
      const routes = determineExecutionRoutes(decisionObj);
      const routedRoutes = markRoutesRouted(routes, profile.id);

      // Capture decision-time evidence (immutability — Article XII)
      const decisionTimeEvidence = {
        options: existing.options,
        assumptions: existing.assumptions,
        evidence: existing.evidence,
        risks: existing.risks,
        recommendation: existing.recommendation,
        source_contract_version: existing.source_contract_version,
        captured_at: now,
      };

      const updateData = {
        decision_status: 'decided',
        selected_option_id,
        decision_reason,
        decided_at: now,
        decided_by_profile_id: profile.id,
        execution_routes: routedRoutes,
        // Preserve decision-time context immutably
        source_context_snapshot: existing.source_context_snapshot || decisionTimeEvidence,
      };

      const { data: updated, error } = await sb.from('business_decisions')
        .update(updateData).eq('decision_id', decision_id).select('*').single();
      if (error) throw new Error(error.message);

      const finalizedDecision = mapRowToDecision(updated);

      // ── Generate Business Memory candidate (if durable) ───────────────
      let memoryCandidate = null;
      try {
        if (shouldGenerateMemoryCandidate(finalizedDecision)) {
          memoryCandidate = generateMemoryCandidateFromDecision(finalizedDecision);
          // Note: The candidate is returned to the caller — it is NOT
          // automatically persisted. The advisor must confirm it through
          // the existing Business Memory governance workflow.
        }
      } catch (memErr) {
        console.error('[finalizeDecision] Memory candidate generation failed (non-fatal):', memErr?.message);
      }

      return Response.json({
        decision: finalizedDecision,
        memory_candidate: memoryCandidate,
        execution_routes: routedRoutes,
      });
    }

    // ── supersedeDecision ────────────────────────────────────────────────
    if (action === 'supersedeDecision') {
      const { original_decision_id, new_decision_id, reason } = data || {};
      if (!original_decision_id || !new_decision_id) {
        return Response.json({ error: 'original_decision_id and new_decision_id required' }, { status: 400 });
      }

      const { data: original, error: origErr } = await sb.from('business_decisions')
        .select('*').eq('decision_id', original_decision_id).maybeSingle();
      if (origErr) throw new Error(origErr.message);
      if (!original) return Response.json({ error: 'Original decision not found' }, { status: 404 });
      if (!await authorizeBusiness(original.business_id)) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }

      const now = new Date().toISOString();

      // Mark original as superseded
      await sb.from('business_decisions').update({
        decision_status: 'superseded',
        superseded_by_decision_id: new_decision_id,
      }).eq('decision_id', original_decision_id);

      // Mark new decision as superseding the original
      await sb.from('business_decisions').update({
        supersedes_decision_id: original_decision_id,
      }).eq('decision_id', new_decision_id);

      return Response.json({ success: true, original_decision_id, new_decision_id });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // INTELLIGENCE
    // ═══════════════════════════════════════════════════════════════════════

    // ── buildDecisionContext ────────────────────────────────────────────
    if (action === 'buildDecisionContext') {
      const { decision_id } = data || {};
      if (!decision_id) return Response.json({ error: 'decision_id required' }, { status: 400 });

      const { data: row, error } = await sb.from('business_decisions')
        .select('*').eq('decision_id', decision_id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) return Response.json({ error: 'Decision not found' }, { status: 404 });
      if (!await authorizeBusiness(row.business_id)) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }

      const decision = mapRowToDecision(row);
      const businessId = row.business_id;

      // ── Fetch certified inputs in parallel ────────────────────────────
      const [
        contractResult, memoriesResult, timelineResult, valuationResult, growthResult,
      ] = await Promise.allSettled([
        buildBusinessIntelligenceContract(sb, businessId, profile.id),
        sb.from('business_memories').select('memory_id, category, title, summary, effective_date, importance, memory_status, client_visible')
          .eq('business_id', businessId).in('memory_status', ['confirmed', 'candidate'])
          .order('created_at', { ascending: false }).limit(10),
        sb.from('business_state_events').select('event_id, title, timestamp').eq('business_id', businessId)
          .order('timestamp', { ascending: false }).limit(10),
        sb.from('business_valuations').select('id, current_value, baseline_value, status').eq('business_id', businessId)
          .order('created_at', { ascending: false }).limit(1).maybeSingle(),
        sb.from('growth_plan_initiatives').select('id, status').eq('business_id', businessId),
      ]);

      const safeVal = (s: any, fallback = null) => {
        if (s.status !== 'fulfilled') return fallback;
        const v = s.value;
        // Supabase query responses have {data, error} shape — return data or fallback
        if (v && typeof v === 'object' && 'data' in v && 'error' in v) {
          return v.data ?? fallback;
        }
        // Direct return values (e.g. buildBusinessIntelligenceContract)
        return v ?? fallback;
      };

      const intelligence_contract = safeVal(contractResult);
      const contract_version = intelligence_contract?.contract_version || null;

      // Filter memories for client safety if needed
      const allMemories = safeVal(memoriesResult, []) || [];
      const relevant_memories = (allMemories as any[])
        .filter((m) => isAdvisorOrAdmin || m.client_visible !== false)
        .map((m) => ({
          memory_id: m.memory_id,
          category: m.category,
          title: m.title,
          summary: m.summary,
          effective_date: m.effective_date,
          importance: m.importance,
        }));

      const timelineRows = safeVal(timelineResult, []) || [];
      const recent_timeline_events = (timelineRows as any[]).map((t) => ({
        event_id: t.event_id,
        title: t.title,
        timestamp: t.timestamp,
        certified_owner: 'business_timeline',
      }));

      const valuationRow = safeVal(valuationResult);
      const valuation_summary = valuationRow ? {
        valuation_id: valuationRow.id,
        current_value: valuationRow.current_value,
        baseline_value: valuationRow.baseline_value,
        status: valuationRow.status,
      } : null;

      const growthRows = safeVal(growthResult, []) || [];
      const growth_plan_summary = {
        total_initiatives: (growthRows as any[]).length,
        active_initiatives: (growthRows as any[]).filter((g) => g.status === 'active' || g.status === 'in_progress').length,
        progress_percent: 0,
      };

      // ── Build context using the coordinator ──────────────────────────
      const context = buildDecisionContext({
        decision,
        intelligence_contract,
        contract_version,
        relevant_memories,
        recent_timeline_events,
        valuation_summary,
        growth_plan_summary,
        meeting_context: decision.meeting_context_id ? {
          meeting_id: decision.meeting_context_id,
          intent: 'strategy_session',
          scheduled_at: null,
        } : null,
      });

      // ── Assess readiness ──────────────────────────────────────────────
      const readiness = assessDecisionReadiness(context);

      // ── Capture contract version for immutability ──────────────────────
      if (contract_version && !decision.source_contract_version) {
        await sb.from('business_decisions').update({
          source_contract_version: contract_version,
        }).eq('decision_id', decision_id);
      }

      return Response.json({ context, readiness });
    }

    // ── challengeDecision (Devil's Advocate) ────────────────────────────
    if (action === 'challengeDecision') {
      const { decision_id } = data || {};
      if (!decision_id) return Response.json({ error: 'decision_id required' }, { status: 400 });

      const { data: row, error } = await sb.from('business_decisions')
        .select('*').eq('decision_id', decision_id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) return Response.json({ error: 'Decision not found' }, { status: 404 });
      if (!await authorizeBusiness(row.business_id)) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }

      const decision = mapRowToDecision(row);

      // Build the challenge prompt
      const prompt = buildChallengePrompt(decision);

      // Call LLM
      const llmResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt,
        model: 'claude_sonnet_4_6',
        response_json_schema: {
          type: 'object',
          properties: {
            challenged_assumptions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  assumption_id: { type: 'string' },
                  statement: { type: 'string' },
                  challenge: { type: 'string' },
                  severity: { type: 'string', enum: ['low', 'medium', 'high'] },
                },
              },
            },
            confirmation_bias_risks: { type: 'array', items: { type: 'string' } },
            missing_evidence: { type: 'array', items: { type: 'string' } },
            strongest_opposing_case: { type: 'string' },
            failure_modes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  mode_id: { type: 'string' },
                  description: { type: 'string' },
                  trigger: { type: 'string' },
                  impact: { type: 'string' },
                  mitigation: { type: 'string' },
                },
              },
            },
            challenge_summary: { type: 'string' },
          },
        },
      });

      const challenge = processChallengeResponse(decision_id, llmResult);

      return Response.json({ challenge });
    }

    // ── generateMemoryCandidate ─────────────────────────────────────────
    if (action === 'generateMemoryCandidate') {
      const { decision_id } = data || {};
      if (!decision_id) return Response.json({ error: 'decision_id required' }, { status: 400 });

      const { data: row, error } = await sb.from('business_decisions')
        .select('*').eq('decision_id', decision_id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) return Response.json({ error: 'Decision not found' }, { status: 404 });
      if (!await authorizeBusiness(row.business_id)) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }

      const decision = mapRowToDecision(row);
      const candidate = generateMemoryCandidateFromDecision(decision);

      if (!candidate) {
        return Response.json({
          candidate: null,
          reason: 'Decision does not meet memory candidate criteria (must be decided + strategic+ importance)',
        });
      }

      return Response.json({ candidate });
    }

    // ── getDecisionLedger ───────────────────────────────────────────────
    if (action === 'getDecisionLedger') {
      const { business_id } = data || {};
      if (!business_id) return Response.json({ error: 'business_id required' }, { status: 400 });
      if (!await authorizeBusiness(business_id)) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }

      const { data: rows, error } = await sb.from('business_decisions')
        .select('*').eq('business_id', business_id)
        .in('decision_status', ['decided', 'superseded'])
        .order('decided_at', { ascending: false }).limit(50);
      if (error) throw new Error(error.message);

      const ledger = (rows || []).map((row) => {
        const decision = mapRowToDecision(row);
        const selectedOption = decision.options.find((o) => o.option_id === decision.selected_option_id);
        return {
          decision_id: decision.decision_id,
          title: decision.title,
          decision_type: decision.decision_type,
          decided_at: decision.decided_at,
          decided_by: decision.decided_by_profile_id,
          selected_option_label: selectedOption?.label || 'Unknown',
          decision_reason: decision.decision_reason,
          recommendation_matched: decision.recommendation?.recommended_option_id === decision.selected_option_id,
          options_count: decision.options.length,
          evidence_count: decision.evidence.length,
          assumption_count: decision.assumptions.length,
          importance: decision.importance,
          business_id: decision.business_id,
        };
      });

      return Response.json({ ledger });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // OUTCOME INTELLIGENCE (Phase D.1)
    // ═══════════════════════════════════════════════════════════════════════

    // ── Helper: fetch outcome context inputs ────────────────────────────
    async function fetchOutcomeContextInputs(decision: any, businessId: string) {
      const [contractResult, memoriesResult, timelineResult, growthResult, sprintResult] = await Promise.allSettled([
        buildBusinessIntelligenceContract(sb, businessId, profile.id),
        sb.from('business_memories').select('memory_id, category, title, summary, effective_date, importance, memory_status, client_visible')
          .eq('business_id', businessId).in('memory_status', ['confirmed', 'candidate'])
          .order('created_at', { ascending: false }).limit(10),
        sb.from('business_state_events').select('event_id, title, timestamp').eq('business_id', businessId)
          .gte('timestamp', decision.decided_at || new Date(0).toISOString())
          .order('timestamp', { ascending: false }).limit(20),
        sb.from('growth_plan_initiatives').select('id, status').eq('business_id', businessId),
        sb.from('ninety_day_sprints').select('id, status, progress_percent, path_title')
          .eq('business_id', businessId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ]);

      const safeVal = (s: any, fallback = null) => {
        if (s.status !== 'fulfilled') return fallback;
        const v = s.value;
        if (v && typeof v === 'object' && 'data' in v && 'error' in v) {
          return v.data ?? fallback;
        }
        return v ?? fallback;
      };

      const intelligence_contract = safeVal(contractResult);
      const contract_version = intelligence_contract?.contract_version || null;
      const allMemories = safeVal(memoriesResult, []) || [];
      const relevant_memories = (allMemories as any[])
        .filter((m) => isAdvisorOrAdmin || m.client_visible !== false)
        .map((m) => ({ memory_id: m.memory_id, category: m.category, title: m.title, summary: m.summary, effective_date: m.effective_date, importance: m.importance }));
      const timelineRows = safeVal(timelineResult, []) || [];
      const timeline_events_since_decision = (timelineRows as any[]).map((t) => ({ event_id: t.event_id, title: t.title, timestamp: t.timestamp, certified_owner: 'business_timeline' }));
      const growthRows = safeVal(growthResult, []) || [];
      const growth_plan_summary = { total_initiatives: (growthRows as any[]).length, active_initiatives: (growthRows as any[]).filter((g) => g.status === 'active' || g.status === 'in_progress').length, progress_percent: 0 };
      const sprintRow = safeVal(sprintResult);
      const sprint_summary = sprintRow ? { sprint_id: sprintRow.id, status: sprintRow.status, progress_percent: sprintRow.progress_percent || 0, path_title: sprintRow.path_title || null } : null;

      return { intelligence_contract, contract_version, relevant_memories, timeline_events_since_decision, growth_plan_summary, sprint_summary };
    }

    // ── setExpectedOutcomes ─────────────────────────────────────────────
    if (action === 'setExpectedOutcomes') {
      const { decision_id, expected_outcomes, outcome_review_date } = data || {};
      if (!decision_id) return Response.json({ error: 'decision_id required' }, { status: 400 });
      if (!Array.isArray(expected_outcomes)) return Response.json({ error: 'expected_outcomes array required' }, { status: 400 });

      const { data: existing, error: fetchErr } = await sb.from('business_decisions')
        .select('*').eq('decision_id', decision_id).maybeSingle();
      if (fetchErr) throw new Error(fetchErr.message);
      if (!existing) return Response.json({ error: 'Decision not found' }, { status: 404 });
      if (!await authorizeBusiness(existing.business_id)) return Response.json({ error: 'Forbidden' }, { status: 403 });
      if (!isAdvisorOrAdmin) return Response.json({ error: 'Forbidden: advisor or admin required' }, { status: 403 });

      const updateData: Record<string, unknown> = { expected_outcomes };
      if (outcome_review_date !== undefined) updateData.outcome_review_date = outcome_review_date || null;

      const { data: updated, error } = await sb.from('business_decisions')
        .update(updateData).eq('decision_id', decision_id).select('*').single();
      if (error) throw new Error(error.message);

      return Response.json({ decision: mapRowToDecision(updated) });
    }

    // ── buildOutcomeContext ────────────────────────────────────────────
    if (action === 'buildOutcomeContext') {
      const { decision_id } = data || {};
      if (!decision_id) return Response.json({ error: 'decision_id required' }, { status: 400 });

      const { data: row, error } = await sb.from('business_decisions')
        .select('*').eq('decision_id', decision_id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) return Response.json({ error: 'Decision not found' }, { status: 404 });
      if (!await authorizeBusiness(row.business_id)) return Response.json({ error: 'Forbidden' }, { status: 403 });

      const decision = mapRowToDecision(row);
      const inputs = await fetchOutcomeContextInputs(decision, row.business_id);

      const context = buildDecisionOutcomeContext({
        decision,
        current_intelligence_contract: inputs.intelligence_contract,
        contract_version: inputs.contract_version,
        growth_plan_summary: inputs.growth_plan_summary,
        sprint_summary: inputs.sprint_summary,
        timeline_events_since_decision: inputs.timeline_events_since_decision,
        relevant_memories: inputs.relevant_memories,
      });

      const readiness = assessOutcomeReadiness(context);

      if (inputs.contract_version && !decision.source_contract_version) {
        await sb.from('business_decisions').update({ source_contract_version: inputs.contract_version }).eq('decision_id', decision_id);
      }

      // Client-safe filtering for owners
      if (!isAdvisorOrAdmin) {
        return Response.json({ context: null, readiness, review_state: getOutcomeReviewState(decision), client_safe: toClientSafeOutcomeReview(decision, null) });
      }
      return Response.json({ context, readiness, review_state: getOutcomeReviewState(decision) });
    }

    // ── analyzeOutcome (AI advisory only — cannot set outcome_status) ───
    if (action === 'analyzeOutcome') {
      const { decision_id } = data || {};
      if (!decision_id) return Response.json({ error: 'decision_id required' }, { status: 400 });

      const { data: row, error } = await sb.from('business_decisions')
        .select('*').eq('decision_id', decision_id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) return Response.json({ error: 'Decision not found' }, { status: 404 });
      if (!await authorizeBusiness(row.business_id)) return Response.json({ error: 'Forbidden' }, { status: 403 });

      const decision = mapRowToDecision(row);
      const inputs = await fetchOutcomeContextInputs(decision, row.business_id);

      const context = buildDecisionOutcomeContext({
        decision,
        current_intelligence_contract: inputs.intelligence_contract,
        contract_version: inputs.contract_version,
        growth_plan_summary: inputs.growth_plan_summary,
        sprint_summary: inputs.sprint_summary,
        timeline_events_since_decision: inputs.timeline_events_since_decision,
        relevant_memories: inputs.relevant_memories,
      });

      const prompt = buildOutcomeAnalysisPrompt(decision, context);
      const llmResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt,
        model: 'claude_sonnet_4_6',
        response_json_schema: getOutcomeAnalysisSchema(),
      });

      const analysis = processOutcomeAnalysisResponse(decision_id, llmResult);

      // Client-safe filtering for owners
      if (!isAdvisorOrAdmin) {
        return Response.json({ analysis: null, client_safe: toClientSafeOutcomeReview(decision, analysis) });
      }
      return Response.json({ analysis, context });
    }

    // ── confirmOutcome (HUMAN ONLY — AI may NEVER call this) ───────────
    if (action === 'confirmOutcome') {
      const { decision_id, outcome_status, outcome_notes, actual_outcomes } = data || {};
      if (!decision_id) return Response.json({ error: 'decision_id required' }, { status: 400 });
      if (!outcome_status) return Response.json({ error: 'outcome_status required' }, { status: 400 });

      const validStatuses = ['pending', 'ongoing', 'succeeded', 'partially_succeeded', 'failed', 'inconclusive'];
      if (!validStatuses.includes(outcome_status)) {
        return Response.json({ error: 'Invalid outcome_status' }, { status: 400 });
      }

      const { data: existing, error: fetchErr } = await sb.from('business_decisions')
        .select('*').eq('decision_id', decision_id).maybeSingle();
      if (fetchErr) throw new Error(fetchErr.message);
      if (!existing) return Response.json({ error: 'Decision not found' }, { status: 404 });
      if (!await authorizeBusiness(existing.business_id)) return Response.json({ error: 'Forbidden' }, { status: 403 });

      // OUTCOME AUTHORITY: Only authorized humans can confirm outcomes.
      // AI may analyze and suggest, but NEVER confirm.
      if (!isAdvisorOrAdmin) {
        return Response.json({ error: 'Forbidden: only advisors and admins can confirm outcomes' }, { status: 403 });
      }

      if (existing.decision_status !== 'decided') {
        return Response.json({ error: 'Decision must be finalized before outcome review' }, { status: 409 });
      }

      const now = new Date().toISOString();

      // Stamp reviewer identity into each actual outcome (no new column needed)
      const stampedActualOutcomes = (Array.isArray(actual_outcomes) ? actual_outcomes : []).map((ao: any) => ({
        ...ao,
        reviewed_at: now,
        reviewed_by: profile.id,
      }));

      const updateData = {
        outcome_status,
        outcome_notes: outcome_notes || '',
        actual_outcomes: stampedActualOutcomes,
        outcome_reviewed_at: now,
      };

      const { data: updated, error } = await sb.from('business_decisions')
        .update(updateData).eq('decision_id', decision_id).select('*').single();
      if (error) throw new Error(error.message);

      const confirmedDecision = mapRowToDecision(updated);

      // Generate Business Memory candidates (returned — NOT auto-persisted)
      let memoryCandidates: any[] = [];
      try {
        memoryCandidates = generateOutcomeMemoryCandidates(confirmedDecision, null);
      } catch (memErr) {
        console.error('[confirmOutcome] Memory candidate generation failed (non-fatal):', memErr?.message);
      }

      return Response.json({ decision: confirmedDecision, memory_candidates: memoryCandidates });
    }

    // ── getOutcomeReviewState ──────────────────────────────────────────
    if (action === 'getOutcomeReviewState') {
      const { decision_id } = data || {};
      if (!decision_id) return Response.json({ error: 'decision_id required' }, { status: 400 });

      const { data: row, error } = await sb.from('business_decisions')
        .select('*').eq('decision_id', decision_id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) return Response.json({ error: 'Decision not found' }, { status: 404 });
      if (!await authorizeBusiness(row.business_id)) return Response.json({ error: 'Forbidden' }, { status: 403 });

      const decision = mapRowToDecision(row);
      return Response.json({ review_state: getOutcomeReviewState(decision) });
    }

    // ── listReviewsDue (for Meeting/Living Intelligence) ──────────────
    if (action === 'listReviewsDue') {
      const { business_id, states } = data || {};
      if (!business_id) return Response.json({ error: 'business_id required' }, { status: 400 });
      if (!await authorizeBusiness(business_id)) return Response.json({ error: 'Forbidden' }, { status: 403 });

      const { data: dueRows, error: dueErr } = await sb.from('business_decisions')
        .select('*').eq('business_id', business_id).eq('decision_status', 'decided')
        .is('outcome_reviewed_at', null).not('outcome_review_date', 'is', null)
        .order('outcome_review_date', { ascending: true }).limit(50);
      if (dueErr) throw new Error(dueErr.message);

      const now = new Date();
      const allEntries = (dueRows || []).map((row) => {
        const decision = mapRowToDecision(row);
        const state = getOutcomeReviewState(decision, now);
        const reviewDate = new Date(decision.outcome_review_date + 'T00:00:00Z');
        const daysOverdue = Math.max(0, Math.ceil((now.getTime() - reviewDate.getTime()) / (1000 * 60 * 60 * 24)));
        return {
          decision_id: decision.decision_id, business_id: decision.business_id,
          title: decision.title, decision_type: decision.decision_type,
          decided_at: decision.decided_at, outcome_review_date: decision.outcome_review_date,
          outcome_review_state: state, importance: decision.importance, days_overdue: daysOverdue,
        };
      });

      const requestedStates = Array.isArray(states) ? states : ['DUE', 'OVERDUE'];
      const filtered = allEntries.filter((e) => requestedStates.includes(e.outcome_review_state));

      return Response.json({ reviews: filtered });
    }

    // ── createFollowUpDecision ─────────────────────────────────────────
    if (action === 'createFollowUpDecision') {
      const { original_decision_id, title, decision_type, question, importance, risk_level } = data || {};
      if (!original_decision_id || !title) return Response.json({ error: 'original_decision_id and title required' }, { status: 400 });

      const { data: original, error: origErr } = await sb.from('business_decisions')
        .select('*').eq('decision_id', original_decision_id).maybeSingle();
      if (origErr) throw new Error(origErr.message);
      if (!original) return Response.json({ error: 'Original decision not found' }, { status: 404 });
      if (!await authorizeBusiness(original.business_id)) return Response.json({ error: 'Forbidden' }, { status: 403 });
      if (!isAdvisorOrAdmin) return Response.json({ error: 'Forbidden: advisor or admin required' }, { status: 403 });

      const businessId = original.business_id;
      const newDecisionId = generateDecisionId(businessId);
      const now = new Date().toISOString();

      const insertData = {
        decision_id: newDecisionId, business_id: businessId, title,
        decision_type: decision_type || original.decision_type, decision_status: 'draft',
        question: question || '', context_summary: '',
        created_by_profile_id: profile.id, decision_owner_profile_id: profile.id,
        created_at: now, importance: importance || 'strategic', risk_level: risk_level || 'medium',
        visibility: original.visibility, client_visible: original.client_visible,
        supersedes_decision_id: original_decision_id,
      };

      const { data: inserted, error: insertErr } = await sb.from('business_decisions')
        .insert(insertData).select('*').single();
      if (insertErr) throw new Error(insertErr.message);

      // Mark original as superseded (preserve outcome if already reviewed)
      await sb.from('business_decisions').update({
        superseded_by_decision_id: newDecisionId,
      }).eq('decision_id', original_decision_id);

      return Response.json({ decision: mapRowToDecision(inserted) });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error('[decisionIntelligenceService] Error:', error?.message || error);
    return Response.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
});