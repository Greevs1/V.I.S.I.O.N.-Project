# VISION PHASE 6D.0c — DOCUMENT KNOWLEDGE COMPLETION

**Status:** RELEASE CANDIDATE — APPROVE FOR REVIEW
**True pre-6D.0c baseline:** `eb9ba40` · **Galileo core checkpoint:** `43924a6` ·
**First certification checkpoint:** `bda183c` · **Final 6D.0c checkpoint:** the checkpoint that
follows this report's closure of the Q21–Q24 coverage gap.
**Scope:** the Galileo half of 6D.0c, layered on the already-certified extraction half.
**Two passes:** (1) the first Galileo certification, which disclosed Q21–Q24 as MISSING and did
not claim them; (2) the Q21–Q24 coverage-gap closure, which added them and re-certified. Both are
recorded, in order, in §29 and §29b. §29 preserves the first pass exactly as it was reported.

---

## 1. Executive verdict

The Galileo half is **landed, complete, executed and adversarial**. Every implemented claim is
now a behavioural test result rather than a description:

| Gate | Result |
|---|---|
| Named requirements Q1–Q62 | **62 / 62 PRESENT** — Q21–Q24 first certified MISSING, then closed (§29, §29b) |
| Executable assertions | **184 / 184 PASS · 0 FAIL** |
| Mutation battery | **51 / 51 CAUGHT · MISSED = 0** (27 extraction + 24 Galileo/bridge) |
| Full 18-suite battery | **18 / 18 GREEN · 1318 / 1318 assertions** |
| Release regressions | **0** |
| Security battery | **9 / 9 GREEN** |
| Build | **exit 0** |
| Migrations | **0** |
| New dependencies | **0** |
| Product change required | **NO** — the Q21–Q24 closure changed no product file |
| Fact freeze | **0** `business_facts` writes · **0** `business_fact_evidence` writes |
| Specimen freeze | **0** contacts — none of the four ids appears anywhere in the diff |

Two genuine defects were exposed by the new tests and repaired at the smallest correct layer
(§24, §25). Two test-side assumptions were wrong and were corrected in the harness, not by
weakening the product (§15). No architecture was redesigned; no speculative feature was added.

**FIRST PASS — the coverage gap, disclosed.** The first Galileo certification ran 158 executable
assertions, all passing, and found that **four named requirements were absent from every harness**:
Q21, Q22, Q23 and Q24. They were reported as BASELINE DEBT — not absorbed into another id, not
claimed as passing — and `Q1–Q62` was stated as **58/62, not 62/62**. §29 preserves that finding
verbatim.

**SECOND PASS — the gap closed.** A ruling confirmed the four were **not retired**; they were
explicitly defined in the approved 6D.0c specification and required behavioural coverage before
certification. They are now covered by **22 executable assertions plus 4 mutations** against the
already-landed architecture, with **no product change** (§29b). `Q1–Q62` is now **62/62**.

---

## 2. Phase 0 findings

The landed Galileo architecture was read from the real shipped source before any test was
written. The flow is:

```
useAskGalileo.ask(question, { focus })
  → base44.functions.invoke('askGalileo', { question, active_business_id,
        focused_record_type: 'document', focused_record_id: <id> })
      → resolveActorBusinessContext(sb, user, body)      ← Phase 6.9 canonical tenant
      → resolveFocusedDocument({ sb, focusedDocumentId, businessId, actor, checkBusinessAccess })
          → SELECT documents WHERE id = <id>             ← identity is the ONLY scope
          → authorizeDocumentAccess({ doc, actor, 'view', checkBusinessAccess })
          → row-derived tenant + business-mismatch fail-closed
          → SELECT document_analysis WHERE document_id = <id>
          → SELECT extracted_fields WHERE document_id = <id> [AND business_id = <row tenant>]
          → accepted/corrected  → buildObservationLayer() → canonical observations
          → pending_review      → unconfirmed_findings (separate key)
          → resolveFocusedKnowledgeState()
          → minimizeExtractedData()  (allowlist + PII denylist)
      → deriveAnswerVerification({ documentGrounded, usedObservations })
      → applyAnswerLabels(llmResponse, evidenceState)
      → Response.json({ response, focused_document, focused_document_state, evidence_state,
                        focused_period_resolution, take_home_semantics })
  → setAnswer({ text, labels, evidenceState, focusedDocument, ... })
      → GalileoAnswerPanel renders the SERVER-derived evidence state
```

---

## 3. Production failure evidence that motivated 6D.0c

Established in the 6D.0/6D.0a/6D.0b audits and preserved as the reason this phase exists:

1. A focused document id reached the model as **advisory prose** — a name inside the assignment
   prompt block, built only when an assignment question was detected. The answer was never
   grounded in the document.
2. Extraction could report success without persistence being proven, so a document could be
   `completed` with nothing extracted.
3. The model's own `intelligence_labels.verified` was rendered verbatim, so the model could
   award VERIFIED to itself.

(1) is closed by §14–§19. (2) is closed in the certified extraction half. (3) is closed by §24.

---

## 4. Deterministic extraction bug

`classifyExtractionOutcome` depended on a `success` flag that the harness stubs omitted, so the
orchestrator defaulted to a retryable failure **before** the completion proof was reached. Fixed
at `eb9ba40` (baseline). The invariant is now positively asserted: Q11, Q11c, Q14, Q20, Q20b,
Q20c, Q62.

---

## 5. Analysis state machine

`queued → processing → pending_analysis → completed`, with `waiting_retry` as the bounded retry
re-arm and `failed` terminal. `SETTLED_ANALYSIS_STATES = ['completed', 'needs_review']`;
`EXTRACTION_HANDOFF_STATE = 'pending_analysis'` with exactly ONE definition (Q18d).

