# V.I.S.I.O.N. — Phase 6D.1B: SHADOW PROMOTION ENGINE

**Date:** 2026-10-05
**Status:** CERTIFIED — ZERO FACT WRITES.
**Guiding rule:** *VISION can now say exactly what fact this evidence WOULD create — and it still creates nothing.*

---

## 1. What this phase proves

For every candidate `revenue` or `gross_profit` observation, VISION now produces a
deterministic, auditable answer to one question:

> **"What canonical Digital Twin fact WOULD this evidence create?"**

…without creating it. The engine is a **pure function of its arguments**: no client, no
I/O, no clock, no randomness. The production shadow surface measures the fact freeze
**before and after** every run rather than assuming it.

```
EVIDENCE → ELIGIBILITY → SEMANTIC NORMALIZATION → ASSOCIATION → PERIOD → BASIS
        → CANDIDATE FACT → CONFLICT RESOLUTION → TRUST RESOLUTION
        → SHADOW PROMOTION DECISION → NO DATABASE FACT WRITE
```

---

## 2. Phase 0 — the audit, and what it changed

The repository was read before anything was written. Every element of the required
architecture already existed from 6D.1A; **nothing was re-implemented.**

| # | Required element | Where it already lived | How 6D.1B uses it |
|---|---|---|---|
| 1 | Promotion pre-flight evaluator | `digitalTwin/preflight.ts` | **Called as the gate.** One pre-flight, not two |
| 2 | `FACT_REGISTRY` | `canonicalFact/registry.ts` | Fact identity, `value_type`, `unit`, and the fact's own `conflict_materiality_threshold` |
| 3 | Canonical fact resolver | `canonicalFact/resolver.ts` (+ `sourceHierarchy.ts`) | Read only for the authority concept; the shadow engine reuses `SOURCE_AUTHORITY` |
| 4 | Observation bridge | `documentObservation/semantics.ts` | `fieldMapping` / `docTypeAllowed` — the one ontology |
| 5 | Evidence eligibility | `documentExtraction/evidenceEligibility.ts` | Inside the pre-flight (association, PERSONAL_ONLY, SENSITIVE) |
| 6 | Provenance | `digitalTwin/provenance.ts` | Inside the pre-flight (REAL_SOURCE / SYNTHETIC / TEST / DEMO / UNKNOWN) |
| 7 | Business association | `evidenceEligibility.resolveAssociation` | Inside the pre-flight — the active business is never proof |
| 8 | Period quality | `digitalTwin/qualities.ts` | Inside the pre-flight |
| 9 | Basis | `digitalTwin/qualities.ts` | Inside the pre-flight; blocking, per the 6D.1A policy |
| 10 | Verification state | `digitalTwin/trust.ts` | Inside the pre-flight; `deriveTrust` re-used for the method |
| 11 | Conflict vocabulary | 6C conflict view (`business_fact_conflicts`) | The **identity** the shadow engine groups by |
| 12 | Source-authority hierarchy | `canonicalFact/types.SOURCE_AUTHORITY` | Winner selection and the conflict tier |
| 13 | Fingerprint semantics | 6C installation (SQL comment) | Implemented once in `digitalTwin/fingerprint.ts` |
| 14 | Digital Twin schema | `phase_6c_digital_twin_facts.sql` | Read for the identity + lifecycle vocabulary |
| 15 | BIS / Galileo consumers | — | **Untouched.** No precedence changed |

**No material architectural conflict was discovered.** The one genuine defect found is
disclosed in §12.

---

## 3. Files changed

```
NEW  base44/shared/digitalTwin/fingerprint.ts          the 6C identity, computed exactly
NEW  base44/shared/digitalTwin/shadowContract.ts       the decision vocabulary + result contract
NEW  base44/shared/digitalTwin/shadowPromotion.ts      the engine (pure, read-only)
NEW  base44/functions/digitalTwinShadowPromotion/entry.ts   the read-only production surface
NEW  scripts/digitalTwinShadowPromotion.test.cjs       the certification harness (54 checks, 12 mutations)
NEW  src/VISION_PHASE_6D_1B_SHADOW_PROMOTION.md        this report
MOD  base44/shared/digitalTwin/preflight.ts            one defect fix (§12) — numericValue is now strict and exported
```

No entity, schema, RLS, migration, default privilege, connector or secret was touched.
**No product behaviour changed** other than the disclosed parse fix.

---

## 4. Pilot fact definitions

The 6D.1B **active pilot is deliberately two facts**, a strict subset of the registry's
ten pilot facts:

