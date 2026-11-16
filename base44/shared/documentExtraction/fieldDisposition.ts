/**
 * Phase 6D.0c.3 — FIELD DISPOSITION (no orphan extracted concepts).
 *
 * Every field a production reader claims to extract is classified here, so a
 * figure can never be extracted into nowhere:
 *
 *   CANONICAL_FACT            the value reaches a canonical fact / concept lane;
 *   EVIDENCE_ONLY             legitimate evidence that must NOT be forced into a
 *                             business fact (we are before 6D.1 — promotion is
 *                             not this phase's decision);
 *   SENSITIVE                 an identifier that is never extracted, persisted for
 *                             display, or sent to the model;
 *   INTENTIONALLY_UNSUPPORTED a concept no reader produces, recorded so the gap
 *                             is declared rather than assumed away.
 *
 * It also carries BUSINESS RELEVANCE, which is what makes "use relevant business
 * information" honest: confirming a personal return does NOT re-scope the whole
 * return. Only concepts declared relevant to the business may become eligible
 * business evidence; everything else stays personal document evidence.
 *
 * This module imports NOTHING, so the offline harness can bundle it alone and
 * compare it against the engine's live schema map (orphanFields(schemas)).
 */

export type Disposition = 'CANONICAL_FACT' | 'EVIDENCE_ONLY' | 'SENSITIVE' | 'INTENTIONALLY_UNSUPPORTED';

export interface FieldDisposition {
  disposition: Disposition;
  /** True only when the concept may become BUSINESS evidence after a confirmation. */
  business_relevant?: boolean;
  note?: string;
}

const cf = (business_relevant = false): FieldDisposition => ({ disposition: 'CANONICAL_FACT', business_relevant });
const eo = (business_relevant = false, note?: string): FieldDisposition => ({ disposition: 'EVIDENCE_ONLY', business_relevant, note });

/** Keyed by READER KEY (the extraction schema key), then field name. */
export const FIELD_DISPOSITIONS: Record<string, Record<string, FieldDisposition>> = {
  profit_and_loss: {
    annual_revenue: cf(true), cogs: eo(true), gross_profit: cf(true), operating_expenses: eo(true),
    operating_income: eo(true), reported_ebitda: cf(true), interest_expense: eo(true), taxes: cf(true),
    depreciation: eo(true), amortization: eo(true), net_profit: cf(true), total_expenses: eo(true),
    owner_compensation: cf(true),
  },
  balance_sheet: {
    total_assets: eo(true), current_assets: eo(true), total_liabilities: eo(true),
    total_equity: eo(true), cash_on_hand: eo(true), total_debt: eo(true),
  },
  payroll_report: {
    total_payroll: cf(true), owner_payroll: cf(true), employee_count: eo(true), payroll_tax: eo(true),
  },
  debt_schedule: {
    lender_name: eo(true), loan_balance: eo(true), interest_rate: eo(true), monthly_payment: eo(true), maturity_date: eo(true),
  },
  // ── TAX READERS ──────────────────────────────────────────────────────────
  // A tax return is PERSONAL or BUSINESS in identity; only the concepts that are
  // genuinely about the business are marked business_relevant.
  personal_tax_return: {
    adjusted_gross_income: eo(false, 'personal income measure — evidence, not a business figure'),
    taxable_income: eo(false, 'personal tax measure — evidence, not a business figure'),
    total_tax: eo(false, 'a tax liability of the individual, not business tax expense'),
    federal_income_tax_withheld: eo(false),
    estimated_tax_payments: eo(false),
    amount_owed: eo(false),
    refund: eo(false),
    itemized_deductions: eo(false),
    qualified_business_income: eo(true, 'the QBI deduction is derived from the business activity'),
  },
  business_tax_return: {
    gross_receipts: cf(true), ordinary_business_income: cf(true), officer_compensation: cf(true),
    wages: eo(true), guaranteed_payments: eo(true), distributions: eo(true),
    self_employment_earnings: eo(true), deductions: eo(true), taxable_income: cf(true),
    entity_name: eo(false, 'association evidence only — proves which entity the return concerns, never business intelligence'),
  },
  business_tax_return_1120s: {
    gross_receipts: cf(true), ordinary_business_income: cf(true), officer_compensation: cf(true),
    wages: eo(true), distributions: eo(true), deductions: eo(true), taxable_income: cf(true),
    entity_name: eo(false, 'association evidence only — proves which entity the return concerns, never business intelligence'),
  },
  business_tax_return_1065: {
    gross_receipts: cf(true), ordinary_business_income: cf(true), guaranteed_payments: eo(true),
    distributions: eo(true), self_employment_earnings: eo(true), deductions: eo(true), taxable_income: cf(true),
    entity_name: eo(false, 'association evidence only — proves which entity the return concerns, never business intelligence'),
  },
  w2: {
    // A WAGE FIGURE IS BUSINESS-RELEVANT ONLY WITH THE DOCUMENT'S OWN ASSOCIATION: the
    // employer named ON the W-2 must be the active business. With any other employer —
    // or none — eligibility is AMBIGUOUS and the figure stays document evidence (P1/P2).
    wages_tips_other_compensation: eo(true, 'a payroll measure of the employer named on the W-2 — business-relevant only with that association'),
    federal_income_tax_withheld: eo(false),
    social_security_wages: eo(false),
    medicare_wages: eo(false),
    state_wages: eo(false),
    state_income_tax_withheld: eo(false),
    // ASSOCIATION EVIDENCE (6D.0c.3) — the employer's name, and the ONLY reason the
    // W-2 reader asks for it. Wages are business-relevant concepts, so eligibility
    // must be able to test whether this W-2 concerns the active business; the name
    // itself is never promoted into business intelligence.
    employer_name: eo(false, 'association evidence only — used to prove the employer relationship, never business intelligence'),
    // Declared so the omission is explicit, not accidental.
    employee_ssn: { disposition: 'SENSITIVE', note: 'never requested by the W-2 reader' },
    employer_ein: { disposition: 'SENSITIVE', note: 'never requested by the W-2 reader' },
  },
  k1: {
    ordinary_business_income: cf(true), guaranteed_payments: eo(true), distributions: eo(true),
    rental_royalty_income: eo(true), self_employment_earnings: eo(true),
    entity_name: eo(false, 'association evidence only — proves which entity the K-1 concerns, never business intelligence'),
    partner_ssn: { disposition: 'SENSITIVE', note: 'never requested by the K-1 reader' },
  },
  form_1099: {
    nonemployee_compensation: eo(true), interest_income: eo(true), ordinary_dividends: eo(true),
    qualified_dividends: eo(true), miscellaneous_income: eo(true),
    recipient_tin: { disposition: 'SENSITIVE', note: 'never requested by the 1099 reader' },
  },
  schedule_c: {
    gross_receipts: cf(true), total_expenses: eo(true), net_profit: cf(true), owner_compensation: cf(true),
    business_name: eo(false, 'association evidence only — the schedule must name this business before its concepts become its evidence'),
  },
  schedule_e: {
    rental_income: eo(true), total_expenses: eo(true), net_rental_income: eo(true), passive_income: eo(true),
  },
};

