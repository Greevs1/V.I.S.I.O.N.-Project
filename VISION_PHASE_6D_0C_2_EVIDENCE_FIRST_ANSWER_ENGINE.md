# VISION Phase 6D.0c.2 — Evidence-First Galileo Answer Engine

Status: **RELEASE CANDIDATE — awaiting review. Not published. Phase 6D.1 not started.**

## 1. Why this phase exists

6D.0c.1 made unreviewed document evidence retrievable, but production still produced
answers whose evidence and recommendations disagreed. A live trace of "My Business"
established three root causes. None was a missing figure.

| Production question | What Galileo said | Root cause |
|---|---|---|
| What was my revenue? | Figure prepended, then "Without this information…", next step "Gather and input your current revenue data" | The confirmed tax-return revenue ($1.25M, FY2025) never reached the model; the earlier repair *prefixed* a figure and left contradicting model prose, the model's next step and its missing list intact. |
| What did I pay in tax? | "You have paid approximately $13,245 in taxes" | "pay in tax" matched no concept, so no evidence contract ran; the model used the Tax Gap **opportunity** as a historical fact. |
| What was my income? | "Income data is unavailable" beside "I found 2 figures" | "income" maps to no single fact; nothing resolved it, and the extraction notice lives in a different code path from the answer. |

A fourth defect surfaced during certification: the PII filter matched short identifiers as
substrings, so `taxable_income` (tax-abl-**EIN**-come) was treated as an EIN and silently
dropped from every evidence lane.

## 2. Architecture

```
QUESTION → INTENT → CONCEPT → PERIOD → EVIDENCE ENVELOPES → RESOLUTION → ANSWER CONTRACT
        → (model phrases an interpretation) → ENFORCEMENT (last step in askGalileo)
```

| Module | Responsibility |
|---|---|
| `answerEngine/ontology.ts` | Concepts derived from the canonical fact registry: basis (actual / projected), related concepts, forbidden substitutions (total tax ≠ tax paid; any opportunity ≠ its actual), ambiguous terms ("income"). |
| `answerEngine/envelope.ts` | ONE normalized evidence shape for canonical, provisional and advisory candidates. Fails closed on access, business scope and PII. |
| `answerEngine/resolver.ts` | Deterministic precedence VERIFIED > CONFIRMED > PROVISIONAL; CONFLICTED, AMBIGUOUS_PERIOD, RELATED_ONLY, AMBIGUOUS_CONCEPT, UNAVAILABLE. The **opportunity firewall**: an advisory envelope is never admissible for a factual concept. |
| `answerEngine/contract.ts` | The server-owned answer: first sentence, labels, missing list, sources, next step. Model prose is filtered (absence claims beside evidence, invented figures, unearned "verified"/"confirmed", dangling "without this information"). Nothing is rewritten. |
| `answerEngine/pipeline.ts` | `prepareEvidenceFirstAnswer` before the model, `finalizeEvidenceFirstAnswer` last. |
| `factualAnswerView.js` / `nextStepResolver.js` / `FactualEvidenceBlock.jsx` | The surface renders the contract only: labels, "Where this came from" (document · period · field · review state), missing list and next step. |

## 3. Behaviour after the change (live-shape fixtures)

* **Revenue** → "Your FY2025 revenue is $1.25 million, from your 2025 Business Tax Return.pdf (reviewed and confirmed)." Label CONFIRMED DATA; next step "Use this revenue figure"; no missing item.
* **Tax paid** → the $31,000 P&L tax is shown as RELATED DATA, payments are stated as not on file, and $13,245 appears only as a separately labelled projection. Next step asks for a document showing tax paid.
* **Income** → a clarification offering revenue, net income and taxable income with their figures. Never "unavailable".

## 4. Verification

`scripts/evidenceFirstAnswerEngine.test.cjs` — offline, non-destructive, bundles the real modules.

* A1–A30, NO_WRITE, LIVE-A…LIVE-D, the sensitive-field matrix (SENS-POS / SENS-NEG /
  SENS-KEEP), the general-path PII sentinel proof (SENT-GEN) and the askGalileo wiring
  check: **40/40 pass**.
* Adversarial mutations of the real source: **15/15 caught** (firewall, tier order, dedupe,
  period collapse, scope filter, access check, PII token and substring regressions, a dropped
  identifier, generic absence, invented money, model next step / missing list winning,
  surface labels, surface next step).
* The focused-document / ingestion harness (`src/scripts/documentKnowledgeCompletion.test.cjs`)
  reaches **260/260 checks with 71/71 mutations caught**, including the two-lane sentinel
  proofs Q59h/Q59j added in the final cleanup.
* Historical change-surface guards admit the slice through one shared list (`scripts/slice6D0C2Files.cjs`).

## 4b. Final cleanup — ONE sensitive-field predicate

Production carried **two** copies of the PII rule (provisional lane, focused-document
projection) and **both** matched identifiers as SUBSTRINGS. "EIN" therefore matched inside
"taxabl-EIN-come": taxable income was silently dropped while a real SSN was excluded for an
accidental reason. The rule now exists ONCE (`base44/shared/galileo/sensitiveFields.ts`) and
both lanes import it. No lane decides PII for itself.

* **Semantic, not coincidental.** Short identifiers (ssn · tin · ein · itin · dob) match as
  WHOLE TOKENS after camelCase splitting and punctuation removal; long ones
  (socialsecuritynumber, taxpayeridentificationnumber, employeridentificationnumber,
  bankaccountnumber, passportnumber, dateofbirth, …) match as normalized phrases, so
  underscored, spaced, hyphenated and camelCase spellings agree.
* **Fixed a real exclusion gap.** `employer_identification_number` was **not** being
  excluded before this consolidation; it is now.
* **Kept eligible.** taxable_income, net_income, ordinary_business_income, business_income,
  income_tax, tax_expense.
* **Proven both ways.** Sentinels run through BOTH lanes: the SSN row and its VALUE
  (`219-09-9999`) appear nowhere in evidence, contract or answer on the general path, and
  nowhere in the focused context; taxable income reaches the focused context. A sabotage that
  weakens the shared predicate alone is proven INERT (each lane's own allowlist still gates
  the value) — leaking requires breaking both, which is the point of sharing one rule.
* **No precedence, ontology, contract, opportunity-firewall, ingestion, review, authorization
  or isolation logic changed.** No entity, schema, RLS, secret or migration touched. Nothing
  is written by the engine.

## 5. Boundaries held

No entity, schema, RLS, authorization or notification change. No pending row is promoted.
The engine writes nothing. The focused-document lane no longer carries its own PII denylist:
the substring weakness noted at the previous release candidate is **closed** by the shared
predicate above.

## 5b. Regression status

All 19 repository harnesses plus the architecture guard were re-run after the consolidation.
Green: upload/classification, semantic-observation bridge, document understanding (real seam),
extraction integrity, durable ingestion, canonical source read, admin document viewer (S3
mock), document-access authorization, signed-URL authorization, Galileo actor binding, admin
canonical actor, relationship revocation, admin workspace and route access, architecture guard.
Production build: clean. Two suites remain red exactly as recorded in the baseline debt —
`certify-intelligence-contract` (`business_id` on keys) and `businessContextContract`
(`ownershipConcentrationEngine` canonical import). Neither names a file in this slice and both
were red before it.

## 6. Not done

Publication and Phase 6D.1 await review. Deferred, non-blocking: the ingestion/focused harness
is now 2,222 lines, above the 2,000-line soft limit for a single file — splitting a guarded
certification harness should be its own reviewed change.