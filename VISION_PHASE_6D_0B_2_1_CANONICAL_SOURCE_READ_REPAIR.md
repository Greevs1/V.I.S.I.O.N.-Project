# VISION PHASE 6D.0b.2.1 — CANONICAL SOURCE READ REPAIR

**Slice:** the durable document-ingestion worker's first canonical read.
**Status:** certification only. The product repair was already implemented and checkpointed;
this report, its harness corrections and the change-surface rebase are the remaining work.

| | |
|---|---|
| Base before the slice | `b102f30ea5cee8e1c694725bbc55a3a57c7eb6a7` |
| Product repair checkpoint | `6107ec8` — "Normalize Supabase project URL and improve canonical read error handling" |
| Product repair diff | 7 files, +876 / −34 (measured `b102f30 → 6107ec8`) |
| Migrations | **0** |
| New dependencies | **0** |
| Facts written | **0** rows into `business_facts`, **0** into `business_fact_evidence` |
| Production specimens | untouched (see §22) |
| 6D.1 | not started |

---

## 1. Production failure specimen

A real 2024 Form 1040, uploaded by the owner of a business with the durable ingestion
path in place, sat permanently in the canonical state **`needs_classification`** — the
state the Data Room renders as "Needs classification" — with its ingestion job recorded
**`failed`**, `attempt_count = 0`, `last_error_class = 'source_missing'`.

- `9a964471-a421-41d2-a8e6-fd19983fdd1e` — the stranded document (read-only diagnosis).
- `a871e587-3af7-4523-9f36-c25d0cd4bf0d` — the earlier specimen from 6D.0b.2 (read-only).

Neither was retried, reclassified, extracted, moved, edited, deleted or backfilled during
this slice. No job was created for either. The diagnosis was a **read**, nothing more.

## 2. First failed boundary

**`source_read_documents`** — the worker's *first* action after loading the job ledger row:
the canonical `documents` read. Not classification, not extraction, not the provider, not
storage. The worker never got past its first query, so:

- the provider was never invoked (`provider_calls = 0` — asserted by S23),
- no classification decision was ever made,
- the upload had already succeeded, so the owner saw a stored document and a truthful-looking
  analysis state.

## 3. Root cause

`VITE_SUPABASE_URL` is stored in this workspace **with an API path and a trailing slash**:
`https://<project>.supabase.co/rest/v1/`.

- `uploadDocumentToSupabase` normalised that value inline before building its client → its
  client worked, and the document *was* stored (which is why the upload looked healthy).
- `processDocumentIngestionJob` passed the **raw** value to `createClient` → the worker's
  client requested `…/rest/v1/rest/v1/…`, and PostgREST answered **PGRST125 "Invalid path
  specified in request URL"** for *every* query.

The second half of the defect was the **collapse of two different facts into one**:
`readCanonicalRow` discarded `res.error` and returned `null`, so a *rejected request* was read
as *"the canonical row does not exist"*. The job was then recorded terminal
`source_missing` with zero attempts — a truthful-looking verdict on top of an infrastructure
fault, and an eternal `needs_classification` for the owner.

Two implementations, one normalised and one not, is how the two paths drifted. That is the
defect class this slice closes — and the reason the fix is **one shared normalizer**, not a
second inline copy.

## 4. Raw-vs-normalized reproduction

Read-only, against production, before any code change:

| client built from | request path | canonical row read | PostgREST |
|---|---|---|---|
| raw stored value (`…/rest/v1/`) | `…/rest/v1/rest/v1/documents` | `row_present = false` | **PGRST125** |
| normalised value | `…/rest/v1/documents` | **`row_present = true`** | 200 |

The very same row — one client could not see it, the other could. This is the evidence that
the production failure was a URL-shape fault, not a missing document.

## 5. Shared URL normalizer

`base44/shared/supabase/projectUrl.ts` — `normalizeSupabaseProjectUrl(value)`.

- strips a known Supabase API path segment (`/rest/v1`, `/auth/v1`, `/storage/v1` and anything
  after it) and trailing slashes;
- touches nothing else: no scheme rewriting, no host guessing, no hardcoded project, no
  credential handling;
- accepts `''` / `undefined` → `''`.

