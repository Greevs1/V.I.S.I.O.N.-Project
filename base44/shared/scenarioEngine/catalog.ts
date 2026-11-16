/**
 * scenarioEngine/catalog — the SUPPORTED What If levers, and honest precision.
 *
 * A lever appears here only when the governed Business Intelligence Contract
 * already holds the inputs the arithmetic needs. Levers that cannot be
 * modelled from governed data are ABSENT by design rather than approximated:
 *
 *   pay_down_debt   — the contract holds no debt balance, so the interest
 *                     saving cannot be computed. Absent.
 *   acquire_business— no target financials, no purchase price, no dilution
 *                     model. Absent.
 *
 * Every declared default carries its BASIS and is presented to the owner as an
 * assumption, never as a fact. No default is ever silently substituted for
 * governed business data.
 */

import type { ScenarioLever } from './types.ts';

/**
 * Direct-cost share of incremental revenue.
 *
 * Raising prices on an existing customer base usually retains most of the
 * increment; adding volume usually does not. This is a declared modelling
 * assumption, NOT a value read from the business, and both the lever and the
 * result surface say so.
 */
export const VARIABLE_COST_RATIO = 0.3;

export const VARIABLE_COST_BASIS =
  'Typical direct-cost share for a small owner-operated business. This is a modelling assumption, not a figure from your data.';

export const LEVERS: Record<string, ScenarioLever> = {
  raise_prices: {
    key: 'raise_prices',
    title: 'Raise prices',
    prompt: 'What if I raised my prices?',
    inputs: [
      {
        key: 'pct',
        label: 'Price increase',
        unit: '%',
        default_value: 5,
        estimate_value: 5,
        estimate_basis: 'A modest 5% increase, a common first move.',
        question: 'By what percentage would you raise prices?',
      },
    ],
    requires: ['revenue'],
  },

  add_revenue: {
    key: 'add_revenue',
    title: 'Increase revenue',
    prompt: 'What if I added revenue?',
    inputs: [
      {
        key: 'amount',
        label: 'Additional annual revenue',
        unit: '$',
        default_value: null,
        estimate_value: null,
        estimate_basis: null,
        question: 'How much additional annual revenue are you considering?',
      },
    ],
    requires: ['revenue'],
  },

  improve_margins: {
    key: 'improve_margins',
    title: 'Improve margins',
    prompt: 'What if I improved my margins?',
    inputs: [
      {
        key: 'points',
        label: 'Margin improvement',
        unit: 'points',
        default_value: 3,
        estimate_value: 3,
        estimate_basis: 'A three point margin improvement, a common efficiency target.',
        question: 'How many margin points do you want to improve?',
      },
    ],
    requires: ['revenue'],
  },

  hire_manager: {
    key: 'hire_manager',
    title: 'Hire a general manager',
    prompt: 'What if I hired a general manager?',
    inputs: [
      {
        // No default: what a manager costs is specific to this business, so
        // the engine ASKS rather than guessing. Part 16 — one question only.
        key: 'annual_cost',
        label: 'Annual management cost',
        unit: '$',
        default_value: null,
        estimate_value: 120000,
        estimate_basis:
          'A typical annual cost for an operations or general manager at a small US business. Benchmark-based, not from your data.',
        question: 'What do you expect to pay the manager annually?',
      },
      {
        key: 'hours_recovered',
        label: 'Owner hours recovered per week',
        unit: 'hrs/week',
        default_value: 20,
        estimate_value: 20,
        estimate_basis: 'A commonly cited handover of about 20 hours a week.',
        question: 'How many of your own hours a week would this hand over?',
      },
    ],
    requires: [],
  },

  hire_salesperson: {
    key: 'hire_salesperson',
    title: 'Hire a salesperson',
    prompt: 'What if I hired a salesperson?',
    inputs: [
      {
        key: 'annual_cost',
        label: 'Annual sales cost',
        unit: '$',
        default_value: null,
        estimate_value: 100000,
        estimate_basis:
          'A typical loaded annual cost for one sales hire at a small US business. Benchmark-based, not from your data.',
        question: 'What would the salesperson cost you annually?',
      },
      {
        key: 'new_revenue',
        label: 'Expected new annual revenue',
        unit: '$',
        default_value: null,
        estimate_value: null,
        estimate_basis: null,
        question: 'How much new annual revenue would you expect them to bring in?',
      },
    ],
    requires: [],
  },

  reduce_owner_involvement: {
    key: 'reduce_owner_involvement',
    title: 'Reduce owner involvement',
    prompt: 'What if I reduced my involvement in the business?',
    inputs: [
      {
        key: 'hours',
        label: 'Hours a week to hand over',
        unit: 'hrs/week',
        default_value: 10,
        estimate_value: 10,
        estimate_basis: 'A first step of about 10 hours a week.',
        question: 'How many hours a week do you want to hand over?',
      },
    ],
    requires: [],
  },
};

export function getLever(key: string): ScenarioLever | null {
  return LEVERS[key] || null;
}

export function listLevers(): ScenarioLever[] {
  return Object.values(LEVERS);
}

// ── Honest precision ─────────────────────────────────────────────────────────
// Scenario inputs are approximate, so outputs must not pretend otherwise.
// Every figure is rounded to two significant figures and never rendered as a
// six-digit exact number. Ranges are used whenever the driver is an assumption.

/** Round to two significant figures. */
export function toTwoSigFigs(n: number): number {
  if (!Number.isFinite(n) || n === 0) return 0;
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(n))) - 1);
  return Math.round(n / magnitude) * magnitude;
}

/** "~$145K" / "~$1.2M" — approximate by construction. */
export function approxMoney(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  const v = toTwoSigFigs(n);
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${sign}~$${(a / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${sign}~$${Math.round(a / 1_000)}K`;
  return `${sign}~$${Math.round(a).toLocaleString('en-US')}`;
}

/** "$140K–$160K" — the band around an assumption-driven figure. */
export function approxMoneyRange(n: number | null | undefined, band = 0.1): string | null {
  if (n == null || !Number.isFinite(n) || n === 0) return approxMoney(n);
  const lo = n * (1 - band);
  const hi = n * (1 + band);
  const fmt = (v: number) => {
    const a = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(1)}M`;
    if (a >= 1_000) return `${sign}$${Math.round(a / 1_000)}K`;
    return `${sign}$${Math.round(a).toLocaleString('en-US')}`;
  };
  return `${fmt(lo)}–${fmt(hi)}`;
}

/** "~18 hrs/week" */
export function approxHours(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  return `~${toTwoSigFigs(n)} hrs/week`;
}