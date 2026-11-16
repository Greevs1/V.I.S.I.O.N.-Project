# S4 Gate B · DELIVERABLE 4 of 4 — Pre-Execution Checklist and Consistency Check

**Revision 7 — the environment is stated as it is.** Supersedes the Revision 5 text of this file. The target is **not** an isolated project; §1 has been rewritten accordingly, and three stale claims about the caller in §6 have been corrected.

## PROPOSAL — **AWAITING EXPLICIT AUTHORIZATION** · nothing applied

---

## 1. Target environment — a **SHARED** test project, with a synthetic-only write boundary

**The environment is not isolated, and no document may say it is.** The target is the **existing shared test project** (`xrvahykvkuiuglskmctd`) that already hosts this workspace's evidence surface. Isolation is **not** claimed, not available, and must not be assumed by any step in this checklist.

**What stands in its place is a write boundary, not a perimeter.** Every S4 write lands on:

1. **synthetic rows** created by `…_EXECUTION_SAFETY_PLAN.md` §3 and registered in its external registry (synthetic profiles, businesses, ownership rows, documents and extracted fields), or
2. **the three objects the migration itself creates** (`create_reviewed_fields_snapshot`, `s4_mapping_contract`, `snapshot_submission_audit`).

Nothing else is written. Because the surroundings do not contain a mistake, three things carry the weight that isolation would otherwise carry: **C5** (promotion confined to synthetic businesses), **C7** (the read-only baseline captured first, D2 §4.1.1) and the **P-1…P-11 per-table baselines** in the plan's §7. **B13** in D6 §10 records this.

**Revision 5 consistency pointers.** Three requirements live outside this file and are **not** in §3's probe list: (i) the **read-only pre-test baseline** of snapshot ids, promotion state and audit-surface absence — `…_02_SQL_MIGRATION.md` §4.1.1 and `…_EXECUTION_SAFETY_PLAN.md` §7.4; (ii) the **runner transaction probe** proving the channel can hold an explicit transaction — `…_EXECUTION_SAFETY_PLAN.md` §9.1; and (iii) the **identity resolver and caller text** — `…_06_STRICT_IDENTITY.md` §3–§4, which governs §3 probe 5 and §6 rows 1, 2, 18 and 20 here. None may be assumed from a channel's documentation or from an earlier revision of this file.

**Before anything is applied, the owner must state in writing:**

1. the **project ref** of the shared test project, and that it is the project named here;
2. confirmation that it is **not** the production project;
3. **written acknowledgement that the project is shared and not isolated**, and that every write is confined to synthetic rows and the three new objects — this acknowledgement is **C1-adjacent and load-bearing**, not a formality.

**This file is no longer the authority on identity, and must not be read as though it were.** Three pointers, each of which overrides what an earlier revision of this file said:

1. **`…_06_STRICT_IDENTITY.md` §3 is the authoritative identity resolver** — `resolveCanonicalActor` in `base44/shared/authz/canonicalActor.ts` — and **D6 §4 supersedes D1 §3 in full** as the caller text. Where §6 below names a helper, it names **D6's**, never the withdrawn one.
2. **`assertCanonicalActorIdentity` is withdrawn.** It appears in earlier revisions of this file and in D1 §3 as the enforcement point. D6 §4.1 **C-1** deletes it, together with `assertActiveProfile`; both are replaced by the single strict resolver that runs **before the handler body**. Any surviving occurrence of that name is an error, not a synonym.
3. **`p_skipped` has two different key sets, by design** — `{field, reason}` on the way **in**, `{field_id, reason}` on the way **out** (D6 §4.1 **C-3**, §4.2 C-6). §6 row 18 and the interface check below now state both.

**Identification probe** (read-only, run against the candidate project; returns nothing sensitive):

```sql
select current_database()                                    as db,
       current_user                                          as usr,
       (select count(*) from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname = 'provider_operation_audit') as cb005b_marker;

-- And the S4 objects must be ABSENT:
select to_regclass('public.snapshot_submission_audit') as audit_table_should_be_null;
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('s4_mapping_contract','create_reviewed_fields_snapshot');   -- expect 0 rows
```

`cb005b_marker = 1` means this project **already hosts CB-005B's evidence surface** — expected, since it is the shared test project. It is **not** a stop condition, and it is exactly why CB-005B's counts (26/34/2/0/0) must be captured at P2 and re-checked after every phase (S14): **S4 may run alongside CB-005B's records only if it writes none of them.** A non-null `audit_table_should_be_null`, or any row in the function list, means S4 objects already exist → stop and reconcile before re-applying.

