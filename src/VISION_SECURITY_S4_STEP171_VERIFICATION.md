# Phase S4 — Step 171 · Read-Only Verification Report
## Gate A Revision 4 — V-1…V-15 and the eight additional requirements

**Status:** verification complete. **Gate B remains unauthorized.** Nothing was written: no migrations, no DDL, no DML, no function creation, no test execution, no deployment. Production Supabase, CB-005A, CB-005B, provider integrations and Digital Twin isolation untouched.

**Method (all read-only):** repository inspection (`grep`/`read` across `base44/`, `src/`); the authorized Supabase connector (`database:read`) against the Management API read-only SQL endpoint — `information_schema`, `pg_constraint`, `pg_indexes`, `pg_proc`, `pg_default_acl`, `has_table_privilege`, and aggregate counts; PostgREST metadata reads. **No rows of financial data were read or emitted** — metric inspection used counts and ranges only. No secret values were returned or logged.

**Project verified:** `tfrbswfrhrtgfcgonimb`.

**Headline:** four findings **invalidate parts of the proposed SQL** and must be corrected before isolated testing (§3). Two of them would have failed at runtime on the first call.

---

## 1. Verification matrix

| ID | Verified finding | Evidence source | Verdict | Decision affected | Required correction |
|---|---|---|---|---|---|
| **V-1** | Declared vocabulary is exactly `('invited','active','incomplete','suspended')`. Observed: active 1, incomplete 7, invited 0, suspended 0 (8 total). **`incomplete` is the column DEFAULT** (`'incomplete'::text`). **No application code writes `profile_status`** — the only reference in the whole repository is a read in `shared/authz/actor.ts:122`. | `pg_constraint` (`profiles_profile_status_check`); `information_schema.columns` (default); aggregate counts; repo grep | **PASS** (vocabulary) · **UNVERIFIED** (business meaning) | §7 status policy; D-7 family | Keep allowlist `{active, incomplete}`; **exclude `invited`**; never `suspended`. Do **not** treat `incomplete` as an onboarding signal — see req 1 (§2) |
| **V-2** | `ux_dashboard_metrics_business_id` **UNIQUE INDEX on (business_id) WHERE business_id IS NOT NULL** is deployed. Zero duplicate groups (6 rows, 6 distinct businesses). **But** `profile_id` is **NOT NULL with no default**. | `pg_indexes`; `pg_constraint`; `information_schema.columns`; grouped count | **PASS** (uniqueness) · **FAIL** (insert blocker) | §3 dashboard promotion / D-2 | **(a)** The dashboard INSERT must supply `profile_id` — as written it always fails. **(b)** Duplicate-*row* prevention is verified; duplicate-*update* prevention is not — see V-12 |
| **V-3** | `latest_snapshot_id`: `uuid`, **nullable**, no default, **FK → business_metric_snapshots(id) ON DELETE SET NULL**, indexed. `last_calculated_at` nullable, 0 rows set. No triggers on `dashboard_metrics`, so `updated_at` is not auto-maintained. | `information_schema.columns`; `pg_constraint`; `pg_indexes`; `pg_trigger`; counts | **PASS** | §3.2 promotion marker | None. Writing `latest_snapshot_id` is valid (the snapshot row exists); setting `updated_at` explicitly is required |
| **V-4** | `business_metric_snapshots.created_by`: `uuid`, **nullable**, **no default**, **FK → profiles(id) ON DELETE SET NULL**. **All 72 existing rows have it NULL** — the convention for this table is that it is never written. | `information_schema.columns`; `pg_constraint`; counts | **PASS** | **D-13** — now decidable | Recommend **omit** (matches 72/72 convention); the FK-valid alternative is a canonical profile UUID. A Base44 id can never satisfy this FK |
| **V-5** | `business_entities.assigned_advisor_id`: `uuid`, nullable, FK → profiles(id); **0 of 9 set**. **No code in the repository writes it** (every reference is a read). A second, unused pointer exists at `profiles.assigned_advisor_id` (0 set). The **`advisor_assignments` table does not exist** in the database. | `information_schema.columns`; `pg_constraint`; counts; repo grep; `to_regclass('public.advisor_assignments')` = false | **FAIL** | **D-4** | **Keep advisor authority disabled** (already the Revision 4 design). No assignment can be created or revoked by application code, so the branch can never be satisfied and its revocation semantics remain unevidenced |
| **V-6** | **`unique_latest_snapshot_per_business` UNIQUE INDEX on (business_id) WHERE is_latest = true already exists and is deployed.** Zero businesses have >1 latest row. | `pg_indexes`; grouped count | **PASS** | §9.5 optional indexes; promotion ordering | **Remove the "optional partial unique index" from the proposal** — it duplicates a deployed index. Also: **demote-then-promote is now mandatory**, not stylistic — inserting `is_latest = true` while another row is latest would violate the index |
| **V-7** | 72 snapshot rows exist (2026-06-08 → 2026-10-05). **None** is attributable to this path: `data_source` is `calculation_engine` ×70 and `manual` ×2 — **0 `advisor_review`**; **0 rows carry `metadata.content_hash`**; `created_by` NULL ×72. Writers are `regenerateCiqMetrics`, `saveAssessmentToSupabase` (×2), `hydrateDashboardFromJourney`, `orchestrateBusinessCreation`. | Counts; grouped `snapshot_type`/`data_source`; repo grep of write sites | **PASS** (count) · **FAIL** (original interpretation) | F-1 / F-6 confirmation | **Accept the correction:** a row count does not establish historical execution success of *this* function. It establishes that the *table* is used by other paths. Attribution to a path requires its signature (`data_source='advisor_review'`), which is absent |
| **V-8** | `business_owners`: `end_date` nullable `date`, **0 rows ended**; `ownership_role` default `'owner'` (3/3); UNIQUE `(profile_id, business_id, ownership_type)`; FKs to profiles and business_entities. No writer sets `end_date`. | `information_schema.columns`; `pg_constraint`; counts; repo grep | **UNVERIFIED** (semantics) · inert | Active-ownership predicate | Keep `end_date IS NULL OR end_date >= current_date`; flag that because nothing ever sets `end_date`, an ended ownership would retain access. Low impact today (0 ended) |
| **V-9** | `business_metric_snapshots.net_margin`: **0 non-null values** across 72 rows. No writer. | Aggregate range query | **UNVERIFIED — unresolvable from data** | **D-11** | **Keep margin unwritten.** The unit (ratio vs percentage) cannot be established from the database; writing it would be a guess |
| **V-10** | `service_role` holds SELECT/INSERT/UPDATE on `business_metric_snapshots`, `dashboard_metrics`, `extracted_fields`, `documents`, `business_entities`, `business_owners`. **RLS is enabled on all six tables.** | `has_table_privilege`; `pg_class.relrowsecurity` | **PASS** | Migration access control | None for `service_role`. **But see §3.4** — new functions inherit EXECUTE for `anon`/`authenticated` by default ACL |
| **V-11** | Neither `create_reviewed_fields_snapshot` nor `s4_mapping_contract` exists in `public`. | `pg_proc` (empty result) | **PASS** | Migration safety | None |
| **V-12** | **Ten** application writers touch `dashboard_metrics` (insert and/or update): `saveAssessmentToSupabase`, `regenerateCiqMetrics`, `forceUpdateDashboardMetrics`, `hydrateDashboardFromJourney`, `supabaseUserData`, `supabaseDashboardData`, `guestSessionService`, `orchestrateBusinessCreation`, `debugDashboardMetricsSchema`, `createSnapshotFromReviewedFields`. **Four** write `business_metric_snapshots` (see V-7). | Repo grep of write sites (file:line) | **PASS** (inventory) | §3.1 withdrawn claim | Keep the withdrawal. **Distinguish explicitly:** the unique index prevents duplicate *rows*; it does **not** prevent competing *updates* to the same row's `annual_revenue`/`net_profit` — last-write-wins, with no optimistic locking. Our advisory lock serializes **only this function** |
| **V-13** | `extracted_fields.reviewed_at` is `timestamptz`, nullable, default NULL. **All 13 accepted/corrected rows have it set** (0 null). Writers: `updateExtractedFieldReview`, `shared/documentIngestion/classificationOverride.ts:63`. All 13 accepted/corrected rows also have `business_id` set and a **non-NULL** `accepted_normalized_value` (0 nulls). | `information_schema.columns`; counts; repo grep | **PASS** | §2.2 ordering rule; NULL-contributor rule | None. The ordering rule is exercised by real data; the NULL-contributor rejection currently fires on nothing (no such rows exist) |
| **V-14** | **78 documents: 16 have `year`, 62 have NULL `year`; `tax_year` is set on 0 rows**, so it cannot rescue the fallback. Of the **5 documents** that have accepted/corrected fields, **3 have a year and 2 have none**. | Counts (documents; documents joined to reviewed fields) | **FAIL** (material) | §2.5 identity / replay behaviour | See §3.5 — decide between requiring `year` (recommended) and accepting documented instability |
| **V-15** | Re-checked after V-5: no writer sets `assigned_advisor_id`; the advisor branch remains unsatisfiable and disabled. | Repo grep | **PASS** | **D-4** | None — keep disabled |

