/**
 * valuationEngine/normalizedEarnings.ts — Normalized Earnings Engine.
 * Builds EBITDA and SDE bridges from approved financials and adjustments.
 * Pure function: no DB, no React, no SDK. Deterministic.
 */

import { Decimal, money, sum } from './decimal.ts';
import type {
  NormalizedEarningsInput,
  NormalizedEarningsOutput,
  NormalizedEarningsLine,
  ApprovedAdjustment,
  CalculationWarning,
} from './types.ts';

export const ENGINE_VERSION = '13.3.0';
export const METHODOLOGY_VERSION = '1.0.0';

export function calculateNormalizedEarnings(input: NormalizedEarningsInput): NormalizedEarningsOutput {
  const warnings: CalculationWarning[] = [];
  const lines: NormalizedEarningsLine[] = [];
  let pendingExcluded = 0;

  // ── EBITDA Bridge ──────────────────────────────────────────────────
  // Reported Net Income + Interest + Taxes + D&A = Reported EBITDA
  // + Approved Add-Backs - Approved Deductions = Normalized EBITDA

  const p = input.period;

  // Start from reported EBITDA (already calculated in financial period)
  const reportedEbitda = money(p.reported_ebitda || 0);
  lines.push({
    line_label: 'Reported EBITDA',
    line_type: 'reported',
    amount: reportedEbitda,
    source: 'financial_period',
  });

  // Process adjustments
  let totalAddBacks = Decimal.zero();
  let totalDeductions = Decimal.zero();

  for (const adj of input.adjustments) {
    // Only include approved adjustments
    if (adj.advisor_approval_status !== 'approved') {
      pendingExcluded++;
      warnings.push({
        code: 'PENDING_ADJUSTMENT_EXCLUDED',
        message: `Adjustment "${adj.adjustment_type}" excluded — status: ${adj.advisor_approval_status}`,
        severity: 'info',
        field: adj.id,
      });
      continue;
    }

    // Reject negative adjustment amounts
    const amount = money(adj.approved_amount || adj.proposed_amount || 0);
    if (amount.isNegative()) {
      warnings.push({
        code: 'NEGATIVE_ADJUSTMENT_REJECTED',
        message: `Adjustment "${adj.adjustment_type}" has negative amount — rejected`,
        severity: 'error',
        field: adj.id,
      });
      continue;
    }

    if (adj.adjustment_direction === 'add_back') {
      totalAddBacks = totalAddBacks.add(amount);
      lines.push({
        line_label: `+ ${adj.adjustment_type.replace(/_/g, ' ')}`,
        line_type: 'adjustment',
        amount: amount,
        adjustment_id: adj.id,
        source: 'approved_adjustment',
      });
    } else {
      totalDeductions = totalDeductions.add(amount);
      lines.push({
        line_label: `− ${adj.adjustment_type.replace(/_/g, ' ')}`,
        line_type: 'adjustment',
        amount: amount.negate(),
        adjustment_id: adj.id,
        source: 'approved_adjustment',
      });
    }
  }

  const normalizedEbitda = reportedEbitda.add(totalAddBacks).subtract(totalDeductions);
  lines.push({
    line_label: '= Normalized EBITDA',
    line_type: 'normalized',
    amount: normalizedEbitda,
  });

  // ── SDE Bridge (if basis is SDE) ───────────────────────────────────
  let sdeBridge: { lines: NormalizedEarningsLine[] } | null = null;
  let normalizedSde: Decimal | null = null;

  if (input.earnings_basis === 'sde') {
    const sdeLines: NormalizedEarningsLine[] = [
      {
        line_label: 'Normalized EBITDA',
        line_type: 'reported',
        amount: normalizedEbitda,
      },
    ];

    let sdeValue = normalizedEbitda;

    // + Owner Compensation
    const ownerComp = money(p.owner_compensation || 0);
    if (ownerComp.isPositive()) {
      sdeLines.push({
        line_label: '+ Owner Compensation',
        line_type: 'adjustment',
        amount: ownerComp,
        source: 'financial_period',
      });
      sdeValue = sdeValue.add(ownerComp);
    }

    // + Eligible Owner Benefits
    if (input.eligible_owner_benefits) {
      sdeLines.push({
        line_label: '+ Eligible Owner Benefits',
        line_type: 'adjustment',
        amount: input.eligible_owner_benefits,
        source: 'advisor_entry',
      });
      sdeValue = sdeValue.add(input.eligible_owner_benefits);
    }

    // − Market Replacement Compensation
    if (input.market_replacement_compensation) {
      sdeLines.push({
        line_label: '− Market Replacement Compensation',
        line_type: 'adjustment',
        amount: input.market_replacement_compensation.negate(),
        source: 'advisor_entry',
      });
      sdeValue = sdeValue.subtract(input.market_replacement_compensation);
    }

    // ± Other Owner Adjustments
    if (input.other_owner_adjustments) {
      sdeLines.push({
        line_label: '± Other Owner Adjustments',
        line_type: 'adjustment',
        amount: input.other_owner_adjustments,
        source: 'advisor_entry',
      });
      sdeValue = sdeValue.add(input.other_owner_adjustments);
    }

    sdeLines.push({
      line_label: '= Normalized SDE',
      line_type: 'normalized',
      amount: sdeValue,
    });

    normalizedSde = sdeValue;
    sdeBridge = { lines: sdeLines };
  }

  // ── Warnings ──────────────────────────────────────────────────────
  if (pendingExcluded > 0) {
    warnings.push({
      code: 'PENDING_ADJUSTMENTS_EXCLUDED',
      message: `${pendingExcluded} pending/unapproved adjustment(s) excluded from calculation`,
      severity: 'warning',
    });
  }

  if (normalizedEbitda.isNegative()) {
    warnings.push({
      code: 'NEGATIVE_NORMALIZED_EBITDA',
      message: 'Normalized EBITDA is negative. Earnings-based methods cannot be applied.',
      severity: 'error',
    });
  }

  return {
    reported_ebitda: reportedEbitda,
    total_add_backs: totalAddBacks,
    total_deductions: totalDeductions,
    normalized_ebitda: normalizedEbitda,
    normalized_sde: normalizedSde,
    ebitda_bridge: { lines },
    sde_bridge: sdeBridge,
    pending_adjustments_excluded: pendingExcluded,
    warnings,
  };
}