# VISION — Phase 6D.0c.3: Tax Document Lifecycle Intelligence

Status: **release candidate, locally certified** (46/46 checks, 9/9 adversarial mutations caught).
Nothing was published. No Digital Twin fact was written. The production specimen
(2023 tax return, `Apex Roofing LLC`) was read only, never mutated.

---

## 1. The production failure this phase fixes

The owner uploaded a 2023 tax return and asked *"What was my W-2 for 2023"*.
VISION said it had nothing. The forensics (Phase 6D.0c.3 audit) found four
independent causes, all of them architectural rather than data:

| # | Cause | Effect on the owner |
|---|---|---|
| 1 | A compound tax PDF was flattened into one undifferentiated field set | A W-2 embedded on page 7 became anonymous rows |
| 2 | No W-2 reader existed | Even when recognized, wages were never requested |
| 3 | A question naming a FORM was resolved as an income METRIC | "W-2" was matched against concepts like revenue/income and failed |
| 4 | An unrelated pending document was attached to the answer | A Profit & Loss appeared as the source of a W-2 question |

Cause 4 was the most dangerous: it did not merely fail, it attached the wrong
document to the answer.

---

## 2. What was built

### 2.1 A tax document is a FAMILY of forms
`base44/shared/documentUnderstanding/taxForms.ts`
- `FORM_TYPES` — 1040, 1120, 1120-S, 1065, W-2, K-1, 1099, Schedule C, Schedule E,
  each with a parent document type, a reader key and a family.
- Two families never collapse: 1040 ≠ 1120-S ≠ 1065, even when all are `tax_return`
  in the older vocabulary.
- **Page provenance**: a field resolves to the page its form actually starts on
  (`resolveFieldSourcePage`), and with no signal the provenance is `unknown` —
  never an invented page 1.

### 2.2 Reader coverage is a contract, not an aspiration
`base44/shared/documentExtraction/taxSchemas.ts`
- `SUBTYPE_READERS`: 1120, 1120-S and 1065 are three honest, different contracts.
- A W-2 reader (wages, withholding, SS/Medicare wages) and an expanded 1040 reader
  (total tax, withholding, estimated payments, amount owed, refund — kept DISTINCT).
- Nothing is claimed readable that has no reader.

### 2.3 No orphan concepts
`base44/shared/documentExtraction/fieldDisposition.ts`
- Every reader field carries a disposition: `CANONICAL_FACT`, `EVIDENCE_ONLY`,
  `SENSITIVE` or `INTENTIONALLY_UNSUPPORTED`.
- W-2 wages and personal-return measures are `EVIDENCE_ONLY`: they inform an answer
  and never become a business fact.
- Identifiers (employee SSN, employer EIN, partner SSN, recipient TIN) are `SENSITIVE`.
- `orphanFields()` audits the live reader set — a schema field without a disposition
  cannot ship.

### 2.4 A form question is answered from that form
`base44/shared/galileo/answerEngine/formQuery.ts` + `pipeline.ts`
- `resolveFormQuery` recognises the owner's own words ("W-2", "1065", "1120-S",
  "what's in my tax return") and resolves the year.
- Four cases, all from persisted evidence: figures found · recognized with no figures
  yet · related form only (a 1040 exists, no W-2) · nothing on file.
- The result is an ordinary answer contract — same enforcement, same surfaces, same
  "no figure that was not extracted" guarantee.
- A form name is never silently read as an income metric.

### 2.5 ONE decision gates extraction — and Retry cannot skip it
`base44/shared/documentIngestion/confirmation.ts`, `classificationOverride.ts`
- When a recognized document's scope does not match the business, extraction waits.
  The durable layer records `scope_confirmation_required` in the analysis state
  (`documentUnderstanding/persist.ts`) and the worker reads the decision from the
  canonical analysis row (`documentIngestion/orchestration.ts`).
- The owner's choices are semantic, not flags: *use relevant business information* /
  *keep as personal document*.
- Choosing to use it does **not** re-scope the document: only the work owed changes.
  Only dispositions marked business-relevant may become business evidence.
- The same decision twice is the same decision (idempotent: no second resume).
- **Retry is structurally incapable of bypassing the gate**: the request router no
  longer imports an extraction engine at all. Retry re-enqueues the canonical
  durable pipeline, or tells the owner which decision is outstanding. The admin
  override path was extracted into the same shared family and hands off to the
  same `resumeIngestion`.

### 2.6 The answer no longer attaches an unrelated document
`base44/functions/askGalileo/entry.ts`
- The notice is now associated with the answer by the document that actually
  supported it — the `pendingDocIds[0]` ("most recent pending") fallback is gone.
  A W-2 answer can no longer cite a Profit & Loss.

### 2.7 The owner can resolve it, where the document lives
- `src/components/dataroom/DocumentScopeConfirmation.jsx` — one card, one decision,
  every word served by the backend review copy (`getDocumentReview`).
- `src/pages/DataRoom.jsx` — the card appears for documents awaiting a decision, and
  Retry surfaces a refusal as the decision it is instead of a silent no-op.
- `ClassificationReviewQueue.jsx` — rewired from a backend function that does not
  exist to the real canonical decision store, and its two controls are the two things
  that actually exist (accept the suggested folder / choose another).
- `stored_personal` is a real state in the Data Room: "kept as personal" is a
  decision, not a permanent "needs review".

---

## 3. Certification

`node scripts/taxDocumentIntelligence.test.cjs`

```
all 46 checks pass, 9/9 mutations caught
```

- **T1–T27** — family model, readers, dispositions, page provenance, form-question
  resolution, answer honesty (the W-2 figure answers; the P&L figure never does; a
  missing W-2 is said plainly; a recognized-but-unread form invents no figure;
  no figure appears that was not extracted).
- **T28–T35** — the decision: no internals on the owner surface, exactly two real
  choices, one durable resume, idempotency, personal stays personal, a denied actor
  writes nothing, Retry refuses while a decision is owed and re-enqueues after it.
- **S1–S9** — wiring: the router cannot extract; Retry delegates; the override path
  is one shared module; askGalileo passes the form inventory and has no unrelated-
  notice fallback; the owner can decide; classification reads the real store; no
  source file references the missing function.
- **M1–M9** — adversarial mutations applied to the real source and required to fail
  their probe (W-2 made unreadable · personal fields made business-eligible ·
  provenance invented · form name read as a metric · form branch bypassed ·
  *keep as personal* silently approved · Retry gate removed · document re-scoped on
  a use-it decision · identifiers stop being sensitive).

### Defects the harness found and fixed (all three were real)
1. A form contract could carry a `null` next step and crash the shared enforcement
   path.
2. `orphanFields()` reported false orphans for readers that inherit a parent's
   dispositions.
3. `READER_KEY_ALIASES` was empty, so form-keyed readers (`form_1040`, `form_1120s`,
   `form_1099_nec`, …) resolved **no** dispositions at all — silently degrading every
   field of those readers to "not eligible", including identifier protection.

---

## 4. Boundaries respected

- No extraction from any request handler; ingestion remains durable and event-driven.
- No business fact, snapshot or BIS write occurs anywhere in this phase.
- No authorization module was modified; the review action reuses the shared
  row-derived document-access decision.
- No re-scoping of documents by a confirmation.
- The production tax return was not modified, re-extracted or re-classified.

## 5. Deferred (not part of this phase)

- 1099/1099-NEC subtype readers beyond the shared 1099 contract.
- Schedule C/E field-level readers (dispositions declared; readers are evidence-only today).
- Promotion of a personal return's business-relevant figures into canonical facts
  (deliberately still human-reviewed through the existing extracted-field review).