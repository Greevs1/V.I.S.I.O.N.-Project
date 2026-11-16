/**
 * GalileoAnswerPanel — the actionable answer surface.
 *
 * Renders ONLY what the askGalileo contract actually returned, arranged so a
 * substantive answer becomes a decision:
 *
 *   GALILEO
 *   [answer]
 *   [intelligence labels — verified / projected / hypothesis / advisor-confirmed]
 *   [supporting sources]
 *
 *   NEXT STEP
 *   [the backend's own recommended next step]
 *   [Primary CTA →]
 *
 *   HOW DO YOU WANT TO MOVE FORWARD?
 *   [ With Galileo ]  [ With your team ]
 *
 * The two implementation paths are rendered ONLY when the answer resolved to a
 * real next step, and they are the SAME entitlement-aware component used
 * everywhere else in Vision: what they say depends on what the owner already
 * has. A trivial informational answer gets none of them, because offering a path
 * forward with nothing to walk toward is theatre.
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, ArrowRight, Sparkles, ChevronDown, Quote } from 'lucide-react';
import ImplementationChoice from './ImplementationChoice';
import GalileoAssignmentAnswer from '@/components/galileo/assignment/GalileoAssignmentAnswer';
import FactualEvidenceBlock from './FactualEvidenceBlock';
import { factualAnswerView } from '@/lib/galileo/factualAnswerView';

const CONFIDENCE_STYLE = {
  high: 'text-emerald-300/80 border-emerald-400/25',
  medium: 'text-vision-champagne border-vision-gold/25',
  low: 'text-white/45 border-white/12',
};

// The four intelligence labels the backend distinguishes. Rendered exactly as
// supplied — a label is never added that the contract did not return.
const LABEL_META = [
  { key: 'verified', text: 'Verified', className: 'border-emerald-400/25 text-emerald-300/75' },
  { key: 'projected', text: 'Projected', className: 'border-vision-gold/25 text-vision-champagne/80' },
  { key: 'hypothesis', text: 'Hypothesis', className: 'border-white/12 text-white/50' },
  { key: 'advisorConfirmed', text: 'Advisor confirmed', className: 'border-sky-400/25 text-sky-300/75' },
];

// The SERVER-derived evidence state of the answer (§13/§14) — what the answer was
// actually built from. It exists so an answer that used no evidence can never
// read as Verified, and so a document-grounded answer is labelled as document
// evidence rather than promoted to a canonical fact state it has not earned.
// Display-only: it is NOT another canonical fact-state system.
const EVIDENCE_STATE_META = {
  verified: { text: 'Verified', className: 'border-emerald-400/25 text-emerald-300/75' },
  confirmed: { text: 'Confirmed', className: 'border-sky-400/25 text-sky-300/75' },
  document_evidence: { text: 'Document evidence', className: 'border-vision-gold/25 text-vision-champagne/80' },
  unavailable: { text: 'No supporting data', className: 'border-white/12 text-white/40' },
};

// §9 — the display state UNREVIEWED document evidence carries. It is deliberately
// NOT a fifth canonical fact state and NOT a promotion: it is the honest label for
// a figure that came out of a document and has not been reviewed. A value here is
// never rendered Verified, Confirmed, or "high confidence".
const PROVISIONAL_EVIDENCE_TEXT = 'Unverified document data';
const PROVISIONAL_REVIEW_TEXT = 'Pending review';

/** Money formatting for a value the server already gave us as a number. */
function formatEvidenceValue(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value ?? '');
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function GalileoAnswerPanel({
  answer,
  onDismiss,
  nextStep = null,
  onRunNextStep,
  onGuide,
  onTeam,
  access = null,
  onRunSecondaryStep,
}) {
  const [showSources, setShowSources] = useState(false);
  if (!answer) return null;

  // 6D.0c.2 — a FACTUAL answer is rendered from its contract alone: its labels,
  // sources, missing list and next step. The model's own labels, confidence and
  // sources do not compete with it.
  const factual = factualAnswerView(answer);
  const confidence = !factual.active && answer.confidence ? CONFIDENCE_STYLE[answer.confidence] : null;
  const labels = answer.labels || {};
  const activeLabels = factual.active ? [] : LABEL_META.filter((meta) => (labels[meta.key] || []).length > 0);
  const hasSources = !factual.active && (answer.sources || []).length > 0;

  const evidenceMeta = !factual.active && answer.evidenceState ? EVIDENCE_STATE_META[answer.evidenceState] : null;
  const missingItems = factual.active ? factual.missing : (answer.missingData || []);
  // The provisional lane's server-derived payload (§3/§9/§10/§12/§14). Rendered as
  // given — no number on this surface is computed here.
  const provisional = factual.active ? null : answer.provisionalEvidence || null;
  const notice = answer.extractionNotice || null;
  const hasPaths = !!access;
  const hasNextStep = nextStep && nextStep.kind !== 'none' && (nextStep.text || nextStep.label);

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mx-auto w-full max-w-[760px] space-y-4 rounded-2xl vision-glass-raised p-4 md:p-5"
    >
      {/* ── The answer ── */}
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-vision-gold" />
        <div className="min-w-0 flex-1 space-y-2.5">
          <p className="text-[11px] text-white/35">You asked: {answer.question}</p>
          <p className="whitespace-pre-wrap font-display text-[15px] leading-relaxed text-white/85">
            {answer.text}
          </p>

          {/* A document-assignment answer answers with records, not prose: the
              document, the people, the responsibility level, and the confirmation
              step for any change. Rendered from the contract's own payload. */}
          {answer.assignment && <GalileoAssignmentAnswer assignment={answer.assignment} />}

          {/* §9/§10 — UNREVIEWED DOCUMENT EVIDENCE. The figure IS an answer, and its
              state is stated in the same breath: unverified, pending review, from a
              named document. It is never shown as Verified, Confirmed or
              high-confidence, and the "no supporting data" state cannot apply while
              this block is present, because this IS support. */}
          {provisional?.used && (
            <div className="space-y-1.5 rounded-xl border border-vision-gold/25 bg-vision-gold/[0.05] px-3 py-2.5">
              <p className="text-[9.5px] uppercase tracking-wider text-vision-champagne/85">
                {PROVISIONAL_EVIDENCE_TEXT} · {PROVISIONAL_REVIEW_TEXT}
              </p>
              {(provisional.metrics || []).map((m) => (
                <p key={`${m.canonical_key}-${m.source_document_id || ''}`} className="text-[12px] leading-relaxed text-white/70">
                  {m.display_name}: {formatEvidenceValue(m.value)}
                  {m.period ? ` · ${m.period}` : ''} — from{' '}
                  {String(m.source_document_type || 'an uploaded document').replace(/_/g, ' ')}
                  {/* Extraction confidence is shown SEPARATELY and labelled as such —
                      it is not evidence verification (§9). */}
                  {typeof m.confidence === 'number' ? ` · extraction confidence ${m.confidence}%` : ''}
                </p>
              ))}
              {(provisional.conflict?.candidates || []).map((c) => (
                <p key={c.canonical_key} className="text-[12px] leading-relaxed text-white/60">
                  {(c.candidates || []).length} unreviewed figures for{' '}
                  {String(c.canonical_key).replace(/_/g, ' ')} disagree — none is being treated as your confirmed figure.
                </p>
              ))}
              {provisional.review_action?.url && (
                <a
                  href={provisional.review_action.url}
                  className="inline-flex items-center gap-1.5 pt-0.5 text-[11.5px] font-medium text-vision-champagne transition-colors hover:text-vision-bright vision-focus"
                >
                  {provisional.review_action.label}
                  <ArrowRight className="h-3 w-3" />
                </a>
              )}
            </div>
          )}

          <FactualEvidenceBlock view={factual} />

          {/* ── What kind of intelligence this is ── */}
          {activeLabels.length > 0 && (
            <div className="space-y-1.5 pt-0.5">
              <div className="flex flex-wrap gap-1.5">
                {activeLabels.map((meta) => (
                  <span
                    key={meta.key}
                    className={`rounded-full border px-2 py-0.5 text-[9.5px] uppercase tracking-wider ${meta.className}`}
                  >
                    {meta.text}
                  </span>
                ))}
              </div>
              {showSources && (
                <div className="space-y-1.5 pt-1">
                  {activeLabels.map((meta) => (
                    <div key={meta.key} className="space-y-0.5">
                      <p className="text-[10px] uppercase tracking-wider text-white/30">
                        {meta.text}
                      </p>
                      {labels[meta.key].map((line) => (
                        <p key={line} className="text-[11.5px] leading-relaxed text-white/50">
                          {line}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Where it came from ── */}
          {hasSources && (
            <div className="pt-0.5">
              <button
                type="button"
                onClick={() => setShowSources((v) => !v)}
                className="inline-flex items-center gap-1.5 text-[11px] text-white/40 transition-colors hover:text-white/70 vision-focus"
              >
                <Quote className="h-3 w-3" />
                {showSources ? 'Hide' : 'Where this came from'}
                <ChevronDown
                  className={`h-3 w-3 transition-transform duration-200 ${
                    showSources ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {showSources && (
                <div className="space-y-0.5 pt-1.5">
                  {answer.sources.map((source) => (
                    <p key={source} className="text-[11px] leading-relaxed text-white/40">
                      {source}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss answer"
          className="shrink-0 rounded-full p-1 text-white/30 transition-colors hover:text-white/70 vision-focus"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Next step ── */}
      {hasNextStep && (
        <div className="space-y-2 border-t border-white/[0.07] pt-3.5">
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/30">Next step</p>
          {nextStep.text && (
            <p className="font-display text-[15px] leading-relaxed text-white/85">
              {nextStep.text}
            </p>
          )}
          {nextStep.reason && (
            <p className="text-[11px] leading-relaxed text-white/35">{nextStep.reason}</p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {nextStep.label && onRunNextStep && (
              <button
                type="button"
                onClick={onRunNextStep}
                className="inline-flex items-center gap-1.5 rounded-full bg-vision-gold px-4 py-2 text-[12px] font-medium text-black transition-colors hover:bg-vision-bright vision-focus"
              >
                {nextStep.label}
                <ArrowRight className="h-3 w-3" />
              </button>
            )}
            {nextStep.url && (
              <a
                href={nextStep.url}
                className="inline-flex items-center gap-1.5 rounded-full bg-vision-gold px-4 py-2 text-[12px] font-medium text-black transition-colors hover:bg-vision-bright vision-focus"
              >
                {nextStep.urlLabel || 'Open'}
                <ArrowRight className="h-3 w-3" />
              </a>
            )}
            {nextStep.secondary?.label && onRunSecondaryStep && (
              <button
                type="button"
                onClick={onRunSecondaryStep}
                className="text-[11.5px] font-medium text-white/50 transition-colors hover:text-white/85 vision-focus"
              >
                {nextStep.secondary.label}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── The two doors — the SAME entitlement-aware component used
             everywhere else in Vision. Kept tied to a real next step, so an
             implementation choice is never offered with nothing to implement. ── */}
      {hasPaths && hasNextStep && !factual.active && (
        <div className="border-t border-white/[0.07] pt-3.5">
          <ImplementationChoice access={access} onGalileo={onGuide} onTeam={onTeam} hideLocked />
        </div>
      )}

      {/* ── Confidence + what's missing ── */}
      <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.07] pt-3">
        {confidence && (
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${confidence}`}
          >
            {answer.confidence} confidence
          </span>
        )}
        {evidenceMeta && (
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${evidenceMeta.className}`}
          >
            {evidenceMeta.text}
          </span>
        )}
        {answer.isGated && (
          <span className="rounded-full border border-white/[0.09] px-2 py-0.5 text-[10px] text-white/40">
            Summary view
          </span>
        )}
        {/* §10 — the other half of the pair: "Document evidence" alone could be
            mistaken for reviewed evidence, so the unreviewed state is stated too. */}
        {provisional?.used && (
          <span className="rounded-full border border-vision-gold/25 px-2 py-0.5 text-[10px] uppercase tracking-wider text-vision-champagne/80">
            {PROVISIONAL_REVIEW_TEXT}
          </span>
        )}
        {missingItems.map((item) => (
          <span
            key={item}
            className="rounded-full border border-white/[0.09] px-2 py-0.5 text-[10px] text-white/40"
          >
            Missing: {item}
          </span>
        ))}
      </div>

      {/* §12 — the PROACTIVE extraction notice. It appears only while something is
          genuinely waiting for review, and every number in it was derived from
          persisted rows on the server. The CTA carries the exact document id. */}
      {notice && (
        <div className="space-y-1.5 border-t border-white/[0.07] pt-3.5">
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/30">From your documents</p>
          <p className="font-display text-[14px] leading-relaxed text-white/85">{notice.title}</p>
          <p className="text-[11.5px] leading-relaxed text-white/45">{notice.body}</p>
          {notice.review_action?.url && (
            <a
              href={notice.review_action.url}
              className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-vision-champagne transition-colors hover:text-vision-bright vision-focus"
            >
              {notice.review_action.label}
              <ArrowRight className="h-3 w-3" />
            </a>
          )}
        </div>
      )}
    </motion.div>
  );
}