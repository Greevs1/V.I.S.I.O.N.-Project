/**
 * 6D.1B.2 — THE STRUCTURED SPREADSHEET EXTRACTION BRIDGE.
 *
 * WHY THIS EXISTS (production-proven, 6D.1B.1):
 *
 * `P&L Prev owner Excel Online.xlsx` classified perfectly — `reader_key =
 * profit_and_loss`, `file_format = xlsx`, `reader_supported = true`,
 * `route_extraction = true` — and then extraction returned NOTHING, because the
 * only reader the durable pipeline had was an opaque provider call. VISION could
 * already read that workbook's structure completely, in the viewer, and none of
 * it reached evidence.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT:
 *
 *   · It is NOT a parser. VISION has exactly ONE spreadsheet interpretation, and
 *     this module IMPORTS it from `base44/shared/documents/spreadsheet/` — the
 *     backend's copy of `src/lib/documents/formatReader/`, byte-identical to the
 *     one the viewer renders with and enforced so by the certification harness
 *     (the platform keeps the two runtime bundles apart, so the SINGLE
 *     implementation is mirrored and the mirror is verified, never re-derived).
 *   · It is NOT a second pipeline. It produces the provider's own shape (a plain
 *     object of field → stated value) which the EXISTING extraction engine
 *     normalizes through the EXISTING `normalizeExtraction`, reconciles through
 *     the EXISTING review-safe reconcile, and adjudicates through the EXISTING
 *     evidence lifecycle. Nothing downstream knows this bridge exists.
 *   · It IS the extraction-model half of the reading: which column a statement
 *     declares as its PERIOD TOTAL, which period each sheet states, and where in
 *     the source every figure sits.
 *
 * AUTHORIZATION IS NOT RESTATED HERE. The caller (the ingestion worker's
 * extraction engine) mints the short-lived signed URL from the document ROW's own
 * approved bucket, and passes only that URL. This module never reads a bucket, a
 * path, a profile or a business, and persists nothing.
 *
 * PERIODS ARE NEVER INVENTED. Each sheet states its own period — in its name, in
 * its title, or in the month columns it declares — and each sheet becomes its own
 * section. A sheet that states no period stays silent, and the year declared at
 * upload is NEVER substituted for it: 2018, 2019 and a trailing-twelve-month
 * statement are three different periods, never one flattened "All Dates" figure.
 *
 * BASIS IS ONLY PRESERVED, NEVER INFERRED. A workbook that says "Cash Basis" or
 * "Accrual Basis" keeps it; a workbook that says nothing gets nothing, and the
 * existing promotion policy continues to treat an unknown basis as a blocker.
 */

// The ONE certified reader — the backend's byte-identical copy of the viewer's.
import {
  readDocument,
  extractWorkbookStructure,
  extensionOf,
} from '../documents/spreadsheet/index.js';

/** Formats this bridge owns. Everything else keeps the provider path unchanged. */
const SPREADSHEET_EXTENSIONS = ['xlsx', 'xlsm', 'xls', 'csv', 'tsv'];

export function isSpreadsheetCandidateName(name?: string | null): boolean {
  return SPREADSHEET_EXTENSIONS.includes(extensionOf(name));
}

/**
 * CONCEPT → EXTRACTION FIELD, per document type.
 *
 * A concept is emitted ONLY when the document type's own schema declares the
 * target field, so this table can never widen what a document type may report.
 * Revenue is never derived from anything else, and `operating_income` is never
 * written as EBITDA — EBITDA is not in this table at all.
 */
const CONCEPT_FIELDS: Record<string, Record<string, string>> = {
  profit_and_loss: {
    revenue: 'annual_revenue',
    cogs: 'cogs',
    gross_profit: 'gross_profit',
    operating_expenses: 'operating_expenses',
    operating_income: 'operating_income',
    owner_compensation: 'owner_compensation',
    net_income: 'net_profit',
  },
};

const TTM_STATEMENT = /trailing\s*(?:12|twelve)|^ttm\b|last\s*(?:12|twelve)\s*months?/i;
const BASIS_STATEMENT = /(?:modified\s+cash|cash|accrual|tax)\s+basis/i;
const MONTH_LABEL = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*'?(\d{2,4})?/i;
const MONTH_INDEX: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
const MONTH_NAME = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface CellProvenance {
  sheet: string;
  cell: string | null;
  column: string | null;
  row: number | null;
  label_cell: string | null;
  source_label: string | null;
  raw_value: number | null;
  raw_value_display: string | null;
  value_kind: string | null;
  value_basis: string | null;
  formula: string | null;
  hidden: boolean;
}

