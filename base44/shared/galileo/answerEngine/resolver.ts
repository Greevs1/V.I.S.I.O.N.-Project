/**
 * Phase 6D.0c.2 — THE DETERMINISTIC EVIDENCE RESOLVER.
 *
 *   1 VERIFIED     exact concept + period
 *   2 CONFIRMED    exact concept + period
 *   3 PROVISIONAL  exact concept + period
 *   4 CONFLICTED   same tier, same period, different values — never a pick
 *   5 AMBIGUOUS_PERIOD  no period named and the winning tier spans several
 *   6 RELATED_ONLY      no exact evidence; a RELATED concept has some
 *   7 UNAVAILABLE
 *
 * Reviewed beats unreviewed. Exact concept beats related. A named year is exact.
 * A projected/advisory envelope is NEVER admissible for an actual concept, and a
 * forbidden substitution (total_tax for tax actually paid) is never made.
 */

import { conceptDef } from './ontology.ts';

export const RESOLUTION_STATES = ['VERIFIED', 'CONFIRMED', 'PROVISIONAL', 'CONFLICTED', 'AMBIGUOUS_PERIOD', 'RELATED_ONLY', 'AMBIGUOUS_CONCEPT', 'UNAVAILABLE'];
export const EVIDENCE_TIERS = ['VERIFIED', 'CONFIRMED', 'PROVISIONAL'];
/** States in which the requested figure EXISTS — it may never be called missing. */
export const STATES_WITH_EVIDENCE = ['VERIFIED', 'CONFIRMED', 'PROVISIONAL', 'CONFLICTED', 'AMBIGUOUS_PERIOD'];

/** The opportunity firewall and the exact-concept rule, in one predicate. */
export function isAdmissibleFor(def: any, e: any) {
  if (!def || !e || !Array.isArray(e.concepts)) return false;
  if (e.basis !== def.basis || e.lane === 'advisory') return false;
  return e.concepts.includes(def.concept);
}

const valueKey = (e: any) => String(Math.round(Number(e.value) * 100));

/** One envelope per distinct (value, document) — re-extraction is not disagreement. */
function dedupe(list: any[]) {
  const seen = new Set();
  return list.filter((e) => {
    const k = `${valueKey(e)}|${e.source?.document_id || ''}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function settle(state: string, group: any[], extra: any = {}) {
  const values = [...new Set(group.map(valueKey))];
  if (values.length > 1) return { state: 'CONFLICTED', primary: [], candidates: dedupe(group), ...extra };
  return { state, primary: dedupe(group), candidates: [], ...extra };
}

const yearsOf = (list: any[]) => [...new Set(list.map((e) => e.period?.fiscal_year).filter((y: any) => y != null))].sort((a: any, b: any) => a - b);

/** Resolve ONE concept against the factual envelopes. */
export function resolveConceptEvidence(conceptKey: any, envelopes: any[], period: any = { type: 'unspecified' }) {
  const def = conceptDef(conceptKey);
  const exact = (envelopes || []).filter((e) => isAdmissibleFor(def, e));
  const available_periods = yearsOf(exact);
  const base = { concept: conceptKey, available_periods };
  if (!def || exact.length === 0) return { ...base, state: 'UNAVAILABLE', reason: 'no_evidence', primary: [], candidates: [] };

  if (period?.type === 'fiscal_year') {
    const inYear = exact.filter((e) => Number(e.period?.fiscal_year) === Number(period.year));
    if (inYear.length === 0) return { ...base, state: 'UNAVAILABLE', reason: 'no_evidence_for_period', primary: [], candidates: [] };
    for (const tier of EVIDENCE_TIERS) {
      const t = inYear.filter((e) => e.evidence_state === tier);
      if (t.length) return { ...base, ...settle(tier, t), reason: 'resolved', period: { type: 'fiscal_year', year: Number(period.year) } };
    }
  }

  for (const tier of EVIDENCE_TIERS) {
    const t = exact.filter((e) => e.evidence_state === tier);
    if (!t.length) continue;
    const years = yearsOf(t);
    if (years.length > 1) {
      // The figures exist; only the CHOICE of period is open. Ask — never pick
      // the newest, never call it missing.
      const per = years.map((y) => {
        const inY = dedupe(t.filter((e) => Number(e.period?.fiscal_year) === Number(y)));
        return { fiscal_year: y, label: `FY${y}`, conflicted: new Set(inY.map(valueKey)).size > 1, evidence: inY };
      });
      return { ...base, state: 'AMBIGUOUS_PERIOD', reason: 'period_not_named', primary: [], candidates: per.flatMap((p) => p.evidence), periods: per, tier };
    }
    const group = years.length === 1 ? t.filter((e) => Number(e.period?.fiscal_year) === Number(years[0])) : t;
    const lower = exact.filter((e) => EVIDENCE_TIERS.indexOf(e.evidence_state) > EVIDENCE_TIERS.indexOf(tier));
    const other_periods = yearsOf(lower).filter((y) => y !== years[0]);
    return { ...base, ...settle(tier, group), reason: years.length ? 'resolved' : 'resolved_period_unstated', other_periods };
  }
  return { ...base, state: 'UNAVAILABLE', reason: 'no_evidence', primary: [], candidates: [] };
}

const hasEvidence = (r: any) => STATES_WITH_EVIDENCE.includes(r?.state);

/**
 * resolveFactualRequest — the requested-concept contract against the evidence.
 * Ambiguous terms resolve to the ONE plausible concept that has evidence, or to a
 * clarification when several do.
 */
export function resolveFactualRequest(request: any, envelopes: any[]) {
  const period = request?.period || { type: 'unspecified' };

  if (request?.ambiguous) {
    const options = request.ambiguous.candidates
      .map((c: string) => ({ concept: c, resolution: resolveConceptEvidence(c, envelopes, period) }))
      .filter((o: any) => hasEvidence(o.resolution));
    if (options.length === 1) {
      return { ...options[0].resolution, concept: options[0].concept, resolved_from_term: request.ambiguous.term, related: [] };
    }
    if (options.length > 1) {
      return { concept: null, state: 'AMBIGUOUS_CONCEPT', reason: 'term_has_several_meanings', term: request.ambiguous.term, options, primary: [], candidates: [], related: [] };
    }
    return { concept: null, state: 'UNAVAILABLE', reason: 'no_evidence_for_any_meaning', term: request.ambiguous.term, primary: [], candidates: [], related: [] };
  }

  const def = conceptDef(request?.concept);
  const r = resolveConceptEvidence(request?.concept, envelopes, period);
  if (r.state !== 'UNAVAILABLE' || !def) return { ...r, related: [] };

  // No exact evidence — what RELATED evidence exists is named as related, never
  // presented as the answer.
  const related = def.related
    .map((rc: string) => ({ concept: rc, resolution: resolveConceptEvidence(rc, envelopes, period) }))
    .filter((x: any) => hasEvidence(x.resolution));
  if (related.length && r.reason === 'no_evidence') return { ...r, state: 'RELATED_ONLY', reason: 'related_evidence_only', related };
  return { ...r, related };
}