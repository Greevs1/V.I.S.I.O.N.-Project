# Phase S4 — Gate A Revision 5 · **Reconciliation, findings, and test plan**
## Companion to `VISION_SECURITY_S4_GATE_A_REVISION_5.md` · PROPOSAL ONLY

**Nothing here has been executed. No test has been run; no code has been written.**

---

## 6. Reconciliation against the verified schema, constraints, permissions and signatures

Every object and statement in the proposed migration, checked against evidence read from the live database.

| Proposed object / statement | Verified fact it depends on | Status |
|---|---|---|
| Contract function returns `jsonb`, `immutable` | No name collision: `pg_proc` has neither `s4_mapping_contract` nor `create_reviewed_fields_snapshot` | **PASS** |
| Snapshot function, 11-argument signature | The Base44 call passes exactly those 11 named parameters, in order and type | **PASS** |
| `insert into business_metric_snapshots (...)` | `business_id` NOT NULL (supplied); `id`, `snapshot_date`, `snapshot_type`, `is_baseline`, `is_latest`, `created_at`, `updated_at` are NOT NULL **with defaults**; every other column is nullable | **PASS** — no NOT NULL column is left unfilled |
| `created_by` omitted from the INSERT | nullable, no default, FK → `profiles(id)`, 0 of 72 rows written | **PASS** (D-13) |
| `data_source = 'advisor_review'` | permitted by `business_metric_snapshots_data_source_check` | **PASS** |
| `snapshot_type ∈ {historical, tax_year, projection}` | permitted by `business_metric_snapshots_snapshot_type_check` | **PASS** (C1) |
| `snapshot_date = make_date(year, 12, 31)` | year required (C4); range 1900–2100 prevents `22008`; observed years 2020–2025 | **PASS** |
| `metadata` jsonb write, then `@>` assertion | `metadata` is jsonb, default `'{}'`, nullable | **PASS** |
| Idempotency lookup on `metadata->>'content_hash'` | no index required for correctness (expression index deferred, D-12) | **PASS** |
| Demote-then-promote `is_latest` | `unique_latest_snapshot_per_business` deployed — partial, `WHERE is_latest = true` | **PASS** (C9) |
| `insert into dashboard_metrics ... on conflict (business_id) where business_id is not null` | `ux_dashboard_metrics_business_id` deployed — **partial**; `profile_id` NOT NULL and supplied | **PASS** (C2/C2b) |
| `latest_snapshot_id = v_snapshot_id` | nullable uuid, FK → `business_metric_snapshots(id)` ON DELETE SET NULL, indexed | **PASS** |
| `coalesce(excluded.x, dm.x)` in `DO UPDATE` | `annual_revenue`/`net_profit` are nullable numeric; the alias form avoids ambiguity | **PASS** |
| Audit table references | `business_metric_snapshots(id)`, `business_entities(id)`, `profiles(id)` are all uuid primary keys | **PASS** |
| Audit table name | `to_regclass('public.snapshot_submission_audit')` is null; `provider_operation_audit` is the only `%audit%` table | **PASS** |
| `REVOKE`/`GRANT` on all three objects | `service_role` holds SELECT/INSERT/UPDATE on the target tables; `pg_default_acl` grants `anon`/`authenticated` | **PASS** (C3) |
| `ENABLE ROW LEVEL SECURITY`, zero policies | RLS enabled on all six existing tables, `relforcerowsecurity` false; `service_role` writes today (72 rows exist) | **PASS** |
| Advisory lock key | `hashtextextended(text, bigint)` is `pg_catalog` — available under `search_path = ''` | **PASS** |
| `md5`, `jsonb_set`, `jsonb_build_object`, `make_date`, `avg`, `clock_timestamp` | all `pg_catalog` | **PASS** |
| `extensions.uuid_generate_v4()` default on `id` | schema-qualified in the catalog, so independent of `search_path` | **PASS** |
| UI selector sends `projection` | requires the one-line change in the same change-set | **PASS with C1 applied** |
| No dynamic SQL anywhere | targets are matched against a declaration; nothing is concatenated into a statement | **PASS** |

### 6.1 Remaining first-call runtime blockers

