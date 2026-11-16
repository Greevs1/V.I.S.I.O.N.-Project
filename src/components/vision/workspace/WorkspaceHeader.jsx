/**
 * WorkspaceHeader — the consistent minimal header every workspace carries.
 *
 *   ← Vision    Business Valuation                                    ⛶  ✕
 *               Apex Roofing · Detailed Analytics
 *
 * Left: back into Vision (or one step back within the layer) + the workspace
 *       title + the breadcrumb of how we got here.
 * Center: the active business, because every read inside the workspace is
 *       scoped to it and the user must be able to see which one.
 * Right: expand and close only.
 */

import React from 'react';
import { ArrowLeft, Maximize2, Minimize2, X } from 'lucide-react';

export default function WorkspaceHeader({
  title,
  breadcrumb = [],
  businessName,
  canGoBack = false,
  // Where this control actually goes, in words: "Data Room", "What If",
  // "Business Valuation". The behaviour is decided by the layer's stack — this
  // only names its destination, so the owner never has to guess what "Back"
  // means on the screen they are looking at.
  backLabel = null,
  onBack,
  expanded = false,
  onToggleExpand,
  onClose,
}) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-white/[0.07] px-4 py-3 md:px-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11.5px] text-white/45 transition-colors hover:bg-white/[0.05] hover:text-white/85 vision-focus"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {backLabel || (canGoBack ? 'Back' : 'Vision')}
      </button>

      <div className="min-w-0 flex-1">
        <h2 id="vision-workspace-title" className="truncate text-[15px] font-medium text-white/90">
          {title}
        </h2>
        {(breadcrumb.length > 0 || businessName) && (
          <p className="truncate text-[11px] text-white/35">
            {businessName || 'No business selected'}
            {breadcrumb.length > 0 && (
              <span className="text-white/25"> · via {breadcrumb.join(' · ')}</span>
            )}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onToggleExpand}
          aria-label={expanded ? 'Exit full screen' : 'Expand to full screen'}
          className="hidden h-8 w-8 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/[0.05] hover:text-white/85 md:flex vision-focus"
        >
          {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close workspace"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/[0.05] hover:text-white/85 vision-focus"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}