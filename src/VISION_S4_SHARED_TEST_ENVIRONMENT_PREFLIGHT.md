# VISION Phase S4 — Shared Test-Environment Preflight

**Deliverable:** read-only preflight of the existing CB-005B test project as a prospective host for Phase S4 Gate B.
**Date:** 2026-10-21
**Mode:** STRICTLY READ-ONLY. No write, DDL, migration, fixture, RPC invocation or test run was performed. **Gate B remains unauthorized.**

---

## 0. Method and guardrails

| Item | Value | Evidence |
|---|---|---|
| Connector | `supabase` (shared, builder-authorized) | VERIFIED BY LIVE READ-ONLY QUERY (connector status) |
| Connector scopes | `projects:read`, `secrets:read`, `database:read` | VERIFIED BY LIVE READ-ONLY QUERY |
| Query channel | `POST /v1/projects/{ref}/database/query/read-only` only | VERIFIED BY LIVE READ-ONLY QUERY |
| Session role executing every query | **`supabase_read_only_user`** | VERIFIED BY LIVE READ-ONLY QUERY (`current_user`) |
| Production project touched | **No.** `tfrbswfrhrtgfcgonimb` was never placed in any query path | VERIFIED BY LIVE READ-ONLY QUERY (project listing only) |
| Writes possible through this channel | **No** — read-only endpoint plus a read-only session role; the connector also lacks `database:write` | VERIFIED BY LIVE READ-ONLY QUERY |

Two consequences worth stating up front:

1. Every database claim below marked **VERIFIED BY LIVE READ-ONLY QUERY** came from the test project addressed by its ref in the URL, executed by a role that cannot write.
2. **This environment cannot apply the S4 migration or run the test plan.** Applying DDL requires `database:write` (not granted) and a write-capable channel outside this tool. Any Gate B authorization must name that channel separately.

---

## 1. Verified target project identity

| Assertion | Result | Evidence |
|---|---|---|
| Project `xrvahykvkuiuglskmctd` exists and is reachable | **Yes** — name `VISION-CB005B-TEST 2`, region `us-east-2`, status `ACTIVE_HEALTHY`, created `2026-10-08T04:54:43Z`, org `zdztlssmkqiafknlgbis` | VERIFIED BY LIVE READ-ONLY QUERY (`GET /v1/projects`) |
| Production `tfrbswfrhrtgfcgonimb` is a separate project | **Yes** — name `V.I.S.I.O.N Platform`, created `2026-06-05T04:21:13Z`, same org | VERIFIED BY LIVE READ-ONLY QUERY |
| Projects visible to this connector | Exactly **2** (the two above) — no third project exists, so "reuse rather than create a third" is accurate | VERIFIED BY LIVE READ-ONLY QUERY |
| Identity established from the **ref**, not the display name | **Yes** — the ref in the request path is the identity anchor; the display name merely agrees with it | VERIFIED BY LIVE READ-ONLY QUERY |
| Server version | PostgreSQL **17.11** | VERIFIED BY LIVE READ-ONLY QUERY |
| Schema inventory | 72 tables, 5 views, 5 views incl. `v_latest_business_metric_snapshot`; schemas `public`, `valuation`, `extensions`, `auth`, `storage`, `vault`, … | VERIFIED BY LIVE READ-ONLY QUERY |

**Identity verdict: CONFIRMED.** The connector can establish that it is talking to `xrvahykvkuiuglskmctd`. No limitation to report under check 1.

---

## 2. CB-005B preservation baseline

### 2.1 Objects present

