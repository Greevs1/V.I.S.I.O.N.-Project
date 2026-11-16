/**
 * PulseTile — one Business Pulse domain tile.
 *
 * Presentation only: the domain's real value, label and secondary context
 * arrive from the signal layer. No value is ever computed, rounded or
 * invented here, and no trend is drawn (the intelligence layer exposes no
 * trend series — a fake sparkline would be a lie).
 *
 * Muted domain accents provide differentiation; the Vision gold remains the
 * brand. Learning states stay quiet rather than shouting a placeholder.
 */

import React from 'react';
import { motion } from 'framer-motion';

export default function PulseTile({
  label,
  icon: Icon,
  accentClass,
  value,
  secondary,
  isLearning,
  isInteresting,
  isActive,
  index = 0,
  onClick,
}) {
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.045, duration: 0.35, ease: 'easeOut' }}
      onClick={onClick}
      aria-label={`${label}: ${isLearning ? 'still learning' : value}`}
      className={[
        accentClass,
        'group relative flex flex-col overflow-hidden rounded-2xl border p-3.5 text-left',
        'transition-all duration-200 vision-focus',
        isActive
          ? 'border-vision-gold/35 bg-vision-gold/[0.07]'
          : 'border-white/[0.055] bg-white/[0.018] hover:-translate-y-0.5 hover:border-white/[0.12] hover:bg-white/[0.035]',
      ].join(' ')}
      style={{
        boxShadow: isActive
          ? '0 12px 32px -14px rgb(var(--pulse-accent) / 0.5)'
          : undefined,
      }}
    >
      {/* Domain accent — a bottom-edge light, not a color wash. */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgb(var(--pulse-accent) / 0.55), transparent)',
        }}
      />

      <div className="mb-2.5 flex items-center gap-1.5">
        <Icon
          className="h-3.5 w-3.5"
          style={{ color: 'rgb(var(--pulse-accent) / 0.85)' }}
        />
        <span className="text-[9.5px] font-medium uppercase tracking-[0.14em] text-white/40">
          {label}
        </span>
        {isInteresting && (
          <span
            className="ml-auto h-1 w-1 rounded-full"
            style={{ backgroundColor: 'rgb(var(--pulse-accent))' }}
          />
        )}
      </div>

      {isLearning ? (
        <span className="font-display text-[15px] italic text-white/28">Learning…</span>
      ) : (
        <>
          <span className="font-display text-[19px] leading-none text-white/92">{value}</span>
          {secondary && (
            <span className="mt-1.5 text-[10.5px] leading-tight text-white/40">{secondary}</span>
          )}
        </>
      )}
    </motion.button>
  );
}