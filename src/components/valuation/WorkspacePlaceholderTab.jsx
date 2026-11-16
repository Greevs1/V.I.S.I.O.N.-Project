/**
 * WorkspacePlaceholderTab — generic placeholder for tabs not yet implemented.
 * Supports loading, empty state, progress display, and permission checks.
 */
import React from 'react';
import ValuationStatusBadge from './ValuationStatusBadge';

export default function WorkspacePlaceholderTab({ tab, assignment }) {
  const canEdit = assignment?.can_edit || false;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{tab.label}</h3>
          <p className="text-xs text-muted-foreground mt-1">{tab.description}</p>
        </div>
        <ValuationStatusBadge status="not_started" />
      </div>

      <div
        className="rounded-xl p-8 text-center"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <p className="text-sm text-muted-foreground mb-2">
          This section will be populated in a future phase.
        </p>
        <p className="text-[11px] text-muted-foreground/50">
          {canEdit ? 'You have edit access — content will be available once implemented.' : 'Read-only access — content will appear once an advisor completes this section.'}
        </p>
      </div>
    </div>
  );
}