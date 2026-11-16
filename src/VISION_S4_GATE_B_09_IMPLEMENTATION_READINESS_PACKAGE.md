# V.I.S.I.O.N. — S4 Gate B · Deliverable 9
# FINAL CONSOLIDATED IMPLEMENTATION READINESS PACKAGE

**STATUS: DOCUMENTATION AND STATIC REVIEW ONLY · NOTHING EXECUTABLE CHANGED · D2 BYTE-IDENTICAL · NO AUTHORIZATION GRANTED**

| | |
|---|---|
| **Sources read** | D1 · **D2** (MD5 `93caa480de80ec621b4204bcbed898a9`, 1,151 lines, unchanged) · D3 Revision 9 (all 105 rows) · D4 · D6 Revision 7 · D7 · **D7A R2** (all 316 lines, H1–H7 and C-1–C4) · D8 · Execution Safety Plan (C1–C9, P0–P9, S1–S18, L0–L3) |
| **Static checks run** | Read-only enumeration only: ID rows by leading position, `raise exception` sites by line, distinct code names, file existence under `base44/`. **No SQL executed or prepared for execution. No connection to any project. No test run. No fixture created. No file under `base44/` or `src/` edited except documentation.** |
| **Documentation edited this turn** | D3 (**T-408(b)** isolation hardening) · D6 §4 (skip-reason wording, **X-6**) · D6 §10 (**B14** row restated to Design B, **X-2**) · D8 (X-2, X-6 closed) · this file |
| **Deliberately not retyped** | The **SQL of H1, H2 and H3**. Retyping a patch into a second document is how Revision 1's defects survived four revisions — there would then be two texts and no way to tell which one was authorized. **D7A R2 §2 is the single source of the patch text**; this package addresses it by anchor and asserts what each hunk must contain. |

---

## A. Consolidated D2 change set — Design B (B14)

**Nine hunks, six of them edits and three of them one-line.** D7A R2 is the authoritative text; the line numbers below are **Revision-4 anchors**, not apply-order.

| Hunk | Anchor in D2 | What it adds | Kind | Raises |
|---|---|---|---|---|
| **H1** | after line 190 (`v_scored_count integer;`) | `v_skipped_ids uuid[]` · `v_unmapped uuid[]` · `v_unsent uuid[]` — **and no count variable**, because Design B never counts | declarations (3) | — |
| **H2** | inside `if p_skipped is not null then`, **after** V-15, before `end if;` (lines 345–349) | **V-16**: every `p_skipped[].field` is a canonical uuid — `length(...) <> 36` **or** the non-match **or** `s->>'field' is null` | one statement | reuses `SNAPSHOT_INVALID_SKIPPED` |
| **H3(a)** | step 7A, after line 585 | one cast of the skip ids: `coalesce(array_agg((s->>'field')::uuid), '{}')` — safe only because V-13 (string), V-15 (distinct) and V-16 (canonical) precede it | one statement | — |
| **H3(b)** | step 7A | **overlap rule**: `v_skipped_ids && v_contributor_ids` → a field both mapped and skipped is contradictory and is refused, not absorbed by a union | one statement | **`SNAPSHOT_POPULATION_INCOMPLETE`** |
| **H3(c)** | step 7A, before step 8 (line 587) | **the reconciliation**: `eligible EXCEPT sent` **and** `sent EXCEPT eligible` produced by **one** statement, then `array_agg(...) filter (...)` into the two arrays; refuse if either is non-null | one CTE statement | **`SNAPSHOT_POPULATION_INCOMPLETE`** |
| **H4** | line 797 (function comment) | one sentence: every eligible accepted/corrected field must be accounted for as contributor or skipped, reconciled in one statement inside the transaction | prose | — |
| **H5** | §3.2 rule table, after the V-15 row (line 970) | the **V-16** row | table row | — |
| **H6** | §3.2 prose (line 975) | "fourteen" → "**fifteen**" separate statements | one word | — |
| **H7** | everything else | **no change** — V-1…V-15, step 5 duplicates, step 6 contributors, step 7 drift, hash, insert, promotion, steps 12–13, ACL block, transaction guard | — | — |

