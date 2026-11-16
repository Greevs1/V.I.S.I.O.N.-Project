import React, { useState } from 'react';
import { ChevronDown, Quote } from 'lucide-react';

const LABEL_STYLE = {
  'VERIFIED DATA': 'border-emerald-400/25 text-emerald-300/75',
  'CONFIRMED DATA': 'border-sky-400/25 text-sky-300/75',
  'DOCUMENT EVIDENCE': 'border-vision-gold/25 text-vision-champagne/80',
  'PENDING REVIEW': 'border-vision-gold/25 text-vision-champagne/80',
  'CONFLICTING DATA': 'border-orange-400/25 text-orange-300/80',
  'MULTIPLE PERIODS': 'border-white/15 text-white/55',
  'RELATED DATA': 'border-white/15 text-white/55',
  'CLARIFICATION NEEDED': 'border-white/15 text-white/55',
  'NO SUPPORTING DATA': 'border-white/12 text-white/40',
};

/**
 * The factual answer's labels and its "Where this came from" drawer, rendered
 * from the server's evidence contract only: document, period, field, review state.
 */
export default function FactualEvidenceBlock({ view }) {
  const [open, setOpen] = useState(false);
  if (!view?.active) return null;
  return (
    <div className="space-y-1.5 pt-0.5">
      <div className="flex flex-wrap gap-1.5">
        {view.labels.map((l) => (
          <span key={l} className={`rounded-full border px-2 py-0.5 text-[9.5px] uppercase tracking-wider ${LABEL_STYLE[l] || LABEL_STYLE['NO SUPPORTING DATA']}`}>
            {l}
          </span>
        ))}
      </div>
      {view.sources.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[11px] text-white/40 transition-colors hover:text-white/70 vision-focus"
          >
            <Quote className="h-3 w-3" />
            {open ? 'Hide' : 'Where this came from'}
            <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
          </button>
          {open && (
            <div className="space-y-1 pt-1.5">
              {view.sources.map((s) => (
                <p key={s.key} className="text-[11px] leading-relaxed text-white/45">
                  {s.role === 'related' ? 'Related · ' : ''}{s.document} · {s.period} · field {s.field} · {s.reviewState}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}