/**
 * documentObservation/semantics.ts — VISION 6D.0a — SEMANTIC OBSERVATION BRIDGE
 *
 * ONE semantic contract between an EXTRACTED FIELD and its BUSINESS MEANING.
 *
 * The registry of business meanings is NOT declared here. It is READ from the
 * existing canonical registry (canonicalFact/registry.ts) — the same vocabulary
 * 6D.1 will promote into business_facts. This module therefore invents no second
 * truth store, no second status enum and no duplicate alias table:
 *
 *     extracted_field  ──(this module)──►  canonical semantic key
 *                                              = a future business_fact key
 *
 * It preserves, on every mapped observation: business scope, source, period,
 * basis, review state, semantic definition, provenance and confidence — and it
 * never converts an accepted observation into a VERIFIED one.
 *
 * PURE MODULE — no I/O, no Supabase, no writes, no authorization. It can grant
 * nothing: mapping is a content function that runs only after a caller has
 * already been authorized for the business whose observations it receives.
 *
 * PERIOD: the period block recorded by 6D.0 (`periodMetadata` in
 * documentExtraction/periodIntegrity.ts) is consumed VERBATIM. Nothing here
 * fabricates a period: no current year, no TTM, no calendar-year substitution.
 * A year the uploader declared is labelled `declared`; a period the document
 * stated is `parsed`; bounds recorded without a source label are `inferred`;
 * nothing else is `unknown`.
 */

import { FACT_REGISTRY } from '../canonicalFact/registry.ts';

export const SEMANTIC_MAPPING_VERSION = '6d.0a.1';

// ── Review eligibility (Phase 7) ────────────────────────────────────────────
export type ReviewState =
  | 'accepted' | 'corrected' | 'rejected' | 'pending_review' | 'needs_clarification' | 'unknown';

/** 6C lifecycle vocabulary. An accepted observation is CONFIRMED — never VERIFIED. */
export type LifecycleState = 'confirmed' | 'proposed' | 'rejected';

export interface Eligibility {
  eligible: boolean;
  lifecycle_state: LifecycleState;
  reason: string;
}

export function observationEligibility(reviewStatus: string | null | undefined): Eligibility {
  switch (String(reviewStatus ?? 'unknown')) {
    case 'accepted':
      return { eligible: true, lifecycle_state: 'confirmed', reason: 'the owner accepted the extracted value' };
    case 'corrected':
      return { eligible: true, lifecycle_state: 'confirmed', reason: 'the owner corrected the extracted value' };
    case 'rejected':
      return { eligible: false, lifecycle_state: 'rejected', reason: 'the owner rejected the extracted value' };
    case 'pending_review':
      return { eligible: false, lifecycle_state: 'proposed', reason: 'the extracted value has not been reviewed' };
    case 'needs_clarification':
      return { eligible: false, lifecycle_state: 'proposed', reason: 'the extracted value is awaiting clarification' };
    default:
      return { eligible: false, lifecycle_state: 'proposed', reason: 'unknown review state' };
  }
}

// ── Period contract (Phase 3) ───────────────────────────────────────────────
export type PeriodOrigin = 'declared' | 'parsed' | 'inferred' | 'unknown';

