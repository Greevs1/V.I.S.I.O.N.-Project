/**
 * xls.js — read-only legacy Excel (BIFF8) → the SAME workbook view model.
 *
 * A legacy .xls is a binary OLE compound file holding a "Workbook" stream of
 * BIFF records. This reads it and stops: there is no writer here, and none is
 * reachable.
 *
 * SCOPE, STATED HONESTLY: this reads the VALUE-BEARING record set — shared
 * strings, numbers, RK-encoded numbers, cached formula results, booleans, errors
 * and merged ranges — plus each cell's number format so dates, currencies and
 * percentages display as such. It does not read fonts, fills, borders, column
 * widths or comments, none of which carry evidence. A file it cannot read with
 * confidence is REFUSED with a reason rather than rendered approximately: a
 * spreadsheet reader that invents a number is worse than one that says it
 * cannot read the file.
 */

import { analyzeFormatCode, formatCellValue, builtinFormatCode } from './numbers.js';
import { columnLetters } from './csv.js';
import { MAX_ROWS_PER_SHEET, MAX_COLS_PER_SHEET } from './xlsx.js';

const CFB_SIG = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const FREESECT = 0xffffffff;
const ENDOFCHAIN = 0xfffffffe;

const R = {
  BOF: 0x0809, EOF: 0x000a, BOUNDSHEET: 0x0085, SST: 0x00fc, CONTINUE: 0x003c,
  XF: 0x00e0, FORMAT: 0x041e, DATEMODE: 0x0022, MERGEDCELLS: 0x00e5,
  LABELSST: 0x00fd, LABEL: 0x0204, RK: 0x027e, MULRK: 0x00bd, NUMBER: 0x0203,
  FORMULA: 0x0006, STRING: 0x0207, BOOLERR: 0x0205,
};

export function readXls(bytes) {
  const cfb = readCompoundFile(bytes);
  if (!cfb.ok) return { ok: false, reason: cfb.reason };

  const stream = cfb.streams.Workbook || cfb.streams.Book || null;
  if (!stream) return { ok: false, reason: 'no_workbook_stream' };

  const records = walkRecords(stream);
  const globals = records.findIndex((r) => r.type === R.BOF);
  if (globals < 0) return { ok: false, reason: 'no_biff_stream' };
  const version = records[globals].data.length >= 2
    ? records[globals].data[0] | (records[globals].data[1] << 8)
    : 0;
  if (version !== 0x0600) return { ok: false, reason: version === 0x0500 ? 'biff5_not_supported' : 'unsupported_biff_version' };

  const sharedStrings = readSst(records);
  const formats = readFormats(records);
  const xfs = readXfs(records, formats);
  const date1904 = readDateMode(records);
  const bounds = readBoundsheets(records);
  if (bounds.length === 0) return { ok: false, reason: 'no_sheets' };

  const warnings = [];
  const sheets = bounds.map((bound, index) => {
    const hidden = bound.visibility !== 0;
    if (!bound.offset || bound.offset >= stream.length) {
      warnings.push({ code: 'sheet_unreadable', sheet: bound.name });
      return { name: bound.name, index, hidden, rows: [], merges: [], widths: [], truncated: false, unreadable: true };
    }
    return { name: bound.name, index, hidden, ...readSheetRecords(stream, bound.offset, { sharedStrings, xfs, date1904, warnings }) };
  });

  return { ok: true, format: 'xls', sheets, warnings, date1904 };
}

// ── Compound file (OLE2) ─────────────────────────────────────────────────────

