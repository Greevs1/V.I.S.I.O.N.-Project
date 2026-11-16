/**
 * Phase 6D.0c.2 — THE ANSWER CONTRACT, THE NEXT-STEP CONTRACT, AND ENFORCEMENT.
 *
 * Built BEFORE the model is asked anything. It holds what the answer IS:
 *
 *   resolution_state · primary_evidence · related_evidence · missing ·
 *   forbidden_claims · allowed_next_steps · next_step · labels · sources
 *
 * The model may phrase an interpretation. It may NOT decide what evidence exists,
 * may NOT call a retrieved metric missing, may NOT substitute an opportunity for
 * a historical actual, and may NOT change the resolution state. The FIRST answer
 * block is always rendered from this contract, and the next step, labels, missing
 * list and source drawer are all read from it — one contract, every consumer.
 */

import { conceptDef } from './ontology.ts';
import { STATES_WITH_EVIDENCE } from './resolver.ts';
import { buildReviewAction } from '../provisionalEvidence.ts';

/** Phase 10 — labels derive from the resolution state and nothing else. */
export const STATE_LABELS: Record<string, string[]> = {
  VERIFIED: ['VERIFIED DATA'],
  CONFIRMED: ['CONFIRMED DATA'],
  PROVISIONAL: ['DOCUMENT EVIDENCE', 'PENDING REVIEW'],
  CONFLICTED: ['CONFLICTING DATA'],
  AMBIGUOUS_PERIOD: ['MULTIPLE PERIODS'],
  RELATED_ONLY: ['RELATED DATA'],
  AMBIGUOUS_CONCEPT: ['CLARIFICATION NEEDED'],
  UNAVAILABLE: ['NO SUPPORTING DATA'],
};
export function labelsFor(state: any) {
  return [...(STATE_LABELS[String(state)] || STATE_LABELS.UNAVAILABLE)];
}

/** The answer surface's existing evidence-state vocabulary, derived — never model-awarded. */
const SURFACE_STATE: Record<string, string> = {
  VERIFIED: 'verified', CONFIRMED: 'confirmed', PROVISIONAL: 'document_evidence', CONFLICTED: 'document_evidence',
  AMBIGUOUS_PERIOD: 'document_evidence', RELATED_ONLY: 'document_evidence', AMBIGUOUS_CONCEPT: 'document_evidence', UNAVAILABLE: 'unavailable',
};

const CLARIFY_STATES = ['AMBIGUOUS_PERIOD', 'AMBIGUOUS_CONCEPT', 'CONFLICTED'];