## 6. `processing` → `pending_analysis` handoff

The claim writes `status: 'processing', analysis_status: 'processing'` as its lease witness
(Q62b); the ONE handoff then moves the document to `pending_analysis`, which is what makes
extraction eligible (Q18). The reader's own gate is unchanged — `processing` is NOT in it
(Q18c) — so the fix provably lives in the handoff and not in a widened allowlist.

## 7. Typed extraction outcome

`success | retryable_failure | permanent_failure`, with `success: false ≠ completed`
(Q11–Q13, Q15, Q17, Q20c). Zero recognised fields is a terminal class, never a silent success.

## 8. Completion persistence proof

`proveExtractionPersisted` must pass before completion: success **without** proof cannot complete
(Q17); success **with** proof completes at the extraction stage (Q17b). M13/M13b remove the proof
and are caught.

## 9. Confirmation / resume

Confirmation persists the document patch **before** resuming (Q2), is role-gated (Q2b), creates a
NEW job row rather than rewriting the classification-only job (Q3, Q61c), and leaves the analysis
in the claimable handoff state rather than a settled one (Q61, Q61b).

## 10. Idempotency

A repeated confirmation reuses the live job and creates no second row (Q6); no duplicate
concurrent work exists for one canonical analysis (Q7); a settled success is not re-extracted
(Q6b).

## 11. Type synchronization

The applied document type lands on the document row (Q8) through a reviewed allowlist (Q8b); the
reader derives its type from the document ROW (Q10); the analysis row is synchronized so a stale
`other` can never control a later read (Q9). M8/M9 are caught behaviourally, not by source shape.

## 12. Classification PII minimization

The classifier is never *asked* for an identifier (Q27); the persisted contract carries no
identity field at all (Q27b); no SSN/TIN/bank/routing/dependent value is persisted (Q28–Q31); no
identity value is logged (Q32); and safe structural evidence survives (Q33).

---

## 13. Extraction-half certification (preserved, not weakened)

```
claim → processing → handOffToExtraction → pending_analysis → reader
      → persistence proof → completion
Q61 PASS · Q62 PASS · success:false ≠ completed · typed outcomes
durable + idempotent + single-worker resume · type sync proven
classifier PII minimization proven
business_facts writes = 0 · business_fact_evidence writes = 0
18/18 suites green · 1212/1212 checks at the 6D.0c start (now 1292/1292 with the Galileo half)
```
No assertion in any extraction-half suite was weakened, deleted or reordered in this pass.

---

## 14. Focused-document architecture

`base44/shared/galileo/focusedDocument.ts` is ONE server-side contract. It **invents no permission
model** (it calls the canonical `authorizeDocumentAccess`), **holds no knowledge of its own**
(observations come from the canonical semantic-observation layer, built from THIS document's own
rows), and **never sends raw content or identifiers to a model** (only an allowlisted,
PII-minimized projection leaves it).

## 15. Row-derived tenant

`THE DOCUMENT ROW OWNS THE TENANT.` Q35 supplies **no** caller business and the document's own
business is returned. Q36 records the id handed to the injected business check and proves it is
the row's, not the caller's.

## 16. Authorization

Access is decided by the canonical pure `authorizeDocumentAccess`, whose business check the caller
injects from `validateBusinessScope` — the same rule the assignment contract uses. A denial
happens **before any evidence is read** (Q37b, Q38b), so a refused focus transfers no rows.
A revoked relationship is denied (Q38). M_AUTH_1 (skip authorization) and M_AUTH_2 (stop consulting
the injected check) are both caught.

## 17. Exact CTA binding

`CARD → CTA → REQUEST → SERVER → CONTEXT → PROVENANCE` carries one document id:

| Link | Evidence |
|---|---|
| CARD → CTA | Q56 — the CTA builds `documentId = av.id \|\| av.documentId` and guards `!documentId` |
| CTA → REQUEST | Q57 — the REAL hook is executed and its sent payload asserts `focused_record_id === <id>` |
| REQUEST → SERVER | Q34 — resolution is server-side from `focused_record_id`; a missing id is `no_focus` (Q34b) |
| SERVER → CONTEXT | Q58 — `focused_document.id === <id>` |
| CONTEXT → PROVENANCE | CHAIN — every observation's `provenance.source_document_id === <id>` |

## 18. Focused evidence

Only the exact document's own rows are loaded (Q39). **No latest-document substitution** (Q41,
CHAIN2) and **no same-business substitution** (Q40) — proven with two documents in one business
where the DECOY is both NEWER and FIRST in read order, so an identity-dropping or
newest-first implementation picks it and cannot accidentally pass.

## 19. Pending vs reviewed semantics