---

## 2. Privileges required to apply

| Requirement | Note |
|---|---|
| A role that may `create function` and `create table` in `public`, and `revoke`/`grant` on those objects | The migration runs as the schema owner (the same posture as the existing migrations) |
| **The read-only Supabase connector cannot apply this** | Its granted scopes are `projects:read`, `secrets:read`, `database:read`. It is sufficient for the probes below and **not** for the DDL |
| Application | A single, manually reviewed execution in the **shared test project's** SQL editor — one transaction, then `commit`. Because the project is shared, this execution is the only write path into the three new objects and must not be repeated or split |
| No elevated or platform-owner role beyond the schema owner | No `security definer` is introduced; both functions are `security invoker` with `search_path = ''` |

---

## 3. Pre-apply probes (read-only, all in the shared test project)

| # | Probe | Expectation |
|---|---|---|
| 1 | The §1 identification and absence probes | As above |
| 2 | `select count(*) from public.business_metric_snapshots;` **and** `select id, business_id, is_latest from public.business_metric_snapshots where is_latest order by business_id;` | **72** — record the count. **Record the `is_latest` set verbatim, by business:** promotion may legitimately change it, and it is the only pre-existing state this work can alter (T-404, T-405, T-807 compare against it) |
| 3 | `select count(*), max(updated_at) from public.dashboard_metrics;` | Record both; T-605 compares against them |
| 4 | `select count(*) from public.documents d where d.year is null and exists (select 1 from public.extracted_fields f where f.document_id = d.id and f.review_status in ('accepted','corrected'));` | **2** — these documents will be refused with a controlled 409 (T-311). Their year is **not** set by this work |
| 5 | `select count(*) filter (where base44_user_id is null) as unbound, (select count(*) from (select base44_user_id from public.profiles where base44_user_id is not null group by 1 having count(*) > 1) z) as duplicate_bindings from public.profiles;` **and** `select profile_status, count(*) from public.profiles group by 1 order by 2 desc;` | **Split is [PLAN-PROBE], not verified.** **8 profiles are [PF-VERIFIED]**, with the status split measured as **1 `active`, 7 `incomplete`**; the unbound/duplicate split has **not** been run. **Duplicates are now load-bearing:** under the strict resolver `length > 1` is a **403** (D6 §3, P-2), and the *shared* resolver's `maybeSingle()` **masks** a duplicate by deferring to its email fallback (B11) — so a non-zero duplicate count silently changes which behaviour each of the 20 consumers has. This probe is the **G-1 / G-2** population read from D6 §7.1 and must be recorded verbatim, not as "expected 1 / 0" |
| 5a | Eligibility for snapshot authority, read off the same result | **`{active, incomplete}`**, per D6 §3.2 and D2's `v_active_statuses`. A literal `active`-only reading would refuse **7 of the 8** deployed profiles, because `incomplete` is the column **default**. **This is B12 — OPEN as a product policy**, and in Revision 7 it is labelled exactly what it is: a **provisional self-service onboarding policy requiring explicit owner approval**. This checklist neither approves nor narrows it |
| 6 | The deliverable‑2 §5 monitoring query | `valid = 80, no_score = 168, unusable = 0` |
| 7 | `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'extensions' and p.proname = 'uuid_generate_v4';` | 1 row — the audit table's default is `extensions.uuid_generate_v4()`. **If it is absent**, change the default to `gen_random_uuid()` before applying (the only schema-dependent line in the migration) |
| 8 | `select defaclobjtype, defaclacl from pg_default_acl;` | Confirms `anon`/`authenticated` receive DML on new tables and EXECUTE on new functions — the reason every REVOKE in the migration is mandatory, not cosmetic |
| 9 | `select to_regclass('public.business_metric_snapshots')`, and the `unique_latest_snapshot_per_business` index | Present — the demote-then-promote ordering is mandatory *because* this index exists |
| 10 | `public.is_super_admin()` body | Already read: it delegates to `current_app_role()`, which resolves `profiles.id = auth.uid()`; false for a caller with no session. No action |

---

## 4. Rollback approach

