/**
 * Phase 6D.0c.3 — EVIDENCE ELIGIBILITY (automatic relevant-evidence use).
 *
 * THE PRODUCT DECISION THIS MODULE IMPLEMENTS (it SUPERSEDES the earlier
 * scope-confirmation UX):
 *
 *   VISION automatically extracts every uploaded document and automatically uses
 *   the evidence that is legitimately relevant to the active business. Document
 *   identity and evidence eligibility remain SEPARATE questions. No user
 *   confirmation is required merely because a personal document was uploaded in
 *   business context.
 *
 *   EXTRACTION  answers "what is in the document?"        → never gated by scope
 *   ELIGIBILITY answers "what may VISION use for THIS business?"
 *
 * FOUR STATES — the minimum vocabulary, and the only one this product uses:
 *
 *   BUSINESS_RELEVANT  a business-relevant concept AND the DOCUMENT's own evidence
 *                      supports its relationship to the active business
 *   PERSONAL_ONLY      a real concept that is not about this business. Document
 *                      evidence at most; never business intelligence.
 *   SENSITIVE          an identifier. Never extracted, never persisted for display,
 *                      never placed in model context.
 *   AMBIGUOUS          cannot safely be associated with the active business. It is
 *                      NOT promoted into business intelligence — neither silently
 *                      nor by a later confirmation, because there is none.
 *
 * ── THE SECURITY RULE, EXECUTED RATHER THAN DESCRIBED ────────────────────────
 *
 * "Uploaded while <business> was active" is NOT proof that a figure belongs to it.
 * The ACTIVE BUSINESS PROVIDES CONTEXT; the DOCUMENT must still support the
 * relationship. Association is therefore supported ONLY by evidence the document
 * itself carries:
 *
 *   · a name the FORM states (employer, entity, business) that matches the active
 *     business; or
 *   · the classifier's own DOCUMENT-DERIVED suggestion of this business (read from
 *     the persisted classification contract).
 *
 * A `document_scope` or a `business_id` alone NEVER qualifies — that is exactly
 * the "uploaded in business context" assumption this policy forbids. When the
 * relationship cannot be established the figure is retained as document evidence
 * and excluded from business-specific understanding.
 *
 * It imports only the disposition table (a pure module), so the offline harness can
 * bundle it directly and mutate the real source.
 */

import { dispositionFor, isSensitiveField } from './fieldDisposition.ts';

export const ELIGIBILITY_VERSION = '6d.0c.3';

export const ELIGIBILITY_STATES = {
  BUSINESS_RELEVANT: 'BUSINESS_RELEVANT',
  PERSONAL_ONLY: 'PERSONAL_ONLY',
  SENSITIVE: 'SENSITIVE',
  AMBIGUOUS: 'AMBIGUOUS',
} as const;

export type EligibilityState = (typeof ELIGIBILITY_STATES)[keyof typeof ELIGIBILITY_STATES];

/** The ONE state that may become business evidence. */
export const BUSINESS_ELIGIBLE_STATE: EligibilityState = ELIGIBILITY_STATES.BUSINESS_RELEVANT;

export function isBusinessEligible(verdict: any): boolean {
  return String(verdict?.state || '') === BUSINESS_ELIGIBLE_STATE;
}

/**
 * IDENTITY FIELDS THAT EXIST ONLY TO PROVE ASSOCIATION. A form's own name for the
 * party it concerns is not business intelligence and not personal data — it is the
 * evidence that lets eligibility decide. It is therefore never promoted, and its
 * absence is what makes a W-2's wages AMBIGUOUS rather than assumed.
 *
 * Keyed by FORM type; the disposition reader key is accepted as well, because a
 * reader can be addressed by either.
 */
/**
 * THE ONE PROVENANCE A CLASSIFIER SUGGESTION MAY HAVE. Anything else — the active
 * context, the request payload, the UI selection, the profile's primary business, an
 * earlier conversation, another document — is REFUSED by `resolveAssociation`, so a
 * caller cannot manufacture an association by echoing the active business id back.
 */
export const DOCUMENT_CONTENT_SOURCE = 'document_content';

export const ASSOCIATION_EVIDENCE_FIELDS: Record<string, string[]> = {
  w2: ['employer_name'],
  k1: ['entity_name'],
  schedule_c: ['business_name'],
  form_1120: ['entity_name'],
  form_1120s: ['entity_name'],
  form_1065: ['entity_name'],
  business_tax_return: ['entity_name'],
  business_tax_return_1120s: ['entity_name'],
  business_tax_return_1065: ['entity_name'],
};

export function isAssociationEvidenceField(formOrReaderKey: unknown, fieldName: unknown): boolean {
  const fields = ASSOCIATION_EVIDENCE_FIELDS[String(formOrReaderKey || '')];
  if (!fields) return false;
  return fields.includes(String(fieldName || ''));
}

