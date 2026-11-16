/**
 * Phase 6D.0c.1 — PROVISIONAL EVIDENCE RETRIEVAL (shared).
 *
 * Production acceptance found the gap this module closes. A supported P&L was
 * extracted: 11 figures, all `pending_review`, revenue among them. The owner then
 * asked Galileo "What is my revenue?" and was told it was NOT AVAILABLE.
 *
 * The number was available. It was simply not yet REVIEWED.
 *
 *   UNKNOWN DATA  and  UNVERIFIED DATA  are not the same thing.
 *
 * ── THE MODEL, STATED ONCE ───────────────────────────────────────────────────
 * There are four states, and they are never collapsed:
 *
 *   UNKNOWN         nothing was extracted or stated — the only honest answer is
 *                   "I don't have that".
 *   EXTRACTED /     a document yielded the figure; no human has reviewed it yet.
 *   UNVERIFIED      It is USEFUL — it may inform an answer — and it is NOT
 *                   business truth. This module's whole purpose.
 *   CONFIRMED       an authorized human accepted or corrected it. Canonical.
 *   VERIFIED        validated beyond ordinary human confirmation.
 *
 *   pending != confirmed       confirmed != verified       extracted != verified
 *
 * ── WHAT THIS MODULE IS NOT ──────────────────────────────────────────────────
 * It is NOT a second persistence system. There is no new table, no new column and
 * no copy of anything: provisional evidence is DERIVED, on every read, from the
 * SAME `extracted_fields` rows the canonical lane reads. The distinction is
 * retrieval and semantics, never storage.
 *
 * It writes nothing. It never promotes a pending row — not into
 * `business_facts`, not into `business_fact_evidence`, not into the canonical
 * semantic-observation set, and not into a confirmed or verified state. 6D.1 is
 * frozen and untouched.
 *
 * ── THE ONE RULE THAT DECIDES WHICH LANE ANSWERS (§3) ────────────────────────
 *   canonical  >  provisional  >  unavailable
 * NEVER
 *   canonical  >  unavailable        when matching provisional evidence exists.
 *
 * NOTE — keep each interface declaration compact: the offline harness
 * (src/scripts/documentKnowledgeCompletion.test.cjs) compiles this file's REAL
 * source and executes it, so it must stay free of anything but plain TS.
 */

import { fieldMapping, observationPeriod } from '../documentObservation/semantics.ts';
import { FACT_REGISTRY } from '../canonicalFact/registry.ts';
// §8 — the sensitive-field predicate is the ONE shared one (./sensitiveFields.ts),
// imported rather than copied so this lane and the focused-document projection
// cannot disagree about what is sensitive.
import { isSensitiveFieldName } from './sensitiveFields.ts';

export const PROVISIONAL_EVIDENCE_VERSION = '6d.0c.1';

/**
 * §9 — the label provisional evidence carries, and the label it must NEVER
 * carry. Extraction succeeding is not verification: a value the model read out of
 * a PDF is `PENDING REVIEW`, never `VERIFIED`, never `CONFIRMED`, and never "high
 * confidence" merely because the reader returned it.
 */
export const PROVISIONAL_EVIDENCE_LABEL = 'UNVERIFIED DOCUMENT DATA';
export const PROVISIONAL_REVIEW_LABEL = 'PENDING REVIEW';

/** The stored review states that mean "extracted, not reviewed" — no others. */
export const PENDING_REVIEW_STATES = ['pending_review', 'pending'];

/**
 * §3 — the retrieval precedence. Declared as data so a consumer can assert the
 * ORDER itself rather than trusting a chain of ifs.
 */
export const EVIDENCE_PRECEDENCE = ['canonical', 'provisional', 'unavailable'];

/**
 * §16 — the owner's own words for a canonical metric. Every key here is a REAL
 * key in the canonical registry, and the table is FILTERED against that registry
 * at load time, so a phrase can never point at a metric the platform does not
 * have. Nothing is invented, and no accounting term is given a second meaning:
 *   · "EBIT"/"operating income" deliberately has NO alias — the canonical
 *     vocabulary has no operating_income fact, and EBITDA is not EBIT. A term
 *     with no canonical key resolves to unavailable rather than to a near-miss.
 *   · "take home" has NO alias — it stays ambiguous (see TAKE_HOME_* in
 *     focusedDocument.ts) and is never silently read as revenue or AGI.
 */
export const METRIC_PHRASES = [
  { canonical_key: 'revenue', phrases: ['revenue', 'sales', 'top line', 'turnover'] },
  { canonical_key: 'gross_profit', phrases: ['gross profit'] },
  { canonical_key: 'gross_margin', phrases: ['gross margin'] },
  { canonical_key: 'net_income', phrases: ['net income', 'net profit', 'bottom line'] },
  { canonical_key: 'reported_ebitda', phrases: ['ebitda'] },
  { canonical_key: 'owner_compensation', phrases: ['owner compensation', 'owner salary'] },
  { canonical_key: 'cash', phrases: ['cash balance', 'cash on hand'] },
  { canonical_key: 'debt', phrases: ['total debt', 'loan balance', 'debt'] },
  { canonical_key: 'agi', phrases: ['adjusted gross income', 'agi'] },
  // 6D.0c.1-P §P8/§P9 — HISTORICAL TAX. The owner's own words for the tax reported
  // on a return or statement. Deliberately narrow: "tax" alone is NOT an alias (a
  // tax QUESTION may be about a projection, which is a different lane), and the
  // canonical fact carries the definition the answer must use — a reported tax
  // liability, never cash paid. The registry filter below drops this entry entirely
  // unless total_tax is a real canonical fact, so no alias can outrun the registry.
  { canonical_key: 'total_tax', phrases: ['total tax', 'tax paid', 'taxes paid', 'income tax', 'how much did i pay in tax', 'tax liability'] },
  { canonical_key: 'annual_capex', phrases: ['capex', 'capital expenditure'] },
  { canonical_key: 'recurring_revenue_pct', phrases: ['recurring revenue'] },
  { canonical_key: 'customer_concentration', phrases: ['customer concentration'] },
];

