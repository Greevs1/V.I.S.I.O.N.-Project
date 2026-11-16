/**
 * ActiveWorkPanel — real execution objects currently in motion.
 *
 * Only rows backed by real, business-scoped data are rendered: the active
 * 90-Day Sprints and the opportunities awaiting review. Progress comes from
 * the sprint record; nothing is estimated.
 *
 * (Task-level counts such as "3 tasks · 2 due this week" are not exposed by
 * the Home data layer, so they are not shown rather than invented.)
 */

import React from 'react';
import { Flame, Target, ArrowRight } from 'lucide-react';

function Row({ icon: Icon, title, meta, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.015] px-3.5 py-3 text-left transition-all duration-200 hover:border-vision-gold/20 hover:bg-vision-gold/[0.035] vision-focus"
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-vision-champagne/60" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-white/80">{title}</span>
        {meta && <span className="mt-0.5 block text-[11px] text-white/40">{meta}</span>}
      </span>
      <ArrowRight
        className="h-3 w-3 shrink-0 text-white/20 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-vision-champagne/70"
      />
    </button>
  );
}

export default function ActiveWorkPanel({
  sprints = [],
  opportunities = [],
  onOpenSprint,
  onOpenOpportunities,
}) {
  // Matches the opportunity stage convention used by the playbook resolver:
  // an unset status means the opportunity is available, not excluded.
  const availableOpportunities = opportunities.filter(
    (o) => (o.status || 'available') === 'available'
  );
  const hasSprints = sprints.length > 0;
  const hasOpportunities = availableOpportunities.length > 0;

  if (!hasSprints && !hasOpportunities) return null;

  return (
    <section className="space-y-3.5">
      <h2 className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/40">
        Active Work
      </h2>

      <div className="space-y-2">
        {sprints.slice(0, 2).map((sprint) => (
          <Row
            key={sprint.id}
            icon={Flame}
            title={sprint.title || '90-Day Sprint'}
            meta={`${sprint.progress || 0}% complete${
              sprint.needsExpertReview ? ' · review needed' : ''
            }`}
            onClick={() => onOpenSprint?.(sprint)}
          />
        ))}

        {hasOpportunities && (
          <Row
            icon={Target}
            title="Opportunities"
            meta={`${availableOpportunities.length} ${
              availableOpportunities.length === 1 ? 'opportunity' : 'opportunities'
            } awaiting review`}
            onClick={onOpenOpportunities}
          />
        )}
      </div>
    </section>
  );
}