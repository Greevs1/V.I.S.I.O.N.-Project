/**
 * GalileoAssignmentAnswer — the document-assignment half of a Galileo answer.
 *
 * Galileo never writes. It RESOLVES — the document from this business, a person
 * from this business's roster, the responsibility level — and leaves a proposal
 * carrying authoritative ids. This component is where the owner confirms it, and
 * the confirmation calls the SAME `documentAssignments` contract the Data Room
 * uses, which re-proves business scope, document ownership, roster membership and
 * the actor for itself. A sentence the owner typed therefore cannot become a row
 * without passing the same authorization every other surface passes.
 *
 * Lists render RECORDS rather than prose: the document, the people, the
 * responsibility level, and one [Open Document] per document — opened through the
 * existing document contract, by id, never by filename.
 */

import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileText, Loader2, ArrowRight, Check } from 'lucide-react';
import {
  assignmentStatusLabel,
  assignmentTypeLabel,
  callDocumentAssignments,
  isCompletable,
} from '@/lib/documentAssignments';
import { useOpenDocument } from '@/lib/visionWorkspace/openDocument';

/** The four changes Galileo can propose — all through the existing contract. */
const CALLS = {
  assign: (p) => [
    'assign',
    {
      document_id: p.document_id,
      assignee_profile_id: p.assignee_profile_id,
      assignment_type: p.assignment_type,
      ...(p.note ? { note: p.note } : {}),
    },
  ],
  complete: (p) => ['setStatus', { assignment_id: p.assignment_id, status: 'completed' }],
  reopen: (p) => ['setStatus', { assignment_id: p.assignment_id, status: 'open' }],
  remove: (p) => ['remove', { assignment_id: p.assignment_id }],
};

const BUTTON_LABEL = {
  assign: 'Assign',
  complete: 'Mark complete',
  reopen: 'Reopen',
  remove: 'Remove Assignment',
};

const EYEBROW = {
  assign: 'Assign document',
  complete: 'Mark complete',
  reopen: 'Reopen assignment',
  remove: 'Remove assignment',
};

/** review | action_required | fyi in plain words. */
const PURPOSE = { review: 'review', action_required: 'action', fyi: 'reference' };

/** Fields a clarification fills in on the proposal the owner is about to confirm. */
const MERGE_FIELDS = [
  'document_id',
  'document_name',
  'assignee_profile_id',
  'assignee_name',
  'assignment_type',
  'assignment_id',
  'assignee_has_account',
];

/** What the contract confirmed — never more than it confirmed. */
function successText(proposal) {
  if (proposal.action === 'assign') {
    const purpose = PURPOSE[proposal.assignment_type] || 'review';
    const notified = proposal.assignee_has_account
      ? ' They were notified in Vision.'
      : ' They will see it under Assigned to Me when they sign in.';
    return `Done. ${proposal.assignee_name} is assigned to ${proposal.document_name} for ${purpose}.${notified}`;
  }
  if (proposal.action === 'complete') return `${proposal.document_name} — marked complete.`;
  if (proposal.action === 'reopen') return `${proposal.document_name} — reopened.`;
  if (proposal.action === 'remove') return `${proposal.assignee_name} was removed from ${proposal.document_name}.`;
  return 'Done.';
}

