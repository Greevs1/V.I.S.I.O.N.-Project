/**
 * xlsx.js — read-only XLSX/XLSM → the workbook view model.
 *
 * The workbook is EVIDENCE. This reads it and stops: there is no cell write, no
 * format write, no sheet write and no save path anywhere in this module.
 *
 * Structure preserved: sheet tabs in workbook order, real cell references (A1,
 * B14), merged ranges, column widths, hidden sheets (marked, never silently
 * dropped), dates, currencies, percentages, negatives, and a formula's CACHED
 * CALCULATED VALUE — the formula text travels alongside it for provenance, and
 * is never evaluated here.
 *
 * A cell's displayed text is the cached value under the cell's own number
 * format. When the format says nothing, the raw stored value is shown; a value
 * that does not parse is shown as text, never coerced to a number.
 */

import { readZipIndex, findEntry, readZipEntryText, inflateRawWithStream } from './zip.js';
import { parseXml, documentElement, child, childList, descendantList, attr, textOf } from './xml.js';
import { analyzeFormatCode, formatCellValue, builtinFormatCode } from './numbers.js';
import { columnLetters } from './csv.js';

export const MAX_ROWS_PER_SHEET = 5000;
export const MAX_COLS_PER_SHEET = 200;

export async function readXlsx(bytes, inflateRaw = inflateRawWithStream) {
  const index = readZipIndex(bytes);
  if (!index.ok) return { ok: false, reason: index.reason };

  const readPart = async (name) => {
    const entry = findEntry(index.entries, name);
    if (!entry) return null;
    const res = await readZipEntryText(bytes, entry, inflateRaw);
    return res.ok ? res.text : null;
  };

  const workbookXml = await readPart('xl/workbook.xml');
  if (!workbookXml) return { ok: false, reason: 'not_a_workbook', zip: index.entries.map((e) => e.name) };

  const shared = await readSharedStrings(readPart);
  const styles = await readStyles(readPart);
  const rels = await readRels(readPart);

  const wb = documentElement(parseXml(workbookXml));
  const sheetsNode = child(wb, 'sheets');
  const declared = childList(sheetsNode, 'sheet');
  if (declared.length === 0) return { ok: false, reason: 'no_sheets' };

  const sheets = [];
  const warnings = [];
  for (let i = 0; i < declared.length; i += 1) {
    const node = declared[i];
    const name = attr(node, 'name') || `Sheet${i + 1}`;
    const state = attr(node, 'state') || 'visible';
    const target = rels[attr(node, 'id')] || `xl/worksheets/sheet${i + 1}.xml`;
    const xml = await readPart(target);
    if (!xml) {
      warnings.push({ code: 'sheet_unreadable', sheet: name });
      sheets.push({ name, index: i, hidden: state !== 'visible', rows: [], merges: [], widths: [], truncated: false, unreadable: true });
      continue;
    }
    sheets.push(readSheet(xml, { name, index: i, hidden: state !== 'visible', shared, styles, warnings }));
  }

  return { ok: true, format: 'xlsx', sheets, warnings, date1904: detect1904(wb) };
}

// ── Parts ────────────────────────────────────────────────────────────────────

async function readSharedStrings(readPart) {
  const xml = await readPart('xl/sharedStrings.xml');
  if (!xml) return [];
  const root = parseXml(xml);
  return descendantList(root, 'si').map((si) => {
    // Phonetic runs (rPh) are pronunciation hints, not the string.
    const runs = childList(si, 'r').filter((r) => child(r, 't') == null || !r.children.some((c) => c.name === 'rPh'));
    if (runs.length === 0) return textOf(child(si, 't') || si).trim() ? textOf(child(si, 't') || si) : '';
    return runs.map((r) => textOf(child(r, 't'))).join('');
  });
}

async function readStyles(readPart) {
  const xml = await readPart('xl/styles.xml');
  if (!xml) return [];
  const root = documentElement(parseXml(xml));
  const custom = {};
  for (const fmt of descendantList(root, 'numFmt')) {
    const id = Number(attr(fmt, 'numFmtId'));
    if (Number.isFinite(id)) custom[id] = attr(fmt, 'formatCode') || null;
  }
  const cellXfs = child(root, 'cellXfs');
  const xfs = childList(cellXfs, 'xf');
  if (xfs.length === 0) return [];
  return xfs.map((xf) => {
    const id = Number(attr(xf, 'numFmtId') || 0);
    return analyzeFormatCode(custom[id] != null ? custom[id] : builtinFormatCode(id), id);
  });
}

async function readRels(readPart) {
  const xml = await readPart('xl/_rels/workbook.xml.rels');
  const map = {};
  if (!xml) return map;
  for (const rel of descendantList(parseXml(xml), 'Relationship')) {
    const id = attr(rel, 'Id');
    let target = attr(rel, 'Target') || '';
    if (!id || !target || rel.attrs.TargetMode === 'External') continue;
    if (target.startsWith('/')) target = target.slice(1);
    else if (!target.startsWith('xl/')) target = `xl/${target.replace(/^\.\//, '')}`;
    map[id] = target;
  }
  return map;
}

