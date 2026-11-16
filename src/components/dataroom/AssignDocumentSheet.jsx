import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, X, Check, RotateCcw, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  ASSIGNMENT_TYPES,
  assignmentTypeShort,
  assignmentStatusLabel,
  callDocumentAssignments,
  isCompletable,
} from '@/lib/documentAssignments';

/**
 * AssignDocumentSheet — assign a Data Room document to one or more team members.
 *
 * The roster comes from the BACKEND, derived from the business's own membership
 * records: only people already authorized for this business can appear, so a
 * member of another business is not offered (and would be refused — §12/§13).
 *
 * This is a PANEL, not a navigation step (§24/§25). It floats above whatever is
 * on screen (the viewer, or the Data Room), Escape closes only the panel, and the
 * document behind it never moves. `can_manage` is decided by the backend using
 * the existing role model (§14) — the UI only reflects it.
 *
 * LAYER: it renders in the GLOBAL `.layer-critical` layer (see the layering
 * contract in index.css), so it is portaled to the document root. Without that it
 * would inherit the workspace's stacking context and be painted UNDER the global
 * Ask Galileo bar and the notification arrival — an explicit confirmation is the
 * one thing those must never cover.
 */
export default function AssignDocumentSheet({
  document,
  businessId,
  assignments = [],
  meProfileId,
  canManage = false,
  onClose,
  onChanged,
}) {
  const [selected, setSelected] = useState([]);
  const [assignmentType, setAssignmentType] = useState('review');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  // Escape closes THIS panel only. Capture + stopPropagation keeps the viewer
  // beneath it (and the workspace shell) from closing as well (§24).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      onClose?.();
    };
    window.document.addEventListener('keydown', onKey, true);
    return () => window.document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const { data, isLoading } = useQuery({
    queryKey: ['document-assignment-roster', businessId],
    queryFn: () => callDocumentAssignments('roster', { active_business_id: businessId }),
    enabled: !!businessId,
    staleTime: 60_000,
  });

  const roster = data?.roster || [];
  const currentFor = (profileId) => assignments.find((a) => a.assignee_profile_id === profileId);

  const toggle = (profileId) =>
    setSelected((prev) =>
      prev.includes(profileId) ? prev.filter((id) => id !== profileId) : [...prev, profileId]
    );

  const handleAssign = async () => {
    if (selected.length === 0) return;
    setSaving(true);
    try {
      const res = await callDocumentAssignments('assign', {
        document_id: document.id,
        assignee_profile_ids: selected,
        assignment_type: assignmentType,
        note,
        active_business_id: businessId,
      });
      const names = (res.assignments || []).map((a) => a.assignee_name).join(', ');
      toast.success(`Assigned${names ? ` to ${names}` : ''}`);
      setSelected([]);
      setNote('');
      onChanged?.();
    } catch (e) {
      toast.error(e?.message || 'Could not assign that document');
    } finally {
      setSaving(false);
    }
  };

  const handleStatus = async (assignment) => {
    setBusyId(assignment.id);
    try {
      await callDocumentAssignments('setStatus', {
        assignment_id: assignment.id,
        status: assignment.status === 'completed' ? 'open' : 'completed',
        active_business_id: businessId,
      });
      onChanged?.();
    } catch (e) {
      toast.error(e?.message || 'Could not update that assignment');
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (assignment) => {
    setBusyId(assignment.id);
    try {
      await callDocumentAssignments('remove', {
        assignment_id: assignment.id,
        active_business_id: businessId,
      });
      toast.success('Assignment removed');
      onChanged?.();
    } catch (e) {
      toast.error(e?.message || 'Could not remove that assignment');
    } finally {
      setBusyId(null);
    }
  };

  return createPortal(
    <div
      className="layer-critical fixed inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[560px] max-h-[86vh] overflow-y-auto rounded-2xl border border-white/[0.09] bg-[rgba(9,9,13,0.97)] shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-vision-gold/80">
              Assign document
            </p>
            <h3 className="mt-1 truncate text-[15px] font-medium text-white/90" title={document?.name}>
              {document?.name || 'Document'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1.5 text-white/40 hover:bg-white/[0.05] hover:text-white/85 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          {/* Who needs this? */}
          {canManage && (
            <>
              <div className="space-y-2">
                <p className="text-[11.5px] text-white/70">Who needs this?</p>
                {isLoading ? (
                  <div className="flex items-center gap-2 py-3 text-[12px] text-white/45">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading your team…
                  </div>
                ) : roster.length === 0 ? (
                  <p className="flex items-center gap-2 py-2 text-[12px] text-white/45">
                    <Users className="h-3.5 w-3.5" /> No one else has access to this business yet.
                  </p>
                ) : (
                  <div className="max-h-52 space-y-1 overflow-y-auto">
                    {roster.map((p) => {
                      const checked = selected.includes(p.profile_id);
                      const existing = currentFor(p.profile_id);
                      return (
                        <button
                          key={p.profile_id}
                          type="button"
                          onClick={() => toggle(p.profile_id)}
                          className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${
                            checked
                              ? 'border-vision-gold/40 bg-vision-gold/[0.06]'
                              : 'border-white/[0.06] bg-white/[0.015] hover:border-white/[0.12]'
                          }`}
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-vision-gold/15 text-[10.5px] font-bold text-vision-gold">
                            {p.initials}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px] text-white/85">{p.full_name}</span>
                            <span className="block text-[10.5px] text-white/35">
                              {p.role_label}
                              {existing ? ` · already ${assignmentStatusLabel(existing.status).toLowerCase()}` : ''}
                            </span>
                          </span>
                          {checked && <Check className="h-3.5 w-3.5 shrink-0 text-vision-gold" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* What do they need to do? */}
              <div className="space-y-2">
                <p className="text-[11.5px] text-white/70">What do they need to do?</p>
                <div className="space-y-1.5">
                  {ASSIGNMENT_TYPES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setAssignmentType(t.id)}
                      className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${
                        assignmentType === t.id
                          ? 'border-vision-gold/40 bg-vision-gold/[0.06]'
                          : 'border-white/[0.06] bg-white/[0.015] hover:border-white/[0.12]'
                      }`}
                    >
                      <span
                        className={`mt-[3px] h-3.5 w-3.5 shrink-0 rounded-full border ${
                          assignmentType === t.id ? 'border-vision-gold bg-vision-gold' : 'border-white/25'
                        }`}
                      />
                      <span className="min-w-0">
                        <span className="block text-[12.5px] text-white/85">{t.label}</span>
                        <span className="block text-[10.5px] text-white/35">{t.hint}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Note */}
              <div className="space-y-1.5">
                <p className="text-[11.5px] text-white/70">Note (optional)</p>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Anything they should know…"
                  className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-[12.5px] text-white/85 outline-none placeholder:text-white/25 focus:border-vision-gold/40"
                />
              </div>

              <Button
                size="sm"
                onClick={handleAssign}
                disabled={saving || selected.length === 0}
                className="w-full gap-2 bg-vision-gold text-black hover:bg-vision-bright"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {selected.length > 1 ? `Assign to ${selected.length} people` : 'Assign'}
              </Button>
            </>
          )}

          {/* Current assignments — independently trackable (§5) */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
              Assigned to
            </p>
            {assignments.length === 0 ? (
              <p className="text-[12px] text-white/40">Nobody yet.</p>
            ) : (
              <div className="space-y-1.5">
                {assignments.map((a) => {
                  const mine = a.assignee_profile_id === meProfileId;
                  const busy = busyId === a.id;
                  const canComplete = isCompletable(a.assignment_type);
                  return (
                    <div
                      key={a.id}
                      className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.015] px-3 py-2"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[10.5px] font-bold text-white/70">
                        {(a.assignee_name || '?')
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] text-white/85">{a.assignee_name}</span>
                        <span className="block text-[10.5px] text-white/35">
                          {assignmentTypeShort(a.assignment_type)} · {assignmentStatusLabel(a.status)}
                          {a.note ? ` · ${a.note}` : ''}
                        </span>
                      </span>

                      {/* Completion is offered only where it means something:
                          FYI has no completion, because there is no reliable
                          "seen" state to record (§10). */}
                      {(mine || canManage) && canComplete && (
                        <button
                          type="button"
                          onClick={() => handleStatus(a)}
                          disabled={busy}
                          title={a.status === 'completed' ? 'Reopen' : 'Mark complete'}
                          className="shrink-0 rounded-lg p-1.5 text-white/45 hover:bg-white/[0.05] hover:text-white/85 transition-colors disabled:opacity-50"
                        >
                          {busy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : a.status === 'completed' ? (
                            <RotateCcw className="h-3.5 w-3.5" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}

                      {canManage && (
                        <button
                          type="button"
                          onClick={() => handleRemove(a)}
                          disabled={busy}
                          title="Remove assignment"
                          className="shrink-0 rounded-lg p-1.5 text-white/35 hover:bg-white/[0.05] hover:text-red-400 transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {!canManage && (
            <p className="text-[11px] text-white/35">
              Only the business owner or their advisor can change who a document is assigned to.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}