**After C1, C2, C2b and C9: none.** Every statement the function executes is supported by a verified column, constraint, index or privilege. The blockers that existed were exactly the four corrected in Revision 5 — the invalid type literal, the missing NOT NULL `profile_id`, the un-inferred partial-index conflict target, and (would-be) the redundant index.

Three further items are **preconditions, not code defects**:

| # | Precondition | Handling |
|---|---|---|
| 1 | **2 of 5** documents carrying accepted/corrected fields have no `year` (62 of 78 documents overall) | Refused with a controlled 409 and a clear message. **Documents are not modified** (per instruction). A data task for the user, not a blocker. |
| 2 | The UI selector must ship **with** the migration | Same change-set (C1). Shipped alone in either direction, one side refuses the other's value. |
| 3 | Isolated-environment application before production | Gate B scope, unchanged. |

**Open design decisions that are not blockers:** D-15 (approve the audit table; without it, deduplicated submissions are recorded nowhere durable), D-16 (accept the cross-writer limitation), D-17 (approve requiring a year), D-18 (approve the UI line).

---

## 7. Findings recorded, not fixed (separate approval)

| # | Finding | Bearing |
|---|---|---|
| **P-1** | RLS on `business_metric_snapshots`, `dashboard_metrics` and `extracted_fields` grants INSERT/UPDATE to any identity `can_access_business()` admits — including `team_member` and assigned advisors, which the snapshot policy denies. The RPC is therefore **not the only write path** to these tables. | The honest scope of this packet's integrity guarantees. Narrowing those policies is its own change, with its own RLS review. |
| **P-2** | `can_access_business()` resolves `auth.uid()`, and 7 of 8 profiles have `auth_user_id` NULL — the identity link is largely broken, so those policies are effectively deny-all today. | Explains why P-1 has not surfaced; relevant to any future RLS work. |
| **P-3** | `anon` holds `INSERT/UPDATE/DELETE` on `business_metric_snapshots` via default ACL. Contained only by RLS and by `auth.uid()` being NULL. | SEC-031/SEC-032 debt, live and confirmed. |
| **P-4** | `ownershipConcentrationEngine`, `ownershipAdjustmentEngine` and `expandStrategyOpportunities` select `revenue`/`enterprise_value` from `dashboard_metrics`; **neither column exists** (the equivalents are `annual_revenue`/`current_business_value`). | Pre-existing defect outside S4; those queries error and fall back. |
| **P-5** | `hydrateDashboardFromJourney` upserts snapshots `ON CONFLICT (profile_id, snapshot_date)`; **no unique index on those columns exists**. | Same class: the upsert cannot succeed as written. |
| **P-6** | `guestSessionService` upserts `business_owners` with `onConflict: 'profile_id,business_id'`; the deployed unique constraint is three-column `(profile_id, business_id, ownership_type)`. | Same class — the arbiter does not match. |
| **P-7** | Ownership grants are unrevocable today: `business_entities.profile_id` is never updated after creation, `business_owners.end_date` is never written, and deleting the entity is blocked by `NO ACTION` FKs from `dashboard_metrics` and `business_metric_snapshots`. | Product/administration gap; the RPC honours a future revocation immediately because it re-reads ownership at call time. |
| **P-8** | **No `provider_sync_*` function exists in the database**, while `provider_operation_audit` does. | Records the connected-business chain's actual deployment posture; no S4 bearing. |
| **P-9** | `business_metric_snapshots` has no DELETE policy, so audited snapshots cannot be deleted while audit rows reference them (`RESTRICT`). | Deliberate: it is what makes the audit trail meaningful. Noted so it is not a surprise at rollback time. |

---

## 8. Updated adversarial and regression test plan

Consolidates Rev 2 §12, Rev 3 §7 and the Revision 5 corrections. **Nothing is executed now.** Assertion counts are taken before and after on `business_metric_snapshots`, `dashboard_metrics` and `snapshot_submission_audit`.

### 8.1 Adversarial — identity, authority, status

