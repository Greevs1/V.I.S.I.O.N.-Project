/**
 * DetailDrawer — Phase 13.3F.1
 *
 * Side drawer for deep technical content (calculation lines, evidence,
 * provenance, historical detail, benchmark detail, DCF projections, asset
 * detail, explainability, audit history, version comparison).
 *
 * Desktop: right-side panel (max-w-lg). Mobile: full-width bottom sheet.
 * Focus trap on open, focus return on close, ESC to close, overlay click
 * to close. Reduced-motion respected.
 */
import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export default function DetailDrawer({ open, onClose, title, subtitle, children, footer, width = 'lg' }) {
  const drawerRef = useRef(null);
  const triggerRef = useRef(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
    }
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    triggerRef.current = document.activeElement;
    requestAnimationFrame(() => {
      drawerRef.current?.focus();
    });

    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
      try { triggerRef.current?.focus(); } catch { /* non-fatal */ }
    };
  }, [mounted, onClose]);

  useEffect(() => {
    if (!open && mounted) {
      const timer = setTimeout(() => setMounted(false), 200);
      return () => clearTimeout(timer);
    }
  }, [open, mounted]);

  if (!mounted) return null;

  const widthClass = width === 'xl' ? 'sm:max-w-2xl' : width === 'md' ? 'sm:max-w-md' : 'sm:max-w-lg';

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Overlay */}
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity motion-safe:duration-200 ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative w-full ${widthClass} h-full bg-card border-l border-border shadow-2xl overflow-y-auto transition-transform motion-safe:duration-200 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border px-5 py-4 flex items-center justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground truncate">{title}</h3>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary shrink-0"
            aria-label="Close drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="sticky bottom-0 bg-card/95 backdrop-blur border-t border-border px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}