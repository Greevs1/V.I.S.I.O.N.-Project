# V.I.S.I.O.N. — S4 Gate B · Deliverable 7
# Independent B14 Database Integrity Design Review

**STATUS: READ-ONLY DESIGN REVIEW · DOCUMENTATION ONLY · NOTHING APPLIED · NO IMPLEMENTATION AUTHORIZED**

| | |
|---|---|
| **Subject** | B14 — the proposed `SNAPSHOT_POPULATION_INCOMPLETE` closure guard (D6 §0A.3, §10), and whether a count-based closure is *sufficient* to guarantee that every eligible accepted/corrected extracted field is either mapped into the snapshot's contracted provenance or explicitly skipped |
| **Objects read** | `VISION_S4_GATE_B_02_SQL_MIGRATION.md` (D2, the executable migration text — read, not edited) · `VISION_S4_GATE_B_03_TEST_PLAN.md` (D3, 101-ID register) · `VISION_S4_GATE_B_06_STRICT_IDENTITY.md` (D6 Revision 7, §0A.2–§0A.4, §4, §10) · `VISION_S4_GATE_B_EXECUTION_SAFETY_PLAN.md` (plan, §3.4, §5.2, §12, Appendix B/C) |
| **What this review did** | Read the four artifacts against each other and against the SQL as written. Reasoned about ten failure scenarios, compared three designs, produced one proposed patch as a **separate artifact** (D7A). |
| **What this review did NOT do** | No SQL edited, prepared for execution, or run. No project contacted. No table, policy, grant or row read or written. No function, file, fixture, test or build touched. No migration applied. No production access. |
| **Bottom line** | **B14 as written is not sufficient, and it also does not execute.** It is bypassable by the caller it is meant to constrain, it compares two different populations, and its stated insertion point precedes the variables it reads, so it would silently never fire. **Recommended: Design B — exact eligible-field-ID set reconciliation inside the RPC**, one statement, same 11-parameter signature, one error code. Design C is the stronger guarantee but is out of scope and not justified. |

---

## 0. The finding that outranks every scenario below

D6 §0A.3 specifies the guard's insertion point as *"after the existing `p_field_map` / `p_skipped` validation block (D2 §3 step 1.1, V-1…V-15) and **BEFORE the contributor value loop**"*, and its predicate reads `v_contributor_count`.

**In D2 as written, `v_contributor_count` does not exist at that point.** It is declared at line 189 and first assigned at **line 572, step 7** — after the contributor value loop (step 6, lines 490–536) and after `v_contributor_ids` is built at line 541. At the proposed insertion point the variable is `NULL`.

In PL/pgSQL, `if v_population <> NULL + coalesce(jsonb_array_length(p_skipped), 0)` evaluates to `NULL`, and `IF NULL` takes the false branch. **The guard would be installed, appear present in the DDL, pass every review that greps for the error-code string, and never raise.** A test asserting only "a complete call succeeds" would pass. This is the defect class the package exists to prevent: a control that looks like a control.

This alone makes the proposal **NOT ADOPTABLE AS WRITTEN**, independently of whether count equality would have been sufficient. The corrected placement and predicate are in **D7A** (proposed patch, not applied).

---

## 1. What B14 actually proves

