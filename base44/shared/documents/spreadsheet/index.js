/**
 * index.js — THE FORMAT READER.
 *
 * One entry point that answers two independent questions about a stored
 * document:
 *
 *   1. Can VISION RENDER it read-only, and if so, what is its view model?
 *   2. What does its EXTRACTION model look like — structure preserved?
 *
 * The two never gate each other. A document that cannot be rendered may still be
 * readable as evidence, and a document that renders perfectly may extract badly.
 * "Cannot render" is NEVER reported as "unsupported document".
 *
 * FORMAT IS DECIDED BY CONTENT FIRST, then by extension. A workbook that was
 * saved as .txt, or a PDF named .doc, is read for what it IS — the bytes are the
 * authority and the file name is only a name.
 *
 * READ ONLY. Nothing in this folder writes, and there is no write path to reach.
 */

import { readZipIndex, findEntry, inflateRawWithStream } from './zip.js';
import { readXlsx } from './xlsx.js';
import { readXls } from './xls.js';
import { readDocx } from './docx.js';
import { csvToWorkbook } from './csv.js';
import { detectFinancialStructure } from './financials.js';

/** What the viewer does with each format. `native` = the browser shows it. */
export const FORMAT_CAPABILITY = {
  pdf: 'native',
  image: 'native',
  txt: 'text',
  csv: 'workbook',
  xlsx: 'workbook',
  xls: 'workbook',
  docx: 'document',
  doc: 'unreadable',
  zip: 'unreadable',
  unknown: 'unreadable',
};

const ZIP_MAGIC = [0x50, 0x4b];
const CFB_MAGIC = [0xd0, 0xcf, 0x11, 0xe0];
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46];
const IMAGE_MAGIC = [[0x89, 0x50], [0xff, 0xd8], [0x47, 0x49], [0x52, 0x49]]; // PNG, JPEG, GIF, WEBP/RIFF

export function extensionOf(name) {
  const m = String(name || '').match(/\.([A-Za-z0-9]+)$/);
  return m ? m[1].toLowerCase() : '';
}

function startsWith(bytes, magic) {
  if (!bytes || bytes.length < magic.length) return false;
  return magic.every((b, i) => bytes[i] === b);
}

/**
 * The format, decided by CONTENT where content can decide it.
 * Returns one of FORMAT_CAPABILITY's keys.
 */
export function detectDocumentFormat({ name, bytes } = {}) {
  const ext = extensionOf(name);

  if (bytes && bytes.length >= 4) {
    if (startsWith(bytes, PDF_MAGIC)) return 'pdf';
    if (IMAGE_MAGIC.some((m) => startsWith(bytes, m))) return 'image';
    if (startsWith(bytes, ZIP_MAGIC)) {
      const index = readZipIndex(bytes);
      if (index.ok) {
        if (findEntry(index.entries, 'xl/workbook.xml')) return 'xlsx';
        if (findEntry(index.entries, 'word/document.xml')) return 'docx';
      }
      return 'zip';
    }
    if (startsWith(bytes, CFB_MAGIC)) return ext === 'xls' ? 'xls' : 'cfb';
    // The bytes say this is TEXT; they cannot say whether it is a delimited
    // table or prose, because a CSV's bytes are text bytes. Both formats are
    // consistent with the content, so the name picks between them.
    if (isProbablyText(bytes)) return ext === 'csv' || ext === 'tsv' ? 'csv' : 'txt';
  }

  if (['xlsx', 'xlsm'].includes(ext)) return 'xlsx';
  if (ext === 'xls') return 'xls';
  if (ext === 'csv' || ext === 'tsv') return 'csv';
  if (ext === 'docx') return 'docx';
  if (ext === 'doc') return 'doc';
  if (ext === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'image';
  if (['txt', 'log', 'md', 'json', 'xml', 'yml', 'yaml'].includes(ext)) return 'txt';
  return 'unknown';
}

/**
 * Read a document into its models. Never throws for a document it cannot read:
 * a refusal is a typed reason the viewer states honestly.
 */
export async function readDocument({ name, bytes, inflateRaw = inflateRawWithStream } = {}) {
  const format = detectDocumentFormat({ name, bytes });
  if (!bytes || bytes.length === 0) return { ok: false, format, reason: 'empty_file' };

  if (format === 'pdf' || format === 'image') return { ok: true, format, native: true };

  if (format === 'csv') {
    const text = new TextDecoder('utf-8').decode(bytes);
    return { ok: true, format, workbook: csvToWorkbook(text, 'Data') };
  }

  if (format === 'txt') {
    return { ok: true, format, text: new TextDecoder('utf-8').decode(bytes) };
  }

  if (format === 'xlsx') {
    const res = await readXlsx(bytes, inflateRaw);
    if (!res.ok) return { ok: false, format, reason: res.reason };
    return { ok: true, format, workbook: res };
  }

  if (format === 'cfb' || format === 'xls') {
    const res = readXls(bytes);
    if (res.ok) return { ok: true, format: 'xls', workbook: res };
    // A compound file with no workbook stream is the LEGACY WORD format: the
    // document is real and stored, and VISION says so rather than calling it
    // unsupported.
    if (res.reason === 'no_workbook_stream') return { ok: false, format: 'doc', reason: 'legacy_word' };
    return { ok: false, format: 'xls', reason: res.reason };
  }

  if (format === 'docx') {
    const res = await readDocx(bytes, inflateRaw);
    if (!res.ok) return { ok: false, format, reason: res.reason };
    return { ok: true, format, blocks: res.blocks, document: { blocks: res.blocks } };
  }

  return { ok: false, format, reason: format === 'zip' ? 'unknown_zip_package' : 'unsupported_format' };
}

/** The structured reading of a workbook: sheet → financial lines + cells. */
export function extractWorkbookStructure(workbook) {
  if (!workbook?.sheets?.length) return { sheets: [], lineCount: 0 };
  const sheets = workbook.sheets.map((sheet) => ({
    name: sheet.name,
    hidden: !!sheet.hidden,
    financial: detectFinancialStructure(sheet),
    table: tableOf(sheet),
  }));
  return { sheets, lineCount: sheets.reduce((n, s) => n + s.financial.lines.length, 0) };
}

/** The first N rows as a plain table, values and refs intact. */
function tableOf(sheet) {
  const rows = (sheet.rows || []).slice(0, 200);
  return rows.map((row, r) => ({
    row: r + 1,
    cells: (row || []).filter(Boolean).map((c) => ({ ref: c.ref, text: c.text, kind: c.kind, value: c.value })),
  }));
}

function isProbablyText(bytes) {
  const limit = Math.min(bytes.length, 8192);
  for (let i = 0; i < limit; i += 1) {
    const b = bytes[i];
    if (b === 0) return false;
    if (b < 9 || (b > 13 && b < 32)) return false;
  }
  return true;
}