export function formatValue(v: any, def: any = null) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (def?.shape === 'ratio') return `${Number(n.toFixed(2))}%`;
  if (Math.abs(n) >= 1e6) return `$${Number((n / 1e6).toFixed(2))} million`;
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: Number.isInteger(n) ? 0 : 2 })}`;
}

const REVIEW_WORD: Record<string, string> = { VERIFIED: 'verified', CONFIRMED: 'reviewed and confirmed', PROVISIONAL: 'pending review' };
const docOf = (e: any) => e?.source?.document_name || 'uploaded document';

function sourceEntry(e: any, role: string) {
  const review = REVIEW_WORD[e.evidence_state] || 'unreviewed';
  return {
    role, concept: e.concepts?.[0] || null, value: e.value, evidence_state: e.evidence_state,
    document_id: e.source?.document_id || null, document_name: docOf(e), document_type: e.source?.document_type || null,
    period: e.period?.label || null, field: e.source?.field_name || null, review_state: review,
    text: `${docOf(e)} · ${e.period?.label || 'period not stated'} · field ${e.source?.field_name || 'unnamed'} · ${review}`,
  };
}

function periodWords(r: any) {
  const e = r.primary?.[0];
  return e?.period?.label || null;
}

function evidenceList(r: any, def: any) {
  const list = r.primary?.length ? r.primary : r.candidates || [];
  return list.map((e: any) => `${formatValue(e.value, def)}${e.period?.label ? ` for ${e.period.label}` : ''}`);
}

function joinWords(xs: string[]) {
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

/** Phase 6 — the FIRST answer block, rendered from the resolved evidence. */
export function renderFactualAnswer(c: any) {
  const def = conceptDef(c.requested_concept);
  const label = def?.label || c.requested_term || 'that figure';
  const r = c.resolution;
  const lead = c.resolved_from_term ? `The ${c.resolved_from_term} figure I have is your ${label}. ` : '';
  const p = periodWords(r);
  const e = r.primary?.[0];
  switch (c.resolution_state) {
    case 'VERIFIED':
    case 'CONFIRMED': {
      const more = (r.other_periods || []).length ? ` I also have unreviewed ${label} figures for ${joinWords(r.other_periods.map((y: number) => `FY${y}`))}.` : '';
      const when = p ? `${p} ` : '';
      const unstated = p ? '' : ' (the document does not state a period)';
      return `${lead}Your ${when}${label} is ${formatValue(e.value, def)}${unstated}, from your ${docOf(e)} (${REVIEW_WORD[c.resolution_state]}).${more}`;
    }
    case 'PROVISIONAL': {
      const when = p ? `${p} ` : '';
      const unstated = p ? '' : ' The document does not state which period it covers.';
      return `${lead}Your ${when}${label} appears to be ${formatValue(e.value, def)} based on your uploaded ${docOf(e)}. That figure is still pending review.${unstated}`;
    }
    case 'AMBIGUOUS_PERIOD': {
      const per = (r.periods || []).map((x: any) => `${x.label} (${x.conflicted ? 'figures disagree' : formatValue(x.evidence[0]?.value, def)})`);
      const pend = r.tier === 'PROVISIONAL' ? ', all still pending review' : '';
      return `I found ${label} figures for ${joinWords(per)}${pend}. Which year would you like?`;
    }
    case 'CONFLICTED': {
      const n = (r.candidates || []).length;
      const where = p || r.candidates?.[0]?.period?.label || 'the same period';
      return `I found ${n} different ${label} figures for ${where} in your uploaded documents (${joinWords(r.candidates.map((x: any) => `${formatValue(x.value, def)} in your ${docOf(x)}`))}). They need to be reconciled before I treat either as your business ${label}.`;
    }
    case 'RELATED_ONLY': {
      const parts = (r.related || []).map((x: any) => {
        const rd = conceptDef(x.concept);
        const ev = x.resolution.primary?.[0] || x.resolution.candidates?.[0];
        const pend = x.resolution.state === 'PROVISIONAL' || x.resolution.tier === 'PROVISIONAL' || ev?.evidence_state === 'PROVISIONAL' ? ', pending review' : '';
        return `${rd?.label || x.concept} of ${joinWords(evidenceList(x.resolution, rd))} on your ${docOf(ev)}${pend}`;
      });
      const yr = c.requested_period?.type === 'fiscal_year' ? ` during FY${c.requested_period.year}` : '';
      return `Your documents show ${joinWords(parts)}, but I don't yet have enough evidence to tell you ${def?.say || `your ${label}`}${yr}. That related figure is not the same thing.`;
    }
    case 'AMBIGUOUS_CONCEPT': {
      const opts = (r.options || []).map((o: any) => {
        const od = conceptDef(o.concept);
        const ev = evidenceList(o.resolution, od);
        return `${od?.label || o.concept} (${ev.slice(0, 2).join(', ')})`;
      });
      return `I have several ${r.term} figures available: ${joinWords(opts)}. Which do you mean${(r.options || []).some((o: any) => o.concept === 'owner_take_home') ? '' : ' — or did you mean your personal take-home'}?`;
    }
    default: {
      if (!def && r.term) return `I don't yet have a figure for your ${r.term} — no revenue, profit or taxable-income evidence is on file for this business.`;
      const yr = c.requested_period?.type === 'fiscal_year' ? ` for FY${c.requested_period.year}` : '';
      const have = (r.available_periods || []).length ? ` I do have ${label} figures for ${joinWords(r.available_periods.map((y: number) => `FY${y}`))}.` : '';
      return `I don't yet have a ${label} figure${yr}.${have}`;
    }
  }
}