| Statement | Evidence | Verdict |
|---|---|---|
| Contributors are honest | D2 step 6: each mapped id must exist, belong to this document **and** business, hold `review_status ∈ {accepted, corrected}`, carry the contract's `field_name`, and hold a non-NULL value; `v_found = v_requested` else `SNAPSHOT_FIELD_NOT_CONTRACTED`. Step 7 re-reads the same ids and refuses drift. Duplicates across the map refused (`SNAPSHOT_DUPLICATE_FIELD`); duplicate targets refused; non-contract targets refused | **Holds.** The contributor side is database-verified |
| Skipped fields are honest | D2 V-12…V-15: entry must be an object with exactly `{field, reason}`; `field` a **non-empty string**; duplicates refused (V-15); capped at 1000 (V-10). **No uuid-format check. No existence check. No eligibility check. No document/business binding. No disjointness check against contributors.** Stored at line 771 as `'skipped'` — an echo of the request | **Does NOT hold.** `p_skipped` is an unverified caller claim |
| The closure is between like populations | Left side: accepted/corrected rows of `(document_id, business_id)` — **any** `field_name`. Right side: contributors (restricted to `field_name = contract.from`) + length of an unverified array | **Does NOT hold.** Asymmetric by construction, and one term is caller-supplied |
| The comparison is atomic | Count is one statement; contributors are read in a later statement; no row lock is taken anywhere in D2 (`grep 'for update\|for share'` → none); the only lock is `pg_advisory_xact_lock('s4:snapshot:'||business_id)` at **step 10, line 613**, i.e. after both reads, and it does not constrain any writer to `extracted_fields` | **Does NOT hold** under READ COMMITTED |

**Consequence.** B14 cannot support the claim in D6 §10 that "any caller that sends a truncated or filtered subset" is refused. A caller that omits *k* eligible rows and pads `p_skipped` with *k* entries naming anything — a foreign uuid, a pending field, a nonexistent uuid, or a contributor's own id — satisfies the equality exactly. The guard constrains only a caller that is already honest about its omissions, which is the case that does not need guarding.

---

## 2. Scenario matrix

Each row: **exact current protection** (as the SQL stands today) → **gap** → **minimum safe correction** → **test**.

### S1 — Equal counts, different field ID sets
- **Current:** No comparison of *sets* anywhere. `SNAPSHOT_DUPLICATE_FIELD` de-duplicates contributors; V-15 de-duplicates skipped entries. Neither relates the union to the database population.
- **Gap:** Omission of eligible field `C`, offset by adding one `p_skipped` entry for a uuid that is not eligible (or does not exist). Counts match; the snapshot silently omits `C`; provenance records a skip that never happened.
- **Minimum safe correction:** Compare the **set** of contributors ∪ skipped against the database's eligible set, in both directions (`EXCEPT`), and raise on a non-empty difference. Never compare cardinalities alone.
- **Test:** proposed **T-909**.

### S2 — Duplicate contributor IDs
- **Current:** **Closed.** A field id appearing in two targets fails `SNAPSHOT_DUPLICATE_FIELD` (count over `(target, f)` vs `count(distinct f)`). Within one target, `v_contributor_ids` is `array_agg(distinct …)` and `SNAPSHOT_CONTRIBUTOR_DRIFT` compares the confidence re-read to the array length.
- **Gap:** None for the map. **A duplicate *across* the two roles is unguarded** — an id may be both a contributor and a `p_skipped` entry, which inflates a count-based closure by one and is semantically contradictory (mapped *and* skipped).
- **Minimum safe correction:** Explicit overlap refusal (`SNAPSHOT_SKIPPED_OVERLAP`) in addition to the set comparison, because a set union silently absorbs an overlap.
- **Test:** covered by **T-907** (overlap case).

### S3 — An eligible field omitted while another is counted twice
- **Current:** Contributors cannot be double-counted (S2). Skipped entries cannot duplicate each other (V-15). **A field cannot be in both** — no rule exists.
- **Gap:** Omit `A`, name `A` in `p_skipped`, and also map `A` as a contributor: count = population, set = population ∪ {A} ⊃ population. Under a count guard this passes. Under a union-set guard with no overlap refusal this also passes.
- **Minimum safe correction:** Overlap refusal **plus** cardinality of the reconstructed set (`count(*) = count(distinct)`) — both in the same statement as the reconciliation.
- **Test:** **T-907**, **T-909**.