function readCompoundFile(bytes) {
  if (bytes.length < 512) return { ok: false, reason: 'not_cfb' };
  for (let i = 0; i < 8; i += 1) if (bytes[i] !== CFB_SIG[i]) return { ok: false, reason: 'not_cfb' };

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sectorSize = 1 << view.getUint16(30, true);
  const miniSectorSize = 1 << view.getUint16(32, true);
  const firstDir = view.getUint32(48, true);
  const miniCutoff = view.getUint32(56, true) || 4096;
  const firstMiniFat = view.getUint32(60, true);
  const totalMiniFat = view.getUint32(64, true);
  const firstDifat = view.getUint32(68, true);
  const totalDifat = view.getUint32(72, true);
  if (sectorSize < 128 || sectorSize > 65536) return { ok: false, reason: 'bad_sector_size' };

  const sectorOffset = (id) => (id + 1) * sectorSize;
  const perSector = sectorSize / 4;

  // DIFAT → FAT sector ids
  const fatSectors = [];
  for (let i = 0; i < 109; i += 1) {
    const id = view.getUint32(76 + i * 4, true);
    if (id !== FREESECT) fatSectors.push(id);
  }
  let difat = firstDifat;
  for (let n = 0; n < totalDifat && difat !== ENDOFCHAIN && difat !== FREESECT; n += 1) {
    const base = sectorOffset(difat);
    if (base + sectorSize > bytes.length) break;
    for (let i = 0; i < perSector - 1; i += 1) {
      const id = view.getUint32(base + i * 4, true);
      if (id !== FREESECT) fatSectors.push(id);
    }
    difat = view.getUint32(base + (perSector - 1) * 4, true);
  }

  const fat = [];
  for (const id of fatSectors) {
    const base = sectorOffset(id);
    if (base + sectorSize > bytes.length) continue;
    for (let i = 0; i < perSector; i += 1) fat.push(view.getUint32(base + i * 4, true));
  }

  const chain = (start, table = fat) => {
    const out = [];
    let id = start;
    let guard = 0;
    while (id !== ENDOFCHAIN && id !== FREESECT && id < table.length && guard < 1e6) {
      out.push(id); id = table[id]; guard += 1;
    }
    return out;
  };

  const readChain = (start) => {
    const ids = chain(start);
    const out = new Uint8Array(ids.length * sectorSize);
    ids.forEach((id, i) => {
      const base = sectorOffset(id);
      out.set(bytes.subarray(base, base + sectorSize), i * sectorSize);
    });
    return out;
  };

  const dirBytes = readChain(firstDir);
  const entries = [];
  for (let off = 0; off + 128 <= dirBytes.length; off += 128) {
    const nameLen = dirBytes[off + 64] | (dirBytes[off + 65] << 8);
    const type = dirBytes[off + 66];
    if (type === 0) continue;
    let name = '';
    for (let i = 0; i < Math.max(0, nameLen - 2); i += 2) name += String.fromCharCode(dirBytes[off + i] | (dirBytes[off + i + 1] << 8));
    const dview = new DataView(dirBytes.buffer, dirBytes.byteOffset + off, 128);
    entries.push({ name, type, start: dview.getUint32(116, true), size: dview.getUint32(120, true) });
  }
  if (entries.length === 0) return { ok: false, reason: 'no_directory' };

  const root = entries.find((e) => e.type === 5);
  const miniStream = root && root.start !== ENDOFCHAIN ? readChain(root.start) : new Uint8Array(0);
  const miniFatIds = totalMiniFat > 0 && firstMiniFat !== ENDOFCHAIN ? readChain(firstMiniFat) : new Uint8Array(0);
  const miniFat = [];
  const miniView = new DataView(miniFatIds.buffer, miniFatIds.byteOffset, miniFatIds.length);
  for (let i = 0; i + 4 <= miniFatIds.length; i += 4) miniFat.push(miniView.getUint32(i, true));

  const streams = {};
  for (const e of entries) {
    if (e.type !== 2 || !e.name || e.size === 0) continue;
    if (e.size < miniCutoff) {
      const ids = chain(e.start, miniFat);
      const out = new Uint8Array(ids.length * miniSectorSize);
      ids.forEach((id, i) => out.set(miniStream.subarray(id * miniSectorSize, (id + 1) * miniSectorSize), i * miniSectorSize));
      streams[e.name] = out.subarray(0, Math.min(e.size, out.length));
    } else {
      streams[e.name] = readChain(e.start).subarray(0, e.size);
    }
  }
  return { ok: true, streams };
}

// ── BIFF records ─────────────────────────────────────────────────────────────

function walkRecords(stream) {
  const out = [];
  let p = 0;
  while (p + 4 <= stream.length) {
    const type = stream[p] | (stream[p + 1] << 8);
    const len = stream[p + 2] | (stream[p + 3] << 8);
    const start = p + 4;
    if (start + len > stream.length) break;
    out.push({ type, offset: start, data: stream.subarray(start, start + len) });
    p = start + len;
  }
  return out;
}

/** SST, with CONTINUE blocks stitched back together at recorded boundaries. */
function readSst(records) {
  const at = records.findIndex((r) => r.type === R.SST);
  if (at < 0) return [];
  const blocks = [records[at].data];
  const boundaries = [];
  let total = records[at].data.length;
  for (let i = at + 1; i < records.length && records[i].type === R.CONTINUE; i += 1) {
    boundaries.push(total);
    blocks.push(records[i].data);
    total += records[i].data.length;
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const b of blocks) { buf.set(b, off); off += b.length; }

  // The strings begin AFTER the record's own 8-byte header (cstTotal, cstUnique).
  // Reading from byte 0 would parse that header as the first string and every
  // label in the workbook would come out as the header's bytes.
  const cur = new SstCursor(buf, new Set(boundaries), 8);
  const unique = u32(records[at].data, 4);
  const out = [];
  for (let i = 0; i < unique && cur.pos < buf.length; i += 1) out.push(cur.readString());
  return out;
}