/** Phase 7 — the next step is a function of the SAME contract. */
export function deriveNextStep(c: any) {
  const def = conceptDef(c.requested_concept);
  const label = def?.label || c.requested_term || 'this figure';
  const r = c.resolution;
  const firstDoc = (r.primary?.[0] || r.candidates?.[0])?.source?.document_id || null;
  switch (c.resolution_state) {
    case 'VERIFIED': return { kind: 'none', text: null, label: null, url: null };
    case 'CONFIRMED': return { kind: 'use', text: `Use this ${label} figure in your analysis.`, label: null, url: null };
    case 'PROVISIONAL': {
      const a = buildReviewAction(firstDoc, 'Review this figure');
      return { kind: 'review', text: `Review this ${label} figure so VISION can treat it as confirmed.`, label: a ? a.label : null, url: a ? a.url : null };
    }
    case 'AMBIGUOUS_PERIOD': return { kind: 'choose_period', text: `Choose a period: ${joinWords((r.periods || []).map((p: any) => p.label))}.`, label: null, url: null, options: (r.periods || []).map((p: any) => p.label) };
    case 'CONFLICTED': {
      const a = buildReviewAction(firstDoc, 'Review the figures');
      return { kind: 'reconcile', text: `Resolve the conflicting ${label} figures.`, label: a ? a.label : null, url: a ? a.url : null };
    }
    case 'AMBIGUOUS_CONCEPT': return { kind: 'clarify', text: 'Tell me which figure you mean.', label: null, url: null, options: (r.options || []).map((o: any) => conceptDef(o.concept)?.label || o.concept) };
    default: return { kind: 'provide', text: `Upload or connect a document that shows ${def?.say || `your ${label}`}.`, label: 'Open your documents', url: null, target: 'data-room' };
  }
}

export const NEXT_STEP_KINDS: Record<string, string[]> = {
  VERIFIED: ['none'], CONFIRMED: ['use'], PROVISIONAL: ['review'], AMBIGUOUS_PERIOD: ['choose_period'],
  CONFLICTED: ['reconcile'], AMBIGUOUS_CONCEPT: ['clarify'], RELATED_ONLY: ['provide'], UNAVAILABLE: ['provide'],
};

function termsFor(concept: string) {
  const d = conceptDef(concept);
  return [...new Set([concept.replace(/_/g, ' '), d?.label, ...(d?.phrases || [])].filter(Boolean).map((t: any) => String(t).toLowerCase()))];
}

/** "revenue unavailable", "gather revenue"… — claims that are FALSE for a known concept. */
export function forbiddenClaimsFor(concepts: string[]) {
  return concepts.flatMap((k) => {
    const l = conceptDef(k)?.label || k;
    return [`${l} unavailable`, `${l} missing`, `gather ${l}`, `provide ${l}`];
  });
}

export function knownConceptsOf(factual: any[]) {
  return [...new Set((factual || []).flatMap((e: any) => e.concepts || []))];
}

