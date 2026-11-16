/**
 * NotificationBubble — the arrival moment, anchored under the bell.
 *
 * It is PRESENTATION around the existing notification: no record is created, no
 * read state is touched, and the whole card is one control that hands the
 * notification straight back to the bell's own click path. So the bubble, the
 * bell item and the destination resolver can never disagree — they are the same
 * click (§20).
 *
 * WHERE IT LIVES (Part 15/16). Not inside the bell's container: it is portaled
 * into the GLOBAL overlay layer (`layer-arrival`), because the bell sits in a
 * header inside a workspace-scoped stacking context, and a bubble trapped there
 * is painted underneath the Data Room, the document viewer, drawers and modals.
 * The position still comes from the bell — the caller measures it and passes
 * `anchor` — so the arrival reads as coming from 🔔, never from a corner of the
 * browser.
 *
 * Sound is deliberately absent here: this component is the visual half, and it
 * must read completely without audio (§34).
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { ArrowRight, FileText } from 'lucide-react';
import { assignmentTypeLabel } from '@/lib/documentAssignments';

/** Long enough to read a two-line summary, then gone (§31). */
const VISIBLE_MS = 6000;

export default function NotificationBubble({ notification, more = 0, anchor, onOpen, onDismiss }) {
  const [paused, setPaused] = useState(false);
  // Held in a ref so a parent re-render (the unread poll ticks every 15s) can
  // never restart the timer and keep the bubble on screen forever.
  const dismissRef = useRef(onDismiss);
  useEffect(() => { dismissRef.current = onDismiss; });

  useEffect(() => {
    const timer = setTimeout(() => dismissRef.current?.(), VISIBLE_MS);
    return () => clearTimeout(timer);
    // Re-armed only by a pause toggle or a genuinely different notification —
    // never by an unrelated render.
  }, [paused, notification?.id]);

  if (!notification) return null;

  const assignmentType = notification.metadata?.assignment_type;

  return createPortal(
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.24, ease: 'easeOut' }}
      // `fixed` at the measured bell anchor, on the arrival layer: above every
      // workspace surface, below an explicit confirmation the owner is in.
      className="layer-arrival fixed w-[308px] max-w-[calc(100vw-24px)]"
      style={{ top: anchor?.top ?? 76, right: anchor?.right ?? 16 }}
      role="status"
      aria-live="polite"
    >
      <button
        type="button"
        onClick={onOpen}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
        className="vision-glass-raised vision-sheen vision-focus group block w-full rounded-xl border border-vision-gold/25 px-3.5 py-3 text-left transition-colors hover:border-vision-gold/45"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-vision-gold/15">
            <FileText className="h-3.5 w-3.5 text-vision-gold" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.2em] text-vision-gold/85">
              Document assigned
            </p>

            <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-white/85">
              {notification.message || notification.title}
            </p>

            <div className="mt-2 flex items-center gap-2">
              {assignmentType && (
                <span className="rounded-full border border-vision-gold/30 bg-vision-gold/10 px-2 py-0.5 text-[10px] font-medium text-vision-gold">
                  {assignmentTypeLabel(assignmentType)}
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-[10.5px] text-white/45 transition-colors group-hover:text-white/75">
                Open document
                <ArrowRight className="h-3 w-3" />
              </span>
            </div>

            {more > 0 && (
              <p className="mt-1.5 text-[10px] text-white/40">
                +{more} more new {more === 1 ? 'assignment' : 'assignments'} in your notifications
              </p>
            )}
          </div>
        </div>
      </button>
    </motion.div>,
    document.body
  );
}