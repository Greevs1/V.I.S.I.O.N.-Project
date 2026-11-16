/**
 * Phase 6D.0c.2 — THE EVIDENCE ENVELOPE.
 *
 * Every candidate that may enter a Galileo answer arrives in ONE normalized shape,
 * so the resolver never has to know which lane produced it:
 *
 *   FACTUAL lane   canonical observations (reviewed)  → VERIFIED | CONFIRMED
 *                  provisional document evidence       → PROVISIONAL
 *   ADVISORY lane  canonical BIE recommendations and assessment opportunities →
 *                  basis 'projected'. They can explain, never answer a
 *                  historical metric. That separation IS the opportunity firewall.
 *
 * Evidence state is never collapsed into model confidence: extraction confidence
 * is carried separately and labelled as such.
 *
 * Nothing here writes. Nothing here promotes a pending row.
 */

import { conceptsForFact, advisoryConceptsFor } from './ontology.ts';
import { isSensitiveFieldName } from '../sensitiveFields.ts';

export const FACTUAL_EVIDENCE_STATES = ['VERIFIED', 'CONFIRMED', 'PROVISIONAL'];

/** Evidence may be assembled only for the business the actor was authorized for. */
export function evidenceAccessGranted(access: any, businessId: any) {
  return !!(access && access.granted === true && businessId && access.businessId === businessId);
}

const docLabel = (t: any) => (t ? String(t).replace(/_/g, ' ') : 'uploaded document');
const periodOf = (fy: any) => (fy == null || fy === '' ? { fiscal_year: null, label: null } : { fiscal_year: Number(fy), label: `FY${Number(fy)}` });
const conf = (c: any) => (c == null || !Number.isFinite(Number(c)) ? null : Number(c) / 100);

function documentName(documents: any[], id: any, type: any) {
  const d = (documents || []).find((x: any) => x && x.id === id);
  return (d && d.name) || docLabel(type);
}

function canonicalEnvelope(o: any, businessId: any, documents: any[]) {
  const p = o.provenance || {};
  const field = p.source_field || null;
  const verified = o.verification_status === 'verified';
  return {
    envelope_id: `canonical:${o.observation_id || `${o.canonical_key}:${p.source_document_id}`}`,
    lane: 'canonical',
    basis: 'actual',
    fact_key: o.canonical_key,
    concepts: conceptsForFact(o.canonical_key, field),
    display_name: o.display_name || o.canonical_key,
    value: o.value,
    period: periodOf(o.period?.fiscal_year),
    business_id: o.business_id,
    evidence_state: verified ? 'VERIFIED' : 'CONFIRMED',
    source: { type: 'document', document_id: p.source_document_id || null, document_name: documentName(documents, p.source_document_id, p.source_document_type), document_type: p.source_document_type || null, field_id: o.observation_id || null, field_name: field, page: p.source_page ?? null },
    verification: { review_status: o.review_state || null, verified },
    confidence: { extraction: conf(o.confidence) },
  };
}

function provisionalEnvelope(i: any, documents: any[]) {
  return {
    envelope_id: `provisional:${i.evidence_id || `${i.canonical_key}:${i.source_document_id}`}`,
    lane: 'provisional',
    basis: 'actual',
    fact_key: i.canonical_key,
    concepts: conceptsForFact(i.canonical_key, i.field_name),
    display_name: i.display_name || i.canonical_key,
    value: i.value,
    period: periodOf(i.fiscal_year),
    business_id: i.business_id,
    evidence_state: 'PROVISIONAL',
    source: { type: 'document', document_id: i.source_document_id || null, document_name: documentName(documents, i.source_document_id, i.source_document_type), document_type: i.source_document_type || null, field_id: i.evidence_id || null, field_name: i.field_name || null, page: i.source_page ?? null },
    verification: { review_status: i.review_status || 'pending_review', verified: false },
    confidence: { extraction: conf(i.confidence) },
  };
}

const ASSESSMENT_CATEGORY: Record<string, string> = { tax_gap: 'tax', profit_gap: 'profit', value_gap: 'value', operations_gap: 'operations', recast_ebitda: 'profit' };

function advisoryEnvelope(a: any, businessId: any) {
  const category = String(a.category || '').toLowerCase();
  const concepts = advisoryConceptsFor(category);
  if (!concepts.length) return null;
  const value = Number(a.value);
  if (!Number.isFinite(value) || value === 0) return null;
  return {
    envelope_id: `advisory:${a.key}`,
    lane: 'advisory',
    basis: 'projected',
    family: category,
    fact_key: null,
    concepts,
    display_name: a.title || a.key,
    value,
    period: { fiscal_year: null, label: 'annual, projected' },
    business_id: businessId,
    evidence_state: 'PROJECTED',
    source: { type: a.source_type, recommendation_key: a.key, title: a.title || null },
    verification: { review_status: null, verified: false },
    confidence: { extraction: null },
  };
}

/**
 * buildEvidenceEnvelopes — the ONE entry point for evidence. Fails closed: an
 * actor not authorized for this business gets NO envelopes at all; a row of
 * another business, a sensitive field, or an unreviewed row presented as
 * canonical never becomes evidence.
 */
export function buildEvidenceEnvelopes(input: any) {
  const businessId = input?.businessId || null;
  if (!evidenceAccessGranted(input?.access, businessId)) return { denied: true, factual: [], advisory: [] };
  const documents = input.documents || [];
  const inScope = (x: any) => x && x.business_id === businessId;

  const factual: any[] = [];
  for (const o of input.canonicalObservations || []) {
    if (!inScope(o)) continue;
    if (o.lifecycle_state !== 'confirmed' && o.verification_status !== 'verified') continue;
    if (isSensitiveFieldName(o.provenance?.source_field)) continue;
    const e = canonicalEnvelope(o, businessId, documents);
    if (e.concepts.length && Number.isFinite(Number(e.value))) factual.push(e);
  }
  for (const i of input.provisionalItems || []) {
    if (!inScope(i)) continue;
    if (isSensitiveFieldName(i.field_name)) continue;
    const e = provisionalEnvelope(i, documents);
    if (e.concepts.length && Number.isFinite(Number(e.value))) factual.push(e);
  }

  const advisory: any[] = [];
  for (const r of input.recommendations || []) {
    const e = advisoryEnvelope({ key: r.recommendation_key, category: r.category, value: r.estimatedImpact ?? r.estimated_impact, title: r.title, source_type: 'bie_recommendation' }, businessId);
    if (e) advisory.push(e);
  }
  for (const a of input.assessments || []) {
    const e = advisoryEnvelope({ key: a.assessment_type, category: ASSESSMENT_CATEGORY[a.assessment_type], value: a.estimated_opportunity_value, title: `${String(a.assessment_type || '').replace(/_/g, ' ')} assessment`, source_type: 'assessment' }, businessId);
    if (e && !advisory.some((x) => x.family === e.family && x.value === e.value)) advisory.push(e);
  }
  return { denied: false, factual, advisory };
}