export interface StructuredSheet {
  sheet: string;
  sheet_index: number;
  hidden: boolean;
  suffix: string;
  period_raw: string | null;
  period_kind: 'annual' | 'ttm' | 'unknown';
  source_sheet_title: string | null;
  /** The provider-shaped object the EXISTING normalizer consumes. */
  raw: Record<string, any>;
  provenance: Record<string, CellProvenance>;
  lines: number;
}

export interface StructuredWorkbook {
  ok: boolean;
  format: string;
  reason?: string;
  basis: string | null;
  basis_evidence: string | null;
  sheets: StructuredSheet[];
  warnings: string[];
}

/** A sheet name is a LOCATION, so its slug must be unique and readable. */
function slugOf(name: string): string {
  return String(name || 'sheet')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'sheet';
}

function textCells(sheet: any): string[] {
  const out: string[] = [];
  for (const row of sheet?.rows || []) {
    for (const cell of row || []) {
      if (cell && cell.kind === 'text' && cell.text) out.push(String(cell.text));
    }
  }
  return out;
}

function statedYear(text: string | null | undefined): number | null {
  const m = String(text || '').match(/\b(19|20)\d{2}\b/);
  return m ? Number(m[0]) : null;
}

function titleOf(sheet: any): string | null {
  const first = (sheet?.rows || [])[0] || [];
  const cell = first.find((c: any) => c && c.kind === 'text' && String(c.text || '').trim());
  return cell ? String(cell.text).trim() : null;
}

/** The header row that carries the period labels, when the sheet declares one. */
function periodHeaders(sheet: any) {
  for (const row of sheet?.rows || []) {
    const cells = (row || []).filter(Boolean);
    const months: Array<{ col: number; month: number; year: number | null }> = [];
    let totalCol: number | null = null;
    for (const cell of cells) {
      if (cell.kind !== 'text') continue;
      const text = String(cell.text || '').trim();
      if (/^total$/i.test(text)) { totalCol = cell.col; continue; }
      const m = text.match(MONTH_LABEL);
      if (m) {
        const raw = m[2];
        const year = !raw ? null : raw.length === 2 ? 2000 + Number(raw) : Number(raw);
        months.push({ col: cell.col, month: MONTH_INDEX[m[1].toLowerCase()], year });
      }
    }
    if (months.length >= 2) return { months, totalCol };
  }
  return null;
}

/**
 * THE PERIOD THE SHEET ITSELF STATES — in its own words.
 *
 * A trailing-twelve-month statement is TTM, and where its month columns state the
 * span it covers, that span is preserved too. A sheet that names a year is that
 * fiscal year. A sheet that states neither stays silent.
 */
function periodRawFor(sheet: any, title: string | null): { raw: string | null; kind: 'annual' | 'ttm' | 'unknown' } {
  const headers = periodHeaders(sheet);
  const stated = sheet?.name || '';
  const trailing = TTM_STATEMENT.test(String(stated)) || TTM_STATEMENT.test(String(title || ''));

  const months = headers?.months || [];
  const first = months[0];
  const last = months[months.length - 1];

  if (trailing) {
    const label = (m: any) => (m && m.year ? `${MONTH_NAME[m.month]} ${m.year}` : null);
    const from = label(first);
    const to = label(last);
    return { raw: from && to ? `Trailing 12 Months (${from} – ${to})` : 'Trailing 12 Months', kind: 'ttm' };
  }

  const year = statedYear(stated) ?? statedYear(title);
  if (year) return { raw: String(year), kind: 'annual' };

  if (first?.year && last?.year) {
    return { raw: `${MONTH_NAME[first.month]} ${first.year} – ${MONTH_NAME[last.month]} ${last.year}`, kind: 'annual' };
  }
  return { raw: null, kind: 'unknown' };
}

/** The field this line legitimately reports, or null when the schema has no home for it. */
function targetFieldFor(documentType: string, line: any, allowed: (name: string) => boolean): string | null {
  const map = CONCEPT_FIELDS[documentType];
  if (!map) return null;
  let field = map[line.concept];
  // "Total Expenses" is the total-expense line, not the operating-expense line.
  // The LABEL decides, because the workbook's own words are the evidence.
  if (line.concept === 'operating_expenses'
    && /^total\s+expenses?$/i.test(String(line.label || '').trim())
    && allowed('total_expenses')) {
    field = 'total_expenses';
  }
  if (!field || !allowed(field)) return null;
  return field;
}

/**
 * buildStructuredWorkbook — bytes → one section per readable sheet.
 *
 * Pure: it reads the bytes it is given, returns a model, and writes nothing.
 */
