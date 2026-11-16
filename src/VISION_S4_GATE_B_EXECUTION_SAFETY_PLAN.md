# VISION Phase S4 Gate B — Execution Safety Plan

**Revision 7 — environment corrected, register 101, two new blockers.** Supersedes Revision 5, Revision 4, Revision 3, Revision 2 and Revision 1 in full. Nothing executed.

| # | Correction | Where |
|---|---|---|
| **R7-1** | **The target is a SHARED test project, not an isolated one.** Every "isolated project" reference is corrected — this file's heading, §3.4, the stop conditions (S12), §12 and Appendix B (**B13**), plus D2's header, D3's environment line and T-903, and D1's D-19 comment — and the control is named for what it is: a **synthetic-only write boundary** (synthetic rows + the three new objects, nothing else). S11/S12/S13 freeze on breach instead of relying on surroundings that are not isolated | Header, §3.4, S12, §12, Appendix B (**B13**), Appendix C |
| **R7-2** | **The register is 105 IDs** — **83** executable in the migration window, **21** deferred, **1** blocked. D3 adds **T-906** (RPC result validation); no other ID moved. **Of the 83, 71 are planned `DB-PASS` and 12 planned `PARTIAL`** — the added ID is a `PARTIAL`, so the pass total is unchanged while the executable total rises by one | §5.2, §5.3, Appendix C |
| **R7-3** | **New blocker B14** — a strict completeness guarantee needs one closure guard **inside** the RPC. Proposed in D6 §0A.3, **not applied**; a decision is required **before P3**, because adopting it later means a second DDL pass over the same objects | Appendix B, §12 |
| **R7-4** | **No claim that D2 is certified.** D2 has never executed, no project has been contacted, and the only observed results in this package remain the three static checks against today's tree | §5, §12, Appendix A/B |

**Revision 5 — strict identity policy resolved.** Supersedes Revision 4, Revision 3, Revision 2 and Revision 1 in full.

**What Revision 5 changes — five documentation corrections, nothing executed.**

| # | Correction | Where |
|---|---|---|
| **R5-1** | **The register is reconciled to D3's actual enumeration: 105 IDs** (as of Revision 8) — **83** executable in the migration window, **21** deferred, **1** blocked. Counted from D3's ID column, not from its prose, and cross-checked by group sum | §5.2, §5.3, Appendix C |
| **R5-2** | **B10 is RESOLVED (policy) — option (b).** The snapshot caller enforces strict canonical `base44_user_id` identity itself and refuses an email-only match. The shared resolver is **not** changed; no existing consumer's behaviour moves | Header, §5.5, Appendix B, §12 |
| **R5-3** | **The remediation that closes B9 exists as proposed code** (D6 §3–§4) and is **not deployed**. **B9 therefore stays OPEN**, and the deployed endpoint still **bypasses the RPC** entirely — it writes the snapshot table directly, then demotes `is_latest` in a second statement. It remains **unsafe for deployment** | §5.5, Appendix B, §12 |
| **R5-4** | **The `p_skipped` contract defect (F-1) is recorded and corrected in the caller:** request entries carry `{field, reason}`, with `field` holding the **source field id**; the response still reports `{field_id, reason}`. **D2 is unedited** | §5.5, Appendix B |
| **R5-5** | **New blocker B11**, explicitly out of scope: the shared resolver's `maybeSingle()` read **masks** a duplicated `base44_user_id` and hands the decision to its email fallback. Inherited by all 20 of its consumers; not fixed here | Appendix B |

**Carried forward from Revision 4, unchanged in substance:** the actor boundary was inspected in the actual code and found **not met** (§5.5, defects A-1…A-5); the runner's transaction capability must be **proven before P3**, never assumed (§9.1, S2); `p_field_map`/`p_skipped` are validated fail-closed in D2 §3 step 1.1; and the read-only pre-test baseline plus synthetic-rows-only restoration are fixed in D2 §4.1 and this plan's §7.4/§10.5.

**Carried forward from Revision 3, unchanged:** the `S4_ACL_GUARD_FAILED` guard is archived **inside D2** as the final statement of its §3 script, documented at **D2 §3.1**. **D2 is the single authoritative migration artifact**; this plan carries no copy of the guard and there is no delta left to apply. Blocker **B1 is resolved** on that basis — every other blocker stands as recorded in Appendix B, T-411 included.

**The one contradiction Revision 4 surfaced is now decided, not absorbed.** Revision 4 recorded **B10** as an owner decision: the platform's `authenticateActor` falls back to an email match, while D3's T-102 expects a refusal in exactly that case — so D2, D3 and this plan could not all be right. **Option (b) was chosen** (D6 §1): **T-102 stands as written, D2 stands unchanged**, and the strict binding is enforced in a **new, separate helper** (`shared/authz/canonicalActor.ts`) so that the 20 existing call sites of the shared module are untouched. **B10 is resolved as policy; its implementation is part of the endpoint change-set that B9 already blocks.**



**What Revision 4 recorded — four corrections, kept as history. Revision 5 supersedes its B9/B10 status only, not its content:**

| # | Correction | Where |
|---|---|---|
| **R4-1** | **Transaction safety made explicit and verifiable**: the script's own freedom from transaction control is established by inspection, the runner's support for an explicit transaction must be **proven before P3**, and an undocumented autocommit assumption is named as a stop condition | §9.1, S2 |
| **R4-2** | **The authenticated actor boundary was inspected in the actual code.** It is **NOT met** by the deployed endpoint — five specific defects, each with a line reference — and `service_role` is documented as incapable of establishing end-user identity. New blocker **B9**; new tests **T-903b/T-903c** for forged administrator identities | §5.5, D2 §3.3, Appendix B |
| **R4-3** | **JSON input validation** for `p_field_map`/`p_skipped` added to D2 as a fail-closed, named-error block before any financial processing, with contract and cardinality behaviour preserved case by case | D2 §3 step 1.1, D2 §3.2 |
| **R4-4** | **Restoration safety stated as a procedure**: a read-only baseline of snapshot ids, promotion state and absence of the audit surface, plus a separately authorized, synthetic-rows-only restoration that can never reach CB-005B or a pre-existing financial record | D2 §4.1, §7.4, §10.5 |

**Superseded by R5-2.** The contradiction recorded here as **B10** — the shared resolver's email fallback versus D3's T-102 — was **resolved by decision, option (b)** (D6 §1). It is retained only so the trail is visible: the resolver's email fallback uses the **session's** verified email, never a body field, which is why it was never a forgery vector — it was a **weaker binding than the requirement states**, for a financial write.
**Target project:** `xrvahykvkuiuglskmctd` (VISION-CB005B-TEST 2) — reused deliberately as the S4 host.
**Status:** **DOCUMENTATION ONLY · NOT APPLIED · NOT EXECUTED · Gate B NOT AUTHORIZED.**

---

## 0. Scope, references, and what this revision corrects

### 0.1 References

| Ref | File | Role |
|---|---|---|
| **PF** | `VISION_S4_SHARED_TEST_ENVIRONMENT_PREFLIGHT.md` | Completed read-only preflight. Every live-project fact here comes from PF. **Not re-run.** |
| **D1** | `VISION_S4_GATE_B_01_BASE44_SPEC.md` | Base44 caller — **not deployed in this window** |
| **D2** | `VISION_S4_GATE_B_02_SQL_MIGRATION.md` | **The single authoritative migration artifact** — objects, privileges, the transaction guard (now archived inside it), and rollback |
| **D3** | `VISION_S4_GATE_B_03_TEST_PLAN.md` | Groups A–I, **105** test IDs — **83** executable in the migration window, **21** deferred, **1** blocked (§5.2/§5.3). 93 from Revision 3; +T-314, T-315, T-903b, T-903c in Revision 4; +T-111, T-904, T-905 in Revision 5; **+T-906 in Revision 7** |
| **D4** | `VISION_S4_GATE_B_04_PRECHECK_AND_CONSISTENCY.md` | Probes, privileges to apply, prohibited operations |
| **D5** | `VISION_S4_GATE_B_05_FINAL_CORRECTIONS.md` | Change record only — does not govern |
| **D6** | `VISION_S4_GATE_B_06_STRICT_IDENTITY.md` | **Authoritative for the identity policy and for the caller text.** Records the B10 decision (§1) and carries the proposed replacement helper (§3) and endpoint (§4) — **proposed, not deployed.** Supersedes **D1 §3 in full**; D1 §4–§5 stand |

### 0.2 Evidence convention

- **[PF-VERIFIED]** — established by the completed preflight against this project.
- **[D1–D4]** — asserted by the integrated documents, re-used unchanged.
- **[PLAN-PROBE]** — must be captured at execution time; **never assumed**.
- **[PG-SEMANTICS]** — PostgreSQL behaviour relied on; reasoned from the documented semantics, not live-tested in this window.

### 0.3 The design rule this plan rests on

> **Every S4 write lands on synthetic rows created by this plan, or on the three objects the migration creates — nothing else.**

### 0.4 The corrections carried in this revision (seven from Revision 2, two in Revision 4, five in Revision 5)

| # | Correction | Sections |
|---|---|---|
| 1 | ACL verification moved **inside** the migration transaction, failing as a `RAISE` that aborts → `ROLLBACK`; an independent post-commit verification kept before any fixture. **Since Revision 3 the guard is archived in D2 itself** (D2 §3, documented at D2 §3.1), so there is one authority and no delta to apply | D2 §3/§3.1; §4 (P3), §6 |
| 2 | Partial-column fingerprint replaced by a **full-row** method that enumerates no columns | §7 |
| 3 | Fixture counts reconciled; **eight** document fixtures fixed and totalled; the T-306 reference corrected to `direct`-only, with **T-306b** (`sum`/`mean` accept one contributor) added | §3 |
| 4 | Database-executable tests separated from endpoint tests; identity/impersonation deferred; **a DB pass is never recorded for a deferred ID** | §5 |
| 5 | In-window deletion and repair removed from every hard-stop procedure; evidence preserved; destructive cleanup needs separate authorization | §4 (stop table), §10, §11 |
| 6 | Phase count corrected (**ten**), and preconditions / stop conditions / rollback levels / log fields made to agree | §1, §4, §11, Appendix C |
| 7 | Privilege queries, signatures, transaction ordering and test IDs validated against D2 and D3; contradictions reported rather than absorbed | §6, Appendix B |
| 8 | **Runner transaction capability is proven before P3**, not assumed; the script is confirmed to carry no transaction control of its own | §9.1, S2 |
| 9 | **The actor boundary was inspected in the deployed code**, found unsatisfied, and recorded with its five defects; forged-administrator negative tests added | §5.5, Appendix B, D3 |
| 10 | **The register is reconciled to D3's enumeration: 105 IDs** (Revision 8) — 83 executable in the migration window, 21 deferred, 1 blocked — counted from the ID column and cross-checked by group sum, not inferred from prose | §5.2, §5.3, Appendix C |
| 11 | **B10 resolved by decision (option b)** — strict canonical id binding enforced in a **separate** helper; the shared resolver unedited, so none of its 20 consumers moves | Header, §5.5, Appendix B |
| 12 | **B9 stays OPEN.** The remediation is **proposed code only** (D6 §3–§4), not built, not type-checked, not deployed. The deployed endpoint still writes `business_metric_snapshots` directly and demotes `is_latest` in a second statement — **the RPC is bypassed and the endpoint remains unsafe for deployment** | §5.5, Appendix B, §12 |
| 13 | **The `p_skipped` contract defect (F-1) is recorded:** request entries use `{field, reason}` with `field` carrying the source **field id**; the response still returns `{field_id, reason}`. Corrected in the caller; **D2 unchanged** | §5.5, Appendix B |
| 14 | **New blocker B11** — the shared resolver masks a duplicate binding via `maybeSingle()`. Inherited by 20 consumers; **explicitly out of scope** for this package | Appendix B |