**Error inventory after B14:** one new code, `SNAPSHOT_POPULATION_INCOMPLETE` → **409**, **two raise sites**, **two** required caller-map entries (status + message). Raise sites in the function body go **42 → 44**; distinct codes **26 → 27**. V-16 adds a **third** raise site but **no** code, because it reuses `SNAPSHOT_INVALID_SKIPPED`.

### A.1 Four properties that make the change set safe to apply

1. **It cannot fire before its inputs exist.** 7A sits after `v_contributor_ids` is built (line 541) and after step 7's drift guard, so `v_contributor_ids` is a non-empty `uuid[]` at 7A — which is why `||` and `&&` are two-valued there and why R1's NULL-predicate class cannot recur.
2. **It precedes the hash and the dedupe.** A refused call derives no `content_hash`, acquires no advisory lock and writes nothing, so an identical-content retry remains idempotent through dedupe exactly as today.
3. **Both difference directions come from one snapshot.** The two preparatory statements read one source each; only the single reconciling statement compares them. Under READ COMMITTED every other read in this function sees a different snapshot — 7A is the one place that must not.
4. **It is additive to the object surface.** No signature change, so the `revoke`/`grant` block, the ACL guard's six function expectations and the `regprocedure` literals are untouched.

### A.2 An apply-order hazard, recorded because it will otherwise bite

The anchors are **line numbers from the version the review read**. Applying H1…H6 top-to-bottom invalidates every anchor below the first edit. **Apply in descending line order — H6, H5, H4, H3, H2, H1 — or locate each anchor by its text, never by the number.** Any patch application that trusts the numbers produces a misplaced 7A, which is indistinguishable from R1's defect at review time.

---

## B. Consolidated D6 change set

| Item | Location | Change | State |
|---|---|---|---|
| **F-1** | §4 step 4a | `p_skipped` entries are **`{field, reason}`** where `field` carries the field **id**; the response maps back to `{field_id, reason}` | proposed in text |
| **F-3** | §3.2 | allowlist stays **`{active, incomplete}`**, `incomplete` being the column default — recorded as a decision with its reason, not an oversight | proposed in text |
| **Strict actor identity** | §2, §3 | **new file** `base44/shared/authz/canonicalActor.ts`: `.eq('base44_user_id')` exactly once, **no email predicate at all**, `.maybeSingle()`/`.single()` = 0, list + exactly-one-row rule, `ADMIN_ROLES` imported not re-declared, no write verbs. The shared `authenticateActor` is **not** touched (B11 out of scope) | proposed in text |
| **Caller** | §4 | full replacement of `createSnapshotFromReviewedFields/entry.ts`, including `resolveCanonicalActor` called exactly once, `actor.profile_id` sourced once, no body-supplied identity, no direct write to `business_metric_snapshots` | proposed in text |
| **Safe pagination (R7-2)** | §4 step 4 | `count: 'exact', head: true` drives the loop; named `FIELD_PAGE_SIZE`/`MAX_FIELD_PAGES`/`MAX_FIELDS`/`MAX_SKIPPED`; duplicate-id `Set`; a **second** count after the read; a cap is a **409**, never a 500 and never silent truncation | proposed in text |
| **Deterministic comparator (R7-1)** | §4 step 4 | the timestamp helper **classifies** (`{ok, ms}`) instead of returning a numeric sentinel; the chain contains **no subtraction**, so no `-Infinity − (-Infinity)` → `NaN`; every comparison returns `-1`/`0`/`1`; absent and malformed are the same kind; final tie-break on `id` | proposed in text |
| **RPC result validation (R7-3)** | §4 step 6 | before the success object is built: `result` a non-array object · `snapshot_id` against `UUID_PATTERN` · `snapshot_type` a non-empty string (**not** against `SNAPSHOT_TYPES` — a dedupe echoes the stored type) · four booleans · `applied` a non-empty object · `skipped` an array of `{field, reason}` · `confidence_score` null-or-0…100 · `dashboard_skipped_reason` null-or-string. **Zero** `result?.` reads reach the success object | proposed in text |
| **B14 error mapping (C-1)** | `RPC_ERROR_STATUS` | `SNAPSHOT_POPULATION_INCOMPLETE: 409` | proposed in D7A R2 §4 |
| **B14 error message (C-2)** | `RPC_ERROR_MESSAGES` | *"The reviewed fields changed while this snapshot was being prepared. Reload and try again."* — **required**, because `mapRpcError` falls back to the literal "Request rejected" | proposed in D7A R2 §4 |
| **C-3** | where the map is declared | a note, no code: the matcher is **substring, in key order**, so **a new code name must never contain an existing code name** | proposed in text |
| **C-4** | — | **not** changed: `resultFault`'s `skipped` check, `MAX_SKIPPED`, the 4a–4e count-closure read, the V-1…V-15 → 500 class | stated |
| **X-6** | §4 step 4a | skip reason becomes `Not selected for mapping (<version>)` — true for both causes — with a comment saying why | **reconciled this turn** |

