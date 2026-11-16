/**
 * WorkspaceSkeleton — the resolving state for a lazy workspace.
 * Deliberately quiet: a premium surface must never flash a raw spinner.
 */

import React from 'react';

export default function WorkspaceSkeleton({ label = 'Opening' }) {
  return (
    <div className="animate-pulse space-y-5 p-6 md:p-9" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="h-3 w-28 rounded-full bg-white/[0.05]" />
      <div className="h-7 w-72 max-w-full rounded-lg bg-white/[0.06]" />
      <div className="grid gap-5 pt-3 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 rounded-xl border border-white/[0.05] bg-white/[0.025]" />
        ))}
      </div>
      <div className="h-44 rounded-xl border border-white/[0.05] bg-white/[0.02]" />
    </div>
  );
}