| # | Scenario | Expected |
|---|---|---|
| ADV-1 | Forged actor id in the body (`profile_id`, `actor_profile_id`, `business_id`, `created_by`) | Ignored; decision and attribution unchanged; no write by the forged identity |
| ADV-2 | Direct RPC call with a wrong `p_actor_profile_id` and the service key | `SNAPSHOT_FORBIDDEN`; zero writes |
| ADV-3 | Suspended profile, any role including `super_admin` | 403 at the Base44 gate; zero writes |
| ADV-4 | Suspended **and** assigned advisor | Refused — status outranks everything |
| ADV-5 | `invited` profile that owns the business | 403 — not in the allowlist |
| ADV-6 | Advisor, assigned, with D-4 off | 404 / `SNAPSHOT_FORBIDDEN`; zero writes |
| ADV-7 | Force the assignment column to name a genuinely assigned profile | Still refused while the constant is false — proves the branch is disabled, not merely unreachable by data |
| ADV-8 | `team_member`; expert-access-only identity | Both denied (D-2), even though RLS would admit them (P-1) |
| ADV-9 | Owner of A names a document of B | 404; zero writes |
| ADV-10 | `business_owners` row with a past `end_date`; and one with a future `end_date` | Past: denied. Future: allowed until that date |
| ADV-11 | No session | 401; zero writes |
| ADV-12 | Authorization lookup forced to fail (fixture) | Base44 **500**, not 403/404; the RPC aborts; zero writes |

### 8.2 Adversarial — value, source, contract

| # | Scenario | Expected |
|---|---|---|
| ADV-13 | Financial value in the body | No effect; the field row's value lands |
| ADV-14 | Field id from another business; from another document | `SNAPSHOT_FIELD_NOT_CONTRACTED`; zero writes |
| ADV-15 | Field not accepted/corrected | Same |
| ADV-16 | Substitution: `annual_revenue` fed by an accepted `total_expenses` row | `SNAPSHOT_FIELD_NOT_CONTRACTED`; zero writes |
| ADV-17 | Target not in the contract (`data`, `revenue`, `metadata.net_worth`) | `SNAPSHOT_TARGET_NOT_IN_CONTRACT` |
| ADV-18 | Reserved metadata target (`metadata.provenance`, `metadata.content_hash`, `metadata.basis`) | `SNAPSHOT_RESERVED_METADATA_KEY` — the extracted-key guard, now effective |
| ADV-19 | Wrong `op`; `direct` with two ids; `sum`/`mean` with exactly one id | Mismatch / cardinality. **`sum`/`mean` with one row is VALID** (cardinality `many` means one or more) |
| ADV-20 | Unknown mapping version; unknown document type; contradicting basis | Three matching exceptions |
| ADV-21 | Duplicate target; duplicate field id across targets | `SNAPSHOT_DUPLICATE_TARGET` / `SNAPSHOT_DUPLICATE_FIELD` |
| ADV-22 | NULL `accepted_normalized_value` in an aggregate, and on a direct target | `SNAPSHOT_FIELD_VALUE_MISSING`; **no** partial total, never 0 |
| ADV-23 | Debt schedule with no accepted `loan_balance` | `total_debt` **absent**, not 0 |
| ADV-24 | Debt schedule with several loans | `total_debt` = Σ; `metadata.mean_interest_rate` = mean; **no** `weighted_interest_rate` key |
| ADV-25 | Tax-return document | `metadata.basis = 'tax'`; provenance lists tax-basis field names; values untouched |
| ADV-26 | Accepted field mutated between the caller's read and the RPC | The committed row's value lands (values are read in-transaction) |

### 8.3 Revision 5 — new and corrected tests