/** Build the contract before the model sees anything. */
export function buildAnswerContract(request: any, resolution: any, envelopes: any, knownConcepts: string[]) {
  const concept = resolution.concept || request.concept || null;
  const def = conceptDef(concept);
  const state = resolution.state;
  const relatedEv = (resolution.related || []).flatMap((x: any) => [...(x.resolution.primary || []), ...(x.resolution.candidates || [])]);
  const optionEv = (resolution.options || []).flatMap((o: any) => [...(o.resolution.primary || []), ...(o.resolution.candidates || [])]);

  const families = def ? def.advisory_categories : [];
  const advisory = (envelopes?.advisory || []).filter((a: any) => families.includes(a.family));
  const requestedHasEvidence = STATES_WITH_EVIDENCE.includes(state);

  const c: any = {
    version: '6d.0c.2',
    question: request.question,
    intent: request.intent,
    requested_concept: concept,
    requested_term: request.ambiguous?.term || null,
    resolved_from_term: resolution.resolved_from_term || null,
    requested_period: request.period,
    resolution_state: state,
    resolution,
    primary_evidence: resolution.primary || [],
    candidate_evidence: resolution.candidates || [],
    related_evidence: relatedEv,
    option_evidence: optionEv,
    missing: ['UNAVAILABLE', 'RELATED_ONLY'].includes(state) && def ? [def.label] : (state === 'UNAVAILABLE' && resolution.term ? [resolution.term] : []),
    known_concepts: knownConcepts,
    forbidden_claims: forbiddenClaimsFor([...new Set([...(requestedHasEvidence && concept ? [concept] : []), ...knownConcepts])]),
    advisory_context: advisory.map((a: any) => ({ concept: a.concepts[0], value: a.value, title: a.display_name, source: a.source })),
    allowed_next_steps: NEXT_STEP_KINDS[state] || ['provide'],
  };
  c.answer_text = renderFactualAnswer(c);
  c.next_step = deriveNextStep(c);
  c.labels = labelsFor(state);
  c.sources = [
    ...c.primary_evidence.map((e: any) => sourceEntry(e, 'primary')),
    ...c.candidate_evidence.map((e: any) => sourceEntry(e, 'candidate')),
    ...c.related_evidence.map((e: any) => sourceEntry(e, 'related')),
    ...c.option_evidence.map((e: any) => sourceEntry(e, 'option')),
  ];
  c.advisory_sentence = advisory.length && !CLARIFY_STATES.includes(state)
    ? `Separately, VISION has identified approximately ${formatValue(advisory[0].value)} of potential annual ${advisory[0].family} opportunity — a projection, not a reported figure.`
    : null;
  return c;
}

// ── Enforcement ───────────────────────────────────────────────────────────────

const MONEY = /\$\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:million|thousand|billion|[mkb])\b)?|\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|\b\d+(?:\.\d+)?\s?(?:million|thousand|billion)\b/gi;
function moneyValues(s: string) {
  return (String(s).match(MONEY) || []).map((t) => {
    const n = Number(t.replace(/[^0-9.]/g, ''));
    const unit = /billion|\bb\b|bn/i.test(t) ? 1e9 : /million|\bm\b/i.test(t) ? 1e6 : /thousand|\bk\b/i.test(t) ? 1e3 : 1;
    return n * unit;
  }).filter((n) => Number.isFinite(n) && n > 100);
}
const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.005);