---

## 1. Authorization preconditions — all nine before any execution

| # | Condition | Why it is a precondition | Status |
|---|---|---|---|
| **C1** | Written owner authorization naming `xrvahykvkuiuglskmctd` as the **S4 host for Gate B execution**, explicitly overriding D4 §1's default stop (this project *is* the CB-005B project, so its `cb005b_marker = 1`) | Without it, probe 1 stops the run | **AWAITING** |
| **C2** | Written confirmation it is **not** production (`tfrbswfrhrtgfcgonimb`) | PF §1: both refs sit in one org; only the ref distinguishes them | **AWAITING** |
| **C3** | A named **write-capable channel** (§9), its operator, and confirmation it addresses the test ref | PF §0: the connector holds `database:read` only | **AWAITING** |
| **C4** | Explicit acceptance of **§10's retention limit**: S4 residue cannot be deleted without a separate, ordered, privileged teardown | `ON DELETE RESTRICT` + append-only | **AWAITING** |
| **C5** | Explicit acceptance that **promotion tests never target a real business** (PF §6.2 lists the three holders) | Promotion demotes `is_latest` on an existing row; rollback cannot reconstruct it (D2 §4) | **AWAITING** |
| **C6** | Fixtures authorized **as S4-scoped creates** (§3) — no seeding, no backfill, no year-setting, no profile binding | D4 §5 | **AWAITING** |
| **C7** | The §7 baseline captured and archived **before** apply | A preservation claim without a recorded baseline proves nothing | **AWAITING** |
| **C8** | Agreement that any **hard stop ends the window** — nothing is deleted, repaired or "fixed forward" inside it | Corrections 5 and 6 | **AWAITING** |
| **C9** | Separate explicit authorization for **any destructive act** after objects exist: dropping the three objects, deleting audit rows, deleting synthetic snapshots, or any teardown | New in this revision; see §10–§11 | **AWAITING** |

**Nothing is authorized. No precondition is satisfied.**

---

## 2. The S4-only write allowlist

### 2.1 DDL — the migration's own objects only

| # | Object | Operation | Bound |
|---|---|---|---|
| A1 | `public.snapshot_submission_audit` | `CREATE TABLE` | One table, 11 columns (D2 §2) |
| A2 | `idx_ssa_snapshot`, `idx_ssa_hash` | `CREATE INDEX` | On that table only |
| A3 | `public.snapshot_submission_audit` | `ALTER TABLE … ENABLE ROW LEVEL SECURITY` | **Zero `CREATE POLICY`** |
| A4 | `public.snapshot_submission_audit` | `REVOKE ALL … FROM public`; `REVOKE ALL … FROM anon, authenticated`; `GRANT SELECT, INSERT … TO service_role` | No UPDATE / DELETE / TRUNCATE — **not even to `service_role`** |
| A5 | `public.s4_mapping_contract(text)` | `CREATE OR REPLACE FUNCTION` (name absent → pure create) | Immutable, read-only |
| A6 | `public.create_reviewed_fields_snapshot(11 args)` | `CREATE OR REPLACE FUNCTION` (name absent → pure create) | `security invoker`, `search_path = ''` |
| A7 | Both functions | `REVOKE ALL … FROM public`; `REVOKE ALL … FROM anon, authenticated`; `GRANT EXECUTE … TO service_role` | Exact signatures only |
| A8 | Comments on the three objects | `COMMENT ON` | Non-functional |
| A9 | **The transaction guard** | One `DO` block, archived as the final statement of **D2 §3** (documented at D2 §3.1) | Creates, alters and grants **nothing**; raises on any mismatch |

### 2.2 DML — RPC-mediated and fixture writes only

| # | Target | Operation | Bound |
|---|---|---|---|
| B1 | `public.business_metric_snapshots` | `INSERT` via the RPC only | **Synthetic `business_id` only** |
| B2 | `public.business_metric_snapshots` | `UPDATE is_latest` via the RPC only | **Synthetic `business_id` only**; no financial column ever written |
| B3 | `public.snapshot_submission_audit` | `INSERT` via the RPC only | Every accepted call, both paths |
| B4 | `public.profiles` | `INSERT` synthetic actors (§3.2) | Synthetic only; never `UPDATE` an existing profile |
| B5 | `public.business_entities` | `INSERT` synthetic businesses | Synthetic only |
| B6 | `public.business_owners` | `INSERT` synthetic ownership | Synthetic business + synthetic profile |
| B7 | `public.documents` | `INSERT` synthetic documents | Synthetic business/profile; `year` explicitly set except where NULL is the fixture |
| B8 | `public.extracted_fields` | `INSERT` synthetic fields | Bound to synthetic documents |

### 2.3 Prohibited — binding deny list

| Prohibited | Reason |
|---|---|
| Any write to `provider_sync_jobs`, `provider_observations`, `provider_sync_checkpoints`, `provider_operation_audit`, `provider_credentials`, `provider_authorization_attempts`, `business_connections` | CB-005B evidence surface (PF §2) |
| Any call to any `provider_*` function | CB-005B runtime |
| Any `UPDATE`/`DELETE` on the **72 original** snapshot rows | Financial content is never rewritten; `is_latest` only via a promotion that must not target them |
| Any `UPDATE`/`DELETE` on existing `documents` (78), `extracted_fields` (248), `profiles` (8), `business_entities` (9), `business_owners` (3) | Shared data |
| Any write to `dashboard_metrics` (6 rows) | Projection disabled in both layers (D-19) |
| Any `CREATE`/`ALTER`/`DROP POLICY` on an existing table | D4 §5; T-701 |
| Any privilege change on an existing object | D4 §5 |
| Any `ALTER TABLE` on an existing table | Not in D2's DDL scope |
| Any table other than the audit table (including a fixture registry — the registry lives **outside** the database) | §3.4 |
| **Any `DELETE`, `TRUNCATE`, or `DROP` while the window is open** | Correction 5 — see §10 |
| Any backfill, seeding, year-setting, profile binding | D4 §5 |
| `auth`, `storage`, `vault`, `extensions`, `valuation` schemas | Out of scope |
| Any Base44 code change, deployment or function edit | Documentation only |
| Production, by any route | C2 |

---

## 3. Dedicated synthetic fixtures

### 3.1 The eight document fixtures (corrected and totalled)

**Eight documents**, all attached to the primary synthetic business. Counts are the **required minimum**; an additional variant for the same document is additive and must be registered.

| # | Fixture | `document_type` | `year` | Fields | Exercises |
|---|---|---|---|---|---|
| **D1** | P&L | `profit_and_loss` | 2023 | **6** (5 valid + 1 `pending_review`) | T-801, T-302 (reuses the valid `total_expenses` row), T-303 |
| **D2** | Balance sheet | `balance_sheet` | 2023 | **6** (5 valid + 1 `notes` feeding no target) | T-805, T-811's unconsumed field |
| **D3** | Business tax return | `business_tax_return` | 2023 | **6** | T-802, default `snapshot_type = 'tax_year'` |
| **D4** | Debt schedule — **three loans** | `debt_schedule` | 2023 | **29** (9 loan attributes + 1 NULL `loan_balance` + 19 confidence battery) | T-803, T-306b, T-308, T-501/T-503/T-504/T-510–T-515 |
| **D5** | Payroll report | `payroll_report` | 2023 | **4** | T-804 |
| **D6** | P&L, **no year** | `profit_and_loss` | **NULL** | **1** | T-311 (`SNAPSHOT_YEAR_REQUIRED`) |
| **D7** | P&L, **implausible year** | `profit_and_loss` | **1700** | **1** | T-311 (`SNAPSHOT_YEAR_IMPLAUSIBLE`) |
| **D8** | Personal tax return | `personal_tax_return` | 2023 | **0** | T-808 / `SNAPSHOT_DOCUMENT_TYPE_UNSUPPORTED` |

**Total `extracted_fields` = 53** (6 + 6 + 6 + 29 + 4 + 1 + 1 + 0).

### 3.2 Cardinality corrected — `direct` only, and `sum`/`mean` (T-306 / T-306b)

The contract (D2 §1) declares exactly **three** ops. Revision 1 of this plan mislabelled the multi-contributor case as a "mean path" of the T-306 family. Corrected against D3:

| Case | Contract op / cardinality | `p_field_map` | Expected | Test |
|---|---|---|---|---|
| Two ids on a **`direct`** target (e.g. `annual_revenue`) | `direct` / `one` | 2 field ids | `SNAPSHOT_CARDINALITY_VIOLATION` | **T-306** |
| Empty `field_ids` on a `direct` target | `direct` / `one` | `[]` | `SNAPSHOT_INVALID_TARGET` (the empty-array check precedes the cardinality test) | **T-306** |
| Wrong `op` supplied for a declared target | any | mismatched `op` | `SNAPSHOT_OP_MISMATCH` | **T-306** |
| **One** id on a `sum` target (`total_debt` from `loan_balance`) | `sum` / `many` | 1 id | **ALLOWED** — value is that contributor's | **T-306b** |
| **Three** ids on a `sum` target | `sum` / `many` | 3 ids | **ALLOWED** — the total | **T-306b**, T-803 |
| **One** id on a `mean` target (`metadata.mean_interest_rate`) | `mean` / `many` | 1 id | **ALLOWED** — mean of one | **T-306b** |
| **Three** ids on a `mean` target | `mean` / `many` | 3 ids | **ALLOWED** | **T-306b** |

**No cardinality error is possible on a `many` target at any count**, so a one-loan debt schedule is a valid document. D4's single document therefore serves both the three-loan happy path and the one-loan case by varying `p_field_map` — **no ninth document is required.**

The 19-row confidence battery on D4 all feeds `metadata.mean_interest_rate` (`mean`, `many`), which is why a large contributor set is legal there and would not be on a `direct` target.