| Fact key | Display | Type | Unit | Materiality threshold |
|---|---|---|---|---|
| `revenue` | Revenue | currency | USD | 0.05 |
| `gross_profit` | Gross Profit | currency | USD | 0.05 (default) |

Every other canonical concept — including the registry's other eight pilot facts
(`gross_margin`, `net_income`, `reported_ebitda`, `normalized_ebitda`,
`owner_compensation`, `cash`, `debt`, `customer_concentration`) — is **evaluated and
reported `NOT_IN_PILOT`**. A mapping existing is not a reason to activate it.

---

## 5. Decision contract

`SHADOW_DECISIONS` — a closed vocabulary; **exactly one** primary decision per result:

| Decision | Meaning |
|---|---|
| `WOULD_PROMOTE` | every hard gate passed; a real promotion would write this fact |
| `BLOCKED` | a hard gate failed (the `blockers` say which — the 6D.1A vocabulary, unchanged) |
| `CONFLICTED` | two or more **same-authority** candidates materially disagree; no deterministic winner |
| `NOT_IN_PILOT` | a canonical concept, outside the two-fact pilot |
| `NO_CANDIDATE` | no canonical concept resolves — nothing to promote |
| `SUPERSEDED` | subsumed by the selected candidate of the same identity (lower authority or duplicate). **Reused** from the 6C fact lifecycle — no second vocabulary was invented |

`ShadowPromotionResult` carries: identity, decision, candidate value + type + currency,
period (type/label/start/end/fiscal year) + period quality, accounting basis +
`basis_required`, source type/id/authority/rank, provenance class, association, machine
confidence, human confirmation state, verification state + method, `evidence_ids[]`,
`blockers[]`, `warnings[]`, `resolver_trace[]`, conflict group + `conflicting_candidate_ids[]`
+ per-candidate detail, `supersedes_candidate_id`, `fingerprint` + `fingerprint_preimage` +
`fingerprint_outcome`, and the two simulation flags `would_write_fact` / `would_write_evidence`.

> The simulation flags describe what a real promotion WOULD do. They are **not
> instructions**, and this phase contains no writer.

---

## 6. Promotion gates (all must pass for `WOULD_PROMOTE`)

| Gate | Rule | Source |
|---|---|---|
| Canonical key | a canonical concept must resolve | the one bridge |
| Pilot | the key must be `revenue` or `gross_profit` | this phase |
| Provenance | origin must be `REAL_SOURCE` | 6D.1A `provenance.ts` |
| Association | proven from the **document**, never from context | 6D.1A `evidenceEligibility` |
| Semantic validity | not evidence-only, not personal-only | 6D.1A pre-flight |
| Sensitivity | never an identifier | `sensitiveFields.ts` |
| Projection | a projection is not a recorded result | 6D.1A pre-flight |
| Value parse | the value must parse (**a malformed string is not 0**) | §12 |
| Period | `EXACT` or `BOUNDED` only | 6D.1A `qualities.ts` |
| Basis | required where the fact's own definition makes it meaningful; `unknown` blocks | registry + `qualities.ts` |
| Review | must be settled and not rejected | 6D.1A `trust.ts` |
| Verification | never inferred from confidence or confirmation | 6D.1A `trust.ts` |
| Conflict | no material same-authority disagreement | §7 |
| Lifecycle | the fingerprint resolves to a live, non-duplicate identity | §8 |

### 6b. Two policy decisions, surfaced (not invented)

1. **Unknown basis is BLOCKING** for these measures. This is not a new rule: 6D.1A's
   `PROMOTABLE_BASES` excludes `unknown`, and `basisRequiresValue` is derived from the
   registry's own `applicable_periods`. Both `revenue` and `gross_profit` are flow
   measures, so their basis must be known.
2. **Zero, negative and implausible values are WARNINGS, not gates.**
   `ZERO_VALUE`, `NEGATIVE_VALUE` and `GROSS_PROFIT_EXCEEDS_REVENUE` are surfaced on the
   result but do not block, because the 6D.1A gate set does not treat them as promotion
   gates and inventing a new gate here was not authorized. A gross profit greater than
   revenue is economically impossible and is flagged loudly for human review.

---

## 7. Resolver behaviour

**Grouping.** Eligible pilot candidates are grouped by the **6C conflict identity** —
`business · fact key · period type · period label · basis · period_start · period_end`.
Identical-identity observations collapse into **one fact with several evidence rows**
(the 6C `business_fact_evidence` model), so `evidence_ids[]` is the fact's evidence set.

