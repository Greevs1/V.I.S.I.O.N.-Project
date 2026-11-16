import React from 'react';
import { ShieldCheck } from 'lucide-react';

/**
 * LearnConfirmation — a lightweight statement of what was just promoted.
 *
 * It reports ONLY fields the owner actually accepted or corrected in this
 * session, listed with their real values. There is no historical diff engine
 * behind it, so it never claims to show a change history it cannot support.
 */
export default function LearnConfirmation({ learned = [] }) {
  if (learned.length === 0) return null;

  const shown = learned.slice(-3);

  return (
    <div className="glass-gold rounded-xl p-4 border border-primary/25">
      <div className="flex items-start gap-3">
        <ShieldCheck className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-[0.2em] text-primary uppercase">
            Vision updated
          </p>
          <p className="text-sm font-medium mt-1">
            I learned {learned.length} new {learned.length === 1 ? 'piece' : 'pieces'} of information about your business.
          </p>
          <div className="mt-2 space-y-1">
            {shown.map((item) => (
              <div key={item.id} className="flex items-baseline gap-2 text-xs">
                <span className="text-muted-foreground">{item.label}</span>
                <span className="font-semibold font-mono">{item.value}</span>
                {item.period && <span className="text-muted-foreground">{item.period}</span>}
              </div>
            ))}
            {learned.length > shown.length && (
              <p className="text-[11px] text-muted-foreground">
                and {learned.length - shown.length} more
              </p>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Confirmed information is now used across Business Intelligence, Galileo and your assessments.
          </p>
        </div>
      </div>
    </div>
  );
}