// ── Entity-name matching ─────────────────────────────────────────────────────
// Conservative by construction: a match must be a real name relationship, never a
// shared word. "Apex Roofing LLC" matches "Apex Roofing" and "Apex Roofing, LLC";
// it does not match "Apex Capital" or "Summit Roofing".

const LEGAL_TOKENS = new Set([
  'llc', 'llp', 'lp', 'inc', 'incorporated', 'corp', 'corporation', 'co', 'company',
  'ltd', 'limited', 'pllc', 'pc', 'pa', 'plc', 'dba', 'the', 'and', 'trust',
]);

export function normalizeEntityName(name: unknown): string {
  return String(name ?? '')
    .toLowerCase()
    // DOTTED LEGAL FORMS FIRST. "Apex Roofing L.L.C." must normalize to the same name
    // as "Apex Roofing LLC" — with the dots removed first, the suffix collapses into
    // the token "llc" (a legal token) instead of surviving as the single letters
    // "l l c", which no legal-token filter would ever drop.
    .replace(/\./g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !LEGAL_TOKENS.has(t))
    .join(' ')
    .trim();
}

export function entityNameTokens(name: unknown): string[] {
  return normalizeEntityName(name).split(' ').filter((t) => t.length >= 3);
}

/** A name relationship the document actually supports. */
export function entityNamesMatch(a: unknown, b: unknown): boolean {
  const na = normalizeEntityName(a);
  const nb = normalizeEntityName(b);
  if (!na || !nb) return false;
  // NORMALIZED EQUALITY, AND NOTHING WEAKER. Legal forms and punctuation have already
  // been removed, so "Apex Roofing LLC", "Apex Roofing", "APEX ROOFING, LLC" and
  // "Apex Roofing L.L.C." all normalize to the same name — while a name that merely
  // CONTAINS this one does not: "Apex Roofing & Construction LLC" and "Apex Roofing
  // Services LLC" normalize to "apex roofing construction"/"apex roofing services".
  // Containment is exactly the fuzziness that must never establish association: an
  // uncertain relationship is AMBIGUOUS and the figure stays document evidence.
  return na === nb;
}

// ── Association ──────────────────────────────────────────────────────────────

export interface AssociationInput {
  businessId?: string | null;
  /** The active business's own name. Null when it could not be read. */
  businessName?: string | null;
  /** Names the DOCUMENT states about itself (employer, entity, business). */
  identityNames?: Array<string | null | undefined>;
  /** The classifier's DOCUMENT-DERIVED suggestion, from the persisted contract. */
  classificationSuggestedBusinessId?: string | null;
  /** Where that suggestion came from. Only DOCUMENT_CONTENT_SOURCE is honoured. */
  classificationSuggestionSource?: string | null;
}

export interface AssociationVerdict {
  supported: boolean;
  reason: string;
  evidence: string[];
  names: string[];
  active_business_name: string | null;
}

/**
 * THE RELATIONSHIP TEST. Both accepted bases come from the document's own content;
 * neither of them is "a business was selected".
 */
export function resolveAssociation(input: AssociationInput): AssociationVerdict {
  const names = (Array.isArray(input?.identityNames) ? input.identityNames : [])
    .map((n) => (typeof n === 'string' ? n.trim() : ''))
    .filter(Boolean);
  const activeName = input?.businessName ? String(input.businessName) : null;
  const evidence: string[] = [];

  if (activeName) {
    for (const name of names) {
      if (entityNamesMatch(name, activeName)) {
        evidence.push(`the document states "${name}", which is ${activeName}`);
      }
    }
  }
  if (evidence.length > 0) {
    return { supported: true, reason: 'document_names_the_business', evidence, names, active_business_name: activeName };
  }

  const suggested = input?.classificationSuggestedBusinessId ? String(input.classificationSuggestedBusinessId) : null;
  // PROVENANCE BOUNDARY. The classifier's suggestion is honoured ONLY when the caller
  // declares that it came from reading the DOCUMENT. A business id that arrived from
  // the active context, the request payload, the UI selection, the profile's primary
  // business, an earlier conversation or another document is not evidence of anything
  // and can never manufacture an association.
  const suggestionSource = String(input?.classificationSuggestionSource || '');
  if (
    suggested
    && suggestionSource === DOCUMENT_CONTENT_SOURCE
    && input?.businessId
    && suggested === String(input.businessId)
  ) {
    return {
      supported: true,
      reason: 'document_content_identified_this_business',
      evidence: ['reading the document itself identified this business'],
      names,
      active_business_name: activeName,
    };
  }

  return {
    supported: false,
    reason: names.length > 0 ? 'document_names_a_different_party' : 'no_relationship_evidence_in_the_document',
    evidence,
    names,
    active_business_name: activeName,
  };
}

// ── Per-field eligibility ────────────────────────────────────────────────────

export interface EligibilityVerdict {
  state: EligibilityState;
  reason: string;
  business_relevant_concept: boolean;
  association_supported: boolean;
  disposition: string | null;
}

