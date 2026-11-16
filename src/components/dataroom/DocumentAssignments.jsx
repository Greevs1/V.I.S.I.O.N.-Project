import React from 'react';
import { Users, Loader2 } from 'lucide-react';
import { assignmentTypeShort, assignmentStatusLabel, isCompletable } from '@/lib/documentAssignments';

/**
 * DocumentAssignments — the collaboration block that sits with a document.
 *
 * Used in the document viewer's metadata sidebar (§7): the document stays
 * primary, this is the metadata around it. Manage opens the assign panel — a
 * panel, never a navigation step, so closing it leaves the document exactly
 * where it was (§24).
 */
export default function DocumentAssignments({
  assignments = [],
  canManage = false,
  busyId = null,
  onComplete,
  onManage,
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Assigned to
        </p>
        {canManage && (
          <button
            type="button"
            onClick={onManage}
            className="text-[11px] text-primary hover:text-primary/80 transition-colors"
          >
            {assignments.length ? 'Manage' : 'Assign'}
          </button>
        )}
      </div>

      {assignments.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Not assigned to anyone yet.
        </p>
      ) : (
        <div className="space-y-1.5">
          {assignments.map((a) => (
            <div key={a.id} className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                {(a.assignee_name || '?')
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs truncate">{a.assignee_name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {assignmentTypeShort(a.assignment_type)} · {assignmentStatusLabel(a.status)}
                </p>
              </div>
              {isCompletable(a.assignment_type) && a.status === 'open' && (
                <button
                  type="button"
                  onClick={() => onComplete?.(a)}
                  disabled={busyId === a.id}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors shrink-0 disabled:opacity-50"
                >
                  {busyId === a.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Complete'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {assignments.length === 0 && !canManage && (
        <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
          <Users className="w-3 h-3" /> Nobody has been asked to act on this document.
        </p>
      )}
    </div>
  );
}