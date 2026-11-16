/**
 * digitalTwin/qualities.ts — Phase 6D.1A — GATES 4 and 5.
 *
 * PERIOD QUALITY and ACCOUNTING BASIS: the two properties that decide whether a
 * number MEANS what a fact would claim it means.
 *
 * ── PERIOD QUALITY ───────────────────────────────────────────────────────────
 *
 *   EXACT                  the document stated the period and it parsed
 *   BOUNDED                real bounds are recorded, without a stated source
 *   AGGREGATE_MULTI_PERIOD the figure covers SEVERAL years — it is not a
 *                          single-period amount at all
 *   AMBIGUOUS              a period was stated and could not be determined
 *   UNKNOWN                no period at all
 *
 * THE PRODUCTION CASE THIS EXISTS FOR. One reviewed revenue observation carries
 * the raw period text "All Dates (2021-2025)" — a five-year aggregate exported by
 * an accounting system. That is NOT FY2025 revenue, and it is not FY2021–2025
 * revenue either: it is the sum of five years. Presenting it as a single-period
 * fact would be a fabrication, so a multi-period aggregate is classified FIRST,
 * before any single-year interpretation is attempted.
 *
 * ── ACCOUNTING BASIS ─────────────────────────────────────────────────────────
 *
 *   cash · accrual · tax · unknown · not_applicable
 *
 * Basis is NEVER inferred from the document type. A generic Profit & Loss does NOT
 * automatically mean accrual — the same P&L shape is produced on a cash basis by
 * most small businesses. Basis is taken only from a DEFENSIBLE RECORD: a declared
 * basis on the observation (`metadata.accounting_basis`), a connected accounting
 * configuration, or an authorized human statement. Absent one, the honest answer
 * is `unknown`.
 *
 * UNKNOWN IS A LEGITIMATE VALUE. It is simply not a promotable one for a measure
 * whose meaning depends on it. A measure whose definition does not depend on basis
 * — a point-in-time balance-sheet item — is `not_applicable`, so basis is never
 * forced onto facts that do not have the question.
 *
 * PURE MODULE — no I/O. It reads `observationPeriod` from the semantic bridge so
 * there is exactly ONE period derivation in the platform.
 */

import { observationPeriod } from '../documentObservation/semantics.ts';

export const QUALITIES_VERSION = '6d.1a.1';

export const PERIOD_QUALITY = {
  EXACT: 'EXACT',
  BOUNDED: 'BOUNDED',
  AGGREGATE_MULTI_PERIOD: 'AGGREGATE_MULTI_PERIOD',
  AMBIGUOUS: 'AMBIGUOUS',
  UNKNOWN: 'UNKNOWN',
} as const;

export const ACCOUNTING_BASIS = {
  CASH: 'cash',
  ACCRUAL: 'accrual',
  TAX: 'tax',
  UNKNOWN: 'unknown',
  NOT_APPLICABLE: 'not_applicable',
} as const;

/**
 * A RANGE OF YEARS IS AN AGGREGATE, NOT A PERIOD. These patterns are deliberately
 * specific: they must not match a single fiscal year, and they must not match a
 * legitimate bound pair such as "2024-01-01 – 2024-12-31".
 */
const MULTI_PERIOD_PATTERNS: RegExp[] = [
  /\b(19|20)\d{2}\s*(?:-|–|—|to|through|thru)\s*(19|20)\d{2}\b/i, // a year range: 2021-2025
  /\ball\s+(?:dates|periods|years|time)\b/i,
  /\b(?:life|inception)\s*[- ]?to[- ]?date\b/i,
  /\bsince\s+inception\b/i,
  /\bmulti[- ]?(?:year|period)\b/i,
  /\b(?:fy\s*)?(?:19|20)\d{2}\s*(?:&|and|\+)\s*(?:fy\s*)?(?:19|20)\d{2}\b/i,
  /\btrailing\s+(?:multi|\d+\s*[- ]?year)/i,
];

export interface PeriodQualityVerdict {
  quality: string;
  note: string | null;
}

/**
 * resolvePeriodQuality — deterministic, multi-period first.
 * `row.metadata.period_raw` is the extraction's own raw period text; the semantic
 * bridge hands the same text back through `observationPeriod`.
 */
