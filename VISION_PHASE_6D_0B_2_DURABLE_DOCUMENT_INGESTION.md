# VISION PHASE 6D.0b.2 — DURABLE DOCUMENT INGESTION ORCHESTRATION

**Status:** IMPLEMENTED — awaiting the release-gate verdict in the final response.
**6D.1:** NOT STARTED · **Facts:** NOT WRITTEN · **Production:** UNTOUCHED

Every claim below is one of: **EXECUTED** (the shipped module ran), **STATIC** (an invariant over the exact reviewed bytes), **REF** (proven by another harness in this battery), or **UNPROVEN** (stated as such and never upgraded by inference).

---

## 1. Base44 workflow capability (Phase 0, read-only audit)

| Question | Finding |
|---|---|
| Durable mechanism | Base44 **workflows** — `base44/workflows/<Name>.jsonc`, CNCF Serverless Workflow v1.0 |
| Durability | durable schedules, **durable waits** ("survives restarts"), versioned definitions (a running workflow keeps its starting version), persistent per-run history (`get_workflow_run`) |
| Triggers | scheduled (cron · one_time · interval, **min 5 min**), **entity** (Base44 entities, create/update/delete, with jq conditions), connector, in_app_agent, app_user_auth, app_publish, app_payment |
| Activities | `invoke_backend_function`, `send_email`, `compute_seconds_until` |
| Retry semantics | **no per-step automatic retry** — durability is the run and its waits, so bounded retry is encoded explicitly |
| Delivery | **at-least-once** (no exactly-once contract anywhere) → idempotency mandatory |
| Execution | strictly sequential, one task at a time; each step's work runs inside a backend function |

**Not available, and therefore not used:** an entity trigger on `document_analysis` (it is a **Supabase** table, not a Base44 entity — 38 Base44 entities exist, none is the job row) and any "start a workflow" activity or SDK call (so the upload request cannot durably hand off work).

## 2. Why the job entity was selected

The phase's trigger order resolves to option 3 (scheduled sweeper) once 1 and 2 are unavailable — but a sweeper-only design has a **5-minute latency floor** and **cannot bound retries truthfully** (no persisted attempt count, and adding one to `document_analysis` was excluded). The approved Base44-native ledger removes both costs:

```
entity trigger → seconds latency, event-driven, durable
ledger entity  → attempt/lease/retry metadata with NO migration
```

## 3. Job schema (`base44/entities/DocumentIngestionJob.jsonc`)

`document_id · analysis_id · status · attempt_count · last_attempt_at · last_error_class · last_error_message · next_retry_at · claimed_at · lease_expires_at`

`status ∈ queued | processing | waiting_retry | completed | failed` — orchestration only.

## 4. Job-is-not-truth

The ledger answers *"does durable work still need to happen?"* and nothing else. It carries **no** `business_id`, `document_scope`, `profile_id`, `role`, `email`, `document_type`, classification, subtype, tax year, folder, extracted data or review decision (Q51–Q53). Canonical truth stays in `documents`, `document_analysis`, `DocumentClassification`, extracted fields, existing review state and the 6D.0a observation layer. Business, scope and profile are **re-derived from the canonical `documents` row on every run** (Q32–Q34).

## 5. Entity trigger

`Document Ingestion` — trigger `entity` / `DocumentIngestionJob` / `["create"]` → `invoke_backend_function(processDocumentIngestionJob, {job_id})` → switch on the outcome → a retryable outcome waits `PT2M` durably and re-invokes once → `end`. The workflow contains **no** classification or extraction logic (Q50, QM32, QM33). No loop is possible: it triggers on `create` and never creates that entity.

## 6. The canonical worker

`base44/shared/documentIngestion/orchestration.ts` — **one** implementation (`processJob`), entered by `base44/functions/processDocumentIngestionJob/entry.ts`, called by both the entity workflow (`{job_id}`) and the recovery workflow (`{sweep:true}`). Order: load job → resolve ids → load canonical document + analysis → derive business/scope server-side → validate the job↔document pair → claim → inspect canonical state → exit if settled → existing understanding → existing extraction → persist canonical results → update orchestration state → structured outcome. The job id is the **only** accepted input; a non-admin user session is refused (403).

## 7. Claim semantics

