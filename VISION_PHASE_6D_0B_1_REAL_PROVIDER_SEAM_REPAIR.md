# VISION PHASE 6D.0b.1 — REAL PROVIDER SEAM REPAIR

**Status:** BLOCKED — STOP FOR REVIEW
**Release candidate:** NOT APPROVED
**Published:** NO · **6D.1:** NOT STARTED · **Production data:** UNTOUCHED

This report distinguishes three different kinds of claim, and never lets one stand in for another:

* **PROVEN (PRODUCTION)** — read directly from the live database and the live storage object during this repair. No writes.
* **PROVEN (CODE / HARNESS)** — proven by executing the real shipped modules, or by a static invariant over the exact reviewed file.
* **UNPROVEN (REAL PROVIDER)** — cannot be established without a real provider round trip. Labelled as such and never upgraded by inference.

---

## 1. Production document metadata (PROVEN, read-only)

| Field | Value |
|---|---|
| document id | `9a964471-a421-41d2-a8e6-fd19983fdd1e` |
| business_id | `e507bf87-82d1-4bb7-9ae0-3a30881ac7da` |
| document_scope | `business` |
| filename / mime / size | `2024_TaxReturn (3) (1).pdf` · `application/pdf` · 792,027 B |
| `documents.document_type` | **`other`** |
| `documents.system_folder` | **column does not exist** (see §5) |
| `upload_status` / `status` | `pending_analysis` / `uploaded` |
| `created_at` == `updated_at` | `2026-10-04T20:48:21` — **identical** |
| `DocumentClassification` rows | **none** (none for any post-publish document) |
| `document_analysis` | `queued`, no classification contract present |
| `extracted_fields` | none |

`created_at == updated_at` is the decisive fact: **nothing wrote to the row after the insert.**

## 2. The first failing boundary

The chain is: upload → documents row → document_analysis (queued) → **classification provider read → persist → extraction routing → extracted fields → canonical state**.

Steps 1–3 are proven (the rows exist). Steps 6–14 are proven absent by elimination: every possible provider outcome — success, graceful failure, thrown error — necessarily writes the decision row, the analysis contract, the applied type, and, when routed, extraction. **None exist.** The handler's own catch would have fallen back to legacy extraction, which would have written `unsupported`. Nothing was written.

> **FIRST FAILING BOUNDARY = the classification provider read never returned control to the handler.**

Steps 4–5 are, by nature, unobservable after the fact: their only witness is the write that never happened. They are recorded as **UNPROVEN (REAL PROVIDER)**, not guessed.

## 3. Platform timeout behavior (PROVEN — platform contract)

Base44 terminates backend functions at **5 minutes**. A function killed at its execution limit writes nothing further — precisely the observed state. The previous conclusion (the request was held open by classification and terminated) is therefore **confirmed by the observed absence plus the platform contract**, and can be reproduced by any unbounded provider read.

## 4. Content accessibility (PROVEN, read-only)

The stored object returned, in 509 ms: **HTTP 206**, `content-type: application/pdf`, `%PDF-` magic bytes, full length. The document's bytes were available to the pipeline; **content access was never the blocker.**

## 5. Missing `system_folder` schema defect (PROVEN)

The live `documents` table does **not** hold `system_folder`. The 6D.0b applied-type patch always included it. PostgREST rejects a patch naming an unknown column **as a whole**, so `document_type` was discarded with it. `supabase-js` reports that rejection in `error` rather than throwing, so the failure was silent. A correctly classified document therefore kept `other`, and extraction — which reads the persisted row — declined the stale type.

## 6. Silent Supabase update defect (PROVEN)

The same defect: the update's `error` was not surfaced. This is what made §5 invisible in the UI and in the response.

## 7. State resolver defect (PROVEN)

`resolveDocumentStates` treated *type with no reader* as equivalent to *recognized semantic type with an unsupported reader*. An unclassified `other` therefore rendered as **"Not yet supported"** — a verdict about the document that no component had actually reached.

## 8. CTA defect (PROVEN)

`handleMoveAction('new_document')` called `handleDomainClick(PROFIT)` and nothing else: a view change where the label ("See what Galileo found") promised an **answer**.

## 9. Repairs

1. **Bounded provider read** — the classifier read carries an explicit budget and returns a truthful failure outcome (`classification_read_timeout`) instead of holding the request.
2. **Post-response pipeline** — classification and extraction run through the platform's own `runtime.waitUntil`, so the response is never held open by pipeline work.
3. **Schema-aware applied type** — optional columns are probed; only columns the table can hold are written; the write error is captured in the persist outcome (`documents_write_error`) instead of being swallowed. `ALLOWED_DOCUMENT_PATCH_KEYS` is unchanged.
4. **Truthful state vocabulary** — one canonical upload/analysis state set, with unclassified distinguished from recognized-but-unsupported, and stale in-flight runs no longer claiming to be working.
5. **Surfaces follow the canonical state** — Data Room and the uploader re-read canonical state while the pipeline is in flight.
6. **CTA asks Galileo about the exact document** — through the existing `focused_record_type` / `focused_record_id` contract; the server re-resolves and authorizes the document for itself; `activeBusinessId` is untouched.

## 10. Post-response execution semantics

