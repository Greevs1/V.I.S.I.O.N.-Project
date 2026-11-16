# VISION — DOCUMENT UPLOAD CLASSIFICATION HOTFIX (6D.0 CLASSIFICATION)

**Slice:** `6D.0-classification-hotfix` (fix-forward on checkpoint `382ab1f`, continued on `0ae221e`)
**Status:** HOTFIX RELEASE CANDIDATE — **approved for publish review** (§28). **Nothing was published.**
**Production:** untouched — no retry, no reclassification, no cleanup, no migration, no writes (§25).
**Scope discipline:** one root cause, fix-forward only. No amend / reset / rebase / squash of `382ab1f` was performed.

---

## 1. Root cause (revalidated in this continuation)

The upload page held the document type in a constant that could never change:

```jsx
const [docType] = useState('other');   // no setter — every upload was unclassified
```

Two facts were then collapsed into one word:

| Fact | Truth | Old presentation |
|---|---|---|
| Did the bytes reach Storage? | **yes** (the row is written only *after* a successful upload) | `Failed` |
| Did VISION extract from it? | no — no reader exists for that type | `Failed` |

`extractEngine` treated "no reader for this type" as a hard failure (`analysis_status='failed'`), and the Data Room rendered that single word as an **upload** failure. The 27 historical rows with `upload_status='failed'` whose analysis `failure_class` is `unsupported_type` are exactly this history: the file was stored, the analysis did not apply.

## 2. Exact document-type matrix

`readable` is **derived from `EXTRACTION_SCHEMAS`** in the extraction engine — never restated by hand.

| Canonical type | Reader | Backend source of truth | Upload outcome | Analysis outcome |
|---|---|---|---|---|
| `profit_and_loss` | yes | `EXTRACTION_SCHEMAS` | uploaded | analyzed / needs_review |
| `balance_sheet` | yes | `EXTRACTION_SCHEMAS` | uploaded | analyzed / needs_review |
| `business_tax_return` | yes | `EXTRACTION_SCHEMAS` | uploaded | analyzed / needs_review |
| `personal_tax_return` | yes | `EXTRACTION_SCHEMAS` | uploaded | analyzed / needs_review |
| `debt_schedule` | yes | `EXTRACTION_SCHEMAS` | uploaded | analyzed / needs_review |
| `payroll_report` | yes | `EXTRACTION_SCHEMAS` | uploaded | analyzed / needs_review |
| `insurance_document` | no | stored-only | uploaded | `unsupported` |
| `entity_document` | no | stored-only | uploaded | `unsupported` |
| `buy_sell_agreement` | no | stored-only | uploaded | `unsupported` |
| `estate_document` | no | stored-only | uploaded | `unsupported` |
| `other` (sentinel of "Not sure") | no | stored-only | uploaded | `unsupported` |

**No third silent state.** Every selectable value is either *readable* or *explicitly stored-only*; the cross-layer invariant (UI value → canonical type → reader exists **or** stored-only/unsupported) is asserted at every layer by `T-PARITY` and T1–T6/T14/T7–T10. There is no value that is neither.

## 3. Checkpoint / auto-commit disclosure

| SHA | Parent | Subject | Author | Files |
|---|---|---|---|---|
| `382ab1f` | `abc4844` | `File changes` | `base44-builder[bot]` | 11 (+901 / −65) |
| `0ae221e` | `382ab1f` | `Refactor document type handling and analysis status logic` | `base44-builder[bot]` | 1 (+13 / −4) — the hotfix harness only |

Both are **platform automatic checkpoint commits**, not commits I created. `0ae221e` contains the harness edit that was described as unverified in the previous turn (commit-relative surface base + surface detail reporting). Inspected in §18/§21: it holds **no intermediate or half-written product code** — the only diff is the surface-base computation and the diagnostic detail line in the harness. `382ab1f` contains **all** intended hotfix product changes (§4).

## 4. Files changed

