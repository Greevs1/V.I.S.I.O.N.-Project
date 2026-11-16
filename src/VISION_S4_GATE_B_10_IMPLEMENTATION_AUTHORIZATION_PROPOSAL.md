# V.I.S.I.O.N. — S4 Gate B · Deliverable 10
# IMPLEMENTATION AUTHORIZATION PROPOSAL

**STATUS: AUTH-1 GRANTED AND EXERCISED (§12A) · AUTH-2/3/4 NOT AUTHORIZED · D2 BYTE-IDENTICAL (MD5 `93caa480de80ec621b4204bcbed898a9`) · NO SQL EXECUTED, NO PROJECT CONTACTED, NO FIXTURE, NO DB TEST, NOTHING DEPLOYED**

| | |
|---|---|
| **What this document is** | The scope an owner signs, split into **separate grants**, plus the prerequisites that are still unmet. It proposes authorization; it does not take it. |
| **What it records** | **OD-6** (B12 approved as owner policy) and **OD-7** (B14 Design B approved as direction). Both were taken by the owner and are documentation-only. |
| **What it does not do** | It creates no file under `base44/`, edits no executable text, executes no SQL, connects to no project, runs no database test, creates no fixture and deploys nothing. |
| **Verified for this document** | `base44/shared/authz/` contains **`actor.ts`, `documentAccess.ts`** only — `canonicalActor.ts` does not exist · `base44/functions/createSnapshotFromReviewedFields/entry.ts` is **328 lines** · `jsconfig.json` includes only `src/components/**/*.js`, `src/pages/**/*.jsx`, `src/Layout.jsx` and **excludes `src/api`, `src/lib`** · `package.json` has **no `test` script** and **no test framework**; the repo's suites are `node scripts/*.test.cjs` files run directly · D2 line **143** is `v_active_statuses constant text[] := array['active','incomplete'];` · the RPC takes **11 parameters** · the `regprocedure` literal appears **3** times (lines 878–880). |

---

## §0. Owner decisions recorded

### OD-6 — B12: profile-status allowlist **APPROVED**

| Element | Record |
|---|---|
| **Decision** | The allowlist **`{active, incomplete}`** is **approved** for reviewed-field snapshot creation, **subject to strict identity resolution and verified business authorization**. |
| **Denied** | `invited` · `suspended` · `missing` · `unknown` |
| **Preserved as conditions** (properties of the proposed text, not work to be built) | (a) strict **Base44 user ID** matching · (b) **no email fallback** · (c) **no client-supplied actor identity** · (d) **no inferred business ownership** · (e) **no relaxation of RLS or service-role boundaries** |
| **Where it already exists** | D2 line 143 (`v_active_statuses`), line 375 (`SNAPSHOT_ACTOR_UNKNOWN` for a missing `profiles` row), line 383 (`SNAPSHOT_ACTOR_STATUS_NOT_ACTIVE` for every other status), lines 391–411 (`business_entities` / `business_owners` read independently → `SNAPSHOT_FORBIDDEN`) |
| **Code, constant, test change** | **None.** The approved value is the value already in D2. T-110/T-111 already assert exactly this behaviour. |
| **What it does not authorize** | A source edit, an SQL apply, a deployment, a test run, or any change to `v_active_statuses` now or later. Narrowing it in future would change **D2 and D6 together** and restate T-110/T-111. |

### OD-7 — B14: Design B **APPROVED AS DESIGN DIRECTION ONLY**

| Element | Record |
|---|---|
| **Decision** | **Design B is the intended database population-accounting approach** — an approval of approach, **not** an authorization to apply it. |
| **Preserved properties** (each must survive implementation review) | exact eligible-field-**ID** reconciliation · contributor/skipped **disjointness** · **V-16** canonical UUID validation · **single-statement** population comparison · concurrency limitations **explicitly documented** · existing **11-parameter** RPC signature |
| **Where it lives** | D7A **Revision 2** §2 (H1–H7), §4 (C-1–C4) — the authoritative text |
| **B14 status** | The **design question closes**. The **implementation and execution blockers do not**: D2 is unedited, and applying it is **AUTH-2**, a separate grant. |
| **What it does not authorize** | An edit to D2, SQL execution, a fixture, a test run, or a deployment. OD-7 is **not** AUTH-2. |