**Winner selection (deterministic).** The **highest** source authority wins. A tie in the
top tier is broken by **machine confidence**, then by **lowest observation id**. Losing
evidence is never discarded — it stays in `candidates[]` and in the winner's `evidence_ids[]`.

**Conflict.** A conflict exists **only when the top authority tier itself disagrees
materially** (relative spread > the fact's own `conflict_materiality_threshold`). Then
every member of the group is `CONFLICTED` and no winner is chosen. A material
disagreement between *different* authority tiers is **not** a conflict: the higher
authority wins deterministically and the lower one is retained with
`LOWER_AUTHORITY_DISAGREEMENT`.

**Trust does not break authority ties.** `verified` vs `unverified` at the same authority
and materially different values is `CONFLICTED` — verification is a statement about the
source, not a licence to outrank a peer.

| Simulation | Result |
|---|---|
| Two identical observations | 1 × `WOULD_PROMOTE` (2 evidence rows) + 1 × `SUPERSEDED`, `DUPLICATE_OBSERVATION` |
| Minor variance (0.008%) | 1 selected + 1 subsumed, `MINOR_VARIANCE` |
| Material same-authority disagreement (1250000 vs 900000) | **both** `CONFLICTED`, `conflicting_candidate_ids` length 2, both candidates shown |
| Different authority, material (1600000 tax return vs 1250000 P&L) | tax return wins, `LOWER_AUTHORITY_DISAGREEMENT`, loser retained |
| `verified` vs `unverified`, material | `CONFLICTED` |

---

## 8. Fingerprint simulation

The fingerprint is the **exact 6C identity**, computed with a dependency-free synchronous
SHA-256 (FIPS 180-4) so the pure engine can produce it in both the Deno function and the
Node harness:

```
sha256( business_id | fact_key | period_type | period_label | period_start | period_end
        | accounting_basis | source_type | source_table | source_id | canonical_value )
```

The preimage is kept on the result, so a reviewer can reproduce it. Correctness is
asserted against published SHA-256 test vectors.

| Simulated existing fact | `fingerprint_outcome` | `would_write_fact` | Warning |
|---|---|---|---|
| Same fingerprint | `DUPLICATE` | **false** (a real promotion is a no-op) | `DUPLICATE_FINGERPRINT` |
| Same identity, different value | `CORRECTION` (supersedes it) | true | `CORRECTION_OF_EXISTING_FACT` |
| Already superseded | `NEW` | true | `EXISTING_FACT_SUPERSEDED` |
| Nothing (production today) | `NEW` | true | — |

Production contains zero facts, so **every** production outcome is `NEW` — exercised here
only against in-memory inputs. No production data was modified to test supersession.

---

## 9. Production shadow results

Run read-only against production (`writes_performed: false`):

| Measure | Value |
|---|---|
| Evidence observations evaluated | **130** |
| Distinct businesses | 3 |
| `revenue` candidates | **12** |
| `gross_profit` candidates | **11** |
| **`WOULD_PROMOTE`** | **0** |
| `BLOCKED` | 23 (all of them pilot candidates) |
| `NOT_IN_PILOT` | 43 |
| `NO_CANDIDATE` | 64 |
| `CONFLICTED` | 0 |
| `SUPERSEDED` | 0 |
| `would_write_facts` | **0** |
| `would_write_evidence_rows` | **0** |

**This matches the 6D.1A pre-flight exactly** (130 rows · revenue 12 · gross_profit 11 ·
0 ready · identical blocker counts). The shadow engine is measuring the same evidence
through the same gates — it adds the candidate, the conflict position and the fingerprint,
not a new opinion.

**Why readiness is 0, honestly.** Every row is blocked on business association and basis;
116 of 130 are unreviewed and 75 are synthetic/test extractions. Readiness 0 is therefore
*both correct and not yet informative about real documents*: the pre-flight and the shadow
engine are measuring a development evidence base. It must be re-run after real client
documents flow through ingestion.

### 9b. Distributions

| Blocker | Rows |
|---|---|
| BUSINESS_ASSOCIATION_AMBIGUOUS | 130 |
| BASIS_UNKNOWN | 130 |
| REVIEW_PENDING | 116 |
| SYNTHETIC_SOURCE | 75 |
| EVIDENCE_ONLY_CONCEPT | 62 |
| PERIOD_UNKNOWN | 35 |
| MULTI_PERIOD_AGGREGATE | 24 |
| SEMANTIC_MAPPING_INVALID | 8 |
| PERSONAL_ONLY | 4 |
| MISSING_PROVENANCE | 2 |
| REVIEW_REJECTED | 1 |

| Provenance | Rows | | Period quality | Rows | | Verification | Rows |
|---|---|---|---|---|---|---|---|
| SYNTHETIC | 65 | | UNKNOWN | 35 | | unverified | 117 |
| TEST | 10 | | BOUNDED | 45 | | confirmed | 13 |
| REAL_SOURCE | 55 | | AGGREGATE_MULTI_PERIOD | 24 | | verified | 0 |
| | | | EXACT | 26 | | | |

| Association | Rows |
|---|---|
| ASSOCIATION_AMBIGUOUS | 130 |
| ASSOCIATION_PROVEN | 0 |
| ASSOCIATION_REJECTED | 0 |

---

## 10. Explainability — the required trace

Every result carries a `resolver_trace`. The production shape today:

```
REVENUE  —  candidate value 1,250,000
  Decision: BLOCKED
  provenance          REAL_SOURCE
  business_association ASSOCIATION_AMBIGUOUS   ("nothing in the document ties this figure to this business")
  semantic            revenue                  (extracted_field)
  period              AGGREGATE_MULTI_PERIOD   ("All Dates (2021-2025)")
  basis               accrual                  required
  review              confirmed                confirmed (NOT verified)
  decision            BLOCKED                  BUSINESS_ASSOCIATION_AMBIGUOUS, MULTI_PERIOD_AGGREGATE, …
⇒ NOT PROMOTABLE — and the trace says exactly which gate each reason came from.
```

The engine can therefore explain, per candidate, **why this would become a fact** or
**why it would not** — with no prose and no inference on the client.

---

## 11. Harness & mutation results

```
node scripts/digitalTwinShadowPromotion.test.cjs
   checks: 54   →  ALL PASS
   mutations: 12/12 APPLIED + BEHAVIOR_CHANGED + CAUGHT   (MISSED = 0, DID_NOT_APPLY = 0)
```

**Scenario coverage** — S1–S41 as specified: valid revenue/gross profit · synthetic ·
mock-accepted · demo · ambiguous association · near-match name · wrong business · exact FY
· calendar year · TTM · multi-year aggregate · unknown period · ambiguous period · cash ·
accrual · unknown basis · pending · confirmed · verified · rejected · duplicates · minor
variance · material conflict · higher-authority conflict · verified-vs-unverified ·
duplicate fingerprint · correction · supersession · personal-only · personal-document
isolation · ambiguous personal/business · PII-only · association-only · non-pilot ·
unknown concept · malformed value · zero · negative · zero gross profit · gross profit >
revenue.

**Properties** — determinism (byte-identical replay), SHA-256 known-answer vectors, the
6C preimage shape, the closed pilot, exactly-one-decision, the summary, and reuse of the
certified pre-flight.

**Mutations caught** (each applies, changes behaviour, and is caught):
synthetic accepted as real · foreign business allowed · multi-year aggregate treated as a
period · unknown basis treated as accrual · pending treated as confirmed · confirmation
treated as verification · pilot gate bypassed · material conflict ignored · **lowest**
authority winning · personal-only evidence promoted · fiscal year silently rewritten as
TTM · **the shadow engine writing `business_facts` (caught at source level)**.

> The personal-only mutation needed **both** independent protections to fail (the
> disposition table *and* the registry scope) before it broke — recorded because that is a
> strength: one weakened guard alone is inert.

---

## 12. Defect found and repaired (disclosed)

**A malformed value was silently parsed as `0`.** `Number("abc".replace(/[^0-9.\-]/g,''))`
is `Number("")`, which is `0`. A figure reading `"N/A"` therefore became a
plausible-looking zero and passed the provenance gate.

Repaired at the smallest correct layer — the **shared** parse (`preflight.numericValue`,
now exported and reused by the shadow engine, so the two can never disagree). A string with
no digit now **fails the parse** and the observation is `BLOCKED` with
`MISSING_PROVENANCE`.

**Regression proof:** the 6D.1A certification harness was re-run after the change —
**47/47 checks, 16/16 mutations, ALL CHECKS PASS** — and the production blocker
distribution is **byte-identical** to 6D.1A's (`MISSING_PROVENANCE` 2, unchanged).

---

## 13. Regression results

Measured against a **pristine HEAD checkout** (`0d343fc`, via `git worktree`), so green and
red are separated by evidence rather than by assumption.

| Suite | This slice | At HEAD | Verdict |
|---|---|---|---|
| `digitalTwinActivationSafety` (6D.1A) | **ALL PASS** (47 · 16/16) | ALL PASS | **no regression** |
| `digitalTwinShadowPromotion` (new) | **ALL PASS** (54 · 12/12) | n/a | **new, green** |
| `evidenceFirstAnswerEngine` | 40/40 · 15/15 | — | **green** |
| `documentUnderstandingRealSeam` | 65 PASS | — | **green** |
| `adminRouteAccess` | pass | — | **green** |
| `adminWorkspaceAccess` | pass | — | **green** |
| `documentAccessAuthorization` | pass | — | **green** |
| `architectureGuard` | ✅ PASS | — | **green** |
| `getDocumentsAdmin` (s3 mock) | 50/50 | — | **green** |
| `taxDocumentIntelligence` | 20 failures | **20 failures** | **unchanged — pre-existing debt** |
| `documentUnderstanding` | 1 failure (D37) | **1 failure (D37)** | **unchanged — pre-existing** |
| `semanticObservationBridge` | `mutation target not found: M2` | **identical** | **unchanged — harness anchor drift** |
| `documentUploadClassification`, `extractionIntegrity`, `documentKnowledgeCompletion`, `durableDocumentIngestion`, `documentCanonicalSourceRead` | `FORM_1040_FIELDS is not defined` | **identical** | **unchanged — pre-existing, harness-side** |
| `adminCanonicalActor`, `adminDocumentViewer`, `documentSignedUrlAuthorization`, `galileoContextActorBinding`, `relationshipRevocationAccess` | review-pinning guards flag the change surface | **already red at HEAD** | **unchanged** — a phase boundary requires slice re-review, not a functional fix |

**No suite became red because of 6D.1B.** No pre-existing debt was "fixed" here.

**Build:** `vite build` → **exit 0**.

---

## 14. Fact-freeze certification

Measured directly against production, read-only, in one session:

| | `business_facts` | `business_fact_evidence` |
|---|---|---|
| Before the shadow evaluation | **0** | **0** |
| After the shadow evaluation | **0** | **0** |
| Held | **YES** | **YES** |

The production surface additionally re-measures the freeze inside every run and reports
`fact_freeze_before`, `fact_freeze_after`, `fact_freeze_held` and `writes_performed: false`.
The harness asserts, **at source level**, that the engine and the function contain no
`insert` / `update` / `upsert` / `delete` / `rpc` and no writer — so a future edit that
adds one fails the suite.

---

## 15. Known debt (recorded, not repaired here)

1. **Business association is unproven for all 130 production rows** — the single largest
   reason nothing is promotion-ready. This is a document-content gap, not an engine gap.
2. **58% of the evidence base is synthetic/test.** The pilot must be re-run on real
   documents before activation is reconsidered.
3. **Pre-existing suite debt, untouched:** `taxDocumentIntelligence` (20),
   `documentUnderstanding` D37, the `FORM_1040_FIELDS` harness-side crash in five suites,
   `semanticObservationBridge`'s stale `M2` anchor, `businessContextContract` and
   `certify-intelligence-contract` (recorded red from before this phase).
4. **SEC-031 / SEC-032** — broad default ACLs — remain confirmed and **were not**
   remediated here (6D.1A §10).
5. **`fingerprint.ts` implements SHA-256 in-module.** If the real promotion engine ever
   prefers a platform digest, it must produce the **same preimage** and the same 64-hex
   value; the preimage is on every result so the two can be reconciled.

---

## 16. Release revision

```
HEAD               0d343fc   "Update digital twin activation safety certification documentation"
                           (auto-committed after the 6D.1A report update)
working tree       M base44/shared/digitalTwin/preflight.ts
                   ?? base44/shared/digitalTwin/{fingerprint,shadowContract,shadowPromotion}.ts
                   ?? base44/functions/digitalTwinShadowPromotion/
                   ?? scripts/digitalTwinShadowPromotion.test.cjs
fact freeze        0 / 0   (measured, twice, this session)
```

---

## FINAL STATUS

```
6D.1B SHADOW PROMOTION ENGINE
CERTIFIED — ZERO FACT WRITES
```

For every candidate revenue or gross-profit observation, VISION can now deterministically
explain whether it WOULD become canonical truth — **without writing anything.**

**Not started (out of scope, by instruction):** real promotion, fact/evidence writes, BIS
or Galileo precedence, extracting `extracted_fields`, ingestion architecture, the
automatic evidence-relevance policy, the pilot beyond revenue + gross_profit, SEC-031/032,
and 6D.1C.