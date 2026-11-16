# VISION — DOCUMENT UNDERSTANDING & GALILEO INTELLIGENCE
## POST-HOTFIX ARCHITECTURE AUDIT (READ-ONLY DIAGNOSIS + DESIGN)

**Status:** DIAGNOSIS AND DESIGN ONLY. No product code changed. No production row written. No commit created. Nothing published.
**Method:** read-only inspection of shipped code + read-only SQL against production (project `tfrbswfrhrtgfcgonimb`, `/database/query/read-only`).
**Authoritative prior semantics preserved:** Phase 6C lifecycle states, 6D.0 extraction integrity, S3.1 document authorization, P5 viewer contract.

---

# PART I — WHAT IS ACTUALLY HAPPENING TODAY

## 1. The reviewed field traced (Phase 0)

**Chosen value:** `gross_receipts` = **$1,250,000**, `review_status = accepted`, source `business_tax_return`, reviewed 2026-10-02, business `42f42075-c453-436a-8c5f-2dc29ef718c6` ("My Business", Residential Building Construction).
Co-traced: `ordinary_business_income` $187,500 (accepted), `taxable_income` $187,500 (accepted), `wages` $425,000 (accepted, 2026-10-04), `owner_compensation` $150,000 (accepted), `gross_profit` $625,000 (accepted), `total_expenses` $1,100,000 (**corrected**).

Production state at trace time: `documents` 71 · `document_analysis` 60 · `extracted_fields` 80 · `business_metric_snapshots` 66 · `dashboard_metrics` 6 · **`business_facts` 0 · `business_fact_evidence` 0**.

### Layer-by-layer trace

| Layer | VALUE PRESENT? | VALUE | SOURCE | PERIOD | BASIS | REVIEW STATE | VERIFICATION STATE | BUSINESS_ID | USED BY NEXT LAYER? |
|---|---|---|---|---|---|---|---|---|---|
| `documents` | yes | doc row exists | upload (`business_tax_return`, 2026) | `year` column only | — | n/a | n/a | `42f42075…` | yes (analysis is created) |
| `document_analysis` | yes | analysis row | engine | period inside `extracted_data` JSON only | — | n/a | n/a | `42f42075…` | yes (fields written) |
| `extracted_fields` (observation) | **yes** | **1,250,000** | Form 1120-S reader | `tax_year` column; **no period bounds** | none | **accepted** | none (no verification concept here) | `42f42075…` | **NO — breakpoint (§2)** |
| `review` write path | yes | same row updated | `updateExtractedFieldReview` | unchanged | — | accepted/corrected | — | — | fires `regenerateCiqMetrics` only |
| `dashboard_metrics` | **0 rows for this business**; live table has **no `revenue` column** (SQL 42703) | — | — | — | — | — | — | — | contract read yields null |
| `assessment_calculations` | 0 rows for this business | — | — | — | — | — | — | — | contract's primary source empty |
| `business_metric_snapshots` | yes (53 rows, latest 2026-10-04) | not read in this pass | CIQ/assessment path | `period_label` exists | — | — | — | `42f42075…` | contract's last fallback |
| `business_facts` | **NO (0 rows)** | — | — | (`period_label`, `period_start/end`, `period_type` columns exist) | — | — | — | — | resolver returns *missing* |
| `business_fact_evidence` | **NO (0 rows)** | — | — | — | — | — | — | — | no lineage |
| `BIS` / Shared Intelligence Contract | **no revenue from documents** | `revenue = docRevenue ?? dashboard_metrics?.revenue ?? snapshots[0].annual_revenue` | assessment/snapshot-driven | none | none | — | — | — | **feeds Galileo** |
| `buildGalileoContext` | accepted field DOES arrive as a *list entry* (`accepted_financial_fields`), never as a *metric* | `revenue.value = contractRev ?? docRevenue(**)?? null` | contract | **none in `current_metrics`** | none | — | — | — | Galileo prompt |

(**) `docRevenue` is also null here — see §2.

## 2. First propagation breakpoint (exact)

**Breakpoint: between the reviewed observation (`extracted_fields`, accepted) and metric resolution.** Two independent, provable causes:

**(a) A field-name vocabulary mismatch, duplicated in two consumers.**
`buildGalileoContext` (lines 268-279) and `businessIntelligenceContract` (lines 287-301) each contain their own copy of:

```ts
const match = accepted_fields.find(f => f.field_name?.toLowerCase().includes(name.toLowerCase()));
const docRevenue = getAcceptedField(['revenue', 'total_revenue', 'gross_revenue']);
const docProfit  = getAcceptedField(['net_profit', 'net income', 'net_income']);
const docEbitda  = getAcceptedField(['ebitda', 'operating income']);
```

The tax-return reader's real field names are `gross_receipts`, `ordinary_business_income`, `officer_compensation`, `wages`, `deductions`, `taxable_income`. **`gross_receipts` contains no substring "revenue"; `ordinary_business_income` contains none of `net_profit` / `net income` / `net_income`.** Therefore the *accepted* $1,250,000 revenue exists in the database and is invisible to both resolvers. Verified as the only accepted-field names present for this business.

**(b) There is no promotion step.**
`updateExtractedFieldReview` writes **only** the `extracted_fields` row (`review_status`, `reviewed_by/at`, `accepted_value`, `accepted_normalized_value`) and then calls `regenerateCiqMetrics` fire-and-forget. It does **not** write `dashboard_metrics`, `business_metric_snapshots`, `business_facts`, `business_fact_evidence`, or any contract input. `regenerateCiqMetrics` reads `business_assessments` and `assessment_calculations` — it never reads `extracted_fields`.

