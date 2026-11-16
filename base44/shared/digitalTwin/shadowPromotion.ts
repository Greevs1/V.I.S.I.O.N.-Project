/**
 * digitalTwin/shadowPromotion.ts — Phase 6D.1B
 *
 * THE SHADOW PROMOTION ENGINE. PURE. DETERMINISTIC. READ-ONLY.
 *
 * ── WHAT IT IS ──────────────────────────────────────────────────────────────
 *
 * It answers, for real evidence: "What canonical Digital Twin fact WOULD this
 * evidence create?" — and it answers with a complete, auditable candidate: the value,
 * the period, the basis, the source, the authority, the trust state, the conflict
 * position, and the EXACT fingerprint a real promotion would write.
 *
 * ── WHAT IT IS NOT ──────────────────────────────────────────────────────────
 *
 * It holds no Supabase client, performs no I/O, and contains no INSERT, UPDATE, DELETE
 * or UPSERT. It CANNOT write: it is a function of its arguments. The certification
 * harness asserts this at source level, and the production shadow function measures the
 * fact freeze before AND after every run rather than assuming it.
 *
 * ── REUSE, NOT REBUILD ──────────────────────────────────────────────────────
 *
 *   · eligibility, origin, association, period, basis, trust, semantics
 *       → the CERTIFIED 6D.1A pre-flight (`evaluatePromotionPreflight`) is called as
 *         the gate. There is no second pre-flight, no second blocker vocabulary.
 *   · semantic mapping → `fieldMapping` / `docTypeAllowed` from the ONE bridge
 *       (`documentObservation/semantics.ts`). No second ontology.
 *   · conflict identity → the 6C conflict view's own grouping (business · fact key ·
 *       period type · label · basis · normalized bounds).
 *   · materiality → the fact's own `conflict_materiality_threshold` in the registry.
 *   · authority → `SOURCE_AUTHORITY` (the one hierarchy).
 *   · fingerprint → `fingerprintOf` (the one 6C identity).
 *
 * ── THE PILOT ───────────────────────────────────────────────────────────────
 *
 * 6D.1B activates shadow promotion for exactly TWO facts: `revenue` and `gross_profit`.
 * The registry declares ten pilot facts; this phase's ACTIVE pilot is a deliberate
 * subset, so a fact key outside it returns NOT_IN_PILOT even though a mapping exists.
 */

import { evaluatePromotionPreflight, numericValue } from './preflight.ts';
import { getFactDefinition } from '../canonicalFact/registry.ts';
import { SOURCE_AUTHORITY } from '../canonicalFact/types.ts';
import { fieldMapping, docTypeAllowed } from '../documentObservation/semantics.ts';
import { deriveTrust } from './trust.ts';
import { fingerprintOf } from './fingerprint.ts';
import {
  SHADOW_VERSION,
  SHADOW_DECISIONS,
  SHADOW_WARNINGS,
  type ShadowDecision,
  type ShadowPromotionResult,
  type ShadowSummary,
  type ShadowCandidateDetail,
  type FingerprintOutcome,
} from './shadowContract.ts';

export const SHADOW_ENGINE_VERSION = SHADOW_VERSION;

/** The 6D.1B ACTIVE pilot. Everything else is evaluated and reported NOT_IN_PILOT. */
export const SHADOW_PILOT_KEYS: string[] = ['revenue', 'gross_profit'];

/** The observation table the fingerprint names as its source. */
const OBSERVATION_SOURCE_TABLE = 'extracted_fields';

// ── Value parsing (ONE implementation, shared with the pre-flight) ───────────
// The shadow engine does NOT re-implement the value parse: it reuses the pre-flight's
// `numericValue`, so malformed text cannot be null in one place and 0 in the other.
// Kept exported under its shadow name for callers that already hold a row.
export const numericOf = numericValue;