| Object | Type | Evidence |
|---|---|---|
| `public.provider_sync_jobs` | table (26 columns) | VERIFIED BY LIVE READ-ONLY QUERY |
| `public.provider_observations` | table (21 columns) | VERIFIED BY LIVE READ-ONLY QUERY |
| `public.provider_sync_checkpoints` | table (17 columns) | VERIFIED BY LIVE READ-ONLY QUERY |
| `public.provider_operation_audit` | table (16 columns) | VERIFIED BY LIVE READ-ONLY QUERY |
| `public.provider_credentials` | table | VERIFIED BY LIVE READ-ONLY QUERY (columns/count **redacted by tooling** — see §7 risk R9) |
| `public.provider_authorization_attempts` | table (15 columns) | VERIFIED BY LIVE READ-ONLY QUERY |
| `business_connections` | table (referenced by CB-005B composite FKs) | VERIFIED BY LIVE READ-ONLY QUERY |
| 16 `provider_*` functions (enqueue, claim, complete, renew_lease, sweep, authorize, ingest, credential put/resolve/rotate/revoke, audit_record, authorization_attempt create/consume/cancel/fail) | functions | VERIFIED BY LIVE READ-ONLY QUERY |

**Notable:** the previously recorded gap "isolated test database missing `public.provider_operation_audit`" no longer holds — the object exists in this project. It simply has zero rows.

### 2.2 Row baseline (record before any S4 work)

| Measure | Baseline | Evidence |
|---|---|---|
| `provider_sync_jobs` total | **26** | VERIFIED BY LIVE READ-ONLY QUERY |
| … by status | `failed: 26` (no queued / processing / waiting_retry / completed) | VERIFIED BY LIVE READ-ONLY QUERY |
| … by provider | `quickbooks: 26` | VERIFIED BY LIVE READ-ONLY QUERY |
| `provider_observations` | **34** | VERIFIED BY LIVE READ-ONLY QUERY |
| `provider_sync_checkpoints` | **2** | VERIFIED BY LIVE READ-ONLY QUERY |
| `provider_operation_audit` | **0** | VERIFIED BY LIVE READ-ONLY QUERY |
| `provider_authorization_attempts` | **0** | VERIFIED BY LIVE READ-ONLY QUERY |
| `provider_credentials` | redacted (`******`) | **NOT VERIFIED** |

### 2.3 Evidence-integrity dependencies (unchanged by S4)

Verified live: `provider_observations` → `provider_sync_jobs` on `(job_id, business_id)` and `(job_id, business_connection_id)` both **ON DELETE RESTRICT**; `provider_sync_checkpoints` → jobs **CASCADE**; `provider_operation_audit` actor/business/connection FKs **ON DELETE SET NULL**; `provider_authorization_attempts` business **CASCADE**, profile **SET NULL**.

| Aspect | Finding | Evidence |
|---|---|---|
| RLS posture on CB-005B tables | jobs / observations / checkpoints each have exactly **1 SELECT policy**; `provider_operation_audit` has **zero policies** (deny-all) | VERIFIED BY LIVE READ-ONLY QUERY |
| RLS enabled | all 72 public tables have RLS enabled (0 disabled) | VERIFIED BY LIVE READ-ONLY QUERY |
| User-defined triggers on CB-005B tables | none beyond internal FK triggers | VERIFIED BY LIVE READ-ONLY QUERY |

**Preservation verdict:** the CB-005B surface is intact and self-contained. S4 creates new objects only; it defines no trigger, policy or constraint on any `provider_*` table (§4, §5).

---

## 3. S4 proposed-object collision results

Proposed by the integrated documents (D2):

| Proposed object | Signature / shape | Exists today? | Collision verdict |
|---|---|---|---|
| `public.s4_mapping_contract(text)` | returns `jsonb` | **No** — `to_regprocedure` → `null`; 0 routines of that name | **CLEAR** |
| `public.create_reviewed_fields_snapshot(uuid,uuid,uuid,text,text,text,text,jsonb,jsonb,boolean,boolean)` | returns `jsonb` | **No** — `to_regprocedure` → `null`; 0 functions of that name | **CLEAR** |
| `public.snapshot_submission_audit` | table | **No** — `to_regclass` → `null` | **CLEAR** |

