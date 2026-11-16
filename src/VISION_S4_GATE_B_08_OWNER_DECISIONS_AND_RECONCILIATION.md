# V.I.S.I.O.N. — S4 Gate B · Deliverable 8
# Owner Decisions Recorded · B14/B15 Reconciliation · Verified Registers

**STATUS: DOCUMENTATION ONLY · D2 UNCHANGED · PATCH SEPARATE FROM D2 · NO IMPLEMENTATION OR EXECUTION AUTHORIZED**

| | |
|---|---|
| **Read** | D2 (all 1,151 lines, MD5 `93caa480de80ec621b4204bcbed898a9`) · D3 (208 lines, every test row) · D4 §6 · D6 Rev 7 · D7A R2 · D7B · plan §5.2–§5.3 |
| **Method** | Every count below is **enumerated**, not inherited: raise sites extracted from D2 by script, test IDs extracted from D3 by pattern and reconciled by group sum. Where a figure could not be reproduced it is reported as such rather than adjusted to fit. |
| **Edited this turn** | D3 (four IDs added, two folds, two headings, Revision 8 note) · D4 §6 (inventory row) · D6 §0A.3 (superseded banner) and §10 (B14 row) · plan (§5.2 heading and membership, totals, count lines) · plus D7A R2 and D7B from the previous turn. |
| **Not touched** | **D2 — no byte.** D1. D7 and D7A R1 (retained as history; their superseded figures are explained in §5). No SQL executed or parsed. No project contacted. No fixture, test or build. |

---

## 1. Owner decisions recorded

| # | Decision | Recorded as | Effect |
|---|---|---|---|
| **OD-1** | **Test register grows by four: T-907, T-908, T-909, T-910.** **T-911 is not created**; its deduplication/provenance assertion is **folded into T-401** | D3 §9 (four rows added) · D3 §4 T-401 (clause appended) · D3 header Revision 8 note | Register **101 → 105**. T-907/908/909/910 all land in Group I by ID order; Group I ceiling restated |
| **OD-1a** | **V-16 is folded into T-315**, not given an ID — following the register's own `T-314b / T-315b` precedent ("not separate IDs, stated here so they are not invented later") | D3 §3 T-315 (clause appended) | No fifth ID. Shape coverage stays in one row |
| **OD-2** | **B14 enforces complete eligible-field *accounting*, not mandatory mapping.** Every eligible accepted/corrected field appears **exactly once** in either verified contributor membership or verified skipped membership. Contract-mappable fields **may** be skipped — including superseded duplicates under `cardinality: 'one'`. **Skipped reasons remain caller-declared metadata.** No rule may force every contract-mappable field into the calculation | D7A R2 §1, §3, §8 · D7B P-1 (recommendation adopted) | Design B is a **partition** property. Design C stays refused. Verified against T-801 Variant B (3 rows → 1 contributor + 2 skips) and T-811 (5 + 1) |
| **OD-3** | **B15: the error inventory is enumerated from D2's raise sites**, with SQLSTATE, line, existing-vs-proposed, HTTP mapping and test coverage; the earlier "24" is explained; Design B must add **exactly one** code | This document §3 · D4 §6 restated · D6 §0A.3 and §10 restated | **26 existing → 27 with B14.** Confirmed by enumeration, not assumption |
| **OD-4** | **D7A Revision 1 is retained and marked SUPERSEDED.** A banner at its head says **DO NOT IMPLEMENT** and directs readers to Revision 2 as the current authoritative proposed patch. The body is deliberately **not** corrected — its defective V-16 and its "24 → 25" figure stay exactly as Revision 1 wrote them | D7A R1 head banner | R1 is historical evidence and is not deleted. **R2 remains NOT AUTHORIZED, NOT APPLIED, separate from D2** |
| **OD-5** | **B17 is resolved by planned fixtures, not by a claim of evidence.** The three unclaimed codes are covered by **variants inside existing IDs** — **T-314 (c)**, **T-901 (b)**, **T-408 (b)** — chosen because each behaviour's trigger and setup genuinely match the host row. No new ID, no register movement. Every new fixture is `NOT RUN` | D3 §3, §4, §9 · plan §5.2 B17 note · this document §2 and §7 | Register stays **105**; split stays **83 / 21 / 1**, **71 + 12**. B17 becomes **CLOSED AS PLANNED COVERAGE** |
| **OD-6** | **B12 — the profile-status allowlist `{active, incomplete}` is APPROVED as owner policy**, subject to strict identity resolution and verified business authorization; `invited`, `suspended`, `missing` and `unknown` are **denied**. Preserved as conditions, not as work to be done: strict Base44 user ID matching · no email fallback · no client-supplied actor identity · no inferred business ownership · no relaxation of RLS or service-role boundaries | D6 §0A.6, §3.3, §10 B12 · D9 §I · **D10 §0** | B12 moves **OPEN → CLOSED**. **Zero source, SQL, constant or test change**: the approved value is already `v_active_statuses := array['active','incomplete']` and T-110/T-111 already assert it. Nothing executable is authorized |
| **OD-7** | **B14 — Design B is APPROVED as the intended database population-accounting approach, not as authorization to apply it.** Six properties preserved: exact eligible-field-ID reconciliation · contributor/skipped disjointness · V-16 canonical UUID validation · single-statement population comparison · explicitly documented concurrency limitations · existing 11-parameter RPC signature | D7A R2 §2 · D6 §10 B14 · **D10 §0, §3** | B14's **design question closes**; its **implementation and execution blockers do not**. D2 remains unedited and byte-identical. AUTH-2 (SQL apply) is a separate grant and is **not** implied by this decision |

