/**
 * Phase 6D.0c.3 — FORM-QUERY INTENT + THE W-2 / TAX-RETURN ANSWER CONTRACTS.
 *
 * "What was my W-2 for 2023?" is NOT a metric question. A W-2 is a FORM, and the
 * answer depends on what VISION actually holds — so the intent
 * `document_or_form_query` resolves deterministically into ONE of four cases,
 * each with its own wording, and never falls through to a generic "not enough
 * verified intelligence yet" answer:
 *
 *   CASE A  the form was found AND its figures were extracted  → summarize them,
 *           bound to the exact document, form, pages and period
 *   CASE B  the form was RECOGNIZED but not extracted           → say so
 *   CASE C  no such form, but related evidence (e.g. the 1040) exists → clarify
 *   CASE D  nothing relevant at all                             → the ONLY place
 *           "no supporting data" is true
 *
 * "What do you know from my 2023 tax return?" is a DOCUMENT SUMMARY: its fields
 * are grouped naturally (income / tax / payments / business / attached forms)
 * instead of dumping raw field names.
 *
 * This module imports nothing: it is pure, and the harness executes it directly.
 */

export const FORM_QUERY_VERSION = '6d.0c.3';

export interface FormQuery {
  kind: 'form' | 'return_summary';
  form_type: string | null;
  form_label: string;
  year: number | null;
  source: string;
}

/** Owner words → form_type. Longest alias wins, so "form 1120-s" beats "1120". */
const ALIASES: Array<{ form_type: string; label: string; alias: string }> = [
  { form_type: 'form_1120s', label: 'Form 1120-S', alias: 'form 1120-s' },
  { form_type: 'form_1120s', label: 'Form 1120-S', alias: '1120-s' },
  { form_type: 'form_1120s', label: 'Form 1120-S', alias: '1120s' },
  { form_type: 'form_1120s', label: 'Form 1120-S', alias: 's corp return' },
  { form_type: 'form_1120', label: 'Form 1120', alias: 'form 1120' },
  { form_type: 'form_1120', label: 'Form 1120', alias: '1120' },
  { form_type: 'form_1065', label: 'Form 1065', alias: 'form 1065' },
  { form_type: 'form_1065', label: 'Form 1065', alias: '1065' },
  { form_type: 'form_1065', label: 'Form 1065', alias: 'partnership return' },
  { form_type: 'form_1040', label: 'Form 1040', alias: 'form 1040' },
  { form_type: 'form_1040', label: 'Form 1040', alias: '1040' },
  { form_type: 'w2', label: 'W-2', alias: 'w-2' },
  { form_type: 'w2', label: 'W-2', alias: 'w2' },
  { form_type: 'w2', label: 'W-2', alias: 'w 2' },
  { form_type: 'w2', label: 'W-2', alias: 'wage and tax statement' },
  { form_type: 'k1', label: 'Schedule K-1', alias: 'schedule k-1' },
  { form_type: 'k1', label: 'Schedule K-1', alias: 'schedule k1' },
  { form_type: 'k1', label: 'Schedule K-1', alias: 'k-1' },
  { form_type: 'k1', label: 'Schedule K-1', alias: 'k1' },
  { form_type: 'schedule_c', label: 'Schedule C', alias: 'schedule c' },
  { form_type: 'schedule_c', label: 'Schedule C', alias: 'sched c' },
  { form_type: 'schedule_e', label: 'Schedule E', alias: 'schedule e' },
  { form_type: 'schedule_e', label: 'Schedule E', alias: 'sched e' },
  { form_type: 'form_1099', label: 'Form 1099', alias: '1099-nec' },
  { form_type: 'form_1099', label: 'Form 1099', alias: '1099-int' },
  { form_type: 'form_1099', label: 'Form 1099', alias: '1099-div' },
  { form_type: 'form_1099', label: 'Form 1099', alias: '1099-misc' },
  { form_type: 'form_1099', label: 'Form 1099', alias: '1099' },
];

