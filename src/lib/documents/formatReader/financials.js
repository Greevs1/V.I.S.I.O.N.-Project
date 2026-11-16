/**
 * financials.js — the EXTRACTION MODEL half of the format reader.
 *
 * Viewing and extraction are independent capabilities, and this is the second
 * one: a structured reading of a worksheet that keeps the relationship between
 * a LABEL and its VALUE, and remembers exactly where both came from — sheet, row,
 * and cell. A number without its location cannot be reconciled, and reconciling
 * is the whole point of evidence.
 *
 * It DETECTS what the sheet already says. It never derives, totals, adjusts or
 * estimates a figure: a line appears here only when the workbook contains it,
 * and a concept with no matching line is simply absent. Nothing in this module
 * writes anything, anywhere.
 */

export const FINANCIAL_CONCEPTS = [
  { key: 'cogs', label: 'Cost of Goods Sold', patterns: [/cost\s+of\s+(goods\s+sold|sales|revenue|goods)/i, /^cogs\b/i] },
  { key: 'gross_profit', label: 'Gross Profit', patterns: [/gross\s+(profit|margin|income)/i] },
  { key: 'operating_income', label: 'Operating Income', patterns: [/operating\s+(income|profit)\b/i, /^ebit\b/i] },
  { key: 'operating_expenses', label: 'Operating Expenses', patterns: [/(total\s+)?operating\s+expenses?/i, /^opex\b/i, /^total\s+expenses?\b/i, /^expenses\b/i] },
  { key: 'net_income', label: 'Net Income', patterns: [/net\s+(income|profit|earnings|loss)/i, /^profit\s*\/?\s*\(?\s*loss\s*\)?\b/i] },
  { key: 'owner_compensation', label: 'Owner Compensation', patterns: [/owner'?s?\s+(compensation|comp|salary|wages)/i, /officer\s+compensation/i] },
  { key: 'revenue', label: 'Revenue', patterns: [/^(total\s+|gross\s+|net\s+)*(income|revenue|sales|turnover|receipts)\b/i] },
];

/** A label that must never be read as the revenue line, whatever else it says. */
const REVENUE_EXCLUSIONS = /\b(operating|other|net\s+other|expense|cost|deferred|unearned|interest|tax)\b/i;

export function matchConcept(label) {
  const text = String(label || '').trim();
  if (!text || text.length > 90) return null;
  for (const concept of FINANCIAL_CONCEPTS) {
    if (!concept.patterns.some((p) => p.test(text))) continue;
    if (concept.key === 'revenue' && REVENUE_EXCLUSIONS.test(text)) continue;
    return concept;
  }
  return null;
}

/**
 * Read one sheet's structure. Returns the financial lines it actually contains,
 * each one bound to the cell it came from.
 */
export function detectFinancialStructure(sheet) {
  const rows = sheet?.rows || [];
  const lines = [];
  const seen = new Set();
  let headerRow = null;
  // THE COLUMN THE SHEET DECLARES AS ITS PERIOD TOTAL.
  //
  // A monthly statement names twelve months and then a Total. The first number to
  // the right of a label is a MONTH — reading it as the line's amount would label
  // January's income with the fiscal year, which is a false figure arrived at
  // honestly. Where the sheet declares a total column, THAT column is the line's
  // value; where it declares none, the first numeric cell to the right still is.
  const totalCell = findPeriodTotalColumn(rows);

  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r] || [];
    const label = row.find((c) => c && c.kind === 'text' && String(c.text || '').trim().length > 1);
    if (!label) continue;

    const concept = matchConcept(label.text);
    if (concept && !headerRow && lines.length > 0 && lines.length < 2) headerRow = null;

    const value = totalCell == null ? firstNumberAfter(row, label.col) : numberAt(row, totalCell.col);
    if (!concept || !value) continue;
    if (seen.has(concept.key)) continue;
    seen.add(concept.key);

    lines.push({
      concept: concept.key,
      label: String(label.text).trim(),
      value: value.value,
      text: value.text,
      kind: value.kind,
      sheet: sheet.name,
      cell: value.ref,
      label_cell: label.ref,
      row: r + 1,
      formula: value.formula || null,
      value_basis: totalCell == null ? 'first_value_column' : 'period_total',
    });
  }

  const headerCandidate = findHeaderRow(rows);
  return {
    lines,
    headerRow: headerCandidate,
    hasStructure: lines.length > 0,
    currency: lines.some((l) => l.kind === 'currency'),
    period_total_column: totalCell == null ? null : { col: totalCell.col, ref: totalCell.ref },
  };
}

const MONTH_LABEL = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)/i;
const PERIOD_LABEL = /^\d{4}(-\d{2}(-\d{2})?)?$/;

/**
 * The column a statement declares as its period TOTAL, when it declares one.
 *
 * It has to be a HEADER cell: in a row that also carries period labels (month
 * names, dates), where one cell says exactly "Total". A row LABEL such as
 * "Total Income" lives in a different cell of a different row, and is never
 * mistaken for the column.
 */
function findPeriodTotalColumn(rows) {
  const limit = Math.min(rows.length, 20);
  for (let r = 0; r < limit; r += 1) {
    // A period label is a period label whatever KIND carries it: a month may be
    // the words "Jan (actual)" (text) or a real date (2020-01-01). Only the exact
    // word "Total" identifies the column, and a data row has no such cell.
    const cells = (rows[r] || []).filter((c) => c && String(c.text || '').trim());
    if (cells.length < 2) continue;
    const total = cells.find((c) => /^total$/i.test(String(c.text).trim()));
    if (!total) continue;
    const labelled = cells.some((c) => c !== total
      && (MONTH_LABEL.test(String(c.text).trim()) || PERIOD_LABEL.test(String(c.text).trim())));
    if (labelled) return total;
  }
  return null;
}

/**
 * The numeric cell AT a column — the period total, or nothing at all.
 *
 * It matches by the cell's OWN column number: a grid is a sparse array, so its
 * index is not the column it represents. Reading `row[col]` would look one
 * column past the total (O, not N) and report a blank where the statement had
 * stated a figure.
 */
function numberAt(row, col) {
  const cell = (row || []).find((c) => c && c.col === col);
  if (!cell) return null;
  if (typeof cell.value === 'number' && Number.isFinite(cell.value)) return cell;
  return null;
}

/** The first numeric cell to the RIGHT of the label — the value it names. */
function firstNumberAfter(row, labelCol) {
  for (let c = labelCol; c < row.length; c += 1) {
    const cell = row[c];
    if (!cell) continue;
    if (typeof cell.value === 'number' && Number.isFinite(cell.value)) return cell;
  }
  return null;
}

/** A row of mostly short text labels — the table's own header, if it has one. */
function findHeaderRow(rows) {
  const limit = Math.min(rows.length, 12);
  for (let r = 0; r < limit; r += 1) {
    const cells = (rows[r] || []).filter((c) => c && c.kind === 'text' && String(c.text || '').trim());
    if (cells.length < 2) continue;
    return { row: r + 1, labels: cells.map((c) => String(c.text).trim()) };
  }
  return null;
}