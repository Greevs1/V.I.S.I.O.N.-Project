/**
 * DocumentUnavailableNotice — the calm, fail-closed statement for a requested
 * document this business's Data Room does not hold: removed, or never ours.
 *
 * It is deliberately the SAME sentence for both cases. Saying which would leak
 * whether a document exists in another business, and the owner's only useful
 * next step is the same either way: the library one step back.
 */

import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DocumentUnavailableNotice({ onBack }) {
  return (
    <div className="glass rounded-xl border border-border/60 p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">Data Room</p>
          <p className="mt-1 text-sm font-medium">This document is no longer available.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            It may have been removed, or it may not belong to this business.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onBack} className="shrink-0 gap-1.5">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Data Room
        </Button>
      </div>
    </div>
  );
}