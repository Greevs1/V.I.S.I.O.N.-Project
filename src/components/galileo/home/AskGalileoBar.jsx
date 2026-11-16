/**
 * AskGalileoBar — the central intelligence control of Vision Home.
 *
 * A large glass command bar with real behaviour: submitting asks the canonical
 * intelligence service and renders an ACTIONABLE answer. Suggested prompts are
 * derived from what is actually known about the business, so every chip
 * executes something real.
 *
 * THE WHAT IF CHIP is the one chip that is always present. It is an action, not
 * a question — the canonical scenario engine does the modelling — and it shows
 * an explanatory preview on hover and on keyboard focus. On touch the chip
 * opens the surface directly, where the same explanation is the page header.
 */

import React, { useState } from 'react';
import { Send, Loader2, RotateCw, Diamond } from 'lucide-react';
import GalileoOrbMark from '@/components/galileo/identity/GalileoOrbMark';
import GalileoAnswerPanel from './GalileoAnswerPanel';
import WhatIfHoverCard from './WhatIfHoverCard';

export default function AskGalileoBar({
  suggestions = [],
  onAsk,
  onCommand,
  loading = false,
  answer = null,
  error = null,
  onDismissAnswer,
  onRetry,
  inputRef,
  // ── Actionable-answer wiring ──
  nextStep = null,
  onRunNextStep,
  onGuide,
  onTeam,
  access = null,
  onRunSecondaryStep,
  placeholder = 'Ask Galileo anything about your business...',
}) {
  const [value, setValue] = useState('');

  const submit = (e) => {
    e?.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || loading) return;
    setValue('');
    onAsk?.(trimmed);
  };

  const runSuggestion = (suggestion) => {
    if (loading) return;
    if (suggestion.prompt) {
      onAsk?.(suggestion.prompt);
      return;
    }
    // Action chips route to real handlers only — the builder never emits a
    // chip whose action has no handler in the current view.
    if (suggestion.action) onCommand?.(suggestion.action);
  };

  return (
    <div className="space-y-3">
      <form
        onSubmit={submit}
        className="mx-auto flex w-full max-w-[760px] items-center gap-2 rounded-full vision-glass-raised vision-sheen py-2 pl-4 pr-2 transition-colors focus-within:border-vision-gold/45"
      >
        {/* Galileo's identity, at input weight: the lightweight mark, never the
            full visualization (a per-frame renderer in every input would be
            exactly the cost that makes a product feel slow). */}
        <GalileoOrbMark size="micro" live={loading} />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="min-w-0 flex-1 bg-transparent text-[14px] text-white/85 outline-none placeholder:text-white/30"
        />
        <button
          type="submit"
          disabled={!value.trim() || loading}
          aria-label="Send question to Galileo"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-vision-gold text-black transition-colors hover:bg-vision-bright disabled:opacity-25 disabled:hover:bg-vision-gold vision-focus"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
        </button>
      </form>

      {suggestions.length > 0 && (
        <div className="mx-auto flex max-w-[860px] flex-wrap items-center justify-center gap-2">
          {suggestions.map((suggestion) => (
            <SuggestionChip
              key={suggestion.label}
              suggestion={suggestion}
              disabled={loading}
              onSelect={() => runSuggestion(suggestion)}
            />
          ))}
        </div>
      )}

      {/* A refined inline Galileo state — never a raw HTTP error in a premium
          surface. The technical detail goes to the console. */}
      {error && (
        <div className="mx-auto flex w-full max-w-[760px] flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
          <p className="text-[12.5px] text-white/60">{error}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-vision-champagne transition-colors hover:text-vision-bright vision-focus"
            >
              <RotateCw className="h-3 w-3" />
              Try again
            </button>
          )}
        </div>
      )}

      <GalileoAnswerPanel
        answer={answer}
        onDismiss={onDismissAnswer}
        nextStep={nextStep}
        onRunNextStep={onRunNextStep}
        onGuide={onGuide}
        onTeam={onTeam}
        access={access}
        onRunSecondaryStep={onRunSecondaryStep}
      />
    </div>
  );
}

/**
 * SuggestionChip — a plain chip, except for the What If chip, which carries its
 * own explanatory preview and the diamond that marks the possibility engine.
 */
function SuggestionChip({ suggestion, disabled, onSelect }) {
  const isWhatIf = suggestion.action === 'whatif';

  const chip = (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[11.5px] transition-all duration-200 disabled:opacity-40 vision-focus ${
        isWhatIf
          ? 'border-vision-gold/25 bg-vision-gold/[0.045] text-vision-champagne/90 hover:border-vision-gold/45 hover:bg-vision-gold/[0.08] hover:text-vision-bright'
          : 'border-white/[0.07] bg-white/[0.02] text-white/50 hover:border-vision-gold/25 hover:text-white/85'
      }`}
    >
      {isWhatIf && <Diamond className="h-3 w-3" />}
      {suggestion.label}
    </button>
  );

  if (!isWhatIf) return chip;

  return (
    <span className="group relative inline-flex">
      {chip}
      <WhatIfHoverCard />
    </span>
  );
}