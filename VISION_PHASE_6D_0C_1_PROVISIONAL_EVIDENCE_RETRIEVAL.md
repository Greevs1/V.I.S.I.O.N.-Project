# VISION — Phase 6D.0c.1 — PROVISIONAL EVIDENCE RETRIEVAL

**Status:** release candidate — behavioural proofs executed and passing
**Surface:** the Galileo answer lane (`askGalileo`, `focusedDocument`, `useAskGalileo`, `GalileoAnswerPanel`)
**New shared module:** `base44/shared/galileo/provisionalEvidence.ts`
**Harness section:** `src/scripts/documentKnowledgeCompletion.test.cjs` §I

---

## 1. The production defect this phase closes

During production acceptance, a supported Profit & Loss statement was uploaded and
extracted: **11 figures**, all `pending_review`, revenue among them. The owner then
asked Galileo a general question:

> "What is my revenue?"

Galileo answered that the figure was **not available**.

The number was available. It had simply not yet been **reviewed**.

The root cause was not a missing read and not a missing row. It was a missing
**lane**: unreviewed extraction was only ever reachable when the question was
*about one specific document* (the focused-document contract). A general business
question walked the confirmed path only:

```
canonical observation  →  canonical observation  →  unavailable
```

and the pending P&L figures were never consulted at all. So the answer was not
wrong about the world; it was wrong about **what Vision knew**.

---

## 2. The distinction this phase makes permanent

Four states, never collapsed:

| State | Meaning |
| --- | --- |
| **UNKNOWN** | nothing was extracted or stated — "I don't have that" is the only honest answer |
| **EXTRACTED / UNVERIFIED** | a document yielded the figure; no human has reviewed it. **Useful**, not business truth |
| **CONFIRMED** | an authorized human accepted or corrected it — canonical |
| **VERIFIED** | validated beyond ordinary human confirmation |

```
pending != confirmed      confirmed != verified      extracted != verified
```

`UNKNOWN DATA` and `UNVERIFIED DATA` are not the same answer, and the platform now
says which one it is.

---

## 3. Architecture

`provisionalEvidence.ts` is **not** a second persistence system:

* **no new table, no new column, no copied value** — provisional evidence is
  *derived on every read* from the **same `extracted_fields` rows** the canonical
  lane reads;
* **it writes nothing** — no `business_facts`, no `business_fact_evidence`, no
  canonical-observation promotion, no confirmed/verified transition. Phase 6D.1
  stays frozen and untouched;
* **one precedence rule (§3):** `canonical > provisional > unavailable` — never
  `canonical > unavailable` when matching provisional evidence exists;
* **no new permission model** — the focused-document path still calls the existing
  canonical `authorizeDocumentAccess()`, and the tenant is derived from the
  document **row**.

### Refusals (a row becomes evidence only if all hold)

business scope · `pending_review` only · field name present · not a sensitive
field name (the SAME denylist the focused projection uses) · a canonical
definition exists for this field name **and** document type · a usable numeric
value exists.

### Period discipline

Exact matching only. A 2024 figure can never answer a 2023 question; an unstated
year is `period_unknown`; two periods with none named is `period_ambiguous` — the
newest is **never** chosen. Two disagreeing unreviewed values are a **CONFLICT**
that names every candidate and chooses none (nothing averaged, ranked or silently
preferred); an exact duplicate from re-extraction is **not** a disagreement.

### Answer contract

`applyProvisionalEvidence()` is server-side:

1. the answer **gains** the server's own supporting source, so a provisional
   answer visibly **has** support;
2. a false *"missing"* claim **about the answered metric** is **removed** —
   because the metric is not missing — while missing information about **other**
   things is kept;
3. the answer carries structured, server-derived state
   (`evidence_label: UNVERIFIED DOCUMENT DATA`, `review_state: PENDING REVIEW`);
4. nothing is relabelled confirmed or verified.

The model receives a structured block whose instruction is explicit: unreviewed
figures **must** be used, **must not** be called unavailable or missing, and
**must not** be called confirmed, verified or high confidence merely because
extraction succeeded. Only the mapped metric, value, period and provenance travel
— never the raw extracted payload.

The review CTA is bound to the **exact** document id the value came from; a CTA
without a document id is not built at all.

---

## 4. Requirements covered