class SstCursor {
  constructor(buf, boundaries, start = 0) { this.buf = buf; this.boundaries = boundaries; this.pos = start; }
  u8() { return this.buf[this.pos++]; }
  u16() { const v = this.buf[this.pos] | (this.buf[this.pos + 1] << 8); this.pos += 2; return v; }
  u32() { const v = u32(this.buf, this.pos); this.pos += 4; return v; }
  skip(n) { this.pos += n; }
  readString() {
    const cch = this.u16();
    let grbit = this.u8();
    let richRuns = 0;
    let extSize = 0;
    if (grbit & 0x08) richRuns = this.u16();
    if (grbit & 0x04) extSize = this.u32();
    let high = (grbit & 0x01) === 1;
    let out = '';
    let remaining = cch;
    while (remaining > 0 && this.pos < this.buf.length) {
      // A continued string restarts with one encoding byte.
      if (this.boundaries.has(this.pos)) { high = (this.u8() & 0x01) === 1; continue; }
      out += high ? String.fromCharCode(this.u16()) : String.fromCharCode(this.u8());
      remaining -= 1;
    }
    this.skip(richRuns * 4 + extSize);
    return out;
  }
}

function readFormats(records) {
  const out = {};
  for (const r of records) {
    if (r.type !== R.FORMAT) continue;
    const id = u16(r.data, 0);
    out[id] = readUnicodeString(r.data, 2);
  }
  return out;
}

function readXfs(records, formats) {
  const out = [];
  for (const r of records) {
    if (r.type !== R.XF) continue;
    const ifmt = u16(r.data, 2);
    out.push(analyzeFormatCode(formats[ifmt] != null ? formats[ifmt] : builtinFormatCode(ifmt), ifmt));
  }
  return out;
}

function readDateMode(records) {
  const r = records.find((x) => x.type === R.DATEMODE);
  return r ? u16(r.data, 0) === 1 : false;
}

function readBoundsheets(records) {
  return records.filter((r) => r.type === R.BOUNDSHEET).map((r) => ({
    offset: u32(r.data, 0),
    visibility: r.data[4] & 0x03,
    name: r.data[6] & 0x01 ? utf16(r.data, 7, r.data[5]) : latin1(r.data, 7, r.data[5]),
  }));
}