Broader collision sweep (all schemas, not just `public`):

| Sweep | Result | Evidence |
|---|---|---|
| Relations named `s4%` or `%submission%` in **any** schema | **none** | VERIFIED BY LIVE READ-ONLY QUERY |
| Routines named `s4%` or `%reviewed_fields%` in **any** schema | **none** | VERIFIED BY LIVE READ-ONLY QUERY |
| Relations named `%snapshot%` | `business_metric_snapshots`, `galileo_business_snapshots` — no name proximity to the audit table | VERIFIED BY LIVE READ-ONLY QUERY |
| Audit-table naming precedent | `provider_operation_audit` exists; `snapshot_submission_audit` is distinct in both name and purpose | VERIFIED BY LIVE READ-ONLY QUERY |

**Collision verdict: CLEAN.** A first application of the migration is a pure `CREATE` of three new objects plus their indexes; no existing object would be replaced, altered or dropped.

---

## 4. S4 schema compatibility matrix — structural

Each row is a dependency the Base44 file (D1) or the SQL migration (D2) actually relies on.

| # | Dependency | Required shape | Test-project reality | Verdict |
|---|---|---|---|---|
| 1 | `documents.id` | uuid PK | uuid PK | COMPATIBLE |
| 2 | `documents.business_id`, `.profile_id` | uuid, nullable | uuid, nullable | COMPATIBLE |
| 3 | `documents.document_type` | text, maps to a contract key | text, no CHECK; values in use: `profit_and_loss`, `business_tax_return`, `balance_sheet`, `personal_tax_return`, `other` | COMPATIBLE structurally / **data thin** (§6) |
| 4 | `documents.year` | integer, required by D2 (no CURRENT_DATE fallback) | integer, **nullable** — null on 55 of 71 business documents | COMPATIBLE structurally / **data thin** |
| 5 | `profiles.id` | uuid PK | uuid PK | COMPATIBLE |
| 6 | `profiles.app_role` | text, `admin`/`super_admin` meaningful | text NOT NULL default `owner`; CHECK allows `super_admin, admin, expert_advisor, advisor, owner, team_member, user` | COMPATIBLE |
| 7 | `profiles.profile_status` | active-status test | text NOT NULL default `incomplete`; CHECK allows `invited, active, incomplete, suspended` — D2's ACTIVE set `(active, incomplete)` is a legal subset | COMPATIBLE |
| 8 | `profiles.base44_user_id` | text | text | COMPATIBLE |
| 9 | `business_entities.id`, `.profile_id`, `.assigned_advisor_id` | uuid | uuid | COMPATIBLE |
| 10 | `business_owners.business_id`, `.profile_id`, `.end_date` | uuid, uuid, date | uuid, uuid, date | COMPATIBLE |
| 11 | `extracted_fields.id`, `.document_id`, `.business_id` | uuid | uuid | COMPATIBLE |
| 12 | `extracted_fields.field_name` | text NOT NULL (contract source names) | text NOT NULL | COMPATIBLE |
| 13 | `extracted_fields.review_status` | text in `accepted`/`corrected` | text, default `pending_review`, **no CHECK**; live values `pending_review, accepted, corrected, rejected, needs_clarification` | COMPATIBLE (values exist; unconstrained by design of the existing table) |
| 14 | `extracted_fields.accepted_normalized_value` | numeric | numeric | COMPATIBLE |
| 15 | `extracted_fields.confidence_score` | **text**, requiring D2's guarded cast | **text** | COMPATIBLE — the guarded-cast design matches reality |
| 16 | `business_metric_snapshots` nine metric columns (`annual_revenue, gross_profit, net_profit, total_expenses, owner_compensation, payroll, total_debt, cash_on_hand, total_assets`) | numeric | all nine present, numeric | COMPATIBLE |
| 17 | `business_metric_snapshots.metadata` | jsonb | jsonb default `{}` | COMPATIBLE |
| 18 | `business_metric_snapshots.data_source` | must permit `advisor_review` | CHECK permits `manual, assessment, document, advisor_review, calculation_engine, ai_generated` | COMPATIBLE |
| 19 | `business_metric_snapshots.source_document_id` | uuid, FK → documents | uuid, FK → documents ON DELETE SET NULL | COMPATIBLE |
| 20 | `business_metric_snapshots.data_confidence_score` | numeric | numeric default 0 | COMPATIBLE |
| 21 | `business_metric_snapshots.is_latest` | boolean NOT NULL | boolean NOT NULL default false | COMPATIBLE |
| 22 | `business_metric_snapshots.created_by` | nullable, FK → profiles, no default, never written | uuid, FK → profiles ON DELETE SET NULL, no default; **0 of 72 rows populated** | COMPATIBLE — matches the D-13 claim exactly |
| 23 | `business_metric_snapshots.snapshot_type` | must permit `historical`, `tax_year`, `projection` | CHECK permits `current, prior, historical, before_strategy, after_strategy, projection, tax_year, quarter, month` | COMPATIBLE (existing rows are all `current`; no default/trigger conflict) |
| 24 | `unique_latest_snapshot_per_business` | partial unique index on `(business_id) WHERE is_latest` | **present, exactly that definition** | COMPATIBLE — the demote-then-promote ordering is genuinely required |
| 25 | `dashboard_metrics.business_id` nullable + partial unique | enables `ON CONFLICT (business_id) WHERE business_id IS NOT NULL` | nullable; `ux_dashboard_metrics_business_id` present with exactly that predicate | COMPATIBLE (branch unreachable while projection is disabled) |
| 26 | `dashboard_metrics.profile_id` | NOT NULL | NOT NULL | COMPATIBLE |
| 27 | `dashboard_metrics.annual_revenue`, `.net_profit`, `.latest_snapshot_id` | numeric, numeric, uuid | present | COMPATIBLE |
| 28 | `uuid` default for the audit table | `extensions.uuid_generate_v4()` | `to_regprocedure('extensions.uuid_generate_v4()')` resolves; extensions `uuid-ossp`, `pgcrypto` installed; `gen_random_uuid` present | COMPATIBLE |
| 29 | Helper functions used by the SQL | `md5`, `hashtextextended`, `pg_advisory_xact_lock`, `jsonb_*` | all present (2 / 1 / 2 overloads respectively) | COMPATIBLE |
| 30 | `search_path = ''` compatibility | every non-`pg_catalog` reference schema-qualified | D2 qualifies `public.*` and `public.s4_mapping_contract(...)`; helper calls are `pg_catalog` | COMPATIBLE | VERIFIED FROM SOURCE ONLY |
| 31 | Triggers on the seven S4 tables | none assumed ("No trigger exists on this table") | **zero user-defined triggers** on all seven | COMPATIBLE |
| 32 | Dependent views | none broken by the migration | `v_latest_business_metric_snapshot` reads `business_metric_snapshots`; no column changes are proposed | COMPATIBLE | VERIFIED BY LIVE READ-ONLY QUERY |