/** Subtype readers share their parent type's dispositions unless overridden. */
/**
 * Reader key → disposition table. The readers are keyed by FORM (form_1040,
 * form_1120s, form_1099_nec …) while the dispositions are keyed by what the
 * document IS, so every reader key must resolve. Without this, a form-keyed reader
 * looked up no disposition at all — which reads as "not eligible" and silently
 * degrades every field of that reader to nothing.
 */
const READER_KEY_ALIASES: Record<string, string> = {
  form_1040: 'personal_tax_return',
  form_1120: 'business_tax_return',
  form_1120s: 'business_tax_return_1120s',
  form_1065: 'business_tax_return_1065',
  form_1099_nec: 'form_1099',
  form_1099_int: 'form_1099',
  form_1099_div: 'form_1099',
  form_1099_misc: 'form_1099',
};

export function dispositionFor(readerKey: unknown, fieldName: unknown): FieldDisposition | null {
  const key = READER_KEY_ALIASES[String(readerKey || '')] || String(readerKey || '');
  const table = FIELD_DISPOSITIONS[key];
  if (!table) return null;
  return table[String(fieldName || '')] || null;
}

/**
 * BUSINESS ELIGIBILITY. A field may become business evidence only when a
 * disposition exists, it is not SENSITIVE, and it is declared business-relevant.
 * A personal return's AGI, withholding, refund or amount owed therefore never
 * becomes business evidence — even after the owner confirms the return may be
 * used for relevant business information.
 */
export function businessEligible(readerKey: unknown, fieldName: unknown): boolean {
  const d = dispositionFor(readerKey, fieldName);
  if (!d || d.disposition === 'SENSITIVE' || d.disposition === 'INTENTIONALLY_UNSUPPORTED') return false;
  return d.business_relevant === true;
}

export function isSensitiveField(readerKey: unknown, fieldName: unknown): boolean {
  return dispositionFor(readerKey, fieldName)?.disposition === 'SENSITIVE';
}

/**
 * ORPHAN AUDIT — every field a reader claims must have a disposition. `schemas`
 * is passed in so this module needs no import of the engine (no cycles), and the
 * certification harness feeds it the engine's live EXTRACTION_SCHEMAS.
 */
export function orphanFields(schemas: Record<string, { fields: Array<{ name: string }> }>): string[] {
  const orphans: string[] = [];
  for (const readerKey of Object.keys(schemas || {})) {
    for (const field of schemas[readerKey]?.fields || []) {
      // The SAME resolver the engine uses, aliases included: a reader that inherits
      // its parent's dispositions is not an orphan, and an audit that read the raw
      // table would report it as one.
      if (!dispositionFor(readerKey, field.name)) orphans.push(`${readerKey}.${field.name}`);
    }
  }
  return orphans;
}