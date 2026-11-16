# VISION PHASE 6D.0 — DOCUMENT EXTRACTION INTEGRITY
### Final report — continuation run (viewer-contract correction + verified tree)

**Slice:** 6D.0 Extraction Integrity (truthful, deterministic, idempotent, recoverable, source-aware, review-safe extraction).
**Boundary respected:** no universal document support, **zero** writes to `business_facts` / `business_fact_evidence`, **no production mutation**, **no commit authored**, **no publish**.
**Evidence class:** offline unit/mock + static invariant + git-surface proof. Every harness runs the **shipped code** (real engine modules, real Security Kernel, real entry points, real viewer hook, real component handler). No network, no database, no production record read, written or deleted.

---

## 1. Phase 0 audit findings — revalidated

The 6D.0 audit (`src/VISION_PHASE_6D_EVIDENCE_INTELLIGENCE_AUDIT.md`) findings were re-verified against the actual tree and confirmed:

| # | Finding | Status on this tree |
|---|---|---|
| D1 | Confidence hardcoded (`85`) regardless of provider | **CONFIRMED → FIXED** |
| D2 | Extracted reporting period never persisted | **CONFIRMED → FIXED** |
| D3 | Retry dropped the `base44` client → a retry was *guaranteed* to fail | **CONFIRMED → FIXED** |
| D4 | Delete-all-then-reinsert of `extracted_fields` destroyed human review | **CONFIRMED → FIXED** |
| D5 | Storage bucket hardcoded / persisted bucket not authoritative | **CONFIRMED → FIXED** |
| D6 | Raw storage error surfaced to the owner | **CONFIRMED → FIXED** |
| D7 | Unsupported/unclassified document presented as "analyzed" | **CONFIRMED → FIXED** |
| D8 | Extraction authorization derived standing from Base44 `user.role` and consulted the retired `advisor_assignments` | **CONFIRMED → FIXED** |
| D9 | 19 analyses stranded in `queued`; `classifyStaleQueue` has no exposed execution path | **CONFIRMED → NOT FIXED (deliberate, see §11 / §24)** |
| D10 | `classifyDocument` backend function does not exist although its surface is invoked | **CONFIRMED → NOT FIXED (out of scope, see §13)** |
| D11 | `deleteDocument` bypasses the shared authorization engine and orphans Storage objects | **CONFIRMED → NOT FIXED (out of scope, see §14)** |

## 2. Exact root causes

1. **Confidence:** the engine wrote a literal `confidence_score: 85` and derived per-field confidence from constants instead of the provider's report.
2. **Period:** the provider's `reporting_period` was parsed for nothing — it was never written to the analysis row; a caller-facing period was inferred instead of recorded. `as_of_date` had no representation, and nothing distinguished an *extracted* period from a *declared* one.
3. **Retry:** the retry path re-invoked the extractor **without** `base44` (and without the mock flag), so the second attempt could not run at all.
4. **Review destruction:** reprocessing performed a blanket `delete` of the analysis's `extracted_fields` and re-inserted everything, discarding `review_status`, `accepted_normalized_value`, reviewer identity and timestamps.
5. **Bucket:** the source read did not use the row's persisted `storage_bucket` (implicit default), and a client-supplied bucket could influence it.
6. **Source error:** a missing Storage object was turned into a raw error string shown to the owner, with no distinction between "the file is gone" and "we failed to reach Storage".
7. **Authorization:** `runDocumentExtraction` derived standing from the Base44 `user.role` and from `advisor_assignments`, instead of the canonical actor + the S3.1 document-view engine.

## 3. Actual files changed

