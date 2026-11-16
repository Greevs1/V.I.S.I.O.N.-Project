/**
 * ClientNotesEditor — Apple Notes-style advisor note workspace.
 * All 10 tests: create, title, rich text, persist, follow-up,
 * create task, pin, archive, admin view, expert portal view.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Search, Pin, Archive, Loader2, Check, Clock,
  FileText, Calendar, Bold, Italic, Underline,
  List, ListOrdered, AlignLeft, AlignCenter, AlignRight,
  Link2, CheckSquare, PlusCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// ── Constants ──────────────────────────────────────────────────────────────────

const NOTE_TYPES = [
  { value: 'general_note',         label: 'General Note' },
  { value: 'strategy_note',        label: 'Strategy' },
  { value: 'sprint_note',          label: 'Sprint' },
  { value: 'outcome_note',         label: 'Outcome' },
  { value: 'document_review_note', label: 'Doc Review' },
  { value: 'client_call_note',     label: 'Client Call' },
  { value: 'follow_up_needed',     label: 'Follow-Up' },
];

const VISIBILITY_OPTIONS = [
  { value: 'internal_only',  label: 'Internal Only',  color: '#ef4444' },
  { value: 'advisor_team',   label: 'Advisor Team',   color: '#f59e0b' },
  { value: 'client_visible', label: 'Client Visible', color: '#22c55e' },
];

const vis = (v) => VISIBILITY_OPTIONS.find(o => o.value === v) || VISIBILITY_OPTIONS[0];
const typeLabel = (t) => NOTE_TYPES.find(n => n.value === t)?.label || t;

function timeAgo(d) {
  if (!d) return '';
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(d).toLocaleDateString();
}

function isOverdue(d) {
  if (!d) return false;
  return new Date(d) < new Date(new Date().toDateString()); // compare by day
}

// ── Rich Toolbar ───────────────────────────────────────────────────────────────
function RichToolbar({ editorRef }) {
  const exec = (cmd, val) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val || null);
  };

  const addLink = () => {
    const url = window.prompt('Enter URL:', 'https://');
    if (url) exec('createLink', url);
  };

  const addChecklist = () => {
    exec('insertHTML', '<ul style="list-style:none;padding-left:0"><li><input type="checkbox"> </li></ul>');
  };

  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-border bg-card flex-wrap shrink-0">
      {/* Bold / Italic / Underline */}
      {[
        { icon: Bold,      cmd: 'bold',      title: 'Bold (Ctrl+B)' },
        { icon: Italic,    cmd: 'italic',    title: 'Italic (Ctrl+I)' },
        { icon: Underline, cmd: 'underline', title: 'Underline (Ctrl+U)' },
      ].map(({ icon: Icon, cmd, title }) => (
        <button key={cmd} title={title}
          onMouseDown={e => { e.preventDefault(); exec(cmd); }}
          className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}

      <div className="w-px h-4 bg-border mx-0.5" />

      {/* Headings */}
      {['H1','H2','H3'].map(h => (
        <button key={h} title={`Heading ${h[1]}`}
          onMouseDown={e => { e.preventDefault(); exec('formatBlock', `<${h.toLowerCase()}>`); }}
          className="px-1.5 py-0.5 text-[10px] font-bold rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
          {h}
        </button>
      ))}
      <button title="Paragraph"
        onMouseDown={e => { e.preventDefault(); exec('formatBlock', '<p>'); }}
        className="px-1.5 py-0.5 text-[10px] rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
        ¶
      </button>

      <div className="w-px h-4 bg-border mx-0.5" />

      {/* Alignment */}
      {[
        { icon: AlignLeft,   cmd: 'justifyLeft',   title: 'Align Left' },
        { icon: AlignCenter, cmd: 'justifyCenter',  title: 'Center' },
        { icon: AlignRight,  cmd: 'justifyRight',   title: 'Align Right' },
      ].map(({ icon: Icon, cmd, title }) => (
        <button key={cmd} title={title}
          onMouseDown={e => { e.preventDefault(); exec(cmd); }}
          className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}

      <div className="w-px h-4 bg-border mx-0.5" />

      {/* Lists */}
      <button title="Bullet List"
        onMouseDown={e => { e.preventDefault(); exec('insertUnorderedList'); }}
        className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
        <List className="w-3.5 h-3.5" />
      </button>
      <button title="Numbered List"
        onMouseDown={e => { e.preventDefault(); exec('insertOrderedList'); }}
        className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
        <ListOrdered className="w-3.5 h-3.5" />
      </button>
      <button title="Checklist"
        onMouseDown={e => { e.preventDefault(); addChecklist(); }}
        className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
        <CheckSquare className="w-3.5 h-3.5" />
      </button>

      <div className="w-px h-4 bg-border mx-0.5" />

      {/* Link */}
      <button title="Insert Link"
        onMouseDown={e => { e.preventDefault(); addLink(); }}
        className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
        <Link2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── Note List Item ─────────────────────────────────────────────────────────────
function NoteListItem({ note, active, onClick }) {
  const fColor = note.follow_up_status === 'overdue' ? '#ef4444'
    : note.follow_up_status === 'open' ? '#f59e0b' : null;
  const vcfg = vis(note.visibility);
  return (
    <button onClick={onClick}
      className={`w-full text-left px-3 py-3 rounded-lg transition-all border ${
        active ? 'bg-primary/10 border-primary/30' : 'border-transparent hover:bg-secondary/60'
      }`}
    >
      <div className="flex items-start gap-1.5">
        {note.pinned && <Pin className="w-3 h-3 text-primary shrink-0 mt-0.5" />}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate">{note.title || 'Untitled'}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
            {(note.plain_text || '').replace(/<[^>]+>/g, ' ').slice(0, 80)}
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-[10px]" style={{ color: vcfg.color }}>● {vcfg.label}</span>
            <span className="text-[10px] text-muted-foreground/70">{typeLabel(note.note_type)}</span>
            {fColor && <span className="text-[10px]" style={{ color: fColor }}>↗ {note.follow_up_status}</span>}
          </div>
          <p className="text-[10px] text-muted-foreground/50 mt-0.5">{timeAgo(note.updated_date)}</p>
        </div>
      </div>
    </button>
  );
}

// ── Create Task Modal ──────────────────────────────────────────────────────────
function CreateTaskModal({ noteTitle, profileId, onClose }) {
  const [taskTitle, setTaskTitle] = useState(`Follow up: ${noteTitle || 'Note'}`);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const handleCreate = async () => {
    setSaving(true);
    // Create a SprintTask tied to the profile — uses existing entity
    await base44.entities.SprintTask.create({
      title: taskTitle,
      sprint_id: 'advisor_note_task',
      task_type: 'main_task',
      status: 'not_started',
      priority: 'medium',
      description: `Created from advisor note for client profile: ${profileId}`,
      is_user_created: true,
    });
    setSaving(false);
    setDone(true);
    setTimeout(onClose, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-2xl space-y-4">
        <p className="text-sm font-semibold">Create Task from Note</p>
        <input
          value={taskTitle}
          onChange={e => setTaskTitle(e.target.value)}
          className="w-full h-9 bg-secondary border border-border rounded-lg px-3 text-sm outline-none focus:border-primary/50"
          placeholder="Task title…"
          autoFocus
        />
        <div className="flex items-center gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleCreate} disabled={saving || done || !taskTitle.trim()}>
            {done ? <><Check className="w-3.5 h-3.5 mr-1" /> Created</> : saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Create Task'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function ClientNotesEditor({ profileId, businessId, currentUserName, currentUserProfileId }) {
  const queryClient = useQueryClient();
  const editorRef = useRef(null);

  // ── List state
  const [selectedNoteId, setSelectedNoteId] = useState(null);
  const [isNewMode, setIsNewMode] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('newest');
  const [followUpTab, setFollowUpTab] = useState('all');

  // ── Editor state — use refs for values that autosave reads to avoid stale closures
  const [editorTitle, setEditorTitle] = useState('');
  const [editorHtml, setEditorHtml] = useState('');
  const [editorNoteType, setEditorNoteType] = useState('general_note');
  const [editorVisibility, setEditorVisibility] = useState('internal_only');
  const [editorPinned, setEditorPinned] = useState(false);
  const [editorFollowUpDate, setEditorFollowUpDate] = useState('');
  const [editorFollowUpStatus, setEditorFollowUpStatus] = useState('none');

  // Refs mirror state so the debounced save always reads fresh values
  const titleRef = useRef('');
  const htmlRef = useRef('');
  const noteTypeRef = useRef('general_note');
  const visibilityRef = useRef('internal_only');
  const pinnedRef = useRef(false);
  const followUpDateRef = useRef('');
  const followUpStatusRef = useRef('none');
  const selectedNoteIdRef = useRef(null);
  const isNewModeRef = useRef(false);
  const profileIdRef = useRef(profileId);

  useEffect(() => { profileIdRef.current = profileId; }, [profileId]);

  // ── Autosave
  const [saveStatus, setSaveStatus] = useState('idle');
  const [isDirty, setIsDirty] = useState(false);
  const autoSaveTimer = useRef(null);

  // ── Task modal
  const [showTaskModal, setShowTaskModal] = useState(false);

  // ── Fetch notes
  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['client-notes', profileId],
    queryFn: () => base44.entities.ClientNote.filter(
      { profile_id: profileId, status: 'active' }, '-updated_date', 100
    ),
    enabled: !!profileId,
    staleTime: 15_000,
  });

  // ── Derived list
  const filtered = (() => {
    let list = [...notes];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(n => n.title?.toLowerCase().includes(q) || n.plain_text?.toLowerCase().includes(q));
    }
    if (typeFilter !== 'all') list = list.filter(n => n.note_type === typeFilter);
    if (followUpTab === 'follow_ups') list = list.filter(n => n.follow_up_status && n.follow_up_status !== 'none');
    const pinned = list.filter(n => n.pinned);
    const rest   = list.filter(n => !n.pinned);
    const fn = sortOrder === 'newest'
      ? (a, b) => new Date(b.updated_date || 0) - new Date(a.updated_date || 0)
      : (a, b) => new Date(a.updated_date || 0) - new Date(b.updated_date || 0);
    return [...pinned.sort(fn), ...rest.sort(fn)];
  })();

  const overdueCount = notes.filter(n =>
    (n.follow_up_status === 'overdue') ||
    (n.follow_up_date && isOverdue(n.follow_up_date) && n.follow_up_status === 'open')
  ).length;

  const selectedNote = notes.find(n => n.id === selectedNoteId) || null;
  const isEditorOpen = isNewMode || !!selectedNoteId;

  // ── Sync state→refs
  const syncRefs = useCallback((vals) => {
    if (vals.title     !== undefined) titleRef.current          = vals.title;
    if (vals.html      !== undefined) htmlRef.current           = vals.html;
    if (vals.noteType  !== undefined) noteTypeRef.current       = vals.noteType;
    if (vals.visibility!== undefined) visibilityRef.current     = vals.visibility;
    if (vals.pinned    !== undefined) pinnedRef.current         = vals.pinned;
    if (vals.fuDate    !== undefined) followUpDateRef.current   = vals.fuDate;
    if (vals.fuStatus  !== undefined) followUpStatusRef.current = vals.fuStatus;
  }, []);

  // ── Load note into editor when selection changes
  useEffect(() => {
    if (selectedNote) {
      const t  = selectedNote.title || '';
      const h  = selectedNote.content_html || '';
      const nt = selectedNote.note_type || 'general_note';
      const vi = selectedNote.visibility || 'internal_only';
      const pi = !!selectedNote.pinned;
      const fd = selectedNote.follow_up_date || '';
      const fs = selectedNote.follow_up_status || 'none';

      setEditorTitle(t);
      setEditorHtml(h);
      setEditorNoteType(nt);
      setEditorVisibility(vi);
      setEditorPinned(pi);
      setEditorFollowUpDate(fd);
      setEditorFollowUpStatus(fs);
      syncRefs({ title: t, html: h, noteType: nt, visibility: vi, pinned: pi, fuDate: fd, fuStatus: fs });

      // Inject into contenteditable
      if (editorRef.current) editorRef.current.innerHTML = h;

      setIsDirty(false);
      setSaveStatus('idle');
    }
  }, [selectedNoteId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Core save function — reads from refs, no stale closures
  const executeSave = useCallback(async () => {
    const pid = profileIdRef.current;
    if (!pid) return;
    if (!selectedNoteIdRef.current && !isNewModeRef.current) return;

    setSaveStatus('saving');
    const html  = htmlRef.current;
    const plain = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
    const payload = {
      profile_id:            pid,
      business_id:           businessId || null,
      created_by_profile_id: currentUserProfileId || null,
      created_by_name:       currentUserName || null,
      title:                 titleRef.current || 'Untitled',
      content_html:          html,
      plain_text:            plain,
      note_type:             noteTypeRef.current,
      visibility:            visibilityRef.current,
      pinned:                pinnedRef.current,
      follow_up_date:        followUpDateRef.current || null,
      follow_up_status:      followUpDateRef.current
        ? (followUpStatusRef.current === 'none' ? 'open' : followUpStatusRef.current)
        : 'none',
      status: 'active',
    };

    try {
      const nid = selectedNoteIdRef.current;
      if (nid) {
        await base44.entities.ClientNote.update(nid, payload);
      } else {
        const saved = await base44.entities.ClientNote.create(payload);
        selectedNoteIdRef.current = saved.id;
        setSelectedNoteId(saved.id);
        setIsNewMode(false);
        isNewModeRef.current = false;
      }
      setSaveStatus('saved');
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: ['client-notes', pid] });
      setTimeout(() => setSaveStatus(s => s === 'saved' ? 'idle' : s), 2500);
    } catch {
      setSaveStatus('error');
    }
  }, [businessId, currentUserProfileId, currentUserName, queryClient]);

  // ── Schedule autosave (debounced 1.5s)
  const scheduleAutosave = useCallback(() => {
    setIsDirty(true);
    setSaveStatus('idle');
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(executeSave, 1500);
  }, [executeSave]);

  useEffect(() => () => clearTimeout(autoSaveTimer.current), []);

  // ── New note
  const handleNewNote = () => {
    clearTimeout(autoSaveTimer.current);
    setSelectedNoteId(null);
    selectedNoteIdRef.current = null;
    setIsNewMode(true);
    isNewModeRef.current = true;

    setEditorTitle('');
    setEditorHtml('');
    setEditorNoteType('general_note');
    setEditorVisibility('internal_only');
    setEditorPinned(false);
    setEditorFollowUpDate('');
    setEditorFollowUpStatus('none');
    syncRefs({ title: '', html: '', noteType: 'general_note', visibility: 'internal_only', pinned: false, fuDate: '', fuStatus: 'none' });

    if (editorRef.current) editorRef.current.innerHTML = '';
    setIsDirty(false);
    setSaveStatus('idle');
  };

  // ── Select existing note
  const handleSelectNote = (note) => {
    clearTimeout(autoSaveTimer.current);
    setIsNewMode(false);
    isNewModeRef.current = false;
    selectedNoteIdRef.current = note.id;
    setSelectedNoteId(note.id);
  };

  // ── Archive note
  const handleArchive = async () => {
    if (!selectedNoteId) return;
    clearTimeout(autoSaveTimer.current);
    await base44.entities.ClientNote.update(selectedNoteId, { status: 'archived' });
    queryClient.invalidateQueries({ queryKey: ['client-notes', profileId] });
    setSelectedNoteId(null);
    selectedNoteIdRef.current = null;
    setIsNewMode(false);
    isNewModeRef.current = false;
  };

  // ── Toggle pin (immediate save)
  const handleTogglePin = () => {
    const np = !editorPinned;
    setEditorPinned(np);
    pinnedRef.current = np;
    scheduleAutosave();
  };

  // ── Helpers to update state+ref+autosave together
  const updateTitle = (v) => { setEditorTitle(v); titleRef.current = v; scheduleAutosave(); };
  const updateHtml  = (v) => { setEditorHtml(v);  htmlRef.current  = v; scheduleAutosave(); };
  const updateNoteType = (v) => { setEditorNoteType(v); noteTypeRef.current = v; scheduleAutosave(); };
  const updateVisibility = (v) => { setEditorVisibility(v); visibilityRef.current = v; scheduleAutosave(); };
  const updateFollowUpDate = (v) => { setEditorFollowUpDate(v); followUpDateRef.current = v; scheduleAutosave(); };
  const updateFollowUpStatus = (v) => { setEditorFollowUpStatus(v); followUpStatusRef.current = v; scheduleAutosave(); };

  const vcfg = vis(editorVisibility);

  return (
    <>
      <div className="flex rounded-xl border border-border overflow-hidden bg-card" style={{ minHeight: 560 }}>

        {/* ── Left panel: note list ──────────────────────────────────────── */}
        <div className="w-64 border-r border-border flex flex-col shrink-0">
          <div className="px-3 pt-3 pb-2 border-b border-border space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Notes {notes.length > 0 && <span className="opacity-60">({notes.length})</span>}
              </p>
              <button onClick={handleNewNote}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary text-primary-foreground text-[10px] font-semibold hover:bg-primary/90 transition-colors">
                <Plus className="w-3 h-3" /> New
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search notes…"
                className="w-full h-7 bg-secondary border border-border rounded-lg pl-7 pr-2 text-xs outline-none focus:border-primary/40" />
            </div>

            {/* All / Follow-Ups tabs */}
            <div className="flex items-center gap-0.5 bg-secondary rounded-lg p-0.5">
              {[
                { id: 'all',        label: 'All' },
                { id: 'follow_ups', label: overdueCount > 0 ? `Follow-Ups (${overdueCount})` : 'Follow-Ups' },
              ].map(t => (
                <button key={t.id} onClick={() => setFollowUpTab(t.id)}
                  className={`flex-1 py-1 rounded text-[10px] font-medium transition-all ${
                    followUpTab === t.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}>{t.label}</button>
              ))}
            </div>

            {/* Type + Sort */}
            <div className="flex items-center gap-1">
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                className="flex-1 h-6 bg-secondary border border-border rounded text-[10px] px-1 outline-none text-muted-foreground">
                <option value="all">All Types</option>
                {NOTE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <button onClick={() => setSortOrder(s => s === 'newest' ? 'oldest' : 'newest')}
                className="text-[10px] text-primary hover:underline whitespace-nowrap">
                {sortOrder === 'newest' ? '↓ New' : '↑ Old'}
              </button>
            </div>
          </div>

          {/* Note list */}
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {isLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {!isLoading && filtered.length === 0 && (
              <div className="text-center py-8 px-3 space-y-2">
                <FileText className="w-6 h-6 mx-auto text-muted-foreground/30" />
                <p className="text-[11px] text-muted-foreground">
                  {search || typeFilter !== 'all' ? 'No notes match.' : 'No notes yet. Click + New to start.'}
                </p>
              </div>
            )}
            {filtered.map(note => (
              <NoteListItem
                key={note.id}
                note={note}
                active={note.id === selectedNoteId && !isNewMode}
                onClick={() => handleSelectNote(note)}
              />
            ))}
          </div>
        </div>

        {/* ── Right panel: editor ────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          {!isEditorOpen ? (
            <div className="flex-1 flex items-center justify-center text-center p-10">
              <div>
                <FileText className="w-10 h-10 mx-auto text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">Select a note or create a new one.</p>
                <button onClick={handleNewNote}
                  className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
                  + New Note
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Top bar: title + controls */}
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-card flex-wrap shrink-0">
                <input
                  value={editorTitle}
                  onChange={e => updateTitle(e.target.value)}
                  placeholder="Note title…"
                  className="flex-1 min-w-0 text-sm font-semibold bg-transparent outline-none border-b border-transparent focus:border-primary/50 py-0.5 transition-colors"
                />
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Autosave status */}
                  {saveStatus === 'saving' && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Loader2 className="w-3 h-3 animate-spin" /> Saving…
                    </span>
                  )}
                  {saveStatus === 'saved' && (
                    <span className="flex items-center gap-1 text-xs text-emerald-400">
                      <Check className="w-3 h-3" /> Saved
                    </span>
                  )}
                  {saveStatus === 'error' && <span className="text-xs text-destructive">Save failed</span>}
                  {saveStatus === 'idle' && isDirty && <span className="text-xs text-amber-400">Unsaved changes</span>}

                  {/* Pin */}
                  <button onClick={handleTogglePin} title={editorPinned ? 'Unpin' : 'Pin'}
                    className={`p-1.5 rounded transition-colors ${editorPinned ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
                    <Pin className="w-3.5 h-3.5" />
                  </button>

                  {/* Create Task */}
                  <button onClick={() => setShowTaskModal(true)} title="Create Task"
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors">
                    <PlusCircle className="w-3 h-3" /> Task
                  </button>

                  {/* Archive */}
                  {selectedNoteId && (
                    <button onClick={handleArchive} title="Archive note"
                      className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors">
                      <Archive className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Manual save */}
                  <Button size="sm" className="h-7 text-xs" onClick={executeSave}>Save</Button>
                </div>
              </div>

              {/* Metadata row */}
              <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card/40 flex-wrap shrink-0">
                <select value={editorNoteType} onChange={e => updateNoteType(e.target.value)}
                  className="h-6 bg-secondary border border-border rounded text-[10px] px-1.5 outline-none text-muted-foreground focus:border-primary/40">
                  {NOTE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>

                <select value={editorVisibility} onChange={e => updateVisibility(e.target.value)}
                  className="h-6 bg-secondary border border-border rounded text-[10px] px-1.5 outline-none focus:border-primary/40 font-medium"
                  style={{ color: vcfg.color }}>
                  {VISIBILITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>

                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-muted-foreground shrink-0" />
                  <input type="date" value={editorFollowUpDate}
                    onChange={e => updateFollowUpDate(e.target.value)}
                    title="Follow-up date"
                    className="h-6 w-28 bg-secondary border border-border rounded text-[10px] px-1.5 outline-none text-muted-foreground focus:border-primary/40" />
                  {editorFollowUpDate && (
                    <button onClick={() => updateFollowUpDate('')}
                      className="text-[10px] text-muted-foreground hover:text-destructive ml-0.5">✕</button>
                  )}
                </div>

                {editorFollowUpDate && (
                  <select value={editorFollowUpStatus} onChange={e => updateFollowUpStatus(e.target.value)}
                    className="h-6 bg-secondary border border-border rounded text-[10px] px-1.5 outline-none text-muted-foreground focus:border-primary/40">
                    <option value="open">Open</option>
                    <option value="completed">Completed</option>
                    <option value="overdue">Overdue</option>
                  </select>
                )}

                {selectedNote && (
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {selectedNote.created_by_name ? `By ${selectedNote.created_by_name} · ` : ''}
                    {selectedNote.updated_date ? `Updated ${timeAgo(selectedNote.updated_date)}` : 'New'}
                  </span>
                )}
                {isNewMode && <span className="text-[10px] text-muted-foreground ml-auto">New note</span>}
              </div>

              {/* Rich toolbar */}
              <RichToolbar editorRef={editorRef} />

              {/* Content editable body */}
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={() => {
                  if (editorRef.current) updateHtml(editorRef.current.innerHTML);
                }}
                className="flex-1 text-sm outline-none p-5 leading-relaxed overflow-y-auto"
                style={{ minHeight: 200, wordBreak: 'break-word' }}
              />

              {/* Follow-up banner */}
              {editorFollowUpDate && (
                <div className={`px-4 py-2.5 border-t flex items-center gap-3 text-xs shrink-0 ${
                  isOverdue(editorFollowUpDate) && editorFollowUpStatus !== 'completed'
                    ? 'bg-red-500/10 border-red-500/20'
                    : editorFollowUpStatus === 'completed'
                    ? 'bg-emerald-500/10 border-emerald-500/20'
                    : 'bg-amber-500/10 border-amber-500/20'
                }`}>
                  <Clock className={`w-3.5 h-3.5 shrink-0 ${
                    editorFollowUpStatus === 'completed' ? 'text-emerald-400' :
                    isOverdue(editorFollowUpDate) ? 'text-red-400' : 'text-amber-400'
                  }`} />
                  <span className="font-medium">
                    Follow-up: {new Date(editorFollowUpDate + 'T00:00:00').toLocaleDateString()}
                    {isOverdue(editorFollowUpDate) && editorFollowUpStatus !== 'completed' && (
                      <span className="ml-1.5 text-red-400 font-bold">OVERDUE</span>
                    )}
                  </span>
                  {editorFollowUpStatus !== 'completed' ? (
                    <button onClick={() => updateFollowUpStatus('completed')}
                      className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-semibold hover:bg-emerald-500/30 transition-colors">
                      <Check className="w-3 h-3" /> Mark Complete
                    </button>
                  ) : (
                    <span className="ml-auto text-emerald-400 font-semibold flex items-center gap-1">
                      <Check className="w-3 h-3" /> Completed
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Task creation modal */}
      {showTaskModal && (
        <CreateTaskModal
          noteTitle={editorTitle}
          profileId={profileId}
          onClose={() => setShowTaskModal(false)}
        />
      )}
    </>
  );
}