**Structural verdict: FULLY COMPATIBLE.** Every table, column, type, constraint and function the integrated documents depend on exists in this project, in the shape the documents assume. No schema mismatch was found.

---

## 5. Permissions and RLS findings

### 5.1 Inherited default privileges — the decisive finding

`pg_default_acl` in **this project** (not only production) grants every newly created object in `public` to the API roles:

| Schema | Object type | Default ACL | Evidence |
|---|---|---|---|
| `public` | table | `postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres, authenticated=arwdDxtm/postgres, service_role=arwdDxtm/postgres` | VERIFIED BY LIVE READ-ONLY QUERY |
| `public` | function | `anon=X/postgres, authenticated=X/postgres` (EXECUTE) | VERIFIED BY LIVE READ-ONLY QUERY |
| `public` | sequence | `anon=rwU, authenticated=rwU` | VERIFIED BY LIVE READ-ONLY QUERY |

Implications, stated precisely:

1. The migration's **REVOKE-first block is mandatory, not ceremonial.** Without it, `snapshot_submission_audit` would be created with `anon`/`authenticated` holding INSERT, SELECT, UPDATE, DELETE, **TRUNCATE**, REFERENCES, TRIGGER and MAINTAIN, and both new functions would be executable by `anon`/`authenticated`.
2. **RLS alone would not close that hole.** The deny-all policy posture blocks SELECT/INSERT/UPDATE/DELETE, but **RLS does not govern TRUNCATE**. The explicit `REVOKE … FROM anon, authenticated` is the only barrier against an audit-table truncation if the grant were ever re-added.
3. This confirms the SEC-031 finding in the *test* project as well as production — the mitigation the documents specify applies here too.