---

## §1. Authorization boundaries — six separate grants

**No grant implies another.** Each has its own signature, its own evidence of completion and its own failure mode.

| Grant | The act | Permits | Forbids | State |
|---|---|---|---|---|
| **AUTH-0** | Documentation | Editing `src/VISION_S4_GATE_B_*.md` | Anything under `base44/`, any SQL, any deploy | **EXERCISED** (D6, D8, D9, D10) |
| **AUTH-1** | **Source edits** | Creating `canonicalActor.ts`; replacing `entry.ts`; adding the offline harness | Any SQL · any deployment · any other source file · any test data | **GRANTED AND EXERCISED — §12A** |
| **AUTH-2** | **SQL apply** | Applying D2 Revision 6 (H1–H7) to the shared test project, in one window | Fixtures outside §3's S4-scoped creates · any destructive act · deployment · production | **NOT GRANTED — proposed §11** |
| **AUTH-3** | **Deployment** | Deploying the two files to the app runtime | Production promotion · UI enablement · any data change | **NOT GRANTED — proposed §11** |
| **AUTH-4** | **Destructive acts** | Dropping objects, deleting audit rows or synthetic snapshots, any teardown | — | **C9 only — not proposed here and not proposed later by this author** |
| **AUTH-5** | **Production** | — | — | **NOT CONTEMPLATED IN GATE B** |

**Two orderings that are structural, not procedural:**
1. **AUTH-1 before AUTH-3.** Deployment is what closes **B9**; there is no version of "deploy later, fix the actor boundary after" that is not shipping A-1…A-5.
2. **AUTH-2 before AUTH-3.** The endpoint calls the new guard; deploying first means a caller sending payloads the function does not yet validate.

---

## §2. Exactly which source files would be modified

| # | Path | Action | Today | After | Authority |
|---|---|---|---|---|---|
| **1** | `base44/shared/authz/canonicalActor.ts` | **create** | **does not exist** | new module, content = D6 §3 | **AUTH-1** |
| **2** | `base44/functions/createSnapshotFromReviewedFields/entry.ts` | **replace** | **328 lines** (B9 defects A-1…A-5) | content = D6 §4, including C-1/C-2 | **AUTH-1** |
| **3** | `scripts/snapshotCallerContract.test.cjs` | **create** | does not exist | offline harness, §7 | **AUTH-1** |

**Explicitly unchanged — asserted, not assumed:**

- `base44/shared/authz/actor.ts` — **untouched**; **B11** is out of scope and the shared resolver keeps its email fallback. The new module is separate *because* the shared one must not be changed for this.
- `base44/shared/authz/documentAccess.ts`, every other backend function, every entity schema, `package.json`, `jsconfig.json`, `tailwind.config.js`, all `src/**` app code.
- **No RLS rule and no policy** is created, altered or dropped anywhere in Gate B.

**Conditional third source file — declared now so it cannot be discovered mid-implementation.** If the four pure helpers (timestamp classifier, result validator, error mapper, payload builder) **cannot be bundled out of `entry.ts`** by the offline harness, they must be extracted into one module, which is a **third file change under AUTH-1**. That extraction is either in the grant or it is not; it will not be added quietly during implementation. **Recommendation: grant it in advance.**

---

## §3. The precise D2 migration revision incorporating H1–H7

**Target revision: D2 → Revision 6.** One document, one hash change, six edits and three one-line edits, all inside the existing function body plus §3.2 and one function comment.

| Hunk | Anchor (Revision-4 numbering) | Content | Raises added |
|---|---|---|---|
| **H1** | after line 190 | 3 declarations: `v_skipped_ids`, `v_unmapped`, `v_unsent` — **no count variable** | — |
| **H2** | after V-15, before `end if;` (345–349) | **V-16**: `p_skipped[].field` is a canonical uuid (`is null` arm included) | +1 (`SNAPSHOT_INVALID_SKIPPED`, existing code) |
| **H3(a)** | step 7A, after 585 | skip ids cast once, `coalesce(array_agg(...), '{}')` | — |
| **H3(b)** | step 7A | overlap rule: `v_skipped_ids && v_contributor_ids` | +1 (`SNAPSHOT_POPULATION_INCOMPLETE`) |
| **H3(c)** | step 7A, before step 8 (587) | single-statement set reconciliation, both directions, one snapshot | +1 (same code) |
| **H4** | line 797 | one comment sentence | — |
| **H5** | after the V-15 row (970) | the V-16 table row | — |
| **H6** | line 975 | "fourteen" → "fifteen" | — |
| **H7** | everything else | **no change** | — |

