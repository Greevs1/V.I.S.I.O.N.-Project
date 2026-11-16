/**
 * PulseLens — one Business Pulse domain, focused INLINE.
 *
 * WHY INLINE
 * The Pulse is navigation, not a set of dashboard cards: selecting a domain
 * unfolds Galileo's understanding of that area on the surface the owner is
 * already standing on, with the Pulse still visible and the selected signal
 * quietly active. No route change. No modal. No dashboard.
 *
 * HONESTY
 * Every figure arrives from the canonical signal layer through `resolvePulseLens`.
 * When the area is not supported, this shows that plainly and names the one
 * piece of evidence that would change it — it never manufactures an answer, an
 * opportunity or a number because a tile was clicked.
 *
 * COMMERCIAL AUTHORITY
 * The two doors (Galileo / Expert) are the EXISTING fork. Their labels, locked
 * states and destinations come from the existing access resolver, and the
 * handlers are the ones Home already uses. Nothing here grants anything.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { X, Target, ArrowRight, Lightbulb } from 'lucide-react';
import ImplementationChoice from './ImplementationChoice';

export default function PulseLens({
  lens,
  onClose,
  onAsk,
  onCommand,
  onOpenOpportunity,
  onUpload,
  onSprint,
  access,
  onGalileo,
  onTeam,
  onDomainDetail,
}) {
  if (!lens) return null;

  /** Route a next-layer thread to the REAL capability behind it. */
  const runCapability = (capability) => {
    if (!capability) return;
    switch (capability.action) {
      case 'view_opportunities':
      case 'whatif':
      case 'connect_financials':
        onCommand?.({ action: capability.action });
        break;
      case 'expert':
        onTeam?.();
        break;
      case 'open_sprint':
        onSprint?.();
        break;
      case 'upload':
        onUpload?.(lens.evidence?.phrase || null);
        break;
      default:
        break;
    }
  };

  const runPrimary = () => {
    const p = lens.primary;
    if (!p) return;
    if (p.kind === 'opportunity') onOpenOpportunity?.(p.id);
    else if (p.kind === 'command') onCommand?.({ action: p.action });
    else if (p.kind === 'upload') onUpload?.(p.needs || null);
  };

  const showFork = lens.related_opportunities.length > 0 || lens.supported;

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="vision-glass-raised vision-sheen relative overflow-hidden rounded-2xl p-5 md:p-6"
    >
      {/* Header — which lens is open, and the way out. */}
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.2em] text-white/40">
            Focus
          </span>
          <span className="rounded-full border border-vision-gold/25 bg-vision-gold/[0.06] px-2.5 py-0.5 text-[11px] text-vision-champagne">
            {lens.label}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to your business"
          className="-mr-1 -mt-1 rounded-full p-1.5 text-white/35 transition-colors hover:text-white/70 vision-focus"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Galileo's statement — what it can honestly say about this area. */}
      <p className="font-display text-[19px] leading-snug text-white/90 md:text-[22px]">
        {lens.statement}
      </p>

      {lens.indicator && (
        <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-display text-[30px] leading-none text-white/95">
            {lens.indicator.value}
          </span>
          <span className="text-[12px] text-white/45">{lens.indicator.label}</span>
          {lens.indicator.secondary && (
            <span className="text-[12px] text-vision-champagne/80">{lens.indicator.secondary}</span>
          )}
        </div>
      )}

      {lens.basis && (
        <p className="mt-1.5 text-[11px] text-white/32">{lens.basis}</p>
      )}

      {/* Driver + confidence — only where canonical material supports them. */}
      {(lens.driver || lens.confidence) && (
        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
          {lens.driver && (
            <div>
              <span className="block text-[10px] uppercase tracking-[0.16em] text-white/32">
                {lens.driver.label}
              </span>
              <span className="text-[13px] text-white/70">{lens.driver.detail}</span>
            </div>
          )}
          {lens.confidence && (
            <div>
              <span className="block text-[10px] uppercase tracking-[0.16em] text-white/32">
                Confidence
              </span>
              <span className="text-[13px] text-white/70">{lens.confidence.label}</span>
            </div>
          )}
        </div>
      )}

      {/* The one piece of evidence that would change the picture. */}
      {lens.evidence && (
        <div className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
          <p className="text-[13px] text-white/60">
            {capitalize(lens.evidence.phrase)} would sharpen this.
          </p>
          <button
            type="button"
            onClick={() => onUpload?.(lens.evidence.phrase)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-vision-gold px-4 py-2 text-[12.5px] font-medium text-black transition-colors hover:bg-vision-gold/90 vision-focus"
          >
            {lens.evidence.label}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Primary next step. */}
      {lens.primary && (
        <div className="mt-5">
          <button
            type="button"
            onClick={runPrimary}
            className="inline-flex items-center gap-2 rounded-full border border-vision-gold/30 bg-vision-gold/[0.07] px-4 py-2.5 text-[13px] font-medium text-vision-champagne transition-colors hover:bg-vision-gold/[0.12] vision-focus"
          >
            <Target className="h-3.5 w-3.5" />
            {lens.primary.label}
          </button>
        </div>
      )}

      {/* Related canonical opportunities — each opens its existing surface. */}
      {lens.related_opportunities.length > 0 && (
        <div className="mt-5 space-y-2">
          <p className="text-[10px] uppercase tracking-[0.16em] text-white/30">
            In this area
          </p>
          {lens.related_opportunities.map((opp) => (
            <button
              key={opp.id}
              type="button"
              onClick={() => onOpenOpportunity?.(opp.id)}
              className="flex w-full items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.015] px-4 py-2.5 text-left transition-colors hover:border-vision-gold/20 vision-focus"
            >
              <Target className="h-3.5 w-3.5 shrink-0 text-vision-gold/60" />
              <span className="flex-1 truncate text-[13px] text-white/75">{opp.title}</span>
              {opp.status && (
                <span className="shrink-0 text-[10px] capitalize text-white/35">{opp.status}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Contextual questions the canonical answer service can actually take. */}
      {lens.prompts.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {lens.prompts.map((cmd, i) => (
            <button
              key={`${cmd.label}-${i}`}
              type="button"
              onClick={() => (cmd.prompt ? onAsk?.(cmd.prompt) : onCommand?.(cmd))}
              className="rounded-full border border-white/[0.06] bg-white/[0.015] px-3 py-1.5 text-[11.5px] text-white/55 transition-colors hover:border-vision-gold/20 hover:text-white/80 vision-focus"
            >
              {cmd.label}
            </button>
          ))}
        </div>
      )}

      {/* The existing implementation fork — its words and states come from the
          existing access resolver, so it never sells what the owner already has. */}
      {showFork && access && (
        <div className="mt-6 border-t border-white/[0.05] pt-5">
          <ImplementationChoice access={access} onGalileo={onGalileo} onTeam={onTeam} />
        </div>
      )}

      {/* The next-layer thread — a real capability, quietly offered. */}
      {/* The deliberate deeper step: the full domain surface, one click away. */}
      {onDomainDetail && (
        <button
          type="button"
          onClick={onDomainDetail}
          className="mt-4 block text-[11.5px] text-white/38 transition-colors hover:text-white/70 vision-focus"
        >
          See everything I have on {lens.label.toLowerCase()}
        </button>
      )}

      {lens.nextLayer && (
        <button
          type="button"
          onClick={() => runCapability(lens.nextLayer.capability)}
          className="mt-5 inline-flex items-center gap-2 text-[12px] text-vision-champagne/80 transition-colors hover:text-vision-champagne vision-focus"
        >
          <Lightbulb className="h-3.5 w-3.5" />
          {lens.nextLayer.text}
        </button>
      )}
    </motion.section>
  );
}

function capitalize(text) {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}