1. **Base44 first, SQL second.** Revert `createSnapshotFromReviewedFields/entry.ts` and the one-line UI selector together; then drop the SQL objects (deliverable 2 §4).
2. **Keep the audit table if history matters.** Reverting the caller first makes the table inert; export its rows before dropping it, because dropping loses the record of who submitted what.
3. **No content rollback is needed** — no existing row's **financial content** is modified. **Promotion may change `is_latest` on existing rows** (D2 §3 step 11, §4): restore it from the probe-2 capture if required, because the audit records the promoted snapshot and never the demoted row, so a rollback cannot reconstruct the previous holder. Snapshots created in the shared test project are ordinary rows in the same table; delete them only deliberately, and remember the audit table's `RESTRICT` references mean a snapshot with audit rows cannot be deleted until the audit rows are. **In a shared project this matters more, not less** — those rows are visible to any later reader.
4. **Teardown is the rollback**: drop both functions and the table. Nothing else was created.

---

## 5. Prohibited operations (in this phase)

- Applying anything to the **production** project, by any route.
- Deploying the Base44 function or the UI line in the same change-set as production work.
- Any change to **RLS policies**, to the existing privilege grants, or to `business_metric_snapshots`, `dashboard_metrics`, `extracted_fields`, `documents`, `profiles`, `business_entities`, `business_owners`.
- Any data write outside the RPC's own transaction: no backfill, no seeding, no year-setting, no profile binding, no `deleteMany`.
- **Enabling dashboard projection** — both constants stay `false`.
- Any touch of **CB-005A, CB-005B, provider sync, Galileo or the Digital Twin**, including their tables and functions.
- Renaming RPC parameters or audit columns (the optional hardening is **not** adopted; see §6 item 5).
- Creating the migration inside `src/supabase/migrations/` before authorization.

---

## 6. Consistency check across the artifacts — D1–D4 **and D6**

