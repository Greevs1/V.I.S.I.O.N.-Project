import React, { useRef, useState, useEffect } from 'react';
import { Upload, HardDrive } from 'lucide-react';
import GoogleDrivePicker from '@/components/documents/GoogleDrivePicker';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const CONNECTOR_ID = '6a332849a6a82e82cbdf3ab2';

/**
 * UploadDropdown — wraps a click target (the dropzone or a button)
 * and shows a small dark menu: "Upload from Computer" | "Import from Google Drive"
 *
 * Props:
 *   onFilesSelected(FileList) — called when user picks local files
 *   onDriveImport(doc)        — called when Drive import succeeds
 *   accept                    — file input accept attribute
 *   multiple                  — boolean
 *   children                  — the trigger element (rendered as-is, click is intercepted)
 *   className                 — passed to wrapper div
 */
export default function UploadDropdown({
  onFilesSelected,
  onDriveImport,
  accept = '.pdf,.csv,.xlsx,.xls,.doc,.docx,.png,.jpg,.jpeg,.webp',
  multiple = true,
  children,
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [checkingDrive, setCheckingDrive] = useState(false);
  const fileInputRef = useRef(null);
  const menuRef = useRef(null);
  const wrapperRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target) &&
          wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleWrapperClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(prev => !prev);
  };

  const handleUploadFromComputer = (e) => {
    e.stopPropagation();
    setOpen(false);
    fileInputRef.current?.click();
  };

  const handleDriveClick = async (e) => {
    e.stopPropagation();
    setOpen(false);
    setCheckingDrive(true);
    try {
      const res = await base44.functions.invoke('googleDriveImport', { action: 'getToken' });
      if (res.data?.accessToken) {
        setShowPicker(true);
      } else {
        // Not connected — open OAuth flow
        const url = await base44.connectors.connectAppUser(CONNECTOR_ID);
        const popup = window.open(url, '_blank', 'width=600,height=700');
        if (popup) {
          const timer = setInterval(async () => {
            if (popup.closed) {
              clearInterval(timer);
              try {
                const recheck = await base44.functions.invoke('googleDriveImport', { action: 'getToken' });
                if (recheck.data?.accessToken) {
                  setShowPicker(true);
                } else {
                  toast.info('Connect Google Drive and try again.');
                }
              } catch { toast.error('Connection check failed'); }
            }
          }, 500);
        }
      }
    } catch (err) {
      toast.error('Failed to connect to Google Drive');
    }
    setCheckingDrive(false);
  };

  const handleFileChange = (e) => {
    if (e.target.files?.length) {
      onFilesSelected(e.target.files);
      e.target.value = '';
    }
  };

  const handleDriveImported = (doc) => {
    setShowPicker(false);
    if (onDriveImport) onDriveImport(doc);
  };

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Trigger — intercept click to open dropdown */}
      <div onClick={handleWrapperClick} className="cursor-pointer">
        {children}
      </div>

      {/* Dropdown menu */}
      {open && (
        <div
          ref={menuRef}
          className="absolute z-50 mt-2 left-1/2 -translate-x-1/2 w-52 rounded-xl border border-border bg-[#1a1a1e] shadow-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={handleUploadFromComputer}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-secondary/60 transition-colors"
          >
            <Upload className="w-4 h-4 text-muted-foreground shrink-0" />
            Upload from Computer
          </button>
          <div className="border-t border-border/50" />
          <button
            onClick={handleDriveClick}
            disabled={checkingDrive}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-secondary/60 transition-colors disabled:opacity-50"
          >
            {checkingDrive ? (
              <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin shrink-0" />
            ) : (
              <img src="https://media.base44.com/images/public/6a2338cb6dd7f8bfcf561ec3/61439ca4b_Google_Drive_icon_2026svg.png" alt="Google Drive" className="w-4 h-4 shrink-0 object-contain" />
            )}
            Import from Google Drive
          </button>
        </div>
      )}

      {/* Drive picker modal */}
      {showPicker && (
        <GoogleDrivePicker
          onClose={() => setShowPicker(false)}
          onImported={handleDriveImported}
        />
      )}
    </div>
  );
}