function detect1904(wb) {
  const props = child(wb, 'workbookPr');
  return attr(props, 'date1904') === '1' || attr(props, 'date1904') === 'true';
}

// ── One sheet ────────────────────────────────────────────────────────────────

function readSheet(xml, { name, index, hidden, shared, styles, warnings }) {
  const root = documentElement(parseXml(xml));
  const sheetData = child(root, 'sheetData');
  const rowsNode = childList(sheetData, 'row');

  const grid = [];
  let maxCol = 0;
  let truncated = false;

  for (const rowNode of rowsNode) {
    if (grid.length >= MAX_ROWS_PER_SHEET) { truncated = true; break; }
    const rowNum = Number(attr(rowNode, 'r')) || grid.length + 1;
    const cells = [];
    for (const cellNode of childList(rowNode, 'c')) {
      const ref = attr(cellNode, 'r') || '';
      const colNum = colFromRef(ref) || cells.length + 1;
      if (colNum > MAX_COLS_PER_SHEET) { truncated = true; continue; }
      maxCol = Math.max(maxCol, colNum);
      cells[colNum - 1] = readCell(cellNode, { ref, row: rowNum, col: colNum, shared, styles });
    }
    grid[rowNum - 1] = padRow(cells, maxCol);
  }
  for (let r = 0; r < grid.length; r += 1) if (!grid[r]) grid[r] = [];

  const merges = childList(child(root, 'mergeCells'), 'mergeCell')
    .map((m) => {
      const ref = attr(m, 'ref') || '';
      const [s, e] = ref.split(':');
      return s && e ? { ref, s: refToPoint(s), e: refToPoint(e) } : null;
    })
    .filter(Boolean);

  const widths = childList(child(root, 'cols'), 'col').map((c) => ({
    min: Number(attr(c, 'min')) || 1,
    max: Number(attr(c, 'max')) || 1,
    width: Number(attr(c, 'width')) || null,
    hidden: attr(c, 'hidden') === '1',
  }));

  if (truncated) warnings.push({ code: 'sheet_truncated', sheet: name, rows: MAX_ROWS_PER_SHEET, cols: MAX_COLS_PER_SHEET });
  return { name, index, hidden, rows: grid, merges, widths, truncated };
}

function readCell(cellNode, { ref, row, col, shared, styles }) {
  const type = attr(cellNode, 't') || 'n';
  const styleIdx = Number(attr(cellNode, 's') || 0);
  const style = styles[styleIdx] || null;
  const vNode = child(cellNode, 'v');
  const raw = vNode ? textOf(vNode) : null;
  const formula = textOf(child(cellNode, 'f')) || null;
  const base = { row, col, ref: ref || `${columnLetters(col)}${row}`, formula };

  if (type === 's') {
    const text = shared[Number(raw)] ?? '';
    return { ...base, text, value: null, kind: text === '' ? 'empty' : 'text' };
  }
  if (type === 'inlineStr') {
    const text = textOf(child(cellNode, 'is') || cellNode);
    return { ...base, text, value: null, kind: text === '' ? 'empty' : 'text' };
  }
  if (type === 'str') {
    const text = raw || '';
    return { ...base, text, value: null, kind: text === '' ? 'empty' : 'text' };
  }
  if (type === 'b') {
    const truthy = raw === '1';
    return { ...base, text: truthy ? 'TRUE' : 'FALSE', value: truthy, kind: 'boolean' };
  }
  if (type === 'e') {
    return { ...base, text: raw || '#ERROR', value: null, kind: 'error' };
  }

  if (raw == null || raw === '') return { ...base, text: '', value: null, kind: 'empty' };
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    // The cell says it is numeric but does not hold a number. Shown as written.
    return { ...base, text: raw, value: null, kind: 'text' };
  }
  const shown = formatCellValue(value, style);
  return { ...base, text: shown.text, value, kind: shown.kind };
}

function padRow(cells, maxCol) {
  const width = Math.max(maxCol, cells.length);
  const out = new Array(width);
  for (let i = 0; i < width; i += 1) out[i] = cells[i] || null;
  return out;
}

export function colFromRef(ref) {
  const match = String(ref || '').match(/^\$?([A-Za-z]+)/);
  if (!match) return 0;
  let n = 0;
  for (const ch of match[1].toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export function refToPoint(ref) {
  const match = String(ref || '').match(/^\$?([A-Za-z]+)\$?(\d+)$/);
  return match ? { row: Number(match[2]) - 1, col: colFromRef(match[1]) - 1 } : { row: 0, col: 0 };
}