**Consequential decisions still open (`P-2`…`P-5` in D7B) are unchanged, except P-2, which OD-1 settles.** P-3 (reuse `SNAPSHOT_INVALID_SKIPPED` for V-16) and P-4 (409 for the new code) remain recommendations implemented in D7A R2. **P-5** (the caller's skip reason is inaccurate for superseded duplicates) remains unactioned and is **not** part of this authorization.

---

## 2. Verified test-register arithmetic

### 2.1 The register is 101 IDs — and a naive count says 103

`grep -o "T-[0-9]{3}[a-z]?"` over D3 returns **103** distinct strings. The two extras are **`T-314b` and `T-315b`**, which D3 line 76 declares in prose to be *"not separate IDs, stated here so they are not invented later."* Excluding them gives **101**, which is the register. Any future audit that greps for IDs will over-count by two unless it reads that line — recorded here so the mistake is not repeated.

### 2.2 The 79 / 21 / 1 split reproduces exactly

The plan's §5.2–§5.3 tables assign **every D3 ID to exactly one column**. Verified by summing the groups against D3's own ID column, not against the prose:

| Group | In D3 | Executable | Deferred | Blocked | Cross-check |
|---|---|---|---|---|---|
| A — identity | 11 | 0 | 11 | 0 | **T-108 is deferred**, not executable: it verifies the *deployed* entry file |
| B — authorization | 11 | 7 | 4 | 0 | deferred = T-207, T-208, T-209, T-210b |
| C — contract and source integrity | 16 | 16 | 0 | 0 | T-301…T-315 excluding the two `b` markers |
| D — concurrency, idempotency, promotion, attribution | 14 | 13 | 0 | **1** | T-411 blocked (B2: no injection point) |
| E — confidence | 17 | 17 | 0 | 0 | T-501…T-517 |
| F — projection disabled | 6 | 6 | 0 | 0 | T-601…T-606 |
| G — execution boundary | 6 | 5 | 1 | 0 | T-706 deferred (rollback is destructive, C9) |
| H — positive and regression | 12 | 9 | 3 | 0 | deferred = T-806, T-811, T-811b |
| I — claimed actor / result validation | 8 | 6 | 2 | 0 | deferred = **T-903, T-903c** (both need a live session) |
| **Total (Revision 7)** | **101** | **79** | **21** | **1** | 0 + 7 + 16 + 13 + 17 + 6 + 5 + 9 + 6 = **79** |

**Verdict: the 79 / 21 / 1 split is correct, and reproducible.** An earlier draft of this reconciliation suspected T-903/T-903c had been omitted from the deferred column; **the plan does include both**, and the suspicion is withdrawn.

### 2.3 After OD-1

| Group | In D3 | Executable | Deferred | Blocked |
|---|---|---|---|---|
| I | **12** (was 8) | **10** (was 6) | 2 | 0 |
| **Total** | **105** | **83** | **21** | **1** |

**83 = 71 planned `DB-PASS` + 12 planned `PARTIAL`.** The four new IDs are full database assertions with no endpoint half, so they land as `DB-PASS`, moving the pass count 67 → **71** while `PARTIAL` stays at 12. **No `PARTIAL` may be reported as a pass**, and the 21 deferred stay `NOT RUN`.

**Against the tree as it stands today the four new IDs are `NOT RUN`, not `DB-PASS`** — the control they assert does not exist until B14 is adopted, exactly as T-906(a) is `NOT RUN` against the pre-patch file rather than `DB-FAIL`. This distinction is the difference between "the guard is broken" and "the guard is absent", and the report must not blur it.

### 2.4 Reconciliations of planned PASS / PARTIAL

| State today | IDs | Note |
|---|---|---|
| `DB-FAIL` — the finding, not a defect | **T-903b**, **T-905**, **T-904(a)** | B9 and the absent strict helper; **T-904** records `PARTIAL` because (b) needs the endpoint |
| `NOT RUN` — control absent | **T-906(a)** and now **T-907…T-910** | Nothing to fail |
| `PARTIAL` — SQL half only | T-202…T-206, T-311, T-312, T-808, T-809, T-810, T-904, T-906 | 12, unchanged |
| Blocked | T-411 | B2 |
| Deferred | 21 | Groups A, B(4), G(1), H(3), I(2) |

### 2.5 One label defect, corrected

The bucket was called **"database-executable"**, but **8 of its 83 members never touch the database** — T-301, T-313, T-516, T-604, T-701, T-903b, T-905, T-906. The heading is now **"executable in this window"**, with the static checks named inside it. This is a naming correction, not an arithmetic one; membership is unchanged.

---

## 3. Verified error-code inventory

**Enumerated from D2's own `raise` statements: 42 raise sites, 26 distinct codes** (function body, lines 116–776). **The code sets are identical on both sides** — `diff` of D2's distinct raise codes against D6 §4's `RPC_ERROR_STATUS` keys returns nothing. Nothing is raised unmapped; nothing is mapped unraised.

| # | Error code | SQLSTATE | D2 site(s) | Status | HTTP | Test coverage |
|---|---|---|---|---|---|---|
| 1 | `SNAPSHOT_INVALID_INPUT` | 22023 | 215, 218 (§3 step 1) | existing | 400 | **none named** — T-810 covered it before C-4 intercepted the empty map. **Gap** |
| 2 | `SNAPSHOT_INVALID_TYPE` | 22023 | 224 (step 1) | existing | 400 | T-312 |
| 3 | `SNAPSHOT_INVALID_FIELD_MAP` | 22023 | 243, 253, 262, 284, 292, 305 (step 1.1) | existing | 500 | T-314 |
| 4 | `SNAPSHOT_OP_MISMATCH` | 22023 | 274 (step 1.1), 478 (step 6) | existing | 400 | T-306, T-314 |
| 5 | `SNAPSHOT_INVALID_SKIPPED` | 22023 | 315, 318, 323, 329, 337, 343, 347 (step 1.1) **+ V-16 proposed** | existing | 500 | T-315 (extended by OD-1a) |
| 6 | `SNAPSHOT_DOCUMENT_BUSINESS_MISMATCH` | **42501** | 358 (step 2) | existing | 404 | T-206, T-303 |
| 7 | `SNAPSHOT_YEAR_REQUIRED` | 22023 | 366 (step 3) | existing | 409 | T-311 |
| 8 | `SNAPSHOT_YEAR_IMPLAUSIBLE` | 22023 | 369 (step 3) | existing | 409 | T-311 |
| 9 | `SNAPSHOT_ACTOR_UNKNOWN` | **42501** | 379 (step 4) | existing | 403 | **none direct** — reached only by a forged `p_actor_profile_id`; T-901 proves `FORBIDDEN`, not this. **Gap** |
| 10 | `SNAPSHOT_ACTOR_STATUS_NOT_ACTIVE` | **42501** | 384 (step 4) | existing | 403 | T-110, T-111 (endpoint layer) |
| 11 | `SNAPSHOT_FORBIDDEN` | **42501** | 413 (step 4) | existing | 404 | T-901, T-202…T-205 |
| 12 | `SNAPSHOT_MAPPING_VERSION_UNSUPPORTED` | 22023 | 419 (step 5) | existing | 400 | T-307 |
| 13 | `SNAPSHOT_DOCUMENT_TYPE_UNSUPPORTED` | 22023 | 424 (step 5) | existing | 400 | T-307, T-809 |
| 14 | `SNAPSHOT_BASIS_MISMATCH` | 22023 | 427 (step 5) | existing | 400 | T-307 |
| 15 | `SNAPSHOT_DUPLICATE_TARGET` | 22023 | 432 (step 5) | existing | 400 | T-305 |
| 16 | `SNAPSHOT_TARGET_NOT_IN_CONTRACT` | 22023 | 441 (step 5) | existing | 400 | T-304 |
| 17 | `SNAPSHOT_DUPLICATE_FIELD` | 22023 | 448 (step 5) | existing | 400 | T-305 |
| 18 | `SNAPSHOT_INVALID_TARGET` | 22023 | 459, 469, 485 (step 6) | existing | 400 | T-306 |
| 19 | `SNAPSHOT_RESERVED_METADATA_KEY` | 22023 | 462, 466 (step 6) | existing | 400 | T-304, T-313 — **unreachable by construction** (T-313 proves the intersection is empty), so coverage is a proof, not a fixture |
| 20 | `SNAPSHOT_CARDINALITY_VIOLATION` | 22023 | 488 (step 6) | existing | 400 | T-306 |
| 21 | `SNAPSHOT_FIELD_NOT_CONTRACTED` | **42501** | 507 (step 6) | existing | 409 | T-302, T-303, and T-910(a) |
| 22 | `SNAPSHOT_FIELD_VALUE_MISSING` | 22023 | 512 (step 6) | existing | 400 | T-308 |
| 23 | `SNAPSHOT_NO_CONTRIBUTORS` | 22023 | 546 (step 7) | existing | 400 | T-509 |
| 24 | `SNAPSHOT_CONTRIBUTOR_DRIFT` | **42501** | 576 (step 7) | existing | 409 | T-508 |
| 25 | `SNAPSHOT_DEDUPE_TYPE_MISMATCH` | 22023 | 627 (step 10) | existing | 500 | **none** — no fixture provokes it. **Gap** |
| 26 | `SNAPSHOT_IDENTITY_LOST` | 22023 | 683 (step 10 tripwire) | existing | 500 | T-413 |
| **27** | **`SNAPSHOT_POPULATION_INCOMPLETE`** | **22023** | **step 7A, two sites (overlap, and the two-direction difference)** — *proposed* | **proposed** | **409** (proposed, D7A R2 C-1) | **T-907, T-908, T-909, T-910** |

**SQLSTATE distribution:** `22023` × 21, `42501` × 6. Total **27**.
**Raise sites:** 42 today; **44** with B14's two — but still **one** distinct code, because both sites raise the same name and V-16 reuses an existing one.

### 3.1 Why the earlier documents said 24

**26 − 2 = 24, and the two are identifiable:** `SNAPSHOT_INVALID_FIELD_MAP` and `SNAPSHOT_INVALID_SKIPPED`. Both are **exclusive to D2 §3 step 1.1** — verified by line range: every occurrence of the first falls in 243–305 and of the second in 315–347, with no other site anywhere in the function. That block **arrived in Revision 4**, together with T-314 and T-315, and D6's own map labels those two entries *"PAYLOAD-SHAPE CODES (D2 §3 step 1.1)"* — i.e. the document itself records that they were added later.

So the "24" is a **pre-Revision-4 figure carried forward through Revisions 5, 6 and 7 without recalculation.** Revision 4 added the two codes *and* their mappings (C-7) — the map grew to 26 while the counted figure stayed at 24. The claim the figure was attached to ("identical sets") remained **true throughout**; only the number was stale. That is why no test or code ever failed because of it, and why it survived four revisions: a correct assertion wearing a wrong count is the hardest kind of error to notice.

### 3.2 Does Design B introduce exactly one new code? — **Yes, and it was checked, not assumed**

- Step 7A raises `SNAPSHOT_POPULATION_INCOMPLETE` at **two** sites (overlap; two-direction difference) → **one** distinct code, two messages.
- **V-16 does not add a code** — it reuses `SNAPSHOT_INVALID_SKIPPED`, already inventoried and already mapped to 500.
- Therefore **26 existing + 1 = 27**, and the new code needs **two** caller entries (status **409** and a message string, because `mapRpcError` would otherwise deliver the literal "Request rejected").

---

## 4. Reconciliation — what was wrong, what was changed, what remains

### 4.1 Applied this turn

| # | Document | Change |
|---|---|---|
| 1 | **D3** | Four IDs **T-907…T-910** added to Group I with full expectations; **T-401** gains the folded dedupe/provenance assertion; **T-315** gains the V-16 clause; Group C ceiling corrected **T-313 → T-315** (it had been two short of its own contents); Group I ceiling **T-906 → T-910**; Revision 8 note recording OD-1, OD-1a, the 83/21/1 split, 71 + 12, and that the four new IDs are `NOT RUN` until B14 is adopted |
| 2 | **D4 §6** | Inventory row restated: **26 codes, identical sets**, counted from D2's 42 raise sites; the 24 explained; **27 with B14**; and the stale cross-reference **"in D1"** corrected to **D6 §4**, since D1 §3 is withdrawn and the map moved |
| 3 | **D6 §0A.3** | The count proposal is now headed **SUPERSEDED BY REVISION 2**: it cannot fire (`v_contributor_count` is assigned at line 572, after the insertion point it names) and is bypassable; the block is retained as history and repointed to D7A R2 |
| 4 | **D6 §0A.3 Cost row, §10 B14 row** | **24 → 25** corrected to **26 → 27**, with the design repointed to Design B |
| 5 | **Plan** | **§5.2** heading → "Executable in this window — 83 IDs", with the static-check caveat; Group I membership 6 → 10; totals table 101/79/21/1 → **105/83/21/1**; "67 + 12 = 79" → **"71 + 12 = 83"**; the count lines in §0.1, §5.5, the artifact index and the P7 reporting rule |

### 4.2 Contradictions that remain, and who must clear them

| # | Contradiction | Where | Owner action |
|---|---|---|---|
| **X-1** | **D7A R1 and D7B still carry "24 → 25"** and R1 carries the defective V-16. They are **history**, and D7A R2 says so at its head — but a reader who opens R1 first can act on it | D7A R1 §9, §4; D7B §1 finding 3 | Authorize a **superseded banner** at the head of D7A R1. Deliberately **not** applied: rewriting an artifact after it has been cited as evidence is how audit trails stop being evidence |
| **X-2** | **D6 §10's B14 row still describes the design as the count comparison** in its detail sentence, even with the figure and pointer corrected | D6 §10 | **RESOLVED (Revision 9)** — the row's design clause now states Design B (step 7A set reconciliation, overlap rule, V-16, one code → 409 with a required message entry) and points at D7A R2. **B14 stays OPEN**: only the description changed, so no policy moved |
| **X-3** | **Three error codes have no named test**: `SNAPSHOT_INVALID_INPUT`, `SNAPSHOT_ACTOR_UNKNOWN`, `SNAPSHOT_DEDUPE_TYPE_MISMATCH`. The first lost its only claimant when C-4 began intercepting the empty map | D3 | **RESOLVED (Revision 9, OD-5)** — covered by **T-314 (c)**, **T-901 (b)** and **T-408 (b)**, no ID added. All three fixtures are `NOT RUN`, and their host IDs cannot be reported `DB-PASS` until they run |
| **X-4** | **T-108 and T-903b overlap**: T-108's clause set largely duplicates T-903b, and the plan flags the overlap without resolving it | D3 §1, §9; plan §5.3 | Fold or differentiate. Not a count problem — both IDs already exist and are counted once each |
| **X-5** | **T-517 is data-dependent**: it expects `valid = 80, no_score = 168, unusable = 0` on a specific row population. On a shared test project that baseline can drift and the test would fail for a reason unrelated to the migration | D3 §5 | Re-baseline at execution time (the plan says so in Appendix A); must not be reported as a regression |
| **X-6** | **`p_skipped` reasons are inaccurate for superseded duplicates** — the caller writes "No destination in contract" for rows that have one (D7B P-5) | D6 §4 | **RESOLVED (Revision 9)** — the proposed caller's reason now reads `Not selected for mapping (<version>)`, true for both causes, with a comment recording why. Zero behavioural effect: the reason is caller-declared metadata, never adjudicated, and no test asserts its text |
| **X-7** | **The V-16 cast dependency is stated in D7A R2 but not yet in D2** — until H2 is applied, step 7A's `::uuid` is reachable from unvalidated input | D7A R2 H2/H3 | Nothing to do now: H2 and H3 are one change. Recorded so they are never applied apart |

---

## 5. Remaining blockers

| # | Blocker | State after this turn |
|---|---|---|
| **B9** | Deployed endpoint lacks the authenticated actor boundary | **OPEN** — untouched |
| **B10** | Strict `base44_user_id` binding | **RESOLVED (policy)**; implementation inside the B9 change-set |
| **B11** | Shared resolver masks a duplicate binding | **OPEN, out of scope** — `actor.ts` unedited |
| **B12** | Status allowlist is provisional | **OPEN — owner approval required.** Unchanged; T-110/T-111 keep their expectations |
| **B13** | Shared project; synthetic-only write boundary | **OPEN — written acknowledgement required before P3** |
| **B14** | Population closure | **OPEN — specified and authorized in scope (OD-2), not applied.** D2 unchanged; the patch is separate and unapproved for execution |
| **B15** | Error inventory | **CLOSED as documentation** — 26 → 27 verified, D4/D6/plan restated. The **caller** mapping (409 + message) remains part of the unapproved change-set |
| **B16** | Register arithmetic | **CLOSED** — 105 / 83 / 21 / 1 verified by enumeration; heading label corrected |
| **B17** | **Three codes with no named test** (X-3) | **CLOSED AS PLANNED COVERAGE (OD-5)** — fixtures written into T-314 (c), T-901 (b), T-408 (b), all `NOT RUN`. **Not closed as evidence:** planned coverage is not an executed result, and an ID carrying a `NOT RUN` fixture cannot be reported `DB-PASS` |
| **B7, B2–B6, B8, F-1** | Unchanged from Revision 7 | Unchanged |

---

## 6. Verdicts

| Question | Verdict | Basis |
|---|---|---|
| **Documentation review** | **GO** | OD-1/OD-1a/OD-2/OD-3/OD-4/OD-5 are recorded, the register reproduces by enumeration, the inventory is counted from 42 raise sites with SQLState and line, the "24" is explained rather than overwritten, and every figure changed in D3/D4/D6/plan is traceable to the source it came from |
| **Implementation** | **NO-GO** | D7A R2's H1–H6 and C-1/C-2 are text. Nothing has been compiled, linted or parsed. Six edits to a function that has never executed |
| **Database execution** | **NO-GO** | D2 unedited and therefore still one guard short; C1–C9 unrecorded; B13 boundary unacknowledged; four new tests are `NOT RUN` precisely because the control they assert does not exist |
| **Deployment** | **NO-GO** | B9 open (T-903b/T-904 fail against the deployed file today); B12 unapproved; T-910(a)/(b) need an authorized two-session window; three registered codes still have no fixture |

## 7. B17 fixture matrix (OD-5) — **planned coverage, nothing executed**

Three codes, three existing hosts. **No ID added: 105 stays 105, 83 / 21 / 1 stays put, 71 + 12 stays put.** Each host carries its older fixtures unchanged; the new fixture is additive inside the row.

| Code | Host | Exact triggering input or database state | Expected code · SQLSTATE | Endpoint HTTP | Snapshot / latest / dashboard / audit | Class | Synthetic boundary |
|---|---|---|---|---|---|---|---|
| `SNAPSHOT_INVALID_INPUT` | **T-314 (c)** | *(1)* `p_field_map` = a JSON **object** · *(2)* = a JSON **string** · *(3)* `p_field_map = '[]'::jsonb` · *(4–7)* each of `p_business_id`, `p_source_document_id`, `p_actor_profile_id`, `p_mapping_version` passed **NULL** in turn, everything else valid | `SNAPSHOT_INVALID_INPUT` · **22023** | **None — not endpoint-reachable.** The endpoint's own validation returns its 400 before the RPC, so there is no HTTP observation for this branch | **Zero** snapshot rows · **no** `is_latest` change · **zero** dashboard rows · **zero** audit rows. The raise precedes every read and every write | **Database-executable** (direct RPC, service key) | No fixture rows needed: the refusal fires before any table is read. Nothing to tear down; assert counts unchanged |
| `SNAPSHOT_ACTOR_UNKNOWN` | **T-901 (b)** | `p_actor_profile_id` = a **well-formed uuid with no `profiles` row**, every other argument valid (real business, real document, authorized relationship otherwise satisfied) | `SNAPSHOT_ACTOR_UNKNOWN` · **42501** | **None — not endpoint-reachable.** The endpoint supplies a session-resolved `actor.profile_id`, which by construction exists | **Zero** snapshot rows · **no** `is_latest` change · **zero** dashboard rows · **zero** audit rows. Step 4's profile read is the first thing that can succeed or fail, and it fails | **Database-executable** (direct RPC) | The uuid must be generated per run and asserted absent before the call, then asserted still absent after — proving the function did not create a profile. No teardown |
| `SNAPSHOT_DEDUPE_TYPE_MISMATCH` | **T-408 (b)** | Three steps: *(i)* valid T-801 call on synthetic business *B* → row *R*, `metadata.content_hash = H`, `snapshot_type = 'historical'`; *(ii)* `update business_metric_snapshots set snapshot_type = 'tax_year' where id = R` — `metadata`, and therefore *H*, untouched; *(iii)* resubmit the **identical** field set with `p_snapshot_type = 'historical'` | `SNAPSHOT_DEDUPE_TYPE_MISMATCH` · **22023** | **None — not endpoint-reachable.** The endpoint cannot produce a hash inconsistent with its own type; the divergence must be planted, which is why the invariant is only testable against a tampered row | **Zero new** snapshot rows · *R* **not modified by the call** (the raise precedes every write) · *B*'s `is_latest` set unchanged · **zero** dashboard rows · **zero** audit rows | **Database-executable** (direct RPC) with one planted row | Creates synthetic business *B*, its document and field rows, and row *R* under the plan's synthetic-only boundary (§3); the `update` in step *(ii)* touches **only** *R*. **Teardown deletes *R*, the document, the fields and *B*, and verifies the pre-suite counts return** |

### 7.1 Why variants and not new IDs

Each of the three behaviours shares its host's **trigger and setup**, not merely its error family: T-314 is already the row that feeds one hostile `p_field_map` delivery per fixture and asserts zero writes, so the root-shape and NULL-argument deliveries belong in it — and they prove the **ordering** of step 1 against step 1.1, which is a property of that row's own subject. T-901 is already the row that varies `p_actor_profile_id` and reads the resulting refusal code, so a nonexistent claim is its fourth data point and the one that distinguishes `ACTOR_UNKNOWN` from `FORBIDDEN`. T-408 is already the row about what `snapshot_type` does and does not change, so the planted divergence is its complement. **No new ID would have carried a behaviour none of these rows already own.**

### 7.2 What B17 closure does and does not mean

**It means:** every code D2 can raise now has a written, classified, executable-or-deferred fixture naming its trigger, its code and SQLSTATE, its HTTP reachability, its four-table effect and its setup boundary. The inventory in §3 no longer has three blank rows.

**It does not mean:** that any of it has run. All three are **`NOT RUN`**, and — the point most likely to be lost — **T-314, T-901 and T-408 are planned `DB-PASS` but are no longer passable on their older fixtures alone.** A row whose new fixture has not executed must be reported `PARTIAL`/`NOT RUN` for the unrun fixture, never `DB-PASS` on the strength of what already passed. This is the difference between *coverage written* and *coverage demonstrated*, and the reporting rule in plan §5.2 now carries it.

### 7.3 Preservation of the B14 policy

**OD-2 is untouched by this pass.** B14 still requires every eligible field to be accounted for **exactly once** as a verified contributor or a verified skip; superseded duplicates may be skipped; skip reasons remain **caller-declared** metadata and are never adjudicated by the function. Nothing in OD-4 or OD-5 changes D7A R2's Design B, its V-16 rule, the overlap rule, or the single new code. **D2 remains byte-identical** (MD5 `93caa480de80ec621b4204bcbed898a9`), and the patch remains a separate, unauthorized artifact.

**One sentence:** the register and the inventory now both reconcile from source — 105 IDs, 27 codes, 83 / 21 / 1, and no code left without a named test — but every figure still describes **text that has never run**, so the package closes its documentation and opens nothing else.