import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, CheckCircle2, Circle, Upload, FileText, ExternalLink, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const STATUSES = [
  { value: 'not_started',  label: 'Not Started'  },
  { value: 'in_progress',  label: 'In Progress'  },
  { value: 'under_review', label: 'Under Review' },
  { value: 'completed',    label: 'Completed'    },
];

const statusColor = {
  not_started:  '#6B7280',
  in_progress:  '#D4A853',
  under_review: '#FBBF24',
  completed:    '#34D399',
};

const categoryConfig = {
  financial:  { label: 'Financial',  bg: 'rgba(212,168,83,0.12)',  text: '#D4A853', border: 'rgba(212,168,83,0.25)' },
  legal:      { label: 'Legal',      bg: 'rgba(96,165,250,0.12)',  text: '#60A5FA', border: 'rgba(96,165,250,0.25)' },
  hr:         { label: 'HR',         bg: 'rgba(167,139,250,0.12)', text: '#A78BFA', border: 'rgba(167,139,250,0.25)' },
  operations: { label: 'Operations', bg: 'rgba(251,191,36,0.12)',  text: '#FBBF24', border: 'rgba(251,191,36,0.25)' },
};

const CATEGORIES = ['financial', 'legal', 'hr', 'operations'];
const TABS = ['Details', 'Subtasks', 'Files'];

