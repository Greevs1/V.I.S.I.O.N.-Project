/**
 * HomeBusinessPulse — the signature business map for Vision Home.
 *
 * Six domains, exactly as before: CASH · TAX · PROFIT · OPERATIONS · VALUE ·
 * FREEDOM. Values, states, semantic meaning, confidence rules and provenance
 * all come from the existing BIS-native signal layer, unchanged. Only the
 * presentation is new.
 *
 * Clicking a tile opens the existing domain intelligence experience.
 */

import React from 'react';
import {
  Banknote,
  Receipt,
  TrendingUp,
  Activity,
  Diamond,
  Compass,
  ArrowRight,
} from 'lucide-react';
import PulseTile from './PulseTile';
import { computeHomeSignalStates } from '@/lib/galileo/homeSignals';
import { SignalState } from '@/lib/galileo/signalAwakening';

const SIGNALS = [
  { key: 'cash', label: 'Cash', icon: Banknote, accentClass: 'pulse-cash' },
  { key: 'tax', label: 'Tax', icon: Receipt, accentClass: 'pulse-tax' },
  { key: 'profit', label: 'Profit', icon: TrendingUp, accentClass: 'pulse-profit' },
  { key: 'operations', label: 'Operations', icon: Activity, accentClass: 'pulse-operations' },
  { key: 'value', label: 'Value', icon: Diamond, accentClass: 'pulse-value' },
  { key: 'freedom', label: 'Freedom', icon: Compass, accentClass: 'pulse-freedom' },
];

export default function HomeBusinessPulse({
  model,
  signalStates,
  onSignalClick,
  activeDomain,
  onViewDetails,
}) {
  const states = signalStates || computeHomeSignalStates(model?.signals, activeDomain);

  return (
    <section className="space-y-3.5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/40">
          Business Pulse
        </h2>
        {onViewDetails && (
          <button
            type="button"
            onClick={onViewDetails}
            className="inline-flex items-center gap-1 rounded-full text-[11.5px] text-white/45 transition-colors hover:text-vision-champagne vision-focus"
          >
            View details
            <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {SIGNALS.map((signal, i) => {
          const state = states[signal.key] || {
            state: SignalState.UNKNOWN,
            label: 'Learning…',
          };
          const isLearning =
            state.state === SignalState.UNKNOWN || state.state === SignalState.LEARNING;

          return (
            <PulseTile
              key={signal.key}
              index={i}
              label={signal.label}
              icon={signal.icon}
              accentClass={signal.accentClass}
              value={state.label}
              secondary={state.secondary}
              isLearning={isLearning}
              isInteresting={state.state === SignalState.INTERESTING}
              isActive={activeDomain === signal.key}
              onClick={() => onSignalClick?.(signal.key)}
            />
          );
        })}
      </div>
    </section>
  );
}