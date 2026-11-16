/**
 * SpotlightOverlay — Phase 5.6 Polish Fix
 *
 * Receives a pre-computed spotlightRect (already padded & capped by ExecutiveBriefing).
 * This component only handles rendering — no measurement logic here.
 *
 * Fix: SVG coordinates are viewport-relative (fixed position), which is correct
 * since getBoundingClientRect() returns viewport coords. No transform needed.
 */

import React from 'react';
import { motion } from 'framer-motion';

export default function SpotlightOverlay({ highlightRect, onDismiss }) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (!highlightRect) {
    return (
      <motion.div
        className="fixed inset-0 pointer-events-auto"
        style={{ zIndex: 49, background: 'rgba(0,0,0,0.52)', backdropFilter: 'blur(1px)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
        onClick={onDismiss}
      />
    );
  }

  const { top: sy, left: sx, width: sw, height: sh } = highlightRect;
  const br = 14; // border radius of the cutout

  // Rounded-rect cutout using SVG evenodd fill rule
  // The outer rect fills the whole viewport; the inner rounded rect cuts a hole.
  const d = [
    `M 0 0 H ${vw} V ${vh} H 0 Z`,
    `M ${sx + br} ${sy}`,
    `H ${sx + sw - br}`,
    `Q ${sx + sw} ${sy} ${sx + sw} ${sy + br}`,
    `V ${sy + sh - br}`,
    `Q ${sx + sw} ${sy + sh} ${sx + sw - br} ${sy + sh}`,
    `H ${sx + br}`,
    `Q ${sx} ${sy + sh} ${sx} ${sy + sh - br}`,
    `V ${sy + br}`,
    `Q ${sx} ${sy} ${sx + br} ${sy}`,
    `Z`,
  ].join(' ');

  return (
    <>
      {/* Dim mask with cutout — pointer-events on so clicks outside dismiss */}
      <motion.div
        className="fixed inset-0 pointer-events-auto"
        style={{ zIndex: 49 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        onClick={onDismiss}
      >
        <svg
          width={vw}
          height={vh}
          style={{ position: 'absolute', top: 0, left: 0, display: 'block', pointerEvents: 'none' }}
        >
          <path d={d} fill="rgba(0,0,0,0.58)" fillRule="evenodd" />
        </svg>
      </motion.div>

      {/* Gold glow ring — pointer-events-none so it doesn't block the spotlight element */}
      <motion.div
        className="fixed pointer-events-none"
        style={{
          zIndex: 51,
          top:    sy - 1,
          left:   sx - 1,
          width:  sw + 2,
          height: sh + 2,
          borderRadius: br + 1,
          border: '1px solid rgba(212,168,83,0.45)',
          boxShadow: '0 0 20px 0 rgba(212,168,83,0.15), 0 0 40px 0 rgba(212,168,83,0.07)',
        }}
        initial={{ opacity: 0, scale: 0.985 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.35, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
      />
    </>
  );
}