| # | Scenario | Expected |
|---|---|---|
| **T-N1** | `snapshotType: 'projection'` | **Accepted**; stored `snapshot_type = 'projection'` — proves the CHECK admits it |
| **T-N2** | `snapshotType: 'projected'` | `SNAPSHOT_INVALID_TYPE` → 400; zero writes — proves the old literal is now refused |
| **T-N3** | Contract parity: the Base44 `FIELD_CONTRACT` vs `s4_mapping_contract('s4.mapping.v1')` | Identical declarations; a deliberate drift fails the test rather than a snapshot |
| **T-N4** | **Year gate** — document with `year` NULL | `SNAPSHOT_YEAR_REQUIRED` → **409**, message names the year; zero writes; **document unchanged** |
| **T-N5** | **Year gate** — `year` = 1800 and `year` = 3000 | `SNAPSHOT_YEAR_IMPLAUSIBLE` → 409; zero writes; no `22008` |
| **T-N6** | **Year gate** — `year` not an integer | Refused at the Base44 pre-check; zero writes |
| **T-N7** | **Hash covers `business_id`** — identical field content for two different businesses | Two distinct `content_hash` values; neither dedupes against the other |
| **T-N8** | **Hash covers the stored confidence** — a source `confidence_score` edited, values unchanged | New hash ⇒ new snapshot, not a dedupe |
| **T-N9** | **Hash covers the date** — same document, `year` changed | New hash ⇒ new snapshot |
| **T-N10** | **Hash excludes mutable state** — identical content, differing `isLatest` and `updateDashboard` | Same hash; one snapshot; the second call reports `deduplicated: true` |
| **T-N11** | **Dashboard first write** — no `dashboard_metrics` row exists for the business | Exactly **one** row created, with `profile_id`, both metrics, `latest_snapshot_id` and `updated_at` set |
| **T-N12** | **Dashboard concurrent writes** — two genuinely concurrent promoted snapshots for one business | **Exactly one** `dashboard_metrics` row afterwards; no unique-violation error; no duplicate row |
| **T-N13** | **Dashboard partial metrics** — a snapshot with `annual_revenue` only | `net_profit` on the row is **unchanged**, not nulled |
| **T-N14** | **Promotion policy** — an older snapshot with `updateDashboard: true`, `isLatest: false` | `dashboard_skipped_reason = 'not_latest'`; dashboard untouched |
| **T-N15** | **Promotion policy** — a promoted snapshot older than the current latest | `promoted_over_newer: true`; allowed, and reported |
| **T-N16** | **Duplicate promotes** — a deduped request with `isLatest: true` | The existing row is promoted (demote first); exactly one `is_latest` row |
| **T-N17** | **Audit on the insert path** | Exactly one audit row: `deduplicated = false`, correct `content_hash`, canonical `actor_profile_id`, `dashboard_updated` matching the response |
| **T-N18** | **Audit on the dedupe path, different caller** | One snapshot, **two** audit rows (one per caller); metadata attribution is the **first** writer's; the second caller sees `deduplicated: true` |
| **T-N19** | **`created_by` is never written** | The column is NULL on every new row, matching all 72 existing rows |
| **T-N20** | **Identity tripwire** — forced metadata/date/confidence divergence | `SNAPSHOT_IDENTITY_LOST`; transaction rolled back; zero writes |
| **T-N21** | **Execution boundary** — `anon` and `authenticated` call both functions directly | `permission denied for function` for both; `service_role` succeeds |
| **T-N22** | **Audit table exposure** — `anon`/`authenticated` attempt SELECT/INSERT on `snapshot_submission_audit` | Denied: revoked privileges **and** RLS with zero policies |
| **T-N23** | **UI selection** — choose "Projection" in the review queue end-to-end | Snapshot created; no 400; the label reads "Projection" |
| **T-N24** | **Reordered selections** — the same field ids delivered in a different array order | Identical hash; `deduplicated: true`; identical provenance (ids aggregate in deterministic order) |

### 8.4 Positive and regression

| # | Scenario | Expected |
|---|---|---|
| P-1 | Owner and platform admin each on a valid document | 200; correct `business_id`, `profile_id`, `source_document_id`, `data_source`, `snapshot_date`, `data_confidence_score` |
| P-2 | Mapping parity across all six document types | Same mapped/skipped sets as the contract; every target resolves |
| P-3 | `updateDashboard` true/false; and with no mappable field | `dashboard_metrics_updated` / `dashboard_skipped_reason` correct; dashboard untouched when nothing is mappable |
| P-4 | `isLatest: false` | No demotion anywhere |
| P-5 | Response body | New keys added (`is_latest`, `dashboard_skipped_reason`, `promoted_over_newer`, `deduplicated`); existing keys intact |
| P-6 | Pre-existing snapshots | Untouched — no backfill, no rewrite |
| P-7 | Rollback | After the rollback SQL, both functions and the audit table are gone; row counts on `business_metric_snapshots` and `dashboard_metrics` unchanged |
| P-8 | **Concurrency** — two identical requests, and two differing requests both `isLatest` | One snapshot for the identical pair; exactly one `is_latest` row afterwards; no lost update |
| P-9 | Transaction rollback forced before the audit insert | Zero snapshot rows, zero dashboard change, zero audit rows, zero demotion |
| P-10 | Advisory lock released after a rollback | A subsequent call acquires it without blocking |