| # | Invariant | Caller (D1 §3 **withdrawn** → **D6 §4**) | Migration (D2) | Tests (D3) |
|---|---|---|---|---|
| 1 | Identity from the session only; no body field can reach the actor | **`resolveCanonicalActor`** (D6 §3) runs once **before** the handler body; the withdrawn `assertCanonicalActorIdentity` / `assertActiveProfile` are **deleted** (D6 §4.1 C-1); no `try/catch` reclassifies its refusal (C-2) | `p_actor_profile_id` validated as a relationship | T-107, T-108, **T-903b**, **T-905** |
| 2 | Exactly one id-bound profile; **no email fallback** | **List read, `length === 0` → 403 and `length > 1` → 403** — no tie-break, no ordering preference, **zero `ilike`, zero email predicate** (D6 §3, P-2/P-3). Status allowlist `{active, incomplete}`, `String()`-wrapped so a null cannot pass (**B12, OPEN as product policy**) | `v_active_statuses := array['active','incomplete']` — the two layers agree | T-102, T-103, T-104, T-105, **T-110, T-111** |
| 3 | Denial = 404, infrastructure failure = 500, never a fall-through | **no `try/catch` anywhere in the authority path** — `assertBusinessAuthority` throws 404 itself for both absence and denial, and D1's catch (which reclassified 500 as 404) is **deleted** (D6 §4.1 C-2); a failed query is 500 | no `exception when others` anywhere | T-207, T-208, T-209 |
| 4 | Advisor authority disabled in **both** layers | **the caller has no advisor branch at all** — an advisor falls through to the terminal 404 (D6 §4 `assertBusinessAuthority`); the D1 constant is gone with the superseded text | `v_advisor_authority_enabled := false` | T-203 |
| 5 | Naming of the claimed actor | `p_actor_profile_id` (unchanged) | same signature | — |
| 6 | Required reporting year, no fallback | step 3b, 409 | `SNAPSHOT_YEAR_REQUIRED` / `_IMPLAUSIBLE` | T-311 |
| 7 | `projection` is the only projected value | `SNAPSHOT_TYPES` | allowlist `('historical','tax_year','projection')` | T-312, T-604 |
| 8 | Confidence scale 0–100, one guarded conversion | — | length cap → format → single cast in `CASE`, then the bound | T-510 – T-517 |
| 9 | NULL aggregate unless **every** contributor is scored | — | `v_scored_count = v_contributor_count` | T-501, T-503, T-504, T-515 |
| 10 | Raw per-contributor scores in provenance and in the hash | mirror builds ids only | `scores` in provenance; `s` in `v_hash_input` | T-506, T-507 |
| 11 | `created_by` omitted and asserted NULL | passes no such parameter | column absent from the INSERT; `v_persisted_created_by is not null` tripwire | T-401, T-413 |
| 12 | Attribution via the audit, on **both** paths | — | audit insert outside the branch | T-402, T-208 |
| 13 | Projection disabled in **both** layers | constant + gated argument + reason fallback | constant checked first; body preserved | T-601 – T-606 |
| 14 | Promotion and backward-promotion report survive the disable | passes `isLatest` | promotion outside the projection block; `promoted_over_newer` computed there | T-404, T-405 |
| 15 | Explicit REVOKE/GRANT; deny-all RLS on the audit table | — | REVOKE-first on both functions and the table | T-702, T-703, T-704, T-705 |
| 16 | Existing RLS policies untouched | — | no policy DDL at all | T-701 |
| 17 | Contract parity between mirror and database | `FIELD_CONTRACT` | `s4_mapping_contract` | T-301 |
| 18 | The endpoint reads the SQL's **real shapes**, not assumed ones — and the two directions of `p_skipped` are **different key sets by design** | `applied` / `metadataTargets` / `mapped` / `fields_skipped` | `'applied', v_metrics \|\| v_meta_metrics` · `'skipped', coalesce(p_skipped,'[]')` | T-806, T-811, T-301 |
| 18a | **Request contract — `p_skipped` entries are `{field, reason}`**, where **`field` contains the source field ID**. D2 §3 step 1.1 (**V-12**) permits **only** these two keys; any other key set is refused `SNAPSHOT_INVALID_SKIPPED` | D6 §4.2 builds `skipped` **directly** as `{ field: f.id, reason: … }` and sends `p_skipped: skipped` — one shape, one construction, no intermediate `skipped_fields` object (D6 §4.1 **C-3**) | Validation V-12 accepts **only** `field` / `reason` — **D2 unedited** | **T-301** (key-set parity), T-314, T-315 |
| 18b | **Response contract — `fields_skipped` elements are `{field_id, reason}`.** The SQL echoes `{field, reason}`; the caller **maps** `field` → `field_id` on the way out, so the API is unchanged | D6 §4.2 maps back: `{ field_id: s.field, reason: s.reason }` (D6 §4.1 **C-6**) | echo only; no rename in SQL | T-806, T-811, T-414 |
| 19 | `actor.isAdmin` is canonical-only; no local admin role list, no broadening | verified against `shared/authz/actor.ts` | `v_is_admin := v_role in ('admin','super_admin')` from `profiles.app_role` | T-210, T-210b |
| 20 | A denied request writes **nothing** — no snapshot, no dashboard change, no audit row — and never reaches the RPC with a body-supplied actor | **`resolveCanonicalActor`** throws **before any RPC call** (D6 §3, §5); the withdrawn `assertCanonicalActorIdentity` no longer exists to be "called first" | audit written only on an accepted call (step 13) | T-903, T-414, **T-904(a)** |
| 21 | Existing-row preservation is scoped: **financial content** never rewritten, `is_latest` may change on promotion | §5 | §3 step 11 · §4 | T-404, T-405, T-807 |
| 22 | **Retrieval completeness is proven by the caller, relative to its own counts** — and only the transaction can prove it relative to the committed population | D6 §4 step 4: exact count → expectation-driven pages → duplicate-id check → second count → `MAX_FIELDS`/`MAX_SKIPPED`; a mismatch is a **409** before the RPC. **The residual (net-zero concurrent change) is B14, not a caller fix** | `SNAPSHOT_CONTRIBUTOR_DRIFT` / `SNAPSHOT_FIELD_NOT_CONTRACTED` prove only that the rows *sent* are real — **D2 unedited**; the closure guard is **proposed** as B14 and **not applied** | T-209, T-108 |
| 23 | **A success is only reported from a validated result** — and a malformed result is a 500 that may hide a committed transaction | D6 §4 step 6 validates `snapshot_id` (uuid), `snapshot_type` (non-empty string, **not** the request subset), the four booleans, `applied` (non-empty object), `skipped` (echo, never the request), `confidence_score`, `dashboard_skipped_reason` | D2 always builds all 10 keys; nothing changes | **T-906** |

**Interface check — verified against the artifacts, not asserted:**