### S4 — Concurrent review-status change between endpoint retrieval and RPC execution
- **Current:** Each mapped contributor is re-read inside the transaction and must still be `accepted`/`corrected`, else `SNAPSHOT_FIELD_NOT_CONTRACTED`. So a **sent** field that reverts to `pending` fails closed. The caller's count-closure read (D6 §4 step 4d) detects movement *before* the call.
- **Gap:** A field that flips `accepted → pending` **after** the caller's read but **before** the RPC's count is an omission the caller cannot see and, under a count guard, the RPC can only notice if the counts happen to differ at its own read instant. A field that flips **after** the RPC's count but before `COMMIT` is invisible entirely. The advisory lock at step 10 does not help: it is taken after the reads and serializes only other snapshot callers.
- **Minimum safe correction:** None that is both minimal and complete. Perform the reconciliation in **one statement** so it is internally consistent, and **name the residual**: "complete relative to the reconciliation statement's snapshot, not relative to `COMMIT`". Closing it fully needs row locks (`FOR SHARE` on the population) **and** a defence against phantom inserts (statement-level lock or `SERIALIZABLE`), which is a locking-policy change to a shared table — **explicitly not recommended now**.
- **Test:** **T-910** — deterministic fixture, assert the *observed* behaviour matches the documented residual and that nothing partial is ever committed silently.

### S5 — Concurrent insertion or deletion of extracted fields
- **Current:** Contributors are re-read; a deleted contributor fails `SNAPSHOT_FIELD_NOT_CONTRACTED`. An inserted field is invisible unless sent.
- **Gap:** An **insert after the reconciliation statement** is a phantom the transaction cannot see and no lock prevents. A **delete of a skipped field** is harmless to the snapshot's content but makes `p_skipped` name a row that no longer exists — currently accepted, because skipped entries are never resolved against the table.
- **Minimum safe correction:** Resolve `p_skipped` against `extracted_fields` inside the reconciliation (eligibility + document/business binding). A skipped id that is not an eligible row is then refused by name. Phantom inserts remain a named residual (S4).
- **Test:** **T-908** (skipped id not eligible/not present), **T-910** (insert residual).