**The patch text is not reproduced here.** D7A **R2 §2** is the single source; a second copy would create two texts and no way to know which one was authorized.

**Apply order — descending, or anchor-by-text.** Applying H1 first invalidates every anchor below it. Order: **H6 → H5 → H4 → H3 → H2 → H1**, or locate each by its text. A patch applied by trusting the line numbers lands 7A in the wrong place, which at review time is indistinguishable from the defect it replaces.

**Post-apply invariants — these are the acceptance criteria for AUTH-2, not commentary:**

| # | Invariant | Expected |
|---|---|---|
| D-1 | Parameter count of `create_reviewed_fields_snapshot` | **11** — unchanged |
| D-2 | `regprocedure` literals (lines 878–880) | **3 occurrences**, byte-identical to today |
| D-3 | `revoke`/`grant` block, `security invoker`, `set search_path = ''` | unchanged |
| D-4 | `raise exception` sites in the body (lines 116–776) | **42 → 45** |
| D-5 | Distinct `SNAPSHOT_*` codes | **26 → 27** |
| D-6 | `v_active_statuses` literal | `array['active','incomplete']` — **unchanged** (OD-6) |
| D-7 | `s4_mapping_contract` | untouched |
| D-8 | Text outside the seven hunks | **byte-identical** (hash the untouched span) |

---

## §4. The precise D6 endpoint and strict-identity helper changes

**Target revision: D6 → Revision 8.**

### §4.1 New module — `base44/shared/authz/canonicalActor.ts`

| Contract element | Requirement |
|---|---|
| **Input** | the authenticated Base44 user id, supplied by the caller from the verified session — **never** from a request body |
| **Predicate** | **exactly one** `.eq('base44_user_id', …)`; **zero** email predicates of any kind |
| **Cardinality** | `.maybeSingle()` / `.single()` must be **0**; the list form is followed by an **exactly-one-row** rule; a duplicate binding is an error, never a silent pick |
| **Roles** | `ADMIN_ROLES` **imported**, not re-declared |
| **Verbs** | **no** insert, update, upsert or delete — a resolver that cannot write cannot corrupt |
| **Returns** | a discriminated union: resolved profile, or a typed failure the caller maps to a status |
| **Forbidden** | any fallback, any fuzzy match, any "first row", any widening when the profile is missing |

### §4.2 Replacement — `entry.ts`

| Item | Change |
|---|---|
| **F-1** | `p_skipped` sent as `{field: <id>, reason}`; response maps back to `{field_id, reason}` |
| **X-6** | reason text is `Not selected for mapping (<version>)` — true for both causes |
| **R7-1** | timestamp helper **classifies**; **no subtraction** anywhere in the comparator, so no `NaN`; total order with `id` as the final tie-break |
| **R7-2** | `count: 'exact', head: true` drives paging; duplicate-id `Set`; a **second** count after the read; hitting a cap is a **409**, never a 500 and never silence |
| **R7-3** | every field of the RPC result validated **before** the success object is built; **zero** `result?.` reads escape |
| **C-1** | `RPC_ERROR_STATUS.SNAPSHOT_POPULATION_INCOMPLETE = 409` |
| **C-2** | `RPC_ERROR_MESSAGES.SNAPSHOT_POPULATION_INCOMPLETE` — **required**, or the user sees "Request rejected" |
| **C-3** | a note at the map: the matcher is substring-in-key-order, so **a new code name must not contain an existing one** |
| **Identity** | `resolveCanonicalActor` called **exactly once**; `actor.profile_id` sourced from that one call; no body-supplied id is ever read |
| **Writes** | the caller writes **nothing** to `business_metric_snapshots` or `dashboard_metrics` directly |

