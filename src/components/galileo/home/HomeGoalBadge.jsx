/**
 * HomeGoalBadge — subtle goal display.
 *
 * Goals should NOT be a giant module. A subtle badge that informs
 * prioritization. Display the primary Goal subtly where useful.
 *
 * Example: "$10M Exit · 2029"
 *
 * The user can edit goals conversationally.
 */

import React from 'react';
import { Target } from 'lucide-react';

export default function HomeGoalBadge({ goalBadge }) {
  if (!goalBadge) return null;

  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/[0.06] bg-white/[0.015]">
      <Target className="w-3 h-3 text-[#D4A853]/60" />
      <span className="text-[10px] uppercase tracking-wider text-white/40 font-medium">
        Goal
      </span>
      <span className="text-[11px] text-white/60">
        {goalBadge}
      </span>
    </div>
  );
}