```
https://project.supabase.co          → https://project.supabase.co
https://project.supabase.co/         → https://project.supabase.co
https://project.supabase.co/rest/v1  → https://project.supabase.co
https://project.supabase.co/rest/v1/ → https://project.supabase.co   ← the production value
https://example.test/base            → https://example.test/base      ← untouched
```

Consumed by **both** ingestion paths (`uploadDocumentToSupabase`, `processDocumentIngestionJob`);
`S5`/`S6` assert the shared call, `S7` asserts that exactly **one** normalizer implementation
exists in the slice and that both consumers import this module. No private duplicate remains
in either path.

## 6. Canonical read result model

`readCanonicalRow(sb, table, columns, id)` returns one of three outcomes — never two:

| outcome | meaning | error |
|---|---|---|
| `FOUND` | the query **succeeded** and returned the row | `null` |
| `NOT_FOUND` | the query **succeeded** and the row does not exist | `null` |
| `QUERY_ERROR` | the query **did not succeed** (transport, path, auth, 5xx, shape) | `{ message, code }` |

`QUERY_ERROR` **preserves both the error message and the error code**, so the canonical
failure classifier decides what the failure *is*, instead of the caller deciding for it
(`readErrorNeverNull` predicate, asserted by S22 and by mutations SM8/SM9).

## 7. QUERY_ERROR vs NOT_FOUND

- A `QUERY_ERROR` is **never** evidence about the row's existence. PGRST125 ≠ source_missing;
  a thrown network error ≠ source_missing; a 5xx ≠ source_missing; a 401 ≠ source_missing.
  (S10, S11, S12, S13 — executed; mutations SM6–SM9, SM14.)
- A `NOT_FOUND` may become `source_missing` — and it does (S9, S14).
- The same separation applies to the **claim**: a claim query that failed to run
  (`claim_query_error`) is not a claim that was lost (`analysis_already_claimed`); the former is
  classified and retried, the latter is healthy competition.

## 8. source_missing semantics

`source_missing` is **earned**, never assumed. It is reachable from exactly two proven states:

1. the canonical read **succeeded** and returned **no document row** (`NOT_FOUND`) — S9/S14; and
2. the canonical row was read and genuinely carries **no storage coordinates**
   (`file_path` and `file_url` both empty) — S22.

An *unreadable-but-present* source is not `source_missing`: a signed-URL/storage failure is
**transient** and goes to the durable retry system (S22), and a provider read that could not
happen (`no_content_access`, `classification_unavailable`) **retries** rather than completing
(S38).

## 9. Failure classifier

`classifyFailure(err)` → `{ error_class, error_code, message }`, evaluated in this order:

1. `content_read_unavailable` → **transient** (named first, so a reason token can never be read
   as a permanent conclusion);
2. `PGRST125 | invalid path | invalid api key | invalid credential | unauthorized | forbidden |
   malformed url | invalid url | configuration_error` → **permanent / configuration_error** —
   terminal, and **never** recorded as a missing document;
3. `source_missing | no_content_access | relationship_mismatch | malformed | unsupported content
   | invalid contract` → **permanent**;
4. `timeout | abort | deadline | classification_read_timeout | ECONN | ETIMEDOUT | EAI_AGAIN |
   network | fetch failed | 429 | 5xx | signed url | storage` → **transient infrastructure**;
5. otherwise → **transient**.

One deliberately added class (`configuration_error`), not a taxonomy.

## 10. Attempt invariant

**ATTEMPT_BEGINS_WHEN** = a worker run has passed the claimability gate *and* has either

- **claimed** the canonical analysis row (`claimJob` → `attempt_count = n + 1`, `claimed_at = now`,
  lease written), **or**
- **reached canonical resolution and failed there** (`preClaimFailure` → `attempt_count = n + 1`).

An attempt does **not** begin when the gate refuses (no work is owed: already completed, already
leased, attempts exhausted) — and it does not begin for a **pre-attempt terminal** outcome, where
`attempt_count` deliberately stays `0` because nothing was ever started.

Every worker execution that encounters a processable infrastructure failure is therefore either

- **A. represented by `attempt_count`** — a claimed attempt, or a pre-claim run that reached
  canonical resolution and failed there; or