### 3.3 Profiles, businesses and ownership

| Fixture | `app_role` | `profile_status` | Role in the tests |
|---|---|---|---|
| `P-OWN` | `owner` | `active` | Owner via `business_entities.profile_id` — T-201 |
| `P-ADM` | `admin` | `active` | Admin bypass — T-210. **Synthetic**, so no RESTRICT reference to a real profile |
| `P-USER` | `user` | `active` | Owner via an active `business_owners` row — T-201 second clause |
| `P-ADV` | `advisor` | `active` | Assigned advisor on `assigned_advisor_id`; D-4 disabled → refused — T-203 |
| `P-TM` | `team_member` | `active` | Fully unrelated profile — T-205, T-204's no-relationship half |
| `P-OUT` | `owner` | `active` | Owns the second tenant; carries the **expired** ownership row on the primary — T-202 |
| `P-INV` | `owner` | `invited` | `SNAPSHOT_ACTOR_STATUS_NOT_ACTIVE` |
| `P-SUS` | `owner` | `suspended` | Same code, different status value |

- **8 profiles**, **2 businesses** (`BE-1` primary with `profile_id = P-OWN`, `assigned_advisor_id = P-ADV`; `BE-2` second tenant with `profile_id = P-OUT`), **2 `business_entities`**, **2 `business_owners`** (active for `P-USER`; expired for `P-OUT` on `BE-1`).
- **T-206 needs no extra document**: the caller passes `p_business_id = BE-2` with a document of `BE-1` → `SNAPSHOT_DOCUMENT_BUSINESS_MISMATCH`.

**Identity fixtures are NOT created in this window.** T-102 (unbound / email-variant profiles), T-103, T-104 (**duplicate `base44_user_id` binding**) and T-210b need binding states that only the deferred identity phase consumes. Creating a duplicate binding in a shared project to satisfy a test that cannot run here would add risk for no proof. They belong to §5's deferred phase, and they belong there **under D6, not D1 §3** — the identity enforcement these IDs assert is `resolveCanonicalActor` (D6 §3), which **does not exist yet**; `assertCanonicalActorIdentity` is **withdrawn** (D6 §4.1 C-1).

**Three things this roster does not mean.** (i) It is **synthetic and separate** from the deployed project's eight real profiles — the "8 profiles, 1 active / 7 incomplete" figure in Appendix A probe 5 is *that* roster, not this one. (ii) The `profile_status` values here (`invited`, `suspended`) are chosen to be **refused**, so they are consistent with the eligibility set `{active, incomplete}` adopted in D6 §3.2 — but that eligibility is **B12, OPEN as a product policy**, and a literal `active`-only rule would additionally refuse `P-INV` and `P-SUS` for a different reason. (iii) **T-104's duplicate binding is also the only end-to-end exercise of B11**: the shared resolver's `maybeSingle()` read masks the duplicate and defers to its email fallback, so T-104 must be read as testing the **strict** helper's explicit cardinality check, never the shared one.

**Planned, not observed.** The `app_role`/`profile_status` values above are the fixture **plan**. No profile row exists, and no identity ID below has been run.

### 3.4 The synthetic-only write boundary — invariants

| # | Invariant | Proof |
|---|---|---|
| I1 | Every synthetic row's `business_id`/`profile_id` is in the registered set | Registry check |
| I2 | No synthetic row references a real business or profile | Registry check, inverted |
| I3 | Every audit row references **only** synthetic snapshot/business/profile ids | `audit where business_id <> all(synthetic)` = 0 |
| I4 | No original snapshot row changed | §7 full-row method |
| I5 | `dashboard_metrics` count and content unchanged | §7 |
| I6 | Baseline counts rise **only** by registered synthetic ids | §7 |

**Registry and marking.** The synthetic id set is recorded **in the execution log outside the database** — no registry table (that would widen the allowlist). Each row also carries an `S4GB::` marker in a text column confirmed at P0 from `information_schema.columns`; where no suitable text column exists, the external registry is authoritative for that table.

---

## 4. Migration and execution sequence — **ten phases**

Every phase ends with a gate. **A failed gate is a freeze, not a retry** — see the stop-condition table at the end of this section.

### P0 — Authorization and channel
Record C1–C9. Confirm the write channel (§9), its operator, and the marker columns for §3.4.
**Gate G0:** all nine recorded → else stop (S1).

### P1 — Identification and absence probes (D4 §1)
`current_database()`, `current_user`, `cb005b_marker`, `to_regclass('public.snapshot_submission_audit')`, the two function names.
**Expected here:** `cb005b_marker = 1` (**authorized by C1** — the deliberate override), audit table `null`, function list 0 rows. PF §3 independently confirmed all three S4 objects absent in every schema.
**Gate G1:** any pre-existing S4 object → freeze (S3).

### P2 — Baseline capture (read-only; the proof of preservation)
1. CB-005B: 26 jobs (all `failed`, all `quickbooks`), 34 observations, 2 checkpoints, 0 operation-audit, 0 authorization attempts — [PF-VERIFIED]; **credential count out-of-band** (PF §7 R9: redacted).
2. Snapshots: `count(*)` = **72** [PF-VERIFIED], the **72 ids**, the **full-row capture** (§7.2), and the per-business `is_latest` set (§7.3).
3. `dashboard_metrics`: 6 rows [PF-VERIFIED] + digest.
4. `documents` 78, `extracted_fields` 248 (13 accepted/corrected), `profiles` 8, `business_entities` 9, `business_owners` 3 — [PF-VERIFIED] + digests.
5. Privilege snapshot: `pg_default_acl` (`anon=arwdDxtm` on tables, `anon=X` on functions — [PF-VERIFIED]); current `relacl`/`proacl` of the seven dependency tables; `pg_auth_members` for `anon`/`authenticated`.
6. Server version (expect **17.11**, PF §1) — recorded **with** the capture, because it is part of the digest's determinism (§7.1).
7. D4 probes 3–6 — **recorded, not asserted** (Appendix A).
**Gate G2:** every value recorded, including the two PF could not establish (credential count, confidence distribution).

### P3 — Apply **D2 verbatim** in one transaction; the guard is its own final statement
```
begin;
  D2 §1   the mapping contract   (+ revokes/grants + comment)
  D2 §2   the audit table        (+ indexes + RLS enable + revokes/grant + comment)
  D2 §3   the snapshot function  (+ revokes/grants + comment)
  D2 §3   TRANSACTION GUARD      (do $s4_acl_guard$ … ; raises on any mismatch)  ← final statement
commit;   -- reachable only if the guard did not raise
```
**Nothing is appended, inserted or reordered.** The guard now lives **inside the archived D2**, positioned after every `REVOKE`/`GRANT` in the file — the contract function's (D2 §1), the audit table's (D2 §2), the snapshot function's (D2 §3). It therefore observes the **final** ACL state of all three objects. That ordering is now a property of the artifact rather than a convention of this plan, which is what makes D2 the single authority.
**Pre-commit check:** no conflicting session on the three tables receiving FK locks (`business_metric_snapshots`, `business_entities`, `profiles`) — PF §7 R4: three brief `SHARE ROW EXCLUSIVE` locks on a shared project.
**An explicit `begin;` is mandatory.** If the channel applies statements in autocommit mode, the guard cannot roll anything back and the whole protection is void (S2).
**Gate G3:** any error, including the guard's `S4_ACL_GUARD_FAILED` → **`ROLLBACK`** (L0). Nothing was created; this is the only in-window remediation in this plan.

### P4 — Independent post-commit ACL verification (before any fixture)
A **second, fresh session** re-runs the full matrix of §6.2 — not the guard, and not trusting the guard's own result. Nothing is created until it passes.
**Gate G4:** any mismatch → freeze (S7). No revoke, no drop, no repair in-window: the objects are inert (no fixtures, no caller), so freezing costs nothing and preserves the evidence needed to explain the divergence (§6.4).

### P5 — Shape verification
Eleven columns; both indexes; RLS enabled with **zero** policies; both signatures exact; both `security invoker` with `search_path = ''`; `service_role` holds `SELECT, INSERT` on the table and `EXECUTE` on both functions; the 72-row count and the full-row digest unchanged from P2.
**Gate G5:** any deviation → freeze (S9/S10).

### P6 — Synthetic fixture creation
Create §3. Register every id. No `UPDATE` to any pre-existing row.
**Gate G6:** I1/I2 hold; baseline counts rose only by registered synthetic ids.

### P7 — Database-executable tests (§5)
Only the IDs in §5.2, in the order given. Direct RPC calls as `service_role`. **No Base44 caller is deployed.**
**Gate G7:** any stop condition, or an ID outside §5.2 executed as if it were DB-testable (S18) → freeze.

### P8 — After-checks and preservation diff
Re-run every P2 capture in a fresh session. Diff. Assert §7 and §8.
**Gate G8:** any drift on CB-005B or on the original 72 rows → freeze (S14/S15/S16).

### P9 — Retention decision recorded, **no action taken**
Record which option (§10.3) the owner will pursue, and that it requires C9. **Nothing is deleted in this window.**
**Gate G9:** the window closes and reports.

### Stop conditions — exhaustive (S1 … S18)

A **hard stop freezes the window.** No deletion, no repair, no "fix forward", no remediation. Evidence is preserved; only the L0 `ROLLBACK` of an uncommitted transaction is permitted, because nothing yet exists to preserve.

| # | Condition | Phase | Action |
|---|---|---|---|
| **S1** | Any precondition C1–C9 unrecorded | P0 | Do not begin |
| **S2** | The named channel cannot run an explicit `begin; … commit;` | P0 | Do not begin — the guard would be void |
| **S3** | An S4 object already exists | P1 | Freeze; reconcile |
| **S4** | Any migration statement errors | P3 | **`ROLLBACK`** (L0) |
| **S5** | The in-transaction guard raises `S4_ACL_GUARD_FAILED` | P3 | **`ROLLBACK`** (L0) — automatic and mandatory |
| **S6** | Lock wait on the three FK-target tables exceeds the agreed window | P3 | **`ROLLBACK`** (L0) |
| **S7** | Post-commit verification disagrees with the guard | P4 | Freeze (L1) — no revoke, no drop |
| **S8** | `service_role` holds `UPDATE`, `DELETE` or `TRUNCATE` on the audit table | P4/P5 | Freeze (L1) — append-only broken at the privilege layer |
| **S9** | The audit table carries any policy, or RLS is disabled | P5 | Freeze (L1) |
| **S10** | Count or full-row digest of the 72 changed after a phase that wrote no data | P5 | Freeze (L1) |
| **S11** | A synthetic row references a real business or profile (I2) | P6 | **Freeze — do not delete the offending rows.** Deleting is destructive and would destroy the evidence of how it happened |
| **S12** | An RPC call writes against a real `business_id`/`profile_id` | P7 | **Freeze (L2).** The **synthetic-only write boundary** was broken — that boundary, not the environment, is what contains this run, because the target is a **shared test project (B13)**. The rows stay as evidence; no cleanup is authorized by this table. If a real business was touched, C5 is breached and the verdict is NO-GO, not remediated |
| **S13** | An audit row references a non-synthetic id (I3) | P7/P8 | Freeze (L2) |
| **S14** | Any CB-005B count differs from baseline (26/34/2/0/0) | P8 | Freeze (L2) |
| **S15** | Any original-72 row differs (per-row digest or `is_latest` set) | P8 | Freeze (L2) |
| **S16** | `dashboard_metrics` count or digest differs | P8 | Freeze (L2) |
| **S17** | The RPC returns a key set other than the 10 documented keys, or a shape contradicting D5 §1/§7 | P7 | Freeze |
| **S18** | A test that asserts an **endpoint** HTTP status or endpoint response shape is attempted via direct RPC | P7 | Freeze — that ID is deferred (§5), and running it here would manufacture a false pass |

