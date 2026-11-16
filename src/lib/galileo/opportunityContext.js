/**
 * opportunityContext — one place that turns an opportunity into the context
 * the rest of Vision carries forward (Galileo questions, the implementation
 * preview, the expert handoff). Only fields that exist on the record are used.
 */

import { approxMoney } from './moneyFormat';

/** The full record behind Home's compact copy, with the display fields kept. */
export function opportunityRecord(opp) {
  if (!opp) return {};
  return {
    ...(opp.raw || {}),
    title: opp.title,
    category: opp.category || opp.raw?.category || null,
    confidence_score: opp.raw?.confidence_score ?? opp.confidenceScore ?? null,
  };
}

const VALUE_FIELDS = [
  { key: 'estimated_value_created', label: 'Value created' },
  { key: 'estimated_profit_improvement', label: 'Profit improvement' },
  { key: 'estimated_cash_flow_improvement', label: 'Cash flow improvement' },
  { key: 'estimated_tax_savings', label: 'Tax savings' },
  { key: 'estimated_impact', label: 'Modelled impact' },
];

/** Modelled value rows the record actually carries. */
export function opportunityValueRows(opp) {
  const o = opportunityRecord(opp);
  return VALUE_FIELDS.map(({ key, label }) => ({ label, value: approxMoney(o[key]) })).filter((r) => r.value);
}

/** A Galileo question that carries the opportunity, so it is never restated. */
export function buildOpportunityQuestion(opp, ask = null) {
  const o = opportunityRecord(opp);
  const parts = [`We're discussing the "${o.title}" opportunity for my business.`];
  if (o.expected_outcome || o.description) parts.push(`Context: ${o.expected_outcome || o.description}.`);
  const value = opportunityValueRows(opp);
  if (value.length) parts.push(value.map((v) => `${v.label} ${v.value}`).join(', ') + '.');
  if (o.confidence_score != null) parts.push(`Confidence ${Math.round(o.confidence_score)}%.`);
  parts.push(ask || 'How would I actually implement this, and what should I do first?');
  return parts.join(' ');
}

/** The implementation preview's context for an opportunity. */
export function opportunityPlanContext(opp) {
  const o = opportunityRecord(opp);
  return {
    source: 'opportunity',
    title: o.title,
    goal: o.expected_outcome || o.description || o.title,
    summary: o.description || null,
    // Only Galileo-origin records carry an id the Sprint lifecycle can link.
    opportunityId: opp?.origin === 'galileo' ? opp.id : null,
    expectedResult: opportunityValueRows(opp),
  };
}