import React from 'react';
import { Table2 } from 'lucide-react';

/**
 * FinancialLinesPanel — the STRUCTURED reading of one sheet.
 *
 * This is the extraction model made visible: the relationship between a label
 * and its value, preserved, with the sheet and the CELL each figure came from.
 * The provenance is shown to the reader rather than kept internally, because a
 * figure an owner cannot trace back to a cell is a figure they cannot check.
 *
 * Every line here exists in the workbook. Nothing is derived, totalled or
 * estimated — a concept with no matching line is simply absent.
 */
export default function FinancialLinesPanel({ sheet }) {
  const lines = sheet?.financial?.lines || [];

  if (lines.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8">
        <Table2 className="w-8 h-8 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">No financial structure recognized in this sheet.</p>
        <p className="text-xs text-muted-foreground/70 mt-1">Open Detail to read the sheet as it is stored.</p>
      </div>
    );
  }

  const currency = sheet.financial.currency;

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-semibold tracking-[0.2em] text-primary uppercase">
            {sheet.name}
          </p>
          <span className="text-[10px] text-muted-foreground">Structured from this sheet</span>
        </div>

        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-secondary/40">
                <th className="text-left px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Account</th>
                <th className="text-right px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Amount</th>
                <th className="text-right px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-24">Source</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.concept} className="border-t border-border/50">
                  <td className="px-4 py-2.5">{line.label}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums ${line.value < 0 ? 'text-rose-300/90' : ''}`}>
                    {currency || line.kind === 'currency' ? line.text : line.text}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[11px] text-muted-foreground font-mono">
                    {line.cell}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-muted-foreground mt-3">
          Read directly from the workbook. Every figure above is stored in the cell shown beside it.
        </p>
      </div>
    </div>
  );
}