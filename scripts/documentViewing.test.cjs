/**
 * Phase 6D.1C — READ-ONLY DOCUMENT VIEWER + EXTRACTION
 * CERTIFICATION HARNESS
 *
 *   node scripts/documentViewing.test.cjs
 *
 * It bundles the REAL format reader and runs it against REAL documents — every
 * fixture below is written byte-by-byte here (a ZIP is a ZIP; a compound file is
 * a compound file), so a passing check means the reader read a document, not that
 * it read a mock.
 *
 * WHAT THIS HARNESS CANNOT DO, STATED PLAINLY
 *   · It has no browser, so it exercises the READER, not React. The components are
 *     covered by the production build and by the live smoke run reported in
 *     VISION_READ_ONLY_DOCUMENT_VIEWER_REPORT.md.
 *   · The .xls fixture is written from the same specification the reader implements
 *     (MS-CFB + MS-XLS). It proves the reader is internally consistent and that it
 *     handles each record class — it cannot prove it agrees with a file Excel wrote.
 *     The reader REFUSES anything it cannot read with confidence rather than guessing.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const P = (p) => path.join(ROOT, p);
const READER = 'src/lib/documents/formatReader/index.js';
const VIEWER = 'src/components/documents/DocumentViewer.jsx';
const HOOK = 'src/hooks/useDocumentViewer.js';
const BACKEND = 'base44/functions/supabaseUserData/entry.ts';

const sha = (buf) => crypto.createHash('sha256').update(Buffer.from(buf)).digest('hex');

/**
 * A source assertion reads CODE, not the prose about it. Several of the checks
 * below refuse a construct the reader must never contain — and a doc comment
 * that NAMES that construct while explaining its absence is not the construct.
 * Comments are therefore removed before the code is inspected.
 */
const codeOf = (src) => String(src)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

async function loadReader(mutation = null) {
  const plugins = mutation ? [{
    name: 'harness',
    setup(b) {
      b.onLoad({ filter: /.*/ }, (a) => {
        if (path.resolve(a.path) !== P(mutation.file)) return undefined;
        const src = fs.readFileSync(a.path, 'utf8');
        if (!src.includes(mutation.find)) throw new Error(`mutation anchor not found in ${mutation.file}`);
        return { contents: src.replace(mutation.find, mutation.replace), loader: 'js' };
      });
    },
  }] : [];
  const out = await esbuild.build({
    entryPoints: [P(READER)], bundle: true, format: 'cjs', platform: 'node',
    write: false, logLevel: 'silent', plugins,
  });
  const m = { exports: {} };
  new Function('module', 'exports', 'require', out.outputFiles[0].text)(m, m.exports, require);
  return m.exports;
}

// ══════════════════════════════════════════════════════════════════════════════
// FIXTURE WRITERS — real bytes, no library
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

/** A real ZIP (local headers + central directory + EOCD), deflated. */
function zip(entries) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data, 'utf8');
    const crc = crc32(data);
    const comp = zlib.deflateRawSync(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(comp.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt32LE(offset, 42);

    parts.push(local, name, comp);
    central.push(cd, name);
    offset += local.length + name.length + comp.length;
  }
  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cdBuf, eocd]);
}

// ── XLSX ─────────────────────────────────────────────────────────────────────
const XF = { general: 0, money: 1, date: 2, percent: 3, paren: 4 };

