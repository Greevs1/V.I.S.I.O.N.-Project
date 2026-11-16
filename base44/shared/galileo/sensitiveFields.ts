/**
 * Phase 6D.0c.2 — THE ONE SENSITIVE-FIELD PREDICATE (shared).
 *
 * Production carried TWO copies of this rule — one in the provisional lane and one
 * in the focused-document projection — and both matched identifiers as SUBSTRINGS.
 * "EIN" therefore matched inside "taxabl-EIN-come", so TAXABLE INCOME was silently
 * dropped from every evidence lane while a real SSN was excluded for an
 * accidental reason. A rule that decides what may reach a model must exist ONCE,
 * and it must decide on MEANING, not on character coincidence.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────────
 * A field whose name is recognizably an IDENTIFIER is never carried into model
 * context or evidence, whatever its value:
 *
 *   SSN · social_security_number · EIN · employer_identification_number ·
 *   taxpayer_identification_number (and the other identifiers listed below)
 *
 * A field that names an ordinary financial CONCEPT is eligible:
 *
 *   taxable_income · net_income · ordinary_business_income · business_income ·
 *   income_tax · tax_expense
 *
 * ── HOW ──────────────────────────────────────────────────────────────────────
 * Field names are normalized (camelCase split, lowercased, punctuation dropped)
 * and checked along TWO axes:
 *
 *   · SHORT identifiers (ssn, tin, ein, itin, dob) match only as WHOLE TOKENS —
 *     as substrings they hit ordinary words ("taxabl-ein-come");
 *   · LONG identifiers (socialsecuritynumber, taxpayeridentificationnumber,
 *     employeridentificationnumber, …) match as normalized phrases, which is what
 *     makes underscored, spaced, hyphenated and camelCase spellings agree.
 *
 * Callers import this function; the file is the ONLY place the list lives.
 *
 * NOTE — keep this file free of imports and of multi-line declarations: the
 * offline harnesses compile its REAL source and execute it.
 */

/** The identifiers. ONE list, imported by every lane that decides what is PII. */
export const PII_FIELD_DENYLIST = [
  'ssn', 'socialsecuritynumber', 'socialsecurity', 'tin', 'taxpayerid', 'taxpayeridentificationnumber',
  'employeridentificationnumber', 'employerid',
  'ein', 'itin', 'bankaccountnumber', 'accountnumber', 'routingnumber',
  'dependentssn', 'spousessn', 'passportnumber', 'driverlicense', 'dateofbirth', 'dob',
];

/** Identifiers short enough that matching them as substrings would be a false positive. */
export const SENSITIVE_FIELD_TOKENS = PII_FIELD_DENYLIST.filter((d) => d.length <= 4);

/** The remaining identifiers, matched as normalized phrases. */
export const SENSITIVE_FIELD_PHRASES = PII_FIELD_DENYLIST.filter((d) => d.length > 4);

export function isSensitiveFieldName(name: any) {
  if (!name) return false;
  const raw = String(name).replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
  const n = raw.replace(/[^a-z0-9]/g, '');
  if (!n) return false;
  const tokens = raw.split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.some((t) => SENSITIVE_FIELD_TOKENS.includes(t))) return true;
  return SENSITIVE_FIELD_PHRASES.some((d) => n.includes(d));
}