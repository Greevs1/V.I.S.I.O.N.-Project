/**
 * HomeNowItem — a subtle contextual item. Its affordance is a real button when
 * a handler exists for the item's action, and plain text when none does.
 */

import React from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';

export default function HomeNowItem({ item, onAct }) {
  const canAct = item.actionValue === 'investigate' && !!onAct;

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-vision-gold/15 bg-vision-gold/[0.03] px-4 py-2.5">
      <Sparkles className="h-3.5 w-3.5 shrink-0 text-vision-gold/70" />
      <span className="flex-1 text-[12.5px] text-white/65">{item.message}</span>
      {canAct && (
        <button
          type="button"
          onClick={onAct}
          className="inline-flex shrink-0 items-center gap-1 text-[11.5px] font-medium text-vision-champagne transition-colors hover:text-vision-bright vision-focus"
        >
          {item.actionLabel}
          <ArrowRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}