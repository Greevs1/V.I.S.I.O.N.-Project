import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

const EMBED_URL = 'https://link.mycapitalimpact.com/widget/booking/HgSooqTOyOPXNaAZ9gWL';
const SCRIPT_URL = 'https://link.mycapitalimpact.com/js/form_embed.js';

let scriptInjected = false;

export default function BookingModal({ open, onClose }) {
  const containerRef = useRef(null);
  const [iframeReady, setIframeReady] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (!open) return;
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    // Inject script once globally
    if (!scriptInjected) {
      scriptInjected = true;
      const script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.type = 'text/javascript';
      script.async = true;
      document.body.appendChild(script);
    }

    // Trigger iframe load
    const timeout = setTimeout(() => setIframeReady(true), 80);
    return () => clearTimeout(timeout);
  }, [open]);

  // Reset on close so iframe re-mounts cleanly
  useEffect(() => {
    if (!open) setIframeReady(false);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {if (e.key === 'Escape') onClose();};
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="layer-panel fixed inset-0 flex items-start justify-center p-4 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm pr-48 pl-48 pb-8"
        onClick={onClose} />
      

      {/* Modal */}
      <div
        ref={containerRef}
        className="relative w-full max-w-[720px] my-8 rounded-2xl overflow-hidden shadow-2xl"
        style={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}>
        
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-5"
          style={{ borderBottom: '1px solid hsl(var(--border))' }}>
          
          <div>
            <h3 className="text-base font-semibold text-foreground">Book a Strategy Call</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Schedule time with a V.I.S.I.O.N. advisor
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
            aria-label="Close">
            
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Embed Area */}
        <div className="bg-white" style={{ borderRadius: '0 0 15px 15px' }}>
          {iframeReady &&
          <iframe
            src={EMBED_URL}
            style={{
              width: '100%',
              border: 'none',
              overflow: 'hidden',
              minHeight: isMobile ? '500px' : '600px'
            }}
            className="w-full block"
            scrolling="no"
            id="HgSooqTOyOPXNaAZ9gWL_1781715472193"
            title="Book a Strategy Call" />

          }
          {!iframeReady &&
          <div className="flex items-center justify-center" style={{ minHeight: isMobile ? '500px' : '600px' }}>
              <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
            </div>
          }
        </div>
      </div>

    </div>);

}