| # | Requirement |
| --- | --- |
| P1–P2 | business scope; foreign and unscoped rows excluded before anything reads them |
| P3–P4 | only unreviewed rows enter the lane; a reviewed row is not provisional |
| P5–P6 | sensitive field names and unmapped fields are refused |
| P7 | a non-numeric row yields no evidence |
| P8 | labels + the precedence tuple (`canonical > provisional > unavailable`) |
| P9–P10 | item state (proposed / unverified / pending_review) and honest confidence |
| P11–P13 | canonical wins; canonical is never silently replaced; provisional answers when canonical is absent; unavailable only when neither holds the metric |
| P14–P17 | exact period; no cross-period answers; no newest-period fallback; `period_unknown` |
| P18–P19 | conflict names all candidates and chooses none; duplicates are not conflicts |
| P20–P21 | counts and the extraction summary are DERIVED from persisted rows, grouped by exact document id |
| P22 | the question resolves to canonical metrics structurally, longest phrase first |
| P23–P24 | the review CTA and the proactive notice carry the exact document id |
| P25a–P25f | the model instruction; no raw payload; the defect's false claim removed; unrelated missing data kept; nothing promoted; the lane writes nothing |

---

## 5. Behavioural proofs and the mutation battery

The shipped module is **compiled and executed** by the harness — every proof is a
predicate over the real module's output, and the **same predicate** is what the
mutation battery breaks, so no proof can pass vacuously.

**Baseline:** `checks: 42/42 passed · provisional mutations attempted: 12` ·
`RESULT: PASS`

Mutations attempted (all **caught**, MISSED = 0):

| ID | Regression introduced |
| --- | --- |
| M_PROV_1 | business filter dropped |
| M_PROV_2 | a REVIEWED row admitted into the provisional lane |
| M_PROV_3 | the sensitive-name check never fires |
| M_PROV_4 | a non-numeric value accepted as evidence |
| M_PROV_5 | unreviewed data labelled VERIFIED |
| M_PROV_6 | a proposed item promoted to confirmed |
| M_PROV_7 | an invented confidence state |
| M_PROV_8 | provisional evidence outranking canonical |
| M_PROV_9 | falling back to the newest period |
| M_PROV_10 | period exactness dropped |
| M_PROV_11 | choosing between disagreeing unreviewed values |
| M_PROV_12 | a review CTA built with no document id |

A mutation that cannot be **applied** is reported as *not caught* (a harness
defect), never as a caught regression.

---

## 6. Change surface

Product / shared:

* `base44/shared/galileo/provisionalEvidence.ts` *(new)*
* `base44/shared/galileo/focusedDocument.ts` — extraction/review counts + review action
* `base44/functions/askGalileo/entry.ts` — server-resolved retrieval wiring
* `src/hooks/useAskGalileo.js` — request/response contract
* `src/components/galileo/home/GalileoAnswerPanel.jsx` — the answer surface

Harness / reports:

* `src/scripts/documentKnowledgeCompletion.test.cjs` (§I)
* this report

Change-surface registration: the slice is allowlisted in the seven repository
suites (`adminCanonicalActor`, `adminDocumentViewer`,
`documentSignedUrlAuthorization`, `documentUploadClassification`,
`extractionIntegrity`, `galileoContextActorBinding`,
`relationshipRevocationAccess`). **Allowlist lines only** — no behavioural,
security, authorization or mutation assertion in any existing harness was
altered, and the authorization spine is untouched.

---

## 7. Verification status, stated precisely

* **Provisional lane (§I):** executed — 42/42 proofs pass, 12/12 mutations
  caught, MISSED = 0.
* **Change-surface suites (7) — RE-RUN, ALL PASS:**

  | Suite | Result |
  | --- | --- |
  | `adminCanonicalActor` | PASS |
  | `adminDocumentViewer` | PASS |
  | `documentSignedUrlAuthorization` | PASS (45 matrix/bucket/oracle cases + 14 mutations) |
  | `documentUploadClassification` | PASS |
  | `extractionIntegrity` | PASS |
  | `galileoContextActorBinding` | PASS |
  | `relationshipRevocationAccess` | PASS |

  These seven were red **only** because they list this slice's report before the
  report existed; the artifact now exists and every set matches. Allowlist lines
  only — no behavioural, security or mutation assertion was altered.