export default function ReadinessModal({ item, onClose, onUpdate, onDelete, isPaid, businessId }) {
  const [tab, setTab] = useState('Details');
  const [form, setForm] = useState({ ...item });
  const [newSubtask, setNewSubtask] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setForm({ ...item });
    setTab('Details');
  }, [item?.id]);

  const save = async (patch) => {
    setForm(f => ({ ...f, ...patch }));
    setSaving(true);
    try { await onUpdate(item.id, patch); }
    finally { setSaving(false); }
  };

  const handleFieldBlur = () => save({
    assignee: form.assignee,
    due_date: form.due_date,
    notes: form.notes,
    category: form.category,
    description: form.description,
  });

  const addSubtask = () => {
    if (!newSubtask.trim()) return;
    const subtasks = [...(form.subtasks || []), { id: Date.now().toString(), title: newSubtask.trim(), completed: false }];
    setNewSubtask('');
    save({ subtasks });
  };

  const toggleSubtask = (id) => save({ subtasks: (form.subtasks || []).map(s => s.id === id ? { ...s, completed: !s.completed } : s) });
  const deleteSubtask = (id) => save({ subtasks: (form.subtasks || []).filter(s => s.id !== id) });

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      // Read as base64
      const base64File = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });

      const res = await base44.functions.invoke('uploadDocumentToSupabase', {
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
        documentType: 'other',
        base64File,
        uploadSource: 'exit_readiness',
        relatedEntityType: 'ReadinessItem',
        relatedEntityId: item.id,
      });

      if (!res.data?.success) throw new Error(res.data?.error || 'Upload failed');

      const fileUrl = res.data.document?.file_url;
      save({ file_urls: [...(form.file_urls || []), fileUrl] });
      toast.success('File attached and saved to Data Room');
    } catch (err) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removeFile = (url) => save({ file_urls: (form.file_urls || []).filter(u => u !== url) });

  const openFile = async (url) => {
    try {
      const res = await base44.functions.invoke('supabaseUserData', {
        action: 'getDocumentSignedUrlByFileUrl',
        data: { fileUrl: url },
      });
      if (res.data?.signedUrl) { window.open(res.data.signedUrl, '_blank'); return; }
    } catch {}
    window.open(url, '_blank');
  };

  const cat = categoryConfig[form.category] || categoryConfig.financial;
  const completedSubtasks = (form.subtasks || []).filter(s => s.completed).length;
  const totalSubtasks = (form.subtasks || []).length;
  const curStatusColor = statusColor[form.status] || '#6B7280';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }} onClick={onClose} />

      {/* Modal */}
      <div
        className="relative z-10 w-full max-w-lg flex flex-col"
        style={{
          maxHeight: '88vh',
          background: 'hsl(var(--card))',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '16px',
          boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 pt-5 pb-4"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        >
          {/* Category pill */}
          <div className="flex items-center gap-3">
            <span
              className="text-[9px] font-semibold uppercase tracking-[0.12em] px-2.5 py-1 rounded-full"
              style={{ background: cat.bg, color: cat.text, border: `1px solid ${cat.border}` }}
            >
              {cat.label}
            </span>
            {saving && <div className="w-3 h-3 rounded-full border border-primary/30 border-t-primary animate-spin" />}
          </div>

          <div className="flex items-center gap-3">
            {/* Status dropdown with gold border */}
            <select
              value={form.status}
              onChange={e => save({ status: e.target.value })}
              className="text-xs rounded-md px-2.5 py-1.5 cursor-pointer focus:outline-none font-medium"
              style={{
                background: 'rgba(212,168,83,0.08)',
                border: `1px solid rgba(212,168,83,0.35)`,
                color: curStatusColor,
              }}
            >
              {STATUSES.map(s => (
                <option key={s.value} value={s.value} style={{ background: '#1a1a1a', color: '#fff' }}>{s.label}</option>
              ))}
            </select>
            {onDelete && (
              <button
                onClick={() => setConfirmDelete(true)}
                className="transition-colors"
                style={{ color: 'rgba(255,255,255,0.3)' }}
                onMouseEnter={e => e.currentTarget.style.color = '#EF4444'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}
                title="Delete item"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Title */}
        <div className="px-6 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <h2 className="text-base font-semibold leading-snug" style={{ color: 'rgba(255,255,255,0.95)' }}>{form.title}</h2>
          {form.description && (
            <p className="text-xs mt-1.5" style={{ color: 'rgba(255,255,255,0.45)' }}>{form.description}</p>
          )}
        </div>

        {/* Pill tab bar */}
        <div className="flex items-center gap-1.5 px-6 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          {TABS.map(t => {
            const active = tab === t;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="text-xs font-medium px-3 py-1.5 rounded-full transition-all"
                style={{
                  background: active ? 'rgba(212,168,83,0.15)' : 'transparent',
                  color: active ? '#D4A853' : 'rgba(255,255,255,0.45)',
                  border: active ? '1px solid rgba(212,168,83,0.3)' : '1px solid transparent',
                }}
              >
                {t}
                {t === 'Subtasks' && totalSubtasks > 0 && (
                  <span className="ml-1.5 text-[9px] opacity-70">{completedSubtasks}/{totalSubtasks}</span>
                )}
                {t === 'Files' && (form.file_urls || []).length > 0 && (
                  <span className="ml-1.5 text-[9px] opacity-70">{(form.file_urls || []).length}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Delete confirmation */}
        {confirmDelete && (
          <div
            className="mx-6 my-3 rounded-xl p-4 space-y-3"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#EF4444' }} />
              <div className="space-y-1">
                <p className="text-sm font-semibold" style={{ color: '#EF4444' }}>Delete this readiness item?</p>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  This will remove the item from the board. Attached Data Room documents will not be deleted — they remain accessible in your Data Room.
                </p>
                {(form.file_urls?.length > 0) && (
                  <p className="text-xs" style={{ color: 'rgba(251,191,36,0.8)' }}>
                    ⚠ This item has {form.file_urls.length} attached file(s) that will remain in your Data Room.
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs px-3 py-1.5 rounded-md transition-colors"
                style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.7)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => { onDelete(item.id); onClose(); }}
                className="text-xs px-3 py-1.5 rounded-md font-semibold transition-colors"
                style={{ background: 'rgba(239,68,68,0.2)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.4)' }}
              >
                Delete Item
              </button>
            </div>
          </div>
        )}

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {tab === 'Details' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'rgba(255,255,255,0.4)' }}>Assignee</label>
                  <input
                    value={form.assignee || ''}
                    onChange={e => setForm(f => ({ ...f, assignee: e.target.value }))}
                    onBlur={handleFieldBlur}
                    placeholder="Name or email"
                    className="w-full h-9 text-sm px-3 rounded-md focus:outline-none focus:ring-1"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: 'rgba(255,255,255,0.85)',
                      ringColor: '#D4A853',
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'rgba(255,255,255,0.4)' }}>Due Date</label>
                  <input
                    type="date"
                    value={form.due_date || ''}
                    onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                    onBlur={handleFieldBlur}
                    className="w-full h-9 text-sm px-3 rounded-md focus:outline-none"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: 'rgba(255,255,255,0.85)',
                      colorScheme: 'dark',
                    }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'rgba(255,255,255,0.4)' }}>Category</label>
                  <select
                    value={form.category || 'financial'}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    onBlur={handleFieldBlur}
                    className="w-full h-9 text-sm px-3 rounded-md focus:outline-none"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.85)' }}
                  >
                    {CATEGORIES.map(c => <option key={c} value={c} style={{ background: '#1a1a1a' }}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'rgba(255,255,255,0.4)' }}>Priority</label>
                  <select
                    value={form.priority || 'medium'}
                    onChange={e => save({ priority: e.target.value })}
                    className="w-full h-9 text-sm px-3 rounded-md focus:outline-none"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.85)' }}
                  >
                    {['low', 'medium', 'high', 'critical'].map(p => <option key={p} value={p} style={{ background: '#1a1a1a' }}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'rgba(255,255,255,0.4)' }}>Notes</label>
                <textarea
                  value={form.notes || ''}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  onBlur={handleFieldBlur}
                  rows={4}
                  placeholder="Add notes, context, or instructions..."
                  className="w-full text-sm px-3 py-2.5 rounded-md resize-none focus:outline-none focus:ring-1"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.85)',
                  }}
                />
              </div>
            </div>
          )}

          {tab === 'Subtasks' && (
            <div className="space-y-2.5">
              {(form.subtasks || []).length === 0 && (
                <p className="text-sm text-center py-6" style={{ color: 'rgba(255,255,255,0.3)' }}>No subtasks yet.</p>
              )}
              {(form.subtasks || []).map(sub => (
                <div key={sub.id} className="flex items-center gap-3 group py-1">
                  <button onClick={() => toggleSubtask(sub.id)} className="shrink-0">
                    {sub.completed
                      ? <CheckCircle2 className="w-4 h-4" style={{ color: '#34D399' }} />
                      : <Circle className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
                    }
                  </button>
                  <span className={`flex-1 text-sm ${sub.completed ? 'line-through' : ''}`} style={{ color: sub.completed ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.8)' }}>
                    {sub.title}
                  </span>
                  <button onClick={() => deleteSubtask(sub.id)} className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    <Trash2 className="w-3.5 h-3.5 hover:text-red-400" />
                  </button>
                </div>
              ))}
              <div className="flex gap-2 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                <input
                  value={newSubtask}
                  onChange={e => setNewSubtask(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addSubtask()}
                  placeholder="Add a subtask..."
                  className="flex-1 h-8 text-sm px-3 rounded-md focus:outline-none"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.85)' }}
                />
                <Button size="sm" onClick={addSubtask} disabled={!newSubtask.trim()} className="h-8 px-3">
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}

          {tab === 'Files' && (
            <div className="space-y-2.5">
              {(form.file_urls || []).length === 0 && (
                <p className="text-sm text-center py-6" style={{ color: 'rgba(255,255,255,0.3)' }}>No files attached yet.</p>
              )}
              {(form.file_urls || []).map((url, i) => {
                const name = url.split('/').pop()?.split('?')[0] || `File ${i + 1}`;
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 group"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                  >
                    <FileText className="w-4 h-4 shrink-0" style={{ color: '#D4A853' }} />
                    <span className="flex-1 text-sm truncate" style={{ color: 'rgba(255,255,255,0.8)' }}>{decodeURIComponent(name)}</span>
                    <button onClick={() => openFile(url)} style={{ color: 'rgba(255,255,255,0.3)' }} className="hover:text-primary shrink-0 transition-colors">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => removeFile(url)} className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
              <label
                className="flex items-center justify-center gap-2 rounded-lg p-4 cursor-pointer transition-colors"
                style={{ border: '2px dashed rgba(255,255,255,0.1)' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(212,168,83,0.35)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
              >
                <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
                <Upload className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.35)' }} />
                <span className="text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  {uploading ? 'Uploading...' : 'Click to attach a file'}
                </span>
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}