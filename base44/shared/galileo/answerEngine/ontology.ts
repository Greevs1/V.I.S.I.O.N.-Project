/**
 * Phase 6D.0c.2 — CONCEPT ONTOLOGY + REQUESTED-CONCEPT CONTRACT.
 *
 * This is NOT a second metric registry. It stores no value, no source and no
 * extraction rule. The canonical registry (canonicalFact/registry.ts) remains the
 * only definition of what a fact IS; this file declares how the owner's words
 * relate to those facts:
 *
 *   · which registry fact a requested concept IS (`registry_fact`), validated
 *     against FACT_REGISTRY at load so no concept can point at a fact that does
 *     not exist;
 *   · concepts the owner can ask for that have NO canonical fact yet (cash tax
 *     paid, withholding, refund, amount owed, take-home) — declared so a question
 *     about them is understood and answered honestly, never silently mapped onto
 *     a near-miss;
 *   · actual vs projected, stock vs flow, related concepts, and the substitutions
 *     that are FORBIDDEN (total_tax != tax_payments; any opportunity != its
 *     historical actual).
 *
 * Keep declarations compact: the offline harness bundles and executes this file.
 */

import { FACT_REGISTRY } from '../../canonicalFact/registry.ts';

export const ANSWER_ENGINE_VERSION = '6d.0c.2';

const REGISTRY_KEYS = new Set((FACT_REGISTRY || []).map((f: any) => f.fact_key));

function concept(key: string, o: any) {
  return {
    concept: key,
    registry_fact: o.fact ?? null,
    field_exact: o.field_exact || [],
    family: o.family,
    basis: o.basis || 'actual',
    shape: o.shape || 'flow',
    period_required: (o.shape || 'flow') === 'flow',
    label: o.label,
    // How the answer names what it does NOT have ("…evidence of how much tax you actually paid").
    say: o.say || `your ${o.label}`,
    phrases: o.phrases || [],
    patterns: o.patterns || [],
    related: o.related || [],
    forbidden_substitutions: o.forbidden || [],
    advisory_categories: o.advisory || [],
  };
}