**Product (backend):**
- `base44/shared/documents/documentTypes.ts` — canonical vocabulary + `normalizeDocumentType` (**new**)
- `base44/shared/documentExtraction/extractEngine.ts` — unsupported type ⇒ `analysis_status='unsupported'`, `upload_status='uploaded'`, parser never invoked
- `base44/shared/documentExtraction/analysisState.ts` — `succeeded` only for a finished analysis
- `base44/functions/uploadDocumentToSupabase/entry.ts` — validates/normalizes the type through the shared vocabulary, reports persisted truth
- `base44/functions/supabaseUserData/entry.ts` — `retryDocumentAnalysis` refuses on **reader availability**

**Product (frontend):**
- `src/lib/documents/documentTypes.js` — frontend mirror + `resolveDocumentStates` (**new**)
- `src/pages/DocumentUpload.jsx` — real type selector (state **and** setter), truthful wording
- `src/pages/DataRoom.jsx` — upload state and analysis state presented separately
- `src/components/documents/uploadConfig.jsx` — re-exports the shared vocabulary

**Harnesses / report:** `scripts/documentUploadClassification.test.cjs` (**new**), `scripts/extractionIntegrity.test.cjs` (re-based), this report, and **allowlist-line-only** rebases in the five older security harnesses (§21).

## 5. Canonical type architecture

`base44/shared/documents/documentTypes.ts` is the single backend vocabulary. `src/lib/documents/documentTypes.js` is a **mirror**, and `extractEngine` derives `readable` from its own real `EXTRACTION_SCHEMAS`, so the reader set cannot drift from reality. The frontend never invents a reader: `resolveDocumentStates` asks `isReadableDocumentType` rather than guessing. Parity across the three layers is asserted (T-PARITY) and mutated (M2 proves that marking an unreadable type readable is caught).

## 6. Temporary classification UX

The explicit **manual seam** remains, because automatic classification does not exist yet. It is a real, non-bureaucratic control — one select, three groups:

1. `Not sure` (the sentinel `other`) — truthful, see §11
2. `VISION can analyze these` (6 readable types)
3. `Stored safely for your records` (5 stored-only types)

No classifier logic was added; `6D.0b` owns that (§27). The picker carries the honest sentence: *"VISION reads profit & loss, balance sheet, business and personal tax returns, debt schedules and payroll reports today. Not sure of the type? You can still upload it: VISION will store it, and you can classify it later."*

## 7. Supported-type behavior

Reader exists ⇒ extraction runs, fields are persisted, and the analysis state progresses (`analyzed` / `needs_review`). `T14` proves the extraction path is invoked for every readable type; `T1–T6` prove all six readable types are readable at **every** layer.

## 8. Unsupported / stored-only behavior

Reader does **not** exist ⇒

- the parser is **never invoked** (`T8`: `extractorCalls === 0`),
- **no field is invented** (`T9`: zero `extracted_fields` writes),
- the document is **never erased** (`no_document_erase`: no `documents` delete),
- `analysis_status='unsupported'` and `upload_status='uploaded'` (`T7`),
- the Data Room says **"Not yet supported"**, and offers no Retry for it.

## 9. Upload vs analysis status semantics (states never collapsed)

| # | Case | `upload_status` | `analysis_status` | Presented as | Proof |
|---|---|---|---|---|---|
| A | Storage failure | `failed` | never claimed successful | **upload failure** | T11 |
| B | Stored + supported | `uploaded` | progresses normally | analysis state | T1–T6, T12, T14 |
| C | Stored + unsupported type | `uploaded` | `unsupported` | *Stored — not yet supported* | T7–T10 |
| D | Stored + genuine parser/model failure | `uploaded` | `failed` | *Analysis failed. Retry or review.* | T12 |
| E | Source missing | `uploaded` | 6D.0 source-unavailable semantics | *Original file unavailable* | T13 |
| F | Needs review | `uploaded` | `needs_review` + review reasons | review requirement | extractionIntegrity E4/E4b/E4c/E25 |

## 10. Historical-row display behavior (precise)

**The persisted database state of the historical rows was NOT changed and is NOT claimed to have changed.** No retry, no reclassification, no status rewrite.