### 5.2 Existing EXECUTE grants — the precedent the migration follows

| Function family | `anon` | `authenticated` | `service_role` | Evidence |
|---|---|---|---|---|
| All 16 `provider_*` functions | **false** | **false** | **true** | VERIFIED BY LIVE READ-ONLY QUERY (`has_function_privilege`) |

The REVOKE-then-GRANT-to-`service_role` posture the migration proposes for its two functions is already the working pattern in this project — it is achievable here, and there is a live example to compare against.

### 5.3 RLS posture on the S4 dependency tables

| Table | RLS enabled | Policies | Commands | Evidence |
|---|---|---|---|---|
| `business_metric_snapshots` | yes | 3 | INSERT, SELECT, UPDATE — **no DELETE policy** | VERIFIED BY LIVE READ-ONLY QUERY |
| `profiles` | yes | 3 | INSERT, SELECT, UPDATE | VERIFIED BY LIVE READ-ONLY QUERY |
| `business_entities` | yes | 3 | INSERT, SELECT, UPDATE | VERIFIED BY LIVE READ-ONLY QUERY |
| `documents` | yes | 1 | ALL | VERIFIED BY LIVE READ-ONLY QUERY |
| `extracted_fields` | yes | 1 | ALL | VERIFIED BY LIVE READ-ONLY QUERY |
| `dashboard_metrics` | yes | 1 | ALL | VERIFIED BY LIVE READ-ONLY QUERY |
| `business_owners` | yes | 0 | — (deny-all; service_role bypasses) | VERIFIED BY LIVE READ-ONLY QUERY |

The absence of a DELETE policy on `business_metric_snapshots` corroborates the append-only assumption the audit table's `ON DELETE RESTRICT` references depend on.

### 5.4 Can the migration run without changing existing policies?

| Statement class in D2 | Effect on existing objects | Evidence |
|---|---|---|
| `create or replace function` × 2 | names do not exist → pure CREATE | VERIFIED BY LIVE READ-ONLY QUERY |
| `create table public.snapshot_submission_audit` | new object only | VERIFIED BY LIVE READ-ONLY QUERY |
| `create index` × 2 | on the new table only | VERIFIED FROM SOURCE ONLY |
| `alter table … enable row level security` + policies + `revoke`/`grant` | on the new table / new functions only | VERIFIED FROM SOURCE ONLY |
| 3 FK constraints referencing `business_metric_snapshots`, `business_entities`, `profiles` | **side effect on existing tables**: PostgreSQL adds internal RI triggers to each referenced table and takes a brief `SHARE ROW EXCLUSIVE` lock while doing so. No column, policy or semantic change | VERIFIED FROM SOURCE ONLY (PostgreSQL FK semantics) |

`business_metric_snapshots` already carries 12 internal FK triggers, so the mechanism is well exercised in this schema (VERIFIED BY LIVE READ-ONLY QUERY).

**No existing policy, grant or column is altered by the migration.**

---

## 6. Synthetic fixture readiness

