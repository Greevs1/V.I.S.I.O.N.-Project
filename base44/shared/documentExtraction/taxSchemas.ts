/**
 * Phase 6D.0c.3 — TAX READER CONTRACTS.
 *
 * Reader coverage is declared here and merged into the ONE extraction engine
 * (extractEngine.EXTRACTION_SCHEMAS), so `isReadableDocumentType` and the
 * taxonomy's `reader_supported` stay derived from a single source.
 *
 * Two rules this file exists to keep:
 *
 *   1. DISTINCT SEMANTICS STAY DISTINCT. total_tax (a liability the return
 *      reports), federal_income_tax_withheld (what an employer withheld),
 *      estimated_tax_payments (what the owner sent in), amount_owed and refund
 *      (the settlement) are FIVE different things and are never conflated.
 *
 *   2. HONEST COVERAGE. Only fields the actual forms justify are requested. A
 *      form VISION can recognize but not read has no reader here, and says so.
 */

export type TaxFieldType = 'currency' | 'text' | 'percentage' | 'date' | 'number';

export interface TaxField { name: string; label: string; type: TaxFieldType }
export interface TaxSchema { fields: TaxField[] }

const f = (name: string, label: string, type: TaxFieldType = 'currency'): TaxField => ({ name, label, type });

/**
 * The entity name a business return states about ITSELF — the association evidence
 * every business-identity reader needs (6D.0c.3). Without it, "this 1120 mentions
 * gross receipts" could only be tied to a business by assumption.
 */
const ENTITY_NAME_FIELD = f('entity_name', 'Entity Name', 'text');

/** FORM 1040 — the common safe concepts a return itself reports. */
export const FORM_1040_FIELDS: TaxField[] = [
  f('adjusted_gross_income', 'Adjusted Gross Income'),
  f('taxable_income', 'Taxable Income'),
  f('total_tax', 'Total Tax'),
  f('federal_income_tax_withheld', 'Federal Income Tax Withheld'),
  f('estimated_tax_payments', 'Estimated Tax Payments'),
  f('amount_owed', 'Amount You Owe'),
  f('refund', 'Refund'),
  f('qualified_business_income', 'Qualified Business Income Deduction'),
  f('itemized_deductions', 'Itemized Deductions'),
];

/** FORM 1120 — a C corporation return. */
export const FORM_1120_FIELDS: TaxField[] = [
  ENTITY_NAME_FIELD,
  f('gross_receipts', 'Gross Receipts'),
  f('ordinary_business_income', 'Taxable Income Before NOL'),
  f('officer_compensation', 'Officer Compensation'),
  f('wages', 'Salaries and Wages'),
  f('deductions', 'Total Deductions'),
  f('taxable_income', 'Taxable Income'),
];

/** FORM 1120-S — an S corporation return (shareholder-relevant items). */
export const FORM_1120S_FIELDS: TaxField[] = [
  ENTITY_NAME_FIELD,
  f('gross_receipts', 'Gross Receipts'),
  f('ordinary_business_income', 'Ordinary Business Income'),
  f('officer_compensation', 'Officer Compensation'),
  f('wages', 'Salaries and Wages'),
  f('distributions', 'Shareholder Distributions'),
  f('deductions', 'Total Deductions'),
  f('taxable_income', 'Taxable Income'),
];

/** FORM 1065 — a partnership return. */
export const FORM_1065_FIELDS: TaxField[] = [
  ENTITY_NAME_FIELD,
  f('gross_receipts', 'Gross Receipts'),
  f('ordinary_business_income', 'Ordinary Business Income'),
  f('guaranteed_payments', 'Guaranteed Payments to Partners'),
  f('distributions', 'Partner Distributions'),
  f('self_employment_earnings', 'Self-Employment Earnings'),
  f('deductions', 'Total Deductions'),
  f('taxable_income', 'Taxable Income'),
];

/**
 * W-2 — safe figures only. The employer/employee IDENTIFIERS (SSN, EIN, control
 * number, address) are deliberately NOT requested: they are not needed to answer
 * the owner's questions, so they never enter extraction, and the shared
 * sensitive-field predicate would exclude them anyway.
 */
export const W2_FIELDS: TaxField[] = [
  f('wages_tips_other_compensation', 'Wages, Tips, Other Compensation'),
  f('federal_income_tax_withheld', 'Federal Income Tax Withheld'),
  f('social_security_wages', 'Social Security Wages'),
  f('medicare_wages', 'Medicare Wages'),
  f('state_wages', 'State Wages'),
  f('state_income_tax_withheld', 'State Income Tax Withheld'),
  // ASSOCIATION EVIDENCE (6D.0c.3). The employer's NAME is requested for exactly
  // one reason: eligibility must be able to test whether this W-2 concerns the
  // active business. It is never business intelligence and never a personal
  // figure. The IDENTIFIERS (employee SSN, employer EIN) remain unrequested.
  f('employer_name', 'Employer Name', 'text'),
];

/** SCHEDULE K-1 — the pass-through items a partner/shareholder is told about. */
export const K1_FIELDS: TaxField[] = [
  f('ordinary_business_income', 'Ordinary Business Income'),
  f('guaranteed_payments', 'Guaranteed Payments'),
  f('distributions', 'Distributions'),
  f('rental_royalty_income', 'Rental / Royalty Income'),
  f('self_employment_earnings', 'Self-Employment Earnings'),
  // ASSOCIATION EVIDENCE (6D.0c.3) — the entity the K-1 concerns, so eligibility can
  // test the relationship. Never promoted, never business intelligence.
  f('entity_name', 'Entity Name', 'text'),
];