**C-1 and C-2 ship in the same change as H3(c).** A guard whose refusal surfaces as "Request rejected" is a user-visible regression on the failure path, not a neutral omission.

---

## §5. Static checks — runnable today, no database

**Group A — D2 edit (acceptance for AUTH-2):** S1–S8.
**Group B — caller (acceptance for AUTH-1):** S9–S15.

| # | Check | Expected | A failure means |
|---|---|---|---|
| **S1** | MD5 of D2 before / after | changed **once**, recorded | an edit outside the window |
| **S2** | Each hunk's signature string occurs **exactly once** | 7 / 7 | a misplaced or duplicated hunk |
| **S3** | Parameter list of the function | **11** names, unchanged | signature drift — breaks the ACL literals |
| **S4** | The three `regprocedure` literals | identical, 3 occurrences | ACL guard mismatch |
| **S5** | Body `raise exception` count (116–776) | **45** | a hunk landed outside the body, or was dropped |
| **S6** | Distinct codes | **27** | a code added without a mapping entry, or vice versa |
| **S7** | `v_active_statuses` literal | `array['active','incomplete']` | **OD-6 violated** |
| **S8** | Untouched-span hash | identical to pre-edit | collateral edit |
| **S9** | `canonicalActor.ts`: `.eq('email'` count | **0** | email fallback reintroduced |
| **S10** | `canonicalActor.ts`: `.eq('base44_user_id'` count | **exactly 1** | ambiguous resolution |
| **S11** | `entry.ts`: reads of `body.`/`req.` for identity fields (`email`, `profile_id`, `user_id`, `base44_user_id`) | **0** | client-supplied actor identity |
| **S12** | `entry.ts`: direct writes to `business_metric_snapshots` / `dashboard_metrics` | **0** | a second write path |
| **S13** | `RPC_ERROR_STATUS` keys vs `RPC_ERROR_MESSAGES` keys vs D2 codes | **27 = 27 = 27** | a code reaching users unmapped |
| **S14** | No code name is a **substring** of another (C-3) | 0 collisions over 27 | mis-mapped error (the matcher is ordered) |
| **S15** | UUID pattern string in the caller **byte-identical** to V-8/V-16's | identical | caller accepts what the RPC refuses, or vice versa |

---

## §6. Compilation checks — including what they do not cover

| Check | Command | Covers the diff? | Why it is still run |
|---|---|---|---|
| Type check | `npm run typecheck` → `tsc -p jsconfig.json` | **No.** `include` is `src/components/**/*.js`, `src/pages/**/*.jsx`, `src/Layout.jsx`; `src/api` and `src/lib` are excluded, and **`base44/**` is not in the list at all** | it establishes that the frontend baseline is no worse than before |
| Lint | `npm run lint` → `eslint .` | **Only if** the eslint config actually covers `base44/**/*.ts` — **must be confirmed, not assumed** | catches unused imports and shadowed names |
| Build | `npm run build` → `vite build` | **No** — backend functions are not bundled | proves the app still builds |

**The honest gap, stated rather than papered over:** this repository has **no TypeScript or Deno coverage for `base44/**`**. Two options, and the proposal does not pretend there is a third:

- **(a) Accept review-only** — the deploy step is the compiler. Cheapest; means the first real type check of `entry.ts` happens **after** AUTH-3 begins.
- **(b) Add a `base44` tsconfig** — real coverage, and a **third source-file change** requiring its own grant, because it alters how the repo is built.

**Recommendation: (a) for AUTH-1, with (b) as a separate, later decision.** Neither is a precondition of this proposal.

---

## §7. Tests that can run **without** database access

**The repo's convention, verified:** `node scripts/*.test.cjs` — standalone CommonJS harnesses, offline, non-destructive, no framework (`package.json` has no `test` script and no runner dependency). New coverage follows that convention exactly: one file, `node scripts/snapshotCallerContract.test.cjs`.

