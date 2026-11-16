/**
 * csv.js — read-only CSV/TSV → the SAME workbook model the XLSX reader produces.
 *
 * A CSV is a one-sheet workbook. Making it so is the whole point: the viewer,
 * the structured financial view and any future extraction consumer then speak
 * one shape, and a CSV never gets a second, weaker presentation path.
 *
 * Row and column PROVENANCE is preserved — every cell knows the row and column
 * it came from, because a figure without its location cannot be reconciled.
 *
 * RFC 4180 rules: quoted fields, doubled quotes inside them, embedded newlines.
 * The delimiter is sniffed from the first line (`;` and TAB are common in files
 * exported from European and spreadsheet locales).
 */

const DELIMITERS = [',', ';', '\t', '|'];

export function sniffDelimiter(text) {
  const firstLine = String(text || '').split(/\r?\n/)[0] || '';
  let best = ',';
  let bestCount = -1;
  for (const d of DELIMITERS) {
    const count = countOutsideQuotes(firstLine, d);
    if (count > bestCount) { bestCount = count; best = d; }
  }
  return best;
}

export function parseDelimited(text, delimiter = null) {
  const src = String(text || '').replace(/\uFEFF/, '');
  const delim = delimiter || sniffDelimiter(src);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let i = 0;

  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  while (i < src.length) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i += 1; continue;
      }
      field += ch; i += 1; continue;
    }
    if (ch === '"' && field === '') { quoted = true; i += 1; continue; }
    if (ch === delim) { pushField(); i += 1; continue; }
    if (ch === '\r') { i += 1; continue; }
    if (ch === '\n') { pushRow(); i += 1; continue; }
    field += ch; i += 1;
  }
  // A trailing newline must not manufacture an empty final row.
  if (field !== '' || row.length > 0) pushRow();

  return { delimiter: delim, rows };
}

/** The workbook model: `rows` is already the grid, and it is read-only. */
export function csvToWorkbook(text, name = 'Sheet1') {
  const { rows, delimiter } = parseDelimited(text);
  const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const width = Math.min(maxCols, 200);
  const grid = rows.map((cells, r) => cells.slice(0, width).map((value, c) => ({
    row: r + 1,
    col: c + 1,
    ref: `${columnLetters(c + 1)}${r + 1}`,
    text: value === '' ? '' : String(value),
    value: value === '' ? null : asNumber(value),
    kind: value === '' ? 'empty' : (asNumber(value) === null ? 'text' : 'number'),
    formula: null,
  })));

  return {
    format: 'csv',
    delimiter,
    sheets: [{ name, index: 0, hidden: false, rows: grid, merges: [], widths: [], truncated: maxCols > width }],
    warnings: [],
  };
}

function countOutsideQuotes(line, token) {
  let quoted = false;
  let count = 0;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') { quoted = !quoted; continue; }
    if (!quoted && ch === token) count += 1;
  }
  return count;
}

/** A number the way the file means it — and never a number that is not there. */
function asNumber(raw) {
  const s = String(raw).trim();
  if (!/[0-9]/.test(s)) return null;
  const negative = /^\(.*\)$/.test(s);
  const cleaned = s.replace(/[^0-9.eE+-]/g, '');
  if (!/^[-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? (negative ? -Math.abs(n) : n) : null;
}

export function columnLetters(col) {
  let n = col;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}