import React, { useState, useRef, useEffect } from 'react';
import {
  Save, Loader2, Check, Upload, FileText, ExternalLink, Trash2,
  UserPlus, AlertTriangle, CheckCircle2, PenLine, Eye
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const AGREEMENT_TYPE_LABELS = {
  engagement_agreement: 'Engagement Agreement',
  client_agreement:     'Client Agreement',
  buy_sell_agreement:   'Buy-Sell Agreement',
  operating_agreement:  'Operating Agreement',
  nda:                  'NDA',
  service_agreement:    'Service Agreement',
  tax_authorization:    'Tax Authorization',
  advisor_agreement:    'Advisor Agreement',
  other:                'Other',
};

// Map agreement_type → document_type for the upload pipeline
const AGREEMENT_TO_DOC_TYPE = {
  engagement_agreement: 'engagement_letter',
  client_agreement:     'client_agreement',
  buy_sell_agreement:   'buy_sell_agreement',
  operating_agreement:  'entity_document',
  nda:                  'other',
  service_agreement:    'other',
  tax_authorization:    'other',
  advisor_agreement:    'engagement_letter',
  other:                'other',
};

const STATUSES = [
  { value: 'draft',               label: 'Draft' },
  { value: 'assigned',            label: 'Assigned' },
  { value: 'awaiting_review',     label: 'Awaiting Review' },
  { value: 'awaiting_signature',  label: 'Awaiting Signature' },
  { value: 'signed',              label: 'Signed' },
  { value: 'completed',           label: 'Completed' },
  { value: 'expired',             label: 'Expired' },
  { value: 'cancelled',           label: 'Cancelled' },
];

const STATUS_COLORS = {
  draft:              'border-border text-muted-foreground',
  assigned:           'border-blue-500/40 text-blue-400',
  awaiting_review:    'border-amber-500/40 text-amber-400',
  awaiting_signature: 'border-orange-500/40 text-orange-400',
  signed:             'border-emerald-500/40 text-emerald-400',
  completed:          'border-emerald-500/40 text-emerald-400',
  expired:            'border-red-500/40 text-red-400',
  cancelled:          'border-border text-muted-foreground',
};

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export default function AgreementEditor({ agreement, onSave, onAssign, onDelete, selectedBusinessId }) {
  const [title, setTitle]         = useState(agreement?.title || '');
  const [type, setType]           = useState(agreement?.agreement_type || 'engagement_agreement');
  const [status, setStatus]       = useState(agreement?.status || 'draft');
  const [description, setDescription] = useState(agreement?.description || '');
  const [dueDate, setDueDate]     = useState(agreement?.due_date || '');
  const [notes, setNotes]         = useState(agreement?.notes || '');
  const [fileUrl, setFileUrl]     = useState(agreement?.file_url || '');
  const [fileName, setFileName]   = useState(agreement?.file_name || '');
  const [fileSize, setFileSize]   = useState(agreement?.file_size || null);

  const [saving, setSaving]       = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState('idle');
  const [isDirty, setIsDirty]     = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const autoSaveTimer = useRef(null);
  const isFirstRender = useRef(true);

  // Auto-save on field changes
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    setIsDirty(true);
    setAutoSaveStatus('idle');
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      setAutoSaveStatus('saving');
      await onSave({ title, agreement_type: type, status, description, due_date: dueDate, notes, file_url: fileUrl, file_name: fileName, file_size: fileSize });
      setAutoSaveStatus('saved');
      setIsDirty(false);
      setTimeout(() => setAutoSaveStatus('idle'), 2000);
    }, 1500);
    return () => clearTimeout(autoSaveTimer.current);
  }, [title, type, status, description, dueDate, notes]);

  useEffect(() => {
    const handler = (e) => { if (isDirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const handleSave = async (markStatus) => {
    clearTimeout(autoSaveTimer.current);
    setSaving(true);
    setAutoSaveStatus('saving');
    const now = new Date().toISOString();
    const patch = {
      title, agreement_type: type, description, due_date: dueDate, notes,
      file_url: fileUrl, file_name: fileName, file_size: fileSize,
      status: markStatus || status,
      ...(markStatus === 'signed'    ? { signed_at: now } : {}),
      ...(markStatus === 'completed' ? { completed_at: now } : {}),
    };
    await onSave(patch);
    if (markStatus) setStatus(markStatus);
    setSaving(false);
    setAutoSaveStatus('saved');
    setIsDirty(false);
    setTimeout(() => setAutoSaveStatus('idle'), 2000);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const base64File = await readFileAsBase64(file);
      const docType = AGREEMENT_TO_DOC_TYPE[type] || 'other';

      const res = await base44.functions.invoke('uploadDocumentToSupabase', {
        fileName:          file.name,
        fileType:          file.type || 'application/octet-stream',
        fileSize:          file.size,
        documentType:      docType,
        base64File,
        uploadSource:      'agreement',
        relatedEntityType: 'Agreement',
        relatedEntityId:   agreement.id,
        ...(selectedBusinessId ? { selectedBusinessId } : {}),
      });

      if (!res.data?.success) throw new Error(res.data?.error || 'Upload failed');

      const doc = res.data.document;
      setFileUrl(doc.file_url);
      setFileName(file.name);
      setFileSize(file.size);

      // Persist immediately
      await onSave({
        title, agreement_type: type, status, description, due_date: dueDate, notes,
        file_url:    doc.file_url,
        file_name:   file.name,
        file_size:   file.size,
        document_id: res.data.document_id,
      });
      toast.success('File uploaded and linked to Data Room');
    } catch (err) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removeFile = async () => {
    setFileUrl('');
    setFileName('');
    setFileSize(null);
    await onSave({ title, agreement_type: type, status, description, due_date: dueDate, notes, file_url: null, file_name: null, file_size: null, document_id: null });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Top action bar */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-border gap-3 flex-wrap shrink-0 bg-card">
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Agreement title..."
          className="text-sm font-semibold bg-transparent outline-none border-b border-transparent focus:border-primary/50 transition-colors flex-1 min-w-0 py-0.5"
        />
        <div className="flex items-center gap-2 shrink-0">
          {autoSaveStatus === 'saving' && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" /> Saving…
            </span>
          )}
          {autoSaveStatus === 'saved' && (
            <span className="flex items-center gap-1 text-xs text-emerald-400">
              <Check className="w-3 h-3" /> Saved
            </span>
          )}
          {autoSaveStatus === 'idle' && isDirty && (
            <span className="text-xs text-amber-400">Unsaved</span>
          )}
          {/* Status badge */}
          <span className={`text-xs border rounded px-2 py-0.5 ${STATUS_COLORS[status] || STATUS_COLORS.draft}`}>
            {status.replace(/_/g, ' ')}
          </span>
          {onAssign && (
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={onAssign}>
              <UserPlus className="w-3 h-3" /> Assign
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => handleSave()} disabled={saving}>
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Save
          </Button>
          <Button size="sm" className="h-7 text-xs bg-primary text-primary-foreground hover:bg-primary/90 gap-1" onClick={() => handleSave('completed')} disabled={saving}>
            <CheckCircle2 className="w-3 h-3" /> Complete
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-background/50">

        {/* Type + Status + Due Date row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Agreement Type</label>
            <select
              value={type}
              onChange={e => setType(e.target.value)}
              className="w-full h-9 text-sm px-3 rounded-md bg-secondary border border-border outline-none focus:border-primary/50"
            >
              {Object.entries(AGREEMENT_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="w-full h-9 text-sm px-3 rounded-md bg-secondary border border-border outline-none focus:border-primary/50"
            >
              {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="w-full h-9 text-sm px-3 rounded-md bg-secondary border border-border outline-none focus:border-primary/50"
              style={{ colorScheme: 'dark' }}
            />
          </div>
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Describe the purpose or context of this agreement..."
            rows={3}
            className="w-full text-sm px-3 py-2.5 rounded-md bg-secondary border border-border outline-none focus:border-primary/50 resize-none"
          />
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Internal notes, instructions, or status context..."
            rows={3}
            className="w-full text-sm px-3 py-2.5 rounded-md bg-secondary border border-border outline-none focus:border-primary/50 resize-none"
          />
        </div>

        {/* Document attachment */}
        <div className="space-y-2">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Attached Document</label>

          {fileUrl ? (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary px-4 py-3 group">
              <FileText className="w-4 h-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{fileName || 'Attached file'}</p>
                {fileSize && (
                  <p className="text-xs text-muted-foreground">{(fileSize / 1024 / 1024).toFixed(1)} MB</p>
                )}
              </div>
              <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                className="p-1.5 text-muted-foreground hover:text-primary rounded transition-colors">
                <ExternalLink className="w-4 h-4" />
              </a>
              <button onClick={removeFile} className="p-1.5 text-muted-foreground hover:text-destructive rounded transition-colors opacity-0 group-hover:opacity-100">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <label className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border hover:border-primary/30 p-6 cursor-pointer transition-colors">
              <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" />
              <Upload className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {uploading ? 'Uploading...' : 'Attach a document (PDF, Word, Image)'}
              </span>
              {uploading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
            </label>
          )}
          <p className="text-[10px] text-muted-foreground">Files are stored in the Data Room automatically.</p>
        </div>

        {/* Quick status actions */}
        <div className="flex items-center gap-2 pt-2 border-t border-border">
          <span className="text-xs text-muted-foreground mr-2">Quick actions:</span>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => handleSave('awaiting_signature')}>
            <PenLine className="w-3 h-3" /> Request Signature
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10" onClick={() => handleSave('signed')}>
            <Check className="w-3 h-3" /> Mark Signed
          </Button>
          {onDelete && (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground hover:text-destructive ml-auto" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="w-3 h-3" /> Delete
            </Button>
          )}
        </div>

        {/* Delete confirm */}
        {confirmDelete && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-destructive">Delete this agreement?</p>
                <p className="text-xs text-muted-foreground mt-1">This removes the agreement record. Attached Data Room files are not deleted.</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
              <Button variant="destructive" size="sm" onClick={() => { onDelete(); setConfirmDelete(false); }}>Delete</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}