| Coverage | Test ID | What it asserts without a database |
|---|---|---|
| Comparator totality | **T-906(a)–(d)** | equal timestamps, absent vs malformed, `NaN` never produced, `id` tie-break |
| Result validation | **T-903(c)**, **T-906(d)** | a malformed RPC result is refused, never forwarded |
| Error mapping | **T-907**, **T-908**, **T-909** | the new code maps to **409** with its **message**, not "Request rejected" |
| Cap refusal | **T-901(c)**, **T-902(b)** | a ceiling produces a **409**, never a truncated success |
| Payload shape | T-408(a) shape, F-1 | `{field, reason}` out, `{field_id, reason}` back; reason wording (X-6) |
| Identity helper invariants | **T-905** | source-level fingerprint: one id predicate, zero email predicates, no write verbs |
| Pattern parity | S15 | caller and RPC agree on "canonical uuid" |

**Explicitly out of scope for AUTH-1:** the **71 `DB-PASS`** IDs. Every one needs the function present in a database, i.e. **AUTH-2**. No count moves until then, and the register stays **105 / 83 / 21 / 1 / 71 + 12**.

**One dependency that must be settled before AUTH-1 is signed:** the harness "bundles the real modules". If the four helpers cannot be bundled out of `entry.ts` as it stands, they must be extracted — the **conditional third file** in §2. **This is declared now precisely so it cannot become a surprise.**

---

## §8. Remaining shared-test-environment safeguards

The project is **shared, not isolated (B13)**. Containment comes from these, in this order, and none is optional:

| # | Safeguard | Holds because |
|---|---|---|
| 1 | **Synthetic-only write boundary** | every S4 write lands on rows the fixtures created, or on the three objects the migration creates |
| 2 | **C1–C9 recorded before any window** | S1 of the plan freezes a window with an unrecorded precondition |
| 3 | **Pre/post baselines — 72 snapshot rows + the `is_latest` map** | a preservation claim without a captured baseline proves nothing |
| 4 | **Marker check at P2** | `cb005b_marker = 1` → stop unless C1 authorizes |
| 5 | **Read-only connector by default** | the connector holds `database:read` only; a write requires the C3 channel |
| 6 | **T-408(b) P1–P4 fence** | the plan's only direct DML on the snapshots table is two-predicate fenced and rowcount-checked |
| 7 | **No real `business_id` / `profile_id`** | S12: a call against a real tenant **freezes** the run |
| 8 | **Hard stop ends the window (C8)** | nothing is deleted, repaired or "fixed forward" inside it |
| 9 | **L2 freeze on failure** | export the log and the audit rows, propose, do not delete |
| 10 | **C9 for every destructive act** | including a synthetic snapshot's own teardown |

---

## §9. Rollback plan — never deletes or modifies a pre-existing financial record

| Layer | Rollback | Data effect |
|---|---|---|
| **Source (AUTH-1)** | revert the two files from history | **zero** — no code runs until AUTH-3 |
| **SQL (AUTH-2)** | **nothing to undo.** The three objects are **additive and unread**: no caller, no job and no UI references them until AUTH-3. The rollback for a bad apply is **leave them in place and do not deploy**, after which the system behaves exactly as it does today | **zero** |
| **A defective function body** | corrected by a **forward** `create or replace` from an authorized revision | **zero** |
| **Deployment (AUTH-3)** | redeploy the prior build | **zero** — and note honestly: the prior build is the **328-line file that fails B9**, so this restores a *known-open* state, not a good one |
| **Data** | **no rollback path touches a pre-existing row.** Permitted: deleting a **synthetic** snapshot the fixture created, **and only under C9**. Forbidden without exception: any DML on a row the fixture did not create · any `update` against a real `business_id` · `truncate` · `drop` · deleting audit rows | — |

**Three things worth saying plainly rather than burying:**

1. **The pre-patch function body is not a rollback target.** D2 §4 records that the pre-patch revision is non-functional; "restore the previous body" would restore a broken function. There is no safe backward step in SQL — only a forward one.
2. **One thing is genuinely unrecoverable.** A promotion demotes `is_latest` on a pre-existing row, and the audit records the **promoted** row, never the demoted one (D2 §3 step 11, §4). Only the P2 `is_latest` capture allows manual restoration. That is why **C5** — promotion confined to synthetic businesses — is a precondition of AUTH-2 and not a nicety.
3. **Not deploying is a complete rollback of the SQL phase.** That is the strongest safety property in this plan and it disappears the moment AUTH-3 runs.

---

