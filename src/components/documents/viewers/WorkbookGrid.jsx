import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { columnLetters } from '@/lib/documents/formatReader/csv';

/**
 * WorkbookGrid — one sheet of a workbook, READ ONLY.
 *
 * There is no editable cell, no toolbar and no save: the cells are rendered as
 * text. Nothing here can change the document, by construction rather than by
 * policy, because there is no write path to reach.
 *
 * Grid fidelity that matters for reading a spreadsheet: real column letters and
 * row numbers, merged ranges honoured (a merged title is not repeated in every
 * cell it covers), numbers right-aligned and text left-aligned so a column of
 * figures lines up, and negatives distinguished at a glance.
 *
 * Large sheets render in batches — a 5000-row sheet drawn in one pass locks the
 * browser, and a viewer that freezes is not a viewer.
 */

const ROW_BATCH = 200;
const COL_WIDTH = 132;
const MAX_COLS_DRAWN = 60;

export default function WorkbookGrid({ sheet }) {
  const [visibleRows, setVisibleRows] = useState(ROW_BATCH);
  const rows = sheet?.rows || [];

  const colCount = useMemo(
    () => Math.min(MAX_COLS_DRAWN, rows.reduce((m, r) => Math.max(m, r?.length || 0), 0)),
    [rows],
  );

  const { anchors, covered } = useMemo(() => {
    const anchors = new Map();
    const covered = new Set();
    for (const merge of sheet?.merges || []) {
      anchors.set(`${merge.s.row},${merge.s.col}`, {
        rowSpan: Math.max(1, merge.e.row - merge.s.row + 1),
        colSpan: Math.max(1, merge.e.col - merge.s.col + 1),
      });
      for (let r = merge.s.row; r <= merge.e.row; r += 1) {
        for (let c = merge.s.col; c <= merge.e.col; c += 1) {
          if (r === merge.s.row && c === merge.s.col) continue;
          covered.add(`${r},${c}`);
        }
      }
    }
    return { anchors, covered };
  }, [sheet?.merges]);

  if (!sheet) return <Empty message="No sheet selected." />;
  if (rows.length === 0) return <Empty message="This sheet is empty." />;

  const drawn = Math.min(visibleRows, rows.length);
  const colWidth = `max(${COL_WIDTH}px, minmax(${COL_WIDTH}px, 1fr))`;

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="border-collapse text-xs tabular-nums" style={{ minWidth: 'max-content' }}>
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 bg-card border border-border/40 w-[52px] min-w-[52px]" />
              {Array.from({ length: colCount }, (_, c) => (
                <th
                  key={c}
                  className="sticky top-0 z-20 bg-card border border-border/40 px-2 py-1 font-medium text-muted-foreground text-center"
                  style={{ minWidth: COL_WIDTH, width: COL_WIDTH }}
                >
                  {columnLetters(c + 1)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: drawn }, (_, r) => (
              <tr key={r}>
                <th className="sticky left-0 z-10 bg-card border border-border/40 px-2 py-1 text-muted-foreground font-medium text-right">
                  {r + 1}
                </th>
                {Array.from({ length: colCount }, (_, c) => {
                  if (covered.has(`${r},${c}`)) return null;
                  const cell = rows[r]?.[c] || null;
                  const span = anchors.get(`${r},${c}`) || {};
                  return (
                    <Cell key={c} cell={cell} colSpan={span.colSpan} rowSpan={span.rowSpan} minWidth={COL_WIDTH} />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex-shrink-0 border-t border-border/40 px-3 py-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {rows.length} {rows.length === 1 ? 'row' : 'rows'}
          {sheet.truncated ? ' · this sheet is larger than VISION renders here' : ''}
        </span>
        {drawn < rows.length && (
          <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => setVisibleRows((n) => n + ROW_BATCH * 2)}>
            Show more rows
          </Button>
        )}
      </div>
    </div>
  );
}

function Cell({ cell, colSpan, rowSpan, minWidth }) {
  if (!cell) {
    return (
      <td
        className="border border-border/20"
        colSpan={colSpan}
        rowSpan={rowSpan}
        style={{ minWidth, height: 28 }}
      />
    );
  }
  const numeric = cell.kind === 'number' || cell.kind === 'currency' || cell.kind === 'percent';
  const negative = typeof cell.value === 'number' && cell.value < 0;
  return (
    <td
      colSpan={colSpan}
      rowSpan={rowSpan}
      title={cell.formula ? `${cell.ref} · =${cell.formula}` : `${cell.ref}`}
      style={{ minWidth, height: 28 }}
      className={`border border-border/20 px-2 py-1 whitespace-nowrap overflow-hidden text-ellipsis ${
        numeric ? 'text-right' : 'text-left'
      } ${negative ? 'text-rose-300/90' : 'text-foreground'} ${
        cell.kind === 'error' ? 'text-amber-400' : ''
      }`}
    >
      {cell.formula && <span className="text-primary/50 mr-1" aria-hidden>ƒ</span>}
      {cell.text}
    </td>
  );
}

function Empty({ message }) {
  return (
    <div className="h-full flex items-center justify-center p-8 text-sm text-muted-foreground">{message}</div>
  );
}