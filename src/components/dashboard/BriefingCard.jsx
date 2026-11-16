/**
 * BriefingCard — Phase 5.6 Polish Fix
 *
 * Fixes:
 *   1. Card uses flex-column layout so footer is always sticky at bottom
 *   2. Content area scrolls independently — footer never gets clipped
 *   3. Total card height is capped at (vh - top - 48px) so it always fits
 *   4. Mobile: full-width bottom sheet with safe-area padding
 *   5. Connector SVG uses position:fixed (not absolute) so it draws across the viewport
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, X, ChevronRight, ArrowRight } from 'lucide-react';

// ── Animated Number count-up ──────────────────────────────────────────────────
function AnimatedNumber({ value, prefix = '', suffix = '', duration = 1.0 }) {
  const [display, setDisplay] = useState(0);
  const frameRef = useRef(null);

  useEffect(() => {
    if (value == null || isNaN(value)) return;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min((now - start) / 1000 / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(value * eased));
      if (t < 1) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [value, duration]);

  if (value == null) return null;
  const formatted = display >= 1_000_000
    ? `${prefix}${(display / 1_000_000).toFixed(1)}M${suffix}`
    : `${prefix}${display.toLocaleString('en-US')}${suffix}`;
  return <span>{formatted}</span>;
}

// ── Staggered section ─────────────────────────────────────────────────────────
const Section = ({ label, children, index = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: index * 0.08, duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
  >
    {label && (
      <p className="text-[9px] uppercase tracking-[0.18em] font-semibold mb-1"
        style={{ color: 'rgba(255,255,255,0.22)' }}>
        {label}
      </p>
    )}
    {children}
  </motion.div>
);

// ── Confidence chip ───────────────────────────────────────────────────────────
function ImpactRow({ impact, confidenceRaw }) {
  const conf = confidenceRaw?.split('—')[0].trim().toLowerCase() ?? '';
  const dot = conf === 'high' ? '#10B981' : conf === 'medium' ? '#D4A853' : 'rgba(255,255,255,0.2)';
  const confLabel = conf === 'high' ? 'High confidence' : conf === 'medium' ? 'Medium' : conf === 'low' ? 'Low — limited data' : 'No data yet';

  return (
    <div className="flex gap-2">
      {impact && (
        <div className="flex-1 rounded-xl px-3 py-2" style={{ background: 'rgba(212,168,83,0.07)', border: '1px solid rgba(212,168,83,0.13)' }}>
          <p className="text-[8px] uppercase tracking-wider mb-0.5" style={{ color: 'rgba(212,168,83,0.5)' }}>Impact</p>
          <p className="text-[11px] font-semibold leading-tight" style={{ color: '#D4A853' }}>{impact}</p>
        </div>
      )}
      <div className="flex-1 rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <p className="text-[8px] uppercase tracking-wider mb-0.5" style={{ color: 'rgba(255,255,255,0.22)' }}>Confidence</p>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dot }} />
          <p className="text-[10px] leading-tight" style={{ color: 'rgba(255,255,255,0.4)' }}>{confLabel}</p>
        </div>
      </div>
    </div>
  );
}

// ── Card width constants (must match ExecutiveBriefing) ───────────────────────
const CARD_W = 360;

// ── Main component ────────────────────────────────────────────────────────────
export default function BriefingCard({
  step, stepIndex, totalSteps,
  onNext, onClose,
  position,
  connectorAnchor,
  spotlightAnchor,
}) {
  const isIntro  = step?.type === 'intro';
  const isMetric = step?.type === 'metric';
  const isBridge = step?.type === 'bridge';
  const isOutro  = step?.type === 'outro';
  const isLast   = stepIndex === totalSteps - 1;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const mobile = vw < 640;

  // Dynamic max height: viewport height minus card's top position minus 48px safety margin
  const maxCardH = mobile
    ? Math.min(460, vh * 0.55)
    : Math.max(200, vh - position.top - 48);

  // On mobile, override to bottom-sheet
  const cardStyle = mobile ? {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    zIndex: 52,
    maxHeight: maxCardH,
  } : {
    position: 'fixed',
    top: position.top,
    left: position.left,
    width: CARD_W,
    maxHeight: maxCardH,
    zIndex: 52,
  };

  const showConnector = !mobile && connectorAnchor && spotlightAnchor;

  return (
    <motion.div
      key={`card-${stepIndex}`}
      style={cardStyle}
      initial={{ opacity: 0, y: mobile ? 20 : 10, scale: mobile ? 1 : 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: mobile ? 16 : -6, scale: mobile ? 1 : 0.97 }}
      transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
    >
      {/* Connector line — fixed-position SVG so it can draw across the viewport */}
      {showConnector && (
        <svg
          style={{
            position: 'fixed',
            top: 0, left: 0,
            width: vw, height: vh,
            pointerEvents: 'none',
            zIndex: 51,
            overflow: 'visible',
          }}
        >
          <motion.line
            x1={connectorAnchor.x}
            y1={connectorAnchor.y}
            x2={spotlightAnchor.x}
            y2={spotlightAnchor.y}
            stroke="rgba(212,168,83,0.3)"
            strokeWidth="1"
            strokeDasharray="4 5"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, delay: 0.25, ease: 'easeOut' }}
          />
          <motion.circle
            cx={spotlightAnchor.x}
            cy={spotlightAnchor.y}
            r="2.5"
            fill="rgba(212,168,83,0.45)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.65, duration: 0.25 }}
          />
        </svg>
      )}

      {/* Glass card — flex column so footer sticks */}
      <div
        className="flex flex-col"
        style={{
          height: '100%',
          maxHeight: maxCardH,
          background: 'rgba(7,7,11,0.97)',
          border: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(32px)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.65), 0 0 0 0.5px rgba(255,255,255,0.04) inset',
          borderRadius: mobile ? '20px 20px 0 0' : 16,
          overflow: 'hidden',
        }}
      >
        {/* ── Header (sticky) ── */}
        <div
          className="flex items-center justify-between px-4 pt-3.5 pb-3 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
              style={{ background: 'rgba(212,168,83,0.12)' }}>
              <Sparkles className="w-2.5 h-2.5" style={{ color: '#D4A853' }} />
            </div>
            <span className="text-[9px] tracking-[0.2em] uppercase font-semibold shrink-0"
              style={{ color: 'rgba(212,168,83,0.8)' }}>
              Galileo
            </span>
            {step?.label && (
              <>
                <span className="shrink-0" style={{ color: 'rgba(255,255,255,0.1)', fontSize: 10, margin: '0 2px' }}>·</span>
                <span className="text-[9px] tracking-wider uppercase truncate"
                  style={{ color: 'rgba(255,255,255,0.28)' }}>
                  {step.label}
                </span>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 ml-2 w-5 h-5 rounded-full flex items-center justify-center transition-opacity hover:opacity-60"
            style={{ background: 'rgba(255,255,255,0.06)' }}
          >
            <X className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.4)' }} />
          </button>
        </div>

        {/* ── Progress dots (sticky) ── */}
        <div className="flex items-center gap-0.5 px-4 pt-2.5 pb-1 shrink-0">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className="rounded-full transition-all duration-300"
              style={{
                width: i === stepIndex ? 14 : 3,
                height: 3,
                background: i < stepIndex
                  ? 'rgba(212,168,83,0.45)'
                  : i === stepIndex
                  ? '#D4A853'
                  : 'rgba(255,255,255,0.07)',
              }}
            />
          ))}
        </div>

        {/* ── Scrollable content ── */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">

          {/* INTRO */}
          {isIntro && (
            <Section index={0}>
              <p className="text-[13px] leading-relaxed font-light"
                style={{ color: 'rgba(255,255,255,0.72)' }}>
                {step.message}
              </p>
            </Section>
          )}

          {/* METRIC */}
          {isMetric && (
            <div className="space-y-2.5">
              <Section label="What this is" index={0}>
                <p className="text-[11px] leading-relaxed"
                  style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {step.what}
                </p>
              </Section>
              <Section label="What we found" index={1}>
                <p className="text-[11px] leading-relaxed font-medium"
                  style={{ color: 'rgba(255,255,255,0.85)' }}>
                  {step.finding}
                </p>
              </Section>
              <Section label="First recommendation" index={2}>
                <p className="text-[11px] leading-relaxed"
                  style={{ color: 'rgba(255,255,255,0.52)' }}>
                  {step.recommendation}
                </p>
              </Section>
              <Section index={3}>
                <ImpactRow impact={step.impact} confidenceRaw={step.confidence} />
              </Section>
              {!step.hasData && (
                <Section index={4}>
                  <div className="rounded-lg px-3 py-2"
                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.28)' }}>
                      Assessment not yet completed — showing context only.
                    </p>
                  </div>
                </Section>
              )}
            </div>
          )}

          {/* BRIDGE */}
          {isBridge && (
            <div className="space-y-3">
              <Section index={0}>
                <p className="text-[14px] font-semibold leading-snug" style={{ color: '#F5F5F5' }}>
                  {step.message}
                </p>
                <p className="text-[12px] mt-1" style={{ color: '#D4A853' }}>{step.subMessage}</p>
              </Section>
              <Section index={1}>
                <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.48)' }}>
                  {step.description}
                </p>
              </Section>
              <Section index={2}>
                <div className="rounded-xl px-3 py-2.5"
                  style={{ background: 'rgba(212,168,83,0.06)', border: '1px solid rgba(212,168,83,0.13)' }}>
                  <p className="text-[8px] uppercase tracking-wider mb-1"
                    style={{ color: 'rgba(212,168,83,0.45)' }}>Next chapter</p>
                  <p className="text-[11px] font-semibold" style={{ color: '#D4A853' }}>
                    90-Day Sprints — intelligence into measurable progress
                  </p>
                </div>
              </Section>
            </div>
          )}

          {/* OUTRO */}
          {isOutro && (
            <div className="space-y-2">
              <Section index={0}>
                <p className="text-[13px] font-medium leading-snug"
                  style={{ color: 'rgba(255,255,255,0.72)' }}>
                  {step.message}
                </p>
              </Section>
              <Section index={1}>
                <div className="space-y-1.5 pt-1">
                  {step.choices?.map((choice, ci) => (
                    <a
                      key={choice.id}
                      href={choice.path}
                      className="flex items-center justify-between w-full px-3.5 py-2.5 rounded-xl text-[11px] font-medium transition-opacity hover:opacity-75"
                      style={{
                        background: ci === 0 ? 'rgba(212,168,83,0.08)' : 'rgba(255,255,255,0.03)',
                        border: ci === 0 ? '1px solid rgba(212,168,83,0.18)' : '1px solid rgba(255,255,255,0.06)',
                        color: ci === 0 ? '#D4A853' : 'rgba(255,255,255,0.62)',
                      }}
                      onClick={onClose}
                    >
                      <span>{choice.label}</span>
                      <ArrowRight className="w-3 h-3 opacity-40 shrink-0" />
                    </a>
                  ))}
                </div>
              </Section>
            </div>
          )}
        </div>

        {/* ── Footer (always sticky at bottom) ── */}
        {!isOutro && (
          <div
            className="flex items-center justify-between px-4 py-3 shrink-0"
            style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
          >
            <button
              onClick={onClose}
              className="text-[9px] uppercase tracking-wider transition-opacity hover:opacity-50"
              style={{ color: 'rgba(255,255,255,0.18)' }}
            >
              End briefing
            </button>
            <button
              onClick={onNext}
              className="flex items-center gap-1.5 text-[11px] font-semibold px-4 py-2 rounded-lg transition-opacity hover:opacity-85 active:scale-95"
              style={{ background: '#D4A853', color: '#08080C' }}
            >
              {isBridge ? step.nextLabel : isLast ? 'Done' : 'Continue'}
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {isOutro && (
          <div className="px-4 pb-4 shrink-0">
            <button
              onClick={onClose}
              className="text-[9px] uppercase tracking-wider transition-opacity hover:opacity-50"
              style={{ color: 'rgba(255,255,255,0.18)' }}
            >
              Close briefing
            </button>
          </div>
        )}

        {/* Mobile safe-area spacer */}
        {mobile && <div style={{ height: 'env(safe-area-inset-bottom, 8px)' }} />}
      </div>
    </motion.div>
  );
}