const RAW_CONCEPTS = [
  concept('revenue', { fact: 'revenue', family: 'revenue', label: 'revenue', phrases: ['revenue', 'sales', 'top line', 'turnover', 'gross receipts', 'total revenue'], related: ['gross_profit'], forbidden: ['revenue_opportunity'] }),
  concept('gross_profit', { fact: 'gross_profit', family: 'profit', label: 'gross profit', phrases: ['gross profit'], related: ['revenue', 'net_income'], forbidden: ['profit_opportunity'] }),
  concept('gross_margin', { fact: 'gross_margin', family: 'profit', shape: 'ratio', label: 'gross margin', phrases: ['gross margin'], related: ['gross_profit'], forbidden: ['profit_opportunity'] }),
  concept('net_income', { fact: 'net_income', family: 'profit', label: 'net income', phrases: ['net income', 'net profit', 'bottom line', 'profit'], related: ['gross_profit', 'taxable_income'], forbidden: ['profit_opportunity'], advisory: ['profit'] }),
  concept('reported_ebitda', { fact: 'reported_ebitda', family: 'profit', label: 'EBITDA', phrases: ['ebitda'], related: ['normalized_ebitda', 'net_income'], forbidden: ['profit_opportunity'] }),
  concept('normalized_ebitda', { fact: 'normalized_ebitda', family: 'profit', label: 'normalized EBITDA', phrases: ['normalized ebitda', 'recast ebitda', 'adjusted ebitda'], related: ['reported_ebitda'], forbidden: ['profit_opportunity'] }),
  concept('owner_compensation', { fact: 'owner_compensation', family: 'owner', label: 'owner compensation', phrases: ['owner compensation', 'owner salary', 'my salary'], related: ['net_income'] }),
  concept('cash', { fact: 'cash', family: 'balance', shape: 'stock', label: 'cash balance', phrases: ['cash balance', 'cash on hand', 'cash in the bank'] }),
  concept('debt', { fact: 'debt', family: 'balance', shape: 'stock', label: 'debt', phrases: ['total debt', 'loan balance', 'debt'] }),
  concept('adjusted_gross_income', { fact: 'agi', family: 'personal_tax', label: 'adjusted gross income', phrases: ['adjusted gross income', 'agi'], related: ['taxable_income'] }),
  // No canonical fact of its own: the registry folds a business return's
  // taxable_income into net_income, so ONLY a figure that literally came from a
  // taxable_income field answers this concept exactly.
  concept('taxable_income', { fact: 'taxable_income', family: 'tax', label: 'taxable income', field_exact: ['taxable_income'], phrases: ['taxable income'], related: ['net_income', 'adjusted_gross_income'] }),
  concept('total_tax', { fact: 'total_tax', family: 'tax', label: 'total tax reported', phrases: ['total tax', 'tax liability', 'income tax', 'tax reported', 'tax expense'], related: ['taxable_income'], forbidden: ['tax_savings_opportunity', 'tax_payments'], advisory: ['tax'] }),
  // Cash actually paid. NOT total_tax: a return's total tax is a liability for the
  // period, not what left the bank. No extractor produces it today, so it is
  // answerable only as RELATED_ONLY until real evidence exists.
  concept('tax_payments', { family: 'tax', label: 'tax you actually paid', say: 'how much tax you actually paid', phrases: ['tax paid', 'taxes paid', 'tax payments', 'estimated tax payments'], patterns: ['\\b(?:pa(?:y|id)|paying)\\b[^.?!]{0,30}\\btax(?:es)?\\b', '\\btax(?:es)?\\b[^.?!]{0,20}\\b(?:did|have) (?:i|we) pa(?:y|id)\\b'], related: ['total_tax', 'tax_withholding'], forbidden: ['total_tax', 'tax_savings_opportunity'], advisory: ['tax'] }),
  concept('tax_withholding', { family: 'tax', label: 'tax withheld', phrases: ['tax withheld', 'withholding', 'withheld'], related: ['tax_payments', 'total_tax'], forbidden: ['total_tax'] }),
  concept('tax_refund', { family: 'tax', label: 'tax refund', phrases: ['tax refund', 'refund'], related: ['total_tax'], forbidden: ['total_tax', 'tax_savings_opportunity'] }),
  concept('tax_amount_owed', { family: 'tax', label: 'tax amount owed', phrases: ['amount owed', 'tax owed', 'tax due', 'balance due'], patterns: ['\\bowe\\b[^.?!]{0,20}\\btax'], related: ['total_tax'], forbidden: ['total_tax', 'tax_savings_opportunity'] }),
  concept('owner_take_home', { family: 'owner', label: 'personal take-home', phrases: ['take home', 'take-home', 'take home pay'], related: ['net_income', 'owner_compensation'], forbidden: ['revenue', 'adjusted_gross_income', 'taxable_income'] }),
  // ── PROJECTED / ADVISORY concepts. They describe what MIGHT change and can never
  //    answer a question about what DID happen.
  concept('tax_savings_opportunity', { family: 'tax', basis: 'projected', label: 'potential tax savings', phrases: ['tax savings', 'save on tax', 'save on taxes', 'tax opportunity', 'tax gap', 'reduce my tax', 'reduce my taxes'], advisory: ['tax'] }),
  concept('revenue_opportunity', { family: 'revenue', basis: 'projected', label: 'revenue opportunity', phrases: ['revenue opportunity', 'revenue potential', 'grow revenue', 'grow my revenue'], advisory: ['revenue', 'growth'] }),
  concept('profit_opportunity', { family: 'profit', basis: 'projected', label: 'profit opportunity', phrases: ['profit gap', 'profit opportunity', 'uncaptured profit', 'profit potential'], advisory: ['profit'] }),
  concept('value_opportunity', { family: 'value', basis: 'projected', label: 'value opportunity', phrases: ['value gap', 'value opportunity'], advisory: ['value', 'valuation'] }),
];

/** Only concepts whose canonical fact really exists (or that declare none) survive. */
export const CONCEPTS = RAW_CONCEPTS.filter((c) => c.registry_fact == null || REGISTRY_KEYS.has(c.registry_fact));
const BY_KEY: Record<string, any> = Object.fromEntries(CONCEPTS.map((c) => [c.concept, c]));

/**
 * Terms with no single meaning. "Income" can be revenue, profit, taxable income,
 * AGI or take-home; Galileo never invents one meaning for it.
 */
export const AMBIGUOUS_TERMS = [
  { term: 'business income', candidates: ['revenue', 'net_income', 'taxable_income'] },
  { term: 'personal income', candidates: ['adjusted_gross_income', 'owner_take_home'] },
  { term: 'income', candidates: ['revenue', 'net_income', 'taxable_income', 'adjusted_gross_income', 'owner_take_home'] },
  { term: 'earnings', candidates: ['net_income', 'reported_ebitda'] },
];

export function conceptDef(key: any) {
  return BY_KEY[String(key || '')] || null;
}

