# PHASE 6D.1B.2 — STRUCTURED SPREADSHEET EXTRACTION

**Status: CERTIFIED** (6D.1B.2a closed the durability/reachability question and proved the full production chain).

Verdict: `6D.1B.2 STRUCTURED SPREADSHEET EXTRACTION — CERTIFIED` — the SAME real production workbook
completed Retry → durable job → worker → structured extraction → document-bound observations →
shadow evaluation, with source immutability and a 0/0 fact freeze.

No new architecture was introduced. No second queue, table, entity or retry mechanism was created.
No writer of any kind was added. No Digital Twin fact was written. 6D.1C was not started.

---

## 1. READER CERTIFICATION — **PASS**

All nine mirrored modules are **byte-identical** between the viewer's reader
(`src/lib/documents/formatReader/`) and the backend's copy (`base44/shared/documents/spreadsheet/`):
`numbers, csv, zip, xlsx, xml, docx, xls, index, financials` (`cmp` + harness `D6`/`D6b`).

Harness `scripts/spreadsheetExtraction.test.cjs`: **43 checks (X1–X30 + D1–D6 + E1–E2 + R1–R3) ALL
PASS, 8/8 mutations caught** — re-run after the 6D.1B.2a engine change, still green.

### 1.1 The real document, as read by the certified reader

| sheet | period type | period | value column | basis of value | revenue | gross profit | net income |
|---|---|---|---|---|---|---|---|
| 2023 | annual | 2023-01-01 → 2023-12-31 | `N` | `period_total` | **206,249.79** `@N10` | 195,899.75 `@N19` | 26,093.12 `@N38` |
| 12mo | **TTM** | **2022-02-01 → 2023-01-31** | `N` | `period_total` | **1,559,617.91** `@N10` | 1,501,903.89 `@N19` | 415,169.51 `@N38` |
| 2022 | annual | 2022-01-01 → 2022-12-31 | `N` | `period_total` | 1,601,483.89 `@N10` | 1,533,771.92 `@N19` | 418,893.15 `@N38` |
| 2021 | annual | 2021-01-01 → 2021-12-31 | `N` | `period_total` | 2,879,618.40 `@N10` | 2,580,465.77 `@N19` | 604,241.88 `@N38` |
| 2020 | annual | 2020-01-01 → 2020-12-31 | `N` | `period_total` | 4,505,305.32 `@N8` | 4,150,509.42 `@N17` | 1,467,691.65 `@N38` |
| 2019 | annual | 2019-01-01 → 2019-12-31 | `N` | `period_total` | 4,267,028.26 `@N9` | 3,765,433.50 `@N18` | 992,192.39 `@N41` |
| 2018 | annual | 2018-01-01 → 2018-12-31 | `N` | `period_total` | 4,025,733.03 `@N9` | 3,576,949.11 `@N19` | 745,380.20 `@N42` |

Accounting basis: **none stated by the source**, so none is recorded.

### 1.2 Defects found and their regression coverage

| # | Defect | Regression | Mutation |
|---|---|---|---|
| D1 | monthly value mistaken for the annual Total | `X6, X7, X8, D1` | `M1`, `M6` |
| D2 | sparse-array index used as a spreadsheet column (landed one column past the total) | `X12, D2` | `M2` |
| D3 | date-typed period headers mishandled | `X11, D3` | `M5` |
| D4 | TTM read as a fiscal year | `X17, X25, D4` | `M3` |
| D5 | fiscal year read as TTM | `X24, D5` | `M3` |
| D6 | frontend/backend reader drift | `D6, D6b` | `M4` |
| D7 | **(6D.1B.2a)** the certified structured read was discarded when the opaque provider fallback returned nothing | `X28` (structured read preferred) + production acceptance §4 | `M8` |

---

## 2. DURABLE JOB REACHABILITY

### 2.1 Canonical persistence system — **a BASE44 ENTITY, not a Supabase table**

`DocumentIngestionJob` is a **Base44 orchestration entity** (`base44/entities/DocumentIngestionJob.jsonc`),
reached exclusively through `base44.asServiceRole.entities.DocumentIngestionJob` in
`base44/shared/documentIngestion/orchestration.ts` (`JOB_ENTITY = 'DocumentIngestionJob'`).
The ledger is Base44 entity data: its records carry `created_by_id`, `created_date`, `updated_date`,
`is_sample`.