### 6.1 Baseline counts (record before any S4 work)

| Table | Rows | Evidence |
|---|---|---|
| `profiles` | **8** (1 `active`, 7 `incomplete`) | VERIFIED BY LIVE READ-ONLY QUERY |
| `business_entities` | **9** | VERIFIED BY LIVE READ-ONLY QUERY |
| `business_owners` | **3** | VERIFIED BY LIVE READ-ONLY QUERY |
| `documents` | **78** (71 with `business_id`, 7 without) | VERIFIED BY LIVE READ-ONLY QUERY |
| `extracted_fields` | **248** (13 `accepted`/`corrected`) | VERIFIED BY LIVE READ-ONLY QUERY |
| `business_metric_snapshots` | **72** | VERIFIED BY LIVE READ-ONLY QUERY |
| `dashboard_metrics` | **6** (all with `business_id`) | VERIFIED BY LIVE READ-ONLY QUERY |

### 6.2 `is_latest` capture, by business (IDs only — no financial values, no PII)

| Business id | Current `is_latest` snapshot id |
|---|---|
| `42f42075-c453-436a-8c5f-2dc29ef718c6` | `dae06db0-72f1-4ca6-a2c4-475ac816ecc5` |
| `a7d556e4-72f6-49ea-bbfe-751825ce0829` | `40e8d2df-2b0a-46ba-bb99-8f3f40131bc3` |
| `b3e5ceb3-edfe-4124-bfd7-17faaed2a54f` | `d2e87923-2978-4e6b-b3e0-f63ae9e9f71e` |

Row distribution: 54 / 10 / 7 / 1 across four businesses — the fourth (`e507bf87-82d1-4bb7-9ae0-3a30881ac7da`) holds one snapshot and **no** `is_latest` row. All 72 snapshots are `snapshot_type = 'current'`. All evidence: VERIFIED BY LIVE READ-ONLY QUERY.

Two corroborating facts for the documents' own claims: **`created_by` is populated on 0 of 72 rows**, and **`metadata->>'content_hash'` is absent on all 72** — so the dedupe lookup can never falsely match a legacy row.

### 6.3 Readiness for the test plan's fixtures

| Requirement | Available today | Gap |
|---|---|---|
| Five contract document types | 3 of 5 observed: `profit_and_loss` (13), `balance_sheet` (3), `business_tax_return` (18). `debt_schedule` and `payroll_report`: **0 documents** | **2 types absent** |
| `personal_tax_return` for the negative test T-808 | **6 documents** | none — real negative fixture exists |
| Contract source field coverage | **8 of 23** source names present among accepted/corrected fields: `annual_revenue, gross_profit, total_expenses, owner_compensation, gross_receipts, ordinary_business_income, taxable_income, wages` | **15 absent**, incl. `net_profit, total_assets, cash_on_hand, total_debt, total_equity, total_liabilities, officer_compensation, deductions, loan_balance, monthly_payment, interest_rate, total_payroll, owner_payroll, employee_count, payroll_tax` |
| Accepted/corrected fields to draw on | **13** total, all bound to a `business_id` and `document_id` | far short of a full-type T-811 fixture set |
| Documents usable for a snapshot (business **and** year present) | **16** of 71 business documents | year is null on **55** — those would raise `SNAPSHOT_YEAR_REQUIRED` |
| Active profiles for authorization cases | **1 active**, 7 incomplete | T-203/T-206 need a second active, unrelated profile |
| A profile with `app_role = 'user'` | **none** (roles present: `admin` 2, `owner` 5, `super_admin` 1) | T-204/T-205 need one |
| Businesses with no `is_latest` row | 1 (single-snapshot business) | useful for a clean promotion test |
| `dashboard_metrics` rows keyed by business | 6 of 6 | projection is disabled anyway |

