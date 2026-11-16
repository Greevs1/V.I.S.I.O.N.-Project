/**
 * docx.js — read-only DOCX → a block model.
 *
 * Headings, paragraphs, lists and TABLES are preserved as structure, because a
 * table flattened into a paragraph loses the relationship between a label and
 * its value — which is the only thing a financial document is.
 *
 * A DOCX is read and never written. Nothing here writes a part back.
 */

import { readZipIndex, findEntry, readZipEntryText, inflateRawWithStream } from './zip.js';
import { parseXml, documentElement, child, childList, attr, textOf } from './xml.js';

const HEADING_STYLE = /^Heading([1-9])$/i;

export async function readDocx(bytes, inflateRaw = inflateRawWithStream) {
  const index = readZipIndex(bytes);
  if (!index.ok) return { ok: false, reason: index.reason };
  const entry = findEntry(index.entries, 'word/document.xml');
  if (!entry) return { ok: false, reason: 'not_a_document' };
  const part = await readZipEntryText(bytes, entry, inflateRaw);
  if (!part.ok) return { ok: false, reason: part.reason };

  const root = documentElement(parseXml(part.text));
  const body = child(root, 'body') || root;
  const blocks = [];
  for (const node of body.children) {
    if (node.name === 'p') blocks.push(readParagraph(node));
    else if (node.name === 'tbl') blocks.push(readTable(node));
  }
  return { ok: true, blocks };
}

function readParagraph(node) {
  const pPr = child(node, 'pPr');
  const styleId = attr(child(pPr, 'pStyle'), 'val') || '';
  const heading = styleId.match(HEADING_STYLE);
  const numPr = child(pPr, 'numPr');
  const text = paragraphText(node);

  if (heading) return { type: 'heading', level: Number(heading[1]), text };
  if (/^Title$/i.test(styleId)) return { type: 'heading', level: 1, text };
  if (numPr) return { type: 'listItem', ordered: numIdIsOrdered(numPr), text };
  return { type: 'paragraph', text };
}

function readTable(node) {
  const rows = childList(node, 'tr').map((tr) => childList(tr, 'tc').map((tc) => (
    childList(tc, 'p').map(paragraphText).filter(Boolean).join(' ')
  )));
  return { type: 'table', rows };
}

/**
 * Every run's text, in document order. Deleted text (w:delText) is EXCLUDED —
 * a tracked deletion is not part of the document the owner is reading.
 */
function paragraphText(node) {
  let out = '';
  const walk = (n) => {
    for (const c of n.children) {
      if (c.name === 'delText' || c.name === 'del') continue;
      if (c.name === 't') out += textOf(c);
      else if (c.name === 'tab') out += '\t';
      else if (c.name === 'br') out += '\n';
      else walk(c);
    }
  };
  walk(node);
  return out;
}

/** Ordered vs bullet is a property of the numbering definition; default bullet. */
function numIdIsOrdered() {
  return false;
}