- **B. explicitly pre-attempt terminal**, with a documented reason that `attempt_count` remains
  `0`: `last_error_class ∈ { configuration_error, source_missing, relationship_mismatch }` **and**
  `claimed_at = null`. This is the only meaning of `failed` + `attempt_count = 0`.

The production bug — a transient infrastructure failure left as `failed`, `attempt_count = 0`,
`next_retry_at = null` — is now impossible: **every transient class is retried before it can
become terminal** (S15, S16, S17, S18; mutations SM10, SM11, SM12), and the ledger's own schema
description records the invariant (S40). Both the entity description and the worker's
`preClaimFailure` header state it, so the ledger and the code cannot disagree.

## 11. Retry behavior

- A transient failure schedules `waiting_retry` with a real `next_retry_at` (bounded backoff) and
  **increments `attempt_count`** (S16–S18).
- Recovery reclaims it when due — `findDueJobs` returns it and the **same** worker runs it (S17,
  S30).
- The budget is bounded at `MAX_ATTEMPTS = 3`; attempt 3 of 3 is terminal
  (`transient_exhausted`, S19) and the canonical row then states that processing did not finish
  (`needs_classification` + the truthful owner message, S20).
- A transient failure is never terminal on its first attempt (S20).
- A `configuration_error` is terminal by design and is not retried forever (S21).

## 12. UI failure semantics

Two different facts keep two different sentences (S35–S37):

| situation | owner-facing |
|---|---|
| VISION examined the document but could not confidently classify it | the **confirmation** message ("Needs your confirmation…") |
| VISION could not finish processing the document | **"VISION couldn't finish processing this document. Upload it again to retry."** |

The infrastructure sentence never leaks internals: no `Supabase`, no `PostgREST`, no `PGRST125`,
no `service-role`, no URL or configuration detail — asserted statically across the vocabulary,
the Data Room labels and the upload page, and dynamically over the resolved states (S35).

**Follow-up UX debt (not built in this slice):** a future explicit **"Retry processing"** action
should create/requeue work through the **durable ingestion job system** rather than asking the
owner to upload a duplicate. Re-upload is acceptable for *this* release only because no safe
retry action exists yet.

## 13. Durable architecture preservation

Unchanged, and asserted as such: the job ledger entity, the **entity-create trigger** on
`DocumentIngestionJob`, the **one** worker, the atomic claim + **lease** (never an eternal
boolean), bounded retry with `next_retry_at`, and the **scheduled, sweep-only recovery** that
calls the same worker (`S29`, `S30`, `S40`). `waitUntil` remains **absent** from the entire
ingestion slice (S31) — durability never depends on a browser or a post-response window. The
browser is not the worker (S32).

## 14. Security preservation

- The worker still derives **`business_id` from the canonical document row** and
  **`document_scope`/`profile_id` from canonical records** — never from the caller, never from the
  ledger (S27, S28, S40; mutations SM21, SM22). The ledger deliberately carries none of them.
- The authorization spine is **byte-identical to HEAD**: `documentAccess.ts`, `buckets.ts`,
  `relationshipAccess.ts`, `actor.ts` (S28, GIT evidence).
- The provider cannot execute before canonical source resolution succeeds (S23, S24; mutation
  SM18).
- **The full security battery was re-run in this certification** — see §19. No product
  authorization file was touched by this slice.

## 15. Fact freeze

**0** writes to `business_facts` and **0** to `business_fact_evidence`, asserted statically over
the whole slice (S33, S34) and by mutation (SM23, SM24). The Digital-Twin freeze holds.
6D.1 is untouched.

## 16. Follow-up raw-client debt

The inventory found **128** files that construct a Supabase client; **122** normalize inline,
**6** do not. This slice changes **exactly one** of them (the proven ingestion failure).

**NOT changed in this slice — recorded as follow-up debt:**

- `createSnapshotFromReviewedFields`
- `generateAdvisorCommandCenter`
- `generateWeeklyDigest`
- `liveSyncOrchestrator`

They carry the same defect class (a raw `VITE_SUPABASE_URL` would make their client request a
doubled path). None of them is on the document-ingestion path, so none caused the production
failure. They are **absent from this slice's diff** and remain latent debt.