Consequence: **accepting a field changes nothing except that one row.** The reviewed→canonical bridge that exists (`createSnapshotFromReviewedFields`, which holds the *correct* mapping `gross_receipts→annual_revenue`, `ordinary_business_income→net_profit`, `officer_compensation→owner_compensation`, `wages→payroll`) is (i) invoked only from one admin review screen, and (ii) **schema-incompatible with the live table** — it inserts `business_metric_snapshots.data`, and the live column does not exist (SQL 42703). So even the manual bridge fails where it matters.

Also proven: `owner_compensation` has **no metric at all** in `current_metrics` or the contract, and `businessIntelligenceContract` hardcodes `gross_profit: null` (line 487), so the accepted `gross_profit` $625,000 can never surface either.

## 3. Why Galileo ignored / missed reviewed information (Phase 1)

Distinguished by evidence, class by class:

**A. DATA DOES NOT EXIST — for the business that was most likely active.** Reviewed fields exist for exactly **one** business (`42f42075…`, 7 rows). The fresh smoke-test uploads belong to a **different** business: `b3e5ceb3-edfe-4124-bfd7-17faaed2a54f` (5 documents, **3 failed with `document_type='other'`**, 2 analyses `unsupported`, **0 reviewed fields**). For `b3e5ceb3…`, "revenue is missing" and "officer compensation is missing" are *correct* statements. **This is the primary suspected cause of the smoke-test symptom and it is an association/context problem (§9), not a resolver bug.**

**B. DATA EXISTS BUT THE METRIC LAYER CANNOT SEE IT — for `42f42075…`.** As §2: revenue $1.25M and net income $187.5K are accepted yet unmatched by name; officer compensation has no destination metric; gross profit is hardcoded null. The value reaches Galileo only as an unstructured list item.

**C. GALILEO SEES A DIFFERENT PERIOD / BASIS.** `profile_financials` for the same profile carries `annual_revenue = 3,850,000`, `estimated_ebitda = 308,000`, `normalized_ebitda = 924,280` — an assessment/projection-derived basis. `business_metric_snapshots` (53 rows for this business) is the contract's final fallback and is CIQ/assessment-derived. Neither carries a document-derived period. So when the matcher fails, Galileo's "current" revenue comes from a projection layer, not from the reviewed P&L/return — exactly the reported "older/projected intelligence".

**D. GALILEO SEES A LOWER-AUTHORITY CONFLICTING VALUE.** `dashboard_metrics` (6 rows app-wide, **0 for this business**) is read by name, but the live table has **no `revenue` column**; that read silently yields nothing rather than erroring. The `dashboard_metrics` layer is therefore a *phantom* fallback: it cannot contribute, and it cannot be trusted to hold what the contract expects.

**E. REASONING GATE.** The canonical-fact adapter (`loadCanonicalFactsForConsumer`) is read-only and explicitly "NO WRITES. NO PROPAGATION."; with `business_facts` empty it resolves nothing, `getPreferredValue` returns `source:'none'` for unresolved facts, and conflicts would suppress fallback rather than substitute. `buildGalileoContext` then pushes `'accepted_financial_fields (no reviewed document data)'` / `'financial_metrics (revenue, net_profit)'` into `missing_data` **when the resolved metrics are null**, and the prompt tells the model to answer from the context. The model's response schema then invites a `missing_data` explanation. That is the mechanism behind "clarify your extracted data".

**F. Review pressure from an unreviewed backlog.** 71 of 80 `extracted_fields` rows are `pending_review` (only 6 accepted, 1 corrected), and the same field is duplicated up to **3× per document** (`4535c3fc…` annual_revenue/net_profit/gross_profit ×3; `7f93c562…` total_expenses/owner_compensation/net_profit ×3). A user looking at that queue is told to clarify; Galileo looking at it sees an unfinished review state.

**Not resolved by this pass (must not be inferred):** which business was active for the specific conversation. The decisive next read is the `galileo_conversations` row for that exchange (`business_id` is stored per Phase 6A) plus the exact assembled context.

## 4. Current document-classification path

```
upload (DocumentUpload / admin uploaders / drive import)
  → user picks a type from 11 canonical values  (or leaves the default = "other")
    → uploadDocumentToSupabase: normalizeDocumentType(type)
      → documents.document_type  +  documents.upload_status
      → document_analysis row (analysis_status = queued → … )
        → runDocumentExtraction → extractEngine
             EXTRACTION_SCHEMAS[document_type] present ?
               yes → ExtractDataFromUploadedFile(signedUrl, schema) → extracted_fields rows
               no  → analysis_status = 'unsupported'
                     kind = classification_unsupported ('other'/'unknown'/'')
                          | extraction_unsupported (named type, no reader)
```
**There is no content-based classification anywhere in this chain.** `document_type` is a *user assertion* or the sentinel `other`; the engine's only decision is *does a reader exist for that name*.

## 5. Explicit manual classification behavior (audited)

- 11 selectable values; 6 have readers (`profit_and_loss`, `balance_sheet`, `business_tax_return`, `personal_tax_return`, `debt_schedule`, `payroll_report`), 5 are stored-only (`insurance_document`, `entity_document`, `buy_sell_agreement`, `estate_document`, `other`).
- `AUTO_DETECT_DOCUMENT_TYPE` (the "Not sure" sentinel) maps to `other` → `classification_unsupported` → stored, no reader, Data Room shows *Not yet supported* (6D.0 hotfix behavior — correct and unchanged).
- A user CAN re-type via `DocumentClassificationOverride` (admin) and via the classification review queue; correction is recorded in the Base44 `DocumentClassification` entity, not in Supabase `documents` history.
- Production evidence of the gap: **26 of 71 documents are `other`** for `42f42075…` alone, and 27 rows are `other/failed` app-wide. Recognizable PDFs (tax returns, P&Ls) were filed as `other` because the type was never determined.

## 6. Proposed automatic classification architecture (design only)

**One new engine, no new infrastructure: `classifyDocument()`** — a backend shared module beside `extractEngine`, reusing the *same* platform capability the extraction path already uses.

