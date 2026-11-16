/**
 * ExpertTaskBrief — what an ENTITLED owner sees (Parts 11, 16, 22).
 *
 * Every line comes from the in-memory handoff package, which is assembled only
 * from fields that exist on the Sprint task and sprint path rows. No sales
 * messaging: they already have access, so nothing here resells it.
 */

import React from 'react';
import { Check, UserRound } from 'lucide-react';
import ExplainableText from '@/components/galileo/explain/ExplainableText';

function Block({ label, children }) {
  return (
    <div>
      <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white/40">{label}</h3>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Facts({ facts }) {
  if (!facts.length) {
    return (
      <p className="text-[12.5px] text-white/45">
        Vision does not hold verified figures relevant to this task yet.
      </p>
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-3">
      {facts.map((f) => (
        <li key={f.label}>
          {/* Professional language stays — "Recast EBITDA" is the term the owner
              needs to learn before deciding to do this or bring in an expert (§26). */}
          <p className="text-[10.5px] uppercase tracking-wider text-white/35">
            <ExplainableText text={f.label} surface="expert_brief" />
          </p>
          <p className="text-[13px] text-white/80">{f.value}</p>
          {f.source && <p className="text-[10px] text-white/25">{f.source}</p>}
        </li>
      ))}
    </ul>
  );
}

export default function ExpertTaskBrief({ handoff, facts = [] }) {
  const { task, recommended_expert_role: requestedRole } = handoff;
  const desiredOutcome = task?.expected_outcome || handoff.sprint_expected_outcome || null;
  const advisor = handoff.advisor;

  return (
    <div className="space-y-6">
      <Block label="Task">
        <p className="text-[15px] font-medium text-white/90">{task?.title}</p>
        {task?.description && (
          <p className="mt-1 text-[12.5px] leading-relaxed text-white/55">{task.description}</p>
        )}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/35">
          {task?.due_date && <span>Due {task.due_date}</span>}
          {task?.priority && <span>Priority {task.priority}</span>}
          {task?.ease && <span>{task.ease}</span>}
          {task?.status && <span>{task.status.replace(/_/g, ' ')}</span>}
        </div>
      </Block>

      {handoff.sprint_objective && (
        <Block label="Objective">
          <p className="text-[13px] leading-relaxed text-white/70">{handoff.sprint_objective}</p>
        </Block>
      )}

      {handoff.galileo_reasoning && (
        <Block label="Why Galileo recommended this">
          <p className="text-[13px] leading-relaxed text-white/70">{handoff.galileo_reasoning}</p>
          {handoff.galileo_confidence != null && (
            <p className="mt-1.5 text-[11px] text-white/30">
              Sprint confidence {handoff.galileo_confidence}%
              {handoff.verification_status
                ? ` · ${handoff.verification_status.replace(/_/g, ' ')}`
                : ''}
            </p>
          )}
        </Block>
      )}

      <Block label="What Vision knows">
        <Facts facts={facts} />
      </Block>

      {desiredOutcome && (
        <Block label="Desired outcome">
          <p className="text-[13px] leading-relaxed text-white/70">{desiredOutcome}</p>
        </Block>
      )}

      <Block label="Your team">
        {advisor?.name ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
            <UserRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-vision-champagne/70" aria-hidden="true" />
            <div>
              <p className="text-[13px] text-white/80">{advisor.name}</p>
              {advisor.role && <p className="text-[11px] text-white/40">{advisor.role}</p>}
              {requestedRole && (
                <p className="mt-1.5 text-[11px] text-white/40">
                  Recommended expertise for this task
                  <span className="ml-1.5 text-cyan-300">{requestedRole}</span>
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
            <p className="flex items-center gap-2 text-[13px] text-white/75">
              <Check className="h-3.5 w-3.5 text-emerald-400/80" aria-hidden="true" />
              Expert support is included in your plan
            </p>
            <p className="mt-1 text-[11.5px] text-white/40">
              No expert is connected to this business yet.
            </p>
          </div>
        )}
      </Block>
    </div>
  );
}