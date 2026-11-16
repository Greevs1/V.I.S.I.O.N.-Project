/**
 * verificationQueueService — Phase 13.3E.3
 *
 * Unified Verification Queue backend service. One normalized place where
 * advisors resolve everything requiring human judgment.
 *
 * Flow: AI gathers → AI proposes → System prioritizes → Advisor verifies →
 *       Client supplies only what is necessary → Approved info flows in.
 *
 * Actions:
 *   getVerificationQueue, resolveVerificationItem, resolveConflict,
 *   approveAddBack, rejectAddBack, createClientRequest, getClientRequests,
 *   assignVerificationItem, deferVerificationItem, getQueueSummary
 *
 * Reuses: valuationAuth (identity + permissions), intelligenceEngine
 * (candidates/conflicts/add-backs), verificationQueueEngine (pure queue
 * builder), stalenessMap (dependency propagation). The certified Valuation
 * Engine, publication, versioning, and audit are untouched — resolutions
 * write through to existing valuation_answers / valuation_adjustments and
 * propagate staleness via the existing dependency map.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import {
  resolveAuthCtx,
  requireValuationView,
  requireValuationEdit,
  appendAudit,
  type AuthCtx,
} from '../../shared/valuationEngine/valuationAuth.ts';
import { buildIntelligence } from '../../shared/valuationEngine/intelligenceEngine.ts';
import {
  buildVerificationQueue,
  filterAndSortItems,
  type VerificationItem,
  type PublicationBlocker,
} from '../../shared/valuationEngine/verificationQueueEngine.ts';
import { getAffectedCalculations, CALC_TYPE_TO_DB_TYPE, CALC_TYPE_TO_TABLE } from '../../shared/valuationEngine/stalenessMap.ts';
import { loadAssessmentResults } from '../../shared/intelligenceContract/assessmentLoader.ts';

// ── Staleness propagation helper ───────────────────────────────────────────
async function markStale(ctx: AuthCtx, valuationId: string, sourceChange: string, sourceId: string) {
  const affected = getAffectedCalculations(sourceChange as any);
  if (affected.length === 0) return;
  const now = new Date().toISOString();
  const dbTypes = new Set<string>();
  for (const calc of affected) dbTypes.add(CALC_TYPE_TO_DB_TYPE[calc] || calc);
  for (const dbType of dbTypes) {
    await ctx.vsb.from('valuation_calculations')
      .update({
        is_stale: true,
        stale_reason: sourceChange,
        stale_source_type: 'verification_resolution',
        stale_source_id: sourceId,
        stale_marked_at: now,
        stale_marked_by_profile_id: ctx.profileId,
      })
      .eq('valuation_id', valuationId)
      .eq('calculation_type', dbType);
  }
  // Equity bridge cascade
  await ctx.vsb.from('valuation_calculations')
    .update({
      is_stale: true, stale_reason: sourceChange, stale_source_type: 'verification_resolution',
      stale_source_id: sourceId, stale_marked_at: now, stale_marked_by_profile_id: ctx.profileId,
    })
    .eq('valuation_id', valuationId)
    .eq('calculation_type', 'reconciliation')
    .eq('methodology', 'equity_bridge');
  // Side tables (dcf / cap_earnings)
  for (const calc of affected) {
    const table = CALC_TYPE_TO_TABLE[calc];
    if (table) {
      await ctx.vsb.from(table).update({ is_stale: true, stale_reason: sourceChange }).eq('valuation_id', valuationId);
    }
  }
  // Reset advisor conclusions (resolution changes inputs)
  await ctx.vsb.from('valuation_conclusions')
    .update({ advisor_approved: false, override_rationale: `verification_resolution:${sourceChange}` })
    .eq('valuation_id', valuationId);
}

// ── Publication blocker detection (read-only, mirrors publishValuation gate) ─
async function computePublicationBlockers(ctx: AuthCtx, valuationId: string): Promise<PublicationBlocker[]> {
  const blockers: PublicationBlocker[] = [];
  const { data: val } = await ctx.vsb.from('business_valuations')
    .select('status').eq('id', valuationId).maybeSingle();
  if (!val) return blockers;
  // Only surface blockers when approaching publication
  if (!['needs_review', 'advisor_approved', 'published'].includes(val.status)) return blockers;

  const { data: stale } = await ctx.vsb.from('valuation_calculations')
    .select('id, calculation_type, methodology, stale_reason')
    .eq('valuation_id', valuationId).eq('is_stale', true);
  if (stale && stale.length > 0) {
    blockers.push({
      key: 'stale_calculations',
      title: `${stale.length} stale calculation${stale.length !== 1 ? 's' : ''}`,
      detail: 'Approved calculations depend on changed inputs. Recalculate before publishing.',
    });
  }

  const { data: pubRecon } = await ctx.vsb.from('valuation_calculations')
    .select('id').eq('valuation_id', valuationId)
    .eq('calculation_type', 'reconciliation').eq('methodology', 'blended')
    .eq('is_approved', true).is('superseded_by_calculation_id', null).maybeSingle();
  if (!pubRecon) {
    blockers.push({
      key: 'missing_blended_reconciliation',
      title: 'Missing approved blended reconciliation',
      detail: 'An approved blended reconciliation is required for publication.',
    });
  }

  const { data: pubConclusion } = await ctx.vsb.from('valuation_conclusions')
    .select('id').eq('valuation_id', valuationId).eq('advisor_approved', true).maybeSingle();
  if (!pubConclusion) {
    blockers.push({
      key: 'missing_advisor_conclusion',
      title: 'Missing approved advisor conclusion',
      detail: 'An approved advisor conclusion is required for publication.',
    });
  }
  return blockers;
}

// ── Intelligence source loader (business-scoped) ────────────────────────────
async function loadIntelligenceSources(ctx: AuthCtx, businessId: string, valuationId: string, base44: any) {
  const { data: business } = await ctx.sb.from('business_entities').select('*').eq('id', businessId).maybeSingle();
  const { data: owners } = await ctx.sb.from('business_owners').select('*').eq('business_id', businessId);
  const { data: documents } = await ctx.sb.from('documents').select('*').eq('business_id', businessId).order('created_date', { ascending: false }).limit(200);
  const { data: extractedFields } = await ctx.sb.from('extracted_fields').select('*').eq('business_id', businessId).order('created_at', { ascending: false }).limit(500);
  const { data: documentAnalyses } = await ctx.sb.from('document_analysis').select('*').in('document_id', (documents || []).map((d) => d.id));
  const { data: dashboardMetrics } = await ctx.sb.from('dashboard_metrics').select('*').eq('business_id', businessId).order('updated_at', { ascending: false }).limit(1).maybeSingle();
  const { data: gapAnalyses } = await ctx.sb.from('gap_analyses').select('*').eq('business_id', businessId).limit(50);
  const { data: profileFinancials } = await ctx.sb.from('profile_financials').select('*').eq('business_id', businessId).maybeSingle();
  const { data: businessAssessments } = await ctx.sb.from('business_assessments').select('*').eq('business_id', businessId).order('updated_at', { ascending: false }).limit(50);
  // Phase C.1: Base44 Assessment retired — read computed results from Supabase.
  // Map to legacy shape ({ id, assessment_type, results, status }) for buildIntelligence.
  const { list: calcList } = await loadAssessmentResults(ctx.sb, businessId);
  const assessments: any[] = calcList.map(c => ({
    id: c.session_id,
    assessment_type: c.assessment_type,
    results: c.result_json || {},
    status: c.result_json ? 'completed' : 'not_started',
  }));
  const { data: valuationQuestions } = await ctx.vsb.from('valuation_questions').select('*').eq('is_active', true);
  const { data: valuationAnswers } = await ctx.vsb.from('valuation_answers').select('*').eq('valuation_id', valuationId);
  const { data: valuationFinancials } = await ctx.vsb.from('valuation_financials').select('*').eq('valuation_id', valuationId);
  const { data: valuationAdjustments } = await ctx.vsb.from('valuation_adjustments').select('*').eq('valuation_id', valuationId);
  const { data: valuationVersions } = await ctx.vsb.from('valuation_versions').select('id, version_number, published_at').eq('valuation_id', valuationId).order('version_number', { ascending: false });
  const { data: profileRow } = await ctx.sb.from('profiles').select('*').eq('id', ctx.profileId).maybeSingle();
  return {
    business, owners: owners || [], profile: profileRow,
    documents: documents || [], extractedFields: extractedFields || [],
    documentAnalyses: documentAnalyses || [], assessments, businessAssessments: businessAssessments || [],
    dashboardMetrics, gapAnalyses: gapAnalyses || [],
    valuationAnswers: valuationAnswers || [], valuationFinancials: valuationFinancials || [],
    valuationAdjustments: valuationAdjustments || [], valuationVersions: valuationVersions || [],
    valuationQuestions: valuationQuestions || [], profileFinancials,
  };
}

const TERMINAL_STATUSES = new Set(['resolved', 'rejected', 'not_applicable', 'closed']);
const OPEN_STATUSES = new Set(['open', 'in_review', 'waiting_on_client', 'waiting_on_advisor', 'needs_support']);

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const ctx = await resolveAuthCtx(base44);
    const body = await req.json().catch(() => ({}));
    const { action, data = {} } = body;

    // ════════════════════════════════════════════════════════════════════════
    // GET VERIFICATION QUEUE
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'getVerificationQueue') {
      const { valuation_id, filter = 'all', sort = 'priority', search = '', limit = 100, offset = 0 } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationView(ctx, valuation_id);

      const { data: val } = await ctx.vsb.from('business_valuations').select('business_id, status').eq('id', valuation_id).maybeSingle();
      if (!val) return Response.json({ error: 'VALUATION_NOT_FOUND' }, { status: 404 });
      const businessId = val.business_id;

      const sources = await loadIntelligenceSources(ctx, businessId, valuation_id, base44);
      const intelligence = buildIntelligence(sources as any);
      const blockers = await computePublicationBlockers(ctx, valuation_id);
      const queue = buildVerificationQueue(intelligence, valuation_id, businessId, blockers);

      // Upsert computed items — preserve persisted status/resolution/assignment
      const upsertRows = queue.items.map((item) => ({
        valuation_id: valuation_id,
        business_id: businessId,
        dedup_key: item.dedup_key,
        item_type: item.item_type,
        field_key: item.field_key || null,
        question_key: item.question_key || null,
        title: item.title,
        description: item.description,
        category: item.category,
        priority: item.priority,
        severity: item.severity || null,
        suggested_value: item.suggested_value ?? null,
        formatted_value: item.formatted_value || null,
        alternative_values: item.alternative_values || null,
        source_type: item.source_type || null,
        source_id: item.source_id || null,
        source_name: item.source_name || null,
        reporting_period: item.reporting_period || null,
        confidence_score: item.confidence_score ?? null,
        conflict_status: item.conflict_status || null,
        financial_impact: item.financial_impact || null,
        valuation_impact: item.valuation_impact || null,
        profitability_relevance: item.profitability_relevance ?? null,
        multiple_relevance: item.multiple_relevance ?? null,
        risk_relevance: item.risk_relevance ?? null,
        advisor_action_required: item.advisor_action_required,
        client_action_required: item.client_action_required,
        evidence_available: item.evidence_available,
        evidence_count: item.evidence_count,
        recommended_action: item.recommended_action,
      }));

      let mergedRows: any[] = [];
      if (upsertRows.length > 0) {
        const { data: upserted, error: upErr } = await ctx.vsb.from('valuation_verification_items')
          .upsert(upsertRows, { onConflict: 'valuation_id,dedup_key', ignoreDuplicates: false })
          .select('*');
        if (upErr) throw new Error(upErr.message);
        mergedRows = upserted || [];
      }
      // Fetch any persisted rows not in this computed set (e.g. resolved items
      // whose underlying data disappeared) so resolved counts stay accurate.
      const { data: allPersisted } = await ctx.vsb.from('valuation_verification_items')
        .select('*').eq('valuation_id', valuation_id);
      const byDedup = new Map((mergedRows as any[]).map((r) => [r.dedup_key, r]));
      for (const r of (allPersisted || [])) {
        if (!byDedup.has(r.dedup_key)) byDedup.set(r.dedup_key, r);
      }
      const allRows = Array.from(byDedup.values());

      // Summary across all rows
      const openRows = allRows.filter((r) => OPEN_STATUSES.has(r.status));
      const summary = {
        total_open: openRows.length,
        critical: openRows.filter((r) => r.priority === 'critical').length,
        high: openRows.filter((r) => r.priority === 'high').length,
        medium: openRows.filter((r) => r.priority === 'medium').length,
        low: openRows.filter((r) => r.priority === 'low').length,
        waiting_on_client: openRows.filter((r) => r.status === 'waiting_on_client' || r.client_action_required).length,
        waiting_on_advisor: openRows.filter((r) => r.advisor_action_required && r.status !== 'waiting_on_client').length,
        deferred: allRows.filter((r) => r.status === 'deferred').length,
        resolved_today: allRows.filter((r) => TERMINAL_STATUSES.has(r.status) && r.resolved_at && new Date(r.resolved_at).toDateString() === new Date().toDateString()).length,
        publication_blockers: openRows.filter((r) => r.item_type === 'publication_blocker').length,
      };

      // Recommended action from open rows
      const recommendedAction = computeRecommended(openRows);

      // Filter + sort + paginate the open + non-terminal rows for display
      const displayRows = allRows.filter((r) => !TERMINAL_STATUSES.has(r.status) || filter === 'resolved');
      const filtered = filterAndSortItems(displayRows as any, filter, sort, search) as any[];
      const paged = filtered.slice(offset, offset + limit);

      return Response.json({
        items: paged,
        summary,
        recommendedAction,
        total_filtered: filtered.length,
        intelligence_summary: intelligence.summary,
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // RESOLVE VERIFICATION ITEM
    // resolution_action: confirm | edit | reject | not_applicable | defer
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'resolveVerificationItem') {
      const { item_id, resolution_action, resolution_value, resolution_reason, deferred_until } = data;
      if (!item_id || !resolution_action) {
        return Response.json({ error: 'item_id and resolution_action required' }, { status: 400 });
      }
      const { data: item } = await ctx.vsb.from('valuation_verification_items')
        .select('*').eq('id', item_id).maybeSingle();
      if (!item) return Response.json({ error: 'ITEM_NOT_FOUND' }, { status: 404 });
      await requireValuationEdit(ctx, item.valuation_id);

      const now = new Date().toISOString();
      let newStatus = item.status;
      const updates: any = {
        resolution_action,
        resolution_reason: resolution_reason || null,
        resolved_by_profile_id: ctx.profileId,
        updated_at: now,
      };

      if (resolution_action === 'confirm') {
        newStatus = 'resolved';
        updates.resolved_at = now;
        updates.resolution_value = item.suggested_value;
        // Write through to valuation_answers
        if (item.question_key) {
          await writeThroughAnswer(ctx, item.valuation_id, item.question_key, item.suggested_value, 'verified');
        }
        await markStale(ctx, item.valuation_id, 'answer_changed', item_id);
      } else if (resolution_action === 'edit') {
        newStatus = 'resolved';
        updates.resolved_at = now;
        updates.resolution_value = resolution_value;
        if (item.question_key) {
          await writeThroughAnswer(ctx, item.valuation_id, item.question_key, resolution_value, 'verified');
        }
        await markStale(ctx, item.valuation_id, 'answer_changed', item_id);
      } else if (resolution_action === 'reject') {
        newStatus = 'rejected';
        updates.resolved_at = now;
      } else if (resolution_action === 'not_applicable') {
        newStatus = 'not_applicable';
        updates.resolved_at = now;
      } else if (resolution_action === 'defer') {
        newStatus = 'deferred';
        updates.deferred_until = deferred_until || null;
      } else {
        return Response.json({ error: `INVALID_RESOLUTION_ACTION: ${resolution_action}` }, { status: 400 });
      }

      updates.status = newStatus;
      const { data: updated, error } = await ctx.vsb.from('valuation_verification_items')
        .update(updates).eq('id', item_id).select('*').single();
      if (error) throw new Error(error.message);

      await appendAudit(ctx, item.valuation_id, 'reviewed',
        { item_id, status: item.status },
        { item_id, status: newStatus, resolution_action },
        { verification_item_id: item_id, field_key: item.field_key, question_key: item.question_key });

      return Response.json({ item: updated });
    }

    // ════════════════════════════════════════════════════════════════════════
    // RESOLVE CONFLICT (side-by-side)
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'resolveConflict') {
      const { item_id, chosen_source, reconciled_value, resolution_reason } = data;
      if (!item_id) return Response.json({ error: 'item_id required' }, { status: 400 });
      if (!resolution_reason || !resolution_reason.trim()) {
        return Response.json({ error: 'RESOLUTION_REASON_REQUIRED_FOR_MATERIAL_CONFLICT' }, { status: 400 });
      }
      const { data: item } = await ctx.vsb.from('valuation_verification_items')
        .select('*').eq('id', item_id).maybeSingle();
      if (!item) return Response.json({ error: 'ITEM_NOT_FOUND' }, { status: 404 });
      await requireValuationEdit(ctx, item.valuation_id);

      const now = new Date().toISOString();
      let finalValue = item.suggested_value;
      if (chosen_source === 'alternative' && item.alternative_values?.[0]) {
        finalValue = item.alternative_values[0].value;
      } else if (reconciled_value !== undefined) {
        finalValue = reconciled_value;
      }

      const updates: any = {
        status: 'resolved',
        resolution_action: 'resolve_conflict',
        resolution_value: finalValue,
        resolution_reason,
        resolved_by_profile_id: ctx.profileId,
        resolved_at: now,
        updated_at: now,
      };
      const { data: updated, error } = await ctx.vsb.from('valuation_verification_items')
        .update(updates).eq('id', item_id).select('*').single();
      if (error) throw new Error(error.message);

      // Write through
      if (item.question_key) {
        await writeThroughAnswer(ctx, item.valuation_id, item.question_key, finalValue, 'verified');
      }
      // Staleness: financial conflict → financial_period_changed; else answer_changed
      const sourceChange = isFinancialField(item.field_key) ? 'financial_period_changed' : 'answer_changed';
      await markStale(ctx, item.valuation_id, sourceChange, item_id);

      await appendAudit(ctx, item.valuation_id, 'reviewed',
        { item_id, status: item.status, suggested: item.suggested_value },
        { item_id, status: 'resolved', final: finalValue, chosen_source, reason: resolution_reason },
        { verification_item_id: item_id, conflict_resolution: true });

      return Response.json({ item: updated });
    }

    // ════════════════════════════════════════════════════════════════════════
    // APPROVE ADD-BACK
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'approveAddBack') {
      const { item_id, approved_amount, resolution_reason } = data;
      if (!item_id) return Response.json({ error: 'item_id required' }, { status: 400 });
      const { data: item } = await ctx.vsb.from('valuation_verification_items')
        .select('*').eq('id', item_id).maybeSingle();
      if (!item) return Response.json({ error: 'ITEM_NOT_FOUND' }, { status: 404 });
      await requireValuationEdit(ctx, item.valuation_id);

      const amount = approved_amount != null ? approved_amount : item.suggested_value;
      // Write through to valuation_adjustments (approved)
      const { data: val } = await ctx.vsb.from('business_valuations').select('business_id').eq('id', item.valuation_id).maybeSingle();
      const { data: fin } = await ctx.vsb.from('valuation_financials')
        .select('id').eq('valuation_id', item.valuation_id).order('period_end_date', { ascending: false }).limit(1).maybeSingle();
      await ctx.vsb.from('valuation_adjustments').insert({
        valuation_id: item.valuation_id,
        financial_id: fin?.id || null,
        adjustment_type: item.category,
        adjustment_direction: 'add_back',
        is_recurring: false,
        proposed_amount: Number(item.suggested_value || 0),
        approved_amount: Number(amount || 0),
        advisor_approval_status: 'approved',
        explanation: item.description,
        reviewer_profile_id: ctx.profileId,
        review_date: new Date().toISOString(),
        override_reason: resolution_reason || null,
        created_by_profile_id: ctx.profileId,
      });

      const now = new Date().toISOString();
      const { data: updated, error } = await ctx.vsb.from('valuation_verification_items')
        .update({
          status: 'resolved', resolution_action: 'approve_add_back', resolution_value: amount,
          resolution_reason: resolution_reason || null, resolved_by_profile_id: ctx.profileId, resolved_at: now, updated_at: now,
        }).eq('id', item_id).select('*').single();
      if (error) throw new Error(error.message);

      await markStale(ctx, item.valuation_id, 'adjustment_changed', item_id);
      await appendAudit(ctx, item.valuation_id, 'reviewed', { item_id }, { item_id, approved_amount: amount, category: item.category }, { verification_item_id: item_id, add_back_approved: true });
      return Response.json({ item: updated });
    }

    // ════════════════════════════════════════════════════════════════════════
    // REJECT ADD-BACK
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'rejectAddBack') {
      const { item_id, resolution_reason } = data;
      if (!item_id) return Response.json({ error: 'item_id required' }, { status: 400 });
      const { data: item } = await ctx.vsb.from('valuation_verification_items')
        .select('*').eq('id', item_id).maybeSingle();
      if (!item) return Response.json({ error: 'ITEM_NOT_FOUND' }, { status: 404 });
      await requireValuationEdit(ctx, item.valuation_id);

      const now = new Date().toISOString();
      const { data: updated, error } = await ctx.vsb.from('valuation_verification_items')
        .update({
          status: 'rejected', resolution_action: 'reject_add_back',
          resolution_reason: resolution_reason || null, resolved_by_profile_id: ctx.profileId, resolved_at: now, updated_at: now,
        }).eq('id', item_id).select('*').single();
      if (error) throw new Error(error.message);
      // No adjustment inserted → not included in normalized earnings
      await appendAudit(ctx, item.valuation_id, 'reviewed', { item_id }, { item_id, rejected: true, category: item.category }, { verification_item_id: item_id, add_back_rejected: true });
      return Response.json({ item: updated });
    }

    // ════════════════════════════════════════════════════════════════════════
    // ASSIGN VERIFICATION ITEM
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'assignVerificationItem') {
      const { item_id, assigned_profile_id, due_date, responsible_party } = data;
      if (!item_id) return Response.json({ error: 'item_id required' }, { status: 400 });
      const { data: item } = await ctx.vsb.from('valuation_verification_items').select('valuation_id').eq('id', item_id).maybeSingle();
      if (!item) return Response.json({ error: 'ITEM_NOT_FOUND' }, { status: 404 });
      await requireValuationEdit(ctx, item.valuation_id);
      const { data: updated, error } = await ctx.vsb.from('valuation_verification_items')
        .update({ assigned_profile_id: assigned_profile_id || null, due_date: due_date || null, responsible_party: responsible_party || null, updated_at: new Date().toISOString() })
        .eq('id', item_id).select('*').single();
      if (error) throw new Error(error.message);
      await appendAudit(ctx, item.valuation_id, 'reviewed', { item_id }, { item_id, assigned_profile_id, due_date }, { verification_item_id: item_id, assignment: true });
      return Response.json({ item: updated });
    }

    // ════════════════════════════════════════════════════════════════════════
    // CREATE CLIENT REQUEST
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'createClientRequest') {
      const { valuation_id, verification_item_id, request_type, title, explanation, why_it_matters, requested_value, due_date, assigned_client_profile_id, advisor_note } = data;
      if (!valuation_id || !request_type || !title) {
        return Response.json({ error: 'valuation_id, request_type, title required' }, { status: 400 });
      }
      await requireValuationEdit(ctx, valuation_id);
      const { data: val } = await ctx.vsb.from('business_valuations').select('business_id').eq('id', valuation_id).maybeSingle();
      const { data: req, error } = await ctx.vsb.from('valuation_client_requests').insert({
        valuation_id,
        business_id: val?.business_id || null,
        verification_item_id: verification_item_id || null,
        request_type,
        title,
        explanation: explanation || null,
        why_it_matters: why_it_matters || null,
        requested_value: requested_value || null,
        due_date: due_date || null,
        assigned_client_profile_id: assigned_client_profile_id || null,
        advisor_note: advisor_note || null,
        status: 'requested',
        created_by_profile_id: ctx.profileId,
      }).select('*').single();
      if (error) throw new Error(error.message);

      // Link verification item → waiting_on_client
      if (verification_item_id) {
        await ctx.vsb.from('valuation_verification_items')
          .update({ status: 'waiting_on_client', updated_at: new Date().toISOString() })
          .eq('id', verification_item_id);
      }
      await appendAudit(ctx, valuation_id, 'reviewed', null, { request_id: req.id, request_type, title }, { client_request: true });
      return Response.json({ request: req });
    }

    // ════════════════════════════════════════════════════════════════════════
    // GET CLIENT REQUESTS (advisor view)
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'getClientRequests') {
      const { valuation_id } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationView(ctx, valuation_id);
      const { data: requests, error } = await ctx.vsb.from('valuation_client_requests')
        .select('*').eq('valuation_id', valuation_id).order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return Response.json({ requests: requests || [] });
    }

    // ════════════════════════════════════════════════════════════════════════
    // GET QUEUE SUMMARY (lightweight)
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'getQueueSummary') {
      const { valuation_id } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationView(ctx, valuation_id);
      const { data: all } = await ctx.vsb.from('valuation_verification_items')
        .select('status, priority, item_type, client_action_required, advisor_action_required, resolved_at')
        .eq('valuation_id', valuation_id);
      const rows = all || [];
      const open = rows.filter((r: any) => OPEN_STATUSES.has(r.status));
      return Response.json({
        summary: {
          total_open: open.length,
          critical: open.filter((r: any) => r.priority === 'critical').length,
          high: open.filter((r: any) => r.priority === 'high').length,
          medium: open.filter((r: any) => r.priority === 'medium').length,
          low: open.filter((r: any) => r.priority === 'low').length,
          waiting_on_client: open.filter((r: any) => r.status === 'waiting_on_client' || r.client_action_required).length,
          waiting_on_advisor: open.filter((r: any) => r.advisor_action_required && r.status !== 'waiting_on_client').length,
          deferred: rows.filter((r: any) => r.status === 'deferred').length,
          resolved_today: rows.filter((r: any) => TERMINAL_STATUSES.has(r.status) && r.resolved_at && new Date(r.resolved_at).toDateString() === new Date().toDateString()).length,
          publication_blockers: open.filter((r: any) => r.item_type === 'publication_blocker').length,
        },
      });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error: any) {
    const status = error.status || 500;
    return Response.json({ error: error.message }, { status });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
async function writeThroughAnswer(ctx: AuthCtx, valuationId: string, questionKey: string, value: any, verificationStatus: string) {
  const { data: q } = await ctx.vsb.from('valuation_questions')
    .select('id, answer_type').eq('question_key', questionKey).maybeSingle();
  if (!q) return; // question may not exist; skip silently
  const { data: existing } = await ctx.vsb.from('valuation_answers')
    .select('id').eq('valuation_id', valuationId).eq('question_id', q.id).maybeSingle();
  const now = new Date().toISOString();
  if (existing) {
    await ctx.vsb.from('valuation_answers').update({
      answer_value: value,
      source_type: 'advisor_entry',
      advisor_verification_status: verificationStatus,
      is_confirmed: true,
      answered_by_profile_id: ctx.profileId,
      answered_at: now,
    }).eq('id', existing.id);
  } else {
    await ctx.vsb.from('valuation_answers').insert({
      valuation_id: valuationId,
      question_id: q.id,
      answer_value: value,
      answer_type: q.answer_type,
      source_type: 'advisor_entry',
      advisor_verification_status: verificationStatus,
      is_confirmed: true,
      answered_by_profile_id: ctx.profileId,
    });
  }
}

const FINANCIAL_FIELD_KEYS = new Set([
  'annual_revenue', 'current_ebitda', 'recast_ebitda', 'gross_profit', 'net_income',
  'owner_compensation', 'cogs', 'operating_expenses', 'total_debt', 'cash_equivalents',
  'inventory_value', 'accounts_receivable', 'accounts_payable', 'capex',
]);
function isFinancialField(fieldKey?: string): boolean {
  return !!fieldKey && FINANCIAL_FIELD_KEYS.has(fieldKey);
}

function computeRecommended(openRows: any[]): { title: string; detail: string; priority: string; action_type: string } {
  if (openRows.length === 0) {
    return { title: 'Verification complete', detail: 'No open items remaining. Proceed to the Valuation workspace.', priority: 'low', action_type: 'proceed' };
  }
  const rank = (p: string) => (p === 'critical' ? 4 : p === 'high' ? 3 : p === 'medium' ? 2 : 1);
  const ranked = [...openRows].sort((a, b) => rank(b.priority) - rank(a.priority));
  const top = ranked[0];
  const count = ranked.filter((r) => r.item_type === top.item_type && r.priority === top.priority).length;
  return {
    title: count > 1 ? `${top.title} (${count} items)` : top.title,
    detail: top.recommended_action || top.description || '',
    priority: top.priority,
    action_type: top.item_type,
  };
}