**Correction of the previous report.** The earlier BLOCKED verdict stated that the job "could not be
retrieved" and that `document_ingestion_jobs` was unreachable. That probe was against the **wrong
persistence surface** — a Supabase relation inferred from snake_case naming. There is no Supabase
`document_ingestion_jobs` relation, none is expected, and none was created. The jobs were present in
the Base44 entity store the whole time.

### 2.2 Exact job identifier

The ledger row id IS the job identifier end to end: `job.id` (Base44 entity id, e.g.
`6ac3f91f967e8663be37c2e4`). It is never a Supabase UUID, never the analysis id, and never
camel/snake-transformed anywhere on the path.

### 2.3 Retry → job proof

Product Retry (`supabaseUserData` → `retryDocumentAnalysis` → `retryDocumentIngestion` →
`resumeIngestion`), invoked exactly as the product invokes it:

```
{ success: true, queued: true, job_id: "6ac3f91f967e8663be37c2e4", outcome: "resumed" }
document_analysis.analysis_status: failed → pending_analysis   (the documented handoff state)
documents.upload_status:           failed → pending_analysis
```

The `job_id` returned is the ledger row id, and that row exists with
`document_id = 9e2ebb90-…`, `analysis_id = 7082ad83-…`, `status` transitioning queued → processing →
completed, `attempt_count 1`, `claimed_at 2026-10-05T19:23:14.544Z`, `lease_expires_at` cleared on
completion, `last_error_class: null`.

**Response invariant (now enforced and tested): `queued: true` ⟺ a durable job was persisted.**
`resumeIngestion` returns `ok:false` if the ledger write fails, and the router reaches its
`success: true, queued: true` line only past the `if (!retry.ok)` guard — a non-durable resume returns
`success:false` with 409/404. J2/J2b/J3 assert this and `M-FQ` proves the checks bite.

### 2.4 Workflow → job proof

Deployed `Document Ingestion.jsonc`: entity trigger, `events: ["create"]`,
`entity_name: "DocumentIngestionJob"`, invoking `processDocumentIngestionJob` with
`job_id: ${ .trigger.entity_id }` — the ledger row's own id, twice (immediate attempt and the durable
`PT2M` retry). Deployed `Document Ingestion Recovery.jsonc`: scheduled `*/5 * * * *`, invoking the same
function with `{ sweep: true }`. Identifier audit: **no mismatch** — entity id → `job_id` → ledger id.

### 2.5 Worker → job proof

`processDocumentIngestionJob` accepts `body.job_id` only (400 otherwise) and calls
`processJob({ jobId })`, which loads the ledger row, applies the durable gate
(`isJobClaimable`: completed/failed/attempts-exhausted/leased refused), claims atomically against the
canonical analysis row, writes a 5-minute lease, then re-derives business/scope/profile from the
documents row. Live result for the real job:

```
{ ok: true, decision: "completed", stage: "extraction", attempt_count: 1,
  outcome: "success", final_status: "completed", extracted_fields: 35, provider_calls: 1 }
```

### 2.6 Recovery proof

`findDueJobs` reads the SAME entity with `$in: [queued, processing, waiting_retry]` and re-applies
`isJobClaimable`; `sweepJobs` calls the SAME `processJob`. Verified in the harness:
`J10` — a stranded `queued` job is discovered while `completed`, terminal-`failed` and live-lease jobs
are not; `J9` — an expired lease is claimable again; `J8` — a live lease is not stolen. A job therefore
cannot be stranded by a missed entity trigger. (The live sweep was not separately exercised: no job was
due at the time — the queued job was claimed within seconds of creation.)

### 2.7 Ledger history, idempotency, no manual re-arm

Four ledger rows exist for this document: three retained `failed` entries (17:44, 18:48, 19:14) and the
19:23 `completed` entry. J11/J12 prove the failed history is never rewritten and that each retry appends
a new entry; J7 proves a duplicate delivery loses the canonical claim; J13 proves the resume performs
the handoff transition itself (no manual re-arm, and Retry cannot extract — the module imports no
extraction engine); J14 proves a retry never reassigns business, profile or scope (document patch keys:
`upload_status, updated_at`); J15 proves no ingestion path touches `business_facts`,
`business_fact_evidence` or the shadow engine.

---

## 3. THE PRODUCTION BLOCKER (found, and fixed) — the provider was a gate, not a fallback

The 19:14 run (the first repaired Retry) classified the document perfectly —
`reader_key: profit_and_loss`, `file_format: xlsx`, `reader_supported: true`, `route_extraction: true`,
`classification_method: declared_explicit` — and then extraction **threw**
`"No data extracted from document"`, was classed `permanent`, and the job was recorded failed.

