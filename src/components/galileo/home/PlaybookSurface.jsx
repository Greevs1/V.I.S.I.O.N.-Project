/**
 * PlaybookSurface — unified surface for all business work.
 *
 * Organizes meaningful business work conceptually:
 *   DISCOVERED  — things worth considering
 *   EXPLORING   — Opportunities / Strategies / Scenarios being investigated
 *   ACTIVE      — things the user decided to implement
 *   COMPLETED   — implemented / measured items
 *
 * Visual, not project management. Avoid Trello/Jira aesthetics.
 * The user should understand what matters without opening the item.
 *
 * Everything Galileo discovers does not disappear into chat history.
 * It can become persistent business intelligence.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Target, Diamond, ClipboardList, Bookmark } from 'lucide-react';
import { PlaybookStage } from '@/lib/galileo/playbookStore';
import ExplainableText from '@/components/galileo/explain/ExplainableText';

const STAGE_LABELS = {
  [PlaybookStage.DISCOVERED]: 'Discovered',
  [PlaybookStage.EXPLORING]: 'Exploring',
  [PlaybookStage.ACTIVE]: 'Active',
  [PlaybookStage.COMPLETED]: 'Completed',
};

const TYPE_ICONS = {
  opportunity: Target,
  strategy: Diamond,
  scenario: Diamond,
  play: ClipboardList,
  saved: Bookmark,
  saved_playbook: Bookmark,
};

export default function PlaybookSurface({
  playbook,
  onBack,
  onItemAction,
  initialStage = null,
  onAskGalileo,
  onTryWhatIf,
  onAddFinancials,
}) {
  const [activeStage, setActiveStage] = useState(initialStage);

  const stages = [
    { key: PlaybookStage.DISCOVERED, items: playbook?.discovered || [] },
    { key: PlaybookStage.EXPLORING, items: playbook?.exploring || [] },
    { key: PlaybookStage.ACTIVE, items: playbook?.active || [] },
    { key: PlaybookStage.COMPLETED, items: playbook?.completed || [] },
  ].filter((s) => s.items.length > 0);

  const visibleStages = activeStage
    ? stages.filter((s) => s.key === activeStage)
    : stages;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-5 max-w-[720px] mx-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-[11px] text-white/35 hover:text-white/60 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Home
        </button>
        <p className="text-[10px] uppercase tracking-[0.18em] text-white/30 font-medium">
          Playbook
        </p>
      </div>

      {/* Stage filter pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveStage(null)}
          className={`px-3 py-1.5 rounded-full text-[11px] transition-all ${
            !activeStage
              ? 'bg-[#D4A853]/15 text-[#D4A853] border border-[#D4A853]/25'
              : 'border border-white/[0.06] text-white/45 hover:text-white/70'
          }`}
        >
          All
        </button>
        {stages.map((s) => (
          <button
            key={s.key}
            onClick={() => setActiveStage(s.key)}
            className={`px-3 py-1.5 rounded-full text-[11px] transition-all ${
              activeStage === s.key
                ? 'bg-[#D4A853]/15 text-[#D4A853] border border-[#D4A853]/25'
                : 'border border-white/[0.06] text-white/45 hover:text-white/70'
            }`}
          >
            {STAGE_LABELS[s.key]} ({s.items.length})
          </button>
        ))}
      </div>

      {/* Items by stage */}
      <AnimatePresence mode="wait">
        {visibleStages.map((stage) => (
          <motion.div
            key={stage.key}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-2"
          >
            {!activeStage && (
              <p className="text-[10px] uppercase tracking-wider text-white/30 pt-2">
                {STAGE_LABELS[stage.key]}
              </p>
            )}
            {stage.items.map((item) => (
              <PlaybookItem key={item.id} item={item} onOpen={onItemAction} />
            ))}
          </motion.div>
        ))}
      </AnimatePresence>

      {/* ── Empty state ──
          An empty shell teaches nothing, so this states what the Playbook is,
          shows the lifecycle it represents, and offers ONLY actions that really
          exist. Nothing is manufactured to fill a stage: an empty Playbook on a
          business with no financial data points at the data, which is the thing
          that actually produces opportunities. */}
      {stages.length === 0 && (
        <div className="space-y-6 rounded-2xl vision-glass-raised vision-sheen p-6 md:p-7">
          <div className="space-y-2">
            <p className="font-display text-[19px] leading-snug text-white/90">
              Your Playbook starts with a decision.
            </p>
            <p className="max-w-[520px] text-[12.5px] leading-relaxed text-white/45">
              As Vision discovers opportunities, explores scenarios, and helps you choose what
              to implement, they appear here. Nothing is manufactured to fill it.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[10.5px] uppercase tracking-wider text-white/30">
            <span>Discover</span>
            <span className="text-white/15">→</span>
            <span>Explore</span>
            <span className="text-white/15">→</span>
            <span>Choose</span>
            <span className="text-white/15">→</span>
            <span>Execute</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {onAskGalileo && (
              <button
                type="button"
                onClick={onAskGalileo}
                className="rounded-full bg-vision-gold px-4 py-2 text-[12px] font-medium text-black transition-colors hover:bg-vision-bright vision-focus"
              >
                Ask Galileo what I should focus on
              </button>
            )}
            {onTryWhatIf && (
              <button
                type="button"
                onClick={onTryWhatIf}
                className="rounded-full border border-white/[0.09] px-4 py-2 text-[12px] text-white/60 transition-colors hover:border-vision-gold/30 hover:text-white/85 vision-focus"
              >
                Try What If
              </button>
            )}
            {onAddFinancials && (
              <button
                type="button"
                onClick={onAddFinancials}
                className="rounded-full border border-white/[0.09] px-4 py-2 text-[12px] text-white/60 transition-colors hover:border-vision-gold/30 hover:text-white/85 vision-focus"
              >
                Add financial data
              </button>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}

function PlaybookItem({ item, onOpen }) {
  const Icon = TYPE_ICONS[item.type] || Target;

  // A row is interactive ONLY when a real destination exists for its type:
  // an opportunity (its focus surface), a Sprint (the real 90-Day Sprint
  // workspace), or a saved record (the Saved surface). Anything else renders as
  // plain information rather than a row that promises something it cannot do.
  const actionable =
    !!onOpen &&
    (item.type === 'opportunity' ||
      item.type === 'saved' ||
      item.type === 'saved_playbook' ||
      item.nextAction?.type === 'sprint');

  const Wrapper = actionable ? 'button' : 'div';

  return (
    <Wrapper
      type={actionable ? 'button' : undefined}
      onClick={actionable ? () => onOpen(item) : undefined}
      className="group flex items-start gap-3 rounded-xl border border-white/[0.05] bg-white/[0.015] px-4 py-3 text-left transition-all hover:border-[#D4A853]/15 hover:bg-[#D4A853]/[0.02] vision-focus"
    >
      <Icon className="w-4 h-4 text-white/35 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-white/80 truncate">
            <ExplainableText text={item.title} surface="playbook" />
          </span>
          <span className="text-[9px] uppercase tracking-wider text-white/30 shrink-0">
            {item.statusLabel}
          </span>
        </div>
        {item.subtitle && (
          <p className="text-[11px] text-white/40 leading-relaxed">
            {item.subtitle}
          </p>
        )}
        <div className="flex items-center gap-4 pt-0.5">
          {item.impact != null && (
            <span className="text-[11px] text-[#D4A853]/70 font-medium">
              {formatImpact(item.impact)}
            </span>
          )}
          {item.progress != null && item.progress > 0 && (
            <span className="text-[11px] text-white/40">
              {item.progress}% complete
            </span>
          )}
          {/* The affordance is text INSIDE the row, because the whole row is the
              control. Shown only where the row really is interactive. */}
          {actionable && item.next && (
            <span className="text-[11px] text-white/45 transition-colors group-hover:text-[#D4A853]">
              {item.next} →
            </span>
          )}
        </div>
      </div>
    </Wrapper>
  );
}

function formatImpact(impact) {
  if (impact == null) return null;
  if (Math.abs(impact) >= 1e6) return `$${(impact / 1e6).toFixed(1)}M modeled`;
  if (Math.abs(impact) >= 1e3) return `$${Math.round(impact / 1e3)}K modeled`;
  return `$${Math.round(impact).toLocaleString('en-US')} modeled`;
}