export function resolvePeriodQuality(row: any): PeriodQualityVerdict {
  const md = (row && row.metadata) || {};
  const raw = String(md.period_raw ?? '');

  // 1. AGGREGATE FIRST. A five-year report must never reach the single-year branch.
  if (raw && MULTI_PERIOD_PATTERNS.some((p) => p.test(raw))) {
    return {
      quality: PERIOD_QUALITY.AGGREGATE_MULTI_PERIOD,
      note: 'the figure covers more than one reporting period and is not a single-period amount',
    };
  }

  const p = observationPeriod(row);
  const hasBounds = Boolean(p.period_start && p.period_end);
  const statedSource = md.period_source ?? null;

  // 2. The document stated the period and it parsed.
  if (hasBounds && statedSource === 'model_reported') {
    return { quality: PERIOD_QUALITY.EXACT, note: null };
  }

  // 3. Real bounds without a stated source, or an annual type with a known year.
  if (hasBounds) {
    return { quality: PERIOD_QUALITY.BOUNDED, note: p.note };
  }
  if (p.period_type && p.fiscal_year != null) {
    return { quality: PERIOD_QUALITY.BOUNDED, note: p.note };
  }

  // 4. A period was STATED and could not be determined. The `raw` guard matters:
  //    `observationPeriod` marks a row with NO period at all as ambiguous too, so
  //    without it "nothing was stated" would read as "a period was stated and failed"
  //    — reporting AMBIGUOUS where the honest answer is UNKNOWN. A stated-but-unparsed
  //    period is AMBIGUOUS; no period is UNKNOWN, and the two are not the same finding.
  if (statedSource === 'unresolved' || md.period_ambiguous === true || md.period_ambiguous === 'true' || (raw && p.ambiguous)) {
    return {
      quality: PERIOD_QUALITY.AMBIGUOUS,
      note: raw ? `the stated period "${raw}" could not be determined` : 'the stated period could not be determined',
    };
  }

  // 5. Nothing at all. A bare `period_type` with no year and no bounds is not a period.
  return { quality: PERIOD_QUALITY.UNKNOWN, note: p.note || 'no reporting period is recorded' };
}

export function isPromotablePeriodQuality(quality: unknown): boolean {
  const q = String(quality || '');
  return q === PERIOD_QUALITY.EXACT || q === PERIOD_QUALITY.BOUNDED;
}

/** The recorded basis text, from the ONE key the platform writes. */
export function recordedBasis(row: any): { raw: string | null; source: string | null } {
  const md = (row && row.metadata) || {};
  const raw = md.accounting_basis ?? null;
  const source = md.accounting_basis_source ?? null;
  return {
    raw: raw == null || raw === '' ? null : String(raw).toLowerCase(),
    source: source == null ? null : String(source),
  };
}

/**
 * resolveAccountingBasis — the recorded basis, or `unknown` when none exists.
 * A document type is NEVER consulted: the same P&L shape is produced on either basis.
 */
export function resolveAccountingBasis(row: any): { basis: string; source: string | null; recorded: boolean } {
  const { raw, source } = recordedBasis(row);
  if (raw == null) return { basis: ACCOUNTING_BASIS.UNKNOWN, source: null, recorded: false };
  const allowed = ['cash', 'accrual', 'tax', 'unknown', 'not_applicable'];
  if (!allowed.includes(raw)) {
    // An unrecognised basis is NOT upgraded to a defensible one.
    return { basis: ACCOUNTING_BASIS.UNKNOWN, source, recorded: true };
  }
  return { basis: raw, source, recorded: true };
}

/**
 * FLOW vs STOCK. A measure that spans a period (revenue, gross profit, net income,
 * EBITDA) MEANS something different on each basis, so its basis must be known. A
 * measure taken at an instant (cash, total assets, total debt) does not pose the
 * question at all, and is `not_applicable` rather than force-answered.
 *
 * Derived from the fact definition's own `applicable_periods` — the registry stays
 * the single declaration, and this module declares no second list of concepts.
 */
const FLOW_PERIODS = ['fiscal_year', 'ttm', 'calendar_year', 'quarterly', 'monthly', 'ytd'];
export const FLOW_PERIOD_TYPES = FLOW_PERIODS;

export function basisRequiresValue(fact: any): boolean {
  if (!fact) return true; // an unknown definition is treated conservatively
  const periods = Array.isArray(fact.applicable_periods) ? fact.applicable_periods : [];
  if (periods.length === 0) return true;
  return periods.some((p: any) => FLOW_PERIODS.includes(String(p)));
}

export function promotableBasis(basis: unknown): boolean {
  const b = String(basis || '');
  return b === ACCOUNTING_BASIS.CASH || b === ACCOUNTING_BASIS.ACCRUAL || b === ACCOUNTING_BASIS.TAX;
}