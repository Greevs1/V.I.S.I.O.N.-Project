# Phase S4 — Gate A **Revision 5** · Final, Implementation-Ready Packet
## PROPOSAL ONLY · **Gate B NOT AUTHORIZED**

**Base:** `VISION_SECURITY_S4_SNAPSHOT_AUTHORIZATION_PREFLIGHT.md` (Rev 2) → `..._GATE_A_REVISION_3.md` (Rev 3) → `..._GATE_A_REVISION_4.md` (Rev 4) → `VISION_SECURITY_S4_STEP171_VERIFICATION.md` (verification evidence).
**This packet is the consolidated, superseding text.** Where Rev 2/3/4 and this revision differ, **this revision governs**.

**Companion deliverables (same packet):**
- `VISION_SECURITY_S4_REVISION_5_SQL.md` — the exact proposed SQL migration and rollback (§4).
- `VISION_SECURITY_S4_REVISION_5_TESTS.md` — reconciliation against the verified schema, findings recorded but not fixed, and the full adversarial/regression test plan (§6, §8, §9).

**Scope:** no application code edited · no migration created · no SQL executed · no tests run · nothing deployed · no financial record written · production Supabase, CB-005A, CB-005B, providers and Digital Twin untouched.

**Evidence added in this revision (read-only):** `pg_policies` on the six tables; the `pg_proc` body of `can_access_business`; function-name and table-name availability; `pg_default_acl`; the deployed snapshot-type CHECK; the deployed review-queue selector; the writer inventory. No financial rows read; no PII emitted.

---

## 0. What Revision 5 changes

Three defects found in Step 171 would have failed on the first call; a **fourth** was found only during this revision's reconciliation. Two further evidence findings change the design materially: a **third** snapshot-type allowlist exists in the deployed UI, and PostgreSQL's inference rules require the partial index's predicate in `ON CONFLICT`.

| # | Correction | Item |
|---|---|---|
| **C1** | `'projection'` replaces `'projected'` at **all three** allowlist sites: the SQL whitelist, the Base44 constant, and the deployed review-queue selector | 1 |
| **C2** | Dashboard creation includes the pinned document's `profile_id`; the write becomes an `ON CONFLICT (business_id) WHERE business_id IS NOT NULL DO UPDATE` upsert against the verified partial unique index | 2 |
| **C2b** | The `ON CONFLICT` conflict target **must carry the index predicate** — the deployed index is partial, and a bare `ON CONFLICT (business_id)` is not inferred | 2, 12 |
| **C3** | Least-privilege execution boundary on **both** functions **and** the new audit table: `REVOKE` from `PUBLIC`/`anon`/`authenticated` first, `GRANT` to `service_role`, signatures schema-qualified, `SECURITY INVOKER`, `search_path = ''` | 3 |
| **C4** | `CURRENT_DATE` fallback removed; a valid reporting year from the source document is required, with controlled errors. Existing documents are **not** modified | 4 |
| **C5** | `business_id` added to the content hash; coverage and exclusions restated in full | 5 |
| **C6** | Advisor authority disabled in **both** layers by an explicit constant; no expert substitute, no new assignment model | 6 |
| **C7** | `created_by` omitted; canonical actor identity preserved; deduplicated submissions recorded in a new append-only audit table that does not touch the hash | 7 |
| **C8** | Promotion policy preserved as the only projection rule; cross-writer behaviour defined and labelled an unresolved limitation | 8 |
| **C9** | The redundant latest-snapshot index is removed from the proposal; demote-then-promote is mandatory | 9 |
| **C10** | Status policy preserved exactly: `{active, incomplete}` admitted; `invited` and `suspended` denied; status alone never grants | 10 |
| **C11** | Ownership revocation re-examined: **no ownership grant in this codebase can currently be revoked**; risk stated; authorization **not** broadened | 11 |
| **C12** | Full reconciliation against the verified schema, constraints, permissions and signatures; residual blockers listed | 12 |

---

## 1. Corrections applied (exact deltas)

### C1 — `'projection'` at every allowlist site

Verified: `business_metric_snapshots_snapshot_type_check` permits `('current','prior','historical','before_strategy','after_strategy','projection','tax_year','quarter','month')`. `'projected'` is **not** among them.

A repository sweep for `snapshot_type` allowlists found **three** sites, all of which must move together:

| Site | Before | After |
|---|---|---|
| SQL whitelist (Rev 2 §9.2 step 1; Rev 3 §3.2) | `p_snapshot_type not in ('historical','tax_year','projected')` | `... not in ('historical','tax_year','projection')` |
| Base44 `SNAPSHOT_TYPES` (Rev 2 §8.2 line 309) | `['historical','tax_year','projected']` | `['historical','tax_year','projection']` |
| **Deployed UI selector** `src/components/admin/ExtractedFieldsReviewQueue.jsx:424` | `<SelectItem value="projected">Projected</SelectItem>` | `<SelectItem value="projection">Projection</SelectItem>` |

**The UI site was not in any previous revision and is a live end-to-end defect today:** the review queue offers "Projected", the current function accepts it (`SNAPSHOT_TYPES` contains `'projected'`), and the database constraint would reject it. That option has **never** worked.

**No other allowlist exists.** Every other `'projected'` in the repository is an unrelated vocabulary — the Galileo answer basis (`shared/galileo/answerEngine/*`), the valuation `period_type` (`shared/valuationEngine/types.ts`), Digital Twin document natures (`shared/digitalTwin/preflight.ts`), an admin outcome status, and a Galileo panel label. None is a `snapshot_type`, and none is touched by this packet.

**Default derivation is unchanged** (`tax_year` for business tax returns, else `historical`) — both values remain permitted.

### C2 / C2b — dashboard creation

Verified: `dashboard_metrics.profile_id` is **NOT NULL with no default**; `ux_dashboard_metrics_business_id` is a **partial** unique index — `UNIQUE (business_id) WHERE business_id IS NOT NULL`.

Two consequences:

1. **The INSERT must supply `profile_id`** (the pinned document's `profile_id`, already required non-null by the 409 rule). As previously written, the INSERT could never succeed.
2. **The conflict target must carry the index predicate.** A partial unique index is inferred only when the `ON CONFLICT` clause states a predicate that implies the index's own. A bare `ON CONFLICT (business_id)` is therefore **not inferred** and raises *"there is no unique or exclusion constraint matching the ON CONFLICT specification"* — a first-call runtime error. The correct form:

```sql
  insert into public.dashboard_metrics as dm
    (business_id, profile_id, annual_revenue, net_profit, latest_snapshot_id, created_at, updated_at)
  values (...)
  on conflict (business_id) where business_id is not null
  do update set
    annual_revenue     = coalesce(excluded.annual_revenue, dm.annual_revenue),
    net_profit         = coalesce(excluded.net_profit, dm.net_profit),
    latest_snapshot_id = excluded.latest_snapshot_id,
    updated_at         = clock_timestamp();
```

`coalesce(excluded.<metric>, dm.<metric>)` preserves the existing behaviour: a metric absent from this snapshot keeps the value it had. The upsert is **race-proof against duplicate row creation** because it is arbitrated by a deployed unique index — it no longer depends on the advisory lock.

**What this does NOT claim.** The index prevents duplicate *rows*. It does **not** prevent another writer updating the same row's `annual_revenue`/`net_profit`; ten application writers touch this table (§9). That is stated as an unresolved limitation, not a guarantee.

### C3 — least-privilege execution boundary

Verified with `pg_default_acl` (schema `public`, owner `postgres`):

```
{postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres, authenticated=arwdDxtm/postgres, service_role=arwdDxtm/postgres}   -- tables
{postgres=X/postgres,       anon=X/postgres,       authenticated=X/postgres,       service_role=X/postgres}             -- functions
```

PostgreSQL grants `EXECUTE` to `PUBLIC` by default on any new function, **and** this workspace's default ACL additionally names `anon` and `authenticated`. Live confirmation on existing tables: `anon` holds `SELECT/INSERT/UPDATE/DELETE` on `business_metric_snapshots`, and `INSERT` on `dashboard_metrics`, `extracted_fields`, `documents`. The tracked SEC-031/SEC-032 debt is therefore live, and RLS is what contains it.

Boundary applied to **all three** new objects:

- `security invoker` — no privilege elevation. The only intended caller already holds the service-role key, so `security definer` would add an owner-privileged surface and buy nothing.
- `set search_path = ''` — strengthened from Rev 2/3 (`public, pg_temp`). Every object is schema-qualified in the body, and `pg_catalog` is always searched implicitly. This removes temporary-object shadowing entirely.
- Signatures always schema-qualified and fully typed in `REVOKE`, `GRANT`, `DROP` and `COMMENT`.
- `REVOKE ALL ... FROM public`, then `... FROM anon, authenticated`, then `GRANT EXECUTE ... TO service_role` — **REVOKE first** (CB-001.1 precedent).
- The new table is `ENABLE ROW LEVEL SECURITY` with **zero policies** (deny-all to every non-bypassing role) plus `REVOKE ALL ... FROM public, anon, authenticated`, then `GRANT SELECT, INSERT ... TO service_role`. Without that revoke, a new table in `public` inherits `arwdDxtm` for `anon`/`authenticated` by default ACL.

**Honest limit of the boundary:** the object owner (`postgres`), superusers, and anyone holding the service-role key can execute regardless. The boundary is *"service-role only, apart from the owner and superusers"*. The service key itself is the residual trust, exactly as the trust-boundary statement says.

**RLS inspection (read-only, item 3).** `pg_policies`:

| Table | Policies | Command | Predicate | Roles |
|---|---|---|---|---|
| `business_metric_snapshots` | 3 | INSERT / SELECT / UPDATE | `can_access_business(business_id)` | `{public}` |
| `dashboard_metrics` | 1 | ALL | `can_access_business(business_id)` | `{public}` |
| `extracted_fields` | 1 | ALL | `can_access_business(business_id)` | `{public}` |

`can_access_business(uuid)` is `SECURITY DEFINER` and resolves to:

```sql
select exists (select 1 from public.business_entities b
  where b.id = target_business_id
    and (b.profile_id = auth.uid()
      or b.assigned_advisor_id = auth.uid()
      or public.is_super_admin()
      or exists (select 1 from public.business_team_members tm
                  where tm.business_id = b.id and tm.profile_id = auth.uid())));
```

Three readings follow, and all three matter:

1. **Anonymous callers are denied.** `auth.uid()` is NULL for `anon`, so every comparison is NULL — the policy is fail-closed. `anon`'s live table privileges are therefore not currently reachable through PostgREST.
2. **The direct-write path is a real path, not a theoretical one.** An owner (once `auth.uid()` resolves) can INSERT/UPDATE snapshots, dashboard metrics and extracted fields directly through PostgREST, bypassing the RPC and every check it performs. The predicate additionally admits `team_member` and assigned-advisor identities — **wider than the approved snapshot policy**. This is a pre-existing property of the platform's RLS, not something this packet changes; it is recorded as finding **P-1** because it is the honest scope of what the RPC's integrity guarantees cover.
3. **The identity link is largely broken.** 7 of 8 profiles have `base44_user_id` set and `auth_user_id` NULL, so `auth.uid()` resolves for almost nobody — the policies are, in practice, deny-all. Fail-closed, but it means the direct-write path is currently unwalked rather than absent (**P-2**).

Residual probe not read: the body of `public.is_super_admin()`. It cannot be satisfied by `anon` (no JWT), so it does not affect the anonymous verdict.

### C4 — no `CURRENT_DATE` fallback

Verified: `documents.year` is `int4` nullable; **62 of 78 documents have NULL `year`**, and `tax_year` is populated on **0** rows (no recovery source). Of the **5** documents carrying accepted/corrected fields, **3 have a year and 2 do not**.

Removed:

```sql
  v_snapshot_date := case when v_doc_year is not null
                          then make_date(v_doc_year, 12, 31) else current_date end;   -- REMOVED
```

Replaced (before the advisory lock, so a refusal never holds the lock):

```sql
  v_min_year constant integer := 1900;
  v_max_year constant integer := 2100;
  ...
  if v_doc_year is null then
    raise exception 'SNAPSHOT_YEAR_REQUIRED' using errcode = '22023';
  end if;
  if v_doc_year < v_min_year or v_doc_year > v_max_year then
    raise exception 'SNAPSHOT_YEAR_IMPLAUSIBLE' using errcode = '22023';
  end if;
  ...
  v_snapshot_date := make_date(v_doc_year, 12, 31);
```

Rationale: the date is stored **and** hashed, so a fallback made identity depend on the day someone clicked. A financial snapshot must be dated by the document's own reporting period. The range check also removes a latent `make_date` overflow (`22008`) for a corrupt year — the observed domain is 2020–2025, so 1900–2100 is generous and safe.

**Existing documents are not modified** (per instruction). The **2** undated documents are refused with a controlled 409 telling the user to set the document year. That is a data precondition, not a code defect.

**Future reporting-period model (documented, not implemented).** The table already carries `period_label`, `fiscal_year`, `fiscal_quarter`, `fiscal_month` — verified present, currently unused — so the model needs **no schema change**:

| Statement kind | `snapshot_type` | `snapshot_date` | Period columns |
|---|---|---|---|
| Annual (today) | `historical` / `tax_year` | `make_date(year, 12, 31)` | `fiscal_year = year` |
| Quarterly (future) | `quarter` | last day of the reported quarter | `fiscal_year`, `fiscal_quarter`; requires a quarter-bearing source field in the contract |
| Point-in-time / as-of (future) | `current` / `historical` | the document's as-of date | `period_label` free text; requires an as-of-date field in the contract |
| Projection (future) | `projection` | the projection's target date | `scenario_type = 'projection'`, `scenario_name` |

Each kind is a **contract-version change** (`s4.mapping.v2`, …), because the reporting period is part of identity: the contract already carries `from` per target, and a period field would be declared the same way. This packet implements only the annual case.

### C5 — `business_id` joins the hash

The rule stands: **everything stored must be hashed, and everything hashed must be a variable that is also inserted.** Applied to the real column list, exactly one gap existed — `business_id` (NOT NULL, stored, semantic). It is now in the hash, together with `profile_id`, the contract-ordered `values`, the contract-ordered `sources`, the resolved `snapshot_date` and the **stored** confidence:

```sql
  v_confidence_stored := round(v_confidence, 2);
  v_content_hash := md5(jsonb_build_object(
    'business',        p_business_id,        -- C5: added
    'document',        p_source_document_id,
    'profile',         v_doc_profile,
    'mapping_version', p_mapping_version,
    'document_type',   v_doc_type,
    'basis',           p_basis,
    'snapshot_type',   v_snapshot_type,
    'snapshot_date',   v_snapshot_date,
    'confidence',      v_confidence_stored,  -- the stored value, not the raw mean
    'values',          v_hash_input,         -- contract-ordered target = value
    'sources',         v_source_input        -- contract-ordered target = [field ids]
  )::text);
```

| Item | Covered? | Treatment |
|---|---|---|
| Financial content (9 metric columns) | **Hashed** | `values`, contract-ordered |
| Metadata financial content (`total_liabilities`, `total_equity`, `taxable_income`, `monthly_debt_payment`, `mean_interest_rate`, `employee_count`, `payroll_tax`) | **Hashed** | Same loop, same contract order |
| Source provenance (ids per target, op, source field name) | **Hashed** | `sources` (ids) + `metadata.provenance` (op, from) |
| Source identity (document, business, owner profile) | **Hashed** | `document`, `business`, `profile` |
| Mapping version, document type, basis | **Hashed** | Contract identity |
| Resolved snapshot type, snapshot date, stored confidence | **Hashed** | From the same variables the INSERT writes |
| Timestamps (`created_at`, `updated_at`) | Excluded | Server-generated, not content |
| `data_source` | Excluded | **Constant** `'advisor_review'`; constancy is the reason |
| Column defaults (`is_baseline=false`, `scenario_type='actual'`, null period columns) | Excluded | Never written by this path |
| **`is_latest`** | Excluded | **Mutable promotion state** — required exclusion |
| **`created_by`** (column) / **`metadata.created_by_base44_user_id`** | Excluded | **Attribution** — required exclusion |
| **New audit rows** (§C7) | Excluded | A record *about* a submission, never content |
| `latest_snapshot_id` (on `dashboard_metrics`) | Excluded | Promotion marker on a different row |

A post-insert assertion checks the stored row against the values the hash was computed from (date, stored confidence, the metadata block, and the hash itself), so a silent divergence aborts the transaction (`SNAPSHOT_IDENTITY_LOST`).

### C6 — advisor authority disabled in both layers

Verified again in this revision: `business_entities.assigned_advisor_id` is `uuid` nullable, FK → `profiles(id)`, **0 of 9 set**; **no writer exists anywhere in the repository** (every reference is a read); `profiles.assigned_advisor_id` is a second, also-unused pointer; and **`advisor_assignments` does not exist** as a table (`to_regclass` null).

Disabled by an explicit constant in each layer — flipping one constant is the whole re-enable, and nothing else changes:

```ts
/** D-4 — DISABLED. Neither assignment creation nor revocation is evidenced. */
const ADVISOR_AUTHORITY_ENABLED = false;
```

```sql
  v_advisor_authority_enabled constant boolean := false;   -- D-4
```

**No expert-only substitution. No new assignment model. No broadening of any kind.** Advisors are denied; experts and `expert_advisor` profiles are denied; team members are denied. The interim route for an advisor who must author snapshots remains an explicit `business_owners` record.

### C7 — attribution without touching the hash

Verified: `business_metric_snapshots.created_by` is `uuid` **nullable**, **no default**, FK → `profiles(id) ON DELETE SET NULL`, and **all 72 existing rows are NULL** — the convention for this table is that it is never written.

Decisions:

- **`created_by` stays out of the INSERT.** No UUID is guessed; the table's own convention is preserved; the column remains available to a future, separately-approved attribution decision.
- **Canonical actor identity is preserved**: `p_actor_profile_id` is validated against `profiles` and written to the audit row, and remains the only canonical identity on the write path.
- **`metadata.created_by_base44_user_id`** keeps the **first** writer's Base44 id (text, unconstrained) — attribution, never authorization, never hashed.
- **Deduplicated submissions by different authorized callers are recorded in a new append-only table**, so attribution survives a dedupe without mutating the snapshot row and **without entering the hash**:

```sql
create table public.snapshot_submission_audit (
  id                    uuid primary key default extensions.uuid_generate_v4(),
  snapshot_id           uuid not null references public.business_metric_snapshots(id) on delete restrict,
  business_id           uuid not null references public.business_entities(id)        on delete restrict,
  content_hash          text not null,
  actor_profile_id      uuid not null references public.profiles(id)                 on delete restrict,
  actor_base44_user_id  text,
  deduplicated          boolean not null,
  dashboard_updated     boolean not null,
  is_latest_requested   boolean not null,
  submitted_at          timestamptz not null default clock_timestamp()
);
```

One row is written **on every accepted call, on both the insert and the dedupe path**, inside the same transaction. Consequences, stated plainly:

- Two authorized callers submitting identical content produce **one snapshot and two audit rows**; the snapshot keeps the first writer's `metadata` attribution, and the second caller is told `deduplicated: true` with the returned `snapshot_id`.
- The hash is unchanged by attribution, so dedupe still works across callers — the property **D-14** asks to preserve.
- The table is append-only in practice: `ON DELETE RESTRICT` on every reference, consistent with the CB-005B evidence-retention posture, and `business_metric_snapshots` carries **no DELETE policy**, so an audited snapshot cannot be deleted out from under its audit trail.
- Naming and shape follow the deployed precedent `public.provider_operation_audit` (CB-004). `snapshot_submission_audit` is verified unused.

**Rejected alternative:** recording submissions in `metadata.submission_log` on the snapshot row. It would mutate a row after the fact, make the stored metadata non-deterministic, and re-open the question of what the hash covers.

### C8 — promotion policy preserved; cross-writer behaviour defined

Unchanged in substance from Rev 4 §3.2: **only the promoted snapshot may project to the dashboard.**

```sql
  if coalesce(p_update_dashboard, false) then
    if not v_is_latest_now then
      v_dashboard_skip := 'not_latest';                       -- an older replay: refused, and reported
    elsif (v_metrics ? 'annual_revenue' or v_metrics ? 'net_profit') then
      -- capture the previously promoted date BEFORE the upsert, so a backward promotion is reported
      select sm.snapshot_date into v_previous_latest_date
        from public.business_metric_snapshots sm
       where sm.business_id = p_business_id and sm.is_latest and sm.id <> v_snapshot_id
       order by sm.snapshot_date desc limit 1;
      <upsert of C2/C2b>
      if v_previous_latest_date is not null and v_snapshot_date < v_previous_latest_date then
        v_promoted_over_newer := true;
      end if;
    else
      v_dashboard_skip := 'no_dashboard_metrics';
    end if;
  end if;
```

**Behaviour when another writer changes `annual_revenue` or `net_profit`:** whichever transaction commits last wins that column. This function does not re-assert, retry, watch, or arbitrate. What it *does* leave behind is a durable marker — `dashboard_metrics.latest_snapshot_id` — so the divergence is **detectable**: compare the projection against the snapshot it claims to reflect (§7.2). This is an **unresolved cross-writer consistency limitation** (§7), explicitly not a solved problem.

### C9 — redundant index removed; ordering mandatory

Verified: **`unique_latest_snapshot_per_business` — `UNIQUE (business_id) WHERE is_latest = true` — is already deployed**. Rev 2 §9.5's `ux_bms_one_latest_per_business` is therefore deleted from this packet as a duplicate. Zero businesses currently hold more than one `is_latest` row.

Because the index is live, **demote-then-promote is mandatory, not stylistic**: promoting a second row while another is `is_latest` violates the constraint. The order is preserved on **both** paths (insert path and dedupe-promotion path): `set is_latest = false where business_id = … and id <> v_snapshot_id and is_latest` → `set is_latest = true where id = v_snapshot_id`.

The content-hash expression index (`ix_bms_content_hash`) remains **optional hardening, deferred** (D-12) — correctness does not depend on it.

### C10 — status policy preserved

Verified: `profiles_profile_status_check` admits exactly `('invited','active','incomplete','suspended')`; observed `active` 1, `incomplete` 7, `invited` 0, `suspended` 0. **`incomplete` is the column default**, and **no application code writes `profile_status`** — onboarding is tracked separately by `profiles.onboarding_completed`.

Policy, unchanged and now evidence-backed:

- **Admitted:** `{active, incomplete}` — a named constant in **both** layers (`ACTIVE_PROFILE_STATUSES`, `v_active_statuses`).
- **Denied:** `invited` (no standing yet), `suspended` (explicit revocation), and any unobserved value (fail closed).
- **Status never grants.** It can only remove eligibility. Authorization requires, conjunctively: an authenticated canonical identity (Base44 session → `profiles` row, via `authenticateActor` with its central suspension gate), a status inside the allowlist, and a **verified business relationship** (platform admin, or business owner by entity or by ownership record).
- Because `profile_status` is unmaintained and means "never advanced", it carries little weight; the relationship is the control.

### C11 — ownership revocation: the risk, stated

Verified in this revision:

| Grant path | How it is created | How it can be revoked today |
|---|---|---|
| `business_entities.profile_id` | Set at creation (`createBusinessEntity`, `orchestrateBusinessCreation`, `enterpriseDiscoveryOrchestrator`, `guestSessionService`, `uploadDocumentToSupabase`, `getUploadSignedUrl`) | **No path.** No code updates this column after insertion. Deleting the entity is blocked by `dashboard_metrics` and `business_metric_snapshots` FKs (`NO ACTION`). |
| `business_owners` row | Inserted by `valuationService`, `enterpriseDiscoveryOrchestrator`, `orchestrateBusinessCreation`, `guestSessionService` | **No path.** `end_date` is never written by any code (0 of 3 rows ended), so the active-ownership predicate is inert. |

**Finding:** under current code, **every ownership grant is effectively permanent**. A former owner retains snapshot authority indefinitely. That is the risk this item asks to identify, and it is a *product/administration* gap, not a flaw in this RPC — which re-reads ownership at call time and therefore honours a future revocation mechanism **immediately, with no code change** (that is the design property worth keeping).

**Not done, deliberately:** authorization is **not** broadened to team members or experts, and no new assignment model is introduced. `team_member` and expert identities remain denied even though the platform RLS predicate admits team members — the snapshot policy is stricter, which is correct for authoritative financial writes.

**Recommended follow-ups (separate approval, not in this packet):** an explicit ownership-revocation path (setting `business_owners.end_date`, or reassigning `business_entities.profile_id`) with its own review; and the read-only stale-authority probe in the companion test file (§9.5).

---

## 2. Revision 5 decision register

**APPROVED / carried** — no further ruling needed:

| # | Decision | Status |
|---|---|---|
| D-1 | 404 for unauthorized and cross-business (indistinguishable from absent) | Carried |
| D-2 | Team-member / expert access denied | Carried |
| D-3 | Snapshot writes typed columns (no `data` column exists) | Carried |
| D-5 | *(withdrawn)* | Carried |
| D-6 | Server-side timestamps only | Carried |
| D-7 | Documents with no business or owner → 409 fail-closed | Carried |
| D-8 | `total_liabilities` → `metadata.total_liabilities` | Carried |
| D-10 | `metadata.mean_interest_rate` (honest mean); no `weighted_interest_rate` key | Carried |
| D-11 | `net_margin` **not written** — 0 non-null values exist, so the unit is unresolvable | Carried, reconfirmed |
| D-12 | Optional content-hash index deferred | Carried |

**Now DECIDED on verified evidence** (previously conditional):

| # | Decision | Ruling | Evidence |
|---|---|---|---|
| **D-4** | Advisor authority | **DISABLED** in both layers (`false` constant) | 0 of 9 assigned; no writer; `advisor_assignments` absent |
| **D-13** | `created_by` | **Omitted from the INSERT** | nullable, FK → `profiles(id)`, no default, 0 of 72 written |
| **D-9** | Idempotency by content hash; side effects on both paths; `deduplicated` reported | **Adopted** | Design fully specified (Rev 3 §3.5 + C7) |

**Open — requires your ruling before Gate B:**

| # | Decision | Recommendation | Alternative |
|---|---|---|---|
| **D-14** | Attribution on dedupe: the surviving row keeps the **first** writer's attribution; the second caller is told `deduplicated: true` | **Confirm** — and the new audit table records *both* submissions | Reject dedupe (accept duplicate snapshots) |
| **D-15** | **New append-only table `snapshot_submission_audit`** (the one added object beyond functions) | **Approve** — the only way to make deduped submissions durably auditable without touching the hash | Decline: deduped submissions are recorded **nowhere durable** (weaker audit) |
| **D-16** | Cross-writer dashboard consistency | **Accept as a documented limitation**; design arbitration separately | Commission arbitration now (a much larger change touching ten writers) |
| **D-17** | Require a reporting year, refusing the 2 undated documents | **Approve** (data precondition; no document modified) | Keep a fallback: rejects the identity rule of C5 |
| **D-18** | Ship the review-queue selector fix in the same change-set | **Approve** (C1) | Leave the UI offering a value the database refuses |

---

## 3. Exact proposed TypeScript changes

**One Base44 file replaced in full:** `base44/functions/createSnapshotFromReviewedFields/entry.ts`. **One line changed in the UI:** `src/components/admin/ExtractedFieldsReviewQueue.jsx:424`.

No shared-module change; no new function; no new dependency. `validateBusinessScope` and `authorizeDocumentAccess` remain unused here (Rev 2 §3.1).

```ts
/**
 * createSnapshotFromReviewedFields — Phase S4 SECURITY HARDENING (Gate A revision 5)
 *
 * WHAT WAS WRONG (Step 162 audit):
 *   1. `auth.me()` failures were swallowed into `user = null` and execution continued.
 *   2. The role check read the DOCUMENT OWNER's app_role, not the authenticated caller's.
 *   3. No authorization against the document's business; any documentId reached the write path.
 *   4. The insert named a `data` column that does not exist, and wrote a Base44 id into a uuid FK.
 *
 * TRUST BOUNDARY — read this before changing anything here:
 *   The RPC this function calls is invoked with the service-role key. Its parameters do NOT
 *   prove end-user identity: any holder of that key could pass any profile id. THIS FUNCTION
 *   is the authentication boundary — it derives the actor from the trusted Base44 session via
 *   authenticateActor(). The RPC independently validates the actor's PROFILE AND ITS STATUS and
 *   its authorized RELATIONSHIP to the business, and pins the tenant to the document. It does
 *   not, and must never be described as, authenticating the end user. `created_by` is not written
 *   at all; attribution lives in metadata and in the append-only submission audit.
 *
 * SOURCE INTEGRITY — no financial VALUE is sent from here. This file decides which accepted
 * fields feed which targets (the mapping contract mirror, below); the database reads the numbers
 * from extracted_fields inside the transaction and refuses any field that is not an accepted or
 * corrected field of this document AND this business AND this target's declared source field.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { authenticateActor, errorResponse, HttpError } from '../../shared/authz/actor.ts';

/** The mapping contract version. Any change to FIELD_CONTRACT requires a new version string. */
const MAPPING_VERSION = 's4.mapping.v1';

/**
 * The DEPLOYED snapshot_type vocabulary is ('current','prior','historical','before_strategy',
 * 'after_strategy','projection','tax_year','quarter','month'). This is the strict subset the
 * review path may request. 'projection' — NOT 'projected'
 * (business_metric_snapshots_snapshot_type_check).
 */
const SNAPSHOT_TYPES = ['historical', 'tax_year', 'projection'];

/** Metadata keys owned by the writer. A contract target may never collide with one. */
const RESERVED_METADATA_KEYS = [
  'mapping_contract', 'basis', 'content_hash', 'provenance', 'created_by_base44_user_id',
];

/**
 * Active-status allowlist for SNAPSHOT AUTHORITY — stricter than the platform-wide gate in
 * authenticateActor (which refuses only `suspended`). The declared vocabulary is
 * ('invited','active','incomplete','suspended'); `invited` and `suspended` are denied here, and
 * any unobserved value fails closed. `incomplete` is the column DEFAULT and means "never
 * advanced", so the RELATIONSHIP is the grant and status only removes eligibility.
 */
const ACTIVE_PROFILE_STATUSES = ['active', 'incomplete'];

/**
 * D-4 — DISABLED. `business_entities.assigned_advisor_id` is the certified column, but neither
 * assignment creation nor revocation is evidenced: no writer exists in this repository, 0 of 9
 * businesses are assigned, and the `advisor_assignments` table does not exist. Until both are
 * evidenced, an `advisor` app_role grants NO snapshot authority. Flipping this constant is the
 * ONLY change needed to re-enable it.
 */
const ADVISOR_AUTHORITY_ENABLED = false;

/** A snapshot must be dated by its document's reporting period, never by the day it was created. */
const MIN_REPORTING_YEAR = 1900;
const MAX_REPORTING_YEAR = 2100;

/**
 * Controlled SQL outcomes → safe HTTP outcomes. Unknown codes are logged and returned as a
 * generic 500; no database message ever reaches the caller.
 */
const RPC_ERROR_STATUS: Record<string, number> = {
  SNAPSHOT_FIELD_NOT_CONTRACTED: 409,
  SNAPSHOT_YEAR_REQUIRED: 409,
  SNAPSHOT_YEAR_IMPLAUSIBLE: 409,
  SNAPSHOT_MAPPING_VERSION_UNSUPPORTED: 400,
  SNAPSHOT_DOCUMENT_TYPE_UNSUPPORTED: 400,
  SNAPSHOT_BASIS_MISMATCH: 400,
  SNAPSHOT_DUPLICATE_TARGET: 400,
  SNAPSHOT_DUPLICATE_FIELD: 400,
  SNAPSHOT_TARGET_NOT_IN_CONTRACT: 400,
  SNAPSHOT_RESERVED_METADATA_KEY: 400,
  SNAPSHOT_INVALID_TARGET: 400,
  SNAPSHOT_INVALID_TYPE: 400,
  SNAPSHOT_INVALID_INPUT: 400,
  SNAPSHOT_OP_MISMATCH: 400,
  SNAPSHOT_CARDINALITY_VIOLATION: 400,
  SNAPSHOT_FIELD_VALUE_MISSING: 400,
  SNAPSHOT_DOCUMENT_BUSINESS_MISMATCH: 404,     // non-disclosure (D-1)
  SNAPSHOT_FORBIDDEN: 404,                      // non-disclosure (D-1)
  SNAPSHOT_ACTOR_UNKNOWN: 403,
  SNAPSHOT_ACTOR_STATUS_NOT_ACTIVE: 403,
  SNAPSHOT_CONFIDENCE_UNAVAILABLE: 500,
  SNAPSHOT_DEDUPE_TYPE_MISMATCH: 500,
  SNAPSHOT_METADATA_LOST: 500,
  SNAPSHOT_IDENTITY_LOST: 500,
};

const RPC_ERROR_MESSAGES: Record<string, string> = {
  SNAPSHOT_YEAR_REQUIRED:
    'This document has no reporting year, so it cannot be dated. Set the document year and try again.',
  SNAPSHOT_YEAR_IMPLAUSIBLE:
    'This document reporting year falls outside the supported range.',
  SNAPSHOT_FIELD_NOT_CONTRACTED:
    'The reviewed fields changed while this snapshot was being created. Reload and try again.',
};

function mapRpcError(error: any): HttpError {
  const text = String(error?.message || '');
  const code = Object.keys(RPC_ERROR_STATUS).find((k) => text.includes(k));
  if (!code) return new HttpError(500, 'Internal server error');
  const status = RPC_ERROR_STATUS[code];
  if (status >= 500) return new HttpError(500, 'Internal server error');
  return new HttpError(status, RPC_ERROR_MESSAGES[code] || 'Request rejected');
}

/**
 * FIELD_CONTRACT — a MIRROR of the authoritative contract, which lives in the database
 * (`public.s4_mapping_contract(version)`). This copy exists only to build the selection.
 * The database re-validates every entry against its own copy and refuses anything that does
 * not match, so a drift between the two FAILS CLOSED — it can never produce a wrong value.
 * Parity between the two declarations is asserted by a test (T-N3).
 *
 * `from`        the ONLY extracted_fields.field_name permitted to feed this target
 * `op`          direct (exactly one row) | sum | mean (one or more rows)
 * `cardinality` one | many — enforced server-side
 */
type TargetSpec = { target: string; op: 'direct' | 'sum' | 'mean'; from: string; cardinality: 'one' | 'many' };

const FIELD_CONTRACT: Record<string, { basis: string; targets: TargetSpec[] }> = {
  profit_and_loss: {
    basis: 'book',
    targets: [
      { target: 'annual_revenue', op: 'direct', from: 'annual_revenue', cardinality: 'one' },
      { target: 'gross_profit', op: 'direct', from: 'gross_profit', cardinality: 'one' },
      { target: 'net_profit', op: 'direct', from: 'net_profit', cardinality: 'one' },
      { target: 'total_expenses', op: 'direct', from: 'total_expenses', cardinality: 'one' },
      { target: 'owner_compensation', op: 'direct', from: 'owner_compensation', cardinality: 'one' },
    ],
  },
  balance_sheet: {
    basis: 'book',
    targets: [
      { target: 'total_assets', op: 'direct', from: 'total_assets', cardinality: 'one' },
      { target: 'cash_on_hand', op: 'direct', from: 'cash_on_hand', cardinality: 'one' },
      { target: 'total_debt', op: 'direct', from: 'total_debt', cardinality: 'one' },
      { target: 'metadata.total_equity', op: 'direct', from: 'total_equity', cardinality: 'one' },
      // No column exists for total_liabilities; it persists in metadata under this exact key.
      { target: 'metadata.total_liabilities', op: 'direct', from: 'total_liabilities', cardinality: 'one' },
    ],
  },
  business_tax_return: {
    basis: 'tax',
    targets: [
      { target: 'annual_revenue', op: 'direct', from: 'gross_receipts', cardinality: 'one' },
      { target: 'net_profit', op: 'direct', from: 'ordinary_business_income', cardinality: 'one' },
      { target: 'owner_compensation', op: 'direct', from: 'officer_compensation', cardinality: 'one' },
      { target: 'payroll', op: 'direct', from: 'wages', cardinality: 'one' },
      { target: 'total_expenses', op: 'direct', from: 'deductions', cardinality: 'one' },
      { target: 'metadata.taxable_income', op: 'direct', from: 'taxable_income', cardinality: 'one' },
    ],
  },
  debt_schedule: {
    basis: 'schedule',
    targets: [
      { target: 'total_debt', op: 'sum', from: 'loan_balance', cardinality: 'many' },
      { target: 'metadata.monthly_debt_payment', op: 'sum', from: 'monthly_payment', cardinality: 'many' },
      { target: 'metadata.mean_interest_rate', op: 'mean', from: 'interest_rate', cardinality: 'many' },
    ],
  },
  payroll_report: {
    basis: 'payroll',
    targets: [
      { target: 'payroll', op: 'direct', from: 'total_payroll', cardinality: 'one' },
      { target: 'owner_compensation', op: 'direct', from: 'owner_payroll', cardinality: 'one' },
      { target: 'metadata.employee_count', op: 'direct', from: 'employee_count', cardinality: 'one' },
      { target: 'metadata.payroll_tax', op: 'direct', from: 'payroll_tax', cardinality: 'one' },
    ],
  },
};

function assertActiveProfile(actor: any) {
  const status = actor?.profile?.profile_status;
  if (!ACTIVE_PROFILE_STATUSES.includes(String(status))) {
    throw new HttpError(403, 'Forbidden');
  }
}

/**
 * assertSnapshotAuthority — the EXACT approved policy. No label matching, no borrowed rule.
 *   platform admin : app_role admin | super_admin
 *   business owner : business_entities.profile_id  OR an active business_owners row
 *   everything else: denied — including advisors (D-4 disabled), team members and experts (D-2)
 */
async function assertSnapshotAuthority(sb: any, actor: any, businessId: string): Promise<string> {
  if (!actor.profile_id) throw new HttpError(403, 'Forbidden');
  if (actor.isAdmin) return 'platform_admin';

  const { data: entity, error: entityError } = await sb
    .from('business_entities')
    .select('id, profile_id, assigned_advisor_id')
    .eq('id', businessId)
    .maybeSingle();

  // A FAILED LOOKUP IS NOT A MISSING RELATIONSHIP. It is an infrastructure failure, it is
  // logged, and it returns 500 — never a 403 that would hide a database problem as a policy
  // decision, and never a path that falls through to a write.
  if (entityError) {
    console.error('[snapshot] authority lookup failed (business_entities)');
    throw new HttpError(500, 'Internal server error');
  }
  if (!entity) throw new HttpError(403, 'Forbidden');

  if (entity.profile_id && entity.profile_id === actor.profile_id) return 'business_owner';

  // D-4 DISABLED — see ADVISOR_AUTHORITY_ENABLED.
  if (ADVISOR_AUTHORITY_ENABLED
      && actor.role === 'advisor'
      && entity.assigned_advisor_id === actor.profile_id) {
    return 'assigned_advisor';
  }

  const { data: ownerRow, error: ownerError } = await sb
    .from('business_owners')
    .select('id, end_date')
    .eq('business_id', businessId)
    .eq('profile_id', actor.profile_id)
    .or('end_date.is.null,end_date.gte.' + new Date().toISOString().slice(0, 10))
    .maybeSingle();

  if (ownerError) {
    console.error('[snapshot] authority lookup failed (business_owners)');
    throw new HttpError(500, 'Internal server error');
  }
  if (ownerRow) return 'business_owner_record';

  throw new HttpError(403, 'Forbidden');
}

/**
 * loadAuthorizedDocument — the single chokepoint. The tenant comes from the DOCUMENT ROW;
 * the caller comes from the SESSION. Denials are indistinguishable from absence.
 */
async function loadAuthorizedDocument(sb: any, actor: any, documentId: any) {
  if (!documentId || typeof documentId !== 'string') throw new HttpError(400, 'documentId required');

  const { data: doc, error } = await sb
    .from('documents')
    .select('id, name, document_type, year, business_id, profile_id')
    .eq('id', documentId)
    .maybeSingle();

  if (error) {
    console.error('[snapshot] document lookup failed');
    throw new HttpError(500, 'Internal server error');
  }
  if (!doc) throw new HttpError(404, 'Not found');
  if (!doc.business_id) throw new HttpError(409, 'This document is not attached to a business');
  if (!doc.profile_id) throw new HttpError(409, 'This document is not attached to an owner');

  try {
    await assertSnapshotAuthority(sb, actor, doc.business_id);
  } catch {
    throw new HttpError(404, 'Not found');
  }
  return doc;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const SUPABASE_URL = Deno.env.get('VITE_SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[snapshot] supabase not configured');
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── 1. AUTHENTICATE — the real boundary: session, suspension, canonical profile. ──
    const actor = await authenticateActor(base44, sb);
    assertActiveProfile(actor);

    // ── 2. REQUEST BODY — may describe WHAT is requested, never WHO may act, never a VALUE. ──
    let body: any;
    try {
      body = await req.json();
    } catch {
      throw new HttpError(400, 'Invalid request body');
    }
    const {
      documentId,
      snapshotType = null,
      isLatest = false,
      updateDashboard = false,
    } = body || {};

    if (snapshotType !== null && snapshotType !== undefined && !SNAPSHOT_TYPES.includes(snapshotType)) {
      throw new HttpError(400, 'snapshotType must be one of historical, tax_year, projection');
    }
    if (typeof isLatest !== 'boolean' || typeof updateDashboard !== 'boolean') {
      throw new HttpError(400, 'isLatest and updateDashboard must be booleans');
    }

    // ── 3. AUTHORIZE — document row → tenant → exact approved policy. ──
    const document = await loadAuthorizedDocument(sb, actor, documentId);
    const businessId = document.business_id;
    const documentType = document.document_type;

    if (documentType === 'personal_tax_return') {
      return Response.json({
        error: 'Personal tax returns are not yet supported for snapshot creation',
        message: 'This will be available in a later phase for profile_financials',
        skipped_fields: [],
        mapped_fields: [],
      }, { status: 400 });
    }

    const contract = FIELD_CONTRACT[documentType];
    if (!contract) {
      return Response.json({
        error: `Unsupported document type: ${documentType}`,
        skipped_fields: [],
        mapped_fields: [],
      }, { status: 400 });
    }

    // ── 3b. REPORTING YEAR — the snapshot is dated by its document's own period (C4). ──
    // A friendly pre-check; the RPC enforces the same rule authoritatively.
    const year = Number(document.year);
    if (!document.year || !Number.isInteger(year)) {
      throw new HttpError(409, 'This document has no reporting year, so it cannot be dated. Set the document year and try again.');
    }
    if (year < MIN_REPORTING_YEAR || year > MAX_REPORTING_YEAR) {
      throw new HttpError(409, 'This document reporting year falls outside the supported range.');
    }

    // ── 4. RESOLVE — accepted/corrected fields, tenant-pinned. No values leave this function. ──
    const { data: fields, error: fieldsError } = await sb
      .from('extracted_fields')
      .select('id, field_name, reviewed_at, created_at')
      .eq('document_id', documentId)
      .eq('business_id', businessId)
      .in('review_status', ['accepted', 'corrected'])
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });

    if (fieldsError) {
      console.error('[snapshot] field read failed');
      throw new HttpError(500, 'Internal server error');
    }
    if (!fields || fields.length === 0) {
      return Response.json({
        error: 'No accepted or corrected fields found for this document',
        skipped_fields: [],
        mapped_fields: [],
      }, { status: 400 });
    }

    /**
     * Deterministic review-recency ordering: reviewed_at (NULLs first) → created_at → id.
     * The winner is explicit and reproducible, so the same inputs always select the same value.
     */
    const recency = (v: any) => (v ? Date.parse(v) : Number.NEGATIVE_INFINITY);
    const orderedFields = [...fields].sort((a: any, b: any) => {
      const byReview = recency(a.reviewed_at) - recency(b.reviewed_at);
      if (byReview !== 0) return byReview;
      const byCreated = recency(a.created_at) - recency(b.created_at);
      if (byCreated !== 0) return byCreated;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    // Built from the ORDERED list, so `.slice(-1)` is the latest-reviewed row of that name.
    const idsByName = new Map<string, string[]>();
    for (const field of orderedFields as any[]) {
      const list = idsByName.get(field.field_name) || [];
      list.push(field.id);
      idsByName.set(field.field_name, list);
    }

    // ── SELECTION ONLY: targets and the field ids that fill them, in CONTRACT order. ──
    const fieldMap: any[] = [];
    const used = new Set<string>();

    for (const spec of contract.targets) {
      const all = idsByName.get(spec.from) || [];
      const selected = spec.cardinality === 'one' ? all.slice(-1) : all;
      // A target with no contributing row is OMITTED — never written as 0.
      if (!selected.length) continue;
      fieldMap.push({ target: spec.target, op: spec.op, field_ids: selected });
      selected.forEach((id: string) => used.add(id));
    }

    const skipped = (orderedFields as any[])
      .filter((f: any) => !used.has(f.id))
      .map((f: any) => ({ field_id: f.id, reason: `No destination in contract ${MAPPING_VERSION}` }));

    // ── 5. WRITE — one atomic, idempotent, serialized RPC. Values are read inside it. ──
    const { data: result, error: rpcError } = await sb.rpc('create_reviewed_fields_snapshot', {
      p_business_id: businessId,
      p_source_document_id: documentId,
      p_actor_profile_id: actor.profile_id,
      p_actor_base44_user_id: actor.user?.id ?? null,   // attribution only — never authorization
      p_mapping_version: MAPPING_VERSION,
      p_basis: contract.basis,
      p_snapshot_type: snapshotType,                    // null ⇒ default applied in the database
      p_field_map: fieldMap,
      p_skipped: skipped,
      p_is_latest: isLatest,
      p_update_dashboard: updateDashboard,
    });

    if (rpcError) {
      console.error('[snapshot] atomic write failed:', rpcError.message);
      throw mapRpcError(rpcError);
    }

    const mapped = Array.isArray(result?.applied)
      ? Object.keys(result.applied).map((k) => ({ field: k, mapped_to: k }))
      : [];
    const skippedApplied = Array.isArray(result?.skipped) ? result.skipped : skipped;

    return Response.json({
      success: true,
      snapshot_id: result?.snapshot_id ?? null,
      snapshot_type: result?.snapshot_type ?? null,
      is_latest: result?.is_latest === true,
      fields_mapped: mapped,
      fields_skipped: skippedApplied.map((s: any) => ({ field: s.reason, reason: s.reason })),
      dashboard_metrics_updated: result?.dashboard_metrics_updated === true,
      dashboard_skipped_reason: result?.dashboard_skipped_reason ?? null,
      promoted_over_newer: result?.promoted_over_newer === true,
      deduplicated: result?.deduplicated === true,
      confidence_score: result?.confidence_score ?? null,
      message: skippedApplied.length > 0
        ? `Snapshot created with ${mapped.length} fields. ${skippedApplied.length} fields skipped (partial snapshot).`
        : `Snapshot created successfully with ${mapped.length} fields.`,
    });

  } catch (error) {
    // HttpError carries an explicit safe status; anything else is logged and returned as a
    // generic 500. No database message ever reaches the caller.
    return errorResponse(error);
  }
});
```

**UI change (one line), required in the same change-set:**

```jsx
// src/components/admin/ExtractedFieldsReviewQueue.jsx:424
-  <SelectItem value="projected">Projected</SelectItem>
+  <SelectItem value="projection">Projection</SelectItem>
```

---

## 4. Security and authorization matrix

### 4.1 Authority (both layers must agree; the stricter verdict wins)

| Caller | Status | Relationship | Base44 layer | SQL layer | Outcome | Error |
|---|---|---|---|---|---|---|
| Platform admin | `active`/`incomplete` | — | allowed | `v_is_admin` | **ALLOW** — `platform_admin` | — |
| Platform admin | `suspended` | — | **denied** | n/a | **DENY** | 403 `SNAPSHOT_ACTOR_STATUS_NOT_ACTIVE` |
| Business owner (`business_entities.profile_id`) | allowed | owner | allowed | entity owner | **ALLOW** — `business_owner` | — |
| Business owner (`business_owners`, `end_date` null/future) | allowed | owner | allowed | ownership record | **ALLOW** — `business_owner_record` | — |
| Advisor, assigned | allowed | assigned | **denied** (D-4 off) | branch disabled | **DENY** | 404 / `SNAPSHOT_FORBIDDEN` |
| Advisor, not assigned | allowed | none | **denied** | denied | **DENY** | 404 |
| `expert_advisor` / expert-access relationship only | allowed | expert | **denied** (D-2) | denied | **DENY** | 404 |
| `team_member` of the business | allowed | team | **denied** (D-2) | denied | **DENY** | 404 |
| Owner of business A naming a document of business B | allowed | other business | **denied** | tenant mismatch | **DENY** | 404 / `SNAPSHOT_DOCUMENT_BUSINESS_MISMATCH` |
| Authenticated, unrelated profile | allowed | none | **denied** | denied | **DENY** | 404 / `SNAPSHOT_FORBIDDEN` |
| Any caller | `invited` | any | **denied** | denied | **DENY** | 403 |
| Any caller | any unobserved status | any | **denied** | denied | **DENY** | 403 |
| Any caller | profile row absent | — | **denied** | `SNAPSHOT_ACTOR_UNKNOWN` | **DENY** | 403 |
| Anonymous (no session) | — | — | 401 | n/a | **DENY** | 401 |
| `anon` / `authenticated` calling the RPC directly over PostgREST | — | — | n/a | EXECUTE revoked | **DENY** | `permission denied for function` (42501) |
| Service-key holder, forged `p_actor_profile_id` | — | forged | n/a | relationship required | **DENY** unless the forged profile is *genuinely* related to that business | `SNAPSHOT_FORBIDDEN` |
| Service-key holder, genuinely related profile | — | real | n/a | allowed | **ALLOW** | — |

**Residual trust, stated plainly:** a service-key holder can bypass this function entirely and write these tables directly. The RPC's checks are defence-in-depth for the write path; **Base44 is the authentication boundary**, and the service key is the trust root. This function must never be described as authenticating the end user.

### 4.2 Value and source integrity

| Vector | Verdict |
|---|---|
| Financial value in the body | **No effect** — no value parameter exists; values are read in-transaction |
| Field id from another business/document | **Refused** — `SNAPSHOT_FIELD_NOT_CONTRACTED` |
| Field id whose status is not accepted/corrected | **Refused** — same |
| Substitution (a `total_expenses` row feeding `annual_revenue`) | **Refused** — the contract's `from` field name is enforced |
| Target outside the contract | `SNAPSHOT_TARGET_NOT_IN_CONTRACT` |
| Reserved metadata key | `SNAPSHOT_RESERVED_METADATA_KEY` |
| Duplicate target / duplicate field id | `SNAPSHOT_DUPLICATE_TARGET` / `SNAPSHOT_DUPLICATE_FIELD` |
| Wrong `op`, or wrong cardinality | `SNAPSHOT_OP_MISMATCH` / `SNAPSHOT_CARDINALITY_VIOLATION` |
| NULL contributor to `sum`/`mean` | `SNAPSHOT_FIELD_VALUE_MISSING` — an unknown is never presented as a complete figure |
| Unknown mapping version / unsupported document type / basis mismatch | Three matching exceptions |
| Any dynamic SQL | **None exists** — targets are matched against a declaration, never concatenated |

### 4.3 Execution boundary

| Object | Owner | `service_role` | `anon` / `authenticated` | `PUBLIC` | `SECURITY` | `search_path` |
|---|---|---|---|---|---|---|
| `public.s4_mapping_contract(text)` | `postgres` | EXECUTE | **revoked** | **revoked** | INVOKER | `''` |
| `public.create_reviewed_fields_snapshot(...)` | `postgres` | EXECUTE | **revoked** | **revoked** | INVOKER | `''` |
| `public.snapshot_submission_audit` | `postgres` | SELECT, INSERT | **revoked**, RLS on, **0 policies** | **revoked** | n/a | n/a |

---

## 5. Dashboard consistency limitation and proposed future resolution

### 5.1 The limitation, stated precisely

`dashboard_metrics` is a **shared projection with no arbitration**. Ten application writers insert or update it: `saveAssessmentToSupabase`, `regenerateCiqMetrics`, `forceUpdateDashboardMetrics`, `hydrateDashboardFromJourney`, `supabaseUserData`, `supabaseDashboardData`, `guestSessionService`, `orchestrateBusinessCreation`, `debugDashboardMetricsSchema`, and now `createSnapshotFromReviewedFields`. A business-level RLS policy additionally permits direct PostgREST writes for any identity `can_access_business` admits.

What is **guaranteed**:
- No duplicate *rows*: arbitrated by the deployed partial unique index.
- A **stale replay cannot project**: only the promoted snapshot writes (`not_latest` otherwise).
- The dashboard is never **silently** moved relative to snapshot history: `promoted_over_newer` reports a backward promotion, and `latest_snapshot_id` records which snapshot the projection claims to reflect.

What is **NOT** guaranteed:
- That a value this function wrote **survives**. Any later writer of `annual_revenue`/`net_profit` overwrites it — last commit wins, per column, with no detection, no retry and no conflict signal. The advisory lock serializes this function only; it is invisible to the other nine writers.
- That `annual_revenue` and `net_profit` came from the **same** source. A partial overwrite can leave one column from a snapshot and the other from an assessment.

**Status: UNRESOLVED — explicitly accepted, not mitigated.** No arbitration mechanism is designed here, because arbitration is a platform-wide change to writers outside this phase's authority.

### 5.2 Making the divergence detectable today (read-only, no new write path)

```sql
-- Does the projection still equal the snapshot it claims to reflect?
select dm.business_id,
       dm.annual_revenue        as dashboard_revenue,
       sm.annual_revenue        as snapshot_revenue,
       dm.net_profit            as dashboard_net_profit,
       sm.net_profit            as snapshot_net_profit,
       dm.updated_at            as dashboard_updated,
       sm.snapshot_date         as snapshot_date
  from public.dashboard_metrics dm
  join public.business_metric_snapshots sm on sm.id = dm.latest_snapshot_id
 where dm.latest_snapshot_id is not null
   and (dm.annual_revenue is distinct from sm.annual_revenue
     or dm.net_profit     is distinct from sm.net_profit);
```

This is a diagnostic, not enforcement. It is what makes the limitation **observable** rather than invisible.

### 5.3 Proposed future resolution (separate design, separate approval)

| Option | Mechanism | Cost / risk |
|---|---|---|
| **A — Single writer for the projection** *(recommended)* | Snapshot-derived metrics become the only writer of `annual_revenue`/`net_profit`; the other engines route through the same RPC or stop writing those two columns | Touches ten functions; needs reconciliation of existing values. Highest correctness, widest blast radius |
| **B — Per-metric provenance** | A `metric_provenance` table (business, metric, value, source, written_at, writer) with one read model; each writer records what it wrote | New table + every writer participates; genuine arbitration possible |
| **C — Optimistic concurrency** | A `metrics_version`/`last_writer` marker; a writer refuses to overwrite a newer value unless explicitly promoted | Cheap, but only prevents the *stale* case, not divergent sources |
| **D — Accept, and surface** | Keep the limitation; expose the §5.2 reconciliation in an admin surface | Cheapest; leaves the underlying ambiguity in place |

**Recommendation:** adopt **C** as a near-term guard **only** if a decision on ownership is imminent; otherwise adopt **D** (explicit acceptance) now, and commission **A** or **B** as its own phase with its own threat model. **Do not** attempt arbitration as part of S4.

---

## 6. Gate B readiness assessment

**Verdict: CONDITIONALLY READY.** The packet is implementation-ready: every statement is reconciled against verified columns, constraints, indexes and privileges, and the four defects that would have failed on the first call are corrected — three in the SQL, one in the deployed UI. The full reconciliation table and the residual-blocker list are in `VISION_SECURITY_S4_REVISION_5_TESTS.md` §6.

**Conditions (all cheap, none requires code):**

1. **Your rulings on D-14 … D-18** — specifically **D-15** (approve the audit table; without it, deduplicated submissions are recorded nowhere durable) and **D-16** (accept the cross-writer limitation as documented). D-17 and D-18 are recommendations to confirm.
2. **One preflight probe not yet read:** the body of `public.is_super_admin()`. It cannot be satisfied by anonymous callers (no JWT), so it does not affect any verdict here; read it before applying, for completeness.
3. **An isolated environment** — Gate B's unchanged scope. Production remains a separate decision.

**What Gate B would then do, in order:** apply the migration to the isolated environment → verify the execution boundary (T-N21, T-N22) → implement the Base44 file and the one-line UI change → run the test plan → report with before/after counts → stop. Production, providers, CB-005A/CB-005B and the Digital Twin remain untouched.

**Explicitly out of scope for Gate B:** narrowing the RLS policies in **P-1**; the pre-existing defects **P-4/P-5/P-6**; ownership revocation (**P-7**); and any arbitration of the dashboard projection (§5.3).

**Residual risks carried into Gate B:** (a) the path becomes **functional for the first time**, so dashboards can move where they previously did not (D-3) — the risk register's High item, mitigated by isolated testing and prior counts; (b) the **2** undated documents are refused until their year is set; (c) the service key remains the trust root, by design.

**Gate B is NOT authorized. Nothing in this packet has been applied.**