Cause: `runExtractionCore` ran the certified structured read, built the section list — and then called
the opaque provider **unconditionally**, throwing when the provider returned nothing for the same
`.xlsx`. The throw discarded a reading that had already succeeded, contradicting the engine's own
documented contract ("a workbook VISION can read deterministically is never sent to an opaque
provider").

Fix (minimal, one branch): the provider is now reached only when **no** structured sections exist —
`if (formSections.length) … else if (!structuredSections.length) …`. Reader, financial semantics and
Shadow Promotion rules were not touched; the reader suite stayed green (8/8 mutations) after the change.

---

## 4. PRODUCTION EXTRACTION ACCEPTANCE — **PASS**

1. durable job exists — Base44 entity `6ac3f91f967e8663be37c2e4` ✔
2. job id traceable from Retry to worker — returned by Retry, passed by the workflow as
   `${ .trigger.entity_id }`, consumed by the worker as `job_id` ✔
3. worker claims it — `claimed_at 19:23:14.544Z`, `attempt_count 1`, lease written then cleared ✔
4. spreadsheet bridge executes backend-side — `extraction_method: structured_spreadsheet_extraction` ✔
5. extraction succeeds — `decision: completed, outcome: success, extracted_fields: 35` ✔
6. analysis reaches the correct resulting state — `analysis_status: completed`, no review reasons,
   `reconcile {inserted: 35, retained: 0, preserved: 0, discrepancies: 0}` ✔
7. job reaches its terminal state — ledger `completed`, `last_error_class: null` ✔
8. observations persisted through normal reconciliation — 35 `extracted_fields` rows ✔
9. source remains byte-identical — `sha256 = c9a188fa…da33186` before and after, 40,911 bytes ✔

Period sections recorded on the analysis (7): `2023` annual, `12mo` **ttm
(Feb 2022 – Jan 2023)**, `2022`, `2021`, `2020`, `2019`, `2018` annual — none ambiguous.

---

## 5. DOCUMENT-BOUND OBSERVATIONS (lineage = this document only)

35 rows, `document_analysis_id = 7082ad83-…`, every one bound to its statement's **Total column `N`**
(`value_basis: period_total`), review state `pending_review`, verification state **unverified**,
accounting basis **null** (the source states none):

| concept | value | sheet | cell | period | review | verification |
|---|---|---|---|---|---|---|
| `annual_revenue__2023` | **206,249.79** | 2023 | `N10` | annual 2023 | pending_review | unverified |
| `annual_revenue__12mo` | **1,559,617.91** | 12mo | `N10` | **ttm 2022-02-01..2023-01-31** | pending_review | unverified |
| `annual_revenue__2022` | 1,601,483.89 | 2022 | `N10` | annual 2022 | pending_review | unverified |
| `annual_revenue__2021` | 2,879,618.40 | 2021 | `N10` | annual 2021 | pending_review | unverified |
| `annual_revenue__2020` | 4,505,305.32 | 2020 | `N8` | annual 2020 | pending_review | unverified |
| `annual_revenue__2019` | 4,267,028.26 | 2019 | `N9` | annual 2019 | pending_review | unverified |
| `annual_revenue__2018` | 4,025,733.03 | 2018 | `N9` | annual 2018 | pending_review | unverified |
| `gross_profit__2023` | 195,899.75 | 2023 | `N19` | annual 2023 | pending_review | unverified |
| `gross_profit__12mo` | 1,501,903.89 | 12mo | `N19` | ttm 2022-02-01..2023-01-31 | pending_review | unverified |
| `gross_profit__2022` | 1,533,771.92 | 2022 | `N19` | annual 2022 | pending_review | unverified |
| `gross_profit__2021` | 2,580,465.77 | 2021 | `N19` | annual 2021 | pending_review | unverified |
| `gross_profit__2020` | 4,150,509.42 | 2020 | `N17` | annual 2020 | pending_review | unverified |
| `gross_profit__2019` | 3,765,433.50 | 2019 | `N18` | annual 2019 | pending_review | unverified |
| `gross_profit__2018` | 3,576,949.11 | 2018 | `N19` | annual 2018 | pending_review | unverified |

(plus `cogs`, `net_profit` and `total_expenses` per period — 35 rows total.) The two acceptance
cross-checks are satisfied from the source, not from any hardcoded value: **2023 revenue 206,249.79**
and **TTM revenue 1,559,617.91**, each read from its own Total cell.

**Eligibility (6D.0c.3 automatic relevant-evidence policy):** all 35 rows are **AMBIGUOUS**,
`business_eligible: false`, reason `no_relationship_evidence_in_the_document`
(`association_supported: false`, active business `Apex Roofing LLC`). The document carries no evidence
tying it to that business, so its figures were retained **as document evidence only** and nothing was
assumed. `business_eligible_count = 0`.

---

## 6. SHADOW PROMOTION RESULT

The existing 6D.1B engine (`digitalTwinShadowPromotion`, input `businessId`) was run unmodified:

```
observations_evaluated : 74          pilot_keys : ["revenue","gross_profit"]
by_decision            : { NO_CANDIDATE: 64, BLOCKED: 2, NOT_IN_PILOT: 8 }
pilot_candidates       : revenue ×1 BLOCKED, gross_profit ×1 BLOCKED
by_blocker             : BUSINESS_ASSOCIATION_AMBIGUOUS 74 · REVIEW_PENDING 74 · BASIS_UNKNOWN 74
                         UNKNOWN_SOURCE_ORIGIN 35 · SEMANTIC_MAPPING_INVALID 43 ·
                         MULTI_PERIOD_AGGREGATE 13 · EVIDENCE_ONLY_CONCEPT 22 ·
                         MISSING_PROVENANCE 2 · PERSONAL_ONLY 4
by_association         : { ASSOCIATION_AMBIGUOUS: 74 }        by_verification_state : { unverified: 74 }
would_write_facts      : 0            would_write_evidence_rows : 0
writes_performed       : false        fact_freeze_held          : true
```

**Decision: BLOCKED for both pilot keys — no candidate was promoted, and no blocker was resolved.**
Document-scoped: **no pilot candidate carries this document's lineage**, because all 35 of its
observations are business-ineligible by association. The engine's input contract is business-scoped, so
the document's observations were correctly *excluded from business evaluation* rather than being
force-fed into it — the exact opposite of manufacturing evidence.

Finding carried forward (not fixed — shadow rules were out of scope):
`UNKNOWN_SOURCE_ORIGIN × 35` is attributable to this document's rows; structured rows appear to reach
the engine without the evidence-origin metadata it reads. That is a legitimate blocker, and it is left
standing.

---

## 7. FACT FREEZE

`business_facts = 0`, `business_fact_evidence = 0` — before the retry, after the worker completed, and
after the shadow run. `fact_freeze_held: true`, `writes_performed: false`. **Any Digital Twin write
would have been a failure; none occurred.**

## 8. TESTS

* `scripts/durableIngestionReachability.test.cjs` — **J1–J15 ALL CHECKS PASS**; mutations **2/2 CAUGHT**
  (`M-ID` workflow identifier mismatch → J4; `M-FQ` false `queued:true` on a resume that persisted
  nothing → J3).
* `scripts/spreadsheetExtraction.test.cjs` — 43 checks ALL PASS, 8/8 mutations.
* `scripts/digitalTwinShadowPromotion.test.cjs` (6D.1B) — ALL CHECKS PASS, 12/12 mutations.
* `scripts/documentViewing.test.cjs` (6D.1C) — ALL CHECKS PASS, 14/14 mutations.
* `npx vite build` — **exit 0**.

**Baseline-identical loader debt, recorded separately and NOT repaired** (pre-existing, unrelated to
this phase): `scripts/extractionIntegrity.test.cjs`, `src/scripts/durableDocumentIngestion.test.cjs`,
`src/scripts/documentKnowledgeCompletion.test.cjs` fail identically at module load —
`ReferenceError: FORM_1040_FIELDS is not defined` — because their loaders inject a fixed dependency
list the engine outgrew in 6D.0c.3. They were red before this work and remain red; no requirement was
placed on them.

## 9. FILES CHANGED IN 6D.1B.2a

* `base44/shared/documentExtraction/extractEngine.ts` — the provider became a fallback: it is reached
  only when no structured sections exist.
* `base44/shared/documentIngestion/retry.ts` — the acceptance now carries the durable `job_id`.
* `base44/functions/supabaseUserData/entry.ts` — `queued: true` returns with `job_id` and `outcome`,
  reachable only past the `if (!retry.ok)` guard.
* `scripts/durableIngestionReachability.test.cjs` — J1–J15 + `M-ID`, `M-FQ`.
* `src/VISION_6D_1B_2_STRUCTURED_SPREADSHEET_EXTRACTION.md` — this report.

## 10. STOP

`6D.1B.2 STRUCTURED SPREADSHEET EXTRACTION` — **CERTIFIED**. 6D.1C not started.