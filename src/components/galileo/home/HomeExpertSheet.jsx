/**
 * HomeExpertSheet — WORK WITH OUR TEAM.
 *
 * The human-supported implementation path.
 *
 * WHAT THIS SURFACE IS HONEST ABOUT
 *  - No expert is assigned to this business, and this surface says so plainly.
 *    It does not invent an assignment, a name, an avatar, or a response time.
 *  - Nothing has been sent anywhere until the owner takes a real action. There
 *    is no "your expert has been notified" copy, because no such notification
 *    is sent from here.
 *
 * WHAT IT DOES DO
 *  - Carries the whole situation forward: the question, the answer, the
 *    scenario, what was assumed, and the recommended next step. The owner
 *    never has to explain it again (Part 29).
 *  - Offers the ONE real handoff that exists: the expert network, where the
 *    owner finds a real expert, saves them, or applies to work with one.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Users, ArrowRight, Info } from 'lucide-react';

export default function HomeExpertSheet({
  context = null,
  advisor = null,
  onBack,
  onOpenExpertNetwork,
}) {
  const rows = buildContextRows(context);
  const hasContext = rows.length > 0;
  // The REAL relationship, resolved from the existing advisory tables. When one
  // exists we name the person: offering "work with our team" to someone who
  // already has a team is how a product stops feeling like it knows you.
  const connected = !!advisor?.connected && !!advisor?.advisor?.name;
  const person = connected ? advisor.advisor : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mx-auto max-w-[640px] space-y-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-[11px] text-white/35 transition-colors hover:text-white/60 vision-focus"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Vision
        </button>
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/30">
          {connected ? 'Your team' : 'Work with our team'}
        </p>
      </div>

      {/* Relationship state — the real one, never faked */}
      {connected ? (
        <div className="space-y-2.5 rounded-2xl vision-glass-raised p-5">
          <div className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-vision-gold/70" />
            <span className="text-[10px] uppercase tracking-[0.18em] text-vision-champagne/70">
              Your team
            </span>
          </div>
          <p className="font-display text-[18px] leading-snug text-white/90">{person.name}</p>
          {person.role && (
            <p className="text-[10.5px] uppercase tracking-wider text-vision-champagne/70">
              {String(person.role).replace(/_/g, ' ')}
            </p>
          )}
          <p className="text-[12px] leading-relaxed text-white/45">
            Bring this into your existing advisory relationship. Everything below travels with you.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5 rounded-2xl vision-glass-raised p-5">
          <div className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-vision-gold/70" />
            <span className="text-[10px] uppercase tracking-[0.18em] text-vision-champagne/70">
              Expert
            </span>
          </div>
          <p className="font-display text-[17px] leading-snug text-white/90">
            No expert is assigned to this business yet.
          </p>
          <p className="text-[12px] leading-relaxed text-white/45">
            The expert network is where you find an expert, see the ones you have saved, or apply to
            work with one. When you bring someone in, everything below travels with you.
          </p>
        </div>
      )}

      {/* ── What travels with you ── */}
      {hasContext && (
        <div className="space-y-2.5 rounded-2xl border border-white/[0.06] bg-white/[0.015] p-5">
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/30">
            What we'd bring with us
          </p>
          <p className="text-[11.5px] leading-relaxed text-white/40">
            So you never have to explain the situation again.
          </p>
          <div className="space-y-3 pt-1">
            {rows.map((row) => (
              <div key={row.label} className="space-y-0.5">
                <p className="text-[10px] uppercase tracking-wider text-white/30">{row.label}</p>
                <p className="text-[12.5px] leading-relaxed text-white/70">{row.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── The real handoff ── */}
      {onOpenExpertNetwork && (
        <button
          type="button"
          onClick={onOpenExpertNetwork}
          className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-vision-gold/20 bg-vision-gold/[0.04] px-5 py-4 text-left transition-all duration-200 hover:border-vision-gold/40 hover:bg-vision-gold/[0.07] vision-focus"
        >
          <span className="min-w-0">
            <span className="block text-[13px] font-medium text-white/90">
              {connected ? 'Continue with your team' : 'Open the expert network'}
            </span>
            <span className="block text-[11.5px] leading-relaxed text-white/45">
              Find an expert, see the ones you've saved, or apply to work with one.
            </span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-vision-champagne transition-transform duration-200 group-hover:translate-x-0.5" />
        </button>
      )}

      {/* ── The honest limit ── */}
      <p className="flex items-start gap-2 text-[11px] leading-relaxed text-white/30">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        Nothing has been sent to anyone from this screen. Vision does not pretend a request was
        made — you choose who to work with inside the network.
      </p>
    </motion.div>
  );
}

/** The carried context, rendered as label/value rows. Nothing is invented. */
function buildContextRows(context) {
  if (!context) return [];
  const rows = [];

  if (context.businessName) rows.push({ label: 'Business', value: context.businessName });
  if (context.question) rows.push({ label: 'The question', value: context.question });
  if (context.answerText) rows.push({ label: "Galileo's answer", value: context.answerText });
  if (context.scenarioTitle) {
    rows.push({
      label: 'Scenario modelled',
      value: context.scenarioRead
        ? `${context.scenarioTitle} — ${context.scenarioRead}`
        : context.scenarioTitle,
    });
  }
  if (context.assumptions?.length) {
    rows.push({
      label: 'What Galileo had to assume',
      value: context.assumptions.map((a) => `${a.label}: ${a.value}`).join(' · '),
    });
  }
  if (context.nextStep) rows.push({ label: 'Recommended next step', value: context.nextStep });

  return rows;
}