function readSheetRecords(stream, offset, { sharedStrings, xfs, date1904, warnings }) {
  const records = walkRecords(stream.subarray(offset));
  const cells = [];
  const merges = [];
  let maxRow = 0;
  let maxCol = 0;
  let lastFormulaRow = -1;
  let lastFormulaCol = -1;

  for (const r of records) {
    if (r.type === R.EOF) break;
    const d = r.data;
    if (r.type === R.LABELSST) {
      place(cells, u16(d, 0), u16(d, 2), { text: sharedStrings[u32(d, 6)] ?? '', value: null, kind: 'text' });
    } else if (r.type === R.LABEL) {
      place(cells, u16(d, 0), u16(d, 2), { text: readUnicodeString(d, 6), value: null, kind: 'text' });
    } else if (r.type === R.RK) {
      place(cells, u16(d, 0), u16(d, 2), numeric(decodeRk(u32(d, 6)), xfs[u16(d, 4)], date1904));
    } else if (r.type === R.MULRK) {
      const row = u16(d, 0);
      const colFirst = u16(d, 2);
      const count = Math.max(0, (d.length - 6) / 6);
      for (let i = 0; i < count; i += 1) {
        place(cells, row, colFirst + i, numeric(decodeRk(u32(d, 4 + i * 6 + 2)), xfs[u16(d, 4 + i * 6)], date1904));
      }
    } else if (r.type === R.NUMBER) {
      place(cells, u16(d, 0), u16(d, 2), numeric(f64(d, 6), xfs[u16(d, 4)], date1904));
    } else if (r.type === R.BOOLERR) {
      const isError = d[7] === 1;
      place(cells, u16(d, 0), u16(d, 2), isError
        ? { text: '#ERROR', value: null, kind: 'error' }
        : { text: d[6] ? 'TRUE' : 'FALSE', value: Boolean(d[6]), kind: 'boolean' });
    } else if (r.type === R.FORMULA) {
      const row = u16(d, 0);
      const col = u16(d, 2);
      lastFormulaRow = row; lastFormulaCol = col;
      const special = d[12] === 0xff && d[13] === 0xff;
      if (!special) place(cells, row, col, numeric(f64(d, 6), xfs[u16(d, 4)], date1904));
      else if (d[6] === 0) place(cells, row, col, { text: '', value: null, kind: 'empty' }); // STRING record follows
      else if (d[6] === 1) place(cells, row, col, { text: d[8] ? 'TRUE' : 'FALSE', value: Boolean(d[8]), kind: 'boolean' });
      else if (d[6] === 3) place(cells, row, col, { text: '', value: null, kind: 'empty' });
    } else if (r.type === R.STRING) {
      place(cells, lastFormulaRow, lastFormulaCol, { text: readUnicodeString(d, 0), value: null, kind: 'text' });
    } else if (r.type === R.MERGEDCELLS) {
      const count = u16(d, 0);
      for (let i = 0; i < count; i += 1) {
        const base = 2 + i * 8;
        const r1 = u16(d, base); const r2 = u16(d, base + 2);
        const c1 = u16(d, base + 4); const c2 = u16(d, base + 6);
        merges.push({
          ref: `${columnLetters(c1 + 1)}${r1 + 1}:${columnLetters(c2 + 1)}${r2 + 1}`,
          s: { row: r1, col: c1 },
          e: { row: r2, col: c2 },
        });
      }
    }
  }

  for (const key of Object.keys(cells)) {
    const row = Math.floor(Number(key) / 1000);
    const col = Number(key) % 1000;
    maxRow = Math.max(maxRow, row);
    maxCol = Math.max(maxCol, col);
  }
  const height = Math.min(maxRow + 1, MAX_ROWS_PER_SHEET);
  const width = Math.min(maxCol + 1, MAX_COLS_PER_SHEET);
  const truncated = maxRow + 1 > height || maxCol + 1 > width;
  if (truncated) warnings.push({ code: 'sheet_truncated', rows: MAX_ROWS_PER_SHEET, cols: MAX_COLS_PER_SHEET });

  const rows = [];
  for (let r = 0; r < height; r += 1) {
    const row = new Array(width);
    for (let c = 0; c < width; c += 1) {
      const cell = cells[r * 1000 + c] || null;
      row[c] = cell ? { ...cell, row: r + 1, col: c + 1, ref: `${columnLetters(c + 1)}${r + 1}` } : null;
    }
    rows.push(row);
  }
  return { rows, merges, widths: [], truncated };
}

function place(cells, rowZero, colZero, cell) {
  if (rowZero >= MAX_ROWS_PER_SHEET || colZero >= MAX_COLS_PER_SHEET) return;
  cells[rowZero * 1000 + colZero] = cell;
}

function numeric(value, style, date1904) {
  if (!Number.isFinite(value)) return { text: '', value: null, kind: 'empty' };
  const shown = formatCellValue(value, style ? { ...style, date1904 } : null);
  return { ...shown, value };
}

function decodeRk(rk) {
  const isInt = (rk & 0x02) !== 0;
  let value;
  if (isInt) {
    value = rk >> 2; // signed 30-bit
  } else {
    const dv = new DataView(new ArrayBuffer(8));
    dv.setUint32(4, rk & 0xfffffffc, true);
    value = dv.getFloat64(0, true);
  }
  return (rk & 0x01) !== 0 ? value / 100 : value;
}

/** An XLUnicodeString: cch (u16), grbit (u8), then 8- or 16-bit characters. */
function readUnicodeString(data, offset) {
  if (offset + 3 > data.length) return '';
  const cch = u16(data, offset);
  const grbit = data[offset + 2];
  const high = (grbit & 0x01) === 1;
  const start = offset + 3;
  return high ? utf16(data, start, cch) : latin1(data, start, cch);
}

function u16(d, o) { return d[o] | (d[o + 1] << 8); }
function u32(d, o) { return (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0; }
function f64(d, o) { const v = new DataView(d.buffer, d.byteOffset + o, 8); return v.getFloat64(0, true); }
function latin1(d, o, n) { let s = ''; for (let i = 0; i < n; i += 1) s += String.fromCharCode(d[o + i] || 0); return s; }
function utf16(d, o, n) { let s = ''; for (let i = 0; i < n; i += 1) s += String.fromCharCode((d[o + i * 2] || 0) | ((d[o + i * 2 + 1] || 0) << 8)); return s; }