import React, { useEffect, useState } from 'react';
import WorkbookGrid from '@/components/documents/viewers/WorkbookGrid';
import FinancialLinesPanel from '@/components/documents/viewers/FinancialLinesPanel';
import { extractWorkbookStructure } from '@/lib/documents/formatReader';

/**
 * SpreadsheetViewer — a workbook as EVIDENCE.
 *
 * Sheet tabs, the values each cell holds, merged ranges, and the number formats
 * the file itself carries (dates, currencies, percentages, negatives). Formulas
 * are shown by their cached calculated value — the number the spreadsheet
 * application last computed and stored — and never recalculated here.
 *
 * There is no cell editing, no formula bar, no formatting control, no row or
 * column insertion and no save. The workbook is not a workspace.
 *
 * Two readings of the SAME sheet, both read-only: the structure VISION
 * recognized (label → value, each bound to its cell), and the sheet exactly as
 * it is stored.
 */
export default function SpreadsheetViewer({ workbook }) {
  const sheets = workbook?.sheets || [];
  const [activeIndex, setActiveIndex] = useState(0);
  const [mode, setMode] = useState(null);

  useEffect(() => { setMode(null); }, [activeIndex]);

  const structure = React.useMemo(() => extractWorkbookStructure(workbook), [workbook]);
  const sheet = sheets[activeIndex] || null;
  const readable = structure.sheets[activeIndex] || null;
  const hasStructure = !!readable?.financial?.hasStructure;
  const view = mode || (hasStructure ? 'structured' : 'detail');

  if (sheets.length === 0) {
    return <Notice message="This workbook contains no readable sheets." />;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border/40 overflow-x-auto">
        {sheets.map((s, i) => (
          <button
            key={`${s.name}-${i}`}
            onClick={() => setActiveIndex(i)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              i === activeIndex ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
            }`}
          >
            {s.name}
            {s.hidden && <span className="text-[9px] uppercase tracking-wider opacity-70">hidden</span>}
            {s.unreadable && <span className="text-[9px] uppercase tracking-wider text-amber-400">unreadable</span>}
          </button>
        ))}

        {hasStructure && (
          <div className="ml-auto flex items-center gap-1 rounded-lg border border-border p-0.5">
            {[['structured', 'Structured'], ['detail', 'Detail']].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setMode(key)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  view === key ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0">
        {view === 'structured' && readable
          ? <FinancialLinesPanel sheet={{ name: sheet.name, financial: readable.financial }} />
          : <WorkbookGrid sheet={sheet} />}
      </div>
    </div>
  );
}

function Notice({ message }) {
  return (
    <div className="h-full flex items-center justify-center p-8 text-sm text-muted-foreground">{message}</div>
  );
}