What changed is the **presentation rule**, and it is evidence-based, not a blanket reinterpretation. `resolveDocumentStates` converts a stored `upload_status='failed'` to a storage success **only when the row carries storage evidence**: its own storage-state column already says the upload succeeded, real storage coordinates, or any analysis record. This is evidence and not an assumption because the uploader writes the document row only *after* a successful Storage upload — `uploadDocumentToSupabase` step 8 returns on `uploadErr` **before** any `documents` insert.

- **27 historical rows** (`upload_status='failed'`, analysis `failure_class='unsupported_type'`): storage evidence present ⇒ presented as *stored* + *Not yet supported*. **T10** proves it (legacy-row fixture).
- **A genuine historical upload/pipeline failure** (no storage evidence at all): keeps its upload-failure meaning. **T10b** proves the resolver cannot blindly reinterpret it.

## 11. "Not sure" behavior (no fake magic)

Selecting **Not sure** stores `document_type='other'` ⇒ *stored-only* ⇒ **no reader is invoked** and the analysis is `unsupported`. VISION does **not** determine the type today, so the wording was corrected in this continuation:

- option label: `Not sure` — the previous *"Not sure — let VISION try to determine it"* **over-claimed** and was removed
- supporting copy states exactly what happens: *"You can still upload it: VISION will store it, and you can classify it later."*
- the stored-only group label no longer promises future analysis: `Stored safely for your records`

## 12. W-2 behavior

There is **no `w2` canonical type and no W-2 reader** (verified: the vocabulary contains no W-2 entry). Therefore, today:

- the upload **succeeds**, the document is **stored**, **no reader is invoked**, the analysis is `unsupported`, and the Data Room shows *Stored — not yet supported* (never an upload failure).

Honest caveat, stated rather than hidden: W-2 is not distinguishable from a 1040 in the current vocabulary, so if a user selects **Personal Tax Return** for a W-2, the personal-return reader *does* run (that type genuinely has a reader) and its outcome is reported truthfully as `failed`/`needs_review` — never as an upload failure. **W-2 reader support is future document-intelligence work** (§26/§27). VISION does not pretend W-2 extraction exists.

## 13. Data Room presentation

Two independent facts, two independent presentations: **Upload** (`Uploaded` / `Failed`) and **Analysis** (`Analyzed`, `Analysis failed`, `Not yet supported`, `Processing`, `Needs review`, `Not analyzed yet`). Retry is offered **only** for a genuine analysis failure, never for a stored-only type (T10 asserts the *unsupported* label contains no "fail" wording, so a stored document can never read as an upload failure).

## 14. Backend validation (the UI is not trusted)

`normalizeDocumentType` is the single gate, and the backend never lets the client choose a parser or schema:

| Input | Result | Proof |
|---|---|---|
| known readable type | accepted unchanged | T1–T6 |
| known stored-only type | accepted, analysis `unsupported` | T7–T10 |
| `other` | accepted as unclassified | T7 |
| unknown arbitrary string (`totally_unknown_type`) | safely unclassified, `unsupported`, no parser call | T16 |
| parser-name injection (`eval_pwn`, `__proto__`) | `other` — no dynamic dispatch | T15 |
| non-string (`42`), missing (`null`, `undefined`, `''`) | `other` | T15 |
| any value | only ever a canonical string; the engine looks up `EXTRACTION_SCHEMAS[documentType]` and **never invokes it as a function** | T15 (static) |

M6 (`return v` instead of normalizing) is **caught** by T15 — the defense is the normalizer, not the UI.

## 15. Future automatic-classification seam

The seam is the vocabulary module: `6D.0b` determines the type **server-side** (filename + content signals), stores the classification with its confidence and evidence, and *then* flips `readable` only when a real reader exists. Because `readable` is derived from `EXTRACTION_SCHEMAS`, adding a reader and adding a type stay in lockstep. Nothing in this hotfix needs to be undone for that: the picker becomes a pre-filled suggestion, and the stored-only group shrinks as readers land.

## 16. Security unchanged (proof)

No security product file was modified by this hotfix.