**Nothing in this table is deployed, built or executed.** The deployed entry file is **328 lines today**; the §4 replacement is a whole-file replacement, so the review surface is the entire file, not a diff.

---

## C. Verification of the two registers

### C.1 The 105-test register

Counted from **row-leading positions** (`^| **T-nnn…**`), which is the only count that matches registered rows:

| Group | A | B | C | D | E | F | G | H | I | **Total** |
|---|---|---|---|---|---|---|---|---|---|---|
| IDs | 11 | 11 | 16 | 14 | 17 | 6 | 6 | 12 | 12 | **105** |

Duplicates: **none**. Suffixed IDs: `T-210b`, `T-306b`, `T-811b`, `T-903b`, `T-903c`.

**Two traps, both live, both recorded so a future audit does not "correct" a correct number:**
- `grep -c "^| \*\*T-"` returns **106**, because the declaration row *"T-314b / T-315b — not separate IDs"* also begins with a table cell. **105 is right; 106 counts a signpost.**
- `grep -o "T-[0-9]{3}[a-z]?"` returns **108** distinct strings: the 105 IDs plus the two prose markers plus one further in-text reference. **105 is right; 108 counts prose.**

Split: **83 executable / 21 deferred / 1 blocked**, of which **71 planned `DB-PASS` + 12 `PARTIAL`**. Revision 9 adds **zero** IDs.

### C.2 The 27-code inventory

| Measure | Value | How it was taken |
|---|---|---|
| `raise exception` in the **function body** (lines 116–776) | **42** | line-filtered |
| `raise exception` **file-wide** | **43** | the extra is **line 911**, inside documentation prose — *not a raise site*; a naive grep overstates by one |
| Distinct codes **existing** | **26** | `SNAPSHOT_[A-Z_]+`, unique |
| Distinct codes **proposed** | **1** | `SNAPSHOT_POPULATION_INCOMPLETE` |
| **Total with B14** | **27** | 26 + 1 |
| Raise sites with B14 | **44 → 45** | +2 from H3, +1 from V-16 (reusing an existing code) |
| SQLSTATE split (all 27) | `22023` × 21, `42501` × 6 | per-site enumeration |
| D2's set vs the `RPC_ERROR_STATUS` keys | **identical** | both directions checked; nothing raised unmapped, nothing mapped unraised |

**Verified, not inherited.** The earlier figure of 24 was 26 − 2, the two step-1.1 codes added in Revision 4 and never re-counted; that reconciliation stands (D8 §3.1) and every document now carries the correct arithmetic.

---

## D. T-408(b) isolation review — and the hardening now written into D3