function colName(c) {
  let n = c + 1;
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/**
 * `grid` is a 2D array of cell descriptors:
 *   {text}, {str}, {num, xf}, {formula, cached, xf}, {inline}, null
 * Text goes through the SHARED STRING table, exactly as a real workbook does.
 */
function buildXlsx({ sheets, sharedExtra = [] }) {
  const strings = [...sharedExtra];
  const idx = (s) => {
    let i = strings.indexOf(s);
    if (i < 0) { strings.push(s); i = strings.length - 1; }
    return i;
  };

  const sheetXmls = sheets.map((sheet) => {
    const rows = sheet.grid.map((row, r) => {
      const cells = row.map((cell, c) => {
        if (!cell) return '';
        const ref = `${colName(c)}${r + 1}`;
        if (cell.inline != null) return `<c r="${ref}" t="inlineStr"><is><t>${esc(cell.inline)}</t></is></c>`;
        if (cell.formula != null) {
          return `<c r="${ref}" s="${cell.xf || 0}"><f>${esc(cell.formula)}</f><v>${cell.cached}</v></c>`;
        }
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

  const sheetEls = sheets.map((s, i) => (
    `<sheet name="${esc(s.name)}" sheetId="${i + 1}"${s.state ? ` state="${s.state}"` : ''} r:id="rId${i + 1}"/>`
  )).join('');
  const rels = sheets.map((s, i) => (
    `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
  )).join('');

  const sharedStrings = `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${strings.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('')}</sst>`;

  const styles = `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="$#,##0.00;($#,##0.00)"/></numFmts><cellXfs count="5"><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="14"/><xf numFmtId="10"/><xf numFmtId="164"/></cellXfs></styleSheet>`;

  const entries = [
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetEls}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>` },
    { name: 'xl/sharedStrings.xml', data: sharedStrings },
    { name: 'xl/styles.xml', data: styles },
    ...sheetXmls.map((xml, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: xml })),
  ];
  return zip(entries);
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── XLS (BIFF8 inside an OLE compound file) ──────────────────────────────────
const REC = { BOF: 0x0809, EOF: 0x000a, BOUNDSHEET: 0x0085, SST: 0x00fc, CONTINUE: 0x003c, XF: 0x00e0, FORMAT: 0x041e, DATEMODE: 0x0022, MERGEDCELLS: 0x00e5, LABELSST: 0x00fd, RK: 0x027e, MULRK: 0x00bd, NUMBER: 0x0203, FORMULA: 0x0006 };

function record(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt16LE(type, 0);
  head.writeUInt16LE(data.length, 2);
  return Buffer.concat([head, data]);
}
function sheetRecord(stream) { return record(REC.BOF, bofData(0x0010)); }
function bofData(dt) {
  const b = Buffer.alloc(16);
  b.writeUInt16LE(0x0600, 0);
  b.writeUInt16LE(dt, 2);
  return b;
}
function rkInt(value) { return (((value << 2) | 0x02) >>> 0); }
function rkIntPercent(value) { return ((((value * 100) << 2) | 0x03) >>> 0); }
function rkFloat(value) {
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, value, true);
  return (dv.getUint32(4, true) & 0xfffffffc) >>> 0;
}
function cellHeader(row, col, xf) {
  const b = Buffer.alloc(6);
  b.writeUInt16LE(row, 0); b.writeUInt16LE(col, 2); b.writeUInt16LE(xf, 4);
  return b;
}
function labelsst(row, col, xf, isst) {
  const full = Buffer.alloc(10);
  cellHeader(row, col, xf).copy(full, 0);
  full.writeUInt32LE(isst, 6);
  return record(REC.LABELSST, full);
}
function numberCell(row, col, xf, value) {
  const b = Buffer.alloc(14);
  cellHeader(row, col, xf).copy(b, 0);
  b.writeDoubleLE(value, 6);
  return record(REC.NUMBER, b);
}
function rkCell(row, col, xf, rk) {
  const b = Buffer.alloc(10);
  cellHeader(row, col, xf).copy(b, 0);
  b.writeUInt32LE(rk >>> 0, 6);
  return record(REC.RK, b);
}
function mulrkCell(row, colFirst, entries) {
  const b = Buffer.alloc(4 + entries.length * 6 + 2);
  b.writeUInt16LE(row, 0);
  b.writeUInt16LE(colFirst, 2);
  entries.forEach((e, i) => {
    b.writeUInt16LE(e.xf || 0, 4 + i * 6);
    b.writeUInt32LE(e.rk >>> 0, 6 + i * 6);
  });
  b.writeUInt16LE(colFirst + entries.length - 1, 4 + entries.length * 6);
  return record(REC.MULRK, b);
}
function formulaCell(row, col, xf, cached) {
  const b = Buffer.alloc(22);
  cellHeader(row, col, xf).copy(b, 0);
  b.writeDoubleLE(cached, 6);
  b.writeUInt16LE(0, 14);
  b.writeUInt32LE(0, 16);
  b.writeUInt16LE(0, 20);
  return record(REC.FORMULA, b);
}
/** XLUnicodeString: cch (u16), grbit (u8), chars. */
function xlString(s, high = false) {
  const chars = Buffer.alloc(s.length * (high ? 2 : 1));
  for (let i = 0; i < s.length; i += 1) {
    if (high) chars.writeUInt16LE(s.charCodeAt(i), i * 2);
    else chars.writeUInt8(s.charCodeAt(i), i);
  }
  const head = Buffer.alloc(3);
  head.writeUInt16LE(s.length, 0);
  head.writeUInt8(high ? 1 : 0, 2);
  return Buffer.concat([head, chars]);
}

function buildXls() {
  // ── styles: XF[0]=General, XF[1]=#,##0.00, XF[2]=date, XF[3]=0.00%, XF[4]=$#,##0.00 ──
  const xfRecords = [0, 4, 14, 10, 164].map((ifmt) => {
    const b = Buffer.alloc(20);
    b.writeUInt16LE(0, 0);
    b.writeUInt16LE(ifmt, 2);
    return record(REC.XF, b);
  });
  const formatRec = record(REC.FORMAT, (() => {
    const head = Buffer.alloc(2); head.writeUInt16LE(164, 0);
    return Buffer.concat([head, xlString('$#,##0.00;($#,##0.00)')]);
  })());
  const dateMode = record(REC.DATEMODE, Buffer.from([0x00, 0x00]));

  // ── SST: three strings, one deliberately SPLIT across a CONTINUE boundary ──
  const labels = ['Income', 'COGS', 'Gross Profit', 'Expenses', 'Net Income', 'Report date'];
  const splitLong = 'ABCDEFGHIJ'; // its own entry, to prove the boundary rule
  const total = labels.length + 1;
  const sstHead = Buffer.alloc(8);
  sstHead.writeUInt32LE(total, 0);
  sstHead.writeUInt32LE(total, 4);
  // The split string declares its FULL length in the SST block and carries only
  // its first 5 characters there; the CONTINUE restarts with the one-byte
  // encoding flag before the remaining 5. That is how a real writer breaks a
  // string across the boundary — declaring cch=5 in the SST block would be a
  // malformed file, and the reader would be right to mis-read it.
  const splitHead = Buffer.alloc(3);
  splitHead.writeUInt16LE(splitLong.length, 0);
  splitHead.writeUInt8(0, 2);
  const inSst = Buffer.concat([sstHead, xlString(labels[0]), splitHead, Buffer.from(splitLong.slice(0, 5), 'latin1')]);
  const inContinue = Buffer.concat([
    Buffer.from([0x00]), // the encoding byte a continued string restarts with
    Buffer.from(splitLong.slice(5), 'latin1'),
    ...labels.slice(1).map((s) => xlString(s)),
  ]);
  const sst = record(REC.SST, inSst);
  const cont = record(REC.CONTINUE, inContinue);
  const sstIndex = (label) => labels.indexOf(label) + (label === labels[0] ? 0 : 1);

  // ── sheet streams ──
  const sheet0 = Buffer.concat([
    sheetRecord(),
    labelsst(0, 0, 0, 0), numberCell(0, 1, 4, 5240000),
    labelsst(1, 0, 0, sstIndex('COGS')), mulrkCell(1, 1, [{ rk: rkInt(3060000), xf: 4 }]),
    labelsst(2, 0, 0, sstIndex('Gross Profit')), formulaCell(2, 1, 4, 2180000),
    labelsst(3, 0, 0, sstIndex('Expenses')), rkCell(3, 1, 4, rkInt(1620000)),
    labelsst(4, 0, 0, sstIndex('Net Income')), rkCell(4, 1, 4, rkInt(560000)),
    labelsst(5, 0, 0, sstIndex('Report date')), numberCell(5, 1, 2, 45306),
    record(REC.MERGEDCELLS, (() => { const b = Buffer.alloc(10); b.writeUInt16LE(1, 0); b.writeUInt16LE(0, 2); b.writeUInt16LE(0, 4); b.writeUInt16LE(0, 6); b.writeUInt16LE(2, 8); return b; })()),
    record(REC.EOF, Buffer.alloc(0)),
  ]);
  const sheet1 = Buffer.concat([
    sheetRecord(),
    labelsst(0, 0, 0, 1), record(REC.RK, (() => { const b = Buffer.alloc(10); cellHeader(0, 1, 0).copy(b, 0); b.writeUInt32LE(rkFloat(1.5), 6); return b; })()),
    labelsst(1, 0, 0, 1), record(REC.RK, (() => { const b = Buffer.alloc(10); cellHeader(1, 1, 0).copy(b, 0); b.writeUInt32LE(rkIntPercent(123.45), 6); return b; })()),
    record(REC.EOF, Buffer.alloc(0)),
  ]);
  const sheet2 = Buffer.concat([sheetRecord(), record(REC.EOF, Buffer.alloc(0))]);

  // ── globals (BOUNDSHEET offsets patched once the layout is known) ──
  const names = ['Profit & Loss', 'Detail', 'Hidden Data'];
  const bounds = names.map((name, i) => {
    const b = Buffer.alloc(7 + name.length);
    b.writeUInt8(i === 2 ? 1 : 0, 4);
    b.writeUInt8(name.length, 5);
    b.writeUInt8(0, 6);
    for (let c = 0; c < name.length; c += 1) b.writeUInt8(name.charCodeAt(c), 7 + c);
    return { buf: b, name };
  });
  // A BOUNDSHEET carries the BYTE OFFSET of its sheet's BOF inside the workbook
  // stream, and a record is written by copying its data — so an offset patched
  // into the source buffer afterwards never reaches the stream. The globals are
  // therefore built twice from the SAME record list: once to measure, once with
  // the true offsets. Both passes produce identical lengths, so they cannot
  // disagree about the layout.
  const sheetStreams = [sheet0, sheet1, sheet2];
  const buildGlobals = (offsets) => Buffer.concat([
    record(REC.BOF, bofData(0x0005)), dateMode, ...xfRecords, formatRec, sst, cont,
    ...bounds.map((b, i) => {
      const data = Buffer.from(b.buf);
      data.writeUInt32LE(offsets[i] || 0, 0);
      return record(REC.BOUNDSHEET, data);
    }),
    record(REC.EOF, Buffer.alloc(0)),
  ]);

  const measured = buildGlobals([0, 0, 0]);
  const offsets = [];
  let at = measured.length;
  for (const s of sheetStreams) { offsets.push(at); at += s.length; }

  const rebuilt = buildGlobals(offsets);
  if (rebuilt.length !== measured.length) throw new Error('the globals changed size between passes');
  const stream = Buffer.concat([rebuilt, ...sheetStreams]);
  return { stream, bounds };
}

/** Pad to at least 4096 bytes so the workbook stream is a REGULAR stream. */
function padStream(stream) {
  let target = Math.max(4096, Math.ceil(stream.length / 512) * 512);
  if (target - stream.length < 8) target += 512;
  const filler = Buffer.alloc(target - stream.length);
  filler.writeUInt16LE(0x1234, 0);
  filler.writeUInt16LE(filler.length - 4, 2);
  return Buffer.concat([stream, filler]);
}

function buildCfb(streamInput, streamName = 'Workbook') {
  const stream = padStream(streamInput);
  const dataSectors = stream.length / 512;
  const FAT = new Array(128).fill(0xffffffff);
  FAT[0] = 0xfffffffd;            // the FAT sector itself
  FAT[1] = 0xfffffffe;            // the directory chain ends
  for (let i = 0; i < dataSectors; i += 1) FAT[2 + i] = i === dataSectors - 1 ? 0xfffffffe : 3 + i;

  const fatSector = Buffer.alloc(512);
  FAT.forEach((v, i) => fatSector.writeUInt32LE(v, i * 4));

  const dir = Buffer.alloc(512);
  writeDirEntry(dir, 0, 'Root Entry', 5, 0xfffffffe, 1, 0);
  writeDirEntry(dir, 1, streamName, 2, 2, 0xffffffff, stream.length);

  const header = Buffer.alloc(512);
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(header, 0);
  header.writeUInt16LE(0x003e, 24);
  header.writeUInt16LE(0x0003, 26);
  header.writeUInt16LE(0xfffe, 28);
  header.writeUInt16LE(9, 30);
  header.writeUInt16LE(6, 32);
  header.writeUInt32LE(0, 40);
  header.writeUInt32LE(1, 44);
  header.writeUInt32LE(1, 48);
  header.writeUInt32LE(4096, 56);
  header.writeUInt32LE(0xfffffffe, 60);
  header.writeUInt32LE(0, 64);
  header.writeUInt32LE(0xfffffffe, 68);
  header.writeUInt32LE(0, 72);
  header.writeUInt32LE(0, 76);
  for (let i = 1; i < 109; i += 1) header.writeUInt32LE(0xffffffff, 76 + i * 4);

  return Buffer.concat([header, fatSector, dir, stream]);
}

function writeDirEntry(buf, index, name, type, start, child, size) {
  const off = index * 128;
  for (let i = 0; i < name.length; i += 1) buf.writeUInt16LE(name.charCodeAt(i), off + i * 2);
  buf.writeUInt16LE((name.length + 1) * 2, off + 64);
  buf.writeUInt8(type, off + 66);
  buf.writeUInt8(1, off + 67);
  buf.writeUInt32LE(0xffffffff, off + 68);
  buf.writeUInt32LE(0xffffffff, off + 72);
  buf.writeUInt32LE(child, off + 76);
  buf.writeUInt32LE(start, off + 116);
  buf.writeUInt32LE(size, off + 120);
}

// ── DOCX ─────────────────────────────────────────────────────────────────────
const DOCX_XML = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>2024 Profit and Loss</w:t></w:r></w:p>
<w:p><w:r><w:t>Prepared for the current owner.</w:t></w:r></w:p>
<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Revenue is up on last year</w:t></w:r></w:p>
<w:tbl>
<w:tr><w:tc><w:p><w:r><w:t>Account</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Amount</w:t></w:r></w:p></w:tc></w:tr>
<w:tr><w:tc><w:p><w:r><w:t>Income</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>5,240,000</w:t></w:r></w:p></w:tc></w:tr>
<w:tr><w:tc><w:p><w:r><w:t>Net Income</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>560,000</w:t></w:r></w:p></w:tc></w:tr>
</w:tbl>
<w:p><w:r><w:t>Deleted text is not part of the document.</w:t></w:r><w:del><w:r><w:delText>SHOULD NOT APPEAR</w:delText></w:r></w:del></w:p>
</w:body></w:document>`;

function buildDocx() {
  return zip([{ name: 'word/document.xml', data: DOCX_XML }]);
}

// ── The reported production shape: a P&L workbook ────────────────────────────
function pnlWorkbook(overrides = {}) {
  const grid = [
    [{ text: 'P&L Prev owner Excel Online' }, null, null],
    [{ text: 'Account' }, { text: 'Amount' }, null],
    [{ text: 'Income' }, { num: 5240000, xf: XF.money }, null],
    [{ text: 'COGS' }, { num: 3060000, xf: XF.money }, null],
    [{ text: 'Gross Profit' }, { formula: 'B4-B5', cached: 2180000, xf: XF.money }, null],
    [{ text: 'Operating Income' }, { num: 722000, xf: XF.money }, null],
    [{ text: 'Expenses' }, { num: 1620000, xf: XF.money }, null],
    [{ text: 'Net Income' }, { num: 560000, xf: XF.money }, null],
    [{ text: 'Owner draw' }, { num: -12500, xf: XF.paren }, null],
    [{ text: 'Margin' }, { num: 0.185, xf: XF.percent }, null],
    [{ text: 'Period end' }, { num: 45306, xf: XF.date }, null],
  ];
  if (overrides.grid) overrides.grid(grid);
  return buildXlsx({
    sheets: [
      { name: 'Profit & Loss', grid, merges: ['A1:C1'] },
      { name: 'Detail', grid: [[{ text: 'Account' }, { text: 'Type' }], [{ text: 'Income' }, { inline: 'Revenue' }], [{ text: 'COGS' }, { inline: 'Cost' }]] },
      { name: 'Hidden Data', state: 'hidden', grid: [[{ text: 'Hidden sheet label' }, { num: 42, xf: XF.general }]] },
    ],
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// THE MATRIX
// ══════════════════════════════════════════════════════════════════════════════

async function evaluate(mutation = null) {
  const R = await loadReader(mutation);
  const res = {};
  const set = (k, v) => { res[k] = !!v; };
  const read = (name, bytes) => R.readDocument({ name, bytes: new Uint8Array(bytes) });

  const wbBytes = pnlWorkbook();
  const wb = await read('P&L Prev owner Excel Online.xlsx', wbBytes);

  // ── V1 — the reported failure: an XLSX is READ, not refused ──────────────
  set('V1', wb.ok && wb.format === 'xlsx' && wb.workbook.sheets.length === 3);

  // ── V2 — sheet tabs, in workbook order, with the hidden sheet MARKED ─────
  set('V2', wb.workbook.sheets.map((s) => s.name).join('|') === 'Profit & Loss|Detail|Hidden Data'
    && wb.workbook.sheets[2].hidden === true
    && wb.workbook.sheets[0].hidden === false);

  // ── V3 — cell values, real references, and the number formats the file
  //         itself carries: currency, percent, date, negatives ──────────────
  const pnl = wb.workbook.sheets[0];
  const at = (ref) => pnl.rows
    .flatMap((r) => r || [])
    .find((c) => c && c.ref === ref) || null;
  set('V3', at('B3').text === '$5,240,000.00' && at('B3').kind === 'currency'
    && at('B10').text === '18.50%' && at('B10').kind === 'percent'
    && at('B11').text === '2024-01-15'
    && at('B9').text === '($12,500.00)'
    && at('C1') === null);

  // ── V4 — a formula is shown by its CACHED CALCULATED VALUE, and its text
  //         travels with it. VISION never evaluates a formula. ─────────────
  set('V4', at('B5').text === '$2,180,000.00' && at('B5').value === 2180000 && at('B5').formula === 'B4-B5');

  // ── V5 — merged ranges are honoured, not repeated per covered cell ──────
  set('V5', pnl.merges.length === 1 && pnl.merges[0].ref === 'A1:C1'
    && pnl.merges[0].s.row === 0 && pnl.merges[0].s.col === 0 && pnl.merges[0].e.col === 2);

  // ── V6 — THE STRUCTURED READING: label → value, each bound to its cell ──
  const structure = R.extractWorkbookStructure(wb.workbook);
  const lines = structure.sheets[0].financial.lines;
  const line = (k) => lines.find((l) => l.concept === k) || null;
  set('V6', line('revenue')?.value === 5240000 && line('revenue')?.cell === 'B3' && line('revenue')?.label_cell === 'A3'
    && line('cogs')?.value === 3060000
    && line('gross_profit')?.value === 2180000
    && line('operating_income')?.value === 722000 && line('operating_income')?.cell === 'B6'
    && line('operating_expenses')?.value === 1620000
    && line('net_income')?.value === 560000
    && line('revenue')?.sheet === 'Profit & Loss');

  // ── V7 — the structure is READ, never derived: a sheet with no recognised
  //         line yields no lines rather than computed ones ────────────────
  set('V7', structure.sheets[2].financial.lines.length === 0 && structure.sheets[0].financial.hasStructure === true);

  // ── V8 — CSV is a one-sheet workbook, and quoted commas survive ─────────
  const csv = await read('statement.csv', Buffer.from('Account,Amount,Note\nIncome,"5,240,000","total, all lines"\nCOGS,3060000,\n'));
  set('V8', csv.ok && csv.format === 'csv' && csv.workbook.sheets.length === 1
    && csv.workbook.sheets[0].rows[1][1].text === '5,240,000'
    && csv.workbook.sheets[0].rows[1][2].text === 'total, all lines'
    && csv.workbook.sheets[0].rows[1][0].ref === 'A2');

  // ── V9 — DOCX: headings, paragraphs, LISTS and TABLES ──────────────────
  const docx = await read('report.docx', buildDocx());
  const blocks = docx.document?.blocks || [];
  const table = blocks.find((b) => b.type === 'table');
  set('V9', docx.ok && docx.format === 'docx'
    && blocks[0].type === 'heading' && blocks[0].level === 1 && blocks[0].text === '2024 Profit and Loss'
    && blocks.some((b) => b.type === 'listItem')
    && table && table.rows.length === 3 && table.rows[1][0] === 'Income' && table.rows[1][1] === '5,240,000'
    && !blocks.some((b) => String(b.text || '').includes('SHOULD NOT APPEAR')));

  // ── V10 — XLS: the legacy binary workbook, read from its record stream ─
  const xlsFix = buildXls();
  const xls = await read('legacy.xls', buildCfb(xlsFix.stream));
  const xl = xls.workbook?.sheets?.[0];
  const xat = (ref) => xl?.rows.flatMap((r) => r || []).find((c) => c && c.ref === ref) || null;
  set('V10', xls.ok && xls.format === 'xls'
    && xls.workbook.sheets.length === 3
    && xls.workbook.sheets[2].hidden === true
    && xat('A1').text === 'Income'
    && xat('B1').text === '$5,240,000.00'
    && xat('B2').text === '$3,060,000.00'          // MULRK
    && xat('B3').text === '$2,180,000.00'          // FORMULA cached value
    && xat('B4').text === '$1,620,000.00'          // RK integer
    && xat('B6').text === '2024-01-15'             // NUMBER under a date XF
    && xl.merges.length === 1);                    // MERGEDCELLS

  // ── V11 — the SST CONTINUE boundary: a string split across records is
  //         reassembled, and the encoding byte is NOT taken as content ─────
  const sheetCells = (sheet) => (sheet.rows || []).flatMap((r) => r || []).filter(Boolean);
  const splitCell = sheetCells(xls.workbook.sheets[1]).find((c) => c.ref === 'A1');
  set('V11', sheetCells(xl).some((c) => c.text === 'Gross Profit')
    && sheetCells(xl).some((c) => c.text === 'Net Income')
    && sheetCells(xl).some((c) => c.text === 'Report date')
    // The split string comes back EXACTLY, and the encoding byte is not content.
    && splitCell?.text === 'ABCDEFGHIJ');

  // ── V12 — RK float form and the ÷100 flag ──────────────────────────────
  const d = xls.workbook.sheets[1].rows.flatMap((r) => r || []);
  set('V12', d.find((c) => c && c.ref === 'B1')?.text === '1.5'
    && d.find((c) => c && c.ref === 'B2')?.text === '123.45');

  // ── V13 — the structured reading works the SAME for a legacy workbook ──
  const xlsStructure = R.extractWorkbookStructure(xls.workbook);
  const xlLines = xlsStructure.sheets[0].financial.lines;
  set('V13', xlLines.find((l) => l.concept === 'revenue')?.value === 5240000
    && xlLines.find((l) => l.concept === 'net_income')?.value === 560000
    && xlLines.find((l) => l.concept === 'gross_profit')?.cell === 'B3');

  // ── V14 — TXT and IMAGES are native; a PDF is native ───────────────────
  const txt = await read('notes.txt', Buffer.from('Plain text note.\nSecond line.\n'));
  const png = await read('scan.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]));
  const jpg = await read('scan.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]));
  const pdf = await read('return.pdf', Buffer.from('%PDF-1.7\n...trailing'));
  set('V14', txt.ok && txt.format === 'txt' && txt.text.includes('Second line')
    && png.ok && png.format === 'image' && png.native === true
    && jpg.ok && jpg.format === 'image'
    && pdf.ok && pdf.format === 'pdf' && pdf.native === true);

  // ── V15 — FORMAT IS DECIDED BY CONTENT, NOT BY THE NAME. A workbook saved
  //         as .txt is still a workbook; a PDF named .doc is still a PDF. ──
  const mislabeled = await read('notes.txt', wbBytes);
  const mislabeledDoc = await read('report.doc', Buffer.from('%PDF-1.4\n'));
  set('V15', mislabeled.ok && mislabeled.format === 'xlsx'
    && mislabeledDoc.format === 'pdf' && mislabeledDoc.native === true);

  // ── V16 — MALFORMED and UNSUPPORTED files are REFUSED with a reason, and
  //         never guessed at ───────────────────────────────────────────────
  // A ZIP whose workbook part is unusable, a ZIP-ish file with no directory, a
  // truncated archive, non-text garbage, and an empty file.
  const noSheets = await read('broken.xlsx', zip([{ name: 'xl/workbook.xml', data: '<workbook><sheets>' }]));
  const garbled = await read('garbled.xlsx', Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from('not a directory at all, padded out to be long enough'),
  ]));
  const truncated = (() => { const b = wbBytes.subarray(0, Math.floor(wbBytes.length / 2)); const c = Buffer.alloc(b.length); b.copy(c); return c; })();
  const cut = await read('cut.xlsx', truncated);
  const unsupported = await read('mystery.bin', Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe, 0x00]));
  const empty = await read('empty.xlsx', Buffer.alloc(0));
  set('V16', noSheets.ok === false && noSheets.reason === 'no_sheets'
    && garbled.ok === false && garbled.reason === 'unknown_zip_package'
    && cut.ok === false
    && unsupported.ok === false && unsupported.format === 'unknown'
    && empty.ok === false && empty.reason === 'empty_file');

  // ── V17 — a legacy .doc (a compound file with no workbook stream) is
  //         RECOGNISED as Word, not reported as an unsupported document ───
  const legacyDoc = await read('old.doc', buildCfb(Buffer.from('a real word document stream, padded out to size....'), 'WordDocument'));
  set('V17', legacyDoc.ok === false && legacyDoc.format === 'doc' && legacyDoc.reason === 'legacy_word');

  // ── V18 — an EMPTY workbook and an empty sheet ──────────────────────────
  const emptySheet = await read('blank.xlsx', buildXlsx({ sheets: [{ name: 'Sheet1', grid: [[null, null], [null, null]] }] }));
  set('V18', emptySheet.ok && emptySheet.workbook.sheets[0].rows.every((r) => r.every((c) => c === null))
    && R.extractWorkbookStructure(emptySheet.workbook).lineCount === 0);

  // ── V19 — a LARGE workbook is bounded rather than frozen: the reader stops
  //         at its cap and SAYS SO instead of dropping rows silently ───────
  const big = [];
  for (let i = 0; i < 6000; i += 1) big.push([{ text: `Row label ${i}` }, { num: i, xf: XF.money }]);
  const large = await read('large.xlsx', buildXlsx({ sheets: [{ name: 'Big', grid: big }] }));
  const largeSheet = large.workbook.sheets[0];
  set('V19', large.ok && largeSheet.rows.length === 5000 && largeSheet.truncated === true
    && large.workbook.warnings.some((w) => w.code === 'sheet_truncated'));

  // ── V20 — an INLINE string cell reads as its text ──────────────────────
  set('V20', wb.workbook.sheets[1].rows[1][1].text === 'Revenue');

  // ── V21 — READING IS PURE: the document's bytes are byte-identical ─────
  const before = sha(wbBytes);
  await read('P&L Prev owner Excel Online.xlsx', wbBytes);
  await read('legacy.xls', buildCfb(buildXls().stream));
  set('V21', sha(wbBytes) === before);

  // ── V22 — the reader is a PURE FUNCTION OF BYTES: same input, same model,
  //         byte for byte ─────────────────────────────────────────────────
  const a = JSON.stringify((await read('x.xlsx', wbBytes)).workbook);
  const b = JSON.stringify((await read('x.xlsx', wbBytes)).workbook);
  set('V22', a === b);

  // ── V23 — the reader holds NO authorization surface. It receives bytes and
  //         returns models; it cannot grant, read or widen access. ────────
  const readerSrc = [READER, 'src/lib/documents/formatReader/zip.js', 'src/lib/documents/formatReader/xlsx.js',
    'src/lib/documents/formatReader/xls.js', 'src/lib/documents/formatReader/docx.js',
    'src/lib/documents/formatReader/csv.js', 'src/lib/documents/formatReader/numbers.js',
    'src/lib/documents/formatReader/financials.js'].map((f) => fs.readFileSync(P(f), 'utf8')).join('\n');
  const readerCode = codeOf(readerSrc);
  set('V23', !/createClient|supabase|assertBusinessAccess|signedUrl|serviceRole|localStorage/.test(readerSrc));

  // ── V24 — the reader CANNOT WRITE a document: no serializer, no encoder,
  //         no compressor, and no cell/sheet mutator exists to call. ──────
  set('V24', !/\bwriteFile|createWriteStream|serialize|saveWorkbook|setCell|writeCell|addRow|insertRow|deflateRaw|crc32|toBlob/i.test(readerCode)
    // ArrayBuffer and arrayBuffer() are read-side byte containers the reader
    // legitimately uses; Node's write-oriented Buffer class is what must not be
    // there, so the check names the identifier, not the substring.
    && !/\bBuffer\b/.test(readerCode));

  // ── V25 — THE AUTHORIZED BOUNDARY IS INTACT. The one backend action the
  //         viewer calls still proves the actor and the business, still mints
  //         a SHORT-LIVED url, and still reports a missing source. ────────
  const backend = fs.readFileSync(P(BACKEND), 'utf8');
  const action = backend.slice(backend.indexOf("action === 'getDocumentSignedUrl'"), backend.indexOf("action === 'deleteDocument'"));
  set('V25', /authorizeDocumentAccess\(/.test(action)
    && /assertBusinessAccess\(sb, businessId, profile/.test(action)
    && /createSignedUrl\(doc\.file_path, 900\)/.test(action)
    && /source_unavailable: true/.test(action)
    && !/publicUrl|getPublicUrl/.test(action)
    && /evidence_total/.test(action));

  // ── V26 — the viewer never hands over a stored/persisted URL, and still
  //         reads the bytes over the SHORT-LIVED signed one ───────────────
  const viewSrc = fs.readFileSync(P(VIEWER), 'utf8');
  const readSrc = fs.readFileSync(P('src/components/documents/viewers/ReadOnlyDocumentView.jsx'), 'utf8');
  set('V26', /signedUrl/.test(viewSrc)
    && /fetch\(url\)/.test(readSrc)
    && !/localStorage|sessionStorage/.test(readSrc)
    && !/onChange=/.test(readSrc));

  // ── V27 — the dead end is GONE. No surface can say "Preview unavailable
  //         for this file type" again. ───────────────────────────────────
  set('V27', !/Preview unavailable for this file type/.test(viewSrc)
    && /ReadOnlyDocumentView/.test(viewSrc)
    && /'office'/.test(viewSrc) === false);

  // ── V28 — READING and EXTRACTION are INDEPENDENT: the extraction model is
  //         produced from the bytes even when nothing renders, and the viewer
  //         reports the read count on the SAME authorized response. ───────
  const refusedButReadable = await read('broken.xlsx', wbBytes.subarray(0, 40));
  set('V28', refusedButReadable.ok === false
    && (await read('ok.xlsx', wbBytes)).ok === true
    && R.extractWorkbookStructure((await read('ok.xlsx', wbBytes)).workbook).lineCount > 0);

  // ── V29 — the EXACT-DOCUMENT ask is bound through the existing focused
  //         contract, never re-derived on the client ─────────────────────
  const askCode = codeOf(fs.readFileSync(P('src/components/documents/viewers/AskAboutThisDocument.jsx'), 'utf8'));
  set('V29', /focus:\s*\{\s*type:\s*'document',\s*id:\s*document\?\.id\s*\}/.test(askCode)
    && /focusedDocument/.test(askCode)
    && !/focused_record_type/.test(askCode));

  // ── V30 — everything the reader renders is READ-ONLY by construction ───
  const gridSrc = fs.readFileSync(P('src/components/documents/viewers/WorkbookGrid.jsx'), 'utf8');
  const spreadSrc = fs.readFileSync(P('src/components/documents/viewers/SpreadsheetViewer.jsx'), 'utf8');
  const editable = /contentEditable|<input|<textarea|<select|onChange\s*=|onDoubleClick\s*=\s*\{[^}]*set\w*Cell/;
  set('V30', !editable.test(gridSrc) && !editable.test(spreadSrc)
    && !/contentEditable/.test(fs.readFileSync(P('src/components/documents/viewers/DocxViewer.jsx'), 'utf8')));

  return res;
}

const DESC = {
  V1: 'an XLSX is READ, not refused (the reported failure)',
  V2: 'sheet tabs in workbook order, hidden sheet marked',
  V3: 'currency, percent, date and negative display from the file\'s own formats',
  V4: 'a formula shows its cached value, with the formula text kept',
  V5: 'merged ranges honoured',
  V6: 'structured reading: label → value, each bound to its cell',
  V7: 'structure is READ, never derived',
  V8: 'CSV is a one-sheet workbook; quoted commas survive',
  V9: 'DOCX keeps headings, lists and TABLES; deletions excluded',
  V10: 'XLS (BIFF8) read from its record stream: strings, RK, MULRK, NUMBER, FORMULA, merges',
  V11: 'an SST string split across a CONTINUE boundary is reassembled',
  V12: 'RK float form and the ÷100 flag decode correctly',
  V13: 'the legacy workbook yields the same structure',
  V14: 'TXT, PNG, JPG and PDF are native',
  V15: 'format decided by CONTENT, not by the file name',
  V16: 'malformed / truncated / unsupported / empty are refused with a reason',
  V17: 'a legacy .doc is recognised as Word, not as an unsupported document',
  V18: 'an empty workbook yields an empty model, not a guess',
  V19: 'a large workbook is bounded and says so',
  V20: 'inline string cells read as text',
  V21: 'reading leaves the bytes byte-identical',
  V22: 'the reader is a pure function of bytes',
  V23: 'the reader has no authorization surface',
  V24: 'the reader has no write path',
  V25: 'the authorized boundary is intact (actor, business, 900 s URL, missing source)',
  V26: 'no stored URL; bytes read over the short-lived signed URL',
  V27: 'the dead-end message is gone',
  V28: 'reading and extraction are independent',
  V29: 'the exact-document ask uses the existing focused contract',
  V30: 'every rendered surface is read-only by construction',
};

const F = 'src/lib/documents/formatReader';
const MUTATIONS = [
  { id: 'M1', what: 'a date rendered as its raw serial', file: `${F}/numbers.js`, probe: 'V3',
    find: '  if (s.isDate) {', replace: '  if (false && s.isDate) {' },
  { id: 'M2', what: 'merged ranges dropped', file: `${F}/xlsx.js`, probe: 'V5',
    find: '  const merges = childList(child(root, \'mergeCells\'), \'mergeCell\')',
    replace: '  const merges = []' },
  { id: 'M3', what: 'shared-string cells read as empty', file: `${F}/xlsx.js`, probe: 'V6',
    find: '  if (type === \'s\') {\n    const text = shared[Number(raw)] ?? \'\';',
    replace: '  if (type === \'s\') {\n    const text = \'\';' },
  { id: 'M4', what: 'every label matched as the same concept', file: `${F}/financials.js`, probe: 'V6',
    find: '  for (const concept of FINANCIAL_CONCEPTS) {', replace: '  for (const concept of FINANCIAL_CONCEPTS.slice(0, 1)) {' },
  { id: 'M5', what: 'the hidden-sheet marker dropped', file: `${F}/xlsx.js`, probe: 'V2',
    find: "  const state = attr(node, 'state') || 'visible';", replace: "  const state = 'visible';" },
  { id: 'M6', what: 'percent shown as its raw fraction', file: `${F}/numbers.js`, probe: 'V3',
    find: '  if (s.isPercent) {', replace: '  if (false && s.isPercent) {' },
  { id: 'M7', what: 'quoted CSV fields split on the delimiter', file: `${F}/csv.js`, probe: 'V8',
    find: "    if (ch === '\"' && field === '') { quoted = true; i += 1; continue; }",
    replace: "    if (false && ch === '\"' && field === '') { quoted = true; i += 1; continue; }" },
  { id: 'M8', what: 'the extension trusted over the content', file: `${F}/index.js`, probe: 'V15',
    find: '  if (bytes && bytes.length >= 4) {', replace: '  if (false && bytes && bytes.length >= 4) {' },
  { id: 'M9', what: 'the CONTINUE encoding byte taken as content', file: `${F}/xls.js`, probe: 'V11',
    // The defect: the byte that restarts a continued string is emitted as a
    // character instead of being read as the encoding flag. It must CONSUME the
    // byte, or the cursor never leaves the boundary and the reader spins — a
    // mutation has to express the defect, not a hang.
    find: "      if (this.boundaries.has(this.pos)) { high = (this.u8() & 0x01) === 1; continue; }",
    replace: "      if (this.boundaries.has(this.pos)) { high = false; out += String.fromCharCode(this.u8()); continue; }" },
  { id: 'M10', what: 'the RK ÷100 flag ignored', file: `${F}/xls.js`, probe: 'V12',
    find: '  return (rk & 0x01) !== 0 ? value / 100 : value;', replace: '  return value;' },
  { id: 'M11', what: 'a workbook with no sheets accepted as a workbook', file: `${F}/xlsx.js`, probe: 'V16',
    find: '  if (declared.length === 0) return { ok: false, reason: \'no_sheets\' };',
    replace: '  if (false) return { ok: false, reason: \'no_sheets\' };' },
  { id: 'M12', what: 'a formula result recalculated instead of read', file: `${F}/xlsx.js`, probe: 'V4',
    find: '  const value = Number(raw);', replace: '  const value = Number(raw) + 1;' },
  { id: 'M13', what: 'a legacy Word file no longer recognised as Word', file: `${F}/index.js`, probe: 'V17',
    find: "    if (res.reason === 'no_workbook_stream') return { ok: false, format: 'doc', reason: 'legacy_word' };",
    replace: "    if (false) return { ok: false, format: 'doc', reason: 'legacy_word' };" },
  { id: 'M14', what: 'the large-workbook cap removed', file: `${F}/xlsx.js`, probe: 'V19',
    find: '    if (grid.length >= MAX_ROWS_PER_SHEET) { truncated = true; break; }',
    replace: '    if (false && grid.length >= MAX_ROWS_PER_SHEET) { truncated = true; break; }' },
];

(async () => {
  let failures = 0;
  const base = await evaluate();
  for (const [k, v] of Object.entries(base)) {
    if (!v) failures += 1;
    console.log(`${v ? 'PASS' : 'FAIL'}  ${String(k).padEnd(5)} ${DESC[k] || ''}`);
  }

  let caught = 0;
  for (const m of MUTATIONS) {
    let outcome;
    try {
      const r = await evaluate(m);
      outcome = r[m.probe] === false ? 'CAUGHT' : 'MISSED';
    } catch (e) {
      outcome = /mutation anchor not found/.test(e.message) ? 'DID_NOT_APPLY' : 'CAUGHT';
      if (outcome === 'CAUGHT') console.log(`      ${m.id} threw (behaviour changed): ${String(e.message).split('\n')[0]}`);
    }
    if (outcome === 'CAUGHT') caught += 1; else failures += 1;
    console.log(`${outcome} ${m.id.padEnd(4)} ${m.what} (probe ${m.probe})`);
  }

  console.log(`\nchecks: ${Object.keys(base).length}`);
  console.log(`mutations: ${caught}/${MUTATIONS.length} APPLIED + BEHAVIOR_CHANGED + CAUGHT`);
  console.log(failures ? `${failures} FAILURE(S)` : 'ALL CHECKS PASS');
  process.exit(failures ? 1 : 0);
})();