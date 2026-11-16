/**
 * Phase 6D.0 — REPORTING PERIOD INTEGRITY
 *
 * The document's OWN reporting period is preserved verbatim and parsed only where
 * parsing is deterministic. A period that cannot be read is recorded as AMBIGUOUS
 * (and, for period-bearing documents, requires review). A guessed calendar year is
 * never substituted for a period the document did not state, and a year the
 * uploader declared is labelled as declared — never presented as extracted.
 *
 * Pure module: no I/O, no database, no Supabase, no authorization. It decides
 * nothing about access and touches nothing.
 */

export interface PeriodInfo {
  period_start: string | null;
  period_end: string | null;
  fiscal_year: number | null;
  period_type: string | null; // 'annual' | 'quarterly' | 'monthly' | 'as_of' | 'custom'
}

export interface ParsedPeriod {
  period_type: string;
  period_start: string | null;
  period_end: string | null;
  as_of_date: string | null;
  fiscal_year: number | null;
}

export interface ResolvedPeriod extends ParsedPeriod {
  /** Exactly what the source stated, before any interpretation. */
  period_raw: string | null;
  period_source: 'model_reported' | 'user_declared_year' | 'unresolved';
  period_ambiguous: boolean;
  period_note: string | null;
}

const MONTH_INDEX: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10,
  dec: 11, december: 11,
};

const isoDate = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

const monthsBetween = (a: { y: number; m: number }, b: { y: number; m: number }) =>
  (b.y - a.y) * 12 + (b.m - a.m);

/**
 * derivePeriodFromType — a calendar-year assumption. Used ONLY for a year the
 * uploader explicitly declared at upload; it is never used to fill in a period the
 * document did not state.
 */
export function derivePeriodFromType(year: number): PeriodInfo {
  return {
    period_start: `${year}-01-01`,
    period_end: `${year}-12-31`,
    fiscal_year: year,
    period_type: 'annual',
  };
}

/** Parse one side of a period expression: "Jan 2025", "January 1, 2025", "12/31/2025", "2025-12-31", "2025". */
function parsePeriodSide(side: string): { y: number; m: number; d: number | null } | null {
  const s = side.trim().replace(/,/g, ' ').replace(/\s+/g, ' ');
  if (!s) return null;

  // ISO: 2025-12-31 or 2025-12
  let m = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
  if (m) return { y: Number(m[1]), m: Number(m[2]) - 1, d: m[3] ? Number(m[3]) : null };

  // Slashed: 12/31/2025 or 12/2025
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return { y: Number(m[3]), m: Number(m[1]) - 1, d: Number(m[2]) };
  m = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return { y: Number(m[2]), m: Number(m[1]) - 1, d: null };

  // Month name + day + year: "Dec 31 2025"
  m = s.match(/^([a-z]{3,9}) (\d{1,2}) (\d{4})$/i);
  if (m && MONTH_INDEX[m[1].toLowerCase()] !== undefined) {
    return { y: Number(m[3]), m: MONTH_INDEX[m[1].toLowerCase()], d: Number(m[2]) };
  }

  // Month name + year: "Dec 2025"
  m = s.match(/^([a-z]{3,9}) (\d{4})$/i);
  if (m && MONTH_INDEX[m[1].toLowerCase()] !== undefined) {
    return { y: Number(m[2]), m: MONTH_INDEX[m[1].toLowerCase()], d: null };
  }

  // Bare year, optionally as a fiscal-year phrase
  m = s.match(/^(?:fy ?|fiscal year ?)?(\d{4})$/i);
  if (m) return { y: Number(m[1]), m: 0, d: null };

  // Bare month name, or a number with no year — not deterministic.
  return null;
}

/**
 * parseReportingPeriod — deterministic parsing of the period a document STATES.
 * Returns null when the expression is not unambiguous; the caller then records
 * ambiguity rather than manufacturing precision.
 */
