/**
 * scenarioEngine/recovery — recovering a MISSING INPUT for a SUPPORTED model.
 *
 * BOUNDED BY DESIGN. This adds no models. It lets a lever that Vision can
 * already compute run when a governed input it needs is simply not on file
 * yet, instead of ending the experience at a flat refusal.
 *
 * TWO WAYS A MISSING INPUT COMES BACK
 *   1. The owner answers inline. That value is OWNER REPORTED and UNVERIFIED.
 *      It stays with the scenario and is never written to business data.
 *   2. An existing Vision capability supplies it (financial statements read
 *      through the Data Room). That value arrives through the certified
 *      Business Intelligence Contract and keeps its existing verification
 *      semantics untouched.
 *
 * PRECEDENCE — the rule that keeps this safe
 * A governed value ALWAYS beats an owner-reported one. An owner input may only
 * fill an ABSENCE; it can never displace a figure the business already holds.
 * That is precisely why a figure somebody typed for a scenario cannot quietly
 * become a verified business fact: as soon as real data exists, the real data
 * wins and the typed value is dropped.
 *
 * A baseline field NOT listed here is not recoverable, and a scenario needing
 * it still declines honestly rather than being approximated.
 */

import type { ScenarioBaseline } from './types.ts';
import { approxMoney } from './catalog.ts';

/** How a value is labelled where the owner can see it. Never softened. */
export const OWNER_REPORTED_LABEL = 'OWNER REPORTED / UNVERIFIED';

export const OWNER_REPORTED_NOTE =
  'You enter this for this scenario. It is not verified, it is not saved to your business records, and it stays with this scenario only.';

/** An existing Vision capability that can supply a governed figure instead. */
export interface RecoverySource {
  /** Button copy. */
  label: string;
  /** One line explaining what Vision does with it. */
  detail: string;
  /** Vision workspace the caller opens, e.g. 'data_room'. */
  path: string;
}

/** A governed baseline field the owner can legitimately help Vision with. */
export interface RecoverableBaselineSpec {
  field: string;
  label: string;
  unit: string | null;
  /** Plain statement of what Vision does not have. */
  missing_statement: string;
  /** The single question asked, when the owner supplies it inline. */
  question: string;
  /**
   * Offered ONLY when a defensible estimate genuinely exists. Left null when
   * a generic figure presented as this owner's would be a fabrication.
   */
  estimate_value: number | null;
  estimate_basis: string | null;
  /** The existing Vision capability that can supply it, if one exists. */
  source: RecoverySource | null;
}

export const RECOVERABLE_BASELINE: Record<string, RecoverableBaselineSpec> = {
  revenue: {
    field: 'revenue',
    label: 'Annual revenue',
    unit: '$',
    missing_statement: "I don't have reliable annual revenue for this business yet.",
    question: "What's your approximate annual revenue?",
    // No estimate is offered. Revenue is specific to a business, so a generic
    // figure dressed up as this owner's revenue would be a fabricated answer.
    estimate_value: null,
    estimate_basis: null,
    source: {
      label: 'Upload financials',
      detail:
        'Vision reads revenue from your financial statements, and the figure keeps its verified status.',
      path: 'data-room',
    },
  },
};

export function getRecoverableBaseline(field: string): RecoverableBaselineSpec | null {
  return RECOVERABLE_BASELINE[field] || null;
}

/** A value the owner entered for this scenario, carried for disclosure only. */
export interface OwnerReportedValue {
  field: string;
  label: string;
  value: number;
  formatted: string;
}

export interface BaselineInputResult {
  /** The baseline the model may actually use. */
  baseline: ScenarioBaseline;
  /** Owner-entered values that filled an absence. Disclosed, never verified. */
  reported: OwnerReportedValue[];
  /**
   * Fields where an owner value was supplied but governed data already exists,
   * so the governed value was used. Surfaced so the owner is told which figure
   * actually drove the model.
   */
  superseded: string[];
}

function numOrNull(v: any): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * Apply owner-supplied baseline values to the governed baseline.
 *
 * Governed data always wins. A field that is not in RECOVERABLE_BASELINE is
 * ignored outright, so a caller cannot inject an arbitrary baseline figure by
 * naming it in the request.
 */
export function applyBaselineInputs(
  governed: ScenarioBaseline,
  baselineInputs: Record<string, any> | null | undefined,
): BaselineInputResult {
  const baseline: ScenarioBaseline = { ...governed };
  const reported: OwnerReportedValue[] = [];
  const superseded: string[] = [];

  for (const [field, raw] of Object.entries(baselineInputs || {})) {
    const spec = RECOVERABLE_BASELINE[field];
    if (!spec) continue;

    const supplied = numOrNull(raw);
    if (supplied == null) continue;

    // Governed data wins: an owner value fills an absence, never a fact.
    if ((governed as any)[field] != null) {
      superseded.push(field);
      continue;
    }

    (baseline as any)[field] = supplied;
    reported.push({
      field,
      label: spec.label,
      value: supplied,
      formatted: approxMoney(supplied) || '—',
    });
  }

  return { baseline, reported, superseded };
}

/** The disclosure block returned with a needs_input result for a baseline field. */
export function buildRecoveryRequest(field: string) {
  const spec = RECOVERABLE_BASELINE[field];
  if (!spec) return null;
  return {
    is_baseline_field: true as const,
    field: spec.field,
    reason: spec.missing_statement,
    classification_label: OWNER_REPORTED_LABEL,
    classification_note: OWNER_REPORTED_NOTE,
    source: spec.source,
  };
}