### 8.5 Structural checks (static)

- The migration contains **no** `ALTER`, no `CREATE POLICY`, no `DROP`, and touches no CB-005A/CB-005B object. Its only `CREATE` objects are the two functions and one table.
- `grep -c CURRENT_DATE` on the `snapshot_date` path = **0**.
- `grep -c "'projected'"` = **0** across the migration, the Base44 file and the UI file.
- The Base44 file contains no `user = null` fallback and no read of the **document owner's** `app_role`.
- `REVOKE` statements precede `GRANT` for all three objects; every signature is schema-qualified and fully typed.
- The RPC contains no `exception when others` block — a failed lookup cannot become a verdict.

### 8.6 Stale-authority probe (read-only, recommended)

```sql
select 'entity_owner_stale' as finding, be.id
  from public.business_entities be join public.profiles p on p.id = be.profile_id
 where p.profile_status not in ('active','incomplete')
union all
select 'ownership_record_stale', bo.id
  from public.business_owners bo join public.profiles p on p.id = bo.profile_id
 where p.profile_status not in ('active','incomplete')
   and (bo.end_date is null or bo.end_date >= current_date);
```

Today this returns nothing (0 assigned advisors, 0 ended ownerships, 8 profiles all inside the allowlist). It exists so that a future revocation drift is detectable.

---

## 9. Gate B readiness assessment

**Verdict: CONDITIONALLY READY.** The packet is implementation-ready: every statement is reconciled against verified columns, constraints, indexes and privileges, and the four defects that would have failed on the first call are corrected — three in the SQL, one in the deployed UI.

**Conditions — cheap, and none requires code:**

1. **Your rulings on D-14 … D-18**, specifically **D-15** (approve the append-only audit table; without it, deduplicated submissions are recorded nowhere durable) and **D-16** (accept the cross-writer limitation as documented). D-17 and D-18 are recommendations to confirm.
2. **One preflight probe not yet read:** the body of `public.is_super_admin()`. It cannot be satisfied by anonymous callers (no JWT), so it changes no verdict here; read it before applying, for completeness.
3. **An isolated environment** — Gate B's unchanged scope. Production remains a separate decision.

**What Gate B would then do, in order:** apply the migration to the isolated environment → verify the execution boundary (T-N21, T-N22) → implement the Base44 file and the one-line UI change → run §8.1–§8.6 → report with before/after counts → stop. Production, providers, CB-005A/CB-005B and the Digital Twin remain untouched.

**Explicitly out of scope for Gate B:** narrowing the RLS policies in **P-1**; the pre-existing defects **P-4/P-5/P-6**; ownership revocation (**P-7**); and any arbitration of the dashboard projection (`VISION_SECURITY_S4_GATE_A_REVISION_5.md` §5.3).

**Residual risks carried into Gate B:**

| Risk | Severity | Mitigation |
|---|---|---|
| The path becomes **functional for the first time**, so dashboards can move where they previously did not (D-3) | **High** | Isolated environment first; prior row counts; the `not_latest` skip and `promoted_over_newer` report make every projection explicit |
| A value written to the dashboard can be overwritten by another writer | Medium | Documented as the §5 limitation; `latest_snapshot_id` makes divergence detectable |
| Two undated documents are refused until their year is set | Low | Controlled 409 with a clear message; the user sets the year when ready |
| The service key remains the trust root, by design | Medium | Stated in the trust-boundary comment and in `comment on function`; the RPC's checks are defence-in-depth |
| D-15 declined: deduped submissions are recorded nowhere durable | Medium | Only material if two different callers submit identical content and the submission history must be attributed later |

**Gate B is NOT authorized. Nothing in this packet has been applied.**