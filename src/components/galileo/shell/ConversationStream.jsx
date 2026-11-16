/**
 * ConversationStream — renders the living conversation.
 *
 * The center of the Galileo workspace. Each entry renders inline:
 *   - messages (chat bubbles)
 *   - questions (inline input — only the latest is interactive)
 *   - insights (contextual cards: profitability, value, opportunity, etc.)
 *   - actions (buttons)
 *   - events (document learning)
 *
 * Auto-scrolls to the bottom as Galileo speaks.
 * No page swaps. No progress dots. One continuous workspace.
 */

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import InsightCards from './InsightCards';
import GalileoPresence from '@/components/galileo/identity/GalileoPresence';
import InlineDocumentFlow from './InlineDocumentFlow';
import BusinessContextStrip from './BusinessContextStrip';
import PlausibilityDialog from './PlausibilityDialog';
import EstimateDialog from './EstimateDialog';
import ValueReveal from './ValueReveal';
import ProfitBenchmark from './ProfitBenchmark';
import CanvasObjectsBar from './CanvasObjectsBar';
import ConnectionSheet from './ConnectionSheet';

const fmt = (n) => {
  if (n == null || isNaN(n)) return null;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1000)}K`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
};

export default function ConversationStream({
  conversation, isThinking, flowState, guestSessionId,
  uploadedDocs, answers, benchmark,
  // The REAL Business Intelligence level. It is the only thing permitted to
  // change the orb's structural coherence — never a fabricated progression.
  intelligence = 0,
  canvasObjects, showCanvasObjects, onCanvasObjectClick, onSave,
  onRespond, onConnectAction, onDocumentUploaded, onStartExtraction, onCompleteLearning,
  onOpportunityAction, onChooseStrategy, onImplementationAction, onGuideChoice, onSavePrompt,
  onImproveConfidence, handleConversationAction,
}) {
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);

  // Auto-scroll to bottom when conversation grows
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [conversation.length, isThinking]);

  // Determine if discovery is complete (past the discovering phase)
  const isPastDiscovery = !['welcoming', 'intent', 'client_role', 'discovering', 'plausibility_check', 'estimating'].includes(flowState);

  // Discovery fields that collapse into the Business Context strip
  const discoveryFields = ['industry', '_industry_clarify', 'revenue', 'ebitda', 'employees', 'involvement', 'goal'];

  // Filter visible entries: hide discovery Q&A once past discovery
  const visibleEntries = isPastDiscovery
    ? conversation.filter((e) => {
        if (e.type === 'question' && discoveryFields.includes(e.field)) return false;
        // The answers themselves collapse into the Business Context summary
        // rather than stacking as breadcrumb pills down the canvas (Part 9).
        if (e.type === 'message' && e.role === 'user' && discoveryFields.includes(e.field)) return false;
        return true;
      })
    : conversation;

  // Show last N entries from the filtered list (canvas behavior)
  const MAX_VISIBLE = 6;
  const showEntries = visibleEntries.slice(-MAX_VISIBLE);

  // Find the latest interactive entry (question or action)
  const lastQuestionIdx = showEntries.map((e) => e.type).lastIndexOf('question');
  const lastActionIdx = showEntries.map((e) => e.type).lastIndexOf('action');

  // ── WHAT GALILEO IS ACTUALLY DOING ────────────────────────────────────────
  // Read from the newest entry and the REAL flow state. The presence stage is a
  // statement about the application, so it is given nothing else.
  const newest = showEntries[showEntries.length - 1];
  const presence = {
    isThinking,
    revealing: flowState === 'revealing',
    learning: flowState === 'learning',
    awaitingAnswer: newest?.type === 'question',
    hasNewInsight: newest?.type === 'insight',
    hasDecision: newest?.type === 'action',
  };

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0" data-vision-screen="galileo-conversation">
      <div className="w-full max-w-[860px] lg:max-w-[1080px] mx-auto px-4 md:px-8 pt-6 md:pt-10 pb-28">
        {/* THE GALILEO PRESENCE STAGE — mounted once, present for the whole
            conversation, and always expressing what is really happening. */}
        <GalileoPresence {...presence} intelligence={intelligence} />

        {/* Canvas Objects — persistent intelligence on the canvas */}
        {showCanvasObjects && canvasObjects?.length > 0 && (
          <CanvasObjectsBar objects={canvasObjects} onObjectClick={onCanvasObjectClick} />
        )}

        {/* Business Context Strip — collapsed discovery history */}
        {isPastDiscovery && answers && (
          <BusinessContextStrip answers={answers} />
        )}

        <div className="space-y-2">
          <AnimatePresence>
            {showEntries.map((entry, idx) => (
              <React.Fragment key={entry.id}>
                <ConversationEntry
                entry={entry}
                isLatestQuestion={idx === lastQuestionIdx && entry.type === 'question'}
                isLatestAction={idx === lastActionIdx && entry.type === 'action'}
                isActive={idx === showEntries.length - 1}
                isReceded={isPastDiscovery && idx < showEntries.length - 3}
                guestSessionId={guestSessionId}
                uploadedDocs={uploadedDocs}
                answers={answers}
                benchmark={benchmark}
                flowState={flowState}
                onRespond={onRespond}
                onConnectAction={onConnectAction}
                onDocumentUploaded={onDocumentUploaded}
                onStartExtraction={onStartExtraction}
                onCompleteLearning={onCompleteLearning}
                onOpportunityAction={onOpportunityAction}
                onChooseStrategy={onChooseStrategy}
                onImplementationAction={onImplementationAction}
                onGuideChoice={onGuideChoice}
                onSavePrompt={onSavePrompt}
                onImproveConfidence={onImproveConfidence}
                handleConversationAction={handleConversationAction}
                />
              </React.Fragment>
            ))}
          </AnimatePresence>

          <div ref={bottomRef} className="h-4" />
        </div>
      </div>
    </div>
  );
}

// ── Single conversation entry renderer ──────────────────────────────────────
function ConversationEntry({
  entry, isLatestQuestion, isLatestAction, isActive, isReceded,
  guestSessionId, uploadedDocs, answers, benchmark, flowState,
  onRespond, onConnectAction, onDocumentUploaded, onStartExtraction, onCompleteLearning,
  onOpportunityAction, onChooseStrategy, onImplementationAction, onGuideChoice, onSavePrompt,
  onImproveConfidence, handleConversationAction, onSave,
}) {
  const recededClass = isReceded ? 'opacity-40' : '';

  if (entry.type === 'message') {
    return <GalileoMessage role={entry.role} content={entry.content} isReceded={isReceded} />;
  }

  if (entry.type === 'question') {
    return (
      <div className={recededClass}>
        <QuestionEntry entry={entry} isInteractive={isLatestQuestion} onRespond={onRespond} />
      </div>
    );
  }

  if (entry.type === 'plausibility') {
    return (
      <PlausibilityDialog
        check={entry.data?.check}
        onRespond={(v) => handleConversationAction?.('plausibility', v)}
      />
    );
  }

  if (entry.type === 'estimate') {
    return (
      <EstimateDialog
        revenue={entry.data?.revenue}
        benchmark={entry.data?.benchmark}
        onComplete={(ans) => handleConversationAction?.('estimate_complete', ans)}
        onCancel={() => handleConversationAction?.('estimate_cancel')}
      />
    );
  }

  if (entry.type === 'insight') {
    // Use new ValueReveal and ProfitBenchmark for these variants
    if (entry.variant === 'value') {
      return (
        <div className={recededClass}>
          <ValueReveal
            signal={entry.data?.signal}
            updated={entry.data?.updated}
            onImproveConfidence={onImproveConfidence}
          />
        </div>
      );
    }
    if (entry.variant === 'profitability') {
      return (
        <div className={recededClass}>
          <ProfitBenchmark signal={entry.data?.signal} updated={entry.data?.updated} />
        </div>
      );
    }
    return (
      <div className={recededClass}>
        <InsightCards
          variant={entry.variant}
          data={entry.data}
          onChooseStrategy={onChooseStrategy}
          onSave={onSave}
          onSavePrompt={onSavePrompt}
        />
      </div>
    );
  }

  if (entry.type === 'action') {
    if (entry.variant === 'document_upload') {
      return (
        <InlineDocumentFlow
          guestSessionId={guestSessionId}
          uploadedDocs={uploadedDocs}
          onDocumentUploaded={onDocumentUploaded}
          onStartExtraction={onStartExtraction}
          onCompleteLearning={onCompleteLearning}
          answers={answers}
        />
      );
    }
    // Use ConnectionSheet for the connect variant — progressive, non-demanding
    if (entry.variant === 'connect' && isLatestAction) {
      return (
        <ConnectionSheet
          onConnectAction={onConnectAction}
          onDocumentUploaded={onDocumentUploaded}
          guestSessionId={guestSessionId}
        />
      );
    }
    return (
      <div className={recededClass}>
        <ActionEntry
          entry={entry}
          isInteractive={isLatestAction}
          onConnectAction={onConnectAction}
          onOpportunityAction={onOpportunityAction}
          onImplementationAction={onImplementationAction}
          onGuideChoice={onGuideChoice}
          onSavePrompt={onSavePrompt}
        />
      </div>
    );
  }

  if (entry.type === 'event') {
    return <EventEntry entry={entry} isReceded={isReceded} />;
  }

  return null;
}

// ── GalileoMessage — lightweight, no bubble for assistant, small pill for user ──
function GalileoMessage({ role, content, isReceded }) {
  const isAssistant = role === 'assistant';
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: isReceded ? 0.35 : 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex ${isAssistant ? 'justify-center' : 'justify-center'} py-1`}
    >
      {isAssistant ? (
        // Galileo: lightweight text, no bubble — typography and spacing do the work
        <p className="text-[15px] md:text-[16px] text-white/75 leading-relaxed max-w-[600px] text-center">
          {content}
        </p>
      ) : (
        // User: small understated pill
        <span className="text-sm text-white/70 bg-white/[0.04] border border-white/[0.06] rounded-full px-3.5 py-1.5">
          {content}
        </span>
      )}
    </motion.div>
  );
}