| File | Change |
|---|---|
| `base44/shared/documentExtraction/extractionConfidence.ts` | **NEW** — review-safety + confidence vocabulary, one source of status names |
| `base44/shared/documentExtraction/periodIntegrity.ts` | **NEW** — reporting-period parsing/normalization, declared vs extracted |
| `base44/shared/documentExtraction/analysisState.ts` | **NEW** — analysis status/state vocabulary, stale-queue classification |
| `base44/shared/documentExtraction/extractEngine.ts` | Refactored: no delete-all, review-preserving reconciliation, honest confidence/period, bucket-authoritative source read, retry carries `base44`, zero fact writes |
| `base44/functions/runDocumentExtraction/entry.ts` | Canonical actor + S3.1 authorization; no Base44-role standing; no `advisor_assignments` |
| `base44/functions/supabaseUserData/entry.ts` | `getDocumentSignedUrl`: source-existence determination (`source_unavailable` / `has_extraction`), approved-bucket enforcement, raw storage error never returned |
| `src/hooks/useDocumentViewer.js` | Carries the source state out of the **single** authorized resolution call; renders the source-missing state |
| `src/components/documents/DocumentViewer.jsx` | `SourceMissingPanel` — human language, no raw error, extraction claim only when true |
| `scripts/extractionIntegrity.test.cjs` | **NEW** harness (E/M/S/F series) |
| `VISION_PHASE_6D_0_EXTRACTION_INTEGRITY_REPORT.md` | This report |

## 4. Confidence correction

No fabricated constant remains (invariant **S1**). Confidence is the provider's value when the provider reports one (**E3b**), explicitly unavailable when it does not (**E3**), and "confidence unavailable" is **not** itself a review reason (**E4c**). Genuine review reasons are reachable: unnormalizable value (**E4**), unresolved period on a period-bearing document (**E4b**).

## 5. Period correction

Extracted period survives persistence verbatim (**E5**); `as_of_date` survives where the source states an as-of period (**E6**); a declared year is labelled **declared**, never presented as extracted (**E6b**); no calendar year is manufactured when nothing states one (**E6c**). One period implementation exists — the engine does not restate it (**S7**).

## 6. Retry correction

The Base44-client-dropping defect was reproduced first, then fixed: a retry after a transient failure keeps the client and therefore succeeds (**E7**, **E7b**); a transient failure is classified transient, not permanent (**E7**); the retry stays on the same analysis and document and never re-scopes the business (**E8**, **E24c**).

## 7. Review-preservation behaviour

There is **no blanket delete of `extracted_fields` anywhere** (invariant **S2**). Reprocessing reconciles in place:

* ACCEPTED → decision and value preserved (**E9**);
* CORRECTED → correction preserved (**E10**);
* REJECTED → **not resurrected as trusted** (**E11**);
* PENDING → safely reconciled in place (**E12**);
* NEW EXTRACTION DISAGREES WITH A REVIEWED VALUE → the reviewed value is **not** silently overwritten and the discrepancy stays visible/reviewable (**E25**).

Each protection is proven load-bearing by mutation: erasing an accepted value is caught (**M7**), dropping a status from the protected list is caught (**M8**), re-pending a reviewed observation is caught (**M9**), falling through and overwriting a reviewed observation is caught (**M9b**), deleting all fields before reinserting is caught (**M4**).

## 8. Bucket correction

The **persisted** `storage_bucket` is authoritative (**E13**); the approved-bucket vocabulary is enforced; an unapproved/unknown bucket **fails closed** with no fallback and no bucket guessing (**E14**); a client-supplied bucket cannot influence the read (**E14b**, mutation **M11**); the engine never hardcodes a bucket (**S3**, mutation **M5**).

## 9. Source-missing behaviour

The determination is made **before** any extraction state changes (**S4**) and is expressed as a state, not an error:

| Case | Assertion | Result |
|---|---|---|
| A. Authorized document, source exists | **E18** | normal signed URL from the document's own bucket |
| B. Authorized, source missing, extraction survives | **E15**, **E16b** | safe missing-source state; retained extraction acknowledged; extraction **not** deleted |
| C. Authorized, source missing, nothing survives | **E15b**, **E16** | distinct, classed state → re-upload required |
| D. Unauthorized foreign document | **E21b**, **E21c** | canonical denial; **no** source-missing disclosure; foreign and nonexistent are indistinguishable (no existence oracle) |
| E. Nonexistent document | **E21c** | same canonical safe failure |
| F. Malformed/unknown bucket | **E14** | fails closed |

Owner-facing language is human and carries no raw error (**E17**, **S9**); retained extraction is claimed only when it genuinely exists (**E16b**).

## 10. Viewer one-call contract proof (the regression this run repaired)

**What went wrong in the interrupted run:** the source-missing recovery issued a **second** `supabaseUserData` call after the first failed. That violates the P5/S3.1 contract ("one authoritative signed-URL request"), and it broke five pre-existing Admin-viewer behavioural assertions: **H7, H8, P20, P23, P24**. The platform auto-committed that broken state (see §20) before it could be corrected.