---

## 5. Test execution mode — database-executable vs deferred

### 5.1 The rule

> **A direct RPC call proves the database. It does not prove the endpoint.** A DB-level pass is never recorded as a pass for a deferred ID.

**Four** recordable outcomes, and no others: **`DB-PASS`** (the database behaviour asserted was observed), **`DB-FAIL`** (the assertion was executed and **did not hold** — a finding, not a pass and not an omission), **`PARTIAL`** (the database half is proven; the endpoint half of the same ID stays `NOT RUN`), and **`NOT RUN`** (deferred entirely). `PARTIAL` is never written as a pass, and **an expected failure is still recorded as `DB-FAIL`** — never softened to "not applicable" or moved to `NOT RUN` (T-903b, T-904(a), T-905).

What a DB pass can and cannot establish, stated once: a direct RPC call can prove the **SQL error code**, the **zero-write** property, and the persisted rows. It cannot prove an HTTP status, a response body, a non-disclosure body, session resolution, or that the endpoint never passes a body-supplied actor. Where a test mixes both, only its DB half runs here.

### 5.2 Executable in this window — 83 IDs

*(Heading renamed in Revision 8: 8 of the 83 are source/migration-text checks and never touch the database, so "database-executable" overstated what the bucket contains. The membership below is unchanged except for the four B14 additions.)*

| Group | DB-executable | Notes |
|---|---|---|
| **B** | T-201, T-202, T-203, T-204, T-205, T-206, T-210 | **T-201 and T-210 are `DB-PASS`** ("allowed" is layer-agnostic). **T-202 – T-206 are `PARTIAL`**: the refusal is proven here by its SQL code + zero writes (`SNAPSHOT_FORBIDDEN` for T-203/204/205, `SNAPSHOT_DOCUMENT_BUSINESS_MISMATCH` for T-206), but D3 states their expectation as a **404 with a specific body** — that is an endpoint assertion and stays `NOT RUN` |
| **C** | T-301, T-302, T-303, T-304, T-305, T-306, T-306b, T-307, T-308, T-309, T-310, T-311, T-312, T-313, **T-314, T-315** | T-301 (contract parity) and T-313 (reserved-key inertness) are **static/source-level**: T-313 runs as a query against `s4_mapping_contract('s4.mapping.v1')`; T-301 compares D1's mirror to the SQL function **and must be re-verified against the deployed file after deployment** — the file present today is the pre-patch revision. **T-311 and T-312 are `PARTIAL`**: the SQL code is proven, the endpoint's 409/400 is not. **T-314/T-315 (Revision 4) test D2 §3 step 1.1** — `p_field_map` structure/keys/uuid/op and `p_skipped` — entirely inside the database, so they are full `DB-PASS` |
| **D** | T-401, T-402, T-403, T-404, T-405, T-406, T-407, T-408, T-409, T-410, T-412, T-413, T-414 | 13 of 14. **T-411 is blocked — see Appendix B** |
| **E** | T-501 … T-517 (17) | T-516 static text check; T-517 re-baselined (Appendix A) |
| **F** | T-601 … T-606 (6) | T-601 runs as its documented direct-RPC variant (T-602) — the RPC's own return keys carry the assertion |
| **G** | T-701, T-702, T-703, T-704, T-705 | **T-706 deferred** (executes a rollback → destructive → C9) |
| **H** | T-801, T-802, T-803, T-804, T-805, T-807, T-808, T-809, T-810 | **T-808/809/810 are `PARTIAL`** — `SNAPSHOT_DOCUMENT_TYPE_UNSUPPORTED` / `SNAPSHOT_FIELD_NOT_CONTRACTED` proven, the endpoint's 400 deferred. The rest assert persisted rows only |
| **I** | T-901, T-902, **T-903b**, **T-904**, **T-905**, **T-906**, **T-907, T-908, T-909, T-910** (10) | The claimed-actor boundary and result validation, which is exactly what a direct RPC plus a source read can prove. **T-903b, T-904(a), T-905 and T-906(a) are static source checks** — no session needed, so they run here. **T-904 is `PARTIAL`**: (a) runs, (b) needs the endpoint and stays `NOT RUN`. **T-906 is `PARTIAL`** for the same reason: (a) is static, (b) needs an authorized injection point. Against today's file **T-903b, T-904(a) and T-905 fail and are recorded `DB-FAIL`** as the evidence for B9/A-5 and for the helper that does not yet exist — never skipped, never softened — while **T-906(a) does not exist in the deployed file at all** |

### 5.3 Deferred to a separately authorized application phase — 21 IDs

| Group | Deferred | Why |
|---|---|---|
| **A** | T-101 … T-111 (**11**) | **Session identity.** Every one needs a signed-in Base44 session and the deployed endpoint. **T-111 (Revision 5)** is the `profile_status = 'incomplete'` owner path — the column DEFAULT — proving the strict allowlist does not lock out a legitimate owner (D6 §3.2). **T-108 is a static source check** of the entry file and is verified here only after the D6 §4 text is deployed; note that its clause set now largely **duplicates T-903b** (§5.2) — recorded as an open overlap, **not** reclassified and **not** double-counted |
| **B** | T-207, T-208, T-209, T-210b (4) | Non-disclosure body, 500 mapping, post-authority failure, canonical-vs-Base44 admin standing — all endpoint response properties |
| **G** | T-706 (1) | Executes a rollback; destructive; C9 |
| **H** | T-806, T-811, T-811b (3) | Endpoint response body: 12 keys, `fields_mapped` shape, message grammar and pluralisation |
| **I** | T-903, **T-903c** (2) | **Endpoint impersonation.** Needs a real session belonging to an unrelated caller plus a body naming another profile. A direct RPC call with `p_actor_profile_id` set by hand proves the *opposite* thing — it is the claim T-901/T-902 bound, not an impersonation attempt. **T-903c (Revision 4)** is the forged-*administrator* case: a session whose Base44 `user.role` is `admin` but whose canonical `profiles.app_role` is `user`, and a session with **no** profile row at all — both must be refused, and both need a live session |

**79 + 21 + 1 blocked = 101 test IDs** — the full D3 register, **reconciled by enumeration**: every count below is derived from D3's own ID column, not from its prose.

| Group | In D3 | DB-executable | Deferred | Blocked |
|---|---|---|---|---|
| **A** — identity | 11 | 0 | 11 | 0 |
| **B** — authorization | 11 | 7 | 4 | 0 |
| **C** — contract and source integrity | 16 | 16 | 0 | 0 |
| **D** — concurrency, idempotency, promotion, attribution | 14 | 13 | 0 | **1** (T-411) |
| **E** — confidence | 17 | 17 | 0 | 0 |
| **F** — projection disabled | 6 | 6 | 0 | 0 |
| **G** — execution boundary | 6 | 5 | 1 | 0 |
| **H** — positive and regression | 12 | 9 | 3 | 0 |
| **I** — claimed actor, direct-write bypass and result validation | 12 | 10 | 2 | 0 |
| **Total** | **105** | **83** | **21** | **1** |

**B17 coverage note (Revision 9).** The three previously unclaimed error codes — `SNAPSHOT_INVALID_INPUT`, `SNAPSHOT_ACTOR_UNKNOWN`, `SNAPSHOT_DEDUPE_TYPE_MISMATCH` — are now covered by **variants inside existing IDs**: **T-314 (c)**, **T-901 (b)** and **T-408 (b)**. **No ID is added, so this table does not move.** Two consequences bind the report: (1) all three variant fixtures are **`NOT RUN`**, and (2) an ID may be reported `DB-PASS` **only when every fixture inside it has run and passed**, so T-314, T-901 and T-408 are **not** passable on their older fixtures alone. The coverage is **planned, not executed**.

Each D3 ID appears in exactly one column, and the three column sums plus the group column reproduce 105 with no residual. "76 / 20 / 1 = 97" was correct for Revision 4; Revision 5's three IDs landed as **T-111 deferred**, **T-904 database-executable (`PARTIAL`)** and **T-905 database-executable (`DB-PASS`)**; **Revision 7 adds exactly one — T-906, database-executable (`PARTIAL`)** — and moves nothing else.

Inside the **83**, **in the corrected tree**: **71 `DB-PASS`** and **12 `PARTIAL`** — T-202, T-203, T-204, T-205, T-206, T-311, T-312, T-808, T-809, T-810, T-904, and **T-906**.