* **Adjacent suites re-run — PASS:** `documentAccessAuthorization`,
  `documentUnderstandingRealSeam` (65 assertions; real-provider adapter still
  unproven), `adminRouteAccess`, `adminWorkspaceAccess`,
  `semanticObservationBridge` (6D.0a — all checks passed).
  Measurement note: `semanticObservationBridge` calls `process.exit(0)` inside
  `main()`'s promise chain, so a probe that throws on `process.exit` reports a
  false `1`; its verdict is taken from its own summary line, not an exit code.
* **Build:** `vite build` exits 0.
* **`businessContextContract` — RED, PRE-EXISTING AND UNRELATED.** Exactly one
  failing check:
  `base44/functions/ownershipConcentrationEngine/entry.ts imports the
  business-scope guard — no canonical import`. Neither that suite nor the file it
  inspects was touched by this slice (`git show --stat HEAD` = this report, the
  seven suites, the §I harness; working tree clean), so the failure is byte-identical
  before and after. It is the repository's recorded baseline debt on the 6.9
  business-context surface and is **not** remediated here.
* **§I provisional lane — RECONFIRMED:** 42 / 42 PASS (P1–P25f) · 12 / 12 mutations
  CAUGHT · MISSED = 0 · RESULT: PASS · 340 ms. Canonical precedence PASS (P10/P11) ·
  provisional fallback PASS (P12) · unavailable only when neither lane holds the metric
  PASS (P13) · period safety PASS (P14–P17) · conflict handling PASS (P18/P19) · business
  authorization/isolation PASS (P1/P2) · PII refusal PASS (P4/P5) · extraction counts
  derived from persisted rows PASS (P20/P21) · exact-document review CTA PASS (P23/P24) ·
  nothing promoted, lane writes nothing PASS (P25e/P25f).
* **THE "DID NOT APPLY" FORENSICS — one defect, nine symptoms, proven end to end.**

  | Field | Value |
  | --- | --- |
  | MUTATION_NAME | `M_FOCUS_1` — "ignoring focused_record_id is detected" |
  | TARGET_FILE | `base44/shared/galileo/focusedDocument.ts`, compiled by `loadFocused` |
  | TARGET_ANCHOR | `".eq('id', focusedDocumentId)"` → `'.limit(1)'` |
  | ORIGINAL_SOURCE_MATCH | YES (a missed anchor makes `mutate()` throw; it did not) |
  | MUTATED_SOURCE | produced and compiled successfully |
  | MUTATION_APPLIED | **NO** — the mutated module never executed |
  | EXECUTION_ENTRYPOINT | `focusWith()` → `loadFocused(src).resolveFocusedDocument(...)` |
  | WHY "DID NOT APPLY" | `focusedDocument.ts:37` imports `{ deriveExtractionReviewCounts, buildReviewAction }` from `./provisionalEvidence.ts` (added by 6D.0c.1) and **calls** `deriveExtractionReviewCounts` at line 227. `loadModule` strips import statements and binds the loader's `names` as parameters; the harness's focused loader injected only `authorizeDocumentAccess`, `buildObservationLayer`, `observationPeriod`. The call site was therefore a FREE identifier: `new Function` compiles free identifiers silently and they throw only when the line EXECUTES. The first `resolveFocusedDocument()` died with `ReferenceError: deriveExtractionReviewCounts is not defined`; `mutationCaughtAsync` classified that as *did not apply*; and the same line killed `galileoHalf()` itself. |

  All nine share that single cause (each resolves a focused document through a mutated
  module): `M_FOCUS_1`, `M_FOCUS_2`, `M_FOCUS_3`, `M_CONTEXT_1`, `M_TENANT_1`, `M_AUTH_1`,
  `M_AUTH_2`, `M_REVIEW_1`, `M_VERIFY_1`. Classification: **stale loader injection list —
  a harness-fidelity defect, not a product defect** (the product imports and uses what it
  declares). Ruled out by inspection: source-shape change, skipped initialization, wrong
  module instance, require-cache contamination, anchor removal, post-load mutation, wrong
  working directory, different compilation path.