/** The concepts an envelope EXACTLY answers: by registry fact, or by literal field. */
export function conceptsForFact(factKey: any, fieldName: any) {
  const f = String(fieldName || '').toLowerCase();
  return CONCEPTS
    .filter((c) => c.basis === 'actual')
    .filter((c) => (c.registry_fact && c.registry_fact === factKey) || (f && c.field_exact.includes(f)))
    .map((c) => c.concept);
}

/** Projected concepts an advisory record (recommendation / assessment) belongs to. */
export function advisoryConceptsFor(category: any) {
  const cat = String(category || '').toLowerCase();
  return CONCEPTS.filter((c) => c.basis === 'projected' && c.advisory_categories.includes(cat)).map((c) => c.concept);
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function parseYear(question: string) {
  const m = String(question || '').match(/\b(?:fy\s*)?((?:19|20)\d{2})\b/i);
  return m ? Number(m[1]) : null;
}

const PROJECTION_QUESTION = /\b(should i|how can i|how do i|how could i|could i|what if|plan to|going to|reduce|lower|save|increase|improve|grow|potential|opportunit(?:y|ies)|forecast|project(?:ed|ion))\b/i;

/**
 * resolveRequestedConcept — QUESTION → SEMANTIC INTENT → CONCEPT → PERIOD.
 * Longest phrase wins ("gross profit" is not "profit", "income tax" is not
 * "income"), and an ambiguous term is reported as ambiguous with its candidates.
 */
export function resolveRequestedConcept(question: any, opts: any = {}) {
  const q = String(question || '').toLowerCase();
  const year = opts.fiscalYear != null && opts.fiscalYear !== '' ? Number(opts.fiscalYear) : parseYear(q);
  const period = year ? { type: 'fiscal_year', year } : { type: 'unspecified' };
  const base = { version: ANSWER_ENGINE_VERSION, question: String(question || ''), period };
  if (!q) return { ...base, intent: 'none', concept: null, concepts: [], ambiguous: null, basis: null };

  const entries: any[] = [];
  for (const c of CONCEPTS) for (const p of c.phrases) entries.push({ kind: 'concept', key: c.concept, phrase: p });
  for (const t of AMBIGUOUS_TERMS) entries.push({ kind: 'ambiguous', key: t.term, phrase: t.term, candidates: t.candidates });
  entries.sort((a, b) => b.phrase.length - a.phrase.length);

  const hits: any[] = [];
  const spans: Array<[number, number]> = [];
  const free = (s: number, e: number) => !spans.some(([a, b]) => s < b && e > a);
  // A payment/owing VERB is the strongest signal ("how much income tax did I
  // pay" asks what was paid), so verb patterns claim their span first.
  for (const c of CONCEPTS) for (const p of c.patterns) {
    const m = new RegExp(p, 'i').exec(q);
    if (m && free(m.index, m.index + m[0].length)) { spans.push([m.index, m.index + m[0].length]); hits.push({ kind: 'concept', key: c.concept, phrase: m[0], at: m.index }); }
  }
  for (const en of entries) {
    const re = new RegExp(`\\b${esc(en.phrase)}\\b`, 'gi');
    let m: any;
    while ((m = re.exec(q))) {
      const s = m.index; const e = s + m[0].length;
      if (!free(s, e)) continue;
      spans.push([s, e]);
      hits.push({ ...en, at: s });
    }
  }
  hits.sort((a, b) => a.at - b.at);

  const conceptHits = hits.filter((h) => h.kind === 'concept');
  const ambiguousHit = hits.find((h) => h.kind === 'ambiguous') || null;
  const first = conceptHits[0] ? conceptDef(conceptHits[0].key) : null;
  const projection = PROJECTION_QUESTION.test(q);

  if (!first && !ambiguousHit) return { ...base, intent: 'none', concept: null, concepts: [], ambiguous: null, basis: null };
  if (first && first.basis === 'projected') {
    return { ...base, intent: 'advisory', concept: first.concept, concepts: conceptHits.map((h) => h.key), ambiguous: null, basis: 'projected' };
  }
  const intent = projection ? 'advisory' : 'historical_metric';
  // A named concept always beats an ambiguous word around it.
  if (first) {
    return { ...base, intent, concept: first.concept, concepts: [...new Set(conceptHits.map((h) => h.key))], ambiguous: null, basis: 'actual' };
  }
  return {
    ...base, intent, concept: null, concepts: [],
    ambiguous: { term: ambiguousHit.key, candidates: ambiguousHit.candidates.filter((k: string) => !!conceptDef(k)) },
    basis: 'actual',
  };
}