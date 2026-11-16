/**
 * WhatIfNextActions — what a computed scenario leads to.
 *
 * A scenario used to end at its numbers, with one button labelled "Take this
 * into your Playbook" that only opened the Playbook and saved nothing. Every
 * action here does what it says:
 *
 *   See the implementation plan → the implementation preview (real Sprint generator)
 *   Adjust assumptions          → re-runs THIS scenario with changed inputs
 *   Ask Galileo about this      → canonical Galileo, with the scenario carried in
 *   Save to Playbook            → saved_playbooks, marked hypothetical
 *
 * A saved scenario is never a business fact: it is stored as a saved strategy,
 * flagged `hypothetical`, and the Digital Twin's governed figures never read it.
 */

import React, { useState } from 'react';
import { ArrowRight, Check, Loader2, SlidersHorizontal, Sparkles, Bookmark } from 'lucide-react';
import WhatIfAdjust from './WhatIfAdjust';

export default function WhatIfNextActions({
  scenario,
  asks = [],
  collectedInputs = {},
  onSeePlan,
  onAdjust,
  onAskGalileo,
  onSave,
}) {
  const [adjusting, setAdjusting] = useState(false);
  const [saveState, setSaveState] = useState('idle');

  const save = async () => {
    if (!onSave || saveState === 'saving' || saveState === 'saved') return;
    setSaveState('saving');
    const ok = await onSave();
    setSaveState(ok ? 'saved' : 'error');
  };

  const ghost =
    'inline-flex items-center gap-1.5 rounded-full border border-white/[0.09] px-4 py-2 text-[12px] text-white/60 transition-colors hover:border-vision-gold/30 hover:text-white/85 disabled:opacity-50 vision-focus';

  return (
    <div className="space-y-4 rounded-2xl border border-white/[0.06] bg-white/[0.015] p-5">
      <p className="text-[10px] uppercase tracking-[0.18em] text-white/30">What I would do next</p>
      <p className="font-display text-[15px] leading-relaxed text-white/85">
        See what putting this into practice would involve, then decide whether it is worth doing.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSeePlan}
          className="inline-flex items-center gap-1.5 rounded-full bg-vision-gold px-4 py-2 text-[12px] font-medium text-black transition-colors hover:bg-vision-bright vision-focus"
        >
          See the implementation plan
          <ArrowRight className="h-3 w-3" />
        </button>
        {asks.length > 0 && (
          <button type="button" onClick={() => setAdjusting((v) => !v)} className={ghost}>
            <SlidersHorizontal className="h-3 w-3" />
            Adjust assumptions
          </button>
        )}
        <button type="button" onClick={onAskGalileo} className={ghost}>
          <Sparkles className="h-3 w-3" />
          Ask Galileo about this
        </button>
        {onSave && (
          <button type="button" onClick={save} disabled={saveState === 'saving' || saveState === 'saved'} className={ghost}>
            {saveState === 'saving' ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : saveState === 'saved' ? (
              <Check className="h-3 w-3" />
            ) : (
              <Bookmark className="h-3 w-3" />
            )}
            {saveState === 'saved' ? 'Saved to Playbook' : 'Save to Playbook'}
          </button>
        )}
      </div>

      {saveState === 'error' && (
        <p className="text-[11.5px] text-white/50">That didn't save. Try again in a moment.</p>
      )}

      {adjusting && (
        <WhatIfAdjust
          scenario={scenario}
          asks={asks}
          collectedInputs={collectedInputs}
          onSubmit={(inputs) => {
            setAdjusting(false);
            setSaveState('idle');
            onAdjust(inputs);
          }}
        />
      )}
    </div>
  );
}