* **The repair — test-only, fidelity plus test selection.** Two changes to
  `src/scripts/documentKnowledgeCompletion.test.cjs`; no product code, no assertion
  semantics, no assertion removed, no mutation disabled or eased:
  1. `loadFocused` now mirrors the focused module's OWN import list, injecting
     `deriveExtractionReviewCounts` and `buildReviewAction` from the same compiled
     provisional module the product imports them from; the provisional loader is compiled
     first so those bindings exist.
  2. A **native shard selector** (`VISION_HARNESS_ONLY` = `extraction` | `galileo` |
     `provisional`, default `full`) that chooses WHICH of the harness's own sections run.
     Selection happens after the module body, so every shard shares the same product
     imports, loaders, fixtures, mocks, mutation engine and expected values, and the shards
     are contiguous slices of the original order.
* **Galileo-half native execution** (`VISION_HARNESS_ONLY=galileo`, harness machinery, own
  process): **176 assertions · 176 PASS · 0 FAIL · exit 0 · 409 ms**, covering Q21–Q24,
  Q34–Q59, Q11c, ADV1–ADV4, CHAIN, CHAIN2, QTR1–QTR3, QREV1/QREV2, BRIDGE/BRIDGE2,
  P1–P25f and all 63 mutation checks. Reconfirmed behaviourally: focused-document SERVER
  resolution (Q34/Q34b) · ROW-derived tenant and authorization against it (Q35–Q38b,
  ADV1–ADV4) · EXACT document identity and decoy resistance (Q39–Q41, Q56–Q58,
  CHAIN/CHAIN2) · pending vs reviewed semantics (Q45b, Q24c, QREV1/QREV2, M_REVIEW_1/2) ·
  general semantic retrieval (Q45, Q46) · period semantics (Q22–Q22d, Q47, Q48–Q48c) ·
  take-home semantics (Q49–Q50d) · verification and the mixed-evidence rule (Q51–Q55e) ·
  PII model boundary (Q59–Q59f) · processing states (Q42–Q44) · the Q21–Q24 bridge.
* **The nine mutations — APPLIED, BEHAVIOUR_CHANGED, CAUGHT (exit 0):** M_FOCUS_1
  (reader query) · M_FOCUS_2 (reader query) · M_FOCUS_3 (observation read) · M_CONTEXT_1
  (context id) · M_TENANT_1 (tenant guard) · M_AUTH_1 (authorization) · M_AUTH_2
  (relationship check) · M_REVIEW_1 (both pending gates) · M_VERIFY_1 (label clearing).
  ANCHOR_FOUND = YES for all nine.
* **Q1–Q62 shard reconciliation — 62/62, each owned by exactly one shard.** Measured from
  the harness: `Q1:extraction(1) Q2:extraction(2) Q3:extraction(1) Q4:extraction(1)
  Q5:extraction(1) Q6:extraction(2) Q7:extraction(1) Q8:extraction(2) Q9:extraction(2)
  Q10:extraction(1) Q11:extraction(2) Q12:extraction(1) Q13:extraction(1) Q14:extraction(1)
  Q15:extraction(1) Q16:extraction(1) Q17:extraction(2) Q18:extraction(3) Q19:extraction(1)
  Q20:extraction(3) Q21:galileo(5) Q22:galileo(4) Q23:galileo(4) Q24:galileo(7)
  Q25:extraction(1) Q26:extraction(1) Q27:extraction(2) Q28:extraction(1) Q29:extraction(1)
  Q30:extraction(1) Q31:extraction(1) Q32:extraction(1) Q33:extraction(1) Q34:galileo(2)
  Q35:galileo(1) Q36:galileo(1) Q37:galileo(2) Q38:galileo(2) Q39:galileo(1) Q40:galileo(1)
  Q41:galileo(1) Q42:galileo(1) Q43:galileo(1) Q44:galileo(1) Q45:galileo(2) Q46:galileo(1)
  Q47:galileo(1) Q48:galileo(3) Q49:galileo(3) Q50:galileo(4) Q51:galileo(3) Q52:galileo(1)
  Q53:galileo(1) Q54:galileo(1) Q55:galileo(5) Q56:galileo(1) Q57:galileo(1) Q58:galileo(1)
  Q59:galileo(6) Q60:extraction(6) Q61:extraction(3) Q62:extraction(2)`. Bases covered = **62**,
  missing = **0**. (Q11's numeric base also carries `Q11c`, a distinct check id inside the
  mutation battery that runs in the galileo shard; the two share a prefix, never a body —
  id-level overlap between the shards is **0**.)
