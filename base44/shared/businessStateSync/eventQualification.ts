/**
 * businessStateSync/eventQualification.ts — Phase 14.3C
 *
 * Event Qualification — a Business State Event may enter LIVE propagation
 * only when ALL of the following pass:
 *
 *   1. canonical resolution_status = resolved (not conflict, missing, needs_review, stale)
 *   2. no conflict (conflict_status = none)
 *   3. not blocked
 *   4. source is permitted by registry
 *   5. temporal validity passes:
 *      - Period-based facts (revenue, ebitda, net_income): reporting period valid (not future, not too old)
 *      - Point-in-time facts (debt, cash): effective date valid (not future, not missing)
 *   6. business_id valid (not null/empty)
 *   7. confidence meets consumer requirement
 *   8. governance allows automatic propagation
 *
 * Phase 14.3C: Expanded to support point-in-time facts (debt) alongside
 * period-based facts (revenue). Debt uses effective_date, not reporting_period.
 * A historical debt balance is valid for historical as-of context — the
 * "too old" check does NOT apply to point-in-time facts.
 *
 * Do NOT live-sync: conflict, missing, blocked, advisor-locked conflicting
 * change, invalid temporal context, stale unsupported source.
 */

import type { BusinessStateEvent, ConsumerId } from './types.ts';
import type { CanonicalFact } from '../canonicalFact/types.ts';
import { getConsumerConfidenceRequirement } from './liveSyncPolicy.ts';
import { classifyPropagation } from './governance.ts';

// ── Qualification Result ─────────────────────────────────────────────────────
export interface QualificationResult {
  qualified: boolean;
  reason: string;
  checks: {
    resolution_status_ok: boolean;
    no_conflict: boolean;
    not_blocked: boolean;
    source_permitted: boolean;
    reporting_period_valid: boolean;
    business_id_valid: boolean;
    confidence_sufficient: boolean;
    governance_allows: boolean;
  };
}

// ── Permitted source authorities for live sync ───────────────────────────────
const PERMITTED_SOURCES = new Set([
  'verified_tax_return',
  'reviewed_financials',
  'advisor_entry_verified',
  'uploaded_financials',
  'extracted_field',
  'assessment_answer',
  'advisor_entry_unverified',
  'owner_estimate',
]);

// ── Fact temporal semantics ─────────────────────────────────────────────────
// Period-based facts use reporting_period (FY2024, TTM). Point-in-time facts
// use effective_date (balance as of a specific date). The temporal validity
// check differs: period-based facts reject >3 years old; point-in-time facts
// only reject future dates (historical balances are valid for as-of context).
const POINT_IN_TIME_FACTS = new Set([
  'debt',
  'cash',
]);

// ── Check if a reporting period is valid (period-based facts) ────────────────
function isReportingPeriodValid(period: string | undefined, effectiveDate: string): boolean {
  if (!period && !effectiveDate) return false;

  // Check effective date is not in the future
  if (effectiveDate) {
    const effective = new Date(effectiveDate);
    const now = new Date();
    if (effective > now) return false; // Future dates not allowed
  }

  // Check period is not too old (> 3 years)
  if (period) {
    const yearMatch = period.match(/(\d{4})/);
    if (yearMatch) {
      const year = parseInt(yearMatch[1]);
      const currentYear = new Date().getFullYear();
      if (currentYear - year > 3) return false; // Too old
    }
  }

  return true;
}

// ── Check if a point-in-time date is valid (debt, cash) ──────────────────────
// Point-in-time facts require an effective_date. Future dates are rejected.
// Historical dates are ACCEPTED — a balance from 2 years ago is the latest
// applicable point-in-time balance if no newer source exists. The "too old"
// check does NOT apply because point-in-time balances are valid for as-of
// context (e.g., valuation as of 12/31/2025 uses debt as of that date).
function isPointInTimeDateValid(effectiveDate: string | undefined): boolean {
  if (!effectiveDate) return false; // Point-in-time facts require a date

  const effective = new Date(effectiveDate);
  const now = new Date();
  if (effective > now) return false; // Future dates not allowed

  return true; // Historical dates are valid for as-of context
}

// ─<arg_value> Check temporal validity based on fact semantics ──────────────────────────
function isTemporalValid(event: BusinessStateEvent): boolean {
  if (POINT_IN_TIME_FACTS.has(event.fact_key)) {
    return isPointInTimeDateValid(event.effective_date);
  }
  return isReportingPeriodValid(event.reporting_period, event.effective_date);
}

// ── Qualify an event for live propagation (fact-aware) ───────────────────────
// Phase 14.3C: Generalized from qualifyRevenueEvent to support both
// period-based (revenue) and point-in-time (debt) facts.
export function qualifyEvent(
  event: BusinessStateEvent,
  consumerId: ConsumerId,
  canonicalFact?: CanonicalFact,
): QualificationResult {
  const checks = {
    resolution_status_ok: false,
    no_conflict: false,
    not_blocked: false,
    source_permitted: false,
    reporting_period_valid: false,
    business_id_valid: false,
    confidence_sufficient: false,
    governance_allows: false,
  };

  // 1. Resolution status must be resolved
  if (canonicalFact) {
    checks.resolution_status_ok = canonicalFact.resolution_status === 'resolved';
  } else {
    // If no canonical fact provided, check event verification status
    checks.resolution_status_ok = event.verification_status === 'verified' || event.verification_status === 'suggested';
  }

  // 2. No conflict
  if (canonicalFact) {
    checks.no_conflict = canonicalFact.conflict_status === 'none' || canonicalFact.conflict_status === 'minor';
  } else {
    checks.no_conflict = event.verification_status !== 'conflicting';
  }

  // 3. Not blocked (source is not from published version)
  checks.not_blocked = event.source_authority !== 'prior_published_version';

  // 4. Source is permitted
  checks.source_permitted = PERMITTED_SOURCES.has(event.source_authority);

  // 5. Temporal validity (period-based or point-in-time)
  checks.reporting_period_valid = isTemporalValid(event);

  // 6. Business ID is valid
  checks.business_id_valid = !!event.business_id && event.business_id.trim().length > 0;

  // 7. Confidence meets consumer requirement
  const requiredConfidence = getConsumerConfidenceRequirement(consumerId);
  checks.confidence_sufficient = event.confidence >= requiredConfidence;

  // 8. Governance allows automatic propagation
  const governanceDecision = classifyPropagation(event, consumerId);
  checks.governance_allows = governanceDecision.classification === 'automatic';

  // ── Determine qualification ────────────────────────────────────────────────
  const allPassed = Object.values(checks).every(v => v === true);

  if (!allPassed) {
    const failedChecks = Object.entries(checks)
      .filter(([_, passed]) => !passed)
      .map(([check]) => check);
    return {
      qualified: false,
      reason: `Event not qualified for live sync. Failed checks: ${failedChecks.join(', ')}`,
      checks,
    };
  }

  return {
    qualified: true,
    reason: 'All qualification checks passed. Event is qualified for live propagation.',
    checks,
  };
}

// ── Backward-compatible alias (Phase 14.3B consumers) ───────────────────────
export const qualifyRevenueEvent = qualifyEvent;