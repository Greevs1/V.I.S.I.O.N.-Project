# PHASE 6D.1B.2 — STRUCTURED SPREADSHEET EXTRACTION

**Status: BLOCKED** — see §10 for the single unresolved requirement.

Verdict: `6D.1B.2 STRUCTURED SPREADSHEET EXTRACTION — BLOCKED` (extraction has not executed
through the durable pipeline, so document-bound evidence and the document-scoped shadow
promotion result do not exist yet).

No new architecture was introduced. No 6D.1C work was started. No Digital Twin fact was written.

---

## 1. READER CERTIFICATION — **PASS**

### 1.1 Parity

All nine mirrored modules are **byte-identical** between the viewer's reader
(`src/lib/documents/formatReader/`) and the backend's copy (`base44/shared/documents/spreadsheet/`):
`numbers, csv, zip, xlsx, xml, docx, xls, index, financials`
(verified by `cmp`, and asserted in the harness as `D6`, with functional equivalence asserted as `D6b`).

The one reader is shared by both runtimes by construction: the backend cannot import `src/`, the
frontend cannot import `base44/`, so the certified reader is mirrored and the mirror is certified
identical — not a second implementation.

### 1.2 The real document, read by the final shared reader

`P&L Prev owner Excel Online.xlsx` (40,911 bytes) — every financial statement discovered, each
value taken from **that statement's own TOTAL column**:

| sheet | period type | period | value column | value_basis | revenue | gross profit | net income |
|---|---|---|---|---|---|---|---|
| 2023 | fiscal year (annual) | 2023-01-01 → 2023-12-31 | `N` (Total) | `period_total` | **206,249.79** `@N10` | 195,899.75 `@N19` | −26,093.12 |
| 12mo | **TTM** | **2022-02-01 → 2023-01-31** | `N` (Total) | `period_total` | **1,559,617.91** `@N10` | 1,501,903.89 `@N19` | 415,169.51 |
| 2022 | fiscal year | 2022-01-01 → 2022-12-31 | `N` (Total) | `period_total` | 1,601,483.89 `@N10` | 1,533,771.92 `@N19` | 418,893.15 |
| 2021 | fiscal year | 2021-01-01 → 2021-12-31 | `N` (Total) | `period_total` | 2,879,618.40 `@N10` | 2,580,465.77 `@N19` | 604,241.88 |
| 2020 | fiscal year | 2020-01-01 → 2020-12-31 | `N` (Total) | `period_total` | 4,505,305.32 `@N8` | 4,150,509.42 `@N17` | 1,467,691.65 |
| 2019 | fiscal year | 2019-01-01 → 2019-12-31 | `N` (Total) | `period_total` | 4,267,028.26 `@N9` | 3,765,433.50 `@N18` | 992,192.39 |
| 2018 | fiscal year | 2018-01-01 → 2018-12-31 | `N` (Total) | `period_total` | 4,025,733.03 `@N9` | 3,576,949.11 `@N19` | 745,380.20 |

Accounting basis: **none stated by the source**, so none is recorded — silence stays silence and
stays subject to the existing promotion policy.

**The critical proof (source-derived, not hardcoded):** before the fix the reader bound every line to
the first value column, so the "2023 revenue" it produced was **January's 59,127.86**. After the fix
the same reading resolves 2023 revenue to **206,249.79, read from the statement's Total cell `N10`**
— and the harness proves it structurally: `X6`/`D1` assert the value equals the sum of the twelve
monthly cells *and* that the selected cell is `N5`-style Total column coordinates, never `B`. The TTM
statement likewise resolves **1,559,617.91 from its own Total cell `N10`**, with its real month
bounds (Feb 2022 – Jan 2023) intact.

### 1.3 Period semantics (certified)

