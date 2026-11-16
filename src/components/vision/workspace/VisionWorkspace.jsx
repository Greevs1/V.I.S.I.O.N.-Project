/**
 * VisionWorkspace — the single premium working surface that opens over Vision.
 *
 * NOT a dialog. Vision has opened a tool: the cinematic Home stays faintly
 * visible behind it, the legacy sidebar never appears, and the content inside
 * is the REAL existing surface (see the registry — one implementation,
 * multiple shells).
 *
 * ONE LAYER ONLY (Part 19): a nested transition swaps this surface's content
 * and pushes a history entry. There is never a modal on a modal on a modal.
 *
 * LAYER: `.layer-workspace` — deliberately BELOW the app's dialogs and panels
 * (see the layering contract in index.css). A workspace that hosted a real page
 * but painted over that page's own dialogs would be worse than no workspace at
 * all. The global Ask Galileo bar and the notification arrival sit ABOVE this
 * layer on purpose, so they stay with the owner while a workspace is open.
 */

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import WorkspaceHeader from './WorkspaceHeader';
import WorkspaceSkeleton from './WorkspaceSkeleton';
import WorkspaceErrorBoundary from './WorkspaceErrorBoundary';
import { useBusinessContext } from '@/lib/BusinessContext';

const OPEN_TRANSITION = { duration: 0.22, ease: [0.22, 0.61, 0.36, 1] };

// Anything the browser can focus inside the panel.
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** True while a Radix/legacy dialog is open on top of us — it owns Escape and Tab. */
function innerDialogOpen() {
  return !!document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');
}

export default function VisionWorkspace({
  def,
  payload,
  businessName,
  breadcrumb = [],
  canGoBack = false,
  backLabel = null,
  onBack,
  onClose,
  onOpen,
  onReplace,
}) {
  const [expanded, setExpanded] = useState(false);
  const panelRef = useRef(null);
  const restoreFocusRef = useRef(null);

  // Part 20 — the active business is canonical and a switch must not leave the
  // previous business's surface on screen. Keying the content region on it
  // unmounts A's workspace entirely and mounts a clean one for B.
  const { context } = useBusinessContext();
  const activeBusinessId = context?.active_business_id || null;

  const { Component, title, id } = def;

  // ── Focus handling (Part 25) ──────────────────────────────────────────
  useEffect(() => {
    restoreFocusRef.current = document.activeElement;
    panelRef.current?.focus();
    return () => {
      const target = restoreFocusRef.current;
      if (target && typeof target.focus === 'function' && document.contains(target)) {
        target.focus();
      }
    };
  }, []);

  const handleKeyDown = useCallback(
    (e) => {
      // An inner dialog owns Escape and Tab while it is open.
      if (innerDialogOpen()) return;

      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
        return;
      }

      if (e.key === 'Tab' && panelRef.current) {
        const nodes = Array.from(panelRef.current.querySelectorAll(FOCUSABLE)).filter(
          (node) => node.offsetParent !== null || node === document.activeElement
        );
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onClose]
  );

  return (
    <div className="layer-workspace fixed inset-0 flex items-center justify-center" onKeyDown={handleKeyDown}>
      {/* Backdrop — the cinematic Home stays faintly visible behind the glass. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={OPEN_TRANSITION}
        onClick={onClose}
        aria-hidden="true"
        className="absolute inset-0 bg-black/55 backdrop-blur-[3px]"
      />

      {/* The workspace surface */}
      <motion.div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="vision-workspace-title"
        initial={{ opacity: 0, y: 18, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.99 }}
        transition={OPEN_TRANSITION}
        className={[
          'relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.09] outline-none',
          'bg-[rgba(9,9,13,0.94)] backdrop-blur-2xl',
          'shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)]',
          expanded
            ? 'h-[100dvh] w-screen rounded-none border-0'
            : // Small screens: the Vision surface is effectively full-screen, so a
              // document reads as a Galileo workspace with a clear way back rather
              // than a cramped floating panel.
              'h-[100dvh] w-screen rounded-none border-0 md:h-[89vh] md:w-[92vw] md:max-w-[1560px] md:rounded-2xl md:border',
        ].join(' ')}
      >
        <WorkspaceHeader
          title={title}
          breadcrumb={breadcrumb}
          businessName={businessName}
          canGoBack={canGoBack}
          backLabel={backLabel}
          onBack={canGoBack ? onBack : onClose}
          expanded={expanded}
          onToggleExpand={() => setExpanded((v) => !v)}
          onClose={onClose}
        />

        {/* The workspace content. The global Galileo bar floats at the bottom of
            the Vision viewport, so the scroll region reserves its own height —
            that is what keeps the bar off the last row of content on a small
            screen, at the shell level, with no per-page padding. */}
        <div
          key={activeBusinessId || 'no-business'}
          className="min-h-0 flex-1 overflow-y-auto"
          style={{ paddingBottom: 'calc(var(--vision-assistant-space) + env(safe-area-inset-bottom))' }}
        >
          <WorkspaceErrorBoundary resetKey={`${id}:${payload || ''}`}>
            <Suspense fallback={<WorkspaceSkeleton label={`Opening ${title}`} />}>
              {/* A workspace that owns sub-views (the document overlay: upload,
                  viewer, review) is handed the layer's own navigation, so its
                  internal transitions are LEVELS of the stack and its Back never
                  means "leave Vision". */}
              <Component payload={payload} onOpen={onOpen} onReplace={onReplace} onBack={onBack} />
            </Suspense>
          </WorkspaceErrorBoundary>
        </div>
      </motion.div>
    </div>
  );
}