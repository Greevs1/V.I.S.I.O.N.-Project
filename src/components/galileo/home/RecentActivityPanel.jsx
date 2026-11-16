/**
 * RecentActivityPanel — real activity since the last visit.
 *
 * Fed by the existing activity layer, which derives events from real system
 * records (document analyses, opportunity detections, sprint updates). If
 * there is nothing trustworthy to show, the panel renders nothing rather
 * than filling the space with invented events.
 */

import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { FileText, Target, ClipboardList, TrendingUp, Sparkles, ArrowRight } from 'lucide-react';

const TYPE_ICONS = {
  document_analyzed: FileText,
  opportunity_detected: Target,
  sprint_progress: ClipboardList,
  valuation_updated: TrendingUp,
};

export default function RecentActivityPanel({ activities = [], onOpen }) {
  if (activities.length === 0) return null;

  return (
    <section className="space-y-3.5">
      <h2 className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/40">
        Recent Activity
      </h2>

      <div className="space-y-2">
        {activities.slice(0, 4).map((activity) => {
          const Icon = TYPE_ICONS[activity.type] || Sparkles;
          const when = activity.timestamp
            ? formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })
            : null;

          return (
            <button
              key={activity.id}
              type="button"
              onClick={() => onOpen?.(activity)}
              className="group flex w-full items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.015] px-3.5 py-3 text-left transition-all duration-200 hover:border-white/[0.12] hover:bg-white/[0.035] vision-focus"
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-white/35" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-white/75">{activity.title}</span>
                {when && <span className="mt-0.5 block text-[11px] text-white/35">{when}</span>}
              </span>
              <ArrowRight className="h-3 w-3 shrink-0 text-white/20 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-white/50" />
            </button>
          );
        })}
      </div>
    </section>
  );
}