---

## 2. The eight additional requirements

**Req 1 — `profile_status = 'incomplete'`: onboarding-in-progress, or deprovisioned?**
**Neither is established; the evidence points to a third reading.** `incomplete` is the **column default** — the state a profile is in until something changes it. The app never changes it: the only reference in the entire repository is a read (`shared/authz/actor.ts:122`), and the declared vocabulary reserves `suspended` for revocation. Crucially, onboarding is tracked by a **different field**: `profiles.onboarding_completed` (boolean, default false, maintained by `supabaseUserData` and `supabaseProfileData`). Observed: onboarding_completed true ×1, false ×7 — and **no profile is simultaneously `onboarding_completed = true` and `profile_status = 'incomplete'`**.
**Conclusion:** `incomplete` means *"never advanced from the default"*, not *"onboarding in progress"* and not *"deprovisioned"*. It carries little evidentiary weight.
**Consequence for the policy:** the **relationship** must carry the authorization, exactly as proposed; status only removes eligibility. Retain `{active, incomplete}`, **drop `invited`**, keep the `suspended` exclusion. **UNVERIFIED:** whether an operational process ever sets `invited`/`suspended` out of band.

**Req 2 — dashboard uniqueness, `latest_snapshot_id`, competing writers.**
Uniqueness **PASS** (deployed partial unique index, 0 duplicate groups). `latest_snapshot_id` **compatible** (nullable uuid, FK to snapshots, ON DELETE SET NULL, 0 of 6 used). Competing writers: **ten** (V-12). **The critical distinction:** the unique index prevents two *rows* for one business; it provides **no** protection against two writers updating the same row's metrics — both read, both patch, the later commit wins, silently, and neither detects the other. Our advisory lock is invisible to those ten writers. `dashboard_metrics` therefore remains a shared, unarbitrated projection, and our promotion policy governs only when *we* write.