`claimJob` performs an **atomic conditional update on the canonical analysis row** (`.update(...).eq('id', analysis_id).in('status', CLAIMABLE_ANALYSIS_STATES).select('id')`) and wins only if exactly one row returns. Two workers cannot both win, and the job records `attempt_count + 1`, `claimed_at`, `last_attempt_at`, `lease_expires_at` (Q7, Q37, QM4).

## 8. Lease semantics

`lease_expires_at = claimed_at + 5 min`. A live lease is never stolen (Q59, QM29); an expired lease is reclaimable (Q58, QM30) — never an eternal boolean lock.

## 9. Retry semantics

Failure classes: **transient** (timeout, 5xx, network, signed-URL/storage) retry; **permanent** (missing source, malformed/unsupported content, relationship mismatch) is terminal on the first attempt. `MAX_ATTEMPTS = 3`; backoff 2 min then 10 min; the ledger persists `attempt_count`, `last_attempt_at`, `last_error_class`, `last_error_message`, `next_retry_at` (Q9–Q13). No `setTimeout`, no recursive invocation, no busy loop, no browser retry (Q49, QM7).

## 10. Recovery workflow

`Document Ingestion Recovery` — scheduled `*/5 * * * *`, America/Phoenix, recovery only. It reclaims a queued job whose trigger was missed, a processing job with an expired lease, and a `waiting_retry` job whose `next_retry_at` is due — and ignores completed jobs, terminal failures, live leases and not-yet-due retries (Q44–Q46, QM19). It calls the **same** worker.

## 11. Idempotency

At-least-once delivery is safe because the claim is atomic, the ledger is a single row per canonical pair, and the worker exits on settled canonical state: a duplicate delivery performs **zero** provider calls and never creates a second classification row or duplicate extracted fields (Q6, Q37, Q38, Q56). The upload reuses an existing active job rather than creating a second (QM18).

## 12–13. Classifier and extraction reuse

Nothing was redesigned: `runIngestionUnderstanding` (6D.0b) and `runExtraction` (existing engine) are invoked unchanged, on the **applied canonical type** (Q15, QM10). Orchestration writes no `document_type` itself (Q14, QM27).

## 14. Review safety

Orchestration never writes `extracted_fields`, `accepted_fields`, `corrected_fields`, `rejected_fields` or review state, so a retry cannot erase human-reviewed work (Q19–Q21, QM11–QM13, QM35).

## 15. State resolver

The 6D.0b.1 resolver is untouched and remains the single user-facing vocabulary: unclassified `other` ≠ recognized unsupported; a classification that ran and did not resolve completes the job with **Needs classification**; an exhausted **extraction** failure writes `failed` → **Analysis failed**; a recognized unsupported type completes → **Analysis not yet supported**. Storage success never becomes **Upload Failed** (Q22–Q26, QM8, QM9).

## 16. UI observer contract

The UI only reads persisted state (Data Room + DocumentUpload resolve canonical state and poll to make progress visible). No client timer advances the job; closing the browser, refreshing or moving devices cannot start, restart or duplicate it (Q4, Q27–Q30, Q48, QM17, QM18, QM34).

## 17. Galileo CTA

Preserved unchanged: the click submits a real Galileo request carrying the exact document as the canonical focused record, and the server re-resolves and authorizes it. No typing, no input-only focus, no `activeBusinessId` mutation (Q41–Q43, QM22–QM24).

## 18. Security

The ledger is not an authorization path: RLS restricts it to admins (backend-only infrastructure visibility), the worker refuses a non-admin user session, and the worker derives document/business/scope from canonical records — never from input or from the ledger. Referencing a job id cannot disclose a document or grant access; no document content is ever returned (Phase 17).

## 19. Business isolation

No write anywhere in the slice carries `business_id`, `document_scope` or `profile_id` (Q32, Q33; `touchedBusiness` is false across every scenario). Classification may suggest meaning; it cannot move a document between tenants.

## 20. Fact freeze

`business_facts` = 0 writes · `business_fact_evidence` = 0 writes (Q39, Q40, QM20, QM21). 6D.1 untouched.

## 21. Q1–Q60 · QM1–QM35

`src/scripts/durableDocumentIngestion.test.cjs` — **Q1–Q60: all ids PASS · QM1–QM35: all ids CAUGHT · 123 checks, 0 failures** (higher than 95 because several ids carry more than one probe). Run: `node src/scripts/durableDocumentIngestion.test.cjs`

## 22. Regression matrix (isolated fresh processes)

