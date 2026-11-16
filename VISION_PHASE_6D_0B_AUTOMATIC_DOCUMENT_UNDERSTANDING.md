# VISION PHASE 6D.0b — AUTOMATIC DOCUMENT UNDERSTANDING + INGESTION ORCHESTRATION

**Commit under work:** `24f1847` (HEAD, clean at start)
**Slice:** 6D.0b only. 6D.1, `business_facts`, historical remediation and publication are **out of scope and untouched**.
**Status:** release candidate for review. **NOT PUBLISHED. STOP FOR REVIEW.**

---

## 1. HEAD RE-AUDIT (Phase 0, re-run)

| # | Surface | Finding |
|---|---|---|
| 1 | `uploadDocumentToSupabase` | base64 bytes + MIME + file name + declared type enter the handler; storage upload; `documents` row (`document_type` = client value, `business_id` = caller's active context); `document_analysis(queued)`; **extraction ran inline in the same request**; no reader → honest `unsupported`, upload stays `uploaded` |
| 2 | `DocumentUpload` UI | manual type select; "Not sure" → `other` → no reader → "Stored — no analysis yet" — reproduces the 1040 production failure exactly |
| 3 | shared vocabulary | `base44/shared/documents/documentTypes.ts`; readable set derived from `EXTRACTION_SCHEMAS` |
| 4 | `EXTRACTION_SCHEMAS` | 6 readers: `profit_and_loss, balance_sheet, business_tax_return, personal_tax_return, debt_schedule, payroll_report` — **the 1040's reader already existed** |
| 5 | `extractEngine` | reader routing, period integrity, review-safe reconcile, plus `classifyStaleQueue` (a *different* meaning of "classify": queue triage) |
| 6 | `document_analysis` | status + error classes; `extracted_data` jsonb is MERGED by `markAnalysis` (no data loss) |
| 7 | classification schema | `DocumentClassification` entity: `pending/auto_filed/awaiting_review/approved/rejected/overridden` × `galileo_auto/galileo_suggest/user_manual/admin_manual` |
| 8 | folder metadata | `documents.system_folder` + 20 `SYSTEM_FOLDERS` ids |
| 9 | learning store | `ClassificationMemory` exists with **zero writers** |
| 10 | AI integration | `ExtractDataFromUploadedFile` (in use) and `InvokeLLM` (supports `file_urls`) |
| 11–14 | parsers / content access | **no PDF/spreadsheet/OCR parser exists in the repo**; every byte-level read is provider-mediated (signed URL → platform integration) |
| 15 | reader routing | one place: `EXTRACTION_SCHEMAS[type]` |
| 16 | business/entity association | `business_id` from the caller's active context; no entity detection existed |
| 17 | 6D.0a bridge | intact; still the only read path from reviewed observations to the intelligence contract |
| 18 | security | canonical actor + `validateBusinessScope`/`access_control` **before** the new step; classification is an authorization input nowhere |

**Material findings reported to the gate (Phase 0 STOP) and now answered by Decisions 1–5:** the classification *store* already existed and is admin-facing; content classification costs one provider call per document; the canonical upload writes `business_id` from the caller's active context, so Phase 14 was violated by construction.

## 2. INGESTION ENTRY-POINT MAP (Phase 18)

| Entry point | Today | This slice |
|---|---|---|
| **canonical user upload** (`uploadDocumentToSupabase`) | declared type → extraction | **runs the orchestrator** (required release path) |
| retry (`runDocumentExtraction`, `supabaseUserData:retryDocumentAnalysis`) | re-runs extraction on the stored type | unchanged — already-classified documents re-route through the same reader map |
| `googleDriveImport` | hardcodes `document_type: 'other'` | **debt** (follow-on) |
| `adminUploadDocument`, `adminUploadLibraryFile` | client-declared type | **debt** (follow-on) |
| guest upload / promotion (`guestSessionService`) | own schema/normalizer (shares the engine) | **debt** (follow-on) |
| reclassification | `overrideDocumentClassification` (admin/user, authoritative) | human override is **preserved and never re-routed over** |

## 3. DOCUMENT UNDERSTANDING ARCHITECTURE

`base44/shared/documentUnderstanding/` — seven focused modules, one service, one orchestrator:

```
taxonomy.ts            four concepts (file format / family / type / subtype), reader map DERIVED
contract.ts            the result contract + the documented confidence calibration
signals.ts             pure deterministic content recognition (no I/O)
semanticClassifier.ts  ONE schema-constrained provider call (narrow, low output)
understandDocument.ts  the ONE service: deterministic → semantic → evidence → decision
persist.ts             the ONE persistence owner (decision vs applied type)
orchestrator.ts        classification → persistence → routing decision
```

## 4. CONTENT ACQUISITION STRATEGY

| Format | Access | Path |
|---|---|---|
| csv / txt / json / xml | deterministic decode of the base64 already in the request | `evaluateContent(text)` — decisive alone |
| pdf / scan / image / spreadsheet | authorized short-lived signed URL → provider content read | `InvokeLLM(file_urls:[signedUrl])` (the same mechanism the extraction provider already uses on signed Supabase URLs) |
| no authorized URL | none | honest `no_content_access`, nothing decided, nothing invented |

**No PDF/OCR library was added** (Decision 2). No new dependency of any kind.

## 5. DETERMINISTIC CLASSIFIER

Ordered form rules (most specific first: 1120-S before 1120, 1040-SR before 1040, K-1 before the 1065 it rides on): 1040/1040-SR, 1120, 1120-S, 1065, Schedule C, Schedule E, K-1, W-2, 1099 family. Statement recognition requires an explicit heading **plus ≥2 structural markers**. The file name is a **weak supporting signal only** (`weakFilenameHints`), used to break ties and recorded as weak evidence — never decisive (D2/D30).

## 6. SEMANTIC CLASSIFIER

`InvokeLLM` with a **schema-constrained** response: enums drawn from the canonical taxonomy; `form_number`, `form_title`, `statement_heading`, `structural_markers` (the raw printed evidence), `tax_year`, `reporting_period`, `accounting_basis`, `semantic_scope`, `entity_name`, `entity_identifier`, and `suggested_business_id` **only when authorized candidates exist** (the property is omitted entirely otherwise — D38). No model name is hardcoded (Decision 2); the platform's default selection is used. Failure is returned, never thrown (D42).

## 7. CLASSIFICATION EVIDENCE MODEL

Every decision carries `classification_evidence[]` (e.g. `Form 1040 number`, `Form 1040 title`, `structural markers: revenue, cogs, gross_profit`), the method, and — on a correction — a `prior: {...}` lineage block. Evidence is persisted as `extracted_keywords` on the decision row and inside the contract on the analysis row.

## 8. CONFIDENCE MODEL (calibration, documented + tested)

`95` form number **and** official title · `85` number or title alone · `85` statement heading + ≥2 markers · `60` provider assertion with no content evidence of its own · `60` contradictory strong evidence · `60` markers without a heading · `55` topic wording only · `45` family recognized, no canonical type · `0` no evidence.
Bands: **≥80 HIGH, ≥50 MEDIUM, else LOW.** The provider's own `content_confidence` is **not** used as the band (Phase 7).

## 9. CLASSIFICATION RESULT CONTRACT

`file_format, mime_type, document_family, document_type, document_subtype, tax_year, reporting_period, period_start, period_end, accounting_basis, semantic_scope, detected_entity_name, detected_entity_identifier, suggested_business_id, suggested_folder, reader_key, reader_supported, classification_confidence, confidence_band, classification_method, classification_evidence, requires_confirmation, scope_mismatch, applied_document_type, applied_folder, decision_status, route_extraction, unresolved_reason, notes`.

## 10. TAXONOMY

**File format** is separate from **family** (`tax`, `financial_statement`, `payroll`, `banking`, `legal`, `insurance`, `operations`), **type** (the 11 existing storable types + the Phase-3 approved extension `w2, form_1099, schedule_c, schedule_e, k1`) and **subtype** (`form_1040, form_1040_sr, form_1120, form_1120s, form_1065, schedule_c, schedule_e, k1, w2, form_1099*`). A subtype never implies a reader; the parent of every subtype is declared and enforced.

## 11. 1040 RECOGNITION

`banana.pdf` + a Form 1040 fixture → `pdf` / `tax` / `personal_tax_return` / `form_1040` / `2024` / `personal` / reader `personal_tax_return`, band HIGH, applied, routed. **Filename independently proven irrelevant** (D2, D30).

## 12. BUSINESS-RETURN RECOGNITION

1120-S → `business_tax_return` / `form_1120s`; 1065 → `form_1065`; 1120 → `form_1120` — all routed to the existing `business_tax_return` reader.

## 13. FINANCIAL-STATEMENT RECOGNITION

P&L (heading + ≥2 markers) → `profit_and_loss` HIGH → routed; Balance Sheet → `balance_sheet` HIGH → routed; renames change nothing (F2/F4).

## 14. UNSUPPORTED-RECOGNIZED BEHAVIOR

A W-2 is **`w2`**, applied, filed under Tax Returns, `reader_supported: false`, analysis `unsupported` with a human summary — **never `other`, never an upload failure** (D15/D16/T8).

## 15. READER ROUTING

`reader_key = document_type`, validated only through `EXTRACTION_SCHEMAS` (derived, not restated). No second reader map (D44). Reader absent → classification and folder preserved, extraction honestly not attempted.

## 16. DATA ROOM FILING

Existing `SYSTEM_FOLDERS` ids only: tax forms → `tax_returns`; P&L → `profit_loss`; Balance Sheet → `balance_sheets`; payroll → `payroll`. `debt_schedule` has no dedicated folder → closest canonical (`financial_statements`), **documented debt**. Folder is organization metadata; **no storage object is created or moved** (D14).

## 17. PERSONAL vs BUSINESS HANDLING

`semantic_scope` is evidence. A personal document under a business scope sets `scope_mismatch = true`, applies the classification (so the document is *understood*), and **does not move the document** (D29/D37). A personal return may still carry business-relevant evidence (Schedule C/E, K-1); 6D.0b does not model that — 6D.1 and the evidence architecture do.

## 18. ENTITY ASSOCIATION

`entity_name` / `entity_identifier` are recorded as **evidence only**. `suggested_business_id` is accepted **only** if it is one of the authorized candidates the server supplied; anything else is discarded, and an id outside that list is dropped before it can reach the result (D21/D39). Stated exactly: the canonical upload passes **no** candidate list today (`candidateBusinesses` is optional and is not supplied at the call site), so the property is omitted from the provider schema entirely (`candidateBusinesses.length > 0` guards it) and no business association can be proposed at all. When a later slice does supply candidates, they must be the actor's already-authorized businesses. Classification **never** grants business authorization (D20: the document patch surface is restricted to `document_type, system_folder, year, upload_status, updated_at`).

## 19. CORRECTION / RECLASSIFICATION

A human decision (`classification_status: 'overridden'`) is authoritative: the machine writes **nothing** operational, does not re-route extraction, and records its observation with `persistence: 'skipped_human_override'` (D18/D19). Any other change preserves the previous decision inside `reasoning` as a `prior:` lineage block (D19/M11).

## 20. INGESTION ORCHESTRATOR

`runIngestionUnderstanding` → understand → persist → `route_extraction`; the canonical handler then runs the **existing** `runExtraction` only when routing is permitted. One orchestrator, no parallel pipeline (D43/D44, M12).

## 21. ASYNC / FAILURE STATE MODEL

| Storage | Classification | Reader | State |
|---|---|---|---|
| ✅ | ✅ HIGH | ✅ | Uploaded / Recognized / Analyzed (extraction owns the status) |
| ✅ | ✅ | ✗ | Uploaded / Recognized / Analysis not yet supported (`analysis_status: unsupported`) |
| ✅ | ✅ MEDIUM or scope mismatch | — | Uploaded / Recognized / **Needs confirmation** (`needs_review`) — extraction deferred |
| ✅ | ✗ LOW / provider unavailable | — | Uploaded / **Needs classification** (`upload_status: uploaded`, analysis `pending_analysis`) |
| ✅ | ✗ defect in the layer | — | legacy behaviour preserved exactly (`route_extraction: true`) |

**No state collapses into a generic upload failure** (D17/D24/D25/D42, M7/M8).

## 22. UX BEHAVIOR (Phase 19 — partial)

The upload response now carries the canonical classification state (`document_family/type/subtype/applied_type/confidence_band/reader_supported/requires_confirmation/scope_mismatch/tax_year/decision_status`), which is what the progressive copy ("2024 Form 1040 recognized" → "Analyzing…" → "N fields found"), the medium-confidence confirmation and the scope prompt will render from. **The visible copy in `DocumentUpload` is follow-on debt** (no client file was modified in this slice).

## 23. GALILEO BEHAVIOR

Galileo consumes the same canonical state: the decision row, the applied type and the analysis row. No second Galileo classification implementation exists (D45, M12).

## 24–26. D1–D45 / F1–F6 / T1–T9

**All pass — 75 distinct assertions over 77 PASS output lines, 0 FAIL** (`node scripts/documentUnderstanding.test.cjs`, evidence class UNIT/MOCK + STATIC + MUTATION): D1–D45 (45) + F1–F6 (6) + T1–T9 (9) = 60 behavioural/certification checks, plus the M1–M15 (15) mutation checks. Highlights: D2/D30 filename irrelevant · D3–D5 1040 → `personal_tax_return`/`form_1040`/2024 · D6/D7/D8 routed with reader `personal_tax_return` · D11/D12 no fact writes · D13/D14 `tax_returns`, no storage write · D15/D16 W-2 recognized while unsupported · D17/D24/D25/D42 truthful states · D18/D19 human override preserved with lineage · D20–D23,D36,D37 authorization untouched · D28 period survives to extraction · D31–D35 ownership + confidence behaviour · D38–D41 candidates, no invention, no unnecessary call · D43–D45 one taxonomy, one reader map, `ClassificationMemory` untouched. F1–F6: P&L/BS with renames, unsupported retention, ambiguity → confirmation. T1–T9: 1040/1120/1120-S/1065/Schedule C/Schedule E/K-1/W-2/1099.
**D1/D8/D9 evidence class is contract + static** (handler source assertions: the orchestrator call site, the `routeExtraction` guard, the unchanged non-fatal extraction block); the handler is not booted by the harness.

## 27. M1–M15 MUTATION TESTS

**All 15 CAUGHT.** filename authoritative · 1040 → other · 1120-S → personal · unsupported W-2 → other · classification granting business access · blind business assignment · classification failure → upload failed · unsupported reader → upload failed · duplicate storage object · period discarded · provenance lost · duplicate classifier · client-side classification · `business_facts` write · `business_fact_evidence` write.

## 28. 6D.0a REGRESSION

`scripts/semanticObservationBridge.test.cjs` → **57 PASS / 0 FAIL**. The bridge is unmodified and unreferenced by this slice (D27).

## 29. DOCUMENT REGRESSIONS

| Harness | Result |
|---|---|
| `documentUnderstanding` (new) | **75 assertions PASS / 0 FAIL (77 PASS lines)** |
| `getDocumentsAdmin` (S3 mock) | **50 PASS / 0 FAIL** |
| `documentUploadClassification` | **42 PASS / 0 FAIL** |
| `extractionIntegrity` | **70 PASS / 0 FAIL** |
| `adminDocumentViewer` | **56 PASS / 0 FAIL** |
| `documentAccessAuthorization` | **45 PASS / 0 FAIL** |

## 30. SECURITY REGRESSIONS

| Harness | Result |
|---|---|
| `documentSignedUrlAuthorization` | **103 PASS / 0 FAIL** |
| `galileoContextActorBinding` | **52 PASS / 0 FAIL** |
| `relationshipRevocationAccess` | **78 PASS / 0 FAIL** |
| `adminCanonicalActor` | **125 PASS / 0 FAIL** |
| `adminRouteAccess` / `adminWorkspaceAccess` | **41 / 66 PASS / 0 FAIL** |
| `architectureGuard` | ran clean |

**Baseline reds, proven pre-existing and unrelated:** `businessContextContract` (the accepted `ownershipConcentrationEngine` debt) and `certify-intelligence-contract` (`src/pages/DocumentUpload.jsx:272`, missing `business_id` in an invalidation key — a file this slice never touches). No new behavioural or security red exists.

**Reviewed allowlist maintenance (allowlist lines ONLY, the established pattern):** seven harnesses gained a `P_6D0B_FILES` / inline entry naming this slice's reviewed surface — `documentUploadClassification`, `extractionIntegrity`, `adminDocumentViewer`, `documentSignedUrlAuthorization`, `galileoContextActorBinding`, `relationshipRevocationAccess`, `adminCanonicalActor`. **No behavioural, authorization or mutation assertion was altered**; the diffs are additive allowlist lines with comments. Files changed by this slice: `base44/functions/uploadDocumentToSupabase/entry.ts` (modified) + `base44/shared/documentUnderstanding/` (new) + `scripts/documentUnderstanding.test.cjs` (new) + this report (new).

## 31. BUILD

`npm run build` → **exit 0**.

## 32. FACT FREEZE

`business_facts` writes = **0**; `business_fact_evidence` writes = **0** (D11/D12, M14/M15, static + recorded-write assertions). 6D.1 owns fact promotion.

## 33. PRODUCTION-UNTOUCHED PROOF

No production record was read, written or deleted by any harness (they run against in-memory recording mocks). The real `2024_TaxReturn (3) (1).pdf` was **not retried, reclassified, extracted, moved or deleted**; historical `other` documents were **not** bulk-modified. All fixtures are synthetic text authored in the harness (Phase 22). The real document remains the **post-release smoke test**.

## 34. FILES CHANGED

Modified: `base44/functions/uploadDocumentToSupabase/entry.ts` (orchestrator call in try/catch; extraction gated on `route_extraction`; classification added to the response), 7 harness allowlists.
New: `base44/shared/documentUnderstanding/{taxonomy,contract,signals,semanticClassifier,understandDocument,persist,orchestrator}.ts`, `scripts/documentUnderstanding.test.cjs`, this report. **No `src/` file changed.**

## 35. MIGRATIONS

**None.** The decision lifecycle lives in the existing `DocumentClassification` entity; the applied type/folder/year in existing `documents` columns; the full contract in the existing `document_analysis.extracted_data` jsonb. The five recognized-but-unreadable types are a vocabulary extension in a `text` column. **No migration was required — the corresponding STOP condition did not trigger.**

## 36. GIT STATE

HEAD `24f1847` at start; this slice's work is **uncommitted** and **unpublished** (`git status`: 1 modified product file, 1 new shared directory, 1 new harness, this report + 7 allowlist-line edits). Nothing was committed, amended, reset or pushed.

## 37. REMAINING DEBT

1. `DocumentUpload`/DataRoom copy for recognition, confirmation and the scope prompt (Phase 19 UI) — backend state already carries everything it needs.
2. Entry points beyond the canonical upload: Drive import (hardcodes `other`), admin uploads, guest promotion, batch retry.
3. The upload path supplies **no** business-candidate list yet, so `suggested_business_id` is never proposed; enumerating the actor's authorized businesses (plus entity-name comparison) is a later slice. Nothing is leaked in the meantime — no candidate means no business is ever named to the model.
4. Banking documents are recognized by family only (no canonical type) — honest `pending` + confirmation.
5. `debt_schedule` → closest canonical folder.
6. `classifyStaleQueue` still uses the word "classification" for queue triage; naming reconciliation only.
7. Historical/`other` documents and the real 1040 remain untouched pending the controlled remediation step.

## 38. HISTORICAL REMEDIATION PLAN (NOT executed)

After release: a reviewed, bounded pass over `document_type = 'other'` rows only, run through the same orchestrator with the same authorization, reporting per-document before/after, reversible (the decision row preserves the prior state), and excluding any document whose bytes are missing.

## 39. HANDOFF TO 6D.1

6D.1 owns: confirmed observation → `business_facts` + `business_fact_evidence` → resolver → Digital Twin. It must consume the 6D.0a bridge's reviewed semantics and **must not** read classification as authorization. The confidence bands, `decision_status`, `scope_mismatch` and evidence recorded here are the inputs it may trust; `requires_confirmation = true` must never be promoted.

---

**FINAL VERDICT: 6D.0b RELEASE CANDIDATE — APPROVE FOR REVIEW**

DO NOT PUBLISH. STOP FOR REVIEW.