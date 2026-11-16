# VISION — PHASE 6D
## EVIDENCE INTELLIGENCE + UNIVERSAL DOCUMENT INGESTION
### AUDIT & ARCHITECTURE REPORT (no implementation)

**Status:** AUDIT ONLY — no product code modified, no migration created, no database data changed, nothing published.
**Date:** 2026-10-04
**Evidence class:** CODE (repo, read at source) + RUNTIME (production catalog + aggregate metrics, read-only, via the app's authorized Supabase connector) + DESIGN.
**Production snapshot used:** project `tfrbswfrhrtgfcgonimb`, read-only queries, tables `documents`, `document_analysis`, `extracted_fields`, `business_facts`, `business_fact_evidence`, `storage.objects`, `storage.buckets`.

Every number in this report is either (a) a repo fact with file/line, or (b) a production aggregate read at audit time. Anything neither proven nor read is marked **UNKNOWN** and listed in §33.

---

## 1. EXECUTIVE CONCLUSION

VISION does not need a new document system, a new fact system, or a new Galileo context system. It needs **one missing bridge** and **one honesty repair**.

**The bridge does not exist.** Phase 6C's Digital Twin is **already deployed in production** — `business_facts`, `business_fact_evidence`, the derived `business_fact_conflicts` view, the append-only trigger and the full revision-3 constraint set are all present — and it holds **0 facts and 0 evidence rows**. No code in the repository writes to it or reads from it. The resolver (`canonicalFact/resolver.ts`) resolves from *extracted_fields, dashboard_metrics, profile records and assessment answers* through `intelligenceMapping` — i.e. from the legacy observation layer directly — and never touches `business_facts`. VISION therefore has **two evidence worlds**: a live, messy, well-used one (`extracted_fields`), and a correct, empty, unreferenced one (`business_facts`). That single gap is why Galileo cannot yet say "I know this, I trust it this much, and I still need this from you."

**The honesty repair is overdue.** The extraction engine reports a **hardcoded confidence of `85`** for every field (`extractEngine.ts:432`), so its own `needs_review` branch is unreachable by construction; it **discards the reporting period the AI actually read** and substitutes a derived calendar year (`:347`, `:734-736` vs `:439-442`); its transient-retry recursion **drops the `base44` client** and would throw on retry (`:533`); and it **deletes and reinserts `extracted_fields` on every retry** (`:350-352`), destroying prior review decisions. Production reflects this: of 56 `document_analysis` rows, **32 are `failed` — all of them `unsupported_type`** — and **19 have been `queued` since June 2026**; of 80 `extracted_fields`, **73 are still `pending_review`** and only **5 have ever been decided**. The pipeline is not "mostly working"; it terminates at the review table.

**The incident is proven, not theorised.** `Q4_ProfitLoss.pdf`'s `documents` row is intact (`file_path` set, `storage_bucket='documents'`, `upload_status='completed'`, extraction present) and **its storage object does not exist** (`storage.objects` has no matching row). This is a genuine missing source object, not a bucket or path bug — and it is one of **4** such rows. VISION can already say "I still have what I extracted; the source file is gone" — the knowledge survives in `documents.extracted_data` and `extracted_fields`. Only the viewer behaviour is missing.

**Architecture:** the target is **EVIDENCE-CENTRIC**, exactly as expected — but with one refinement the repository forces: `extracted_fields` must remain an **observation** layer and `business_facts` must become the **statement** layer, because 6C's own table comment says so and because the append-only trigger makes statements immutable while review state (accepted → corrected → rejected) is inherently mutable. Two layers, one direction of flow, no dual write.

**Immediate consequence for the funnel:** the single highest-value *volume* fix is not a new parser — it is that **58% of uploaded documents are typed `other`** (39 of 67), every one of which is guaranteed to fail extraction, because only **6 document types have extraction schemas** while the uploader offers **11** and the product intends ~21+. Extraction support must become a property of the type, not a silent failure.

---

## 2. CURRENT DOCUMENT ARCHITECTURE (as built, verified)

Three storage buckets exist in production and all three are private: `documents`, `client-documents`, `consulting_library_files`. There is **no guest bucket** — `guestSessionService` uploads into `documents` under a scoped path (`GUEST_STORAGE_BUCKET = 'documents'`, same bucket, different prefix).

The document domain is **split across two systems**:

| Concern | Lives in | Written by | Trust level |
|---|---|---|---|
| File bytes | Supabase Storage (private, 3 buckets) | `uploadDocumentToSupabase`, `adminUploadDocument`, `googleDriveImport`, `guestSessionService` | authoritative |
| Document row | Supabase `public.documents` (33 columns) | same four paths | authoritative, but **column-drifted** |
| Analysis state | Supabase `public.document_analysis` (15 cols) | `extractEngine.runExtraction`, `supabaseUserData` | authoritative |
| Field observations | Supabase `public.extracted_fields` (31 cols) | `extractEngine.runExtraction`, `createSampleExtractedFields` | authoritative |
| Facts | Supabase `public.business_facts` + `business_fact_evidence` (6C) | **nothing** | **empty** |
| Folder/classification review | Base44 entities `DocumentClassification`, `ClassificationMemory`, `DocumentFolder` | `supabaseUserData` (manual override only) | UI state |
| Metric read model | Supabase `dashboard_metrics`, `business_metric_snapshots` | `forceUpdateDashboardMetrics`, engines | authoritative read model |

**Column drift inside `documents` itself** (production, verified): the row carries **both** `name` and `file_name`, **both** `file_path` and `storage_path` (with `storage_path` written by nothing current and read by **no code**), **both** `bucket` and `storage_bucket` (where `bucket` is a vestigial column holding `'documents'` on all 67 rows, including the 7 library files whose true `storage_bucket` is `consulting_library_files`), and **both** `status` and `upload_status`. This is the "dual-write ambiguity" the phase brief anticipated — it is real and it is already load-bearing in at least one place (`getDocumentsAdmin` reads `doc.storage_bucket || 'consulting_library_files'`).

---

## 3. DOCUMENT LIFECYCLE MAP

| # | Step | File / function | Table(s) | Input → Output | Business scope | Authorization | Sync/async | Failure + retry | Source of truth |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Pick file | `src/components/documents/UploadDropdown.jsx`, `uploadConfig.jsx` | — | file → base64 | active business from context | client-side only | sync | size/type refused client-side | — |
| 2 | Upload | `base44/functions/uploadDocumentToSupabase/entry.ts` | Storage `documents` | base64 → object at `{profileId}/{businessId|household|hybrid|profile}/{ts}_{name}` | resolved **server-side** (`selectedBusinessId` > `active_business_id` > `primary_business_id`, admin may target) | Base44 auth + `validateBusinessScope` for business docs; **advisor branch queries `advisor_assignments` (does not exist in production)** | sync | returns `step` + code | Storage object |
| 3 | Row | same | `documents` | → row with `file_path`, `storage_bucket='documents'`, `file_url` (**24 h signed URL persisted**), `upload_status='pending_analysis'`, `document_scope` | `business_id` (nullable for household/hybrid) | as above | sync | 500 with `step` | `documents` |
| 4 | Analysis row | same | `document_analysis` | → `analysis_status='queued'` | `business_id` copied | none beyond upload | sync | non-fatal if insert fails (analysisId null ⇒ **no extraction at all**) | `document_analysis` |
| 5 | Extraction | `shared/documentExtraction/extractEngine.ts` `runExtraction` | reads `document_analysis`, `documents`; writes `extracted_fields`, `document_analysis`, `documents.upload_status` | signed URL (300 s, **hardcoded bucket `documents`**, `:392`) → `ExtractDataFromUploadedFile` → normalized fields | carries `businessId`/`profileId` from the row | **none** (called inside upload with service role) | sync inside the HTTP request | transient only if the error text contains `timeout`/`network`, max 3, **retry loses `base44`**; else `failed` | `extracted_fields` |
| 6 | Manual re-extract | `base44/functions/runDocumentExtraction/entry.ts` | same | `documentAnalysisId` → engine | reads document row | Base44 `user.role` for admin (**not canonical**), owner-match, advisor via **nonexistent `advisor_assignments`** | sync | 400/500 | — |
| 7 | Retry | `supabaseUserData` `retryDocumentAnalysis` (`:1507`) | `document_analysis`, `documents` | reset → calls `runExtraction` | profile-scoped | via router | sync | logs only | — |
| 8 | Review | `updateExtractedFieldReview`, UI `ExtractedFieldsReviewQueue` | `extracted_fields` | `review_status` pending→accepted/corrected/rejected, `accepted_value`, `accepted_normalized_value`, `reviewed_by/at` | profile/business on the row | router-level | sync | — | `extracted_fields` |
| 9 | Promotion | `createSnapshotFromReviewedFields` (and engines reading `accepted_value`) | `business_metric_snapshots`, `dashboard_metrics` | accepted fields → metrics | business-scoped | service role | sync | — | `dashboard_metrics` |
| 10 | Read model | `supabaseDashboardData`, `businessIntelligenceContract` | `dashboard_metrics`, snapshots, assessments, opportunities | → BIS contract → dashboard/business pulse | business | router-level | sync | — | BIS |
| 11 | Galileo | `buildGalileoContext` (988 lines) | reads 14 content tables incl. `extracted_fields` | → context JSON for `askGalileo` | canonical actor + business (**P-S3 closed**) | kernel | sync | — | context |
| 12 | Folder/classification | `DocumentClassification` entity + `ClassificationReviewQueue.jsx` → **`classifyDocument` which does not exist** | Base44 entity | UI calls a missing function | — | — | — | **dead path** | — |
| 13 | Viewer | `useDocumentViewer` → `supabaseUserData.getDocumentSignedUrl` | reads `documents`, mints 900 s URL from `doc.storage_bucket` | id → signed URL | **tenant derived from the row** (S3.1 engine) | kernel + `authorizeDocumentAccess` | sync | 404 for both unauthorized and nonexistent | — |
| 14 | Delete | `supabaseUserData.deleteDocument` (`:1488`) | deletes `document_analysis` + `documents` rows | id → gone | `profile.app_role || user.role || 'owner'` (**Base44 role fallback**), owner or admin | **its own rule, not the shared engine** | sync | — | **Storage object is NOT removed** |

**Duplication and dead paths found:** (a) two upload functions with overlapping logic (`uploadDocumentToSupabase` vs `adminUploadDocument`) and a third (`uploadDocumentDirect`) plus two signed-upload helpers (`getSignedUploadUrl`, `getUploadSignedUrl`); (b) `supabaseUserData` and `supabaseDocumentData` both expose `getDocuments`, `uploadDocument`, `upsertDocument`, `getDocumentAnalysisQueue`, `updateExtractedFieldReview`; (c) `classifyDocument` is called in 5 places by `ClassificationReviewQueue.jsx` and **exists nowhere**; (d) `storage_path` and `bucket` columns are written by no current path; (e) `documents.system_folder` is referenced by the Data Room UI but does not exist on the table (folder state lives in the `DocumentClassification` entity / `DocumentFolder` entity).

---

## 4. FILE-TYPE CAPABILITY MATRIX

Legend: **FULL / PARTIAL / NO / UNKNOWN**. "Upload" = server allowlist (`ALLOWED_EXTENSIONS`, `uploadDocumentToSupabase:33`). "Extract" = `ExtractDataFromUploadedFile` (the only extractor; documented types: csv, xlsx, json, html, png, jpg, jpeg, pdf). No native parser, OCR engine or spreadsheet library is installed.

| Type | Upload | Stored | Browser viewable | Text extractable | Structure preserved | OCR | Classifiable | Fact extraction | Reviewable | End-to-end |
|---|---|---|---|---|---|---|---|---|---|---|
| PDF (native/text) | YES | YES | FULL (iframe) | PARTIAL — via LLM extractor only | UNKNOWN | n/a | NO (manual type only) | PARTIAL (6 types) | YES | **PARTIAL** |
| PDF (scanned) | YES | YES | FULL | UNKNOWN (extractor-dependent) | NO | **UNKNOWN** (not exposed) | NO | UNKNOWN | YES | **UNKNOWN** |
| DOCX | YES | YES | NO (office → download only) | UNKNOWN (not in extractor's documented set) | NO | NO | NO | **NO** | n/a | **NO** |
| DOC | YES | YES | NO | NO | NO | NO | NO | NO | n/a | **NO** |
| RTF / TXT | **NO** | — | — | — | — | — | — | — | — | **NO** |
| XLSX | YES | YES | NO (download only) | PARTIAL (extractor lists xlsx) | UNKNOWN | n/a | NO | PARTIAL (6 types) | YES | **PARTIAL** |
| XLS | YES | YES | NO | NO | NO | NO | NO | NO | n/a | **NO** |
| CSV | YES | YES | FULL (text preview) | YES (extractor lists csv) | YES | n/a | NO | PARTIAL | YES | **PARTIAL** |
| JPG / JPEG / PNG | YES | YES | FULL (image) | UNKNOWN | no | UNKNOWN | NO | UNKNOWN | YES | **PARTIAL** |
| WEBP | YES | YES | FULL (image) | NO (not in extractor set) | no | UNKNOWN | NO | NO | n/a | **NO** |
| HEIC / TIFF / GIF | **NO** | — | — | — | — | — | — | — | — | **NO** |
| PPTX | **NO** | — | — | — | — | — | — | — | — | **NO** |
| EML / MSG / ZIP | **NO** (zip explicitly blocked) | — | — | — | — | — | — | — | — | **NO** |
| QuickBooks / Xero / Wave / GL / trial-balance / bank / payroll exports | YES if CSV/XLSX (usually typed `other`) | YES | CSV yes, XLSX no | PARTIAL | YES for CSV | n/a | NO | **NO — no schema for GL/TB/bank** | YES | **NO** |

**Verified outcome in production:** all 24 `upload_status='failed'` documents are typed `other`; document types in use are `other` 39, `business_tax_return` 18, `profit_and_loss` 7, `balance_sheet` 3. The product is overwhelmingly receiving files it has **no schema for**.

---

## 5. EXTRACTION-ENGINE INVENTORY

| Mechanism | Present? | Implementation | Types | Limits | Output | Confidence | Retry | Failure | Cost/security |
|---|---|---|---|---|---|---|---|---|---|
| `ExtractDataFromUploadedFile` (Core integration) | **YES — the only one** | `extractEngine.ts:400`; same call in `InlineDocumentFlow.jsx:140`, `GalileoLearning.jsx:89`, `guestSessionService` | documented: csv, xlsx, json, html, png, jpg, jpeg, pdf | 25 MB upload cap; single call; 5-min signed URL | JSON object per per-type schema (all properties typed `string`) | **hardcoded `85`** (`:432`) | transient-classified only, 3 attempts, **recursion loses `base44`** | `unsupported_type` (no schema) or `no_fields_extracted` | service-role; provider/model **UNKNOWN**; per-call credits |
| Native PDF text extraction | NO | — | — | — | — | — | — | — | — |
| OCR | **UNKNOWN / not exposed** | no OCR library installed; extractor may or may not do it internally | — | — | — | — | — | — | — |
| LLM vision | NO (directly) | only inside the extractor | — | — | — | — | — | — | — |
| Spreadsheet/CSV/DOCX parsers | NO | no `xlsx`, `mammoth`, `papaparse` installed | — | — | — | — | — | — | — |
| Page-level / sheet-level / chunked extraction | **NO** | single request per document | — | — | — | — | — | — | — |

**Assessment:** OCR is not being used *where native parsing would be better* — because there is no native parsing at all. The preferred principle ("native structure → parser → model interpretation → OCR/vision only when necessary") is currently inverted: **everything is model interpretation from a file URL.** For text PDFs, CSVs and XLSX this is strictly worse than a deterministic parser (cost, latency, provenance, reproducibility). Also note `reporting_period` is requested and returned but **never persisted** by `runExtraction` (period comes from `derivePeriodFromType`, `:221-229`).

---

## 6. CLASSIFICATION ARCHITECTURE

**What actually exists today:**

- A **manual** `document_type` chosen at upload (11 values; coerced to `'other'` if unrecognised, `uploadDocumentToSupabase:120`), stored on `documents` and `document_analysis`.
- A **document_scope** derivation (business / household / hybrid / profile) from hardcoded type sets (`:87-106`) — a genuinely useful, deterministic rule that already exists.
- A **folder taxonomy** `SYSTEM_FOLDERS` (15 folders across tax/financial/insurance/legal/wealth/exit/operations) in `src/lib/documentReadiness.js`, mirrored by the `DocumentFolder` Base44 entity and `DocumentClassification.applied_folder`.
- A **classification review UI** (`ClassificationReviewQueue.jsx`) wired to **`classifyDocument`, which does not exist** → the queue is dead.
- **No AI classifier**, no hierarchical taxonomy, no classification confidence produced anywhere in production.

**Therefore:** the requested taxonomy (Financial Statement → P&L; Tax → 1120-S; Banking → Bank Statement; Legal → Operating Agreement) is **not** present, and should not simply be bolted on. The right design is a **two-axis model** that reuses what exists: **`document_type`** (the extraction-routing key — what the parser knows how to read) and **`system_folder`** (the owner-facing filing key — where it is stored), with an optional `taxonomy_parent` for hierarchy. `document_scope` stays exactly as it is. Adding "Trial Balance", "Bank Statement", "General Ledger", "AP/AR Aging" to the *folder* axis costs nothing; adding them to the *type* axis is meaningful only when an extraction schema exists (§7), which is the correct coupling and prevents another 24 `unsupported_type` failures.

---

## 7. PARSER ARCHITECTURE (design; nothing implemented)

Replace "every file → generic LLM → random fields" with a **router** keyed on `document_type`:

```
FILE → format detection (by extension + declared type)
     → NATIVE PARSER for structured formats (csv, xlsx, txt, json)
     → MODEL EXTRACTION with a type-specific schema (pdf, images)
     → OCR/VISION only when the model reports low text yield
     → DOCUMENT-SPECIFIC INTERPRETER (per type, registered, small)
     → CANDIDATE FACTS + EVIDENCE
```

Extensibility without one giant parser: one **interpreter module per document type** in `base44/shared/documentExtraction/interpreters/<type>.ts`, each declaring `{ type, schema, interpret(parsed) → candidates[], periodHints, requiredFields }`, and a **registry** that the router reads. `EXTRACTION_SCHEMAS` in `extractEngine.ts` is already exactly this shape (a per-type field list) — it becomes the first registry entry rather than a hardcoded object. Priority interpreters by information value, in order: **P&L, Balance Sheet, Bank Statement, General Ledger/Trial Balance, Business Tax Return, Payroll, Debt Schedule, AR/AP aging, Legal agreements**. Each interpreter emits *named* candidates that map to registry keys — never free-form fields.

---

## 8. CURRENT FACT-PROMOTION ARCHITECTURE (measured)

```
documents → document_analysis → extracted_fields → [human review] → accepted_*
        → createSnapshotFromReviewedFields / engines → dashboard_metrics
        → BIS contract → dashboard, valuation, Galileo

business_facts  ← NOTHING WRITES HERE. 0 rows. Evidence: 0 rows.
canonicalFact/resolver.ts ← reads extracted_fields, dashboard_metrics,
                            profile records, assessment answers, valuation answers
                            via intelligenceMapping — never business_facts.
```

**Measured today:** 80 `extracted_fields` → 73 `pending_review`, 4 `accepted`, 1 `corrected`, 1 `rejected`, 1 `needs_clarification`. **Nothing has flowed past the review gate at any volume**, and the fact layer that 6C built to receive it is unreferenced by any code path.

**Where each layer belongs (target, no ambiguity):**

| Layer | Owns | Mutable? | Writer |
|---|---|---|---|
| `documents` | the source object + its lifecycle | yes | upload paths |
| `document_analysis` | one processing attempt | yes | extraction engine |
| `extracted_fields` | **one raw observation** from one document | yes (review state only) | extraction engine + review |
| `business_fact_evidence` | **why a fact exists** (observation lineage, incl. deleted sources) | append-only | fact promotion |
| `business_facts` | **one sourced, period-scoped, basis-aware statement** | append-only; corrections supersede | fact promotion |
| `dashboard_metrics` / snapshots | **derived read model** consumed by BIS | recomputable | engines |
| `canonicalFact` resolver | **current understanding** (selection among facts) — today among legacy observations | no writes | read-time |

No dual write: `extracted_fields` is **never** the fact of record; `business_facts` is **never** recomputed from metrics. Metrics are derived *from* facts, not the reverse (§13).

---

## 9. TARGET EVIDENCE/FACT PIPELINE

```
SOURCE (document | user statement | connected system | expert | assessment | valuation | derived)
  ↓ observation captured with provenance      →  extracted_fields / evidence rows in 6C vocabulary
  ↓ SEMANTIC VALIDATION (fact_key known? value type matches? period derivable? basis known?)
  ↓ PERIOD + BASIS NORMALIZATION               → period_type/label/start/end, accounting_basis
  ↓ EVIDENCE LINK                              → business_fact_evidence (document_id, page, form, locator)
  ↓ business_facts INSERT (fingerprint-idempotent, append-only)
  ↓ RESOLVER (authority → period → verification → conflict)
  ↓ BIS (authoritative read model)  →  GALILEO (explains, asks, warns)
```

Trust gates, in order, each of which can *hold* an observation without losing it: **fact registry match** (else store as evidence only), **period known or inferred** (else `period_type` unknown → ask), **basis known** (else flag), **materiality vs existing fact** (else record as alternative), **confirmation/verification requirement from the registry** (`required_verification_level`).

---

## 10. USER-PROVIDED KNOWLEDGE DESIGN (conversational fact gate)

Today user statements enter as assessment answers, profile financials, or Galileo conversation text — none of which can become a fact. The gate (design, not implemented):

| Condition | Required? | Rationale |
|---|---|---|
| Explicit subject | YES | "we did about $5M **last year**" — subject = this business (from session actor, never from body) |
| Registry key match | YES | unmapped statements become *evidence only*, never facts |
| Period: explicit or unambiguous | YES (or ask) | "last year" resolves against the business's fiscal year; ambiguity ⇒ one clarifying question, not a guess |
| Value shape | YES | numeric for the 8 financial pilot keys; range/approx accepted as `approximate` precision flag |
| Attribution | YES | `source_type='owner_reported'`, `verification_status='confirmed'` + `verification_method='owner_confirmation'`, `source_reference` = conversation/message id |
| Materiality | YES | below the registry threshold vs an existing fact ⇒ record as alternative, do not supersede |
| Confirmation | YES for currency facts | the owner sees "I've noted FY2025 revenue ≈ $5.0M (owner estimate) — correct?" before the fact is written |
| Never | — | no write from arbitrary conversation; no write without a canonical actor; no write across businesses |

Precision must be first-class: `5_000_000` from "about $5M" is `value_numeric` **with** a precision/approximation marker in `metadata` — never silently equal to a P&L's exact figure.

---

## 11. CONNECTED-SOURCE DESIGN

Connectors produce **observations + evidence into the same architecture** — never a connection-specific truth store. A QuickBooks TTM revenue becomes a `business_facts` row with `source_type='connected_accounting'`, `verification_status='verified'`, `verification_method='connected_source'`, `verified_by_service='connected_accounting'` (no human profile — 6C already models this and constrains it: `business_facts_verified_source_needs_service`, `verified_by_service_vocab`, `verified_service_method_alignment`). Authority differs by *order*, not by store: connected system > verified tax return > reviewed financials > uploaded financials > owner estimate. The period field is what keeps QuickBooks' TTM from "conflicting" with a P&L's FY2025 — the derived conflict view already groups by period identity, so these coexist without a conflict row. **Connectors require no new tables.**

---

## 12. EXPERT-VERIFICATION DESIGN

Reuse 6C verbatim: `verification_status='verified'`, `verification_method='expert_review'`, `verified_by_profile_id`, `verified_at` — the table already refuses `verified` without a human profile for a human method, and refuses `expert_review` from producing `confirmed`. What is missing is only the **authority matrix** (who may verify what) and the **method vocabulary per fact category**:

| Expert role | May verify | May NOT verify |
|---|---|---|
| CPA / tax expert | accounting facts under `financial` (revenue, net income, payroll, depreciation, basis) and tax-basis facts | ownership/legal provisions, valuation assumptions |
| Attorney | `business_profile` legal facts (entity structure, ownership, leases, agreements) | accounting values |
| Valuation expert | `valuation` / `business_quality` facts (normalized EBITDA, add-backs, multiple) | tax filings, legal provisions |
| VISION team / advisor | any fact **already** requiring review, per assignment | nothing beyond the business relationship |

Required additions are **configuration, not schema**: a `verificationAuthority` matrix keyed by `fact_key → allowed roles` living beside the registry. Attestation, timestamp and method already exist; **revocation/correction** is already modelled (supersession is one-way and terminal; a demoted fact must explicitly clear attestation fields — `business_facts_verified_fields_scope`). The audit trail exists (`reviewed_by/at`, `verified_at`, `metadata`) and should be treated as the audit event source for §22 rather than a new table.

---

## 13. RESOLVER DESIGN

The resolver **already exists and is sound in shape** (`canonicalFact/resolver.ts`, `sourceHierarchy.ts`, `reportingPeriod.ts`, `types.SOURCE_AUTHORITY`): advisor-locked value first, then period/date applicability, then authority rank, then materiality-based conflict detection among equal-authority sources, then lineage + alternatives + explicit missing/conflict state. Its flaw is not its logic but its **inputs**: it resolves from the legacy observation tables, and its conflict identity is a coarse string compare of reporting periods rather than 6C's normalized period identity.

Target: **the resolver reads `business_facts` + `business_fact_evidence`** (single source of statements), keeps its selection algorithm, and adopts 6C's period identity (period_type + normalized label + exact bounds + accounting basis) so FY vs TTM vs gross-receipts vs cash/accrual never present as conflicts. Galileo must never select "the nicest number": when the resolver returns `conflict`, Galileo reports the conflict and the two candidate facts with their periods and sources.

## 14. GALILEO REASONING DESIGN

Galileo today receives an assembled context (`buildGalileoContext`, 988 lines, P-S3-hardened) and a prompt that forbids inventing numbers, forbids re-scoring, and requires it to name what is missing (`askGalileo`, prompt rules ~`:353-432`, returning `missing_data` / `missing_info`). What it cannot do is **speak about evidence**, because the context it receives has values without a trust story.

Target Galileo voice, driven by resolver output, not by prompt mood:

| Resolver state | Galileo behaviour |
|---|---|
| one authoritative fact, verified source | **USE** — "FY2025 revenue is $5.18M, from your P&L." |
| owner estimate, no document | **ESTIMATE** — "You told me about $5M; I'm holding it as an owner estimate." |
| two different periods/bases | **EXPLAIN, KEEP BOTH** — "QuickBooks shows $5.37M TTM — a different period, so I'm keeping both." |
| material conflict, same identity | **ASK** — "Two materially different EBITDA figures for FY2025. Before I use this for valuation I need to reconcile them." |
| missing + high information value | **REQUEST** — one question, with the reason and the calculation it unblocks |
| stale (source > 18 months) | **WARN** — "My revenue figure is from FY2023; it may no longer describe the business." |
| low confidence, low materiality | **DEFER** — do not raise; keep it out of the answer's spine |

Every statement carries its source label and, on request, the drawer in §17. Galileo may never silently substitute one source for another, and may never present an owner estimate with document phrasing.

---

## 15. KNOWLEDGE GAP ENGINE DESIGN

Today: gaps come from **missing assessment types** (`assessments_missing` in the `askGalileo` prompt) and from `missing_data` strings the model writes. A client library `src/lib/galileo/adaptiveQuestions.js` exists on the Galileo surface (internals not part of this audit). There is **no server-side information-value ranking**.

Target states — reuse 6C vocabulary, add none: `KNOWN` (resolved, verified/confirmed), `UNKNOWN` (no candidate), `UNCERTAIN` (candidate below required verification), `CONFLICTING` (material conflict), `STALE` (resolver `resolution_status='stale'`). Question priority should be computed, not authored:

```
priority = goal_relevance × calculation_dependency × opportunity_impact
         × expected_confidence_gain ÷ effort_to_answer
```
where `calculation_dependency` is **derivable from the registry**: a missing fact that appears in another fact's `lineage_requirements` is a blocker (e.g. `normalized_ebitda` requires `owner_compensation`), and `effort_to_answer` is low when a **connected source or an existing document** can answer it. The engine therefore asks about owner compensation *when normalized EBITDA is the goal* — not because a field is blank. Availability from connected data should suppress the question entirely (§11).

---

## 16. BUSINESS INTELLIGENCE / CONFIDENCE DESIGN

Keep the two concepts strictly separate, as the BIS contract already does (it carries a business-level IQ and a business confidence alongside domain results, and the gap dashboard renders per-domain states with empty states when data is null).

- **BUSINESS INTELLIGENCE** = *how much of the business VISION understands* — a coverage measure over the registry's registered facts that a given consumer needs, weighted by `consumer importance`, with domains (Financials, Tax, Operations, Customers, Owner Dependency). It rises when facts arrive from **any** source, including owner statements.
- **CONFIDENCE** = *how strongly one conclusion is supported* — per fact, derived from authority rank + verification status + source recency + agreement among independent observations. It does **not** rise because a human merely looked at a number (that is `verification_status`, and 6C's `confidence` comment already forbids it).

Consequently a valuation can show `$8.4M–$9.6M, Confidence: High` while "Customers" in the intelligence panel reads **Limited** — the range is well supported by the facts that exist; the business is simply not well covered. One global score is explicitly rejected.

---

## 17. EVIDENCE / SOURCE UX

Four owner-facing labels, mapped from 6C (never exposing database vocabulary):

| Owner-facing label | 6C condition |
|---|---|
| **YOU PROVIDED** | `source_type='owner_reported'` (confirmed) |
| **FROM YOUR DOCUMENT** (e.g. "FROM YOUR P&L") | `source_type='document_extraction'` + a document evidence row, named by `document_type` |
| **CONNECTED SOURCE** ("CONNECTED TO QUICKBOOKS") | `verification_method='connected_source'`, `verified_by_service='connected_accounting'` |
| **VERIFIED BY VISION** | `verification_method in ('advisor_review','expert_review')` with `verified_by_profile_id` |

Presentation rules: one label per value, no badge soup; the label is a quiet inline affordance that opens the existing drawer pattern (`EvidenceDrawer`, `ExplainWithGalileo`, `FieldLockBadge`, `WhyButton` already exist) showing: value, period, source, evidence (document name + page/form), alternatives, conflict state, and a correction action routed into the existing review/verification flow. "Show me why" reuses the explainability panel; it must not introduce a second drawer.

---

## 18. FILE-NOT-FOUND ROOT-CAUSE ANALYSIS (the `Q4_ProfitLoss.pdf` incident)

**Proven, per-row evidence (production, read-only):** the `documents` row exists with `name='Q4_ProfitLoss.pdf'`, `document_type='profit_and_loss'`, `storage_bucket='documents'`, `file_path` present, `storage_path` **absent**, `upload_status='completed'`, and its `file_url` is not an expiring-token URL. **`storage.objects` contains no object matching that `file_path`.** The reported error is therefore a **genuinely missing storage object**, not a viewer or authorization defect. It is one of **4** such rows in production.

Ranked causes, with what each looks like and whether it applies here:

| Cause | Mechanism | Applies? |
|---|---|---|
| **Storage object missing / deleted out-of-band** | object removed, row remains | **YES — proven for this row** |
| Deleted row but orphaned/removed object ordering | `deleteDocument` deletes rows **without** deleting the object; conversely an object can be removed and the row left | YES — the delete path guarantees drift in one direction |
| Wrong bucket | `documents.bucket` vs `storage_bucket` drift (7 library rows carry `bucket='documents'`); `getDocumentsAdmin` falls back to `|| 'consulting_library_files'`; extraction **hardcodes `'documents'`** (`extractEngine:392`) | YES — latent, not the cause here |
| Wrong / legacy path | `storage_path` (written by nothing, read by nothing) vs `file_path` | YES — latent |
| Stale persisted signed URL | `documents.file_url` holds a **24 h** signed URL (SEC-011) | YES — latent for older rows |
| Migration/backfill mismatch | `addSystemFolderColumn`, `backfillFileScope`, `backfillNullStorageBucket`, `backfillAssignmentProfileIds` — backfills exist for exactly this class | POSSIBLE (UNKNOWN which rows) |
| Upload failure leaving a row | upload returns an error and no row is created (row insert is after upload) | NOT here (`completed`) |
| Filename/path normalization | sanitization replaces unsafe chars (`safeFileName`), so a row's `file_path` is authoritative | NO |

**Desired recovery behaviour (already supportable, nothing new required):** the row's extraction survives in `documents.extracted_data` and `extracted_fields`, and 6C already models a vanished source as `business_fact_evidence.source_status='deleted' + deleted_at` (comment: "evidence is never deleted when a source disappears"). So the correct UX is exactly the one proposed — *"I still have the information previously extracted from this document, but the original file is unavailable. Re-upload it to restore the source document."* — with the viewer showing a first-class **SOURCE MISSING** state instead of a raw transport error, and a re-upload that **re-links evidence** rather than creating a duplicate fact.

**Also required:** `deleteDocument` must remove the storage object (or tombstone it) as part of the same operation, or the drift grows — production already shows **157 objects in the `documents` bucket against 59 rows that claim that bucket**.

---

## 19. VIEWER ARCHITECTURE

Separate the two questions explicitly:
- **CAN VISION UNDERSTAND THIS FILE?** = extraction capability (§4/§5) — depends on the extractor, not the browser.
- **CAN THE BROWSER PREVIEW THIS FILE?** = render capability.

Current renderer (`DocumentViewer.jsx`): PDF → iframe; image → `<img>`; text/csv/json/xml → fetch + `<pre>`; office (doc/docx/xls/xlsx) → **no preview, download only**; anything else → "Preview unavailable". Extraction must **never** gate on preview capability: an XLSX that cannot be previewed may be fully parseable, and a scanned PDF may preview perfectly while extracting poorly.

Target behaviour by type: native preview (PDF, image) · text preview (CSV/TXT) · **structured preview** for spreadsheets (parsed sheet → table, using the same parser the extractor uses — this is the highest-value addition and it *is* achievable with a client-side table render of parsed rows, not an embedded office engine) · download/open externally (DOCX, XLS legacy, unsupported) · **"extraction available, preview unsupported"** panel that shows the extracted values with their review state. One viewer, three states, no second viewer component.

---

## 20. FAILURE / RECOVERY MODEL

Reuse first (both tables already carry status columns):

| Target state | Where it lives | Today |
|---|---|---|
| UPLOADED | `documents.upload_status='uploaded'` | exists |
| PROCESSING | `upload_status='pending_analysis'` + `analysis_status in (queued, analyzing)` | exists |
| READY | `upload_status='completed'` | exists |
| NEEDS REVIEW | `upload_status='needs_review'` (currently **unreachable** — see §5) | exists, dead |
| PARTIAL | new: some fields extracted, required ones missing (needs a `missing_fields` signal — the column exists on `document_analysis`, currently written as `[]`) | **absent** |
| FAILED | `upload_status='failed'` + `extracted_data._retry_info.last_error_class` | exists, error class is only `unsupported_type` / `no_fields_extracted` / `transient` / `permanent` |
| SOURCE MISSING | new: row present, object absent | **absent** |
| UNSUPPORTED | fold into `failed` + `last_error_class='unsupported_type'` but surface it as its own owner-facing state | partial |
| REPLACED | supersession on the fact layer (facts), not on the document | **absent** on documents |

Retry policy: `unsupported_type` → **no retry** (needs a parser, not a retry); `transient` → bounded retry with backoff; a **stuck `queued`** row → system recovery. Production shows **19 analyses queued since June 2026** — there is no sweeper. A **scheduled workflow** (the platform capability already in use for digest/registration alerts) that re-invokes extraction for stale `queued` rows, and reports failures in owner language ("this file type needs a different reader — we've logged it"), is the cheapest recovery mechanism available.

---

## 21. LARGE-DOCUMENT ARCHITECTURE

Current reality: one `ExtractDataFromUploadedFile` call per document, 25 MB ceiling, 5-minute signed URL, no page/sheet awareness, no resume beyond a full re-run that **wipes prior fields**.

Design: (1) **native parsers first** for CSV/XLSX/GL (streaming, sheet-by-sheet, row-batched — no model needed for structure); (2) for PDFs, **page-level extraction** with the page range recorded on each evidence row (`business_fact_evidence.page` already exists); (3) **incremental processing**: one `document_analysis` row per chunk/attempt rather than one per document, so partial completion is representable and resumable; (4) **never re-run destructively** — chunk re-extraction must not delete already-reviewed fields; (5) deduplication by content hash (§22); (6) an explicit cost/timeout budget per document with a `partial` outcome rather than a hard failure. `missing_fields` on `document_analysis` is the natural place to record what a chunk did not cover.

---

## 22. DUPLICATE / VERSIONING ARCHITECTURE

Nothing today prevents the same bytes being uploaded twice, and `extracted_fields` rows carry no content identity. The only fingerprint in the system is `business_facts.fingerprint` (sha256 over business|fact_key|period|basis|source_type|source_table|source_id|value) — a correct pattern to extend.

Design: (1) compute a **content hash** (sha256 of bytes) at upload and store it on `documents`; same hash + same business ⇒ offer "this looks identical to <name>, uploaded <date>" rather than silently duplicating; (2) same filename + different hash ⇒ **new version**, never an overwrite; (3) a corrected P&L / amended return supersedes **evidence and facts**, never deletes them — `business_fact_evidence.source_status` (`deleted`/`tombstoned`, with `deleted_at`) and fact `supersedes_fact_id`/`superseded_by_fact_id` already exist; (4) replacement at the document level must re-link evidence (`document_id`) and mark the prior document `REPLACED`, preserving lineage; (5) idempotency on ingestion is the fact `fingerprint` plus, for evidence, a composite of (document_id, extracted_field_id, fact_key).

---

## 23. SECURITY IMPLICATIONS

The Security Kernel is the only authorization path for anything new, and this audit found **real defects in the existing document code** that must be treated as pre-conditions for 6D (audit only — not fixed here):

| # | Finding | Evidence | Class |
|---|---|---|---|
| D1 | Extraction authorizes admin by **Base44 `user.role`**, not canonical `app_role` | `runDocumentExtraction/entry.ts:77` | **SEC-class (same family as SEC-001)** |
| D2 | Extraction's advisor branch queries **`advisor_assignments`, which does not exist in production** → advisors can never extract | `runDocumentExtraction:92-97`; `writeGuard` step 5 already treats the table as absent | functional break |
| D3 | Upload resolves role as `profile.app_role \|\| user.role \|\| 'owner'` and gates admin/advisor on it | `uploadDocumentToSupabase:138,149,159` | **SEC-class** |
| D4 | `deleteDocument` uses its own rule + Base44 role fallback and **never calls the shared `authorizeDocumentAccess`** (which the VIEW path does use) | `supabaseUserData:1488-1512` vs S3.1 engine | divergence |
| D5 | Extraction hardcodes bucket `'documents'` instead of the row's persisted `storage_bucket`, contradicting the S3.1 "never guess a bucket" policy | `extractEngine:391-393` | policy violation |
| D6 | `deleteDocument` removes DB rows but **not the storage object**; production shows 157 objects vs 59 claiming rows | §18 | containment/orphan |
| D7 | Guest uploads write into the client `documents` bucket (no separate bucket) | `guestSessionService:38` | containment (S2 scope) |
| D8 | Persisted 24 h signed URLs remain in `documents.file_url` (SEC-011) | schema + upload path | known debt |
| D9 | `createDocumentAnalysis` / `checkDocumentAnalysisById` carry the known body-supplied `profile_id`/`business_id` authorization debt — they must **never** become the ingestion path | known issues; functions present | known SEC debt |
| D10 | `classifyDocument` is called by the UI but does not exist → a dead review surface users may believe is authoritative | `ClassificationReviewQueue.jsx` (5 call sites) | integrity |

Every new document/fact operation must satisfy: **ACTOR (canonical) → BUSINESS (authorized) → RESOURCE (row-derived tenant) → PERMISSION → OPERATION → AUDIT**, reusing `authenticateActor`, `resolveActingProfile`, `requireBusinessContext`, `assertBusinessAccess`, `authorizeDocumentAccess`. Ingestion must never become a bypass: the promotion path is **server-side only, service-role, zero client write policies** — exactly as 6C's RLS already declares.

---

## 24. PRIVACY / RETENTION

Current: authenticated uploads only; a guest path exists in code (`guestSessionService`) writing into the private `documents` bucket under a non-profile prefix; deletion removes rows and leaves objects; no retention policy is expressed anywhere (no TTL column, no `expires_at`, no scheduled sweep). 6C already provides the correct *semantic* primitive for source loss (`evidence.source_status` + `deleted_at`) — retention should use it rather than inventing a new one.

Design (no anonymous upload implemented now): (1) guest uploads, if enabled, get an isolated prefix and a hard TTL with a scheduled cleanup workflow; (2) authenticated uploads survive as evidence, but the **object** may be deleted while evidence is tombstoned — the fact keeps its provenance and the UI explains the lost source (§18); (3) user-requested deletion: remove objects + rows, tombstone evidence, retain facts' provenance with `source_status='deleted'`; (4) legal/audit retention (tax returns, agreements) is a *policy flag per document type*, not a schema change; (5) any change here must respect business isolation — a guest or deleted source must never be reachable by another tenant.

## 25. AUDIT / EVENT MODEL

Do **not** build a new audit system. Three immutable or append-only sources already exist and are sufficient for the first three phases:

| Event | Where it already lives | Adequacy |
|---|---|---|
| extraction attempt / failure class | `document_analysis` (row per attempt, `extracted_data._retry_info`) | good |
| field review decision | `extracted_fields.review_status/reviewed_by/reviewed_at/accepted_value` | good |
| evidence observation + review event | `business_fact_evidence.review_event`, `reviewed_*`, `observed_at`, `source_status/deleted_at` | **good — designed for this** |
| fact proposal / confirmation / correction / verification / rejection / supersession | `business_facts.verification_*`, `reviewed_*`, `superseded_*`, `supersession_reason`, `metadata` (append-only, trigger-enforced) | **good** |
| document view / download / delete | **nothing** | gap |
| classification override | `DocumentClassification` entity (reviewer, role, timestamp, reasoning) | partial |

Design: derive the fact/evidence audit trail from the tables (no duplication), and add explicit events **only** for document view/download/delete and source-missing/re-upload — the minimal set SOC 2 needs and the only set with no home today. Follow the existing `valuation.valuation_audit_log` pattern for shape if a table is warranted; do not create a second audit vocabulary.

---

## 26. CANONICAL FACT COVERAGE (audited)

**Registry reality:** 47 declared keys; **10 pilot** (`revenue, gross_profit, gross_margin, net_income, reported_ebitda, normalized_ebitda, owner_compensation, cash, debt, customer_concentration`); served by `canonicalFactService` for pilot keys only. Production `business_facts` rows: **0**.

| Document type that can legitimately produce facts | Registry keys already covered | Keys extracted today but **not** canonical |
|---|---|---|
| P&L | revenue, gross_profit, net_income, reported_ebitda, owner_compensation, gross_margin(derived) | `cogs`, `operating_expenses`, `interest_expense`, `depreciation`, `amortization`, `total_expenses`, `taxes` |
| Balance Sheet | cash, debt, total_assets, total_liabilities, total_equity | `current_assets`, `inventory`, `accounts_receivable`, `accounts_payable` |
| Business tax return | revenue (via `gross_receipts`), net_income, owner_compensation (via `officer_compensation`) | `wages`, `deductions`, `taxable_income` |
| Payroll report | total_payroll, employee_count | `owner_payroll`, `payroll_tax` |
| Debt schedule | debt | `interest_rate`, `monthly_payment`, `maturity_date` |
| Personal tax return | agi | `total_tax`, `itemized_deductions`, `qualified_business_income` |
| **No registry path today** | — | bank statement, general ledger, trial balance, AR/AP aging, legal agreements, insurance, valuation report, business plan |

**Recommendation — six additions only, chosen for information value (each unblocks a real calculation):** `cogs`, `operating_expenses`, `depreciation_amortization`, `interest_expense`, `accounts_receivable`, `accounts_payable`. `interest_expense` and D&A unlock a *verified* EBITDA bridge; AR/AP unlock working-capital and quality-of-earnings. **Do NOT add** line-item or entity-specific keys (individual customers, GL account names, legal clause text) — those belong in evidence/`metadata`, not the registry. And do not promote anything that depends on a document type with no interpreter (legal/insurance/CRM), because it would create facts nobody can source.

---

## 27. END-TO-END EXAMPLES

**A. Owner says "around $5M last year", then uploads a P&L showing $5.18M.**
Ingestion: statement → gate (§10) → fact `revenue` FY(likely year), `source_type='owner_reported'`, `confirmed`, precision approximate; P&L → interpreter → observation → promotion → a **second** `revenue` fact for the same period, `source_type='document_extraction'`, `confirmed` after review. Evidence: conversation reference; document + page. Resolution: authority — document beats owner estimate (per registry candidate order `verified_tax_return > uploaded_financials > owner_estimate`); difference 3.5% is **below** the 5% materiality → selected = P&L, owner estimate kept as an **alternative**, not a conflict. Galileo: *"Your FY2025 revenue is $5.18M from your P&L. You'd originally said about $5M — consistent, so I'm using the statement."* UX: label **FROM YOUR P&L** on the value, drawer shows both.

**B. P&L says $5.18M revenue; tax return says $5.24M gross receipts.**
These differ in **definition** (revenue vs gross receipts) even if the period matches → same `fact_key='revenue'`, different `metric_definition`, same 5% tolerance ⇒ 1.2% variance, below threshold ⇒ **not a conflict**, higher-authority source (`verified_tax_return`) selected, alternative retained. Galileo: *"Your tax return shows $5.24M gross receipts and your P&L $5.18M — a 1% difference between two definitions, so no reconciliation needed."* If the variance had exceeded 5%, the resolver returns `conflict` and Galileo **asks** rather than choosing.

**C. Owner says EBITDA $700K; P&L-derived suggests $520K; expert later verifies normalized EBITDA $640K.**
Owner statement → `reported_ebitda` confirmed(owner). P&L → `reported_ebitda` document fact. 34% spread at equal-ish authority ⇒ **material conflict** ⇒ Galileo: *"I have two materially different EBITDA figures ($700K you told me, $520K from your P&L). I need this reconciled before valuation."* Expert review writes `normalized_ebitda` `verified` + `expert_review` + `verified_by_profile_id`; the registry requires `verified` for `normalized_ebitda` already, so valuation proceeds on the verified fact while both reported figures remain as evidence. Nothing is overwritten.

**D. QuickBooks connected after manual inputs exist.**
Connected observations enter as `verified` `connected_source` facts with `verified_by_service='connected_accounting'`, TTM period type. They **do not overwrite** the FY facts: different `period_type` ⇒ different conflict identity ⇒ coexist. Resolver selects per requested period. UX label **CONNECTED TO QUICKBOOKS**; owner statement retains **YOU PROVIDED** and drops to an alternative. Business intelligence coverage rises; confidence per fact is recalculated from authority, not from the connection itself.

**E. Corrected P&L replaces the previous P&L.**
New upload, same type, different content hash ⇒ **new version**; prior document marked `REPLACED`; its evidence rows marked `source_status='deleted'`/tombstoned (never dropped). New observations promote to new facts; where a value changed, the new fact **supersedes** the old (`supersedes_fact_id` + reason) and the old fact's attestation survives per 6C. Galileo: *"You uploaded a corrected P&L. Revenue changed from $4.9M to $5.18M for FY2025 — I've superseded the old figure but kept the history."*

**F. Scanned 80-page tax return.**
Today: single call, no page awareness, likely `no_fields_extracted` or a low-quality read. Target: page-batched extraction with page numbers recorded in evidence; PARTIAL state if only some pages yield; the return's `gross_receipts`/`officer_compensation` promote only after review; if the scanner quality defeats text extraction, the document lands in `NEEDS REVIEW` with the reason in owner language. Never a silent "completed".

**G. XLSX general ledger, 50,000 rows.**
Today: one model call over a spreadsheet → unreliable, expensive. Target: **native parser first** (sheet-by-sheet, streamed) → structural normalization (accounts, period, debit/credit) → GL interpreter → candidate facts (revenue, COGS, opex, owner comp by account mapping) with `source_form='GL'` and line locators; chunked, resumable, deduplicated by content hash; UI shows **"preview unsupported, extraction available"** with the parsed summary table (§19).

**H. `Q4_ProfitLoss.pdf` metadata + extraction survive, object missing.**
Proven live case. Ingestion: nothing new happens (no re-upload). Evidence: the document evidence row is marked `source_status='deleted'` + `deleted_at`; the extraction remains. Facts: already-promoted facts keep their provenance. Resolution: unchanged — the fact stays, flagged with a degraded-source note. Galileo: *"I still have what I extracted from Q4_ProfitLoss.pdf, but the original file is no longer available. Re-upload it if you need the source."* UX: viewer shows a first-class **SOURCE MISSING** panel with a re-upload action that re-links the same evidence rather than duplicating it.

---

## 28. RECOMMENDED ARCHITECTURAL MODEL

**EVIDENCE-CENTRIC — as expected — with one mechanical refinement.**

- **Document-centric** is rejected: it makes the file the unit of truth, so a missing object (proven, 4 rows today) destroys knowledge, and duplicates/versions multiply truth.
- **Fact-centric** alone is rejected: it hides *how* a number was obtained and cannot represent disagreement, so it forces the resolver to pretend certainty.
- **Evidence-centric** is right: documents, owner statements, connections, assessments and experts are all **evidence sources** producing observations; `business_facts` holds **statements** with provenance; the resolver holds **current understanding**; BIS holds the **authoritative read model**; Galileo **explains and improves**.

The refinement the repository forces: **keep `extracted_fields` as the observation layer and `business_facts` as the statement layer** — not a replacement, exactly as 6C's own header states ("NOT a replacement for extracted_fields, stays an OBSERVATION layer"). Mutability differs by nature: observations are reviewable, statements are append-only.

---

## 29. IMPLEMENTATION ROADMAP

Ordering is dictated by two measured facts: **89% of the funnel dies before the review gate** (32 failed + 19 stuck) and **the fact layer is deployed but empty**, with the legacy path already serving Galileo.

### 6D.0 — Extraction integrity and failure truth (prerequisite, small)
- **Objective:** make the pipeline honest and un-stick it, without changing architecture.
- **Exact change:** report the extractor's real confidence (never a constant), persist the AI-reported `reporting_period`, fix the retry recursion (pass `base44`), stop deleting reviewed fields on retry, resolve the extraction bucket from the document row (never hardcoded), surface `unsupported_type` as its own owner-facing state, and add a scheduled sweeper for stale `queued` analyses.
- **Reused:** `extractEngine`, `runExtraction`, `document_analysis`, existing workflow capability.
- **Files/tables:** `shared/documentExtraction/extractEngine.ts`; `documents`/`document_analysis` status values only.
- **Migration?** No.
- **Security impact:** none new; D5 (bucket) removed as a side effect. D1/D3 remain tracked separately.
- **Test plan:** harness asserting no constant confidence, period persisted verbatim, retry preserves `base44` and prior review rows, bucket always from the row.
- **Rollback:** revert the engine file.
- **Stop conditions:** any change that alters `extracted_fields` shape or requires a backfill.

### 6D.1 — Fact Promotion Gate ← **THE RECOMMENDED NEXT SLICE** (see §30)

### 6D.2 — Parser router + interpreters (native-first)
- **Objective:** stop using a model where a parser is correct, and give `other`-typed documents real readers.
- **Exact change:** router + per-type interpreter registry; native CSV/XLSX parsing; add bank statement, GL/trial balance interpreters; extend `document_type` list in lockstep with interpreter existence (a type is offered **only** if it can be read).
- **Reused:** `EXTRACTION_SCHEMAS` shape, `parseCurrency`, `normalizeExtraction`, review UI.
- **Files/tables:** `shared/documentExtraction/router.ts`, `interpreters/*.ts`; no table changes.
- **Migration?** No. **Security:** parsers run server-side; no new exposure.
- **Test plan:** fixture files per interpreter; assertion that every offered type has an interpreter (kills the 24 `other` failures).
- **Rollback:** interpreter registry is additive. **Stop:** if a native library can't be pinned and sandbox-safe.

### 6D.3 — User-statement gate (§10)
- **Objective:** owner statements become eligible evidence.
- **Change:** statement detector → confirmation UI → candidate fact → promotion gate.
- **Reused:** `askGalileo` context, `business_facts`, `GalileoConversation`.
- **Migration?** No. **Security:** actor/business strictly from session (P-S3 pattern).
- **Stop:** any path that writes a fact without explicit owner confirmation.

### 6D.4 — Resolver on facts → BIS
- **Objective:** the resolver's inputs become `business_facts`; BIS consumes resolved facts.
- **Change:** resolver data source swap + 6C period identity; keep selection algorithm.
- **Reused:** `resolver.ts`, `sourceHierarchy.ts`, `reportingPeriod.ts`, `businessIntelligenceContract`.
- **Stop:** any dual-read that risks two different truths for one metric (cut over per fact key, with a comparison report first).

### 6D.5 — Galileo evidence reasoning + evidence UX (§14, §17)
**6D.6 — Expert verification authority matrix (§12)** (configuration, no schema).
**6D.7 — Universal viewer + SOURCE MISSING recovery (§18, §19)** — includes removing the storage object on delete.
**6D.8 — Duplicates/versioning, retention, document audit events (§22, §24, §25).**

---

## 30. THE ONE NEXT IMPLEMENTATION SLICE (not implemented)

### **6D.1 — FACT PROMOTION GATE**
*Turn the deployed-but-empty Digital Twin into the real one, using the human review gate that already exists as the trust filter.*

- **Why this one:** the fact layer, its constraints, its append-only trigger and its derived conflict view are **already live in production with zero rows and zero code paths**. This is the smallest change that makes the target architecture real rather than theoretical, it requires **no migration**, it never touches the extraction pipeline (so it cannot worsen the funnel), and its trust gate is `extracted_fields.review_status='accepted'|'corrected'` — a decision a human already made. It also defines the contract every later phase (statements, connections, experts) writes through.
- **Honest caveat:** only **5** fields have ever been decided (4 accepted, 1 corrected), so today this slice produces a handful of facts. Its value is the *mechanism*, the *contract*, and the *harness*. Volume arrives when 6D.0 and 6D.2 revive the funnel. If you would rather buy user-visible value first, swap this for **6D.0** — that is the only defensible alternative.

**Files expected (new; no existing product file modified except one call site):**
- `base44/shared/factPromotion/promotionPolicy.ts` — pure: which field names map to which registry key, per document type; period/basis resolution from `extracted_fields.metadata`; requires-period/requires-basis rules.
- `base44/shared/factPromotion/factWriter.ts` — pure-ish: builds the `business_facts` row + `business_fact_evidence` row from one accepted field; computes `fingerprint`; decides propose-vs-supersede.
- `base44/functions/promoteReviewedFieldsToFacts/entry.ts` — authenticated, service-role writer; canonical actor + business authorization **before** any read; pilot keys only.
- one call in `base44/functions/updateExtractedFieldReview/entry.ts` (post-review, non-fatal) — the only edit to an existing file.

**Tables expected:** **none new.** Writes only `business_facts` and `business_fact_evidence` (both already deployed, RLS with zero client write policies → service-role only, as designed).

**Functions expected:** `promoteReviewedFieldsToFacts` (new); reuse `authenticateActor`, `resolveActingProfile`, `requireBusinessContext`; no new connector.

**Test harness (`scripts/factPromotionGate.test.cjs`, offline, mirroring the P-S3 harness style):**
executes the real compiled modules against a mock Supabase client, asserting: only `accepted`/`corrected` fields promote · non-pilot keys are refused · fingerprint idempotency (second run = 0 new rows) · corrected value supersedes (old fact `superseded_at` set, new fact linked both ways) · `business_fact_evidence` row carries document/analysis/field ids · **cross-business refusal** (an actor for business A cannot promote business B's field) · **no write without a canonical actor** · no write when the business is unauthorized · no `verified` status produced by promotion (only `confirmed`, per 6C constraints) · mutation tests that catch a regressed gate.

**Success criteria:** (1) harness 100% pass including mutations; (2) `business_facts` row count moves from 0 to the number of decided pilot fields for the test business; (3) fingerprints stable across re-runs; (4) `build` exits 0; (5) no change to any existing table, RLS policy, or the extraction engine; (6) a cross-business attempt is refused with the same indistinguishable refusal the kernel already produces.

---

## 31. EXISTING COMPONENTS TO REUSE (do not rebuild)

`business_facts` / `business_fact_evidence` / `business_fact_conflicts` + append-only trigger + RLS · `canonicalFact/registry.ts` (47 keys, candidate sources, materiality) · `canonicalFact/resolver.ts`, `sourceHierarchy.ts`, `reportingPeriod.ts`, `lineage.ts`, `clientSafe.ts` · `extractEngine` (+ `parseCurrency`, `normalizeExtraction`, `buildExtractionSchema`) · `documents` / `document_analysis` / `extracted_fields` · the review UI (`ExtractedFieldsReviewQueue`, `updateExtractedFieldReview`) · `documentReadiness.js` `SYSTEM_FOLDERS` + `DocumentFolder`/`DocumentClassification` entities · `DocumentViewer` + `useDocumentViewer` (one viewer) · `authorizeDocumentAccess` + `documents/buckets.ts` (bucket policy) · `authenticateActor`, `resolveActingProfile`, `requireBusinessContext`, `assertBusinessAccess`, `validateBusinessScope` · `buildGalileoContext`, `askGalileo`, `canonicalFactService`, `businessIntelligenceContract`, `confidenceEngine` · `EvidenceDrawer`, `ExplainWithGalileo`, `WhyButton`, `GalileoBadge` · the security-harness pattern (`scripts/*.test.cjs`) and the change-surface assertion style.

## 32. COMPONENTS THAT SHOULD BE RETIRED (after 6D, with evidence)

- `documents.storage_path` (0 writers, 0 readers) and `documents.bucket` (constant `'documents'` on all 67 rows, including 7 library files whose true bucket differs).
- The duplicated action surface in `supabaseDocumentData` (`getDocuments`, `uploadDocument`, `upsertDocument`, `getDocumentAnalysisQueue`, `updateExtractedFieldReview` duplicate `supabaseUserData`).
- `classifyDocument` call sites **or** the missing function — the classification queue must either be wired to a real classifier or removed; a UI calling a nonexistent function is worse than no UI (D10).
- The `advisor_assignments` branches in `runDocumentExtraction` and `uploadDocumentToSupabase` (the table does not exist in production — D2).
- `MOCK_EXTRACTIONS` — **keep**, it is explicitly opt-in and unreachable in production; do not delete, but do keep it fenced from any fallback path.
- Legacy reliance on `documents.file_url` (24 h signed URLs) as a viewable link.
- `derivePeriodFromType`'s calendar-year default as a *silent* substitution (replace with explicit "period unknown → ask").

## 33. UNKNOWNS REQUIRING RUNTIME EVIDENCE

Not answerable from the repo; each is a specific, read-only check:
1. Whether `ExtractDataFromUploadedFile` performs OCR internally, and on which page/size limits — not exposed by the integration contract. **Proof needed:** a scanned-PDF fixture through the real integration, with the returned field values compared against a native-text equivalent.
2. Whether DOCX/XLS/WEBP uploads (allowed by the allowlist) can actually be read by the extractor — currently a **guaranteed-silent failure** class. **Proof:** one file per allowed-but-undocumented extension.
3. Which rows are the other 3 object-missing documents, and whether any belong to an active client. **Query:** the same `storage.objects` anti-join, returning ids (not names) for review.
4. Whether the 19 June-`queued` analyses belong to live businesses or abandoned test rows. **Query:** group by `business_id` presence and document `document_type`.
5. Cost per extraction call and total 6D budget — integration-credit dependent.
6. Whether `public.documents` and `document_analysis` currently have RLS enabled with zero client write policies (S2 asserts containment for storage; table-level policy state was **not** re-verified in this audit).
7. Whether `can_access_business` exists in production (6C's precondition proves it did at install time; re-verify before 6D.1 depends on it).
8. Whether guest uploads exist in production today (`guest_sessions` rows) — determinable by a read-only count; retention design depends on it.
9. Whether the 157 objects in `documents` include orphaned guest or deleted-document objects (affects cleanup scope).
10. Whether `business_facts` was installed as rev3 exactly — **partially verified**: the rev3-only constraints (`verified_by_service_vocab`, `verified_service_method_alignment`, `superseded_by_same_business_fk`) and the append-only trigger are present, which indicates rev3. `authority_policy_version` semantics remain unexercised (0 rows).

**Documentation debt found:** `phase_6c_digital_twin_facts.sql` is headed **"NOT EXECUTED"** while its objects (including rev3-only constraints) **are live in production and hold 0 rows**. The file's status marker is stale and should be corrected in a documentation-only change, because an artifact that contradicts production is a governance risk.

## 34. RISKS / STOP CONDITIONS

| Risk | Why it matters | Stop condition / mitigation |
|---|---|---|
| Promoting facts before D1–D3 are resolved | the promotion writer is service-role, so a Base44-role escalation anywhere upstream could feed it | **STOP** if any promotion trigger path trusts `user.role`, a body `profile_id`, or a client-supplied `business_id` |
| Dual truth during resolver cutover (6D.4) | two sources answering "revenue" differently breaks trust irreversibly | **STOP** unless a comparison report shows zero divergent values across live businesses |
| Native parser introduction | a mis-parsed GL/XLSX is worse than a failed extraction (silent wrong facts) | parse must be deterministic + fixture-tested per type; facts from parsers still pass the review gate |
| Content hashing / versioning | mistaken "duplicate" detection could hide a genuinely corrected document | hash equality must **offer**, never auto-merge |
| Storage containment (D6/D7) | 157 objects vs 59 rows; guest writes into the client bucket | **STOP** on enabling/growing anonymous upload until the guest prefix and TTL sweep exist |
| Fact volume explosion | promoting every extracted field into the registry would create hundreds of low-value facts | promotion is **pilot-keys-only**; new keys only via §26's six, each justified by a calculation |
| Retiring duplicated surfaces | `supabaseDocumentData` actions are consumed by live UI | retire only after a call-site audit per action; never both at once |
| Period semantics | "last year", TTM, FY and fiscal calendars are the top source of false conflicts | **STOP** if a period cannot be represented as `period_type` + bounds; ask instead |
| Registry authority drift | `source_authority_at_ingestion` is a snapshot by design; the resolver must rank on the current policy | no fact write without `authority_policy_version` recorded |

---

### AUDIT CLOSURE

Nothing in this phase was implemented, migrated, published, or committed as product code. One documentation file was created (`src/VISION_PHASE_6D_EVIDENCE_INTELLIGENCE_AUDIT.md`); the platform may auto-commit file writes — if it did, that commit contains **this report only**. All production access was read-only (catalog + aggregates), performed through the app's authorized Supabase connector, and no row was written, updated or deleted.

**STOP FOR REVIEW.**