| Harness | Result |
|---|---|
| `adminDocumentViewer` | PASS (viewer reuse, exact-id open, no second endpoint, generic refusal) |
| `documentSignedUrlAuthorization` | PASS (S3.1 bucket authority, allow/deny, URL-minting order) |
| `documentAccessAuthorization` | PASS (45 assertions) |
| `getDocumentsAdmin` (s3 mock) | PASS (50 assertions) |
| `adminCanonicalActor` | PASS (125 assertions — canonical actor unchanged) |
| `relationshipRevocationAccess` | PASS (revocation still denies) |
| `galileoContextActorBinding` | PASS (P-S3 binding unchanged) |
| `adminRouteAccess` | PASS (41 assertions) |
| `adminWorkspaceAccess` | PASS (66 assertions) |
| `architectureGuard` | PASS (exit 0) |

Foreign business denied (T18), suspended actor denied (T19), revoked expert denied (T20), authorization unchanged on this path (T17), persisted-bucket authority retained (`persisted_bucket_authority`, M9 caught), one-call viewer retained (`viewer_no_stored_url_fallback`, M10 caught).

## 17. Fact freeze

`business_facts` writes: **0**. `business_fact_evidence` writes: **0**. Proven three ways: T21/T22 (engine worlds), mutation M11 (a fact write is **caught**), and a static grep over the entire hotfix surface — **ZERO occurrences** of either table name.

## 18. T-series results

**T1–T22 PASS**, plus T-PARITY, T8b (no filename authority), T9b (never erased), the UI-selection assertion, the viewer fallback assertion, the bucket-authority assertion, **T10b** (negative historical proof) and the surface assertion — **42 assertions, 0 failures, exit 0**, `M1–M12 all CAUGHT`, `NOT CAUGHT: 0`.

## 19. M-series results (12/12 caught)

M1 hardcoded type · M2 unreadable type exposed as analyzable · M3 reader that does not exist · M4 unsupported recorded as an upload failure · M5 parser failure presented as an upload failure · M6 arbitrary client-supplied type trusted · M7 filename-as-authority · M8 weakened business-scope guard · M9 hardcoded storage bucket · M10 stored-URL viewer fallback · M11 Digital Twin fact write · M12 unsupported document erased.

## 20. Extraction-integrity results (6D.0)

`scripts/extractionIntegrity.test.cjs` — **70 assertions, 0 failures, exit 0**, `M1–M12(all) CAUGHT`, including the re-based **E2** (unclassified document is *stored* and marked `unsupported`, never a failed upload). Confirmed explicitly: supported type ⇒ extraction path available; unsupported type ⇒ upload stays `uploaded`, analysis becomes `unsupported`, parser not invoked, no fields invented; genuine extraction failure ⇒ analysis `failed`; source missing ⇒ the 6D.0 safe source-unavailable semantics are preserved (E15/E15b/E16/E17/E18).

## 21. Regression results

| Harness | Before rebase | After rebase |
|---|---|---|
| `documentUploadClassification` | 40 PASS / 1 surface FAIL | **42 PASS / 0 FAIL** |
| `extractionIntegrity` | 70 PASS / 0 FAIL | **70 PASS / 0 FAIL** |
| `adminDocumentViewer` | 55 PASS / 1 surface FAIL | **56 PASS / 0 FAIL** |
| `documentSignedUrlAuthorization` | 101 PASS / 2 surface FAIL | **103 PASS / 0 FAIL** |
| `adminCanonicalActor` | 122 PASS / 3 surface FAIL | **125 PASS / 0 FAIL** |
| `relationshipRevocationAccess` | 76 PASS / 2 surface FAIL | **78 PASS / 0 FAIL** |
| `galileoContextActorBinding` | 50 PASS / 2 surface FAIL | **52 PASS / 0 FAIL** |

Every failure repaired in the five older harnesses was a **change-surface assertion only**. Machine-checked before/after: no assertion was removed, and PASS totals rose by exactly the number of surface assertions repaired (55→56, 101→103, 122→125, 76→78, 50→52) plus one new assertion in the new harness (41→42 with T10b). No equality check was downgraded to a loose containment, no wildcard broadening was used, and every added entry is an explicit file path filtered against the harness's own existing sets so no duplicate can mask a real addition.

One further machine-checked maintenance was required and is disclosed here: the **mutation anchor M5** in the new harness was updated — **not removed** — to follow the legitimate resolver change in §10 (the anchor text was the resolver line it mutates). M5 is still **CAUGHT** by its unchanged target assertion `T12`, and the harness reports `NOT CAUGHT: 0`.