`accepted` → canonical observation · `corrected` → canonical observation · `pending_review` →
**NOT** a canonical business observation; it can appear only under `unconfirmed_findings`, whose
own state is `unconfirmed`. Pending exclusion has **TWO independent gates** (the resolver's
`eligibleRows` filter and the observation layer's `observationEligibility`), so weakening either
ONE alone is inert — proved positively by QREV1/QREV2, and the compound promotion defect
(M_REVIEW_1) is caught.

---

## 20. General retrieval

Retrieval runs through the EXISTING observation layer (`buildObservationLayer` /
`resolveSemanticObservation`) — **no new store was created**. Q45: an eligible observation reaches
Galileo carrying metric identity, value, period, source document and review/evidence state. Q45b:
a pending row is counted and dropped, never surfaced as canonical.

## 21. Period semantics

Q47: with FY2023 and FY2024 for the same metric present, each year resolves to its own value.
Q48: with only FY2024 present, a **2023 question returns `no_observation_for_period` — never the
2024 figure**, with `alternates: []`. Q48b: the refusal still names the year that IS available.
Q48c: an **unstated period stays `period_unknown`** — never coerced to the requested or current
year. M_PERIOD_1 (remove the filter) and M_PERIOD_2 (fall back to an available year) are caught.

## 22. Tax-return semantics

Read from the shipped reader schema, using **only** its own five fields
(`adjusted_gross_income`, `taxable_income`, `total_tax`, `itemized_deductions`,
`qualified_business_income`). QTR2 asserts a supported observation resolves with metric, value,
period and source. QTR3 asserts the reader fields with **no canonical definition are NOT
fabricated into metrics** — for `personal_tax_return`, `adjusted_gross_income → agi` is the only
canonical mapping; `taxable_income` maps only for `business_tax_return`. No test-only metric was
invented.

## 23. Take-home semantics

Q49: `takeHomeSemantics` returns `canonical_key: null` — take-home maps to **no** canonical
metric. Q49b: it never resolves to revenue / AGI / taxable income / profit / refund. Q49c: no
extracted field name aliases `monthly_take_home` (the canonical vocabulary reaches it only from
system derivation, an assessment answer or a profile record — never from a document field name).
Q50: the ambiguity is **explicit and structured** (`ambiguous: true`, `canonical_key: null`, the
two permitted readings, and the forbidden substitutions), so the model cannot mistake TAKE_HOME
for a metric. Q50b: the block travels in the server prompt context, not in prompt wording alone.
A new canonical `take_home` fact was **not** invented, and no existing one was redefined.
M_TAKEHOME_1 (→ revenue) and M_TAKEHOME_2 (→ AGI) are caught.

---

## 24. Verification semantics

VERIFICATION IS SERVER-DERIVED AND IS NEVER THE MODEL'S TO AWARD. `applyAnswerLabels` clears the
model's own `verified` label unless the evidence canonically earns it.

| Named | Result |
|---|---|
| Q51 | a model claiming verified cannot make a document-only answer VERIFIED — **PASS** |
| Q51b | the model's own verified label is CLEARED when the evidence does not earn it — **PASS** |
| Q51c | an earned VERIFIED label is NOT cleared (the rule is not a blanket strip) — **PASS** |
| Q52 | every document observation is canonically `unverified` ⇒ **VERIFIED is unreachable for document-only answers** — **PASS, documented honestly** |
| Q53 | an answer built from nothing cannot be verified — **PASS** |
| Q54 | CONFIRMED is not VERIFIED — two distinct states — **PASS** |
| Q55 | the document-evidence label reflects evidence that is only document evidence — **PASS** |
| Q55b | the answer surface renders the SERVER-derived state (all four states mapped) — **PASS** |

**Q52 honesty note.** The observation layer sets `verification_status: 'unverified'` on *every*
observation by construction. A document-only answer therefore tops out at **CONFIRMED**. VERIFIED
is reachable only when every used observation is canonically verified — which today no document
path can produce. No fake verification rule was invented to make Q52 pass.

## 25. Mixed-evidence rule (defect found and repaired)

**The defect.** `deriveAnswerVerification` aggregated **existentially**:
`if (usedObservations.some(o => o.verification_status === 'verified')) return 'verified'`. ONE
verified item promoted a MIXED answer to VERIFIED — exactly how a single confident figure launders
an unconfirmed one into "Verified".

**The repair (smallest correct layer).** Conservative aggregation — an answer is only as verified
as its **weakest** source:

```
usedObservations.length > 0:
    every(verified)  → 'verified'
    some(confirmed)  → 'confirmed'
    else             → documentGrounded ? 'document_evidence' : 'unavailable'
no observations      → documentGrounded ? 'document_evidence' : 'unavailable'
```

Proven: Q55c (mixed = confirmed, NOT verified) · Q55d (all-verified still reaches verified) ·
Q55e (only-unconfirmed falls back to document evidence) · M_VERIFY_3 (the existential rule
restored) is caught.

## 26. Answer labels

`GalileoAnswerPanel` renders `EVIDENCE_STATE_META` for all four server-derived states and never
infers a state on the client (Q55b). The model's `verified` array is rendered only when the server
kept it.

## 27. PII model boundary

Synthetic, unmistakable sentinels (`219-09-9999`, `00-0000000`, `123456789012`, `021000021`,
`DEP-9999`) were placed both in `document_analysis.extracted_data` under sensitive names and in an
accepted extracted field named `dependent_ssn`. Q59: **none reaches the focused-document model
context.** Q59b: none appears in the answer evidence metadata. Q59c: **useful evidence survives** —
metric, value, period and source document id are all present (this is not a blanket drop). Q59d: a
sensitive-named field is carried neither as a finding nor as an observation. Q59e: an ALLOWLIST
plus a normalized denylist is what does the work. Q59f: the denylist normalizes names, so `SSN` and
`social_security_number` land on the same denial. M_PII_1/2/3 must weaken **both** rules to leak —
and are caught when they do.

## 28. Answer auditability

Every answer carries: the server-derived `evidence_state`; the exact `focused_document` (id, name,
type, year, row-derived business, processing/classification/extraction/evidence state); the
canonical `semantic_observations` with provenance (`source_document_id`, `source_field`,
`source_document_type`, `source_label`, `source_available`); the separated `unconfirmed_findings`;
the minimized `extraction_summary`; `focused_period_resolution` (per-key, per-year); and
`take_home_semantics` when it applies. Nothing is inferred on the client.

---

## 29. Q1–Q62

```
── AS FIRST CERTIFIED (historical record — checkpoint bda183c) ─────────────
NAMED_REQUIREMENTS      = 62
PRESENT_NAMED           = 58   (Q1–Q20, Q25–Q62)
NEVER-IMPLEMENTED       = 4    (Q21, Q22, Q23, Q24 — disclosed, NEVER claimed as passing)
EXECUTABLE_ASSERTIONS   = 158
PASS                    = 158
FAIL                    = 0
MUTATIONS               = 47   (27 extraction + 20 Galileo)  ·  CAUGHT = 47  ·  MISSED = 0

── AFTER THE Q21–Q24 COVERAGE-GAP CLOSURE (final) ──────────────────────────
NAMED_REQUIREMENTS      = 62
PRESENT_NAMED           = 62   (Q1–Q62 — ALL present; all PASS)
NEVER-IMPLEMENTED       = 0
EXECUTABLE_ASSERTIONS   = 184
PASS                    = 184
FAIL                    = 0
SUPPORTING_CHECKS       = 11   (ADV1–ADV4, CHAIN, CHAIN2, QTR1–QTR3, QREV1, QREV2) — a SUBSET
Q21_Q24_FAMILY          = 22   (Q21–Q21e · Q22–Q22d · Q23–Q23d · Q24–Q24g · BRIDGE · BRIDGE2)
MUTATIONS               = 51   (27 extraction + 24 Galileo/bridge)  ·  CAUGHT = 51  ·  MISSED = 0
```

**One named requirement contains several assertions.** Q17 has Q17 + Q17b (proof present vs
absent). Q18 has Q18 + Q18c + Q18d. Q20 has Q20 + Q20b + Q20c. Q27 has Q27 + Q27b. Q34, Q37,
Q38, Q45, Q48, Q49, Q50, Q51, Q55 and Q59 each carry lettered sub-assertions, and Q62 carries
Q62 + Q62b. Q21–Q24 likewise carry lettered sub-assertions (Q21–Q21e, Q22–Q22d, Q23–Q23d,
Q24–Q24g). The count of 184 is therefore greater than the 62 named requirements — that is
expected, not a discrepancy.

**HISTORICAL RECORD — the first certification found Q21–Q24 MISSING (preserved verbatim).**
These four numbers did not exist in any harness, at that baseline or before it. They were never
written by 6D.0, 6D.0a, 6D.0b or 6D.0c. They were **not** silently absorbed into another id and
they were **not** claimed as passing. **`Q1–Q62` was therefore 58/62, not 62/62** at the first
certification. That finding stands in this report as it was made; §29b does not revise it, it
records the closure that followed it.

**RESOLUTION — see §29b.** A ruling confirmed Q21–Q24 were **not retired**: they were explicitly
defined in the approved 6D.0c specification and required behavioural coverage before 6D.0c could
be certified. They have since been added, exercised and mutation-protected.
**`Q1–Q62` is now 62/62.**

---

## 29b. Q21–Q24 — THE COVERAGE GAP CLOSED (second certification pass)

**RULING.** Q21, Q22, Q23 and Q24 are **not retired**. They were explicitly defined in the
approved 6D.0c specification and required behavioural coverage before certification:

| # | Requirement |
|---|---|
| Q21 | 1040 reader invoked after confirmation |
| Q22 | reporting period preserved |
| Q23 | extracted_fields persistence occurs |
| Q24 | eligible reviewed fields reach semantic observations |

**PRODUCT_CHANGE_REQUIRED = NO.** This pass added **no product code**. The only file changed is
the harness (`src/scripts/documentKnowledgeCompletion.test.cjs`, +284 / −1). Every module under
test is **SHIPPED code**, compiled and executed — never a harness re-implementation:

```
periodIntegrity.ts       the ONE reporting-period decision        (real, injected)
extractionConfidence.ts  honest confidence + the review rules     (real, injected)
analysisState.ts         canonical analysis/upload writes         (real, injected)
buckets.ts               the approved storage vocabulary          (real, injected)
extractEngine.ts         the reader REGISTRY and the reader RUN   (real, FULL — runExtraction)
orchestration.ts         the durable worker                       (real)
resume.ts                the durable resume                       (real)
semantics.ts             the ONE observation layer                (real — buildObservationLayer)
```

The engine is loaded by **injecting its own shipped dependencies** (the module imports them), so
`runExtraction` — with the real `EXTRACTION_SCHEMAS` registry, the real period decision and the
real persistence path — executes end to end. **No fake reader-selection algorithm exists in the
harness.**

### Q21 — 1040 reader invoked after confirmation · PASS

Scenario executed: synthetic document → classified `personal_tax_return` / `form_1040` →
requires confirmation → analysis `needs_review` → authorized confirmation → durable resume →
analysis leaves the settled `needs_review` → durable worker claims → `processing` →
`handOffToExtraction` → `pending_analysis` → extraction → **the `personal_tax_return` reader runs**.

| Assertion | What it proves |
|---|---|
| Q21 | the reader is SELECTED and the run succeeds with `documentType = personal_tax_return` |
| Q21b | the reader's **own schema** decides recognition — a field the provider supplied that the reader does not know (`annual_revenue`) is **not persisted** |
| Q21c | the **SAME bytes** through a **different** reader (`profit_and_loss`) recognize a **different** field set (`annual_revenue`) — reader SELECTION proven behaviourally, not by `=== 'personal_tax_return'` |
| Q21d | the **document ROW** selects the reader, never the caller's `ctx.documentType` |
| Q21e | the reader **refuses** the pre-handoff state (`processing`) ⇒ extraction is reachable only through the durable worker's ONE handoff |

Preserved and cited: **no browser extraction** (Q4) · **no inline extraction in the confirmation
handler** (Q5 + mutation M5) · **single durable worker** (Q60b–Q60e).

### Q22 — reporting period preserved · PASS

A synthetic **2024 Form 1040 states its period** (`reporting_period: '2024'`), and the period is
preserved in the **production format** — the canonical representation produced by
`periodMetadata()`, never a test-specific shape:

| Assertion | Result |
|---|---|
| Q22 | `fiscal_year 2024` · `period_source 'model_reported'` · `period_ambiguous false` · `period_start '2024-01-01'` · `period_end '2024-12-31'` · `period_type 'annual'` |
| Q22b | the SAME canonical block travels **with the extracted field** (`metadata.*`) — never re-invented downstream |
| Q22c | 2024 does **not** become 2023, the current year, or an unknown / timeless period |
| Q22d | the period **survives the bridge** to the observation: `fiscal_year 2024` · `period_origin 'parsed'` · `label 'FY2024'` · `ambiguous false` |

Q22 therefore tests preservation **across the bridge** (classification → extraction context →
`extracted_field` → semantic observation), not a fixture that merely contains the string "2024".

### Q23 — extracted_fields persistence · PASS

A field **actually supported by the shipped `personal_tax_return` reader**
(`adjusted_gross_income`). The seam is executed: reader returns value → extraction succeeds →
canonical persistence occurs.

| Assertion | Result |
|---|---|
| Q23 | the run's **own** persistence record (`extracted_data.reconcile.inserted = 2`) agrees with the canonical **STORE** (2 `extracted_fields` rows) |
| Q23b | the **PERSISTED** row carries the stated value `'$185,000'` **and** its normalized number `185000` — *returned ≠ persisted* |
| Q23c | production provenance retained: `document_id` · `business_id` · `document_analysis_id` · `field_name` · `source_document_type` · `source_page` · `review_status 'pending_review'` · `metadata.fiscal_year 2024` |
| Q23d | confidence is **not fabricated**: the provider reported none ⇒ `confidence_score null`, `confidence_state 'unavailable'` |

The returned-vs-persisted distinction is asserted **against the store**, not against the return
value: Q23/Q23b read the canonical `extracted_fields` table. No field is required that the real
schema does not contain.

### Q24 — reviewed field → semantic observation · PASS

Starts from the **persisted** `extracted_fields` rows, then applies the owner's decision exactly
as the shipped review writer does (`updateExtractedFieldReview`: `review_status` + `reviewed_by` +
`reviewed_at`, and `accepted_value` / `accepted_normalized_value` for accept|correct). The mapping
is the **real shipped `buildObservationLayer`** — no test-only observation mapper exists.

| Assertion | Result |
|---|---|
| Q24 | **accepted** → an eligible canonical observation (`agi`, `confirmed`, value 185000) |
| Q24b | **corrected** → an eligible canonical observation (`agi`, `confirmed`, value 170000 — the owner's own correction counts) |
| Q24c | **pending** → **NOT** an eligible canonical business-wide observation (`counts.pending = 1`; value absent from `observations`) |
| Q24d | the layer is the REAL one (`mapping_version '6d.0a.1'`) |
| Q24e | the canonical metric is a REAL key in the business-intelligence contract (`FACT_REGISTRY`) |
| Q24f | value · period · `source_document_id` · review/evidence semantics preserved (`verification_status 'unverified'`; `source_available null` — availability is **not claimed** when unrecorded) |
| Q24g | the pending value appears **nowhere** in the layer — promoted by no path |

### THE INTEGRATED BRIDGE — one unbroken chain · PASS

A subassertion of Q21–Q24 (**not Q63**), proving the independently tested document and Galileo
halves are actually connected. Every step is SHIPPED code:

```
FORM 1040 (synthetic)
  → CONFIRMATION + DURABLE RESUME   resume.ts         (real) → NEW queued job · analysis pending_analysis
  → DURABLE WORKER                  orchestration.ts  (real) → claim → processing
  → ONE HANDOFF                     orchestration.ts  (real) → pending_analysis
  → READER (row-selected)           extractEngine.ts  (real, FULL) → personal_tax_return schema
  → EXTRACTION + PERSISTENCE        extractEngine.ts  (real) → extracted_fields rows
  → COMPLETION PROOF                proveExtractionPersisted (real) → job completed @ stage extraction
  → REVIEW ELIGIBILITY              semantics.ts      (real)
  → SEMANTIC OBSERVATION            buildObservationLayer (real) → agi · 185000 · FY2024
```

| Assertion | Result |
|---|---|
| BRIDGE | `resume=resumed` · `stage=extraction` · `outcome=success` · analysis settled · 2 stored rows · observation `agi = 185000`, `fiscal_year 2024` |
| BRIDGE2 | **ONE** document id from the form to the observation provenance |

### Bridge mutation coverage (§8 of the closure request)

| Behaviour | Protected by | Result |
|---|---|---|
| A. reader handoff removed | **M36** (existing, behavioural: the reader refuses `processing`) | CAUGHT |
| B. wrong reader selected | **M_READER_1** (new) | CAUGHT |
| C. period lost | **M_PERIOD_3** (new) · M_PERIOD_1 / M_PERIOD_2 cited for the Galileo-side filter | CAUGHT |
| D. `extracted_fields` persistence bypassed | **M_PERSIST_1** (new) | CAUGHT |
| E. pending promoted to canonical observation | **M_REVIEW_1** (both gates) + **M_REVIEW_2** (new: the layer's own gate) | CAUGHT |

**MISSED = 0.** Every one APPLIES, CHANGES INTENDED BEHAVIOUR and IS CAUGHT.

## 30. Mutation matrix

**EXISTING_MUTATIONS = 27 · NEW_MUTATIONS = 24 · TOTAL = 51 · CAUGHT = 51 · MISSED = 0**

(20 in the first certification + 4 added with the Q21–Q24 closure — see the final four rows.)

Preserved (27): M1, M2, M3, M4, M5, M6, M7, M8, M9, M10, M11, M12, M13, M13b, M14, M15, M16,
M17, M18, M29, M30, M31, M32, M33, M34, M35, M36.

Added (24), each of which APPLIES, CHANGES INTENDED BEHAVIOUR and IS CAUGHT:

| Mutation | Intended break | Caught by |
|---|---|---|
| M_FOCUS_1 | ignore `focused_record_id` | wrong document returned |
| M_FOCUS_2 | use the LATEST document | wrong document returned |
| M_FOCUS_3 | use another same-business document | foreign `source_document_id` appears |
| M_CONTEXT_1 | drop the server context document id | `focused_document.id !== <id>` |
| M_TENANT_1 | trust client business over the row | the adversarial pivot SUCCEEDS |
| M_AUTH_1 | skip focused-document authorization | the unauthorized focus becomes available |
| M_AUTH_2 | stop consulting the revocation check | the revoked focus becomes available |
| M_REVIEW_1 | promote pending to canonical (both gates) | value 95000 enters the observations |
| M_VERIFY_1 | trust the model's `verified` label | the label survives |
| M_VERIFY_2 | confirmed → verified | document-only answer reads VERIFIED |
| M_VERIFY_3 | one verified source promotes mixed | mixed answer reads VERIFIED |
| M_PERIOD_1 | remove the period filter | FY2023 resolves to FY2024 |
| M_PERIOD_2 | fall back to an available year | FY2023 resolves to FY2024 |
| M_TAKEHOME_1 | map take-home → revenue | `canonical_key !== null` |
| M_TAKEHOME_2 | map take-home → AGI | `canonical_key === 'agi'` |
| M_PII_1 | let the SSN sentinel through | `219-09-9999` survives minimization |
| M_PII_2 | let the TIN sentinel through | `00-0000000` survives |
| M_PII_3 | let the bank/routing sentinel through | `021000021` survives |
| M_CTA_1 | drop the CTA document id | the focus id is gone from the CTA |
| M_REQUEST_1 | drop the request document id | the EXECUTED hook sends no `focused_record_id` |
| M_READER_1 | select the reader from the CALLER, not the row | the P&L reader runs and recognizes `annual_revenue` |
| M_PERIOD_3 | drop the period at the extraction boundary | `metadata.fiscal_year !== 2024` |
| M_PERSIST_1 | bypass `extracted_fields` persistence | the reader reports success while the STORE stays empty |
| M_REVIEW_2 | promote pending inside the observation layer itself | value 150000 enters the observations |

## 31. Full regression matrix

| # | Suite | Assertions | Pass | Fail | Exit |
|---|---|---|---|---|---|
| 1 | semanticObservationBridge | 57 | 57 | 0 | 0 |
| 2 | documentUnderstanding | 76 | 76 | 0 | 0 |
| 3 | documentUnderstandingRealSeam | 65 | 65 | 0 | 0 |
| 4 | documentKnowledgeCompletion | 184 | 184 | 0 | 0 |
| 5 | documentUploadClassification | 42 | 42 | 0 | 0 |
| 6 | extractionIntegrity | 70 | 70 | 0 | 0 |
| 7 | durableDocumentIngestion | 123 | 123 | 0 | 0 |
| 8 | documentCanonicalSourceRead | 85 | 85 | 0 | 0 |
| 9 | documentAccessAuthorization | 45 | 45 | 0 | 0 |
| 10 | documentSignedUrlAuthorization | 103 | 103 | 0 | 0 |
| 11 | adminDocumentViewer | 56 | 56 | 0 | 0 |
| 12 | galileoContextActorBinding | 52 | 52 | 0 | 0 |
| 13 | relationshipRevocationAccess | 78 | 78 | 0 | 0 |
| 14 | adminCanonicalActor | 125 | 125 | 0 | 0 |
| 15 | adminRouteAccess | 41 | 41 | 0 | 0 |
| 16 | adminWorkspaceAccess | 66 | 66 | 0 | 0 |
| 17 | getDocumentsAdmin (s3 mock) | 50 | 50 | 0 | 0 |
| 18 | architectureGuard | 0 | 0 | 0 | 0 |

**18 / 18 GREEN · 1318 / 1318 · RELEASE REGRESSIONS = 0**

(Re-measured fresh after the Q21–Q24 closure — not carried over. The first certification's
1292/1292 is superseded by 1318/1318; every suite's assertion count is otherwise unchanged.)

## 32. Security battery

`documentAccessAuthorization` 45/45 · `documentSignedUrlAuthorization` 103/103 ·
`adminDocumentViewer` 56/56 · `galileoContextActorBinding` 52/52 ·
`relationshipRevocationAccess` 78/78 · `adminCanonicalActor` 125/125 ·
`adminRouteAccess` 41/41 · `adminWorkspaceAccess` 66/66 · `getDocumentsAdmin` 50/50 — **all green,
no assertion weakened.**

## 33. Fact freeze

`business_facts` write introduced: **NO**. `business_fact_evidence` write introduced: **NO**.
Both asserted statically over the changed slice (Q25, Q26) and scanned over the full
`eb9ba40 → working tree` diff. 6D.1 is untouched.

## 34. Production specimen freeze

`9a964471-…`, `a871e587-…`, `4e08aa7f-…`, `7c005140-…` — **no retry, no classification, no
extraction, no backfill, no new job, no move, no delete, no fact promotion.** None of the four ids
appears anywhere in the diff. Every fixture in the harness is synthetic.

## 35. Build

`npm run build` executed after ALL final edits — including the Q21–Q24 closure: **exit 0**.

## 36. Migrations

**0.**

## 37. Dependencies

**0 new.** Nothing was added to `package.json`.

## 38. Baseline debt

1. ~~**Q21–Q24 do not exist** in any harness. Disclosed in §29; not claimed as passing.~~
   **CLOSED** — added, exercised and mutation-protected in §29b. No baseline debt remains on the
   named requirement set.
2. `businessContextContract` and `certify-intelligence-contract` carry pre-existing red assertions
   from before this phase. Untouched here; not counted in the 18-suite battery.
3. Pre-existing known issues unrelated to this phase remain open: Google Drive OAuth
   configuration; Google Calendar connection handling; manual Supabase RLS configuration; the
   `questions_used` counter is never incremented; the `profiles.id ↔ auth.users.id` identity link;
   SEC-031 `pg_default_acl` auto-grant.

## 39. Final changed files

Baseline proven from history: **`eb9ba40`** is the extraction-half finalisation (`Fix extraction
classifier success status check in test stubs`). It touches only test allowlists — it contains **no**
`focusedDocument.ts` and **no** `askGalileo` change. The actual 6D.0c work begins at `43924a6`.

```
BASELINE_SHA  eb9ba40   (true pre-6D.0c baseline)
FINAL_SHA     the final 6D.0c checkpoint (after this report)
files changed 13   (12 code + 1 report)
insertions    2168 (code-only 1395 · report 773)
deletions     12   (code-only 12   · report 0)
```

| File | +/- | Category |
|---|---|---|
| `base44/shared/galileo/focusedDocument.ts` | +394 / -0 | **SHARED INFRASTRUCTURE · SECURITY/PII** (allowlist + denylist live here) |
| `base44/functions/askGalileo/entry.ts` | +111 / -0 | **PRODUCT** |
| `src/hooks/useAskGalileo.js` | +7 / -0 | **PRODUCT** |
| `src/components/galileo/home/GalileoAnswerPanel.jsx` | +20 / -0 | **PRODUCT** |
| `src/scripts/documentKnowledgeCompletion.test.cjs` | +813 / -2 | **HARNESS** (first pass +529 · closure +284) |
| `scripts/adminCanonicalActor.test.cjs` | +8 / -2 | ALLOWLIST-ONLY |
| `scripts/documentUploadClassification.test.cjs` | +9 / -0 | ALLOWLIST-ONLY |
| `scripts/extractionIntegrity.test.cjs` | +10 / -0 | ALLOWLIST-ONLY |
| `scripts/adminDocumentViewer.test.cjs` | +7 / -2 | ALLOWLIST-ONLY |
| `scripts/galileoContextActorBinding.test.cjs` | +8 / -2 | ALLOWLIST-ONLY |
| `scripts/documentSignedUrlAuthorization.test.cjs` | +4 / -2 | ALLOWLIST-ONLY |
| `scripts/relationshipRevocationAccess.test.cjs` | +4 / -2 | ALLOWLIST-ONLY |
| `VISION_PHASE_6D_0C_DOCUMENT_KNOWLEDGE_COMPLETION.md` | new | REPORT |

No allowlist edit touched a behavioural, security or mutation assertion — every one adds a file
path to a change-surface array.

### §39b — the closure pass (second certification)

The Q21–Q24 closure changed exactly ONE file:

```
PASS 2 CHANGED FILES
  src/scripts/documentKnowledgeCompletion.test.cjs   +284 / -1   HARNESS  (§H — Q21–Q24 + the bridge)
  VISION_PHASE_6D_0C_DOCUMENT_KNOWLEDGE_COMPLETION.md         REPORT   (§29b, §31, §39b, the gate)
PRODUCT files changed .............................. 0
PRODUCT_CHANGE_REQUIRED ............................ NO
```

**Milestones (proven from history, not assumed):**

```
A. PRE_6D0C_BASELINE           eb9ba40   "Fix extraction classifier success status check in test
                                         stubs" — a TEST-ONLY fix that touches only allowlists.
                                         VERIFIED to contain NO focusedDocument.ts and NO askGalileo
                                         change, and it is the parent of 43924a6, so it is the
                                         revision immediately before the first 6D.0c implementation
                                         change. It does not already contain the Galileo half.
B. EXTRACTION_HALF_CHECKPOINT  eb9ba40   The extraction-half 6D.0c work was landed and certified
                                         BEFORE this baseline was cut (b102f30 → 973b884 →
                                         3766bba → eb9ba40) and is carried forward by it — which is
                                         exactly why it is "preserved, not weakened" rather than
                                         re-certified by this phase.
C. GALILEO_CORE_CHECKPOINT     43924a6   "Implement Galileo focused document core architecture"
                                         — the Galileo core: focusedDocument.ts · askGalileo ·
                                         useAskGalileo · GalileoAnswerPanel.
D. FIRST_CERT_CHECKPOINT       bda183c   "Implement Galileo focused document core architecture"
                                         (parent 43924a6) — the first certification's report and its
                                         seven allowlist slices. This is where Q21–Q24 were first
                                         disclosed as MISSING.
E. FINAL_6D0C_CHECKPOINT       the checkpoint that follows this report — Q21–Q24 closed.
```

`eb9ba40` is not *assumed* to be the pre-phase baseline: its content was read and it
provably carries no Galileo-phase product code.

## 40. Post-release acceptance plan — DEFINED ONLY, NOT EXECUTED

| Step | Action | What to inspect |
|---|---|---|
| A | Upload a fresh **2024 Form 1040** | `documents` (type `personal_tax_return`, year 2024) · `document_analysis.analysis_status` · `DocumentIngestionJob.status` |
| B | Upload a fresh supported **P&L** | same, type `profit_and_loss` |
| C | Navigate/refresh **during processing** | Data Room ANALYSIS column reads `Understanding…`, never a verdict |
| D | **Confirm scope** when required | `document_analysis.analysis_status = needs_review` → confirm → `ClassificationReviewQueue` |
| E | Verify **durable resume** | a NEW `DocumentIngestionJob` row (`queued`); the old one preserved as history |
| F | Verify extraction fields **persist** | `extracted_fields` rows with `document_id`, `business_id`, `review_status`, `metadata.fiscal_year` |
| G | Click the exact **"See what Galileo found"** | the request carries `focused_record_id = <that document id>` |
| H | Verify **exact document grounding** | the answer's `focused_document.id` equals the clicked id; `focused_document_state = available` |
| I | **Review eligible fields** | set one `accepted`, one `corrected`, leave one `pending_review` |
| J | Ask **2024 AGI** | `focused_period_resolution.by_key.agi` → `reason: resolved`, `requested_fiscal_year: 2024` |
| K | Ask **2023 profit** on a document holding only 2024 | `reason: no_observation_for_period`, `observation: null`, `alternates: []` — **no 2024 substitution** |
| L | Ask **2024 take-home** | `take_home_semantics.applies = true`, `ambiguous = true`, `canonical_key = null`; the answer asks which reading is meant |
| M | Verify **evidence labels** | the panel shows **Confirmed** or **Document evidence** — never **Verified** for a document-only answer |
| N | Verify **no improper VERIFIED** | `response.intelligence_labels.verified = []` and `response.evidence_state ≠ verified` |

Entities/tables to inspect after publication: `documents`, `document_analysis`, `extracted_fields`,
`DocumentIngestionJob`, `document_assignments`, and `galileo_conversations.messages`.

**Steps A–F are already proven executably offline** by Q21–Q23 and the INTEGRATED BRIDGE (§29b):
reader selection from the document row, the stated 2024 period preserved into the observation, and
`extracted_fields` persistence proven from the store rather than from a return value. This plan is
the production counterpart of that proof and is **defined only, not executed**.

---

## FINAL RELEASE GATE

```
EXTRACTION HALF CERTIFIED ...................... YES
18/18 REGRESSION SUITES GREEN .................. YES  (1318/1318)
9/9 SECURITY GREEN ............................. YES
RELEASE REGRESSIONS ............................ 0

Q21 PASS ....................................... YES (the 1040 reader is SELECTED; the reader's schema decides recognition)
Q22 PASS ....................................... YES (2024 preserved to the observation · parsed · FY2024)
Q23 PASS ....................................... YES (persisted, not merely returned; provenance complete)
Q24 PASS ....................................... YES (accepted/corrected eligible · pending NOT canonical)
INTEGRATED BRIDGE PASS ......................... YES (BRIDGE, BRIDGE2 — one unbroken chain)

Q1–Q62: 62/62 NAMED REQUIREMENTS PRESENT ....... YES
ALL EXECUTABLE ASSERTIONS PASS ................. YES (184/184)
ALL MUTATIONS CAUGHT ........................... YES (51/51)
MISSED MUTATIONS ............................... 0
PRODUCT_CHANGE_REQUIRED ........................ NO

FOCUSED DOCUMENT SERVER RESOLUTION PROVEN ...... YES (Q34, Q34b)
ROW-DERIVED TENANT PROVEN ...................... YES (Q35, Q36)
AUTHORIZATION PROVEN ........................... YES (Q37, Q37b)
REVOKED RELATIONSHIP DENIED .................... YES (Q38, Q38b)
EXACT DOCUMENT ID CHAIN PROVEN ................. YES (Q56, Q57, Q58, CHAIN)
NO LATEST-DOCUMENT SUBSTITUTION ................ YES (Q41, CHAIN2)
NO SAME-BUSINESS SUBSTITUTION .................. YES (Q40)

PENDING != CANONICAL ........................... YES (Q24c, Q45b, QREV1, QREV2, M_REVIEW_1, M_REVIEW_2)
CONFIRMED != VERIFIED .......................... YES (Q54)
MODEL CANNOT SELF-AWARD VERIFIED ............... YES (Q51, Q51b, M_VERIFY_1)
MIXED EVIDENCE CANNOT OVER-PROMOTE ............. YES (Q55c, M_VERIFY_3)

GENERAL RETRIEVAL PROVEN ....................... YES (Q45, Q46)
PERIOD FILTERING PROVEN ........................ YES (Q47, Q22, Q22c, M_PERIOD_3)
2024 CANNOT ANSWER 2023 ........................ YES (Q48, Q48b)
TAKE-HOME AMBIGUITY SAFE ....................... YES (Q49, Q49b, Q49c, Q50, M_TAKEHOME_1/2)

PII MODEL BOUNDARY PROVEN ...................... YES (Q59, Q59b)
USEFUL EVIDENCE STILL AVAILABLE ................ YES (Q59c)

BUILD .......................................... 0
MIGRATIONS ..................................... 0
DEPENDENCIES ................................... 0

FACT FREEZE .................................... INTACT
SPECIMEN FREEZE ................................ INTACT
REPORT COMPLETE ................................ YES
CHECKPOINT ..................................... clean · HEAD == origin/main · divergence 0/0
TRUE PHASE DIFF MEASURED ....................... YES (12 code files + 1 report · +2168 / -12)