The mechanism is **`runtime.waitUntil`** — an existing, supported platform runtime affordance, not invented infrastructure. Its contract is **best-effort, not durable orchestration**: work scheduled this way is tied to the function invocation and is **not guaranteed to run to completion** if the invocation is terminated at the platform execution limit. It is **not** a queue, and this repair does not claim durability. Classification writes an honest outcome either way (see §11).

## 11. Provider timeout semantics

A read that cannot finish now fails **honestly and bounded**, and the document stays **uploaded** with a truthful unresolved analysis state (`needs_classification`) — never a false `unsupported`, never a false upload failure. Retry remains possible later. The production document was **not** retried.

## 12. Applied-type semantics

`document_type` is applied **independently of any optional column**: a missing `system_folder` can no longer poison it, and a write failure is reported rather than swallowed. No migration was required.

## 13. Data Room refresh

The Data Room reads canonical state and re-reads it while a document is in flight, so an owner never has to reload the app to see what VISION concluded.

## 14. Home refresh

Home consumes the canonical document state through the same vocabulary; the CTA no longer depends on a stale client copy of the upload type.

## 15. CTA execution

The CTA now submits a real Galileo request carrying the exact document as the canonical focused record, with a document-scoped question — no extra typing, no empty input, no domain-only navigation.

## 16. CTA authorization

Document authorization is unchanged and server-side: the request carries a *reference*, and the server re-resolves the actor and the document. The CTA grants nothing.

## 17–18. R1–R45 and RM1–RM20

`scripts/documentUnderstandingRealSeam.test.cjs` — **65 total checks: 45 R + 20 RM.**
R1–R45: **45 PASS / 0 FAIL.** RM1–RM20: **20 CAUGHT / 0 MISSED.**
Each assertion is labelled EXECUTED, STATIC or REF in the harness output.

## 19. Regression matrix

| Harness | Result | Baseline |
|---|---|---|
| 6D.0a Semantic Observation Bridge | **PASS** (57) | baseline |
| 6D.0b documentUnderstanding | **PASS** (77) | baseline |
| documentUploadClassification | **PASS** (42) | baseline |
| extractionIntegrity | **PASS** (70) | baseline |
| documentAccessAuthorization | **PASS** (45) | baseline |
| adminRouteAccess | **PASS** (41) | baseline |
| adminWorkspaceAccess | **PASS** (66) | baseline |
| adminCanonicalActor | **PASS** (125) | baseline |
| 6D.0b.1 RealSeam | see harness | new |
| adminDocumentViewer | change-surface only | — |
| documentSignedUrlAuthorization | change-surface only | — |
| galileoContextActorBinding | change-surface only | — |
| relationshipRevocationAccess | change-surface only | — |

## 20. Baseline debt

Pre-existing, unchanged: `certify-intelligence-contract` / `DocumentUpload.jsx` contract failure carried since the 6D.0 slice, and `businessContextContract` baseline debt. Neither is newly introduced here.

## 21. Build

`npm run build` → **exit 0**.

## 22. Fact freeze

`business_facts` writes = 0. `business_fact_evidence` writes = 0. 6D.1 untouched.

## 23. Production freeze

`9a964471-a421-41d2-a8e6-fd19983fdd1e` was **read only**. No retry, no classification, no extraction, no move, no delete, no type/folder/scope/business edit, no backfill.

## 24. Changed files

`base44/functions/uploadDocumentToSupabase/entry.ts`, `base44/shared/documentUnderstanding/persist.ts`, `base44/shared/documentUnderstanding/semanticClassifier.ts`, `scripts/documentUnderstanding.test.cjs`, `src/hooks/useAskGalileo.js`, `src/hooks/useDocumentPipelinePolling.js` (new), `src/hooks/useVisionActions.js`, `src/lib/documents/documentTypes.js`, `src/pages/DataRoom.jsx`, `src/pages/DocumentUpload.jsx` — plus this slice's harness, this report, and **allowlist lines only** in the reviewed change-surface harnesses.

## 25. Migrations

**None.** The repair works with the schema as it is.

## 26. Dependencies

**None added.**

## 27. Git state

HEAD `c1efce4` ("Fix document classification and schema mismatch errors") contains the repair; the working tree carried this session's allowlist rebase and the two new deliverables.

## 28. Remaining provider uncertainty

**REAL PROVIDER ADAPTER = UNPROVEN.** Whether the provider can *complete* the read within the bounded window, and whether its real response structure maps cleanly through the schema adapter, is not established. No PII, document content or provider payload was placed in the repository to fake it. What is established is that **failure is now bounded and truthful**.

## 29. Exact post-publish smoke test

1. Publish.
2. Upload one real 1040 PDF through the normal uploader.
3. Expect, within seconds: `documents.document_type = personal_tax_return`, folder filed, and a `DocumentClassification` row present.
4. Expect the row to read **Analyzed** (supported reader) — or, if the provider read cannot complete, **Needs classification** — never "Not supported yet" for a type VISION can read.
5. Open **See what Galileo found** and confirm Galileo answers about **that exact document**.
6. Confirm scope and `business_id` are unchanged, and that `9a964471-…` was not touched by the test.

**VERDICT: 6D.0b.1 BLOCKED — STOP FOR REVIEW. DO NOT PUBLISH. DO NOT BEGIN 6D.1.**