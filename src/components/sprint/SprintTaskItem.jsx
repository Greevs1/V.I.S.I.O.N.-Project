import React, { useState } from 'react';
import { Calendar, Clock, User, FileText, MessageSquare, Paperclip, ChevronDown, ChevronRight, CheckCircle2, Circle, Loader2, Bell, Trash2, X, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import AssignOwnerModal from '@/components/sprint/AssignOwnerModal';
import ReminderModal from '@/components/sprint/ReminderModal';
import AttachDocumentModal from '@/components/sprint/AttachDocumentModal';
import EvidenceSection from '@/components/sprint/EvidenceSection';
import ExplainableText from '@/components/galileo/explain/ExplainableText';


const PRIORITY_COLORS = {
  critical: 'text-red-400 border-red-500/30 bg-red-500/10',
  high: 'text-orange-400 border-orange-500/30 bg-orange-500/10',
  medium: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  low: 'text-slate-400 border-slate-500/30 bg-slate-500/10',
};

const EASE_COLORS = {
  easy: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  medium: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  advanced: 'text-red-400 border-red-500/30 bg-red-500/10',
};

/**
 * ExpertBadge — the blue expert-role pill: "who could help me do this?".
 *
 * It stays clickable for EVERYONE. What it opens depends on Expert entitlement
 * (resolved in ONE place, resolveExpertAccess) — the pill itself is not a
 * paywall, because "who could help me with this?" is a useful question whether
 * or not you have hired anyone.
 *
 * The reasoning stays on hover/focus, so the pill is informative before anyone
 * clicks it. It stays a small pill, not a button.
 */
function ExpertBadge({ type, reason, onOpen }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        type="button"
        aria-label={`Get help from a ${type} for this task`}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        onClick={() => onOpen?.()}
        className="text-[9px] font-medium border rounded-full px-1.5 py-0.5 border-cyan-500/30 bg-cyan-500/10 text-cyan-400 flex items-center gap-0.5 cursor-pointer transition-colors hover:border-cyan-400/60 hover:bg-cyan-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
      >
        <UserCheck className="w-2.5 h-2.5" />
        {type}
      </button>
      {show && reason && (
        <div className="absolute right-0 top-5 z-20 w-52 bg-popover border border-border rounded-lg p-2.5 shadow-xl text-[10px] text-muted-foreground leading-relaxed">
          <p className="font-semibold text-foreground mb-0.5">Expert Recommended</p>
          <p>{reason}</p>
          <p className="mt-1 text-[9px] text-cyan-400">Click for expert support →</p>
        </div>
      )}
    </div>
  );
}

const IMPACT_COLORS = {
  critical: 'text-red-400 border-red-500/30 bg-red-500/10',
  high: 'text-orange-400 border-orange-500/30 bg-orange-500/10',
  medium: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  low: 'text-slate-400 border-slate-500/30 bg-slate-500/10',
};

