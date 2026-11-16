import React, { useState } from 'react';
import { X, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const CONFIRM_TEXT = 'DELETE!!';

export default function DeleteWorksheetAssignmentModal({ worksheet, onClose, onConfirm }) {
  const [input, setInput] = useState('');
  const [deleting, setDeleting] = useState(false);

  const isValid = input === CONFIRM_TEXT;

  const handleConfirm = async () => {
    if (!isValid) return;
    setDeleting(true);
    await onConfirm();
    setDeleting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-destructive/15 flex items-center justify-center shrink-0">
              <Trash2 className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Remove Assigned Worksheet</h3>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{worksheet?.title}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-3">
          <p className="text-sm text-foreground">
            Are you sure you want to remove this assigned worksheet from this user?
          </p>
          <p className="text-sm text-muted-foreground">
            This will remove it from the user's Resource Library. The worksheet template will not be deleted.
          </p>
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3">
            <p className="text-xs text-destructive font-medium">
              To confirm, type: <span className="font-mono font-bold">{CONFIRM_TEXT}</span>
            </p>
          </div>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={`Type ${CONFIRM_TEXT} to confirm`}
            className="w-full h-10 bg-secondary border border-border rounded-lg px-3 text-sm outline-none focus:border-destructive/50 font-mono"
            autoFocus
            onKeyDown={e => e.key === 'Enter' && isValid && handleConfirm()}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onClose} disabled={deleting}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!isValid || deleting}
            onClick={handleConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-1.5 disabled:opacity-40"
          >
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Delete Assigned Worksheet
          </Button>
        </div>
      </div>
    </div>
  );
}