**The correction:** the state now travels out of the **single** call it already makes.

* `getDocumentSignedUrl(document, onSourceState)` — the one existing `supabaseUserData` / `getDocumentSignedUrl` invocation reports `{ sourceMissing, hasExtraction }` through that callback.
* `openDocumentViewer` collects it into a local and, only when **no signed URL was produced**, opens the source-missing state.
* **No second endpoint, no probe, no `.catch(() => null)` retry-request.** Machine-checked: **exactly one** occurrence of `action: 'getDocumentSignedUrl'` in the hook (**E18b**).

**Contract properties re-proven after the fix:**

| Property | Assertion | Result |
|---|---|---|
| The request carries the document **id only** (no tenant, role, bucket, path) | H2 | PASS |
| The viewer opens on the back end's URL, never the stored one | H3, P19 | PASS |
| A refusal opens **nothing** and renders **no** stored URL | H4, H5, P20, P21 | PASS |
| A row with no `file_path` issues **no** request and fails safely | H7, H8 | PASS |
| Identity governs the attempt; no `file_path`/`file_url` precondition | P22, P23, P24 | PASS |
| The back-end reason is never surfaced; the generic state is | H6, P9, P21 | PASS |
| No second signed-URL endpoint anywhere | P12, M12 | PASS |
| Refusal vs source-missing cannot become an oracle | E21c (backend) + generic viewer state | PASS |

**Not weakened:** the hook still fails closed on refusal; `403`/`404`/unknown-document are **not** turned into "source missing"; `source_unavailable` is only ever produced by the backend **after** authorization, for an authorized document whose own approved bucket lacks the object. Security took precedence over prettier UX.

## 11. Queued-job diagnosis (preserved, not fixed)

19 historical analyses are stranded in `queued`. Root cause is **ingestion orchestration**, not extraction:

* `adminUploadDocument` → creates a queued analysis, **never invokes extraction**;
* `googleDriveImport` → writes a separate `document_analysis_queue` path (no analysis row);
* `guestSessionService` → queues an analysis on guest promotion, **never invokes extraction**;
* the canonical upload path (`uploadDocumentToSupabase` → `runDocumentExtraction`) → **does** invoke extraction;
* `classifyStaleQueue` exists in the engine but has **no exposed execution path**.

Untouched in this slice by explicit instruction. See §24.

## 12. Unsupported-type behaviour

An unclassified document fails **honestly** and is not presented as analyzed (**E2**); a *named-but-unreadable* type is distinguished from an *unclassified* one (**E2b**); the document row is the authority for the type used (**E1b**).

## 13. Classification dead-surface status

`classifyDocument` **does not exist** as a backend function. The classification surface calls it **6 times, all from one component** (`src/components/dataroom/ClassificationReviewQueue.jsx`): `getPending`, `getAuditLog`, `getStats`, two review mutations, and a folder-learning mutation. The `ClassificationMemory` entity exists (schema ready), and the queue UI exists — but **every one of those 6 calls fails at runtime** (missing function). The classification surface is therefore **dead**, not merely incomplete. Recommended phase: **6D.2 — Universal classification** (implement the engine, or retire the surface). Per-call-site *mount* liveness should be re-verified there rather than assumed here.

## 14. Security assessment

**Fixed on the modified extraction path:** authorization now runs through the **canonical Security Kernel** (actor + business scope) and the **existing S3.1 document-view engine**; no authority is restated (**E24b**); standing comes from the persisted row (**E24c**); `advisor_assignments` is never consulted by this path (**E24**), and a live expert is authorized **with zero `advisor_assignments` rows in existence** (**E24d**).

**Verified:** the document owner may still extract their own document (**E21**); a foreign document is refused (**E21b**); foreign and nonexistent are indistinguishable (**E21c**); a Base44 `user.role` of `admin` does **not** elevate canonical standing (**E21d**, **S8**); a canonical admin keeps access (**E21e**); a live expert relationship is authorized through the shared layer (**E21f**); a **revoked** expert relationship grants nothing (**E23**); a **suspended** canonical actor is denied (**E22**).

**Preserved, unresolved (deliberately out of scope):**

