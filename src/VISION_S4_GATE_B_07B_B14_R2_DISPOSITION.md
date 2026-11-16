# V.I.S.I.O.N. — S4 Gate B · Deliverable 7B
# B14 Revision 2 — Finding-by-Finding Disposition, Policy Decisions, Verdicts

**STATUS: DOCUMENTATION AND PROPOSED CODE ONLY · NOTHING APPLIED · NO IMPLEMENTATION OR EXECUTION AUTHORIZED**

| | |
|---|---|
| **Sources read** | `VISION_S4_GATE_B_02_SQL_MIGRATION.md` (D2 — all 1,151 lines, read not edited) · `VISION_S4_GATE_B_06_STRICT_IDENTITY.md` (D6 Rev 7) · `VISION_S4_GATE_B_07_B14_INTEGRITY_REVIEW.md` (D7) · `VISION_S4_GATE_B_07A_B14_PROPOSED_PATCH.md` (D7A R1) · `VISION_S4_GATE_B_03_TEST_PLAN.md` (D3 register) · `VISION_S4_GATE_B_04_PRECHECK_AND_CONSISTENCY.md` §6 |
| **Produced** | `VISION_S4_GATE_B_07A_R2_B14_PROPOSED_PATCH.md` — the revised patch, separate from D2 |
| **Not done** | No D2 byte edited. No D1/D3/D4/D6/plan edit. No SQL run or prepared for execution. No project contacted. No table, row, policy or grant read or written. No fixture created, no test run, no build attempted. |
| **Claims** | No certification and no runtime proof is made anywhere. Every statement below is about **undeployed text**. |

---

## 1. Finding-by-finding disposition

### Finding 1 — exact V-16 for every `p_skipped[].field`

**Disposition: CLOSED in the revised patch (H2), with one defect in R1 corrected.**

R1 asserted a uuid rule but never wrote the PL/pgSQL. The revised rule is a three-arm predicate over `jsonb_array_elements(p_skipped)`, raising `SNAPSHOT_INVALID_SKIPPED: field is not a canonical uuid` with `errcode 22023`, using **the same pattern V-8 already enforces** for `field_ids` — so the two uuid rules cannot drift.

**Placement: last, immediately after V-15, before the block's `end if;` (D2 lines 345–349).** It depends only on V-13 (which proves every `field` a non-empty string of length 1–128), so any position after V-13 is behaviourally identical for a well-formed caller. Last is chosen because it leaves every existing rule's **number, statement order and verdict unchanged** — and D4 §6 counts the rule set while T-315 enumerates the p_skipped cases by shape.

**The R1 defect that this closes.** A naive rule of the form `length(s->>'field') <> 36 or (s->>'field') !~ pattern` evaluates to **NULL** whenever `field` is absent or non-string, because `->>` yields SQL NULL. A `where NULL` returns no row, so the guard would **pass in silence** — the identical NULL-predicate defect D7 §0 found in the count proposal, reintroduced in the very rule written to prevent unnamed errors. The revised rule therefore includes an explicit **`is null` arm**, making it order-independent and incapable of a silent pass even if a later editor moves it above V-13. (V-8 carries the same latent NULL; it is masked there by V-7. V-16 needs no mask.)

**Error inventory:** reuses `SNAPSHOT_INVALID_SKIPPED` — **no new code, no new mapping row**. If V-16 fires from our own endpoint it is an internal defect and correctly surfaces as a generic 500 (D6 maps that code to 500 and logs `RPC invariant failure`), for exactly the reason C-7 already gives for V-1…V-15: the endpoint builds the payload from database ids. The rule exists for the **direct-RPC** path, where an unvalidated `p_skipped` would otherwise reach `::uuid` and raise a bare `22P02` that no mapping recognises.

---

### Finding 2 — complete eligible-field accounting vs complete contracted financial mapping

**Disposition: CLOSED as a clarification; the distinction is now the stated subject of the guard. No product policy changed.**

The two properties are different and only one of them is B14's:

