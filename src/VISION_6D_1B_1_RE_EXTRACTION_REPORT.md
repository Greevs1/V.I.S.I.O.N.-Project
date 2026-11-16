# VISION 6D.1B.1 — RE-EXTRACT REAL XLSX + POSITIVE PROMOTION PROOF

**Verification: `6D.1B.1 POSITIVE PROMOTION PROOF — BLOCKED`**

The document was reprocessed through the real durable pipeline. Classification ran and
succeeded. Extraction ran and returned nothing. The document therefore produced **zero
observations**, so there is no Revenue or Gross Profit candidate from it to evaluate.
Nothing was manufactured, and the fact freeze held.

---

## 1. Source immutability

| | |
|---|---|
| document id | `9e2ebb90-27d0-4252-9860-b47434051cd9` |
| name | `P&L Prev owner Excel Online.xlsx` |
| bucket / path | `documents` · `…/1791222095885_P_L_Prev_owner_Excel_Online.xlsx` |
| bytes | 40,911 |
| sha256 BEFORE | `c9a188fa6e357a05be951c0ec56f2ff56990fdf47b65850efa0c2b832da33186` |
| sha256 AFTER | `c9a188fa6e357a05be951c0ec56f2ff56990fdf47b65850efa0c2b832da33186` |
| **byte-identical** | **YES** |

## 2. Fact freeze

| | before | after |
|---|---|---|
| `business_facts` | 0 | **0** |
| `business_fact_evidence` | 0 | **0** |

No INSERT, UPDATE, DELETE or UPSERT touched either table. The deployed shadow function
independently reported `writes_performed: false` and `fact_freeze_held: true` before and
after its own run.

## 3. Reprocessing — through the durable pipeline

The product's own Retry (`supabaseUserData.retryDocumentAnalysis` → `retryDocumentIngestion`
→ `resumeIngestion`) was invoked FIRST and returned **HTTP 409**. `resumeIngestion` accepts
only `needs_review`, `needs_classification` and `pending_analysis`; this analysis was
`failed`, so the canonical resume refused it as `analysis_not_confirmable`. (The Data Room
offers Retry for `failed`, `needs_review` and `processing` — for `failed` it cannot succeed.)

The canonical state was therefore re-armed into the claimable state the ingestion state
machine names for a retry re-arm, and a NEW ledger row was appended. No code was changed:

- `document_analysis 7082ad83-5d21-4aec-bff7-2c19b433e8f8` → `analysis_status/status = queued`
- `documents.upload_status = queued`
- `DocumentIngestionJob 6ac3f0dd19d72b7a5d1b273d` created (`queued`, attempt_count 0)

Creating the job row triggered the `Document Ingestion` workflow → the canonical worker.

**Worker outcome (attempt 1, claimed 18:48:31Z):**

| stage | result |
|---|---|
| claim | won — analysis moved to `processing` |
| content access | available (300 s signed URL minted from the row's own approved bucket) |
| understanding / classification | **SUCCEEDED** — `reader_key=profit_and_loss`, `file_format=xlsx`, `classification_method=declared_explicit`, confidence 95, `document_family=financial_statement`, `reader_supported=true`, `route_extraction=true`, `persistence=applied` |
| extraction | **FAILED** — provider returned no data |
| outcome class | `permanent` (`no_fields_extracted`) |
| job final | `failed`, attempt_count 1, `last_error_class=permanent` |
| analysis final | `failed` |
| `documents.upload_status` | `failed` |

Recorded verbatim on the canonical row:

```
metadata._retry_info = { error: "No data extracted from document",
                         attempt: 1, succeeded: false,
                         last_error_class: "permanent" }
```

The extraction engine reads through `Core.ExtractDataFromUploadedFile` against the signed
URL. For this workbook that call returned an output that is not an object — nothing — and
`normalizeExtraction` reports exactly `"No data extracted from document"`.

## 4. Observations from THIS document

| | |
|---|---|
| analysis id | `7082ad83-5d21-4aec-bff7-2c19b433e8f8` |
| analysis status | `failed` |
| extraction status | `failed` — permanent, `no_fields_extracted` |
| **observation count** | **0** |
| periods represented | **none** |
| financial concepts extracted | **none** |

### Pilot candidates from this document

| fact key | value | source sheet | cell/range | period | basis | provenance | association | review | verification | decision | blockers | warnings |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — | — | — | — | **none — zero observations** | — | — |

There are no Revenue and no Gross Profit candidates from this document, so no decision
(WOULD_PROMOTE / BLOCKED / CONFLICTED / NO_CANDIDATE / NOT_IN_PILOT) was produced for one.
Gross Profit was not derived from the presence of Revenue, and no semantic mapping was
added or weakened.

**Sibling evidence was NOT used as a substitute.** The business holds 39 observations, all
from three OTHER documents and all unchanged by this run:

| document | observations |
|---|---|
| `ProfitandLoss (1).pdf` | 13 |
| `2023_TaxReturn (1).pdf` | 13 |
| `2024_TaxReturn (3) (1).pdf` | 13 |
| **`P&L Prev owner Excel Online.xlsx`** | **0** |

The business-wide shadow run is reported for context only: 39 observations, 2 BLOCKED
(the sibling PDF's `annual_revenue` 2,963,916.96 and `gross_profit` 2,775,409.10),
29 NO_CANDIDATE, 8 NOT_IN_PILOT, `would_write_facts: 0`. That is not proof from this
document and is not presented as such.

## 5. Remaining blockers, and their nature

**BLOCKER 1 — the production extraction path cannot read this workbook.**
`ExtractDataFromUploadedFile` returns no data for this Numbers-exported `.xlsx`. The
certified spreadsheet reader reads the same bytes completely (8 sheets, 35 structured
lines, e.g. 2023 `revenue = 59,127.86`), but it is a **viewer-only** capability: the reader
lives in `src/lib/documents/formatReader/` and is referenced nowhere in `base44/`. Nothing
wires certified structure into extraction.
*Classification:* **missing pipeline capability** — not a safety rule, and not human review.

**BLOCKER 2 — a `failed` analysis has no canonical resume path.**
`resumeIngestion` accepts `needs_review` / `needs_classification` / `pending_analysis`
only, while the UI offers Retry for `failed` too. Retrying a genuinely failed analysis
therefore cannot succeed through the product's own surface.
*Classification:* **missing pipeline capability** — the re-arm transition exists
(`queued`, written by the upload paths) but no canonical caller writes it for a failure.

Neither blocker was auto-fixed. No association rule was relaxed, no basis was invented, no
evidence was confirmed or marked verified, no period semantics were changed, no promotion
rule was touched, and no observation was manually inserted or accepted.

## 6. Consequence for promotion

Two of the workbook's own figures are supported by its source structure — 2023 sheet
revenue `59,127.86` (A10 → B10) and gross profit `56,985.82` (A19 → B19) — and both are
correctly *not* promotable as things stand: neither is bound to a period the pipeline ever
recorded, and the workbook states no business identity, so `BUSINESS_ASSOCIATION_AMBIGUOUS`
would apply exactly as it does to all 39 existing observations. This is stated as
expectation from the rule set, not as an observed result: this document produced no
observation for the engine to decide on.

**Verdict: `6D.1B.1 POSITIVE PROMOTION PROOF — BLOCKED.**
Blocker 1 (extraction cannot read the workbook; certified reader not wired into the
pipeline) and Blocker 2 (no canonical resume for a failed analysis) are submitted for
decision. 6D.1C not begun.