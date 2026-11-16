/**
 * valuationCalculationEngine — Phase 13.3 Enterprise Value Calculation Engine.
 *
 * All calculation actions for the valuation engine. Uses shared helpers
 * from valuationShared for identity resolution and authorization.
 *
 * Calculation order: Facts → normalized earnings → methodology → calculation
 *   → reconciliation → advisor conclusion → value-creation insights
 *
 * Actions:
 *   saveMethodSelection, getMethodSelections, approveMethodSelection,
 *   calculateNormalizedEarnings, getNormalizedEarnings,
 *   saveHistoricalWeighting, getHistoricalWeighting,
 *   saveBenchmark, getBenchmarks, deleteBenchmark,
 *   calculateMultipleMethod, getMultipleCalculation,
 *   saveDCFProjection, calculateDCF, getDCF,
 *   saveCapEarningsInputs, calculateCapEarnings, getCapEarnings,
 *   saveAssetItem, getAssetItems, deleteAssetItem, calculateAssetApproach,
 *   saveMethodReconciliation, calculateReconciledValue, getMethodReconciliation,
 *   saveEquityBridgeItem, getEquityBridge, calculateEquityValue,
 *   saveConfidenceScore, calculateOverallConfidence, getConfidenceScores,
 *   saveScenarioCalculation, getScenarioCalculations,
 *   saveValueDriver, getValueDrivers, updateValueDriver,
 *   saveAdvisorConclusion, getAdvisorConclusion,
 *   getCalculationSummary, markCalculationsStale, getStaleCalculations
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  createSupabaseClient,
  resolveCurrentProfile,
  requireValuationView,
  requireValuationEdit,
  appendAudit,
  round4,
  round2,
  round6
} from '../../shared/valuationShared/entry.ts';

const ENGINE_VERSION = '13.3.0';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const sb = createSupabaseClient();
    const profile = await resolveCurrentProfile(sb, user);
    const profileId = profile.id;
    const isSuperAdmin = profile.app_role === 'super_admin';
    const vsb = sb.schema('valuation');

    const body = await req.json().catch(() => ({}));
    const { action, data = {} } = body;

    // ════════════════════════════════════════════════════════════════════════
    // HELPER: Store calculation lines for audit trail
    // ════════════════════════════════════════════════════════════════════════
    const storeCalcLines = async (valuationId, lines) => {
      if (!lines || lines.length === 0) return;
      const rows = lines.map(l => ({
        valuation_id: valuationId,
        calculation_id: l.calculation_id || null,
        line_type: l.line_type || 'other',
        line_label: l.line_label || '',
        source_period: l.source_period || null,
        source_field: l.source_field || null,
        adjustment_id: l.adjustment_id || null,
        evidence_ref: l.evidence_ref || null,
        approval_status: l.approval_status || 'not_applicable',
        advisor_profile_id: profileId,
        amount: round4(l.amount || 0),
        calculation_engine_version: ENGINE_VERSION,
      }));
      const { error: lineErr } = await vsb.from('valuation_calculation_lines').insert(rows);
      if (lineErr) {
        // Non-fatal: calculation lines are audit trail; don't block the calculation
        console.warn('Failed to store calculation lines:', lineErr.message);
      }
    };

    // ════════════════════════════════════════════════════════════════════════
    // METHOD SELECTION
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'saveMethodSelection') {
      const { valuation_id, method_key, method_name, category, selection_role, selection_rationale, exclusion_rationale, is_selected } = data;
      if (!valuation_id || !method_key) return Response.json({ error: 'valuation_id and method_key required' }, { status: 400 });
      await requireValuationEdit(vsb, sb, profile, valuation_id);

      const { data: existing } = await vsb.from('valuation_method_selections')
        .select('id').eq('valuation_id', valuation_id).eq('method_key', method_key).maybeSingle();

      const payload = {
        valuation_id, method_key, method_name, category,
        selection_role: selection_role || 'excluded',
        selection_rationale: selection_rationale || null,
        exclusion_rationale: exclusion_rationale || null,
        is_selected: is_selected !== false,
      };

      let result;
      if (existing) {
        const { data: updated, error } = await vsb.from('valuation_method_selections')
          .update(payload).eq('id', existing.id).select().single();
        if (error) throw new Error(error.message);
        result = updated;
      } else {
        const { data: created, error } = await vsb.from('valuation_method_selections').insert(payload).select().single();
        if (error) throw new Error(error.message);
        result = created;
      }

      await appendAudit(vsb, valuation_id, profileId, 'calculation_saved', null, { method_key, selection_role }, { method_selection_id: result.id });

      // ── Phase 13.3D: Trigger staleness for method selection change ──────
      // Equity bridge uses calculation_type='reconciliation', methodology='equity_bridge'
      const METHOD_STALENESS_TYPES = ['reconciliation'];
      for (const dbType of METHOD_STALENESS_TYPES) {
        await vsb.from('valuation_calculations')
          .update({ is_stale: true, stale_reason: 'method_selection_changed', stale_source_type: 'valuation_method_selections', stale_source_id: result.id, stale_marked_at: new Date().toISOString(), stale_marked_by_profile_id: profileId })
          .eq('valuation_id', valuation_id).eq('calculation_type', dbType);
      }
      // Cascade: reconciliation stale → equity bridge stale
      await vsb.from('valuation_calculations')
        .update({ is_stale: true, stale_reason: 'method_selection_changed', stale_source_type: 'valuation_method_selections', stale_source_id: result.id, stale_marked_at: new Date().toISOString(), stale_marked_by_profile_id: profileId })
        .eq('valuation_id', valuation_id)
        .eq('calculation_type', 'reconciliation')
        .eq('methodology', 'equity_bridge');

      return Response.json({ methodSelection: result });
    }

    if (action === 'getMethodSelections') {
      const { valuation_id } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationView(vsb, sb, profile, valuation_id);

      const { data: selections, error } = await vsb.from('valuation_method_selections')
        .select('*').eq('valuation_id', valuation_id).order('selection_role', { ascending: true });
      if (error) throw new Error(error.message);
      return Response.json({ methodSelections: selections || [] });
    }

    if (action === 'approveMethodSelection') {
      const { valuation_id, method_key, approved } = data;
      if (!valuation_id || !method_key) return Response.json({ error: 'valuation_id and method_key required' }, { status: 400 });
      await requireValuationEdit(vsb, sb, profile, valuation_id);

      const { data: updated, error } = await vsb.from('valuation_method_selections')
        .update({
          advisor_approved: approved !== false,
          approved_by_profile_id: profileId,
          approved_at: new Date().toISOString(),
        })
        .eq('valuation_id', valuation_id).eq('method_key', method_key)
        .select().single();
      if (error) throw new Error(error.message);

      await appendAudit(vsb, valuation_id, profileId, 'calculation_saved', null, { method_key, approved }, null);
      return Response.json({ methodSelection: updated });
    }

    // ════════════════════════════════════════════════════════════════════════
    // NORMALIZED EARNINGS CALCULATION
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'calculateNormalizedEarnings') {
      const { valuation_id, financial_id, earnings_basis } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationEdit(vsb, sb, profile, valuation_id);

      // Load approved financial period
      let finQuery = vsb.from('valuation_financials')
        .select('*').eq('valuation_id', valuation_id)
        .eq('advisor_approval_status', 'approved')
        .order('period_end_date', { ascending: false });
      if (financial_id) {
        finQuery = finQuery.eq('id', financial_id);
      }
      const { data: financials, error: finErr } = await finQuery.limit(1).maybeSingle();
      if (finErr) throw new Error(finErr.message);
      if (!financials) return Response.json({ error: 'NO_APPROVED_FINANCIALS' }, { status: 400 });

      // Load approved adjustments for this financial period
      const { data: adjustments, error: adjErr } = await vsb.from('valuation_adjustments')
        .select('*').eq('valuation_id', valuation_id)
        .eq('advisor_approval_status', 'approved')
        .order('adjustment_type', { ascending: true });
      if (adjErr) throw new Error(adjErr.message);

      // ── Build EBITDA Bridge ───────────────────────────────────────────
      const ebitdaLines = [];
      const netIncome = round4(financials.net_income || 0);
      const interest = round4(financials.interest_expense || 0);
      const taxes = round4(financials.taxes || 0);
      const depreciation = round4(financials.depreciation || 0);
      const amortization = round4(financials.amortization || 0);
      const reportedEbitda = round4(financials.reported_ebitda || (netIncome + interest + taxes + depreciation + amortization));

      ebitdaLines.push({ line_type: 'reported', line_label: 'Reported Net Income', amount: netIncome, source_field: 'net_income' });
      ebitdaLines.push({ line_type: 'reported', line_label: '+ Interest Expense', amount: interest, source_field: 'interest_expense' });
      ebitdaLines.push({ line_type: 'reported', line_label: '+ Taxes', amount: taxes, source_field: 'taxes' });
      ebitdaLines.push({ line_type: 'reported', line_label: '+ Depreciation', amount: depreciation, source_field: 'depreciation' });
      ebitdaLines.push({ line_type: 'reported', line_label: '+ Amortization', amount: amortization, source_field: 'amortization' });
      ebitdaLines.push({ line_type: 'reported', line_label: '= Reported EBITDA', amount: reportedEbitda });

      // Apply approved adjustments
      let addBacksTotal = 0;
      let deductionsTotal = 0;
      for (const adj of (adjustments || [])) {
        const amount = round4(adj.proposed_amount || 0);
        if (adj.adjustment_direction === 'add_back') {
          addBacksTotal = round4(addBacksTotal + amount);
          ebitdaLines.push({
            line_type: 'adjustment', line_label: `+ ${adj.adjustment_type.replace(/_/g, ' ')}`,
            amount, adjustment_id: adj.id, approval_status: 'approved',
            evidence_ref: adj.evidence_source || null,
          });
        } else {
          deductionsTotal = round4(deductionsTotal + amount);
          ebitdaLines.push({
            line_type: 'adjustment', line_label: `− ${adj.adjustment_type.replace(/_/g, ' ')}`,
            amount: -amount, adjustment_id: adj.id, approval_status: 'approved',
            evidence_ref: adj.evidence_source || null,
          });
        }
      }

      const normalizedEbitda = round4(reportedEbitda + addBacksTotal - deductionsTotal);
      ebitdaLines.push({ line_type: 'normalized', line_label: '+ Approved Add-Backs', amount: addBacksTotal });
      ebitdaLines.push({ line_type: 'normalized', line_label: '− Approved Deductions', amount: -deductionsTotal });
      ebitdaLines.push({ line_type: 'normalized', line_label: '= Normalized EBITDA', amount: normalizedEbitda });

      // ── Build SDE Bridge (if applicable) ──────────────────────────────
      let sdeLines = null;
      let normalizedSde = null;
      if (earnings_basis === 'sde' || !earnings_basis) {
        const ownerComp = round4(financials.owner_compensation || 0);
        // Owner benefits are adjustments categorized as owner_compensation or owner_perks
        const ownerBenefits = round4(
          (adjustments || [])
            .filter(a => a.adjustment_type === 'owner_perks' && a.adjustment_direction === 'add_back')
            .reduce((sum, a) => sum + round4(a.proposed_amount || 0), 0)
        );
        const marketReplacementComp = round4(financials.owner_compensation || 0); // Simplified: use stored value or same as owner comp

        sdeLines = [];
        sdeLines.push({ line_type: 'normalized', line_label: 'Normalized EBITDA', amount: normalizedEbitda });
        sdeLines.push({ line_type: 'adjustment', line_label: '+ Owner Compensation', amount: ownerComp, source_field: 'owner_compensation' });
        sdeLines.push({ line_type: 'adjustment', line_label: '+ Eligible Owner Benefits', amount: ownerBenefits });
        sdeLines.push({ line_type: 'adjustment', line_label: '− Market Replacement Compensation', amount: -marketReplacementComp });
        normalizedSde = round4(normalizedEbitda + ownerComp + ownerBenefits - marketReplacementComp);
        sdeLines.push({ line_type: 'normalized', line_label: '= Normalized SDE', amount: normalizedSde });
      }

      // Store calculation in valuation_calculations
      const { data: calc, error: calcErr } = await vsb.from('valuation_calculations').insert({
        valuation_id,
        calculation_type: 'reconciliation',
        methodology: 'normalized_earnings',
        earnings_basis: earnings_basis || 'ebitda',
        normalized_earnings: earnings_basis === 'sde' ? normalizedSde : normalizedEbitda,
        calculation_engine_version: ENGINE_VERSION,
        calculated_by_profile_id: profileId,
      }).select().single();
      if (calcErr) throw new Error(calcErr.message);

      // Store calculation lines
      await storeCalcLines(valuation_id, [
        ...ebitdaLines.map(l => ({ ...l, calculation_id: calc.id, source_period: financials.period_label })),
        ...(sdeLines || []).map(l => ({ ...l, calculation_id: calc.id, source_period: financials.period_label })),
      ]);

      // Update financial record with normalized values
      await vsb.from('valuation_financials').update({
        reported_ebitda: reportedEbitda,
        add_backs_total: addBacksTotal,
        deductions_total: deductionsTotal,
        normalized_ebitda: normalizedEbitda,
        normalized_sde: normalizedSde,
      }).eq('id', financials.id);

      await appendAudit(vsb, valuation_id, profileId, 'calculation_saved', null,
        { earnings_basis: earnings_basis || 'ebitda', normalized_ebitda: normalizedEbitda, normalized_sde: normalizedSde },
        { calculation_id: calc.id });

      return Response.json({
        calculation_id: calc.id,
        financial_period: financials.period_label,
        ebitda_bridge: {
          lines: ebitdaLines,
          reported_ebitda: reportedEbitda,
          add_backs_total: addBacksTotal,
          deductions_total: deductionsTotal,
          normalized_ebitda: normalizedEbitda,
        },
        sde_bridge: sdeLines ? {
          lines: sdeLines,
          normalized_sde: normalizedSde,
        } : null,
      });
    }

    if (action === 'getNormalizedEarnings') {
      const { valuation_id } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationView(vsb, sb, profile, valuation_id);

      const { data: calc, error } = await vsb.from('valuation_calculations')
        .select('*').eq('valuation_id', valuation_id)
        .eq('methodology', 'normalized_earnings')
        .order('calculated_at', { ascending: false })
        .limit(1).maybeSingle();
      if (error) throw new Error(error.message);

      if (!calc) return Response.json({ calculation: null });

      const { data: lines } = await vsb.from('valuation_calculation_lines')
        .select('*').eq('calculation_id', calc.id).order('created_at', { ascending: true });

      return Response.json({ calculation: calc, lines: lines || [] });
    }

    // ════════════════════════════════════════════════════════════════════════
    // HISTORICAL WEIGHTING
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'saveHistoricalWeighting') {
      const { valuation_id, weightings } = data;
      if (!valuation_id || !weightings || !Array.isArray(weightings)) {
        return Response.json({ error: 'valuation_id and weightings array required' }, { status: 400 });
      }
      await requireValuationEdit(vsb, sb, profile, valuation_id);

      // Delete existing weightings and insert new ones
      await vsb.from('valuation_historical_weighting')
        .delete().eq('valuation_id', valuation_id);

      const rows = weightings.map(w => ({
        valuation_id,
        financial_id: w.financial_id || null,
        period_label: w.period_label,
        period_end_date: w.period_end_date || null,
        fiscal_year: w.fiscal_year || null,
        weighting_method: w.weighting_method || 'weighted_average',
        weight_percentage: round2(w.weight_percentage || 0),
        weighted_earnings: round4(w.weighted_earnings || 0),
        is_selected: w.is_selected || false,
        is_maintainable: w.is_maintainable || false,
        advisor_approved: w.advisor_approved || false,
        approved_by_profile_id: w.advisor_approved ? profileId : null,
        approved_at: w.advisor_approved ? new Date().toISOString() : null,
      }));

      const { data: inserted, error } = await vsb.from('valuation_historical_weighting')
        .insert(rows).select();
      if (error) throw new Error(error.message);

      await appendAudit(vsb, valuation_id, profileId, 'calculation_saved', null, { weightings: rows.length }, null);

      // ── Phase 13.3D: Trigger staleness for historical weighting change ─
      const HW_STALENESS_TYPES = ['historical_weighting', 'ebitda_multiple', 'sde_multiple', 'capitalization_of_earnings', 'reconciliation', 'confidence', 'scenario'];
      for (const dbType of HW_STALENESS_TYPES) {
        await vsb.from('valuation_calculations')
          .update({ is_stale: true, stale_reason: 'historical_weighting_changed', stale_source_type: 'valuation_historical_weighting', stale_marked_at: new Date().toISOString(), stale_marked_by_profile_id: profileId })
          .eq('valuation_id', valuation_id).eq('calculation_type', dbType);
      }
      // Cascade: reconciliation stale → equity bridge stale
      await vsb.from('valuation_calculations')
        .update({ is_stale: true, stale_reason: 'historical_weighting_changed', stale_source_type: 'valuation_historical_weighting', stale_marked_at: new Date().toISOString(), stale_marked_by_profile_id: profileId })
        .eq('valuation_id', valuation_id)
        .eq('calculation_type', 'reconciliation')
        .eq('methodology', 'equity_bridge');
      await vsb.from('valuation_conclusions')
        .update({ advisor_approved: false, override_rationale: 'historical_weighting_changed' })
        .eq('valuation_id', valuation_id);

      return Response.json({ weightings: inserted });
    }

    if (action === 'getHistoricalWeighting') {
      const { valuation_id } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationView(vsb, sb, profile, valuation_id);

      const { data: weightings, error } = await vsb.from('valuation_historical_weighting')
        .select('*').eq('valuation_id', valuation_id)
        .order('period_end_date', { ascending: false });
      if (error) throw new Error(error.message);
      return Response.json({ weightings: weightings || [] });
    }

    // ════════════════════════════════════════════════════════════════════════
    // BENCHMARKS
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'saveBenchmark') {
      if (!isSuperAdmin && profile.app_role !== 'advisor' && profile.app_role !== 'admin') {
        return Response.json({ error: 'PERMISSION_DENIED' }, { status: 403 });
      }
      const { benchmark_id, ...benchData } = data;
      const payload = {
        business_id: benchData.business_id || null,
        industry: benchData.industry || null,
        naics_code: benchData.naics_code || null,
        business_model: benchData.business_model || null,
        revenue_range_low: round4(benchData.revenue_range_low || 0),
        revenue_range_high: round4(benchData.revenue_range_high || 0),
        ebitda_range_low: round4(benchData.ebitda_range_low || 0),
        ebitda_range_high: round4(benchData.ebitda_range_high || 0),
        geography: benchData.geography || null,
        transaction_date: benchData.transaction_date || null,
        buyer_type: benchData.buyer_type || 'unknown',
        source: benchData.source,
        source_date: benchData.source_date || null,
        sample_size: benchData.sample_size || 0,
        multiple_type: benchData.multiple_type,
        multiple_low: round4(benchData.multiple_low || 0),
        multiple_median: round4(benchData.multiple_median || 0),
        multiple_high: round4(benchData.multiple_high || 0),
        reliability_score: round2(benchData.reliability_score || 50),
        advisor_notes: benchData.advisor_notes || null,
        is_active: benchData.is_active !== false,
        created_by_profile_id: profileId,
      };

      let result;
      if (benchmark_id) {
        const { data: updated, error } = await vsb.from('valuation_benchmarks')
          .update(payload).eq('id', benchmark_id).select().single();
        if (error) throw new Error(error.message);
        result = updated;
      } else {
        const { data: created, error } = await vsb.from('valuation_benchmarks').insert(payload).select().single();
        if (error) throw new Error(error.message);
        result = created;
      }

      // ── Phase 13.3D: Trigger staleness for benchmark change ─────────────
      // Benchmarks are global or business-scoped. Mark stale all valuations
      // with multiple-based methods that match the benchmark scope.
      const BENCH_STALENESS_TYPES = ['ebitda_multiple', 'sde_multiple', 'revenue_multiple', 'reconciliation', 'confidence', 'scenario'];
      let valuationIds = [];
      if (benchData.business_id) {
        const { data: vals } = await vsb.from('business_valuations')
          .select('id').eq('business_id', benchData.business_id);
        valuationIds = (vals || []).map(v => v.id);
      } else {
        // Global benchmark — mark all valuations with multiple methods
        const { data: ms } = await vsb.from('valuation_method_selections')
          .select('valuation_id')
          .in('method_key', ['ebitda_multiple', 'sde_multiple', 'revenue_multiple']);
        valuationIds = [...new Set((ms || []).map(m => m.valuation_id))];
      }
      for (const vid of valuationIds) {
        for (const dbType of BENCH_STALENESS_TYPES) {
          await vsb.from('valuation_calculations')
            .update({ is_stale: true, stale_reason: 'benchmark_changed', stale_source_type: 'valuation_benchmarks', stale_source_id: result.id, stale_marked_at: new Date().toISOString(), stale_marked_by_profile_id: profileId })
            .eq('valuation_id', vid).eq('calculation_type', dbType);
        }
        await vsb.from('valuation_conclusions')
          .update({ advisor_approved: false, override_rationale: 'benchmark_changed' })
          .eq('valuation_id', vid);
      }

      return Response.json({ benchmark: result });
    }

    if (action === 'getBenchmarks') {
      const { industry, multiple_type, business_id, active_only } = data;
      let query = vsb.from('valuation_benchmarks').select('*');
      if (industry) query = query.eq('industry', industry);
      if (multiple_type) query = query.eq('multiple_type', multiple_type);
      if (business_id) query = query.eq('business_id', business_id);
      if (active_only !== false) query = query.eq('is_active', true);
      query = query.order('created_at', { ascending: false });
      const { data: benchmarks, error } = await query;
      if (error) throw new Error(error.message);
      return Response.json({ benchmarks: benchmarks || [] });
    }

    if (action === 'deleteBenchmark') {
      if (!isSuperAdmin) return Response.json({ error: 'PERMISSION_DENIED' }, { status: 403 });
      const { benchmark_id } = data;
      if (!benchmark_id) return Response.json({ error: 'benchmark_id required' }, { status: 400 });
      await vsb.from('valuation_benchmarks').delete().eq('id', benchmark_id);
      return Response.json({ success: true });
    }

    // ════════════════════════════════════════════════════════════════════════
    // MULTIPLE METHOD CALCULATION
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'calculateMultipleMethod') {
      const { valuation_id, earnings_basis, normalized_earnings, final_multiple_low, final_multiple_mid, final_multiple_high, multiple_factors } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationEdit(vsb, sb, profile, valuation_id);

      if (!normalized_earnings || normalized_earnings <= 0) {
        return Response.json({ error: 'POSITIVE_EARNINGS_REQUIRED' }, { status: 400 });
      }

      const evLow = round4(normalized_earnings * final_multiple_low);
      const evMid = round4(normalized_earnings * final_multiple_mid);
      const evHigh = round4(normalized_earnings * final_multiple_high);

      // Store calculation
      const { data: calc, error: calcErr } = await vsb.from('valuation_calculations').insert({
        valuation_id,
        calculation_type: earnings_basis === 'sde' ? 'sde_multiple' : 'ebitda_multiple',
        methodology: 'market_approach',
        earnings_basis,
        normalized_earnings: round4(normalized_earnings),
        final_multiple_low: round4(final_multiple_low),
        final_multiple_mid: round4(final_multiple_mid),
        final_multiple_high: round4(final_multiple_high),
        enterprise_value_low: evLow,
        enterprise_value_mid: evMid,
        enterprise_value_high: evHigh,
        calculation_engine_version: ENGINE_VERSION,
        calculated_by_profile_id: profileId,
      }).select().single();
      if (calcErr) throw new Error(calcErr.message);

      // Store calculation lines
      const lines = [
        { line_type: 'normalized', line_label: `Normalized ${earnings_basis.toUpperCase()}`, amount: round4(normalized_earnings) },
        { line_type: 'multiple_factor', line_label: `× Multiple Low (${round4(final_multiple_low)}x)`, amount: round4(final_multiple_low) },
        { line_type: 'multiple_factor', line_label: `× Multiple Mid (${round4(final_multiple_mid)}x)`, amount: round4(final_multiple_mid) },
        { line_type: 'multiple_factor', line_label: `× Multiple High (${round4(final_multiple_high)}x)`, amount: round4(final_multiple_high) },
        { line_type: 'enterprise_value', line_label: '= Enterprise Value Low', amount: evLow },
        { line_type: 'enterprise_value', line_label: '= Enterprise Value Mid', amount: evMid },
        { line_type: 'enterprise_value', line_label: '= Enterprise Value High', amount: evHigh },
      ];
      await storeCalcLines(valuation_id, lines.map(l => ({ ...l, calculation_id: calc.id })));

      await appendAudit(vsb, valuation_id, profileId, 'calculation_saved', null,
        { method: 'multiple', ev_low: evLow, ev_mid: evMid, ev_high: evHigh },
        { calculation_id: calc.id });

      return Response.json({
        calculation_id: calc.id,
        enterprise_value_low: evLow,
        enterprise_value_mid: evMid,
        enterprise_value_high: evHigh,
        lines,
      });
    }

    if (action === 'getMultipleCalculation') {
      const { valuation_id } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationView(vsb, sb, profile, valuation_id);

      const { data: calcs, error } = await vsb.from('valuation_calculations')
        .select('*').eq('valuation_id', valuation_id)
        .in('calculation_type', ['ebitda_multiple', 'sde_multiple', 'revenue_multiple'])
        .order('calculated_at', { ascending: false });
      if (error) throw new Error(error.message);
      return Response.json({ calculations: calcs || [] });
    }

    // ════════════════════════════════════════════════════════════════════════
    // DCF CALCULATION
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'saveDCFProjection') {
      const { valuation_id, ...dcfData } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationEdit(vsb, sb, profile, valuation_id);

      const { data: existing } = await vsb.from('valuation_dcf_projections')
        .select('id').eq('valuation_id', valuation_id).maybeSingle();

      const payload = {
        valuation_id,
        forecast_period_years: dcfData.forecast_period_years || 5,
        forecast_source: dcfData.forecast_source || null,
        forecast_approved: dcfData.forecast_approved || false,
        forecast_approved_by_profile_id: dcfData.forecast_approved ? profileId : null,
        forecast_approved_at: dcfData.forecast_approved ? new Date().toISOString() : null,
        forecast_reliability_score: round2(dcfData.forecast_reliability_score || 50),
        revenue_assumptions: dcfData.revenue_assumptions || null,
        margin_assumptions: dcfData.margin_assumptions || null,
        capex_assumptions: dcfData.capex_assumptions || null,
        working_capital_assumptions: dcfData.working_capital_assumptions || null,
        tax_assumptions: dcfData.tax_assumptions || null,
        discount_rate: round6(dcfData.discount_rate || 0),
        discount_rate_rationale: dcfData.discount_rate_rationale || null,
        terminal_value_method: dcfData.terminal_value_method || 'gordon_growth',
        terminal_growth_rate: round6(dcfData.terminal_growth_rate || 0),
        terminal_exit_multiple: round4(dcfData.terminal_exit_multiple || 0),
        terminal_value_rationale: dcfData.terminal_value_rationale || null,
        projections: dcfData.projections || [],
        sensitivity_analysis: dcfData.sensitivity_analysis || {},
        is_stale: false,
        stale_reason: null,
      };

      let result;
      if (existing) {
        const { data: updated, error } = await vsb.from('valuation_dcf_projections')
          .update(payload).eq('id', existing.id).select().single();
        if (error) throw new Error(error.message);
        result = updated;
      } else {
        const { data: created, error } = await vsb.from('valuation_dcf_projections').insert(payload).select().single();
        if (error) throw new Error(error.message);
        result = created;
      }

      await appendAudit(vsb, valuation_id, profileId, 'calculation_saved', null, { method: 'dcf' }, { dcf_id: result.id });

      // ── Phase 13.3C: Trigger staleness for DCF assumption change ────────
      await vsb.from('valuation_calculations')
        .update({ is_stale: true, stale_reason: 'dcf_assumption_changed', stale_source_type: 'valuation_dcf_projections', stale_source_id: result.id, stale_marked_at: new Date().toISOString(), stale_marked_by_profile_id: profileId })
        .eq('valuation_id', valuation_id).eq('calculation_type', 'dcf');
      await vsb.from('valuation_calculations')
        .update({ is_stale: true, stale_reason: 'dcf_assumption_changed', stale_marked_at: new Date().toISOString(), stale_marked_by_profile_id: profileId })
        .eq('valuation_id', valuation_id).eq('calculation_type', 'reconciliation');

      return Response.json({ dcf: result });
    }

    if (action === 'calculateDCF') {
      const { valuation_id } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationEdit(vsb, sb, profile, valuation_id);

      const { data: dcf, error: dcfErr } = await vsb.from('valuation_dcf_projections')
        .select('*').eq('valuation_id', valuation_id).maybeSingle();
      if (dcfErr) throw new Error(dcfErr.message);
      if (!dcf) return Response.json({ error: 'DCF_NOT_FOUND' }, { status: 404 });

      const discountRate = round6(dcf.discount_rate || 0);
      if (discountRate <= 0) return Response.json({ error: 'POSITIVE_DISCOUNT_RATE_REQUIRED' }, { status: 400 });

      const projections = dcf.projections || [];
      if (!projections.length) return Response.json({ error: 'NO_PROJECTIONS' }, { status: 400 });

      // Calculate PV of each year's FCF
      let totalPV = 0;
      const calculatedProjections = projections.map((proj, idx) => {
        const year = idx + 1;
        const fcf = round4(proj.unlevered_fcf || 0);
        const pvFactor = round6(1 / Math.pow(1 + discountRate, year));
        const pvFCF = round4(fcf * pvFactor);
        totalPV = round4(totalPV + pvFCF);
        return { ...proj, year, present_value_factor: pvFactor, present_value_fcf: pvFCF };
      });

      // Calculate terminal value
      let terminalValue = 0;
      let pvTerminalValue = 0;
      const lastYear = projections.length;
      const lastFCF = round4(projections[lastYear - 1]?.unlevered_fcf || 0);

      if (dcf.terminal_value_method === 'exit_multiple') {
        const exitMultiple = round4(dcf.terminal_exit_multiple || 0);
        if (exitMultiple <= 0) return Response.json({ error: 'POSITIVE_EXIT_MULTIPLE_REQUIRED' }, { status: 400 });
        terminalValue = round4(lastFCF * exitMultiple);
      } else {
        // Gordon Growth
        const growthRate = round6(dcf.terminal_growth_rate || 0);
        if (growthRate >= discountRate) return Response.json({ error: 'GROWTH_EXCEEDS_DISCOUNT' }, { status: 400 });
        if (lastFCF <= 0) return Response.json({ error: 'POSITIVE_FINAL_FCF_REQUIRED' }, { status: 400 });
        terminalValue = round4(lastFCF * (1 + growthRate) / (discountRate - growthRate));
      }

      const pvFactorTV = round6(1 / Math.pow(1 + discountRate, lastYear));
      pvTerminalValue = round4(terminalValue * pvFactorTV);
      const enterpriseValue = round4(totalPV + pvTerminalValue);

      // Update DCF record
      const { data: updated, error: updErr } = await vsb.from('valuation_dcf_projections')
        .update({
          projections: calculatedProjections,
          terminal_value: terminalValue,
          pv_terminal_value: pvTerminalValue,
          total_present_value: totalPV,
          enterprise_value: enterpriseValue,
        }).eq('id', dcf.id).select().single();
      if (updErr) throw new Error(updErr.message);

      // Store calculation
      const { data: calc, error: calcErr } = await vsb.from('valuation_calculations').insert({
        valuation_id,
        calculation_type: 'dcf',
        methodology: 'income_approach',
        earnings_basis: 'net_income',
        enterprise_value_mid: enterpriseValue,
        confidence_score: round2(dcf.forecast_reliability_score || 50),
        calculation_engine_version: ENGINE_VERSION,
        calculated_by_profile_id: profileId,
      }).select().single();
      if (calcErr) throw new Error(calcErr.message);

      // Store calculation lines
      const lines = [
        { line_type: 'enterprise_value', line_label: 'PV of Forecast Cash Flows', amount: totalPV },
        { line_type: 'enterprise_value', line_label: `PV of Terminal Value (${dcf.terminal_value_method})`, amount: pvTerminalValue },
        { line_type: 'enterprise_value', line_label: '= Enterprise Value (DCF)', amount: enterpriseValue },
      ];
      await storeCalcLines(valuation_id, lines.map(l => ({ ...l, calculation_id: calc.id })));

      await appendAudit(vsb, valuation_id, profileId, 'calculation_saved', null,
        { method: 'dcf', enterprise_value: enterpriseValue },
        { calculation_id: calc.id });

      return Response.json({
        calculation_id: calc.id,
        dcf_id: updated.id,
        projections: calculatedProjections,
        terminal_value: terminalValue,
        pv_terminal_value: pvTerminalValue,
        total_present_value: totalPV,
        enterprise_value: enterpriseValue,
      });
    }

    if (action === 'getDCF') {
      const { valuation_id } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationView(vsb, sb, profile, valuation_id);

      const { data: dcf, error } = await vsb.from('valuation_dcf_projections')
        .select('*').eq('valuation_id', valuation_id).maybeSingle();
      if (error) throw new Error(error.message);
      return Response.json({ dcf });
    }

    // ════════════════════════════════════════════════════════════════════════
    // CAPITALIZATION OF EARNINGS
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'saveCapEarningsInputs') {
      const { valuation_id, ...capData } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationEdit(vsb, sb, profile, valuation_id);

      const { data: existing } = await vsb.from('valuation_cap_earnings')
        .select('id').eq('valuation_id', valuation_id).maybeSingle();

      const payload = {
        valuation_id,
        maintainable_earnings: round4(capData.maintainable_earnings || 0),
        earnings_basis: capData.earnings_basis || 'ebitda',
        long_term_growth_rate: round6(capData.long_term_growth_rate || 0),
        required_return: round6(capData.required_return || 0),
        growth_rate_rationale: capData.growth_rate_rationale || null,
        required_return_rationale: capData.required_return_rationale || null,
        normalization_assumptions: capData.normalization_assumptions || null,
        sensitivity_analysis: capData.sensitivity_analysis || {},
        is_stale: false,
        stale_reason: null,
      };

      let result;
      if (existing) {
        const { data: updated, error } = await vsb.from('valuation_cap_earnings')
          .update(payload).eq('id', existing.id).select().single();
        if (error) throw new Error(error.message);
        result = updated;
      } else {
        const { data: created, error } = await vsb.from('valuation_cap_earnings').insert(payload).select().single();
        if (error) throw new Error(error.message);
        result = created;
      }

      await appendAudit(vsb, valuation_id, profileId, 'calculation_saved', null, { method: 'cap_earnings' }, { cap_id: result.id });

      // ── Phase 13.3D: Trigger staleness for cap earnings input change ────
      const CAP_STALENESS_TYPES = ['capitalization_of_earnings', 'reconciliation', 'confidence', 'scenario'];
      for (const dbType of CAP_STALENESS_TYPES) {
        await vsb.from('valuation_calculations')
          .update({ is_stale: true, stale_reason: 'cap_earnings_input_changed', stale_source_type: 'valuation_cap_earnings', stale_source_id: result.id, stale_marked_at: new Date().toISOString(), stale_marked_by_profile_id: profileId })
          .eq('valuation_id', valuation_id).eq('calculation_type', dbType);
      }
      // Cascade: reconciliation stale → equity bridge stale
      await vsb.from('valuation_calculations')
        .update({ is_stale: true, stale_reason: 'cap_earnings_input_changed', stale_source_type: 'valuation_cap_earnings', stale_source_id: result.id, stale_marked_at: new Date().toISOString(), stale_marked_by_profile_id: profileId })
        .eq('valuation_id', valuation_id)
        .eq('calculation_type', 'reconciliation')
        .eq('methodology', 'equity_bridge');
      // Mark conclusions stale
      await vsb.from('valuation_conclusions')
        .update({ advisor_approved: false, override_rationale: 'cap_earnings_input_changed' })
        .eq('valuation_id', valuation_id);

      return Response.json({ capEarnings: result });
    }

    if (action === 'calculateCapEarnings') {
      const { valuation_id } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationEdit(vsb, sb, profile, valuation_id);

      const { data: cap, error: capErr } = await vsb.from('valuation_cap_earnings')
        .select('*').eq('valuation_id', valuation_id).maybeSingle();
      if (capErr) throw new Error(capErr.message);
      if (!cap) return Response.json({ error: 'CAP_EARNINGS_NOT_FOUND' }, { status: 404 });

      const requiredReturn = round6(cap.required_return || 0);
      const growthRate = round6(cap.long_term_growth_rate || 0);
      const capRate = round6(requiredReturn - growthRate);

      if (capRate <= 0) {
        return Response.json({
          error: 'NON_POSITIVE_CAP_RATE',
          required_return: requiredReturn,
          growth_rate: growthRate,
          cap_rate: capRate,
          message: 'Capitalization rate must be positive. Adjust required return or growth rate.',
        }, { status: 400 });
      }

      const maintainableEarnings = round4(cap.maintainable_earnings || 0);
      if (maintainableEarnings <= 0) {
        return Response.json({ error: 'POSITIVE_EARNINGS_REQUIRED' }, { status: 400 });
      }

      const indicatedValue = round4(maintainableEarnings / capRate);

      // Update cap earnings record
      const { data: updated, error: updErr } = await vsb.from('valuation_cap_earnings')
        .update({
          capitalization_rate: capRate,
          indicated_value: indicatedValue,
        }).eq('id', cap.id).select().single();
      if (updErr) throw new Error(updErr.message);

      // Store calculation
      const { data: calc, error: calcErr } = await vsb.from('valuation_calculations').insert({
        valuation_id,
        calculation_type: 'capitalization_of_earnings',
        methodology: 'income_approach',
        earnings_basis: cap.earnings_basis,
        normalized_earnings: maintainableEarnings,
        enterprise_value_mid: indicatedValue,
        calculation_engine_version: ENGINE_VERSION,
        calculated_by_profile_id: profileId,
      }).select().single();
      if (calcErr) throw new Error(calcErr.message);

      // Store calculation lines
      const lines = [
        { line_type: 'normalized', line_label: `Maintainable ${cap.earnings_basis.toUpperCase()}`, amount: maintainableEarnings },
        { line_type: 'multiple_factor', line_label: `÷ Capitalization Rate (${round6(capRate * 100)}%)`, amount: capRate },
        { line_type: 'enterprise_value', line_label: '= Indicated Value', amount: indicatedValue },
      ];
      await storeCalcLines(valuation_id, lines.map(l => ({ ...l, calculation_id: calc.id })));

      await appendAudit(vsb, valuation_id, profileId, 'calculation_saved', null,
        { method: 'cap_earnings', cap_rate: capRate, indicated_value: indicatedValue },
        { calculation_id: calc.id });

      return Response.json({
        calculation_id: calc.id,
        cap_earnings_id: updated.id,
        maintainable_earnings: maintainableEarnings,
        required_return: requiredReturn,
        long_term_growth_rate: growthRate,
        capitalization_rate: capRate,
        indicated_value: indicatedValue,
      });
    }

    if (action === 'getCapEarnings') {
      const { valuation_id } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationView(vsb, sb, profile, valuation_id);

      const { data: cap, error } = await vsb.from('valuation_cap_earnings')
        .select('*').eq('valuation_id', valuation_id).maybeSingle();
      if (error) throw new Error(error.message);
      return Response.json({ capEarnings: cap });
    }

    // ════════════════════════════════════════════════════════════════════════
    // ASSET APPROACH
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'saveAssetItem') {
      const { valuation_id, ...itemData } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationEdit(vsb, sb, profile, valuation_id);

      const payload = {
        valuation_id,
        asset_category: itemData.asset_category,
        asset_name: itemData.asset_name,
        book_value: round4(itemData.book_value || 0),
        fair_market_value: round4(itemData.fair_market_value || 0),
        adjustment_amount: round4(itemData.adjustment_amount || 0),
        adjustment_reason: itemData.adjustment_reason || null,
        is_intangible: itemData.is_intangible || false,
        is_goodwill: itemData.is_goodwill || false,
        is_liability: itemData.is_liability || false,
        source_documentation: itemData.source_documentation || null,
        advisor_approved: itemData.advisor_approved || false,
        approved_by_profile_id: itemData.advisor_approved ? profileId : null,
        approved_at: itemData.advisor_approved ? new Date().toISOString() : null,
      };

      let result;
      if (itemData.asset_item_id) {
        const { data: updated, error } = await vsb.from('valuation_asset_items')
          .update(payload).eq('id', itemData.asset_item_id).select().single();
        if (error) throw new Error(error.message);
        result = updated;
      } else {
        const { data: created, error } = await vsb.from('valuation_asset_items').insert(payload).select().single();
        if (error) throw new Error(error.message);
        result = created;
      }

      await appendAudit(vsb, valuation_id, profileId, 'calculation_saved', null, { asset_item: result.id }, null);

      // ── Phase 13.3D: Trigger staleness for asset item change ────────────
      const ASSET_STALENESS_TYPES = ['adjusted_net_asset', 'asset_floor', 'reconciliation', 'scenario'];
      for (const dbType of ASSET_STALENESS_TYPES) {
        await vsb.from('valuation_calculations')
          .update({ is_stale: true, stale_reason: 'asset_item_changed', stale_source_type: 'valuation_asset_items', stale_source_id: result.id, stale_marked_at: new Date().toISOString(), stale_marked_by_profile_id: profileId })
          .eq('valuation_id', valuation_id).eq('calculation_type', dbType);
      }
      // Cascade: reconciliation stale → equity bridge stale
      await vsb.from('valuation_calculations')
        .update({ is_stale: true, stale_reason: 'asset_item_changed', stale_source_type: 'valuation_asset_items', stale_source_id: result.id, stale_marked_at: new Date().toISOString(), stale_marked_by_profile_id: profileId })
        .eq('valuation_id', valuation_id)
        .eq('calculation_type', 'reconciliation')
        .eq('methodology', 'equity_bridge');
      await vsb.from('valuation_conclusions')
        .update({ advisor_approved: false, override_rationale: 'asset_item_changed' })
        .eq('valuation_id', valuation_id);

      return Response.json({ assetItem: result });
    }

    if (action === 'getAssetItems') {
      const { valuation_id } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationView(vsb, sb, profile, valuation_id);

      const { data: items, error } = await vsb.from('valuation_asset_items')
        .select('*').eq('valuation_id', valuation_id)
        .order('asset_category', { ascending: true });
      if (error) throw new Error(error.message);
      return Response.json({ assetItems: items || [] });
    }

    if (action === 'deleteAssetItem') {
      const { asset_item_id } = data;
      if (!asset_item_id) return Response.json({ error: 'asset_item_id required' }, { status: 400 });
      await requireValuationEdit(vsb, sb, profile, data.valuation_id);

      await vsb.from('valuation_asset_items').delete().eq('id', asset_item_id);

      await appendAudit(vsb, data.valuation_id, profileId, 'calculation_saved', null,
        { asset_item_deleted: asset_item_id }, null);

      // ── Phase 13.3D: Trigger staleness for asset item deletion ──────────
      const DEL_ASSET_STALENESS_TYPES = ['adjusted_net_asset', 'asset_floor', 'reconciliation', 'scenario'];
      for (const dbType of DEL_ASSET_STALENESS_TYPES) {
        await vsb.from('valuation_calculations')
          .update({ is_stale: true, stale_reason: 'asset_item_changed', stale_source_type: 'valuation_asset_items', stale_source_id: asset_item_id, stale_marked_at: new Date().toISOString(), stale_marked_by_profile_id: profileId })
          .eq('valuation_id', data.valuation_id).eq('calculation_type', dbType);
      }
      // Cascade: reconciliation stale → equity bridge stale
      await vsb.from('valuation_calculations')
        .update({ is_stale: true, stale_reason: 'asset_item_changed', stale_source_type: 'valuation_asset_items', stale_source_id: asset_item_id, stale_marked_at: new Date().toISOString(), stale_marked_by_profile_id: profileId })
        .eq('valuation_id', data.valuation_id)
        .eq('calculation_type', 'reconciliation')
        .eq('methodology', 'equity_bridge');
      await vsb.from('valuation_conclusions')
        .update({ advisor_approved: false, override_rationale: 'asset_item_changed' })
        .eq('valuation_id', data.valuation_id);

      return Response.json({ success: true });
    }

    if (action === 'calculateAssetApproach') {
      const { valuation_id } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationEdit(vsb, sb, profile, valuation_id);

      const { data: items, error } = await vsb.from('valuation_asset_items')
        .select('*').eq('valuation_id', valuation_id)
        .eq('advisor_approved', true);
      if (error) throw new Error(error.message);

      let totalAssets = 0;
      let totalLiabilities = 0;
      let tangibleAssets = 0;
      const lines = [];

      for (const item of (items || [])) {
        const fmv = round4(item.fair_market_value || 0);
        if (item.is_liability) {
          totalLiabilities = round4(totalLiabilities + fmv);
          lines.push({ line_type: 'other', line_label: `− ${item.asset_name} (Liability)`, amount: -fmv });
        } else {
          totalAssets = round4(totalAssets + fmv);
          lines.push({ line_type: 'other', line_label: `+ ${item.asset_name}`, amount: fmv });
          if (!item.is_intangible && !item.is_goodwill) {
            tangibleAssets = round4(tangibleAssets + fmv);
          }
        }
      }

      const adjustedNetAssetValue = round4(totalAssets - totalLiabilities);
      const assetFloor = round4(tangibleAssets - totalLiabilities);

      lines.push({ line_type: 'enterprise_value', line_label: '= Adjusted Net Asset Value', amount: adjustedNetAssetValue });
      lines.push({ line_type: 'enterprise_value', line_label: '= Asset Floor Value (tangible only)', amount: assetFloor });

      // Store calculation
      const { data: calc, error: calcErr } = await vsb.from('valuation_calculations').insert({
        valuation_id,
        calculation_type: 'adjusted_net_asset',
        methodology: 'asset_approach',
        enterprise_value_mid: adjustedNetAssetValue,
        calculation_engine_version: ENGINE_VERSION,
        calculated_by_profile_id: profileId,
      }).select().single();
      if (calcErr) throw new Error(calcErr.message);

      await storeCalcLines(valuation_id, lines.map(l => ({ ...l, calculation_id: calc.id })));

      await appendAudit(vsb, valuation_id, profileId, 'calculation_saved', null,
        { method: 'asset', adjusted_nav: adjustedNetAssetValue, asset_floor: assetFloor },
        { calculation_id: calc.id });

      return Response.json({
        calculation_id: calc.id,
        total_assets: totalAssets,
        total_liabilities: totalLiabilities,
        tangible_assets: tangibleAssets,
        adjusted_net_asset_value: adjustedNetAssetValue,
        asset_floor_value: assetFloor,
        lines,
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // METHOD RECONCILIATION
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'saveMethodReconciliation') {
      const { valuation_id, method_weights } = data;
      if (!valuation_id || !method_weights || !Array.isArray(method_weights)) {
        return Response.json({ error: 'valuation_id and method_weights array required' }, { status: 400 });
      }
      await requireValuationEdit(vsb, sb, profile, valuation_id);

      // Validate weights total 100%
      const totalWeight = method_weights.reduce((sum, mw) => sum + round2(mw.weight || 0), 0);
      if (Math.abs(totalWeight - 100) > 0.01) {
        return Response.json({
          error: 'WEIGHTS_MUST_TOTAL_100',
          total_weight: totalWeight,
        }, { status: 400 });
      }

      // Update method selections with weights
      for (const mw of method_weights) {
        await vsb.from('valuation_method_selections')
          .update({ method_weight: round2(mw.weight || 0) })
          .eq('valuation_id', valuation_id)
          .eq('method_key', mw.method_key);
      }

      await appendAudit(vsb, valuation_id, profileId, 'calculation_saved', null,
        { reconciliation: method_weights.length, total_weight: totalWeight }, null);
      return Response.json({ method_weights: method_weights, total_weight: totalWeight });
    }

    if (action === 'calculateReconciledValue') {
      const { valuation_id } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationEdit(vsb, sb, profile, valuation_id);

      // Get all method selections with weights
      const { data: selections, error: selErr } = await vsb.from('valuation_method_selections')
        .select('*').eq('valuation_id', valuation_id)
        .neq('selection_role', 'excluded')
        .gt('method_weight', 0);
      if (selErr) throw new Error(selErr.message);

      if (!selections || selections.length === 0) {
        return Response.json({ error: 'NO_WEIGHTED_METHODS' }, { status: 400 });
      }

      // Validate weights total 100%
      const totalWeight = selections.reduce((sum, s) => sum + round2(s.method_weight || 0), 0);
      if (Math.abs(totalWeight - 100) > 0.01) {
        return Response.json({ error: 'WEIGHTS_MUST_TOTAL_100', total_weight: totalWeight }, { status: 400 });
      }

      // Get latest calculation for each method
      const methodKeys = selections.map(s => s.method_key);
      const methodCalcMap = {};
      for (const mk of methodKeys) {
        let calcType;
        if (mk === 'ebitda_multiple') calcType = 'ebitda_multiple';
        else if (mk === 'sde_multiple') calcType = 'sde_multiple';
        else if (mk === 'revenue_multiple') calcType = 'revenue_multiple';
        else if (mk === 'dcf') calcType = 'dcf';
        else if (mk === 'capitalization_of_earnings') calcType = 'capitalization_of_earnings';
        else if (mk === 'adjusted_net_asset') calcType = 'adjusted_net_asset';
        else if (mk === 'asset_floor') calcType = 'asset_floor';
        else continue;

        const { data: calc } = await vsb.from('valuation_calculations')
          .select('*').eq('valuation_id', valuation_id)
          .eq('calculation_type', calcType)
          .order('calculated_at', { ascending: false })
          .limit(1).maybeSingle();
        if (calc) methodCalcMap[mk] = calc;
      }

      // Calculate weighted enterprise value
      let weightedEVLow = 0;
      let weightedEVMid = 0;
      let weightedEVHigh = 0;
      const reconciliationLines = [];

      for (const sel of selections) {
        const calc = methodCalcMap[sel.method_key];
        if (!calc) continue;
        const weight = round2(sel.method_weight) / 100;
        const evLow = round4(calc.enterprise_value_low || calc.enterprise_value_mid || 0);
        const evMid = round4(calc.enterprise_value_mid || 0);
        const evHigh = round4(calc.enterprise_value_high || calc.enterprise_value_mid || 0);

        weightedEVLow = round4(weightedEVLow + evLow * weight);
        weightedEVMid = round4(weightedEVMid + evMid * weight);
        weightedEVHigh = round4(weightedEVHigh + evHigh * weight);

        reconciliationLines.push({
          method_key: sel.method_key,
          method_name: sel.method_name,
          weight: round2(sel.method_weight),
          ev_low: evLow,
          ev_mid: evMid,
          ev_high: evHigh,
          weighted_ev_low: round4(evLow * weight),
          weighted_ev_mid: round4(evMid * weight),
          weighted_ev_high: round4(evHigh * weight),
        });
      }

      // Store reconciliation calculation
      const { data: reconCalc, error: reconErr } = await vsb.from('valuation_calculations').insert({
        valuation_id,
        calculation_type: 'reconciliation',
        methodology: 'blended',
        enterprise_value_low: weightedEVLow,
        enterprise_value_mid: weightedEVMid,
        enterprise_value_high: weightedEVHigh,
        calculation_engine_version: ENGINE_VERSION,
        calculated_by_profile_id: profileId,
      }).select().single();
      if (reconErr) throw new Error(reconErr.message);

      const lines = reconciliationLines.map(rl => ({
        line_type: 'enterprise_value',
        line_label: `${rl.method_name} (${rl.weight}%): ${rl.ev_mid}`,
        amount: rl.weighted_ev_mid,
      }));
      lines.push({ line_type: 'enterprise_value', line_label: '= Weighted Enterprise Value Low', amount: weightedEVLow });
      lines.push({ line_type: 'enterprise_value', line_label: '= Weighted Enterprise Value Mid', amount: weightedEVMid });
      lines.push({ line_type: 'enterprise_value', line_label: '= Weighted Enterprise Value High', amount: weightedEVHigh });
      await storeCalcLines(valuation_id, lines.map(l => ({ ...l, calculation_id: reconCalc.id })));

      await appendAudit(vsb, valuation_id, profileId, 'calculation_saved', null,
        { reconciliation: 'blended', ev_low: weightedEVLow, ev_mid: weightedEVMid, ev_high: weightedEVHigh },
        { calculation_id: reconCalc.id });

      return Response.json({
        calculation_id: reconCalc.id,
        reconciliation_lines: reconciliationLines,
        weighted_ev_low: weightedEVLow,
        weighted_ev_mid: weightedEVMid,
        weighted_ev_high: weightedEVHigh,
        total_weight: totalWeight,
      });
    }

    if (action === 'getMethodReconciliation') {
      const { valuation_id } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationView(vsb, sb, profile, valuation_id);

      const { data: selections, error } = await vsb.from('valuation_method_selections')
        .select('*').eq('valuation_id', valuation_id)
        .neq('selection_role', 'excluded')
        .order('method_weight', { ascending: false });
      if (error) throw new Error(error.message);

      // Filter by methodology='blended' to avoid selecting the equity bridge
      // which shares calculation_type='reconciliation'
      const { data: reconCalc, error: reconErr } = await vsb.from('valuation_calculations')
        .select('*').eq('valuation_id', valuation_id)
        .eq('calculation_type', 'reconciliation')
        .eq('methodology', 'blended')
        .is('superseded_by_calculation_id', null)
        .order('calculated_at', { ascending: false })
        .limit(1).maybeSingle();
      if (reconErr) throw new Error(reconErr.message);

      // Also fetch the equity bridge calculation separately
      const { data: equityBridgeCalc, error: ebErr } = await vsb.from('valuation_calculations')
        .select('*').eq('valuation_id', valuation_id)
        .eq('calculation_type', 'reconciliation')
        .eq('methodology', 'equity_bridge')
        .is('superseded_by_calculation_id', null)
        .order('calculated_at', { ascending: false })
        .limit(1).maybeSingle();
      if (ebErr) throw new Error(ebErr.message);

      return Response.json({
        method_selections: selections || [],
        reconciliation_calculation: reconCalc,
        equity_bridge_calculation: equityBridgeCalc,
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // EQUITY VALUE BRIDGE
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'saveEquityBridgeItem') {
      const { valuation_id, ...itemData } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationEdit(vsb, sb, profile, valuation_id);

      const payload = {
        valuation_id,
        bridge_item_type: itemData.bridge_item_type,
        label: itemData.label,
        amount: round4(itemData.amount || 0),
        direction: itemData.direction || 'add',
        classification_rationale: itemData.classification_rationale || null,
        advisor_approved: itemData.advisor_approved || false,
        approved_by_profile_id: itemData.advisor_approved ? profileId : null,
        approved_at: itemData.advisor_approved ? new Date().toISOString() : null,
        display_order: itemData.display_order || 0,
      };

      let result;
      if (itemData.bridge_item_id) {
        const { data: updated, error } = await vsb.from('valuation_equity_bridge_items')
          .update(payload).eq('id', itemData.bridge_item_id).select().single();
        if (error) throw new Error(error.message);
        result = updated;
      } else {
        const { data: created, error } = await vsb.from('valuation_equity_bridge_items').insert(payload).select().single();
        if (error) throw new Error(error.message);
        result = created;
      }

      await appendAudit(vsb, valuation_id, profileId, 'calculation_saved', null, { equity_bridge_item: result.id }, null);

      // ── Phase 13.3D: Trigger staleness for equity bridge change ────────
      // Equity bridge uses calculation_type='reconciliation', methodology='equity_bridge'
      await vsb.from('valuation_calculations')
        .update({ is_stale: true, stale_reason: 'equity_bridge_item_changed', stale_source_type: 'valuation_equity_bridge_items', stale_source_id: result.id, stale_marked_at: new Date().toISOString(), stale_marked_by_profile_id: profileId })
        .eq('valuation_id', valuation_id)
        .eq('calculation_type', 'reconciliation')
        .eq('methodology', 'equity_bridge');
      // Invalidate advisor conclusion — equity value change affects conclusion
      await vsb.from('valuation_conclusions')
        .update({ advisor_approved: false, override_rationale: 'equity_bridge_item_changed' })
        .eq('valuation_id', valuation_id);

      return Response.json({ equityBridgeItem: result });
    }

    if (action === 'getEquityBridge') {
      const { valuation_id } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationView(vsb, sb, profile, valuation_id);

      const { data: items, error } = await vsb.from('valuation_equity_bridge_items')
        .select('*').eq('valuation_id', valuation_id)
        .order('display_order', { ascending: true });
      if (error) throw new Error(error.message);
      return Response.json({ equityBridgeItems: items || [] });
    }

    if (action === 'calculateEquityValue') {
      const { valuation_id, enterprise_value_low, enterprise_value_mid, enterprise_value_high, source_reconciliation_calculation_id } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationEdit(vsb, sb, profile, valuation_id);

      // If no EV passed, load from the latest approved blended reconciliation
      let evLow = enterprise_value_low;
      let evMid = enterprise_value_mid;
      let evHigh = enterprise_value_high;
      let sourceReconId = source_reconciliation_calculation_id || null;

      if (evMid === undefined || evMid === null) {
        const { data: reconCalc } = await vsb.from('valuation_calculations')
          .select('id, enterprise_value_low, enterprise_value_mid, enterprise_value_high')
          .eq('valuation_id', valuation_id)
          .eq('calculation_type', 'reconciliation')
          .eq('methodology', 'blended')
          .eq('is_approved', true)
          .is('superseded_by_calculation_id', null)
          .order('calculated_at', { ascending: false })
          .limit(1).maybeSingle();
        if (reconCalc) {
          evLow = reconCalc.enterprise_value_low;
          evMid = reconCalc.enterprise_value_mid;
          evHigh = reconCalc.enterprise_value_high;
          sourceReconId = reconCalc.id;
        }
      }

      const { data: items, error } = await vsb.from('valuation_equity_bridge_items')
        .select('*').eq('valuation_id', valuation_id)
        .eq('advisor_approved', true);
      if (error) throw new Error(error.message);

      let bridgeTotal = 0;
      const lines = [
        { line_type: 'equity_bridge', line_label: 'Reconciled Enterprise Value', amount: round4(evMid || 0) },
      ];

      for (const item of (items || [])) {
        const amount = round4(item.amount || 0);
        const signedAmount = item.direction === 'add' ? amount : -amount;
        bridgeTotal = round4(bridgeTotal + signedAmount);
        lines.push({
          line_type: 'equity_bridge',
          line_label: `${item.direction === 'add' ? '+' : '−'} ${item.label}`,
          amount: signedAmount,
        });
      }

      const equityValueLow = round4((evLow || 0) + bridgeTotal);
      const equityValueMid = round4((evMid || 0) + bridgeTotal);
      const equityValueHigh = round4((evHigh || 0) + bridgeTotal);

      lines.push({ line_type: 'equity_bridge', line_label: '= Equity Value', amount: equityValueMid });

      // Store calculation — record source reconciliation in source_snapshot
      const { data: calc, error: calcErr } = await vsb.from('valuation_calculations').insert({
        valuation_id,
        calculation_type: 'reconciliation',
        methodology: 'equity_bridge',
        enterprise_value_low: round4(evLow || 0),
        enterprise_value_mid: round4(evMid || 0),
        enterprise_value_high: round4(evHigh || 0),
        equity_value_low: equityValueLow,
        equity_value_mid: equityValueMid,
        equity_value_high: equityValueHigh,
        calculation_engine_version: ENGINE_VERSION,
        calculated_by_profile_id: profileId,
        source_snapshot: { source_reconciliation_calculation_id: sourceReconId },
      }).select().single();
      if (calcErr) throw new Error(calcErr.message);

      await storeCalcLines(valuation_id, lines.map(l => ({ ...l, calculation_id: calc.id })));

      await appendAudit(vsb, valuation_id, profileId, 'calculation_saved', null,
        { equity_value_low: equityValueLow, equity_value_mid: equityValueMid, equity_value_high: equityValueHigh, source_reconciliation_calculation_id: sourceReconId },
        { calculation_id: calc.id });

      return Response.json({
        calculation_id: calc.id,
        source_reconciliation_calculation_id: sourceReconId,
        bridge_total: bridgeTotal,
        equity_value_low: equityValueLow,
        equity_value_mid: equityValueMid,
        equity_value_high: equityValueHigh,
        lines,
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // CONFIDENCE SCORING
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'saveConfidenceScore') {
      const { valuation_id, category, sub_category, score, max_score, evidence_summary, advisor_assessment } = data;
      if (!valuation_id || !category || !sub_category) {
        return Response.json({ error: 'valuation_id, category, sub_category required' }, { status: 400 });
      }
      await requireValuationEdit(vsb, sb, profile, valuation_id);

      const { data: existing } = await vsb.from('valuation_confidence_scores')
        .select('id').eq('valuation_id', valuation_id)
        .eq('category', category).eq('sub_category', sub_category).maybeSingle();

      const payload = {
        valuation_id, category, sub_category,
        score: round2(score || 0),
        max_score: round2(max_score || 100),
        evidence_summary: evidence_summary || null,
        advisor_assessment: advisor_assessment || null,
        assessed_at: new Date().toISOString(),
        assessed_by_profile_id: profileId,
      };

      let result;
      if (existing) {
        const { data: updated, error } = await vsb.from('valuation_confidence_scores')
          .update(payload).eq('id', existing.id).select().single();
        if (error) throw new Error(error.message);
        result = updated;
      } else {
        const { data: created, error } = await vsb.from('valuation_confidence_scores').insert(payload).select().single();
        if (error) throw new Error(error.message);
        result = created;
      }

      // ── Phase 13.3D: Trigger staleness for confidence input change ──────
      await vsb.from('valuation_calculations')
        .update({ is_stale: true, stale_reason: 'confidence_input_changed', stale_source_type: 'valuation_confidence_scores', stale_source_id: result.id, stale_marked_at: new Date().toISOString(), stale_marked_by_profile_id: profileId })
        .eq('valuation_id', valuation_id).eq('calculation_type', 'confidence');
      await vsb.from('valuation_conclusions')
        .update({ advisor_approved: false, override_rationale: 'confidence_input_changed' })
        .eq('valuation_id', valuation_id);

      await appendAudit(vsb, valuation_id, profileId, 'calculation_saved', null, { confidence_input: result.id }, null);
      return Response.json({ confidenceScore: result });
    }

    if (action === 'calculateOverallConfidence') {
      const { valuation_id, category_weights, forecast_not_applicable, forecast_not_applicable_reason } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationEdit(vsb, sb, profile, valuation_id);

      // Phase 13.3D: Five confidence categories with default weights.
      // Forecast is included for DCF-based valuations.
      // If forecast is NOT_APPLICABLE, its weight is redistributed proportionally.
      const defaultWeights = { data: 25, earnings: 25, market: 20, operational: 15, forecast: 15 };
      const weights = category_weights || defaultWeights;

      const { data: scores, error } = await vsb.from('valuation_confidence_scores')
        .select('*').eq('valuation_id', valuation_id)
        .neq('is_overall', true);
      if (error) throw new Error(error.message);

      // If forecast is explicitly marked not applicable, persist it
      if (forecast_not_applicable) {
        const { data: existingNA } = await vsb.from('valuation_confidence_scores')
          .select('id').eq('valuation_id', valuation_id)
          .eq('category', 'forecast').eq('is_not_applicable', true).maybeSingle();
        const naPayload = {
          valuation_id, category: 'forecast', sub_category: 'not_applicable',
          score: 0, max_score: 100,
          is_not_applicable: true,
          not_applicable_reason: forecast_not_applicable_reason || 'Forecast confidence not applicable for this valuation',
          assessed_at: new Date().toISOString(),
          assessed_by_profile_id: profileId,
        };
        if (existingNA) {
          await vsb.from('valuation_confidence_scores').update(naPayload).eq('id', existingNA.id);
        } else {
          await vsb.from('valuation_confidence_scores').insert(naPayload);
        }
      }

      // Calculate average score per category (excluding not_applicable)
      const categoryScores = {};
      const notApplicableCategories = new Set();
      for (const s of (scores || [])) {
        if (s.is_not_applicable) {
          notApplicableCategories.add(s.category);
          continue;
        }
        if (!categoryScores[s.category]) categoryScores[s.category] = { total: 0, count: 0 };
        categoryScores[s.category].total += round2(s.score || 0);
        categoryScores[s.category].count++;
      }

      // Determine active weights: skip categories with no scores or marked NA
      const activeWeights = {};
      let rawWeightSum = 0;
      for (const [cat, w] of Object.entries(weights)) {
        const hasScores = categoryScores[cat] && categoryScores[cat].count > 0;
        const isNA = notApplicableCategories.has(cat);
        if (hasScores && !isNA) {
          activeWeights[cat] = w;
          rawWeightSum += w;
        }
      }

      if (rawWeightSum === 0) return Response.json({ error: 'NO_CONFIDENCE_SCORES' }, { status: 400 });

      // Redistribute weights proportionally to preserve total = 100%
      const normalizedWeights = {};
      for (const [cat, w] of Object.entries(activeWeights)) {
        normalizedWeights[cat] = round2((w / rawWeightSum) * 100);
      }

      let overallScore = 0;
      const categoryResults = {};
      for (const [cat, w] of Object.entries(normalizedWeights)) {
        const avgScore = round2(categoryScores[cat].total / categoryScores[cat].count);
        overallScore = round2(overallScore + avgScore * (w / 100));
        categoryResults[cat] = {
          average_score: avgScore,
          weight: w,
          sub_scores: categoryScores[cat].count,
          original_weight: weights[cat],
          redistributed: w !== weights[cat],
        };
      }

      // Record NA categories transparently
      for (const cat of notApplicableCategories) {
        categoryResults[cat] = {
          not_applicable: true,
          original_weight: weights[cat] || 0,
          redistributed: true,
        };
      }

      // Store overall confidence
      const { data: existing } = await vsb.from('valuation_confidence_scores')
        .select('id').eq('valuation_id', valuation_id)
        .eq('is_overall', true).maybeSingle();

      const payload = {
        valuation_id,
        category: 'data',
        sub_category: 'overall',
        score: overallScore,
        max_score: 100,
        evidence_summary: JSON.stringify({ categoryResults, weights: normalizedWeights, original_weights: weights }),
        assessed_at: new Date().toISOString(),
        assessed_by_profile_id: profileId,
        is_overall: true,
      };

      let result;
      if (existing) {
        const { data: updated, error } = await vsb.from('valuation_confidence_scores')
          .update(payload).eq('id', existing.id).select().single();
        if (error) throw new Error(error.message);
        result = updated;
      } else {
        const { data: created, error } = await vsb.from('valuation_confidence_scores').insert(payload).select().single();
        if (error) throw new Error(error.message);
        result = created;
      }

      await appendAudit(vsb, valuation_id, profileId, 'calculation_saved', null,
        { overall_confidence: overallScore, category_results: categoryResults }, { confidence_id: result.id });

      return Response.json({
        overall_confidence: overallScore,
        category_results: categoryResults,
        normalized_weights: normalizedWeights,
        original_weights: weights,
        not_applicable_categories: Array.from(notApplicableCategories),
        confidence_id: result.id,
      });
    }

    if (action === 'getConfidenceScores') {
      const { valuation_id } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationView(vsb, sb, profile, valuation_id);

      const { data: scores, error } = await vsb.from('valuation_confidence_scores')
        .select('*').eq('valuation_id', valuation_id)
        .order('category', { ascending: true });
      if (error) throw new Error(error.message);
      return Response.json({ confidenceScores: scores || [] });
    }

    // ════════════════════════════════════════════════════════════════════════
    // SCENARIO MODELING
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'saveScenarioCalculation') {
      const { valuation_id, ...scData } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationEdit(vsb, sb, profile, valuation_id);

      const payload = {
        valuation_id,
        scenario_type: scData.scenario_type,
        scenario_name: scData.scenario_name || scData.scenario_type,
        description: scData.description || null,
        normalized_earnings: round4(scData.normalized_earnings || 0),
        applied_multiple: round4(scData.applied_multiple || 0),
        cash_adjustment: round4(scData.cash_adjustment || 0),
        debt_adjustment: round4(scData.debt_adjustment || 0),
        working_capital_adjustment: round4(scData.working_capital_adjustment || 0),
        enterprise_value: round4(scData.enterprise_value || 0),
        equity_value: round4(scData.equity_value || 0),
        confidence_score: round2(scData.confidence_score || 0),
        assumptions: scData.assumptions || [],
        is_recommended: scData.is_recommended || false,
      };

      // Upsert by scenario_type
      const { data: existing } = await vsb.from('valuation_scenarios')
        .select('id').eq('valuation_id', valuation_id)
        .eq('scenario_type', scData.scenario_type).maybeSingle();

      let result;
      if (existing) {
        const { data: updated, error } = await vsb.from('valuation_scenarios')
          .update(payload).eq('id', existing.id).select().single();
        if (error) throw new Error(error.message);
        result = updated;
      } else {
        const { data: created, error } = await vsb.from('valuation_scenarios').insert(payload).select().single();
        if (error) throw new Error(error.message);
        result = created;
      }

      await appendAudit(vsb, valuation_id, profileId, 'calculation_saved', null,
        { scenario_type: scData.scenario_type, enterprise_value: scData.enterprise_value },
        { scenario_id: result.id });

      // ── Phase 13.3D: Trigger staleness for scenario assumption change ────
      await vsb.from('valuation_calculations')
        .update({ is_stale: true, stale_reason: 'scenario_assumption_changed', stale_source_type: 'valuation_scenarios', stale_source_id: result.id, stale_marked_at: new Date().toISOString(), stale_marked_by_profile_id: profileId })
        .eq('valuation_id', valuation_id).eq('calculation_type', 'scenario');

      return Response.json({ scenario: result });
    }

    if (action === 'getScenarioCalculations') {
      const { valuation_id } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationView(vsb, sb, profile, valuation_id);

      const { data: scenarios, error } = await vsb.from('valuation_scenarios')
        .select('*').eq('valuation_id', valuation_id)
        .order('scenario_type', { ascending: true });
      if (error) throw new Error(error.message);
      return Response.json({ scenarios: scenarios || [] });
    }

    // ════════════════════════════════════════════════════════════════════════
    // VALUE DRIVERS
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'saveValueDriver') {
      const { valuation_id, ...vdData } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationEdit(vsb, sb, profile, valuation_id);

      // Get business_id from valuation
      const { data: val } = await vsb.from('business_valuations')
        .select('business_id').eq('id', valuation_id).maybeSingle();
      if (!val) return Response.json({ error: 'VALUATION_NOT_FOUND' }, { status: 404 });

      const payload = {
        valuation_id,
        business_id: val.business_id,
        driver_key: vdData.driver_key,
        driver_name: vdData.driver_name,
        category: vdData.category,
        current_state: vdData.current_state || null,
        target_state: vdData.target_state || null,
        impact_type: vdData.impact_type || 'neutral',
        estimated_ebitda_impact: round4(vdData.estimated_ebitda_impact || 0),
        estimated_multiple_impact: round4(vdData.estimated_multiple_impact || 0),
        estimated_enterprise_value_impact_low: round4(vdData.estimated_enterprise_value_impact_low || 0),
        estimated_enterprise_value_impact_high: round4(vdData.estimated_enterprise_value_impact_high || 0),
        confidence_score: round2(vdData.confidence_score || 0),
        priority: vdData.priority || 'medium',
        difficulty: vdData.difficulty || 'medium',
        estimated_timeline_months: vdData.estimated_timeline_months || null,
        evidence_summary: vdData.evidence_summary || null,
        advisor_status: vdData.advisor_status || 'identified',
        client_visible: vdData.client_visible || false,
      };

      // Upsert by driver_key
      const { data: existing } = await vsb.from('valuation_value_drivers')
        .select('id').eq('valuation_id', valuation_id)
        .eq('driver_key', vdData.driver_key).maybeSingle();

      let result;
      if (existing) {
        const { data: updated, error } = await vsb.from('valuation_value_drivers')
          .update(payload).eq('id', existing.id).select().single();
        if (error) throw new Error(error.message);
        result = updated;
      } else {
        const { data: created, error } = await vsb.from('valuation_value_drivers').insert(payload).select().single();
        if (error) throw new Error(error.message);
        result = created;
      }

      await appendAudit(vsb, valuation_id, profileId, 'value_driver_saved', null,
        { driver_key: vdData.driver_key }, { driver_id: result.id });

      return Response.json({ valueDriver: result });
    }

    if (action === 'getValueDrivers') {
      const { valuation_id, category } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationView(vsb, sb, profile, valuation_id);

      let query = vsb.from('valuation_value_drivers')
        .select('*').eq('valuation_id', valuation_id);
      if (category) query = query.eq('category', category);
      query = query.order('category', { ascending: true });

      const { data: drivers, error } = await query;
      if (error) throw new Error(error.message);
      return Response.json({ valueDrivers: drivers || [] });
    }

    if (action === 'updateValueDriver') {
      const { driver_id, ...updates } = data;
      if (!driver_id) return Response.json({ error: 'driver_id required' }, { status: 400 });

      const { data: driver } = await vsb.from('valuation_value_drivers')
        .select('valuation_id').eq('id', driver_id).maybeSingle();
      if (!driver) return Response.json({ error: 'DRIVER_NOT_FOUND' }, { status: 404 });

      await requireValuationEdit(vsb, sb, profile, driver.valuation_id);

      const cleanUpdates = {};
      if (updates.advisor_status) cleanUpdates.advisor_status = updates.advisor_status;
      if (updates.client_visible !== undefined) cleanUpdates.client_visible = updates.client_visible;
      if (updates.priority) cleanUpdates.priority = updates.priority;
      if (updates.confidence_score !== undefined) cleanUpdates.confidence_score = round2(updates.confidence_score);
      if (updates.estimated_ebitda_impact !== undefined) cleanUpdates.estimated_ebitda_impact = round4(updates.estimated_ebitda_impact);
      if (updates.estimated_multiple_impact !== undefined) cleanUpdates.estimated_multiple_impact = round4(updates.estimated_multiple_impact);

      const { data: updated, error } = await vsb.from('valuation_value_drivers')
        .update(cleanUpdates).eq('id', driver_id).select().single();
      if (error) throw new Error(error.message);

      return Response.json({ valueDriver: updated });
    }

    // ════════════════════════════════════════════════════════════════════════
    // ADVISOR CONCLUSION
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'saveAdvisorConclusion') {
      const { valuation_id, ...cData } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationEdit(vsb, sb, profile, valuation_id);

      const payload = {
        valuation_id,
        conclusion_type: cData.conclusion_type || 'indicated',
        maintainable_earnings: round4(cData.maintainable_earnings || 0),
        primary_method: cData.primary_method || null,
        secondary_method: cData.secondary_method || null,
        method_weights: cData.method_weights || {},
        enterprise_value_low: round4(cData.enterprise_value_low || 0),
        enterprise_value_mid: round4(cData.enterprise_value_mid || 0),
        enterprise_value_high: round4(cData.enterprise_value_high || 0),
        equity_value_low: round4(cData.equity_value_low || 0),
        equity_value_mid: round4(cData.equity_value_mid || 0),
        equity_value_high: round4(cData.equity_value_high || 0),
        defensible_value_low: round4(cData.defensible_value_low || 0),
        defensible_value_mid: round4(cData.defensible_value_mid || 0),
        defensible_value_high: round4(cData.defensible_value_high || 0),
        confidence_score: round2(cData.confidence_score || 0),
        key_assumptions: cData.key_assumptions || [],
        key_limitations: cData.key_limitations || [],
        client_visible_drivers: cData.client_visible_drivers || [],
        client_visible_risks: cData.client_visible_risks || [],
        client_visible_opportunities: cData.client_visible_opportunities || [],
        disclosures: cData.disclosures || null,
        advisor_approved: cData.advisor_approved || false,
        approved_by_profile_id: cData.advisor_approved ? profileId : null,
        approved_at: cData.advisor_approved ? new Date().toISOString() : null,
        override_rationale: cData.override_rationale || null,
      };

      // Upsert by conclusion_type
      const { data: existing } = await vsb.from('valuation_conclusions')
        .select('id').eq('valuation_id', valuation_id)
        .eq('conclusion_type', payload.conclusion_type).maybeSingle();

      let result;
      if (existing) {
        const { data: updated, error } = await vsb.from('valuation_conclusions')
          .update(payload).eq('id', existing.id).select().single();
        if (error) throw new Error(error.message);
        result = updated;
      } else {
        const { data: created, error } = await vsb.from('valuation_conclusions').insert(payload).select().single();
        if (error) throw new Error(error.message);
        result = created;
      }

      await appendAudit(vsb, valuation_id, profileId, 'calculation_saved', null,
        { conclusion_type: payload.conclusion_type, approved: payload.advisor_approved },
        { conclusion_id: result.id });

      return Response.json({ conclusion: result });
    }

    if (action === 'getAdvisorConclusion') {
      const { valuation_id, conclusion_type } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationView(vsb, sb, profile, valuation_id);

      let query = vsb.from('valuation_conclusions')
        .select('*').eq('valuation_id', valuation_id);
      if (conclusion_type) query = query.eq('conclusion_type', conclusion_type);
      query = query.order('conclusion_type', { ascending: true });

      const { data: conclusions, error } = await query;
      if (error) throw new Error(error.message);
      return Response.json({ conclusions: conclusions || [] });
    }

    // ════════════════════════════════════════════════════════════════════════
    // CALCULATION SUMMARY & STALENESS
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'getCalculationSummary') {
      const { valuation_id } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationView(vsb, sb, profile, valuation_id);

      const { data: calcs } = await vsb.from('valuation_calculations')
        .select('*').eq('valuation_id', valuation_id)
        .order('calculated_at', { ascending: false });
      const { data: methodSels } = await vsb.from('valuation_method_selections')
        .select('*').eq('valuation_id', valuation_id);
      const { data: dcf } = await vsb.from('valuation_dcf_projections')
        .select('*').eq('valuation_id', valuation_id).maybeSingle();
      const { data: capEarnings } = await vsb.from('valuation_cap_earnings')
        .select('*').eq('valuation_id', valuation_id).maybeSingle();
      const { data: assetItems } = await vsb.from('valuation_asset_items')
        .select('*').eq('valuation_id', valuation_id);
      const { data: equityBridge } = await vsb.from('valuation_equity_bridge_items')
        .select('*').eq('valuation_id', valuation_id);
      const { data: confidenceScores } = await vsb.from('valuation_confidence_scores')
        .select('*').eq('valuation_id', valuation_id);
      const { data: conclusions } = await vsb.from('valuation_conclusions')
        .select('*').eq('valuation_id', valuation_id);
      const { data: scenarios } = await vsb.from('valuation_scenarios')
        .select('*').eq('valuation_id', valuation_id);
      const { data: valueDrivers } = await vsb.from('valuation_value_drivers')
        .select('*').eq('valuation_id', valuation_id);
      const { data: weightings } = await vsb.from('valuation_historical_weighting')
        .select('*').eq('valuation_id', valuation_id);

      return Response.json({
        calculations: calcs || [],
        method_selections: methodSels || [],
        dcf: dcf || null,
        cap_earnings: capEarnings || null,
        asset_items: assetItems || [],
        equity_bridge: equityBridge || [],
        confidence_scores: confidenceScores || [],
        conclusions: conclusions || [],
        scenarios: scenarios || [],
        value_drivers: valueDrivers || [],
        historical_weightings: weightings || [],
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // STALENESS — Enhanced with dependency map
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'markCalculationsStale') {
      const { valuation_id, source_change, source_id, source_type } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationEdit(vsb, sb, profile, valuation_id);

      // Staleness dependency map
      const STALENESS_MAP = {
        financial_period_changed: ['normalized_earnings', 'historical_weighting', 'ebitda_multiple', 'sde_multiple', 'revenue_multiple', 'capitalization_of_earnings', 'dcf', 'reconciliation', 'equity_bridge', 'confidence', 'scenario', 'advisor_conclusion', 'client_safe_summary'],
        adjustment_changed: ['normalized_earnings', 'historical_weighting', 'ebitda_multiple', 'sde_multiple', 'capitalization_of_earnings', 'reconciliation', 'confidence', 'scenario', 'advisor_conclusion', 'client_safe_summary'],
        benchmark_changed: ['ebitda_multiple', 'sde_multiple', 'revenue_multiple', 'reconciliation', 'confidence', 'scenario', 'advisor_conclusion', 'client_safe_summary'],
        method_selection_changed: ['reconciliation', 'confidence', 'scenario', 'advisor_conclusion', 'client_safe_summary'],
        dcf_assumption_changed: ['dcf', 'reconciliation', 'confidence', 'scenario', 'advisor_conclusion', 'client_safe_summary'],
        asset_item_changed: ['adjusted_net_asset', 'asset_floor', 'reconciliation', 'equity_bridge', 'scenario', 'advisor_conclusion', 'client_safe_summary'],
        equity_bridge_item_changed: ['equity_bridge', 'advisor_conclusion', 'client_safe_summary'],
        confidence_input_changed: ['confidence', 'advisor_conclusion', 'client_safe_summary'],
        scenario_assumption_changed: ['scenario', 'client_safe_summary'],
        historical_weighting_changed: ['historical_weighting', 'ebitda_multiple', 'sde_multiple', 'capitalization_of_earnings', 'reconciliation', 'confidence', 'scenario', 'advisor_conclusion', 'client_safe_summary'],
        answer_changed: ['confidence', 'scenario', 'advisor_conclusion', 'client_safe_summary'],
      };

      const affectedTypes = STALENESS_MAP[source_change] || [];
      const staleReason = source_change || 'input_changed';
      const staleMarkedAt = new Date().toISOString();

      // Map calculation types to DB calculation_type values
      // Note: equity_bridge uses calculation_type='reconciliation', methodology='equity_bridge'
      // so it is handled separately below the loop.
      const CALC_TYPE_MAP = {
        normalized_earnings: 'normalized_earnings',
        ebitda_multiple: 'ebitda_multiple',
        sde_multiple: 'sde_multiple',
        revenue_multiple: 'revenue_multiple',
        dcf: 'dcf',
        capitalization_of_earnings: 'capitalization_of_earnings',
        adjusted_net_asset: 'adjusted_net_asset',
        asset_floor: 'asset_floor',
        reconciliation: 'reconciliation',
      };

      const markedCount = { calculations: 0, tables: 0 };

      // Mark valuation_calculations stale for matching calculation types
      for (const [calcKey, dbType] of Object.entries(CALC_TYPE_MAP)) {
        if (affectedTypes.includes(calcKey)) {
          const { data: updated, error } = await vsb.from('valuation_calculations')
            .update({
              is_stale: true,
              stale_reason: staleReason,
              stale_source_type: source_type || null,
              stale_source_id: source_id || null,
              stale_marked_at: staleMarkedAt,
              stale_marked_by_profile_id: profileId,
            })
            .eq('valuation_id', valuation_id)
            .eq('calculation_type', dbType);
          if (error) console.warn('Stale mark error:', error.message);
          else markedCount.calculations++;
        }
      }

      // Handle equity_bridge separately (uses methodology='equity_bridge')
      if (affectedTypes.includes('equity_bridge')) {
        const { error: ebErr } = await vsb.from('valuation_calculations')
          .update({
            is_stale: true,
            stale_reason: staleReason,
            stale_source_type: source_type || null,
            stale_source_id: source_id || null,
            stale_marked_at: staleMarkedAt,
            stale_marked_by_profile_id: profileId,
          })
          .eq('valuation_id', valuation_id)
          .eq('calculation_type', 'reconciliation')
          .eq('methodology', 'equity_bridge');
        if (ebErr) console.warn('Equity bridge stale mark error:', ebErr.message);
        else markedCount.calculations++;
      }

      // Mark DCF and cap_earnings tables stale if affected
      if (affectedTypes.includes('dcf')) {
        await vsb.from('valuation_dcf_projections')
          .update({ is_stale: true, stale_reason: staleReason })
          .eq('valuation_id', valuation_id);
        markedCount.tables++;
      }
      if (affectedTypes.includes('capitalization_of_earnings')) {
        await vsb.from('valuation_cap_earnings')
          .update({ is_stale: true, stale_reason: staleReason })
          .eq('valuation_id', valuation_id);
        markedCount.tables++;
      }

      // Mark conclusions stale
      if (affectedTypes.includes('advisor_conclusion')) {
        await vsb.from('valuation_conclusions')
          .update({ advisor_approved: false, override_rationale: staleReason })
          .eq('valuation_id', valuation_id);
      }

      await appendAudit(vsb, valuation_id, profileId, 'calculation_saved', null,
        { stale: true, reason: staleReason, source_change, affected_types: affectedTypes, marked: markedCount },
        null);

      return Response.json({
        success: true,
        stale_reason: staleReason,
        source_change,
        affected_calculations: affectedTypes,
        marked_count: markedCount,
      });
    }

    if (action === 'getStaleCalculations') {
      const { valuation_id } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationView(vsb, sb, profile, valuation_id);

      // Get stale calculations from valuation_calculations
      const { data: staleCalcs, error: calcErr } = await vsb.from('valuation_calculations')
        .select('id, calculation_type, methodology, is_stale, stale_reason, stale_source_type, stale_source_id, stale_marked_at, calculated_at')
        .eq('valuation_id', valuation_id)
        .eq('is_stale', true)
        .order('stale_marked_at', { ascending: false });
      if (calcErr) throw new Error(calcErr.message);

      // Get stale DCF
      const { data: dcf } = await vsb.from('valuation_dcf_projections')
        .select('id, is_stale, stale_reason').eq('valuation_id', valuation_id).maybeSingle();
      // Get stale cap_earnings
      const { data: cap } = await vsb.from('valuation_cap_earnings')
        .select('id, is_stale, stale_reason').eq('valuation_id', valuation_id).maybeSingle();

      const staleItems = [];
      for (const c of (staleCalcs || [])) {
        staleItems.push({
          table: 'valuation_calculations',
          id: c.id,
          calculation_type: c.calculation_type,
          reason: c.stale_reason,
          source_type: c.stale_source_type,
          source_id: c.stale_source_id,
          marked_at: c.stale_marked_at,
        });
      }
      if (dcf?.is_stale) staleItems.push({ table: 'dcf', id: dcf.id, reason: dcf.stale_reason });
      if (cap?.is_stale) staleItems.push({ table: 'cap_earnings', id: cap.id, reason: cap.stale_reason });

      return Response.json({ stale_items: staleItems, stale_count: staleItems.length });
    }

    // ════════════════════════════════════════════════════════════════════════
    // CALCULATION LINE RETRIEVAL
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'getCalculationLines') {
      const { valuation_id, calculation_id } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationView(vsb, sb, profile, valuation_id);

      let query = vsb.from('valuation_calculation_lines')
        .select('*').eq('valuation_id', valuation_id);
      if (calculation_id) {
        query = query.eq('calculation_id', calculation_id);
      }
      query = query.order('created_at', { ascending: true });
      const { data: lines, error } = await query;
      if (error) throw new Error(error.message);

      return Response.json({ lines: lines || [], count: (lines || []).length });
    }

    // ════════════════════════════════════════════════════════════════════════
    // APPROVE CALCULATION
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'approveCalculation') {
      const { valuation_id, calculation_id, approved } = data;
      if (!valuation_id || !calculation_id) {
        return Response.json({ error: 'valuation_id and calculation_id required' }, { status: 400 });
      }
      // Require review permission (or super admin)
      const ctx = await requireValuationView(vsb, sb, profile, valuation_id);
      if (profile.app_role !== 'super_admin' && (!ctx || !ctx.assignment || !ctx.assignment.can_review)) {
        return Response.json({ error: 'PERMISSION_DENIED' }, { status: 403 });
      }

      const { data: updated, error } = await vsb.from('valuation_calculations')
        .update({
          is_approved: approved !== false,
          approved_by_profile_id: profileId,
          approved_at: approved !== false ? new Date().toISOString() : null,
        })
        .eq('id', calculation_id).eq('valuation_id', valuation_id)
        .select().single();
      if (error) throw new Error(error.message);

      await appendAudit(vsb, valuation_id, profileId, 'reviewed', null,
        { calculation_id, approved: approved !== false }, null);

      return Response.json({ calculation: updated });
    }

    // ════════════════════════════════════════════════════════════════════════
    // SUPERSEDE CALCULATION (mark old as superseded by new)
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'supersedeCalculation') {
      const { valuation_id, old_calculation_id, new_calculation_id } = data;
      if (!valuation_id || !old_calculation_id || !new_calculation_id) {
        return Response.json({ error: 'valuation_id, old_calculation_id, new_calculation_id required' }, { status: 400 });
      }
      await requireValuationEdit(vsb, sb, profile, valuation_id);

      const { error } = await vsb.from('valuation_calculations')
        .update({ superseded_by_calculation_id: new_calculation_id })
        .eq('id', old_calculation_id).eq('valuation_id', valuation_id);
      if (error) throw new Error(error.message);

      await appendAudit(vsb, valuation_id, profileId, 'calculation_saved', null,
        { superseded: old_calculation_id, by: new_calculation_id }, null);

      return Response.json({ success: true, superseded: old_calculation_id, by: new_calculation_id });
    }

    // ════════════════════════════════════════════════════════════════════════
    // PERSIST CALCULATION ENVELOPE
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'persistCalculationEnvelope') {
      const { valuation_id, calculation_id, envelope } = data;
      if (!valuation_id || !calculation_id || !envelope) {
        return Response.json({ error: 'valuation_id, calculation_id, envelope required' }, { status: 400 });
      }
      await requireValuationEdit(vsb, sb, profile, valuation_id);

      const { error } = await vsb.from('valuation_calculations')
        .update({
          calculation_type_label: envelope.calculation_type || null,
          input_hash: envelope.input_hash || null,
          output_hash: envelope.output_hash || null,
          warnings: envelope.warnings || [],
          errors: envelope.errors || [],
          duration_ms: envelope.duration_ms || null,
          source_snapshot: envelope.inputs_summary || {},
          calculation_engine_version: envelope.engine_version || ENGINE_VERSION,
          methodology_version: envelope.methodology_version || '1.0.0',
        })
        .eq('id', calculation_id).eq('valuation_id', valuation_id);
      if (error) throw new Error(error.message);

      return Response.json({ success: true, calculation_id });
    }

    // ════════════════════════════════════════════════════════════════════════
    // VALIDATE PUBLICATION READINESS
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'validatePublicationReadiness') {
      const { valuation_id } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationView(vsb, sb, profile, valuation_id);

      const criticalBlockers = [];
      const warnings = [];
      const staleCalculations = [];
      const missingApprovals = [];
      const missingInputs = [];

      // 1. Check for stale calculations
      const { data: staleCalcs } = await vsb.from('valuation_calculations')
        .select('id, calculation_type, stale_reason')
        .eq('valuation_id', valuation_id)
        .eq('is_stale', true);
      for (const sc of (staleCalcs || [])) {
        staleCalculations.push({ calculation_id: sc.id, type: sc.calculation_type, reason: sc.stale_reason });
        criticalBlockers.push(`Stale calculation: ${sc.calculation_type} (reason: ${sc.stale_reason || 'unknown'})`);
      }

      // 2. Check for stale DCF/cap_earnings
      const { data: dcf } = await vsb.from('valuation_dcf_projections')
        .select('id, is_stale').eq('valuation_id', valuation_id).maybeSingle();
      if (dcf?.is_stale) {
        staleCalculations.push({ table: 'dcf', id: dcf.id, reason: 'stale' });
        criticalBlockers.push('DCF calculation is stale');
      }
      const { data: cap } = await vsb.from('valuation_cap_earnings')
        .select('id, is_stale').eq('valuation_id', valuation_id).maybeSingle();
      if (cap?.is_stale) {
        staleCalculations.push({ table: 'cap_earnings', id: cap.id, reason: 'stale' });
        criticalBlockers.push('Capitalization calculation is stale');
      }

      // 3. Check for approved financial periods
      const { count: approvedPeriods } = await vsb.from('valuation_financials')
        .select('id', { count: 'exact', head: true })
        .eq('valuation_id', valuation_id)
        .eq('advisor_approval_status', 'approved');
      if (!approvedPeriods || approvedPeriods === 0) {
        missingInputs.push('No approved financial periods');
        criticalBlockers.push('At least one approved financial period is required');
      }

      // 4. Check for approved adjustments
      const { count: approvedAdjustments } = await vsb.from('valuation_adjustments')
        .select('id', { count: 'exact', head: true })
        .eq('valuation_id', valuation_id)
        .eq('advisor_approval_status', 'approved');
      if (!approvedAdjustments || approvedAdjustments === 0) {
        warnings.push('No approved adjustments — normalized earnings may not reflect true earnings');
      }

      // 5. Check for method selections
      const { data: methodSels } = await vsb.from('valuation_method_selections')
        .select('*').eq('valuation_id', valuation_id)
        .neq('selection_role', 'excluded');
      if (!methodSels || methodSels.length === 0) {
        missingInputs.push('No method selections');
        criticalBlockers.push('At least one valuation method must be selected');
      }

      // 6. Check method weights total 100%
      const totalWeight = (methodSels || []).reduce((sum, s) => sum + round2(s.method_weight || 0), 0);
      if (methodSels && methodSels.length > 0 && Math.abs(totalWeight - 100) > 0.01) {
        criticalBlockers.push(`Method weights total ${totalWeight}% — must be exactly 100%`);
      }

      // 7. Check for approved BLENDED reconciliation (methodology='blended')
      //    The equity bridge also uses calculation_type='reconciliation' but with
      //    methodology='equity_bridge'. Must filter by methodology to avoid
      //    selecting the equity bridge as the enterprise-value conclusion.
      const { data: reconCalc } = await vsb.from('valuation_calculations')
        .select('id, calculation_type, methodology, is_approved, is_stale, superseded_by_calculation_id, enterprise_value_low, enterprise_value_mid, enterprise_value_high')
        .eq('valuation_id', valuation_id)
        .eq('calculation_type', 'reconciliation')
        .eq('methodology', 'blended')
        .is('superseded_by_calculation_id', null)
        .order('calculated_at', { ascending: false })
        .limit(1).maybeSingle();
      if (!reconCalc) {
        missingApprovals.push('No blended reconciliation calculation');
        criticalBlockers.push('Blended reconciliation calculation is required');
      } else if (!reconCalc.is_approved) {
        missingApprovals.push('Blended reconciliation not approved');
        criticalBlockers.push('Blended reconciliation must be approved');
      } else if (reconCalc.is_stale) {
        criticalBlockers.push('Blended reconciliation is stale — recalculate before publishing');
      }

      // 8. Check for approved EQUITY BRIDGE (methodology='equity_bridge')
      const { data: equityBridgeCalc } = await vsb.from('valuation_calculations')
        .select('id, calculation_type, methodology, is_approved, is_stale, superseded_by_calculation_id, equity_value_low, equity_value_mid, equity_value_high')
        .eq('valuation_id', valuation_id)
        .eq('calculation_type', 'reconciliation')
        .eq('methodology', 'equity_bridge')
        .is('superseded_by_calculation_id', null)
        .order('calculated_at', { ascending: false })
        .limit(1).maybeSingle();
      if (!equityBridgeCalc) {
        missingApprovals.push('No equity bridge calculation');
        criticalBlockers.push('Equity bridge calculation is required');
      } else if (!equityBridgeCalc.is_approved) {
        missingApprovals.push('Equity bridge not approved');
        criticalBlockers.push('Equity bridge must be approved');
      } else if (equityBridgeCalc.is_stale) {
        criticalBlockers.push('Equity bridge is stale — recalculate before publishing');
      }

      // 9. Check for approved advisor conclusion
      const { data: conclusion } = await vsb.from('valuation_conclusions')
        .select('id, advisor_approved, conclusion_type')
        .eq('valuation_id', valuation_id)
        .order('updated_at', { ascending: false })
        .limit(1).maybeSingle();
      if (!conclusion) {
        missingApprovals.push('No advisor conclusion');
        criticalBlockers.push('Advisor conclusion is required');
      } else if (!conclusion.advisor_approved) {
        missingApprovals.push('Advisor conclusion not approved');
        criticalBlockers.push('Advisor conclusion must be approved');
      }

      // 10. Check for approved confidence calculation (overall)
      const { data: confScore } = await vsb.from('valuation_confidence_scores')
        .select('id, score, category, sub_category')
        .eq('valuation_id', valuation_id)
        .eq('is_overall', true)
        .maybeSingle();
      if (!confScore) {
        missingApprovals.push('No overall confidence score');
        criticalBlockers.push('Overall confidence score is required');
      }

      // 10b. Check confidence category coverage (5 categories: data, earnings, market, operational, forecast)
      const { data: confCategories } = await vsb.from('valuation_confidence_scores')
        .select('category, sub_category, score, is_not_applicable')
        .eq('valuation_id', valuation_id)
        .neq('is_overall', true);
      const requiredCategories = ['data', 'earnings', 'market', 'operational'];
      const foundCategories = (confCategories || []).map(c => c.category);
      for (const reqCat of requiredCategories) {
        if (!foundCategories.includes(reqCat)) {
          warnings.push(`Confidence category '${reqCat}' not scored`);
        }
      }
      // Forecast confidence: required BLOCKER if DCF was used and not scored/marked NA
      const { data: dcfCheck } = await vsb.from('valuation_dcf_projections')
        .select('id').eq('valuation_id', valuation_id).maybeSingle();
      if (dcfCheck && !foundCategories.includes('forecast')) {
        criticalBlockers.push('Forecast confidence must be scored (or marked not applicable) when DCF is used');
      }

      // 10. Check for required benchmarks (if multiple methods are selected)
      const hasMultipleMethod = (methodSels || []).some(s =>
        ['ebitda_multiple', 'sde_multiple', 'revenue_multiple'].includes(s.method_key));
      if (hasMultipleMethod) {
        const { count: activeBenchmarks } = await vsb.from('valuation_benchmarks')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true);
        if (!activeBenchmarks || activeBenchmarks === 0) {
          warnings.push('Multiple-based methods selected but no active benchmarks exist');
        }
      }

      const ready = criticalBlockers.length === 0;

      return Response.json({
        ready,
        critical_blockers: criticalBlockers,
        warnings,
        stale_calculations: staleCalculations,
        missing_approvals: missingApprovals,
        missing_inputs: missingInputs,
        selected_calculations: {
          blended_reconciliation: reconCalc ? { id: reconCalc.id, enterprise_value_low: reconCalc.enterprise_value_low, enterprise_value_mid: reconCalc.enterprise_value_mid, enterprise_value_high: reconCalc.enterprise_value_high } : null,
          equity_bridge: equityBridgeCalc ? { id: equityBridgeCalc.id, equity_value_low: equityBridgeCalc.equity_value_low, equity_value_mid: equityBridgeCalc.equity_value_mid, equity_value_high: equityBridgeCalc.equity_value_high } : null,
          confidence: confScore ? { id: confScore.id, score: confScore.score } : null,
          advisor_conclusion: conclusion ? { id: conclusion.id, conclusion_type: conclusion.conclusion_type } : null,
        },
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // RECALCULATE VALUATION (run pipeline and clear stale for recalculated)
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'recalculateValuation') {
      const { valuation_id, calculation_types } = data;
      if (!valuation_id) return Response.json({ error: 'valuation_id required' }, { status: 400 });
      await requireValuationEdit(vsb, sb, profile, valuation_id);

      const typesToRecalc = calculation_types || ['normalized_earnings', 'ebitda_multiple', 'reconciliation'];
      const results = {};

      // For each type, the advisor should call the specific calculate action.
      // This action clears stale flags for the specified types after recalculation.
      for (const calcType of typesToRecalc) {
        const DB_TYPE_MAP = {
          normalized_earnings: 'normalized_earnings',
          ebitda_multiple: 'ebitda_multiple',
          sde_multiple: 'sde_multiple',
          revenue_multiple: 'revenue_multiple',
          dcf: 'dcf',
          capitalization_of_earnings: 'capitalization_of_earnings',
          adjusted_net_asset: 'adjusted_net_asset',
          reconciliation: 'reconciliation',
        };
        const dbType = DB_TYPE_MAP[calcType];
        if (dbType) {
          // Clear stale flag for this calculation type (new calculation will be created by specific action)
          await vsb.from('valuation_calculations')
            .update({ is_stale: false, stale_reason: null, stale_marked_at: null })
            .eq('valuation_id', valuation_id)
            .eq('calculation_type', dbType)
            .eq('is_stale', true);
          results[calcType] = 'stale_cleared';
        }
        // Handle equity_bridge separately (uses methodology='equity_bridge')
        if (calcType === 'equity_bridge') {
          await vsb.from('valuation_calculations')
            .update({ is_stale: false, stale_reason: null, stale_marked_at: null })
            .eq('valuation_id', valuation_id)
            .eq('calculation_type', 'reconciliation')
            .eq('methodology', 'equity_bridge')
            .eq('is_stale', true);
          results[calcType] = 'stale_cleared';
        }
      }

      // Clear DCF/cap_earnings stale if included
      if (typesToRecalc.includes('dcf')) {
        await vsb.from('valuation_dcf_projections')
          .update({ is_stale: false, stale_reason: null })
          .eq('valuation_id', valuation_id);
        results.dcf = 'stale_cleared';
      }
      if (typesToRecalc.includes('capitalization_of_earnings')) {
        await vsb.from('valuation_cap_earnings')
          .update({ is_stale: false, stale_reason: null })
          .eq('valuation_id', valuation_id);
        results.cap_earnings = 'stale_cleared';
      }

      await appendAudit(vsb, valuation_id, profileId, 'calculation_saved', null,
        { recalculation: true, types: typesToRecalc, results }, null);

      return Response.json({ success: true, recalculated: results });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    const status = error.status || 500;
    return Response.json({ error: error.message }, { status });
  }
}