| | **Eligible-field accounting** (B14's subject) | **Contracted financial mapping** (not B14's subject) |
|---|---|---|
| Population | Every row of `extracted_fields` with `document_id = p_source_document_id`, `business_id = p_business_id`, `review_status ∈ {accepted, corrected}` — **name-agnostic** | For each target in the document type's contract, the ids whose `field_name = target.from`, resolved by the caller's cardinality rule |
| Who verifies | **The database**, in one statement at 7A | Step 6 re-verifies every supplied id (tenant, status, contract name, non-null value); the *choice* of which rows to send is the caller's legitimate job |
| Property enforced | **Partition:** eligible = contributors ∪ skipped, disjoint | **Correctness of each contribution**, never completeness of the mapping |
| Broken by a partial read? | **Yes — refused** | Not applicable |

**Answer to "may contract-mappable fields legitimately be skipped?" — YES, and there are two evidenced cases, both already in the product:**

1. **Superseded duplicates under `cardinality: 'one'`.** D6 §4 builds `idsByName` from the ordered list and takes `slice(-1)`; every earlier same-name row is unconsumed and lands in `skipped`. Those rows are contract-mappable **by name** and are *deliberately* excluded — T-801's deterministic-selection variant exists precisely to pin which one wins. A guard requiring every contract-mappable field to be a contributor would **refuse T-801's superseded row and T-811's setup, breaking a correct call.**
2. **Optional targets absent from the delivery.** Step 6 `continue`s when no `p_field_map` entry exists for a declared target; the rows that would have fed it still exist and must be accounted for.

So B14 enforces the **partition**, and must not be described as, or strengthened into, a mapping-completeness rule. Doing so would drag Design C's mapping logic into SQL — the option D7 already refused — and would change the product rule for `cardinality: 'one'` without approval.

**One honest side-finding, recorded not fixed.** The caller writes the reason `No destination in contract s4.mapping.v1` for **every** skip, including superseded duplicates, which *do* have a destination. The string is therefore already **inaccurate for that case**, independently of B14. It is a caller-side message defect with zero behavioural consequence (D7 S9 already establishes that reasons are declared metadata, never adjudicated). A one-line caller correction is proposed for the next authorized change-set and is **not** made here, because it is not what this review was asked to change.

---

### Finding 3 — the D6 error-handler mapping for both codes

**Disposition: VERIFIED, with one required caller addition and one documentation arithmetic correction that the whole package currently gets wrong.**

**Verified by counting, not by assertion:**

