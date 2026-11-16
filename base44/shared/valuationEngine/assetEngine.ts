/**
 * valuationEngine/assetEngine.ts — Asset Approach Engine.
 * Adjusted Net Asset Value, Asset Floor, and Liquidation values.
 * Pure function: no DB, no React, no SDK. Deterministic.
 */

import { Decimal, money, sum } from './decimal.ts';
import type { AssetApproachInput, AssetApproachOutput, AssetItem, CalculationWarning } from './types.ts';

export const ENGINE_VERSION = '13.3.0';
export const METHODOLOGY_VERSION = '1.0.0';

export function calculateAssetApproach(input: AssetApproachInput): AssetApproachOutput {
  const warnings: CalculationWarning[] = [];
  const assetLines: { asset_name: string; category: string; book_value: Decimal; fair_market_value: Decimal; is_liability: boolean }[] = [];

  let totalAssets = Decimal.zero();
  let totalLiabilities = Decimal.zero();
  let hasGoodwill = false;

  for (const item of input.asset_items) {
    const fmv = money(item.fair_market_value || 0);
    const bv = money(item.book_value || 0);

    assetLines.push({
      asset_name: item.asset_name,
      category: item.asset_category,
      book_value: bv,
      fair_market_value: fmv,
      is_liability: item.is_liability,
    });

    if (item.is_liability) {
      totalLiabilities = totalLiabilities.add(fmv);
    } else {
      totalAssets = totalAssets.add(fmv);
    }

    if (item.is_goodwill) {
      hasGoodwill = true;
    }
  }

  // ── Goodwill double-count warning ─────────────────────────────────
  if (hasGoodwill && input.earnings_method_used) {
    warnings.push({
      code: 'GOODWILL_DOUBLE_COUNT',
      message: 'Goodwill is included in asset approach while earnings methods are also used. Do not double-count internally generated goodwill.',
      severity: 'warning',
    });
  }

  // ── Adjusted Net Asset Value ──────────────────────────────────────
  const adjustedNAV = totalAssets.subtract(totalLiabilities);

  // ── Asset Floor (tangible assets only) ───────────────────────────
  const tangibleAssets = input.asset_items
    .filter(item => !item.is_intangible && !item.is_liability)
    .reduce((acc, item) => acc.add(money(item.fair_market_value || 0)), Decimal.zero());
  const assetFloor = tangibleAssets.subtract(totalLiabilities);

  // ── Liquidation value (if applicable) ────────────────────────────
  // Apply typical liquidation discounts: 70% of FMV for assets, 100% for liabilities
  const liquidationAssets = input.asset_items
    .filter(item => !item.is_liability)
    .reduce((acc, item) => {
      const discount = item.is_intangible ? 0 : 0.7; // Intangibles have no liquidation value
      return acc.add(money(item.fair_market_value || 0).multiply(Decimal.fromNumber(discount)));
    }, Decimal.zero());
  const liquidationValue = liquidationAssets.subtract(totalLiabilities);

  // ── Warnings ──────────────────────────────────────────────────────
  if (adjustedNAV.isNegative()) {
    warnings.push({
      code: 'NEGATIVE_NAV',
      message: 'Liabilities exceed assets. Adjusted NAV is negative.',
      severity: 'warning',
    });
  }

  if (input.asset_items.length === 0) {
    warnings.push({
      code: 'NO_ASSET_ITEMS',
      message: 'No asset items provided. Cannot calculate asset approach.',
      severity: 'error',
    });
  }

  return {
    total_assets: totalAssets,
    total_liabilities: totalLiabilities,
    adjusted_net_asset_value: adjustedNAV,
    asset_floor_value: assetFloor,
    liquidation_value: liquidationValue,
    asset_lines: assetLines,
    warnings,
  };
}