| Harness | Result |
|---|---|
| 6D.0a semanticObservationBridge | PASS (57) |
| 6D.0b documentUnderstanding | PASS (77) |
| 6D.0b.1 documentUnderstandingRealSeam | PASS (**65** = 45 R + 20 RM) |
| **6D.0b.2 durableDocumentIngestion** | PASS (**123 checks** = Q1-Q60 · QM1-QM35) |
| documentUploadClassification | PASS (42) |
| extractionIntegrity | PASS (70) |
| adminDocumentViewer | PASS (56) |
| documentAccessAuthorization | PASS (45) |
| documentSignedUrlAuthorization | PASS (103) |
| galileoContextActorBinding | PASS (52) |
| relationshipRevocationAccess | PASS (78) |
| adminCanonicalActor | PASS (**125**) |
| adminRouteAccess | PASS (41) |
| adminWorkspaceAccess | PASS (66) |
| getDocumentsAdmin | PASS (50/50) |
| architectureGuard | PASS (768 files, 0 violations) |

**Corrections carried from 6D.0b.1 (documentation only, no behavior change):** `adminCanonicalActor = 125` and the 6D.0b.1 harness = **65 checks (45 R + 20 RM)** — applied in `VISION_PHASE_6D_0B_1_REAL_PROVIDER_SEAM_REPAIR.md` and recorded here.

**Retargeted assertions (not weakened):** the 6D.0b `D1/D8/D22/D23/D26` and the 6D.0b.1 `R1/R10/R39/R40/RM1/RM18` assertions named the upload request as the place the pipeline lives. That mechanism was **replaced by design** in this phase, so those assertions were pointed at where the behaviour now lives (the canonical worker + the durable hand-off), keeping the identical property and strength. No authorization assertion anywhere was weakened; only reviewed change-surface allowlists were extended.

## 23. Baseline debt (pre-existing, unchanged)

* `businessContextContract` — `base44/functions/ownershipConcentrationEngine/entry.ts` imports the business-scope guard without the canonical import. File outside this slice.
* `certify-intelligence-contract` — the inline contract literal `['business-intelligence-contract']` at `src/pages/DocumentUpload.jsx` (line 282; ledger 265; baseline 272). Same construct, untouched by this slice; every other certificate check green.

**RELEASE REGRESSIONS = 0.**

## 24. Build

`npm run build` → **exit 0**.

## 25. Changed files

PRODUCT (9): `base44/entities/DocumentIngestionJob.jsonc`, `base44/shared/documentIngestion/orchestration.ts`, `base44/functions/processDocumentIngestionJob/entry.ts`, `base44/workflows/Document Ingestion.jsonc`, `base44/workflows/Document Ingestion Recovery.jsonc`, `base44/functions/uploadDocumentToSupabase/entry.ts`, `src/pages/DocumentUpload.jsx` + the two 6D.0b.1 product files already in review.
HARNESS (2): `src/scripts/durableDocumentIngestion.test.cjs`, `scripts/documentUnderstanding.test.cjs` (retargeted assertions + allowlist).
ALLOWLIST-ONLY (7): `adminCanonicalActor`, `adminDocumentViewer`, `documentSignedUrlAuthorization`, `galileoContextActorBinding`, `relationshipRevocationAccess`, `documentUploadClassification`, `extractionIntegrity`.
REPORT (2): this file, plus the 6D.0b.1 count correction.

## 26. Migrations

**NONE** — the ledger is a Base44 entity; `document_analysis` was not altered.

## 27. Dependencies

**NONE added.**

## 28. Production freeze

`9a964471-a421-41d2-a8e6-fd19983fdd1e` was **not** retried, reclassified, extracted, moved, edited, deleted or backfilled; no sweeper can reach it (recovery scope is jobs only, and no job was backfilled for it). `Apex Roofing LLC` / `Apex Roofing Test 2` unchanged.

## 29. Post-publish acceptance test (do not run before approval)

Upload a NEW real 2024 Form 1040, manual type **Not Sure**; leave the Data Room / refresh the browser. Expect the job to continue independently: Uploaded → Understanding document → recognized as 2024 Form 1040 → `personal_tax_return` → Analyzing → extracted fields / review. Verify `DocumentIngestionJob` exists and completes, `DocumentClassification` exists, `document_type = personal_tax_return`, `subtype = form_1040`, reader = `personal_tax_return`, analysis completed, extracted fields exist, **not** Other, **not** Not Yet Supported, business/scope unchanged. Then click **See what Galileo found** — Galileo discusses that exact document with no further typing.