const CLAIMS_ABSENT = /\b(not available|unavailable|missing|no data|not on file|don'?t have|do not have|couldn'?t find|could not find|isn'?t available|lack(?:ing)?)\b/i;
const ASKS_FOR = /\b(gather|provide|input|enter|upload|collect|obtain|supply|clarify|add)\b/i;
const GENERIC_ABSENT = /\bwithout (?:this|that|these|the|your) (?:information|data|figures?|numbers?)\b/i;

/** Drop every model sentence that contradicts the contract. Nothing is rewritten. */
export function filterModelProse(text: any, c: any) {
  const sentences = String(text || '').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const known = c.forbidden_claims.length ? [...new Set([...(c.known_concepts || []), ...(STATES_WITH_EVIDENCE.includes(c.resolution_state) && c.requested_concept ? [c.requested_concept] : [])])] : [];
  const knownTerms = known.flatMap(termsFor);
  const hasEvidence = STATES_WITH_EVIDENCE.includes(c.resolution_state);
  const allowed = c.primary_evidence.map((e: any) => Number(e.value));
  return sentences.filter((s) => {
    const low = s.toLowerCase();
    const mentionsKnown = knownTerms.some((t) => low.includes(t));
    if (mentionsKnown && (CLAIMS_ABSENT.test(s) || ASKS_FOR.test(s))) return false;
    // A context-free "without this information…" can never stand beside a
    // deterministic lead: it points at nothing the contract said.
    if (GENERIC_ABSENT.test(s)) return false;
    if (hasEvidence && CLAIMS_ABSENT.test(s)) return false;
    if (moneyValues(s).some((v) => !allowed.some((a: number) => near(v, a)))) return false;
    if (c.resolution_state !== 'VERIFIED' && /\bverified\b/i.test(s)) return false;
    if (!['VERIFIED', 'CONFIRMED'].includes(c.resolution_state) && /\bconfirmed\b/i.test(s) && !/\bnot (?:yet )?confirmed\b/i.test(s)) return false;
    return true;
  }).join(' ');
}

export function clientSafeContract(c: any) {
  return {
    version: c.version,
    requested_concept: c.requested_concept,
    requested_label: conceptDef(c.requested_concept)?.label || c.requested_term || null,
    requested_period: c.requested_period,
    resolution_state: c.resolution_state,
    labels: c.labels,
    primary_count: c.primary_evidence.length,
    missing: c.missing,
    next_step: c.next_step,
    sources: c.sources.map(({ text, ...rest }: any) => ({ ...rest, text })),
    advisory_context: c.advisory_context,
  };
}

/** The final word on a factual answer. Placed LAST in askGalileo. */
export function enforceAnswerContract(response: any, c: any) {
  const r = response && typeof response === 'object' ? response : {};
  const interpretation = CLARIFY_STATES.includes(c.resolution_state) ? '' : filterModelProse(r.answer, c);
  const head = [c.answer_text, c.advisory_sentence].filter(Boolean).join(' ');
  r.answer = interpretation ? `${head}\n\n${interpretation}` : head;
  r.resolution_state = c.resolution_state;
  r.missing_data = [...c.missing];
  r.recommended_next_step = c.next_step.text || null;
  r.supporting_sources = c.sources.map((s: any) => s.text);
  const labels = r.intelligence_labels && typeof r.intelligence_labels === 'object' ? r.intelligence_labels : {};
  const projected = Array.isArray(labels.projected) ? labels.projected : [];
  r.advisory_context = c.advisory_context.length || projected.length
    ? { note: 'Projected figures — never the answer to a question about what was reported or paid.', items: c.advisory_context, projected }
    : null;
  r.intelligence_labels = {
    verified: c.resolution_state === 'VERIFIED' ? [c.answer_text] : [],
    projected: [],
    hypothesis: Array.isArray(labels.hypothesis) ? labels.hypothesis : [],
    advisor_confirmed: Array.isArray(labels.advisor_confirmed) ? labels.advisor_confirmed : [],
  };
  r.evidence_state = SURFACE_STATE[c.resolution_state] || 'unavailable';
  r.confidence_level = null;
  r.is_data_driven = c.resolution_state !== 'UNAVAILABLE';
  r.recommendation_key = null;
  r.factual_answer = { ...clientSafeContract(c), labels: labelsFor(c.resolution_state) };
  return r;
}

/**
 * Non-factual answers still may not deny what the business is known to hold:
 * a missing-data item or a next step that asks for a KNOWN metric is removed.
 */
export function guardKnownConcepts(response: any, knownConcepts: string[]) {
  if (!response || typeof response !== 'object' || !knownConcepts?.length) return response;
  const terms = knownConcepts.flatMap(termsFor);
  const aboutKnown = (s: any) => terms.some((t) => String(s || '').toLowerCase().includes(t));
  if (Array.isArray(response.missing_data)) response.missing_data = response.missing_data.filter((m: any) => !aboutKnown(m));
  if (response.recommended_next_step && aboutKnown(response.recommended_next_step) && ASKS_FOR.test(response.recommended_next_step)) response.recommended_next_step = null;
  if (typeof response.answer === 'string') {
    const kept = response.answer.split(/(?<=[.!?])\s+/).filter((s: string) => !(aboutKnown(s) && CLAIMS_ABSENT.test(s)));
    if (kept.length) response.answer = kept.join(' ');
  }
  return response;
}