FY stays FY; a calendar year stays a calendar year with its own start/end; **TTM stays TTM and
retains its actual month bounds**; TTM without bounds is still TTM and never a fiscal year; a monthly
figure never becomes an annual figure and an annual total never becomes a monthly figure; multiple
years remain separate sections; an unreadable period stays unknown (`period_ambiguous: true`,
`fiscal_year: null`) and is never replaced by the uploader's declared year. No silent conversion
anywhere (`X17, X24–X27`).

### 1.4 The financial-integrity defects this phase found, and their regression coverage

| # | Defect found during certification | Regression check | Mutation that must catch it |
|---|---|---|---|
| D1 | **monthly value mistaken for the annual Total** — the first value column was bound instead of the statement's declared Total | `X6, X7, X8, D1` | `M1` (Total binding → first column), `M6` (Total declared, read from month 1) |
| D2 | **sparse-array index used as a spreadsheet column** — the read landed one column past the total (O, not N) | `X12, D2` | `M2` |
| D3 | **date-typed period headers mishandled** — a month carried as a real date was not a label, so the statement declared no Total column at all | `X11, D3` | `M5` |
| D4 | **TTM read as a fiscal year** | `X17, X25, D4` | `M3` |
| D5 | **fiscal year read as TTM** | `X24, D5` | `M3` |
| D6 | **frontend/backend reader drift** | `D6, D6b` | `M4` (byte drift) |
| — | a structured read presented as a model extraction | `X29` | — |
| — | multi-period facts flattened into one period | `X14, X15, X30` | `M7` |
| — | the engine stops preferring the certified structured read | `X28` | `M8` |

Harness: **`scripts/spreadsheetExtraction.test.cjs`** — 43 checks (X1–X30 + D1–D6 + E1–E2 + R1–R3),
**43/43 PASS**, mutation battery **8/8 CAUGHT**. It bundles and runs the *real* production code
(viewer reader, backend reader, bridge, period resolver, engine) against real workbook bytes written
by the harness itself.

Regression, existing suites:
* `scripts/documentViewing.test.cjs` (6D.1C reader/viewer) — **ALL CHECKS PASS**, 14/14 mutations caught.
* `scripts/digitalTwinShadowPromotion.test.cjs` (6D.1B) — **ALL CHECKS PASS**, 12/12 mutations caught.
* `npx vite build` — **exit 0**.
* Pristine-HEAD baseline debt (pre-existing, **not repaired**): `scripts/extractionIntegrity.test.cjs`,
  `src/scripts/durableDocumentIngestion.test.cjs`, `src/scripts/documentKnowledgeCompletion.test.cjs`
  all fail identically at module load — `ReferenceError: FORM_1040_FIELDS is not defined` — because
  their loaders inject a fixed dependency list that the engine has outgrown since 6D.0c.3 (the
  identifier predates this phase). They cannot be used as regression evidence for the resume change;
  note also that any repair would need the new bridge dependency injected too.

---

## 2. EXTRACTION CERTIFICATION — **PASS at code level, NOT yet observed end-to-end**

Certified by construction and by harness (code + metadata contract):
* a workbook VISION can read deterministically is read by the certified reader **before** any opaque
  provider call (`X28`) and is never labelled as a model extraction (`X29`);
* one section **per statement sheet**, each with its sheet name, the period the sheet itself states,
  cell provenance and only a source-stated accounting basis (`X13–X21`);
* persisted rows are namespaced by section (`annual_revenue__2023`) while the concept keeps one
  meaning, and multi-period documents record their sections (`X30`);
* read-only: no write path to the source exists anywhere in the reader (6D.1C certification holds).

Not yet observed: the pipeline has not produced rows for this document in this turn (§10).

---

## 3. RETRY CERTIFICATION — **PASS (restart), UNVERIFIED (ledger)**

The repaired canonical Retry, invoked exactly as the product invokes it
(`supabaseUserData` → `retryDocumentAnalysis` → `retryDocumentIngestion` → `resumeIngestion`):

