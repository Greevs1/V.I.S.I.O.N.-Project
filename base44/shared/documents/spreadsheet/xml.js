/**
 * xml.js — a small, purpose-built XML reader for OOXML parts.
 *
 * WHY NOT A REAL XML PARSER: OOXML sheet and document parts are machine-written
 * and relentlessly regular, and the one thing a reader must never do is fail on
 * a part that a spreadsheet application wrote happily. This walks the part with
 * a tokenizer that is tolerant of what OOXML actually contains (self-closing
 * tags, namespaces, CDATA, entities) and costs nothing to run in a browser, in
 * Deno, or in an offline test.
 *
 * It PARSES ONLY. There is no serializer, and none is reachable.
 *
 * `name` is the LOCAL name (`w:p` → `p`); attributes keep the name as written,
 * and `attr()` also resolves a prefixed spelling, so `r:id` and `id` both work.
 */

const MAX_NODES = 500000;

export function parseXml(text) {
  const root = { name: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  let nodes = 0;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const lt = text.indexOf('<', i);
    if (lt < 0) { addText(stack[stack.length - 1], text.slice(i)); break; }
    if (lt > i) addText(stack[stack.length - 1], text.slice(i, lt));

    if (text.startsWith('<!--', lt)) {
      const end = text.indexOf('-->', lt + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (text.startsWith('<![CDATA[', lt)) {
      const end = text.indexOf(']]>', lt + 9);
      addText(stack[stack.length - 1], text.slice(lt + 9, end < 0 ? n : end));
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (text.startsWith('<?', lt)) {
      const end = text.indexOf('?>', lt + 2);
      i = end < 0 ? n : end + 2;
      continue;
    }
    if (text.startsWith('<!', lt)) {
      const end = text.indexOf('>', lt + 2);
      i = end < 0 ? n : end + 1;
      continue;
    }

    const gt = findTagEnd(text, lt + 1);
    if (gt < 0) break;
    const inner = text.slice(lt + 1, gt);

    if (inner.startsWith('/')) {
      if (stack.length > 1) stack.pop();
      i = gt + 1;
      continue;
    }

    const selfClosing = inner.endsWith('/');
    const body = selfClosing ? inner.slice(0, -1) : inner;
    const space = body.search(/[\s]/);
    const rawName = space < 0 ? body : body.slice(0, space);
    const node = {
      name: localName(rawName),
      attrs: parseAttrs(space < 0 ? '' : body.slice(space + 1)),
      children: [],
      text: '',
    };
    nodes += 1;
    if (nodes > MAX_NODES) { root.truncated = true; break; }
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
    i = gt + 1;
  }
  return root;
}

/**
 * The DOCUMENT ELEMENT — the first real element inside the `#root` wrapper.
 *
 * Every parse begins at the wrapper, so a reader searching for `<sheets>` from
 * there finds nothing: `sheets` is a child of `<workbook>`, not of the document.
 * Descending once, explicitly, is the difference between reading a workbook and
 * reporting that it has no sheets at all.
 */
export function documentElement(root) {
  return (root && root.children && root.children[0]) || root;
}

/** The first child with this local name. */
export function child(node, name) {
  if (!node) return null;
  return node.children.find((c) => c.name === name) || null;
}

/** Every child with this local name. */
export function childList(node, name) {
  if (!node) return [];
  return node.children.filter((c) => c.name === name);
}

/** Every descendant with this local name, in document order. */
export function descendantList(node, name, out = []) {
  if (!node) return out;
  for (const c of node.children) {
    if (c.name === name) out.push(c);
    descendantList(c, name, out);
  }
  return out;
}

/** An attribute by written name, then by local name, then by any prefix. */
export function attr(node, name) {
  if (!node) return null;
  const attrs = node.attrs;
  if (attrs[name] != null) return attrs[name];
  if (attrs[`r:${name}`] != null) return attrs[`r:${name}`];
  if (attrs[`w:${name}`] != null) return attrs[`w:${name}`];
  const hit = Object.keys(attrs).find((k) => k.split(':').pop() === name);
  return hit ? attrs[hit] : null;
}

/** All text inside a node, in document order (includes nested runs). */
export function textOf(node) {
  if (!node) return '';
  let out = node.text || '';
  for (const c of node.children) out += textOf(c);
  return out;
}

function localName(raw) {
  const idx = raw.indexOf(':');
  return idx < 0 ? raw : raw.slice(idx + 1);
}

function findTagEnd(text, from) {
  let quote = null;
  for (let i = from; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '>') return i;
  }
  return -1;
}

function addText(node, chunk) {
  if (!chunk) return;
  node.text += decodeEntities(chunk);
}

function parseAttrs(s) {
  const attrs = {};
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i += 1;
    if (i >= s.length) break;
    const eq = s.indexOf('=', i);
    if (eq < 0) break;
    const name = s.slice(i, eq).trim();
    const quote = s[eq + 1];
    let value = '';
    if (quote === '"' || quote === "'") {
      const end = s.indexOf(quote, eq + 2);
      value = s.slice(eq + 2, end < 0 ? s.length : end);
      i = end < 0 ? s.length : end + 1;
    } else {
      const end = s.search(/[\s]/);
      value = s.slice(eq + 1, end < 0 ? s.length : eq + 1 + end);
      i = end < 0 ? s.length : end;
    }
    if (name) attrs[name] = decodeEntities(value);
  }
  return attrs;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(s) {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[body] != null ? ENTITIES[body] : m;
  });
}