# VISION — READ-ONLY DOCUMENT VIEWER + EXTRACTION
## Phase 6D.1C — production acceptance report

**Status: ACCEPTED on live production data.**
Certification harness: 30 of 30 checks pass, 14 of 14 adversarial mutations caught.
Production build: exit 0.
Live acceptance: the previously unreadable document now reads completely, and its bytes are unchanged.

---

## 1. The reported failure

A stored workbook, `P&L Prev owner Excel Online.xlsx`, could not be previewed:
the viewer reported that no preview was available for the file. The document was
real, present in storage (40,911 bytes, a valid ZIP package) and correctly
associated with its business, so the failure was in VISION's ability to READ it —
not in the document's presence.

## 2. Root causes

Two defects produced the dead end, and a third class of defect corrupted the
evidence used to certify the fix.

**2.1 The legacy `.xls` shared-string table was read from the wrong starting point.**
The BIFF8 `SST` record begins with its own 8-byte header (total count, unique
count). The reader began parsing strings at byte 0, so the header's bytes were
consumed as the first string and every subsequent label in the workbook came out
as binary junk. Labels are what the structured reading matches on, so a legacy
workbook produced no financial lines at all. Corrected: the string cursor now
starts after the record's own header.

**2.2 A CSV was classified as plain text.**
Format detection decides by CONTENT first. A CSV's bytes ARE text bytes, so both
"delimited table" and "prose" are consistent with the content — and the reader
resolved that ambiguity to text, so no table was ever built for a CSV. The bytes
cannot decide between the two; the name must. Corrected: text bytes plus a `.csv`
or `.tsv` name resolve to `csv` (a one-sheet workbook), remaining text resolves
to `txt`. A workbook saved under a `.txt` name is still read as the workbook it
is, because the ZIP container decides that case before the name is consulted.

**2.3 The certification harness was certifying itself, not the reader.**
Three harness defects were found and fixed, each of which had been masking real
behaviour:

- The synthetic `.xls` fixture was never a valid compound file: the globals that
  carry each sheet's byte offset were measured from one record list and written
  into a different one, so the fixture's own offsets were wrong and the reader was
  being graded on a malformed file. The globals are now built twice from the SAME
  record list (once to measure, once with true offsets), and the two passes are
  asserted to produce identical lengths.
- One expected value confused net income with operating income; the fixture and
  the assertion now agree with the document's own layout.
- A "the reader must not contain a write path" assertion was matching the word in
  a source COMMENT that explained the absence of that very code. Assertions now
  read code with comments stripped.

One mutation exposed a fault in the reader itself: taking the encoding byte that
restarts a continued shared string as content does not merely mis-read the string,
it fails to advance the cursor and hangs. That mutation is now expressed as the
defect it is, and the harness reports a hung/behaviour-changed run as CAUGHT
rather than freezing.

## 3. Certification

Run: `node scripts/documentViewing.test.cjs`

```
checks: 30
mutations: 14/14 APPLIED + BEHAVIOR_CHANGED + CAUGHT
ALL CHECKS PASS
```

The matrix covers: XLSX/CSV/DOCX/XLS reading, merged ranges, cached formula
values (never recalculated), number formats as the file itself carries them
(currency, percent, date, negatives), hidden sheets, inline strings, the SST
CONTINUE boundary, RK integer/float/÷100 forms, MULRK, NUMBER, FORMULA, BIFF5
refusal, large-workbook bounding with an explicit warning, empty files and
malformed archives refused with a typed reason, format decided by content over
name, and a legacy `.doc` recognised as Word rather than declared unsupported.

Security and purity assertions in the same run: the reader contains no
authorization surface, no write path, no serializer and no compressor; reading
leaves the bytes byte-identical; the reader is a pure function of bytes; the
viewer never persists a URL and reads bytes only over the short-lived signed URL
(900 s) minted by the authorized backend action, which still proves actor and
business and still reports a missing source.

## 4. Live production acceptance

Source: `documents.id = 9e2ebb90-27d0-4252-9860-b47434051cd9`
(`P&L Prev owner Excel Online.xlsx`, bucket `documents`, 40,911 bytes).

```
sha256 before read: c9a188fa6e357a05be951c0ec56f2ff56990fdf47b65850efa0c2b832da33186
sha256 after  read: c9a188fa6e357a05be951c0ec56f2ff56990fdf47b65850efa0c2b832da33186
bytes unchanged:    true
read result:        ok, format xlsx, warnings none, nothing truncated
```

Eight sheets read in workbook order, none hidden:

| sheet | rows | cols | merges |
|---|---|---|---|
| Export Summary | 22 | 17 | 1 |
| 2023 | 38 | 17 | 0 |
| 12mo | 38 | 17 | 0 |
| 2022 | 38 | 17 | 0 |
| 2021 | 38 | 17 | 0 |
| 2020 | 38 | 14 | 0 |
| 2019 | 41 | 14 | 0 |
| 2018 | 42 | 14 | 0 |

The document was exported from Apple Numbers (the workbook says so in its own
Export Summary sheet, which maps each Numbers table to a worksheet). The Export
Summary carries no figures, and the structured reading correctly derives NO
financial lines from it rather than inventing any.

Every period sheet yields the same five concepts, each bound to its real label
and value cells — 35 structured lines across the workbook. For 2023:

```
revenue            =    59,127.86   (A10 -> B10)
cogs               =     2,142.04   (A17 -> B17)
gross_profit       =    56,985.82   (A19 -> B19)
operating_expenses =    71,509.46   (A36 -> B36)
net_income         =   -14,523.64   (A38 -> B38)
```