**Req 3 — `created_by`.** FK target → **profiles(id)**; **nullable**; **no default**; existing convention → **never written (0 of 72)**. No identifier was guessed. See V-4 and requirement 6 of §3.

**Req 4 — does the hash match the persisted content?** Structurally verified against the real column list, and **one gap found**: of the columns the INSERT writes, **`business_id` is stored but absent from the hash** (rev 5 fix below). All others are covered or explicitly excluded:

| Inserted column | In the hash? | Note |
|---|---|---|
| `profile_id` | Yes (`profile`) | Stored and semantic |
| **`business_id`** | **No — GAP** | Stored, semantic, and NOT NULL ⇒ **add it** |
| `snapshot_type`, `snapshot_date` | Yes | Stored values |
| the nine metric columns | Yes (`values`) | Contract-ordered |
| `metadata` (metric keys, provenance, contract, basis, hash) | Yes | All hashed inputs are inside it |
| `source_document_id` | Yes (`document`) | |
| `data_confidence_score` | Yes (`confidence`) | Same rounded variable that is stored |
| `data_source` | No — **constant** `'advisor_review'` | Excluded by constancy, documented |
| **`is_latest`** | No — **excluded mutable property** | As required |
| **`metadata.created_by_base44_user_id`** | No — **excluded attribution** | As required; `created_by` itself is not written at all |

Columns the INSERT does not touch (`is_baseline`, `scenario_type`, `created_at`, `updated_at`, `period_label`, `fiscal_*`, `strategy_*`, `notes`, `comparison_group_id`, `source_assessment_session_id`) take column defaults or NULL — no content. **UNVERIFIED:** nothing; the gap is positive evidence.

**Req 5 — V-7 interpretation corrected.** A snapshot row count is evidence of *table* usage, not of *this path* succeeding. Attribution requires the path's own signature; none of the 72 rows carries it (V-7). The count therefore neither confirms nor denies historical execution, and must not be cited as either.

**Req 6 — source of truth for ownership and active dates.** There is **no single source**: `business_entities.profile_id` (7 of 9 businesses), `business_owners` rows (3, with `UNIQUE (profile_id, business_id, ownership_type)`), and `profiles.primary_business_id` (6 of 8) coexist. **One business has both forms; 2 have only a `business_owners` record; `businesses_with_neither = 0`.** Writers: `enterpriseDiscoveryOrchestrator`, `valuationService`, `orchestrateBusinessCreation`, `createBusinessEntity`, `guestSessionService`. **Conclusion:** the UNION predicate (entity owner OR active ownership record) is the correct reading; ownership is not normalized, and a snapshot authorized through one form is not visible through the other. Active dates: `end_date` is never written by any code path ⇒ **UNVERIFIED**; the predicate is inert today.