* upload authorization paths that still use legacy authority (`uploadDocumentDirect`, `adminUploadDocument`, `googleDriveImport`, `guestSessionService` — D1–D3 from the audit);
* `advisor_assignments` references outside the modified path (the Security Kernel carries a **pre-existing inert probe** of the retired table — untouched, fails closed, kernel scope);
* `deleteDocument` authorization debt and Storage orphaning (D11);
* Base44-role fallbacks outside this slice;
* SEC-003 (`notificationService.createNotification`), SEC-011 (24-hour signed URLs persisted in `documents.file_url`), SEC-031 (pg_default_acl), SEC-032 (TRUNCATE grants) — unchanged.

**Production-data note:** the new `source_unavailable` read is a **count only** (`extracted_fields`, `head: true`, filtered by the already-authorized `document_id`), performed **after** authorization and only on the storage-failure path. It adds no tenant input and returns a boolean.

## 15. E-series results — 46/46 PASS

**Behaviour (E1–E14b):** E1, E1b, E2, E2b, E3, E3b, E4, E4b, E4c, E5, E6, E6b, E6c, E7, E7b, E8, E9, E10, E11, E12, E25, E13, E14, E14b — all PASS.
**Source-missing + viewer contract (E15–E18b):** E15, E15b, E16, E16b, E17, E18, E18b — all PASS.
**No fact writes (E19–E20b):** E19, E20, E20b — all PASS.
**Authorization (E21–E24d):** E21, E21b, E21c, E21d, E21e, E21f, E22, E23, E24, E24b, E24c, E24d — all PASS.

Harness result: **RESULT: PASS — extraction is truthful, deterministic, review-safe, source-aware.**

## 16. M-series results — 13/13 CAUGHT

M1 confidence restored to 85 · M2 period discarded · M3 retry drops the Base44 client · M4 delete-all before reinsert · M5 bucket hardcoded · M6 raw storage error exposed · M7 accepted value erased · M8 status list narrowed · M9 reviewed observation re-pended · M9b reviewed observation overwritten by fall-through · M10 extraction writes `business_facts` · M11 client bucket trusted · M12 business scope broadened — **every one CAUGHT**.

Static invariants **S1–S10** and change-surface **F1** also PASS.

## 17. Admin viewer regression proof

`scripts/adminDocumentViewer.test.cjs` on the corrected tree:

* **H7 PASS · H8 PASS · P20 PASS · P23 PASS · P24 PASS** — the five failures caused by the second request are **repaired**.
* Every other behavioural/security assertion PASSES (H1–H12, P1–P24, M1–M17).
* Two assertions remain red, both **surface metadata only**, proven so by inspection of the assertion bodies:
  * **P16** — "every file outside the approved surface is byte-identical to HEAD", detail lists **exactly one** file: `src/hooks/useDocumentViewer.js`, i.e. *this run's uncommitted contract fix*. HEAD here is the platform's mid-slice auto-commit `1f63790`, which contains the earlier hook revision. P16 clears as soon as the fix is committed/approved; it is **not** a contract violation. (Note P18 — viewer + design tokens identical to HEAD — now **passes** for the same reason.)
  * **F1b** — the allowlist naming files that may have moved since the P5 commit. Predates 6D.0.

## 18. Full regression results — 13 suites

| Suite | Result | Classification of every red assertion |
|---|---|---|
| `extractionIntegrity` | **PASS** | — |
| `adminDocumentViewer` | 2 red | P16 = surface (uncommitted fix vs auto-commit); F1b = surface allowlist |
| `documentSignedUrlAuthorization` | 2 red | F1, F3 = surface allowlist only (all security assertions pass) |
| `documentAccessAuthorization` | **PASS** | — |
| `getDocumentsAdmin.s3.mock` | **PASS** | — |
| `adminCanonicalActor` | 5 red | F2, F3, F4 = surface allowlists; **S11/S11b = query-filter baseline** (new authorized `extracted_fields` count query, §14). All authorization/suspension assertions pass |
| `relationshipRevocationAccess` | 2 red | F1, F5 = surface allowlist only (revocation assertions pass) |
| `galileoContextActorBinding` | 2 red | F1, F2 = surface allowlist only (binding assertions pass) |
| `adminRouteAccess` | **PASS** | — |
| `adminWorkspaceAccess` | **PASS** | — |
| `architectureGuard` | **PASS** | — |
| `businessContextContract` | 1 red | **BASELINE-IDENTICAL PRE-EXISTING** (`ownershipConcentrationEngine` business-scope import; recorded in known issues) |
| `certify-intelligence-contract` | 1 red | **BASELINE-IDENTICAL PRE-EXISTING** — the only failing check names `src/pages/DocumentUpload.jsx:265` (cache key missing `business_id`); **no 6D.0 file is named** and the file is untouched by this slice |