**Finding D-1 — the original phrasing was under-specified, and one word made it unsafe.** *"Plant the divergence by updating `R`'s `snapshot_type`"* presumes `R` is the fixture's own row. On a **shared** project (B13) that presumption is exactly the assumption that fails silently: the dedupe lookup is `where business_id = p_business_id and metadata->>'content_hash' = v_content_hash **limit 1**`, so if any pre-existing row of that business shared the hash, the fixture would mutate **someone else's evidence** and still appear to pass.

**Finding D-2 — the fixture is the plan's only direct DML against `business_metric_snapshots`.** Every other test writes through the function. That makes it the single place where a scope mistake reaches pre-existing data, which is why the fence has to be explicit rather than implied.

**Finding D-3 — its teardown is a destructive act.** Deleting the synthetic snapshot is precisely what **C9** reserves separate authorization for. The fixture therefore cannot clean up inside the window without C9; absent it, `R` stays as declared residue.

**Hardened requirements — now part of T-408(b) in D3, four preconditions and a fence:**

| # | Requirement | Why |
|---|---|---|
| **P1** | *B* is created **by this fixture**, and `count(*)` over `business_metric_snapshots where business_id = B` is **0** before the call | the dedupe `limit 1` then has exactly one candidate; residue from an earlier run **aborts** the fixture instead of being reused |
| **P2** | *R*'s id is asserted **absent** from the pre-run capture of the **72** pre-existing rows (probe 2) | *R* must be **newly created and synthetic**; the fixture refuses to run otherwise |
| **P3** | Before mutating: captured and asserted — `id = R`, `business_id = B`, `metadata.content_hash = H`, `snapshot_type = 'historical'`, `created_at` inside the fixture window | identity is **checked**, not assumed from ordering |
| **P4** | The `update` carries **two** predicates — `where id = R and business_id = B` — and must return **rowcount = 1**; anything else aborts before the resubmission | the fence cannot reach a row outside *B*, and a partial match is an error, not a shrug |

**Resulting property:** no pre-existing snapshot is updated, locked or selected `for update` anywhere in the plan; the fixture's own row is created, renamed, refused against, and retained as residue unless C9 authorizes its deletion. **Still `NOT RUN`.**

---

## E. X-2 and X-6 — both now closed, no policy moved

| # | Was | Now | Policy effect |
|---|---|---|---|
| **X-2** | D6 §10's **B14** row still described the design as the `count(*)` comparison | Row restated as **Design B** (single-statement set reconciliation, overlap rule, V-16, one code → **409** with a **required** message entry) and repointed to D7A R2 | **None.** B14 remains **OPEN**; only its description changed |
| **X-6** | The proposed caller wrote *"No destination in contract"* for **every** skip — inaccurate for a superseded duplicate, which has a destination it was not selected for | Now `Not selected for mapping (<version>)`, true for both causes, with a comment recording the reason | **None.** The reason is **caller-declared metadata**, never adjudicated by D2; no test asserts its text; T-811/T-806/T-414 assert only that a `reason` is present |

**B14 policy preserved exactly (OD-2):** every eligible field accounted for **exactly once** as a verified contributor or a verified skip · superseded duplicates **may** be skipped · skip reasons remain **caller-declared**. Worked examples unchanged: T-811 (5 + 1 = 6 eligible) passes; T-801 Variant B (1 + 2 = 3 eligible) passes.

---

## F. Dependency order

```
A. Documentation             ✅ complete (this package)
        │
        ├─ B1. D2 edited in place (H1–H7, descending line order)
        │        │
        ├─ B2. Caller authored: canonicalActor.ts (new) + entry.ts (replace)
        │        │   ↳ C-1/C-2 live in entry.ts, so they land with B2, not after
        │        ▼
        ├─ C.  C1–C9 recorded · B13 acknowledged · B12 decided
        │        │
        │        ▼
        ├─ P3. Migration applied by the schema-owner channel (write-capable, transactional)
        ├─ P4./P5. RPC-level checks against synthetic fixtures
        │        │
        ├─ B3. Deployed: entry.ts + canonicalActor.ts  (B9 closes only here)
        │        ▼
        ├─ P7. Endpoint tests (T-903b, T-904, T-905, T-906a, T-111, T-903c)
        └─ P8./P9. Teardown decision — C9 only; nothing destroyed in-window
```