/** 1099 family — the safe income figures across 1099-NEC/INT/DIV/MISC. */
export const FORM_1099_FIELDS: TaxField[] = [
  f('nonemployee_compensation', 'Nonemployee Compensation'),
  f('interest_income', 'Interest Income'),
  f('ordinary_dividends', 'Ordinary Dividends'),
  f('qualified_dividends', 'Qualified Dividends'),
  f('miscellaneous_income', 'Other Income'),
];

/** SCHEDULE C — sole-proprietor business activity on a personal return. */
export const SCHEDULE_C_FIELDS: TaxField[] = [
  f('gross_receipts', 'Gross Receipts'),
  f('total_expenses', 'Total Expenses'),
  f('net_profit', 'Net Profit'),
  f('owner_compensation', 'Owner Draw / Compensation'),
  // ASSOCIATION EVIDENCE (6D.0c.3) — the business name the schedule states. A
  // Schedule C's business concepts are highly relevant, but their association to
  // the active business follows THIS evidence, never the fact that a business was
  // selected when the return was uploaded.
  f('business_name', 'Business Name', 'text'),
];

/** SCHEDULE E — rental, royalty and pass-through activity. */
export const SCHEDULE_E_FIELDS: TaxField[] = [
  f('rental_income', 'Rents Received'),
  f('total_expenses', 'Total Expenses'),
  f('net_rental_income', 'Net Rental Income'),
  f('passive_income', 'Passive Income'),
];

/**
 * SUBTYPE-AWARE CONTRACTS. 1120, 1120-S and 1065 are materially different
 * returns, so each is its own contract instead of pretending one reader fits all.
 * The generic `business_tax_return` reader remains the fallback for a business
 * return whose subtype the classifier could not determine.
 */
export const SUBTYPE_READERS: Record<string, TaxSchema> = {
  form_1120: { fields: FORM_1120_FIELDS },
  form_1120s: { fields: FORM_1120S_FIELDS },
  form_1065: { fields: FORM_1065_FIELDS },
  form_1040: { fields: FORM_1040_FIELDS },
  w2: { fields: W2_FIELDS },
  k1: { fields: K1_FIELDS },
  form_1099: { fields: FORM_1099_FIELDS },
  form_1099_nec: { fields: FORM_1099_FIELDS },
  form_1099_int: { fields: FORM_1099_FIELDS },
  form_1099_div: { fields: FORM_1099_FIELDS },
  form_1099_misc: { fields: FORM_1099_FIELDS },
  schedule_c: { fields: SCHEDULE_C_FIELDS },
  schedule_e: { fields: SCHEDULE_E_FIELDS },
};

/** The fields of the reader that owns a form section (by section form_type). */
export function fieldsForForm(formType: unknown): TaxField[] {
  return SUBTYPE_READERS[String(formType || '')]?.fields || [];
}

/**
 * The DISPOSITION reader key that owns a form's fields. A 1120-S and a 1065 have
 * materially different concepts, so they are accounted for separately rather than
 * under one generic "business return" bucket.
 */
const DISPOSITION_READER_KEY: Record<string, string> = {
  form_1120: 'business_tax_return',
  form_1120s: 'business_tax_return_1120s',
  form_1065: 'business_tax_return_1065',
  form_1040: 'personal_tax_return',
};

export function readerKeyForFormField(formType: unknown, _fieldName?: unknown): string {
  const ft = String(formType || '');
  return DISPOSITION_READER_KEY[ft] || ft;
}

/**
 * COMPOSITE READER SCHEMA — one provider call for a multi-form tax document.
 *
 * Each recognized form section becomes a named group, so a figure can never be
 * attributed to the wrong form. Response shape:
 *   { "form_1040": {"taxable_income": …}, "w2": {"wages_tips_other_compensation": …} }
 */
export function buildTaxDocumentSchema(formTypes: unknown[]): { type: 'object'; properties: Record<string, any> } | null {
  const groups = [...new Set((formTypes || []).map((t) => String(t || '')).filter((t) => fieldsForForm(t).length))];
  if (!groups.length) return null;
  const properties: Record<string, any> = {};
  for (const g of groups) {
    const props: Record<string, any> = {};
    for (const field of fieldsForForm(g)) {
      props[field.name] = field.type === 'currency'
        ? { type: ['number', 'string', 'null'], description: `${field.label} — the figure the form states, exactly as printed. Null if the form does not state it.` }
        : { type: ['string', 'number', 'null'], description: `${field.label} — null if the form does not state it.` };
    }
    properties[g] = { type: 'object', properties: props };
  }
  properties.reporting_period = { type: ['string', 'null'], description: 'The tax year or period the document states for this filing, e.g. "2023".' };
  return { type: 'object', properties };
}

/**
 * FLATTEN a composite response into per-form facts. Field names are unique across
 * these readers, so a flat fact map stays unambiguous — while the form each field
 * belongs to is preserved alongside it.
 */
export function flattenTaxDocumentOutput(raw: any): {
  facts: Record<string, any>;
  fieldForm: Record<string, string>;
} {
  const facts: Record<string, any> = {};
  const fieldForm: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') return { facts, fieldForm };
  for (const formType of Object.keys(SUBTYPE_READERS)) {
    const group = raw[formType];
    if (!group || typeof group !== 'object') continue;
    for (const field of fieldsForForm(formType)) {
      const v = group[field.name];
      if (v === undefined || v === null || v === '') continue;
      if (facts[field.name] === undefined) {
        facts[field.name] = v;
        fieldForm[field.name] = formType;
      }
    }
  }
  return { facts, fieldForm };
}