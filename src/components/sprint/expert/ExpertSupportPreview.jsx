/**
 * ExpertSupportPreview — what a NON-entitled owner sees (Parts 7, 8, 21).
 *
 * It must be genuinely useful on its own: the role, the task, why the expertise
 * matters and what someone in that seat would get done. Every line is grounded
 * in the task row (Galileo's stated reason, the owner's own subtasks, the stated
 * outcome) — no invented expertise requirement, no marketplace copy.
 *
 * This is the value half only. The access half (the sales moment) lives in the
 * panel, AFTER this, so the owner understands the value before Vision asks.
 */

import React from 'react';
import ExplainableText from '@/components/galileo/explain/ExplainableText';

function Section({ label, children }) {
  return (
    <div>
      <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white/40">{label}</h3>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

export default function ExpertSupportPreview({ handoff, subtasks = [] }) {
  const task = handoff?.task || {};
  const requestedRole = handoff?.recommended_expert_role || null;
  const steps = subtasks.map((s) => s.title).filter(Boolean).slice(0, 5);

  return (
    <div className="space-y-6">
      <Section label="Task">
        <p className="text-[15px] font-medium text-white/90">
          <ExplainableText text={task.title} surface="expert_preview" />
        </p>
        {task.description && (
          <p className="mt-1 text-[12.5px] leading-relaxed text-white/55">{task.description}</p>
        )}
      </Section>

      <Section label="Why this matters">
        {handoff?.galileo_reasoning ? (
          <p className="text-[13px] leading-relaxed text-white/70">{handoff.galileo_reasoning}</p>
        ) : (
          <p className="text-[13px] leading-relaxed text-white/70">
            Galileo flagged this task as needing {requestedRole || 'outside professional'} input, so
            the work is not held up by expertise this business does not carry in house.
          </p>
        )}
      </Section>

      <Section label={requestedRole ? `How a ${requestedRole} would help` : 'How an expert would help'}>
        {steps.length > 0 ? (
          <ul className="space-y-1.5">
            {steps.map((title) => (
              <li key={title} className="flex items-start gap-2 text-[12.5px] text-white/65">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-cyan-400/60" aria-hidden="true" />
                {title}
              </li>
            ))}
          </ul>
        ) : task.expected_outcome ? (
          <p className="text-[13px] leading-relaxed text-white/70">
            Deliver the outcome this task is measured on: {task.expected_outcome}
          </p>
        ) : (
          <p className="text-[12.5px] text-white/45">
            This task has no step list yet, so Vision will not guess one. Ask Galileo below what the
            work would involve.
          </p>
        )}
        {steps.length > 0 && task.expected_outcome && (
          <p className="mt-2 text-[12px] text-white/40">Outcome: {task.expected_outcome}</p>
        )}
      </Section>
    </div>
  );
}