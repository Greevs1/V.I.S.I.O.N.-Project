/**
 * WorkspacePlaceholder — Phase 13.3E.1
 *
 * Premium "arriving soon" surface for the five new workspaces whose full
 * implementation lands in later Phase 13.3E steps. Shows the workspace
 * purpose, the planned sections, and a clear path to the Advanced workspace
 * so advisors can access existing tools immediately.
 */
import React from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';

export default function WorkspacePlaceholder({ title, purpose, phase, sections = [], onOpenAdvanced }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-display font-bold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground mt-1">{purpose}</p>
      </div>

      <div
        className="rounded-xl p-5"
        style={{ background: 'rgba(212,168,83,0.04)', border: '1px solid rgba(212,168,83,0.18)' }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">Arriving in Phase {phase}</p>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          This workspace is part of the Intelligent Valuation Experience redesign and will be completed in a controlled
          later step. The certified Valuation Engine, all calculations, permissions, and audit trails remain unchanged.
        </p>

        {sections.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2">Planned sections</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {sections.map((s) => (
                <div
                  key={s}
                  className="rounded-lg px-3 py-2 text-xs text-foreground/90"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  {s}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <button
        onClick={onOpenAdvanced}
        className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
      >
        Use the full Advanced Workspace now <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}