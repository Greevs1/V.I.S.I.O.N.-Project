/**
 * VISION 6D.0b — DETERMINISTIC CONTENT SIGNALS.
 *
 * PURE. No I/O, no database, no model, no authorization, no storage. It answers
 * ONE question from TEXT ALREADY OBTAINED BY AN AUTHORIZED CALLER:
 *
 *   "What does this document's own content say it is?"
 *
 * SIGNAL PRIORITY (Phase 3/5). Ordered by evidential force:
 *   1. recognized government form number / official title   (decisive alone)
 *   2. structural statement heading + structural markers     (decisive with 2+)
 *   3. topic wording only                                    (never decisive)
 *   ... and the FILENAME is a WEAK SUPPORTING SIGNAL ONLY, carried separately
 *   in `weakFilenameHints`. It can never decide a classification: the same
 *   1040 named `banana.pdf` must still be a Form 1040 (D2/D30).
 */

export const CONTENT_STRENGTH: Record<string, number> = {
  form_number_and_title: 95,
  form_number_or_title: 85,
  structural_statement: 85,
  structural_markers_only: 60,
  topic_only: 55,
  family_only: 45,
  none: 0,
};

/** file_format from MIME and extension — a STORAGE fact, not a type. */
export function fileFormatFromMime(mime: unknown, fileName: unknown): string {
  const m = String(mime || '').toLowerCase();
  const name = String(fileName || '').toLowerCase();
  const ext = name.includes('.') ? name.split('.').pop().split(/[?#]/)[0] : '';
  const byExt: Record<string, string> = {
    pdf: 'pdf', xlsx: 'xlsx', xls: 'xls', csv: 'csv', tsv: 'csv',
    docx: 'docx', doc: 'doc', txt: 'txt', json: 'json', xml: 'xml',
    png: 'png', jpg: 'jpg', jpeg: 'jpeg', webp: 'webp',
  };
  if (byExt[ext]) return byExt[ext];
  if (m.includes('pdf')) return 'pdf';
  if (m.includes('spreadsheet') || m.includes('excel')) return 'xlsx';
  if (m.includes('csv')) return 'csv';
  if (m.includes('word')) return 'docx';
  if (m.includes('json')) return 'json';
  if (m.includes('xml')) return 'xml';
  if (m.includes('png')) return 'png';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('webp')) return 'webp';
  if (m.startsWith('text/')) return 'txt';
  return 'unknown';
}

/** Formats whose text can be read deterministically, without a provider. */
export const TEXT_READABLE_FORMATS: string[] = ['csv', 'txt', 'json', 'xml'];

export function isTextReadableFormat(format: unknown): boolean {
  return TEXT_READABLE_FORMATS.includes(String(format || '').toLowerCase());
}

/**
 * FORM RULES — ORDER MATTERS. The most specific form is tested first
 * (1120-S before 1120, 1040-SR before 1040, K-1 before the 1065 it rides on).
 * `number` is the government form identifier; `title` is the official title.
 * A number OR a title is strong evidence; both together are decisive.
 */
export const FORM_RULES: any[] = [
  {
    type: 'business_tax_return', subtype: 'form_1120s', family: 'tax', label: 'Form 1120-S',
    number: /\bform\s*1120\s*[-–—]?\s*s\b/i,
    title: /income\s+tax\s+return\s+for\s+an\s+s\s+corporation/i,
  },
  {
    type: 'business_tax_return', subtype: 'form_1065', family: 'tax', label: 'Form 1065',
    number: /\bform\s*1065\b/i,
    title: /return\s+of\s+partnership\s+income/i,
  },
  {
    type: 'business_tax_return', subtype: 'form_1120', family: 'tax', label: 'Form 1120',
    number: /\bform\s*1120\b/i,
    title: /u\.?\s?s\.?\s+corporation\s+income\s+tax\s+return/i,
  },
  {
    type: 'personal_tax_return', subtype: 'form_1040_sr', family: 'tax', label: 'Form 1040-SR',
    number: /\bform\s*1040\s*[-–—]?\s*sr\b/i,
    title: /u\.?\s?s\.?\s+tax\s+return\s+for\s+seniors/i,
  },
  {
    type: 'personal_tax_return', subtype: 'form_1040', family: 'tax', label: 'Form 1040',
    number: /\bform\s*1040\b/i,
    title: /u\.?\s?s\.?\s+individual\s+income\s+tax\s+return/i,
  },
  {
    type: 'k1', subtype: 'k1', family: 'tax', label: 'Schedule K-1',
    number: /\bschedule\s*k\s*[-–—]?\s*1\b/i,
    title: /(partner'?s|shareholder'?s)\s+share\s+of\s+(income|current\s+year)/i,
  },
  {
    type: 'w2', subtype: 'w2', family: 'tax', label: 'Form W-2',
    number: /\bform\s*w\s*[-–—]?\s*2\b/i,
    title: /wage\s+and\s+tax\s+statement/i,
  },
  {
    type: 'form_1099', subtype: 'form_1099_nec', family: 'tax', label: 'Form 1099-NEC',
    number: /\bform\s*1099\s*[-–—]?\s*nec\b/i,
    title: /nonemployee\s+compensation/i,
  },
  {
    type: 'form_1099', subtype: 'form_1099_int', family: 'tax', label: 'Form 1099-INT',
    number: /\bform\s*1099\s*[-–—]?\s*int\b/i,
    title: /interest\s+income/i,
  },
  {
    type: 'form_1099', subtype: 'form_1099_div', family: 'tax', label: 'Form 1099-DIV',
    number: /\bform\s*1099\s*[-–—]?\s*div\b/i,
    title: /dividends\s+and\s+distributions/i,
  },
  {
    type: 'form_1099', subtype: 'form_1099_misc', family: 'tax', label: 'Form 1099-MISC',
    number: /\bform\s*1099\s*[-–—]?\s*misc\b/i,
    title: /miscellaneous\s+(information|income)/i,
  },
  {
    type: 'form_1099', subtype: 'form_1099_r', family: 'tax', label: 'Form 1099-R',
    number: /\bform\s*1099\s*[-–—]?\s*r\b/i,
    title: /distributions\s+from\s+pensions/i,
  },
  {
    type: 'form_1099', subtype: 'form_1099_ssa', family: 'tax', label: 'Form 1099-SSA',
    number: /\bform\s*1099\s*[-–—]?\s*ssa\b|\bsocial\s+security\s+benefit\s+statement\b/i,
    title: /social\s+security\s+benefit\s+statement/i,
  },
  {
    type: 'form_1099', subtype: 'form_1099', family: 'tax', label: 'Form 1099',
    number: /\bform\s*1099\b/i,
    title: /(1099|information\s+return)/i,
  },
  {
    type: 'schedule_c', subtype: 'schedule_c', family: 'tax', label: 'Schedule C',
    number: /\bschedule\s*c\b/i,
    title: /profit\s+or\s+loss\s+from\s+business/i,
  },
  {
    type: 'schedule_e', subtype: 'schedule_e', family: 'tax', label: 'Schedule E',
    number: /\bschedule\s*e\b/i,
    title: /supplemental\s+income\s+and\s+loss/i,
  },
];

/** Structural markers per statement family. Content markers, not filenames. */
export const STRUCTURAL_MARKERS: Record<string, { re: RegExp; token: string }[]> = {
  profit_and_loss: [
    { re: /\brevenue\b|\bsales\b/i, token: 'revenue' },
    { re: /\bcost\s+of\s+(goods\s+sold|sales)\b|\bcogs\b/i, token: 'cogs' },
    { re: /\bgross\s+profit\b/i, token: 'gross_profit' },
    { re: /\boperating\s+(expenses|income)\b/i, token: 'operating_expenses' },
    { re: /\bnet\s+(income|profit|loss)\b/i, token: 'net_income' },
    { re: /\bebitda\b/i, token: 'ebitda' },
  ],
  balance_sheet: [
    { re: /\bassets?\b/i, token: 'assets' },
    { re: /\bliabilit/i, token: 'liabilities' },
    { re: /\b(owner'?s\s+)?equity\b|\bretained\s+earnings\b/i, token: 'equity' },
    { re: /\bcash\b/i, token: 'cash' },
    { re: /\baccounts\s+receivable\b/i, token: 'accounts_receivable' },
    { re: /\baccounts\s+payable\b/i, token: 'accounts_payable' },
  ],
  payroll_report: [
    { re: /\bgross\s+wages\b|\btotal\s+wages\b/i, token: 'gross_wages' },
    { re: /\bpayroll\s+tax(es)?\b/i, token: 'payroll_tax' },
    { re: /\bemployee\s+count\b|\bnumber\s+of\s+employees\b/i, token: 'employee_count' },
    { re: /\bnet\s+pay\b|\bpay\s+period\b/i, token: 'pay_period' },
  ],
  debt_schedule: [
    { re: /\blender\b/i, token: 'lender' },
    { re: /\bloan\s+balance\b|\bprincipal\s+balance\b/i, token: 'loan_balance' },
    { re: /\binterest\s+rate\b/i, token: 'interest_rate' },
    { re: /\bmonthly\s+payment\b|\bmaturity\s+date\b/i, token: 'payment_terms' },
  ],
};

export const STATEMENT_HEADINGS: Record<string, RegExp> = {
  profit_and_loss: /profit\s*(and|&)\s*loss|income\s+statement|statement\s+of\s+operations/i,
  balance_sheet: /balance\s+sheet|statement\s+of\s+financial\s+position/i,
  payroll_report: /payroll\s+(register|report|summary|detail|journal)/i,
  debt_schedule: /\b(loan|debt)\s+(schedule|summary|amortization)\b|\blender\s+schedule\b/i,
  banking: /bank\s+statement|account\s+statement|beginning\s+balance|ending\s+balance/i,
};

/** Structural markers found in a text. */
export function structuralSignals(text: unknown): Record<string, string[]> {
  const t = String(text || '');
  const out: Record<string, string[]> = {};
  for (const family of Object.keys(STRUCTURAL_MARKERS)) {
    out[family] = STRUCTURAL_MARKERS[family].filter((m) => m.re.test(t)).map((m) => m.token);
  }
  return out;
}

/** Recognized government forms in a text, most specific first. */
export function recognizeForms(text: unknown): any[] {
  const t = String(text || '').replace(/\s+/g, ' ');
  const matches: any[] = [];
  for (const rule of FORM_RULES) {
    const hasNumber = rule.number ? rule.number.test(t) : false;
    const hasTitle = rule.title ? rule.title.test(t) : false;
    if (!hasNumber && !hasTitle) continue;
    const evidence: string[] = [];
    if (hasNumber) evidence.push(rule.label + ' number');
    if (hasTitle) evidence.push(rule.label + ' title');
    matches.push({
      type: rule.type,
      subtype: rule.subtype,
      family: rule.family,
      label: rule.label,
      strength: hasNumber && hasTitle
        ? CONTENT_STRENGTH.form_number_and_title
        : CONTENT_STRENGTH.form_number_or_title,
      evidence,
    });
  }
  return matches;
}

/**
 * evaluateContent — the deterministic decision over a document's own text.
 *
 * Returns the candidates it found with their evidential strength, the best of
 * them, and whether that best is DECISIVE (strong enough to settle the answer
 * without a model). Conflicting strong forms are reported as ambiguous rather
 * than silently resolved.
 */
export function evaluateContent(text: unknown): {
  candidates: any[];
  best: any | null;
  decisive: boolean;
  ambiguous: boolean;
  evidence: string[];
} {
  const forms = recognizeForms(text);
  const markers = structuralSignals(text);
  const candidates: any[] = forms.map((f) => ({ ...f }));
  const evidence: string[] = forms.flatMap((f) => f.evidence);

  // Statements: a heading plus structural markers is strong; markers alone are
  // a supporting indicator only.
  for (const family of ['profit_and_loss', 'balance_sheet', 'payroll_report', 'debt_schedule']) {
    const headingRe = STATEMENT_HEADINGS[family];
    const hasHeading = headingRe ? headingRe.test(String(text || '')) : false;
    const found = markers[family] || [];
    if (hasHeading && found.length >= 2) {
      candidates.push({
        type: family,
        subtype: null,
        family: family === 'payroll_report' ? 'payroll' : family === 'debt_schedule' ? 'banking' : 'financial_statement',
        label: family,
        strength: CONTENT_STRENGTH.structural_statement,
        evidence: [`statement heading (${family})`, `structural markers: ${found.join(', ')}`],
      });
    } else if (hasHeading || found.length >= 2) {
      candidates.push({
        type: family,
        subtype: null,
        family: family === 'payroll_report' ? 'payroll' : family === 'debt_schedule' ? 'banking' : 'financial_statement',
        label: family,
        strength: hasHeading ? CONTENT_STRENGTH.topic_only : CONTENT_STRENGTH.structural_markers_only,
        evidence: [hasHeading ? `statement heading only (${family})` : `structural markers only: ${found.join(', ')}`],
      });
    }
  }

  // A recognized banking document has a family and a folder but no canonical
  // type in the approved taxonomy: reported honestly, never as 'other' silently.
  if (STATEMENT_HEADINGS.banking.test(String(text || '')) && !candidates.some((c) => c.type === 'debt_schedule')) {
    candidates.push({
      type: null, subtype: null, family: 'banking', label: 'banking statement',
      strength: CONTENT_STRENGTH.family_only,
      evidence: ['banking statement wording'],
    });
  }

  candidates.sort((a, b) => b.strength - a.strength);
  const best = candidates[0] || null;

  const strongTax = forms.filter((f) => f.family === 'tax' && f.strength >= 85);
  const strongStatement = candidates.filter((c) => c.type && c.family === 'financial_statement' && c.strength >= 85);
  const ambiguous = (strongTax.length > 0 && strongStatement.length > 0);

  return {
    candidates,
    best,
    decisive: !!best && best.strength >= CONTENT_STRENGTH.form_number_or_title && !ambiguous,
    ambiguous,
    evidence,
  };
}

/** The tax year a document states about itself, if any. */
export function detectTaxYear(text: unknown): number | null {
  const t = String(text || '');
  const labeled = t.match(/(?:tax\s+year|for\s+the\s+year|fiscal\s+year|year\s+ended|calendar\s+year)\D{0,12}(20\d{2})/i);
  if (labeled) return Number(labeled[1]);
  const formYear = t.match(/\b(20\d{2})\s+(?:form|return|schedule)\b/i);
  if (formYear) return Number(formYear[1]);
  const anyYear = t.match(/\b(20[12]\d)\b/);
  return anyYear ? Number(anyYear[1]) : null;
}

/** The reporting period a document states, and its bounds where stated. */
export function detectReportingPeriod(text: unknown): {
  reporting_period: string | null; period_start: string | null; period_end: string | null; tax_year: number | null;
} {
  const t = String(text || '').replace(/\s+/g, ' ');
  const year = detectTaxYear(t);
  const range = t.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s*(20\d{2})\s*(?:-|–|to|through)\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s*(20\d{2})/i);
  if (range) {
    return { reporting_period: range[0], period_start: range[2] + ' ' + range[1], period_end: range[4] + ' ' + range[3], tax_year: year };
  }
  const ytd = t.match(/\b(ytd|year\s+to\s+date)\b/i);
  if (ytd && year) {
    return { reporting_period: `YTD ${year}`, period_start: `${year}-01-01`, period_end: null, tax_year: year };
  }
  if (year) {
    return { reporting_period: String(year), period_start: `${year}-01-01`, period_end: `${year}-12-31`, tax_year: year };
  }
  return { reporting_period: null, period_start: null, period_end: null, tax_year: null };
}

/** Accounting basis, only when the document says so. */
export function detectAccountingBasis(text: unknown): string | null {
  const t = String(text || '');
  if (/accrual\s+basis/i.test(t)) return 'accrual';
  if (/cash\s+basis/i.test(t)) return 'cash';
  if (/tax\s+basis/i.test(t)) return 'tax_basis';
  if (/modified\s+accrual/i.test(t)) return 'modified_accrual';
  return null;
}

/**
 * WEAK FILENAME HINTS — supporting evidence ONLY. This function exists so the
 * filename can never decide a result: its output is used solely to break a tie
 * between equally strong content candidates, and is recorded as weak evidence.
 */
export function weakFilenameHints(fileName: unknown): {
  hint_type: string | null; hint_subtype: string | null; hint_family: string | null; tokens: string[];
} {
  const name = String(fileName || '');
  const tokens: string[] = [];
  let hint_type: string | null = null;
  let hint_subtype: string | null = null;
  let hint_family: string | null = null;

  if (/1120\s*[-–]?\s*s/i.test(name)) { hint_type = 'business_tax_return'; hint_subtype = 'form_1120s'; hint_family = 'tax'; tokens.push('filename suggests 1120-S'); }
  else if (/1120/i.test(name)) { hint_type = 'business_tax_return'; hint_subtype = 'form_1120'; hint_family = 'tax'; tokens.push('filename suggests 1120'); }
  else if (/1065/i.test(name)) { hint_type = 'business_tax_return'; hint_subtype = 'form_1065'; hint_family = 'tax'; tokens.push('filename suggests 1065'); }
  else if (/1040/i.test(name)) { hint_type = 'personal_tax_return'; hint_subtype = 'form_1040'; hint_family = 'tax'; tokens.push('filename suggests 1040'); }
  else if (/\bw[-–]?2\b/i.test(name)) { hint_type = 'w2'; hint_subtype = 'w2'; hint_family = 'tax'; tokens.push('filename suggests W-2'); }
  else if (/1099/i.test(name)) { hint_type = 'form_1099'; hint_family = 'tax'; tokens.push('filename suggests 1099'); }
  else if (/k[-–]?1/i.test(name)) { hint_type = 'k1'; hint_subtype = 'k1'; hint_family = 'tax'; tokens.push('filename suggests K-1'); }
  else if (/balance\s*sheet|\bbs\b/i.test(name)) { hint_type = 'balance_sheet'; hint_family = 'financial_statement'; tokens.push('filename suggests balance sheet'); }
  else if (/\bp\s*&\s*l\b|profit|income\s*statement/i.test(name)) { hint_type = 'profit_and_loss'; hint_family = 'financial_statement'; tokens.push('filename suggests P&L'); }
  else if (/payroll/i.test(name)) { hint_type = 'payroll_report'; hint_family = 'payroll'; tokens.push('filename suggests payroll'); }
  else if (/bank/i.test(name)) { hint_family = 'banking'; tokens.push('filename suggests bank document'); }
  else if (/\btax(es)?\b|\breturn\b/i.test(name)) { hint_family = 'tax'; tokens.push('filename suggests a tax document'); }

  return { hint_type, hint_subtype, hint_family, tokens };
}