**Hard ordering constraints, each with the reason it is hard:**

1. **B2 before P7, never after** — the endpoint cannot be proven while B9 is open, and B9 closes only when the replacement is deployed.
2. **C-1/C-2 in the same change as H3(c)** — a 409 with no message entry reaches the user as the string "Request rejected"; shipping the guard without the message would be a visible regression on the refusal path.
3. **H2 (V-16) and H3(c) in the same migration** — 7A's `::uuid` cast is reachable from unvalidated input otherwise. They are one change, applied together, or neither.
4. **C1–C9 before P3** — the plan's S1 freezes any window with an unrecorded precondition.
5. **Nothing destroys anything without C9**, including a synthetic snapshot's teardown (D-3).

---

## G. File-by-file change manifest

**Nothing below has been changed. This is the manifest an authorized change would follow.**

| # | Path | Action | Source of truth | Gate | Verification after |
|---|---|---|---|---|---|
| 1 | `src/VISION_S4_GATE_B_02_SQL_MIGRATION.md` | **edit** — H1–H7 (descending line order) | D7A R2 §2 | B14 + owner edit | 44 body raise sites · 27 codes · `s4_mapping_contract` untouched · T-701 still passes |
| 2 | `base44/shared/authz/canonicalActor.ts` | **create** | D6 §3 | B10 policy (resolved) | T-905 fingerprint |
| 3 | `base44/functions/createSnapshotFromReviewedFields/entry.ts` | **replace** (328 lines → proposed) | D6 §4 | B9 | T-108 · T-903b · T-904(a) · T-906(a) |
| 4 | `base44/shared/authz/actor.ts` | **unchanged** | B11 out of scope | — | none — deliberately untouched |
| 5 | Caller's `RPC_ERROR_STATUS` / `RPC_ERROR_MESSAGES` | **edit, inside file 3** | D7A R2 §4 C-1/C-2 | with file 3 | T-907…T-910 surface **409** with the real message |
| 6 | `src/VISION_S4_GATE_B_03_TEST_PLAN.md` | **edit** — T-408(b) P1–P4 | this package §D | docs only | re-read |
| 7 | `src/VISION_S4_GATE_B_06_STRICT_IDENTITY.md` | **edit** — X-2, X-6 | this package §E | docs only | re-read |
| 8 | `src/VISION_S4_GATE_B_08_…md`, `…_09_…md` | **edit / create** | this package | docs only | — |
| — | `package.json`, `tailwind.config.js`, entities, other functions | **no change** | — | — | — |

**Blast radius: 2 executable files, 1 of them new. No schema object other than the three the migration creates. No entity, no config, no dependency.**

---

## H. Four readiness verdicts

| Stage | Verdict | What is true now | What would have to be true |
|---|---|---|---|
| **1. Documentation readiness** | **GO** | 105 IDs and 27 codes both reconcile from source · every code has a named fixture · B14 is specified to the statement · X-2 and X-6 closed · no figure in the package is inherited from prose | nothing further — this is the stage this package completes |
| **2. Source-code modification readiness** | **NO-GO** | The change set is fully specified and anchored; the two hunks that must move together are identified | **B14 direction approved (OD-7)**; what is missing is the **AUTH-1 signature** to edit the two source files, and **AUTH-2** to edit D2 · **B12 decided (OD-6)**, no code change follows from it · **B9** is closed *by* AUTH-1, so it is no longer an independent blocker · C-1/C-2 accepted as part of the same change |
| **3. Shared-test database execution readiness** | **NO-GO** | The fixtures are specified, classified and isolated; the boundary is synthetic-only | **C1–C9 all recorded** (every one is `AWAITING`) · **B13** acknowledged in writing · a **write-capable transactional channel** named (C3) — the connector holds `database:read` only · T-408(b)'s teardown decided under **C9** |
| **4. Endpoint deployment readiness** | **NO-GO** | The replacement is written in text; the tests that judge it exist | **B9** fixed and deployed · **B12** decided (7 of 8 live profiles are `incomplete`) · P3–P6 passed first · a two-session window authorized for T-910(a)/(b) |