export function parseReportingPeriod(raw: string | null | undefined): ParsedPeriod | null {
  const s = String(raw ?? '').trim().replace(/\.$/, '').replace(/\s+/g, ' ');
  if (!s) return null;

  const yearOnly = s.match(/^(?:fy ?|fiscal year ?)?(\d{4})$/i);
  if (yearOnly) {
    const y = Number(yearOnly[1]);
    return { period_type: 'annual', period_start: isoDate(y, 0, 1), period_end: isoDate(y, 11, 31), as_of_date: null, fiscal_year: y };
  }

  // TTM — a statement can say WHICH KIND of period it covers. A trailing-twelve-
  // month statement is neither a fiscal year nor an unreadable string: reading it
  // as ambiguous would throw away a period the source stated and invite a consumer
  // to substitute one, and reading it as `annual` is exactly the FY→TTM confusion
  // that must never happen. Where the statement also states the months it covers,
  // those bounds are preserved; where it does not, the KIND alone is the period.
  const ttm = s.match(/^(?:ttm|trailing\s+(?:twelve|12)\s*months?|last\s+(?:twelve|12)\s*months?)(?:\s*\((.+)\))?$/i);
  if (ttm) {
    let period_start: string | null = null;
    let period_end: string | null = null;
    let fiscal_year: number | null = null;
    if (ttm[1]) {
      const parts = ttm[1].split(/\s+(?:–|—|-|to|through|thru)\s+/i);
      if (parts.length === 2) {
        const from = parsePeriodSide(parts[0]);
        const to = parsePeriodSide(parts[1]);
        if (from && to) {
          period_start = isoDate(from.y, from.m, 1);
          period_end = isoDate(to.y, to.m, lastDayOfMonth(to.y, to.m));
          fiscal_year = to.y;
        }
      }
    }
    return { period_type: 'ttm', period_start, period_end, as_of_date: null, fiscal_year };
  }

  const asOf = s.match(/^as of (.+)$/i);
  if (asOf) {
    const side = parsePeriodSide(asOf[1]);
    if (!side) return null;
    const day = side.d ?? lastDayOfMonth(side.y, side.m);
    const end = isoDate(side.y, side.m, day);
    return { period_type: 'as_of', period_start: null, period_end: end, as_of_date: end, fiscal_year: side.y };
  }

  const quarter = s.match(/^q([1-4])\s*(?:fy ?|fiscal year ?)?(\d{4})$/i);
  if (quarter) {
    const q = Number(quarter[1]);
    const y = Number(quarter[2]);
    const startMonth = (q - 1) * 3;
    return {
      period_type: 'quarterly',
      period_start: isoDate(y, startMonth, 1),
      period_end: isoDate(y, startMonth + 2, lastDayOfMonth(y, startMonth + 2)),
      as_of_date: null,
      fiscal_year: y,
    };
  }

  const rangeParts = s.split(/\s*(?:-|–|—|to|through)\s*/i).filter(Boolean);
  if (rangeParts.length === 2) {
    const startSide = parsePeriodSide(rangeParts[0]);
    const endSide = parsePeriodSide(rangeParts[1]);
    if (startSide && endSide && startSide.y === endSide.y) {
      const span = monthsBetween({ y: startSide.y, m: startSide.m }, { y: endSide.y, m: endSide.m });
      const start = isoDate(startSide.y, startSide.m, startSide.d ?? 1);
      const end = isoDate(endSide.y, endSide.m, endSide.d ?? lastDayOfMonth(endSide.y, endSide.m));
      const period_type = span === 0 ? 'monthly' : span === 3 ? 'quarterly' : span >= 11 ? 'annual' : 'custom';
      return { period_type, period_start: start, period_end: end, as_of_date: null, fiscal_year: endSide.y };
    }
    return null;
  }

  const single = parsePeriodSide(s);
  if (single) {
    const day = single.d ?? lastDayOfMonth(single.y, single.m);
    return {
      period_type: 'monthly',
      period_start: isoDate(single.y, single.m, 1),
      period_end: isoDate(single.y, single.m, day),
      as_of_date: null,
      fiscal_year: single.y,
    };
  }

  return null;
}

const EMPTY_PERIOD: ParsedPeriod = {
  period_type: null as any,
  period_start: null,
  period_end: null,
  as_of_date: null,
  fiscal_year: null,
};

/**
 * resolveReportingPeriod — the ONE period decision.
 *
 * Precedence: what the document states → the year the uploader declared →
 * unresolved (recorded as ambiguous, never filled in with a guess).
 */
export function resolveReportingPeriod(
  raw: string | null | undefined,
  declaredYear?: number | null
): ResolvedPeriod {
  const cleaned = typeof raw === 'string' ? raw.trim() : '';

  if (cleaned) {
    const parsed = parseReportingPeriod(cleaned);
    if (parsed) {
      return { ...parsed, period_raw: cleaned, period_source: 'model_reported', period_ambiguous: false, period_note: null };
    }
    return {
      ...EMPTY_PERIOD,
      period_raw: cleaned,
      period_source: 'unresolved',
      period_ambiguous: true,
      period_note: 'the document states a reporting period that could not be parsed deterministically',
    };
  }

  if (declaredYear) {
    return {
      ...derivePeriodFromType(declaredYear),
      as_of_date: null,
      period_raw: null,
      period_source: 'user_declared_year',
      period_ambiguous: false,
      period_note: 'period derived from the year declared at upload, not read from the document',
    };
  }

  return {
    ...EMPTY_PERIOD,
    period_raw: null,
    period_source: 'unresolved',
    period_ambiguous: true,
    period_note: 'the document states no reporting period and none was declared',
  };
}

/** The metadata block persisted on every extracted field, so the period travels with the value. */
export function periodMetadata(period: ResolvedPeriod) {
  return {
    period_raw: period.period_raw,
    period_source: period.period_source,
    period_ambiguous: period.period_ambiguous,
    period_start: period.period_start,
    period_end: period.period_end,
    as_of_date: period.as_of_date,
    fiscal_year: period.fiscal_year,
    period_type: period.period_type,
  };
}