**Req 7 — actual types, constraints and signatures.** Verified in full for the write targets: metric columns are `numeric`; `metadata` is `jsonb`; `snapshot_date` `date` NOT NULL default CURRENT_DATE; `snapshot_type` text NOT NULL default `'current'` with a CHECK; `is_latest`/`is_baseline` bool NOT NULL default false; `created_at`/`updated_at` timestamptz NOT NULL default now(); **`business_id` is the only NOT NULL column without a default**; on `dashboard_metrics`, **`profile_id` is the only NOT NULL column without a default**. Both target schemas carry CHECKs the proposal satisfies (`data_source` allows `'advisor_review'`; `scenario_type` default `'actual'`; `fiscal_*`). `profiles.app_role` CHECK allows `('super_admin','admin','expert_advisor','advisor','owner','team_member','user')` — consistent with the authorization table. **No triggers** on either target table. **No functions** of the proposed names exist. Extensions: the `id` default is `extensions.uuid_generate_v4()` (`uuid-ossp` present).

**Req 8 — findings that invalidate the proposed SQL:** §3.

---

## 3. Findings that invalidate the proposed SQL (must be corrected before isolated testing)

**3.1 `'projected'` violates the snapshot-type CHECK constraint — the first call would fail.**
`business_metric_snapshots_snapshot_type_check` allows `('current','prior','historical','before_strategy','after_strategy','projection','tax_year','quarter','month')`. The proposal's whitelist and default logic use **`'projected'`**, which is **not** an allowed value.
**Correction:** whitelist becomes `('historical','tax_year','projection')`; `SNAPSHOT_TYPES` in the Base44 layer likewise. The existing default derivation (non-tax ⇒ `'historical'`) remains valid.

**3.2 The dashboard INSERT omits `profile_id`, a NOT NULL column with no default → it always fails.**
**Correction:** supply `profile_id` from the pinned document (`documents.profile_id`, already read). Note the INSERT path was disabled pending V-2; **V-2 now passes**, so the path may be enabled — but only with this fix, and preferably as `ON CONFLICT (business_id) DO UPDATE`, which is race-proof against the ten competing writers because the unique index is deployed.

**3.3 The "optional partial unique index" duplicates a deployed index.**
`unique_latest_snapshot_per_business` already exists. **Correction:** delete that item from the proposal; keep demote-then-promote as a **mandatory** ordering.