* **Assertion reconciliation** — EXISTING 184 · PROVISIONAL 42 (30 proofs P1–P25f + 12
  M_PROV) · TOTAL UNIQUE **226** · EXECUTED UNIQUE **226** · PASS **226** · FAIL **0**.
  50 (extraction shard) + 176 (galileo shard) = 226, and the union's unique id set equals
  the FULL run's id set exactly (missing 0, extra 0, overlap 0).
* **Mutation reconciliation** — EXISTING **51** (27 extraction + 24 Galileo) · NEW **12**
  (M_PROV_1–12) · TOTAL UNIQUE **63** · APPLIED **63** · CAUGHT **63** · MISSED **0** ·
  DID_NOT_APPLY **0**. `MTOTAL` (the battery's own completeness oracle) passes in both the
  FULL run and the galileo shard: 27 + 24 = 51, MISSED = 0.
* **Shard equivalence — the only difference is test selection.** The entire module body
  (product imports, loaders, fixtures, mocks, mutation engine, expected values) executes
  before any selection, and the dispatcher only calls the harness's own section functions
  in their original order. Measured: FULL **226/226 in 573 ms, exit 0** ≡ extraction
  **50/50** + galileo **176/176** (262 ms / 409 ms, exit 0), union id set == FULL id set.
  No second runner, no copied assertion bodies, no product fork, no test-specific product
  path.
* **THE HISTORICAL CORRECTION.** This report previously recorded (a) four suites as
  "unrun — exceeds the platform's per-call execution ceiling" and (b) the certification
  harness as unable to complete at ≈120 s. Both were measurement mistakes; they are
  corrected here, not erased:
  - The four suites are guarded by `require.main === module`. A runner that `require()`d
    them read their sources and then did nothing — the guard, not the runtime, was the
    blocker. Run as their own processes they complete in **262 / 296 / 312 / 383 ms** and
    all four pass.
  - The harness never took ≈120 s. It ran in ~0.6 s and CRASHED inside `galileoHalf` on
    the stale-binding `ReferenceError`; the capture loop kept waiting to its own deadline
    and reported that deadline as the run's duration. With the loader repaired the FULL
    run completes in **573 ms**.
* **Regression matrix (after the harness repair)** — every suite as its own process, its
  own guard firing as main:

  | Suite | Result | Exit |
  | --- | --- | --- |
  | documentKnowledgeCompletion (FULL) | 226/226 · RESULT: PASS | 0 |
  | documentKnowledgeCompletion (galileo shard) | 176/176 · RESULT: PASS | 0 |
  | durableDocumentIngestion | 123 checks (Q1–Q60, QM1–QM35) | 0 |
  | documentCanonicalSourceRead | 85 checks (S1–S40, SM1–SM25) | 0 |
  | getDocumentsAdmin.s3.mock | 50/50 | 0 |
  | documentUnderstanding | 75 (D1–D45, F1–F6, T1–T9, M1–M15) | 0 |
  | adminCanonicalActor · adminDocumentViewer · documentSignedUrlAuthorization · galileoContextActorBinding · relationshipRevocationAccess · documentAccessAuthorization | PASS (signed-URL suite: 45 matrix cases + 14 mutations) | 0 |
  | documentUploadClassification · extractionIntegrity · semanticObservationBridge | PASS | 0 |
  | businessContextContract | `PRE_EXISTING_BASELINE_DEBT` (unchanged, proved untouched) | 1 |

  **UNRUN = 0 · NEW RELEASE REGRESSIONS = 0 · SECURITY REGRESSIONS = 0.**
* **Build / migrations / dependencies / freezes:** `vite build` exit **0** · migrations
  **0** · dependency changes **0** · `business_facts` writes introduced = **0** and
  `business_fact_evidence` writes introduced = **0** (the provisional lane writes nothing —
  P25f, and the only `business_facts` mention in the phase diff is a comment saying so) ·
  no production specimen introduced · 6D.1 untouched. This repair modified exactly two
  files: `src/scripts/documentKnowledgeCompletion.test.cjs` (test-only) and this report.

**Gate status: 6D.0c.1 RELEASE CANDIDATE — APPROVE FOR REVIEW. Not published.** P1–P25
PASS · 42/42 provisional proofs PASS · Q1–Q62 = 62/62 covered · all 226 unique assertions
executed and passing · all 63 unique mutations applied and caught · DID_NOT_APPLY = 0 ·
MISSED = 0 · UNRUN = 0 · new release regressions = 0 · security regressions = 0 · build 0 ·
migrations 0 · dependencies 0 · fact freeze intact · specimen freeze intact · report
complete. **6D.1 has not been started.**

---

# §16 — PRODUCTION ACCEPTANCE FAILURE AND REPAIR (6D.0c.1-P)

**The release candidate above FAILED production acceptance.** That record stands and
is not erased: §1–§15 remain the account of what was built, and this section is the
account of what the shipped path actually did. The earlier "APPROVE FOR REVIEW" line
is superseded by the gate at the end of this section.

## Observed

| Question | What Galileo answered |
| --- | --- |
| "What is my revenue" | "Your revenue data is not available…" · **MEDIUM CONFIDENCE · NO SUPPORTING DATA · Missing: Revenue data** |
| "how much did I pay in tax 2024" | "…the estimated annual tax impact is $13,245. However, the specific amount you paid in taxes for 2024 is not available…" — a **projected tax-strategy opportunity** answering a **historical** question |

## Phase 0-5 — the trace, from the live rows rather than from inference

The shipped path was read and the live rows were queried. `provisionalEvidence.ts`
**was** wired into the general path (`askGalileo` §2d calls `buildProvisionalEvidence`
→ `resolveMetricEvidence` → `buildProvisionalEvidenceBlock` → `applyProvisionalEvidence`);
the block reached the model (line 686); the labels were server-derived. The evidence
disappeared earlier than any of that.

**Phase 1 — business identity, proved.** Live rows: `42f42075…` = **"My Business"** (80
extracted fields), `b3e5ceb3…` = **"Apex Roofing Test 2"** (11), `e507bf87…` = **"Apex
Roofing LLC"** (**0 extracted fields** — its P&L `Web In My Design Profit and Loss
2024-09-11…` produced none). The pending revenue belongs to `42f42075…`, not to
Apex Roofing LLC. **BUSINESS_MATCH = NO for Apex Roofing LLC** and **tenant isolation
was NOT weakened** — for a business holding no extraction, "no supporting data" was
the truthful answer, and §1's business filter is untouched.

**Phase 2/3 — where it actually disappeared.** For the business that DOES hold it:

```
DOCUMENT_ID          7f93c562-554e-4322-86b7-e5f9c570e6bd  (+4 more documents)
DOCUMENT_TYPE        profit_and_loss
RAW_KEY              annual_revenue          ← the live field name
CANONICAL_KEY        revenue                 ← registry line 140 DOES map it
VALUE                $1,250,000  (9 rows, all pending_review, confidence 95)
PERIOD               metadata.fiscal_year ∈ { absent, 2024, 2025 }
REVIEW_STATUS        pending_review
ACTIVE_BUSINESS_ID   42f42075-c453-436a-8c5f-2dc29ef718c6
```

So the semantic key was **not** the defect: `fieldMapping('annual_revenue')` →
`revenue`, and every row passed the business, review, sensitivity and numeric gates.
The lane built its items and then **excluded them at the period gate**: two distinct
fiscal years, no year named → `reason: 'period_ambiguous'` → reported as
`precedence: 'unavailable'`.

```
CANONICAL_RESULT      no_observation
PROVISIONAL_RESULT    period_ambiguous  (items built, then refused)
FINAL_RETRIEVAL_STATE unavailable  ← FALSE: the figures existed
```

That single state is the whole of Failure #1: `used:false` produced
**NO SUPPORTING DATA**, the fallback's `!raw?.revenue` produced **Missing: Revenue
data**, and the answer became "not available" — the exact false claim §P4 forbids.

**Failure #2** had a second, independent cause: `total_tax` had **no canonical
concept at all** (the registry declared no tax fact; `metricIntent` therefore matched
nothing), so `wantedMetrics.length === 0` and **the evidence lane never ran**. With no
historical evidence in context and no firewall, the model answered a 2024 tax question
with the canonical tax-gap recommendation's projected impact.

## The repair (three files, no migration, no dependency, no fact write)

1. `provisionalEvidence.ts` — **§P4**: an undated question with MORE THAN ONE period
   is `precedence: 'ambiguous_period'` (`period_not_named`), carries every period and
   value, counts as `used`, and is asked as a question — never reported unavailable;
   one period is usable and named; a figure stating no period is usable only when the
   values agree, and then said to be period-unstated; a single period holding two
   different values is a CONFLICT, not a pick. **§P6/§P8/§P9**: `historicalValueIntent`
   + `applyHistoricalEvidenceContract` give the server the last word on a direct
   metric question — it states the value, source and review state when the prose
   denies them (removing only the contradicted sentence), names the years when a
   period must be chosen, states a conflict instead of choosing, and, for a historical
   question with no evidence, says so, names what the documents DO hold, and moves any
   projected/opportunity framing out of the answer's headline labels into an explicit
   advisory context that says it is not the reported figure.
2. `registry.ts` — **one new canonical fact `total_tax`** ("Total Tax Reported",
   reported tax on a return or statement, a liability and not cash paid; sources
   `total_tax` on a 1040 and `taxes` on a P&L) plus its alias phrases. Through the
   EXISTING registry, so the lane runs for a historical tax question and the answer
   must describe the figure by what it is. No second alias table.
3. `askGalileo/entry.ts` — the lane now also runs for a historical question even when
   no alias matched, and the evidence-state contract is applied last, after the
   assignment override, so nothing downstream can replace the server's line.

## Verification (all on the shipped modules)

| Battery | Result |
| --- | --- |
| FULL (certification run) | **255 / 255 PASS** · exit 0 · 573 ms |
| extraction shard | **50 / 50 PASS** · exit 0 |
| galileo shard | **205 / 205 PASS** · exit 0 |
| provisional shard | **71 / 71 PASS** · exit 0 |
| Shard partition | 50 + 205 = 255 · union set == FULL set · overlap 0 |
| Mutations | **71 APPLIED · 71 CAUGHT · MISSED 0 · DID_NOT_APPLY 0** (was 63) |
| Assertions | **255** (226 + 21 R checks + 8 mutation checks) · FAIL 0 |
| R1–R20 + R6b | 21 checks, all behavioural, all PASS |

Reconciliation against the pre-repair certificate: 226 + 29 = 255, where 29 = 21 new
R checks (R1–R20 + R6b) + 8 new mutations (M_PROV_13–20); provisional shard 42 → 71
(30 P + 21 R + 20 mutations). New mutations cover: provisional retrieval disabled ·
registry alias resolution lost · period demanded on an undated question · projection
answering a historical question · a false "unavailable" claim left standing · NO
SUPPORTING DATA rendered for provisional evidence · the answered metric left listed as
missing · rows outside the business scope counted. `M_PROV_9` and `M_PROV_10`
continue to cover the no-latest-period-fallback and period-exactness invariants.

Two pre-existing assertions were **corrected, not weakened**: `QTR3` claimed
`total_tax` has no canonical definition (it now does — the assertion now requires that
the fields which still have none are not fabricated **and** that the 1040 tax field
maps), and `P16`/`P17` re-state the same invariants in the new state vocabulary
(two periods with none asked is never the newest → it is asked; a period-less figure
is never coerced into a year). Harness assertion call sites: `check(` 135 → 135,
unique ids 131 → 131, no assertion body removed.

**Historical change-surface guards (7 suites).** Their behavioural, security,
mutation and authorization assertions pass unchanged; each failed only on its
"change surface since commit X is exactly …" line, whose list already declared
`provisionalEvidence.ts`, `askGalileo` and this report. Each now also **declares
`base44/shared/canonicalFact/registry.ts`** (and, where the harness itself is in
scope, the certification harness) under an explicit `6D.0c.1-P PRODUCTION REPAIR`
comment. This is a declaration for a human reviewer to accept or reject, not an
exemption: no guard was removed, and no assertion in any of them was eased.

**Security / freezes:** canonical actor, row-derived tenant, `authorizeDocumentAccess`,
active-business isolation, revoked-relationship denial and PII minimization unchanged
(their suites pass) · **0 writes** to `business_facts` / `business_fact_evidence` · no
migration · no dependency · `vite build` exit **0** · no production specimen mutated.

**Gate: 6D.0c.1 PRODUCTION REPAIR — RELEASE CANDIDATE FOR REVIEW.** Not published.
Do not begin 6D.1.

### Not done in this phase

* No change to extraction, classification, ingestion orchestration or the durable
  worker.
* No write to any fact table; 6D.1 remains frozen.
* No production specimen was touched, nothing was published, and 6D.1 has not
  been started.