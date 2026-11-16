/**
 * ConfirmSprintReplaceModal — shown when a user clicks an opportunity in the Vault
 * to confirm they want to replace the current active sprint.
 */
import React from 'react';
import { AlertTriangle, X, Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ConfirmSprintReplaceModal({ opportunity, currentSprint, onConfirm, onCancel }) {
  if (!opportunity) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border shadow-2xl" style={{ backgroundColor: '#141418' }}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <h3 className="text-sm font-semibold">Replace Active Sprint?</h3>
          </div>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Current sprint */}
          {currentSprint && (
            <div className="rounded-lg p-3 bg-secondary/40 border border-border">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Current Active Sprint</p>
              <p className="text-sm font-medium">{currentSprint.path_title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{currentSprint.path_goal}</p>
              {currentSprint.progress_percent > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
                    <div className="h-full bg-primary/50 rounded-full" style={{ width: `${currentSprint.progress_percent}%` }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{currentSprint.progress_percent}% complete</span>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-center">
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
          </div>

          {/* New opportunity */}
          <div className="rounded-lg p-3 bg-primary/5 border border-primary/20">
            <p className="text-[10px] text-primary uppercase tracking-wide mb-1 font-semibold">New Sprint Path</p>
            <div className="flex items-start gap-2">
              <Sparkles className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">{opportunity.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{opportunity.description || opportunity.expected_outcome}</p>
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Your current sprint will be archived and a new 90-day plan will be generated for this opportunity. Your task history and notes are preserved.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 px-5 pb-5">
          <Button variant="outline" className="flex-1 text-xs" onClick={onCancel}>
            Keep Current Sprint
          </Button>
          <Button className="flex-1 text-xs gap-1.5" onClick={() => onConfirm(opportunity)}>
            <Sparkles className="w-3.5 h-3.5" />
            Replace & Generate
          </Button>
        </div>
      </div>
    </div>
  );
}