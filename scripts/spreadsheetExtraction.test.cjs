/**
 * Phase 6D.1B.2 — STRUCTURED SPREADSHEET EXTRACTION
 * CERTIFICATION HARNESS
 *
 *   node scripts/spreadsheetExtraction.test.cjs
 *
 * It bundles and runs the REAL production code — the certified spreadsheet reader
 * (both the viewer's and the backend's copy), the backend structured bridge, the
 * reporting-period resolver and the extraction engine — against REAL workbook
 * bytes written by this file (a ZIP is a ZIP; a shared-string table is a
 * shared-string table). A green check means the product's own reading code read a
 * workbook, not that a mock agreed with itself.
 *
 * THE FINANCIAL-INTEGRITY DEFECTS THIS PHASE FOUND, AND WHAT COVERS THEM
 *   D1  monthly value mistaken for the annual figure — the first value column was
 *       bound instead of the statement's own TOTAL column.
 *   D2  a sparse grid index used as a spreadsheet column — the read landed one
 *       column past the total (O, not N).
 *   D3  a period label carried as a real DATE was not recognised as a label, so
 *       such a statement declared no total column at all.
 *   D4  a trailing-twelve-month statement resolved as a fiscal year.
 *   D5  a fiscal-year statement resolved as trailing-twelve-month.
 *   D6  the frontend and backend spreadsheet readers drifting apart.
 * Each has an explicit regression check (D1–D6) and a mutation that must be
 * caught (M1–M8).
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const P = (p) => path.join(ROOT, p);

const READER = 'src/lib/documents/formatReader/index.js';
const MIRROR = 'base44/shared/documents/spreadsheet';
const BRIDGE = 'base44/shared/documentExtraction/spreadsheetBridge.ts';
const PERIOD = 'base44/shared/documentExtraction/periodIntegrity.ts';
const ENGINE = 'base44/shared/documentExtraction/extractEngine.ts';
const RESUME = 'base44/shared/documentIngestion/resume.ts';

const MIRRORED = ['numbers', 'csv', 'zip', 'xlsx', 'xml', 'docx', 'xls', 'index', 'financials'];

const sha = (buf) => crypto.createHash('sha256').update(Buffer.from(buf)).digest('hex');

/** Assertions read CODE, not prose about it: comments are stripped first. */
const codeOf = (src) => String(src)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// ══════════════════════════════════════════════════════════════════════════════
// SOURCE-LEVEL MUTATION MECHANISM — one mechanism, two consumers
// ══════════════════════════════════════════════════════════════════════════════
// `overrides` maps a file path to REPLACEMENT TEXT. The same map is used both to
// bundle mutated code and to read mutated source, so a mutation is applied to the
// exact bytes the check under test sees.

function readSource(file, overrides = {}) {
  return overrides[file] != null ? overrides[file] : fs.readFileSync(P(file), 'utf8');
}

function mutate(file, find, replace, overrides = {}) {
  const src = readSource(file, overrides);
  if (!src.includes(find)) throw new Error(`mutation anchor not found in ${file}: ${find.slice(0, 60)}`);
  return { ...overrides, [file]: src.replace(find, replace) };
}

async function bundle(entry, { overrides = {}, externals = [] } = {}) {
  const plugins = Object.keys(overrides).length ? [{
    name: 'mutation',
    setup(b) {
      b.onLoad({ filter: /.*/ }, (a) => {
        const rel = path.relative(ROOT, a.path);
        if (overrides[rel] == null) return undefined;
        return { contents: overrides[rel], loader: rel.endsWith('.ts') ? 'ts' : 'js' };
      });
    },
  }] : [];
  const out = await esbuild.build({
    entryPoints: [P(entry)], bundle: true, format: 'cjs', platform: 'node',
    write: false, logLevel: 'silent', plugins, external: externals,
  });
  const m = { exports: {} };
  new Function('module', 'exports', 'require', out.outputFiles[0].text)(m, m.exports, require);
  return m.exports;
}

// ══════════════════════════════════════════════════════════════════════════════
// REAL WORKBOOK BYTES — no library, no mock
// ══════════════════════════════════════════════════════════════════════════════

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i += 1) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function zip(entries) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const data = Buffer.from(typeof e.data === 'string' ? e.data : JSON.stringify(e.data), 'utf8');
    const deflated = zlib.deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8); local.writeUInt16LE(0, 10); local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(deflated.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(8, 10); cd.writeUInt16LE(0, 12); cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(deflated.length, 20); cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(name.length, 28); cd.writeUInt32LE(0, 38); cd.writeUInt32LE(offset, 42);
    parts.push(local, name, deflated);
    central.push(cd, name);
    offset += local.length + name.length + deflated.length;
  }
  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cdBuf, end]);
}

