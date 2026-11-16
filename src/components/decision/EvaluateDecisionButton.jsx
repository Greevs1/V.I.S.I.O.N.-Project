import React, { useState } from 'react';
import { Brain } from 'lucide-react';
import DecisionDrawer from './DecisionDrawer';

/**
 * Entry point button for Decision Intelligence.
 * Opens the DecisionDrawer to frame, analyze, and finalize decisions.
 *
 * AI proposes reasoning. Humans decide. Existing systems execute.
 */
export default function EvaluateDecisionButton({ businessId, variant = 'ghost', size = 'sm' }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
          variant === 'ghost'
            ? 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
            : 'bg-primary/10 text-primary hover:bg-primary/20'
        } ${size === 'sm' ? '' : 'text-sm px-4 py-2'}`}
      >
        <Brain className="w-3.5 h-3.5" />
        Evaluate Decision
      </button>
      <DecisionDrawer open={open} onOpenChange={setOpen} businessId={businessId} />
    </>
  );
}