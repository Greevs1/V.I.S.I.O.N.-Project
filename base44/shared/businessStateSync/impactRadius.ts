/**
 * businessStateSync/impactRadius.ts — Phase 14.3
 *
 * Impact Radius model — every business fact knows which consumers depend
 * on it. For each fact returns:
 *   - Dependent consumers
 *   - Propagation path
 *   - Business impact
 *   - Priority
 *   - Refresh order
 *
 * Reuses:
 *   - subscriptionRegistry (consumer → fact subscriptions)
 *   - stalenessMap (valuation calculation dependencies)
 */

import type { ConsumerId, FactImpact } from './types.ts';
import { getConsumersForFact } from './subscriptionRegistry.ts';
import { getAffectedCalculations } from '../valuationEngine/stalenessMap.ts';

// ── Business impact descriptions per fact ────────────────────────────────────
const FACT_BUSINESS_IMPACT: Record<string, string> = {
  revenue: 'Revenue is the top-line driver for profit gap, value gap, and all valuation methods.',
  gross_profit: 'Gross profit determines margin analysis and profitability benchmarks.',
  net_income: 'Net income feeds into recast EBITDA and capitalization of earnings.',
  reported_ebitda: 'Reported EBITDA is the primary input for multiple-based valuation methods.',
  normalized_ebitda: 'Normalized EBITDA drives the enterprise value conclusion.',
  debt: 'Debt reduces equity value in the equity bridge calculation.',
  cash: 'Cash increases equity value in the equity bridge calculation.',
  owner_compensation: 'Owner compensation is a key add-back in recast EBITDA.',
  customer_concentration: 'Customer concentration affects risk transferability and confidence scoring.',
  business_profile: 'Business profile determines industry benchmarks and assessment context.',
  document_verified: 'Document verification increases confidence and unlocks intelligence scan.',
};

// ── Priority per fact (1 = highest) ───────────────────────────────────────────
const FACT_PRIORITY: Record<string, number> = {
  revenue: 1,
  reported_ebitda: 1,
  normalized_ebitda: 1,
  net_income: 2,
  gross_profit: 2,
  owner_compensation: 2,
  debt: 3,
  cash: 3,
  customer_concentration: 3,
  business_profile: 4,
  document_verified: 4,
};

// ── Compute impact radius for a fact ─────────────────────────────────────────
export function getImpactRadius(factKey: string): FactImpact {
  const subscriptions = getConsumersForFact(factKey);
  const dependentConsumers: ConsumerId[] = subscriptions.map(s => s.consumer_id);

  // Build propagation path: sort consumers by priority
  const propagationPath = [...dependentConsumers].sort((a, b) => {
    const subA = subscriptions.find(s => s.consumer_id === a);
    const subB = subscriptions.find(s => s.consumer_id === b);
    return (subA?.priority || 5) - (subB?.priority || 5);
  });

  // Check if this fact triggers valuation staleness
  const valuationAffected = subscriptions.some(s => s.consumer_id === 'valuation');
  const stalenessCalculations = valuationAffected ? getAffectedCalculations('financial_period_changed') : [];

  // Build propagation path with staleness info
  const fullPath = valuationAffected
    ? [...propagationPath, `valuation staleness: ${stalenessCalculations.length} calculation types marked stale`]
    : propagationPath;

  return {
    fact_key: factKey,
    dependent_consumers: dependentConsumers,
    propagation_path: fullPath,
    business_impact: FACT_BUSINESS_IMPACT[factKey] || 'Impact not yet mapped.',
    priority: FACT_PRIORITY[factKey] || 5,
    refresh_order: dependentConsumers.length,
  };
}

// ── Get dependent consumers for a fact ───────────────────────────────────────
export function getDependentConsumers(factKey: string): ConsumerId[] {
  return getImpactRadius(factKey).dependent_consumers;
}

// ── Get refresh order for a fact (sorted by priority) ────────────────────────
export function getRefreshOrder(factKey: string): ConsumerId[] {
  return getImpactRadius(factKey).propagation_path
    .filter((c): c is ConsumerId => typeof c === 'string' && !c.includes('staleness'));
}

// ── Batch: get impact radius for multiple facts ──────────────────────────────
export function getImpactRadiusBatch(factKeys: string[]): FactImpact[] {
  return factKeys.map(getImpactRadius);
}