## §10. Remaining prerequisites

| Item | State | Gates | Note |
|---|---|---|---|
| **C1** host-project authorization | AWAITING | AUTH-2 | overrides D4 §1's default stop |
| **C2** not-production confirmation | AWAITING | AUTH-2 | only the project ref distinguishes them |
| **C3** write-capable **transactional** channel + operator | AWAITING | AUTH-2 | the connector is `database:read`; an *asserted* transaction capability is a stop condition |
| **C4** retention-limit acceptance | AWAITING | AUTH-2, teardown | `ON DELETE RESTRICT` + append-only |
| **C5** promotion never targets a real business | AWAITING | AUTH-2 (fixtures) | the one unrecoverable act, §9.2 |
| **C6** fixtures authorized as S4-scoped creates | AWAITING | AUTH-2 | no seeding, no backfill, no year-setting, no profile binding |
| **C7** baseline captured **before** apply | AWAITING | AUTH-2 | 72 rows + `is_latest` |
| **C8** any hard stop ends the window | AWAITING | AUTH-2 | no forward repair |
| **C9** separate authorization for **any** destructive act | AWAITING | AUTH-4 | includes T-408(b) teardown |
| **B12** status allowlist | **CLOSED — OD-6** | — | zero code change |
| **B14** population accounting | **DESIGN APPROVED — OD-7; implementation + execution OPEN** | AUTH-2 | OD-7 is **not** AUTH-2 |
| **B9** deployed endpoint lacks the actor boundary | OPEN | AUTH-3 | **closed by AUTH-1 + AUTH-3**, not by a promise |
| **B13** shared, not isolated | OPEN — written acknowledgement | AUTH-2 | safeguard 1 is the only containment |
| **B2** no injection point for T-411 | OPEN | T-411 only | blocked, not failed |
| **B11** shared resolver duplicate-masking | OPEN, **out of scope** | nothing here | `actor.ts` deliberately untouched |
| **B15 / B16 / B17** | CLOSED | — | B17 as **planned** coverage; its three fixtures are `NOT RUN` |

---

## §11. The exact proposed authorization scope

Three grants, written to be signed or refused independently. **Signing one signs nothing else.**

> ### AUTH-1 — SOURCE EDITS
> **Authorized:** create `base44/shared/authz/canonicalActor.ts` and `scripts/snapshotCallerContract.test.cjs`; replace `base44/functions/createSnapshotFromReviewedFields/entry.ts`; **and**, if the offline harness cannot bundle them, extract the four pure helpers into one additional module.
> **Not authorized:** any SQL · any deployment · any other file · any fixture or test data · any RLS or policy change · any change to `base44/shared/authz/actor.ts`.
> **Acceptance evidence:** S9–S15 green · the offline harness green · `git diff --stat` shows exactly the declared files · `npm run build` and `npm run lint` no worse than the recorded baseline.
> **Does not close:** B9. It fixes the text; only AUTH-3 closes the defect.

> ### AUTH-2 — SQL APPLY
> **Authorized:** apply **D2 Revision 6** (H1–H7, descending order or anchor-by-text) to the shared test project, in **one** window, through the **C3** channel, with **C1–C9 recorded** and the **C7** baseline archived first.
> **Not authorized:** fixtures beyond C6's S4-scoped creates · any destructive act · deployment · production · any change to `v_active_statuses`.
> **Acceptance evidence:** S1–S8 green · D-1…D-8 invariants hold · pre/post baseline diff = **expected only** · T-701 still passes.
> **Does not authorize:** the B14 guard's *behaviour* being proven — that is P4/P5, which run inside this grant but are the reason it exists.

> ### AUTH-3 — DEPLOYMENT
> **Authorized:** deploy `canonicalActor.ts` and the replaced `entry.ts` to the app runtime.
> **Not authorized:** production promotion · enabling the flow in any UI · any data change · any further source edit.
> **Preconditions:** AUTH-1 complete and reviewed · AUTH-2 accepted (P3–P6 passed) · **OD-6 recorded** (✅) · a two-session window for T-910(a)/(b).
> **Acceptance evidence:** T-903(b), T-904(a), T-906(a) pass **against the deployed file** · B9 recorded CLOSED on evidence, not on intent.