export function confidenceOf(row: any): number | null {
  const raw = row?.confidence_score ?? row?.metadata?.confidence ?? null;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function authorityRankOf(authority: unknown): number {
  const key = String(authority || '');
  return (SOURCE_AUTHORITY as any)[key] ?? 99;
}

/** The 6C conflict identity, as the conflict view groups it. */
export function conflictIdentityOf(input: {
  business_id: unknown;
  fact_key: unknown;
  period_type: unknown;
  period_label: unknown;
  period_start: unknown;
  period_end: unknown;
  accounting_basis: unknown;
}): string {
  const c = (v: unknown) => (v == null ? '' : String(v));
  return [
    c(input.business_id),
    c(input.fact_key),
    c(input.period_type),
    c(input.period_label),
    c(input.period_start),
    c(input.period_end),
    c(input.accounting_basis),
  ].join('§');
}

// ── Inputs ──────────────────────────────────────────────────────────────────
export interface ShadowObservationInput {
  observation: any;
  document?: any;
  analysis?: any;
  association?: any;
  attestation?: any;
}

export interface ShadowPromotionInput {
  business: { businessId: string | null; businessName?: string | null };
  observations: ShadowObservationInput[];
  /** Live facts for duplicate / correction / supersession simulation. Never written to. */
  existingFacts?: any[];
  pilotKeys?: string[];
}

interface Candidate {
  index: number;
  row: any;
  preflight: any;
  factDef: any;
  value: number | null;
  confidence: number | null;
  trust: any;
  source_type: string | null;
  source_authority: string | null;
  source_authority_rank: number;
  in_pilot: boolean;
  identity: string | null;
  fingerprint: { preimage: string; sha256: string } | null;
  // assigned during resolution
  decision: ShadowDecision;
  warnings: string[];
  evidence_ids: string[];
  conflicting_candidate_ids: string[];
  supersedes_candidate_id: string | null;
  fingerprint_outcome: FingerprintOutcome | null;
  selected: boolean;
  group_members: Candidate[];
}

function buildCandidate(index: number, item: ShadowObservationInput, business: any, pilotKeys: string[]): Candidate {
  const row = item?.observation ?? {};
  const preflight = evaluatePromotionPreflight({
    observation: row,
    document: item?.document ?? null,
    analysis: item?.analysis ?? null,
    business,
    association: item?.association ?? {},
    attestation: item?.attestation ?? null,
  });

  const fieldName = row?.field_name ?? null;
  const docType = row?.source_document_type ?? null;
  const matches = fieldMapping(fieldName).filter((m: any) => docTypeAllowed(m.doc_types, docType));
  const chosen = matches[0] ?? null;

  const key = preflight.canonical_key ?? null;
  const factDef = key ? (getFactDefinition(key) ?? null) : null;
  const trust = deriveTrust({ reviewStatus: row?.review_status, attestation: item?.attestation ?? null });
  const value = numericOf(row);
  const confidence = confidenceOf(row);
  const sourceAuthority = chosen?.source_authority ?? preflight.source_authority ?? null;

  const p = preflight.period || {};
  const fingerprint = key && value != null
    ? fingerprintOf({
      business_id: row?.business_id ?? business?.businessId ?? null,
      fact_key: key,
      period_type: p.period_type ?? null,
      period_label: p.label ?? null,
      period_start: p.period_start ?? null,
      period_end: p.period_end ?? null,
      accounting_basis: preflight.basis ?? null,
      source_type: chosen?.source_type ?? null,
      source_table: OBSERVATION_SOURCE_TABLE,
      source_id: row?.id ?? null,
      canonical_value: value,
    })
    : null;

  const identity = key
    ? conflictIdentityOf({
      business_id: row?.business_id ?? business?.businessId ?? null,
      fact_key: key,
      period_type: p.period_type ?? null,
      period_label: p.label ?? null,
      period_start: p.period_start ?? null,
      period_end: p.period_end ?? null,
      accounting_basis: preflight.basis ?? null,
    })
    : null;

  const inPilot = Boolean(key) && pilotKeys.includes(String(key));

  const blockers: string[] = preflight.blockers || [];
  let decision: ShadowDecision;
  if (!key) decision = SHADOW_DECISIONS.NO_CANDIDATE;
  else if (!inPilot) decision = SHADOW_DECISIONS.NOT_IN_PILOT;
  else if (blockers.length > 0) decision = SHADOW_DECISIONS.BLOCKED;
  else decision = SHADOW_DECISIONS.WOULD_PROMOTE; // provisional — the group pass may change it

  return {
    index,
    row,
    preflight,
    factDef,
    value,
    confidence,
    trust,
    source_type: chosen?.source_type ?? null,
    source_authority: sourceAuthority,
    source_authority_rank: authorityRankOf(sourceAuthority),
    in_pilot: inPilot,
    identity,
    fingerprint,
    decision,
    warnings: [],
    evidence_ids: [row?.id].filter(Boolean) as string[],
    conflicting_candidate_ids: [],
    supersedes_candidate_id: null,
    fingerprint_outcome: null,
    selected: false,
    group_members: [],
  };
}

/** Materiality, exactly as the registry declares it (default 5% where undeclared). */
function materialityThresholdFor(factDef: any): number {
  const t = Number(factDef?.conflict_materiality_threshold);
  return Number.isFinite(t) && t > 0 ? t : 0.05;
}

function relativeSpread(values: number[]): number {
  if (values.length < 2) return 0;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const base = Math.max(Math.abs(max), Math.abs(min), 1);
  return (max - min) / base;
}

/**
 * resolveGroup — deterministic conflict resolution for ONE identity.
 *
 * It mirrors the certified read-time resolver: the HIGHEST-authority candidate wins; a
 * conflict exists only when the top authority tier itself disagrees materially, and
 * then no deterministic winner exists. Losing evidence is never discarded — it stays in
 * `candidates` and in the winner's `evidence_ids`.
 */
function resolveGroup(members: Candidate[], factDef: any): void {
  const threshold = materialityThresholdFor(factDef);
  const values = members.map((m) => m.value as number);
  const spread = relativeSpread(values);

  const topRank = Math.min(...members.map((m) => m.source_authority_rank));
  const topTier = members.filter((m) => m.source_authority_rank === topRank);

  const topValues = topTier.map((m) => m.value as number);
  const topMaterial = relativeSpread(topValues) > threshold;

  if (topTier.length > 1 && topMaterial) {
    // Same authority, materially different values → no deterministic winner.
    const ids = members.map((m) => String(m.row?.id));
    for (const m of members) {
      m.decision = SHADOW_DECISIONS.CONFLICTED;
      m.conflicting_candidate_ids = ids;
      m.selected = false;
      m.group_members = members;
    }
    return;
  }

  // Deterministic winner: highest authority, then higher confidence, then lower id.
  const ordered = [...topTier].sort((a, b) => {
    if (a.source_authority_rank !== b.source_authority_rank) return a.source_authority_rank - b.source_authority_rank;
    const ca = a.confidence ?? -1, cb = b.confidence ?? -1;
    if (ca !== cb) return cb - ca;
    return String(a.row?.id) < String(b.row?.id) ? -1 : 1;
  });
  const winner = ordered[0];
  const loserIds = members.filter((m) => m !== winner);
  const topIds = topTier.filter((m) => m !== winner);

  winner.decision = SHADOW_DECISIONS.WOULD_PROMOTE;
  winner.selected = true;
  winner.evidence_ids = members.map((m) => String(m.row?.id)).filter(Boolean);
  winner.group_members = members;

  const distinct = new Set(values.map((v) => String(v)));
  if (distinct.size === 1) winner.warnings.push(SHADOW_WARNINGS.DUPLICATE_OBSERVATION);
  else if (spread > threshold) winner.warnings.push(SHADOW_WARNINGS.LOWER_AUTHORITY_DISAGREEMENT);
  else winner.warnings.push(SHADOW_WARNINGS.MINOR_VARIANCE);

  for (const m of loserIds) {
    m.decision = SHADOW_DECISIONS.SUPERSEDED;
    m.supersedes_candidate_id = String(winner.row?.id);
    m.selected = false;
    m.group_members = members;
    m.warnings.push(SHADOW_WARNINGS.NOT_SELECTED_SUBSUMED);
    if (topIds.includes(m)) m.warnings.push(SHADOW_WARNINGS.DUPLICATE_OBSERVATION);
  }
}

/**
 * fingerprintOutcomeFor — NEW / DUPLICATE / CORRECTION, from the fingerprint a real
 * promotion would write. Simulation only: `existingFacts` is an INPUT, never a query.
 */
function fingerprintOutcomeFor(winner: Candidate, existingFacts: any[], businessId: string | null): { outcome: FingerprintOutcome; supersedes: string | null; warnings: string[] } {
  const warnings: string[] = [];
  const pid = winner.fingerprint?.sha256 ?? null;
  if (!pid) return { outcome: null as any, supersedes: null, warnings };

  const sameIdentity = existingFacts.filter((f) => {
    if (!f) return false;
    if (String(f.business_id ?? '') !== String(businessId ?? '')) return false;
    if (String(f.fact_key ?? '') !== String(winner.preflight.canonical_key ?? '')) return false;
    return conflictIdentityOf({
      business_id: f.business_id,
      fact_key: f.fact_key,
      period_type: f.period_type,
      period_label: f.period_label,
      period_start: f.period_start,
      period_end: f.period_end,
      accounting_basis: f.accounting_basis,
    }) === winner.identity;
  });

  if (sameIdentity.some((f) => String(f.fingerprint ?? '') === pid)) {
    warnings.push(SHADOW_WARNINGS.DUPLICATE_FINGERPRINT);
    return { outcome: 'DUPLICATE', supersedes: null, warnings };
  }

  const live = sameIdentity.find((f) => f.superseded_at == null);
  if (live) {
    warnings.push(SHADOW_WARNINGS.CORRECTION_OF_EXISTING_FACT);
    return { outcome: 'CORRECTION', supersedes: String(live.id), warnings };
  }

  if (sameIdentity.length > 0) warnings.push(SHADOW_WARNINGS.EXISTING_FACT_SUPERSEDED);
  return { outcome: 'NEW', supersedes: null, warnings };
}

function valueWarnings(key: string | null, value: number | null): string[] {
  const out: string[] = [];
  if (value == null) return out;
  if (value === 0) out.push(SHADOW_WARNINGS.ZERO_VALUE);
  if (value < 0) out.push(SHADOW_WARNINGS.NEGATIVE_VALUE);
  return out;
}

function traceFor(c: Candidate, decision: ShadowDecision): Array<{ step: string; code: string; detail: string }> {
  const p = c.preflight;
  return [
    { step: 'provenance', code: String(p.evidence_origin), detail: (p.origin_signals || []).join(',') },
    { step: 'business_association', code: String(p.business_association), detail: String(p.association_reason ?? '') },
    { step: 'semantic', code: String(p.canonical_key ?? 'unmapped'), detail: String(c.source_type ?? 'no_source_candidate') },
    { step: 'period', code: String(p.period_quality), detail: String(p.period?.label ?? p.period?.raw ?? 'no_period') },
    { step: 'basis', code: String(p.basis), detail: p.basis_required ? 'required' : 'not_required' },
    { step: 'review', code: String(p.review_state), detail: String(p.verification_state) },
    { step: 'decision', code: decision, detail: (p.blockers || []).join(',') || 'no_blockers' },
  ];
}

function detailFor(c: Candidate): ShadowCandidateDetail {
  return {
    evidence_id: String(c.row?.id ?? ''),
    value: c.value,
    source_type: c.source_type,
    source_authority: c.source_authority,
    source_authority_rank: c.source_authority_rank,
    machine_confidence: c.confidence,
    human_confirmation_state: String(c.preflight.review_state ?? ''),
    verification_state: String(c.preflight.verification_state ?? ''),
    selected: c.selected,
  };
}

function resultFor(c: Candidate, business: any): ShadowPromotionResult {
  const p = c.preflight;
  const per = p.period || {};
  const isSelectedPilot = c.decision === SHADOW_DECISIONS.WOULD_PROMOTE;
  const duplicate = c.fingerprint_outcome === 'DUPLICATE';

  const members = c.group_members.length ? c.group_members : [c];

  return {
    shadow_version: SHADOW_ENGINE_VERSION,
    business_id: business?.businessId ?? null,
    business_name: business?.businessName ?? null,

    fact_key: p.canonical_key ?? null,
    display_name: p.display_name ?? c.factDef?.display_name ?? null,
    in_pilot: c.in_pilot,

    decision: c.decision,

    candidate_value: c.value,
    value_type: c.factDef?.value_type ?? null,
    currency: c.factDef?.unit ?? null,

    period_type: per.period_type ?? null,
    period_label: per.label ?? null,
    period_start: per.period_start ?? null,
    period_end: per.period_end ?? null,
    fiscal_year: per.fiscal_year ?? null,
    period_quality: String(p.period_quality),

    accounting_basis: String(p.basis),
    basis_required: Boolean(p.basis_required),

    source_type: c.source_type,
    source_id: String(c.row?.id ?? '') || null,
    source_authority: c.source_authority,
    source_authority_rank: c.source_authority_rank,
    provenance_class: String(p.evidence_origin),

    business_association: String(p.business_association),
    machine_confidence: c.confidence,
    human_confirmation_state: String(p.review_state),
    verification_state: String(p.verification_state),
    verification_method: c.trust?.verification_method ?? null,

    evidence_ids: c.evidence_ids,

    blockers: [...(p.blockers || [])],
    warnings: [...c.warnings],
    resolver_trace: traceFor(c, c.decision),

    conflict_group: c.identity,
    conflicting_candidate_ids: c.conflicting_candidate_ids,
    candidates: members.length > 1 ? members.map(detailFor) : [],
    supersedes_candidate_id: c.supersedes_candidate_id,

    fingerprint: c.fingerprint?.sha256 ?? null,
    fingerprint_preimage: c.fingerprint?.preimage ?? null,
    fingerprint_outcome: c.fingerprint_outcome,

    would_write_fact: isSelectedPilot && !duplicate,
    would_write_evidence: isSelectedPilot,
  };
}

/**
 * evaluateShadowPromotion — THE ONE shadow decision, for a batch of observations.
 * Deterministic: same input, same output. No clock, no randomness, no I/O.
 */
export function evaluateShadowPromotion(input: ShadowPromotionInput): ShadowPromotionResult[] {
  const business = input?.business ?? { businessId: null, businessName: null };
  const pilotKeys = input?.pilotKeys ?? SHADOW_PILOT_KEYS;
  const existingFacts = input?.existingFacts ?? [];

  const items = [...(input?.observations ?? [])].sort((a, b) =>
    String(a?.observation?.id ?? '') < String(b?.observation?.id ?? '') ? -1 : 1);

  const cands = items.map((item, i) => buildCandidate(i, item, business, pilotKeys));

  // ── Conflict grouping for ELIGIBLE pilot candidates only ──────────────────
  const groups = new Map<string, Candidate[]>();
  for (const c of cands) {
    if (!c.in_pilot || c.identity == null) continue;
    if ((c.preflight.blockers || []).length > 0) continue;
    const key = c.identity;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }
  for (const [key, members] of groups) {
    const factDef = members[0]?.factDef ?? null;
    resolveGroup(members, factDef);
    for (const m of members) m.identity = key;
  }

  // ── Fingerprint outcome for every WOULD_PROMOTE ───────────────────────────
  for (const c of cands) {
    if (c.decision === SHADOW_DECISIONS.WOULD_PROMOTE) {
      const res = fingerprintOutcomeFor(c, existingFacts, business.businessId);
      c.fingerprint_outcome = res.outcome;
      c.warnings.push(...res.warnings);
      if (res.supersedes) c.supersedes_candidate_id = res.supersedes;
    } else if (c.fingerprint) {
      c.fingerprint_outcome = 'NEW';
    }
    c.warnings.push(...valueWarnings(c.preflight.canonical_key ?? null, c.value));
  }

  // ── Cross-fact plausibility: gross profit above revenue (a WARNING, not a gate) ──
  const revenueValues = cands
    .filter((c) => c.preflight.canonical_key === 'revenue' && c.value != null)
    .map((c) => c.value as number);
  const revenueRef = revenueValues.length ? Math.max(...revenueValues) : null;
  if (revenueRef != null) {
    for (const c of cands) {
      if (c.preflight.canonical_key === 'gross_profit' && c.value != null && c.value > revenueRef) {
        c.warnings.push(SHADOW_WARNINGS.GROSS_PROFIT_EXCEEDS_REVENUE);
      }
    }
  }

  return cands.map((c) => resultFor(c, business));
}

export function summarizeShadow(results: ShadowPromotionResult[]): ShadowSummary {
  const by_decision: Record<string, number> = {};
  const pilot_candidates: Record<string, number> = {};
  const by_blocker: Record<string, number> = {};
  const by_provenance: Record<string, number> = {};
  const by_period_quality: Record<string, number> = {};
  const by_association: Record<string, number> = {};
  const by_verification_state: Record<string, number> = {};
  let would_write_facts = 0;
  let would_write_evidence_rows = 0;

  for (const r of results) {
    by_decision[r.decision] = (by_decision[r.decision] || 0) + 1;
    if (r.in_pilot && r.fact_key) pilot_candidates[r.fact_key] = (pilot_candidates[r.fact_key] || 0) + 1;
    for (const b of r.blockers) by_blocker[b] = (by_blocker[b] || 0) + 1;
    by_provenance[r.provenance_class] = (by_provenance[r.provenance_class] || 0) + 1;
    by_period_quality[r.period_quality] = (by_period_quality[r.period_quality] || 0) + 1;
    by_association[r.business_association] = (by_association[r.business_association] || 0) + 1;
    by_verification_state[r.verification_state] = (by_verification_state[r.verification_state] || 0) + 1;
    if (r.would_write_fact) would_write_facts += 1;
    if (r.would_write_evidence) would_write_evidence_rows += r.evidence_ids.length;
  }

  return {
    shadow_version: SHADOW_ENGINE_VERSION,
    observations_evaluated: results.length,
    results: results.length,
    by_decision,
    pilot_candidates,
    by_blocker,
    by_provenance,
    by_period_quality,
    by_association,
    by_verification_state,
    would_write_facts,
    would_write_evidence_rows,
  };
}