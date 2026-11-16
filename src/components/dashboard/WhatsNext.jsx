/**
 * WhatsNext — three horizontal action cards below the KPIs.
 *
 * Phase 15.1: Enriched with Living Intelligence Executive Presence.
 * When LI items are available, they replace the static actions as
 * dynamic priorities (max 3). When no items are available, falls back
 * to the existing static navigation actions.
 *
 * Review Intelligence  — "Read today's executive briefing."
 * Build Sprint         — "Launch your next 90-Day Sprint."
 * Talk with Galileo    — "Ask questions about today's findings."
 *
 * Each: simple icon, one sentence, hover lift animation.
 * Desktop: 3 in a row. Mobile: stacked.
 */
import React from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Rocket, Sparkles, AlertCircle, TrendingUp, Target, CheckCircle2 } from 'lucide-react';
import { mapItemToDestination, translateConfidenceSource } from '@/hooks/useLivingIntelligence';

const ACTIONS = [
  {
    id: 'briefing',
    icon: BookOpen,
    title: 'Review Intelligence',
    description: "Read today's executive briefing.",
  },
  {
    id: 'sprint',
    icon: Rocket,
    title: 'Build Sprint',
    description: 'Launch your next 90-Day Sprint.',
  },
  {
    id: 'galileo',
    icon: Sparkles,
    title: 'Talk with Galileo',
    description: "Ask questions about today's findings.",
  },
];

// Map LI item certified_owner to an icon
const OWNER_ICONS = {
  business_intelligence_engine: TrendingUp,
  confidence_engine: AlertCircle,
  verification_queue: AlertCircle,
  sprint_aggregation: Target,
  calendar_sync: Target,
  cbss: TrendingUp,
  timeline: TrendingUp,
  growth_plan_engine: TrendingUp,
};

function getIconForItem(item) {
  if (!item?.certified_owner) return Sparkles;
  const key = Object.keys(OWNER_ICONS).find(k => item.certified_owner.includes(k));
  return key ? OWNER_ICONS[key] : Sparkles;
}

export default function WhatsNext({ onReviewIntelligence, onBuildSprint, onAskGalileo, intelligenceItems }) {
  const handlers = {
    briefing: onReviewIntelligence,
    sprint: onBuildSprint,
    galileo: onAskGalileo,
  };

  // ── Phase 15.1: Use Living Intelligence items when available ──────────────
  // Max 3 items (enforced by Executive Presence model). Each maps to an
  // existing Dashboard destination — no dead-end intelligence.
  const hasIntelligence = intelligenceItems && intelligenceItems.length > 0;

  const cards = hasIntelligence
    ? intelligenceItems.slice(0, 3).map((item, i) => ({
        id: `li_${i}`,
        icon: getIconForItem(item),
        title: item.headline,
        description: item.why_it_matters,
        confidenceLabel: translateConfidenceSource(item.confidence_source),
        destination: mapItemToDestination(item),
        isIntelligence: true,
      }))
    : ACTIONS;

  const handleClick = (card) => {
    if (hasIntelligence && card.destination) {
      if (card.destination.startsWith('#')) {
        // Scroll to element
        const el = document.getElementById(card.destination.slice(1));
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.location.href = card.destination;
      }
      return;
    }
    // Fall back to existing handlers
    if (handlers[card.id]) handlers[card.id]();
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <p className="text-[12px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
          {hasIntelligence ? "What Matters Now" : "What's Next"}
        </p>
        <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.05)' }} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {cards.map((a, i) => {
          const Icon = a.icon;
          return (
            <motion.button
              key={a.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.3 }}
              onClick={() => handleClick(a)}
              whileHover={{ y: -2 }}
              className="group text-left rounded-xl p-5 transition-colors duration-300 hover:border-white/10"
              style={{
                background: a.isIntelligence ? 'linear-gradient(135deg, rgba(212,168,83,0.06) 0%, #121214 60%)' : '#121214',
                border: a.isIntelligence ? '1px solid rgba(212,168,83,0.15)' : '1px solid rgba(255,255,255,0.05)',
              }}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-300 group-hover:bg-primary/10"
                  style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <Icon className="w-4 h-4 text-foreground/60 group-hover:text-primary transition-colors duration-300" />
                </div>
                <p className="text-sm font-semibold text-foreground">{a.title}</p>
                {a.confidenceLabel && (
                  <span className="ml-auto text-[10px] text-muted-foreground/50 uppercase tracking-wider">{a.confidenceLabel}</span>
                )}
              </div>
              <p className="text-[13px] text-muted-foreground leading-relaxed">{a.description}</p>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}