**Clarification:** `src/api/base44Client.js` is **not** a Supabase client — it is the app's Base44
SDK client (`createClient` from `@base44/sdk`). It is **not** part of this defect class and was
correctly excluded.

**Also recorded, not modified:** `retryDocumentAnalysis` remains **inline / non-durable** and
refuses unclassified types. It is **not** the recovery mechanism for 6D.0b.2.1 and was left
untouched. Future retry UX must route through the durable ingestion job system.

## 17. S1–S40

`src/scripts/documentCanonicalSourceRead.test.cjs`, run in a **fresh `node` process**:

```
node src/scripts/documentCanonicalSourceRead.test.cjs
S1-S40: 60/60 passed · SM1-SM25: 25/25 caught
PASSED — all 85 checks (S1-S40, SM1-SM25).   exit code 0
```

Aggregate executable assertions: **85** (60 `S` assertions + 25 `SM` mutations). The harness
prints 86 lines beginning with `PASS` because the final `PASSED —` footer also matches that
prefix; the assertion count is **85**.

Coverage: normalizer behaviour and single-implementation proof (S1–S7); canonical read outcomes
(S8–S14); transient retry through the durable system (S15–S20); `source_missing` earned, not
assumed (S21–S23); provider gating (S23–S24); untouched classification, extraction and the
authorization spine (S25–S28, GIT evidence); durable architecture and the entity trigger
(S29–S32); fact freeze (S33–S34); truthful owner-facing failure semantics (S35–S37); preserved
contracts and the attempt invariant (S38–S40).

## 18. SM1–SM25

**25 CAUGHT / 0 MISSED.** Four mutations were *harness-definition* defects, not product
behaviour; they were corrected in the harness only, and no product assertion was weakened:

| mutation | defect | correction | proof the mutation now changes behaviour |
|---|---|---|---|
| **SM5** | the anchor was double-escaped: the runtime find lost its opening `/` and the split matched nothing, so the mutation was a **silent no-op** | the mutation is now built from two plain **fragments** of the normalizer's own source (no regex literal to escape), and the assertion additionally proves the mutated source **differs** from the original | mutated normalizer returns `https://project.supabase.co/` where the shipped one returns `https://project.supabase.co` |
| **SM15** | the predicate wrapper was missing: the assertion compared a **string** to `false` and could never fail | wrapped in the internals predicate | mutated note = `PGRST125: Invalid path specified in request URL` → predicate **false** |
| **SM16** | same missing wrapper | wrapped in the internals predicate | mutated note contains `supabase rest/v1 service-role failure` → predicate **false** |
| **SM20** | the mutation renamed the worker, leaving the matched prefix in place, so the invariant still held | the mutation now inserts a **genuine second worker path** (an exported `processJobRetryShadow` that runs `processJob`) | worker exports: **1 → 2** |

## 19. Regression matrix

Every security-sensitive harness was re-run in a **fresh `node` process**:

