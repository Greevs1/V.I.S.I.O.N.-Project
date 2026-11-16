/**
 * Phase 6D.0c.3 — TAX DOCUMENT FAMILY + FORM SECTIONS.
 *
 * A tax PDF is ONE document that may CONTAIN several forms (1040 + Schedule C +
 * W-2 + K-1 …). This module is the single vocabulary for that fact:
 *
 *   · FORM_TYPES        which forms VISION can RECOGNIZE (recognition only);
 *   · FORM_QUERY_ALIASES how the owner's words name them ("my w2", "form 1040");
 *   · normalizeFormSection  the persisted shape of a detected FORM SECTION —
 *      form_type, tax_year, page_start, page_end, confidence — always carrying the
 *      parent document_id, never a fake document;
 *   · resolveFieldSourcePage  the ONE page-provenance rule: a real page when the
 *      document's own sections state one, otherwise null (= unknown). Page 1 is
 *      NEVER invented.
 *
 * RECOGNITION IS NOT EXTRACTION. A form may be recognized while no reader exists
 * for it (`reader_key: null`); the document stays honestly "recognized, not yet
 * extracted" instead of collapsing into "unsupported document".
 */

export interface FormSection {
  form_type: string;
  tax_year: number | null;
  page_start: number | null;
  page_end: number | null;
  confidence: number | null;
}

export interface FormTypeDef {
  form_type: string;
  label: string;
  /** The document TYPE this form belongs to (classifier vocabulary). */
  parent_type: string;
  /** The reader that can extract it, or null when VISION can only recognize it. */
  reader_key: string | null;
  family: 'personal_tax' | 'business_tax' | 'informational' | 'schedule';
}

export const FORM_TYPES: Record<string, FormTypeDef> = {
  form_1040:    { form_type: 'form_1040',    label: 'Form 1040',        parent_type: 'personal_tax_return', reader_key: 'personal_tax_return', family: 'personal_tax' },
  form_1120:    { form_type: 'form_1120',    label: 'Form 1120',        parent_type: 'business_tax_return', reader_key: 'business_tax_return', family: 'business_tax' },
  form_1120s:   { form_type: 'form_1120s',   label: 'Form 1120-S',      parent_type: 'business_tax_return', reader_key: 'business_tax_return_1120s', family: 'business_tax' },
  form_1065:    { form_type: 'form_1065',    label: 'Form 1065',        parent_type: 'business_tax_return', reader_key: 'business_tax_return_1065', family: 'business_tax' },
  w2:           { form_type: 'w2',           label: 'W-2',              parent_type: 'w2',                  reader_key: 'w2', family: 'informational' },
  k1:           { form_type: 'k1',           label: 'Schedule K-1',     parent_type: 'k1',                  reader_key: 'k1', family: 'informational' },
  form_1099:    { form_type: 'form_1099',    label: 'Form 1099',        parent_type: 'form_1099',           reader_key: 'form_1099', family: 'informational' },
  schedule_c:   { form_type: 'schedule_c',   label: 'Schedule C',       parent_type: 'schedule_c',          reader_key: 'schedule_c', family: 'schedule' },
  schedule_e:   { form_type: 'schedule_e',   label: 'Schedule E',       parent_type: 'schedule_e',          reader_key: 'schedule_e', family: 'schedule' },
};

/** The owner's words for each form. Longest alias wins (see formQuery). */
export const FORM_QUERY_ALIASES: Record<string, string[]> = {
  form_1040: ['form 1040', '1040', 'individual return', 'personal return', 'my tax return'],
  form_1120: ['form 1120', '1120', 'corporate return', 'c corp return'],
  form_1120s: ['form 1120-s', '1120-s', '1120s', 's corp return', 's-corp return'],
  form_1065: ['form 1065', '1065', 'partnership return'],
  w2: ['w-2', 'w2', 'w 2', 'wage statement', 'wage and tax statement'],
  k1: ['k-1', 'k1', 'schedule k-1', 'schedule k1'],
  form_1099: ['1099', '1099-nec', '1099-nec form', '1099-int', '1099-div', '1099-misc', '1099 form'],
  schedule_c: ['schedule c', 'schedule-c', 'sched c'],
  schedule_e: ['schedule e', 'schedule-e', 'sched e'],
};

export function formLabel(formType: unknown): string {
  return FORM_TYPES[String(formType || '')]?.label || String(formType || 'form');
}

export function isRecognizedForm(formType: unknown): boolean {
  return !!FORM_TYPES[String(formType || '')];
}

export function readerKeyForForm(formType: unknown): string | null {
  return FORM_TYPES[String(formType || '')]?.reader_key ?? null;
}

export function formTypeForSubtype(subtype: unknown): string | null {
  const s = String(subtype || '').trim();
  if (!s) return null;
  return FORM_TYPES[s] ? s : null;
}

const intOrNull = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
};

/**
 * The persisted FORM SECTION. Unknown shapes are refused rather than guessed:
 * an unrecognized form_type, or a section with no evidence of where it is, is
 * still recorded — with honest nulls — because a section with no pages is not a
 * reason to claim it is on page 1.
 */
export function normalizeFormSection(raw: any, fallbackYear: number | null = null): FormSection | null {
  const form_type = String(raw?.form_type || raw?.form || '').trim();
  if (!isRecognizedForm(form_type)) return null;
  const year = Number(String(raw?.tax_year ?? raw?.year ?? '').match(/(20\d{2})/)?.[1]);
  const start = intOrNull(raw?.page_start);
  const end = intOrNull(raw?.page_end);
  const conf = Number(raw?.confidence);
  return {
    form_type,
    tax_year: Number.isFinite(year) ? year : fallbackYear,
    page_start: start,
    page_end: end != null && start != null && end >= start ? end : start,
    confidence: Number.isFinite(conf) ? Math.max(0, Math.min(100, Math.round(conf))) : null,
  };
}

/** One section per form_type, ordered by the page it actually starts on. */
export function normalizeFormSections(raw: any, fallbackYear: number | null = null): FormSection[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const out: FormSection[] = [];
  for (const item of list) {
    const s = normalizeFormSection(item, fallbackYear);
    if (!s || seen.has(s.form_type)) continue;
    seen.add(s.form_type);
    out.push(s);
  }
  return out.sort((a, b) => (a.page_start ?? Number.MAX_SAFE_INTEGER) - (b.page_start ?? Number.MAX_SAFE_INTEGER));
}

/**
 * PAGE PROVENANCE — the one rule. The page a field came from is the page the
 * document's own form section states; when the document does not state one the
 * value is null, which every surface renders as "unknown". Page 1 is never
 * invented for a field whose page is not known.
 */
export function resolveFieldSourcePage(formType: unknown, sections: FormSection[] | null | undefined): number | null {
  const ft = String(formType || '').trim();
  if (!ft) return null;
  const s = (sections || []).find((x) => x.form_type === ft);
  return intOrNull(s?.page_start);
}

export function pageProvenanceFor(page: number | null): 'form_section' | 'unknown' {
  return page == null ? 'unknown' : 'form_section';
}

export function formSectionsSummary(sections: FormSection[] | null | undefined): string {
  const list = sections || [];
  if (!list.length) return '';
  return list.map((s) => `${formLabel(s.form_type)}${s.page_start ? ` (p.${s.page_start}${s.page_end && s.page_end !== s.page_start ? `-${s.page_end}` : ''})` : ''}`).join(', ');
}