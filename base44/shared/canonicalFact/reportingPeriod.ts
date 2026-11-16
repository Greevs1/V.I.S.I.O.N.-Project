/**
 * canonicalFact/reportingPeriod.ts — Phase 14.2A
 *
 * Reporting Period Resolution. Revenue 2024 must not compete blindly with
 * Revenue TTM. Supports fiscal year, calendar year, TTM, YTD, quarter,
 * month, point-in-time, and valuation date.
 *
 * Returns the authoritative value for the requested period. Uses the
 * platform's approved definition of "current" — does not invent one.
 */

import type { ReportingPeriod, ReportingPeriodType } from './types.ts';
import type { ResolverResult } from '../valuationEngine/intelligenceMapping.ts';

// ── Period Precedence (highest to lowest for "current" queries) ─────────────
export const PERIOD_PRECEDENCE: ReportingPeriodType[] = [
  'ttm',              // Trailing twelve months — most current
  'fiscal_year',      // Most recent fiscal year
  'calendar_year',    // Most recent calendar year
  'ytd',              // Year to date
  'quarter',          // Most recent quarter
  'month',            // Most recent month
  'point_in_time',    // As of a specific date
  'valuation_date',   // As of valuation date
];

// ── Parse a period label into a ReportingPeriod ─────────────────────────────
export function parsePeriodLabel(label: string): ReportingPeriod | null {
  if (!label) return null;
  const lower = label.toLowerCase().trim();

  if (lower === 'ttm' || lower === 'trailing twelve months') return { type: 'ttm', label: 'TTM' };
  if (lower === 'ytd' || lower === 'year to date') return { type: 'ytd', label: 'YTD' };

  const fyMatch = lower.match(/^fy(\d{2,4})$/);
  if (fyMatch) {
    const year = fyMatch[1].length === 2 ? 2000 + parseInt(fyMatch[1]) : parseInt(fyMatch[1]);
    return { type: 'fiscal_year', label: `FY${year}`, fiscal_year: year, start_date: `${year}-01-01`, end_date: `${year}-12-31` };
  }

  const cyMatch = lower.match(/^(?:cy)?(\d{4})$/);
  if (cyMatch) {
    const year = parseInt(cyMatch[1]);
    return { type: 'calendar_year', label: `${year}`, fiscal_year: year, start_date: `${year}-01-01`, end_date: `${year}-12-31` };
  }

  const qMatch = lower.match(/^q([1-4])[-_\s]*(\d{4})$/);
  if (qMatch) {
    const q = parseInt(qMatch[1]);
    const year = parseInt(qMatch[2]);
    const startMonth = (q - 1) * 3;
    return { type: 'quarter', label: `Q${q}-${year}`, fiscal_year: year, start_date: `${year}-${String(startMonth + 1).padStart(2, '0')}-01` };
  }

  const mMatch = lower.match(/^(\d{4})-(\d{2})$/);
  if (mMatch) return { type: 'month', label: `${mMatch[1]}-${mMatch[2]}`, fiscal_year: parseInt(mMatch[1]) };

  const dMatch = lower.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dMatch) return { type: 'point_in_time', label: dMatch[1], end_date: dMatch[1] };

  if (lower === 'valuation date' || lower === 'valuation_date') return { type: 'valuation_date', label: 'Valuation Date' };

  return null;
}

// ── Check if a candidate's period is compatible with the requested period ───
export function isPeriodCompatible(
  candidatePeriod: string | undefined,
  requestedPeriod: ReportingPeriod | undefined,
): boolean {
  if (!requestedPeriod) return true; // No period requested — accept all
  if (!candidatePeriod) return true; // Candidate has no period — accept (may be filtered later)

  const candidateParsed = parsePeriodLabel(candidatePeriod);
  if (!candidateParsed) return true; // Unparseable — accept

  // Exact type match
  if (candidateParsed.type === requestedPeriod.type) {
    if (requestedPeriod.fiscal_year && candidateParsed.fiscal_year) {
      return candidateParsed.fiscal_year === requestedPeriod.fiscal_year;
    }
    return true;
  }

  // TTM is compatible with any recent fiscal/calendar year (within 1 year)
  if (requestedPeriod.type === 'ttm' && (candidateParsed.type === 'fiscal_year' || candidateParsed.type === 'calendar_year')) {
    return true; // TTM may come from FY data — accept and let authority resolve
  }

  // Fiscal year and calendar year with same year are compatible
  if (
    (requestedPeriod.type === 'fiscal_year' || requestedPeriod.type === 'calendar_year') &&
    (candidateParsed.type === 'fiscal_year' || candidateParsed.type === 'calendar_year') &&
    requestedPeriod.fiscal_year &&
    candidateParsed.fiscal_year &&
    requestedPeriod.fiscal_year === candidateParsed.fiscal_year
  ) {
    return true;
  }

  return false;
}

// ── Get the "current" period per platform definition ───────────────────────
// The platform defines "current" as: TTM if available, else most recent FY.
export function getCurrentPeriod(): ReportingPeriod {
  const now = new Date();
  const year = now.getFullYear();
  return { type: 'ttm', label: 'TTM', end_date: now.toISOString().split('T')[0] };
}

// ── Sort candidates by period recency (most recent first) ───────────────────
export function sortByPeriodRecency(results: ResolverResult[]): ResolverResult[] {
  return [...results].sort((a, b) => {
    const periodA = a.reporting_period ? parsePeriodLabel(a.reporting_period) : null;
    const periodB = b.reporting_period ? parsePeriodLabel(b.reporting_period) : null;
    const yearA = periodA?.fiscal_year || 0;
    const yearB = periodB?.fiscal_year || 0;
    return yearB - yearA;
  });
}