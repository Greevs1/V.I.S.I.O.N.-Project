/**
 * businessStateSync/events.ts — Phase 14.3
 *
 * Business State Event creation and validation.
 *
 * Every event must include:
 *   Business ID, Fact Key, Previous Value, New Value, Effective Date,
 *   Reporting Period, Confidence, Verification Status, Evidence Reference,
 *   Source Authority, Reason, Timestamp.
 *
 * Pure data module: no I/O, no side effects. Deterministic.
 */

import type { BusinessStateEvent, BusinessStateEventType } from './types.ts';
import type { CanonicalFact } from '../canonicalFact/types.ts';

// ── Event ID generator (deterministic, no crypto) ────────────────────────────
export function generateEventId(
  businessId: string,
  eventType: BusinessStateEventType,
  timestamp: string,
): string {
  const hash = `${businessId}_${eventType}_${timestamp}`;
  return `bse_${hash.replace(/[^a-zA-Z0-9]/g, '')}`;
}

// ── Create a Business State Event ────────────────────────────────────────────
export function createBusinessStateEvent(params: {
  event_type: BusinessStateEventType;
  business_id: string;
  fact_key: string;
  previous_value: any;
  new_value: any;
  effective_date: string;
  reporting_period?: string;
  confidence: number;
  verification_status: string;
  evidence_reference?: string;
  source_authority: string;
  reason: string;
  timestamp?: string;
}): BusinessStateEvent {
  const timestamp = params.timestamp || new Date().toISOString();
  return {
    event_id: generateEventId(params.business_id, params.event_type, timestamp),
    event_type: params.event_type,
    business_id: params.business_id,
    fact_key: params.fact_key,
    previous_value: params.previous_value,
    new_value: params.new_value,
    effective_date: params.effective_date,
    reporting_period: params.reporting_period,
    confidence: params.confidence,
    verification_status: params.verification_status as any,
    evidence_reference: params.evidence_reference,
    source_authority: params.source_authority,
    reason: params.reason,
    timestamp,
  };
}

// ── Create an event from a Canonical Fact change ─────────────────────────────
export function eventFromCanonicalFact(
  canonicalFact: CanonicalFact,
  previousValue: any,
  reason: string,
  eventType: BusinessStateEventType,
): BusinessStateEvent {
  return createBusinessStateEvent({
    event_type: eventType,
    business_id: canonicalFact.business_id,
    fact_key: canonicalFact.fact_key,
    previous_value: previousValue,
    new_value: canonicalFact.value,
    effective_date: canonicalFact.effective_date || canonicalFact.updated_at,
    reporting_period: canonicalFact.reporting_period?.label,
    confidence: canonicalFact.confidence_score,
    verification_status: canonicalFact.verification_status,
    evidence_reference: canonicalFact.source_id,
    source_authority: canonicalFact.source_type,
    reason,
  });
}

// ── Validate required fields ─────────────────────────────────────────────────
export function validateEvent(event: BusinessStateEvent): string[] {
  const errors: string[] = [];
  if (!event.event_id) errors.push('event_id is required');
  if (!event.event_type) errors.push('event_type is required');
  if (!event.business_id) errors.push('business_id is required');
  if (!event.fact_key) errors.push('fact_key is required');
  if (event.previous_value === undefined) errors.push('previous_value is required');
  if (event.new_value === undefined) errors.push('new_value is required');
  if (!event.effective_date) errors.push('effective_date is required');
  if (event.confidence === undefined) errors.push('confidence is required');
  if (!event.verification_status) errors.push('verification_status is required');
  if (!event.source_authority) errors.push('source_authority is required');
  if (!event.reason) errors.push('reason is required');
  if (!event.timestamp) errors.push('timestamp is required');
  return errors;
}

// ── Map fact_key to default event type ───────────────────────────────────────
export const FACT_KEY_TO_EVENT_TYPE: Record<string, BusinessStateEventType> = {
  revenue: 'revenue_updated',
  gross_profit: 'gross_profit_updated',
  net_income: 'net_income_updated',
  reported_ebitda: 'ebitda_updated',
  normalized_ebitda: 'ebitda_updated',
  debt: 'debt_updated',
  cash: 'cash_updated',
  owner_compensation: 'owner_compensation_updated',
  customer_concentration: 'customer_concentration_updated',
};

export function getEventTypeForFact(factKey: string): BusinessStateEventType | null {
  return FACT_KEY_TO_EVENT_TYPE[factKey] || null;
}