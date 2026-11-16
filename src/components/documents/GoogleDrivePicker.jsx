import React, { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { X, Loader2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const CONNECTOR_ID = '6a332849a6a82e82cbdf3ab2';

/**
 * Modal that opens Google Drive Picker for file selection,
 * then imports selected files into V.I.S.I.O.N. Platform.
 */
export default function GoogleDrivePicker({ onClose, onImported }) {
  const { activeContext } = useAuth();
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState('connecting'); // connecting | selecting | importing | done
  const [importedDoc, setImportedDoc] = useState(null);
  const pickerRef = useRef(null);

  useEffect(() => {
    openPicker();
  }, []);

  const openPicker = async () => {
    setStage('connecting');
    try {
      const res = await base44.functions.invoke('googleDriveImport', { action: 'getToken' });
      const accessToken = res.data?.accessToken;
      if (!accessToken) {
        toast.error('Not connected to Google Drive');
        onClose();
        return;
      }

      // Load Google API client library
      await loadGoogleApi(accessToken);
    } catch (e) {
      toast.error('Failed to open Google Drive picker');
      onClose();
    }
  };

  const loadGoogleApi = (accessToken) => {
    return new Promise((resolve, reject) => {
      if (window.google && window.google.picker) {
        buildPicker(accessToken);
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = () => {
        window.gapi.load('picker', { callback: () => {
          buildPicker(accessToken);
          resolve();
        }, onerror: () => reject(new Error('Failed to load Picker API')) });
      };
      script.onerror = () => reject(new Error('Failed to load Google API'));
      document.body.appendChild(script);
    });
  };

  const buildPicker = (accessToken) => {
    setStage('selecting');
    const view = new window.google.picker.View(window.google.picker.ViewId.DOCS);
    view.setMimeTypes('application/pdf,image/png,image/jpeg,image/webp,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,text/csv');

    const picker = new window.google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setCallback((data) => handlePickerResult(data, accessToken))
      .setOrigin(window.location.origin)
      .build();

    pickerRef.current = picker;
    picker.setVisible(true);
  };

  const handlePickerResult = async (data, accessToken) => {
    if (data.action === window.google.picker.Action.PICKED) {
      const doc = data.docs[0];
      if (!doc) { onClose(); return; }

      setStage('importing');
      try {
        const res = await base44.functions.invoke('googleDriveImport', {
          action: 'importFile',
          data: {
            fileId: doc.id,
            fileName: doc.name,
            fileType: doc.mimeType || 'application/octet-stream',
            active_business_id: activeContext?.businessId || null,
          },
        });

        if (res.data?.success) {
          setImportedDoc(res.data.document);
          setStage('done');
          toast.success(`Imported "${doc.name}" from Google Drive`);
          if (onImported) onImported(res.data.document);
          setTimeout(() => onClose(), 1500);
        } else {
          toast.error(res.data?.error || 'Import failed');
          onClose();
        }
      } catch (e) {
        toast.error(e?.response?.data?.error || 'Import failed');
        onClose();
      }
    } else if (data.action === window.google.picker.Action.CANCEL) {
      onClose();
    }
  };

  return (
    <div className="layer-panel fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="rounded-xl w-full max-w-sm p-0 border border-border shadow-2xl" style={{ backgroundColor: '#141418' }}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 87.3 78" width="16" height="14" xmlns="http://www.w3.org/2000/svg">
              <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l-13.75-23.8h27.2c0 1.55-.4 3.1-1.2 4.5z" fill="#0066DA"/>
              <path d="m43.65 25.8 13.45 23.2h-27.2l-13.4-23.2z" fill="#00AC47"/>
              <path d="m73.55 76.8c-2.7 0-4.6-1.5-5.95-3.85l-13.45-23.2 13.45-23.2h27.15l-13.4 23.2 13.4 23.25c1.35 2.35 1.35 5.15 0 7.5l-3.85-6.65 3.85 6.65c-.8 1.4-1.95 2.5-3.3 3.3-1.35.8-2.7 1.2-4.1 1.2z" fill="#FFBA00"/>
            </svg>
            <h3 className="text-sm font-semibold">Google Drive Import</h3>
          </div>
          {stage === 'done' ? null : (
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="p-6 text-center">
          {stage === 'connecting' && (
            <div className="space-y-3">
              <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
              <p className="text-sm text-muted-foreground">Connecting to Google Drive…</p>
            </div>
          )}

          {stage === 'selecting' && (
            <div className="space-y-3">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto" style={{ background: 'rgba(66,133,244,0.1)' }}>
                <svg viewBox="0 0 87.3 78" width="24" height="20" xmlns="http://www.w3.org/2000/svg">
                  <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l-13.75-23.8h27.2c0 1.55-.4 3.1-1.2 4.5z" fill="#0066DA"/>
                  <path d="m43.65 25.8 13.45 23.2h-27.2l-13.4-23.2z" fill="#00AC47"/>
                  <path d="m73.55 76.8c-2.7 0-4.6-1.5-5.95-3.85l-13.45-23.2 13.45-23.2h27.15l-13.4 23.2 13.4 23.25c1.35 2.35 1.35 5.15 0 7.5l-3.85-6.65 3.85 6.65c-.8 1.4-1.95 2.5-3.3 3.3-1.35.8-2.7 1.2-4.1 1.2z" fill="#FFBA00"/>
                </svg>
              </div>
              <p className="text-sm">Select a file from Google Drive</p>
              <p className="text-xs text-muted-foreground">The file picker should have opened. If not, click below.</p>
              <Button variant="outline" size="sm" onClick={() => pickerRef.current?.setVisible(true)} className="mt-2">
                Reopen Picker
              </Button>
            </div>
          )}

          {stage === 'importing' && (
            <div className="space-y-3">
              <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
              <p className="text-sm text-muted-foreground">Importing file to V.I.S.I.O.N. Platform…</p>
              <p className="text-xs text-muted-foreground">Uploading to Data Room and queuing for analysis</p>
            </div>
          )}

          {stage === 'done' && importedDoc && (
            <div className="space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto">
                <FileText className="w-7 h-7 text-emerald-400" />
              </div>
              <p className="text-sm font-medium">Import Complete</p>
              <p className="text-xs text-muted-foreground">{importedDoc?.name || 'Document'}</p>
              <Button size="sm" variant="outline" onClick={onClose} className="mt-1">Close</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}