const REGISTRY_KEYS = new Set((FACT_REGISTRY || []).map((f: any) => f.fact_key));
const DISPLAY_BY_KEY: Record<string, string> = Object.fromEntries((FACT_REGISTRY || []).map((f: any) => [f.fact_key, f.display_name]));

/** Only aliases whose canonical key actually exists survive. */
const ALIAS_TABLE = METRIC_PHRASES
  .filter((e: any) => REGISTRY_KEYS.has(e.canonical_key))
  .map((e: any) => ({
    canonical_key: e.canonical_key,
    phrases: [...new Set([...(e.phrases || []), String(DISPLAY_BY_KEY[e.canonical_key] || '').toLowerCase()].filter(Boolean))],
  }));

export function metricPhraseTable() {
  return ALIAS_TABLE.map((e) => ({ canonical_key: e.canonical_key, phrases: [...e.phrases] }));
}

export function isPendingReview(state: any) {
  return PENDING_REVIEW_STATES.includes(String(state || ''));
}

/**
 * EVIDENCE ELIGIBILITY (6D.0c.3 automatic relevant-evidence policy).
 *
 * Every newly extracted row carries a four-state verdict written by the extraction
 * engine (`metadata.evidence_eligibility.state`): BUSINESS_RELEVANT, PERSONAL_ONLY,
 * SENSITIVE or AMBIGUOUS. The business-evidence lane admits ONLY BUSINESS_RELEVANT
 * rows, so a figure whose relationship to this business was assessed and NOT
 * established cannot become business intelligence — not silently, and not because a
 * business happened to be selected when it was uploaded.
 *
 * A row with NO verdict predates the policy. It is not re-judged here: the rules that
 * already governed it (business scoping, the sensitive-name predicate, the document
 * type's own admission table) still apply unchanged. A new extraction always carries
 * its verdict.
 */
export const NON_BUSINESS_ELIGIBILITY_STATES = ['PERSONAL_ONLY', 'AMBIGUOUS', 'SENSITIVE'];

export function rowEligibilityState(row: any): string | null {
  const recorded = row?.metadata?.evidence_eligibility;
  const state = recorded && typeof recorded === 'object' ? String(recorded.state || '') : '';
  if (state) return state;
  if (row?.metadata?.business_eligible === true) return 'BUSINESS_RELEVANT';
  return null;
}

export function rowExcludedByEligibility(row: any): boolean {
  const state = rowEligibilityState(row);
  return !!state && NON_BUSINESS_ELIGIBILITY_STATES.includes(state);
}