/**
 * THE FIELD-LEVEL CLASSIFICATION. `formType` is the FORM whose section produced the
 * field; `readerKey` is its disposition reader key (they are not always the same
 * string — a form-keyed reader resolves its table through the shared alias map).
 */
export function resolveEvidenceEligibility(input: {
  readerKey?: unknown;
  formType?: unknown;
  fieldName?: unknown;
  association?: AssociationVerdict | null;
}): EligibilityVerdict {
  const readerKey = input?.readerKey ?? input?.formType ?? null;
  const fieldName = input?.fieldName ?? null;
  const associationSupported = !!(input?.association && input.association.supported);

  // 1. SENSITIVE FIRST. An identifier is never anything else, whatever the form,
  //    the scope or the relationship says.
  if (isSensitiveField(readerKey, fieldName)) {
    return {
      state: ELIGIBILITY_STATES.SENSITIVE,
      reason: 'identifier_never_used',
      business_relevant_concept: false,
      association_supported: false,
      disposition: 'SENSITIVE',
    };
  }

  // 2. ASSOCIATION EVIDENCE. Identity that exists to prove the relationship: never
  //    business intelligence, and never personal data either.
  if (isAssociationEvidenceField(input?.formType, fieldName) || isAssociationEvidenceField(readerKey, fieldName)) {
    return {
      state: ELIGIBILITY_STATES.AMBIGUOUS,
      reason: 'association_evidence_only',
      business_relevant_concept: false,
      association_supported: associationSupported,
      disposition: dispositionFor(readerKey, fieldName)?.disposition ?? null,
    };
  }

  const d = dispositionFor(readerKey, fieldName);

  // 3. NO DECLARED DISPOSITION — the concept is unknown to the disposition table, so
  //    nothing may be assumed about it.
  if (!d) {
    return {
      state: ELIGIBILITY_STATES.AMBIGUOUS,
      reason: 'no_declared_disposition',
      business_relevant_concept: false,
      association_supported: associationSupported,
      disposition: null,
    };
  }

  if (d.disposition === 'SENSITIVE') {
    return {
      state: ELIGIBILITY_STATES.SENSITIVE,
      reason: 'identifier_never_used',
      business_relevant_concept: false,
      association_supported: false,
      disposition: 'SENSITIVE',
    };
  }

  if (d.disposition === 'INTENTIONALLY_UNSUPPORTED') {
    return {
      state: ELIGIBILITY_STATES.PERSONAL_ONLY,
      reason: d.note || 'concept_not_read',
      business_relevant_concept: false,
      association_supported: associationSupported,
      disposition: d.disposition,
    };
  }

  // 4. A CONCEPT THAT IS NOT ABOUT THE BUSINESS stays personal document evidence.
  //    A personal return's AGI, tax, withholding and refund are here: they are real
  //    and they are the owner's, and they never become this business's figures.
  if (d.business_relevant !== true) {
    return {
      state: ELIGIBILITY_STATES.PERSONAL_ONLY,
      reason: d.note || 'not_about_this_business',
      business_relevant_concept: false,
      association_supported: associationSupported,
      disposition: d.disposition,
    };
  }

  // 5. A BUSINESS-RELEVANT CONCEPT — eligible only when the DOCUMENT supports its
  //    relationship to this business. This is where "the active business alone is
  //    insufficient" is enforced.
  if (associationSupported) {
    return {
      state: ELIGIBILITY_STATES.BUSINESS_RELEVANT,
      reason: 'business_relevant_and_relationship_supported',
      business_relevant_concept: true,
      association_supported: true,
      disposition: d.disposition,
    };
  }

  return {
    state: ELIGIBILITY_STATES.AMBIGUOUS,
    reason: 'relationship_not_established',
    business_relevant_concept: true,
    association_supported: false,
    disposition: d.disposition,
  };
}

/** The owner-facing words for an un-associated finding. It is a statement, not a question. */
export function ambiguousRelationshipNote(businessName?: string | null): string {
  return businessName
    ? `I found this in your tax return, but I can't confidently tie it to ${businessName}.`
    : "I found this in your tax return, but I can't confidently tie it to this business.";
}

/** The run-level summary persisted on the analysis row — counts only, never values. */
export function summarizeEligibility(fields: Array<{ eligibility?: any }>): Record<string, any> {
  const counts: Record<string, number> = {
    BUSINESS_RELEVANT: 0, PERSONAL_ONLY: 0, SENSITIVE: 0, AMBIGUOUS: 0,
  };
  let associationSupported = false;
  for (const f of Array.isArray(fields) ? fields : []) {
    const state = String(f?.eligibility?.state || '');
    if (state in counts) counts[state] += 1;
    if (f?.eligibility?.association_supported) associationSupported = true;
  }
  return {
    field_counts: counts,
    business_eligible_count: counts.BUSINESS_RELEVANT,
    retained_as_document_evidence_count: counts.PERSONAL_ONLY + counts.AMBIGUOUS,
    association_supported: associationSupported,
  };
}