```
document bytes (already in Storage)
  → signed URL (existing, authorized path only)
  → ExtractDataFromUploadedFile(file_url, CLASSIFICATION_SCHEMA)   ← same Core integration, one call
      CLASSIFICATION_SCHEMA asks for: document_family, document_type, document_subtype,
      entity_name, tax_year/reporting_period, period_start/end, accounting_basis,
      page-1 headings/form numbers observed, confidence, evidence strings
  → normalize + validate against the canonical taxonomy (never trust free text)
  → map to reader_key via the reader registry
  → confidence band (§8) → auto-file / suggest / ask
  → persist a CLASSIFICATION RECORD (Base44 `DocumentClassification`, §9) — never overwrite history
  → only then: set documents.document_type (the reader key) and route extraction
```
Why this is the *smallest* architecture: PDF text/structure, XLSX/CSV structure and image OCR are already reachable through `ExtractDataFromUploadedFile` (pdf, csv, xlsx, json, html, png, jpg, jpeg). `buildExtractionSchema()` already generates a JSON schema and already extracts `reporting_period` from content — the same mechanism carries the classification schema. **No new npm dependency, no PDF parser, no OCR pipeline is required for the golden path.** A deterministic pre-pass (filename, MIME, page count, form-number regex) is an *optional* cheap signal, not a dependency.

## 7. Classification signals (content dominates)

| Tier | Signal | Weight (design intent) | Source |
|---|---|---|---|
| 1 | Document content: headings, form numbers (1120-S, 1065, 1040, Schedule K-1, W-2, 1099), statement titles, table column names, totals | **decisive** | `ExtractDataFromUploadedFile` on content |
| 2 | Structural: table shape, page 1 layout, currency/percentage density, dated column headers | strong | same pass |
| 3 | Entities in content: legal entity name, EIN/SSN-masked, tax year, "For the year ended", accountant/issuer | strong | same pass |
| 4 | Existing metadata: `tax_year`/`year`, `entity_id`, upload source, prior classification of the same document | medium | `documents`, `DocumentClassification` |
| 5 | Filename tokens ("2025 Taxes", "P&L", "1120-S") | **weak — corroborating only** | `documents.name`/`file_name` |
| 6 | Extension / MIME | **format only — never a type signal** | upload validation |

Hard rule: **filename may never be authoritative**; a filename signal can raise confidence only when content agrees, and content alone can classify a file with a meaningless name (`scan_0042.pdf`).

## 8. Confidence model (bands, not arbitrary thresholds)

Recommended calibrated bands, derived from *agreeing signal count* + provider confidence + consequence:

| Band | Condition (design) | Behavior |
|---|---|---|
| **High** | content-derived type + subtype + at least one of {entity, period} agree, no competing type within 20%, provider confidence ≥ ~85 | classify, file, extract — **no interruption** |
| **Medium** | content-derived type is clear but subtype/period/entity incomplete, or two plausible types | classify provisionally, suggest folder, **one lightweight confirmation** in Galileo |
| **Low** | no schema-valid type, conflicting signals, or unreadable content | **store safely** (never lose the file), file under *Inbox/Other*, ask the user to identify |
| **Unreadable** | OCR/structure unavailable (scanned image with no text, unsupported container) | store + `classification_status='pending'`, say what is needed |

Bands must be **measured before being trusted**: a shadow log of (signal set → classification → user correction) is what calibrates them. Do not pick numeric cut-offs in code review; derive them from the first N real corrections.

## 9. Classification output contract (audited against the live schema)

The schema *already exists* and is unused. `DocumentClassification` (Base44 entity) carries: `document_id`, `document_name`, `profile_id`, `business_id`, `suggested_folder`, `suggested_subfolder`, `applied_folder`, `confidence_score`, `classification_status` (`pending|auto_filed|awaiting_review|approved|rejected|overridden`), `classification_source` (`galileo_auto|galileo_suggest|user_manual|admin_manual`), `reasoning`, `document_type`, `extracted_keywords`, `tax_year`, `reviewed_by_*`, `original_folder`, `filed_at`.

Proposed canonical result (fields marked ⚠ are **not** covered today and are the only plausible additions; none require a Supabase migration because this is a Base44 entity):

| Field | Today | Where it lives |
|---|---|---|
| `file_format` (container) | ✗ (derivable from extension/MIME at upload) | ⚠ `file_format` on upload metadata, or derive |
| `mime_type` | ✗ | ⚠ derive at upload (browser provided) |
| `document_family` | ✗ | ⚠ add to entity (`tax`, `financial_statement`, `payroll`, `banking`, `debt`, `legal`, `insurance`, `estate`, `operations`, `other`) |
| `document_type` (canonical reader key) | ✓ | entity field + `documents.document_type` |
| `document_subtype` (1120-S, K-1, W-2, Q4 P&L, …) | ✗ (only `suggested_subfolder` approximation) | ⚠ `document_subtype` |
| `business_or_personal` | partially (`document_scope`) | entity/scope |
| `entity_name`, `entity_identifier` | ✗ (from content) | ⚠ keep in `reasoning`/JSONB until proven |
| `tax_year`, `reporting_period`, `period_start/end`, `accounting_basis` | `tax_year` ✓ only | ⚠ `reporting_period`/`period_start`/`period_end`/`accounting_basis` |
| `suggested_business_id` | ✗ | ⚠ `suggested_business_id` (PROPOSAL ONLY — never authorization) |
| `suggested_folder` / `applied_folder` | ✓ | entity |
| `reader_key` | derivable from `document_type` | keep derived, not duplicated |
| `classification_confidence`, `classification_method`, `classification_evidence` | ✓ (`confidence_score`, `classification_source`, `reasoning`) | entity (+ `extracted_keywords`) |
| `requires_confirmation` | derivable from band | keep derived |

Rule: **do not duplicate the reader key, and do not persist a second status enum.** Persist the *evidence*, derive everything else.