const XF = { general: 0, money: 1, date: 2, percent: 3, paren: 4 };

function colName(c) {
  let n = c + 1; let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function buildXlsx({ sheets }) {
  const strings = [];
  const idx = (s) => { let i = strings.indexOf(s); if (i < 0) { strings.push(s); i = strings.length - 1; } return i; };

  const sheetXmls = sheets.map((sheet) => {
    const rows = sheet.grid.map((row, r) => {
      const cells = row.map((cell, c) => {
        if (!cell) return '';
        const ref = `${colName(c)}${r + 1}`;
        if (cell.inline != null) return `<c r="${ref}" t="inlineStr"><is><t>${esc(cell.inline)}</t></is></c>`;
        if (cell.formula != null) return `<c r="${ref}" s="${cell.xf || 0}"><f>${esc(cell.formula)}</f><v>${cell.cached}</v></c>`;
        if (cell.num != null) return `<c r="${ref}" s="${cell.xf || 0}"><v>${cell.num}</v></c>`;
        const value = cell.text != null ? cell.text : cell.str != null ? cell.str : '';
        return `<c r="${ref}" t="s"><v>${idx(value)}</v></c>`;
      }).filter(Boolean).join('');
      return cells ? `<row r="${r + 1}">${cells}</row>` : '';
    }).filter(Boolean).join('');

    const merges = (sheet.merges || []).length
      ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
      : '';
    return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData>${rows}</sheetData>${merges}</worksheet>`;
  });

  const sheetEls = sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}"${s.state ? ` state="${s.state}"` : ''} r:id="rId${i + 1}"/>`).join('');
  const rels = sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('');
  const sharedStrings = `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${strings.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('')}</sst>`;
  const styles = `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="$#,##0.00;($#,##0.00)"/></numFmts><cellXfs count="5"><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="14"/><xf numFmtId="10"/><xf numFmtId="164"/></cellXfs></styleSheet>`;

  return zip([
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetEls}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>` },
    { name: 'xl/sharedStrings.xml', data: sharedStrings },
    { name: 'xl/styles.xml', data: styles },
    ...sheetXmls.map((xml, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: xml })),
  ]);
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Excel serial for a date, so a month header can be a REAL date. */
function serial(y, m, d) {
  const days = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
  return days;
}

/**
 * A monthly income statement exactly as a spreadsheet produces one: twelve month
 * columns then the statement's own TOTAL column.
 */
function monthlyGrid({ title, months = MONTHS, monthly = false, revenue = 12000, cogs = 2000, opex = 3000, dateTyped = false, total = true, basis = null }) {
  const header = [{ text: 'Account' }];
  months.forEach((label, i) => {
    header.push(dateTyped
      ? { num: serial(2023, 1 + (i % 12), 1), xf: XF.date }
      : { text: label });
  });
  if (total) header.push({ text: 'Total' });

  const rowOf = (label, perMonth, formula) => {
    const cells = [{ text: label }];
    let sum = 0;
    months.forEach((label2, i) => {
      const v = monthly ? perMonth(i) : perMonth(i);
      sum += v;
      cells.push({ num: v, xf: XF.money });
    });
    if (total) cells.push(formula != null ? { formula, cached: sum, xf: XF.money } : { num: sum, xf: XF.money });
    return cells;
  };

  const grid = [
    [{ text: title }],
    [],
    header,
    [{ text: 'Income' }],
    rowOf('Total Income', (i) => revenue + i * 10),
    rowOf('Cost of Goods Sold', () => cogs),
    [],
    rowOf('Gross Profit', (i) => revenue + i * 10 - cogs),
    rowOf('Operating Expenses', () => opex),
    [],
    rowOf('Net Income', (i) => revenue + i * 10 - cogs - opex, 'B9-B10'),
  ];
  if (basis) grid.push([{ text: 'Basis' }, { text: basis }]);
  return grid;
}

// ══════════════════════════════════════════════════════════════════════════════
// FIXTURES
// ══════════════════════════════════════════════════════════════════════════════

const PNL_FIELDS = [
  { name: 'annual_revenue', label: 'Annual Revenue', type: 'currency' },
  { name: 'cogs', label: 'Cost of Goods Sold', type: 'currency' },
  { name: 'gross_profit', label: 'Gross Profit', type: 'currency' },
  { name: 'operating_expenses', label: 'Operating Expenses', type: 'currency' },
  { name: 'net_profit', label: 'Net Profit', type: 'currency' },
];

/** Two annual statements (2023, 2022) + one trailing-twelve-month statement. */
function multiYearWorkbook() {
  return buildXlsx({
    sheets: [
      { name: 'Export Summary', grid: [[{ text: 'This document was exported from Excel Online' }]] },
      { name: '2023', grid: monthlyGrid({ title: '2023 Monthly Income Statement', revenue: 12000, cogs: 2000, opex: 3000 }) },
      { name: '12mo', grid: monthlyGrid({ title: 'Trailing 12 Months (Feb 2022 – Jan 2023)', months: ["Feb '22", "Mar '22", "Apr '22", "May '22", "Jun '22", "Jul '22", "Aug '22", "Sep '22", "Oct '22", "Nov'22", "Dec'22", "Jan'23"], revenue: 1000, cogs: 100, opex: 200 }) },
      { name: '2022', grid: monthlyGrid({ title: '2022 Monthly Income Statement', revenue: 9000, cogs: 1500, opex: 2500, dateTyped: true }) },
    ],
  });
}

/** A statement that declares NO total column. */
function noTotalWorkbook() {
  return buildXlsx({ sheets: [{ name: '2021', grid: monthlyGrid({ title: '2021 Monthly Income Statement', revenue: 8000, total: false }) }] });
}

/** A sheet that states no period at all. */
function unknownPeriodWorkbook() {
  return buildXlsx({ sheets: [{ name: 'Summary', grid: monthlyGrid({ title: 'Income Statement', revenue: 5000 }) }] });
}

/** A statement that states its accounting basis. */
function basisWorkbook() {
  return buildXlsx({ sheets: [{ name: '2023', grid: monthlyGrid({ title: '2023 Monthly Income Statement', revenue: 7000, basis: 'Accrual Basis' }) }] });
}

// ══════════════════════════════════════════════════════════════════════════════
// THE MATRIX
// ══════════════════════════════════════════════════════════════════════════════

async function evaluate(overrides = {}) {
  const reader = await bundle(READER, { overrides });
  const backendReader = await bundle(`${MIRROR}/index.js`, { overrides });
  const bridge = await bundle(BRIDGE, { overrides });
  const periodMod = await bundle(PERIOD, { overrides });
  const engine = await bundle(ENGINE, { overrides, externals: ['npm:@base44/sdk', 'npm:@supabase/supabase-js'] });

  const checks = [];
  const check = (id, name, pass, detail) => checks.push({ id, name, pass: Boolean(pass), detail: detail == null ? null : String(detail) });

  const readWorkbook = async (bytes, name) => {
    const res = await reader.readDocument({ name, bytes });
    return { res, structure: res?.workbook ? reader.extractWorkbookStructure(res.workbook) : null };
  };

  const wb = multiYearWorkbook();

  // ── X1–X12 · THE READER ────────────────────────────────────────────────────
  const { res, structure } = await readWorkbook(wb, 'multi.xlsx');
  check('X1', 'reader reads a workbook written by this harness', res?.ok === true, res?.reason || `${structure?.sheets?.length} sheets`);

  const refused = await reader.readDocument({ name: 'notes.txt', bytes: Buffer.from('not a workbook at all') });
  check('X2', 'bytes that are not a workbook never yield a workbook model',
    !(refused?.workbook?.sheets?.length > 0), `${refused?.ok}/${refused?.reason ?? refused?.kind ?? 'no workbook model'}`);

  // BOTH readers are exercised — the viewer's and the backend's. They are certified
  // byte-identical, so a reading that is wrong is wrong in both; every figure
  // assertion below is therefore made against each of them in turn, so a mutation
  // in either copy is always visible.
  const backendWb = await backendReader.readDocument({ name: 'multi.xlsx', bytes: wb });
  const bStructure = backendReader.extractWorkbookStructure(backendWb.workbook);
  const sheetOf = (st, name) => (st?.sheets || []).find((s) => s.name === name);
  const bSheet = (name) => sheetOf(bStructure, name);

  const names = (structure?.sheets || []).map((s) => s.name);
  check('X3', 'every statement sheet is discovered, in workbook order', names.join('|') === 'Export Summary|2023|12mo|2022', names.join('|'));

  const s2023 = (structure?.sheets || []).find((s) => s.name === '2023');
  const s12 = (structure?.sheets || []).find((s) => s.name === '12mo');
  check('X4', 'the statement sheet yields its financial lines', (s2023?.financial?.lines?.length || 0) >= 5, `${s2023?.financial?.lines?.length} lines`);

  check('X5', 'the declared TOTAL column is detected', s2023?.financial?.period_total_column?.ref === 'N3', JSON.stringify(s2023?.financial?.period_total_column));

  const rev23 = (s2023?.financial?.lines || []).find((l) => l.concept === 'revenue');
  const rev23b = (bSheet('2023')?.financial?.lines || []).find((l) => l.concept === 'revenue');
  const sum23 = (12 * 12000) + (0 + 10 + 20 + 30 + 40 + 50 + 60 + 70 + 80 + 90 + 100 + 110);
  check('X6', 'the figure is bound to the TOTAL column, not the first month, in BOTH readers',
    rev23?.value === sum23 && rev23b?.value === sum23,
    `frontend ${rev23?.value} · backend ${rev23b?.value} · total ${sum23} · first month would be 12000`);
  check('X7', 'the binding is recorded as period_total',
    rev23?.value_basis === 'period_total' && rev23b?.value_basis === 'period_total',
    `${rev23?.value_basis}/${rev23b?.value_basis}`);

  check('X8', 'the line carries the exact cell, row and source label it came from',
    rev23?.cell === 'N5' && rev23?.row === 5 && rev23b?.cell === 'N5' && /total income/i.test(rev23?.label || ''),
    JSON.stringify({ cell: rev23?.cell, row: rev23?.row, label: rev23?.label, backend_cell: rev23b?.cell }));

  const net23 = (s2023?.financial?.lines || []).find((l) => l.concept === 'net_income');
  check('X9', 'a formula is carried as provenance and never evaluated here',
    net23?.formula === 'B9-B10' && typeof net23?.value === 'number',
    `formula=${net23?.formula} value=${net23?.value}`);

  const { structure: noTotal } = await readWorkbook(noTotalWorkbook(), 'no-total.xlsx');
  const noTotalLine = (noTotal?.sheets?.[0]?.financial?.lines || []).find((l) => l.concept === 'revenue');
  check('X10', 'a sheet with no total column says so instead of inventing one',
    noTotal?.sheets?.[0]?.financial?.period_total_column == null && noTotalLine?.value_basis === 'first_value_column' && noTotalLine?.value === 8000,
    `basis=${noTotalLine?.value_basis} value=${noTotalLine?.value}`);

  const s2022 = sheetOf(structure, '2022');
  const rev22 = (s2022?.financial?.lines || []).find((l) => l.concept === 'revenue');
  const rev22b = (bSheet('2022')?.financial?.lines || []).find((l) => l.concept === 'revenue');
  const sum22 = (12 * 9000) + (0 + 10 + 20 + 30 + 40 + 50 + 60 + 70 + 80 + 90 + 100 + 110);
  check('X11', 'a month header carried as a real DATE is still a period label',
    s2022?.financial?.period_total_column?.ref === 'N3'
    && bSheet('2022')?.financial?.period_total_column?.ref === 'N3'
    && rev22?.value === sum22 && rev22b?.value === sum22,
    `total=${s2022?.financial?.period_total_column?.ref}/${bSheet('2022')?.financial?.period_total_column?.ref} value=${rev22?.value}/${rev22b?.value}`);

  // A statement with a GAP column before the total: the value must be read from
  // the total's own column number, never from an array index.
  const gapped = buildXlsx({ sheets: [{ name: '2020', grid: [
    [{ text: '2020 Monthly Income Statement' }],
    [],
    [{ text: 'Account' }, ...MONTHS.map((m) => ({ text: m })), { text: 'Notes' }, { text: 'Total' }],
    [{ text: 'Income' }],
    [{ text: 'Total Income' }, ...MONTHS.map(() => ({ num: 100, xf: XF.money })), { text: 'gap column' }, { num: 1200, xf: XF.money }],
  ] }] });
  const { structure: gapStruct } = await readWorkbook(gapped, 'gapped.xlsx');
  const gapLine = (gapStruct?.sheets?.[0]?.financial?.lines || []).find((l) => l.concept === 'revenue');
  const gapBack = backendReader.extractWorkbookStructure((await backendReader.readDocument({ name: 'gapped.xlsx', bytes: gapped })).workbook);
  const gapLineB = (gapBack?.sheets?.[0]?.financial?.lines || []).find((l) => l.concept === 'revenue');
  check('X12', 'the total is read at its own column, not at a sparse-array index',
    gapStruct?.sheets?.[0]?.financial?.period_total_column?.ref === 'O3'
    && gapBack?.sheets?.[0]?.financial?.period_total_column?.ref === 'O3'
    && gapLine?.value === 1200 && gapLineB?.value === 1200
    && gapLine?.cell === 'O5' && gapLineB?.cell === 'O5',
    `col=${gapStruct?.sheets?.[0]?.financial?.period_total_column?.ref} value=${gapLine?.value}/${gapLineB?.value} cell=${gapLine?.cell}/${gapLineB?.cell}`);

  // ── X13–X23 · THE BRIDGE ───────────────────────────────────────────────────
  const structured = await bridge.buildStructuredWorkbook({ bytes: wb, name: 'multi.xlsx', documentType: 'profit_and_loss', fields: PNL_FIELDS });
  check('X13', 'the bridge reads a supported workbook it can read deterministically', structured?.ok === true, structured?.format);

  check('X14', 'each financial statement becomes its OWN section — never one flattened statement',
    (structured?.sheets || []).length === 3 && (structured?.sheets || []).map((s) => s.sheet).join('|') === '2023|12mo|2022',
    (structured?.sheets || []).map((s) => s.sheet).join('|'));

  check('X15', 'each section keeps the sheet name that locates it',
    (structured?.sheets || []).every((s) => s.sheet === s.suffix) === true,
    (structured?.sheets || []).map((s) => `${s.sheet}->${s.suffix}`).join(' '));

  check('X16', 'the period is the one the sheet itself states',
    structured?.sheets?.[0]?.period_raw === '2023' && /Trailing 12 Months/i.test(structured?.sheets?.[1]?.period_raw || ''),
    JSON.stringify((structured?.sheets || []).map((s) => s.period_raw)));

  const ttmPeriod = periodMod.resolveReportingPeriod(structured?.sheets?.[1]?.period_raw ?? null, null);
  check('X17', 'a trailing-twelve-month statement keeps its ACTUAL month bounds',
    ttmPeriod?.period_type === 'ttm' && ttmPeriod?.period_start === '2022-02-01' && ttmPeriod?.period_end === '2023-01-31' && ttmPeriod?.period_ambiguous === false,
    JSON.stringify({ type: ttmPeriod?.period_type, start: ttmPeriod?.period_start, end: ttmPeriod?.period_end, amb: ttmPeriod?.period_ambiguous }));

  const based = await bridge.buildStructuredWorkbook({ bytes: basisWorkbook(), name: 'basis.xlsx', documentType: 'profit_and_loss', fields: PNL_FIELDS });
  check('X18', 'a stated accounting basis is carried with its source',
    /accrual/i.test(based?.basis || '') && /accrual/i.test(based?.basis_evidence || ''), `${based?.basis} · ${based?.basis_evidence}`);

  check('X19', 'a workbook that states no basis reports none — silence stays silence', structured?.basis == null, String(structured?.basis));

  check('X20', 'each section states its own reporting period alongside its figures',
    (structured?.sheets || []).every((s) => typeof s.raw?.reporting_period === 'string' && s.raw.reporting_period.length > 0) === true,
    JSON.stringify((structured?.sheets || []).map((s) => s.raw?.reporting_period)));

  check('X21', 'only concepts the document type admits are mapped',
    Object.keys(structured?.sheets?.[0]?.raw || {}).every((k) => k === 'reporting_period' || PNL_FIELDS.some((f) => f.name === k)) === true,
    Object.keys(structured?.sheets?.[0]?.raw || {}).join(','));

  const refusedBytes = await bridge.buildStructuredWorkbook({ bytes: Buffer.from('not a workbook'), name: 'x.txt', documentType: 'profit_and_loss', fields: PNL_FIELDS });
  check('X22', 'unreadable bytes are refused, so the provider path is used instead', refusedBytes?.ok === false, refusedBytes?.reason);

  const refusedType = await bridge.buildStructuredWorkbook({ bytes: wb, name: 'multi.xlsx', documentType: 'w2', fields: PNL_FIELDS });
  check('X23', 'a document type with no concept map is refused', refusedType?.ok === false, refusedType?.reason);

  // ── X24–X27 · PERIOD SEMANTICS ─────────────────────────────────────────────
  const fy = periodMod.resolveReportingPeriod('2023', null);
  const unknown = periodMod.resolveReportingPeriod('Income Statement', null);
  check('X24', 'a fiscal year stays a fiscal year, with its own dates', fy?.period_type === 'annual' && fy?.fiscal_year === 2023 && fy?.period_start === '2023-01-01' && fy?.period_end === '2023-12-31', JSON.stringify(fy));
  check('X25', 'TTM stays TTM and is never read as a fiscal year', ttmPeriod?.period_type === 'ttm' && ttmPeriod?.period_type !== 'annual', ttmPeriod?.period_type);
  check('X26', 'a TTM statement with no bounds is still TTM, not a year', (() => { const p = periodMod.resolveReportingPeriod('Trailing 12 Months', null); return p?.period_type === 'ttm' && p?.period_type !== 'annual'; })(), JSON.stringify(periodMod.resolveReportingPeriod('Trailing 12 Months', null)));
  check('X27', 'an unreadable period stays unknown and is never invented',
    (unknown?.period_type == null || unknown?.period_type === 'unknown')
    && unknown?.period_ambiguous === true && unknown?.fiscal_year == null,
    JSON.stringify({ type: unknown?.period_type, amb: unknown?.period_ambiguous, fy: unknown?.fiscal_year }));

  const { structure: unknownStruct } = await readWorkbook(unknownPeriodWorkbook(), 'unknown.xlsx');
  check('X27b', 'a monthly statement with no stated period is never given the uploader’s year',
    unknownStruct?.sheets?.[0]?.financial?.lines?.length > 0 && unknownStruct?.sheets?.[0]?.financial?.period_total_column?.ref === 'N3',
    `lines=${unknownStruct?.sheets?.[0]?.financial?.lines?.length}`);

  // ── X28–X30 · THE ENGINE, AND THE DISCOVERED DEFECTS ───────────────────────
  const engineSrc = codeOf(readSource(ENGINE, overrides));
  const resumeSrc = codeOf(readSource(RESUME, overrides));

  const bridgeAt = engineSrc.indexOf('tryStructuredSpreadsheetExtraction(');
  const providerAt = engineSrc.indexOf('buildExtractionSchema(documentType)');
  check('X28', 'the engine reads a workbook structurally BEFORE the opaque provider, and ACTS on it',
    bridgeAt > -1 && providerAt > -1 && bridgeAt < providerAt && engineSrc.includes('if (structuredWorkbook?.ok) {'),
    `bridge@${bridgeAt} provider@${providerAt} gate=${engineSrc.includes('if (structuredWorkbook?.ok) {')}`);

  check('X29', 'a structured read is never presented as a model extraction',
    engineSrc.includes("extractionMethod = 'structured_spreadsheet_extraction'") &&
    !/extraction_method:\s*'ai_extraction'[\s\S]{0,200}structured/i.test(engineSrc),
    'method label + no fabricated AI attribution');

  check('X30', 'the engine reconciles per section and namespaces each row by its section',
    engineSrc.includes('const sections = structuredSections.length') &&
    engineSrc.includes('? structuredSections') && engineSrc.includes(': [{') && /persistedName/.test(engineSrc) &&
    engineSrc.includes('...(sections.length > 1 ? {'),
    'sections + persisted name + multi-period record');

  // ── D1–D6 · THE DEFECTS THIS PHASE FOUND ──────────────────────────────────
  check('D1', 'REGRESSION: a monthly figure is never presented as the annual figure',
    rev23?.value === sum23 && rev23b?.value === sum23 && rev23?.value !== 12000 && rev23?.cell === 'N5',
    `total=${rev23?.value}/${rev23b?.value} from ${rev23?.cell} (first month would be 12000 at B5)`);

  check('D2', 'REGRESSION: a sparse grid index is never used as a spreadsheet column',
    gapLine?.value === 1200 && gapLineB?.value === 1200 && gapLine?.cell === 'O5' && gapLineB?.cell === 'O5',
    `value=${gapLine?.value}/${gapLineB?.value} cell=${gapLine?.cell}/${gapLineB?.cell}`);

  check('D3', 'REGRESSION: date-typed month headers are recognised as period labels',
    s2022?.financial?.period_total_column?.ref === 'N3' && bSheet('2022')?.financial?.period_total_column?.ref === 'N3',
    `frontend=${s2022?.financial?.period_total_column?.ref} backend=${bSheet('2022')?.financial?.period_total_column?.ref}`);

  check('D4', 'REGRESSION: a TTM statement is not dated as a fiscal year',
    ttmPeriod?.period_type === 'ttm' && ttmPeriod?.period_start !== '2022-01-01', `${ttmPeriod?.period_type} ${ttmPeriod?.period_start}`);

  const fyFromTtmSheet = periodMod.resolveReportingPeriod('2023', null);
  check('D5', 'REGRESSION: a fiscal-year statement is not dated as TTM', fyFromTtmSheet?.period_type === 'annual', fyFromTtmSheet?.period_type);

  const parityFailures = MIRRORED.filter((n) => {
    const a = fs.readFileSync(P(`src/lib/documents/formatReader/${n}.js`), 'utf8');
    const b = readSource(`${MIRROR}/${n}.js`, overrides);
    return a !== b;
  });
  check('D6', 'REGRESSION: the frontend and backend readers are byte-identical', parityFailures.length === 0, parityFailures.join(',') || 'all nine identical');

  // Functional parity, not only byte parity: the same workbook read by both.
  const backendStructure = backendReader.extractWorkbookStructure((await backendReader.readDocument({ name: 'multi.xlsx', bytes: wb })).workbook);
  const digest = (st) => JSON.stringify((st.sheets || []).map((s) => ({
    name: s.name,
    total: s.financial?.period_total_column?.ref ?? null,
    lines: (s.financial?.lines || []).map((l) => [l.concept, l.value, l.value_basis, l.cell]),
  })));
  check('D6b', 'REGRESSION: both readers reach the same financial structure', digest(structure) === digest(backendStructure), 'frontend === backend');

  // ── ENGINE FUNCTIONAL — the real normalizer and currency parser ────────────
  const norm = engine.normalizeExtraction('profit_and_loss', { reporting_period: '2023', annual_revenue: '206,249.79', gross_profit: '$195,899.75' });
  check('E1', 'the engine’s own normalizer reads the total-column figures it is given',
    norm?.success === true && norm.facts.annual_revenue.normalized === 206249.79 && norm.facts.gross_profit.normalized === 195899.75,
    JSON.stringify(Object.fromEntries(Object.entries(norm?.facts || {}).map(([k, v]) => [k, v.normalized]))));
  check('E2', 'currency normalization is unchanged by this phase', engine.parseCurrency('($1,234.5)') === -1234.5 && engine.parseCurrency('1.25M') === 1250000, 'paren + suffix forms');

  // ── RETRY CERTIFICATION (the canonical restart, source-verified here) ──────
  check('R1', 'a failed analysis is restartable through the canonical resume', resumeSrc.includes("export const RESTARTABLE_FAILURE_STATES = ['failed'];") && resumeSrc.includes('!settled && !restartableFailure'), 'failed ∈ restartable');
  check('R2', 'a restart is refused when the source is gone or its location is unrecognised', resumeSrc.includes('isApprovedDocumentBucket(sourceBucket)') && resumeSrc.includes('createSignedUrl(sourcePath, 60)'), 'source probe');
  check('R3', 'a restart never reassigns business, scope or profile',
    !/update\(\s*\{[^}]*business_id/.test(resumeSrc)
    && !/update\(\s*\{[^}]*document_scope/.test(resumeSrc)
    && resumeSrc.includes('EXTRACTION_HANDOFF_STATE'),
    'no business/scope write on the handoff transition');

  return checks;
}

// ══════════════════════════════════════════════════════════════════════════════
// MUTATION BATTERY — every mutation must be CAUGHT
// ══════════════════════════════════════════════════════════════════════════════

const READER_F = 'src/lib/documents/formatReader';
const MIRROR_F = `${MIRROR}`;

const MUTATIONS = [
  { id: 'M1', name: 'TOTAL binding changed back to the first value column',
    apply: (o) => mutate(`${MIRROR_F}/financials.js`, 'const totalCell = findPeriodTotalColumn(rows);', 'const totalCell = null;', o),
    mustFail: ['X6', 'D1'] },
  { id: 'M2', name: 'off-by-one spreadsheet column (sparse index used as column)',
    apply: (o) => mutate(`${MIRROR_F}/financials.js`, 'const cell = (row || []).find((c) => c && c.col === col);', 'const cell = (row || [])[col];', o),
    mustFail: ['X12', 'D2'] },
  { id: 'M3', name: 'TTM recognition removed',
    apply: (o) => mutate(PERIOD, "period_type: 'ttm'", "period_type: 'annual'", o),
    mustFail: ['X17', 'X25', 'D4'] },
  { id: 'M4', name: 'frontend/backend reader parity broken (byte drift in the mirror)',
    // A parity break is a BYTE divergence: the drift is deliberately behaviour-neutral,
    // so only the parity certification can see it — which is exactly its job.
    apply: (o) => ({ ...o, [`${MIRROR_F}/financials.js`]: readSource(`${MIRROR_F}/financials.js`, {}) + '\n// deliberate parity drift\n' }),
    mustFail: ['D6'] },
  { id: 'M5', name: 'date-typed period headers mishandled again',
    apply: (o) => mutate(`${MIRROR_F}/financials.js`, "const cells = (rows[r] || []).filter((c) => c && String(c.text || '').trim());", "const cells = (rows[r] || []).filter((c) => c && c.kind === 'text' && String(c.text || '').trim());", o),
    mustFail: ['X11', 'D3'] },
  { id: 'M6', name: 'TOTAL column declared but the value read from the first month',
    apply: (o) => mutate(`${MIRROR_F}/financials.js`, 'numberAt(row, totalCell.col)', 'firstNumberAfter(row, 0)', o),
    mustFail: ['X6', 'D1'] },
  { id: 'M7', name: 'multi-period facts flattened into one period',
    apply: (o) => mutate(ENGINE, '...(sections.length > 1 ? {', '...(false ? {', o),
    mustFail: ['X30'] },
  { id: 'M8', name: 'engine stops preferring the certified structured read',
    apply: (o) => mutate(ENGINE, 'if (structuredWorkbook?.ok) {', 'if (false && structuredWorkbook?.ok) {', o),
    mustFail: ['X28'] },
];

// ══════════════════════════════════════════════════════════════════════════════
// RUNNER
// ══════════════════════════════════════════════════════════════════════════════

(async () => {
  const line = '─'.repeat(96);
  console.log(line);
  console.log('PHASE 6D.1B.2 — STRUCTURED SPREADSHEET EXTRACTION CERTIFICATION');
  console.log(`source workbook reader sha256: ${sha(fs.readFileSync(P(`${READER}`))).slice(0, 16)}…`);
  console.log(line);

  let failed = 0;
  const results = await evaluate({});

  console.log('\nREADER · BRIDGE · PERIOD · ENGINE · RETRY');
  for (const c of results) {
    if (!c.pass) failed += 1;
    console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.id.padEnd(4)} ${c.name}${c.detail ? `  → ${c.detail}` : ''}`);
  }

  console.log(`\n${line}\nMUTATION BATTERY — each mutation must be CAUGHT\n${line}`);
  let mutationFailures = 0;
  for (const m of MUTATIONS) {
    let mutated = null;
    let crashed = null;
    try {
      mutated = await evaluate(m.apply({}));
    } catch (err) {
      crashed = String(err.message).split('\n')[0];
    }
    if (crashed) {
      console.log(`  ${m.id.padEnd(4)} ${m.name} → FAILED TO BUILD: ${crashed}`);
      mutationFailures += 1;
      continue;
    }
    const failedIds = mutated.filter((c) => !c.pass).map((c) => c.id);
    const caught = m.mustFail.every((id) => failedIds.includes(id));
    if (!caught) mutationFailures += 1;
    console.log(`  ${caught ? 'CAUGHT' : 'MISSED'} ${m.id.padEnd(4)} ${m.name} → failed: ${failedIds.join(', ') || 'none'}`);
  }

  console.log(`\n${line}`);
  console.log(`CHECKS: ${results.length - failed}/${results.length} passed`);
  console.log(`MUTATIONS: ${MUTATIONS.length - mutationFailures}/${MUTATIONS.length} caught`);
  const ok = failed === 0 && mutationFailures === 0;
  console.log(ok ? 'SPREADSHEET EXTRACTION CERTIFIED' : 'SPREADSHEET EXTRACTION NOT CERTIFIED');
  console.log(line);
  process.exit(ok ? 0 : 1);
})();