| harness | result |
|---|---|
Figures are measured `PASS`-prefixed output lines; where a harness also prints a
`PASSED —` footer, that footer is included in the line count (e.g. 86 lines = 85
assertions for this slice's harness).

| harness | exit | PASS lines |
|---|---|---|
| 6D.0a `semanticObservationBridge` | 0 | 57 |
| 6D.0b `documentUnderstanding` | 0 | 77 |
| 6D.0b.1 `documentUnderstandingRealSeam` | 0 | 65 |
| 6D.0b.2 `durableDocumentIngestion` | 0 | 124 |
| 6D.0b.2.1 `documentCanonicalSourceRead` | 0 | 86 (85 assertions) |
| `documentUploadClassification` | 0 | 42 |
| `extractionIntegrity` | 0 | 70 |
| `adminDocumentViewer` | 0 | 56 |
| `documentAccessAuthorization` | 0 | 45 |
| `documentSignedUrlAuthorization` | 0 | 103 |
| `galileoContextActorBinding` | 0 | 52 |
| `relationshipRevocationAccess` | 0 | 78 |
| `adminCanonicalActor` | 0 | 125 |
| `adminRouteAccess` | 0 | 41 |
| `adminWorkspaceAccess` | 0 | 66 |
| `getDocumentsAdmin.s3.mock` | 0 | 50 |
| `architectureGuard` | 0 | — |

**17 / 17 exit 0. RELEASE REGRESSIONS = 0.**

### Two further findings in the final run, both fixed in harnesses only

- **`durableDocumentIngestion` Q45: a clock-dependent fixture, not a product regression.**
  Q45 called `findDueJobs` *without* `now`, so it read the wall clock against absolute fixture
  instants. At certification time real UTC had passed `2026-10-04T23:00Z`, so the "not-yet-due"
  fixture had genuinely become due and the assertion inverted. The product's due-retry logic is
  correct (Q46 pins `now` and passed throughout). Fix: Q45 now pins `now` to Q46's own instant
  (`2026-10-04T21:00Z`). The expectation (due → recoverable, not-yet-due → not) is unchanged.
- **`galileoContextActorBinding` F2**: the second change-surface predicate in that harness
  also needed the `P_6D0B2_1_FILES` allowlist entry (the F1 one had already been rebased).
  Allowlist line only.

One failure was found and fixed before certification: `durableDocumentIngestion` **Q37**
("duplicate classification rows are prevented by the atomic claim") is a **static
source-shape** assertion naming the reviewed claim's own variable (`Array.isArray(data) &&
data.length === 1`). The 6D.0b.2.1 claim refactor had renamed that variable to `claimRes.data`.
Semantics were identical — the claim is still atomic and duplicate delivery still converges
(Q6, Q34, Q38 passed throughout). The **product** was rewritten to the reviewed shape (the
claimed outcome is destructured into `data`, with the claim's error handled explicitly) rather
than relaxing the assertion. **No assertion was removed, relaxed, skipped or downgraded.**

### Change-surface allowlists rebased (allowlist lines ONLY)

Each entry below was computed from git — `changed − named` — never guessed. No behavioral,
security, mutation or expectation line was deleted.

| harness | old allowlist | new entry | why required |
|---|---|---|---|
| `extractionIntegrity` | `EXPECTED` (… 6D.0b.2 block, `APPROVED_ALLOWLIST_MAINTENANCE`) | `base44/shared/supabase/projectUrl.ts`, `src/scripts/documentCanonicalSourceRead.test.cjs`, `VISION_PHASE_6D_0B_2_1_CANONICAL_SOURCE_READ_REPAIR.md` | the slice's shared module, its harness and its report are new files in the surface |
| `documentUploadClassification` | `EXPECTED` (… `P_6D0B_FILES`) | new `P_6D0B2_1_FILES` spread into `EXPECTED` (same 3 files) | same; the harness diffs since the published 6D.0 commit (`abc4844`) |
| `adminCanonicalActor` | `P_6D0B2_SHARED = ['…orchestration.ts']` | `+ 'base44/shared/supabase/projectUrl.ts'` | F4 forbids any un-named `base44/shared/` module |
| `adminDocumentViewer` | `EXPECTED_WORKING` (… `P_6D0B_FILES`) | `…P_6D0B2_1_FILES` (same 3 files) | F1b compares the surface since the P5 commit by set equality |
| `documentSignedUrlAuthorization` | F1 union (… `P_6D0B_FILES`) | `…P_6D0B2_1_FILES` (same 3 files) | F1 is a set-equality comparison of the whole surface |
| `galileoContextActorBinding` | F1 union (… `P_6D0B_FILES`) | `…P_6D0B2_1_FILES` (same 3 files) | F1 is a set-equality comparison of the whole surface |
| `relationshipRevocationAccess` | `ALLOWED` (… `P_6D0B_FILES`) | `…P_6D0B2_1_FILES` (same 3 files) | F1 is a set-equality comparison of the whole surface |

`documentAccessAuthorization`, `adminRouteAccess`, `adminWorkspaceAccess`,
`getDocumentsAdmin.s3.mock`, `architectureGuard`, `semanticObservationBridge`,
`documentUnderstanding`, `documentUnderstandingRealSeam` and `durableDocumentIngestion`
needed **no** allowlist change.

## 20. Baseline debt (pre-existing, unchanged, reported separately)

- `businessContextContract` — red assertion on the pre-existing `businessContextContract` baseline.
- `certify-intelligence-contract` — red assertions including the `ownershipConcentrationEngine`
  canonical import and the `DocumentUpload` inline `business-intelligence-contract` key.

Neither is touched by this slice and neither changed: they are the same baseline debts recorded
before 6D.0b.2.1. They are **not** release regressions.

## 21. Build

Canonical production build (`npm run build` → `vite build`): **exit code 0**, measured in this
certification. Only advisory output (the stale `caniuse-lite` notice).

## 22. Changed files

**Product / shared infrastructure** (commit `6107ec8`):

| file | category |
|---|---|
| `base44/shared/supabase/projectUrl.ts` | **NEW** — the ONE shared normalizer |
| `base44/functions/processDocumentIngestionJob/entry.ts` | PRODUCT — the proven defect (raw URL → shared normalizer) |
| `base44/functions/uploadDocumentToSupabase/entry.ts` | PRODUCT — inline normalizer → shared normalizer |
| `base44/shared/documentIngestion/orchestration.ts` | PRODUCT — read outcomes, failure classification, attempt/retry semantics, content-access semantics |
| `src/lib/documents/documentTypes.js` | PRODUCT — truthful processing-failure note (ambiguity kept separate) |
| `base44/entities/DocumentIngestionJob.jsonc` | ENTITY-DESCRIPTION-ONLY (same property keys; asserted by S29) |

**Certification** (this report's delta):

| file | category |
|---|---|
| `src/scripts/documentCanonicalSourceRead.test.cjs` | HARNESS — new permanent harness (S1–S40, SM1–SM25) |
| `scripts/*.test.cjs` × 7 | ALLOWLIST-ONLY — the rebase table in §19 |
| `VISION_PHASE_6D_0B_2_1_CANONICAL_SOURCE_READ_REPAIR.md` | REPORT (this file) |

Measured `b102f30 → HEAD` (product repair): **7 files, +876 / −34.**
Measured `b102f30 → working tree`, the full slice including the certification delta and this
report: **16 files, +1386 / −42** (measured before this report's final figures were written in).

**The four latent raw consumers are absent from the diff** (`createSnapshotFromReviewedFields`,
`generateAdvisorCommandCenter`, `generateWeeklyDigest`, `liveSyncOrchestrator`) — verified with
`git diff --name-only`.

## 23. Migrations

**MIGRATIONS = 0.** No `.sql`, no `src/supabase/migrations/`, no schema change. The entity file
change is description-only.

## 24. Dependencies

**NEW DEPENDENCIES = 0.** `package.json` is untouched; the harness uses only `fs`, `path`,
`esbuild` (already present) and `child_process`.

## 25. Production freeze

`9a964471-a421-41d2-a8e6-fd19983fdd1e` and `a871e587-3af7-4523-9f36-c25d0cd4bf0d` were **read
only**. For both: **no retry, no classification, no extraction, no move, no edit, no delete, no
backfill, no new job.** No production repair-in-place. Neither ID appears anywhere in the slice
(S40 asserts this over every file, and SM25 proves the assertion catches an attempted backfill).

## 26. Post-publish acceptance test (defined, NOT executed)

After publication, upload a **THIRD fresh copy** of the same real 2024 Form 1040, selecting
**"Not sure"**, and expect, in order:

1. the upload succeeds and returns `pipeline_status: 'queued'` with an `ingestion_job_id`;
2. a `DocumentIngestionJob` row is created (`queued`);
3. the entity trigger fires and the worker resolves the **canonical document** successfully
   (`FOUND` — no doubled path, no PGRST125);
4. the atomic claim succeeds (`attempt_count = 1`, lease written);
5. the provider is invoked **once**;
6. classification returns, `DocumentClassification` persists;
7. `document_type = personal_tax_return`, subtype `form_1040`, reader `personal_tax_return`;
8. extraction begins/completes and reviewable fields appear.

**Deliberately refresh or leave the page during processing:** processing must continue —
durability never depends on the browser (S31/S32).

Then **"See what Galileo found"** must automatically discuss **that exact third document**.

Do not execute this test as part of this certification.