## 10. Semantic document taxonomy (compared to what exists)

Existing reality: **6 reader types**, **20 Data Room folders**, **11 uploader values**, and the `ClassificationMemory` entity (keywords → folder learning) which is currently **orphaned — no code reads or writes it**.

Proposed taxonomy as a *vocabulary module* (data, not tables), mapped onto existing folders:

| Family | Types/subtypes proposed | Reader today? | Folder today |
|---|---|---|---|
| Financial statements | `profit_and_loss` (P&L, Q-# P&L), `balance_sheet`, cash flow, trial balance, general ledger, budget, forecast | P&L ✓, BS ✓; others ✗ | `profit_loss`, `balance_sheets`, `financial_statements` |
| Tax | `business_tax_return` (1120-S, 1120, 1065), `personal_tax_return` (1040, Sched C/E), K-1, **W-2 ✗**, **1099 ✗**, payroll filings, projections | 2 readers | `tax_returns` |
| Payroll | `payroll_report`, employee roster, compensation report, W-2/W-3 | `payroll_report` ✓ | `payroll` |
| Banking | bank statement ✗, credit card statement ✗, loan statement ✗ | none | `banking` |
| Debt | `debt_schedule` ✓, loan agreement ✗, LOC ✗ | 1 | `financial_statements` (should become `debt`) |
| Legal / entity | articles, operating agreement, buy-sell, partnership, corporate docs → existing `entity_document`/`buy_sell_agreement` (stored-only) | none | `legal`, `agreements` |
| Insurance | policy, declaration, coverage summary → `insurance_document` (stored-only) | none | `insurance` |
| Estate / wealth | trust, estate doc, investment statement → `estate_document` (stored-only) | none | `estate_planning`, `wealth_planning` |
| Operations | KPI report, CRM export, customer concentration, job costing, inventory | none | `operations`, `hr` |
| Other | `other`, `unknown`, `unsupported` | none | `other` |

Two findings that must shape the decision: **(i) classification support and extraction support are different axes** — the taxonomy can and should name W-2/1099/bank statement *before* readers exist; **(ii) the folder list and the type list are not 1:1** (a Q4 P&L and an annual P&L share one reader and one folder; a 1120-S and a 1040 do not share a reader but do share `tax_returns`). The taxonomy therefore needs *family → folder* and *type → reader* as two separate mappings.

## 11. Data Room automatic filing design

- Filing is **metadata/relationship organization, already available**: `DocumentClassification.suggested_folder` → `applied_folder` → `classification_status='auto_filed'|'awaiting_review'`, plus the `DocumentFolder` entity for the (user-visible) folder tree and `SystemFolderPanel` for the UI.
- **Never duplicate a document** to file it. One document, one classification record, one folder reference.
- Today's folder behavior is a **filename/type heuristic** (`suggestFolder()` regexes like `/tax.return|1120|1065|1040|k-1/`) presented as if it were knowledge. After 6D.0b it becomes evidence-backed: the *content* determines the type, and the type determines the folder.
- Audit caveat found in this pass: no folder/`system_folder` column exists in the live Supabase `documents` table (31 columns enumerated); folder state is served through the Data Room's own read path from the Base44 entities. **Confirm the exact write target of `updateDocumentFolder` before designing auto-filing persistence** — do not assume a Supabase column.

## 12. Business / entity association design

- `documents` already has `entity_id` and `business_id`; `extracted_fields` has `entity_id`. Entity resolution for a multi-business owner is therefore *available now*, unfilled.
- Design: classification extracts `entity_name` (+EIN/identifier when safely available) → match against the owner's **authorized** businesses (`business_entities.business_name`, aliases, `entity_type`) → produce `suggested_business_id` with confidence and evidence → require confirmation unless High band.
- Two hard rules: **(1) classification NEVER grants access** — a suggestion is not an authorization; all reads/writes remain governed by S3.1 / canonical actor / `requireBusinessContext`. **(2) Never auto-associate on fuzzy name alone** — a near-match without a second agreeing signal stays a suggestion.
- Live evidence this is a real problem: reviewed fields sit in `42f42075…` while fresh uploads sit in `b3e5ceb3…`; the user experience was almost certainly "I gave VISION information" against the wrong business scope.

## 13. Reader-routing architecture + 14. classification vs extraction support

```
document_type (canonical)  ──►  READER REGISTRY  ──►  extraction schema | 'no reader'
```
Make the registry explicit and single-sourced (today the reader set is derived from `EXTRACTION_SCHEMAS`, which is good; the *label/support* language around it is what confuses users):

| Concept | Meaning | Today |
|---|---|---|
| CLASSIFICATION SUPPORT | VISION can determine what the document IS | only when a human picks the type |
| EXTRACTION SUPPORT | VISION can read values out of it | 6 readers |
| STORAGE SUPPORT | VISION can hold it safely | all allowed extensions |

Target statement, verbatim: *"I recognize this as a W-2 and filed it under Tax Returns. I can't analyze W-2s yet."* — correct classification, honest extraction status, no upload-failure language. The hotfix already guarantees the *status* half; 6D.0b supplies the *recognition* half.

## 15. PDF / file-format terminology audit

- No "PDF isn't supported" copy was found in user-facing strings. The messages in force are type-based and correct: *"This document has not been classified into a type VISION can read yet…"* and *"VISION cannot analyze {type} yet — no reader exists for this document type."*
- Residual risk is **vocabulary drift**, not the PDF wording: `DocumentUpload.jsx` still reports *"unsupported extension .{ext}"* for genuinely unaccepted formats (heic/tiff/txt/rtf) while the accepted list does not include them. That message is about *upload*, so it must never be reused for a recognized-but-unreadable document type.
- Rule to encode: **PDF/DOCX/XLSX are containers; only the semantic classification decides what a document IS.** A recognized W-2 in a PDF is a *classification success* with an *extraction gap*.

## 16. Correction / reclassification architecture

The entity already supports the right shape — use it, don't invent a second one:

1. Classification writes a **new** `DocumentClassification` record (`classification_source='galileo_auto'`, `reasoning`, `confidence_score`).
2. User correction writes a **new** record with `classification_source='user_manual'`, `classification_status='overridden'`, `original_folder` preserved, `reviewed_by_id/role/at` set. **The prior record is never mutated or deleted** — evidence, original reasoning and confidence survive as history.
3. Re-routing to a different reader happens **only** on an explicit type change that has a reader: extraction re-runs as a *new analysis*, and previously reviewed `extracted_fields` for the old type are **preserved** (6D.0 preservation rules already guarantee this).
4. The document is moved between folders by updating `applied_folder` — **never by copying the file**.

## 17. Galileo classification UX (no new modals)

Galileo narrates classification in the conversation, using the existing Global Galileo bar:

- High: *"I found a 2025 S-Corp tax return for Apex Roofing and added it to Tax Returns."*
- Medium: *"This looks like a Profit & Loss for Apex Roofing covering Q4 2026. Is that right?"*
- Low: *"I'm not confident what this document is. What kind of document is this?"* (offering the 5 most likely types first)
- Reader gap: *"I recognize this as a W-2. It's stored under Tax Returns, but I can't analyze W-2s yet."*

Corrections are a one-tap reply in the same conversation; the review/override surfaces that already exist remain for depth.

## 18. Galileo / BIS source matrix (Phase 14)

| Source | GALILEO READS IT? | BIS / contract reads it? | REVIEW writes it? | AUTHORITATIVE? | LEGACY? | FUTURE? |
|---|---|---|---|---|---|---|
| `profiles` | yes (identity, `app_role`, `primary_business_id`) | indirectly (scope) | no | identity authority | — | — |
| `profile_financials` | **no** | **no** | no | assessment/projection store | yes | re-point to canonical at 6D.1+ |
| `business_entities` | yes (`business_profile`) | yes (`business_identity`) | no | business identity | — | — |
| `business_assessments` | yes (`gap_summary`) | yes (completion + score) | no | assessment state | — | — |
| `assessment_calculations` | only through contract | **yes — primary** for assessment-owned numbers | no | **highest for assessment-owned** | — | — |
| `dashboard_metrics` | via contract fallback (by name) | **yes — read by name** | **no** | read model | **yes — and currently schema-incompatible (`revenue` column absent)** | repair or retire |
| `business_metric_snapshots` | via contract (last fallback) + `financial_snapshots` (trend) | **yes — last fallback** | only via the manual snapshot function (which fails: `data` column absent) | historical | yes | keep as history only |
| `extracted_fields` | **yes** — `accepted_financial_fields` (list) + name-matched metric fallback | **yes** — same name-matched fallback | **yes — the only writer** | observation layer (raw) | — | becomes the sole input to fact promotion |
| `business_facts` | yes (canonical adapter) — **but empty** | via resolver | **no writer exists** | canonical statement layer (design) | unused | **6D.1 target** |
| `business_fact_evidence` | indirectly (`canonical_evidence_available`) | via resolver | **no writer exists** | lineage layer | unused | **6D.1 target** |
| Canonical fact resolver | yes (3 pilot keys applied to `current_metrics`) | via BIS | no | governs | — | extend |

## 19. Review / verification semantic audit (Phase 2)

| Action | DB row change today | Downstream recalculation today | Does NOT happen |
|---|---|---|---|
| **accept** | `extracted_fields.review_status='accepted'`, `accepted_value`, `accepted_normalized_value`, `reviewed_by/at` | `regenerateCiqMetrics` fire-and-forget (assessment-driven; does not read fields) | no snapshot, no `dashboard_metrics` write, no fact, no evidence, no verification |
| **correct** | same, with user-supplied value | same | same |
| **reject** | `review_status='rejected'` | none | value excluded from consumers (correct) |
| **needs_clarification** | `review_status='needs_clarification'` | none | excluded from consumers |
| **verify** | **does not exist in the document path** | — | no independent verification of a document-derived value anywhere |

Phase 6C semantics are untouched and remain authoritative (`proposed / confirmed / verified / rejected / superseded`). **Accept/correct produce CONFIRMED-level human attestation only, never `verified`.** Owner review is not independent verification; independent verification requires a *separate* actor/source (advisor, connected accounting) — this audit did not find any code that promotes document values into a verification state, and none should be added ad hoc.

## 20. Provenance model compatibility with 6C

Keep three orthogonal axes, exactly as the mission requires — and do not add a fourth:

```
SOURCE / PROVENANCE      user_provided | document_observed | connected_accounting | connected_bank
                         | connected_payroll | authoritative_filing
LIFECYCLE (6C)           proposed | confirmed | verified | rejected | superseded      ← authoritative, reused
MACHINE EVIDENCE         provider confidence per field (already stored per field)
SOURCE AUTHORITY         authoritative_filing > connected_accounting > document_observed > user_provided (by class)
HUMAN ATTESTATION        who accepted/corrected, when, in what role (already stored)
```
User-facing language stays plain ("You told me", "From your 2025 P&L", "Confirmed by you", "Verified by your advisor") but maps onto those axes. **No new persisted status enum.** The `business_facts` schema already has `source_type`, `confidence_score`, `verification_status`, `period_*`, lineage columns and a `business_fact_conflicts` table — enough to hold this without a migration.

## 21. Period / basis audit (Phase 18)

- `extracted_fields` has `tax_year` but **no** `period_start`/`period_end`/`reporting_period`/`accounting_basis` columns (31 columns enumerated). `document_analysis` likewise keeps the period only inside `extracted_data` JSON.
- `derivePeriodFromType()` **fabricates** an annual window from `documents.year`, defaulting to *last completed year* when absent — a derived assumption, not document evidence.
- `current_metrics` (what Galileo reasons over) carries **no period or basis at all**.
- Consequence: an FY2025 P&L revenue and a TTM revenue are indistinguishable downstream — the exact risk §18 forbids. Design requirement: any document-derived value that reaches a metric **must carry period bounds + basis**, or be labelled `period: unknown` and be ineligible for "current" reasoning. Note the extracted fields *can* already carry the model-reported `reporting_period` string (the engine parses it) — persist it on the field row before it is promoted.

## 22. Conflict reconciliation design

Use the proven parts instead of inventing: `canonicalFact.resolver.resolveFact` already filters by period compatibility, applies source authority via `sourceHierarchy`, uses a materiality threshold, and returns **conflict** rather than silently picking; `business_fact_conflicts` (with `period_label/period_start_key/period_end_key/period_type`) exists in production and is empty. Required behavior:

- Different periods are **not** a conflict — they are different facts; reason per period and say which period is missing.
- Same period + same class ⇒ highest authority wins, and the losing value is retained as evidence, not deleted.
- Same period + different class (reviewed P&L vs connected accounting) ⇒ surface the difference with both values and their provenance (the §19 example sentence) — never overwrite.
- Never let a projection/basis-derived value silently outrank a reviewed filing for the period it describes.

## 23. Knowledge Gap integration

The Journey asks questions; documents increasingly answer them. Rules:

1. Before asking, check whether a **confirmed** document-derived fact already answers it (period-aware). If yes, **do not ask**.
2. If partially answered, ask only the unresolved part (e.g., you have FY2025 revenue → ask for *current* TTM, not for "revenue").
3. If evidence conflicts, ask the **smallest decision-changing** clarification, presenting both values.
4. Never ask a question whose answer is sitting unreviewed in `extracted_fields` without first offering the review (the 71-row backlog is the current failure mode of this rule).

## 24. Universal-file capability matrix (runtime evidence)

Upload gate (identical in frontend and backend): **pdf, csv, xls, xlsx, doc, docx, png, jpg, jpeg, webp**. Everything else is refused at upload.

| Format | UPLOAD SUPPORTED | TEXT/STRUCTURE EXTRACTION | CLASSIFICATION POSSIBLE | SPECIALIZED READER | OCR REQUIRED | RUNTIME/LIBRARY |
|---|---|---|---|---|---|---|
| PDF (text) | ✓ | ✓ via Core `ExtractDataFromUploadedFile` | ✓ | ✓ (6 types) | no | platform integration only |
| PDF (scanned) | ✓ | provider-dependent | ✓ (provider OCR) | ✓ | yes (provider) | platform integration |
| CSV | ✓ | ✓ | ✓ | ✓ when typed | no | platform integration |
| XLSX / XLS | ✓ | ✓ | ✓ | ✓ | no | platform integration |
| DOCX / DOC | ✓ (accepted) | **not verified** | possible only if the provider reads it | — | — | ⚠ must be probed before claiming support |
| PNG / JPG / JPEG / WEBP | ✓ | via OCR | ✓ | ✓ | yes | platform integration (images) |
| TXT, RTF | ✗ (not in allow-list) | n/a | n/a | n/a | — | — |
| HEIC, TIFF | ✗ | n/a | n/a | n/a | — | — |

This matrix is **capability audited, not aspirational**: the only extraction engine in the product is the Core integration, invoked once per document with a generated JSON schema.

## 25. Golden-path architecture (target)

```
UPLOAD (authorized, business-scoped)
  → CLASSIFY      classifyDocument()  → classification record (evidence + confidence) [6D.0b]
  → ORGANIZE      type → family → folder (DocumentClassification.applied_folder)   [6D.0b]
  → EXTRACT       reader registry → extractEngine → extracted_fields
                  (period/basis + provenance persisted per field)
  → REVIEW        accept/correct/reject — observation layer only
  → PROMOTE       fact promotion gate → business_facts + business_fact_evidence      [6D.1]
                  (period-scoped, provenance-tagged, human attestation recorded)
  → RESOLVE       canonicalFact.resolver → BIS / Shared Intelligence Contract
  → GALILEO       contract + canonical facts; every metric answers "where from?"
```
Every step is business-scoped and authorized *before* it runs; classification never grants access; promotion is the **only** writer of canonical statements; Galileo never resolves facts independently.

## 26. Golden-path cross-layer test (permanent contract)

```
T1  upload "Apex Roofing 2025 P&L.pdf" (2 pages, no filename hint variant too)
T2  classification: file_format=PDF, type=profit_and_loss, entity=Apex Roofing, period=FY2025
T3  filing: folder resolved to Profit & Loss (no duplicate document)
T4  reader: profit_and_loss selected; extraction writes fields with period + source page
T5  review: revenue accepted → observation row updated; nothing else written
T6  promotion: business_facts gets revenue (FY2025) with lifecycle state + evidence row
T7  resolve: resolver returns FY2025 revenue with source authority + lineage
T8  Galileo: "What was my revenue last year?" → $5.18M "based on the P&L you reviewed"
T9  provenance: "Where did that come from?" → source document + page + review event
T10 period safety: asking for TTM revenue must NOT silently reuse FY2025; it must say what is missing
T11 conflict: user-stated revenue differing from the reviewed P&L must be surfaced, not overwritten
T12 authorization: the same document must be invisible to a non-entitled business/actor (S3.1 unchanged)
T13 classification correction: re-type → new classification record, old one retained, reader re-routed, no duplication
T14 reader gap: "W-2" classifies+filed, analysis = not yet supported, never an upload failure
```
This test must fail loudly if any layer collapses two concepts (format/type/subtype/folder/reader/status/review/verification/availability).

## 27. Exact files / tables involved

**Backend (read-path evidence):** `base44/functions/buildGalileoContext/entry.ts` (context assembly; name matcher lines 268-279; contract precedence 286-317), `base44/functions/askGalileo/entry.ts` (prompt assembly), `base44/shared/intelligenceContract/businessIntelligenceContract.ts` (contract; source hierarchy; duplicated matcher 287-301; `gross_profit: null`), `base44/shared/canonicalFact/*` (registry/resolver/consumerAdapter — read-only, no writers), `base44/shared/documentExtraction/extractEngine.ts` (reader registry, period derivation, Core integration call), `base44/functions/updateExtractedFieldReview/entry.ts` (the review write path), `base44/functions/createSnapshotFromReviewedFields/entry.ts` (orphaned, schema-incompatible bridge), `base44/functions/regenerateCiqMetrics/entry.ts` (assessment-driven; never reads fields), `base44/functions/uploadDocumentToSupabase/entry.ts` (type normalization + validation).
**Frontend:** `src/lib/documents/documentTypes.js` (+ shared backend twin), `src/pages/DocumentUpload.jsx`, `src/pages/DataRoom.jsx`, `src/lib/documentReadiness.js` (`SYSTEM_FOLDERS`, `suggestFolder`), `src/components/dataroom/*`, `src/components/documents/DocumentClassificationOverride.jsx`, `src/components/admin/ExtractedFieldsReviewQueue.jsx` (only caller of the snapshot bridge).
**Base44 entities (already exist, unused/extendable):** `DocumentClassification`, `DocumentFolder`, `ClassificationMemory` (**orphaned**).
**Supabase tables:** `documents` (31 cols — no folder/format/mime/period/classification columns), `document_analysis` (15 cols — period only inside `extracted_data`), `extracted_fields` (31 cols — `tax_year`, `source_form`, `source_page` present; no period bounds), `business_metric_snapshots` (no `data` column), `dashboard_metrics` (**no `revenue` column**), `business_facts` / `business_fact_evidence` / `business_fact_conflicts` (present, empty, period-aware), `profile_financials`, `business_entities`, `business_assessments`, `assessment_calculations`, `assessment_sessions`.

## 28. Security impact

**None, by construction, and by rule.** Classification is a *content* function that runs only after the caller has already been authorized for the business (canonical actor → `requireBusinessContext` → S3.1 for the file). Specifically unchanged and not to be touched: canonical actor binding, business authorization, document authorization (S3.1), the one-call viewer contract (P5), storage bucket authority, RLS, expert revocation, suspended-user denial. **A `suggested_business_id` is a suggestion, never an authorization primitive; classification must never be used to widen access, and no cross-business evidence may be assembled.** The 6D.0b work adds no new read path to Storage: it reuses the existing signed-URL mechanism for the *authorized* document only.

## 29. Migration requirements

**None required for 6D.0b.** Classification state lives in the existing Base44 entities; the only additions are *fields inside those entities* (family/subtype/period/basis/suggested business/method/evidence) — entity schema edits, not SQL. For 6D.1 no migration is needed either: `business_facts` already carries `source_type`, `confidence_score`, `verification_status`, `period_label`, `period_start`, `period_end`, `period_type`; `business_fact_evidence` and `business_fact_conflicts` exist. **Do not add period columns to `extracted_fields` until it is proven they are needed**; the model-reported `reporting_period` string can be persisted in the existing `metadata` JSONB first. Any Supabase DDL is a separate, justified slice with its own review.

## 30. Implementation dependency graph

```
(1) SHARED OBSERVATION→METRIC MAPPING  ─┬─► (2) contract + Galileo consume it (period-aware)
   one vocabulary, one function         │
                                        └─► (3) FACT PROMOTION GATE (6D.1) ─► (4) resolver ─► BIS ─► Galileo
(5) CLASSIFICATION ENGINE (6D.0b) ──► type/subtype/period/entity ──► (1) mapping + (6) filing + (7) reader routing
(8) BUSINESS/ENTITY ASSOCIATION ─── depends on (5); never on authorization
(9) CORRECTION/RE-CLASSIFICATION ── depends on (5) + entity history
(10) GOLDEN-PATH TEST ───────────── binds (1)-(9); must exist before 6D.1 closes
```
(1) and (3) are the critical path for Problem 2. (5) is the critical path for Problem 1. Neither blocks the other.

## 31. Recommended implementation slices (in order, each independently reviewable)

- **S1 — Observation→Metric Vocabulary + Period Carrying (smallest, highest value).** One shared mapping from canonical field names → metrics (reusing the mapping already written in `createSnapshotFromReviewedFields`), one period/basis passthrough from extraction → field row → metric. Consumers: contract + `buildGalileoContext` (delete both private matchers). Repairs Problem 2 for *already reviewed* data.
- **S2 — 6D.0b Classification Engine (recognize what a document IS).** Content-first classification through the existing Core integration; persist a `DocumentClassification` record with evidence + confidence; auto-file; route readers; honest reader-gap language; Galileo narration.
- **S3 — Business/Entity Association + Correction History.** Suggestions with confidence; never authorization; correction records preserving evidence.
- **S4 — 6D.1 Fact Promotion Gate.** `extracted_fields` (confirmed) → `business_facts` + `business_fact_evidence` with 6C lifecycle, period scope and lineage; resolver/BIS consume it; Galileo gains provenance answers.
- **S5 — Conflict Reconciliation + Knowledge Gap consumption.** Period-aware conflicts surfaced; Journey stops asking answered questions.
- **S6 — Golden-path test harness + historical remediation plan (separate, later).**

## 32. ONE next implementation slice

**S1 — "Reviewed observations become period-aware metrics through one shared mapping."**

Scope, precisely: introduce a single shared module `observationToMetric` (canonical field-name → metric key, per document type, including the tax-return names and `owner_compensation`, `gross_profit`); make `buildBusinessIntelligenceContract` and `buildGalileoContext` both consume it and delete their private `getAcceptedField` matchers; persist period bounds/basis alongside the accepted value (existing `metadata` JSONB or a new field on the promotion path, decided in the slice); surface period in `current_metrics` so Galileo can say *which period* a number belongs to. **Explicitly NOT in S1:** classification, promotion to `business_facts`, folder changes, historical remediation, and any write to production rows.

Why this one first: it is the smallest change that makes the user's own reviewed data visible, it removes a *duplicated* implementation rather than adding one, it fixes `owner_compensation`/`gross_profit`/tax-return names at once, and it is a hard prerequisite for 6D.1 to promote anything meaningful.

## 33. What belongs in 6D.0b (classification)

Content-first `classifyDocument()`; the canonical classification result (§9); family/type/subtype taxonomy as data; confidence bands + `requires_confirmation`; auto-filing through `DocumentClassification.applied_folder` (no duplication); reader routing with the classification-vs-extraction distinction; correction records with preserved evidence; Galileo narration copy; the classification half of the golden-path test; **no reader implementations**, **no fact promotion**, **no historical backfill**.

## 34. What belongs in 6D.1 (promotion)

The promotion gate from confirmed observations → `business_facts` + `business_fact_evidence` (period-scoped, provenance-tagged, 6C lifecycle, human attestation); resolver/BIS consumption; Galileo provenance answers ("where did that come from?"); conflict surfacing; **no classification work**, **no threshold calibration**, **no historical remediation**.

## 35. What must NOT be combined

- Classification (6D.0b) + fact promotion (6D.1) — different failure modes, different test surfaces.
- Any of the above + **historical remediation** (bulk re-typing, re-analysis, folder repair) — remediation is a later, separately reviewed, reversible operation.
- The S1 mapping repair + a new status enum — 6C already owns lifecycle; adding a parallel enum is the failure this audit exists to prevent.
- Reader-gap honesty (6D.0 hotfix) + any change to document authorization — security is frozen.
- Galileo prompt edits bundled with any resolver change — the prompt must be changed only after the data path is proven.

## 36. Historical remediation strategy (later, separate)

Not now. When it happens, it must be: **evidence-driven, per-document, reversible, and user-visible.** Concretely for the 27 `other/failed` rows, 42 `other`-typed documents, 60 analyses (incl. `unsupported`), and 19 queued analyses: (1) run classification in **shadow mode** first and record proposals without touching state; (2) show the owner/advisor a proposal list they can accept in bulk *by class*; (3) apply accepted re-typing as new classification records + new analyses, never mutating historical analysis rows; (4) never rewrite `extracted_fields` review states; (5) handle source-missing/orphaned Storage separately; (6) leave the duplicates to the observation-layer dedup decision, not to a destructive script.

## 37. Stop conditions

Stop and return for review if any of these would be required: a Supabase DDL migration; a change to `buildGalileoContext`/authorization code paths; writing to `business_facts` without the promotion gate; classifying or re-typing any historical row; adding a second lifecycle/status enum; touching S3.1/P5/bucket/actor code; inventing a reader; or any behavior that would make an unclassifiable document disappear from the user's view.

## 38. Final architecture recommendation

**VISION's document pipeline should have exactly one understanding engine, one observation layer, one promotion gate, one canonical store, one resolver, and one consumer.** Today it has: no understanding engine (types are user assertions), a duplicated ad-hoc name matcher instead of an observation→metric contract, no promotion writer at all (`business_facts`/`evidence` empty), two schema-incompatible fallback layers (`dashboard_metrics.revenue` absent, `business_metric_snapshots.data` absent), a fabrication of period from `documents.year`, folders driven by filename heuristics, and an orphaned classification/learning schema that already anticipated the right design.

The correct sequence is therefore: **S1 (make reviewed observations first-class, period-aware, through one shared mapping) → S2/6D.0b (content-first classification, filing, honest reader gaps) → S4/6D.1 (promotion gate + evidence) → S5 (conflicts + Knowledge Gap)**, with the golden-path test binding them and the security architecture frozen throughout. Classification makes VISION *understand*; promotion makes that understanding *usable*; both are required, and neither is a substitute for the other.

---

## Return index (as requested)

1. exact reviewed field traced → §1 (`gross_receipts` $1,250,000, tax return, business `42f42075…`, plus 6 co-traced fields)
2. first propagation breakpoint → §2 (observation→metric vocabulary mismatch, duplicated in two consumers, plus absence of any promotion writer)
3. why Galileo ignored/missed reviewed information → §3 (five classes distinguished; two-business evidence; empty canonical layer; phantom metric layers; 71-row review backlog)
4. current document classification path → §4
5. explicit manual classification behavior → §5
6. proposed automatic classification architecture → §6
7. classification signals → §7
8. confidence model → §8
9. proposed classification output contract → §9
10. semantic document taxonomy → §10
11. Data Room automatic filing design → §11
12. business/entity association design → §12
13. reader-routing architecture → §13
14. classification vs extraction support distinction → §13/§14
15. PDF/file-format terminology audit → §15
16. correction/reclassification architecture → §16
17. Galileo classification UX → §17
18. Galileo/BIS source matrix → §18
19. review/verification semantic audit → §19
20. provenance model compatibility with 6C → §20
21. period/basis audit → §21
22. conflict reconciliation design → §22
23. Knowledge Gap integration → §23
24. universal-file capability matrix → §24
25. golden-path architecture → §25
26. golden-path cross-layer test → §26
27. exact files/tables involved → §27
28. security impact → §28
29. migration requirements → §29
30. implementation dependency graph → §30
31. recommended implementation slices → §31
32. ONE next implementation slice → §32 (S1)
33. what belongs in 6D.0b → §33
34. what belongs in 6D.1 → §34
35. what must NOT be combined → §35
36. historical remediation strategy → §36
37. stop conditions → §37
38. final architecture recommendation → §38

**Nothing was implemented, no product code changed, no production row written, no commit created, nothing published. STOP FOR REVIEW.**