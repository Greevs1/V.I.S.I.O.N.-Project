/**
 * numbers.js — number, date and percentage DISPLAY, for both workbook readers.
 *
 * This module decides only how a value the file already holds is SHOWN. It never
 * computes, corrects or interpolates a figure: the number that reaches the screen
 * is the number stored in the cell (a formula's cached calculated value), and
 * nothing else.
 *
 * The format code is read the way a spreadsheet application reads it: only the
 * first (positive) section decides decimals, grouping, currency and the percent
 * scale; the second section decides whether a negative is wrapped in parentheses.
 */

const BUILTIN = {
  0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00',
  9: '0%', 10: '0.00%', 11: '0.00E+00', 12: '# ?/?', 13: '# ??/??',
  14: 'mm-dd-yy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM',
  19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'm/d/yy h:mm',
  37: '#,##0 ;(#,##0)', 38: '#,##0 ;[Red](#,##0)', 39: '#,##0.00;(#,##0.00)',
  40: '#,##0.00;[Red](#,##0.00)', 45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mmss.0',
  48: '##0.0E+0', 49: '@',
};
const DATE_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
const PERCENT_IDS = new Set([9, 10]);
const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: '$', AUD: '$', INR: '₹', MXN: '$', BRL: 'R$', CHF: 'CHF', SEK: 'kr', ZAR: 'R' };

export function builtinFormatCode(id) {
  return BUILTIN[id] || null;
}

/** Everything the reader needs to know about one format code. */
export function analyzeFormatCode(code, numFmtId = null) {
  const raw = code != null ? String(code) : (builtinFormatCode(numFmtId) || 'General');
  const sections = raw.split(';');
  const positive = sections[0] || '';
  const negative = sections[1] || '';
  const stripped = stripLiterals(positive);

  const idSaysDate = numFmtId != null && DATE_IDS.has(Number(numFmtId));
  const looksGeneral = /^\s*(general|standard|@)\s*$/i.test(stripped);
  const isDate = !looksGeneral && (idSaysDate || /[ymd]/i.test(stripped.replace(/\\./g, '')));
  const isTime = !looksGeneral && (isDate && /[hs]/i.test(stripped.replace(/\\./g, '')));

  const decimals = decimalPlaces(positive);
  return {
    code: raw,
    isDate,
    isTime,
    isPercent: (numFmtId != null && PERCENT_IDS.has(Number(numFmtId))) || /%/.test(stripped),
    grouping: /,/.test(stripped.split('.')[0] || ''),
    decimals,
    currency: isDate ? '' : currencySymbol(positive),
    parenNegative: /\(/.test(negative) || /\(/.test(stripped),
    date1904: false,
  };
}

export function currencySymbol(code) {
  const bracketed = String(code || '').match(/\[\$([^\]-]*)(?:-[^\]]*)?\]/);
  if (bracketed && bracketed[1]) return CURRENCY_SYMBOLS[bracketed[1]] || bracketed[1];
  const literal = String(code || '').replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, '').match(/[$€£¥₹]/);
  return literal ? literal[0] : '';
}

/**
 * THE DISPLAY. Returns { text, kind } — `kind` is what the viewer styles by, and
 * `text` is what the owner reads. A value that is not finite is never shown as a
 * number.
 */
export function formatCellValue(value, style) {
  if (value == null || !Number.isFinite(value)) return { text: '', kind: 'empty' };
  const s = style || {};

  if (s.isDate) {
    const d = serialToDate(value, !!s.date1904);
    return { text: s.isTime && d.hasTime ? d.iso.slice(0, 16).replace('T', ' ') : d.iso.slice(0, 10), kind: 'date' };
  }

  if (s.isPercent) {
    const dp = s.decimals == null ? 0 : s.decimals;
    return { text: `${(value * 100).toFixed(dp)}%`, kind: 'percent' };
  }

  const negative = value < 0;
  const magnitude = Math.abs(value);
  let body = s.decimals == null
    ? formatGeneral(magnitude)
    : group(magnitude.toFixed(s.decimals), !!s.grouping);
  if (s.currency) body = `${s.currency}${body}`;
  const text = negative ? (s.parenNegative ? `(${body})` : `-${body}`) : body;
  return { text, kind: s.currency ? 'currency' : 'number' };
}

function formatGeneral(v) {
  if (Number.isInteger(v)) return String(v);
  const abs = Math.abs(v);
  if (abs !== 0 && (abs < 1e-6 || abs >= 1e15)) return v.toExponential(6);
  return String(Number(v.toPrecision(15)));
}

function group(numStr, useGrouping) {
  if (!useGrouping) return numStr;
  const [intPart, decPart] = numStr.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decPart != null ? `${grouped}.${decPart}` : grouped;
}

/** Days → a date. The 1900 system carries Excel's deliberate leap-year bug. */
export function serialToDate(serial, date1904 = false) {
  const days = date1904 ? serial + 1462 : serial;
  const ms = Math.round((days - 25569) * 86400000);
  const d = new Date(ms);
  return {
    iso: Number.isFinite(ms) && !Number.isNaN(d.getTime()) ? d.toISOString() : '',
    hasTime: Math.abs((serial % 1) * 86400) >= 1,
  };
}

function decimalPlaces(section) {
  const dot = section.indexOf('.');
  if (dot < 0) return null;
  const after = section.slice(dot + 1).replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, '');
  const match = after.match(/^[0#]+/);
  return match ? match[0].length : 0;
}

function stripLiterals(section) {
  return String(section || '')
    .replace(/"[^"]*"/g, '')
    .replace(/\\./g, '')
    .replace(/_.?/g, '')
    .replace(/\*./g, '')
    .replace(/\[(?!\$)[^\]]*\]/g, '');
}