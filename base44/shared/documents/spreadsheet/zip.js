/**
 * zip.js — a READ-ONLY ZIP reader, for VISION's format readers.
 *
 * XLSX and DOCX are ZIP containers. This reads them and nothing else: there is
 * no writer here, and none is reachable.
 *
 * It reads only the CENTRAL DIRECTORY, which is the authoritative index: the
 * sizes in a local header are frequently zero (the writer streams and patches a
 * data descriptor afterwards), so trusting them is how a reader silently reads
 * a truncated entry.
 *
 * WHAT IT REFUSES, EXPLICITLY — a refusal is a value, never an exception:
 *   · not a ZIP                          → `not_a_zip`
 *   · ZIP64 (needs the 64-bit directory) → `zip64`
 *   · an encrypted entry                 → `encrypted`
 *   · a directory that does not parse    → `corrupt_directory`
 * A refusal becomes an honest read-only state in the viewer. It never becomes a
 * guess about the document's content.
 *
 * `inflateRaw` is injected so the same reader runs in the browser, in Deno and
 * in an offline test with no platform branch inside it.
 */

const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;
const MAX_COMMENT = 65535;

function findEocd(view, len) {
  const floor = Math.max(0, len - 22 - MAX_COMMENT);
  for (let i = len - 22; i >= floor; i -= 1) {
    if (view.getUint32(i, true) === EOCD_SIG) return i;
  }
  return -1;
}

/** Read the central directory. Returns { ok, entries } or { ok:false, reason }. */
export function readZipIndex(bytes) {
  if (!bytes || bytes.length < 22) return { ok: false, reason: 'not_a_zip' };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const len = bytes.length;
  const eocd = findEocd(view, len);
  if (eocd < 0) return { ok: false, reason: 'not_a_zip' };

  const total = view.getUint16(eocd + 10, true);
  const cdSize = view.getUint32(eocd + 12, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  // ZIP64 signals, all of them.
  if (cdOffset === 0xffffffff || cdSize === 0xffffffff || total === 0xffff) {
    return { ok: false, reason: 'zip64' };
  }

  const entries = [];
  let p = cdOffset;
  for (let i = 0; i < total; i += 1) {
    if (p + 46 > len || view.getUint32(p, true) !== CD_SIG) return { ok: false, reason: 'corrupt_directory' };
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    entries.push({
      name: decodeUtf8(bytes, p + 46, nameLen),
      method,
      compressedSize,
      size,
      localOffset,
      encrypted: (flags & 0x0001) === 1,
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return { ok: true, entries };
}

export function findEntry(entries, name) {
  return entries.find((e) => e.name === name) || null;
}

/**
 * Read one entry's bytes. `inflateRaw(Uint8Array) → Promise<Uint8Array>`.
 * The local header is re-read only for its NAME and EXTRA lengths — the sizes
 * come from the central directory, as above.
 */
export async function readZipEntry(bytes, entry, inflateRaw) {
  if (!entry) return { ok: false, reason: 'missing_entry' };
  if (entry.encrypted) return { ok: false, reason: 'encrypted' };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const off = entry.localOffset;
  if (off + 30 > bytes.length || view.getUint32(off, true) !== LOCAL_SIG) {
    return { ok: false, reason: 'corrupt_local_header' };
  }
  const nameLen = view.getUint16(off + 26, true);
  const extraLen = view.getUint16(off + 28, true);
  const start = off + 30 + nameLen + extraLen;
  if (start + entry.compressedSize > bytes.length) return { ok: false, reason: 'truncated_entry' };

  const raw = bytes.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return { ok: true, bytes: raw };
  if (entry.method !== 8) return { ok: false, reason: 'unsupported_compression' };
  const out = await inflateRaw(raw);
  return { ok: true, bytes: out };
}

/** Read one entry as text (OOXML parts are all UTF-8 XML). */
export async function readZipEntryText(bytes, entry, inflateRaw) {
  const res = await readZipEntry(bytes, entry, inflateRaw);
  if (!res.ok) return res;
  return { ok: true, text: decodeUtf8(res.bytes, 0, res.bytes.length) };
}

function decodeUtf8(bytes, offset, length) {
  const slice = bytes.subarray(offset, offset + length);
  return new TextDecoder('utf-8').decode(slice);
}

/**
 * The default inflateRaw: the platform's own DEFLATE, available in the browser,
 * in Deno and in Node. No bundled decompressor is needed, and none is used.
 */
export async function inflateRawWithStream(bytes) {
  if (typeof DecompressionStream !== 'function') throw new Error('decompression_unavailable');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}