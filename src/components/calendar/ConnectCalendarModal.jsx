import React, { useState } from 'react';
import { Calendar, Download, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';

export default function ConnectCalendarModal({ onClose, onSync, onDownloadIcs }) {
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const url = await base44.connectors.connectAppUser('6a2c49775072452eff268d30');
      const popup = window.open(url, '_blank');
      const timer = setInterval(() => {
        if (!popup || popup.closed) {
          clearInterval(timer);
          setConnecting(false);
          if (onSync) onSync();
          onClose();
        }
      }, 500);
    } catch (e) {
      setConnecting(false);
    }
  };

  return (
    <div className="layer-panel fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-sm p-5 space-y-4" style={{ backgroundColor: '#141418' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Connect Google Calendar</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          Connect your Google Calendar to sync your 90-Day Sprint tasks and deadlines.
        </p>

        <div className="space-y-2">
          <Button
            className="w-full gap-2"
            onClick={handleConnect}
            disabled={connecting}
          >
            {connecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Calendar className="w-3.5 h-3.5" />}
            {connecting ? 'Connecting…' : 'Connect Google Calendar'}
          </Button>

          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => { onDownloadIcs(); onClose(); }}
          >
            <Download className="w-3.5 h-3.5" />
            Download .ics Instead
          </Button>

          <Button
            variant="ghost"
            className="w-full text-xs"
            onClick={onClose}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}