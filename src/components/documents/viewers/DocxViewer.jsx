import React from 'react';

/**
 * DocxViewer — a DOCX read as a DOCUMENT, not as plain text.
 *
 * Headings keep their level, lists keep their items, and TABLES stay tables:
 * flattening a table into a paragraph destroys the only thing that makes a
 * financial document readable — which value belongs to which label.
 *
 * Read-only. There is no editor here and no path to one.
 */
export default function DocxViewer({ blocks }) {
  const list = Array.isArray(blocks) ? blocks : [];
  if (list.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-8 text-sm text-muted-foreground">
        This document has no readable body text.
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-white/[0.02]">
      <div className="max-w-3xl mx-auto p-8 space-y-3">
        {list.map((block, i) => {
          if (block.type === 'heading') return <Heading key={i} level={block.level} text={block.text} />;
          if (block.type === 'table') return <DocTable key={i} rows={block.rows} />;
          if (block.type === 'listItem') return <ListItem key={i} text={block.text} />;
          if (!String(block.text || '').trim()) return <div key={i} className="h-2" />;
          return <p key={i} className="text-sm leading-relaxed text-foreground/90">{block.text}</p>;
        })}
      </div>
    </div>
  );
}

const HEADING_CLASS = {
  1: 'text-2xl font-display font-bold mt-6 mb-2',
  2: 'text-xl font-semibold mt-5 mb-2',
  3: 'text-lg font-semibold mt-4 mb-1.5',
};
const HEADING_FALLBACK = 'text-base font-semibold mt-3 mb-1';

function Heading({ level, text }) {
  const Tag = `h${Math.min(Math.max(level || 1, 1), 6)}`;
  return <Tag className={HEADING_CLASS[level] || HEADING_FALLBACK}>{text}</Tag>;
}

function ListItem({ text }) {
  return (
    <div className="flex gap-2 text-sm leading-relaxed text-foreground/90 pl-2">
      <span className="text-primary mt-1.5 w-1 h-1 rounded-full bg-primary flex-shrink-0" />
      <span>{text}</span>
    </div>
  );
}

function DocTable({ rows }) {
  if (!rows?.length) return null;
  const [head, ...body] = rows;
  return (
    <div className="rounded-lg border border-border overflow-hidden my-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-secondary/40">
            {head.map((h, i) => (
              <th key={i} className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, r) => (
            <tr key={r} className="border-t border-border/50">
              {row.map((cell, c) => (
                <td key={c} className="px-3 py-2 align-top">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}