/** A question ABOUT the whole filing, not about one figure in it. */
const SUMMARY_PATTERNS = [
  /\bwhat (?:do|did) you (?:know|find|see|have)\b[^.?!]{0,40}\b(?:tax return|return|filing)\b/i,
  /\bwhat(?:'s| is) in my (?:tax )?(?:return|filing)\b/i,
  /\bsummar(?:y|ize|ise)\b[^.?!]{0,30}\b(?:tax return|return|filing)\b/i,
  /\bmy (?:tax )?return (?:summary|overview)\b/i,
  /\bwhat(?:'s| is) on my (?:tax )?return\b/i,
];

/** Asking about the whole return without naming a form. */
const RETURN_TERMS = [/\btax return\b/i, /\bmy return\b/i, /\bthe return\b/i, /\bfiling\b/i];
const ASKS_ABOUT_HOLDINGS = /\b(do you have|have you got|did i (?:upload|send)|is (?:there|my))\b/i;

function parseYear(q: string): number | null {
  const m = String(q || '').match(/\b((?:19|20)\d{2})\b/);
  return m ? Number(m[1]) : null;
}

/**
 * QUESTION → FORM QUERY. Returns null when the question is not about a form or a
 * return, in which case the metric lane handles it exactly as before.
 */
export function resolveFormQuery(question: any): FormQuery | null {
  const q = String(question || '').toLowerCase();
  if (!q) return null;
  const year = parseYear(q);

  const isSummary = SUMMARY_PATTERNS.some((p) => p.test(q));
  const mentionsReturn = RETURN_TERMS.some((p) => p.test(q));

  // A named form always wins over the generic "return" wording, EXCEPT when the
  // owner explicitly asks what the return contains as a whole.
  const ordered = [...ALIASES].sort((a, b) => b.alias.length - a.alias.length);
  for (const a of ordered) {
    const re = new RegExp(`\\b${a.alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (!re.test(q)) continue;
    if (isSummary && (a.form_type === 'form_1040' || a.form_type === 'form_1120' || a.form_type === 'form_1120s' || a.form_type === 'form_1065')) {
      return { kind: 'return_summary', form_type: null, form_label: 'tax return', year, source: 'summary_over_named_return' };
    }
    return { kind: 'form', form_type: a.form_type, form_label: a.label, year, source: 'named_form' };
  }

  if (isSummary) return { kind: 'return_summary', form_type: null, form_label: 'tax return', year, source: 'summary' };
  if (mentionsReturn && ASKS_ABOUT_HOLDINGS.test(q)) {
    return { kind: 'return_summary', form_type: null, form_label: 'tax return', year, source: 'holdings_question' };
  }
  return null;
}

// ── Row → form attribution ──────────────────────────────────────────────────

const FORM_KEYS = new Set(ALIASES.map((a) => a.form_type));

/** The form a stored field row belongs to (form section first, never guessed). */
export function fieldFormOf(row: any): string {
  const m = row?.metadata || {};
  const explicit = String(m.form_type || m.document_subtype || '').trim();
  if (explicit && FORM_KEYS.has(explicit)) return explicit;
  const t = String(row?.source_document_type || '').trim();
  return FORM_KEYS.has(t) ? t : '';
}

function rowYear(row: any): number | null {
  const m = row?.metadata || {};
  const y = Number(String(m.fiscal_year ?? m.tax_year ?? '').match(/(20\d{2})/)?.[1]);
  return Number.isFinite(y) ? y : null;
}

const isPending = (status: any) => ['pending_review', 'needs_review', 'pending'].includes(String(status || ''));

/** A safe figure is one that is present and not a protected identifier. */
const SENSITIVE = /(^|_)(ssn|ein|tin|itin|dob|social_security_number|employee_ssn|employer_ein|recipient_tin)(_|$)/i;
const isSafe = (row: any) => !SENSITIVE.test(String(row?.field_name || ''));

function money(v: any): string {
  const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, ''));
  if (!Number.isFinite(n)) return String(v ?? '');
  if (Math.abs(n) >= 1e6) return `$${Number((n / 1e6).toFixed(2))} million`;
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: Number.isInteger(n) ? 0 : 2 })}`;
}

const fieldValue = (row: any) => row?.accepted_normalized_value ?? row?.accepted_value ?? row?.normalized_value ?? row?.field_value ?? null;

function humanField(name: any): string {
  return String(name || '')
    .replace(/_/g, ' ')
    .replace(/\b(?:of|the|and)\b/gi, (w) => w.toLowerCase())
    .replace(/^./, (c) => c.toUpperCase());
}

const reviewWords = (row: any) => (isPending(row?.review_status) ? 'pending review' : 'reviewed');

/**
 * ASSOCIATION (6D.0c.3 automatic relevant-evidence policy). A form the engine could
 * not tie to the ACTIVE BUSINESS is still evidence of what the DOCUMENT says — and it
 * is said to be exactly that. Wages and withholding may be stated as document
 * evidence; they are never presented as THIS business's figures on the strength of a
 * business having been selected when the document was uploaded.
 */
function associationCaveat(rows: any[], formLabel: string): string {
  const states = (Array.isArray(rows) ? rows : [])
    .map((r) => String(r?.metadata?.evidence_eligibility?.state || ''))
    .filter(Boolean);
  if (states.length === 0 || !states.every((s) => s === 'AMBIGUOUS')) return '';
  return ` I can't confidently tie this ${formLabel} to this business yet, so I am showing it as document evidence only.`;
}

const docNameOf = (doc: any, fallback = 'your uploaded document') => doc?.name || fallback;

// ── Evidence items in the SAME shape the answer surface already renders ─────

function evidenceOf(row: any, concept: string, doc: any, periodLabel: string | null, pages: string | null) {
  return {
    concept,
    value: fieldValue(row),
    evidence_state: isPending(row?.review_status) ? 'PROVISIONAL' : 'CONFIRMED',
    period: { label: periodLabel },
    source: {
      document_id: row.document_id || doc?.id || null,
      document_name: docNameOf(doc, row?.source_document_name || 'your uploaded document'),
      document_type: row.source_document_type || null,
      field_name: row.field_name || null,
      form_type: fieldFormOf(row) || null,
      pages,
    },
    concepts: [concept],
  };
}

function sourceEntryOf(e: any) {
  return {
    role: 'primary',
    concept: e.concepts?.[0] || null,
    value: e.value,
    evidence_state: e.evidence_state,
    document_id: e.source?.document_id || null,
    document_name: e.source?.document_name || 'uploaded document',
    document_type: e.source?.document_type || null,
    period: e.period?.label || null,
    field: e.source?.field_name || null,
    form_type: e.source?.form_type || null,
    pages: e.source?.pages || null,
    review_state: e.evidence_state === 'PROVISIONAL' ? 'pending review' : 'reviewed',
    text: `${e.source?.document_name || 'uploaded document'}${e.source?.form_type ? ` · ${e.source.form_type}` : ''}${e.source?.pages ? ` · ${e.source.pages}` : ''} · field ${e.source?.field_name || 'unnamed'} · ${e.evidence_state === 'PROVISIONAL' ? 'pending review' : 'reviewed'}`,
  };
}

const pagesOf = (section: any) => {
  const p = section?.page_start;
  if (!p) return null;
  return section.page_end && section.page_end !== p ? `pages ${p}-${section.page_end}` : `page ${p}`;
};

/** The document a section or row belongs to, from the business's own document list. */
function docFor(documentId: any, documents: any[]) {
  return (documents || []).find((d) => d.id === documentId) || null;
}

function contract(request: any, fields: any) {
  const c: any = {
    version: FORM_QUERY_VERSION,
    question: request.question,
    intent: 'document_or_form_query',
    requested_concept: null,
    requested_term: request.form?.form_label || null,
    resolved_from_term: null,
    requested_period: request.period,
    resolution_state: fields.resolution_state,
    resolution: { primary: fields.primary, term: null },
    primary_evidence: fields.primary,
    candidate_evidence: [],
    related_evidence: fields.related || [],
    option_evidence: [],
    missing: fields.missing || [],
    known_concepts: fields.known_concepts || [],
    forbidden_claims: [],
    advisory_context: [],
    allowed_next_steps: [fields.next_step?.kind || 'provide'],
    case: fields.case,
  };
  c.answer_text = fields.answer_text;
  // A contract ALWAYS carries a next step: the shared enforcement path reads
  // `next_step.text` unconditionally, and a case whose evidence has no document to
  // open still owes the owner a way forward.
  c.next_step = fields.next_step || {
    kind: 'provide',
    text: 'Open your documents to add the paperwork this answer would come from.',
    label: 'Open your documents',
    url: null,
    target: 'data-room',
  };
  c.labels = fields.labels;
  c.sources = [...c.primary_evidence.map(sourceEntryOf), ...c.related_evidence.map(sourceEntryOf)];
  c.advisory_sentence = null;
  return c;
}

const labelsForState = (state: string): string[] => {
  switch (state) {
    case 'PROVISIONAL': return ['DOCUMENT EVIDENCE', 'PENDING REVIEW'];
    case 'CONFIRMED': return ['CONFIRMED DATA'];
    case 'RELATED_ONLY': return ['RELATED DATA'];
    default: return ['NO SUPPORTING DATA'];
  }
};

/** Where the owner can SEE the exact source: the existing document contract. */
function viewAction(documentId: string | null, label = 'View source') {
  return documentId ? { kind: 'review', text: 'Open the exact document this came from.', label, url: `/data-room?document=${documentId}` } : null;
}

/**
 * The four cases, decided from what VISION actually holds. `input` carries the
 * persisted form sections, the business's document rows and this business's
 * extracted field rows — all already authorized by the caller.
 */
export function buildFormQueryContract(request: any, input: any) {
  const formQuery: FormQuery = request.form;
  const documents = Array.isArray(input?.documents) ? input.documents : [];
  const rows = (Array.isArray(input?.fieldRows) ? input.fieldRows : []).filter(isSafe);
  const sections = Array.isArray(input?.formSections) ? input.formSections : [];
  const requestedYear = formQuery.year;

  const yearMatches = (y: number | null) => requestedYear == null || y == null || y === requestedYear;

  if (formQuery.kind === 'return_summary') {
    const taxRows = rows.filter((r) => {
      const t = String(r.source_document_type || '');
      return formQuery.form_type == null ? /tax_return|w2|k1|form_1099|schedule_/.test(t) || !!fieldFormOf(r) : fieldFormOf(r) === formQuery.form_type;
    }).filter((r) => yearMatches(rowYear(r)));
    const taxDocs = documents.filter((d) => /tax_return|w2|k1|form_1099|schedule_/.test(String(d.document_type || '')));
    const primary = taxRows.map((r) => evidenceOf(r, String(r.field_name || ''), docFor(r.document_id, documents), requestedYear ? `FY${requestedYear}` : null, null));

    if (primary.length) {
      const groups: Record<string, string[]> = { INCOME: [], TAX: [], 'PAYMENTS / WITHHOLDING': [], 'BUSINESS-RELATED ITEMS': [], 'OTHER ITEMS': [] };
      for (const r of taxRows) {
        const name = String(r.field_name || '');
        const line = `${humanField(name)} ${money(fieldValue(r))}`;
        if (/wages|revenue|receipts|income|profit|dividends|interest|rental/.test(name)) groups.INCOME.push(line);
        else if (/tax|withheld|withholding|payments|refund|owed|deductions/.test(name)) (/withheld|withholding|payments/.test(name) ? groups['PAYMENTS / WITHHOLDING'] : groups.TAX).push(line);
        else if (/business|qbi|qualified_business|self_employment|distributions|guaranteed/.test(name)) groups['BUSINESS-RELATED ITEMS'].push(line);
        else groups['OTHER ITEMS'].push(line);
      }
      const attached = [...new Set(sections.map((s) => s.form_type))];
      const parts = Object.entries(groups).filter(([, v]) => v.length).map(([k, v]) => `${k}: ${v.join('; ')}`);
      if (attached.length) parts.push(`ATTACHED FORMS: ${attached.join(', ')}`);
      const docId = primary[0]?.source?.document_id || null;
      return contract(request, {
        case: 'A',
        resolution_state: 'PROVISIONAL',
        primary,
        answer_text: `Here is what I have from your${requestedYear ? ` ${requestedYear}` : ''} tax filings. ${parts.join('. ')}. Every figure is still pending your review.`,
        missing: [],
        known_concepts: [...new Set(taxRows.map((r) => String(r.field_name)))],
        labels: labelsForState('PROVISIONAL'),
        next_step: viewAction(docId, 'View the source document'),
      });
    }

    const knownDoc = taxDocs[0] || null;
    if (knownDoc || sections.length) {
      return contract(request, {
        case: 'B',
        resolution_state: 'RELATED_ONLY',
        primary: [],
        answer_text: `I have your${requestedYear ? ` ${requestedYear}` : ''} tax document${knownDoc ? ` (${docNameOf(knownDoc)})` : ''}, but I haven't extracted figures from it yet${sections.length ? ` — I did recognize ${sections.map((s) => s.form_type).join(', ')} in it` : ''}. The document is stored safely; its figures arrive once extraction completes.`,
        missing: [],
        known_concepts: [],
        labels: labelsForState('RELATED_ONLY'),
        next_step: viewAction(knownDoc?.id || null, 'Open the document'),
      });
    }

    return contract(request, {
      case: 'D',
      resolution_state: 'UNAVAILABLE',
      primary: [],
      answer_text: `I don't have a tax return on file for this business yet${requestedYear ? ` for ${requestedYear}` : ''}.`,
      missing: [`${requestedYear ? `${requestedYear} ` : ''}tax return`],
      known_concepts: [],
      labels: labelsForState('UNAVAILABLE'),
      next_step: { kind: 'provide', text: 'Upload the tax return and I will read it.', label: 'Open your documents', url: null, target: 'data-room' },
    });
  }

  // ── A named form ──────────────────────────────────────────────────────────
  const formType = formQuery.form_type;
  const formLabel = formQuery.form_label;

  // Authorized here: the row's document must be in this business's document list.
  const ownRows = rows.filter((r) => fieldFormOf(r) === formType)
    .filter((r) => !r.document_id || documents.some((d) => d.id === r.document_id));
  const rowsForPeriod = ownRows.filter((r) => yearMatches(rowYear(r)));
  const sectionsForForm = sections.filter((s) => s.form_type === formType);
  const sectionsForPeriod = sectionsForForm.filter((s) => yearMatches(s.tax_year));
  const otherYears = [...new Set([...ownRows.map(rowYear), ...sectionsForForm.map((s) => s.tax_year)].filter((y) => y && requestedYear && y !== requestedYear))];
  const yearWords = requestedYear ? ` ${requestedYear}` : '';

  // CASE A — found and extracted.
  if (rowsForPeriod.length) {
    const primary = rowsForPeriod.map((r) => {
      const section = sectionsForPeriod.find((s) => s.form_type === formType) || null;
      return evidenceOf(r, String(r.field_name || ''), docFor(r.document_id, documents), requestedYear ? `FY${requestedYear}` : null, pagesOf(section));
    });
    const lines = rowsForPeriod.map((r) => `${humanField(r.field_name)} ${money(fieldValue(r))}${isPending(r.review_status) ? ' (pending review)' : ''}`);
    const first = primary[0];
    const where = first?.source?.pages ? `, ${first.source.pages}` : '';
    return contract(request, {
      case: 'A',
      resolution_state: rowsForPeriod.every((r) => !isPending(r.review_status)) ? 'CONFIRMED' : 'PROVISIONAL',
      primary,
      answer_text: `I found a${yearWords} ${formLabel} in your uploaded tax documents${first?.source?.document_name ? ` (${first.source.document_name})${where}` : ''}. It reports ${lines.join('; ')}.${associationCaveat(rowsForPeriod, formLabel)}`,
      missing: [],
      known_concepts: rowsForPeriod.map((r) => String(r.field_name)),
      labels: labelsForState(rowsForPeriod.every((r) => !isPending(r.review_status)) ? 'CONFIRMED' : 'PROVISIONAL'),
      next_step: viewAction(first?.source?.document_id || null, `View ${formLabel}`),
    });
  }

  // CASE B — recognized but not extracted.
  if (sectionsForPeriod.length) {
    const section = sectionsForPeriod[0];
    const doc = docFor(section.document_id, documents);
    return contract(request, {
      case: 'B',
      resolution_state: 'RELATED_ONLY',
      primary: [],
      answer_text: `I found a${yearWords} ${formLabel} in your tax documents${doc ? ` (${docNameOf(doc)})` : ''}, but I haven't extracted its figures yet.`,
      missing: [],
      known_concepts: [],
      labels: labelsForState('RELATED_ONLY'),
      next_step: viewAction(doc?.id || null, `View ${formLabel}`),
    });
  }

  // CASE C — no such form, but related evidence exists (the return itself, or the
  // same form for another year). Never rendered as "no supporting data".
  const relatedRows = rows.filter((r) => {
    const f = fieldFormOf(r);
    return (f === 'form_1040' || f === 'form_1120' || f === 'form_1120s' || f === 'form_1065' || f === 'schedule_c' || f === 'schedule_e')
      && (!r.document_id || documents.some((d) => d.id === r.document_id));
  });
  const relatedSections = sections.filter((s) => ['form_1040', 'form_1120', 'form_1120s', 'form_1065'].includes(s.form_type));
  if (relatedRows.length || relatedSections.length) {
    const relDocId = relatedRows[0]?.document_id || relatedSections[0]?.document_id || null;
    const relDoc = docFor(relDocId, documents);
    const relForm = relatedRows.length ? fieldFormOf(relatedRows[0]) : relatedSections[0]?.form_type;
    const relLabel = relForm === 'form_1040' ? 'Form 1040' : relForm === 'form_1065' ? 'Form 1065' : relForm === 'form_1120s' ? 'Form 1120-S' : 'Form 1120';
    const money1 = relatedRows.filter((r) => /wage|withheld|withholding|total_tax|income/.test(String(r.field_name))).slice(0, 3);
    const wages = money1.map((r) => `${humanField(r.field_name)} ${money(fieldValue(r))}`).join(', ');
    const related = relatedRows.slice(0, 4).map((r) => evidenceOf(r, String(r.field_name || ''), relDoc, null, null));
    const otherYearNote = otherYears.length ? ` I do have a${yearWords ? ' ' : ' '}${formLabel} for ${otherYears.map((y) => `FY${y}`).join(', ')}.` : '';
    return contract(request, {
      case: 'C',
      resolution_state: 'RELATED_ONLY',
      primary: [],
      related,
      answer_text: `I have your${requestedYear ? ` ${requestedYear}` : ''} ${relLabel}${relDoc ? ` (${docNameOf(relDoc)})` : ''}, but I don't see a${yearWords} ${formLabel} in the evidence I've extracted.${otherYearNote}${wages ? ` If you're looking for wages or withholding, the return reports ${wages}.` : " If you're looking for wages or withholding, I can show you what the return reports."} You can also upload the ${formLabel} itself and I will read it.`,
      missing: [],
      known_concepts: relatedRows.map((r) => String(r.field_name)),
      labels: labelsForState('RELATED_ONLY'),
      next_step: viewAction(relDocId, `View your ${relLabel}`),
    });
  }

  // CASE D — nothing relevant at all.
  return contract(request, {
    case: 'D',
    resolution_state: 'UNAVAILABLE',
    primary: [],
    answer_text: `I don't have a${yearWords} ${formLabel} on file for this business.`,
    missing: [`${formLabel}${requestedYear ? ` for ${requestedYear}` : ''}`],
    known_concepts: [],
    labels: labelsForState('UNAVAILABLE'),
    next_step: { kind: 'provide', text: `Upload the ${formLabel} and I will read it.`, label: 'Open your documents', url: null, target: 'data-room' },
  });
}