---

## §12. Verdict after OD-6 and OD-7

| Stage | Before | Now | Why it moved, or did not |
|---|---|---|---|
| **1. Documentation** | GO | **GO** | unchanged; two decisions added |
| **2. Source-code modification** | NO-GO | **GO, pending the AUTH-1 signature** | the two blockers that were *decisions* are decided (OD-6, OD-7). What remains is a grant, not an analysis. **B9 is not a separate blocker — AUTH-1 is how it closes.** |
| **3. Shared-test database execution** | NO-GO | **NO-GO** | **C1–C9 are all AWAITING**, B13 is unacknowledged, and no write-capable transactional channel exists. OD-7 changed the *direction*, not a single precondition. |
| **4. Endpoint deployment** | NO-GO | **NO-GO** | needs AUTH-1 done, AUTH-2 accepted, P3–P6 passed. B12's decision removed one item from the list and left the list intact. |

**The precise standing after this package:** the design questions are closed and the authorization questions are open. Nothing in OD-6 or OD-7 shortens the path from here to a database — it only removes two debates from in front of it.

---

## §12A. AUTH-1 — exercise record

**Authorized act, executed within its own scope. Nothing outside it was touched.**

| | |
|---|---|
| **Files changed** | `base44/shared/authz/canonicalActor.ts` (**new**) · `base44/functions/createSnapshotFromReviewedFields/entry.ts` (**replaced**, 328 → 754 lines, `+698 / −273` on the tracked diff) · `scripts/snapshotCallerContract.test.cjs` (**new**) |
| **Files deliberately not changed** | `base44/shared/authz/actor.ts` · `base44/shared/authz/documentAccess.ts` · every other function · every entity · `package.json` · `jsconfig.json` · all `src/**` app code · **D2, byte-identical** |
| **Conditional third source file** | **NOT USED.** The repo's existing harness pattern (`esbuild` transform + `node:vm`, as in `scripts/adminCanonicalActor.test.cjs`) loads the real modules directly, so no helper extraction was necessary. The caller stays one file — one fewer moving part than the grant allowed for. |
| **Mapping entries added beyond D6 §4's literal text** | `RPC_ERROR_STATUS.SNAPSHOT_POPULATION_INCOMPLETE = 409` and its `RPC_ERROR_MESSAGES` entry (D7A R2 §4 C-1/C-2), added because §11's acceptance criteria require them to ship **in the same change as the guard**. |
| **Offline harness** | `node scripts/snapshotCallerContract.test.cjs` → **102 PASS / 0 FAIL** |
| **Source checks** | S1 · S3 · S4 · S7 · S9–S15 **PASS** (11). S2 · S5 · S6 · S8 **PENDING AUTH-2** — they are post-apply criteria, and measured values are reported rather than forced |
| **Compilation** | `deno check` on both changed files with the `npm:` specifiers mapped to type-only shims → **exit 0, zero errors**, whole import graph. Plain `deno check` cannot run locally at all (`npm:@base44/sdk` is not in `node_modules`) |
| **Repo-standard checks** | `npm run build` → **exit 0** (frontend only; does not bundle functions) · `npm run typecheck` → **already red before this change**, and **0 of its errors are under `base44/`**; its `include` list does not contain `base44/**` · `npm run lint` → both files **not matched by any eslint configuration**, so lint does not judge them |
| **Database / deployment** | **None.** No project contacted, no SQL, no fixture, no DB test, nothing deployed. Evidence class is **UNIT/MOCK + STATIC**, never `DB-PASS` |

---

## §13. What was not done

No SQL executed or prepared. No connection to any project; no table, policy, grant or row read. No fixture, no test, no build, no type check, no lint run. **No executable file created, edited or deployed** — `entry.ts` is **328 lines and unchanged**, `canonicalActor.ts` **does not exist**, **D2 is byte-identical** (`93caa480de80ec621b4204bcbed898a9`). Documentation only: D6 (§0A.6, §3.3, §10 B12, §10 B14), D8 (OD-6, OD-7), D9 (§H, §I), and this file. **OD-6 and OD-7 are recorded as authorized policy; their implementation is not.**

**Stopping before implementation, as instructed.**