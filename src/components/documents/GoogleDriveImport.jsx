import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import GoogleDrivePicker from '@/components/documents/GoogleDrivePicker';
import { toast } from 'sonner';

const CONNECTOR_ID = '6a332849a6a82e82cbdf3ab2';

/**
 * Google Drive import icon button.
 * Sits beside existing upload controls — no text label, just the Drive logo.
 */
export default function GoogleDriveImport({ onImport }) {
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleClick = async (e) => {
    e.stopPropagation();
    setLoading(true);
    try {
      // Check if user has connected Google Drive
      const res = await base44.functions.invoke('googleDriveImport', { action: 'getToken' });
      if (res.data?.accessToken) {
        // Connected — open picker
        setShowPicker(true);
      } else if (res.data?.error === 'not_connected') {
        // Not connected — open connect flow
        const url = await base44.connectors.connectAppUser(CONNECTOR_ID);
        const popup = window.open(url, '_blank', 'width=600,height=700');
        if (popup) {
          const timer = setInterval(async () => {
            if (popup.closed) {
              clearInterval(timer);
              // Re-check connection after popup closes
              try {
                const recheck = await base44.functions.invoke('googleDriveImport', { action: 'getToken' });
                if (recheck.data?.accessToken) {
                  setShowPicker(true);
                } else {
                  toast.info('Google Drive not connected. Please try again.');
                }
              } catch {
                toast.error('Connection check failed');
              }
            }
          }, 500);
        }
      } else {
        toast.error(res.data?.error || 'Google Drive is not available');
      }
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to check Google Drive connection');
    }
    setLoading(false);
  };

  const handleImported = (doc) => {
    setShowPicker(false);
    if (onImport) onImport(doc);
  };

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleClick}
              disabled={loading}
              aria-label="Import from Google Drive"
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-border bg-secondary hover:bg-secondary/80 hover:border-primary/30 transition-all cursor-pointer shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
              ) : (
                <svg viewBox="0 0 87.3 78" width="18" height="18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l-13.75-23.8h27.2c0 1.55-.4 3.1-1.2 4.5z" fill="#0066DA"/>
                  <path d="m43.65 25.8 13.45 23.2h-27.2l-13.4-23.2z" fill="#00AC47"/>
                  <path d="m73.55 76.8c-2.7 0-4.6-1.5-5.95-3.85l-13.45-23.2 13.45-23.2h27.15l-13.4 23.2 13.4 23.25c1.35 2.35 1.35 5.15 0 7.5l-3.85-6.65 3.85 6.65c-.8 1.4-1.95 2.5-3.3 3.3-1.35.8-2.7 1.2-4.1 1.2z" fill="#FFBA00"/>
                </svg>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Import from Google Drive
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {showPicker && (
        <GoogleDrivePicker
          onClose={() => setShowPicker(false)}
          onImported={handleImported}
        />
      )}
    </>
  );
}