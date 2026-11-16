import React from 'react';
import { Users, ArrowRight, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import {
  assignmentTypeShort,
  assignmentStatusLabel,
  isCompletable,
} from '@/lib/documentAssignments';

/**
 * AssignedToMe — what is waiting on the signed-in member in the active business.
 *
 * A view inside the Data Room, not an application (§8). Every row opens the
 * EXACT existing document in the existing viewer (§9) — and because a document
 * opened from here is a level of the overlay's stack, Back returns to this list,
 * then to the repository.
 *
 * A document that is no longer in this business's list is shown but not
 * openable: the assignment record survives, the authorization does not (§26 N).
 */
export default function AssignedToMe({
  assignments = [],
  documents = [],
  canManage = false,
  busyId = null,
  onOpenDocument,
  onComplete,
  onManage,
}) {
  const byId = new Map(documents.map((d) => [d.id, d]));

  if (assignments.length === 0) {
    return (
      <div className="glass rounded-xl p-10 text-center space-y-2">
        <Users className="w-7 h-7 text-muted-foreground mx-auto" />
        <p className="text-sm font-medium">Nothing waiting on you.</p>
        <p className="text-xs text-muted-foreground">
          When someone assigns you a document, it will show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {assignments.map((a) => {
        const doc = byId.get(a.document_id);
        const canComplete = isCompletable(a.assignment_type) && a.status === 'open';
        const busy = busyId === a.id;

        return (
          <div
            key={a.id}
            className="glass rounded-xl px-4 py-3 flex items-center gap-4 hover:border-primary/20 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" title={a.document_name || doc?.name}>
                {doc?.name || a.document_name || 'Document'}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {assignmentTypeShort(a.assignment_type)} · Assigned by {a.assigned_by_name}
                {a.assigned_at ? ` · ${format(new Date(a.assigned_at), 'MMM d')}` : ''}
                {a.status === 'completed'
                  ? ` · Completed${a.completed_at ? ` ${format(new Date(a.completed_at), 'MMM d')}` : ''}`
                  : ''}
              </p>
              {a.note && (
                <p className="text-[11px] text-muted-foreground/80 mt-1 line-clamp-1">{a.note}</p>
              )}
            </div>

            <span
              className={`text-[11px] font-medium border rounded-full px-2 py-0.5 shrink-0 ${
                a.status === 'completed'
                  ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400'
                  : 'border-amber-500/30 bg-amber-500/15 text-amber-400'
              }`}
            >
              {assignmentStatusLabel(a.status)}
            </span>

            {canComplete && (
              <button
                type="button"
                onClick={() => onComplete?.(a)}
                disabled={busy}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11.5px] text-white/75 hover:text-white hover:border-white/20 transition-colors disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                Mark complete
              </button>
            )}

            {doc && (
              <button
                type="button"
                onClick={() => onOpenDocument?.(doc)}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-primary/90 px-2.5 py-1.5 text-[11.5px] font-medium text-primary-foreground hover:bg-primary transition-colors"
              >
                Open <ArrowRight className="w-3 h-3" />
              </button>
            )}

            {canManage && doc && (
              <button
                type="button"
                onClick={() => onManage?.(doc)}
                className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Manage
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}