/** The same numeric rule the canonical lane applies — one rule, two lanes. */
export function provisionalNumeric(row: any) {
  const pick = row?.accepted_normalized_value ?? row?.accepted_value ?? row?.normalized_value ?? row?.field_value;
  if (pick == null || pick === '') return null;
  if (typeof pick === 'number') return Number.isFinite(pick) ? pick : null;
  const cleaned = String(pick).replace(/[^0-9.\-]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * The canonical rule for "does this document type admit this field", applied
 * identically here and in the observation layer so the two lanes can never
 * disagree about which extracted fields HAVE a canonical meaning.
 */
function docTypeAdmits(docTypes: any, documentType: any) {
  if (!docTypes || docTypes.length === 0) return true;
  if (!documentType) return false;
  return docTypes.includes(String(documentType));
}

/**
 * §8 — a field whose name is recognizably an identifier never becomes evidence.
 * The rule is the ONE shared predicate imported above; this module carries no copy.
 */

/**
 * §16/§17 — the BUSINESS FILTER is not optional and is not the caller's. Rows
 * whose business does not equal the resolved one are dropped here, so a
 * cross-business row that arrived from any source is excluded from evidence
 * before anything else looks at it. An unscoped row is never inferred into a
 * business.
 */
export function provisionalRowsForBusiness(rows: any, businessId: any) {
  if (!businessId) return [];
  return (Array.isArray(rows) ? rows : []).filter((r) => r && r.business_id === businessId);
}

/**
 * buildProvisionalEvidence — pending extracted rows → clearly provisional items.
 *
 * Refuses, in the same spirit as the canonical mapper: no business scope, a
 * foreign business, a non-pending review state, no field name, a sensitive field
 * name, no canonical definition for this field name AND document type, or no
 * usable numeric value. What survives is useful, sourced, and stated as
 * unverified.
 */
export function buildProvisionalEvidence(rows: any, businessId: any) {
  const scoped = provisionalRowsForBusiness(rows, businessId);
  const items: any[] = [];

  for (const row of scoped) {
    if (!isPendingReview(row.review_status)) continue;
    const fieldName = row.field_name || null;
    if (!fieldName) continue;
    if (isSensitiveFieldName(fieldName)) continue;
    // The eligibility verdict, when the row carries one: personal-only and
    // un-associated figures stay document evidence and never reach this lane.
    if (rowExcludedByEligibility(row)) continue;

    const documentType = row.source_document_type || null;
    const candidates = fieldMapping(fieldName).filter((m: any) => docTypeAdmits(m.doc_types, documentType));
    if (candidates.length === 0) continue;

    const value = provisionalNumeric(row);
    if (value == null) continue;

    const chosen = candidates[0];
    const period = observationPeriod(row);
    const conf = row.confidence_score == null ? null : Number(row.confidence_score);
    const confOk = Number.isFinite(conf) ? conf : null;

    items.push({
      evidence_id: row.id || null,
      canonical_key: chosen.fact_key,
      display_name: DISPLAY_BY_KEY[chosen.fact_key] || chosen.fact_key,
      field_name: fieldName,
      value,
      value_type: 'currency',
      business_id: businessId,
      period,
      period_label: period.label,
      fiscal_year: period.fiscal_year ?? null,
      review_status: String(row.review_status),
      // The row's own eligibility verdict, carried through so a surface can state
      // what this evidence IS without re-deriving it.
      eligibility_state: rowEligibilityState(row),
      // §9 — the evidence state this item carries, in canonical words.
      evidence_state: 'pending_review',
      lifecycle_state: 'proposed',
      verification_status: 'unverified',
      // §8 — confidence only when it was actually recorded. Extraction
      // succeeding is not a confidence value.
      confidence: confOk,
      confidence_state: confOk == null ? 'unavailable' : 'provider_field_confidence',
      source_document_id: row.document_id || null,
      source_document_type: documentType,
      source_page: row.source_page == null ? null : Number(row.source_page),
      source_label: [documentType ? String(documentType).replace(/_/g, ' ') : 'document', period.label].join(' · '),
    });
  }

  // Stable, explainable order: by metric, then period, then source document, then
  // value. Deterministic so a conflict lists its candidates in a fixed order.
  return items.sort((a, b) =>
    String(a.canonical_key).localeCompare(String(b.canonical_key)) ||
    Number(b.fiscal_year ?? 0) - Number(a.fiscal_year ?? 0) ||
    String(a.source_document_id).localeCompare(String(b.source_document_id)) ||
    Number(a.value) - Number(b.value));
}

/**
 * §3/§7/§6 — resolve ONE canonical metric from provisional evidence.
 *
 *   · the period is EXACT: a 2024 figure can never answer a 2023 question, and
 *     an unstated year is `period_unknown` rather than a guess (§7);
 *   · when several DISTINCT values exist for the same metric and period the
 *     result is a CONFLICT that names every candidate and chooses none. Nothing
 *     is averaged, ranked or silently preferred (§6);
 *   · an exact duplicate (the same value from the same document) is not a
 *     conflict — re-extraction must not look like a disagreement.
 */
export function resolveProvisionalMetric(items: any, canonicalKey: any, opts: any) {
  const list = (Array.isArray(items) ? items : []).filter((i) => i && i.canonical_key === canonicalKey);
  const available_fiscal_years = [...new Set(list.map((i) => i.fiscal_year).filter((y) => y != null))].sort((a, b) => a - b);

  if (list.length === 0) {
    return { canonical_key: canonicalKey, precedence: 'unavailable', item: null, candidates: [], reason: 'no_provisional_evidence', available_fiscal_years };
  }

  const asked = opts?.fiscalYear;
  if (asked == null || asked === '') {
    // §P4 — NO YEAR WAS NAMED. This is the owner's ordinary case and it is NOT an
    // error state:
    //   · ONE period    → usable, and NAMED in the answer rather than silently adopted;
    //   · TWO OR MORE   → the evidence is NOT unavailable. The figures exist; only the
    //                     CHOICE is open. That is a question to ask ("2024 or 2025?"),
    //                     never a claim that the metric is missing. The newest period is
    //                     still NEVER adopted silently (no latest-period fallback).
    //   · NO period     → usable only if the values agree, and then stated as
    //                     period-unstated ("the document states no period").
    if (available_fiscal_years.length > 1) {
      const perPeriod = available_fiscal_years
        .map((y) => list.find((i) => Number(i.fiscal_year) === Number(y)))
        .filter(Boolean);
      return {
        canonical_key: canonicalKey, precedence: 'ambiguous_period', item: null,
        candidates: perPeriod.map((i) => ({ value: i.value, fiscal_year: i.fiscal_year, period_label: i.period_label, source_document_id: i.source_document_id, source_document_type: i.source_document_type, review_status: i.review_status })),
        reason: 'period_not_named', available_fiscal_years,
      };
    }
    if (available_fiscal_years.length === 0) {
      // Nothing dates this figure. It may still be stated — with its period said to
      // be unstated — but only when every unreviewed value agrees.
      if ([...new Set(list.map((i) => String(i.value)))].length > 1) {
        return { canonical_key: canonicalKey, precedence: 'conflict', item: null, candidates: list.map((i) => ({ value: i.value, source_document_id: i.source_document_id, source_document_type: i.source_document_type, review_status: i.review_status, period_label: i.period_label })), reason: 'conflicting_unreviewed_values', available_fiscal_years };
      }
      return { canonical_key: canonicalKey, precedence: 'provisional', item: list[0], candidates: [], reason: 'resolved', requested_fiscal_year: null, available_fiscal_years, period_unstated: true };
    }
    const inPeriod = list.filter((i) => Number(i.fiscal_year) === Number(available_fiscal_years[0]));
    // ONE period, but two different values inside it is a disagreement — never a pick.
    if ([...new Set(inPeriod.map((i) => String(i.value)))].length > 1) {
      return { canonical_key: canonicalKey, precedence: 'conflict', item: null, candidates: inPeriod.map((i) => ({ value: i.value, source_document_id: i.source_document_id, source_document_type: i.source_document_type, review_status: i.review_status, period_label: i.period_label })), reason: 'conflicting_unreviewed_values', requested_fiscal_year: available_fiscal_years[0], available_fiscal_years };
    }
    return { canonical_key: canonicalKey, precedence: 'provisional', item: inPeriod[0] || list[0], candidates: [], reason: 'resolved', requested_fiscal_year: null, available_fiscal_years };
  }

  const askedNum = Number(asked);
  const exact = list.filter((i) => Number(i.fiscal_year) === askedNum);
  if (exact.length === 0) {
    return {
      canonical_key: canonicalKey, precedence: 'unavailable', item: null, candidates: [],
      reason: 'no_provisional_evidence_for_period', requested_fiscal_year: askedNum, available_fiscal_years,
    };
  }

  const distinct = [];
  const seen = new Set();
  for (const i of exact) {
    const fp = String(i.value);
    if (seen.has(fp)) continue;
    seen.add(fp);
    distinct.push(i);
  }

  if (distinct.length > 1) {
    return {
      canonical_key: canonicalKey, precedence: 'conflict', item: null,
      candidates: distinct.map((i) => ({ value: i.value, source_document_id: i.source_document_id, source_document_type: i.source_document_type, review_status: i.review_status, period_label: i.period_label })),
      reason: 'conflicting_unreviewed_values', requested_fiscal_year: askedNum, available_fiscal_years,
    };
  }

  return {
    canonical_key: canonicalKey, precedence: 'provisional', item: distinct[0], candidates: [],
    reason: 'resolved', requested_fiscal_year: askedNum, available_fiscal_years,
  };
}

/**
 * The CANONICAL lane's selection rule, unchanged from the canonical resolver: the
 * layer already chose its best observation per key, so with no year named the best
 * is used; with a year named, ONLY that year may answer. A 2024 observation can
 * never answer a 2023 question.
 */
function canonicalPickFor(items: any, businessId: any, fiscalYear: any) {
  const list = (Array.isArray(items) ? items : []).filter((i) => i && (!businessId || i.business_id === businessId));
  const available = [...new Set(list.map((i) => i?.period?.fiscal_year).filter((y) => y != null))].sort((a, b) => a - b);
  if (list.length === 0) return { pick: null, reason: 'no_observation', available };
  if (fiscalYear == null || fiscalYear === '') return { pick: list[0], reason: 'resolved', available };
  const n = Number(fiscalYear);
  const hit = list.filter((i) => Number(i?.period?.fiscal_year) === n);
  if (hit.length === 0) return { pick: null, reason: 'no_observation_for_period', available };
  return { pick: hit[0], reason: 'resolved', available };
}

/**
 * metricIntent — which canonical metrics the owner's question actually asks for.
 * Longest phrase wins, so "gross profit" is not read as "profit", and every
 * matched key is validated against the registry by construction.
 */
export function metricIntent(question: any) {
  const q = String(question || '').toLowerCase();
  if (!q) return { keys: [], terms: [] };
  const all = ALIAS_TABLE
    .flatMap((e) => e.phrases.map((p) => ({ canonical_key: e.canonical_key, phrase: p })))
    .sort((a, b) => b.phrase.length - a.phrase.length);

  const keys = [];
  const terms = [];
  const claimed = [];
  for (const { canonical_key, phrase } of all) {
    const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${esc}\\b`, 'i');
    if (!re.test(q)) continue;
    // A phrase inside an already-claimed longer phrase is not a separate ask.
    if (claimed.some((c) => c.includes(phrase))) continue;
    claimed.push(phrase);
    terms.push(phrase);
    if (!keys.includes(canonical_key)) keys.push(canonical_key);
  }
  return { keys, terms };
}

/**
 * resolveMetricEvidence — THE PRECEDENCE (§3), executed rather than described.
 *
 * For each metric the question asks about:
 *   canonical observation for that business and period   → use it (§5, §23)
 *   else provisional evidence for that business and period → MAY use it (§8, §22)
 *   else                                                   → unavailable
 * A canonical value is NEVER silently replaced by a pending one (§5). A conflict
 * in the provisional lane is reported as a conflict, not as a value (§6).
 */
export function resolveMetricEvidence(input: any) {
  const businessId = input?.businessId || null;
  const fiscalYear = input?.fiscalYear ?? null;
  const intent = metricIntent(input?.question);
  const keys = (input?.keys && input.keys.length ? input.keys : intent.keys) || [];
  const canonical = input?.canonicalObservations || [];
  const provisional = input?.provisionalEvidence || [];

  const results: Record<string, any> = {};
  for (const key of keys) {
    const can = canonicalPickFor(canonical.filter((o: any) => o.canonical_key === key), businessId, fiscalYear);
    if (can.reason === 'resolved' && can.pick) {
      results[key] = { canonical_key: key, precedence: 'canonical', value: can.pick.value, period_label: can.pick.period?.label || null, available_fiscal_years: can.available, reason: 'resolved' };
      continue;
    }
    const prov = resolveProvisionalMetric(provisional, key, { fiscalYear });
    results[key] = {
      ...prov,
      available_fiscal_years: prov.available_fiscal_years?.length ? prov.available_fiscal_years : can.available,
    };
  }

  const list = Object.values(results) as any[];
  const used_keys = list.filter((r) => r.precedence === 'provisional').map((r) => r.canonical_key);
  const canonical_keys = list.filter((r) => r.precedence === 'canonical').map((r) => r.canonical_key);
  const conflict_keys = list.filter((r) => r.precedence === 'conflict').map((r) => r.canonical_key);
  const ambiguous_keys = list.filter((r) => r.precedence === 'ambiguous_period').map((r) => r.canonical_key);
  const unavailable_keys = list.filter((r) => r.precedence === 'unavailable').map((r) => r.canonical_key);
  // §P4/§P7 — evidence that needs a PERIOD CHOICE is still evidence. It counts as
  // used, so the answer carries the figures and the "no supporting data" /
  // "missing metric" states can never be applied to a metric that has them.
  const evidence_keys = [...canonical_keys, ...used_keys, ...ambiguous_keys, ...conflict_keys];
  // Every canonical metric this business actually holds unreviewed evidence for —
  // so an unavailable asked metric can say what WAS found instead of only "no data".
  const present_keys = [...new Set((Array.isArray(provisional) ? provisional : []).map((i: any) => i?.canonical_key).filter(Boolean))];

  return {
    version: PROVISIONAL_EVIDENCE_VERSION,
    asked_keys: keys,
    asked_terms: intent.terms,
    results,
    used: used_keys.length > 0 || ambiguous_keys.length > 0,
    conflict: conflict_keys.length > 0,
    period_choice: ambiguous_keys.length > 0,
    precedence: canonical_keys.length > 0 ? 'canonical'
      : used_keys.length > 0 ? 'provisional'
        : ambiguous_keys.length > 0 ? 'provisional_period_choice'
          : conflict_keys.length > 0 ? 'conflict'
            : 'unavailable',
    canonical_keys,
    used_keys,
    conflict_keys,
    ambiguous_keys,
    unavailable_keys,
    evidence_keys,
    present_keys,
  };
}

/**
 * §11 — extraction awareness, DERIVED FROM THE PERSISTED ROWS. Never a count the
 * browser supplied, never a count a model asserted: every number below is
 * computed from the canonical `extracted_fields` rows as they are stored.
 */
export function deriveExtractionReviewCounts(rows: any, opts: any = {}) {
  const scoped = (Array.isArray(rows) ? rows : []).filter((r) => r && (!opts.businessId || r.business_id === opts.businessId));
  const by = (s: string) => scoped.filter((r) => String(r.review_status || '') === s).length;
  const named = scoped.filter((r) => !!r.field_name);
  return {
    recognized_field_count: named.length,
    pending_count: scoped.filter((r) => isPendingReview(r.review_status)).length,
    accepted_count: by('accepted'),
    corrected_count: by('corrected'),
    rejected_count: by('rejected'),
    // "recognized but carrying no usable numeric value" — the unsupported half,
    // stated only when it is actually known from the rows.
    unsupported_count: named.filter((r) => provisionalNumeric(r) == null).length,
    other_state_count: scoped.filter((r) => !isPendingReview(r.review_status) && !['accepted', 'corrected', 'rejected'].includes(String(r.review_status || ''))).length,
    review_complete: scoped.length > 0 && scoped.every((r) => !isPendingReview(r.review_status)),
  };
}

/**
 * §13 — "What did you find in my P&L?" is a question ABOUT the extraction itself.
 * It is detected structurally, so the answer can be built from the persisted rows
 * instead of from whatever the model remembers.
 */
export function extractionSummaryIntent(question: any) {
  const q = String(question || '');
  const asks = /\bwhat did you (find|extract|see|read)\b|\bwhat.*(did you|have you).*(find|extract)\b|\bextract(ed|ion)?\b.*\b(find|summary|results?)\b|\bhow many (figures|fields|numbers)\b|\bwhat.*you found\b/i.test(q);
  // A question about ONE document is the focused-document contract's own case; the
  // extraction-summary block is the general-lane counterpart.
  const aboutDocument = /\b(p&l|p and l|profit and loss|balance sheet|tax return|payroll|statement|invoice|document|file|upload)\b/i.test(q);
  return { asks, aboutDocument, applies: asks };
}

/**
 * §13 — the extraction summary the model is given, so "what did you find?" is
 * answered from persisted state. Grouped by EXACT document id, and every figure
 * is named from the rows themselves — never a hardcoded field list.
 */
export function buildExtractionSummary(rows: any, opts: any = {}) {
  const scoped = provisionalRowsForBusiness(rows, opts.businessId);
  const byDoc = new Map<string, any[]>();
  for (const r of scoped) {
    if (!r.document_id) continue;
    if (!byDoc.has(r.document_id)) byDoc.set(r.document_id, []);
    byDoc.get(r.document_id).push(r);
  }
  const documents = [...byDoc.entries()].map(([documentId, docRows]) => {
    const counts = deriveExtractionReviewCounts(docRows);
    const names = [...new Set(docRows.map((r) => r.field_name).filter(Boolean))];
    const metricKeys = buildProvisionalEvidence(docRows, opts.businessId).map((i: any) => i.canonical_key);
    return {
      document_id: documentId,
      document_type: docRows[0]?.source_document_type || null,
      recognized_field_count: counts.recognized_field_count,
      pending_count: counts.pending_count,
      accepted_count: counts.accepted_count,
      corrected_count: counts.corrected_count,
      rejected_count: counts.rejected_count,
      unsupported_count: counts.unsupported_count,
      extracted_field_names: names.slice(0, 40),
      canonical_metrics: [...new Set(metricKeys)].slice(0, 40),
      review_action: buildReviewAction(documentId),
    };
  });
  return {
    document_count: documents.length,
    total_recognized: documents.reduce((n, d) => n + d.recognized_field_count, 0),
    total_pending: documents.reduce((n, d) => n + d.pending_count, 0),
    documents,
  };
}

/**
 * §14/§20 — the review CTA, carrying the EXACT document id it was built from.
 * There is no latest-document resolution here and no default: a CTA without a
 * document id is not built at all.
 */
export function buildReviewAction(documentId: any, label: any = 'Review extracted data') {
  if (!documentId) return null;
  return {
    label,
    document_id: String(documentId),
    url: `/data-room?tab=review&document=${encodeURIComponent(String(documentId))}`,
  };
}

/**
 * §12 — the proactive extraction notice. Counts come from persisted rows and the
 * CTA carries the exact document id; the wording is built here so the UI never
 * has to invent a number.
 */
export function buildExtractionNotice(input: any) {
  const counts = input?.counts || null;
  const documentId = input?.documentId || null;
  const documentName = input?.documentName || null;
  const documentType = input?.documentType || null;
  if (!counts || !counts.pending_count || !documentId) return null;

  const n = counts.pending_count;
  const label = documentType ? String(documentType).replace(/_/g, ' ') : 'document';
  const named = documentName ? `your ${label} (${documentName})` : `your ${label}`;
  return {
    title: `I found ${n} financial ${n === 1 ? 'figure' : 'figures'} in ${named}`,
    body: n === 1
      ? 'It is waiting for review. I can already use it as unverified document data when answering your questions, or you can review it to make it part of my confirmed understanding of your business.'
      : `All ${n} are waiting for review. I can already use them as unverified document data when answering your questions, or you can review them to make them part of my confirmed understanding of your business.`,
    evidence_label: PROVISIONAL_EVIDENCE_LABEL,
    review_state: PROVISIONAL_REVIEW_LABEL,
    pending_count: n,
    recognized_field_count: counts.recognized_field_count,
    extraction_review: counts,
    review_action: buildReviewAction(documentId),
  };
}

/**
 * §8/§16 — the structured block the model receives. It carries the evidence, its
 * state, its source and the instruction that makes the semantics unmissable. Raw
 * extracted content never appears: only the mapped metric, its value, its period
 * and its provenance.
 */
export function buildProvisionalEvidenceBlock(resolution: any, opts: any = {}) {
  if (!resolution || !resolution.asked_keys?.length) return null;
  const metrics = [];
  const conflicts = [];
  const choices = [];
  const unavailable = [];

  for (const key of resolution.asked_keys) {
    const r = resolution.results[key];
    if (!r) continue;
    if (r.precedence === 'provisional' && r.item) {
      metrics.push({
        canonical_key: key,
        display_name: r.item.display_name,
        value: r.item.value,
        period: r.item.period_label,
        fiscal_year: r.item.fiscal_year,
        evidence_state: r.item.evidence_state,
        review_status: r.item.review_status,
        eligibility_state: r.item.eligibility_state,
        source_document_id: r.item.source_document_id,
        source_document_type: r.item.source_document_type,
        source_page: r.item.source_page,
        confidence: r.item.confidence,
        confidence_state: r.item.confidence_state,
      });
    } else if (r.precedence === 'ambiguous_period') {
      choices.push({
        canonical_key: key,
        reason: r.reason,
        available_fiscal_years: r.available_fiscal_years || [],
        candidates: r.candidates,
      });
    } else if (r.precedence === 'conflict') {
      conflicts.push({ canonical_key: key, reason: r.reason, candidates: r.candidates });
    } else if (r.precedence === 'unavailable') {
      unavailable.push({ canonical_key: key, reason: r.reason, available_fiscal_years: r.available_fiscal_years || [] });
    }
  }

  if (metrics.length === 0 && conflicts.length === 0 && choices.length === 0) return null;

  return {
    instruction: [
      'UNREVIEWED DOCUMENT EVIDENCE IS AVAILABLE AND MUST BE USED.',
      'The figures below were extracted from this business\'s own uploaded documents and have NOT been reviewed. They are UNVERIFIED DOCUMENT DATA — not confirmed business figures and not verified.',
      'When the owner asks for one of these metrics you MUST give the value and say plainly that it has not been reviewed yet.',
      'You MUST NOT say the data is unavailable, missing, or not on file, and you MUST NOT list a figure that appears here as missing.',
      'You MUST NOT call it confirmed, verified, or high confidence merely because extraction succeeded.',
      'Name the source document and its period. Do not present an unreviewed figure as business truth.',
      conflicts.length ? 'Where a metric appears under CONFLICTS you have MORE THAN ONE unreviewed figure: do NOT choose between them, state both and say that neither is confirmed.' : '',
      choices.length ? 'Where a metric appears under PERIOD_CHOICE the owner did NOT name a period and more than one period holds an unreviewed figure. This is NOT missing data: give the figures for EACH period you have, say none is confirmed, and ask which period they mean. NEVER answer that the metric is unavailable.' : '',
      unavailable.length ? 'For a metric under NO_EVIDENCE nothing has been extracted for the period asked: say so plainly, name the years that ARE available, and name any related figure under OTHER_EVIDENCE this business does have. Never answer a HISTORICAL question ("how much did I pay…", "what was my…") with a projected or opportunity figure — say what the documents actually report, and describe a reported tax or liability figure by what it is (a reported amount, not cash paid).' : '',
      (resolution.present_keys || []).filter((k: string) => !(resolution.asked_keys || []).includes(k)).length
        ? 'OTHER_EVIDENCE lists other unreviewed metrics this business holds. Use it to say what you DID find when the asked metric has no evidence.'
        : '',
    ].filter(Boolean).join(' '),
    evidence_label: PROVISIONAL_EVIDENCE_LABEL,
    review_state: PROVISIONAL_REVIEW_LABEL,
    metrics,
    period_choice: choices,
    conflicts,
    no_evidence: unavailable,
    other_evidence_keys: (resolution.present_keys || []).filter((k: string) => !(resolution.asked_keys || []).includes(k)),
    review_action: opts.documentId ? buildReviewAction(opts.documentId) : null,
  };
}

/**
 * applyProvisionalEvidence — the SERVER decides what an answer's metadata may
 * claim, exactly as it does for the verified label.
 *
 * §10 — an answer supported by provisional evidence may not carry
 * "NO SUPPORTING DATA" or "Missing: current revenue figures". Those two are the
 * observed defect's own words, and they are false here: the figure exists, it is
 * simply unreviewed. So:
 *   · the server's OWN supporting source is added, so the answer visibly HAS
 *     support (and the surface's "no supporting data" state cannot apply);
 *   · a missing-data claim about an answered metric is REMOVED, because the
 *     metric is not missing.
 * Anything the model raised that is genuinely about OTHER information is kept.
 */
export function applyProvisionalEvidence(response: any, resolution: any) {
  if (!response || typeof response !== 'object' || !resolution) return response;

  const answered: string[] = [
    ...(resolution.used_keys || []),
    ...(resolution.conflict_keys || []),
    // §P4 — a metric whose periods must be chosen is ANSWERED with those periods;
    // it is never "missing data".
    ...(resolution.ambiguous_keys || []),
  ];
  if (answered.length === 0 && !resolution.conflict) return response;

  const termsFor = (key: string) => {
    const row = ALIAS_TABLE.find((e) => e.canonical_key === key);
    return [key.replace(/_/g, ' '), ...((row && row.phrases) || [])].map((t) => String(t).toLowerCase());
  };

  const aboutAnswered = (text: any) => {
    const t = String(text || '').toLowerCase();
    if (!t) return false;
    return answered.some((key) => termsFor(key).some((term) => term && t.includes(term)));
  };

  // 1. Support is added from the SERVER's own reading, never left to the model.
  const added: string[] = [];
  for (const key of answered) {
    const r = resolution.results[key];
    if (r?.precedence === 'provisional' && r.item) {
      added.push(`${PROVISIONAL_EVIDENCE_LABEL} (${PROVISIONAL_REVIEW_LABEL}) · ${r.item.display_name} = ${r.item.value} from ${r.item.source_document_type ? String(r.item.source_document_type).replace(/_/g, ' ') : 'an uploaded document'}${r.item.period_label ? ` · ${r.item.period_label}` : ''}`);
    } else if (r?.precedence === 'ambiguous_period') {
      const years = (r.available_fiscal_years || []).map((y: number) => String(y)).join(', ');
      added.push(`${PROVISIONAL_EVIDENCE_LABEL} (${PROVISIONAL_REVIEW_LABEL}) · ${key.replace(/_/g, ' ')}: unreviewed figures for ${years || 'more than one period'} — no period was named, so none is presented as the answer`);
    } else if (r?.precedence === 'conflict') {
      added.push(`${PROVISIONAL_EVIDENCE_LABEL} (${PROVISIONAL_REVIEW_LABEL}) · ${key.replace(/_/g, ' ')}: ${r.candidates.length} unreviewed figures that disagree — none is confirmed`);
    }
  }
  if (added.length) {
    const existing = Array.isArray(response.supporting_sources) ? response.supporting_sources : [];
    response.supporting_sources = [...new Set([...existing, ...added])];
  }

  // 2. A false "missing" claim about an answered metric is removed.
  if (Array.isArray(response.missing_data)) {
    response.missing_data = response.missing_data.filter((m: any) => !aboutAnswered(m));
  }

  // 3. The structured, server-derived state the answer surface renders.
  response.provisional_evidence = {
    used: !!resolution.used,
    precedence: resolution.precedence,
    evidence_label: PROVISIONAL_EVIDENCE_LABEL,
    review_state: PROVISIONAL_REVIEW_LABEL,
    metrics: resolution.used_keys.map((key: string) => {
      const item = resolution.results[key]?.item;
      return item ? {
        canonical_key: key,
        display_name: item.display_name,
        value: item.value,
        period: item.period_label,
        review_status: item.review_status,
        source_document_id: item.source_document_id,
        source_document_type: item.source_document_type,
        confidence: item.confidence,
        confidence_state: item.confidence_state,
      } : null;
    }).filter(Boolean),
    conflict: resolution.conflict ? {
      keys: resolution.conflict_keys,
      candidates: resolution.conflict_keys.map((key: string) => ({ canonical_key: key, candidates: resolution.results[key].candidates })),
    } : null,
    unavailable_keys: resolution.unavailable_keys,
  };

  // §P4 — the period choice, stated as data so the surface can ask the question
  // instead of claiming the metric is missing.
  response.provisional_evidence.period_choice = resolution.period_choice
    ? {
      keys: resolution.ambiguous_keys || [],
      candidates: (resolution.ambiguous_keys || []).map((key: string) => ({
        canonical_key: key,
        available_fiscal_years: resolution.results[key]?.available_fiscal_years || [],
        candidates: resolution.results[key]?.candidates || [],
      })),
    }
    : null;

  // §14 — the CTA, bound to the EXACT document the value came from. It is built
  // from the row that produced the evidence, so no "latest document" can stand in.
  const sourceDocId = response.provisional_evidence.metrics.map((m: any) => m.source_document_id).filter(Boolean)[0]
    || (resolution.ambiguous_keys || [])
      .map((key: string) => (resolution.results[key]?.candidates || []).map((c: any) => c.source_document_id).filter(Boolean)[0])
      .filter(Boolean)[0]
    || null;
  response.provisional_evidence.review_action = buildReviewAction(sourceDocId);
  response.provisional_evidence.source_document_id = sourceDocId;

  return response;
}

/**
 * §P8/§P9 — HISTORICAL ACTUAL vs PROJECTED. Two very different questions wear the
 * same word, and answering one with the other is the production defect this closes:
 *
 *   "How much tax did I pay in 2024?"  → a HISTORICAL ACTUAL: what a return or
 *                                        statement reports for a period.
 *   "How can I reduce my tax?"         → an OPPORTUNITY: what might change. Its
 *                                        projected impact is NOT an answer to the
 *                                        first question, in either direction.
 *
 * This classifies the QUESTION only. The contract below enforces the consequence.
 */
export function historicalValueIntent(question: any) {
  const q = String(question || '').toLowerCase();
  const asksHistory = /\b(how much did i (pay|owe|make|earn)|what did i (pay|owe|make|earn)|how much (was|were)|what (was|were)|did i (pay|owe|make|earn))\b/.test(q);
  const asksProjection = /\b(should i|how can i|how do i|how could i|reduce|save|opportunity|potential|could i|what if|plan to|going to)\b/.test(q);
  return {
    historical: asksHistory && !asksProjection,
    projection_question: asksProjection,
    names_year: /\b(19|20)\d{2}\b/.test(q),
  };
}

/**
 * §P6/§P8 — THE EVIDENCE-STATE CONTRACT FOR A DIRECT METRIC QUESTION.
 *
 * The server already knows which of these is true — CONFIRMED, PROVISIONAL,
 * PERIOD CHOICE, CONFLICTED or UNAVAILABLE — and the model may not overwrite it.
 * So the server states it, in front of the model's own prose, exactly when the
 * record and the prose could disagree:
 *
 *   · the model claimed the metric is unavailable while the server holds evidence
 *     for it — the answer is CORRECTED to carry the value and its state;
 *   · the owner named no period and more than one holds a figure — the years are
 *     NAMED and the choice is asked for;
 *   · two unreviewed figures disagree — both are stated and neither is chosen;
 *   · a HISTORICAL question has no evidence — that is said, together with what the
 *     documents DO hold, and any projected/opportunity framing is moved out of the
 *     answer's headline labels into ADVISORY CONTEXT, so a projection can never
 *     stand in for a historical figure.
 *
 * The model's own explanation is never rewritten: the server prepends its line and
 * leaves the prose intact.
 */
export function applyHistoricalEvidenceContract(response: any, input: any = {}) {
  if (!response || typeof response !== 'object' || !input.resolution) return response;
  const resolution = input.resolution;
  const askedKeys: string[] = input.askedKeys || resolution.asked_keys || [];
  if (askedKeys.length === 0) return response;

  const states = askedKeys.map((k: string) => ({ key: k, r: resolution.results?.[k] }));
  const evidence = states.filter((s) => s.r && ['canonical', 'provisional'].includes(s.r.precedence));
  const choices = states.filter((s) => s.r && s.r.precedence === 'ambiguous_period');
  const conflicts = states.filter((s) => s.r && s.r.precedence === 'conflict');
  const missing = states.filter((s) => s.r && s.r.precedence === 'unavailable');
  const historical = !!input.historical?.historical;

  const label = (k: string) => String(k).replace(/_/g, ' ');
  const lines: string[] = [];

  // 1. A claim of unavailability the server can disprove is corrected.
  const prose = String(response.answer || '').toLowerCase();
  const claimsUnavailable = /\b(not available|unavailable|no data|not on file|don'?t have|do not have|couldn'?t find|could not find|isn'?t available)\b/.test(prose);
  if (evidence.length > 0 && claimsUnavailable) {
    const valueTerms = evidence.map((s) => label(s.key));
    const aboutThem = valueTerms.some((t) => prose.includes(t));
    // A direct metric question with ONE metric asked: a bare "I don't have that"
    // is a claim about that metric, whether or not it is named.
    const corrected = aboutThem || states.length === 1;
    if (corrected) {
      lines.push(
        evidence.map((s) => s.r.precedence === 'canonical'
          ? `${label(s.key)}: ${s.r.value}${s.r.period_label ? ` (${s.r.period_label})` : ''} — confirmed.`
          : `${label(s.key)}: ${s.r.item?.value} from ${s.r.item?.source_document_type ? String(s.r.item.source_document_type).replace(/_/g, ' ') : 'an uploaded document'}${s.r.item?.period_label ? ` (${s.r.item.period_label})` : ''} — unverified document data, pending review.`).join(' '),
      );
      // §P6 — the model may not claim the metric is unavailable, so a sentence that
      // DOES claim it while the server holds the value is removed. Only that
      // sentence: every other sentence the model wrote is left exactly as it is.
      if (typeof response.answer === 'string') {
        const sentences = response.answer.split(/(?<=[.!?])\s+/);
        const kept = sentences.filter((s) => !(
          /\b(not available|unavailable|no data|not on file|couldn'?t find|could not find)\b/i.test(s)
          && evidence.some((e) => s.toLowerCase().includes(label(e.key)))
        ));
        if (kept.length !== sentences.length && kept.length > 0) {
          response.answer = kept.join(' ');
          response.contradiction_removed = true;
        }
      }
    }
  }

  // 2. Period choice — the evidence exists; only the period is unnamed.
  for (const s of choices) {
    lines.push(`${label(s.key)}: I have unreviewed figures for ${(s.r.available_fiscal_years || []).join(' and ') || 'more than one period'} — which period do you mean?`);
  }

  // 3. Conflict — never choose.
  for (const s of conflicts) {
    lines.push(`${label(s.key)}: ${(s.r.candidates || []).length} unreviewed figures disagree — I am not choosing one.`);
  }

  // 4. Historical question with no evidence for the metric asked.
  if (historical && missing.length > 0) {
    const wanted = missing.map((s) => label(s.key)).join(', ');
    const years = missing.flatMap((s) => s.r.available_fiscal_years || []);
    const related = (resolution.present_keys || []).filter((k: string) => !askedKeys.includes(k)).map(label);
    const yearAsked = input.requestedFiscalYear ? ` for ${input.requestedFiscalYear}` : '';
    lines.push(
      `I have no ${wanted} figure${yearAsked} in this business's records${years.length ? ` (my figures cover ${[...new Set(years)].join(', ')})` : ''}.`
      + (related.length ? ` What your documents do hold: ${related.slice(0, 6).join(', ')}.` : ''),
    );
  }

  if (lines.length > 0 && typeof response.answer === 'string') {
    response.answer = `${lines.join(' ')}\n\n${response.answer}`;
  }

  // 5. THE PROJECTION FIREWALL (§P8). A projected opportunity may be mentioned
  // after a historical question is answered — never as its answer. When the
  // historical metric has no evidence at all, the projected label lines are moved
  // out of the answer's intelligence labels into an explicitly separate context.
  const blocked = historical && missing.length > 0 && evidence.length === 0 && choices.length === 0 && conflicts.length === 0;
  if (blocked) {
    const labels = response.intelligence_labels && typeof response.intelligence_labels === 'object' ? { ...response.intelligence_labels } : null;
    const projected = Array.isArray(labels?.projected) ? labels.projected : [];
    if (projected.length > 0) {
      response.advisory_context = {
        note: 'Projected figures. These are NOT what was reported for the period asked.',
        projected,
      };
      labels.projected = [];
      response.intelligence_labels = labels;
    }
    response.projection_blocked = true;
  }

  response.historical_metric = {
    asked_keys: askedKeys,
    state: evidence.length > 0 ? 'evidence_found'
      : choices.length > 0 ? 'period_choice_required'
        : conflicts.length > 0 ? 'conflicted'
          : 'unavailable',
    historical,
    projection_blocked: !!response.projection_blocked,
  };
  return response;
}