## 22. Baseline-only failures (not fixed here, unchanged)

- `businessContextContract` — `base44/functions/ownershipConcentrationEngine/entry.ts` imports the business-scope guard rather than the canonical import. **File untouched by this slice** (verified: not in the change surface), so the failure is baseline-identical.
- `certify-intelligence-contract` — fails on `DocumentUpload.jsx`'s `'business-intelligence-contract'` query key. This is the pre-existing construct recorded as baseline debt in the 6D.0 report; its **content is unchanged** — only its **line number moved** (265 → 272) because this hotfix legitimately inserted lines above it, and this continuation inserted three more (truthful wording).

Neither was repaired in this hotfix.

## 23. Build

`npm run build` (canonical `vite build`) — **exit 0**. No missing-import or unresolved-import warnings.

## 24. Git state

Base of the slice: `abc4844` (the published 6D.0 commit). Automatic checkpoint commits (both authored by `base44-builder[bot]`, neither created by me): `382ab1f` (11 files) and `0ae221e` (1 file — the harness). **I created no commit, amended nothing, and rewrote no history.**

**Final state at the close of this turn:**
- `HEAD` = `0ae221ee45ab06396ad18a0fa47a0239ada7fb21` (parent `382ab1f`, subject `Refactor document type handling and analysis status logic`)
- modified (uncommitted, awaiting the platform's own checkpoint): `scripts/adminCanonicalActor.test.cjs`, `scripts/adminDocumentViewer.test.cjs`, `scripts/documentSignedUrlAuthorization.test.cjs`, `scripts/documentUploadClassification.test.cjs`, `scripts/galileoContextActorBinding.test.cjs`, `scripts/relationshipRevocationAccess.test.cjs`, `src/lib/documents/documentTypes.js`, `src/pages/DocumentUpload.jsx`
- untracked: `VISION_DOCUMENT_UPLOAD_CLASSIFICATION_HOTFIX.md` (this report)
- `git diff --stat HEAD` at that point: 8 files changed, 127 insertions(+), 20 deletions(−), plus the one-line M5 anchor repair described in §21.

## 25. Production untouched (proof)

Everything performed in this slice — both turns — was **read-only against production**: schema/constraint/storage inspection and code reading. Zero writes. Specifically **not** touched: the 35 historical failed analyses, the 42 `other`-typed documents, the 27 `upload_status='failed'` rows, the 19 queued analyses, source-missing documents, orphaned Storage objects. No retry, no reclassification, no cleanup, no migration. No `business_facts` / `business_fact_evidence` row was written (§17).

## 26. Remaining classification debt

1. **No automatic classification** — the manual seam is a temporary bridge (`6D.0b`).
2. **W-2 and other unlisted real-world types have no reader** — today they land in `other` (stored-only) or, if mis-selected, in a type whose reader genuinely runs and reports its own truthful outcome.
3. **Historical rows remain as recorded** — presentation is corrected; the data is not rewritten, and no attempt was made to infer a better type for the 42 `other`-typed documents.
4. **Queued/source-missing/orphaned records** remain the standing 6D.0 backlog, untouched here.

## 27. Recommended 6D.0b integration

Server-side classification (filename + content signals) that **writes a proposal, not a decision**: store the proposed type, confidence and evidence, pre-fill the picker with it, and require a one-click confirmation for low-confidence cases. Promote `readable` only when `EXTRACTION_SCHEMAS` actually contains a reader — the vocabulary module already enforces that lockstep. Sequence readers by owner demand, with W-2 (and payroll/entity documents) among the first candidates, and retire the stored-only group entries as each reader lands.

## 28. Readiness verdict

All hotfix assertions pass (T1–T22 + T10b, M1–M12 all caught), extraction integrity passes, the ten security harnesses pass, the fact freeze holds at zero, the build is exit 0, the change surface is bounded to the reviewed files, and no production data was altered.

**HOTFIX RELEASE CANDIDATE — APPROVE FOR PUBLISH REVIEW.**
Nothing was published; publish remains your decision.