```
{ success: true, queued: true }
document_analysis.analysis_status: failed → pending_analysis   (the documented handoff state)
documents.upload_status:           failed → pending_analysis
```

* **No** manual SQL re-arm, **no** manual status edit, **no** observation created by hand, **no**
  replacement file uploaded, **no** business/scope/profile reassignment.
* Restart is gated on real existence: the source is probed through the row's own approved bucket
  (`R2`); a `failed` analysis is restartable while a `completed` one is not, and unknown states are
  still refused (`R1, R3`).

**Unverified:** the ledger row itself. `document_ingestion_jobs` is not in the schema cache under that
name, and the canonical worker (`processDocumentIngestionJob`) requires a `job_id` that could only be
obtained from that ledger — so "previous failed job retained + a new job appended + no concurrent
duplicate" could not be *observed*, even though the canonical resume reported a successful handoff.
The worker did not execute within the turn window (it is claimed on the ingestion workflow's tick).

---

## 4. DOCUMENT-BOUND EVIDENCE — **NONE YET**

Lineage query on this exact document: `document_analysis.extracted_fields = 0`. Nothing was mixed
with the other Apex Roofing observations, because none of this document's own rows exist yet.

## 5. SHADOW PROMOTION RESULT — **NOT RUNNABLE (no document-bound observations)**

The 6D.1B Shadow Promotion Engine is unchanged and still green in its own suite, but a
document-scoped positive proof requires this document's observations to exist first. Nothing was
auto-confirmed, auto-verified, or weakened, and no PASS was manufactured.

## 6. SOURCE IMMUTABILITY — **PASS**

`sha256(source)` before = after = `c9a188fa…da33186`, 40,911 bytes, byte-identical across read,
re-extraction attempt and retry.

## 7. FACT FREEZE — **PASS**

`business_facts = 0`, `business_fact_evidence = 0` — before the retry and after it.

---

## 8. FILES CHANGED

* `src/lib/documents/formatReader/financials.js` — Total-column binding (by the cell's own column
  number), period labels accepted in any cell kind.
* `base44/shared/documents/spreadsheet/financials.js` — the identical mirror of the above.
* `base44/shared/documentExtraction/spreadsheetBridge.ts` — read bytes → per-sheet sections
  (sheet, stated period, cell provenance, source-stated basis) in the provider's own shape.
* `base44/shared/documentExtraction/extractEngine.ts` — structured read before the provider path;
  one section per statement; per-section period metadata, sheet/cell provenance; multi-period record.
* `base44/shared/documentExtraction/periodIntegrity.ts` — TTM recognition with real month bounds.
* `base44/shared/documentIngestion/resume.ts` — `failed` is restartable through the documented
  handoff, with a source-existence probe and no business/scope reassignment.
* `scripts/spreadsheetExtraction.test.cjs` — the 6D.1B.2 harness (43 checks, 8 mutations).

## 9. REMAINING WORK TO UNBLOCK

1. Confirm the ledger table's real name (or the ingestion job access path) so the canonical worker
   can be driven with a real `job_id`.
2. Let the ingestion workflow's next tick (or a worker invocation with that `job_id`) execute
   extraction on this document.
3. Then: document-bound evidence table (§9 of the request), the document-scoped shadow positive
   proof (§10), a second freeze check, and the final verdict.

## 10. WHY THIS IS BLOCKED

**Exact reason:** the repaired canonical Retry restarted the failed analysis and handed it to the
durable pipeline, but the durable worker did not execute within this turn's window — it is claimed on
the ingestion workflow's tick — and its `job_id` could not be obtained because the ledger table is not
reachable under the name the orchestration module implies. Consequently **no document-bound evidence
exists yet**, so neither §4 (document-bound evidence) nor §5 (document-scoped shadow promotion result)
can be certified in this turn.

Everything that could be certified without the pipeline executing, was: reader, period semantics,
parity, engine integration, retry restart, source immutability, freeze, build, and the 6D.1B/6D.1C
regression suites.