// ── Question entry — inline input ────────────────────────────────────────────
function QuestionEntry({ entry, isInteractive, onRespond }) {
  const [textValue, setTextValue] = useState('');

  if (!isInteractive) {
    // Previous questions that were answered — don't re-render input
    return null;
  }

  const submit = (value, displayValue) => {
    onRespond(entry.field, value, displayValue);
  };

  const handleTextSubmit = () => {
    const raw = textValue.trim();
    if (entry.inputType === 'number') {
      // A non-numeric entry is UNKNOWN, never 0 — `Number('')` and `Number('abc')`
      // must not become a financial fact (UNKNOWN ≠ ZERO).
      const parsed = raw === '' ? null : Number(raw);
      const n = Number.isFinite(parsed) ? parsed : null;
      submit(n, fmtDisplay(entry.field, n));
    } else {
      submit(raw || null, raw || 'Skipped');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-3"
    >
      {entry.prompt && (
        <>
          <h2 className="text-[22px] md:text-[28px] font-semibold text-white tracking-tight leading-tight text-center max-w-[720px] mx-auto">
            {entry.prompt}
          </h2>
          {entry.sub && (
            <p className="text-[13px] text-white/40 text-center leading-relaxed max-w-[480px] mx-auto">{entry.sub}</p>
          )}
        </>
      )}

      {/* Text input */}
      {entry.inputType === 'text' && (
        <div className="flex gap-2 max-w-md mx-auto">
          <Input
            autoFocus
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && textValue.trim() && handleTextSubmit()}
            placeholder={entry.placeholder}
            className="flex-1 h-12 bg-white/5 border-white/10 text-white text-base"
          />
          <Button
            onClick={handleTextSubmit}
            disabled={!textValue.trim()}
            className="h-12 px-5 bg-[#D4A853] text-black hover:bg-[#D4A853]/90"
          >
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Number input */}
      {entry.inputType === 'number' && (
        <div className="flex flex-col gap-3 items-center">
          <div className="flex gap-2 max-w-md w-full">
            {entry.prefix && (
              <span className="flex items-center px-3 rounded-lg bg-white/5 border border-white/10 text-white/50 text-sm">
                {entry.prefix}
              </span>
            )}
            <Input
              autoFocus
              type="number"
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleTextSubmit()}
              placeholder={entry.placeholder}
              className="flex-1 h-12 bg-white/5 border-white/10 text-white text-base"
            />
            <Button
              onClick={handleTextSubmit}
              className="h-12 px-5 bg-[#D4A853] text-black hover:bg-[#D4A853]/90"
            >
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
          {entry.allowSkip && (
            <button
              onClick={handleTextSubmit}
              className="text-xs text-white/40 hover:text-white/70"
            >
              I'm not sure — skip for now
            </button>
          )}
        </div>
      )}

      {/* Choice input — the COMPOSITION follows the decision, not a row template.
          A fork of two, an intent selector of eight, and a simple choice must not
          look like the same stack of outlined rectangles (§Visual direction). */}
      {entry.inputType === 'choice' && (
        <div className="w-full">
          {entry.field === 'context' ? (
            // STAGE 1 — the subject fork. Two intentional tiles with the weight of
            // a decision, side by side on anything wider than a phone.
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-[640px] mx-auto">
              {entry.options?.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => submit(opt.value, opt.label)}
                  className="group text-left px-6 py-7 rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.05] to-white/[0.01] hover:border-[#D4A853]/45 hover:from-[#D4A853]/[0.07] transition-all duration-300"
                >
                  <span className="block text-[17px] font-medium text-white tracking-tight">{opt.label}</span>
                  {opt.desc && <span className="block text-[12px] text-white/40 mt-1">{opt.desc}</span>}
                </button>
              ))}
            </div>
          ) : (
            <>
              <div
                className={`mx-auto gap-2 ${
                  entry.options?.length > 2
                    ? 'grid grid-cols-1 sm:grid-cols-2 max-w-[680px]'
                    : 'grid grid-cols-1 max-w-[440px]'
                }`}
              >
                {entry.options?.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => submit(opt.value, opt.label)}
                    className="text-left px-4 py-3 rounded-xl border border-white/[0.07] bg-white/[0.02] hover:border-[#D4A853]/40 hover:bg-[#D4A853]/[0.04] transition-all duration-200"
                  >
                    <span className="block text-[13.5px] font-medium text-white/85">{opt.label}</span>
                  </button>
                ))}
              </div>

              {/* The honest escape hatch is quieter than the intents, because it is
                  not a goal — it is a permission. */}
              {entry.tertiary && (
                <button
                  onClick={() => submit(entry.tertiary.value, entry.tertiary.label)}
                  className="block mx-auto mt-5 text-[12.5px] text-white/35 hover:text-[#D4A853]/80 transition-colors"
                >
                  Not sure?{' '}
                  <span className="underline decoration-dotted underline-offset-4">{entry.tertiary.label}</span>
                </button>
              )}
              {entry.allowSkip && (
                <button
                  onClick={() => submit(null, 'Skipped')}
                  className="block mx-auto mt-4 text-[12.5px] text-white/35 hover:text-white/60"
                >
                  Skip for now
                </button>
              )}
            </>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ── Action entry — buttons ──────────────────────────────────────────────────