- D2 raises **26** distinct `SNAPSHOT_*` codes. D6's `RPC_ERROR_STATUS` maps **26**. The two sets are **identical** — so D4 §6's substantive claim ("nothing raised without a mapping, nothing mapped but unraised") **holds**.
- **`SNAPSHOT_POPULATION_INCOMPLETE` is absent** from the map. Today it would fall through `!code` → `console.error('unmapped RPC failure')` → generic 500. **This is a required correction:** the code is reachable through normal operation (the net-zero concurrent change, the mid-transaction status flip, an honest caller's omission), and reporting it as an internal fault would tell the operator to hunt a bug that is not there.
- **`SNAPSHOT_INVALID_SKIPPED` is already mapped to 500**, which is correct for V-16 — no change needed.
- **`mapRpcError` needs a message, not just a status.** For any status < 500 it returns `RPC_ERROR_MESSAGES[code] || 'Request rejected'`. Adding the status alone would deliver the literal string **"Request rejected"** to the operator, which is worse than the 500 it replaced. Both entries are specified as C-1 and C-2.
- **Substring-collision check.** The matcher is `Object.keys(...).find(k => text.includes(k))` — **substring** match in **key order**. Verified across all 27 names: no existing key is a substring of another, and the new name contains no existing name. Unambiguous today; the future-facing hazard (a new name containing an old one would let the *older* key win) is written down beside the map rather than left implicit.

**The arithmetic correction.** D4 §6, D6 §0A.3, D6 §10 and D7A R1 all state the inventory is **"24 codes … becomes 25"**. The true figure is **26 → 27**. The error is 2, it is present in four places, and it is quoted as though counted. It changes no code and no test; it is corrected in D7A R2 §7 so that whoever restates D4 §6 restates the right number. D4 §6's row also still says "the keys of `RPC_ERROR_STATUS` **in D1**" — stale since D1 §3 was withdrawn and the map moved to D6 §4.

---

### Finding 4 — preserve the named concurrency limitation; define deterministic tests

**Disposition: CLOSED. The residual is preserved verbatim in force, and four fixtures make the window deterministic without sleep or luck.**

The residual stands and is not softened: **7A proves set completeness at its own statement's snapshot, not at `COMMIT`.** What 7A does change, and this must be stated rather than discovered later: a status flip landing **before** 7A is now **refused** (it was previously invisible), so the window narrows from "any time during the call" to "after 7A, before commit". That narrowing is real, is not a closure, and must not be reported as one.

The determinism method is the function's own ordering: 7A runs at step 7A and the first lock the function takes is the transaction-level advisory lock at **step 10**. A second session holding the **session-level** `pg_advisory_lock` on `hashtextextended('s4:snapshot:'||business_id, 0)` pins the call exactly in the post-reconciliation, pre-write window, because session-level and transaction-level requests on the same lock id conflict.

Four fixtures — full sequences in D7A R2 §6.2:

| Fixture | What it proves | Why it is deterministic |
|---|---|---|
| **T-910(a)** status flip in the window | A commits a snapshot whose provenance names a field that is now `pending`; the next call refuses it | The barrier is the function's own lock; the test **asserts from `pg_locks`** that the call is waiting, so the ordering is proved, not hoped |
| **T-910(b)** phantom insert in the window | A commits a snapshot omitting the new row; a subsequent complete-at-the-time call is refused `SNAPSHOT_POPULATION_INCOMPLETE` | Same barrier. The second assertion is the load-bearing one — without it the fixture only displays the residual |
| **T-910(c)** insert between the caller's read and the RPC | 409 with zero writes | Single session, sequential: same input, same verdict, every run |
| **T-910(d)** net-zero change (delete one, insert one, counts agree) | 409 — the caller's count-closure **passes** and the RPC still refuses | Single session, sequential. This is the direct evidence that B14 closes what D6 §0A.2 said the caller cannot |

All four carry `statement_timeout`/`lock_timeout` on the calling session, so a mis-sequenced run **fails loudly instead of hanging**, and all four assert pre/post counts on the three tables so a refusal is proved to have written nothing.

---

### Finding 5 — exact integration diff, validated against the surrounding SQL

**Disposition: CLOSED. Seven hunks with D2's own line anchors, each validated against the real text.**

| Hunk | Anchor | Validated against |
|---|---|---|
| **H1** declarations | after line 190 `v_scored_count integer;` | Line 188–191 read; no `v_population` is introduced, so the unassigned-variable defect cannot recur |
| **H2** V-16 | inside the `p_skipped` block, after the V-15 statement (line 345–348), before `end if;` (349) | V-13 proves type and length; V-15 proves distinctness; the `is null` arm makes the predicate two-valued |
| **H3** step 7A | between line 585 (`end if;` closing step 7) and line 587 (`-- ── 8. DERIVED FIELDS`) | `v_contributor_ids` assigned at 541, proved non-empty at 545; `v_contributor_count` at 572; `v_confidence_stored` complete at 585 |
| **H4** function comment | line 797 | The comment enumerates every guard; silence about 7A would be a control documented everywhere except where the function documents itself |
| **H5** §3.2 rule row | after line 970 | Statement order 15, keeping V-1…V-15 unmoved |
| **H6** §3.2 prose | line 975 "fourteen separate statements" | Becomes **fifteen**; the sentence's argument (statement order is guaranteed) is unaffected |
| **H7** everything else | — | V-1…V-15, step 5 duplicates, step 6 verification, step 7 drift, hash, insert, promotion, step 12, step 13, ACL block, transaction guard: **all unchanged** |

**Initialisation and duplicate-check validation, explicitly:**

- `v_contributor_ids` is a **non-empty `uuid[]`** at 7A (line 541 `array_agg(distinct …)`, guarded at 545 by `SNAPSHOT_NO_CONTRIBUTORS`), so `\|\|` and `&&` are two-valued and cannot pass by NULL.
- **`SNAPSHOT_DUPLICATE_FIELD`** (line 444) and **V-15** (line 345) still adjudicate duplicates at their original steps, so both `EXCEPT` arms receive unique-by-construction inputs. The only cross-role collision is the overlap, which 7A refuses explicitly rather than letting a union absorb it.
- `v_skipped_ids` is **coalesced to `'{}'`**, so a `null`/`[]` skip list cannot turn the overlap test into NULL.
- **`unsent` is largely redundant for contributors and must be described that way.** Step 6 already proves every contributor is an eligible row. `sent except eligible` can therefore only be non-empty because a skip id is ineligible, or because a contributor's status moved between step 6 and 7A. It is a safety net, not new provenance verification — and it is the only mechanism that resolves the skip list at all.
- **Worked example (T-811):** 5 contributors + 1 uncontracted skip = 6 eligible, disjoint ⇒ passes. **Worked example (T-801 Variant B):** 1 contributor + 2 superseded skips = 3 eligible ⇒ passes. Both would fail a mapping-completeness rule, which is finding 2's point.

**D2 verdict: YES, D2 must change — and the change is exactly H1/H2/H3 (+ H4–H6 for its own documentation). It is not made here; review stops for authorization.**

---

### Finding 6 — reconciliation of T-907…T-911 with the 101-ID register

**Disposition: CLOSED. No ID collision, no duplicated coverage, and the arithmetic is a decision rather than a fact — presented as P-2.**

**Collision check:** existing IDs run T-101…T-111, T-201…T-210b, T-301…T-315, T-401…T-414, T-501…T-517, T-601…T-606, T-701…T-706, T-801…T-811b, T-901…T-906. **T-907…T-912 are free.**

**Coverage check — is any proposed test already asserted?**

| Proposed | Nearest existing ID | Verdict |
|---|---|---|
| **T-907** skip naming a row that is not eligible (foreign document/business, `pending`, nonexistent, or a contributor's own id) | **T-303** covers contributor ids from another business/document/status; **T-315** covers p_skipped *shape* only | **New coverage.** T-303 is the contributor-side twin; neither existing ID resolves a *skip* against the table |
| **T-908** an eligible row omitted while `p_skipped` is padded to preserve the count | none — this is the B14 gap itself | **New coverage** |
| **T-909** equal cardinality, different sets | **T-305** is duplicate *ids*, not set equality against the population | **New coverage** |
| **T-910** concurrency around the reconciliation, four fixtures | Group D (T-401…T-414) covers promotion, dedupe and attribution concurrency, **not** the field population | **New coverage** |
| **T-911** identical repeat still dedupes, provenance equals the recomputed union | existing dedupe tests assert the repeat dedupes; **none** asserts it *after* a guard is placed before the dedupe lookup | **New but foldable** — the D3 convention ("T-314b/T-315b — not separate IDs, stated here so they are not invented later") prefers an added clause over a new ID |
| **V-16** malformed `p_skipped[].field` uuid | **T-315** already enumerates p_skipped shape failures, and does **not** include a malformed uuid | **Fold into T-315** — no new ID, consistent with how T-314b/T-315b were handled |

**Recommended register arithmetic (not applied): +4, not +5.**

| Option | New IDs | Folds | Register | DB-executable |
|---|---|---|---|---|
| **Recommended** | **T-907, T-908, T-909, T-910** | V-16 → **T-315**; dedupe ordering → the existing dedupe ID (T-401) | **101 → 105** | 79 → **83** |
| Alternative (as D7A R1 proposed) | T-907…T-911 | V-16 → T-315 | **101 → 106** | 79 → **84** |

Nothing is registered by this revision. If a separate ID is preferred for T-911, **T-912** is the next free number; it must not be called T-911 twice with different meanings.

**Two stale headings noticed while reconciling, recorded not fixed:** D3's Group C heading reads *(T-301 … T-313)* while the group contains **T-314 and T-315**; Group I's heading reads *(T-901 … T-906)* and will need a new ceiling if T-907+ are adopted. Both are cosmetic and belong to whichever pass registers the new IDs.

---

## 2. Policy decisions this review does **not** take

| # | Decision | Why it is not mine | What it blocks |
|---|---|---|---|
| **P-1** | **Eligible accounting only, or also mapping completeness?** Recommend **accounting only** — mapping completeness would refuse superseded duplicates and break T-801/T-811, and is a product-rule change | It changes what a valid call *is* | Nothing now; it determines whether Design C ever gets proposed |
| **P-2** | **Register arithmetic: +4 (105) or +5 (106)?** Recommend **+4** | It is bookkeeping the owner has stated a preference about before | Step 6 of the adoption checklist |
| **P-3** | **Should V-16 get its own error code?** Recommend **no** — reuse `SNAPSHOT_INVALID_SKIPPED` | Convention already set by rejecting a separate overlap code | Nothing (recommendation is implemented in R2) |
| **P-4** | **409 or 400 for `SNAPSHOT_POPULATION_INCOMPLETE`?** Recommend **409** — retryable after reload, same class as `FIELD_NOT_CONTRACTED` | It is a contract statement to callers | The caller mapping (C-1) |
| **P-5** | **Correct the caller's skip reason** (superseded rows are labelled "No destination in contract" although they have one) | It is a message change in a file this review was not asked to edit | Nothing functional; a correctness-of-language issue |
| **P-6** | **B12 remains open** — `{active, incomplete}` is a provisional self-service onboarding policy requiring explicit owner approval, unchanged in value | Already ruled provisional in Revision 7 | Endpoint deployment |

---

## 3. Remaining blockers (unchanged unless noted)

| # | Blocker | State |
|---|---|---|
| **B9** | Deployed endpoint lacks the authenticated actor boundary | **OPEN.** A-1…A-5 unfixed in the deployed file. Not moved by this revision |
| **B10** | Strict `base44_user_id` binding | **RESOLVED (policy)**, implementation inside the B9 change-set |
| **B11** | Shared resolver masks a duplicate binding via `maybeSingle` | **OPEN, out of scope.** `actor.ts` not edited |
| **B12** | Status allowlist is provisional | **OPEN — owner approval required** (P-6) |
| **B13** | Shared test project, not isolated; synthetic-only write boundary | **OPEN — written acknowledgement required before P3** |
| **B14** | Population closure | **OPEN — this revision is the proposal; D2 unchanged.** Moved from "insufficient *and* non-executing" to "specified, statically checkable, still unauthorized" |
| **B15 (new, documentation)** | Error-code inventory stated as **24 → 25** in four places; true figure **26 → 27**; D4 §6 also cites D1 for a map that now lives in D6 | **OPEN — documentation only.** Must be restated before D4 §6 is ever called verified |
| **B16 (new, documentation)** | D3 Group C heading ceiling (T-313) is two IDs short of its contents | **OPEN — cosmetic**, belongs to the registering pass |
| **B7, B2–B6, B8, F-1** | Unchanged from Revision 7 | Unchanged |

---

## 4. Separate GO / NO-GO verdicts

| Question | Verdict | Basis |
|---|---|---|
| **1. Documentation review** | **GO** | Six findings answered against source; the R1 NULL-predicate defect found and corrected; the eligible-versus-contracted distinction made explicit; the inventory arithmetic corrected from a count rather than a memory; the concurrency residual preserved and given deterministic fixtures |
| **2. Code implementation (D2 + caller)** | **NO-GO** | The patch is text. Nothing has been compiled, linted, parsed by a PL/pgSQL parser, or run. H1–H6 are six edits to a function that has never executed once, and C-1/C-2 are edits to a caller that has never been deployed |
| **3. Database execution (P3–P6)** | **NO-GO** | C1–C9 unrecorded; B13 boundary unacknowledged in writing; D2 still unedited and therefore still one guard short; the target is a **shared** project where containment is the write boundary, not the environment |
| **4. Endpoint deployment** | **NO-GO** | B9 open (T-903b/T-904 fail against the deployed file today); B12 unapproved; T-906(b) and T-910(a)/(b) need an authorized two-session window; T-910(c)/(d) need synthetic fixtures that do not yet exist |

**Dependency order: 1 → 2 → 4, with 3 independent of all three.**

---

## 5. What this turn did not do

No D2 byte edited (MD5 `93caa480de80ec621b4204bcbed898a9` unchanged). No D1, D3, D4, D6 or plan edit — every change those documents need is listed as a hunk or a checklist line, not applied. No SQL executed, prepared for execution, or sent to a parser. No Supabase project contacted. No table, view, policy, grant or row read or written. No fixture created. No test or harness run. No build or type-check attempted. No function deployed. The shared `authenticateActor` helper is untouched, and `canonicalActor.ts` still does not exist on disk.

**No certification, no runtime proof, and no claim that any guard fires.** The only behaviour observed anywhere in this package remains the three static checks in the plan, all `FAIL`.