export async function buildStructuredWorkbook({ bytes, name, documentType, fields }: {
  bytes: Uint8Array;
  name: string | null;
  documentType: string;
  fields: Array<{ name: string; label: string; type: string }>;
}): Promise<StructuredWorkbook> {
  const empty: StructuredWorkbook = { ok: false, format: 'unknown', basis: null, basis_evidence: null, sheets: [], warnings: [] };
  if (!CONCEPT_FIELDS[documentType]) return { ...empty, reason: 'no_structured_concept_map' };

  const read = await readDocument({ name: name || '', bytes });
  if (!read.ok || !read.workbook) {
    return { ...empty, reason: read.reason || 'unreadable_document' };
  }

  const allowed = (fieldName: string) => fields.some((f) => f.name === fieldName);
  const structure = extractWorkbookStructure(read.workbook);
  const byName: Record<string, any> = {};
  for (const sheet of read.workbook.sheets || []) byName[sheet.name] = sheet;

  // BASIS — only the words the source itself states.
  let basis: string | null = null;
  let basisEvidence: string | null = null;
  for (const sheet of read.workbook.sheets || []) {
    for (const text of [titleOf(sheet), ...textCells(sheet)]) {
      const m = String(text || '').match(BASIS_STATEMENT);
      if (!m) continue;
      const words = m[0].toLowerCase();
      basis = words.startsWith('accrual') ? 'accrual'
        : words.startsWith('tax') ? 'tax'
        : 'cash';
      basisEvidence = String(text).trim();
      break;
    }
    if (basis) break;
  }

  const sections: StructuredSheet[] = [];
  (structure.sheets || []).forEach((sheet: any, index: number) => {
    const lines = sheet?.financial?.lines || [];
    if (!lines.length) return;

    const sourceSheet = byName[sheet.name] || null;
    const title = titleOf(sourceSheet);
    const period = periodRawFor(sourceSheet, title);

    const raw: Record<string, any> = { reporting_period: period.raw };
    const provenance: Record<string, CellProvenance> = {};
    for (const line of lines) {
      const field = targetFieldFor(documentType, line, allowed);
      if (!field) continue;
      raw[field] = String(line.value);
      provenance[field] = {
        sheet: sheet.name,
        cell: line.cell ?? null,
        column: line.cell ? String(line.cell).replace(/[^A-Za-z]/g, '') : null,
        row: line.row ?? null,
        label_cell: line.label_cell ?? null,
        source_label: line.label ?? null,
        raw_value: typeof line.value === 'number' ? line.value : null,
        raw_value_display: line.text ?? null,
        value_kind: line.kind ?? null,
        value_basis: line.value_basis ?? null,
        formula: line.formula ?? null,
        hidden: !!sheet.hidden,
      };
    }
    if (!Object.keys(provenance).length) return;

    sections.push({
      sheet: sheet.name,
      sheet_index: index,
      hidden: !!sheet.hidden,
      suffix: slugOf(sheet.name),
      period_raw: period.raw,
      period_kind: period.kind,
      source_sheet_title: title,
      raw,
      provenance,
      lines: Object.keys(provenance).length,
    });
  });

  return {
    ok: sections.length > 0,
    format: read.format,
    reason: sections.length ? undefined : 'no_structured_lines',
    basis,
    basis_evidence: basisEvidence,
    sheets: sections,
    warnings: read.workbook.warnings || [],
  };
}

/**
 * tryStructuredSpreadsheetExtraction — the engine's door into the bridge.
 *
 * It decides by the document's NAME which documents are even candidates, fetches
 * the bytes over the short-lived signed URL the engine already minted from the
 * document row's approved bucket, and returns the structured reading. A document
 * the reader refuses, or a spreadsheet whose structure VISION does not recognize,
 * returns a refusal and the caller keeps the provider path it had.
 */
export async function tryStructuredSpreadsheetExtraction({ documentName, documentType, fields, sourceUrl, fetchImpl }: {
  documentName: string | null;
  documentType: string;
  fields: Array<{ name: string; label: string; type: string }>;
  sourceUrl: string;
  fetchImpl?: typeof fetch;
}): Promise<StructuredWorkbook | null> {
  if (!isSpreadsheetCandidateName(documentName)) return null;

  const doFetch = fetchImpl || fetch;
  let bytes: Uint8Array;
  try {
    const response = await doFetch(sourceUrl);
    if (!response?.ok) return null;
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch (err: any) {
    console.error('[spreadsheetBridge] source bytes unavailable:', err?.message || err);
    return null;
  }

  try {
    return await buildStructuredWorkbook({ bytes, name: documentName, documentType, fields });
  } catch (err: any) {
    // A reader that throws has read nothing. The caller keeps the provider path —
    // never a silently empty extraction.
    console.error('[spreadsheetBridge] structured read failed:', err?.message || err);
    return null;
  }
}