function ActionEntry({ entry, isInteractive, onConnectAction, onOpportunityAction, onImplementationAction, onGuideChoice, onSavePrompt }) {
  if (!isInteractive) return null;

  const handleClick = (value) => {
    switch (entry.variant) {
      case 'connect': onConnectAction(value); break;
      case 'opportunity_actions': onOpportunityAction(value); break;
      case 'implement': onImplementationAction(value); break;
      case 'guide_choice': onGuideChoice(value); break;
      case 'save_model':
      case 'save_prompt': onSavePrompt(value); break;
      default: break;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-2 max-w-md mx-auto"
    >
      {entry.options?.map((opt) => (
        <button
          key={opt.value}
          onClick={() => handleClick(opt.value)}
          className="w-full text-left px-5 py-3.5 rounded-xl border border-white/10 bg-white/[0.02] hover:border-[#D4A853]/40 hover:bg-[#D4A853]/[0.04] transition-all"
        >
          <span className="block text-sm font-medium text-white/85">{opt.label}</span>
          {opt.desc && <span className="block text-xs text-white/40 mt-0.5">{opt.desc}</span>}
        </button>
      ))}
    </motion.div>
  );
}

// ── Event entry — document learning events ──────────────────────────────────
function EventEntry({ entry, isReceded }) {
  if (entry.variant === 'extraction_start') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: isReceded ? 0.35 : 1 }}
        className="flex items-center gap-2 justify-center py-1"
      >
        <Loader2 className="w-3.5 h-3.5 text-[#D4A853]/60 animate-spin" />
        <span className="text-xs text-white/45">Reading your financial statement…</span>
      </motion.div>
    );
  }
  if (entry.variant === 'extraction_complete') {
    return null; // Handled by the results UI in InlineDocumentFlow
  }
  return null;
}

// ── Display formatter ────────────────────────────────────────────────────────
function fmtDisplay(field, raw) {
  if (field === 'revenue' || field === 'ebitda') {
    if (raw == null || raw === '') return 'Not sure yet';
    return fmt(raw);
  }
  if (field === 'employees') return raw ? `${raw} people` : 'Skipped';
  return raw;
}