/**
 * ModeIndicator — extremely subtle CREATE / PRODUCE mode indicator.
 *
 * Galileo infers mode from behavior. The user does not choose it upfront.
 * CREATE = exploring, discovering, modeling scenarios.
 * PRODUCE = implementing, executing, tracking.
 *
 * The indicator is intentionally minimal — a small dot + label.
 * The user should rarely need to think about modes.
 */

import React from 'react';
import { Sparkles, CheckSquare } from 'lucide-react';

export default function ModeIndicator({ mode }) {
  const isCreate = mode === 'create';

  return (
    <div className="flex items-center gap-1 text-[10px] text-white/25">
      {isCreate ? (
        <Sparkles className="w-2.5 h-2.5 text-[#D4A853]/40" />
      ) : (
        <CheckSquare className="w-2.5 h-2.5 text-cyan-400/40" />
      )}
      <span className="uppercase tracking-wider">{isCreate ? 'Create' : 'Produce'}</span>
    </div>
  );
}