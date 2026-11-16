/**
 * DomainFocus — the domain-specific canvas focus experience.
 *
 * Clicking a Pulse signal focuses the central canvas on that domain.
 * No route change. The domain surface is conversational intelligence,
 * not a dashboard.
 *
 * Shows:
 *   - Domain header with current indicator + trend
 *   - Industry context (where supported)
 *   - Best-in-class (where supported)
 *   - Galileo observation about what's driving the current state
 *   - Relevant objects (Opportunity, Trend, Evidence, Question, Scenario, Play)
 *   - Conversation starters for that domain
 */

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, TrendingUp, TrendingDown, Target, Diamond } from 'lucide-react';

export default function DomainFocus({ focus, onBack, onCommand, onOpenObject }) {
  if (!focus) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-5 max-w-[680px] mx-auto"
    >
      {/* Back button */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-[11px] text-white/35 hover:text-white/60 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Home
      </button>

      {/* Domain header */}
      <div className="space-y-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-white/30 font-medium">
          {focus.label}
        </p>
        <div className="flex items-baseline gap-4">
          {focus.indicator?.value && (
            <div>
              <span className="text-[28px] font-display font-semibold text-white/90 leading-tight">
                {focus.indicator.value}
              </span>
              <span className="text-[12px] text-white/40 ml-2">
                {focus.indicator.label}
              </span>
            </div>
          )}
          {focus.trend && (
            <div className={`inline-flex items-center gap-1 text-[13px] font-medium ${
              focus.trend.direction === 'up' ? 'text-[#D4A853]' : 'text-red-400/70'
            }`}>
              {focus.trend.direction === 'up' ? (
                <TrendingUp className="w-3.5 h-3.5" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5" />
              )}
              {focus.trend.value}
            </div>
          )}
        </div>
      </div>

      {/* Industry context + Best-in-class */}
      {(focus.industryContext || focus.bestInClass) && (
        <div className="flex items-center gap-6 py-2">
          {focus.industryContext?.typical && (
            <div>
              <span className="text-[10px] uppercase tracking-wider text-white/30 block">
                {focus.industryContext.label}
              </span>
              <span className="text-[13px] text-white/60">
                Typical: {focus.industryContext.typical}
              </span>
            </div>
          )}
          {focus.bestInClass?.value && (
            <div>
              <span className="text-[10px] uppercase tracking-wider text-white/30 block">
                {focus.bestInClass.label}
              </span>
              <span className="text-[13px] text-white/60">
                {focus.bestInClass.value}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Galileo observation */}
      {focus.observation && (
        <div className="py-2">
          <p className="text-[14px] text-white/65 leading-relaxed">
            {focus.observation}
          </p>
        </div>
      )}

      {/* Relevant objects */}
      {focus.relevantObjects?.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-[10px] uppercase tracking-wider text-white/30">
            Related
          </p>
          {focus.relevantObjects.map((obj, i) => {
            // A related opportunity opens its own detail surface; anything
            // without a destination stays plain information.
            const openable = !!onOpenObject && obj.type === 'opportunity' && !!obj.id;
            const Row = openable ? 'button' : 'div';
            return (
            <Row
              key={obj.id || i}
              type={openable ? 'button' : undefined}
              onClick={openable ? () => onOpenObject(obj) : undefined}
              className="flex w-full items-center gap-3 px-4 py-2.5 rounded-xl border border-white/[0.05] bg-white/[0.015] text-left transition-colors hover:border-[#D4A853]/15 vision-focus"
            >
              {obj.type === 'opportunity' && <Target className="w-3.5 h-3.5 text-[#D4A853]/60 shrink-0" />}
              {obj.type === 'scenario' && <Diamond className="w-3.5 h-3.5 text-[#D4A853]/60 shrink-0" />}
              <div className="flex-1 min-w-0">
                <span className="block text-[13px] text-white/75 truncate">
                  {obj.title}
                </span>
                {obj.impact && (
                  <span className="block text-[11px] text-[#D4A853]/70">
                    {formatImpact(obj.impact)}
                  </span>
                )}
              </div>
              {obj.state && (
                <span className="text-[10px] text-white/35 capitalize shrink-0">
                  {obj.state}
                </span>
              )}
            </Row>
            );
          })}
        </div>
      )}

      {/* Conversation starters */}
      {focus.conversationStarters?.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2">
          {focus.conversationStarters.map((cmd, i) => (
            <button
              key={i}
              onClick={() => onCommand?.(cmd)}
              className="px-3 py-1.5 rounded-full border border-white/[0.06] bg-white/[0.015] text-[11px] text-white/50 hover:border-[#D4A853]/20 hover:text-white/75 transition-all"
            >
              {cmd.label || cmd}
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function formatImpact(impact) {
  if (impact == null) return null;
  if (Math.abs(impact) >= 1e6) return `$${(impact / 1e6).toFixed(1)}M`;
  if (Math.abs(impact) >= 1e3) return `$${Math.round(impact / 1e3)}K`;
  return `$${Math.round(impact).toLocaleString('en-US')}`;
}