Row-level detail is preserved with the file's own number formats, e.g. on the
2023 sheet: `B5=0.00 Coaching Income`, `B6=4,680.57 EMB Sales Income`,
`B7=8,079.75 Financing Income`, `B8=27,717.38 Hosting Income`,
`B9=18,650.16 Upsales Income`, `B10=59,127.86 Total Income`.

**Reading is now proven on the file that failed.** The dead-end message is gone;
extraction and viewing remain independent capabilities, so a document that cannot
be rendered is still readable as evidence.

## 5. Shadow Promotion Engine — production run

Run against the document's business (`e507bf87-82d1-4bb7-9ae0-3a30881ac7da`,
"Apex Roofing LLC"):

```
shadow_version:        6d.1b.1
writes_performed:      false
fact_freeze_before:    { business_facts: 0, business_fact_evidence: 0 }
fact_freeze_after:     { business_facts: 0, business_fact_evidence: 0 }
fact_freeze_held:      true
observations_evaluated: 39
```

Decisions over 39 persisted observations:

| decision | count |
|---|---|
| NO_CANDIDATE | 29 |
| NOT_IN_PILOT | 8 |
| BLOCKED | 2 |

Provenance: 39 of 39 `REAL_SOURCE`. Period quality: 26 `EXACT`, 13
`AGGREGATE_MULTI_PERIOD`. Verification: 39 of 39 unverified. Association: 39 of
39 `ASSOCIATION_AMBIGUOUS`.

Blockers across the run:

| blocker | count |
|---|---|
| BUSINESS_ASSOCIATION_AMBIGUOUS | 39 |
| REVIEW_PENDING | 39 |
| BASIS_UNKNOWN | 39 |
| EVIDENCE_ONLY_CONCEPT | 22 |
| MULTI_PERIOD_AGGREGATE | 13 |
| SEMANTIC_MAPPING_INVALID | 8 |
| PERSONAL_ONLY | 4 |
| MISSING_PROVENANCE | 2 |

Both pilot candidates are BLOCKED, and neither would be written:

| fact | value | decision | blockers |
|---|---|---|---|
| revenue | 2,963,916.96 USD | BLOCKED | association ambiguous, review pending, multi-period aggregate, basis unknown |
| gross_profit | 2,775,409.10 USD | BLOCKED | association ambiguous, review pending, multi-period aggregate, basis unknown |

In the engine's own words, per candidate: *nothing in the document ties this
figure to this business*; *no one has reviewed this value yet*; *the figure
covers several years and is not a single-period amount*; *the accounting basis is
not recorded, and this measure depends on it*. Fingerprint outcome for both:
`NEW`. `would_write_facts: 0`, `would_write_evidence_rows: 0`.

The pilot is behaving exactly as designed: real evidence, honest blockers, and no
production write.

## 6. The honest gap

**The repaired document contributes nothing to promotion yet, and that is now
visible rather than hidden.**

Its own pipeline records are still failed:

```
upload_status: failed        analysis: failed/profit_and_loss
```

Its business holds four documents — two personal tax returns (completed), one
`ProfitandLoss (1).pdf` (needs_review), and this workbook (failed). The 39
observations the shadow run evaluated come from the OTHER three documents; this
workbook has zero persisted extracted fields.

So the reading defect that caused the failure is fixed and certified, but the
consequence of the original failure is still on the record: analysis failed on
this document, so it never produced evidence. Re-running extraction is a WRITE to
canonical intelligence state and was deliberately NOT performed in this
read-only phase. The engine's pilot candidates are also both `AGGREGATE_MULTI_PERIOD`
with `period unknown`, which is correct for this file's shape: it is a monthly
statement (the 2023 sheet carries Jan/Feb/Mar columns, and the revenue figure
above is January only), so period semantics must be resolved before any annual
figure could ever be promoted from it.

Recommended next step, requiring explicit go-ahead because it writes: re-run
extraction for this document through the existing durable ingestion path
(`processDocumentIngestionJob`), then re-run the shadow report and compare.

## 7. Boundaries held

- The reader and every viewer surface are read-only by construction: no
  `contentEditable`, no inputs, no change handlers, no serializer, no writer.
- No document is ever modified: proven byte-identical after reading, on the real
  file, by hash.
- Access is unchanged and un-widened: bytes are fetched only over a 900-second
  signed URL minted by the authorized backend action, which still proves actor and
  business, still refuses a missing source, and never returns a public URL.
- No stored or persisted URL. No client-side authority over canonical states.
- The shadow run performed zero writes, measured before and after.

## 8. Artifacts

- `src/lib/documents/formatReader/index.js` — content-first format decision, CSV/text resolution
- `src/lib/documents/formatReader/xls.js` — SST cursor offset, CONTINUE boundary
- `src/lib/documents/formatReader/xml.js`, `xlsx.js`, `docx.js`, `numbers.js`, `financials.js`, `zip.js`
- `scripts/documentViewing.test.cjs` — 30 checks, 14 mutations, mutation-safe reporting
- Viewer surfaces: `DocumentViewer.jsx`, `ReadOnlyDocumentView.jsx`, `WorkbookGrid.jsx`,
  `SpreadsheetViewer.jsx`, `DocxViewer.jsx`, `FinancialLinesPanel.jsx`,
  `FormatUnavailablePanel.jsx`, `AskAboutThisDocument.jsx