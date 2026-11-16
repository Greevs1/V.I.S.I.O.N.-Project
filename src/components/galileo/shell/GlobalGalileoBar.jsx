/**
 * GlobalGalileoBar — THE persistent Ask Galileo surface of the Vision shell.
 *
 * Galileo is not a page; it is the intelligence layer of Vision. This bar sits
 * at the bottom of the viewport on every owner-facing Vision surface — Home,
 * each of its in-place surfaces (What If, Playbook, Opportunity, Connections,
 * Saved, Expert), every workspace (Data Room, Sprint, Valuation, Dashboard,
 * Assessments, Expert Network, Settings) and the document viewer — so the owner
 * can ask without leaving what they are doing.
 *
 * NOT A SECOND ASSISTANT. It is the same `useAskGalileo` → the same `askGalileo`
 * function → the same canonical intelligence → the same answer components, and
 * the assignment half is the SAME `GalileoAssignmentAnswer` the Data Room and
 * the workspace surfaces already use. Nothing is reimplemented here.
 *
 * NO FORCED NAVIGATION (§10). The answer appears above the bar, in place, and
 * the workspace stays exactly as it was. "Continue with Galileo" is the one
 * explicit action that opens the full conversation, through the EXISTING
 * Explain-with-Galileo bridge (see @/lib/galileo/explainGalileo).
 *
 * CONTEXT (§6, §8, §9). The caller names the SURFACE the owner is standing in
 * (a workspace id, or a Home surface such as `whatif`). The exact object is read
 * from the URL — the only thing that authoritatively knows which document is
 * open — and is validated against the active business by `askGalileo`. If the UI
 * does not know an id, no id is sent: nothing is inferred from the question.
 * When the surface or the focused object changes, the previous answer is
 * discarded, so Document B never shows Document A's answer.
 *
 * LAYER. `.layer-assistant` (see the layering contract in index.css): above the
 * workspaces and the document viewer, below the notification arrival and any
 * explicit confirmation. It is portaled to <body> so no ancestor transform or
 * overflow can trap it. The host reserves `--vision-assistant-space` at the
 * bottom of its scroll region, so the bar never covers content (§4).
 */

import React, { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { Sparkles, Send, Loader2, X, RotateCw, Maximize2 } from 'lucide-react';
import { useAskGalileo } from '@/hooks/useAskGalileo';
import GalileoAssignmentAnswer from '@/components/galileo/assignment/GalileoAssignmentAnswer';
import { explainWithGalileo } from '@/lib/galileo/explainGalileo';

export default function GlobalGalileoBar({ surfaceKey = 'vision_home', contextLabel = 'your business' }) {
  const location = useLocation();
  const [value, setValue] = useState('');

  // The document the owner is standing in. Every document link — including the
  // assignment notification's own deep link — carries it as
  // ?workspace=data-room&id=<document_id>, so that id IS authoritative context.
  // It stays a request, not a grant: askGalileo only honours it if the document
  // really belongs to the active business.
  const focus = useMemo(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('workspace') !== 'data-room') return null;
    const id = params.get('id');
    return id ? { type: 'document', id } : null;
  }, [location.search]);

  const { ask, answer, error, loading, dismiss, retry } = useAskGalileo({
    workspaceKey: surfaceKey,
    route: location.pathname,
    focus,
  });

  const submit = (e) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || loading) return;
    setValue('');
    ask(trimmed);
  };

  /**
   * Expand into the full Galileo conversation. Deliberately NOT automatic: the
   * owner asks here, reads here, and continues working here unless they choose
   * to open the conversation. The question travels with it.
   */
  const continueWithGalileo = useCallback(() => {
    if (!answer?.question) return;
    // The question travels with it, and this surface's own answer steps aside so
    // the conversation visibly moves up to the full panel rather than appearing
    // in two places at once.
    dismiss();
    explainWithGalileo({ question: answer.question, surface: surfaceKey });
  }, [answer, surfaceKey, dismiss]);

  const hasAnswer = !!answer?.text;
  const panelOpen = hasAnswer || !!error;

  return createPortal(
    <div
      className="layer-assistant fixed inset-x-0 bottom-0 px-3 md:px-8"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto w-full max-w-[860px] space-y-2 pb-2.5">
        {/* ── The answer, in place (§11) ───────────────────────────────────── */}
        {panelOpen && (
          <div className="vision-sheen rounded-2xl border border-vision-gold/20 bg-[rgba(10,10,14,0.96)] px-4 py-3.5 backdrop-blur-xl">
            <div className="flex items-start justify-between gap-3">
              {answer?.question ? (
                <p className="min-w-0 text-[11px] text-white/35">{answer.question}</p>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={dismiss}
                aria-label="Dismiss Galileo's answer"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white/35 transition-colors hover:text-white/70 vision-focus"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Capped so a long answer never takes the surface over (§5). */}
            <div className="mt-1.5 max-h-[34vh] space-y-2 overflow-y-auto pr-1">
              {hasAnswer && (
                <p className="text-[13px] leading-relaxed text-white/80">{answer.text}</p>
              )}
              {answer?.nextStep && (
                <p className="text-[12px] text-white/45">
                  Next: <span className="text-vision-champagne/85">{answer.nextStep}</span>
                </p>
              )}
              {/* Assignment answers render their real records and their confirm
                  step — the same component every other surface uses. */}
              {answer?.assignment && <GalileoAssignmentAnswer assignment={answer.assignment} />}

              {error && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <p className="text-[12.5px] text-white/60">{error}</p>
                  {retry && (
                    <button
                      type="button"
                      onClick={retry}
                      className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-vision-champagne transition-colors hover:text-vision-bright vision-focus"
                    >
                      <RotateCw className="h-3 w-3" />
                      Try again
                    </button>
                  )}
                </div>
              )}
            </div>

            {hasAnswer && (
              <div className="mt-2.5">
                <button
                  type="button"
                  onClick={continueWithGalileo}
                  className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-vision-champagne transition-colors hover:text-vision-bright vision-focus"
                >
                  <Maximize2 className="h-3 w-3" />
                  Continue with Galileo
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── The persistent input ─────────────────────────────────────────── */}
        <form
          onSubmit={submit}
          className="flex items-center gap-2 rounded-full border border-white/[0.09] bg-[rgba(12,12,17,0.93)] py-1.5 pl-4 pr-1.5 backdrop-blur-xl transition-colors focus-within:border-vision-gold/40"
        >
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-vision-gold/75" />
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={`Ask Galileo about ${contextLabel}...`}
            aria-label={`Ask Galileo about ${contextLabel}`}
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
      </div>
    </div>,
    document.body
  );
}