**The two numbers move independently, and this is the arithmetic Revision 7 corrects.** Revision 6 had 78 database-executable IDs split 67 / 11. Revision 7 adds exactly one ID — **T-906** — and it lands as **`PARTIAL`** (its static half runs, its behavioural half needs an injection point that does not exist). So **12 `PARTIAL`**, and the planned `DB-PASS` total stays at **67**, while the executable total rises to **83** (Revision 8 adds the four B14 IDs on top of Revision 7's 79): **71 + 12 = 83**. Any earlier reading of "68 planned passes" is wrong — it came from incrementing the executable total and the pass total together, which double-counts the added ID. **No `PARTIAL` may be reported as a pass**, and the final report must state the deferred half on each ID's own line.

**Against the tree as it stands today, three of the 83 record `DB-FAIL`** — T-903b, T-905, and T-904's static half — and each failure **is** the finding (B9, the absent strict helper, A-5), not a defect in the test. **T-906(a) is `NOT RUN` against today's file**, not `DB-FAIL`: the validation it checks does not exist there, so there is nothing to fail.

### 5.4 What the application phase requires

It needs the deployed `createSnapshotFromReviewedFields` and the one-line UI selector, live sessions for the identity fixtures, and — for T-903 assertion (2) — statement capture for the test window, or D3's documented fallback (zero writes in all three tables plus the static source guarantee). It is a **separate change-set and a separate authorization**, and this plan does not touch application code.

**And it is gated on §5.5.** The deployed file does not implement the boundary those IDs assert (B9), so deploying it unchanged would make every deferred ID fail for exactly the reason the tests exist to detect. **B9 therefore closes in three ordered steps, not one:** (1) deploy **D6 §3 + §4** as the first act of the application change-set; (2) re-run the three static checks **T-903b, T-904(a), T-905** against the deployed tree and record them; (3) only then open the live-session window for T-101…T-111, T-207…T-210b, T-806, T-811, T-811b, T-903, T-903c and T-904(b). **No endpoint ID is credited before step 2 passes.**

---

## 5.5 The authenticated actor boundary — source inspection finding

Requirement: *the actor profile must come exclusively from the authenticated session, strictly bound by `base44_user_id`, with no client-supplied actor override; `service_role` itself cannot establish end-user identity.*

**Verdict: the database half is designed correctly; the deployed caller does not implement the boundary at all. NOT MET.**

This was established by reading the actual code (read-only, nothing modified, nothing executed):

| Source | What it contains |
|---|---|
| `base44/shared/authz/actor.ts` | The platform's real boundary. `authenticateActor()` calls `base44.auth.me()` and **throws 401 when there is no session**; resolves the profile by `base44_user_id` **equality**; denies `suspended` centrally; derives administrative standing from `profiles.app_role` **alone** — "a Base44 `user.role` of admin/super_admin no longer elevates anything". `resolveActingProfile()` separates **actor** from **target**. Its own header states the rule: *"THE CALLER'S IDENTITY MUST NEVER COME FROM REQUEST BODY DATA"* and *"Service role is database capability, NOT authorization."* |
| `base44/functions/createSnapshotFromReviewedFields/entry.ts` | **Does not import it.** `grep 'authz/actor'` → **0 matches**; the string `base44_user_id` appears **nowhere** in the file. Revision 5: the proposed replacement for this file is **D6 §4**, which supersedes D1 §3 in full |
| `base44/shared/authz/canonicalActor.ts` | **Does not exist.** The strict resolver this endpoint requires, with its six invariants (P-1 … P-6) and its full proposed body, is **D6 §3**. **T-905** is the static fingerprint that fails until that file is created |

**The five defects, each with its line reference:**

| # | Defect | Lines | Effect |
|---|---|---|---|
| **A-1** | A failed `auth.me()` is **swallowed** into `user = null` | 18–24 | An unauthenticated call does not fail; it continues with no actor at all. This is the exact inverse of `authenticateActor`'s 401 |
| **A-2** | The authorization gate is **skipped when `user` is null** — `if (user && !['admin','super_admin','advisor'].includes(...))` | 60 | With no session the check is not evaluated, so the request proceeds |
| **A-3** | The role tested is the **document owner's** `profiles.app_role` (profile resolved from `document.profile_id`) | 45–53, 60 | The *caller's* standing is never examined. Authorization is decided by a property of the target resource, which the caller selects |
| **A-4** | `created_by: user?.id \|\| profile.id` | 240 | When there is no session, attribution falls back to the document owner — a non-session identity written as the actor |
| **A-5** | The snapshot is written **directly** with the service-role client, and `is_latest` is demoted in a **separate statement** afterwards | 243–249, 304–311 | The RPC — with its advisory lock, contract enforcement, guarded confidence and single-transaction atomicity — is bypassed entirely. A crash between the insert and the demotion leaves two `is_latest` rows |

**Two consequences that must not be softened:**

1. **`service_role` cannot establish end-user identity — by construction.** The RPC receives no token and runs with RLS bypassed; `p_actor_profile_id` is a **claim** validated only as a relationship, and a direct-RPC test can prove authorization *of a claim* and *zero writes on refusal* but never *who acted*. Stated in D2 §3.3 and in the function/table comments. **Any statement that the audit row proves authorship is wrong.**
2. **No endpoint test in this package can be credited, and applying D2 changes none of A-1…A-5.** They all live above the RPC. The deferred set (§5.3) stays `NOT RUN` — including the forged-administrator cases — until the caller is replaced by the **D6 §4** text and `p_actor_profile_id` is taken from `actor.profile_id` alone.

**The required remediation — now written, still not implemented (Revision 5).** The entry must (i) resolve the actor through the **strict** helper and let 401 propagate, (ii) take `p_actor_profile_id` **only** from `actor.profile_id`, (iii) refuse when **no** profile is bound to the session's `base44_user_id` **and equally when more than one is**, (iv) drop the `user?.id || profile.id` fallback, and (v) call the RPC instead of writing the table directly. **All five now exist as proposed text** — the helper in **D6 §3**, the replacement endpoint in **D6 §4**. **None of it is built, type-checked, deployed or tested.** Until it is deployed, **B9 remains OPEN and the endpoint remains unsafe for deployment**: it still writes `business_metric_snapshots` directly with the service-role client and demotes `is_latest` in a **separate statement** afterwards, so the RPC — with its advisory lock, contract enforcement, guarded confidence and single-transaction atomicity — is **bypassed**, and a crash between the two statements leaves two `is_latest` rows.

**Three things the proposal settles, and one it does not.** It closes **B10** by choosing a **separate strict helper** rather than a flag on the shared one (D6 §1–§2), so `base44/shared/authz/actor.ts` is **not edited** and no consumer's behaviour moves. It **corrects F-1 in the caller**: request `p_skipped` entries carry **`{field, reason}`**, with `field` holding the source **field id**, because D2 V-12 permits only those two keys; the response still reports `{field_id, reason}`, so the API is unchanged (D6 §4.1 C-3). And on status it adopts **`{active, incomplete}`**, matching D2's `v_active_statuses`, because the literal reading of "exactly one **active** profile" would refuse **7 of the 8** deployed profiles — `incomplete` is the column default (D6 §3.2). **That eligibility is a working policy here, not a settled product decision** — tracked separately as **B12**.

**What the proposal does not do: prove anything.** No line of it has been executed. **T-903b, T-904(a) and T-905 are static checks** that need no session, so they run in this window — and against the tree as it stands **they fail**, which is the B9/`A-5` record, not a defect in the tests. The live-session IDs stay `NOT RUN`.

---

## 6. Access verification — in-transaction, then independent

### 6.1 The guard lives in D2 — not here

**D2 is the single authoritative migration artifact.** The guard is archived as the final statement of D2's §3 script, and its seven assertions are documented at **D2 §3.1** (G-1 … G-7). This plan deliberately carries **no copy**: a second text would be a second authority, and the two would drift.

What this plan requires of the application, in P3 order:

| # | Requirement | Where |
|---|---|---|
| 1 | Apply **D2 §1 → §3 verbatim** in **one explicit `begin; … commit;`** — nothing appended, inserted or reordered | P3 |
| 2 | Confirm the applied text *is* the archived D2 — same guard block, `$s4_acl_guard$` tag intact — before running it | P3 |
| 3 | Treat **any** error as `ROLLBACK`: the guard raises `S4_ACL_GUARD_FAILED` and the raise aborts the transaction | P3, S4/S5 |
| 4 | Re-run D2 §3.1's seven assertions **independently** in a fresh session after COMMIT, plus the anon-key PostgREST probe | P4, §6.2 |
| 5 | Read the guard's message, not just its presence — it names every failing `role:privilege held=… want=…` pair | P4 |

**The runner rule is absolute.** The guard is a gate, not a report: the operator cannot misread it, and a later `COMMIT` cannot persist a hole, because a failed assertion raises. In autocommit mode it would raise but roll back nothing, which is exactly why the explicit transaction is precondition S2.

### 6.2 Post-commit, independent session (P4)

The same four checks, re-run by a **fresh session** that never saw the guard's result: the 24 table expectations, the PUBLIC/`relacl` check, the six function expectations plus `proacl`, and the membership check — **plus** the behavioural probe: one PostgREST `select`/`rpc` call with the **anon key** on each object must fail with a permission-class error and write nothing (T-704's assertion, run here as a gate rather than only as a test).

Two properties make the second run worth having: it is not the guard's own arithmetic, and it runs after the COMMIT, so it observes exactly what a later session will observe.

### 6.3 TRUNCATE protection — stated explicitly

| Layer | Protection | Where verified |
|---|---|---|
| Privilege | `REVOKE ALL` from `public`, `anon`, `authenticated` removes `TRUNCATE`; `GRANT SELECT, INSERT` never adds it — so **`service_role` cannot truncate either** | D2 §3.1 G-1 … G-3; re-run at §6.2 |
| RLS | **Does not apply.** RLS is not consulted for `TRUNCATE` — the privilege layer is the only barrier, which is why TRUNCATE is in the 8-privilege matrix rather than assumed absent | Stated, not assumed |
| PUBLIC | `grantee = 0` rows must be zero; **and `proacl IS NOT NULL`**, because a NULL `proacl` grants PUBLIC EXECUTE by default and would otherwise pass a grantee-only check | D2 §3.1 G-4, G-6; re-run at §6.2 |
| Inheritance | No `pg_auth_members` row for `anon`/`authenticated` | D2 §3.1 G-7; re-run at §6.2 |
| Residual | `postgres` / schema owner can always truncate | Accepted — the key-custody boundary (D4 §7 risk 5) |

### 6.4 If a verification fails after COMMIT

**Freeze. Do not revoke, do not drop, do not repair.** This is a deliberate departure from Revision 1, per correction 5. The reasoning holds because the failure occurs **before any fixture exists and before any caller is deployed**: the three objects are inert, nothing reads or writes them, and an audit table with no rows and no consumer is not an exposure — it is a question. Freezing preserves the exact ACL state that answers it. Remediation (a revoke, or the L1 drop) is destructive-adjacent and requires authorization under C9.

---

## 7. Preservation — full-row method

### 7.1 Why Revision 1 was wrong, and what replaces it

Revision 1 hashed a **hand-enumerated subset** of columns and then claimed byte-identical preservation. That claim was not supported: any column omitted from the list — `is_baseline`, `scenario_type`, `created_at`, `updated_at`, the period columns, or any column added later — could change without the digest moving.

The replacement hashes **the whole row as the server renders it**, so **no column is enumerated** and nothing can be silently excluded:

```sql
-- DOCUMENTATION ONLY. `to_jsonb(t)` covers every column that exists at run time.
select jsonb_object_agg(t.id::text, md5(to_jsonb(t)::text)) as per_row,
       md5(string_agg(md5(to_jsonb(t)::text), E'\n' order by t.id)) as aggregate
  from public.business_metric_snapshots t
 where t.id = any (array['<72 ids captured at P2>']::uuid[]);
```

### 7.2 Determinism requirements — all four must be honoured