**Independent assessment:** the documentation is now internally consistent and evidence-clean. The reason three of four stages remain **NO-GO** is not a documentation defect — it is that **every artifact describes text that has never run**, and the only observed behaviour in the whole package is three static checks, all `FAIL`. Writing a good plan does not move that number.

---

## I. Approvals and prerequisites still required

| Item | State | Blocks | Note |
|---|---|---|---|
| **C1** owner authorization naming the host project | **AWAITING** | P3 | overrides D4 §1's default stop |
| **C2** written confirmation it is not production | **AWAITING** | P3 | refs differ; only the ref distinguishes them |
| **C3** named write-capable transactional channel + operator | **AWAITING** | P3 | the connector is `database:read` only — a channel whose transaction support is merely *asserted* is a stop condition |
| **C4** acceptance of the retention limit | **AWAITING** | P3, P9 | `ON DELETE RESTRICT` + append-only |
| **C5** promotion never targets a real business | **AWAITING** | P4/P5 | promotion demotes an existing row; rollback cannot reconstruct it |
| **C6** fixtures authorized as S4-scoped creates | **AWAITING** | all fixtures | no seeding, backfill, year-setting or profile binding |
| **C7** baseline captured and archived before apply | **AWAITING** | P3 | the 72-row and `is_latest` capture |
| **C8** any hard stop ends the window | **AWAITING** | P3 | nothing repaired forward |
| **C9** separate authorization for **any** destructive act | **AWAITING** | T-706, teardown, **T-408(b) cleanup** | newly relevant: the B17 fixture's own teardown is destructive |
| **B9** deployed endpoint lacks the actor boundary | **OPEN** | deployment | T-903b/T-904 fail against the deployed file today |
| **B12** status allowlist | **CLOSED — approved as owner policy (OD-6)** | nothing executable | approved value is the one already in D2; zero code, constant or test change. Narrowing later would change D2 **and** D6 together |
| **B13** shared, not isolated | **OPEN — written acknowledgement** | P3 | the synthetic-only boundary is the only containment |
| **B14** population closure | **DESIGN APPROVED (OD-7) — implementation and execution still OPEN** | AUTH-2 | Design B is the approved direction; **AUTH-2 is a separate grant**. D2 remains byte-identical |
| **B2** no injection point for T-411 | **OPEN** | T-411 | blocked, not failed |
| **B11** shared resolver duplicate-masking | **OPEN, out of scope** | nothing here | `actor.ts` deliberately untouched |
| **B15 / B16 / B17** | **CLOSED** | — | B17 closed as **planned** coverage; its three fixtures are `NOT RUN` |

---

## J. What was not done in this turn

No SQL executed or prepared. No connection to any project, and no read of any table, policy, grant or row. No test run, no fixture created, no baseline captured. **No executable file created, edited or deployed** — `createSnapshotFromReviewedFields/entry.ts` is 328 lines and unchanged; `canonicalActor.ts` does not exist and was not created. **D2 is byte-identical** (MD5 `93caa480de80ec621b4204bcbed898a9`). D7A R2 remains **NOT AUTHORIZED, NOT APPLIED**. Only documentation under `src/` was written.

**Closing statement.** The package is ready to be *acted on* and nothing in it is ready to be *believed*: every number reconciles to a file, and every behaviour it describes is still a description. The gap between the two is a migration run and an endpoint deployment, in that order, each behind its own authorization.