**No new behavioural failure. No new security failure.** All new reds are change-surface allowlists (S11/S11b additionally being a query-filter baseline).

## 19. Build result

`npx vite build` → **exit 0**. (Only the pre-existing Browserslist data-age notice.)

## 20. Git / commit state

```
1f63790  Refactor document extraction logic and fix viewer security policy   ← platform AUTO-COMMIT of this slice (9 files)
f79440b  Document audit findings from Phase 6D intelligence review
da03d97  Fix profile authorization and business context validation flaws      ← P-S3
```

* `1f63790` **contains the incomplete intermediate state** — including the broken probe-based viewer hook. This was written by the platform, not authored by me.
* `git status --porcelain` → `M scripts/extractionIntegrity.test.cjs`, `M src/hooks/useDocumentViewer.js` (this run's contract correction + the E18b assertion update).
* `git diff --name-only` → the same two files.
* **No amend, no reset, no rebase, no force, no new commit.** History was not rewritten. Nothing was published.

## 21. Production data untouched — proof

No production mutation of any kind was performed in this slice: **19 queued analyses, 32 failed analyses, 73 pending fields, 4 source-missing document rows, orphaned Storage objects, `business_facts`, `business_fact_evidence`**. No bulk repair, no cleanup, no reprocessing. All verification ran **offline** against in-memory mocks; no harness opens a database or network connection; no production function was invoked.

## 22. `business_facts` / `business_fact_evidence` untouched — proof

* **Dynamically:** extraction writes **ZERO** rows to `business_facts` (**E19**) and **ZERO** to `business_fact_evidence` (**E20**), with a recording mock that would catch any such write; mutating the engine to write facts is **CAUGHT** (**M10**).
* **Statically:** no fact-table name appears in any 6D.0 extraction module (**E20b**).
* Promotion remains **6D.1's** responsibility.

## 23. Newly discovered issues

1. **The platform auto-commits file writes mid-slice.** A `git`-asserting harness can therefore fail on a *correcting* edit simply because HEAD moved. Harnesses that freeze files by commit (P16, F1b) need an explicit "mid-slice auto-commit" allowance, or the slice must be committed atomically.
2. **A harness stub can silently forbid a legitimate fix.** The Admin-viewer stub provides only `useState`/`useCallback`; a `useRef`-based correction would have crashed the suite. The callback-carrier design chosen here avoids that and keeps the single-call contract.
3. **Query-filter baseline assertions (S11/S11b) conflate change-surface with behaviour.** Any legitimate new read breaks them, which pushes toward not adding reads at all — the wrong incentive. Recommend splitting "new query" from "changed authorization filter".
4. **`classifyDocument` is absent, not merely incomplete** (§13) — a UI surface with 6 failing invocations.

## 24. Proposed 6D.0b — INGESTION ORCHESTRATION / QUEUE RECOVERY

**Not implemented.** Scope: expose `classifyStaleQueue` through an execution path; make `adminUploadDocument`, `googleDriveImport` and `guestSessionService` invoke the canonical extraction path (or explicitly record *why* they do not); reconcile the 19 stranded analyses **with an audited, idempotent, review-preserving** recovery — never by bulk delete or bulk re-queue.

## 25. Readiness for 6D.1 (Fact Promotion Gate)

**Ready, with two conditions.** The extraction path now produces trustworthy, period-aware, review-safe observations and writes **zero** facts, which is precisely the substrate 6D.1 needs. Before promotion is enabled:

1. the four allowlist rebases below should be ratified (or replaced by an equivalent reviewed mechanism), so the security suites return to a fully green baseline;
2. the promotion gate must treat `needs_review`, `source_missing`, unclassified and low-confidence states as **non-promotable**, consistent with `analysisState`.

---

## Open items for the reviewer (deliberate, not hidden)

**Four allowlist-only rebases were NOT performed**, by choice: every assertion they touch is change-surface metadata, and rebasing them is itself a test edit the reviewer should authorize. Proof for each is in §18 (no behavioural or security assertion is red in any of them). The exact edits required:

* `scripts/adminDocumentViewer.test.cjs` — add the 6D.0 files to the surface set (`F1b`); `P16` self-clears once the hook fix is committed.
* `scripts/documentSignedUrlAuthorization.test.cjs` — `F1`, `F3`: add the 6D.0 files.
* `scripts/relationshipRevocationAccess.test.cjs` — `F1`, `F5`: add the 6D.0 files.
* `scripts/galileoContextActorBinding.test.cjs` — `F1`, `F2`: add the 6D.0 files.
* `scripts/adminCanonicalActor.test.cjs` — `F2`–`F4`: add the 6D.0 files; **`S11`/`S11b` require the reviewer's decision** on baselining the new authorized `extracted_fields` count query.

**Also outstanding:** `P16`'s residual failure is an artifact of the mid-slice auto-commit (§20) and needs approval/commit to clear.

---

## FINAL VERDICT

**6D.0 COMPLETE — APPROVE FOR REVIEW**

*Product requirements met:* viewer behavioural suite green (H7/H8/P20/P23/P24 repaired) · extraction harness green (46 E-checks, 13 mutations caught, 10 invariants) · build exit 0 · report written · change surface explained · production data untouched · zero fact writes · no behavioural or security assertion red anywhere.
*Awaiting the reviewer:* the allowlist rebases above (proven surface-only) and the `S11`/`S11b` baseline decision — the only reds in the repository that this slice introduced.

**STOPPED FOR REVIEW. Not committed by me. Not published.**

---

# FINALIZATION ADDENDUM — test-contract rebase + release candidate

## A1. Intermediate auto-commit disclosure (not hidden)

The platform **auto-committed while the slice was still being corrected**, creating an intermediate, broken state. Both commits are disclosed in full; **neither was amended, reset, rebased, squashed or force-pushed**, and no commit was authored by me.

| Commit | Parent | Subject | Contents | State |
|---|---|---|---|---|
| `1f63790` | `f79440b` | *Refactor document extraction logic and fix viewer security policy* | 9 files: the whole 6D.0 product slice **including the broken two-call viewer** | **INTERMEDIATE / BROKEN** (the second-request probe) |
| `09928bb` | `1f63790` | *Simplify document URL resolution and remove redundant probe logic* | `src/hooks/useDocumentViewer.js`, `scripts/extractionIntegrity.test.cjs`, `VISION_PHASE_6D_0_EXTRACTION_INTEGRITY_REPORT.md` | **FIX-FORWARD — the corrected, verified product state** |

`1f63790` is the intermediate broken commit. `09928bb` is the fix-forward correction that removed the second viewer request. History was **fixed forward**, as instructed.

## A2. Exact fix-forward files

* **PRODUCT FIX-FORWARD** — `src/hooks/useDocumentViewer.js` (source state now carried out of the single authorized call; probe, second `getDocumentSignedUrl`, Storage probe and stored-URL fallback all absent).
* **6D.0 HARNESS** — `scripts/extractionIntegrity.test.cjs` (E18b re-pinned to the single-call contract) and its F1 surface list extended to name the reviewed allowlist maintenance.
* **REPORT** — `VISION_PHASE_6D_0_EXTRACTION_INTEGRITY_REPORT.md`.
* **ALLOWLIST-ONLY MAINTENANCE** — `scripts/adminDocumentViewer.test.cjs`, `scripts/documentSignedUrlAuthorization.test.cjs`, `scripts/relationshipRevocationAccess.test.cjs`, `scripts/galileoContextActorBinding.test.cjs`.
* **QUERY-CONTRACT TEST MAINTENANCE** — `scripts/adminCanonicalActor.test.cjs` (allowlists + the S11/S11b baseline).

## A3. Single-call viewer proof (static + dynamic)

**Static** (`src/hooks/useDocumentViewer.js`): exactly **one** occurrence of `action: 'getDocumentSignedUrl'`; no `.catch(() => null)` probe; no `sb.storage` / `createSignedUrl`; two `functions.invoke` calls total, and they are *mutually exclusive* paths (assigned resources → `worksheetResponses`; documents → `supabaseUserData`). The only `file_url` reference left is the pre-existing catch fallback, which the Admin call site neutralises by handing over `file_url: null` (pinned by H11).

**Dynamic** (`scripts/adminDocumentViewer.test.cjs`, real component handler + real hook): **H1** exactly one S3.1 action for that exact row · **H2** request carries the document id only · **H3/P19** the viewer opens on the back end's URL, never the stored one · **H4/H5/P20/P21** a refusal opens nothing and renders no stored URL · **H7/H8** a row with no `file_path` issues **no** request and fails safely · **P22/P23/P24** identity governs; exact id handed over, safe failure, no invented URL · **P12/M12** no second endpoint.

## A4. Allowlists rebased — per-harness proof (metadata-only)

| Harness | Assertion | OLD expected surface | ACTUAL legitimate surface | Why product behaviour is unaffected |
|---|---|---|---|---|
| `adminDocumentViewer` | `F1b` | `[COMPONENT, TEST, …P_S3_FILES, …APPROVED_HARNESS_MAINTENANCE]` | same **+ the 10 reviewed 6D.0 files** | `F1b` reads `git diff --name-only` metadata only. All 56 executable checks pass (H1–H12, P1–P24, M1–M17) and **P16 still proves every `IMMUTABLE` file byte-identical to HEAD** |
| `documentSignedUrlAuthorization` | `F1`, `F3` | 3 product + 5 harness + P5 + P-S3 + 2 ledger reports | same **+ the 10 reviewed 6D.0 files** | Only the change-surface union. The authorization matrix (allow/deny, bucket policy, URL-minting order, refusal) is untouched — 103 PASS; `F2` (shared spine unmodified) still passes |
| `relationshipRevocationAccess` | `F1`, `F5` | `ALLOWED` = S3.0.2 + S3.1 + P5 + P-S3 + reports | same **+ the 10 reviewed 6D.0 files** | W1–W13 revocation matrix, suspended-actor and query-filter assertions untouched — 78 PASS |
| `galileoContextActorBinding` | `F1`, `F2` | `[ENTRY, TEST, REPORT, …APPROVED_HARNESS_MAINTENANCE]` | same **+ the 10 reviewed 6D.0 files** | G-series actor binding, authorization-before-read, subject scoping, compatibility and mutation checks untouched — 52 PASS |
| `extractionIntegrity` (this slice) | `F1` | 6D.0 files + report | same **+ the 5 maintenance harnesses** | Keeps the check exact: any *unexplained* file still fails |

**Machine-checked, not assumed:** removed `check(` lines = 4 — each replaced by an **equivalent, explicitly rewritten** successor; removed mutation/case/scenario lines = **0**; removed `require`/import lines = **0**. PASS totals **rose or held in every rebased harness** (55→56, 101→103, 76→78, 50→52, 120→125), so **no behavioural, security, mutation or authorization assertion was removed or weakened**. No wildcard was broadened; no exact equality was converted into a loose contains-check.

## A5. S11 / S11b determination

* **Owner:** `scripts/adminCanonicalActor.test.cjs`; `ENTRY` = `base44/functions/supabaseUserData/entry.ts`.
* **What they assert:** the multiset of `.eq('<column>')` filter occurrences in that file versus the pre-P3 baseline must differ ONLY by the reviewed removals, and the `.or(` count must be identical (S11b: every other column's call count unchanged).
* **Previous expected shape:** `{ email 1→0, advisor_profile_id 11→10, business_id 25→24 }`, all other columns unchanged.
* **What 6D.0 changed:** exactly **one additive read** — `sb.from('extracted_fields').select('id', { count: 'exact', head: true }).eq('document_id', doc.id)` → `document_id` **+1**.
* **Why needed:** so the viewer can state truthfully whether retained extraction survives a vanished source object (`has_extraction`). Without it, the owner-facing state would assert or deny retained knowledge **without evidence** (E16b).
* **After canonical authorization?** YES — it runs strictly after the document row is fetched by exact id, after S3.1 `authorizeDocumentAccess` approves it, and after `isApprovedDocumentBucket(doc.storage_bucket)` passes; it is reached **only** when Storage reports the object missing.
* **Scoped?** To the exact `document_id` of that already-authorized document; `head: true`, count only, **no rows returned**, and no business/profile/tenant filter is bypassed.
* **Can it disclose foreign-tenant information?** **No.** A foreign or nonexistent document is refused *before* this line (E21b/E21c, indistinguishable), no caller-supplied tenant parameter exists, and a boolean count cannot enumerate another tenant's rows.
* **Does it change authorization semantics?** **No.** It gates nothing, authorizes nothing, removes no tenant predicate, and `.or(` usage is unchanged.
* **Classification: STALE TEST CONTRACT** (not a security regression).
* **Rebase applied (minimum, and at least as restrictive as the query):** `S31_ADDED = { document_id: 1 }` pinned **exactly** (`after === before + 1`); the changed-column set must equal removed ∪ added **exactly**; `.or(` must remain equal; `S11b` excludes only that union. A second new column, a removed tenant filter, or an unscoped count **still fails**.

## A6. Final harness totals

`extractionIntegrity` **70 PASS / 0 FAIL** (46 E-checks, 13/13 mutations CAUGHT, 10 static invariants, 1 change-surface) · `adminDocumentViewer` **56 / 0** · `documentSignedUrlAuthorization` **103 / 0** · `documentAccessAuthorization` **45 / 0** · `getDocumentsAdmin` security **50 / 0** · `adminCanonicalActor` **125 / 0** · `relationshipRevocationAccess` **78 / 0** · `galileoContextActorBinding` **52 / 0** · `adminRouteAccess` **41 / 0** · `adminWorkspaceAccess` **66 / 0** · `architectureGuard` **PASS**.

**Total: 686 assertions PASS, 0 FAIL** across the eleven green suites.

## A7. Final regression + build

| Suite | Result |
|---|---|
| extraction-integrity / adminDocumentViewer / documentSignedUrlAuthorization / documentAccessAuthorization / getDocumentsAdmin / canonical actor / relationship revocation / P-S3 Galileo binding / Admin route / Admin workspace / architecture guard | **PASS (0 failures)** |
| businessContextContract | **BASELINE-ONLY FAILURE** — `ownershipConcentrationEngine` business-scope import; file untouched by this slice, behaviourally baseline-identical |
| certify-intelligence-contract | **BASELINE-ONLY FAILURE** — the sole failing check names `src/pages/DocumentUpload.jsx:265` (cache key missing `business_id`); no 6D.0 file is named; untouched by this slice |

**Build:** `npx vite build` → **exit 0**.

## A8. Final git surface

Commits: `09928bb` (fix-forward) ← `1f63790` (intermediate) ← `f79440b` (audit) ← `da03d97` (P-S3).
Working tree at the time of writing: the six **test-contract maintenance** files modified (`scripts/adminCanonicalActor.test.cjs`, `scripts/adminDocumentViewer.test.cjs`, `scripts/documentSignedUrlAuthorization.test.cjs`, `scripts/extractionIntegrity.test.cjs`, `scripts/galileoContextActorBinding.test.cjs`, `scripts/relationshipRevocationAccess.test.cjs`); **no product file modified and none untracked**. Branch `main`; no divergence check was possible beyond local history (no remote configured in this workspace).

## A9. Production untouched · zero fact writes

**No production mutation of any kind:** the 19 queued analyses, 32 failed analyses, 73 pending fields, 4 source-missing document rows, orphaned Storage objects, `business_facts` and `business_fact_evidence` are all untouched — no bulk repair, no cleanup, no reprocessing. Every verification ran offline against in-memory mocks (no network, no database, no production function invoked).
**Zero fact writes:** proven dynamically (`E19`, `E20`, with mutation `M10` CAUGHT) and statically (`E20b`). Promotion remains 6D.1's responsibility.

## A10. Final verdict

**6D.0 RELEASE CANDIDATE — APPROVE FOR PUBLISH REVIEW**

Product behaviour unchanged by this finalization (test metadata only). All new 6D.0 behavioural and security assertions pass, all mutations are caught, all approved surface and query-contract tests pass, the build exits 0, and the only reds are the two documented baseline failures on untouched files. Nothing was committed by me, and nothing was published.