| # | Requirement | Why |
|---|---|---|
| 1 | `set local timezone = 'UTC';` in **both** capture sessions | `timestamptz` values render in the session timezone; without pinning, the same row digests differently in two sessions and the comparison is meaningless |
| 2 | Same server version at P2 and P8 (**17.11**, PF §1) | A version upgrade between capture and re-check can change JSON rendering |
| 3 | `order by id` inside the aggregate, and `jsonb_object_agg` keyed by id | Row order must be fixed; jsonb key order is canonical in its own right |
| 4 | Both captures run as the same role, on the same database | `to_jsonb` exposes every column, so column-level visibility must not differ between runs |

`jsonb` text output normalises key order, so `md5(to_jsonb(t)::text)` is canonical for a given row, server version and timezone — [PG-SEMANTICS]. The per-row map is the primary artifact: it turns "something changed" into "**row X changed**", which an aggregate alone cannot.

### 7.3 The preservation assertions

| # | Assertion | Expectation | Note |
|---|---|---|---|
| P-1 | The 72 ids from P2 are all still present | 72 of 72 | Row **identity**, not just count |
| P-2 | Per-row digest map: identical key by key | 72 identical entries, 0 differences | **Full content, every column** |
| P-3 | Aggregate digest | identical | Secondary; P-2 localises |
| P-4 | `is_latest` set, `(business_id, id)` ordered | **identical** | Separate from P-2 because promotion changes it independently of content |
| P-5 | Exactly one `is_latest` per business that has one | unchanged from P2 | The partial unique index guarantees it; the assertion proves it |
| P-6 | The three businesses in PF §6.2 still hold their captured snapshot; the fourth (`e507bf87…`) still holds none | identical | PF §6.2 |
| P-7 | `created_by` NULL on all 72 | 72 | Inside P-2; asserted separately because D-13 depends on it |
| P-8 | `metadata->>'content_hash'` absent on all 72 | 0 rows | Inside P-2; asserted because the dedupe lookup depends on it |
| P-9 | CB-005B counts | 26 / 34 / 2 / 0 / 0 | PF §2; PF-VERIFIED baseline |
| P-10 | `dashboard_metrics` | 6 rows, identical digest | PF |
| P-11 | `documents`/`extracted_fields`/`profiles`/`business_entities`/`business_owners` | baseline + registered synthetic ids only | §3.4 I6 |
| P-12 | Policies on the seven S4 dependency tables | unchanged (3 + 3 + 3 + 1 + 1 + 1 + 0) — T-701 | PF §5.3 |
| P-13 | User-defined triggers on the seven tables | still zero (only the 12 pre-existing internal FK triggers on `business_metric_snapshots`) | PF §4 row 31 |

**`is_latest` may legitimately change only for a business an explicit promotion test targeted** (D3 T-807). Since C5 confines promotion to synthetic businesses, the expected value for P-4 is **identical** — and any difference is S15.

---

### 7.4 The read-only pre-test baseline — what it is, and what it is not

The baseline is **D2 §4.1.1**, captured at P2 in its own session and archived outside the database. It is three read-only captures and nothing else:

| Capture | Content | Why it exists |
|---|---|---|
| **Snapshot identity set** | every `business_metric_snapshots` id with `business_id`, `snapshot_type`, `snapshot_date` | P-1 asserts the same 72 ids come back, by identity rather than by count |
| **Promotion state** | `(business_id, latest_snapshot_id, snapshot_date)` where `is_latest` | The **only** state restoration can ever need (D2 §4.1.2). The audit records the *promoted* row, never the demoted one, so this capture is the sole record of what the demotion displaced |
| **Audit-surface absence** | `to_regclass` on the three S4 objects — three NULLs expected | There are **no audit records to baseline**, because no audit table exists yet. A non-NULL here is S3 (an S4 object already exists) |

The full-row digest (§7.1) runs alongside capture 1, so "nothing changed" is provable per row. Capture 2 is what **P-4/P-5** compare against, and capture 3 is the absence half of the S3 check.

**Three things the baseline is not.** It is not a backup, it does not authorize restoration, and it does not touch a single row — every statement is a `select`. Recording a baseline grants nothing; it only makes a later claim checkable.

---

## 8. The snapshot-count expectation

| Quantity | Expectation | Note |
|---|---|---|
| Rows among the **original 72 ids** | **exactly 72**, all digests identical | P-1/P-2 |
| Original rows with any modified column | **0**, including `is_latest` | C5 |
| Total `count(*)` | **72 + N**, `N` = distinct synthetic snapshots the RPC created | PF §6.2: 72 is a floor |
| Synthetic snapshots `N` | ≤ non-deduplicated accepted calls | Re-submitting identical content adds 0 rows |
| Audit rows added | **exactly the accepted calls**, deduplicated ones included | D2 §3 step 13 |
| Rows added by denied calls | **0**, in all three tables | T-903, T-414 |
| `is_latest` rows on a synthetic business | **exactly 1** at all times | `unique_latest_snapshot_per_business` |

```sql
-- DOCUMENTATION ONLY. All six must hold together at P8.
select
 (select count(*) from public.business_metric_snapshots
   where id = any (array['<72 ids>']::uuid[]))                              as original_rows,  -- 72
 (select count(*) from public.business_metric_snapshots)                    as total_rows,     -- 72 + N
 (select count(*) from public.snapshot_submission_audit)                    as audit_rows,     -- accepted calls
 (select count(*) from public.snapshot_submission_audit
   where business_id <> all (array['<synthetic business ids>']::uuid[]))    as foreign_audit;  -- 0
```

---

## 9. The write-capable execution channel

| Channel | DDL | DML | Verdict |
|---|---|---|---|
| Read-only API endpoint (`/database/query/read-only`) | **No** | **No** | PF §0: ran as `supabase_read_only_user` |
| The `supabase` connector | **No** — no `database:write` | **No** | Probes only |
| **SQL editor, schema owner, one explicit transaction, manually reviewed** | **Yes** | Yes | **Sanctioned apply channel** (D4 §2); must support `begin; … commit;` (S2) |
| `psql` / CI with a schema-owner connection string | **Yes** | Yes | Acceptable equivalent; recorded in C3 |
| The app's `SUPABASE_SERVICE_ROLE_KEY` via PostgREST | **No** — not the schema owner; PostgREST cannot run multi-statement DDL | Possibly, subject to grants | **Not the DDL channel** |

C3 must name the channel, its operator, the ref it addresses, and that it supports an explicit transaction. Applying SQL and deploying the caller are **different acts**: no caller is deployed here, so P7 tests the RPC directly. D2 §4 fixes the order — SQL first, caller second, never the reverse.

### 9.1 Proving the runner is transaction-capable — before P3, not after

**Established now, by inspection:** D2 contains **no transaction-control statement of its own** — no `BEGIN`, no `COMMIT`, no `ROLLBACK` at statement level (verified by `grep` over the file; the only `begin`/`end` tokens are the PL/pgSQL block bodies inside the function and the guard). The transaction is therefore the **runner's**, entirely. If the runner does not open one, nothing in D2 can compensate.

**Therefore the runner must be demonstrated, not assumed.** Autocommit is the default in several common channels, and an undocumented autocommit assumption is precisely the failure mode that voids every protection in this package: the guard would still raise, but each prior statement would already be committed, and there would be nothing left to roll back.

**The probe — inert, read-only, creates nothing, writes nothing.** Run at P0 in the authorized window and record the three results:

| Step | Statement | Reading |
|---|---|---|
| 1 | `begin;` | Submitted **on its own** |
| 2 | `select state from pg_stat_activity where pid = pg_backend_pid();` | **Submitted separately** (a new submission). `idle in transaction` ⇒ the session **kept the transaction open** across submissions — the channel is transaction-capable. Anything else ⇒ it did not |
| 3 | `rollback;` | Closes it; the session returns to `active`/`idle` |

A session can always read its own `pg_stat_activity` row, so no elevated privilege is needed. The discriminator is honest: a channel that commits each statement cannot report `idle in transaction` after step 1, because the transaction ended.

**The alternative, if a channel wraps a whole submission in one implicit transaction**, is acceptable **only** when demonstrated — and demonstrated means: a deliberately failing statement in the middle of a multi-statement submission leaves nothing committed. That demonstration is itself destructive-adjacent and is **not** part of this documentation turn; until it is performed and recorded, treat the channel as unproven.

**Three binding rules follow:**

| # | Rule |
|---|---|
| **T-1** | **D2 must be submitted as ONE script.** A channel that requires splitting it into several submissions cannot preserve the ordering guarantee, and the guard would observe an incomplete ACL state — S2 stop |
| **T-2** | The probe result is recorded in the execution log (§Appendix C) as **`transaction-capable: yes/no` with the observed `state` value**. "Yes" must be the observed string, not an inference from the channel's documentation |
| **T-3** | **No autocommit assumption is permitted anywhere.** If the probe is not run, or its result is not recorded, the run does not begin — regardless of how the channel is documented |

**Not performed in this turn:** no `begin`, no `rollback`, no probe, no connection. Step 1–3 above is what the authorized window must do.

---

## 10. Cleanup and retention limits

### 10.1 Why the residue is not freely deletable

| Constraint | Effect |
|---|---|
| Audit table: zero policies, `service_role` holds only `SELECT, INSERT` | **No application path can delete or truncate audit rows** |
| `ON DELETE RESTRICT` on `snapshot_id`, `business_id`, `actor_profile_id` | A synthetic snapshot, business or profile **cannot be deleted while an audit row references it** (PF §7 R1, R8) |
| `business_metric_snapshots` has no DELETE policy | Deleting synthetic snapshots needs a privileged session |
| Append-only | A wrong fixture is **superseded**, never edited — and in this window not deleted either |

### 10.2 The only valid teardown order — and it is **not** in-window

```
(after separate authorization under C9, in its own window)
1. Export the audit rows
2. DELETE the synthetic audit rows        -- privileged; nothing cascades from here
3. DELETE the synthetic snapshots
4. DELETE the synthetic extracted_fields → documents
5. DELETE the synthetic business_owners → business_entities → profiles
6. Optionally drop the three S4 objects   -- destroys audit history permanently (D2 §4)
```

**Wrong orders:** business first → `RESTRICT` violation; audit table first → attribution history gone and snapshots left unattributable; any truncate → impossible for the API roles, and destroys evidence if done as owner.

### 10.3 Retention options — recorded at P9, executed only under C9

| Option | What happens | Authorization |
|---|---|---|
| **R1 — keep everything** (default) | Objects and residue stay; the project remains an S4 reference environment | **None needed** |
| **R2 — export, delete residue, keep objects** | §10.2 steps 1–5 | C9 |
| **R3 — full teardown** | §10.2 steps 1–6. D2 §4's caveat applies: the pre-patch revision is non-functional, so this restores a broken state rather than a working one | C9 |

### 10.4 What never needs cleaning, and what is permanent