**Readiness verdict: STRUCTURALLY READY, DATA-SHORT.** The schema supports every fixture the plan needs; the existing data does not supply them. All of Groups C, D, E, H and I require fixtures that must be created inside the S4 scope — which is precisely what this preflight is prohibited from doing.

---

## 7. Risks and required mitigations

| # | Risk | Severity | Evidence | Required mitigation |
|---|---|---|---|---|
| R1 | **S4 audit rows bind shared rows against deletion.** `snapshot_submission_audit` references `business_metric_snapshots`, `business_entities` and `profiles` **`ON DELETE RESTRICT`**. An S4 row written against a *real* business or profile makes that row permanently undeletable while the append-only audit stands. | **High** | VERIFIED FROM SOURCE ONLY | Run **all** promotion/attribution tests against **synthetic** businesses, profiles and documents. Never point an S4 write at the 3 businesses or the profiles listed in §6. |
| R2 | **Promotion moves live promotion state.** Three real businesses currently hold `is_latest`. A promotion test aimed at one of them would demote its current row — the exact behaviour T-807 anticipates, but against shared data. | **High** | VERIFIED BY LIVE READ-ONLY QUERY (§6.2) | Confine promotion tests to synthetic businesses; keep the §6.2 capture to prove the three real ones are untouched. |
| R3 | **Inherited default ACL grants `anon`/`authenticated` full DML + TRUNCATE on new tables**, and EXECUTE on new functions. RLS does not govern TRUNCATE. | **High** | VERIFIED BY LIVE READ-ONLY QUERY (§5.1) | Apply the migration's REVOKE-first block exactly as written; immediately after apply, verify with `has_table_privilege('anon', …)` and `has_function_privilege('anon', …)` that both are `false`. Treat this as a gate on proceeding to tests. |
| R4 | **`SHARE ROW EXCLUSIVE` locks** from the three new FK constraints land on `business_metric_snapshots`, `business_entities` and `profiles` — shared with CB-005B and any live app use. | Medium | VERIFIED FROM SOURCE ONLY | Apply in a quiet window; check `pg_stat_activity` for conflicting sessions first; keep the transaction short. |
| R5 | **Fixture gap** — 15 contract source fields, 2 document types, a second active profile and a `user`-role profile are all missing. | Medium | VERIFIED BY LIVE READ-ONLY QUERY (§6.3) | Create them **inside the S4 scope** before running Groups C/D/E/H/I; without them those groups cannot execute meaningfully. |
| R6 | **No write channel from this environment.** The connector holds `database:read` only; the read-only endpoint runs as `supabase_read_only_user`. | Medium | VERIFIED BY LIVE READ-ONLY QUERY | Gate B authorization must explicitly name the write-capable channel (psql/CI, or a connector with `database:write`). This preflight cannot be extended into an apply. |
| R7 | **Shared-table contention during tests.** Tests write to `business_metric_snapshots` and `extracted_fields`, which CB-005B and the app also read. | Low | VERIFIED BY LIVE READ-ONLY QUERY | Scope every fixture to synthetic `business_id`s; assert the 72-row snapshot count and the CB-005B counts (§2.2) are unchanged after each run. |
| R8 | **Audit-table growth is permanent** (append-only, RESTRICT). Test residue is not cleanly deletable. | Low | VERIFIED FROM SOURCE ONLY | Accept by design; document that synthetic businesses/profiles used by S4 tests cannot be deleted while their audit rows exist. |
| R9 | `provider_credentials` row count and columns came back redacted by tooling, so that slice of the CB-005B baseline is unknown. | Low | **NOT VERIFIED** | Record the credential count out-of-band before apply, via a channel that returns it, and compare after. |
| R10 | A `household`-scoped document exists (1 of 78; the rest are `business`). D2 does not filter on `document_scope`. | Low | VERIFIED BY LIVE READ-ONLY QUERY | Fixtures must set `document_scope = 'business'`; do not rely on a household document to fail closed. |
| R11 | The existing `metadata.content_hash` absence means dedupe cannot be exercised against legacy rows. | Low | VERIFIED BY LIVE READ-ONLY QUERY | Dedupe tests (T-402, T-403) must create their own first snapshot; no shortcut exists. |