export interface ObservationPeriod {
  period_origin: PeriodOrigin;
  period_raw: string | null;
  period_start: string | null;
  period_end: string | null;
  as_of_date: string | null;
  period_type: string | null;
  fiscal_year: number | null;
  label: string;
  ambiguous: boolean;
  note: string | null;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const num = (v: any): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * observationPeriod — reads the period the extraction recorded on the field.
 * The accepted source strings (`model_reported`, `user_declared_year`,
 * `unresolved`) are the exact contract emitted by 6D.0's periodMetadata().
 */
export function observationPeriod(row: any): ObservationPeriod {
  const md = (row && row.metadata) || {};
  const declaredYear = num(row?.tax_year) ?? null;

  const statedSource = md.period_source ?? null;
  const hasBounds = Boolean(md.period_start || md.period_end);
  const fiscalYear = num(md.fiscal_year) ?? declaredYear;

  const period_origin: PeriodOrigin =
    statedSource === 'model_reported' ? 'parsed'
    : statedSource === 'user_declared_year' ? 'declared'
    : md.period_raw ? 'parsed'
    : hasBounds ? 'inferred'
    : declaredYear != null ? 'declared'
    : 'unknown';

  let period_start: string | null = md.period_start ?? null;
  let period_end: string | null = md.period_end ?? null;
  let as_of_date: string | null = md.as_of_date ?? null;
  let period_type: string | null = md.period_type ?? null;
  let note: string | null = null;

  // A DECLARED year may be expressed as its calendar bounds — the same derivation
  // 6D.0 already performs for a declared year (never for an unstated one).
  if (period_origin === 'declared' && !period_start && !period_end && fiscalYear != null) {
    period_start = `${fiscalYear}-01-01`;
    period_end = `${fiscalYear}-12-31`;
    period_type = period_type || 'annual';
    note = 'period derived from the year declared at upload, not read from the document';
  }
  if (period_origin === 'unknown') {
    note = 'the document stated no reporting period and none was declared';
  }
  if (statedSource === 'unresolved' || md.period_ambiguous === true) {
    note = 'the document states a reporting period that could not be parsed deterministically';
  }

  const ambiguous = period_origin === 'unknown' || md.period_ambiguous === true;

  let label = 'period unknown';
  const fy = fiscalYear;
  if (period_type === 'annual' && fy != null) label = `FY${fy}`;
  else if (period_type === 'quarterly' && fy != null && period_start) {
    const q = Math.floor(Number(period_start.slice(5, 7)) / 3.2) + 1;
    label = `Q${Math.min(4, Math.max(1, q))} ${fy}`;
  } else if (period_type === 'monthly' && fy != null && period_start) {
    const m = Number(period_start.slice(5, 7));
    label = `${MONTH_NAMES[Math.max(0, Math.min(11, m - 1))]} ${fy}`;
  } else if (period_type === 'as_of' && (as_of_date || period_end)) {
    label = `as of ${as_of_date || period_end}`;
  } else if (period_start || period_end) {
    label = `${period_start || '…'} – ${period_end || '…'}`;
  } else if (fy != null) {
    label = String(fy);
  }

  return {
    period_origin,
    period_raw: md.period_raw ?? null,
    period_start,
    period_end,
    as_of_date,
    period_type,
    fiscal_year: fy,
    label,
    ambiguous,
    note,
  };
}

// ── Semantic index — derived from the canonical registry (no alias table here) ─
export interface FieldMapping {
  fact_key: string;
  source_authority: string;
  doc_types: string[] | null;
  /**
   * 6D.1B.2 — the evidence scope the registry DECLARES for this source, carried
   * through so a consumer reads the declaration itself instead of re-deriving it
   * from a name. A consumer that matched a section-scoped name must still see the
   * concept's own scope; otherwise scoping a concept would quietly stop applying
   * the moment that concept arrived from a workbook sheet.
   */
  evidence_scope?: string | null;
  field_names?: string[] | null;
}

/** Built once from FACT_REGISTRY: extracted-field name → canonical meaning. */
export function semanticIndex(): Record<string, FieldMapping[]> {
  const index: Record<string, FieldMapping[]> = {};
  for (const fact of FACT_REGISTRY) {
    for (const source of fact.candidate_sources || []) {
      if (source.source_type !== 'extracted_field') continue;
      for (const fieldName of source.field_names || []) {
        const key = String(fieldName).toLowerCase();
        (index[key] = index[key] || []).push({
          fact_key: fact.fact_key,
          source_authority: source.source_authority,
          doc_types: source.doc_types || null,
        });
      }
    }
  }
  return index;
}

const SEMANTIC_INDEX = semanticIndex();

/** Every canonical meaning reachable from an extracted field (for tests/consumers). */
export function mappedFactKeys(): string[] {
  const keys = new Set<string>();
  for (const list of Object.values(SEMANTIC_INDEX)) for (const m of list) keys.add(m.fact_key);
  return [...keys].sort();
}

export function fieldMapping(fieldName: string | null | undefined): FieldMapping[] {
  if (!fieldName) return [];
  return SEMANTIC_INDEX[String(fieldName).toLowerCase()] || [];
}

/**
 * EXPORTED so a second consumer can ask the SAME admission question without
 * re-implementing it. 6D.1A's Digital Twin pre-flight needs "does this fact's
 * definition admit this field for this document type?" — the identical rule the
 * observation layer already applies. Duplicating it would let the two answers drift.
 */
export function docTypeAllowed(docTypes: string[] | null, documentType: string | null | undefined): boolean {
  if (!docTypes || docTypes.length === 0) return true;
  if (!documentType) return false; // a typed mapping requires the document type to agree
  return docTypes.includes(String(documentType));
}

// ── The mapped observation ──────────────────────────────────────────────────
export interface ObservationProvenance {
  semantic_basis: 'fact_registry_candidate_source';
  source_field: string;
  source_document_id: string | null;
  source_document_type: string | null;
  source_form: string | null;
  source_page: number | null;
  source_line: string | null;
  source_label: string;
  source_available: boolean | null;
}

export interface SemanticObservation {
  observation_id: string | null;
  canonical_key: string;
  display_name: string;
  value: number;
  value_type: string;
  unit: string | null;
  business_id: string;
  period: ObservationPeriod;
  basis: string | null;
  review_state: string;
  lifecycle_state: LifecycleState;
  verification_status: 'unverified';
  verification_method: null;
  confidence: number | null;
  confidence_basis: 'provider_field_confidence' | 'unrecorded';
  reviewed_at: string | null;
  provenance: ObservationProvenance;
}

export type MapResult =
  | { status: 'mapped'; observation: SemanticObservation }
  | { status: 'unmapped'; reason: string; field_name?: string }
  | { status: 'ineligible'; reason: string; lifecycle_state: LifecycleState; field_name?: string }
  | { status: 'foreign_business'; field_name?: string }
  | { status: 'no_business'; field_name?: string };

const DOC_TYPE_LABELS: Record<string, string> = {
  business_tax_return: 'business tax return',
  personal_tax_return: 'personal tax return',
  profit_and_loss: 'Profit & Loss statement',
  balance_sheet: 'balance sheet',
  payroll_report: 'payroll report',
  debt_schedule: 'debt schedule',
};

export function documentTypeLabel(documentType: string | null | undefined): string {
  if (!documentType) return 'document';
  return DOC_TYPE_LABELS[documentType] || String(documentType).replace(/_/g, ' ');
}

function numericValue(row: any): number | null {
  const pick = row?.accepted_normalized_value ?? row?.accepted_value ?? row?.normalized_value ?? row?.field_value;
  if (pick == null || pick === '') return null;
  if (typeof pick === 'number') return Number.isFinite(pick) ? pick : null;
  const cleaned = String(pick).replace(/[^0-9.\-]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function sourceAvailable(row: any): boolean | null {
  const s = row?.metadata?.source_status;
  if (s === 'missing') return false;
  if (s === 'available') return true;
  return null; // availability not recorded — never claimed
}

/**
 * mapObservation — ONE extracted field + ONE business → ONE canonical meaning.
 * Refuses: no business scope, a foreign business, an ineligible review state,
 * a document type the canonical definition does not admit, no numeric value.
 */
export function mapObservation(row: any, businessId: string | null | undefined): MapResult {
  const fieldName = row?.field_name || null;
  if (!fieldName) return { status: 'unmapped', reason: 'the row carries no field name' };
  if (!businessId) return { status: 'no_business', field_name: fieldName };
  if (!row?.business_id) return { status: 'no_business', field_name: fieldName }; // scope is never inferred
  if (row.business_id !== businessId) return { status: 'foreign_business', field_name: fieldName };

  const eligibility = observationEligibility(row.review_status);
  if (!eligibility.eligible) {
    return { status: 'ineligible', reason: eligibility.reason, lifecycle_state: eligibility.lifecycle_state, field_name: fieldName };
  }

  const candidates = fieldMapping(fieldName).filter((m) => docTypeAllowed(m.doc_types, row.source_document_type));
  if (candidates.length === 0) {
    return { status: 'unmapped', reason: 'no canonical definition admits this field name for this document type', field_name: fieldName };
  }

  const value = numericValue(row);
  if (value == null) {
    return { status: 'unmapped', reason: 'no usable numeric value', field_name: fieldName };
  }

  const chosen = candidates[0];
  const fact = FACT_REGISTRY.find((f) => f.fact_key === chosen.fact_key);
  const period = observationPeriod(row);
  const conf = num(row.confidence_score);
  const docType = row.source_document_type || null;

  const labelParts = [documentTypeLabel(docType)];
  if (period.period_origin !== 'unknown') labelParts.push(period.label);

  return {
    status: 'mapped',
    observation: {
      observation_id: row.id || null,
      canonical_key: chosen.fact_key,
      display_name: fact?.display_name || chosen.fact_key,
      value,
      value_type: fact?.value_type || 'currency',
      unit: fact?.unit ?? null,
      business_id: row.business_id,
      period,
      basis: row.metadata?.accounting_basis ?? null,
      review_state: String(row.review_status),
      lifecycle_state: eligibility.lifecycle_state,
      verification_status: 'unverified',
      verification_method: null,
      confidence: conf,
      confidence_basis: conf == null ? 'unrecorded' : 'provider_field_confidence',
      reviewed_at: row.reviewed_at || null,
      provenance: {
        semantic_basis: 'fact_registry_candidate_source',
        source_field: fieldName,
        source_document_id: row.document_id || null,
        source_document_type: docType,
        source_form: row.source_form || null,
        source_page: num(row.source_page),
        source_line: row.source_line || null,
        source_label: labelParts.join(' · '),
        source_available: sourceAvailable(row),
      },
    },
  };
}

function periodRecency(o: SemanticObservation): number {
  const d = o.period.period_end || o.period.as_of_date || null;
  return d ? new Date(d).getTime() : 0;
}

/**
 * bestObservation — corrected (the owner's own edit) outranks accepted; then the
 * most recent period; then the most recent review; then the higher confidence.
 * Exact duplicates from re-extraction collapse to one.
 */
function bestObservation(list: SemanticObservation[]): { best: SemanticObservation; rest: SemanticObservation[] } {
  const seen = new Set<string>();
  const deduped: SemanticObservation[] = [];
  for (const o of list) {
    const fp = [o.canonical_key, o.value, o.provenance.source_field, o.provenance.source_document_id, o.period.period_end || '', o.period.period_start || ''].join('|');
    if (seen.has(fp)) continue;
    seen.add(fp);
    deduped.push(o);
  }
  const sorted = [...deduped].sort((a, b) => {
    const corr = (b.lifecycle_state === 'confirmed' && b.review_state === 'corrected' ? 1 : 0) - (a.lifecycle_state === 'confirmed' && a.review_state === 'corrected' ? 1 : 0);
    if (corr !== 0) return corr;
    const rec = periodRecency(b) - periodRecency(a);
    if (rec !== 0) return rec;
    const rv = new Date(b.reviewed_at || 0).getTime() - new Date(a.reviewed_at || 0).getTime();
    if (rv !== 0) return rv;
    return (b.confidence ?? 0) - (a.confidence ?? 0);
  });
  return { best: sorted[0], rest: sorted.slice(1) };
}

export interface Resolution {
  observation: SemanticObservation | null;
  reason: 'resolved' | 'no_observation' | 'period_mismatch';
  requested_period_type?: string;
  available_period_types: string[];
  alternates: SemanticObservation[];
}

/**
 * resolveSemanticObservation — the ONE resolver contract 6D.1 can replace
 * internally without any consumer changing. `requiredPeriodType` is how a
 * question about CURRENT/TTM data is answered honestly: when only another
 * period exists, the result says so instead of reusing it.
 */
export function resolveSemanticObservation(
  observations: SemanticObservation[],
  canonicalKey: string,
  opts: { businessId?: string | null; requiredPeriodType?: string | null } = {},
): Resolution {
  const scoped = (observations || []).filter(
    (o) => o.canonical_key === canonicalKey && (!opts.businessId || o.business_id === opts.businessId),
  );
  const available_period_types = [...new Set(scoped.map((o) => o.period.period_type).filter(Boolean))] as string[];

  if (scoped.length === 0) {
    return { observation: null, reason: 'no_observation', available_period_types, alternates: [] };
  }
  if (opts.requiredPeriodType) {
    const exact = scoped.filter((o) => o.period.period_type === opts.requiredPeriodType);
    if (exact.length === 0) {
      return {
        observation: null,
        reason: 'period_mismatch',
        requested_period_type: String(opts.requiredPeriodType),
        available_period_types,
        alternates: [],
      };
    }
    const { best, rest } = bestObservation(exact);
    return { observation: best, reason: 'resolved', alternates: rest, available_period_types };
  }
  const { best, rest } = bestObservation(scoped);
  return { observation: best, reason: 'resolved', alternates: rest, available_period_types };
}

export interface UnmappedObservation {
  field_name: string;
  value: string | null;
  normalized_value: number | null;
  source_document_type: string | null;
  source_document_id: string | null;
  period_label: string;
  review_state: string;
  reason: string;
}

export interface ObservationLayer {
  mapping_version: string;
  observations: SemanticObservation[];
  by_key: Record<string, SemanticObservation>;
  availability: Record<string, string[]>;
  unmapped_observations: UnmappedObservation[];
  counts: {
    mapped: number;
    unmapped: number;
    pending: number;
    rejected: number;
    foreign_business: number;
    without_business_scope: number;
  };
}

/**
 * buildObservationLayer — the layer both consumers read. Business-scoped by
 * construction: observations whose business_id does not equal the one being
 * resolved are counted and DROPPED, never surfaced.
 */
export function buildObservationLayer(rows: any[], businessId: string, keys?: string[]): ObservationLayer {
  const observations: SemanticObservation[] = [];
  const unmapped_observations: UnmappedObservation[] = [];
  const counts = { mapped: 0, unmapped: 0, pending: 0, rejected: 0, foreign_business: 0, without_business_scope: 0 };

  for (const row of rows || []) {
    const result = mapObservation(row, businessId);

    if (result.status === 'mapped') {
      if (!keys || keys.includes(result.observation.canonical_key)) observations.push(result.observation);
      else unmapped_observations.push(toUnmapped(row, 'canonical meaning is outside this layer\'s scope'));
      continue;
    }
    if (result.status === 'foreign_business') { counts.foreign_business++; continue; }
    if (result.status === 'no_business') { counts.without_business_scope++; continue; }
    if (result.status === 'ineligible') {
      if (result.lifecycle_state === 'rejected') counts.rejected++;
      else counts.pending++;
      continue;
    }
    unmapped_observations.push(toUnmapped(row, result.reason));
  }

  const by_key: Record<string, SemanticObservation> = {};
  const availability: Record<string, string[]> = {};
  for (const key of [...new Set(observations.map((o) => o.canonical_key))]) {
    const res = resolveSemanticObservation(observations, key, { businessId });
    if (res.observation) by_key[key] = res.observation;
    availability[key] = res.available_period_types;
  }

  counts.mapped = observations.length;
  counts.unmapped = unmapped_observations.length;

  return { mapping_version: SEMANTIC_MAPPING_VERSION, observations, by_key, availability, unmapped_observations, counts };
}

function toUnmapped(row: any, reason: string): UnmappedObservation {
  const period = observationPeriod(row);
  return {
    field_name: row?.field_name || '—',
    value: row?.accepted_value ?? row?.field_value ?? null,
    normalized_value: numericValue(row),
    source_document_type: row?.source_document_type || null,
    source_document_id: row?.document_id || null,
    period_label: period.label,
    review_state: String(row?.review_status ?? 'unknown'),
    reason,
  };
}

/** Human source phrase for Galileo. Never claims verification. */
export function humanSourceLabel(o: SemanticObservation): string {
  const parts = [`your reviewed ${documentTypeLabel(o.provenance.source_document_type)}`];
  if (o.period.period_origin === 'parsed') parts.push(`covering ${o.period.label}`);
  else if (o.period.period_origin === 'declared') parts.push(`recorded as ${o.period.label}`);
  else if (o.period.period_origin === 'inferred') parts.push(`period ${o.period.label} (recorded by extraction)`);
  return parts.join(' ');
}