Untouched by construction: the 72 snapshots, 78 documents, 248 fields, 8 profiles, 9 business entities, 3 ownership rows, 6 `dashboard_metrics` rows, every CB-005B record. If any of them needs cleanup, the run is already an incident (S12/S14/S15).

Permanent under R1: synthetic profiles and businesses that carry audit rows cannot be deleted without deleting those rows first, and will remain visible to any later query on `profiles` / `business_entities`; synthetic snapshots stay in `business_metric_snapshots`, keeping its total above 72 for every future reader — which is why §8 asserts *original set* + *delta* rather than one number.

---

### 10.5 Restoration of synthetic rows — a separate, separately authorized act

`ON DELETE RESTRICT` makes deletion an ordering problem; **restoration** is a different problem, and the procedure is fixed in **D2 §4.1.2**. The properties that matter here:

| # | Property |
|---|---|
| 1 | **Never in-window.** Restoration is its own window under its own authorization (C9). Nothing in P0–P9 restores anything |
| 2 | **Synthetic rows only, by construction.** Restoration is bounded by the external synthetic registry — no pre-existing `business_id` is in it, so no pre-existing row is reachable |
| 3 | **`is_latest` only.** No financial column, no `metadata`, no `data_confidence_score`, no `created_by` is ever restored, rewritten or reset — on any row, synthetic or real |
| 4 | **Baseline-driven.** The target state is D2 §4.1.1's promotion capture, not an inference about what it "probably" was |
| 5 | **CB-005B is untouchable.** No `provider_*` record is updated, deleted, truncated, reset or re-keyed by the migration, its rollback, or any restoration. That surface is outside this package's write set entirely (§2.3) |
| 6 | **One transaction**, with a capture before and a re-read after |

The distinction the reviewer should hold onto: **the migration cannot damage a financial record** — it writes none, and the baseline proves it. The only existing-row state it can move is a promotion flag, on synthetic businesses only, and that is the one thing restoration is for.

---

## 11. Rollback levels

**Only L0 acts inside the window.** L1–L3 are *proposals* that require authorization under C9, because each destroys something.

| Level | When | Action | Residual |
|---|---|---|---|
| **L0 — uncommitted abort** | S4, S5, S6 at P3 | `ROLLBACK` the transaction. Nothing was created, so nothing is destroyed — this is the one remediation the window performs | **Nothing changed.** No object, no row, no grant |
| **L1 — committed, no fixtures** | S7, S8, S9, S10 at P4/P5 | **Freeze.** Propose: `drop function create_reviewed_fields_snapshot(11 args)` → `drop function s4_mapping_contract(text)` → `drop table snapshot_submission_audit` (that order — D2 §4). Execute only under C9 | Objects present and inert until authorized |
| **L2 — committed, fixtures exist** | S12–S16 at P7/P8 | **Freeze.** Export the execution log and the audit rows. Propose §10.2 steps 1–5, then L1's drops. **No deletion now** | Residue intact as evidence; `is_latest` restored **only** if a real business was touched, which C5 forbids |
| **L3 — stop mid-run** | Any S at P6–P8 | **Freeze.** No repair, no cleanup, no re-run in the same window. Report and escalate | Whatever the freeze left, fully documented |

### 11.1 What rollback cannot do

- **Reconstruct promotion state.** The audit records the *promoted* snapshot, never the demoted row (D2 §3 step 11, §4). Only the P2 `is_latest` capture allows manual restoration — the strongest argument for C5.
- **Restore deleted audit history.** Dropping the table destroys it (D2 §4).
- **Un-deploy a caller** — no caller is deployed here.
- **Restore a working baseline.** "Rolled back" means "as it was"; the pre-patch path is non-functional.

---

## 12. Final recommendation

> **CONDITIONAL GO** — to authorize S4 Gate B **implementation in `xrvahykvkuiuglskmctd`** as host, strictly inside this plan.
> **NO-GO for execution** until C1–C9 are recorded **and the environment is acknowledged as shared, not isolated (B13)**.
> **NO-GO for endpoint deployment** — the D6 §3–§4 text is **proposed, not built, not deployed**, and the endpoint currently deployed still bypasses the RPC (B9).

The environment question is settled: PF established no S4 object exists in any schema, all 32 structural dependencies hold, the migration touches no existing policy or column, and CB-005B's evidence surface is intact and quantified.

**What the environment is not.** `xrvahykvkuiuglskmctd` is the **existing shared test project**, not an isolated one (**B13**). Nothing about its surroundings contains a mistake: it already hosts this workspace's evidence surface — including CB-005B's records and the deployed eight-profile roster — and other work reads it. The control that makes S4 safe there is a **synthetic-only write boundary**: every S4 write lands on synthetic rows created in §3, or on the three objects the migration creates. **Nothing else is written.** Reuse is defensible **only because** of that boundary plus the per-table baselines, which is why C5 and C7 are mandatory rather than prudent, and why S11/S12/S13 are **freezes rather than cleanups**.

**Conditions that flip this to NO-GO:** promotion must touch a real business (C5); no schema-owner channel that supports an explicit transaction — **including a channel whose transaction capability is merely asserted rather than probed (§9.1)** (C3/S2); D2 cannot be applied **verbatim** in one submission (the guard block is now part of it, so altering, omitting or splitting it forfeits correction 1); the baseline cannot be captured first (C7); or the retention limit is unacceptable (C4).

