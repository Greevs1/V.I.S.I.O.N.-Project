/**
 * ExpertAskGalileo — "Ask Galileo about this task".
 *
 * It is NOT a second assistant: same `useAskGalileo` hook, same `askGalileo`
 * backend function, same canonical intelligence and the same entitlement rules
 * (the backend decides, and a gated answer renders as the backend returned it).
 * The only difference is the context carried, so Galileo already understands the
 * task and the recommended expertise.
 *
 * Available to entitled and non-entitled owners (Part 20).
 */

import React, { useState } from 'react';
import { Sparkles, Send, Loader2, RotateCw } from 'lucide-react';
import { useAskGalileo } from '@/hooks/useAskGalileo';

const QUESTIONS = [
  'Why do I need this expertise?',
  'Could I do this myself?',
  'What should I prepare?',
  'What would an expert actually do here?',
  'What does success look like?',
];

export default function ExpertAskGalileo({ contextText, roleLabel }) {
  const { ask, answer, error, loading, retry } = useAskGalileo({
    workspaceKey: 'sprint-expert-task',
    route: '/galileo?workspace=sprint',
  });
  const [asked, setAsked] = useState(null);
  const [value, setValue] = useState('');

  const askAbout = (question) => {
    setAsked(question);
    ask(`${contextText} ${question}`);
  };

  const submit = (e) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || loading) return;
    setValue('');
    askAbout(trimmed);
  };

  return (
    <section className="rounded-2xl vision-glass px-5 py-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
        Ask Galileo about this task
      </h3>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            disabled={loading}
            onClick={() => askAbout(q)}
            className="rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-[11.5px] text-white/55 transition-colors hover:border-vision-gold/30 hover:text-white/85 disabled:opacity-40 vision-focus"
          >
            {q}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-3 flex items-center gap-2 rounded-full border border-white/[0.09] bg-white/[0.02] py-1.5 pl-4 pr-1.5">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-vision-gold/75" aria-hidden="true" />
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={roleLabel ? `Ask about this ${roleLabel} work...` : 'Ask about this task...'}
          aria-label="Ask Galileo about this Sprint task"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-white/85 outline-none placeholder:text-white/30"
        />
        <button
          type="submit"
          disabled={!value.trim() || loading}
          aria-label="Send question to Galileo"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-vision-gold text-black transition-colors hover:bg-vision-bright disabled:opacity-25 vision-focus"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
        </button>
      </form>

      {error && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
          <p className="text-[12.5px] text-white/60">{error}</p>
          <button
            type="button"
            onClick={retry}
            className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-vision-champagne transition-colors hover:text-vision-bright vision-focus"
          >
            <RotateCw className="h-3 w-3" aria-hidden="true" />
            Try again
          </button>
        </div>
      )}

      {answer?.text && (
        <div className="mt-3 space-y-2 rounded-xl border border-vision-gold/15 bg-vision-gold/[0.03] px-4 py-3.5">
          {asked && <p className="text-[11px] text-white/35">{asked}</p>}
          <p className="text-[13px] leading-relaxed text-white/75">{answer.text}</p>
          {answer.nextStep && (
            <p className="text-[12px] text-white/45">
              Next: <span className="text-vision-champagne/85">{answer.nextStep}</span>
            </p>
          )}
        </div>
      )}
    </section>
  );
}