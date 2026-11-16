/**
 * LifecycleOverflow — Phase 13.3G.2
 *
 * Secondary overflow menu for lifecycle actions (Archive). Keeps destructive
 * actions out of the primary action area. Archive is visible only to
 * super_admin or advisors with can_archive_valuation.
 *
 * Also provides confirmation dialogs for Archive and Restore.
 */
import React, { useState, useRef, useEffect } from 'react';
import { MoreHorizontal, Archive, RotateCcw, Loader2 } from 'lucide-react';
import { archiveValuation, restoreArchivedValuation } from '@/lib/valuationService';

export default function LifecycleOverflow({ valuationId, canArchive, canRestore, isArchived, onArchived, onRestored }) {
  const [open, setOpen] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleArchive = async () => {
    setBusy(true);
    setError(null);
    try {
      await archiveValuation(valuationId);
      onArchived?.();
      setConfirmArchive(false);
    } catch (err) {
      setError(err.message || 'Failed to archive');
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    setBusy(true);
    setError(null);
    try {
      await restoreArchivedValuation(valuationId);
      onRestored?.();
      setConfirmRestore(false);
    } catch (err) {
      setError(err.message || 'Failed to restore');
    } finally {
      setBusy(false);
    }
  };

  const showMenu = canArchive && !isArchived;
  const showRestore = canRestore && isArchived;

  if (!showMenu && !showRestore) return null;

  return (
    <>
      <div className="relative" ref={ref}>
        {showMenu && (
          <>
            <button
              onClick={() => setOpen(!open)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="More actions"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {open && (
              <div className="absolute right-0 top-full mt-1 z-20 rounded-lg py-1 min-w-[160px]" style={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))' }}>
                <button
                  onClick={() => { setConfirmArchive(true); setOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-secondary transition-colors text-left"
                >
                  <Archive className="w-3.5 h-3.5" />
                  Archive Valuation
                </button>
              </div>
            )}
          </>
        )}
        {showRestore && !showMenu && (
          <button
            onClick={() => setConfirmRestore(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restore
          </button>
        )}
      </div>

      {/* Archive confirmation */}
      {confirmArchive && (
        <ConfirmDialog
          title="Archive Valuation?"
          message="This will archive the working valuation. Published versions remain immutable. Sharing will be revoked if currently shared. The valuation can be restored later by an authorized advisor."
          confirmLabel="Archive"
          onConfirm={handleArchive}
          onCancel={() => setConfirmArchive(false)}
          busy={busy}
          error={error}
        />
      )}

      {/* Restore confirmation */}
      {confirmRestore && (
        <ConfirmDialog
          title="Restore Valuation?"
          message="This will reopen the working valuation for authorized advisors. Published versions remain immutable and sharing remains unchanged unless separately updated."
          confirmLabel="Restore"
          onConfirm={handleRestore}
          onCancel={() => setConfirmRestore(false)}
          busy={busy}
          error={error}
        />
      )}
    </>
  );
}

function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel, busy, error }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="w-full max-w-sm rounded-2xl p-5 space-y-3" style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}>
        <h3 className="text-base font-display font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">{message}</p>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-85 disabled:opacity-40"
            style={{ background: '#D4A853', color: '#08080C' }}
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}