### S6 — Isolation level and statement-level snapshots
- **Current:** D2 contains **no transaction-control statement** (plan §9.1, verified). Isolation is therefore the runner's — PostgreSQL default **READ COMMITTED**, i.e. a **new snapshot per statement**. All of D2's reads are separate statements.
- **Gap:** Any two-statement comparison is a comparison of two different snapshots. A count statement and a contributor statement can legitimately disagree, and a guard built on their difference produces false refusals *and* false passes. No `SET TRANSACTION ISOLATION LEVEL` is possible from inside the function (it must precede the first statement, and the transaction is the runner's).
- **Minimum safe correction:** Make the reconciliation **one statement** (a single CTE that reads the eligible population and compares it to the two arrays). This does not require isolation changes, does not require a lock, and removes the cross-statement inconsistency entirely.
- **Test:** **T-910**; plus a deterministic single-statement assertion in **T-908/T-909**.

### S7 — Existing-field eligibility versus fields outside the mapping contract
- **Current:** Contributors are restricted to `field_name = contract's from`; an accepted field whose `field_name` has no target must be passed in `p_skipped` (the caller does exactly this: *"No destination in contract"*, D6 §4). The database never verifies that a skip reason is truthful, nor that the name is genuinely uncontracted.
- **Gap:** Two distinct things are conflated under one caller-supplied list: **legitimately uncontracted** fields and **omitted contracted** fields. A count guard cannot distinguish them; even a set guard cannot tell *why* a row is skipped, only *that* it is. Also note the hard ceiling: `p_skipped` is capped at 1000 (V-10), so a document with >1000 uncontracted accepted fields becomes un-snapshotable — fail-closed, but it must be named.
- **Minimum safe correction:** Enforce the **partition property** — every eligible row appears in exactly one role — and require that a skipped row is **eligible and inside this document/business**. Do **not** attempt to verify the *reason* string; that is advisory metadata, and pretending the database can police it would be a false claim. The 1000 ceiling is documented, not raised.
- **Test:** **T-908**; register note against **T-806 / T-811** (skip accounting already asserted there).

### S8 — Deduplicated requests and provenance
- **Current:** Content hash covers business, document, contract version, resolved type and date, values **and the per-target `field_ids`** (D2 step 9). Dedupe runs at **step 10**, i.e. **after** every validation, and only appends an audit row. Identical hash ⇒ identical mapped sets by construction; `SNAPSHOT_DEDUPE_TYPE_MISMATCH` asserts the type.
- **Gap:** None for provenance: a partial snapshot has a **different** source set, therefore a different hash, therefore cannot dedupe against a complete one. The one thing to state plainly is the ordering dependency — dedupe must stay **after** the reconciliation, or a repeat call would bypass it. A snapshot written by a pre-B14 version cannot be distinguished from a post-B14 one by hash alone (the hash does not cover the guard's existence), which is an **audit** question, not a provenance break.
- **Minimum safe correction:** Keep the reconciliation **before** step 10; add no new hash input. Record in the audit row that the reconciliation ran (the error code's absence is not evidence).
- **Test:** proposed variant of **T-906**; existing dedupe coverage unchanged.

### S9 — Request-level vs database-verified skipped fields
- **Current:** `p_skipped` is *"the caller's own account of what it did not send"* (D2 line 308). It is shape-checked, echoed back at line 771, and reported to the caller as `fields_skipped`. Every skip in the system today is **request-level**.
- **Gap:** The response and the stored `metadata.skipped` present a caller claim as a database finding. D6's R7-3 fixed a related defect (the request substituted for a malformed echo) but the echo is still an echo. **After B (set reconciliation) the *population* of skips becomes database-verified; the *reasons* do not, and must never be described as such.**
- **Minimum safe correction:** Reconcile ids (design B); leave reasons as declared metadata; state the distinction in the API and in D1 so no consumer reads `skipped[].reason` as adjudicated.
- **Test:** **T-907** (a skip naming an ineligible row is refused), assertion added to **T-806**.

### S10 — Can the database establish an auditable complete population without trusting the caller?
- **Current:** **Not with a count.** With a set reconciliation, **yes for membership**: the eligible population is computed from `extracted_fields` and the caller's claims are checked *against* it rather than added to it. The caller still chooses the **mapping** (`target → ids`, ops) — that is its legitimate job — but it can no longer choose **which eligible rows exist**.
- **Gap:** "Auditable" requires the reconciliation to be **reconstructable after the fact**. Today the audit table records attribution, not the population. A verifier replaying a snapshot can recompute the union from `metadata.provenance` + `metadata.skipped`, but cannot know the *eligible population at commit time*.
- **Minimum safe correction (minimum):** none beyond B for the write path; **optionally** store the population count and a digest of its sorted ids in `metadata` so a later audit can compare. Flagged as **optional, not recommended** — it changes the stored contract and the content hash, and is out of B14's scope.
- **Test:** n/a beyond S1/S3/S9.

---

## 3. Design comparison

| | **A — Count-only closure** (as proposed) | **B — Exact eligible-ID set reconciliation in the RPC** | **C — Database-owned selection and mapping** |
|---|---|---|---|
| **Mechanism** | `count(eligible) = contributors + len(p_skipped)` | `set(eligible) == set(contributors) ∪ set(skipped)`, both `EXCEPT` directions, plus overlap refusal | RPC derives targets and ops from `s4_mapping_contract`, selects eligible rows itself, ignores/validates `p_field_map` |
| **Omission detected** | Only if the caller does not pad `p_skipped` | **Always** — an omitted eligible id appears in `eligible EXCEPT sent` | Always, and mapping cannot be wrong either |
| **Caller can bypass** | **Yes**, trivially (S1, S3, S9) | **No** — every sent id must be an eligible row of this document/business, and every eligible row must be sent | No |
| **Signature** | unchanged | **unchanged (11 params)** — `p_skipped` already carries ids; only a uuid-format rule must be added for them | **changed in meaning**: `p_field_map` becomes advisory; today's callers break |
| **New DDL surface** | one error code | one error code, one statement, one added validation rule | substantial: contract cardinality, "latest-reviewed per name", total-order tie-breaks re-implemented in SQL |
| **Re-implements the logic that Revision 7 just stabilised** | no | no | **yes** — R7-1's total order, `cardinality: one` selection, op resolution. A second implementation of a comparator is a second chance to get `NaN`-class bugs |
| **Concurrency posture** | two-statement (S6) | **one statement**, internally consistent; named residual for later changes | one statement + locks |
| **Scope** | minimal | **small and contained** | broad; touches the contract's meaning |
| **Verdict** | **Insufficient as a guarantee**; keep as a redundant tripwire *only if* it costs nothing | **Recommended** | **Not recommended now** — strongest, but the guarantee is obtained at the price of a second mapping engine and a breaking input contract |

### Recommendation

**Adopt B, implemented as a strict superset of A, in one statement, raising the single error code `SNAPSHOT_POPULATION_INCOMPLETE`.** Concretely:

1. **B-core (required):** reconcile the **set** of eligible field ids against `contributors ∪ skipped`, in both directions, in **one** statement, **after** step 7 (where `v_contributor_ids` exists) and **before** step 10's advisory lock and dedupe lookup.
2. **Overlap rule (required):** an id may not be both a contributor and a skipped entry — `SNAPSHOT_SKIPPED_OVERLAP`. Without it, a set union hides the contradiction (S3).
3. **`p_skipped.field` uuid validation (required, companion):** V-12 currently accepts any non-empty string; the reconciliation must cast to `uuid`, so the cast must move behind a format check. This is a **V-rule addition (V-16)**, not a signature change.
4. **B-lock (not recommended now):** `FOR SHARE` on the population, or stronger isolation. It closes S4/S5 partially, leaves phantom inserts open, and introduces lock contention on a shared table whose writers are application flows. **Named residual instead.**
5. **No change to the hash, the stored metadata shape, the 11 parameters, the insert path, `dashboard_metrics`, `business_metric_snapshots`' existing 72 rows, CB-005B tables, or the synthetic-only write boundary.**

The resulting guarantee, stated honestly: **every eligible accepted/corrected field of the document is either mapped into the contracted provenance or explicitly recorded as skipped, as judged by the database at one statement's snapshot, inside the writing transaction.** It is not a guarantee against a change committed after that statement.

---

## 4. The proposed patch

Written as a **separate artifact, clearly marked, not applied**: `VISION_S4_GATE_B_07A_B14_PROPOSED_PATCH.md`. It is not merged into D2, contains no transaction-control statement, and is not executable as a standalone migration. **D2 remains byte-identical to the version this review read.**

---

## 5. Remaining assumptions

| # | Assumption | Status |
|---|---|---|
| 1 | `extracted_fields.review_status` is the only eligibility input, and eligible = `accepted`/`corrected` for this `document_id` + `business_id` | **Assumed from D2 step 6.** Not re-verified against the live column's constraints or default |
| 2 | An index supports the population predicate adequately for one extra `count`/`set` read | **Assumed.** Not verified; D-12 already defers a dedupe index, so cost at current row counts is immaterial |
| 3 | No trigger on `extracted_fields` changes `review_status` as a side effect of an unrelated write | **NOT VERIFIED** — no trigger inventory is in this package |
| 4 | The application tier is the only writer of `extracted_fields`, and it does not take the S4 advisory lock | **Assumed from the function inventory.** Any other writer can move the population mid-transaction (S4/S5) |
| 5 | The runner's transaction is READ COMMITTED | **Assumed** (plan §9.1 establishes *that* the runner owns the transaction, not its isolation level). B is written to be correct under READ COMMITTED **and** REPEATABLE READ |
| 6 | `p_skipped` semantics are "eligible rows deliberately not mapped" and not "rows the caller could not read" | **Assumed from D6 §4.** If a future caller uses it for read failures, B converts that into a named refusal — which is the intent, but it is a behavioural change for that caller |
| 7 | The 1000-entry `p_skipped` cap is acceptable as a hard ceiling | **Accepted, named** (S7) |

## 6. Test IDs

**Affected (existing, register unchanged at 101):**

| ID | Effect of adopting B |
|---|---|
| **T-108** | Its completeness clause gains a database-side counterpart; assertion text unchanged, evidence stronger |
| **T-209** | As above — the count-closure read is no longer the only evidence |
| **T-806 / T-811** | Skip accounting now asserts a *partition* (mapped ∪ skipped = eligible), not a list |
| **T-906** | Extend one variant: a `SNAPSHOT_POPULATION_INCOMPLETE` from the RPC must map to a deterministic 409 and never to `success: true` |
| **T-414** | `fields_skipped` mapping unchanged; the ids it reports are now database-verified for membership, not provenance of the reason |

**Proposed new IDs — NOT registered, NOT counted, awaiting authorization:**

| Proposed | Assertion |
|---|---|
| **T-907** | A `p_skipped` entry naming a row that is not an eligible field of this document/business (foreign document, `pending`, nonexistent uuid, or a contributor's own id) is refused by name |
| **T-908** | An eligible row omitted while `p_skipped` is padded to preserve the count is refused |
| **T-909** | Equal cardinality, different sets: refusal names a difference; a complete call with the same cardinality succeeds |
| **T-910** | Deterministic concurrent status change / insert around the reconciliation: documented residual observed, nothing partial committed silently |
| **T-911** | An identical repeat submission still dedupes, and the existing snapshot's provenance equals the recomputed union |

Adopting all five moves the register **101 → 106** and the executable count **79 → 84** (all five are database-executable). **No register arithmetic in D3, D4 or the plan has been touched by this review.**

## 7. Verdicts

| Question | Verdict | Basis |
|---|---|---|
| **1. Is B14 as written sufficient to guarantee complete-or-explicitly-skipped population?** | **NO-GO** | `p_skipped` is unverified caller input, so the equality is satisfiable while omitting eligible rows (S1, S3, S9); the two sides are different populations (S7); it is two statements under READ COMMITTED (S6); and at its stated insertion point it reads an unassigned variable and **would never fire** (§0) |
| **2. Is Design A (count-only) acceptable if repaired?** | **NO-GO as a guarantee** — acceptable only as a redundant tripwire inside B, at zero extra cost |
| **3. Is Design B (set reconciliation in the RPC) sufficient and minimal?** | **GO — recommended**, subject to: the overlap rule, the `p_skipped` uuid rule, correct placement after step 7, and the residual in S4/S5 stated in words |
| **4. Is Design C (database-owned mapping) warranted now?** | **NO-GO for this phase** — strongest guarantee, but a second implementation of the mapping engine Revision 7 just stabilised, and a breaking change to `p_field_map` semantics |
| **5. May D2 be edited to apply B?** | **NO-GO** — not authorized by this review. The patch exists only as D7A |
| **6. Is the package ready for database execution (P3–P6)?** | **NO-GO** — unchanged and now sharper: C1–C9 unrecorded, **B13** acknowledgement absent, and applying D2 *before* B means a second DDL pass over objects that would already exist |
| **7. Is the endpoint ready for deployment?** | **NO-GO** — **B9** open, **B10** policy resolved but code unproven, **B12** unapproved, **B14** undecided |
| **8. Does this review preserve the financial records, the synthetic-only boundary, and CB-005B?** | **GO** | Nothing was read from or written to any database; the proposal is additive, touches no existing object, no existing row, and no CB-005A/B object; no signature change |

## 8. What this review changes in the package

**Documentation only:** the plan's **B14** row now points to this review and records that the proposal as written cannot fire. **D2 is unedited. D3, D4, D6 and D1 are unedited. The 101-ID register is unchanged.** The patch is a separate artifact and is not part of the migration.

> Nothing in this review is a result. It is an argument about undeployed text, checked against other undeployed text. The only observed behaviour in the whole package remains the three static checks in the plan, all `FAIL`.