---

## 8. Recommendation

**GO — as the host environment, with conditions. NOT yet authorized for Gate B.**

The environment question is answered in the affirmative and nothing about this project argues for creating a third one:

- Identity is established from the ref, not the name (§1).
- No S4 object exists in any schema, so first application is pure creation — no collision, no replace, no drop (§3).
- Every column, type, constraint, index and helper function the integrated Gate B documents depend on is present in the shape they assume (§4). Zero structural mismatches.
- The migration defines nothing on any CB-005B object; it changes no existing policy, grant or column (§5.4). CB-005B's evidence surface is intact and quantified (§2).

The conditions are not structural — they are operational, and each is cheap to satisfy:

1. **Promotion and attribution tests run against synthetic businesses, profiles and documents only** — never the three real `is_latest` holders (§6.2), because `ON DELETE RESTRICT` makes an S4 audit row a permanent claim on a shared row (R1, R2).
2. **REVOKE-first is applied and verified** with `has_table_privilege` / `has_function_privilege` immediately after apply, before any test runs (R3).
3. **Apply in a quiet window** and confirm no conflicting sessions, given the three FK-induced locks on shared tables (R4).
4. **Fixtures are created inside the S4 scope before the plan runs** — 15 contract source fields, `debt_schedule` and `payroll_report` documents, a second active profile, a `user`-role profile (R5).
5. **A write-capable channel is named in the authorization** — this connector cannot apply or execute anything (R6).
6. **CB-005B counts are re-verified unchanged after apply** (26 jobs all `failed` / 34 observations / 2 checkpoints / 0 operation-audit / 0 authorization-attempts), with the credential count captured separately first (R9).

If conditions 1–3 cannot be guaranteed, the recommendation becomes **NO-GO** and a third, disposable project is the correct answer — because the two failure modes that matter here (a permanent audit claim on a shared row, and an audit table writable by `anon` if the revoke were missed) are both unrecoverable-by-design rather than merely inconvenient.

---

## 9. What was NOT done

- No `CREATE`, `ALTER`, `DROP`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `GRANT` or `REVOKE` was issued.
- No migration, backfill, fixture or RPC was invoked; no test was executed.
- No Base44 runtime code was written, modified or deployed; Galileo, provider integrations and the Digital Twin are untouched.
- The production project `tfrbswfrhrtgfcgonimb` was never queried — it appears only in the project listing that confirmed it is a separate ref.
- No financial value, credential or personally identifying value is reproduced in this report; the `is_latest` capture is IDs only.

**Gate B remains unauthorized. Stopping here.**

---

## Appendix — queries executed (read-only, test project only)

| Purpose | Shape |
|---|---|
| Project identity | `GET /v1/projects` (listing only) |
| Schema inventory | `pg_namespace`, `pg_class`, `pg_proc` aggregates |
| Column inventory | `information_schema.columns` for `provider_%` and the seven S4 tables |
| CB-005B counts | `count(*)` and `group by status/provider` on the six `provider_*` tables |
| S4 object existence | `to_regclass`, `to_regprocedure`, name sweeps across all schemas |
| Constraints / indexes / FKs | `pg_constraint`, `pg_indexes` |
| Privileges | `pg_default_acl` + `aclexplode`, `has_function_privilege`, `pg_policies`, `relrowsecurity` |
| UUID + helper functions | `pg_proc`, `pg_extension` |
| Baseline counts + `is_latest` | `count(*)`, `jsonb_object_agg`, ID-only projections |
| Fixture readiness | `group by review_status / document_type / app_role / profile_status`, contract-source presence checks |

Every statement was a `SELECT` and every call used the `/database/query/read-only` endpoint.