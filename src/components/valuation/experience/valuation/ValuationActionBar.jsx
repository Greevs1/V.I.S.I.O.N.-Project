/**
 * ValuationActionBar — Phase 13.3E.4
 *
 * Compact sticky action bar at the bottom of the Valuation workspace. Shows
 * current section, save state, calculation state, approval state, stale
 state, recommended next action, and contextual actions (resolve blocker,
 * recalculate, approve, preview, publish).
 *
 * On mobile, reduces to one primary action and an overflow menu.
 */
import React, { useState } from 'react';
import { ChevronUp, AlertTriangle, RefreshCw, Check, FileWarning, Sparkles, MoreVertical } from 'lucide-react';

export default function ValuationActionBar({
  nextAction, canEdit, canPublish, isReady, onAction, onPublish, onRecalculate, onApprove,
}) {
  const [overflow, setOverflow] = useState(false);
  if (!nextAction) return null;

  const showPublish = nextAction.isPublish && canPublish && isReady;

  return (
    <div className="sticky bottom-0 z-20 mt-4">
      <div
        className="rounded-xl px-3 py-2.5 flex items-center gap-3"
        style={{ background: 'rgba(10,10,12,0.95)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {/* Next action */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
          <div className="min-w-0">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Next Action</p>
            <p className="text-xs text-foreground truncate font-medium">{nextAction.label}</p>
          </div>
        </div>

        {/* Desktop actions */}
        <div className="hidden sm:flex items-center gap-1.5 shrink-0">
          {nextAction.linkToValidate && (
            <button onClick={onAction} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-destructive hover:bg-destructive/10">
              <AlertTriangle className="w-3 h-3" /> Resolve Blocker
            </button>
          )}
          {onRecalculate && canEdit && !showPublish && !nextAction.linkToValidate && (
            <button onClick={onRecalculate} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-secondary text-muted-foreground hover:text-foreground">
              <RefreshCw className="w-3 h-3" /> Recalculate
            </button>
          )}
          {onApprove && canEdit && !showPublish && !nextAction.linkToValidate && (
            <button onClick={onApprove} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-accent hover:bg-accent/10">
              <Check className="w-3 h-3" /> Approve
            </button>
          )}
          {showPublish && (
            <button onClick={onPublish} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-primary-foreground" style={{ background: 'hsl(var(--primary))' }}>
              <FileWarning className="w-3 h-3" /> Publish Version
            </button>
          )}
          {!showPublish && !nextAction.linkToValidate && (
            <button onClick={onAction} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-primary hover:bg-primary/10">
              Go <ChevronUp className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Mobile — primary action + overflow */}
        <div className="flex sm:hidden items-center gap-1.5 shrink-0">
          <button
            onClick={onAction}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-primary hover:bg-primary/10"
          >
            {nextAction.isPublish ? 'Publish' : nextAction.linkToValidate ? 'Resolve' : 'Go'}
          </button>
          <button onClick={() => setOverflow(!overflow)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground">
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Mobile overflow menu */}
      {overflow && (
        <div className="sm:hidden mt-1 rounded-xl p-2 space-y-1" style={{ background: 'rgba(10,10,12,0.95)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {onRecalculate && canEdit && (
            <button onClick={() => { onRecalculate(); setOverflow(false); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground">
              <RefreshCw className="w-3.5 h-3.5" /> Recalculate
            </button>
          )}
          {onApprove && canEdit && (
            <button onClick={() => { onApprove(); setOverflow(false); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-accent">
              <Check className="w-3.5 h-3.5" /> Approve
            </button>
          )}
        </div>
      )}
    </div>
  );
}