| Check | Result |
|---|---|
| RPC parameters | **11 of 11 identical** in name and order across D1 and D2 (`p_business_id`, `p_source_document_id`, `p_actor_profile_id`, `p_actor_base44_user_id`, `p_mapping_version`, `p_basis`, `p_snapshot_type`, `p_field_map`, `p_skipped`, `p_is_latest`, `p_update_dashboard`) |
| Error codes raised in D2 vs the keys of `RPC_ERROR_STATUS` **in D6 §4** (D1 §3 is withdrawn and the map moved) | **26 codes, identical sets** — nothing raised without a mapping, nothing mapped but unraised. Counted by enumeration from D2's 42 `raise` sites; the earlier figure of 24 predated Revision 4's step-1.1 block, which added **two** codes (`SNAPSHOT_INVALID_FIELD_MAP`, `SNAPSHOT_INVALID_SKIPPED`), and was never recalculated. **With B14 adopted this becomes 27** (`SNAPSHOT_POPULATION_INCOMPLETE` → 409; V-16 reuses an existing code), and this line must be restated **with** the D2 change, not before it |
| Return keys | **D6 §4** reads exactly the **10** keys D2 builds (`snapshot_id`, `deduplicated`, `dashboard_metrics_updated`, `dashboard_skipped_reason`, `promoted_over_newer`, `snapshot_type`, `is_latest`, `applied`, `skipped`, `confidence_score`) |
| Return **shapes**, not just keys | `applied` is an object (`'applied', v_metrics \|\| v_meta_metrics`) and D6 §4 reads it as an object; `skipped` elements are `{field_id, reason}` in the **response** and D6 §4 echoes exactly those two keys. **Both were previously mismatched** in D1 §3 — `Array.isArray` on an object, and `field` collapsed into `reason` |
| **Request** shapes, not just keys | **`p_skipped` entries are `{field, reason}` with `field` = the source field ID** (D6 §4.1 C-3), matching V-12 exactly. D1 §3 sent `{field_id, reason}` and would have been refused `SNAPSHOT_INVALID_SKIPPED` on **every** snapshot carrying an unconsumed field — recorded as **F-1**, resolved in D6 §4.2. **This parity was absent from the Revision 4 table**, which is why the mismatch survived review |
| DDL scope | one `create table` (the audit table), **zero** `create policy`, one `alter table` (that table's RLS enable), two indexes on that table only |
| Confidence conversions | **3** in the file — **one** in the function body and one per monitoring query — each an `ELSE` arm of a guarded `CASE`, so none is reachable without passing the length cap and the format test |

**One correction applied while consolidating:** an unsafe variant of the second monitoring query (an `and`-chain relying on predicate order to guard its cast) was removed from D2 and replaced with the same `CASE`-guarded shape as the first. No artifact now depends on evaluation order.

**Final corrections integrated.** The seven corrections recorded in `VISION_S4_GATE_B_05_FINAL_CORRECTIONS.md` — the `applied`/`fields_skipped` response shapes, the canonical-`isAdmin` verification, T-304 precedence, T-306 cardinality, the claimed-actor cases moved to Group I, scoped existing-row `is_latest` preservation, and the response/audit reconciliation — **and** the three final corrections (T-811's partial-snapshot message with correct pluralization, T-903's zero-write denial with no audit row, T-807's per-business `is_latest` comparison) have been folded into D1–D3, D6 and this document. **D5 is retained as the change record and no longer governs.** D6 is added as the authoritative identity and caller text and is **not** an optional annex: §3 and rows 1, 2, 18, 18a, 18b and 20 above depend on it.

**Revision 5 correction — this table was not internally consistent, and said it was.** Four defects are now recorded rather than absorbed: **(a)** rows 1 and 20 named a helper that D6 deletes, so the file asserted enforcement through a symbol that will not exist; **(b)** row 2 stated "`length === 1`, must equal the resolver's profile", a tie-break that the chosen design explicitly forbids (`length > 1` is a refusal, not a selection); **(c)** the table had **no request-side row for `p_skipped`**, carrying only the response shape — which is precisely why **F-1** survived a review that declared parity; **(d)** §8 asserted consistency across four artifacts while the identity policy had already moved to a fifth. All four are corrected in place. **The table is now consistent with D6 as written; D6 is itself still unbuilt and undeployed, so nothing here is a claim about deployed behaviour.**

---

## 7. Residual risks carried into implementation

| Rank | Risk | Severity | Handling |
|---|---|---|---|
| 1 | **The path becomes functional for the first time** — snapshots that never landed now write | Medium (was High) | Projection is **off**, so nothing reaches a dashboard. **Testing happens in a shared project, contained only by the synthetic-only write boundary**, with the before/after counts in §3 as the check that the boundary held |
| 9 | **The target is shared, not isolated (B13).** A mistake is contained by the write boundary and the baselines, not by the surroundings | Medium | Every write confined to synthetic rows and the three new objects; C5/C7 and P-1…P-11 are the containment, and S11/S12/S13 freeze on any breach rather than cleaning it up |
| 10 | **A partial snapshot can still be published if the population changes with net zero effect (B14)** | Medium-Low while the caller's two counts agree | The caller refuses on any count movement (T-209). A true guarantee needs the D2 closure guard, which is **proposed and not applied**; until then the residual is accepted knowingly, not denied |
| 2 | Confidence will be **sparse by design** — 168 of 248 field rows carry no score, so most snapshots will report none | Medium-Low | Accepted. The upstream fix is scoring fields during review, not relaxing the rule |
| 3 | **1 of 8** profiles is not id-bound and is denied snapshot authority | Medium-Low | Deliberate. Bind it through your own process if it needs the path |
| 4 | **2** documents have no reporting year and will be refused | Low | Deliberate; their year is not set by this work |
| 5 | The service key remains the trust root | Accepted | Key custody is the control; the boundary is documented in D1 and D2 |
| 6 | PUBLIC + `anon` + `authenticated` EXECUTE on existing predicates; `anon` holds DML on the snapshot tables; the RLS predicates compare `profiles.id = auth.uid()` | Open finding | Contained by RLS returning false. **Recorded, not resolved**; out of scope for this phase |
| 7 | Dashboard projection remains a shared, unarbitrated row for the other ten writers | Deferred | Prerequisite for enabling projection: metric ownership, provenance and arbitration, as its own design |
| 8 | **Promotion modifies existing rows** (`is_latest` demote) and the demoted row is **not** recorded in the audit, so promotion state is not reversible from the record alone | Low | Deliberate and scoped: content is never rewritten, exactly one `is_latest` per business always holds, and probe 2 captures the pre-run state (T-404, T-405, T-807) |

---

## 8. Status

The consolidated package is **documentarily consistent across D1–D4, D6 and the execution safety plan** on the points this checklist governs — D2 applied verbatim, the transaction and baseline preconditions, and the four §6 corrections above. That consistency is a statement about **documents**, not about deployed behaviour: **D6 §3–§4 are proposed text**, and the endpoint currently deployed still fails T-903b, T-905 and T-904(a) (**B9 OPEN**). **Nothing has been applied, executed, deployed or changed** — no runtime application code, no SQL, no test run, no Supabase environment.

**Blockers as they stand:** **B9 OPEN** (endpoint boundary — remediation written, undeployed; blocks the application phase and endpoint deployment, **not** P3–P6) · **B10 RESOLVED as policy**, option (b) · **B11 OPEN, out of scope** (the shared resolver masks a duplicate binding) · **B12 OPEN as a product policy** — `{active, incomplete}` labelled a **provisional self-service onboarding policy requiring explicit owner approval** · **B13 OPEN** (the target is a **shared** test project; the synthetic-only write boundary stands in for isolation and must be acknowledged in writing) · **B14 OPEN** (a strict completeness guarantee needs one D2 closure guard; **proposed, not applied**, review stops there) · **B7 OPEN until P2** (probes 4–6 remain `[PLAN-PROBE]`).

**Awaiting, explicitly:**
1. authorization to proceed in the **shared test project** named in §1 — **including written acknowledgement that it is not isolated and that every write is confined to synthetic rows and the three new objects**;
2. confirmation that the pre-apply probes in §3 return their expected values — **probe 2 captures the pre-run `is_latest` set by business** for T-807, and **probe 5's split is unverified and must be recorded as measured**, because duplicates now decide which resolver behaviour each consumer has;
3. **a decision on B14** — adopt the closure guard (a D2 change, requiring re-authorization and a second DDL pass) or record acceptance of the residual in writing;
4. authorization to apply the migration, then implement the Base44 file and the one-line UI change, then run the plan in deliverable 3. **The Base44 file in that step is D6 §4, not D1 §3.**

Production, CB-005A, CB-005B, provider integrations, Galileo and the Digital Twin remain untouched.