**3.4 New functions inherit EXECUTE for `anon` and `authenticated` — the REVOKE is mandatory.**
`pg_default_acl` in `public` grants `anon` and `authenticated` the full DML set on new tables (`arwdDxtm`) and **EXECUTE on new functions** (`X`). Live confirmation on existing tables: `anon` has SELECT/INSERT/UPDATE/**DELETE** on `business_metric_snapshots`, INSERT on `dashboard_metrics`, `extracted_fields` and `documents`; `authenticated` has INSERT/UPDATE on `business_metric_snapshots` and INSERT on `dashboard_metrics`. RLS on all six tables is what contains this today.
**Correction:** the `REVOKE ALL … FROM public, anon, authenticated` before `GRANT EXECUTE … TO service_role` is **required on both functions**, not hygiene. This is the tracked SEC-031/SEC-032 debt, confirmed live — reported, not remediated here.

**3.5 The snapshot-date fallback makes identity unstable for 62 of 78 documents.**
`documents.year` is NULL on 62 of 78; `tax_year` is populated on **0** rows. Since `snapshot_date` is stored **and** hashed, a document without `year` gets `CURRENT_DATE` — so a replay on a later day is a *different* snapshot rather than a duplicate. Of the 5 documents that can actually produce a snapshot, **2 are affected**.
**Correction (recommended):** require `year` for snapshot creation — refuse with 409 when NULL, and validate the value is a plausible year before `make_date`. Rationale: a financial snapshot must be dated by the document's own period, not by the day someone clicked; and it removes the identity instability entirely. **Impact: 2 of 5 candidate documents** need their `year` set (a one-field data fix), and 0 documents have a `tax_year` fallback available.
**Alternative, if `year` cannot be required:** keep the fallback, exclude the *fallback* date from identity, and accept a documented mismatch between the stored date and the hash for undated documents. Not recommended — it breaks the "everything stored is hashed" invariant.

**3.6 Hash gap (req 4).** Add `business_id` to the hash input. No other stored-and-written column is missing.

**3.7 Not invalidating, but must be decided (D-14b).** Our promotion policy prevents **our own** stale replay; it cannot prevent the ten competing writers from overwriting `annual_revenue`/`net_profit` after we commit. Options: accept and document, or add an arbitration rule (out of S4 scope). **Do not claim exclusivity.**

---

## 4. Gate B readiness recommendation

**Recommendation: NOT READY — proceed only after the §3 corrections are folded into a Revision 5 proposal.** The design survived verification broadly intact: authorization, contract enforcement, the identity model, the promotion policy and the grant hygiene are all sound and now evidence-backed. But **three defects would fail at runtime on the first call** (3.1, 3.2, 3.4), one is a redundant artifact (3.3), one is a material identity decision (3.5), and one is a one-line hash gap (3.6). None requires redesign; all are corrections to the proposal text.

**Verified and clearing their gates:** V-1 (vocabulary), V-2 (uniqueness), V-3, V-4 (**D-13 decidable**), V-6, V-10, V-11, V-12, V-13, V-15, plus req 4's coverage check and req 7's full type/constraint inventory.

### Actual blockers

| # | Blocker | Type | Resolves by |
|---|---|---|---|
| **B-1** | `'projected'` is not an allowed `snapshot_type` | **Runtime failure** | Edit the whitelist to `'projection'` (§3.1) |
| **B-2** | Dashboard INSERT omits NOT NULL `profile_id` | **Runtime failure** | Supply `documents.profile_id`; prefer `ON CONFLICT (business_id) DO UPDATE` (§3.2) |
| **B-3** | New functions default-grant EXECUTE to `anon`/`authenticated` | **Security** | Keep the REVOKE-first block on **both** functions (§3.4) |
| **B-4** | `snapshot_date` fallback destabilizes identity for 62/78 documents | **Correctness decision** | Require `year` (recommended), or accept documented instability (§3.5) |
| **B-5** | `business_id` missing from the identity hash | **Correctness** | Add one key (§3.6) |
| **B-6** | Advisor assignment creation/revocation never exercised; `advisor_assignments` does not exist | **Decision** | **D-4 stays disabled** — no code change needed (already the design) |
| **B-7** | `created_by` attribution behaviour | **Decision** | **D-13** is now decidable on evidence; recommend omit (0/72 convention) |
| **B-8** | Competing dashboard writers can overwrite our metrics | **Design decision (D-14b)** | Accept + document, or arbitrate — do not claim exclusivity |

### Not blockers

- **V-9** margin unit: unresolvable from data (0 values) → margin stays unwritten (D-11 unchanged).
- **V-8** `end_date` semantics: unverified but inert; predicate retained.
- **V-5/D-4**: zero practical impact today (0 of 9 businesses have an advisor).
- **Incidental pre-existing debt, out of S4 scope** (reported, not corrected): `ownershipConcentrationEngine`, `ownershipAdjustmentEngine` and `expandStrategyOpportunities` select `revenue`/`enterprise_value` from `dashboard_metrics`, neither of which is a column; `hydrateDashboardFromJourney` upserts snapshots `ON CONFLICT (profile_id, snapshot_date)` but **no unique index on those columns exists**; `guestSessionService` upserts `business_owners` with `onConflict: 'profile_id,business_id'` while the deployed unique constraint is three-column — the ON CONFLICT targets do not match, so those upserts cannot succeed as written.

---

## 5. What was not verified (stated limits)

- The **RPC's own behaviour** — neither function exists; all SQL assertions are structural, not executed.
- `documents.business_id` foreign-key existence (documents constraints were not enumerated); `business_id` is used as a UUID predicate either way.
- Whether any **operational process outside the repository** writes `profile_status` or `assigned_advisor_id` (dashboard, manual SQL). The repository is conclusive; the operational practice is not.
- `business_owners.end_date` semantics, and whether an "ended" owner is intended to lose access.
- The **overlap** between the 7 documents with a NULL `business_id` and the 5 documents carrying reviewed fields — a pre-implementation count, not a SQL-validity question.
- RLS **policy contents** (RLS is enabled; the policies themselves were not read).

---

## 6. Status

**Stop point reached.** No further action taken; Gate B not entered. The verification outcome is: **the proposal is directionally sound, but four SQL defects and two open decisions must be resolved before isolated testing.** The natural next artefact is a Revision 5 packet folding in §3.1–§3.6, which I have not produced.