**What does *not* hold the migration up, and what does.** Of the **six** recorded blockers, **only B9 blocks anything here, and it blocks the application phase, not the migration.** B9 (the endpoint's actor boundary) is **OPEN**, with its remediation written but undeployed (D6 §3–§4). **B10 is RESOLVED as policy**, option (b) — strict id equality enforced by the caller's own helper, the shared resolver untouched — so it no longer blocks anything; its implementation rides in the same undeployed change-set as B9. **B11 is OPEN but out of scope**, inherited by all 20 consumers of the shared resolver and deliberately not fixed here. **B12 is OPEN — a provisional self-service onboarding policy requiring explicit owner approval**, the `{active, incomplete}` eligibility question; it is adopted so the migration can be specified at all, and it is **not approved**. **B13 is OPEN** — the target is shared, and the acknowledgement described above is a written precondition, not a formality. **B14 is OPEN** — a strict population-completeness guarantee needs one closure guard inside the RPC; it is **proposed and not applied**, and it is the one item whose adoption would change D2 again.

None of them blocks **P3–P6**: the migration is additive and the RPC is proven correct against a *claim*. **B9 alone blocks the application phase** — no endpoint ID may be recorded as passed while it is open. **B13 blocks P0**, since C1 cannot be recorded without the written acknowledgement. **B14 blocks nothing today but must be decided before P3**, because adopting it afterwards means a second DDL pass over objects that already exist. Stating any of these as migration blockers would be as wrong as dropping them entirely.

**Planned classifications are not results.** Every number in §5 is a **plan**, derived from the artifacts and the code as read: **83 executable in the migration window, of which 71 are planned `DB-PASS` and 12 planned `PARTIAL` (71 + 12 = 83)**, plus **21 deferred** and **1 blocked**. **Nothing has been run.** **D2 has never executed, has not been certified, and no test in the register has passed or failed except the three static checks named below** — there is no observed result anywhere else in this package. The only **observed** results are the three static checks against today's tree — **T-903b, T-905 and T-904(a)** — and all three **fail**. All three are planned `DB-PASS` **in the corrected tree**, so the gap between plan and observation is exactly the undeployed remediation (D6 §3–§4) and nothing else; the failures are evidence for B9 and for the helper that does not yet exist, not a defect in the checks. When P7 runs, the log records observed outcomes beside the planned ones, and the two must never be conflated in any summary of this package — **a `PARTIAL` is not a pass, a planned pass is not a result, and P7 itself has not happened.**

**Unchanged regardless of the verdict:** no SQL executed, no fixture exists, no migration applied, no code changed, no function deployed, no test run. Production, CB-005A, CB-005B, provider sync, Galileo and the Digital Twin are untouched.

**Stopping here. Gate B execution remains unauthorized.**

---

## Appendix A — D4 probe expectations are re-baselined, not asserted

D4 §3's expected values are production-derived. They are [PLAN-PROBE] at P2 unless PF verified them.

| Probe | D4 expectation | Status here |
|---|---|---|
| 1 — identification / absence | `cb005b_marker = 1` → stop unless authorized | **[PF-VERIFIED]**: marker present, S4 objects absent; the stop is overridden by **C1** |
| 2 — snapshot count + `is_latest` set | 72; record the set | **[PF-VERIFIED]**: 72; three holders (PF §6.2) + one business with none |
| 3 — `dashboard_metrics` | record count + `max(updated_at)` | Count **6** [PF-VERIFIED]; `max(updated_at)` **[PLAN-PROBE]** |
| 4 — null-year documents carrying accepted/corrected fields | **2** | **[PLAN-PROBE]**. PF measured a broader population: 55 of 71 business documents have `year IS NULL` at any review status. The probe's narrower predicate was not run; **2 is not assumed** |
| 5 — unbound / duplicate-bound profiles | 1 unbound, 0 duplicates of 8 | **[PLAN-PROBE]**. 8 profiles confirmed (1 active, 7 incomplete); the split is unverified |
| 6 — monitoring query | `valid = 80, no_score = 168, unusable = 0` on 248 rows | **[PLAN-PROBE]**. 248 rows and 13 accepted/corrected confirmed; **the distribution is unverified** |
| 7 — `extensions.uuid_generate_v4` | 1 row, else switch to `gen_random_uuid()` | **[PF-VERIFIED]** present; no substitution needed |
| 8 — `pg_default_acl` | confirms `anon`/`authenticated` get DML + EXECUTE | **[PF-VERIFIED]**, and broader: the grant includes **TRUNCATE** and `MAINTAIN` (PF §5.1) |
| 9 — snapshots table + partial unique index | present | **[PF-VERIFIED]** both present, index definition exact |
| 10 — `is_super_admin()` body | already read, no action | [D1–D4] |

P2 records probes 3–6 as **values**, not as pass/fail assertions. Only probes 1, 2, 7, 8 and 9 carry an expectation — and probe 2's is *72 plus a recorded set*, not a guarantee the set survives the window unchanged.

---

## Appendix B — Unresolved blockers and open divergences

None of these is silently resolved. Each needs a decision.

| # | Item | Status | Why it cannot be closed here |
|---|---|---|---|
| **B1** | ~~D2 does not contain the in-transaction guard, so the applied text diverges from the archived artifact~~ | **RESOLVED — Revision 3** | The guard is now archived **inside D2** as the final statement of §3, documented at D2 §3.1. The applied text is D2 verbatim, this plan carries no copy, and there is no delta left to authorize. Every other blocker below stands unchanged |
| **B2** | **T-411 has no usable failure-injection point.** "Forced failure after the insert, before the audit" needs a temporary `BEFORE INSERT` trigger on the audit table (prohibited DDL) or another injection mechanism; a caller-side `ROLLBACK` proves caller atomicity, not the function's internal atomicity | **BLOCKED** | Either authorize an injection mechanism in a separate window, or record T-411 as proven-by-construction (the function is one transaction) rather than executed. **Not marked passed** |
| **B3** | **T-204's expert-access half** needs an expert-access relationship fixture whose tables are outside this plan's allowlist | **PARTIAL** | The no-relationship half runs DB-side (P-TM → `SNAPSHOT_FORBIDDEN`); the expert-access relationship case is endpoint/out-of-scope |
| **B4** | **`provider_credentials` baseline is redacted** by tooling (PF §7 R9) | **OPEN** | CB-005B preservation for that table cannot be asserted in-window until the count is captured out-of-band at P2 |
| **B5** | **T-301 cannot be fully verified before deployment** — it compares D1's mirror to the SQL function, and the deployed `createSnapshotFromReviewedFields` is the pre-patch revision | **DEFERRED HALF** | Static comparison against D1 runs now; parity with the *deployed* file is re-verified in the application phase |
| **B6** | **T-706 is deferred**, so rollback is proven by inspection (D2 §4 + L1's statement order), not by execution | **DEFERRED** | Executing a rollback is destructive → C9 |
| **B7** | **D4 probes 4/5/6 remain production-derived** | **OPEN until P2** | Recorded, not asserted (Appendix A) |
| **B8** | **Post-commit failure has no in-window remedy** by design | **ACCEPTED RISK** | §6.4: the objects are inert, so freezing preserves the evidence and costs nothing |
| **B9** | **The deployed endpoint does not implement the authenticated actor boundary.** Five defects (§5.5 A-1…A-5): swallowed `auth.me()`, authorization gate skipped when unauthenticated, the *document owner's* role tested instead of the caller's, `created_by` falling back to a non-session identity, and **the RPC bypassed** by a direct service-role write with a non-atomic demotion. The shared `authz/actor.ts` boundary exists and is not used (`0` imports; `base44_user_id` absent from the file) | **OPEN — REMEDIATION PROPOSED, NOT DEPLOYED** | The remediation is **written and unbuilt**: a strict resolver (D6 §3) and a replacement endpoint (D6 §4) that addresses all five defects **in text**. Nothing is deployed, type-checked or tested, so **the endpoint as it stands remains unsafe for deployment** — it still writes the snapshot table directly and demotes in a second statement, leaving a crash window with two `is_latest` rows. It lives entirely **above** the RPC, so applying D2 is safe and changes none of it: **this blocks the application phase, not the migration.** Closing it is the three-step sequence in §5.4, after which T-101…T-111, T-207…T-210b, T-806, T-811, T-811b, T-903, T-903c and T-904(b) can run. **No endpoint ID may be recorded as passed before then.** **Read D3's header phrase "B9 is closed here in text only" as *the remediation is written*, never as a status change** — no document in this package records B9 as closed, and until deployment none may |
| **B10** | **Strict `base44_user_id` binding contradicted the platform library.** The requirement is id-equality only; `authenticateActor()` binds by `profiles.base44_user_id` **and then falls back to an `ilike('email')` match**, while D3's T-102 expects **403** in exactly that case | **RESOLVED — POLICY (Revision 5), option (b)** | The owner chose **(b)**: the snapshot caller enforces strict id equality **itself** and refuses an email-only match; **`authenticateActor` is not changed**. T-102 therefore stands as written and **D2 stands unchanged**. Blast radius is one endpoint plus one new helper file, leaving all 20 existing call sites untouched. Its *implementation* is the D6 §3–§4 text, which is part of the same undeployed change-set **B9** already blocks — so B10 is settled as **policy** while its code remains as unproven as everything else here |
| **B11** | **The shared resolver masks a duplicate binding.** `authenticateActor` reads the id branch with `.maybeSingle()`, so two profiles sharing a `base44_user_id` make PostgREST answer *multiple rows* as an error with a **null body**; the id branch yields nothing and the **email fallback then decides** which profile wins | **OPEN — OUT OF SCOPE FOR THIS PACKAGE** (new in Revision 5) | Found while choosing B10's option (b) (D6 §2.3). Every one of the resolver's **20 consumers** inherits it. **Deliberately not fixed here**: it changes shared behaviour the instruction forbade touching without separate approval, and doing so needs a per-consumer compatibility read that has not been done. It is the **first** thing a future option-(c) change-set must correct. It does **not** affect this migration, and it no longer affects the snapshot endpoint, which stops using the shared resolver entirely once D6 §4 is deployed |
| **B12** | **`profile_status` eligibility for snapshot authority is a working policy, not a settled product decision.** D6 §3.2 admits **`{active, incomplete}`**; the requirement's literal wording is "exactly one **active** profiles row" | **OPEN — PRODUCT-POLICY DECISION** | Adopted because `incomplete` is the column **DEFAULT** and **7 of the 8** deployed profiles carry it, so a literal reading would refuse almost every real owner (D6 §3.2). The two layers agree today — D2's `v_active_statuses` is the same pair — but if the owner wants literal `active` only, it is a **two-line** change **here and in D2**, and the D2 half makes it **a migration change with its own re-authorization**. Recorded so the choice stays visible rather than buried in a constant. **Not decided here** — and in Revision 7 it is labelled for what it is: a **provisional self-service onboarding policy requiring explicit owner approval**, not a settled rule and not something this package approves |
| **B13** | **The target is a SHARED test project, not an isolated one.** `xrvahykvkuiuglskmctd` already hosts this workspace's evidence surface — CB-005B's records, the deployed eight-profile roster, 72 snapshots, 248 extracted fields — and other work reads it. An earlier revision of this package described it as isolated and used that as the containment argument | **OPEN — WRITTEN ACKNOWLEDGEMENT REQUIRED BEFORE P0** (new in Revision 7) | Corrected in documentation: the control is a **synthetic-only write boundary** (§2: synthetic rows + the three new objects, nothing else), plus the per-table baselines (P2) and the freeze rules (C5/C7, S11–S15). No isolation exists to fall back on, so the boundary is load-bearing rather than belt-and-braces. **P0 cannot be recorded without the owner's written statement that the project is shared and every write stays inside that boundary.** Documented only — **no environment, project or setting was changed** |
| **B14** | **A strict population-completeness guarantee is not achievable in the caller.** The caller's count-closed read (D6 §4 step 4) refuses on any visible count movement, but a net-zero concurrent change — one row accepted while another is skipped, same totals — leaves no trace above the RPC. Only the transaction can prove that the rows it stored equal the contributors it saw plus the fields it skipped | **OPEN — PROPOSED, NOT APPLIED, NOT AUTHORIZED** (new in Revision 7) | The exact change is written in **D6 §0A.3**: one `count(*)` over the accepted/corrected population compared with the contributor and skipped totals, raising `SNAPSHOT_POPULATION_INCOMPLETE` (409). **It is not in D2 and must not be applied**: adopting it means editing D2, re-authorizing the migration, restating the error-code count at **25**, and a second DDL pass over objects that would already exist. **A decision is required before P3**; until then the residual is an **accepted, named risk** (Appendix B risk 10) and **no document may claim population completeness is guaranteed.** **REVIEW COMPLETE (Deliverable 7):** an independent design review read D2, D3, D6 and this plan against each other and found that **the proposed guard cannot fire at all** — its stated insertion point precedes the assignment of `v_contributor_count` (assigned at D2 step 7, after the contributor value loop), so the predicate evaluates to `NULL` and `IF NULL` never raises. It is also **not sufficient**: `p_skipped` is unverified caller input, so padding the skip list with a foreign, pending, nonexistent or contributor id satisfies the equality while eligible rows are omitted. **Recommended design: exact eligible-field-ID set reconciliation in one statement (Design B), 11-parameter signature preserved, one error code.** The proposed SQL exists only as `VISION_S4_GATE_B_07A_B14_PROPOSED_PATCH.md` — **not applied, not merged, D2 byte-identical.** The count guard is **withdrawn as a proposal** |

---

## Appendix C — Execution log template

One record per window. Fields agree with C1–C9, P0–P9, S1–S18 and L0–L3.

| Field | Recorded |
|---|---|
| Window id / date / operator | |
| C1–C9 authorizations (verbatim, who, when) | |
| Write channel: name, operator, ref addressed, explicit-transaction capable (yes/no) | |
| P1: `current_database`, `current_user`, `cb005b_marker`, absence probes | |
| P2: CB-005B counts 26/34/2/0/0 + credential count (out-of-band) | |
| P2: snapshot count 72 · 72 ids · per-row digest map · aggregate digest · `is_latest` set | |
| P2: server version · `timezone` setting used for the capture | |
| P2: `dashboard_metrics` count + digest · documents/fields/profiles/entities/owners | |
| P2: probes 3–6 values · privilege snapshot · `pg_auth_members` | |
| P0: **runner transaction probe** (§9.1) — `begin;` → observed `state` → `rollback;` — **transaction-capable: yes/no**, with the literal `state` value | |
| P2: **baseline per D2 §4.1.1** — snapshot id set · `is_latest` set · three `to_regclass` NULLs | |
| **Actor boundary at window open** — §5.5 applied? **B9 open/closed** (D6 §3–§4 deployed: yes/no). **If open: no endpoint ID credited**, all 21 deferred IDs `NOT RUN` | |
| **Actor boundary static checks (run, not deferred)** — T-903b · T-905 · T-904(a): `PASS`/`FAIL` each, against the tree actually present at window open. Against today's tree all three are **`FAIL`**; a `PASS` requires D6 §3–§4 deployed | |
| P3: D2 applied verbatim (guard block present, `$s4_acl_guard$` tag intact) · transaction started · guard result · committed (yes/no) · any lock waits | |
| P4: independent session — 24 table expectations, PUBLIC/`relacl`, 6 function expectations + `proacl`, memberships, anon-key probe | |
| P5: columns, indexes, RLS state, policy count (0), signatures, `service_role` grants, count + digest unchanged | |
| P6: registry — every synthetic id, by table | |
| P7: per ID — **observed** `DB-PASS` / `DB-FAIL` / `PARTIAL`, recorded against the **plan** of 83 (71 planned `DB-PASS`, 12 planned `PARTIAL`); every `PARTIAL` names its deferred endpoint half; all **21** deferred IDs marked `NOT RUN`; the **1** blocked ID marked `BLOCKED` | |
| P8: every P-1 … P-13 result, and the §8 reconciliation (original 72 · total · N · audit rows · foreign audit 0) | |
| P9: retention option recorded (R1/R2/R3) — **action taken: none** | |
| Stop conditions hit (S1–S18) and the level reached (L0–L3) | |
| Final verdict | |