export default function GalileoAssignmentAnswer({ assignment }) {
  const openDocument = useOpenDocument();
  const queryClient = useQueryClient();
  const [proposal, setProposal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const [done, setDone] = useState(null);

  if (!assignment) return null;

  const active = proposal || assignment.proposal || null;
  const clarify = assignment.clarify || null;

  /** A clarification only FILLS IN the proposal — it never writes anything. */
  const choose = (option) => {
    const merged = { ...(assignment.proposal_base || {}) };
    for (const field of MERGE_FIELDS) {
      if (option[field] !== undefined && option[field] !== null) merged[field] = option[field];
    }
    if (clarify?.kind === 'person') {
      merged.assignee_profile_id = option.value;
      merged.assignee_name = String(option.label || '').split(' · ')[0];
    }
    if (clarify?.kind === 'document') {
      merged.document_id = option.value;
      merged.document_name = option.label;
    }
    if (clarify?.kind === 'type') merged.assignment_type = option.value;
    if (clarify?.kind === 'assignment') merged.assignment_id = option.value;
    setFailure(null);
    setProposal(merged);
  };

  const confirm = async () => {
    const call = CALLS[active?.action];
    if (!call) return;
    const [action, data] = call(active);
    setBusy(true);
    setFailure(null);
    try {
      await callDocumentAssignments(action, {
        ...data,
        // Scoped to the business this ANSWER was about — the contract proves it.
        ...(assignment.business_id ? { active_business_id: assignment.business_id } : {}),
      });
      setDone({ text: successText(active), documentId: active.document_id });
      setProposal(null);
      // The Data Room and "Assigned to Me" read their own queries — refresh them
      // so the change is already on screen when the owner gets there.
      queryClient.invalidateQueries({ queryKey: ['document-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['data-room-documents'] });
    } catch (err) {
      // The contract's own words — a refusal it made, not a stack trace.
      setFailure(err?.message || 'That did not go through.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2.5">
      {/* ── The records ── */}
      {(assignment.groups || []).map((group) => (
        <div key={group.document_id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <FileText className="h-3.5 w-3.5 shrink-0 text-vision-gold/70" />
              <p className="truncate text-[13px] font-medium text-white/85">{group.document_name}</p>
            </div>
            <button
              type="button"
              onClick={() => openDocument(group.document_id)}
              className="inline-flex shrink-0 items-center gap-1 text-[11px] text-vision-champagne transition-colors hover:text-vision-bright vision-focus"
            >
              Open Document
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          {group.entries.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {group.entries.map((entry) => (
                <div key={entry.assignment_id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {assignment.show_people && (
                    <span className="text-[12px] text-white/70">{entry.assignee_name}</span>
                  )}
                  <span className="rounded-full border border-vision-gold/25 px-2 py-0.5 text-[10px] text-vision-champagne">
                    {assignmentTypeLabel(entry.assignment_type)}
                  </span>
                  <span className="text-[10.5px] text-white/40">{assignmentStatusLabel(entry.status)}</span>
                  {entry.is_me && entry.status === 'open' && isCompletable(entry.assignment_type) && (
                    <button
                      type="button"
                      onClick={() =>
                        setProposal({
                          action: 'complete',
                          assignment_id: entry.assignment_id,
                          document_id: group.document_id,
                          document_name: group.document_name,
                          assignee_name: entry.assignee_name,
                          assignment_type: entry.assignment_type,
                        })
                      }
                      className="text-[10.5px] text-white/45 underline-offset-2 transition-colors hover:text-white/80 hover:underline vision-focus"
                    >
                      Mark complete
                    </button>
                  )}
                  {entry.note && (
                    <p className="w-full text-[11px] italic text-white/40">{entry.note}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* ── A question, never a guess ── */}
      {clarify && !active && (
        <div className="space-y-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
          <p className="text-[12.5px] text-white/70">{clarify.question}</p>
          <div className="flex flex-wrap gap-2">
            {clarify.options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => choose(option)}
                className="rounded-full border border-vision-gold/25 px-3 py-1.5 text-[11.5px] text-vision-champagne transition-colors hover:border-vision-gold/50 hover:text-vision-bright vision-focus"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── The confirmation: nothing is written before this ── */}
      {active && (
        <div className="space-y-2 rounded-xl border border-vision-gold/25 bg-vision-gold/[0.04] p-3.5">
          <p className="text-[10px] uppercase tracking-[0.18em] text-vision-gold/80">
            {EYEBROW[active.action] || 'Confirm'}
          </p>
          <p className="text-[13.5px] font-medium text-white/90">{active.document_name}</p>
          <p className="text-[12px] text-white/60">
            {active.assignee_name}
            {active.assignment_type ? ` · ${assignmentTypeLabel(active.assignment_type)}` : ''}
          </p>
          {active.note && (
            <p className="text-[11.5px] leading-relaxed text-white/50">
              <span className="text-white/35">Note: </span>
              {active.note}
            </p>
          )}
          {failure && <p className="text-[11.5px] text-rose-300/85">{failure}</p>}
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <button
              type="button"
              onClick={confirm}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full bg-vision-gold px-4 py-2 text-[12px] font-medium text-black transition-colors hover:bg-vision-bright disabled:opacity-50 vision-focus"
            >
              {busy && <Loader2 className="h-3 w-3 animate-spin" />}
              {BUTTON_LABEL[active.action] || 'Confirm'}
            </button>
            <button
              type="button"
              onClick={() => {
                setProposal(null);
                setFailure(null);
              }}
              disabled={busy}
              className="text-[11.5px] font-medium text-white/50 transition-colors hover:text-white/85 vision-focus"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── What the contract confirmed ── */}
      {done && (
        <div className="space-y-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] p-3.5">
          <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-white/85">
            <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-300" />
            {done.text}
          </p>
          {done.documentId && (
            <button
              type="button"
              onClick={() => openDocument(done.documentId)}
              className="inline-flex items-center gap-1 text-[11.5px] text-vision-champagne transition-colors hover:text-vision-bright vision-focus"
            >
              Open Document
              <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}