export default function SprintTaskItem({
  task,
  sprintId,
  subtasks,
  notes,
  docs,
  reminders,
  onUpdate,
  isLocked,
  onExpertHelp,
}) {
  const { role } = useAuth();
  const isAdmin = role === 'admin' || role === 'super_admin';
  const canEdit = !isLocked || isAdmin;

  const [expanded, setExpanded] = useState(false);
  const [changing, setChanging] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState(null);
  const [deletingSubtaskId, setDeletingSubtaskId] = useState(null);

  // Modals
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [showAttachModal, setShowAttachModal] = useState(false);

  const handleToggle = async () => {
    setChanging(true);
    const newStatus = task.status === 'completed' ? 'not_started' : 'completed';
    try {
      await base44.functions.invoke('ninetyDaySprint', {
        action: 'updateTask',
        data: { task_id: task.id, status: newStatus },
      });
      onUpdate();
    } catch (e) {
      console.error('updateTask error:', e);
    }
    setChanging(false);
  };

  const handleToggleSubtask = async (subtask) => {
    const newStatus = subtask.status === 'completed' ? 'not_started' : 'completed';
    try {
      await base44.functions.invoke('ninetyDaySprint', {
        action: 'updateTask',
        data: { task_id: subtask.id, status: newStatus },
      });
      onUpdate();
    } catch (e) {
      console.error('updateTask error:', e);
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    setAddingNote(true);
    try {
      await base44.functions.invoke('ninetyDaySprint', {
        action: 'addNote',
        data: { task_id: task.id, sprint_id: sprintId, note_text: noteText.trim() },
      });
      setNoteText('');
      setShowNoteInput(false);
      onUpdate();
    } catch (e) {
      console.error('addNote error:', e);
    }
    setAddingNote(false);
  };

  const handleDeleteNote = async (noteId) => {
    setDeletingNoteId(noteId);
    try {
      await base44.functions.invoke('ninetyDaySprint', {
        action: 'deleteNote',
        data: { note_id: noteId },
      });
      onUpdate();
    } catch (e) {
      console.error('deleteNote error:', e);
    }
    setDeletingNoteId(null);
  };

  const handleDeleteSubtask = async (subtaskId) => {
    setDeletingSubtaskId(subtaskId);
    try {
      await base44.functions.invoke('ninetyDaySprint', {
        action: 'deleteSubtask',
        data: { task_id: subtaskId },
      });
      onUpdate();
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || '';
      if (msg.includes('locked')) alert(msg);
      console.error('deleteSubtask error:', e);
    }
    setDeletingSubtaskId(null);
  };

  const handleAssign = ({ id, name, email }) => {
    base44.functions.invoke('ninetyDaySprint', {
      action: 'assignTask',
      data: { task_id: task.id, assigned_to_id: id, assigned_to_name: name },
    }).then(() => onUpdate()).catch(e => console.error('assignTask error:', e));
  };

  const handleOpenDocument = async (doc) => {
    try {
      const res = await base44.functions.invoke('supabaseUserData', {
        action: 'getDocumentSignedUrl',
        data: { documentId: doc.document_id },
      });
      if (res.data?.signedUrl) window.open(res.data.signedUrl, '_blank');
    } catch (e) {
      console.error('getDocumentSignedUrl error:', e);
    }
  };

  const handleDetachDocument = async (attachmentId) => {
    try {
      await base44.functions.invoke('ninetyDaySprint', {
        action: 'detachDocument',
        data: { attachment_id: attachmentId },
      });
      onUpdate();
    } catch (e) {
      console.error('detachDocument error:', e);
    }
  };

  const taskNotes = notes.filter(n => n.task_id === task.id);
  const taskDocs = docs.filter(d => d.task_id === task.id);
  const taskSubtasks = subtasks.filter(s => s.parent_task_id === task.id && !s.is_deleted);
  const taskReminders = (reminders || []).filter(r => r.task_id === task.id);
  const isComplete = task.status === 'completed';
  const hasDetails = taskSubtasks.length > 0 || taskNotes.length > 0 || taskDocs.length > 0;

  return (
    <div className={`rounded-lg border transition-all flex-1 ${isComplete ? 'border-emerald-500/20 opacity-75' : 'border-border'}`} style={{ backgroundColor: '#141418' }}>
      <div className="p-3.5">
        <div className="flex items-start gap-3">
          {/* Check */}
          <button onClick={handleToggle} disabled={changing} className="mt-0.5 shrink-0">
            {changing ? (
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            ) : isComplete ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            ) : (
              <Circle className="w-5 h-5 text-muted-foreground hover:text-primary transition-colors" />
            )}
          </button>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className={`text-sm font-medium ${isComplete ? 'line-through text-muted-foreground' : ''}`}>
                  {/* A generated task can carry professional language ("perform
                      cohort analysis"). The term stays; the owner can learn it
                      before deciding to do it or bring in an expert (§26). */}
                  <ExplainableText text={task.title} surface="sprint_task" />
                </p>
                {task.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>
                )}
                <EvidenceSection
                  reason={task.task_reason}
                  evidence={task.task_evidence}
                  impact={task.expected_outcome}
                  confidence={task.confidence_score}
                />
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  {task.is_galileo_generated && (
                    <span className="text-[9px] text-primary font-medium">✨ Galileo</span>
                  )}
                  {task.priority && (
                    <span className={`text-[9px] font-medium border rounded-full px-1.5 py-0.5 ${PRIORITY_COLORS[task.priority] || ''}`}>
                      {task.priority}
                    </span>
                  )}
                  {task.ease && (
                    <span className={`text-[9px] font-medium border rounded-full px-1.5 py-0.5 ${EASE_COLORS[task.ease] || ''}`}>
                      {task.ease}
                    </span>
                  )}
                </div>
                {task.expert_needed && task.recommended_expert_type && (
                  <ExpertBadge
                    type={task.recommended_expert_type}
                    reason={task.expert_reason}
                    onOpen={() => onExpertHelp?.(task)}
                  />
                )}
              </div>
            </div>

            {/* Meta row */}
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {task.due_date && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> {task.due_date}
                </span>
              )}
              {task.assigned_to_name && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <User className="w-3 h-3" /> {task.assigned_to_name}
                </span>
              )}
              {task.estimated_time && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {task.estimated_time}
                </span>
              )}
              {taskNotes.length > 0 && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <MessageSquare className="w-3 h-3" /> {taskNotes.length}
                </span>
              )}
              {taskDocs.length > 0 && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Paperclip className="w-3 h-3" /> {taskDocs.length}
                </span>
              )}
              {taskReminders.length > 0 && (
                <span className="text-[10px] text-primary flex items-center gap-1">
                  <Bell className="w-3 h-3" /> Reminder set
                </span>
              )}
              {taskSubtasks.length > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  {taskSubtasks.filter(s => s.status === 'completed').length}/{taskSubtasks.length} subtasks
                </span>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1 mt-2">
              {hasDetails && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-secondary/50"
                >
                  {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  {expanded ? 'Collapse' : 'Details'}
                </button>
              )}
              <button
                onClick={() => setShowAssignModal(true)}
                className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-secondary/50"
                title="Assign owner"
              >
                <User className="w-3 h-3" /> Assign
              </button>
              <button
                onClick={() => setShowReminderModal(true)}
                className={`text-[10px] flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-secondary/50 ${taskReminders.length > 0 ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                title="Set reminder"
              >
                <Bell className="w-3 h-3" /> Remind
              </button>
              <button
                onClick={() => setShowNoteInput(!showNoteInput)}
                className={`text-[10px] flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-secondary/50 ${showNoteInput ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                title="Add note"
              >
                <MessageSquare className="w-3 h-3" /> Note
              </button>
              <button
                onClick={() => setShowAttachModal(true)}
                className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-secondary/50"
                title="Attach document"
              >
                <Paperclip className="w-3 h-3" /> Attach
              </button>
            </div>

            {/* Note input */}
            {showNoteInput && (
              <div className="mt-2 flex gap-2">
                <input
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddNote()}
                  placeholder="Add a note..."
                  className="flex-1 h-8 bg-secondary border border-border rounded-lg px-2 text-xs outline-none focus:border-primary/50"
                  autoFocus
                />
                <Button size="sm" className="h-8 text-xs" onClick={handleAddNote} disabled={addingNote || !noteText.trim()}>
                  {addingNote ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Add'}
                </Button>
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { setShowNoteInput(false); setNoteText(''); }}>
                  Cancel
                </Button>
              </div>
            )}

            {/* Expanded content */}
            {expanded && (
              <div className="mt-3 space-y-3">
                {/* Notes */}
                {taskNotes.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Notes</p>
                    {taskNotes.map(n => (
                      <div key={n.id} className="flex items-start gap-2 text-[11px] text-muted-foreground bg-secondary/50 rounded px-2 py-1.5 group">
                        <span className="flex-1">
                          <span className="text-[10px] font-medium text-primary">{n.created_by_name}:</span> {n.note_text}
                        </span>
                        <button
                          onClick={() => handleDeleteNote(n.id)}
                          disabled={deletingNoteId === n.id}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 shrink-0 transition-all"
                        >
                          {deletingNoteId === n.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Subtasks */}
                {taskSubtasks.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Subtasks</p>
                    <div className="pl-2 space-y-1">
                      {taskSubtasks.map(st => (
                        <div key={st.id} className="flex items-center gap-2 group">
                          <button onClick={() => handleToggleSubtask(st)} className="shrink-0">
                            {st.status === 'completed' ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Circle className="w-3.5 h-3.5 text-muted-foreground hover:text-primary" />
                            )}
                          </button>
                          <span className={`text-xs flex-1 ${st.status === 'completed' ? 'line-through text-muted-foreground' : 'text-muted-foreground'}`}>
                            {st.title}
                          </span>
                          {st.assigned_to_name && (
                            <span className="text-[9px] text-muted-foreground">{st.assigned_to_name}</span>
                          )}
                          {st.is_user_created && (
                            <button
                              onClick={() => handleDeleteSubtask(st.id)}
                              disabled={deletingSubtaskId === st.id}
                              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 shrink-0 transition-all"
                            >
                              {deletingSubtaskId === st.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Attached docs */}
                {taskDocs.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Documents</p>
                    {taskDocs.map(d => (
                      <div key={d.id} className="flex items-center gap-2 text-[11px] group">
                        <FileText className="w-3 h-3 text-primary shrink-0" />
                        <button
                          onClick={() => handleOpenDocument(d)}
                          className="text-primary hover:underline truncate text-left"
                        >
                          {d.document_name || 'Document'}
                        </button>
                        <button
                          onClick={() => handleDetachDocument(d.id)}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 shrink-0 transition-all ml-auto"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {showAssignModal && (
        <AssignOwnerModal
          onClose={() => setShowAssignModal(false)}
          onAssign={handleAssign}
        />
      )}
      {showReminderModal && (
        <ReminderModal
          onClose={() => setShowReminderModal(false)}
          taskId={task.id}
          sprintId={sprintId}
          onSaved={() => { setShowReminderModal(false); onUpdate(); }}
        />
      )}
      {showAttachModal && (
        <AttachDocumentModal
          onClose={() => setShowAttachModal(false)}
          taskId={task.id}
          sprintId={sprintId}
          onAttached={() => onUpdate()}
        />
      )}
    </div>
  );
}