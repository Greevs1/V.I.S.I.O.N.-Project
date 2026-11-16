/**
 * MoveForwardChoice — the two implementation paths, offered after a Galileo
 * answer or a scenario result.
 *
 *   GUIDE ME WITH GALILEO   — the do-it-yourself path, stepped
 *   WORK WITH OUR TEAM      — the human-supported path
 *
 * Both are real: the first opens the progressive guide, the second opens the
 * expert surface. Neither is rendered when there is no answer context to carry
 * forward, because a handoff with nothing to hand over is theatre.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Users } from 'lucide-react';

export default function MoveForwardChoice({ onGuide, onTeam, disabled = false }) {
  if (!onGuide && !onTeam) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="space-y-2.5 pt-1"
    >
      <p className="text-[10px] uppercase tracking-[0.18em] text-white/30">
        How do you want to move forward?
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {onGuide && (
          <PathButton
            icon={Sparkles}
            title="Guide me with Galileo"
            subtext="Walk me through it step by step."
            onClick={onGuide}
            disabled={disabled}
          />
        )}
        {onTeam && (
          <PathButton
            icon={Users}
            title="Work with our team"
            subtext="Bring in an expert to help implement it."
            onClick={onTeam}
            disabled={disabled}
          />
        )}
      </div>
    </motion.div>
  );
}

function PathButton({ icon: Icon, title, subtext, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-left transition-all duration-200 hover:border-vision-gold/30 hover:bg-vision-gold/[0.04] disabled:opacity-40 vision-focus"
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-vision-gold/70 transition-colors group-hover:text-vision-bright" />
      <span className="min-w-0">
        <span className="block text-[12.5px] font-medium text-white/85">{title}</span>
        <span className="block text-[11px] leading-relaxed text-white/40">{subtext}</span>
      </span>
    </button>
  );
}